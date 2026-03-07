#!/usr/bin/env bash
# run_all.sh — Start petpooja + voice agent, then trigger a call.
# Usage: bash run_all.sh

set -uo pipefail

PYTHON="/home/luv/Desktop/hacknuthon/.venv/bin/python"
ROOT="/home/luv/Desktop/hacknuthon"
AGENT_LOG="$ROOT/logs/agent.log"

# ── Cleanup ──────────────────────────────────────────────────────────────────
echo "🧹 Cleaning up old processes..."
mkdir -p "$ROOT/logs"
fuser -k 5050/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
pkill -f localhost.run 2>/dev/null || true
pkill -f start_agent   2>/dev/null || true
pkill -f "ts-node"     2>/dev/null || true
pkill -f "server.ts"   2>/dev/null || true
sleep 2

# ── Start petpooja ───────────────────────────────────────────────────────────
echo "🍕 Starting petpooja on port 3000..."
cd "$ROOT/petpooja"
nohup npm run dev > "$ROOT/logs/petpooja.log" 2>&1 &
PETPOOJA_PID=$!

# Wait for port 3000
for i in $(seq 1 20); do
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "   ✅ Petpooja ready."
    break
  fi
  sleep 1
done

# ── Start voice agent (detached) ─────────────────────────────────────────────
echo "🎙️  Starting voice agent on port 5050..."
cd "$ROOT"
nohup "$PYTHON" voice_agent/start_agent.py > "$AGENT_LOG" 2>&1 &
AGENT_PID=$!

# Wait until tunnel URL appears in the log
echo "   Waiting for Cloudflare tunnel..."
for i in $(seq 1 40); do
  URL=$(grep -oP 'https://[a-z0-9]+\.lhr\.life' "$AGENT_LOG" 2>/dev/null | head -1)
  if [[ -n "$URL" ]]; then
    echo "   ✅ Tunnel: $URL"
    break
  fi
  sleep 1
done

# Wait for Twilio webhook to be configured
for i in $(seq 1 20); do
  if grep -q "Webhook configured" "$AGENT_LOG" 2>/dev/null; then
    echo "   ✅ Twilio webhook configured."
    break
  fi
  sleep 1
done

# Give Flask one extra second to be fully ready
sleep 2

# ── Trigger the call ─────────────────────────────────────────────────────────
echo ""
echo "📞 Triggering outbound call..."
cd "$ROOT"
"$PYTHON" voice_agent/trigger_call.py

echo ""
echo "🎧 Agent is running in the background."
echo "   Logs: tail -f $AGENT_LOG"
echo "   Petpooja logs: tail -f $ROOT/logs/petpooja.log"
echo ""
echo "   Press CTRL+C or run:  kill $AGENT_PID $PETPOOJA_PID"
