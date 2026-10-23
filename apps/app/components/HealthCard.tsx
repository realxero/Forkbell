import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Rect } from 'react-native-svg';
import type { ComponentProps } from 'react';
import { HEALTH_INFO, type HealthKind, type HealthMetric, type HealthSource } from '@forkbell/shared';
import { color, radius, space, type } from '../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const ORDER: [HealthKind, IconName, string][] = [
  ['steps', 'footsteps-outline', '#2E9E62'],
  ['active_kcal', 'flame-outline', '#E8590C'],
  ['exercise_min', 'stopwatch-outline', '#2E9E62'],
  ['sleep_min', 'bed-outline', '#6A4BD1'],
  ['distance_m', 'walk-outline', '#0F8B8D'],
  ['flights', 'trending-up-outline', '#D99A00'],
  ['resting_hr', 'heart-outline', '#D2423A'],
  ['hr_avg', 'pulse-outline', '#D2423A'],
  ['hrv_ms', 'analytics-outline', '#C2407E'],
  ['spo2_pct', 'water-outline', '#2B6BD6'],
  ['resp_rate', 'cloud-outline', '#0F8B8D'],
  ['vo2max', 'speedometer-outline', '#2E9E62'],
  ['lean_kg', 'body-outline', '#6A4BD1'],
  ['resting_kcal', 'battery-half-outline', '#5F6B73'],
];

/** Show a value in its everyday unit: sleep in hours, distance in km (or mi), lean mass in your unit. */
export function formatHealth(kind: HealthKind, v: number, unit: 'lb' | 'kg') {
  const info = HEALTH_INFO[kind];
  if (kind === 'sleep_min') return { value: `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`, unit: '' };
  if (kind === 'distance_m') return unit === 'lb' ? { value: (v / 1609.34).toFixed(1), unit: 'mi' } : { value: (v / 1000).toFixed(1), unit: 'km' };
  if (kind === 'lean_kg') return unit === 'lb' ? { value: (v * 2.20462).toFixed(1), unit: 'lb' } : { value: v.toFixed(1), unit: 'kg' };
  return { value: Math.round(v * 10 ** info.digits) / 10 ** info.digits >= 1000 ? Math.round(v).toLocaleString() : (Math.round(v * 10 ** info.digits) / 10 ** info.digits).toString(), unit: info.unit };
}

function Spark({ series, tint }: { series: (number | null)[]; tint: string }) {
  const vals = series.slice(-14);
  const max = Math.max(...vals.map((v) => v ?? 0), 1);
  const w = 6;
  const gap = 2;
  return (
    <Svg width={vals.length * (w + gap)} height={28}>
      {vals.map((v, i) => (
        <Rect key={i} x={i * (w + gap)} y={v ? 28 - Math.max(2, (v / max) * 28) : 26} width={w} height={v ? Math.max(2, (v / max) * 28) : 2} rx={2} fill={v ? tint : color.track} opacity={i === vals.length - 1 ? 1 : 0.6} />
      ))}
    </Svg>
  );
}

/** Everything synced from Apple Health or Health Connect, as tiles with a two-week spark chart. */
export function HealthCard({ metrics, source, unit, today }: { metrics: HealthMetric[]; source: HealthSource; unit: 'lb' | 'kg'; today: string }) {
  const [all, setAll] = useState(false);
  const shown = ORDER.filter(([k]) => metrics.some((m) => m.kind === k));
  const list = all ? shown : shown.slice(0, 6);
  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), borderWidth: 1, borderColor: color.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={type.title}>Health</Text>
        <Text style={type.small}>from {source === 'apple_health' ? 'Apple Health' : 'Health Connect'}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        {list.map(([kind, icon, tint]) => {
          const m = metrics.find((x) => x.kind === kind)!;
          const now = m.latest !== null ? formatHealth(kind, m.latest, unit) : null;
          const avg = m.avg7 !== null ? formatHealth(kind, m.avg7, unit) : null;
          const stale = m.latestDate && m.latestDate !== today;
          return (
            <View key={kind} style={{ width: '47%', flexGrow: 1, backgroundColor: color.raised, borderRadius: 14, padding: space(3), gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={icon} size={16} color={tint} />
                <Text style={[type.small, { fontWeight: '700', color: color.iron, flexShrink: 1 }]} numberOfLines={1}>{HEALTH_INFO[kind].label}</Text>
              </View>
              <Text style={[type.number, { fontSize: 22, fontWeight: '800', color: color.iron }]}>
                {now ? now.value : '–'} <Text style={type.small}>{now?.unit}</Text>
              </Text>
              <Spark series={m.series} tint={tint} />
              <Text style={[type.small, { fontSize: 11 }]}>
                {stale ? `${m.latestDate!.slice(5).replace('-', '/')} · ` : ''}
                {avg ? `7-day avg ${avg.value}${avg.unit ? ` ${avg.unit}` : ''}` : ''}
              </Text>
            </View>
          );
        })}
      </View>
      {shown.length > 6 && (
        <Pressable onPress={() => setAll(!all)} style={{ alignSelf: 'center' }}>
          <Text style={{ color: color.accent, fontWeight: '700' }}>{all ? 'Show less' : `Show all ${shown.length}`}</Text>
        </Pressable>
      )}
      <Text style={type.small}>Your daily burn on this tab comes from your own logs and weight, so it already reflects this activity.</Text>
    </View>
  );
}
