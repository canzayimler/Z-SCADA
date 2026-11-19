/* Ağ keşfi penceresi: alt ağdaki endüstriyel cihazları bulur (salt okuma). Sunucu tarafı netScan.ts. */
import { useEffect, useRef, useState } from 'react';
import { Radar, X } from 'lucide-react';
import { api } from './api';
import { InfoTip } from './InfoTip';

type Host = { ip: string; mac: string | null; vendor: string | null; ports: number[]; s7: Record<string, string | number> | null; known: string | null };
type Job = { id: string; cidr: string; startedAt: number; finishedAt: number | null; total: number; done: number; hosts: Host[]; error?: string };
type Info = { job: Job | null; suggest: string[]; ports: { port: number; label: string }[] };

export function NetScanDialog({ onClose }: { onClose: () => void }) {
 const [info, setInfo] = useState<Info | null>(null);
 const [target, setTarget] = useState('');
 const [ports, setPorts] = useState<number[]>([]);
 const [job, setJob] = useState<Job | null>(null);
 const [error, setError] = useState('');
 const timer = useRef<ReturnType<typeof setInterval> | null>(null);
 useEffect(() => {
  void api<Info>('/net-scan').then((i) => { setInfo(i); setTarget(i.suggest[0] || ''); setPorts(i.ports.map((p) => p.port)); if (i.job) { setJob(i.job); if (!i.job.finishedAt) follow(); } }).catch((e) => setError((e as Error).message));
  const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  window.addEventListener('keydown', k);
  return () => { window.removeEventListener('keydown', k); if (timer.current) clearInterval(timer.current); };
 }, []);
 function follow() {
  if (timer.current) clearInterval(timer.current);
  timer.current = setInterval(async () => {
   try { const i = await api<Info>('/net-scan'); setJob(i.job); if (i.job?.finishedAt && timer.current) { clearInterval(timer.current); timer.current = null; } } catch { /* sonraki turda */ }
  }, 1000);
 }
 async function start() {
  setError('');
  try { setJob(await api<Job>('/net-scan', 'POST', { target, ports })); follow(); } catch (e) { setError((e as Error).message); }
 }
 const running = !!job && !job.finishedAt;
 const label = (p: number) => info?.ports.find((x) => x.port === p)?.label || String(p);
 return (
  <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
   <div className="modal netscan-modal" role="dialog" aria-modal="true" aria-label="Ağ taraması">
    <div className="modal-heading">
     <h2>Ağ taraması</h2>
     <button className="tool" aria-label="Kapat" onClick={onClose}><X size={16} /></button>
    </div>
    <div className="netscan-head">
     <label className="field"><span>Adres aralığı</span>
      <input className="mono" list="netscan-suggest" placeholder="192.0.2.0/24" value={target} onChange={(e) => setTarget(e.target.value)} disabled={running} />
      <datalist id="netscan-suggest">{info?.suggest.map((s) => <option key={s} value={s} />)}</datalist>
     </label>
     <div className="field"><span>Portlar</span>
      <div className="netscan-ports">
       {info?.ports.map((p) => (
        <label key={p.port} className="check"><input type="checkbox" disabled={running} checked={ports.includes(p.port)} onChange={() => setPorts((s) => s.includes(p.port) ? s.filter((x) => x !== p.port) : [...s, p.port])} />{p.label}</label>
       ))}
      </div>
     </div>
     <button className="btn primary small" disabled={running || !target.trim() || !ports.length} onClick={() => void start()}><Radar size={13} />{running ? 'Taranıyor…' : 'Taramayı başlat'}</button>
     <InfoTip label="Ağ taraması">
      Seçilen aralıktaki her adrese seçili portlarda bağlantı açılıp hemen kapatılır; hiçbir cihaza veri
      yazılmaz. S7 portu açık cihazdan CPU tipi, sipariş no ve firmware salt okunur. MAC adresi bu PC'nin ARP
      tablosundan gelir (yalnız aynı ağ parçasındaki cihazlar için). En fazla /24 (256 adres) taranır, ~1 dk sürer.
      Yazılım PROFINET DCP taraması yapmaz: o ham Ethernet ve ayrı sürücü kurulumu (Npcap) ister.
     </InfoTip>
    </div>
    {error && <p className="field-error">{error}</p>}
    {job && (
     <>
      <div className="netscan-progress" aria-label="İlerleme">
       <span style={{ width: (job.total ? (job.done / job.total) * 100 : 0) + '%' }} />
      </div>
      <p className="small muted">{job.cidr} · {job.done}/{job.total} adres · {job.hosts.length} cihaz{job.finishedAt ? ' · ' + Math.round((job.finishedAt - job.startedAt) / 1000) + ' sn' : ''}{job.error ? ' · hata: ' + job.error : ''}</p>
      {job.hosts.length > 0 && (
       <div className="table-wrap netscan-wrap">
        <table className="cfg-table cfg-compact">
         <thead><tr><th>IP</th><th>MAC · üretici</th><th>Açık portlar</th><th>S7 kimliği</th><th>Z SCADA'da</th></tr></thead>
         <tbody>
          {job.hosts.map((h) => (
           <tr key={h.ip}>
            <td className="mono"><strong>{h.ip}</strong></td>
            <td className="mono">{h.mac || '—'}{h.vendor && <small>{h.vendor}</small>}</td>
            <td>{h.ports.map((p) => <span key={p} className="cfg-chip">{label(p)}</span>)}</td>
            <td>{h.s7 ? <><span>{h.s7.moduleType || h.s7.orderNo || 'S7 CPU'}</span><small className="mono">{[h.s7.orderNo, h.s7.firmware, h.s7.moduleName, 'slot ' + h.s7.slot].filter(Boolean).join(' · ')}</small></> : h.ports.includes(102) && job.finishedAt ? <span className="muted small">Kimlik okunamadı (PUT/GET kapalı olabilir)</span> : '—'}</td>
            <td>{h.known ? <span className="cfg-chip rw">{h.known}</span> : <span className="muted small">Tanımlı değil</span>}</td>
           </tr>
          ))}
         </tbody>
        </table>
       </div>
      )}
      {!!job.finishedAt && !job.hosts.length && !job.error && <p className="muted">Bu aralıkta seçili portlarda yanıt veren cihaz yok.</p>}
     </>
    )}
    <div className="modal-actions"><button className="btn" onClick={onClose}>Kapat</button></div>
   </div>
  </div>
 );
}
