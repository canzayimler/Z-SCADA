import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preferencesSchema,defaultPreferences,translator,dictionary} from '../packages/contracts/model';
test('preferences default to a safe, device-independent setting',()=>{
 assert.deepEqual(defaultPreferences,{theme:'system',language:'tr',density:'comfortable',homeScreenId:'',dashboard:[],panelColumns:4,panelPages:[],
  alarmSound:{enabled:true,minSeverity:'info'},kiosk:{enabled:false,rotateSeconds:0,autoFullscreen:true,hideChrome:true},pinnedScreenIds:[],savedFilters:[]});
 const parsed=preferencesSchema.parse({theme:'dark',dashboard:[{tagId:'t1'}]});
 assert.equal(parsed.theme,'dark');
 assert.deepEqual(parsed.dashboard[0],{tagId:'t1',label:'',unit:'',decimals:0,onText:'',offText:'',color:'',icon:''});
});
test('invalid preferences are rejected instead of silently stored',()=>{
 assert.throws(()=>preferencesSchema.parse({theme:'neon'}),'bilinmeyen tema reddedilir');
 assert.throws(()=>preferencesSchema.parse({dashboard:[{tagId:''}]}),'boş etiket kimliği reddedilir');
 assert.throws(()=>preferencesSchema.parse({dashboard:Array.from({length:49},()=>({tagId:'t'}))}),'panel kutusu sayısı sınırlıdır');
});
test('translation falls back to Turkish for missing keys, never to an empty label',()=>{
 const en=translator('en'),tr=translator('tr');
 assert.equal(en('nav.alarms'),'Alarms');
 assert.equal(tr('nav.alarms'),'Alarmlar');
 assert.equal(en('nav.bilinmeyen'),'nav.bilinmeyen','çevirisi olmayan anahtar boş dönmez');
 for(const key of Object.keys(dictionary.en))assert.ok(dictionary.tr[key],'İngilizce anahtarın Türkçe karşılığı olmalı: '+key);
});
