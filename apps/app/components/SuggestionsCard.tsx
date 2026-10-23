import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { forAmount, mealForTime, suggestForDay, todayLocal, type DiaryDay, type Food, type Meal, type RecentFood, type Suggestion } from '@forkbell/shared';
import { put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { addEntry, deleteEntry, foodLibrary } from '../lib/actions';
import { cachedGet, readCache, writeCache } from '../lib/sync';
import { color, space, type } from '../lib/theme';

/** The meal an idea goes into: the one for the time of day today, else the emptiest of lunch and dinner. */
function mealFor(day: DiaryDay, isToday: boolean): Meal {
  if (isToday) return mealForTime();
  const count = (m: Meal) => day.entries.filter((e) => e.meal === m).length;
  return count('lunch') <= count('dinner') ? 'lunch' : 'dinner';
}

export function SuggestionsCard({ day, onChanged }: { day: DiaryDay; onChanged: () => void }) {
  const { me, refreshMe } = useAuth();
  const [foods, setFoods] = useState<Food[]>([]);
  const [recent, setRecent] = useState<RecentFood[]>([]);
  const hiddenKey = `device:hidden-suggestions:${day.date}`;
  const [hidden, setHidden] = useState<string[]>(readCache<string[]>(hiddenKey) ?? []);
  const today = todayLocal();
  const isToday = day.date === today;

  useEffect(() => {
    foodLibrary().then(setFoods);
    cachedGet<{ recent: RecentFood[]; frequent: RecentFood[] }>(`/api/foods/recent?today=${today}`).then((r) => setRecent([...r.frequent, ...r.recent]), () => {});
  }, [today]);

  const list = useMemo(
    () => (me && day.date >= today ? suggestForDay({ day, foods, recent, prefs: me.preferences, hour: new Date().getHours(), isToday, hidden }) : []),
    [me, day, foods, recent, isToday, hidden, today],
  );
  if (!list.length) return null;

  const hide = (key: string) => {
    const next = [...hidden, key];
    setHidden(next);
    writeCache(hiddenKey, next);
  };
  const never = async (name: string) => {
    if (!me) return;
    await put('/api/me/preferences', { ...me.preferences, neverSuggest: [...me.preferences.neverSuggest, name] }).catch(() => {});
    await refreshMe();
  };
  const add = async (s: Suggestion, food: Food, grams: number) => {
    if (s.replaces) {
      // Swap: add the lighter one in the same meal first, then remove the original.
      await addEntry({ date: day.date, meal: s.replaces.meal, grams, food });
      await deleteEntry(s.replaces);
    } else await addEntry({ date: day.date, meal: mealFor(day, isToday), grams, food });
    hide(s.key);
    onChanged();
  };

  return (
    <View style={s.card}>
      <Text style={[type.title, { fontSize: 17 }]}>Suggestions</Text>
      {list.map((sg) => (
        <View key={sg.key} style={s.item}>
          <View style={s.row}>
            <Text style={[type.body, { flex: 1, fontWeight: '700' }]}>{sg.title}</Text>
            <Pressable onPress={() => hide(sg.key)} hitSlop={8} accessibilityLabel={`Hide “${sg.title}” for today`}>
              <Text style={s.x}>✕</Text>
            </Pressable>
          </View>
          <Text style={type.small}>{sg.detail}</Text>
          {sg.items.map((it) => (
            <View key={it.food.id} style={s.row}>
              <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>
                {it.food.name} · {it.grams} g · {forAmount(it.food.per100, it.grams).kcal} kcal · {forAmount(it.food.per100, it.grams).protein} g protein
              </Text>
              <Pressable onPress={() => never(it.food.name)} hitSlop={6}>
                <Text style={[type.small, { color: color.ironSoft }]}>Never</Text>
              </Pressable>
              <Pressable onPress={() => add(sg, it.food, it.grams)} style={s.plus} accessibilityLabel={sg.replaces ? `Swap to ${it.food.name}` : `Add ${it.food.name}`}>
                <Text style={s.plusText}>{sg.replaces ? 'Swap' : '+'}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.infoBg, borderRadius: 14, padding: space(4), gap: space(3) },
  item: { gap: space(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  x: { color: color.ironSoft, fontSize: 16 },
  plus: { minWidth: 36, height: 32, borderRadius: 16, backgroundColor: color.iron, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(3) },
  plusText: { color: color.chalk, fontWeight: '800' },
});
