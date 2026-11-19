/**
 * Ekranin SVG olarak disa aktarimi (K11).
 *
 * Kaynak, yeniden cizim DEGIL, ekranda o an gorunen DOM'dur: boylece
 * varyant, faz, kalite ve dinamik sunum ne gorunuyorsa dosyaya o gider.
 * Yeniden cizmek, cizim mantiginin ikinci bir kopyasini yasatmak olurdu ve
 * iki kopya er ya da gec ayrisirdi.
 *
 * Iki durustluk kurali:
 *  1. CSS degiskenleri (var(--sym-line) gibi) hesaplanmis degerleriyle
 *     gomulur; yoksa dosya baska bir yerde acildiginda renksiz kalir.
 *  2. HTML tabanli nesneler (trend, alarm listesi, buton, deger...) SVG'ye
 *     birebir cevrilemez. Bunlar uydurma bir cizimle DEGIL, adiyla birlikte
 *     bos bir cerceve olarak yazilir ve cagirana kac tanesinin boyle
 *     aktarildigi bildirilir — sessizce eksik dosya verilmez.
 */
export type SvgExport={svg:string;drawn:number;placeholders:string[]};
const varPattern=/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^)]*)?\)/g;
/** Kullanilan tum CSS degiskenlerini hesaplanmis degerleriyle degistirir. */
function resolveVars(markup:string,probe:Element):string{
 const style=getComputedStyle(probe);
 const cache=new Map<string,string>();
 return markup.replace(varPattern,(whole,name:string)=>{
  if(!cache.has(name)){
   const value=style.getPropertyValue(name).trim();
   cache.set(name,value||'none');
  }
  return cache.get(name)||whole;
 });
}
function escapeText(text:string){
 return text.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as Record<string,string>)[c]);
}
/**
 * Tuvaldeki nesneleri tek bir SVG belgesine toplar.
 * `canvas` ekranin `.canvas` elemani, `size` ekran olcusudur.
 */
export function exportScreenSvg(canvas:HTMLElement,size:{width:number;height:number},background:string):SvgExport{
 const parts:string[]=[];
 const placeholders:string[]=[];
 let drawn=0;
 const serializer=new XMLSerializer();
 for(const node of Array.from(canvas.querySelectorAll('.canvas-widget')) as HTMLElement[]){
  const left=parseFloat(node.style.left||'0'),top=parseFloat(node.style.top||'0');
  const width=parseFloat(node.style.width||'0'),height=parseFloat(node.style.height||'0');
  const label=node.getAttribute('aria-label')||'';
  const rotation=/rotate\((-?[\d.]+)deg\)/.exec(node.style.transform||'')?.[1]||'0';
  const opacity=node.style.opacity||'1';
  const open=`<g transform="translate(${left} ${top}) rotate(${rotation} ${width/2} ${height/2})" opacity="${opacity}">`;
  const drawing=node.querySelector('svg.scada-symbol');
  if(drawing){
   const clone=drawing.cloneNode(true) as SVGElement;
   clone.setAttribute('width',String(width));
   clone.setAttribute('height',String(height));
   clone.removeAttribute('class');
   parts.push(open+serializer.serializeToString(clone)+'</g>');
   drawn++;
   continue;
  }
  // HTML tabanli nesne: birebir cevrilemez, uydurulmaz.
  placeholders.push(label||'(adsız nesne)');
  parts.push(open+
   `<rect x="0" y="0" width="${width}" height="${height}" rx="6" fill="none" stroke="#8a9ca9" stroke-width="1" stroke-dasharray="6 4"/>`+
   `<text x="8" y="18" font-size="11" fill="#8a9ca9">${escapeText(label)}</text>`+
   '</g>');
 }
 const body=resolveVars(parts.join(''),canvas);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">`+
  `<rect width="${size.width}" height="${size.height}" fill="${background||'#ffffff'}"/>`+body+'</svg>';
 return {svg,drawn,placeholders};
}
