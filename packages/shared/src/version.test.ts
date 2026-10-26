import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILD, sameRelease, versionLabel } from './version.ts';

test('the version matches the root package.json', () => {
  const root = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  assert.equal(BUILD.version, root.version, 'run: node scripts/set-version.mjs <version>');
});

test('version labels', () => {
  assert.equal(versionLabel({ version: '0.11.0', commit: null, buildNumber: null, builtAt: null }), '0.11.0 (dev)');
  assert.equal(versionLabel({ version: '0.11.0', commit: 'a1b2c3d4e5f6', buildNumber: '42', builtAt: null }), '0.11.0 (build 42, a1b2c3d)');
  assert.equal(versionLabel({ version: '0.11.0', commit: 'a1b2c3d4e5f6', buildNumber: null, builtAt: null }), '0.11.0 (a1b2c3d)');
});

test('same release means same major.minor', () => {
  assert.ok(sameRelease('0.11.0', '0.11.3'));
  assert.ok(!sameRelease('0.11.0', '0.12.0'));
});
