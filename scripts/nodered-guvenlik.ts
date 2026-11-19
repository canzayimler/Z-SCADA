/**
 * Node-RED yönetim yüzeyini güvenli varsayılanlarla kurar.
 *
 * Node-RED yönetim erişimi, akışı değiştirip SCADA'daki komut sınırlarını aşan
 * bir yazma yolu oluşturma gücü verir. Bu yüzden:
 *  - yönetim arayüzü yalnızca loopback'e bağlanır,
 *  - adminAuth zorunludur; parola rastgele üretilir ve bcrypt ile saklanır,
 *  - kimlik bilgisi yalnızca veri klasöründe tutulur ve ACL ile daraltılır.
 *
 * Betik yeniden çalıştırıldığında mevcut kimlik bilgisi korunur; `--yenile`
 * ile parola döndürülür.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {restrictSecretFile} from '../apps/server/src/secrets';

const directory = path.resolve(process.env.SCADA_DATA || '.local');
const userDir = path.join(directory, 'node-red');
const credentialFile = path.join(directory, 'nodered-admin.json');
const settingsFile = path.join(userDir, 'settings.js');
const renew = process.argv.includes('--yenile');

fs.mkdirSync(userDir, {recursive: true});

type Credential = {username: string; password: string; hash: string};
let credential: Credential | null = null;
if (!renew && fs.existsSync(credentialFile)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(credentialFile, 'utf8')) as Credential;
    if (parsed.username && parsed.password && parsed.hash) credential = parsed;
  } catch {
    credential = null;
  }
}
if (!credential) {
  const password = randomBytes(24).toString('base64url');
  credential = {username: 'scada', password, hash: bcrypt.hashSync(password, 10)};
  fs.writeFileSync(credentialFile, JSON.stringify(credential, null, 2), {mode: 0o600});
  restrictAcl(credentialFile);
  console.log(renew ? 'Node-RED yönetim parolası yenilendi.' : 'Node-RED yönetim parolası oluşturuldu.');
}

// Yalnızca uygulamanın ürettiği ayar dosyası yönetilir; kullanıcı düzenlemesi beklenmez.
const settings = `/* Z SCADA tarafından üretildi. Elle düzenlemeyin; kur.ps1/baslat.ps1 yeniden yazar. */
const fs = require('fs');
const path = require('path');
const credential = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'nodered-admin.json'), 'utf8'));
module.exports = {
  // Yönetim ve akış uçları yalnızca yerel makineden erişilebilir.
  uiHost: '127.0.0.1',
  adminAuth: {
    type: 'credentials',
    users: [{username: credential.username, password: credential.hash, permissions: '*'}]
  },
  // Kullanıcı akışlarına HTTP uçları burada açılır; köprü uçları bu kök altındadır.
  httpNodeRoot: '/',
  // Function düğümlerinde serbest modül yüklemesi kapalı tutulur.
  functionExternalModules: false,
  functionGlobalContext: {},
  logging: {console: {level: 'info', metrics: false, audit: true}},
  editorTheme: {projects: {enabled: false}}
};
`;
fs.writeFileSync(settingsFile, settings);

/** Kimlik dosyasinin korumasi: tek kaynak apps/server/src/secrets.ts. */
function restrictAcl(file: string) { restrictSecretFile(file); }

console.log('Node-RED ayar dosyası: ' + settingsFile);
console.log('Yönetim kullanıcısı: ' + credential.username + ' (parola ' + path.basename(credentialFile) + ' içinde)');
