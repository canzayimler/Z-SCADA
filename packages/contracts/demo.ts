import {widgetSchema,type Config,type Screen} from './model';
/** Demo proses ekrani; yalnizca guvenli widget modeli uretir, PLC'ye erismez. */
export function utilityDemoScreen(config:Config):Screen{
 const screen:Screen={background:'',symbolStyle:'detailed',gridSize:10,id:'screen-utility-demo',name:'Yardımcı Tesis · Demo',width:1500,height:900,widgets:[],equipment:[],scenarios:[],links:[]};
 const add=(data:Record<string,unknown>)=>screen.widgets.push(widgetSchema.parse({id:'utility-'+screen.widgets.length,x:0,y:0,width:120,height:70,...data}));
 const tag=(code:string)=>config.tags.find(t=>t.code===code)?.id||'';
 add({type:'text',label:'YARDIMCI TESİS · POMPA / TANK / VANA İZLEME',x:55,y:24,width:900,height:42});
 add({type:'text',label:'M0–M5 saha izinleri · Y0–Y5 çıkış kumandaları',x:58,y:68,width:900,height:28});
 add({type:'tank',label:'Besleme tankı · M0',tagId:tag('M0'),x:70,y:150,width:150,height:190});
 add({type:'level-bar',label:'Tank seviyesi',tagId:tag('M0'),x:235,y:165,width:70,height:150});
 add({type:'pump',label:'Pompa P-101 · Y0',tagId:tag('Y0'),commandId:config.commands.find(c=>c.id==='cmd-tag-y0')?.id||'',x:380,y:190,width:210,height:120});
 add({type:'valve',label:'V-101 · Y1',tagId:tag('Y1'),commandId:config.commands.find(c=>c.id==='cmd-tag-y1')?.id||'',x:680,y:210,width:140,height:90});
 add({type:'filter',label:'Filtre F-101',x:900,y:190,width:170,height:120});
 add({type:'vessel',label:'Kullanım tankı · M1',tagId:tag('M1'),x:1160,y:150,width:190,height:150});
 add({type:'pipe',label:'Besleme hattı',x:300,y:245,width:80,height:22});add({type:'pipe',label:'Arıtma hattı',x:590,y:245,width:90,height:22});add({type:'pipe',label:'Dağıtım hattı',x:1070,y:245,width:90,height:22});
 add({type:'text',label:'PLC KANALLARI · SAHA DURUMU / ÇIKIŞ KUMANDASI',x:55,y:390,width:800,height:32});
 for(let n=0;n<6;n++){const x=55+(n%3)*475,y=440+Math.floor(n/3)*190;add({type:'text',label:`KANAL ${String(n+1).padStart(2,'0')} · M${n} / Y${n}`,x,y,width:420,height:26});add({type:'indicator',label:`M${n} izin / geri bildirim`,tagId:tag('M'+n),x,y:y+38,width:190,height:78});add({type:'indicator',label:`Y${n} çıkış`,tagId:tag('Y'+n),x:x+215,y:y+38,width:190,height:78});add({type:'button',label:'AÇ',x,y:y+125,width:90,height:42,commandId:config.commands.find(c=>c.id==='cmd-tag-y'+n)?.id||'',action:'on'});add({type:'button',label:'KAPAT',x:x+100,y:y+125,width:90,height:42,commandId:config.commands.find(c=>c.id==='cmd-tag-y'+n)?.id||'',action:'off'});}
 add({type:'text',label:'Durumlar PLC’den okunur. Yazma sonucu yeni okuma ile doğrulanır.',x:55,y:850,width:1280,height:30});
 return screen;
}
