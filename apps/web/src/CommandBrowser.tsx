/* Komut gezgini — Etiketler'deki Konsol düzeninin aynısı (2026-10-01, kullanıcı isteği):
   cihazlar yoğun liste → cihazın içinde klasör kutuları → klasörün komut tablosu (Management).
   Komutun cihazı ilk yazma hedefinin cihazıdır; klasör komutun kendi `group` alanıdır.
   Durum canlı değer değil, son gönderimin sonucudur: doğrulandı / sürüyor / sorunlu / hiç gönderilmedi. */
import { useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, FolderOpen, Pencil, Plus, Search, X } from 'lucide-react';
import { connectionAddress, connectionProtocol, isSymbolicProtocol, protocolLabels, type Config, type Execution } from '../../../packages/contracts/model';
import { execTone } from './CommandInspector';

export type CmdNavState = { dev: string; grp: string | null };
type Cmd = Config['commands'][number];
type Counts = { n: number; ok: number; run: number; bad: number };

/** Komutun cihazı: ilk yazma hedefinin cihazı (yoksa ''). */
export const commandDevice = (config: Config, c: Pick<Cmd, 'tagIds'>) => config.tags.find((t) => t.id === c.tagIds[0])?.deviceId || '';
export const commandGroup = (c: Pick<Cmd, 'group'>) => (c.group || '').trim();

const countOf = (cmds: Cmd[], last: (id: string) => Execution | undefined): Counts => {
 const c = { n: cmds.length, ok: 0, run: 0, bad: 0 };
 for (const x of cmds) { const e = last(x.id); if (!e) continue; const t = execTone(e.status); if (t === 'ok') c.ok++; else if (t === 'bad') c.bad++; else c.run++; }
 return c;
};
const tone = (c: Counts) => (c.bad ? 'bad' : c.run ? 'stale' : c.n && c.ok === c.n ? 'good' : 'idle');
function StateBar({ c }: { c: Counts }) {
 const w = (x: number) => (c.n ? (x / c.n) * 100 : 0) + '%';
 return <span className="tb-bar" aria-label={c.ok + ' doğrulandı, ' + c.run + ' sürüyor, ' + c.bad + ' sorunlu'}><i className="g" style={{ width: w(c.ok) }} /><i className="s" style={{ width: w(c.run) }} /><i className="b" style={{ width: w(c.bad) }} /></span>;
}
const legend = (c: Counts) => {
 const never = c.n - c.ok - c.run - c.bad;
 return <span className="tb-legend"><span>{c.ok} doğrulandı</span>{c.run > 0 && <span className="stale">{c.run} sürüyor</span>}{c.bad > 0 && <span className="bad">{c.bad} sorunlu</span>}{never > 0 && <span>{never} gönderilmedi</span>}</span>;
};

/** Yol satırı: Tüm cihazlar › Cihaz › Klasör. */
export function CmdCrumbs({ config, nav, setNav }: { config: Config; nav: CmdNavState; setNav: (n: CmdNavState) => void }) {
 const dev = config.devices.find((d) => d.id === nav.dev);
 return (
  <nav className="tag-crumbs" aria-label="Konum">
   {dev ? <button onClick={() => setNav({ dev: '', grp: null })}>Tüm cihazlar</button> : <span className="here">Tüm cihazlar</span>}
   {dev && <><ChevronRight size={14} aria-hidden="true" />{nav.grp === null ? <span className="here mono">{dev.code}</span> : <button className="mono" onClick={() => setNav({ dev: dev.id, grp: null })}>{dev.code}</button>}</>}
   {dev && nav.grp !== null && <><ChevronRight size={14} aria-hidden="true" /><span className="here"><FolderOpen size={14} />{nav.grp || 'Klasörde olmayanlar'}</span></>}
  </nav>
 );
}

