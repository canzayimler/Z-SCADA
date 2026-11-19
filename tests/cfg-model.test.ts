import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
 modbusRef,parseModbusRef,nextFreeAddress,nextCode,seriesTags,seriesConflicts,
 sampleText,commandSentence,missingCommands,tagGroups,
} from '../apps/web/src/cfgModel';
import {tagSchema} from '../packages/contracts/model';
import type {Config,Sample,Tag} from '../packages/contracts/model';

/* Saf yardimcilar icin gercek Tag nesneleri: tagSchema'daki tum zorunlu/varsayilan alanlar elle verilir
 * (schema.parse degil, dogrudan nesne harfi — bu fonksiyonlar validasyon yapmiyor, sadece sekli tuketiyor). */
function tag(patch: Partial<Tag> & Pick<Tag,'id'|'deviceId'|'code'|'area'|'address'|'dataType'|'access'>): Tag {
 return {
  name: patch.code, scale: 1, offset: 0, min: 0, max: 65535, unit: '', description: '',
  wordOrder: 'big', byteOrder: 'big', bit: null, verifyTolerance: null,
  history: false, historyDeadband: 0, historyMaxGapMs: 60000,
  ...patch,
 } as Tag;
}

// --- modbusRef / parseModbusRef ------------------------------------------------

test('modbusRef: coil taban matematigi — 0 tabanli adres, 1 tabanli baz, 5 haneli "00001" bicimi', () => {
 // AREA_INFO.coil.base = 1; sonuc padStart(5,'0') ile 00001 kuralina uyar ve parseModbusRef ile round-trip eder.
 assert.equal(modbusRef('coil', 0), '00001');
 assert.equal(modbusRef('coil', 4), '00005');
 assert.deepEqual(parseModbusRef(modbusRef('coil', 0)), {area: 'coil', address: 0});
});

test('modbusRef: discrete-input / input-register / holding-register 5 haneli referans uretir', () => {
 assert.equal(modbusRef('discrete-input', 0), '10001');
 assert.equal(modbusRef('input-register', 52), '30053');
 assert.equal(modbusRef('holding-register', 0), '40001');
});

test('modbusRef: 9999 adresini asan holding register 6 haneli referansa gecer', () => {
 assert.equal(modbusRef('holding-register', 10000), '410001');
});

test('parseModbusRef: gecerli referanslar round-trip eder', () => {
 assert.deepEqual(parseModbusRef('40001'), {area: 'holding-register', address: 0});
 assert.deepEqual(parseModbusRef('30053'), {area: 'input-register', address: 52});
 assert.deepEqual(parseModbusRef('410001'), {area: 'holding-register', address: 10000});
 assert.deepEqual(parseModbusRef('10001'), {area: 'discrete-input', address: 0});
 assert.deepEqual(parseModbusRef('00001'), {area: 'coil', address: 0});
});

test('parseModbusRef: gecersiz girdiler null doner', () => {
 assert.equal(parseModbusRef('5001'), null); // taninmayan onek (5)
 assert.equal(parseModbusRef('abc'), null); // sayisal degil
 assert.equal(parseModbusRef('90001'), null); // taninmayan onek (9)
});

// --- nextFreeAddress -----------------------------------------------------------

test('nextFreeAddress: coil alaninda her etiket 1 adres kaplar', () => {
 const tags = [
  tag({id: 't1', deviceId: 'd1', code: 'M0', area: 'coil', address: 0, dataType: 'bool', access: 'readwrite'}),
  tag({id: 't2', deviceId: 'd1', code: 'M1', area: 'coil', address: 3, dataType: 'bool', access: 'readwrite'}),
 ];
 assert.equal(nextFreeAddress(tags, 'd1', 'coil'), 4);
});

test('nextFreeAddress: holding register alaninda float32 2 register kaplar', () => {
 const tags = [
  tag({id: 't1', deviceId: 'd1', code: 'D0', area: 'holding-register', address: 0, dataType: 'float32', access: 'readwrite'}),
 ];
 assert.equal(nextFreeAddress(tags, 'd1', 'holding-register'), 2);
});

