// Sir dosyalarinin disk uzerindeki korumasi. Uc ayri yerde (kurulum sirri,
// Node-RED kimligi, kopru token'i) ayni is yapiliyordu; token dosyasi atlanmis
// ve korumasiz kalmisti (Y2). Tek kaynak: kopyalar birbirinden ayrilamasin.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

/* Dile bagimsiz iyi bilinen SID'ler (Administrators, SYSTEM): yerellestirilmis
 * Windows'ta 'Administrators' adi cozulmez. installer/z-scada.iss ile ayni. */
export const ICACLS_WELL_KNOWN_GRANTS=['/grant:r','*S-1-5-32-544:F','/grant:r','*S-1-5-18:F'];

/** Dosyayi yalnizca calisan kullaniciya ve yoneticilere birakir. */
export function restrictSecretFile(file:string,warn:(message:string)=>void=console.warn){
 if(process.platform!=='win32'){
  try{fs.chmodSync(file,0o600);}catch{warn('Uyarı: dosya izinleri daraltılamadı: '+path.basename(file));}
  return;
 }
 /* Principal ALAN\kullanici bicimindedir. Ters boluyu sablon literaline
  * yazmak kacis tuzagidir: degisken genislemez, icacls 1332 ile duser — bu
  * hata hazirla.ts'te sessizce duruyordu. path.win32.sep tuzagi kapatir. */
 const domain=process.env.USERDOMAIN||process.env.COMPUTERNAME||'';
 const user=process.env.USERNAME?(domain?domain+path.win32.sep:'')+process.env.USERNAME:'';
 try{
  execFileSync('icacls',[file,'/inheritance:r',...(user?['/grant:r',`${user}:F`]:[]),...ICACLS_WELL_KNOWN_GRANTS],{stdio:'ignore'});
 }catch{warn('Uyarı: '+path.basename(file)+' dosya izinleri daraltılamadı; dosyayı elle koruyun.');}
}

/**
 * Sir dosyasini olusturur (yoksa) ve her acilista korumasini tazeler.
 * Tazeleme kasitli: dosya daha once korumasiz yazilmis olabilir, ya da
 * kopyalanirken miras aldigi ACL ile gelmis olabilir.
 */
export function ensureSecretFile(file:string,create:()=>string,warn?:(message:string)=>void):string{
 if(!fs.existsSync(file))fs.writeFileSync(file,create(),{mode:0o600});
 restrictSecretFile(file,warn);
 return fs.readFileSync(file,'utf8').trim();
}
