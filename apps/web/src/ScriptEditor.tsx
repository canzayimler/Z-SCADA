/* Script komutu düzenleyicisi: kod alanı (satır numaralı), anlık denetim, örnekler,
   etiket ekleme, okunan/yazılan etiketler ve güvenli durum. Denetim sunucudakiyle aynı
   fonksiyondur (packages/contracts/script.ts); burada yalnız erken gösterilir. */
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, ChevronDown, ShieldCheck, XCircle } from 'lucide-react';
import { scriptTagRefs, type Config, type Live } from '../../../packages/contracts/model';
import { checkScript, SCRIPT_FUNCTIONS, SCRIPT_LIMITS } from '../../../packages/contracts/script';
import { SearchSelect } from './SearchSelect';
import { InfoTip } from './InfoTip';
import { sampleText } from './cfgModel';

export const SCRIPT_EXAMPLES: { title: string; hint: string; code: string }[] = [
 { title: '5 sn yak, sonra kapat', hint: 'Düğmeye basınca çıkış 5 sn açık kalır.', code: '// Çıkışı 5 saniye aç, sonra kapat\npulse("Y0", 5000);\n' },
 { title: 'Sinyal 5 sn sürerse sonraki kontağı tetikle', hint: 'X0 5 sn kesintisiz gelirse Y1 1 sn darbe.', code: '// X0 sinyali 5 sn boyunca kesintisiz gelirse Y1\'i 1 sn tetikle\nif (holdFor(read("X0"), 5000)) {\n  pulse("Y1", 1000);\n  log("X0 5 sn sürdü, Y1 tetiklendi");\n} else {\n  log("X0 5 sn dolmadan düştü");\n}\n' },
 { title: 'Başlat, onay bekle, gelmezse durdur', hint: 'Motoru aç, 10 sn içinde çalışıyor sinyali gelmezse güvenli duruma geç.', code: '// Motoru başlat, 10 sn içinde geri bildirim gelmezse dur\nwrite("Y0", 1);\nif (!waitUntil(read("X1"), 10000)) {\n  stop("Motor 10 sn içinde çalışmadı");\n}\nlog("Motor çalışıyor");\n' },
 { title: 'Koşula göre farklı çıkış', hint: 'if / else ile iki yol.', code: '// Seviye düşükse pompa, yüksekse vana\nif (read("D100") < 200) {\n  write("Y0", 1);\n} else {\n  write("Y1", 1);\n}\n' },
 { title: 'Sayaçlı tekrar', hint: '3 kez 1 sn aç / 1 sn kapat.', code: '// 3 kez 1 sn aç, 1 sn kapat\nint i = 0;\nwhile (i < 3) {\n  pulse("Y0", 1000);\n  wait(1000);\n  i += 1;\n}\n' },
];

type Props = { data: any; setData: (fn: (d: any) => any) => void; config: Config; live: Live };

/** Script değişince yazma hedeflerini ve güvenli durumu senkronlar (dijital hedefe varsayılan 0). */
export function syncScript(d: any, config: Config) {
 const chk = checkScript(d.script || '', scriptTagRefs(config), config.devices);
 if (!chk.ok) return d;
 const prev = (d.safeWrites || []) as { tagId: string; value: boolean | number }[];
 const safeWrites = chk.writes.flatMap((id) => { const p = prev.find((s) => s.tagId === id); if (p) return [p]; return config.tags.find((t) => t.id === id)?.dataType === 'bool' ? [{ tagId: id, value: false }] : []; });
 return { ...d, tagIds: chk.writes, feedbackTagIds: [], safeWrites };
}

