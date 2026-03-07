"""
start_agent.py — Single-command entry point for the AI Voice Agent.

What this script does automatically (no manual steps required):

  1. Loads credentials from .env
  2. Starts the Flask server in a background thread
  3. Creates an ngrok HTTPS tunnel via pyngrok
  4. Captures the public URL
  5. Updates the Twilio webhook to point at /incoming-call
  6. Prints the phone number and public URL

Usage:
  cd /path/to/HM
  python3 voice_agent/start_agent.py
"""

import logging
import os
import sys
import threading
import time
from pathlib import Path

# ── Add project root to sys.path ──────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# ── Load .env before any other imports ───────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Required env vars ─────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID  = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN   = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
NGROK_AUTHTOKEN     = os.getenv("NGROK_AUTHTOKEN", "")
PORT                = int(os.getenv("PORT", "5000"))

# Path to a pre-downloaded pyngrok binary (legacy fallback only)
_NGROK_BINARY = str(Path(__file__).parent / "bin" / "ngrok")

DRY_RUN = "--dry-run" in sys.argv


# ─────────────────────────────────────────────────────────────────────────────
# Validation
def _validate_env() -> bool:
    missing = []
    if not TWILIO_ACCOUNT_SID or TWILIO_ACCOUNT_SID == "PASTE_YOUR_ACCOUNT_SID":
        missing.append("TWILIO_ACCOUNT_SID")
    if not TWILIO_AUTH_TOKEN or TWILIO_AUTH_TOKEN == "PASTE_YOUR_AUTH_TOKEN":
        missing.append("TWILIO_AUTH_TOKEN")
    if not TWILIO_PHONE_NUMBER or TWILIO_PHONE_NUMBER == "PASTE_YOUR_TWILIO_PHONE_NUMBER":
        missing.append("TWILIO_PHONE_NUMBER")

    if missing:
        logger.error("❌  Missing credentials in voice_agent/.env: %s", ", ".join(missing))
        logger.error("    Edit voice_agent/.env and fill in your Twilio credentials.")
        return False
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Start Flask in a background thread
# ─────────────────────────────────────────────────────────────────────────────

def _start_flask(port: int) -> None:
    """Start the Flask app in a daemon thread so it doesn't block."""
    import voice_agent.server as srv
    # Disable Flask's own reloader (we manage the process lifecycle)
    srv.app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Start ngrok tunnel
# ─────────────────────────────────────────────────────────────────────────────

def _kill_tunnel() -> None:
    """Kill any stale localhost.run SSH tunnel processes (cross-platform)."""
    import subprocess, sys
    if sys.platform == "win32":
        subprocess.run(
            ["wmic", "process", "where", "commandline like '%localhost.run%'", "delete"],
            capture_output=True,
        )
    else:
        subprocess.run(["pkill", "-f", "localhost.run"], capture_output=True)


def _find_ssh() -> str:
    """Find the SSH binary — available on all modern OSes with no install."""
    import shutil, sys

    found = shutil.which("ssh")
    if found:
        return found

    # Windows fallback path (OpenSSH ships with Win10 1809+)
    if sys.platform == "win32":
        win_ssh = r"C:\Windows\System32\OpenSSH\ssh.exe"
        if os.path.exists(win_ssh):
            return win_ssh

    raise FileNotFoundError(
        "ssh not found. Install OpenSSH:\n"
        "  Windows: Settings → Apps → Optional Features → Add 'OpenSSH Client'\n"
        "  Linux:   sudo apt install openssh-client\n"
        "  Mac:     pre-installed"
    )


# Store tunnel process globally so we can kill it on shutdown
_tunnel_proc = None


