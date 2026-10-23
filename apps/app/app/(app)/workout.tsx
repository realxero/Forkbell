import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { bigJump, type Exercise, type PersonalRecord, type SetEntry, type Workout, type WorkoutExercise } from '@forkbell/shared';
import { TextInput } from 'react-native';
import { api } from '../../lib/api';
import { cachedGet } from '../../lib/sync';
import { discardWorkout, finishWorkout, saveWorkout, type FinishSummary } from '../../lib/actions';
import { confirm } from '../../lib/confirm';
import { formatDuration, useUnit } from '../../lib/units';
import { ExercisePicker } from '../../components/ExercisePicker';
import { NumberField } from '../../components/NumberField';
import { color, space, type } from '../../lib/theme';

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
  const [menu, setMenu] = useState<number | null>(null);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

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
      Vibration.vibrate(500);
      const t = setTimeout(() => setRestEnd(null), 4000);
      return () => clearTimeout(t);
    }
  }, [restEnd, restLeft]);

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
    if (!w!.finishedAt && e.restSeconds > 0) {
      setRestTotal(e.restSeconds);
      setRestEnd(Date.now() + e.restSeconds * 1000);
    }
  };

  const addExercise = async (ex: Exercise) => {
    setPicker(false);
    if (swapIndex !== null) {
      // Swap in place: same sets and targets, the new exercise's own history.
      const i = swapIndex;
      setSwapIndex(null);
      let previous: SetEntry[] = [];
      try {
        previous = (await api<{ sessions: { sets: SetEntry[] }[] }>(`/api/exercises/${ex.id}`)).sessions[0]?.sets ?? [];
      } catch {
        /* not essential */
      }
      return updateExercise(i, (x) => ({ ...x, exercise: ex, restSeconds: ex.restSeconds, previous, tips: [], pain: false, painNote: null, sets: x.sets.map((s) => ({ ...s, weightKg: null, done: false })) }));
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
      return { ...w, exercises: list };
    });

  const finish = async () => {
    const left = w!.exercises.flatMap((e) => e.sets).filter((s) => !s.done).length;
    if (left && !(await confirm('Finish workout?', `${left} unticked ${left === 1 ? 'set' : 'sets'} will be left out.`, 'Finish'))) return;
    setFinishing(true);
    try {
      await flush();
      const r = await finishWorkout(latest.current ?? w!);
      if (r.discarded) return router.back();
      setRestEnd(null);
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
    await discardWorkout(w!).catch(() => {});
    router.back();
  };

  if (summary && w) return <SummaryView w={w} summary={summary} />;
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
              onRest={(by) => updateExercise(i, (x) => ({ ...x, restSeconds: Math.min(900, Math.max(0, x.restSeconds + by)) }))}
              onMove={(by) => {
                setMenu(null);
                move(i, by);
              }}
              onRemove={() => {
                setMenu(null);
                update((w) => ({ ...w, exercises: w.exercises.filter((_, j) => j !== i) }));
              }}
              onSwap={() => {
                setMenu(null);
                setSwapIndex(i);
                setPicker(true);
              }}
              onPain={(pain, painNote) => updateExercise(i, (x) => ({ ...x, pain, painNote }))}
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
      </KeyboardAvoidingView>
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
  onRest: (by: number) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
  onSwap: () => void;
  onPain: (pain: boolean, note: string | null) => void;
}) {
  const { e, units } = props;
  const kind = e.exercise.kind;
  const target = e.repMin ? (e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}–${e.repMax}`) : null;
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/exercise', params: { id: e.exercise.id } })}>
          <Text style={[type.title, { fontSize: 18 }]}>{e.exercise.name}</Text>
          <Text style={type.small}>
            {e.targetSets && target && kind !== 'time' ? `${e.targetSets} × ${target} reps · ` : ''}
            rest {formatDuration(e.restSeconds)}
          </Text>
        </Pressable>
        <Pressable onPress={props.onMenu} hitSlop={10} accessibilityLabel={`Options for ${e.exercise.name}`}>
          <Text style={s.dots}>⋯</Text>
        </Pressable>
      </View>
      {props.menuOpen && (
        <View style={s.menu}>
          <Pressable onPress={() => props.onRest(-15)}><Text style={s.menuItem}>Rest −15 s</Text></Pressable>
          <Pressable onPress={() => props.onRest(15)}><Text style={s.menuItem}>Rest +15 s</Text></Pressable>
          <Pressable onPress={() => props.onMove(-1)}><Text style={s.menuItem}>Move up</Text></Pressable>
          <Pressable onPress={() => props.onMove(1)}><Text style={s.menuItem}>Move down</Text></Pressable>
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
      {e.tips?.map((t) => (
        <Text key={t.kind} style={[s.tip, t.kind === 'pain' && { color: color.over }]}>
          {t.kind === 'checkup' ? '🩺 ' : t.kind === 'pain' ? '⚠ ' : '💡 '}
          {t.text}
        </Text>
      ))}

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
        const n = e.sets.slice(0, k + 1).filter((x) => !x.warmup).length;
        return (
          <View key={k} style={[s.setRow, set.done && s.setDone]}>
            <Pressable style={s.colSet} onPress={() => props.onSet(k, { warmup: !set.warmup })} accessibilityLabel={set.warmup ? 'Warm-up set. Tap to make it a working set' : 'Tap to mark as a warm-up'}>
              <Text style={[s.setNo, set.warmup && { color: color.carbs }]}>{set.warmup ? 'W' : n}</Text>
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
        {e.sets.length > 0 && (
          <Pressable onPress={props.onRemoveSet} hitSlop={6}><Text style={[s.addText, { color: color.ironSoft }]}>− Remove set</Text></Pressable>
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

const RECORD_NAMES: Record<PersonalRecord['kind'], string> = {
  weight: 'Heaviest weight',
  e1rm: 'Best estimated 1-rep max',
  reps: 'Most reps',
  volume: 'Best set (weight × reps)',
  time: 'Longest time',
};

function SummaryView({ w, summary }: { w: Workout; summary: Summary }) {
  const units = useUnit();
  const recordValue = (r: PersonalRecord) =>
    r.kind === 'reps'
      ? `${r.value} reps`
      : r.kind === 'time'
        ? `${r.value} s`
        : r.kind === 'volume'
          ? `${units.show(r.weightKg)} × ${r.reps}`
          : r.kind === 'e1rm'
            ? `about ${units.roundLabel(r.value)} (${units.show(r.weightKg)} × ${r.reps})`
            : units.label(r.value);
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={[s.content, { gap: space(4) }]}>
        <Text style={[type.hero, { fontSize: 34 }]}>Nice work.</Text>
        <Text style={type.body}>{w.name} is saved.</Text>
        <View style={s.stats}>
          <Stat label="Time" value={formatDuration(summary.durationSeconds)} />
          <Stat label="Sets" value={String(summary.sets)} />
          <Stat label="Volume" value={units.label(summary.volumeKg) || '0'} />
        </View>
        {summary.records.length > 0 ? (
          <View style={s.card}>
            <Text style={type.title}>New personal records</Text>
            {summary.records.map((r, i) => (
              <View key={i} style={{ paddingVertical: space(2), borderTopWidth: i ? 1 : 0, borderTopColor: color.line }}>
                <Text style={[type.body, { fontWeight: '700' }]}>{r.exerciseName}</Text>
                <Text style={type.small}>
                  {RECORD_NAMES[r.kind]}: {recordValue(r)}
                </Text>
              </View>
            ))}
          </View>
        ) : summary.offline ? (
          <Text style={type.small}>Saved on this device. Records are checked once it syncs.</Text>
        ) : (
          <Text style={type.small}>No new records this time. Showing up is how they happen.</Text>
        )}
        <Pressable onPress={() => router.back()} style={s.button}>
          <Text style={s.buttonText}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: space(1) }}>
      <Text style={[type.title, type.number]}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(3), gap: space(3) },
  content: { padding: space(3), paddingBottom: space(24), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  finish: { backgroundColor: color.fat, borderRadius: 8, paddingHorizontal: space(3), paddingVertical: space(2) },
  finishText: { color: color.card, fontWeight: '800', fontSize: 15 },
  error: { ...type.body, color: color.over },
  hint: { ...type.small, color: color.over, textAlign: 'center' },
  card: { backgroundColor: color.card, borderRadius: 14, padding: space(3), gap: space(1) },
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
