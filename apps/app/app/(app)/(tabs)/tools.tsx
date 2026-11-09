// Tools: calculators for the gym and the weight journey. In the sidebar on a
// wide screen; the list sits beside the open tool when there's room. The
// maths lives in @forkbell/shared; this page only takes inputs and shows
// results, which update as you type. Advanced shows how each number is made.
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { bmi, estimateBurn, estimatedOneRepMax, ffmi, fromKg, KCAL_PER_KG, MAX_E1RM_REPS, MIN_SUGGESTED_KCAL, navyBodyFat, phaseTimeline, todayLocal, weightForReps, type ActivityLevel, type EnergyEstimate, type Sex } from '@forkbell/shared';
import { Pressable } from '../../../components/Tap';
import { Chip } from '../../../components/AmountPicker';
import { PlateCalculator } from '../../../components/PlateCalculator';
import { buttons } from '../../../lib/buttons';
import { useAdvanced, useWide } from '../../../lib/layout';
import { useViewing } from '../../../lib/profile';
import { useFocusEffect } from 'expo-router';
import { cachedGet, readCache, writeCache } from '../../../lib/sync';
import { useUnit } from '../../../lib/units';
import { color, radius, space, type } from '../../../lib/theme';

type ToolId = 'tdee' | 'phase' | 'body' | 'max' | 'plates';
const TOOLS: { id: ToolId; title: string; detail: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'tdee', title: 'Daily burn', detail: 'A formula’s estimate beside the burn measured from your own logs', icon: 'flame-outline' },
  { id: 'phase', title: 'Cut or bulk', detail: 'A steady weekly pace to a target weight, with dates and calories', icon: 'calendar-outline' },
  { id: 'body', title: 'Body fat and BMI', detail: 'From a tape measure, with fat-free mass index', icon: 'body-outline' },
  { id: 'max', title: 'One-rep max', detail: 'Your max from any set, and what to lift for each rep count', icon: 'trending-up-outline' },
  { id: 'plates', title: 'Plates', detail: 'What to load on each side of the bar', icon: 'barbell-outline' },
];


export default function Tools() {
  const wide = useWide();
  const [open, setOpen] = useState<ToolId>('tdee');
  // Your own numbers fill the tools in: trend weight, measured burn, goal, tape measurements.
  const [mine, setMine] = useState<Mine | null>(null);
  // Fresh each time Tools opens, and for whoever you're viewing (never the last person's numbers).
  const viewing = useViewing();
  useFocusEffect(
    useCallback(() => {
      setMine(null);
      cachedGet<Mine>(`/api/progress?today=${todayLocal()}`).then(setMine, () => setMine(null));
    }, [viewing?.id]),
  );
  const [advanced, detail] = useAdvanced();

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[s.content, wide && s.contentWide]}>
        <View style={s.head}>
          <Text style={[type.pageTitle, { flex: 1 }]}>Tools</Text>
          <View style={{ flexDirection: 'row', gap: space(2) }} accessibilityRole="radiogroup" accessibilityLabel="Detail">
            <Chip label="Simple" on={!advanced} onPress={() => detail(false)} />
            <Chip label="Advanced" on={advanced} onPress={() => detail(true)} />
          </View>
        </View>
        <View style={[s.body, wide && s.bodyWide]}>
          <View style={[s.list, wide && s.listWide]}>
            {TOOLS.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setOpen(t.id)}
                style={[s.item, open === t.id && s.itemOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: open === t.id }}
              >
                <Ionicons name={t.icon} size={22} color={color.iron} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '700' }]}>{t.title}</Text>
                  <Text style={type.small}>{t.detail}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            {open === 'tdee' && <DailyBurn advanced={advanced} mine={mine} />}
            {open === 'phase' && <Phase advanced={advanced} mine={mine} />}
            {open === 'body' && <Body advanced={advanced} mine={mine} />}
            {open === 'max' && <OneRepMax advanced={advanced} />}
            {open === 'plates' && <Plates />}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Weight × reps → estimated max, then the weight for every rep count up to 10. */
