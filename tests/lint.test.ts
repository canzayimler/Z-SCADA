import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWidget,widgetSchema,lintScreen,lintSummary,defaultStyleGuide} from '../packages/contracts/model';
import {seedConfig,seedScreen} from '../packages/contracts/seed';

function screenWith(widgets:any[]){return {...structuredClone(seedScreen),widgets};}

test('varsayılan rehberle temiz bir ekranda hiç bulgu çıkmaz',()=>{
 const nav=widgetSchema.parse({...newWidget('navigation'),label:'Diğer ekrana git',targetScreenId:'',animated:false});
 const lamp=widgetSchema.parse({...newWidget('indicator'),label:'Pompa durumu',labelVisible:true,animated:false});
 const findings=lintScreen(screenWith([nav,lamp]),seedConfig,defaultStyleGuide,false);
 assert.deepEqual(findings,[]);
});

test('alarm paletindeki renk durum dışı nesnede kullanılırsa uyarı üretir',()=>{
 const alarmColored=widgetSchema.parse({...newWidget('rectangle'),color:defaultStyleGuide.alarmColors.critical});
 const normalColored=widgetSchema.parse({...newWidget('rectangle'),color:'#208169'});
 const bad=lintScreen(screenWith([alarmColored]),seedConfig,defaultStyleGuide,true);
 const ok=lintScreen(screenWith([normalColored]),seedConfig,defaultStyleGuide,true);
 assert.ok(bad.some(f=>f.code==='alarm-color-reuse'&&f.severity==='warning'));
 assert.ok(!ok.some(f=>f.code==='alarm-color-reuse'));
});

test('durum lambası etiketsiz ise renk dışı işaret eksikliği bildirilir',()=>{
 const noLabel=widgetSchema.parse({...newWidget('indicator'),labelVisible:false});
 const withLabel=widgetSchema.parse({...newWidget('indicator'),labelVisible:true});
 const bad=lintScreen(screenWith([noLabel]),seedConfig,defaultStyleGuide,true);
 const ok=lintScreen(screenWith([withLabel]),seedConfig,defaultStyleGuide,true);
 assert.ok(bad.some(f=>f.code==='color-only-status'));
 assert.ok(!ok.some(f=>f.code==='color-only-status'));
});

test('rehber devre dışı bırakılırsa renk dışı işaret kuralı atlanır',()=>{
 const noLabel=widgetSchema.parse({...newWidget('indicator'),labelVisible:false});
 const guide={...defaultStyleGuide,requireNonColorIndicator:false};
 const findings=lintScreen(screenWith([noLabel]),seedConfig,guide,true);
 assert.ok(!findings.some(f=>f.code==='color-only-status'));
});

test('asgari yazı boyutunun altındaki yazı okunabilirlik uyarısı üretir',()=>{
 const small=widgetSchema.parse({...newWidget('text'),labelVisible:true,fontSize:8});
 const normal=widgetSchema.parse({...newWidget('text'),labelVisible:true,fontSize:14});
 const bad=lintScreen(screenWith([small]),seedConfig,defaultStyleGuide,true);
 const ok=lintScreen(screenWith([normal]),seedConfig,defaultStyleGuide,true);
 assert.ok(bad.some(f=>f.code==='low-font-size'&&f.severity==='warning'));
 assert.ok(!ok.some(f=>f.code==='low-font-size'));
});

test('kritik ekipman komut butonunda düşük yazı boyutu kritik sayılır',()=>{
 const config=structuredClone(seedConfig);
 config.commands.push({id:'cmd-critical',name:'Acil durdur',tagIds:['tag-m0'],feedbackTagIds:['tag-m0'],timeoutMs:7000,permissives:[],risk:'critical' as const,approval:'none' as const,scope:''});
 const button=widgetSchema.parse({...newWidget('button'),label:'Acil durdur',commandId:'cmd-critical',fontSize:8});
 const findings=lintScreen(screenWith([button]),config,defaultStyleGuide,true);
 assert.ok(findings.some(f=>f.code==='low-font-size'&&f.severity==='critical'));
});

test('çok düşük opaklık okunabilirlik uyarısı üretir',()=>{
 const faint=widgetSchema.parse({...newWidget('rectangle'),opacity:.3});
 const solid=widgetSchema.parse({...newWidget('rectangle'),opacity:1});
 const bad=lintScreen(screenWith([faint]),seedConfig,defaultStyleGuide,true);
 const ok=lintScreen(screenWith([solid]),seedConfig,defaultStyleGuide,true);
 assert.ok(bad.some(f=>f.code==='low-opacity'));
 assert.ok(!ok.some(f=>f.code==='low-opacity'));
});

