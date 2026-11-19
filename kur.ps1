#requires -Version 5.1
<#
  Z SCADA - kurulum.
  Hedef bilgisayarda bu klasoru acip PowerShell'de calistirin:
      .\kur.ps1
  Windows acilisinda otomatik baslamasini istemiyorsaniz:
      .\kur.ps1 -OtomatikBaslatma:$false
#>
param(
    [bool]$OtomatikBaslatma = $true
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:VITE_CONFIG_NATIVE_IGNORE_WARNING = 'true'

function Invoke-Native([string]$file, [string[]]$commandArguments, [string]$hata) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $file @commandArguments 2>&1 | ForEach-Object { Write-Output "$_" } }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw $hata }
}

Write-Output '=== Z SCADA kurulumu ==='

# 1) Node.js kontrolu ------------------------------------------------------
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    Write-Output ''
    Write-Output 'Node.js bulunamadi.'
    Write-Output 'https://nodejs.org adresinden LTS surumunu (22 veya ustu) kurun, PowerShell penceresini kapatip yeniden acin ve bu betigi tekrar calistirin.'
    Write-Output 'Winget varsa:  winget install OpenJS.NodeJS.LTS'
    throw 'Node.js gerekli.'
}
$nodeVersion = (& node -v).TrimStart('v')
$majorVersion = [int]($nodeVersion.Split('.')[0])
if ($majorVersion -lt 22) { throw "Node.js 22 veya ustu gerekli. Kurulu surum: $nodeVersion" }
Write-Output "Node.js $nodeVersion bulundu."

# 2) Paketler --------------------------------------------------------------
Write-Output 'Bagimliliklar kuruluyor (birkac dakika surebilir)...'
$kuruldu = $false
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'package-lock.json')) {
    try { Invoke-Native 'npm.cmd' @('ci', '--no-audit', '--no-fund') 'npm ci basarisiz.'; $kuruldu = $true }
    catch { Write-Output 'npm ci basarisiz, npm install deneniyor...' }
}
if (-not $kuruldu) { Invoke-Native 'npm.cmd' @('install', '--no-audit', '--no-fund') 'Paket kurulumu basarisiz.' }

# 3) Derleme ---------------------------------------------------------------
Write-Output 'Web arayuzu derleniyor...'
Invoke-Native 'npm.cmd' @('run', 'build') 'Derleme basarisiz.'

# 4) Baslat ----------------------------------------------------------------
& (Join-Path $PSScriptRoot 'baslat.ps1')

# 5) Windows acilisinda otomatik baslatma ----------------------------------
if ($OtomatikBaslatma) {
    # Gorev adi eski kurulumlarla uyumluluk icin degismez; yeniden kurulum ayni gorevi -Force ile gunceller.
    $taskName = 'DVP SCADA'
    try {
        $command = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'baslat.ps1')`""
        $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $command -WorkingDirectory $PSScriptRoot
        # Gozetimsiz tesiste izleme kullanici oturumuna bagli kalmasin: yetki
        # varsa makine acilisinda SYSTEM olarak calis, yoksa oturum acilisina dus.
        $elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        $trigger = if ($elevated) { New-ScheduledTaskTrigger -AtStartup } else { New-ScheduledTaskTrigger -AtLogOn }
        # Surec cokerse gorev yeniden baslasin; gozetimsiz tesiste izleme kaybolmasin.
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
        if ($elevated) {
            Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force -User 'SYSTEM' -RunLevel Highest -Description 'Z SCADA ve Node-RED koprusunu baslatir' | Out-Null
            Write-Output "Otomatik baslatma kuruldu (Zamanlanmis Gorev: $taskName; makine acilisinda SYSTEM olarak)."
        } else {
            Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force -Description 'Z SCADA ve Node-RED koprusunu baslatir' | Out-Null
            Write-Output "Otomatik baslatma kuruldu (Zamanlanmis Gorev: $taskName; oturum acilisinda). Makine acilisinda calismasi icin kur.ps1 dosyasini yonetici olarak calistirin."
        }
    } catch {
        Write-Output "Otomatik baslatma kurulamadi: $($_.Exception.Message)"
        Write-Output 'Elle baslatmak icin baslat.ps1 kullanabilirsiniz.'
    }
}

# 6) Masaustu kisayolu -----------------------------------------------------
try {
    $shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Z SCADA.url'
    $eskiKisayol = Join-Path ([Environment]::GetFolderPath('Desktop')) 'DVP SCADA.url'
    if (Test-Path -LiteralPath $eskiKisayol) { Remove-Item -LiteralPath $eskiKisayol -Force }
    . (Join-Path $PSScriptRoot 'ayarlar.ps1')
    Set-Content -LiteralPath $shortcut -Encoding ascii -Value @(
        '[InternetShortcut]',
        "URL=http://localhost:$SCADA_PORT"
    )
    Write-Output 'Masaustune "Z SCADA" kisayolu eklendi.'
} catch { }

Write-Output ''
Write-Output '=== Kurulum tamam ==='
Write-Output 'Giris bilgileri icin: .local\admin-access.json'
Write-Output 'Durdurmak icin: .\durdur.ps1     Tekrar baslatmak icin: .\baslat.ps1'
