import { ReadinessCard } from '../../../components/ReadinessCard';
import { BodyMap } from '../../../components/BodyMap';
import Svg, { Circle, Polyline } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, Modal, type ScrollViewInstance } from 'react-native';
import { Pressable } from '../../../components/Tap';
import { TitleWithInfo } from '../../../components/Info';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDays, todayLocal, type Activity, type EnergyEstimate, type GoalPlan, type Milestone, type Streaks, type TrendPoint } from '@forkbell/shared';
import { put } from '../../../lib/api';
import { cachedGet, readCache, send, writeCache } from '../../../lib/sync';
import { useAdvanced, useWide } from '../../../lib/layout';
import { saveWeighIn } from '../../../lib/actions';
import { useAuth } from '../../../lib/auth';
import { useUnit } from '../../../lib/units';
import { problem } from '../../../lib/problem';
import { showToast } from '../../../lib/toast';
import { Chip } from '../../../components/AmountPicker';
import { MonthCalendar } from '../../../components/MonthCalendar';
import { SheetFrame } from '../../../components/Sheet';
import { KeyboardLift } from '../../../components/KeyboardLift';
import { CalorieBars, LogMonth, MacroDonut, WeightChart, type DayTotals } from '../../../components/Charts';
import { WellbeingCard } from '../../../components/WellbeingCard';
import { RecapTable, useRecap } from '../../../components/RecapCard';
import { PatternsCard } from '../../../components/PatternsCard';
import { FoodCheckInCard } from '../../../components/CheckInCards';
import type { FoodCheckIn } from '@forkbell/shared';
import { HealthCard } from '../../../components/HealthCard';
import { ProgressPhotosCard } from '../../../components/ProgressPhotos';
import { useViewing } from '../../../lib/profile';
import { color, radius, space, type, textSize } from '../../../lib/theme';
import { SkeletonCards } from '../../../components/Skeleton';
import { buttons } from '../../../lib/buttons';
import { QUICK_BELL_ROOM } from '../../../components/QuickBell';

type Progress = {
  today: string;
  checkIn?: FoodCheckIn;
  days?: DayTotals[];
  activity?: Activity;
  weighIns: (TrendPoint & { bodyFat: number | null })[];
  energy: EnergyEstimate;
  calorieGoal: number | null;
  goal: { weightKg: number | null; date: string | null; weeklyWorkoutGoal: number; plan: GoalPlan | null };
  streaks: Streaks;
  milestones: Milestone[];
  measurements: { kind: string; custom: boolean; unit: string; latest: { date: string; value: number } | null; first: { date: string; value: number } | null; history?: { date: string; value: number }[] }[];
};
type GoalBody = { goalWeightKg: number | null; goalDate: string | null; weeklyWorkoutGoal: number };
/** Saves something and resolves to null, or to plain words saying why it didn't save. */
type Submit<T> = (value: T) => Promise<string | null>;

const CM_PER_IN = 2.54;
const RANGES = [
  { label: '1 month', days: 31 },
  { label: '3 months', days: 92 },
  { label: 'Year', days: 366 },
];
const longDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: y === Number(todayLocal().slice(0, 4)) ? undefined : 'numeric' });
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** A number typed by hand, with a comma or a point; null when it isn't one. */
const readNumber = (t: string) => {
  const v = Number(t.trim().replace(',', '.'));
  return t.trim() && Number.isFinite(v) && v >= 0 ? v : null;
};

/** Where the weight goal stands, in a few words for the summary. */
function goalShort(p: Progress, label: (kg: number | null) => string) {
  const plan = p.goal.plan;
  if (!p.goal.weightKg) return 'Not set';
  if (plan?.reached) return 'At your goal';
  if (plan?.pace === 'toward' && plan.estimate) return `${longDate(plan.estimate.from)} – ${longDate(plan.estimate.to)}`;
  if (plan?.pace === 'flat') return 'Holding steady';
  if (plan?.pace === 'away') return 'Trend moving away';
  return label(p.goal.weightKg);
}

