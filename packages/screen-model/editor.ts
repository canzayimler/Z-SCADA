import {conditionTags,newWidget,writesCommand,type Config,type Screen,type Widget} from '../contracts/model';

/** Mutating editor tools share the same lock semantics. */
export function patchSelection(widgets:Widget[],ids:string[],patch:Partial<Widget>):Widget[]{
 const set=new Set(ids);
 return widgets.map(w=>set.has(w.id)&&!w.locked?{...w,...patch}:w);
}
/** Sürüklenen nesnelerin gerçek yer değiştirmesini kalıcı bağlantılı komşulara yansıtır (B25).
 * Anlam moveWithLinks'i her sürüklenen nesne için sırayla uygulamakla aynıdır (zincir kilitli
 * nesnede durur, her komşu bir BFS'te en fazla bir kez taşınır, sürüklenenler tekrar taşınmaz);
 * ama komşuluk bir kez kurulur ve konumlar id->kayma haritasında toplanır. Eskisi her sürüklenen
 * nesne için tüm listeyi find ile tarıyordu: 600 nesnede O(k·n²), sürükleme kare başına saniyeler. */
export function withLinkedNeighbors(base:Screen,orig:Widget[],moved:Widget[]):Screen{
 const links=base.links||[];if(!links.length||!orig.length)return base;
 const draggedIds=new Set(orig.map(w=>w.id)),movedById=new Map(moved.map(w=>[w.id,w]));
 const byId=new Map(base.widgets.map(w=>[w.id,w]));
 const adj=new Map<string,string[]>();
 const edge=(a:string,b:string)=>{let l=adj.get(a);if(!l)adj.set(a,l=[]);l.push(b);};
 for(const l of links){edge(l.fromWidgetId,l.toWidgetId);edge(l.toWidgetId,l.fromWidgetId);}
 const shift=new Map<string,{dx:number;dy:number}>();
 for(const o of orig){
  const m=movedById.get(o.id);if(!m)continue;
  const ddx=m.x-o.x,ddy=m.y-o.y;if(!ddx&&!ddy)continue;
  const start=byId.get(o.id);if(!start||start.locked)continue;
  const visited=new Set<string>([o.id]),queue=[o.id];
  for(let qi=0;qi<queue.length;qi++){
   for(const otherId of adj.get(queue[qi])||[]){
    if(visited.has(otherId))continue;visited.add(otherId);
    const other=byId.get(otherId);if(!other||other.locked)continue;
    queue.push(otherId);
    if(!draggedIds.has(otherId)){const s=shift.get(otherId);if(s){s.dx+=ddx;s.dy+=ddy;}else shift.set(otherId,{dx:ddx,dy:ddy});}
   }
  }
 }
 if(!shift.size)return base;
 return {...base,widgets:base.widgets.map(w=>{const s=shift.get(w.id);return s?{...w,x:w.x+s.dx,y:w.y+s.dy}:w;})};
}
export function matchSize(widgets:Widget[],ids:string[],axis:'width'|'height'|'both'):Widget[]{
 const first=widgets.find(w=>w.id===ids[0]);if(!first)return widgets;
 return patchSelection(widgets,ids,{...(axis!=='height'?{width:first.width}:{}),...(axis!=='width'?{height:first.height}:{})});
}
export const equipmentTemplates=[
 {id:'motor-control',name:'Motor kontrolü',description:'Motor, durum lambası ve aç/kapat butonları',symbol:'motor'},
 {id:'pump-line',name:'Pompa hattı',description:'Pompa, borular, vana ve durum göstergesi',symbol:'pump'},
 {id:'tank-station',name:'Tank istasyonu',description:'Tank, seviye değeri ve çıkış vanası',symbol:'tank'}
] as const;
export function createEquipment(template:string,x:number,y:number):Widget[]{
 const groupId=crypto.randomUUID();let parts:Widget[]=[];
 const item=(type:Widget['type'],dx:number,dy:number,props:Partial<Widget>={})=>({...newWidget(type,x+dx,y+dy),groupId,...props});
 if(template==='motor-control')parts=[item('motor',20,0,{label:'Motor'}),item('indicator',170,10,{label:'Çalışma durumu'}),item('button',0,145,{label:'Çalıştır',action:'on'}),item('button',150,145,{label:'Durdur',action:'off'})];
 if(template==='pump-line')parts=[item('pipe',0,35,{width:90}),item('pipe',205,35,{width:115}),item('pipe',410,35,{width:110}),item('pump',85,15,{label:'Pompa'}),item('valve',310,15,{label:'Vana'}),item('indicator',205,110,{label:'Çalışma durumu'})];
 if(template==='tank-station')parts=[item('tank',10,0,{width:160,height:180,label:'Tank'}),item('value',200,20,{label:'Seviye',width:130,height:90,unit:'%'}),item('pipe',145,130,{width:100}),item('valve',235,110,{label:'Çıkış vanası'})];
 return parts;
}
/** Çoklu seçimde ortak alan: tüm seçili nesnelerde aynıysa değeri, değilse undefined ("karışık"). */
export function commonValue<K extends keyof Widget>(widgets:Widget[],key:K):Widget[K]|undefined{
 if(!widgets.length)return undefined;
 const first=widgets[0][key];
 return widgets.every(w=>w[key]===first)?first:undefined;
}
/** Çoklu seçimi bir bütün olarak taşır: seçimin sol (x) ya da üst (y) kenarı value olur,
 * nesneler arası düzen korunur. Kilitli nesneler yerinde kalır ve hesaba katılmaz. */
