// Panelim saf mantığı (CSS'siz, testten import edilir).
import type { Live, Preferences } from '../../../packages/contracts/model';

export const PANEL_WIDTH = 1600;
export const TILE_H = 190;

export type Tile = Preferences['dashboard'][number];

/**
 * Kutular aralıksız (yapışık) dizilir. `fillHeight` verilirse (tam ekran, Sığdır)
 * kutular o yüksekliği dolduracak kadar uzar.
 */
export function panelLayout(count: number, columns: number, fillHeight?: number) {
 // Eksik/bozuk ayar (eski sunucu, elle düzenlenmiş kayıt) ızgarayı NaN'a düşürmesin.
 const cols = Number.isFinite(columns) ? Math.max(2, Math.min(6, Math.round(columns))) : 4,
  tileW = PANEL_WIDTH / cols,
  rows = Math.max(1, Math.ceil(count / cols)),
  tileH = fillHeight ? Math.max(TILE_H, fillHeight / rows) : TILE_H;
 return { cols, tileW, tileH, rows, height: rows * tileH };
}
export const tilePosition = (i: number, l: ReturnType<typeof panelLayout>) => ({
 left: (i % l.cols) * l.tileW,
 top: Math.floor(i / l.cols) * l.tileH,
 width: l.tileW,
 height: l.tileH,
});

/** Okuma yazısı kutuya sığsın: genişliğe ve yüksekliğe göre punto (tuval pikseli). */
export function readingFontSize(text: string, tileW: number, tileH: number, lamp: boolean, unit: string) {
 if (text === '—') return 56;
 const room = tileW - 44 - (lamp ? 52 : 0) - (unit ? unit.length * 14 + 16 : 0);
 // Kalın yazıda em başına yaklaşık genişlik: rakam/nokta dar, büyük harf geniş.
 const ems = [...text].reduce((w, ch) => w + (/[0-9.,\-+ ]/.test(ch) ? 0.6 : /[A-ZÇĞİÖŞÜ]/.test(ch) ? 0.78 : 0.62), 0);
 return Math.round(Math.max(22, Math.min(tileH * 0.36, room / Math.max(0.6, ems))));
}

/** Kutucuk okuması. Güncel olmayan veri asla RUN/STOP ya da sayı gibi gösterilmez. */
export function tileReading(tile: Tile, sample: Live['samples'][string] | undefined, dataType: string | undefined) {
 const q = sample?.quality || 'unknown',
  v = sample?.value;
 if (q !== 'good' || v === null || v === undefined)
  return { state: q === 'bad' ? 'bad' : q === 'stale' ? 'stale' : 'unknown', text: '—', note: q === 'bad' ? 'Okuma hatası' : q === 'stale' ? 'Veri bayat' : 'Veri yok' } as const;
 if (typeof v === 'boolean' || dataType === 'bool') {
  const on = v === true || v === 1;
  return { state: on ? 'run' : 'stop', text: on ? tile.onText || 'RUN' : tile.offText || 'STOP', note: '' } as const;
 }
 return { state: 'value', text: Number(v).toFixed(tile.decimals), note: '' } as const;
}


export type PanelPage = Preferences['panelPages'][number];

/** Sayfalar; hiç sayfa yoksa eski tek panel "Genel" sayfası olarak gelir (veri kaybı yok). */
export function panelPagesOf(prefs: Preferences): PanelPage[] {
 if (prefs.panelPages?.length) return prefs.panelPages;
 const columns = Number.isFinite(prefs.panelColumns) ? prefs.panelColumns : 4;
 return [{ id: 'genel', name: 'Genel', columns, tiles: prefs.dashboard || [] }];
}
/**
 * Sayfaları kaydeder. Eski `dashboard` alanı boşaltılmaz, ilk sayfanın kopyasını taşır:
 * sayfaları tanımayan (eski) sunucu `panelPages`'i atsa bile kutular kaybolmaz.
 * Okurken `panelPages` doluysa `dashboard` yok sayılır, çift gösterim olmaz.
 */
export function withPages(prefs: Preferences, pages: PanelPage[]): Preferences {
 return { ...prefs, panelPages: pages, dashboard: pages[0]?.tiles ?? [], panelColumns: pages[0]?.columns ?? prefs.panelColumns };
}
export function newPageId(pages: PanelPage[]) {
 let n = pages.length + 1;
 while (pages.some((p) => p.id === 'sayfa-' + n)) n++;
 return 'sayfa-' + n;
}

/** Geçen süre kısa yazımı: "12 sn", "27 dk", "3 sa", "2 gün". */
export function ageText(ms: number) {
 const s = Math.max(0, Math.round(ms / 1000));
 if (s < 60) return s + ' sn';
 const m = Math.floor(s / 60);
 if (m < 60) return m + ' dk';
 const h = Math.floor(m / 60);
 return h < 24 ? h + ' sa' : Math.floor(h / 24) + ' gün';
}

/**
 * Kutu alt satırı: güncel veride "Güncel", bayat veride son verinin yaşı, diğer sorunlarda yalnız neden.
 * Okuma hatasında `receivedAt` son denemenin zamanıdır, hatanın ne kadardır sürdüğü değil: süre yazılmaz.
 */
export function tileFooter(r: ReturnType<typeof tileReading>, sample: Live['samples'][string] | undefined, now: number) {
 const at = sample?.receivedAt || 0;
 if (r.state === 'run' || r.state === 'stop' || r.state === 'value') return 'Güncel';
 return r.state === 'stale' && at > 0 ? r.note + ' · ' + ageText(now - at) : r.note;
}

/** Sayfa başlığındaki durum özeti: kaç kutu çalışıyor, duruyor, hatalı, bayat, veri yok, değer. */
export function panelSummary(states: ReturnType<typeof tileReading>['state'][]) {
 const c = { run: 0, stop: 0, bad: 0, stale: 0, unknown: 0, value: 0 };
 for (const s of states) c[s]++;
 return c;
}
