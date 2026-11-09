import { TrainReadiness } from '../../../components/ReadinessCard';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from '../../../components/Tap';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDays, todayLocal, type Program, type Workout, type WorkoutSummary, instant } from '@forkbell/shared';
import { ApiError } from '../../../lib/api';
import { cachedGet } from '../../../lib/sync';
import { problem } from '../../../lib/problem';
import { startWorkout } from '../../../lib/actions';
import { LogPastWorkout } from '../../../components/LogPastWorkout';
import { formatDuration, useUnit } from '../../../lib/units';
import { Chip } from '../../../components/AmountPicker';
import { YourWeek } from '../../../components/YourWeek';
import { PlateCalculator } from '../../../components/PlateCalculator';
import { useAuth } from '../../../lib/auth';
import { TrainingCheckInCard } from '../../../components/CheckInCards';
import { color, radius, space, type, textSize } from '../../../lib/theme';
import { SkeletonRows } from '../../../components/Skeleton';
import { buttons } from '../../../lib/buttons';
import { QUICK_BELL_ROOM } from '../../../components/QuickBell';

const PAGE = 20;

function dayName(date: string) {
  const today = todayLocal();
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const sameYear = y === Number(today.slice(0, 4));
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

type Starting = 'routine' | 'empty' | null;

export default function Train() {
  const units = useUnit();
  const { me } = useAuth();
  const [open, setOpen] = useState<Workout | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [hasPrograms, setHasPrograms] = useState(false);
  const [history, setHistory] = useState<WorkoutSummary[] | null>(null);
  const [more, setMore] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startError, setStartError] = useState<{ from: Exclude<Starting, null>; message: string } | null>(null);
  const [starting, setStarting] = useState<Starting>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [logPast, setLogPast] = useState(false);
  const [plates, setPlates] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const [o, p, h] = await Promise.all([
        cachedGet<{ workout: Workout | null }>('/api/workouts/open'),
        cachedGet<{ programs: Program[] }>('/api/programs'),
        cachedGet<{ workouts: WorkoutSummary[] }>(`/api/workouts?limit=${limit}`),
      ]);
      setOpen(o.workout);
      setProgram(p.programs.find((x) => x.active) ?? null);
      setHasPrograms(p.programs.length > 0);
      setHistory(h.workouts.filter((w) => w.finishedAt));
      setMore(h.workouts.length >= limit);
      setLoadError(null);
    } catch (e) {
      setLoadError(problem(e));
    }
  }, [limit]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // The running workout's clock: tick while this tab is showing.
  useFocusEffect(
    useCallback(() => {
      if (!open) return;
      setNow(Date.now());
      const t = setInterval(() => setNow(Date.now()), 30_000);
      return () => clearInterval(t);
    }, [open]),
  );
  useEffect(() => setStartError(null), [pick]);

  const start = async (from: Exclude<Starting, null>, routineId?: string) => {
    setStarting(from);
    setStartError(null);
    try {
      const w = await startWorkout(todayLocal(), routineId);
      router.push({ pathname: '/workout', params: { id: w.id } });
    } catch (e) {
      // Already one going: open that instead.
      const id = e instanceof ApiError && e.status === 409 ? open?.id : null;
      if (id) router.push({ pathname: '/workout', params: { id } });
      else setStartError({ from, message: `Couldn’t start the workout. ${problem(e)}` });
    } finally {
      setStarting(null);
    }
  };

  const next = program?.routines.find((r) => r.id === (pick ?? program.nextRoutineId)) ?? null;
  const busy = starting !== null;

  const startProblem = (from: Exclude<Starting, null>, retry: () => void) =>
    startError?.from === from && (
      <View style={s.problem} accessibilityLiveRegion="polite">
        <Text style={[type.small, { flex: 1, color: color.iron }]}>{startError.message}</Text>
        <Pressable onPress={retry} style={s.retry}>
          <Text style={buttons.smallText}>Try again</Text>
        </Pressable>
      </View>
    );

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={s.head}>
          <Text style={type.pageTitle}>Train</Text>
          <View style={{ flexDirection: 'row', gap: space(4) }}>
            <Pressable onPress={() => router.push('/stretches')} style={s.headLink} accessibilityRole="link">
              <Text style={s.link}>Stretches</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/exercises')} style={s.headLink} accessibilityRole="link">
              <Text style={s.link}>Exercises</Text>
            </Pressable>
          </View>
        </View>

        {loadError && (
          <View style={s.problem} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={22} color={color.over} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, { fontWeight: '700' }]}>Couldn’t load your training</Text>
              <Text style={type.small}>{loadError}</Text>
            </View>
            <Pressable onPress={() => void load()} style={s.retry}>
              <Text style={buttons.smallText}>Try again</Text>
            </Pressable>
          </View>
        )}
        {!history && !loadError && <SkeletonRows rows={4} />}

        {open ? (
          <Pressable onPress={() => router.push({ pathname: '/workout', params: { id: open.id } })} style={[s.card, s.live]} accessibilityHint="Opens the workout you’re in">
            <Text style={[type.small, type.number, { color: color.chalk }]}>In progress · {formatDuration(Math.max(0, now - instant(open.startedAt)) / 1000)}</Text>
            <Text style={[type.title, { color: color.chalk }]}>{open.name}</Text>
            <View style={s.resume}>
              <Text style={s.buttonText}>Resume workout</Text>
              <Ionicons name="chevron-forward" size={18} color={color.chalk} />
            </View>
          </Pressable>
        ) : program && next ? (
          <View style={s.card}>
            <Pressable onPress={() => router.push('/programs')} hitSlop={8} style={s.programLink} accessibilityLabel={`${program.name}. Programs`}>
              <Text style={[type.small, { color: color.accent, fontWeight: '700' }]}>{program.name}{program.fromCoach ? ' · from your coach' : ''}</Text>
              <Ionicons name="chevron-forward" size={14} color={color.accent} />
            </Pressable>
            <Text style={type.title}>{pick ? next.name : `Next up: ${next.name}`}</Text>
            <Text style={type.small} numberOfLines={2}>{next.exercises.map((e) => e.exercise.name).join(' · ') || 'No exercises yet. Edit this day to add some.'}</Text>
            {program.routines.length > 1 && (
              <View style={s.chips}>
                {program.routines.map((r) => (
                  <Chip key={r.id} label={r.name} on={r.id === next.id} onPress={() => setPick(r.id === program.nextRoutineId ? null : r.id)} />
                ))}
              </View>
            )}
            <Pressable onPress={() => start('routine', next.id)} disabled={busy} style={[s.button, busy && { opacity: 0.5 }]} accessibilityState={{ busy: starting === 'routine', disabled: busy }}>
              <Text style={s.buttonText}>{starting === 'routine' ? 'Starting…' : `Start ${next.name}`}</Text>
            </Pressable>
            {startProblem('routine', () => start('routine', next.id))}
          </View>
        ) : history ? (
          <View style={s.card}>
            <Text style={type.title}>{hasPrograms ? 'Choose a program' : 'Pick a program'}</Text>
            <Text style={type.body}>
              {hasPrograms
                ? 'None of your programs is running. Choose one and Forkbell lines up each session and suggests the weights.'
                : 'Choose a starter plan and Forkbell suggests the weights for each session, adding a little when you hit the top of your rep range.'}
            </Text>
            <Pressable onPress={() => router.push('/programs')} style={s.button}>
              <Text style={s.buttonText}>{hasPrograms ? 'Choose a program' : 'See programs'}</Text>
            </Pressable>
          </View>
        ) : null}

        {history && (
          <View style={s.tools}>
            {!open && (
              <Pressable onPress={() => start('empty')} disabled={busy} style={[s.tool, busy && { opacity: 0.5 }]} accessibilityLabel="Start an empty workout" accessibilityState={{ busy: starting === 'empty', disabled: busy }}>
                <Ionicons name="add-circle-outline" size={22} color={color.iron} />
                <Text style={s.toolText}>{starting === 'empty' ? 'Starting…' : 'Empty workout'}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setPlates(true)} style={s.tool} accessibilityLabel="Plate calculator">
              <Ionicons name="barbell-outline" size={22} color={color.iron} />
              <Text style={s.toolText}>Plates</Text>
            </Pressable>
            <Pressable onPress={() => setLogPast(true)} style={s.tool} accessibilityLabel="Log a past workout">
              <Ionicons name="time-outline" size={22} color={color.iron} />
              <Text style={s.toolText}>Log past</Text>
            </Pressable>
          </View>
        )}
        {startProblem('empty', () => start('empty'))}

        <YourWeek
          program={program}
          finished={(history ?? []).filter((w) => w.date >= todayLocal()).map((w) => ({ date: w.date, name: w.name }))}
          onChanged={load}
        />
        <TrainingCheckInCard />
        <TrainReadiness />

        {history && history.length > 0 && <Text style={s.section} accessibilityRole="header">History</Text>}
        {history?.map((w) => (
          <Pressable
            key={w.id}
            onPress={() => router.push({ pathname: '/workout', params: { id: w.id } })}
            style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityHint="Opens the workout to change its sets, day or time"
          >
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{w.name}</Text>
              <Text style={[type.small, type.number]}>
                {dayName(w.date)} · {w.sets} {w.sets === 1 ? 'set' : 'sets'}{w.volumeKg ? ` · ${units.label(w.volumeKg)}` : ''}
                {w.finishedAt ? ` · ${formatDuration((instant(w.finishedAt) - instant(w.startedAt)) / 1000)}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={color.ironSoft} />
          </Pressable>
        ))}
        {history && more && (
          <Pressable onPress={() => setLimit((n) => n + PAGE)} style={s.more}>
            <Text style={s.link}>Show more</Text>
          </Pressable>
        )}
        {history && history.length === 0 && !open && <Text style={type.small}>Finished workouts show up here.</Text>}
      </ScrollView>
      <LogPastWorkout visible={logPast} program={program} onClose={() => setLogPast(false)} />
      <PlateCalculator visible={plates} weightKg={null} exercise={null} unit={me?.weightUnit ?? 'lb'} onClose={() => setPlates(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: QUICK_BELL_ROOM, gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headLink: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: textSize.control },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.dangerBg, borderRadius: radius.card, padding: space(4) },
  retry: { ...buttons.small, minHeight: 44 },
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(2) },
  live: { backgroundColor: color.iron },
  resume: { flexDirection: 'row', alignItems: 'center', gap: space(1), marginTop: space(2) },
  programLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  button: { ...buttons.filled, marginTop: space(2) },
  buttonText: { ...buttons.filledText },
  tools: { flexDirection: 'row', gap: space(2) },
  tool: { ...buttons.quiet, flex: 1, gap: space(1), paddingVertical: space(3), paddingHorizontal: space(2) },
  // Centred line by line: "Empty workout" wraps onto two lines on a phone.
  toolText: { ...buttons.quietText, fontSize: textSize.control, textAlign: 'center' },
  section: { ...type.label, marginTop: space(3) },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.card, borderRadius: radius.row, padding: space(3), gap: space(2), minHeight: 44 },
  more: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: space(3) },
});
