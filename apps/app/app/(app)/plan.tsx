import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MEALS, addDays, nextDays, planDays, todayLocal, type DayPlan, type DiaryDay, type Food, type RecentFood } from '@forkbell/shared';
import { useAuth } from '../../lib/auth';
import { addEntry, foodLibrary } from '../../lib/actions';
import { cachedGet } from '../../lib/sync';
import { Chip, MEAL_NAMES } from '../../components/AmountPicker';
import { FoodIcon } from '../../components/FoodIcon';
import { color, space, type } from '../../lib/theme';

const label = (date: string, today: string) => {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
};

/** Plan one day or several: meals built from foods you eat, sized to your goals. */
export default function Plan() {
  const params = useLocalSearchParams<{ date?: string }>();
  const today = todayLocal();
  const { me } = useAuth();
  const week = nextDays(today, 7);
  const [picked, setPicked] = useState<string[]>([params.date && params.date >= today ? params.date : today]);
  const [seed, setSeed] = useState(1);
  const [plans, setPlans] = useState<DayPlan[] | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const build = useCallback(async () => {
    if (!me) return;
    if (!me.goals.kcal) return setError('Set a calorie goal first (Goals and settings, or the suggestion on the Progress tab), so plans know how much to add.');
    setError(null);
    try {
      const [foods, recent, days] = await Promise.all([
        foodLibrary(),
        cachedGet<{ recent: RecentFood[]; frequent: RecentFood[] }>(`/api/foods/recent?today=${today}`).then((r) => [...r.frequent, ...r.recent], () => [] as RecentFood[]),
        Promise.all([...picked].sort().map((d) => cachedGet<DiaryDay>(`/api/diary/${d}`))),
      ]);
      setPlans(planDays(days, { foods: foods as Food[], recent, prefs: me.preferences, kcalTarget: me.goals.kcal, proteinTarget: me.goals.protein, seed }));
      setRemoved(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [me, picked, seed, today]);
  useEffect(() => {
    build();
  }, [build]);

  const keyOf = (p: DayPlan, i: number) => `${p.date}:${i}`;
  const addPlan = async (p: DayPlan) => {
    setBusy(true);
    try {
      for (const [i, it] of p.items.entries()) if (!removed.has(keyOf(p, i))) await addEntry({ date: p.date, meal: it.meal, grams: it.grams, food: it.food });
      setAdded((a) => [...a, p.date]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.head}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
          <Pressable onPress={() => router.push({ pathname: '/shopping' })} hitSlop={12}><Text style={s.link}>Shopping list</Text></Pressable>
        </View>
        <Text style={[type.hero, { fontSize: 30 }]}>Plan</Text>
        <Text style={type.small}>Fills meals that are still empty, from foods you log and the common foods, keeping to your allergies, diet and dislikes.</Text>
        <View style={s.chips}>
          {week.map((d) => (
            <Chip key={d} label={label(d, today)} on={picked.includes(d)} onPress={() => setPicked((p) => (p.includes(d) ? (p.length > 1 ? p.filter((x) => x !== d) : p) : [...p, d]))} />
          ))}
        </View>
        <View style={s.row}>
          <Pressable onPress={() => setPicked(week)}><Text style={s.link}>Whole week</Text></Pressable>
          <Pressable onPress={() => setSeed((x) => x + 1)}><Text style={s.link}>Shuffle</Text></Pressable>
        </View>
        {error && <Text style={s.error}>{error}</Text>}
        {!plans && !error && <ActivityIndicator color={color.iron} />}
        {plans?.map((p) => (
          <View key={p.date} style={s.card}>
            <Text style={type.title}>{label(p.date, today)}</Text>
            {MEALS.map((meal) => {
              const items = p.items.map((it, i) => ({ it, i })).filter((x) => x.it.meal === meal);
              if (!items.length) return null;
              return (
                <View key={meal} style={{ gap: 2 }}>
                  <Text style={[type.small, { fontWeight: '700' }]}>{MEAL_NAMES[meal]}</Text>
                  {items.map(({ it, i }) => {
                    const off = removed.has(keyOf(p, i));
                    return (
                      <Pressable
                        key={i}
                        onPress={() => setRemoved((r) => { const n = new Set(r); off ? n.delete(keyOf(p, i)) : n.add(keyOf(p, i)); return n; })}
                        style={[s.item, off && { opacity: 0.35 }]}
                        accessibilityLabel={`${off ? 'Put back' : 'Leave out'} ${it.food.name}`}
                      >
                        <FoodIcon name={it.food.name} brand={it.food.brand} size={30} />
                        <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{it.food.name}</Text>
                        <Text style={[type.small, type.number]}>{it.grams} g · {Math.round((it.food.per100.kcal * it.grams) / 100)} kcal</Text>
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
            <Text style={[type.small, type.number]}>Plan total about {p.kcal.toLocaleString()} kcal and {Math.round(p.protein)} g protein. Tap an item to leave it out.</Text>
            {p.notes.map((n) => <Text key={n} style={s.note}>{n}</Text>)}
            {added.includes(p.date) ? (
              <Text style={[type.small, { color: color.fat, fontWeight: '700' }]}>Added to the diary.</Text>
            ) : p.items.length > 0 ? (
              <Pressable disabled={busy} onPress={() => addPlan(p)} style={[s.button, busy && { opacity: 0.5 }]}><Text style={s.buttonText}>Add to {label(p.date, today)}</Text></Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  row: { flexDirection: 'row', gap: space(5) },
  card: { backgroundColor: color.card, borderRadius: 14, padding: space(4), gap: space(3) },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: 3 },
  note: { ...type.small, color: color.warnText },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  buttonText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
});
