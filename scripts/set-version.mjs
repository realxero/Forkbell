#!/usr/bin/env node
// Set Forkbell's version everywhere it's written down:
//   node scripts/set-version.mjs 0.12.0
// The root package.json is the source; the workspace packages and
// packages/shared/src/build-info.ts follow it. The app's version (what iOS and
// Android show) is read from the root package.json by apps/app/app.config.js.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: node scripts/set-version.mjs <major.minor.patch>');
  process.exit(1);
}
for (const p of ['package.json', 'apps/app/package.json', 'apps/server/package.json', 'packages/db/package.json', 'packages/shared/package.json']) {
  const file = path.join(root, p);
  const text = readFileSync(file, 'utf8');
  const next = /"version":\s*"[^"]*"/.test(text)
    ? text.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`)
    : text.replace(/"name":\s*"([^"]*)",/, `"name": "$1",\n  "version": "${version}",`);
  writeFileSync(file, next);
}
const info = path.join(root, 'packages/shared/src/build-info.ts');
writeFileSync(info, readFileSync(info, 'utf8').replace(/version: '[^']*'/, `version: '${version}'`));
console.log(`Forkbell is now ${version}`);
