import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import {precompress} from '../server/src/staticAssets';
/* Surum kaymasi (2026-09-25): build arayuzu aninda degistirir, sunucu eski kodda kalir.
 * Her derleme bir kimlik alir; pakete gomulur (__BUILD_ID__) ve dist/web/build.json'a yazilir.
 * Sunucu acilista okudugu kimligi /api/health'te doner; istemci karsilastirip bant gosterir. */
const buildId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
const buildInfo=():Plugin=>({name:'zscada-build-info',apply:'build',writeBundle(){fs.writeFileSync(path.resolve('dist/web/build.json'),JSON.stringify({id:buildId,at:Date.now()}));}});
// Sunucu sıkıştırmayı çalışırken yapmaz: .br/.gz burada üretilir, @fastify/static preCompressed ile sunar.
const precompressed=():Plugin=>({name:'zscada-precompress',apply:'build',closeBundle(){const r=precompress(path.resolve('dist/web'));console.log(`sıkıştırıldı: ${r.files} dosya, ${(r.raw/1024).toFixed(0)} kB -> br ${(r.br/1024).toFixed(0)} kB, gz ${(r.gz/1024).toFixed(0)} kB`);}});
export default defineConfig(({command})=>({root:path.resolve('apps/web'),plugins:[react(),buildInfo(),precompressed()],define:{__BUILD_ID__:JSON.stringify(command==='build'?buildId:'dev')},build:{outDir:path.resolve('dist/web'),emptyOutDir:true},server:{host:'127.0.0.1',proxy:{'/api':{target:'http://127.0.0.1:3000',ws:true},'/uploads':{target:'http://127.0.0.1:3000'}}}}));
