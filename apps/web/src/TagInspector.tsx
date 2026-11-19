/* Etiket yan paneli (A düzeni, 2026-10-01): önce adres — cihazın adres biçimine göre tek büyük
   kutu, yanında "Oku" (kaydetmeden PLC'den tek okuma) — sonra kod, ad, klasör, erişim; geri kalan
   ayarlar "Gelişmiş" altında katlı. Kayıt mantığı Management'ta; bu bileşen taslağı düzenler. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, Check, X } from 'lucide-react';
import { addressFormatLabels, addressFormatOf, parseS7Address, parseAdsSymbol, parseMqttTopic, mqttPathSteps, parseSnmpOid, parseHttpPath, httpRequestUrl, checkSqlQuery, checkSqlColumn, protocolLabels, connectionProtocol, connectionAddress,
 BACNET_OBJECT_TYPE_NAMES, BACNET_PROPERTY_NAMES, BACNET_INSTANCE_MAX, bacnetObjectTypeLabels, bacnetObjectText, bacnetValueKind, parseCipTag, CIP_DATATYPE, type BacnetObjectType, type BacnetProperty, type Config, type Live } from '../../../packages/contracts/model';
import { api } from './api';
import { SearchSelect } from './SearchSelect';
import { InfoTip } from './InfoTip';
import { OpcBrowser } from './OpcBrowser';
import { AREA_INFO, TYPE_INFO, modbusRef, parseModbusRef, sampleText } from './cfgModel';
import { parseDeltaAddress, toDeltaName } from './tagImport';

type Usage = { group: string; text: string; detail: string; screenId?: string }[];
type Props = { data: any; setData: (fn: (d: any) => any) => void; fresh: boolean; config: Config; live: Live; isS7: (deviceId: string) => boolean; isAds?: (deviceId: string) => boolean; isOpc?: (deviceId: string) => boolean; isMqtt?: (deviceId: string) => boolean; usage: Usage | null; onScreen: (id: string) => void; preview: ReactNode };
type Test = { state: 'idle' | 'run' | 'ok' | 'bad'; key: string; value?: boolean | number; ms?: number; error?: string };

const Sec = ({ title, tip, children, right }: { title: string; tip?: ReactNode; children: ReactNode; right?: ReactNode }) => (
 <section className="insp-sec"><header><h3>{title}{tip && <InfoTip label={title}>{tip}</InfoTip>}</h3>{right}</header>{children}</section>
);
const F = ({ label, tip, children, wide }: { label: string; tip?: ReactNode; children: ReactNode; wide?: boolean }) => (
 <label className={'field' + (wide ? ' wide' : '')}><span>{label}{tip && <InfoTip label={label}>{tip}</InfoTip>}</span>{children}</label>
);
const AREAS = Object.keys(AREA_INFO) as (keyof typeof AREA_INFO)[];
const fmtVal = (v: boolean | number | undefined, unit: string) => (typeof v === 'boolean' ? (v ? 'AÇIK' : 'KAPALI') : v === undefined ? '—' : String(Math.round(v * 1000) / 1000) + (unit ? ' ' + unit : ''));

/* MQTT adres denetimi: konu (joker yok) + JSON/zaman yolu. Hatalı alanı işaretler; geçerliyse adresi özetler. */
function mqttCheck(data: any): { cls: 'ok' | 'err' | 'info'; text: string; field?: 'topic' | 'path' | 'ts' } {
 if (!String(data.mqttTopic || '').trim()) return { cls: 'info', text: 'Konuyu yazın: hat1/sicaklik. Joker (+ #) kullanılmaz; her etiket tek konudan okur.' };
 let topic: string;
 try { topic = parseMqttTopic(data.mqttTopic); } catch (e) { return { cls: 'err', text: (e as Error).message, field: 'topic' }; }
 try { mqttPathSteps(data.mqttJsonPath); } catch (e) { return { cls: 'err', text: (e as Error).message, field: 'path' }; }
 try { mqttPathSteps(data.mqttTimestampPath); } catch (e) { return { cls: 'err', text: 'Zaman damgası: ' + (e as Error).message, field: 'ts' }; }
 const p = String(data.mqttJsonPath || '').trim();
 return { cls: 'ok', text: 'MQTT ' + topic + (p ? ' · ' + p : ' · yükün tamamı') + ' · salt okuma' };
}

