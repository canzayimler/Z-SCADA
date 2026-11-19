/* TIA Portal PLC etiket tablosundan (.xlsx) S7 etiketi içe aktarma penceresi.
   Önizleme: her satır "eklenecek / zaten var / desteklenmiyor" ve nedeniyle görünür; yalnız seçilenler eklenir.
   Etiketler salt okunur gelir (S7 yalnız izleme). Kayıt Management'taki saveConfig ile yapılır. */
import { useMemo, useState } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import type { Config, Tag } from '../../../packages/contracts/model';
import { readTiaFile, type TiaResult } from './tiaImport';
import { InfoTip } from './InfoTip';

type Props = { config: Config; s7DeviceIds: Set<string>; busy: boolean; onClose: () => void; onImport: (tags: Tag[]) => void };

export function TiaImportDialog({ config, s7DeviceIds, busy, onClose, onImport }: Props) {
 const devices = config.devices.filter((d) => s7DeviceIds.has(d.id));
 const [deviceId, setDeviceId] = useState(devices[0]?.id || '');
 const [file, setFile] = useState<{ name: string; sheet: string; results: TiaResult[] } | null>(null);
 const [error, setError] = useState('');
 const [skip, setSkip] = useState<Set<number>>(new Set());
 const existing = useMemo(() => {
  const own = config.tags.filter((t) => t.deviceId === deviceId);
  return { codes: new Set(own.map((t) => t.code.toLocaleLowerCase('tr'))), addrs: new Set(own.map((t) => (t.s7Address || '').toUpperCase())) };
 }, [config.tags, deviceId]);
 const rows = (file?.results || []).map((r, i) => {
  const dup = r.s7Address && (existing.codes.has(r.row.name.toLocaleLowerCase('tr')) || existing.addrs.has(r.s7Address));
  const state = r.reason ? 'unsupported' : dup ? 'exists' : 'new';
  return { r, i, state };
 });
 const importable = rows.filter((x) => x.state === 'new' && !skip.has(x.i));
 async function pick(f: File) {
  setError(''); setFile(null); setSkip(new Set());
  try { const res = await readTiaFile(await f.arrayBuffer()); setFile({ name: f.name, ...res }); }
  catch (e) { setError((e as Error).message); }
 }
 function submit() {
  const seen = new Set<string>();
  const tags: Tag[] = [];
  for (const { r } of importable) {
   const code = r.row.name.slice(0, 100);
   if (seen.has(code.toLocaleLowerCase('tr'))) continue; seen.add(code.toLocaleLowerCase('tr'));
   const bool = r.tagType === 'bool';
   tags.push({
    id: crypto.randomUUID(), deviceId, code, name: (r.row.comment || r.row.name).slice(0, 100),
    area: 'holding-register', address: 0, dataType: r.tagType!, access: 'read', scale: 1, offset: 0,
    min: bool ? 0 : -2147483648, max: bool ? 1 : 2147483647, unit: '', description: r.row.comment ? 'TIA: ' + r.row.name + ' · ' + r.row.address : 'TIA: ' + r.row.address,
    wordOrder: 'big', byteOrder: 'big', bit: null, verifyTolerance: null, history: false, historyDeadband: 0, historyMaxGapMs: 60000,
    nodeId: '', s7Address: r.s7Address,
   } as Tag);
  }
  onImport(tags);
 }
 const label: Record<string, string> = { new: 'Eklenecek', exists: 'Zaten var', unsupported: 'Desteklenmiyor' };
 return (
  <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
   <div className="modal tia-modal" role="dialog" aria-modal="true" aria-label="TIA Portal'dan etiket aktar">
    <div className="modal-heading">
     <h2>TIA Portal'dan etiket aktar</h2>
     <button className="tool" aria-label="Kapat" onClick={onClose}><X size={16} /></button>
    </div>
    {!devices.length ? (
     <p className="muted">Önce Siemens S7 protokollü bir bağlantı ve cihaz tanımlayın; etiketler o cihaza eklenir.</p>
    ) : (
     <>
      <div className="tia-head">
       <label className="field"><span>Hedef cihaz</span>
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>{devices.map((d) => <option key={d.id} value={d.id}>{d.code} · {d.name}</option>)}</select>
       </label>
       <label className="btn small cfg-import"><FileSpreadsheet size={13} />Dosya seç (.xlsx)<input hidden type="file" accept=".xlsx" onChange={(e) => { if (e.target.files?.[0]) void pick(e.target.files[0]); e.target.value = ''; }} /></label>
       <InfoTip label="TIA dışa aktarma">
        TIA Portal'da proje ağacında PLC tags → etiket tablosunu açın → üst çubukta "Export" (Dışa aktar) → .xlsx.
        %I, %Q, %M alanındaki Bool, Byte, Int, Word, DInt, DWord, Real, UInt, UDInt, Time etiketleri gelir.
        DB değişkenleri bu dosyada yoktur; optimize DB'ler için OPC UA kullanın. Etiketler salt okunur eklenir,
        eklemeden sonra "Haberleşmeye uygula" ile sahaya gider.
       </InfoTip>
      </div>
      {error && <p className="field-error">{error}</p>}
      {file && (
       <>
        <p className="small muted">{file.name} · sayfa “{file.sheet}” · {rows.length} satır: {rows.filter((x) => x.state === 'new').length} yeni, {rows.filter((x) => x.state === 'exists').length} zaten var, {rows.filter((x) => x.state === 'unsupported').length} desteklenmiyor</p>
        <div className="table-wrap tia-wrap">
         <table className="cfg-table cfg-compact">
          <thead><tr><th /><th>TIA adı</th><th>Tip</th><th>TIA adresi</th><th>S7 adresi</th><th>Durum</th></tr></thead>
          <tbody>
           {rows.map(({ r, i, state }) => (
            <tr key={i} className={'tia-' + state}>
             <td>{state === 'new' && <input type="checkbox" aria-label={r.row.name + ' ekle'} checked={!skip.has(i)} onChange={() => setSkip((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} />}</td>
             <td><strong className="mono">{r.row.name}</strong>{r.row.comment && <small>{r.row.comment}</small>}</td>
             <td className="mono">{r.row.dataType}</td>
             <td className="mono">{r.row.address || '—'}</td>
             <td className="mono">{r.s7Address || '—'}</td>
             <td>{state === 'unsupported' ? <span className="muted small" title={r.reason}>{r.reason}</span> : <span className={'cfg-chip ' + (state === 'new' ? 'rw' : '')}>{label[state]}</span>}</td>
            </tr>
           ))}
          </tbody>
         </table>
        </div>
       </>
      )}
     </>
    )}
    <div className="modal-actions">
     <button className="btn" onClick={onClose}>Vazgeç</button>
     <button className="btn primary" disabled={busy || !importable.length || !deviceId} onClick={submit}>{importable.length ? importable.length + ' etiketi ekle' : 'Etiket ekle'}</button>
    </div>
   </div>
  </div>
 );
}
