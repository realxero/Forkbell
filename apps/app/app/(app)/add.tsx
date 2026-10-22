import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { forAmount, mealForTime, per100Problems, todayLocal, type Food, type FoodCandidate, type Meal } from '@forkbell/shared';
import { api, post } from '../../lib/api';
import { color, space, type } from '../../lib/theme';

type Pick = Food | FoodCandidate;
type SearchResult = { mine: Food[]; results: FoodCandidate[]; errors: string[] };
const MEAL_NAMES: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

export default function AddFood() {
  const params = useLocalSearchParams<{ meal?: Meal; date?: string }>();
  const meal = params.meal ?? mealForTime();
  const date = params.date ?? todayLocal();

  const [q, setQ] = useState('');
  const [found, setFound] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Pick | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search 350 ms after typing stops; ignore answers to older queries.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return setFound(null);
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api<SearchResult>(`/api/foods/search?q=${encodeURIComponent(query)}`);
        if (live) setFound(r);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (live) setSearching(false);
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const log = async (food: Pick, grams: number) => {
    setError(null);
    try {
      await post('/api/diary', 'id' in food ? { date, meal, grams, foodId: food.id } : { date, meal, grams, food });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.head}>
          <Text style={type.title}>Add to {MEAL_NAMES[meal]}</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={s.link}>Close</Text>
          </Pressable>
        </View>

        {picked ? (
          <Amount food={picked} meal={meal} onAdd={(g) => log(picked, g)} onBack={() => setPicked(null)} error={error} />
        ) : creating ? (
          <CreateFood initialName={q} onCreated={(f) => { setCreating(false); setPicked(f); }} onCancel={() => setCreating(false)} />
        ) : (
          <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
            <TextInput value={q} onChangeText={setQ} placeholder="Search foods or brands" autoFocus style={s.input} returnKeyType="search" />
            {error && <Text style={s.error}>{error}</Text>}
            {searching && <ActivityIndicator color={color.iron} />}
            {found?.errors.map((m) => <Text key={m} style={type.small}>{m}</Text>)}

            {found && found.mine.length > 0 && <Text style={s.section}>Your foods</Text>}
            {found?.mine.map((f) => <Row key={f.id} food={f} onPress={() => setPicked(f)} />)}

            {found && found.results.length > 0 && <Text style={s.section}>Food databases</Text>}
            {found?.results.map((f) => <Row key={`${f.source}:${f.sourceId}`} food={f} onPress={() => setPicked(f)} />)}

            {found && !searching && found.mine.length + found.results.length === 0 && (
              <Text style={type.body}>Nothing matches “{q.trim()}”. Add it as your own food below.</Text>
            )}
            <Pressable onPress={() => setCreating(true)} style={{ paddingVertical: space(3) }}>
              <Text style={s.link}>Create your own food</Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Row({ food, onPress }: { food: Pick; onPress: () => void }) {
  const serving = food.servingGrams ? forAmount(food.per100, food.servingGrams).kcal : null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={type.body} numberOfLines={2}>{food.name}</Text>
        {food.brand ? <Text style={type.small} numberOfLines={1}>{food.brand}</Text> : null}
      </View>
      <Text style={[type.small, type.number, { textAlign: 'right' }]}>
        {serving !== null ? `${serving} kcal\nper serving` : `${Math.round(food.per100.kcal)} kcal\nper 100 g`}
      </Text>
    </Pressable>
  );
}

function Amount({ food, meal, onAdd, onBack, error }: { food: Pick; meal: Meal; onAdd: (grams: number) => void; onBack: () => void; error: string | null }) {
  const [grams, setGrams] = useState(String(food.servingGrams ?? 100));
  const [busy, setBusy] = useState(false);
  const g = Number(grams.replace(',', '.'));
  const valid = Number.isFinite(g) && g > 0 && g <= 10000;
  const n = useMemo(() => forAmount(food.per100, valid ? g : 0), [food, g, valid]);

  const chips = [
    ...(food.servingGrams ? [{ label: food.servingLabel ? `1 serving (${food.servingLabel})` : `1 serving (${food.servingGrams} g)`, g: food.servingGrams }] : []),
    { label: '100 g', g: 100 },
  ];

  return (
    <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>{food.name}</Text>
      {food.brand ? <Text style={type.small}>{food.brand}</Text> : null}

      <View style={s.chips}>
        {chips.map((c) => (
          <Pressable key={c.label} onPress={() => setGrams(String(c.g))} style={[s.chip, g === c.g && s.chipOn]}>
            <Text style={[type.small, g === c.g && { color: color.card }]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.amountRow}>
        <TextInput value={grams} onChangeText={setGrams} keyboardType="decimal-pad" style={[s.input, { flex: 1 }]} selectTextOnFocus />
        <Text style={type.body}>grams</Text>
      </View>

      <View style={s.nutrition}>
        <Stat label="Calories" value={`${n.kcal}`} />
        <Stat label="Protein" value={`${n.protein} g`} tint={color.protein} />
        <Stat label="Carbs" value={`${n.carbs} g`} tint={color.carbs} />
        <Stat label="Fat" value={`${n.fat} g`} tint={color.fat} />
      </View>

      {error && <Text style={s.error}>{error}</Text>}
      <Pressable
        disabled={!valid || busy}
        onPress={async () => { setBusy(true); await onAdd(g); setBusy(false); }}
        style={[s.button, (!valid || busy) && { opacity: 0.4 }]}
      >
        <Text style={s.buttonText}>Add to {MEAL_NAMES[meal]}</Text>
      </Pressable>
      <Pressable onPress={onBack} style={{ alignSelf: 'center', padding: space(3) }}>
        <Text style={s.link}>Pick a different food</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={{ flex: 1, gap: space(1) }}>
      {tint ? <View style={{ height: 4, borderRadius: 2, backgroundColor: tint }} /> : <View style={{ height: 4 }} />}
      <Text style={[type.title, type.number]}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

function CreateFood({ initialName, onCreated, onCancel }: { initialName: string; onCreated: (f: Food) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: initialName.trim(), brand: '', kcal: '', protein: '', carbs: '', fat: '', serving: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const num = (v: string) => Number(v.replace(',', '.') || 0);
  const per100 = { kcal: num(form.kcal), protein: num(form.protein), carbs: num(form.carbs), fat: num(form.fat) };
  const problem = form.kcal ? per100Problems(per100)[0] : null;

  const save = async () => {
    setError(null);
    try {
      const { food } = await post<{ food: Food }>('/api/foods', {
        name: form.name,
        brand: form.brand || null,
        source: 'custom',
        per100,
        servingGrams: form.serving ? num(form.serving) : null,
      });
      onCreated(food);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const field = (k: keyof typeof form, label: string, numeric = true) => (
    <View style={{ flex: 1, gap: space(1) }}>
      <Text style={type.small}>{label}</Text>
      <TextInput value={form[k]} onChangeText={set(k)} keyboardType={numeric ? 'decimal-pad' : 'default'} style={s.input} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
      {field('name', 'Name', false)}
      {field('brand', 'Brand (optional)', false)}
      <Text style={[type.small, { marginTop: space(2) }]}>Per 100 g, from the label’s per-100 g column</Text>
      <View style={s.amountRow}>{field('kcal', 'Calories')}{field('protein', 'Protein g')}</View>
      <View style={s.amountRow}>{field('carbs', 'Carbs g')}{field('fat', 'Fat g')}</View>
      {field('serving', 'One serving in grams (optional)')}
      {(problem || error) && <Text style={s.error}>{error ?? problem}</Text>}
      <Pressable disabled={!form.name.trim() || !form.kcal || Boolean(problem)} onPress={save} style={[s.button, (!form.name.trim() || !form.kcal || problem) && { opacity: 0.4 }]}>
        <Text style={s.buttonText}>Save food</Text>
      </Pressable>
      <Pressable onPress={onCancel} style={{ alignSelf: 'center', padding: space(3) }}>
        <Text style={s.link}>Back to search</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space(4) },
  list: { padding: space(4), gap: space(2), paddingBottom: space(16), maxWidth: 640, width: '100%', alignSelf: 'center' },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  section: { ...type.small, fontWeight: '700', marginTop: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, padding: space(3), borderRadius: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(2) },
  chip: { borderWidth: 1, borderColor: color.line, borderRadius: 20, paddingHorizontal: space(3), paddingVertical: space(2), backgroundColor: color.card },
  chipOn: { backgroundColor: color.iron, borderColor: color.iron },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  nutrition: { flexDirection: 'row', gap: space(3), backgroundColor: color.card, borderRadius: 12, padding: space(4), marginVertical: space(2) },
  error: { ...type.body, color: color.over },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center', marginTop: space(2) },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
});
