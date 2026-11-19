/* Etiket ve komut yönetimi için saf yardımcılar (test edilebilir, React'siz). */
import { registerCount, type Config, type Sample, type Tag } from '../../../packages/contracts/model';

type Cmd = Config['commands'][number];

export const AREA_INFO: Record<Tag['area'], { short: string; label: string; hint: string; base: number; writable: boolean; bool: boolean }> = {
 coil: { short: 'C', label: 'Coil (0x)', hint: 'Dijital çıkış / dahili bit — okunur ve yazılır. Delta: M, Y, S bitleri.', base: 1, writable: true, bool: true },
 'discrete-input': { short: 'DI', label: 'Dijital giriş (1x)', hint: 'Yalnız okunur dijital giriş. Delta: X girişleri.', base: 10001, writable: false, bool: true },
 'input-register': { short: 'IR', label: 'Input register (3x)', hint: 'Yalnız okunur ölçüm register\'ı. Analizörler çoğunlukla burada.', base: 30001, writable: false, bool: false },
 'holding-register': { short: 'HR', label: 'Holding register (4x)', hint: 'Okunur ve yazılır register. Delta: D register\'ları.', base: 40001, writable: true, bool: false },
};
export const TYPE_INFO: Record<Tag['dataType'], string> = {
 bool: 'Dijital (bit)', uint16: 'Tam sayı 16 bit, işaretsiz', int16: 'Tam sayı 16 bit, işaretli', uint32: 'Tam sayı 32 bit, işaretsiz', int32: 'Tam sayı 32 bit, işaretli', float32: 'Ondalıklı 32 bit (float)',
};

/** Kılavuzlardaki 1 tabanlı Modbus referansı (40001 gibi). 9999'u aşan adreslerde 6 hane. */
export function modbusRef(area: Tag['area'], address: number) {
 const base = AREA_INFO[area].base, six = address + 1 > 9999;
 // Coil referansı sıfırla başlar (00001); hane sayısı sabit kalsın diye doldurulur.
 return String(six ? (base - 1) * 10 + 1 + address : base + address).padStart(six ? 6 : 5, '0');
}
/** Kılavuz referansını (40001, 400001, 30053…) alan + 0 tabanlı adrese çevirir; tanınmazsa null. */
export function parseModbusRef(ref: string): { area: Tag['area']; address: number } | null {
 const s = ref.trim();
 if (!/^\d{5,6}$/.test(s)) return null;
 const lead = s[0], n = Number(s.slice(1)) - 1;
 const area = ({ '0': 'coil', '1': 'discrete-input', '3': 'input-register', '4': 'holding-register' } as Record<string, Tag['area']>)[lead];
 return area && n >= 0 && n <= 65535 ? { area, address: n } : null;
}

/** Bir sonraki boş adres: aynı cihaz + alanda kullanılan en yüksek adresin hemen sonrası. */
export function nextFreeAddress(tags: Tag[], deviceId: string, area: Tag['area']) {
 let next = 0;
 for (const t of tags) if (t.deviceId === deviceId && t.area === area) next = Math.max(next, t.address + (AREA_INFO[area].bool || t.bit !== null ? 1 : registerCount(t.dataType)));
 return next;
}

/** Koddaki son sayıyı artırarak benzersiz kod: M0 → M1, P_TOT → P_TOT_2. */
export function nextCode(code: string, taken: Set<string>) {
 const m = /^(.*?)(\d+)$/.exec(code);
 let i = m ? Number(m[2]) + 1 : 2;
 const make = (n: number) => (m ? m[1] + n : code + '_' + n);
 while (taken.has(make(i))) i++;
 return make(i);
}

