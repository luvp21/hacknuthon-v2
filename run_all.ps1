# run_all.ps1 — Windows launcher for AI Voice Ordering Copilot
# Usage: .\run_all.ps1
# Requires: Node.js, Python venv at .\.venv, cloudflared in PATH or .\voice_agent\bin\

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$VENV_PYTHON = "$ROOT\.venv\Scripts\python.exe"
$AGENT_LOG = "$ROOT\logs\agent.log"
$PETPOOJA_LOG = "$ROOT\logs\petpooja.log"

# Fallback to system python
if (-not (Test-Path $VENV_PYTHON)) {
    $VENV_PYTHON = (Get-Command python).Source
}

# Create logs dir
New-Item -ItemType Directory -Force -Path "$ROOT\logs" | Out-Null

# ── Cleanup ───────────────────────────────────────────────────────────────────
Write-Host "Cleaning up old processes..." -ForegroundColor Yellow

# Kill processes on ports 3000 and 5050
foreach ($port in @(3000, 5050)) {
    $pids = netstat -ano | Select-String ":$port\s.*LISTENING" | ForEach-Object {
        ($_ -split "\s+")[-1]
    }
    foreach ($p in $pids) {
        if ($p -match '^\d+$') { taskkill /F /PID $p 2>$null }
    }
}

# Kill stale localhost.run SSH tunnels
Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*localhost.run*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 2

# ── Start petpooja ────────────────────────────────────────────────────────────
Write-Host "Starting petpooja on port 3000..." -ForegroundColor Cyan
$petpoojaLog = [System.IO.StreamWriter]::new($PETPOOJA_LOG, $false)
$petpoojaProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" `
    -WorkingDirectory "$ROOT\petpooja" `
    -RedirectStandardOutput $PETPOOJA_LOG -RedirectStandardError $PETPOOJA_LOG `
    -NoNewWindow -PassThru

# Wait for petpooja health
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -lt 500) { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 1
}
if ($ready) { Write-Host "   Petpooja ready." -ForegroundColor Green }
else { Write-Host "   Petpooja didn't respond in 30s - check logs\petpooja.log" -ForegroundColor Red }

# ── Start voice agent ─────────────────────────────────────────────────────────
Write-Host "Starting voice agent on port 5050..." -ForegroundColor Cyan
$agentProc = Start-Process -FilePath $VENV_PYTHON -ArgumentList "voice_agent\start_agent.py" `
    -WorkingDirectory $ROOT `
    -RedirectStandardOutput $AGENT_LOG -RedirectStandardError $AGENT_LOG `
    -NoNewWindow -PassThru

# Wait for Cloudflare tunnel URL
Write-Host "   Waiting for Cloudflare tunnel..." -ForegroundColor Gray
$tunnelUrl = ""
for ($i = 0; $i -lt 60; $i++) {
    if (Test-Path $AGENT_LOG) {
        $content = Get-Content $AGENT_LOG -Raw -ErrorAction SilentlyContinue
        if ($content -match "(https://[a-z0-9]+\.lhr\.life)") {
            $tunnelUrl = $Matches[1]
            break
        }
    }
    Start-Sleep -Seconds 1
}

if ($tunnelUrl) {
    Write-Host "   Tunnel: $tunnelUrl" -ForegroundColor Green
} else {
    Write-Host "   Tunnel didn't start - check logs\agent.log" -ForegroundColor Red
    Stop-Process -Id $petpoojaProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $agentProc.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

# Wait for webhook
for ($i = 0; $i -lt 20; $i++) {
    $content = Get-Content $AGENT_LOG -Raw -ErrorAction SilentlyContinue
    if ($content -match "Webhook configured") {
        Write-Host "   Twilio webhook configured." -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
}

Start-Sleep -Seconds 2

# ── Trigger call ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Triggering outbound call..." -ForegroundColor Cyan
& $VENV_PYTHON "$ROOT\voice_agent\trigger_call.py"

Write-Host ""
Write-Host "Agent is running in the background." -ForegroundColor Green
Write-Host "   Agent log   : $AGENT_LOG"
Write-Host "   Petpooja log: $PETPOOJA_LOG"
Write-Host ""
Write-Host "   To stop, run: Stop-Process -Id $($agentProc.Id),$($petpoojaProc.Id) -Force"
Write-Host "   Or close this window."
