// Alarm filtreleme modeli: ISA-18.2 durum × öncelik yüzeyleri + metin araması.
// Yüzey sayaçları "diğer yüzeyler uygulanmış" kümeden sayılır; böylece bir çipin
// yanındaki sayı, o çipe basılınca kaç satır kalacağını söyler.
import type { AlarmEvent, AlarmRule } from '../../../packages/contracts/model';

export type Severity = AlarmRule['severity'];
export type AlarmState = 'activeUnacked' | 'activeAcked' | 'clearUnacked' | 'clearAcked';
export type RuleState = 'enabled' | 'disabled' | 'shelved';

export const severityOrder: Severity[] = ['critical', 'warning', 'info'];
export const alarmStateOrder: AlarmState[] = ['activeUnacked', 'activeAcked', 'clearUnacked', 'clearAcked'];
export const alarmStateLabels: Record<AlarmState, string> = {
 activeUnacked: 'Aktif · onaysız',
 activeAcked: 'Aktif · onaylı',
 clearUnacked: 'Normale döndü · onaysız',
 clearAcked: 'Normale döndü · onaylı',
};
export const ruleStateLabels: Record<RuleState, string> = {
 enabled: 'Etkin',
 disabled: 'Devre dışı',
 shelved: 'Rafta',
};

export function alarmState(e: Pick<AlarmEvent, 'clearedAt' | 'ackAt'>): AlarmState {
 return e.clearedAt ? (e.ackAt ? 'clearAcked' : 'clearUnacked') : e.ackAt ? 'activeAcked' : 'activeUnacked';
}
export function ruleState(r: Pick<AlarmRule, 'enabled' | 'shelvedUntil'>, now = Date.now()): RuleState {
 return !r.enabled ? 'disabled' : r.shelvedUntil > now ? 'shelved' : 'enabled';
}

const fold = (s: string) => s.toLocaleLowerCase('tr-TR');
/** Boşlukla ayrılmış her kelime alanlardan birinde geçmeli (VE). `*` joker karakterdir. */
export function matchesText(q: string, fields: (string | undefined)[]) {
 const words = fold(q).split(/\s+/).filter(Boolean);
 if (!words.length) return true;
 const hay = fields.filter(Boolean).map((f) => fold(f!));
 return words.every((w) => {
  if (!w.includes('*')) return hay.some((h) => h.includes(w));
  const re = new RegExp(w.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
  return hay.some((h) => re.test(h));
 });
}

export type EventFilter = { q: string; severities: Severity[]; states: AlarmState[] };
export type RuleFilter = { q: string; severities: Severity[]; states: RuleState[]; kinds: AlarmRule['kind'][] };
export const emptyEventFilter = (): EventFilter => ({ q: '', severities: [], states: [] });
export const emptyRuleFilter = (): RuleFilter => ({ q: '', severities: [], states: [], kinds: [] });

const pass = <T>(selected: T[], value: T) => !selected.length || selected.includes(value);
const eventText = (e: AlarmEvent) => [e.name, e.tagCode, e.message];

export function filterEvents(list: AlarmEvent[], f: EventFilter, skip?: 'severities' | 'states') {
 return list.filter(
  (e) =>
   (skip === 'severities' || pass(f.severities, e.severity)) &&
   (skip === 'states' || pass(f.states, alarmState(e))) &&
   matchesText(f.q, eventText(e)),
 );
}
export function eventFacets(list: AlarmEvent[], f: EventFilter) {
 const severities = Object.fromEntries(severityOrder.map((s) => [s, 0])) as Record<Severity, number>;
 const states = Object.fromEntries(alarmStateOrder.map((s) => [s, 0])) as Record<AlarmState, number>;
 for (const e of filterEvents(list, f, 'severities')) severities[e.severity]++;
 for (const e of filterEvents(list, f, 'states')) states[alarmState(e)]++;
 return { severities, states };
}

export function filterRules(
 list: AlarmRule[],
 f: RuleFilter,
 tagCode: (id: string) => string | undefined,
 now = Date.now(),
 skip?: 'severities' | 'states' | 'kinds',
) {
 return list.filter(
  (r) =>
   (skip === 'severities' || pass(f.severities, r.severity)) &&
   (skip === 'states' || pass(f.states, ruleState(r, now))) &&
   (skip === 'kinds' || pass(f.kinds, r.kind)) &&
   matchesText(f.q, [r.name, tagCode(r.tagId), r.message]),
 );
}
export function ruleFacets(list: AlarmRule[], f: RuleFilter, tagCode: (id: string) => string | undefined, now = Date.now()) {
 const count = <K extends string>(keys: readonly K[], skip: 'severities' | 'states' | 'kinds', key: (r: AlarmRule) => K) => {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const r of filterRules(list, f, tagCode, now, skip)) out[key(r)]++;
  return out;
 };
 return {
  severities: count(severityOrder, 'severities', (r) => r.severity),
  states: count(['enabled', 'disabled', 'shelved'] as const, 'states', (r) => ruleState(r, now)),
  kinds: count(['high', 'low', 'bool', 'stale'] as const, 'kinds', (r) => r.kind),
 };
}

/** ISA-18.2 özet sırası: önce öncelik, sonra onaysız olan, sonra en yeni. */
export function sortEvents(list: AlarmEvent[], by: 'priority' | 'time') {
 const rank = (s: Severity) => severityOrder.indexOf(s);
 return list.slice().sort((a, b) =>
  by === 'time'
   ? b.raisedAt - a.raisedAt
   : rank(a.severity) - rank(b.severity) || Number(!!a.ackAt) - Number(!!b.ackAt) || b.raisedAt - a.raisedAt,
 );
}

export function toggle<T>(list: T[], value: T) {
 return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
export function activeFilterCount(f: { q: string } & Record<string, unknown>) {
 return (f.q.trim() ? 1 : 0) + Object.values(f).filter((v) => Array.isArray(v) && v.length).length;
}

/**
 * Aktif sekmenin grupları (sıra korunur): önce onay bekleyenler (normale dönmüş ama onaylanmamış
 * olanlar dahil — ISA-18.2'de onaysız alarm bekler), sonra onaylanmış ve süren alarmlar.
 */
export function groupActive(list: AlarmEvent[]) {
 return { pending: list.filter((a) => !a.ackAt), acked: list.filter((a) => a.ackAt && !a.clearedAt) };
}

/**
 * Bu vardiyada normale dönüp onaylanmış alarmlar (aktif listede artık olmayanlar), en yeni üstte.
 * Aynı olay aktif listede de varsa tekrar gösterilmez.
 */
export function clearedInShift(history: AlarmEvent[], active: AlarmEvent[], from: number, limit = 20) {
 const live = new Set(active.map((a) => a.id));
 return history
  .filter((e) => e.clearedAt && e.ackAt && e.clearedAt >= from && !live.has(e.id))
  .sort((a, b) => (b.clearedAt || 0) - (a.clearedAt || 0))
  .slice(0, limit);
}

/** Vardiya şeridindeki işaretler: aralıkta başlayan her olay bir kez, konumu 0..1. */
export function shiftMarks(events: AlarmEvent[], from: number, to: number) {
 const seen = new Set<string>(),
  span = Math.max(1, to - from);
 return events
  .filter((e) => e.raisedAt >= from && e.raisedAt <= to && !seen.has(e.id) && (seen.add(e.id), true))
  .sort((a, b) => a.raisedAt - b.raisedAt)
  .map((e) => ({ id: e.id, severity: e.severity, name: e.name, at: e.raisedAt, x: (e.raisedAt - from) / span, unacked: !e.ackAt }));
}
