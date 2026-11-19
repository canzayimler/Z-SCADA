#requires -Version 5.1
# Z SCADA - SCADA sunucusunu ve Node-RED koprusunu durdurur.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
$data = Join-Path $PSScriptRoot '.local'

foreach ($name in @('server', 'node-red')) {
    $pidFile = Join-Path $data "$name.pid"
    if (-not (Test-Path -LiteralPath $pidFile)) { continue }
    $processId = (Get-Content -LiteralPath $pidFile | Select-Object -First 1).Trim()
    if ($processId) {
        try {
            Stop-Process -Id ([int]$processId) -Force -ErrorAction Stop
            Write-Output "$name durduruldu (pid $processId)."
        } catch {
            Write-Output "$name zaten calismiyor."
        }
    }
    Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
}
Write-Output 'Tamam.'
