"""
tts_module.py — TTS wrapper for the Voice Agent.

Uses gTTS (Google TTS) directly to synthesise speech and converts the MP3
output to base64-encoded mulaw 8 kHz for streaming back to Twilio.

This deliberately bypasses voice_engine.tts.tts_engine to avoid the
pyttsx3 backend which produces non-RIFF WAV files incompatible with Twilio.
"""

import audioop
import base64
import io
import logging
import sys
import threading
import time
from pathlib import Path

# ── Activate bundled ffmpeg so pydub can decode MP3 ──────────────────────────
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception:
    pass

logger = logging.getLogger(__name__)

# gTTS language codes for Indian languages (same as voice_engine mapping)
_GTTS_LANG_MAP: dict[str, str] = {
    "en":    "en",
    "hi":    "hi",
    "hi-en": "hi",   # Hinglish → Hindi voice (Google Hindi TTS reads Latin+Devanagari mix)
    "gu":    "gu",
    "mr":    "mr",
    "ta":    "ta",
    "te":    "te",
    "kn":    "kn",
    "bn":    "bn",
    "pa":    "pa",
    "ml":    "ml",
    "ur":    "ur",
    "unknown": "hi", # default to Hindi for unidentified Indian speech
}

_TWILIO_RATE = 8_000   # Hz

# ── In-memory TTS cache (text+lang → mulaw_b64) ───────────────────────────────
# Caches synthesised audio for identical text+language pairs.
# Saves ~400–600ms per repeated phrase (gTTS network round-trip).
_tts_cache: dict[str, str] = {}
_MAX_CACHE_ENTRIES = 128   # cap memory usage


def _mp3_bytes_to_mulaw_b64(mp3_data: bytes) -> str:
    """Decode MP3 bytes → mulaw base64 using pydub (needs ffmpeg via static_ffmpeg)."""
    from pydub import AudioSegment
    buf = io.BytesIO(mp3_data)
    audio = AudioSegment.from_file(buf, format="mp3")
    audio = audio.set_channels(1).set_frame_rate(_TWILIO_RATE).set_sample_width(2)
    mulaw = audioop.lin2ulaw(audio.raw_data, 2)
    return base64.b64encode(mulaw).decode("utf-8")


def synthesize(text: str, language: str = "en") -> str:
    """Generate speech for *text* in *language* and return base64 mulaw.

    Args:
        text:     The text to speak.
        language: BCP-47 language code (e.g. "hi", "en", "gu", "hi-en").

    Returns:
        Base64-encoded mulaw string at 8 kHz ready for Twilio, or "" on error.
    """
    if not text or not text.strip():
        logger.warning("[TTS] Empty text — skipping synthesis.")
        return ""

    gtts_lang = _GTTS_LANG_MAP.get(language, "en")

    # ── Cache lookup (saves ~400-600ms on repeated phrases) ──────────────────
    cache_key = f"{gtts_lang}::{text.strip()}"
    cached = _tts_cache.get(cache_key)
    if cached:
        logger.info("[TTS] Cache HIT for %r (lang=%s) — skipping gTTS call", text[:60], language)
        return cached

    try:
        from gtts import gTTS

        t0 = time.time()
        tts = gTTS(text=text, lang=gtts_lang, slow=False)
        mp3_buf = io.BytesIO()
        tts.write_to_fp(mp3_buf)
        mp3_data = mp3_buf.getvalue()
        elapsed = round(time.time() - t0, 2)

        logger.info("[TTS] gTTS synthesised %d bytes in %.2fs (lang=%s → gtts=%s)",
                    len(mp3_data), elapsed, language, gtts_lang)

        mulaw_b64 = _mp3_bytes_to_mulaw_b64(mp3_data)
        if mulaw_b64:
            logger.info("[TTS] mulaw b64 length: %d", len(mulaw_b64))
            # Store in cache; evict oldest entry if over limit
            if len(_tts_cache) >= _MAX_CACHE_ENTRIES:
                oldest_key = next(iter(_tts_cache))
                del _tts_cache[oldest_key]
            _tts_cache[cache_key] = mulaw_b64
        else:
            logger.error("[TTS] mulaw conversion produced empty output.")
        return mulaw_b64

    except Exception as exc:
        logger.error("[TTS] Exception: %s", exc)
        return ""


# ── Filler phrase pre-warm ────────────────────────────────────────────────────
def _prewarm_fillers() -> None:
    """Synthesise all filler phrases into the TTS cache at startup.

    Runs in a background thread so it does not delay server boot.
    After this completes, every call to synthesize() for a filler phrase
    returns immediately from cache (no gTTS network round-trip, ~0ms vs 400ms).
    """
    filler_banks: dict[str, list[str]] = {
        "en":       ["Okay...", "Sure...", "Got it...", "One moment...", "Let me check..."],
        "hi":       ["जी...", "हाँ...", "ठीक है...", "एक पल..."],
        "hi-en":    ["Okay...", "Haan ji...", "Ji haan...", "Ek second..."],
        "hinglish": ["Okay...", "Haan...", "Sure...", "Ji..."],
        "unknown":  ["Okay...", "Sure...", "One moment..."],
    }
    count = 0
    for lang, phrases in filler_banks.items():
        for text in phrases:
            try:
                if synthesize(text, lang):
                    count += 1
            except Exception:
                pass
    logger.info("[TTS] Filler pre-warm complete: %d entries cached", count)


# Kick off pre-warm in a daemon thread — does not block server startup
threading.Thread(target=_prewarm_fillers, daemon=True, name="tts-prewarm").start()
