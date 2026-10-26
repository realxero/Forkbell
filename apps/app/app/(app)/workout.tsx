import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { afterSet, bigJump, leaveSuperset, linkWithNext, nextSetKind, supersetLetter, supersetRun, tidySupersets, volumeComparison, type Exercise, type PersonalRecord, type SetEntry, type Workout, type WorkoutExercise } from '@forkbell/shared';
import { TextInput } from 'react-native';
import { api } from '../../lib/api';
import { cachedGet } from '../../lib/sync';
import { discardWorkout, finishWorkout, saveWorkout, type FinishSummary } from '../../lib/actions';
import { confirm } from '../../lib/confirm';
import { formatDuration, useUnit } from '../../lib/units';
import { ExercisePicker } from '../../components/ExercisePicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SwapSheet } from '../../components/SwapSheet';
import { showToast } from '../../lib/toast';
import { playSound, unlockAudio } from '../../lib/sounds';
import { PlateCalculator, defaultBarId } from '../../components/PlateCalculator';
import { FinishScreen } from '../../components/FinishScreen';
import { BARS, DEFAULT_PLATES, fromKg, toKg, usesPlates, warmupSets } from '@forkbell/shared';
import { FormCheck } from '../../components/FormCheck';
import { HowToSheet } from '../../components/HowTo';
import { useTrainingSetup } from '../../lib/training-setup';
import { NumberField } from '../../components/NumberField';
import { color, space, type } from '../../lib/theme';
import { haptic, hapticsOn } from '../../lib/haptics';
import { cancelRestAlert, scheduleRestAlert } from '../../lib/reminders';
import { WorkoutBell } from '../../components/WorkoutBell';

/**
 * What an empty box means: the same set last time, else the set above, else
 * the bottom of the rep range. Shown greyed out, and used when you tick.
 */
function placeholderFor(e: WorkoutExercise, k: number) {
  const prev = e.previous[k];
  const above = e.sets[k - 1];
  return {
    weightKg: prev?.weightKg ?? above?.weightKg ?? null,
    reps: prev?.reps ?? above?.reps ?? e.repMin ?? null,
    seconds: prev?.seconds ?? above?.seconds ?? null,
  };
}

