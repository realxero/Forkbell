import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { estimateBurn, smartTargets, todayLocal, type ActivityLevel, type BodyGoal, type Targets, type TrainingFocus } from '@forkbell/shared';
import { api, put } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cachedGet } from '../../lib/sync';
import { Logo } from '../../components/Logo';
import { Chip } from '../../components/AmountPicker';
import { color, radius, space, type } from '../../lib/theme';

const KG_PER_LB = 0.45359237;
const STEPS = ['welcome', 'units', 'you', 'goal', 'training', 'targets'] as const;
type Step = (typeof STEPS)[number];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * First launch: a few questions, then calorie and macro targets made for your
 * goal and how you train. Everything can be changed later; Skip is always there.
 * Also opened from Settings → Recalculate my targets.
 */
export default function Onboarding() {
  const { me, refreshMe } = useAuth();
  const params = useLocalSearchParams<{ from?: string }>();
  const [step, setStep] = useState<Step>(params.from === 'settings' ? 'you' : 'welcome');
  const body = me?.preferences.body;
  const [unit, setUnit] = useState<'lb' | 'kg'>(me?.weightUnit ?? 'lb');
  const [sex, setSex] = useState<'male' | 'female' | null>(body?.sex ?? null);
  const [birthYear, setBirthYear] = useState(body?.birthYear ? String(body.birthYear) : '');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');
  const [cm, setCm] = useState(body?.heightCm ? String(body.heightCm) : '');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel>(body?.activity ?? 'light');
  const [goal, setGoal] = useState<BodyGoal | null>(body?.goal ?? null);
  const [goalWeight, setGoalWeight] = useState('');
  const [focus, setFocus] = useState<TrainingFocus>(body?.focus ?? 'health');
  const [days, setDays] = useState<number[]>(me?.preferences.training?.trainingDays ?? []);
  const [measured, setMeasured] = useState<number | null>(null);
  const [t, setT] = useState<Targets | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from what Forkbell already knows: your latest weight, goal weight and measured burn.
  useEffect(() => {
    if (body?.heightCm) {
      const inches = body.heightCm / 2.54;
      setFt(String(Math.floor(inches / 12)));
      setInch(String(Math.round(inches % 12)));
    }
    cachedGet<{ weighIns: { weightKg: number }[]; energy: { kcal: number | null }; goal: { weightKg: number | null } }>(`/api/progress?today=${todayLocal()}`).then(
      (p) => {
        const last = p.weighIns.at(-1)?.weightKg;
        const toUnit = (kg: number) => String(Math.round((unit === 'lb' ? kg / KG_PER_LB : kg) * 10) / 10);
        if (last) setWeight(toUnit(last));
        if (p.goal.weightKg) setGoalWeight(toUnit(p.goal.weightKg));
        setMeasured(p.energy.kcal);
      },
      () => {},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const num = (s: string) => Number(s.replace(',', '.'));
  const heightCm = unit === 'lb' ? (num(ft) * 12 + num(inch || '0')) * 2.54 : num(cm);
  const weightKg = unit === 'lb' ? num(weight) * KG_PER_LB : num(weight);
  const goalKg = goalWeight.trim() ? (unit === 'lb' ? num(goalWeight) * KG_PER_LB : num(goalWeight)) : null;
  const age = num(birthYear) ? new Date().getFullYear() - num(birthYear) : NaN;
  const youOk = sex && age >= 13 && age <= 100 && heightCm >= 120 && heightCm <= 230 && weightKg >= 30 && weightKg <= 300;

  const compute = () => {
    const burn = measured ?? estimateBurn({ sex: sex!, age, heightCm, weightKg, activity });
    setT(smartTargets({ goal: goal!, focus, weightKg, burnKcal: burn, goalWeightKg: goalKg, heightCm, measured: measured !== null, unit }));
  };
  const next = () => {
    const i = STEPS.indexOf(step);
    const to = STEPS[i + 1]!;
    if (to === 'targets') compute();
    setStep(to);
  };
  const back = () => setStep(STEPS[Math.max(0, STEPS.indexOf(step) - 1)]!);

  const finish = async (skip = false) => {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      if (!skip && t) {
        await put('/api/me/settings', { weightUnit: unit });
        await put('/api/me/goals', { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat });
        await put('/api/progress/goal', { goalWeightKg: goalKg && goalKg >= 20 ? Math.round(goalKg * 10) / 10 : null, goalDate: null, weeklyWorkoutGoal: Math.max(1, days.length || 3) });
        // Today's weight, if there isn't one yet.
        const p = await api<{ weighIns: { date: string }[] }>(`/api/progress?today=${todayLocal()}`).catch(() => null);
        if (weightKg && !p?.weighIns.some((w) => w.date === todayLocal())) await put('/api/progress/weigh-ins', { date: todayLocal(), weightKg: Math.round(weightKg * 100) / 100 });
      }
      await put('/api/me/preferences', {
        ...me.preferences,
        onboarded: true,
        ...(skip
          ? {}
          : {
              body: { sex, birthYear: num(birthYear) || null, heightCm: Math.round(heightCm) || null, activity, goal, focus },
              training: { ...me.preferences.training, trainingDays: [...days].sort() },
            }),
      });
      await refreshMe();
      router.replace(params.from === 'settings' ? '/settings' : '/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canNext = step === 'you' ? youOk : step === 'goal' ? goal !== null : true;
  const index = STEPS.indexOf(step);

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Back and Skip sit in equal-width slots, so the progress dashes stay centred. */}
        <View style={s.top}>
          <View style={s.side}>{index > 0 && <Pressable onPress={back} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>}</View>
          <View style={s.dots}>{STEPS.slice(1).map((x, i) => <View key={x} style={[s.dot, i < index && { backgroundColor: color.accent }]} />)}</View>
          <View style={[s.side, { alignItems: 'flex-end' }]}><Pressable onPress={() => finish(true)} hitSlop={12}><Text style={[s.link, { color: color.ironSoft }]}>Skip</Text></Pressable></View>
        </View>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {step === 'welcome' && (
            <View style={{ alignItems: 'center', gap: space(4), paddingTop: space(10) }}>
              <Logo size={120} />
              <Text style={[type.hero, { textAlign: 'center' }]}>Forkbell</Text>
              <Text style={[type.body, { textAlign: 'center', fontSize: 18 }]}>Food, training and progress in one place, on your own server.</Text>
              <Text style={[type.small, { textAlign: 'center' }]}>A minute of questions sets your calorie and macro targets for your goal. You can change everything later.</Text>
            </View>
          )}

          {step === 'units' && (
            <Section title="Pounds or kilograms?">
              <View style={s.chips}>
                <Chip label="Pounds (lb)" on={unit === 'lb'} onPress={() => setUnit('lb')} />
                <Chip label="Kilograms (kg)" on={unit === 'kg'} onPress={() => setUnit('kg')} />
              </View>
              <Text style={type.small}>For your weight and the weights you lift.</Text>
            </Section>
          )}

          {step === 'you' && (
            <Section title="About you" note="Used to estimate your daily burn until Forkbell can measure it from your own logs (about two weeks).">
              <Label text="Sex (for the burn estimate)" />
              <View style={s.chips}>
                <Chip label="Male" on={sex === 'male'} onPress={() => setSex('male')} />
                <Chip label="Female" on={sex === 'female'} onPress={() => setSex('female')} />
              </View>
              <Label text="Year you were born" />
              <TextInput value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" placeholder="e.g. 2001" style={s.input} maxLength={4} />
              <Label text="Height" />
              {unit === 'lb' ? (
                <View style={s.row}>
                  <TextInput value={ft} onChangeText={setFt} keyboardType="number-pad" placeholder="ft" style={[s.input, { flex: 1 }]} />
                  <TextInput value={inch} onChangeText={setInch} keyboardType="number-pad" placeholder="in" style={[s.input, { flex: 1 }]} />
                </View>
              ) : (
                <TextInput value={cm} onChangeText={setCm} keyboardType="number-pad" placeholder="cm" style={s.input} />
              )}
              <Label text={`Weight now (${unit})`} />
              <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={unit} style={s.input} />
              <Label text="Day to day, outside workouts" />
              <View style={s.chips}>
                {([['sedentary', 'Mostly sitting'], ['light', 'On my feet some'], ['moderate', 'On my feet a lot'], ['very', 'Physical job']] as const).map(([k, l]) => (
                  <Chip key={k} label={l} on={activity === k} onPress={() => setActivity(k)} />
                ))}
              </View>
            </Section>
          )}

          {step === 'goal' && (
            <Section title="What’s your goal?">
              {([
                ['lose', 'Lose fat', 'A steady deficit; the scale goes down.'],
                ['recomp', 'Recomp', 'Lose fat and build muscle together; slow on the scale.'],
                ['maintain', 'Maintain', 'Stay where you are.'],
                ['gain', 'Gain', 'A lean surplus to build size or strength.'],
              ] as const).map(([k, l, d]) => (
                <Pressable key={k} onPress={() => setGoal(k)} style={[s.option, goal === k && s.optionOn]}>
                  <Text style={[type.body, { fontWeight: '800' }]}>{l}</Text>
                  <Text style={type.small}>{d}</Text>
                </Pressable>
              ))}
              {(goal === 'lose' || goal === 'gain') && (
                <>
                  <Label text={`Goal weight (${unit}, optional)`} />
                  <TextInput value={goalWeight} onChangeText={setGoalWeight} keyboardType="decimal-pad" placeholder={unit} style={s.input} />
                </>
              )}
            </Section>
          )}

          {step === 'training' && (
            <Section title="How do you train?">
              {([
                ['none', 'Not yet', 'Just food for now.'],
                ['health', 'General fitness', 'Feel good, move well.'],
                ['size', 'Size', 'Build muscle (hypertrophy).'],
                ['strength', 'Strength', 'Lift heavier.'],
                ['both', 'Size and strength', 'A bit of both.'],
              ] as const).map(([k, l, d]) => (
                <Pressable key={k} onPress={() => setFocus(k)} style={[s.option, focus === k && s.optionOn]}>
                  <Text style={[type.body, { fontWeight: '800' }]}>{l}</Text>
                  <Text style={type.small}>{d}</Text>
                </Pressable>
              ))}
              {focus !== 'none' && (
                <>
                  <Label text="Days you train" />
                  <View style={s.chips}>
                    {DAYS.map((d, i) => <Chip key={d} label={d} on={days.includes(i)} onPress={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} />)}
                  </View>
                </>
              )}
            </Section>
          )}

          {step === 'targets' && t && (
            <Section title="Your targets">
              <View style={s.kcalCard}>
                <Text style={[type.hero, { color: color.accent }]}>{t.kcal.toLocaleString()}</Text>
                <Text style={type.body}>kcal a day</Text>
              </View>
              <View style={s.row}>
                <Macro label="Protein" value={t.protein} tint={color.protein} />
                <Macro label="Carbs" value={t.carbs} tint={color.carbs} />
                <Macro label="Fat" value={t.fat} tint={color.fat} />
              </View>
              {t.why.map((w) => <Text key={w} style={type.small}>• {w}</Text>)}
              <Text style={type.small}>
                {measured ? 'Based on your measured burn.' : 'Your weekly check-in adjusts this once your own numbers are in.'} You can fine-tune any number in Settings.
              </Text>
            </Section>
          )}
          {error && <Text style={{ color: color.over }}>{error}</Text>}
        </ScrollView>
        <View style={s.bottom}>
          {step === 'targets' ? (
            <Pressable disabled={busy} onPress={() => finish(false)} style={[s.primary, busy && { opacity: 0.5 }]}>
              <Text style={s.primaryText}>{busy ? 'Saving…' : 'Use these targets'}</Text>
            </Pressable>
          ) : (
            <Pressable disabled={!canNext} onPress={next} style={[s.primary, !canNext && { opacity: 0.4 }]}>
              <Text style={s.primaryText}>{step === 'welcome' ? 'Get started' : 'Next'}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space(3) }}>
      <Text style={[type.hero, { fontSize: 30 }]}>{title}</Text>
      {note && <Text style={type.small}>{note}</Text>}
      {children}
    </View>
  );
}
const Label = ({ text }: { text: string }) => <Text style={[type.small, { marginTop: space(2) }]}>{text}</Text>;
function Macro({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: color.card, borderRadius: 14, padding: space(3), borderTopWidth: 4, borderTopColor: tint, gap: 2 }}>
      <Text style={type.label}>{label}</Text>
      <Text style={[type.title, type.number]}>{value} g</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(4), paddingVertical: space(3) },
  side: { width: 72 },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 22, height: 5, borderRadius: 3, backgroundColor: color.track },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  content: { padding: space(4), paddingBottom: space(10), gap: space(3), maxWidth: 560, width: '100%', alignSelf: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  row: { flexDirection: 'row', gap: space(2) },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 12, padding: space(3) },
  option: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), borderWidth: 2, borderColor: color.line, gap: 2 },
  optionOn: { borderColor: color.accent, backgroundColor: color.infoBg },
  kcalCard: { alignItems: 'center', backgroundColor: color.card, borderRadius: radius.card, padding: space(5) },
  bottom: { padding: space(4), borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.chalk },
  primary: { backgroundColor: color.accent, borderRadius: 14, paddingVertical: space(4), alignItems: 'center', maxWidth: 560, width: '100%', alignSelf: 'center' },
  primaryText: { color: color.onAccent, fontWeight: '800', fontSize: 17 },
});
