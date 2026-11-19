import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
/* node-red-contrib-opcua 0.2.355 parolayi ve endpoint kimlik bilgisini loga yaziyordu.
 * patches/node-red-contrib-opcua+0.2.355.patch (postinstall: patch-package) bunu maskeler.
 * Bu test KURULU paket dosyasini okur: yama uygulanmamissa kirmizi. */
const root=path.resolve(import.meta.dirname,'..');
const pkgDir=path.join(root,'node_modules','node-red-contrib-opcua');
const read=(f:string)=>fs.readFileSync(path.join(pkgDir,'opcua',f),'utf8');
/** Log/hata cagrisi satirlari: verbose_warn/verbose_log/node_error/node.error/node.warn/console.* ve msg.error.message. */
const logLines=(src:string)=>src.split(/\r?\n/).filter(l=>!/^\s*\/\//.test(l)&&/(verbose_warn|verbose_log|node_error|node\.(error|warn|log|debug)|console\.(log|warn|error)|msg\.error\.message)\s*[(=]/.test(l));

test('opcua yamasi: surum 0.2.355 ve package.json postinstall + patch-package bagimliligi',()=>{
 assert.equal(JSON.parse(fs.readFileSync(path.join(pkgDir,'package.json'),'utf8')).version,'0.2.355','yama surume bagli; surum degisirse yamayi yenile');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.scripts.postinstall,'patch-package');
 assert.ok(pkg.dependencies['patch-package'],'npm ci --omit=dev icin dependencies altinda olmali');
 assert.ok(!pkg.devDependencies?.['patch-package']);
 assert.ok(fs.existsSync(path.join(root,'patches','node-red-contrib-opcua+0.2.355.patch')));
});

for(const file of ['102-opcuaclient.js','107-opcuamethod.js']){
 test(`opcua yamasi: ${file} log cagrilarinda parola/endpoint serilestirmesi yok`,()=>{
  const lines=logLines(read(file));
  assert.ok(lines.length>10,'log satirlari bulunmali');
  const bad=lines.filter(l=>/userIdentity\.password|stringify\(\s*userIdentity\s*\)|stringify\(\s*opcuaEndpoint\s*\)|opcuaEndpoint\.(password|credentials)/.test(l));
  assert.deepEqual(bad,[],'sizan log satirlari');
 });
}

test('opcua yamasi: maskeleme yardimcilari kurulu dosyada ve parolayi *** yapar',()=>{
 const src=read('102-opcuaclient.js');
 assert.match(src,/function safeIdentity\(u\)/);
 assert.match(src,/function safeEndpoint\(e\)/);
 assert.match(src,/and password: \*\*\*"/);
 const grab=(name:string)=>src.split(/\r?\n/).find(l=>l.includes(`function ${name}(`))!.trim();
 const fns=new Function(`${grab('safeIdentity')}\n${grab('safeEndpoint')}\nreturn {safeIdentity,safeEndpoint};`)();
 const id=fns.safeIdentity({type:1,userName:'op',password:'Gizli-123'});
 assert.ok(!id.includes('Gizli-123'));assert.match(id,/"password":"\*\*\*"/);
 const ep=fns.safeEndpoint({name:'x',endpoint:'opc.tcp://h:4840',login:true,user:'op',password:'Gizli-123',credentials:{user:'op',password:'Gizli-123'}});
 assert.ok(!ep.includes('Gizli-123'));assert.ok(!ep.includes('credentials'));
 assert.deepEqual(JSON.parse(ep),{name:'x',endpoint:'opc.tcp://h:4840',login:true});
});
