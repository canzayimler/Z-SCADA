import type {Part} from '../contracts/model';
/* --- Sembol katalogu (A0) --------------------------------------------------
 * Bir sembolun kimligi bugune kadar dort ayri yerde tanimliydi: model.ts
 * (symbolTypes/labels/symbolGroups/sizes/defaultParts), ports.ts (portMap,
 * weights) ve Symbol.tsx (flat, boxes). Yeni sembol eklemek dort dosyaya
 * dokunmayi ve hicbirini unutmamayi gerektiriyordu.
 *
 * Bu dosya TEK DOGRULUK KAYNAGIDIR ve BILEREK JSX ICERMEZ: model.ts sunucuda
 * calisir, React'e bagimli olmamalidir. Cizim fonksiyonlari ayri tutulur
 * (packages/symbols/renderers/*). Katalog yalniz veri tasir.
 */
export type PortDef={x:number;y:number;axis:'h'|'v'};
/** Adlandirilmis saha bagi (A1): tek `tagId` yerine role sahip bag listesi. */
export type BindingDef={role:string;label:string;kind:'bool'|'number'};
/** Ayni sembolun govde varyanti (konik tank, dalgic pompa, vidali kompresor...). */
export type VariantDef={key:string;label:string;labelEn?:string};
export type SymbolMeta={
 /** Tur anahtari; ekran modelinde saklanan degerdir, degistirilemez. */
 type:string;
 label:string;
 /** K09: Ingilizce etiket; verilmezse Turkce etikete duser. */
 labelEn?:string;
 group:string;
 /** K09: Ingilizce grup adi; verilmezse Turkce grup adina duser. */
 groupEn?:string;
 /** Varsayilan olcu; verilmezse 120x100. */
 size?:readonly [number,number];
 /** 120x100 goruntu kutusundaki boru/kanal baglanti agizlari. */
 ports?:readonly PortDef[];
 /** Baglanti agzinin goruntu kutusundaki kalinligi. */
 portWeight?:number;
 /** Yeni nesnede hazir gelen kademeler. */
 parts?:readonly Part[];
 /** Bu sembolun anlamli saha baglari; G07/G08/G22 gibi cok durumlu semboller kullanir. */
 bindings?:readonly BindingDef[];
 /** Boru ailesi: goruntu kutusu nesne olcusune gerilir, etiket cizilmez. */
 flat?:boolean;
 /** Standart disi goruntu kutusu. */
 viewBox?:string;
 /** Kademe (parts) destegi. */
 supportsParts?:boolean;
 /** Operator komutu yazan nesne. */
 command?:boolean;
 /** Buton ailesi (komut + basili/birakildi gorunumu). */
 button?:boolean;
 /** Cok durumlu ekipman ailesi; `phaseOf` hangi durum makinesini uygulayacagini buradan bilir. */
 family?:'valve'|'motor'|'switchgear'|'conveyor';
 /** Govde varyantlari; ilk kayit varsayilandir (bos `variant` degeri onu secer). */
 variants?:readonly VariantDef[];
};
const P=(x:number,y:number,axis:'h'|'v'):PortDef=>({x,y,axis});
const part=(label:string,color:string,value:number):Part=>({tagId:'',label,color,value,upper:null,expected:true});
/** Sik kullanilan bag kumeleri; ayni rolun adi her sembolde ayni kalsin diye. */
const motorBindings:BindingDef[]=[
 {role:'running',label:'Çalışıyor',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},
 {role:'ready',label:'Hazır',kind:'bool'},{role:'remote',label:'Uzaktan',kind:'bool'},
 {role:'speed',label:'Gerçek hız',kind:'number'},{role:'speedRef',label:'Hız referansı',kind:'number'},
 {role:'current',label:'Akım',kind:'number'}];
const valveBindings:BindingDef[]=[
 {role:'openLimit',label:'Açık limiti',kind:'bool'},{role:'closeLimit',label:'Kapalı limiti',kind:'bool'},
 {role:'fault',label:'Arıza',kind:'bool'},{role:'position',label:'Gerçek açıklık',kind:'number'},
 {role:'target',label:'Hedef açıklık',kind:'number'}];
/* G10: boruda akis bir ac/kapa degildir. Isaretli debi hem YONU hem HIZI
 * tasir: eksi deger ters yon, buyuk deger hizli akis. Bagsiz boru eski
 * davranisini surdurur (tekil etikete gore ac/kapa). */
const flowBindings:BindingDef[]=[{role:'flow',label:'Debi (işaretli)',kind:'number'}];
const switchgearBindings:BindingDef[]=[
 {role:'closed',label:'Kapalı (enerjili)',kind:'bool'},{role:'open',label:'Açık',kind:'bool'},
 {role:'trip',label:'Trip / açtırma',kind:'bool'}];
/* Kutuphane panelindeki grup ve grup ici siralama; ekran modelindeki
 * `symbolTypes` sirasindan BAGIMSIZDIR (kayit sirasi degismeden panel
 * duzenlenebilsin diye). Katalogda olup burada listelenmeyen tur panelde
 * grubunun sonuna dusler; eksik/fazla kayit `auditCatalog` ile yakalanir. */
