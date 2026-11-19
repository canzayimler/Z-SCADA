// Alarm önceliği işareti ve vardiya şeridi (Alarmlar · Aktif).
// Öncelik renk + şekil + numarayla verilir: renk tek başına konuşmaz (renk körlüğü, ISA-101).
import type { AlarmRule } from '../../../packages/contracts/model';
import { shiftMarks } from './alarmFilter';

type Severity = AlarmRule['severity'];
const RANK: Record<Severity, number> = { critical: 1, warning: 2, info: 3 };

/** Kritik: kırmızı eşkenar dörtgen "1" · Uyarı: sarı üçgen "2" · Bilgi: gri daire "3". */
export function SevMark({ severity, size = 18 }: { severity: Severity; size?: number }) {
 const n = RANK[severity];
 return (
  <svg className={'sev-mark sev-' + severity} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
   {severity === 'critical' && <path d="M10 1.5 18.5 10 10 18.5 1.5 10Z" />}
   {severity === 'warning' && <path d="M10 2 19 18H1Z" />}
   {severity === 'info' && <circle cx="10" cy="10" r="8" />}
   <text x="10" y={severity === 'warning' ? 16 : severity === 'info' ? 13.6 : 14} textAnchor="middle">
    {n}
   </text>
  </svg>
 );
}

/** Vardiya boyunca başlayan alarmlar zaman çizgisinde; dikey çizgi "şimdi". */
export function ShiftStrip({ name, from, to, now, events, pending }: { name: string; from: number; to: number; now: number; events: Parameters<typeof shiftMarks>[0]; pending: number }) {
 const marks = shiftMarks(events, from, to),
  pct = (x: number) => Math.max(0, Math.min(100, x * 100)) + '%',
  hours = Array.from({ length: 9 }, (_, i) => from + i * 3600000),
  hh = (t: number) => String(new Date(t).getHours()).padStart(2, '0');
 return (
  <div className="shift-strip" aria-label={name + ' vardiyası alarm şeridi'}>
   <div className="ss-head">
    <strong>
     {name} vardiyası {hh(from)}:00–{hh(to) === '00' ? '24' : hh(to)}:00
    </strong>
    <span>
     {marks.length} alarm{pending > 0 ? ' · ' + pending + ' onay bekliyor' : ''}
    </span>
   </div>
   <div className="ss-track">
    <i className="ss-line" />
    <i className="ss-past" style={{ width: pct((now - from) / (to - from)) }} />
    <i className="ss-now" style={{ left: pct((now - from) / (to - from)) }} />
    {marks.map((m) => (
     <span key={m.id} className={'ss-mark' + (m.unacked ? ' unack' : '')} style={{ left: pct(m.x) }} title={new Date(m.at).toLocaleTimeString('tr-TR') + ' · ' + m.name}>
      <SevMark severity={m.severity} size={16} />
     </span>
    ))}
    {hours.map((t, i) => (
     <small key={t} className="ss-tick" style={{ left: pct(i / 8) }}>
      {i === 8 && hh(t) === '00' ? '24' : hh(t)}
     </small>
    ))}
   </div>
  </div>
 );
}
