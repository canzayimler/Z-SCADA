#requires -Version 5.1
# Z SCADA baslaticisini (tepsi + Windows servisi; launcher\ZScada.cs) csc.exe (.NET Framework 4.x, C# 5) ile derler.
# Cikti: launcher\bin\ZScada.exe. Hata olursa exit code != 0.
param(
    [string]$Output
)

$ErrorActionPreference = 'Stop'
$LauncherRoot = $PSScriptRoot
$BuilderRoot = Split-Path -Parent $LauncherRoot
if (-not $Output) { $Output = Join-Path $LauncherRoot 'bin\ZScada.exe' }

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $csc)) { throw ".NET Framework csc.exe bulunamadi: $csc" }

$source = Join-Path $LauncherRoot 'ZScada.cs'
# assets\z-scada.ico depoda tutulmaz: build.ps1 uygulamanin apps\web\public\favicon.ico dosyasindan kopyalar.
$icon = Join-Path $BuilderRoot 'assets\z-scada.ico'
foreach ($path in @($source, $icon)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Gerekli dosya yok: $path (simge icin once build.ps1 calistirin)" }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Output) | Out-Null
if (Test-Path -LiteralPath $Output) { Remove-Item -LiteralPath $Output -Force }

& $csc /nologo /target:winexe /codepage:65001 /optimize+ /platform:anycpu /warn:4 `
    "/win32icon:$icon" `
    /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.ServiceProcess.dll `
    "/out:$Output" $source
if ($LASTEXITCODE -ne 0) { throw "ZScada.exe derlemesi basarisiz (csc exit $LASTEXITCODE)" }
if (-not (Test-Path -LiteralPath $Output)) { throw "ZScada.exe uretilmedi: $Output" }

Write-Output "ZScada.exe hazir: $Output ($([math]::Round((Get-Item -LiteralPath $Output).Length / 1KB)) KB)"
