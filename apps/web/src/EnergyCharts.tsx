/* Enerji grafikleri. Renk kurali (DESIGN.md): seri renkleri celik mavisi tonlari + cizgi deseni;
   sari/kirmizi yalniz durum icin. Her isaretin ustunde ipucu, lejant metinle. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tickLabel } from './reportModel';

const MIN = 60000;
/** Zaman ekseni işaretleri; kısa pencerelerde dakika adımı (vardiya grafiğindeki en küçük adım 1 sa). */
function lineTicks(from: number, to: number, max: number) {
 const steps = [MIN, 2 * MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, 60 * MIN, 120 * MIN, 240 * MIN, 360 * MIN, 720 * MIN, 1440 * MIN];
 const step = steps.find((s) => (to - from) / s <= max) ?? 1440 * MIN;
 const off = new Date(from).getTimezoneOffset() * MIN, ticks: number[] = [];
 for (let t = Math.ceil((from - off) / step) * step + off; t <= to; t += step) ticks.push(t);
 return { ticks, step };
}

function useWidth<T extends HTMLElement>() {
 const ref = useRef<T>(null);
 const [w, setW] = useState(0);
 useEffect(() => {
  const el = ref.current;
  if (!el) return;
  const ro = new ResizeObserver(() => setW(el.clientWidth));
  ro.observe(el);
  setW(el.clientWidth);
  return () => ro.disconnect();
 }, []);
 return { ref, w };
}

export const nf = (v: number | null | undefined, d = 1) =>
 v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 0'dan geçen ya da veriye oturan "yuvarlak" eksen aralığı. */
function niceScale(min: number, max: number, count = 4, zero = false) {
 if (zero) { min = Math.min(0, min); max = Math.max(0, max); }
 if (!Number.isFinite(min) || !Number.isFinite(max)) return { lo: 0, hi: 1, ticks: [0, 1] };
 if (min === max) { const pad = Math.abs(min) * 0.05 || 1; min -= pad; max += pad; }
 const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
 const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks: number[] = [];
 for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
 return { lo, hi, ticks };
}

export type LineSeries = { id: string; label: string; cls: string; points: { at: number; value: number | null }[] };

/** Çok serili zaman çizgisi. Boşluklar (null veya 3× örnek aralığından uzun) çizgiyi koparır. */
export function LineChart({ series, from, to, unit, decimals = 1, height = 220, zero = false }: { series: LineSeries[]; from: number; to: number; unit: string; decimals?: number; height?: number; zero?: boolean }) {
 const { ref, w } = useWidth<HTMLDivElement>();
 const [hover, setHover] = useState<number | null>(null);
 const L = 52, R = 12, T = 24, B = 24, pw = Math.max(10, w - L - R), ph = height - T - B;
 const vals = series.flatMap((s) => s.points.map((p) => p.value).filter((v): v is number => v !== null));
 const { lo, hi, ticks } = niceScale(Math.min(...vals), Math.max(...vals), 4, zero);
 const x = (at: number) => L + ((at - from) / Math.max(1, to - from)) * pw;
 const y = (v: number) => T + ph - ((v - lo) / Math.max(1e-9, hi - lo)) * ph;
 const { ticks: tt, step } = lineTicks(from, to, Math.max(3, Math.floor(pw / 110)));
 const path = (pts: LineSeries['points']) => {
  const gap = (to - from) / 40;
  let d = '', prev: number | null = null;
  for (const p of pts) {
   if (p.value === null || p.at < from || p.at > to) { prev = null; continue; }
   d += (prev === null || p.at - prev > gap ? 'M' : 'L') + x(p.at).toFixed(1) + ' ' + y(p.value).toFixed(1);
   prev = p.at;
  }
  return d;
 };
 const nearest = (pts: LineSeries['points'], at: number) => {
  let best: LineSeries['points'][number] | null = null;
  for (const p of pts) if (p.value !== null && (!best || Math.abs(p.at - at) < Math.abs(best.at - at))) best = p;
  return best && Math.abs(best.at - at) < (to - from) / 20 ? best : null;
 };
 const hoverAt = hover === null ? null : from + ((hover - L) / pw) * (to - from);
 const tip = hoverAt !== null && series.map((s) => ({ s, p: nearest(s.points, hoverAt) })).filter((r) => r.p);
 return (
  <div className="e-line" ref={ref} style={{ height }}>
   {!vals.length && <div className="e-chart-empty">Bu aralıkta kayıtlı ölçüm yok.</div>}
   {w > 0 && vals.length > 0 && (
    <svg width={w} height={height} onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = e.clientX - r.left; setHover(px >= L && px <= L + pw ? px : null); }} onMouseLeave={() => setHover(null)} role="img" aria-label={'Zaman grafiği: ' + series.map((s) => s.label).join(', ')}>
     {ticks.map((v) => (
      <g key={v}>
       <line className="e-grid" x1={L} x2={L + pw} y1={y(v)} y2={y(v)} />
       <text className="e-axis" x={L - 8} y={y(v) + 4} textAnchor="end">{nf(v, Math.abs(hi - lo) < 5 ? 2 : Math.abs(hi - lo) < 50 ? 1 : 0)}</text>
      </g>
     ))}
     {tt.map((t) => <text key={t} className="e-axis" x={x(t)} y={height - 6} textAnchor="middle">{step < 60 * MIN ? new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : tickLabel(t, step)}</text>)}
     <text className="e-axis unit" x={L - 8} y={11} textAnchor="end">{unit}</text>
     {series.map((s) => <path key={s.id} className={'e-series ' + s.cls} d={path(s.points)} />)}
     {hover !== null && <line className="e-cursor" x1={hover} x2={hover} y1={T} y2={T + ph} />}
     {tip && tip.map(({ s, p }) => <circle key={s.id} className={'e-dot ' + s.cls} cx={x(p!.at)} cy={y(p!.value!)} r={3.5} />)}
    </svg>
   )}
   {tip && tip.length > 0 && hover !== null && (
    <div className={'chart-tip' + (hover > w - 200 ? ' left' : '')} style={{ left: hover, top: T + 40 }} role="tooltip">
     <b>{new Date(tip[0].p!.at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: to - from < 3 * 3600000 ? '2-digit' : undefined })}</b>
     {tip.map(({ s, p }) => <span key={s.id}>{s.label}: {nf(p!.value, decimals)} {unit}</span>)}
    </div>
   )}
  </div>
 );
}

