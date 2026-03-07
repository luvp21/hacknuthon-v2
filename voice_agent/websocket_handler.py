"""
websocket_handler.py — Twilio Media Stream WebSocket handler.

Twilio sends a sequence of JSON messages over the WebSocket:
  1. {"event": "connected", ...}
  2. {"event": "start", "start": {"callSid": "...", "streamSid": "..."}}
  3. {"event": "media", "media": {"payload": "<base64 mulaw>", "track": "inbound"}}
  4. {"event": "stop", ...}

Key design decisions:
  - BOT_SPEAKING_HOLD_FRAMES: After TTS is sent, inbound audio is MUTED
    for this many frames (each = 20ms). Twilio echoes outbound audio back
    as inbound media, which causes an infinite response loop without this.
  - Pipeline runs in a background THREAD so new audio frames are never dropped.
  - A threading.Event prevents two pipeline invocations from running at once.
"""

import base64
import json
import logging
import threading
import time

import numpy as np

from voice_agent.audio_utils import (
    mulaw_b64_to_pcm16k,
    is_silence,
    SILENCE_FRAMES_END,
    WHISPER_SAMPLE_RATE,
)
from voice_agent import stt_module, tts_module
from voice_agent.response_engine import get_or_create_session, end_session, CHATBOT_API_URL
from voice_agent import call_logger, call_timer

logger = logging.getLogger(__name__)

# Minimum speech duration before we attempt STT
MIN_UTTERANCE_SECS    = 1.0    # raised from 0.5s — short bursts are almost always noise
MIN_UTTERANCE_SAMPLES = int(MIN_UTTERANCE_SECS * WHISPER_SAMPLE_RATE)

# Minimum average RMS energy across the full utterance before we attempt STT.
# Background noise that passes VAD (e.g. TV, traffic) tends to have a low
# sustained RMS even if individual peaks are loud.  Real close-mic phone speech
# sits comfortably above this level.
MIN_UTTERANCE_AVG_RMS = 200

# After sending TTS audio, mute inbound for this many 20ms frames.
# Twilio echoes outbound audio back as "inbound" — without this mute window
# the agent transcribes its own voice and creates an infinite reply loop.
# Rule of thumb: (TTS duration in seconds / 0.02) + 25 buffer frames.
# We use a dynamic mute calculated from actual audio length sent.
BOT_BASE_MUTE_FRAMES = 30   # minimum mute after any TTS send (~600ms)

# ── Barge-in (interrupt) settings ────────────────────────────────────────────
# After sending TTS we protect the first N frames as a pure echo dead-zone.
# After that zone, sustained high-energy inbound audio is treated as the user
# speaking over the bot.  We send a Twilio <clear> event to cancel buffered
# playback and immediately start listening to the caller.
BARGE_IN_ECHO_SHIELD_FRAMES = 15   # 300ms dead zone — absorbs initial echo burst
BARGE_IN_RMS_THRESHOLD      = 1400 # energy that signals real speech (vs echo/noise)
BARGE_IN_CONFIRM_FRAMES     = 5    # 5 consecutive loud frames (100ms) → confirmed

# Protect WebSocket sends from concurrent threads
_ws_lock = threading.Lock()

# Pre-encoded µ-law silence: 160 bytes of 0xFF = 20 ms at 8 kHz.
# Sent periodically while the LLM is thinking to prevent Twilio from
# closing the WebSocket due to inactivity (Twilio times out ~30s of silence).
_MULAW_SILENCE_B64: str = base64.b64encode(bytes([0xFF] * 160)).decode()


def _rms_mulaw(raw: bytes) -> int:
    """Return RMS energy of a raw µ-law chunk (decoded to 16-bit linear)."""
    import audioop
    linear = audioop.ulaw2lin(raw, 2)
    return audioop.rms(linear, 2)


def _greeting_wrapper(
    ws, stream_sid: str, pipeline_busy: threading.Event,
    text: str, language: str,
    mute_until_frame: list[int], frame_count: list[int],
    tts_sent_frame: list[int], call_sid: str
) -> None:
    """Wrap the initial greeting TTS and hold pipeline_busy for its full duration
    so no STT pipeline can fire from echo audio while the bot is still talking."""
    try:
        _send_tts(ws, stream_sid, text, language, mute_until_frame, frame_count, call_sid, tts_sent_frame)
    finally:
        pipeline_busy.clear()  # allow user input only after greeting is fully sent


