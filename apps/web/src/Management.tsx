import {UpdatePanel} from './UpdatePanel';
import {ProjectsPanel} from './Projects';
import {InfoTip} from './InfoTip';
import { Fragment, useEffect, useRef, useState } from 'react';
import {
 Plus,
 Copy,
 Layers,
 Wand2,
 X,
 Search,
 Network,
 Tag as TagIcon,
 Pencil,
 Trash2,
 Upload,
 Download,
 Check,
 Link2,
 ArrowUpRight,
 RotateCcw,
 Database,
 Package,
 Shapes,
 Users,
 BellRing,
 BellOff,
 Activity,
 Clock3,
 TimerReset,
 ListFilter,
 CalendarDays,
 FileSpreadsheet,
 Radar,
 ChevronDown,
 FolderInput,
 ClipboardPaste,
 Square,
} from 'lucide-react';
import { api, download } from './api';
import { Field } from './Studio';
import { ConnectionFields, emptyPublish, type PublishDraft } from './ConnectionFields';
import { PlcHealthRow } from './PlcHealth';
import { TiaImportDialog } from './TiaImportDialog';
import { NetScanDialog } from './NetScanDialog';
import {
 alarmKindLabels,
 approvalLabels,
 connectionAddress,
 connectionProtocol,
 parseS7Address,
 protocolLabels,
 commandRiskLabels,
 decodeRegisters,
 deviceStatusLabels,
 encodeValue,
 scriptTagRefs,
 registerCount,
 severityLabels,
 type AlarmEvent,
 type AlarmRule,
 type Config,
 type Execution,
 type Live,
 type Permissive,
 type ScreenRecord,
 type Tag,
 type User,
 type Preferences,
 addressFormatOf,
 addressFormatLabels,
 isSymbolicProtocol,
 symbolicAddressOf,
 pruneMqttPublish,
 parseSnmpOid,
} from '../../../packages/contracts/model';
import {statusLabel} from './statusModel';
import './modbus.css';
import './tabs.css';
import './report.css';
import './cfg.css';
import { TagInspector } from './TagInspector';
import { CommandInspector, execTone } from './CommandInspector';
import { TagSeriesDialog } from './TagSeriesDialog';
import { TagCrumbs, TagDeviceList, TagFolderTiles, TagQuickFind, type TagNavState } from './TagBrowser';
import { CmdCrumbs, CmdDeviceList, CmdFolderTiles, CmdQuickFind, commandDevice, commandGroup, type CmdNavState } from './CommandBrowser';
import { TagImportDialog } from './TagImportDialog';
import { nextDeltaSlot } from './tagImport';
import { syncScript } from './ScriptEditor';
import { checkScript } from '../../../packages/contracts/script';
import { AREA_INFO, commandSentence, missingCommands, modbusRef, nextCode, nextFreeAddress, sampleText } from './cfgModel';
import { Timeline, Columns, BarList } from './ReportCharts';
import { AUDIT_CATEGORIES, auditCategory, auditLabel, auditSummary, auditFields, countBuckets, type AuditCategory } from './auditModel';
import { RANGE_PRESETS, SHIFTS, presetRange, shiftAt, activationBuckets, bucketSize, rangeLabel, type RangePreset } from './reportModel';
import { ColumnFilter, SavedFilters, useSessionState } from './FilterBar';
import { usePaged } from './Pager';
import {
 activeFilterCount,
 alarmStateLabels,
 alarmStateOrder,
 emptyEventFilter,
 emptyRuleFilter,
 eventFacets,
 filterEvents,
 filterRules,
 ruleFacets,
 ruleStateLabels,
 severityOrder,
 sortEvents,
 toggle,
 type EventFilter,
} from './alarmFilter';
import { clearedInShift, groupActive } from './alarmFilter';
import { SevMark, ShiftStrip } from './AlarmMark';

