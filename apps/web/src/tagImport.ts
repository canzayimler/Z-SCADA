/* Toplu etiket içe aktarma: Excel'den yapıştırılan tablo (sekme ayraçlı) ya da CSV.
   Saf modül (React'siz, test edilebilir). Her satır ayrı denetlenir; hatalı satır bütün
   aktarımı durdurmaz, önizlemede satır numarasıyla gösterilir ve atlanır. Son söz yine
   sunucudaki validateConfig'tedir — buradaki denetim kullanıcıya erken ve satır bazlı
   cevap vermek içindir. */
import { addressFormatOf, connectionProtocol, isSymbolicProtocol, isReadOnlyProtocol, symbolicAddressField, parseAdsSymbol, parseS7Address, parseMqttTopic, mqttPathSteps, parseSnmpOid, parseHttpPath, checkSqlQuery, checkSqlColumn, parseBacnetObject, parseCipTag, bacnetValueKind, BACNET_PROPERTY_NAMES, CIP_DATATYPE, type BacnetProperty, protocolLabels, registerCount, tagSchema, type Config, type Tag } from '../../../packages/contracts/model';
import { AREA_INFO, parseModbusRef } from './cfgModel';

type Area = Tag['area'];
type DataType = Tag['dataType'];

/** Ayraç: ilk dolu satırda sekme varsa sekme (Excel), yoksa noktalı virgül (TR Excel CSV) ya da virgül. */
export function detectDelimiter(text: string) {
 const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
 if (first.includes('\t')) return '\t';
 return (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
}

/** Tırnaklı hücreleri (içinde ayraç / satır sonu / "" olan) doğru bölen ayrıştırıcı. */
export function parseTable(text: string, delimiter = detectDelimiter(text)) {
 const rows: string[][] = [];
 let row: string[] = [], cell = '', quoted = false;
 const src = text.replace(/^﻿/, '');
 for (let i = 0; i < src.length; i++) {
  const c = src[i];
  if (quoted) {
   if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
   else if (c === '"') quoted = false;
   else cell += c;
  } else if (c === '"' && cell.trim() === '') { quoted = true; cell = ''; }
  else if (c === delimiter) { row.push(cell); cell = ''; }
  else if (c === '\n' || c === '\r') {
   if (c === '\r' && src[i + 1] === '\n') i++;
   row.push(cell); rows.push(row); row = []; cell = '';
  } else cell += c;
 }
 if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
 return rows.map((r) => r.map((x) => x.trim()));
}

/* Başlık adları: İngilizce alan adı (CSV şablonu) ya da Türkçe karşılığı. */
const ALIASES: Record<string, string[]> = {
 device: ['device', 'cihaz'],
 code: ['code', 'kod', 'etiket', 'etiket kodu', 'tag'],
 name: ['name', 'ad', 'isim', 'etiket adı', 'etiket adi'],
 group: ['group', 'grup', 'bölüm', 'bolum'],
 address: ['address', 'adres', 'addr'],
 area: ['area', 'alan'],
 dataType: ['datatype', 'data type', 'tip', 'veri tipi', 'type'],
 access: ['access', 'erişim', 'erisim'],
 unit: ['unit', 'birim'],
 scale: ['scale', 'ölçek', 'olcek'],
 offset: ['offset', 'kaydırma', 'kaydirma'],
 min: ['min', 'alt sınır', 'alt sinir'],
 max: ['max', 'üst sınır', 'ust sinir'],
 wordOrder: ['wordorder'],
 byteOrder: ['byteorder'],
 bit: ['bit'],
 verifyTolerance: ['verifytolerance', 'tolerans'],
 description: ['description', 'açıklama', 'aciklama', 'not'],
 s7Address: ['s7address', 's7 adresi'],
 adsSymbol: ['adssymbol', 'ads sembolü', 'sembol'],
 nodeId: ['nodeid', 'node id'],
 mqttTopic: ['mqtttopic', 'mqtt konusu', 'konu', 'topic'],
 mqttJsonPath: ['mqttjsonpath', 'json yolu', 'jsonpath'],
 mqttTimestampPath: ['mqtttimestamppath', 'zaman damgası yolu', 'zaman damgasi yolu'],
 snmpOid: ['snmpoid', 'snmp oid', 'oid'],
 httpPath: ['httppath', 'http yolu', 'yol', 'path'],
 httpJsonPath: ['httpjsonpath', 'http json yolu'],
 httpTimestampPath: ['httptimestamppath', 'http zaman damgası yolu', 'http zaman damgasi yolu'],
 sqlQuery: ['sqlquery', 'sql sorgusu', 'sorgu', 'query'],
 sqlColumn: ['sqlcolumn', 'sql sütunu', 'sql sutunu', 'sütun', 'sutun', 'column'],
 bacnetObjectType: ['bacnetobject', 'bacnetobjecttype', 'bacnet nesnesi', 'nesne', 'object'],
 bacnetProperty: ['bacnetproperty', 'bacnet özelliği', 'bacnet ozelligi', 'özellik', 'ozellik', 'property'],
 cipTag: ['ciptag', 'cip etiketi', 'cip etiket adı', 'cip etiket adi', 'tag name', 'tagname'],
};
const norm = (s: string) => s.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
const FIELD_OF = new Map<string, string>(Object.entries(ALIASES).flatMap(([f, list]) => list.map((a) => [norm(a), f] as [string, string])));
/** Başlık satırı yoksa sütun sırası (yapıştırmada en sık kullanılan). */
export const POSITIONAL = ['address', 'name', 'dataType', 'access', 'unit', 'description'] as const;

export function headerFields(row: string[]) {
 const fields = row.map((h) => FIELD_OF.get(norm(h)) || '');
 // En az iki tanınan sütun adı varsa başlık satırıdır; tek tanınan ad veri de olabilir ("M0").
 return fields.filter(Boolean).length >= 2 ? fields : null;
}

/* Delta DVP cihaz adresleri → Modbus. X ve Y sekizlik numaralanır (Y7'den sonra Y10).
   T ve C hem bit hem register olduğundan belirsizdir; onlar için Modbus referansı yazılmalı. */
export function parseDeltaAddress(s: string): { area: Area; address: number; dataType: DataType } | null {
 const m = /^([XYMSD])(\d{1,5})$/i.exec(s.trim());
 if (!m) return null;
 const kind = m[1].toUpperCase(), digits = m[2];
 if ((kind === 'X' || kind === 'Y') && /[89]/.test(digits)) return null;
 const n = kind === 'X' || kind === 'Y' ? parseInt(digits, 8) : Number(digits);
 if (kind === 'X') return n <= 0o377 ? { area: 'discrete-input', address: 1024 + n, dataType: 'bool' } : null;
 if (kind === 'Y') return n <= 0o377 ? { area: 'coil', address: 1280 + n, dataType: 'bool' } : null;
 if (kind === 'S') return n <= 1023 ? { area: 'coil', address: n, dataType: 'bool' } : null;
 if (kind === 'M') return n <= 1535 ? { area: 'coil', address: 2048 + n, dataType: 'bool' } : n <= 4095 ? { area: 'coil', address: 45056 + n - 1536, dataType: 'bool' } : null;
 return n <= 4095 ? { area: 'holding-register', address: 4096 + n, dataType: 'int16' } : n <= 11999 ? { area: 'holding-register', address: 36864 + n - 4096, dataType: 'int16' } : null;
}

/** Modbus adresinden Delta adı (düzenlemede adres kutusunu doldurmak için): C 2048 → M0, HR 4196 → D100. Karşılığı yoksa null. */
export function toDeltaName(area: Area, address: number): string | null {
 const oct = (n: number) => n.toString(8);
 if (area === 'discrete-input') return address >= 1024 && address <= 1024 + 0o377 ? 'X' + oct(address - 1024) : null;
 if (area === 'coil') {
  if (address <= 1023) return 'S' + address;
  if (address >= 1280 && address <= 1280 + 0o377) return 'Y' + oct(address - 1280);
  if (address >= 2048 && address <= 3583) return 'M' + (address - 2048);
  if (address >= 45056 && address <= 45056 + 4095 - 1536) return 'M' + (address - 45056 + 1536);
  return null;
 }
 if (area === 'holding-register') {
  if (address >= 4096 && address <= 8191) return 'D' + (address - 4096);
  if (address >= 36864 && address <= 36864 + 11999 - 4096) return 'D' + (address - 36864 + 4096);
 }
 return null;
}

/** Delta cihazında sıradaki etiket: kod ve adres aynı Delta adından türer (M0 → C 2048, Y7 → Y10).
 * prev yoksa M0'dan başlar; alınmış kod ya da bu cihazda dolu adres atlanır. prev'in kodu
 * adresiyle uyuşan bir Delta adı değilse ya da aralık biterse null — çağıran eski yola döner. */
export function nextDeltaSlot(tags: Tag[], deviceId: string, prev: Pick<Tag, 'code' | 'area' | 'address' | 'dataType'> | null, taken: Set<string>): { code: string; area: Area; address: number; dataType: DataType } | null {
 let kind = 'M', n = 0, dataType: DataType | null = null;
 if (prev) {
  const code = prev.code.trim().toUpperCase(), m = /^([XYMSD])(\d{1,5})$/.exec(code);
  if (!m || toDeltaName(prev.area, prev.address) !== code) return null;
  kind = m[1];
  dataType = prev.dataType;
  n = (kind === 'X' || kind === 'Y' ? parseInt(m[2], 8) : Number(m[2])) + (kind === 'D' ? registerCount(prev.dataType) : 1);
 }
 const width = (t: Pick<Tag, 'area' | 'dataType'>) => (AREA_INFO[t.area].bool ? 1 : registerCount(t.dataType));
 for (; ; n++) {
  const code = kind + (kind === 'X' || kind === 'Y' ? n.toString(8) : String(n)), p = parseDeltaAddress(code);
  if (!p) return null;
  const type = dataType || p.dataType, w = width({ area: p.area, dataType: type });
  const busy = tags.some((t) => t.deviceId === deviceId && t.area === p.area && p.address < t.address + width(t) && t.address < p.address + w);
  if (!taken.has(code) && !busy) return { code, area: p.area, address: p.address, dataType: type };
 }
}

const SHORT: Record<string, Area> = { c: 'coil', coil: 'coil', di: 'discrete-input', ir: 'input-register', hr: 'holding-register' };
const AREA_WORDS: Record<string, Area> = { coil: 'coil', 'discrete-input': 'discrete-input', 'input-register': 'input-register', 'holding-register': 'holding-register', ...SHORT };

/** Modbus adres hücresi: Delta (M0, D100) · kılavuz referansı (40001) · kısa biçim (HR 100, C 2048.3) · düz sayı (alan sütunuyla). */
export function parseModbusCell(cell: string, areaHint?: Area, delta = true): { area: Area; address: number; bit: number | null; dataType?: DataType; delta?: boolean } | null {
 const s = cell.trim();
 if (!s) return null;
 const d = delta ? parseDeltaAddress(s) : null;
 if (d) return { area: d.area, address: d.address, bit: null, dataType: d.dataType, delta: true };
 const short = /^(C|COIL|DI|IR|HR)\s*[: ]?\s*(\d{1,5})(?:\.(\d{1,2}))?$/i.exec(s);
 if (short) return { area: SHORT[short[1].toLowerCase()], address: Number(short[2]), bit: short[3] !== undefined ? Number(short[3]) : null };
 if (/^\d{5,6}$/.test(s) && !areaHint) { const r = parseModbusRef(s); if (r) return { ...r, bit: null }; }
 const plain = /^(\d{1,5})(?:\.(\d{1,2}))?$/.exec(s);
 if (plain && areaHint) return { area: areaHint, address: Number(plain[1]), bit: plain[2] !== undefined ? Number(plain[2]) : null };
 return null;
}

function parseAccess(v: string): Tag['access'] | null {
 const s = norm(v).replace(/\s/g, '');
 if (['read', 'r', 'ro', 'oku', 'okuma', 'saltokuma', 'saltoku'].includes(s)) return 'read';
 if (['readwrite', 'rw', 'w', 'write', 'okuyaz', 'oku/yaz', 'yaz', 'okuma/yazma'].includes(s)) return 'readwrite';
 return null;
}
const TYPES: DataType[] = ['bool', 'uint16', 'int16', 'uint32', 'int32', 'float32'];
const TYPE_WORDS: Record<string, DataType> = { bit: 'bool', boolean: 'bool', bool: 'bool', word: 'uint16', int: 'int16', dint: 'int32', udint: 'uint32', dword: 'uint32', real: 'float32', float: 'float32' };
function parseType(v: string): DataType | null {
 const s = norm(v);
 return (TYPES as string[]).includes(s) ? (s as DataType) : TYPE_WORDS[s] || null;
}
const num = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : Number(v.replace(',', '.')));

