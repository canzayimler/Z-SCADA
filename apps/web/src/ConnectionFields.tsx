/* Baglanti penceresinin protokole ozgu alanlari (Modbus TCP/RTU, S7, ADS, OPC UA, MQTT, SNMP, HTTP/REST, SQL Server).
   Management.tsx'ten ayrildi: kayit mantigi orada kalir, bu bilesen yalniz taslak nesneyi duzenler. */
import { useEffect, useState } from 'react';
import { api } from './api';
import { InfoTip } from './InfoTip';
import { Field } from './Studio';
import { SerialPortInput } from './SerialPortInput';

/** savedId: kayitli baglantinin kimligi (yeni baglantida null); admin: giris bilgisini yalniz yonetici yazar. */
type Props = { data: any; patch: (k: string, v: unknown) => void; setData: (fn: (d: any) => any) => void; savedId?: string | null; admin?: boolean; tags?: { id: string; code: string }[] };
type SecretKey = 'username' | 'password' | 'community' | 'authKey' | 'privKey' | 'token';
type SecretSummary = { hasUsername: boolean; hasPassword: boolean; hasCommunity?: boolean; hasAuthKey?: boolean; hasPrivKey?: boolean; hasToken?: boolean; username?: string };
const HAS: Record<SecretKey, keyof SecretSummary> = { username: 'hasUsername', password: 'hasPassword', community: 'hasCommunity', authKey: 'hasAuthKey', privKey: 'hasPrivKey', token: 'hasToken' };
type SecretField = { key: SecretKey; label: string; placeholder?: string };

/* Bağlantı giriş bilgisi: yapılandırmada değil, sunucudaki connection-secrets.json'da durur
   (/api/connections/:id/secret). Gizli alanlar (parola, community, anahtar, token) hiçbir zaman geri okunmaz ve
   alana doldurulmaz; yalnız "kayıtlı" bilgisi gelir. Kullanıcı adı gösterilir. Kaydetme/silme taze parola
   doğrulaması ister: api() 403/REAUTH_REQUIRED alınca parola penceresini açıp isteği bir kez tekrarlar
   (main.tsx setReauthHandler). Boş gizli alan "değiştirme" demektir; boş kullanıcı adı onu siler. */
function SecretFields({ savedId, admin, fields, adminOnly, unsaved, statusOf }: {
 savedId: string | null; admin: boolean; fields: SecretField[]; adminOnly: string; unsaved: string; statusOf?: (s: SecretSummary) => string;
}) {
 const [summary, setSummary] = useState<SecretSummary | null>(null);
 const [values, setValues] = useState<Partial<Record<SecretKey, string>>>({});
 const [busy, setBusy] = useState(false);
 const [msg, setMsg] = useState<{ cls: 'ok' | 'err' | 'info'; text: string } | null>(null);
 const hasUser = fields.some((f) => f.key === 'username');
 useEffect(() => {
  if (!savedId || !admin) return;
  let off = false;
  api<SecretSummary>('/connections/' + encodeURIComponent(savedId) + '/secret')
   .then((s) => { if (off) return; setSummary(s); setValues({ username: s.username || '' }); })
   .catch((e) => { if (!off) setMsg({ cls: 'err', text: (e as Error).message }); });
  return () => { off = true; };
 }, [savedId, admin]);
 if (!admin) return <small className="insp-msg info">{adminOnly}</small>;
 if (!savedId) return <small className="insp-msg info">{unsaved}</small>;
 const url = '/connections/' + encodeURIComponent(savedId) + '/secret';
 const done = (s: SecretSummary, text: string) => { setSummary(s); setValues({ username: s.username || '' }); setMsg({ cls: 'ok', text }); };
 const save = async () => {
  setBusy(true); setMsg(null);
  try {
   const body: Record<string, string> = {};
   for (const f of fields) {
    const v = values[f.key] ?? '';
    if (f.key === 'username') body.username = v.trim();
    else if (v) body[f.key] = v;
   }
   done(await api<SecretSummary>(url, 'PUT', body), 'Giriş bilgisi kaydedildi; sahaya uygulayınca etkinleşir.');
  } catch (e) { setMsg({ cls: 'err', text: (e as Error).message }); } finally { setBusy(false); }
 };
 const clear = async () => {
  setBusy(true); setMsg(null);
  try { await api(url, 'DELETE'); done({ hasUsername: false, hasPassword: false }, 'Giriş bilgisi silindi; sahaya uygulayınca etkinleşir.'); }
  catch (e) { setMsg({ cls: 'err', text: (e as Error).message }); } finally { setBusy(false); }
 };
 const stored = !!summary && (Object.values(HAS) as (keyof SecretSummary)[]).some((k) => summary[k] === true);
 const dirty = (hasUser && (values.username ?? '').trim() !== (summary?.username || '')) || fields.some((f) => f.key !== 'username' && !!values[f.key]);
 const status = summary && (statusOf ? statusOf(summary) : (() => {
  const saved = fields.filter((f) => f.key !== 'username' && summary[HAS[f.key]]).map((f) => f.label);
  return saved.length ? saved.join(', ') + ' kayıtlı.' : 'Kayıtlı gizli bilgi yok.';
 })());
 return (
  <>
   <div className="field-grid">
    {fields.map((f) => f.key === 'username'
     ? <Field key={f.key} label={f.label}>
        <input autoComplete="off" spellCheck={false} placeholder={f.placeholder} value={values.username ?? ''} maxLength={200} onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))} />
       </Field>
     : <Field key={f.key} label={f.label}>
        <input type="password" autoComplete="new-password" placeholder={summary?.[HAS[f.key]] ? 'Kayıtlı · değiştirmek için yazın' : f.placeholder || f.label} value={values[f.key] ?? ''} maxLength={f.key === 'token' ? 4000 : 500} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
       </Field>)}
   </div>
   <div className="conn-login-actions">
    {stored && <button type="button" className="btn small" disabled={busy} onClick={() => void clear()}>Giriş bilgisini sil</button>}
    <button type="button" className="btn small" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Kaydediliyor…' : 'Giriş bilgisini kaydet'}</button>
   </div>
   {msg ? <small className={'insp-msg ' + msg.cls}>{msg.text}</small> : status && <small className="insp-msg info">{status}</small>}
  </>
 );
}
/* OPC UA / MQTT kullanıcı adı + parola (boş kullanıcı adı: anonim). */
function OpcUaLogin({ savedId, admin }: { savedId: string | null; admin: boolean }) {
 return <SecretFields savedId={savedId} admin={admin} fields={[{ key: 'username', label: 'Kullanıcı adı', placeholder: 'Boş: anonim' }, { key: 'password', label: 'Parola' }]}
  adminOnly="Giriş bilgisini yalnız yönetici girebilir. Kullanıcı adı yoksa sunucuya anonim bağlanılır."
  unsaved="Kullanıcı adı ve parola bağlantı kaydedildikten sonra girilir. Boş bırakılırsa anonim bağlanılır."
  statusOf={(s) => (s.hasUsername ? (s.hasPassword ? 'Parola kayıtlı.' : 'Parola kayıtlı değil.') : 'Anonim giriş.')} />;
}
const secretTexts = { adminOnly: 'Giriş bilgisini yalnız yönetici girebilir.', unsaved: 'Giriş bilgisi bağlantı kaydedildikten sonra girilir; yapılandırmaya ve proje dosyasına yazılmaz.' };
/* SNMP: v1/v2c community; v3 kullanıcı + güvenlik seviyesine göre kimlik doğrulama / şifreleme anahtarı. */
function snmpSecretFields(d: any): SecretField[] {
 if ((d.snmpVersion ?? '2c') !== '3') return [{ key: 'community', label: 'Community', placeholder: 'örn. okuma community' }];
 const level = d.snmpSecurityLevel ?? 'authPriv';
 return [{ key: 'username', label: 'Kullanıcı (v3)' }, ...(level !== 'noAuthNoPriv' ? [{ key: 'authKey' as const, label: 'Kimlik doğrulama anahtarı' }] : []), ...(level === 'authPriv' ? [{ key: 'privKey' as const, label: 'Şifreleme anahtarı' }] : [])];
}

