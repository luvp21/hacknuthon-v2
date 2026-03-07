"""
response_engine.py — Forwarding conversation logic to Petpooja TypeScript Chatbot.

This module replaces the local, rule-based response generation with an
HTTP call to the petpooja chatbot server (http://localhost:3000/chat).
"""

import logging
import os
import time
import requests
from dotenv import load_dotenv

# Load env from the voice_agent directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

logger = logging.getLogger(__name__)

# Config
CHATBOT_API_URL = os.getenv("CHATBOT_API_URL", "http://localhost:3000/chat")
CHATBOT_TIMEOUT = float(os.getenv("CHATBOT_TIMEOUT_SECS", "12.0"))
FALLBACK_REPLY = "I'm sorry, I'm having trouble connecting right now. Could you please repeat that?"

# In-memory session store (mapping call_sid -> sessionId)
_SESSIONS: dict[str, "ResponseSession"] = {}


class ResponseSession:
    def __init__(self, call_sid: str):
        self.call_sid = call_sid
        self.turn_count = 0
        self.ordered_items: list[str] = []  # Kept for compatibility with call_logger

    def process(self, text: str, language: str = "en") -> tuple[str, dict]:
        """Forward user text to the petpooja chatbot API.

        Returns:
            (reply_text, timing_dict) — timing_dict contains keys:
                total_ms, session_db_ms, brain_ms, rag_ms, llm_ms
            On any error, returns (FALLBACK_REPLY, {}).
        """
        self.turn_count += 1

        payload = {
            "sessionId": self.call_sid,
            "message": text,
            "language": language,
        }

        logger.info("[Response] Forwarding to chatbot: %r (session=%s, turn=%d)",
                    text, self.call_sid, self.turn_count)

        t0 = time.time()
        try:
            response = requests.post(
                CHATBOT_API_URL,
                json=payload,
                timeout=CHATBOT_TIMEOUT,
            )
            elapsed_ms = int((time.time() - t0) * 1000)

            logger.info("[Response] HTTP %d in %dms",
                        response.status_code, elapsed_ms)

            # Parse JSON body — extract reply + optional _timing breakdown
            try:
                data = response.json()
                reply = data.get("reply") or data.get("text") or data.get("message")
                timing = data.get("_timing") or {}
                # Ensure total_ms is always present even if petpooja didn't send it
                timing.setdefault("total_ms", elapsed_ms)
                if reply and reply.strip():
                    logger.debug("[Response] Chatbot reply: %r", reply)
                    return reply.strip(), timing
            except ValueError:
                logger.warning("[Response] Chatbot returned non-JSON body (status=%d)", response.status_code)

            if response.status_code != 200:
                logger.error("[Response] Chatbot API non-200 status: %d — using fallback", response.status_code)

            return FALLBACK_REPLY, {"total_ms": elapsed_ms}

        except requests.exceptions.ConnectionError as exc:
            elapsed_ms = int((time.time() - t0) * 1000)
            logger.error("[Response] Connection refused after %dms: %s", elapsed_ms, exc)
            return FALLBACK_REPLY, {"error": "connection_refused", "total_ms": elapsed_ms}

        except requests.exceptions.Timeout as exc:
            elapsed_ms = int((time.time() - t0) * 1000)
            logger.error("[Response] Chatbot timed out after %dms (limit=%.0fs): %s",
                         elapsed_ms, CHATBOT_TIMEOUT, exc)
            return FALLBACK_REPLY, {"error": "timeout", "total_ms": elapsed_ms}

        except requests.exceptions.RequestException as exc:
            elapsed_ms = int((time.time() - t0) * 1000)
            logger.error("[Response] Request error after %dms: %s", elapsed_ms, exc)
            return FALLBACK_REPLY, {"error": str(exc), "total_ms": elapsed_ms}


def get_or_create_session(call_sid: str, language: str = "en") -> ResponseSession:
    if call_sid not in _SESSIONS:
        _SESSIONS[call_sid] = ResponseSession(call_sid)
    return _SESSIONS[call_sid]


def end_session(call_sid: str) -> None:
    if call_sid in _SESSIONS:
        del _SESSIONS[call_sid]
        logger.info("[Response] Session ended: %s", call_sid)
