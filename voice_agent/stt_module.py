"""
stt_module.py — Fast STT for Indian languages.

Provider selection (STT_PROVIDER env var):
  groq    → Groq Whisper large-v3-turbo API  (~200ms, free 7200 min/month)
  whisper → local faster-whisper medium      (17-32s on CPU, no API needed)

Groq is the default and recommended provider for live calls.
Local Whisper is used as automatic fallback if Groq fails.
"""

import io
import logging
import os
import time
import wave

import numpy as np

logger = logging.getLogger(__name__)

# ── Provider selection ────────────────────────────────────────────────────────
_STT_PROVIDER = os.getenv("STT_PROVIDER", "groq").lower()

# ── Indian languages Whisper supports ────────────────────────────────────────
INDIAN_LANGUAGES = ["hi", "en", "gu", "mr", "ta", "te", "kn", "bn", "pa", "ur", "ml", "or", "sa"]

# ── Restaurant-domain prompt (used by both providers) ────────────────────────
_INITIAL_PROMPT = (
    "Restaurant food order. "
    "Menu: Gulab Jamun, Kheer, Tiramisu, Paneer Butter Masala, Dal Makhani, "
    "Chicken Biryani, Mutton Rogan Josh, Palak Paneer, Chole Bhature, "
    "Samosa, Mango Lassi, Cold Coffee, Masala Chai, Veg Fried Rice, "
    "Hakka Noodles, Spring Roll, Tandoori Roti, Butter Naan, Garlic Bread. "
    "Hinglish phrases: ek plate, do chai, teen coffee, mujhe chahiye, "
    "bhai ek order karna hai, yaar menu batao, kitna price hai, "
    "add karo, remove karo, cancel, confirm, total kitna hua, "
    "aur kuch nahi, bas itna hi, theek hai, okay done. "
    "Hindi: एक, दो, तीन, चाहिए, मेनू, ऑर्डर, कीमत, कुल."
)

# ── Hinglish vocabulary for detection ────────────────────────────────────────
_HINGLISH_VOCAB = {
    "bhai", "yaar", "kya", "hai", "hain", "nahi", "nai", "aur", "ek", "do",
    "teen", "chahiye", "dena", "batao", "theek", "accha", "haan",
    "mujhe", "mera", "kitna", "kuch", "wala", "wali", "lena", "dedo",
    "order", "menu", "price", "total", "kitne", "bas", "shukriya", "dhanyawad",
}


def _looks_hinglish(text: str) -> bool:
    words = set(text.lower().split())
    return len(words & _HINGLISH_VOCAB) >= 2


def _detect_hinglish(text: str, lang: str) -> str:
    """Upgrade lang to 'hi-en' if text shows Hinglish code-switching."""
    if lang in ("hi", "en") and text:
        has_devanagari = any("\u0900" <= ch <= "\u097F" for ch in text)
        has_latin = any(ch.isascii() and ch.isalpha() for ch in text)
        if has_devanagari and has_latin:
            logger.info("[STT] Hinglish detected (Devanagari+Latin mix) → lang=hi-en")
            return "hi-en"
        if lang == "en" and _looks_hinglish(text):
            logger.info("[STT] Hinglish detected (vocab match) → lang=hi-en")
            return "hi-en"
    return lang


def _pcm_to_wav_bytes(pcm_audio: np.ndarray, sample_rate: int = 16000) -> bytes:
    """Convert float32 PCM numpy array to WAV bytes (16-bit PCM)."""
    buf = io.BytesIO()
    pcm_int16 = (pcm_audio * 32767).clip(-32768, 32767).astype(np.int16)
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_int16.tobytes())
    return buf.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# GROQ PROVIDER  (~200ms)
# ─────────────────────────────────────────────────────────────────────────────

_GROQ_CLIENT = None
_GROQ_MODEL = "whisper-large-v3"

_LANG_MAP = {
    "hindi": "hi", "english": "en", "gujarati": "gu", "marathi": "mr",
    "tamil": "ta", "telugu": "te", "kannada": "kn", "bengali": "bn",
    "punjabi": "pa", "urdu": "ur", "malayalam": "ml", "odia": "or",
}


def _get_groq_client():
    global _GROQ_CLIENT
    if _GROQ_CLIENT is not None:
        return _GROQ_CLIENT
    try:
        from groq import Groq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY not set in environment")
        _GROQ_CLIENT = Groq(api_key=api_key)
        logger.info("[STT] Groq client ready (model=%s)", _GROQ_MODEL)
    except Exception as e:
        logger.error("[STT] Failed to init Groq client: %s", e)
        _GROQ_CLIENT = None
    return _GROQ_CLIENT


