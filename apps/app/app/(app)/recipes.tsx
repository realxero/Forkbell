import { ImportRecipe } from '../../components/ImportRecipe';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { recipePer100, type Food, type FoodCandidate, type Recipe } from '@forkbell/shared';
import { api, del, post, put } from '../../lib/api';
import { confirm } from '../../lib/confirm';
import { updateCache } from '../../lib/sync';
import { FoodIcon } from '../../components/FoodIcon';
import { NumberField } from '../../components/NumberField';
import { color, radius, space, type } from '../../lib/theme';

type Item = { food: Food; grams: number };
type Draft = { id: string | null; name: string; servings: string; cooked: string; items: Item[] };
const blank: Draft = { id: null, name: '', servings: '4', cooked: '', items: [] };

/**
 * Recipes: a dish built from ingredients. It's saved as one of your foods,
 * with "1 serving" ready to pick, so logging it is one tap.
 */
export default function Recipes() {
  const [list, setList] = useState<Recipe[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setList((await api<{ recipes: Recipe[] }>('/api/recipes')).recipes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  if (draft) return <Editor draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); void load(); }} />;

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
        <Text style={[type.hero, { fontSize: 30 }]}>Recipes</Text>
        <Text style={type.small}>Add the ingredients once; Forkbell works out the numbers per serving. Recipes show up in food search like your other foods.</Text>
        {error && <Text style={s.error}>{error}</Text>}
        {!list && !error && <ActivityIndicator color={color.iron} />}
        {list?.length === 0 && <Text style={type.body}>No recipes yet.</Text>}
        {list?.map((r) => {
          const serving = r.food.servingGrams ?? 100;
          const kcal = Math.round((r.food.per100.kcal * serving) / 100);
          const protein = Math.round((r.food.per100.protein * serving) / 10) / 10;
          return (
            <Pressable
              key={r.food.id}
              onPress={() => setDraft({ id: r.food.id, name: r.food.name, servings: String(r.servings), cooked: r.cookedGrams ? String(r.cookedGrams) : '', items: r.items })}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
            >
              <View style={s.row}>
                <FoodIcon name={r.food.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '700' }]}>{r.food.name}</Text>
                  <Text style={type.small}>{r.servings} servings · {kcal} kcal and {protein} g protein each · {r.items.length} ingredients</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={color.ironSoft} />
              </View>
            </Pressable>
          );
        })}
        <Pressable onPress={() => setDraft(blank)} style={s.primary}><Text style={s.primaryText}>New recipe</Text></Pressable>
        <Pressable onPress={() => setImporting(true)} style={{ alignSelf: 'center', padding: space(3) }} accessibilityRole="button">
          <Text style={s.link}>Import a recipe (link, Mealie or text)</Text>
        </Pressable>
      </ScrollView>
      <ImportRecipe
        visible={importing}
        onClose={() => setImporting(false)}
        onReady={(d) => {
          setImporting(false);
          setDraft({ id: null, name: d.name, servings: d.servings, cooked: '', items: d.items });
        }}
      />
    </SafeAreaView>
  );
}

