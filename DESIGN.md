---
name: Z SCADA
description: Yerel web SCADA — sakin gri yüzey, renk yalnız durum ve alarm için
colors:
  app-bg: "#f2f3f5"
  card: "#ffffff"
  sunken: "#f7f8f9"
  chip: "#eceef1"
  line: "#e3e5e9"
  line-strong: "#d4d7dc"
  text: "#1d2126"
  text-soft: "#555c65"
  text-muted: "#6b727b"
  text-faint: "#9aa0a8"
  steel: "#3d566e"
  steel-deep: "#2f4458"
  steel-soft: "#edf1f5"
  warn-bg: "#fff8e7"
  warn-line: "#bd9c51"
  warn-text: "#9b7d37"
  danger: "#b4533f"
  run: "#16804a"
  sym-body: "#f6f7f8"
  sym-idle: "#9ba1a9"
  sym-unknown: "#b9bec5"
  sym-alarm: "#c8593f"
typography:
  headline:
    fontFamily: "Manrope, 'Segoe UI', system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
  body:
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  label:
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  mono:
    fontFamily: "Consolas, monospace"
    fontSize: "12px"
rounded:
  none: "0px"
  xs: "4px"
  sm: "6px"
  md: "7px"
  lg: "8px"
components:
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
    height: "34px"
  panel-tile:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
---

# Design System: Z SCADA

> **Kaynak gerçeği:** token'ların normatif değeri `apps/web/src/style.css` (`:root` açık,
> `[data-theme=dark]` koyu) ve `apps/web/src/panel.css`. Bu dosya onları özetler; çelişkide kod
> kazanır ve bu dosya güncellenir. Koyu tema değerleri yalnız kodda tutulur.

## HMI istisnası — skill önerilerinden önce gelir

Bu proje bir operatör ekranıdır. impeccable, web-design-guidelines veya başka bir tasarım
skill'i bir şey önerdiğinde, önerinin bu bölümle çelişen kısmı uygulanmaz. **Çelişkide ISA-101
kazanır.**

- Zemin nötr/gri. Renk **yalnız durum ve alarm** anlamı taşır; dekoratif aksan yok.
- Alarm renkleri (kırmızı `sym-alarm`/`danger`, sarı `warn-*`) başka hiçbir amaçla kullanılmaz:
  marka, vurgu, grafik serisi veya süs için değil.
- Animasyon yalnız durum değişimini gösterir (RUN ikonu dönmesi, sekme geçişi, açılır panel).
  Süsleme, parıltı, gradyan, "hover-lift" kartlar yok. İstisna: Panelim kutusunda kullanıcının
  istediği hafif büyüme + gölge hover'ı.
- impeccable'da **Operate modu** geçerlidir. `bolder`, `delight`, `overdrive`, `colorize`
  komutları bu projede kullanılmaz. `audit`, `critique`, `polish`, `distill`, `quieter`,
  `harden`, `clarify`, `layout`, `typeset`, `adapt` uygundur.
- `frontend-design` bu projeye kurulmaz.
- Bu dosyadaki kararlar tasarım skill önerilerinden önce gelir.

## Overview

**Creative North Star: "Sessiz Kontrol Odası"**

Yüzey sakin ve gri; göz yalnız anormalliğe gider. Normal çalışan bir hat ekranda neredeyse
renksizdir. Renk göründüğünde bir şey söylüyor demektir: alarm, uyarı, bayat veri veya çalışan
ekipman. Tek aksan olan donuk çelik mavisi (`steel`) yalnız etkileşimi gösterir: seçim, odak,
birincil eylem.

Yoğunluk bilgi yoğun ama dağınık değil: 12–13 px etiket ve tablo metni, tabular rakamlar, ince
çizgiyle ayrılmış düz kartlar. Açıklama metni yüzeyde durmaz; ⓘ balonuna veya katlanır ipucuna
girer. Filtreler sütun başlığında durur ve arama sırasında sayfa yerinden oynamaz.

**Key Characteristics:**
- Nötr gri zemin, beyaz kart, tek çelik mavisi etkileşim rengi.
- Durum renkleri anlam kodu olarak kullanılır, dekor olarak değil; durum her zaman metinle de yazılır.
- Düz yüzey; derinlik çizgi ve ton farkıyla verilir.
- Açık + koyu tema, ikisi de birinci sınıf.
- Tamamen çevrimdışı: fontlar `@fontsource` ile paketli, dış CDN yok.

## Colors

Kurumsal nötr gri skalası ve tek donuk çelik mavisi; geri kalan her renk bir durum kodudur.

