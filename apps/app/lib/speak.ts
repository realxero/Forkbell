// Reading Bell's answers out loud. Bell's voice is, in order of preference:
//   1. a natural voice from your own speech server (Kokoro), when the server
//      has TTS_BASE_URL set and you haven't picked a phone voice;
//   2. the best voice this phone or browser has (Premium, then Enhanced),
//      never the robotic or novelty ones;
//   3. whichever voice you picked in Settings → Bell → Bell's voice.
// If the speech server can't be reached, the phone's voice takes over.
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { bestVoice, rankVoices, type VoiceInfo } from '@forkbell/shared';
import { api, authHeaders, getServerUrl } from './api';
import { readCache, writeCache } from './sync';

const isWeb = Platform.OS === 'web';
const KEY = 'device:bell-voice';

/** What you picked: automatic, a voice on this device, or one from the speech server. */
export type VoiceChoice = { kind: 'auto' } | { kind: 'device'; id: string } | { kind: 'server'; id: string };
export const getVoiceChoice = (): VoiceChoice => readCache<VoiceChoice>(KEY) ?? { kind: 'auto' };
export const setVoiceChoice = (c: VoiceChoice) => writeCache(KEY, c);

/** Plain words for speaking: no markdown, links or emoji. */
export function speakable(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const lang = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
};

// ---------------------------------------------------------------------------
// This device's voices

let deviceVoices: Promise<VoiceInfo[]> | null = null;
/** The voices on this phone or in this browser that are worth listening to, best first. */
export function listDeviceVoices(): Promise<VoiceInfo[]> {
  deviceVoices ??= (async () => {
    if (isWeb) {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
      // Chrome fills the list in a moment after the page loads.
      let list = window.speechSynthesis.getVoices();
      if (!list.length)
        list = await new Promise((resolve) => {
          const done = () => resolve(window.speechSynthesis.getVoices());
          window.speechSynthesis.addEventListener?.('voiceschanged', done, { once: true });
          setTimeout(done, 1500);
        });
      return rankVoices(list.map((v) => ({ id: v.voiceURI || v.name, name: v.name, lang: v.lang })), lang());
    }
    const list = await Speech.getAvailableVoicesAsync().catch(() => []);
    return rankVoices(list.map((v) => ({ id: v.identifier, name: v.name, lang: v.language, quality: String(v.quality) })), lang());
  })().then((v) => {
    if (!v.length) deviceVoices = null; // try again next time
    return v;
  });
  return deviceVoices;
}
/** Voices you downloaded in iOS Settings show up after a restart of the app; this asks again sooner. */
export const refreshDeviceVoices = () => {
  deviceVoices = null;
  return listDeviceVoices();
};

async function speakOnDevice(words: string, voiceId?: string) {
  const voices = await listDeviceVoices();
  const id = voiceId && voices.some((v) => v.id === voiceId) ? voiceId : bestVoice(voices, lang())?.id;
  if (isWeb) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(words);
    const v = window.speechSynthesis.getVoices().find((x) => (x.voiceURI || x.name) === id);
    if (v) u.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return;
  }
  Speech.stop();
  Speech.speak(words, id ? { voice: id } : undefined);
}

// ---------------------------------------------------------------------------
// The speech server (Kokoro)

let serverTts: boolean | null = null;
/** Whether your Forkbell server has a speech server, asked once and remembered. */
type ServerVoices = { server: boolean; reachable?: boolean; voices: string[]; default: string | null };
export async function serverVoices(): Promise<ServerVoices> {
  const r = await api<ServerVoices>('/api/bell/voices').catch((): ServerVoices => ({ server: false, voices: [], default: null }));
  serverTts = r.server && r.reachable !== false;
  return r;
}

let player: AudioPlayer | null = null;
let webAudio: HTMLAudioElement | null = null;
let modeSet = false;

/** Plays Bell's words from the speech server. Resolves false if it couldn't, so the phone's voice can step in. */
function speakFromServer(words: string, voice: string | null): Promise<boolean> {
  const base = getServerUrl();
  if (!base) return Promise.resolve(false);
  const url = `${base}/api/bell/speak?text=${encodeURIComponent(words.slice(0, 1500))}${voice ? `&voice=${encodeURIComponent(voice)}` : ''}`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    // The first words should come within a few seconds; if not, don't keep you waiting.
    const timer = setTimeout(() => finish(false), 8000);
    if (isWeb) {
      // Same address as the web app, so the sign-in cookie goes with it.
      const a = new Audio(url);
      webAudio = a;
      a.onplaying = () => finish(true);
      a.onerror = () => finish(false);
      a.play().catch(() => finish(false));
      return;
    }
    if (!modeSet) {
      modeSet = true;
      void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
    const p = createAudioPlayer({ uri: url, headers: authHeaders() });
    player = p;
    p.addListener('playbackStatusUpdate', (st) => {
      if (st.playing) finish(true);
      if (st.didJustFinish) {
        p.remove();
        if (player === p) player = null;
      }
    });
    p.play();
  });
}

// ---------------------------------------------------------------------------

export async function speak(text: string) {
  const words = speakable(text);
  if (!words) return;
  stopSpeaking();
  const choice = getVoiceChoice();
  if (choice.kind === 'device') return speakOnDevice(words, choice.id);
  if (serverTts === null) await serverVoices();
  if (choice.kind === 'server' || serverTts) {
    if (await speakFromServer(words, choice.kind === 'server' ? choice.id : null)) return;
    stopSpeaking();
  }
  return speakOnDevice(words);
}

/** Say a short sample in one voice, for the voice picker. */
export async function previewVoice(choice: VoiceChoice, sample = 'Hey! I’m Bell. Nice work today, you’re 40 grams of protein from your goal.') {
  stopSpeaking();
  if (choice.kind === 'device') return speakOnDevice(sample, choice.id);
  if (choice.kind === 'server') return void (await speakFromServer(sample, choice.id));
  return speak(sample);
}

export function stopSpeaking() {
  if (isWeb) {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    webAudio?.pause();
    webAudio = null;
  } else {
    Speech.stop();
    if (player) {
      player.pause();
      player.remove();
      player = null;
    }
  }
}
