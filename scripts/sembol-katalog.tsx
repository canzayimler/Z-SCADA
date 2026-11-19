/**
 * Sembol kataloğu: kütüphanedeki her tür ve varyantı dört durumda (durdu / çalışıyor / arıza /
 * veri yok) gerçek Symbol bileşeniyle çizer, uygulamanın CSS'iyle tek bir HTML sayfasına yazar.
 * Çizim dili elden geçirilirken toplu görsel kontrol içindir; ekran görüntüsü için:
 *   npx tsx scripts/sembol-katalog.tsx [cikti.html] [--grup elektrik] [--koyu] [--stil classic|isa101|detailed]
 *   msedge --headless --screenshot=katalog.png --window-size=1600,4000 file:///.../cikti.html
 * --stil: Klasik (varsayılan), ISA-101 (nesne renkleri griye, isa.ts) ya da Detaylı (metal kaplama;
 * tuvaldeki gibi tek gizli <defs> + .sym-detailed sınıfı).
 * Arıza: türün bool arıza/trip/sıkışma bağı varsa o bağ "true" okunur (faz = ARIZA/TRİP), yoksa
 * okuma hatası (kalite bad, kırmızı yanıp sönen !). Veri yok: etiket bağlı, değer bayat (sarı ?).
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Symbol} from '../packages/symbols/Symbol';
import {SymbolDefs} from '../packages/symbols/defs';
import {styledWidget,type SymbolStyle} from '../packages/symbols/isa';
import {bindingDefs,panelSpec} from '../packages/symbols/catalog';
import {newWidget,symbolTypes,labels,symbolGroups,variantsOf,type Widget} from '../packages/contracts/model';

const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
const flagged=new Set<number>();args.forEach((a,i)=>{if(a==='--grup'||a==='--stil')flagged.add(i+1);});
const out=path.resolve(args.find((a,i)=>!a.startsWith('--')&&!flagged.has(i))||'sembol-katalog.html');
const opt=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:'';};
const grup=opt('--grup');
const stil=(opt('--stil')||'classic') as SymbolStyle;
const dark=args.includes('--koyu');
const css=['apps/web/src/style.css','apps/web/src/motion.css'].map(f=>fs.readFileSync(path.join(here,'..',f),'utf8')).join('\n');

const groupOf=new Map<string,string>();
for(const g of symbolGroups as readonly {title?:string;name?:string;label?:string;types:readonly string[]}[])for(const t of g.types)groupOf.set(t,g.title||g.name||g.label||'');

type Reading={value:boolean|number|null;quality:string};
type State={name:string;make:(w:Widget)=>{w:Widget;value:unknown;quality:string;samples:Record<string,Reading>}};
const numeric=(w:Widget)=>panelSpec(w.type).scale;
const states:State[]=[
 {name:'durdu / düşük',make:w=>({w:{...w,tagId:'t1'},value:numeric(w)?w.min+(w.max-w.min)*0.15:false,quality:'good',samples:{}})},
 {name:'çalışıyor / orta',make:w=>({w:{...w,tagId:'t1'},value:numeric(w)?w.min+(w.max-w.min)*0.6:true,quality:'good',samples:{}})},
 {name:'arıza',make:w=>{
  const role=bindingDefs(w.type).find(b=>b.kind==='bool'&&['fault','trip','jam'].includes(b.role));
  if(role)return {w:{...w,tagId:'t1',bindings:[{role:role.role,tagId:'flt',invert:false}]} as Widget,value:true,quality:'good',samples:{flt:{value:true,quality:'good'}}};
  return {w:{...w,tagId:'t1'},value:null,quality:'bad',samples:{}};
 }},
 {name:'veri yok',make:w=>({w:{...w,tagId:'t1'},value:null,quality:'unknown',samples:{}})},
];
function draw(w:Widget,s:State){
 const m=s.make(w);
 try{return renderToStaticMarkup(createElement(Symbol,{w:styledWidget({...m.w,animated:true},stil,dark?'dark':'light'),value:m.value as any,quality:m.quality,samples:m.samples}));}
 catch(e){return '<div class="kat-err">'+String((e as Error).message).replace(/</g,'&lt;')+'</div>';}
}
const cards:string[]=[];
for(const type of symbolTypes){
 const g=groupOf.get(type)||'';
 if(grup&&!g.toLocaleLowerCase('tr').includes(grup.toLocaleLowerCase('tr'))&&type!==grup)continue;
 const variants=variantsOf(type);
 for(const v of variants.length?variants:[{key:'',label:''}] as any[]){
  const w={...newWidget(type as Widget['type']),variant:v.key,labelVisible:false} as Widget;
  const cells=states.map(s=>`<figure><div class="kat-sym">${draw(w,s)}</div><figcaption>${s.name}</figcaption></figure>`).join('');
  cards.push(`<section class="kat-card"><header><b>${labels[type as keyof typeof labels]||type}</b>${v.label?' · '+v.label:''}<small>${type}${v.key?' / '+v.key:''} · ${g}</small></header><div class="kat-row">${cells}</div></section>`);
 }
}
const stilAd={classic:'Klasik',isa101:'ISA-101',detailed:'Detaylı'}[stil]||stil;
const html=`<!doctype html><html lang="tr"${dark?' data-theme="dark"':''}><head><meta charset="utf-8"><title>Sembol kataloğu</title><style>${css}
body{padding:16px;background:var(--app)}
.kat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px}
.kat-card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px}
.kat-card header{font-size:12px;color:var(--txt);display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
.kat-card header small{color:var(--txt-muted);font-size:10px;margin-left:auto}
.kat-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:6px}
.kat-row figure{margin:0;text-align:center}
.kat-sym{height:84px;background:var(--sunken);border-radius:6px;padding:4px}
.kat-row figcaption{font-size:10px;color:var(--txt-muted)}
.kat-err{color:var(--danger);font-size:10px}
</style></head><body>${renderToStaticMarkup(createElement(SymbolDefs))}<h1 style="font-size:15px;color:var(--txt)">Sembol kataloğu · ${cards.length} çizim · ${stilAd}${dark?' · koyu':''}${grup?' · '+grup:''}</h1><div class="kat-grid${stil==='detailed'?' sym-detailed':''}">${cards.join('')}</div></body></html>`;
fs.writeFileSync(out,html);
console.log(out,cards.length+' kart');
