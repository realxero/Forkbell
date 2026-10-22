// Forkbell palette: gym chalk and iron, with macros in competition bumper-plate
// colours (20 kg blue, 15 kg yellow, 10 kg green, 25 kg red for "over").
export const color = {
  chalk: '#F6F7F4',
  card: '#FFFFFF',
  iron: '#1E2A32',
  ironSoft: '#5B6870',
  line: '#DCE1E3',
  protein: '#1F5FBF',
  carbs: '#E8B10C',
  fat: '#2E8B57',
  over: '#C8362E',
} as const;

export const space = (n: number) => n * 4;

export const type = {
  // Tabular figures keep columns of numbers from jittering as they change.
  number: { fontVariant: ['tabular-nums' as const] },
  hero: { fontSize: 44, fontWeight: '800' as const, letterSpacing: -1, color: color.iron },
  title: { fontSize: 20, fontWeight: '700' as const, color: color.iron },
  body: { fontSize: 16, color: color.iron },
  small: { fontSize: 13, color: color.ironSoft },
};
