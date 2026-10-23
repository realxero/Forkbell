// Forkbell's colours, in a light and a dark version. Gym chalk and iron, with
// macros in competition bumper-plate colours (20 kg blue, 15 kg yellow,
// 10 kg green, 25 kg red for "over").
//
// On the web every colour is a CSS variable, so switching light/dark is
// instant and follows the system setting (see ThemeStyle). On phones the
// palette is fixed when the app's code loads, because every screen's styles
// are built from it then. So the choice is kept in the iPhone's own settings
// store, which can be read instantly at that moment, and changing it reloads
// the app's screens (a second, with no sign-in or data lost).
import { Appearance, Platform, Settings } from 'react-native';

const light = {
  chalk: '#F4F5F2',
  card: '#FFFFFF',
  raised: '#EEF0EC',
  iron: '#1C252B',
  ironSoft: '#5F6B73',
  line: '#DDE2E4',
  protein: '#2B6BD6',
  carbs: '#D99A00',
  fat: '#2E9E62',
  over: '#D2423A',
  accent: '#2B6BD6',
  onAccent: '#FFFFFF',
  placeholder: '#A3ACB1',
  successBg: '#E5F4EC',
  infoBg: '#EAF1FC',
  warnBg: '#FFF4D6',
  warnText: '#8A5A00',
  dangerBg: '#FDECEA',
  restFill: '#2F4350',
  track: '#E6E9EA',
} as const;

const dark: Record<keyof typeof light, string> = {
  chalk: '#0E1215',
  card: '#171C20',
  raised: '#1F252A',
  iron: '#E9EDEF',
  ironSoft: '#9BA7AE',
  line: '#283036',
  protein: '#5C9BFF',
  carbs: '#F2C14E',
  fat: '#4CC38A',
  over: '#FF6B61',
  accent: '#5C9BFF',
  onAccent: '#0E1215',
  placeholder: '#5E6A71',
  successBg: '#13281D',
  infoBg: '#152238',
  warnBg: '#30260C',
  warnText: '#F2C14E',
  dangerBg: '#3A1A18',
  restFill: '#33505F',
  track: '#262D32',
};

export type ColorName = keyof typeof light;
export type SchemeChoice = 'system' | 'light' | 'dark';
const isWeb = Platform.OS === 'web';

