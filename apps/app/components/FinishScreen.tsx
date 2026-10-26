import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { todayLocal, volumeComparison, weekStart, type PersonalRecord, type Program, type Workout, type WorkoutSummary } from '@forkbell/shared';
import type { FinishSummary } from '../lib/actions';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDuration, useUnit } from '../lib/units';
import { BellAvatar } from './BellAvatar';
import { Confetti } from './Confetti';
import { color, radius, space, type } from '../lib/theme';

const RECORD_NAMES: Record<PersonalRecord['kind'], string> = {
  weight: 'Heaviest weight',
  e1rm: 'Best estimated 1-rep max',
  reps: 'Most reps',
  volume: 'Best set (weight × reps)',
  time: 'Longest time',
};
const CHEERS = {
  buddy: ['That’s a wrap. Nice work!', 'Done and dusted. Proud of you.', 'Another one in the books!'],
  coach: ['Session complete. Good work.', 'Done. Recover well.', 'Logged. On to the next one.'],
  hype: ['LET’S GO! Workout crushed!', 'You showed up and delivered!', 'Beast mode: complete!'],
  calm: ['Well done. Take a breath.', 'Nicely done. Time to recover.', 'Good session. Rest well.'],
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * After Finish: congratulations from Bell, the numbers, any new records, the
 * muscles you worked, how it compares with last time, your week so far, what's
 * next, and a guided cool-down for what you trained.
 */
export function FinishScreen({ w, summary }: { w: Workout; summary: FinishSummary }) {
  const units = useUnit();
  const { me } = useAuth();
  const [last, setLast] = useState<WorkoutSummary | null>(null);
  const [weekCount, setWeekCount] = useState<number | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [nextUp, setNextUp] = useState<string | null>(null);
  const style = me?.preferences.bell?.style ?? 'buddy';
  const cheer = useMemo(() => CHEERS[style][Math.floor(Math.random() * 3)]!, [style]);

  const done = w.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done && !s.warmup) })).filter((e) => e.sets.length);
  const reps = done.reduce((t, e) => t + e.sets.reduce((u, s) => u + (s.reps ?? 0), 0), 0);
  const muscles = Object.entries(done.reduce<Record<string, number>>((m, e) => ({ ...m, [e.exercise.muscle]: (m[e.exercise.muscle] ?? 0) + e.sets.length }), {})).sort((a, b) => b[1] - a[1]);
  const coolMuscles = muscles.map(([m]) => m).filter((m) => m !== 'full body').slice(0, 5);

  useEffect(() => {
    // The same workout last time, your week so far, and what's next in your program.
    api<{ workouts: WorkoutSummary[] }>('/api/workouts?limit=30').then(
      (r) => {
        const finished = r.workouts.filter((x) => x.finishedAt && x.id !== w.id);
        // Only compare like with like: the same routine by name (not the generic "Workout").
        setLast(w.name !== 'Workout' ? (finished.find((x) => x.name === w.name) ?? null) : null);
        const start = weekStart(todayLocal());
        setWeekCount(r.workouts.filter((x) => x.finishedAt && x.date >= start).length);
      },
      () => {},
    );
    api<{ goal: { weeklyWorkoutGoal: number } }>(`/api/progress?today=${todayLocal()}`).then((p) => setGoal(p.goal.weeklyWorkoutGoal), () => {});
    api<{ programs: Program[] }>('/api/programs').then(
      (r) => {
        const p = r.programs.find((x) => x.active);
        setNextUp(p?.routines.find((x) => x.id === p.nextRoutineId)?.name ?? null);
      },
      () => {},
    );
  }, [w.id, w.name]);

  const recordValue = (r: PersonalRecord) =>
    r.kind === 'reps' ? `${r.value} reps` : r.kind === 'time' ? `${r.value} s` : r.kind === 'volume' ? `${units.show(r.weightKg)} × ${r.reps}` : r.kind === 'e1rm' ? `about ${units.roundLabel(r.value)}` : units.label(r.value);
  const diff = last ? summary.volumeKg - last.volumeKg : null;
  // Volume reads better as a whole number with separators: 11,574 lb.
  const vol = (kg: number) => `${Math.round(units.unit === 'lb' ? kg / 0.45359237 : kg).toLocaleString()} ${units.unit}`;
  const comparison = volumeComparison(summary.volumeKg);

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0 }} pointerEvents="none"><Confetti /></View>
        <View style={s.hero}>
          <BellAvatar size={84} />
          <Text style={[type.hero, { fontSize: 32, textAlign: 'center' }]}>{cheer}</Text>
          <Text style={[type.body, { textAlign: 'center' }]}>{w.name} is saved.</Text>
        </View>

        <View style={s.tiles}>
          <Tile icon="time-outline" label="Time" value={formatDuration(summary.durationSeconds)} />
          <Tile icon="layers-outline" label="Sets" value={String(summary.sets)} />
          <Tile icon="repeat-outline" label="Reps" value={String(reps)} />
          <Tile icon="barbell-outline" label="Volume" value={vol(summary.volumeKg)} />
        </View>
        {comparison && <Text style={[type.body, { textAlign: 'center' }]}>{comparison}</Text>}

        {summary.records.length > 0 && (
          <View style={[s.card, { borderColor: color.carbs, borderWidth: 2 }]}>
            <Text style={type.title}>🏆 {summary.records.length === 1 ? 'New personal record' : `${summary.records.length} new personal records`}</Text>
            {summary.records.map((r, i) => (
              <View key={i} style={s.row}>
                <Text style={[type.body, { fontWeight: '700', flex: 1 }]}>{r.exerciseName}</Text>
                <Text style={type.small}>{RECORD_NAMES[r.kind]}: {recordValue(r)}</Text>
              </View>
            ))}
          </View>
        )}
        {summary.offline && <Text style={type.small}>Saved on this phone. Records are checked once it syncs.</Text>}

        <View style={s.card}>
          <Text style={type.label}>Compared with last time</Text>
          {last ? (
            <Text style={type.body}>
              {diff! >= 0 ? `${vol(diff!)} more volume than` : `${vol(-diff!)} less volume than`} your last {w.name} ({last.date.slice(5).replace('-', '/')}).
              {diff! > 0 ? ' Progress!' : ' Some days are lighter; that’s training.'}
            </Text>
          ) : (
            <Text style={type.body}>{w.name === 'Workout' ? 'Start from a program routine and Forkbell compares each session with the last.' : `Your first ${w.name}. This is the one to beat next time.`}</Text>
          )}
          {weekCount !== null && (
            <Text style={type.body}>
              {goal ? `${weekCount} of ${goal} workouts this week.${weekCount >= goal ? ' Weekly goal done!' : ` ${goal - weekCount} to go.`}` : `${weekCount} workouts this week.`}
            </Text>
          )}
          {nextUp && <Text style={type.body}>Next up: <Text style={{ fontWeight: '800' }}>{nextUp}</Text></Text>}
        </View>

        {muscles.length > 0 && (
          <View style={s.card}>
            <Text style={type.label}>Muscles worked</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
              {muscles.map(([m, n]) => (
                <View key={m} style={s.pill}><Text style={{ color: color.onAccent, fontWeight: '700' }}>{cap(m)} · {n} sets</Text></View>
              ))}
            </View>
            <Text style={type.small}>Give these about 48 hours before training them hard again. The muscle map on Train shows what’s due.</Text>
          </View>
        )}

        <Pressable onPress={() => router.replace({ pathname: '/stretches', params: { kind: 'static', muscles: coolMuscles.join(','), start: '1' } })} style={s.coolDown}>
          <Ionicons name="body-outline" size={20} color={color.accent} />
          <Text style={[s.link, { flex: 1 }]}>Cool down: stretch {coolMuscles.slice(0, 3).join(', ') || 'what you trained'}</Text>
          <Ionicons name="chevron-forward" size={18} color={color.accent} />
        </Pressable>

        <Pressable onPress={() => router.back()} style={s.button}>
          <Text style={s.buttonText}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ icon, label, value }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={s.tile}>
      <Ionicons name={icon} size={18} color={color.accent} />
      <Text style={[type.title, type.number]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(4), maxWidth: 640, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', gap: space(2), paddingTop: space(4) },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  tile: { flexGrow: 1, flexBasis: '45%', backgroundColor: color.card, borderRadius: radius.card, padding: space(3), gap: 2, borderWidth: 1, borderColor: color.line },
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(2), borderWidth: 1, borderColor: color.line },
  row: { gap: 2, paddingVertical: space(1), borderTopWidth: 1, borderTopColor: color.line },
  pill: { backgroundColor: color.accent, borderRadius: 999, paddingHorizontal: space(3), paddingVertical: space(1) },
  coolDown: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.card, padding: space(4), borderWidth: 1, borderColor: color.line },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  button: { backgroundColor: color.accent, borderRadius: 14, paddingVertical: space(4), alignItems: 'center' },
  buttonText: { color: color.onAccent, fontSize: 17, fontWeight: '800' },
});
