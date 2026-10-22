import { StyleSheet, Text, View } from 'react-native';
import { color, space, type } from '../lib/theme';

/** One macro against its goal. Turns red past the goal; no goal = just the amount. */
export function MacroBar({ label, value, goal, tint }: { label: string; value: number; goal: number | null; tint: string }) {
  const over = goal !== null && value > goal;
  const fill = goal ? Math.min(value / goal, 1) : 0;
  return (
    <View style={{ gap: space(1) }}>
      <View style={s.row}>
        <Text style={[type.body, { fontWeight: '600' }]}>{label}</Text>
        <Text style={[type.body, type.number, over && { color: color.over }]}>
          {Math.round(value)}
          {goal ? <Text style={type.small}> / {Math.round(goal)} g</Text> : <Text style={type.small}> g</Text>}
        </Text>
      </View>
      {goal ? (
        <View style={s.track}>
          <View style={[s.fill, { width: `${fill * 100}%`, backgroundColor: over ? color.over : tint }]} />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 8, borderRadius: 4, backgroundColor: color.line, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