const groupLayout:{name:string;types:string[]}[]=[
 {name:'SENSÖR & OTOMASYON',types:['cylinder','proximity','photoelectric','plc','weighing']},
 {name:'BUTON & ANAHTAR',types:['button','push-button','toggle-switch','key-switch','navigation','selector','slider','keypad']},
 {name:'LAMBA & SİNYAL',types:['indicator','lamp-square','bulb','beacon','led-bar','tower-light','multi-state','emergency-stop']},
 {name:'ELEKTRİK',types:['breaker','disconnector','contactor','fuse','transformer','busbar','generator','ups','inverter','pv-panel','battery','power-meter']},
 {name:'EKİPMAN',types:['motor','pump','compressor','fan','conveyor','mixer','agitator','centrifuge','heater','filter','heat-exchanger','hoist']},
 {name:'ISIL EKİPMAN',types:['boiler','burner','chiller','cooling-tower','dryer']},
 {name:'HVAC',types:['ahu','damper','duct','coil','air-filter']},
 {name:'VANALAR',types:['valve','gate-valve','globe-valve','ball-valve','butterfly-valve','check-valve','solenoid-valve','control-valve','three-way-valve']},
 {name:'KAPLAR',types:['tank','silo','vessel','column','drum','hopper','cyclone']},
 {name:'ÖLÇÜM',types:['gauge','level-bar','thermometer','flow-meter','instrument','value','numeric-input']},
 {name:'BORU HATTI',types:['pipe','elbow','tee','cross','reducer','flange']},
 {name:'GÖSTERGE',types:['trend','pid','alarm-band','alarm-list','data-table','data-card']},
 {name:'YERLEŞİM',types:['text','rectangle','section','ellipse','polygon','star','line','arrow','callout','alarm','info','image']}];
export const groupOrder=groupLayout.map(g=>g.name);
/** Katalogdaki BUYUK HARF grup adini arayuzde sade yaziya cevirir; kisaltmalar korunur. */
const acronyms=new Set(['HVAC','PLC','UPS','PV','&']);
export function groupTitle(name:string,language:'tr'|'en'='tr'){
 const loc=language==='tr'?'tr':'en';
 return name.split(' ').map((w,i)=>acronyms.has(w)?w:i===0?w.charAt(0)+w.slice(1).toLocaleLowerCase(loc):w.toLocaleLowerCase(loc)).join(' ');
}
/** K09: grup adlarinin Ingilizce karsiligi. */
export const groupNamesEn:Record<string,string>={"SENSÖR & OTOMASYON": "SENSORS & AUTOMATION", "BUTON & ANAHTAR": "BUTTONS & SWITCHES", "LAMBA & SİNYAL": "LAMPS & SIGNALS", "ELEKTRİK": "ELECTRICAL", "EKİPMAN": "EQUIPMENT", "VANALAR": "VALVES", "KAPLAR": "VESSELS", "ÖLÇÜM": "MEASUREMENT", "BORU HATTI": "PIPING", "YERLEŞİM": "LAYOUT", "ISIL EKİPMAN": "THERMAL EQUIPMENT", "HVAC": "HVAC", "GÖSTERGE": "INDICATORS"};
/* Sira ekran modelinde saklanan `symbolTypes` sirasidir; mevcut kayitlarla
 * uyum icin basa/ortaya ekleme yapilmaz, yeni turler sona eklenir. */
