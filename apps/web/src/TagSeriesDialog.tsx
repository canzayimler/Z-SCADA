/* Seri ekle: ardışık adresli N etiketi tek seferde tanımlar (M0…M15, D100…D130 gibi). */
import { useCallback, useMemo, useRef, useState } from 'react';
import { registerCount, type Config, type Tag } from '../../../packages/contracts/model';
import { SearchSelect } from './SearchSelect';
import { useModal } from './useModal';
import { AREA_INFO, TYPE_INFO, modbusRef, nextFreeAddress, seriesConflicts, seriesTags } from './cfgModel';

type Props = { config: Config; isS7: (deviceId: string) => boolean; template: Tag; onCreate: (tags: Tag[], withCommands: boolean) => void; onClose: () => void; busy: boolean };

export function TagSeriesDialog({ config, isS7, template, onCreate, onClose, busy }: Props) {
 // useModal onClose kimligi degisince odagi sifirlar; kararli sarmalayici ver.
 const closeRef = useRef(onClose); closeRef.current = onClose;
 const stableClose = useCallback(() => closeRef.current(), []);
 const ref = useModal<HTMLDivElement>(true, stableClose);
 const modbusDevices = config.devices.filter((d) => !isS7(d.id));
 const [base, setBase] = useState<Tag>(() => ({ ...template, deviceId: isS7(template.deviceId) ? modbusDevices[0]?.id || '' : template.deviceId }));
 // Önek ve ilk numara şablon etiketinden: M10 son ise M11'den başlar; çakışma olmaz.
 const [spec, setSpec] = useState(() => {
  const m = /^(.*?)(\d+)$/.exec(template.code || ''), prefix = m ? m[1] : template.code || 'M';
  const used = config.tags.filter((t) => t.code.startsWith(prefix) && /^\d+$/.test(t.code.slice(prefix.length))).map((t) => Number(t.code.slice(prefix.length)));
  return { count: 8, codePrefix: prefix, startIndex: used.length ? Math.max(...used) + 1 : 0, namePrefix: '', address: nextFreeAddress(config.tags, base.deviceId, base.area), step: 0 };
 });
 const [withCommands, setWithCommands] = useState(true);
 const area = AREA_INFO[base.area];
 const autoStep = area.bool || base.bit !== null ? 1 : registerCount(base.dataType);
 const step = spec.step || autoStep;
 const tags = useMemo(() => seriesTags(base, { ...spec, step }, () => crypto.randomUUID()), [base, spec, step]);
 const conflicts = useMemo(() => seriesConflicts(config.tags, tags), [config.tags, tags]);
 const setB = (x: Partial<Tag>) => setBase((b) => ({ ...b, ...x }));
 const setArea = (a: Tag['area']) => { setB({ area: a, dataType: AREA_INFO[a].bool ? 'bool' : base.dataType === 'bool' ? 'uint16' : base.dataType, access: AREA_INFO[a].writable ? base.access : 'read', bit: null }); setSpec((s) => ({ ...s, address: nextFreeAddress(config.tags, base.deviceId, a) })); };
 const valid = spec.count >= 1 && spec.count <= 500 && spec.codePrefix.trim() && base.deviceId && !conflicts.length && spec.address + (spec.count - 1) * step <= 65535;
 return (
  <div className="modal-backdrop" onClick={onClose}>
   <div className="modal series-modal" ref={ref} role="dialog" aria-modal="true" aria-label="Seri etiket ekle" onClick={(e) => e.stopPropagation()}>
    <div className="modal-heading"><h2>Seri etiket ekle</h2><button className="tool" aria-label="Kapat" onClick={onClose}>×</button></div>
    <p className="insp-hint">Ardışık adresli etiketleri tek seferde tanımlar. Örn. M0…M15 bitleri ya da D100'den başlayan 10 register.</p>
    <div className="insp-grid">
     <div className="field wide"><span>Cihaz</span><SearchSelect ariaLabel="Cihaz" allowEmpty={false} value={base.deviceId} options={modbusDevices.map((d) => ({ value: d.id, label: d.code + ' — ' + d.name }))} onChange={(deviceId) => { setB({ deviceId }); setSpec((s) => ({ ...s, address: nextFreeAddress(config.tags, deviceId, base.area) })); }} /></div>
     <label className="field"><span>Alan</span><select value={base.area} onChange={(e) => setArea(e.target.value as Tag['area'])}>{(Object.keys(AREA_INFO) as Tag['area'][]).map((k) => <option key={k} value={k}>{AREA_INFO[k].label}</option>)}</select></label>
     <label className="field"><span>Veri tipi</span><select value={base.dataType} disabled={area.bool} onChange={(e) => setB({ dataType: e.target.value as Tag['dataType'] })}>{Object.entries(TYPE_INFO).filter(([k]) => (area.bool ? k === 'bool' : k !== 'bool')).map(([k, l]) => <option key={k} value={k}>{k} — {l}</option>)}</select></label>
     <label className="field"><span>Kod öneki</span><input className="mono" value={spec.codePrefix} maxLength={40} onChange={(e) => setSpec({ ...spec, codePrefix: e.target.value })} /></label>
     <label className="field"><span>İlk sıra no</span><input type="number" min={0} value={spec.startIndex} onChange={(e) => setSpec({ ...spec, startIndex: Math.max(0, Number(e.target.value) || 0) })} /></label>
     <label className="field"><span>Adet</span><input type="number" min={1} max={500} value={spec.count} onChange={(e) => setSpec({ ...spec, count: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} /></label>
     <label className="field"><span>Klasör</span><input list="series-group-list" value={base.group || ''} maxLength={60} placeholder="Klasörsüz" onChange={(e) => setB({ group: e.target.value })} /><datalist id="series-group-list">{[...new Set(config.tags.filter((t) => t.deviceId === base.deviceId).map((t) => (t.group || '').trim()).filter(Boolean))].map((g) => <option key={g} value={g} />)}</datalist></label>
     <label className="field"><span>Ad öneki (boşsa kod)</span><input value={spec.namePrefix} maxLength={40} placeholder={spec.codePrefix} onChange={(e) => setSpec({ ...spec, namePrefix: e.target.value })} /></label>
     <label className="field"><span>İlk adres (0 tabanlı)</span><input className="mono" type="number" min={0} max={65535} value={spec.address} onChange={(e) => setSpec({ ...spec, address: Math.max(0, Number(e.target.value) || 0) })} /><small className="muted">Kılavuz: {modbusRef(base.area, spec.address)}</small></label>
     <label className="field"><span>Adres adımı (boşsa {autoStep})</span><input type="number" min={0} max={100} placeholder={String(autoStep)} value={spec.step || ''} onChange={(e) => setSpec({ ...spec, step: Math.max(0, Number(e.target.value) || 0) })} /></label>
     <div className="field wide"><span>Erişim</span>
      <div className="insp-seg">
       <button type="button" className={base.access === 'read' ? 'active' : ''} onClick={() => setB({ access: 'read' })}>Salt okuma</button>
       <button type="button" disabled={!area.writable} className={base.access === 'readwrite' ? 'active' : ''} onClick={() => setB({ access: 'readwrite' })}>Oku / yaz</button>
      </div>
     </div>
    </div>
    {base.access === 'readwrite' && <label className="check"><input type="checkbox" checked={withCommands} onChange={(e) => setWithCommands(e.target.checked)} />Her etiket için "… kontrol" komutu da oluştur</label>}
    <div className="series-preview">
     <div className="series-preview-head">Önizleme · {tags.length} etiket</div>
     <table><tbody>
      {tags.slice(0, 4).map((t) => <tr key={t.id}><td className="mono">{t.code}</td><td>{t.name}</td><td className="mono">{AREA_INFO[t.area].short} {t.address}</td><td className="mono muted">{modbusRef(t.area, t.address)}</td></tr>)}
      {tags.length > 5 && <tr><td colSpan={4} className="muted">… {tags.length - 5} etiket daha …</td></tr>}
      {tags.length > 4 && (() => { const t = tags[tags.length - 1]; return <tr><td className="mono">{t.code}</td><td>{t.name}</td><td className="mono">{AREA_INFO[t.area].short} {t.address}</td><td className="mono muted">{modbusRef(t.area, t.address)}</td></tr>; })()}
     </tbody></table>
     {conflicts.length > 0 && <p className="field-error">Çakışma: {conflicts.slice(0, 6).join(', ')}{conflicts.length > 6 ? '…' : ''} — kod veya adres zaten tanımlı.</p>}
    </div>
    <div className="modal-actions"><button className="btn" onClick={onClose}>Vazgeç</button><button className="btn primary" disabled={!valid || busy} onClick={() => onCreate(tags, base.access === 'readwrite' && withCommands)}>{tags.length} etiket ekle</button></div>
   </div>
  </div>
 );
}
