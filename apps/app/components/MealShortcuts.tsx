import { useAuth } from '../lib/auth';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { addDays, sumEntries, todayLocal, type DiaryDay, type DiaryEntry, type Meal, type SavedMeal, entryName, entryAmountText } from '@forkbell/shared';
import { deleteSavedMeal, logItems } from '../lib/actions';
import { cachedGet } from '../lib/sync';
import { confirm } from '../lib/confirm';
import { MEAL_NAMES } from './AmountPicker';
import { FoodIcon } from './FoodIcon';
import { color, radius, space, type } from '../lib/theme';

const dayName = (date: string) => {
  const t = todayLocal();
  if (date === addDays(t, -1)) return 'Yesterday';
  if (date === t) return 'Today';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};

/**
 * Above Recent foods on the add screen: your saved meals, and this meal from
 * earlier days (step back with ‹ ›). One tap logs the whole thing.
 */
export function MealShortcuts({ date, meal, onLogged }: { date: string; meal: Meal; onLogged: (text: string) => void }) {
  const { me } = useAuth();
  const [saved, setSaved] = useState<SavedMeal[]>([]);
  const [back, setBack] = useState(1); // days before `date` to look from
  const [prev, setPrev] = useState<{ date: string; entries: DiaryEntry[] } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    cachedGet<{ meals: SavedMeal[] }>('/api/meals').then((r) => setSaved(r.meals), () => setSaved([]));
  }, []);

  // The nearest earlier day (up to two weeks back) with food in this meal.
  useEffect(() => {
    let live = true;
    (async () => {
      setPrev(undefined);
      for (let i = back; i <= back + 13; i++) {
        const d = addDays(date, -i);
        try {
          const day = await cachedGet<DiaryDay>(`/api/diary/${d}`);
          const entries = day.entries.filter((e) => e.meal === meal);
          if (entries.length) {
            if (live) setPrev({ date: d, entries });
            return;
          }
        } catch {
          /* offline and not on this device: keep looking */
        }
      }
      if (live) setPrev(null);
    })();
    return () => {
      live = false;
    };
  }, [date, meal, back]);

  const logAll = async (items: { food: DiaryEntry['food']; grams: number }[], label: string) => {
    setBusy(true);
    try {
      await logItems(date, meal, items);
      onLogged(label);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space(3) }}>
      {prev !== null && (
        <View style={s.card}>
          <View style={s.head}>
            <Text style={[type.label, { flex: 1 }]}>Previous {MEAL_NAMES[meal].toLowerCase()}</Text>
            {prev && (
              <>
                <Pressable onPress={() => setBack(addDaysBetween(prev.date, date) + 1)} hitSlop={8} accessibilityLabel="Earlier">
                  <Ionicons name="chevron-back" size={20} color={color.accent} />
                </Pressable>
                <Text style={[type.small, { fontWeight: '700' }]}>{dayName(prev.date)}</Text>
                <Pressable disabled={back <= 1} onPress={() => setBack(1)} hitSlop={8} accessibilityLabel="Most recent" style={back <= 1 && { opacity: 0.3 }}>
                  <Ionicons name="chevron-forward" size={20} color={color.accent} />
                </Pressable>
              </>
            )}
          </View>
          {prev === undefined ? (
            <Text style={type.small}>Looking…</Text>
          ) : (
            <>
              {prev.entries.map((e) => (
                <View key={e.id} style={s.row}>
                  <FoodIcon name={e.food.name} brand={e.food.brand} size={28} />
                  <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{entryName(e)}</Text>
                  <Text style={[type.small, type.number]}>{entryAmountText(e, me?.weightUnit ?? 'lb')}</Text>
                </View>
              ))}
              <Pressable disabled={busy} onPress={() => logAll(prev.entries, `${MEAL_NAMES[meal]} from ${dayName(prev.date).toLowerCase()}`)} style={[s.button, busy && { opacity: 0.5 }]}>
                <Text style={s.buttonText}>Log all · {sumEntries(prev.entries).kcal} kcal</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {saved.length > 0 && (
        <View style={s.card}>
          <Text style={type.label}>Saved meals</Text>
          {saved.map((m) => (
            <Pressable
              key={m.id}
              disabled={busy}
              onPress={() => logAll(m.items, m.name)}
              onLongPress={async () => (await confirm(`Remove “${m.name}”?`, 'The foods themselves stay.', 'Remove')) && (await deleteSavedMeal(m), setSaved((x) => x.filter((y) => y.id !== m.id)))}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
              accessibilityHint="Logs every food in it. Hold to remove it."
            >
              <View style={s.mealIcon}><Ionicons name="bookmark" size={16} color={color.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={type.body} numberOfLines={1}>{m.name}</Text>
                <Text style={type.small} numberOfLines={1}>{m.items.map((i) => i.food.name).join(', ')}</Text>
              </View>
              <Text style={[type.small, type.number, { fontWeight: '700' }]}>{sumEntries(m.items).kcal} kcal</Text>
              <Ionicons name="add-circle" size={26} color={color.accent} />
            </Pressable>
          ))}
          <Text style={type.small}>Save more by holding a food in the diary → Select several → Save as meal.</Text>
        </View>
      )}

      <Pressable onPress={() => router.push('/recipes')} style={[s.row, { paddingHorizontal: space(1) }]}>
        <Ionicons name="restaurant-outline" size={18} color={color.accent} />
        <Text style={{ color: color.accent, fontWeight: '700' }}>Recipes: build a dish from ingredients</Text>
      </Pressable>
    </View>
  );
}

const addDaysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(3), gap: space(2), borderWidth: 1, borderColor: color.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: 4 },
  mealIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: color.infoBg, alignItems: 'center', justifyContent: 'center' },
  button: { backgroundColor: color.accent, borderRadius: 10, paddingVertical: space(2) + 2, alignItems: 'center', marginTop: space(1) },
  buttonText: { color: color.onAccent, fontWeight: '700', fontSize: 15 },
});
