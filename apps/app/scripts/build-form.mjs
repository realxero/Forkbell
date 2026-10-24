// Builds the Form check page (public/form): bundles form/main.ts and copies
// MediaPipe's pose WebAssembly next to it, so it's served by your own server.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(here, '..', 'public', 'form');
mkdirSync(path.join(out, 'wasm'), { recursive: true });
await build({ entryPoints: [path.join(here, '..', 'form', 'main.ts')], bundle: true, format: 'esm', target: 'es2020', minify: true, outfile: path.join(out, 'form.js') });
const wasm = path.join(path.dirname(createRequire(import.meta.url).resolve('@mediapipe/tasks-vision')), 'wasm');
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) cpSync(path.join(wasm, f), path.join(out, 'wasm', f));
console.log('form check page built');