type Summary = FinishSummary;
const blankSet = (): SetEntry => ({ weightKg: null, reps: null, seconds: null, rpe: null, warmup: false, done: false });

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const units = useUnit();
  const [w, setW] = useState<Workout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [picker, setPicker] = useState(false);
  /** when set, the picker swaps this exercise instead of adding one */
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  /** the ranked swap suggestions, for this exercise */
  const [swapSheet, setSwapSheet] = useState<number | null>(null);
  /** "How to do it" for this exercise, over the workout */
  const [howToFor, setHowToFor] = useState<Exercise | null>(null);
  /** which exercise card is being filmed for a form check */
  const [formFor, setFormFor] = useState<number | null>(null);
  /** the exercise card the plate calculator is open for */
  const [platesFor, setPlatesFor] = useState<number | null>(null);
  const training = useTrainingSetup();
  const [menu, setMenu] = useState<number | null>(null);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [skipWarmup, setSkipWarmup] = useState(false);

  const latest = useRef<Workout | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    cachedGet<{ workout: Workout }>(`/api/workouts/${id}`).then(
      (r) => {
        latest.current = r.workout;
        setW(r.workout);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [id]);

  // One clock for the elapsed time and the rest timer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const restLeft = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : null;
  useEffect(() => {
    if (restEnd && restLeft === 0) {
      if (hapticsOn()) haptic.alert();
      else Vibration.vibrate(500);
      playSound('rest');
      const t = setTimeout(() => setRestEnd(null), 4000);
      return () => clearTimeout(t);
    }
  }, [restEnd, restLeft]);

  // The phone buzzes when the rest is up, even locked or with Forkbell in the background.
  // Leaving the screen keeps it; Skip, Finish and Discard cancel it.
  const restNext = useRef<string | null>(null);
  useEffect(() => {
    if (restEnd) void scheduleRestAlert(restEnd, restNext.current).catch(() => {});
    else void cancelRestAlert();
  }, [restEnd]);

  // Saving: the whole session goes up shortly after each change.
  const save = useCallback(async () => {
    const cur = latest.current;
    if (!cur) return;
    setSaveState('saving');
    try {
      // Saved on the device right away; sent now, or later if there's no signal.
      await saveWorkout(cur);
      setSaveState(latest.current === cur ? 'saved' : 'saving');
    } catch (e) {
      setSaveState('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      inFlight.current = save();
    }
    await inFlight.current;
  }, [save]);
  useEffect(() => () => void flush(), [flush]); // leaving the screen saves too

  const update = (fn: (w: Workout) => Workout) => {
    setW((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      latest.current = next;
      return next;
    });
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      inFlight.current = save();
    }, 700);
  };
  const updateExercise = (i: number, fn: (e: WorkoutExercise) => WorkoutExercise) =>
    update((w) => ({ ...w, exercises: w.exercises.map((e, j) => (j === i ? fn(e) : e)) }));
  const updateSet = (i: number, k: number, patch: Partial<SetEntry>) =>
    updateExercise(i, (e) => ({ ...e, sets: e.sets.map((s, j) => (j === k ? { ...s, ...patch } : s)) }));

  /** Tick a set. Empty boxes take what the placeholders showed, so a repeat of last time is one tap. */
  const toggleDone = (i: number, k: number) => {
    const e = w!.exercises[i]!;
    const s = e.sets[k]!;
    if (s.done) return updateSet(i, k, { done: false });
    const ph = placeholderFor(e, k);
    const patch: Partial<SetEntry> = { done: true };
    haptic.tap();
    unlockAudio(); // browsers only allow sound after a tap
    if (e.exercise.kind === 'time') {
      const secs = s.seconds ?? ph.seconds;
      if (!secs) return setHint('Enter the time first.');
      patch.seconds = secs;
    } else {
      const reps = s.reps ?? ph.reps;
      if (!reps) return setHint('Enter the reps first.');
      patch.reps = reps;
      if (s.weightKg === null && ph.weightKg) patch.weightKg = ph.weightKg;
      if (e.exercise.kind === 'weight' && (patch.weightKg ?? s.weightKg) === null) return setHint('Enter the weight first.');
    }
    setHint(null);
    updateSet(i, k, patch);
    if (w!.finishedAt) return;
    // What now: straight into a drop set, on to the next exercise of a superset,
    // or a rest (after a superset's last exercise, the longest rest of the group).
    const list = w!.exercises.map((x, j) => (j === i ? { ...x, sets: x.sets.map((y, m) => (m === k ? { ...y, ...patch } : y)) } : x));
    const then = afterSet(list, i, k);
    const nextName = then.next === null ? null : list[then.next]!.exercise.name;
    if (then.why === 'drop') {
      setRestEnd(null);
      showToast('Drop set: lighten the weight and go, no rest.');
      return;
    }
    if (then.why === 'superset') {
      setRestEnd(null);
      showToast(`Superset: straight on to ${nextName}.`);
      return;
    }
    if (then.rest > 0) {
      // For the notification: another set of this, or the next exercise.
      restNext.current = nextName;
      setRestTotal(then.rest);
      setRestEnd(Date.now() + then.rest * 1000);
    }
  };

  /** Superset numbers changed by hand (link, leave) or by moving and removing: keep them tidy. */
  const withGroups = (list: WorkoutExercise[], groups: (number | null)[]) => list.map((x, j) => ({ ...x, superset: groups[j] ?? null }));
  const tidy = (list: WorkoutExercise[]) => withGroups(list, tidySupersets(list.map((x) => x.superset ?? null)));
  const linkNext = (i: number) => {
    setMenu(null);
    haptic.tap();
    update((w) => ({ ...w, exercises: withGroups(w.exercises, linkWithNext(w.exercises.map((x) => x.superset ?? null), i)) }));
  };
  const unlink = (i: number) => {
    setMenu(null);
    update((w) => ({ ...w, exercises: withGroups(w.exercises, leaveSuperset(w.exercises.map((x) => x.superset ?? null), i)) }));
  };

  /** Swap in place: same sets and targets, the new exercise's own history and tips. */
  const swapAt = async (i: number, ex: Exercise) => {
      let previous: SetEntry[] = [];
      try {
        previous = (await api<{ sessions: { sets: SetEntry[] }[] }>(`/api/exercises/${ex.id}`)).sessions[0]?.sets ?? [];
      } catch {
        /* not essential */
      }
      return updateExercise(i, (x) => ({ ...x, exercise: ex, restSeconds: ex.restSeconds, previous, tips: [], pain: false, painNote: null, sets: x.sets.map((s) => ({ ...s, weightKg: null, done: false })) }));
  };

  const addExercise = async (ex: Exercise) => {
    setPicker(false);
    if (swapIndex !== null) {
      const i = swapIndex;
      setSwapIndex(null);
      return swapAt(i, ex);
    }
    // What you did last time fills the "previous" column straight away.
    let previous: SetEntry[] = [];
    let tips: WorkoutExercise['tips'] = [];
    try {
      const r = await api<{ sessions: { sets: SetEntry[] }[]; tips?: WorkoutExercise['tips'] }>(`/api/exercises/${ex.id}`);
      previous = r.sessions[0]?.sets ?? [];
      tips = r.tips ?? [];
    } catch {
      /* not essential */
    }
    const count = Math.max(1, previous.filter((s) => !s.warmup).length);
    update((w) => ({
      ...w,
      exercises: [...w.exercises, { exercise: ex, restSeconds: ex.restSeconds, targetSets: null, repMin: null, repMax: null, sets: Array.from({ length: count }, blankSet), previous, tips }],
    }));
  };

  const move = (i: number, by: number) =>
    update((w) => {
      const list = [...w.exercises];
      const j = i + by;
      if (j < 0 || j >= list.length) return w;
      [list[i], list[j]] = [list[j]!, list[i]!];
      // Moving out of a superset leaves it; moving within one keeps it.
      return { ...w, exercises: tidy(list) };
    });

  /** The weight of the next working set: what's typed in, else last time's top set. */
  const nextWorkingWeight = (e: WorkoutExercise) =>
    e.sets.find((x) => !x.done && !x.warmup && !x.drop && x.weightKg)?.weightKg ??
    e.sets.find((x) => !x.warmup && !x.drop && x.weightKg)?.weightKg ??
    [...e.previous].filter((x) => !x.warmup && !x.drop && x.weightKg).sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0))[0]?.weightKg ??
    null;

  /** Ramp-up sets before the working weight, loadable with your plates and the bar you use. */
  const addWarmups = (i: number) => {
    const e = w!.exercises[i]!;
    const kg = nextWorkingWeight(e);
    if (!kg) return setHint('Enter your working weight first, then tap Warm-up sets.');
    const unit = units.unit;
    const bar = [...BARS, ...training.setup.bars].find((b) => b.id === (training.setup.barFor[e.exercise.id] || defaultBarId(e.exercise, unit))) ?? BARS.find((b) => b.id === `olympic-${unit}`)!;
    const sets = warmupSets(fromKg(kg, unit), bar, training.setup.plates[unit] ?? DEFAULT_PLATES[unit]);
    if (!sets.length) return setHint('That weight is light enough to start straight away.');
    updateExercise(i, (x) => ({
      ...x,
      // Replace any warm-ups already there, keep the working sets.
      sets: [...sets.map((ws) => ({ weightKg: toKg(ws.weight, unit), reps: ws.reps, seconds: null, rpe: null, warmup: true, done: false })), ...x.sets.filter((st) => !st.warmup)],
    }));
    haptic.tap();
  };

  const finish = async () => {
    const left = w!.exercises.flatMap((e) => e.sets).filter((s) => !s.done).length;
    if (left && !(await confirm('Finish workout?', `${left} unticked ${left === 1 ? 'set' : 'sets'} will be left out.`, 'Finish'))) return;
    setFinishing(true);
    try {
      await flush();
      const r = await finishWorkout(latest.current ?? w!);
      if (r.discarded) return router.back();
      setRestEnd(null);
      haptic.success();
      playSound('done');
      setSummary(r.summary!);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinishing(false);
    }
  };

  const discard = async () => {
    if (!(await confirm(w!.finishedAt ? 'Delete this workout?' : 'Discard this workout?', 'Its sets will be deleted. This can’t be undone.', 'Delete'))) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void cancelRestAlert();
    await discardWorkout(w!).catch(() => {});
    router.back();
  };

  if (summary && w) return <FinishScreen w={latest.current ?? w} summary={summary} />;
  if (!w)
    return (
      <SafeAreaView style={s.screen}>
        {error ? <Text style={[s.error, { padding: space(4) }]}>{error}</Text> : <ActivityIndicator color={color.iron} style={{ marginTop: space(10) }} />}
      </SafeAreaView>
    );

  const elapsed = Math.max(0, Math.floor(((w.finishedAt ? Date.parse(w.finishedAt) : now) - Date.parse(w.startedAt)) / 1000));

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.head}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={s.link}>‹ Back</Text>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={type.title} numberOfLines={1}>{w.name}</Text>
            <Text style={[type.small, type.number]}>
              {w.finishedAt ? `Finished · ${formatDuration(elapsed)}` : formatDuration(elapsed)}
              {saveState === 'saving' ? ' · saving…' : saveState === 'error' ? ' · not saved' : ''}
            </Text>
          </View>
          {w.finishedAt ? (
            <View style={{ width: 60 }} />
          ) : (
            <Pressable onPress={finish} disabled={finishing} style={[s.finish, finishing && { opacity: 0.5 }]}>
              <Text style={s.finishText}>Finish</Text>
            </Pressable>
          )}
        </View>

        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {error && <Text style={s.error}>{error}</Text>}
          {hint && <Text style={s.hint}>{hint}</Text>}
          {!w.finishedAt && !skipWarmup && w.exercises.length > 0 && !w.exercises.some((e) => e.sets.some((x) => x.done)) && (
            <View style={s.warmup}>
              <Ionicons name="flame-outline" size={22} color={color.fat} />
              <View style={{ flex: 1, gap: space(1) }}>
                <Text style={[type.body, { fontWeight: '700' }]}>Warm up first?</Text>
                <Text style={type.small}>A few minutes of moving stretches for {trained(w).join(', ') || 'your whole body'}, with pictures and a timer.</Text>
                <View style={{ flexDirection: 'row', gap: space(4) }}>
                  <Pressable onPress={() => router.push({ pathname: '/stretches', params: { kind: 'dynamic', muscles: trained(w).join(','), start: '1' } })} style={{ minHeight: 40, justifyContent: 'center' }}>
                    <Text style={s.link}>Start warm-up</Text>
                  </Pressable>
                  <Pressable onPress={() => setSkipWarmup(true)} style={{ minHeight: 40, justifyContent: 'center' }}>
                    <Text style={[s.link, { color: color.ironSoft }]}>Not now</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
          {w.exercises.length === 0 && <Text style={[type.body, { textAlign: 'center', marginTop: space(6) }]}>Add your first exercise to get going.</Text>}

          {w.exercises.map((e, i) => (
            <ExerciseCard
              key={`${e.exercise.id}-${i}`}
              e={e}
              units={units}
              menuOpen={menu === i}
              onMenu={() => setMenu(menu === i ? null : i)}
              onSet={(k, patch) => updateSet(i, k, patch)}
              onToggle={(k) => toggleDone(i, k)}
              onAddSet={() => updateExercise(i, (x) => ({ ...x, sets: [...x.sets, { ...(x.sets.at(-1) ?? blankSet()), done: false, warmup: false }] }))}
              onRemoveSet={() => updateExercise(i, (x) => ({ ...x, sets: x.sets.slice(0, -1) }))}
              onPlates={() => setPlatesFor(i)}
              onWarmupSets={() => addWarmups(i)}
              onRest={(by) => updateExercise(i, (x) => ({ ...x, restSeconds: Math.min(900, Math.max(0, x.restSeconds + by)) }))}
              onMove={(by) => {
                setMenu(null);
                move(i, by);
              }}
              onRemove={() => {
                setMenu(null);
                update((w) => ({ ...w, exercises: tidy(w.exercises.filter((_, j) => j !== i)) }));
              }}
              onHowTo={() => {
                setMenu(null);
                setHowToFor(e.exercise);
              }}
              onSwap={() => {
                setMenu(null);
                setSwapSheet(i);
              }}
              onFormCheck={() => {
                setMenu(null);
                setFormFor(i);
              }}
              onHideTips={async () => {
                // Pain notes keep showing; the rest stop for this exercise, everywhere.
                updateExercise(i, (x) => ({ ...x, tips: x.tips?.filter((t) => t.kind === 'pain') }));
                await training.save((t) => ({ ...t, hiddenTips: [...new Set([...t.hiddenTips, e.exercise.id])] })).catch(() => {});
              }}
              onPain={(pain, painNote) => updateExercise(i, (x) => ({ ...x, pain, painNote }))}
              group={(() => {
                const run = supersetRun(w.exercises.map((x) => x.superset ?? null), i);
                return run.length > 1 ? { letter: supersetLetter(e.superset ?? 1), at: run.indexOf(i) + 1, of: run.length } : null;
              })()}
              canLinkNext={i < w.exercises.length - 1}
              onLinkNext={() => linkNext(i)}
              onLeaveGroup={() => unlink(i)}
            />
          ))}

          <Pressable onPress={() => setPicker(true)} style={s.addExercise}>
            <Text style={s.addText}>+ Add exercise</Text>
          </Pressable>
          <Pressable onPress={discard} style={{ alignSelf: 'center', padding: space(4) }}>
            <Text style={[s.link, { color: color.over }]}>{w.finishedAt ? 'Delete workout' : 'Discard workout'}</Text>
          </Pressable>
        </ScrollView>

        {restLeft !== null && (
          <View style={[s.rest, restLeft === 0 && { backgroundColor: color.fat }]}>
            <View style={[s.restFill, { width: `${restTotal ? (100 * restLeft) / restTotal : 0}%` }]} />
            <Text style={s.restText}>{restLeft === 0 ? 'Rest over. Next set!' : `Rest ${formatDuration(restLeft)}`}</Text>
            {restLeft > 0 && (
              <View style={s.restButtons}>
                <Pressable onPress={() => setRestEnd((t) => (t ? t - 15000 : t))} hitSlop={8}><Text style={s.restButton}>−15</Text></Pressable>
                <Pressable onPress={() => { setRestEnd((t) => (t ? t + 15000 : t)); setRestTotal((t) => t + 15); }} hitSlop={8}><Text style={s.restButton}>+15</Text></Pressable>
                <Pressable onPress={() => setRestEnd(null)} hitSlop={8}><Text style={s.restButton}>Skip</Text></Pressable>
              </View>
            )}
          </View>
        )}
        {!w.finishedAt && <WorkoutBell workoutId={w.id} beforeAsk={flush} lifted={restLeft !== null} />}
      </KeyboardAvoidingView>
      <HowToSheet exercise={howToFor} onClose={() => setHowToFor(null)} />
      <PlateCalculator
        visible={platesFor !== null}
        unit={units.unit}
        exercise={platesFor !== null ? (w.exercises[platesFor]?.exercise ?? null) : null}
        weightKg={platesFor !== null && w.exercises[platesFor] ? nextWorkingWeight(w.exercises[platesFor]!) : null}
        onClose={() => setPlatesFor(null)}
        onUse={(kg) => {
          const i = platesFor;
          if (i === null) return;
          updateExercise(i, (x) => {
            const k = x.sets.findIndex((st) => !st.done && !st.warmup && !st.drop);
            return k < 0 ? x : { ...x, sets: x.sets.map((st, j) => (j === k ? { ...st, weightKg: kg } : st)) };
          });
        }}
      />
      <FormCheck
        exercise={formFor !== null ? (w.exercises[formFor]?.exercise.name ?? null) : null}
        onClose={() => setFormFor(null)}
        onResult={(r) => {
          // Fill the reps into the next set that isn't ticked yet (you still tick it yourself).
          const i = formFor;
          if (i === null || !r.reps) return;
          updateExercise(i, (x) => {
            const k = x.sets.findIndex((st) => !st.done && !st.warmup && !st.drop);
            if (k < 0) return x;
            return { ...x, sets: x.sets.map((st, j) => (j === k ? { ...st, reps: r.reps } : st)) };
          });
          showToast(`Form check: ${r.summary[0] ?? `${r.reps} reps`}`);
        }}
      />
      <SwapSheet
        target={swapSheet !== null ? (w.exercises[swapSheet]?.exercise ?? null) : null}
        onPick={(ex) => {
          const i = swapSheet!;
          setSwapSheet(null);
          void swapAt(i, ex);
        }}
        onPickAny={() => {
          setSwapIndex(swapSheet);
          setSwapSheet(null);
          setPicker(true);
        }}
        onClose={() => setSwapSheet(null)}
      />
      <ExercisePicker
        visible={picker}
        title={swapIndex !== null ? 'Swap for…' : 'Add exercise'}
        initialMuscle={swapIndex !== null ? (w.exercises[swapIndex]?.exercise.muscle ?? null) : null}
        onPick={addExercise}
        onClose={() => {
          setPicker(false);
          setSwapIndex(null);
        }}
      />
    </SafeAreaView>
  );
}

