/* Enerji analizörleri: canlı ölçüm, tüketim analizi (3 zamanlı tarife + reaktif oran) ve Excel.
   Analizör markadan bağımsızdır: her ölçüm rolü mevcut bir etikete eşlenir (Ayarlar sekmesi). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Download, Plus, RotateCcw, Trash2, Wand2, Pencil, X, Check } from 'lucide-react';
import type { Config, Live, User } from '../../../packages/contracts/model';
import { ENERGY_ROLES, energyRoleGroups, energyRole, suggestRoles, bandLabels, BANDS, imbalancePct, emptyEnergySettings, defaultTariff,
 type Analyzer, type EnergySettings, type Tariff, type ConsumptionBucket, type AnalyzerSummary, type Grouping, type Band } from '../../../packages/contracts/energy';
import { api } from './api';
import { SearchSelect } from './SearchSelect';
import { InfoTip } from './InfoTip';
import { LineChart, StackedColumns, nf, type LineSeries } from './EnergyCharts';
import { BarList } from './ReportCharts';
import { rangeLabel } from './reportModel';
import './energy.css';

type Props = { config: Config; live: Live; user: User; notify: (s: string, tone?: 'info' | 'error') => void };
type Tab = 'live' | 'usage' | 'setup';
type Consumption = { from: number; to: number; group: Grouping; tariff: Tariff; buckets: ConsumptionBucket[]; byAnalyzer: Record<string, number[]>; summaries: AnalyzerSummary[] };

const HOUR = 3600000, DAY = 24 * HOUR;
const dayStart = (at: number) => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d.getTime(); };
const monthStart = (at: number, add = 0) => { const d = new Date(at); d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() + add); return d.getTime(); };
type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'prevMonth' | 'year' | 'custom';
const PRESETS: { id: Exclude<Preset, 'custom'>; label: string }[] = [
 { id: 'today', label: 'Bugün' }, { id: 'yesterday', label: 'Dün' }, { id: 'week', label: '7 gün' },
 { id: 'month', label: 'Bu ay' }, { id: 'prevMonth', label: 'Geçen ay' }, { id: 'year', label: '12 ay' },
];
function presetRange(p: Exclude<Preset, 'custom'>, now = Date.now()) {
 switch (p) {
  case 'today': return { from: dayStart(now), to: now };
  case 'yesterday': return { from: dayStart(dayStart(now) - 1), to: dayStart(now) };
  case 'week': return { from: dayStart(now) - 6 * DAY, to: now };
  case 'month': return { from: monthStart(now), to: now };
  case 'prevMonth': return { from: monthStart(now, -1), to: monthStart(now) };
  case 'year': return { from: monthStart(now, -11), to: now };
 }
}
const autoGroup = (span: number): Grouping => (span <= 2 * DAY ? 'hour' : span <= 93 * DAY ? 'day' : 'month');
const groupLabel: Record<Grouping, string> = { hour: 'Saat', day: 'Gün', month: 'Ay' };
const bucketText = (at: number, g: Grouping) =>
 g === 'hour' ? new Date(at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', ...(Date.now() - at > DAY ? { day: '2-digit', month: '2-digit' } : {}) })
 : g === 'day' ? new Date(at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
 : new Date(at).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
const dtValue = (at: number) => { const d = new Date(at - new Date(at).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
const bandCls: Record<Band, string> = { day: 'b-day', peak: 'b-peak', night: 'b-night' };
const POWER_UNITS = new Set(['kW', 'kVAr', 'kVA']);

/** Canlı değer: etiket kalitesi iyi değilse null (bilinmiyor ≠ sıfır). */
function reading(live: Live, a: Analyzer, role: string): { v: number | null; q: string } {
 const tagId = a.roles[role];
 if (!tagId) return { v: null, q: 'none' };
 const s = live.samples[tagId];
 if (!s || typeof s.value !== 'number') return { v: null, q: s?.quality || 'unknown' };
 const v = POWER_UNITS.has(energyRole(role)!.unit) ? s.value * a.powerFactor : s.value;
 return { v: s.quality === 'good' ? v : null, q: s.quality };
}
function health(live: Live, a: Analyzer) {
 const ids = Object.values(a.roles);
 const good = ids.filter((id) => live.samples[id]?.quality === 'good').length;
 return { total: ids.length, good, status: !ids.length ? 'empty' : good === ids.length ? 'ok' : good ? 'partial' : 'down' } as const;
}
const statusText = { ok: 'Güncel', partial: 'Kısmen güncel', down: 'Veri yok', empty: 'Eşleme yok' };

