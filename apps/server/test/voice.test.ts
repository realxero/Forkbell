// Bell's voice from a speech server (Kokoro-FastAPI speaks the OpenAI audio API).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { BASE, newUser, startServer, stopServer } from './harness.ts';

let tts: Server;
const heard: { model: string; input: string; voice: string; response_format: string }[] = [];
const MP3 = Buffer.from('ID3fake-mp3-bytes');

before(async () => {
  tts = createServer((req, res) => {
    if (req.url === '/v1/audio/voices') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ voices: ['af_heart', 'bm_george', 'bad voice!'] }));
    if (req.url === '/v1/audio/speech' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        heard.push(JSON.parse(body));
        res.writeHead(200, { 'content-type': 'audio/mpeg' }).end(MP3);
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => tts.listen(3881, r));
  await startServer({ TTS_BASE_URL: 'http://localhost:3881/v1', TTS_VOICE: 'af_heart' });
});
after(async () => {
  await stopServer();
  tts.close();
});

test('the app learns there is a natural voice, and which ones', async () => {
  const u = await newUser();
  assert.equal((await u.call('GET', '/api/bell/status')).body.tts, true);
  const v = await u.call('GET', '/api/bell/voices');
  assert.deepEqual(v.body.voices, ['af_heart', 'bm_george'], 'odd names are dropped');
  assert.equal(v.body.default, 'af_heart');
});

test('Bell speaks through the server as MP3, signed in only', async () => {
  const u = await newUser();
  const res = await fetch(`${BASE}/api/bell/speak?text=${encodeURIComponent('You have 40 g of protein left.')}&voice=bm_george`, { headers: { authorization: `Bearer ${u.token}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /audio\/mpeg/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), MP3);
  assert.deepEqual(heard.at(-1), { model: 'kokoro', input: 'You have 40 g of protein left.', voice: 'bm_george', response_format: 'mp3', speed: 1 } as never);
  assert.equal((await fetch(`${BASE}/api/bell/speak?text=hi`)).status, 401);
  assert.equal((await u.call('GET', '/api/bell/speak?text=')).status, 400);
  assert.equal((await u.call('GET', '/api/bell/speak?text=hi&voice=../../etc')).status, 400);
});
