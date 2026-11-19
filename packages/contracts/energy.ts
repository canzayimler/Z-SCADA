import {z} from 'zod';
import type {Config} from './model';
/* Enerji analizoru modulu. Analizor markadan bagimsizdir: her olcum ROLU (toplam aktif guc,
 * L1 akimi, aktif enerji sayaci...) mevcut bir etikete eslenir. Haberlesme, olcekleme ve bayt
 * sirasi etiketin kendi isidir; analizor yalniz "hangi etiket neyi olcuyor" bilgisini tasir. */

export type EnergyRoleGroup='power'|'phase'|'quality'|'energy';
export type EnergyRole={key:string;label:string;short:string;unit:string;group:EnergyRoleGroup;hints:RegExp[]};
/* Ipucu desenleri etiket kodu+adi uzerinde calisir; metin once normallestirilir (kucuk harf,
 * Turkce harf katlama, ayraclar '_'). Yalniz oneri uretir — eslemeyi muhendis onaylar. */
export const ENERGY_ROLES:EnergyRole[]=[
 {key:'p',label:'Aktif güç (toplam)',short:'P',unit:'kW',group:'power',hints:[/(^|_)(p|pt|ptot|psum|p_?top(lam)?|p_?sum|p_?total|aktif_?guc|active_?power|kw)(_(?!l?[123](_|$))|$)/]},
 {key:'q',label:'Reaktif güç (toplam)',short:'Q',unit:'kVAr',group:'power',hints:[/(^|_)(q|qt|qtot|qsum|q_?top(lam)?|q_?sum|q_?total|reaktif_?guc|reactive_?power|kvar)(_(?!l?[123](_|$))|$)/]},
 {key:'s',label:'Görünür güç (toplam)',short:'S',unit:'kVA',group:'power',hints:[/(^|_)(s|st|stot|ssum|s_?top(lam)?|s_?sum|s_?total|gorunur_?guc|apparent_?power|kva)(_(?!l?[123](_|$))|$)/]},
 {key:'pf',label:'Güç faktörü (cosφ)',short:'cosφ',unit:'',group:'power',hints:[/(^|_)(pf|cos_?fi|cosphi|cos|guc_?faktoru|power_?factor)(_?(top(lam)?|tot|sum|total))?(_(?!l?[123](_|$))|$)/]},
 {key:'f',label:'Frekans',short:'f',unit:'Hz',group:'power',hints:[/(^|_)(f|freq|frekans|frequency|hz)(_(?!l?[123](_|$))|$)/]},
 {key:'v1',label:'Gerilim L1-N',short:'V L1',unit:'V',group:'phase',hints:[/(^|_)(v|u|vln|uln|gerilim|voltage)_?(l)?1(n)?(_|$)/]},
 {key:'v2',label:'Gerilim L2-N',short:'V L2',unit:'V',group:'phase',hints:[/(^|_)(v|u|vln|uln|gerilim|voltage)_?(l)?2(n)?(_|$)/]},
 {key:'v3',label:'Gerilim L3-N',short:'V L3',unit:'V',group:'phase',hints:[/(^|_)(v|u|vln|uln|gerilim|voltage)_?(l)?3(n)?(_|$)/]},
 {key:'i1',label:'Akım L1',short:'I L1',unit:'A',group:'phase',hints:[/(^|_)(i|akim|current|amp)_?(l)?1(_|$)/]},
 {key:'i2',label:'Akım L2',short:'I L2',unit:'A',group:'phase',hints:[/(^|_)(i|akim|current|amp)_?(l)?2(_|$)/]},
 {key:'i3',label:'Akım L3',short:'I L3',unit:'A',group:'phase',hints:[/(^|_)(i|akim|current|amp)_?(l)?3(_|$)/]},
 {key:'p1',label:'Aktif güç L1',short:'P L1',unit:'kW',group:'phase',hints:[/(^|_)(p|kw|aktif_?guc|active_?power)_?(l)?1(_|$)/]},
 {key:'p2',label:'Aktif güç L2',short:'P L2',unit:'kW',group:'phase',hints:[/(^|_)(p|kw|aktif_?guc|active_?power)_?(l)?2(_|$)/]},
 {key:'p3',label:'Aktif güç L3',short:'P L3',unit:'kW',group:'phase',hints:[/(^|_)(p|kw|aktif_?guc|active_?power)_?(l)?3(_|$)/]},
 {key:'thdv1',label:'THD-V L1',short:'THD-V L1',unit:'%',group:'quality',hints:[/(^|_)thd_?(v|u)_?(l)?1(_|$)/]},
 {key:'thdv2',label:'THD-V L2',short:'THD-V L2',unit:'%',group:'quality',hints:[/(^|_)thd_?(v|u)_?(l)?2(_|$)/]},
 {key:'thdv3',label:'THD-V L3',short:'THD-V L3',unit:'%',group:'quality',hints:[/(^|_)thd_?(v|u)_?(l)?3(_|$)/]},
 {key:'thdi1',label:'THD-I L1',short:'THD-I L1',unit:'%',group:'quality',hints:[/(^|_)thd_?i_?(l)?1(_|$)/]},
 {key:'thdi2',label:'THD-I L2',short:'THD-I L2',unit:'%',group:'quality',hints:[/(^|_)thd_?i_?(l)?2(_|$)/]},
 {key:'thdi3',label:'THD-I L3',short:'THD-I L3',unit:'%',group:'quality',hints:[/(^|_)thd_?i_?(l)?3(_|$)/]},
 {key:'ea',label:'Aktif enerji sayacı (çekilen)',short:'kWh',unit:'kWh',group:'energy',hints:[/(^|_)(ea|ep|kwh|wh|aktif_?enerji|active_?energy|ea_?(imp|import|plus|\+)|import_?kwh)(_|$)/]},
 {key:'eqi',label:'Reaktif enerji sayacı (endüktif)',short:'kVArh ind.',unit:'kVArh',group:'energy',hints:[/(^|_)(eqi|eri|er_?ind|q_?ind|ind(uktif|uctive)?_?(kvarh|varh|enerji)?|kvarh_?(ind|l))(_|$)/]},
 {key:'eqc',label:'Reaktif enerji sayacı (kapasitif)',short:'kVArh kap.',unit:'kVArh',group:'energy',hints:[/(^|_)(eqc|erc|er_?cap|q_?cap|kap(asitif)?_?(kvarh|varh|enerji)?|cap(acitive)?_?(kvarh|varh)?|kvarh_?(cap|c))(_|$)/]},
];
export const energyRoleKeys=ENERGY_ROLES.map(r=>r.key);
export const energyRoleGroups:{id:EnergyRoleGroup;label:string}[]=[{id:'power',label:'Toplam güç'},{id:'phase',label:'Faz bazında'},{id:'quality',label:'Harmonik (THD)'},{id:'energy',label:'Enerji sayaçları'}];
export const energyRole=(key:string)=>ENERGY_ROLES.find(r=>r.key===key);

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const analyzerSchema=z.object({
 id,name:z.string().trim().min(1).max(80),
 // Serbest gruplama: "Kompresör dairesi", "Döküm hattı 2"... raporda ara toplam verir.
 group:z.string().trim().max(60).default(''),
 roles:z.record(z.string(),z.string().max(80)).default({}),
 // Etiket olceklemesi zaten muhendislik birimi uretir; birim farki (W, Wh, MWh) kaldiysa
 // burada kW / kWh'ye cevirmek icin carpan. Varsayilan 1 = etiket zaten kW / kWh.
 powerFactor:z.number().finite().positive().max(1e6).default(1),
 energyFactor:z.number().finite().positive().max(1e6).default(1),
 enabled:z.boolean().default(true)});