export function Energy({ config, live, user, notify }: Props) {
 const canEdit = user.role === 'admin' || user.role === 'designer';
 const [settings, setSettings] = useState<EnergySettings>(emptyEnergySettings);
 const [revision, setRevision] = useState(0);
 const [loaded, setLoaded] = useState(false);
 const [tab, setTab] = useState<Tab>(() => { try { return (sessionStorage.getItem('energy.tab') as Tab) || 'live'; } catch { return 'live'; } });
 const pickTab = (t: Tab) => { setTab(t); try { sessionStorage.setItem('energy.tab', t); } catch { /* yok */ } };
 const load = useCallback(async () => {
  try { const r = await api<{ settings: EnergySettings; revision: number }>('/energy'); setSettings(r.settings); setRevision(r.revision); }
  catch (e) { notify((e as Error).message, 'error'); } finally { setLoaded(true); }
 }, [notify]);
 useEffect(() => { void load(); }, [load]);
 const save = async (next: EnergySettings) => {
  try { const r = await api<{ settings: EnergySettings; revision: number }>('/energy', 'PUT', { settings: next, revision }); setSettings(r.settings); setRevision(r.revision); notify('Analizör ayarları kaydedildi.'); return true; }
  catch (e) { notify((e as Error).message, 'error'); if ((e as any).status === 409) void load(); return false; }
 };
 const analyzers = settings.analyzers;
 const tabs: { id: Tab; label: string; count?: number }[] = [{ id: 'live', label: 'Canlı' }, { id: 'usage', label: 'Tüketim' }, ...(canEdit ? [{ id: 'setup' as Tab, label: 'Analizörler', count: analyzers.length }] : [])];
 const ti = Math.max(0, tabs.findIndex((t) => t.id === tab));
 const current = tabs[ti]?.id || 'live';
 // Diğer yönetim sayfalarıyla aynı kabuk: .management boşluğu + "Proje yönetimi" başlığı.
 return (
  <div className="management">
  <div className="page-title">
   <div>
    <span className="eyebrow">İzleme</span>
    <div className="title-row"><h1>Enerji analizörleri</h1><InfoTip>Analizörlerin anlık güç, akım ve gerilimi; günlük ve tarife bandına göre tüketim.</InfoTip></div>
   </div>
  </div>
  <div className="shift-report energy">
   <div className="page-tabs report-tabs" role="tablist" aria-label="Enerji bölümü" style={{ '--tab-i': ti, '--tab-n': tabs.length } as React.CSSProperties}>
    <span className="page-tabs-indicator" aria-hidden="true" />
    {tabs.map((t) => <button key={t.id} role="tab" aria-selected={current === t.id} onClick={() => pickTab(t.id)}>{t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}</button>)}
   </div>
   {!loaded ? <div className="empty-state">Yükleniyor…</div>
    : !analyzers.length && current !== 'setup' ? (
     <div className="report-card report-empty">
      <p>Henüz analizör tanımlı değil. Analizörün ölçüm etiketlerini (güç, akım, kWh sayacı…) eşleyerek başlayın.</p>
      {canEdit ? <button className="btn small primary" onClick={() => pickTab('setup')}><Plus size={14} />Analizör ekle</button> : <p>Tanımlamayı yönetici veya tasarımcı yapar.</p>}
     </div>
    ) : current === 'live' ? <LiveTab analyzers={analyzers} tariff={settings.tariff} live={live} config={config} />
    : current === 'usage' ? <UsageTab analyzers={analyzers} notify={notify} />
    : <SetupTab settings={settings} config={config} live={live} onSave={save} />}
  </div>
  </div>
 );
}

/* ---------------------------------------------------------------- Canlı */
function LiveTab({ analyzers, tariff, live, config }: { analyzers: Analyzer[]; tariff: Tariff; live: Live; config: Config }) {
 const active = analyzers.filter((a) => a.enabled);
 const [sel, setSel] = useState(active[0]?.id || '');
 const [today, setToday] = useState<Consumption | null>(null);
 useEffect(() => {
  let stop = false;
  const pull = () => api<Consumption>(`/energy/consumption?from=${dayStart(Date.now())}&to=${Date.now()}&group=hour`).then((r) => { if (!stop) setToday(r); }).catch(() => {});
  pull(); const t = setInterval(pull, 60000);
  return () => { stop = true; clearInterval(t); };
 }, []);
 const selected = active.find((a) => a.id === sel) || active[0];
 const sumOf = (id: string) => today?.summaries.find((s) => s.analyzerId === id);
 const totalP = active.reduce((n, a) => { const r = reading(live, a, 'p'); return r.v === null ? n : n + r.v; }, 0);
 const pKnown = active.filter((a) => reading(live, a, 'p').v !== null).length;
 const totalKwh = today?.summaries.reduce((n, s) => n + s.ea, 0) ?? null, totalCost = today?.summaries.reduce((n, s) => n + s.cost, 0) ?? null;
 const over = today?.summaries.filter((s) => s.inductiveOver || s.capacitiveOver) || [];
 const cur = tariff.currency;
 return (
  <>
   <div className="report-kpis">
    <div><span>Anlık toplam güç</span><strong>{pKnown ? nf(totalP, 1) : '—'} <em>kW</em></strong><small>{pKnown}/{active.length} analizör okunuyor</small></div>
    <div><span>Bugün tüketim</span><strong>{nf(totalKwh, 1)} <em>kWh</em></strong><small>00:00'dan bu yana</small></div>
    <div><span>Bugün maliyet</span><strong>{nf(totalCost, 2)} <em>{cur}</em></strong><small>{tariff.priceDay || tariff.pricePeak || tariff.priceNight ? 'dilim fiyatlarıyla' : 'birim fiyat girilmedi'}</small></div>
    <div className={over.length ? 'warn' : ''}><span>Reaktif oran (bugün)</span><strong>{over.length ? over.length + ' sınır aşımı' : 'Sınır içinde'}</strong><small>endüktif %{tariff.inductiveLimitPct} · kapasitif %{tariff.capacitiveLimitPct}</small></div>
   </div>
   <div className="e-cards">
    {active.map((a) => <AnalyzerCard key={a.id} a={a} live={live} summary={sumOf(a.id)} tariff={tariff} selected={selected?.id === a.id} onSelect={() => setSel(a.id)} />)}
   </div>
   {selected && <TrendCard a={selected} live={live} config={config} />}
  </>
 );
}

