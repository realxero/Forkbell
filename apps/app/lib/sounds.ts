// Short sounds for the moments that matter: rest is over, workout done.
// Phones play the bundled sounds alongside your music (never pausing it) and
// follow the silent switch; the web makes the same notes with Web Audio.
// Off in Settings → Units and appearance.
import { Platform } from 'react-native';
import { readCache, writeCache } from './sync';

const KEY = 'device:sounds';
export const soundsOn = () => readCache<boolean>(KEY) !== false;
export const setSoundsOn = (on: boolean) => writeCache(KEY, on);

type Name = 'rest' | 'done';
const NOTES: Record<Name, [number, number][]> = {
  rest: [[880, 0.18], [1318.5, 0.45]],
  done: [[523.25, 0.14], [659.25, 0.14], [783.99, 0.14], [1046.5, 0.6]],
};

// Web: browsers only allow sound after you've tapped something, so the first
// tap (ticking a set) wakes the audio up.
let ctx: AudioContext | null = null;
export function unlockAudio() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* no audio here */
  }
}
function webPlay(name: Name) {
  if (!ctx) return;
  let at = ctx.currentTime;
  for (const [freq, dur] of NOTES[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    at += dur * 0.9;
  }
}

// Phones: one player per sound, made the first time it's needed.
let modeSet = false;
const players: Partial<Record<Name, { play: () => void; seekTo: (s: number) => unknown }>> = {};
async function nativePlay(name: Name) {
  const audio = await import('expo-audio');
  if (!modeSet) {
    modeSet = true;
    // Mix with whatever you're listening to; respect the silent switch.
    await audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  }
  const p =
    players[name] ??
    (players[name] = audio.createAudioPlayer(name === 'rest' ? require('../assets/sounds/rest-done.wav') : require('../assets/sounds/workout-done.wav')));
  void p.seekTo(0);
  p.play();
}

export function playSound(name: Name) {
  if (!soundsOn()) return;
  if (Platform.OS === 'web') webPlay(name);
  else void nativePlay(name).catch(() => {});
}
