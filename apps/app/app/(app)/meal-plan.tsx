// The weekly meal plan, and targets a coach suggests. Yours to keep, or kept
// for you by someone you invited to plan your food (Sharing → "Plan my food").
// Planning never logs anything: Today shows the day's plan, and you log it.
import { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MealPlanCell, SavedMeal, TargetSuggestion } from '@forkbell/shared';
import { Pressable } from '../../components/Tap';
import { Chip } from '../../components/AmountPicker';
import { cachedGet, send } from '../../lib/sync';
import { MEAL_NAMES, shownMeals } from '../../lib/meals';
import { getViewing, useViewing } from '../../lib/profile';
import { buttons } from '../../lib/buttons';
import { color, radius, space, type } from '../../lib/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MealPlan() {
  const viewing = useViewing();
  const [cells, setCells] = useState<MealPlanCell[]>([]);
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [day, setDay] = useState(new Date().getDay());
  /** notes being typed, by weekday and meal; saved when the box is left */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  /** said aloud (a live region) after each save */
  const [saved, setSaved] = useState<string | null>(null);
  // A note saves a second after you stop typing (and on leaving the box), so
  // nothing typed is lost by going straight to another screen.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const later = (key: string, fn: () => void) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, 1000);
  };

  const load = useCallback(() => {
    cachedGet<{ cells: MealPlanCell[] }>('/api/plans/meal-plan').then((r) => setCells(r.cells), (e) => setError(e instanceof Error ? e.message : String(e)));
    cachedGet<{ meals: SavedMeal[] }>('/api/meals').then((r) => setMeals(r.meals), () => {});
  }, []);
  useFocusEffect(load);

  const cellFor = (meal: MealPlanCell['meal']) => cells.find((c) => c.weekday === day && c.meal === meal);
  const save = async (next: MealPlanCell) => {
    // Shows straight away; sent now, or when there's a connection.
    setCells((all) => [...all.filter((c) => !(c.weekday === next.weekday && c.meal === next.meal)), ...(next.note || next.savedMealId ? [next] : [])]);
    try {
      setError(null);
      await send('PUT', '/api/plans/meal-plan', { weekday: next.weekday, meal: next.meal, note: next.note || null, savedMealId: next.savedMealId }, { label: `Plan ${MEAL_NAMES[next.meal]}`, coalesceKey: `plan:${viewing?.id ?? 'me'}:${next.weekday}:${next.meal}` });
      setSaved(`Saved ${DAYS[next.weekday]} ${MEAL_NAMES[next.meal].toLowerCase()}.`);
    } catch (e) {
      // Refused (a share ended, bad data): show what's really saved again.
      setError(e instanceof Error ? e.message : String(e));
      load();
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView keyboardDismissMode="on-drag" contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Pressable onPress={() => router.back()} style={s.back} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={26} color={color.iron} />
          </Pressable>
          <Text style={[type.pageTitle, { flex: 1 }]}>Meal plan</Text>
        </View>
        <Text style={type.small}>
          {viewing ? `You’re planning ${viewing.name}’s meals. They see the day’s plan on Today and log it themselves.` : 'Each day’s plan shows under its meals on Today, ready to log in a tap when it’s a saved meal.'}
        </Text>
        <Text style={[type.small, error && { color: color.over }]} accessibilityLiveRegion="polite">{error ?? saved ?? ''}</Text>

        <View style={s.wrap} accessibilityRole="radiogroup" accessibilityLabel="Day">
          {DAYS.map((d, i) => <Chip key={d} label={d} on={day === i} onPress={() => setDay(i)} />)}
        </View>

        {shownMeals().map((meal) => {
          const cell = cellFor(meal);
          const key = `${day}:${meal}`;
          const draft = drafts[key] ?? cell?.note ?? '';
          const commit = (text = draft) => {
            clearTimeout(timers.current[key]);
            const note = text.trim();
            if (note !== (cell?.note ?? '')) void save({ weekday: day, meal, note: note || null, savedMealId: cell?.savedMealId ?? null });
          };
          return (
            <View key={key} style={s.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                <Text style={[type.heading, { flex: 1 }]}>{MEAL_NAMES[meal]}</Text>
                {cell?.fromCoach && !viewing && <Text style={s.badge}>From your coach</Text>}
              </View>
              <TextInput
                value={draft}
                onChangeText={(t) => { setDrafts({ ...drafts, [key]: t }); later(key, () => commit(t)); }}
                onBlur={() => commit()}
                placeholder="What to eat, e.g. Greek yogurt, berries, granola"
                placeholderTextColor={color.placeholder}
                accessibilityLabel={`${DAYS[day]} ${MEAL_NAMES[meal]} plan`}
                multiline
                style={s.input}
              />
              {meals.length > 0 && (
                <View style={s.wrap}>
                  {meals.map((m) => (
                    <Chip
                      key={m.id}
                      role="checkbox"
                      label={m.name}
                      on={cell?.savedMealId === m.id}
                      onPress={() => void save({ weekday: day, meal, note: draft.trim() || null, savedMealId: cell?.savedMealId === m.id ? null : m.id })}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
        {meals.length === 0 && <Text style={type.small}>Saved meals show here too, to log in one tap. Save one from Today: hold a food, then Select.</Text>}

        <Suggestion coaching={Boolean(viewing)} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** A coach sets suggested targets here; you see them on Today and choose to apply them. */
function Suggestion({ coaching }: { coaching: boolean }) {
  const [current, setCurrent] = useState<TargetSuggestion | null>(null);
  const [form, setForm] = useState({ kcal: '', protein: '', carbs: '', fat: '', note: '' });
  const [status, setStatus] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      cachedGet<{ suggestion: TargetSuggestion | null }>('/api/plans/coach-targets').then((r) => {
        setCurrent(r.suggestion);
        const g = r.suggestion;
        if (g) setForm({ kcal: String(g.kcal), protein: g.protein?.toString() ?? '', carbs: g.carbs?.toString() ?? '', fat: g.fat?.toString() ?? '', note: g.note ?? '' });
      }, (e) => setStatus(`Couldn’t load the current suggestion (${e instanceof Error ? e.message : String(e)}), so saving would replace one you can’t see.`));
    }, []),
  );
  if (!coaching) {
    return current ? <Text style={type.small}>{current.fromCoach ? 'Your coach suggested' : 'Suggested:'} {current.kcal.toLocaleString()} kcal a day. It’s on Today, to apply or not.</Text> : null;
  }
  const num = (t: string) => (t.trim() ? Number(t.replace(',', '.')) : null);
  const save = async () => {
    const kcal = num(form.kcal);
    if (!kcal || kcal < 800) return setStatus('Calories from 800 up.');
    try {
      const r = await send('PUT', '/api/plans/coach-targets', { kcal: Math.round(kcal), protein: num(form.protein), carbs: num(form.carbs), fat: num(form.fat), note: form.note.trim() || null }, { label: 'Suggest targets', coalesceKey: `coach-targets:${getViewing()?.id ?? 'me'}` });
      setStatus(r.queued ? 'Saved on this device. It’s sent when you’re back online.' : 'Suggested. They’ll see it on Today.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const field = (key: 'kcal' | 'protein' | 'carbs' | 'fat', label: string) => (
    <View style={{ flex: 1, minWidth: 110, gap: space(1) }}>
      <Text style={type.label}>{label.toUpperCase()}</Text>
      <TextInput value={form[key]} onChangeText={(t) => setForm({ ...form, [key]: t })} keyboardType="decimal-pad" style={s.input} accessibilityLabel={label} />
    </View>
  );
  return (
    <View style={s.card}>
      <Text style={type.title} accessibilityRole="header">Suggest daily targets</Text>
      <Text style={type.small}>They choose whether to apply them; their goals don’t change until they do.</Text>
      <View style={s.wrap}>
        {field('kcal', 'Calories')}
        {field('protein', 'Protein g')}
        {field('carbs', 'Carbs g')}
        {field('fat', 'Fat g')}
      </View>
      <TextInput value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="A note, e.g. for training days" placeholderTextColor={color.placeholder} accessibilityLabel="Note" style={s.input} />
      <Pressable onPress={() => void save()} style={buttons.filled} accessibilityRole="button">
        <Text style={buttons.filledText}>Suggest these targets</Text>
      </Pressable>
      <Text style={type.small} accessibilityLiveRegion="polite">{status ?? ''}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(1), marginLeft: -space(2) },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3) },
  input: { ...type.body, backgroundColor: color.chalk, borderRadius: radius.input, borderWidth: 1, borderColor: color.line, padding: space(3), color: color.iron },
  badge: { ...type.label, color: color.iron, backgroundColor: color.infoBg, paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
});
