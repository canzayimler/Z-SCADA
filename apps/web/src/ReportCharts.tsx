/* Vardiya raporu grafikleri. Tek seri, tek renk (--chart-bar); belirsiz veri taralı + etiketli.
   Her işaretin üstünde fareyle ipucu; renk tek başına anlam taşımaz. */
import { useRef, useState, type ReactNode } from 'react';
import { timeTicks, tickLabel } from './reportModel';

type Tip = { x: number; y: number; body: ReactNode } | null;

function useTip() {
 const ref = useRef<HTMLDivElement>(null);
 const [tip, setTip] = useState<Tip>(null);
 const show = (e: React.MouseEvent, body: ReactNode) => {
  const box = ref.current?.getBoundingClientRect();
  if (!box) return;
  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, body });
 };
 const hide = () => setTip(null);
 const node = tip && (
  <div
   className={'chart-tip' + (ref.current && tip.x > ref.current.clientWidth - 200 ? ' left' : '')}
   style={{ left: tip.x, top: tip.y }}
   role="tooltip"
  >
   {tip.body}
  </div>
 );
 return { ref, show, hide, node };
}

const clock = (at: number) =>
 new Date(at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export type TimelineRow = {
 id: string;
 code: string;
 name: string;
 share: number; // 0..1
 intervals: { start: number; end: number; durationMs: number; ongoing: boolean; uncertain: boolean }[];
};

/** Sinyal başına açık kalma çizelgesi: her satır bir sinyal, her çubuk bir çevrim. */
export function Timeline({ rows, from, to, duration }: { rows: TimelineRow[]; from: number; to: number; duration: (ms: number) => string }) {
 const { ref, show, hide, node } = useTip();
 const span = Math.max(1, to - from);
 const pos = (at: number) => ((Math.min(to, Math.max(from, at)) - from) / span) * 100;
 const { ticks, step } = timeTicks(from, to);
 return (
  <div className="timeline" ref={ref} onMouseLeave={hide}>
   <div className="timeline-rows">
    {rows.map((r) => (
     <div className="timeline-row" key={r.id}>
      <div className="timeline-label" title={r.name}>
       <strong>{r.code}</strong>
       <small>{r.name}</small>
      </div>
      <div className="timeline-track">
       {ticks.map((t) => (
        <i key={t} className="timeline-grid" style={{ left: pos(t) + '%' }} />
       ))}
       {r.intervals.map((it, i) => (
        <span
         key={i}
         className={'timeline-bar' + (it.uncertain ? ' uncertain' : '') + (it.ongoing ? ' ongoing' : '')}
         style={{ left: pos(it.start) + '%', width: `max(3px, ${pos(it.end) - pos(it.start)}%)` }}
         onMouseMove={(e) =>
          show(
           e,
           <>
            <b>{r.code}</b>
            <span>
             {clock(it.start)} → {it.ongoing ? 'devam ediyor' : clock(it.end)}
            </span>
            <span>
             {duration(it.durationMs)}
             {it.uncertain ? ' · eksik veri' : ''}
            </span>
           </>,
          )
         }
        />
       ))}
       {!r.intervals.length && <span className="timeline-none">Bu aralıkta açılmadı</span>}
      </div>
      <div className="timeline-share mono">%{Math.round(r.share * 1000) / 10}</div>
     </div>
    ))}
   </div>
   <div className="timeline-axis" aria-hidden="true">
    <div />
    <div className="timeline-axis-track">
     {ticks.map((t) => (
      <span key={t} style={{ left: pos(t) + '%' }}>
       {tickLabel(t, step)}
      </span>
     ))}
    </div>
    <div />
   </div>
   {node}
  </div>
 );
}

/** Zaman kovası başına adet: devreye girme histogramı. */
export function Columns({ buckets, unit, empty }: { buckets: { from: number; to: number; count: number }[]; unit: string; empty?: string }) {
 const { ref, show, hide, node } = useTip();
 // Boş veride eksen "1 / 2" gösteriyordu (üst sınır en az 2); veri yoksa grafik yerine boş durum.
 if (!buckets.some((b) => b.count > 0)) return <div className="empty-state columns-empty">{empty ?? `Bu aralıkta ${unit} yok.`}</div>;
 // Üst sınır çift sayıya yuvarlanır: orta çizgi tam sayıya düşer.
 const max = Math.max(2, Math.ceil(Math.max(0, ...buckets.map((b) => b.count)) / 2) * 2);
 const peak = buckets.reduce((best, b, i) => (b.count > buckets[best].count ? i : best), 0);
 const labelEvery = Math.ceil(buckets.length / 8);
 const span = buckets.length ? buckets[buckets.length - 1].to - buckets[0].from : 0;
 const { step } = timeTicks(buckets[0]?.from ?? 0, (buckets[0]?.from ?? 0) + span);
 return (
  <div className="columns" ref={ref} onMouseLeave={hide}>
   <div className="columns-plot">
    <i className="columns-grid" style={{ bottom: '100%' }}>
     <span>{max}</span>
    </i>
    <i className="columns-grid" style={{ bottom: '50%' }}>
     <span>{max / 2}</span>
    </i>
    {buckets.map((b, i) => (
     <div
      key={b.from}
      className="columns-slot"
      onMouseMove={(e) =>
       show(
        e,
        <>
         <b>
          {b.count} {unit}
         </b>
         <span>
          {clock(b.from)} – {clock(b.to)}
         </span>
        </>,
       )
      }
     >
      {b.count > 0 && (
       <span className="columns-bar" style={{ height: (b.count / max) * 100 + '%' }}>
        {i === peak && <em>{b.count}</em>}
       </span>
      )}
     </div>
    ))}
   </div>
   <div className="columns-axis" aria-hidden="true">
    {buckets.map((b, i) => (
     <span key={b.from}>{i % labelEvery === 0 ? tickLabel(b.from, step) : ''}</span>
    ))}
   </div>
   {node}
  </div>
 );
}

/** Yatay çubuk listesi: ad solda, değer sağda, çubuk ortada. */
export function BarList({
 items,
 empty,
 tone,
 format,
}: {
 items: { label: string; value: number; sub?: string; tone?: 'danger' | 'ok' }[];
 empty: string;
 tone?: 'danger';
 format?: (v: number) => string;
}) {
 const max = Math.max(1, ...items.map((i) => i.value));
 if (!items.length) return <div className="empty-state">{empty}</div>;
 return (
  <ul className="bar-list">
   {items.map((it) => (
    <li key={it.label}>
     <span className="bar-list-label" title={it.label}>
      {it.label}
      {it.sub && <small>{it.sub}</small>}
     </span>
     <span className="bar-list-track">
      <span className={'bar-list-bar ' + (it.tone || tone || '')} style={{ width: (it.value / max) * 100 + '%' }} />
     </span>
     <span className="bar-list-value mono">{format ? format(it.value) : it.value}</span>
    </li>
   ))}
  </ul>
 );
}
