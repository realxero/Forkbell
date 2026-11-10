// Builds the Form check page (public/form): bundles form/main.ts and copies
// MediaPipe's pose WebAssembly next to it, so it's served by your own server.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, '..', 'public', 'form');
mkdirSync(out, { recursive: true });
await build({ entryPoints: [path.join(here, '..', 'form', 'main.ts')], bundle: true, format: 'esm', target: 'es2020', minify: true, outfile: path.join(out, 'form.js') });
const wasm = path.join(path.dirname(createRequire(import.meta.url).resolve('@mediapipe/tasks-vision')), 'wasm');
// Copy every runtime file the installed version ships: 1.2 dropped the "nosimd"
// build and added a "module" one, and a hard-coded list broke the Docker build.
rmSync(path.join(out, 'wasm'), { recursive: true, force: true });
cpSync(wasm, path.join(out, 'wasm'), { recursive: true });
if (!readdirSync(path.join(out, 'wasm')).some((f) => f.endsWith('.wasm'))) throw new Error(`no .wasm files in ${wasm}`);
console.log('form check page built');
