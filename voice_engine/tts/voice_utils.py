"""
voice_utils.py - Audio playback and helper utilities for the TTS module.

Cross-platform playback using sounddevice + scipy, with fallbacks to
pydub's native playback method.
"""

import logging
from pathlib import Path

import numpy as np
import sounddevice as sd
import scipy.io.wavfile as wavfile

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def play_audio(audio_path: str) -> None:
    """Play an audio file (.wav or .mp3) through the system's default output device.

    Playback chain:
      1. sounddevice + scipy  (wav only)
      2. pydub                (wav/mp3, needs ffmpeg)
      3. macOS afplay         (wav/mp3, built-in on macOS — no extra deps)

    Args:
        audio_path: Path to the audio file to play.
    """
    audio_path = str(audio_path)
    if not Path(audio_path).exists():
        logger.error("Audio file not found: %s", audio_path)
        return

    # For .mp3 files skip straight to platform fallback (scipy can't read mp3)
    if audio_path.lower().endswith(".mp3"):
        _play_via_platform(audio_path)
        return

    try:
        sample_rate, data = wavfile.read(audio_path)

        # Normalise to float32 for sounddevice
        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            data = data.astype(np.float32) / 2147483648.0

        logger.info("Playing audio: %s (%.1fs)", audio_path, len(data) / sample_rate)
        sd.play(data, samplerate=sample_rate)
        sd.wait()  # Block until playback complete
        logger.info("Playback complete.")

    except Exception as exc:  # noqa: BLE001
        logger.warning("sounddevice playback failed (%s), trying pydub fallback.", exc)
        _play_via_pydub(audio_path)


def get_audio_duration(audio_path: str) -> float:
    """Return the duration of a .wav file in seconds.

    Args:
        audio_path: Path to the .wav file.

    Returns:
        Duration in seconds, or 0.0 on error.
    """
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(audio_path)
        return round(len(audio) / 1000.0, 3)
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not determine duration for %s: %s", audio_path, exc)
        return 0.0


def list_available_voices() -> list[str]:
    """Return a list of Coqui TTS model names available for download.

    Uses TTS's built-in model manager.

    Returns:
        List of model name strings.
    """
    try:
        from TTS.api import TTS
        manager = TTS()
        models = manager.list_models()
        return models if isinstance(models, list) else []
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not list TTS models: %s", exc)
        return []


def save_audio_info(audio_path: str) -> dict:
    """Return metadata about an audio file.

    Args:
        audio_path: Path to the audio file.

    Returns:
        Dict with keys: path, duration_sec, sample_rate, channels.
    """
    try:
        sr, data = wavfile.read(audio_path)
        channels = 1 if data.ndim == 1 else data.shape[1]
        duration = round(len(data) / sr, 3)
        return {
            "path": audio_path,
            "duration_sec": duration,
            "sample_rate": sr,
            "channels": channels,
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not read audio info: %s", exc)
        return {"path": audio_path, "duration_sec": 0.0, "error": str(exc)}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _play_via_pydub(audio_path: str) -> None:
    """Fallback playback using pydub (requires ffplay or simpleaudio)."""
    try:
        from pydub import AudioSegment
        from pydub.playback import play
        audio = AudioSegment.from_file(audio_path)
        play(audio)
    except Exception as exc:
        logger.warning("pydub playback also failed: %s — trying platform fallback.", exc)
        _play_via_platform(audio_path)


def _play_via_platform(audio_path: str) -> None:
    """Final fallback: use macOS afplay (built-in, supports mp3 + wav, no ffmpeg needed)."""
    import subprocess, sys
    try:
        if sys.platform == "darwin":
            logger.info("Playing via afplay: %s", audio_path)
            subprocess.run(["afplay", audio_path], check=True)
        else:
            # Linux/Windows: try aplay or start
            cmd = ["aplay", audio_path] if sys.platform.startswith("linux") else ["start", audio_path]
            subprocess.run(cmd, check=True)
        logger.info("Platform playback complete.")
    except Exception as exc:
        logger.error("Platform playback also failed: %s", exc)
