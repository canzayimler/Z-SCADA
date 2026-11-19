/**
 * OPC UA gezginini yerel node-opcua test sunucusuna karşı doğrular (canlı sisteme dokunmaz).
 *   npx tsx scripts/opcua-gozat-dogrula.mts
 */
import {OPCUAServer,Variant,DataType} from 'node-opcua';
import {registerOpcuaBrowse} from '../apps/server/src/opcuaBrowse';
const server=new OPCUAServer({port:4842,resourcePath:'/UA/Test',alternateHostname:['127.0.0.1']});
await server.initialize();
const ns=server.engine.addressSpace!.getOwnNamespace();
const hat=ns.addObject({organizedBy:server.engine.addressSpace!.rootFolder.objects,browseName:'Hat'});
const firin=ns.addObject({componentOf:hat,browseName:'Firin'});
ns.addVariable({componentOf:firin,browseName:'Sicaklik',nodeId:'s=Firin.Sicaklik',dataType:'Double',value:{get:()=>new Variant({dataType:DataType.Double,value:812.5})}});
ns.addVariable({componentOf:firin,browseName:'Calisiyor',nodeId:'s=Firin.Calisiyor',dataType:'Boolean',value:{get:()=>new Variant({dataType:DataType.Boolean,value:true})}});
ns.addVariable({componentOf:firin,browseName:'Sayac',nodeId:'s=Firin.Sayac',dataType:'Int32',value:{get:()=>new Variant({dataType:DataType.Int32,value:7})}});
ns.addVariable({componentOf:firin,browseName:'Recete',nodeId:'s=Firin.Recete',dataType:'String',value:{get:()=>new Variant({dataType:DataType.String,value:'A'})}});
await server.start();
const routes:Record<string,Function>={};
const app={get:(p:string,f:Function)=>{routes['GET '+p]=f;},post:(p:string,f:Function)=>{routes['POST '+p]=f;}};
const cfg:any={connections:[{id:'c1',name:'Test',host:'127.0.0.1',port:4842,timeout:3000,protocol:'opc-ua',endpoint:'opc.tcp://127.0.0.1:4842/UA/Test',securityMode:'none'}]};
registerOpcuaBrowse({app,edit:()=>({}),config:()=>cfg});
const browse=(nodeId?:string)=>routes['POST /api/opcua/browse']({body:{connectionId:'c1',nodeId}});
const root=await browse();
console.log('kök:',root.items.map((i:any)=>i.name).join(', '));
const h=root.items.find((i:any)=>i.name==='Hat');
const l2=await browse(h.nodeId);console.log('Hat:',l2.items.map((i:any)=>i.name).join(', '));
const f=l2.items.find((i:any)=>i.name==='Firin');
const l3=await browse(f.nodeId);
for(const i of l3.items)console.log(' ',i.nodeClass,i.name,i.nodeId,i.dataType,'->',i.tagType);
const ok=l3.items.find((i:any)=>i.name==='Sicaklik')?.tagType==='float32'&&l3.items.find((i:any)=>i.name==='Calisiyor')?.tagType==='bool'&&l3.items.find((i:any)=>i.name==='Recete')?.tagType===null;
try{await routes['POST /api/opcua/browse']({body:{connectionId:'yok'}});}catch(e:any){console.log('olmayan bağlantı:',e.message);}
console.log(ok?'✔ gezgin doğru':'✘ beklenmeyen sonuç');
await server.shutdown(300);process.exit(ok?0:1);
