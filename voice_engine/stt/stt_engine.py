"""
stt_engine.py - Speech-to-Text engine using OpenAI Whisper.

Supports multilingual transcription for Indian languages including
Hinglish (Hindi+English mix) detection.

Improvements:
  - Uses `small` model by default for much better Indian language accuracy.
  - Loads audio via librosa (no ffmpeg dependency).
  - Two-step language detection: Whisper detect_language() probabilities
    + Unicode script override for native-script transcriptions.
"""

import os
import time
import logging
from pathlib import Path

import whisper
import numpy as np
import librosa

from ..utils.language_detector import detect_hinglish, _detect_by_script

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")  # tiny | base | small | medium

# ISO codes returned by Whisper and their normalized forms
SUPPORTED_LANGUAGES = {
    "en": "en",
    "hi": "hi",
    "ur": "hi",   # Urdu spoken is identical to Hindi; map to Hindi for Devanagari/Hinglish
    "gu": "gu",
    "mr": "mr",
    "ta": "ta",
    "te": "te",
    "kn": "kn",
    "bn": "bn",
    "pa": "pa",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s [STT] %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model loader (lazy singleton)
# ---------------------------------------------------------------------------

_model = None


def _load_model():
    """Load Whisper model lazily (only once per process)."""
    global _model
    if _model is None:
        logger.info("Loading Whisper model: %s", WHISPER_MODEL)
        _model = whisper.load_model(WHISPER_MODEL)
        logger.info("Whisper model loaded.")
    return _model


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def speech_to_text(audio_path: str) -> dict:
    """Transcribe an audio file and detect its language.

    Args:
        audio_path: Path to a .wav or .mp3 audio file.

    Returns:
        A dict with keys:
            text           – transcribed string
            language       – ISO code, e.g. "hi", "en", "hi-en"
            confidence     – float 0-1 (derived from avg log-prob)
            processing_time – seconds taken (float)
            error          – present only on failure / no-speech
    """
    audio_path = str(audio_path)

    if not os.path.exists(audio_path):
        return _error_result(f"File not found: {audio_path}")

    start = time.perf_counter()

    try:
        model = _load_model()

        # --- Load audio via librosa (no ffmpeg needed for .wav/.mp3) ---
        audio_np, _ = librosa.load(audio_path, sr=16000, mono=True)
        audio_np = audio_np.astype(np.float32)

        # --- Step 1: Explicit language detection with probabilities ---
        audio_features = whisper.pad_or_trim(audio_np)
        mel = whisper.log_mel_spectrogram(audio_features).to(model.device)
        _, lang_probs = model.detect_language(mel)
        whisper_lang = max(lang_probs, key=lang_probs.get)
        
        # Initial resolution to decide transcription language
        resolved_lang = _resolve_language(whisper_lang, "", lang_probs)

        lang_confidence = round(lang_probs.get(whisper_lang, 0.0), 4)
        logger.info(
            "Language detected: %s (resolved to: %s, confidence=%.2f%%) | top-5: %s",
            whisper_lang,
            resolved_lang,
            lang_confidence * 100,
            sorted(lang_probs.items(), key=lambda x: -x[1])[:5],
        )

        # --- Step 2: Transcription ---
        result = model.transcribe(
            audio_np,
            language=resolved_lang,   # Use resolved language (e.g. 'hi' instead of 'ur')
            task="transcribe",
            fp16=False,
            verbose=False,
        )

        elapsed = round(time.perf_counter() - start, 3)
        text = result.get("text", "").strip()

        # --- Silence / no-speech check ---
        if not text:
            return {
                "text": "",
                "language": "unknown",
                "confidence": 0,
                "error": "no speech detected",
            }

        # --- Step 3: Language resolution + Unicode script override ---
        language = _resolve_language(whisper_lang, text, lang_probs)

        # --- Confidence from segment log-probs ---
        confidence = _compute_confidence(result.get("segments", []))

        logger.info(
            "STT done | lang=%s | time=%.2fs | text=%r",
            language, elapsed, text[:60],
        )

        return {
            "text": text,
            "language": language,
            "confidence": confidence,
            "processing_time": elapsed,
        }

    except Exception as exc:  # noqa: BLE001
        logger.error("STT failed: %s", exc)
        return _error_result(str(exc))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _resolve_language(whisper_lang: str, text: str, lang_probs: dict | None = None) -> str:
    """Map Whisper language code to our scheme with Unicode script override.

    Priority:
      1. Unicode script detection on transcribed text (most reliable for native script)
      2. Whisper's language probability (if confident enough)
      3. Fallback to Whisper's top language
      4. Hinglish detection on top of Hindi
    """
    # 1. Unicode script override — if transcribed text contains native script chars,
    #    trust the script range detector 100% (e.g. Gujarati \u0A80-\u0AFF chars)
    script_lang = _detect_by_script(text)
    if script_lang:
        logger.info("Unicode script override: %s → %s", whisper_lang, script_lang)
        return script_lang

    # 2. Whisper language mapped to our codes
    lang = SUPPORTED_LANGUAGES.get(whisper_lang, whisper_lang)

    # 3. If Whisper is not confident (< 70%), check secondary candidates
    if lang_probs:
        top_conf = lang_probs.get(whisper_lang, 0.0)
        if top_conf < 0.70:
            # Check if a known Indian language scores higher in top-5
            # We prefer Hindi/Gujarati/Marathi if they are "close enough"
            indian_langs = ["gu", "hi", "mr", "ta", "te", "kn", "bn", "pa"]
            for candidate in sorted(lang_probs, key=lang_probs.get, reverse=True)[:5]:
                # If an Indian language is in top-5 and has at least 70% of top lang score
                if candidate in indian_langs and lang_probs[candidate] > top_conf * 0.7:
                    if candidate != whisper_lang:
                        logger.info(
                            "Low-confidence override: %s (%.0f%%) → %s (%.0f%%)",
                            whisper_lang, top_conf * 100,
                            candidate, lang_probs[candidate] * 100,
                        )
                    lang = SUPPORTED_LANGUAGES.get(candidate, candidate)
                    break

    # 4. Hinglish: Whisper says Hindi but text has significant English
    if lang == "hi" and detect_hinglish(text):
        return "hi-en"

    return lang


def _compute_confidence(segments: list) -> float:
    """Derive a confidence score (0-1) from Whisper segment avg_logprob."""
    if not segments:
        return 0.0
    log_probs = [s.get("avg_logprob", -1.0) for s in segments if "avg_logprob" in s]
    if not log_probs:
        return 0.0
    # avg_logprob is typically in [-1, 0]; map to [0, 1]
    avg = float(np.mean(log_probs))
    confidence = round(min(max(avg + 1.0, 0.0), 1.0), 4)
    return confidence


def _error_result(message: str) -> dict:
    """Return a standardised error response."""
    return {
        "text": "",
        "language": "unknown",
        "confidence": 0,
        "error": message,
    }
