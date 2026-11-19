import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connectionSchema,deviceSchema,tagSchema,validateConfig,protocolLabels,isSymbolicProtocol,isReadOnlyProtocol,symbolicAddressField,symbolicAddressOf,addressFormatOf,connectionAddress,
 checkSqlQuery,checkSqlColumn,sqlCell,sqlCodecSource,mqttCoerce,type Config} from '../packages/contracts/model';
import {acceptSource,type SourceState} from '../apps/server/src/ingest';
import {seedConfig} from '../packages/contracts/seed';
import {sqlDriver,driverFor,assertDriversDeployable,sqlConnectionId,sqlQueryId} from '../packages/drivers/driver';
import {buildGateway,withoutCredentials} from '../apps/server/src/gateway';
/* SQL (MS SQL Server) surucusu: tek SELECT dogrulamasi (gizlenmis ifade/yorum/anahtar kelime), sorgu basina tek
 * calistirma, kimlik bilgisinin yalniz yapilandirma dugumunun credentials alaninda durmasi, hata yolunda sahte good olmamasi. */

const conn=(extra:object={})=>connectionSchema.parse({id:'q1',name:'MES DB',protocol:'sql',sqlDialect:'mssql',host:'203.0.113.90',port:1433,timeout:4000,sqlDatabase:'MES',...extra});
const device=(extra:object={})=>deviceSchema.parse({id:'qd1',connectionId:'q1',code:'DB-1',name:'MES tablo',slaveId:1,enabled:true,pollMs:5000,staleMs:20000,...extra});
const Q='SELECT TOP 1 Sicaklik, Basinc, Calisiyor FROM dbo.Olcum ORDER BY Zaman DESC';
const tag=(id:string,sqlColumn:string,dataType:string,extra:object={})=>tagSchema.parse({id,deviceId:'qd1',code:id.toUpperCase(),name:id,area:'holding-register',address:0,dataType,access:'read',min:-1e9,max:1e9,sqlQuery:Q,sqlColumn,...extra});
const base=():Config=>{const c:any=structuredClone(seedConfig);c.connections.push(conn());c.devices.push(device());return c;};
const ctx={token:'tok',revision:5,hostname:'ZS-A'};

test('SQL protokolu: etiket, sembolik alan, adres, salt okuma',()=>{
 assert.equal(protocolLabels.sql,'SQL Server');
 assert.equal(isSymbolicProtocol('sql'),true);assert.equal(isReadOnlyProtocol('sql'),true);
 assert.equal(symbolicAddressField('sql'),'sqlQuery');
 assert.equal(symbolicAddressOf({sqlQuery:Q,sqlColumn:'Basinc'},{protocol:'sql'}),'Basinc · '+Q);
 assert.equal(addressFormatOf(base(),'qd1'),'sql');
 assert.equal(connectionAddress(conn()),'203.0.113.90:1433 / MES');
 assert.equal(connectionAddress(conn({sqlInstance:'SQLEXPRESS'})),'203.0.113.90\\SQLEXPRESS / MES');
 assert.equal(driverFor(conn()).id,'sql');
 assert.equal(sqlDriver.writeLimits.allowWrite,false);assert.equal(sqlDriver.buildWriteNodes,undefined);
});

test('checkSqlQuery: tek SELECT kabul; metin/tanimlayici icindeki anahtar kelime sorun degil',()=>{
 for(const ok of [Q,'select 1 as x','SELECT TOP 1 [Delete], "Update" FROM t','SELECT TOP 1 v FROM t WHERE durum = \'DELETE; DROP TABLE x --\'',
  'SELECT TOP 1 a FROM t WHERE ad=N\'O\'\'Brien\'','SELECT TOP 1 updated_at, created_by FROM dbo.Log ORDER BY id DESC','select (select max(v) from t2) as m',
  'SELECT TOP 1 v FROM t WITH (NOLOCK)','SELECT TOP 1 a FROM x UNION ALL SELECT TOP 1 b FROM y','  select\n  1  '])
  assert.doesNotThrow(()=>checkSqlQuery(ok),ok);
 assert.equal(checkSqlQuery('  select 1  '),'select 1');
});

