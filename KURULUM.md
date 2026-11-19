# Z SCADA — başka bir bilgisayara kurulum

Endüstriyel PLC ve cihazlar için web tabanlı SCADA (Modbus TCP/RTU, Siemens S7, OPC UA, Beckhoff ADS, MQTT, SNMP, HTTP, SQL, BACnet/IP, EtherNet/IP). İki parçadan oluşur:

- **SCADA sunucusu + web arayüzü** (varsayılan port **3000**) — ekran tasarımı, operatör ekranı, komut doğrulama, kullanıcılar
- **Node-RED köprüsü** (varsayılan port **1880**) — PLC ve cihaz haberleşmesi

Node-RED bu paketin içindedir, ayrıca kurmanıza gerek yoktur.

---

## Gereksinimler

- Windows 10/11
- **Node.js 22 veya üstü** — https://nodejs.org (LTS sürümü)
  Winget varsa: `winget install OpenJS.NodeJS.LTS`
- Kurulum sırasında internet bağlantısı (paketler indirilir)
- PLC ile aynı ağa erişim

## Kurulum

1. Bu klasörü hedef bilgisayara kopyalayın (ör. `C:\Z-SCADA`).
2. Klasörde **PowerShell** açın (klasörde `Shift + sağ tık` → *PowerShell penceresini burada aç*).
3. Çalıştırın:

```powershell
.\kur.ps1
```

Betik sırayla: Node.js sürümünü doğrular → paketleri kurar → arayüzü derler → Node-RED ve SCADA'yı başlatır → yönetici hesabını oluşturur → paketteki projeyi yükler → PLC köprüsünü Node-RED'e uygular → Windows açılışına otomatik başlatma ekler → masaüstüne kısayol koyar.

Bitince tarayıcıdan: **http://localhost:3000**

**Giriş bilgileri** `.local\admin-access.json` dosyasına yazılır (parola kurulumda rastgele üretilir).

> PowerShell betik çalıştırmayı engellerse:
> `powershell -ExecutionPolicy Bypass -File .\kur.ps1`

## Günlük kullanım

| İşlem | Komut |
|---|---|
| Başlat | `.\baslat.ps1` |
| Durdur | `.\durdur.ps1` |
| Otomatik başlatmayı kaldır | `Unregister-ScheduledTask -TaskName "DVP SCADA" -Confirm:$false` (görev adı eski kurulumlarla uyumluluk için değişmedi) |
| Otomatik başlatmasız kur | `.\kur.ps1 -OtomatikBaslatma:$false` |

Windows açılıp kullanıcı oturum açtığında SCADA arka planda kendiliğinden başlar.

## Ayarlar

`ayarlar.ps1` dosyasını düzenleyin:

```powershell
$SCADA_PORT   = 3000        # web arayüzü portu
$NODERED_PORT = 1880        # Node-RED portu
$SCADA_HOST   = '127.0.0.1' # ağdan erişim için '0.0.0.0'
```

`$SCADA_HOST = '0.0.0.0'` yaparsanız arayüze ağdaki başka bilgisayarlardan da girilir. Bu durumda Windows Güvenlik Duvarında ilgili porta izin verin ve **yönetici parolasını değiştirin** — arayüz artık ağa açıktır.

## LAN yayını için güvenli dağıtım profili

Yerel HTTP geliştirmede varsayılanları koruyun: sunucu `127.0.0.1` üzerinde çalışır ve güvenli çerez zorlanmaz. `secure` çerez HTTP'de tarayıcı tarafından gönderilmez.

LAN erişimi için önerilen kurulum, TLS'i IIS, nginx veya Caddy gibi bir ters vekilde sonlandırmak ve SCADA sunucusunu yalnızca yerelde dinletmektir:

```powershell
# ayarlar.ps1
$SCADA_HOST = '127.0.0.1'

# SCADA işlemini başlatan ortamda
$env:SCADA_PROFILE = 'lan-tls'  # eşdeğeri: $env:SCADA_TLS = '1'
```

