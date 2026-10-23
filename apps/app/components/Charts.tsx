// Charts for the Progress tab, drawn with SVG so they look the same on phones
// and on the web, and follow light and dark mode.
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { daysBetween, type TrendPoint } from '@forkbell/shared';
import { color, space, type } from '../lib/theme';

// SVG text uses a serif font on the web unless told otherwise.
const font = Platform.OS === 'web' ? { fontFamily: 'system-ui, -apple-system, sans-serif' } : {};

const shortDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Measures its own width, so charts fill the card on any screen. */
function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: { nativeEvent: { layout: { width: number } } }) => setW(e.nativeEvent.layout.width)] as const;
}

/** Weigh-ins as dots, the smoothed trend as a filled line, the goal dashed. */
export function WeightChart({ points, goalKg, show }: { points: TrendPoint[]; goalKg: number | null; show: (kg: number) => string }) {
  const [width, onLayout] = useWidth();
  const height = 190;
  const padL = 44;
  const padB = 22;
  if (points.length < 2) return <Text style={type.small}>Weigh in a few more times to see the chart.</Text>;

  const first = points[0]!.date;
  const span = Math.max(1, daysBetween(first, points.at(-1)!.date));
  const values = points.flatMap((p) => [p.weightKg, p.trendKg]);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const showGoal = goalKg !== null && goalKg > lo - (hi - lo) && goalKg < hi + (hi - lo);
  if (showGoal) {
    lo = Math.min(lo, goalKg!);
    hi = Math.max(hi, goalKg!);
  }
  const pad = Math.max(0.5, (hi - lo) * 0.12);
  lo -= pad;
  hi += pad;
  const plotW = Math.max(1, width - padL - 6);
  const plotH = height - padB - 6;
  const x = (date: string) => padL + (daysBetween(first, date) / span) * plotW;
  const y = (kg: number) => 6 + (1 - (kg - lo) / (hi - lo)) * plotH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.trendKg).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.at(-1)!.date).toFixed(1)},${6 + plotH} L${padL},${6 + plotH} Z`;
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color.accent} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {ticks.map((t) => (
            <Line key={t} x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke={color.line} strokeWidth={1} />
          ))}
          {ticks.map((t) => (
            <SvgText {...font} key={`l${t}`} x={padL - 6} y={y(t) + 4} fontSize={11} fill={color.ironSoft} textAnchor="end">{show(t)}</SvgText>
          ))}
          <Path d={area} fill="url(#trendFill)" />
          {showGoal && <Line x1={padL} x2={width} y1={y(goalKg!)} y2={y(goalKg!)} stroke={color.fat} strokeWidth={2} strokeDasharray="6 5" />}
          {points.map((p) => (
            <Circle key={p.date} cx={x(p.date)} cy={y(p.weightKg)} r={2.6} fill={color.ironSoft} opacity={0.55} />
          ))}
          <Path d={line} stroke={color.accent} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={x(points.at(-1)!.date)} cy={y(points.at(-1)!.trendKg)} r={5} fill={color.accent} stroke={color.card} strokeWidth={2} />
          <SvgText {...font} x={padL} y={height - 4} fontSize={11} fill={color.ironSoft}>{shortDate(first)}</SvgText>
          <SvgText {...font} x={width - 2} y={height - 4} fontSize={11} fill={color.ironSoft} textAnchor="end">{shortDate(points.at(-1)!.date)}</SvgText>
        </Svg>
      )}
      <View style={{ flexDirection: 'row', gap: space(4), marginTop: space(2) }}>
        <Text style={type.small}>● weigh-ins</Text>
        <Text style={[type.small, { color: color.accent }]}>━ trend</Text>
        {showGoal && <Text style={[type.small, { color: color.fat }]}>┅ goal {show(goalKg!)}</Text>}
      </View>
    </View>
  );
}

export type DayTotals = { date: string; kcal: number; protein: number; carbs: number; fat: number; goal: number | null };

/** Calories each day against the goal: over in red, today lighter while it's still going. */
export function CalorieBars({ days, today }: { days: DayTotals[]; today: string }) {
  const [width, onLayout] = useWidth();
  const height = 150;
  const padB = 20;
  const top = Math.max(...days.map((d) => Math.max(d.kcal, d.goal ?? 0)), 500) * 1.1;
  const bw = width / days.length;
  const y = (v: number) => (height - padB) * (1 - v / top);
  const logged = days.filter((d) => d.kcal > 0 && d.date !== today);
  const avg = logged.length ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length) : null;
  const within = logged.filter((d) => d.goal && d.kcal <= d.goal * 1.05).length;
  return (
    <View onLayout={onLayout} style={{ gap: space(2) }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {days.map((d, i) => {
            const over = d.goal !== null && d.kcal > d.goal * 1.05;
            const h = (height - padB) - y(d.kcal);
            return (
              <Rect
                key={d.date}
                x={i * bw + bw * 0.18}
                y={y(d.kcal)}
                width={bw * 0.64}
                height={Math.max(d.kcal > 0 ? 2 : 0, h)}
                rx={Math.min(4, bw * 0.3)}
                fill={over ? color.over : color.accent}
                opacity={d.date === today ? 0.45 : 0.9}
              />
            );
          })}
          {days.map((d, i) => (d.goal ? <Line key={`g${d.date}`} x1={i * bw + 1} x2={(i + 1) * bw - 1} y1={y(d.goal)} y2={y(d.goal)} stroke={color.fat} strokeWidth={2} /> : null))}
          {days.map((d, i) =>
            i % 7 === 0 || i === days.length - 1 ? (
              <SvgText {...font} key={`t${d.date}`} x={i * bw + bw / 2} y={height - 4} fontSize={10} fill={color.ironSoft} textAnchor="middle">{shortDate(d.date)}</SvgText>
            ) : null,
          )}
        </Svg>
      )}
      <Text style={type.small}>
        {avg ? `Average ${avg.toLocaleString()} kcal on ${logged.length} logged days` : 'Log a few days to see your pattern'}
        {avg && logged.some((d) => d.goal) ? ` · within your goal on ${within} of them` : ''}. Green marks are the goal.
      </Text>
    </View>
  );
}

/** Where calories came from over the last week: protein, carbs and fat. */
export function MacroDonut({ days }: { days: DayTotals[] }) {
  const logged = days.filter((d) => d.kcal > 0);
  const p = logged.reduce((s, d) => s + d.protein * 4, 0);
  const c = logged.reduce((s, d) => s + d.carbs * 4, 0);
  const f = logged.reduce((s, d) => s + d.fat * 9, 0);
  const total = p + c + f;
  if (!total) return <Text style={type.small}>Log some food to see where your calories come from.</Text>;
  const size = 120;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const parts = [
    { label: 'Protein', share: p / total, tint: color.protein, grams: Math.round(logged.reduce((s, d) => s + d.protein, 0) / logged.length) },
    { label: 'Carbs', share: c / total, tint: color.carbs, grams: Math.round(logged.reduce((s, d) => s + d.carbs, 0) / logged.length) },
    { label: 'Fat', share: f / total, tint: color.fat, grams: Math.round(logged.reduce((s, d) => s + d.fat, 0) / logged.length) },
  ];
  let offset = 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(5) }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.track} strokeWidth={stroke} fill="none" />
        {parts.map((x) => {
          const len = circ * x.share;
          const el = (
            <Circle
              key={x.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={x.tint}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${Math.max(0, len - 2)} ${circ}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
      </Svg>
      <View style={{ gap: space(2), flex: 1 }}>
        {parts.map((x) => (
          <View key={x.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: x.tint }} />
            <Text style={[type.body, { flex: 1 }]}>{x.label}</Text>
            <Text style={[type.body, type.number, { fontWeight: '700' }]}>{Math.round(x.share * 100)}%</Text>
            <Text style={[type.small, type.number, { width: 56, textAlign: 'right' }]}>{x.grams} g/day</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Four weeks of squares: filled on days you logged food. */
export function LogCalendar({ days, today }: { days: DayTotals[]; today: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {days.map((d) => (
        <View
          key={d.date}
          accessibilityLabel={`${shortDate(d.date)}: ${d.kcal ? 'logged' : 'not logged'}`}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: d.kcal > 0 ? (d.goal && d.kcal > d.goal * 1.05 ? color.over : color.fat) : color.track,
            opacity: d.kcal > 0 ? 0.9 : 1,
            borderWidth: d.date === today ? 2 : 0,
            borderColor: color.iron,
          }}
        />
      ))}
    </View>
  );
}
