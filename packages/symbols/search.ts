import {labels,labelsEn,catalog} from './catalog';
/* --- Kutuphane aramasi (K10) -----------------------------------------------
 * Yuz sembollu bir kutuphanede arama, adin BIREBIR yazilmasina bagli
 * olamaz. Sahadaki insan "valf" der, katalogda "vana" yazar; "kesici" der,
 * katalogda "salter" yazar. Es anlamlilar bu farki kapatir.
 *
 * Arama ayrica Ingilizce etiketi ve tur anahtarini da tarar: farkli dilde
 * calisan bir entegrator "butterfly" yazip kelebek vanayi bulabilmeli.
 */
const synonyms:Record<string,string[]>={
 valve:['valf','vana','ventil'],
 'gate-valve':['surgu','surgulu','sluz'],
 'globe-valve':['glob','kuresel govde'],
 'ball-valve':['kure','bilya','top'],
 'butterfly-valve':['kelebek','disk'],
 'check-valve':['cek','geri donussuz','klape','nrv'],
 'solenoid-valve':['solenoid','bobinli','elektrovana'],
 'control-valve':['kontrol','oransal','regulasyon'],
 'three-way-valve':['uc yollu','3 yollu','karistirici vana'],
 breaker:['kesici','sarj','otomat','mcb','mccb'],
 disconnector:['ayirici','sezyoner','izolator'],
 contactor:['kontaktor','role'],
 fuse:['sigorta','buatlı sigorta'],
 transformer:['trafo','guc trafosu'],
 busbar:['bara','bus','baraj'],
 generator:['jenerator','jen','alternator'],
 ups:['kesintisiz','akulu besleme'],
 inverter:['evirici','surucu','dc ac'],
 'pv-panel':['gunes','solar','fotovoltaik','pv'],
 battery:['aku','batarya','pil'],
 'power-meter':['analizor','sayac','enerji olcer','multimetre'],
 motor:['motor','elektrik motoru','asenkron'],
 pump:['pompa','santrifuj pompa','basinc pompasi'],
 compressor:['kompresor','hava kompresoru'],
 fan:['fan','aspirator','vantilator'],
 conveyor:['konveyor','bant','tasiyici','helezon','elevator'],
 mixer:['karistirici','mikser','ajitator'],
 agitator:['ajitator','pervane','karistirici mili'],
 centrifuge:['santrifuj','separator','dekanter'],
 heater:['isitici','rezistans','heater'],
 filter:['filtre','suzgec','eleman'],
 'heat-exchanger':['esanjor','isi degistirici','plakali'],
 boiler:['kazan','buhar kazani','boyler'],
 burner:['bruler','yakici','ates'],
 chiller:['chiller','sogutma grubu','soguk su'],
 'cooling-tower':['kule','sogutma kulesi','ct'],
 dryer:['kurutucu','kurutma'],
 hoist:['vinc','caraskal','kaldirici','asansor'],
 tank:['tank','depo','kap','reaktor'],
 silo:['silo','bunker'],
 vessel:['yatay tank','tup','kap'],
 column:['kolon','kule','distilasyon'],
 hopper:['huni','besleme hunisi','sarj'],
 drum:['varil','fici','tambur'],
 cyclone:['siklon','ayirici'],
 gauge:['gosterge','manometre','saat','ibre'],
 'level-bar':['seviye','level','cubuk'],
 thermometer:['termometre','sicaklik','isi'],
 'flow-meter':['debimetre','akiskolcer','debi','flowmetre'],
 instrument:['balon','isa','transmitter','olcum noktasi','ft','lt','pt','tt'],
 value:['deger','sayi','okuma'],
 'numeric-input':['analog giris','sayisal giris','deger gir'],
 slider:['surgu','kaydirici','setpoint'],
 keypad:['tus takimi','klavye','sayisal tus'],
 trend:['trend','grafik','egri','gecmis'],
 pid:['pid','faceplate','regulator','kontrolor','oransal','sp','pv'],
 'alarm-band':['alarm bandi','banner','seritt'],
 'alarm-list':['alarm listesi','olay listesi','alarm tablosu'],
 'data-table':['tablo','liste','deger tablosu'],
 ahu:['klima santrali','ahu','hava santrali'],
 damper:['damper','kanat','klape'],
 duct:['kanal','hava kanali'],
 coil:['serpantin','batarya','coil'],
 'air-filter':['hava filtresi','kanal filtresi'],
 pipe:['boru','hat','line'],
 elbow:['dirsek','donus'],
 tee:['te','t boru','ayrim'],
 cross:['kesisim','carpi','dort yol'],
 reducer:['redüksiyon','daraltma','konik'],
 flange:['flans','kor flans','baglanti'],
 indicator:['lamba','sinyal','ikaz','led'],
 'tower-light':['kule','sinyal kulesi','isik kulesi'],
 'emergency-stop':['acil stop','estop','mantar buton'],
 selector:['secici','komutator','anahtar'],
 arrow:['ok','yon'],
 callout:['balon','not','aciklama'],
 line:['cizgi','ayirac'],
 ellipse:['elips','oval','daire'],
 rectangle:['alan','kutu','cerceve'],
 image:['gorsel','resim','svg','logo']};
/* Grup duzeyi es anlamlilar: "valf" yazan biri TUM vanalari gormeli,
 * yalniz adinda "vana" gecen tek sembolu degil. */
const groupSynonyms:Record<string,string[]>={
 'VANALAR':['valf','vana','ventil','armatur'],
 'ELEKTRİK':['elektrik','pano','sld','tek hat','guc'],
 'EKİPMAN':['ekipman','makine','proses'],
 'ISIL EKİPMAN':['isil','termal','isi','buhar'],
 'HVAC':['hvac','iklimlendirme','havalandirma','klima'],
 'KAPLAR':['kap','depo','tank','hacim'],
 'ÖLÇÜM':['olcum','olcer','enstruman','gosterge'],
 'BORU HATTI':['boru','hat','tesisat','piping'],
 'GÖSTERGE':['gosterge','panel','izleme'],
 'LAMBA & SİNYAL':['lamba','sinyal','ikaz','isik'],
 'BUTON & ANAHTAR':['buton','anahtar','kumanda'],
 'SENSÖR & OTOMASYON':['sensor','algilayici','otomasyon'],
 'YERLEŞİM':['yerlesim','cizim','sekil','not']};
/** Turkce harfleri sadelestirip kucuk harfe cevirir; "Şalter" ile "salter" ayni sayilsin. */
export function fold(text:string){
 return text.toLocaleLowerCase('tr')
  .replace(/[ığüşöçİı]/g,c=>({'ı':'i','ğ':'g','ü':'u','ş':'s','ö':'o','ç':'c','İ':'i'} as Record<string,string>)[c]||c);
}
const haystack=new Map<string,string>(catalog.map(m=>{
 const words=[m.type,(labels as any)[m.type],(labelsEn as any)[m.type],m.group,...(groupSynonyms[m.group]||[]),...(synonyms[m.type]||[]),
  ...(m.variants||[]).flatMap(v=>[v.label,v.labelEn||''])];
 return [m.type,fold(words.filter(Boolean).join(' '))];
}));
/** Sembol arama: ad, Ingilizce ad, tur anahtari, grup, varyant adlari ve es anlamlilar. */
export function matchesSymbol(type:string,query:string){
 const q=fold(query).trim();
 if(!q)return true;
 const text=haystack.get(type);
 if(!text)return false;
 return q.split(/\s+/).every(word=>text.includes(word));
}
