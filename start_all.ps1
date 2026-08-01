# ============================================================
#  K_Health_Care - Start Backend + Frontend + Serveo Tunnel
#  Run:  .\start_all.ps1
# ============================================================

$ROOT      = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKEND   = Join-Path $ROOT "backend"
$FRONTEND  = Join-Path $ROOT "frontend"
$LINKS_FILE = Join-Path $ROOT "tunnel_links.txt"

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  K Health Care - Full Startup Script' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

# ----------------------------------------------------------
# 1. Start Backend (uvicorn)
# ----------------------------------------------------------
Write-Host '[1/3] Starting Backend on port 8000...' -ForegroundColor Yellow
$backendProc = Start-Process -FilePath "python" `
    -ArgumentList "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload" `
    -WorkingDirectory $BACKEND `
    -PassThru -WindowStyle Normal
Write-Host ('  -> Backend PID: ' + $backendProc.Id) -ForegroundColor Green

# Give backend a moment to boot
Start-Sleep -Seconds 4

# ----------------------------------------------------------
# 2. Start Frontend (vite dev)
# ----------------------------------------------------------
Write-Host '[2/4] Starting Frontend on port 3000...' -ForegroundColor Yellow
$frontendProc = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "dev", "--", "--port", "3000" `
    -WorkingDirectory $FRONTEND `
    -PassThru -WindowStyle Normal
Write-Host ('  -> Frontend PID: ' + $frontendProc.Id) -ForegroundColor Green

Start-Sleep -Seconds 3

# ----------------------------------------------------------
# 3. Start WhatsApp Gateway (node index.js)
# ----------------------------------------------------------
Write-Host '[3/4] Starting WhatsApp Gateway on port 3001...' -ForegroundColor Yellow
$whatsappGW   = Join-Path $ROOT "whatsapp-gateway"
$whatsappProc = Start-Process -FilePath "node" `
    -ArgumentList "index.js" `
    -WorkingDirectory $whatsappGW `
    -PassThru -WindowStyle Normal
Write-Host ('  -> WhatsApp Gateway PID: ' + $whatsappProc.Id) -ForegroundColor Green

Start-Sleep -Seconds 2

# ----------------------------------------------------------
# 4. Start Serveo Tunnel (SSH-based, no signup needed)
# ----------------------------------------------------------
Write-Host '[4/4] Creating Serveo tunnel for backend...' -ForegroundColor Yellow

$stdoutFile = Join-Path $ROOT "serveo_stdout.txt"
$stderrFile = Join-Path $ROOT "serveo_stderr.txt"

# Remove old files
Remove-Item $stdoutFile -ErrorAction SilentlyContinue
Remove-Item $stderrFile -ErrorAction SilentlyContinue

$tunnelProc = Start-Process -FilePath "ssh" `
    -ArgumentList "-R", "80:localhost:8000", "serveo.net", "-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=60" `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile `
    -PassThru -WindowStyle Hidden
Write-Host ('  -> Tunnel PID: ' + $tunnelProc.Id) -ForegroundColor Green

# Wait for tunnel URL to appear in stdout
Write-Host '  -> Waiting for tunnel URL...' -ForegroundColor Gray
$tunnelUrl = $null
$retries = 0
$maxRetries = 30   # up to 30 seconds

while ($retries -lt $maxRetries) {
    Start-Sleep -Seconds 1
    $retries++

    if (Test-Path $stdoutFile) {
        $content = Get-Content $stdoutFile -Raw -ErrorAction SilentlyContinue
        if ($content -match '(https://\S+\.serveousercontent\.com)') {
            $tunnelUrl = $Matches[1]
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host '' -ForegroundColor Red
    Write-Host '  [!] Could not obtain tunnel URL. Check serveo_stderr.txt for errors.' -ForegroundColor Red
    Write-Host '      Continuing in Local Mode (localhost:8000)...' -ForegroundColor Yellow
    Write-Host ''
    $tunnelUrl = "http://localhost:8000"
}

Write-Host ('  -> Tunnel URL: ' + $tunnelUrl) -ForegroundColor Green

# ----------------------------------------------------------
# 4. Write endpoint links file
# ----------------------------------------------------------
$separator = '============================================================'
$linksLines = @(
    $separator,
    '  K Health Care - Public API Endpoints (via Serveo Tunnel)',
    ('  Generated: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')),
    $separator,
    '',
    'BASE URL:',
    ('  ' + $tunnelUrl),
    '',
    'ELEVENLABS TOOL ENDPOINTS:',
    ('  Voice Order   :  ' + $tunnelUrl + '/voice-order'),
    ('  Voice Pay Link:  ' + $tunnelUrl + '/voice-pay-link'),
    '',
    'OTHER USEFUL ENDPOINTS:',
    ('  Checkout      :  ' + $tunnelUrl + '/create-checkout-session'),
    ('  Verify Payment:  ' + $tunnelUrl + '/verify-payment'),
    ('  API Docs      :  ' + $tunnelUrl + '/docs'),
    '',
    'LOCAL SERVERS:',
    '  Backend       :  http://localhost:8000',
    '  Frontend      :  http://localhost:3000',
    '  WhatsApp GW   :  http://localhost:3001',
    '',
    'PROCESS IDs (to stop later):',
    ('  Backend PID   :  ' + $backendProc.Id),
    ('  Frontend PID  :  ' + $frontendProc.Id),
    ('  WhatsApp PID  :  ' + $whatsappProc.Id),
    ('  Tunnel PID    :  ' + $tunnelProc.Id),
    '',
    'To stop everything run:',
    ('  Stop-Process -Id ' + $backendProc.Id + ',' + $frontendProc.Id + ',' + $whatsappProc.Id + ',' + $tunnelProc.Id),
    $separator
)

$linksLines | Out-File -FilePath $LINKS_FILE -Encoding UTF8

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  ALL SERVICES STARTED SUCCESSFULLY!' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''
Write-Host ('  Links saved to: ' + $LINKS_FILE) -ForegroundColor White
Write-Host ''
Write-Host ('  Voice Order    : ' + $tunnelUrl + '/voice-order') -ForegroundColor White
Write-Host ('  Voice Pay Link : ' + $tunnelUrl + '/voice-pay-link') -ForegroundColor White
Write-Host ''
Write-Host '  Press Ctrl+C to exit (servers keep running)' -ForegroundColor Gray
Write-Host ''

# Open the links file automatically
Start-Process notepad.exe $LINKS_FILE

# Keep script alive so user sees the output
Write-Host 'Tunnel is active. Do NOT close this window.' -ForegroundColor Yellow
while ($true) { Start-Sleep -Seconds 60 }
