import { TrainReadiness } from '../../../components/ReadinessCard';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDays, todayLocal, weekStart, weeklyGaps, type Program, type Workout, type WorkoutSummary, instant } from '@forkbell/shared';
import { ApiError } from '../../../lib/api';
import { cachedGet } from '../../../lib/sync';
import { startWorkout } from '../../../lib/actions';
import { LogPastWorkout } from '../../../components/LogPastWorkout';
import { formatDuration, useUnit } from '../../../lib/units';
import { Chip } from '../../../components/AmountPicker';
import { YourWeek } from '../../../components/YourWeek';
import { BodyMap } from '../../../components/BodyMap';
import { PlateCalculator } from '../../../components/PlateCalculator';
import { useAuth } from '../../../lib/auth';
import { TrainingCheckInCard } from '../../../components/CheckInCards';
import { color, space, type } from '../../../lib/theme';

function dayName(date: string) {
  const today = todayLocal();
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function Train() {
  const units = useUnit();
  const [open, setOpen] = useState<Workout | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [history, setHistory] = useState<WorkoutSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [gaps, setGaps] = useState<string[]>([]);
  const [logPast, setLogPast] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, p, h] = await Promise.all([
        cachedGet<{ workout: Workout | null }>('/api/workouts/open'),
        cachedGet<{ programs: Program[] }>('/api/programs'),
        cachedGet<{ workouts: WorkoutSummary[] }>('/api/workouts?limit=20'),
      ]);
      setOpen(o.workout);
      setProgram(p.programs.find((x) => x.active) ?? null);
      setHistory(h.workouts.filter((w) => w.finishedAt));
      setError(null);
      // Not essential: an older server or no connection just means no card.
      const today = todayLocal();
      cachedGet<{ muscles: Record<string, number>; workouts: number }>(`/api/workouts/muscles?from=${weekStart(today)}&to=${today}`).then(
        (m) => setGaps(weeklyGaps(m.muscles, m.workouts, today)),
        () => setGaps([]),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const start = async (routineId?: string) => {
    setStarting(true);
    try {
      const w = await startWorkout(todayLocal(), routineId);
      router.push({ pathname: '/workout', params: { id: w.id } });
    } catch (e) {
      // Already one going: open that instead.
      const id = e instanceof ApiError && e.status === 409 ? open?.id : null;
      if (id) router.push({ pathname: '/workout', params: { id } });
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const next = program?.routines.find((r) => r.id === (pick ?? program.nextRoutineId)) ?? null;

  const [plates, setPlates] = useState(false);
  const { me: meForPlates } = useAuth();
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={s.head}>
          <Text style={[type.hero, { fontSize: 34 }]}>Train</Text>
          <View style={{ flexDirection: 'row', gap: space(4) }}>
            <Pressable onPress={() => setPlates(true)} hitSlop={10} accessibilityLabel="Plate calculator">
              <Text style={s.link}>Plates</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/stretches')} hitSlop={10}>
              <Text style={s.link}>Stretches</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/exercises')} hitSlop={10}>
              <Text style={s.link}>Exercises</Text>
            </Pressable>
          </View>
        </View>
        {error && <Text style={s.error}>{error}</Text>}
        {!history && !error && <ActivityIndicator color={color.iron} />}

        {open ? (
          <Pressable onPress={() => router.push({ pathname: '/workout', params: { id: open.id } })} style={[s.card, s.live]}>
            <Text style={[type.small, { color: color.chalk }]}>In progress · {formatDuration((Date.now() - instant(open.startedAt)) / 1000)}</Text>
            <Text style={[type.title, { color: color.chalk }]}>{open.name}</Text>
            <Text style={[s.buttonText, { marginTop: space(2) }]}>Resume workout ›</Text>
          </Pressable>
        ) : program && next ? (
          <View style={s.card}>
            <Text style={type.small}>{program.name}</Text>
            <Text style={type.title}>{pick ? next.name : `Next up: ${next.name}`}</Text>
            <Text style={type.small} numberOfLines={2}>{next.exercises.map((e) => e.exercise.name).join(' · ') || 'No exercises yet. Edit this day to add some.'}</Text>
            {program.routines.length > 1 && (
              <View style={s.chips}>
                {program.routines.map((r) => (
                  <Chip key={r.id} label={r.name} on={r.id === next.id} onPress={() => setPick(r.id === program.nextRoutineId ? null : r.id)} />
                ))}
              </View>
            )}
            <Pressable onPress={() => start(next.id)} disabled={starting} style={[s.button, starting && { opacity: 0.5 }]}>
              <Text style={s.buttonText}>Start {next.name}</Text>
            </Pressable>
          </View>
        ) : history ? (
          <View style={s.card}>
            <Text style={type.title}>Pick a program</Text>
            <Text style={type.body}>Choose a starter plan and Forkbell suggests the weights for each session, adding a little when you hit the top of your rep range.</Text>
            <Pressable onPress={() => router.push('/programs')} style={s.button}>
              <Text style={s.buttonText}>See programs</Text>
            </Pressable>
          </View>
        ) : null}

        <TrainingCheckInCard />
        <TrainReadiness />
        <YourWeek
          program={program}
          finished={(history ?? []).filter((w) => w.date >= todayLocal()).map((w) => ({ date: w.date, name: w.name }))}
          onChanged={load}
        />
        <BodyMap />

        {!open && (
          <View style={s.row}>
            <Pressable onPress={() => start()} disabled={starting} style={s.secondary}>
              <Text style={s.link}>Start an empty workout</Text>
            </Pressable>
            {program && (
              <Pressable onPress={() => router.push('/programs')} style={s.secondary}>
                <Text style={s.link}>Programs</Text>
              </Pressable>
            )}
          </View>
        )}

        {gaps.length > 0 && (
          <View style={s.week} accessibilityRole="summary">
            <Text style={[type.body, { fontWeight: '700' }]}>This week</Text>
            <Text style={type.body}>
              Nothing for your {gaps.length === 1 ? gaps[0] : `${gaps.slice(0, -1).join(', ')} or ${gaps.at(-1)}`} yet. A session or a few sets before Sunday keeps things balanced.
            </Text>
          </View>
        )}

        {history && history.length > 0 && <Text style={s.section}>History</Text>}
        {history?.map((w) => (
          <Pressable key={w.id} onPress={() => router.push({ pathname: '/workout', params: { id: w.id } })} style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{w.name}</Text>
              <Text style={type.small}>
                {dayName(w.date)} · {w.sets} {w.sets === 1 ? 'set' : 'sets'}{w.volumeKg ? ` · ${units.label(w.volumeKg)}` : ''}
                {w.finishedAt ? ` · ${formatDuration((instant(w.finishedAt) - instant(w.startedAt)) / 1000)}` : ''}
              </Text>
            </View>
            <Text style={type.small}>›</Text>
          </Pressable>
        ))}
        {history && history.length === 0 && !open && <Text style={type.small}>Finished workouts show up here.</Text>}
        <Pressable onPress={() => setLogPast(true)} style={{ alignSelf: 'center', padding: space(3) }} accessibilityRole="button">
          <Text style={s.link}>+ Log a past workout</Text>
        </Pressable>
        <Text style={[type.small, { textAlign: 'center' }]}>Open any workout in History to change its sets, day or time.</Text>
      </ScrollView>
      <LogPastWorkout visible={logPast} program={program} onClose={() => setLogPast(false)} />
      <PlateCalculator visible={plates} weightKg={null} exercise={null} unit={meForPlates?.weightUnit ?? 'lb'} onClose={() => setPlates(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  week: { backgroundColor: color.infoBg, borderRadius: 14, padding: space(4), gap: space(1) },
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  card: { backgroundColor: color.card, borderRadius: 16, padding: space(4), gap: space(2) },
  live: { backgroundColor: color.iron },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center', marginTop: space(2) },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  secondary: { paddingVertical: space(2) },
  section: { ...type.small, fontWeight: '700', marginTop: space(3) },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.card, borderRadius: 10, padding: space(3), gap: space(2) },
});
