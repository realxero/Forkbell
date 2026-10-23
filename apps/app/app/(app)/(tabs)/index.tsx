import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MEALS, addDays, checkFood, forAmount, sumEntries, todayLocal, type DiaryDay, type Meal } from '@forkbell/shared';
import { SuggestionsCard } from '../../../components/SuggestionsCard';
import { useAuth } from '../../../lib/auth';
import { useViewing } from '../../../lib/profile';
import { cachedGet } from '../../../lib/sync';
import { copyDay } from '../../../lib/actions';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { MacroRing, Ring } from '../../../components/Ring';
import { FoodIcon } from '../../../components/FoodIcon';

const MEAL_ICONS: Record<Meal, ComponentProps<typeof Ionicons>['name']> = { breakfast: 'sunny-outline', lunch: 'partly-sunny-outline', dinner: 'moon-outline', snacks: 'cafe-outline' };

function Stat({ icon, label, value }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
      <Ionicons name={icon} size={18} color={color.ironSoft} />
      <View>
        <Text style={type.label}>{label}</Text>
        <Text style={[type.body, type.number, { fontWeight: '700' }]}>{value}</Text>
      </View>
    </View>
  );
}
import { color, radius, space, type } from '../../../lib/theme';

import { MEAL_NAMES } from '../../../components/AmountPicker';

