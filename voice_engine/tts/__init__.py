"""TTS (Text-to-Speech) module for the multilingual voice engine."""
from .tts_engine import text_to_speech
from .voice_utils import play_audio, get_audio_duration

__all__ = ["text_to_speech", "play_audio", "get_audio_duration"]
