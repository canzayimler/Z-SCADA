/* Etiket gezgini — Konsol düzeni (2026-10-01, kullanıcı seçimi):
   cihazlar yoğun liste (satırda durum çubuğu) → cihazın içinde klasör kutuları (büyük sayı,
   sorunlu önce sıralama, "Klasörde olmayanlar" da bir kutu) → klasörün etiket tablosu (Management).
   Klasör etiketin `group` alanıdır; etiketi olmayan yeni klasör yalnız oturum boyunca durur. */
import { useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, FolderOpen, Pencil, Plus, Search, X } from 'lucide-react';
import { addressFormatLabels, addressFormatOf, connectionAddress, connectionProtocol, protocolLabels, type Config, type Live, type Tag } from '../../../packages/contracts/model';
import { tagGroups } from './cfgModel';

export type TagNavState = { dev: string; grp: string | null };
type Counts = { n: number; good: number; stale: number; bad: number };

const countOf = (live: Live, tags: Tag[]): Counts => {
 const c = { n: tags.length, good: 0, stale: 0, bad: 0 };
 for (const t of tags) { const q = live.samples[t.id]?.quality; if (q === 'good') c.good++; else if (q === 'stale') c.stale++; else if (q === 'bad') c.bad++; }
 return c;
};
const tone = (c: Counts) => (c.bad ? 'bad' : c.stale ? 'stale' : c.n && c.good === c.n ? 'good' : 'idle');
/** Durum çubuğu: güncel / bayat / hata oranı; hiç okunmamış kısım boş kalır. */
function StateBar({ c }: { c: Counts }) {
 const w = (x: number) => (c.n ? (x / c.n) * 100 : 0) + '%';
 return <span className="tb-bar" aria-label={c.good + ' güncel, ' + c.stale + ' bayat, ' + c.bad + ' hata'}><i className="g" style={{ width: w(c.good) }} /><i className="s" style={{ width: w(c.stale) }} /><i className="b" style={{ width: w(c.bad) }} /></span>;
}
const legend = (c: Counts) => <span className="tb-legend"><span>{c.good} güncel</span>{c.stale > 0 && <span className="stale">{c.stale} bayat</span>}{c.bad > 0 && <span className="bad">{c.bad} hata</span>}</span>;

/** Yol satırı: Tüm cihazlar › Cihaz › Klasör. */
export function TagCrumbs({ config, nav, setNav }: { config: Config; nav: TagNavState; setNav: (n: TagNavState) => void }) {
 const dev = config.devices.find((d) => d.id === nav.dev);
 return (
  <nav className="tag-crumbs" aria-label="Konum">
   {dev ? <button onClick={() => setNav({ dev: '', grp: null })}>Tüm cihazlar</button> : <span className="here">Tüm cihazlar</span>}
   {dev && <><ChevronRight size={14} aria-hidden="true" />{nav.grp === null ? <span className="here mono">{dev.code}</span> : <button className="mono" onClick={() => setNav({ dev: dev.id, grp: null })}>{dev.code}</button>}</>}
   {dev && nav.grp !== null && <><ChevronRight size={14} aria-hidden="true" /><span className="here"><FolderOpen size={14} />{nav.grp || 'Klasörde olmayanlar'}</span></>}
  </nav>
 );
}

