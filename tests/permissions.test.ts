import {test} from 'node:test';
import assert from 'node:assert/strict';
import {permits,visibleScreens,userPermissionsSchema,emptyPermissions,type User} from '../packages/contracts/model';
const user=(role:User['role'],permissions=emptyPermissions):User=>({id:'u',username:'u',role,permissions});
test('an empty permission list means no narrowing at all',()=>{
 const op=user('operator');
 assert.equal(permits(op,'commands','cmd-1'),true);
 assert.equal(permits(op,'screens','screen-main'),true);
 assert.equal(permits(op,'areas','Dolum'),true);
});
test('permissions narrow the role and never widen it',()=>{
 const op=user('operator',userPermissionsSchema.parse({commands:['cmd-1'],screens:['screen-main'],areas:['Dolum']}));
 assert.equal(permits(op,'commands','cmd-1'),true);
 assert.equal(permits(op,'commands','cmd-2'),false,'kapsam dışı ekipmana komut yok');
 assert.equal(permits(op,'screens','screen-2'),false,'kapsam dışı ekran yok');
 assert.equal(permits(op,'areas','Kazan'),false,'kapsam dışı alarm alanı yok');
 const viewer=user('viewer',userPermissionsSchema.parse({commands:['cmd-1']}));
 assert.equal(permits(viewer,'commands','cmd-1'),true,'izin listesi rolü genişletmez; komut yetkisi yine rolde kontrol edilir');
});
test('admin is never narrowed by permissions',()=>{
 const admin=user('admin',userPermissionsSchema.parse({screens:['screen-main'],commands:['cmd-1'],areas:['Dolum']}));
 assert.equal(permits(admin,'screens','baska-ekran'),true);
 assert.equal(permits(admin,'commands','baska-komut'),true);
});
test('visibleScreens hides screens outside the scope but keeps them for admins',()=>{
 const screens=[{id:'a'},{id:'b'},{id:'c'}];
 const op=user('operator',userPermissionsSchema.parse({screens:['a','c']}));
 assert.deepEqual(visibleScreens(op,screens).map(s=>s.id),['a','c']);
 assert.deepEqual(visibleScreens(user('admin',userPermissionsSchema.parse({screens:['a']})),screens).map(s=>s.id),['a','b','c']);
 assert.deepEqual(visibleScreens(user('operator'),screens).map(s=>s.id),['a','b','c'],'izin yoksa herkes tüm ekranları görür');
});
test('permission payloads are validated and defaulted',()=>{
 const parsed=userPermissionsSchema.parse({});
 assert.deepEqual(parsed,{screens:[],commands:[],areas:[]});
 assert.throws(()=>userPermissionsSchema.parse({screens:[123]}),'liste yalnız metin kabul eder');
});
