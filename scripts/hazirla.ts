// Sunucu ayaga kalktiktan sonra calisir: yonetici hesabi, paketlenmis proje ve PLC koprusu.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {restrictSecretFile} from '../apps/server/src/secrets';

const port = Number(process.env.SCADA_PORT || 3000);
const base = `http://127.0.0.1:${port}/api`;
const dataDir = path.resolve(process.env.SCADA_DATA || '.local');
const packageDir = path.resolve('paket');
const accessFile = path.join(dataDir, 'admin-access.json');
const seededFlag = path.join(dataDir, 'paket-yuklendi');
/**
 * Devreye alma ayri bir karardir (B06): varsayilan kurulum projeyi YUKLER,
 * cihazlari pasif ve ekranlari taslak birakir. Sahaya almak icin
 * `--etkinlestir` (veya SCADA_AUTO_ACTIVATE=1) gerekir.
 */
const activate = process.argv.includes('--etkinlestir') || process.env.SCADA_AUTO_ACTIVATE === '1';
const headers: Record<string, string> = {'Content-Type': 'application/json', 'x-scada-request': '1'};

/** Kurulum sirri yalnizca calisan kullaniciya ve yoneticilere okunur olsun (B39). */
function restrictFile(file: string) { restrictSecretFile(file, message => console.log(message)); }

async function call<T = any>(url: string, method = 'GET', body?: unknown, cookie = ''): Promise<T> {
 const response = await fetch(base + url, {
  method,
  headers: cookie ? {...headers, cookie} : headers,
  body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
 });
 const text = await response.text();
 const data = text ? JSON.parse(text) : {};
 if (!response.ok) throw Error((data as any).error || `${method} ${url} -> ${response.status}`);
 return data as T;
}

/** Devreye alma ozeti: hangi adresler okunacak, hangi noktalara yazilabilir, hangi ekranlar yayina girecek. */
function commissioningSummary(project: any) {
 const config = project.config, screens = project.screens || [];
 const writable = config.tags.filter((t: any) => t.access === 'readwrite');
 console.log('--- Devreye alma ozeti ---');
 for (const device of config.devices) {
  const tags = config.tags.filter((t: any) => t.deviceId === device.id);
  const connection = config.connections.find((c: any) => c.id === device.connectionId);
  const addresses = tags.map((t: any) => t.address);
  const range = addresses.length ? Math.min(...addresses) + '-' + Math.max(...addresses) : 'yok';
  console.log(`  ${device.code} @ ${connection?.host}:${connection?.port} slave ${device.slaveId} · ${tags.length} etiket · adres ${range} · ${device.enabled ? 'ETKIN' : 'pasif'}`);
 }
 console.log(`  Yazilabilir nokta: ${writable.length} (${writable.slice(0, 6).map((t: any) => t.code).join(', ')}${writable.length > 6 ? ', ...' : ''})`);
 console.log(`  Yayina girecek ekran: ${screens.filter((s: any) => !s.publishedVersion).length} / ${screens.length}`);
 console.log('--------------------------');
}
async function main() {
 const session = await call<{setup: boolean}>('/session');

 // 1) Ilk yonetici hesabi
 if (session.setup) {
  const access = {username: 'admin', password: randomBytes(18).toString('base64url')};
  await call('/setup', 'POST', access);
  fs.mkdirSync(dataDir, {recursive: true});
  fs.writeFileSync(accessFile, JSON.stringify(access, null, 2));
  restrictFile(accessFile);
  console.log('Yonetici hesabi olusturuldu. Bilgiler: ' + path.relative(process.cwd(), accessFile));
  console.log('Bu dosya yalnizca ilk kurulum icindir. Giris yaptiktan sonra parolayi degistirin ve dosyayi silin:');
  console.log('  npx tsx scripts/parola-sifirla.ts');
 }
 if (!fs.existsSync(accessFile)) {
  console.log('Yonetici parolasi bilinmiyor (.local/admin-access.json yok); proje ve kopru adimlari atlandi.');
  return;
 }

 const access = JSON.parse(fs.readFileSync(accessFile, 'utf8'));
 const login = await fetch(base + '/login', {method: 'POST', headers, body: JSON.stringify(access)});
 if (!login.ok) { console.log('Yerel giris basarisiz; proje ve kopru adimlari atlandi.'); return; }
 const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

 // 2) Pakete konmus proje (ekranlar, cihazlar, etiketler, gorseller)
 const projectFile = path.join(packageDir, 'project.json');
 if (fs.existsSync(projectFile) && !fs.existsSync(seededFlag)) {
  const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  await call('/import', 'POST', project, cookie);

  const imagesDir = path.join(packageDir, 'uploads');
  if (fs.existsSync(imagesDir)) {
   for (const name of fs.readdirSync(imagesDir)) {
    const data = fs.readFileSync(path.join(imagesDir, name)).toString('base64');
    try { await call('/uploads', 'POST', {data}, cookie); } catch (e) { console.log('  gorsel atlandi: ' + name + ' (' + (e as Error).message + ')'); }
   }
  }

  const current = await call<any>('/project', 'GET', undefined, cookie);
  fs.writeFileSync(seededFlag, new Date().toISOString());
  console.log(`Paketteki proje yuklendi: ${current.screens.length} ekran, ${current.config.tags.length} etiket.`);
  commissioningSummary(current);
  if (activate) {
   // Ice aktarma cihazlari pasif ve ekranlari taslak birakir; acik istek uzerine sahaya al.
   const config = {...current.config, devices: current.config.devices.map((d: any) => ({...d, enabled: true}))};
   await call('/config', 'PUT', config, cookie);
   for (const screen of current.screens) {
    try { await call('/screens/' + screen.id + '/publish', 'POST', {}, cookie); }
    catch (e) { console.log('  ekran yayinlanamadi: ' + screen.name + ' (' + (e as Error).message + ')'); }
   }
   console.log('Cihazlar etkinlestirildi ve ekranlar yayinlandi (--etkinlestir).');
  } else {
   console.log('Cihazlar PASIF, ekranlar TASLAK birakildi. Sahaya almak icin:');
   console.log('  npx tsx scripts/hazirla.ts --etkinlestir');
   console.log('  ya da arayuzden Cihazlar -> etkinlestir + ekranlari yayinla.');
  }
 }

 // 3) PLC koprusunu Node-RED'e uygula (yalnizca acik istek varsa ve hic uygulanmadiysa)
 const project = await call<any>('/project', 'GET', undefined, cookie);
 if (!activate) {
  console.log('Kopru uygulanmadi: devreye alma adimi ayri. `--etkinlestir` ile calistirin.');
  return;
 }
 if (!project.activeRevision) {
  try {
   await call('/deploy', 'POST', {}, cookie);
   console.log('PLC koprusu Node-RED\'e uygulandi. PLC\'ye yazma gonderilmedi.');
  } catch (e) {
   console.log('PLC koprusu uygulanamadi: ' + (e as Error).message);
   console.log('Arayuzden Cihazlar -> "Haberlesmeye uygula" ile tekrar deneyebilirsiniz.');
  }
 }
}

main().catch(e => { console.error('Hazirlik hatasi: ' + (e as Error).message); process.exitCode = 1; });
