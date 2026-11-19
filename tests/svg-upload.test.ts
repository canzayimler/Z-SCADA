import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectSvg} from '../apps/server/src/svg';
/* K01: SVG bir belgedir. Denetim TEMIZLEMEZ, REDDEDER — yeniden yazma
 * girisimi ayristirici farklarindan atlatilabilir, reddetme atlatilamaz. */
const wrap=(inner:string)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`;
const ok=(svg:string,what:string)=>assert.equal(inspectSvg(svg).ok,true,what+' reddedildi');
const bad=(svg:string,what:string)=>{const v=inspectSvg(svg);assert.equal(v.ok,false,what+' kabul edildi');assert.ok(!v.ok&&v.reason.length>0,what+': gerekce yok');};
test('valid drawings are accepted',()=>{
 ok(wrap('<rect x="1" y="1" width="8" height="8" fill="#208169"/>'),'basit dikdortgen');
 ok(wrap('<defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/>'),'belge ici referans');
 ok(wrap('<path d="M0 0L10 10" stroke="red"/><text>ok</text>'),'yol ve metin');
 ok('<?xml version="1.0"?>'+wrap('<circle r="4"/>'),'xml bildirimi');
});
test('script carrying documents are rejected',()=>{
 bad(wrap('<script>alert(1)</script>'),'betik');
 bad(wrap('<foreignObject><body/></foreignObject>'),'yabanci icerik');
 bad(wrap('<iframe src="#"/>'),'cerceve');
 bad(wrap('<rect onload="alert(1)" width="10" height="10"/>'),'onload');
 bad(wrap('<rect onclick="x()" width="10" height="10"/>'),'onclick');
 bad(wrap('<a href="javascript:alert(1)">x</a>'),'javascript adresi');
 bad(wrap('<a href="data:text/html,<script>1</script>">x</a>'),'html veri adresi');
});
test('comments cannot hide forbidden content',()=>{
 bad('<svg><!-- yorum --><script>alert(1)</script></svg>','yorumdan sonra betik');
 // Yorumun ICINDEKI betik zararsizdir; yorum cikarilinca kalan icerik denetlenir.
 ok('<svg xmlns="http://www.w3.org/2000/svg"><!-- <script>alert(1)</script> --><rect width="1" height="1"/></svg>','yorum icindeki betik');
});
test('xml entity declarations are rejected',()=>{
 bad('<!DOCTYPE svg><svg><rect/></svg>','doctype');
 bad('<!DOCTYPE svg [<!ENTITY a "b">]><svg><rect/></svg>','entity');
});
test('external references are rejected, document-internal ones are kept',()=>{
 bad(wrap('<image href="https://example.com/a.png"/>'),'https gorsel');
 bad(wrap('<use xlink:href="http://example.com/s.svg#i"/>'),'http use');
 bad(wrap('<use xlink:href="//example.com/s.svg#i"/>'),'protokolsuz use');
 ok(wrap('<use href="#inner"/><g id="inner"><rect width="1" height="1"/></g>'),'belge ici use');
 ok(wrap('<image href="data:image/png;base64,iVBORw0KGgo="/>'),'gomulu gorsel');
});
test('a file that is not an svg at all is rejected',()=>{
 bad('<html><body>hi</body></html>','html');
 bad('plain text','duz metin');
 bad('','bos');
});