export type StackPart = { key: string; label: string; cls: string };
/** Yığılmış sütunlar: kova başına dilim payları. Etiket yoğunluğu genişliğe göre seyreltilir. */
export function StackedColumns({ buckets, parts, label, tipExtra, unit, flag }: { buckets: { from: number; values: Record<string, number> }[]; parts: StackPart[]; label: (from: number) => string; tipExtra?: (i: number) => ReactNode; unit: string; flag?: (i: number) => boolean }) {
 const { ref, w } = useWidth<HTMLDivElement>();
 const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null);
 const totals = buckets.map((b) => parts.reduce((n, p) => n + (b.values[p.key] || 0), 0));
 const { hi, ticks } = niceScale(0, Math.max(0, ...totals), 4, true);
 const every = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(w / 64))));
 if (!buckets.length) return <div className="e-chart-empty">Bu aralıkta tüketim kaydı yok.</div>;
 return (
  <div className="e-cols" ref={ref} onMouseLeave={() => setTip(null)}>
   <div className="e-cols-plot">
    {ticks.map((v) => <i key={v} className="e-cols-grid" style={{ bottom: (v / hi) * 100 + '%' }}><span>{nf(v, 0)}</span></i>)}
    {buckets.map((b, i) => (
     <div key={b.from} className={'e-col' + (tip?.i === i ? ' hot' : '') + (flag?.(i) ? ' flagged' : '')} onMouseMove={(e) => { const box = ref.current!.getBoundingClientRect(); setTip({ i, x: e.clientX - box.left, y: e.clientY - box.top }); }}>
      <div className="e-col-stack" style={{ height: (totals[i] / hi) * 100 + '%' }}>
       {parts.map((p) => (b.values[p.key] || 0) > 0 && <span key={p.key} className={p.cls} style={{ flexGrow: b.values[p.key] }} />)}
      </div>
     </div>
    ))}
   </div>
   <div className="e-cols-axis" aria-hidden="true">{buckets.map((b, i) => <span key={b.from}>{i % every === 0 ? label(b.from) : ''}</span>)}</div>
   {tip && (
    <div className={'chart-tip' + (tip.x > (ref.current?.clientWidth || 0) - 200 ? ' left' : '')} style={{ left: tip.x, top: tip.y }} role="tooltip">
     <b>{label(buckets[tip.i].from)}</b>
     {parts.map((p) => <span key={p.key}>{p.label}: {nf(buckets[tip.i].values[p.key] || 0, 1)} {unit}</span>)}
     <span>Toplam: {nf(totals[tip.i], 1)} {unit}</span>
     {tipExtra?.(tip.i)}
    </div>
   )}
  </div>
 );
}
