# Z SCADA Windows kurucusu

Bu klasör, Z SCADA kaynak ağacından hedef bilgisayarda Node.js veya npm gerektirmeyen tek bir
Windows kurulum dosyası (`Z-SCADA-Kurulum-<sürüm>.exe`, Inno Setup 6) üretir. Kurucu deponun
kendi kaynağından derlenir; kuruluma özel bir proje veya saha verisi girmez.

## Gereksinimler (derleme makinesi)

| Araç | Neden | Not |
|---|---|---|
| Windows 10/11 x64, PowerShell 5.1+ | betikler | |
| [Inno Setup 6](https://jrsoftware.org/isinfo.php) | `ISCC.exe` kurucuyu derler | `winget install JRSoftware.InnoSetup`. `build.ps1` sırayla `%LOCALAPPDATA%\Programs\Inno Setup 6`, `%ProgramFiles%\Inno Setup 6` ve `%ProgramFiles(x86)%\Inno Setup 6` altında `ISCC.exe` arar. |
| .NET Framework 4.x `csc.exe` | tepsi/servis başlatıcısı `launcher\ZScada.cs` (C# 5) | Windows ile gelir: `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe` (yoksa `Framework\`). Ayrı SDK gerekmez. |
| Node.js x64, `package.json` `engines.node` alt sınırı veya üstü (şu an 22.5+; geliştirme ve sınama Node 24 LTS ile) | web arayüzünü derler, bağımlılıkları kurar **ve kuruluma gömülür** | Bkz. "Gömülü Node.js". |
| İnternet erişimi | `npm ci` bağımlılıkları npm kayıt deposundan indirir | |

### Gömülü Node.js

Kurucuya giden `runtime\node.exe`, derleme makinesinde `PATH` üzerinde bulunan `node.exe`'nin
birebir kopyasıdır (yanında `LICENSE` varsa o da kopyalanır). Üretim bağımlılıkları aynı `node`
ile kurulduğundan yerel eklentilerin ABI'si gömülü runtime ile tutarlıdır. `build.ps1`:

- `node.exe`'nin x64 olduğunu ve `package.json` `engines.node` alt sınırını karşıladığını denetler,
  sürümü derleme çıktısına yazar;
- `-NodeVersion <x.y.z>` verilirse `PATH`'teki node tam olarak bu sürüm değilse durur
  (yayın derlemelerini sabitlemek için önerilir).

Yayın derlemesi için nodejs.org'un resmî Windows x64 LTS kurulumunu kullanın ve kullanılan
sürümü sürüm notlarına yazın.

## Derleme

Deponun kökünde, temiz bir klonda:

```powershell
powershell -ExecutionPolicy Bypass -File .\installer\build.ps1 -Version 0.5.0
# isteğe bağlı: -NodeVersion 24.11.1   (gömülü node sürümünü sabitler)
```

`build.ps1` varsayılan olarak kendi bir üst klasörünü (`<repo>`) kaynak alır (`-SourceRoot` ile
değiştirilebilir). Süre: ilk derlemede ~10 dakika. Adımlar:

1. Simgeler `apps\web\public\favicon.ico` ve `icon-512.png`'den `installer\assets\z-scada.ico/png`
   olarak kopyalanır (üretilen dosyalar, depoda tutulmaz).
2. `launcher\bin\ZScada.exe` `csc.exe` ile derlenir.
3. `node_modules` yoksa `npm ci`, ardından `npm run build` (web arayüzü → `dist\web`).
4. `installer\_staging\` hazırlanır: `apps\server`, `packages`, `dist\web`, `patches`, gereken
   betikler, `package.json`/`package-lock.json`/`tsconfig.json`, `LICENSE`, `NOTICE`,
   `THIRD-PARTY-NOTICES.md`, `runtime\node.exe`, `ZScada.exe`, varsayılan ayar dosyası.
5. `npm ci --omit=dev` (postinstall `patch-package` yamalarını uygular); yerel BACnet Node-RED
   paketi junction yerine gerçek klasör olarak kopyalanır.
6. Runtime doğrulaması: tüm protokol paletleri kurulu, OPC UA parola log yaması uygulanmış,
   geliştirme bağımlılıkları (ör. `aedes`) ve `paket\` yok.
7. `ISCC` → `installer\dist\Z-SCADA-Kurulum-<sürüm>.exe`; boyut ve SHA-256 yazdırılır.

`installer\_staging\`, `installer\dist\`, `installer\assets\` ve `installer\launcher\bin\`
derleme çıktısıdır ve `.gitignore` ile dışarıda tutulur.

`-IncludePaket`: depoda `paket\project.json` (+ `paket\uploads\`) varsa kuruluma gömer; ilk
açılışta içe aktarılır. Varsayılan olarak kullanılmaz: kurulum uygulamanın yerleşik örnek
projesiyle başlar.

## Kurulumun yaptığı

- **Yönetici kurulumu**, program klasörü `C:\Program Files\Z SCADA`.
- **Windows servisi** `ZScada` (hesap `NT SERVICE\ZScada`, gecikmeli otomatik başlatma, çökerse
  yeniden başlatma). Tepsi simgesi (`ZScada.exe`) servisi izler, başlatır ve durdurur.
- **Veri:** `C:\ProgramData\DVP-SCADA\data` (ACL: SYSTEM ve Administrators tam, servis hesabı
  değiştirir, Users yalnız ayar dosyasını okur; sır dosyaları yalnız servis/Administrators/SYSTEM).
- **Adres:** SCADA `http://localhost:4730`, Node-RED köprüsü `127.0.0.1:4731` (yalnız yerel).
  Port doluysa sıradaki boş porta geçilir ve veri klasöründeki `ayarlar.ps1`'e yazılır.
- **İlk yönetici:** kullanıcı adı `admin`; rastgele parola ilk açılışta
  `C:\ProgramData\DVP-SCADA\data\admin-access.json` dosyasına yazılır (yalnız yöneticiler
  okuyabilir). İlk girişten sonra parolayı değiştirin ve dosyayı silin.
- Cihazlar pasif, ekranlar taslak başlar; kurulum PLC'ye komut göndermez.
- Her servis adımı `C:\Program Files\Z SCADA\kurulum.log`'a yazılır.
- **Kaldırma:** Ayarlar → Uygulamalar → Z SCADA → Kaldır (veya Başlat menüsü → "Z SCADA'yi
  Kaldir"). Servis durdurulup silinir; veri klasörünün silinmesi sorulur, varsayılan olarak korunur.

## Yükseltme uyumluluğu (değiştirmeyin)

Ürünün önceki adı "DVP SCADA" idi. Aşağıdakiler mevcut kurulumların yerinde güncellenmesi için
eski adla korunur (her biri kaynakta `YUKSELTME UYUMLULUGU` yorumuyla işaretlidir):

| Öğe | Değer | Neden |
|---|---|---|
| Inno Setup `AppId` | `{B83EA00E-76D8-43C1-9902-3EDB71FB2F4B}` | aynı ürün olarak tanınıp yerinde güncellenir |
| Veri yolu | `%ProgramData%\DVP-SCADA\data` | mevcut ekranlar, kullanıcılar ve geçmiş burada |
| Eski kullanıcı başına veri | `%LOCALAPPDATA%\DVP-SCADA\data` | yalnız ilk yükseltmede taşıma kaynağı |
| Servis adı | `ZScada` | yeni ad ikinci bir servis kurar |
| Eski kaldırma anahtarı | `HKCU\...\Uninstall\{AppId}_is1` | 0.1.x/0.2.0 kullanıcı başına kurulumu sessizce kaldırmak için |
| Eski kısayollar | `DVP SCADA.lnk` | eski adla kalan kısayolları silmek için |

## Dosyalar

| Dosya | İçerik |
|---|---|
| `build.ps1` | derleme betiği |
| `z-scada.iss` | Inno Setup betiği (servis, ACL, yükseltme, kaldırma) |
| `launcher\ZScada.cs`, `launcher\build-launcher.ps1` | tepsi + Windows servisi başlatıcısı ve derleyicisi |
| `payload\Varsayilan-Ayarlar.ps1` | ilk kurulumda veri klasörüne kopyalanan port/adres ayarları |

## Lisans

GPL-3.0-or-later (depo kökündeki `LICENSE`). Kurulum dosyası Z SCADA'yı, npm bağımlılıklarını
(kendi lisanslarıyla; `THIRD-PARTY-NOTICES.md`) ve Node.js runtime'ını (Node.js lisansı) içerir;
kaynak bu depodadır.
