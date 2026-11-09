// Protein, carbs and fat on Today, drawn the way you like them (Settings →
// Units and appearance): rings, bars, a compact strip, or plates on a bar.
// Every style says the grams and what's left in words, and turns red past the
// goal, so nothing depends on colour alone.
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { readCache, writeCache } from '../lib/sync';
import { color, radius, space, type, textSize } from '../lib/theme';
import { MacroRing, ringScale } from './Ring';

export type MacroStyle = 'rings' | 'bars' | 'strip' | 'plates';
export const MACRO_STYLES: { key: MacroStyle; label: string }[] = [
  { key: 'rings', label: 'Rings' },
  { key: 'bars', label: 'Bars' },
  { key: 'strip', label: 'Compact' },
  { key: 'plates', label: 'Plates' },
];
const KEY = 'device:macro-style';
export const macroStyle = (): MacroStyle => readCache<MacroStyle>(KEY) ?? 'rings';
export const setMacroStyle = (s: MacroStyle) => writeCache(KEY, s);

type Macro = { label: string; value: number; goal: number | null; tint: string };

const over = (m: Macro) => m.goal !== null && m.value > m.goal * 1.02;
const share = (m: Macro) => (m.goal ? Math.min(1, m.value / m.goal) : 0);
const status = (m: Macro) =>
  m.goal ? (m.goal > m.value ? `${Math.round(m.goal - m.value)} left` : over(m) ? `${Math.round(m.value - m.goal)} over` : 'done') : 'no goal';
const spoken = (m: Macro) => `${m.label}: ${Math.round(m.value)} grams, ${m.goal ? `${status(m)} of ${m.goal}` : 'no goal'}`;

export function MacroDisplay({ protein, carbs, fat, goals, style = macroStyle() }: {
  protein: number;
  carbs: number;
  fat: number;
  goals: { protein: number | null; carbs: number | null; fat: number | null };
  style?: MacroStyle;
}) {
  const macros: Macro[] = [
    { label: 'Protein', value: protein, goal: goals.protein, tint: color.protein },
    { label: 'Carbs', value: carbs, goal: goals.carbs, tint: color.carbs },
    { label: 'Fat', value: fat, goal: goals.fat, tint: color.fat },
  ];
  if (style === 'bars') return <Bars macros={macros} />;
  if (style === 'strip') return <Strip macros={macros} />;
  if (style === 'plates') return <Plates macros={macros} />;
  return (
    <View style={s.row}>
      {macros.map((m) => <MacroRing key={m.label} {...m} />)}
    </View>
  );
}

/** One full-width bar per macro, its grams and what's left beside it. */
function Bars({ macros }: { macros: Macro[] }) {
  return (
    <View style={{ gap: space(3) }}>
      {macros.map((m) => (
        <View key={m.label} style={{ gap: space(1) }} accessible accessibilityLabel={spoken(m)}>
          <View style={s.barHead}>
            <Text style={[type.small, s.name]}>{m.label}</Text>
            <Text style={[type.small, type.number, { color: over(m) ? color.over : color.iron, fontWeight: '800' }]}>{Math.round(m.value)} g</Text>
            <Text style={[type.small, type.number, { flex: 1, textAlign: 'right' }]}>{status(m)}</Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${share(m) * 100}%`, backgroundColor: over(m) ? color.over : m.tint }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Three columns in one short row: the least room of any style. */
function Strip({ macros }: { macros: Macro[] }) {
  return (
    <View style={s.row}>
      {macros.map((m) => (
        <View key={m.label} style={{ flex: 1, gap: space(1) }} accessible accessibilityLabel={spoken(m)}>
          <Text style={[type.small, s.name]} numberOfLines={1}>{m.label}</Text>
          <Text style={[type.body, type.number, { fontWeight: '800', color: over(m) ? color.over : color.iron }]} numberOfLines={1}>
            {Math.round(m.value)}<Text style={[type.small, { fontWeight: '400' }]}>{m.goal ? ` / ${m.goal} g` : ' g'}</Text>
          </Text>
          <View style={[s.track, { height: 6 }]}>
            <View style={[s.fill, { height: 6, width: `${share(m) * 100}%`, backgroundColor: over(m) ? color.over : m.tint }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Bumper plates on a bar, one per macro, each growing toward full size as you
 * near its goal: the app's plate colours drawn as the plates they're named for.
 */
function Plates({ macros }: { macros: Macro[] }) {
  const k = ringScale(useWindowDimensions().fontScale);
  const h = 92;
  const plateW = 26;
  return (
    <View style={s.row}>
      {macros.map((m) => {
        const ph = h * (0.28 + 0.72 * share(m));
        return (
          <View key={m.label} style={{ flex: 1, alignItems: 'center', gap: space(1) }} accessible accessibilityLabel={spoken(m)}>
            <Svg width={plateW * 3} height={h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Line x1={0} x2={plateW * 3} y1={h / 2} y2={h / 2} stroke={color.ironSoft} strokeWidth={4} strokeLinecap="round" />
              {/* The full-size outline shows the goal; the solid plate is what you've eaten. */}
              <Rect x={plateW} y={0} width={plateW} height={h} rx={6} fill="none" stroke={color.track} strokeWidth={2} />
              <Rect x={plateW} y={(h - ph) / 2} width={plateW} height={ph} rx={6} fill={over(m) ? color.over : m.tint} />
            </Svg>
            <Text style={[type.body, type.number, { fontWeight: '800', color: over(m) ? color.over : color.iron, fontSize: textSize.body * Math.min(k, 1.2) }]}>
              {Math.round(m.value)}<Text style={[type.small, { fontWeight: '400' }]}> g</Text>
            </Text>
            <Text style={[type.small, s.name]}>{m.label}</Text>
            <Text style={[type.small, { fontSize: textSize.caption }]}>{status(m)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space(3) },
  barHead: { flexDirection: 'row', alignItems: 'baseline', gap: space(2) },
  name: { fontWeight: '700', color: color.iron },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: color.track, overflow: 'hidden' },
  fill: { height: 10, borderRadius: radius.pill },
});