const raw=[
 // --- SENSÖR & OTOMASYON
 {type:'cylinder',label:'Silindir',labelEn:'Cylinder',group:'SENSÖR & OTOMASYON',size:[210,95]},
 {type:'proximity',label:'Yaklaşım sensörü',labelEn:'Proximity sensor',group:'SENSÖR & OTOMASYON',size:[120,90]},
 {type:'photoelectric',label:'Fotosel',labelEn:'Photoelectric sensor',group:'SENSÖR & OTOMASYON',size:[140,90]},
 {type:'plc',label:'PLC modülü',labelEn:'PLC module',group:'SENSÖR & OTOMASYON',size:[140,150]},
 {type:'weighing',label:'Tartım platformu',labelEn:'Weighing platform',group:'SENSÖR & OTOMASYON',size:[150,120]},
 // --- BUTON & ANAHTAR
 {type:'button',label:'Buton',labelEn:'Button',group:'BUTON & ANAHTAR',size:[130,48],command:true,button:true},
 {type:'push-button',label:'Basmalı buton',labelEn:'Push button',group:'BUTON & ANAHTAR',size:[110,110],command:true,button:true},
 {type:'toggle-switch',label:'Aç/kapa anahtarı',labelEn:'Toggle switch',group:'BUTON & ANAHTAR',size:[150,80],command:true,button:true},
 {type:'key-switch',label:'Anahtarlı şalter',labelEn:'Key switch',group:'BUTON & ANAHTAR',size:[110,110],command:true,button:true},
 // --- LAMBA & SİNYAL
 {type:'indicator',label:'Lamba',labelEn:'Pilot light',group:'LAMBA & SİNYAL',supportsParts:true},
 {type:'lamp-square',label:'Kare lamba',labelEn:'Square lamp',group:'LAMBA & SİNYAL',size:[120,100],supportsParts:true},
 {type:'bulb',label:'Ampul',labelEn:'Bulb',group:'LAMBA & SİNYAL',size:[100,120],viewBox:'10 0 100 104'},
 {type:'beacon',label:'Çakar lamba',labelEn:'Beacon',group:'LAMBA & SİNYAL',size:[100,120],viewBox:'10 0 100 104'},
 {type:'led-bar',label:'LED bar',labelEn:'LED bar',group:'LAMBA & SİNYAL',size:[210,70]},
 {type:'tower-light',label:'Sinyal kulesi',labelEn:'Stack light',group:'LAMBA & SİNYAL',size:[70,170],viewBox:'40 0 40 100',supportsParts:true,
  parts:[part('Arıza','#c0392b',2),part('Uyarı','#d8a52e',1),part('Çalışıyor','#3f9e57',0)]},
 {type:'selector',label:'Seçici anahtar',labelEn:'Selector switch',group:'BUTON & ANAHTAR',supportsParts:true,command:true,
  parts:[part('0','#8a9ca9',0),part('1','#208169',1)]},
 {type:'emergency-stop',label:'Acil durdurma göstergesi',labelEn:'Emergency stop indicator',group:'LAMBA & SİNYAL'},
 // --- ELEKTRİK
 {type:'contactor',label:'Kontaktör',labelEn:'Contactor',group:'ELEKTRİK',bindings:switchgearBindings,family:'switchgear'},
 {type:'breaker',label:'Şalter',labelEn:'Circuit breaker',group:'ELEKTRİK',bindings:switchgearBindings,family:'switchgear'},
 // --- EKİPMAN
 {type:'motor',label:'Motor',labelEn:'Motor',group:'EKİPMAN',bindings:motorBindings,family:'motor'},
 {type:'pump',label:'Pompa',labelEn:'Pump',group:'EKİPMAN',ports:[P(3,38,'h'),P(117,35,'h')],portWeight:16,bindings:motorBindings,family:'motor',variants:[{key:'centrifugal',label:'Santrifüj',labelEn:'Centrifugal'},{key:'vacuum',label:'Vakum',labelEn:'Vacuum'},{key:'submersible',label:'Dalgıç',labelEn:'Submersible'},{key:'dosing',label:'Dozaj',labelEn:'Dosing'}]},
 {type:'compressor',label:'Kompresör',labelEn:'Compressor',group:'EKİPMAN',ports:[P(4,40,'h'),P(115,40,'h')],portWeight:16,bindings:motorBindings,family:'motor',variants:[{key:'generic',label:'Genel',labelEn:'Generic'},{key:'screw',label:'Vidalı',labelEn:'Screw'},{key:'piston',label:'Pistonlu',labelEn:'Reciprocating'}]},
 {type:'fan',label:'Fan',labelEn:'Fan',group:'EKİPMAN',bindings:motorBindings,family:'motor'},
 {type:'conveyor',label:'Konveyör',labelEn:'Conveyor',group:'EKİPMAN',size:[260,90],variants:[{key:'belt',label:'Bantlı',labelEn:'Belt'},{key:'roller',label:'Rulolu',labelEn:'Roller'},{key:'screw',label:'Helezon',labelEn:'Screw'},{key:'bucket',label:'Kovalı elevatör',labelEn:'Bucket elevator'}],
  bindings:[{role:'running',label:'Çalışıyor',kind:'bool'},{role:'reverse',label:'Ters yön',kind:'bool'},{role:'jam',label:'Sıkışma',kind:'bool'},{role:'speed',label:'Hız',kind:'number'}],family:'conveyor'},
 {type:'mixer',label:'Karıştırıcı',labelEn:'Mixer',group:'EKİPMAN',ports:[P(30,22,'v'),P(90,22,'v'),P(60,78,'v')],portWeight:14,variants:[{key:'tank',label:'Kaplı',labelEn:'In vessel'},{key:'inline',label:'Hat üstü',labelEn:'Inline'}]},
 {type:'heater',label:'Isıtıcı',labelEn:'Heater',group:'EKİPMAN',ports:[P(24,40,'h'),P(96,40,'h')],portWeight:20},
 {type:'filter',label:'Filtre',labelEn:'Filter',group:'EKİPMAN',ports:[P(60,14,'v'),P(60,74,'v')],portWeight:24,variants:[{key:'generic',label:'Genel',labelEn:'Generic'},{key:'cartridge',label:'Kartuş',labelEn:'Cartridge'},{key:'bag',label:'Torba',labelEn:'Bag'},{key:'backwash',label:'Ters yıkamalı',labelEn:'Backwash'}],bindings:[{role:'differential',label:'Fark basıncı',kind:'number'},{role:'cleaning',label:'Temizleme',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'}]},
 {type:'heat-exchanger',label:'Eşanjör',labelEn:'Heat exchanger',group:'EKİPMAN',size:[200,110],ports:[P(2,30,'h'),P(118,52,'h')],portWeight:12,variants:[{key:'shell',label:'Gövde-boru',labelEn:'Shell and tube'},{key:'plate',label:'Plakalı',labelEn:'Plate'}],bindings:[{role:'inlet',label:'Sıcak giriş',kind:'number'},{role:'outlet',label:'Sıcak çıkış',kind:'number'},{role:'coldInlet',label:'Soğuk giriş',kind:'number'},{role:'coldOutlet',label:'Soğuk çıkış',kind:'number'}]},
 // --- VANALAR
 {type:'valve',label:'Vana',labelEn:'Valve',group:'VANALAR',ports:[P(12,42,'h'),P(108,42,'h')],portWeight:38,bindings:valveBindings,family:'valve'},
 {type:'check-valve',label:'Çek valf',labelEn:'Check valve',group:'VANALAR',ports:[P(2,47,'h'),P(118,47,'h')],portWeight:44},
 {type:'butterfly-valve',label:'Kelebek vana',labelEn:'Butterfly valve',group:'VANALAR',ports:[P(2,44,'h'),P(118,44,'h')],portWeight:14,bindings:valveBindings,family:'valve'},
 {type:'ball-valve',label:'Küresel vana',labelEn:'Ball valve',group:'VANALAR',ports:[P(2,44,'h'),P(118,44,'h')],portWeight:14,bindings:valveBindings,family:'valve'},
 {type:'solenoid-valve',label:'Selenoid vana',labelEn:'Solenoid valve',group:'VANALAR',ports:[P(18,46,'h'),P(94,46,'h')],portWeight:32,bindings:valveBindings,family:'valve'},
 {type:'control-valve',label:'Kontrol vanası',labelEn:'Control valve',group:'VANALAR',ports:[P(18,56,'h'),P(94,56,'h')],portWeight:32,bindings:valveBindings,family:'valve'},
 // --- KAPLAR
 {type:'tank',label:'Tank',labelEn:'Tank',group:'KAPLAR',size:[120,130],ports:[P(60,6,'v'),P(60,78,'v')],portWeight:16,variants:[{key:'cylindrical',label:'Silindirik',labelEn:'Cylindrical'},{key:'cone',label:'Konik tabanlı',labelEn:'Cone bottom'},{key:'jacketed',label:'Ceketli',labelEn:'Jacketed'},{key:'open',label:'Açık havuz',labelEn:'Open basin'}]},
 {type:'silo',label:'Silo',labelEn:'Silo',group:'KAPLAR',size:[110,150],viewBox:'22 0 76 100',ports:[P(60,8,'v'),P(60,90,'v')],portWeight:16},
 {type:'vessel',label:'Yatay tank',labelEn:'Horizontal vessel',group:'KAPLAR',size:[200,110],ports:[P(12,44,'h'),P(108,44,'h')],portWeight:20},
 // --- ÖLÇÜM
 {type:'gauge',label:'Gösterge',labelEn:'Gauge',group:'ÖLÇÜM',size:[130,120]},
 {type:'level-bar',label:'Seviye çubuğu',labelEn:'Level bar',group:'ÖLÇÜM',size:[70,150],viewBox:'32 0 56 100'},
 {type:'thermometer',label:'Termometre',labelEn:'Thermometer',group:'ÖLÇÜM',size:[70,150],viewBox:'36 0 48 100'},
 {type:'flow-meter',label:'Debimetre',labelEn:'Flow meter',group:'ÖLÇÜM',ports:[P(2,40,'h'),P(118,40,'h')],portWeight:16},
 // --- BORU HATTI
 {type:'pipe',label:'Boru',labelEn:'Pipe',group:'BORU HATTI',size:[220,40],flat:true,ports:[P(0,50,'h'),P(120,50,'h')],bindings:flowBindings},
 {type:'elbow',label:'Dirsek',labelEn:'Elbow',group:'BORU HATTI',size:[120,60],flat:true,ports:[P(0,50,'h'),P(60,0,'v')],bindings:flowBindings},
 {type:'tee',label:'T boru',labelEn:'Tee',group:'BORU HATTI',size:[220,40],flat:true,ports:[P(0,50,'h'),P(120,50,'h'),P(60,0,'v')],bindings:flowBindings},
 {type:'cross',label:'Kesişim',labelEn:'Cross',group:'BORU HATTI',size:[220,40],flat:true,ports:[P(0,50,'h'),P(120,50,'h'),P(60,0,'v'),P(60,100,'v')],bindings:flowBindings},
 {type:'reducer',label:'Redüksiyon',labelEn:'Reducer',group:'BORU HATTI',size:[140,40],flat:true,ports:[P(0,50,'h'),P(120,50,'h')],bindings:flowBindings},
 // --- LAMBA & SİNYAL (devam) / YERLEŞİM / ÖLÇÜM
 {type:'multi-state',label:'Çok durumlu lamba',labelEn:'Multi-state indicator',group:'LAMBA & SİNYAL',size:[150,110],supportsParts:true,
  parts:[part('Durdu','#8a9ca9',0),part('Çalışıyor','#208169',1),part('Arıza','#c0392b',2)]},
 {type:'text',label:'Metin',labelEn:'Text',group:'YERLEŞİM',size:[240,40]},
 {type:'value',label:'Değer',labelEn:'Value',group:'ÖLÇÜM'},
 {type:'numeric-input',label:'Analog giriş',labelEn:'Analog input',group:'ÖLÇÜM',size:[220,110],command:true},
 {type:'rectangle',label:'Alan',labelEn:'Area',group:'YERLEŞİM',size:[220,140]},
 {type:'navigation',label:'Ekran geçişi',labelEn:'Screen link',group:'BUTON & ANAHTAR',size:[130,48]},
 {type:'alarm',label:'Alarm',labelEn:'Alarm',group:'YERLEŞİM',size:[240,44]},
 {type:'info',label:'Bilgi düğmesi',labelEn:'Info button',group:'YERLEŞİM',size:[54,54]},
 {type:'image',label:'Görsel',labelEn:'Image',group:'YERLEŞİM',size:[240,170]},
 /* --- Buradan sonrasi A0 sonrasi eklenen turlerdir. Kayit sirasi korunsun
  * diye yeni turler HER ZAMAN sona eklenir. */
 // G31: ISA-5.1 olcum balonu. Harf kodu ve cevrim numarasi nesne etiketinden
 // okunur ("FT-101"); montaj yeri varyantla secilir.
 {type:'instrument',label:'Ölçüm balonu',labelEn:'Instrument balloon',group:'ÖLÇÜM',size:[110,110],
  variants:[{key:'field',label:'Sahada',labelEn:'Field mounted'},{key:'panel',label:'Panoda',labelEn:'Panel mounted'},{key:'behind',label:'Pano arkası',labelEn:'Behind panel'},{key:'dcs',label:'DCS / PLC',labelEn:'DCS / PLC'}]},
 // --- PROSES EKIPMANI (G12-G21) -------------------------------------------
 {type:'boiler',label:'Kazan',labelEn:'Boiler',group:'ISIL EKİPMAN',size:[160,150],ports:[P(20,30,'h'),P(100,10,'v'),P(60,92,'v')],portWeight:16,
  bindings:[{role:'running',label:'Çalışıyor',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'pressure',label:'Basınç',kind:'number'},{role:'temperature',label:'Sıcaklık',kind:'number'},{role:'level',label:'Su seviyesi',kind:'number'}]},
 {type:'burner',label:'Brülör',labelEn:'Burner',group:'ISIL EKİPMAN',size:[150,100],ports:[P(4,50,'h'),P(116,50,'h')],portWeight:14,
  bindings:[{role:'flame',label:'Alev var',kind:'bool'},{role:'trip',label:'Kilitlendi',kind:'bool'},{role:'stage',label:'Evre',kind:'number'},{role:'load',label:'Yük',kind:'number'}]},
 {type:'chiller',label:'Soğutma grubu',labelEn:'Chiller',group:'ISIL EKİPMAN',size:[170,120],ports:[P(2,30,'h'),P(2,70,'h'),P(118,30,'h'),P(118,70,'h')],portWeight:12,
  bindings:[{role:'running',label:'Çalışıyor',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'inlet',label:'Giriş sıcaklığı',kind:'number'},{role:'outlet',label:'Çıkış sıcaklığı',kind:'number'},{role:'load',label:'Yük',kind:'number'}]},
 {type:'cooling-tower',label:'Soğutma kulesi',labelEn:'Cooling tower',group:'ISIL EKİPMAN',size:[160,150],ports:[P(18,80,'h'),P(102,80,'h')],portWeight:14,
  bindings:[{role:'fan',label:'Fan çalışıyor',kind:'bool'},{role:'pump',label:'Pompa çalışıyor',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'temperature',label:'Su sıcaklığı',kind:'number'}]},
 {type:'centrifuge',label:'Santrifüj',labelEn:'Centrifuge',group:'EKİPMAN',size:[150,130],ports:[P(60,8,'v'),P(30,88,'v'),P(90,88,'v')],portWeight:14,
  bindings:[{role:'running',label:'Çalışıyor',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'lock',label:'Kapak kilidi',kind:'bool'},{role:'speed',label:'Devir',kind:'number'}]},
 {type:'dryer',label:'Kurutucu',labelEn:'Dryer',group:'ISIL EKİPMAN',size:[170,120],ports:[P(2,50,'h'),P(118,50,'h')],portWeight:16,
  bindings:[{role:'running',label:'Çalışıyor',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'temperature',label:'Sıcaklık',kind:'number'},{role:'humidity',label:'Nem',kind:'number'}]},
 {type:'agitator',label:'Karıştırıcı pervanesi',labelEn:'Agitator',group:'EKİPMAN',size:[110,140],
  bindings:[{role:'running',label:'Çalışıyor',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'speed',label:'Devir',kind:'number'}]},
 {type:'hoist',label:'Vinç / kaldırıcı',labelEn:'Hoist',group:'EKİPMAN',size:[150,150],
  bindings:[{role:'upLimit',label:'Üst limit',kind:'bool'},{role:'downLimit',label:'Alt limit',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'height',label:'Yükseklik',kind:'number'}]},
 // --- KAPLAR (G01) ---------------------------------------------------------
 {type:'column',label:'Kolon / kule',labelEn:'Column',group:'KAPLAR',size:[110,190],ports:[P(60,4,'v'),P(20,50,'h'),P(100,60,'h'),P(60,96,'v')],portWeight:14},
 {type:'hopper',label:'Huni',labelEn:'Hopper',group:'KAPLAR',size:[130,130],ports:[P(60,6,'v'),P(60,94,'v')],portWeight:16},
 {type:'drum',label:'Varil',labelEn:'Drum',group:'KAPLAR',size:[110,140],ports:[P(60,8,'v'),P(60,92,'v')],portWeight:14},
 {type:'cyclone',label:'Siklon',labelEn:'Cyclone',group:'KAPLAR',size:[120,170],ports:[P(14,24,'h'),P(60,4,'v'),P(60,96,'v')],portWeight:14},
 // --- VANALAR (G04-G06) ----------------------------------------------------
 {type:'gate-valve',label:'Sürgülü vana',labelEn:'Gate valve',group:'VANALAR',ports:[P(6,44,'h'),P(114,44,'h')],portWeight:34,bindings:valveBindings,family:'valve'},
 {type:'globe-valve',label:'Glob vana',labelEn:'Globe valve',group:'VANALAR',ports:[P(4,48,'h'),P(116,48,'h')],portWeight:30,bindings:valveBindings,family:'valve'},
 {type:'three-way-valve',label:'Üç yollu vana',labelEn:'Three-way valve',group:'VANALAR',size:[140,120],ports:[P(6,52,'h'),P(114,52,'h'),P(60,96,'v')],portWeight:26,
  bindings:[{role:'pathA',label:'A yolu açık',kind:'bool'},{role:'pathB',label:'B yolu açık',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'position',label:'Paylaştırma',kind:'number'}]},
 // --- BORU HATTI (G09) -----------------------------------------------------
 {type:'flange',label:'Flanş',labelEn:'Flange',group:'BORU HATTI',size:[70,70],ports:[P(4,50,'h'),P(116,50,'h')],portWeight:30,
  variants:[{key:'pair',label:'Flanş çifti',labelEn:'Flange pair'},{key:'blind',label:'Kör flanş',labelEn:'Blind flange'}]},
 // --- ELEKTRIK (G23-G30) ---------------------------------------------------
 {type:'transformer',label:'Transformatör',labelEn:'Transformer',group:'ELEKTRİK',size:[130,140],
  bindings:[{role:'energised',label:'Enerjili',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'load',label:'Yük',kind:'number'},{role:'temperature',label:'Sıcaklık',kind:'number'}]},
 {type:'busbar',label:'Bara',labelEn:'Busbar',group:'ELEKTRİK',size:[260,50],
  bindings:[{role:'energised',label:'Enerjili',kind:'bool'},{role:'voltage',label:'Gerilim',kind:'number'}]},
 {type:'generator',label:'Jeneratör',labelEn:'Generator',group:'ELEKTRİK',size:[140,130],
  bindings:[{role:'running',label:'Çalışıyor',kind:'bool'},{role:'online',label:'Şebekeye bağlı',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'power',label:'Güç',kind:'number'},{role:'frequency',label:'Frekans',kind:'number'}]},
 {type:'ups',label:'Kesintisiz güç kaynağı',labelEn:'UPS',group:'ELEKTRİK',size:[150,130],
  bindings:[{role:'mode',label:'Mod',kind:'number'},{role:'charge',label:'Şarj yüzdesi',kind:'number'},{role:'fault',label:'Arıza',kind:'bool'}]},
 {type:'inverter',label:'İnverter',labelEn:'Inverter',group:'ELEKTRİK',size:[140,120],
  bindings:[{role:'running',label:'Çalışıyor',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'dcVoltage',label:'DC gerilim',kind:'number'},{role:'acPower',label:'AC güç',kind:'number'}]},
 {type:'pv-panel',label:'Güneş paneli',labelEn:'PV panel',group:'ELEKTRİK',size:[170,120],
  bindings:[{role:'power',label:'Güç',kind:'number'},{role:'voltage',label:'Gerilim',kind:'number'},{role:'current',label:'Akım',kind:'number'},{role:'fault',label:'Arıza',kind:'bool'}]},
 {type:'battery',label:'Batarya',labelEn:'Battery',group:'ELEKTRİK',size:[140,110],
  bindings:[{role:'charge',label:'Şarj yüzdesi',kind:'number'},{role:'power',label:'İşaretli güç',kind:'number'},{role:'fault',label:'Arıza',kind:'bool'}]},
 {type:'power-meter',label:'Enerji analizörü',labelEn:'Power meter',group:'ELEKTRİK',size:[180,140],
  bindings:[{role:'voltage',label:'Gerilim',kind:'number'},{role:'current',label:'Akım',kind:'number'},{role:'power',label:'Güç',kind:'number'},{role:'energy',label:'Enerji',kind:'number'},{role:'frequency',label:'Frekans',kind:'number'}]},
 {type:'fuse',label:'Sigorta',labelEn:'Fuse',group:'ELEKTRİK',size:[110,90],
  bindings:[{role:'closed',label:'Sağlam',kind:'bool'},{role:'trip',label:'Attı',kind:'bool'}]},
 {type:'disconnector',label:'Ayırıcı',labelEn:'Disconnector',group:'ELEKTRİK',bindings:switchgearBindings,family:'switchgear'},
 // --- HVAC (G32-G36) -------------------------------------------------------
 {type:'ahu',label:'Klima santrali',labelEn:'Air handling unit',group:'HVAC',size:[260,140],ports:[P(2,32,'h'),P(2,72,'h'),P(118,32,'h'),P(118,72,'h')],portWeight:14,
  bindings:[{role:'supplyFan',label:'Üfleme fanı',kind:'bool'},{role:'returnFan',label:'Dönüş fanı',kind:'bool'},{role:'fault',label:'Arıza',kind:'bool'},{role:'temperature',label:'Sıcaklık',kind:'number'},{role:'humidity',label:'Nem',kind:'number'},{role:'damper',label:'Damper konumu',kind:'number'}]},
 {type:'damper',label:'Hava damperi',labelEn:'Damper',group:'HVAC',size:[130,110],ports:[P(4,50,'h'),P(116,50,'h')],portWeight:40,bindings:valveBindings,family:'valve'},
 {type:'duct',label:'Hava kanalı',labelEn:'Duct',group:'HVAC',size:[240,60],flat:true,ports:[P(0,50,'h'),P(120,50,'h')],bindings:flowBindings},
 {type:'coil',label:'Serpantin',labelEn:'Coil',group:'HVAC',size:[140,120],ports:[P(4,30,'h'),P(4,74,'h')],portWeight:12,
  bindings:[{role:'inlet',label:'Giriş sıcaklığı',kind:'number'},{role:'outlet',label:'Çıkış sıcaklığı',kind:'number'},{role:'position',label:'Vana açıklığı',kind:'number'}]},
 {type:'air-filter',label:'Hava filtresi',labelEn:'Air filter',group:'HVAC',size:[120,120],ports:[P(4,50,'h'),P(116,50,'h')],portWeight:40,
  bindings:[{role:'differential',label:'Fark basıncı',kind:'number'},{role:'dirty',label:'Kirli sinyali',kind:'bool'}]},
 // --- KONTROL & GOSTERGE (G37-G39, G44-G45) --------------------------------
 {type:'trend',label:'Trend grafiği',labelEn:'Trend chart',group:'GÖSTERGE',size:[420,240]},
 {type:'alarm-band',label:'Alarm bandı',labelEn:'Alarm banner',group:'GÖSTERGE',size:[420,56]},
 {type:'alarm-list',label:'Alarm listesi',labelEn:'Alarm list',group:'GÖSTERGE',size:[440,240]},
 {type:'slider',label:'Analog sürgü',labelEn:'Slider',group:'BUTON & ANAHTAR',size:[240,90],command:true},
 {type:'keypad',label:'Sayısal tuş takımı',labelEn:'Numeric keypad',group:'BUTON & ANAHTAR',size:[200,240],command:true},
 {type:'data-table',label:'Değer tablosu',labelEn:'Data table',group:'GÖSTERGE',size:[320,200]},
 // --- YERLESIM (G46-G47) ---------------------------------------------------
 {type:'arrow',label:'Yön oku',labelEn:'Arrow',group:'YERLEŞİM',size:[160,60]},
 {type:'callout',label:'Açıklama balonu',labelEn:'Callout',group:'YERLEŞİM',size:[220,110]},
 {type:'line',label:'Çizgi',labelEn:'Line',group:'YERLEŞİM',size:[200,40],flat:true},
 {type:'ellipse',label:'Elips',labelEn:'Ellipse',group:'YERLEŞİM',size:[180,120]},
 {type:'polygon',label:'Çokgen',labelEn:'Polygon',group:'YERLEŞİM',size:[140,130]},
 {type:'star',label:'Yıldız',labelEn:'Star',group:'YERLEŞİM',size:[140,130]},
 {type:'section',label:'Bölme',labelEn:'Section',group:'YERLEŞİM',size:[320,200]},
 /* G41: PID isletme paneli. Surekli proseste operator uc sayiyi BIRLIKTE
  * gormeden karar veremez: olculen deger (PV), hedef (SP) ve cikis (OUT).
  * Mod ve sapma ayrica gosterilir; SP yazma yolu nesneye baglanan sayisal
  * komuttan gecer (buton/surgu ile AYNI onay ve izin zinciri). */
 {type:'pid',label:'PID işletme paneli',labelEn:'PID faceplate',group:'GÖSTERGE',size:[240,220],command:true,
  bindings:[{role:'pv',label:'Ölçülen değer (PV)',kind:'number'},{role:'sp',label:'Hedef (SP)',kind:'number'},
   {role:'output',label:'Çıkış (OUT)',kind:'number'},{role:'auto',label:'Otomatik mod',kind:'bool'},
   {role:'fault',label:'Arıza',kind:'bool'},{role:'tracking',label:'Takip / zorlama',kind:'bool'}]}
 ,{type:'data-card',label:'Kurumsal veri kartı',labelEn:'Corporate data card',group:'GÖSTERGE',size:[300,130],
  variants:[{key:'window',label:'Pencere',labelEn:'Window'},{key:'card',label:'Kart',labelEn:'Card'},{key:'compact',label:'Kompakt satır',labelEn:'Compact row'}]}
] as const satisfies readonly SymbolMeta[];
export type SymbolType=typeof raw[number]['type'];
/** Katalogun kendisi; alanlari SymbolMeta olarak gorunur (tur birlesimi degil). */
export const catalog:readonly SymbolMeta[]=raw as readonly SymbolMeta[];
const byType=new Map<string,SymbolMeta>(catalog.map(m=>[m.type,m]));
/** Turun katalog grubu (ISA-101 stili hangi sembollere uygulanir, bkz. isa.ts). */
export function groupOfType(type:string){return byType.get(type)?.group;}
/** Bir turun katalog kaydi; bilinmeyen tur icin undefined. */
export function meta(type:string):SymbolMeta|undefined{return byType.get(type);}
const list=catalog;
export const symbolTypes=list.map(m=>m.type) as unknown as readonly SymbolType[];
export const labels=Object.fromEntries(list.map(m=>[m.type,m.label])) as Record<SymbolType,string>;
export const labelsEn=Object.fromEntries(list.map(m=>[m.type,m.labelEn||m.label])) as Record<SymbolType,string>;
/** K09: secili dile gore sembol etiketleri; cevirisi olmayan tur Turkce kalir. */
export function labelsOf(language:'tr'|'en'):Record<SymbolType,string>{return language==='en'?labelsEn:labels;}
/** K09: secili dile gore kutuphane gruplari. `key` dilden BAGIMSIZ kimliktir
 * (acik/kapali panel durumu dil degisince bozulmasin diye). */
export function symbolGroupsOf(language:'tr'|'en'){return symbolGroups.map(g=>({key:g.name,types:g.types,name:language==='en'?(groupNamesEn[g.name]||g.name):g.name}));}
export const symbolGroups=groupLayout.map(g=>{
 const declared=g.types.filter(t=>byType.has(t));
 const rest=list.filter(m=>m.group===g.name&&!declared.includes(m.type)).map(m=>m.type);
 return {name:g.name,types:[...declared,...rest]};
}) as unknown as {name:string;types:SymbolType[]}[];
/** Katalog ile panel duzeni arasindaki tutarsizliklar; testten cagrilir. */

/* G47: sag paneldeki ayar bolumleri. Panel bugune kadar HER sembole ayni
 * listeyi gosteriyordu: metne animasyon hizi, boruya yazi hizasi, gostergeye
 * cizmedigi isletme bandi. Karsiligi olmayan ayar, ayar degildir. Asagidaki
 * kumeler "bu turun cizimi bu alani GERCEKTEN kullaniyor mu" sorusunun
 * cevabidir; panel yalnizca bunlari gosterir. Yeni sembol eklerken tur
 * buraya da yazilir, `auditCatalog` yazilmayani yakalar. */
const scaleTypes=new Set(['gauge','level-bar','thermometer','flow-meter','value','numeric-input','instrument','led-bar','weighing','slider','keypad','pid','tank','silo','vessel','column','drum','hopper','boiler','filter','hoist','control-valve','callout','data-card']);
const bandTypes=new Set(['gauge','level-bar','thermometer','flow-meter','value','numeric-input','instrument','tank','silo','vessel','data-card']);
const setpointTypes=new Set(['gauge','level-bar','thermometer','value']);
const unitTypes=new Set(['value','numeric-input','weighing','led-bar','instrument','data-card']);
const lineTypes=new Set(['pipe','elbow','tee','cross','reducer','flange','line']);
/* Faz 2: dolgu/kenar/kose/golge ayarli duz sekiller; HTML ile kutuya gerilir, cerceve ayari yoktur. */
const shapeTypes=new Set(['rectangle','section','ellipse','polygon','star']);
const htmlShapes=new Set(['rectangle','section','polygon','star']);
const strokeTypes=new Set(['line','arrow']);
/** Basligi icerigin kendisi olan turler (yazisiz bos kalir): yeni nesnede baslik acik gelir.
 * Digerlerinde kapali — 2026-09-28 kullanıcı kararı: sembol basliklari varsayilan gorunmesin. */
export const labelIsContent:ReadonlySet<string>=new Set(['text','callout','navigation','button','push-button']);
const motionTypes=new Set(['agitator','beacon','boiler','bulb','burner','centrifuge','chiller','compressor','conveyor','cooling-tower','cyclone','cylinder','damper','dryer','emergency-stop','fan','filter','flow-meter','gate-valve','globe-valve','heat-exchanger','heater','hoist','indicator','key-switch','lamp-square','led-bar','mixer','motor','pump','multi-state','photoelectric','proximity','push-button','selector','solenoid-valve','three-way-valve','toggle-switch','tower-light','alarm','alarm-band','ahu','pipe','elbow','tee','cross','reducer']);
export type PanelSpec={variants:boolean;scale:boolean;band:boolean;setpoint:boolean;unit:boolean;line:boolean;motion:boolean;text:boolean;stateRules:boolean;frame:boolean;shape:boolean;stroke:boolean};
/** Bir turun sag panelde hangi ayar bolumlerini gosterecegi. */
export function panelSpec(type:string):PanelSpec{
 const meta=byType.get(type);
 return {
  variants:!!meta?.variants?.length,
  scale:scaleTypes.has(type),
  band:bandTypes.has(type),
  setpoint:setpointTypes.has(type),
  unit:unitTypes.has(type),
  line:lineTypes.has(type),
  motion:motionTypes.has(type),
  // Duz boru ailesi etiket cizmez; yazi ayarlari orada olu ayardir.
  text:!meta?.flat,
  /* G50: duz boru ailesi zaten cerceveye gerilir; orada secim anlamsizdir. */
  frame:!meta?.flat&&!!meta&&!htmlShapes.has(type),
  shape:shapeTypes.has(type),
  stroke:strokeTypes.has(type),
  stateRules:allowsStateRules(type),
 };
}
export function auditCatalog():string[]{
 const problems:string[]=[];
 const placed=new Set(groupLayout.flatMap(g=>g.types));
 for(const m of list){
  if(!groupOrder.includes(m.group))problems.push(m.type+': bilinmeyen grup '+m.group);
  if(!placed.has(m.type))problems.push(m.type+': panel duzeninde listelenmemis');
 }
 for(const g of groupLayout)for(const t of g.types){
  const found=byType.get(t);
  if(!found)problems.push(g.name+': katalogda olmayan tur '+t);
  else if(found.group!==g.name)problems.push(t+': grup uyusmuyor ('+found.group+' / '+g.name+')');
 }
 if(new Set(list.map(m=>m.type)).size!==list.length)problems.push('tekrarlanan sembol turu var');
 // G47: panel kumeleri katalogla ayni turleri konusmali; yazim hatasi sessiz kalmasin.
 for(const [name,set] of [['olcek',scaleTypes],['bant',bandTypes],['setpoint',setpointTypes],['birim',unitTypes],['cizgi',lineTypes],['hareket',motionTypes],['sekil',shapeTypes],['kenar',strokeTypes],['baslik',labelIsContent as Set<string>]] as const)
  for(const t of set)if(!byType.has(t))problems.push(name+' kumesinde katalogda olmayan tur: '+t);
 for(const t of bandTypes)if(!scaleTypes.has(t))problems.push(t+': isletme bandi var ama olcek yok');
 for(const t of setpointTypes)if(!bandTypes.has(t))problems.push(t+': setpoint var ama bant yok');
 return problems;
}
export const sizes=Object.fromEntries(list.filter(m=>m.size).map(m=>[m.type,[...m.size!]])) as Partial<Record<SymbolType,[number,number]>>;
export const defaultParts=Object.fromEntries(list.filter(m=>m.parts).map(m=>[m.type,[...m.parts!]])) as Partial<Record<SymbolType,Part[]>>;
export const portMap=Object.fromEntries(list.filter(m=>m.ports).map(m=>[m.type,[...m.ports!]])) as Partial<Record<SymbolType,PortDef[]>>;
export const portWeights=Object.fromEntries(list.filter(m=>m.portWeight).map(m=>[m.type,m.portWeight])) as Partial<Record<SymbolType,number>>;
export const viewBoxes=Object.fromEntries(list.filter(m=>m.viewBox).map(m=>[m.type,m.viewBox])) as Record<string,string>;
export const flatTypes=list.filter(m=>m.flat).map(m=>m.type) as SymbolType[];
export const partTypes=list.filter(m=>m.supportsParts).map(m=>m.type) as SymbolType[];
export const buttonTypes=list.filter(m=>m.button).map(m=>m.type) as SymbolType[];
export const commandTypes=list.filter(m=>m.command).map(m=>m.type) as SymbolType[];
/* --- Dinamik gorunum baglari (K07) ----------------------------------------
 * Gorunurluk bugune kadar tek dinamik ozellikti. Bu roller HER sembolde
 * gecerlidir ve cizimi degil, nesnenin SUNUMUNU surer: aci, opaklik,
 * doluluk ve alarm yanip sonmesi. Sembolun kendi rolleriyle karismasin
 * diye ayri listede tutulur ve arayuzde ayri baslik altinda cikar.
 */
export const dynamicBindings:readonly BindingDef[]=[
 {role:'dynRotation',label:'Açı (derece)',kind:'number'},
 {role:'dynOpacity',label:'Opaklık (%)',kind:'number'},
 {role:'dynFill',label:'Doluluk (%)',kind:'number'},
 {role:'dynBlink',label:'Yanıp sön',kind:'bool'}];
/** Bir turun tanimladigi saha baglari; tanimsizsa bos dizi. */
export function bindingDefs(type:string):BindingDef[]{return (byType.get(type)?.bindings||[]) as BindingDef[];}
/** Rol anahtarinin bu turde tanimli olup olmadigi; dinamik roller her turde gecerlidir. */
export function bindingDef(type:string,role:string):BindingDef|undefined{
 return bindingDefs(type).find(b=>b.role===role)||dynamicBindings.find(b=>b.role===role);
}
/* K04: durum kurallari (kademeler) bugune kadar yalniz bes sembolde
 * calisiyordu. Oysa "bu tank kirmizi olsun" ya da "bu motor sari yanip
 * sonsun" istegi her sembolde ayni istektir. Asagidaki turler DISINDA her
 * sembol kademe kurali tasiyabilir; disaridakiler ya salt cizimdir (metin,
 * ok, cizgi) ya da kendi ic duzeni zaten durumla surulur (trend, alarm
 * listesi, PID paneli) ve ikinci bir durum katmani yaniltici olurdu. */
const noStateRules=new Set(['text','rectangle','section','polygon','star','line','ellipse','arrow','callout','image','info','navigation','trend','alarm-band','alarm-list','data-table','pid','slider','keypad','numeric-input','value']);
/** Bu tur kademe (durum kurali) tasiyabilir mi? */
export function allowsStateRules(type:string){return byType.has(type)&&!noStateRules.has(type);}
/** Bir rol dinamik gorunum rolu mu? */
export function isDynamicRole(role:string){return dynamicBindings.some(b=>b.role===role);}
/** Turun cok durumlu ekipman ailesi; tanimsizsa tekil on/off semantigi gecerlidir. */
export function familyOf(type:string):SymbolMeta['family']{return byType.get(type)?.family;}
/** Turun varyantlari; tanimsizsa bos dizi. */
export function variantsOf(type:string):VariantDef[]{return (byType.get(type)?.variants||[]) as VariantDef[];}
/** Gecerli varyant anahtari; bilinmeyen/bos deger ilk varyanta duser. */
export function variantKey(type:string,value:string):string{
 const list=variantsOf(type);
 if(!list.length)return '';
 return list.some(v=>v.key===value)?value:list[0].key;
}
