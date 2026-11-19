import {type Config,type Screen,widgetSchema} from './model';
export const seedConfig:Config={revision:1,name:'Z SCADA Projesi',connections:[{id:'conn-01',name:'PLC Ethernet',host:'192.0.2.15',port:502,timeout:2000}],devices:[{id:'plc-01',connectionId:'conn-01',code:'PLC-01',name:'PLC',slaveId:1,enabled:true,pollMs:1000,staleMs:4000,description:'M0–M2 / Y0–Y2 demo bağlantısı'}],tags:['M','Y'].flatMap(k=>[0,1,2].map(n=>({id:`tag-${k.toLowerCase()}${n}`,deviceId:'plc-01',code:k+n,name:k+n,area:'coil' as const,address:(k==='M'?2048:1280)+n,dataType:'bool' as const,access:'readwrite' as const,scale:1,offset:0,min:0,max:65535,unit:'',wordOrder:'big' as const,byteOrder:'big' as const,bit:null,verifyTolerance:null,history:true,historyDeadband:0,historyMaxGapMs:60000,description:k==='M'?'Dahili röle':'PLC çıkış biti'}))),commands:[]};
seedConfig.commands=seedConfig.tags.map(t=>({id:'cmd-'+t.id,name:t.name+' kontrol',tagIds:[t.id],feedbackTagIds:[t.id],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''}));
seedConfig.commands.push(...[0,1,2].map(n=>({id:`cmd-pair-${n}`,name:`M${n} + Y${n}`,tagIds:[`tag-m${n}`,`tag-y${n}`],feedbackTagIds:[`tag-m${n}`,`tag-y${n}`],timeoutMs:7000,permissives:[],risk:'normal' as const,approval:'none' as const,scope:''})));
export const seedScreen:Screen={background:'',symbolStyle:'classic',gridSize:10,id:'screen-main',name:'Dijital kontrol',width:1200,height:700,widgets:[],equipment:[],scenarios:[],links:[]};
const w=(data:Record<string,unknown>)=>seedScreen.widgets.push(widgetSchema.parse({id:'w-'+seedScreen.widgets.length,x:0,y:0,width:120,height:100,...data}));
w({type:'text',label:'DİJİTAL KONTROL / 01',x:45,y:22,width:600,height:40});
[0,1,2].forEach(n=>{
 const x=55+n*390;
 w({type:'text',label:`KANAL 0${n+1}   ·   M${n} / Y${n}`,x,y:95,width:340,height:36});
 w({type:'indicator',label:`M${n} · Dahili röle`,tagId:`tag-m${n}`,x,y:160,width:145,height:100});
 w({type:'indicator',label:`Y${n} · Çıkış`,tagId:`tag-y${n}`,x:x+175,y:160,width:145,height:100});
 for(const [k,dx] of [['m',0],['y',175]] as const)for(const [action,dy] of [['on',0],['off',58]] as const)w({type:'button',label:action==='on'?'Aç':'Kapat',x:x+dx,y:295+dy,width:145,height:44,commandId:`cmd-tag-${k}${n}`,action});
 w({type:'button',label:'İkisini aç',x,y:460,width:145,height:46,commandId:`cmd-pair-${n}`,action:'on'});
 w({type:'button',label:'İkisini kapat',x:x+175,y:460,width:145,height:46,commandId:`cmd-pair-${n}`,action:'off'});
});
w({type:'text',label:'Durumlar PLC’den okunur. Yazma sonucu yeni okuma ile doğrulanır.',x:55,y:590,width:1090,height:40});
