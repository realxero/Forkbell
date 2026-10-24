// The camera page for Form check, at /form/. Runs MediaPipe's pose model in
// the browser (or the app's web view), so video never leaves the phone. The
// result goes back to the app with postMessage.
import { FilesetResolver, PoseLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { analyzeForm, formChecked, formPattern, type Frame } from '../../../packages/shared/src/form.ts';

const params = new URLSearchParams(location.search);
const exercise = params.get('ex') || 'Exercise';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const canvas = $<HTMLCanvasElement>('canvas');
const status = $('status');
const live = $('live');
const result = $('result');
const ctx = canvas.getContext('2d')!;
$('title').textContent = `Form check: ${exercise}`;
if (!formChecked(formPattern(exercise))) $('tip').textContent += ' This exercise gets a rep count; form checks cover squats, hinges, presses, curls and pulls.';

let landmarker: PoseLandmarker | null = null;
let frames: Frame[] = [];
let running = false;
let stream: MediaStream | null = null;
let facing: 'environment' | 'user' = 'environment';
let lastVideoTime = -1;

function send(message: unknown) {
  const w = window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } };
  const text = JSON.stringify(message);
  if (w.ReactNativeWebView) w.ReactNativeWebView.postMessage(text);
  else if (window.parent !== window) window.parent.postMessage(message, location.origin);
}

async function load() {
  try {
    const files = await FilesetResolver.forVisionTasks('/form/wasm');
    const make = (delegate: 'GPU' | 'CPU') =>
      PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/api/media/pose-model', delegate }, runningMode: 'VIDEO', numPoses: 1 });
    // The phone's GPU is fastest; some web views don't allow it, so fall back to the CPU.
    landmarker = await make('GPU').catch(() => make('CPU'));
    status.textContent = 'Ready. Start the camera, or pick a video you recorded.';
  } catch (e) {
    status.textContent = `Couldn’t load the pose model: ${e instanceof Error ? e.message : e}`;
  }
}

function draw(lm: { x: number; y: number }[]) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const d = new DrawingUtils(ctx);
  d.drawConnectors(lm as never, PoseLandmarker.POSE_CONNECTIONS, { color: '#5C9BFF', lineWidth: 4 });
  d.drawLandmarks(lm as never, { color: '#FFFFFF', radius: 3 });
}

function tick() {
  if (!running || !landmarker) return;
  if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const r = landmarker.detectForVideo(video, now);
    const lm = r.landmarks[0];
    if (lm) {
      frames.push({ t: now, lm: lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) });
      draw(lm);
      // A live rep count every half second or so.
      if (frames.length % 15 === 0) live.textContent = `${analyzeForm(frames, exercise).reps} reps`;
    }
  }
  if (video.ended) return finish();
  requestAnimationFrame(tick);
}

function start() {
  frames = [];
  lastVideoTime = -1;
  running = true;
  result.hidden = true;
  live.hidden = false;
  live.textContent = '0 reps';
  $('stop').hidden = false;
  status.textContent = 'Watching… do your set, then tap Finish set.';
  requestAnimationFrame(tick);
}

function finish() {
  if (!running) return;
  running = false;
  live.hidden = true;
  $('stop').hidden = true;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $('flip').hidden = true;
  video.pause();
  const r = analyzeForm(frames, exercise);
  result.hidden = false;
  result.innerHTML = `<div class="big">${r.reps} reps</div>
    <ul>${r.summary.map((s) => `<li class="${/no form flags|\b0 reps/.test(s) ? 'good' : ''}">${s.replace(/</g, '&lt;')}</li>`).join('')}</ul>
    <div class="small" style="margin-top:8px">A guide, not a coach: it sees depth, range, lockout and swinging from the side, not everything.</div>`;
  status.textContent = 'Done. Do another set, or go back to your workout.';
  send({ type: 'forkbell-form', exercise, reps: r.reps, goodReps: r.goodReps, summary: r.summary, pattern: r.pattern });
}

async function camera() {
  if (!landmarker) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    $('flip').hidden = false;
    start();
  } catch (e) {
    status.textContent = `Couldn’t open the camera: ${e instanceof Error ? e.message : e}. You can record with your camera app and choose the video instead.`;
  }
}

$('camera').addEventListener('click', () => void camera());
$('stop').addEventListener('click', finish);
$('flip').addEventListener('click', async () => {
  facing = facing === 'environment' ? 'user' : 'environment';
  running = false;
  stream?.getTracks().forEach((t) => t.stop());
  await camera();
});
$<HTMLInputElement>('file').addEventListener('change', async (ev) => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f || !landmarker) return;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  video.src = URL.createObjectURL(f);
  await video.play().catch(() => {});
  start();
});
void load();
