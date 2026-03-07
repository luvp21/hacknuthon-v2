"""
trigger_call.py — Make Twilio call YOUR phone and connect it to the AI voice agent.

Usage:
  1. Start the agent first:   python3 voice_agent/start_agent.py
  2. Then trigger the call:   python3 voice_agent/trigger_call.py

Twilio will call MY_PHONE_NUMBER. When you answer, the AI agent starts immediately.
"""

import os
import sys
from pathlib import Path

# ── Load .env from the same directory as this script ─────────────────────────
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

# ── Credentials (read from .env) ──────────────────────────────────────────────
ACCOUNT_SID        = os.getenv("TWILIO_ACCOUNT_SID", "")
AUTH_TOKEN         = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE       = os.getenv("TWILIO_PHONE_NUMBER", "")
MY_PHONE_NUMBER    = os.getenv("MY_PHONE_NUMBER", "")      # e.g. +919XXXXXXXXX
PUBLIC_SERVER_URL  = os.getenv("PUBLIC_SERVER_URL", "")    # e.g. https://xxxx.ngrok-free.app


# ── Validation ────────────────────────────────────────────────────────────────
def _check_env() -> bool:
    errors = []
    if not ACCOUNT_SID or "PASTE" in ACCOUNT_SID:
        errors.append("TWILIO_ACCOUNT_SID")
    if not AUTH_TOKEN or "PASTE" in AUTH_TOKEN:
        errors.append("TWILIO_AUTH_TOKEN")
    if not TWILIO_PHONE or "PASTE" in TWILIO_PHONE:
        errors.append("TWILIO_PHONE_NUMBER")
    if not MY_PHONE_NUMBER or "PASTE" in MY_PHONE_NUMBER or MY_PHONE_NUMBER == "+91XXXXXXXXXX":
        errors.append("MY_PHONE_NUMBER  (set your Indian number, e.g. +919876543210)")
    if not PUBLIC_SERVER_URL or "PASTE" in PUBLIC_SERVER_URL:
        errors.append(
            "PUBLIC_SERVER_URL  (copy the ngrok URL printed by start_agent.py, "
            "e.g. https://xxxx.ngrok-free.app)"
        )
    if errors:
        print("\n❌  Missing / invalid values in voice_agent/.env:")
        for e in errors:
            print(f"    • {e}")
        print("\n  Edit voice_agent/.env and fill these in, then re-run.")
        return False
    return True


# ── Main ──────────────────────────────────────────────────────────────────────
def trigger_call() -> None:
    print()
    print("=" * 60)
    print("  📞  AI Voice Agent — Outbound Call Trigger")
    print("=" * 60)

    if not _check_env():
        sys.exit(1)

    webhook_url = f"{PUBLIC_SERVER_URL.rstrip('/')}/incoming-call"

    print(f"\n  Calling    : {MY_PHONE_NUMBER}")
    print(f"  From       : {TWILIO_PHONE}")
    print(f"  Webhook    : {webhook_url}")
    print()

    client = Client(ACCOUNT_SID, AUTH_TOKEN)

    try:
        call = client.calls.create(
            to=MY_PHONE_NUMBER,
            from_=TWILIO_PHONE,
            url=webhook_url,
            method="POST",
            # Give ourselves 30s to answer before Twilio gives up
            timeout=30,
        )
    except TwilioRestException as exc:
        print(f"❌  Twilio API error: {exc}")
        print()
        if exc.code == 21211:
            print("   → Invalid 'to' phone number. Make sure MY_PHONE_NUMBER is in E.164 format, e.g. +919876543210")
        elif exc.code == 20003:
            print("   → Authentication failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.")
        elif exc.code == 21606:
            print("   → The 'from' number is not capable of making calls.")
        sys.exit(1)
    except Exception as exc:
        print(f"❌  Unexpected error: {exc}")
        sys.exit(1)

    print(f"  ✅  Call initiated!")
    print(f"  📋  Call SID : {call.sid}")
    print(f"  📊  Status   : {call.status}")
    print()
    print("  Your phone should ring in a few seconds.")
    print("  Answer the call — the AI agent will greet you immediately.")
    print()
    print("  Say something like:")
    print('  "Bhai ek paneer pizza aur ek coke chahiye"')
    print()


if __name__ == "__main__":
    trigger_call()