/** Hızlı bul: komut adı, kapsam, klasör ya da hedef etiket kodu; seçince komutun klasörüne gider. */
export function CmdQuickFind({ config, onPick }: { config: Config; onPick: (c: Cmd) => void }) {
 const [q, setQ] = useState('');
 const [open, setOpen] = useState(false);
 const [hi, setHi] = useState(0);
 const box = useRef<HTMLDivElement>(null);
 const hits = useMemo(() => {
  const s = q.trim().toLocaleLowerCase('tr');
  if (!s) return [];
  return config.commands.filter((c) => [c.name, c.scope, c.group, ...[...c.tagIds, ...c.feedbackTagIds].map((id) => config.tags.find((t) => t.id === id)?.code)].join(' ').toLocaleLowerCase('tr').includes(s)).slice(0, 12);
 }, [q, config.commands, config.tags]);
 const pick = (c: Cmd) => { onPick(c); setQ(''); setOpen(false); };
 return (
  <div className="tag-find" ref={box} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
   <Search size={14} aria-hidden="true" />
   <input value={q} placeholder="Komut bul… (ad, klasör, etiket kodu)" aria-label="Komut bul" role="combobox" aria-expanded={open && !!q.trim()} aria-controls="cmd-find-list"
    onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)}
    onKeyDown={(e) => {
     if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
     else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
     else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); pick(hits[hi]); }
     else if (e.key === 'Escape') { setQ(''); setOpen(false); }
    }} />
   {open && q.trim() && (
    <ul className="tag-find-list" id="cmd-find-list" role="listbox">
     {hits.map((c, i) => { const d = config.devices.find((x) => x.id === commandDevice(config, c)); const t = config.tags.find((x) => x.id === c.tagIds[0]); return (
      <li key={c.id} role="option" aria-selected={i === hi}><button tabIndex={-1} className={i === hi ? 'hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => pick(c)}>
       <b>{c.name}</b><span className="mono">{t?.code || ''}</span><small>{d?.code || 'cihazsız'}{' › '}{commandGroup(c) || 'klasörde değil'}</small>
      </button></li>
     ); })}
     {!hits.length && <li className="muted">Eşleşen komut yok.</li>}
    </ul>
   )}
  </div>
 );
}

/** Düzey 0: cihazlar; satırda bağlantı, klasör/komut sayısı ve son gönderim durumu. Komutu olmayan cihaz da görünür. */
export function CmdDeviceList({ config, last, setNav }: { config: Config; last: (id: string) => Execution | undefined; setNav: (n: CmdNavState) => void }) {
 if (!config.devices.length) return <div className="empty-state">Henüz cihaz yok. Önce Cihazlar sayfasından bağlantı ve cihaz ekleyin.</div>;
 return (
  <div className="tb-list" role="list">
   <div className="tb-head" aria-hidden="true"><span /><span>Cihaz</span><span>Bağlantı</span><span>Klasör</span><span>Komut</span><span>Son gönderim</span><span /></div>
   {config.devices.map((d) => {
    const conn = config.connections.find((c) => c.id === d.connectionId), mine = config.commands.filter((c) => commandDevice(config, c) === d.id);
    const c = countOf(mine, last), folders = new Set(mine.map(commandGroup).filter(Boolean)).size;
    const proto = conn ? connectionProtocol(conn) : '';
    return (
     <button key={d.id} role="listitem" className={'tb-row' + (!d.enabled ? ' off' : '')} onClick={() => setNav({ dev: d.id, grp: null })} aria-label={d.code + ' komutlarını aç'}>
      <i className={'tb-dot ' + (mine.length ? tone(c) : 'idle')} />
      <span className="tb-name"><strong>{d.code}</strong><small>{d.name}{!d.enabled && ' · pasif'}</small></span>
      <span className="tb-conn"><span>{conn ? protocolLabels[proto as keyof typeof protocolLabels] : '—'}</span><small className="mono">{conn ? connectionAddress(conn) : ''}</small></span>
      <span className="tb-num">{folders}<small>klasör</small></span>
      <span className="tb-num">{c.n}<small>komut</small></span>
      <span className="tb-state">{c.n ? <><StateBar c={c} />{legend(c)}</> : <small className="muted">{isSymbolicProtocol(proto) && proto !== 'opc-ua' ? 'komut yok · yalnız izleme' : 'komut yok'}</small>}</span>
      <ChevronRight size={16} className="tb-go" aria-hidden="true" />
     </button>
    );
   })}
  </div>
 );
}