Ters vekil HTTPS isteğini `https://scada-sunucusu/` üzerinden alır ve yalnızca yerel `http://127.0.0.1:3000` adresine iletir. Dış ağdan doğrudan 3000 numaralı porta erişim açmayın. Güvenlik duvarında yalnız ters vekilin HTTPS dinleme portuna (genellikle TCP 443) gerekli kaynak ağlardan izin verin; SCADA ve Node-RED portlarını dışarı açmayın. Node-RED yönetim arayüzü ayrıca yalnızca loopback üzerinde kalmalıdır.

`SCADA_TLS=1` veya `SCADA_PROFILE=lan-tls` seçildiğinde uygulama oturum çerezini `Secure` niteliğiyle gönderir ve yanıtlara `Strict-Transport-Security: max-age=15552000` ekler. Bu profili, tarayıcıya gerçekten HTTPS sunan ters vekil veya doğrudan TLS olmadan etkinleştirmeyin. Sertifikayı güvenilen bir kurumsal CA veya uygun genel CA'dan sağlayın; bitiş tarihini izleyin ve yenilemenin ters vekilde kesintisiz uygulandığını düzenli olarak doğrulayın.

Oturum süresi `SCADA_SESSION_HOURS` ile ayarlanabilir. Geçerli aralık 1–168 saattir; ayarlanmazsa varsayılan 12 saattir.

```powershell
$env:SCADA_SESSION_HOURS = '12'
```

Uygulama, HTML yanıtlarında şu güvenlik politikalarını uygular: CSP içinde en az `default-src 'self'`, `frame-ancestors 'none'` ve `object-src 'none'`; ek olarak `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` ve `Referrer-Policy: no-referrer`. TLS profili HSTS'yi ekler. Bu başlıklar ters vekilde gevşetilmemeli veya kaldırılmamalıdır.

## PLC bağlantısı

Paket, kaynak bilgisayardaki ayarlarla gelir (paket yoksa örnek proje: `192.0.2.15:502`, Slave ID 1, M0–M2 → coil 2048–2050, Y0–Y2 → coil 1280–1282).

Hedef tesiste farklıysa arayüzden: **Cihazlar** → bağlantıyı/cihazı düzenleyin → **Haberlesmeye uygula**. Etiket adresleri **Etiketler** sayfasından değiştirilir.

Sistemin çalıştığını sol alttaki **"Haberleşme aktif"** yazısından ve operatör ekranındaki *"6 / 6 etiket güncel"* satırından anlarsınız.

> Delta DVP Ethernet modülü aynı anda tek Modbus isteği kaldırır. Köprü akışı bunu bilerek sıralı tarama ve veri yolu kilidiyle çalışır; Node-RED tarafına elle paralel okuma node'u eklemeyin.

## Klasör düzeni

| Yol | İçerik |
|---|---|
| `apps/server` | SCADA sunucusu (Fastify + SQLite + WebSocket) |
| `apps/web` | Web arayüzü (React + Vite) |
| `packages/contracts` | Ortak veri modeli ve doğrulama |
| `packages/symbols` | SCADA sembol kütüphanesi |
| `paket/` | Kuruluma gömülü proje (`project.json` + `uploads/`) |
| `.local/` | **Çalışma verisi** — veritabanı, giriş bilgileri, görseller, Node-RED userDir, loglar |
| `dist/web` | Derlenmiş arayüz |

## Yedekleme

Tüm canlı veri `.local\` altındadır. Yedeklemek için:

- Arayüzden **Proje ayarları → Veritabanı yedeği** (tutarlı SQLite kopyası, `.local` içine yazar)
- veya **Projeyi dışa aktar** ile `scada-project.json` indirin

Yeni bir pakete taşımak için kaynak bilgisayarda:

```powershell
npm run paketle
```

Bu komut o anki projeyi (cihazlar, etiketler, komutlar, ekranlar, kullanılan görseller) `paket\` klasörüne yazar; klasörü kopyaladığınız her yeni kurulum bu projeyle açılır.

## Sorun giderme

| Belirti | Bakılacak yer |
|---|---|
| Arayüz açılmıyor | `.local\server.log`, `.local\server-error.log` |
| PLC verisi gelmiyor | `.local\node-red.log`; Node-RED arayüzü `http://localhost:1880` |
| "PLC bağlantısı bekleniyor" | Cihaz IP/port/Slave ID; PLC'ye `ping`; güvenlik duvarı |
| Komut butonları pasif | Kayıtlı yapılandırma uygulanmamış → **Cihazlar → Haberlesmeye uygula** |
| Port dolu | `ayarlar.ps1` içinde portu değiştirin |