test('checkSqlQuery: gizlenmis ikinci ifade, yorum ve degistiren/calistiran komutlar reddedilir',()=>{
 const cases:[string,RegExp][]=[
  ['select 1; drop table x',/noktalı virgül/],['select 1;',/noktalı virgül/],[';select 1',/noktalı virgül/],
  ['select 1 -- ; drop table x',/yorum/],['select 1 --',/yorum/],['select 1 /* */ drop table x',/yorum/],['select /* gizli */ 1',/yorum/],['select 1 */',/yorum/],
  ['select 1 /*',/yorum/],['select 1 drop table x',/DROP/],['select 1\ndrop table x',/DROP/],
  ['insert into t values(1)',/SELECT ile başlamalı/],['update t set a=1',/SELECT ile başlamalı/],['delete from t',/SELECT ile başlamalı/],
  ['exec sp_who',/SELECT ile başlamalı/],['with x as (select 1 a) select a from x',/SELECT ile başlamalı/],
  ['select * into yedek from t',/INTO/],['SELECT a INTO #tmp FROM t',/INTO/],['select 1 exec(\'drop table x\')',/EXEC/],['select 1 execute sp_x',/EXECUTE/],
  ['select 1 merge t using s on 1=1 when matched then delete',/MERGE/],['select 1 truncate table t',/TRUNCATE/],['select 1 grant select on t to u',/GRANT/],
  ['select 1 alter table t add c int',/ALTER/],['select 1 create table t(a int)',/CREATE/],['select 1 waitfor delay \'0:0:5\'',/WAITFOR/],
  ['select * from openrowset(\'SQLNCLI\',\'x\',\'y\')',/OPENROWSET/],['select xp_cmdshell',/XP_CMDSHELL/],['select 1 from t with (xlock)',/XLOCK/],
  ['select 1 from t with (updlock, holdlock)',/UPDLOCK/],['select 1 shutdown',/SHUTDOWN/],['select 1 declare @a int',/DECLARE/],['select 1 set nocount on',/SET/],
  ['SeLeCt 1 DrOp TaBlE x',/DROP/],['select \'a\' drop table x',/DROP/],['select \'unterminated',/kapanmayan/],['select [x from t',/kapanmayan/],
  ['select "x from t',/kapanmayan/],['select {{payload}}',/\{ \}/],['select 1\u0000',/kontrol/],['',/gerekli/],['select '+'a'.repeat(2000),/2000/],
  ['select 1 backup database x to disk=\'c:\\x\'',/BACKUP/],['select 1 dbcc checkdb',/DBCC/],['select 1 kill 52',/KILL/],['select 1 use master',/USE/]];
 for(const [q,re] of cases)assert.throws(()=>checkSqlQuery(q),re,q);
});