function Editor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ mine: Food[]; results: FoodCandidate[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return setFound(null);
    let live = true;
    const t = setTimeout(() => {
      api<{ mine: Food[]; results: FoodCandidate[] }>(`/api/foods/search?q=${encodeURIComponent(query)}`).then((r) => live && setFound(r), () => live && setFound(null));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const add = async (f: Food | FoodCandidate) => {
    setError(null);
    try {
      // A database result is saved to your foods first, so the recipe can point at it.
      const food = 'id' in f ? f : (await post<{ food: Food }>('/api/foods', f)).food;
      const grams = food.portions[0]?.grams ?? food.servingGrams ?? 100;
      setD((x) => ({ ...x, items: [...x.items, { food, grams }] }));
      setQ('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const servings = Number(d.servings.replace(',', '.')) || 0;
  const cooked = d.cooked.trim() ? Number(d.cooked.replace(',', '.')) : null;
  const preview = d.items.length ? recipePer100(d.items, cooked) : null;
  const each = preview && servings > 0 ? { kcal: Math.round(preview.total.kcal / servings), protein: Math.round((preview.total.protein / servings) * 10) / 10, grams: Math.round(preview.weight / servings) } : null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { name: d.name.trim(), servings, cookedGrams: cooked, items: d.items.map((i) => ({ foodId: i.food.id, grams: i.grams })) };
      const r = d.id ? await put<{ recipe: Recipe }>(`/api/recipes/${d.id}`, body) : await post<{ recipe: Recipe }>('/api/recipes', body);
      // Keep the offline food list in step so the recipe can be searched straight away.
      updateCache<{ foods: Food[] }>('/api/foods/library', (lib) => lib && { foods: [r.recipe.food, ...lib.foods.filter((f) => f.id !== r.recipe.food.id)] });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!d.id || !(await confirm(`Stop treating “${d.name}” as a recipe?`, 'It stays in your foods and diary with its current numbers.', 'Remove'))) return;
    await del(`/api/recipes/${d.id}`);
    onSaved();
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Pressable onPress={onClose} hitSlop={12}><Text style={s.link}>Cancel</Text></Pressable>
            <Text style={type.title}>{d.id ? 'Edit recipe' : 'New recipe'}</Text>
            <Pressable disabled={busy || !d.name.trim() || !d.items.length || servings <= 0} onPress={save} hitSlop={12}>
              <Text style={[s.link, (busy || !d.name.trim() || !d.items.length || servings <= 0) && { opacity: 0.4 }]}>Save</Text>
            </Pressable>
          </View>
          {error && <Text style={s.error}>{error}</Text>}
          <TextInput value={d.name} onChangeText={(name) => setD({ ...d, name })} placeholder="Name, e.g. Turkey chili" style={s.input} maxLength={200} />
          <View style={s.row}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.small}>Servings it makes</Text>
              <TextInput value={d.servings} onChangeText={(servings) => setD({ ...d, servings })} keyboardType="decimal-pad" style={s.input} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.small}>Cooked weight, g (optional)</Text>
              <TextInput value={d.cooked} onChangeText={(c) => setD({ ...d, cooked: c })} keyboardType="decimal-pad" placeholder={preview ? `${Math.round(d.items.reduce((t, i) => t + i.grams, 0))} if not weighed` : ''} style={s.input} />
            </View>
          </View>
          <Text style={type.small}>Weighing the finished pot is the most accurate: water cooks off or soaks in. Leave it empty to use the ingredients’ total.</Text>

          <Text style={type.label}>Ingredients</Text>
          {d.items.map((it, i) => (
            <View key={`${it.food.id}-${i}`} style={s.row}>
              <FoodIcon name={it.food.name} brand={it.food.brand} size={30} />
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{it.food.name}</Text>
              <NumberField
                label={`${it.food.name} grams`}
                value={String(it.grams)}
                onCommit={(t) => {
                  const g = Number(t.replace(',', '.'));
                  if (g > 0 && g <= 10000) setD((x) => ({ ...x, items: x.items.map((y, j) => (j === i ? { ...y, grams: g } : y)) }));
                }}
                style={[s.input, { width: 76, textAlign: 'center', paddingVertical: space(2) }]}
              />
              <Text style={type.small}>g</Text>
              <Pressable onPress={() => setD((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))} hitSlop={8} accessibilityLabel={`Remove ${it.food.name}`}>
                <Ionicons name="close-circle" size={22} color={color.ironSoft} />
              </Pressable>
            </View>
          ))}
          <TextInput value={q} onChangeText={setQ} placeholder="Add an ingredient" style={s.input} />
          {found && (
            <View style={s.card}>
              {([...found.mine.slice(0, 6), ...found.results.slice(0, 6)] as (Food | FoodCandidate)[]).map((f) => (
                <Pressable key={'id' in f ? (f as Food).id : `${f.source}:${f.sourceId}`} onPress={() => add(f)} style={({ pressed }) => [s.row, { paddingVertical: 6 }, pressed && { opacity: 0.6 }]}>
                  <FoodIcon name={f.name} brand={f.brand} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.body} numberOfLines={1}>{f.name}</Text>
                    <Text style={type.small} numberOfLines={1}>{f.brand ? `${f.brand} · ` : ''}{Math.round(f.per100.kcal)} kcal per 100 g</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={color.accent} />
                </Pressable>
              ))}
            </View>
          )}

          {each && (
            <View style={[s.card, { backgroundColor: color.infoBg }]}>
              <Text style={[type.body, { fontWeight: '800' }]}>Each serving: {each.kcal} kcal · {each.protein} g protein</Text>
              <Text style={type.small}>About {each.grams} g per serving · whole recipe {preview!.total.kcal.toLocaleString()} kcal</Text>
            </View>
          )}
          {d.id && <Pressable onPress={remove} style={{ alignSelf: 'center', padding: space(3) }}><Text style={{ color: color.over, fontWeight: '700' }}>Stop using as a recipe</Text></Pressable>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(3), gap: space(2), borderWidth: 1, borderColor: color.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  primary: { backgroundColor: color.accent, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  primaryText: { color: color.onAccent, fontSize: 16, fontWeight: '700' },
});
