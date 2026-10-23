import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TrendPoint } from '@forkbell/shared';
import { daysBetween } from '@forkbell/shared';
import { color, space, type } from '../lib/theme';

/**
 * Weigh-ins as dots, the trend as a line, and the goal as a dashed line.
 * Drawn with plain views so it needs no chart library and looks the same on
 * phones and the web.
 */
export function WeightChart({ points, goalKg, show }: { points: TrendPoint[]; goalKg: number | null; show: (kg: number) => string }) {
  const [width, setWidth] = useState(0);
  const height = 180;
  if (points.length < 2) return <Text style={type.small}>Weigh in a few more times to see the chart.</Text>;

  const first = points[0]!.date;
  const span = Math.max(1, daysBetween(first, points.at(-1)!.date));
  const values = points.flatMap((p) => [p.weightKg, p.trendKg]);
  // Show the goal only when it's near enough not to squash the line flat.
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const showGoal = goalKg !== null && goalKg > lo0 - (hi0 - lo0) && goalKg < hi0 + (hi0 - lo0);
  const lo = Math.min(lo0, showGoal ? goalKg! : lo0);
  const hi = Math.max(hi0, showGoal ? goalKg! : hi0);
  const pad = Math.max(0.5, (hi - lo) * 0.1);
  const yMin = lo - pad;
  const yMax = hi + pad;
  const x = (date: string) => (daysBetween(first, date) / span) * (width - 8) + 4;
  const y = (kg: number) => height - ((kg - yMin) / (yMax - yMin)) * height;

  const segments = points.slice(1).map((p, i) => {
    const a = points[i]!;
    const x1 = x(a.date), y1 = y(a.trendKg), x2 = x(p.date), y2 = y(p.trendKg);
    const len = Math.hypot(x2 - x1, y2 - y1);
    return { key: p.date, left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - 1.5, width: len, angle: Math.atan2(y2 - y1, x2 - x1) };
  });

  return (
    <View>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <>
            {showGoal && <View style={[s.goal, { top: y(goalKg!) }]} />}
            {points.map((p) => (
              <View key={p.date} style={[s.dot, { left: x(p.date) - 3, top: y(p.weightKg) - 3 }]} />
            ))}
            {segments.map((g) => (
              <View key={g.key} style={[s.line, { left: g.left, top: g.top, width: g.width, transform: [{ rotate: `${g.angle}rad` }] }]} />
            ))}
          </>
        )}
      </View>
      <View style={s.legend}>
        <Text style={type.small}>● weigh-ins</Text>
        <Text style={[type.small, { color: color.protein }]}>— trend</Text>
        {showGoal && <Text style={[type.small, { color: color.fat }]}>- - goal {show(goalKg!)}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#A3ACB1' },
  line: { position: 'absolute', height: 3, borderRadius: 1.5, backgroundColor: color.protein },
  goal: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: color.fat },
  legend: { flexDirection: 'row', gap: space(4), marginTop: space(2) },
});