export default function ProgressScreen() {
  const units = useUnit();
  const viewing = useViewing();
  // Wide screens: three columns, and Simple (the headline cards) or Advanced (everything).
  // Phones always show everything, one column, as before.
  const wide = useWide();
  const [advanced, setAdvanced] = useAdvanced();
  const full = !wide || advanced;
  const { me, refreshMe } = useAuth();
  const [p, setP] = useState<Progress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState(92);
  const [weight, setWeight] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const goalY = useRef(0);
  const recap = useRecap();

  // Only the latest load counts: a slow answer for someone you were viewing a moment
  // ago must not fill in their chart, or their weight in your weigh-in box.
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const mine = ++loadId.current;
    try {
      const data = await cachedGet<Progress>(`/api/progress?today=${todayLocal()}`);
      if (mine !== loadId.current) return;
      setP(data);
      const todays = data.weighIns.find((w) => w.date === data.today);
      setWeight(todays ? units.show(todays.weightKg) : '');
      setLoadError(null);
    } catch (e) {
      if (mine === loadId.current) setLoadError(problem(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.unit, viewing]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /**
   * Run a change, reload, and say how it went at the bottom of the screen
   * (where you are, not the top of a long page). A failure offers Try again.
   */
  const act = async (what: string, fn: () => Promise<unknown>, done?: { text: string; undo?: () => Promise<unknown> }) => {
    try {
      await fn();
      await load();
      if (done) showToast(done.text, done.undo ? { action: { label: 'Undo', run: async () => { await done.undo!(); await load(); } } } : {});
    } catch (e) {
      showToast(`Couldn’t ${what}. ${problem(e)}`, { action: { label: 'Try again', run: () => act(what, fn, done) } });
    }
  };
  const putGoal = (body: GoalBody) => send('PUT', '/api/progress/goal', body, { label: 'Goal', coalesceKey: 'goal' });
  const goalBody = (p: Progress): GoalBody => ({ goalWeightKg: p.goal.weightKg, goalDate: p.goal.date, weeklyWorkoutGoal: p.goal.weeklyWorkoutGoal });

  /** For the goal sheet: it stays open until this resolves, and shows the error itself. */
  const submitGoal: Submit<GoalBody> = async (body) => {
    if (!p) return null;
    const before = goalBody(p);
    try {
      await putGoal(body);
      await load();
      showToast(body.goalWeightKg === null ? 'Goal cleared' : 'Goal saved', { action: { label: 'Undo', run: async () => { await putGoal(before); await load(); } } });
      return null;
    } catch (e) {
      return problem(e);
    }
  };
  const submitMeasurement: Submit<{ kind: string; value: number; unit: string }> = async ({ kind, value, unit }) => {
    try {
      await send('PUT', '/api/progress/measurements', { date: todayLocal(), kind, value, unit }, { label: `${kind} measurement`, coalesceKey: `measure:${todayLocal()}:${kind}` });
      await load();
      showToast(`${cap(kind)} saved`);
      return null;
    } catch (e) {
      return problem(e);
    }
  };

  const shown = useMemo(() => (p ? p.weighIns.filter((w) => w.date >= addDays(p.today, -range)) : []), [p, range]);
  const latest = p?.weighIns.at(-1) ?? null;
  const weekAgo = p && latest ? [...p.weighIns].reverse().find((w) => w.date <= addDays(latest.date, -7)) : null;
  const signed = (kg: number) => `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${units.show(Math.abs(kg))} ${units.unit}`;
  const typed = units.read(weight);
  const toGoalCard = () => scroll.current?.scrollTo({ y: Math.max(0, goalY.current - space(4)), animated: true });

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[s.content, wide && s.contentWide]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // Keeps a field you're typing in (weigh-in, a measurement) above the keyboard on iPhone.
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={s.titleRow}>
          <Text style={[type.pageTitle, { flex: 1 }]}>Progress</Text>
          {wide && (
            <View style={{ flexDirection: 'row', gap: space(2) }} accessibilityRole="radiogroup" accessibilityLabel="Detail">
              <Chip label="Simple" on={!advanced} onPress={() => setAdvanced(false)} />
              <Chip label="Advanced" on={advanced} onPress={() => setAdvanced(true)} />
            </View>
          )}
        </View>
        {loadError && (
          <View style={s.problem} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={22} color={color.over} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, { fontWeight: '700' }]}>Couldn’t load your progress</Text>
              <Text style={type.small}>{loadError}</Text>
            </View>
            <Pressable onPress={() => void load()} style={s.retry}>
              <Text style={buttons.smallText}>Try again</Text>
            </Pressable>
          </View>
        )}
        {!p && !loadError && <SkeletonCards count={4} />}

        {p && (
          <>
            {viewing && <Text style={type.small}>{viewing.name}’s progress, read-only.</Text>}

            {/* The progress picture at a glance: trend, this week, goal, burn. Today's weigh-in lives here too. */}
            <View style={s.card}>
              <View style={s.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <TitleWithInfo title="Trend weight" style={type.label}>
                    Weigh in at the same time each day. The trend smooths out day-to-day water swings, so it moves more slowly than the scale and is the number to watch.
                  </TitleWithInfo>
                  {latest ? (
                    <Text style={[type.pageTitle, type.number]} accessibilityLabel={`Trend weight ${units.label(latest.trendKg)}`}>
                      {units.show(latest.trendKg)}
                      <Text style={[type.body, { fontWeight: '700' }]}> {units.unit}</Text>
                    </Text>
                  ) : (
                    <Text style={type.body}>Weigh in to start your trend.</Text>
                  )}
                </View>
                {latest && weekAgo && (
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Text style={type.label}>This week</Text>
                    <Text style={[s.stat, type.number]}>{signed(latest.trendKg - weekAgo.trendKg)}</Text>
                  </View>
                )}
              </View>
              <View style={s.stats}>
                <Pressable
                  onPress={viewing ? undefined : p.goal.weightKg ? toGoalCard : () => setEditingGoal(true)}
                  style={s.tile}
                  accessibilityHint={viewing ? undefined : p.goal.weightKg ? 'Shows the goal and how it’s worked out' : 'Opens the goal to set one'}
                >
                  <Text style={type.label}>Goal</Text>
                  <Text style={[type.body, type.number, { fontWeight: '800' }, !p.goal.weightKg && !viewing && { color: color.accent }]}>
                    {!p.goal.weightKg && !viewing ? 'Set a goal' : goalShort(p, units.label)}
                  </Text>
                </Pressable>
                <Pressable onPress={toGoalCard} style={s.tile} accessibilityHint="Shows how your burn is worked out">
                  <Text style={type.label}>Daily burn</Text>
                  {p.energy.kcal !== null ? (
                    <Text style={[type.body, type.number, { fontWeight: '800' }]}>{p.energy.kcal.toLocaleString()} kcal</Text>
                  ) : (
                    <>
                      <Text style={[type.body, { fontWeight: '800' }]}>Not yet</Text>
                      {p.energy.needs && <Text style={type.small}>{p.energy.needs}</Text>}
                    </>
                  )}
                </Pressable>
              </View>
              {!viewing && (
                <View style={[s.row, { marginTop: space(1) }]}>
                  <TextInput
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                    placeholder="Today’s weight"
                    placeholderTextColor={color.placeholder}
                    style={[s.input, { flex: 1 }]}
                    accessibilityLabel={`Today's weight in ${units.unit}`}
                  />
                  <Text style={type.body}>{units.unit}</Text>
                  <Pressable
                    disabled={typed === null}
                    onPress={() => act('save your weight', () => saveWeighIn(todayLocal(), typed!), { text: `Weight saved: ${units.label(typed!)}` })}
                    style={[s.small, typed === null && { opacity: 0.4 }]}
                    accessibilityState={{ disabled: typed === null }}
                  >
                    <Text style={s.smallText}>Save</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {p.checkIn && <FoodCheckInCard checkIn={p.checkIn} unit={units.unit} onChanged={load} />}

            <View style={wide ? s.columns : s.stack}>
            <View style={[s.stack, wide && s.col]}>
            <Text style={s.heading} accessibilityRole="header">Weight and goal</Text>
            {p.weighIns.length > 0 && (
              <View style={s.card}>
                <View style={s.chips}>
                  {RANGES.map((r) => <Chip key={r.days} label={r.label} on={range === r.days} onPress={() => setRange(r.days)} />)}
                </View>
                <WeightChart points={shown} goalKg={p.goal.weightKg} show={(kg) => units.label(kg)} />
              </View>
            )}

            <View onLayout={(e) => (goalY.current = e.nativeEvent.layout.y)}>
              <GoalAndBurnCard
                p={p}
                units={units}
                signed={signed}
                onEdit={viewing ? undefined : () => setEditingGoal(true)}
                onUseKcal={
                  viewing
                    ? undefined
                    : (kcal) => {
                        const goals = me?.goals ?? { protein: null, carbs: null, fat: null, kcal: null };
                        act(
                          'update your calorie goal',
                          async () => {
                            await put('/api/me/goals', { ...goals, kcal });
                            await refreshMe();
                          },
                          { text: `Calorie goal set to ${kcal.toLocaleString()}`, undo: async () => { await put('/api/me/goals', goals); await refreshMe(); } },
                        );
                      }
                }
              />
            </View>

            {full && <MeasurementsCard p={p} units={units} onSave={submitMeasurement} />}

            {/* Progress photos: only ever yours, so not shown when viewing someone */}
            {full && !viewing && <ProgressPhotosCard weighIns={p.weighIns} />}
            </View>

            <View style={[s.stack, wide && s.col]}>

            {/* Calories and macros, day by day */}
            {p.days && (
              <>
                <Text style={s.heading} accessibilityRole="header">Food</Text>
                <View style={s.card}>
                  <Text style={type.title}>Calories, last 2 weeks</Text>
                  <CalorieBars days={p.days.slice(-14)} today={p.today} />
                </View>
                {full && (
                  <View style={s.card}>
                    <Text style={type.title}>Where your calories come from</Text>
                    <Text style={type.small}>Last 7 days</Text>
                    <MacroDonut days={p.days.slice(-7)} />
                  </View>
                )}
                <View style={s.card}>
                  <Text style={type.title}>Days logged</Text>
                  <LogMonth days={p.days} today={p.today} goal={p.calorieGoal ?? null} onOpenDay={viewing ? undefined : (d) => router.push({ pathname: '/', params: { date: d } })} />
                  <View style={s.legend}>
                    <Key fill={color.iron} label="Logged" />
                    <Key fill={color.over} label="Over your goal" />
                    <Key fill={color.track} label="Nothing logged" />
                  </View>
                  <View style={[s.iconLine, s.divided]}>
                    <Ionicons name="flame-outline" size={20} color={color.iron} />
                    <Text style={[type.body, type.number, { flex: 1 }]}>
                      {p.streaks.foodDays} {p.streaks.foodDays === 1 ? 'day' : 'days'} of logging in a row
                      <Text style={type.small}> · best {p.streaks.bestFoodDays}</Text>
                    </Text>
                  </View>
                </View>
              </>
            )}

            </View>

            <View style={[s.stack, wide && s.col]}>
            <Text style={s.heading} accessibilityRole="header">Training</Text>
            <WorkoutsCard
              streaks={p.streaks}
              weekly={p.goal.weeklyWorkoutGoal}
              onChange={viewing ? undefined : (n) => act('save your weekly goal', () => putGoal({ ...goalBody(p), weeklyWorkoutGoal: n }))}
            />
            {full && <BodyMap />}

            {(full || (!viewing && p.activity?.readiness) || Boolean(p.activity?.metrics?.length)) && <Text style={s.heading} accessibilityRole="header">Recovery and wellbeing</Text>}
            {/* Everything from Apple Health / Health Connect */}
            {!viewing && p.activity?.readiness && <ReadinessCard r={p.activity.readiness} />}
            {p.activity?.source && p.activity.metrics && p.activity.metrics.length > 0 && (
              <HealthCard metrics={p.activity.metrics} source={p.activity.source} unit={units.unit} today={p.today} />
            )}

            {full && <WellbeingCard healthSleepMin={p.activity?.metrics?.find((m) => m.kind === 'sleep_min' && m.latestDate === p.today)?.latest ?? null} />}

            <Text style={s.heading} accessibilityRole="header">Looking back</Text>
            <ThisMonthCard list={p.milestones} recap={recap} unit={units.unit} />
            {full && <PatternsCard />}
            </View>
            </View>
          </>
        )}
      </ScrollView>

      {p && (
        <Modal visible={editingGoal} transparent animationType="slide" onRequestClose={() => setEditingGoal(false)}>
          <GoalSheet p={p} units={units} onClose={() => setEditingGoal(false)} onSave={submitGoal} />
        </Modal>
      )}
    </SafeAreaView>
  );
}

type Units = ReturnType<typeof useUnit>;

function Key({ fill, label }: { fill: string; label: string }) {
  return (
    <View style={s.key}>
      <View style={[s.swatch, { backgroundColor: fill }]} />
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

/** This week's workouts against your weekly goal, the week streak, and the goal itself. */
function WorkoutsCard({ streaks, weekly, onChange }: { streaks: Streaks; weekly: number; onChange?: (n: number) => void }) {
  // Show the new goal straight away; save once the taps stop, so 3 → 6 is one save.
  const [goal, setGoal] = useState(weekly);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) setGoal(weekly);
  }, [weekly]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const set = (n: number) => {
    setGoal(n);
    pending.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = false;
      onChange?.(n);
    }, 600);
  };
  const done = streaks.workoutsThisWeek;
  return (
    <View style={s.card}>
      <Text style={type.title}>Workouts this week</Text>
      <Text style={[type.pageTitle, type.number]} accessibilityLabel={`${done} of ${goal} workouts this week`}>
        {done}
        <Text style={[type.body, { fontWeight: '700', color: color.ironSoft }]}> of {goal}</Text>
      </Text>
      <View style={s.segments} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Array.from({ length: goal }, (_, i) => (
          <View key={i} style={[s.segment, { backgroundColor: i < done ? color.accent : color.track }]} />
        ))}
      </View>
      <View style={s.iconLine}>
        <Ionicons name="barbell-outline" size={20} color={color.iron} />
        <Text style={[type.body, type.number, { flex: 1 }]}>
          {streaks.workoutWeeks} {streaks.workoutWeeks === 1 ? 'week' : 'weeks'} in a row with {weekly}+ workouts
          <Text style={type.small}> · best {streaks.bestWorkoutWeeks}</Text>
        </Text>
      </View>
      <Text style={type.small}>Rest days never break a streak; only the week as a whole counts.</Text>
      {onChange && (
        <View style={[s.row, { marginTop: space(1) }]}>
          <Text style={[type.body, { flex: 1 }]}>Weekly goal</Text>
          <Pressable onPress={() => set(Math.max(1, goal - 1))} disabled={goal <= 1} style={[s.step, goal <= 1 && { opacity: 0.4 }]} accessibilityLabel="Fewer workouts a week">
            <Ionicons name="remove" size={22} color={color.iron} />
          </Pressable>
          <Text style={[type.body, type.number, { minWidth: 28, textAlign: 'center', fontWeight: '700' }]} accessibilityLabel={`${goal} a week`}>{goal}</Text>
          <Pressable onPress={() => set(Math.min(14, goal + 1))} disabled={goal >= 14} style={[s.step, goal >= 14 && { opacity: 0.4 }]} accessibilityLabel="More workouts a week">
            <Ionicons name="add" size={22} color={color.iron} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * The weight goal and the daily burn, together: the burn is what the goal's
 * calorie suggestion comes from. The summary carries the headline numbers;
 * this card says how they're worked out.
 */
function GoalAndBurnCard({ p, units, signed, onEdit, onUseKcal }: { p: Progress; units: Units; signed: (kg: number) => string; onEdit?: () => void; onUseKcal?: (kcal: number) => void }) {
  const plan = p.goal.plan;
  const paceText =
    !plan || plan.reached
      ? null
      : plan.pace === 'toward' && plan.estimate
        ? `At your recent pace you’d get there between ${longDate(plan.estimate.from)} and ${longDate(plan.estimate.to)}.`
        : plan.pace === 'flat'
          ? 'Your trend is holding steady right now.'
          : plan.pace === 'away'
            ? 'Your trend is moving away from this goal right now.'
            : 'Keep weighing in and logging to get a date estimate.';
  const suggested = plan?.suggestedKcal && plan.suggestedKcal !== p.calorieGoal ? plan.suggestedKcal : null;

  return (
    <View style={s.card}>
      <View style={s.row}>
        <Text style={[type.title, { flex: 1 }]}>Goal and burn</Text>
        {onEdit && (
          <Pressable onPress={onEdit} hitSlop={10} style={s.linkHit} accessibilityLabel={p.goal.weightKg ? 'Edit goal' : 'Set a goal'}>
            <Text style={s.link}>{p.goal.weightKg ? 'Edit goal' : 'Set a goal'}</Text>
          </Pressable>
        )}
      </View>
      {p.goal.weightKg ? (
        <Text style={[type.heading, type.number]}>
          {units.label(p.goal.weightKg)}
          {p.goal.date ? ` by ${longDate(p.goal.date)}` : ''}
        </Text>
      ) : (
        <Text style={type.body}>No weight goal yet. Set one and Forkbell estimates when you’ll get there from your own trend.</Text>
      )}
      {plan?.reached && <Text style={[type.body, { color: color.iron, fontWeight: '700' }]}>You’re at your goal weight.</Text>}
      {plan && !plan.reached && <Text style={type.body}>{units.label(Math.abs(plan.remainingKg))} to go.</Text>}
      {p.goal.weightKg && paceText && <Text style={type.body}>{paceText}</Text>}
      {plan?.kcalForDate && <Text style={type.body}>To make {longDate(p.goal.date!)}, eat about {plan.kcalForDate.toLocaleString()} kcal a day.</Text>}
      {plan?.warnings.map((w) => <Text key={w} style={s.warning}>{w}</Text>)}

      <View style={[s.divided, { gap: space(2) }]}>
        <TitleWithInfo title="Your daily burn" style={type.heading}>
          {p.energy.kcal !== null
            ? `Worked out from what you logged and how your weight trend moved (${signed(p.energy.rateKgPerWeek!)} a week). It updates as you keep logging, and already includes your usual activity. To have hard exercise days add to your goal, see Settings → Goals and targets.`
            : 'Forkbell works out what you really burn from your own food logs and weigh-ins, with no formulas or guesses. It already includes your usual activity.'}
        </TitleWithInfo>
        {p.energy.kcal !== null ? (
          <Text style={type.body}>
            About <Text style={[type.number, { fontWeight: '800' }]}>{p.energy.kcal.toLocaleString()} kcal</Text> a day, from {p.energy.loggedDays} days of logging (confidence {p.energy.confidence}).
          </Text>
        ) : (
          <Text style={type.body}>
            Not enough data yet. {p.energy.needs} Then Forkbell works out what you really burn from your own numbers, no formulas or guesses.
          </Text>
        )}
        {onUseKcal && suggested && (
          <View style={s.suggest}>
            <Text style={type.body}>
              {plan!.reached ? 'To stay where you are' : `To move toward ${units.label(p.goal.weightKg)} at a steady pace`}, eat about{' '}
              <Text style={{ fontWeight: '800' }}>{suggested.toLocaleString()} kcal</Text> a day.
            </Text>
            <Pressable onPress={() => onUseKcal(suggested)} style={s.small}>
              <Text style={s.smallText}>Use as my calorie goal</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

/** Edit the weight goal. Stays open until the save goes through, so nothing typed is lost. */
function GoalSheet({ p, units, onClose, onSave }: { p: Progress; units: Units; onClose: () => void; onSave: Submit<GoalBody> }) {
  const [goal, setGoal] = useState(p.goal.weightKg ? units.show(p.goal.weightKg) : '');
  const [date, setDate] = useState<string | null>(p.goal.date);
  const [byDate, setByDate] = useState(Boolean(p.goal.date));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const kg = goal.trim() ? units.read(goal) : null;
  const bad = goal.trim() !== '' && kg === null;
  const today = todayLocal();

  const submit = async (body: GoalBody) => {
    setSaving(true);
    setFailed(null);
    const why = await onSave(body);
    setSaving(false);
    if (why) setFailed(why);
    else onClose();
  };
  const save = () => submit({ goalWeightKg: kg, goalDate: byDate ? date : null, weeklyWorkoutGoal: p.goal.weeklyWorkoutGoal });

  return (
    <KeyboardLift>
      <SheetFrame onClose={saving ? () => {} : onClose}>
        {/* Cancel and Save sit at the top, iPhone style, so the keyboard never covers them. */}
        <View style={s.row}>
          <Pressable onPress={onClose} disabled={saving} style={s.linkHit} hitSlop={10}>
            <Text style={[s.link, { color: color.ironSoft }]}>Cancel</Text>
          </Pressable>
          <Text style={[type.title, { flex: 1, textAlign: 'center' }]} accessibilityRole="header">Weight goal</Text>
          <Pressable onPress={save} disabled={bad || saving} style={[s.linkHit, (bad || saving) && { opacity: 0.4 }]} hitSlop={10} accessibilityState={{ disabled: bad || saving, busy: saving }}>
            <Text style={s.link}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: space(3) }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {failed && (
            <View style={s.problem} accessibilityLiveRegion="assertive">
              <Text style={[type.small, { flex: 1, color: color.iron }]}>Couldn’t save the goal. {failed}</Text>
            </View>
          )}
          <View style={{ gap: space(1) }}>
            <Text style={type.small}>Goal weight ({units.unit})</Text>
            <TextInput
              value={goal}
              onChangeText={setGoal}
              keyboardType="decimal-pad"
              placeholder="None"
              placeholderTextColor={color.placeholder}
              style={[s.input, bad && { borderColor: color.over }]}
              accessibilityLabel={`Goal weight in ${units.unit}`}
            />
            {bad && <Text style={s.fieldProblem}>Enter a number, like {units.show(p.weighIns.at(-1)?.trendKg ?? 80)}.</Text>}
          </View>
          <View style={s.chips}>
            <Chip label="No date" on={!byDate} onPress={() => setByDate(false)} />
            <Chip label="By a date" on={byDate} onPress={() => { setByDate(true); if (!date) setDate(addDays(today, 90)); }} />
          </View>
          {byDate && (
            <>
              <Text style={type.body}>{date ? `By ${longDate(date)}` : 'Pick a day'}</Text>
              <MonthCalendar value={date} onChange={setDate} min={addDays(today, 1)} max={addDays(today, 365 * 5)} />
            </>
          )}
          {p.goal.weightKg !== null && (
            <Pressable onPress={() => submit({ goalWeightKg: null, goalDate: null, weeklyWorkoutGoal: p.goal.weeklyWorkoutGoal })} disabled={saving} style={s.quiet}>
              <Text style={s.quietText}>Clear the goal</Text>
            </Pressable>
          )}
        </ScrollView>
      </SheetFrame>
    </KeyboardLift>
  );
}

/** This month next to last month, and the milestones reached along the way. */
function ThisMonthCard({ list, recap, unit }: { list: Milestone[]; recap: ReturnType<typeof useRecap>; unit: 'lb' | 'kg' }) {
  const [timeline, setTimeline] = useState(false);
  const reached = list.filter((m) => m.reached).sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
  const next = ['days', 'workouts', 'weight'].map((k) => list.find((m) => !m.reached && m.key.startsWith(k))).filter(Boolean) as Milestone[];
  if (!recap && !reached.length && !next.length) return null;
  return (
    <View style={s.card}>
      <View style={s.row}>
        <Text style={[type.title, { flex: 1 }]}>This month</Text>
        {reached.length > 0 && (
          <Pressable onPress={() => setTimeline(true)} hitSlop={10} style={s.linkHit}>
            <Text style={s.link}>Timeline</Text>
          </Pressable>
        )}
      </View>
      <TimelineSheet visible={timeline} reached={reached} next={list.filter((m) => !m.reached)} onClose={() => setTimeline(false)} />
      {recap && <RecapTable r={recap} unit={unit} />}
      {reached.length > 0 && <Text style={[type.label, recap && s.divided]}>Milestones</Text>}
      {reached.slice(0, 4).map((m) => (
        <View key={m.key} style={s.milestone}>
          <Ionicons name="checkmark-circle" size={20} color={color.iron} accessibilityLabel="Reached" />
          <View style={{ flex: 1 }}>
            <Text style={type.body}>{m.label}</Text>
            <Text style={type.small}>
              {m.date ? longDate(m.date) : ''}
              {m.detail ? ` · ${m.detail}` : ''}
            </Text>
          </View>
        </View>
      ))}
      {next.length > 0 && <Text style={[type.label, { marginTop: space(2) }]}>Next up</Text>}
      {next.map((m) => (
        <View key={m.key} style={s.milestone}>
          <Ionicons name="ellipse-outline" size={20} color={color.ironSoft} accessibilityLabel="Not yet" />
          <Text style={[type.small, { flex: 1 }]}>{m.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Everything you've reached, by date, newest first; then what's ahead. */
function TimelineSheet({ visible, reached, next, onClose }: { visible: boolean; reached: Milestone[]; next: Milestone[]; onClose: () => void }) {
  const icon = (m: Milestone): keyof typeof Ionicons.glyphMap =>
    m.key.startsWith('weight') ? 'scale-outline' : m.key.startsWith('workouts') ? 'barbell-outline' : m.key.startsWith('weighins') ? 'resize-outline' : 'flame-outline';
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: color.chalk }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space(4) }}>
          <Text style={type.title} accessibilityRole="header">Timeline</Text>
          <Pressable onPress={onClose} hitSlop={10} style={s.linkHit}><Text style={[s.link, { fontSize: textSize.body }]}>Done</Text></Pressable>
        </View>
        <ScrollView keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(10) }}>
          {reached.map((m, i) => (
            <View key={m.key} style={{ flexDirection: 'row', gap: space(3) }}>
              <View style={{ alignItems: 'center', width: 32 }}>
                <View style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color.infoBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={icon(m)} size={18} color={color.iron} />
                </View>
                {i < reached.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: color.line, minHeight: 18 }} />}
              </View>
              <View style={{ flex: 1, paddingBottom: space(4) }}>
                <Text style={[type.body, { fontWeight: '700' }]}>{m.label}</Text>
                <Text style={type.small}>{m.date ? longDate(m.date) : ''}{m.detail ? ` · ${m.detail}` : ''}</Text>
              </View>
            </View>
          ))}
          {next.length > 0 && <Text style={[type.label, { marginTop: space(3), marginBottom: space(2) }]}>Ahead</Text>}
          {next.slice(0, 8).map((m) => (
            <View key={m.key} style={[s.milestone, { paddingVertical: 4 }]}>
              <Ionicons name="ellipse-outline" size={18} color={color.ironSoft} accessibilityLabel="Not yet" />
              <Text style={[type.body, { color: color.ironSoft, flex: 1 }]}>{m.label}{m.detail ? `  ·  ${m.detail}` : ''}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

type Measurement = Progress['measurements'][number];

/** Values first; tap a row to add today's number, and add your own kinds behind a link. */
function MeasurementsCard({ p, units, onSave }: { p: Progress; units: Units; onSave: Submit<{ kind: string; value: number; unit: string }> }) {
  const viewing = useViewing();
  const inches = units.unit === 'lb';
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newValue, setNewValue] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Body measurements are stored in cm and shown in inches if you use pounds; your own ones keep their unit.
  const shown = (m: Measurement) => (m.custom || m.unit !== 'cm' ? m.unit : inches ? 'in' : 'cm');
  const show = (m: Measurement, v: number) => String(Math.round((!m.custom && m.unit === 'cm' && inches ? v / CM_PER_IN : v) * 10) / 10);
  const list = p.measurements.filter((m) => !viewing || m.latest);

  /** Save, and only close the entry once it went through; otherwise keep what was typed and say why. */
  const run = async (value: { kind: string; value: number; unit: string }, after: () => void) => {
    setSaving(true);
    setFailed(null);
    const why = await onSave(value);
    setSaving(false);
    if (why) setFailed(why);
    else {
      after();
      setTried(false);
    }
  };
  const commit = (m: Measurement) => {
    const v = readNumber(text);
    if (v === null) return setTried(true);
    void run({ kind: m.kind, value: !m.custom && m.unit === 'cm' && inches ? v * CM_PER_IN : v, unit: m.custom ? m.unit : 'cm' }, () => {
      setOpen(null);
      setText('');
    });
  };
  const addNew = () => {
    const v = readNumber(newValue);
    if (!newKind.trim() || !newUnit.trim() || v === null) return setTried(true);
    void run({ kind: newKind.trim(), value: v, unit: newUnit.trim() }, () => {
      setNewKind('');
      setNewUnit('');
      setNewValue('');
      setAdding(false);
    });
  };
  const failure = failed && <Text style={s.fieldProblem} accessibilityLiveRegion="assertive">Couldn’t save. {failed}</Text>;

  return (
    <View style={s.card}>
      <TitleWithInfo title="Measurements">
        Tape around the same spot each time, or track anything else with your own unit. Today’s value replaces any earlier one from today.
      </TitleWithInfo>
      {list.map((m) => {
        const isOpen = open === m.kind;
        const summary = (
          <View style={{ flex: 1 }}>
            <Text style={type.body}>{cap(m.kind)}</Text>
            <Text style={[type.small, type.number]}>
              {m.latest ? `${show(m, m.latest.value)} ${shown(m)} · ${longDate(m.latest.date)}` : 'Not measured yet'}
              {m.first && m.latest ? ` · ${m.latest.value - m.first.value > 0 ? '+' : '−'}${show(m, Math.abs(m.latest.value - m.first.value))} since ${longDate(m.first.date)}` : ''}
            </Text>
            {(m.history?.length ?? 0) > 1 && <Sparkline values={m.history!.map((x) => Number(show(m, x.value)))} label={`${cap(m.kind)} in ${shown(m)}`} />}
          </View>
        );
        return (
          <View key={m.kind} style={{ gap: space(2) }}>
            {viewing ? (
              <View style={s.row}>{summary}</View>
            ) : (
              <Pressable
                onPress={() => { setOpen(isOpen ? null : m.kind); setText(''); setTried(false); setFailed(null); }}
                style={[s.row, s.measureRow]}
                accessibilityHint={isOpen ? 'Closes the entry' : `Adds today’s ${m.kind}`}
                accessibilityState={{ expanded: isOpen }}
              >
                {summary}
                <Ionicons name={isOpen ? 'chevron-up' : 'add-circle-outline'} size={22} color={color.ironSoft} />
              </Pressable>
            )}
            {isOpen && (
              <>
                <View style={s.row}>
                  <TextInput
                    autoFocus
                    value={text}
                    onChangeText={setText}
                    onSubmitEditing={() => commit(m)}
                    keyboardType="decimal-pad"
                    placeholder={`Today, in ${shown(m)}`}
                    placeholderTextColor={color.placeholder}
                    style={[s.input, { flex: 1 }, tried && readNumber(text) === null && { borderColor: color.over }]}
                    accessibilityLabel={`${m.kind} today in ${shown(m)}`}
                  />
                  <Pressable onPress={() => commit(m)} disabled={saving} style={[s.small, saving && { opacity: 0.5 }]} accessibilityState={{ busy: saving }}>
                    <Text style={s.smallText}>{saving ? 'Saving…' : 'Save'}</Text>
                  </Pressable>
                </View>
                {tried && readNumber(text) === null && <Text style={s.fieldProblem}>Enter a number, like 82.5.</Text>}
                {failure}
              </>
            )}
          </View>
        );
      })}
      {!viewing && !adding && (
        <Pressable onPress={() => { setAdding(true); setOpen(null); setTried(false); setFailed(null); }} hitSlop={8} style={s.linkHit}>
          <Text style={s.link}>+ Track something else</Text>
        </Pressable>
      )}
      {!viewing && adding && (
        <View style={s.addBox}>
          <TextInput value={newKind} onChangeText={setNewKind} placeholder="Name, e.g. resting heart rate" placeholderTextColor={color.placeholder} style={[s.input, tried && !newKind.trim() && { borderColor: color.over }]} accessibilityLabel="What to track" />
          <View style={s.row}>
            <TextInput value={newUnit} onChangeText={setNewUnit} placeholder="Unit, e.g. bpm" placeholderTextColor={color.placeholder} style={[s.input, { flex: 1 }, tried && !newUnit.trim() && { borderColor: color.over }]} autoCapitalize="none" accessibilityLabel="Unit" />
            <TextInput value={newValue} onChangeText={setNewValue} placeholder="Today" placeholderTextColor={color.placeholder} keyboardType="decimal-pad" style={[s.input, { width: 96, textAlign: 'center' }, tried && readNumber(newValue) === null && { borderColor: color.over }]} accessibilityLabel="Today's value" />
          </View>
          {tried && <Text style={s.fieldProblem}>Give it a name, a unit and today’s number.</Text>}
          {failure}
          <View style={s.row}>
            <Pressable onPress={addNew} disabled={saving} style={[s.small, { flex: 1 }, saving && { opacity: 0.5 }]}>
              <Text style={s.smallText}>{saving ? 'Saving…' : 'Start tracking'}</Text>
            </Pressable>
            <Pressable onPress={() => { setAdding(false); setTried(false); setFailed(null); }} style={[s.quiet, { flex: 1, paddingVertical: space(3) }]}>
              <Text style={[s.quietText, { fontSize: textSize.control }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: QUICK_BELL_ROOM, gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  contentWide: { maxWidth: 1400, padding: space(6) },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: space(4) },
  stack: { gap: space(3) },
  col: { flex: 1, minWidth: 0 },
  // Group headings: Weight and goal, Food, Training, Recovery and wellbeing, Looking back.
  heading: { ...type.label, marginTop: space(3) },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.dangerBg, borderRadius: radius.card, padding: space(4) },
  retry: { ...buttons.small, minHeight: 44 },
  fieldProblem: { ...type.small, color: color.over },
  warning: { ...type.small, color: color.warnText, backgroundColor: color.warnBg, padding: space(2), borderRadius: radius.input },
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  stats: { flexDirection: 'row', gap: space(2) },
  tile: { flex: 1, backgroundColor: color.raised, borderRadius: radius.input, padding: space(3), gap: 2, minHeight: 44 },
  stat: { fontSize: textSize.stat, fontWeight: '800', color: color.iron },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: radius.input, padding: space(3) },
  small: { ...buttons.small, alignSelf: 'flex-start', minHeight: 44 },
  smallText: { ...buttons.smallText },
  quiet: { ...buttons.quiet, minHeight: 44 },
  quietText: { ...buttons.quietText },
  link: { color: color.accent, fontWeight: '700', fontSize: textSize.control },
  linkHit: { minHeight: 44, justifyContent: 'center' },
  suggest: { backgroundColor: color.infoBg, borderRadius: radius.row, padding: space(3), gap: space(2), marginTop: space(1) },
  divided: { borderTopWidth: 1, borderTopColor: color.line, paddingTop: space(3), marginTop: space(1) },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  step: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: radius.pill },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(1) },
  measureRow: { minHeight: 44 },
  addBox: { gap: space(2), backgroundColor: color.raised, borderRadius: radius.row, padding: space(3) },
});

/** A small line of a measurement over time, oldest to newest. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 140;
  const H = 28;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (W - 4) + 2).toFixed(1)},${(H - 2 - ((v - lo) / span) * (H - 4)).toFixed(1)}`).join(' ');
  return (
    <Svg width={W} height={H} style={{ marginTop: 4 }} accessibilityLabel={`${label}: from ${values[0]} to ${values.at(-1)}`}>
      <Polyline points={pts} fill="none" stroke={color.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={W - 2} cy={Number(pts.split(' ').at(-1)!.split(',')[1])} r={2.5} fill={color.accent} />
    </Svg>
  );
}