function AnalyzerCard({ a, live, summary, tariff, selected, onSelect }: { a: Analyzer; live: Live; summary?: AnalyzerSummary; tariff: Tariff; selected: boolean; onSelect: () => void }) {
 const r = (k: string) => reading(live, a, k), h = health(live, a);
 const has = (k: string) => !!a.roles[k];
 const phases = [1, 2, 3];
 const vImb = imbalancePct(phases.map((i) => r('v' + i).v)), iImb = imbalancePct(phases.map((i) => r('i' + i).v));
 const thdV = Math.max(...phases.map((i) => r('thdv' + i).v ?? -1)), thdI = Math.max(...phases.map((i) => r('thdi' + i).v ?? -1));
 const cell = (k: string, d = 1) => { const x = r(k); return <td className={'mono' + (x.q !== 'good' && x.q !== 'none' ? ' e-stale' : '')} title={x.q !== 'good' && x.q !== 'none' ? 'Veri güncel değil' : undefined}>{has(k) ? nf(x.v, d) : ''}</td>; };
 const anyPhase = phases.some((i) => has('v' + i) || has('i' + i) || has('p' + i));
 const pf = r('pf');
 return (
  <section className={'report-card e-card' + (selected ? ' selected' : '')} onClick={onSelect} role="button" tabIndex={0} aria-pressed={selected} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}>
   <header>
    <div className="e-card-title"><h3>{a.name}</h3>{a.group && <small>{a.group}</small>}</div>
    <span className={'e-health ' + h.status} title={`${h.good}/${h.total} etiket güncel`}><i />{statusText[h.status]}</span>
   </header>
   <div className="e-main">
    <div className="e-big"><span>Aktif güç</span><strong className="mono">{has('p') ? nf(r('p').v, 1) : '—'}</strong><em>kW</em></div>
    <dl className="e-mini">
     {has('q') && <><dt>Q</dt><dd className="mono">{nf(r('q').v, 1)} <small>kVAr</small></dd></>}
     {has('s') && <><dt>S</dt><dd className="mono">{nf(r('s').v, 1)} <small>kVA</small></dd></>}
     {has('pf') && <><dt>cosφ</dt><dd className="mono">{nf(pf.v, 3)}</dd></>}
     {has('f') && <><dt>f</dt><dd className="mono">{nf(r('f').v, 2)} <small>Hz</small></dd></>}
    </dl>
   </div>
   {anyPhase && (
    <table className="e-phase"><thead><tr><th /><th>L1</th><th>L2</th><th>L3</th><th>Dengesizlik</th></tr></thead><tbody>
     {phases.some((i) => has('v' + i)) && <tr><th>V</th>{cell('v1')}{cell('v2')}{cell('v3')}<td className="mono">{vImb === null ? '' : '%' + nf(vImb, 1)}</td></tr>}
     {phases.some((i) => has('i' + i)) && <tr><th>A</th>{cell('i1')}{cell('i2')}{cell('i3')}<td className="mono">{iImb === null ? '' : '%' + nf(iImb, 1)}</td></tr>}
     {phases.some((i) => has('p' + i)) && <tr><th>kW</th>{cell('p1')}{cell('p2')}{cell('p3')}<td /></tr>}
    </tbody></table>
   )}
   <div className="e-foot">
    {(thdV >= 0 || thdI >= 0) && <span>THD {thdV >= 0 && <>V <b className="mono">%{nf(thdV, 1)}</b></>} {thdI >= 0 && <>I <b className="mono">%{nf(thdI, 1)}</b></>}</span>}
    <span>Bugün <b className="mono">{nf(summary?.ea, 1)}</b> kWh</span>
    {summary?.demandMax !== null && summary?.demandMax !== undefined && <span>Maks. talep <b className="mono">{nf(summary.demandMax, 1)}</b> kW</span>}
    {summary && (summary.inductivePct !== null || summary.capacitivePct !== null) && (
     <span className={summary.inductiveOver || summary.capacitiveOver ? 'e-over' : ''}>
      Reaktif {summary.inductivePct !== null && <>ind. <b className="mono">%{nf(summary.inductivePct, 1)}</b></>} {summary.capacitivePct !== null && <>kap. <b className="mono">%{nf(summary.capacitivePct, 1)}</b></>}
      {(summary.inductiveOver || summary.capacitiveOver) && <strong> · sınır aşıldı (%{summary.inductiveOver ? tariff.inductiveLimitPct : tariff.capacitiveLimitPct})</strong>}
     </span>
    )}
   </div>
  </section>
 );
}

const METRICS: { id: string; label: string; roles: string[]; unit: string; decimals: number; zero?: boolean }[] = [
 { id: 'p', label: 'Aktif güç', roles: ['p'], unit: 'kW', decimals: 1, zero: true },
 { id: 'pp', label: 'Faz güçleri', roles: ['p1', 'p2', 'p3'], unit: 'kW', decimals: 1, zero: true },
 { id: 'i', label: 'Akım', roles: ['i1', 'i2', 'i3'], unit: 'A', decimals: 1, zero: true },
 { id: 'v', label: 'Gerilim', roles: ['v1', 'v2', 'v3'], unit: 'V', decimals: 1 },
 { id: 'pf', label: 'cosφ', roles: ['pf'], unit: '', decimals: 3 },
 { id: 'q', label: 'Reaktif', roles: ['q'], unit: 'kVAr', decimals: 1 },
 { id: 'thdv', label: 'THD-V', roles: ['thdv1', 'thdv2', 'thdv3'], unit: '%', decimals: 1, zero: true },
 { id: 'thdi', label: 'THD-I', roles: ['thdi1', 'thdi2', 'thdi3'], unit: '%', decimals: 1, zero: true },
];
// Vardiya bazli pencere yok (kullanıcı kararı, 28.09): kisa pencereler + gunluk (bugun 00:00'dan simdiye).
const WINDOWS = [{ ms: 15 * 60000, label: '15 dk' }, { ms: HOUR, label: '1 sa' }, { ms: DAY, label: 'Günlük' }];
const windowFrom = (win: number, now: number) => (win === DAY ? dayStart(now) : now - win);