const isIos = Platform.OS === 'ios';
/** The phone's saved look. Only iPhone has an instant store; elsewhere, follow the system. */
const savedNative = <T,>(key: string): T | null => (isIos ? ((Settings.get(key) as T | undefined) ?? null) : null);
const systemScheme = () => (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
export const nativeChoice: SchemeChoice = savedNative<SchemeChoice>('fb.theme') ?? 'system';
const nativeAccent = savedNative<string>('fb.accent');
/** The scheme the phone's colours were built with, at start-up. */
export const nativeScheme: 'light' | 'dark' = nativeChoice === 'system' ? systemScheme() : nativeChoice;
/** Kept for older callers: phones now read their choice at start-up by themselves. */
export function applyNativeScheme(_choice: SchemeChoice) {}

export const color = Object.fromEntries(
  (Object.keys(light) as ColorName[]).map((k) => [k, isWeb ? `var(--fb-${k})` : (nativeScheme === 'dark' ? dark : light)[k]]),
) as Record<ColorName, string>;

/** CSS for the web: light by default, dark when the system says so, or forced by the setting. */
export function themeCss() {
  const vars = (p: Record<string, string>) => Object.entries(p).map(([k, v]) => `--fb-${k}:${v};`).join('');
  return [
    `:root{${vars(light)}color-scheme:light}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars(dark)}color-scheme:dark}}`,
    `:root[data-theme="dark"]{${vars(dark)}color-scheme:dark}`,
    `:root[data-theme="light"]{${vars(light)}color-scheme:light}`,
    'html,body{background:var(--fb-chalk)}',
  ].join('\n');
}

export function setWebScheme(choice: SchemeChoice) {
  if (!isWeb) return;
  if (choice === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
}

/** Whether dark colours are showing right now (for the status bar). */
export function isDark(choice: SchemeChoice) {
  if (choice === 'dark') return true;
  if (choice === 'light') return false;
  return isWeb ? window.matchMedia?.('(prefers-color-scheme: dark)').matches === true : nativeScheme === 'dark';
}

/** Accent colours you can pick in Settings, each with a light and a dark version. */
export const ACCENTS = {
  blue: { label: 'Blue', light: '#2B6BD6', dark: '#5C9BFF' },
  teal: { label: 'Teal', light: '#0F8B8D', dark: '#3CC9C4' },
  green: { label: 'Green', light: '#2E8B57', dark: '#4CC38A' },
  orange: { label: 'Orange', light: '#D9661F', dark: '#FF9A52' },
  red: { label: 'Red', light: '#C8382E', dark: '#FF6B61' },
  pink: { label: 'Pink', light: '#C2407E', dark: '#FF7AB6' },
  purple: { label: 'Purple', light: '#6A4BD1', dark: '#A48BFF' },
} as const;
export type AccentName = keyof typeof ACCENTS;

// Phones: the picked accent, in the version for this scheme.
if (!isWeb && nativeAccent && nativeAccent in ACCENTS) color.accent = ACCENTS[nativeAccent as AccentName][nativeScheme];

/** Can this phone save a look and switch to it? (iPhone yes; Android follows the system.) */
export const nativeThemeSupported = isIos;
/** Whether a look has ever been saved in the instant store. */
export const nativeThemeSaved = () => savedNative<string>('fb.theme') !== null || nativeAccent !== null;

/**
 * Save the phone's look and reload the app's screens so every colour updates.
 * Returns false when nothing changed (no reload needed).
 */
export async function setNativeTheme(next: { scheme?: SchemeChoice; accent?: AccentName }) {
  if (!isIos) return false;
  const changes: Record<string, string> = {};
  if (next.scheme && next.scheme !== nativeChoice) changes['fb.theme'] = next.scheme;
  if (next.accent && next.accent !== (nativeAccent ?? 'blue')) changes['fb.accent'] = next.accent;
  if (!Object.keys(changes).length) {
    // Nothing visible changes, but remember that a look was chosen.
    if (next.scheme && savedNative<string>('fb.theme') === null) Settings.set({ 'fb.theme': next.scheme });
    return false;
  }
  Settings.set(changes);
  // Only reload if it really saved, or the reload would bring back the old look (and could repeat).
  if (Object.entries(changes).some(([k, v]) => Settings.get(k) !== v)) return false;
  const { reloadAppAsync } = await import('expo');
  await reloadAppAsync('Forkbell look changed');
  return true;
}

/** True when the system switched light/dark since start-up and the phone follows the system. */
export function nativeSchemeOutdated() {
  return !isWeb && nativeChoice === 'system' && systemScheme() !== nativeScheme;
}

/** Catch up with a system light/dark switch (call when the app comes back to the front). */
export async function followSystemScheme() {
  if (!nativeSchemeOutdated()) return;
  const { reloadAppAsync } = await import('expo');
  await reloadAppAsync('System appearance changed');
}

/** Apply an accent on the web, for light and dark. */
export function setWebAccent(name: AccentName) {
  if (!isWeb) return;
  const a = ACCENTS[name] ?? ACCENTS.blue;
  let el = document.getElementById('fb-accent');
  if (!el) {
    el = document.createElement('style');
    el.id = 'fb-accent';
    document.head.appendChild(el);
  }
  // html:root beats the base theme's :root rules wherever they sit in the page.
  el.textContent = [
    `html:root{--fb-accent:${a.light}}`,
    `@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){--fb-accent:${a.dark}}}`,
    `html:root[data-theme="dark"]{--fb-accent:${a.dark}}`,
    `html:root[data-theme="light"]{--fb-accent:${a.light}}`,
  ].join('\n');
}

export const space = (n: number) => n * 4;

export const radius = { card: 18, row: 12, pill: 999 };

export const type = {
  // Tabular figures keep columns of numbers from jittering as they change.
  number: { fontVariant: ['tabular-nums' as const] },
  hero: { fontSize: 44, fontWeight: '800' as const, letterSpacing: -1, color: color.iron },
  title: { fontSize: 20, fontWeight: '700' as const, color: color.iron },
  body: { fontSize: 16, color: color.iron },
  small: { fontSize: 13, color: color.ironSoft },
  label: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: color.ironSoft },
};
