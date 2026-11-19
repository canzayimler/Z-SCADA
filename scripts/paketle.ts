// Bu bilgisayardaki projeyi (cihazlar, etiketler, komutlar, ekranlar, gorseller)
// paket/ klasorune yazar. Kurulum betigi hedef bilgisayarda bunu geri yukler.
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.SCADA_PORT || 3000);
const base = `http://127.0.0.1:${port}/api`;
const dataDir = path.resolve(process.env.SCADA_DATA || '.local');
const packageDir = path.resolve('paket');
const headers: Record<string, string> = {'Content-Type': 'application/json', 'x-scada-request': '1'};

async function main() {
 const accessFile = path.join(dataDir, 'admin-access.json');
 if (!fs.existsSync(accessFile)) throw Error('.local/admin-access.json yok. Once uygulamayi baslatin.');
 const access = JSON.parse(fs.readFileSync(accessFile, 'utf8'));

 const login = await fetch(base + '/login', {method: 'POST', headers, body: JSON.stringify(access)});
 if (!login.ok) throw Error('Yerel giris basarisiz. Uygulama calisiyor mu?');
 const cookie = (login.headers.get('set-cookie') || '').split(';')[0];

 const response = await fetch(base + '/export', {headers: {...headers, cookie}});
 if (!response.ok) throw Error('Proje disa aktarilamadi: ' + response.status);
 const project = await response.json() as any;

 fs.mkdirSync(packageDir, {recursive: true});
 fs.writeFileSync(path.join(packageDir, 'project.json'), JSON.stringify(project, null, 1));

 // Ekranlarda kullanilan gorselleri de pakete kopyala
 const used = new Set((JSON.stringify(project).match(/\/uploads\/[a-f0-9]{32}\.(?:png|jpg|gif|webp)/g) || [])
  .map(s => s.slice('/uploads/'.length)));
 const source = path.join(dataDir, 'uploads');
 const target = path.join(packageDir, 'uploads');
 fs.rmSync(target, {recursive: true, force: true});
 if (used.size && fs.existsSync(source)) {
  fs.mkdirSync(target, {recursive: true});
  for (const name of used) {
   const file = path.join(source, name);
   if (fs.existsSync(file)) fs.copyFileSync(file, path.join(target, name));
  }
 }

 console.log(`paket/project.json yazildi: ${project.screens.length} ekran, ${project.config.tags.length} etiket, ${project.config.devices.length} cihaz.`);
 console.log(`paket/uploads: ${used.size} gorsel.`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
