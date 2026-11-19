/* Vardiya raporu için saf hesaplar: vardiya sınırları, zaman aralığı ön ayarları,
   grafik kovaları ve eksen işaretleri. Fabrika vardiyası 3×8: Gece 00–08, Gündüz 08–16, Akşam 16–24. */

export const SHIFTS = [
 { id: 'Gece', start: 0 },
 { id: 'Gündüz', start: 8 },
 { id: 'Akşam', start: 16 },
] as const;
export type ShiftName = (typeof SHIFTS)[number]['id'];

const HOUR = 3600000, DAY = 24 * HOUR;

const dayStart = (at: number) => {
 const d = new Date(at);
 d.setHours(0, 0, 0, 0);
 return d.getTime();
};

/** Anın içinde bulunduğu vardiya ve sınırları (yerel saat). */
export function shiftAt(at: number): { name: ShiftName; from: number; to: number } {
 const base = dayStart(at), hour = new Date(at).getHours();
 const s = [...SHIFTS].reverse().find((x) => hour >= x.start)!;
 const from = base + s.start * HOUR;
 return { name: s.id, from, to: from + 8 * HOUR };
}

export type RangePreset = 'shift' | 'prevShift' | 'today' | 'yesterday' | 'week' | 'month';
export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
 { id: 'shift', label: 'Bu vardiya' },
 { id: 'prevShift', label: 'Önceki vardiya' },
 { id: 'today', label: 'Bugün' },
 { id: 'yesterday', label: 'Dün' },
 { id: 'week', label: '7 gün' },
 { id: 'month', label: '30 gün' },
];

/** Ön ayarın aralığı. Süren vardiya/gün "şimdi"de biter: gelecek boş gösterilmez. */
export function presetRange(id: RangePreset, now = Date.now()): { from: number; to: number } {
 const cur = shiftAt(now);
 switch (id) {
  case 'shift':
   return { from: cur.from, to: now };
  case 'prevShift': {
   const prev = shiftAt(cur.from - 1);
   return { from: prev.from, to: prev.to };
  }
  case 'today':
   return { from: dayStart(now), to: now };
  case 'yesterday': {
   const to = dayStart(now);
   return { from: dayStart(to - 1), to };
  }
  case 'week':
   return { from: now - 7 * DAY, to: now };
  case 'month':
   return { from: now - 30 * DAY, to: now };
 }
}

/** Aralığa uyan kova boyu: vardiyada 30 dk, günde 1 sa, haftada 6 sa, ayda 1 gün. */
export function bucketSize(spanMs: number) {
 if (spanMs <= 12 * HOUR) return 30 * 60000;
 if (spanMs <= 2 * DAY) return HOUR;
 if (spanMs <= 8 * DAY) return 6 * HOUR;
 return DAY;
}

type Interval = { start: number; end: number };

/** Devreye girişleri (aralık içinde başlayan çevrimler) zaman kovalarına sayar. */
export function activationBuckets(intervals: Interval[], from: number, to: number) {
 const size = bucketSize(to - from);
 const n = Math.max(1, Math.ceil((to - from) / size));
 const buckets = Array.from({ length: n }, (_, i) => ({ from: from + i * size, to: Math.min(to, from + (i + 1) * size), count: 0 }));
 for (const it of intervals) {
  if (it.start <= from || it.start > to) continue; // aralık başında zaten açık olan çevrim "giriş" sayılmaz
  const i = Math.min(n - 1, Math.floor((it.start - from) / size));
  buckets[i].count++;
 }
 return buckets;
}

/** Zaman ekseni işaretleri: okunur adımlar, en fazla ~8 etiket. */
export function timeTicks(from: number, to: number, max = 8) {
 const span = to - from;
 const steps = [HOUR, 2 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY];
 const step = steps.find((s) => span / s <= max) ?? 7 * DAY;
 const ticks: number[] = [];
 // Adımı yerel gün başına hizala; saat etiketleri 00/06/12 gibi düz düşer.
 let t = dayStart(from);
 while (t < from) t += step;
 for (; t <= to; t += step) ticks.push(t);
 return { step, ticks };
}

export function tickLabel(at: number, step: number) {
 const d = new Date(at);
 const hm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
 if (step >= DAY) return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
 return d.getHours() === 0 ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) : hm;
}

/** Aralık başlığı: "25.09 08:00 – 25.09 16:00". */
export function rangeLabel(from: number, to: number) {
 const f = (at: number) =>
  new Date(at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
 return f(from) + ' – ' + f(to);
}