function TrendCard({ a, live }: { a: Analyzer; live: Live; config: Config }) {
 const metrics = METRICS.filter((m) => m.roles.some((r) => a.roles[r]));
 const [mid, setMid] = useState('p'), [win, setWin] = useState(HOUR);
 const m = metrics.find((x) => x.id === mid) || metrics[0];
 const roles = m ? m.roles.filter((r) => a.roles[r]) : [];
 const tagKey = roles.map((r) => a.roles[r]).join(',');
 const [hist, setHist] = useState<Record<string, { at: number; value: number | null }[]>>({});
 const extra = useRef<Record<string, { at: number; value: number | null }[]>>({});
 const [, bump] = useState(0);
 useEffect(() => {
  if (!tagKey) return;
  let stop = false;
  const pull = () => {
   const to = Date.now(), from = windowFrom(win, to);
   api<{ series: Record<string, { at: number; value: number | null; quality: string }[]> }>(`/history?tagIds=${encodeURIComponent(tagKey)}&from=${from}&to=${to}&maxPoints=600`)
    .then((r) => { if (stop) return; extra.current = {}; setHist(Object.fromEntries(Object.entries(r.series).map(([k, v]) => [k, v.map((p) => ({ at: p.at, value: p.quality === 'good' ? p.value : null }))]))); })
    .catch(() => {});
  };
  pull(); const t = setInterval(pull, Math.max(30000, win / 20));
  return () => { stop = true; clearInterval(t); };
 }, [tagKey, win]);
 // Canlı örnekler arada grafiğe eklenir; bir sonraki geçmiş çekiminde sıfırlanır.
 useEffect(() => {
  let changed = false;
  for (const id of tagKey.split(',').filter(Boolean)) {
   const s = live.samples[id]; if (!s) continue;
   const at = s.sampledAt || s.receivedAt, list = (extra.current[id] ||= []), last = list[list.length - 1]?.at ?? hist[id]?.[hist[id].length - 1]?.at ?? 0;
   if (at > last) { list.push({ at, value: s.quality === 'good' && typeof s.value === 'number' ? s.value : null }); changed = true; if (list.length > 2000) list.shift(); }
  }
  if (changed) bump((n) => n + 1);
 }, [live.samples, tagKey, hist]);
 if (!m) return null;
 const now = Date.now(), factor = POWER_UNITS.has(m.unit) ? a.powerFactor : 1;
 const series: LineSeries[] = roles.map((r, i) => {
  const id = a.roles[r], pts = [...(hist[id] || []), ...(extra.current[id] || [])];
  return { id: r, label: energyRole(r)!.short, cls: 'l' + (roles.length > 1 ? i + 1 : 1), points: pts.map((p) => ({ at: p.at, value: p.value === null ? null : p.value * factor })) };
 });
 return (
  <section className="report-card e-trend">
   <header>
    <h3>{a.name} · {m.label}</h3>
    <div className="e-trend-tools">
     <div className="report-presets" role="group" aria-label="Ölçüm">{metrics.map((x) => <button key={x.id} className={x.id === m.id ? 'active' : ''} aria-pressed={x.id === m.id} onClick={() => setMid(x.id)}>{x.label}</button>)}</div>
     <div className="report-presets" role="group" aria-label="Pencere">{WINDOWS.map((w) => <button key={w.ms} className={w.ms === win ? 'active' : ''} aria-pressed={w.ms === win} onClick={() => setWin(w.ms)} title={w.ms === DAY ? "Bugün 00:00'dan şimdiye" : undefined}>{w.label}</button>)}</div>
    </div>
   </header>
   {series.length > 1 && <div className="chart-legend">{series.map((s) => <span key={s.id}><i className={'lg-line ' + s.cls} />{s.label}</span>)}</div>}
   <LineChart series={series} from={windowFrom(win, now)} to={now} unit={m.unit} decimals={m.decimals} zero={m.zero} />
  </section>
 );
}

