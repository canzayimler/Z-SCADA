import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

const root=new URL('../',import.meta.url);
const read=(rel:string)=>fs.readFileSync(new URL(rel,root),'utf8');

test('main.tsx WDG a11y ve dinamik theme-color kurallarini uygular',()=>{
 const src=read('apps/web/src/main.tsx');
 assert.match(src,/meta\[name="theme-color"\]/);
 assert.match(src,/<main className="login-stage">/);
 assert.match(src,/name="username"[^>]*spellCheck=\{false\}/);
 assert.match(src,/name="password"/);
 assert.match(src,/className="login-error" role="alert"/);
 assert.match(src,/<a className="brand" href="\/"/);
 assert.match(src,/className="prefs-toggle"/);
 assert.match(src,/className="theme-toggle"/);
 assert.match(src,/aria-label="Başlangıç düzeni ve şablonlar"/);
 assert.equal((src.match(/role="radiogroup"/g)||[]).length,2,'runtime-view-switch + yeni ekran modali toplam 2 radiogroup tasimali');
});

test('ObjectAppearance varyant onizlemeleri inert ve roving tabIndex kullanir',()=>{
 const src=read('apps/web/src/ObjectAppearance.tsx');
 assert.match(src,/className="variant-preview" aria-hidden="true" inert/);
 assert.match(src,/role="radio" tabIndex=\{active\?0:-1\}/);
 assert.match(src,/ArrowRight/);
});

test('Studio.tsx toolbar toggle aria-pressed, zoom etiketleri ve Escape odagini saglar',()=>{
 const src=read('apps/web/src/Studio.tsx');
 assert.match(src,/function Tool\([^\n]*pressed\?:boolean/);
 assert.match(src,/<button type="button" className=\{'tool '\+\(active\?'active':''\)\} title=\{title\} aria-label=\{title\} aria-pressed=\{pressed\}/);
 assert.match(src,/aria-label="Uzaklaştır" title="Uzaklaştır"/);
 assert.match(src,/aria-label="Yakınlaştır" title="Yakınlaştır"/);
 assert.match(src,/resTriggerRef\.current\?\.focus\(\)/);
 assert.match(src,/Çoklu seçimde tek tek düzenlenir/);
});

test('style.css ve studio.css Faz 4 cila, overscroll, tabular-nums ve duz yuzey kurallarina uyar',()=>{
 const style=read('apps/web/src/style.css');
 const studio=read('apps/web/src/studio.css');
 assert.match(style,/--nav-run:#38b877/);
 assert.match(style,/\.modal\{[^}]*overscroll-behavior:contain/);
 assert.match(style,/\.top-clock\{[^}]*font-variant-numeric:tabular-nums/);
 assert.doesNotMatch(style,/\.resolution-toolbar\{/);
 assert.match(studio,/\.library-hover-preview\{[^}]*top:56px/);
 assert.doesNotMatch(studio,/\.library-hover-stage\{[^}]*radial-gradient/);
 assert.match(studio,/\.resolution-trigger\{[^}]*white-space:nowrap/);
 assert.match(studio,/\.library-hover-preview\{animation:none\}/);
});