### Parola unutulduysa

Veritabanını silmeyin. Yerel makineden kontrollü sıfırlama yapın — proje verisine dokunmaz:

```powershell
npx tsx scripts/parola-sifirla.ts                  # kullanıcıları listeler
npx tsx scripts/parola-sifirla.ts admin            # rastgele yeni parola üretir
npx tsx scripts/parola-sifirla.ts admin <parola>   # parolayı siz belirlersiniz
```

Parola değişince o kullanıcının açık oturumları kapanır. Ekranlar, cihazlar ve kayıtlar korunur.

Yönetici arayüzünden de yapılabilir: **Proje ayarları → Kullanıcılar** bölümünde rol değiştirme, parola sıfırlama, oturum kapatma ve hesabı devre dışı bırakma vardır. Son etkin yönetici devre dışı bırakılamaz.

### Node-RED yönetim erişimi

Node-RED yönetim arayüzü yalnızca **127.0.0.1** üzerinden ve parola ile açılır. Ayarlar `.local\node-red\settings.js` içinde üretilir, kimlik bilgisi `.local\nodered-admin.json` dosyasındadır (dosya izinleri daraltılır).

```powershell
npx tsx scripts/nodered-guvenlik.ts            # ayarları üretir/onarır
npx tsx scripts/nodered-guvenlik.ts --yenile   # yönetim parolasını döndürür
```

SCADA sunucusu köprüyü uygulamadan önce yönetim yüzeyinin gerçekten kimlik doğrulaması istediğini kontrol eder; korumasızsa uygulama reddedilir.

## Yedeklilik: aktif / pasif sunucu (RTO ve RPO)

Z SCADA aynı veri klasörüne bağlanan **tek bir yazıcı** garanti eder. İkinci bir sunucu
başlatılırsa kendiliğinden **pasif (yedek)** moda düşer: ekranları gösterir, komut kabul
etmez ve Node-RED köprüsüne uygulama yapmaz. Arayüzde bunu söyleyen bir uyarı bandı çıkar.

- **Sahiplik kirası:** aktif sunucu kirayı sürekli yeniler. Kira bayatlarsa (varsayılan
  10 sn, `SCADA_LEASE_MS`) yedek sunucu devralır ve `epoch` bir artar. Eski sunucu geri
  gelirse epoch'unun geçtiğini görür ve yazmayı bırakır (fencing) — çift yazıcı oluşmaz.
- **RTO (hizmete dönüş):** kira süresi + köprünün yeniden uygulanma süresi. Varsayılan
  ayarlarla tipik olarak 10–30 saniye.
- **RPO (veri kaybı):** sıfır. SQLite WAL diske yazıldığı için devralan sunucu son kaydı
  görür. **Bekleyen komutlar devralınmaz**: sonucu belirsiz kalan işlemler `uncertain`
  olarak kapatılır, failover'da otomatik tekrar oynatılmaz.
- **Ortam değişkenleri:** `SCADA_INSTANCE` (sunucu adı), `SCADA_LEASE_MS` (kira süresi).
- **Durum:** `GET /api/cluster` rol, epoch ve aktif sunucu adını döner; `GET /api/ready`
  içindeki `ownership` kontrolü de aynı bilgiyi taşır.

> Veritabanını ağ paylaşımına (SMB/NFS) koyarak yedeklilik kurmayın: SQLite kilitleri
> ağ paylaşımlarında güvenilir değildir. Yedek sunucu, verinin kopyalandığı **yerel** bir
> diskle çalışmalı; kopyalama için `POST /api/backup` ile alınan tutarlı yedeği kullanın.
