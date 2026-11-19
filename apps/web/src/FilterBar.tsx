import { useEffect, useRef, useState } from 'react';
import { ListFilter, Search } from 'lucide-react';

/** Sekme/oturum boyunca kalan filtre durumu. Depolama kapalıysa bellekte çalışır. */
export function useSessionState<T>(key: string, init: () => T) {
 const [value, setValue] = useState<T>(() => {
  try {
   const raw = sessionStorage.getItem(key),
    base = init();
   if (!raw) return base;
   const saved = JSON.parse(raw);
   return base && typeof base === 'object' ? { ...base, ...saved } : typeof saved === typeof base ? saved : base;
  } catch {
   return init();
  }
 });
 useEffect(() => {
  try {
   sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
 }, [key, value]);
 return [value, setValue] as const;
}

export type FilterOption = { value: string; label: string; count?: number; tone?: string };

/**
 * Sütun başlığı filtresi (vardiya raporundaki desen): başlık adı + küçük tetikleyici,
 * tıklanınca açılan panel. Seçim anında uygulanır. `single` verilirse tek seçimlidir
 * (zaman aralığı gibi) ve boş seçime izin vermez.
 */
export function ColumnFilter(props: {
 id: string;
 label: string;
 title?: string;
 open: string | null;
 setOpen: (id: string | null) => void;
 query?: string;
 onQuery?: (q: string) => void;
 placeholder?: string;
 options?: FilterOption[];
 selected?: string[];
 onToggle?: (value: string) => void;
 single?: boolean;
 onClear?: () => void;
 badge?: string;
 align?: 'left' | 'right';
}) {
 const { id, label, open, setOpen, query, onQuery, options, selected = [], onToggle, single, onClear } = props;
 const isOpen = open === id,
  box = useRef<HTMLDivElement>(null);
 const active = single ? !!props.badge : selected.length > 0 || !!query?.trim();
 useEffect(() => {
  if (!isOpen) return;
  // Panel açıkken tablo yüksekliğini kilitle: yazarken satırlar azalınca sayfa kısalıp zıplamasın.
  const wrap = box.current?.closest<HTMLElement>('.table-wrap');
  if (wrap) wrap.style.minHeight = wrap.offsetHeight + 'px';
  const close = (e: PointerEvent) => {
   if (box.current && !box.current.contains(e.target as Node)) setOpen(null);
  };
  document.addEventListener('pointerdown', close);
  return () => {
   document.removeEventListener('pointerdown', close);
   if (wrap) wrap.style.minHeight = '';
  };
 }, [isOpen, setOpen]);
 const badge = single ? props.badge || '' : props.badge ?? (selected.length ? String(selected.length) : query?.trim() ? '1' : '');
 return (
  <div className="report-column-filter" ref={box}>
   <span>{label}</span>
   <button
    className={'report-filter-trigger' + (active ? ' active' : '')}
    aria-label={label + ' filtresini aç'}
    aria-expanded={isOpen}
    onClick={() => setOpen(isOpen ? null : id)}
   >
    <ListFilter size={13} />
    {badge && <b>{badge}</b>}
   </button>
   {isOpen && (
    <div
     className={'report-filter-popover column' + (props.align === 'right' ? ' align-right' : '')}
     role="dialog"
     aria-label={label + ' filtresi'}
     onKeyDown={(e) => {
      if (e.key === 'Escape') setOpen(null);
     }}
    >
     <div className="report-filter-popover-head">
      <strong>{props.title || label}</strong>
      {onClear && !single && (
       <button onClick={onClear} disabled={!active}>
        Temizle
       </button>
      )}
     </div>
     {onQuery && (
      <label className="report-filter-search">
       <Search size={14} />
       <input
        autoFocus
        aria-label={props.placeholder || label + ' ara'}
        placeholder={props.placeholder}
        value={query || ''}
        onChange={(e) => onQuery(e.target.value)}
       />
      </label>
     )}
     {options && (
      <div className="report-filter-options compact" role={single ? 'radiogroup' : 'group'}>
       {options.map((o) => {
        const on = selected.includes(o.value);
        return (
         <label key={o.value} className={(on ? 'selected' : '') + (!on && o.count === 0 ? ' empty' : '')}>
          <input
           type={single ? 'radio' : 'checkbox'}
           name={single ? id : undefined}
           checked={on}
           onChange={() => onToggle?.(o.value)}
           autoFocus={!onQuery && on}
          />
          <span>
           {o.tone && <i className={'filter-dot tone-' + o.tone} aria-hidden="true" />}
           <strong>{o.label}</strong>
          </span>
          {o.count !== undefined && <small>{o.count}</small>}
         </label>
        );
       })}
      </div>
     )}
    </div>
   )}
  </div>
 );
}

type SavedFilter = { id: string; name: string; scope: string; value: unknown };
/**
 * Adlı filtreler (2026-09-25 kişiselleştirme): tablonun filtre durumu ad verilerek hesaba
 * kaydedilir ("Hat 2 alarmları"); her bilgisayarda gelir. Özet satırında durur, yer kaplamaz.
 */
export function SavedFilters<T>({ scope, value, onApply, saved, onChange }: { scope: string; value: T; onApply: (v: T) => void; saved: SavedFilter[]; onChange: (next: SavedFilter[]) => void }) {
 const [open, setOpen] = useState(false),
  [name, setName] = useState(''),
  box = useRef<HTMLDivElement>(null);
 const mine = saved.filter((f) => f.scope === scope);
 useEffect(() => {
  if (!open) return;
  const close = (e: PointerEvent) => {
   if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
  };
  document.addEventListener('pointerdown', close);
  return () => document.removeEventListener('pointerdown', close);
 }, [open]);
 function save() {
  const n = name.trim();
  if (!n) return;
  const rest = saved.filter((f) => !(f.scope === scope && f.name.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr')));
  onChange([...rest, { id: 'f-' + Date.now().toString(36), name: n, scope, value }].slice(-40));
  setName('');
 }
 return (
  <div className="saved-filters" ref={box}>
   <button className={'saved-filters-trigger' + (open ? ' active' : '')} aria-expanded={open} onClick={() => setOpen(!open)}>
    Kayıtlı filtreler{mine.length ? ' · ' + mine.length : ''}
   </button>
   {open && (
    <div className="report-filter-popover align-right" role="dialog" aria-label="Kayıtlı filtreler" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
     <div className="report-filter-popover-head"><strong>Kayıtlı filtreler</strong></div>
     {mine.length ? (
      <ul className="saved-filters-list">
       {mine.map((f) => (
        <li key={f.id}>
         <button className="saved-filters-apply" onClick={() => { onApply(f.value as T); setOpen(false); }}>{f.name}</button>
         <button className="saved-filters-drop" aria-label={f.name + ' filtresini sil'} title="Sil" onClick={() => onChange(saved.filter((x) => x.id !== f.id))}>×</button>
        </li>
       ))}
      </ul>
     ) : (
      <p className="small muted">Henüz kayıtlı filtre yok. Sütun başlıklarından filtreleyip aşağıdan ad verin.</p>
     )}
     <div className="saved-filters-new">
      <input aria-label="Filtre adı" placeholder="Şu anki filtreye ad ver" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
      <button className="btn small" disabled={!name.trim()} onClick={save}>Kaydet</button>
     </div>
    </div>
   )}
  </div>
 );
}
