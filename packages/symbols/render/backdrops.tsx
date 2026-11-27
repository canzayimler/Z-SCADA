import type {ReactNode} from 'react';
import type {Renderer} from './ctx';

/** 5 çok katmanlı vektörel tesis/ekipman altlığı (sıfır kenar izi, tema duyarlı `--bd-*` token'ları). */
export const BACKDROP_VARIANTS=[
 {key:'heat-exchanger-skid',label:'Eşanjör skidi',labelEn:'Heat exchanger skid'},
 {key:'pump-manifold',label:'Pompa-kolektör',labelEn:'Pump manifold'},
 {key:'reactor-tank',label:'Tank / reaktör kesiti',labelEn:'Reactor cutaway'},
 {key:'compressor-dryer',label:'Kompresör + kurutucu',labelEn:'Compressor & dryer'},
 {key:'ahu-cutaway',label:'AHU kesiti',labelEn:'AHU cutaway'},
] as const;

export type BackdropVariant=(typeof BACKDROP_VARIANTS)[number]['key'];

/** Hem tuval `backdrop` nesnesi hem şablon galerisi önizlemeleri için ortak şeffaf vektör SVG. */
export function renderBackdropSvg(variant:string,rawId:string,preserveAspectRatio='xMidYMid meet'){
 const uid=(rawId||'00000000').replace(/[^a-zA-Z0-9_-]/g,'')||'00000000';
 const g1=`b${uid}-1`,g2=`b${uid}-2`,g3=`b${uid}-3`,g4=`b${uid}-4`;
 const defs=<defs>
  <linearGradient id={g1} x1="0" y1="0" x2="0" y2="1">
   <stop offset="0" stopColor="var(--bd-shell-hi)"/>
   <stop offset=".5" stopColor="var(--bd-shell-mid)"/>
   <stop offset="1" stopColor="var(--bd-shell-lo)"/>
  </linearGradient>
  <linearGradient id={g2} x1="0" y1="0" x2="1" y2="1">
   <stop offset="0" stopColor="var(--bd-shell-mid)"/>
   <stop offset="1" stopColor="var(--bd-shell-lo)"/>
  </linearGradient>
  <linearGradient id={g3} x1="0" y1="0" x2="0" y2="1">
   <stop offset="0" stopColor="var(--bd-cool)" stopOpacity=".36"/>
   <stop offset="1" stopColor="var(--bd-cool)" stopOpacity=".14"/>
  </linearGradient>
  <linearGradient id={g4} x1="0" y1="0" x2="0" y2="1">
   <stop offset="0" stopColor="var(--bd-warm)" stopOpacity=".36"/>
   <stop offset="1" stopColor="var(--bd-warm)" stopOpacity=".14"/>
  </linearGradient>
 </defs>;

 let body:ReactNode;
 switch(variant){
  case 'pump-manifold':
   body=<>
    {/* Zemin eksen kılavuzları */}
    <path d="M28 318H612M188 34V324M452 34V324" stroke="var(--bd-guide)" strokeWidth="1" strokeDasharray="4 4"/>
    {/* Ortak emme kolektörü (sol → pompa emişleri) */}
    <path d="M36 168H132V118H210M132 168V232H210" stroke="var(--bd-cool)" strokeOpacity=".42" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M36 168H132V118H210M132 168V232H210" stroke="var(--bd-line)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    {/* Emme kolektörü ana kütük */}
    <rect x="116" y="96" width="24" height="160" rx="6" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
    <line x1="128" y1="106" x2="128" y2="246" stroke="var(--bd-cool)" strokeWidth="3" strokeOpacity=".6" strokeDasharray="8 6"/>
    {/* Ortak basma kolektörü (sağ) */}
    <path d="M294 108H496M294 222H496M496 72V264M496 168H604" stroke="var(--bd-cool)" strokeOpacity=".34" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M294 108H496M294 222H496M496 72V264M496 168H604" stroke="var(--bd-line)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="484" y="64" width="24" height="212" rx="6" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
    {/* Kolektör üst hava tahliye + alt drenaj tapaları */}
    <path d="M496 64V48M489 48H503M496 276V296M490 296H502" stroke="var(--bd-line-soft)" strokeWidth="1.8" strokeLinecap="round"/>
    {/* P-1 ve P-2 pompaları + kaide + motor silueti */}
    {[118,232].map((cy,idx)=><g key={cy}>
     {/* Kaide şasesi */}
     <path d={`M190 ${cy+32}H424L434 ${cy+46}H180Z`} fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
     <rect x="196" y={cy+46} width="18" height="6" rx="1" fill="var(--bd-shell-lo)" stroke="var(--bd-line-soft)" strokeWidth="1"/>
     <rect x="400" y={cy+46} width="18" height="6" rx="1" fill="var(--bd-shell-lo)" stroke="var(--bd-line-soft)" strokeWidth="1"/>
     {/* Salyangoz pompa gövdesi */}
     <path d={`M238 ${cy-28}H294V${cy}A28 28 0 1 1 238 ${cy-28}Z`} fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="2"/>
     <circle cx="240" cy={cy} r="18" fill="var(--bd-cutaway)" stroke="var(--bd-line-soft)" strokeWidth="1.3"/>
     <circle cx="240" cy={cy} r="5" fill="var(--bd-shell-lo)" stroke="var(--bd-line)" strokeWidth="1.4"/>
     {[0,60,120,180,240,300].map(a=><line key={a} x1="240" y1={cy} x2={240+15*Math.cos(a*Math.PI/180)} y2={cy+15*Math.sin(a*Math.PI/180)} stroke="var(--bd-line-soft)" strokeWidth="1.3" strokeLinecap="round"/>)}
     {/* Kaplin muhafazası + kanatlı tahrik motoru */}
     <rect x="274" y={cy-10} width="32" height="20" rx="3" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.4"/>
     <rect x="306" y={cy-24} width="84" height="48" rx="6" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
     <path d={`M390 ${cy-20}h12a5 5 0 0 1 5 5v30a5 5 0 0 1-5 5h-12z`} fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
     <rect x="334" y={cy-36} width="26" height="12" rx="2" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.4"/>
     {[cy-14,cy-7,cy,cy+7,cy+14].map(ly=><line key={ly} x1="316" y1={ly} x2="380" y2={ly} stroke="var(--bd-line-soft)" strokeWidth="1.2"/>)}
     {/* Çek valf ve flanş kesitleri */}
     <rect x="166" y={cy-12} width="8" height="24" rx="1.5" fill="var(--bd-shell-hi)" stroke="var(--bd-line)" strokeWidth="1.3"/>
     <rect x="444" y={cy-21} width="22" height="22" rx="4" fill="var(--bd-cutaway)" stroke="var(--bd-line)" strokeWidth="1.5"/>
     <path d={`M448 ${cy-4}L455 ${cy-16}L462 ${cy-4}`} stroke="var(--bd-line-soft)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
     <text x="348" y={cy+41} textAnchor="middle" fill="var(--bd-label)" fontSize="10" fontFamily="Consolas,monospace" fontWeight="700">{idx===0?'ANA POMPA HATTI · P-1':'YEDEK POMPA HATTI · P-2'}</text>
    </g>)}
    {/* Flanş çiftleri */}
    {[40,600].map(x=><rect key={x} x={x-3} y="154" width="6" height="28" rx="1.5" fill="var(--bd-shell-hi)" stroke="var(--bd-line)" strokeWidth="1.4"/>)}
    <text x="58" y="148" fill="var(--bd-label)" fontSize="10" fontFamily="Consolas,monospace">EMME</text>
    <text x="556" y="148" fill="var(--bd-label)" fontSize="10" fontFamily="Consolas,monospace">BASMA</text>
   </>;
   break;

  case 'reactor-tank':
   body=<>
    {/* Bakım platformu + eksen çizgisi */}
    <path d="M84 316H556M320 18V336" stroke="var(--bd-guide)" strokeWidth="1" strokeDasharray="5 4"/>
    <path d="M120 132H196M120 132V316M146 132V316M120 108H196M120 108V132M158 108V132M196 108V132" stroke="var(--bd-line-soft)" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M444 166H520M520 166V316M494 166V316M444 142H520M482 142V166M520 142V166" stroke="var(--bd-line-soft)" strokeWidth="1.6" strokeLinecap="round"/>
    {/* Taşıyıcı ayaklar */}
    <path d="M214 252L204 316H226L236 264Z" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
    <path d="M426 252L436 316H414L404 264Z" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
    {/* Dış ısıtma/soğutma ceketi */}
    <path d="M196 112H444V242Q444 268 416 276L344 294H296L224 276Q196 268 196 242Z" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="2"/>
    <path d="M166 134H196M444 234H474" stroke="var(--bd-warm)" strokeWidth="8" strokeOpacity=".38" strokeLinecap="round"/>
    <path d="M166 134H196M444 234H474" stroke="var(--bd-line)" strokeWidth="1.8" strokeLinecap="round"/>
    {/* İç basınçlı kap + bombeli üst kapak */}
    <path d="M212 96Q320 44 428 96V238Q428 260 320 282Q212 260 212 238Z" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="2.2"/>
    {/* İç kesit oyuğu */}
    <path d="M224 104Q320 58 416 104V234Q416 252 320 271Q224 252 224 234Z" fill="var(--bd-cutaway)" stroke="var(--bd-line-soft)" strokeWidth="1.2"/>
    {/* Alt sıvı dolgu izi (nötr teknik kesit) */}
    <path d="M225 186H415V234Q415 251 320 270Q225 251 225 234Z" fill={`url(#${g3})`}/>
    <path d="M226 186Q272 181 320 186T414 186" stroke="var(--bd-cool)" strokeWidth="1.5" strokeDasharray="6 4"/>
    {/* Dalgakıran (baffle) plakaları */}
    <rect x="229" y="118" width="7" height="106" rx="1.5" fill="var(--bd-shell-lo)" stroke="var(--bd-line-soft)" strokeWidth="1.1"/>
    <rect x="404" y="118" width="7" height="106" rx="1.5" fill="var(--bd-shell-lo)" stroke="var(--bd-line-soft)" strokeWidth="1.1"/>
    {/* Üst redüktör + motor + karıştırıcı mili + 2 kademe pervane */}
    <rect x="292" y="22" width="56" height="24" rx="4" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
    <rect x="302" y="46" width="36" height="18" rx="3" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
    <rect x="316" y="64" width="8" height="170" fill="var(--bd-shell-lo)" stroke="var(--bd-line)" strokeWidth="1.4"/>
    {/* Üst ve alt eğimli karıştırıcı kanatları */}
    <path d="M266 154L316 164V172L266 164Z M374 172L324 164V156L374 162Z" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.4"/>
    <path d="M254 218L316 228V236L254 228Z M386 236L324 228V220L386 226Z" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.4"/>
    {/* Yan seviye gözetleme camı + alt boşaltma boğazı */}
    <rect x="448" y="138" width="12" height="82" rx="4" fill="var(--bd-cutaway)" stroke="var(--bd-line)" strokeWidth="1.5"/>
    <path d="M430 148H454M430 210H454" stroke="var(--bd-line)" strokeWidth="2"/>
    <rect x="310" y="282" width="20" height="32" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
    <rect x="303" y="310" width="34" height="6" rx="1.5" fill="var(--bd-shell-hi)" stroke="var(--bd-line)" strokeWidth="1.4"/>
    {/* Üst nozul ağızları */}
    <path d="M248 54V82M392 54V82" stroke="var(--bd-line)" strokeWidth="8"/>
    <path d="M242 54H254M386 54H398" stroke="var(--bd-shell-hi)" strokeWidth="4"/>
    <text x="168" y="126" textAnchor="middle" fill="var(--bd-label)" fontSize="9.5" fontFamily="Consolas,monospace">CEKET GİRİŞ</text>
    <text x="476" y="252" textAnchor="middle" fill="var(--bd-label)" fontSize="9.5" fontFamily="Consolas,monospace">CEKET ÇIKIŞ</text>
   </>;
   break;

  case 'compressor-dryer':
   body=<>
    {/* Zemin kaidesi ve akış kılavuzu */}
    <path d="M28 312H612M128 34V312M336 34V312M524 34V312" stroke="var(--bd-guide)" strokeWidth="1" strokeDasharray="4 4"/>
    {/* Ara basınçlı hava hatları */}
    <path d="M214 148H264V176H276M396 176H426V214H468M568 122H606" stroke="var(--bd-cool)" strokeOpacity=".34" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M214 148H264V176H276M396 176H426V214H468M568 122H606" stroke="var(--bd-line)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    {/* 1. Vidalı Kompresör Kabini Kesiti (sol) */}
    <rect x="44" y="92" width="170" height="212" rx="8" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="2"/>
    <rect x="56" y="106" width="146" height="184" rx="5" fill="var(--bd-cutaway)" stroke="var(--bd-line-soft)" strokeWidth="1.2"/>
    {/* Üst havalandırma panjurları */}
    {[72,88,104,120,136,152,168].map(x=><line key={x} x1={x} y1="100" x2={x+8} y2="100" stroke="var(--bd-line-soft)" strokeWidth="2" strokeLinecap="round"/>)}
    {/* Emiş filtresi + vida bloğu + elektrik motoru */}
    <rect x="68" y="122" width="38" height="24" rx="4" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.4"/>
    <rect x="70" y="160" width="60" height="44" rx="8" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
    <circle cx="90" cy="182" r="10" fill="var(--bd-shell-lo)" stroke="var(--bd-line)" strokeWidth="1.3"/>
    <circle cx="110" cy="182" r="10" fill="var(--bd-shell-lo)" stroke="var(--bd-line)" strokeWidth="1.3"/>
    <rect x="68" y="220" width="76" height="52" rx="6" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
    {[230,240,250,260].map(y=><line key={y} x1="76" y1={y} x2="136" y2={y} stroke="var(--bd-line-soft)" strokeWidth="1.2"/>)}
    {/* Yağ separatör tankı + son soğutucu */}
    <rect x="154" y="178" width="36" height="94" rx="14" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
    <rect x="150" y="116" width="42" height="46" rx="4" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.5"/>
    {[124,132,140,148,156].map(y=><line key={y} x1="154" y1={y} x2="188" y2={y} stroke="var(--bd-line-soft)" strokeWidth="1.2"/>)}
    {/* 2. Soğutmalı Hava Kurutucu (orta) */}
    <rect x="276" y="118" width="120" height="186" rx="7" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="2"/>
    <rect x="288" y="132" width="96" height="158" rx="4" fill="var(--bd-cutaway)" stroke="var(--bd-line-soft)" strokeWidth="1.2"/>
    {/* Eşanjör serpantin + kondens kapanı */}
    <path d="M300 148H372V168H300V188H372V208H300" stroke="var(--bd-cool)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="304" y="228" width="64" height="46" rx="5" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.5"/>
    <circle cx="336" cy="251" r="12" fill="var(--bd-shell-hi)" stroke="var(--bd-line)" strokeWidth="1.3"/>
    {/* Hat filtresi kovanı (kurutucu çıkışı) */}
    <rect x="424" y="196" width="18" height="54" rx="5" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.6"/>
    {/* 3. Dikey Basınçlı Hava Tankı (sağ) */}
    <path d="M472 96Q520 62 568 96V270Q568 292 520 298Q472 292 472 270Z" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="2.2"/>
    <path d="M484 106Q520 80 556 106V266Q556 280 520 286Q484 280 484 266Z" fill="var(--bd-cutaway)" stroke="var(--bd-line-soft)" strokeWidth="1.1"/>
    <path d="M482 282v22M558 282v22" stroke="var(--bd-line)" strokeWidth="5" strokeLinecap="round"/>
    {/* Emniyet ventili + yoğuşma tahliye */}
    <path d="M520 79V58M512 58H528M520 298V312" stroke="var(--bd-line)" strokeWidth="2.2" strokeLinecap="round"/>
    <text x="129" y="328" textAnchor="middle" fill="var(--bd-label)" fontSize="10" fontFamily="Consolas,monospace" fontWeight="700">VİDALI KOMPRESÖR</text>
    <text x="336" y="328" textAnchor="middle" fill="var(--bd-label)" fontSize="10" fontFamily="Consolas,monospace" fontWeight="700">KURUTUCU</text>
    <text x="520" y="328" textAnchor="middle" fill="var(--bd-label)" fontSize="10" fontFamily="Consolas,monospace" fontWeight="700">HAVA TANKI</text>
   </>;
   break;

  case 'ahu-cutaway':
   body=<>
    {/* AHU boyuna karkas ve eksenler */}
    <path d="M24 306H616" stroke="var(--bd-guide)" strokeWidth="1" strokeDasharray="4 4"/>
    {/* Sol ve sağ flanşlı hava kanalı bağlantıları */}
    <rect x="24" y="102" width="44" height="58" fill={`url(#${g3})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
    <rect x="24" y="200" width="44" height="58" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
    <rect x="572" y="102" width="44" height="58" fill={`url(#${g3})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
    <rect x="572" y="200" width="44" height="58" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
    {/* Ana izoleli kasa (çift cidar sandviç panel) */}
    <rect x="68" y="76" width="504" height="214" rx="8" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="2.4"/>
    <rect x="80" y="88" width="480" height="190" rx="4" fill="var(--bd-cutaway)" stroke="var(--bd-line-soft)" strokeWidth="1.3"/>
    {/* Hücre ara bölme duvarları + orta yatay katman */}
    <path d="M168 88V278M274 88V278M384 88V278M456 88V278M80 183H168M456 183H560" stroke="var(--bd-line)" strokeWidth="1.8"/>
    {/* 1. Hücre: Karışım Damperleri */}
    {[106,124,142,160].map(y=><line key={'u'+y} x1="94" y1={y} x2="146" y2={y-10} stroke="var(--bd-line)" strokeWidth="2.4" strokeLinecap="round"/>)}
    {[204,222,240,258].map(y=><line key={'d'+y} x1="94" y1={y} x2="146" y2={y-10} stroke="var(--bd-line-soft)" strokeWidth="2.4" strokeLinecap="round"/>)}
    {/* 2. Hücre: Kaset Ön Filtre + V-Torba Filtre */}
    <path d="M188 100L198 118L188 136L198 154L188 172L198 190L188 208L198 226L188 244L198 262" stroke="var(--bd-line-soft)" strokeWidth="1.8" strokeLinejoin="round"/>
    {[108,150,192,234].map(y=><path key={y} d={`M216 ${y}L258 ${y+10}L216 ${y+24}Z`} fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.4"/>)}
    {/* 3. Hücre: Soğutma & Isıtma Serpantinleri + Yoğuşma Tavası */}
    <rect x="292" y="102" width="26" height="154" rx="3" fill={`url(#${g3})`} stroke="var(--bd-cool)" strokeWidth="1.6"/>
    <path d="M298 110C312 122 296 132 308 144C296 156 312 166 300 178C312 190 296 200 308 212C296 224 312 234 300 246" stroke="var(--bd-cool)" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="340" y="102" width="26" height="154" rx="3" fill={`url(#${g4})`} stroke="var(--bd-warm)" strokeWidth="1.6"/>
    <path d="M346 110C360 122 344 132 356 144C344 156 360 166 348 178C360 190 344 200 356 212C344 224 360 234 348 246" stroke="var(--bd-warm)" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M284 262H374L368 272H290Z" fill="var(--bd-shell-lo)" stroke="var(--bd-line)" strokeWidth="1.3"/>
    {/* 4. Hücre: Nemlendirici / Damla Tutucu */}
    <line x1="418" y1="102" x2="418" y2="262" stroke="var(--bd-cool)" strokeWidth="2.5"/>
    {[124,156,188,220,248].map(y=><circle key={y} cx="424" cy={y} r="3" fill="var(--bd-cool)" fillOpacity=".65"/>)}
    <path d="M438 108V256" stroke="var(--bd-line-soft)" strokeWidth="1.5" strokeDasharray="5 3"/>
    {/* 5. Hücre: Üfleme ve Dönüş Plug Fanları */}
    {[134,230].map(cy=><g key={cy}>
     <circle cx="510" cy={cy} r="32" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
     <circle cx="510" cy={cy} r="22" fill="var(--bd-cutaway)" stroke="var(--bd-line-soft)" strokeWidth="1.2"/>
     {[0,45,90,135,180,225,270,315].map(a=><line key={a} x1="510" y1={cy} x2={510+20*Math.cos(a*Math.PI/180)} y2={cy+20*Math.sin(a*Math.PI/180)} stroke="var(--bd-line-soft)" strokeWidth="1.4" strokeLinecap="round"/>)}
     <circle cx="510" cy={cy} r="6" fill="var(--bd-shell-lo)" stroke="var(--bd-line)" strokeWidth="1.4"/>
    </g>)}
    {/* Şase ayakları ve bölüm etiketleri */}
    <path d="M88 290V306M320 290V306M552 290V306" stroke="var(--bd-line)" strokeWidth="4" strokeLinecap="round"/>
    <text x="124" y="66" textAnchor="middle" fill="var(--bd-label)" fontSize="9.5" fontFamily="Consolas,monospace">KARIŞIM</text>
    <text x="221" y="66" textAnchor="middle" fill="var(--bd-label)" fontSize="9.5" fontFamily="Consolas,monospace">FİLTRE</text>
    <text x="329" y="66" textAnchor="middle" fill="var(--bd-label)" fontSize="9.5" fontFamily="Consolas,monospace">BATARYA</text>
    <text x="420" y="66" textAnchor="middle" fill="var(--bd-label)" fontSize="9.5" fontFamily="Consolas,monospace">NEM</text>
    <text x="508" y="66" textAnchor="middle" fill="var(--bd-label)" fontSize="9.5" fontFamily="Consolas,monospace">FAN HÜCRESİ</text>
   </>;
   break;

  default: // 'heat-exchanger-skid'
   body=<>
    {/* Eksen referans çizgileri */}
    <path d="M24 316H616M320 26V324" stroke="var(--bd-guide)" strokeWidth="1" strokeDasharray="5 4"/>
    {/* I-profil çelik skid şase + ankraj ayakları */}
    <rect x="68" y="284" width="504" height="22" rx="3" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="2"/>
    <line x1="74" y1="291" x2="566" y2="291" stroke="var(--bd-shell-hi)" strokeWidth="1.4" strokeOpacity=".65"/>
    {[94,320,546].map(x=><rect key={x} x={x-14} y="306" width="28" height="9" rx="1.5" fill="var(--bd-shell-lo)" stroke="var(--bd-line)" strokeWidth="1.4"/>)}
    {/* Birincil sıcak devre borulaması (sol üst + alt bypass) */}
    <path d="M34 114H224M140 114V238H224" stroke="var(--bd-warm)" strokeOpacity=".36" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M34 114H224M140 114V238H224" stroke="var(--bd-line)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    {/* İkincil soğuk/ısıtılan devre borulaması (sağ) */}
    <path d="M416 114H606M416 238H516V176H606" stroke="var(--bd-cool)" strokeOpacity=".36" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M416 114H606M416 238H516V176H606" stroke="var(--bd-line)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    {/* Sol sirkülasyon pompası gölgesi (skid üstü yardımcı blok) */}
    <circle cx="140" cy="238" r="24" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="1.8"/>
    <circle cx="140" cy="238" r="14" fill="var(--bd-cutaway)" stroke="var(--bd-line-soft)" strokeWidth="1.2"/>
    <path d="M126 264h28l4 20h-36z" fill={`url(#${g2})`} stroke="var(--bd-line)" strokeWidth="1.5"/>
    {/* Ana Plakalı Eşanjör Demeti (merkez) */}
    <path d="M236 254v30M404 254v30" stroke="var(--bd-line)" strokeWidth="6" strokeLinecap="round"/>
    {/* Sabit ön baskı plakası + hareketli arka baskı plakası */}
    <rect x="220" y="76" width="26" height="184" rx="4" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="2.2"/>
    <rect x="394" y="76" width="22" height="184" rx="4" fill={`url(#${g1})`} stroke="var(--bd-line)" strokeWidth="2.2"/>
    {/* Üst ve alt gergi saplamaları + taşıma barı */}
    <rect x="210" y="90" width="218" height="9" rx="2" fill="var(--bd-shell-lo)" stroke="var(--bd-line)" strokeWidth="1.4"/>
    <rect x="210" y="236" width="218" height="9" rx="2" fill="var(--bd-shell-lo)" stroke="var(--bd-line)" strokeWidth="1.4"/>
    {/* 11 adet oluklu ısı transfer plakası */}
    {Array.from({length:11},(_,i)=>252+i*13).map((x,i)=><g key={x}>
     <rect x={x} y="99" width="8" height="137" rx="1.5" fill={i%2?`url(#${g3})`:`url(#${g4})`} stroke="var(--bd-line)" strokeWidth="1.2"/>
     <path d={`M${x+2} 108L${x+6} 124L${x+2} 140L${x+6} 156L${x+2} 172L${x+6} 188L${x+2} 204L${x+6} 220`} stroke="var(--bd-line-soft)" strokeWidth="1" strokeLinecap="round"/>
    </g>)}
    {/* 4 flanşlı nozul + termokuyruk/manometre cepleri */}
    {[[216,114],[216,238],[420,114],[420,238]].map(([fx,fy],idx)=><rect key={idx} x={fx-3} y={fy-12} width="6" height="24" rx="1.5" fill="var(--bd-shell-hi)" stroke="var(--bd-line)" strokeWidth="1.4"/>)}
    <path d="M92 98V114M552 98V114M552 160V176" stroke="var(--bd-line)" strokeWidth="2.2" strokeLinecap="round"/>
    <circle cx="92" cy="90" r="8" fill="var(--bd-cutaway)" stroke="var(--bd-line)" strokeWidth="1.4"/>
    <circle cx="552" cy="90" r="8" fill="var(--bd-cutaway)" stroke="var(--bd-line)" strokeWidth="1.4"/>
    <circle cx="552" cy="152" r="8" fill="var(--bd-cutaway)" stroke="var(--bd-line)" strokeWidth="1.4"/>
    <text x="140" y="334" textAnchor="middle" fill="var(--bd-label)" fontSize="9.5" fontFamily="Consolas,monospace">PRİMER DEVRE</text>
    <text x="500" y="334" textAnchor="middle" fill="var(--bd-label)" fontSize="9.5" fontFamily="Consolas,monospace">SEKONDER DEVRE</text>
    <text x="320" y="54" textAnchor="middle" fill="var(--bd-label)" fontSize="10" fontFamily="Consolas,monospace" fontWeight="700">PLAKALI EŞANJÖR SKİDİ · E-101</text>
   </>;
   break;
 }

 return <svg className="scada-symbol backdrop-svg" viewBox="0 0 640 360" width="100%" height="100%" preserveAspectRatio={preserveAspectRatio} fill="none" aria-hidden="true">
  {defs}
  {body}
 </svg>;
}

const backdrop:Renderer=(c)=>{
 const {w,variant}=c;
 const ratio=w.frameFit==='fill'?'none':'xMidYMid meet';
 return {html:<div className="symbol-backdrop" aria-label={w.label||'Tesis altlığı'}>
  {renderBackdropSvg(variant,w.id,ratio)}
  {w.labelVisible!==false&&w.label&&<div className="backdrop-caption" style={{fontSize:w.fontSize||undefined,fontWeight:w.fontWeight,textAlign:w.textAlign}}>{w.label}</div>}
 </div>};
};

export const renderers:Record<string,Renderer>={backdrop};
