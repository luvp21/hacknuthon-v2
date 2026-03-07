"""
call_timer.py — Pretty per-call pipeline timeline display.

Emits a step-by-step timing log for the full:
    Twilio → (VAD) → STT → Brain/LLM → TTS → Twilio pipeline.

Example output:
    ╔══════════════════════════════════════════════════════════════════════╗
    ║  📞 CALL START  CA33d7211a96  @ 2026-03-07 01:41:51
    ╚══════════════════════════════════════════════════════════════════════╝

    [+00.000s] 📡  TWILIO      WebSocket connected
    [+00.012s] 🎙   STREAM      call=CA33d7211a96 | stream=MZ4b...
    [+00.025s] 🔊  GREET       Sending greeting...
    [+00.512s] 📤  TWILIO      Greeting sent (3.2s audio)

    ── TURN 1 ──────────────────────────────────────────────── +2.341s ──

    [+02.341s] 🎤  AUDIO       Utterance: 1.82s captured
    [+02.341s] 🔤  STT         Transcribing...
    [+04.127s] 🔤  STT     ✅  1.786s  → "ek paneer butter masala" (lang=hi conf=0.91)
    [+04.127s] 🌐  HTTP        POST /chat  →  session=CA33d7211a96
    [+05.498s] 🌐  HTTP    ✅  total=1371ms
                   ├─ 🗄  DB     session lookup :   23ms
                   ├─ 🧠  BRAIN  processTurn   : 1231ms
                   │    ├─ 🔍  RAG   retrieval :   37ms
                   │    └─ 💡  LLM   Gemini    : 1189ms
                   └─ 🗄  DB     session update:   18ms
    [+05.498s] 🤖  REPLY       "Aapka Paneer Butter Masala add kar diya..."
    [+05.498s] 🔊  TTS         Synthesizing...
    [+05.937s] 🔊  TTS     ✅  439ms  → 4.2s of audio
    [+05.937s] 📤  TWILIO      Audio sent

    ╔══════════════════════════════════════════════════════════════════════╗
    ║  📞 CALL END    CA33d7211a96  total=42.3s
    ╚══════════════════════════════════════════════════════════════════════╝
"""

import threading
import time
from datetime import datetime

_TIMERS: dict[str, "_CallTimer"] = {}
_lock = threading.Lock()

_W = 72  # box width


def _bar(char: str = "═") -> str:
    return char * _W


class _CallTimer:
    """Per-call step-by-step timer with pretty console output."""

    def __init__(self, call_sid: str) -> None:
        self.call_sid = call_sid
        self.t0 = time.perf_counter()
        self._turn = 0
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n╔{_bar()}╗", flush=True)
        print(f"║  📞 CALL START  {call_sid}  @ {now}", flush=True)
        print(f"╚{_bar()}╝", flush=True)

    # ── internals ────────────────────────────────────────────────────────────

    def _ts(self) -> str:
        s = time.perf_counter() - self.t0
        return f"+{s:07.3f}s"

    # ── public API ───────────────────────────────────────────────────────────

    def step(self, emoji: str, tag: str, msg: str, indent: int = 0) -> None:
        """Print a timed step line.

        Args:
            emoji:  Single emoji to prefix the line (e.g. "🔤")
            tag:    Short uppercase label (e.g. "STT", "HTTP")
            msg:    Free-form description string
            indent: Indentation level (0 = no indent)
        """
        pad = "    " * indent
        print(f"[{self._ts()}] {pad}{emoji}  {tag:<11}  {msg}", flush=True)

    def sub(self, line: str) -> None:
        """Print a sub-line without a timestamp (for breakdown trees)."""
        print(f"{'':>14}{line}", flush=True)

    def new_turn(self) -> None:
        """Print a separator banner for a new user turn."""
        self._turn += 1
        s = time.perf_counter() - self.t0
        dashes = "─" * max(0, 55 - len(str(self._turn)))
        print(f"\n── TURN {self._turn} {dashes} +{s:.3f}s", flush=True)

    def end(self) -> None:
        """Print the CALL END box."""
        s = time.perf_counter() - self.t0
        print(f"\n╔{_bar()}╗", flush=True)
        print(f"║  📞 CALL END    {self.call_sid}  total={s:.3f}s", flush=True)
        print(f"╚{_bar()}╝\n", flush=True)


# ── Module-level API ─────────────────────────────────────────────────────────

def start(call_sid: str) -> _CallTimer:
    """Start and register a timer for a new call."""
    with _lock:
        t = _CallTimer(call_sid)
        _TIMERS[call_sid] = t
        return t


def get(call_sid: str) -> "_CallTimer | None":
    """Return the active timer for *call_sid*, or None if not found."""
    return _TIMERS.get(call_sid)


def end(call_sid: str) -> None:
    """Finalize and deregister the timer for *call_sid*."""
    with _lock:
        t = _TIMERS.pop(call_sid, None)
    if t:
        t.end()