/** Düzey 1: cihazın klasör kutuları. Sorunlu önce ya da ada göre; klasörde olmayanlar kesik çizgili kutu. */
export function CmdFolderTiles({ config, last, nav, setNav, writable, draft, setDraft, onRename, sort, setSort }: {
 config: Config; last: (id: string) => Execution | undefined; nav: CmdNavState; setNav: (n: CmdNavState) => void; writable: boolean;
 draft: string[]; setDraft: (g: string[]) => void; onRename: (from: string, to: string) => void;
 sort: 'bad' | 'name'; setSort: (s: 'bad' | 'name') => void;
}) {
 const [edit, setEdit] = useState<{ from: string | null; value: string } | null>(null);
 const mine = config.commands.filter((c) => commandDevice(config, c) === nav.dev);
 const cmdsOf = (name: string) => mine.filter((c) => commandGroup(c) === name);
 const named = [...new Set([...mine.map(commandGroup).filter(Boolean), ...draft.map((g) => g.trim()).filter(Boolean)])];
 const loose = cmdsOf('').length;
 const rank = (c: Counts) => (c.bad ? 0 : c.run ? 1 : 2);
 const names = named.sort((a, b) => (sort === 'bad' ? rank(countOf(cmdsOf(a), last)) - rank(countOf(cmdsOf(b), last)) : 0) || a.localeCompare(b, 'tr'));
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
   <input autoFocus value={edit?.value || ''} maxLength={60} placeholder="Klasör adı (örn. Pompalar)" aria-label="Klasör adı" onChange={(e) => setEdit({ from, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEdit(null); } }} />
   <span className="tb-edit-actions"><button type="button" className="btn small" onClick={() => setEdit(null)}><X size={13} />Vazgeç</button><button type="submit" className="btn small primary"><Check size={13} />{from === null ? 'Oluştur' : 'Kaydet'}</button></span>
  </form>
 );
 const tile = (name: string, label: string, extra = '') => {
  const list = cmdsOf(name), c = countOf(list, last);
  return (
   <div key={'t-' + name} className={'tb-tile tone-' + tone(c) + extra}>
    <button className="tb-tile-open" onClick={() => setNav({ dev: nav.dev, grp: name })} aria-label={label + ' klasörünü aç'}>
     <b title={label}>{label}</b>
     <span className="tb-big">{c.n}<small>komut</small></span>
     {c.n ? <><StateBar c={c} />{legend(c)}</> : <small className="muted">boş — "Komut ekle" bu klasöre ekler</small>}
    </button>
    {writable && name && c.n > 0 && <button className="tb-tile-tool" title="Yeniden adlandır" aria-label={label + ' yeniden adlandır'} onClick={() => setEdit({ from: name, value: name })}><Pencil size={13} /></button>}
   </div>
  );
 };
 return (
  <>
   <div className="tb-bar-row">
    <span className="muted">{names.length} klasör · {mine.length} komut</span>
    <span className="insp-seg tb-sort" role="radiogroup" aria-label="Sıralama">
     <button type="button" role="radio" aria-checked={sort === 'bad'} className={sort === 'bad' ? 'active' : ''} onClick={() => setSort('bad')}>Sorunlu önce</button>
     <button type="button" role="radio" aria-checked={sort === 'name'} className={sort === 'name' ? 'active' : ''} onClick={() => setSort('name')}>Ada göre</button>
    </span>
   </div>
   <div className="tb-tiles">
    {names.map((n) => (edit?.from === n ? <div key={'e-' + n}>{editor(n)}</div> : tile(n, n)))}
    {loose > 0 && tile('', 'Klasörde olmayanlar', ' loose')}
    {writable && (edit?.from === null ? editor(null) : <button className="tb-tile add" onClick={() => setEdit({ from: null, value: '' })}><Plus size={16} />Yeni klasör</button>)}
   </div>
  </>
 );
}
