import React, { useEffect, useRef, useState } from 'react';
import { Ban, ChevronLeft, ChevronRight, Maximize2, Minimize2, Plus, Trash2 } from 'lucide-react';
import type { Config, Live, Preferences } from '../../../packages/contracts/model';
import './panel.css';
import { SearchSelect } from './SearchSelect';
import { PANEL_WIDTH, newPageId, panelLayout, panelPagesOf, panelSummary, readingFontSize, tileFooter, tilePosition, tileReading, withPages, type PanelPage, type Tile } from './panelModel';
import './tabs.css';
import { panelColors, panelIcons } from './panelIcons';

/**
 * Panelim: operatörün seçtiği etiketlerden oluşan kutucuk ızgarası.
 * SCADA ekranı gibi sabit boyutlu bir tuvalde çizilir ve pencereye ölçeklenir; tam ekranda
 * operatör ekranıyla aynı ölçek ayarını (scada-fullscreen-scale) paylaşır.
 */
const SCALE_KEY = 'scada-fullscreen-scale',
 PAGE_KEY = 'dvp.panel.page';

function readScale() {
 try {
  const n = Number(localStorage.getItem(SCALE_KEY));
  return n >= 0.2 && n <= 4 ? n : null;
 } catch {
  return null;
 }
}

export function Panel({ prefs, config, live, onSave }: { prefs: Preferences; config: Config; live: Live; onSave: (next: Preferences) => void }) {
 const host = useRef<HTMLDivElement>(null),
  viewport = useRef<HTMLDivElement>(null);
 // Düzenleme taslak üzerinde yapılır; "Bitti" tek seferde kaydeder, her tuşta sunucuya gitmez.
 const [draft, setDraft] = useState<PanelPage[] | null>(null),
  [pageId, setPageIdState] = useState(() => {
   try {
    return localStorage.getItem(PAGE_KEY) || '';
   } catch {
    return '';
   }
  }),
  [tabDir, setTabDir] = useState<'next' | 'prev'>('next'),
  [confirmDelete, setConfirmDelete] = useState(false),

  [full, setFull] = useState(false),
  [fullScale, setFullScale] = useState<number | null>(readScale),
  [zoom, setZoom] = useState(1),
  [fillH, setFillH] = useState<number | undefined>(undefined),
  [sel, setSel] = useState(-1);
 const editing = draft !== null,
  pages = draft ?? panelPagesOf(prefs),
  page = pages.find((p) => p.id === pageId) ?? pages[0],
  tiles = page.tiles,
  current = editing && sel >= 0 && sel < tiles.length ? tiles[sel] : null,
  currentTag = current ? config.tags.find((t) => t.id === current.tagId) : undefined;
 /* Pano (kiosk) modu (2026-09-25): duvar monitoru. Tarayici tam ekrani kullanici dokunusu ister;
  * bu yuzden uygulama ici tam sayfa duzeni (fullLike) + ilk dokunusta gercek tam ekran. */
 const kiosk = prefs.kiosk.enabled && !editing,
  fullLike = full || kiosk;
 const layout = panelLayout(tiles.length, page.columns, fillH);
 function setPageId(id: string) {
  const ids = pages.map((p) => p.id);
  setTabDir(ids.indexOf(id) < ids.indexOf(page.id) ? 'prev' : 'next');
  setPageIdState(id);
  setSel(-1);
  setConfirmDelete(false);
  try {
   localStorage.setItem(PAGE_KEY, id);
  } catch {}
 }
 const mapPage = (list: PanelPage[], id: string, f: (p: PanelPage) => PanelPage) => list.map((p) => (p.id === id ? f(p) : p));
 // Sütun sayısı sayfaya aittir; düzenleme dışındayken hemen kaydedilir.
 function setColumns(n: number) {
  const next = mapPage(pages, page.id, (p) => ({ ...p, columns: n }));
  if (editing) setDraft(next);
  else onSave(withPages(prefs, next));
 }
 function addPage() {
  const id = newPageId(pages);
  setDraft([...pages, { id, name: 'Sayfa ' + (pages.length + 1), columns: page.columns, tiles: [] }]);
  setPageId(id);
 }
 function removePage() {
  const rest = pages.filter((p) => p.id !== page.id);
  setDraft(rest);
  setPageId(rest[Math.max(0, pages.indexOf(page) - 1)].id);
 }
 function moveTileTo(target: string) {
  const tile = tiles[sel];
  if (!tile || target === page.id) return;
  setDraft(
   pages.map((p) =>
    p.id === page.id ? { ...p, tiles: p.tiles.filter((_, n) => n !== sel) } : p.id === target && !p.tiles.some((t) => t.tagId === tile.tagId) ? { ...p, tiles: [...p.tiles, tile] } : p,
   ),
  );
  setSel(-1);
 }
 function tabKey(e: React.KeyboardEvent) {
  const ids = pages.map((p) => p.id),
   i = ids.indexOf(page.id),
   next = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length] : null;
  if (!next) return;
  e.preventDefault();
  setPageId(next);
  document.getElementById('panel-tab-' + next)?.focus();
 }

 function changeFullScale(value: number | null) {
  setFullScale(value);
  try {
   if (value === null) localStorage.removeItem(SCALE_KEY);
   else localStorage.setItem(SCALE_KEY, String(value));
  } catch {}
 }
 // Operatör ekranıyla aynı sığdırma: normalde genişliğe, tam ekranda ekrana (veya kayıtlı ölçeğe).
 useEffect(() => {
  const v = viewport.current;
  if (!v) return;
  const fit = () => {
   // Tam ekran + Sığdır: genişliğe ölçekle, kutuları ekran yüksekliğini dolduracak kadar uzat.
   const z = fullLike ? (fullScale ?? v.clientWidth / PANEL_WIDTH) : v.clientWidth / PANEL_WIDTH;
   setZoom(z);
   setFillH(fullLike && fullScale === null ? v.clientHeight / z : undefined);
  };
  fit();
  const o = new ResizeObserver(fit);
  o.observe(v);
  return () => o.disconnect();
 }, [fullLike, fullScale, page.id, editing, tiles.length === 0]);
 // Kiosk: sayfalar sirayla doner (0 = donmez); duzenlemede durur.
 useEffect(() => {
  const sec = prefs.kiosk.rotateSeconds;
  if (!kiosk || !sec || pages.length < 2) return;
  const t = setInterval(() => {
   const i = pages.findIndex((p) => p.id === page.id);
   setPageId(pages[(i + 1) % pages.length].id);
  }, sec * 1000);
  return () => clearInterval(t);
 }, [kiosk, prefs.kiosk.rotateSeconds, page.id, pages.length]);
 // Kiosk: ilk dokunus/tiklamada gercek tam ekran (tarayici izni kullanici hareketi ister).
 useEffect(() => {
  if (!kiosk || !prefs.kiosk.autoFullscreen || full) return;
  const go = () => void host.current?.requestFullscreen().catch(() => {});
  document.addEventListener('pointerdown', go, { once: true });
  return () => document.removeEventListener('pointerdown', go);
 }, [kiosk, prefs.kiosk.autoFullscreen, full]);
 useEffect(() => {
  const sync = () => setFull(document.fullscreenElement === host.current);
  document.addEventListener('fullscreenchange', sync);
  // Operatör ekranında değişen ölçek burada da geçerli olsun.
  const storage = (e: StorageEvent) => e.key === SCALE_KEY && setFullScale(readScale());
  window.addEventListener('storage', storage);
  return () => {
   document.removeEventListener('fullscreenchange', sync);
   window.removeEventListener('storage', storage);
  };
 }, []);

 const saveTiles = (next: Tile[]) => setDraft(mapPage(pages, page.id, (p) => ({ ...p, tiles: next })));
 const patch = (i: number, p: Partial<Tile>) => saveTiles(tiles.map((t, n) => (n === i ? { ...t, ...p } : t)));
 const move = (i: number, d: number) => {
  const next = [...tiles],
   to = i + d;
  if (to < 0 || to >= next.length) return;
  const [m] = next.splice(i, 1);
  next.splice(to, 0, m);
  saveTiles(next);
  setSel(to);
 };
 const add = (id: string) => {
  const tag = config.tags.find((t) => t.id === id);
  if (!tag || tiles.some((t) => t.tagId === id) || tiles.length >= 48) return;
  saveTiles([...tiles, { tagId: tag.id, label: tag.name || tag.code, unit: tag.unit || '', decimals: tag.dataType === 'bool' ? 0 : 1, onText: '', offText: '', color: '', icon: '' }]);
  setSel(tiles.length);
 };
 // Arama seçenekleri: kod başta eşleşir (pick.ts sıralaması), en iyi 10 gösterilir.
 const free = config.tags
  .filter((t) => !tiles.some((x) => x.tagId === t.id))
  .map((t) => ({
   value: t.id,
   label: (config.devices.find((d) => d.id === t.deviceId)?.code || '—') + '.' + t.code,
   hint: (t.name && t.name !== t.code ? t.name + ' · ' : '') + (t.dataType === 'bool' ? 'RUN/STOP' : 'analog' + (t.unit ? ' · ' + t.unit : '')),
  }));
 const pos = (i: number) => tilePosition(i, layout);
 const now = Date.now(),
  summary = panelSummary(tiles.map((tile) => tileReading(tile, live.samples[tile.tagId], config.tags.find((t) => t.id === tile.tagId)?.dataType).state));
 // Başlıktaki durum özeti: yalnız sıfır olmayan durumlar; renk tek başına konuşmaz, her kare yazıyla gelir.
 const summaryItems = (
  [
   ['run', 'çalışıyor'],
   ['stop', 'duruyor'],
   ['bad', 'okuma hatası'],
   ['stale', 'bayat'],
   ['unknown', 'veri yok'],
   ['value', 'değer'],
  ] as const
 ).filter(([k]) => summary[k] > 0);

 return (
  <div className={'management panel-page' + (fullLike ? ' is-full' : '') + (kiosk ? ' is-kiosk' : '')} ref={host}>
   {!fullLike && (
    <div className="panel-head">
     <div>
      <span className="eyebrow">İzleme</span>
      <h1>Panelim</h1>
      <span className="muted small">
       {pages.length > 1 ? pages.length + ' sayfa · ' : ''}
       {tiles.length} etiket · yalnız izleme
      </span>
      {summaryItems.length > 0 && (
       <div className="panel-summary" aria-label="Durum özeti">
        {summaryItems.map(([k, label]) => (
         <span key={k} className={'ps-' + k}>
          <i aria-hidden="true" />
          {summary[k]} {label}
         </span>
        ))}
       </div>
      )}
     </div>
     <div className="panel-tools">
      <div className="panel-cols" role="radiogroup" aria-label="Sütun sayısı">
       {[3, 4, 5, 6].map((n) => (
        <button key={n} role="radio" aria-checked={layout.cols === n} onClick={() => setColumns(n)}>
         {n}
        </button>
       ))}
      </div>
      <button className="btn" onClick={() => void host.current?.requestFullscreen().catch(() => {})} disabled={!tiles.length}>
       <Maximize2 size={15} />
       Tam ekran
      </button>
      {editing ? (
       <>
        <div className="panel-picker">
         <SearchSelect
          ariaLabel="Panele etiket ekle"
          value=""
          options={free}
          allowEmpty={false}
          placeholder={tiles.length >= 48 ? 'Panel dolu (48)' : '+ Etiket ara ve ekle'}
          disabled={tiles.length >= 48}
          limit={10}
          onChange={add}
         />
        </div>
        <button
         className="btn"
         onClick={() => {
          setDraft(null);
          setSel(-1);
         }}
        >
         Vazgeç
        </button>
        <button
         className="btn primary"
         onClick={() => {
          onSave(withPages(prefs, draft!));
          setDraft(null);
          setSel(-1);
         }}
        >
         Bitti
        </button>
       </>
      ) : (
       <button className="btn" onClick={() => setDraft(panelPagesOf(prefs))}>
        Düzenle
       </button>
      )}
     </div>
    </div>
   )}
   {editing && !fullLike && (
    <div className="panel-inspector">
     {!current ? (
      <>
       <label className="pi-field wide">
        <span>Sayfa adı</span>
        <input
         value={page.name}
         maxLength={40}
         onChange={(e) => setDraft(mapPage(pages, page.id, (p) => ({ ...p, name: e.target.value })))}
         onBlur={(e) => !e.target.value.trim() && setDraft(mapPage(pages, page.id, (p) => ({ ...p, name: 'Sayfa' })))}
        />
       </label>
       <span className="muted small pi-hint">Kutu ayarı için bir kutuya tıklayın; yeni etiket için sağ üstten arayın.</span>
       <div className="pi-actions">
        {pages.length > 1 &&
         (confirmDelete ? (
          <>
           <span className="small">
            {tiles.length ? tiles.length + ' kutusuyla birlikte silinsin mi?' : 'Sayfa silinsin mi?'}
           </span>
           <button className="btn small" onClick={() => setConfirmDelete(false)}>
            Vazgeç
           </button>
           <button className="btn small danger" onClick={removePage}>
            Evet, sil
           </button>
          </>
         ) : (
          <button className="btn small" onClick={() => setConfirmDelete(true)}>
           <Trash2 size={14} />
           Sayfayı sil
          </button>
         ))}
       </div>
      </>
     ) : (
      <>
       <label className="pi-field wide">
        <span>Başlık</span>
        <input value={current.label ?? ''} maxLength={60} onChange={(e) => patch(sel, { label: e.target.value })} />
       </label>
       {currentTag?.dataType === 'bool' ? (
        <>
         <label className="pi-field">
          <span>1 iken</span>
          <input value={current.onText ?? ''} maxLength={16} placeholder="RUN" onChange={(e) => patch(sel, { onText: e.target.value })} />
         </label>
         <label className="pi-field">
          <span>0 iken</span>
          <input value={current.offText ?? ''} maxLength={16} placeholder="STOP" onChange={(e) => patch(sel, { offText: e.target.value })} />
         </label>
        </>
       ) : (
        <>
         <label className="pi-field">
          <span>Birim</span>
          <input value={current.unit ?? ''} maxLength={16} onChange={(e) => patch(sel, { unit: e.target.value })} />
         </label>
         <label className="pi-field narrow">
          <span>Ondalık</span>
          <select value={current.decimals} onChange={(e) => patch(sel, { decimals: Number(e.target.value) })}>
           {[0, 1, 2, 3].map((d) => (
            <option key={d} value={d}>
             {d}
            </option>
           ))}
          </select>
         </label>
        </>
       )}
       <div className="pi-field">
        <span>Kart rengi</span>
        <div className="pi-swatches" role="radiogroup" aria-label="Kart rengi">
         {panelColors.map((c) => (
          <button
           key={c || 'tema'}
           role="radio"
           aria-checked={(current.color || '') === c}
           aria-label={c || 'Tema rengi'}
           title={c || 'Tema rengi'}
           className={'pi-swatch' + (c ? '' : ' none')}
           style={c ? { background: c } : undefined}
           onClick={() => patch(sel, { color: c })}
          >
           {!c && <Ban size={13} />}
          </button>
         ))}
         <label className={'pi-swatch custom' + (current.color && !panelColors.includes(current.color) ? ' picked' : '')} title="Özel renk">
          <input type="color" aria-label="Özel renk" value={current.color || '#3d566e'} onChange={(e) => patch(sel, { color: e.target.value })} />
         </label>
        </div>
       </div>
       <div className="pi-field">
        <span>İkon</span>
        <div className="pi-icons" role="radiogroup" aria-label="İkon">
         <button role="radio" aria-checked={!current.icon} title="İkon yok" aria-label="İkon yok" onClick={() => patch(sel, { icon: '' })}>
          <Ban size={15} />
         </button>
         {Object.entries(panelIcons).map(([id, { label, Icon }]) => (
          <button key={id} role="radio" aria-checked={current.icon === id} title={label} aria-label={label} onClick={() => patch(sel, { icon: id as Tile['icon'] })}>
           <Icon size={16} />
          </button>
         ))}
        </div>
       </div>
       {pages.length > 1 && (
        <label className="pi-field">
         <span>Sayfa</span>
         <select value={page.id} onChange={(e) => moveTileTo(e.target.value)}>
          {pages.map((p) => (
           <option key={p.id} value={p.id} disabled={p.id !== page.id && p.tiles.some((t) => t.tagId === current.tagId)}>
            {p.name}
           </option>
          ))}
         </select>
        </label>
       )}
       <div className="pi-actions">
        <button className="tool" aria-label="Öne al" title="Öne al" disabled={sel === 0} onClick={() => move(sel, -1)}>
         <ChevronLeft size={16} />
        </button>
        <button className="tool" aria-label="Geri al" title="Geri al" disabled={sel === tiles.length - 1} onClick={() => move(sel, 1)}>
         <ChevronRight size={16} />
        </button>
        <button
         className="btn small"
         onClick={() => {
          saveTiles(tiles.filter((_, n) => n !== sel));
          setSel(-1);
         }}
        >
         <Trash2 size={14} />
         Panelden çıkar
        </button>
       </div>
      </>
     )}
    </div>
   )}
   {kiosk && (
    <button className="kiosk-exit" title="Pano modunu kapat (tercihlerden yeniden açılır)" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); onSave({ ...prefs, kiosk: { ...prefs.kiosk, enabled: false } }); }}>
     Pano modundan çık
    </button>
   )}
   {full && (
    <>
     <button className="fs-exit" aria-label="Tam ekrandan çık" title="Tam ekrandan çık (Esc)" onClick={() => void document.exitFullscreen()}>
      <Minimize2 size={17} />
     </button>
     <div className="fs-scale-controls" role="group" aria-label="Tam ekran ölçeği">
      <button className="btn" aria-label="Uzaklaştır" onClick={() => changeFullScale(Math.max(0.2, zoom - 0.1))}>−</button>
      <label>
       Ölçek <input aria-label="Tam ekran ölçeği" type="range" min="20" max="400" step="5" value={Math.round(zoom * 100)} onChange={(e) => changeFullScale(Number(e.target.value) / 100)} />
      </label>
      <output>{Math.round(zoom * 100)}%</output>
      <button className="btn" aria-label="Yakınlaştır" onClick={() => changeFullScale(Math.min(4, zoom + 0.1))}>+</button>
      <button className="btn" onClick={() => changeFullScale(1)}>%100</button>
      <button className="btn" aria-pressed={fullScale === null} onClick={() => changeFullScale(null)}>Sığdır</button>
     </div>
    </>
   )}
   {(pages.length > 1 || editing) && (
    <div className="panel-tabs-row">
     <div
      className="page-tabs"
      role="tablist"
      aria-label="Panel sayfaları"
      onKeyDown={tabKey}
      style={{ '--tab-i': pages.indexOf(page), '--tab-n': pages.length } as React.CSSProperties}
     >
      <span className="page-tabs-indicator" aria-hidden="true" />
      {pages.map((p) => (
       <button
        key={p.id}
        id={'panel-tab-' + p.id}
        role="tab"
        aria-selected={p.id === page.id}
        tabIndex={p.id === page.id ? 0 : -1}
        onClick={() => setPageId(p.id)}
       >
        {p.name || 'Sayfa'}
        <span className="tab-count">{p.tiles.length}</span>
       </button>
      ))}
     </div>
     {editing && pages.length < 12 && (
      <button className="btn small" onClick={addPage}>
       <Plus size={14} />
       Sayfa ekle
      </button>
     )}
    </div>
   )}
   {!tiles.length && !editing ? (
    <div className="empty-state">
     Panelde henüz etiket yok. <button className="link-btn" onClick={() => setDraft(panelPagesOf(prefs))}>Düzenle</button> ile analog değer veya RUN/STOP durumu ekleyin.
    </div>
   ) : (
    <div className={'panel-viewport tab-panel ' + tabDir} ref={viewport} key={page.id}>
     <div className="panel-sizer" style={{ width: PANEL_WIDTH * zoom, height: layout.height * zoom }}>
      <div className="panel-canvas" style={{ width: PANEL_WIDTH, height: layout.height, transform: 'scale(' + zoom + ')' }}>
       {tiles.map((tile, i) => {
        const tag = config.tags.find((t) => t.id === tile.tagId),
         device = tag && config.devices.find((d) => d.id === tag.deviceId),
         r = tileReading(tile, live.samples[tile.tagId], tag?.dataType),
         isBool = tag?.dataType === 'bool',
         icon = tile.icon ? panelIcons[tile.icon] : null;
        return (
         <article
          key={tile.tagId}
          className={'panel-tile ' + r.state + (tile.color ? ' tinted' : '') + (editing ? ' editable' : '') + (editing && sel === i ? ' selected' : '')}
          style={{ ...pos(i), ...(tile.color ? ({ '--tile-color': tile.color } as React.CSSProperties) : {}) }}
          onClick={editing ? () => setSel(i) : undefined}
         >
          <header>
           <div className="ptile-title">
            <strong title={tile.label || tag?.code}>{tile.label || tag?.name || tag?.code || 'Silinmiş etiket'}</strong>
            <small>{tag ? (device?.code || '—') + ' · ' + tag.code : 'Etiket silinmiş'}</small>
           </div>
           {icon && (
            <span className={'panel-icon m-' + icon.motion + (r.state === 'run' ? ' on' : '')} aria-hidden="true">
             <icon.Icon size={26} strokeWidth={1.6} />
            </span>
           )}
          </header>
          <div className="panel-reading">
           {isBool && <i key={r.state} className="panel-lamp" aria-hidden="true" />}
           <b style={{ fontSize: readingFontSize(r.text, layout.tileW, layout.tileH, isBool, r.state === 'value' ? tile.unit : '') }}>{r.text}</b>
           {r.state === 'value' && tile.unit && <span>{tile.unit}</span>}
          </div>
          <footer>{tileFooter(r, live.samples[tile.tagId], now)}</footer>
         </article>
        );
       })}
      </div>
     </div>
    </div>
   )}
  </div>
 );
}
