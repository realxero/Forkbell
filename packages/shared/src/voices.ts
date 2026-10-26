// Picking Bell's voice: the best one the phone or browser has, never the
// robotic or novelty ones, or a natural voice from your own server (Kokoro).

export interface VoiceInfo {
  id: string;
  name: string;
  /** BCP 47, e.g. en-US */
  lang: string;
  /** what the platform says about it: expo-speech gives Default or Enhanced */
  quality?: string;
}

/** macOS/iOS novelty voices and old formant synths: fun once, tiring to listen to. */
const ROBOTIC = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|princess|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i;

/** Higher is better. Below zero: don't pick it automatically. */
export function voiceScore(v: VoiceInfo, lang = 'en-US'): number {
  const id = v.id.toLowerCase();
  const name = v.name.toLowerCase();
  if (ROBOTIC.test(v.name) || id.includes('eloquence') || id.includes('speech.synthesis.voice') || id.includes('novelty')) return -10;
  const l = v.lang.replace('_', '-').toLowerCase();
  const want = lang.toLowerCase();
  let s = 0;
  if (l === want) s += 20;
  else if (l.split('-')[0] === want.split('-')[0]) s += 12;
  else return -5; // another language entirely
  // iOS: premium > enhanced > compact. Browsers: "Natural"/"Neural" voices, then Google's and Siri's.
  if (id.includes('.premium.') || /premium/.test(name)) s += 12;
  else if (id.includes('.enhanced.') || v.quality === 'Enhanced' || /enhanced/.test(name)) s += 8;
  if (/natural|neural/.test(name)) s += 11;
  if (/siri/.test(name)) s += 6;
  if (/^google /.test(name)) s += 5;
  if (id.includes('.compact.')) s -= 2;
  // Android network voices are the good ones.
  if (/-network$|#network/.test(id)) s += 6;
  if (/-local$|#local/.test(id)) s += 1;
  return s;
}

/** Voices worth listing, best first; robotic and other-language ones left out. */
export function rankVoices(voices: VoiceInfo[], lang = 'en-US'): VoiceInfo[] {
  const seen = new Set<string>();
  return voices
    .map((v) => ({ v, s: voiceScore(v, lang) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.v.name.localeCompare(b.v.name))
    .map((x) => x.v)
    .filter((v) => !seen.has(v.id) && seen.add(v.id));
}

export function bestVoice(voices: VoiceInfo[], lang = 'en-US'): VoiceInfo | null {
  return rankVoices(voices, lang)[0] ?? null;
}

/** A plain label for a voice from the list: "Ava (Premium)". */
export function voiceLabel(v: VoiceInfo) {
  const id = v.id.toLowerCase();
  const tier = id.includes('.premium.') ? 'Premium' : id.includes('.enhanced.') || v.quality === 'Enhanced' ? 'Enhanced' : null;
  const name = v.name.replace(/\s*\((premium|enhanced)\)\s*/i, '').trim();
  return `${name}${tier ? ` (${tier})` : ''}`;
}

/** Kokoro's voices: the first letters say the accent (a: American, b: British) and voice (f/m). */
export function kokoroLabel(id: string) {
  const m = /^([ab])([fm])_(\w+)$/.exec(id);
  if (!m) return id;
  const name = m[3]!.charAt(0).toUpperCase() + m[3]!.slice(1);
  return `${name} (${m[1] === 'a' ? 'American' : 'British'}, ${m[2] === 'f' ? 'female' : 'male'})`;
}
/** Shown when the server can't list its voices; these come with Kokoro. */
export const KOKORO_VOICES = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'am_michael', 'am_adam', 'am_fenrir', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis'];
export const KOKORO_DEFAULT = 'af_heart';
export const TTS_VOICE = /^[a-z0-9_.+()-]{1,60}$/i;
