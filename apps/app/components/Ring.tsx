import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { color, type } from '../lib/theme';

/** A progress ring. Past 100% it turns red and keeps the full circle. */
export function Ring({
  value,
  goal,
  size,
  stroke,
  tint,
  children,
}: {
  value: number;
  goal: number | null;
  size: number;
  stroke: number;
  tint: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = goal ? Math.min(value / goal, 1) : 0;
  const over = goal !== null && value > goal * 1.02;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.track} strokeWidth={stroke} fill="none" />
        {goal ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={over ? color.over : tint}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - share)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

/** A small ring for one macro, with grams inside and the goal under it. */
export function MacroRing({ label, value, goal, tint }: { label: string; value: number; goal: number | null; tint: string }) {
  const over = goal !== null && value > goal * 1.02;
  return (
    <View style={{ alignItems: 'center', gap: 4, flex: 1 }}>
      <Ring value={value} goal={goal} size={72} stroke={8} tint={tint}>
        <Text style={[type.body, type.number, { fontWeight: '800', color: over ? color.over : color.iron }]}>{Math.round(value)}</Text>
        <Text style={[type.small, { fontSize: 11, marginTop: -2 }]}>g</Text>
      </Ring>
      <Text style={[type.small, { fontWeight: '700', color: color.iron }]}>{label}</Text>
      <Text style={[type.small, { fontSize: 11 }]}>{goal ? `${goal > value ? `${Math.round(goal - value)} left` : over ? `${Math.round(value - goal)} over` : 'done'}` : 'no goal'}</Text>
    </View>
  );
}
