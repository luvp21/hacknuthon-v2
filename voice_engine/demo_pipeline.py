"""
demo_pipeline.py - End-to-end voice ordering demo.

Demonstrates the full pipeline:
  1. Record microphone audio
  2. Run STT (Speech-to-Text)
  3. Print transcription + detected language
  4. Fuzzy-correct the order text against the menu
  5. Generate a simulated system response
  6. Run TTS (Text-to-Speech) on the response
  7. Play the spoken response

Usage:
    python demo_pipeline.py                  # Live mic recording
    python demo_pipeline.py --file audio.wav # Use existing audio file
    python demo_pipeline.py --text "..."     # Skip STT, just run TTS
"""

import argparse
import logging
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from voice_engine.stt.stt_engine import speech_to_text
from voice_engine.stt.audio_utils import record_audio
from voice_engine.tts.tts_engine import text_to_speech
from voice_engine.tts.voice_utils import play_audio
from voice_engine.utils.fuzzy_menu_match import correct_with_default_menu, find_menu_items
from voice_engine.utils.language_detector import detect_language

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Response generator (simulated — replace with your LLM/rule-based engine)
# ---------------------------------------------------------------------------

UPSELL_RESPONSES = {
    "paneer pizza": "Would you like to add garlic bread combo with your paneer pizza?",
    "chicken pizza": "Would you like extra cheese or a side of garlic bread?",
    "biryani":       "Shall I add raita and a soft drink with your biryani?",
    "burger":        "Would you like to add fries or a drink with that?",
    "coke":          "Would you like to make it a large coke for just ₹20 more?",
    "chai":          "Would you like samosa with your chai?",
}

# Multilingual responses keyed by language code
LANG_RESPONSES: dict[str, str] = {
    "gu": "શું તમે તમારા ઓર્ડર સાથે ગાર્લિક બ્રેડ કોમ્બો ઉમેરવા માંગો છો?",
    "hi": "क्या आप अपने ऑर्डर के साथ गार्लिक ब्रेड कॉम्बो जोड़ना चाहेंगे?",
    "mr": "तुम्हाला तुमच्या ऑर्डरसोबत गार्लिक ब्रेड कॉम्बो घ्यायचा आहे का?",
    "ta": "உங்கள் ஆர்டரில் கார்லிக் ப்ரெட் காம்போ சேர்க்க விரும்புகிறீர்களா?",
    "te": "మీ ఆర్డర్‌తో గార్లిక్ బ్రెడ్ కాంబో జోడించాలనుకుంటున్నారా?",
}

DEFAULT_RESPONSE = "Would you like to add garlic bread combo to your order?"


def generate_response(detected_items: list[dict], language: str) -> str:
    """Generate a context-aware upsell response in the detected language."""
    # If we have a native-language response for this language, use it directly
    if language in LANG_RESPONSES:
        return LANG_RESPONSES[language]
    # Otherwise English item-based upsell
    for item in detected_items:
        canonical = item["item"]
        for key, response in UPSELL_RESPONSES.items():
            if key in canonical:
                return response
    return DEFAULT_RESPONSE


# ---------------------------------------------------------------------------
# Pipeline steps
# ---------------------------------------------------------------------------

def step_record(duration: int) -> str:
    print(f"\n🎙️  Recording for {duration} seconds... Speak your order now!")
    path = record_audio(duration=duration)
    print(f"   Saved to: {path}\n")
    return path


def step_stt(audio_path: str) -> dict:
    print("🔍  Running Speech-to-Text...")
    result = speech_to_text(audio_path)
    return result


def step_correct(text: str) -> tuple[str, list[dict]]:
    corrected = correct_with_default_menu(text)
    items = find_menu_items(corrected)
    return corrected, items


def step_tts(response_text: str, language: str) -> dict:
    print("🔊  Generating speech response...")
    result = text_to_speech(response_text, language=language)
    return result


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_pipeline(audio_path: str | None = None, duration: int = 5, text_only: str | None = None):
    print("\n" + "=" * 60)
    print("  🍕 Restaurant Voice Ordering Copilot — Demo Pipeline")
    print("=" * 60)

    # --- Text-only mode ---
    if text_only:
        lang = detect_language(text_only)
        stt_result = {"text": text_only, "language": lang, "confidence": 1.0, "processing_time": 0.0}
    else:
        # --- Audio input ---
        if audio_path is None:
            audio_path = step_record(duration)

        # --- STT ---
        stt_result = step_stt(audio_path)

        if "error" in stt_result:
            print(f"\n❌  STT Error: {stt_result['error']}")
            return

    # --- Display STT results ---
    print("\n📝  Transcription Results")
    print(f"   Detected Language : {stt_result['language']}")
    print(f"   Transcription     : {stt_result['text']}")
    print(f"   Confidence        : {stt_result.get('confidence', 'N/A')}")
    print(f"   Processing Time   : {stt_result.get('processing_time', 'N/A')}s")

    # --- Fuzzy menu correction ---
    corrected_text, detected_items = step_correct(stt_result["text"])
    if corrected_text != stt_result["text"]:
        print(f"\n✅  Corrected Order : {corrected_text}")
    if detected_items:
        print(f"   Menu Items Detected :")
        for item in detected_items:
            print(f"     • {item['item']} (score: {item['score']})")

    # --- Generate system response ---
    response_text = generate_response(detected_items, stt_result["language"])
    print(f"\n💬  System Response : \"{response_text}\"")

    # --- TTS --- use detected language so Indian voices are spoken natively
    tts_result = step_tts(response_text, language=stt_result["language"])

    if "error" in tts_result:
        print(f"\n❌  TTS Error: {tts_result['error']}")
        return

    print(f"   Audio saved to   : {tts_result['audio_path']}")
    print(f"   Audio duration   : {tts_result['duration']}s")

    # --- Play response ---
    print("\n▶️   Playing response audio...")
    play_audio(tts_result["audio_path"])

    print("\n✅  Pipeline complete.")
    print("=" * 60 + "\n")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restaurant Voice Ordering Demo Pipeline")
    parser.add_argument("--file", type=str, default=None, help="Path to pre-recorded audio file (.wav/.mp3)")
    parser.add_argument("--duration", type=int, default=5, help="Mic recording duration in seconds (default: 5)")
    parser.add_argument("--text", type=str, default=None, help="Skip STT; pass text directly to TTS")
    args = parser.parse_args()

    run_pipeline(
        audio_path=args.file,
        duration=args.duration,
        text_only=args.text,
    )