test('checkSqlColumn ve sqlCell: ilk satir, tam ad yoksa buyuk-kucuk harf duyarsiz; satir yoksa undefined',()=>{
 assert.equal(checkSqlColumn(' Sicaklik '),'Sicaklik');
 for(const bad of ['','  ',undefined,'a'.repeat(129),'a\nb'])assert.throws(()=>checkSqlColumn(bad as any),/sütun/);
 const rows=[{Sicaklik:21.5,calisiyor:true,Big:'9007199254740993',Zaman:new Date(),Bos:null},{Sicaklik:99}];
 assert.equal(sqlCell(rows,'Sicaklik'),21.5);
 assert.equal(sqlCell(rows,'sicaklik'),21.5);
 assert.equal(sqlCell(rows,'Calisiyor'),true);
 assert.equal(sqlCell(rows,'yok'),undefined);
 assert.equal(sqlCell(rows,'__proto__'),undefined);
 assert.equal(sqlCell([],'Sicaklik'),undefined);assert.equal(sqlCell(undefined,'a'),undefined);assert.equal(sqlCell([[1]],'0'),undefined);
 assert.equal(mqttCoerce(sqlCell(rows,'Zaman'),'float32'),null,'tarih -> bad');
 assert.equal(mqttCoerce(sqlCell(rows,'Bos'),'float32'),null,'NULL -> bad');
 assert.equal(mqttCoerce(sqlCell(rows,'calisiyor'),'bool'),true,'bit -> bool');
 assert.equal(mqttCoerce('42','int32'),42,'bigint metin');
 const emb=(new Function(sqlCodecSource()+'\nreturn {sqlCell,mqttCoerce};'))() as {sqlCell:typeof sqlCell;mqttCoerce:typeof mqttCoerce};
 for(const col of ['Sicaklik','sicaklik','calisiyor','Big','Zaman','Bos','yok'])for(const dt of ['bool','int16','uint32','float32'])
  assert.equal(emb.mqttCoerce(emb.sqlCell(rows,col),dt),mqttCoerce(sqlCell(rows,col),dt),col+' '+dt);
});

test('validateConfig: SQL baglanti/etiket kurallari, oku/yaz reddi, paket kontrolu',()=>{
 const ok=base();ok.tags.push(tag('t1','Sicaklik','float32'),tag('t2','Calisiyor','bool'));
 assert.doesNotThrow(()=>validateConfig(ok));
 const rw=base();rw.tags.push(tag('t1','Sicaklik','float32',{access:'readwrite',min:0,max:1}));
 assert.throws(()=>validateConfig(rw),/SQL etiketi yalnız okunur/);
 const inj=base();inj.tags.push(tag('t1','Sicaklik','float32',{sqlQuery:'select 1; drop table x'}));
 assert.throws(()=>validateConfig(inj),/noktalı virgül/);
 const col=base();col.tags.push(tag('t1','','float32'));
 assert.throws(()=>validateConfig(col),/sütun adı gerekli/);
 const withConn=(extra:object)=>{const c=base();c.connections[c.connections.length-1]=conn(extra);c.tags.push(tag('t1','Sicaklik','float32'));return c;};
 assert.throws(()=>validateConfig(withConn({sqlDatabase:''})),/veritabanı adı gerekli/);
 assert.throws(()=>validateConfig(withConn({sqlDatabase:'{{x}}'})),/veritabanı adı/);
 assert.throws(()=>validateConfig(withConn({sqlInstance:'a\\b'})),/örnek adı/);
 assert.doesNotThrow(()=>validateConfig(withConn({sqlInstance:'SQLEXPRESS'})));
 assert.throws(()=>connectionSchema.parse({...conn(),sqlDialect:'postgres'}));
 assert.throws(()=>connectionSchema.parse({...conn(),host:'srv\\inst'}),'adli ornek host alanina yazilmaz');
 assert.throws(()=>sqlDriver.validate(conn(),[tag('t1','a','float32',{access:'readwrite'})]),/yalnız okunur/);
 assert.doesNotThrow(()=>assertDriversDeployable([conn()],[device()],[tag('t1','Sicaklik','float32')],'.'));
 const empty=fs.mkdtempSync(path.join(os.tmpdir(),'scada-sql-')),cwd=process.cwd();
 try{process.chdir(empty);assert.throws(()=>assertDriversDeployable([conn()],[device()],[tag('t1','Sicaklik','float32')],empty,empty),/node-red-contrib-mssql-plus kurulu değil/);}
 finally{process.chdir(cwd);}
});