function OneRepMax({ advanced }: { advanced: boolean }) {
  const units = useUnit();
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('5');
  const kg = units.read(weight);
  const n = Math.round(Number(reps));
  const max = kg ? estimatedOneRepMax(kg, n) : null;
  return (
    <View style={s.card}>
      <Text style={type.title} accessibilityRole="header">One-rep max</Text>
      <View style={s.inputs}>
        <View style={{ flex: 1, gap: space(1) }}>
          <Text style={type.label}>WEIGHT ({units.unit})</Text>
          <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={units.unit === 'lb' ? '185' : '85'} placeholderTextColor={color.placeholder} style={s.input} accessibilityLabel={`Weight lifted in ${units.unit}`} />
        </View>
        <View style={{ flex: 1, gap: space(1) }}>
          <Text style={type.label}>REPS</Text>
          <TextInput value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="5" placeholderTextColor={color.placeholder} style={s.input} accessibilityLabel="Reps done" />
        </View>
      </View>
      {kg !== null && kg > 0 && n > MAX_E1RM_REPS && <Text style={type.small}>Use a set of {MAX_E1RM_REPS} reps or fewer: past that the estimate drifts too far to trust.</Text>}
      <Text style={type.small}>Most accurate from a heavy set of about 2 to 6 reps.</Text>
      {max !== null && (
        <>
          <View accessible accessibilityLabel={`Estimated one-rep max ${units.roundLabel(max)}`}>
            <Text style={type.label}>ESTIMATED MAX</Text>
            <Text style={[type.pageTitle, type.number]}>{units.roundLabel(max)}</Text>
          </View>
          {advanced && (
            <Text style={type.small}>
              Epley’s formula: weight × (1 + reps ÷ 30), so {units.label(kg!)} × (1 + {n} ÷ 30). Each row below runs it backwards. Prediction equations are used only up to 10 reps, and heavier sets predict best (Reynolds, Gordon and Robergs, J Strength Cond Res 2006).
            </Text>
          )}
          <View style={s.table}>
            {Array.from({ length: MAX_E1RM_REPS }, (_, i) => i + 1).map((r) => (
              <View key={r} style={[s.row, r === n && s.rowOn]} accessible accessibilityLabel={`${r} ${r === 1 ? 'rep' : 'reps'}: ${units.roundLabel(weightForReps(max, r))}`}>
                <Text style={[type.body, type.number, { width: 72 }]}>{r} {r === 1 ? 'rep' : 'reps'}</Text>
                <Text style={[type.body, type.number, { flex: 1, fontWeight: '700' }]}>{units.roundLabel(weightForReps(max, r))}</Text>
                {advanced && <Text style={[type.small, type.number]}>{Math.round((weightForReps(max, r) / max) * 100)}%</Text>}
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/** What the tools read from /api/progress. */
type Mine = {
  weighIns: { date: string; weightKg: number; trendKg: number }[];
  energy: EnergyEstimate;
  goal: { weightKg: number | null };
  measurements: { kind: string; unit: string; latest: { date: string; value: number } | null }[];
};
const trendKg = (m: Mine | null) => m?.weighIns.at(-1)?.trendKg ?? null;

/**
 * About you: sex, age and height, which only the formulas need. Kept on this
 * device (Forkbell doesn't store them), and shared by every tool that asks.
 */
/** Height is kept in centimetres, so switching between pounds and kilograms can't change it. */
type About = { sex: Sex | null; age: string; heightCm: number | null; activity: ActivityLevel };
const ABOUT = 'device:tools-about';
function useAbout() {
  const [about, setAbout] = useState<About>({ sex: null, age: '', heightCm: null, activity: 'moderate', ...readCache<Partial<About>>(ABOUT) });
  const set = (a: Partial<About>) => setAbout((old) => {
    const next = { ...old, ...a };
    writeCache(ABOUT, next);
    return next;
  });
  return [about, set] as const;
}
/** Lengths in inches for pounds people, centimetres otherwise. */
function useLength() {
  const { unit } = useUnit();
  const inches = unit === 'lb';
  return {
    unit: inches ? 'in' : 'cm',
    toCm: (t: string) => { const v = Number(t.replace(',', '.')); return t.trim() && v > 0 ? (inches ? v * 2.54 : v) : null; },
    show: (cm: number) => String(Math.round((inches ? cm / 2.54 : cm) * 10) / 10),
  };
}

function Field({ label, value, onChange, placeholder, decimal = true }: { label: string; value: string; onChange: (t: string) => void; placeholder?: string; decimal?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 120, gap: space(1) }}>
      <Text style={type.label}>{label.toUpperCase()}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={decimal ? 'decimal-pad' : 'number-pad'} placeholder={placeholder} placeholderTextColor={color.placeholder} style={s.input} accessibilityLabel={label} />
    </View>
  );
}

function AboutYou({ about, set, activity }: { about: About; set: (a: Partial<About>) => void; activity?: boolean }) {
  const len = useLength();
  const [height, setHeight] = useState(about.heightCm ? len.show(about.heightCm) : '');
  return (
    <View style={{ gap: space(3) }}>
      <View style={s.chips}>
        <Chip label="Male" on={about.sex === 'male'} onPress={() => set({ sex: 'male' })} />
        <Chip label="Female" on={about.sex === 'female'} onPress={() => set({ sex: 'female' })} />
      </View>
      <View style={s.inputs}>
        <Field label="Age" value={about.age} onChange={(age) => set({ age })} placeholder="35" decimal={false} />
        <Field label={`Height (${len.unit})`} value={height} onChange={(t) => { setHeight(t); set({ heightCm: len.toCm(t) }); }} placeholder={len.unit === 'in' ? '70' : '178'} />
      </View>
      {activity && (
        <View style={s.chips} accessibilityLabel="How active you are">
          {(['sedentary', 'light', 'moderate', 'very'] as const).map((a) => (
            <Chip key={a} label={{ sedentary: 'Desk, little exercise', light: 'Light, 1–3 days', moderate: 'Moderate, 3–5 days', very: 'Very, 6–7 days' }[a]} on={about.activity === a} onPress={() => set({ activity: a })} />
          ))}
        </View>
      )}
    </View>
  );
}

/** A big number with its label, read out as one. */
function Result({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 160, gap: 2 }} accessible accessibilityLabel={`${label}: ${value}${note ? `. ${note}` : ''}`}>
      <Text style={type.label}>{label.toUpperCase()}</Text>
      <Text style={[type.pageTitle, type.number]}>{value}</Text>
      {note && <Text style={type.small}>{note}</Text>}
    </View>
  );
}

/** A formula's estimate (Mifflin–St Jeor × activity) beside the burn measured from your own food and weight. */
function DailyBurn({ advanced, mine }: { advanced: boolean; mine: Mine | null }) {
  const units = useUnit();
  const len = useLength();
  const [about, set] = useAbout();
  const kg = trendKg(mine);
  const age = Number(about.age);
  const heightCm = about.heightCm;
  const formula = about.sex && age >= 13 && age <= 100 && heightCm && kg ? estimateBurn({ sex: about.sex, age, heightCm, weightKg: kg, activity: about.activity }) : null;
  const e = mine?.energy;
  return (
    <View style={s.card}>
      <Text style={type.title} accessibilityRole="header">Daily burn</Text>
      <AboutYou about={about} set={set} activity />
      {!kg && <Text style={type.small}>Weigh in on Progress and your trend weight fills in here.</Text>}
      <View style={s.results}>
        <Result label="Formula estimate" value={formula ? `${formula.toLocaleString()} kcal` : '–'} note={kg ? `At your trend weight, ${units.label(kg)}` : undefined} />
        <Result label="Measured from your logs" value={e?.kcal ? `${e.kcal.toLocaleString()} kcal` : '–'} note={e?.kcal ? `Over ${e.spanDays} days, ${e.loggedDays} logged` : e?.needs ?? 'Loading your logs…'} />
      </View>
      {formula && e?.kcal ? (
        <Text style={type.body}>
          Your logs say you burn {Math.abs(e.kcal - formula).toLocaleString()} kcal a day {e.kcal >= formula ? 'more' : 'less'} than the formula guesses. If you’ve logged every day, your own number is the one to trust: it already includes your real activity.
        </Text>
      ) : null}
      <Text style={type.small}>Formulas land within about 10% for most people and can miss by more, especially for very muscular people. Your logged burn replaces it once there’s enough data.</Text>
      {advanced && (
        <View style={{ gap: space(2) }}>
          <Text style={type.small}>Formula: Mifflin–St Jeor resting burn, 10 × weight (kg) + 6.25 × height (cm) − 5 × age {about.sex === 'female' ? '− 161' : '+ 5'}, times {({ sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725 } as const)[about.activity]} for activity. The most accurate of the common formulas in a systematic review (Frankenfield et al., J Am Diet Assoc 2005).</Text>
          <Text style={type.small}>Measured: your average intake on logged days, minus the change in your trend weight × 7,700 kcal per kg, spread over the days between weigh-ins. 7,700 kcal per kg is an average: it fits leaner people and the first weeks of a diet (water, glycogen) less well (Hall, Int J Obes 2008).</Text>
        </View>
      )}
    </View>
  );
}

const PACES = { cut: [0.25, 0.5, 0.75, 1], bulk: [0.1, 0.25, 0.5] } as const;

/** A cut or bulk at a steady % of body weight a week: when you'd get there, and what to eat. */
function Phase({ advanced, mine }: { advanced: boolean; mine: Mine | null }) {
  const units = useUnit();
  // The 2013 AHA/ACC/TOS guideline's lowest weight-loss intakes: 1,200 for women, 1,500 for men.
  const [about] = useAbout();
  const floor = about.sex === 'male' ? 1500 : MIN_SUGGESTED_KCAL;
  const startKg = trendKg(mine);
  const [target, setTarget] = useState<string | null>(null);
  const targetText = target ?? (mine?.goal.weightKg ? units.show(mine.goal.weightKg) : '');
  const targetKg = units.read(targetText);
  const bulking = startKg !== null && targetKg !== null && targetKg > startKg;
  const [pct, setPct] = useState<number>(0.5);
  const paces = bulking ? PACES.bulk : PACES.cut;
  const pace = (paces as readonly number[]).includes(pct) ? pct : paces[1]!;
  const plan = startKg && targetKg ? phaseTimeline({ startKg, targetKg, pctPerWeek: pace, start: todayLocal() }) : null;
  const burn = mine?.energy.kcal ?? null;
  const weeklyKg = startKg ? (bulking ? 1 : -1) * startKg * (pace / 100) : 0;
  const eat = burn ? Math.max(floor, Math.round((burn + (weeklyKg * KCAL_PER_KG) / 7) / 10) * 10) : null;
  const shown = plan ? (advanced ? plan.checkpoints : plan.checkpoints.filter((_, i, all) => (i + 1) % 4 === 0 || i === all.length - 1)) : [];
  const date = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <View style={s.card}>
      <Text style={type.title} accessibilityRole="header">Cut or bulk</Text>
      {!startKg && <Text style={type.small}>Weigh in on Progress first: the plan starts from your trend weight.</Text>}
      <View style={s.inputs}>
        <Field label={`Target weight (${units.unit})`} value={targetText} onChange={setTarget} />
      </View>
      <Text style={type.small}>{bulking ? 'Gain' : 'Lose'} this much of your body weight a week</Text>
      <View style={s.chips}>
        {paces.map((p) => <Chip key={p} label={`${p}%`} on={pace === p} onPress={() => setPct(p)} />)}
      </View>
      {plan && startKg && (
        <>
          <View style={s.results}>
            <Result label="You'd get there" value={date(plan.end)} note={`${plan.weeks} weeks from ${units.label(startKg)}`} />
            <Result label="Eat about" value={eat ? `${eat.toLocaleString()} kcal` : '–'} note={eat ? `a day at first, ${Math.abs(eat - burn!).toLocaleString()} ${bulking ? 'over' : 'under'} your burn` : 'Once your burn is measured (see Daily burn)'} />
          </View>
          {eat === floor && <Text style={type.small}>That pace would go under {floor.toLocaleString()} kcal a day, so this is held at {floor.toLocaleString()}: below that it’s hard to get enough nutrients from food. Try a slower pace.</Text>}
          {!bulking && pace >= 1 && <Text style={type.small}>1% a week is the upper limit. Leaner people keep more muscle at around 0.5%.</Text>}
          <Text style={type.small}>A plan, not a promise: your burn drops a little as you lose, and the first weeks move with water, so check in and adjust.</Text>
          <View style={s.table}>
            {shown.map((c) => (
              <View key={c.date} style={s.row} accessible accessibilityLabel={`${date(c.date)}: ${units.label(c.kg)}`}>
                <Text style={[type.body, { flex: 1 }]}>{date(c.date)}</Text>
                <Text style={[type.body, type.number, { fontWeight: '700' }]}>{units.label(c.kg)}</Text>
              </View>
            ))}
          </View>
          {advanced && <Text style={type.small}>Each week changes by {pace}% of the weight you're at then, so it slows a little as you go. Calories: your measured burn {bulking ? '+' : '−'} {Math.abs(Math.round((weeklyKg * KCAL_PER_KG) / 7))} kcal a day (the first week's change × 7,700 kcal per kg ÷ 7). Never under {floor.toLocaleString()} (Jensen et al., AHA/ACC/TOS guideline, Circulation 2014). Paces: 0.5–1% a week keeps muscle on a cut (Helms et al., JISSN 2014; Garthe et al., IJSNEM 2011); about 0.25–0.5% a week for a lean bulk, slower for experienced lifters (Iraki et al., Sports 2019).</Text>}
        </>
      )}
      {startKg && targetKg && !plan && <Text style={type.small}>{Math.abs(targetKg - startKg) < 0.1 ? 'That’s where you are now.' : 'At this pace it would take more than three years. Pick a faster pace or a nearer target.'}</Text>}
    </View>
  );
}

/** Body fat from a tape measure (US Navy), BMI, and fat-free mass index. */
function Body({ advanced, mine }: { advanced: boolean; mine: Mine | null }) {
  const units = useUnit();
  const len = useLength();
  const [about, set] = useAbout();
  const latest = (kind: string) => {
    const m = mine?.measurements.find((x) => x.kind === kind && x.unit === 'cm')?.latest;
    return m ? len.show(m.value) : '';
  };
  const [tape, setTape] = useState<{ neck: string | null; waist: string | null; hips: string | null }>({ neck: null, waist: null, hips: null });
  const neck = tape.neck ?? latest('neck');
  const waist = tape.waist ?? latest('waist');
  const hips = tape.hips ?? latest('hips');
  const kg = trendKg(mine);
  const heightCm = about.heightCm;
  const neckCm = len.toCm(neck);
  const waistCm = len.toCm(waist);
  const bf = about.sex && heightCm && neckCm && waistCm ? navyBodyFat({ sex: about.sex, heightCm, neckCm, waistCm, hipCm: len.toCm(hips) }) : null;
  const b = kg && heightCm ? bmi(kg, heightCm) : null;
  const f = kg && heightCm && bf !== null ? ffmi(kg, heightCm, bf) : null;
  return (
    <View style={s.card}>
      <Text style={type.title} accessibilityRole="header">Body fat and BMI</Text>
      <AboutYou about={about} set={set} />
      <View style={s.inputs}>
        <Field label={`Neck (${len.unit})`} value={neck} onChange={(t) => setTape({ ...tape, neck: t })} />
        <Field label={`Waist at navel (${len.unit})`} value={waist} onChange={(t) => setTape({ ...tape, waist: t })} />
        {about.sex === 'female' && <Field label={`Hips (${len.unit})`} value={hips} onChange={(t) => setTape({ ...tape, hips: t })} />}
      </View>
      <View style={s.results}>
        <Result label="Body fat (estimate)" value={bf !== null ? `${bf.toFixed(1)}%` : '–'} note={bf !== null && kg ? `${units.roundLabel(kg * (1 - bf / 100))} lean` : 'Sex, height, neck and waist needed'} />
        <Result label="BMI" value={b ? b.toFixed(1) : '–'} note={kg ? `At ${units.label(kg)}` : 'Weigh in on Progress'} />
        {f !== null && <Result label="Fat-free mass index" value={f.toFixed(1)} />}
      </View>
      <Text style={type.small}>The tape method is usually within about 3–4 percentage points of a lab scan and can miss small changes over a few weeks. BMI can't tell muscle from fat, so it reads high for people who lift.</Text>
      {advanced && (
        <View style={{ gap: space(2) }}>
          <Text style={type.small}>US Navy method (centimetres): {about.sex === 'female' ? '495 ÷ (1.29579 − 0.35004 × log10(waist + hips − neck) + 0.221 × log10(height)) − 450' : '495 ÷ (1.0324 − 0.19077 × log10(waist − neck) + 0.15456 × log10(height)) − 450'} (Hodgdon and Beckett, Naval Health Research Center 1984; compared with DXA in Foulis et al., Front Physiol 2023).</Text>
          <Text style={type.small}>BMI: weight (kg) ÷ height (m)². FFMI: lean mass (kg) ÷ height (m)², plus 6.1 × (1.8 − height in m) so heights compare (Kouri et al., Clin J Sport Med 1995). BMI misreads muscular athletes (Ode et al., Med Sci Sports Exerc 2007).</Text>
        </View>
      )}
    </View>
  );
}

/** The plate calculator from Train, opened from here. */
function Plates() {
  const units = useUnit();
  const [open, setOpen] = useState(false);
  return (
    <View style={s.card}>
      <Text style={type.title} accessibilityRole="header">Plates</Text>
      <Text style={type.body}>Pick the bar, type the weight, and see each side drawn out, with the nearest weights you can load when it isn’t exact. Your gym’s plates are saved with your training setup.</Text>
      <Pressable onPress={() => setOpen(true)} style={buttons.filled} accessibilityRole="button">
        <Text style={buttons.filledText}>Open the plate calculator</Text>
      </Pressable>
      <PlateCalculator visible={open} weightKg={null} exercise={null} unit={units.unit} onClose={() => setOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), gap: space(4), maxWidth: 640, width: '100%', alignSelf: 'center' },
  contentWide: { maxWidth: 1200, padding: space(6) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), flexWrap: 'wrap' },
  body: { gap: space(4) },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start' },
  list: { gap: space(2) },
  listWide: { width: 320 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.row, padding: space(4), minHeight: 44 },
  itemOn: { backgroundColor: color.raised },
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3) },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  results: { flexDirection: 'row', flexWrap: 'wrap', gap: space(4), paddingVertical: space(2) },
  input: { ...type.body, ...type.number, backgroundColor: color.chalk, borderRadius: radius.input, borderWidth: 1, borderColor: color.line, padding: space(3), color: color.iron },
  table: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2), paddingHorizontal: space(3), borderRadius: radius.input },
  rowOn: { backgroundColor: color.raised },
});