export type SeriesSpec = { count: number; codePrefix: string; startIndex: number; namePrefix: string; address: number; step: number };
/** Ardışık adresli etiket serisi. Kod/ad önek + sıra no; adres her adımda `step` kadar artar. */
export function seriesTags(base: Tag, spec: SeriesSpec, newId: () => string): Tag[] {
 const out: Tag[] = [];
 for (let i = 0; i < spec.count; i++) {
  const n = spec.startIndex + i;
  out.push({ ...base, id: newId(), code: spec.codePrefix + n, name: (spec.namePrefix || spec.codePrefix) + n, address: spec.address + i * spec.step });
 }
 return out;
}
/** Serideki çakışmalar: aynı kod ya da aynı cihaz+alan+adres (bit etiketleri hariç). */
export function seriesConflicts(existing: Tag[], series: Tag[]) {
 const codes = new Set(existing.map((t) => t.code)), addr = new Set(existing.filter((t) => t.bit === null).map((t) => t.deviceId + '|' + t.area + '|' + t.address));
 return series.filter((t) => codes.has(t.code) || addr.has(t.deviceId + '|' + t.area + '|' + t.address)).map((t) => t.code);
}

/** Canlı değerin operatöre gösterilen hali; kalite iyi değilse değer yerine durum. */
export function sampleText(tag: Pick<Tag, 'unit' | 'dataType'>, s: Sample | undefined): { text: string; state: 'good' | 'stale' | 'bad' | 'never'; value: string } {
 const state = !s || s.quality === 'unknown' ? 'never' : s.quality === 'good' ? 'good' : s.quality === 'bad' ? 'bad' : 'stale';
 const v = s?.value;
 const value = typeof v === 'boolean' ? (v ? 'AÇIK' : 'KAPALI') : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('tr-TR') : v.toLocaleString('tr-TR', { maximumFractionDigits: 3 })) + (tag.unit ? ' ' + tag.unit : '') : '—';
 const text = state === 'good' ? value : state === 'never' ? 'Hiç okunmadı' : state === 'bad' ? 'Hata' : 'Bayat';
 return { text, state, value };
}

const tagRef = (id: string, config: Config) => {
 const t = config.tags.find((x) => x.id === id);
 if (!t) return '?';
 const d = config.devices.find((x) => x.id === t.deviceId);
 return (d ? d.code + '.' : '') + t.code;
};
/** Komutun ne yaptığını tek cümleyle anlatır. */
export function commandSentence(c: Pick<Cmd, 'tagIds' | 'feedbackTagIds' | 'timeoutMs'> & { kind?: string; maxRunMs?: number }, config: Config) {
 if (c.kind === 'script') return 'Script · ' + (c.tagIds.length ? c.tagIds.map((id) => tagRef(id, config)).join(', ') + ' yazar' : 'yazma yok') + ' · en çok ' + Math.round((c.maxRunMs ?? 60000) / 1000) + ' sn';
 const w = c.tagIds.map((id) => tagRef(id, config)).join(' → ');
 const fb = c.feedbackTagIds.filter(Boolean).map((id) => tagRef(id, config));
 return w + ' yazar' + (fb.length ? ' · ' + fb.join(', ') + ' ile doğrular · ' + Math.round(c.timeoutMs / 100) / 10 + ' sn bekler' : ' · geri okuma yok');
}

/** Yazılabilir etiketler için eksik komutlar ("X kontrol" kalıbıyla). */
export function missingCommands(tags: Tag[], commands: Cmd[], newId: (t: Tag) => string): Cmd[] {
 const covered = new Set(commands.flatMap((c) => c.tagIds));
 return tags.filter((t) => t.access === 'readwrite' && !covered.has(t.id)).map((t) => ({
  id: newId(t), name: t.name + ' kontrol', tagIds: [t.id], feedbackTagIds: [t.id], timeoutMs: 7000, permissives: [], risk: 'normal', approval: 'none', scope: '', group: (t.group || '').trim(),
 }) as unknown as Cmd);
}

/** Cihazın bölümleri (etiket `group` alanı), ilk görülme sırasıyla; `extra` henüz etiketi olmayan yeni bölümler. Bölümsüz etiketler ayrı sayılır. */
export function tagGroups(tags: Pick<Tag, 'deviceId' | 'group'>[], deviceId: string, extra: string[] = []) {
 const m = new Map<string, number>();
 for (const t of tags) if (t.deviceId === deviceId) { const g = (t.group || '').trim(); m.set(g, (m.get(g) || 0) + 1); }
 for (const g of extra) if (g.trim() && !m.has(g.trim())) m.set(g.trim(), 0);
 return { named: [...m.entries()].filter(([g]) => g !== ''), ungrouped: m.get('') || 0 };
}
