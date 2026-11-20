import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const yml = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

test('ci workflow: minimal permissions and triggers', () => {
  assert.match(yml, /permissions:\s*\r?\n\s+contents: read/);
  assert.match(yml, /workflow_dispatch/);
  assert.match(yml, /pull_request/);
  assert.match(yml, /cancel-in-progress:/);
});

test('ci workflow: runs typecheck, tests, build', () => {
  assert.match(yml, /run: npm ci/);
  assert.match(yml, /run: npx tsc --noEmit/);
  assert.match(yml, /run: npm test/);
  assert.match(yml, /run: npm run build/);
  assert.match(yml, /windows-latest/);
});

test('ci workflow: verifies opcua patch', () => {
  assert.ok(yml.includes('node-red-contrib-opcua/opcua/102-opcuaclient.js'));
  assert.ok(yml.includes('function safeIdentity('));
  assert.ok(yml.includes('userIdentity.password'));
});

test('ci workflow: no private strings (public export safe)', () => {
  assert.doesNotMatch(yml, /[A-Z]:\\Users\\|\b\d{1,3}(?:\.\d{1,3}){3}\b|PRIVATE KEY/i);
});