def _send_clear(ws, stream_sid: str) -> None:
    """Send a Twilio 'clear' event to cancel any buffered audio being played to caller."""
    msg = json.dumps({"event": "clear", "streamSid": stream_sid})
    with _ws_lock:
        try:
            ws.send(msg)
            logger.info("[WS] CLEAR sent — bot speech interrupted by user barge-in")
        except Exception as exc:
            logger.warning("[WS] Failed to send CLEAR: %s", exc)


def _sanitize_response(text: str, language: str) -> str:
    """Strip raw JSON / markdown code fences from LLM output before TTS.

    Gemini occasionally returns a JSON block for SMALLTALK / UNKNOWN turns,
    or the TypeScript parser falls back to responseText=raw_llm_text when the
    JSON is truncated.  Either way we must NOT speak raw JSON to the caller.

    Steps:
      1. Strip ``` fences.
      2. If the result still starts with { or [, try JSON.parse → responseText.
      3. If still unreadable JSON, return a safe spoken fallback.
    """
    import re as _re
    import json as _json

    t = text.strip()

    # 1. Strip markdown code fences (```json ... ``` or ``` ... ```)
    t = _re.sub(r'^```(?:json|JSON)?\s*\n?', '', t).strip()
    t = _re.sub(r'\n?```\s*$', '', t).strip()

    # 2. If it still looks like JSON, try to extract a human-readable field
    if t.startswith('{') or t.startswith('['):
        try:
            parsed = _json.loads(t)
            if isinstance(parsed, dict):
                for key in ('responseText', 'response_text', 'text', 'message', 'reply', 'content'):
                    val = parsed.get(key)
                    if val and isinstance(val, str):
                        inner = val.strip()
                        # Sanity-check: the field itself must not be more JSON
                        if not inner.startswith('{') and not inner.startswith('['):
                            return inner
        except Exception:
            pass  # Truncated / invalid JSON — fall through to spoken fallback

        # JSON but no usable text field — give a safe spoken fallback
        if language in ('hi', 'hi-en', 'hinglish'):
            return 'माफ करें, कुछ तकनीकी समस्या है। क्या आप फिर से कह सकते हैं?'
        return "Sorry, I didn't quite catch that. Could you please repeat?"

    return t


