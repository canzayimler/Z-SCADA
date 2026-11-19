/* S7 PLC sağlığı: çalışma modu rozeti (cihaz kartında) ve tanılama paneli.
   Veri /api/plc-health'ten gelir; sunucu PLC'yi salt okur (plcHealth.ts). Tüm kartlar
   tek ortak yoklamayı paylaşır — kart sayısı kadar istek atılmaz. */
import { Fragment, useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { api } from './api';
import { InfoTip } from './InfoTip';

type Diag = { eventId: number; idText: string; eventClass: number; classLabel: string; incoming: boolean | null; at: string | null; info: string };
export type PlcHealth = {
 connectionId: string; name: string; host: string; status: 'ok' | 'offline' | 'connecting'; error?: string; checkedAt: number | null;
 mode: 'run' | 'stop' | 'startup' | 'hold' | 'defect' | 'unknown' | null;
 identity: Record<string, string> | null; clockDriftSec: number | null; diag: Diag[] | null; diagAt: number | null; unsupported: string[];
};
const modeText: Record<string, string> = { run: 'RUN', stop: 'STOP', startup: 'BAŞLANGIÇ', hold: 'BEKLEME', defect: 'ARIZALI', unknown: 'BİLİNMİYOR' };
const identityLabels: [string, string][] = [['moduleType', 'CPU tipi'], ['orderNo', 'Sipariş no'], ['firmware', 'Firmware'], ['hardware', 'Donanım sürümü'], ['serial', 'Seri no'], ['systemName', 'Sistem adı'], ['moduleName', 'Modül adı'], ['plantId', 'Tesis kimliği']];

let cache: PlcHealth[] = [];
const listeners = new Set<(v: PlcHealth[]) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
async function load() {
 try { cache = await api<PlcHealth[]>('/plc-health'); } catch { /* sunucu eski ya da erişilemiyor: rozet gizli kalır */ }
 for (const l of listeners) l(cache);
}
function usePlcHealth() {
 const [v, setV] = useState(cache);
 useEffect(() => {
  listeners.add(setV);
  if (!timer) { void load(); timer = setInterval(() => void load(), 15000); }
  return () => { listeners.delete(setV); if (!listeners.size && timer) { clearInterval(timer); timer = null; } };
 }, []);
 return v;
}
function modeClass(h: PlcHealth) {
 if (h.status !== 'ok') return 'bad';
 return h.mode === 'run' ? 'good' : h.mode === 'stop' || h.mode === 'defect' ? 'bad' : h.mode ? 'warn' : '';
}
function modeLabel(h: PlcHealth) {
 if (h.status === 'connecting') return 'Bağlanıyor…';
 if (h.status === 'offline') return 'PLC erişilemiyor';
 return h.mode ? modeText[h.mode] : 'Mod okunamıyor';
}
/** Cihaz kartındaki satır: mod rozeti + tanılama paneli düğmesi. S7 dışı bağlantıda hiçbir şey çizmez. */
export function PlcHealthRow({ connectionId }: { connectionId: string }) {
 const all = usePlcHealth();
 const h = all.find((x) => x.connectionId === connectionId);
 const [open, setOpen] = useState(false);
 if (!h) return null;
 return (
  <>
   <dt>PLC</dt>
   <dd className="plc-health-row">
    <span className={'plc-mode ' + modeClass(h)}><i />{modeLabel(h)}</span>
    {h.diag && h.diag.length > 0 && <small>{h.diag.length} tanılama kaydı</small>}
    <button type="button" className="link-btn" onClick={() => setOpen(true)}>Tanılama</button>
   </dd>
   {open && <PlcHealthPanel h={h} onClose={() => setOpen(false)} />}
  </>
 );
}
function PlcHealthPanel({ h: initial, onClose }: { h: PlcHealth; onClose: () => void }) {
 const all = usePlcHealth();
 const [h, setH] = useState(initial);
 const [busy, setBusy] = useState(false);
 useEffect(() => { const n = all.find((x) => x.connectionId === initial.connectionId); if (n) setH(n); }, [all, initial.connectionId]);
 useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
 async function refresh() {
  setBusy(true);
  try { setH(await api<PlcHealth>('/plc-health/' + encodeURIComponent(h.connectionId) + '/refresh', 'POST', {})); } catch { /* durum satırı hatayı gösterir */ } finally { setBusy(false); }
 }
 const no = (k: string) => h.unsupported.includes(k);
 const drift = h.clockDriftSec;
 return (
  <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
   <div className="modal plc-health-modal" role="dialog" aria-modal="true" aria-label={'PLC tanılama · ' + h.name}>
    <div className="modal-heading">
     <h2>PLC tanılama · {h.name}</h2>
     <button className="tool" aria-label="Kapat" onClick={onClose}><X size={16} /></button>
    </div>
    <div className="plc-health-top">
     <span className={'plc-mode big ' + modeClass(h)}><i />{modeLabel(h)}</span>
     <span className="muted small mono">{h.host}{h.checkedAt ? ' · ' + new Date(h.checkedAt).toLocaleTimeString('tr-TR') : ''}</span>
     <InfoTip label="PLC tanılama">
      Bilgiler PLC'den salt okunur; PLC'ye hiçbir şey yazılmaz. Çalışma modu ve saat 30 sn'de, tanılama tamponu
      60 sn'de bir okunur. S7-1200/1500 bazı listeleri PUT/GET üzerinden vermez; verilmeyen bilgi "PLC bu bilgiyi
      vermiyor" diye görünür. Olay açıklaması için kimliği (16#…) TIA Portal'ın tanılama tamponunda veya Siemens
      kılavuzunda arayın.
     </InfoTip>
     <button type="button" className="btn small" disabled={busy} onClick={() => void refresh()}><RefreshCw size={13} className={busy ? 'spin' : ''} />Şimdi oku</button>
    </div>
    {h.status === 'offline' && <p className="field-error">Bağlantı kurulamadı: {h.error || 'bilinmeyen hata'}. PLC açık mı, ağda mı, PUT/GET izni açık mı?</p>}
    <section className="plc-health-sec">
     <h3>Kimlik</h3>
     {h.identity ? (
      <dl className="plc-health-dl">
       {identityLabels.filter(([k]) => h.identity![k]).map(([k, l]) => <Fragment key={k}><dt>{l}</dt><dd className="mono">{h.identity![k]}</dd></Fragment>)}
       <dt>PLC saati</dt>
       <dd className="mono">{drift === null ? (no('clock') ? 'PLC bu bilgiyi vermiyor' : '—') : Math.abs(drift) <= 2 ? 'Bu PC ile aynı' : (drift > 0 ? drift + ' sn ileri' : -drift + ' sn geri')}</dd>
      </dl>
     ) : <p className="muted small">{no('identity') ? 'PLC bu bilgiyi vermiyor.' : 'Henüz okunmadı.'}</p>}
    </section>
    <section className="plc-health-sec">
     <h3>Tanılama tamponu {!!h.diagAt && <small className="muted">· {new Date(h.diagAt).toLocaleTimeString('tr-TR')}</small>}</h3>
     {h.diag && h.diag.length ? (
      <div className="table-wrap plc-diag-wrap">
       <table className="cfg-table cfg-compact">
        <thead><tr><th>Zaman (PLC)</th><th>Olay</th><th>Sınıf</th><th>Durum</th></tr></thead>
        <tbody>
         {h.diag.map((e, i) => (
          <tr key={i}>
           <td className="mono">{e.at ? new Date(e.at).toLocaleString('tr-TR') : '—'}</td>
           <td className="mono" title={'Ek bilgi: ' + e.info}>{e.idText}</td>
           <td>{e.classLabel}</td>
           <td>{e.incoming === null ? '—' : e.incoming ? <span className="plc-ev in">Geldi</span> : <span className="plc-ev out">Gitti</span>}</td>
          </tr>
         ))}
        </tbody>
       </table>
      </div>
     ) : <p className="muted small">{no('diag') ? 'PLC tanılama tamponunu bu bağlantı üzerinden vermiyor.' : h.diag ? 'Tamponda kayıt yok.' : 'Henüz okunmadı.'}</p>}
    </section>
    <div className="modal-actions"><button className="btn" onClick={onClose}>Kapat</button></div>
   </div>
  </div>
 );
}