export type ImportDefaults = { deviceId: string; group: string; access: Tag['access'] };
export type ImportRow = { line: number; cells: string[]; tag: Tag | null; errors: string[]; warnings: string[] };

/**
 * Tabloyu satır satır etikete çevirir. Kabul edilen satırlar sonrakilerin kod ve adres
 * çakışma denetimine katılır, böylece aynı yapıştırmada iki kez yazılan adres de yakalanır.
 */
export function importTags(text: string, config: Pick<Config, 'connections' | 'devices' | 'tags'>, defaults: ImportDefaults, newId: () => string): { rows: ImportRow[]; header: boolean; fields: string[] } {
 const table = parseTable(text).map((cells, i) => ({ cells, line: i + 1 })).filter((r) => r.cells.some((c) => c !== ''));
 if (!table.length) return { rows: [], header: false, fields: [] };
 const hdr = headerFields(table[0].cells);
 const fields = hdr || [...POSITIONAL];
 const body = hdr ? table.slice(1) : table;
 const codes = new Set(config.tags.map((t) => t.deviceId + ':' + t.code));
 const ranges = config.tags.filter((t) => !symbolic(config, t.deviceId)).map((t) => ({ deviceId: t.deviceId, area: t.area, start: t.address, end: t.address + (t.bit !== null || AREA_INFO[t.area].bool ? 0 : registerCount(t.dataType) - 1), bit: t.bit, code: t.code }));
 const rows: ImportRow[] = [];
 for (const { cells, line } of body) {
  const get = (f: string) => { const i = fields.indexOf(f); return i >= 0 ? (cells[i] ?? '').trim() : ''; };
  const errors: string[] = [], warnings: string[] = [];
  const devCell = get('device');
  const dev = devCell ? config.devices.find((d) => norm(d.code) === norm(devCell)) : config.devices.find((d) => d.id === defaults.deviceId);
  if (!dev) { rows.push({ line, cells, tag: null, errors: [devCell ? 'Cihaz bulunamadı: ' + devCell : 'Cihaz seçin.'], warnings }); continue; }
  const conn = config.connections.find((c) => c.id === dev.connectionId), proto = conn ? connectionProtocol(conn) : 'modbus-tcp';
  const addrCell = get('address');
  let code = get('code'), name = get('name');
  const typeCell = get('dataType'), accCell = get('access');
  let dataType: DataType | null = typeCell ? parseType(typeCell) : null;
  if (typeCell && !dataType) errors.push('Veri tipi tanınmadı: ' + typeCell + ' (bool, uint16, int16, uint32, int32, float32).');
  let access: Tag['access'] | null = accCell ? parseAccess(accCell) : defaults.access;
  if (accCell && !access) { errors.push('Erişim tanınmadı: ' + accCell + ' (read / readwrite, oku / oku-yaz).'); access = 'read'; }
  const base = { id: newId(), deviceId: dev.id, group: get('group') || defaults.group, unit: get('unit'), description: get('description'), history: false, historyDeadband: 0, historyMaxGapMs: 60000, wordOrder: (get('wordOrder') || 'big') as Tag['wordOrder'], byteOrder: (get('byteOrder') || 'big') as Tag['byteOrder'], verifyTolerance: num(get('verifyTolerance')) ?? null, scale: num(get('scale')) ?? 1, offset: num(get('offset')) ?? 0, min: num(get('min')) ?? 0 };
  let tag: any;
  if (isSymbolicProtocol(proto)) {
   const key = symbolicAddressField(proto)!;
   const sym = get(key) || addrCell;
   const mqttExtra: Record<string, string> = {};
   let symValue = sym;
   if (!sym) errors.push((({ s7: 'S7 adresi', ads: 'ADS sembolü', mqtt: 'MQTT konusu', snmp: 'SNMP OID', http: 'HTTP yolu', sql: 'SQL sorgusu', bacnet: 'BACnet nesnesi (AV12, BI:3)', enip: 'CIP etiket adı' } as Record<string, string>)[proto] ?? 'OPC UA node kimliği') + ' gerekli.');
   else if (proto === 'mqtt') {
    // MQTT: konu (joker yok) + isteğe bağlı JSON / zaman damgası yolu; MQTT etiketi yalnız okunur.
    try { parseMqttTopic(sym); mqttPathSteps(get('mqttJsonPath')); mqttPathSteps(get('mqttTimestampPath')); } catch (e) { errors.push((e as Error).message); }
    mqttExtra.mqttJsonPath = get('mqttJsonPath'); mqttExtra.mqttTimestampPath = get('mqttTimestampPath');
    symValue = sym.trim();
   }
   else if (proto === 'snmp') { try { symValue = parseSnmpOid(sym); } catch (e) { errors.push((e as Error).message); } }
   else if (proto === 'http') {
    // HTTP: göreli yol + JSON / zaman damgası yolu (sütun adı http… ya da ortak "json yolu").
    const json = get('httpJsonPath') || get('mqttJsonPath'), ts = get('httpTimestampPath') || get('mqttTimestampPath');
    try { parseHttpPath(sym); mqttPathSteps(json); mqttPathSteps(ts); } catch (e) { errors.push((e as Error).message); }
    mqttExtra.httpJsonPath = json; mqttExtra.httpTimestampPath = ts; symValue = sym.trim();
   }
   else if (proto === 'sql') {
    try { checkSqlQuery(sym); checkSqlColumn(get('sqlColumn')); } catch (e) { errors.push((e as Error).message); }
    mqttExtra.sqlColumn = get('sqlColumn'); symValue = sym.trim();
   }
   else if (proto === 'bacnet') {
    // BACnet: nesne 'AV12' / 'BI:3' / 'analog-input 5' + isteğe bağlı özellik; veri tipi nesnenin doğasından.
    const propCell = get('bacnetProperty'), prop = (propCell ? propCell.trim().toLowerCase().replace(/[_ ]/g, '-') : 'present-value') as BacnetProperty;
    if (!(BACNET_PROPERTY_NAMES as string[]).includes(prop)) errors.push('BACnet özelliği tanınmadı: ' + propCell + ' (present-value, out-of-service, high-limit…).');
    try {
     const o = parseBacnetObject(sym);
     symValue = o.objectType; mqttExtra.bacnetInstance = o.instance as any; mqttExtra.bacnetProperty = prop;
     const kind = (BACNET_PROPERTY_NAMES as string[]).includes(prop) ? bacnetValueKind(o.objectType, prop) : 'number';
     if (kind === 'bool' && dataType !== 'bool') { if (dataType) warnings.push(prop + ' dijitaldir; veri tipi bool yapıldı.'); dataType = 'bool'; }
     else if (kind === 'number' && (!dataType || dataType === 'bool')) { if (dataType) warnings.push(prop + ' sayısaldır; veri tipi float32 yapıldı.'); dataType = o.objectType.startsWith('multi-state') && prop === 'present-value' ? 'uint16' : 'float32'; }
    } catch (e) { errors.push((e as Error).message); }
   }
   else if (proto === 'enip') {
    try {
     const c = parseCipTag(sym); symValue = c.tag;
     if (c.bit !== null && dataType && dataType !== 'bool') warnings.push('Bit erişimi (' + c.tag + '): veri tipi bool yapıldı.');
     if (c.bit !== null) dataType = 'bool';
     if (dataType && !CIP_DATATYPE[dataType]) errors.push('EtherNet/IP ' + dataType + ' desteklemiyor (UINT/UDINT okunamaz); bool, int16, int32 veya float32 kullanın.');
    } catch (e) { errors.push((e as Error).message); }
   }
   // Yalnız okunur protokoller (MQTT, SNMP, HTTP, SQL, BACnet): yazma istenirse salt okumaya iner.
   if (isReadOnlyProtocol(proto) && access === 'readwrite') { if (accCell) warnings.push(protocolLabels[proto] + ' etiketi yalnız okunur; salt okuma yapıldı.'); access = 'read'; }
   else if (proto === 's7') { try { const p = parseS7Address(sym); if (dataType && dataType !== p.dataType) warnings.push('Veri tipi adresten alındı: ' + p.dataType + '.'); dataType = p.dataType; } catch (e) { errors.push((e as Error).message); } }
   else if (proto === 'ads') { try { parseAdsSymbol(sym); } catch (e) { errors.push((e as Error).message); } }
   // S7 giriş görüntüsü (I/E) her çevrimde PLC girişlerinden ezilir: yazma istenirse salt okumaya iner.
   if (access === 'readwrite' && proto === 's7' && !errors.length && /^I/.test(parseS7Address(sym).address)) { if (accCell) warnings.push('S7 giriş alanına (I/E) yazılamaz; salt okuma yapıldı.'); access = 'read'; }
   code = code || name || (proto === 'sql' ? get('sqlColumn') : '') || sym;
   tag = { ...base, area: 'holding-register', address: 0, bit: null, dataType: dataType || 'float32', access, max: num(get('max')) ?? 65535, [key]: symValue, ...mqttExtra, ...(proto !== 'opc-ua' ? { nodeId: '' } : {}) };
  } else {
   const areaCell = get('area'), areaHint = areaCell ? AREA_WORDS[norm(areaCell)] : undefined;
   if (areaCell && !areaHint) errors.push('Alan tanınmadı: ' + areaCell + ' (coil, discrete-input, input-register, holding-register).');
   // Delta adları (M0, D100) yalnız adres biçimi Delta olan cihazda çevrilir; başka markada D100 başka şeydir.
   const isDelta = addressFormatOf(config, dev.id) === 'delta';
   const a = addrCell ? parseModbusCell(addrCell, areaHint, isDelta) : null;
   if (!addrCell) errors.push('Adres gerekli.');
   else if (!a) errors.push('Adres tanınmadı: ' + addrCell + '. Örn. ' + (isDelta ? 'M0, D100, Y0, X0, ' : '') + '40001, HR 100' + (areaHint ? '' : ' ya da alan sütunuyla düz sayı') + (!isDelta && /^[XYMSD]\d+$/i.test(addrCell) ? ' — Delta adresi için cihazın adres biçimini Delta DVP yapın' : '') + '.');
   const area = a?.area || areaHint || 'coil';
   if (a && areaHint && a.area !== areaHint && !a.delta) warnings.push('Alan adresten alındı: ' + AREA_INFO[a.area].label + '.');
   const bool = AREA_INFO[area].bool, bit = num(get('bit')) ?? a?.bit ?? null;
   if (!dataType) dataType = bool ? 'bool' : bit !== null ? 'uint16' : a?.dataType || 'uint16';
   if (bool && dataType !== 'bool') { warnings.push(AREA_INFO[area].label + ' dijitaldir; veri tipi bool yapıldı.'); dataType = 'bool'; }
   // Register içindeki tek bit: şemada uint16 + bit olarak tutulur.
   if (!bool && dataType === 'bool') { if (bit !== null) dataType = 'uint16'; else errors.push('Register alanında dijital etiket için bit numarası gerekli (örn. HR 100.3).'); }
   if (!AREA_INFO[area].writable && access === 'readwrite') { if (accCell) warnings.push('Giriş alanına yazılamaz; salt okuma yapıldı.'); access = 'read'; }
   if (!code && a?.delta) code = addrCell.toUpperCase();
   code = code || name || addrCell;
   tag = { ...base, area, address: a?.address ?? 0, bit: bool ? null : bit, dataType, access, max: num(get('max')) ?? (dataType === 'bool' ? 1 : 65535), nodeId: '' };
  }
  tag.code = code; tag.name = name || code;
  const parsed = tagSchema.safeParse(tag);
  if (!parsed.success) for (const issue of parsed.error.issues.slice(0, 2)) errors.push(fieldLabel(String(issue.path[0] ?? '')) + ': ' + issue.message);
  if (codes.has(dev.id + ':' + code)) errors.push(dev.code + ' içinde "' + code + '" kodu zaten var.');
  const t = (parsed.success ? parsed.data : tag) as Tag;
  if (!errors.length && !symbolic(config, dev.id)) {
   if (t.min >= t.max) errors.push('Alt sınır üst sınırdan küçük olmalı.');
   const end = t.address + (t.bit !== null || AREA_INFO[t.area].bool ? 0 : registerCount(t.dataType) - 1);
   if (end > 65535) errors.push('Adres aralığı 65535\'i aşıyor.');
   // Aynı register'ın farklı bitleri çakışma sayılmaz; tam register ile bit ya da aynı bit çakışır.
   const hit = ranges.find((r) => r.deviceId === t.deviceId && r.area === t.area && t.address <= r.end && end >= r.start && !(r.bit !== null && t.bit !== null && r.bit !== t.bit));
   if (hit) errors.push('Adres ' + hit.code + ' ile çakışıyor.');
   if (!errors.length) ranges.push({ deviceId: t.deviceId, area: t.area, start: t.address, end, bit: t.bit, code: t.code });
  }
  if (!errors.length) codes.add(dev.id + ':' + code);
  rows.push({ line, cells, tag: errors.length ? null : t, errors, warnings });
 }
 return { rows, header: !!hdr, fields };
}

function symbolic(config: Pick<Config, 'connections' | 'devices'>, deviceId: string) {
 const d = config.devices.find((x) => x.id === deviceId), c = config.connections.find((x) => x.id === d?.connectionId);
 return !!c && isSymbolicProtocol(connectionProtocol(c));
}
const LABELS: Record<string, string> = { code: 'Kod', name: 'Ad', group: 'Bölüm', unit: 'Birim', description: 'Açıklama', scale: 'Ölçek', offset: 'Kaydırma', min: 'Alt sınır', max: 'Üst sınır', address: 'Adres', bit: 'Bit', wordOrder: 'Kelime sırası', byteOrder: 'Bayt sırası', verifyTolerance: 'Tolerans', dataType: 'Veri tipi' };
const fieldLabel = (k: string) => LABELS[k] || k || 'Satır';
