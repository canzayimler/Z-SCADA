/* Komut yan paneli: ne yaptığı (tek cümle), adımlar, güvenlik, son çalışmalar ve kullanım. */
import type { ReactNode } from 'react';
import { ArrowUpRight, Code2, Plus, Square, Trash2 } from 'lucide-react';
import { commandRiskLabels, approvalLabels, commandStatusLabels, type Config, type Execution, type Live } from '../../../packages/contracts/model';
import { SearchSelect } from './SearchSelect';
import { InfoTip } from './InfoTip';
import { commandSentence, sampleText } from './cfgModel';
import { ScriptEditor, syncScript, SCRIPT_EXAMPLES } from './ScriptEditor';

type Props = { data: any; setData: (fn: (d: any) => any) => void; fresh: boolean; config: Config; live: Live; executions: Execution[]; screens: { id: string; text: string }[]; onScreen: (id: string) => void; onStop?: (executionId: string) => void };

const Sec = ({ title, tip, children, right }: { title: string; tip?: ReactNode; children: ReactNode; right?: ReactNode }) => (
 <section className="insp-sec"><header><h3>{title}{tip && <InfoTip label={title}>{tip}</InfoTip>}</h3>{right}</header>{children}</section>
);
const BAD = ['failed', 'rejected', 'unverified', 'partial', 'uncertain', 'aborted'];
export const execTone = (s: string) => (s === 'verified' || s === 'completed' ? 'ok' : BAD.includes(s) ? 'bad' : 'run');

