/**
 * packages/symbols/content.ts çerçeve kutularına karşı çizimleri ölçer (tests/frame-fit.test.ts ile aynı yöntem).
 *   npx tsx scripts/sembol-sinirlari.ts      (her tür/varyant: kutuya sığıyor mu, kenar boşlukları)
 *
 * 2026-11-18: tablo artık çizimden YENİDEN YAZILMAZ. 'trim'/'fill' modundaki nesnelerin görüntü kutusu
 * ve dolayısıyla ekrandaki boru ağızları bu kutudan hesaplanır; kutu değişirse kayıtlı ekranlarda
 * boru bağlantıları kayar. Çizim kutuya sığdırılır; kutu yalnız YENİ tür eklenirken elle yazılır.
 */
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Symbol} from '../packages/symbols/Symbol';
import {contentBoxes} from '../packages/symbols/content';
import {markupBounds,boxFrom,mergeBounds,type Box} from '../packages/symbols/bounds';
import {variantsOf} from '../packages/symbols/catalog';
import {newWidget,type Widget} from '../packages/contracts/model';

const draw=(w:Widget,value:boolean|number|null,quality:string)=>renderToStaticMarkup(createElement(Symbol,{w,value,quality,samples:{}} as any));
function measure(type:string,variant:string){
 let box:Box|null=null;
 for(const [value,quality] of [[true,'good'],[62,'good'],[false,'good'],[null,'unknown']] as const){
  const w={...newWidget(type as Widget['type']),variant,labelVisible:false,label:''} as Widget;
  box=mergeBounds(box,markupBounds(draw(w,value,quality)));
 }
 return boxFrom(box);
}
let over=0;
for(const [type,stored] of Object.entries(contentBoxes)){
 const vs=variantsOf(type).map(v=>v.key);
 for(const v of vs.length?vs:['']){
  const m=measure(type,v),s=stored!;
  if(!m){console.log('ÖLÇÜLEMEDİ '+type+'/'+v);over++;continue;}
  const gaps=[m[0]-s[0],m[1]-s[1],s[0]+s[2]-m[0]-m[2],s[1]+s[3]-m[1]-m[3]];
  const bad=gaps.some(g=>g<0);if(bad)over++;
  console.log((bad?'TAŞMA ':'ok    ')+type+(v?'/'+v:'')+'  kutu ['+s.join(',')+'] ölçüm ['+m.join(',')+'] boşluk (sol,üst,sağ,alt) '+gaps.join(','));
 }
}
console.log(over?'\n'+over+' çizim kutudan taşıyor':'\nhepsi kutuda');
process.exitCode=over?1:0;