export type Analyzer=z.infer<typeof analyzerSchema>;

/* Uc zamanli tarife (EPDK): gunduz 06-17, puant 17-22, gece 22-06. Saatler tam saattir;
 * dilim her saatlik kovanin BASLANGIC saatine gore belirlenir. Fiyatlar TL/kWh. */
export const tariffSchema=z.object({
 dayStart:z.number().int().min(0).max(23).default(6),
 peakStart:z.number().int().min(0).max(23).default(17),
 nightStart:z.number().int().min(0).max(23).default(22),
 priceDay:z.number().finite().min(0).max(1000).default(0),
 pricePeak:z.number().finite().min(0).max(1000).default(0),
 priceNight:z.number().finite().min(0).max(1000).default(0),
 currency:z.string().trim().min(1).max(8).default('TL'),
 // Reaktif ceza siniri: enduktif/aktif ve kapasitif/aktif yuzde (yonetmelik varsayilani 20/15).
 inductiveLimitPct:z.number().min(0).max(100).default(20),
 capacitiveLimitPct:z.number().min(0).max(100).default(15),
 // Talep (demand) penceresi, dakika.
 demandMinutes:z.number().int().min(1).max(60).default(15)})
 .refine(t=>t.dayStart<t.peakStart&&t.peakStart<t.nightStart,{message:'Dilim saatleri sıralı olmalı: gündüz < puant < gece.'});