type Check = { cls: 'ok' | 'err' | 'info'; text: string; field?: string };
/* SNMP / HTTP / SQL adres denetimi (salt okuma): hatalı alanı işaretler; geçerliyse adresi özetler. */
function snmpCheck(data: any): Check {
 if (!String(data.snmpOid || '').trim()) return { cls: 'info', text: 'Sayısal OID yazın: 1.3.6.1.2.1.1.3.0. MIB adı (sysUpTime) kullanılmaz.' };
 try { return { cls: 'ok', text: 'SNMP GET ' + parseSnmpOid(data.snmpOid) + ' · salt okuma' }; } catch (e) { return { cls: 'err', text: (e as Error).message, field: 'oid' }; }
}
function httpCheck(data: any, base: string | undefined): Check {
 if (!String(data.httpPath || '').trim()) return { cls: 'info', text: 'Temel adrese eklenecek yolu yazın: /api/olcum veya /durum?hat=3.' };
 try { parseHttpPath(data.httpPath); } catch (e) { return { cls: 'err', text: (e as Error).message, field: 'path' }; }
 try { mqttPathSteps(data.httpJsonPath); } catch (e) { return { cls: 'err', text: (e as Error).message, field: 'json' }; }
 try { mqttPathSteps(data.httpTimestampPath); } catch (e) { return { cls: 'err', text: 'Zaman damgası: ' + (e as Error).message, field: 'ts' }; }
 let url = '';
 try { url = httpRequestUrl(base || '', data.httpPath); } catch { url = String(data.httpPath).trim(); }
 const j = String(data.httpJsonPath || '').trim();
 return { cls: 'ok', text: 'GET ' + url + (j ? ' · ' + j : ' · gövdenin tamamı') + ' · salt okuma' };
}
/* BACnet: nesne tipi + numara + özellik; veri tipi özelliğin doğasına uymalı (dijital/sayısal). */
function bacnetCheck(data: any): Check {
 const t = data.bacnetObjectType as BacnetObjectType | undefined, n = data.bacnetInstance, p = (data.bacnetProperty || 'present-value') as BacnetProperty;
 if (!t) return { cls: 'info', text: 'Nesne tipini seçin (AI, AV, BI, BV, MV…); BMS nokta listesinde yazar.' };
 if (n === undefined || n === null || n === '') return { cls: 'info', text: 'Nesne numarasını yazın (0–' + BACNET_INSTANCE_MAX + ').' };
 if (!Number.isInteger(n) || n < 0 || n > BACNET_INSTANCE_MAX) return { cls: 'err', text: 'Nesne numarası 0–' + BACNET_INSTANCE_MAX + ' aralığında tam sayı olmalı.', field: 'inst' };
 const kind = bacnetValueKind(t, p);
 if (kind === 'bool' && data.dataType !== 'bool') return { cls: 'err', text: p + ' dijitaldir; veri tipi bool olmalı.', field: 'type' };
 if (kind === 'number' && data.dataType === 'bool') return { cls: 'err', text: p + ' sayısaldır; veri tipi bool olamaz.', field: 'type' };
 return { cls: 'ok', text: 'BACnet ' + bacnetObjectText(t, n) + ' · ' + p + (p === 'present-value' ? ' (+ arıza bayrağı)' : '') + ' · salt okuma' };
}
/* EtherNet/IP: CIP etiket adı; bit erişimi (Dint.5) yalnız bool; UINT/UDINT yok. */
function enipCheck(data: any): Check {
 if (!String(data.cipTag || '').trim()) return { cls: 'info', text: 'PLC\'deki etiket adını yazın: Sicaklik, Program:MainProgram.Sayac, Motor[2].Hiz.' };
 let bit: number | null;
 try { bit = parseCipTag(data.cipTag).bit; } catch (e) { return { cls: 'err', text: (e as Error).message, field: 'tag' }; }
 const cip = CIP_DATATYPE[data.dataType as keyof typeof CIP_DATATYPE];
 if (!cip) return { cls: 'err', text: data.dataType + ' desteklenmiyor (UINT/UDINT okunamaz); bool, int16, int32 veya float32 seçin.', field: 'type' };
 if (bit !== null && data.dataType !== 'bool') return { cls: 'err', text: 'Bit erişimi (' + String(data.cipTag).trim() + ') yalnız bool veri tipiyle kullanılır.', field: 'type' };
 return { cls: 'ok', text: 'CIP ' + String(data.cipTag).trim() + ' · ' + (bit !== null ? 'bit ' + bit : cip) };
}
function sqlCheck(data: any): Check {
 if (!String(data.sqlQuery || '').trim()) return { cls: 'info', text: 'Tek satır döndüren bir SELECT yazın: SELECT TOP 1 Sicaklik FROM dbo.Olcum ORDER BY Zaman DESC.' };
 try { checkSqlQuery(data.sqlQuery); } catch (e) { return { cls: 'err', text: (e as Error).message, field: 'query' }; }
 if (!String(data.sqlColumn || '').trim()) return { cls: 'info', text: 'Sorgunun döndürdüğü sütunun adını yazın.' };
 try { checkSqlColumn(data.sqlColumn); } catch (e) { return { cls: 'err', text: (e as Error).message, field: 'col' }; }
 return { cls: 'ok', text: 'İlk satırın ' + String(data.sqlColumn).trim() + ' sütunu okunur · salt okuma' };
}

