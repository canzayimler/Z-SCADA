/**
 * SVG icerik denetimi (K01).
 *
 * SVG bir GORSEL degil, bir BELGEDIR: script tasiyabilir, disariya istek
 * atabilir, XML varliklariyla sunucuyu yorabilir. Bu yuzden yuklenen SVG
 * TEMIZLENMEZ, DENETLENIR ve suphe halinde REDDEDILIR.
 *
 * Neden temizleme degil de reddetme: SVG'yi guvenli hale getirmek icin
 * yeniden yazmak, ayristiricinin tarayicidaki ayristiriciyla birebir ayni
 * davranmasini gerektirir. Aralarindaki her fark bir atlatma yoludur.
 * Reddetmek ise dururken guvenlidir: kullanici dosyayi duzeltir ya da PNG
 * yukler; kimse sessizce "temizlendigini sandigi" bir dosya calistirmaz.
 *
 * Bu, servis tarafindaki onlemlerin YERINE GECMEZ, onlara EKLENIR: yuklenen
 * dosyalar `default-src 'none'` CSP ve `X-Content-Type-Options: nosniff`
 * ile sunulur, ekranda da <img> icinde gosterilir (img icindeki SVG script
 * calistiramaz). Katmanlardan biri asilirsa digerleri durur.
 */
export type SvgVerdict={ok:true}|{ok:false;reason:string};
/** Yorumlari cikarir; `<!-- <script> -->` gibi gizlenmis icerik denetimi atlatmasin diye. */
function stripComments(text:string){return text.replace(/<!--[\s\S]*?-->/g,' ');}
const forbiddenElements=[
 ['script','betik'],['foreignobject','yabancı içerik'],['iframe','çerçeve'],['embed','gömülü nesne'],
 ['object','nesne'],['audio','ses'],['video','video'],['handler','olay işleyici'],['listener','olay dinleyici']] as const;
export function inspectSvg(input:string):SvgVerdict{
 const text=stripComments(input);
 const lower=text.toLowerCase();
 if(!/<svg[\s>]/.test(lower))return {ok:false,reason:'Dosya bir SVG değil.'};
 // XML varlik bildirimi: hem dis kaynak okuma (XXE) hem de kendini cogaltan
 // varliklarla bellek tuketme yolu. Gecerli bir cizim buna ihtiyac duymaz.
 if(/<!doctype/.test(lower))return {ok:false,reason:'SVG içinde DOCTYPE bildirimi var; kaldırın.'};
 if(/<!entity/.test(lower))return {ok:false,reason:'SVG içinde XML varlık (ENTITY) bildirimi var; kaldırın.'};
 for(const [tag,label] of forbiddenElements)
  if(new RegExp('<\\s*'+tag+'[\\s>/]').test(lower))return {ok:false,reason:'SVG içinde '+label+' ('+tag+') öğesi var; kaldırın.'};
 // on... ile baslayan her oznitelik bir olay isleyicisidir (onload, onclick,
 // onmouseover...). Tek tek saymak yerine tumu reddedilir.
 const handler=/(^|[\s"'/])on[a-z]+\s*=/.exec(lower);
 if(handler)return {ok:false,reason:'SVG içinde olay özniteliği var ('+handler[0].trim()+'); kaldırın.'};
 if(/javascript\s*:/.test(lower))return {ok:false,reason:'SVG içinde javascript: adresi var; kaldırın.'};
 if(/data\s*:\s*text\/html/.test(lower))return {ok:false,reason:'SVG içinde HTML veri adresi var; kaldırın.'};
 /* Dis kaynak: gorsel acildiginda tesis disina istek gider. Bu hem izleme
  * (kimin hangi ekrani ne zaman actigi) hem de calisma zamaninda degisen
  * icerik demektir. Yalniz belge ici (#kimlik) referanslara izin verilir. */
 const external=/(?:xlink:href|href|src)\s*=\s*["']?\s*(?:https?:)?\/\//.exec(lower);
 if(external)return {ok:false,reason:'SVG dış kaynağa bağlanıyor; yalnız belge içi referanslar kabul edilir.'};
 if(/<image[\s>]/.test(lower)&&!/<image[^>]*\shref\s*=\s*["']\s*(?:#|data:image\/)/.test(lower)&&!/<image[^>]*\sxlink:href\s*=\s*["']\s*(?:#|data:image\/)/.test(lower))
  return {ok:false,reason:'SVG içindeki <image> öğesi yalnız gömülü (data:image/...) kaynak kullanabilir.'};
 return {ok:true};
}
