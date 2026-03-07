"""
audio_utils.py — Audio format conversion utilities for Twilio Media Streams.

Twilio sends audio as:
  - Encoding : mulaw (μ-law / PCMU)
  - Sample rate: 8000 Hz, mono, 8-bit
  - Transport : Base64-encoded payload inside JSON

Whisper STT requires:
  - Encoding : float32 PCM
  - Sample rate: 16000 Hz, mono

This module handles:
  - mulaw  → float32 PCM 16kHz  (for STT input)
  - float32 PCM / WAV → mulaw 8kHz  (for TTS output back to Twilio)
  - Silence / VAD detection (so we know when the user stops speaking)
"""

import audioop          # stdlib — mulaw <-> linear PCM
import base64
import io
import logging
import struct
import wave

import numpy as np

# Activate static ffmpeg so pydub can decode MP3 without a system ffmpeg.
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception:
    pass

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

TWILIO_SAMPLE_RATE  = 8_000   # Hz — mulaw from Twilio
WHISPER_SAMPLE_RATE = 16_000  # Hz — Whisper expects 16 kHz
MULAW_SAMPLE_WIDTH  = 2       # bytes per sample after ulaw2lin conversion
SILENCE_THRESHOLD   = 600     # RMS value below which a chunk is "silent"
                               # Raised from 400 → 600 to ignore quiet background noise
SILENCE_FRAMES_END  = 20      # 20 × 20ms = 400ms silence → end of utterance
                               # Raised from 12 → 20 so bot waits for a real pause,
                               # not just a brief breath between background sounds.
CHUNK_DURATION_MS   = 20      # each Twilio chunk ≈ 20 ms


# ─────────────────────────────────────────────────────────────────────────────
# mulaw → PCM float32 (16 kHz)
# ─────────────────────────────────────────────────────────────────────────────

def mulaw_b64_to_pcm16k(b64_payload: str) -> np.ndarray:
    """Decode a base64 mulaw chunk from Twilio into float32 PCM at 16 kHz.

    Args:
        b64_payload: Base64-encoded mulaw audio string from Twilio JSON event.

    Returns:
        numpy float32 array at 16 kHz.
    """
    raw_mulaw = base64.b64decode(b64_payload)
    # Convert mulaw → 16-bit linear PCM at 8 kHz
    linear_8k = audioop.ulaw2lin(raw_mulaw, MULAW_SAMPLE_WIDTH)
    # Upsample 8 kHz → 16 kHz (simple 2x repeat via audioop.ratecv)
    linear_16k, _ = audioop.ratecv(
        linear_8k, MULAW_SAMPLE_WIDTH, 1,
        TWILIO_SAMPLE_RATE, WHISPER_SAMPLE_RATE,
        None
    )
    # Convert bytes → numpy int16 → float32 in [-1, 1]
    samples = np.frombuffer(linear_16k, dtype=np.int16).astype(np.float32)
    samples /= 32768.0
    return samples


def pcm16k_to_wav_bytes(pcm: np.ndarray, sample_rate: int = WHISPER_SAMPLE_RATE) -> bytes:
    """Convert a float32 PCM numpy array to WAV bytes (in-memory).

    Used to write a temp WAV file that speech_to_text() can read.
    """
    int16 = (pcm * 32767).clip(-32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(int16.tobytes())
    return buf.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# WAV file → mulaw base64 (for sending back to Twilio)
# ─────────────────────────────────────────────────────────────────────────────

def wav_file_to_mulaw_b64(wav_path: str) -> str:
    """Convert a WAV file (any sample rate) to base64-encoded mulaw at 8 kHz.

    Args:
        wav_path: Path to a WAV audio file.

    Returns:
        Base64 string of mulaw-encoded audio at 8 kHz, ready to send to Twilio.
    """
    with wave.open(wav_path, "rb") as wf:
        src_rate = wf.getframerate()
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        raw_pcm = wf.readframes(wf.getnframes())

    # Mix down to mono if stereo
    if n_channels == 2:
        raw_pcm, _ = audioop.tomono(raw_pcm, sampwidth, 0.5, 0.5)
        n_channels = 1

    # Normalise to 16-bit if needed
    if sampwidth != 2:
        raw_pcm = audioop.lin2lin(raw_pcm, sampwidth, 2)

    # Resample to 8 kHz if needed
    if src_rate != TWILIO_SAMPLE_RATE:
        raw_pcm, _ = audioop.ratecv(
            raw_pcm, 2, 1, src_rate, TWILIO_SAMPLE_RATE, None
        )

    # Convert linear PCM → mulaw
    mulaw = audioop.lin2ulaw(raw_pcm, 2)
    return base64.b64encode(mulaw).decode("utf-8")


def mp3_file_to_mulaw_b64(mp3_path: str) -> str:
    """Convert an MP3 file to base64-encoded mulaw at 8 kHz.

    Uses pydub for MP3 decoding (requires ffmpeg) or falls back to an
    on-the-fly conversion via audioop if the MP3 is already decodable.

    Note: gTTS saves MP3 files. This function handles that case.
    """
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_mp3(mp3_path)
        audio = audio.set_channels(1).set_frame_rate(TWILIO_SAMPLE_RATE).set_sample_width(2)
        raw_pcm = audio.raw_data
        mulaw = audioop.lin2ulaw(raw_pcm, 2)
        return base64.b64encode(mulaw).decode("utf-8")
    except Exception:
        # pydub / ffmpeg not available — try reading as WAV first
        try:
            return wav_file_to_mulaw_b64(mp3_path)
        except Exception as exc:
            logger.error("Failed to convert mp3 to mulaw: %s", exc)
            return ""


def audio_path_to_mulaw_b64(audio_path: str) -> str:
    """Dispatch to correct converter based on file extension."""
    p = audio_path.lower()
    if p.endswith(".mp3"):
        return mp3_file_to_mulaw_b64(audio_path)
    else:
        return wav_file_to_mulaw_b64(audio_path)


# ─────────────────────────────────────────────────────────────────────────────
# Silence / VAD helpers
# ─────────────────────────────────────────────────────────────────────────────

def rms_energy(raw_mulaw: bytes) -> float:
    """Compute RMS energy of a raw mulaw byte string."""
    linear = audioop.ulaw2lin(raw_mulaw, 2)
    return audioop.rms(linear, 2)


def is_silence(raw_mulaw: bytes, threshold: int = SILENCE_THRESHOLD) -> bool:
    """Return True if the mulaw chunk is below the silence threshold."""
    return rms_energy(raw_mulaw) < threshold
