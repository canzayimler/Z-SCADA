/**
 * Yalnız doğrulama için sahte S7 PLC (ISO-on-TCP + S7comm, yalnız 127.0.0.1). Gerçek PLC'nin yerine
 * geçmez: COTP bağlantısı, Setup Communication, READ_VAR ve WRITE_VAR'ı DB/M/Q/I alanlarında bayt
 * dizileri üzerinde yanıtlar. COTP ve yanıt kodlaması iso-on-tcp ile nodes7'nin kendi S7Serializer'ı,
 * istek çözme nodes7'nin S7Parser'ı (WRITE_VAR hariç: kütüphane istek verisini çözerken uzunluk
 * birimini karıştırıyor, o yüzden elle çözülür). Yeni bağımlılık yok.
 * `failWriteDb` verilen DB'ye yazma, PUT/GET kapalı ya da optimize DB'deki gibi erişim hatası (0x05)
 * döner; okuma çalışmaya devam eder.
 */
import net from 'node:net';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {ISOOnTCPClient}=require('iso-on-tcp');
const S7Parser=require('@st-one-io/nodes7/src/s7protocol/s7parser.js');
const S7Serializer=require('@st-one-io/nodes7/src/s7protocol/s7serializer.js');
const C=require('@st-one-io/nodes7/src/constants.json').proto;

export type FakeS7Write={area:string;byte:number;bit:number|null;data:Buffer};
export type FakeS7={port:number;memory:Map<string,Buffer>;writes:FakeS7Write[];dropClients:()=>void;close:()=>Promise<void>};
const SIZE:Record<number,number>={[C.transport.BIT]:1,[C.transport.BYTE]:1,[C.transport.CHAR]:1,[C.transport.WORD]:2,[C.transport.INT]:2,[C.transport.DWORD]:4,[C.transport.DINT]:4,[C.transport.REAL]:4};
const areaKey=(area:number,db:number)=>area===C.area.DB?'DB'+db:area===C.area.FLAGS?'M':area===C.area.OUTPUTS?'Q':area===C.area.INPUTS?'I':'?'+area;
const log=(...a:unknown[])=>{if(process.env.S7_SAHTE_LOG)console.error('sahte S7:',...a);};

/** WRITE_VAR isteği (S7 başlığı 10 bayt, parametre, veri). Bit/bayt/int taşımalarında uzunluk bit cinsinden. */
function parseWriteVar(pdu:Buffer){
 const paramLen=pdu.readUInt16BE(6),count=pdu.readUInt8(11);
 const items:{transport:number;db:number;area:number;address:number;data:Buffer}[]=[];
 let p=12,d=10+paramLen;
 for(let i=0;i<count;i++,p+=12){
  const transportSize=pdu.readUInt8(d+1);let len=pdu.readUInt16BE(d+2);
  if(transportSize===C.dataTransport.BBIT||transportSize===C.dataTransport.BBYTE||transportSize===C.dataTransport.BINT)len=Math.ceil(len/8);
  items.push({transport:pdu.readUInt8(p+3),db:pdu.readUInt16BE(p+6),area:pdu.readUInt8(p+8),address:pdu.readUIntBE(p+9,3),data:Buffer.from(pdu.subarray(d+4,d+4+len))});
  // nodes7 cok ogeli yazmada tek uzunluklu ogeden sonra dolgu baytı koymuyor (S7 spec koyar); onun bicimini izle.
 d+=4+len;
 }
 return {rid:pdu.readUInt16BE(2),pduReference:pdu.readUInt16BE(4),items};
}

export async function startFakeS7(port:number,opts:{failWriteDb?:number}={}):Promise<FakeS7>{
 const memory=new Map<string,Buffer>();
 const mem=(key:string)=>{let b=memory.get(key);if(!b){b=Buffer.alloc(256);memory.set(key,b);}return b;};
 const writes:FakeS7Write[]=[];
 const sockets=new Set<net.Socket>();
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  const iso=new ISOOnTCPClient(socket,{tpduSize:1024});
  const parser=new S7Parser(),serializer=new S7Serializer();
  const fail=(where:string)=>(e:unknown)=>{log(where,e);socket.destroy();};
  iso.on('error',()=>{});parser.on('error',fail('parser'));serializer.on('error',fail('serializer'));
  serializer.pipe(iso);
  iso.on('data',(buf:Buffer)=>{
   if(buf.length>=12&&buf[0]===0x32&&buf[1]===C.type.REQUEST&&buf[10]===C.function.WRITE_VAR){
    let req;try{req=parseWriteVar(buf);}catch(e){fail('write-parse')(e);return;}
    const items=req.items.map(it=>{
     const key=areaKey(it.area,it.db),byte=it.address>>3;
     if(it.area===C.area.DB&&it.db===opts.failWriteDb)return {returnCode:C.retval.DATA_ACCESS_FAULT};
     const b=mem(key);
     if(it.transport===C.transport.BIT){const bit=it.address&7;b[byte]=it.data[0]?b[byte]|(1<<bit):b[byte]&~(1<<bit);writes.push({area:key,byte,bit,data:it.data});}
     else{if(byte+it.data.length>b.length)return {returnCode:C.retval.DATA_OUTOFRANGE};it.data.copy(b,byte);writes.push({area:key,byte,bit:null,data:it.data});}
     return {returnCode:C.retval.DATA_OK};
    });
    serializer.write({header:{type:C.type.RESPONSE,rid:req.rid,pduReference:req.pduReference,errorClass:0,errorCode:0},param:{function:C.function.WRITE_VAR,itemCount:items.length},data:{items}});
    return;
   }
   parser.write(buf);
  });
  parser.on('data',(pdu:any)=>{
   const header={type:C.type.RESPONSE,rid:pdu.header.rid,pduReference:pdu.header.pduReference,errorClass:0,errorCode:0};
   const fn=pdu.param?.function;
   if(fn===C.function.COMM_SETUP){serializer.write({header,param:{function:fn,maxJobsCalling:1,maxJobsCalled:1,pduLength:Math.min(480,pdu.param.pduLength)}});return;}
   if(fn===C.function.READ_VAR){
    const items=pdu.param.items.map((it:any)=>{
     const b=mem(areaKey(it.area,it.db)),byte=it.address>>3;
     if(it.transport===C.transport.BIT)return {returnCode:C.retval.DATA_OK,transportSize:C.dataTransport.BBIT,data:Buffer.from([(b[byte]>>(it.address&7))&1])};
     const n=it.length*(SIZE[it.transport]||1);
     if(byte+n>b.length)return {returnCode:C.retval.DATA_OUTOFRANGE,transportSize:C.dataTransport.NULL,data:Buffer.alloc(0)};
     return {returnCode:C.retval.DATA_OK,transportSize:C.dataTransport.BBYTE,data:Buffer.from(b.subarray(byte,byte+n))};
    });
    serializer.write({header,param:{function:fn,itemCount:items.length},data:{items}});return;
   }
   log('desteklenmeyen istek',fn);
   serializer.write({header:{...header,errorClass:0x81,errorCode:0x04}});
  });
 });
 await new Promise<void>(r=>server.listen(port,'127.0.0.1',()=>r()));
 return {port,memory,writes,
  dropClients:()=>{for(const s of sockets)s.destroy();},
  close:()=>new Promise<void>(r=>{for(const s of sockets)s.destroy();server.close(()=>r());})};
}
