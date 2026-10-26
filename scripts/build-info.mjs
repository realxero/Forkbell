#!/usr/bin/env node
// Stamp this build with its version, commit and build number, so the app and
// the server can say exactly what they are. Run by the Dockerfile and the iOS
// workflow; there's no need to run it by hand.
//   GIT_SHA / GITHUB_SHA     the commit (else read from .git, if it's there)
//   FORKBELL_BUILD_NUMBER    e.g. the GitHub Actions run number
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function gitCommit() {
  const fromEnv = process.env.GIT_SHA || process.env.GITHUB_SHA || process.env.SOURCE_COMMIT;
  if (fromEnv && /^[0-9a-f]{7,40}$/i.test(fromEnv)) return fromEnv.toLowerCase();
  try {
    const git = path.join(root, '.git');
    if (!existsSync(git)) return null;
    const head = readFileSync(path.join(git, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return /^[0-9a-f]{40}$/.test(head) ? head : null;
    const ref = head.slice(5);
    const loose = path.join(git, ref);
    if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
    const packed = readFileSync(path.join(git, 'packed-refs'), 'utf8');
    return packed.split('\n').find((l) => l.endsWith(` ${ref}`))?.split(' ')[0] ?? null;
  } catch {
    return null;
  }
}

const commit = gitCommit();
const buildNumber = process.env.FORKBELL_BUILD_NUMBER && /^\d{1,9}$/.test(process.env.FORKBELL_BUILD_NUMBER) ? process.env.FORKBELL_BUILD_NUMBER : null;
const builtAt = new Date().toISOString();
const q = (v) => (v === null ? 'null' : `'${v}'`);
writeFileSync(
  path.join(root, 'packages/shared/src/build-info.ts'),
  `// Written by scripts/build-info.mjs for this build.
export const BUILD_INFO = {
  version: '${version}',
  commit: ${q(commit)} as string | null,
  buildNumber: ${q(buildNumber)} as string | null,
  builtAt: ${q(builtAt)} as string | null,
};
`,
);
console.log(`Forkbell ${version}${buildNumber ? ` build ${buildNumber}` : ''}${commit ? ` (${commit.slice(0, 7)})` : ''}`);
