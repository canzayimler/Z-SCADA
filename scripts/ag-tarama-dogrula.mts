/**
 * Ağ taramasını YALNIZ bu PC üzerinde doğrular (127.0.0.1); şirket ağına paket göndermez.
 * Önce 102'de bir S7 emülatörü açın (python-snap7 Server), sonra:  npx tsx scripts/ag-tarama-dogrula.mts
 */
import {registerNetScan,expandTargets,vendorOf} from '../apps/server/src/netScan';
const routes:Record<string,Function>={};
const app={get:(p:string,f:Function)=>{routes['GET '+p]=f;},post:(p:string,f:Function)=>{routes['POST '+p]=f;}};
const cfg:any={connections:[{id:'c1',name:'Emülatör bağlantısı',host:'127.0.0.1',port:102}]};
registerNetScan({app,edit:()=>({}),config:()=>cfg});
console.log('öneri',(await routes['GET /api/net-scan']({})).suggest);
await routes['POST /api/net-scan']({body:{target:'127.0.0.1-2',ports:[102,502,4840]}});
for(let i=0;i<40;i++){const j=(await routes['GET /api/net-scan']({})).job;if(j.finishedAt){console.log(JSON.stringify(j,null,1));break;}await new Promise(r=>setTimeout(r,500));}
try{expandTargets('10.0.0.0/16');}catch(e:any){console.log('geniş ağ reddi:',e.message);}
console.log('/30:',expandTargets('192.0.2.8/30').join(','));
console.log('OUI:',vendorOf('00:1b:1b:aa:bb:cc'),vendorOf('00:01:05:00:00:01'),vendorOf(null));
process.exit(0);
