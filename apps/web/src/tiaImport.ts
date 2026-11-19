/* TIA Portal PLC etiket tablosu içe aktarma (.xlsx, "PLC Tags" dışa aktarımı).
 * Bağımlılıksız: zip merkez dizini + yerleşik DecompressionStream('deflate-raw') + küçük XML okuyucu.
 * Satırlar S7 sürücüsünün adres biçimine çevrilir (parseS7Address ile doğrulanır). Desteklenmeyen
 * satır sessizce atılmaz, nedeniyle döner — kullanıcı neyin gelmediğini görür.
 * DB'ler bu sürümde yok: TIA onları yalnız kaynak metin (.db) olarak verir ve optimize DB'de
 * bayt ofseti yoktur; optimize DB için OPC UA kullanılır. */
import { parseS7Address } from '../../../packages/contracts/model';

/* --- zip ------------------------------------------------------------------ */
export async function readZip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
 const b = new Uint8Array(buf), v = new DataView(buf);
 let eocd = -1;
 for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
 if (eocd < 0) throw Error('Dosya bir Excel (.xlsx) dosyası değil.');
 const count = v.getUint16(eocd + 10, true);
 let p = v.getUint32(eocd + 16, true);
 const out = new Map<string, Uint8Array>();
 for (let n = 0; n < count; n++) {
  if (v.getUint32(p, true) !== 0x02014b50) break;
  const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
  const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true);
  const local = v.getUint32(p + 42, true);
  const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
  p += 46 + nameLen + extra + comment;
  if (!/\.(xml|rels)$/i.test(name)) continue;
  const lh = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
  const data = b.subarray(lh, lh + csize);
  out.set(name, method === 0 ? data : await inflate(data));
 }
 return out;
}
async function inflate(data: Uint8Array): Promise<Uint8Array> {
 const s = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
 return new Uint8Array(await new Response(s).arrayBuffer());
}
/* --- xlsx ----------------------------------------------------------------- */
const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, '&');
const textOf = (x: string) => unxml([...x.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
function colIndex(ref: string) { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }
/** Çalışma kitabının sayfalarını {ad, satırlar} olarak verir (hücre metinleri). */
export function xlsxSheets(files: Map<string, Uint8Array>): { name: string; rows: string[][] }[] {
 const dec = (k: string) => { const f = files.get(k); return f ? new TextDecoder().decode(f) : ''; };
 const shared = [...dec('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
 const wb = dec('xl/workbook.xml'), rels = dec('xl/_rels/workbook.xml.rels');
 const target = (rid: string) => { const m = new RegExp('<Relationship[^>]*Id="' + rid + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship[^>]*Target="([^"]+)"[^>]*Id="' + rid + '"').exec(rels); return m ? 'xl/' + m[1].replace(/^\/?xl\//, '') : ''; };
 const sheets = [...wb.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ name: unxml(m[1]), file: target(m[2]) }));
 return sheets.map(({ name, file }) => {
  const rows: string[][] = [];
  for (const r of dec(file).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
   const row: string[] = [];
   for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = c[1], body = c[2] || '';
    const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1], t = /t="([^"]+)"/.exec(attrs)?.[1];
    const val = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    const text = t === 's' ? shared[Number(val)] ?? '' : t === 'inlineStr' ? textOf(body) : unxml(val ?? '');
    row[ref ? colIndex(ref) : row.length] = text;
   }
   rows.push(Array.from(row, (x) => x ?? ''));
  }
  return { name, rows };
 });
}
/* --- TIA satırı -> S7 etiketi -------------------------------------------- */
export type TiaRow = { name: string; dataType: string; address: string; comment: string };
export type TiaResult = { row: TiaRow; s7Address?: string; tagType?: 'bool' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float32'; reason?: string };
/** TIA veri tipi + mantıksal adres (%MW10) -> nodes7 adresi. Tip, adres boyutuyla uyumlu olmalı. */
export function tiaToS7(dataType: string, logical: string): { s7Address: string; tagType: TiaResult['tagType'] } | { reason: string } {
 const dt = dataType.trim().toLowerCase().replace(/^"|"$/g, '');
 const a = logical.trim().toUpperCase().replace(/^%/, '').replace(/\s+/g, '');
 const want: Record<string, { size: string; s7: string }> = {
  bool: { size: '', s7: '' }, byte: { size: 'B', s7: 'B' }, usint: { size: 'B', s7: 'B' }, sint: { size: 'B', s7: 'B' }, char: { size: 'B', s7: 'B' },
  int: { size: 'W', s7: 'I' }, word: { size: 'W', s7: 'W' }, uint: { size: 'W', s7: 'W' },
  dint: { size: 'D', s7: 'DI' }, time: { size: 'D', s7: 'DI' }, dword: { size: 'D', s7: 'D' }, udint: { size: 'D', s7: 'D' }, real: { size: 'D', s7: 'R' },
 };
 const w = want[dt];
 if (!dt) return { reason: 'Veri tipi yok.' };
 if (!w) return { reason: 'Veri tipi desteklenmiyor: ' + dataType + '.' };
 if (!a) return { reason: 'Mantıksal adres yok (optimize DB veya adressiz etiket).' };
 const m = /^([IEQAM])([BWD]?)(\d+)(?:\.(\d))?$/.exec(a);
 if (!m) return { reason: 'Adres biçimi desteklenmiyor: ' + logical + ' (yalnız %I/%Q/%M).' };
 const area = m[1] === 'E' ? 'I' : m[1] === 'A' ? 'Q' : m[1], size = m[2], off = m[3], bit = m[4];

 if (w.size !== size) return { reason: dataType + ' tipi ' + (w.size ? '%' + area + w.size + '…' : 'bit (%' + area + 'x.y)') + ' adresi ister, dosyada ' + logical + '.' };
 if (dt === 'bool' && bit === undefined) return { reason: 'Bit adresi bit numarası ister: ' + logical + '.' };
 if (dt !== 'bool' && bit !== undefined) return { reason: 'Bit numarası yalnız Bool etikette kullanılır: ' + dataType + ' ' + logical + '.' };
 const s7 = area + w.s7 + off + (dt === 'bool' ? '.' + bit : '');
 try { const p = parseS7Address(s7); return { s7Address: p.address, tagType: p.dataType }; }
 catch (e) { return { reason: (e as Error).message }; }
}
/** Sayfa satırlarından TIA etiket tablosunu bulur (başlık: Name / Data Type / Logical Address). */
export function tiaRows(rows: string[][]): TiaRow[] | null {
 const norm = (s: string) => s.trim().toLowerCase();
 const hi = rows.findIndex((r) => r.some((c) => norm(c) === 'name') && r.some((c) => norm(c) === 'logical address'));
 if (hi < 0) return null;
 const h = rows[hi].map(norm), col = (k: string) => h.indexOf(k);
 const [cn, ct, ca, cc] = [col('name'), col('data type'), col('logical address'), col('comment')];
 return rows.slice(hi + 1).filter((r) => (r[cn] || '').trim()).map((r) => ({ name: r[cn].trim(), dataType: (r[ct] || '').trim(), address: (r[ca] || '').trim(), comment: cc >= 0 ? (r[cc] || '').trim() : '' }));
}
export function convertTia(rows: TiaRow[]): TiaResult[] {
 return rows.map((row) => { const r = tiaToS7(row.dataType, row.address); return 'reason' in r ? { row, reason: r.reason } : { row, ...r }; });
}
/** Dosyadan doğrudan: ilk uygun sayfa ("PLC Tags" tercih). */
export async function readTiaFile(buf: ArrayBuffer): Promise<{ sheet: string; results: TiaResult[] }> {
 const sheets = xlsxSheets(await readZip(buf));
 const ordered = [...sheets].sort((a, b) => Number(/plc tags/i.test(b.name)) - Number(/plc tags/i.test(a.name)));
 for (const s of ordered) { const rows = tiaRows(s.rows); if (rows) return { sheet: s.name, results: convertTia(rows) }; }
 throw Error('Dosyada TIA PLC etiket tablosu bulunamadı (Name / Data Type / Logical Address sütunları). TIA\'da PLC tags → Export ile alınmış dosya olmalı.');
}
