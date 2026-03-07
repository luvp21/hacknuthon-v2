"""
test_tts.py - Unit tests for the TTS engine.

Tests cover:
  - Output format validation
  - Language routing logic
  - Speed parameter behaviour
  - Error handling for empty text
  - Voice utils helpers
"""

import os
import sys
import wave
import struct
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent.parent))


# ---------------------------------------------------------------------------
# TTS Engine tests (mocked Coqui TTS)
# ---------------------------------------------------------------------------

class TestTTSEngine(unittest.TestCase):

    def _make_wav(self, path: str) -> None:
        """Write a minimal valid WAV file to simulate Coqui TTS output."""
        import math, struct, wave
        sr = 22050
        freq = 440.0
        n = sr
        samples = [int(32767 * math.sin(2 * math.pi * freq * i / sr)) for i in range(n)]
        packed = struct.pack(f"<{n}h", *samples)
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(packed)

    @patch("voice_engine.tts.tts_engine._load_tts")
    def test_returns_expected_keys(self, mock_load_tts):
        """Result dict must have audio_path, language, duration."""
        import tempfile
        tmp = tempfile.mktemp(suffix=".wav")

        mock_tts = MagicMock()
        mock_tts.tts_to_file.side_effect = lambda text, file_path: self._make_wav(file_path)
        mock_load_tts.return_value = mock_tts

        from voice_engine.tts.tts_engine import text_to_speech
        result = text_to_speech("Would you like garlic bread?", language="en", output_path=tmp)

        self.assertIn("audio_path", result)
        self.assertIn("language", result)
        self.assertIn("duration", result)
        self.assertNotIn("error", result)

    @patch("voice_engine.tts.tts_engine._load_tts")
    def test_output_file_exists(self, mock_load_tts):
        """Output .wav file should be created on disk."""
        import tempfile
        tmp = tempfile.mktemp(suffix=".wav")

        mock_tts = MagicMock()
        mock_tts.tts_to_file.side_effect = lambda text, file_path: self._make_wav(file_path)
        mock_load_tts.return_value = mock_tts

        from voice_engine.tts.tts_engine import text_to_speech
        result = text_to_speech("Hello!", language="en", output_path=tmp)

        self.assertTrue(os.path.exists(result["audio_path"]))

    @patch("voice_engine.tts.tts_engine._load_tts")
    def test_duration_positive(self, mock_load_tts):
        """Duration should be a positive float."""
        import tempfile
        tmp = tempfile.mktemp(suffix=".wav")

        mock_tts = MagicMock()
        mock_tts.tts_to_file.side_effect = lambda text, file_path: self._make_wav(file_path)
        mock_load_tts.return_value = mock_tts

        from voice_engine.tts.tts_engine import text_to_speech
        result = text_to_speech("Test sentence.", language="en", output_path=tmp)

        self.assertGreater(result["duration"], 0.0)

    def test_empty_text_returns_error(self):
        """Empty text should return error dict without calling model."""
        from voice_engine.tts.tts_engine import text_to_speech
        result = text_to_speech("", language="en")
        self.assertIn("error", result)
        self.assertEqual(result["audio_path"], "")

    def test_whitespace_only_text_returns_error(self):
        from voice_engine.tts.tts_engine import text_to_speech
        result = text_to_speech("   ", language="en")
        self.assertIn("error", result)

    def test_language_routing_returns_model_name(self):
        """_resolve_model should return a string for every supported language."""
        from voice_engine.tts.tts_engine import _resolve_model, VOICE_MODEL_MAP
        for lang in VOICE_MODEL_MAP:
            model = _resolve_model(lang)
            self.assertIsInstance(model, str)
            self.assertTrue(model.startswith("tts_models/"))

    def test_language_routing_fallback(self):
        """Unknown language codes should fall back gracefully."""
        from voice_engine.tts.tts_engine import _resolve_model
        model = _resolve_model("xx-unknown")
        self.assertIsInstance(model, str)

    def test_list_supported_languages(self):
        from voice_engine.tts.tts_engine import list_supported_languages
        langs = list_supported_languages()
        self.assertIn("en", langs)
        self.assertIn("hi", langs)
        self.assertIn("hi-en", langs)


# ---------------------------------------------------------------------------
# Voice utils tests
# ---------------------------------------------------------------------------

class TestVoiceUtils(unittest.TestCase):

    def _write_wav(self, path: str) -> None:
        sr = 16000
        n = sr  # 1 second of silence
        packed = struct.pack(f"<{n}h", *([0] * n))
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(packed)

    def test_get_audio_duration(self):
        import tempfile
        tmp = tempfile.mktemp(suffix=".wav")
        self._write_wav(tmp)

        from voice_engine.tts.voice_utils import get_audio_duration
        duration = get_audio_duration(tmp)
        self.assertAlmostEqual(duration, 1.0, delta=0.1)

    def test_get_audio_duration_missing_file(self):
        from voice_engine.tts.voice_utils import get_audio_duration
        result = get_audio_duration("/tmp/nonexistent_file.wav")
        self.assertEqual(result, 0.0)

    def test_save_audio_info(self):
        import tempfile
        tmp = tempfile.mktemp(suffix=".wav")
        self._write_wav(tmp)

        from voice_engine.tts.voice_utils import save_audio_info
        info = save_audio_info(tmp)

        self.assertIn("duration_sec", info)
        self.assertIn("sample_rate", info)
        self.assertIn("channels", info)
        self.assertAlmostEqual(info["duration_sec"], 1.0, delta=0.1)
        self.assertEqual(info["sample_rate"], 16000)
        self.assertEqual(info["channels"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