/* MQTT dışa yayın (rapor): yapılandırmada tek blok (config.mqttPublish). Taslakta `_publish` olarak
   tutulur; Management kayıtta bloğa çevirir. Kontrol değildir: broker'a yalnız okunan değerler gider. */
export type PublishDraft = { enabled: boolean; baseTopic: string; intervalMs: number; onChange: boolean; retain: boolean; all: boolean; tagIds: string[] };
export const emptyPublish = (): PublishDraft => ({ enabled: false, baseTopic: 'zscada', intervalMs: 10000, onChange: false, retain: false, all: true, tagIds: [] });
function MqttPublishFields({ data, setData, tags = [] }: { data: any; setData: Props['setData']; tags?: { id: string; code: string }[] }) {
 const p: PublishDraft = data._publish || emptyPublish();
 const set = (k: keyof PublishDraft, v: unknown) => setData((d) => ({ ...d, _publish: { ...(d._publish || emptyPublish()), [k]: v } }));
 return (
  <>
   <label className="check">
    <input type="checkbox" checked={p.enabled} onChange={(e) => set('enabled', e.target.checked)} />
    SCADA değerlerini bu brokere yayınla (rapor)
   </label>
   {p.enabled && (
    <>
     <div className="field-grid">
      <Field label="Temel konu">
       <input className="mono" spellCheck={false} maxLength={200} placeholder="fabrika/zscada" value={p.baseTopic} onChange={(e) => set('baseTopic', e.target.value)} />
      </Field>
      <Field label="Yayın aralığı (sn)">
       <input type="number" min={1} max={3600} value={Math.round(p.intervalMs / 1000)} onChange={(e) => set('intervalMs', Math.max(1, Math.min(3600, Number(e.target.value) || 10)) * 1000)} />
      </Field>
     </div>
     <label className="check"><input type="checkbox" checked={p.onChange} onChange={(e) => set('onChange', e.target.checked)} />Değişince hemen yayınla</label>
     <label className="check"><input type="checkbox" checked={p.retain} onChange={(e) => set('retain', e.target.checked)} />Son değeri brokerde tut (retain)</label>
     <label className="check"><input type="checkbox" checked={p.all} onChange={(e) => set('all', e.target.checked)} />Tüm etiketler</label>
     {!p.all && (
      <div className="mqtt-pub-tags" role="group" aria-label="Yayınlanacak etiketler">
       {tags.length ? tags.map((t) => (
        <label key={t.id} className="check compact">
         <input type="checkbox" checked={p.tagIds.includes(t.id)} onChange={(e) => set('tagIds', e.target.checked ? [...p.tagIds, t.id] : p.tagIds.filter((x) => x !== t.id))} />
         <span className="mono">{t.code}</span>
        </label>
       )) : <small className="muted">Etiket yok.</small>}
      </div>
     )}
     <small className="insp-msg info">
      Her etiket {(p.baseTopic.trim() || '…') + '/<etiket kodu>'} konusuna {'{value, quality, ts}'} JSON olarak gider. Yayın tek bağlantıda olur;
      burada açmak başka bağlantıdaki yayını kaldırır. Yalnız rapor içindir, brokerden SCADA'ya yazma yoktur.
     </small>
    </>
   )}
  </>
 );
}