/** Hızlı bul: sayfa düzenini değiştirmeyen açılır liste; seçince etiketin klasörüne gider. */
export function TagQuickFind({ config, onPick }: { config: Config; onPick: (t: Tag) => void }) {
 const [q, setQ] = useState('');
 const [open, setOpen] = useState(false);
 const [hi, setHi] = useState(0);
 const box = useRef<HTMLDivElement>(null);
 const hits = useMemo(() => {
  const s = q.trim().toLocaleLowerCase('tr');
  if (!s) return [];
  return config.tags.filter((t) => [t.code, t.name, t.group, t.description, t.s7Address, t.adsSymbol, t.nodeId, String(t.address)].join(' ').toLocaleLowerCase('tr').includes(s)).slice(0, 12);
 }, [q, config.tags]);
 const pick = (t: Tag) => { onPick(t); setQ(''); setOpen(false); };
 return (
  <div className="tag-find" ref={box} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
   <Search size={14} aria-hidden="true" />
   <input value={q} placeholder="Etiket bul… (kod, ad, klasör, adres)" aria-label="Etiket bul" role="combobox" aria-expanded={open && !!q.trim()} aria-controls="tag-find-list"
    onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)}
    onKeyDown={(e) => {
     if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
     else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
     else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
     else if (e.key === 'Escape') { setQ(''); setOpen(false); }
    }} />
   {open && q.trim() && (
    <ul className="tag-find-list" id="tag-find-list" role="listbox">
     {hits.map((t, i) => { const d = config.devices.find((x) => x.id === t.deviceId); return (
      <li key={t.id} role="option" aria-selected={i === hi}><button tabIndex={-1} className={i === hi ? 'hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => pick(t)}>
       <b className="mono">{t.code}</b><span>{t.name !== t.code ? t.name : ''}</span><small>{d?.code || '?'}{' › '}{(t.group || '').trim() || 'klasörde değil'}</small>
      </button></li>
     ); })}
     {!hits.length && <li className="muted">Eşleşen etiket yok.</li>}
    </ul>
   )}
  </div>
 );
}

/** Düzey 0: cihazlar yoğun listede; satırda bağlantı, klasör/etiket sayısı ve durum çubuğu. */
export function TagDeviceList({ config, live, setNav }: { config: Config; live: Live; setNav: (n: TagNavState) => void }) {
 if (!config.devices.length) return <div className="empty-state">Henüz cihaz yok. Önce Cihazlar sayfasından bağlantı ve cihaz ekleyin.</div>;
 return (
  <div className="tb-list" role="list">
   <div className="tb-head" aria-hidden="true"><span /><span>Cihaz</span><span>Bağlantı</span><span>Klasör</span><span>Etiket</span><span>Durum</span><span /></div>
   {config.devices.map((d) => {
    const conn = config.connections.find((c) => c.id === d.connectionId), mine = config.tags.filter((t) => t.deviceId === d.id);
    const c = countOf(live, mine), folders = tagGroups(mine, d.id).named.length;
    return (
     <button key={d.id} role="listitem" className={'tb-row' + (!d.enabled ? ' off' : '')} onClick={() => setNav({ dev: d.id, grp: null })} aria-label={d.code + ' etiketlerini aç'}>
      <i className={'tb-dot ' + (d.enabled ? tone(c) : 'idle')} title={d.enabled ? '' : 'Pasif'} />
      <span className="tb-name"><strong>{d.code}</strong><small>{d.name}{!d.enabled && ' · pasif'}</small></span>
      <span className="tb-conn"><span>{conn ? protocolLabels[connectionProtocol(conn)] : '—'}{['modbus', 'delta'].includes(addressFormatOf(config, d.id)) && ' · ' + addressFormatLabels[addressFormatOf(config, d.id)]}</span><small className="mono">{conn ? connectionAddress(conn) : ''}</small></span>
      <span className="tb-num">{folders}<small>klasör</small></span>
      <span className="tb-num">{c.n}<small>etiket</small></span>
      <span className="tb-state">{c.n ? <><StateBar c={c} />{legend(c)}</> : <small className="muted">etiket yok</small>}</span>
      <ChevronRight size={16} className="tb-go" aria-hidden="true" />
     </button>
    );
   })}
  </div>
 );
}

