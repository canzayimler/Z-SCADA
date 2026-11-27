import {newWidget,type Screen,type Widget} from '../contracts/model';
import {portsOf,portWeight} from './ports';
import {commitPipePath,routeOrthogonalLeg,type PortHit} from './pipePen';

export type ScreenTemplateId=
 |'esanjor-skidi'
 |'pompa-kolektor'
 |'reaktor-tank'
 |'kompresor-hatti'
 |'ahu-iklimlendirme';

export type ScreenTemplateMeta={
 id:ScreenTemplateId;
 name:string;
 category:string;
 description:string;
 backdropVariant:'heat-exchanger-skid'|'pump-manifold'|'reactor-tank'|'compressor-dryer'|'ahu-cutaway';
 width:number;
 height:number;
 highlights:readonly string[];
};

export const screenTemplates:readonly ScreenTemplateMeta[]=[
 {
  id:'esanjor-skidi',
  name:'Eşanjör & Sıcak Su Skidi',
  category:'Isıl Proses',
  description:'Plakalı eşanjör, primer kontrol vanası, sirkülasyon pompası, PID ve 3 telemetri kartı.',
  backdropVariant:'heat-exchanger-skid',
  width:1440,
  height:820,
  highlights:['Plakalı eşanjör','PID kontrol','3 veri kartı','Alarm bandı']
 },
 {
  id:'pompa-kolektor',
  name:'Pompa & Kolektör İstasyonu',
  category:'Akışkan Transferi',
  description:'Besleme tankı, ana/yedek pompa grubu, çek valfler, debimetre ve başlat/durdur kumandası.',
  backdropVariant:'pump-manifold',
  width:1440,
  height:820,
  highlights:['Çift pompa P-201/202','Debimetre','Kumanda butonları','Kolektör hattı']
 },
 {
  id:'reaktor-tank',
  name:'Tank / Reaktör Prosesi',
  category:'Proses Kabı',
  description:'Ceketli reaktör, karıştırıcı, seviye/sıcaklık göstergeleri, PID ve canlı trend grafiği.',
  backdropVariant:'reactor-tank',
  width:1440,
  height:820,
  highlights:['Ceketli tank','Karıştırıcı','Canlı trend','PID sıcaklık']
 },
 {
  id:'kompresor-hatti',
  name:'Basınçlı Hava İstasyonu',
  category:'Yardımcı Tesis',
  description:'Vidalı kompresör, soğutmalı kurutucu, hava kazanı, hat filtresi ve enerji analizörü.',
  backdropVariant:'compressor-dryer',
  width:1440,
  height:820,
  highlights:['Vidalı kompresör','Hava kurutucu','Hava tankı','Enerji analizörü']
 },
 {
  id:'ahu-iklimlendirme',
  name:'Klima Santrali (AHU)',
  category:'HVAC',
  description:'Klima santrali, taze hava damperi, filtre fark basıncı, serpantin ve üfleme/dönüş fanları.',
  backdropVariant:'ahu-cutaway',
  width:1440,
  height:820,
  highlights:['Damper & filtre','Serpantin','Üfleme/dönüş fanı','PID iklimlendirme']
 }
];

function portHit(w:Widget,portIndex:number):PortHit|null{
 const list=portsOf(w);
 const p=list[portIndex];
 if(!p)return null;
 return {widgetId:w.id,portIndex,x:p.x,y:p.y,axis:p.axis,weight:portWeight(w,portIndex)};
}

function connectWidgets(screen:Screen,a:Widget,pa:number,b:Widget,pb:number,flipBend=false):Screen{
 const hitA=portHit(a,pa),hitB=portHit(b,pb);
 if(!hitA||!hitB)return screen;
 const pts=routeOrthogonalLeg({x:hitA.x,y:hitA.y},{x:hitB.x,y:hitB.y},hitA.axis,flipBend);
 return commitPipePath(screen,pts,{startSnap:hitA,endSnap:hitB,autoFit:true}).screen;
}

function w(type:Widget['type'],x:number,y:number,props:Partial<Widget>={}):Widget{
 const base=newWidget(type,x,y);
 return {...base,...props};
}