test('durum/alarm dışı nesnede sürekli animasyon bilgi bulgusu üretir',()=>{
 const spinning=widgetSchema.parse({...newWidget('pump'),animated:true});
 const still=widgetSchema.parse({...newWidget('pump'),animated:false});
 const beacon=widgetSchema.parse({...newWidget('beacon'),animated:true});
 const bad=lintScreen(screenWith([spinning]),seedConfig,defaultStyleGuide,true);
 const ok=lintScreen(screenWith([still]),seedConfig,defaultStyleGuide,true);
 const allowed=lintScreen(screenWith([beacon]),seedConfig,defaultStyleGuide,true);
 assert.ok(bad.some(f=>f.code==='unnecessary-animation'&&f.severity==='info'));
 assert.ok(!ok.some(f=>f.code==='unnecessary-animation'));
 assert.ok(!allowed.some(f=>f.code==='unnecessary-animation'));
});

test('sayısal göstergede normal çalışma aralığı tanımsızsa bilgi bulgusu üretir',()=>{
 const undefinedRange=widgetSchema.parse({...newWidget('gauge'),min:0,max:0});
 const definedRange=widgetSchema.parse({...newWidget('gauge'),min:0,max:100});
 const bad=lintScreen(screenWith([undefinedRange]),seedConfig,defaultStyleGuide,true);
 const ok=lintScreen(screenWith([definedRange]),seedConfig,defaultStyleGuide,true);
 assert.ok(bad.some(f=>f.code==='undefined-normal-range'));
 assert.ok(!ok.some(f=>f.code==='undefined-normal-range'));
});

test('ana ekran olmayan ekranda geçiş nesnesi yoksa bilgi bulgusu üretir',()=>{
 const lamp=widgetSchema.parse({...newWidget('indicator'),labelVisible:true});
 const notHome=lintScreen(screenWith([lamp]),seedConfig,defaultStyleGuide,false);
 const home=lintScreen(screenWith([lamp]),seedConfig,defaultStyleGuide,true);
 assert.ok(notHome.some(f=>f.code==='no-navigation'));
 assert.ok(!home.some(f=>f.code==='no-navigation'));
});

test('etiketsiz komut butonu kritik bulgu üretir',()=>{
 const config=structuredClone(seedConfig);
 config.commands.push({id:'cmd-unlabeled',name:'Başlat',tagIds:['tag-m0'],feedbackTagIds:['tag-m0'],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''});
 const unlabeled=widgetSchema.parse({...newWidget('button'),label:'',commandId:'cmd-unlabeled'});
 const labeled=widgetSchema.parse({...newWidget('button'),label:'Başlat',commandId:'cmd-unlabeled'});
 const bad=lintScreen(screenWith([unlabeled]),config,defaultStyleGuide,true);
 const ok=lintScreen(screenWith([labeled]),config,defaultStyleGuide,true);
 assert.ok(bad.some(f=>f.code==='unlabeled-command'&&f.severity==='critical'));
 assert.ok(!ok.some(f=>f.code==='unlabeled-command'));
});

test('lintSummary kritik/uyarı/bilgi sayılarını doğru döndürür',()=>{
 const findings=[
  {severity:'critical' as const,code:'a',message:'x'},
  {severity:'warning' as const,code:'b',message:'y'},
  {severity:'warning' as const,code:'c',message:'z'},
  {severity:'info' as const,code:'d',message:'w'}];
 const summary=lintSummary(findings);
 assert.deepEqual(summary,{critical:1,warning:2,info:1,total:4});
});
/* Denetim 2026-11-18: animasyon varsayılan açık; 27 yeni kütüphane nesnesi 27 ayrı bilgi satırı üretiyordu. */
test('surekli animasyon bulgusu nesne basina degil, tek ozet satiri',()=>{
 const many=Array.from({length:27},(_,i)=>widgetSchema.parse({...newWidget('pump'),id:'p'+i,animated:true}));
 const f=lintScreen(screenWith(many),seedConfig,defaultStyleGuide,true).filter(x=>x.code==='unnecessary-animation');
 assert.equal(f.length,1);
 assert.match(f[0].message,/^27 nesnede/);
 assert.equal(f[0].widgetId,'p0');
});