/** Düzey 1: cihazın klasör kutuları. Sorunlu önce ya da ada göre; klasörde olmayanlar en sonda kutu. */
export function TagFolderTiles({ config, live, nav, setNav, writable, draft, setDraft, onRename, sort, setSort }: {
 config: Config; live: Live; nav: TagNavState; setNav: (n: TagNavState) => void; writable: boolean;
 draft: string[]; setDraft: (g: string[]) => void; onRename: (from: string, to: string) => void;
 sort: 'bad' | 'name'; setSort: (s: 'bad' | 'name') => void;
}) {
 const [edit, setEdit] = useState<{ from: string | null; value: string } | null>(null);
 const mine = config.tags.filter((t) => t.deviceId === nav.dev);
 const g = tagGroups(mine, nav.dev, draft);
 const tagsOf = (name: string) => mine.filter((t) => (t.group || '').trim() === name);
 const rank = (c: Counts) => (c.bad ? 0 : c.stale ? 1 : 2);
 const names = g.named.map(([n]) => n).sort((a, b) => (sort === 'bad' ? rank(countOf(live, tagsOf(a))) - rank(countOf(live, tagsOf(b))) : 0) || a.localeCompare(b, 'tr'));
 const commit = () => {
  if (!edit) return;
  const v = edit.value.trim(), from = edit.from;
  setEdit(null);
  if (!v || v === from) return;
  if (names.includes(v)) { if (from === null) setNav({ dev: nav.dev, grp: v }); return; }
  if (from === null) { setDraft([...draft, v]); return; }
  setDraft(draft.map((x) => (x === from ? v : x)));
  onRename(from, v);
 };
 const editor = (from: string | null) => (
  <form className="tb-tile editing" onSubmit={(e) => { e.preventDefault(); commit(); }}>
   <input autoFocus value={edit?.value || ''} maxLength={60} placeholder="Klasör adı (örn. Pano 1)" aria-label="Klasör adı" onChange={(e) => setEdit({ from, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEdit(null); } }} />
   <span className="tb-edit-actions"><button type="button" className="btn small" onClick={() => setEdit(null)}><X size={13} />Vazgeç</button><button type="submit" className="btn small primary"><Check size={13} />{from === null ? 'Oluştur' : 'Kaydet'}</button></span>
  </form>
 );
 const tile = (name: string, label: string, extra = '') => {
  const c = countOf(live, tagsOf(name));
  return (
   <div key={'t-' + name} className={'tb-tile tone-' + tone(c) + extra}>
    <button className="tb-tile-open" onClick={() => setNav({ dev: nav.dev, grp: name })} aria-label={label + ' klasörünü aç'}>
     <b title={label}>{label}</b>
     <span className="tb-big">{c.n}<small>etiket</small></span>
     {c.n ? <><StateBar c={c} />{legend(c)}</> : <small className="muted">boş — "Etiket ekle" bu klasöre ekler</small>}
    </button>
    {writable && name && c.n > 0 && <button className="tb-tile-tool" title="Yeniden adlandır" aria-label={label + ' yeniden adlandır'} onClick={() => setEdit({ from: name, value: name })}><Pencil size={13} /></button>}
   </div>
  );
 };
 return (
  <>
   <div className="tb-bar-row">
    <span className="muted">{names.length} klasör · {mine.length} etiket</span>
    <span className="insp-seg tb-sort" role="radiogroup" aria-label="Sıralama">
     <button type="button" role="radio" aria-checked={sort === 'bad'} className={sort === 'bad' ? 'active' : ''} onClick={() => setSort('bad')}>Sorunlu önce</button>
     <button type="button" role="radio" aria-checked={sort === 'name'} className={sort === 'name' ? 'active' : ''} onClick={() => setSort('name')}>Ada göre</button>
    </span>
   </div>
   <div className="tb-tiles">
    {names.map((n) => (edit?.from === n ? <div key={'e-' + n}>{editor(n)}</div> : tile(n, n)))}
    {g.ungrouped > 0 && tile('', 'Klasörde olmayanlar', ' loose')}
    {writable && (edit?.from === null ? editor(null) : <button className="tb-tile add" onClick={() => setEdit({ from: null, value: '' })}><Plus size={16} />Yeni klasör</button>)}
   </div>
  </>
 );
}