def handle_media_stream(ws) -> None:
    """Main WebSocket handler — called by Flask-Sock for each /media-stream connection."""
    call_sid: str  = "unknown"
    stream_sid: str = ""

    audio_buffer: list[np.ndarray] = []
    silence_count: int = 0

    pipeline_busy = threading.Event()   # set while STT+TTS is running
    mute_until_frame: list[int] = [0]   # frame index below which inbound is muted
    frame_count: list[int] = [0]        # total inbound frames seen
    in_mute_window: list[bool] = [False]  # True once we enter a mute window; used to
                                          # flush stale buffer exactly once per window
    tts_sent_frame: list[int] = [0]     # frame index when last TTS was dispatched
    barge_in_count: list[int] = [0]     # consecutive high-energy frames in mute window
    barge_in_buffer: list = []          # PCM chunks accumulated during barge-in detection

    logger.info("[WS] New WebSocket connection opened.")

    try:
        while True:
            raw = ws.receive()
            if raw is None:
                break

            data = json.loads(raw)
            event = data.get("event", "")

            # ── connected ────────────────────────────────────────────────────
            if event == "connected":
                logger.info("[WS] Twilio connected: protocol=%s", data.get("protocol"))

            # ── start ────────────────────────────────────────────────────────
            elif event == "start":
                start_info = data.get("start", {})
                call_sid   = start_info.get("callSid", "unknown")
                stream_sid = start_info.get("streamSid", "")
                timer = call_timer.start(call_sid)
                timer.step("🎙 ", "STREAM", f"call={call_sid}  stream={stream_sid[:12]}...")
                logger.info("[WS] Stream started | call=%s | stream=%s", call_sid, stream_sid)
                get_or_create_session(call_sid)
                call_logger.start_log(call_sid)

                # Pre-mute: set a generous initial mute window RIGHT NOW before
                # the greeting thread starts synthesising.  Without this, frames
                # arriving while gTTS is generating audio (200-600ms) are treated
                # as real user speech, triggering a second greeting or a spurious
                # IDENTITY_COLLECTION turn.
                # 250 frames = 5 seconds — enough for any greeting TTS + buffer.
                # _send_tts will overwrite this with the precise audio-duration
                # mute once it knows exactly how long the audio is.
                mute_until_frame[0] = frame_count[0] + 250
                in_mute_window[0] = True

                # Send greeting in background (so we start receiving audio right away).
                # pipeline_busy is SET here so that no STT pipeline can fire while the
                # greeting TTS is being generated + played.  The wrapper clears it when done.
                timer.step("🔊", "GREET", "Sending opening greeting...")
                pipeline_busy.set()
                threading.Thread(
                    target=_greeting_wrapper,
                    args=(ws, stream_sid, pipeline_busy,
                          "Welcome to Tadka & Twist! Could I get your name?",
                          "en", mute_until_frame, frame_count, tts_sent_frame, call_sid),
                    daemon=True,
                ).start()

            # ── media ────────────────────────────────────────────────────────
            elif event == "media":
                media = data.get("media", {})
                if media.get("track", "") != "inbound":
                    continue

                payload = media.get("payload", "")
                frame_count[0] += 1
                raw_mulaw = base64.b64decode(payload)

                # ── MUTE WINDOW: bot is speaking ───────────────────────────
                # First frame entering mute window: flush any stale audio.
                # After the echo shield zone, check for barge-in: if the caller
                # speaks loudly enough for long enough we interrupt the bot.
                if frame_count[0] <= mute_until_frame[0]:
                    if not in_mute_window[0]:
                        in_mute_window[0] = True
                        audio_buffer = []
                        barge_in_buffer = []
                        barge_in_count[0] = 0
                        silence_count = 0

                    # ── Echo shield: discard the first N frames unconditionally ──
                    # This absorbs the immediate TTS echo before we start listening.
                    if frame_count[0] <= tts_sent_frame[0] + BARGE_IN_ECHO_SHIELD_FRAMES:
                        continue

                    # ── Barge-in detection ────────────────────────────────────
                    rms = _rms_mulaw(raw_mulaw)
                    if rms > BARGE_IN_RMS_THRESHOLD:
                        barge_in_count[0] += 1
                        barge_in_buffer.append(mulaw_b64_to_pcm16k(payload))

                        if barge_in_count[0] >= BARGE_IN_CONFIRM_FRAMES:
                            # ── BARGE-IN CONFIRMED ────────────────────────────
                            logger.info(
                                "[WS] 🛑 Barge-in detected (rms=%d, %d frames) — interrupting",
                                rms, barge_in_count[0],
                            )
                            _send_clear(ws, stream_sid)     # cancel Twilio buffered audio
                            mute_until_frame[0] = 0         # lift mute window
                            in_mute_window[0] = False
                            audio_buffer = list(barge_in_buffer)  # carry forward speech
                            barge_in_buffer = []
                            barge_in_count[0] = 0
                            silence_count = 0
                            pipeline_busy.clear()           # ensure pipeline is not blocked
                            # Don't re-decode current frame — it's already in audio_buffer
                            continue
                        else:
                            continue  # accumulating, not yet confirmed
                    else:
                        # Energy dropped — decay counter
                        barge_in_count[0] = max(0, barge_in_count[0] - 1)
                        if barge_in_count[0] == 0:
                            barge_in_buffer = []
                        continue  # still muted

                else:
                    # Mute window expired naturally — reset barge-in state
                    if in_mute_window[0]:
                        in_mute_window[0] = False
                    barge_in_count[0] = 0
                    barge_in_buffer = []

                # VAD
                if is_silence(raw_mulaw):
                    silence_count += 1
                else:
                    silence_count = 0

                pcm_chunk = mulaw_b64_to_pcm16k(payload)
                audio_buffer.append(pcm_chunk)

                # End of utterance: silence detected + pipeline not busy
                if (silence_count >= SILENCE_FRAMES_END
                        and len(audio_buffer) > 0
                        and not pipeline_busy.is_set()):

                    total_samples = sum(len(c) for c in audio_buffer)
                    if total_samples >= MIN_UTTERANCE_SAMPLES:
                        utterance = list(audio_buffer)
                        audio_buffer = []
                        silence_count = 0
                        pipeline_busy.set()

                        threading.Thread(
                            target=_process_utterance,
                            args=(ws, stream_sid, call_sid, utterance,
                                  pipeline_busy, mute_until_frame, frame_count, tts_sent_frame),
                            daemon=True,
                        ).start()
                    else:
                        audio_buffer = []
                        silence_count = 0

            # ── stop ─────────────────────────────────────────────────────────
            elif event == "stop":
                logger.info("[WS] Stream stopped for call %s", call_sid)
                end_session(call_sid)
                call_logger.end_log(call_sid)
                call_timer.end(call_sid)
                break

    except Exception as exc:
        logger.error("[WS] Error: %s", exc, exc_info=True)
    finally:
        logger.info("[WS] Connection closed for call %s", call_sid)


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _keepalive_silence(ws, stream_sid: str, stop_event: threading.Event) -> None:
    """Send µ-law silence frames every second so Twilio doesn't time out the
    WebSocket while the LLM / chatbot is thinking.  Stops when stop_event fires."""
    msg = json.dumps({
        "event":     "media",
        "streamSid": stream_sid,
        "media":     {"payload": _MULAW_SILENCE_B64},
    })
    while not stop_event.wait(1.0):   # send once per second
        with _ws_lock:
            try:
                ws.send(msg)
            except Exception:
                break   # WebSocket already closed — exit quietly


