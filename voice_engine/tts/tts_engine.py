"""
tts_engine.py - Text-to-Speech engine with multi-backend support.

Backend priority:
  1. gTTS (Google TTS)  — for Indian languages (gu, hi, mr, ta, …). Requires internet.
  2. pyttsx3 (offline)  — English fallback, no model downloads, works on Python 3.13.
  3. Coqui TTS          — if installed (`pip install TTS`), highest quality offline.

Supports multilingual synthesis for Indian languages with automatic
voice routing and English/Hindi fallback.
"""

import os
import time
import logging
from pathlib import Path

from .voice_utils import get_audio_duration

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OUTPUT_DIR = Path(__file__).parent.parent / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Language → Coqui TTS model mapping (used when Coqui is available).
VOICE_MODEL_MAP: dict[str, str] = {
    "en":    "tts_models/en/ljspeech/tacotron2-DDC",
    "hi":    "tts_models/en/ljspeech/tacotron2-DDC",
    "hi-en": "tts_models/en/ljspeech/tacotron2-DDC",
    "gu":    "tts_models/en/ljspeech/tacotron2-DDC",
    "mr":    "tts_models/en/ljspeech/tacotron2-DDC",
    "ta":    "tts_models/en/ljspeech/tacotron2-DDC",
    "te":    "tts_models/en/ljspeech/tacotron2-DDC",
    "kn":    "tts_models/en/ljspeech/tacotron2-DDC",
    "bn":    "tts_models/en/ljspeech/tacotron2-DDC",
    "pa":    "tts_models/en/ljspeech/tacotron2-DDC",
}

FALLBACK_CHAIN = ["hi", "en"]

# gTTS language codes for Indian languages (BCP-47 → gTTS tag)
GTTS_LANG_MAP: dict[str, str] = {
    "gu":    "gu",   # Gujarati
    "hi":    "hi",   # Hindi
    "hi-en": "hi",   # Hinglish → Hindi voice
    "mr":    "mr",   # Marathi
    "ta":    "ta",   # Tamil
    "te":    "te",   # Telugu
    "kn":    "kn",   # Kannada
    "bn":    "bn",   # Bengali
    "pa":    "pa",   # Punjabi
}

# ---------------------------------------------------------------------------
# Backend detection
# ---------------------------------------------------------------------------

def _coqui_available() -> bool:
    """Check whether Coqui TTS is installed."""
    try:
        import TTS  # noqa: F401
        return True
    except ImportError:
        return False


def _gtts_available() -> bool:
    """Check whether gTTS is installed."""
    try:
        import gtts  # noqa: F401
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Model loaders
# ---------------------------------------------------------------------------

_coqui_cache: dict[str, object] = {}
_pyttsx3_engine = None


def _load_coqui(model_name: str):
    """Lazy-load a Coqui TTS model."""
    if model_name not in _coqui_cache:
        from TTS.api import TTS as CoquiTTS
        logger.info("Loading Coqui TTS model: %s", model_name)
        _coqui_cache[model_name] = CoquiTTS(model_name=model_name, progress_bar=False)
    return _coqui_cache[model_name]


def _load_pyttsx3():
    """Lazy-load pyttsx3 engine (singleton)."""
    global _pyttsx3_engine
    if _pyttsx3_engine is None:
        import pyttsx3
        _pyttsx3_engine = pyttsx3.init()
        # Set a natural speech rate (default ~200 is often too fast)
        _pyttsx3_engine.setProperty("rate", 165)
        _pyttsx3_engine.setProperty("volume", 1.0)
        logger.info("pyttsx3 TTS engine initialised.")
    return _pyttsx3_engine


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def text_to_speech(
    text: str,
    language: str = "en",
    speed: float = 1.0,
    output_path: str | None = None,
) -> dict:
    """Synthesize speech from text and save it as a .wav file.

    Uses Coqui TTS if installed, otherwise falls back to pyttsx3 (offline,
    uses macOS/Windows system voices — no model download required).

    Args:
        text:        The text to speak.
        language:    Language code ("en", "hi", "hi-en", …).
        speed:       Speech speed multiplier (default 1.0).
        output_path: Output .wav path. Auto-generated if None.

    Returns:
        Dict with keys:
            audio_path – absolute path to the .wav file
            language   – language code used
            duration   – duration in seconds
            error      – present only on failure
    """
    if not text or not text.strip():
        return _error_result("Empty text provided.")

    if output_path is None:
        output_path = str(OUTPUT_DIR / f"response_{language}_{int(time.time())}.wav")

    start = time.perf_counter()

    try:
        if _coqui_available():
            output_path = _synthesize_coqui(text, language, output_path)
        elif _gtts_available() and language in GTTS_LANG_MAP:
            output_path = _synthesize_gtts(text, language, output_path)
        else:
            output_path = _synthesize_pyttsx3(text, speed, output_path)

        # Apply speed adjustment (pydub method) when using Coqui
        if _coqui_available() and abs(speed - 1.0) > 0.05:
            output_path = _adjust_speed(output_path, speed)

        elapsed = round(time.perf_counter() - start, 3)
        duration = get_audio_duration(output_path)

        logger.info("TTS done | time=%.2fs | duration=%.2fs", elapsed, duration)

        return {
            "audio_path": output_path,
            "language": language,
            "duration": duration,
        }

    except Exception as exc:  # noqa: BLE001
        logger.error("TTS failed: %s", exc)
        return _error_result(str(exc))