test('sqlDriver.buildNodes: ayni sorgu tek calistirma; sorgu dugumde sabit, mustache kapali; sifreleme acik, koşulsuz guven kapali',()=>{
 const Q2='SELECT TOP 1 Adet FROM dbo.Sayac';
 const tags=[tag('t1','Sicaklik','float32'),tag('t2','Basinc','float32',{deviceId:'qd2'}),tag('t3','Calisiyor','bool'),tag('t4','Adet','uint32',{sqlQuery:Q2}),tag('t5','X','float32',{deviceId:'qd3',sqlQuery:'SELECT 9 AS X'})];
 const devices=[device(),device({id:'qd2',code:'DB-2',slaveId:2,pollMs:1000}),device({id:'qd3',code:'DB-3',slaveId:3,enabled:false})];
 const nodes=sqlDriver.buildNodes([conn()],devices,tags,ctx);
 const qs=nodes.filter(n=>n.type==='MSSQL');
 assert.equal(qs.length,2,'iki farkli sorgu; pasif cihazinki calismaz');
 assert.deepEqual(qs.map(n=>n.query).sort(),[Q,Q2].sort());
 for(const q of qs){assert.equal(q.parseMustache,false);assert.equal(q.queryOptType,'editor');assert.equal(q.paramsOptType,'none');assert.equal(q.modeOptType,'query');assert.equal(q.throwErrors,0);assert.equal(q.returnType,0);
  assert.equal(q.mssqlCN,'scada-sql-q1-cn');assert.deepEqual(q.wires,[['scada-sql-q1-convert']]);}
 assert.equal(qs.find(n=>n.query===Q).id,sqlQueryId(conn(),Q));
 const cn=nodes.find(n=>n.type==='MSSQL-CN');
 assert.equal(cn.id,'scada-sql-q1-cn');assert.equal(sqlConnectionId(conn(),ctx),cn.id);
 assert.equal(cn.server,'203.0.113.90');assert.equal(cn.port,'1433');assert.equal(cn.database,'MES');assert.equal(cn.encyption,true);assert.equal(cn.trustServerCertificate,false);
 assert.equal(cn.connectTimeout,'4000');assert.equal(cn.requestTimeout,'4000');assert.equal(cn.credentials,undefined);assert.equal(cn.z,undefined);
 const named=sqlDriver.buildNodes([conn({sqlInstance:'SQLEXPRESS',sqlEncrypt:false,sqlTrustServerCertificate:true})],devices,tags,ctx).find(n=>n.type==='MSSQL-CN');
 assert.equal(named.server,'203.0.113.90\\SQLEXPRESS');assert.equal(named.port,'','adli ornekte port SQL Browser\'dan');assert.equal(named.encyption,false);assert.equal(named.trustServerCertificate,true);
 const clock=nodes.find(n=>n.type==='inject'&&n.topic===qs.find(q=>q.query===Q).id.split('-q-')[1]);
 assert.equal(clock.repeat,'1','iki cihazin en kisa taramasi');
 for(const n of nodes)assert.match(n.id,/^scada-/);
 assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
 assert.deepEqual(sqlDriver.buildNodes([conn()],devices,tags,ctx),nodes);
});

test('SQL kimlik: kullanici/parola yalniz MSSQL-CN credentials alaninda; kimlikli dugum kimligi ayri; yedekte ayiklanir',()=>{
 const sctx={...ctx,secret:()=>({username:'zscada_ro',password:'Gizli-Sql-77'})};
 const nodes=sqlDriver.buildNodes([conn()],[device()],[tag('t1','Sicaklik','float32')],sctx);
 const cn=nodes.find(n=>n.type==='MSSQL-CN');
 assert.equal(cn.id,'scada-sql-q1-cn-auth');assert.deepEqual(cn.credentials,{username:'zscada_ro',password:'Gizli-Sql-77',domain:''});
 assert.equal(nodes.find(n=>n.type==='MSSQL').mssqlCN,cn.id);
 const {credentials:_c,...rest}=cn;
 assert.equal(JSON.stringify(rest).includes('Gizli'),false);assert.equal(JSON.stringify(nodes.filter(n=>n!==cn)).includes('Gizli'),false);
 assert.equal(JSON.stringify(withoutCredentials(nodes)).includes('Gizli'),false);
 assert.equal(sqlDriver.buildNodes([conn()],[device()],[tag('t1','Sicaklik','float32')],{...ctx,secret:()=>({password:'yalniz'})}).find(n=>n.type==='MSSQL-CN').id,'scada-sql-q1-cn');
});

