"""
server.py — Flask HTTP + WebSocket server for the Twilio Voice Agent.

Routes:
  POST /incoming-call
    Called by Twilio when someone dials your number.
    Returns TwiML using <Connect><Stream> for BIDIRECTIONAL audio.

  WebSocket /media-stream
    Persistent WebSocket for real-time bidirectional audio with Twilio.
    Delegates all logic to websocket_handler.handle_media_stream().

IMPORTANT:
  <Connect><Stream> is used instead of <Start><Stream>.
  <Start><Stream> is INBOUND-ONLY — audio sent back over the WebSocket
  is silently discarded by Twilio and the caller never hears it.
  <Connect><Stream> keeps the call live and enables BIDIRECTIONAL audio.
"""

import logging
import os

from flask import Flask, request, Response
from flask_sock import Sock

from voice_agent import websocket_handler

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Flask app
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
sock = Sock(app)

# Public ngrok URL — set by start_agent.py before the server starts
PUBLIC_URL: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/incoming-call", methods=["GET", "POST"])
def incoming_call():
    """Twilio calls this when the number is dialled.

    Returns TwiML using <Connect><Stream> for BIDIRECTIONAL real-time audio.
    The AI greeting is sent over the WebSocket (not via <Say>) so Twilio
    plays it back to the caller immediately after connecting.
    """
    ws_url = PUBLIC_URL.replace("https://", "wss://").replace("http://", "ws://")
    ws_url = f"{ws_url}/media-stream"

    # Use <Connect><Stream> — this is the ONLY way to send audio back to Twilio
    # via WebSocket. <Start><Stream> is receive-only.
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{ws_url}"/>
    </Connect>
</Response>"""

    logger.info("[Server] /incoming-call hit — streaming to %s", ws_url)
    return Response(twiml, mimetype="text/xml")


@app.route("/health")
def health():
    """Simple health-check endpoint."""
    return {"status": "ok", "public_url": PUBLIC_URL}


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket endpoint
# ─────────────────────────────────────────────────────────────────────────────

@sock.route("/media-stream")
def media_stream(ws):
    """WebSocket endpoint for Twilio Media Streams."""
    logger.info("[Server] WebSocket /media-stream connection opened.")
    websocket_handler.handle_media_stream(ws)
    logger.info("[Server] WebSocket /media-stream connection closed.")