export function CommandInspector({ data, setData, fresh, config, live, executions, screens, onScreen, onStop }: Props) {
 const script = data.kind === 'script';
 // Tür değişimi: script'e geçerken örnek kod ve geri bildirimsiz hedefler; geri dönüşte tek adımlı yazma.
 const setKind = (k: 'write' | 'script') => setData((d) => k === 'script'
  ? syncScript({ ...d, kind: 'script', script: d.script || SCRIPT_EXAMPLES[0].code.replace('"Y0"', '"' + (config.tags.find((t) => t.id === d.tagIds[0])?.code || 'Y0') + '"'), feedbackTagIds: [], maxRunMs: d.maxRunMs ?? 60000 }, config)
  : { ...d, kind: 'write', tagIds: [d.tagIds[0] || config.tags.find((t) => t.access === 'readwrite')?.id || ''], feedbackTagIds: [d.tagIds[0] || ''], safeWrites: undefined });
 const patch = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
 const tagOpt = (t: Config['tags'][number]) => { const d = config.devices.find((x) => x.id === t.deviceId); return { value: t.id, label: (d ? d.code + '.' : '') + t.code + ' — ' + t.name, hint: t.dataType }; };
 const writeOpts = config.tags.filter((t) => t.access === 'readwrite').map(tagOpt);
 // Komutun kendi yazma hedefi izin koşulu olamaz (sunucu da reddeder); listede hiç sunulmaz.
 const allOpts = config.tags.map(tagOpt), boolOpts = config.tags.filter((t) => t.dataType === 'bool' && !data.tagIds.includes(t.id)).map(tagOpt);
 const liveOf = (id: string) => { const t = config.tags.find((x) => x.id === id); return t ? sampleText(t, live.samples[id]) : null; };
 const setStep = (key: 'tagIds' | 'feedbackTagIds', i: number, v: string) => setData((d) => ({ ...d, [key]: d[key].map((x: string, n: number) => (n === i ? v : x)) }));
 const two = data.tagIds.length > 1;
 const perms = (data.permissives || []) as { tagId: string; expected: boolean; label: string }[];
 const setPerm = (i: number, x: object) => patch('permissives', perms.map((p, n) => (n === i ? { ...p, ...x } : p)));
 return (
  <div className="insp">
   <div className="insp-summary">
    <span>Bu komut</span>
    <strong>{commandSentence(data, config)}</strong>
    <small>{commandRiskLabels[data.risk || 'normal']} · {approvalLabels[data.approval || 'none']}{perms.length ? ' · ' + perms.length + ' izin koşulu' : ''}</small>
   </div>
   <Sec title="Genel">
    <div className="insp-grid">
     <div className="field wide"><span>Tür<InfoTip label="Komut türü">Basit yazma: tek değeri yazar ve geri bildirimle doğrular. Script: if/else, bekleme ve birden çok yazma içeren kısa mantık; SCADA sunucusunda çalışır, durursa güvenli durumu yazar.</InfoTip></span>
      <div className="insp-seg" role="radiogroup" aria-label="Komut türü">
       <button type="button" role="radio" aria-checked={!script} className={!script ? 'active' : ''} onClick={() => setKind('write')}>Basit yazma</button>
       <button type="button" role="radio" aria-checked={script} className={script ? 'active' : ''} onClick={() => setKind('script')}><Code2 size={13} /> Script</button>
      </div>
     </div>
     <label className="field wide"><span>Komut adı</span><input value={data.name} maxLength={80} onChange={(e) => patch('name', e.target.value)} /></label>
     <label className="field wide"><span>Klasör<InfoTip label="Klasör">Komutlar sayfasında cihazın içindeki klasör. Yalnız düzen içindir; komutun çalışmasını etkilemez. Boş bırakılırsa "Klasörde olmayanlar"da durur.</InfoTip></span><input value={data.group || ''} maxLength={60} list="insp-cmd-groups" placeholder="Örn. Pompalar" onChange={(e) => patch('group', e.target.value)} /><datalist id="insp-cmd-groups">{[...new Set(config.commands.map((c) => (c.group || '').trim()).filter(Boolean))].map((g) => <option key={g} value={g} />)}</datalist></label>
     <label className="field wide"><span>Kapsam (operatöre gösterilir)<InfoTip label="Kapsam">Komutun sahada neyi etkilediği; onay penceresinde operatöre okunur. Örn. "Dolum hattı 2 · tüm hat durur".</InfoTip></span><input value={data.scope || ''} maxLength={120} placeholder="Örn. Dolum hattı 2 · tüm hat durur" onChange={(e) => patch('scope', e.target.value)} /></label>
    </div>
   </Sec>
   {script ? (
    <Sec title="Script" tip="Operatör düğmeye bastığında SCADA sunucusunda yukarıdan aşağı çalışır. Ekranda yalnız Aç / Kapat / Değer ayarla düğmesine bağlanır.">
     <ScriptEditor data={data} setData={setData} config={config} live={live} />
    </Sec>
   ) : (
   <Sec title="Adımlar" tip="Komut önce yazma hedefine değeri yazar, sonra geri bildirim etiketinde aynı değeri bekler. Süre içinde görülmezse sonuç 'Doğrulanamadı' olur. İki adımlı komutta ikinci yazma, birincinin doğrulanmasından sonra yapılır. Siemens S7 etiketleri yazma hedefi olamaz.">
    {data.tagIds.map((id: string, i: number) => { const fb = data.feedbackTagIds[i] || ''; const lw = liveOf(id), lf = fb ? liveOf(fb) : null; return (
     <div className="insp-step" key={i}>
      <span className="insp-step-no">{i + 1}</span>
      <div className="insp-step-body">
       <div className="field"><span>Yazma hedefi{lw && <em className={'insp-live-mini ' + lw.state}>{lw.text}</em>}</span><SearchSelect ariaLabel={'Yazma hedefi ' + (i + 1)} allowEmpty={false} value={id} options={writeOpts} onChange={(v) => setStep('tagIds', i, v)} /></div>
       <div className="field"><span>Doğrulama etiketi{lf && <em className={'insp-live-mini ' + lf.state}>{lf.text}</em>}</span><SearchSelect ariaLabel={'Geri bildirim ' + (i + 1)} emptyLabel="Geri okuma yok" value={fb} options={allOpts} onChange={(v) => setStep('feedbackTagIds', i, v)} /></div>
      </div>
     </div>
    ); })}
    <div className="insp-row">
     <button type="button" className="btn small" onClick={() => setData((d) => two ? { ...d, tagIds: d.tagIds.slice(0, 1), feedbackTagIds: d.feedbackTagIds.slice(0, 1) } : { ...d, tagIds: [...d.tagIds, writeOpts[0]?.value || ''], feedbackTagIds: [...d.feedbackTagIds, ''] })}>{two ? <><Trash2 size={13} />İkinci adımı kaldır</> : <><Plus size={13} />İkinci adım ekle</>}</button>
     <label className="field inline"><span>Doğrulama süresi</span><span className="insp-unit"><input type="number" min={2} max={30} step={0.5} value={data.timeoutMs / 1000} onChange={(e) => patch('timeoutMs', Math.round(Math.max(2, Math.min(30, Number(e.target.value) || 7)) * 1000))} /><em>sn</em></span></label>
    </div>
   </Sec>
   )}
   <Sec title="Güvenlik">
    <div className="field"><span>Risk sınıfı</span>
     <div className="insp-seg three" role="radiogroup" aria-label="Risk sınıfı">
      {Object.entries(commandRiskLabels).map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={(data.risk || 'normal') === k} className={((data.risk || 'normal') === k ? 'active ' : '') + 'risk-' + k} onClick={() => patch('risk', k)}>{l}</button>)}
     </div>
    </div>
    <div className="field"><span>Onay<InfoTip label="Onay">Özet: operatör neyin yazılacağını görüp onaylar. Gerekçe: denetim kaydına neden yazılır. İki kişi: ikinci bir yetkili onaylayana kadar komut sahaya gitmez.</InfoTip></span>
     <div className="insp-seg four" role="radiogroup" aria-label="Onay politikası">
      {Object.entries(approvalLabels).map(([k, l]) => <button type="button" key={k} role="radio" aria-checked={(data.approval || 'none') === k} className={(data.approval || 'none') === k ? 'active' : ''} onClick={() => patch('approval', k)}>{l}</button>)}
     </div>
    </div>
    <div className="insp-perm-head"><span>İzin koşulları · {perms.length}</span><button type="button" className="btn small" disabled={perms.length >= 6 || !boolOpts.length} onClick={() => patch('permissives', [...perms, { tagId: boolOpts[0]?.value || '', expected: true, label: '' }])}><Plus size={13} />Koşul ekle</button></div>
    {perms.map((p, i) => { const lv = liveOf(p.tagId); return (
     <div className="insp-perm" key={i}>
      <SearchSelect ariaLabel="İzin koşulu etiketi" allowEmpty={false} value={p.tagId} options={boolOpts} onChange={(v) => setPerm(i, { tagId: v })} />
      <select aria-label="Beklenen durum" value={String(p.expected)} onChange={(e) => setPerm(i, { expected: e.target.value === 'true' })}><option value="true">AÇIK olmalı</option><option value="false">KAPALI olmalı</option></select>
      <input placeholder="Açıklama (operatöre gösterilir)" maxLength={80} value={p.label} onChange={(e) => setPerm(i, { label: e.target.value })} />
      <span className={'insp-live-mini ' + (lv?.state || 'never')}>{lv?.text}</span>
      <button type="button" className="icon-btn" aria-label="Koşulu kaldır" onClick={() => patch('permissives', perms.filter((_, n) => n !== i))}><Trash2 size={13} /></button>
     </div>
    ); })}
    <p className="insp-hint">{!boolOpts.length ? 'İzin koşulu için önce dijital (bool) bir etiket tanımlayın. ' : ''}Koşul sağlanmazsa komut sunucuda reddedilir. Bu arayüzde ek bir kontroldür; fiziksel emniyet PLC / emniyet sisteminde kalır.</p>
   </Sec>
   {!fresh && (
    <Sec title="Son çalışmalar" right={<span className="insp-meta">{executions.length ? 'son ' + executions.length : 'henüz çalışmadı'}</span>}>
     {executions.length ? <ul className="insp-exec">{executions.map((e) => (
      <li key={e.id} className={e.kind === 'script' ? 'script-exec' : ''}><span className={'exec-dot ' + execTone(e.status)} /><div><strong>{commandStatusLabels[e.status] || e.status}</strong><small>{new Date(e.createdAt).toLocaleString('tr-TR')} · {e.user}{e.kind === 'script' ? '' : ' · değer ' + String(e.value)}{e.message ? ' · ' + e.message : ''}</small>
       {e.kind === 'script' && !!e.log?.length && <details className="script-log" open={e.status === 'running'}><summary>Çalışma kaydı · {e.log.length} satır</summary><ol>{e.log.slice(-40).map((l, i) => <li key={i}><time>{new Date(l.at).toLocaleTimeString('tr-TR')}</time>{l.text}</li>)}</ol></details>}
      </div>{e.status === 'running' && onStop && <button type="button" className="btn small danger" onClick={() => onStop(e.id)}><Square size={12} />Durdur</button>}</li>
     ))}</ul> : <p className="insp-hint">Bu komut henüz gönderilmedi.</p>}
    </Sec>
   )}
   {!fresh && (
    <Sec title="Kullanıldığı ekranlar" right={<span className="insp-meta">{screens.length ? screens.length + ' nesne' : 'kullanılmıyor'}</span>}>
     {screens.length ? <ul className="insp-usage">{screens.map((r, i) => <li key={i}><span className="insp-kind screen">Ekran</span><div><strong>{r.text}</strong></div><button type="button" className="link-btn" onClick={() => onScreen(r.id)}>Ekrana git<ArrowUpRight size={12} /></button></li>)}</ul> : <p className="insp-hint">Hiçbir ekran nesnesine bağlı değil; operatör bu komutu gönderemez.</p>}
    </Sec>
   )}
  </div>
 );
}
