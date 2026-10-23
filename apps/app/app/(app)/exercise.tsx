import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Exercise, PersonalRecord, SetEntry } from '@forkbell/shared';
import { cachedGet } from '../../lib/sync';
import { api } from '../../lib/api';
import { useUnit } from '../../lib/units';
import { color, space, type } from '../../lib/theme';

type Detail = {
  exercise: Exercise;
  records: PersonalRecord[];
  sessions: { workoutId: string; date: string; name: string; sets: SetEntry[] }[];
  trend: { date: string; e1rmKg: number }[];
};

const LABEL: Record<PersonalRecord['kind'], string> = {
  weight: 'Heaviest',
  e1rm: 'Est. 1-rep max',
  reps: 'Most reps',
  volume: 'Best set',
  time: 'Longest',
};

const shortDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** One exercise: your records, a simple strength trend, and every session. */
export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const units = useUnit();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    cachedGet<Detail>(`/api/exercises/${id}`).then(setD, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const value = (r: PersonalRecord) =>
    r.kind === 'reps'
      ? `${r.value}`
      : r.kind === 'time'
        ? `${r.value} s`
        : r.kind === 'volume'
          ? `${units.show(r.weightKg)} × ${r.reps}`
          : r.kind === 'e1rm'
            ? units.roundLabel(r.value)
            : units.label(r.value);
  const setText = (x: SetEntry) =>
    d?.exercise.kind === 'time' ? `${x.seconds ?? 0} s` : `${x.weightKg ? `${units.show(x.weightKg)}×` : ''}${x.reps ?? 0}${x.warmup ? ' (w)' : ''}`;
  const top = d?.trend.length ? Math.max(...d.trend.map((t) => t.e1rmKg)) : 0;
  const bottom = d?.trend.length ? Math.min(...d.trend.map((t) => t.e1rmKg)) * 0.9 : 0;

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={s.link}>‹ Back</Text>
        </Pressable>
        {error && <Text style={s.error}>{error}</Text>}
        {!d && !error && <ActivityIndicator color={color.iron} />}
        {d && (
          <>
            <Text style={[type.hero, { fontSize: 30 }]}>{d.exercise.name}</Text>
            <Text style={type.small}>
              {d.exercise.muscle.charAt(0).toUpperCase() + d.exercise.muscle.slice(1)} · {d.exercise.equipment}
              {d.exercise.custom ? ' · yours' : ''}
            </Text>

            {d.records.length > 0 ? (
              <View style={s.records}>
                {d.records.map((r) => (
                  <View key={r.kind} style={s.record}>
                    <Text style={[type.title, type.number, { fontSize: 18 }]}>{value(r)}</Text>
                    <Text style={type.small}>{LABEL[r.kind]}</Text>
                    <Text style={[type.small, { fontSize: 11 }]}>{shortDate(r.date)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={type.body}>No finished sets yet. Your records show up here after your first session.</Text>
            )}

            {d.trend.length >= 2 && (
              <View style={s.card}>
                <Text style={type.small}>Estimated 1-rep max, best set each session</Text>
                <View style={s.chart}>
                  {d.trend.slice(-24).map((t, i) => (
                    <View key={i} style={s.barSlot}>
                      <View style={[s.bar, { height: `${Math.max(6, (100 * (t.e1rmKg - bottom)) / (top - bottom || 1))}%` }]} />
                    </View>
                  ))}
                </View>
                <Text style={[type.small, type.number]}>
                  {units.roundLabel(d.trend[0]!.e1rmKg)} → {units.roundLabel(d.trend.at(-1)!.e1rmKg)}
                </Text>
              </View>
            )}

            {d.sessions.length > 0 && <Text style={s.section}>Sessions</Text>}
            {d.sessions.map((sess) => (
              <Pressable key={sess.workoutId} onPress={() => router.push({ pathname: '/workout', params: { id: sess.workoutId } })} style={s.item}>
                <Text style={type.body}>
                  {shortDate(sess.date)} · {sess.name}
                </Text>
                <Text style={[type.small, type.number]}>{sess.sets.map(setText).join(', ')}</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  records: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  record: { backgroundColor: color.card, borderRadius: 12, padding: space(3), minWidth: '30%', flexGrow: 1, gap: 2 },
  card: { backgroundColor: color.card, borderRadius: 12, padding: space(3), gap: space(2) },
  chart: { height: 90, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  barSlot: { flex: 1, maxWidth: 28, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: color.protein, borderRadius: 3 },
  section: { ...type.small, fontWeight: '700', marginTop: space(2) },
  item: { backgroundColor: color.card, borderRadius: 10, padding: space(3), gap: 2 },
});
