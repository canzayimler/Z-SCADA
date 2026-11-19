#requires -Version 5.1
param(
    [switch]$Etkinlestir  # cihazlari etkinlestir, ekranlari yayinla ve PLC koprusunu uygula
)
# Z SCADA - Node-RED koprusunu ve SCADA sunucusunu baslatir.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
. (Join-Path $PSScriptRoot 'ayarlar.ps1')
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'

function Invoke-Native([string]$file, [string[]]$commandArguments, [string]$hata) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $file @commandArguments 2>&1 | ForEach-Object { Write-Output "$_" } }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw $hata }
}


$data = Join-Path $PSScriptRoot '.local'
New-Item -ItemType Directory -Force -Path $data | Out-Null

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Node.js bulunamadi. Once kur.ps1 calistirin veya https://nodejs.org adresinden Node.js 22+ kurun.' }
$node = $nodeCommand.Source

function Test-ScadaPort([int]$port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $port); $client.Close(); return $true } catch { return $false } finally { $client.Dispose() }
}

function Wait-ScadaUrl([string]$url, [int]$seconds, [string]$what) {
    for ($i = 0; $i -lt $seconds * 2; $i++) {
        try { Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing | Out-Null; return $true } catch { Start-Sleep -Milliseconds 500 }
    }
    throw "$what zaman asimina ugradi: $url"
}

function Start-Background([string]$name, [string[]]$argumentList, [string]$logName) {
    $process = Start-Process -FilePath $node -ArgumentList $argumentList -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $data "$logName.log") -RedirectStandardError (Join-Path $data "$logName-error.log")
    $process.Id | Set-Content -LiteralPath (Join-Path $data "$logName.pid") -Encoding ascii
    return $process
}

# 1) Node-RED --------------------------------------------------------------
if (Test-ScadaPort $NODERED_PORT) {
    Write-Output "Node-RED zaten calisiyor (port $NODERED_PORT)."
} else {
    $userDir = Join-Path $data 'node-red'
    New-Item -ItemType Directory -Force -Path $userDir | Out-Null
    # Yonetim yuzeyi loopback'e baglanir ve adminAuth zorunlu kilinir.
    Invoke-Native 'npx.cmd' @('tsx', 'scripts/nodered-guvenlik.ts') 'Node-RED guvenlik ayari olusturulamadi.'
    $settings = Join-Path $userDir 'settings.js'
    Start-Background 'node-red' @('node_modules/node-red/red.js', '--userDir', $userDir, '--settings', $settings, '-p', "$NODERED_PORT") 'node-red' | Out-Null
    Wait-ScadaUrl "http://127.0.0.1:$NODERED_PORT/auth/login" 120 'Node-RED' | Out-Null
    Write-Output "Node-RED baslatildi (port $NODERED_PORT)."
}

# 2) Web arayuzu derlemesi -------------------------------------------------
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist/web/index.html'))) {
    Write-Output 'Web arayuzu derleniyor...'
    Invoke-Native 'npm.cmd' @('run', 'build') 'Derleme basarisiz.'
}

# 3) SCADA sunucusu --------------------------------------------------------
$env:SCADA_PORT = "$SCADA_PORT"
$env:SCADA_HOST = $SCADA_HOST
$env:NODERED_URL = "http://127.0.0.1:$NODERED_PORT"
if (Test-ScadaPort $SCADA_PORT) {
    Write-Output "SCADA zaten calisiyor: http://localhost:$SCADA_PORT"
} else {
    Start-Background 'scada' @('--max-http-header-size=32768', '--import', 'tsx', 'apps/server/src/index.ts') 'server' | Out-Null
    Wait-ScadaUrl "http://127.0.0.1:$SCADA_PORT/api/health" 90 'SCADA sunucusu' | Out-Null
    Write-Output "SCADA baslatildi: http://localhost:$SCADA_PORT"
}

# 4) Yonetici hesabi ve proje yukleme -------------------------------------
# Devreye alma (cihazlari etkinlestir + ekranlari yayinla + kopruyu uygula)
# ayri bir karardir: -Etkinlestir ile ya da arayuzden yapilir (B06).
$hazirlikArgs = @('--import', 'tsx', 'scripts/hazirla.ts')
if ($Etkinlestir) { $hazirlikArgs += '--etkinlestir' }
Invoke-Native $node $hazirlikArgs 'Hazirlik adimi basarisiz.'

Write-Output ''
Write-Output "SCADA hazir  ->  http://localhost:$SCADA_PORT"
Write-Output "Node-RED     ->  http://localhost:$NODERED_PORT"
Write-Output 'Giris bilgileri: .local\admin-access.json'