export function ScriptEditor({ data, setData, config, live }: Props) {
 const ta = useRef<HTMLTextAreaElement>(null);
 const gutter = useRef<HTMLDivElement>(null);
 const [examples, setExamples] = useState(false);
 const src: string = data.script || '';
 const chk = useMemo(() => checkScript(src, scriptTagRefs(config), config.devices), [src, config]);
 const lines = src.split('\n').length;
 const errLines = new Set(chk.errors.map((e) => e.line));
 const setSrc = (v: string) => setData((d) => syncScript({ ...d, script: v }, config));
 const insert = (text: string) => {
  const el = ta.current; if (!el) { setSrc(src + text); return; }
  const a = el.selectionStart, b = el.selectionEnd, next = src.slice(0, a) + text + src.slice(b);
  setSrc(next);
  requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + text.length; });
 };
 const jump = (line: number, col: number) => {
  const el = ta.current; if (!el) return;
  const at = src.split('\n').slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + col - 1;
  el.focus(); el.selectionStart = el.selectionEnd = at;
 };
 // Kodda kullanılacak etiket adı: projede tekse "Y0", değilse "CIHAZ.Y0".
 const tagName = (id: string) => { const t = config.tags.find((x) => x.id === id)!; const dup = config.tags.filter((x) => x.code === t.code).length > 1; return dup ? (config.devices.find((d) => d.id === t.deviceId)?.code || '') + '.' + t.code : t.code; };
 const liveOf = (id: string) => { const t = config.tags.find((x) => x.id === id); return t ? sampleText(t, live.samples[id]) : null; };
 const chip = (id: string) => { const lv = liveOf(id); return <span key={id} className="script-tag"><b className="mono">{tagName(id)}</b>{lv && <em className={'insp-live-mini ' + lv.state}>{lv.text}</em>}</span>; };
 const safe = (data.safeWrites || []) as { tagId: string; value: boolean | number }[];
 const setSafe = (tagId: string, value: boolean | number | null) => setData((d) => ({ ...d, safeWrites: value === null ? (d.safeWrites || []).filter((s: any) => s.tagId !== tagId) : [...(d.safeWrites || []).filter((s: any) => s.tagId !== tagId), { tagId, value }] }));
 return (
  <div className="script-ed">
   <div className="script-tools">
    <span className="cfg-menu-wrap">
     <button type="button" className="btn small" aria-haspopup="menu" aria-expanded={examples} onClick={() => setExamples(!examples)}><BookOpen size={13} />Örnekler<ChevronDown size={13} /></button>
     {examples && (
      <>
       <div className="cfg-menu-backdrop" onClick={() => setExamples(false)} />
       <div className="cfg-menu left" role="menu">
        {SCRIPT_EXAMPLES.map((x) => <button type="button" role="menuitem" key={x.title} onClick={() => { setExamples(false); setSrc(src.trim() ? src.replace(/\s*$/, '\n\n') + x.code : x.code); }}><span>{x.title}<small>{x.hint}</small></span></button>)}
       </div>
      </>
     )}
    </span>
    <div className="script-insert"><SearchSelect ariaLabel="Etiket ekle" placeholder="Etiket ekle…" emptyLabel="Etiket ekle…" value="" options={config.tags.map((t) => ({ value: t.id, label: tagName(t.id) + ' — ' + t.name, hint: t.access === 'readwrite' ? 'oku/yaz' : 'okuma' }))} onChange={(id) => { if (id) insert('"' + tagName(id) + '"'); }} /></div>
    <InfoTip label="Script dili">
     <span className="script-help">
      C benzeri: <code>if / else</code>, <code>while</code>, <code>int x = 0;</code>, <code>x += 1;</code>, <code>&& || !</code>, <code>== != &lt; &gt;</code>. Süreler milisaniye (5000 = 5 sn). <code>input</code>: düğmenin gönderdiği değer.
      {Object.entries(SCRIPT_FUNCTIONS).filter(([, f]) => f.help.includes('—')).map(([k, f]) => <span key={k} className="script-help-row"><code>{f.help.split(' — ')[0]}</code> {f.help.split(' — ')[1]}</span>)}
     </span>
    </InfoTip>
   </div>
   <div className={'script-code' + (chk.errors.length ? ' has-error' : '')}>
    <div className="script-gutter" ref={gutter} aria-hidden="true">{Array.from({ length: Math.max(lines, 8) }, (_, i) => <span key={i} className={errLines.has(i + 1) ? 'err' : ''}>{i + 1}</span>)}</div>
    <textarea ref={ta} className="mono" spellCheck={false} value={src} rows={Math.min(22, Math.max(8, lines + 1))} aria-label="Script" aria-invalid={chk.errors.length > 0}
     placeholder={'// Örnek: X0 5 sn sürerse Y1\'i tetikle\nif (holdFor(read("X0"), 5000)) {\n  pulse("Y1", 1000);\n}'}
     onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
     onChange={(e) => setSrc(e.target.value)}
     onKeyDown={(e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); insert('  '); } }} />
   </div>
   <div className="script-status" aria-live="polite">
    {chk.errors.map((e, i) => <button type="button" key={'e' + i} className="script-msg bad" onClick={() => jump(e.line, e.col)}><XCircle size={13} /><b>Satır {e.line}</b>{e.message}</button>)}
    {chk.warnings.map((e, i) => <button type="button" key={'w' + i} className="script-msg warn" onClick={() => jump(e.line, e.col)}><AlertTriangle size={13} /><b>Satır {e.line}</b>{e.message}</button>)}
    {chk.ok && !chk.warnings.length && <span className="script-msg ok"><ShieldCheck size={13} />Sözdizimi ve etiketler geçerli.</span>}
   </div>
   {(chk.reads.length > 0 || chk.writes.length > 0) && (
    <div className="script-io">
     {chk.reads.length > 0 && <div><span>Okur</span>{chk.reads.map(chip)}</div>}
     {chk.writes.length > 0 && <div><span>Yazar</span>{chk.writes.map(chip)}</div>}
    </div>
   )}
   {chk.writes.length > 0 && (
    <div className="script-safe">
     <div className="insp-perm-head"><span>Güvenli durum<InfoTip label="Güvenli durum">Script hata verirse, durdurulursa, süre dolarsa, okunan veri bayatlarsa, haberleşme koparsa ya da izin koşulu kalkarsa bu değerler sırayla yazılır. Dijital her hedef için zorunlu. Ağ tamamen koparsa yazılamaz — emniyet PLC'de kalmalı.</InfoTip></span></div>
     <table><tbody>
      {chk.writes.map((id) => { const t = config.tags.find((x) => x.id === id)!, s = safe.find((x) => x.tagId === id); return (
       <tr key={id}><td className="mono">{tagName(id)}</td><td>
        {t.dataType === 'bool' ? (
         <div className="insp-seg">
          <button type="button" className={s && !s.value ? 'active' : ''} onClick={() => setSafe(id, false)}>0 · Kapat</button>
          <button type="button" className={s && s.value ? 'active' : ''} onClick={() => setSafe(id, true)}>1 · Aç</button>
         </div>
        ) : (
         <span className="script-safe-num">
          <label className="check"><input type="checkbox" checked={!!s} onChange={(e) => setSafe(id, e.target.checked ? 0 : null)} />Değer yaz</label>
          {s && <input type="number" value={Number(s.value)} aria-label={t.code + ' güvenli değer'} onChange={(e) => setSafe(id, Number(e.target.value) || 0)} />}
          {!s && <em className="muted">dokunulmaz</em>}
         </span>
        )}
       </td></tr>
      ); })}
     </tbody></table>
    </div>
   )}
   <div className="insp-row">
    <label className="field inline"><span>En uzun çalışma</span><span className="insp-unit"><input type="number" min={1} max={SCRIPT_LIMITS.maxRunMs / 1000} value={Math.round((data.maxRunMs ?? 60000) / 1000)} onChange={(e) => setData((d) => ({ ...d, maxRunMs: Math.round(Math.max(1, Math.min(SCRIPT_LIMITS.maxRunMs / 1000, Number(e.target.value) || 60)) * 1000) }))} /><em>sn</em></span></label>
    <label className="field inline"><span>Yazma onayı süresi<InfoTip label="Yazma onayı">Her write() için köprünün PLC yazma onayını bekleme süresi. Aşılırsa script hata ile durur.</InfoTip></span><span className="insp-unit"><input type="number" min={2} max={30} step={0.5} value={data.timeoutMs / 1000} onChange={(e) => setData((d) => ({ ...d, timeoutMs: Math.round(Math.max(2, Math.min(30, Number(e.target.value) || 7)) * 1000) }))} /><em>sn</em></span></label>
   </div>
  </div>
 );
}
