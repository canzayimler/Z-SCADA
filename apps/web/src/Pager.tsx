/* Ortak sayfalayıcı: uzun listeler sayfa sayfa gösterilir (varsayılan 50 satır).
   Sayfa boyu tüm listelerde ortaktır ve bu tarayıcıda hatırlanır. Filtre değişince ilk sayfaya döner. */
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZES = [25, 50, 100] as const;
const SIZE_KEY = 'dvp.pageSize';
const readSize = () => {
 try {
  const n = Number(localStorage.getItem(SIZE_KEY));
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : 50;
 } catch {
  return 50;
 }
};

/** Gösterilecek sayfa numaraları: ilk, son, seçilinin iki yanı; aralar "…" ile. */
export function pageWindow(page: number, pages: number): (number | '…')[] {
 if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
 const keep = new Set([0, pages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pages));
 const out: (number | '…')[] = [];
 [...keep].sort((a, b) => a - b).forEach((p, i, arr) => {
  if (i && p - arr[i - 1] > 1) out.push('…');
  out.push(p);
 });
 return out;
}

/** Listeyi sayfalar. `resetKey` değişince (ör. filtre) ilk sayfaya döner. */
export function usePaged<T>(list: T[], resetKey: string) {
 const [size, setSizeState] = useState(readSize);
 const [page, setPage] = useState(0);
 useEffect(() => setPage(0), [resetKey]);
 const pages = Math.max(1, Math.ceil(list.length / size));
 const current = Math.min(page, pages - 1);
 const setSize = (n: number) => {
  setSizeState(n);
  setPage(0);
  try {
   localStorage.setItem(SIZE_KEY, String(n));
  } catch {}
 };
 const rows = list.slice(current * size, current * size + size);
 const pager = <Pager total={list.length} page={current} size={size} onPage={setPage} onSize={setSize} />;
 return { rows, pager, page: current };
}

export function Pager({ total, page, size, onPage, onSize, unit = 'kayıt' }: { total: number; page: number; size: number; onPage: (p: number) => void; onSize?: (n: number) => void; unit?: string }) {
 if (total <= PAGE_SIZES[0]) return null;
 const pages = Math.max(1, Math.ceil(total / size));
 return (
  <nav className="pager" aria-label="Sayfalar">
   <span className="pager-range">
    {page * size + 1}–{Math.min(total, (page + 1) * size)} / {total} {unit}
   </span>
   <span className="pager-pages">
    <button aria-label="Önceki sayfa" disabled={page === 0} onClick={() => onPage(page - 1)}>
     <ChevronLeft size={15} />
    </button>
    {pageWindow(page, pages).map((p, i) =>
     p === '…' ? (
      <span key={'g' + i} className="pager-gap">…</span>
     ) : (
      <button key={p} className={p === page ? 'active' : ''} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>
       {p + 1}
      </button>
     ),
    )}
    <button aria-label="Sonraki sayfa" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
     <ChevronRight size={15} />
    </button>
   </span>
   {onSize && (
    <label className="pager-size">
     Sayfada
     <select value={size} onChange={(e) => onSize(Number(e.target.value))}>
      {PAGE_SIZES.map((n) => (
       <option key={n} value={n}>{n}</option>
      ))}
     </select>
    </label>
   )}
  </nav>
 );
}
