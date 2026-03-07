"""STT (Speech-to-Text) module for the multilingual voice engine."""
from .stt_engine import speech_to_text
from .audio_utils import record_audio, normalize_audio, trim_silence

__all__ = ["speech_to_text", "record_audio", "normalize_audio", "trim_silence"]
