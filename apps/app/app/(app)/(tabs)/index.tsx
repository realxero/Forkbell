import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MEALS, addDays, checkFood, forAmount, sumEntries, todayLocal, type DiaryDay, type DiaryEntry, type Meal, entryAmountText, entryName } from '@forkbell/shared';
import { SuggestionsCard } from '../../../components/SuggestionsCard';
import { useAuth } from '../../../lib/auth';
import { useViewing } from '../../../lib/profile';
import { cachedGet, readCache, writeCache } from '../../../lib/sync';
import { copyDay, setDayFinished } from '../../../lib/actions';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { MacroRing, Ring } from '../../../components/Ring';
import { EntryMenu, removeWithUndo } from '../../../components/EntryMenu';
import { SwipeRow } from '../../../components/SwipeRow';
import { SelectionBar } from '../../../components/SelectionBar';
import { CalendarSheet } from '../../../components/Calendar';
import { showToast } from '../../../lib/toast';
import { FoodIcon } from '../../../components/FoodIcon';
import { Logo } from '../../../components/Logo';
import { MealQuickActions } from '../../../components/MealQuickActions';
import { StreakCheer } from '../../../components/StreakCheer';
import { WaterCard } from '../../../components/WaterCard';
import { FastingCard } from '../../../components/FastingCard';

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
  // Opened on a particular day (a day in Progress → Days logged).
  const opened = useLocalSearchParams<{ date?: string }>().date;
  useEffect(() => {
    if (opened && /^\d{4}-\d{2}-\d{2}$/.test(opened)) setDate(opened);
  }, [opened]);
  const [day, setDay] = useState<DiaryDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  const [calendar, setCalendar] = useState(false);
  const [pickDay, setPickDay] = useState(date);
  const [menu, setMenu] = useState<DiaryEntry | null>(null);
  /** ids picked in select mode; null when not selecting */
  const [selected, setSelected] = useState<string[] | null>(null);
  const toggle = (id: string) => setSelected((s) => (s ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));

  /** Copy all of another day's food into this one (from the calendar). */
  const copyWholeDay = async (from: string) => {
    setCalendar(false);
    setNotice(null);
    try {
      const copied = await copyDay(from, date);
      if (!copied) setNotice(`Nothing was logged on ${dayLabel(from).toLowerCase()}.`);
      else showToast(`Copied ${copied} ${copied === 1 ? 'food' : 'foods'} from ${dayLabel(from).toLowerCase()}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // A small celebration the first time a goal is reached on a day.
  useEffect(() => {
    if (!day || viewing) return;
    const key = `device:celebrated:${day.date}`;
    const done = readCache<string[]>(key) ?? [];
    const hit = (['protein'] as const).filter((m) => day.goals[m] && day.totals[m] >= day.goals[m]! && !done.includes(m));
    if (hit.length) {
      writeCache(key, [...done, ...hit]);
      showToast(`🎉 Protein goal hit: ${Math.round(day.totals.protein)} g`, { tone: 'celebrate' });
    }
  }, [day, viewing]);

  const goal = day?.goals.kcal ?? null;
  const eaten = day?.totals.kcal ?? 0;
  const left = goal !== null ? goal - eaten : null;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.dateBar}>
        <Pressable onPress={() => setDate(addDays(date, -1))} hitSlop={12} accessibilityLabel="Previous day">
          <Text style={s.arrow}>‹</Text>
        </Pressable>
        <Pressable onPress={() => { setPickDay(date); setCalendar(true); }} accessibilityLabel="Open the calendar" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Logo size={22} />
          <Text style={type.title}>{dayLabel(date)}</Text>
          <Ionicons name="calendar-outline" size={20} color={color.accent} />
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
        <StreakCheer enabled={!viewing && date === todayLocal()} tick={(day?.totals.kcal ?? 0) > 0 ? 1 : 0} />
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
                      <Pressable onPress={() => router.push({ pathname: '/add', params: { meal, date } })} hitSlop={8} style={s.addRound} accessibilityLabel={`Add food to ${MEAL_NAMES[meal]}`}>
                        <Ionicons name="add" size={20} color={color.onAccent} />
                      </Pressable>
                    )}
                  </View>
                  {entries.map((e) => {
                    const n = forAmount(e.food.per100, e.grams);
                    return (
                      <SwipeRow
                        key={e.id}
                        left={{ label: 'Copy', icon: 'copy-outline', tint: color.accent, run: () => setMenu(e) }}
                        right={{ label: 'Remove', icon: 'trash-outline', tint: color.over, run: () => void removeWithUndo(e, load) }}
                      >
                      <Pressable
                        onPress={() => (selected ? toggle(e.id) : router.push({ pathname: '/edit', params: { id: e.id } }))}
                        onLongPress={() => (selected ? toggle(e.id) : setMenu(e))}
                        accessibilityState={selected ? { checked: selected.includes(e.id) } : undefined}
                        delayLongPress={350}
                        style={({ pressed }) => [s.entry, pressed && { opacity: 0.7 }]}
                        accessibilityHint="Tap to change it. Swipe or hold to copy or remove it."
                      >
                        {selected ? (
                          <View style={[s.check, selected.includes(e.id) && s.checkOn]}>
                            {selected.includes(e.id) && <Ionicons name="checkmark" size={20} color={color.onAccent} />}
                          </View>
                        ) : (
                          <FoodIcon name={e.food.name} brand={e.food.brand} size={38} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={type.body} numberOfLines={1}>{entryName(e)}</Text>
                          <Text style={type.small} numberOfLines={1}>
                            {e.food.brand ? `${e.food.brand} · ` : ''}{entryAmountText(e, me?.weightUnit ?? 'lb')} · {n.protein} g protein
                          </Text>
                          {(() => {
                            // Name-based allergy and diet flags, so a mistake is easy to spot.
                            const flags = me ? checkFood(`${e.food.name} ${e.food.brand ?? ''}`, me.preferences).reasons.filter((r) => r.startsWith('may contain') || r.startsWith('not ') || r.startsWith('on your avoid')) : [];
                            return flags.length ? <Text style={s.flag}>⚠ {flags.join(' · ')} (by name)</Text> : null;
                          })()}
                        </View>
                        <Text style={[type.body, type.number, { fontWeight: '700' }]}>{n.kcal}</Text>
                      </Pressable>
                      </SwipeRow>
                    );
                  })}
                  <MealQuickActions date={date} meal={meal} onChanged={load} />
                </View>
              );
            })}

            {date <= todayLocal() && <WaterCard date={date} readOnly={Boolean(viewing)} />}
            {date === todayLocal() && <FastingCard readOnly={Boolean(viewing)} />}

            {day.entries.length > 0 && date <= todayLocal() && (
              <FinishDay
                date={date}
                finished={Boolean(day.complete)}
                onChange={async (finished) => {
                  setDay({ ...day, complete: finished });
                  try {
                    await setDayFinished(date, finished);
                    if (finished) showToast(date === todayLocal() ? 'Today’s finished. Nice logging.' : 'Day finished.', { tone: 'celebrate', action: { label: 'Undo', run: () => { setDay((d) => d && { ...d, complete: false }); void setDayFinished(date, false); } } });
                  } catch (e) {
                    setDay({ ...day, complete: !finished });
                    setError(e instanceof Error ? e.message : String(e));
                  }
                }}
              />
            )}
          </>
        )}
      </ScrollView>
      <EntryMenu entry={menu} onClose={() => setMenu(null)} onChanged={load} onSelect={viewing ? undefined : (e) => setSelected([e.id])} />
      {selected && day && (
        <SelectionBar entries={day.entries.filter((e) => selected.includes(e.id))} onDone={() => setSelected(null)} onChanged={load} />
      )}
      <CalendarSheet
        visible={calendar}
        selected={pickDay}
        onPick={setPickDay}
        onClose={() => setCalendar(false)}
        footer={
          <View style={{ gap: space(2) }}>
            <Pressable onPress={() => { setDate(pickDay); setCalendar(false); }} style={s.sheetButton}>
              <Text style={s.sheetButtonText}>Go to {dayLabel(pickDay).toLowerCase()}</Text>
            </Pressable>
            {pickDay !== date && !viewing && (
              <Pressable onPress={() => copyWholeDay(pickDay)} style={{ alignItems: 'center', padding: space(2) }}>
                <Text style={s.addText}>Copy {dayLabel(pickDay).toLowerCase()}’s food into {dayLabel(date).toLowerCase()}</Text>
              </Pressable>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

/**
 * Marking a day finished tells Forkbell everything eaten is logged, so the
 * daily-burn estimate can trust it and the calendar can show it as complete.
 */
function FinishDay({ date, finished, onChange }: { date: string; finished: boolean; onChange: (finished: boolean) => void }) {
  const today = date === todayLocal();
  if (finished)
    return (
      <View style={[s.finish, s.finished]} accessibilityLiveRegion="polite">
        <Ionicons name="checkmark-circle" size={24} color={color.fat} />
        <Text style={[type.body, { flex: 1, fontWeight: '700' }]}>{today ? 'Today is finished' : 'This day is finished'}</Text>
        <Pressable onPress={() => onChange(false)} hitSlop={10} style={s.finishLink} accessibilityLabel="Reopen this day">
          <Text style={s.link}>Reopen</Text>
        </Pressable>
      </View>
    );
  return (
    <View style={s.finish}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { fontWeight: '700' }]}>{today ? 'Done eating for today?' : 'Is this day fully logged?'}</Text>
        <Text style={type.small}>Finished days make your daily-burn estimate more accurate.</Text>
      </View>
      <Pressable onPress={() => onChange(true)} style={s.finishButton} accessibilityRole="button">
        <Text style={s.finishButtonText}>{today ? 'Finish today' : 'Finish day'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  check: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: color.accent, borderColor: color.accent },
  finish: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.card, padding: space(4), borderWidth: 1, borderColor: color.line },
  finished: { backgroundColor: color.infoBg, borderColor: color.infoBg },
  finishButton: { minHeight: 44, paddingHorizontal: space(4), borderRadius: 22, backgroundColor: color.accent, justifyContent: 'center' },
  finishButtonText: { color: color.onAccent, fontWeight: '700', fontSize: 16 },
  finishLink: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
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
  sheetButton: { backgroundColor: color.accent, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  sheetButtonText: { color: color.onAccent, fontSize: 16, fontWeight: '700' },
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