export type Tariff=z.infer<typeof tariffSchema>;
export const defaultTariff:Tariff=tariffSchema.parse({});

export const energySettingsSchema=z.object({analyzers:z.array(analyzerSchema).max(200).default([]),tariff:tariffSchema.default(defaultTariff)});
export type EnergySettings=z.infer<typeof energySettingsSchema>;
export const emptyEnergySettings:EnergySettings={analyzers:[],tariff:defaultTariff};

export type Band='day'|'peak'|'night';
export const bandLabels:Record<Band,string>={day:'Gündüz',peak:'Puant',night:'Gece'};
export const BANDS:Band[]=['day','peak','night'];
/** Yerel saate gore tarife dilimi. */
export function bandOf(hour:number,t:Pick<Tariff,'dayStart'|'peakStart'|'nightStart'>):Band{
 if(hour>=t.peakStart&&hour<t.nightStart)return 'peak';
 if(hour>=t.dayStart&&hour<t.peakStart)return 'day';
 return 'night';
}
export function bandPrice(b:Band,t:Tariff){return b==='day'?t.priceDay:b==='peak'?t.pricePeak:t.priceNight;}

/** Yapilandirmayi dogrular: eslenen her etiket var olmali, rol anahtari bilinmeli. */
export function validateEnergySettings(input:unknown,config:Config):EnergySettings{
 const s=energySettingsSchema.parse(input);
 const tagIds=new Set(config.tags.map(t=>t.id)),ids=new Set<string>();
 for(const a of s.analyzers){
  if(ids.has(a.id))throw Error(`Analizör kimliği tekrar ediyor: ${a.id}`);ids.add(a.id);
  for(const [role,tagId] of Object.entries(a.roles)){
   if(!energyRoleKeys.includes(role))throw Error(`${a.name}: bilinmeyen ölçüm rolü "${role}".`);
   if(tagId&&!tagIds.has(tagId))throw Error(`${a.name}: ${energyRole(role)!.label} için seçilen etiket yapılandırmada yok.`);
  }
  for(const k of Object.keys(a.roles))if(!a.roles[k])delete a.roles[k];
 }
 return s;
}

