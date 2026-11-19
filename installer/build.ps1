#requires -Version 5.1
<#
.SYNOPSIS
    Z SCADA Windows kurucusunu (tek EXE, Inno Setup 6) kaynak agacindan uretir.

.DESCRIPTION
    Varsayilan kaynak, bu betigin bir ust klasorudur: <repo>\installer\build.ps1 -> <repo>.
    Adimlar: tepsi baslaticisi (ZScada.exe) derlenir, web arayuzu derlenir, uygulama staging'e
    kopyalanir, uretim bagimliliklari (npm ci --omit=dev) kurulur, runtime dogrulanir ve ISCC ile
    installer\dist\Z-SCADA-Kurulum-<surum>.exe uretilir.
    Gereksinimler ve ayrintilar: installer\README.md.

.PARAMETER SourceRoot
    Z SCADA kaynak agaci (package.json'in oldugu klasor). Varsayilan: betigin bir ust klasoru.

.PARAMETER Version
    Istege bagli. Kurucu surumu (dosya adi ve Programlar listesindeki surum), ornek 0.6.0. Tek surum kaynagi
    kok package.json "version" alanidir (uygulama /api/health'te ve guncelleme denetiminde onu raporlar);
    verilmezse oradan alinir, verilir ve farkliysa derleme durur. Yeni surum icin once package.json guncellenir.

.PARAMETER NodeVersion
    Istege bagli sabitleme: PATH'teki node.exe bu surum degilse (ornek '24.11.1' veya 'v24.11.1') derleme durur.
    Kurucuya gomulen runtime PATH'teki node.exe'nin kopyasidir.

.PARAMETER IncludePaket
    Kaynak agacindaki paket\ klasorunu (kuruluma gomulu ozel proje) da kurulum paketine koyar. Varsayilan: konmaz;
    kurulum uygulamanin yerlesik ornek projesiyle baslar. paket\ yoksa bu anahtar yok sayilir.
#>
param(
    [string]$Version = '',
    [string]$SourceRoot = '',
    [string]$NodeVersion = '',
    [switch]$IncludePaket
)

$ErrorActionPreference = 'Stop'
$BuilderRoot = $PSScriptRoot
# Windows PowerShell 5.1'de $PSScriptRoot param() varsayilanlarinda bos: varsayilan burada cozulur.
if (-not $SourceRoot) { $SourceRoot = Split-Path -Parent $BuilderRoot }
$SourceRoot = [IO.Path]::GetFullPath($SourceRoot)
$StageRoot = Join-Path $BuilderRoot '_staging'
$StageApp = Join-Path $StageRoot 'app'
$StageRuntime = Join-Path $StageRoot 'runtime'
$OutputRoot = Join-Path $BuilderRoot 'dist'
$AssetRoot = Join-Path $BuilderRoot 'assets'

function Invoke-Native([string]$File, [string[]]$Arguments, [string]$Failure) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Failure (exit $LASTEXITCODE)" }
}

function Reset-BuildDirectory([string]$Path) {
    $resolvedBuilder = [IO.Path]::GetFullPath($BuilderRoot).TrimEnd('\')
    $resolvedTarget = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if (-not $resolvedTarget.StartsWith($resolvedBuilder + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Guvenli olmayan temizleme hedefi: $resolvedTarget"
    }
    if (Test-Path -LiteralPath $resolvedTarget) {
        Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $resolvedTarget | Out-Null
}

if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot 'package.json'))) {
    throw "Z SCADA kaynak klasoru bulunamadi (package.json yok): $SourceRoot"
}
# Tek surum kaynagi package.json: kurucu dosya adi, Programlar listesi ve uygulamanin raporladigi surum ayni olmali.
# (Staging'e damgalamak yerine durdurmak secildi: depodaki kaynak ile yayinlanan kurulum hep ayni surumu soyler.)
$pkgVersion = [string]((Get-Content -LiteralPath (Join-Path $SourceRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version)
if ($pkgVersion -notmatch '^\d+\.\d+\.\d+$') { throw "package.json version X.Y.Z biciminde olmali: '$pkgVersion'" }
if (-not $Version) { $Version = $pkgVersion }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Surum X.Y.Z biciminde olmali (ornek 0.6.0): $Version" }
if ($Version -ne $pkgVersion) {
    throw "-Version $Version, package.json version $pkgVersion ile ayni degil. Once package.json'i guncelleyin (veya -Version vermeyin)."
}
Write-Output "Surum: $Version (package.json)"

# --- Araclar ----------------------------------------------------------------------------------------------
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$node = (Get-Command node.exe -ErrorAction Stop).Source
$isccCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe')
)
$iscc = $isccCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 bulunamadi. winget install JRSoftware.InnoSetup komutunu calistirin.' }

# Gomulu runtime = PATH'teki node.exe. Uretim bagimliliklari ayni node ile kurulur (yerel eklenti ABI'si tutarli kalir).
# Kurucu yalniz x64 kurar; node.exe de x64 olmali ve package.json "engines.node" alt sinirini karsilamali.
$nodeVer = (& $node -p 'process.version').Trim()
$nodeArch = (& $node -p 'process.arch').Trim()
$enginesMin = (& $node -p "((require(process.argv[1]).engines||{}).node||'').replace(/^>=\s*/,'')" (Join-Path $SourceRoot 'package.json')).Trim()
Write-Output "Node runtime: $node ($nodeVer, $nodeArch); engines.node >= $enginesMin"
if ($nodeArch -ne 'x64') { throw "node.exe x64 olmali (bulunan: $nodeArch)." }
if ($NodeVersion -and ($nodeVer.TrimStart('v') -ne $NodeVersion.TrimStart('v'))) {
    throw "node.exe surumu $nodeVer; -NodeVersion $NodeVersion istendi."
}
if ($enginesMin -match '^\d+\.\d+(\.\d+)?$') {
    if ([version]$nodeVer.TrimStart('v') -lt [version]$enginesMin) {
        throw "node.exe $nodeVer package.json engines.node (>=$enginesMin) kosulunu karsilamiyor."
    }
}

# --- Simgeler: tek kaynak uygulamanin kendi logosu (apps\web\public). assets\ uretilir, depoda tutulmaz. ---
New-Item -ItemType Directory -Force -Path $AssetRoot | Out-Null
$iconSource = Join-Path $SourceRoot 'apps\web\public'
foreach ($pair in @(@('favicon.ico', 'z-scada.ico'), @('icon-512.png', 'z-scada.png'))) {
    $from = Join-Path $iconSource $pair[0]
    if (-not (Test-Path -LiteralPath $from)) { throw "Uygulama simgesi bulunamadi: $from" }
    Copy-Item -LiteralPath $from -Destination (Join-Path $AssetRoot $pair[1]) -Force
}

# Tepsi baslaticisi (ZScada.exe): npm'den once derle ki hata erken gorunsun.
Write-Output '0/6 Tepsi baslaticisi (ZScada.exe) derleniyor...'
$launcherExe = Join-Path $BuilderRoot 'launcher\bin\ZScada.exe'
& (Join-Path $BuilderRoot 'launcher\build-launcher.ps1') -Output $launcherExe
if (-not (Test-Path -LiteralPath $launcherExe)) { throw "ZScada.exe derlenemedi: $launcherExe" }

Write-Output '1/6 Web arayuzu derleniyor...'
Push-Location $SourceRoot
try {
    # Taze klonda gelistirme bagimliliklari (vite, typescript) yoktur: once npm ci.
    if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot 'node_modules\.package-lock.json'))) {
        Invoke-Native $npm @('ci', '--no-audit', '--no-fund') 'Gelistirme bagimliliklari kurulamadi'
    }
    Invoke-Native $npm @('run', 'build') 'Z SCADA derlemesi basarisiz'
}
finally { Pop-Location }