type AlarmTab = 'active' | 'overview' | 'rules' | 'history' | 'metrics' | 'policy';
type Props = {
 page: string;
 config: Config;
 live: Live;
 screens: ScreenRecord[];
 user: User;
 refresh: () => Promise<void>;
 notify: (s: string, tone?: 'info' | 'error') => void;
 onScreen: (id: string) => void;
 prefs?: Preferences;
 onPrefs?: (next: Preferences) => void;
};
type ActivityInterval = {start:number;end:number;durationMs:number;ongoing:boolean;uncertain:boolean};
type ActivityRow = {tagId:string;activations:number;totalOnMs:number;averageOnMs:number;longestOnMs:number;uncertain:boolean;intervals:ActivityInterval[]};
const libStateLabels = {
 add: 'Yeni',
 upgrade: 'Güncelleme',
 older: 'Daha eski, atlanacak',
 renamed: 'Aynı kimlik farklı ad',
} as const;
// B51: coklu secim kancasi — Etiketler, Komutlar, Alarm kurallari tablolarinda ortak.
// scope (sayfa/sekme) degisince veya secili id listesi kuculunce secim otomatik sifirlanir/budanir.
function useSelection(ids: string[], scope: string) {
 const [state, setState] = useState<{ scope: string; ids: Set<string> }>({ scope, ids: new Set() });
 const idsKey = ids.join('|');
 useEffect(() => {
  setState((prev) => {
   if (prev.scope !== scope) return { scope, ids: new Set() };
   const pruned = new Set([...prev.ids].filter((id) => ids.includes(id)));
   return pruned.size === prev.ids.size ? prev : { scope, ids: pruned };
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [scope, idsKey]);
 const selected = state.ids;
 const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
 const someSelected = selected.size > 0 && !allSelected;
 function toggleOne(id: string) {
  setState((prev) => {
   const next = new Set(prev.ids);
   if (next.has(id)) next.delete(id);
   else next.add(id);
   return { scope: prev.scope, ids: next };
  });
 }
 function toggleAll() {
  setState((prev) => ({ scope: prev.scope, ids: allSelected ? new Set() : new Set(ids) }));
 }
 function clear() {
  setState((prev) => ({ scope: prev.scope, ids: new Set() }));
 }
 return { selected, toggleOne, toggleAll, clear, allSelected, someSelected };
}
type Selection = ReturnType<typeof useSelection>;
export function Management({
 page,
 config,
 live,
 screens,
 user,
 refresh,
 notify,
 onScreen,
 prefs,
 onPrefs,
}: Props) {
 const REPORT_TABS=['overview','signals','alarms','commands','notes'] as const;
 type ReportTab=(typeof REPORT_TABS)[number];
 const AUDIT_TABS=['overview','commands','events'] as const;
 type AuditTab=(typeof AUDIT_TABS)[number];
 type ReportFilterSlot='summary-signal'|'event-signal'|'toolbar-signal'|'entry'|'exit'|'custom';
 const storedReport=(()=>{try{return JSON.parse(localStorage.getItem('scada-shift-report')||'{}')}catch{return {}}})();
 const [modal, setModal] = useState<{ kind: string; data: any; fresh: boolean; orig?: string } | null>(null),
  [series, setSeries] = useState(false),
  [tiaOpen, setTiaOpen] = useState(false),
  [importOpen, setImportOpen] = useState(false),
  [scanOpen, setScanOpen] = useState(false),
  [addMenu, setAddMenu] = useState(false),
  [moveTo, setMoveTo] = useState<string | null>(null),
  // Etiket silme onayı (kimlikler) ve 8 sn geri al.
  [delTags, setDelTags] = useState<string[] | null>(null),
  [undo, setUndo] = useState<{ text: string; tags: Tag[]; commands: Config['commands']; before: Config['commands'] } | null>(null),
  // Henüz etiketi olmayan yeni klasörler (cihaz başına, oturum içi).
  [draftGroups, setDraftGroups] = useState<Record<string, string[]>>({}),
  [execs, setExecs] = useState<Execution[]>([]),
  [inspRefs, setInspRefs] = useState<{ group: string; text: string; detail: string; screenId?: string }[] | null>(null),
  [busy, setBusy] = useState(false),
  [used, setUsed] = useState<string | null>(null),
  [logs, setLogs] = useState<any>(null),
  [users, setUsers] = useState<User[]>([]),
  [revisions, setRevisions] = useState<any[] | null>(null),
  [revisionScreen, setRevisionScreen] = useState(''),
  [revisionCompare, setRevisionCompare] = useState<number[]>([]);
 const [ruleReason, setRuleReason] = useState('');
 // B33: tasinabilir proje paketi — once onizleme, sonra uygulama.
 const [pkg, setPkg] = useState<{ file: File; summary: any } | null>(null),
  [pkgBusy, setPkgBusy] = useState(false);
 // K12: ekipman kutuphanesi — sadece ekipman tipleri ve gorseller; onizleme sonra birlestirme.
 const [lib, setLib] = useState<{ file: File; plan: any } | null>(null),
  [libBusy, setLibBusy] = useState(false),
  [libChoices, setLibChoices] = useState<Record<string, 'upgrade' | 'skip' | 'duplicate'>>({});
 // B29: rolu daraltan ekran / komut / alan izinleri.
 const [perm, setPerm] = useState<{
  id: string;
  username: string;
  role: string;
  screens: string[];
  commands: string[];
  areas: string[];
 } | null>(null);
 // B46: kayitli taslak ile sahada calisan yapilandirma arasindaki fark.
 const [pending, setPending] = useState<any>(null);
 // B10: tarih arali kli isletme raporu ve vardiya notu.
 const [recipes, setRecipes] = useState<any[]>([]),
  [recipePreviewState, setRecipePreview] = useState<any>(null);
 const [report, setReport] = useState<any>(null),
  [reportRange, setReportRange] = useState(24 * 3600000),
  [reportFrom,setReportFrom]=useState<number>(()=>Number(storedReport.from)||Date.now()-24*3600000),
  [reportTo,setReportTo]=useState<number>(()=>Number(storedReport.to)||Date.now()),
  [reportTagIds,setReportTagIds]=useState<string[]>(()=>Array.isArray(storedReport.tagIds)?storedReport.tagIds:[]),
  [reportSignalSearch,setReportSignalSearch]=useState(''),
  [reportFilterOpen,setReportFilterOpen]=useState<ReportFilterSlot|null>(null),
  [reportEntryAfter,setReportEntryAfter]=useState(''),
  [reportExitBefore,setReportExitBefore]=useState(''),
  [reportProfile,setReportProfile]=useState<string>(()=>String(storedReport.name||'Üretim sinyalleri')),
  [reportPreset,setReportPreset]=useState<RangePreset|'custom'>(()=>storedReport.preset==='custom'||RANGE_PRESETS.some(p=>p.id===storedReport.preset)?storedReport.preset:'shift'),
  [reportTab,setReportTab]=useState<ReportTab>(()=>REPORT_TABS.includes(storedReport.tab)?storedReport.tab:'overview'),
  [reportTabDir,setReportTabDir]=useState<'next'|'prev'>('next'),
  [reportNameEdit,setReportNameEdit]=useState(false),
  [note, setNote] = useState<{shift:string;text:string}>(() => ({ shift: shiftAt(Date.now()).name, text: '' }));
 // B51: denetim ve komut kayitlari tarih aralikli ve sayfali okunur; UI'da az satir gorunmesi diskte az kayit demek degil.
 const storedAudit=(()=>{try{return JSON.parse(localStorage.getItem('scada-audit-view')||'{}')}catch{return {}}})();
 const [auditPreset,setAuditPreset]=useState<RangePreset|'custom'>(()=>RANGE_PRESETS.some(p=>p.id===storedAudit.preset)?storedAudit.preset:'today'),
  [auditFrom,setAuditFrom]=useState<number>(()=>Date.now()-24*3600000),
  [auditTo,setAuditTo]=useState<number>(()=>Date.now()),
  [auditPage, setAuditPage] = useState(0),
  [auditTab,setAuditTab]=useState<AuditTab>(()=>AUDIT_TABS.includes(storedAudit.tab)?storedAudit.tab:'overview'),
  [auditTabDir,setAuditTabDir]=useState<'next'|'prev'>('next'),
  [auditFilterOpen,setAuditFilterOpen]=useState<string|null>(null),
  [auditCmdFilter,setAuditCmdFilter]=useState<{users:string[];statuses:string[];q:string}>({users:[],statuses:[],q:''}),
  [auditEvtFilter,setAuditEvtFilter]=useState<{users:string[];cats:string[];q:string}>({users:[],cats:[],q:''}),
  [auditOpenRow,setAuditOpenRow]=useState<string|null>(null);
 const auditLimit = 500;
 // Alarm performansi (ISA-18.2): sel, uzun suren, sik tekrar eden ve ACK gecikmesi.
 const [metrics, setMetrics] = useState<{
   from: number;
   to: number;
   total: number;
   rows: any[];
  } | null>(null),
  [alarmRefresh, setAlarmRefresh] = useState(0),
  [policy, setPolicy] = useState<any>(null),
  [alarmTab, setAlarmTab] = useState<AlarmTab>('active'),
  [alarmTabDir, setAlarmTabDir] = useState<'next' | 'prev'>('next');
 const [activeFilter, setActiveFilter] = useSessionState('dvp.alarm.active', emptyEventFilter),
  [activeSort, setActiveSort] = useSessionState<'priority' | 'time'>('dvp.alarm.sort', () => 'priority'),
  [ruleFilter, setRuleFilter] = useSessionState('dvp.alarm.rules', emptyRuleFilter),
  [historyFilter, setHistoryFilter] = useSessionState('dvp.alarm.history', emptyEventFilter),
  [alarmPreset, setAlarmPreset] = useSessionState<RangePreset | 'custom'>('dvp.alarm.preset', () => 'today'),
  [alarmCustom, setAlarmCustom] = useSessionState<{ from: number; to: number }>('dvp.alarm.custom', () => ({ from: Date.now() - 24 * 3600000, to: Date.now() })),
  [rangeEvents, setRangeEvents] = useState<{ events: AlarmEvent[]; truncated: boolean; from?: number; to?: number } | null>(null),
  [alarmFilterOpen, setAlarmFilterOpen] = useState<string | null>(null);
 const [rules, setRules] = useState<AlarmRule[]>([]),
  [history, setHistory] = useState<AlarmEvent[]>([]),
  [shiftEvents, setShiftEvents] = useState<AlarmEvent[]>([]),
  [references, setReferences] = useState<
   | {
      group: 'screen' | 'revision' | 'command' | 'alarm';
      text: string;
      detail: string;
      screenId?: string;
      objectId?: string;
     }[]
   | null
  >(null),
  [rebindTarget, setRebindTarget] = useState(''),
  [shelfMinutes, setShelfMinutes] = useState(60),
  [shelfReason, setShelfReason] = useState('');
 const [trend, setTrend] = useState<{
   tagId: string;
   from: number;
   to: number;
   points: { at: number; value: number | null; quality: string }[];
  } | null>(null),
  [trendRange, setTrendRange] = useState(3600000);
 const [diff, setDiff] = useState<{
  screen: string;
  total: number;
  entries: {
   kind: 'added' | 'removed' | 'changed';
   label: string;
   fields?: { field: string; from: string; to: string }[];
  }[];
 } | null>(null);
 const diffBoxRef = useRef<HTMLDivElement>(null),
  diffCloseRef = useRef<HTMLElement | null>(null);
 const [confirmState, setConfirmState] = useState<{
  title: string;
  text: string;
  danger?: boolean;
  yesLabel?: string;
  onYes: () => void;
  prev: HTMLElement | null;
 } | null>(null);
 const confirmBtnRef = useRef<HTMLButtonElement>(null),
  confirmBoxRef = useRef<HTMLDivElement>(null);
 function askConfirm(title: string, text: string, onYes: () => void, danger?: boolean, yesLabel?: string) {
  setConfirmState({
   title,
   text,
   danger,
   yesLabel,
   onYes,
   prev: document.activeElement as HTMLElement | null,
  });
 }
 function closeConfirm() {
  confirmState?.prev?.focus();
  setConfirmState(null);
 }
 useEffect(() => {
  if (confirmState) confirmBtnRef.current?.focus();
 }, [confirmState]);
 function onConfirmKey(e: React.KeyboardEvent) {
  if (e.key === 'Escape') {
   e.preventDefault();
   closeConfirm();
   return;
  }
  if (e.key !== 'Tab') return;
  const items = confirmBoxRef.current?.querySelectorAll<HTMLElement>('button');
  if (!items || !items.length) return;
  const first = items[0],
   last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
   e.preventDefault();
   last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
   e.preventDefault();
   first.focus();
  }
 }
 function closeDiff() {
  diffCloseRef.current?.focus();
  setDiff(null);
 }
 function onDiffKey(e: React.KeyboardEvent) {
  if (e.key === 'Escape') {
   e.preventDefault();
   closeDiff();
   return;
  }
  if (e.key !== 'Tab') return;
  const items = diffBoxRef.current?.querySelectorAll<HTMLElement>('button');
  if (!items || !items.length) return;
  const first = items[0],
   last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
   e.preventDefault();
   last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
   e.preventDefault();
   first.focus();
  }
 }
 useEffect(() => {
  if (diff) diffBoxRef.current?.querySelector<HTMLElement>('button')?.focus();
 }, [diff]);
 const active = live.alarms || [];
 const digitalTags=config.tags.filter(t=>t.dataType==='bool');
 const visibleReportTags=digitalTags.filter(t=>{const q=reportSignalSearch.trim().toLocaleLowerCase('tr-TR');if(!q)return true;const device=config.devices.find(d=>d.id===t.deviceId);return [t.code,t.name,device?.code].some(v=>String(v||'').toLocaleLowerCase('tr-TR').includes(q));});
 function trendPath(points: { at: number; value: number | null; quality: string }[]) {
  const valid = points.filter((p) => p.value !== null && p.quality === 'good');
  if (!valid.length) return '';
  const min = Math.min(...valid.map((p) => p.value!)),
   max = Math.max(...valid.map((p) => p.value!)),
   span = Math.max(1, max - min),
   first = valid[0].at,
   last = valid.at(-1)!.at;
  return valid
   .map(
    (p, i) =>
     (i ? 'L' : 'M') +
     (12 + ((p.at - first) / Math.max(1, last - first)) * 296).toFixed(1) +
     ' ' +
     (108 - ((p.value! - min) / span) * 92).toFixed(1),
   )
   .join(' ');
 }
 const writable = ['admin', 'designer'].includes(user.role);
 // S7 cihazlari: etiket modali Modbus alan/adres yerine S7 adresi ister; yeni etiket salt okuma baslar, oku / yaz secilebilir.
 const s7DeviceIds = new Set(
  config.devices
   .filter((d) => config.connections.find((c) => c.id === d.connectionId)?.protocol === 's7')
   .map((d) => d.id),
 );
 // ADS (Beckhoff) cihazlari: etiket Modbus adresi yerine TwinCAT sembolu ister; yeni etiket salt okuma baslar, oku / yaz secilebilir.
 const adsDeviceIds = new Set(
  config.devices
   .filter((d) => config.connections.find((c) => c.id === d.connectionId)?.protocol === 'ads')
   .map((d) => d.id),
 );
 // OPC UA cihazlari: etiket nodeId ile okunur; yeni etiket salt okuma baslar, oku / yaz secilebilir.
 const opcDeviceIds = new Set(
  config.devices
   .filter((d) => config.connections.find((c) => c.id === d.connectionId)?.protocol === 'opc-ua')
   .map((d) => d.id),
 );
 // MQTT cihazlari: etiket konu (+ JSON yolu) ile okunur; MQTT etiketi yalniz okunur.
 const mqttDeviceIds = new Set(
  config.devices
   .filter((d) => config.connections.find((c) => c.id === d.connectionId)?.protocol === 'mqtt')
   .map((d) => d.id),
 );
 // SNMP / HTTP / SQL / BACnet cihazlari: etiket OID / yol / sorgu / nesne ile okunur; yalniz okunur (MQTT gibi).
 const readOnlyFmt = (id: string): 'snmp' | 'http' | 'sql' | 'bacnet' | null => { const f = addressFormatOf(config, id); return f === 'snmp' || f === 'http' || f === 'sql' || f === 'bacnet' ? f : null; };
 // EtherNet/IP cihazlari: CIP etiket adiyla okunur ve yazilir.
 const enipDevice = (id: string) => addressFormatOf(config, id) === 'enip';
 // Modbus disi (sembolik adresli) cihazlar: alan/register mantigi ve slave ID yok.
 const symbolicDevice = (id: string) => s7DeviceIds.has(id) || adsDeviceIds.has(id) || opcDeviceIds.has(id) || mqttDeviceIds.has(id) || !!readOnlyFmt(id) || enipDevice(id);
 useEffect(() => {
  if (page === 'settings' && user.role === 'admin')
   void api<User[]>('/users').then(setUsers).catch(() => {});
 }, [page, user.role]);
 const canAck = ['admin', 'operator'].includes(user.role);
 const shelveMax = user.role === 'operator' ? (policy?.operatorShelveMaxMinutes ?? 1440) : 1440;
 async function loadAlarms() {
  const r = await api<{ rules: AlarmRule[]; events: AlarmEvent[]; policy: any }>('/alarms');
  setRules(r.rules);
  setHistory(r.events);
  setPolicy(r.policy);
 }
 useEffect(() => {
  if (page === 'recipes') void run(() => loadRecipes());
 }, [page]);
 useEffect(() => {
  if(page!=='reports')return;
  const ids=reportTagIds.filter(id=>digitalTags.some(t=>t.id===id));
  if(ids.join('|')!==reportTagIds.join('|'))setReportTagIds(ids);
  void run(() => refreshReport(ids));
 }, [page,config.revision]);
 useEffect(() => {
  if (page === 'audit') void run(() => refreshAudit());
 }, [page]);
 useEffect(() => {
  try{localStorage.setItem('scada-audit-view',JSON.stringify({preset:auditPreset,tab:auditTab}))}catch{}
 }, [auditPreset,auditTab]);
 // Özel aralık açılır penceresi dışarı tıklanınca kapanır (sütun filtreleri kendi kapanır).
 useEffect(() => {
  if(auditFilterOpen!=='custom')return;
  const close=(e:MouseEvent)=>{if(!(e.target as Element).closest?.('.report-custom'))setAuditFilterOpen(null)};
  document.addEventListener('mousedown',close);
  return ()=>document.removeEventListener('mousedown',close);
 }, [auditFilterOpen]);
 useEffect(() => {
  if (alarmFilterOpen !== 'alarm-custom') return;
  const close = (e: MouseEvent) => { if (!(e.target as Element).closest?.('.report-custom')) setAlarmFilterOpen(null); };
  document.addEventListener('mousedown', close);
  return () => document.removeEventListener('mousedown', close);
 }, [alarmFilterOpen]);
 // Açık rapor filtresi dışarı tıklanınca kapanır.
 useEffect(() => {
  if(!reportFilterOpen)return;
  const close=(e:MouseEvent)=>{if(!(e.target as Element).closest?.('.report-column-filter'))setReportFilterOpen(null)};
  document.addEventListener('mousedown',close);
  return ()=>document.removeEventListener('mousedown',close);
 }, [reportFilterOpen]);
 // Görünüm (ad, sinyaller, aralık, sekme) bu tarayıcıda kendiliğinden hatırlanır.
 useEffect(() => {
  try{localStorage.setItem('scada-shift-report',JSON.stringify({name:reportProfile,tagIds:reportTagIds,preset:reportPreset,from:reportFrom,to:reportTo,tab:reportTab}))}catch{}
 }, [reportProfile,reportTagIds,reportPreset,reportFrom,reportTo,reportTab]);
 useEffect(() => {
  if (page !== 'devices') {
   setPending(null);
   return;
  }
  void api('/config/pending')
   .then(setPending)
   .catch(() => setPending(null));
 }, [page, config.revision, live.activeRevision]);
 useEffect(() => {
  if (page === 'alarms') void loadAlarms().catch((e) => notify((e as Error).message, 'error'));
 }, [page]);
 // Aktif sekmedeki vardiya şeridi ve "Temizlendi" grubu: bu vardiyanın olayları; alarm listesi değişince tazelenir.
 const activeSig = active.map((a) => a.id + (a.ackAt ? 'a' : '') + (a.clearedAt ? 'c' : '')).join();
 useEffect(() => {
  if (page !== 'alarms' || alarmTab !== 'active') return;
  let on = true;
  const sh = shiftAt(Date.now());
  api<{ events: AlarmEvent[] }>('/alarms/history?from=' + sh.from + '&to=' + Date.now() + '&limit=500')
   .then((r) => on && setShiftEvents(r.events))
   .catch(() => on && setShiftEvents([]));
  return () => {
   on = false;
  };
 }, [page, alarmTab, activeSig]);
 // Zamana bağlı sekmeler (Genel bakış, Geçmiş, Performans) tek aralığı paylaşır; ön ayar her yüklemede "şimdi"ye göre hesaplanır.
 const alarmTimed = alarmTab === 'overview' || alarmTab === 'history' || alarmTab === 'metrics';
 useEffect(() => {
  if (page !== 'alarms' || !alarmTimed) return;
  let live = true;
  const { from, to } = alarmPreset === 'custom' ? alarmCustom : presetRange(alarmPreset);
  api<{ events: AlarmEvent[]; truncated: boolean }>('/alarms/history?from=' + Math.round(from) + '&to=' + Math.round(to) + '&limit=2000')
   .then((r) => { if (live) setRangeEvents({ ...r, from, to }); })
   .catch((e) => {
    if (!live) return;
    setRangeEvents(null);
    notify((e as Error).message, 'error');
   });
  void api<{ from: number; to: number; total: number; rows: any[] }>('/alarms/metrics?from=' + Math.round(from) + '&to=' + Math.round(to))
   .then((r) => live && setMetrics(r))
   .catch(() => live && setMetrics(null));
  return () => {
   live = false;
  };
 }, [page, alarmTimed, alarmPreset, alarmCustom.from, alarmCustom.to, alarmRefresh]);
 useEffect(() => {
  if (page !== 'alarms') return;
  void api<{ policy: any; flood: any }>('/alarms/policy')
   .then((r) => setPolicy(r.policy))
   .catch(() => {});
 }, [page]);
 async function savePolicy(next: any) {
  try {
   await api('/alarms/policy', 'PUT', next);
   setPolicy(next);
   notify('Alarm politikası kaydedildi.');
  } catch (e) {
   notify((e as Error).message, 'error');
  }
 }
 const durationText = (ms: number) =>
  ms >= 3600000
   ? Math.round(ms / 360000) / 10 + ' sa'
   : ms >= 60000
     ? Math.round(ms / 6000) / 10 + ' dk'
     : Math.round(ms / 1000) + ' sn';
 const datetimeOffset=(at:number)=>new Date(at).getTimezoneOffset()*60000;
 const dateTimeValue=(at:number)=>{const d=new Date(at-datetimeOffset(at));return d.toISOString().slice(0,16);};
 useEffect(() => {
  if (used) void loadAlarms().catch((e) => notify((e as Error).message, 'error'));
 }, [used]);
 useEffect(() => {
  if (!used) {
   setReferences(null);
   setRebindTarget('');
   return;
  }
  void api<{
   references: {
    group: 'screen' | 'revision' | 'command' | 'alarm';
    text: string;
    detail: string;
    screenId?: string;
    objectId?: string;
   }[];
  }>('/tags/' + encodeURIComponent(used) + '/references')
   .then((r) => setReferences(r.references))
   .catch((e) => notify((e as Error).message, 'error'));
 }, [used]);
 useEffect(() => {
  if (page !== 'commands') return;
  api<{ commands: Execution[] }>('/audit').then((r) => setExecs(r.commands || [])).catch(() => {});
 }, [page, live.commands[0]?.id]);
 const inspTagId = modal?.kind === 'tag' && !modal.fresh ? modal.data.id : '';
 useEffect(() => {
  setInspRefs(null);
  if (!inspTagId) return;
  api<{ references: { group: string; text: string; detail: string; screenId?: string }[] }>('/tags/' + encodeURIComponent(inspTagId) + '/references').then((r) => setInspRefs(r.references)).catch(() => setInspRefs([]));
 }, [inspTagId]);
 useEffect(() => {
  if (!used) {
   setTrend(null);
   return;
  }
  const to = Date.now(),
   from = to - trendRange;
  void api<{
   series: { tagId: string; points: { at: number; value: number | null; quality: string }[] }[];
  }>(
   '/history?tagIds=' +
    encodeURIComponent(used) +
    '&from=' +
    from +
    '&to=' +
    to +
    '&maxPoints=1000',
  )
   .then((r) => setTrend({ tagId: used, from, to, points: r.series[0]?.points || [] }))
   .catch((e) => notify((e as Error).message, 'error'));
 }, [used, trendRange]);
 // ISA-18.2 degisiklik yonetimi: kural degisikligi gerekcesiyle birlikte denetime yazilir.
 async function loadRecipes() {
  const r = await api<{ recipes: any[] }>('/recipes');
  setRecipes(r.recipes);
 }
 async function saveRecipes(next: any[]) {
  await api('/recipes', 'PUT', next);
  await loadRecipes();
  notify('Reçeteler kaydedildi.');
 }
 async function openRecipePreview(id: string) {
  try {
   setRecipePreview(await api('/recipes/' + id + '/preview'));
  } catch (e) {
   notify((e as Error).message, 'error');
  }
 }
 async function applyRecipe(id: string) {
  const target = screens[0];
  if (!target) {
   notify('Uygulanacak ekran yok.', 'error');
   return;
  }
  await run(async () => {
   const r = await api<any>('/recipes/' + id + '/apply', 'POST', { screenId: target.id });
   setRecipePreview(null);
   notify(r.message, r.ok ? 'info' : 'error');
  });
 }
 async function loadReport(range=reportRange,tagIds=reportTagIds,fromAt?:number,toAt?:number) {
  const to=toAt??Date.now(),from=fromAt??to-range;
  const query='?from='+Math.round(from)+'&to='+Math.round(to)+'&tagIds='+encodeURIComponent(tagIds.join(','));
  const r = await api('/reports'+query);
  setReport(r);
  setReportRange(range);
  setReportFrom(from);
  setReportTo(to);
 }
 /** Seçili ön ayarı "şimdi"ye göre yeniden hesaplar; özel aralıkta sabit tarihleri kullanır. */
 function refreshReport(tagIds=reportTagIds,preset=reportPreset){
  if(preset==='custom')return loadReport(reportTo-reportFrom,tagIds,reportFrom,reportTo);
  const r=presetRange(preset);
  return loadReport(r.to-r.from,tagIds,r.from,r.to);
 }
 function pickPreset(preset:RangePreset){
  setReportPreset(preset);
  void run(()=>refreshReport(reportTagIds,preset));
 }
 async function saveNote() {
  const to=reportTo,from=reportFrom;
  if (note.text.trim().length < 3) {
   notify('Vardiya notu en az 3 karakter olmalı.', 'error');
   return;
  }
  await run(async () => {
   await api('/reports/notes', 'POST', {
    shift: note.shift,
    text: note.text.trim(),
    start: from,
    finish: to,
   });
   setNote({ ...note, text: '' });
   await refreshReport();
   notify('Vardiya notu kaydedildi.');
  });
 }
 async function previewPackage(file: File) {
  setPkgBusy(true);
  try {
   const body = JSON.parse(await file.text());
   const summary = await api('/package/preview', 'POST', body);
   setPkg({ file, summary });
  } catch (e) {
   notify((e as Error).message, 'error');
  } finally {
   setPkgBusy(false);
  }
 }
 async function applyPackage() {
  if (!pkg) return;
  setPkgBusy(true);
  try {
   const body = JSON.parse(await pkg.file.text());
   const r = await api<{ summary: any }>('/package/import', 'POST', body);
   setPkg(null);
   await refresh();
   notify(
    'Paket içe aktarıldı: ' +
     r.summary.screens +
     ' ekran, ' +
     r.summary.assets +
     ' görsel. Cihazlar pasif.',
   );
  } catch (e) {
   notify((e as Error).message, 'error');
  } finally {
   setPkgBusy(false);
  }
 }
 async function previewLibrary(file: File) {
  setLibBusy(true);
  try {
   const body = JSON.parse(await file.text());
   const plan = await api<any>('/library/preview', 'POST', body);
   setLib({ file, plan });
   const choices: Record<string, 'upgrade' | 'skip' | 'duplicate'> = {};
   for (const it of plan.items)
    if (it.state === 'upgrade') choices[it.typeId] = 'upgrade';
    else if (it.state === 'renamed') choices[it.typeId] = 'duplicate';
   setLibChoices(choices);
  } catch (e) {
   notify((e as Error).message, 'error');
  } finally {
   setLibBusy(false);
  }
 }
 async function applyLibrary() {
  if (!lib) return;
  setLibBusy(true);
  try {
   const pack = JSON.parse(await lib.file.text());
   const r = await api<{ summary: any }>('/library/import', 'POST', { pack, choices: libChoices });
   setLib(null);
   setLibChoices({});
   await refresh();
   notify(
    'Kütüphane birleştirildi: ' +
     r.summary.added +
     ' yeni, ' +
     r.summary.upgraded +
     ' güncellenen, ' +
     r.summary.duplicated +
     ' kopya, ' +
     r.summary.skipped +
     ' atlanan tip.',
   );
  } catch (e) {
   notify((e as Error).message, 'error');
  } finally {
   setLibBusy(false);
  }
 }
 async function loadAudit(from = auditFrom, to = auditTo, pageNo = 0) {
  const r = await api<any>(
   '/audit?from=' + Math.round(from) + '&to=' + Math.round(to) + '&limit=' + auditLimit + '&offset=' + pageNo * auditLimit,
  );
  setLogs({ ...r, from, to });
  setAuditFrom(from);
  setAuditTo(to);
  setAuditPage(pageNo);
  setAuditOpenRow(null);
 }
 /** Ön ayarı "şimdi"ye göre yeniden hesaplar; özel aralıkta sabit tarihleri kullanır. */
 function refreshAudit(preset = auditPreset, pageNo = 0) {
  if (preset === 'custom') return loadAudit(auditFrom, auditTo, pageNo);
  const r = presetRange(preset);
  return loadAudit(r.from, r.to, pageNo);
 }
 async function saveRules(next: AlarmRule[], reason = '') {
  await api('/alarms/rules', 'PUT', reason ? { rules: next, reason } : next);
  setRules(next);
  await loadAlarms();
  notify('Alarm kuralları kaydedildi.');
 }
 async function ack(ids?: string[]) {
  await api('/alarms/ack', 'POST', ids ? { ids } : {});
  await loadAlarms();
  notify(ids ? 'Alarm onaylandı.' : 'Tüm alarmlar onaylandı.');
 }
 async function run(fn: () => Promise<unknown>) {
  setBusy(true);
  try {
   await fn();
   await refresh();
  } catch (e) {
   notify((e as Error).message, 'error');
  } finally {
   setBusy(false);
  }
 }
 async function saveConfig(next: Config) {
  // Silinen bağlantı/etiket MQTT yayın bloğunda asılı kalmasın (yoksa sunucu kaydı reddeder).
  await api('/config', 'PUT', pruneMqttPublish(next));
  notify('Tanım kaydedildi. Cihaz değişikliklerini haberleşmeye uygulayın.');
 }
 function fresh(kind: string) {
  const id = crypto.randomUUID();
  if (kind === 'alarm') {
   const t = config.tags[0];
   setModal({
    kind,
    data: {
     id,
     name: 'Yeni alarm',
     tagId: t?.id || '',
     kind: t?.dataType === 'bool' ? 'bool' : 'high',
     limit: 80,
     expected: true,
     deadband: 0,
     delayMs: 0,
     severity: 'warning',
     message: '',
     enabled: true,
     popup: true,
     ackRequired: true,
     latch: false,
     area: '',
     equipment: '',
     cause: '',
     consequence: '',
     action: '',
     responseMinutes: 0,
     shelvedUntil: 0,
     shelvedReason: '',
     shelvedBy: '',
    },
    fresh: true,
   });
   setRuleReason('');
   return;
  }
  const data =
   kind === 'connection'
    ? { id, name: 'Yeni bağlantı', host: '192.0.2.16', port: 502, timeout: 2000 }
    : kind === 'device'
      ? {
         id,
         connectionId: config.connections[0]?.id || '',
         code: 'PLC-' + String(config.devices.length + 1).padStart(2, '0'),
         name: 'Yeni cihaz',
         slaveId: 1,
         enabled: false,
         pollMs: 1000,
         staleMs: 4000,
         description: '',
        }
      : kind === 'tag'
        ? (() => {
           // Yeni etiket son tanımın devamı: aynı cihaz/alan, sıradaki kod ve boş adres.
           // Etiket sayfasında seçili cihaz/bölüm varsa yeni etiket oraya eklenir.
           const navDev = page === 'tags' ? config.devices.find((d) => d.id === tagNav.dev) : undefined, grp = navDev && tagNav.grp ? tagNav.grp : '';
           const dev = navDev || config.devices.find((d) => !symbolicDevice(d.id)) || config.devices[0];
           const last = [...config.tags].reverse().find((t) => t.deviceId === dev?.id && (!grp || (t.group || '').trim() === grp)) || [...config.tags].reverse().find((t) => t.deviceId === dev?.id);
           const s7 = !!dev && s7DeviceIds.has(dev.id);
           const ads = !!dev && adsDeviceIds.has(dev.id);
           const opc = !!dev && opcDeviceIds.has(dev.id);
           const mqtt = !!dev && mqttDeviceIds.has(dev.id);
           const ro = dev ? readOnlyFmt(dev.id) : null;
           const enip = !!dev && enipDevice(dev.id);
           const area = (last?.area || 'coil') as Tag['area'];
           // BACnet: son etiketin nesne tipi, sıradaki numara; veri tipi nesneye göre (dijital nesne bool).
           const bacType = last?.bacnetObjectType || 'analog-value';
           const bacDt = bacType.startsWith('binary-') ? 'bool' : last?.dataType && last.dataType !== 'bool' ? last.dataType : 'float32';
           const taken = new Set(config.tags.map((t) => t.code));
           // Delta cihazında kod ve adres aynı addan gelir (M0 → C 2048); bağımsız üretilince M0 kodu S0 adresine düşüyordu.
           const ds = dev && addressFormatOf(config, dev.id) === 'delta' ? nextDeltaSlot(config.tags, dev.id, last || null, taken) : null;
           return {
            id, deviceId: dev?.id || '', code: ds?.code ?? (last ? nextCode(last.code, taken) : 'M0'), name: '',
            area: ds?.area ?? area, address: ds?.address ?? nextFreeAddress(config.tags, dev?.id || '', area),
            dataType: ro === 'bacnet' ? bacDt : enip ? (last?.dataType && ['bool', 'int16', 'int32', 'float32'].includes(last.dataType) ? last.dataType : 'float32') : ds?.dataType ?? (last?.dataType || 'bool'),
            access: s7 || ads || opc || mqtt || ro || enip ? 'read' : last?.access || 'readwrite', scale: 1, offset: 0, min: 0, max: 65535, unit: last?.unit || '',
            wordOrder: 'big', byteOrder: 'big', bit: null, verifyTolerance: null, history: false, historyDeadband: 0, historyMaxGapMs: 60000,
            description: '', nodeId: '', group: grp, ...(s7 ? { s7Address: '' } : {}), ...(ads ? { adsSymbol: '' } : {}), ...(mqtt ? { mqttTopic: last?.mqttTopic || '', mqttJsonPath: '', mqttTimestampPath: last?.mqttTimestampPath || '' } : {}),
            ...(ro === 'snmp' ? { snmpOid: '' } : {}),
            ...(ro === 'http' ? { httpPath: last?.httpPath || '', httpJsonPath: '', httpTimestampPath: last?.httpTimestampPath || '' } : {}),
            ...(ro === 'sql' ? { sqlQuery: last?.sqlQuery || '', sqlColumn: '' } : {}),
            ...(ro === 'bacnet' ? { bacnetObjectType: bacType, bacnetInstance: last?.bacnetInstance !== undefined ? Math.min(4194302, last.bacnetInstance + 1) : undefined, bacnetProperty: 'present-value' } : {}),
            ...(enip ? { cipTag: '' } : {}),
           };
          })()
        : (() => {
           // Komut sayfasında cihaz/klasör seçiliyse yeni komutun hedefi o cihazdan, klasörü o klasör.
           const navDev = page === 'commands' && cmdNav.dev ? cmdNav.dev : '';
           const target = config.tags.find((t) => t.access === 'readwrite' && (!navDev || t.deviceId === navDev)) || config.tags.find((t) => t.access === 'readwrite');
           return {
           id,
           name: 'Yeni komut',
           group: navDev && cmdNav.grp ? cmdNav.grp : '',
           tagIds: [target?.id || ''],
           feedbackTagIds: [target?.id || config.tags[0]?.id || ''],
           timeoutMs: 7000,
           permissives: [],
           risk: 'normal',
           approval: 'none',
           scope: '',
          };
          })();
  setModal({ kind, data, fresh: true, orig: JSON.stringify(data) });
 }
 function openEdit(kind: string, data: any) {
  const copy = structuredClone(data);
  // MQTT dışa yayın config düzeyindedir; bağlantı penceresinde taslak `_publish` olarak düzenlenir.
  if (kind === 'connection' && copy.protocol === 'mqtt') {
   const p = config.mqttPublish;
   copy._publish = p && p.connectionId === copy.id
    ? { enabled: true, baseTopic: p.baseTopic, intervalMs: p.intervalMs, onChange: p.onChange, retain: p.retain, all: p.tagIds === 'all', tagIds: p.tagIds === 'all' ? [] : [...p.tagIds] }
    : { ...emptyPublish() };
  }
  setModal({ kind, data: copy, fresh: false, orig: JSON.stringify(copy) });
 }
 function duplicateTag(t: any) {
  const taken = new Set(config.tags.map((x) => x.code));
  const ds = addressFormatOf(config, t.deviceId) === 'delta' ? nextDeltaSlot(config.tags, t.deviceId, t, taken) : null;
  const data = { ...structuredClone(t), id: crypto.randomUUID(), code: ds?.code ?? nextCode(t.code, taken), name: t.name ? t.name + ' (kopya)' : '', address: ds?.address ?? (symbolicDevice(t.deviceId) ? t.address : nextFreeAddress(config.tags, t.deviceId, t.area)) };
  setModal({ kind: 'tag', data, fresh: true, orig: JSON.stringify(data) });
 }
 async function save(andNew = false) {
  if (!modal) return;
  if (modal.kind === 'alarm') {
   const reason = ruleReason.trim();
   if (!modal.fresh && reason.length < 3) {
    notify('Değişiklik gerekçesi yazın (en az 3 karakter).', 'error');
    return;
   }
   await run(async () => {
    const next = modal.fresh
     ? [...rules, modal.data]
     : rules.map((r) => (r.id === modal.data.id ? modal.data : r));
    await saveRules(next, reason);
    setRuleReason('');
    setModal(null);
   });
   return;
  }
  // Panel taslağını şemaya uygun hale getir: boş ad = kod; geri okumasız adım sondaysa atılır.
  let d0 = modal.data;
  // _cmd: panelde "… kontrol komutunu da oluştur" kutusu; kayda girmez.
  const withCmd = modal.kind === 'tag' && modal.data._cmd !== false;
  if (modal.kind === 'tag') { const { _cmd, ...rest } = d0; d0 = { ...rest, code: String(d0.code).trim(), name: String(d0.name || '').trim() || String(d0.code).trim() }; }
  // _publish: MQTT bağlantı penceresindeki dışa yayın taslağı; bağlantı kaydına girmez, config.mqttPublish olur.
  let pub: PublishDraft | undefined;
  if (modal.kind === 'connection') { const { _publish, ...rest } = d0; pub = _publish; d0 = rest; }
  if (modal.kind === 'command' && d0.kind === 'script') {
   const chk = checkScript(d0.script || '', scriptTagRefs(config), config.devices);
   if (!chk.ok) { const e = chk.errors[0]; notify('Script satır ' + e.line + ': ' + e.message, 'error'); return; }
   d0 = { ...syncScript(d0, config), name: String(d0.name).trim() };
  } else if (modal.kind === 'command') {
   const fb = d0.feedbackTagIds as string[], gap = fb.indexOf('');
   if (gap >= 0 && fb.slice(gap).some(Boolean)) { notify('İkinci adımın geri bildirimi varsa birinci adımın da olmalı.', 'error'); return; }
   d0 = { ...d0, name: String(d0.name).trim(), feedbackTagIds: fb.filter(Boolean) };
  }
  await run(async () => {
   const next = structuredClone(config),
    key = (
     { connection: 'connections', device: 'devices', tag: 'tags', command: 'commands' } as const
    )[modal.kind as 'connection'];
   const list = next[key] as any[];
   const data =
    modal.kind === 'tag' && s7DeviceIds.has(d0.deviceId) && d0.s7Address
     ? { ...d0, s7Address: parseS7Address(d0.s7Address).address }
     : modal.kind === 'tag' && adsDeviceIds.has(d0.deviceId) && d0.adsSymbol
       ? { ...d0, adsSymbol: String(d0.adsSymbol).trim() }
       : modal.kind === 'tag' && opcDeviceIds.has(d0.deviceId) && d0.nodeId
         ? { ...d0, nodeId: String(d0.nodeId).trim() }
         : modal.kind === 'tag' && mqttDeviceIds.has(d0.deviceId)
           ? { ...d0, access: 'read', mqttTopic: String(d0.mqttTopic || '').trim(), mqttJsonPath: String(d0.mqttJsonPath || '').trim(), mqttTimestampPath: String(d0.mqttTimestampPath || '').trim() }
           : modal.kind === 'tag' && readOnlyFmt(d0.deviceId) === 'snmp'
             ? { ...d0, access: 'read', snmpOid: (() => { try { return parseSnmpOid(d0.snmpOid || ''); } catch { return String(d0.snmpOid || '').trim(); } })() }
             : modal.kind === 'tag' && readOnlyFmt(d0.deviceId) === 'http'
               ? { ...d0, access: 'read', httpPath: String(d0.httpPath || '').trim(), httpJsonPath: String(d0.httpJsonPath || '').trim(), httpTimestampPath: String(d0.httpTimestampPath || '').trim() }
               : modal.kind === 'tag' && readOnlyFmt(d0.deviceId) === 'sql'
                 ? { ...d0, access: 'read', sqlQuery: String(d0.sqlQuery || '').trim(), sqlColumn: String(d0.sqlColumn || '').trim() }
                 : modal.kind === 'tag' && readOnlyFmt(d0.deviceId) === 'bacnet'
                   ? { ...d0, access: 'read', bacnetProperty: d0.bacnetProperty || 'present-value' }
                   : modal.kind === 'tag' && enipDevice(d0.deviceId)
                     ? { ...d0, cipTag: String(d0.cipTag || '').trim() }
                     : d0;
   if (modal.fresh) list.push(data);
   else list[list.findIndex((x) => x.id === data.id)] = data;
   if (modal.kind === 'connection') {
    if (d0.protocol === 'mqtt' && pub?.enabled)
     next.mqttPublish = { connectionId: d0.id, baseTopic: pub.baseTopic.trim(), intervalMs: pub.intervalMs, onChange: pub.onChange, retain: pub.retain, tagIds: pub.all ? 'all' : pub.tagIds };
    else if (next.mqttPublish?.connectionId === d0.id) delete next.mqttPublish;
   }
   if (modal.kind === 'tag' && modal.fresh && d0.access === 'readwrite' && withCmd)
    next.commands.push({
     id: 'cmd-' + d0.id,
     name: d0.name + ' kontrol',
     tagIds: [d0.id],
     feedbackTagIds: [d0.id],
     timeoutMs: 7000,
     permissives: [],
     risk: 'normal',
     approval: 'none',
     scope: '',
    });
   await saveConfig(next);
   if (andNew && modal.kind === 'tag' && modal.fresh) {
    // "Ekle ve yenisi": aynı cihaz/klasör/alan, sıradaki kod ve adres; panel açık kalır.
    const taken = new Set([...next.tags.map((t) => t.code)]);
    const step = AREA_INFO[d0.area as Tag['area']].bool || d0.bit !== null ? 1 : registerCount(d0.dataType);
    const ds = addressFormatOf(next, d0.deviceId) === 'delta' ? nextDeltaSlot(next.tags, d0.deviceId, d0, taken) : null;
    const n = { ...d0, id: crypto.randomUUID(), code: ds?.code ?? nextCode(d0.code, taken), name: '', address: ds?.address ?? (symbolicDevice(d0.deviceId) ? d0.address : Math.min(65535, d0.address + step)), ...(d0.s7Address !== undefined ? { s7Address: '' } : {}), ...(d0.adsSymbol !== undefined ? { adsSymbol: '' } : {}), ...(d0.mqttJsonPath !== undefined ? { mqttJsonPath: '' } : {}), ...(d0.snmpOid !== undefined ? { snmpOid: '' } : {}), ...(d0.httpJsonPath !== undefined ? { httpJsonPath: '' } : {}), ...(d0.sqlColumn !== undefined ? { sqlColumn: '' } : {}), ...(d0.cipTag !== undefined ? { cipTag: '' } : {}), ...(typeof d0.bacnetInstance === 'number' ? { bacnetInstance: Math.min(4194302, d0.bacnetInstance + 1) } : {}), nodeId: '', _cmd: modal.data._cmd };
    setModal({ kind: 'tag', data: n, fresh: true, orig: JSON.stringify(n) });
    notify(d0.code + ' eklendi. Sıradaki: ' + n.code + '.');
   } else setModal(null);
  });
 }
 function patch(k: string, v: unknown) {
  setModal((m) => (m ? { ...m, data: { ...m.data, [k]: v } } : null));
 }
 // B51: tek nesne silmenin gercek islemi — hem tekli 'remove' hem de asagidaki toplu
 // silme fonksiyonlari ayni cagriyi kullanir, davranis birebir aynidir.
 async function removeCore(kind: string, id: string) {
  const c = structuredClone(config);
  if (kind === 'connection') c.connections = c.connections.filter((x) => x.id !== id);
  if (kind === 'device') c.devices = c.devices.filter((x) => x.id !== id);
  if (kind === 'tag') c.tags = c.tags.filter((x) => x.id !== id);
  if (kind === 'command') c.commands = c.commands.filter((x) => x.id !== id);
  await saveConfig(c);
 }
 async function remove(kind: string, id: string) {
  if (kind === 'alarm') {
   askConfirm(
    'Alarm kuralı silinsin mi?',
    'Geçmiş kayıtlar korunur.',
    () => void run(() => saveRules(rules.filter((r) => r.id !== id))),
    true,
   );
   return;
  }
  askConfirm(
   'Bu tanım silinsin mi?',
   'Kullanımdaki tanımlar silinemez.',
   () => void run(() => removeCore(kind, id)),
   true,
  );
 }
 // B51: coklu silme — secili id'lerden kullanimda olanlari atlar, geri kalanini TEK bir
 // saveConfig cagrisiyla siler (config butun bir agac oldugu icin id basina ayri PUT,
 // her seferinde ayni eski 'config'i klonlayip birbirinin ustune yazar; tek cagri bunu onler).
 /* Etiket silme planı: ekran/alarm/scriptte kullanılan silinmez (sunucu da engeller); etiketi yazan
  * ya da geri bildirim olarak kullanan komut birlikte silinir; yalnız izin koşuluysa koşul kaldırılır. */
 function deletePlan(ids: string[]) {
  const refs = scriptTagRefs(config);
  const scriptUse = (id: string) => config.commands.filter((c) => c.kind === 'script' && (() => { const k = checkScript(c.script || '', refs, config.devices); return k.reads.includes(id) || k.writes.includes(id); })());
  const items = ids.map((id) => {
   const tag = config.tags.find((t) => t.id === id)!, u = computeUsage(id);
   const blockers = [...u.filter((r) => r.group === 'screen' || r.group === 'alarm'), ...scriptUse(id).map((c) => ({ group: 'command' as const, text: c.name, detail: 'scriptte kullanılıyor' }))];
   return { id, tag, blockers };
  }).filter((x) => x.tag);
  const ok = items.filter((x) => !x.blockers.length), okIds = new Set(ok.map((x) => x.id));
  const drop = config.commands.filter((c) => c.kind !== 'script' && [...c.tagIds, ...c.feedbackTagIds].some((i) => okIds.has(i)));
  const fix = config.commands.filter((c) => !drop.includes(c) && (c.permissives || []).some((p) => okIds.has(p.tagId)));
  return { items, ok, blocked: items.filter((x) => x.blockers.length), drop, fix };
 }
 function askDeleteTags(ids: string[]) { setDelTags(ids); }
 function doDeleteTags() {
  const plan = deletePlan(delTags || []), okIds = new Set(plan.ok.map((x) => x.id)), dropIds = new Set(plan.drop.map((c) => c.id));
  if (!okIds.size) { setDelTags(null); return; }
  void run(async () => {
   const c = structuredClone(config);
   c.tags = c.tags.filter((t) => !okIds.has(t.id));
   c.commands = c.commands.filter((x) => !dropIds.has(x.id)).map((x) => (plan.fix.some((f) => f.id === x.id) ? { ...x, permissives: x.permissives.filter((p) => !okIds.has(p.tagId)) } : x));
   await saveConfig(c);
   setDelTags(null);
   if (modal?.kind === 'tag' && okIds.has(modal.data.id)) setModal(null);
   tagSelection.clear();
   const names = plan.ok.map((x) => x.tag.code);
   setUndo({ text: (names.length === 1 ? names[0] + ' silindi' : names.length + ' etiket silindi') + (plan.drop.length ? ' · ' + plan.drop.length + ' komut' : ''), tags: plan.ok.map((x) => x.tag), commands: plan.drop, before: plan.fix });
  });
 }
 function undoDelete() {
  if (!undo) return;
  const u = undo;
  setUndo(null);
  void run(async () => {
   const c = structuredClone(config);
   c.tags = [...c.tags, ...u.tags.filter((t) => !c.tags.some((x) => x.id === t.id))];
   c.commands = [...c.commands.map((x) => u.before.find((b) => b.id === x.id) || x), ...u.commands.filter((x) => !c.commands.some((y) => y.id === x.id))];
   await saveConfig(c);
   notify('Geri alındı: ' + u.tags.map((t) => t.code).join(', ') + '.');
  });
 }
 useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 8000); return () => clearTimeout(t); }, [undo]);
 async function bulkRemoveConfigItems(
  kind: 'tag' | 'command',
  items: { id: string; label: string }[],
  inUse: (id: string) => boolean,
 ) {
  const blocked = items.filter((x) => inUse(x.id));
  const ok = items.filter((x) => !inUse(x.id));
  const noun = kind === 'tag' ? 'etiket' : 'komut';
  if (!ok.length) {
   notify('Seçili ' + noun + 'lerin tümü kullanımda; silinemedi.', 'error');
   return;
  }
  const names = ok.slice(0, 3).map((x) => x.label).join(', ') + (ok.length > 3 ? ', …' : '');
  const blockedText = blocked.length
   ? ' ' + blocked.length + ' ' + noun + ' kullanımda olduğu için atlanacak: ' +
     blocked.slice(0, 3).map((x) => x.label).join(', ') + (blocked.length > 3 ? ', …' : '') + '.'
   : '';
  askConfirm(
   ok.length + ' ' + noun + ' silinsin mi?',
   names + ' silinecek.' + blockedText,
   () =>
    void run(async () => {
     const c = structuredClone(config);
     const okIds = new Set(ok.map((x) => x.id));
     if (kind === 'tag') c.tags = c.tags.filter((x) => !okIds.has(x.id));
     if (kind === 'command') c.commands = c.commands.filter((x) => !okIds.has(x.id));
     await saveConfig(c);
     if (blocked.length) notify(blocked.length + ' ' + noun + ' kullanımda olduğu için atlandı.', 'error');
    }),
   true,
  );
 }
 // B51: toplu kural silme — tekli 'remove' ile ayni saveRules cagrisi, tek onay.
 function bulkDeleteRules(items: AlarmRule[]) {
  const names = items.slice(0, 3).map((r) => r.name).join(', ') + (items.length > 3 ? ', …' : '');
  askConfirm(
   items.length + ' alarm kuralı silinsin mi?',
   names + ' silinecek. Geçmiş kayıtlar korunur.',
   () => {
    void run(async () => {
     const ids = new Set(items.map((r) => r.id));
     await saveRules(rules.filter((r) => !ids.has(r.id)));
     ruleSelection.clear();
    });
   },
   true,
  );
 }
 // B51: toplu etkin/devre disi — tekli duzenleme ile ayni kural: gerekce en az 3 karakter,
 // tum secim TEK saveRules cagrisiyla (rules dizisi zaten bir bütün olarak kaydediliyor).
 async function bulkSetRulesEnabled(ids: string[], enabled: boolean, reason: string) {
  if (reason.trim().length < 3) {
   notify('Değişiklik gerekçesi yazın (en az 3 karakter).', 'error');
   return;
  }
  await run(async () => {
   const idSet = new Set(ids);
   await saveRules(
    rules.map((r) => (idSet.has(r.id) ? { ...r, enabled } : r)),
    reason.trim(),
   );
   ruleSelection.clear();
   setBulkRuleReason('');
  });
 }
 function usageRows(tagId: string) {
  return references || computeUsage(tagId);
 }
 function computeUsage(tagId: string) {
  const rows: {
   group: 'screen' | 'revision' | 'command' | 'alarm';
   text: string;
   detail: string;
   screenId?: string;
  }[] = [];
  for (const s of screens) {
   const versions = [
    ['taslak', s.draft],
    ['yayın', s.published],
   ] as const;
   for (const [vLabel, scr] of versions) {
    if (!scr) continue;
    for (const w of scr.widgets) {
     const fields: string[] = [];
     if (w.tagId === tagId) fields.push('nesne etiketi');
     if (w.visibleTagId === tagId) fields.push('görünürlük etiketi');
     const cmd = config.commands.find((c) => c.id === w.commandId);
     if (cmd?.tagIds.includes(tagId)) fields.push('komut yazma hedefi');
     if (cmd?.feedbackTagIds.includes(tagId)) fields.push('komut geri bildirimi');
     w.parts.forEach((p, i) => {
      if (p.tagId === tagId) fields.push('kademe ' + (i + 1) + ' etiketi');
     });
     w.details.forEach((d, i) => {
      if (d.tagId === tagId) fields.push('bilgi satırı ' + (i + 1) + ' etiketi');
      if (d.kind === 'command') {
       const dc = config.commands.find((c) => c.id === d.commandId);
       if (dc && (dc.tagIds.includes(tagId) || dc.feedbackTagIds.includes(tagId)))
        fields.push('bilgi satırı ' + (i + 1) + ' komutu');
      }
     });
     if (fields.length)
      rows.push({
       group: 'screen',
       text: s.name + ' · ' + (w.label || w.id.slice(0, 8)) + ' (' + vLabel + ')',
       detail: fields.join(', '),
       screenId: s.id,
      });
    }
   }
  }
  for (const c of config.commands) {
   const fields: string[] = [];
   if (c.tagIds.includes(tagId)) fields.push('yazma hedefi');
   if (c.feedbackTagIds.includes(tagId)) fields.push('geri bildirim');
   if (c.permissives.some((p) => p.tagId === tagId)) fields.push('izin koşulu');
   if (fields.length) rows.push({ group: 'command', text: c.name, detail: fields.join(', ') });
  }
  for (const r of rules)
   if (r.tagId === tagId) rows.push({ group: 'alarm', text: r.name, detail: 'alarm etiketi' });
  return rows;
 }
 // B51: toplu silme icin komut kullanim denetimi — usageRows'un ekran tarama mantiginin
 // komutlar icin daraltilmis hali (sadece evet/hayir, tek etiketin ayrintili listesi degil).
 function commandInUse(commandId: string) {
  for (const s of screens) {
   for (const scr of [s.draft, s.published]) {
    if (!scr) continue;
    for (const w of scr.widgets) {
     if (w.commandId === commandId) return true;
     if (w.details.some((d: any) => d.kind === 'command' && d.commandId === commandId)) return true;
    }
   }
  }
  return false;
 }
 /** Komutun bağlı olduğu ekran nesneleri (taslak veya yayın, tekilleştirilmiş). */
 function commandScreens(commandId: string) {
  const out: { id: string; text: string }[] = [], seen = new Set<string>();
  for (const s of screens) for (const scr of [s.draft, s.published]) {
   if (!scr) continue;
   for (const w of scr.widgets) if (w.commandId === commandId || w.details.some((d: any) => d.kind === 'command' && d.commandId === commandId)) {
    const k = s.id + '|' + w.id; if (seen.has(k)) continue; seen.add(k);
    out.push({ id: s.id, text: s.name + ' · ' + (w.label || w.type) });
   }
  }
  return out;
 }
 // Son gönderimler: sunucu kaydı (200) + canlı akış; kimliğe göre tekil, en yeni önce.
 const stopScript = (executionId: string) => void run(async () => { await api('/commands/' + encodeURIComponent(executionId) + '/stop', 'POST'); notify('Script durduruldu; güvenli durum yazılıyor.'); });
 const allExecs = (() => { const m = new Map<string, Execution>(); for (const e of [...execs, ...live.commands]) { const p = m.get(e.id); if (!p || e.updatedAt >= p.updatedAt) m.set(e.id, e); } return [...m.values()].sort((a, b) => b.createdAt - a.createdAt); })();
 const usageGroupLabels = {
  screen: 'Ekran nesneleri',
  command: 'Komutlar',
  alarm: 'Alarm kuralları',
 } as const;
 function fmtField(k: string, v: any): string {
  if (v === '' || v === undefined || v === null) return '—';
  if (k === 'tagId' || k === 'visibleTagId')
   return config.tags.find((t) => t.id === v)?.code || String(v);
  if (k === 'commandId') return config.commands.find((c) => c.id === v)?.name || String(v);
  if (k === 'targetScreenId') return screens.find((s) => s.id === v)?.name || String(v);
  if (typeof v === 'boolean') return v ? 'evet' : 'hayır';
  return String(v);
 }
 const widgetFieldLabels: Record<string, string> = {
  x: 'X konumu',
  y: 'Y konumu',
  width: 'Genişlik',
  height: 'Yükseklik',
  rotation: 'Döndürme',
  tagId: 'Etiket bağı',
  visibleTagId: 'Görünürlük etiketi',
  visibleWhen: 'Görünürlük koşulu',
  commandId: 'Komut',
  action: 'Eylem',
  setValue: 'Ayar değeri',
  color: 'Renk',
  offColor: 'Kapalı rengi',
  label: 'Etiket metni',
  onText: 'Açık metni',
  offText: 'Kapalı metni',
  unit: 'Birim',
  decimals: 'Ondalık',
  min: 'Alt sınır',
  max: 'Üst sınır',
  mode: 'Mod',
  rangeMode: 'Aralık modu',
  lineWidth: 'Çizgi kalınlığı',
  opacity: 'Saydamlık',
  fontSize: 'Yazı boyutu',
  textAlign: 'Hizalama',
  locked: 'Kilit',
  groupId: 'Grup',
  targetScreenId: 'Hedef ekran',
  src: 'Görsel',
  fit: 'Sığdırma',
  animated: 'Animasyon',
  reverse: 'Ters',
  flipX: 'Yatay çevir',
  flipY: 'Dikey çevir',
  animationSpeed: 'Animasyon hızı',
  labelVisible: 'Etiket görünür',
  type: 'Tip',
 };
 function diffWidget(oldW: any, newW: any) {
  const fields: { field: string; from: string; to: string }[] = [];
  for (const k of Object.keys(widgetFieldLabels))
   if (JSON.stringify(oldW[k]) !== JSON.stringify(newW[k]))
    fields.push({
     field: widgetFieldLabels[k],
     from: fmtField(k, oldW[k]),
     to: fmtField(k, newW[k]),
    });
  if (JSON.stringify(oldW.parts) !== JSON.stringify(newW.parts))
   fields.push({
    field: 'Kademeler',
    from: (oldW.parts || []).length + ' kademe',
    to: (newW.parts || []).length + ' kademe',
   });
  if (JSON.stringify(oldW.details) !== JSON.stringify(newW.details))
   fields.push({
    field: 'Bilgi satırları',
    from: (oldW.details || []).length + ' satır',
    to: (newW.details || []).length + ' satır',
   });
  return fields;
 }
 function openDiff(s: ScreenRecord) {
  diffCloseRef.current = document.activeElement as HTMLElement | null;
  if (!s.published) {
   notify('"' + s.name + '" ekranı hiç yayınlanmadı; karşılaştırılacak yayın sürümü yok.', 'error');
   return;
  }
  const d = s.draft.widgets,
   p = s.published.widgets,
   pIds = new Set(p.map((w) => w.id)),
   dIds = new Set(d.map((w) => w.id));
  const entries: {
   kind: 'added' | 'removed' | 'changed';
   label: string;
   fields?: { field: string; from: string; to: string }[];
  }[] = [];
  for (const w of d) if (!pIds.has(w.id)) entries.push({ kind: 'added', label: w.label || w.type });
  for (const w of p)
   if (!dIds.has(w.id)) entries.push({ kind: 'removed', label: w.label || w.type });
  for (const w of d) {
   const old = p.find((x) => x.id === w.id);
   if (!old) continue;
   const fields = diffWidget(old, w);
   if (fields.length) entries.push({ kind: 'changed', label: w.label || w.type, fields });
  }
  setDiff({ screen: s.name, total: entries.length, entries: entries.slice(0, 100) });
 }
 async function openRevisionDiff() {
  if (revisionCompare.length !== 2) return;
  const [older, newer] = [...revisionCompare].sort((a, b) => a - b),
   name = screens.find((s) => s.id === revisionScreen)?.name || revisionScreen;
  const [oldDoc, newDoc] = await Promise.all([
   api<{ screen: any }>('/screens/' + revisionScreen + '/revisions/' + older),
   api<{ screen: any }>('/screens/' + revisionScreen + '/revisions/' + newer),
  ]);
  diffCloseRef.current = document.activeElement as HTMLElement | null;
  const d = newDoc.screen.widgets,
   p = oldDoc.screen.widgets,
   pIds = new Set(p.map((w: any) => w.id)),
   dIds = new Set(d.map((w: any) => w.id));
  const entries: {
   kind: 'added' | 'removed' | 'changed';
   label: string;
   fields?: { field: string; from: string; to: string }[];
  }[] = [];
  for (const w of d) if (!pIds.has(w.id)) entries.push({ kind: 'added', label: w.label || w.type });
  for (const w of p)
   if (!dIds.has(w.id)) entries.push({ kind: 'removed', label: w.label || w.type });
  for (const w of d) {
   const old = p.find((x: any) => x.id === w.id);
   if (!old) continue;
   const fields = diffWidget(old, w);
   if (fields.length) entries.push({ kind: 'changed', label: w.label || w.type, fields });
  }
  setDiff({
   screen: name + ' · v' + older + ' / v' + newer,
   total: entries.length,
   entries: entries.slice(0, 100),
  });
 }
 // Etiket/komut sütun başlığı filtreleri. Sayaçlar o sütunun kendi filtresi hariç uygulanmış kümeden.
 type TagFilter = { q: string; devices: string[]; types: string[]; access: string[]; states: string[] };
 const emptyTagFilter = (): TagFilter => ({ q: '', devices: [], types: [], access: [], states: [] });
 const [tagFilter, setTagFilter] = useSessionState<TagFilter>('dvp.tags.filter', emptyTagFilter),
  [cmdFilter, setCmdFilter] = useSessionState<{ q: string; risks: string[] }>('dvp.commands.filter', () => ({ q: '', risks: [] })),
  [cfgFilterOpen, setCfgFilterOpen] = useState<string | null>(null),
  [deviceTab, setDeviceTab] = useSessionState<'devices' | 'connections'>('dvp.devices.tab', () => 'devices'),
  // Etiket gezinmesi: cihaz → bölüm. grp null = cihazın tüm bölümleri, '' = bölümsüz etiketler.
  [tagNavRaw, setTagNav] = useSessionState<TagNavState>('dvp.tags.nav', () => ({ dev: '', grp: null })),
  [folderSort, setFolderSort] = useSessionState<'bad' | 'name'>('dvp.tags.folderSort', () => 'bad'),
  // Komut gezinmesi etiketlerle aynı: cihaz (yazma hedefinin cihazı) → klasör (komutun group alanı).
  [cmdNavRaw, setCmdNav] = useSessionState<CmdNavState>('dvp.commands.nav', () => ({ dev: '', grp: null })),
  [cmdFolderSort, setCmdFolderSort] = useSessionState<'bad' | 'name'>('dvp.commands.folderSort', () => 'bad');
 // Silinmiş cihaza işaret eden eski oturum durumu sessizce "tüm cihazlar"a döner.
 const tagNav: TagNavState = config.devices.some((d) => d.id === tagNavRaw.dev) ? tagNavRaw : { dev: '', grp: null };
 const cmdNav: CmdNavState = config.devices.some((d) => d.id === cmdNavRaw.dev) ? cmdNavRaw : { dev: '', grp: null };
 const tagStateLabels = { good: 'Güncel', stale: 'Bayat', bad: 'Hata', never: 'Hiç okunmadı' } as const;
 const areaShort: Record<string, string> = { coil: 'C', 'discrete-input': 'DI', 'holding-register': 'HR', 'input-register': 'IR' };
 const areaLabel: Record<string, string> = { coil: 'Coil', 'discrete-input': 'Dijital giriş', 'holding-register': 'Holding register', 'input-register': 'Input register' };
 const tagState = (t: Tag): keyof typeof tagStateLabels => {
  const smp = live.samples[t.id];
  return !smp || smp.quality === 'unknown' ? 'never' : smp.quality === 'good' ? 'good' : smp.quality === 'bad' ? 'bad' : 'stale';
 };
 const textHit = (q: string, ...parts: unknown[]) => !q.trim() || parts.join(' ').toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'));
 function tagVisible(t: Tag, skip?: keyof TagFilter) {
  const f = tagFilter;
  return (!tagNav.dev || (t.deviceId === tagNav.dev && (t.group || '').trim() === (tagNav.grp ?? ''))) &&
   (skip === 'q' || textHit(f.q, t.code, t.name, t.group, t.s7Address, t.adsSymbol, t.nodeId, t.area, t.address, t.description, t.unit)) &&
   (skip === 'devices' || !f.devices.length || f.devices.includes(t.deviceId)) &&
   (skip === 'types' || !f.types.length || f.types.includes(t.dataType)) &&
   (skip === 'access' || !f.access.length || f.access.includes(t.access)) &&
   (skip === 'states' || !f.states.length || f.states.includes(tagState(t)));
 }
 function cmdVisible(c: any, skipRisk = false) {
  const codes = [...c.tagIds, ...c.feedbackTagIds].map((id: string) => config.tags.find((t) => t.id === id)?.code);
  return (!cmdNav.dev || cmdNav.grp === null || (commandDevice(config, c) === cmdNav.dev && commandGroup(c) === cmdNav.grp)) &&
   textHit(cmdFilter.q, c.name, c.scope, ...codes) && (skipRisk || !cmdFilter.risks.length || cmdFilter.risks.includes(c.risk || 'normal'));
 }
 // B51: toplu secim — su an gorunen (filtrelenmis) satirlarin id'leri; sayfa degisince sifirlanir.
 const filteredTagIds = config.tags.filter((t) => tagVisible(t)).map((t: Tag) => t.id);
 const filteredCommandIds = config.commands.filter((c) => cmdVisible(c)).map((c: { id: string }) => c.id);
 const tagSelection = useSelection(filteredTagIds, 'tags');
 const commandSelection = useSelection(filteredCommandIds, 'commands');
 // B51: ozet satirinin yerini alan kompakt secim cubugu — ayni sinif/yukseklik, siçrama yok.
 const selectionBar = (sel: Selection, actions: React.ReactNode) => (
  <div className="filter-summary selection-bar" aria-live="polite">
   <span>{sel.selected.size} seçili</span>
   <div className="toolbar-group">{actions}</div>
   <button onClick={sel.clear}>Seçimi temizle</button>
  </div>
 );
 function tagQuality(t: any) {
  const s = live.samples[t.id],
   d = config.devices.find((x) => x.id === t.deviceId),
   age = s ? Math.round((Date.now() - s.receivedAt) / 1000) : null,
   last = s ? new Date(s.receivedAt).toLocaleString('tr-TR') : '—';
  const never = !s || s.quality === 'unknown';
  const label = never
   ? 'Hiç okunmadı'
   : s!.quality === 'bad'
     ? 'Hata'
     : s!.quality === 'stale'
       ? 'Bayat'
       : typeof s!.value === 'boolean'
         ? s!.value
           ? 'AÇIK'
           : 'KAPALI'
         : String(s!.value);
  const cls = never
   ? ''
   : s!.quality === 'good'
     ? 'green'
     : s!.quality === 'bad'
       ? 'bad'
       : s!.quality === 'stale'
         ? 'warn'
         : '';
  const reason = never
   ? 'Etiket kuruluştan bu yana hiç okunamadı.'
   : s!.quality === 'bad'
     ? 'Cihazdan protokol hatası alındı; adres veya veri tipini kontrol edin.'
     : s!.quality === 'stale'
       ? 'Cihaz ' + age + ' sn önce yanıt verdi, sürede güncellenmedi.'
       : 'Veri güncel.';
  const tip =
   'Son değer: ' +
   (s ? String(s.value) : '—') +
   ' · Veri yaşı: ' +
   (age === null ? '—' : age + ' sn') +
   ' · Son okuma: ' +
   last +
   ' · ' +
   reason +
   ' · Cihaz: ' +
   (d?.code || '—') +
   ' · Adres: ' +
   (symbolicDevice(t.deviceId) ? symbolicAddressOf(t, config.connections.find((c) => c.id === d?.connectionId)) : t.area + ' ' + t.address);
  return { label, cls, tip };
 }
 const actions = (kind: string, data: any) => (
  <div className="row-actions">
   {writable && (
    <>
     <button
      title="Düzenle"
      onClick={() => openEdit(kind, data)}
     >
      <Pencil size={15} />
     </button>
     <button title="Sil" onClick={() => void remove(kind, data.id)}>
      <Trash2 size={15} />
     </button>
    </>
   )}
   {kind === 'tag' && (
    <button title="Nerede kullanılıyor?" onClick={() => setUsed(data.id)}>
     <Link2 size={15} />
    </button>
   )}
  </div>
 );
 const title = (
  {
   devices: 'Cihazlar ve bağlantılar',
   tags: 'Etiket yönetimi',
   commands: 'Komut tanımları',
   alarms: 'Alarm yönetimi',
   audit: 'İşlem kayıtları',
   settings: 'Proje ayarları',
  } as Record<string, string>
 )[page];
 // --- Sayfa gövdeleri ve modaller ---
 // Her sayfa/modal, okunabilirlik için ayrı bir değişkene çıkarılmıştır;
 // aşağıdaki return içinde sadece ilgili değişken render edilir. Davranış
 // öncekiyle birebir aynıdır (tek satırlık return'ün mekanik olarak
 // bölünmesi), koşullar/mantık değişmemiştir.
 // Sayfa: Cihazlar ve bağlantılar — önce sahaya uygulanmamış değişiklik, sonra özet, sonra cihaz kartları.
 const deviceCounts = config.devices.reduce(
  (n, d) => {
   const st = live.devices.find((x) => x.id === d.id)?.status;
   if (!d.enabled) n.off++;
   else if (st === 'ready') n.ready++;
   else if (st === 'partial' || st === 'down') n.bad++;
   else n.wait++;
   return n;
  },
  { ready: 0, bad: 0, off: 0, wait: 0 },
 );
 const pendingRows = (pending?.diff || []).filter((d: any) => d.added.length || d.removed.length || d.changed.length);
 const deployButton = user.role === 'admin' && (
  <button
   disabled={busy}
   className="btn primary"
   onClick={() =>
    void run(async () => {
     await api('/deploy', 'POST');
     notify('Yapılandırma uygulandı; yeni PLC verisi bekleniyor.');
    })
   }
  >
   <Upload size={16} />
   {busy ? 'Uygulanıyor…' : 'Haberleşmeye uygula'}
  </button>
 );
 const devicesPage = page === 'devices' && (
  <div className="cfg-page">
   {pending && !pending.applied ? (
    <div className="cfg-pending">
     <div className="cfg-pending-text">
      <strong>Sahaya uygulanmamış değişiklik var</strong>
      <span>
       Kayıtlı v{config.revision} · sahada v{live.activeRevision}. Operatör ekranı uygulanana kadar eski yapılandırmayla çalışır.
      </span>
      <ul>
       {pendingRows.map((d: any) => (
        <li key={d.kind}>
         <b>{({ devices: 'Cihaz', tags: 'Etiket', commands: 'Komut' } as any)[d.kind]}</b>
         {[
          d.added.length && d.added.length + ' yeni',
          d.changed.length && d.changed.length + ' değişti',
          d.removed.length && d.removed.length + ' silindi',
         ]
          .filter(Boolean)
          .join(' · ')}
         <small>{[...d.added, ...d.changed, ...d.removed].slice(0, 4).join(', ')}{d.added.length + d.changed.length + d.removed.length > 4 ? '…' : ''}</small>
        </li>
       ))}
       {pending.affectedScreens.length > 0 && <li><b>Ekran</b>{pending.affectedScreens.join(', ')}</li>}
       {pending.affectedAlarmRules.length > 0 && <li><b>Alarm kuralı</b>{pending.affectedAlarmRules.join(', ')}</li>}
       {pending.pendingCommands > 0 && <li><b>Bekleyen</b>{pending.pendingCommands} komut sonucu bitmeden uygulama başlamaz</li>}
      </ul>
     </div>
     {deployButton}
    </div>
   ) : (
    <div className="cfg-synced">
     <Check size={14} />
     Saha yapılandırması güncel · v{live.activeRevision}
     <InfoTip>Kayıtlı değişiklikler "Haberleşmeye uygula" ile sahaya geçer; uygulama sırasında ilgili bağlantılar yeniden kurulur.</InfoTip>
    </div>
   )}
   <div className="report-kpis">
    <div><span>Cihaz</span><strong>{config.devices.length}</strong><small>{deviceCounts.off ? deviceCounts.off + ' pasif' : 'hepsi etkin'}</small></div>
    <div><span>Güncel</span><strong>{deviceCounts.ready}</strong><small>veri akıyor</small></div>
    <div className={deviceCounts.bad ? 'warn' : ''}><span>Sorunlu</span><strong>{deviceCounts.bad}</strong><small>{deviceCounts.wait ? deviceCounts.wait + ' veri bekliyor' : 'kısmi veya kopuk'}</small></div>
    <div><span>Bağlantı</span><strong>{config.connections.length}</strong><small>{[...new Set(config.connections.map((c) => protocolLabels[connectionProtocol(c)]))].join(' · ') || '—'}</small></div>
   </div>
   <div className="page-tabs report-tabs cfg-tabs" role="tablist" aria-label="Cihaz bölümü" style={{ '--tab-i': deviceTab === 'devices' ? 0 : 1, '--tab-n': 2 } as React.CSSProperties}>
    <span className="page-tabs-indicator" aria-hidden="true" />
    <button role="tab" aria-selected={deviceTab === 'devices'} onClick={() => setDeviceTab('devices')}>Cihazlar<span className="tab-count">{config.devices.length}</span></button>
    <button role="tab" aria-selected={deviceTab === 'connections'} onClick={() => setDeviceTab('connections')}>Bağlantılar<span className="tab-count">{config.connections.length}</span></button>
   </div>
   <div key={deviceTab} role="tabpanel" className={'tab-panel ' + (deviceTab === 'devices' ? 'prev' : 'next')}>
    {deviceTab === 'devices' && (
     <div className="device-grid">
      {config.devices.map((d) => {
       const c = config.connections.find((x) => x.id === d.connectionId),
        dh = live.devices.find((x) => x.id === d.id),
        st = !d.enabled ? 'off' : dh?.status || 'wait',
        own = config.tags.filter((t) => t.deviceId === d.id).length;
       return (
        <article key={d.id} className={'device-card st-' + st}>
         <header>
          <div>
           <strong>{d.code}</strong>
           <span>{d.name}</span>
          </div>
          {actions('device', d)}
         </header>
         <dl>
          <dt>Bağlantı</dt>
          <dd>{c?.name || '—'}<small className="mono">{c ? connectionAddress(c) : ''}</small></dd>
          <dt>Protokol</dt>
          <dd>{c ? protocolLabels[connectionProtocol(c)] : '—'}{!symbolicDevice(d.id) && <small>Slave ID {d.slaveId}</small>}</dd>
          <dt>Tarama</dt>
          <dd className="mono">{d.pollMs} ms</dd>
          {c?.protocol === 's7' && d.enabled && <PlcHealthRow connectionId={c.id} />}
         </dl>
         <footer>
          <span className="device-state"><i />{!d.enabled ? 'Pasif' : dh ? deviceStatusLabels[dh.status] : 'Veri bekleniyor'}</span>
          {d.enabled && dh && dh.tags > 0 ? (
           <span className="device-tags" title={dh.good + ' / ' + dh.tags + ' etiket güncel'}>
            <span className="share-track"><span style={{ width: (dh.good / dh.tags) * 100 + '%' }} /></span>
            <span className="mono">{dh.good}/{dh.tags}</span>
           </span>
          ) : (
           <span className="muted small">{own} etiket</span>
          )}
         </footer>
        </article>
       );
      })}
      {!config.devices.length && <div className="empty-state">Henüz cihaz yok. Önce bir bağlantı, sonra cihaz ekleyin.</div>}
     </div>
    )}
    {deviceTab === 'connections' && (
     <section className="report-card flush">
      <header>
       <h3>Bağlantılar</h3>
       {writable && (
        <button className="btn small" onClick={() => fresh('connection')}>
         <Plus size={14} />
         Bağlantı ekle
        </button>
       )}
      </header>
      <div className="table-wrap">
       <table className="cfg-table">
        <thead>
         <tr>
          <th>Ad</th>
          <th>Adres</th>
          <th>Protokol</th>
          <th>Cihaz</th>
          <th>Zaman aşımı</th>
          <th />
         </tr>
        </thead>
        <tbody>
         {config.connections.map((c) => (
          <tr key={c.id}>
           <td><strong>{c.name}</strong></td>
           <td className="mono">
            {connectionAddress(c)}
            {c.protocol === 's7' && <small>rack {c.rack ?? 0} · slot {c.slot ?? 1}</small>}
            {c.protocol === 'ads' && <small>AMS {c.amsNetId} · port {c.adsPort ?? 851}</small>}
            {c.protocol === 'mqtt' && <small>{c.mqttTls ? 'TLS' : 'TLS yok'}{config.mqttPublish?.connectionId === c.id ? ' · yayın ' + config.mqttPublish.baseTopic + '/…' : ''}</small>}
            {c.protocol === 'snmp' && <small>{(c.snmpVersion ?? '2c') === '3' ? 'v3 · ' + (c.snmpSecurityLevel ?? 'authPriv') : 'v' + (c.snmpVersion ?? '2c')}</small>}
            {c.protocol === 'http' && <small>{({ none: 'kimliksiz', basic: 'Basic', bearer: 'Bearer token' } as Record<string, string>)[c.httpAuth ?? 'none']}</small>}
            {c.protocol === 'sql' && <small>{(c.sqlEncrypt ?? true) ? 'şifreli' : 'şifresiz'}{c.sqlTrustServerCertificate ? ' · sertifika doğrulanmıyor' : ''}</small>}
           </td>
           <td><span className="cfg-chip">{protocolLabels[connectionProtocol(c)]}</span></td>
           <td>{config.devices.filter((d) => d.connectionId === c.id).map((d) => d.code).join(', ') || <span className="muted">—</span>}</td>
           <td className="mono">{c.timeout} ms</td>
           <td>{actions('connection', c)}</td>
          </tr>
         ))}
        </tbody>
       </table>
       {!config.connections.length && <div className="empty-state">Henüz bağlantı yok.</div>}
      </div>
     </section>
    )}
   </div>
  </div>
 );
 // Sayfa: Etiket yönetimi — filtreler sütun başlıklarında; ham alan kodu yerine okunur adres.
 const tagFacet = (key: (t: Tag) => string, skip: keyof TagFilter) => {
  const m: Record<string, number> = {};
  for (const t of config.tags) if (tagVisible(t, skip)) m[key(t)] = (m[key(t)] || 0) + 1;
  return m;
 };
 const devFacet = tagFacet((t) => t.deviceId, 'devices'),
  typeFacet = tagFacet((t) => t.dataType, 'types'),
  accFacet = tagFacet((t) => t.access, 'access'),
  stateFacet = tagFacet((t) => tagState(t), 'states');
 const tagFilterCount = (tagFilter.q.trim() ? 1 : 0) + tagFilter.devices.length + tagFilter.types.length + tagFilter.access.length + tagFilter.states.length;
 const tagCol = { open: cfgFilterOpen, setOpen: setCfgFilterOpen };
 const toggleList = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
 const devOrder = new Map(config.devices.map((d, i) => [d.id, i]));
 const groupKey = (t: Tag) => t.deviceId + '\u0000' + (t.group || '').trim();
 // Sıra: cihaz → bölüm (ilk görülme sırası, bölümsüz en sonda) → tanım sırası. Başlık satırları bu sırayı izler.
 const groupOrder = new Map<string, number>();
 for (const t of config.tags) { const k = groupKey(t); if (!groupOrder.has(k)) groupOrder.set(k, (t.group || '').trim() ? groupOrder.size : 1e6 + groupOrder.size); }
 const visibleTags = config.tags.filter((t) => tagVisible(t)).sort((a, b) => (devOrder.get(a.deviceId) ?? 999) - (devOrder.get(b.deviceId) ?? 999) || groupOrder.get(groupKey(a))! - groupOrder.get(groupKey(b))!);
 const tagPage = usePaged(visibleTags, JSON.stringify(tagFilter) + JSON.stringify(tagNav));
 const renameGroup = (deviceId: string, from: string, to: string) => void run(async () => {
  await saveConfig({ ...config, tags: config.tags.map((t) => (t.deviceId === deviceId && (t.group || '').trim() === from ? { ...t, group: to } : t)) });
  notify('"' + from + '" bölümü "' + to + '" olarak değiştirildi.');
 });
 const tagsPage = page === 'tags' && (() => {
  const scope = config.tags.filter((t) => !tagNav.dev || (t.deviceId === tagNav.dev && (t.group || '').trim() === (tagNav.grp ?? '')));
  const all = { good: 0, stale: 0, bad: 0, never: 0 } as Record<'good' | 'stale' | 'bad' | 'never', number>;
  for (const t of scope) all[tagState(t)]++;
  const cols = (writable ? 1 : 0) + 7;
  const navDev = config.devices.find((d) => d.id === tagNav.dev);
  const go = (n: TagNavState) => { setTagNav(n); tagSelection.clear(); setMoveTo(null); };
  const folders = navDev ? [...new Set(config.tags.filter((t) => t.deviceId === navDev.id).map((t) => (t.group || '').trim()).filter(Boolean))].length + (draftGroups[navDev.id] || []).length : 0;
  const csvTemplate = () => {
   const head = 'device,code,name,group,area,address,dataType,access,scale,offset,min,max,unit,wordOrder,byteOrder,bit,verifyTolerance,description,s7Address,adsSymbol,nodeId,mqttTopic,mqttJsonPath,mqttTimestampPath,snmpOid,httpPath,httpJsonPath,httpTimestampPath,sqlQuery,sqlColumn';
   const dev = navDev?.code || config.devices.find((d) => !symbolicDevice(d.id))?.code || 'PLC-01';
   const body = [head, `${dev},M0,Start butonu,Pano 1,coil,2048,bool,readwrite,1,0,0,1,,big,big,,,Örnek bit,,,,,,,,,,,,`, `${dev},D100,Sıcaklık,Pano 1,holding-register,4196,int16,read,0.1,0,0,200,°C,big,big,,,Örnek register,,,,,,,,,,,,`].join(String.fromCharCode(13, 10));
   const u = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + body], { type: 'text/csv;charset=utf-8' }));
   const a = document.createElement('a'); a.href = u; a.download = 'etiket-sablonu.csv'; a.click(); URL.revokeObjectURL(u);
  };
  const selGroups = [...new Set(config.tags.filter((t) => tagSelection.selected.has(t.id) || t.deviceId === tagNav.dev).map((t) => (t.group || '').trim()).filter(Boolean))];
  const applyMove = () => {
   const ids = tagSelection.selected, g = (moveTo || '').trim();
   void run(async () => { await saveConfig({ ...config, tags: config.tags.map((t) => (ids.has(t.id) ? { ...t, group: g } : t)) }); notify(ids.size + ' etiket ' + (g ? '"' + g + '" bölümüne taşındı.' : 'bölümden çıkarıldı.')); });
   setMoveTo(null);
  };
  const problems = all.bad + all.stale;
  return (
  <div className="cfg-page">
   <div className="tag-top">
    <TagCrumbs config={config} nav={tagNav} setNav={go} />
    <TagQuickFind config={config} onPick={(t) => { go({ dev: t.deviceId, grp: (t.group || '').trim() }); if (writable) openEdit('tag', t); }} />
     {writable && (
      <span className="tag-top-tools">
       <span className="cfg-menu-wrap">
        <button className="btn small" aria-haspopup="menu" aria-expanded={addMenu} onClick={() => setAddMenu(!addMenu)}><Layers size={13} />Toplu ekle<ChevronDown size={13} /></button>
        {addMenu && (
         <>
          <div className="cfg-menu-backdrop" onClick={() => setAddMenu(false)} />
          <div className="cfg-menu" role="menu" onClick={() => setAddMenu(false)} onKeyDown={(e) => { if (e.key === 'Escape') setAddMenu(false); }}>
           <button role="menuitem" onClick={() => setImportOpen(true)}><ClipboardPaste size={14} /><span>Excel'den yapıştır / CSV<small>Satır satır önizleme; hatalı satırlar atlanır</small></span></button>
           <button role="menuitem" onClick={() => setSeries(true)}><Layers size={14} /><span>Seri ekle<small>M0…M15, D100…D130 gibi ardışık adresler</small></span></button>
           {s7DeviceIds.size > 0 && <button role="menuitem" onClick={() => setTiaOpen(true)}><FileSpreadsheet size={14} /><span>TIA Portal'dan aktar<small>PLC tags .xlsx dışa aktarımı</small></span></button>}
           <button role="menuitem" onClick={csvTemplate}><Download size={14} /><span>CSV şablonu indir<small>device, code, name, group, area, address, dataType, access…</small></span></button>
          </div>
         </>
        )}
       </span>
      </span>
     )}
   </div>
   {!navDev && <TagDeviceList config={config} live={live} setNav={go} />}
   {navDev && tagNav.grp === null && (
    <TagFolderTiles config={config} live={live} nav={tagNav} setNav={go} writable={writable} draft={draftGroups[navDev.id] || []} setDraft={(g) => setDraftGroups({ ...draftGroups, [navDev.id]: g })}
     onRename={(from, to) => renameGroup(navDev.id, from, to)} sort={folderSort} setSort={setFolderSort} />
   )}
   {navDev && tagNav.grp !== null && (<>
   {writable && tagSelection.selected.size > 0 ? (
    selectionBar(
     tagSelection,
     moveTo !== null ? (
      <form className="cfg-move" onSubmit={(e) => { e.preventDefault(); applyMove(); }}>
       <input autoFocus list="tag-group-list" value={moveTo} maxLength={60} placeholder="Klasör adı (boş = klasörden çıkar)" aria-label="Hedef klasör" onChange={(e) => setMoveTo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setMoveTo(null); }} />
       <datalist id="tag-group-list">{selGroups.map((g) => <option key={g} value={g} />)}</datalist>
       <button type="submit" className="btn small primary">Taşı</button>
       <button type="button" className="btn small" onClick={() => setMoveTo(null)}>Vazgeç</button>
      </form>
     ) : (
     <>
      <button className="btn small" onClick={() => setMoveTo(tagNav.grp || '')}><FolderInput size={13} />Klasöre taşı</button>
      <button className="btn small" onClick={() => void run(async () => { const ids = tagSelection.selected; await saveConfig({ ...config, tags: config.tags.map((t) => (ids.has(t.id) ? { ...t, history: true } : t)) }); })}><Clock3 size={13} />Geçmişi aç</button>
      <button className="btn small" onClick={() => void run(async () => { const ids = tagSelection.selected; await saveConfig({ ...config, tags: config.tags.map((t) => (ids.has(t.id) ? { ...t, history: false } : t)) }); })}>Geçmişi kapat</button>
      <button className="btn small ghost-danger" onClick={() => askDeleteTags([...tagSelection.selected])}><Trash2 size={13} />Sil</button>
     </>
     ),
    )
   ) : (
    <div className="filter-summary cfg-toolbar" aria-live="polite">
     <span>{tagFilterCount ? visibleTags.length + ' / ' + scope.length + ' gösteriliyor' : scope.length + ' etiket'}</span>
     {problems > 0 && <button className="cfg-problems" onClick={() => setTagFilter({ ...tagFilter, states: ['bad', 'stale'] })} title="Yalnız hatalı ve bayat etiketleri göster"><i />{[all.bad && all.bad + ' hata', all.stale && all.stale + ' bayat'].filter(Boolean).join(' · ')}</button>}
     {tagFilterCount > 0 && <button onClick={() => setTagFilter(emptyTagFilter())}>Filtreleri temizle</button>}
    </div>
   )}
   <div className="table-wrap column-filter-table">
    <table className="cfg-table cfg-compact tag-table">
     <thead>
      <tr>
       {writable && <th className="select-cell"><input type="checkbox" aria-label="Tümünü seç" checked={tagSelection.allSelected} ref={(el) => { if (el) el.indeterminate = tagSelection.someSelected; }} onChange={tagSelection.toggleAll} /></th>}
       <th><ColumnFilter {...tagCol} id="tag-q" label="Etiket" title="Etiket ara" query={tagFilter.q} onQuery={(q) => setTagFilter({ ...tagFilter, q })} placeholder="Kod, ad, bölüm, adres veya açıklama" onClear={() => setTagFilter({ ...tagFilter, q: '' })} /></th>
       <th>{navDev ? 'Adres' : <ColumnFilter {...tagCol} id="tag-dev" label="Cihaz · adres" options={config.devices.map((d) => ({ value: d.id, label: d.code, count: devFacet[d.id] || 0 }))} selected={tagFilter.devices} onToggle={(v) => setTagFilter({ ...tagFilter, devices: toggleList(tagFilter.devices, v) })} onClear={() => setTagFilter({ ...tagFilter, devices: [] })} />}</th>
       <th><ColumnFilter {...tagCol} id="tag-type" label="Tip" options={['bool', 'uint16', 'int16', 'uint32', 'int32', 'float32'].map((k) => ({ value: k, label: k, count: typeFacet[k] || 0 }))} selected={tagFilter.types} onToggle={(v) => setTagFilter({ ...tagFilter, types: toggleList(tagFilter.types, v) })} onClear={() => setTagFilter({ ...tagFilter, types: [] })} /></th>
       <th><ColumnFilter {...tagCol} id="tag-acc" label="Erişim" options={[{ value: 'read', label: 'Salt okuma', count: accFacet.read || 0 }, { value: 'readwrite', label: 'Oku / yaz', count: accFacet.readwrite || 0 }]} selected={tagFilter.access} onToggle={(v) => setTagFilter({ ...tagFilter, access: toggleList(tagFilter.access, v) })} onClear={() => setTagFilter({ ...tagFilter, access: [] })} /></th>
       <th className="tag-v"><ColumnFilter {...tagCol} id="tag-state" label="Canlı değer" options={(['good', 'stale', 'bad', 'never'] as const).map((k) => ({ value: k, label: tagStateLabels[k], count: stateFacet[k] || 0 }))} selected={tagFilter.states} onToggle={(v) => setTagFilter({ ...tagFilter, states: toggleList(tagFilter.states, v) })} onClear={() => setTagFilter({ ...tagFilter, states: [] })} /></th>
       <th className="cfg-flag-col" title="Geçmiş kaydı"><Clock3 size={13} aria-label="Geçmiş kaydı" /></th>
       <th />
      </tr>
     </thead>
     <tbody>
      {tagPage.rows.map((t) => {
       const sym = symbolicDevice(t.deviceId), st = sampleText(t, live.samples[t.id]), open = modal?.kind === 'tag' && modal.data.id === t.id;
       const d = config.devices.find((x) => x.id === t.deviceId);
       const sub = t.name && t.name !== t.code ? t.name : '';
       return (
        <Fragment key={t.id}>
         <tr className={'cfg-row' + (tagSelection.selected.has(t.id) ? ' selected' : '') + (open ? ' open' : '') + (writable ? ' clickable' : '')} tabIndex={writable ? 0 : undefined} onKeyDown={(e) => { if (writable && e.key === 'Enter' && e.target === e.currentTarget) openEdit('tag', t); }} onClick={(e) => { if (!writable || (e.target as HTMLElement).closest('button,input,a,label')) return; openEdit('tag', t); }}>
          {writable && <td className="select-cell"><input type="checkbox" aria-label={t.code + ' seç'} checked={tagSelection.selected.has(t.id)} onChange={() => tagSelection.toggleOne(t.id)} /></td>}
          <td><strong className="mono">{t.code}</strong>{sub && <small>{sub}</small>}</td>
          <td className={'mono' + (readOnlyFmt(t.deviceId) === 'sql' ? ' tag-addr-long' : '')} title={sym ? symbolicAddressOf(t, config.connections.find((c) => c.id === d?.connectionId)) : undefined}>{sym ? symbolicAddressOf(t, config.connections.find((c) => c.id === d?.connectionId)) : AREA_INFO[t.area].short + ' ' + t.address + (t.bit !== null && t.bit !== undefined ? '.' + t.bit : '')}<small>{sym ? addressFormatLabels[addressFormatOf(config, t.deviceId)] : AREA_INFO[t.area].label.replace(/ \(.*\)/, '') + ' · ' + modbusRef(t.area, t.address)}</small></td>
          <td className="mono">{t.dataType}{t.unit && <small>{t.unit}</small>}</td>
          <td><span className={'cfg-chip ' + (t.access === 'readwrite' ? 'rw' : '')}>{t.access === 'readwrite' ? 'Oku / yaz' : 'Salt okuma'}</span></td>
          <td className="tag-v"><span className={'live-val ' + st.state} title={tagQuality(t).tip}><i />{st.state === 'good' ? st.value : st.text}</span></td>
          <td className="cfg-flag-col">{t.history && <Clock3 size={13} aria-label="Geçmiş kaydı açık" />}</td>
          <td><div className="row-actions">
           {writable && <button title="Düzenle" aria-label={t.code + ' düzenle'} onClick={() => openEdit('tag', t)}><Pencil size={14} /></button>}
           {writable && <button title="Kopyala" aria-label={t.code + ' kopyala'} onClick={() => duplicateTag(t)}><Copy size={14} /></button>}
           <button title="Nerede kullanılıyor?" aria-label={t.code + ' kullanım'} onClick={() => setUsed(t.id)}><Link2 size={14} /></button>
           {writable && <button className="del" title="Sil" aria-label={t.code + ' sil'} onClick={() => askDeleteTags([t.id])}><Trash2 size={14} /></button>}
          </div></td>
         </tr>
        </Fragment>
       );
      })}
     </tbody>
    </table>
    {!config.tags.length && <div className="empty-state">Henüz etiket yok. "Etiket ekle" ya da "Toplu ekle" ile başlayın.</div>}
    {!scope.length && <div className="empty-state">{tagNav.grp ? '"' + tagNav.grp + '" klasörü boş. "Etiket ekle" ya da "Toplu ekle" bu klasöre ekler; başka klasördeki etiketleri seçip "Klasöre taşı" ile de getirebilirsiniz.' : 'Klasörde olmayan etiket kalmadı.'}</div>}
    {!!scope.length && !visibleTags.length && <div className="empty-state">Filtreyle eşleşen etiket yok.</div>}
    {tagPage.pager}
   </div>
   </>)}
  </div>
  );
 })();