const fold=(s:string)=>s.toLocaleLowerCase('tr-TR').replace(/[ıi̇]/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c').replace(/φ/g,'fi').replace(/[^a-z0-9+]+/g,'_').replace(/^_|_$/g,'');
const SUGGEST_ORDER:EnergyRoleGroup[]=['quality','energy','power','phase'];
/** Bir cihazin etiketlerinden rol eslemesi onerir. Her etiket en fazla bir role, her rol en
 * fazla bir etikete gider; once kod, sonra ad denenir. Emin olunmayan rol bos kalir. */
export function suggestRoles(tags:{id:string;code:string;name:string}[]):Record<string,string>{
 const out:Record<string,string>={},used=new Set<string>();
 // Ozgul roller once: "THD_V_L3" once THD-V'ye gitsin, gerilim L3 deseni onu kapmasin.
 const order=[...ENERGY_ROLES].sort((a,b)=>SUGGEST_ORDER.indexOf(a.group)-SUGGEST_ORDER.indexOf(b.group));
 for(const field of ['code','name'] as const)for(const role of order){
  if(out[role.key])continue;
  const hit=tags.find(t=>!used.has(t.id)&&role.hints.some(h=>h.test(fold(t[field]))));
  if(hit){out[role.key]=hit.id;used.add(hit.id);}
 }
 return out;
}

/* --- Tuketim hesaplari ------------------------------------------------------------------ */
export type HourRow={analyzerId:string;hour:number;ea:number;eqi:number;eqc:number;pSum:number;pN:number;pMax:number|null;demandMax:number|null;gap:number};
export type Grouping='hour'|'day'|'month';
export type ConsumptionBucket={from:number;to:number;ea:number;eqi:number;eqc:number;byBand:Record<Band,number>;cost:number;pMax:number|null;pAvg:number|null;demandMax:number|null;demandAt:number|null;gap:number};
export type AnalyzerSummary={analyzerId:string;name:string;group:string;ea:number;eqi:number;eqc:number;byBand:Record<Band,number>;costByBand:Record<Band,number>;cost:number;inductivePct:number|null;capacitivePct:number|null;inductiveOver:boolean;capacitiveOver:boolean;pMax:number|null;pAvg:number|null;demandMax:number|null;demandAt:number|null;gapHours:number;hours:number};

const HOUR=3600000;
export function bucketStart(at:number,g:Grouping){
 const d=new Date(at);
 if(g==='hour'){d.setMinutes(0,0,0);return d.getTime();}
 d.setHours(0,0,0,0);if(g==='month')d.setDate(1);return d.getTime();
}
export function bucketEnd(start:number,g:Grouping){
 const d=new Date(start);
 if(g==='hour')return start+HOUR;
 if(g==='day'){d.setDate(d.getDate()+1);return d.getTime();}
 d.setMonth(d.getMonth()+1);return d.getTime();
}
const zeroBands=():Record<Band,number>=>({day:0,peak:0,night:0});
const pct=(num:number,den:number)=>den>0?num/den*100:null;

/** Saatlik satirlari istenen kovaya toplar (tum analizorler birlikte). */
export function groupHours(rows:HourRow[],g:Grouping,t:Tariff):ConsumptionBucket[]{
 const map=new Map<number,ConsumptionBucket&{pSum:number;pN:number}>();
 for(const r of rows){
  const k=bucketStart(r.hour,g);
  let b=map.get(k);
  if(!b){b={from:k,to:bucketEnd(k,g),ea:0,eqi:0,eqc:0,byBand:zeroBands(),cost:0,pMax:null,pAvg:null,demandMax:null,demandAt:null,gap:0,pSum:0,pN:0};map.set(k,b);}
  const band=bandOf(new Date(r.hour).getHours(),t);
  b.ea+=r.ea;b.eqi+=r.eqi;b.eqc+=r.eqc;b.byBand[band]+=r.ea;b.cost+=r.ea*bandPrice(band,t);b.gap+=r.gap;
  b.pSum+=r.pSum;b.pN+=r.pN;
  if(r.pMax!==null&&(b.pMax===null||r.pMax>b.pMax))b.pMax=r.pMax;
  if(r.demandMax!==null&&(b.demandMax===null||r.demandMax>b.demandMax)){b.demandMax=r.demandMax;b.demandAt=r.hour;}
 }
 return [...map.values()].sort((a,b)=>a.from-b.from).map(({pSum,pN,...b})=>({...b,pAvg:pN?pSum/pN:null}));
}

/** Analizor basina donem ozeti: dilim kWh/TL, reaktif oranlar ve ceza siniri. */
export function summarize(rows:HourRow[],analyzers:Analyzer[],t:Tariff):AnalyzerSummary[]{
 return analyzers.map(a=>{
  const mine=rows.filter(r=>r.analyzerId===a.id);
  const byBand=zeroBands(),costByBand=zeroBands();
  let ea=0,eqi=0,eqc=0,pSum=0,pN=0,pMax:number|null=null,demandMax:number|null=null,demandAt:number|null=null,gapHours=0;
  for(const r of mine){
   const band=bandOf(new Date(r.hour).getHours(),t);
   ea+=r.ea;eqi+=r.eqi;eqc+=r.eqc;byBand[band]+=r.ea;costByBand[band]+=r.ea*bandPrice(band,t);
   pSum+=r.pSum;pN+=r.pN;if(r.gap)gapHours++;
   if(r.pMax!==null&&(pMax===null||r.pMax>pMax))pMax=r.pMax;
   if(r.demandMax!==null&&(demandMax===null||r.demandMax>demandMax)){demandMax=r.demandMax;demandAt=r.hour;}
  }
  const inductivePct=a.roles.eqi?pct(eqi,ea):null,capacitivePct=a.roles.eqc?pct(eqc,ea):null;
  return {analyzerId:a.id,name:a.name,group:a.group,ea,eqi,eqc,byBand,costByBand,cost:costByBand.day+costByBand.peak+costByBand.night,
   inductivePct,capacitivePct,inductiveOver:inductivePct!==null&&inductivePct>t.inductiveLimitPct,capacitiveOver:capacitivePct!==null&&capacitivePct>t.capacitiveLimitPct,
   pMax,pAvg:pN?pSum/pN:null,demandMax,demandAt,gapHours,hours:mine.length};
 });
}

/** Faz dengesizligi (%): en buyuk sapma / ortalama. NEMA tanimi. */
export function imbalancePct(values:(number|null|undefined)[]):number|null{
 const v=values.filter((x):x is number=>typeof x==='number'&&Number.isFinite(x));
 if(v.length<2)return null;
 const avg=v.reduce((a,b)=>a+b,0)/v.length;
 if(Math.abs(avg)<1e-9)return null;
 return Math.max(...v.map(x=>Math.abs(x-avg)))/Math.abs(avg)*100;
}
