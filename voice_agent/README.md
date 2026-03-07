# 🍕 AI Restaurant Voice Agent

Real-time multilingual AI phone ordering agent powered by Twilio Media Streams, OpenAI Whisper (STT), and gTTS (TTS).

## Setup (One-Time)

1. **Edit credentials**:
   ```bash
   nano voice_agent/.env
   ```
   Fill in:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
   NGROK_AUTHTOKEN=your_ngrok_token  # Optional but recommended
   ```

2. **Install dependencies**:
   ```bash
   pip3 install -r voice_agent/requirements.txt
   ```

## Run

```bash
cd /path/to/HM
python3 voice_agent/start_agent.py
```

Console output:
```
============================================================
  ✅  AI Voice Agent Started Successfully!
  🌐  Public URL     : https://xxxx.ngrok-free.app
  🔗  Webhook        : https://xxxx.ngrok-free.app/incoming-call
  📞  Call this number to test : +1XXXXXXXXXX
============================================================
```

## Demo Flow

```
📞 Judge calls Twilio number
          ↓
🤖 AI: "Namaste! Welcome to AI Restaurant. What would you like to order?"
          ↓
🗣️  User: "bhai ek paneer pizza aur ek coke chahiye"
          ↓
🎙️  Whisper STT → "bhai ek paneer pizza aur ek coke chahiye"
          ↓
🧠 Language detected: hi-en | Items: paneer pizza, coke
          ↓
💬 Response: "क्या आप अपने ऑर्डर के साथ गार्लिक ब्रेड कॉम्बो जोड़ना चाहेंगे?"
          ↓
🔊 gTTS synthesizes → mulaw 8kHz → Twilio plays audio
          ↓
🔁 Conversation continues...
```

## Architecture

```
Caller → Twilio → /incoming-call (Flask)
                → TwiML: Start Media Stream
                ↕ WebSocket /media-stream
                  audio_utils.py   ← mulaw/PCM conversion
                  stt_module.py    ← Whisper STT
                  response_engine.py ← fuzzy menu match
                  tts_module.py    ← gTTS → mulaw
```

## Supported Languages

| Language | Code | Notes |
|----------|------|-------|
| English | `en` | Primary |
| Hindi | `hi` | Primary |
| Hinglish | `hi-en` | Primary |
| Gujarati | `gu` | Bonus |
| Tamil | `ta` | Bonus |
| + 5 more | — | Bengali, Marathi, Telugu, Kannada, Punjabi |

## Project Structure

```
voice_agent/
├── .env                  ← Your Twilio credentials (edit this!)
├── start_agent.py        ← Entry point (python3 start_agent.py)
├── server.py             ← Flask routes + WebSocket endpoint
├── websocket_handler.py  ← Real-time audio pipeline
├── audio_utils.py        ← mulaw ↔ PCM conversion + VAD
├── stt_module.py         ← Whisper STT wrapper
├── tts_module.py         ← gTTS TTS wrapper
├── response_engine.py    ← Menu matching + response logic
└── requirements.txt
```