// Sayfa: Komut tanımları — risk, onay ve koşul görünür; hedefler etiket çipi.
 const tagCodeChip = (id: string) => {
  const t = config.tags.find((x) => x.id === id);
  return <span key={id} className="cfg-chip mono" title={t?.name}>{t?.code || '?'}</span>;
 };
 const riskFacet: Record<string, number> = {};
 for (const c of config.commands) if (cmdVisible(c, true)) riskFacet[c.risk || 'normal'] = (riskFacet[c.risk || 'normal'] || 0) + 1;
 const visibleCommands = config.commands.filter((c) => cmdVisible(c));
 const cmdPage = usePaged(visibleCommands, JSON.stringify(cmdFilter) + JSON.stringify(cmdNav));
 const cmdFilterCount = (cmdFilter.q.trim() ? 1 : 0) + cmdFilter.risks.length;
 const commandsPage = page === 'commands' && (() => {
  const day = Date.now() - 86400000, recent = allExecs.filter((e) => e.createdAt >= day);
  const missing = writable ? missingCommands(config.tags, config.commands, (t) => (config.commands.some((c) => c.id === 'cmd-' + t.id) ? 'cmd-' + crypto.randomUUID() : 'cmd-' + t.id)) : [];
  const ago = (at: number) => { const s = Math.round((Date.now() - at) / 1000); return s < 60 ? s + ' sn önce' : s < 3600 ? Math.round(s / 60) + ' dk önce' : s < 86400 ? Math.round(s / 3600) + ' sa önce' : new Date(at).toLocaleDateString('tr-TR'); };
  const bad = recent.filter((e) => execTone(e.status) === 'bad').length, scripts = config.commands.filter((c) => c.kind === 'script').length;
  const running = allExecs.filter((e) => e.status === 'running'), unused = config.commands.filter((c) => !commandInUse(c.id)).length;
  const navDev = config.devices.find((d) => d.id === cmdNav.dev), draftKey = 'cmd:' + cmdNav.dev;
  const go = (n: CmdNavState) => { setCmdNav(n); commandSelection.clear(); setMoveTo(null); };
  const lastExec = (id: string) => allExecs.find((e) => e.commandId === id);
  const renameCmdGroup = (from: string, to: string) => void run(async () => {
   await saveConfig({ ...config, commands: config.commands.map((c) => (commandDevice(config, c) === cmdNav.dev && commandGroup(c) === from ? { ...c, group: to } : c)) });
   notify('"' + from + '" klasörü "' + to + '" olarak değiştirildi.');
  });
  const cmdGroups = [...new Set(config.commands.filter((c) => commandDevice(config, c) === cmdNav.dev).map(commandGroup).filter(Boolean))];
  const applyCmdMove = () => {
   const ids = commandSelection.selected, g = (moveTo || '').trim();
   void run(async () => { await saveConfig({ ...config, commands: config.commands.map((c) => (ids.has(c.id) ? { ...c, group: g } : c)) }); notify(ids.size + ' komut ' + (g ? '"' + g + '" klasörüne taşındı.' : 'klasörden çıkarıldı.')); });
   setMoveTo(null);
  };
  return (
  <div className="cfg-page">
   <div className="tag-top">
    <CmdCrumbs config={config} nav={cmdNav} setNav={go} />
    <CmdQuickFind config={config} onPick={(c) => { const d = commandDevice(config, c); go(d ? { dev: d, grp: commandGroup(c) } : { dev: '', grp: null }); if (writable) openEdit('command', c); }} />
    {missing.length > 0 && <span className="tag-top-tools"><button className="btn small" onClick={() => askConfirm(missing.length + ' komut oluşturulsun mu?', 'Komutu olmayan yazılabilir etiketler için "… kontrol" komutu eklenir (geri okuma aynı etiket, 7 sn, onay yok; klasörü etiketin klasörü): ' + missing.slice(0, 4).map((c) => c.name).join(', ') + (missing.length > 4 ? ', …' : '') + '.', () => void run(() => saveConfig({ ...config, commands: [...config.commands, ...missing] })))}><Wand2 size={13} />Eksik komutları oluştur ({missing.length})</button></span>}
   </div>
   {!navDev && <CmdDeviceList config={config} last={lastExec} setNav={go} />}
   {navDev && cmdNav.grp === null && (
    <CmdFolderTiles config={config} last={lastExec} nav={cmdNav} setNav={go} writable={writable} draft={draftGroups[draftKey] || []} setDraft={(g) => setDraftGroups({ ...draftGroups, [draftKey]: g })}
     onRename={renameCmdGroup} sort={cmdFolderSort} setSort={setCmdFolderSort} />
   )}
   {navDev && cmdNav.grp !== null && (<>
   {writable && commandSelection.selected.size > 0 ? (
    selectionBar(
     commandSelection,
     moveTo !== null ? (
      <form className="cfg-move" onSubmit={(e) => { e.preventDefault(); applyCmdMove(); }}>
       <input autoFocus list="cmd-group-list" value={moveTo} maxLength={60} placeholder="Klasör adı (boş = klasörden çıkar)" aria-label="Hedef klasör" onChange={(e) => setMoveTo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setMoveTo(null); }} />
       <datalist id="cmd-group-list">{cmdGroups.map((g) => <option key={g} value={g} />)}</datalist>
       <button type="submit" className="btn small primary">Taşı</button>
       <button type="button" className="btn small" onClick={() => setMoveTo(null)}>Vazgeç</button>
      </form>
     ) : <>
     <button className="btn small" onClick={() => setMoveTo(cmdNav.grp || '')}><FolderInput size={13} />Klasöre taşı</button>
     <button className="btn small ghost-danger" onClick={() => bulkRemoveConfigItems('command', config.commands.filter((c) => commandSelection.selected.has(c.id)).map((c) => ({ id: c.id, label: c.name })), (id) => commandInUse(id))}><Trash2 size={13} />Sil</button>
     </>,
    )
   ) : (
    <div className="filter-summary cfg-toolbar" aria-live="polite">
     <span>{visibleCommands.length + ' komut'}{scripts > 0 && ' · ' + scripts + ' script'} · son 24 sa {recent.length} gönderim</span>
     {running.length > 0 && <span className="cfg-running"><i />{running.length} script çalışıyor</span>}
     {bad > 0 && <span className="cfg-problems"><i />son 24 sa {bad} sorunlu</span>}
     {unused > 0 && <span className="muted small" title="Ekran nesnesine bağlı olmayan komutları operatör gönderemez">{unused} komut ekranda yok</span>}
     {cmdFilterCount > 0 && <button onClick={() => setCmdFilter({ q: '', risks: [] })}>Filtreleri temizle</button>}
    </div>
   )}
   <div className="table-wrap column-filter-table">
    <table className="cfg-table cfg-compact">
     <thead>
      <tr>
       {writable && <th className="select-cell"><input type="checkbox" aria-label="Tümünü seç" checked={commandSelection.allSelected} ref={(el) => { if (el) el.indeterminate = commandSelection.someSelected; }} onChange={commandSelection.toggleAll} /></th>}
       <th><ColumnFilter {...tagCol} id="cmd-q" label="Komut" title="Komut ara" query={cmdFilter.q} onQuery={(q) => setCmdFilter({ ...cmdFilter, q })} placeholder="Komut adı veya etiket kodu" onClear={() => setCmdFilter({ ...cmdFilter, q: '' })} /></th>
       <th><ColumnFilter {...tagCol} id="cmd-risk" label="Risk" options={Object.entries(commandRiskLabels).map(([k, l]) => ({ value: k, label: l, count: riskFacet[k] || 0 }))} selected={cmdFilter.risks} onToggle={(v) => setCmdFilter({ ...cmdFilter, risks: toggleList(cmdFilter.risks, v) })} onClear={() => setCmdFilter({ ...cmdFilter, risks: [] })} /></th>
       <th>Onay · koşul</th>
       <th>Son gönderim</th>
       <th>Kullanım</th>
       <th />
      </tr>
     </thead>
     <tbody>
      {cmdPage.rows.map((c) => {
       const last = allExecs.find((e) => e.commandId === c.id), n = commandScreens(c.id).length, open = modal?.kind === 'command' && modal.data.id === c.id;
       return (
        <tr key={c.id} className={'cfg-row' + (commandSelection.selected.has(c.id) ? ' selected' : '') + (open ? ' open' : '') + (writable ? ' clickable' : '')} onClick={(e) => { if (!writable || (e.target as HTMLElement).closest('button,input,a,label')) return; openEdit('command', c); }}>
         {writable && <td className="select-cell"><input type="checkbox" aria-label={c.name + ' seç'} checked={commandSelection.selected.has(c.id)} onChange={() => commandSelection.toggleOne(c.id)} /></td>}
         <td><strong>{c.name}{c.kind === 'script' && <span className="cfg-chip script">Script</span>}</strong><small className="mono">{commandSentence(c, config)}</small></td>
         <td><span className={'cfg-risk ' + (c.risk || 'normal')}>{commandRiskLabels[c.risk || 'normal']}</span></td>
         <td className="small">{approvalLabels[c.approval || 'none']}{(c.permissives || []).length > 0 && <small>{(c.permissives || []).length} izin koşulu</small>}</td>
         <td>{last ? <><span className={'exec-chip ' + execTone(last.status)}><i />{statusLabel(last.status)}{last.status === 'running' && (user.role === 'admin' || user.role === 'operator') && <button className="btn small danger cfg-stop" onClick={() => stopScript(last.id)}><Square size={11} />Durdur</button>}</span><small>{ago(last.createdAt)} · {last.user}</small></> : <span className="muted small">henüz gönderilmedi</span>}</td>
         <td className="small">{n ? n + ' ekran nesnesi' : <span className="muted">ekranda yok</span>}</td>
         <td><div className="row-actions">{writable && <><button title="Düzenle" aria-label={c.name + ' düzenle'} onClick={() => openEdit('command', c)}><Pencil size={14} /></button><button title="Sil" aria-label={c.name + ' sil'} onClick={() => void remove('command', c.id)}><Trash2 size={14} /></button></>}</div></td>
        </tr>
       );
      })}
     </tbody>
    </table>
    {!visibleCommands.length && <div className="empty-state">{cmdFilterCount ? 'Filtreyle eşleşen komut yok.' : cmdNav.grp ? '"' + cmdNav.grp + '" klasörü boş. "Komut ekle" bu klasöre ekler; başka klasördeki komutları seçip "Klasöre taşı" ile de getirebilirsiniz.' : 'Klasörde olmayan komut kalmadı.'}</div>}
    {cmdPage.pager}
   </div>
   </>)}
  </div>
  );
 })();