Write-Output '2/6 Temiz staging klasoru hazirlaniyor...'
Reset-BuildDirectory $StageRoot
New-Item -ItemType Directory -Force -Path $StageApp, $StageRuntime, $OutputRoot | Out-Null

Write-Output '3/6 Uygulama dosyalari kopyalaniyor...'
# patches\: patch-package yamalari (npm ci --omit=dev postinstall'i uygular; ornek: opcua parola log maskesi).
$directories = @('apps\server', 'packages', 'dist\web', 'patches')
$paketDir = Join-Path $SourceRoot 'paket'
if ($IncludePaket) {
    if (Test-Path -LiteralPath $paketDir) { $directories += 'paket'; Write-Output '  paket\ kuruluma ekleniyor (-IncludePaket).' }
    else { Write-Output '  -IncludePaket verildi ama paket\ yok; yerlesik ornek proje kullanilacak.' }
}
foreach ($directory in $directories) {
    $source = Join-Path $SourceRoot $directory
    if (-not (Test-Path -LiteralPath $source)) { throw "Kaynak klasor yok: $source" }
    $target = Join-Path $StageApp $directory
    New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $StageApp 'scripts') | Out-Null
foreach ($script in @('hazirla.ts', 'nodered-guvenlik.ts', 'parola-sifirla.ts')) {
    Copy-Item -LiteralPath (Join-Path $SourceRoot "scripts\$script") -Destination (Join-Path $StageApp "scripts\$script") -Force
}
foreach ($file in @('package.json', 'package-lock.json', 'tsconfig.json')) {
    Copy-Item -LiteralPath (Join-Path $SourceRoot $file) -Destination (Join-Path $StageApp $file) -Force
}
# Lisans ve bildirimler: ikili dagitim lisans metnini ve ucuncu taraf bildirimlerini tasir (yoksa atlanir).
foreach ($file in @('LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.md')) {
    $from = Join-Path $SourceRoot $file
    if (Test-Path -LiteralPath $from) { Copy-Item -LiteralPath $from -Destination (Join-Path $StageRoot $file) -Force }
}
Copy-Item -LiteralPath $node -Destination (Join-Path $StageRuntime 'node.exe') -Force
$nodeLicense = Join-Path (Split-Path -Parent $node) 'LICENSE'
if (Test-Path -LiteralPath $nodeLicense) { Copy-Item -LiteralPath $nodeLicense -Destination (Join-Path $StageRuntime 'LICENSE') -Force }
Copy-Item -LiteralPath $launcherExe -Destination (Join-Path $StageRoot 'ZScada.exe') -Force
Copy-Item -LiteralPath (Join-Path $BuilderRoot 'payload\Varsayilan-Ayarlar.ps1') -Destination (Join-Path $StageRoot 'Varsayilan-Ayarlar.ps1') -Force
Copy-Item -LiteralPath (Join-Path $AssetRoot 'z-scada.ico') -Destination (Join-Path $StageRoot 'z-scada.ico') -Force
Copy-Item -LiteralPath (Join-Path $AssetRoot 'z-scada.png') -Destination (Join-Path $StageApp 'dist\web\z-scada.png') -Force
$webIndex = Join-Path $StageApp 'dist\web\index.html'
$indexHtml = [IO.File]::ReadAllText($webIndex)
# Web arayuzu kendi simgesini (logo.svg/favicon.ico/manifest) tasiyorsa enjekte etme; eski favicon yenisini ezmesin.
if ($indexHtml -notmatch 'z-scada\.png' -and $indexHtml -notmatch 'rel="icon"') {
    $head = '<link rel="icon" type="image/png" href="/z-scada.png"><meta name="theme-color" content="#0E151A">'
    [IO.File]::WriteAllText($webIndex, $indexHtml.Replace('</head>', "$head</head>"), (New-Object Text.UTF8Encoding($false)))
}

