"""
call_logger.py — Per-call conversation log writer.

Creates two files in voice_agent/logs/ for each call:
  1. <CALLSID>.json  — machine-readable full conversation log
  2. <CALLSID>.txt   — human-readable transcript

Log is written incrementally (each turn appended live) and finalized
with a summary when the call ends.
"""

import json
import logging
import os
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

LOGS_DIR = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)


class CallLog:
    """Manages the conversation log for a single call."""

    def __init__(self, call_sid: str, phone_number: str = "unknown"):
        self.call_sid     = call_sid
        self.phone_number = phone_number
        self.started_at   = datetime.now()
        self.turns: list[dict] = []
        self.ordered_items: list[str] = []

        slug = self.started_at.strftime("%Y%m%d_%H%M%S")
        self.json_path = LOGS_DIR / f"{slug}_{call_sid[:12]}.json"
        self.txt_path  = LOGS_DIR / f"{slug}_{call_sid[:12]}.txt"

        # Write header
        self._write_txt_header()
        logger.info("[CallLog] Logging to %s", self.txt_path.name)

    # ─────────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────────

    def log_bot(self, text: str, language: str = "en") -> None:
        """Log a bot utterance (greeting or response)."""
        self._add_turn("BOT", text, language)

    def log_user(self, text: str, language: str = "en",
                 confidence: float = 0.0, items: list[str] | None = None) -> None:
        """Log a user utterance with STT metadata."""
        self._add_turn("USER", text, language, confidence=confidence, items=items or [])
        if items:
            for item in items:
                if item not in self.ordered_items:
                    self.ordered_items.append(item)

    def close(self) -> None:
        """Finalise the log when the call ends."""
        ended_at   = datetime.now()
        duration_s = round((ended_at - self.started_at).total_seconds(), 1)

        summary = {
            "call_sid":     self.call_sid,
            "phone_number": self.phone_number,
            "started_at":   self.started_at.isoformat(),
            "ended_at":     ended_at.isoformat(),
            "duration_s":   duration_s,
            "total_turns":  len(self.turns),
            "ordered_items": self.ordered_items,
            "turns":        self.turns,
        }

        # Write JSON
        with open(self.json_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        # Append footer to TXT
        with open(self.txt_path, "a", encoding="utf-8") as f:
            f.write("\n" + "─" * 60 + "\n")
            f.write(f"📦  Items Ordered : {', '.join(self.ordered_items) or 'none'}\n")
            f.write(f"⏱️   Duration      : {duration_s}s\n")
            f.write(f"🔢  Turns         : {len(self.turns)}\n")
            f.write(f"🕐  Ended         : {ended_at.strftime('%H:%M:%S')}\n")
            f.write("=" * 60 + "\n")

        logger.info("[CallLog] Call ended. Log saved → %s", self.txt_path)

    # ─────────────────────────────────────────────────────────────────────────
    # Internals
    # ─────────────────────────────────────────────────────────────────────────

    def _add_turn(self, speaker: str, text: str, language: str,
                  confidence: float = 0.0, items: list[str] | None = None) -> None:
        ts = datetime.now()
        turn = {
            "time":       ts.strftime("%H:%M:%S"),
            "speaker":    speaker,
            "text":       text,
            "language":   language,
            "confidence": round(confidence, 2),
            "items":      items or [],
        }
        self.turns.append(turn)

        # Append to TXT live
        with open(self.txt_path, "a", encoding="utf-8") as f:
            prefix = "🤖 BOT " if speaker == "BOT" else "👤 USER"
            lang_tag = f"[{language}]" if language not in ("en", "unknown") else ""
            conf_tag = f" (conf={confidence:.0%})" if speaker == "USER" and confidence > 0 else ""
            items_tag = f" → items: {', '.join(items)}" if items else ""
            f.write(f"[{turn['time']}] {prefix} {lang_tag}{conf_tag}: {text}{items_tag}\n")

    def _write_txt_header(self) -> None:
        with open(self.txt_path, "w", encoding="utf-8") as f:
            f.write("=" * 60 + "\n")
            f.write("  🍕 AI Restaurant Voice Agent — Call Transcript\n")
            f.write("=" * 60 + "\n")
            f.write(f"📞  Call SID     : {self.call_sid}\n")
            f.write(f"📱  Phone        : {self.phone_number}\n")
            f.write(f"🕐  Started      : {self.started_at.strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("─" * 60 + "\n\n")


# ─────────────────────────────────────────────────────────────────────────────
# Global store: call_sid → CallLog
# ─────────────────────────────────────────────────────────────────────────────

_active_logs: dict[str, CallLog] = {}


def start_log(call_sid: str, phone_number: str = "unknown") -> CallLog:
    log = CallLog(call_sid, phone_number)
    _active_logs[call_sid] = log
    return log


def get_log(call_sid: str) -> CallLog | None:
    return _active_logs.get(call_sid)


def end_log(call_sid: str) -> None:
    log = _active_logs.pop(call_sid, None)
    if log:
        log.close()