### Primary
- **Donuk Çelik Mavisi** (#3d566e, derin #2f4458, yumuşak #edf1f5): odak halkası, seçili öğe,
  birincil düğme, aktif sekme göstergesi. Durum anlamı taşımaz.

### Neutral
- **Tesis Grisi** (#f2f3f5): uygulama zemini.
- **Kart Beyazı** (#ffffff) / **Gömük** (#f7f8f9): kart ve içe gömülü alan.
- **Çizgi** (#e3e5e9) / **Güçlü Çizgi** (#d4d7dc): ayırıcı ve alan kenarı.
- **Metin** (#1d2126) → yumuşak (#555c65) → sönük (#6b727b) → silik (#9aa0a8): dört kademe hiyerarşi.

### Durum kodları (yalnız anlam için)
- **Çalışıyor** (`run` #16804a): dijital RUN, çalışan ekipman.
- **Uyarı** (`warn-*` #bd9c51 / #9b7d37 / #fff8e7): uyarı önemli alarm, dikkat.
- **Alarm / Tehlike** (`sym-alarm` #c8593f, `danger` #b4533f): alarm, hata, yıkıcı eylem.
- **Boşta / Bilinmeyen** (`sym-idle` #9ba1a9, `sym-unknown` #b9bec5): pasif, veri yok, bayat.

### Named Rules
**Anlamsız Renk Yok Kuralı.** Ekrana eklenen her renkli piksel bir durumu anlatmalı. Anlatmıyorsa
gri olur.

**Alarm Kırmızısı Rezervdir Kuralı.** `sym-alarm`/`danger` tonları yalnız alarm, hata ve yıkıcı
onay için kullanılır. Grafik serisi, rozet süsü veya marka rengi olmaz.

**Renk Tek Başına Konuşmaz Kuralı.** Her durum rengi metin (ÇALIŞIYOR / DURUYOR / Veri yok / bayat)
veya sol durum çizgisiyle birlikte gelir.

## Typography

**Başlık Fontu:** Manrope 600/700/800 (Segoe UI, system-ui yedek)
**Gövde Fontu:** DM Sans 400/500/600/700 (Segoe UI, system-ui yedek)
**Mono:** Consolas: adres, etiket kodu, ham değer

**Karakter:** Manrope başlıklara sıkı ve teknik bir ses verir, DM Sans yoğun tabloda okunaklı
kalır. Tüm rakamlar `tabular-nums`: canlı değer değişirken genişlik oynamaz.

### Hierarchy
- **Headline** (Manrope 700, 24px): sayfa başlığı.
- **Body** (DM Sans 400, 15px kök): genel metin.
- **Table/UI** (DM Sans, 13px): tablo hücresi, form alanı, düğme. En sık kullanılan boyut.
- **Label** (DM Sans 500, 11–12px): sütun başlığı, rozet, yardımcı etiket.
- **Pano değeri**: Panelim ve operatör ekranında punto kutuya sığacak şekilde ölçeklenir.

## Layout

- Daraltılabilir sol kenar çubuğu (`Ctrl+B`), sağda içerik.
- ≤1280 px'te Stüdyo paleti ve özellik paneli çekmeceye dönüşür; 1024×768 desteklenir.
- Operatör ekranı ve Panelim sabit tuvalde çizilir, pencereye ölçeklenir; tam ekranda ortak
  `scada-fullscreen-scale` anahtarı kullanılır.
- `html{scrollbar-gutter:stable}`: filtre veya arama sırasında içerik yatay olarak kaymaz.
  Açılır filtre paneli açıkken tablo yüksekliği kilitlenir.
- Tablet/telefonda dokunma alanı ≥44 px.

## Elevation & Depth

Düz sistem. Derinlik ton farkı (zemin → kart → gömük) ve 1 px çizgiyle verilir. Gölge durağan
yüzeyde yok ya da çok hafif (`0 1px 2px #00000012`). Belirgin gölge yalnız duruma tepki olarak
görünür: açılır panel, hover'daki Panelim kutusu, seçili alarm sembolü.

### Named Rules
**Varsayılan Düz Kuralı.** Durağan yüzey düzdür. Gölge bir etkileşime veya duruma cevap verir.

**Durum Çizgisi Kuralı.** Kart üzerindeki durum, sol kenarda 4 px iç çizgiyle gösterilir
(`inset 4px 0 0 var(--panel-good|--panel-warn|--danger)`). Kart zemini boyanmaz.

## Shapes

- Form alanı ve düğme 6–8 px yumuşak köşe; küçük öğe 4 px.
- **Panelim kutuları köşeli (0 px) ve yapışık** (aralık 0, durum çerçevesi içten). Bu, kullanıcının
  açık tercihidir; diğer kartlara taşınmaz.
- Lamba, gösterge noktası: tam daire.

## Components

### Inputs / Fields
- **Style:** 1 px `line-strong` kenar, kart zemini, 7 px köşe, min 34 px yükseklik, 13 px metin.
- **Focus:** kenar çelik mavisine döner + 3 px `steel-soft` halka. Klavye odağında 3 px çelik
  mavisi dış çizgi, 3 px ofset.
- **Disabled:** %45 opaklık, `not-allowed` imleci.

### Tablo filtreleri
- Filtre, sütun başlığının yanındaki küçük ikondan açılan paneldir. Ayrı çip çubuğu veya filtre
  kartı yok.
- Sayaçlar diğer filtreler uygulanmış kümeden gelir. Arama VE mantığıyla çalışır, Türkçe harf
  duyarsızdır, `*` joker kabul eder.

### Sekmeler (`.page-tabs`)
- Kayan alt gösterge, yöne duyarlı panel geçişi (`--motion-slow`, `--ease`). Ok/Home/End ile
  klavye gezinmesi. Reduced-motion'da animasyon kapalı.

### Açıklama: InfoTip / Hint
- Sayfa ve bölüm açıklaması paragraf olarak durmaz; ⓘ balonuna (`InfoTip`) girer. Uzun sahada-lazım
  bilgi silinmez, katlanır (`Hint`).

### Panelim kutusu (imza bileşeni)
- Analog: büyük değer + birim. Dijital: lamba + RUN/STOP metni (kutu bazında özelleştirilebilir).
- Bayat, veri yok veya okuma hatası durumunda RUN/STOP **gösterilmez**; durum metni yazar.
- Durum sol kenarda 4 px çizgi (`--state`): RUN yeşil, STOP gri, bayat/veri yok sarı, hata kırmızı.
  Zemin yalnız hata durumunda boyanır; RUN'da zemin ve lamba halkası boyanmaz.
- Kart rengi (8 hazır + serbest) yalnız 4 px üst şerittir, zemini boyamaz. 18 minik ikon; dijitalde
  RUN iken ikon hareket eder, STOP'ta söner.
- Hover: `scale(1.02)` + gölge. `.panel-sizer` `overflow:clip` taşır; kaldırılırsa tam ekranda
  kenar kutusu viewport'u taşırıp kaydırma çubuğu–ölçek döngüsüyle titretir.

### Sembol hareketi ve stili (`apps/web/src/motion.css`)
- Hareket yalnız durumu anlatır: rotor yumuşak kalkar (kalkış bitiş hızı = dönüş hızı), durum renkleri
  0.35 sn geçer, seviye 0.6 sn kayar. Süs animasyonu eklenmez.
- Ekran "Sembol stili": **Klasik** (nesne renkleri), **ISA-101** (gri, renk yalnız anormalde),
  **Detaylı** (Klasik renkleri + metalik gövde degradesi + hafif gölge). Operatör ekranında durum
  okunurluğu öncelikliyse ISA-101 seçilir.

### Hareket
- Yalnız üç süre ve tek eğri: `--motion-fast` .15s, `--motion` .22s, `--motion-slow` .3s,
  `--ease` cubic-bezier(.4,0,.2,1), ortak `pop-in`. Yeni öğe kendi süresini veya eğrisini icat etmez.

## Do's and Don'ts

### Do:
- **Do** yeni renk gerekince önce mevcut token'a bak (`--acc*`, `--warn-*`, `--danger`, `--sym-*`, `--run`).
- **Do** her durumu renk + metin/çizgiyle birlikte ver.
- **Do** açık ve koyu temayı birlikte doğrula; arayüz değişikliğini ekran görüntüsüyle kanıtla
  (1440 / 1024 / koyu / tam ekran).
- **Do** sayfa açıklamasını ⓘ balonuna koy, filtreyi sütun başlığına koy.

### Don't:
- **Don't** dekoratif renk, gradyan, parıltı, cam efekti veya renkli kart zemini ekleme.
- **Don't** alarm kırmızısını veya uyarı sarısını durum dışı bir amaçla kullan.
- **Don't** filtre, arama veya veri gelişi sırasında sayfa yüksekliğini veya konumunu zıplat.
- **Don't** dış font, CDN veya uzak görsel ekle. Uygulama çevrimdışı çalışır.
- **Don't** bayat veya hatalı veriyi normal durum gibi göster.
- **Don't** kullanıcının vermediği görseli (fotoğraf, şema) ekrana veya belgeye koy.