test('nextFreeAddress: bit etiketleri (uint16 uzerinde tek bit) 1 adres kaplamis gibi sayilir', () => {
 const tags = [
  tag({id: 't1', deviceId: 'd1', code: 'D0.0', area: 'holding-register', address: 5, dataType: 'uint16', access: 'readwrite', bit: 0}),
 ];
 // bit!==null -> AREA_INFO.bool || bit!==null true -> +1, register'in tam boyutu (registerCount) yerine.
 assert.equal(nextFreeAddress(tags, 'd1', 'holding-register'), 6);
});

test('nextFreeAddress: baska cihazin etiketleri yok sayilir', () => {
 const tags = [
  tag({id: 't1', deviceId: 'other', code: 'D0', area: 'holding-register', address: 100, dataType: 'uint16', access: 'readwrite'}),
 ];
 assert.equal(nextFreeAddress(tags, 'd1', 'holding-register'), 0);
});

// --- nextCode --------------------------------------------------------------------

test('nextCode: sayiyla biten kod alinmis sayilari atlayarak artar', () => {
 const taken = new Set(['M0', 'M1']);
 assert.equal(nextCode('M0', taken), 'M2');
});

test('nextCode: sayiyla bitmeyen kod _2 sonekiyle benzersizlesir', () => {
 const taken = new Set(['P_TOT']);
 assert.equal(nextCode('P_TOT', taken), 'P_TOT_2');
});

test('nextCode: ardisik cakismalari atlar', () => {
 const taken = new Set(['M0', 'M1', 'M2', 'M3']);
 assert.equal(nextCode('M0', taken), 'M4');
});

// --- seriesTags / seriesConflicts -------------------------------------------------

test('seriesTags: adres adim (step) ile kod/ad onekiyle ardisik seri uretir', () => {
 const base = tag({id: 'base', deviceId: 'd1', code: 'X', area: 'holding-register', address: 0, dataType: 'uint16', access: 'read'});
 let n = 0;
 const out = seriesTags(base, {count: 3, codePrefix: 'D', startIndex: 10, namePrefix: 'Deger ', address: 100, step: 2}, () => 'id' + (n++));
 assert.equal(out.length, 3);
 assert.deepEqual(out.map(t => t.code), ['D10', 'D11', 'D12']);
 assert.deepEqual(out.map(t => t.name), ['Deger 10', 'Deger 11', 'Deger 12']);
 assert.deepEqual(out.map(t => t.address), [100, 102, 104]);
 assert.deepEqual(out.map(t => t.id), ['id0', 'id1', 'id2']);
});

test('seriesTags: namePrefix bos ise codePrefix ad olarak kullanilir', () => {
 const base = tag({id: 'base', deviceId: 'd1', code: 'X', area: 'holding-register', address: 0, dataType: 'uint16', access: 'read'});
 const out = seriesTags(base, {count: 1, codePrefix: 'D', startIndex: 1, namePrefix: '', address: 0, step: 1}, () => 'x');
 assert.equal(out[0].name, 'D1');
});

test('seriesConflicts: ayni kod cakismasi yakalanir', () => {
 const existing = [tag({id: 'e1', deviceId: 'd1', code: 'D10', area: 'holding-register', address: 500, dataType: 'uint16', access: 'read'})];
 const series = [tag({id: 's1', deviceId: 'd1', code: 'D10', area: 'holding-register', address: 999, dataType: 'uint16', access: 'read'})];
 assert.deepEqual(seriesConflicts(existing, series), ['D10']);
});

test('seriesConflicts: ayni cihaz+alan+adres cakismasi yakalanir', () => {
 const existing = [tag({id: 'e1', deviceId: 'd1', code: 'D10', area: 'holding-register', address: 100, dataType: 'uint16', access: 'read'})];
 const series = [tag({id: 's1', deviceId: 'd1', code: 'D99', area: 'holding-register', address: 100, dataType: 'uint16', access: 'read'})];
 assert.deepEqual(seriesConflicts(existing, series), ['D99']);
});

test('seriesConflicts: bit etiketleri adres cakismasindan muaf tutulur', () => {
 const existing = [tag({id: 'e1', deviceId: 'd1', code: 'D10', area: 'holding-register', address: 100, dataType: 'uint16', access: 'read', bit: 0})];
 const series = [tag({id: 's1', deviceId: 'd1', code: 'D99', area: 'holding-register', address: 100, dataType: 'uint16', access: 'read', bit: 1})];
 // existing filtrelenirken bit!==null olanlar disarida birakiliyor -> adr cakismasi yok, kod da farkli -> cakisma yok.
 assert.deepEqual(seriesConflicts(existing, series), []);
});

