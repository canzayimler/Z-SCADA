import {test} from 'node:test';
import assert from 'node:assert/strict';
import {statusNotices} from '../apps/web/src/statusModel';
import type {Live} from '../packages/contracts/model';

const dev=(code:string,status:'ready'|'partial'|'down',good=2,tags=2)=>({id:code,code,name:code,tags,good,seen:0,dataAgeMs:0,status});
const live=(o:Partial<Live>={}):Live=>({samples:{a:{quality:'good'} as any,b:{quality:'good'} as any},gatewayConnected:true,activeRevision:3,desiredRevision:3,deploying:false,commands:[],alarms:[],
 alarmCounts:{} as any,alarmFlood:{} as any,devices:[dev('PLC-01','ready')],devicesReady:1,devicesTotal:1,controlReady:true,...o});

test('her sey yolundayken bant bos — yer kaplamaz',()=>{
 assert.deepEqual(statusNotices({connected:true,fresh:true,live:live()}),[]);
});
test('sunucu veya kopru koptugunda kirmizi, bayat etiket sayisi yazilir',()=>{
 assert.equal(statusNotices({connected:false,fresh:false,live:live()})[0].tone,'bad');
 const n=statusNotices({connected:true,fresh:true,live:live({gatewayConnected:false,samples:{a:{quality:'stale'} as any,b:{quality:'good'} as any},devices:[dev('PLC-01','partial',1,2)]})});
 assert.equal(n[0].id,'bridge');assert.equal(n[0].tone,'bad');assert.match(n[0].detail!,/1\/2 etiket/);
});
test('veri gelmeyen cihazlar adiyla sayilir, kismi guncel sari',()=>{
 const n=statusNotices({connected:true,fresh:true,live:live({devices:[dev('PLC-01','down',0),dev('PLC-02','ready')]})});
 assert.equal(n[0].title,'1 cihazdan veri gelmiyor');assert.match(n[0].detail!,/PLC-01/);
 assert.equal(statusNotices({connected:true,fresh:true,live:live({devices:[dev('PLC-01','down',0)]})})[0].title,'Hiçbir cihazdan veri gelmiyor');
 assert.equal(statusNotices({connected:true,fresh:true,live:live({devices:[dev('PLC-01','partial',1,2)]})})[0].tone,'warn');
});
test('surum: istemci eskiyse yenile, sunucu eskiyse yalniz yoneticiye uyari',()=>{
 const base={connected:true,fresh:true,live:live(),clientBuild:'b1'};
 assert.deepEqual(statusNotices({...base,build:{server:'b1',dist:'b1'}}),[]);
 const c=statusNotices({...base,build:{server:'b2',dist:'b2'}});assert.equal(c[0].action,'reload');
 assert.equal(statusNotices({...base,build:{server:'b1',dist:'b2'},isAdmin:false}).filter(n=>n.id==='build-server').length,0);
 assert.equal(statusNotices({...base,clientBuild:'b2',build:{server:'b1',dist:'b2'},isAdmin:true})[0].id,'build-server');
});
test('bayat sayisi cihaz toplamlarindan: hic ornegi olmayan etiket de sayilir',()=>{
 const n=statusNotices({connected:true,fresh:true,live:live({samples:{a:{quality:'stale'} as any},devices:[dev('PLC-01','down',0,6),dev('PLC-02','down',0,8)]})});
 assert.match(n[0].detail!,/14\/14 etiket/);
});
test('yeni surum bildirimi yalniz yoneticiye; dogrulanmamissa tek tik kurulum anlatilmaz',()=>{
 const update={available:true,verified:true,latest:'0.7.0',notesUrl:'https://github.com/o/r/releases/tag/v0.7.0',asset:{name:'Z-SCADA-Kurulum-0.7.0.exe',url:'https://github.com/o/r/releases/download/v0.7.0/Z-SCADA-Kurulum-0.7.0.exe',size:1,sha256:'a'.repeat(64)}};
 assert.deepEqual(statusNotices({connected:true,fresh:true,live:live(),update}),[],'yonetici degil: bildirim yok');
 assert.deepEqual(statusNotices({connected:true,fresh:true,live:live(),update,isAdmin:false}),[]);
 const [n]=statusNotices({connected:true,fresh:true,live:live(),update,isAdmin:true});
 assert.equal(n.id,'update');assert.equal(n.tone,'info');assert.equal(n.title,'Z SCADA 0.7.0 yayınlandı');
 assert.match(n.detail!,/Tepsideki Z SCADA simgesi → Güncellemeyi kur/);
 assert.deepEqual(n.links!.map(l=>l.label),['Sürüm notları','Kurulum dosyasını indir']);
 const [u]=statusNotices({connected:true,fresh:true,live:live(),update:{...update,verified:false,asset:{...update.asset,sha256:null}},isAdmin:true});
 assert.doesNotMatch(u.detail!,/Güncellemeyi kur/);assert.match(u.detail!,/SHA-256/);assert.equal(u.links!.length,2);
 assert.deepEqual(statusNotices({connected:true,fresh:true,live:live(),update:{...update,available:false},isAdmin:true}),[]);
 assert.deepEqual(statusNotices({connected:true,fresh:true,live:live(),update:null,isAdmin:true}),[]);
});
