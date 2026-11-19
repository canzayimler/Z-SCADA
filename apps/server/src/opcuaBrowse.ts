/* --- OPC UA adres uzayi gezgini (salt okuma) -----------------------------------
 * Etiket panelindeki "Gozat" icin: baglantinin OPC UA sunucusuna oturum acar (kopruyle ayni giris:
 * connection-secrets.json'da kullanici adi varsa kullanici/parola, yoksa anonim), istenen
 * dugumun cocuklarini (Browse) ve degiskenlerin veri tipini (Read DataType) dondurur. Yazma,
 * yontem cagrisi, abonelik YOK. Oturum 60 sn bosta kalinca kapanir. node-opcua agir oldugu icin
 * ilk kullanimda yuklenir (sunucu acilisi yavaslamasin). Guvenlik modu baglantidakiyle ayni. */
import {createHash} from 'node:crypto';
import type {Config} from '../../../packages/contracts/model';
import type {ConnectionSecret} from '../../../packages/drivers/driver';

export type BrowseItem={nodeId:string;name:string;nodeClass:'Object'|'Variable'|'Method'|'Other';dataType:string|null;tagType:string|null;hasChildren:boolean};
/** OPC UA yerlesik veri tipi (DataType NodeId sayisi ya da adi) -> etiket tipi. Desteklenmeyen -> null. */
export function opcTypeToTag(t:string|number|null|undefined):string|null{
 const byId:Record<number,string>={1:'Boolean',2:'SByte',3:'Byte',4:'Int16',5:'UInt16',6:'Int32',7:'UInt32',8:'Int64',9:'UInt64',10:'Float',11:'Double',12:'String',13:'DateTime'};
 const name=typeof t==='number'?byId[t]:String(t??'');
 return ({Boolean:'bool',SByte:'int16',Int16:'int16',Byte:'uint16',UInt16:'uint16',Int32:'int32',UInt32:'uint32',Float:'float32',Double:'float32'} as Record<string,string>)[name]??null;
}
type Sess={client:any;session:any;key:string;last:number};
/** node-opcua createSession kimligi: kullanici adi varsa UserName, yoksa anonim (kopru ile ayni kural). */
export function opcuaUserIdentity(u:{UserTokenType:any},secret:ConnectionSecret|undefined){
 const userName=secret?.username?.trim();
 return userName?{type:u.UserTokenType.UserName,userName,password:secret?.password??''}:{type:u.UserTokenType.Anonymous};
}

export function registerOpcuaBrowse(ctx:{app:any;edit:(req:any)=>unknown;config:()=>Config;secret?:(connectionId:string)=>ConnectionSecret|undefined}){
 const sessions=new Map<string,Sess>();
 let lib:any=null;
 async function opcua(){return lib??=await import('node-opcua');}
 async function close(id:string){const s=sessions.get(id);sessions.delete(id);try{await s?.session.close();}catch{/* */}try{await s?.client.disconnect();}catch{/* */}}
 setInterval(()=>{for(const [id,s] of sessions)if(Date.now()-s.last>60000)void close(id);},15000).unref?.();
 async function session(connectionId:string){
  const conn=ctx.config().connections.find(c=>c.id===connectionId&&c.protocol==='opc-ua');
  if(!conn?.endpoint)throw Object.assign(Error('OPC UA bağlantısı bulunamadı.'),{statusCode:404});
  const secret=ctx.secret?.(connectionId);
  // Oturum anahtari: adres + guvenlik + kimlik. Parola yalniz ozetiyle (bellekte) karsilastirilir; kimlik degisince oturum yenilenir.
  const key=[conn.endpoint,conn.securityMode||'none',conn.securityPolicy||'',secret?.username||'',createHash('sha256').update(secret?.password||'').digest('hex')].join('|');
  const cur=sessions.get(connectionId);
  if(cur&&cur.key===key){cur.last=Date.now();return cur.session;}
  if(cur)await close(connectionId);
  const u=await opcua();
  const mode=({'none':u.MessageSecurityMode.None,'sign':u.MessageSecurityMode.Sign,'sign-encrypt':u.MessageSecurityMode.SignAndEncrypt} as Record<string,any>)[conn.securityMode||'none'];
  const policy=mode===u.MessageSecurityMode.None?u.SecurityPolicy.None:(u.SecurityPolicy as any)[conn.securityPolicy||'Basic256Sha256']??u.SecurityPolicy.Basic256Sha256;
  const client=u.OPCUAClient.create({applicationName:'Z SCADA',securityMode:mode,securityPolicy:policy,endpointMustExist:false,connectionStrategy:{maxRetry:0,initialDelay:500},requestedSessionTimeout:120000});
  try{
   await Promise.race([client.connect(conn.endpoint.trim()),new Promise((_,rej)=>setTimeout(()=>rej(Error('Sunucuya bağlanılamadı (zaman aşımı).')),Math.max(5000,conn.timeout*2)))]);
   const s=await client.createSession(opcuaUserIdentity(u,secret));
   sessions.set(connectionId,{client,session:s,key,last:Date.now()});
   return s;
  }catch(e){try{await client.disconnect();}catch{/* */}throw Object.assign(Error('OPC UA: '+(e as Error).message),{statusCode:502});}
 }
 ctx.app.post('/api/opcua/browse',async(req:any)=>{
  ctx.edit(req);
  const connectionId=String(req.body?.connectionId||''),nodeId=String(req.body?.nodeId||'ObjectsFolder');
  const u=await opcua();const s=await session(connectionId);
  const res=await s.browse({nodeId:nodeId==='ObjectsFolder'?u.ObjectIds.ObjectsFolder:nodeId,browseDirection:u.BrowseDirection.Forward,referenceTypeId:'HierarchicalReferences',includeSubtypes:true,nodeClassMask:0,resultMask:63});
  const refs=(res.references||[]).filter((r:any)=>r.nodeClass===u.NodeClass.Object||r.nodeClass===u.NodeClass.Variable);
  const vars=refs.filter((r:any)=>r.nodeClass===u.NodeClass.Variable);
  const dt=vars.length?await s.read(vars.map((r:any)=>({nodeId:r.nodeId,attributeId:u.AttributeIds.DataType}))):[];
  const typeOf=new Map<string,any>();vars.forEach((r:any,i:number)=>typeOf.set(r.nodeId.toString(),dt[i]?.value?.value));
  const items:BrowseItem[]=refs.map((r:any)=>{
   const id=r.nodeId.toString(),isVar=r.nodeClass===u.NodeClass.Variable,t=typeOf.get(id);
   const typeNum=t&&t.namespace===0&&typeof t.value==='number'?t.value:null;
   const typeName=typeNum!==null?(u.DataType[typeNum]||String(typeNum)):t?String(t):null;
   return {nodeId:id,name:r.displayName?.text||r.browseName?.name||id,nodeClass:isVar?'Variable':'Object',dataType:isVar?typeName:null,tagType:isVar?opcTypeToTag(typeNum??typeName):null,hasChildren:!isVar||false};
  });
  items.sort((a,b)=>Number(a.nodeClass==='Variable')-Number(b.nodeClass==='Variable')||a.name.localeCompare(b.name,'tr'));
  return {nodeId,items};
 });
}
