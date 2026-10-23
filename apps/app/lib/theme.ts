// Forkbell's colours, in a light and a dark version. Gym chalk and iron, with
// macros in competition bumper-plate colours (20 kg blue, 15 kg yellow,
// 10 kg green, 25 kg red for "over").
//
// On the web every colour is a CSS variable, so switching light/dark is
// instant and follows the system setting (see ThemeStyle). On phones the
// palette is picked when the app starts.
import { Appearance, Platform } from 'react-native';

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

/** The saved choice, read once at start-up on phones (web switches live). */
let nativeScheme: 'light' | 'dark' = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
export function applyNativeScheme(choice: SchemeChoice) {
  nativeScheme = choice === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : choice;
}

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

/** Apply an accent on the web, for light and dark. (Phones use the default for now.) */
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
