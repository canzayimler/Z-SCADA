import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Store} from '../apps/server/src/store';
import {ensureSecretFile,restrictSecretFile} from '../apps/server/src/secrets';
/* Y1: onay yolu (/api/commands/:id/approve) pasif sunucu kilidini atliyordu.
 * approve -> request -> execute -> write zinciri sahaya yazar; fencing'in tam
 * korumasi gereken yerde — iki kisi onayi isteyen en riskli sinifta — delikti.
 * Y2: kopru token'i korumasiz yaziliyordu; bu dosya sahte ORNEK enjekte etme
 * anahtaridir, okuyan yerel hesap operatore olmayan bir gerceklik gosterebilir. */
let createServer:(()=>Promise<any>)|null=null;
async function serverModule(){
 if(!createServer){process.env.SCADA_NO_LISTEN='1';createServer=(await import('../apps/server/src/index')).createServer as any;}
 return createServer!;
}
const headers={'content-type':'application/json','x-scada-request':'1'};
/** standby=true ise sahiplik kirasi once BASKA bir ornege verilir. */
async function boot(standby:boolean){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-standby-'));
 if(standby){const other=new Store(dir);other.claimOwnership('baska-sunucu',60000);other.close();}
 process.env.SCADA_DATA=dir;
 const app=await (await serverModule())() as any;
 await app.inject({method:'POST',url:'/api/setup',headers,payload:{username:'admin',password:'Test-parola-2026!'},remoteAddress:'127.0.0.1'});
 const login=await app.inject({method:'POST',url:'/api/login',headers,payload:{username:'admin',password:'Test-parola-2026!'}});
 assert.equal(login.statusCode,200);
 return {app,cookie:String(login.headers['set-cookie']).split(';')[0],dir};
}
const approve=(app:any,cookie:string)=>app.inject({method:'POST',url:'/api/commands/bilinmeyen-id/approve',headers:{...headers,cookie},payload:{}});

test('pasif sunucuda onay yolu reddedilir — fencing onayda da gecerli',async()=>{
 const {app,cookie}=await boot(true);
 const response=await approve(app,cookie);
 assert.equal(response.statusCode,409);
 assert.match(String(response.json().error),/pasif/);
 await app.scadaClose();
});

test('aktif sunucuda ayni istek sahiplik yuzunden degil, komut bulunamadigi icin duser',async()=>{
 const {app,cookie}=await boot(false);
 const response=await approve(app,cookie);
 assert.notEqual(response.statusCode,409,'aktif sunucuda STANDBY engeli calismamali');
 assert.match(String(response.json().error),/bulunamadı/i);
 await app.scadaClose();
});

/** Dosyaya "herkes"/Users okuma hakki kalmis mi? Windows'ta ACL, digerlerinde mod. */
function worldReadable(file:string){
 if(process.platform!=='win32')return (fs.statSync(file).mode&0o077)!==0;
 const acl=execFileSync('icacls',[file],{encoding:'utf8'});
 return /\Users:|Everyone:|BUILTIN\Users/i.test(acl);
}

test('sir dosyasi olusturulurken ve sonraki aciliste daraltilir',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-secret-'));
 const file=path.join(dir,'gateway-token');
 const first=ensureSecretFile(file,()=>'ilk-deger');
 assert.equal(first,'ilk-deger');
 assert.ok(!worldReadable(file),'yeni yazilan sir dosyasi genis okunur kalmamali');
 const second=ensureSecretFile(file,()=>'baska-deger');
 assert.equal(second,'ilk-deger','var olan sir yeniden uretilmez');
});

test('korumasiz yazilmis eski token acilista tazelenir',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scada-secret-eski-'));
 const file=path.join(dir,'gateway-token');
 fs.writeFileSync(file,'eski-token');// eski surumun biraktigi korumasiz dosya
 if(process.platform!=='win32')fs.chmodSync(file,0o644);
 assert.equal(ensureSecretFile(file,()=>'yeni'),'eski-token');
 assert.ok(!worldReadable(file),'eski dosyanin korumasi acilista tazelenmeli');
});

test('sunucu acilisi kopru token dosyasini korumali birakir',async()=>{
 const {app,dir}=await boot(false);
 const file=path.join(dir,'gateway-token');
 assert.ok(fs.existsSync(file));
 assert.ok(!worldReadable(file));
 await app.scadaClose();
});

test('izin daraltma basarisiz olursa sessiz kalmaz, uyarir',()=>{
 const warnings:string[]=[];
 restrictSecretFile(path.join(os.tmpdir(),'olmayan-dizin-'+Date.now(),'yok.txt'),m=>warnings.push(m));
 assert.equal(warnings.length,1);
 assert.match(warnings[0],/izinleri daraltılamadı/);
});
