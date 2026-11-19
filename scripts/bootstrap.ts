import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
async function main(){const base='http://127.0.0.1:3000';const session=await fetch(base+'/api/session').then(r=>r.json()) as any;const file=path.resolve('.local/admin-access.json');if(!session.setup){console.log('Yönetici hesabı zaten kurulmuş.');return;}const access={username:'admin',password:randomBytes(18).toString('base64url')};const r=await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json','x-scada-request':'1'},body:JSON.stringify(access)});if(!r.ok)throw Error(await r.text());fs.writeFileSync(file,JSON.stringify(access,null,2));console.log('Yerel yönetici bilgileri .local/admin-access.json dosyasına kaydedildi.');}
main().catch(e=>{console.error(e);process.exitCode=1;});
