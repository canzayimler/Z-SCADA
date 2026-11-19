/* OPC UA adres uzayı gezgini: ağaçtan bir değişken seçilince nodeId ve etiket tipi döner.
   Düğümler açıldıkça yüklenir (sunucu: opcuaBrowse.ts, salt okuma). */
import { useEffect, useState } from 'react';
import { ChevronRight, Folder, Tag as TagIcon, X } from 'lucide-react';
import { api } from './api';

type Item = { nodeId: string; name: string; nodeClass: 'Object' | 'Variable' | 'Method' | 'Other'; dataType: string | null; tagType: string | null; hasChildren: boolean };
type Props = { connectionId: string; onPick: (v: { nodeId: string; tagType: string | null; name: string }) => void; onClose: () => void };

export function OpcBrowser({ connectionId, onPick, onClose }: Props) {
 const [children, setChildren] = useState<Record<string, Item[] | 'loading' | { error: string }>>({});
 const [open, setOpen] = useState<Set<string>>(new Set(['ObjectsFolder']));
 async function load(nodeId: string) {
  setChildren((c) => ({ ...c, [nodeId]: 'loading' }));
  try { const r = await api<{ items: Item[] }>('/opcua/browse', 'POST', { connectionId, nodeId }, 30000); setChildren((c) => ({ ...c, [nodeId]: r.items })); }
  catch (e) { setChildren((c) => ({ ...c, [nodeId]: { error: (e as Error).message } })); }
 }
 useEffect(() => { void load('ObjectsFolder'); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
 function toggle(id: string) {
  setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else { n.add(id); if (!children[id]) void load(id); } return n; });
 }
 function branch(id: string, depth: number): React.ReactNode {
  const c = children[id];
  if (c === undefined || c === 'loading') return <div className="opc-note" style={{ paddingLeft: depth * 16 + 8 }}>Yükleniyor…</div>;
  if ('error' in c) return <div className="opc-note field-error" style={{ paddingLeft: depth * 16 + 8 }}>{c.error}</div>;
  if (!c.length) return <div className="opc-note muted" style={{ paddingLeft: depth * 16 + 8 }}>Boş</div>;
  return c.map((it) => it.nodeClass === 'Variable' ? (
   <button key={it.nodeId} type="button" className={'opc-row var' + (it.tagType ? '' : ' unsupported')} style={{ paddingLeft: depth * 16 + 24 }} disabled={!it.tagType}
    title={it.tagType ? it.nodeId : 'Bu veri tipi desteklenmiyor: ' + (it.dataType || '?')} onClick={() => onPick({ nodeId: it.nodeId, tagType: it.tagType, name: it.name })}>
    <TagIcon size={13} /><span>{it.name}</span><small className="mono">{it.dataType || '?'}{it.tagType ? ' → ' + it.tagType : ' · desteklenmiyor'}</small>
   </button>
  ) : (
   <div key={it.nodeId}>
    <button type="button" className="opc-row obj" style={{ paddingLeft: depth * 16 + 8 }} aria-expanded={open.has(it.nodeId)} onClick={() => toggle(it.nodeId)}>
     <ChevronRight size={13} className={open.has(it.nodeId) ? 'open' : ''} /><Folder size={13} /><span>{it.name}</span>
    </button>
    {open.has(it.nodeId) && branch(it.nodeId, depth + 1)}
   </div>
  ));
 }
 return (
  <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
   <div className="modal opc-modal" role="dialog" aria-modal="true" aria-label="OPC UA değişken seç">
    <div className="modal-heading"><h2>OPC UA değişken seç</h2><button className="tool" aria-label="Kapat" onClick={onClose}><X size={16} /></button></div>
    <p className="small muted">Klasörleri açıp değişkene tıklayın; node kimliği ve veri tipi etikete yazılır. Sunucu salt okunur gezilir.</p>
    <div className="opc-tree">{branch('ObjectsFolder', 0)}</div>
    <div className="modal-actions"><button className="btn" onClick={onClose}>Vazgeç</button></div>
   </div>
  </div>
 );
}