def _start_ngrok(port: int) -> str:
    """Launch a localhost.run SSH tunnel — no install needed on any platform."""
    import subprocess, re
    global _tunnel_proc

    _kill_tunnel()
    time.sleep(0.5)

    ssh_bin = _find_ssh()
    logger.info("[tunnel] Starting localhost.run SSH tunnel on port %d ...", port)
    _tunnel_proc = subprocess.Popen(
        [
            ssh_bin,
            "-o", "StrictHostKeyChecking=accept-new",
            "-o", "ServerAliveInterval=30",
            "-o", "ServerAliveCountMax=3",
            "-o", "LogLevel=VERBOSE",
            "-R", f"80:localhost:{port}",
            "nokey@localhost.run",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    # localhost.run prints the URL within a few seconds
    public_url: str = ""
    deadline = time.time() + 40
    while time.time() < deadline:
        line = _tunnel_proc.stdout.readline()
        if not line:
            break
        logger.debug("[tunnel] %s", line.strip())
        match = re.search(r"https://[a-z0-9]+\.lhr\.life", line)
        if match:
            public_url = match.group(0)
            break

    if not public_url:
        _tunnel_proc.terminate()
        raise RuntimeError(
            "❌  localhost.run tunnel failed to start within 40s.\n"
            "    Make sure SSH is installed and you have internet access."
        )

    logger.info("[tunnel] SSH Tunnel: %s → http://localhost:%d", public_url, port)
    return public_url


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Configure Twilio webhook
# ─────────────────────────────────────────────────────────────────────────────

def _configure_twilio_webhook(public_url: str) -> None:
    """Update the Twilio phone number's voice webhook via the REST API."""
    from twilio.rest import Client

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    webhook_url = f"{public_url}/incoming-call"

    numbers = client.incoming_phone_numbers.list(phone_number=TWILIO_PHONE_NUMBER)
    if not numbers:
        logger.error("[Twilio] Phone number %s not found in your account.", TWILIO_PHONE_NUMBER)
        return

    numbers[0].update(voice_url=webhook_url, voice_method="POST")
    logger.info("[Twilio] Webhook configured → %s", webhook_url)


# ─────────────────────────────────────────────────────────────────────────────
# Chatbot health check
# ─────────────────────────────────────────────────────────────────────────────

def _check_chatbot_health() -> None:
    """Verify the petpooja chatbot server is reachable before accepting calls.

    Hits GET http://localhost:3000/health (or the /chat URL base).
    Prints a clear warning if the server is down so developers know to start it.
    Does NOT exit — the voice agent will still start and will log per-call errors.
    """
    import requests

    chatbot_url = os.getenv("CHATBOT_API_URL", "http://localhost:3000/chat")
    base_url = chatbot_url.rsplit("/", 1)[0]  # strip "/chat" → http://localhost:3000
    health_url = f"{base_url}/health"

    logger.info("[Chatbot] Checking chatbot health at %s ...", health_url)
    try:
        resp = requests.get(health_url, timeout=5)
        if resp.status_code < 500:
            logger.info("[Chatbot] Chatbot server is UP (HTTP %d) ✅", resp.status_code)
            print(f"  🤖  Chatbot server : UP ({health_url})")
        else:
            logger.warning("[Chatbot] Chatbot returned HTTP %d — DB may be unavailable.", resp.status_code)
            print(f"  ⚠️   Chatbot server responded with HTTP {resp.status_code} — DB may be down.")
    except requests.exceptions.ConnectionError:
        logger.error(
            "[Chatbot] Cannot reach chatbot at %s.\n"
            "          Start it with:  cd petpooja && npm run dev\n"
            "          Calls will use the fallback reply until it is running.",
            health_url,
        )
        print()
        print("  ⚠️  WARNING: Chatbot server is NOT running!")
        print(f"      Expected at: {health_url}")
        print("      Start it with:  cd petpooja && npm run dev")
        print("      (Voice agent will still start but calls will fail until chatbot is up)")
        print()
    except Exception as exc:
        logger.warning("[Chatbot] Health check error: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    print()
    print("=" * 60)
    print("  🍕 AI Restaurant Voice Agent")
    print("=" * 60)

    # ── Dry-run: just validate imports ───────────────────────────────────────
    if DRY_RUN:
        logger.info("Dry-run mode — validating imports...")
        import voice_agent.audio_utils
        import voice_agent.stt_module
        import voice_agent.tts_module
        import voice_agent.response_engine
        import voice_agent.websocket_handler
        import voice_agent.server
        logger.info("✅  All imports OK")
        return

    # ── Validate credentials ──────────────────────────────────────────────────
    if not _validate_env():
        sys.exit(1)

    # ── Step 1: Start Flask ───────────────────────────────────────────────────
    logger.info("[1/3] Starting Flask server on port %d ...", PORT)
    flask_thread = threading.Thread(target=_start_flask, args=(PORT,), daemon=True)
    flask_thread.start()
    time.sleep(1.5)   # Give Flask a moment to bind
    logger.info("      Flask running ✅")

    # ── Chatbot health check ──────────────────────────────────────────────────
    _check_chatbot_health()

    # ── Step 2: Start ngrok ───────────────────────────────────────────────────
    logger.info("[2/3] Starting ngrok tunnel ...")
    public_url = _start_ngrok(PORT)

    # Inject the public URL into the server module so TwiML is correct
    import voice_agent.server as srv
    srv.PUBLIC_URL = public_url

    # Auto-update PUBLIC_SERVER_URL in voice_agent/.env for trigger_call.py
    env_path = Path(__file__).parent / ".env"
    try:
        env_text = env_path.read_text()
        import re as _re
        if "PUBLIC_SERVER_URL=" in env_text:
            env_text = _re.sub(r"PUBLIC_SERVER_URL=.*", f"PUBLIC_SERVER_URL={public_url}", env_text)
        else:
            env_text += f"\nPUBLIC_SERVER_URL={public_url}\n"
        env_path.write_text(env_text)
        logger.info("[env] Updated PUBLIC_SERVER_URL → %s", public_url)
    except Exception as _e:
        logger.warning("[env] Could not update .env: %s", _e)

    # ── Step 3: Configure Twilio webhook ─────────────────────────────────────
    logger.info("[3/3] Configuring Twilio webhook ...")
    _configure_twilio_webhook(public_url)

    # ── Ready ─────────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print("  ✅  AI Voice Agent Started Successfully!")
    print(f"  🌐  Public URL     : {public_url}")
    print(f"  🔗  Webhook        : {public_url}/incoming-call")
    print(f"  📞  Call this number to test : {TWILIO_PHONE_NUMBER}")
    print("=" * 60)
    print()
    print("  Say something like:")
    print('  "Bhai ek paneer pizza aur ek coke chahiye"')
    print()
    print("  Press CTRL+C to stop.")
    print()

    # Keep alive
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        _kill_tunnel()
        logger.info("Agent stopped.")


if __name__ == "__main__":
    main()
