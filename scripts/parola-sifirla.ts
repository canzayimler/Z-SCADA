/**
 * Yönetici parolasını yerel makineden kontrollü olarak sıfırlar.
 *
 * Proje verisine (cihaz, etiket, ekran, kayıt) dokunmaz; yalnızca `users`
 * tablosundaki parolayı değiştirir ve o kullanıcının açık oturumlarını kapatır.
 * Veritabanını silerek kurtarmanın yerine geçer.
 *
 * Kullanım:
 *   npx tsx scripts/parola-sifirla.ts                 # kullanıcıları listeler
 *   npx tsx scripts/parola-sifirla.ts <kullanıcı>     # rastgele parola üretir
 *   npx tsx scripts/parola-sifirla.ts <kullanıcı> <yeni-parola>
 *
 * Sunucu çalışırken de kullanılabilir; parola değişince oturumlar düşer.
 */
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes, scryptSync} from 'node:crypto';

const directory = path.resolve(process.env.SCADA_DATA || '.local');
const file = path.join(directory, 'scada.sqlite');
if (!fs.existsSync(file)) {
  console.error('Veritabanı bulunamadı: ' + file);
  process.exit(1);
}
const db = new DatabaseSync(file);
db.exec('PRAGMA busy_timeout=5000;');

const [username, provided] = process.argv.slice(2);
if (!username) {
  const rows = db.prepare('SELECT username,role,disabled FROM users ORDER BY username').all() as any[];
  console.log('Kayıtlı kullanıcılar:');
  for (const r of rows) console.log(`  ${r.username}  (${r.role}${r.disabled ? ', devre dışı' : ''})`);
  console.log('\nSıfırlamak için: npx tsx scripts/parola-sifirla.ts <kullanıcı>');
  db.close();
  process.exit(0);
}

const row = db.prepare('SELECT id,role FROM users WHERE username=?').get(username) as any;
if (!row) {
  console.error('Kullanıcı yok: ' + username);
  db.close();
  process.exit(1);
}
if (provided && provided.length < 12) {
  console.error('Parola en az 12 karakter olmalı.');
  db.close();
  process.exit(1);
}

const password = provided || randomBytes(12).toString('base64url');
const salt = randomBytes(16).toString('hex');
const hash = salt + ':' + scryptSync(password, salt, 64).toString('hex');

db.exec('BEGIN IMMEDIATE');
try {
  db.prepare('UPDATE users SET hash=?, disabled=0 WHERE id=?').run(hash, row.id);
  const revoked = db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id).changes;
  db.prepare('INSERT INTO audit VALUES (?,?,?,?,?)').run(
    randomBytes(16).toString('hex'), 'yerel-kurtarma', 'user.password.reset',
    JSON.stringify({username, role: row.role, revokedSessions: revoked}), Date.now());
  db.exec('COMMIT');
  console.log(`Parola sıfırlandı: ${username} (${row.role})`);
  if (!provided) console.log('Yeni parola: ' + password);
  console.log(`${revoked} açık oturum kapatıldı. Proje verisi değiştirilmedi.`);
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
} finally {
  db.close();
}
