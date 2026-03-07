# Voice Engine — Multilingual STT + TTS for Restaurant Ordering

A modular, fully **offline** voice interface for an AI-powered restaurant ordering copilot.  
Supports **10 Indian languages** including Hinglish detection, powered by open-source models only.

---

## ✨ Features

| Feature | Details |
|---|---|
| **Speech-to-Text** | OpenAI Whisper (tiny / base / small) |
| **Text-to-Speech** | Coqui TTS with language-based voice routing |
| **Languages** | English, Hindi, Hinglish, Gujarati, Marathi, Tamil, Telugu, Kannada, Bengali, Punjabi |
| **Hinglish detection** | Unicode + vocabulary token analysis |
| **Menu correction** | rapidfuzz fuzzy matching |
| **Fully offline** | No paid APIs, no internet required after install |

---

## 🏗️ Project Structure

```
voice_engine/
├── stt/
│   ├── stt_engine.py       # Whisper STT + language detection
│   └── audio_utils.py      # Normalize, trim, denoise, record
├── tts/
│   ├── tts_engine.py       # Coqui TTS + speed control
│   └── voice_utils.py      # Playback, duration, model listing
├── utils/
│   ├── language_detector.py  # Script + token-based language ID
│   └── fuzzy_menu_match.py   # rapidfuzz order correction
├── models/                 # (reserved — models auto-download)
├── outputs/                # Generated audio files
├── tests/
│   ├── test_stt.py
│   └── test_tts.py
├── demo_pipeline.py        # End-to-end demo
└── requirements.txt
```

---

## ⚙️ Installation

```bash
# 1. Clone / navigate to project
cd voice_engine

# 2. Create virtual environment (recommended)
python -m venv venv && source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. (macOS only) ffmpeg for pydub audio decoding
brew install ffmpeg
```

> **Note:** Whisper and Coqui TTS models are downloaded automatically on first use.  
> Use `WHISPER_MODEL=tiny` for the fastest STT; default is `base`.

---

## 🚀 Quick Start

### Live microphone demo
```bash
python demo_pipeline.py
```

### Use an existing audio file
```bash
python demo_pipeline.py --file path/to/order.wav
```

### Text-only TTS test (no microphone needed)
```bash
python demo_pipeline.py --text "ek paneer pizza aur ek coke"
```

### STT on a single file (Python)
```python
from voice_engine.stt.stt_engine import speech_to_text

result = speech_to_text("order.wav")
print(result)
# {
#   "text": "ek paneer pizza aur ek coke",
#   "language": "hi-en",
#   "confidence": 0.87,
#   "processing_time": 1.2
# }
```

### TTS — synthesize speech
```python
from voice_engine.tts.tts_engine import text_to_speech

result = text_to_speech("Would you like garlic bread?", language="en")
print(result)
# {
#   "audio_path": "outputs/response_en_1234567890.wav",
#   "language": "en",
#   "duration": 2.4
# }
```

### Record from microphone
```python
from voice_engine.stt.audio_utils import record_audio

path = record_audio(duration=5)   # records 5 seconds
```

### Fuzzy menu correction
```python
from voice_engine.utils.fuzzy_menu_match import correct_with_default_menu, find_menu_items

print(correct_with_default_menu("panir piza aur cok"))
# → "paneer pizza aur coke"

print(find_menu_items("biriyani ke saath ek lassi"))
# → [{"item": "biryani", "score": 92.0, ...}, {"item": "mango lassi", ...}]
```

---

## 🌐 Supported Languages

| Code | Language | Script |
|---|---|---|
| `en` | English | Latin |
| `hi` | Hindi | Devanagari |
| `hi-en` | Hinglish | Mixed |
| `gu` | Gujarati | Gujarati |
| `mr` | Marathi | Devanagari |
| `ta` | Tamil | Tamil |
| `te` | Telugu | Telugu |
| `kn` | Kannada | Kannada |
| `bn` | Bengali | Bengali |
| `pa` | Punjabi | Gurmukhi |

---

## 🔧 Configuration

| Environment Variable | Default | Options |
|---|---|---|
| `WHISPER_MODEL` | `base` | `tiny`, `base`, `small` |

---

## 🧪 Running Tests

```bash
# From project root (voice_engine's parent)
python -m pytest voice_engine/tests/ -v
```

Tests use mocked models — no GPU or internet required.

---

## 📐 System Architecture

```
User Speech
    ↓
[STT Module]  ← audio_utils (normalize + trim + denoise)
    ↓
{text, language, confidence}
    ↓
[language_detector]  ← Hinglish / regional detection
    ↓
[fuzzy_menu_match]   ← Correct STT errors
    ↓
Order Understanding Engine  (your teammate's module)
    ↓
Response Text
    ↓
[TTS Module]  ← language-routed voice model
    ↓
Generated .wav Speech
```

---

## ⚡ Performance Targets

| Operation | Target |
|---|---|
| STT (base model, short sentence) | < 2 seconds |
| TTS (English, short sentence) | < 1 second |

---

## 📦 Key Dependencies

| Package | Purpose |
|---|---|
| `openai-whisper` | Offline STT |
| `TTS` (Coqui) | Offline TTS |
| `pydub` | Audio format handling |
| `librosa` | Noise reduction, audio analysis |
| `sounddevice` | Microphone recording & playback |
| `rapidfuzz` | Fuzzy menu item matching |
| `torch` | Backend for Whisper + Coqui |

---

## 🗂️ Output Files

All generated audio files are saved to the `outputs/` directory:  
- `recorded_audio.wav` — mic recording  
- `response_<lang>_<timestamp>.wav` — TTS output  

---

*Built for hackathon use — modular, fast, and fully open-source.*