test('seriesConflicts: cakismayan seri elemanlari bos dizi doner', () => {
 const existing = [tag({id: 'e1', deviceId: 'd1', code: 'D10', area: 'holding-register', address: 100, dataType: 'uint16', access: 'read'})];
 const series = [tag({id: 's1', deviceId: 'd1', code: 'D20', area: 'holding-register', address: 200, dataType: 'uint16', access: 'read'})];
 assert.deepEqual(seriesConflicts(existing, series), []);
});

// --- sampleText --------------------------------------------------------------------

test('sampleText: iyi kaliteli sayisal deger birim ve tr-TR ondalik bicimiyle gosterilir', () => {
 const t = {unit: 'bar', dataType: 'float32' as const};
 const s: Sample = {value: 12.3456, quality: 'good', receivedAt: 0, sampledAt: 0, sequence: 0};
 const r = sampleText(t, s);
 assert.equal(r.state, 'good');
 assert.equal(r.value, '12,346 bar');
 assert.equal(r.text, r.value);
});

test('sampleText: tam sayi ondalik gostermez', () => {
 const t = {unit: 'kW', dataType: 'uint16' as const};
 const s: Sample = {value: 1000, quality: 'good', receivedAt: 0, sampledAt: 0, sequence: 0};
 const r = sampleText(t, s);
 assert.equal(r.value, '1.000 kW');
});

test('sampleText: boolean deger AÇIK/KAPALI gosterir', () => {
 const t = {unit: '', dataType: 'bool' as const};
 assert.equal(sampleText(t, {value: true, quality: 'good', receivedAt: 0, sampledAt: 0, sequence: 0}).value, 'AÇIK');
 assert.equal(sampleText(t, {value: false, quality: 'good', receivedAt: 0, sampledAt: 0, sequence: 0}).value, 'KAPALI');
});

test('sampleText: bayat/hatali/hic okunmamis durumlar deger yerine durum metni gosterir', () => {
 const t = {unit: '', dataType: 'uint16' as const};
 const stale: Sample = {value: 5, quality: 'stale', receivedAt: 0, sampledAt: 0, sequence: 0};
 const bad: Sample = {value: 5, quality: 'bad', receivedAt: 0, sampledAt: 0, sequence: 0};
 const never: Sample = {value: 5, quality: 'unknown', receivedAt: 0, sampledAt: 0, sequence: 0};
 assert.equal(sampleText(t, stale).text, 'Bayat');
 assert.equal(sampleText(t, stale).state, 'stale');
 assert.equal(sampleText(t, bad).text, 'Hata');
 assert.equal(sampleText(t, bad).state, 'bad');
 assert.equal(sampleText(t, undefined).text, 'Hiç okunmadı');
 assert.equal(sampleText(t, undefined).state, 'never');
 assert.equal(sampleText(t, never).state, 'never');
});

// --- commandSentence ---------------------------------------------------------------

function miniConfig(tags: Tag[], deviceCode = 'PLC1'): Config {
 return {
  revision: 1, name: 'test',
  connections: [],
  devices: [{id: 'd1', connectionId: 'c1', code: deviceCode, name: deviceCode, slaveId: 1, enabled: true, pollMs: 1000, staleMs: 5000, description: ''}],
  tags,
  commands: [],
 } as unknown as Config;
}

test('commandSentence: cihaz kodlariyla yazma hedefini anlatir, geri bildirim yoksa "geri okuma yok" der', () => {
 const t1 = tag({id: 't1', deviceId: 'd1', code: 'M0', area: 'coil', address: 0, dataType: 'bool', access: 'readwrite'});
 const cfg = miniConfig([t1]);
 const sentence = commandSentence({tagIds: ['t1'], feedbackTagIds: [], timeoutMs: 7000}, cfg);
 assert.equal(sentence, 'PLC1.M0 yazar · geri okuma yok');
});

test('commandSentence: geri bildirim varsa etiketleri ve zaman asimini (sn) ekler', () => {
 const t1 = tag({id: 't1', deviceId: 'd1', code: 'M0', area: 'coil', address: 0, dataType: 'bool', access: 'readwrite'});
 const t2 = tag({id: 't2', deviceId: 'd1', code: 'X0', area: 'discrete-input', address: 0, dataType: 'bool', access: 'read'});
 const cfg = miniConfig([t1, t2]);
 const sentence = commandSentence({tagIds: ['t1'], feedbackTagIds: ['t2'], timeoutMs: 7500}, cfg);
 assert.equal(sentence, 'PLC1.M0 yazar · PLC1.X0 ile doğrular · 7.5 sn bekler');
});