/* ---------------------------------------------------------------- Tüketim */
function UsageTab({ analyzers, notify }: { analyzers: Analyzer[]; notify: Props['notify'] }) {
 const [preset, setPreset] = useState<Preset>('month');
 const [range, setRange] = useState(() => presetRange('month'));
 const [custom, setCustom] = useState(false), [cFrom, setCFrom] = useState(range.from), [cTo, setCTo] = useState(range.to);
 const [groupPick, setGroupPick] = useState<Grouping | null>(null);
 const [ids, setIds] = useState<string[]>(() => analyzers.map((a) => a.id));
 const [pickOpen, setPickOpen] = useState(false);
 const [data, setData] = useState<Consumption | null>(null), [busy, setBusy] = useState(false);
 const span = range.to - range.from, group: Grouping = groupPick && !(groupPick === 'hour' && span > 93 * DAY) ? groupPick : autoGroup(span);
 const idsKey = ids.join(',');
 const pull = useCallback(async () => {
  setBusy(true);
  try { setData(await api<Consumption>(`/energy/consumption?from=${Math.round(range.from)}&to=${Math.round(range.to)}&group=${group}&ids=${encodeURIComponent(idsKey)}`)); }
  catch (e) { notify((e as Error).message, 'error'); } finally { setBusy(false); }
 }, [range, group, idsKey, notify]);
 useEffect(() => { if (idsKey) void pull(); else setData(null); }, [pull, idsKey]);
 const pick = (p: Exclude<Preset, 'custom'>) => { setPreset(p); setRange(presetRange(p)); setCustom(false); };
 const cur = data?.tariff.currency || 'TL';
 const sums = data?.summaries || [];
 const tot = (f: (s: AnalyzerSummary) => number) => sums.reduce((n, s) => n + f(s), 0);
 const ea = tot((s) => s.ea), eqi = tot((s) => s.eqi), eqc = tot((s) => s.eqc), cost = tot((s) => s.cost);
 const peak = sums.reduce<AnalyzerSummary | null>((b, s) => (s.demandMax !== null && (!b || s.demandMax > (b.demandMax ?? -1)) ? s : b), null);
 const gaps = tot((s) => s.gapHours);
 const anyEqi = analyzers.some((a) => ids.includes(a.id) && a.roles.eqi), anyEqc = analyzers.some((a) => ids.includes(a.id) && a.roles.eqc);
 const over = sums.filter((s) => s.inductiveOver || s.capacitiveOver);
 const href = `/api/energy/export?from=${Math.round(range.from)}&to=${Math.round(range.to)}&ids=${encodeURIComponent(idsKey)}`;
 const parts = BANDS.map((b) => ({ key: b, label: bandLabels[b], cls: bandCls[b] }));
 const t = data?.tariff || defaultTariff;
 return (
  <>
   <div className="report-head">
    <div className="report-title"><span className="report-eyebrow">Tüketim analizi</span><span className="report-range mono">{rangeLabel(range.from, range.to)}</span></div>
    <div className="report-head-actions">
     <button className="btn small" disabled={busy} onClick={() => void pull()}><RotateCcw size={14} />Yenile</button>
     <a className={'btn small primary' + (!idsKey ? ' disabled' : '')} href={idsKey ? href : undefined} aria-disabled={!idsKey}><Download size={14} />Excel indir</a>
    </div>
   </div>
   <div className="report-toolbar">
    <div className="report-presets" role="group" aria-label="Zaman aralığı">
     {PRESETS.map((p) => <button key={p.id} className={preset === p.id ? 'active' : ''} aria-pressed={preset === p.id} onClick={() => pick(p.id)}>{p.label}</button>)}
     <div className="report-column-filter report-custom">
      <button className={preset === 'custom' ? 'active' : ''} aria-pressed={preset === 'custom'} aria-expanded={custom} onClick={() => { setCFrom(range.from); setCTo(range.to); setCustom(!custom); }}><CalendarDays size={13} />Özel</button>
      {custom && <div className="report-filter-popover date" role="dialog" aria-label="Özel aralık" onKeyDown={(e) => { if (e.key === 'Escape') setCustom(false); }}>
       <label><span>Başlangıç</span><input autoFocus type="datetime-local" value={dtValue(cFrom)} onChange={(e) => { const v = new Date(e.target.value).getTime(); if (Number.isFinite(v)) setCFrom(v); }} /></label>
       <label><span>Bitiş</span><input type="datetime-local" value={dtValue(cTo)} onChange={(e) => { const v = new Date(e.target.value).getTime(); if (Number.isFinite(v)) setCTo(v); }} /></label>
       <div className="report-filter-footer"><span>{cTo <= cFrom ? 'Bitiş başlangıçtan sonra olmalı' : ''}</span><button className="btn small primary" disabled={cTo <= cFrom} onClick={() => { setPreset('custom'); setRange({ from: cFrom, to: cTo }); setCustom(false); }}>Uygula</button></div>
      </div>}
     </div>
    </div>
    <div className="e-toolbar-right">
     <div className="report-presets" role="group" aria-label="Gruplama">
      {(['hour', 'day', 'month'] as Grouping[]).map((g) => <button key={g} disabled={g === 'hour' && span > 93 * DAY} className={group === g ? 'active' : ''} aria-pressed={group === g} onClick={() => setGroupPick(g)}>{groupLabel[g]}</button>)}
     </div>
     <div className="report-column-filter report-signal-pick">
      <button className={'btn small' + (!ids.length ? ' primary' : '')} aria-expanded={pickOpen} onClick={() => setPickOpen(!pickOpen)}>Analizörler<b className="tab-count">{ids.length}/{analyzers.length}</b></button>
      {pickOpen && <div className="report-filter-popover" role="dialog" aria-label="Analizör seçimi" onKeyDown={(e) => { if (e.key === 'Escape') setPickOpen(false); }}>
       <div className="e-pick-actions"><button className="link-btn" onClick={() => setIds(analyzers.map((a) => a.id))}>Tümü</button><button className="link-btn" onClick={() => setIds([])}>Hiçbiri</button></div>
       <div className="e-pick-list">{analyzers.map((a) => <label key={a.id} className="check"><input type="checkbox" checked={ids.includes(a.id)} onChange={() => setIds(ids.includes(a.id) ? ids.filter((x) => x !== a.id) : analyzers.filter((x) => x.id === a.id || ids.includes(x.id)).map((x) => x.id))} />{a.name}{a.group && <small>{a.group}</small>}</label>)}</div>
      </div>}
     </div>
    </div>
   </div>
   {!idsKey ? <div className="report-card report-empty"><p>Analiz için en az bir analizör seçin.</p></div> : !data ? <div className="empty-state">Yükleniyor…</div> : <>
    <div className="report-kpis">
     <div><span>Toplam tüketim</span><strong>{nf(ea, 1)} <em>kWh</em></strong><small>{BANDS.map((b) => bandLabels[b] + ' %' + nf(ea ? tot((s) => s.byBand[b]) / ea * 100 : 0, 0)).join(' · ')}</small></div>
     <div><span>Maliyet</span><strong>{nf(cost, 2)} <em>{cur}</em></strong><small>{ea ? 'ort. ' + nf(cost / ea, 3) + ' ' + cur + '/kWh' : t.priceDay || t.pricePeak || t.priceNight ? '' : 'birim fiyat girilmedi'}</small></div>
     <div><span>Maks. talep ({t.demandMinutes} dk)</span><strong>{nf(peak?.demandMax, 1)} <em>kW</em></strong><small>{peak ? peak.name + ' · ' + new Date(peak.demandAt!).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'aktif güç eşlenmedi'}</small></div>
     <div className={over.length ? 'warn' : ''}><span>Reaktif / aktif</span><strong>{anyEqi || anyEqc ? <>{anyEqi && <>ind. %{nf(ea ? eqi / ea * 100 : null, 1)}</>}{anyEqi && anyEqc && ' · '}{anyEqc && <>kap. %{nf(ea ? eqc / ea * 100 : null, 1)}</>}</> : '—'}</strong><small>{over.length ? over.length + ' analizörde sınır aşıldı' : anyEqi || anyEqc ? `sınır %${t.inductiveLimitPct} / %${t.capacitiveLimitPct}` : 'reaktif sayaç eşlenmedi'}</small></div>
    </div>
    {gaps > 0 && <div className="report-note">{gaps} saatlik kovada eksik veri var: kesinti boyunca sayaç farkı saatlere eşit dağıtıldı; toplam doğru, saat dağılımı tahmindir.</div>}
    <section className="report-card">
     <header><h3>Tüketim · {groupLabel[group].toLowerCase()}lik</h3><div className="chart-legend">{parts.map((p) => <span key={p.key}><i className={p.cls} />{p.label}</span>)}<span className="muted">kWh</span></div></header>
     <StackedColumns unit="kWh" parts={parts} label={(at) => bucketText(at, group)} buckets={data.buckets.map((b) => ({ from: b.from, values: b.byBand }))} flag={(i) => data.buckets[i].gap > 0}
      tipExtra={(i) => { const b = data.buckets[i]; return <>{b.cost > 0 && <span>Maliyet: {nf(b.cost, 2)} {cur}</span>}{b.demandMax !== null && <span>Maks. talep: {nf(b.demandMax, 1)} kW</span>}{b.gap > 0 && <span>Eksik veri içeriyor</span>}</>; }} />
    </section>
    <div className="report-split">
     <section className="report-card">
      <header><h3>Analizör sıralaması</h3><span className="muted">kWh</span></header>
      <BarList format={(v) => nf(v, 0)} items={sums.filter((s) => s.ea > 0).sort((a, b) => b.ea - a.ea).slice(0, 10).map((s) => ({ label: s.name, value: s.ea, sub: ea ? '%' + nf(s.ea / ea * 100, 1) : undefined }))} empty="Bu aralıkta tüketim yok." />
     </section>
     <section className="report-card">
      <header><h3>Tarife dilimleri</h3><span className="muted">kWh · {cur}</span></header>
      <ul className="e-bands">{BANDS.map((b) => { const k = tot((s) => s.byBand[b]), c = tot((s) => s.costByBand[b]); return <li key={b}><i className={bandCls[b]} /><span>{bandLabels[b]}<small>{b === 'day' ? `${pad(t.dayStart)}–${pad(t.peakStart)}` : b === 'peak' ? `${pad(t.peakStart)}–${pad(t.nightStart)}` : `${pad(t.nightStart)}–${pad(t.dayStart)}`}</small></span><b className="mono">{nf(k, 1)}</b><b className="mono">{nf(c, 2)}</b><span className="share-track"><span className={bandCls[b]} style={{ width: (ea ? k / ea * 100 : 0) + '%' }} /></span></li>; })}</ul>
     </section>
    </div>
    <section className="report-card flush">
     <header><h3>Analizör özeti</h3><span className="muted">{sums.length} analizör</span></header>
     <div className="table-wrap"><table className="e-table"><thead><tr><th>Analizör</th><th>kWh</th>{BANDS.map((b) => <th key={b}>{bandLabels[b]}</th>)}<th>{cur}</th><th>Endüktif</th><th>Kapasitif</th><th>Maks. talep</th><th>Ort. / maks. P</th><th>Eksik</th></tr></thead>
      <tbody>{sums.map((s) => <tr key={s.analyzerId}>
       <td><strong>{s.name}</strong>{s.group && <small>{s.group}</small>}</td>
       <td className="mono">{nf(s.ea, 1)}</td>{BANDS.map((b) => <td key={b} className="mono">{nf(s.byBand[b], 1)}</td>)}<td className="mono">{nf(s.cost, 2)}</td>
       <td className={'mono' + (s.inductiveOver ? ' e-over' : '')}>{s.inductivePct === null ? '—' : '%' + nf(s.inductivePct, 1)}{s.inductiveOver && <small>sınır aşıldı</small>}</td>
       <td className={'mono' + (s.capacitiveOver ? ' e-over' : '')}>{s.capacitivePct === null ? '—' : '%' + nf(s.capacitivePct, 1)}{s.capacitiveOver && <small>sınır aşıldı</small>}</td>
       <td className="mono">{nf(s.demandMax, 1)}{!!s.demandAt && <small>{new Date(s.demandAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit' })}</small>}</td>
       <td className="mono">{nf(s.pAvg, 1)} / {nf(s.pMax, 1)}</td>
       <td className="mono">{s.gapHours ? s.gapHours + ' sa' : ''}</td>
      </tr>)}</tbody>
      {sums.length > 1 && <tfoot><tr><td>Toplam</td><td className="mono">{nf(ea, 1)}</td>{BANDS.map((b) => <td key={b} className="mono">{nf(tot((s) => s.byBand[b]), 1)}</td>)}<td className="mono">{nf(cost, 2)}</td><td className="mono">{anyEqi && ea ? '%' + nf(eqi / ea * 100, 1) : ''}</td><td className="mono">{anyEqc && ea ? '%' + nf(eqc / ea * 100, 1) : ''}</td><td /><td /><td /></tr></tfoot>}
     </table></div>
    </section>
   </>}
  </>
 );
}
const pad = (h: number) => String(h).padStart(2, '0');

/* ---------------------------------------------------------------- Ayarlar */
const newId = () => 'an-' + Math.random().toString(36).slice(2, 10);
function SetupTab({ settings, config, live, onSave }: { settings: EnergySettings; config: Config; live: Live; onSave: (s: EnergySettings) => Promise<boolean> }) {
 const [edit, setEdit] = useState<Analyzer | null>(null);
 const [confirmDel, setConfirmDel] = useState<string | null>(null);
 const [tariff, setTariff] = useState<Tariff>(settings.tariff);
 useEffect(() => setTariff(settings.tariff), [settings.tariff]);
 const tariffDirty = JSON.stringify(tariff) !== JSON.stringify(settings.tariff);
 const tariffError = !(tariff.dayStart < tariff.peakStart && tariff.peakStart < tariff.nightStart) ? 'Dilim saatleri sıralı olmalı: gündüz < puant < gece.' : '';
 const saveAnalyzer = async (a: Analyzer) => {
  const list = settings.analyzers.some((x) => x.id === a.id) ? settings.analyzers.map((x) => (x.id === a.id ? a : x)) : [...settings.analyzers, a];
  if (await onSave({ ...settings, analyzers: list })) setEdit(null);
 };
 const remove = async (id: string) => { if (await onSave({ ...settings, analyzers: settings.analyzers.filter((x) => x.id !== id) })) { setConfirmDel(null); if (edit?.id === id) setEdit(null); } };
 const num = (k: keyof Tariff, v: string) => setTariff({ ...tariff, [k]: v === '' ? 0 : Number(v) });
 if (edit) return <AnalyzerEditor value={edit} config={config} live={live} isNew={!settings.analyzers.some((x) => x.id === edit.id)} onCancel={() => setEdit(null)} onSave={saveAnalyzer} />;
 return (
  <>
   <section className="report-card flush">
    <header><h3>Analizörler</h3><button className="btn small primary" onClick={() => setEdit({ id: newId(), name: '', group: '', roles: {}, powerFactor: 1, energyFactor: 1, enabled: true })}><Plus size={14} />Analizör ekle</button></header>
    <div className="table-wrap"><table className="e-table"><thead><tr><th>Analizör</th><th>Grup</th><th>Eşlenen ölçüm</th><th>Enerji kaynağı</th><th>Durum</th><th /></tr></thead>
     <tbody>{settings.analyzers.map((a) => { const h = health(live, a); return <tr key={a.id}>
      <td><strong>{a.name}</strong>{!a.enabled && <small>Devre dışı</small>}</td><td>{a.group || '—'}</td>
      <td className="mono">{Object.keys(a.roles).length} / {ENERGY_ROLES.length}</td>
      <td>{a.roles.ea ? 'kWh sayacı' : a.roles.p ? 'Güç entegrasyonu' : <span className="e-over">Yok: kWh sayacı veya aktif güç eşleyin</span>}</td>
      <td><span className={'e-health ' + h.status}><i />{statusText[h.status]}</span></td>
      <td className="e-row-actions">{confirmDel === a.id
       ? <><span>Silinsin mi? Geçmiş tüketim kayıtları kalır.</span><button className="btn small danger" onClick={() => void remove(a.id)}><Check size={13} />Sil</button><button className="btn small" onClick={() => setConfirmDel(null)}>Vazgeç</button></>
       : <><button className="icon-btn" aria-label={a.name + ' düzenle'} title="Düzenle" onClick={() => setEdit(a)}><Pencil size={14} /></button><button className="icon-btn" aria-label={a.name + ' sil'} title="Sil" onClick={() => setConfirmDel(a.id)}><Trash2 size={14} /></button></>}</td>
     </tr>; })}</tbody></table>
     {!settings.analyzers.length && <div className="empty-state">Henüz analizör yok. "Analizör ekle" ile cihaz seçip etiketleri eşleyin.</div>}
    </div>
   </section>
   <section className="report-card">
    <header><h3>Tarife ve sınırlar <InfoTip label="Tarife açıklaması">Üç zamanlı tarife: dilim her saatlik kovanın başlangıç saatine göre belirlenir. Fiyat değişikliği geçmiş raporlara da uygulanır (tüketim kWh olarak saklanır, maliyet rapor anında hesaplanır). Reaktif oran = reaktif enerji / aktif enerji; yönetmelik varsayılanı endüktif %20, kapasitif %15.</InfoTip></h3></header>
    <div className="e-form">
     <label className="field"><span>Gündüz başlangıcı (saat)</span><input type="number" min={0} max={23} value={tariff.dayStart} onChange={(e) => num('dayStart', e.target.value)} /></label>
     <label className="field"><span>Puant başlangıcı</span><input type="number" min={0} max={23} value={tariff.peakStart} onChange={(e) => num('peakStart', e.target.value)} /></label>
     <label className="field"><span>Gece başlangıcı</span><input type="number" min={0} max={23} value={tariff.nightStart} onChange={(e) => num('nightStart', e.target.value)} /></label>
     <label className="field"><span>Para birimi</span><input value={tariff.currency} maxLength={8} onChange={(e) => setTariff({ ...tariff, currency: e.target.value })} /></label>
     <label className="field"><span>Gündüz fiyatı ({tariff.currency}/kWh)</span><input type="number" min={0} step="0.0001" value={tariff.priceDay} onChange={(e) => num('priceDay', e.target.value)} /></label>
     <label className="field"><span>Puant fiyatı</span><input type="number" min={0} step="0.0001" value={tariff.pricePeak} onChange={(e) => num('pricePeak', e.target.value)} /></label>
     <label className="field"><span>Gece fiyatı</span><input type="number" min={0} step="0.0001" value={tariff.priceNight} onChange={(e) => num('priceNight', e.target.value)} /></label>
     <label className="field"><span>Talep penceresi (dk)</span><input type="number" min={1} max={60} value={tariff.demandMinutes} onChange={(e) => num('demandMinutes', e.target.value)} /></label>
     <label className="field"><span>Endüktif sınır (%)</span><input type="number" min={0} max={100} value={tariff.inductiveLimitPct} onChange={(e) => num('inductiveLimitPct', e.target.value)} /></label>
     <label className="field"><span>Kapasitif sınır (%)</span><input type="number" min={0} max={100} value={tariff.capacitiveLimitPct} onChange={(e) => num('capacitiveLimitPct', e.target.value)} /></label>
    </div>
    <div className="e-form-foot"><span className="e-over">{tariffError}</span>{tariffDirty && <button className="btn small" onClick={() => setTariff(settings.tariff)}>Vazgeç</button>}<button className="btn small primary" disabled={!tariffDirty || !!tariffError} onClick={() => void onSave({ ...settings, tariff })}>Tarifeyi kaydet</button></div>
   </section>
  </>
 );
}

function AnalyzerEditor({ value, config, live, isNew, onCancel, onSave }: { value: Analyzer; config: Config; live: Live; isNew: boolean; onCancel: () => void; onSave: (a: Analyzer) => void }) {
 const [a, setA] = useState<Analyzer>(value);
 const guessDevice = () => { const first = Object.values(value.roles)[0]; return config.tags.find((t) => t.id === first)?.deviceId || ''; };
 const [deviceId, setDeviceId] = useState(guessDevice);
 const [note, setNote] = useState('');
 const tags = useMemo(() => config.tags.filter((t) => !deviceId || t.deviceId === deviceId), [config.tags, deviceId]);
 const options = useMemo(() => tags.filter((t) => t.dataType !== 'bool').map((t) => ({ value: t.id, label: t.code + ' — ' + t.name, hint: t.unit || t.dataType })), [tags]);
 const deviceOptions = useMemo(() => config.devices.map((d) => ({ value: d.id, label: d.code + ' — ' + d.name })), [config.devices]);
 const setRole = (k: string, tagId: string) => { const roles = { ...a.roles }; if (tagId) roles[k] = tagId; else delete roles[k]; setA({ ...a, roles }); };
 const suggest = () => {
  const s = suggestRoles(tags.filter((t) => t.dataType !== 'bool'));
  const added = Object.keys(s).filter((k) => !a.roles[k]);
  setA({ ...a, roles: { ...s, ...a.roles } });
  setNote(added.length ? `${added.length} ölçüm etiket adından önerildi; canlı değerleri kontrol edip kaydedin.` : 'Öneri bulunamadı; etiketleri elle seçin.');
 };
 const pickDevice = (id: string) => { setDeviceId(id); const d = config.devices.find((x) => x.id === id); if (d && !a.name.trim()) setA((x) => ({ ...x, name: d.name })); };
 const canSave = a.name.trim().length > 0 && Object.keys(a.roles).length > 0;
 const liveOf = (k: string) => { const tagId = a.roles[k]; if (!tagId) return null; const s = live.samples[tagId], role = energyRole(k)!; const f = POWER_UNITS.has(role.unit) ? a.powerFactor : role.group === 'energy' ? a.energyFactor : 1; return s && typeof s.value === 'number' ? { v: s.value * f, q: s.quality, tagUnit: config.tags.find((t) => t.id === tagId)?.unit || '' } : { v: null, q: s?.quality || 'unknown', tagUnit: '' }; };
 return (
  <section className="report-card e-editor">
   <header><h3>{isNew ? 'Yeni analizör' : a.name}</h3><button className="icon-btn" aria-label="Kapat" onClick={onCancel}><X size={16} /></button></header>
   <div className="e-form">
    <label className="field"><span>Ad</span><input value={a.name} maxLength={80} placeholder="Ana pano, Kompresör 1…" onChange={(e) => setA({ ...a, name: e.target.value })} /></label>
    <label className="field"><span>Grup (isteğe bağlı)</span><input value={a.group} maxLength={60} placeholder="Döküm hattı, Yardımcı tesis…" onChange={(e) => setA({ ...a, group: e.target.value })} /></label>
    <div className="field"><span>Cihaz (etiket listesini daraltır)</span><SearchSelect ariaLabel="Cihaz" value={deviceId} options={deviceOptions} onChange={pickDevice} emptyLabel="Tüm cihazlar" /></div>
    <div className="field"><span>&nbsp;</span><button className="btn small" onClick={suggest} disabled={!tags.length}><Wand2 size={14} />Etiket adlarından öner</button></div>
    <label className="field"><span>Güç çarpanı → kW <InfoTip label="Güç çarpanı">Etiket ölçeklemesi zaten kW veriyorsa 1 bırakın. Etiket W veriyorsa 0,001; MW veriyorsa 1000. P, Q, S ve faz güçlerine uygulanır.</InfoTip></span><input type="number" step="any" min={0} value={a.powerFactor} onChange={(e) => setA({ ...a, powerFactor: Number(e.target.value) || 1 })} /></label>
    <label className="field"><span>Enerji çarpanı → kWh <InfoTip label="Enerji çarpanı">Sayaç etiketi kWh veriyorsa 1. Wh ise 0,001; MWh ise 1000. Akım/gerilim trafosu oranı analizörde tanımlı değilse oran da buraya çarpılır (ör. 400/5 → 80).</InfoTip></span><input type="number" step="any" min={0} value={a.energyFactor} onChange={(e) => setA({ ...a, energyFactor: Number(e.target.value) || 1 })} /></label>
   </div>
   <label className="check"><input type="checkbox" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} />Etkin (kapalıysa tüketim sayılmaz, canlı ekranda görünmez)</label>
   {note && <div className="report-note">{note}</div>}
   {energyRoleGroups.map((g) => (
    <div key={g.id} className="e-roles">
     <h4>{g.label}{g.id === 'energy' && <InfoTip label="Enerji sayacı">Tüketim, sayacın iki okuma arasındaki farkından hesaplanır. Aktif enerji sayacı eşlenmezse toplam aktif güç zamana göre entegre edilir (daha az hassas). Reaktif oran için endüktif ve kapasitif sayaçları eşleyin.</InfoTip>}</h4>
     {ENERGY_ROLES.filter((r) => r.group === g.id).map((r) => { const lv = liveOf(r.key); return (
      <div key={r.key} className="e-role">
       <span className="e-role-name">{r.label}<small>{r.unit || '—'}</small></span>
       <SearchSelect ariaLabel={r.label} value={a.roles[r.key] || ''} options={options} onChange={(v) => setRole(r.key, v)} />
       <span className={'e-role-live mono' + (lv && lv.q !== 'good' ? ' e-stale' : '')}>{lv ? (lv.v === null ? 'veri yok' : nf(lv.v, r.key === 'pf' ? 3 : 2) + ' ' + r.unit) : ''}{lv && lv.tagUnit && r.unit && lv.tagUnit !== r.unit && <small title="Etiket birimi rol biriminden farklı; çarpanı kontrol edin">etiket: {lv.tagUnit}</small>}</span>
      </div>
     ); })}
    </div>
   ))}
   <div className="e-form-foot"><span className="muted">{Object.keys(a.roles).length} ölçüm eşlendi{!a.roles.ea && !a.roles.p ? ' · tüketim için kWh sayacı veya aktif güç gerekli' : ''}</span><button className="btn small" onClick={onCancel}>Vazgeç</button><button className="btn small primary" disabled={!canSave} onClick={() => onSave({ ...a, name: a.name.trim(), group: a.group.trim() })}>Kaydet</button></div>
  </section>
 );
}
