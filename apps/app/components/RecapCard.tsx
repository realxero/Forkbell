import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { todayLocal } from '@forkbell/shared';
import { cachedGet } from '../lib/sync';
import { useViewing } from '../lib/profile';
import { color, radius, space, type, textSize } from '../lib/theme';

type Month = { start: string; daysLogged: number; avgKcal: number | null; avgProtein: number | null; weightChangeKg: number | null; workouts: number };
const monthName = (start: string) => {
  const [y, m] = start.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
};

export type Recap = { thisMonth: Month; lastMonth: Month };

/** This month so far and last month, or null when neither has anything logged. */
export function useRecap() {
  const viewing = useViewing();
  const [r, setR] = useState<Recap | null>(null);
  useEffect(() => {
    cachedGet<Recap>(`/api/progress/recap?today=${todayLocal()}`).then(setR, () => setR(null));
  }, [viewing]);
  return r && (r.thisMonth.daysLogged || r.lastMonth.daysLogged) ? r : null;
}

/** This month so far, next to last month, as rows (no card of its own). */
export function RecapTable({ r, unit }: { r: Recap; unit: 'lb' | 'kg' }) {
  const w = (kg: number | null) => (kg === null ? '–' : `${kg > 0 ? '+' : ''}${Math.round((unit === 'lb' ? kg * 2.20462 : kg) * 10) / 10} ${unit}`);
  const rows: [ComponentProps<typeof Ionicons>['name'], string, string, string][] = [
    ['calendar-outline', 'Days logged', String(r.thisMonth.daysLogged), String(r.lastMonth.daysLogged)],
    ['flame-outline', 'Average kcal', r.thisMonth.avgKcal?.toLocaleString() ?? '–', r.lastMonth.avgKcal?.toLocaleString() ?? '–'],
    ['fitness-outline', 'Average protein', r.thisMonth.avgProtein ? `${r.thisMonth.avgProtein} g` : '–', r.lastMonth.avgProtein ? `${r.lastMonth.avgProtein} g` : '–'],
    ['scale-outline', 'Weight change', w(r.thisMonth.weightChangeKg), w(r.lastMonth.weightChangeKg)],
    ['barbell-outline', 'Workouts', String(r.thisMonth.workouts), String(r.lastMonth.workouts)],
  ];
  return (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <View style={{ flex: 1 }} />
        <View style={{ width: 84, alignItems: 'flex-end' }}>
          <Text style={[s.month, { color: color.chalk, backgroundColor: color.iron }]}>{monthName(r.thisMonth.start)}</Text>
        </View>
        <View style={{ width: 84, alignItems: 'flex-end' }}>
          <Text style={[s.month, { color: color.ironSoft, backgroundColor: color.raised }]}>{monthName(r.lastMonth.start)}</Text>
        </View>
      </View>
      {rows.map(([icon, label, a, b]) => (
        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }} accessible accessibilityLabel={`${label}: ${a} this month, ${b} last month`}>
          <Ionicons name={icon} size={18} color={color.ironSoft} />
          <Text style={[type.body, { flex: 1 }]}>{label}</Text>
          <Text style={[type.body, type.number, { width: 84, textAlign: 'right', fontWeight: '800' }]}>{a}</Text>
          <Text style={[type.body, type.number, { width: 84, textAlign: 'right', color: color.ironSoft }]}>{b}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  month: { fontSize: textSize.label, fontWeight: '800', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
});
