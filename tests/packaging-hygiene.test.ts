import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const root = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  overrides?: Record<string, string>;
  scripts: Record<string, string>;
};
const build = readFileSync(new URL('installer/build.ps1', root), 'utf8');

const frontendOnly = ['react', 'react-dom', 'lucide-react', '@fontsource/dm-sans', '@fontsource/manrope'];

test('on yuz paketleri devDependencies icinde, dependencies icinde degil', () => {
  for (const name of frontendOnly) {
    assert.ok(!(name in pkg.dependencies), `${name} dependencies icinde olmamali`);
    assert.ok(name in pkg.devDependencies, `${name} devDependencies icinde olmali`);
  }
});

test('mevcut koruma ayarlari korunuyor', () => {
  assert.equal(pkg.scripts.postinstall, 'patch-package');
  assert.equal(pkg.overrides?.['net-snmp'], '3.29.2');
  assert.match(pkg.dependencies.zod, /^\^4\.6\.7$/);
});

test('installer npm ci sonrasi istege bagli typescript peer paketlerini siliyor', () => {
  const ci = build.indexOf("'ci', '--omit=dev'");
  assert.ok(ci > 0, 'npm ci bulunamadi');
  assert.ok(!/'ci'[^)]*--omit=peer/.test(build), 'npm ci --omit=peer gercek peer surucu paketlerini dusurur');
  const after = build.slice(ci, build.indexOf('5/6 Runtime', ci));
  assert.match(after, /@\('typescript', '@typescript'\)/);
  assert.match(after, /Remove-Item -LiteralPath \$devOnlyPath -Recurse -Force/);
});

test('installer runtime dogrulamasi on yuz ve typescript paketlerini reddediyor', () => {
  const marker = build.indexOf('$runtimeCheck =');
  assert.ok(marker > 0, 'runtimeCheck bulunamadi');
  const check = build.slice(marker, build.indexOf('Invoke-Native $stageNode', marker));
  for (const name of ['react', 'react-dom', 'lucide-react', '@fontsource', '@typescript', 'typescript']) {
    assert.ok(check.includes(`'${name}'`), `runtimeCheck ${name} icin koruma icermeli`);
  }
});