function runner(nodes:any[],id:string){
 const fn=new Function('msg','flow','context','node',nodes.find(n=>n.id===id).func) as (...a:any[])=>any;
 const flowStore:Record<string,unknown>={},ctxStore:Record<string,unknown>={};
 const flow={get:(k:string)=>flowStore[k],set:(k:string,v:unknown)=>{flowStore[k]=v;}},context={get:(k:string)=>ctxStore[k],set:(k:string,v:unknown)=>{ctxStore[k]=v;}};
 return {run:(msg:any)=>fn(msg,flow,context,{status(){}}),flowStore};
}
test('bekci + donusum: yuk silinir; mesgulken tekrar yok; ilk satir; hata/bos sonuc -> bad; sira artar',()=>{
 const tags=[tag('t1','Sicaklik','float32',{scale:10}),tag('t2','Calisiyor','bool'),tag('t3','Basinc','int16')];
 const nodes=sqlDriver.buildNodes([conn()],[device()],tags,ctx);
 const g=runner(nodes,'scada-sql-q1-guard'),h=nodes.find(n=>n.type==='inject').topic;
 const out=g.run({topic:h,payload:'DROP TABLE x'});
 assert.deepEqual(out[0],{topic:h,sqlKey:h},'yuk (sorgu yerine gecebilecek) tasinmaz');
 assert.equal(g.run({topic:h}),null);
 const {run,flowStore}=runner(nodes,'scada-sql-q1-convert');
 flowStore['sql-busy-q1-'+h]=Date.now();
 const r=run({sqlKey:h,payload:[{Sicaklik:2.15,Calisiyor:true,Basinc:'12'},{Sicaklik:9}]});
 assert.equal(flowStore['sql-busy-q1-'+h],null);
 const by=Object.fromEntries(r.payload.samples.map((s:any)=>[s.tagId,s]));
 assert.equal(by.t1.value,21.5);assert.equal(by.t2.value,true);assert.equal(by.t3.value,12);
 assert.ok(r.payload.samples.every((s:any)=>s.quality==='good'));assert.equal(r.payload.source,'scada-sql-q1');
 for(const msg of [{sqlKey:h,error:{message:"Login failed for user 'x'."},payload:undefined},{sqlKey:h,payload:[]},{sqlKey:h,payload:[{Baska:1}]},{sqlKey:h,payload:'x'},
  {sqlKey:h,error:'ETIMEOUT',payload:[{Sicaklik:1,Calisiyor:true,Basinc:1}]}]){
  const res=run(msg);assert.ok(res.payload.samples.every((s:any)=>s.value===null&&s.quality==='bad'),JSON.stringify(msg));
 }
 assert.equal(run({sqlKey:'yok',payload:[]}),null);
 let state:SourceState|undefined;
 for(let i=0;i<50;i++){const m=run({sqlKey:h,payload:[{Sicaklik:i,Calisiyor:false,Basinc:i}]}).payload;const v=acceptSource(state,m,Date.now());assert.equal(v.ok,true);state=(v as any).next;}
});

test('buildGateway: SQL yalniz okuma dugumleri; yazma koprusu yok',()=>{
 const c=base();c.connections=[conn()];c.devices=[device()];c.tags=[tag('t1','Sicaklik','float32')];c.commands=[];
 const nodes=buildGateway(validateConfig(c),'tok',4730,'.',{hostname:'ZS-A'});
 assert.equal(nodes.filter(n=>n.type==='MSSQL').length,1);
 assert.equal(nodes.some(n=>n.id==='scada-write-http'||n.id==='scada-read-http'||n.type==='http response'),false);
});