// Sayfa: Alarm yönetimi (performans, aktif alarmlar, kurallar, geçmiş)
 const tagCodeOf = (id: string) => config.tags.find((t) => t.id === id)?.code;
 const alarmFromRef = useRef<HTMLInputElement>(null), alarmToRef = useRef<HTMLInputElement>(null);
 const alarmSpan = rangeEvents?.from !== undefined && rangeEvents.to !== undefined ? { from: rangeEvents.from, to: rangeEvents.to } : alarmPreset === 'custom' ? alarmCustom : presetRange(alarmPreset);
 const alarmRangeBar = (
  <div className="report-toolbar alarm-range">
   <div className="report-presets" role="group" aria-label="Zaman aralığı">
    {RANGE_PRESETS.map((p) => <button key={p.id} className={alarmPreset === p.id ? 'active' : ''} aria-pressed={alarmPreset === p.id} onClick={() => setAlarmPreset(p.id)}>{p.label}</button>)}
    <div className="report-column-filter report-custom">
     <button className={alarmPreset === 'custom' ? 'active' : ''} aria-pressed={alarmPreset === 'custom'} aria-expanded={alarmFilterOpen === 'alarm-custom'} onClick={() => setAlarmFilterOpen(alarmFilterOpen === 'alarm-custom' ? null : 'alarm-custom')}><CalendarDays size={13} />Özel</button>
     {alarmFilterOpen === 'alarm-custom' && (
      <div className="report-filter-popover date" role="dialog" aria-label="Özel aralık" onKeyDown={(e) => { if (e.key === 'Escape') setAlarmFilterOpen(null); }}>
       <label><span>Başlangıç</span><input ref={alarmFromRef} autoFocus type="datetime-local" defaultValue={dateTimeValue(alarmSpan.from)} /></label>
       <label><span>Bitiş</span><input ref={alarmToRef} type="datetime-local" defaultValue={dateTimeValue(alarmSpan.to)} /></label>
       <div className="report-filter-footer"><span /><button className="btn small primary" onClick={() => {
        const from = new Date(alarmFromRef.current?.value || '').getTime(), to = new Date(alarmToRef.current?.value || '').getTime();
        if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) { notify('Bitiş başlangıçtan sonra olmalı.', 'error'); return; }
        setAlarmCustom({ from, to }); setAlarmPreset('custom'); setAlarmFilterOpen(null);
       }}>Uygula</button></div>
      </div>
     )}
    </div>
   </div>
   <div className="audit-toolbar-right">
    <span className="report-range mono">{rangeLabel(alarmSpan.from, alarmSpan.to)}</span>
    <button className="btn small" onClick={() => setAlarmRefresh((n) => n + 1)}><RotateCcw size={14} />Yenile</button>
   </div>
  </div>
 );
 const colFilter = { open: alarmFilterOpen, setOpen: setAlarmFilterOpen };
 /** Olay tabloları (Aktif, Geçmiş) için sütun başlığı filtreleri. Sayaçlar diğer filtreler uygulanmış kümeden. */
 function eventColumns(prefix: string, list: AlarmEvent[], f: EventFilter, setF: (f: EventFilter) => void, states: typeof alarmStateOrder) {
  const facets = eventFacets(list, f);
  return {
   severity: (
    <ColumnFilter
     {...colFilter}
     id={prefix + '-sev'}
     label="Önem"
     title="Öncelik"
     options={severityOrder.map((s) => ({ value: s, label: severityLabels[s], count: facets.severities[s], tone: s }))}
     selected={f.severities}
     onToggle={(v) => setF({ ...f, severities: toggle(f.severities, v as any) })}
     onClear={() => setF({ ...f, severities: [] })}
    />
   ),
   text: (
    <ColumnFilter
     {...colFilter}
     id={prefix + '-q'}
     label="Alarm"
     title="Alarm ara"
     query={f.q}
     onQuery={(q) => setF({ ...f, q })}
     placeholder="Ad, etiket kodu veya mesaj · * joker"
     onClear={() => setF({ ...f, q: '' })}
    />
   ),
   state: (label: string) => (
    <ColumnFilter
     {...colFilter}
     id={prefix + '-state'}
     label={label}
     title="Alarm durumu (ISA-18.2)"
     align="right"
     options={states.map((s) => ({ value: s, label: alarmStateLabels[s], count: facets.states[s] }))}
     selected={f.states}
     onToggle={(v) => setF({ ...f, states: toggle(f.states, v as any) })}
     onClear={() => setF({ ...f, states: [] })}
    />
   ),
  };
 }
 // Özet satırı hep yerinde durur (sabit yükseklik); filtre açılıp kapanınca tablo kaymaz.
 const filterSummary = <T,>(shown: number, total: number, count: number, clear: () => void, saved?: { scope: string; value: T; apply: (v: T) => void }) => (
  <div className="filter-summary" aria-live="polite">
   <span>{count > 0 ? shown + ' / ' + total + ' gösteriliyor' : total + ' kayıt'}</span>
   {count > 0 && <button onClick={clear}>Filtreleri temizle</button>}
   {saved && prefs && onPrefs && <SavedFilters scope={saved.scope} value={saved.value} onApply={saved.apply} saved={prefs.savedFilters} onChange={(next) => onPrefs({ ...prefs, savedFilters: next })} />}
  </div>
 );
 const shownActive = sortEvents(filterEvents(active, activeFilter), activeSort),
  shownRules = filterRules(rules, ruleFilter, tagCodeOf),
  historySource = rangeEvents?.events ?? history,
  shownHistory = filterEvents(historySource, historyFilter);
 const activePage = usePaged(shownActive, JSON.stringify(activeFilter) + activeSort),
  rulePage = usePaged(shownRules, JSON.stringify(ruleFilter)),
  historyPage = usePaged(shownHistory, JSON.stringify(historyFilter) + alarmPreset + alarmCustom.from + alarmCustom.to);
 const ruleFacetCounts = ruleFacets(rules, ruleFilter, tagCodeOf);
 // B51: kural sekmesi acikken gorunen (filtrelenmis) kural id'leri; sekme degisince sifirlanir.
 const ruleSelection = useSelection(
  shownRules.map((r) => r.id),
  'alarms:' + alarmTab,
 );
 const [bulkRuleReason, setBulkRuleReason] = useState('');
 const activeCols = eventColumns('active', active, activeFilter, setActiveFilter, ['activeUnacked', 'activeAcked', 'clearUnacked']),
  historyCols = eventColumns('history', historySource, historyFilter, setHistoryFilter, alarmStateOrder);
 const openAlarms = active.filter((a) => !a.clearedAt).length,
  unacked = active.filter((a) => !a.ackAt).length;
 const alarmTabs: { id: AlarmTab; label: string; count?: number; alert?: boolean }[] = [
  { id: 'active', label: 'Aktif', count: openAlarms, alert: unacked > 0 },
  { id: 'overview', label: 'Genel bakış' },
  { id: 'history', label: 'Geçmiş', count: rangeEvents?.events.length },
  { id: 'metrics', label: 'Performans', count: metrics?.total },
  { id: 'rules', label: 'Kurallar', count: rules.length },
  ...(writable && policy ? [{ id: 'policy' as const, label: 'Politika' }] : []),
 ];
 const currentAlarmTab = alarmTabs.some((t) => t.id === alarmTab) ? alarmTab : 'active';
 function switchAlarmTab(next: AlarmTab) {
  const ids = alarmTabs.map((t) => t.id);
  setAlarmTabDir(ids.indexOf(next) < ids.indexOf(currentAlarmTab) ? 'prev' : 'next');
  setAlarmTab(next);
 }
 function alarmTabKey(e: React.KeyboardEvent) {
  const ids = alarmTabs.map((t) => t.id),
   i = ids.indexOf(currentAlarmTab);
  const next =
   e.key === 'ArrowRight'
    ? ids[(i + 1) % ids.length]
    : e.key === 'ArrowLeft'
      ? ids[(i - 1 + ids.length) % ids.length]
      : e.key === 'Home'
        ? ids[0]
        : e.key === 'End'
          ? ids[ids.length - 1]
          : null;
  if (!next) return;
  e.preventDefault();
  switchAlarmTab(next);
  document.getElementById('alarm-tab-' + next)?.focus();
 }
 const alarmTabIndex = alarmTabs.findIndex((t) => t.id === currentAlarmTab);
 const alarmsPage = page === 'alarms' && (
  <>
   {live.alarmFlood?.active && (
    <div className="warning">
     Alarm seli: dakikada {live.alarmFlood.ratePerMinute} olay. Kritik olmayan açılır pencereler
     geçici olarak kapatıldı ({live.alarmFlood.suppressed} adet); olaylar listede ve kayıtta
     duruyor.
    </div>
   )}
   <div
    className="page-tabs alarm-tabs"
    role="tablist"
    aria-label="Alarm bölümü"
    onKeyDown={alarmTabKey}
    style={{ '--tab-i': alarmTabIndex, '--tab-n': alarmTabs.length } as React.CSSProperties}
   >
    <span className="page-tabs-indicator" aria-hidden="true" />
    {alarmTabs.map((t) => (
     <button
      key={t.id}
      id={'alarm-tab-' + t.id}
      role="tab"
      aria-selected={currentAlarmTab === t.id}
      aria-controls="alarm-panel"
      tabIndex={currentAlarmTab === t.id ? 0 : -1}
      onClick={() => switchAlarmTab(t.id)}
     >
      {t.label}
      {t.count !== undefined && <span className={'tab-count' + (t.alert ? ' alert' : '')}>{t.count}</span>}
     </button>
    ))}
   </div>
   <div
    key={currentAlarmTab}
    id="alarm-panel"
    role="tabpanel"
    aria-labelledby={'alarm-tab-' + currentAlarmTab}
    className={'tab-panel ' + alarmTabDir}
   >
    {currentAlarmTab === 'active' && (
     <>
      {canAck && unacked > 0 && (
       <div className="apply-panel tab-lead">
        <div>
         <strong>{unacked} alarm onay bekliyor</strong>
         <p>
          Onaylanan alarmlar açılır pencerede tekrar gösterilmez; normale dönmemiş alarmlar listede
          kalır.
         </p>
        </div>
        <button className="btn primary" disabled={busy} onClick={() => void run(() => ack())}>
         <Check size={16} />
         Tümünü onayla
        </button>
       </div>
      )}
      {(() => {
       const sh = shiftAt(Date.now());
       return <ShiftStrip name={sh.name} from={sh.from} to={sh.to} now={Date.now()} events={[...shiftEvents, ...active]} pending={unacked} />;
      })()}
      {filterSummary(shownActive.length, active.length, activeFilterCount(activeFilter), () => setActiveFilter(emptyEventFilter()), { scope: 'alarm.active', value: activeFilter, apply: setActiveFilter })}
      <div className="table-wrap column-filter-table">
       <table>
        <thead>
         <tr>
          <th>{activeCols.severity}</th>
          <th>{activeCols.text}</th>
          <th>Etiket / değer</th>
          <th>
           <ColumnFilter
            {...colFilter}
            id="active-sort"
            label="Başlangıç"
            title="Sıralama"
            single
            badge={activeSort === 'time' ? 'zaman' : ''}
            options={[
             { value: 'priority', label: 'Önce öncelik, sonra zaman (ISA-18.2)' },
             { value: 'time', label: 'Yalnız zaman · en yeni üstte' },
            ]}
            selected={[activeSort]}
            onToggle={(v) => setActiveSort(v as 'priority' | 'time')}
           />
          </th>
          <th>{activeCols.state('Durum')}</th>
          <th />
         </tr>
        </thead>
        <tbody>
         {(() => {
          const g = groupActive(activePage.rows),
           cleared = clearedInShift(filterEvents(shiftEvents, activeFilter), active, shiftAt(Date.now()).from),
           row = (a: AlarmEvent) => (
          <tr key={a.id} className={'alarm-row sev-' + a.severity + (a.clearedAt ? ' cleared' : '') + (a.ackAt ? '' : ' unack')}>
           <td>
            <span className="sev-cell">
             <SevMark severity={a.severity} />
             {severityLabels[a.severity]}
            </span>
           </td>
           <td>
            <strong>{a.name}</strong>
            <small>{a.message}</small>
           </td>
           <td className="mono">
            {a.tagCode}
            <small>
             {a.value === null ? '—' : String(a.value)}
             {['high', 'low'].includes(a.kind) ? ' / limit ' + a.limit : ''}
            </small>
           </td>
           <td className="mono">
            {new Date(a.raisedAt).toLocaleString('tr-TR')}
            <small>{alarmKindLabels[a.kind]}</small>
           </td>
           <td>
            <span className={'badge ' + (a.clearedAt ? 'green' : '')}>
             {a.clearedAt ? 'Normale döndü' : 'Devam ediyor'}
            </span>
            <small>{a.ackAt ? 'Onaylayan: ' + a.ackBy : 'Onay bekliyor'}</small>
           </td>
           <td>
            {canAck && !a.ackAt && (
             <button className="btn small" onClick={() => void run(() => ack([a.id]))}>
              <Check size={14} />
              Onayla
             </button>
            )}
           </td>
          </tr>
           ),
           band = (id: string, title: string, n: number) => (
            <tr key={id} className={'alarm-group ' + id}>
             <th colSpan={6}>
              {title} <small>{n}</small>
             </th>
            </tr>
           );
          return (
           <>
            {g.pending.length > 0 && band('pending', 'Onay bekliyor', g.pending.length)}
            {g.pending.map(row)}
            {g.acked.length > 0 && band('acked', 'Aktif · onaylandı', g.acked.length)}
            {g.acked.map(row)}
            {cleared.length > 0 && band('cleared', 'Temizlendi · bu vardiya', cleared.length)}
            {cleared.map(row)}
           </>
          );
         })()}
        </tbody>
       </table>
       {!active.length && <div className="empty-state">Aktif alarm yok.</div>}
       {!!active.length && !shownActive.length && (
        <div className="empty-state">Filtreyle eşleşen aktif alarm yok.</div>
       )}
       {activePage.pager}
      </div>
     </>
    )}
    {currentAlarmTab === 'rules' && (
     <>
      {writable && ruleSelection.selected.size > 0
       ? selectionBar(
          ruleSelection,
          <>
           <button
            className="btn small"
            disabled={busy}
            onClick={() => void bulkDeleteRules(rules.filter((r) => ruleSelection.selected.has(r.id)))}
           >
            Sil
           </button>
           <input
            aria-label="Toplu değişiklik gerekçesi"
            value={bulkRuleReason}
            placeholder="Gerekçe (zorunlu, en az 3 karakter)"
            onChange={(e) => setBulkRuleReason(e.target.value)}
           />
           <button
            className="btn small"
            disabled={busy || bulkRuleReason.trim().length < 3}
            onClick={() => void bulkSetRulesEnabled([...ruleSelection.selected], true, bulkRuleReason)}
           >
            Etkinleştir
           </button>
           <button
            className="btn small"
            disabled={busy || bulkRuleReason.trim().length < 3}
            onClick={() => void bulkSetRulesEnabled([...ruleSelection.selected], false, bulkRuleReason)}
           >
            Devre dışı bırak
           </button>
          </>,
         )
       : filterSummary(shownRules.length, rules.length, activeFilterCount(ruleFilter), () => setRuleFilter(emptyRuleFilter()), { scope: 'alarm.rules', value: ruleFilter, apply: setRuleFilter })}
      <div className="table-wrap column-filter-table">
       <table>
        <thead>
         <tr>
          {writable && (
           <th className="select-cell">
            <input
             type="checkbox"
             aria-label="Tümünü seç"
             checked={ruleSelection.allSelected}
             ref={(el) => {
              if (el) el.indeterminate = ruleSelection.someSelected;
             }}
             onChange={ruleSelection.toggleAll}
            />
           </th>
          )}
          <th>
           <ColumnFilter
            {...colFilter}
            id="rules-q"
            label="Kural"
            title="Kural ara ve durum"
            query={ruleFilter.q}
            onQuery={(q) => setRuleFilter({ ...ruleFilter, q })}
            placeholder="Kural, etiket kodu veya mesaj · * joker"
            options={(['enabled', 'disabled', 'shelved'] as const).map((s) => ({ value: s, label: ruleStateLabels[s], count: ruleFacetCounts.states[s] }))}
            selected={ruleFilter.states}
            onToggle={(v) => setRuleFilter({ ...ruleFilter, states: toggle(ruleFilter.states, v as any) })}
            onClear={() => setRuleFilter({ ...ruleFilter, q: '', states: [] })}
            badge={String(ruleFilter.states.length + (ruleFilter.q.trim() ? 1 : 0) || '')}
           />
          </th>
          <th>Etiket</th>
          <th>
           <ColumnFilter
            {...colFilter}
            id="rules-kind"
            label="Koşul"
            title="Alarm türü"
            options={(['high', 'low', 'bool', 'stale'] as const).map((k) => ({ value: k, label: alarmKindLabels[k], count: ruleFacetCounts.kinds[k] }))}
            selected={ruleFilter.kinds}
            onToggle={(v) => setRuleFilter({ ...ruleFilter, kinds: toggle(ruleFilter.kinds, v as any) })}
            onClear={() => setRuleFilter({ ...ruleFilter, kinds: [] })}
           />
          </th>
          <th>Gecikme / ölü bant</th>
          <th>
           <ColumnFilter
            {...colFilter}
            id="rules-sev"
            label="Önem"
            title="Öncelik"
            align="right"
            options={severityOrder.map((s) => ({ value: s, label: severityLabels[s], count: ruleFacetCounts.severities[s], tone: s }))}
            selected={ruleFilter.severities}
            onToggle={(v) => setRuleFilter({ ...ruleFilter, severities: toggle(ruleFilter.severities, v as any) })}
            onClear={() => setRuleFilter({ ...ruleFilter, severities: [] })}
           />
          </th>
          <th>
           <span className="muted small">v{config.revision}</span>
          </th>
         </tr>
        </thead>
        <tbody>
         {rulePage.rows.map((r) => {
          const t = config.tags.find((x) => x.id === r.tagId);
          const q = t ? tagQuality(t) : null;
          return (
           <tr key={r.id}>
            {writable && (
             <td className="select-cell">
              <input
               type="checkbox"
               aria-label={r.name + ' seç'}
               checked={ruleSelection.selected.has(r.id)}
               onChange={() => ruleSelection.toggleOne(r.id)}
              />
             </td>
            )}
            <td>
             <strong>{r.name}</strong>
             <small>
              {r.enabled ? (r.popup ? 'Açılır pencere açık' : 'Yalnızca listede') : 'Devre dışı'}
             </small>
            </td>
            <td>
             {t?.code || r.tagId}
             <small title={q?.tip}>{q ? q.label : 'Etiket bulunamadı'}</small>
            </td>
            <td>
             {alarmKindLabels[r.kind as AlarmRule['kind']]}
             <small>
              {r.kind === 'bool'
               ? r.expected
                 ? 'Sinyal 1 olduğunda'
                 : 'Sinyal 0 olduğunda'
               : r.kind === 'stale'
                 ? 'Veri güncellenmediğinde'
                 : (r.kind === 'high' ? '> ' : '< ') + r.limit + (t?.unit ? ' ' + t.unit : '')}
             </small>
            </td>
            <td className="mono">
             {r.delayMs} ms<small>±{r.deadband}</small>
            </td>
            <td>
             <span className={'badge alarm-' + r.severity}>
              {severityLabels[r.severity as AlarmRule['severity']]}
             </span>
            </td>
            <td>
             {writable && (
              <div className="row-actions">
               <button
                title="Düzenle"
                aria-label="Kuralı düzenle"
                onClick={() => setModal({ kind: 'alarm', data: structuredClone(r), fresh: false })}
               >
                <Pencil size={15} />
               </button>
               <button title="Sil" aria-label="Kuralı sil" onClick={() => void remove('alarm', r.id)}>
                <Trash2 size={15} />
               </button>
              </div>
             )}
            </td>
           </tr>
          );
         })}
        </tbody>
       </table>
       {!rules.length && (
        <div className="empty-state">
         Henüz alarm kuralı yok. Bir etiket için üst/alt limit veya dijital durum tanımlayın.
        </div>
       )}
       {!!rules.length && !shownRules.length && (
        <div className="empty-state">Filtreyle eşleşen kural yok.</div>
       )}
       {rulePage.pager}
      </div>
     </>
    )}
    {currentAlarmTab === 'overview' && (() => {
     const ev = rangeEvents?.events || [];
     const sev: Record<string, number> = {};
     for (const a of ev) sev[a.severity] = (sev[a.severity] || 0) + 1;
     const acked = ev.filter((a) => a.ackAt);
     const avgAck = acked.length ? acked.reduce((n, a) => n + ((a.ackAt as number) - a.raisedAt), 0) / acked.length : null;
     const chatter = (metrics?.rows || []).filter((r: any) => r.chattering).length;
     const span = Math.max(1, alarmSpan.to - alarmSpan.from);
     const card = (label: string, value: React.ReactNode, sub?: React.ReactNode, warn?: boolean) => (
      <div className={warn ? 'warn' : ''}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>
     );
     return (
      <div className="report-panel">
       {alarmRangeBar}
       <div className="report-kpis">
        {card('Alarm olayı', ev.length, (sev.critical || 0) + ' kritik · ' + (sev.warning || 0) + ' uyarı')}
        {card('Şu an açık', openAlarms, unacked + ' onay bekliyor', unacked > 0)}
        {card('Ortalama onay süresi', avgAck === null ? '—' : durationText(avgAck), acked.length + ' / ' + ev.length + ' onaylandı')}
        {card('Sık tekrar eden', chatter, chatter ? 'rasyonalizasyon gerekiyor' : 'chattering yok', chatter > 0)}
       </div>
       {rangeEvents?.truncated && <div className="report-note"><Database size={14} />Bu aralıkta 2000 olaydan fazlası var; grafik en yeni 2000 olaydan çizildi.</div>}
       <section className="report-card">
        <header><h3>Alarm yoğunluğu</h3><span className="muted">{({ [30 * 60000]: '30 dakikalık', [3600000]: 'saatlik', [6 * 3600000]: '6 saatlik', [86400000]: 'günlük' } as Record<number, string>)[bucketSize(span)]} oluşan alarm</span></header>
        <Columns unit="alarm" buckets={countBuckets(ev.map((a) => a.raisedAt), alarmSpan.from, alarmSpan.to, bucketSize(span))} />
       </section>
       <div className="report-split">
        <section className="report-card">
         <header><h3>En sık alarmlar</h3>{(metrics?.rows?.length || 0) > 8 && <button className="link-btn" onClick={() => switchAlarmTab('metrics')}>Tümü</button>}</header>
         <BarList items={(metrics?.rows || []).slice().sort((a: any, b: any) => b.count - a.count).slice(0, 8).map((r: any) => ({ label: r.name, value: r.count, sub: r.chattering ? 'sık tekrar' : undefined }))} empty="Bu aralıkta alarm olayı yok." />
        </section>
        <section className="report-card">
         <header><h3>Önem derecesi</h3></header>
         <BarList items={(['critical', 'warning', 'info'] as const).filter((k) => sev[k]).map((k) => ({ label: severityLabels[k], value: sev[k], tone: k === 'critical' ? ('danger' as const) : undefined }))} empty="Bu aralıkta alarm olayı yok." />
        </section>
       </div>
      </div>
     );
    })()}
    {currentAlarmTab === 'history' && (
     <>
     {alarmRangeBar}
     {filterSummary(shownHistory.length, historySource.length, activeFilterCount(historyFilter), () => setHistoryFilter(emptyEventFilter()), { scope: 'alarm.history', value: historyFilter, apply: setHistoryFilter })}
     {rangeEvents?.truncated && (
      <div className="warning">
       Bu aralıkta 2000 olaydan fazlası var; yalnız en yeni 2000 olay gösteriliyor. Aralığı daraltın.
      </div>
     )}
     <div className="table-wrap column-filter-table">
      <table>
       <thead>
        <tr>
         <th>{historyCols.severity}</th>
         <th>Zaman</th>
         <th>{historyCols.text}</th>
         <th>Değer</th>
         <th>Süre</th>
         <th>{historyCols.state('Onay')}</th>
        </tr>
       </thead>
       <tbody>
        {historyPage.rows.map((a) => (
         <tr key={a.id}>
          <td>
           <span className={'badge alarm-' + a.severity}>{severityLabels[a.severity]}</span>
          </td>
          <td className="mono">{new Date(a.raisedAt).toLocaleString('tr-TR')}</td>
          <td>
           {a.name}
           <small>{a.message}</small>
          </td>
          <td className="mono">{a.value === null ? '—' : String(a.value)}</td>
          <td>
           {a.clearedAt ? durationText(a.clearedAt - a.raisedAt) : 'Devam ediyor'}
          </td>
          <td>{a.ackAt ? a.ackBy : '—'}</td>
         </tr>
        ))}
       </tbody>
      </table>
      {!historySource.length && <div className="empty-state">Bu aralıkta alarm kaydı yok.</div>}
      {!!historySource.length && !shownHistory.length && (
       <div className="empty-state">Filtreyle eşleşen kayıt yok.</div>
      )}
      {historyPage.pager}
     </div>
     </>
    )}
    {currentAlarmTab === 'metrics' && (
     <div className="metrics-panel report-panel">
      {alarmRangeBar}
      <div className="filter-summary"><span>En sık 15 alarm · {metrics ? metrics.total + ' olay' : '—'}</span></div>
      <div className="table-wrap">
       <table>
        <thead>
         <tr>
          <th>Alarm</th>
          <th>Adet</th>
          <th>Açık</th>
          <th>En uzun süre</th>
          <th>Ortalama ACK</th>
         </tr>
        </thead>
        <tbody>
         {(metrics?.rows || [])
          .slice()
          .sort((a, b) => b.count - a.count)
          .slice(0, 15)
          .map((r) => (
           <tr key={r.ruleId}>
            <td>
             <strong>{r.name}</strong>
             {r.chattering && <small>Sık tekrar (chattering) — rasyonalizasyon gerekiyor</small>}
            </td>
            <td><span className="share-cell"><span className="share-track"><span style={{ width: (r.count / Math.max(1, ...(metrics?.rows || []).map((x: any) => x.count))) * 100 + '%' }} /></span><span className="mono">{r.count}</span></span></td>
            <td className="mono">{r.open}</td>
            <td className="mono">{durationText(r.longestMs || 0)}</td>
            <td className="mono">{r.averageAckMs === null ? '—' : durationText(r.averageAckMs)}</td>
           </tr>
          ))}
        </tbody>
       </table>
       {!metrics?.rows?.length && <div className="empty-state">Bu aralıkta alarm olayı yok.</div>}
      </div>
     </div>
    )}
    {currentAlarmTab === 'policy' && policy && (
     <section className="settings-section alarm-policy">
      <div className="settings-head">
       <h2>Alarm politikası</h2>
       <InfoTip>
        Sel eşiği aşılınca kritik olmayan açılır pencereler geçici olarak kapanır; olaylar listede ve
        kayıtta kalır. Rafa kaldırma sınırı yalnız operatöre uygulanır, yönetici ve tasarımcı için
        24 saattir.
       </InfoTip>
      </div>
      <div className="field-grid">
       <Field label="Sel eşiği (olay/dk)">
        <input
         type="number"
         min="3"
         max="500"
         value={policy.floodPerMinute}
         onChange={(e) => setPolicy({ ...policy, floodPerMinute: Number(e.target.value) || 20 })}
        />
       </Field>
       <Field label="Operatör rafa kaldırma üst sınırı (dk)">
        <input
         type="number"
         min="1"
         max="1440"
         value={policy.operatorShelveMaxMinutes}
         onChange={(e) =>
          setPolicy({
           ...policy,
           operatorShelveMaxMinutes: Math.min(1440, Math.max(1, Number(e.target.value) || 1440)),
          })
         }
        />
       </Field>
      </div>
      <label className="check">
       <input
        type="checkbox"
        checked={policy.suppressPopupsInFlood}
        onChange={(e) => setPolicy({ ...policy, suppressPopupsInFlood: e.target.checked })}
       />
       Selde kritik olmayan açılır pencereleri kapat
      </label>
      <div className="toolbar-group">
       <button className="btn primary" onClick={() => void savePolicy(policy)}>
        Politikayı kaydet
       </button>
      </div>
     </section>
    )}
   </div>
  </>
 );
 // Sayfa: Reçeteler
 const recipesPage = page === 'recipes' && (
  <>
   <div className="list-toolbar">
    <span className="muted">
     Reçete, sıralı komut listesidir. Her adım ayrı doğrulanır; yarım kalan uygulama otomatik geri
     alınmaz.
    </span>
    {writable && (
     <button
      className="btn"
      onClick={() =>
       void saveRecipes([
        ...recipes,
        {
         id: crypto.randomUUID(),
         name: 'Yeni reçete',
         version: 1,
         description: '',
         steps: [
          {
           commandId: config.commands[0]?.id || '',
           value: true,
           label: '',
           unit: '',
           min: null,
           max: null,
          },
         ],
         updatedBy: '',
         updatedAt: 0,
        },
       ])
      }
     >
      <Plus size={16} />
      Reçete ekle
     </button>
    )}
   </div>
   <div className="table-wrap">
    <table>
     <thead>
      <tr>
       <th>Reçete</th>
       <th>Sürüm</th>
       <th>Adım</th>
       <th>Son değiştiren</th>
       <th />
      </tr>
     </thead>
     <tbody>
      {recipes.map((r, ri) => (
       <tr key={r.id}>
        <td>
         <strong>
          {writable ? (
           <input
            value={r.name}
            onChange={(e) =>
             setRecipes(recipes.map((x, i) => (i === ri ? { ...x, name: e.target.value } : x)))
            }
            onBlur={() => void run(() => saveRecipes(recipes))}
           />
          ) : (
           r.name
          )}
         </strong>
         <small>{r.description}</small>
        </td>
        <td className="mono">v{r.version}</td>
        <td>
         {r.steps.map((st: any, si: number) => (
          <div className="recipe-step" key={si}>
           <select
            disabled={!writable}
            value={st.commandId}
            onChange={(e) =>
             setRecipes(
              recipes.map((x, i) =>
               i === ri
                ? {
                   ...x,
                   steps: x.steps.map((y: any, j: number) =>
                    j === si ? { ...y, commandId: e.target.value } : y,
                   ),
                  }
                : x,
              ),
             )
            }
            onBlur={() => void run(() => saveRecipes(recipes))}
           >
            {config.commands.map((c) => (
             <option key={c.id} value={c.id}>
              {c.name}
             </option>
            ))}
           </select>
           <input
            disabled={!writable}
            value={String(st.value)}
            onChange={(e) => {
             const v = e.target.value;
             const parsed = v === 'true' ? true : v === 'false' ? false : Number(v);
             setRecipes(
              recipes.map((x, i) =>
               i === ri
                ? {
                   ...x,
                   steps: x.steps.map((y: any, j: number) =>
                    j === si ? { ...y, value: Number.isNaN(parsed) ? y.value : parsed } : y,
                   ),
                  }
                : x,
              ),
             );
            }}
            onBlur={() => void run(() => saveRecipes(recipes))}
           />
           {writable && (
            <button
             className="tool"
             aria-label="Adımı sil"
             onClick={() =>
              void run(() =>
               saveRecipes(
                recipes.map((x, i) =>
                 i === ri ? { ...x, steps: x.steps.filter((_: any, j: number) => j !== si) } : x,
                ),
               ),
              )
             }
            >
             <Trash2 size={12} />
            </button>
           )}
          </div>
         ))}
         {writable && (
          <button
           className="btn small"
           onClick={() =>
            void run(() =>
             saveRecipes(
              recipes.map((x, i) =>
               i === ri
                ? {
                   ...x,
                   steps: [
                    ...x.steps,
                    {
                     commandId: config.commands[0]?.id || '',
                     value: true,
                     label: '',
                     unit: '',
                     min: null,
                     max: null,
                    },
                   ],
                  }
                : x,
              ),
             ),
            )
           }
          >
           <Plus size={13} />
           Adım
          </button>
         )}
        </td>
        <td>
         <small>
          {r.updatedBy || '—'}
          {r.updatedAt ? ' · ' + new Date(r.updatedAt).toLocaleString('tr-TR') : ''}
         </small>
        </td>
        <td className="row-actions">
         <button className="btn small" onClick={() => void openRecipePreview(r.id)}>
          Önizle
         </button>
         {writable && (
          <button
           className="tool"
           aria-label="Reçeteyi sil"
           onClick={() =>
            askConfirm(
             'Reçete silinsin mi?',
             'Uygulanmış komutlar etkilenmez.',
             () => void run(() => saveRecipes(recipes.filter((x) => x.id !== r.id))),
             true,
            )
           }
          >
           <Trash2 size={14} />
          </button>
         )}
        </td>
       </tr>
      ))}
     </tbody>
    </table>
    {!recipes.length && <div className="empty-state">Kayıtlı reçete yok.</div>}
   </div>
   {recipePreviewState && (
    <div className="modal-backdrop" onClick={() => setRecipePreview(null)}>
     <div className="modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-heading">
       <h2>
        {recipePreviewState.recipe.name} · v{recipePreviewState.recipe.version}
       </h2>
       <button className="tool" onClick={() => setRecipePreview(null)}>
        ×
       </button>
      </div>
      <p className="small muted">
       Uygulamadan önce mevcut ve yeni değerler. Veri kalitesi kötü olan adımda mevcut değer
       gösterilmez.
      </p>
      <div className="info-rows">
       {recipePreviewState.steps.map((st: any) => (
        <div className="info-row" key={st.index}>
         <span>
          {st.index + 1}. {st.name}
          {st.label ? ' · ' + st.label : ''}
         </span>
         <strong>
          {st.current === null ? '—' : String(st.current)} → {String(st.newValue)}
          {st.unit ? ' ' + st.unit : ''}
         </strong>
        </div>
       ))}
      </div>
      <div className="modal-actions">
       <button className="btn" onClick={() => setRecipePreview(null)}>
        Vazgeç
       </button>
       {canAck && (
        <button
         className="btn primary"
         disabled={busy}
         onClick={() =>
          askConfirm(
           'Reçete uygulansın mı?',
           'Adımlar sırayla gönderilir. Yarım kalırsa otomatik geri alınmaz.',
           () => void applyRecipe(recipePreviewState.recipe.id),
           true,
          )
         }
        >
         Uygula
        </button>
       )}
      </div>
     </div>
    </div>
   )}
  </>
 );
 const activityRows=(report?.activities||[]) as ActivityRow[];
 const activityIntervals=activityRows.flatMap(row=>row.intervals.map((interval,index)=>({row,interval,index})));
 const filteredActivityIntervals=activityIntervals.filter(({interval})=>{
  const entryAfter=reportEntryAfter?new Date(reportEntryAfter).getTime():null;
  const exitBefore=reportExitBefore?new Date(reportExitBefore).getTime():null;
  return (entryAfter===null||interval.start>=entryAfter)&&(exitBefore===null||interval.end<=exitBefore);
 });
 const eventPage=usePaged(filteredActivityIntervals,reportEntryAfter+'|'+reportExitBefore+'|'+(report?.from??'')+'|'+(report?.to??''));
 const signalPopover=(slot:ReportFilterSlot)=>reportFilterOpen===slot&&<div className="report-filter-popover signal" role="dialog" aria-label="Rapor sinyalleri" onKeyDown={e=>{if(e.key==='Escape')setReportFilterOpen(null)}}>
   <div className="report-filter-popover-head"><strong>Sinyal seçimi</strong><button onClick={()=>setReportTagIds([])}>Temizle</button></div>
   <label className="report-filter-search"><Search size={14}/><input autoFocus aria-label="Rapor sinyali ara" placeholder="Kod, ad veya cihaz ara" value={reportSignalSearch} onChange={e=>setReportSignalSearch(e.target.value)}/></label>
   <div className="report-filter-options">{visibleReportTags.map(t=><label key={t.id} className={reportTagIds.includes(t.id)?'selected':''}><input type="checkbox" checked={reportTagIds.includes(t.id)} onChange={()=>setReportTagIds(ids=>ids.includes(t.id)?ids.filter(id=>id!==t.id):[...ids,t.id])}/><span><strong>{t.code}</strong>{t.name}</span><small>{config.devices.find(d=>d.id===t.deviceId)?.code||'—'} · {t.history?'geçmiş açık':'geçmiş kapalı'}</small></label>)}</div>
   {!digitalTags.length&&<div className="report-filter-empty">Dijital sinyal bulunamadı.</div>}
   {!!digitalTags.length&&!visibleReportTags.length&&<div className="report-filter-empty">Eşleşen sinyal yok.</div>}
   <div className="report-filter-footer"><span>{reportTagIds.length} sinyal seçili</span><button className="btn small primary" disabled={busy} onClick={()=>void run(async()=>{await refreshReport(reportTagIds);setReportFilterOpen(null)})}>Raporu uygula</button></div>
  </div>;
 const signalColumnFilter=(slot:'summary-signal'|'event-signal')=><div className="report-column-filter">
  <span>Sinyal</span>
  <button className={'report-filter-trigger'+(reportTagIds.length?' active':'')} aria-label="Sinyal filtresini aç" aria-expanded={reportFilterOpen===slot} onClick={()=>setReportFilterOpen(reportFilterOpen===slot?null:slot)}><ListFilter size={13}/><b>{reportTagIds.length||'—'}</b></button>
  {signalPopover(slot)}
 </div>;
 const dateColumnFilter=(slot:'entry'|'exit',label:string,value:string,setValue:(value:string)=>void)=><div className="report-column-filter">
  <span>{label}</span>
  <button className={'report-filter-trigger'+(value?' active':'')} aria-label={label+' filtresini aç'} aria-expanded={reportFilterOpen===slot} onClick={()=>setReportFilterOpen(reportFilterOpen===slot?null:slot)}><CalendarDays size={13}/></button>
  {reportFilterOpen===slot&&<div className="report-filter-popover date" role="dialog" aria-label={label+' filtresi'} onKeyDown={e=>{if(e.key==='Escape')setReportFilterOpen(null)}}>
   <label><span>{slot==='entry'?'Bu tarihten sonra':'Bu tarihten önce'}</span><input autoFocus type="datetime-local" value={value} onChange={e=>setValue(e.target.value)}/></label>
   <div className="report-filter-footer"><button onClick={()=>setValue('')}>Temizle</button><button className="btn small primary" onClick={()=>setReportFilterOpen(null)}>Uygula</button></div>
  </div>}
 </div>;
 const reportSpan=report?Math.max(1,report.to-report.from):1;
 const totalActivations=activityRows.reduce((n,r)=>n+r.activations,0);
 const anyUncertain=activityRows.some(r=>r.uncertain);
 const failedStatuses=['failed','rejected','unverified','partial','uncertain','aborted'];
 const bucketText=({[30*60000]:'30 dakikalık',[3600000]:'saatlik',[6*3600000]:'6 saatlik',[86400000]:'günlük'} as Record<number,string>)[bucketSize(reportSpan)];
 const reportTabs:{id:ReportTab;label:string;count?:number;alert?:boolean}[]=[
  {id:'overview',label:'Genel bakış'},
  {id:'signals',label:'Sinyaller',count:activityRows.length},
  {id:'alarms',label:'Alarmlar',count:report?.alarms.total,alert:!!report?.alarms.unacked},
  {id:'commands',label:'Komutlar',count:report?.commands.total},
  {id:'notes',label:'Notlar',count:report?.notes.length},
 ];
 const reportTabIndex=Math.max(0,reportTabs.findIndex(t=>t.id===reportTab));
 function switchReportTab(id:ReportTab){
  setReportTabDir(reportTabs.findIndex(t=>t.id===id)<reportTabIndex?'prev':'next');
  setReportTab(id);
  setReportFilterOpen(null);
 }
 function reportTabKey(e:React.KeyboardEvent){
  const i=reportTabIndex,n=reportTabs.length;
  const next=e.key==='ArrowRight'?(i+1)%n:e.key==='ArrowLeft'?(i-1+n)%n:e.key==='Home'?0:e.key==='End'?n-1:-1;
  if(next<0)return;
  e.preventDefault();
  switchReportTab(reportTabs[next].id);
  document.getElementById('report-tab-'+reportTabs[next].id)?.focus();
 }
 const kpi=(label:string,value:React.ReactNode,sub?:React.ReactNode,tone?:'warn')=><div className={tone||''}><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>;
 const noSignals=!reportTagIds.length;
 // Sayfa: Vardiya raporları — başlık + aralık çubuğu + sekmeler; her sekme tek bir soruya cevap verir.
 const reportsPage = page === 'reports' && (
  <div className="shift-report">
   <div className="report-head">
    <div className="report-title">
     <span className="report-eyebrow">İzleme · Vardiya raporu</span>
     {reportNameEdit
      ? <input className="report-name-input" autoFocus aria-label="Rapor adı" value={reportProfile} onChange={e=>setReportProfile(e.target.value)} onBlur={()=>{if(!reportProfile.trim())setReportProfile('Üretim sinyalleri');setReportNameEdit(false)}} onKeyDown={e=>{if(e.key==='Enter'||e.key==='Escape')(e.target as HTMLInputElement).blur()}}/>
      : <h2>{reportProfile}<button className="report-name-edit" aria-label="Rapor adını değiştir" title="Adı değiştir" onClick={()=>setReportNameEdit(true)}><Pencil size={14}/></button></h2>}
     <span className="report-range mono">{rangeLabel(report?.from??reportFrom,report?.to??reportTo)}</span>
    </div>
    <div className="report-head-actions">
     <button className="btn small" disabled={busy} onClick={()=>void run(()=>refreshReport())}><RotateCcw size={14}/>Yenile</button>
     <a className="btn small" href={'/api/reports?format=csv&from='+Math.round(report?.from??reportFrom)+'&to='+Math.round(report?.to??reportTo)+'&tagIds='+encodeURIComponent(reportTagIds.join(','))}><Download size={14}/>CSV</a>
    </div>
   </div>
   <div className="report-toolbar">
    <div className="report-presets" role="group" aria-label="Zaman aralığı">
     {RANGE_PRESETS.map(p=><button key={p.id} className={reportPreset===p.id?'active':''} aria-pressed={reportPreset===p.id} onClick={()=>pickPreset(p.id)}>{p.label}</button>)}
     <div className="report-column-filter report-custom">
      <button className={reportPreset==='custom'?'active':''} aria-pressed={reportPreset==='custom'} aria-expanded={reportFilterOpen==='custom'} onClick={()=>setReportFilterOpen(reportFilterOpen==='custom'?null:'custom')}><CalendarDays size={13}/>Özel</button>
      {reportFilterOpen==='custom'&&<div className="report-filter-popover date" role="dialog" aria-label="Özel aralık" onKeyDown={e=>{if(e.key==='Escape')setReportFilterOpen(null)}}>
       <label><span>Başlangıç</span><input autoFocus type="datetime-local" value={dateTimeValue(reportFrom)} onChange={e=>{const v=new Date(e.target.value).getTime();if(Number.isFinite(v))setReportFrom(v)}}/></label>
       <label><span>Bitiş</span><input type="datetime-local" value={dateTimeValue(reportTo)} onChange={e=>{const v=new Date(e.target.value).getTime();if(Number.isFinite(v))setReportTo(v)}}/></label>
       <div className="report-filter-footer"><span>{reportTo<=reportFrom?'Bitiş başlangıçtan sonra olmalı':''}</span><button className="btn small primary" disabled={busy||reportTo<=reportFrom} onClick={()=>{setReportPreset('custom');void run(async()=>{await loadReport(reportTo-reportFrom,reportTagIds,reportFrom,reportTo);setReportFilterOpen(null)})}}>Uygula</button></div>
      </div>}
     </div>
    </div>
    <div className="report-column-filter report-signal-pick">
     <button className={'btn small'+(noSignals?' primary':'')} aria-expanded={reportFilterOpen==='toolbar-signal'} onClick={()=>setReportFilterOpen(reportFilterOpen==='toolbar-signal'?null:'toolbar-signal')}><ListFilter size={14}/>Sinyaller<b className="tab-count">{reportTagIds.length}</b></button>
     {signalPopover('toolbar-signal')}
    </div>
   </div>
   <div className="page-tabs report-tabs" role="tablist" aria-label="Rapor bölümü" onKeyDown={reportTabKey} style={{'--tab-i':reportTabIndex,'--tab-n':reportTabs.length} as React.CSSProperties}>
    <span className="page-tabs-indicator" aria-hidden="true"/>
    {reportTabs.map(t=><button key={t.id} id={'report-tab-'+t.id} role="tab" aria-selected={reportTab===t.id} aria-controls="report-panel" tabIndex={reportTab===t.id?0:-1} onClick={()=>switchReportTab(t.id)}>
     {t.label}{t.count!==undefined&&<span className={'tab-count'+(t.alert?' alert':'')}>{t.count}</span>}
    </button>)}
   </div>
   {!report&&<div className="empty-state">Rapor yükleniyor…</div>}
   {report&&<div key={reportTab} id="report-panel" role="tabpanel" aria-labelledby={'report-tab-'+reportTab} className={'tab-panel report-panel '+reportTabDir}>
    {reportTab==='overview'&&<>
     <div className="report-kpis">
      {kpi('Devreye girme',totalActivations,noSignals?'sinyal seçilmedi':activityRows.length+' sinyal')}
      {kpi('Toplam açık kalma',durationText(activityRows.reduce((n,r)=>n+r.totalOnMs,0)),'en uzun çevrim '+durationText(Math.max(0,...activityRows.map(r=>r.longestOnMs))))}
      {kpi('Alarm',report.alarms.total,(report.alarms.bySeverity.critical||0)+' kritik · '+report.alarms.unacked+' onaysız')}
      {kpi('Komut',report.commands.total,report.commands.failed+' sorunlu')}
     </div>
     {anyUncertain&&<div className="report-note"><Database size={14}/>Bazı sinyallerde eksik veri var; çizelgede taralı gösterilir.</div>}
     <section className="report-card">
      <header><h3>Çalışma çizelgesi</h3><div className="chart-legend"><span><i className="lg-on"/>Açık</span>{anyUncertain&&<span><i className="lg-unc"/>Eksik veri</span>}<span className="muted">sağda: aralıkta açık kalma payı</span></div></header>
      {noSignals
       ?<div className="report-empty"><p>Çizelge için rapora sinyal ekleyin.</p><button className="btn small primary" onClick={()=>setReportFilterOpen('toolbar-signal')}><ListFilter size={14}/>Sinyal seç</button></div>
       :activityRows.length
        ?<Timeline from={report.from} to={report.to} duration={durationText} rows={activityRows.map(r=>{const tag=config.tags.find(t=>t.id===r.tagId);return {id:r.tagId,code:tag?.code||r.tagId,name:tag?.name||'Etiket bulunamadı',share:r.totalOnMs/reportSpan,intervals:r.intervals};})}/>
        :<div className="empty-state">Seçili aralıkta raporlanabilir sinyal geçmişi yok.</div>}
     </section>
     <div className="report-split">
      <section className="report-card">
       <header><h3>Devreye girme</h3><span className="muted">{bucketText} adet</span></header>
       <Columns unit="giriş" buckets={activationBuckets(activityRows.flatMap(r=>r.intervals),report.from,report.to)}/>
      </section>
      <section className="report-card">
       <header><h3>En sık alarmlar</h3>{report.alarms.top.length>5&&<button className="link-btn" onClick={()=>switchReportTab('alarms')}>Tümü</button>}</header>
       <BarList items={report.alarms.top.slice(0,5).map((r:any)=>({label:r.name,value:r.count}))} empty="Bu aralıkta alarm yok."/>
      </section>
     </div>
    </>}
    {reportTab==='signals'&&<>
     <section className="report-card flush">
      <header><h3>Sinyal özeti</h3></header>
      <div className="table-wrap report-summary-table">
       <table><thead><tr><th>{signalColumnFilter('summary-signal')}</th><th>Devreye girme</th><th>Toplam açık</th><th>Ortalama</th><th>En uzun</th><th>Aralık payı</th></tr></thead>
       <tbody>{activityRows.map(row=>{const tag=config.tags.find(t=>t.id===row.tagId);const share=row.totalOnMs/reportSpan;return <tr key={row.tagId}><td><strong>{tag?.code||row.tagId}</strong><small>{tag?.name||'Etiket bulunamadı'}</small></td><td className="mono">{row.activations}</td><td className="mono">{durationText(row.totalOnMs)}</td><td className="mono">{durationText(row.averageOnMs)}</td><td className="mono">{durationText(row.longestOnMs)}</td><td><span className="share-cell"><span className="share-track"><span style={{width:Math.min(100,share*100)+'%'}}/></span><span className="mono">%{Math.round(share*1000)/10}</span>{row.uncertain&&<span className="quality-flag">eksik veri</span>}</span></td></tr>})}</tbody></table>
       {!activityRows.length&&<div className="empty-state">{noSignals?'Sinyal seçilmedi.':'Seçili aralıkta raporlanabilir sinyal geçmişi yok.'}</div>}
      </div>
     </section>
     <section className="report-card flush">
      <header><h3>Çevrim dökümü</h3><span className="muted">{filteredActivityIntervals.length}{filteredActivityIntervals.length!==activityIntervals.length?' / '+activityIntervals.length:''} çevrim</span></header>
      <div className="table-wrap report-event-table"><table><thead><tr><th>{signalColumnFilter('event-signal')}</th><th>{dateColumnFilter('entry','Devreye giriş',reportEntryAfter,setReportEntryAfter)}</th><th>{dateColumnFilter('exit','Devreden çıkış',reportExitBefore,setReportExitBefore)}</th><th>Süre</th><th>Durum</th></tr></thead><tbody>
       {eventPage.rows.map(({row,interval,index})=>{const tag=config.tags.find(t=>t.id===row.tagId);return <tr key={row.tagId+'-'+interval.start+'-'+index}><td><strong>{tag?.code||row.tagId}</strong><small>{tag?.name}</small></td><td className="mono">{new Date(interval.start).toLocaleString('tr-TR')}</td><td className="mono">{interval.ongoing?'Devam ediyor':new Date(interval.end).toLocaleString('tr-TR')}</td><td className="mono">{durationText(interval.durationMs)}</td><td><span className={'event-state '+(interval.uncertain?'uncertain':interval.ongoing?'running':'complete')}>{interval.uncertain?'Belirsiz':interval.ongoing?'Açık':'Tamamlandı'}</span></td></tr>})}
      </tbody></table>{!filteredActivityIntervals.length&&<div className="empty-state">{activityIntervals.length?'Filtreyle eşleşen çevrim yok.':'Bu aralıkta açık-kapalı çevrimi oluşmamış.'}</div>}
      {eventPage.pager}</div>
     </section>
    </>}
    {reportTab==='alarms'&&<>
     <div className="report-kpis">
      {kpi('Toplam alarm',report.alarms.total)}
      {kpi('Onaylanmamış',report.alarms.unacked,undefined,report.alarms.unacked?'warn':undefined)}
      {kpi('Kritik',report.alarms.bySeverity.critical||0)}
      {kpi('En uzun süren',durationText(report.alarms.longestMs||0))}
     </div>
     <div className="report-split">
      <section className="report-card">
       <header><h3>En sık alarmlar</h3><span className="muted">ilk 10</span></header>
       <BarList items={report.alarms.top.map((r:any)=>({label:r.name,value:r.count}))} empty="Bu aralıkta alarm yok."/>
      </section>
      <section className="report-card">
       <header><h3>Önem derecesi</h3></header>
       <BarList items={(['critical','warning','info'] as const).filter(s=>report.alarms.bySeverity[s]).map(s=>({label:severityLabels[s],value:report.alarms.bySeverity[s],tone:s==='critical'?'danger' as const:undefined}))} empty="Bu aralıkta alarm yok."/>
      </section>
     </div>
    </>}
    {reportTab==='commands'&&<>
     <div className="report-kpis">
      {kpi('Toplam komut',report.commands.total)}
      {kpi('Doğrulanan',report.commands.byStatus.verified||0)}
      {kpi('Sonuçlanmayan / başarısız',report.commands.failed,undefined,report.commands.failed?'warn':undefined)}
      {kpi('Komut veren kişi',Object.keys(report.commands.byUser).length)}
     </div>
     <div className="report-split">
      <section className="report-card">
       <header><h3>Sonuç durumu</h3></header>
       <BarList items={Object.entries(report.commands.byStatus as Record<string,number>).sort((a,b)=>b[1]-a[1]).map(([s,n])=>({label:statusLabel(s),value:n,tone:failedStatuses.includes(s)?'danger' as const:s==='verified'?'ok' as const:undefined}))} empty="Bu aralıkta komut yok."/>
      </section>
      <section className="report-card">
       <header><h3>Komut veren</h3></header>
       <BarList items={Object.entries(report.commands.byUser as Record<string,number>).sort((a,b)=>b[1]-a[1]).map(([u,n])=>({label:u,value:n}))} empty="Bu aralıkta komut yok."/>
      </section>
     </div>
    </>}
    {reportTab==='notes'&&<>
     <section className="report-card report-note-form">
      <header><h3>Yeni not</h3></header>
      <div className="report-note-row">
       <div className="report-shift-pick" role="group" aria-label="Vardiya">{SHIFTS.map(s=><button key={s.id} className={note.shift===s.id?'active':''} aria-pressed={note.shift===s.id} onClick={()=>setNote({...note,shift:s.id})}>{s.id}<small>{String(s.start).padStart(2,'0')}–{String(s.start+8).padStart(2,'0')}</small></button>)}</div>
       <input aria-label="Not" value={note.text} placeholder="Devir teslimde bilinmesi gereken" onChange={e=>setNote({...note,text:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')void saveNote()}}/>
       <button className="btn primary" disabled={busy||note.text.trim().length<3} onClick={()=>void saveNote()}>Kaydet</button>
      </div>
     </section>
     <section className="report-card flush">
      <header><h3>Notlar</h3><span className="muted">{report.notes.length}</span></header>
      {report.notes.length
       ?<ul className="report-notes">{report.notes.map((n:any)=><li key={n.id}><div><span className="report-note-shift">{n.shift}</span><span className="mono">{new Date(n.created).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span><span>{n.author}</span></div><p>{n.text}</p></li>)}</ul>
       :<div className="empty-state">Bu aralıkta vardiya notu yok.</div>}
     </section>
    </>}
   </div>}
  </div>
 );
 // Sayfa: İşlem kayıtları (denetim) — aralık çubuğu + sekmeler; kayıt adları okunur Türkçe.
 const auditCommands:any[]=logs?.commands||[];
 const auditEvents:any[]=logs?.events||[];
 const auditTotalCmd=logs?.commandsTotal??auditCommands.length, auditTotalEvt=logs?.eventsTotal??auditEvents.length;
 const auditTruncated=auditCommands.length<auditTotalCmd||auditEvents.length<auditTotalEvt;
 const auditBad=(s:string)=>['failed','rejected','unverified','partial','uncertain','aborted'].includes(s);
 const tally=(keys:string[])=>{const m:Record<string,number>={};for(const k of keys)m[k]=(m[k]||0)+1;return m;};
 const cmdUsers=tally(auditCommands.map(c=>c.user)), cmdStatuses=tally(auditCommands.map(c=>c.status));
 const evtUsers=tally(auditEvents.map(e=>e.actor)), evtCats=tally(auditEvents.map(e=>auditCategory(e.action)));
 const qMatch=(q:string,...parts:unknown[])=>!q.trim()||parts.join(' ').toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'));
 const shownCommands=auditCommands.filter(c=>(!auditCmdFilter.users.length||auditCmdFilter.users.includes(c.user))&&(!auditCmdFilter.statuses.length||auditCmdFilter.statuses.includes(c.status))&&qMatch(auditCmdFilter.q,c.name,c.value,c.message));
 const shownEvents=auditEvents.filter(e=>(!auditEvtFilter.users.length||auditEvtFilter.users.includes(e.actor))&&(!auditEvtFilter.cats.length||auditEvtFilter.cats.includes(auditCategory(e.action)))&&qMatch(auditEvtFilter.q,auditLabel(e.action),e.action,auditSummary(e.details)));
 const auditCol={open:auditFilterOpen,setOpen:setAuditFilterOpen};
 const auditCmdPage=usePaged(shownCommands,JSON.stringify(auditCmdFilter)+auditPage+(logs?.from??'')),
  auditEvtPage=usePaged(shownEvents,JSON.stringify(auditEvtFilter)+auditPage+(logs?.from??''));
 const toggleIn=(list:string[],v:string)=>list.includes(v)?list.filter(x=>x!==v):[...list,v];
 const auditTabs:{id:AuditTab;label:string;count?:number;alert?:boolean}[]=[
  {id:'overview',label:'Genel bakış'},
  {id:'commands',label:'Komutlar',count:auditTotalCmd},
  {id:'events',label:'Değişiklikler',count:auditTotalEvt},
 ];
 const auditTabIndex=Math.max(0,auditTabs.findIndex(t=>t.id===auditTab));
 function switchAuditTab(id:AuditTab){
  setAuditTabDir(auditTabs.findIndex(t=>t.id===id)<auditTabIndex?'prev':'next');
  setAuditTab(id);
  setAuditFilterOpen(null);
 }
 function auditTabKey(e:React.KeyboardEvent){
  const i=auditTabIndex,n=auditTabs.length;
  const next=e.key==='ArrowRight'?(i+1)%n:e.key==='ArrowLeft'?(i-1+n)%n:e.key==='Home'?0:e.key==='End'?n-1:-1;
  if(next<0)return;
  e.preventDefault();
  switchAuditTab(auditTabs[next].id);
  document.getElementById('audit-tab-'+auditTabs[next].id)?.focus();
 }
 const auditSpan=Math.max(1,(logs?.to??auditTo)-(logs?.from??auditFrom));
 const auditPager=(total:number)=>total>auditLimit&&<div className="report-more">
  <span>{auditPage*auditLimit+1}–{Math.min(total,(auditPage+1)*auditLimit)} / {total}</span>
  <button className="btn small" disabled={busy||auditPage===0} onClick={()=>void run(()=>refreshAudit(auditPreset,auditPage-1))}>Önceki</button>
  <button className="btn small" disabled={busy||(auditPage+1)*auditLimit>=total} onClick={()=>void run(()=>refreshAudit(auditPreset,auditPage+1))}>Sonraki</button>
 </div>;
 const auditPageView = page === 'audit' && (
  <div className="shift-report audit-page">
   {logs?.freeMb >= 0 && logs.freeMb < 500 && (
    <div className="warning">
     Veri diskinde {logs.freeMb} MB boş alan kaldı. Yedek alın veya saklama süresini kısaltın; disk
     dolarsa kayıt yazılamaz.
    </div>
   )}
   <div className="report-toolbar">
    <div className="report-presets" role="group" aria-label="Zaman aralığı">
     {RANGE_PRESETS.map(p=><button key={p.id} className={auditPreset===p.id?'active':''} aria-pressed={auditPreset===p.id} onClick={()=>{setAuditPreset(p.id);void run(()=>refreshAudit(p.id,0))}}>{p.label}</button>)}
     <div className="report-column-filter report-custom">
      <button className={auditPreset==='custom'?'active':''} aria-pressed={auditPreset==='custom'} aria-expanded={auditFilterOpen==='custom'} onClick={()=>setAuditFilterOpen(auditFilterOpen==='custom'?null:'custom')}><CalendarDays size={13}/>Özel</button>
      {auditFilterOpen==='custom'&&<div className="report-filter-popover date" role="dialog" aria-label="Özel aralık" onKeyDown={e=>{if(e.key==='Escape')setAuditFilterOpen(null)}}>
       <label><span>Başlangıç</span><input autoFocus type="datetime-local" value={dateTimeValue(auditFrom)} onChange={e=>{const v=new Date(e.target.value).getTime();if(Number.isFinite(v))setAuditFrom(v)}}/></label>
       <label><span>Bitiş</span><input type="datetime-local" value={dateTimeValue(auditTo)} onChange={e=>{const v=new Date(e.target.value).getTime();if(Number.isFinite(v))setAuditTo(v)}}/></label>
       <div className="report-filter-footer"><span>{auditTo<=auditFrom?'Bitiş başlangıçtan sonra olmalı':''}</span><button className="btn small primary" disabled={busy||auditTo<=auditFrom} onClick={()=>{setAuditPreset('custom');void run(async()=>{await loadAudit(auditFrom,auditTo,0);setAuditFilterOpen(null)})}}>Uygula</button></div>
      </div>}
     </div>
    </div>
    <div className="audit-toolbar-right">
     <span className="report-range mono">{rangeLabel(logs?.from??auditFrom,logs?.to??auditTo)}</span>
     <InfoTip>
      {logs?.retentionDays ? 'Kayıtlar ' + logs.retentionDays + ' gün saklanır.' : 'Kayıtlar saklama süresi boyunca tutulur.'}
      {logs?.scope === 'operations'
       ? ' Rolünüz için yalnız işletme kayıtları (komut, alarm, reçete, vardiya) gösterilir.'
       : logs?.scope === 'design'
         ? ' Kullanıcı ve oturum kayıtları yalnız yöneticiye gösterilir.'
         : ''}
     </InfoTip>
     <button className="btn small" disabled={busy} onClick={()=>void run(()=>refreshAudit(auditPreset,auditPage))}><RotateCcw size={14}/>Yenile</button>
    </div>
   </div>
   <div className="page-tabs report-tabs" role="tablist" aria-label="Kayıt bölümü" onKeyDown={auditTabKey} style={{'--tab-i':auditTabIndex,'--tab-n':auditTabs.length} as React.CSSProperties}>
    <span className="page-tabs-indicator" aria-hidden="true"/>
    {auditTabs.map(t=><button key={t.id} id={'audit-tab-'+t.id} role="tab" aria-selected={auditTab===t.id} aria-controls="audit-panel" tabIndex={auditTab===t.id?0:-1} onClick={()=>switchAuditTab(t.id)}>
     {t.label}{t.count!==undefined&&<span className="tab-count">{t.count}</span>}
    </button>)}
   </div>
   {!logs&&<div className="empty-state">Kayıtlar yükleniyor…</div>}
   {logs&&<div key={auditTab} id="audit-panel" role="tabpanel" aria-labelledby={'audit-tab-'+auditTab} className={'tab-panel report-panel '+auditTabDir}>
    {auditTab==='overview'&&<>
     <div className="report-kpis">
      {kpi('Komut',auditTotalCmd,(cmdStatuses.verified||0)+' doğrulandı')}
      {kpi('Sorunlu komut',auditCommands.filter(c=>auditBad(c.status)).length,'başarısız, reddedilen, belirsiz',auditCommands.some(c=>auditBad(c.status))?'warn':undefined)}
      {kpi('Değişiklik kaydı',auditTotalEvt,(evtCats.config||0)+' yapılandırma · '+(evtCats.screen||0)+' ekran')}
      {kpi('İşlem yapan kişi',new Set([...Object.keys(cmdUsers),...Object.keys(evtUsers)]).size)}
     </div>
     {auditTruncated&&<div className="report-note"><Database size={14}/>Grafikler aralıktaki son {auditLimit} komut ve {auditLimit} değişiklik kaydından çizildi; toplamlar tüm aralığı sayar.</div>}
     <section className="report-card">
      <header><h3>İşlem yoğunluğu</h3><span className="muted">{({[30*60000]:'30 dakikalık',[3600000]:'saatlik',[6*3600000]:'6 saatlik',[86400000]:'günlük'} as Record<number,string>)[bucketSize(auditSpan)]} kayıt · komut + değişiklik</span></header>
      <Columns unit="kayıt" buckets={countBuckets([...auditCommands.map(c=>c.createdAt),...auditEvents.map(e=>e.created)],logs.from??auditFrom,logs.to??auditTo,bucketSize(auditSpan))}/>
     </section>
     <div className="report-split">
      <section className="report-card">
       <header><h3>İşlem türü</h3></header>
       <BarList items={[{label:'Komut',value:auditCommands.length},...(Object.keys(AUDIT_CATEGORIES) as AuditCategory[]).filter(c=>c!=='command'&&evtCats[c]).map(c=>({label:AUDIT_CATEGORIES[c],value:evtCats[c]}))].filter(i=>i.value).sort((a,b)=>b.value-a.value)} empty="Bu aralıkta kayıt yok."/>
      </section>
      <section className="report-card">
       <header><h3>Kim yaptı</h3></header>
       <BarList items={Object.entries(tally([...auditCommands.map(c=>c.user),...auditEvents.map(e=>e.actor)])).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([u,n])=>({label:u,value:n}))} empty="Bu aralıkta kayıt yok."/>
      </section>
     </div>
    </>}
    {auditTab==='commands'&&<section className="report-card flush">
     <header><h3>Komutlar</h3><span className="muted">{shownCommands.length!==auditCommands.length?shownCommands.length+' / ':''}{auditCommands.length} gösteriliyor</span></header>
     <div className="table-wrap column-filter-table">
      <table>
       <thead><tr>
        <th>Zaman</th>
        <th><ColumnFilter {...auditCol} id="audit-cmd-user" label="Kullanıcı" options={Object.keys(cmdUsers).sort().map(u=>({value:u,label:u,count:cmdUsers[u]}))} selected={auditCmdFilter.users} onToggle={v=>setAuditCmdFilter({...auditCmdFilter,users:toggleIn(auditCmdFilter.users,v)})} onClear={()=>setAuditCmdFilter({...auditCmdFilter,users:[]})}/></th>
        <th><ColumnFilter {...auditCol} id="audit-cmd-q" label="Komut" title="Komut ara" query={auditCmdFilter.q} onQuery={q=>setAuditCmdFilter({...auditCmdFilter,q})} placeholder="Komut adı, değer veya mesaj" onClear={()=>setAuditCmdFilter({...auditCmdFilter,q:''})}/></th>
        <th>Değer</th>
        <th><ColumnFilter {...auditCol} id="audit-cmd-status" label="Sonuç" align="right" options={Object.keys(cmdStatuses).map(s=>({value:s,label:statusLabel(s),count:cmdStatuses[s]}))} selected={auditCmdFilter.statuses} onToggle={v=>setAuditCmdFilter({...auditCmdFilter,statuses:toggleIn(auditCmdFilter.statuses,v)})} onClear={()=>setAuditCmdFilter({...auditCmdFilter,statuses:[]})}/></th>
       </tr></thead>
       <tbody>
        {auditCmdPage.rows.map((c:any)=>(
         <tr key={c.id}>
          <td className="mono">{new Date(c.createdAt).toLocaleString('tr-TR')}</td>
          <td>{c.user}</td>
          <td>{c.name}<small title={c.id}>{c.reason?'Gerekçe: '+c.reason:c.id.slice(0,8)}</small></td>
          <td className="mono">{String(c.value)}</td>
          <td><span className={'badge '+(c.status==='verified'?'green':auditBad(c.status)?'bad':'')}>{statusLabel(c.status)}</span><small>{c.message}</small></td>
         </tr>
        ))}
       </tbody>
      </table>
      {!shownCommands.length&&<div className="empty-state">{auditCommands.length?'Filtreyle eşleşen komut yok.':'Bu aralıkta komut gönderilmedi.'}</div>}
      {auditCmdPage.pager}
      {auditPager(auditTotalCmd)}
     </div>
    </section>}
    {auditTab==='events'&&<section className="report-card flush">
     <header><h3>Değişiklikler</h3><span className="muted">{shownEvents.length!==auditEvents.length?shownEvents.length+' / ':''}{auditEvents.length} gösteriliyor · satıra tıklayınca ayrıntı açılır</span></header>
     <div className="table-wrap column-filter-table">
      <table className="audit-events">
       <thead><tr>
        <th>Zaman</th>
        <th><ColumnFilter {...auditCol} id="audit-evt-user" label="Kullanıcı" options={Object.keys(evtUsers).sort().map(u=>({value:u,label:u,count:evtUsers[u]}))} selected={auditEvtFilter.users} onToggle={v=>setAuditEvtFilter({...auditEvtFilter,users:toggleIn(auditEvtFilter.users,v)})} onClear={()=>setAuditEvtFilter({...auditEvtFilter,users:[]})}/></th>
        <th><ColumnFilter {...auditCol} id="audit-evt-cat" label="Tür" options={(Object.keys(AUDIT_CATEGORIES) as AuditCategory[]).filter(c=>evtCats[c]).map(c=>({value:c,label:AUDIT_CATEGORIES[c],count:evtCats[c]}))} selected={auditEvtFilter.cats} onToggle={v=>setAuditEvtFilter({...auditEvtFilter,cats:toggleIn(auditEvtFilter.cats,v)})} onClear={()=>setAuditEvtFilter({...auditEvtFilter,cats:[]})}/></th>
        <th><ColumnFilter {...auditCol} id="audit-evt-q" label="İşlem" title="İşlem ara" align="right" query={auditEvtFilter.q} onQuery={q=>setAuditEvtFilter({...auditEvtFilter,q})} placeholder="İşlem adı veya ayrıntı" onClear={()=>setAuditEvtFilter({...auditEvtFilter,q:''})}/></th>
       </tr></thead>
       <tbody>
        {auditEvtPage.rows.map((e:any)=>{const open=auditOpenRow===e.id,cat=auditCategory(e.action),sum=auditSummary(e.details),fields=auditFields(e.details);return <Fragment key={e.id}>
         <tr className={'audit-row'+(open?' open':'')} onClick={()=>setAuditOpenRow(open?null:e.id)} aria-expanded={open}>
          <td className="mono">{new Date(e.created).toLocaleString('tr-TR')}</td>
          <td>{e.actor}</td>
          <td><span className={'audit-cat '+cat}>{AUDIT_CATEGORIES[cat]}</span></td>
          <td><strong>{auditLabel(e.action)}</strong>{sum&&<small>{sum}</small>}</td>
         </tr>
         {open&&<tr className="audit-detail"><td colSpan={4}>
          {!!fields.length&&<dl>{fields.map(([k,v])=><Fragment key={k}><dt>{k}</dt><dd className="mono">{v}</dd></Fragment>)}</dl>}
          <details><summary>Ham kayıt <span className="mono">{e.action}</span></summary><pre>{JSON.stringify(e.details,null,2)}</pre></details>
         </td></tr>}
        </Fragment>})}
       </tbody>
      </table>
      {!shownEvents.length&&<div className="empty-state">{auditEvents.length?'Filtreyle eşleşen kayıt yok.':'Bu aralıkta değişiklik kaydı yok.'}</div>}
      {auditEvtPage.pager}
      {auditPager(auditTotalEvt)}
     </div>
    </section>}
   </div>}
  </div>
 );
 // Sayfa: Proje ayarları
 const settingsPage = page === 'settings' && (
  <>
   {user.role === 'admin' && <ProjectsPanel refresh={refresh} notify={notify} />}
   {user.role === 'admin' && <UpdatePanel notify={notify} />}
   <section className="settings-section">
    <div className="settings-head"><h2>Ekran sürümleri</h2><InfoTip>Her yayın ayrı sürüm olarak saklanır. Eski bir sürüm taslağa geri alınabilir; yayına çıkması için stüdyodan yeniden yayınlanır.</InfoTip></div>
    <div className="screen-settings">
     {screens.map((s) => (
      <div key={s.id}>
       <span>
        <strong>{s.name}</strong>
        <small>
         Taslak v{s.version} · Yayın v{s.publishedVersion}
        </small>
       </span>
       <button
        className="btn"
        onClick={() =>
         void run(async () => {
          setRevisionScreen(s.id);
          setRevisions(await api('/screens/' + s.id + '/revisions'));
         })
        }
       >
        Sürümler
       </button>
       <button
        className="btn"
        disabled={!s.published}
        title={s.published ? 'Taslak ile yayını karşılaştır' : 'Bu ekran hiç yayınlanmadı'}
        onClick={() => openDiff(s)}
       >
        Karşılaştır
       </button>
       {user.role === 'admin' && (
        <button
         className="btn danger"
         disabled={busy || screens.length < 2}
         title={screens.length < 2 ? 'Son ekran silinemez' : 'Ekranı sil'}
         onClick={() =>
          askConfirm(
           'Ekran silinsin mi?',
           '"' +
            s.name +
            '" ekranı ve tüm sürümleri kalıcı olarak silinecek (' +
            s.draft.widgets.length +
            ' nesne).',
           () =>
            void run(async () => {
             await api('/screens/' + s.id, 'DELETE');
             notify('"' + s.name + '" ekranı silindi.');
            }),
           true,
          )
         }
        >
         <Trash2 size={15} />
         Sil
        </button>
       )}
      </div>
     ))}
    </div>
    {revisions && (
     <div className="revision-list">
      {revisions.length === 0 ? (
       <p>Henüz yayın yok.</p>
      ) : (
       revisions.map((r) => (
        <div key={r.version}>
         <span>
          v{r.version} · {new Date(r.created).toLocaleString('tr-TR')}
         </span>
         {writable && (
          <button
           className="btn small"
           onClick={() =>
            void run(async () => {
             await api('/screens/' + revisionScreen + '/restore', 'POST', { version: r.version });
             notify('Önceki sürüm taslağa alındı. Yayınlamak için stüdyoyu kullanın.');
            })
           }
          >
           Taslağa geri al
          </button>
         )}
        </div>
       ))
      )}
     </div>
    )}
   </section>
   {user.role === 'admin' && (
    <section className="settings-section">
     <div className="settings-head"><h2>Kullanıcılar</h2><InfoTip>Rol, parola ve durum değişikliği kullanıcının açık oturumlarını kapatır. İzinler ekran, komut ve alan bazında daraltılır.</InfoTip><span className="grow" />
      <button
       className="btn"
       onClick={() =>
        setModal({
         kind: 'user',
         data: { username: '', password: '', role: 'viewer' },
         fresh: true,
        })
       }
      >
       <Plus size={16} />
       Kullanıcı ekle
      </button>
     </div>
     {users.map((row) => (
      <div className={'user-row' + (row.disabled ? ' disabled' : '')} key={row.id}>
       <span>
        {row.username}
        {!!row.disabled && <small> · devre dışı</small>}
       </span>
       <select
        className="badge"
        value={row.role}
        disabled={busy}
        onChange={(e) =>
         void run(async () => {
          await api('/users/' + row.id, 'PATCH', { role: e.target.value });
          setUsers(await api('/users'));
          notify(row.username + ' rolü güncellendi; oturumları kapatıldı.');
         })
        }
       >
        {[
         ['admin', 'Yönetici'],
         ['designer', 'Tasarımcı'],
         ['operator', 'Operatör'],
         ['viewer', 'İzleyici'],
        ].map(([v, l]) => (
         <option key={v} value={v}>
          {l}
         </option>
        ))}
       </select>
       <button
        className="btn small"
        disabled={busy}
        title="Parolayı sıfırla"
        onClick={() =>
         void run(async () => {
          const pass = prompt(row.username + ' için yeni parola (en az 12 karakter):');
          if (!pass) return;
          await api('/users/' + row.id, 'PATCH', { password: pass });
          notify(row.username + ' parolası değişti; oturumları kapatıldı.');
         })
        }
       >
        Parola
       </button>
       <button
        className="btn small"
        disabled={busy}
        title="Açık oturumları kapat"
        onClick={() =>
         void run(async () => {
          const r = await api<{ revoked: number }>('/users/' + row.id + '/revoke', 'POST');
          notify(r.revoked + ' oturum kapatıldı.');
         })
        }
       >
        Oturumlar
       </button>
       <button
        className="btn small"
        disabled={busy}
        title="Ekran, komut ve alan izinleri"
        onClick={() =>
         setPerm({
          id: row.id,
          username: row.username,
          role: row.role,
          screens: (row as any).permissions?.screens || [],
          commands: (row as any).permissions?.commands || [],
          areas: (row as any).permissions?.areas || [],
         })
        }
       >
        İzinler
       </button>
       <button
        className={'btn small ' + (row.disabled ? '' : 'danger')}
        disabled={busy}
        onClick={() =>
         void run(async () => {
          await api('/users/' + row.id, 'PATCH', { disabled: !row.disabled });
          setUsers(await api('/users'));
          notify(
           row.username +
            (row.disabled
             ? ' yeniden etkinleştirildi.'
             : ' devre dışı bırakıldı; oturumları kapatıldı.'),
          );
         })
        }
       >
        {row.disabled ? 'Etkinleştir' : 'Devre dışı bırak'}
       </button>
      </div>
     ))}
    </section>
   )}
   {writable && (
    <section className="settings-section">
     <div className="settings-head"><h2>Yedek ve aktarım</h2><InfoTip>Proje paketi başka bilgisayara taşımak içindir. Tam sistem yedeği (kullanıcılar, alarm geçmişi, komut kayıtları) yalnız veritabanı yedeğindedir.</InfoTip></div>
     <div className="transfer-grid">
     {user.role === 'admin' && (
      <div className="transfer-card">
       <div className="transfer-card-head"><span className="transfer-icon"><Package size={16} /></span><strong>Proje paketi</strong><InfoTip>Tanımlar, ekranlar (taslak ve yayın), alarm kuralları, ekipman tipleri ve kullanılan görseller tek dosyada taşınır; başka bilgisayarda aynı proje açılır. Uygulamadan önce mevcut projenin yedeği alınır, cihazlar pasif gelir.</InfoTip></div>
       <small>Ekranlar, tanımlar ve görseller tek dosyada</small>
    {user.role === 'admin' && (
     <div className="toolbar-group">
      <button
       className="btn"
       disabled={pkgBusy}
       onClick={() =>
        void run(async () => download('scada-proje-paketi.json', await api('/package')))
       }
      >
       <Download size={16} />
       İndir
      </button>
      <label className="btn">
       <Upload size={16} />
       Yükle
       <input
        hidden
        type="file"
        accept=".json"
        onChange={(e) => {
         const f = e.target.files?.[0];
         if (f) void previewPackage(f);
         e.target.value = '';
        }}
       />
      </label>
     </div>
    )}
      </div>
     )}
     {writable && (
      <div className="transfer-card">
       <div className="transfer-card-head"><span className="transfer-icon"><Shapes size={16} /></span><strong>Ekipman kütüphanesi</strong><InfoTip>İçe aktarma yalnız ekler ve birleştirir; hiçbir şey silinmez. Ekranlar, yapılandırma, alarm kuralları ve sürüm geçmişi değişmez.</InfoTip></div>
       <small>Yalnız ekipman tipleri ve görselleri</small>
    {writable && (
     <div className="toolbar-group">
      <button
       className="btn"
       disabled={libBusy}
       onClick={() =>
        void run(async () => download('ekipman-kutuphanesi.json', await api('/library')))
       }
      >
       <Download size={16} />
       İndir
      </button>
      <label className="btn">
       <Upload size={16} />
       Yükle
       <input
        hidden
        type="file"
        accept=".json"
        onChange={(e) => {
         const f = e.target.files?.[0];
         if (f) void previewLibrary(f);
         e.target.value = '';
        }}
       />
      </label>
     </div>
    )}
      </div>
     )}
     {user.role === 'admin' && (
      <div className="transfer-card">
       <div className="transfer-card-head"><span className="transfer-icon"><Database size={16} /></span><strong>Proje dosyaları</strong><InfoTip>Dışa/içe aktarma yalnız tanımları taşır. DB yedeği yerel veritabanının tutarlı tam kopyasıdır. Görsel temizliği hiçbir ekranda ve sürümde kullanılmayan görselleri kalıcı siler.</InfoTip></div>
       <small>Tanım aktarımı, veritabanı yedeği, temizlik</small>
    {user.role === 'admin' && (
     <div className="toolbar-group">
      <button
       className="btn"
       onClick={() => void run(async () => download('scada-project.json', await api('/export')))}
      >
       <Download size={16} />
       Dışa aktar
      </button>
      <label className="btn">
       <Upload size={16} />
       İçe aktar
       <input
        hidden
        type="file"
        accept=".json"
        onChange={(e) => {
         const f = e.target.files?.[0];
         if (f)
          askConfirm(
           'Proje içe aktarılsın mı?',
           'Mevcut projenin yedeği alınacak ve içe aktarılan proje pasif cihazlarla açılacak.',
           () =>
            void run(async () => {
             await api('/import', 'POST', JSON.parse(await f.text()));
             notify('Proje içe aktarıldı. Cihazlar pasif, ekranlar taslak.');
            }),
          );
         e.target.value = '';
        }}
       />
      </label>
      <button
       className="btn"
       onClick={() =>
        void run(async () => {
         const r = await api('/backup', 'POST');
         notify('Yedek oluşturuldu: ' + r.name);
        })
       }
      >
       <Database size={16} />
       DB yedeği
      </button>
      <button
       className="btn"
       onClick={() =>
        void run(async () => {
         const r = await api<{ count: number; bytes: number }>('/uploads/unused');
         if (!r.count) {
          notify('Kullanılmayan görsel yok.');
          return;
         }
         askConfirm(
          'Kullanılmayan görseller silinsin mi?',
          r.count +
           ' görsel hiçbir ekranda ve hiçbir ekran sürümünde kullanılmıyor (' +
           Math.round(r.bytes / 1024) +
           ' KB). Kalıcı olarak silinecek.',
          () =>
           void run(async () => {
            const d = await api<{ removed: number; bytes: number }>('/uploads/cleanup', 'POST');
            notify(
             d.removed + ' görsel silindi · ' + Math.round(d.bytes / 1024) + ' KB yer açıldı.',
            );
           }),
          true,
         );
        })
       }
      >
       <Trash2 size={16} />
       Görsel temizliği
      </button>
     </div>
    )}
      </div>
     )}
     </div>
    {pkg && (
     <div className="package-preview">
      <h3>Uygulanacak değişiklikler</h3>
      <ul>
       <li>
        Paket sürümü {pkg.summary.packageVersion} ·{' '}
        {pkg.summary.compatible ? 'bu sürümle uyumlu' : 'UYUMSUZ — uygulamayı güncelleyin'}
       </li>
       <li>
        {pkg.summary.screens.incoming} ekran gelecek; {pkg.summary.screens.replaced} tanesi mevcut
        ekranın yerine yazılacak
        {pkg.summary.screens.removed.length
         ? '; şu ekranlar silinecek: ' + pkg.summary.screens.removed.join(', ')
         : ''}
       </li>
       <li>
        {pkg.summary.devices} cihaz, {pkg.summary.tags} etiket, {pkg.summary.alarmRules} alarm
        kuralı, {pkg.summary.equipmentTypes} ekipman tipi
       </li>
       <li>
        {pkg.summary.assets.total} görsel
        {pkg.summary.assets.corrupted.length
         ? ' · BOZUK: ' + pkg.summary.assets.corrupted.join(', ')
         : ' · hash doğrulandı'}
        {pkg.summary.assets.missing.length
         ? ' · EKSİK: ' + pkg.summary.assets.missing.join(', ')
         : ''}
       </li>
       <li>
        Cihazlar <strong>pasif</strong> açılır; devreye alma ayrı adımdır.
       </li>
      </ul>
      <div className="toolbar-group">
       <button className="btn" onClick={() => setPkg(null)}>
        Vazgeç
       </button>
       <button
        className="btn primary"
        disabled={
         pkgBusy ||
         !pkg.summary.compatible ||
         pkg.summary.assets.corrupted.length > 0 ||
         pkg.summary.assets.missing.length > 0
        }
        onClick={() =>
         askConfirm(
          'Paket uygulansın mı?',
          'Mevcut projenin yedeği alınır; ekranlar ve tanımlar paketle değiştirilir.',
          () => void applyPackage(),
          true,
         )
        }
       >
        {pkgBusy ? 'Uygulanıyor…' : 'Paketi uygula'}
       </button>
      </div>
     </div>
    )}
    {lib && (
     <div className="package-preview">
      <h3>Uygulanacak değişiklikler</h3>
      <ul>
       <li>
        Paket sürümü {lib.plan.packVersion} · {lib.plan.packName}
       </li>
       <li>{lib.plan.items.length} ekipman tipi gelecek</li>
       <li>
        {lib.plan.assets.total} görsel
        {lib.plan.assets.corrupted.length
         ? ' · BOZUK: ' + lib.plan.assets.corrupted.join(', ')
         : ' · hash doğrulandı'}
        {lib.plan.assets.missing.length ? ' · EKSİK: ' + lib.plan.assets.missing.join(', ') : ''}
       </li>
      </ul>
      <div className="table-wrap">
       <table>
        <thead>
         <tr>
          <th>Ekipman tipi</th>
          <th>Gelen sürüm</th>
          <th>Mevcut sürüm</th>
          <th>Durum</th>
          <th>Karar</th>
         </tr>
        </thead>
        <tbody>
         {lib.plan.items.map((it: any) => (
          <tr key={it.typeId}>
           <td>
            <strong>{it.name}</strong>
            {it.existingName && it.existingName !== it.name && (
             <small>Mevcut ad: {it.existingName}</small>
            )}
           </td>
           <td className="mono">{it.incomingVersion}</td>
           <td className="mono">{it.existingVersion ?? '—'}</td>
           <td>
            <span
             className={
              'badge ' + (it.state === 'add' ? 'green' : it.state === 'renamed' ? 'warn' : '')
             }
            >
             {libStateLabels[it.state as keyof typeof libStateLabels]}
            </span>
           </td>
           <td>
            {it.state === 'upgrade' || it.state === 'renamed' ? (
             <select
              value={libChoices[it.typeId] || (it.state === 'upgrade' ? 'upgrade' : 'duplicate')}
              onChange={(e) => setLibChoices({ ...libChoices, [it.typeId]: e.target.value as any })}
             >
              <option value="upgrade">Mevcudun üzerine yaz</option>
              <option value="duplicate">Kopya olarak ekle</option>
              <option value="skip">Atla</option>
             </select>
            ) : it.state === 'add' ? (
             'Eklenecek'
            ) : (
             'Atlanacak'
            )}
           </td>
          </tr>
         ))}
        </tbody>
       </table>
      </div>
      <div className="toolbar-group">
       <button
        className="btn"
        onClick={() => {
         setLib(null);
         setLibChoices({});
        }}
       >
        Vazgeç
       </button>
       <button
        className="btn primary"
        disabled={
         libBusy || lib.plan.assets.corrupted.length > 0 || lib.plan.assets.missing.length > 0
        }
        onClick={() =>
         askConfirm(
          'Kütüphane birleştirilsin mi?',
          'Ekipman tipleri ve görseller projeye eklenecek; hiçbir şey silinmez.',
          () => void applyLibrary(),
         )
        }
       >
        {libBusy ? 'Birleştiriliyor…' : 'Kütüphaneyi birleştir'}
       </button>
      </div>
     </div>
    )}
    </section>
   )}
  </>
 );
 // Modal: kullanıcı izinleri (B29)
 const permModal =
  perm &&
  (() => {
   const areas = [...new Set(rules.map((r) => r.area).filter(Boolean))];
   const toggle = (kind: 'screens' | 'commands' | 'areas', value: string) =>
    setPerm((p) =>
     p
      ? {
         ...p,
         [kind]: p[kind].includes(value) ? p[kind].filter((x) => x !== value) : [...p[kind], value],
        }
      : p,
    );
   return (
    <div className="modal-backdrop" onClick={() => setPerm(null)}>
     <div className="modal perm-modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal-heading">
       <h2>{perm.username} · izinler</h2>
       <button type="button" className="tool" onClick={() => setPerm(null)}>
        ×
       </button>
      </div>
      <p className="small muted">
       Rol kaba kapıdır; izinler onu <strong>daraltır</strong>. Hiçbir kutu seçili değilse o boyutta
       kısıtlama yoktur. Yönetici rolü her zaman tam yetkilidir.
      </p>
      <h3>
       Ekranlar {perm.screens.length ? '· ' + perm.screens.length + ' seçili' : '· kısıtlama yok'}
      </h3>
      <div className="perm-list">
       {screens.map((sc) => (
        <label key={sc.id} className="check">
         <input
          type="checkbox"
          checked={perm.screens.includes(sc.id)}
          onChange={() => toggle('screens', sc.id)}
         />
         {sc.name}
        </label>
       ))}
      </div>
      <h3>
       Komutlar {perm.commands.length ? '· ' + perm.commands.length + ' seçili' : '· kısıtlama yok'}
      </h3>
      <div className="perm-list">
       {config.commands.map((c) => (
        <label key={c.id} className="check">
         <input
          type="checkbox"
          checked={perm.commands.includes(c.id)}
          onChange={() => toggle('commands', c.id)}
         />
         {c.name}
        </label>
       ))}
      </div>
      <h3>
       Alarm alanları {perm.areas.length ? '· ' + perm.areas.length + ' seçili' : '· kısıtlama yok'}
      </h3>
      {areas.length ? (
       <div className="perm-list">
        {areas.map((a) => (
         <label key={a} className="check">
          <input
           type="checkbox"
           checked={perm.areas.includes(a)}
           onChange={() => toggle('areas', a)}
          />
          {a}
         </label>
        ))}
       </div>
      ) : (
       <p className="small muted">Alarm kurallarında alan tanımlı değil.</p>
      )}
      <div className="modal-actions">
       <button className="btn" onClick={() => setPerm(null)}>
        Vazgeç
       </button>
       <button
        className="btn primary"
        disabled={busy || perm.role === 'admin'}
        title={perm.role === 'admin' ? 'Yönetici rolü kısıtlanamaz' : ''}
        onClick={() =>
         void run(async () => {
          await api('/users/' + perm.id, 'PATCH', {
           permissions: { screens: perm.screens, commands: perm.commands, areas: perm.areas },
          });
          setUsers(await api('/users'));
          setPerm(null);
          notify(perm.username + ' izinleri kaydedildi; oturumları kapatıldı.');
         })
        }
       >
        Kaydet
       </button>
      </div>
     </div>
    </div>
   );
  })();
 // Modal: etiketin kullanım yerleri ve trend (B34)
 const usedModal = used && (
  <div className="modal-backdrop" onClick={() => setUsed(null)}>
   <div className="modal used-modal" onClick={(e) => e.stopPropagation()}>
    <div className="modal-heading">
     <h2>{config.tags.find((t) => t.id === used)?.code} · Kullanım</h2>
     <button type="button" className="tool" onClick={() => setUsed(null)}>
      ×
     </button>
    </div>
    {(['screen', 'command', 'alarm'] as const).map((g) => {
     const rows = usageRows(used).filter((r) => r.group === g);
     if (!rows.length) return null;
     return (
      <div key={g}>
       <h3>{usageGroupLabels[g]}</h3>
       <div className="usage-list">
        {rows.map((r, i) => (
         <div className="usage-row" key={i}>
          <div>
           <strong>{r.text}</strong>
           <small>{r.detail}</small>
          </div>
          {r.screenId && (
           <button className="btn small" onClick={() => onScreen(r.screenId!)}>
            Ekrana git
            <ArrowUpRight size={13} />
           </button>
          )}
         </div>
        ))}
       </div>
      </div>
     );
    })}
    {!usageRows(used).length && <p className="muted">Bu etiket hiçbir yerde kullanılmıyor.</p>}
    {references && references.filter((r) => r.group === 'revision').length > 0 && (
     <div>
      <h3>Gecmis ekran surumleri</h3>
      <div className="usage-list">
       {references
        .filter((r) => r.group === 'revision')
        .map((r, i) => (
         <div className="usage-row" key={i}>
          <div>
           <strong>{r.text}</strong>
           <small>{r.detail}</small>
          </div>
          <button className="btn small" onClick={() => onScreen(r.screenId!)}>
           Ekrana git
           <ArrowUpRight size={13} />
          </button>
         </div>
        ))}
      </div>
     </div>
    )}
    {references === null && <p className="muted">Tum baglar taraniyor…</p>}
    {writable && (
     <div className="modal-actions">
      <select value={rebindTarget} onChange={(e) => setRebindTarget(e.target.value)}>
       <option value="">Tum baglari baska etikete bagla…</option>
       {config.tags
        .filter((t) => t.id !== used)
        .map((t) => (
         <option key={t.id} value={t.id}>
          {t.code} · {t.name}
         </option>
        ))}
      </select>
      <button
       className="btn danger"
       disabled={!rebindTarget || busy}
       onClick={() =>
        askConfirm(
         'Tum baglar yeniden baglansin mi?',
         config.tags.find((t) => t.id === used)?.code +
          ' etiketi; ekran taslaklari, yayinlari, komutlar, alarm kurallari ve simulasyonlardan kaldirilip secilen etikete baglanacak. Gecmis ekran surumleri kayit olarak korunur.',
         () =>
          void run(async () => {
           await api('/tags/' + used + '/rebind', 'POST', { targetTagId: rebindTarget });
           setUsed(null);
           notify('Baglar yeniden baglandi.');
          }),
         true,
        )
       }
      >
       Toplu yeniden bagla
      </button>
     </div>
    )}
    <div className="trend-panel">
     <h3>Trend</h3>
     <div className="toolbar-group">
      <button className="btn small" onClick={() => setTrendRange(15 * 60000)}>
       15 dk
      </button>
      <button className="btn small" onClick={() => setTrendRange(3600000)}>
       1 saat
      </button>
      <button className="btn small" onClick={() => setTrendRange(24 * 3600000)}>
       24 saat
      </button>
      {trend && (
       <button
        className="btn small"
        onClick={() => {
         const a = document.createElement('a'),
          u = URL.createObjectURL(
           new Blob(
            [
             'zaman,deger,kalite\\n' +
              trend.points
               .map((p) => new Date(p.at).toISOString() + ',' + (p.value ?? '') + ',' + p.quality)
               .join('\\n'),
            ],
            { type: 'text/csv' },
           ),
          );
         a.href = u;
         a.download = 'trend-' + config.tags.find((t) => t.id === used)?.code + '.csv';
         a.click();
         URL.revokeObjectURL(u);
        }}
       >
        CSV indir
       </button>
      )}
     </div>
     {trend ? (
      <>
       {trend.points.length ? (
        <svg viewBox="0 0 320 120" role="img" aria-label="Etiket trendi">
         <path d="M12 108H308 M12 12V108" stroke="currentColor" opacity=".25" fill="none" />
         <path d={trendPath(trend.points)} stroke="currentColor" strokeWidth="2" fill="none" />
         <text x="12" y="118" fontSize="9">
          {new Date(trend.from).toLocaleTimeString('tr-TR')}
         </text>
         <text x="250" y="118" fontSize="9">
          {new Date(trend.to).toLocaleTimeString('tr-TR')}
         </text>
        </svg>
       ) : (
        <p className="muted">Bu aralıkta kayıt yok.</p>
       )}
       <small>
        {trend.points.length} örnek · kötü kalite ve boş değerler çizgide boşluk olarak tutulur.
       </small>
      </>
     ) : (
      <p className="muted">Trend yükleniyor…</p>
     )}
    </div>
    {rules
     .filter((r) => r.tagId === used)
     .map((r) => (
      <div className="shelf-panel" key={r.id}>
       <strong>{r.name}</strong>
       <small>
        {r.shelvedUntil > Date.now()
         ? 'Rafa kaldırıldı: ' +
           new Date(r.shelvedUntil).toLocaleString('tr-TR') +
           ' · ' +
           r.shelvedBy
         : 'Etkin alarm kuralı'}
        {r.latch ? ' · latch' : ''}
        {r.ackRequired ? ' · ACK gerekli' : ' · bilgi olayı'}
       </small>
       {r.shelvedUntil > Date.now() ? (
        <button
         className="btn small"
         disabled={busy}
         onClick={() =>
          void run(async () => {
           await api('/alarms/' + r.id + '/unshelve', 'POST');
           await loadAlarms();
           notify('Alarm kuralı yeniden etkinleştirildi.');
          })
         }
        >
         Shelving'i kaldır
        </button>
       ) : (
        <div className="toolbar-group">
         <input
          aria-label="Shelving süresi dakika"
          type="number"
          min="1"
          max={shelveMax}
          title={'En fazla ' + shelveMax + ' dakika'}
          value={shelfMinutes}
          onChange={(e) => setShelfMinutes(Number(e.target.value))}
         />
         <input
          aria-label="Shelving gerekçesi"
          value={shelfReason}
          placeholder="Gerekçe (zorunlu)"
          onChange={(e) => setShelfReason(e.target.value)}
         />
         <button
          className="btn small"
          disabled={busy || shelfReason.trim().length < 3 || shelfMinutes < 1 || shelfMinutes > shelveMax}
          onClick={() =>
           void run(async () => {
            await api('/alarms/' + r.id + '/shelve', 'POST', {
             minutes: shelfMinutes,
             reason: shelfReason.trim(),
            });
            setShelfReason('');
            await loadAlarms();
            notify('Alarm kuralı süreli olarak rafa kaldırıldı.');
           })
          }
         >
          Shelve et
         </button>
        </div>
       )}
      </div>
     ))}
    <button className="btn spaced" onClick={() => setUsed(null)}>
     Kapat
    </button>
   </div>
  </div>
 );
 // Modal: taslak / yayın veya sürüm farkı
 const diffModal = diff && (
  <div className="modal-backdrop" onClick={() => closeDiff()}>
   <div
    className="modal diff-modal"
    ref={diffBoxRef}
    role="dialog"
    aria-modal="true"
    aria-labelledby="diff-title"
    onClick={(e) => e.stopPropagation()}
    onKeyDown={onDiffKey}
   >
    <div className="modal-heading">
     <h2 id="diff-title">{diff.screen} · Taslak / Yayın farkı</h2>
     <button type="button" className="tool" onClick={() => closeDiff()}>
      ×
     </button>
    </div>
    {!diff.entries.length && (
     <p className="muted">Taslak ile yayınlanmış sürüm arasında fark yok.</p>
    )}
    <div className="diff-list">
     {diff.entries.map((e, i) => (
      <div className={'diff-row diff-' + e.kind} key={i}>
       <div className="diff-row-head">
        <span
         className={'badge ' + (e.kind === 'added' ? 'green' : e.kind === 'removed' ? 'bad' : '')}
        >
         {e.kind === 'added' ? 'Eklendi' : e.kind === 'removed' ? 'Silindi' : 'Değişti'}
        </span>
        <strong>{e.label}</strong>
       </div>
       {e.fields && (
        <table className="diff-fields">
         <tbody>
          {e.fields.map((f, n) => (
           <tr key={n}>
            <td>{f.field}</td>
            <td className="mono">{f.from}</td>
            <td className="mono">→ {f.to}</td>
           </tr>
          ))}
         </tbody>
        </table>
       )}
      </div>
     ))}
    </div>
    {diff.total > diff.entries.length && (
     <p className="muted small">İlk 100 fark gösteriliyor; toplam {diff.total} fark var.</p>
    )}
    <div className="modal-actions">
     <button type="button" className="btn" onClick={() => closeDiff()}>
      Kapat
     </button>
    </div>
   </div>
  </div>
 );
 // Modal: genel onay diyaloğu
 const confirmModal = confirmState && (
  <div className="modal-backdrop" onClick={() => closeConfirm()}>
   <div
    className="modal"
    ref={confirmBoxRef}
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    onClick={(e) => e.stopPropagation()}
    onKeyDown={onConfirmKey}
   >
    <div className="modal-heading">
     <h2 id="confirm-title">{confirmState.title}</h2>
     <button type="button" className="tool" onClick={() => closeConfirm()}>
      ×
     </button>
    </div>
    <p>{confirmState.text}</p>
    <div className="modal-actions">
     <button type="button" className="btn" onClick={() => closeConfirm()}>
      Vazgeç
     </button>
     <button
      type="button"
      ref={confirmBtnRef}
      className={'btn ' + (confirmState.danger ? 'danger' : 'primary')}
      onClick={() => {
       const fn = confirmState.onYes;
       closeConfirm();
       fn();
      }}
     >
      {confirmState.yesLabel || 'Onayla'}
     </button>
    </div>
   </div>
  </div>
 );
 // Modal: tanım ekle / düzenle formu
 const inspDirty = !!modal && modal.orig !== undefined && JSON.stringify(modal.data) !== modal.orig;
 function closeInspector() {
  if (inspDirty && !modal!.fresh) askConfirm('Kaydedilmemiş değişiklikler var', 'Panel kapatılırsa bu değişiklikler kaybolur.', () => setModal(null), true, 'Değişiklikleri at');
  else setModal(null);
 }
 const setInspData = (fn: (d: any) => any) => setModal((m) => (m ? { ...m, data: fn(m.data) } : m));
 const inspector = modal && (modal.kind === 'tag' || modal.kind === 'command') && (
  <>
   <div className="drawer-backdrop" onClick={closeInspector} />
   <aside className="drawer" role="dialog" aria-modal="true" aria-label={modal.kind === 'tag' ? 'Etiket' : 'Komut'} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closeInspector(); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (modal.fresh || inspDirty) void save(e.shiftKey && modal.fresh && modal.kind === 'tag'); } }}>
    <header className="drawer-head">
     <div><span className="eyebrow">{modal.kind === 'tag' ? (modal.fresh ? 'Yeni etiket' : 'Etiket') : modal.fresh ? 'Yeni komut' : 'Komut'}</span><h2 className={modal.kind === 'tag' ? 'mono' : ''}>{(modal.kind === 'tag' ? modal.data.code : modal.data.name) || '—'}</h2></div>
     <button type="button" className="drawer-close" aria-label="Kapat" onClick={closeInspector}><X size={18} /></button>
    </header>
    <form id="insp-form" className="drawer-body" onSubmit={(e) => { e.preventDefault(); void save(); }}>
     {modal.kind === 'tag'
      ? <TagInspector data={modal.data} setData={setInspData} fresh={modal.fresh} config={config} live={live} isS7={(id) => s7DeviceIds.has(id)} isAds={(id) => adsDeviceIds.has(id)} isOpc={(id) => opcDeviceIds.has(id)} isMqtt={(id) => mqttDeviceIds.has(id)} usage={modal.fresh ? null : inspRefs} onScreen={(id) => { setModal(null); onScreen(id); }} preview={<TagRegisterPreview tag={modal.data} />} />
      : <CommandInspector data={modal.data} setData={setInspData} fresh={modal.fresh} config={config} live={live} executions={allExecs.filter((e) => e.commandId === modal.data.id).slice(0, 8)} screens={commandScreens(modal.data.id)} onScreen={(id) => { setModal(null); onScreen(id); }} onStop={user.role === 'admin' || user.role === 'operator' ? stopScript : undefined} />}
    </form>
    <footer className="drawer-foot">
     {!modal.fresh && <button type="button" className="btn small ghost-danger" onClick={() => { const k = modal.kind, id = modal.data.id; if (k === 'tag') askDeleteTags([id]); else { setModal(null); void remove(k, id); } }}><Trash2 size={14} />Sil</button>}
     {modal.fresh && <button type="button" className="btn ghost" onClick={closeInspector}>Vazgeç</button>}
     <span className="drawer-dirty">{modal.fresh ? '' : inspDirty ? 'Kaydedilmemiş değişiklik' : 'Değişiklik yok'}</span>
     {!modal.fresh && <button type="button" className="btn ghost" onClick={closeInspector}>Vazgeç</button>}
     {modal.fresh && modal.kind === 'tag' && <button type="button" className="btn" disabled={busy} onClick={() => void save(true)} title="Ctrl+Shift+Enter">Ekle ve yenisi</button>}
     <button type="submit" form="insp-form" className="btn primary" disabled={busy || (!modal.fresh && !inspDirty)} title="Ctrl+Enter">{modal.fresh ? 'Ekle' : 'Kaydet'}<span className="kbd">Ctrl ⏎</span></button>
    </footer>
   </aside>
  </>
 );
 // TIA Portal PLC etiket tablosundan S7 etiketi aktarma (salt okuma).
 const tiaDialog = tiaOpen && writable && (
  <TiaImportDialog config={config} s7DeviceIds={s7DeviceIds} busy={busy} onClose={() => setTiaOpen(false)}
   onImport={(tags) => void run(async () => { await saveConfig({ ...config, tags: [...config.tags, ...tags] }); setTiaOpen(false); notify(tags.length + ' etiket TIA dosyasından eklendi. Sahaya göndermek için Haberleşmeye uygula.'); })} />
 );
 const importDialog = importOpen && writable && (
  <TagImportDialog config={config} busy={busy} deviceId={tagNav.dev} group={tagNav.grp || ''} onClose={() => setImportOpen(false)}
   onImport={(tags, withCommands) => void run(async () => {
    const cmds = withCommands ? missingCommands(tags, config.commands, (t) => 'cmd-' + t.id) : [];
    await saveConfig({ ...config, tags: [...config.tags, ...tags], commands: [...config.commands, ...cmds] });
    setImportOpen(false);
    notify(tags.length + ' etiket eklendi' + (cmds.length ? ', ' + cmds.length + ' komut oluşturuldu' : '') + '. Sahaya göndermek için Haberleşmeye uygula.');
   })} />
 );
 const tagDeleteDialog = delTags && (() => {
  const plan = deletePlan(delTags), one = plan.items.length === 1, kind = (g: string) => (g === 'screen' ? 'Ekran' : g === 'alarm' ? 'Alarm' : 'Komut');
  return (
   <div className="modal-backdrop" onClick={() => setDelTags(null)}>
    <div className="modal tag-del" role="alertdialog" aria-modal="true" aria-labelledby="tag-del-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') setDelTags(null); }}>
     <h2 id="tag-del-title">{one ? (plan.items[0]?.tag.code || 'Etiket') + ' silinsin mi?' : plan.items.length + ' etiket silinsin mi?'}</h2>
     {plan.blocked.length > 0 && <div className="tag-del-block"><b>{plan.blocked.map((x) => x.tag.code).join(', ')}</b> {plan.blocked.length === 1 ? 'kullanımda' : 'kullanımda'}; silinirse ekran nesneleri, alarmlar ya da scriptler bağsız kalır. {one ? 'Önce bağı kaldırın ya da "Nerede kullanılıyor?" panelinden bağları başka etikete taşıyın.' : 'Bunlar atlanacak.'}</div>}
     <ul className="tag-del-list">
      {plan.blocked.flatMap((x) => x.blockers.slice(0, 4).map((r, i) => <li key={x.id + i}><em>{kind(r.group)}</em><span><b className="mono">{x.tag.code}</b> · {r.text}</span></li>))}
      {plan.drop.map((c) => <li key={c.id} className="go"><em>Komut</em><span>{c.name} <small>· birlikte silinecek</small></span></li>)}
      {plan.fix.map((c) => <li key={c.id} className="go"><em>Komut</em><span>{c.name} <small>· izin koşulu kaldırılacak</small></span></li>)}
     </ul>
     {!plan.blocked.length && !plan.drop.length && !plan.fix.length && <p className="muted">Hiçbir ekranda, alarmda ya da komutta kullanılmıyor.</p>}
     {plan.ok.length > 0 && <p className="muted small">Silindikten sonra 8 saniye içinde geri alabilirsiniz. Sahaya "Haberleşmeye uygula" ile gider.</p>}
     <div className="modal-actions">
      {plan.ok.length ? <><button className="btn ghost" autoFocus onClick={() => setDelTags(null)}>Vazgeç</button><button className="btn danger" disabled={busy} onClick={doDeleteTags}><Trash2 size={14} />{one ? 'Sil' : plan.ok.length + ' etiketi sil'}</button></>
       : <><button className="btn" onClick={() => { const id = plan.blocked[0]?.id; setDelTags(null); if (id) setUsed(id); }}>Nerede kullanılıyor?</button><button className="btn primary" autoFocus onClick={() => setDelTags(null)}>Tamam</button></>}
     </div>
    </div>
   </div>
  );
 })();
 const undoBar = undo && <div className="undo-bar" role="status"><span>{undo.text}</span><button className="btn small" onClick={undoDelete}>Geri al</button><i aria-hidden="true" /></div>;
 const seriesDialog = series && writable && (
  <TagSeriesDialog config={config} busy={busy} isS7={symbolicDevice} onClose={() => setSeries(false)}
   template={(() => { const navDev = tagNav.dev && !symbolicDevice(tagNav.dev) ? tagNav.dev : '', pool = config.tags.filter((t) => !symbolicDevice(t.deviceId) && (!navDev || t.deviceId === navDev)), last = (pool.filter((t) => tagNav.grp === null || (t.group || '').trim() === tagNav.grp).at(-1) || pool.at(-1)) as Tag | undefined; return last ? { ...last, group: tagNav.grp ?? last.group ?? '' } : navDev ? ({ id: '', deviceId: navDev, code: 'M0', name: '', area: 'coil', address: 0, dataType: 'bool', access: 'readwrite', scale: 1, offset: 0, min: 0, max: 65535, unit: '', wordOrder: 'big', byteOrder: 'big', bit: null, verifyTolerance: null, history: false, historyDeadband: 0, historyMaxGapMs: 60000, description: '', group: tagNav.grp || '' } as Tag) : undefined; })() || ({ id: '', deviceId: config.devices.find((d) => !symbolicDevice(d.id))?.id || '', code: 'M0', name: '', area: 'coil', address: 0, dataType: 'bool', access: 'readwrite', scale: 1, offset: 0, min: 0, max: 65535, unit: '', wordOrder: 'big', byteOrder: 'big', bit: null, verifyTolerance: null, history: false, historyDeadband: 0, historyMaxGapMs: 60000, description: '' } as Tag)}
   onCreate={(tags, withCommands) => void run(async () => {
    const cmds = withCommands ? missingCommands(tags, config.commands, (t) => 'cmd-' + t.id) : [];
    await saveConfig({ ...config, tags: [...config.tags, ...tags.map((t) => ({ ...t, description: '' }))], commands: [...config.commands, ...cmds] });
    setSeries(false);
   })} />
 );
 const editModal = modal && modal.kind !== 'tag' && modal.kind !== 'command' && (
  <div className="modal-backdrop">
   <div className="modal">
    <div className="modal-heading">
     <h2>{modal.fresh ? 'Yeni tanım' : 'Tanımı düzenle'}</h2>
     <button className="tool" onClick={() => setModal(null)}>
      ×
     </button>
    </div>
    <form
     onSubmit={(e) => {
      e.preventDefault();
      if (modal.kind === 'user')
       void run(async () => {
        await api('/users', 'POST', modal.data);
        setModal(null);
        setUsers(await api('/users'));
       });
      else void save();
     }}
    >
     {modal.kind === 'user' ? (
      <>
       <Field label="Kullanıcı adı">
        <input
         required
         value={modal.data.username}
         onChange={(e) => patch('username', e.target.value)}
        />
       </Field>
       <Field label="Parola (en az 12 karakter)">
        <input
         type="password"
         required
         minLength={12}
         value={modal.data.password}
         onChange={(e) => patch('password', e.target.value)}
        />
       </Field>
       <Field label="Rol">
        <select value={modal.data.role} onChange={(e) => patch('role', e.target.value)}>
         {['viewer', 'operator', 'designer', 'admin'].map((r) => (
          <option key={r}>{r}</option>
         ))}
        </select>
       </Field>
      </>
     ) : (
      <>
       <Field label="Ad">
        <input required value={modal.data.name} onChange={(e) => patch('name', e.target.value)} />
       </Field>
       {modal.kind === 'connection' && (
        <>
         <ConnectionFields data={modal.data} patch={patch} setData={(fn) => setModal((m) => ({ ...m!, data: fn(m!.data) }))} savedId={!modal.fresh && config.connections.some((c) => c.id === modal.data.id) ? modal.data.id : null} admin={user.role === 'admin'} tags={config.tags.map((t) => ({ id: t.id, code: t.code }))} />
        </>
       )}
       {modal.kind === 'device' && (
        <>
         <Field label="Cihaz kodu">
          <input value={modal.data.code} onChange={(e) => patch('code', e.target.value)} />
         </Field>
         <Field label="Bağlantı">
          <select
           value={modal.data.connectionId}
           onChange={(e) => patch('connectionId', e.target.value)}
          >
           {config.connections.map((c) => (
            <option key={c.id} value={c.id}>
             {c.name} · {connectionAddress(c)}
            </option>
           ))}
          </select>
         </Field>
         {!isSymbolicProtocol(config.connections.find((c) => c.id === modal.data.connectionId)?.protocol) && (
          <Field label="Adres biçimi">
           <select value={modal.data.addressFormat || 'modbus'} onChange={(e) => patch('addressFormat', e.target.value)}>
            <option value="modbus">Genel Modbus — alan + adres ya da 40001</option>
            <option value="delta">Delta DVP — M0, Y0, X0, D100 yazılır</option>
           </select>
          </Field>
         )}
         <div className="field-grid">
          {[
           ['slaveId', 'Slave ID'],
           ['pollMs', 'Tarama (ms)'],
           ['staleMs', 'Güncellik (ms)'],
          ]
           .filter(
            ([k]) =>
             k !== 'slaveId' ||
             !isSymbolicProtocol(config.connections.find((c) => c.id === modal.data.connectionId)?.protocol),
           )
           .map(([k, l]) => (
           <Field key={k} label={l}>
            <input
             type="number"
             value={modal.data[k]}
             onChange={(e) => patch(k, Number(e.target.value))}
            />
           </Field>
          ))}
         </div>
         <label className="check">
          <input
           type="checkbox"
           checked={modal.data.enabled}
           onChange={(e) => patch('enabled', e.target.checked)}
          />
          Cihaz etkin
         </label>
         <Field label="Açıklama">
          <textarea
           value={modal.data.description}
           onChange={(e) => patch('description', e.target.value)}
          />
         </Field>
        </>
       )}
       {modal.kind === 'alarm' && (
        <>
         <Field label="Etiket">
          <select
           value={modal.data.tagId}
           onChange={(e) => {
            const t = config.tags.find((x) => x.id === e.target.value);
            setModal((m) => ({
             ...m!,
             data: {
              ...m!.data,
              tagId: e.target.value,
              kind:
               t?.dataType === 'bool' && ['high', 'low'].includes(m!.data.kind)
                ? 'bool'
                : m!.data.kind,
             },
            }));
           }}
          >
           {config.tags.map((t) => (
            <option key={t.id} value={t.id}>
             {config.devices.find((d) => d.id === t.deviceId)?.code}.{t.code} · {t.dataType}
            </option>
           ))}
          </select>
         </Field>
         <Field label="Alarm koşulu">
          <select value={modal.data.kind} onChange={(e) => patch('kind', e.target.value)}>
           {Object.entries(alarmKindLabels)
            .filter(([k]) =>
             config.tags.find((t) => t.id === modal.data.tagId)?.dataType === 'bool'
              ? k !== 'high' && k !== 'low'
              : k !== 'bool',
            )
            .map(([k, l]) => (
             <option key={k} value={k}>
              {l}
             </option>
            ))}
          </select>
         </Field>
         {['high', 'low'].includes(modal.data.kind) && (
          <div className="field-grid">
           <Field label="Limit">
            <input
             type="number"
             step="any"
             value={modal.data.limit}
             onChange={(e) => patch('limit', Number(e.target.value))}
            />
           </Field>
           <Field label="Ölü bant">
            <input
             type="number"
             step="any"
             min="0"
             value={modal.data.deadband}
             onChange={(e) => patch('deadband', Number(e.target.value))}
            />
           </Field>
          </div>
         )}
         {modal.data.kind === 'bool' && (
          <Field label="Alarm veren sinyal">
           <select
            value={String(modal.data.expected)}
            onChange={(e) => patch('expected', e.target.value === 'true')}
           >
            <option value="true">1 · Açık</option>
            <option value="false">0 · Kapalı</option>
           </select>
          </Field>
         )}
         <div className="field-grid">
          <Field label="Gecikme (ms)">
           <input
            type="number"
            min="0"
            step="100"
            value={modal.data.delayMs}
            onChange={(e) => patch('delayMs', Number(e.target.value))}
           />
          </Field>
          <Field label="Önem">
           <select value={modal.data.severity} onChange={(e) => patch('severity', e.target.value)}>
            {Object.entries(severityLabels).map(([k, l]) => (
             <option key={k} value={k}>
              {l}
             </option>
            ))}
           </select>
          </Field>
         </div>
         <Field label="Operatör mesajı">
          <input
           value={modal.data.message}
           placeholder="Boşsa otomatik metin kullanılır"
           onChange={(e) => patch('message', e.target.value)}
          />
         </Field>
         <label className="check">
          <input
           type="checkbox"
           checked={modal.data.enabled}
           onChange={(e) => patch('enabled', e.target.checked)}
          />
          Kural etkin
         </label>
         <label className="check">
          <input
           type="checkbox"
           checked={modal.data.popup}
           onChange={(e) => patch('popup', e.target.checked)}
          />
          Alarm olunca açılır pencere göster
         </label>
         <label className="check">
          <input
           type="checkbox"
           checked={modal.data.ackRequired !== false}
           onChange={(e) => patch('ackRequired', e.target.checked)}
          />
          Operatör onayı (ACK) gerekir — kapalıysa bilgi olayıdır
         </label>
         <label className="check">
          <input
           type="checkbox"
           checked={!!modal.data.latch}
           onChange={(e) => patch('latch', e.target.checked)}
          />
          Latch: koşul normale dönse de ACK'e kadar açık kalır
         </label>
         <h3>Rasyonalizasyon</h3>
         <div className="field-grid">
          <Field label="Alan">
           <input
            value={modal.data.area || ''}
            placeholder="Örn. Dolum hattı"
            onChange={(e) => patch('area', e.target.value)}
           />
          </Field>
          <Field label="Ekipman">
           <input
            value={modal.data.equipment || ''}
            placeholder="Örn. P-101"
            onChange={(e) => patch('equipment', e.target.value)}
           />
          </Field>
         </div>
         <Field label="Neden oluşur">
          <input value={modal.data.cause || ''} onChange={(e) => patch('cause', e.target.value)} />
         </Field>
         <Field label="Sonucu ne olur">
          <input
           value={modal.data.consequence || ''}
           onChange={(e) => patch('consequence', e.target.value)}
          />
         </Field>
         <Field label="Beklenen aksiyon">
          <input
           value={modal.data.action || ''}
           onChange={(e) => patch('action', e.target.value)}
          />
         </Field>
         <Field label="Müdahale süresi (dakika)">
          <input
           type="number"
           min="0"
           value={modal.data.responseMinutes || 0}
           onChange={(e) => patch('responseMinutes', Number(e.target.value) || 0)}
          />
         </Field>
         <Field label="Değişiklik gerekçesi">
          <input
           value={ruleReason}
           placeholder="Neden değişiyor? (denetim kaydına yazılır)"
           onChange={(e) => setRuleReason(e.target.value)}
          />
         </Field>
        </>
       )}
      </>
     )}
     <div className="modal-actions">
      <button type="button" className="btn" onClick={() => setModal(null)}>
       Vazgeç
      </button>
      <button className="btn primary" disabled={busy}>
       Kaydet
      </button>
     </div>
    </form>
   </div>
  </div>
 );
 return (
  <div className="management">
   {title && <div className="page-title">
    <div>
     <span className="eyebrow">{page === 'alarms' || page === 'audit' ? 'İzleme' : page === 'settings' ? 'Proje' : 'Mühendislik'}</span>
     <div className="title-row"><h1>{title}</h1><InfoTip>
      {page === 'devices'
       ? 'Bağlantıları tanımlayın, cihazların haberleşme durumunu izleyin.'
       : page === 'tags'
         ? 'Saha adreslerini ekran nesnelerine kalıcı etiketlerle bağlayın.'
         : page === 'commands'
           ? 'Yazma hedefini ve doğrulanacak geri bildirimi tanımlayın.'
           : page === 'alarms'
             ? 'Limit aşımı ve dijital durumlar için alarm kuralı tanımlayın; aktif alarmlar operatöre açılır pencerede gösterilir.'
             : page === 'audit'
               ? 'Komutların ve yapılandırma değişikliklerinin izini sürün.'
               : 'Ekran sürümleri, kullanıcılar ve proje yedekleri.'}
     </InfoTip></div>
    </div>
    <div className="head-actions">
    {page === 'devices' && writable && <button className="btn" onClick={() => setScanOpen(true)}><Radar size={16} />Ağ taraması</button>}
    {['devices', 'tags', 'commands', 'alarms'].includes(page) && writable && (
     <button
      className="btn primary"
      onClick={() => {
       if (page === 'alarms') switchAlarmTab('rules');
       fresh(
        page === 'devices'
         ? 'device'
         : page === 'tags'
           ? 'tag'
           : page === 'alarms'
             ? 'alarm'
             : 'command',
       );
      }}
     >
      <Plus size={17} />
      {page === 'devices'
       ? 'Cihaz ekle'
       : page === 'tags'
         ? 'Etiket ekle'
         : page === 'alarms'
           ? 'Alarm kuralı ekle'
           : 'Komut ekle'}
     </button>
    )}
    </div>
   </div>}
   {devicesPage}
   {tagsPage}
   {commandsPage}
   {alarmsPage}
   {recipesPage}
   {reportsPage}
   {auditPageView}
   {settingsPage}
   {permModal}
   {usedModal}
   {diffModal}
   {confirmModal}
   {editModal}
   {inspector}
   {seriesDialog}
   {importDialog}
   {tagDeleteDialog}
   {undoBar}
   {tiaDialog}
   {scanOpen && <NetScanDialog onClose={() => setScanOpen(false)} />}
  </div>
 );
}
/** Etiket tanımında ham register değerleri ile mühendislik değeri arasındaki dönüşümü canlı önizler. */
function TagRegisterPreview({ tag }: { tag: Tag }) {
 const n = registerCount(tag.dataType);
 const [raw, setRaw] = useState('0');
 const [eng, setEng] = useState('0');
 let decoded = '',
  decodeError = '';
 try {
  decoded =
   String(
    decodeRegisters(
     raw.split(',').map((s) => Number(s.trim()) || 0),
     tag,
    ),
   ) + (tag.unit ? ' ' + tag.unit : '');
 } catch (e) {
  decodeError = (e as Error).message;
 }
 let encoded = '',
  encodeError = '';
 try {
  encoded = encodeValue(Number(eng), tag).join(', ');
 } catch (e) {
  encodeError = (e as Error).message;
 }
 return (
  <div className="modbus-preview">
   <div className="modbus-preview-head">HAM ↔ MÜHENDİSLİK DEĞERİ ÖNİZLEME</div>
   <div className="modbus-preview-row">
    <span>
     {'Ham register' +
      (n > 1 ? 'ler (' + n + ' adet, virgülle ayrılmış)' : ' (0-65535)') +
      ' → mühendislik değeri'}
    </span>
    <input
     value={raw}
     onChange={(e) => setRaw(e.target.value)}
     placeholder={n > 1 ? 'ör. 0, 16960' : 'ör. 1234'}
    />
    <output className={decodeError ? 'bad' : ''}>{decodeError || decoded}</output>
   </div>
   <div className="modbus-preview-row">
    <span>Mühendislik değeri → ham register{n > 1 ? 'ler' : ''}</span>
    <input value={eng} onChange={(e) => setEng(e.target.value)} />
    <output className={encodeError ? 'bad' : ''}>{encodeError || encoded}</output>
   </div>
  </div>
 );
}
// statusLabel statusModel.ts'e taşındı (main.tsx Management'ı tembel yükleyebilsin).
export {statusLabel} from './statusModel';
