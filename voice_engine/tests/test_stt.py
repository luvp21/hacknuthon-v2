"""
test_stt.py - Unit tests for the STT engine.

Tests cover:
  - Basic transcription return shape
  - Silence / no-speech handling
  - Hinglish detection logic
  - Language resolution
  - Audio preprocessing helpers
"""

import os
import sys
import struct
import wave
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Allow running from project root
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from voice_engine.utils.language_detector import detect_language, detect_hinglish
from voice_engine.utils.fuzzy_menu_match import correct_with_default_menu, find_menu_items


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_sine_wav(path: str, duration: float = 0.5, freq: float = 440.0, sample_rate: int = 16000) -> str:
    """Generate a simple sine-wave WAV file for testing."""
    import math
    n_samples = int(duration * sample_rate)
    samples = [int(32767 * math.sin(2 * math.pi * freq * i / sample_rate)) for i in range(n_samples)]
    packed = struct.pack(f"<{n_samples}h", *samples)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(packed)
    return path


def _make_silent_wav(path: str, duration: float = 1.0, sample_rate: int = 16000) -> str:
    """Generate a near-silent WAV file for testing."""
    n_samples = int(duration * sample_rate)
    packed = struct.pack(f"<{n_samples}h", *([0] * n_samples))
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(packed)
    return path


# ---------------------------------------------------------------------------
# STT Engine tests (mocked Whisper)
# ---------------------------------------------------------------------------

class TestSTTEngine(unittest.TestCase):
    """Tests for stt_engine.speech_to_text."""

    def setUp(self):
        import tempfile
        self.tmp_dir = tempfile.mkdtemp()
        self.audio_path = os.path.join(self.tmp_dir, "test.wav")
        _make_sine_wav(self.audio_path)

    @patch("voice_engine.stt.stt_engine._load_model")
    def test_returns_expected_keys(self, mock_load):
        """Result should contain text, language, confidence, processing_time."""
        mock_model = MagicMock()
        mock_model.transcribe.return_value = {
            "text": "ek paneer pizza aur ek coke",
            "language": "hi",
            "segments": [{"avg_logprob": -0.2}],
        }
        mock_load.return_value = mock_model

        from voice_engine.stt.stt_engine import speech_to_text
        result = speech_to_text(self.audio_path)

        self.assertIn("text", result)
        self.assertIn("language", result)
        self.assertIn("confidence", result)
        self.assertIn("processing_time", result)

    @patch("voice_engine.stt.stt_engine._load_model")
    def test_hinglish_detection(self, mock_load):
        """When Whisper says 'hi' but text is Hinglish, language → 'hi-en'."""
        mock_model = MagicMock()
        mock_model.transcribe.return_value = {
            "text": "bhai ek paneer pizza aur ek coke bhej do",
            "language": "hi",
            "segments": [{"avg_logprob": -0.15}],
        }
        mock_load.return_value = mock_model

        from voice_engine.stt.stt_engine import speech_to_text
        result = speech_to_text(self.audio_path)
        self.assertEqual(result["language"], "hi-en")

    @patch("voice_engine.stt.stt_engine._load_model")
    def test_empty_text_returns_error(self, mock_load):
        """Empty transcription should return no-speech error."""
        mock_model = MagicMock()
        mock_model.transcribe.return_value = {"text": "", "language": "hi", "segments": []}
        mock_load.return_value = mock_model

        from voice_engine.stt.stt_engine import speech_to_text
        result = speech_to_text(self.audio_path)
        self.assertIn("error", result)
        self.assertEqual(result["text"], "")

    def test_file_not_found(self):
        """Non-existent file should return error dict."""
        from voice_engine.stt.stt_engine import speech_to_text
        result = speech_to_text("/tmp/this_file_does_not_exist.wav")
        self.assertIn("error", result)

    @patch("voice_engine.stt.stt_engine._load_model")
    def test_confidence_range(self, mock_load):
        """Confidence should be in [0, 1]."""
        mock_model = MagicMock()
        mock_model.transcribe.return_value = {
            "text": "hello",
            "language": "en",
            "segments": [{"avg_logprob": -0.5}, {"avg_logprob": -0.3}],
        }
        mock_load.return_value = mock_model

        from voice_engine.stt.stt_engine import speech_to_text
        result = speech_to_text(self.audio_path)
        self.assertGreaterEqual(result["confidence"], 0.0)
        self.assertLessEqual(result["confidence"], 1.0)


# ---------------------------------------------------------------------------
# Language detector tests
# ---------------------------------------------------------------------------

class TestLanguageDetector(unittest.TestCase):

    def test_english_text(self):
        lang = detect_language("I would like to order a burger and fries")
        self.assertEqual(lang, "en")

    def test_hinglish_text(self):
        lang = detect_language("bhai ek paneer pizza aur ek coke bhej do")
        self.assertEqual(lang, "hi-en")

    def test_detect_hinglish_true(self):
        result = detect_hinglish("bhai ek paneer pizza aur ek coke bhej do")
        self.assertTrue(result)

    def test_detect_hinglish_false_pure_english(self):
        result = detect_hinglish("I want a pizza and a coke please")
        self.assertFalse(result)

    def test_hindi_text(self):
        lang = detect_language("ek dal makhani aur ek naan chahiye")
        # Should be hi or hi-en
        self.assertIn(lang, ["hi", "hi-en"])

    def test_empty_text(self):
        self.assertEqual(detect_language(""), "unknown")

    def test_devanagari_script(self):
        lang = detect_language("नमस्ते आप कैसे हैं")
        self.assertEqual(lang, "hi")

    def test_tamil_script(self):
        lang = detect_language("வணக்கம் நான் ஒரு பிஸ்ஸா வேண்டும்")
        self.assertEqual(lang, "ta")


# ---------------------------------------------------------------------------
# Fuzzy menu match tests
# ---------------------------------------------------------------------------

class TestFuzzyMenuMatch(unittest.TestCase):

    def test_coke_correction(self):
        corrected = correct_with_default_menu("cok")
        self.assertIn("coke", corrected.lower())

    def test_paneer_pizza_correction(self):
        corrected = correct_with_default_menu("panir piza")
        self.assertIn("paneer pizza", corrected.lower())

    def test_no_change_for_correct_text(self):
        text = "paneer pizza and coke"
        corrected = correct_with_default_menu(text)
        self.assertIn("paneer pizza", corrected.lower())

    def test_find_menu_items(self):
        items = find_menu_items("ek paneer pizza aur ek coke please")
        names = [i["item"] for i in items]
        self.assertTrue(any("paneer pizza" in n for n in names))

    def test_find_menu_items_empty(self):
        items = find_menu_items("")
        self.assertEqual(items, [])

    def test_biryani_detection(self):
        items = find_menu_items("mujhe biriyani chahiye")
        names = [i["item"] for i in items]
        self.assertTrue(any("biryani" in n for n in names))


if __name__ == "__main__":
    unittest.main(verbosity=2)