export function TagInspector({ data, setData, fresh, config, live, isS7, isAds = () => false, isOpc = () => false, isMqtt = () => false, usage, onScreen, preview }: Props) {
 const patch = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
 const [adv, setAdv] = useState(false);
 const [browse, setBrowse] = useState(false);
 const s7 = isS7(data.deviceId), ads = isAds(data.deviceId), opc = isOpc(data.deviceId), mqtt = isMqtt(data.deviceId);
 const fmt = addressFormatOf(config, data.deviceId);
 const snmp = fmt === 'snmp', httpP = fmt === 'http', sql = fmt === 'sql', bac = fmt === 'bacnet', enip = fmt === 'enip';
 // Yalnız okunur protokoller (MQTT, SNMP, HTTP, SQL, BACnet): adres alanı protokole özgü, okuma testi ve yazma yok.
 const ro = mqtt || snmp || httpP || sql || bac;
 const sym = s7 || ads || opc || ro || enip;
 // Cihaz başka protokole taşınınca erişim salt okumaya döner (adres anlamı değişir).
 const protoOf = (id: string) => { const f = addressFormatOf(config, id); return f === 'delta' ? 'modbus' : f; };
 const dev = config.devices.find((d) => d.id === data.deviceId);
 const conn = config.connections.find((c) => c.id === dev?.connectionId);
 const area = AREA_INFO[data.area as keyof typeof AREA_INFO];
 const isBool = data.dataType === 'bool';
 const wide = ['uint32', 'int32', 'float32'].includes(data.dataType);
 const s = live.samples[data.id], st = sampleText(data, fresh ? undefined : s);
 const age = s && !fresh ? Math.round((Date.now() - s.receivedAt) / 1000) : null;

 /* Adres kutusu metni: Delta'da PLC adı (M10), Genel Modbus'ta 0 tabanlı adres ya da kılavuz numarası. */
 const initialText = () => (fmt === 'delta' ? toDeltaName(data.area, data.address) || '' : fmt === 'modbus' ? String(data.address ?? '') : '');
 const [text, setText] = useState(initialText);
 const lastDev = useRef(data.deviceId);
 useEffect(() => { if (lastDev.current !== data.deviceId) { lastDev.current = data.deviceId; setText(initialText()); } });
 const autoCode = useRef<string>(fresh ? data.code : '');
 let addrMsg: { cls: 'ok' | 'err' | 'info'; text: string } = { cls: 'info', text: '' };
 const applyText = (v: string) => {
  setText(v);
  const t = v.trim();
  if (fmt === 'delta') {
   const p = parseDeltaAddress(t);
   if (!p) return;
   setData((d) => {
    const code = fresh && (!d.code || d.code === autoCode.current) ? t.toUpperCase() : d.code;
    if (fresh) autoCode.current = code;
    const bool = p.dataType === 'bool';
    return { ...d, area: p.area, address: p.address, bit: null, code, dataType: bool ? 'bool' : d.dataType === 'bool' ? p.dataType : d.dataType, access: AREA_INFO[p.area].writable ? d.access : 'read', max: bool ? 1 : d.max === 1 ? 65535 : d.max };
   });
  } else if (fmt === 'modbus') {
   if (/^\d{5,6}$/.test(t)) { const p = parseModbusRef(t); if (p) setData((d) => ({ ...d, area: p.area, address: p.address, bit: null, dataType: AREA_INFO[p.area].bool ? 'bool' : d.dataType === 'bool' ? 'uint16' : d.dataType, access: AREA_INFO[p.area].writable ? d.access : 'read' })); }
   else if (/^\d{1,5}$/.test(t) && Number(t) <= 65535) patch('address', Number(t));
  }
 };
 if (fmt === 'delta') {
  const t = text.trim(), p = parseDeltaAddress(t);
  addrMsg = !t ? { cls: 'info', text: 'Delta adresini yazın: M10, Y3, X0, D100. X ve Y sekizlik numaralanır.' }
   : p ? { cls: 'ok', text: 'Delta ' + t.toUpperCase() + ' → ' + AREA_INFO[p.area].short + ' ' + p.address }
   : /^[XY]\d*[89]/i.test(t) ? { cls: 'err', text: t[0].toUpperCase() + ' sekizlik numaralanır: ' + t[0].toUpperCase() + '7\'den sonra ' + t[0].toUpperCase() + '10 gelir.' }
   : { cls: 'err', text: 'Delta adresi değil. Örn. M10, Y3, X0, D100. T ve C için cihaz biçimini Genel Modbus yapıp adresi girin.' };
 } else if (fmt === 'modbus') {
  const t = text.trim();
  addrMsg = !t ? { cls: 'info', text: 'Adres (0 tabanlı) ya da kılavuz numarası: 100 veya 40101.' }
   : /^\d{5,6}$/.test(t) ? (parseModbusRef(t) ? { cls: 'ok', text: 'Kılavuz ' + t + ' → ' + AREA_INFO[data.area as keyof typeof AREA_INFO].short + ' ' + data.address } : { cls: 'err', text: 'Kılavuz numarası 0, 1, 3 ya da 4 ile başlar.' })
   : /^\d{1,5}$/.test(t) && Number(t) <= 65535 ? { cls: 'ok', text: AREA_INFO[data.area as keyof typeof AREA_INFO].label + ' · ' + data.address + ' · kılavuz ' + modbusRef(data.area, data.address) }
   : { cls: 'err', text: 'Yalnız sayı: 0–65535 ya da 40101 gibi kılavuz numarası.' };
 } else if (s7) {
  if (data.s7Address) try { const p = parseS7Address(data.s7Address); addrMsg = { cls: 'ok', text: 'S7 ' + p.address + ' · tip adresten: ' + p.dataType }; } catch (e) { addrMsg = { cls: 'err', text: (e as Error).message }; }
  else addrMsg = { cls: 'info', text: 'S7 adresi: DB1,REAL4 · DB2,INT0 · M0.0 · MW10 · MD20.' };
 } else if (ads && data.adsSymbol) { try { parseAdsSymbol(data.adsSymbol); } catch (e) { addrMsg = { cls: 'err', text: (e as Error).message }; } }
 const addrOk = addrMsg.cls === 'ok' || (ads && !!data.adsSymbol && addrMsg.cls !== 'err') || (opc && !!data.nodeId);
 const mqttMsg = mqtt ? mqttCheck(data) : null;
 const roMsg: Check | null = snmp ? snmpCheck(data) : httpP ? httpCheck(data, conn?.httpBaseUrl) : sql ? sqlCheck(data) : bac ? bacnetCheck(data) : enip ? enipCheck(data) : null;
 const bad = (f: string) => (roMsg?.field === f ? ' bad' : '');

 /* Okuma testi: adres alanları değişince sonuç sıfırlanır; eski sonuç yanıltmasın. */
 const testKey = JSON.stringify([data.deviceId, data.area, data.address, data.dataType, data.bit, data.s7Address, data.wordOrder, data.byteOrder, data.scale, data.offset]);
 const [test, setTest] = useState<Test>({ state: 'idle', key: testKey });
 const cur: Test = test.key === testKey ? test : { state: 'idle', key: testKey };
 const canTest = addrOk && !ads && !opc && !ro && !enip && cur.state !== 'run';
 const runTest = async () => {
  if (!canTest) return;
  setTest({ state: 'run', key: testKey });
  try {
   const r = await api('/tags/test-read', 'POST', { deviceId: data.deviceId, area: sym ? undefined : data.area, address: sym ? undefined : data.address, dataType: data.dataType, bit: data.bit, wordOrder: data.wordOrder, byteOrder: data.byteOrder, scale: data.scale, offset: data.offset, s7Address: s7 ? data.s7Address : undefined });
   setTest({ state: 'ok', key: testKey, value: r.value, ms: r.ms });
  } catch (e) { setTest({ state: 'bad', key: testKey, error: (e as Error).message }); }
 };

 const setArea = (a: keyof typeof AREA_INFO) => setData((d) => ({ ...d, area: a, dataType: AREA_INFO[a].bool ? 'bool' : d.dataType === 'bool' ? 'uint16' : d.dataType, bit: null, access: AREA_INFO[a].writable ? d.access : 'read' }));
 const quick = fmt === 'delta' ? [['M', 'M · dahili bit'], ['Y', 'Y · çıkış'], ['X', 'X · giriş'], ['D', 'D · register']] : s7 ? [['DB1,REAL0', 'DB · REAL'], ['M0.0', 'M · bit'], ['MW10', 'MW · word']] : [];
 const nextOf = (letter: string) => {
  const used = config.tags.filter((t) => t.deviceId === data.deviceId).map((t) => toDeltaName(t.area, t.address)).filter((n): n is string => !!n && n[0] === letter).map((n) => (letter === 'X' || letter === 'Y' ? parseInt(n.slice(1), 8) : Number(n.slice(1))));
  const n = used.length ? Math.max(...used) + 1 : 0;
  return letter + (letter === 'X' || letter === 'Y' ? n.toString(8) : String(n));
 };
 const deviceOptions = config.devices.map((d) => { const c = config.connections.find((x) => x.id === d.connectionId); return { value: d.id, label: d.code + ' — ' + d.name, hint: c ? protocolLabels[connectionProtocol(c)] : '' }; });
 const groups = [...new Set(config.tags.filter((t) => t.deviceId === data.deviceId).map((t) => (t.group || '').trim()).filter(Boolean))];
 const s7Input = s7 && (() => { try { return /^I/.test(parseS7Address(data.s7Address || '').address); } catch { return false; } })();
 const roReason = mqtt ? 'MQTT etiketi yalnız okunur (yayın teslim onayı vermez).' : bac ? 'BACnet etiketi bu sürümde yalnız okunur: yazma öncelik dizisi (priority-array) ister, BMS\'in kontrolünü ezebilir.' : snmp ? 'SNMP etiketi yalnız okunur (SNMP SET desteklenmez).' : httpP ? 'HTTP etiketi yalnız okunur.' : sql ? 'SQL etiketi yalnız okunur; veritabanına yazılmaz.' : s7Input ? 'S7 giriş alanı (I/E) yalnız okunur.' : sym ? '' : !area?.writable ? 'Giriş alanı yalnız okunur.' : '';

 return (
  <div className="insp">
   <div className="insp-where"><span>{dev?.code || '—'} · {addressFormatLabels[fmt]}</span>{(data.group || '').trim() && <span>{data.group}</span>}{conn && <span className="muted mono">{s7 ? conn.host : connectionAddress(conn)}{dev && !sym ? ' · slave ' + dev.slaveId : ''}</span>}</div>
   {!fresh && (
    <div className={'insp-live ' + st.state}>
     <div><span>Canlı değer</span><strong className="mono">{st.state === 'good' ? st.value : st.text}</strong></div>
     <small>{st.state === 'good' ? `${age} sn önce okundu` : st.state === 'never' ? 'Hiç okunmadı: cihaz etkin mi, değişiklik sahaya uygulandı mı?' : st.state === 'bad' ? 'Cihaz hata döndürdü: adres, alan veya veri tipi yanlış olabilir. Aşağıdan "Oku" ile deneyin.' : `Son değer ${st.value}, ${age} sn önce — güncellenmiyor.`}</small>
    </div>
   )}
   {browse && conn && (
    <OpcBrowser connectionId={conn.id} onClose={() => setBrowse(false)}
     onPick={(p) => { setData((d) => ({ ...d, nodeId: p.nodeId, dataType: p.tagType || d.dataType, bit: null, code: d.code || p.name, name: d.name || p.name })); setBrowse(false); }} />
   )}
   {mqtt && (
    <section className="insp-sec insp-addr">
     <label className="field"><span>MQTT konusu</span>
      <input className={'mono insp-big' + (mqttMsg?.field === 'topic' ? ' bad' : '')} value={data.mqttTopic || ''} placeholder="hat1/sicaklik" autoComplete="off" spellCheck={false} autoFocus={fresh} maxLength={256} onChange={(e) => setData((d) => ({ ...d, mqttTopic: e.target.value, bit: null, access: 'read' }))} />
     </label>
     <div className="insp-grid">
      <F label="JSON yolu" tip="Yük JSON ise değerin yolu: data.temp, values[0]. Boşsa yükün tamamı (düz sayı ya da on/off).">
       <input className={'mono' + (mqttMsg?.field === 'path' ? ' bad' : '')} value={data.mqttJsonPath || ''} placeholder="Boş: yükün tamamı" autoComplete="off" spellCheck={false} maxLength={200} onChange={(e) => setData((d) => ({ ...d, mqttJsonPath: e.target.value }))} />
      </F>
      <F label="Zaman damgası yolu" tip="İsteğe bağlı: yükteki ISO tarih ya da epoch milisaniye alanı (örn. ts). Yoksa, okunamazsa ya da son 55 saniyenin dışındaysa alış zamanı kullanılır.">
       <input className={'mono' + (mqttMsg?.field === 'ts' ? ' bad' : '')} value={data.mqttTimestampPath || ''} placeholder="Boş: alış zamanı" autoComplete="off" spellCheck={false} maxLength={200} onChange={(e) => setData((d) => ({ ...d, mqttTimestampPath: e.target.value }))} />
      </F>
     </div>
     {mqttMsg && <small className={'insp-msg ' + mqttMsg.cls}>{mqttMsg.text}</small>}
    </section>
   )}
   {snmp && (
    <section className="insp-sec insp-addr">
     <label className="field"><span>SNMP OID</span>
      <input className={'mono insp-big' + bad('oid')} value={data.snmpOid || ''} placeholder="1.3.6.1.2.1.1.3.0" inputMode="decimal" autoComplete="off" spellCheck={false} autoFocus={fresh} maxLength={200} onChange={(e) => setData((d) => ({ ...d, snmpOid: e.target.value, bit: null, access: 'read' }))} />
     </label>
     {roMsg && <small className={'insp-msg ' + roMsg.cls}>{roMsg.text}</small>}
     <small className="insp-hint">Integer, Counter, Gauge ve TimeTicks sayı olarak okunur (TimeTicks 1/100 sn: ölçek 0,01). Metin (OctetString) yalnız sayı içeriyorsa okunur; değilse "hatalı" görünür.</small>
    </section>
   )}
   {httpP && (
    <section className="insp-sec insp-addr">
     <label className="field"><span>HTTP yolu</span>
      <input className={'mono insp-big' + bad('path')} value={data.httpPath || ''} placeholder="/api/olcum" autoComplete="off" spellCheck={false} autoFocus={fresh} maxLength={300} onChange={(e) => setData((d) => ({ ...d, httpPath: e.target.value, bit: null, access: 'read' }))} />
     </label>
     <div className="insp-grid">
      <F label="JSON yolu" tip="Cevap JSON ise değerin yolu: data.temp, values[0]. Boşsa gövdenin tamamı (düz sayı ya da on/off). Aynı yoldaki etiketler tek istekle okunur.">
       <input className={'mono' + bad('json')} value={data.httpJsonPath || ''} placeholder="Boş: gövdenin tamamı" autoComplete="off" spellCheck={false} maxLength={200} onChange={(e) => setData((d) => ({ ...d, httpJsonPath: e.target.value }))} />
      </F>
      <F label="Zaman damgası yolu" tip="İsteğe bağlı: cevaptaki ISO tarih ya da epoch milisaniye alanı. Yoksa, okunamazsa ya da son 55 saniyenin dışındaysa alış zamanı kullanılır.">
       <input className={'mono' + bad('ts')} value={data.httpTimestampPath || ''} placeholder="Boş: alış zamanı" autoComplete="off" spellCheck={false} maxLength={200} onChange={(e) => setData((d) => ({ ...d, httpTimestampPath: e.target.value }))} />
      </F>
     </div>
     {roMsg && <small className={'insp-msg ' + roMsg.cls}>{roMsg.text}</small>}
    </section>
   )}
   {sql && (
    <section className="insp-sec insp-addr">
     <label className="field"><span>SQL sorgusu (tek SELECT)</span>
      <textarea className={'mono insp-sql' + bad('query')} rows={3} value={data.sqlQuery || ''} placeholder="SELECT TOP 1 Sicaklik FROM dbo.Olcum ORDER BY Zaman DESC" autoComplete="off" spellCheck={false} autoFocus={fresh} maxLength={2000} onChange={(e) => setData((d) => ({ ...d, sqlQuery: e.target.value, bit: null, access: 'read' }))} />
     </label>
     <F label="Sütun" tip="Sorgunun ilk satırından okunacak sütun. Aynı sorguyu kullanan etiketler tek çalıştırmayı paylaşır; farklı sütunları aynı sorgudan okuyun.">
      <input className={'mono' + bad('col')} value={data.sqlColumn || ''} placeholder="Sicaklik" autoComplete="off" spellCheck={false} maxLength={128} onChange={(e) => setData((d) => ({ ...d, sqlColumn: e.target.value }))} />
     </F>
     {roMsg && <small className={'insp-msg ' + roMsg.cls}>{roMsg.text}</small>}
     <small className="insp-hint">Noktalı virgül, yorum ve INSERT/UPDATE/EXEC gibi komutlar reddedilir. Bağlantıdaki veritabanı kullanıcısı yalnız okuma yetkili (db_datareader) olmalı.</small>
    </section>
   )}
   {bac && (
    <section className="insp-sec insp-addr">
     <div className="insp-grid">
      <F label="Nesne tipi">
       <select className={bad('obj')} value={data.bacnetObjectType || ''} autoFocus={fresh} onChange={(e) => { const t = e.target.value as BacnetObjectType; setData((d) => { const k = bacnetValueKind(t, (d.bacnetProperty || 'present-value') as BacnetProperty); return { ...d, bacnetObjectType: t, bit: null, access: 'read', dataType: k === 'bool' ? 'bool' : d.dataType === 'bool' ? (t.startsWith('multi-state') ? 'uint16' : 'float32') : d.dataType }; }); }}>
        <option value="" disabled>Seçin</option>
        {BACNET_OBJECT_TYPE_NAMES.map((t) => <option key={t} value={t}>{bacnetObjectTypeLabels[t]}</option>)}
       </select>
      </F>
      <F label="Nesne numarası" tip={'BMS nokta listesindeki numara (instance), 0–' + BACNET_INSTANCE_MAX + '.'}>
       <input className={'mono' + bad('inst')} type="number" min={0} max={BACNET_INSTANCE_MAX} inputMode="numeric" placeholder="örn. 12" value={data.bacnetInstance ?? ''} onChange={(e) => setData((d) => ({ ...d, bacnetInstance: e.target.value === '' ? undefined : Number(e.target.value) }))} />
      </F>
      <F label="Özellik" wide tip="Çoğu nokta için present-value (anlık değer). out-of-service dijitaldir; reliability ve event-state sayı (enum) döner.">
       <select value={data.bacnetProperty || 'present-value'} onChange={(e) => { const p = e.target.value as BacnetProperty; setData((d) => { const k = d.bacnetObjectType ? bacnetValueKind(d.bacnetObjectType, p) : 'number'; return { ...d, bacnetProperty: p, dataType: k === 'bool' ? 'bool' : d.dataType === 'bool' ? 'float32' : d.dataType }; }); }}>
        {BACNET_PROPERTY_NAMES.map((p) => <option key={p} value={p}>{p}</option>)}
       </select>
      </F>
     </div>
     {roMsg && <small className={'insp-msg ' + roMsg.cls}>{roMsg.text}</small>}
     <small className="insp-hint">Analog nesneler REAL, çok durumlu nesneler 1…N durum numarası, dijital nesneler açık/kapalı okunur. Cihaz arıza bayrağı (status-flags fault) verirse değer hatalı görünür.</small>
    </section>
   )}
   {enip && (
    <section className="insp-sec insp-addr">
     <label className="field"><span>CIP etiket adı</span>
      <input className={'mono insp-big' + bad('tag')} value={data.cipTag || ''} placeholder="Program:MainProgram.Sayac" autoComplete="off" spellCheck={false} autoFocus={fresh} maxLength={200} onChange={(e) => { const v = e.target.value; setData((d) => { let bit: number | null = null; try { bit = parseCipTag(v).bit; } catch { /* mesaj aşağıda */ } return { ...d, cipTag: v, bit: null, dataType: bit !== null ? 'bool' : d.dataType }; }); }} />
     </label>
     {roMsg && <small className={'insp-msg ' + roMsg.cls}>{roMsg.text}</small>}
     <small className="insp-hint">Logix'te denetleyici kapsamlı etiket en basitidir (Sicaklik); program kapsamlı etiket Program:Ad.Etiket yazılır. Omron NX/NJ'de değişken ağ değişkeni olarak yayınlanmış olmalı. Tipler: BOOL, INT, DINT, REAL.</small>
    </section>
   )}
   {!ro && !enip && <section className="insp-sec insp-addr">
    {fmt === 'modbus' && (
     <div className="field"><span>Alan</span>
      <div className="insp-seg" role="radiogroup" aria-label="Adres alanı">
       {AREAS.map((k) => <button type="button" key={k} role="radio" aria-checked={data.area === k} className={data.area === k ? 'active' : ''} title={AREA_INFO[k].hint} onClick={() => setArea(k)}>{AREA_INFO[k].label.replace(/ \(.*\)/, '')}</button>)}
      </div>
     </div>
    )}
    <label className="field"><span>{fmt === 'delta' ? 'PLC adresi (Delta)' : fmt === 'modbus' ? 'Adres' : s7 ? 'S7 adresi' : ads ? 'TwinCAT sembolü' : 'OPC UA node kimliği'}</span>
     <div className="insp-addr-row">
      {fmt === 'delta' || fmt === 'modbus'
       ? <input className={'mono insp-big' + (addrMsg.cls === 'err' ? ' bad' : '')} value={text} placeholder={fmt === 'delta' ? 'M10' : '100 ya da 40101'} autoComplete="off" spellCheck={false} autoFocus={fresh} onChange={(e) => applyText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); void runTest(); } }} />
       : s7 ? <input className={'mono insp-big' + (addrMsg.cls === 'err' ? ' bad' : '')} value={data.s7Address || ''} placeholder="DB1,REAL4" autoComplete="off" spellCheck={false} autoFocus={fresh} onChange={(e) => { const v = e.target.value; let dt = data.dataType; try { dt = parseS7Address(v).dataType; } catch { /* mesaj aşağıda */ } setData((d) => ({ ...d, s7Address: v, dataType: dt, bit: null, access: 'read' })); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); void runTest(); } }} />
       : ads ? <input className="mono insp-big" value={data.adsSymbol || ''} placeholder="GVL.fSicaklik" autoComplete="off" spellCheck={false} onChange={(e) => setData((d) => ({ ...d, adsSymbol: e.target.value, bit: null, access: 'read' }))} />
       : <input className="mono insp-big" value={data.nodeId || ''} placeholder="ns=2;i=1005" autoComplete="off" spellCheck={false} onChange={(e) => setData((d) => ({ ...d, nodeId: e.target.value, bit: null }))} />}
      {opc ? conn && <button type="button" className="btn" onClick={() => setBrowse(true)}>Gözat</button>
       : !ads && <button type="button" className="btn" disabled={!canTest} title={addrOk ? 'PLC\'den bir kez oku (yazma yapılmaz) · Enter' : 'Önce geçerli bir adres girin'} onClick={() => void runTest()}>{cur.state === 'run' ? <><span className="spin" aria-hidden="true" />Okunuyor…</> : cur.state === 'idle' ? 'Oku' : 'Tekrar oku'}</button>}
     </div>
     {addrMsg.text && <small className={'insp-msg ' + addrMsg.cls}>{addrMsg.text}</small>}
    </label>
    {quick.length > 0 && <div className="insp-quick" aria-label="Hızlı adres">{quick.map(([v, l]) => <button type="button" key={v} onClick={() => { if (fmt === 'delta') applyText(nextOf(v)); else setData((d) => { let dt = d.dataType; try { dt = parseS7Address(v).dataType; } catch { /* */ } return { ...d, s7Address: v, dataType: dt, bit: null, access: 'read' }; }); }}>{l}</button>)}</div>}
    {!sym && addrOk && <div className="insp-derived"><div><small>Alan</small><b>{AREA_INFO[data.area as keyof typeof AREA_INFO].short}</b></div><div><small>Modbus adresi</small><b>{data.address}</b></div><div><small>Kılavuz</small><b>{modbusRef(data.area, data.address)}</b></div><div><small>Tip</small><b>{data.dataType}{data.bit !== null && data.bit !== undefined ? '.' + data.bit : ''}</b></div></div>}
    {!ads && !opc && addrOk && (
     <div className={'insp-test ' + cur.state} aria-live="polite">
      {cur.state === 'idle' && <span className="t">Okuma testi yapılmadı<small>İsteğe bağlı. Kaydetmeden PLC'den bir kez okur, yazma yapmaz.</small></span>}
      {cur.state === 'run' && <><span className="spin" aria-hidden="true" /><span className="t">PLC'den okunuyor…</span></>}
      {cur.state === 'ok' && <><span className="t"><b><Check size={13} /> Yanıt geldi</b><small>{cur.ms} ms</small></span><span className="res mono">{fmtVal(cur.value, data.unit)}</span></>}
      {cur.state === 'bad' && <span className="t"><b><X size={13} /> Yanıt yok</b><small>{cur.error}</small></span>}
     </div>
    )}
   </section>}
   <section className="insp-sec">
    <div className="insp-grid">
     <F label="Kod"><input className="mono" value={data.code} maxLength={80} onChange={(e) => { autoCode.current = ''; patch('code', e.target.value); }} /></F>
     <F label="Ad"><input value={data.name} maxLength={80} placeholder="örn. Bakım lambası" onChange={(e) => patch('name', e.target.value)} /></F>
     <F label="Klasör"><input list="insp-group-list" value={data.group || ''} maxLength={60} placeholder="Klasörsüz" onChange={(e) => patch('group', e.target.value)} /><datalist id="insp-group-list">{groups.map((g) => <option key={g} value={g} />)}</datalist></F>
     {(!isBool || sym) && (fmt !== 'delta' || data.area === 'holding-register') && (
      <F label="Veri tipi">
       <select value={data.dataType} disabled={s7 || (!sym && area?.bool)} onChange={(e) => { const dt = e.target.value; setData((d) => ({ ...d, dataType: dt, bit: dt === 'uint16' || dt === 'int16' ? d.bit : null })); }}>
        {Object.entries(TYPE_INFO).filter(([k]) => (enip ? k in CIP_DATATYPE : bac ? !data.bacnetObjectType || (bacnetValueKind(data.bacnetObjectType, data.bacnetProperty || 'present-value') === 'bool') === (k === 'bool') : (area?.bool ? k === 'bool' : k !== 'bool') || sym)).map(([k, l]) => <option key={k} value={k}>{k} — {l}</option>)}
       </select>
      </F>
     )}
     <div className="field wide"><span>Erişim</span>
      <div className="insp-seg" role="radiogroup" aria-label="Erişim">
       <button type="button" role="radio" aria-checked={data.access === 'readwrite'} disabled={!!roReason} title={roReason || undefined} className={data.access === 'readwrite' ? 'active' : ''} onClick={() => patch('access', 'readwrite')}>Oku / yaz</button>
       <button type="button" role="radio" aria-checked={data.access === 'read'} className={data.access === 'read' ? 'active' : ''} onClick={() => patch('access', 'read')}>Salt okuma</button>
      </div>
      {roReason && <small className="insp-msg info">{roReason}</small>}
      {s7 && !roReason && data.access === 'readwrite' && <small className="insp-msg info">S7 yazma: PLC'de "Permit access with PUT/GET" açık, yazılan DB'de "Optimized block access" kapalı olmalı.</small>}
      {enip && data.access === 'readwrite' && <small className="insp-msg info">EtherNet/IP yazma: bağlantı çevrimiçiyken bir sonraki taramada yazılır, sonuç geri okumayla doğrulanır. Bağlantı yokken yazma reddedilir.</small>}
     </div>
    </div>
    {fresh && data.access === 'readwrite' && <label className="check insp-check"><input type="checkbox" checked={data._cmd !== false} onChange={(e) => patch('_cmd', e.target.checked)} />"{(data.name || data.code || 'Etiket')} kontrol" komutunu da oluştur</label>}
   </section>
   <section className="insp-sec">
    <button type="button" className="insp-adv" aria-expanded={adv} onClick={() => setAdv(!adv)}><ChevronDown size={14} />Gelişmiş · cihaz, açıklama, birim, ölçek, sınırlar, geçmiş kaydı</button>
    {adv && <>
     <div className="insp-grid">
      <div className="field wide"><span>Cihaz</span><SearchSelect ariaLabel="Cihaz" allowEmpty={false} value={data.deviceId} options={deviceOptions} onChange={(deviceId) => setData((d) => ({ ...d, deviceId, access: protoOf(deviceId) !== 'modbus' && protoOf(deviceId) !== protoOf(d.deviceId) ? 'read' : d.access }))} /></div>
      <F label="Açıklama" wide><textarea rows={2} value={data.description} onChange={(e) => patch('description', e.target.value)} placeholder="Sahadaki karşılığı, pano, not…" /></F>
      {!isBool && <F label="Birim"><input value={data.unit} maxLength={24} placeholder="°C, bar, kW…" onChange={(e) => patch('unit', e.target.value)} /></F>}
      {!isBool && !wide && !sym && <F label="Bit (isteğe bağlı)" tip="Register içindeki tek biti okumak için 0–15. Boşsa register'ın tamamı."><input className="mono" type="number" min={0} max={15} placeholder="—" value={data.bit ?? ''} onChange={(e) => patch('bit', e.target.value === '' ? null : Math.max(0, Math.min(15, Number(e.target.value))))} /></F>}
      {!isBool && <F label="Ölçek: değer × çarpan + offset" tip="Ham değer bu formülle mühendislik birimine çevrilir. Örn. 0,1 °C çözünürlüklü sensör: çarpan 0,1.">
       <div className="insp-pair"><input type="number" step="any" aria-label="Çarpan" value={data.scale} onChange={(e) => patch('scale', Number(e.target.value))} /><input type="number" step="any" aria-label="Offset" value={data.offset} onChange={(e) => patch('offset', Number(e.target.value))} /></div>
      </F>}
      {wide && !sym && <F label="Register sırası" tip="32 bit değer iki register'dan oluşur. Değer anlamsız görünüyorsa 'Küçük önce' deneyin; okuma testi farkı hemen gösterir.">
       <select value={data.wordOrder || 'big'} onChange={(e) => patch('wordOrder', e.target.value)}><option value="big">Büyük önce (AB CD)</option><option value="little">Küçük önce (CD AB)</option></select>
      </F>}
      {wide && !sym && <F label="Bayt sırası"><select value={data.byteOrder || 'big'} onChange={(e) => patch('byteOrder', e.target.value)}><option value="big">Büyük önce</option><option value="little">Küçük önce (bayt takası)</option></select></F>}
      {!isBool && data.access === 'readwrite' && <F label="Yazma sınırı (alt – üst)" tip="Operatörün yazabileceği mühendislik değeri aralığı. Dışındaki değer sunucuda reddedilir.">
       <div className="insp-pair"><input type="number" step="any" aria-label="Alt sınır" value={data.min} onChange={(e) => patch('min', Number(e.target.value))} /><input type="number" step="any" aria-label="Üst sınır" value={data.max} onChange={(e) => patch('max', Number(e.target.value))} /></div>
      </F>}
      {!isBool && data.access === 'readwrite' && <F label="Doğrulama toleransı (boşsa otomatik)" tip={<>Yazılan ile geri okunan değer arasındaki izinli fark ({data.unit || 'birim'}). Pay genişledikçe "doğrulandı" iddiası zayıflar.</>}>
       <input type="number" step="any" min={0} placeholder={data.dataType === 'float32' ? 'Otomatik: float32 temsil hatası' : 'Otomatik: tam eşitlik'} value={data.verifyTolerance ?? ''} onChange={(e) => patch('verifyTolerance', e.target.value === '' ? null : Math.abs(Number(e.target.value)))} />
      </F>}
     </div>
     <label className="check insp-check"><input type="checkbox" checked={!!data.history} onChange={(e) => patch('history', e.target.checked)} />Geçmiş kaydı (trend ve raporlar için)</label>
     {data.history && (
      <div className="insp-grid">
       {!isBool && <F label={'Ölü bant' + (data.unit ? ' (' + data.unit + ')' : '')}><input type="number" step="any" min={0} value={data.historyDeadband ?? 0} onChange={(e) => patch('historyDeadband', Math.max(0, Number(e.target.value) || 0))} /></F>}
       <F label="Değişmese de kaydet (sn)"><input type="number" min={5} max={3600} value={Math.round((data.historyMaxGapMs ?? 60000) / 1000)} onChange={(e) => patch('historyMaxGapMs', Math.max(5, Math.min(3600, Number(e.target.value) || 60)) * 1000)} /></F>
      </div>
     )}
     {!isBool && !sym && preview}
    </>}
   </section>
   {usage && (() => { const curU = usage.filter((r) => r.group !== 'revision'), old = usage.length - curU.length; return (
    <Sec title="Kullanıldığı yerler" right={<span className="insp-meta">{curU.length ? curU.length + ' yer' : 'kullanılmıyor'}</span>}>
     {curU.length ? <ul className="insp-usage">{curU.map((r, i) => (
      <li key={i}><span className={'insp-kind ' + r.group}>{r.group === 'screen' ? 'Ekran' : r.group === 'command' ? 'Komut' : 'Alarm'}</span><div><strong>{r.text}</strong><small>{r.detail}</small></div>{r.screenId && <button type="button" className="link-btn" onClick={() => onScreen(r.screenId!)}>Ekrana git<ArrowUpRight size={12} /></button>}</li>
     ))}</ul> : <p className="insp-hint">Bu etiket şu an hiçbir ekran, komut veya alarmda kullanılmıyor.</p>}
     {old > 0 && <p className="insp-hint">Ayrıca {old} eski ekran sürümünde geçiyor (geri alınırsa yeniden kullanılır).</p>}
    </Sec>
   ); })()}
  </div>
 );
}