function dayLabel(date: string) {
  const today = todayLocal();
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function Diary() {
  const { me } = useAuth();
  const viewing = useViewing();
  const [date, setDate] = useState(todayLocal());
  const [day, setDay] = useState<DiaryDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setDay(await cachedGet<DiaryDay>(`/api/diary/${date}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [date, viewing]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const prev = addDays(date, -1);
  const prevLabel = dayLabel(prev);
  // "today" and "yesterday" read as words; other days stay as dates.
  const relative = ['Today', 'Yesterday', 'Tomorrow'].includes(prevLabel);
  const prevName = relative ? prevLabel.toLowerCase() : prevLabel;

  /** Copy one meal, or the whole day, from the day before. */
  const copyFromPrev = async (meal?: Meal) => {
    setCopying(true);
    setNotice(null);
    try {
      const copied = await copyDay(prev, date, meal);
      if (!copied) setNotice(`Nothing was logged${meal ? ` for ${MEAL_NAMES[meal].toLowerCase()}` : ''} ${relative ? prevName : `on ${prevName}`}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCopying(false);
    }
  };

  const goal = day?.goals.kcal ?? null;
  const eaten = day?.totals.kcal ?? 0;
  const left = goal !== null ? goal - eaten : null;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.dateBar}>
        <Pressable onPress={() => setDate(addDays(date, -1))} hitSlop={12} accessibilityLabel="Previous day">
          <Text style={s.arrow}>‹</Text>
        </Pressable>
        <Pressable onPress={() => setDate(todayLocal())} accessibilityLabel="Go to today">
          <Text style={type.title}>{dayLabel(date)}</Text>
        </Pressable>
        <Pressable onPress={() => setDate(addDays(date, 1))} hitSlop={12} accessibilityLabel="Next day">
          <Text style={s.arrow}>›</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {error && <Text style={s.error}>{error}</Text>}
        {notice && <Text style={type.small}>{notice}</Text>}
        {!day && !error && <ActivityIndicator color={color.iron} style={{ marginTop: space(10) }} />}

        {day && (
          <>
            <View style={s.summary}>
              <View style={s.summaryTop}>
                <Ring value={eaten} goal={goal} size={148} stroke={14} tint={color.accent}>
                  <Text style={[s.ringNumber, type.number, left !== null && left < 0 && { color: color.over }]}>
                    {left !== null ? Math.abs(left).toLocaleString() : eaten.toLocaleString()}
                  </Text>
                  <Text style={type.small}>{left === null ? 'kcal eaten' : left >= 0 ? 'kcal left' : 'kcal over'}</Text>
                </Ring>
                <View style={{ flex: 1, gap: space(3) }}>
                  <Stat icon="restaurant-outline" label="Eaten" value={eaten.toLocaleString()} />
                  <Stat icon="flag-outline" label="Goal" value={goal ? goal.toLocaleString() : '–'} />
                  <Stat icon="leaf-outline" label="Fiber" value={`${Math.round(day.totals.fiber)} g`} />
                </View>
              </View>
              {goal === null && <Text style={type.small}>Set a calorie goal in Goals and settings to see what’s left.</Text>}
              <View style={s.macros}>
                <MacroRing label="Protein" value={day.totals.protein} goal={day.goals.protein} tint={color.protein} />
                <MacroRing label="Carbs" value={day.totals.carbs} goal={day.goals.carbs} tint={color.carbs} />
                <MacroRing label="Fat" value={day.totals.fat} goal={day.goals.fat} tint={color.fat} />
              </View>
            </View>

            {!viewing && <SuggestionsCard day={day} onChanged={load} />}
            {!viewing && date >= todayLocal() && (
              <Pressable onPress={() => router.push({ pathname: '/plan', params: { date } })} style={{ alignSelf: 'flex-start' }}>
                <Text style={s.addText}>Plan {date === todayLocal() ? 'the rest of today' : 'this day'} ›</Text>
              </Pressable>
            )}

            {day.entries.length === 0 && (
              <Pressable disabled={copying} onPress={() => copyFromPrev()} style={[s.copyDay, copying && { opacity: 0.5 }]}>
                <Text style={s.addText}>Copy everything from {prevName}</Text>
              </Pressable>
            )}

            {MEALS.map((meal) => {
              const entries = day.entries.filter((e) => e.meal === meal);
              const kcal = sumEntries(entries).kcal;
              return (
                <View key={meal} style={s.meal}>
                  <View style={s.mealHead}>
                    <View style={s.mealIcon}><Ionicons name={MEAL_ICONS[meal]} size={18} color={color.accent} /></View>
                    <Text style={[type.title, { fontSize: 18, flex: 1 }]}>{MEAL_NAMES[meal]}</Text>
                    {kcal > 0 && <Text style={[type.small, type.number, { fontWeight: '700' }]}>{kcal} kcal</Text>}
                    {(
                      <Pressable onPress={() => router.push({ pathname: '/add', params: { meal, date } })} style={s.addRound} accessibilityLabel={`Add food to ${MEAL_NAMES[meal]}`}>
                        <Ionicons name="add" size={20} color={color.onAccent} />
                      </Pressable>
                    )}
                  </View>
                  {entries.map((e) => {
                    const n = forAmount(e.food.per100, e.grams);
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => router.push({ pathname: '/edit', params: { id: e.id } })}
                        style={({ pressed }) => [s.entry, pressed && { opacity: 0.7 }]}
                        accessibilityHint="Change the amount or meal, or remove it"
                      >
                        <FoodIcon name={e.food.name} brand={e.food.brand} size={38} />
                        <View style={{ flex: 1 }}>
                          <Text style={type.body} numberOfLines={1}>{e.food.name}</Text>
                          <Text style={type.small} numberOfLines={1}>
                            {e.food.brand ? `${e.food.brand} · ` : ''}{e.grams} g · {n.protein} g protein
                          </Text>
                          {(() => {
                            // Name-based allergy and diet flags, so a mistake is easy to spot.
                            const flags = me ? checkFood(`${e.food.name} ${e.food.brand ?? ''}`, me.preferences).reasons.filter((r) => r.startsWith('may contain') || r.startsWith('not ') || r.startsWith('on your avoid')) : [];
                            return flags.length ? <Text style={s.flag}>⚠ {flags.join(' · ')} (by name)</Text> : null;
                          })()}
                        </View>
                        <Text style={[type.body, type.number, { fontWeight: '700' }]}>{n.kcal}</Text>
                      </Pressable>
                    );
                  })}
                  <View style={s.actions}>
                    <Pressable onPress={() => router.push({ pathname: '/add', params: { meal, date, scan: '1' } })} style={s.chipBtn}>
                      <Ionicons name="barcode-outline" size={16} color={color.accent} />
                      <Text style={s.chipText}>Scan</Text>
                    </Pressable>
                    {entries.length === 0 && (
                      <Pressable disabled={copying} onPress={() => copyFromPrev(meal)} style={[s.chipBtn, copying && { opacity: 0.5 }]}>
                        <Ionicons name="copy-outline" size={16} color={color.accent} />
                        <Text style={s.chipText}>Copy from {prevName}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}

            <Pressable onPress={() => router.push('/settings')} style={{ alignSelf: 'center', padding: space(4) }}>
              <Text style={type.small}>Goals and settings</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(5), paddingVertical: space(3) },
  arrow: { fontSize: 32, lineHeight: 34, color: color.iron, paddingHorizontal: space(2) },
  content: { padding: space(4), paddingBottom: space(16), gap: space(4), maxWidth: 640, width: '100%', alignSelf: 'center' },
  error: { ...type.body, color: color.over },
  summary: { backgroundColor: color.card, borderRadius: radius.card, padding: space(5), gap: space(4), borderWidth: 1, borderColor: color.line },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: space(5) },
  ringNumber: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, color: color.iron },
  macros: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space(3), borderTopWidth: 1, borderTopColor: color.line },
  mealIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: color.infoBg, alignItems: 'center', justifyContent: 'center' },
  addRound: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  chipBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space(2), paddingHorizontal: space(3), borderRadius: radius.pill, borderWidth: 1, borderColor: color.line },
  chipText: { color: color.accent, fontWeight: '700', fontSize: 14 },
  meal: { gap: space(2), backgroundColor: color.card, borderRadius: radius.card, padding: space(4), borderWidth: 1, borderColor: color.line },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2), borderTopWidth: 1, borderTopColor: color.line },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(1) },
  add: { paddingVertical: space(3), paddingHorizontal: space(1) },
  addText: { color: color.protein, fontWeight: '700', fontSize: 16 },
  flag: { fontSize: 12, color: color.warnText, fontWeight: '600', marginTop: 2 },
  copyText: { color: color.ironSoft, fontWeight: '600', fontSize: 16 },
  copyDay: { backgroundColor: color.card, borderRadius: 12, padding: space(4), alignItems: 'center', borderWidth: 1, borderColor: color.line, borderStyle: 'dashed' },
});
