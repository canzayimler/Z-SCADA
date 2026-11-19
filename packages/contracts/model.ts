import {z} from 'zod';
import {portCount} from '../screen-model/ports';
import {symbolTypes,labels,symbolGroups,sizes,defaultParts,partTypes,buttonTypes,flatTypes,commandTypes,bindingDefs,bindingDef,familyOf,variantsOf,variantKey,dynamicBindings,isDynamicRole,allowsStateRules,labelIsContent,type SymbolType,type BindingDef} from '../symbols/catalog';
import {frameForDrawing} from '../symbols/frame';
import {checkScript,SCRIPT_LIMITS,type TagRef} from './script';
export {symbolTypes,labels,symbolGroups,sizes,defaultParts,partTypes,buttonTypes,bindingDefs,bindingDef,familyOf,variantsOf,variantKey,dynamicBindings,isDynamicRole,allowsStateRules};
export type {BindingDef};
export type {SymbolType};
/** Boru ailesi: goruntu kutusu nesne olcusune gerilir (eski ad korunuyor). */
export const wide=flatTypes;
const id=z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const name=z.string().trim().min(1).max(100);
export const connectionSchema=z.object({id,name,host:z.string().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/).default('localhost'),port:z.number().int().min(1).max(65535).default(502),timeout:z.number().int().min(500).max(10000),
 /* B43: protokol ayrimi. Bu alanlar bilerek .optional() (default() DEGIL): zod'da .default() eklenen bir alan
  * parse CIKTISINDA (TS turunde) yine de ZORUNLU olur — bu da bu alanlari bilmeyen, dogrudan nesne harfiyle
  * (object literal) Connection/Tag kuran mevcut cagri yerlerini (baska ekiplerin dokunmadigimiz test/kod
  * dosyalari dahil) derleme zamaninda kirar. .optional() ile alan hem girdide hem ciktida istege baglidir;
  * "varsayilan" degeri her okuma noktasinda (validateConfig, driver.ts) `??` ile acikca uygulanir; boylece
  * eski yapilandirmalar/nesneler protocol/nodeId belirtmeden de calismaya devam eder. */
 protocol:z.enum(['modbus-tcp','modbus-rtu','opc-ua','s7','ads','mqtt','snmp','http','sql','bacnet','enip']).optional(),
 // Modbus RTU (RS-485): rtuTransport 'serial' = bu PC'nin COM portu; 'tcp' = RTU cercevesini TCP'ye
 // tasiyan ag gecidi (ETOR vb. "RTU over TCP" modu), host/port gecidin adresidir.
 // serialMode 'ascii': Delta DVP seri portlarinin fabrika ayari Modbus ASCII'dir (9600, 7, E, 1).
 rtuTransport:z.enum(['serial','tcp']).optional(),
 serialPort:z.string().max(60).regex(/^[A-Za-z0-9_./-]*$/).optional(),
 baudRate:z.number().int().min(300).max(921600).optional(),
 parity:z.enum(['none','even','odd']).optional(),
 dataBits:z.union([z.literal(7),z.literal(8)]).optional(),
 stopBits:z.union([z.literal(1),z.literal(2)]).optional(),
 serialMode:z.enum(['rtu','ascii']).optional(),
 // Siemens S7 (S7comm, ISO-on-TCP 102): rack/slot. S7-1200/1500 genelde 0/1, S7-300 0/2. Tanimsizsa 0/1.
 rack:z.number().int().min(0).max(7).optional(),
 slot:z.number().int().min(0).max(31).optional(),
 // Beckhoff ADS (TwinCAT, TCP 48898): host = PLC IP (router adresi). amsNetId = PLC'nin AMS Net ID'si,
 // adsPort = PLC calisma zamani (TC3 ilk runtime 851, TC2 801). localAmsNetId bu PC icin PLC'nin
 // StaticRoutes.xml'ine yazilan kimlik; bos ise yerel TwinCAT router kullanilir.
 amsNetId:z.string().max(40).optional(),
 adsPort:z.number().int().min(1).max(65535).optional(),
 localAmsNetId:z.string().max(40).optional(),
 // MQTT (Node-RED cekirdek mqtt-broker): host/port = broker (1883, TLS'te 8883). mqttTls: Node-RED
 // tls-config ile sunucu sertifikasi DOGRULANARAK baglanir (ozel CA yukleme yok, Node'un kok CA listesi).
 // clientId bossa makine basina deterministik 'zscada-<makine>-<baglanti>' (aktif/yedek cakismaz; bkz. driver.ts mqttClientId). mqttKeepalive saniye (varsayilan 60), mqttCleanSession
 // varsayilan true. Kullanici/parola yalniz connection-secrets.json'da (bkz. connectionSecrets.ts).
 mqttTls:z.boolean().optional(),
 clientId:z.string().max(100).regex(/^[A-Za-z0-9_.:-]*$/).optional(),
 mqttKeepalive:z.number().int().min(5).max(3600).optional(),
 mqttCleanSession:z.boolean().optional(),
 // SNMP (node-red-node-snmp, UDP 161): host/port = ajan. v1/v2c community ve v3 kullanici/anahtarlar YALNIZ
 // connection-secrets.json'da (community Node-RED'e sekme ortam degiskeni 'cred' olarak gider; bkz. driver.ts snmpDriver).
 // Port 161 disi yalniz IPv4 adreste calisir (paket ad cozulen host'ta portu yok sayar).
 snmpVersion:z.enum(['1','2c','3']).optional(),
 snmpSecurityLevel:z.enum(['noAuthNoPriv','authNoPriv','authPriv']).optional(),
 snmpAuthProtocol:z.enum(['MD5','SHA','SHA224','SHA256','SHA384','SHA512']).optional(),
 snmpPrivProtocol:z.enum(['DES','AES']).optional(),
 // HTTP/REST (Node-RED cekirdek 'http request'): temel adres (yalniz http/https; kullanici bilgisi/sorgu yok) ve
 // kimlik dogrulama turu. Kullanici/parola (basic) ve token (bearer) yalniz connection-secrets.json'da.
 httpBaseUrl:z.string().max(300).optional(),
 httpAuth:z.enum(['none','basic','bearer']).optional(),
 // SQL (node-red-contrib-mssql-plus): host/port = SQL Server (1433); istege bagli adli ornek (SQLEXPRESS: port yerine
 // SQL Browser), veritabani, sifreleme (varsayilan acik), sunucu sertifikasina kosulsuz guven (varsayilan kapali).
 // Kullanici/parola yalniz connection-secrets.json'da. Veritabani kullanicisi salt okunur olmali (db_datareader).
 sqlDialect:z.enum(['mssql']).optional(),
 sqlDatabase:z.string().max(128).optional(),
 sqlInstance:z.string().max(16).optional(),
 sqlEncrypt:z.boolean().optional(),
 sqlTrustServerCertificate:z.boolean().optional(),
 // BACnet/IP (yerel node-red-zscada-bacnet, UDP): host/port = cihazin IPv4 adresi ve portu (47808). Cihaza TEKIL (unicast)
 // adresle gidilir; Who-Is/yayin gonderilmez. bacnetDeviceInstance = cihaz nesne numarasi (kimlik, 0-4194302).
 // bacnetLocalPort = bu PC'de istemcinin dinledigi UDP portu (varsayilan 47809: ayni PC'deki BMS yazilimi 47808'i tutar);
 // bacnetLocalAddress = istege bagli yerel arayuz IPv4'u (bos = tum arayuzler). APDU zaman asimi = timeout.
 bacnetDeviceInstance:z.number().int().min(0).max(4194302).optional(),
 bacnetLocalPort:z.number().int().min(1).max(65535).optional(),
 bacnetLocalAddress:z.string().max(15).regex(/^[0-9.]*$/).optional(),
 // EtherNet/IP (CIP; node-red-contrib-cip-ethernet-ip): host = denetleyici IP, port 44818 (paket sabit), slot = CPU'nun
 // sasi yuvasi (Logix genelde 0; Omron NX/NJ 0), enipCycleMs = tarama cevrimi (bos = cihazlarin en kisa taramasi).
 enipCycleMs:z.number().int().min(100).max(60000).optional(),
 // OPC UA'ya ozgu alanlar; modbus baglantilarinda kullanilmaz ve bos/tanimsiz kalir.
 endpoint:z.string().max(300).optional(),
 securityMode:z.enum(['none','sign','sign-encrypt']).optional(),
 securityPolicy:z.string().max(120).optional(),
 // KULLANILMIYOR (geriye donuk uyumluluk): OPC UA kullanici/parola connection-secrets.json'dadir; bu alan yok sayilir.
 username:z.string().max(120).optional(),
 certificateThumbprint:z.string().max(200).optional(),
 publishingIntervalMs:z.number().int().min(50).max(60000).optional()});
export type Connection=z.infer<typeof connectionSchema>;
/** Baglantinin etkin protokolu; alan tanimsizsa geriye donuk uyumluluk icin 'modbus-tcp' varsayilir. */
export type Protocol='modbus-tcp'|'modbus-rtu'|'opc-ua'|'s7'|'ads'|'mqtt'|'snmp'|'http'|'sql'|'bacnet'|'enip';
export function connectionProtocol(c:{protocol?:Protocol}):Protocol{return c.protocol??'modbus-tcp';}
export const protocolLabels:Record<Protocol,string>={'modbus-tcp':'Modbus TCP','modbus-rtu':'Modbus RTU','opc-ua':'OPC UA','s7':'Siemens S7','ads':'Beckhoff ADS','mqtt':'MQTT','snmp':'SNMP','http':'HTTP/REST','sql':'SQL Server','bacnet':'BACnet/IP','enip':'EtherNet/IP (CIP)'};
/** Modbus ailesi (TCP + RTU): alan/register/slave ID mantigi ve yazma yolu ortak. */
export function isModbus(c:{protocol?:Protocol}):boolean{const p=connectionProtocol(c);return p==='modbus-tcp'||p==='modbus-rtu';}
/** Sembolik adresli protokoller (S7, ADS, OPC UA, MQTT, SNMP, HTTP, SQL, BACnet, EtherNet/IP): Modbus alan/register/slave ID
 * mantigi yoktur, etiket kendi adres alanindan (s7Address / adsSymbol / nodeId / mqttTopic / snmpOid / httpPath / sqlQuery /
 * bacnetObjectType+bacnetInstance / cipTag) okunur. Bos/tanimsiz protokol sembolik degildir. */
export type SymbolicProtocol='s7'|'ads'|'opc-ua'|'mqtt'|'snmp'|'http'|'sql'|'bacnet'|'enip';
export function isSymbolicProtocol(p:Protocol|''|null|undefined):p is SymbolicProtocol{return p==='s7'||p==='ads'||p==='opc-ua'||p==='mqtt'||p==='snmp'||p==='http'||p==='sql'||p==='bacnet'||p==='enip';}
/** Yalniz okunur protokoller: yazma dali yok, validate oku/yaz etiketi reddeder. */
export function isReadOnlyProtocol(p:Protocol|''|null|undefined):boolean{return p==='mqtt'||p==='snmp'||p==='http'||p==='sql'||p==='bacnet';}
/** Sembolik protokolde etiketin adresini tutan (birincil) alanin adi; Modbus icin null.
 * MQTT'de birincil alan konudur (mqttTopic); JSON yolu (mqttJsonPath) ayri alandir, symbolicAddressOf ikisini birlestirir.
 * HTTP'de yol (httpPath) + JSON yolu; SQL'de sorgu (sqlQuery) + sutun (sqlColumn). BACnet'te nesne tipi (bacnetObjectType)
 * + numara (bacnetInstance) + ozellik (bacnetProperty); EtherNet/IP'de CIP etiket adi (cipTag). */
export function symbolicAddressField(p:Protocol|''|null|undefined):'s7Address'|'adsSymbol'|'nodeId'|'mqttTopic'|'snmpOid'|'httpPath'|'sqlQuery'|'bacnetObjectType'|'cipTag'|null{
 return p==='s7'?'s7Address':p==='ads'?'adsSymbol':p==='opc-ua'?'nodeId':p==='mqtt'?'mqttTopic':p==='snmp'?'snmpOid':p==='http'?'httpPath':p==='sql'?'sqlQuery':p==='bacnet'?'bacnetObjectType':p==='enip'?'cipTag':null;
}
/** Etiketin sembolik adresi (ham alan degeri, kirpilmaz); baglanti Modbus ise ya da yoksa undefined.
 * MQTT: konu + (JSON yolu varsa) ' · ' + yol, orn. 'hat1/sensor · data.temp'. HTTP: yol + ' · ' + JSON yolu.
 * SQL: sutun + ' · ' + sorgu (sorgu uzun olabilir; sutun once). BACnet: 'AV 12' (+ ' · ozellik', present-value disinda). */
export function symbolicAddressOf(tag:{s7Address?:string;adsSymbol?:string;nodeId?:string;mqttTopic?:string;mqttJsonPath?:string;snmpOid?:string;httpPath?:string;httpJsonPath?:string;sqlQuery?:string;sqlColumn?:string;bacnetObjectType?:BacnetObjectType;bacnetInstance?:number;bacnetProperty?:BacnetProperty;cipTag?:string},conn:{protocol?:Protocol}|null|undefined):string|undefined{
 const field=conn?symbolicAddressField(conn.protocol):null;
 if(field==='bacnetObjectType'){if(!tag.bacnetObjectType)return undefined;const p=tag.bacnetProperty??'present-value';return bacnetObjectText(tag.bacnetObjectType,tag.bacnetInstance)+(p!=='present-value'?' · '+p:'');}
 if(field==='mqttTopic'){const topic=tag.mqttTopic;if(topic===undefined)return undefined;const p=(tag.mqttJsonPath??'').trim();return p?topic+' · '+p:topic;}
 if(field==='httpPath'){const path=tag.httpPath;if(path===undefined)return undefined;const p=(tag.httpJsonPath??'').trim();return p?path+' · '+p:path;}
 if(field==='sqlQuery'){const q=tag.sqlQuery;if(q===undefined)return undefined;const col=(tag.sqlColumn??'').trim();return col?col+' · '+q:q;}
 return field?tag[field]:undefined;
}
/* --- MQTT adresleme ve cozme ------------------------------------------------
 * Etiket = konu (joker YOK: + ve # reddedilir; her etiket tek bir konudan okur) + istege bagli JSON yolu
 * (noktali ad + [n] dizin, orn. data.temp, values[0], [2].v; bos = yukun tamami) + istege bagli zaman
 * damgasi yolu. Asagidaki mqtt* saf fonksiyonlar Node-RED donusum dugumune .toString() ile gomulur
 * (modbusCodecSource deseni); bu yuzden ic ice fonksiyon/dis bagimlilik ICERMEZLER. */