def _process_utterance(ws, stream_sid: str, call_sid: str,
                        audio_chunks: list[np.ndarray],
                        done_event: threading.Event,
                        mute_until_frame: list[int],
                        frame_count: list[int],
                        tts_sent_frame: list[int] | None = None) -> None:
    """STT → response → TTS pipeline running in background thread."""
    timer = call_timer.get(call_sid)

    try:
        pcm_audio = np.concatenate(audio_chunks)
        dur = round(len(pcm_audio) / WHISPER_SAMPLE_RATE, 2)
        logger.info("[Pipeline] Processing %.2fs of audio for call %s", dur, call_sid)

        if timer:
            timer.new_turn()
            timer.step("🎤", "AUDIO", f"Utterance captured: {dur:.2f}s of speech")

        # ── Average energy gate ───────────────────────────────────────────────────────────
        # Background noise that slips past VAD (TV audio, traffic, AC hum) tends
        # to have a low average RMS even when individual peaks cross the threshold.
        # Real phone speech has consistently higher sustained energy.
        avg_rms = int(np.sqrt(np.mean(pcm_audio ** 2)) * 32768)
        if avg_rms < MIN_UTTERANCE_AVG_RMS:
            logger.info("[Pipeline] Low-energy utterance filtered (avg_rms=%d < %d) — likely noise",
                        avg_rms, MIN_UTTERANCE_AVG_RMS)
            if timer:
                timer.step("🔇", "NOISE", f"Filtered: avg_rms={avg_rms} < {MIN_UTTERANCE_AVG_RMS}")
            return

        # ── STT ──────────────────────────────────────────────────────────────
        if timer:
            timer.step("🔤", "STT", "Transcribing with Whisper...")
        stt_t0 = time.time()
        stt_result = stt_module.transcribe(pcm_audio)
        stt_ms = int((time.time() - stt_t0) * 1000)

        text       = stt_result.get("text", "").strip()
        language   = stt_result.get("language", "en")
        confidence = stt_result.get("confidence", 0.0)

        if not text:
            logger.info("[Pipeline] STT empty — skipping.")
            if timer:
                timer.step("🔤", "STT", f"⚠️  {stt_ms}ms  → (empty / silence)")
            return

        # ── Noise guard: skip micro-transcripts that are background noise ─────
        # Whisper frequently transcribes ambient noise / mouth sounds / breathing
        # as 1-3 chars (".", "Uh", "Hmm", single Devanagari char).
        # No-speech probability > 0.8 from Groq also indicates non-speech audio.
        word_count = len(text.split())
        no_speech_prob = stt_result.get("no_speech_prob", 0.0)
        is_noise = (word_count <= 1 and len(text) <= 5) or (no_speech_prob > 0.7 and word_count <= 2)
        if is_noise:
            logger.info("[Pipeline] Noise transcript filtered — word_count=%d text=%r no_speech=%.2f",
                        word_count, text, no_speech_prob)
            if timer:
                timer.step("🔤", "STT", f"🔇  {stt_ms}ms  → noise filtered ({text!r})")
            return

        if timer:
            timer.step("🔤", "STT",
                       f"✅  {stt_ms}ms  →  {text!r}  (lang={language} conf={confidence:.2f})")
        logger.info("[Pipeline] STT → lang=%s  conf=%.2f  text=%r", language, confidence, text[:80])

        # ── Brain/LLM via petpooja /chat ──────────────────────────────────────
        if timer:
            timer.step("🌐", "HTTP", f"POST {CHATBOT_API_URL}  →  session={call_sid}")
        session = get_or_create_session(call_sid, language)
        _ka_stop = threading.Event()
        threading.Thread(
            target=_keepalive_silence,
            args=(ws, stream_sid, _ka_stop),
            daemon=True,
        ).start()
        try:
            response_text, http_timing = session.process(text, language)
        finally:
            _ka_stop.set()   # stop keepalive regardless of success/failure

        # ── Log the HTTP + internal breakdown ───────────────────────────────
        if timer:
            total_ms   = http_timing.get("total_ms", 0)
            db_sess_ms = http_timing.get("session_db_ms")
            brain_ms   = http_timing.get("brain_ms")
            rag_ms     = http_timing.get("rag_ms")
            llm_ms     = http_timing.get("llm_ms")
            err        = http_timing.get("error")

            if err:
                timer.step("🌐", "HTTP", f"❌  {total_ms}ms  error={err}")
            else:
                timer.step("🌐", "HTTP", f"✅  total={total_ms}ms")
                if db_sess_ms is not None:
                    timer.sub(f"   ├─ 🗄  DB     session lookup : {db_sess_ms:>5}ms")
                if brain_ms is not None:
                    timer.sub(f"   ├─ 🧠  BRAIN  processTurn   : {brain_ms:>5}ms")
                if rag_ms is not None:
                    timer.sub(f"   │    ├─ 🔍  RAG   retrieval : {rag_ms:>5}ms")
                if llm_ms is not None:
                    timer.sub(f"   │    └─ 💡  LLM   Gemini    : {llm_ms:>5}ms")

            timer.step("🤖", "REPLY", response_text[:80] + ("..." if len(response_text) > 80 else ""))

        logger.info("[Pipeline] Response → %r  timing=%s", response_text[:80], http_timing)

        # Log user turn
        detected_items = [i for i in session.ordered_items]
        clog = call_logger.get_log(call_sid)
        if clog:
            clog.log_user(text, language, confidence, items=detected_items)

        # ── Sanitize response before TTS ──────────────────────────────────────
        response_text = _sanitize_response(response_text, language)
        # ── TTS + send ────────────────────────────────────────────────────────
        _send_tts(ws, stream_sid, response_text, language, mute_until_frame, frame_count, call_sid, tts_sent_frame)

    except Exception as exc:
        logger.error("[Pipeline] Error: %s", exc, exc_info=True)
    finally:
        done_event.clear()


