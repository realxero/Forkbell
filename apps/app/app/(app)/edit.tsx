import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DiaryEntry } from '@forkbell/shared';
import { api, ApiError } from '../../lib/api';
import { changeEntryNutrition, findCachedEntry, updateEntry } from '../../lib/actions';
import { forAmount } from '@forkbell/shared';
import { TextInput } from 'react-native';
import { removeWithUndo } from '../../components/EntryMenu';
import { AmountPicker } from '../../components/AmountPicker';
import { color, space, type } from '../../lib/theme';

/** Change an entry's amount or meal, or remove it. */
export default function EditEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = findCachedEntry(id);
    api<{ entry: DiaryEntry }>(`/api/diary/entry/${id}`).then(
      (r) => setEntry(r.entry),
      (e) => (cached && (e instanceof ApiError ? e.status === 0 || e.status === 404 : false) ? setEntry(cached) : setError(e instanceof Error ? e.message : String(e))),
    );
  }, [id]);

  const remove = async () => {
    try {
      router.back();
      await removeWithUndo(entry!);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.head}>
          <Text style={type.title}>Edit entry</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={s.link}>Cancel</Text>
          </Pressable>
        </View>
        {!entry ? (
          error ? <Text style={[s.error, { padding: space(4) }]}>{error}</Text> : <ActivityIndicator color={color.iron} style={{ marginTop: space(10) }} />
        ) : (
          <AmountPicker
            food={entry.food}
            initialGrams={entry.grams}
            initialMeal={entry.meal}
            submitLabel={() => 'Save'}
            error={error}
            onSubmit={async (grams, meal) => {
              setError(null);
              try {
                await updateEntry(entry, { grams, meal });
                router.back();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <FixNumbers entry={entry} onDone={() => router.back()} />
            <Pressable onPress={remove} style={s.remove} accessibilityLabel={`Remove ${entry.food.name}`}>
              <Text style={s.removeText}>Remove from diary</Text>
            </Pressable>
          </AmountPicker>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Correct this entry's calories and macros (a label that differs, a home
 * recipe). Only this entry changes; the food and other days stay as they were.
 */
function FixNumbers({ entry, onDone }: { entry: DiaryEntry; onDone: () => void }) {
  const now = forAmount(entry.food.per100, entry.grams);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ kcal: String(now.kcal), protein: String(now.protein), carbs: String(now.carbs), fat: String(now.fat) });
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <Pressable onPress={() => setOpen(true)} style={{ alignSelf: 'center', padding: space(2) }}>
        <Text style={s.link}>Correct the calories or macros</Text>
      </Pressable>
    );
  const num = (k: keyof typeof v) => Number(v[k].replace(',', '.'));
  const field = (k: keyof typeof v, label: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={type.small}>{label}</Text>
      <TextInput value={v[k]} onChangeText={(t) => setV({ ...v, [k]: t })} keyboardType="decimal-pad" style={s.input} accessibilityLabel={label} />
    </View>
  );
  const save = async () => {
    setError(null);
    const t = { kcal: num('kcal'), protein: num('protein'), carbs: num('carbs'), fat: num('fat') };
    if (Object.values(t).some((x) => !(x >= 0))) return setError('Enter numbers of 0 or more.');
    // The same check as foods you type in: the macros have to be able to make those calories.
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    if (t.kcal > 20 && Math.abs(fromMacros - t.kcal) > Math.max(40, t.kcal * 0.35)) return setError(`Those macros make about ${Math.round(fromMacros)} kcal, not ${t.kcal}. Check the numbers.`);
    try {
      await changeEntryNutrition(entry, t);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <View style={s.fix}>
      <Text style={[type.body, { fontWeight: '700' }]}>For the {entry.grams} g you logged</Text>
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        {field('kcal', 'Calories')}
        {field('protein', 'Protein g')}
      </View>
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        {field('carbs', 'Carbs g')}
        {field('fat', 'Fat g')}
      </View>
      <Text style={type.small}>Only this entry changes. {entry.food.name} keeps its numbers everywhere else.</Text>
      {error && <Text style={s.error}>{error}</Text>}
      <Pressable onPress={save} style={s.save}><Text style={s.saveText}>Save these numbers</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  fix: { gap: space(2), marginHorizontal: space(4), marginTop: space(2), padding: space(3), borderRadius: 14, backgroundColor: color.card, borderWidth: 1, borderColor: color.line },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(2) },
  save: { backgroundColor: color.accent, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  saveText: { color: color.onAccent, fontWeight: '700', fontSize: 15 },
  screen: { flex: 1, backgroundColor: color.chalk },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space(4) },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  remove: { alignSelf: 'center', padding: space(3), marginTop: space(2) },
  removeText: { color: color.over, fontWeight: '700', fontSize: 16 },
});