def list_supported_languages() -> list[str]:
    """Return all configured language codes."""
    return list(VOICE_MODEL_MAP.keys())


# ---------------------------------------------------------------------------
# Synthesis backends
# ---------------------------------------------------------------------------


def _synthesize_coqui(text: str, language: str, output_path: str) -> str:
    """Synthesize using Coqui TTS."""
    model_name = _resolve_model(language)
    tts = _load_coqui(model_name)
    logger.info("Synthesising with Coqui | lang=%s | model=%s", language, model_name)
    tts.tts_to_file(text=text, file_path=output_path)
    return output_path


def _synthesize_gtts(text: str, language: str, output_path: str) -> str:
    """Synthesize using gTTS (Google Text-to-Speech). Saves as .wav via pydub or direct copy."""
    from gtts import gTTS
    import tempfile, os

    lang_code = GTTS_LANG_MAP.get(language, "en")
    logger.info("Synthesising with gTTS | lang=%s (gtts code: %s)", language, lang_code)

    tts = gTTS(text=text, lang=lang_code, slow=False)

    # Save as mp3 first, then convert to wav
    mp3_path = output_path.replace(".wav", ".mp3")
    tts.save(mp3_path)

    # Try to convert mp3 → wav using pydub (needs ffmpeg) or just rename to .wav
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_mp3(mp3_path)
        audio.export(output_path, format="wav")
        os.remove(mp3_path)
        logger.info("Converted mp3 → wav: %s", output_path)
    except Exception:
        # ffmpeg not available — keep the mp3, rename output_path to .mp3
        output_path = mp3_path
        logger.warning("ffmpeg not found; saved as mp3 instead: %s", output_path)

    return output_path


def _synthesize_pyttsx3(text: str, speed: float, output_path: str) -> str:
    """Synthesize using pyttsx3 (offline system voices)."""
    import pyttsx3
    engine = _load_pyttsx3()

    # Apply speed via pyttsx3 rate property
    base_rate = 165
    engine.setProperty("rate", int(base_rate * speed))

    logger.info("Synthesising with pyttsx3 (offline) → %s", output_path)
    engine.save_to_file(text, output_path)
    engine.runAndWait()
    return output_path


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _resolve_model(language: str) -> str:
    """Pick the Coqui model for *language*, with fallback."""
    if language in VOICE_MODEL_MAP:
        return VOICE_MODEL_MAP[language]
    for fallback in FALLBACK_CHAIN:
        if fallback in VOICE_MODEL_MAP:
            logger.warning("No model for '%s', falling back to '%s'.", language, fallback)
            return VOICE_MODEL_MAP[fallback]
    return VOICE_MODEL_MAP["en"]


def _adjust_speed(audio_path: str, speed: float) -> str:
    """Adjust speed of a .wav via frame rate manipulation (pydub)."""
    from pydub import AudioSegment
    audio = AudioSegment.from_wav(audio_path)
    new_frame_rate = int(audio.frame_rate * speed)
    adjusted = audio._spawn(audio.raw_data, overrides={"frame_rate": new_frame_rate})
    adjusted = adjusted.set_frame_rate(audio.frame_rate)
    out_path = audio_path.replace(".wav", f"_speed{speed:.1f}.wav")
    adjusted.export(out_path, format="wav")
    return out_path


def _error_result(message: str) -> dict:
    return {"audio_path": "", "language": "unknown", "duration": 0.0, "error": message}