def _send_tts(ws, stream_sid: str, text: str, language: str,
              mute_until_frame: list[int], frame_count: list[int],
              call_sid: str = "",
              tts_sent_frame: list[int] | None = None) -> None:
    """Synthesise TTS, send to Twilio, and set the mute + tts_sent_frame windows."""
    timer = call_timer.get(call_sid) if call_sid else None

    if timer:
        timer.step("🔊", "TTS", f"Synthesizing... {text[:60]!r}")

    tts_t0 = time.time()
    mulaw_b64 = tts_module.synthesize(text, language=language)
    tts_ms = int((time.time() - tts_t0) * 1000)

    if not mulaw_b64:
        logger.warning("[Pipeline] TTS empty — skipping send.")
        if timer:
            timer.step("🔊", "TTS", f"⚠️  {tts_ms}ms  → (empty — nothing to send)")
        return

    # Each mulaw byte = 1 sample at 8kHz = 0.125ms
    # base64 decode: len(b64) * 3/4 bytes → / 8000 = seconds of audio
    audio_bytes   = len(mulaw_b64) * 3 // 4
    audio_secs    = audio_bytes / 8000.0
    # Add a short buffer: audio duration + 0.5s for Twilio processing
    mute_frames   = int((audio_secs + 0.5) / 0.02) + BOT_BASE_MUTE_FRAMES

    if timer:
        timer.step("🔊", "TTS", f"✅  {tts_ms}ms  →  {audio_secs:.1f}s of audio")
    logger.info("[Pipeline] TTS %.1fs audio synthesised in %dms → muting %d frames",
                audio_secs, tts_ms, mute_frames)

    # Set mute window so all inbound audio during playback is discarded.
    # Also record the frame at which we sent this TTS so the barge-in echo
    # shield knows exactly when to start listening for real user speech.
    if tts_sent_frame is not None:
        tts_sent_frame[0] = frame_count[0]
    mute_until_frame[0] = frame_count[0] + mute_frames

    message = json.dumps({
        "event":     "media",
        "streamSid": stream_sid,
        "media":     {"payload": mulaw_b64}
    })
    with _ws_lock:
        try:
            ws.send(message)
            if timer:
                timer.step("📤", "TWILIO", f"Audio sent to caller ({audio_secs:.1f}s)")
            logger.info("[Pipeline] Sent TTS to Twilio (%d chars b64, %.1fs)",
                        len(mulaw_b64), audio_secs)
            # Log bot turn
            if call_sid:
                clog = call_logger.get_log(call_sid)
                if clog:
                    clog.log_bot(text, language)
        except Exception as exc:
            logger.error("[Pipeline] Failed to send TTS: %s", exc)
            if timer:
                timer.step("❌", "TWILIO", f"Failed to send audio: {exc}")
