/* Modbus RTU seri port alanı: sunucunun gördüğü COM portlarını öneri olarak listeler,
   elle yazmaya da izin verir (port o an takılı olmayabilir). */
import { useEffect, useId, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from './api';

type Port = { path: string; label: string };

export function SerialPortInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
 const [ports, setPorts] = useState<Port[] | null>(null);
 const listId = useId();
 const load = () => {
  setPorts(null);
  void api<Port[]>('/serial-ports').then(setPorts).catch(() => setPorts([]));
 };
 useEffect(load, []);
 return (
  <div className="serial-port-input">
   <input className="mono" required list={listId} placeholder="COM3" value={value} onChange={(e) => onChange(e.target.value.trim())} />
   <datalist id={listId}>
    {(ports || []).map((p) => (
     <option key={p.path} value={p.path}>{p.label}</option>
    ))}
   </datalist>
   <button type="button" className="icon-btn" title="Portları yeniden tara" aria-label="Portları yeniden tara" onClick={load}>
    <RefreshCw size={14} className={ports === null ? 'spin' : ''} />
   </button>
   <small className="muted">
    {ports === null ? 'Portlar taranıyor…' : ports.length ? ports.length + ' port bulundu: ' + ports.map((p) => p.path).join(', ') : 'Bu PC\'de seri port bulunamadı; adı elle yazabilirsiniz.'}
   </small>
  </div>
 );
}
