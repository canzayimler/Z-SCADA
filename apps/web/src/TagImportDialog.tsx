/* Toplu etiket ekleme: Excel'den yapıştır ya da CSV dosyası. Satır satır önizleme;
   hatalı satırlar atlanır, geçerliler eklenir. Ayrıştırma ve denetim tagImport.ts'te. */
import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, XCircle } from 'lucide-react';
import { bacnetObjectText, type Config, type Tag } from '../../../packages/contracts/model';
import { SearchSelect } from './SearchSelect';
import { useModal } from './useModal';
import { AREA_INFO } from './cfgModel';
import { importTags, POSITIONAL } from './tagImport';

type Props = { config: Config; busy: boolean; deviceId: string; group: string; onImport: (tags: Tag[], withCommands: boolean) => void; onClose: () => void };

const SHOW = 300;

export function TagImportDialog({ config, busy, deviceId, group, onImport, onClose }: Props) {
 const closeRef = useRef(onClose); closeRef.current = onClose;
 const stableClose = useCallback(() => closeRef.current(), []);
 const ref = useModal<HTMLDivElement>(true, stableClose);
 const [text, setText] = useState('');
 const [file, setFile] = useState('');
 const [defaults, setDefaults] = useState({ deviceId: deviceId || config.devices[0]?.id || '', group, access: 'read' as Tag['access'] });
 const [onlyIssues, setOnlyIssues] = useState(false);
 const [withCommands, setWithCommands] = useState(false);
 // Kimlikler önizleme boyunca sabit kalsın diye ayrıştırma metne bağlı; yeni id yalnız metin değişince.
 const result = useMemo(() => importTags(text, config, defaults, () => crypto.randomUUID()), [text, config, defaults]);
 const ok = result.rows.filter((r) => r.tag), bad = result.rows.filter((r) => !r.tag), warn = ok.filter((r) => r.warnings.length);
 const writable = ok.filter((r) => r.tag!.access === 'readwrite').length;
 const shown = (onlyIssues ? result.rows.filter((r) => r.errors.length || r.warnings.length) : result.rows).slice(0, SHOW);
 const groups = [...new Set(config.tags.filter((t) => t.deviceId === defaults.deviceId).map((t) => (t.group || '').trim()).filter(Boolean))];
 const addr = (t: Tag) => t.s7Address || t.adsSymbol || t.nodeId || (t.mqttTopic ? t.mqttTopic + (t.mqttJsonPath ? ' · ' + t.mqttJsonPath : '') : '') || t.snmpOid
 || (t.httpPath ? t.httpPath + (t.httpJsonPath ? ' · ' + t.httpJsonPath : '') : '') || (t.sqlQuery ? (t.sqlColumn ? t.sqlColumn + ' · ' : '') + t.sqlQuery : '')
 || (t.bacnetObjectType ? bacnetObjectText(t.bacnetObjectType, t.bacnetInstance) + (t.bacnetProperty && t.bacnetProperty !== 'present-value' ? ' · ' + t.bacnetProperty : '') : '') || t.cipTag
 || AREA_INFO[t.area].short + ' ' + t.address + (t.bit !== null ? '.' + t.bit : '');
 const readFile = async (f: File) => { setFile(f.name); setText(await f.text()); };
 return (
  <div className="modal-backdrop" onClick={onClose}>
   <div className="modal import-modal" ref={ref} role="dialog" aria-modal="true" aria-label="Toplu etiket ekle" onClick={(e) => e.stopPropagation()}>
    <div className="modal-heading"><h2>Toplu etiket ekle</h2><button className="tool" aria-label="Kapat" onClick={onClose}>×</button></div>
    <div className="import-defaults">
     <div className="field"><span>Cihaz <small className="muted">(cihaz sütunu yoksa)</small></span><SearchSelect ariaLabel="Cihaz" allowEmpty={false} value={defaults.deviceId} options={config.devices.map((d) => ({ value: d.id, label: d.code + ' — ' + d.name }))} onChange={(v) => setDefaults({ ...defaults, deviceId: v })} /></div>
     <label className="field"><span>Klasör <small className="muted">(bölüm sütunu yoksa)</small></span><input list="import-group-list" value={defaults.group} maxLength={60} placeholder="Klasörsüz" onChange={(e) => setDefaults({ ...defaults, group: e.target.value })} /><datalist id="import-group-list">{groups.map((g) => <option key={g} value={g} />)}</datalist></label>
     <div className="field"><span>Erişim <small className="muted">(sütun yoksa)</small></span>
      <div className="insp-seg">
       <button type="button" className={defaults.access === 'read' ? 'active' : ''} onClick={() => setDefaults({ ...defaults, access: 'read' })}>Salt okuma</button>
       <button type="button" className={defaults.access === 'readwrite' ? 'active' : ''} onClick={() => setDefaults({ ...defaults, access: 'readwrite' })}>Oku / yaz</button>
      </div>
     </div>
    </div>
    <div className="import-input">
     <textarea className="mono" rows={result.rows.length ? 4 : 9} value={text} spellCheck={false} aria-label="Yapıştırılan tablo"
      placeholder={'Excel\'de hücreleri seçip kopyalayın, buraya yapıştırın (Ctrl+V).\n\nM0\tStart butonu\nM1\tStop butonu\nY0\tKonveyör motoru\nD100\tSıcaklık\tint16\tread\t°C'}
      onChange={(e) => { setText(e.target.value); setFile(''); }} />
     <div className="import-help">
      <label className="btn small"><FileUp size={14} />CSV dosyası seç<input hidden type="file" accept=".csv,.txt,.tsv" onChange={(e) => { if (e.target.files?.[0]) void readFile(e.target.files[0]); e.target.value = ''; }} /></label>
      {file && <span className="muted small">{file}</span>}
      <span className="insp-hint">
       Başlık satırı yoksa sütun sırası: <b>{POSITIONAL.map((f) => ({ address: 'Adres', name: 'Ad', dataType: 'Tip', access: 'Erişim', unit: 'Birim', description: 'Açıklama' })[f]).join(' · ')}</b>.
       Başlıkla her sütun kullanılabilir (kod, ad, cihaz, bölüm, adres, alan, tip, erişim, birim, açıklama…). Adres: <span className="mono">M0 · D100 · Y0 · X0</span> (Delta),{' '}
       <span className="mono">40001</span>, <span className="mono">HR 100.3</span>; S7 için <span className="mono">DB1,REAL4</span>; BACnet için <span className="mono">AV12 · BI:3</span> (+ özellik sütunu);
       EtherNet/IP için <span className="mono">Program:Main.Sayac</span>.
      </span>
     </div>
    </div>
    {result.rows.length > 0 && (
     <div className="import-preview">
      <div className="import-summary" aria-live="polite">
       <span className="ok"><CheckCircle2 size={14} />{ok.length} eklenecek</span>
       {warn.length > 0 && <span className="warn"><AlertTriangle size={14} />{warn.length} uyarılı</span>}
       {bad.length > 0 && <span className="bad"><XCircle size={14} />{bad.length} satır atlanacak</span>}
       <span className="muted small">{result.header ? 'İlk satır başlık olarak okundu' : 'Başlık satırı yok, sıra kullanıldı'}</span>
       {(bad.length > 0 || warn.length > 0) && <label className="check"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />Yalnız sorunlu satırlar</label>}
      </div>
      <div className="import-table">
       <table>
        <thead><tr><th>Satır</th><th>Kod</th><th>Ad</th><th>Adres</th><th>Tip</th><th>Erişim</th><th>Klasör</th><th>Durum</th></tr></thead>
        <tbody>
         {shown.map((r) => (
          <tr key={r.line} className={r.errors.length ? 'bad' : r.warnings.length ? 'warn' : ''}>
           <td className="mono muted">{r.line}</td>
           {r.tag ? (
            <>
             <td className="mono">{r.tag.code}</td><td>{r.tag.name !== r.tag.code ? r.tag.name : ''}</td><td className="mono">{addr(r.tag)}</td>
             <td className="mono">{r.tag.dataType}</td><td>{r.tag.access === 'readwrite' ? 'Oku / yaz' : 'Salt okuma'}</td><td>{r.tag.group || <span className="muted">—</span>}</td>
            </>
           ) : <td colSpan={6} className="mono muted import-raw">{r.cells.join(' · ')}</td>}
           <td className="import-msg">{r.errors.length ? r.errors.join(' ') : r.warnings.length ? r.warnings.join(' ') : <CheckCircle2 size={14} aria-label="Geçerli" />}</td>
          </tr>
         ))}
        </tbody>
       </table>
       {result.rows.length > SHOW && !onlyIssues && <p className="muted small import-more">İlk {SHOW} satır gösteriliyor; hepsi işlenir.</p>}
      </div>
     </div>
    )}
    <div className="modal-actions">
     {writable > 0 && <label className="check import-cmd"><input type="checkbox" checked={withCommands} onChange={(e) => setWithCommands(e.target.checked)} />{writable} yazılabilir etiket için "… kontrol" komutu oluştur</label>}
     <button className="btn" onClick={onClose}>Vazgeç</button>
     <button className="btn primary" disabled={!ok.length || busy} onClick={() => onImport(ok.map((r) => r.tag!), withCommands)}>{ok.length ? ok.length + ' etiket ekle' : 'Etiket ekle'}</button>
    </div>
   </div>
  </div>
 );
}