export function moveSelectionTo(widgets:Widget[],ids:string[],axis:'x'|'y',value:number):Widget[]{
 const set=new Set(ids),movable=widgets.filter(w=>set.has(w.id)&&!w.locked);
 if(!movable.length||!Number.isFinite(value))return widgets;
 const delta=Math.round(value)-Math.min(...movable.map(w=>w[axis]));
 if(!delta)return widgets;
 return widgets.map(w=>set.has(w.id)&&!w.locked?{...w,[axis]:w[axis]+delta}:w);
}
export type ArrangeKind='left'|'center'|'right'|'top'|'middle'|'bottom'|'space'|'space-v';
/** Hizala / eşit aralık. Kilitli nesneler yerinde kalır. Üst üste binen nesnelerde aralık
 * negatif çıkıyordu (nesneler geriye, tuval dışına kayabiliyordu): aralık en az 0'dır, sıra
 * tuvale sığmıyorsa başlangıç sola/yukarı çekilir ve her nesne tuval sınırına kıstırılır. */
export function arrangeWidgets(widgets:Widget[],ids:string[],kind:ArrangeKind,canvas:{width:number;height:number}):Widget[]{
 const set=new Set(ids),ws=widgets.filter(w=>set.has(w.id)&&!w.locked);if(ws.length<2)return widgets;
 const x=Math.min(...ws.map(w=>w.x)),right=Math.max(...ws.map(w=>w.x+w.width)),y=Math.min(...ws.map(w=>w.y)),bottom=Math.max(...ws.map(w=>w.y+w.height));
 const px=new Map<string,number>(),py=new Map<string,number>();
 if(kind==='space'||kind==='space-v'){
  const horizontal=kind==='space',sorted=[...ws].sort((a,b)=>horizontal?a.x-b.x:a.y-b.y);
  const size=(w:Widget)=>horizontal?w.width:w.height;
  const span=horizontal?right-x:bottom-y,used=ws.reduce((t,w)=>t+size(w),0),gap=Math.max(0,(span-used)/(ws.length-1));
  const row=used+gap*(ws.length-1),limit=horizontal?canvas.width:canvas.height;
  let position=Math.max(0,Math.min(horizontal?x:y,limit-row));
  for(const w of sorted){(horizontal?px:py).set(w.id,position);position+=size(w)+gap;}
 }else for(const w of ws){
  if(kind==='left')px.set(w.id,x);else if(kind==='right')px.set(w.id,right-w.width);else if(kind==='center')px.set(w.id,(x+right-w.width)/2);
  else if(kind==='top')py.set(w.id,y);else if(kind==='bottom')py.set(w.id,bottom-w.height);else if(kind==='middle')py.set(w.id,(y+bottom-w.height)/2);
 }
 const clamp=(v:number,size:number,limit:number)=>Math.max(0,Math.min(Math.round(v),Math.max(0,limit-size)));
 return widgets.map(w=>px.has(w.id)||py.has(w.id)?{...w,x:clamp(px.get(w.id)??w.x,w.width,canvas.width),y:clamp(py.get(w.id)??w.y,w.height,canvas.height)}:w);
}

export type BindingStatus={state:'bound'|'unbound'|'broken'|'passive';label:string};
const PASSIVE_LAYER_TYPES=new Set<Widget['type']>(['pipe','elbow','tee','cross','reducer','flange','duct','text','rectangle','section','ellipse','polygon','star','line','arrow','callout','image','backdrop']);
const COMMAND_REQUIRED_TYPES=new Set<Widget['type']>(['numeric-input','slider','keypad','pid']);

/** Katman satiri icin nesnenin etiket/komut bag durumunu siniflandirir (Faz 2). */
export function widgetBindingStatus(w:Widget,config:Config,validScreenIds?:ReadonlySet<string>):BindingStatus{
 const tagSet=new Set(config.tags.map(t=>t.id));
 const cmdSet=new Set(config.commands.map(c=>c.id));
 const tagRefs=[
  w.tagId,
  w.setpointTagId,
  w.visibleTagId,
  ...w.parts.map(p=>p.tagId),
  ...(w.bindings||[]).map(b=>b.tagId),
  ...w.details.filter(d=>d.kind==='value').map(d=>d.tagId),
  ...(w.visibleCondition?conditionTags(w.visibleCondition):[])
 ].filter(Boolean);
 const cmdRefs=[
  w.commandId,
  ...w.details.filter(d=>d.kind==='command').map(d=>d.commandId)
 ].filter(Boolean);

 if(tagRefs.some(id=>!tagSet.has(id))||cmdRefs.some(id=>!cmdSet.has(id))||(w.type==='navigation'&&w.targetScreenId&&validScreenIds&&!validScreenIds.has(w.targetScreenId))){
  return {state:'broken',label:'Kopuk bağ: silinmiş etiket, komut veya ekran'};
 }
 if(w.type==='navigation'){
  return w.targetScreenId?{state:'bound',label:'Hedef ekran bağlı'}:{state:'unbound',label:'Hedef ekran seçilmedi'};
 }
 if(w.type==='alarm-band'||w.type==='alarm-list'){
  return {state:'bound',label:'Alarm akışına bağlı'};
 }
 if((writesCommand(w)||COMMAND_REQUIRED_TYPES.has(w.type))&&!w.commandId){
  return {state:'unbound',label:'Yazma komutu bağlı değil'};
 }
 if(tagRefs.length>0||cmdRefs.length>0){
  return {state:'bound',label:'Veri bağı tanımlı'};
 }
 if(PASSIVE_LAYER_TYPES.has(w.type)){
  return {state:'passive',label:'Statik çizim nesnesi'};
 }
 return {state:'unbound',label:'Etiket bağlı değil'};
}
