#!/usr/bin/env python3
"""
run_all.py — Cross-platform launcher (Windows, Mac, Linux).
Starts petpooja + voice agent, waits for tunnel, then triggers the call.

Usage:
  python run_all.py
  python run_all.py --no-call    # skip the outbound call trigger
"""

import os
import re
import subprocess
import sys
import time
from pathlib import Path

# ── Resolve paths relative to this file ──────────────────────────────────────
ROOT    = Path(__file__).parent.resolve()
VENV    = ROOT / ".venv"
IS_WIN  = sys.platform == "win32"

PYTHON  = (
    VENV / "Scripts" / "python.exe"   if IS_WIN else
    VENV / "bin"     / "python"
)
# Fallback to current interpreter if venv not found
if not PYTHON.exists():
    PYTHON = Path(sys.executable)

AGENT_LOG   = ROOT / "logs" / "agent.log"
PETPOOJA_LOG = ROOT / "logs" / "petpooja.log"

AGENT_LOG.parent.mkdir(exist_ok=True)

NO_CALL = "--no-call" in sys.argv


# ── Helpers ───────────────────────────────────────────────────────────────────

def kill_port(port: int) -> None:
    """Kill whatever process is listening on a TCP port (cross-platform)."""
    if IS_WIN:
        # Find PID via netstat, then kill it
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            if f":{port} " in line and "LISTENING" in line:
                parts = line.split()
                pid = parts[-1]
                subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
    else:
        subprocess.run(["fuser", "-k", f"{port}/tcp"], capture_output=True)


def kill_process(name: str) -> None:
    """Kill process by name fragment (cross-platform)."""
    if IS_WIN:
        subprocess.run(["taskkill", "/F", "/IM", f"{name}.exe"], capture_output=True)
        subprocess.run(
            f'wmic process where "commandline like \'%{name}%\'" delete',
            shell=True, capture_output=True
        )
    else:
        subprocess.run(["pkill", "-f", name], capture_output=True)


def wait_for_url(logfile: Path, timeout: int = 60) -> str:
    """Poll logfile until a trycloudflare.com URL appears. Returns the URL."""
    pattern = re.compile(r"https://[a-z0-9]+\.lhr\.life")
    deadline = time.time() + timeout
    while time.time() < deadline:
        if logfile.exists():
            text = logfile.read_text(errors="ignore")
            m = pattern.search(text)
            if m:
                return m.group(0)
        time.sleep(1)
    return ""


def wait_for_string(logfile: Path, needle: str, timeout: int = 30) -> bool:
    """Poll logfile until needle appears."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if logfile.exists() and needle in logfile.read_text(errors="ignore"):
            return True
        time.sleep(1)
    return False


def wait_for_http(url: str, timeout: int = 30) -> bool:
    """Poll an HTTP endpoint until it returns < 500."""
    import urllib.request, urllib.error
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            code = urllib.request.urlopen(url, timeout=2).getcode()
            if code < 500:
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print()
    print("🧹  Cleaning up old processes...")
    kill_port(5050)
    kill_port(3000)
    kill_process("localhost.run")
    kill_process("start_agent")
    kill_process("ts-node")
    time.sleep(2)

    # ── Start petpooja ────────────────────────────────────────────────────────
    print("🍕  Starting petpooja on port 3000...")
    petpooja_dir = ROOT / "petpooja"
    npm_cmd = "npm.cmd" if IS_WIN else "npm"
    with open(PETPOOJA_LOG, "w") as plog:
        petpooja_proc = subprocess.Popen(
            [npm_cmd, "run", "dev"],
            cwd=str(petpooja_dir),
            stdout=plog, stderr=plog,
        )

    if wait_for_http("http://localhost:3000/health", timeout=30):
        print("   ✅  Petpooja ready.")
    else:
        print("   ⚠️   Petpooja didn't respond in 30s — check logs/petpooja.log")

    # ── Start voice agent ─────────────────────────────────────────────────────
    print("🎙️   Starting voice agent on port 5050...")
    with open(AGENT_LOG, "w") as alog:
        agent_proc = subprocess.Popen(
            [str(PYTHON), "voice_agent/start_agent.py"],
            cwd=str(ROOT),
            stdout=alog, stderr=alog,
        )

    # Wait for tunnel URL
    print("   Waiting for Cloudflare tunnel...")
    url = wait_for_url(AGENT_LOG, timeout=60)
    if url:
        print(f"   ✅  Tunnel: {url}")
    else:
        print("   ❌  Tunnel didn't start in 60s — check logs/agent.log")
        petpooja_proc.terminate()
        agent_proc.terminate()
        sys.exit(1)

    # Wait for webhook configured
    if wait_for_string(AGENT_LOG, "Webhook configured", timeout=20):
        print("   ✅  Twilio webhook configured.")
    else:
        print("   ⚠️   Webhook config timed out — check logs/agent.log")

    time.sleep(2)

    # ── Trigger call ──────────────────────────────────────────────────────────
    if not NO_CALL:
        print()
        print("📞  Triggering outbound call...")
        subprocess.run([str(PYTHON), "voice_agent/trigger_call.py"], cwd=str(ROOT))

    print()
    print("🎧  Agent is running in the background.")
    print(f"   Agent log   : {AGENT_LOG}")
    print(f"   Petpooja log: {PETPOOJA_LOG}")
    print()
    print(f"   To stop: kill PIDs {agent_proc.pid} (agent) and {petpooja_proc.pid} (petpooja)")
    print("   Or just close this window / press Ctrl+C")
    print()

    try:
        agent_proc.wait()
    except KeyboardInterrupt:
        print("\nStopping...")
        agent_proc.terminate()
        petpooja_proc.terminate()


if __name__ == "__main__":
    main()