export function ConnectionFields({ data, patch, setData, savedId = null, admin = false, tags }: Props) {
 return (
  <>
   <Field label="Protokol">
    <select
     value={data.protocol || 'modbus-tcp'}
     onChange={(e) => {
      const protocol = e.target.value;
      setData((d) => ({
        ...d,
        protocol,
        // Port varsayilani protokolle gelir; kullanici elle degistirdiyse dokunulmaz.
        port: [502, 102, 48898, 1883, 8883, 161, 1433, 47808, 44818].includes(d.port)
         ? ({ 'modbus-tcp': 502, s7: 102, ads: 48898, mqtt: d.mqttTls ? 8883 : 1883, snmp: 161, sql: 1433, bacnet: 47808, enip: 44818 } as Record<string, number>)[protocol] ?? d.port
         : d.port,
        // MQTT: TLS kapalı, istemci kimliği boş (zscada-<bilgisayar>-<bağlantı>), keepalive 60 sn, temiz oturum.
        mqttTls: protocol === 'mqtt' ? (d.mqttTls ?? false) : undefined,
        clientId: protocol === 'mqtt' ? (d.clientId ?? '') : undefined,
        mqttKeepalive: protocol === 'mqtt' ? (d.mqttKeepalive ?? 60) : undefined,
        mqttCleanSession: protocol === 'mqtt' ? (d.mqttCleanSession ?? true) : undefined,
        _publish: protocol === 'mqtt' ? d._publish : undefined,
        // SNMP: v2c varsayılan; community ve v3 anahtarları ayrı (sunucuda) saklanır.
        snmpVersion: protocol === 'snmp' ? (d.snmpVersion ?? '2c') : undefined,
        snmpSecurityLevel: protocol === 'snmp' ? d.snmpSecurityLevel : undefined,
        snmpAuthProtocol: protocol === 'snmp' ? d.snmpAuthProtocol : undefined,
        snmpPrivProtocol: protocol === 'snmp' ? d.snmpPrivProtocol : undefined,
        // HTTP: temel adres host'tan önerilir; kimlik doğrulama yok.
        httpBaseUrl: protocol === 'http' ? (d.httpBaseUrl || 'http://' + (d.host && d.host !== 'localhost' ? d.host : '192.0.2.10') + '/api') : undefined,
        httpAuth: protocol === 'http' ? (d.httpAuth ?? 'none') : undefined,
        // SQL Server: şifreleme açık, sertifikaya koşulsuz güven kapalı.
        sqlDialect: protocol === 'sql' ? 'mssql' : undefined,
        sqlDatabase: protocol === 'sql' ? (d.sqlDatabase ?? '') : undefined,
        sqlInstance: protocol === 'sql' ? (d.sqlInstance ?? '') : undefined,
        sqlEncrypt: protocol === 'sql' ? (d.sqlEncrypt ?? true) : undefined,
        sqlTrustServerCertificate: protocol === 'sql' ? (d.sqlTrustServerCertificate ?? false) : undefined,
        // BACnet/IP: cihaz numarası elle girilir (Who-Is ile aranmaz); istemci bu PC'de 47809'dan konuşur.
        bacnetDeviceInstance: protocol === 'bacnet' ? d.bacnetDeviceInstance : undefined,
        bacnetLocalPort: protocol === 'bacnet' ? (d.bacnetLocalPort ?? 47809) : undefined,
        bacnetLocalAddress: protocol === 'bacnet' ? (d.bacnetLocalAddress ?? '') : undefined,
        // EtherNet/IP: port 44818 sabit, CPU yuvası genelde 0; çevrim boşsa cihaz taramasından.
        enipCycleMs: protocol === 'enip' ? d.enipCycleMs : undefined,
        rack: protocol === 's7' ? (d.rack ?? 0) : undefined,
        slot: protocol === 's7' ? (d.protocol === 'enip' ? 1 : (d.slot ?? 1)) : protocol === 'enip' ? (d.protocol === 's7' ? 0 : (d.slot ?? 0)) : undefined,
        amsNetId: protocol === 'ads' ? (d.amsNetId ?? (d.host && /^\d+\.\d+\.\d+\.\d+$/.test(d.host) ? d.host + '.1.1' : '')) : undefined,
        adsPort: protocol === 'ads' ? (d.adsPort ?? 851) : undefined,
        localAmsNetId: protocol === 'ads' ? (d.localAmsNetId ?? '') : undefined,
        // RTU: varsayilan seri port, 9600 8N1 RTU. Seri olmayan protokolde bu alanlar tasinmaz.
        rtuTransport: protocol === 'modbus-rtu' ? (d.rtuTransport ?? 'serial') : undefined,
        serialPort: protocol === 'modbus-rtu' ? (d.serialPort ?? '') : undefined,
        baudRate: protocol === 'modbus-rtu' ? (d.baudRate ?? 9600) : undefined,
        parity: protocol === 'modbus-rtu' ? (d.parity ?? 'none') : undefined,
        dataBits: protocol === 'modbus-rtu' ? (d.dataBits ?? 8) : undefined,
        stopBits: protocol === 'modbus-rtu' ? (d.stopBits ?? 1) : undefined,
        serialMode: protocol === 'modbus-rtu' ? (d.serialMode ?? 'rtu') : undefined,
        // OPC UA: adres endpoint'tir; host varsa ondan onerilir. Guvenlik varsayilani None; giris bilgisi ayri saklanir.
        endpoint: protocol === 'opc-ua' ? (d.endpoint || 'opc.tcp://' + (d.host && d.host !== 'localhost' ? d.host : '192.0.2.10') + ':4840') : undefined,
        securityMode: protocol === 'opc-ua' ? (d.securityMode ?? 'none') : undefined,
        securityPolicy: protocol === 'opc-ua' ? (d.securityPolicy ?? 'Basic256Sha256') : undefined,
      }));
     }}
    >
     <option value="modbus-tcp">Modbus TCP</option>
     <option value="modbus-rtu">Modbus RTU (RS-485)</option>
     <option value="s7">Siemens S7</option>
     <option value="ads">Beckhoff ADS</option>
     <option value="opc-ua">OPC UA</option>
     <option value="mqtt">MQTT</option>
     <option value="snmp">SNMP</option>
     <option value="http">HTTP/REST</option>
     <option value="sql">SQL Server</option>
     <option value="bacnet">BACnet/IP</option>
     <option value="enip">EtherNet/IP (CIP)</option>
    </select>
   </Field>
   {data.protocol === 'modbus-rtu' && (
    <Field label="Bağlantı yolu">
     <div className="insp-seg" role="radiogroup" aria-label="Bağlantı yolu">
      {([['serial', 'Bu PC\'nin seri portu'], ['tcp', 'Ağ geçidi (RTU over TCP)']] as const).map(([k, l]) => (
       <button type="button" key={k} role="radio" aria-checked={(data.rtuTransport ?? 'serial') === k} className={(data.rtuTransport ?? 'serial') === k ? 'active' : ''} onClick={() => patch('rtuTransport', k)}>{l}</button>
      ))}
     </div>
    </Field>
   )}
   {data.protocol === 'modbus-rtu' && (data.rtuTransport ?? 'serial') === 'serial' ? (
    <>
     <Field label="Seri port">
      <SerialPortInput value={data.serialPort ?? ''} onChange={(v) => patch('serialPort', v)} />
     </Field>
     <div className="field-grid">
      <Field label="Hız (baud)">
       <select value={data.baudRate ?? 9600} onChange={(e) => patch('baudRate', Number(e.target.value))}>
        {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => <option key={b} value={b}>{b}</option>)}
       </select>
      </Field>
      <Field label="Çerçeve">
       <select
        value={data.serialMode ?? 'rtu'}
        onChange={(e) => {
         const mode = e.target.value;
         // ASCII 7 veri biti ister; Delta DVP varsayilani 7E1. RTU'ya donuste 8N1'e alinir.
         setData((d) => ({ ...d, serialMode: mode, ...(mode === 'ascii' ? { dataBits: 7, parity: 'even', stopBits: 1 } : { dataBits: 8, parity: 'none', stopBits: 1 }) }));
        }}
       >
        <option value="rtu">RTU</option>
        <option value="ascii">ASCII (Delta DVP)</option>
       </select>
      </Field>
     </div>
     <div className="field-grid three">
      <Field label="Veri biti">
       <select value={data.dataBits ?? 8} disabled={data.serialMode === 'ascii'} onChange={(e) => patch('dataBits', Number(e.target.value))}>
        <option value={8}>8</option>
        <option value={7}>7</option>
       </select>
      </Field>
      <Field label="Parite">
       <select value={data.parity ?? 'none'} onChange={(e) => patch('parity', e.target.value)}>
        <option value="none">Yok (N)</option>
        <option value="even">Çift (E)</option>
        <option value="odd">Tek (O)</option>
       </select>
      </Field>
      <Field label="Stop biti">
       <select value={data.stopBits ?? 1} onChange={(e) => patch('stopBits', Number(e.target.value))}>
        <option value={1}>1</option>
        <option value={2}>2</option>
       </select>
      </Field>
     </div>
    </>
   ) : data.protocol === 'opc-ua' ? (
    <>
     <Field label="Sunucu adresi (endpoint)">
      <input className="mono" required placeholder="opc.tcp://192.0.2.10:4840" value={data.endpoint ?? ''} onChange={(e) => patch('endpoint', e.target.value.trim())} />
     </Field>
     <div className="field-grid">
      <Field label="Güvenlik modu">
       <select value={data.securityMode ?? 'none'} onChange={(e) => patch('securityMode', e.target.value)}>
        <option value="none">Yok (None)</option>
        <option value="sign">İmzalı (Sign)</option>
        <option value="sign-encrypt">İmzalı + şifreli (SignAndEncrypt)</option>
       </select>
      </Field>
      {(data.securityMode ?? 'none') !== 'none' && (
       <Field label="Güvenlik politikası">
        <select value={data.securityPolicy ?? 'Basic256Sha256'} onChange={(e) => patch('securityPolicy', e.target.value)}>
         {['Basic256Sha256', 'Aes128_Sha256_RsaOaep', 'Aes256_Sha256_RsaPss', 'Basic256', 'Basic128Rsa15'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
       </Field>
      )}
     </div>
     <OpcUaLogin savedId={savedId} admin={admin} />
     <div className="title-row small muted">
      Sunucu tarafı gereksinimleri
      <InfoTip>
       Kullanıcı adı girilmezse anonim bağlanılır; bu durumda sunucuda anonim erişim açık olmalı.
       Kullanıcı adı ve parola yapılandırmaya ve proje dosyasına yazılmaz, yalnız bu sunucuda saklanır.
       İmzalı modlarda Z SCADA ilk bağlantıda kendi sertifikasını üretir; sunucu bu sertifikayı güvenilir
       listesine almalıdır (TIA Portal / TwinCAT OPC UA ayarlarında "reddedilen sertifikalar"dan onaylanır).
       Etiketler node kimliğiyle okunur, örn. ns=3;s="DB_Hat"."Sicaklik" veya ns=2;i=1005. Değerler her
       cihazın tarama süresinde okunur. Oku / yaz etiketlere komutla yazılır; sunucudaki değişkenin tipi
       etiketin tipiyle aynı olmalı (float32 → Float, int16 → Int16, bool → Boolean).
      </InfoTip>
     </div>
    </>
   ) : data.protocol === 'http' ? (
    <Field label="Temel adres (URL)">
     <input className="mono" required placeholder="http://192.0.2.10/api" autoComplete="off" spellCheck={false} maxLength={300} value={data.httpBaseUrl ?? ''} onChange={(e) => patch('httpBaseUrl', e.target.value.trim())} />
    </Field>
   ) : (
    <Field label={data.protocol === 'modbus-rtu' ? 'Ağ geçidi IP adresi' : data.protocol === 'mqtt' ? 'Broker adresi (IP / host)' : data.protocol === 'snmp' ? 'Cihaz adresi (IP / host)' : data.protocol === 'sql' ? 'SQL Server adresi (IP / host)' : data.protocol === 'bacnet' ? 'Cihaz IPv4 adresi' : data.protocol === 'enip' ? 'Denetleyici IP adresi' : 'IP adresi / host'}>
     <input required className={data.protocol === 'bacnet' ? 'mono' : undefined} placeholder={data.protocol === 'bacnet' ? '198.51.100.40' : undefined} value={data.host} onChange={(e) => patch('host', e.target.value)} />
    </Field>
   )}
   <div className="field-grid">
    {!(data.protocol === 'modbus-rtu' && (data.rtuTransport ?? 'serial') === 'serial') && data.protocol !== 'opc-ua' && data.protocol !== 'http' && (
     <Field label="Port">
      <input
       type="number"
       value={data.port}
       disabled={(data.protocol === 'sql' && !!String(data.sqlInstance ?? '').trim()) || (data.protocol === 'enip' && data.port === 44818)}
       title={data.protocol === 'sql' && String(data.sqlInstance ?? '').trim() ? 'Adlı örnekte port SQL Browser\'dan (UDP 1434) öğrenilir' : data.protocol === 'enip' ? 'EtherNet/IP sürücüsü yalnız TCP 44818 kullanır' : undefined}
       onChange={(e) => patch('port', Number(e.target.value))}
      />
     </Field>
    )}
    <Field label={data.protocol === 'bacnet' ? 'APDU zaman aşımı (ms)' : 'Timeout (ms)'}>
     <input
      type="number"
      value={data.timeout}
      onChange={(e) => patch('timeout', Number(e.target.value))}
     />
    </Field>
   </div>
   {data.protocol === 's7' && (
    <>
     <div className="field-grid">
      <Field label="Rack">
       <input
        type="number"
        min="0"
        max="7"
        value={data.rack ?? 0}
        onChange={(e) => patch('rack', Number(e.target.value))}
       />
      </Field>
      <Field label="Slot">
       <input
        type="number"
        min="0"
        max="31"
        value={data.slot ?? 1}
        onChange={(e) => patch('slot', Number(e.target.value))}
       />
      </Field>
     </div>
     <div className="title-row small muted">
      PLC tarafı gereksinimleri
      <InfoTip>
       S7-1200/1500: rack 0, slot 1; S7-300: rack 0, slot 2. TIA Portal'da CPU
       özelliklerinde "Permit access with PUT/GET" açık olmalı ve okunan/yazılan DB'lerde
       "Optimized block access" kapalı olmalı; aksi halde PLC okumayı ve yazmayı reddeder.
       Yazma M, Q ve DB adreslerine yapılır; giriş alanı (I/E) yazılamaz.
      </InfoTip>
     </div>
    </>
   )}
   {data.protocol === 'modbus-rtu' && (
    <div className="title-row small muted">
     Hat ayarı
     <InfoTip>
      Hattaki bütün cihazlar aynı hız, parite ve çerçeveyi kullanmalı; her cihazın Slave ID'si farklı
      olmalı. RS-485 tek hattır: cihazlar sırayla okunur, çok cihaz ve kısa tarama süresi hattı
      doldurur. Delta DVP'nin seri portu fabrika ayarında ASCII 9600 7E1, slave 1'dir. Ağ geçidi
      yolunda (ETOR vb.) geçidin "Modbus RTU over TCP / transparan" modunda olması gerekir; geçit
      Modbus TCP'ye kendisi çeviriyorsa bu protokol yerine Modbus TCP seçin. Aynı hatta başka bir
      master (HMI, enerji yazılımı) varsa çakışır.
     </InfoTip>
    </div>
   )}
   {data.protocol === 'ads' && (
    <>
     <div className="field-grid">
      <Field label="PLC AMS Net ID">
       <input className="mono" placeholder="192.0.2.120.1.1" value={data.amsNetId ?? ''} onChange={(e) => patch('amsNetId', e.target.value)} />
      </Field>
      <Field label="ADS portu">
       <input type="number" min="1" max="65535" value={data.adsPort ?? 851} onChange={(e) => patch('adsPort', Number(e.target.value))} />
      </Field>
     </div>
     <Field label="Bu PC'nin AMS Net ID'si (route)">
      <input className="mono" placeholder="Boş: yerel TwinCAT router" value={data.localAmsNetId ?? ''} onChange={(e) => patch('localAmsNetId', e.target.value)} />
     </Field>
     <div className="title-row small muted">
      PLC tarafı gereksinimleri
      <InfoTip>
       AMS Net ID TwinCAT'te System → Routes'ta görünür (genelde IP + .1.1). ADS portu: TwinCAT 3
       ilk PLC 851, TwinCAT 2 801. Bu PC'de TwinCAT yoksa PLC'nin StaticRoutes.xml dosyasına bu
       PC'nin IP'si ve bir AMS Net ID'si route olarak eklenmeli, aynı kimlik buraya yazılmalı; PLC
       güvenlik duvarında TCP 48898 açık olmalı. Etiketler sembol adıyla okunur ve yazılır
       (GVL.fSicaklik); yazılan değişken PLC'de yazmaya açık olmalı (VAR CONSTANT değil).
      </InfoTip>
     </div>
    </>
   )}
   {data.protocol === 'mqtt' && (
    <>
     <label className="check">
      <input type="checkbox" checked={!!data.mqttTls} onChange={(e) => { const tls = e.target.checked; setData((d) => ({ ...d, mqttTls: tls, port: d.port === (tls ? 1883 : 8883) ? (tls ? 8883 : 1883) : d.port })); }} />
      TLS ile bağlan (sunucu sertifikası doğrulanır)
     </label>
     <div className="field-grid">
      <Field label="İstemci kimliği (client id)">
       <input className="mono" autoComplete="off" spellCheck={false} maxLength={100} placeholder={'Boş: zscada-<bilgisayar>-' + (data.id || 'bağlantı')} title="Boş bırakılırsa Z SCADA bilgisayarının adı ve bağlantı kimliğinden üretilir; aktif ve yedek sunucu brokere farklı kimlikle bağlanır. Elle yazılan kimlik iki sunucuda aynı olur, yedekli kurulumda boş bırakın." value={data.clientId ?? ''} onChange={(e) => patch('clientId', e.target.value.trim())} />
      </Field>
      <Field label="Keepalive (sn)">
       <input type="number" min={5} max={3600} value={data.mqttKeepalive ?? 60} onChange={(e) => patch('mqttKeepalive', Number(e.target.value))} />
      </Field>
     </div>
     <label className="check">
      <input type="checkbox" checked={data.mqttCleanSession ?? true} onChange={(e) => patch('mqttCleanSession', e.target.checked)} />
      Temiz oturum (clean session)
     </label>
     <OpcUaLogin savedId={savedId} admin={admin} />
     <div className="title-row small muted">
      Broker tarafı gereksinimleri
      <InfoTip>
       Etiketler konudan okunur (joker + ve # kullanılmaz); JSON yükte alan yolu verilir (data.temp, values[0]),
       boşsa yükün tamamı okunur. Sayı, sayı metni ve true/false/on/off/1/0 anlaşılır; çevrilemeyen değer
       "hatalı" görünür. MQTT etiketleri yalnız okunur. Cihaz yalnız değişimde yayınlıyorsa cihazın güncellik
       süresi yayın aralığından uzun olmalı; yoksa değer "güncel değil" görünür. TLS'te broker sertifikası
       genel kök sertifikalarla doğrulanmalı (özel CA bu sürümde yok). Temiz oturum kapatılırsa broker
       bağlantı kopukken biriken mesajları sonradan teslim eder. Kullanıcı adı ve parola yalnız bu sunucuda saklanır.
      </InfoTip>
     </div>
     <MqttPublishFields data={data} setData={setData} tags={tags} />
    </>
   )}
   {data.protocol === 'snmp' && (
    <>
     <div className="field-grid">
      <Field label="SNMP sürümü">
       <select value={data.snmpVersion ?? '2c'} onChange={(e) => { const v = e.target.value; setData((d) => ({ ...d, snmpVersion: v, ...(v === '3' ? { snmpSecurityLevel: d.snmpSecurityLevel ?? 'authPriv', snmpAuthProtocol: d.snmpAuthProtocol ?? 'SHA256', snmpPrivProtocol: d.snmpPrivProtocol ?? 'AES' } : { snmpSecurityLevel: undefined, snmpAuthProtocol: undefined, snmpPrivProtocol: undefined }) })); }}>
        <option value="1">v1</option>
        <option value="2c">v2c</option>
        <option value="3">v3 (kullanıcı + şifreleme)</option>
       </select>
      </Field>
      {data.snmpVersion === '3' && (
       <Field label="Güvenlik seviyesi">
        <select value={data.snmpSecurityLevel ?? 'authPriv'} onChange={(e) => patch('snmpSecurityLevel', e.target.value)}>
         <option value="authPriv">Kimlik + şifreleme (authPriv)</option>
         <option value="authNoPriv">Yalnız kimlik (authNoPriv)</option>
         <option value="noAuthNoPriv">Yok (noAuthNoPriv)</option>
        </select>
       </Field>
      )}
     </div>
     {data.snmpVersion === '3' && (data.snmpSecurityLevel ?? 'authPriv') !== 'noAuthNoPriv' && (
      <div className="field-grid">
       <Field label="Kimlik doğrulama">
        <select value={data.snmpAuthProtocol ?? 'SHA256'} onChange={(e) => patch('snmpAuthProtocol', e.target.value)}>
         {['SHA256', 'SHA384', 'SHA512', 'SHA224', 'SHA', 'MD5'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
       </Field>
       {(data.snmpSecurityLevel ?? 'authPriv') === 'authPriv' && (
        <Field label="Şifreleme">
         <select value={data.snmpPrivProtocol ?? 'AES'} onChange={(e) => patch('snmpPrivProtocol', e.target.value)}>
          <option value="AES">AES (128)</option>
          <option value="DES">DES (eski)</option>
         </select>
        </Field>
       )}
      </div>
     )}
     <SecretFields key={'snmp-' + (data.snmpVersion ?? '2c') + '-' + (data.snmpSecurityLevel ?? '')} savedId={savedId} admin={admin} fields={snmpSecretFields(data)} {...secretTexts} />
     <div className="title-row small muted">
      Cihaz tarafı gereksinimleri
      <InfoTip>
       Etiketler sayısal OID ile okunur (1.3.6.1.2.1.1.3.0; MIB adı kullanılmaz); her cihazın OID'leri tarama süresinde
       tek GET ile, 20'şerli parçalar halinde istenir. SNMP yalnız okunur. v1'de tek geçersiz OID o parçadaki bütün
       etiketleri "hatalı" yapar; v2c/v3'te yalnız o etiketi. Community ve v3 anahtarları yalnız bu sunucuda saklanır;
       community Node-RED'e şifreli kimlik alanı olarak gider, akış dosyasına ve yedeğe yazılmaz. Cihazda bu PC'nin IP'si
       SNMP erişim listesinde olmalı, UDP 161 açık olmalı. 161 dışı port yalnız IPv4 adreste çalışır.
      </InfoTip>
     </div>
    </>
   )}
   {data.protocol === 'http' && (
    <>
     <Field label="Kimlik doğrulama">
      <div className="insp-seg" role="radiogroup" aria-label="HTTP kimlik doğrulama">
       {([['none', 'Yok'], ['basic', 'Kullanıcı / parola'], ['bearer', 'Bearer token']] as const).map(([k, l]) => (
        <button type="button" key={k} role="radio" aria-checked={(data.httpAuth ?? 'none') === k} className={(data.httpAuth ?? 'none') === k ? 'active' : ''} onClick={() => patch('httpAuth', k)}>{l}</button>
       ))}
      </div>
     </Field>
     {(data.httpAuth ?? 'none') === 'basic' && <SecretFields key="http-basic" savedId={savedId} admin={admin} fields={[{ key: 'username', label: 'Kullanıcı adı' }, { key: 'password', label: 'Parola' }]} {...secretTexts} />}
     {data.httpAuth === 'bearer' && <SecretFields key="http-bearer" savedId={savedId} admin={admin} fields={[{ key: 'token', label: 'Bearer token' }]} {...secretTexts} />}
     <div className="title-row small muted">
      Sunucu tarafı gereksinimleri
      <InfoTip>
       Etiket, temel adrese eklenen yoldan (/api/olcum) GET ile okunur; cevap JSON ise alan yolu verilir (data.temp),
       değilse gövdenin tamamı okunur. Aynı yoldaki etiketler tek istekle okunur. Yalnız 2xx cevap geçerlidir;
       yönlendirme izlenmez, hata ve zaman aşımı değeri "hatalı" yapar. HTTPS'te sunucu sertifikası doğrulanır
       (genel kök sertifikalar; özel CA bu sürümde yok). HTTP etiketleri yalnız okunur. Parola ve token yalnız
       bu sunucuda saklanır.
      </InfoTip>
     </div>
    </>
   )}
   {data.protocol === 'bacnet' && (
    <>
     <div className="field-grid">
      <Field label="Cihaz nesne numarası">
       <input type="number" min={0} max={4194302} required placeholder="örn. 1201" value={data.bacnetDeviceInstance ?? ''} onChange={(e) => patch('bacnetDeviceInstance', e.target.value === '' ? undefined : Number(e.target.value))} />
      </Field>
      <Field label="Bu PC'nin UDP portu">
       <input type="number" min={1} max={65535} value={data.bacnetLocalPort ?? 47809} onChange={(e) => patch('bacnetLocalPort', Number(e.target.value))} />
      </Field>
     </div>
     <Field label="Bu PC'nin ağ arayüzü (isteğe bağlı)">
      <input className="mono" placeholder="Boş: tüm arayüzler" autoComplete="off" spellCheck={false} maxLength={15} value={data.bacnetLocalAddress ?? ''} onChange={(e) => patch('bacnetLocalAddress', e.target.value.trim())} />
     </Field>
     {(data.bacnetLocalPort ?? 47809) === 47808 && <small className="insp-msg err">47808 bu PC'de BMS yazılımı (Desigo, EBI, Niagara vb.) çalışıyorsa doludur; Z SCADA o portu açamaz ve okuma yapılamaz. Cihaz yanıtı kaynak porta gönderiyorsa 47809 bırakın.</small>}
     <small className="insp-msg info">Yalnız okuma. Z SCADA cihaza tekil adresle ReadPropertyMultiple gönderir; Who-Is/yayın göndermez, BMS'in komutlarına (öncelik dizisi) dokunmaz.</small>
     <div className="title-row small muted">
      Cihaz tarafı gereksinimleri
      <InfoTip>
       Cihazın IP adresi ve nesne numarası (device instance) BMS'in nokta listesinden ya da cihazın kendi sayfasından
       alınır; cihaz ağda aranmaz. Etiketler nesne tipi + numarası + özellikle okunur (AV 12 · present-value); her
       cihazın nesneleri tarama süresinde 16'şarlı ReadPropertyMultiple istekleriyle sorulur. present-value ile
       birlikte status-flags okunur; cihaz "arıza" bildirirse değer hatalı görünür. Bazı eski cihazlar cevabı her zaman
       47808'e yollar; değer gelmiyorsa ve bu PC'de başka BACnet yazılımı yoksa yerel portu 47808 yapın. MS/TP arkasındaki
       (yönlendiricili) cihazlar ve yazma bu sürümde yok. Güvenlik duvarında bu PC'nin yerel UDP portu açık olmalı.
      </InfoTip>
     </div>
    </>
   )}
   {data.protocol === 'enip' && (
    <>
     <div className="field-grid">
      <Field label="CPU yuvası (slot)">
       <input type="number" min={0} max={31} value={data.slot ?? 0} onChange={(e) => patch('slot', Number(e.target.value))} />
      </Field>
      <Field label="Tarama çevrimi (ms)">
       <input type="number" min={100} max={60000} placeholder="Boş: cihaz taraması" value={data.enipCycleMs ?? ''} onChange={(e) => patch('enipCycleMs', e.target.value === '' ? undefined : Number(e.target.value))} />
      </Field>
     </div>
     <div className="title-row small muted">
      Denetleyici tarafı gereksinimleri
      <InfoTip>
       Allen-Bradley ControlLogix/CompactLogix: denetleyici kapsamlı (controller-scope) etiketler en basitidir, adıyla
       yazılır (Sicaklik, Motor[2].Hiz); program kapsamlı etiket Program:Ad.Etiket biçimindedir. Omron NX/NJ: etiket Sysmac
       Studio'da ağ değişkeni olarak yayınlanmış olmalı (Network Publish: Input, Output ya da Publish Only); yayınlanmamış
       değişken okunamaz. Desteklenen tipler BOOL, INT, DINT ve REAL; UINT/UDINT okunamaz. Bilinmeyen tek bir etiket adı
       bütün bağlantıyı düşürür (sürücü 5 sn'de bir yeniden dener); yeni etiketi PLC'de doğruladıktan sonra ekleyin.
       Yazma bir sonraki taramada yapılır, sonucu geri okumayla doğrulanır. Bağlantı yokken yazma reddedilir (sıraya alınmaz).
      </InfoTip>
     </div>
    </>
   )}
   {data.protocol === 'sql' && (
    <>
     <div className="field-grid">
      <Field label="Veritabanı">
       <input className="mono" required placeholder="MES" autoComplete="off" spellCheck={false} maxLength={128} value={data.sqlDatabase ?? ''} onChange={(e) => patch('sqlDatabase', e.target.value)} />
      </Field>
      <Field label="Adlı örnek (isteğe bağlı)">
       <input className="mono" placeholder="Boş: varsayılan örnek" autoComplete="off" spellCheck={false} maxLength={16} value={data.sqlInstance ?? ''} onChange={(e) => patch('sqlInstance', e.target.value.trim())} />
      </Field>
     </div>
     <label className="check">
      <input type="checkbox" checked={data.sqlEncrypt ?? true} onChange={(e) => patch('sqlEncrypt', e.target.checked)} />
      Bağlantıyı şifrele (TLS)
     </label>
     <label className="check">
      <input type="checkbox" checked={!!data.sqlTrustServerCertificate} onChange={(e) => patch('sqlTrustServerCertificate', e.target.checked)} />
      Sunucu sertifikasını doğrulamadan güven
     </label>
     {data.sqlTrustServerCertificate && <small className="insp-msg err">Sertifika doğrulanmaz: araya giren bir sunucu kimlik bilgisini alabilir. Yalnız kendinden imzalı sertifikalı iç sunucuda açın.</small>}
     <SecretFields key="sql" savedId={savedId} admin={admin} fields={[{ key: 'username', label: 'SQL kullanıcısı' }, { key: 'password', label: 'Parola' }]} {...secretTexts} />
     <small className="insp-msg info">Bu kullanıcı yalnız okuma yetkili olmalı (db_datareader ya da yalnız gereken tablolarda SELECT). Z SCADA'nın sorgu denetimi ikinci savunmadır, yetkinin yerini tutmaz.</small>
     <div className="title-row small muted">
      Sunucu tarafı gereksinimleri
      <InfoTip>
       Microsoft SQL Server, SQL kimlik doğrulaması (Windows tümleşik giriş bu sürümde yok). Her etiket tek bir SELECT
       ve sütun adıyla okunur; sonucun ilk satırı alınır (TOP 1 önerilir). Aynı sorguyu kullanan etiketler tek
       çalıştırmayı paylaşır. Noktalı virgül, yorum ve INSERT/UPDATE/DELETE/EXEC/INTO gibi komutlar reddedilir;
       sorgu ve bağlantı zaman aşımı bağlantının zaman aşımıdır. Adlı örnekte (SQLEXPRESS) port SQL Browser'dan
       (UDP 1434) öğrenilir. Kullanıcı adı ve parola yalnız bu sunucuda saklanır.
      </InfoTip>
     </div>
    </>
   )}
  </>
 );
}