// --- missingCommands --------------------------------------------------------------

test('missingCommands: yalniz yazilabilir (readwrite) ve hicbir komutta kullanilmayan etiketler icin komut uretir', () => {
 const rw = tag({id: 't1', deviceId: 'd1', code: 'M0', area: 'coil', address: 0, dataType: 'bool', access: 'readwrite'});
 const ro = tag({id: 't2', deviceId: 'd1', code: 'X0', area: 'discrete-input', address: 0, dataType: 'bool', access: 'read'});
 const covered = tag({id: 't3', deviceId: 'd1', code: 'M1', area: 'coil', address: 1, dataType: 'bool', access: 'readwrite'});
 const existingCommand = {id: 'c1', name: 'M1 kontrol', tagIds: ['t3'], feedbackTagIds: ['t3'], timeoutMs: 7000, permissives: [], risk: 'normal' as const, approval: 'none' as const, scope: ''};
 const out = missingCommands([rw, ro, covered], [existingCommand], (t) => 'new-' + t.id);
 assert.equal(out.length, 1);
 assert.equal(out[0].id, 'new-t1');
 assert.equal(out[0].name, 'M0 kontrol');
 assert.deepEqual(out[0].tagIds, ['t1']);
 assert.deepEqual(out[0].feedbackTagIds, ['t1']);
 assert.equal(out[0].timeoutMs, 7000);
});

test('missingCommands: hicbir yazilabilir etiket eksik degilse bos dizi doner', () => {
 const covered = tag({id: 't1', deviceId: 'd1', code: 'M0', area: 'coil', address: 0, dataType: 'bool', access: 'readwrite'});
 const cmd = {id: 'c1', name: 'M0 kontrol', tagIds: ['t1'], feedbackTagIds: ['t1'], timeoutMs: 7000, permissives: [], risk: 'normal' as const, approval: 'none' as const, scope: ''};
 assert.deepEqual(missingCommands([covered], [cmd], (t) => t.id), []);
});

test('tagGroups: cihaz bölümleri ilk görülme sırasıyla, bölümsüz ayrı, boş adlar sayılmaz', () => {
 const tags = [
  {deviceId:'d1',group:'Pano 1'},{deviceId:'d1',group:' Pano 1 '},{deviceId:'d1'},{deviceId:'d1',group:'Konveyör'},
  {deviceId:'d2',group:'Başka'},{deviceId:'d1',group:''},
 ];
 const g = tagGroups(tags, 'd1', ['Yeni', 'Pano 1', '  ']);
 assert.deepEqual(g.named, [['Pano 1',2],['Konveyör',1],['Yeni',0]]);
 assert.equal(g.ungrouped, 2);
 assert.deepEqual(tagGroups(tags, 'yok'), {named:[],ungrouped:0});
});

test('tagSchema: bölüm isteğe bağlı, kırpılır, 60 karakterle sınırlı', () => {
 const base = {id:'t1',deviceId:'d1',code:'M0',name:'M0',area:'coil',address:0,dataType:'bool',access:'read'};
 assert.equal(tagSchema.parse(base).group, undefined);
 assert.equal(tagSchema.parse({...base,group:'  Pano 1 '}).group, 'Pano 1');
 assert.throws(() => tagSchema.parse({...base,group:'x'.repeat(61)}));
});

test('missingCommands: yeni komut etiketin klasorune duser (Komutlar gezgini cihaz -> klasor)', () => {
 const grouped = tag({id: 't1', deviceId: 'd1', code: 'Y0', area: 'coil', address: 1280, dataType: 'bool', access: 'readwrite', group: ' Pompalar '});
 const loose = tag({id: 't2', deviceId: 'd1', code: 'Y1', area: 'coil', address: 1281, dataType: 'bool', access: 'readwrite'});
 const out = missingCommands([grouped, loose], [], (t) => 'cmd-' + t.id) as unknown as {group: string}[];
 assert.deepEqual(out.map((c) => c.group), ['Pompalar', '']);
});
