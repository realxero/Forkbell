import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { todayLocal } from '@forkbell/shared';
import { cachedGet } from '../lib/sync';
import { useViewing } from '../lib/profile';
import { color, radius, space, type } from '../lib/theme';

type Month = { start: string; daysLogged: number; avgKcal: number | null; avgProtein: number | null; weightChangeKg: number | null; workouts: number };
const monthName = (start: string) => {
  const [y, m] = start.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long' });
};

/** This month so far, next to last month. */
export function RecapCard({ unit }: { unit: 'lb' | 'kg' }) {
  const viewing = useViewing();
  const [r, setR] = useState<{ thisMonth: Month; lastMonth: Month } | null>(null);
  useEffect(() => {
    cachedGet<{ thisMonth: Month; lastMonth: Month }>(`/api/progress/recap?today=${todayLocal()}`).then(setR, () => setR(null));
  }, [viewing]);
  if (!r || (!r.thisMonth.daysLogged && !r.lastMonth.daysLogged)) return null;
  const w = (kg: number | null) => (kg === null ? '–' : `${kg > 0 ? '+' : ''}${Math.round((unit === 'lb' ? kg * 2.20462 : kg) * 10) / 10} ${unit}`);
  const rows: [ComponentProps<typeof Ionicons>['name'], string, string, string][] = [
    ['calendar-outline', 'Days logged', String(r.thisMonth.daysLogged), String(r.lastMonth.daysLogged)],
    ['flame-outline', 'Average kcal', r.thisMonth.avgKcal?.toLocaleString() ?? '–', r.lastMonth.avgKcal?.toLocaleString() ?? '–'],
    ['fitness-outline', 'Average protein', r.thisMonth.avgProtein ? `${r.thisMonth.avgProtein} g` : '–', r.lastMonth.avgProtein ? `${r.lastMonth.avgProtein} g` : '–'],
    ['scale-outline', 'Weight change', w(r.thisMonth.weightChangeKg), w(r.lastMonth.weightChangeKg)],
    ['barbell-outline', 'Workouts', String(r.thisMonth.workouts), String(r.lastMonth.workouts)],
  ];
  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), borderWidth: 1, borderColor: color.line }}>
      <Text style={type.title}>Monthly recap</Text>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }} />
        <Text style={[type.label, { width: 92, textAlign: 'right', color: color.accent }]}>{monthName(r.thisMonth.start)}</Text>
        <Text style={[type.label, { width: 92, textAlign: 'right' }]}>{monthName(r.lastMonth.start)}</Text>
      </View>
      {rows.map(([icon, label, a, b]) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <Ionicons name={icon} size={18} color={color.ironSoft} />
          <Text style={[type.body, { flex: 1 }]}>{label}</Text>
          <Text style={[type.body, type.number, { width: 92, textAlign: 'right', fontWeight: '800' }]}>{a}</Text>
          <Text style={[type.body, type.number, { width: 92, textAlign: 'right', color: color.ironSoft }]}>{b}</Text>
        </View>
      ))}
    </View>
  );
}