def _transcribe_groq(pcm_audio: np.ndarray) -> dict:
    """Transcribe using Groq Whisper API (~200ms)."""
    client = _get_groq_client()
    if client is None:
        return {"text": "", "language": "unknown", "confidence": 0, "error": "Groq client not available"}

    t0 = time.time()
    try:
        wav_bytes = _pcm_to_wav_bytes(pcm_audio)
        response = client.audio.transcriptions.create(
            file=("audio.wav", wav_bytes, "audio/wav"),
            model=_GROQ_MODEL,
            prompt=_INITIAL_PROMPT,
            response_format="verbose_json",
        )
        elapsed = time.time() - t0

        text = (response.text or "").strip()
        lang = getattr(response, "language", None) or "hi"
        lang = _LANG_MAP.get(lang.lower(), lang)
        if lang not in INDIAN_LANGUAGES:
            lang = "hi"
        lang = _detect_hinglish(text, lang)

        # Extract no_speech_prob from verbose_json segments if available.
        # Groq returns this as avg_logprob in segments; high values (< -1.0) mean noise.
        no_speech_prob = 0.0
        segments = getattr(response, "segments", None) or []
        if segments:
            avg_logprob = sum(getattr(s, "avg_logprob", 0.0) for s in segments) / len(segments)
            # Convert log-prob to a 0-1 "no-speech" estimate: logprob < -1.0 → likely noise
            if avg_logprob < -1.0:
                no_speech_prob = min(1.0, (-avg_logprob - 1.0) / 2.0)

        logger.info("[STT] text=%r  lang=%s  conf=1.00  no_speech=%.2f  time=%.2fs",
                    text[:80], lang, no_speech_prob, elapsed)
        return {
            "text": text,
            "language": lang,
            "confidence": 1.0,
            "no_speech_prob": no_speech_prob,
            "processing_time": round(elapsed, 3),
        }

    except Exception as exc:
        elapsed = time.time() - t0
        logger.error("[STT] Groq error (%.2fs): %s", elapsed, exc)
        return {"text": "", "language": "unknown", "confidence": 0, "error": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# LOCAL WHISPER PROVIDER  (fallback, ~17-32s on CPU)
# ─────────────────────────────────────────────────────────────────────────────

_LOCAL_MODEL = None
_LOCAL_MODEL_NAME = "medium"


def _get_local_model():
    global _LOCAL_MODEL
    if _LOCAL_MODEL is not None:
        return _LOCAL_MODEL
    logger.info("[STT] Loading local Whisper '%s' model...", _LOCAL_MODEL_NAME)
    try:
        from faster_whisper import WhisperModel
        _LOCAL_MODEL = WhisperModel(_LOCAL_MODEL_NAME, device="cpu", compute_type="int8")
        logger.info("[STT] Local Whisper '%s' ready.", _LOCAL_MODEL_NAME)
    except Exception as e:
        logger.error("[STT] Failed to load local Whisper: %s", e)
        _LOCAL_MODEL = None
    return _LOCAL_MODEL


def _transcribe_local(pcm_audio: np.ndarray) -> dict:
    """Transcribe using local faster-whisper (slow on CPU, no API needed)."""
    model = _get_local_model()
    if model is None:
        return {"text": "", "language": "unknown", "confidence": 0, "error": "local model not loaded"}

    t0 = time.time()
    try:
        segments, info = model.transcribe(
            pcm_audio,
            language=None,
            task="transcribe",
            beam_size=3,
            best_of=1,
            temperature=0.0,
            condition_on_previous_text=False,
            initial_prompt=_INITIAL_PROMPT,
            vad_filter=True,
            no_speech_threshold=0.6,
        )
        elapsed = time.time() - t0

        all_text, total_prob, count = [], 0.0, 0
        for seg in segments:
            if seg.no_speech_prob > 0.8:
                continue
            all_text.append(seg.text)
            total_prob += seg.avg_logprob
            count += 1

        text = " ".join(all_text).strip()
        lang = info.language or "hi"
        if lang not in INDIAN_LANGUAGES:
            lang = "hi"
        lang = _detect_hinglish(text, lang)

        avg_prob = (total_prob / count) if count else -5
        confidence = round(min(max(2 ** avg_prob, 0.0), 1.0), 2) if avg_prob > -5 else 0.0

        logger.info("[STT] text=%r  lang=%s  conf=%.2f  time=%.2fs", text[:80], lang, confidence, elapsed)
        return {
            "text": text,
            "language": lang,
            "confidence": confidence,
            "processing_time": round(elapsed, 3),
        }

    except Exception as exc:
        logger.error("[STT] Local Whisper error: %s", exc)
        return {"text": "", "language": "unknown", "confidence": 0, "error": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def transcribe(pcm_audio: np.ndarray) -> dict:
    """Transcribe a float32 PCM array (16 kHz mono).

    Returns dict with keys: text, language, confidence, processing_time
    Provider is selected by STT_PROVIDER env var (groq | whisper).
    If Groq fails, automatically falls back to local Whisper.
    """
    if pcm_audio is None or len(pcm_audio) == 0:
        return {"text": "", "language": "unknown", "confidence": 0, "error": "empty audio"}

    if _STT_PROVIDER == "groq":
        result = _transcribe_groq(pcm_audio)
        if result.get("error") and not result.get("text"):
            logger.warning("[STT] Groq failed (%s) — falling back to local Whisper", result["error"])
            result = _transcribe_local(pcm_audio)
        return result

    return _transcribe_local(pcm_audio)