function baseScreen(meta:ScreenTemplateMeta,id:string,name?:string):Screen{
 return {
  id,
  name:(name||'').trim()||meta.name,
  width:meta.width,
  height:meta.height,
  widgets:[],
  equipment:[],
  scenarios:[],
  links:[],
  background:'',
  symbolStyle:'detailed',
  gridSize:10
 };
}

/** 5 hazır endüstriyel ekran şablonundan geçerli bir Screen belgesi üretir. */
export function buildScreenTemplate(templateId:ScreenTemplateId,id:string,name?:string):Screen{
 const meta=screenTemplates.find(t=>t.id===templateId)||screenTemplates[0];
 let s=baseScreen(meta,id,name);
 const add=(widget:Widget)=>{s.widgets.push(widget);return widget;};

 // Ortak üst şerit + altlık katmanı (index 0: kilitli arka plan vektörü)
 add(w('backdrop',52,110,{width:920,height:480,variant:meta.backdropVariant,locked:true,labelVisible:false,label:meta.name,animated:false}));
 add(w('text',32,22,{width:720,height:34,label:meta.name.toLocaleUpperCase('tr'),fontSize:22,fontWeight:'700',textAlign:'left',animated:false}));
 add(w('text',32,58,{width:720,height:24,label:meta.description,fontSize:13,fontWeight:'400',textAlign:'left',animated:false}));
 add(w('alarm-band',960,22,{width:448,height:56,label:'Aktif alarmlar'}));

 if(templateId==='esanjor-skidi'){
  const pump=add(w('pump',96,294,{width:140,height:108,label:'P-101 Sirkülasyon',labelVisible:true,variant:'centrifugal'}));
  const cValve=add(w('control-valve',300,174,{width:130,height:105,label:'KV-101 Primer',labelVisible:true}));
  const hx=add(w('heat-exchanger',500,256,{width:210,height:120,label:'E-101 Plakalı',labelVisible:true,variant:'plate'}));
  const outValve=add(w('valve',800,280,{width:130,height:96,label:'V-102 Çıkış',labelVisible:true}));
  add(w('instrument',130,618,{width:106,height:106,label:'PT-101',labelVisible:false,unit:'bar',min:0,max:10,variant:'field'}));
  add(w('instrument',410,618,{width:106,height:106,label:'TT-101',labelVisible:false,unit:'°C',min:0,max:120,warnHigh:85,limitHigh:95,variant:'panel'}));
  add(w('instrument',690,618,{width:106,height:106,label:'TT-102',labelVisible:false,unit:'°C',min:0,max:120,warnHigh:75,limitHigh:85,variant:'dcs'}));
  add(w('pid',1080,104,{width:328,height:230,label:'TIC-101 Sıcaklık PID',labelVisible:true,unit:'°C',min:0,max:100}));
  add(w('data-card',1080,356,{width:328,height:122,label:'Sekonder Çıkış Sıcaklığı',labelVisible:true,unit:'°C',decimals:1,variant:'card'}));
  add(w('data-card',1080,494,{width:328,height:122,label:'Primer Hat Basıncı',labelVisible:true,unit:'bar',decimals:2,variant:'card'}));
  add(w('data-card',1080,632,{width:328,height:122,label:'Anlık Isıl Güç',labelVisible:true,unit:'kW',decimals:1,variant:'card'}));
  s=connectWidgets(s,pump,1,cValve,0);
  s=connectWidgets(s,cValve,1,hx,0);
  s=connectWidgets(s,hx,1,outValve,0);
  return s;
 }

 if(templateId==='pompa-kolektor'){
  const tank=add(w('tank',66,220,{width:140,height:180,label:'T-201 Besleme',labelVisible:true,variant:'cylindrical'}));
  const p1=add(w('pump',310,164,{width:140,height:104,label:'P-201 Ana',labelVisible:true,variant:'centrifugal'}));
  const p2=add(w('pump',310,330,{width:140,height:104,label:'P-202 Yedek',labelVisible:true,variant:'centrifugal'}));
  const cv1=add(w('check-valve',520,172,{width:120,height:92,label:'ÇV-201',labelVisible:true}));
  const cv2=add(w('check-valve',520,338,{width:120,height:92,label:'ÇV-202',labelVisible:true}));
  const bf=add(w('butterfly-valve',720,252,{width:120,height:96,label:'KV-201 Ana Hat',labelVisible:true}));
  const fm=add(w('flow-meter',890,256,{width:130,height:96,label:'FT-201',labelVisible:true,unit:'m³/h',min:0,max:120}));
  add(w('gauge',80,612,{width:130,height:120,label:'Kol. Basıncı',labelVisible:true,unit:'bar',min:0,max:12,warnHigh:8,limitHigh:10}));
  add(w('button',260,648,{width:150,height:48,label:'P-201 Başlat',labelVisible:true,action:'on'}));
  add(w('button',430,648,{width:150,height:48,label:'P-201 Durdur',labelVisible:true,action:'off'}));
  add(w('button',620,648,{width:150,height:48,label:'P-202 Başlat',labelVisible:true,action:'on'}));
  add(w('data-card',1080,104,{width:328,height:124,label:'Kolektör Basıncı',labelVisible:true,unit:'bar',decimals:2,variant:'card'}));
  add(w('data-card',1080,248,{width:328,height:124,label:'Toplam Debi',labelVisible:true,unit:'m³/h',decimals:1,variant:'card'}));
  add(w('data-card',1080,392,{width:328,height:124,label:'Tank Seviyesi',labelVisible:true,unit:'%',decimals:0,variant:'card'}));
  add(w('data-card',1080,536,{width:328,height:124,label:'Aktif Pompa Akımı',labelVisible:true,unit:'A',decimals:1,variant:'card'}));
  s=connectWidgets(s,tank,1,p1,0,true);
  s=connectWidgets(s,tank,1,p2,0,true);
  s=connectWidgets(s,p1,1,cv1,0);
  s=connectWidgets(s,p2,1,cv2,0);
  s=connectWidgets(s,cv1,1,bf,0);
  s=connectWidgets(s,cv2,1,bf,0);
  s=connectWidgets(s,bf,1,fm,0);
  return s;
 }

 if(templateId==='reaktor-tank'){
  const feedValve=add(w('control-valve',96,154,{width:130,height:105,label:'KV-301 Besleme',labelVisible:true}));
  const reactor=add(w('tank',350,180,{width:180,height:210,label:'R-301 Reaktör',labelVisible:true,variant:'jacketed',unit:'%',min:0,max:100,warnHigh:85,limitHigh:95}));
  add(w('agitator',416,120,{width:64,height:110,label:'M-301 Karıştırıcı',labelVisible:false}));
  const outValve=add(w('valve',610,360,{width:130,height:96,label:'V-302 Tahliye',labelVisible:true}));
  add(w('level-bar',256,204,{width:72,height:160,label:'LT-301',labelVisible:true,min:0,max:100,warnLow:15,warnHigh:85,limitHigh:95}));
  add(w('thermometer',566,184,{width:72,height:150,label:'TT-301',labelVisible:true,min:0,max:150,warnHigh:110,limitHigh:130}));
  add(w('instrument',740,174,{width:106,height:106,label:'TT-302',labelVisible:false,unit:'°C',min:0,max:150,variant:'dcs'}));
  add(w('instrument',880,174,{width:106,height:106,label:'PT-301',labelVisible:false,unit:'bar',min:0,max:6,variant:'field'}));
  add(w('trend',64,548,{width:940,height:224,label:'Reaktör Sıcaklık & Seviye Trendi',labelVisible:true,timeWindowMin:30,min:0,max:150}));
  add(w('pid',1080,104,{width:328,height:230,label:'TIC-301 Ceket PID',labelVisible:true,unit:'°C',min:0,max:150}));
  add(w('data-card',1080,356,{width:328,height:122,label:'İç Hazne Sıcaklığı',labelVisible:true,unit:'°C',decimals:1,variant:'card'}));
  add(w('data-card',1080,494,{width:328,height:122,label:'Reaktör Seviyesi',labelVisible:true,unit:'%',decimals:0,variant:'card'}));
  add(w('data-card',1080,632,{width:328,height:122,label:'Karıştırıcı Devri',labelVisible:true,unit:'rpm',decimals:0,variant:'card'}));
  s=connectWidgets(s,feedValve,1,reactor,0);
  s=connectWidgets(s,reactor,1,outValve,0);
  return s;
 }

 if(templateId==='kompresor-hatti'){
  const comp=add(w('compressor',76,258,{width:170,height:120,label:'K-401 Vidalı',labelVisible:true,variant:'screw'}));
  const dryer=add(w('dryer',330,248,{width:170,height:120,label:'KR-401 Kurutucu',labelVisible:true}));
  const flt=add(w('filter',576,248,{width:120,height:120,label:'F-401 Hat Filtre',labelVisible:true,variant:'cartridge'}));
  const receiver=add(w('vessel',760,238,{width:210,height:130,label:'HT-401 Hava Tankı',labelVisible:true,unit:'bar',min:0,max:10}));
  add(w('gauge',116,612,{width:130,height:120,label:'Çıkış Basıncı',labelVisible:true,unit:'bar',min:0,max:10,warnLow:5.5,warnHigh:8.5,limitHigh:9.5}));
  add(w('instrument',360,618,{width:106,height:106,label:'TT-401',labelVisible:false,unit:'°C',min:0,max:60,warnHigh:10,variant:'field'}));
  add(w('instrument',580,618,{width:106,height:106,label:'DPT-401',labelVisible:false,unit:'mbar',min:0,max:500,warnHigh:250,limitHigh:400,variant:'panel'}));
  add(w('power-meter',766,602,{width:190,height:140,label:'EM-401 Analizör',labelVisible:true}));
  add(w('data-card',1080,104,{width:328,height:124,label:'Şebeke Hava Basıncı',labelVisible:true,unit:'bar',decimals:2,variant:'card'}));
  add(w('data-card',1080,248,{width:328,height:124,label:'Çiy Noktası Sıcaklığı',labelVisible:true,unit:'°C',decimals:1,variant:'card'}));
  add(w('data-card',1080,392,{width:328,height:124,label:'Kompresör Güç Tüketimi',labelVisible:true,unit:'kW',decimals:1,variant:'card'}));
  add(w('data-card',1080,536,{width:328,height:124,label:'Çalışma Saati',labelVisible:true,unit:'sa',decimals:0,variant:'card'}));
  s=connectWidgets(s,comp,1,dryer,0);
  s=connectWidgets(s,dryer,1,flt,0,true);
  s=connectWidgets(s,flt,1,receiver,0,true);
  return s;
 }

 // 'ahu-iklimlendirme'
 const damper=add(w('damper',68,256,{width:120,height:104,label:'DM-501 Karışım',labelVisible:true}));
 const aFilter=add(w('air-filter',250,252,{width:120,height:110,label:'AF-501 Torba',labelVisible:true,min:0,max:400}));
 const coil=add(w('coil',430,246,{width:136,height:120,label:'SR-501 Batarya',labelVisible:true}));
 const ahu=add(w('ahu',630,224,{width:260,height:150,label:'AHU-501 Klima Santrali',labelVisible:true}));
 add(w('fan',928,176,{width:110,height:110,label:'F-501 Üfleme',labelVisible:true}));
 add(w('fan',928,332,{width:110,height:110,label:'F-502 Dönüş',labelVisible:true}));
 add(w('instrument',150,618,{width:106,height:106,label:'DPT-501',labelVisible:false,unit:'Pa',min:0,max:500,variant:'panel'}));
 add(w('instrument',410,618,{width:106,height:106,label:'TT-501',labelVisible:false,unit:'°C',min:0,max:50,variant:'dcs'}));
 add(w('instrument',670,618,{width:106,height:106,label:'HT-501',labelVisible:false,unit:'%RH',min:0,max:100,variant:'dcs'}));
 add(w('pid',1080,104,{width:328,height:230,label:'TIC-501 Üfleme Sıcaklığı',labelVisible:true,unit:'°C',min:10,max:35}));
 add(w('data-card',1080,356,{width:328,height:122,label:'Üfleme Hava Sıcaklığı',labelVisible:true,unit:'°C',decimals:1,variant:'card'}));
 add(w('data-card',1080,494,{width:328,height:122,label:'Bağıl Nem',labelVisible:true,unit:'%RH',decimals:1,variant:'card'}));
 add(w('data-card',1080,632,{width:328,height:122,label:'Filtre Fark Basıncı',labelVisible:true,unit:'Pa',decimals:0,variant:'card'}));
 s=connectWidgets(s,damper,1,aFilter,0);
 s=connectWidgets(s,aFilter,1,coil,0);
 s=connectWidgets(s,coil,1,ahu,0);
 return s;
}