type Units = ReturnType<typeof useUnit>;

function ExerciseCard(props: {
  e: WorkoutExercise;
  units: Units;
  menuOpen: boolean;
  onMenu: () => void;
  onSet: (k: number, patch: Partial<SetEntry>) => void;
  onToggle: (k: number) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onPlates: () => void;
  onWarmupSets: () => void;
  onRest: (by: number) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
  onSwap: () => void;
  onFormCheck: () => void;
  onHowTo: () => void;
  onHideTips: () => void;
  onPain: (pain: boolean, note: string | null) => void;
  /** in a superset or circuit: its letter, and where this exercise is in it */
  group: { letter: string; at: number; of: number } | null;
  canLinkNext: boolean;
  onLinkNext: () => void;
  onLeaveGroup: () => void;
}) {
  /** "Got it" hides the tips for this session only */
  const [tipsDismissed, setTipsDismissed] = useState(false);
  const { e, units } = props;
  const kind = e.exercise.kind;
  const target = e.repMin ? (e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}–${e.repMax}`) : null;
  const group = props.group;
  return (
    <View style={[s.card, group && s.grouped, group && group.at > 1 && s.groupedNext]}>
      {group && (
        <View style={s.groupTag} accessibilityLabel={`${group.of > 2 ? 'Circuit' : 'Superset'} ${group.letter}, exercise ${group.at} of ${group.of}. Straight on to the next, rest after the last.`}>
          <Ionicons name={group.at < group.of ? 'arrow-down' : 'refresh'} size={13} color={color.onAccent} />
          <Text style={s.groupTagText}>
            {group.of > 2 ? 'Circuit' : 'Superset'} {group.letter} · {group.at} of {group.of}
            {group.at < group.of ? ' · then straight on' : ' · then rest'}
          </Text>
        </View>
      )}
      <View style={s.cardHead}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/exercise', params: { id: e.exercise.id } })}>
          <Text style={[type.title, { fontSize: 18 }]}>{e.exercise.name}</Text>
          <Text style={type.small}>
            {e.targetSets && target && kind !== 'time' ? `${e.targetSets} × ${target} reps · ` : ''}
            rest {formatDuration(e.restSeconds)}
          </Text>
        </Pressable>
        {e.exercise.howTo && (
          <Pressable onPress={props.onHowTo} hitSlop={10} style={s.howToButton} accessibilityLabel={`How to do ${e.exercise.name}`}>
            <Ionicons name="help-circle-outline" size={24} color={color.accent} />
          </Pressable>
        )}
        <Pressable onPress={props.onMenu} hitSlop={10} accessibilityLabel={`Options for ${e.exercise.name}`}>
          <Text style={s.dots}>⋯</Text>
        </Pressable>
      </View>
      {props.menuOpen && (
        <View style={s.menu}>
          {e.exercise.howTo && <Pressable onPress={props.onHowTo}><Text style={s.menuItem}>How to do it</Text></Pressable>}
          <Pressable onPress={() => props.onRest(-15)}><Text style={s.menuItem}>Rest −15 s</Text></Pressable>
          <Pressable onPress={() => props.onRest(15)}><Text style={s.menuItem}>Rest +15 s</Text></Pressable>
          {props.canLinkNext && <Pressable onPress={props.onLinkNext}><Text style={s.menuItem}>Superset with the next exercise</Text></Pressable>}
          {group && <Pressable onPress={props.onLeaveGroup}><Text style={s.menuItem}>Leave the {group.of > 2 ? 'circuit' : 'superset'}</Text></Pressable>}
          <Pressable onPress={() => props.onMove(-1)}><Text style={s.menuItem}>Move up</Text></Pressable>
          <Pressable onPress={() => props.onMove(1)}><Text style={s.menuItem}>Move down</Text></Pressable>
          <Pressable onPress={props.onFormCheck}><Text style={s.menuItem}>Check my form (camera)</Text></Pressable>
          <Pressable onPress={props.onSwap}><Text style={s.menuItem}>Swap for a similar exercise</Text></Pressable>
          <Pressable onPress={() => props.onPain(!e.pain, e.pain ? null : e.painNote ?? null)}>
            <Text style={[s.menuItem, { color: color.over }]}>{e.pain ? 'Clear pain flag' : 'Flag pain or discomfort'}</Text>
          </Pressable>
          <Pressable onPress={props.onRemove}><Text style={[s.menuItem, { color: color.over }]}>Remove</Text></Pressable>
        </View>
      )}
      {e.pain && (
        <View style={s.pain}>
          <Text style={[type.small, { color: color.over, fontWeight: '700' }]}>Pain flagged. Stop or go lighter; it’ll be shown next time.</Text>
          <PainNote value={e.painNote ?? ''} onSave={(note) => props.onPain(true, note || null)} />
        </View>
      )}
      {!tipsDismissed && e.tips?.map((t) => (
        <Text key={t.kind} style={[s.tip, t.kind === 'pain' && { color: color.over }]}>
          {t.kind === 'checkup' ? '🩺 ' : t.kind === 'pain' ? '⚠ ' : t.kind === 'stalled' ? '📉 ' : '💡 '}
          {t.text}
        </Text>
      ))}
      {!tipsDismissed && Boolean(e.tips?.length) && (
        <View style={s.tipActions}>
          {e.tips!.some((t) => t.kind === 'stalled' || t.kind === 'pain') && (
            <Pressable onPress={props.onSwap} style={s.tipButton}><Text style={s.tipButtonText}>See swaps</Text></Pressable>
          )}
          <Pressable onPress={() => setTipsDismissed(true)} style={s.tipButton}><Text style={s.tipButtonText}>Got it</Text></Pressable>
          {e.tips!.some((t) => t.kind !== 'pain') && (
            <Pressable onPress={props.onHideTips} style={s.tipButton}><Text style={[s.tipButtonText, { color: color.ironSoft }]}>Hide tips for this exercise</Text></Pressable>
          )}
        </View>
      )}

      <View style={s.setHead}>
        <Text style={[s.colSet, s.th]}>Set</Text>
        <Text style={[s.colPrev, s.th]}>Last time</Text>
        {kind === 'time' ? (
          <Text style={[s.colWide, s.th]}>Seconds</Text>
        ) : (
          <>
            <Text style={[s.colNum, s.th]}>{kind === 'bodyweight' ? `+${units.unit}` : units.unit}</Text>
            <Text style={[s.colNum, s.th]}>Reps</Text>
            <Text style={[s.colRpe, s.th]}>RPE</Text>
          </>
        )}
        <Text style={[s.colDone, s.th]}>✓</Text>
      </View>

      {e.sets.map((set, k) => {
        const prev = e.previous[k];
        const ph = placeholderFor(e, k);
        const prevText = !prev
          ? '—'
          : kind === 'time'
            ? `${prev.seconds ?? 0} s`
            : `${prev.weightKg ? `${units.show(prev.weightKg)} × ` : ''}${prev.reps ?? 0}`;
        // Working sets are numbered; warm-ups show W and drop sets D.
        const n = e.sets.slice(0, k + 1).filter((x) => !x.warmup && !x.drop).length;
        const label = set.warmup ? 'W' : set.drop ? 'D' : String(n);
        const what = set.warmup ? 'Warm-up set' : set.drop ? 'Drop set' : `Set ${n}`;
        const then = nextSetKind(set, k === 0);
        const thenWhat = then.warmup ? 'a warm-up' : then.drop ? 'a drop set' : 'a working set';
        return (
          <View key={k} style={[s.setRow, set.done && s.setDone]}>
            <Pressable style={s.colSet} onPress={() => { haptic.tap(); props.onSet(k, then); }} accessibilityLabel={`${what}. Tap to make it ${thenWhat}`}>
              <Text style={[s.setNo, set.warmup && { color: color.carbs }, set.drop && { color: color.over }]}>{label}</Text>
            </Pressable>
            <Text style={[s.colPrev, type.small, type.number]} numberOfLines={1}>{prevText}</Text>
            {kind === 'time' ? (
              <NumberField
                label={`Set ${k + 1} seconds`}
                value={set.seconds === null ? '' : String(set.seconds)}
                placeholder={ph.seconds ? String(ph.seconds) : '0'}
                decimal={false}
                onCommit={(t) => props.onSet(k, { seconds: t.trim() ? Math.min(86400, Math.max(0, Math.round(Number(t)) || 0)) : null })}
                style={[s.cell, s.colWide]}
              />
            ) : (
              <>
                <NumberField
                  label={`Set ${k + 1} weight in ${units.unit}`}
                  value={units.show(set.weightKg)}
                  placeholder={ph.weightKg ? units.show(ph.weightKg) : kind === 'bodyweight' ? '0' : ''}
                  onCommit={(t) => props.onSet(k, { weightKg: units.read(t) })}
                  style={[s.cell, s.colNum]}
                />
                <NumberField
                  label={`Set ${k + 1} reps`}
                  value={set.reps === null ? '' : String(set.reps)}
                  placeholder={ph.reps ? String(ph.reps) : ''}
                  decimal={false}
                  onCommit={(t) => props.onSet(k, { reps: t.trim() ? Math.min(1000, Math.max(0, Math.round(Number(t)) || 0)) : null })}
                  style={[s.cell, s.colNum]}
                />
                <NumberField
                  label={`Set ${k + 1} RPE`}
                  value={set.rpe === null ? '' : String(set.rpe)}
                  placeholder="–"
                  onCommit={(t) => {
                    const v = Number(t.replace(',', '.'));
                    props.onSet(k, { rpe: t.trim() && v >= 1 && v <= 10 ? Math.round(v * 2) / 2 : null });
                  }}
                  style={[s.cell, s.colRpe]}
                />
              </>
            )}
            <Pressable onPress={() => props.onToggle(k)} style={[s.colDone, s.check, set.done && s.checkOn]} accessibilityRole="checkbox" accessibilityState={{ checked: set.done }} accessibilityLabel={`Set ${k + 1} done`}>
              <Text style={[s.checkText, set.done && { color: color.card }]}>✓</Text>
            </Pressable>
          </View>
        );
      })}
      {(() => {
        // A big jump over last time's top set gets a heads-up (once per card).
        const top = e.sets.find((x) => !x.warmup && x.weightKg !== null && bigJump(x.weightKg, e.previous, units.unit));
        const msg = top ? bigJump(top.weightKg, e.previous, units.unit) : null;
        return msg ? <Text style={s.tip}>💡 {msg}</Text> : null;
      })()}

      <View style={s.cardFoot}>
        <Pressable onPress={props.onAddSet} hitSlop={6}><Text style={s.addText}>+ Add set</Text></Pressable>
        {e.exercise.kind === 'weight' && (
          <Pressable onPress={props.onWarmupSets} hitSlop={6} accessibilityLabel={`Add warm-up sets for ${e.exercise.name}`}><Text style={s.addText}>Warm-up sets</Text></Pressable>
        )}
        {e.exercise.kind === 'weight' && usesPlates(e.exercise) && (
          <Pressable onPress={props.onPlates} hitSlop={6} accessibilityLabel={`What to load on the bar for ${e.exercise.name}`}><Text style={s.addText}>Plates</Text></Pressable>
        )}
        {e.sets.length > 0 && (
          <Pressable onPress={props.onRemoveSet} hitSlop={6}><Text style={[s.addText, { color: color.ironSoft }]}>− Remove</Text></Pressable>
        )}
      </View>
    </View>
  );
}

/** A short note on where it hurt; saved when you leave the box. */
function PainNote({ value, onSave }: { value: string; onSave: (note: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={() => text.trim() !== value && onSave(text.trim())}
      placeholder="Where, and what it felt like (optional)"
      style={s.painInput}
      maxLength={300}
    />
  );
}


/** The muscles a workout works, main ones first. */
const trained = (w: Workout) => [...new Set(w.exercises.map((e) => e.exercise.muscle))].filter((m) => m !== 'full body').slice(0, 5);


const s = StyleSheet.create({
  warmup: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start', backgroundColor: color.card, borderRadius: 14, padding: space(4) },
  coolDown: { flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: color.card, borderRadius: 14, padding: space(4) },
  howToButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: space(1) },
  tipActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  tipButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space(3), borderRadius: 18, borderWidth: 1, borderColor: color.line },
  tipButtonText: { color: color.accent, fontWeight: '700', fontSize: 14 },
  screen: { flex: 1, backgroundColor: color.chalk },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(3), gap: space(3) },
  content: { padding: space(3), paddingBottom: space(24), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  finish: { backgroundColor: color.fat, borderRadius: 8, paddingHorizontal: space(3), paddingVertical: space(2) },
  finishText: { color: color.card, fontWeight: '800', fontSize: 15 },
  error: { ...type.body, color: color.over },
  hint: { ...type.small, color: color.over, textAlign: 'center' },
  card: { backgroundColor: color.card, borderRadius: 14, padding: space(3), gap: space(1) },
  grouped: { borderLeftWidth: 4, borderLeftColor: color.accent },
  groupedNext: { marginTop: -space(2), borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  groupTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: color.accent, borderRadius: 999, paddingHorizontal: space(2), paddingVertical: 2, marginBottom: space(1) },
  groupTagText: { color: color.onAccent, fontSize: 12, fontWeight: '800' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2), marginBottom: space(1) },
  dots: { fontSize: 24, color: color.ironSoft, paddingHorizontal: space(1), lineHeight: 26 },
  menu: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space(4), rowGap: space(2), paddingVertical: space(2), borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.line, marginBottom: space(1) },
  menuItem: { color: color.protein, fontWeight: '600', fontSize: 15 },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: space(1), paddingVertical: space(1) },
  th: { ...type.small, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: space(1), paddingVertical: 3, borderRadius: 8 },
  setDone: { backgroundColor: color.successBg },
  colSet: { width: 30, alignItems: 'center' },
  colPrev: { flex: 1.3, textAlign: 'center' },
  colNum: { flex: 1 },
  colRpe: { width: 44 },
  colWide: { flex: 2 },
  colDone: { width: 40 },
  setNo: { ...type.body, fontWeight: '700' },
  cell: { ...type.body, ...type.number, textAlign: 'center', backgroundColor: color.chalk, borderRadius: 8, paddingVertical: space(2), paddingHorizontal: 2, minWidth: 0 },
  check: { height: 36, borderRadius: 8, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center', backgroundColor: color.card },
  checkOn: { backgroundColor: color.fat, borderColor: color.fat },
  checkText: { fontSize: 18, fontWeight: '800', color: color.ironSoft },
  tip: { ...type.small, color: color.warnText, backgroundColor: color.warnBg, borderRadius: 8, padding: space(2), marginBottom: space(1) },
  pain: { backgroundColor: color.dangerBg, borderRadius: 8, padding: space(2), gap: space(1), marginBottom: space(1) },
  painInput: { ...type.small, backgroundColor: color.card, borderRadius: 6, padding: space(2) },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space(2) },
  addText: { color: color.protein, fontWeight: '700', fontSize: 15 },
  addExercise: { borderWidth: 1, borderStyle: 'dashed', borderColor: color.line, borderRadius: 14, padding: space(4), alignItems: 'center', backgroundColor: color.card },
  rest: { position: 'absolute', left: space(3), right: space(3), bottom: space(3), backgroundColor: color.iron, borderRadius: 14, padding: space(3), overflow: 'hidden', maxWidth: 616, alignSelf: 'center' },
  restFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.restFill },
  restText: { color: color.chalk, fontWeight: '800', fontSize: 18, fontVariant: ['tabular-nums'] },
  restButtons: { flexDirection: 'row', gap: space(5), marginTop: space(2) },
  restButton: { color: color.chalk, fontWeight: '700', fontSize: 15 },
  stats: { flexDirection: 'row', backgroundColor: color.card, borderRadius: 14, padding: space(4), gap: space(3) },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center' },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
});