Write-Output '4/6 Uretim bagimliliklari yukleniyor...'
Push-Location $StageApp
try { Invoke-Native $npm @('ci', '--omit=dev', '--no-audit', '--no-fund') 'Uretim bagimliliklari kurulamadi' }
finally { Pop-Location }
# Yerel Node-RED paketi (BACnet): npm ci 'file:' bagimliligini node_modules'a junction olarak baglar. Kurulum paketi
# junction'a guvenmesin diye baglanti kaldirilip (yalniz baglanti; hedef silinmez) gercek klasor kopyalanir.
$localNodePkg = Join-Path $StageApp 'node_modules\node-red-zscada-bacnet'
if (Test-Path -LiteralPath $localNodePkg) {
    if ((Get-Item -LiteralPath $localNodePkg -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        [IO.Directory]::Delete($localNodePkg, $false)
        Copy-Item -LiteralPath (Join-Path $StageApp 'packages\node-red-zscada-bacnet') -Destination $localNodePkg -Recurse -Force
    }
}

Write-Output '5/6 Runtime dogrulaniyor...'
$stageNode = Join-Path $StageRuntime 'node.exe'
Push-Location $StageApp
try {
    # Surucu paletleri (SNMP: net-snmp, SQL: mssql, EtherNet/IP: ethernet-ip, BACnet: yerel node-red-zscada-bacnet ->
    # @innovation-system/node-bacnet dahil) + opcua parola yamasi (patches/node-red-contrib-opcua+*.patch) kurulu dosyada
    # uygulanmis mi; gelistirme bagimliligi (aedes: MQTT test broker'i) pakete girmemis mi; paket\ yalniz istenirse var mi.
    $expectPaket = if ($directories -contains 'paket') { 'true' } else { 'false' }
    $runtimeCheck = "const fs=require('fs'); require.resolve('tsx'); require.resolve('node-red'); for(const p of ['node-red-contrib-modbus','node-red-contrib-opcua','node-red-contrib-s7','node-red-contrib-ads-client','node-red-node-snmp','node-red-contrib-mssql-plus','node-red-contrib-cip-ethernet-ip','node-red-zscada-bacnet','patch-package']){ if(!fs.existsSync('node_modules/'+p+'/package.json')) throw Error(p+' yok') } if(fs.lstatSync('node_modules/node-red-zscada-bacnet').isSymbolicLink()) throw Error('node-red-zscada-bacnet hala baglanti (junction)'); for(const [d,p] of [['node-red-node-snmp','net-snmp'],['node-red-contrib-mssql-plus','mssql'],['node-red-contrib-cip-ethernet-ip','ethernet-ip'],['node-red-zscada-bacnet','@innovation-system/node-bacnet']]) require.resolve(p,{paths:[require('path').resolve('node_modules',d)]}); const ua=fs.readFileSync('node_modules/node-red-contrib-opcua/opcua/102-opcuaclient.js','utf8'); if(!ua.includes('function safeIdentity(') || ua.includes('userIdentity.password')) throw Error('node-red-contrib-opcua parola yamasi uygulanmamis'); if(fs.existsSync('node_modules/aedes')) throw Error('gelistirme bagimliligi aedes pakette'); if(fs.existsSync('paket')!==$expectPaket) throw Error('paket klasoru beklenmedik durumda'); console.log('Runtime OK')"
    Invoke-Native $stageNode @('-e', $runtimeCheck) 'Runtime dogrulamasi basarisiz'
}
finally { Pop-Location }

Write-Output '6/6 Tek EXE kurucu uretiliyor...'
Invoke-Native $iscc @("/DMyAppVersion=$Version", (Join-Path $BuilderRoot 'z-scada.iss')) 'Inno Setup derlemesi basarisiz'

$installer = Join-Path $OutputRoot "Z-SCADA-Kurulum-$Version.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw "Kurulum dosyasi bulunamadi: $installer" }
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $installer
Write-Output ''
Write-Output 'Kurulum hazir:'
Write-Output "  $installer"
Write-Output "  Boyut: $([math]::Round((Get-Item $installer).Length / 1MB, 1)) MB"
Write-Output "  SHA256: $($hash.Hash)"
Write-Output "  Node runtime: $nodeVer"