/** MQTT konusu: bos degil, joker (+ #) ve NUL yok, en cok 256 karakter. Kirpilmis konuyu dondurur, gecersizse Turkce hata. */
export function parseMqttTopic(input:string):string{
 const s=String(input??'').trim();
 if(!s)throw Error('MQTT konusu gerekli, örn. hat1/sicaklik.');
 if(s.length>256)throw Error('MQTT konusu 256 karakteri aşamaz.');
 if(/[+#]/.test(s))throw Error('MQTT konusunda joker (+ veya #) kullanılamaz: "'+s+'". Her etiket tek bir konudan okur.');
 if(s.includes('\u0000'))throw Error('MQTT konusunda NUL karakteri olamaz.');
 return s;
}
/** JSON yolu adimlari: 'data.temp' -> ['data','temp'], 'values[0]' -> ['values',0], '' -> []. Gecersizse Turkce hata. */
export function mqttPathSteps(input:string|undefined|null):(string|number)[]{
 const s=String(input??'').trim();
 if(!s)return [];
 if(s.length>200||!/^(?:[A-Za-z0-9_$-]+|\[\d{1,6}\])(?:\[\d{1,6}\])*(?:\.[A-Za-z0-9_$-]+(?:\[\d{1,6}\])*)*$/.test(s))
  throw Error('JSON yolu anlaşılamadı: "'+s+'". Örnek: data.temp, values[0] ya da boş (yükün tamamı).');
 const steps:(string|number)[]=[];
 for(const part of s.split('.')){
  const m=/^([^[]*)((?:\[\d+\])*)$/.exec(part)!;
  if(m[1])steps.push(m[1]);
  for(const i of m[2].matchAll(/\[(\d+)\]/g))steps.push(Number(i[1]));
 }
 return steps;
}
/** Yukten (JSON.parse edilmis ya da duz metin) adimlarla deger cikarir; yol yoksa undefined. Gomulur: dis bagimlilik yok. */
export function mqttExtract(body:unknown,steps:(string|number)[]):unknown{
 let cur:any=body;
 for(let i=0;i<steps.length;i++){
  const k=steps[i];
  if(cur===null||typeof cur!=='object')return undefined;
  if(typeof k==='number'){if(!Array.isArray(cur)||k>=cur.length)return undefined;cur=cur[k];}
  else{if(Array.isArray(cur)||!Object.prototype.hasOwnProperty.call(cur,k))return undefined;cur=cur[k];}
 }
 return cur;
}
/** Ham degeri etiket tipine cevirir; cevrilemezse null (kalite 'bad' — asla sahte 'good' uretilmez). Gomulur.
 * bool: true/false, 1/0, 'true'/'false'/'on'/'off'/'1'/'0' (buyuk-kucuk harf ve bosluk onemsiz).
 * Sayisal: sonlu sayi ya da ondalik sayi metni ('23.5', '-4', '1e3'; '0x10', '' ve bool DEGIL);
 * tam sayi tiplerinde tam sayi ve tip araliginda olmali. */
export function mqttCoerce(raw:unknown,dataType:string):number|boolean|null{
 if(dataType==='bool'){
  if(typeof raw==='boolean')return raw;
  if(raw===1||raw===0)return raw===1;
  if(typeof raw==='string'){const t=raw.trim().toLowerCase();if(t==='true'||t==='on'||t==='1')return true;if(t==='false'||t==='off'||t==='0')return false;}
  return null;
 }
 let n:number;
 if(typeof raw==='number')n=raw;
 else if(typeof raw==='string'&&/^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(raw))n=Number(raw);
 else return null;
 if(!Number.isFinite(n))return null;
 const lim=dataType==='int16'?[-32768,32767]:dataType==='uint16'?[0,65535]:dataType==='int32'?[-2147483648,2147483647]:dataType==='uint32'?[0,4294967295]:null;
 if(lim&&(!Number.isInteger(n)||n<lim[0]||n>lim[1]))return null;
 return n;
}
/** Yukteki zaman damgasi (ISO metni ya da epoch ms; sayi veya sayi metni) gecerli ve kabul penceresindeyse onu,
 * degilse alis zamanini (now) dondurur. Pencere sunucu ingest penceresinden (now-60 sn, now+2 sn) bilerek dar:
 * Node-RED'den sunucuya gecis payi. Gomulur. NOT: pencere disi (ornegin cok eski, retained) damga alis zamanina
 * duser; yani damga yolu tek basina eski bir degeri bayat gostermez — bayatlik cihazin staleMs'iyle izlenir. */
export function mqttTimestamp(raw:unknown,now:number):number{
 let t=NaN;
 if(typeof raw==='number')t=raw;
 else if(typeof raw==='string'){const s=raw.trim();t=/^\d{10,16}(\.\d+)?$/.test(s)?Number(s):Date.parse(s);}
 if(!Number.isFinite(t))return now;
 t=Math.floor(t);
 return t<=now+1000&&t>=now-55000?t:now;
}
/** Node-RED donusum dugumune gomulecek kaynak (saf fonksiyonlar). */
export function mqttCodecSource():string{return [mqttExtract,mqttCoerce,mqttTimestamp].map(f=>f.toString()).join('\n');}
/* --- SNMP / HTTP / SQL adresleme ve cozme (salt okuma) ---------------------
 * Ucu de yalniz okur (oku/yaz etiketi reddedilir). Tip cevirme MQTT ile ortaktir (mqttCoerce): sonlu sayi, sayi
 * metni ve bool kelimeleri; cevrilemeyen deger quality 'bad' (sahte 'good' YOK). Gomulen fonksiyonlar dis
 * bagimlilik icermez (mqttCodecSource deseni). */
/** SNMP OID: yalniz sayisal noktali bicim (MIB adi YOK), bastaki nokta atilir, 2-128 yay, ilk yay 0-2, her yay 32 bit.
 * Normal bicim (bastaki sifirlar atilmis) doner; gecersizse Turkce hata. */
export function parseSnmpOid(input:string):string{
 const s=String(input??'').trim().replace(/^\./,'');
 if(!s)throw Error('SNMP OID gerekli, örn. 1.3.6.1.2.1.1.3.0.');
 if(s.length>200||!/^\d{1,10}(\.\d{1,10}){1,127}$/.test(s))throw Error('SNMP OID anlaşılamadı: "'+String(input).trim()+'". Yalnız sayısal noktalı biçim, örn. 1.3.6.1.2.1.1.3.0 (MIB adı kullanılmaz).');
 const arcs=s.split('.').map(Number);
 if(arcs[0]>2||(arcs[0]<2&&arcs[1]>39)||arcs.some(a=>a>4294967295))throw Error('SNMP OID geçersiz: "'+s+'". İlk yay 0-2 olmalı, her yay 32 bit sınırında.');
 return arcs.join('.');
}
/** SNMP varbind -> ham deger (sonra mqttCoerce). net-snmp tipleri: Integer/Counter32/Gauge32/TimeTicks sayi; Counter64
 * Buffer (buyuk endian; 2^53 ustu undefined); OctetString Buffer -> metin (en cok 64 bayt; sayi metni ise cevrilir);
 * Null/OID/IpAddress/Opaque, hata tipleri (noSuchObject 128, noSuchInstance 129, endOfMibView 130) ve varbind hatasi
 * (_error) undefined. JSON'a donmus Buffer ({type:'Buffer',data}) de kabul. Gomulur: dis bagimlilik yok. */
export function snmpRaw(vb:any):unknown{
 if(!vb||typeof vb!=='object'||vb._error!==undefined)return undefined;
 const t=vb.type,v=vb.value;
 if(v===null||v===undefined||t===5||t===6||t===64||t===68||t===128||t===129||t===130)return undefined;
 if(typeof v==='number'||typeof v==='boolean')return v;
 if(typeof v==='bigint'){const n=Number(v);return Number.isSafeInteger(n)?n:undefined;}
 if(typeof v==='string')return t===4?v:undefined;
 let bytes:any=null;
 if(typeof v==='object'){if(v.type==='Buffer'&&Array.isArray(v.data))bytes=v.data;else if(typeof v.length==='number')bytes=v;}
 if(!bytes)return undefined;
 if(t===70){if(bytes.length>9)return undefined;let n=0;for(let i=0;i<bytes.length;i++)n=n*256+(bytes[i]&255);return n<=9007199254740991?n:undefined;}
 if(t===4){if(bytes.length>64)return undefined;let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]&255);return s;}
 return undefined;
}
/** SNMP donusum dugumune gomulecek kaynak. */
export function snmpCodecSource():string{return [mqttCoerce,snmpRaw].map(f=>f.toString()).join('\n');}
/** HTTP temel adresi: http/https; kullanici bilgisi (user:pass@), sorgu, #, {} , bosluk, ters bolu YOK.
 * Normal bicim: origin + yol (sondaki / atilir). Gecersizse Turkce hata. */
export function parseHttpBaseUrl(input:string):string{
 const s=String(input??'').trim();
 if(!s)throw Error('HTTP temel adresi gerekli, örn. http://203.0.113.20/api.');
 if(s.length>300)throw Error('HTTP temel adresi 300 karakteri aşamaz.');
 if(/[\s{}\\<>"`|^]/.test(s)||/[\u0000-\u001f\u007f]/.test(s))throw Error('HTTP temel adresinde boşluk, {}, ters bölü, tırnak veya kontrol karakteri olamaz.');
 if(!/^https?:\/\/[^/]/i.test(s))throw Error('HTTP temel adresi http:// veya https:// ile başlamalı.');
 let u:URL;
 try{u=new URL(s);}catch{throw Error('HTTP temel adresi anlaşılamadı: "'+s+'". Örnek: http://203.0.113.20/api');}
 if(u.username||u.password||s.slice(s.indexOf('//')+2).split('/')[0].includes('@'))throw Error('HTTP temel adresinde kullanıcı adı/parola olamaz; kimlik bilgisini bağlantının giriş bölümüne girin.');
 if(u.search||u.hash||s.includes('?')||s.includes('#'))throw Error('HTTP temel adresinde sorgu (?) veya # olamaz; sorguyu etiketin yoluna yazın.');
 return u.origin+u.pathname.replace(/\/+$/,'');
}
/** HTTP etiket yolu: temel adrese eklenen goreli yol (+ istege bagli sorgu). Sema/sunucu enjeksiyonu yok: '/' ile baslar
 * (yoksa eklenir); sema, '//', '.'/'..' bolumu, bosluk, '#', '{}', ters bolu, tirnak, kodlanmis nokta/bolu/NUL
 * (%2e %2f %5c %00) ve bozuk % reddedilir. Gecersizse Turkce hata. */
export function parseHttpPath(input:string):string{
 const s=String(input??'').trim();
 if(!s)throw Error('HTTP yolu gerekli, örn. /api/v1/olcum veya /durum?hat=3.');
 if(s.length>300)throw Error('HTTP yolu 300 karakteri aşamaz.');
 if(!/^[A-Za-z0-9\-._~!$&()*+,;=:@%/?]+$/.test(s))throw Error('HTTP yolunda izin verilmeyen karakter var: "'+s+'". Boşluk, #, {}, ters bölü ve tırnak kullanılmaz.');
 if(/^[A-Za-z][A-Za-z0-9+.-]*:/.test(s)||s.startsWith('//'))throw Error('HTTP yolu göreli olmalı (şema/sunucu yazılmaz): "'+s+'". Sunucu bağlantının temel adresinden gelir.');
 const p=s.startsWith('/')?s:'/'+s;
 const pathPart=p.split('?')[0];
 if(pathPart.includes('//'))throw Error('HTTP yolunda boş bölüm (//) olamaz.');
 if(/(^|\/)\.{1,2}(\/|$)/.test(pathPart))throw Error('HTTP yolunda . veya .. bölümü olamaz.');
 if(/%(?![0-9A-Fa-f]{2})/.test(p))throw Error('HTTP yolunda bozuk yüzde kodlaması var.');
 if(/%(2e|2f|5c|00)/i.test(p))throw Error('HTTP yolunda kodlanmış nokta, bölü veya NUL (%2e %2f %5c %00) olamaz.');
 return p;
}
/** Temel adres + yol -> istek adresi; sonuc temel adresin origin'inde ve yolu altinda kalmali (savunma). */
export function httpRequestUrl(base:string,path:string):string{
 const b=parseHttpBaseUrl(base),url=b+parseHttpPath(path);
 const u=new URL(url),bu=new URL(b);
 if(u.origin!==bu.origin||!u.pathname.startsWith(bu.pathname))throw Error('HTTP yolu temel adresin dışına çıkıyor: '+path);
 return url;
}
/** SQL sorgusu: TEK, parametresiz SELECT. Tirnakli metin ('..', '' kacisli), [..] ve ".." tanimlayicilar once ayiklanir
 * (icerikleri anahtar kelime sayilmaz; kapanmayan tirnak red). Sonra: ; YOK, yorum (-- ve blok yorum) YOK, { } YOK,
 * SELECT ile baslar, degistiren/calistiran anahtar kelime ve kilit ipuclari (SQL_FORBIDDEN_WORDS, xp_*, sp_*) YOK.
 * Savunma katmanidir; asil guvence veritabani kullanicisinin salt okunur olmasidir. Gecersizse Turkce hata. */
export const SQL_FORBIDDEN_WORDS=['insert','update','delete','merge','exec','execute','drop','alter','create','truncate','grant','revoke','deny','into',
 'backup','restore','shutdown','kill','dbcc','bulk','openrowset','opendatasource','openquery','openxml','waitfor','declare','set','use','reconfigure','go',
 'begin','commit','rollback','save','transaction','checkpoint','readtext','writetext','updatetext','xlock','updlock','tablockx','holdlock'];
export function checkSqlQuery(input:string):string{
 const s=String(input??'').trim();
 if(!s)throw Error('SQL sorgusu gerekli, örn. SELECT TOP 1 Sicaklik FROM dbo.Olcum ORDER BY Zaman DESC');
 if(s.length>2000)throw Error('SQL sorgusu 2000 karakteri aşamaz.');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s))throw Error('SQL sorgusunda kontrol karakteri olamaz.');
 let rest='';
 for(let i=0;i<s.length;){
  const ch=s[i];
  const close=ch==="'"?"'":ch==='['?']':ch==='"'?'"':'';
  if(!close){rest+=ch;i++;continue;}
  let j=i+1;
  for(;;){
   const k=s.indexOf(close,j);
   if(k<0)throw Error('SQL sorgusunda kapanmayan '+(ch==='['?'köşeli parantez':'tırnak')+' var.');
   if(s[k+1]===close){j=k+2;continue;}
   i=k+1;break;
  }
  rest+=ch==="'"?" '' ":' [x] ';
 }
 if(/--|\/\*|\*\//.test(rest))throw Error('SQL sorgusunda yorum (-- veya /* */) kullanılmaz.');
 if(rest.includes(';'))throw Error('SQL sorgusu tek ifade olmalı: noktalı virgül (;) kullanılmaz.');
 if(/[{}]/.test(rest))throw Error('SQL sorgusunda { } kullanılmaz.');
 if(!/^\s*select\b/i.test(rest))throw Error('SQL sorgusu SELECT ile başlamalı (yalnız okuma).');
 const bad=new RegExp('\\b('+SQL_FORBIDDEN_WORDS.join('|')+'|xp_\\w*|sp_\\w*)\\b','i').exec(rest);
 if(bad)throw Error('SQL sorgusunda "'+bad[1].toUpperCase()+'" kullanılamaz: yalnız tek bir SELECT okunur.');
 return s;
}
/** SQL sutun adi: bos olmayan, kontrol karakteri icermeyen, en cok 128 karakter. */
export function checkSqlColumn(input:string|undefined):string{
 const s=String(input??'').trim();
 if(!s)throw Error('SQL sütun adı gerekli (sorgunun döndürdüğü sütun).');
 if(s.length>128||/[\u0000-\u001f\u007f]/.test(s))throw Error('SQL sütun adı en çok 128 karakter olmalı ve kontrol karakteri içermemeli.');
 return s;
}
/** Sorgu sonucunun ILK satirindan sutun degeri (tam ad, yoksa buyuk-kucuk harf duyarsiz); satir/sutun yoksa undefined. Gomulur. */
export function sqlCell(rows:unknown,column:string):unknown{
 if(!Array.isArray(rows)||!rows.length)return undefined;
 const row=rows[0];
 if(!row||typeof row!=='object'||Array.isArray(row))return undefined;
 if(Object.prototype.hasOwnProperty.call(row,column))return (row as any)[column];
 const lc=column.toLowerCase();
 for(const k of Object.keys(row))if(k.toLowerCase()===lc)return (row as any)[k];
 return undefined;
}
/** SQL donusum dugumune gomulecek kaynak. */
export function sqlCodecSource():string{return [mqttCoerce,sqlCell].map(f=>f.toString()).join('\n');}
/* --- BACnet/IP adresleme ve cozme (salt okuma) ------------------------------
 * Etiket = nesne tipi + nesne numarasi + ozellik (varsayilan present-value). Okuma ReadPropertyMultiple ile, cihazin
 * TEKIL (unicast) IP:port adresine gider; Who-Is/yayin YOK (cihaz adresi elle verilir). Yazma kapsam disi: BACnet
 * yazmasi oncelik dizisi (priority-array 1-16) ve birakma (relinquish) kurallari ister; yanlis oncelikle yazmak BMS'in
 * kendi kontrolunu ezer ya da hic etkisiz kalir — validate oku/yaz etiketi Turkce gerekceyle reddeder.
 * Asagidaki bacnet* cozme fonksiyonlari donusum dugumune .toString() ile gomulur (dis bagimlilik yok). */
/** Desteklenen nesne tipleri -> BACnet ObjectType numarasi (ASHRAE 135). */
export const BACNET_OBJECT_TYPES={'analog-input':0,'analog-output':1,'analog-value':2,'binary-input':3,'binary-output':4,'binary-value':5,
 'multi-state-input':13,'multi-state-output':14,'multi-state-value':19} as const;
export type BacnetObjectType=keyof typeof BACNET_OBJECT_TYPES;
export const BACNET_OBJECT_TYPE_NAMES=Object.keys(BACNET_OBJECT_TYPES) as [BacnetObjectType,...BacnetObjectType[]];
/** Kisa adlar (BMS listelerinde yaygin): AI/AO/AV, BI/BO/BV, MI/MO/MV (MSI/MSO/MSV da kabul). */
export const BACNET_OBJECT_SHORT:Record<BacnetObjectType,string>={'analog-input':'AI','analog-output':'AO','analog-value':'AV','binary-input':'BI','binary-output':'BO','binary-value':'BV',
 'multi-state-input':'MI','multi-state-output':'MO','multi-state-value':'MV'};
export const bacnetObjectTypeLabels:Record<BacnetObjectType,string>={'analog-input':'Analog giriş (AI)','analog-output':'Analog çıkış (AO)','analog-value':'Analog değer (AV)',
 'binary-input':'Dijital giriş (BI)','binary-output':'Dijital çıkış (BO)','binary-value':'Dijital değer (BV)',
 'multi-state-input':'Çok durumlu giriş (MI)','multi-state-output':'Çok durumlu çıkış (MO)','multi-state-value':'Çok durumlu değer (MV)'};
/** Okunabilir ozellikler -> BACnet PropertyIdentifier numarasi. */
export const BACNET_PROPERTIES={'present-value':85,'relinquish-default':104,'out-of-service':81,'high-limit':45,'low-limit':59,'deadband':25,'cov-increment':22,
 'min-pres-value':69,'max-pres-value':65,'number-of-states':74,'reliability':103,'event-state':36} as const;
export type BacnetProperty=keyof typeof BACNET_PROPERTIES;
export const BACNET_PROPERTY_NAMES=Object.keys(BACNET_PROPERTIES) as [BacnetProperty,...BacnetProperty[]];
/** status-flags ozelligi (in-alarm, fault, overridden, out-of-service); present-value ile birlikte okunur. */
export const BACNET_STATUS_FLAGS=111;
/** Nesne numarasi ust siniri: 4194303 (0x3FFFFF) BACnet'te "tanimsiz/joker" anlamina gelir, kullanilmaz. */
export const BACNET_INSTANCE_MAX=4194302;
export const BACNET_DEFAULT_LOCAL_PORT=47809;
const isBinaryObject=(t:BacnetObjectType)=>t.startsWith('binary-');
/** 'AV 12' bicimi. */
export function bacnetObjectText(type:BacnetObjectType,instance:number|undefined){return BACNET_OBJECT_SHORT[type]+' '+(instance??'?');}
/** Ozelligin dogal veri tipi: 'bool' ya da 'number' (etiket veri tipi buna uymali). */
export function bacnetValueKind(type:BacnetObjectType,property:BacnetProperty):'bool'|'number'{
 if(property==='out-of-service')return 'bool';
 if((property==='present-value'||property==='relinquish-default')&&isBinaryObject(type))return 'bool';
 return 'number';
}
/** Nesne yazimi (ice aktarma / elle): 'AV12', 'AV:12', 'AV 12', 'analog-value:12', 'msv,3'. Gecersizse Turkce hata. */
export function parseBacnetObject(input:string):{objectType:BacnetObjectType;instance:number}{
 const s=String(input??'').trim().toLowerCase().replace(/_/g,'-');
 const m=/^([a-z-]+?)\s*[:, ]?\s*(\d{1,7})$/.exec(s);
 if(!m)throw Error('BACnet nesnesi anlaşılamadı: "'+String(input).trim()+'". Örnek: AV12, BI:3, analog-input 5.');
 const word=m[1].replace(/-$/,''),aliases:Record<string,BacnetObjectType>={msi:'multi-state-input',mso:'multi-state-output',msv:'multi-state-value'};
 const type=(BACNET_OBJECT_TYPE_NAMES as string[]).includes(word)?word as BacnetObjectType:aliases[word]??(Object.keys(BACNET_OBJECT_SHORT) as BacnetObjectType[]).find(k=>BACNET_OBJECT_SHORT[k].toLowerCase()===word);
 if(!type)throw Error('BACnet nesne tipi desteklenmiyor: "'+m[1]+'". AI, AO, AV, BI, BO, BV, MI, MO veya MV kullanın.');
 const instance=Number(m[2]);
 if(instance>BACNET_INSTANCE_MAX)throw Error('BACnet nesne numarası 0-'+BACNET_INSTANCE_MAX+' aralığında olmalı.');
 return {objectType:type,instance};
}
/** Okuma sonucundaki tek ozellik girdisi -> ham deger (sonra mqttCoerce). Girdi {t:ApplicationTag,v} ya da hata {e}.
 * BOOLEAN(1) bool; UNSIGNED(2)/SIGNED(3)/REAL(4)/DOUBLE(5)/ENUMERATED(9) sayi (binary PV ENUMERATED 0/1 -> mqttCoerce
 * bool'a cevirir); CHARACTER_STRING(7) metin; NULL, bit dizisi, hata ve digerleri undefined (quality 'bad'). Gomulur. */
export function bacnetRaw(entry:any):unknown{
 if(!entry||typeof entry!=='object'||entry.e!==undefined)return undefined;
 const t=entry.t,v=entry.v;
 if(t===1)return typeof v==='boolean'?v:(v===1||v===0?v===1:undefined);
 if(t===2||t===3||t===4||t===5||t===9)return typeof v==='number'&&Number.isFinite(v)?v:undefined;
 if(t===7)return typeof v==='string'?v:undefined;
 return undefined;
}
/** status-flags girdisinde fault biti (bit 1) set mi? Kutuphane bit n'i bayt[0]'in n. biti olarak verir. Okunamazsa false. Gomulur. */
export function bacnetFault(entry:any):boolean{
 if(!entry||typeof entry!=='object'||entry.t!==8||!entry.v||!Array.isArray(entry.v.value))return false;
 return ((Number(entry.v.value[0])||0)&2)!==0;
}
/** BACnet donusum dugumune gomulecek kaynak. */
export function bacnetCodecSource():string{return [mqttCoerce,bacnetRaw,bacnetFault].map(f=>f.toString()).join('\n');}
/** IPv4 tekil (unicast) adres mi: 0.x, 224-255.x (cok noktaya/yayin) ve 255.255.255.255 degil; 127.x yalniz izinliyse. */
export function isUnicastIpv4(host:string,allowLoopback=true):boolean{
 const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(host??'').trim());
 if(!m)return false;
 const o=m.slice(1).map(Number);
 if(o.some(x=>x>255)||o[0]===0||o[0]>=224)return false;
 if(o[0]===127&&!allowLoopback)return false;
 return true;
}
/** BACnet baglantisi: cihaz IPv4 (tekil), port, cihaz nesne numarasi, yerel arayuz. */
export function checkBacnetConnection(conn:Connection){
 const host=conn.host.trim();
 if(!isUnicastIpv4(host))throw Error(conn.name+': BACnet cihaz adresi tekil bir IPv4 olmalı (örn. 198.51.100.40). Yayın/çok noktaya adres ve makine adı kullanılmaz; cihaz Who-Is ile aranmaz.');
 if(!conn.port)throw Error(conn.name+': BACnet portu gerekli (genelde 47808).');
 if(conn.bacnetDeviceInstance===undefined||!Number.isInteger(conn.bacnetDeviceInstance)||conn.bacnetDeviceInstance<0||conn.bacnetDeviceInstance>BACNET_INSTANCE_MAX)
  throw Error(conn.name+': BACnet cihaz nesne numarası (device instance) 0-'+BACNET_INSTANCE_MAX+' aralığında gerekli.');
 const local=(conn.bacnetLocalAddress??'').trim();
 if(local&&!isUnicastIpv4(local))throw Error(conn.name+': BACnet yerel arayüz adresi bu PC\'nin bir IPv4 adresi olmalı (boş = tüm arayüzler).');
}
/** BACnet etiketi: nesne tipi + numara + ozellik; veri tipi ozelligin dogasina uymali; salt okuma. */
export function checkBacnetTag(t:Pick<Tag,'code'|'access'|'dataType'|'bacnetObjectType'|'bacnetInstance'|'bacnetProperty'>){
 if(!t.bacnetObjectType||!(t.bacnetObjectType in BACNET_OBJECT_TYPES))throw Error(t.code+': BACnet nesne tipi gerekli (AI, AO, AV, BI, BO, BV, MI, MO, MV).');
 if(t.bacnetInstance===undefined||!Number.isInteger(t.bacnetInstance)||t.bacnetInstance<0||t.bacnetInstance>BACNET_INSTANCE_MAX)throw Error(t.code+': BACnet nesne numarası 0-'+BACNET_INSTANCE_MAX+' aralığında gerekli.');
 const p=t.bacnetProperty??'present-value';
 if(!(p in BACNET_PROPERTIES))throw Error(t.code+': BACnet özelliği desteklenmiyor: '+p+'.');
 const kind=bacnetValueKind(t.bacnetObjectType,p);
 if(kind==='bool'&&t.dataType!=='bool')throw Error(t.code+': '+bacnetObjectText(t.bacnetObjectType,t.bacnetInstance)+' '+p+' dijitaldir; veri tipi bool olmalı.');
 if(kind==='number'&&t.dataType==='bool')throw Error(t.code+': '+bacnetObjectText(t.bacnetObjectType,t.bacnetInstance)+' '+p+' sayısaldır; veri tipi bool olamaz.');
 if(t.access==='readwrite')throw Error(t.code+': BACnet etiketi bu sürümde yalnız okunur. BACnet yazması öncelik dizisi (priority-array 1-16) ve bırakma (relinquish) kuralları ister; yanlış öncelikle yazmak BMS\'in kendi kontrolünü ezer ya da hiç etkisiz kalır. Erişimi "Salt okuma" yapın.');
}
/* --- EtherNet/IP (CIP) sembolik etiket ------------------------------------------
 * node-red-contrib-cip-ethernet-ip (ethernet-ip 1.2.5) ile Logix (ControlLogix/CompactLogix) ve Omron NX/NJ etiketleri.
 * Paket yalniz BOOL, SINT, INT, DINT ve REAL okur/yazar (UINT/UDINT okunurken tarama hata verip baglanti yeniden kurulur),
 * bu yuzden uint16/uint32 etiket desteklenmez. Port paket icinde 44818'e sabittir. */
export const ENIP_PORT=44818;
/** Etiket veri tipi -> CIP tipi (pakette okunup yazilabilenler). */
export const CIP_DATATYPE:Partial<Record<'bool'|'uint16'|'int16'|'uint32'|'int32'|'float32','BOOL'|'INT'|'DINT'|'REAL'>>={bool:'BOOL',int16:'INT',int32:'DINT',float32:'REAL'};
/** CIP etiket adi (paketin Tag.isValidTagname kurali): istege bagli 'Program:<ad>.' + ad (+[i] / [i,j] / [i,j,k]) + .uye (+[i])
 * ... + istege bagli bit (.0-.31). Ad: harf ya da _ ile baslar, ardisik/sondaki _ yok, bolum basina en cok 40 karakter. Gecersizse Turkce hata. */
export function parseCipTag(input:string):{tag:string;bit:number|null}{
 const s=String(input??'').trim();
 if(!s)throw Error('EtherNet/IP etiket adı gerekli, örn. Sicaklik, Program:MainProgram.Sayac veya Motor[2].Hiz.');
 if(s.length>200)throw Error('EtherNet/IP etiket adı 200 karakteri aşamaz.');
 const name='(?:_?[A-Za-z]|_\\d)(?:_?[A-Za-z0-9])*';
 const re=new RegExp('^(?:Program:'+name+'\\.)?'+name+'(?:\\[\\d+(?:,\\d+){0,2}\\])?(?:\\.'+name+'(?:\\[\\d+\\])?)*(?:\\.(\\d{1,2}))?$');
 const m=re.exec(s);
 if(!m)throw Error('EtherNet/IP etiket adı anlaşılamadı: "'+s+'". Örnek: Sicaklik, Program:MainProgram.Sayac, Dizi[3], Udt.Uye, DintEtiket.5 (bit). Boşluk, ardışık ya da sondaki _ kullanılmaz.');
 if(s.replace(/^Program:/,'').split(/[.[\],]/).some(p=>/^[A-Za-z_]/.test(p)&&p.length>40))throw Error('EtherNet/IP etiket adının her bölümü en çok 40 karakter olabilir.');
 const bit=m[1]===undefined?null:Number(m[1]);
 if(bit!==null&&bit>31)throw Error('EtherNet/IP bit numarası 0-31 olmalı: "'+s+'".');
 return {tag:s,bit};
}
/** EtherNet/IP baglantisi: IP/makine adi, port 44818 (paket sabit). */
export function checkEnipConnection(conn:Connection){
 if(!conn.host.trim())throw Error(conn.name+': EtherNet/IP bağlantısı için denetleyici IP adresi gerekli.');
 if(conn.port!==ENIP_PORT)throw Error(conn.name+': EtherNet/IP portu '+ENIP_PORT+' olmalı (sürücü paketi başka portu desteklemiyor).');
}
/** EtherNet/IP etiketi: CIP adi, desteklenen veri tipi, bit erisiminde bool, yazilabilirde sinir/tolerans. */
export function checkEnipTag(t:Pick<Tag,'code'|'access'|'dataType'|'cipTag'|'min'|'max'|'verifyTolerance'>){
 let bit:number|null;
 try{bit=parseCipTag(t.cipTag??'').bit;}catch(e){throw Error(t.code+': '+(e as Error).message);}
 if(!CIP_DATATYPE[t.dataType])throw Error(t.code+': EtherNet/IP sürücüsü '+t.dataType+' desteklemiyor (UINT/UDINT okunamaz); bool, int16 (INT), int32 (DINT) veya float32 (REAL) seçin.');
 if(bit!==null&&t.dataType!=='bool')throw Error(t.code+': bit erişimi ('+t.cipTag+') yalnız bool veri tipiyle kullanılır.');
 if(t.access==='readwrite')checkWritableTag(t);
}
/** Bu baglanti bu PC'nin seri portunu mu kullaniyor? */
export function isSerial(c:{protocol?:Protocol;rtuTransport?:'serial'|'tcp'}):boolean{return c.protocol==='modbus-rtu'&&(c.rtuTransport??'serial')==='serial';}
/** Seri hat ayari kisa bicimde: 9600 8N1. */
export function serialFormat(c:{baudRate?:number;dataBits?:number;parity?:string;stopBits?:number}):string{
 return (c.baudRate??9600)+' '+(c.dataBits??8)+({none:'N',even:'E',odd:'O'} as Record<string,string>)[c.parity??'none']+(c.stopBits??1);
}
/** Arayuzde gosterilen baglanti adresi: OPC UA endpoint, seri port + hat ayari ya da host:port. */
export function connectionAddress(c:Connection):string{
 if(c.protocol==='opc-ua')return c.endpoint||'';
 if(c.protocol==='http')return c.httpBaseUrl||'';
 if(c.protocol==='bacnet')return c.host+':'+c.port+(c.bacnetDeviceInstance!==undefined?' · cihaz '+c.bacnetDeviceInstance:'');
 if(c.protocol==='enip')return c.host+' · slot '+(c.slot??0);
 if(c.protocol==='sql')return c.host+(c.sqlInstance?.trim()?'\\'+c.sqlInstance.trim():':'+c.port)+(c.sqlDatabase?' / '+c.sqlDatabase:'');
 if(isSerial(c))return (c.serialPort||'?')+' · '+serialFormat(c)+(c.serialMode==='ascii'?' ASCII':'');
 return c.host+':'+c.port;
}
/** AMS Net ID: alti nokta ayrikli 0-255 bayt, orn. 192.0.2.120.1.1. Gecersizse Turkce hata. */
export function parseAmsNetId(input:string):string{
 const s=String(input??'').trim();
 const parts=s.split('.');
 if(parts.length!==6||parts.some(p=>!/^\d{1,3}$/.test(p)||Number(p)>255))throw Error('AMS Net ID anlaşılamadı: "'+input+'". Altı sayı olmalı, örn. 192.0.2.120.1.1');
 return parts.map(Number).join('.');
}
/** ADS sembol yolu (TwinCAT degisken adi), orn. GVL.fSicaklik veya MAIN.stMotor.bCalisiyor.
 * Dizi elemani (GVL.aDeger[3]) kabul edilir; bosluk ve tirnak kabul edilmez. Buyuk/kucuk harf TwinCAT'te onemsiz. */
export function parseAdsSymbol(input:string):string{
 const s=String(input??'').trim();
 if(!/^[A-Za-z_][A-Za-z0-9_]*(\[\d+\])?(\.[A-Za-z_][A-Za-z0-9_]*(\[\d+\])?)+$/.test(s))throw Error('ADS sembolü anlaşılamadı: "'+input+'". Örnek: GVL.fSicaklik veya MAIN.bCalisiyor');
 if(s.length>200)throw Error('ADS sembolü 200 karakteri aşamaz.');
 return s;
}
type ScalarType='bool'|'uint16'|'int16'|'uint32'|'int32'|'float32';
/** Modbus disi protokollerde (OPC UA, S7, ADS) yazilabilir etiket kurallari: sinir sirasi ve dogrulama toleransi. */
function checkWritableTag(t:{code:string;dataType:string;min:number;max:number;verifyTolerance?:number|null}){
 if(t.dataType!=='bool'&&t.min>=t.max)throw Error('Alt sınır üst sınırdan küçük olmalı.');
 if(t.dataType==='bool'&&t.verifyTolerance)throw Error(t.code+': dijital etikette doğrulama toleransı kullanılamaz; geri okuma ya eşittir ya değildir.');
 if(t.verifyTolerance!=null&&t.dataType!=='bool'&&t.verifyTolerance>(t.max-t.min)/2)throw Error(t.code+': doğrulama toleransı çalışma aralığının yarısını aşamaz; bu genişlikte pay her okumayı doğrulanmış gösterir.');
}
/** S7 yazma ham tipi (normallestirilmis adresten): nodes7'nin yazacagi PLC tipi ve tam sayi araligi.
 * BYTE okumada uint16 etikete eslenir ama PLC'de 0-255'tir; yazma sinirini bu belirler. */
export function s7WriteType(input:string):{type:'BOOL'|'BYTE'|'INT'|'DINT'|'WORD'|'DWORD'|'REAL';range:[number,number]|null}{
 const {address,dataType}=parseS7Address(input);
 if(dataType==='bool')return {type:'BOOL',range:null};
 if(dataType==='float32')return {type:'REAL',range:null};
 const k=address.startsWith('DB')?address.split(',')[1].replace(/\d.*$/,''):address.slice(1).replace(/\d.*$/,'');
 if(k==='B'||k==='BYTE')return {type:'BYTE',range:[0,255]};
 if(dataType==='int16')return {type:'INT',range:[-32768,32767]};
 if(dataType==='int32')return {type:'DINT',range:[-2147483648,2147483647]};
 if(dataType==='uint16')return {type:'WORD',range:[0,65535]};
 return {type:'DWORD',range:[0,4294967295]};
}
/** S7 adresi (nodes7 sozdizimi) -> normallestirilmis adres + beklenen veri tipi.
 * Yalniz skaler tipler: bit (X), BYTE, INT, DINT, WORD, DWORD, REAL. Dizi, STRING, CHAR, tarih ve
 * ters bayt sirali (R*) tipler bu surumde yok; T/C/P alanlari da yok. Hata mesaji Turkce ve kullaniciya gosterilir.
 * Ornekler: DB1,X0.0 · DB1,INT2 · DB1,REAL4 · M0.0 · MW10 · MD20 · MR24 · I0.1 (E0.1) · QW4 (AW4). */
export function parseS7Address(input:string):{address:string;dataType:ScalarType}{
 const address=String(input??'').trim().toUpperCase().replace(/\s+/g,'');
 const m=/^(?:DB(\d+),)?([A-Z]+)(\d+)(?:\.(\d+))?$/.exec(address);
 if(!m)throw Error('S7 adresi anlaşılamadı: "'+input+'". Örnek: DB1,REAL4 · M0.0 · MW10');
 const [,db,kind,offsetText,bitText]=m;
 const offset=Number(offsetText);
 if(offset>65535)throw Error("S7 adres ofseti 65535'i aşamaz: "+address);
 const dbTypes:Record<string,ScalarType|'byte'>={X:'bool',B:'byte',BYTE:'byte',I:'int16',INT:'int16',DI:'int32',DINT:'int32',W:'uint16',WORD:'uint16',D:'uint32',DW:'uint32',DWORD:'uint32',R:'float32',REAL:'float32'};
 const areaTypes:Record<string,ScalarType|'byte'>={'':'bool',B:'byte',I:'int16',DI:'int32',W:'uint16',D:'uint32',DW:'uint32',R:'float32'};
 let type:ScalarType|'byte'|undefined;
 if(db!==undefined){
  if(Number(db)<1)throw Error('S7 DB numarası 1 veya büyük olmalı: '+address);
  type=dbTypes[kind];
  if(!type)throw Error('Desteklenmeyen S7 DB veri tipi "'+kind+'": '+address+'. Kullanılabilir: X, BYTE, INT, DINT, WORD, DWORD, REAL.');
 }else{
  const area=kind[0];
  if(!'IEQAM'.includes(area))throw Error('Desteklenmeyen S7 alanı "'+area+'": '+address+'. Kullanılabilir: I/E, Q/A, M veya DBn,…');
  type=areaTypes[kind.slice(1)];
  if(!type)throw Error('Desteklenmeyen S7 veri tipi "'+kind.slice(1)+'": '+address+'. Kullanılabilir: bit, B, W, D, I, DI, R.');
 }
 if(type==='bool'){
  if(bitText===undefined)throw Error('S7 bit adresi bit numarası ister, örn. M0.0 veya DB1,X0.0: '+address);
  if(Number(bitText)>7)throw Error('S7 bit numarası 0-7 arasında olmalı: '+address);
 }else if(bitText!==undefined)throw Error('Bit numarası yalnız bit adresinde kullanılır: '+address);
 // Normal bicim: E/A (Almanca) kisaltmalari I/Q'ya cevrilir; nodes7 ikisini de kabul eder, biz tek bicim tutariz.
 const normal=db!==undefined?address:address.replace(/^E/,'I').replace(/^A/,'Q');
 return {address:normal,dataType:type==='byte'?'uint16':type};
}
/** OPC UA StatusCode -> uygulamanin kalite modeli. Ust 2 bit onem seviyesini tasir (OPC UA Part 4): 00 Good, 01 Uncertain, 1x Bad.
 * Metin bicimi ('Good'/'Uncertain'/'Bad' ile baslayan) da kabul edilir; taniinmayan girdi 'unknown' doner. */
export function opcQuality(statusCode:number|string):'good'|'stale'|'bad'|'unknown'{
 if(statusCode===null||statusCode===undefined)return 'unknown';
 if(typeof statusCode==='string'){
  const s=statusCode.trim();
  if(/^good/i.test(s))return 'good';
  if(/^uncertain/i.test(s))return 'stale';
  if(/^bad/i.test(s))return 'bad';
  const n=Number(s);
  if(!Number.isFinite(n))return 'unknown';
  return opcQuality(n);
 }
 if(typeof statusCode!=='number'||!Number.isFinite(statusCode))return 'unknown';
 const severity=(statusCode>>>0&0xC0000000)>>>30;
 if(severity===0)return 'good';
 if(severity===1)return 'stale';
 return 'bad';
}
/** Fiziksel hat kimligi: ayni host:port'u paylasan farkli baglanti tanimlari ayni kilidi kullansin diye (B44). */
export function busKeyOf(connection:{host:string;port:number;protocol?:Protocol;rtuTransport?:'serial'|'tcp';serialPort?:string}){
 // Seri hatta fiziksel hat COM portudur; ayni portu paylasan tanimlar ayni kilidi kullanir.
 if(isSerial(connection))return 'serial:'+String(connection.serialPort||'').trim().toLowerCase();
 return connection.host.trim().toLowerCase()+':'+connection.port;
}
/* Adres bicimi: etiket eklerken adresin NASIL yazildigi. Haberlesmeyi etkilemez (Modbus adresi zaten
 * area+address olarak saklanir). 'delta' = Delta DVP cihaz adlari (M0, Y0, X0, D100) Modbus'a cevrilir;
 * 'modbus' (varsayilan) = alan + adres ya da 40001 kilavuz numarasi. S7/ADS/OPC UA bicimi protokolden gelir. */
export const deviceSchema=z.object({id,connectionId:id,code:name,name,slaveId:z.number().int().min(1).max(247),enabled:z.boolean(),pollMs:z.number().int().min(500).max(60000),staleMs:z.number().int().min(2000).max(180000),description:z.string().max(500).default(''),
 addressFormat:z.enum(['modbus','delta']).optional()});
export type AddressFormat='modbus'|'delta'|'s7'|'ads'|'opc'|'mqtt'|'snmp'|'http'|'sql'|'bacnet'|'enip';
export const addressFormatLabels:Record<AddressFormat,string>={modbus:'Genel Modbus',delta:'Delta DVP',s7:'Siemens S7',ads:'Beckhoff ADS',opc:'OPC UA',mqtt:'MQTT',snmp:'SNMP',http:'HTTP/REST',sql:'SQL Server',bacnet:'BACnet/IP',enip:'EtherNet/IP'};
export function addressFormatOf(c:{connections:{id:string;protocol?:Protocol}[];devices:{id:string;connectionId:string;addressFormat?:'modbus'|'delta'}[]},deviceId:string):AddressFormat{
 const d=c.devices.find(x=>x.id===deviceId),p=connectionProtocol(c.connections.find(x=>x.id===d?.connectionId)||{});
 return p==='s7'?'s7':p==='ads'?'ads':p==='opc-ua'?'opc':p==='mqtt'?'mqtt':p==='snmp'?'snmp':p==='http'?'http':p==='sql'?'sql':p==='bacnet'?'bacnet':p==='enip'?'enip':d?.addressFormat==='delta'?'delta':'modbus';
}
export const tagSchema=z.object({id,deviceId:id,code:name,name,area:z.enum(['coil','discrete-input','holding-register','input-register']),address:z.number().int().min(0).max(65535),dataType:z.enum(['bool','uint16','int16','uint32','int32','float32']),access:z.enum(['read','readwrite']),scale:z.number().finite().refine(v=>v!==0).default(1),offset:z.number().finite().default(0),min:z.number().finite().default(0),max:z.number().finite().default(65535),unit:z.string().max(24).default(''),description:z.string().max(500).default(''),
 // Cok registerli tipler (uint32/int32/float32) icin register ve bayt sirasi; 16 bit tiplerde etkisizdir.
 wordOrder:z.enum(['big','little']).default('big'),byteOrder:z.enum(['big','little']).default('big'),
 // Bit alani: yalniz uint16/int16 uzerinde tek bir biti tasiyan etiketler icin (0=LSB..15=MSB).
 bit:z.number().int().min(0).max(15).nullable().default(null),
 // B61: geri okuma dogrulama toleransi — muhendislik biriminde, mutlak deger.
 // null = otomatik: float32'de temsil hatasi kadar pay, diger tiplerde tam esitlik.
 // Elle bir sayi girilmesi MUHENDISIN KARARIDIR: 'dogrulandi' demek sahada gercekten
 // o degerin oldugunu iddia etmektir; pay genisledikce iddia zayiflar.
 verifyTolerance:z.number().min(0).max(1000000).nullable().default(null),
 // Gecmis kayit (historian): etiket bazinda ac/kapa, olu bant ve azami kayit araligi.
 history:z.boolean().default(false),historyDeadband:z.number().min(0).max(1000000).default(0),historyMaxGapMs:z.number().int().min(5000).max(3600000).default(60000),
 // B43: OPC UA adresleme. Modbus etiketlerinde tanimsiz/bos kalir, area/address gecerlidir.
 // .optional() (default() degil): bkz. connectionSchema uzerindeki not — cikti turunde zorunlu olmasini engeller.
 nodeId:z.string().max(200).optional(),
 // Siemens S7 adresi (nodes7 sozdizimi, bkz. parseS7Address). Modbus/OPC UA etiketlerinde tanimsiz kalir.
 s7Address:z.string().max(40).optional(),
 // Cihaz icindeki bolum (pano, istasyon, hat). Yalniz duzenleme/gezinme icindir; haberlesmeyi etkilemez.
 group:z.string().trim().max(60).optional(),
 // Beckhoff ADS sembol yolu (bkz. parseAdsSymbol). Diger protokollerde tanimsiz kalir.
 adsSymbol:z.string().max(200).optional(),
 // MQTT: konu (joker yok), istege bagli JSON yolu ve zaman damgasi yolu (bkz. parseMqttTopic / mqttPathSteps).
 mqttTopic:z.string().max(256).optional(),
 mqttJsonPath:z.string().max(200).optional(),
 mqttTimestampPath:z.string().max(200).optional(),
 // SNMP: sayisal OID (parseSnmpOid). HTTP: goreli yol + JSON yolu + istege bagli zaman damgasi yolu (parseHttpPath,
 // mqttPathSteps). SQL: tek SELECT (checkSqlQuery) ve ilk satirdan okunacak sutun.
 snmpOid:z.string().max(200).optional(),
 httpPath:z.string().max(300).optional(),
 httpJsonPath:z.string().max(200).optional(),
 httpTimestampPath:z.string().max(200).optional(),
 sqlQuery:z.string().max(2000).optional(),
 sqlColumn:z.string().max(128).optional(),
 // BACnet: nesne tipi + numara (0-4194302) + okunacak ozellik (varsayilan present-value). Bkz. checkBacnetTag.
 bacnetObjectType:z.enum(BACNET_OBJECT_TYPE_NAMES).optional(),
 bacnetInstance:z.number().int().min(0).max(4194302).optional(),
 bacnetProperty:z.enum(BACNET_PROPERTY_NAMES).optional(),
 // EtherNet/IP: CIP sembolik etiket adi (Logix/Omron), orn. Sicaklik, Program:Main.Sayac, Dizi[3], Udt.Uye, Dint.5 (bit). Bkz. parseCipTag.
 cipTag:z.string().max(200).optional()});
/** Izin kosulu: komut kabul edilmeden once saglanmasi gereken dijital saha durumu. */
export const permissiveSchema=z.object({tagId:id,expected:z.boolean().default(true),label:z.string().trim().max(80).default('')});
export type Permissive=z.infer<typeof permissiveSchema>;
/* --- Risk bazli komut onayi (B36) -----------------------------------------
 * Her komuta onay koymak aliskanlik yaratir ve onay anlamini yitirir.
 * Risk sinifi yalniz gerekli yerde onay ister: gerekce, ya da iki kisi onayi
 * (ikinci onay SUNUCUDA zorlanir, arayuzde degil).
 */
export const commandRisks=['normal','high','critical'] as const;
export const commandRiskLabels:Record<string,string>={normal:'Normal',high:'Yüksek riskli',critical:'Kritik / geri alınamaz'};
export const approvalModes=['none','confirm','reason','two-person'] as const;
export const approvalLabels:Record<string,string>={none:'Onay yok',confirm:'Özet göster ve onayla',reason:'Gerekçe iste','two-person':'İki kişi onayı'};
/* --- Script komutu ---------------------------------------------------------
 * kind 'write' (varsayilan): 1-2 hedefe tek deger yazar, geri bildirimle dogrular.
 * kind 'script': C benzeri kisa mantik (bkz. ./script.ts) SCADA sunucusunda calisir.
 * tagIds = scriptin yazdigi etiketler (kayitta scriptten turetilir, kilit ve tazelik
 * denetimi bunlarla yapilir). safeWrites = script hata, durdurma, haberlesme kopmasi,
 * izin kosulunun kalkmasi ya da sure asiminda yazilan GUVENLI DURUM. Dijital her
 * hedef icin zorunludur. Bu bir PLC emniyet devresinin yerine GECMEZ; ag tamamen
 * koparsa guvenli durum da yazilamaz — kritik isler PLC'de kalmali.
 * .optional(): mevcut komut nesne harflerini (test/kod) kirmasin; yoksa 'write'.
 */
export const safeWriteSchema=z.object({tagId:id,value:z.union([z.boolean(),z.number().finite()])});
export type SafeWrite=z.infer<typeof safeWriteSchema>;
export const commandSchema=z.object({id,name,tagIds:z.array(id).max(16),feedbackTagIds:z.array(id).max(2),timeoutMs:z.number().int().min(2000).max(30000).default(7000),
 permissives:z.array(permissiveSchema).max(6).default([]),
 risk:z.enum(commandRisks).default('normal'),approval:z.enum(approvalModes).default('none'),
 scope:z.string().trim().max(120).default(''),
 kind:z.enum(['write','script']).optional(),
 script:z.string().max(SCRIPT_LIMITS.maxSource).optional(),
 safeWrites:z.array(safeWriteSchema).max(16).optional(),
 maxRunMs:z.number().int().min(1000).max(SCRIPT_LIMITS.maxRunMs).optional(),
 // Cihaz icindeki klasor (etiketlerdeki group gibi). Yalniz gezinme icindir; cihaz, yazma hedefinin cihazidir.
 group:z.string().trim().max(60).optional()});
export const isScript=(d:{kind?:string})=>d.kind==='script';
/** Script denetimi icin etiket gorunumu: yazma yalniz oku/yaz etiketlerde (S7/ADS/OPC UA zaten salt okuma). */
export function scriptTagRefs(c:Pick<Config,'tags'>):TagRef[]{return c.tags.map(t=>({id:t.id,code:t.code,deviceId:t.deviceId,access:t.access,dataType:t.dataType,writable:t.access==='readwrite'}));}
export const alarmRuleSchema=z.object({id,name,tagId:z.string().min(1),
 kind:z.enum(['high','low','bool','stale']).default('high'),
 limit:z.number().finite().default(0),expected:z.boolean().default(true),
 deadband:z.number().min(0).max(1000000).default(0),delayMs:z.number().int().min(0).max(600000).default(0),
 severity:z.enum(['critical','warning','info']).default('warning'),
 message:z.string().max(200).default(''),enabled:z.boolean().default(true),popup:z.boolean().default(true),
 // Bilgi olaylari ACK istemeyebilir; latch aciksa kosul normale donse bile ACK beklenir.
 ackRequired:z.boolean().default(true),latch:z.boolean().default(false),
 area:z.string().trim().max(80).default(''),equipment:z.string().trim().max(80).default(''),
 cause:z.string().trim().max(300).default(''),consequence:z.string().trim().max(300).default(''),action:z.string().trim().max(300).default(''),responseMinutes:z.number().int().min(0).max(1440).default(0),
 shelvedUntil:z.number().int().min(0).default(0),shelvedReason:z.string().trim().max(300).default(''),shelvedBy:z.string().trim().max(80).default('')});
export type AlarmRule=z.infer<typeof alarmRuleSchema>;
/* --- Alarm seli bastirma politikasi (B42 / ISA-18.2) ---------------------
 * Sel aninda operatorun onune yuzlerce popup cikmasin: esik asilinca
 * yalniz kritik olaylar popup olur, digerleri kaydedilir ve listede kalir.
 * Bastirma sessizce olmaz — baslangici ve bitisi denetim kaydina gecer.
 */
export const alarmPolicySchema=z.object({
 floodPerMinute:z.number().int().min(3).max(500).default(20),
 floodClearMinutes:z.number().int().min(1).max(120).default(5),
 suppressPopupsInFlood:z.boolean().default(true),
 // Operatorun bir alarmi rafa kaldirabilecegi en uzun sure (dk). Yonetici ve
 // tasarimci icin tavan sabit 1440; operator bu ayarla daha dar tutulabilir.
 operatorShelveMaxMinutes:z.number().int().min(1).max(1440).default(1440)});
export const SHELVE_MAX_MINUTES=1440;
export type AlarmPolicy=z.infer<typeof alarmPolicySchema>;
export const defaultAlarmPolicy:AlarmPolicy=alarmPolicySchema.parse({});
export type AlarmFlood={active:boolean;since:number;lastRaiseAt:number;ratePerMinute:number;suppressed:number};

export const alarmRulesSchema=z.array(alarmRuleSchema).max(500);
export type AlarmEvent={id:string;ruleId:string;name:string;severity:AlarmRule['severity'];kind:AlarmRule['kind'];tagId:string;tagCode:string;value:boolean|number|null;limit:number;message:string;raisedAt:number;clearedAt:number|null;ackAt:number|null;ackBy:string;popup:boolean};
export const severityLabels:Record<AlarmRule['severity'],string>={critical:'Kritik',warning:'Uyarı',info:'Bilgi'};
export const alarmKindLabels:Record<AlarmRule['kind'],string>={high:'Üst limit aşımı',low:'Alt limit altına düşme',bool:'Dijital durum',stale:'Veri güncel değil'};
export function validateAlarms(input:unknown,c:Config):AlarmRule[]{
 const rules=alarmRulesSchema.parse(input);
 if(new Set(rules.map(r=>r.id)).size!==rules.length)throw Error('Alarm kuralı kimliği tekrarlanıyor.');
 for(const r of rules){
  const t=c.tags.find(x=>x.id===r.tagId);if(!t)throw Error(r.name+': etiket bulunamadı.');
  if(r.kind==='bool'&&t.dataType!=='bool')throw Error(r.name+': dijital alarm için dijital etiket seçin.');
  if((r.kind==='high'||r.kind==='low')&&t.dataType==='bool')throw Error(r.name+': limit alarmı için sayısal etiket seçin.');
  if(r.deadband<0)throw Error(r.name+': ölü bant negatif olamaz.');
 }
 return rules;
}
export function alarmText(r:AlarmRule,tagCode:string){
 if(r.message)return r.message;
 if(r.kind==='bool')return tagCode+' sinyali '+(r.expected?'aktif':'pasif')+'.';
 if(r.kind==='stale')return tagCode+' verisi güncellenmiyor.';
 return tagCode+(r.kind==='high'?' üst limiti aştı: ':' alt limitin altına düştü: ')+r.limit;
}
/** MQTT disa yayin (SCADA -> broker; RAPORLAMA, kontrol degil). Node-RED'in zaten okudugu ornekler
 * <baseTopic>/<etiket kodu> konusuna {value,quality,ts} JSON olarak yayinlanir (bkz. driver.ts buildMqttPublishNodes). */
export const mqttPublishSchema=z.object({connectionId:id,baseTopic:z.string().trim().min(1).max(200),intervalMs:z.number().int().min(1000).max(3600000).default(10000),
 onChange:z.boolean().default(false),retain:z.boolean().default(false),tagIds:z.union([z.literal('all'),z.array(id).max(5000)]).default('all')});
export type MqttPublish=z.infer<typeof mqttPublishSchema>;
export const configSchema=z.object({revision:z.number().int().min(1),name,connections:z.array(connectionSchema).max(100),devices:z.array(deviceSchema).max(100),tags:z.array(tagSchema).max(5000),commands:z.array(commandSchema).max(5000),
 mqttPublish:mqttPublishSchema.optional()});
/** Yayin konusunun bir seviyesi: etiket kodundaki MQTT ozel karakterleri (+ # / NUL) '_' olur. */
export function mqttTopicLevel(code:string):string{return String(code).replace(/[+#/\u0000]/g,'_');}
/** Silinen baglanti/etiket yayin blogunda asili kalmasin: hedef baglanti MQTT degilse ya da yoksa blok kalkar,
 * secili listeden olmayan etiketler duser (bos kalirsa blok kalkar). Arayuz kayittan once uygular. */
export function pruneMqttPublish<C extends Pick<Config,'connections'|'tags'|'mqttPublish'>>(c:C):C{
 const p=c.mqttPublish;if(!p)return c;
 const conn=c.connections.find(x=>x.id===p.connectionId);
 if(!conn||conn.protocol!=='mqtt'){const {mqttPublish:_p,...rest}=c;return rest as C;}
 if(p.tagIds==='all')return c;
 const ids=new Set(c.tags.map(t=>t.id)),kept=p.tagIds.filter(id=>ids.has(id));
 if(kept.length===p.tagIds.length)return c;
 if(!kept.length){const {mqttPublish:_p,...rest}=c;return rest as C;}
 return {...c,mqttPublish:{...p,tagIds:kept}};
}
/** Yayina giren etiketler (config'teki sirayla). */
export function mqttPublishTags(c:Pick<Config,'tags'|'mqttPublish'>):Config['tags']{
 const p=c.mqttPublish;if(!p)return [];
 if(p.tagIds==='all')return c.tags;
 const ids=new Set(p.tagIds);return c.tags.filter(t=>ids.has(t.id));
}
export type Config=z.infer<typeof configSchema>;
export type Tag=Config['tags'][number];
export const hexColor=z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const partSchema=z.object({tagId:z.string().default(''),label:z.string().max(40).default(''),color:hexColor.default('#208169'),value:z.number().finite().default(0),upper:z.number().finite().nullable().default(null),expected:z.boolean().default(true),
 // K03: ekipman tipinde bu kademenin etiketini hangi girdinin dolduracagi.
 // .optional(): mevcut nesne harfleriyle (test/kod) kurulan Part'lari kirmasin.
 bindTag:z.string().max(40).optional()});
export type Part=z.infer<typeof partSchema>;
/* --- Adlandirilmis saha baglari (A1) --------------------------------------
 * Tek `tagId` bir ekipmanin yalniz "acik mi" sorusunu yanitlar. Gercek
 * isletmede vana "acildi mi / kapandi mi / arizali mi", motor "hazir /
 * calisiyor / trip / uzaktan" ayrimini ister. Bag listesi her role AYRI
 * etiket baglar; roller katalogda (symbols/catalog.ts) tanimlidir, serbest
 * metin degildir — yazim hatasi yayin oncesi yakalanir.
 * `invert`: sahada NC kontak gibi ters kablolanmis sinyaller icin.
 */
export const bindingSchema=z.object({role:z.string().min(1).max(40),tagId:z.string().default(''),invert:z.boolean().default(false),
 // K03: ekipman tipinde bu rolu hangi girdinin dolduracagi.
 bindTag:z.string().max(40).optional()});
export type Binding=z.infer<typeof bindingSchema>;
export const detailSchema=z.object({kind:z.enum(['value','command']).default('value'),tagId:z.string().default(''),commandId:z.string().default(''),
 label:z.string().max(60).default(''),unit:z.string().max(20).default(''),decimals:z.number().int().min(-1).max(6).default(-1),
 action:z.enum(['on','off','set','toggle']).default('on'),setValue:z.number().finite().default(0),
 onText:z.string().max(40).default('AÇIK'),offText:z.string().max(40).default('KAPALI'),
 // K03: bilgi satirinin etiketini/komutunu hangi girdinin dolduracagi.
 bindTag:z.string().max(40).optional(),bindCommand:z.string().max(40).optional()});
export type Detail=z.infer<typeof detailSchema>;
/* --- Kosul agaci (B21) ---------------------------------------------------
 * Kullanici kod yazmadan cok etiketli kosul kurar: VE / VEYA / DEGIL,
 * karsilastirma ve aralik. `eval` veya serbest JavaScript calistirilmaz;
 * agac tipli ve derinligi sinirlidir. Girdi kalitesi kotuyse sonuc
 * "bilinmiyor" olur ve nesne gizlenmez (bkz. B04).
 */
export type Condition=
 |{op:'bool';tagId:string;expected:boolean}
 |{op:'cmp';tagId:string;test:'eq'|'ne'|'lt'|'lte'|'gt'|'gte';value:number}
 |{op:'range';tagId:string;min:number;max:number}
 |{op:'and';terms:Condition[]}
 |{op:'or';terms:Condition[]}
 |{op:'not';term:Condition};
export const conditionTests=['eq','ne','lt','lte','gt','gte'] as const;
export const conditionTestLabels:Record<Condition extends {test:infer T}?T&string:never,string>={eq:'eşit',ne:'eşit değil',lt:'küçük',lte:'küçük veya eşit',gt:'büyük',gte:'büyük veya eşit'} as any;
const MAX_CONDITION_DEPTH=4;
export const conditionSchema:z.ZodType<Condition>=z.lazy(()=>z.union([
 z.object({op:z.literal('bool'),tagId:z.string().min(1),expected:z.boolean().default(true)}),
 z.object({op:z.literal('cmp'),tagId:z.string().min(1),test:z.enum(conditionTests),value:z.number().finite()}),
 z.object({op:z.literal('range'),tagId:z.string().min(1),min:z.number().finite(),max:z.number().finite()}),
 z.object({op:z.literal('and'),terms:z.array(conditionSchema).min(1).max(6)}),
 z.object({op:z.literal('or'),terms:z.array(conditionSchema).min(1).max(6)}),
 z.object({op:z.literal('not'),term:conditionSchema})]));
export function conditionDepth(c:Condition):number{
 if(c.op==='and'||c.op==='or')return 1+Math.max(...c.terms.map(conditionDepth));
 if(c.op==='not')return 1+conditionDepth(c.term);
 return 1;
}
export function conditionTags(c:Condition):string[]{
 if(c.op==='and'||c.op==='or')return c.terms.flatMap(conditionTags);
 if(c.op==='not')return conditionTags(c.term);
 return [c.tagId];
}
/** Kosulu yapilandirmaya gore dogrular; hatali baglar yayin oncesi yakalanir. */
export function validateCondition(c:Condition,cfg:Config,where:string){
 if(conditionDepth(c)>MAX_CONDITION_DEPTH)throw Error(where+': koşul en fazla '+MAX_CONDITION_DEPTH+' seviye derinlikte olabilir.');
 for(const tagId of conditionTags(c)){const t=cfg.tags.find(x=>x.id===tagId);if(!t)throw Error(where+': koşul etiketi bulunamadı.');}
 const walk=(n:Condition):void=>{
  if(n.op==='and'||n.op==='or'){n.terms.forEach(walk);return;}
  if(n.op==='not')return walk(n.term);
  const t=cfg.tags.find(x=>x.id===n.tagId)!;
  if(n.op==='bool'&&t.dataType!=='bool')throw Error(where+': dijital koşul için dijital etiket seçin.');
  if(n.op!=='bool'&&t.dataType==='bool')throw Error(where+': sayısal koşul için sayısal etiket seçin.');
  if(n.op==='range'&&!(n.min<n.max))throw Error(where+': aralığın alt sınırı üst sınırdan küçük olmalı.');
 };
 walk(c);
}
/** true / false / null(bilinmiyor). Bir girdinin kalitesi kotuyse sonuc bilinmiyordur. */
export function evaluateCondition(c:Condition,samples:Record<string,Sample>):boolean|null{
 if(c.op==='and'){const r=c.terms.map(t=>evaluateCondition(t,samples));return r.some(x=>x===false)?false:r.some(x=>x===null)?null:true;}
 if(c.op==='or'){const r=c.terms.map(t=>evaluateCondition(t,samples));return r.some(x=>x===true)?true:r.some(x=>x===null)?null:false;}
 if(c.op==='not'){const r=evaluateCondition(c.term,samples);return r===null?null:!r;}
 const s=samples[c.tagId];
 if(!s||s.quality!=='good')return null;
 if(c.op==='bool')return typeof s.value==='boolean'?s.value===c.expected:null;
 if(typeof s.value!=='number')return null;
 if(c.op==='range')return s.value>=c.min&&s.value<c.max;
 const v=s.value;
 return c.test==='eq'?v===c.value:c.test==='ne'?v!==c.value:c.test==='lt'?v<c.value:c.test==='lte'?v<=c.value:c.test==='gt'?v>c.value:v>=c.value;
}
/** Kosulun neden dogru/yanlis oldugunu mevcut degerlerle acıklar. */
export function explainCondition(c:Condition,cfg:Config,samples:Record<string,Sample>):string{
 const name=(id:string)=>cfg.tags.find(t=>t.id===id)?.code||id;
 const reading=(id:string)=>{const s=samples[id];return !s||s.quality!=='good'?'bilinmiyor':typeof s.value==='boolean'?(s.value?'açık':'kapalı'):String(s.value);};
 const leaf=(n:Condition)=>{
  if(n.op==='bool')return `${name(n.tagId)} ${n.expected?'açık':'kapalı'} [${reading(n.tagId)}]`;
  if(n.op==='range')return `${name(n.tagId)} ${n.min}–${n.max} arası [${reading(n.tagId)}]`;
  if(n.op==='cmp')return `${name(n.tagId)} ${(conditionTestLabels as any)[n.test]} ${n.value} [${reading(n.tagId)}]`;
  return '';
 };
 const walk=(n:Condition):string=>{
  if(n.op==='and')return '('+n.terms.map(walk).join(' VE ')+')';
  if(n.op==='or')return '('+n.terms.map(walk).join(' VEYA ')+')';
  if(n.op==='not')return 'DEĞİL '+walk(n.term);
  return leaf(n);
 };
 const value=evaluateCondition(c,samples);
 return walk(c)+' → '+(value===null?'bilinmiyor':value?'doğru':'yanlış');
}
export function isButton(t:Widget['type']){return (buttonTypes as readonly string[]).includes(t);}
export function isCommandWidget(t:Widget['type']){return (commandTypes as readonly string[]).includes(t);}
/* G43: secici anahtar hem gosterge hem kumanda olabilir. Komut baglanmamis
 * secici SALT GOSTERGEDIR: eskiden oldugu gibi tiklanmaz, engellenmez ve
 * "komut tanimli degil" uyarisi uretmez. Kumanda yolu yalniz komut
 * baglandiginda acilir. */
export function writesCommand(w:{type:Widget['type'];commandId:string}){return isCommandWidget(w.type)&&(w.type!=='selector'||!!w.commandId);}
export function supportsParts(t:Widget['type']){return (partTypes as readonly string[]).includes(t);}
const baseWidgetSchema=z.object({id,type:z.enum(symbolTypes as unknown as [SymbolType,...SymbolType[]]),label:z.string().max(120),x:z.number().min(-2000).max(10000),y:z.number().min(-2000).max(10000),width:z.number().min(20).max(4000),height:z.number().min(20).max(4000),rotation:z.number().min(-360).max(360).default(0),tagId:z.string().default(''),commandId:z.string().default(''),targetScreenId:z.string().default(''),action:z.enum(['on','off','set','toggle','momentary','pulse']).default('on'),setValue:z.number().finite().default(0),color:z.string().regex(/^#[a-fA-F0-9]{6}$/).default('#208169'),animated:z.boolean().default(true),reverse:z.boolean().default(false),locked:z.boolean().default(false),groupId:z.string().default(''),visibleTagId:z.string().default(''),visibleWhen:z.boolean().default(true),min:z.number().finite().default(0),max:z.number().finite().default(100),src:z.string().max(200).regex(/^$|^\/uploads\/[a-f0-9]{32}\.(png|jpg|gif|webp|svg)$/).default(''),fit:z.enum(['contain','cover','fill']).default('contain'),mode:z.enum(['digital','analog']).default('digital'),parts:z.array(partSchema).max(8).default([])});
export const widgetSchema=baseWidgetSchema.extend({
 rangeMode:z.enum(['threshold','range']).default('threshold'),onText:z.string().max(120).default('AÇIK'),offText:z.string().max(120).default('KAPALI'),
 labelVisible:z.boolean().default(true),fontSize:z.number().int().min(0).max(72).default(0),fontWeight:z.enum(['400','500','600','700','800']).default('400'),
 textAlign:z.enum(['left','center','right']).default('left'),
 offColor:z.union([hexColor,z.literal('')]).default(''),opacity:z.number().min(.1).max(1).default(1),
 fillColor:z.union([hexColor,z.literal('')]).default(''),borderColor:z.union([hexColor,z.literal('')]).default(''),textColor:z.union([hexColor,z.literal('')]).default(''),iconColor:z.union([hexColor,z.literal('')]).default(''),
 flipX:z.boolean().default(false),flipY:z.boolean().default(false),
 animationSpeed:z.number().min(.25).max(4).default(1),
 lineWidth:z.number().min(4).max(32).default(20),
 // Faz 2 sekil secenekleri. strokeWidth 0 = turun eski varsayilani; eski ekranlar ayni cizilir.
 radius:z.number().int().min(0).max(200).default(8),strokeWidth:z.number().min(0).max(24).default(0),
 strokeStyle:z.enum(['solid','dashed','dotted']).default('solid'),fillOpacity:z.number().min(0).max(1).default(1),
 shadow:z.enum(['none','soft','strong']).default('none'),sides:z.number().int().min(3).max(12).default(6),
 unit:z.string().max(20).default(''),decimals:z.number().int().min(-1).max(6).default(-1),
 details:z.array(detailSchema).max(20).default([]),
 // Cok etiketli gorunurluk kosulu; doluysa visibleTagId yerine bu gecerlidir.
 visibleCondition:conditionSchema.nullable().default(null),
 // Ekipman instansi izleri: hangi instansa ait, sablondaki rolu ve hangi girdiye baglanacagi.
 equipmentId:z.string().max(80).default(''),equipmentRole:z.string().max(80).default(''),
 bindTag:z.string().max(40).default(''),bindCommand:z.string().max(40).default(''),
 // K03: gorunurluk etiketini hangi girdinin dolduracagi.
 bindVisible:z.string().max(40).default(''),
 /* G42: olcek uzerindeki isletme bandi. Tek bir sayi "45" operatore bir sey
  * anlatmaz; normal bandin neresinde oldugu anlatir. Limitler bos (null)
  * birakilabilir — o zaman cizilmez. Setpoint ayri bir etiketten okunur. */
 warnLow:z.number().finite().nullable().default(null),warnHigh:z.number().finite().nullable().default(null),
 limitLow:z.number().finite().nullable().default(null),limitHigh:z.number().finite().nullable().default(null),
 setpointTagId:z.string().default(''),
 /* Govde varyanti (konik tank, dalgic pompa, vidali kompresor...). Tek bir
  * alan, her varyant icin ayri sembol turu acmaya gerek birakmaz; bos deger
  * turun ilk varyantini secer. */
 variant:z.string().max(24).default(''),
 /* G37/G38/G39: canli veri nesnelerinin ayarlari. Trend kalemleri ve tablo
  * satirlari `details` listesinden okunur (ayri bir liste acmak, ayni seyin
  * iki yerde durmasi demek olurdu). */
 timeWindowMin:z.number().int().min(1).max(1440).default(15),
 severityFilter:z.enum(['all','critical','warning','info']).default('all'),
 areaFilter:z.string().max(80).default(''),
 /* G50: cizim goruntu kutusunun tamamini doldurmaz; nesne buyutulunce
  * cizim ortada kucuk kalir ve etrafindaki bosluk yuzunden iki cisim
  * bitistirilemez. 'contain' bugunku davranis (oran korunur, bosluk kalir),
  * 'trim' boslugu kirpar (oran korunur), 'fill' cizimi cerceveye gerer. */
 frameFit:z.enum(['contain','trim','fill']).default('contain'),
 /* G45: analog yazma araligi NESNE bazinda daraltilabilir. Etiketin kendi
  * min/max'i cihazin fiziksel siniridir; operatorun o ekrandan yazabilecegi
  * aralik daha dar olabilir (ornegin 0-100 °C). Bos birakilirsa etiketin
  * sinirlari gecerlidir. Sunucu da bu araligi zorlar; yalniz arayuzde
  * kalsaydi kisitlama olmazdi, sus payi olurdu. */
 writeMin:z.number().finite().nullable().default(null),
 writeMax:z.number().finite().nullable().default(null),
 /* G44: "cek bas" ve "darbe". Ikisi de true yazip ARDINDAN false yazar;
  * fark biraktirma anindadir. `momentary` parmak kalkinca birakir, `pulseMs`
  * orada guvenlik tavanidir: tarayici olse, sekme kapansa bile cikis en gec
  * o sure sonunda dusurulur. `pulse` tek basista bu sure kadar acik kalir. */
 pulseMs:z.number().int().min(50).max(60000).default(500),
 // A1: role bazli saha baglari; bos liste = eski tekil `tagId` davranisi.
 bindings:z.array(bindingSchema).max(12).default([])
});
/* --- Parametreli ekipman sablonu (B22) -----------------------------------
 * Yirmi benzer pompanin baglarini tek tek duzenlemek hata uretir. Ekipman
 * tipi bir kez tasarlanir; her instans yalnizca anlamli girdileri (calisma
 * geri bildirimi, ariza, baslatma komutu...) esler.
 */
const inputKey=z.string().regex(/^[a-z][a-zA-Z0-9_]{0,30}$/);
export const equipmentInputSchema=z.object({key:inputKey,label:name,kind:z.enum(['bool','number','command'])});
export type EquipmentInput=z.infer<typeof equipmentInputSchema>;
export const equipmentTypeSchema=z.object({id,name,version:z.number().int().min(1).default(1),
 description:z.string().max(300).default(''),
 inputs:z.array(equipmentInputSchema).max(12).default([]),
 widgets:z.array(widgetSchema).min(1).max(60)});
export type EquipmentType=z.infer<typeof equipmentTypeSchema>;
export const equipmentInstanceSchema=z.object({id,typeId:id,typeVersion:z.number().int().min(1).default(1),name,
 bindings:z.record(z.string(),z.string()).default({})});
export type EquipmentInstance=z.infer<typeof equipmentInstanceSchema>;
// Ekipman tipleri yapilandirmadan ayri saklanir: sablon degisikligi haberlesmeyi yeniden uygulamaz.
export const equipmentTypesSchema=z.array(equipmentTypeSchema).max(200);
export function validateEquipmentTypes(input:unknown):EquipmentType[]{
 const types=equipmentTypesSchema.parse(input);
 if(new Set(types.map(t=>t.id)).size!==types.length)throw Error('Ekipman tipi kimliği tekrarlanıyor.');
 for(const t of types){
  if(new Set(t.inputs.map(i=>i.key)).size!==t.inputs.length)throw Error(t.name+': girdi anahtarı tekrarlanıyor.');
  const tagInput=(key:string)=>t.inputs.some(i=>i.key===key&&i.kind!=='command');
  const commandInput=(key:string)=>t.inputs.some(i=>i.key===key&&i.kind==='command');
  const needTag=(key:string)=>{if(key&&!tagInput(key))throw Error(t.name+': '+key+' girdisi tanımlı değil.');};
  const needCommand=(key:string)=>{if(key&&!commandInput(key))throw Error(t.name+': '+key+' komut girdisi tanımlı değil.');};
  for(const w of t.widgets){
   needTag(w.bindTag);needCommand(w.bindCommand);needTag(w.bindVisible);
   for(const p of w.parts||[])needTag(p.bindTag||'');
   for(const b of w.bindings||[])needTag(b.bindTag||'');
   for(const d of w.details||[]){needTag(d.bindTag||'');needCommand(d.bindCommand||'');}
  }
 }
 return types;
}
/* --- Bagimsiz kutuphane paketi (K12) --------------------------------------
 * Proje paketi (`/api/package`) BUTUN tesisi tasir ve ice aktarimda mevcut
 * ekranlari SILER. Entegratorun ihtiyaci bu degil: elindeki pompa/vana
 * sablonlarini bir sonraki projeye TASIMAK, mevcut isi bozmadan.
 *
 * Bu yuzden kutuphane paketi yalniz ekipman tiplerini ve kullandiklari
 * gorselleri tasir; ice aktarim EKLER ve BIRLESTIRIR, hicbir seyi silmez.
 * Ayni kimlikle gelen tip sessizce ezilmez: karar kullanicinindir
 * (`planLibraryMerge` kararlari isimlendirir, `applyLibraryMerge` uygular).
 */
export const LIBRARY_PACK_VERSION=1;
export const libraryAssetSchema=z.object({name:z.string().min(1).max(120),data:z.string().max(8*1024*1024),sha256:z.string().length(64)});
export const libraryPackSchema=z.object({
 kind:z.literal('scada-library'),
 packVersion:z.number().int().min(1),
 name:z.string().trim().max(120).default(''),
 exportedAt:z.number().int().min(0).default(0),
 types:z.array(equipmentTypeSchema).min(1).max(200),
 assets:z.array(libraryAssetSchema).max(200).default([])});
export type LibraryPack=z.infer<typeof libraryPackSchema>;
/** Gelen bir tipin mevcut kutuphaneye gore durumu. */
export type LibraryPlanItem={
 typeId:string;name:string;incomingVersion:number;
 /** `add` yeni tip; `upgrade` ayni tipin daha yeni surumu; `older` gelen daha eski/ayni;
  * `renamed` ayni kimlik farkli isim — sessizce ezilmemeli. */
 state:'add'|'upgrade'|'older'|'renamed';
 existingVersion?:number;existingName?:string};
export type LibraryPlan={packName:string;items:LibraryPlanItem[];assets:number};
/** Ne olacagini ONCE anlatir; hicbir sey degistirmez. */
export function planLibraryMerge(existing:EquipmentType[],pack:LibraryPack):LibraryPlan{
 const byId=new Map(existing.map(t=>[t.id,t]));
 const items=pack.types.map((t):LibraryPlanItem=>{
  const current=byId.get(t.id);
  if(!current)return {typeId:t.id,name:t.name,incomingVersion:t.version,state:'add'};
  const base={typeId:t.id,name:t.name,incomingVersion:t.version,existingVersion:current.version,existingName:current.name};
  if(current.name.trim().toLocaleLowerCase('tr')!==t.name.trim().toLocaleLowerCase('tr'))return {...base,state:'renamed'};
  return {...base,state:t.version>current.version?'upgrade':'older'};
 });
 return {packName:pack.name,items,assets:pack.assets.length};
}
/** Kullanicinin tip basina karari. Varsayilan davranis asagida aciklanmistir. */
export type LibraryChoice='upgrade'|'skip'|'duplicate';
/**
 * Paketi mevcut kutuphaneye uygular. HICBIR TIP SILINMEZ.
 * Varsayilanlar: `add` eklenir; `upgrade` yukseltilir; `older` atlanir;
 * `renamed` KOPYALANIR (yeni kimlikle) — ayni kimligi paylasan ama farkli
 * isim tasiyan iki sablonu birlestirmek, birinin sessizce kaybolmasidir.
 */
export function applyLibraryMerge(existing:EquipmentType[],pack:LibraryPack,choices:Record<string,LibraryChoice>={},newId:()=>string=()=>crypto.randomUUID()):{types:EquipmentType[];applied:{typeId:string;action:LibraryChoice|'add'}[]}{
 const plan=planLibraryMerge(existing,pack);
 const byId=new Map(existing.map(t=>[t.id,t]));
 const result=[...existing];
 const applied:{typeId:string;action:LibraryChoice|'add'}[]=[];
 const names=new Set(existing.map(t=>t.name.trim().toLocaleLowerCase('tr')));
 const uniqueName=(base:string)=>{
  let name=base,n=2;
  while(names.has(name.trim().toLocaleLowerCase('tr')))name=base+' ('+(n++)+')';
  names.add(name.trim().toLocaleLowerCase('tr'));
  return name;
 };
 for(const item of plan.items){
  const incoming=pack.types.find(t=>t.id===item.typeId)!;
  const choice=choices[item.typeId]??(item.state==='add'?'upgrade':item.state==='upgrade'?'upgrade':item.state==='renamed'?'duplicate':'skip');
  // Yeni tip de ad cakismasi yasayabilir: paketteki iki tip ayni adi tasiyor
  // ya da kopyalanan bir tip adi once kapmis olabilir. Ayni adli iki sablon
  // kutuphanede birbirinden ayirt edilemez, bu yuzden ad tekillestirilir.
  if(item.state==='add'){const named={...incoming,name:uniqueName(incoming.name)};result.push(named);applied.push({typeId:named.id,action:'add'});continue;}
  if(choice==='skip'){applied.push({typeId:item.typeId,action:'skip'});continue;}
  if(choice==='duplicate'){
   const copy={...incoming,id:newId(),name:uniqueName(incoming.name)};
   result.push(copy);applied.push({typeId:copy.id,action:'duplicate'});continue;
  }
  // upgrade: ayni kimlik, gelen surum yazilir. Ekrandaki instanslar KENDILIGINDEN
  // degismez; her biri K02 akisiyla ayri onaylanir.
  const at=result.findIndex(t=>t.id===item.typeId);
  if(at>=0&&byId.has(item.typeId))result[at]=incoming;
  applied.push({typeId:item.typeId,action:'upgrade'});
 }
 return {types:result,applied};
}
export const simulationScenarioSchema=z.object({name:name,values:z.record(z.string(),z.union([z.boolean(),z.number().finite()])).default({}),quality:z.record(z.string(),z.enum(['good','stale','bad','unknown'])).default({})});
export type SimulationScenario=z.infer<typeof simulationScenarioSchema>;
/* --- Kalici proses baglantisi (B25) ----------------------------------------
 * Uc uca yapisma su ana kadar yalniz cizim anindaki konumu hizaliyordu;
 * nesne tasininca baglanti kopuyordu cunku model hangi ucun neye bagli
 * oldugunu tutmuyordu. Bu kayit port INDEKSIYLE (ports.ts'in urettigi sira)
 * iki nesnenin ucunu kalici esler; taslak disinda hicbir sey degistirmez.
 */
export const linkSchema=z.object({id,fromWidgetId:id,fromPort:z.number().int().min(0).max(20),toWidgetId:id,toPort:z.number().int().min(0).max(20)});
export type Link=z.infer<typeof linkSchema>;
/* Yeni olusturulan ekranin sembol stili (2026-11-18: "B · Endustriyel metal" = Detayli).
 * Semadaki varsayilan BILEREK 'classic' kalir: symbolStyle alani olmayan eski kayitli ekranlar
 * bugun nasil gorunuyorsa oyle cizilir; yeni stil yalniz olusturma aninda acikca yazilir. */
export const newScreenSymbolStyle='detailed' as const;
export const screenSchema=z.object({id,name,width:z.number().int().min(400).max(4000),height:z.number().int().min(300).max(3000),widgets:z.array(widgetSchema).max(1000),equipment:z.array(equipmentInstanceSchema).max(200).default([]),scenarios:z.array(simulationScenarioSchema).max(50).default([]),links:z.array(linkSchema).max(4000).default([]),background:z.union([hexColor,z.literal('')]).default(''),symbolStyle:z.enum(['classic','isa101','detailed']).default('classic'),gridSize:z.number().int().min(5).max(100).default(10)});
export type Widget=z.infer<typeof widgetSchema>;
/** G45: nesnenin yazabilecegi araligi verir; nesne sinirlari etiketinkini daraltir, genisletmez. */
export function writeRangeOf(w:Widget,c:Config):{min:number;max:number}{
 const cmd=c.commands.find(x=>x.id===w.commandId),tag=cmd&&c.tags.find(t=>t.id===cmd.tagIds[0]);
 const low=tag?tag.min:-Infinity,high=tag?tag.max:Infinity;
 return {min:w.writeMin!==null?Math.max(low,w.writeMin):low,max:w.writeMax!==null?Math.min(high,w.writeMax):high};
}
/** Bir ekran nesnesinin bir etikete olan tum dogrudan ve dolayli baglarini adlandirir. */
export function widgetTagReferenceFields(w:Widget,tagId:string,config:Config):string[]{
 const fields:string[]=[];
 if(w.tagId===tagId)fields.push('nesne etiketi');
 if(w.visibleTagId===tagId)fields.push('gorunurluk etiketi');
 if(w.setpointTagId===tagId)fields.push('setpoint etiketi');
 if(w.visibleCondition&&conditionTags(w.visibleCondition).includes(tagId))fields.push('gorunurluk kosulu');
 const command=config.commands.find(c=>c.id===w.commandId);
 if(command?.tagIds.includes(tagId))fields.push('komut yazma hedefi');
 if(command?.feedbackTagIds.includes(tagId))fields.push('komut geri bildirimi');
 for(const [i,p] of w.parts.entries())if(p.tagId===tagId)fields.push('kademe '+(i+1)+' etiketi');
 for(const b of w.bindings||[])if(b.tagId===tagId)fields.push((bindingDef(w.type,b.role)?.label||b.role)+' bagi');
 for(const [i,d] of w.details.entries()){
  if(d.tagId===tagId)fields.push('bilgi satiri '+(i+1)+' etiketi');
  if(d.kind==='command'){
   const detailCommand=config.commands.find(c=>c.id===d.commandId);
   if(detailCommand?.tagIds.includes(tagId))fields.push('bilgi satiri '+(i+1)+' komut hedefi');
   if(detailCommand?.feedbackTagIds.includes(tagId))fields.push('bilgi satiri '+(i+1)+' komut geri bildirimi');
  }
 }
 return fields;
}
/** Ekipman tipinden ekrana instans basar; sablondaki bag anahtarlari nesnelerde tasinir. */
export function instantiateEquipment(type:EquipmentType,instanceId:string,x:number,y:number,newId:()=>string):Widget[]{
 const box=type.widgets.reduce((b,w)=>({x:Math.min(b.x,w.x),y:Math.min(b.y,w.y)}),{x:Infinity,y:Infinity});
 const groupId=newId();
 return type.widgets.map(w=>({...w,id:newId(),groupId,equipmentId:instanceId,equipmentRole:w.equipmentRole||w.id,
  x:x+(w.x-box.x),y:y+(w.y-box.y)}));
}
/** Instans baglarini uye nesnelere yazar; tek yerden eslenen etiket tum nesnelere gider. */
export function applyEquipmentBindings(screen:Screen):Screen{
 if(!screen.equipment.length)return screen;
 const byId=new Map(screen.equipment.map(e=>[e.id,e]));
 return {...screen,widgets:screen.widgets.map(w=>{
  const instance=w.equipmentId?byId.get(w.equipmentId):undefined;
  if(!instance)return w;
  const at=(key:string)=>instance.bindings[key]||'';
  const next={...w};
  if(w.bindTag)next.tagId=at(w.bindTag);
  if(w.bindCommand)next.commandId=at(w.bindCommand);
  // K03: kademe, saha bagi, bilgi satiri ve gorunurluk de parametrelenir;
  // yirmi benzer ekipmanda tek tek duzeltme gerekmesin diye.
  if(w.bindVisible)next.visibleTagId=at(w.bindVisible);
  if(w.parts?.some(p=>p.bindTag))next.parts=w.parts.map(p=>p.bindTag?{...p,tagId:at(p.bindTag)}:p);
  if(w.bindings?.some(b=>b.bindTag))next.bindings=w.bindings.map(b=>b.bindTag?{...b,tagId:at(b.bindTag)}:b);
  if(w.details?.some(d=>d.bindTag||d.bindCommand))next.details=w.details.map(d=>d.bindTag||d.bindCommand?{...d,...(d.bindTag?{tagId:at(d.bindTag)}:{}),...(d.bindCommand?{commandId:at(d.bindCommand)}:{})}:d);
  return next;
 })};
}
/* --- Ekipman tipi surum yasam dongusu (K02) --------------------------------
 * Sablon degisince ekrandaki yirmi instans kendiliginden degismez: eski
 * surumle calismaya devam eder. Bu DOGRU davranistir — yayindaki bir ekran
 * tasarimcinin sablon denemesi yuzunden degismemelidir. Eksik olan, farki
 * GORMEK ve istendiginde KONTROLLU yukseltmekti.
 */
export type EquipmentDrift={instanceId:string;name:string;typeId:string;from:number;to:number};
/** Tipinin gerisinde kalmis instanslar. */
export function equipmentDrift(screen:Screen,types:EquipmentType[]):EquipmentDrift[]{
 const byId=new Map(types.map(t=>[t.id,t]));
 return (screen.equipment||[]).flatMap(e=>{
  const type=byId.get(e.typeId);
  if(!type||type.version<=e.typeVersion)return [];
  return [{instanceId:e.id,name:e.name,typeId:e.typeId,from:e.typeVersion,to:type.version}];
 });
}
/**
 * Bir instansi tipin guncel surumune tasir: uye nesneler yeni sablondan
 * yeniden basilir, instans KONUMUNU ve BAGLARINI korur. Uye nesnelere bagli
 * kalici baglantilar (B25) kopar ve temizlenir — yeni sablonun uclari
 * eskisiyle ayni olmak zorunda degildir.
 */
export function upgradeEquipmentInstance(screen:Screen,instanceId:string,type:EquipmentType,newId:()=>string=()=>crypto.randomUUID()):Screen{
 const instance=(screen.equipment||[]).find(e=>e.id===instanceId);
 if(!instance||instance.typeId!==type.id)return screen;
 const members=screen.widgets.filter(w=>w.equipmentId===instanceId);
 if(!members.length)return screen;
 const x=Math.min(...members.map(w=>w.x)),y=Math.min(...members.map(w=>w.y));
 const kept=screen.widgets.filter(w=>w.equipmentId!==instanceId);
 const fresh=instantiateEquipment(type,instanceId,x,y,newId);
 const next:Screen={...screen,widgets:[...kept,...fresh],
  equipment:(screen.equipment||[]).map(e=>e.id===instanceId?{...e,typeVersion:type.version}:e)};
 return applyEquipmentBindings(pruneLinks(next));
}
/** Bir instansin uye nesnelerinden yeni tip surumu uretir; girdiler korunur. */
export function reviseEquipmentType(type:EquipmentType,widgets:Widget[]):EquipmentType{
 const x=Math.min(...widgets.map(w=>w.x)),y=Math.min(...widgets.map(w=>w.y));
 return {...type,version:type.version+1,
  widgets:widgets.map(w=>({...w,x:w.x-x,y:w.y-y,equipmentId:'',equipmentRole:w.equipmentRole||w.id,locked:false}))};
}
/** Bir instansin hangi girdilerinin eslenmedigini listeler. */
export function unboundEquipmentInputs(instance:EquipmentInstance,type:EquipmentType|undefined){
 if(!type)return [];
 return type.inputs.filter(i=>!instance.bindings[i.key]);
}
export type Screen=z.infer<typeof screenSchema>;
/** Bir nesnenin ucuna bagli tum kalici baglanti kayitlari (B25). */
export function linksOf(screen:Screen,widgetId:string):Link[]{
 return (screen.links||[]).filter(l=>l.fromWidgetId===widgetId||l.toWidgetId===widgetId);
}
/** Yeni kalici baglanti ekler; kendine baglanma ve ayni ucu ciftinin tekrari reddedilir (yon farketmez). */
export function addLink(screen:Screen,link:{fromWidgetId:string;fromPort:number;toWidgetId:string;toPort:number}):Screen{
 if(link.fromWidgetId===link.toWidgetId)return screen;
 const same=(l:Link)=>
  (l.fromWidgetId===link.fromWidgetId&&l.fromPort===link.fromPort&&l.toWidgetId===link.toWidgetId&&l.toPort===link.toPort)||
  (l.fromWidgetId===link.toWidgetId&&l.fromPort===link.toPort&&l.toWidgetId===link.fromWidgetId&&l.toPort===link.fromPort);
 if((screen.links||[]).some(same))return screen;
 return {...screen,links:[...(screen.links||[]),{id:crypto.randomUUID(),...link}]};
}
/** Baglantiyi kimligiyle kaldirir; bilinmeyen kimlik sessizce yok sayilir. */
export function removeLink(screen:Screen,linkId:string):Screen{
 return {...screen,links:(screen.links||[]).filter(l=>l.id!==linkId)};
}
/** Silinmis nesnelere ait baglantilari temizler (nesne kaldirildiginda cagrilir). */
export function pruneLinks(screen:Screen):Screen{
 const ids=new Set(screen.widgets.map(w=>w.id));
 return {...screen,links:(screen.links||[]).filter(l=>ids.has(l.fromWidgetId)&&ids.has(l.toWidgetId))};
}
/** Tasinan nesneye bagli komsu nesneleri zincirleme birlikte tasir. Her nesne en fazla bir kez tasinir (dongude takilmaz);
 * kilitli nesne tasinmaz ve zincir orada durur. */
export function moveWithLinks(screen:Screen,widgetId:string,dx:number,dy:number):Screen{
 if(!dx&&!dy)return screen;
 const byId=new Map(screen.widgets.map(w=>[w.id,w]));
 const start=byId.get(widgetId);
 if(!start||start.locked)return screen;
 const visited=new Set<string>([widgetId]),moveIds=new Set<string>([widgetId]),queue=[widgetId];
 while(queue.length){
  const cur=queue.shift()!;
  for(const l of screen.links||[]){
   const otherId=l.fromWidgetId===cur?l.toWidgetId:l.toWidgetId===cur?l.fromWidgetId:null;
   if(!otherId||visited.has(otherId))continue;
   visited.add(otherId);
   const other=byId.get(otherId);
   if(!other||other.locked)continue;
   moveIds.add(otherId);queue.push(otherId);
  }
 }
 return {...screen,widgets:screen.widgets.map(w=>moveIds.has(w.id)?{...w,x:w.x+dx,y:w.y+dy}:w)};
}
export type ScreenRecord={id:string;name:string;version:number;publishedVersion:number;draft:Screen;published:Screen|null;updatedBy?:string;updatedAt?:number;
 // B26: navigasyon duzeni — klasor (bos=kok) ve klasor icindeki sira. Zod ile dogrulanmaz, kayit seviyesindedir.
 folder?:string;order?:number};
/** Ekran listesini klasor (kok once), sira numarasi ve isme gore siralar; duzeni ayarlanmamis kayitlar sona duser. */
export function sortScreens(records:ScreenRecord[]):ScreenRecord[]{
 return [...records].sort((a,b)=>{
  const fa=a.folder||'',fb=b.folder||'';
  if(fa!==fb)return fa===''?-1:fb===''?1:fa.localeCompare(fb,'tr');
  const oa=a.order??Number.MAX_SAFE_INTEGER,ob=b.order??Number.MAX_SAFE_INTEGER;
  if(oa!==ob)return oa-ob;
  return a.name.localeCompare(b.name,'tr');
 });
}
/** Ekranlari klasorlere gruplar; kok klasor (bos ad) her zaman once gelir, ardindan klasorler alfabetik sirada. */
export function screenTree(records:ScreenRecord[]):{folder:string;screens:ScreenRecord[]}[]{
 const sorted=sortScreens(records),groups=new Map<string,ScreenRecord[]>();
 for(const s of sorted){const f=s.folder||'';if(!groups.has(f))groups.set(f,[]);groups.get(f)!.push(s);}
 const folders=[...groups.keys()].filter(f=>f!=='').sort((a,b)=>a.localeCompare(b,'tr'));
 const result:{folder:string;screens:ScreenRecord[]}[]=[];
 if(groups.has(''))result.push({folder:'',screens:groups.get('')!});
 for(const f of folders)result.push({folder:f,screens:groups.get(f)!});
 return result;
}
/** Iki taslak arasindaki fark ozeti; cakisma cozumunde kullanicinin ne kaybedecegini gosterir. */
export function screenDelta(mine:Screen,theirs:Screen){
 const a=new Map(mine.widgets.map(w=>[w.id,w])),b=new Map(theirs.widgets.map(w=>[w.id,w]));
 let added=0,removed=0,changed=0;
 for(const [id,w] of a){const other=b.get(id);if(!other)added++;else if(JSON.stringify(w)!==JSON.stringify(other))changed++;}
 for(const id of b.keys())if(!a.has(id))removed++;
 const equipment=Math.abs((mine.equipment||[]).length-(theirs.equipment||[]).length);
 return {added,removed,changed,equipment,total:added+removed+changed};
}
export type Sample={value:boolean|number|null;quality:'good'|'stale'|'bad'|'unknown';receivedAt:number;sampledAt:number;sequence:number};
export type DeviceHealth={id:string;code:string;name:string;tags:number;good:number;seen:number;dataAgeMs:number;status:'ready'|'partial'|'down'|'empty'};
export type AlarmCounts={total:number;active:number;unacked:number;activeUnacked:number;outstanding:number;critical:number;unackedOutstanding:number};
export type Live={samples:Record<string,Sample>;gatewayConnected:boolean;activeRevision:number;desiredRevision:number;deploying:boolean;commands:Execution[];alarms:AlarmEvent[];
 alarmCounts:AlarmCounts;alarmFlood:AlarmFlood;devices:DeviceHealth[];devicesReady:number;devicesTotal:number;controlReady:boolean};
export const deviceStatusLabels:Record<DeviceHealth['status'],string>={ready:'Güncel',partial:'Kısmen güncel',down:'Veri yok',empty:'Etiket yok'};
/* --- Granuler izinler (B29) -----------------------------------------------
 * Rol kaba kapidir; izinler onu DARALTIR, hicbir zaman genisletmez.
 * Bos liste = o boyutta kisitlama yok. Boylece mevcut kullanicilar
 * (izinsiz kayitlar) bugunku davranisla calismaya devam eder.
 */
export const userPermissionsSchema=z.object({
 screens:z.array(z.string().max(80)).max(200).default([]),
 commands:z.array(z.string().max(80)).max(500).default([]),
 areas:z.array(z.string().max(80)).max(100).default([])});
export type UserPermissions=z.infer<typeof userPermissionsSchema>;
export const emptyPermissions:UserPermissions={screens:[],commands:[],areas:[]};
export type User={id:string;username:string;role:'admin'|'designer'|'operator'|'viewer';disabled?:0|1|boolean;permissions?:UserPermissions};
/** Bir boyutta izin var mi? Bos liste kisitlama yok demektir; yonetici her zaman gecer. */
export function permits(user:Pick<User,'role'|'permissions'>,kind:keyof UserPermissions,value:string){
 if(user.role==='admin')return true;
 const list=user.permissions?.[kind];
 if(!list||!list.length)return true;
 return list.includes(value);
}
/** Kullanicinin gorebilecegi ekranlar; kisitli kullanici baskasinin alanini gormesin. */
export function visibleScreens<T extends {id:string}>(user:Pick<User,'role'|'permissions'>,screens:T[]){
 return screens.filter(s=>permits(user,'screens',s.id));
}
/* --- Kullanici tercihleri (B31/B32) ---------------------------------------
 * Tema, dil, yogunluk ve kisisel panel kullaniciya baglidir; baska bilgisayarda
 * ayni hesapla girince ayni duzen gelir. Sunucuda saklanir, cihazda degil.
 */
/** Panel kutusu ikonlari; gorsel karsiliklari web tarafinda (panelIcons). */
export const panelIconIds=['fan','cog','pump','power','play','gauge','thermo','flame','snow','zap','wind','level','conveyor','light','timer','signal','wrench','siren'] as const;
export const dashboardTileSchema=z.object({tagId:z.string().min(1).max(80),label:z.string().trim().max(60).default(''),unit:z.string().max(16).default(''),decimals:z.number().int().min(0).max(4).default(0),
 // Dijital kutucukta 1/0 metni; bos ise RUN/STOP.
 onText:z.string().trim().max(16).default(''),offText:z.string().trim().max(16).default(''),
 // Kart rengi (bos = tema) ve minik ikon (bos = yok).
 color:z.string().regex(/^(#[0-9a-fA-F]{6})?$/).default(''),icon:z.enum(['',...panelIconIds]).default('')});
export const panelPageSchema=z.object({id:z.string().regex(/^[a-z0-9-]{1,40}$/),name:z.string().trim().min(1).max(40),
 columns:z.number().int().min(2).max(6).default(4),tiles:z.array(dashboardTileSchema).max(48).default([])});
export const preferencesSchema=z.object({
 theme:z.enum(['light','dark','system']).default('system'),
 language:z.enum(['tr','en']).default('tr'),
 density:z.enum(['comfortable','compact','large']).default('comfortable'),
 homeScreenId:z.string().max(80).default(''),
 dashboard:z.array(dashboardTileSchema).max(48).default([]),
 panelColumns:z.number().int().min(2).max(6).default(4),
 // Panel sayfalari (bolumler). Bossa eski `dashboard` tek sayfa "Genel" sayilir.
 panelPages:z.array(panelPageSchema).max(12).default([]).refine(p=>new Set(p.map(x=>x.id)).size===p.length,'Panel sayfa kimligi tekrarlaniyor.'),
 /* 2026-09-25 kisisellestirme: alarm sesi hesaba tasindi (tablet ve masaustu ayni kisi), onem esigiyle.
  * Pano (kiosk): duvar monitoru — Panelim sayfalari doner, acilista tam ekran, kabuk gizli. */
 alarmSound:z.object({enabled:z.boolean().default(true),minSeverity:z.enum(['info','warning','critical']).default('info')}).default({enabled:true,minSeverity:'info'}),
 kiosk:z.object({enabled:z.boolean().default(false),rotateSeconds:z.number().int().min(0).max(3600).default(0),autoFullscreen:z.boolean().default(true),hideChrome:z.boolean().default(true)}).default({enabled:false,rotateSeconds:0,autoFullscreen:true,hideChrome:true}),
 // Kenar cubugunda sabitlenen ekranlar (kisisel kisayol).
 pinnedScreenIds:z.array(z.string().max(80)).max(12).default([]),
 // Adli filtreler: tablo filtre durumu ad verilerek saklanir, her bilgisayarda gelir.
 savedFilters:z.array(z.object({id:z.string().regex(/^[a-z0-9-]{1,40}$/),name:z.string().trim().min(1).max(40),scope:z.string().regex(/^[a-z.]{1,40}$/),value:z.unknown()})).max(40).default([])});
export type Preferences=z.infer<typeof preferencesSchema>;
export const defaultPreferences:Preferences=preferencesSchema.parse({});
/** Arayuz metinleri: eksik anahtar Turkce metne duser, cevirisiz kalan yer bos gorunmez. */
export const dictionary:Record<'tr'|'en',Record<string,string>>={
 tr:{'nav.runtime':'Operatör ekranı','nav.editor':'Tasarım stüdyosu','nav.devices':'Cihazlar','nav.tags':'Etiketler','nav.commands':'Komutlar','nav.alarms':'Alarmlar','nav.audit':'İşlem kayıtları','nav.dashboard':'Panelim','nav.settings':'Proje ayarları','common.workspace':'Çalışma alanı','common.screens':'EKRANLAR','common.preferences':'Tercihler','common.save':'Kaydet','common.cancel':'Vazgeç'},
 en:{'nav.runtime':'Operator view','nav.editor':'Design studio','nav.devices':'Devices','nav.tags':'Tags','nav.commands':'Commands','nav.alarms':'Alarms','nav.audit':'Audit log','nav.dashboard':'My panel','nav.settings':'Project settings','common.workspace':'Workspace','common.screens':'SCREENS','common.preferences':'Preferences','common.save':'Save','common.cancel':'Cancel'}};
export function translator(language:'tr'|'en'){return (key:string)=>dictionary[language][key]??dictionary.tr[key]??key;}
export type Execution={id:string;commandId:string;name:string;user:string;value:boolean|number;status:string;createdAt:number;updatedAt:number;message:string;steps:{tagId:string;status:string;ackAt?:number}[];configRevision:number;screenId:string;screenVersion:number;reason?:string;approvedBy?:string;approvedAt?:number;
 // Script calismasi: zaman damgali kayit (en cok 200 satir); recover = sunucu calisirken kapandi, guvenli durum bekliyor.
 kind?:'script';log?:{at:number;text:string}[];recover?:boolean;stoppedBy?:string};
export const commandStatusLabels:Record<string,string>={awaiting:'İkinci onay bekleniyor',accepted:'Kabul edildi',sent:'Gönderildi',acknowledged:'Geri okuma bekleniyor',verified:'Doğrulandı',failed:'Başarısız',rejected:'Reddedildi',unverified:'Doğrulanamadı',partial:'Kısmen tamamlandı',uncertain:'Sonuç belirsiz',running:'Script çalışıyor',completed:'Script tamamlandı',aborted:'Durdu · güvenli durum yazıldı'};
export function statusText(s:string){return commandStatusLabels[s]||s;}
export const finalStatuses=['verified','rejected','failed','unverified','partial','uncertain','completed','aborted'];
/** Bir etiketin kapladigi register sayisi: bool/16 bit tipler 1, 32 bit tipler 2 register kaplar. */
export function registerCount(dataType:Tag['dataType']):number{return dataType==='uint32'||dataType==='int32'||dataType==='float32'?2:1;}
/**
 * float32 yolunda geri okuma yazilan degere TANIM GEREGI esit olamaz: deger once
 * float32'ye yuvarlanir, geri okunurken toPrecision(15) ile acilir ve yuvarlama
 * hatasi gorunur kalir (37.2 -> 37.2000007629395). Katı esitlik bu yolda dogru
 * calisan bir yazmayi 'unverified' gosterir ve hedefi kilitler.
 * Otomatik pay yarim ULP'nin iki kati (2^-23) goreli hatadir; scale/offset'ten
 * dogan float64 gurultusu icin kucuk bir mutlak taban eklenir.
 */
const FLOAT32_RELATIVE_EPS=Math.pow(2,-23);
export function verifyToleranceOf(tag:Pick<Tag,'dataType'|'verifyTolerance'|'offset'>,value:number):number{
 const explicit=tag.verifyTolerance;
 if(explicit!==null&&explicit!==undefined)return Math.abs(explicit);
 if(tag.dataType!=='float32')return 0;// tam sayi tipleri tam temsil edilir, esitlik dogru olcut
 return Math.abs(value-(tag.offset??0))*FLOAT32_RELATIVE_EPS+Math.abs(value)*1e-12;
}
/** Geri okunan deger komutun yazdigi degeri dogruluyor mu? Bool'da esitlik, sayida tolerans. */
export function feedbackMatches(tag:Pick<Tag,'dataType'|'verifyTolerance'|'offset'>|undefined,expected:boolean|number,actual:unknown):boolean{
 if(typeof expected==='boolean'||typeof actual!=='number'||typeof expected!=='number')return actual===expected;
 if(!tag)return actual===expected;// etiket tanimi yoksa gevsetme yok
 if(!Number.isFinite(actual))return false;
 return Math.abs(actual-expected)<=verifyToleranceOf(tag,expected);
}
function swapBytes(r:number){return ((r&0xFF)<<8)|((r>>8)&0xFF);}
function combineRegisters(regs:number[],wordOrder:'big'|'little',byteOrder:'big'|'little'):number{
 const oriented=byteOrder==='little'?regs.map(swapBytes):regs;
 const ordered=wordOrder==='little'?[...oriented].reverse():oriented;
 let v=0;for(const r of ordered)v=v*65536+(r&0xFFFF);
 return v;
}
function splitToRegisters(v:number,wordOrder:'big'|'little',byteOrder:'big'|'little'):number[]{
 const hi=Math.floor(v/65536)&0xFFFF,lo=v&0xFFFF;
 const ordered=wordOrder==='little'?[lo,hi]:[hi,lo];
 return byteOrder==='little'?ordered.map(swapBytes):ordered;
}
/** Ham register(ler)i tag tanimina (tip, sira, bit alani, olcek/offset) gore muhendislik degerine cevirir. Sinir disi deger acik hatayla reddedilir. */
export function decodeRegisters(registers:number[],tag:Tag):number{
 const n=registerCount(tag.dataType);
 if(registers.length<n)throw Error(tag.code+': çözümleme için register sayısı yetersiz.');
 const regs=registers.slice(0,n).map(r=>r&0xFFFF);
 /* B58: dijital deger olcek/offset TASIMAZ ve muhendislik sinirina tabi degildir —
  * bir kontak ya kapalidir ya degildir. encodeValue de bool'u ayni sekilde erken
  * dondurur (olcek uygulamaz); cozme tarafinin kodlamanin tersi olmasi icin bu
  * dallanma burada da erken bitmelidir. Aksi halde offset!=0 tanimlanmis bir bool
  * etiketinde 0 register'i 'offset' degerine kayar, Boolean()'a girince HER ZAMAN
  * true okunur — kapali bir kontak ekranda acik gorunur. */
 if(tag.dataType==='bool')return regs[0]?1:0;
 let raw:number;
 if(n===1){
  const u=regs[0];
  if(tag.bit!==null)raw=(u>>tag.bit)&1;
  else if(tag.dataType==='int16')raw=u>32767?u-65536:u;
  else raw=u;
 }else{
  const combined=combineRegisters(regs,tag.wordOrder,tag.byteOrder);
  if(tag.dataType==='float32'){const buf=new ArrayBuffer(4),view=new DataView(buf);view.setUint32(0,combined>>>0,false);raw=view.getFloat32(0,false);}
  else if(tag.dataType==='int32')raw=combined>0x7FFFFFFF?combined-0x100000000:combined;
  else raw=combined;
 }
 const value=Number((raw*tag.scale+tag.offset).toPrecision(15));
 if(value<tag.min||value>tag.max)throw Error(tag.code+': çözümlenen değer sınır dışı ('+value+').');
 return value;
}
/** Muhendislik degerini yazilacak ham register dizisine cevirir (word/byte sirasi ve bit alani dahil). Sinir disi deger reddedilir. */
export function encodeValue(value:number,tag:Tag):number[]{
 if(typeof value!=='number'||!Number.isFinite(value))throw Error(tag.code+': değer sayısal olmalı.');
 if(value<tag.min||value>tag.max)throw Error(tag.code+': değer izin verilen sınırlar dışında ('+value+').');
 if(tag.dataType==='bool')return [value?1:0];
 const raw=(value-tag.offset)/tag.scale;
 if(tag.dataType==='float32'){
  const buf=new ArrayBuffer(4),view=new DataView(buf);view.setFloat32(0,raw,false);
  return splitToRegisters(view.getUint32(0,false),tag.wordOrder,tag.byteOrder);
 }
 const rounded=Math.round(raw);
 if(Math.abs(raw-rounded)>1e-6)throw Error(tag.code+': değer register biçimine çevrilemiyor.');
 if(tag.dataType==='uint16'||tag.dataType==='int16'){
  if(tag.bit!==null){
   if(rounded!==0&&rounded!==1)throw Error(tag.code+': bit alanı yalnız 0/1 olabilir.');
   return [rounded<<tag.bit];
  }
  const min=tag.dataType==='int16'?-32768:0,max=tag.dataType==='int16'?32767:65535;
  if(rounded<min||rounded>max)throw Error(tag.code+': değer register sınırını aşıyor.');
  return [rounded<0?rounded+65536:rounded];
 }
 const min=tag.dataType==='int32'?-2147483648:0,max=tag.dataType==='int32'?2147483647:4294967295;
 if(rounded<min||rounded>max)throw Error(tag.code+': değer register sınırını aşıyor.');
 return splitToRegisters(rounded<0?rounded+4294967296:rounded,tag.wordOrder,tag.byteOrder);
}
/* --- B58: kodek tek kaynak ---------------------------------------------------
 * Modbus register kodlama/cozme mantigi eskiden UC yerde ayri ayri duruyordu:
 * burada TypeScript olarak, driver.ts'teki `-convert` dugumunde elle yazilmis
 * bir cozme kopyasi, ve `scada-write-guard` dugumunde elle yazilmis bir kodlama
 * kopyasi. Kopyalar tip denetimi ve birim testi gormedigi icin sessizce
 * kaymislardi (kanonik decodeRegisters sinir disi degeri hata ile reddederken
 * gomulu kopya kontrolu atlayip 'good' kalite donduruyordu — sahada sessiz
 * hata). Asagidaki fonksiyon, OPC UA tarafinin zaten kullandigi desenle
 * (opcQuality.toString() gibi) kanonik kodek fonksiyonlarini oldugu gibi
 * gomulu Node-RED function node'una tasir; artik TEK kaynak var.
 */
/** Modbus kodek fonksiyonlarini (.toString() ile) gomulu function node govdesine
 * enjekte edilecek tek bir JS metni halinde birlestirir. Bagimlilik sirasina
 * dikkat: swapBytes -> combineRegisters/splitToRegisters -> registerCount ->
 * decodeRegisters/encodeValue. Fonksiyonlar kendi kendine yeterlidir (yalniz
 * parametrelerine ve birbirlerine referans verirler), bu yuzden .toString()
 * ile tasinabilirler. */
export function modbusCodecSource():string{
 return [swapBytes,combineRegisters,splitToRegisters,registerCount,decodeRegisters,encodeValue].map(f=>f.toString()).join('\n');
}
export function validateConfig(input:unknown):Config {
 const c=configSchema.parse(input);
 for(const list of [c.connections,c.devices,c.tags,c.commands]) if(new Set(list.map(x=>x.id)).size!==list.length)throw Error('Tekrarlanan kayıt kimliği.');
 if(new Set(c.devices.map(d=>d.code)).size!==c.devices.length)throw Error('Cihaz kodu benzersiz olmalı.');
 if(new Set(c.devices.map(d=>d.connectionId+':'+d.slaveId)).size!==c.devices.length)throw Error('Bağlantı ve Slave ID başka cihazda kullanılıyor.');
 for(const d of c.devices){if(!c.connections.some(x=>x.id===d.connectionId))throw Error('Cihaz bağlantısı bulunamadı.');if(d.staleMs<d.pollMs*2)throw Error('Güncellik süresi en az iki tarama olmalı.');}
 // B43: protokole gore baglanti tutarliligi. Modbus davranisi bugunku gibi kalir; opc-ua icin endpoint zorunludur.
 for(const conn of c.connections){
  if(connectionProtocol(conn)==='opc-ua'){
   const endpoint=(conn.endpoint??'').trim();
   if(!endpoint)throw Error(conn.name+': OPC UA bağlantısı için sunucu adresi (endpoint) gerekli, örn. opc.tcp://sunucu:4840.');
   if(!/^opc\.tcp:\/\//i.test(endpoint))throw Error(conn.name+': OPC UA endpoint adresi "opc.tcp://" ile başlamalı.');
  }else if(connectionProtocol(conn)==='s7'){
   if(!conn.host.trim()||!conn.port)throw Error(conn.name+': S7 bağlantısı için PLC IP adresi ve port (genelde 102) gerekli.');
  }else if(connectionProtocol(conn)==='ads'){
   if(!conn.host.trim()||!conn.port)throw Error(conn.name+': ADS bağlantısı için PLC IP adresi ve port (genelde 48898) gerekli.');
   if(!conn.amsNetId?.trim())throw Error(conn.name+': ADS bağlantısı için PLC\'nin AMS Net ID\'si gerekli, örn. 192.0.2.120.1.1.');
   parseAmsNetId(conn.amsNetId);
   if(conn.localAmsNetId?.trim())parseAmsNetId(conn.localAmsNetId);
  }else if(connectionProtocol(conn)==='mqtt'){
   if(!conn.host.trim()||!conn.port)throw Error(conn.name+': MQTT bağlantısı için broker adresi ve port (genelde 1883, TLS ile 8883) gerekli.');
  }else if(connectionProtocol(conn)==='snmp'){
   checkSnmpConnection(conn);
  }else if(connectionProtocol(conn)==='http'){
   try{parseHttpBaseUrl(conn.httpBaseUrl??'');}catch(e){throw Error(conn.name+': '+(e as Error).message);}
  }else if(connectionProtocol(conn)==='sql'){
   checkSqlConnection(conn);
  }else if(connectionProtocol(conn)==='bacnet'){
   checkBacnetConnection(conn);
  }else if(connectionProtocol(conn)==='enip'){
   checkEnipConnection(conn);
  }else if(isSerial(conn)){
   if(!conn.serialPort?.trim())throw Error(conn.name+': Modbus RTU seri bağlantısı için port gerekli, örn. COM3.');
   if(conn.serialMode==='ascii'&&(conn.dataBits??8)!==7)throw Error(conn.name+': Modbus ASCII 7 veri biti kullanır (Delta DVP varsayılanı 9600, 7, E, 1).');
  }else{
   if(!conn.host.trim()||!conn.port)throw Error(conn.name+': Modbus bağlantısı için sunucu adresi ve port gerekli.');
  }
 }
 const ranges:{deviceId:string;area:string;start:number;end:number}[]=[],codes=new Set<string>();
 for(const t of c.tags){
  if(!c.devices.some(x=>x.id===t.deviceId))throw Error('Etiket cihazı bulunamadı.');
  const code=t.deviceId+':'+t.code;
  if(codes.has(code))throw Error('Etiket kodu tekrarlanıyor.');codes.add(code);
  const tagConn=c.connections.find(x=>x.id===c.devices.find(d=>d.id===t.deviceId)?.connectionId);
  if(tagConn?.protocol==='opc-ua'){
   if(!t.nodeId?.trim())throw Error(t.code+': OPC UA etiketi için node kimliği (nodeId) gerekli.');
   // Yazma (Faz 1): deger sinirlari ve dogrulama toleransi Modbus'la ayni kurala tabidir; nodeId bicimi surucude denetlenir.
   if(t.access==='readwrite')checkWritableTag(t);
   continue;
  }
  if(tagConn?.protocol==='s7'){
   if(!t.s7Address?.trim())throw Error(t.code+': S7 etiketi için adres gerekli, örn. DB1,REAL4 veya M0.0.');
   const parsed=parseS7Address(t.s7Address);
   if(parsed.dataType!==t.dataType)throw Error(t.code+': S7 adresi '+parsed.address+' '+parsed.dataType+' okur, etiketin veri tipi '+t.dataType+'.');
   // Yazma: ayni sinir/tolerans kurallari; giris goruntusu (I/E) her cevrimde PLC'nin girislerinden ezilir, yazilmaz.
   if(t.access==='readwrite'){checkWritableTag(t);if(/^I/.test(parsed.address))throw Error(t.code+': S7 giriş alanına (I/E) yazılamaz; M, Q veya DB adresi kullanın.');}
   if(t.dataType!=='bool'&&t.min>=t.max)throw Error('Alt sınır üst sınırdan küçük olmalı.');
   continue;
  }
  if(tagConn?.protocol==='mqtt'){
   checkMqttTag(t);
   continue;
  }
  if(tagConn?.protocol==='snmp'){checkSnmpTag(t);continue;}
  if(tagConn?.protocol==='http'){checkHttpTag(t);continue;}
  if(tagConn?.protocol==='sql'){checkSqlTag(t);continue;}
  if(tagConn?.protocol==='bacnet'){checkBacnetTag(t);continue;}
  if(tagConn?.protocol==='enip'){checkEnipTag(t);continue;}
  if(tagConn?.protocol==='ads'){
   if(!t.adsSymbol?.trim())throw Error(t.code+': ADS etiketi için sembol gerekli, örn. GVL.fSicaklik.');
   parseAdsSymbol(t.adsSymbol);
   if(t.access==='readwrite')checkWritableTag(t);
   if(t.dataType!=='bool'&&t.min>=t.max)throw Error('Alt sınır üst sınırdan küçük olmalı.');
   continue;
  }
  if((t.area==='coil'||t.area==='discrete-input')!==(t.dataType==='bool'))throw Error('Adres alanı ile veri tipi uyumsuz.');
  if(t.area.includes('input')&&t.access!=='read')throw Error('Giriş alanına yazılamaz.');
  if(t.min>=t.max)throw Error('Alt sınır üst sınırdan küçük olmalı.');
  if(t.bit!==null&&t.dataType!=='uint16'&&t.dataType!=='int16')throw Error(t.code+': bit alanı yalnız 16 bit veri tipinde kullanılabilir.');
  if(t.dataType==='bool'&&t.verifyTolerance)throw Error(t.code+': dijital etikette doğrulama toleransı kullanılamaz; geri okuma ya eşittir ya değildir.');
  if(t.verifyTolerance!=null&&t.verifyTolerance>(t.max-t.min)/2)throw Error(t.code+': doğrulama toleransı çalışma aralığının yarısını aşamaz; bu genişlikte pay her okumayı doğrulanmış gösterir.');
  const count=registerCount(t.dataType),start=t.address,end=t.address+count-1;
  if(end>65535)throw Error(t.code+': etiket adres aralığı 65535\'i aşıyor.');
  for(const r of ranges)if(r.deviceId===t.deviceId&&r.area===t.area&&start<=r.end&&end>=r.start)throw Error('Etiket adres aralığı çakışıyor: '+t.code+' ('+start+'-'+end+').');
  ranges.push({deviceId:t.deviceId,area:t.area,start,end});
 }
 for(const d of c.commands){
  if(new Set(d.tagIds).size!==d.tagIds.length)throw Error('Komut hedefi tekrarlanamaz.');
  const ts=d.tagIds.map(i=>c.tags.find(t=>t.id===i));
  if(ts.some(t=>!t||t.access!=='readwrite'))throw Error('Komutun yazılabilir etiketi bulunamadı.');
  if(isScript(d))validateScriptCommand(d,c);
  else{
   if(d.tagIds.length<1||d.tagIds.length>2)throw Error(d.name+': komut bir ya da iki hedefe yazar.');
   if(ts.length===2&&ts.some(t=>t!.dataType!=='bool'))throw Error('Çift komut yalnızca dijital etiketleri destekler.');
   if(d.feedbackTagIds.length!==d.tagIds.length)throw Error('Her komut adımı için geri bildirim seçin.');
   d.feedbackTagIds.forEach((i,n)=>{const t=c.tags.find(t=>t.id===i);if(!t||t.dataType!==ts[n]!.dataType)throw Error('Geri bildirim tipi uyumsuz.');});
  }
  if(new Set(d.permissives.map(p=>p.tagId)).size!==d.permissives.length)throw Error('Aynı izin koşulu iki kez tanımlanamaz.');
  for(const p of d.permissives){const t=c.tags.find(t=>t.id===p.tagId);
   if(!t)throw Error('İzin koşulu etiketi bulunamadı.');
   if(t.dataType!=='bool')throw Error('İzin koşulu yalnızca dijital etiketle kurulur.');
   if(d.tagIds.includes(p.tagId))throw Error('Komut hedefi kendi izin koşulu olamaz.');}
 }
 if(c.mqttPublish)checkMqttPublish(c);
 return c;
}
/** MQTT etiketi: konu (joker yok), JSON/zaman yolu bicimi, salt okuma (MQTT yazma kapsam disi: mqtt out teslim onayi vermez). */
export function checkMqttTag(t:Pick<Tag,'code'|'access'|'mqttTopic'|'mqttJsonPath'|'mqttTimestampPath'>){
 try{parseMqttTopic(t.mqttTopic??'');mqttPathSteps(t.mqttJsonPath);mqttPathSteps(t.mqttTimestampPath);}
 catch(e){throw Error(t.code+': '+(e as Error).message);}
 if(t.access==='readwrite')throw Error(t.code+': MQTT etiketi yalnız okunur. MQTT ile yazma desteklenmiyor (yayın teslim/geri okuma onayı vermez); erişimi "Salt okuma" yapın.');
}
const readOnlyText=(code:string,label:string,why:string)=>code+': '+label+' etiketi yalnız okunur ('+why+'); erişimi "Salt okuma" yapın.';
/** SNMP etiketi: sayisal OID, salt okuma (SNMP SET kapsam disi). */
export function checkSnmpTag(t:Pick<Tag,'code'|'access'|'snmpOid'>){
 try{parseSnmpOid(t.snmpOid??'');}catch(e){throw Error(t.code+': '+(e as Error).message);}
 if(t.access==='readwrite')throw Error(readOnlyText(t.code,'SNMP','SNMP ile yazma desteklenmiyor'));
}
/** HTTP etiketi: goreli yol, JSON/zaman yolu bicimi, salt okuma. */
export function checkHttpTag(t:Pick<Tag,'code'|'access'|'httpPath'|'httpJsonPath'|'httpTimestampPath'>){
 try{parseHttpPath(t.httpPath??'');mqttPathSteps(t.httpJsonPath);mqttPathSteps(t.httpTimestampPath);}
 catch(e){throw Error(t.code+': '+(e as Error).message);}
 if(t.access==='readwrite')throw Error(readOnlyText(t.code,'HTTP','HTTP ile yazma desteklenmiyor'));
}
/** SQL etiketi: tek SELECT + sutun, salt okuma. */
export function checkSqlTag(t:Pick<Tag,'code'|'access'|'sqlQuery'|'sqlColumn'>){
 try{checkSqlQuery(t.sqlQuery??'');checkSqlColumn(t.sqlColumn);}catch(e){throw Error(t.code+': '+(e as Error).message);}
 if(t.access==='readwrite')throw Error(readOnlyText(t.code,'SQL','veritabanına yazma desteklenmiyor'));
}
/** SNMP baglantisi: host (IPv6 / adres:port yazimi yok), v3'te guvenlik seviyesine gore protokoller; 161 disi port yalniz IPv4. */
export function checkSnmpConnection(conn:Connection){
 const host=conn.host.trim();
 if(!host||!conn.port)throw Error(conn.name+': SNMP bağlantısı için cihaz adresi ve port (genelde 161) gerekli.');
 if(host.includes(':'))throw Error(conn.name+': SNMP adresi IPv4 ya da makine adı olmalı (IPv6 ve adres:port yazımı desteklenmez; portu ayrı alana yazın).');
 if(conn.port!==161&&!/^\d{1,3}(\.\d{1,3}){3}$/.test(host))throw Error(conn.name+': SNMP 161 dışı port yalnız IPv4 adresle kullanılabilir (makine adında paket portu yok sayar).');
 if((conn.snmpVersion??'2c')==='3'){
  const level=conn.snmpSecurityLevel??'authPriv';
  if(level!=='noAuthNoPriv'&&!conn.snmpAuthProtocol)throw Error(conn.name+': SNMPv3 '+level+' için kimlik doğrulama protokolü (SHA, SHA256…) seçin.');
  if(level==='authPriv'&&!conn.snmpPrivProtocol)throw Error(conn.name+': SNMPv3 authPriv için şifreleme protokolü (AES veya DES) seçin.');
 }
}
/** SQL baglantisi: lehce mssql, sunucu, veritabani adi, istege bagli adli ornek. */
export function checkSqlConnection(conn:Connection){
 if((conn.sqlDialect??'mssql')!=='mssql')throw Error(conn.name+': yalnız Microsoft SQL Server desteklenir.');
 if(!conn.host.trim()||!conn.port)throw Error(conn.name+': SQL bağlantısı için sunucu adresi ve port (genelde 1433) gerekli.');
 const db=(conn.sqlDatabase??'').trim();
 if(!db)throw Error(conn.name+': SQL bağlantısı için veritabanı adı gerekli.');
 if(!/^[A-Za-z0-9_][A-Za-z0-9_ .$#@-]{0,127}$/.test(db))throw Error(conn.name+': veritabanı adı anlaşılamadı: "'+db+'". Harf, rakam, boşluk ve _ . - $ # @ kullanılabilir.');
 const inst=(conn.sqlInstance??'').trim();
 if(inst&&!/^[A-Za-z0-9_$]{1,16}$/.test(inst))throw Error(conn.name+': SQL örnek adı anlaşılamadı: "'+inst+'", örn. SQLEXPRESS.');
}
/** Disa yayin blogu: hedef MQTT baglantisi, joker/bos seviyesiz temel konu, var olan ve kodu tekil etiketler,
 * okunan MQTT konularina geri donmeyen (dongu) bir temel konu. */
function checkMqttPublish(c:Config){
 const p=c.mqttPublish!;
 const conn=c.connections.find(x=>x.id===p.connectionId);
 if(!conn||connectionProtocol(conn)!=='mqtt')throw Error('MQTT yayını: hedef bağlantı bir MQTT bağlantısı olmalı.');
 const base=p.baseTopic.trim();
 if(/[+#\u0000]/.test(base)||base.startsWith('/')||base.endsWith('/')||base.split('/').some(l=>!l))throw Error('MQTT yayını: temel konu joker (+ #) ve boş seviye içeremez, "/" ile başlayıp bitemez; örn. fabrika/zscada.');
 if(p.tagIds!=='all'){const ids=new Set(c.tags.map(t=>t.id));for(const id of p.tagIds)if(!ids.has(id))throw Error('MQTT yayını: seçili etiket bulunamadı ('+id+').');}
 const seen=new Map<string,string>();
 for(const t of mqttPublishTags(c)){
  const level=mqttTopicLevel(t.code);
  if(seen.has(level))throw Error('MQTT yayını: "'+level+'" konusu birden fazla etikette aynı ('+seen.get(level)+', '+t.code+'); yayınlanacak etiket kodları tekil olmalı.');
  seen.set(level,t.code);
 }
 const devConn=new Map(c.devices.map(d=>[d.id,d.connectionId]));
 for(const t of c.tags){
  if(devConn.get(t.deviceId)!==conn.id||!t.mqttTopic)continue;
  const topic=t.mqttTopic.trim();
  if(topic===base||topic.startsWith(base+'/'))throw Error('MQTT yayını: temel konu "'+base+'" okunan '+t.code+' konusunu ('+topic+') kapsıyor; yayın kendi okumasına geri döner.');
 }
}
/** Script komutunun kayit denetimi: sozdizimi, hedeflerin scriptle birebir uyusmasi ve guvenli durum. */
export function validateScriptCommand(d:Config['commands'][number],c:Config){
 const chk=checkScript(d.script||'',scriptTagRefs(c),c.devices);
 if(!chk.ok){const e=chk.errors[0];throw Error(d.name+': script satır '+e.line+', sütun '+e.col+' — '+e.message);}
 if(d.feedbackTagIds.length)throw Error(d.name+': script komutunda geri bildirim etiketi kullanılmaz; doğrulamayı script içinde read() ile yapın.');
 const w=new Set(chk.writes);
 if(d.tagIds.length!==w.size||d.tagIds.some(i=>!w.has(i)))throw Error(d.name+': yazma hedefleri scriptle uyuşmuyor; komutu yeniden kaydedin.');
 const safe=d.safeWrites||[];
 if(new Set(safe.map(s=>s.tagId)).size!==safe.length)throw Error(d.name+': aynı etikete iki güvenli durum tanımlanamaz.');
 for(const s of safe){const t=c.tags.find(x=>x.id===s.tagId);if(!t)throw Error(d.name+': güvenli durum etiketi bulunamadı.');
  try{validateValue(c,[s.tagId],s.value);}catch(e){throw Error(d.name+': güvenli durum '+t.code+' — '+(e as Error).message);}}
 // Dijital her hedefin script durdugunda nereye dusecegi tanimli olmali; sayisal hedefte istege bagli.
 for(const id of w){const t=c.tags.find(x=>x.id===id)!;if(t.dataType==='bool'&&!safe.some(s=>s.tagId===id))throw Error(d.name+': '+t.code+' için güvenli durum seçin (script durursa yazılacak değer).');}
}
/* --- Etiket adina gore otomatik bag onerisi (K08) --------------------------
 * Bir vananin bes rolunu elle eslemek yirmi vanada seksen tiklamadir. Saha
 * etiketleri neredeyse her zaman ayni govdeyi paylasir: V101_OPEN,
 * V101_CLOSE, V101_FLT. Ortak govde ve rol eki eslesirse aday onerilir.
 * Bu fonksiyon SAF'tir ve HICBIR SEYI KENDILIGINDEN BAGLAMAZ: yalniz oneri
 * dondurur, uygulamaya karar vermek arayuzun (ve kullanicinin) isidir.
 */
const roleKeywords:Record<string,string[]>={
 running:['RUN','RUNNING','CALISIYOR','CALIS','RUNNG'],
 fault:['FLT','FAULT','ARIZA','ALARM','FAIL'],
 ready:['RDY','READY','HAZIR'],
 remote:['REM','REMOTE','UZAK','UZAKTAN'],
 speed:['SPD','SPEED','HIZ','RPM'],
 speedRef:['SPDREF','SPEEDREF','HIZREF','REF','SETPOINT','SP'],
 current:['CUR','CURR','AMP','AKIM','I'],
 openLimit:['OPEN','OPN','ACIK','ZSO','LSO'],
 closeLimit:['CLOSE','CLS','KAPALI','ZSC','LSC'],
 position:['POS','POSITION','KONUM','ACIKLIK'],
 target:['SP','SETPOINT','HEDEF','CMD'],
 closed:['CLOSED','CLS','KAPALI','ON'],
 open:['OPEN','OPN','ACIK','OFF'],
 trip:['TRIP','TRP','ACTIRMA','ATTI'],
 jam:['JAM','SIKISMA','SIKIS','BLOCK'],
 reverse:['REV','REVERSE','TERS','GERI']};
/** Turkce harfleri sadelestirip buyuk harfe cevirir; T101_ARIZA ile T101_ariza ayni sayilsin. */
function foldCode(code:string){
 return code.toLocaleUpperCase('tr').replace(/[ĞÜŞİÖÇ]/g,c=>({'Ğ':'G','Ü':'U','Ş':'S','İ':'I','Ö':'O','Ç':'C'} as Record<string,string>)[c]||c);
}
/** Etiket kodunun govdesi (son ayiricidan onceki kisim) ve eki. */
function splitCode(code:string):{stem:string;suffix:string}{
 const folded=foldCode(code);
 const at=Math.max(folded.lastIndexOf('_'),folded.lastIndexOf('-'),folded.lastIndexOf('.'));
 return at>0?{stem:folded.slice(0,at),suffix:folded.slice(at+1)}:{stem:folded,suffix:''};
}
export type BindingSuggestion={role:string;tagId:string;tagCode:string;label:string};
/**
 * Nesnenin ana etiketiyle ayni govdeyi paylasan etiketlerden rol onerileri.
 * Zaten bagli roller ve zaten kullanilmis etiketler onerilmez; ayni role
 * birden fazla aday cikarsa hicbiri onerilmez (belirsiz eslesme sessizce
 * yanlis baglamaktan iyidir).
 */
export function suggestBindings(w:Widget,c:Config):BindingSuggestion[]{
 const defs=bindingDefs(w.type);
 if(!defs.length)return [];
 const anchor=stemAnchor(w,c);
 if(!anchor)return [];
 const taken=new Set([w.tagId,...(w.bindings||[]).map(b=>b.tagId).filter(Boolean)]);
 const bound=new Set((w.bindings||[]).filter(b=>b.tagId).map(b=>b.role));
 const family=c.tags.filter(t=>(!anchor.deviceId||t.deviceId===anchor.deviceId)&&squash(splitCode(t.code).stem)===anchor.stem&&!taken.has(t.id));
 const out:BindingSuggestion[]=[];
 for(const def of defs){
  if(bound.has(def.role))continue;
  const keys=roleKeywords[def.role];
  if(!keys)continue;
  const matches=family.filter(t=>{
   const kindOk=def.kind==='bool'?t.dataType==='bool':t.dataType!=='bool';
   return kindOk&&roleMatches(t,keys);
  });
  if(matches.length!==1)continue;
  out.push({role:def.role,tagId:matches[0].id,tagCode:matches[0].code,label:def.label});
 }
 return out;
}
/** Ayiricisiz govde: "P-101", "P_101" ve "P101" ayni ekipmani gosterir. */
function squash(s:string){return foldCode(s).replace(/[^A-Z0-9]/g,'');}
const allRoleKeywords=new Set(Object.values(roleKeywords).flat());
/**
 * Etiket bu role ait mi? Once kod eki (T101_ARIZA). Ek hicbir rolun anahtari
 * degilse etiketin okunur adi da taranir ("Pompa 1 ariza"). Ek baska bir rolu
 * isaret ediyorsa ada bakilmaz: kod, serbest metinden daha guvenilir kaynaktir.
 */
function roleMatches(t:Tag,keys:string[]){
 const suffix=splitCode(t.code).suffix;
 if(keys.includes(suffix))return true;
 if(suffix&&allRoleKeywords.has(suffix))return false;
 return foldCode(t.name||'').split(/[^A-Z0-9]+/).some(word=>keys.includes(word));
}
/**
 * Onerinin dayanacagi ekipman govdesi. Sirayla: ana etiket, zaten bagli bir
 * rolun etiketi, nesnenin adi. Addan govde yalniz rakam iceriyorsa cikarilir
 * ("P-101" evet, "Vana" hayir) — genel bir ad rastgele etiketle eslesmesin.
 * Ad kaynakli govdede cihaz kisiti yoktur; iki cihazda ayni govde varsa
 * belirsizlik kurali zaten oneriyi dusurur.
 */
function stemAnchor(w:Widget,c:Config):{stem:string;deviceId:string}|null{
 const main=c.tags.find(t=>t.id===w.tagId);
 if(main){const stem=squash(splitCode(main.code).stem);return stem?{stem,deviceId:main.deviceId}:null;}
 for(const b of w.bindings||[]){
  const t=b.tagId?c.tags.find(x=>x.id===b.tagId):undefined;
  if(t){const stem=squash(splitCode(t.code).stem);if(stem)return {stem,deviceId:t.deviceId};}
 }
 if(w.tagId)return null; // kayip ana etiket: tahmin yurutme
 const fromLabel=squash(w.label||'');
 return fromLabel.length>=2&&/\d/.test(fromLabel)?{stem:fromLabel,deviceId:''}:null;
}
/** Ana etiketi bos nesneye tek etiket onerisi: kodu nesne adiyla birebir ayni olan etiket. */
const mainStateKeys={bool:['RUN','RUNNING','CALISIYOR','DURUM','STATE','ON','AKTIF'],number:['PV','VALUE','DEGER','OLCUM','SEVIYE','LEVEL','TEMP','SICAKLIK','BASINC','PRESS']};
export function suggestMainTag(w:Widget,c:Config):{tagId:string;tagCode:string}|null{
 if(w.tagId||!['digital','analog'].includes(w.mode))return null;
 const label=squash(w.label||'');
 if(label.length<2||!/\d/.test(label))return null;
 const numeric=w.mode==='analog';
 const kindOk=(t:Tag)=>numeric?t.dataType!=='bool':t.dataType==='bool';
 const used=new Set((w.bindings||[]).map(b=>b.tagId).filter(Boolean));
 const exact=c.tags.filter(t=>kindOk(t)&&!used.has(t.id)&&squash(t.code)===label);
 const byState=c.tags.filter(t=>{const {stem,suffix}=splitCode(t.code);return kindOk(t)&&!used.has(t.id)&&squash(stem)===label&&(numeric?mainStateKeys.number:mainStateKeys.bool).includes(suffix);});
 const pick=exact.length===1?exact[0]:exact.length===0&&byState.length===1?byState[0]:null;
 return pick?{tagId:pick.id,tagCode:pick.code}:null;
}
/** Toplu atama: nesneye ana etiket + rol onerilerini uygular; degisiklik yoksa ayni nesneyi dondurur. */
export function applySuggestions(w:Widget,c:Config):{widget:Widget;applied:number}{
 const main=suggestMainTag(w,c);
 const withMain=main?{...w,tagId:main.tagId}:w;
 const roles=suggestBindings(withMain,c);
 if(!main&&!roles.length)return {widget:w,applied:0};
 return {widget:{...withMain,bindings:[...(withMain.bindings||[]).filter(b=>b.tagId),...roles.map(r=>({role:r.role,tagId:r.tagId,invert:false}))]},applied:(main?1:0)+roles.length};
}
export function hydrateWidget(input:any):Widget{
 const parsed=widgetSchema.safeParse(input);if(parsed.success)return parsed.data;
 const type=(symbolTypes as readonly string[]).includes(input?.type)?input.type as Widget['type']:'rectangle';
 const base=newWidget(type);
 return {...base,...input,type,parts:Array.isArray(input?.parts)?input.parts:base.parts,details:Array.isArray(input?.details)?input.details:base.details,bindings:Array.isArray(input?.bindings)?input.bindings:base.bindings};
}
export function hydrateScreen(s:Screen):Screen{return {...s,background:s.background||'',gridSize:s.gridSize||10,scenarios:s.scenarios||[],links:s.links||[],widgets:(s.widgets||[]).map(hydrateWidget)};}
export function validateScreen(input:unknown,c:Config,screenIds?:string[]):Screen {
 const s=screenSchema.parse(input);
 if(new Set(s.widgets.map(w=>w.id)).size!==s.widgets.length)throw Error('Nesne kimliği tekrarlanıyor.');
 if(new Set(s.equipment.map(e=>e.id)).size!==s.equipment.length)throw Error('Ekipman instans kimliği tekrarlanıyor.');
 if(new Set(s.links.map(l=>l.id)).size!==s.links.length)throw Error('Bağlantı kimliği tekrarlanıyor.');
 for(const l of s.links){
  if(l.fromWidgetId===l.toWidgetId)throw Error('Bağlantı aynı nesneye bağlanamaz.');
  const from=s.widgets.find(w=>w.id===l.fromWidgetId),to=s.widgets.find(w=>w.id===l.toWidgetId);
  if(!from||!to)throw Error('Bağlantı nesnesi bulunamadı.');
  if(l.fromPort<0||l.fromPort>=portCount(from.type))throw Error((from.label||from.type)+': bağlantı ucu geçersiz.');
  if(l.toPort<0||l.toPort>=portCount(to.type))throw Error((to.label||to.type)+': bağlantı ucu geçersiz.');
 }
 for(const e of s.equipment)for(const [key,value] of Object.entries(e.bindings)){
  if(!value)continue;
  if(!c.tags.some(t=>t.id===value)&&!c.commands.some(x=>x.id===value))throw Error(e.name+': '+key+' bağı bulunamadı.');}
 for(const w of s.widgets){
  if(w.rangeMode==='range'&&w.mode==='analog'&&w.parts.some(p=>p.upper!==null&&p.upper<=p.value))throw Error(w.label+': üst sınır alt sınırdan büyük olmalı.');
  if(w.mode==='analog'&&w.parts.length&&w.tagId&&c.tags.find(t=>t.id===w.tagId)?.dataType==='bool')throw Error(w.label+': analog kurallar için sayısal etiket seçin.');
  for(const t of [w.tagId,w.visibleTagId])if(t&&!c.tags.some(x=>x.id===t))throw Error(w.label+': etiket bulunamadı.');
  if(w.variant&&!variantsOf(w.type).some(v=>v.key===w.variant))throw Error((w.label||'Nesne')+': bu sembolde '+w.variant+' varyantı yok.');
  if(w.setpointTagId){
   const t=c.tags.find(x=>x.id===w.setpointTagId);
   if(!t)throw Error((w.label||'Nesne')+': setpoint etiketi bulunamadı.');
   if(t.dataType==='bool')throw Error((w.label||'Nesne')+': setpoint için sayısal etiket seçin.');
  }
  if(w.warnLow!==null&&w.warnHigh!==null&&w.warnLow>=w.warnHigh)throw Error((w.label||'Nesne')+': uyarı bandının alt sınırı üst sınırdan küçük olmalı.');
  if(w.limitLow!==null&&w.limitHigh!==null&&w.limitLow>=w.limitHigh)throw Error((w.label||'Nesne')+': alarm limitlerinin alt sınırı üst sınırdan küçük olmalı.');
  if(w.limitLow!==null&&w.warnLow!==null&&w.limitLow>w.warnLow)throw Error((w.label||'Nesne')+': alt alarm limiti alt uyarı sınırının üstünde olamaz.');
  if(w.limitHigh!==null&&w.warnHigh!==null&&w.limitHigh<w.warnHigh)throw Error((w.label||'Nesne')+': üst alarm limiti üst uyarı sınırının altında olamaz.');
  for(const p of w.parts)if(p.tagId&&!c.tags.some(x=>x.id===p.tagId))throw Error(w.label+': kademe etiketi bulunamadı.');
  if(w.parts.length&&!allowsStateRules(w.type))throw Error((w.label||'Nesne')+': bu sembol durum kuralı taşıyamaz.');
  if(w.bindings?.length){
   if(new Set(w.bindings.map(b=>b.role)).size!==w.bindings.length)throw Error((w.label||'Nesne')+': aynı bağ rolü iki kez tanımlanamaz.');
   for(const b of w.bindings){
    const def=bindingDef(w.type,b.role);
    if(!def)throw Error((w.label||'Nesne')+': '+b.role+' bağı bu sembolde tanımlı değil.');
    if(!b.tagId)continue;
    const t=c.tags.find(x=>x.id===b.tagId);
    if(!t)throw Error((w.label||'Nesne')+': '+def.label+' bağının etiketi bulunamadı.');
    if(def.kind==='bool'&&t.dataType!=='bool')throw Error((w.label||'Nesne')+': '+def.label+' için dijital etiket seçin.');
    if(def.kind==='number'&&t.dataType==='bool')throw Error((w.label||'Nesne')+': '+def.label+' için sayısal etiket seçin.');
   }
  }
  if(w.mode==='digital')for(const p of w.parts){const t=c.tags.find(x=>x.id===p.tagId);if(t&&t.dataType!=='bool')throw Error(w.label+': dijital kademe için dijital etiket seçin.');}
  if(w.visibleTagId&&c.tags.find(t=>t.id===w.visibleTagId)?.dataType!=='bool')throw Error('Görünürlük etiketi dijital olmalı.');
  if(w.visibleCondition)validateCondition(w.visibleCondition,c,w.label||'Nesne');
  if(w.equipmentId&&!s.equipment.some(e=>e.id===w.equipmentId))throw Error((w.label||'Nesne')+': ekipman instansı bulunamadı.');
  if(w.commandId&&!c.commands.some(x=>x.id===w.commandId))throw Error(w.label+': komut bulunamadı.');
  if(w.commandId&&isScript(c.commands.find(x=>x.id===w.commandId)!)&&!(isButton(w.type)&&['on','off','set'].includes(w.action)))throw Error((w.label||'Nesne')+': script komutu yalnız "Aç", "Kapat" ya da "Değer ayarla" düğmesine bağlanır.');
  if(w.type==='selector'&&w.commandId){
   const cmd=c.commands.find(x=>x.id===w.commandId);
   if(w.mode!=='analog')throw Error(w.label+': kumanda eden seçici anahtar analog bağlama kullanır.');
   if(!w.parts.length)throw Error(w.label+': seçici anahtar için en az bir konum tanımlayın.');
   if(new Set(w.parts.map(p=>p.value)).size!==w.parts.length)throw Error(w.label+': seçici konum değerleri tekrarlanamaz.');
   if(!w.tagId)throw Error(w.label+': konum geri bildirimi için sayısal etiket seçin.');
   if(c.tags.find(t=>t.id===w.tagId)?.dataType==='bool')throw Error(w.label+': konum geri bildirimi sayısal olmalı.');
   if(!cmd||cmd.tagIds.length!==1||c.tags.find(t=>t.id===cmd.tagIds[0])?.dataType==='bool'||!cmd.feedbackTagIds.includes(w.tagId))throw Error(w.label+': tek sayısal hedef ve komutun geri bildirim etiketi gerekli.');
   for(const p of w.parts)validateValue(c,cmd.tagIds,p.value);
  }
  /* G44/G45: analog surgu ve tus takimi da numeric-input ile AYNI sozlesmeyi
   * kullanir — tek sayisal hedef, komutun geri bildirim etiketi. Ayri kural
   * yazmak, ayni seyin uc yerde ayrismasi demek olurdu. */
  if(['numeric-input','slider','keypad','pid'].includes(w.type)){const cmd=c.commands.find(x=>x.id===w.commandId);if(w.tagId&&c.tags.find(t=>t.id===w.tagId)?.dataType==='bool')throw Error(w.label+': sayısal durum etiketi seçin.');if(cmd&&(cmd.tagIds.length!==1||c.tags.find(t=>t.id===cmd.tagIds[0])?.dataType==='bool'||!cmd.feedbackTagIds.includes(w.tagId)))throw Error(w.label+': tek sayısal hedef ve komutun geri bildirim etiketi gerekli.');}
  if(w.type==='slider'&&w.commandId&&!(w.max>w.min))throw Error((w.label||'Nesne')+': sürgü için üst ölçek alt ölçekten büyük olmalı.');
  if(['numeric-input','slider','keypad','pid'].includes(w.type)&&(w.writeMin!==null||w.writeMax!==null)){
   if(w.writeMin!==null&&w.writeMax!==null&&w.writeMin>=w.writeMax)throw Error((w.label||'Nesne')+': yazma aralığının alt sınırı üst sınırdan küçük olmalı.');
   const cmd=c.commands.find(x=>x.id===w.commandId),target=cmd&&c.tags.find(t=>t.id===cmd.tagIds[0]);
   if(target){
    if(w.writeMin!==null&&w.writeMin<target.min)throw Error((w.label||'Nesne')+': yazma alt sınırı etiketin sınırından ('+target.min+') küçük olamaz.');
    if(w.writeMax!==null&&w.writeMax>target.max)throw Error((w.label||'Nesne')+': yazma üst sınırı etiketin sınırından ('+target.max+') büyük olamaz.');
   }
  }
  if(isButton(w.type)&&w.commandId){const cmd=c.commands.find(x=>x.id===w.commandId)!;if(w.action==='toggle'&&(!cmd.feedbackTagIds.includes(w.tagId)||c.tags.find(t=>t.id===w.tagId)?.dataType!=='bool'))throw Error(w.label+': aç/kapa için komutun dijital geri bildirim etiketini seçin.');
   /* Cek bas / darbe once true sonra false yazar; hedef dijital degilse bu
    * dizi anlamsizdir ve sahada sayisal bir kaydi 1/0 ile ezer. */
   if(['momentary','pulse'].includes(w.action)&&cmd.tagIds.some(id=>c.tags.find(t=>t.id===id)?.dataType!=='bool'))throw Error(w.label+': çek bas / darbe için dijital yazma komutu seçin.');
   if(!isScript(cmd))validateValue(c,cmd.tagIds,['momentary','pulse'].includes(w.action)?true:w.action==='set'?w.setValue:w.action==='on');}
  for(const d of w.details){
   if(d.kind==='value'){
    if(!d.tagId)throw Error(w.label+': bilgi satırı için etiket seçin.');
    if(!c.tags.some(t=>t.id===d.tagId))throw Error(w.label+': bilgi satırı etiketi bulunamadı.');
   }else{
    const cmd=c.commands.find(x=>x.id===d.commandId);if(!cmd)throw Error(w.label+': bilgi düğmesi komutu bulunamadı.');
    if(isScript(cmd)&&d.action==='toggle')throw Error(w.label+': script komutu aç/kapa satırına bağlanmaz.');
    if(d.action==='toggle'&&(!cmd.feedbackTagIds.includes(d.tagId)||c.tags.find(t=>t.id===d.tagId)?.dataType!=='bool'))throw Error(w.label+': aç/kapa satırı için komutun dijital geri bildirim etiketini seçin.');
    if(d.tagId&&!c.tags.some(t=>t.id===d.tagId))throw Error(w.label+': bilgi satırı etiketi bulunamadı.');
    if(!isScript(cmd))validateValue(c,cmd.tagIds,d.action==='set'?d.setValue:d.action==='on');
   }
  }
  if(w.targetScreenId&&screenIds&&!screenIds.includes(w.targetScreenId))throw Error('Hedef ekran bulunamadı.');
 }
 return s;
}
export function validateValue(c:Config,ids:string[],value:unknown){for(const i of ids){const t=c.tags.find(t=>t.id===i);if(!t||t.access!=='readwrite')throw Error('Etiket yazılabilir değil.');if(t.dataType==='bool'){if(typeof value!=='boolean')throw Error('Dijital komut true/false olmalı.');}else{if(typeof value!=='number'||!Number.isFinite(value))throw Error('Değer izin verilen sınırlar dışında.');encodeValue(value,t);}}}
/** Saglanmayan izin kosullari; bos dizi 'komut serbest' demektir. Veri bilinmiyorsa kosul saglanmamis sayilir. */
export type UnmetPermissive={tagId:string;label:string;expected:boolean;reason:'quality'|'value'};
export function unmetPermissives(c:Config,commandId:string,samples:Record<string,Sample>):UnmetPermissive[]{
 const d=c.commands.find(x=>x.id===commandId);if(!d)return [];
 return (d.permissives||[]).flatMap((p):UnmetPermissive[]=>{const t=c.tags.find(t=>t.id===p.tagId),s=samples[p.tagId];
  const label=p.label||t?.name||t?.code||p.tagId;
  if(!s||s.quality!=='good'||typeof s.value!=='boolean')return [{tagId:p.tagId,label,expected:p.expected,reason:'quality'}];
  return s.value===p.expected?[]:[{tagId:p.tagId,label,expected:p.expected,reason:'value'}];});
}
export function permissiveText(u:UnmetPermissive){
 return u.reason==='quality'?`${u.label}: veri güncel değil`:`${u.label}: ${u.expected?'sağlanmalı':'kapalı olmalı'}`;
}
/* G50: YENI nesne cizimine yapisik gelir ("trim"); boylece iki cisim
 * bitisebilir ve dikey uzatma ise yarar. Eski ekranlar degismesin diye
 * semadaki varsayilan 'contain' kalir — kayitli nesneler gorunumunu
 * korur, isteyen panelden tek tikla degistirir. */
/* G51: yeni nesnenin cercevesi cizimin oranini alir. Eskiden katalog olcusu
 * dogrudan kullaniliyordu; orani cizime uymayan cercevede tutamaklar cizimden
 * uzakta kaliyor, konumlandirma gozle yapiliyordu. Alan korunur, yalniz oran duzelir. */
/* Yeni nesnede sembol basligi kapali gelir (kullanıcı kararı, 2026-09-25); yazinin kendisi icerik olan
 * turlerde (metin, buton, alarm, sekil...) acik kalir, yoksa nesne bos gorunur. */
export function newWidget(type:Widget['type'],x=80,y=80):Widget{const [width,height]=sizes[type]||[120,100];
 const base=widgetSchema.parse({id:crypto.randomUUID(),type,label:labels[type],x,y,width,height,frameFit:'trim',parts:structuredClone(defaultParts[type]||[]),labelVisible:labelIsContent.has(type),...(type==='star'?{sides:5}:{}),...(type==='polygon'||type==='star'?{textAlign:'center'}:{})});
 return {...base,...frameForDrawing(base)};}
/* --- ISA-101: ekran çiziminden HMI yönetimine geçiş (B41) -----------------
 * Renk, opaklık ve hareket bugün serbestçe ayarlanır; ekran modeli bir
 * hiyerarşi ya da tasarım politikası taşımıyor. Ayni rengin farkli anlamlara
 * gelmesi operator yukunu artirir. Bu blok SAF (yan etkisiz) bir tesis HMI
 * stil rehberi ve yayin lint'i tanimlar: hicbir seyi zorlamaz, yalniz bulgu
 * dondurur — kritik ihlali gerekceli onaya baglamak arayuzun (Studio.tsx)
 * sorumlulugundadir.
 */
export const alarmPaletteSchema=z.object({critical:hexColor.default('#c0392b'),warning:hexColor.default('#d8a52e'),info:hexColor.default('#2f6fb0')});
export type AlarmPalette=z.infer<typeof alarmPaletteSchema>;
export const hmiStyleGuideSchema=z.object({
 alarmColors:alarmPaletteSchema.default({critical:'#c0392b',warning:'#d8a52e',info:'#2f6fb0'}),
 minFontSize:z.number().int().min(6).max(48).default(12),
 minContrast:z.number().min(1).max(21).default(3),
 // Sadece bu nesne tiplerinde surekli animasyona izin var (alarm/durum gostergeleri).
 animationAllowedFor:z.array(z.enum(symbolTypes as unknown as [SymbolType,...SymbolType[]])).default(['alarm','beacon','tower-light','emergency-stop']),
 // Kapatilirsa "renk tek basina durum anlatmasin" kurali (bkz. lintScreen) atlanir.
 requireNonColorIndicator:z.boolean().default(true)});
export type HmiStyleGuide=z.infer<typeof hmiStyleGuideSchema>;
export const defaultStyleGuide:HmiStyleGuide=hmiStyleGuideSchema.parse({});
const colorOnlyIndicatorTypes=new Set<Widget['type']>(['indicator','lamp-square','bulb','beacon','led-bar']);
const statusIndicatorTypes=new Set<Widget['type']>([...partTypes,'alarm','emergency-stop','bulb','beacon','led-bar']);
const numericGaugeTypes=new Set<Widget['type']>(['gauge','level-bar','thermometer','flow-meter','value','numeric-input']);
function hexToRgb(hex:string){const n=parseInt(hex.slice(1),16);return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
/** WCAG bagil parlaklik; kontrast oraninin girdisi. */
function relLuminance(hex:string){const {r,g,b}=hexToRgb(hex);const c=[r,g,b].map(v=>{const s=v/255;return s<=.03928?s/12.92:Math.pow((s+.055)/1.055,2.4);});return .2126*c[0]+.7152*c[1]+.0722*c[2];}
/** Iki hex rengin WCAG kontrast orani (1..21); yuksek deger daha okunabilir. */
function contrastRatio(a:string,b:string){const la=relLuminance(a),lb=relLuminance(b),lighter=Math.max(la,lb),darker=Math.min(la,lb);return (lighter+0.05)/(darker+0.05);}
export type LintSeverity='critical'|'warning'|'info';
export type LintFinding={severity:LintSeverity;code:string;message:string;widgetId?:string};
/** Ekrani tesis HMI stil rehberine gore denetler; SAF fonksiyondur, hicbir seyi degistirmez. isHomeScreen ekranin proje ana ekrani olup olmadigini belirtir (bkz. Studio.tsx). */
export function lintScreen(screen:Screen,config:Config,guide:HmiStyleGuide=defaultStyleGuide,isHomeScreen=false):LintFinding[]{
 const findings:LintFinding[]=[];
 const alarmHexes=new Set(Object.values(guide.alarmColors).map(c=>c.toLowerCase()));
 const bg=screen.background;
 let hasNavigation=false;
 // Animasyon varsayılan açık geliyor: nesne başına bulgu, yeni eklenen her kütüphane nesnesinde
 // gürültü üretiyordu (27 satır). Tek özet bulgu; tıklayınca ilk nesneye gider.
 const animatedOutside:Widget[]=[];
 for(const w of screen.widgets){
  const tag=w.label||labels[w.type];
  if(w.type==='navigation')hasNavigation=true;
  if(alarmHexes.has((w.color||'').toLowerCase())&&!statusIndicatorTypes.has(w.type))
   findings.push({severity:'warning',code:'alarm-color-reuse',message:tag+': alarm paletindeki bir renk, durum/alarm dışı bir nesnede dolgu rengi olarak kullanılıyor.',widgetId:w.id});
  if(guide.requireNonColorIndicator){
   if(colorOnlyIndicatorTypes.has(w.type)&&!w.labelVisible)
    findings.push({severity:'warning',code:'color-only-status',message:tag+': durum yalnız renkle gösteriliyor; etiket kapalı.',widgetId:w.id});
   if(supportsParts(w.type)&&w.parts.some(p=>p.tagId&&!p.label.trim()))
    findings.push({severity:'warning',code:'color-only-status',message:tag+': bazı kademelerin etiketi boş; durum yalnız renkle ayrışıyor.',widgetId:w.id});
   if(isButton(w.type)&&w.action==='toggle'&&!w.labelVisible&&(!w.onText.trim()||!w.offText.trim()))
    findings.push({severity:'warning',code:'color-only-status',message:tag+': aç/kapa durumu metinle belirtilmiyor.',widgetId:w.id});
  }
  const command=w.commandId?config.commands.find(c=>c.id===w.commandId):undefined;
  const criticalEquipment=command?.risk==='critical'&&isCommandWidget(w.type);
  if(w.fontSize>0&&w.fontSize<guide.minFontSize)
   findings.push({severity:criticalEquipment?'critical':'warning',code:'low-font-size',message:tag+': yazı boyutu ('+w.fontSize+') asgari '+guide.minFontSize+' altında.',widgetId:w.id});
  if(w.opacity<.5)
   findings.push({severity:criticalEquipment?'critical':'warning',code:'low-opacity',message:tag+': opaklık ('+w.opacity+') okunabilirliği düşürüyor.',widgetId:w.id});
  if(bg&&(w.type==='text'||w.type==='value')&&contrastRatio(w.color,bg)<guide.minContrast)
   findings.push({severity:criticalEquipment?'critical':'warning',code:'low-contrast',message:tag+': metin/zemin kontrastı asgari '+guide.minContrast+' altında.',widgetId:w.id});
  if(w.animated&&!guide.animationAllowedFor.includes(w.type))animatedOutside.push(w);
  if(numericGaugeTypes.has(w.type)&&w.min===w.max)
   findings.push({severity:'info',code:'undefined-normal-range',message:tag+': normal çalışma aralığı tanımlı değil.',widgetId:w.id});
  if(isCommandWidget(w.type)&&w.commandId&&!w.label.trim())
   findings.push({severity:'critical',code:'unlabeled-command',message:'Komut butonunun etiketi boş; operatör hangi ekipmanı kumanda ettiğini göremez.',widgetId:w.id});
 }
 if(animatedOutside.length){
  const names=animatedOutside.slice(0,3).map(w=>w.label||labels[w.type]).join(', ')+(animatedOutside.length>3?' …':'');
  findings.push({severity:'info',code:'unnecessary-animation',message:(animatedOutside.length===1?names+': sürekli animasyon':animatedOutside.length+' nesnede sürekli animasyon açık ('+names+')')+' — durum/alarm dışı nesnede animasyon dikkat dağıtır; gerekmiyorsa Görünüm sekmesinden kapatın.',widgetId:animatedOutside[0].id});
 }
 if(!hasNavigation&&!isHomeScreen)
  findings.push({severity:'info',code:'no-navigation',message:'Bu ekranda geçiş (navigasyon) nesnesi yok; operatör bu ekrandan çıkamaz.'});
 return findings;
}
/** Bulgu listesini onem sirasina gore sayar; yayin onayi kritik sayisina bakar. */
export function lintSummary(findings:LintFinding[]){
 return {critical:findings.filter(f=>f.severity==='critical').length,warning:findings.filter(f=>f.severity==='warning').length,info:findings.filter(f=>f.severity==='info').length,total:findings.length};
}
