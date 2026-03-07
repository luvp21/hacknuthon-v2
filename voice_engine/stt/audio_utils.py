"""
audio_utils.py - Audio preprocessing utilities for the STT pipeline.

Handles normalization, silence trimming, noise reduction,
and microphone recording using pydub, librosa, and sounddevice.
"""

import os
import time
import logging
import tempfile
from pathlib import Path

import numpy as np
import sounddevice as sd
import scipy.io.wavfile as wav
import librosa
import librosa.effects
from pydub import AudioSegment
from pydub.effects import normalize

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OUTPUT_DIR = Path(__file__).parent.parent / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 16000          # Whisper expects 16 kHz


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def record_audio(duration: int = 5, output_path: str | None = None) -> str:
    """Record audio from the default microphone.

    Args:
        duration:    Recording length in seconds (default 5).
        output_path: Where to save the .wav file.
                     Defaults to outputs/recorded_audio.wav.

    Returns:
        Absolute path to the saved .wav file.
    """
    if output_path is None:
        output_path = str(OUTPUT_DIR / "recorded_audio.wav")

    logger.info("Recording for %d second(s)... Speak now!", duration)
    audio_data = sd.rec(
        int(duration * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
    )
    sd.wait()  # Block until done
    logger.info("Recording complete.")

    wav.write(output_path, SAMPLE_RATE, audio_data)
    logger.info("Saved recording to %s", output_path)
    return output_path


def normalize_audio(audio_path: str) -> str:
    """Normalize audio amplitude to a standard headroom.

    Args:
        audio_path: Path to input audio file.

    Returns:
        Path to the normalized .wav file (may be a temp file).
    """
    audio = AudioSegment.from_file(audio_path)
    normalized = normalize(audio)
    out_path = _temp_wav("normalized")
    normalized.export(out_path, format="wav")
    logger.debug("Normalized audio saved to %s", out_path)
    return out_path


def trim_silence(audio_path: str, silence_thresh: int = -40, min_silence_len: int = 300) -> str:
    """Trim leading and trailing silence from an audio file.

    Args:
        audio_path:      Path to the input audio.
        silence_thresh:  dBFS level below which audio is considered silent.
        min_silence_len: Minimum silence duration (ms) to remove.

    Returns:
        Path to trimmed .wav file.
    """
    audio = AudioSegment.from_file(audio_path)
    # Strip from start
    trimmed = _strip_silence(audio, silence_thresh, min_silence_len, from_start=True)
    # Strip from end (reverse, strip, reverse back)
    trimmed = _strip_silence(trimmed.reverse(), silence_thresh, min_silence_len, from_start=True).reverse()
    out_path = _temp_wav("trimmed")
    trimmed.export(out_path, format="wav")
    logger.debug("Silence trimmed, saved to %s", out_path)
    return out_path


def reduce_noise(audio_path: str) -> str:
    """Apply basic spectral noise gate using librosa.

    Computes a noise profile from the first 0.5s and attenuates
    frequencies below the noise floor.

    Args:
        audio_path: Path to the input audio.

    Returns:
        Path to noise-reduced .wav file.
    """
    y, sr = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)

    # Estimate noise from first 0.5 s
    noise_sample = y[: int(0.5 * sr)]

    # Simple spectral subtraction
    S_full = np.abs(librosa.stft(y))
    S_noise = np.abs(librosa.stft(noise_sample))

    # Mean noise spectrum
    noise_mean = np.mean(S_noise, axis=1, keepdims=True)

    # Subtract noise and clip
    S_denoised = np.maximum(S_full - noise_mean * 2.0, 0)

    # Reconstruct with original phase
    phase = np.exp(1j * np.angle(librosa.stft(y)))
    y_denoised = librosa.istft(S_denoised * phase)

    out_path = _temp_wav("denoised")
    import soundfile as sf
    sf.write(out_path, y_denoised, sr)
    logger.debug("Noise reduction done, saved to %s", out_path)
    return out_path


def preprocess_audio(audio_path: str, denoise: bool = False) -> str:
    """Full preprocessing pipeline: normalize → trim silence → (optional) denoise.

    Args:
        audio_path: Path to raw audio file.
        denoise:    Whether to run spectral noise reduction (slightly slower).

    Returns:
        Path to preprocessed .wav file ready for Whisper.
    """
    step = normalize_audio(audio_path)
    step = trim_silence(step)
    if denoise:
        step = reduce_noise(step)
    return step


def has_speech(audio_path: str, threshold_db: float = -45.0) -> bool:
    """Return True if the audio contains non-silent content.

    Args:
        audio_path:   Path to audio file.
        threshold_db: dBFS level; audio louder than this is considered speech.

    Returns:
        True if speech is detected, False otherwise.
    """
    audio = AudioSegment.from_file(audio_path)
    return audio.dBFS > threshold_db


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _strip_silence(
    audio: AudioSegment,
    silence_thresh: int,
    min_silence_len: int,
    from_start: bool,
) -> AudioSegment:
    """Remove silence from the start of an AudioSegment."""
    chunk_ms = 50
    pos = 0
    while pos < len(audio):
        chunk = audio[pos: pos + chunk_ms]
        if chunk.dBFS > silence_thresh:
            break
        pos += chunk_ms
    return audio[pos:]


def _temp_wav(prefix: str) -> str:
    """Create a temporary .wav file path in the system temp dir."""
    fd, path = tempfile.mkstemp(prefix=f"ve_{prefix}_", suffix=".wav")
    os.close(fd)
    return path
