import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDays, dateSchema, todayLocal, type EnergyEstimate, type GoalPlan, type Milestone, type Streaks, type TrendPoint } from '@forkbell/shared';
import { api, put } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useUnit } from '../../../lib/units';
import { Chip } from '../../../components/AmountPicker';
import { NumberField } from '../../../components/NumberField';
import { WeightChart } from '../../../components/WeightChart';
import { color, space, type } from '../../../lib/theme';

type Progress = {
  today: string;
  weighIns: (TrendPoint & { bodyFat: number | null })[];
  energy: EnergyEstimate;
  calorieGoal: number | null;
  goal: { weightKg: number | null; date: string | null; weeklyWorkoutGoal: number; plan: GoalPlan | null };
  streaks: Streaks;
  milestones: Milestone[];
  measurements: { kind: string; latest: { date: string; valueCm: number } | null; first: { date: string; valueCm: number } | null }[];
};

const CM_PER_IN = 2.54;
const RANGES = [
  { label: '1 month', days: 31 },
  { label: '3 months', days: 92 },
  { label: 'Year', days: 366 },
];
const longDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: y === new Date().getFullYear() ? undefined : 'numeric' });
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ProgressScreen() {
  const units = useUnit();
  const { me, refreshMe } = useAuth();
  const [p, setP] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState(92);
  const [weight, setWeight] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<Progress>(`/api/progress?today=${todayLocal()}`);
      setP(data);
      const todays = data.weighIns.find((w) => w.date === data.today);
      setWeight(todays ? units.show(todays.weightKg) : '');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.unit]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setNotice(null);
    try {
      await fn();
      await load();
      if (done) setNotice(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const shown = useMemo(() => (p ? p.weighIns.filter((w) => w.date >= addDays(p.today, -range)) : []), [p, range]);
  const latest = p?.weighIns.at(-1) ?? null;
  const weekAgo = p && latest ? [...p.weighIns].reverse().find((w) => w.date <= addDays(latest.date, -7)) : null;
  const signed = (kg: number) => `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${units.show(Math.abs(kg))} ${units.unit}`;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <Text style={[type.hero, { fontSize: 34 }]}>Progress</Text>
        {error && <Text style={s.error}>{error}</Text>}
        {notice && <Text style={s.notice}>{notice}</Text>}
        {!p && !error && <ActivityIndicator color={color.iron} />}

        {p && (
          <>
            {/* Weigh-in */}
            <View style={s.card}>
              <Text style={type.title}>Today’s weight</Text>
              <View style={s.row}>
                <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={latest ? units.show(latest.weightKg) : ''} style={[s.input, { flex: 1 }]} accessibilityLabel={`Today's weight in ${units.unit}`} />
                <Text style={type.body}>{units.unit}</Text>
                <Pressable
                  disabled={units.read(weight) === null}
                  onPress={() => act(() => put('/api/progress/weigh-ins', { date: p.today, weightKg: units.read(weight) }), 'Weight saved.')}
                  style={[s.small, units.read(weight) === null && { opacity: 0.4 }]}
                >
                  <Text style={s.smallText}>Save</Text>
                </Pressable>
              </View>
              {latest && (
                <Text style={type.small}>
                  Trend {units.label(latest.trendKg)}
                  {weekAgo ? ` · ${signed(latest.trendKg - weekAgo.trendKg)} this week` : ''}. Weigh in at the same time each day; the trend smooths out water swings.
                </Text>
              )}
            </View>

            {/* Chart */}
            {p.weighIns.length > 0 && (
              <View style={s.card}>
                <View style={s.chips}>
                  {RANGES.map((r) => <Chip key={r.days} label={r.label} on={range === r.days} onPress={() => setRange(r.days)} />)}
                </View>
                <WeightChart points={shown} goalKg={p.goal.weightKg} show={(kg) => units.label(kg)} />
              </View>
            )}

            {/* Energy */}
            <View style={s.card}>
              <Text style={type.title}>Your daily burn</Text>
              {p.energy.kcal !== null ? (
                <>
                  <Text style={[type.hero, type.number, { fontSize: 32 }]}>{p.energy.kcal.toLocaleString()} kcal</Text>
                  <Text style={type.small}>
                    Worked out from what you logged on {p.energy.loggedDays} days and how your trend moved ({signed(p.energy.rateKgPerWeek!)} a week). Confidence: {p.energy.confidence}. It updates as you keep logging.
                  </Text>
                </>
              ) : (
                <Text style={type.body}>
                  Not enough data yet. {p.energy.needs} Then Forkbell works out what you really burn from your own numbers, no formulas or guesses.
                </Text>
              )}
              {p.goal.plan?.suggestedKcal && p.goal.plan.suggestedKcal !== p.calorieGoal && (
                <View style={s.suggest}>
                  <Text style={type.body}>
                    {p.goal.plan.reached ? 'To stay where you are' : `To move toward ${units.label(p.goal.weightKg)} at a steady pace`}, eat about{' '}
                    <Text style={{ fontWeight: '800' }}>{p.goal.plan.suggestedKcal.toLocaleString()} kcal</Text> a day.
                  </Text>
                  <Pressable
                    onPress={() =>
                      act(async () => {
                        await put('/api/me/goals', { ...(me?.goals ?? { protein: null, carbs: null, fat: null }), kcal: p.goal.plan!.suggestedKcal });
                        await refreshMe();
                      }, 'Calorie goal updated.')
                    }
                    style={s.small}
                  >
                    <Text style={s.smallText}>Use as my calorie goal</Text>
                  </Pressable>
                </View>
              )}
            </View>

            <GoalCard p={p} units={units} onSave={(body) => act(() => put('/api/progress/goal', body), 'Goal saved.')} />

            {/* Streaks */}
            <View style={s.card}>
              <Text style={type.title}>Streaks</Text>
              <Text style={type.body}>
                🔥 {p.streaks.foodDays} {p.streaks.foodDays === 1 ? 'day' : 'days'} of logging in a row
                <Text style={type.small}> · best {p.streaks.bestFoodDays}</Text>
              </Text>
              <Text style={type.body}>
                🏋 {p.streaks.workoutWeeks} {p.streaks.workoutWeeks === 1 ? 'week' : 'weeks'} in a row with {p.goal.weeklyWorkoutGoal}+ workouts
                <Text style={type.small}> · best {p.streaks.bestWorkoutWeeks}</Text>
              </Text>
              <Text style={type.small}>
                {p.streaks.workoutsThisWeek} of {p.goal.weeklyWorkoutGoal} this week. Rest days never break a streak; only the week as a whole counts.
              </Text>
            </View>

            <Milestones list={p.milestones} />

            <MeasurementsCard p={p} units={units} onSave={(kind, valueCm) => act(() => put('/api/progress/measurements', { date: p.today, kind, valueCm }), 'Measurement saved.')} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type Units = ReturnType<typeof useUnit>;

function GoalCard({ p, units, onSave }: { p: Progress; units: Units; onSave: (body: { goalWeightKg: number | null; goalDate: string | null; weeklyWorkoutGoal: number }) => void }) {
  const [goal, setGoal] = useState(p.goal.weightKg ? units.show(p.goal.weightKg) : '');
  const [date, setDate] = useState(p.goal.date ?? '');
  const [weekly, setWeekly] = useState(p.goal.weeklyWorkoutGoal);
  const dateOk = date.trim() === '' || dateSchema.safeParse(date.trim()).success;
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

  return (
    <View style={s.card}>
      <Text style={type.title}>Goal</Text>
      {plan?.reached && <Text style={[type.body, { color: color.fat, fontWeight: '700' }]}>You’re at your goal weight. 🎉</Text>}
      {plan && !plan.reached && <Text style={type.body}>{units.label(Math.abs(plan.remainingKg))} to go.</Text>}
      {paceText && <Text style={type.body}>{paceText}</Text>}
      {plan?.kcalForDate && <Text style={type.body}>To make {longDate(p.goal.date!)}, eat about {plan.kcalForDate.toLocaleString()} kcal a day.</Text>}
      {plan?.warnings.map((w) => <Text key={w} style={s.warning}>{w}</Text>)}

      <View style={[s.row, { marginTop: space(2) }]}>
        <View style={{ flex: 1, gap: space(1) }}>
          <Text style={type.small}>Goal weight ({units.unit})</Text>
          <TextInput value={goal} onChangeText={setGoal} keyboardType="decimal-pad" placeholder="None" style={s.input} />
        </View>
        <View style={{ flex: 1, gap: space(1) }}>
          <Text style={type.small}>By (optional)</Text>
          <TextInput value={date} onChangeText={setDate} placeholder="2027-03-01" autoCapitalize="none" style={[s.input, !dateOk && { borderColor: color.over }]} />
        </View>
      </View>
      <View style={s.row}>
        <Text style={[type.body, { flex: 1 }]}>Workouts a week</Text>
        <Pressable onPress={() => setWeekly(Math.max(1, weekly - 1))} style={s.step}><Text style={s.stepText}>−</Text></Pressable>
        <Text style={[type.body, type.number, { minWidth: 24, textAlign: 'center', fontWeight: '700' }]}>{weekly}</Text>
        <Pressable onPress={() => setWeekly(Math.min(14, weekly + 1))} style={s.step}><Text style={s.stepText}>+</Text></Pressable>
      </View>
      <Pressable
        disabled={!dateOk}
        onPress={() => onSave({ goalWeightKg: units.read(goal), goalDate: date.trim() || null, weeklyWorkoutGoal: weekly })}
        style={[s.button, !dateOk && { opacity: 0.4 }]}
      >
        <Text style={s.buttonText}>Save goal</Text>
      </Pressable>
    </View>
  );
}

function Milestones({ list }: { list: Milestone[] }) {
  const reached = list.filter((m) => m.reached).sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
  const next = ['days', 'workouts', 'weight'].map((k) => list.find((m) => !m.reached && m.key.startsWith(k))).filter(Boolean) as Milestone[];
  if (!reached.length && !next.length) return null;
  return (
    <View style={s.card}>
      <Text style={type.title}>Milestones</Text>
      {reached.slice(0, 6).map((m) => (
        <View key={m.key} style={s.milestone}>
          <Text style={type.body}>✓ {m.label}</Text>
          <Text style={type.small}>
            {m.date ? longDate(m.date) : ''}
            {m.detail ? ` · ${m.detail}` : ''}
          </Text>
        </View>
      ))}
      {next.length > 0 && <Text style={[type.small, { fontWeight: '700', marginTop: space(2) }]}>Next up</Text>}
      {next.map((m) => (
        <Text key={m.key} style={type.small}>○ {m.label}</Text>
      ))}
    </View>
  );
}

function MeasurementsCard({ p, units, onSave }: { p: Progress; units: Units; onSave: (kind: string, valueCm: number) => void }) {
  const inches = units.unit === 'lb';
  const unit = inches ? 'in' : 'cm';
  const show = (cm: number) => String(Math.round((inches ? cm / CM_PER_IN : cm) * 10) / 10);
  return (
    <View style={s.card}>
      <Text style={type.title}>Measurements</Text>
      <Text style={type.small}>Tape around the same spot each time. Today’s value replaces any earlier one from today.</Text>
      {p.measurements.map((m) => (
        <View key={m.kind} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>{cap(m.kind)}</Text>
            <Text style={type.small}>
              {m.latest ? `${show(m.latest.valueCm)} ${unit} · ${longDate(m.latest.date)}` : 'Not measured yet'}
              {m.first && m.latest ? ` · ${m.latest.valueCm - m.first.valueCm > 0 ? '+' : '−'}${show(Math.abs(m.latest.valueCm - m.first.valueCm))} since ${longDate(m.first.date)}` : ''}
            </Text>
          </View>
          <NumberField
            key={`${m.latest?.date}-${m.latest?.valueCm}`}
            label={`${m.kind} in ${unit}`}
            value=""
            placeholder={unit}
            onCommit={(t) => {
              const v = Number(t.replace(',', '.'));
              if (t.trim() && v > 0) onSave(m.kind, inches ? v * CM_PER_IN : v);
            }}
            style={[s.input, { width: 72, textAlign: 'center' }]}
          />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  error: { ...type.body, color: color.over },
  notice: { ...type.small, color: color.fat, fontWeight: '700' },
  warning: { ...type.small, color: '#9A6B00', backgroundColor: '#FFF4D6', padding: space(2), borderRadius: 8 },
  card: { backgroundColor: color.card, borderRadius: 16, padding: space(4), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginBottom: space(2) },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  small: { backgroundColor: color.iron, borderRadius: 10, paddingHorizontal: space(4), paddingVertical: space(3), alignSelf: 'flex-start' },
  smallText: { color: color.chalk, fontWeight: '700', fontSize: 15 },
  suggest: { backgroundColor: '#EEF3FB', borderRadius: 12, padding: space(3), gap: space(2), marginTop: space(2) },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, color: color.iron, fontWeight: '700' },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center', marginTop: space(1) },
  buttonText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
  milestone: { paddingVertical: space(1) },
});
