import { mealNow, shownMeals } from '../../../lib/meals';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Pressable } from '../../../components/Tap';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addDays, checkFood, forAmount, mealForTime, sumEntries, todayLocal, type DiaryDay, type DiaryEntry, type Meal, type MealPlanCell, type SavedMeal, type TargetSuggestion, entryAmountText, entryName } from '@forkbell/shared';
import { SuggestionsCard } from '../../../components/SuggestionsCard';
import { useAuth } from '../../../lib/auth';
import { canLogFood, useViewing } from '../../../lib/profile';
import { cachedGet, readCache, writeCache } from '../../../lib/sync';
import { api, del, put } from '../../../lib/api';
import { copyDay, logItems, setDayFinished } from '../../../lib/actions';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Ring, ringScale } from '../../../components/Ring';
import { MacroDisplay, macroStyle } from '../../../components/MacroDisplay';
import { EntryMenu, removeWithUndo } from '../../../components/EntryMenu';
import { SwipeRow } from '../../../components/SwipeRow';
import { SelectionBar } from '../../../components/SelectionBar';
import { CalendarSheet } from '../../../components/Calendar';
import { showToast } from '../../../lib/toast';
import { FoodIcon } from '../../../components/FoodIcon';
import { MealQuickActions } from '../../../components/MealQuickActions';
import { StreakCheer } from '../../../components/StreakCheer';
import { WaterCard } from '../../../components/WaterCard';
import { MicrosCard } from '../../../components/MicrosCard';
import { FastingCard } from '../../../components/FastingCard';
import { color, radius, space, type, textSize } from '../../../lib/theme';
import { buttons } from '../../../lib/buttons';
import { Check } from '../../../components/Check';
import { FoodSkeleton } from '../../../components/Skeleton';
import { QUICK_BELL_ROOM } from '../../../components/QuickBell';
import { MEAL_NAMES } from '../../../components/AmountPicker';

const MEAL_ICONS: Record<Meal, ComponentProps<typeof Ionicons>['name']> = { breakfast: 'sunny-outline', lunch: 'partly-sunny-outline', dinner: 'moon-outline', snacks: 'cafe-outline', meal5: 'restaurant-outline', meal6: 'nutrition-outline' };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));


function dayLabel(date: string) {
  const today = todayLocal();
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function Diary() {
  const { me, refreshMe } = useAuth();
  const viewing = useViewing();
  // Someone else's diary is read-only unless they allowed "Log food for me".
  const canWrite = canLogFood(viewing);
  const { fontScale } = useWindowDimensions();
  const [date, setDate] = useState(todayLocal());
  // Opened on a particular day (a day in Progress → Days logged).
  const opened = useLocalSearchParams<{ date?: string }>().date;
  useEffect(() => {
    if (opened && /^\d{4}-\d{2}-\d{2}$/.test(opened)) setDate(opened);
  }, [opened]);
  const [day, setDay] = useState<DiaryDay | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Photo logging goes through Bell, so the Photo chip only shows when Bell is set up.
  const [bell, setBell] = useState(false);
  useEffect(() => {
    api<{ enabled: boolean }>('/api/bell/status').then((r) => setBell(r.enabled), () => setBell(false));
  }, []);

  // Only the latest load counts: tapping through days on a slow connection must not
  // leave an older day's numbers under a newer day's title.
  const latest = useRef(0);
  // Whose data `day` is (null: yours), so a goal is only celebrated on your own day.
  const dayOwner = useRef<string | null>(null);
  const load = useCallback(async () => {
    const mine = ++latest.current;
    const owner = viewing?.id ?? null;
    try {
      const d = await cachedGet<DiaryDay>(`/api/diary/${date}`);
      if (mine !== latest.current) return;
      dayOwner.current = owner;
      setDay(d);
      setLoadError(null);
    } catch (e) {
      if (mine === latest.current) setLoadError(message(e));
    }
  }, [date, viewing]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // The weekly meal plan (yours, or from a food coach) and any targets a coach suggests.
  const [plan, setPlan] = useState<MealPlanCell[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [suggestion, setSuggestion] = useState<TargetSuggestion | null>(null);
  useFocusEffect(
    useCallback(() => {
      // A failed load keeps what's on screen (offline with nothing saved yet is normal); anything else is logged.
      const quiet = (what: string) => (e: unknown) => console.warn(`Couldn't load ${what}`, e);
      cachedGet<{ cells: MealPlanCell[] }>('/api/plans/meal-plan').then((r) => setPlan(r.cells), quiet('the meal plan'));
      cachedGet<{ meals: SavedMeal[] }>('/api/meals').then((r) => setSavedMeals(r.meals), quiet('saved meals'));
      if (!viewing) cachedGet<{ suggestion: TargetSuggestion | null }>('/api/plans/coach-targets').then((r) => setSuggestion(r.suggestion), quiet('suggested targets'));
    }, [viewing]),
  );
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const planFor = (meal: Meal) => plan.find((c) => c.weekday === weekday && c.meal === meal);
  const foodCoach = Boolean(viewing?.permissions?.includes('food_plan'));
  /** meals being logged from the plan, so a second tap can't log them twice */
  const [logging, setLogging] = useState<Meal | null>(null);
  const answerSuggestion = async (apply: boolean) => {
    const g = suggestion!;
    setSuggestion(null);
    try {
      if (apply) {
        await put('/api/me/goals', { kcal: g.kcal, protein: g.protein, carbs: g.carbs, fat: g.fat });
        await refreshMe();
      }
      await del('/api/plans/coach-targets');
      if (apply) showToast(`Goals set to ${g.kcal.toLocaleString()} kcal`);
      void load();
    } catch (e) {
      setSuggestion(g);
      showToast(`Couldn’t ${apply ? 'apply' : 'dismiss'} it: ${message(e)}`);
    }
  };

  // The quick ways to add (scan, quick add, photo, weigh) show on one meal at a time:
  // the meal for this time of day when you're on today, otherwise the one you open.
  const isToday = date === todayLocal();
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);
  useEffect(() => {
    setOpenMeal(isToday ? mealNow(mealForTime(new Date(), me?.timeZone)) : null);
  }, [date, isToday, me?.timeZone]);

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
      showToast(`Couldn’t copy that day: ${message(e)}`);
    }
  };

  // A small celebration the first time a goal is reached on a day.
  useEffect(() => {
    if (!day || viewing || dayOwner.current !== null) return;
    const key = `device:celebrated:${day.date}`;
    const done = readCache<string[]>(key) ?? [];
    const hit = (['protein'] as const).filter((m) => day.goals[m] && day.totals[m] >= day.goals[m]! && !done.includes(m));
    if (hit.length) {
      writeCache(key, [...done, ...hit]);
      showToast(`Protein goal hit: ${Math.round(day.totals.protein)} g`, { tone: 'celebrate' });
    }
  }, [day, viewing]);

  // Exercise adds to the goal when that's turned on (only activity above a usual day).
  const bonus = day?.goals.kcal ? day.bonus?.kcal ?? 0 : 0;
  const goal = day?.goals.kcal != null ? day.goals.kcal + bonus : null;
  const eaten = day?.totals.kcal ?? 0;
  const left = goal !== null ? goal - eaten : null;
  const ringLabel =
    left === null
      ? `${eaten.toLocaleString()} calories eaten. No calorie goal set.`
      : left >= 0
        ? `${left.toLocaleString()} calories left of ${goal!.toLocaleString()}`
        : `${Math.abs(left).toLocaleString()} calories over your goal of ${goal!.toLocaleString()}`;
  // At large text sizes the ring grows with the words in it, and the stats move under it.
  const stacked = fontScale > 1.3;
  // Bars stand beside the ring; the other styles sit in a row beneath it.
  const style = macroStyle();
  const barsBeside = style === 'bars';

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <View style={s.dateBar}>
        <Pressable
          onPress={() => { setPickDay(date); setCalendar(true); }}
          accessibilityRole="button"
          accessibilityLabel={`${dayLabel(date)}. Open the calendar`}
          style={s.dateButton}
        >
          <Text style={[type.pageTitle, { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{dayLabel(date)}</Text>
          <Ionicons name="chevron-down" size={20} color={color.ironSoft} />
        </Pressable>
        <View style={s.arrows}>
          <Pressable onPress={() => setDate(addDays(date, -1))} style={s.arrow} accessibilityRole="button" accessibilityLabel="Previous day">
            <Ionicons name="chevron-back" size={24} color={color.iron} />
          </Pressable>
          <Pressable onPress={() => setDate(addDays(date, 1))} style={s.arrow} accessibilityRole="button" accessibilityLabel="Next day">
            <Ionicons name="chevron-forward" size={24} color={color.iron} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {loadError && (
          <View style={s.problem} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={22} color={color.over} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, { fontWeight: '700' }]}>Couldn’t load {dayLabel(date).toLowerCase()}</Text>
              <Text style={type.small}>{loadError}</Text>
            </View>
            <Pressable onPress={() => void load()} style={s.retry} accessibilityRole="button">
              <Text style={buttons.smallText}>Retry</Text>
            </Pressable>
          </View>
        )}
        <StreakCheer enabled={!viewing && isToday} tick={(day?.totals.kcal ?? 0) > 0 ? 1 : 0} />
        {notice && <Text style={type.small}>{notice}</Text>}
        {!day && !loadError && <FoodSkeleton />}

        {day && (
          <>
            {/* The day at a glance: calories in the ring, macros the way you chose to see them. */}
            <View style={s.summary}>
              <View style={[s.summaryTop, (stacked || !barsBeside) && s.summaryStacked]}>
                <Ring value={eaten} goal={goal} size={132 * ringScale(fontScale)} stroke={13} tint={color.iron} label={ringLabel}>
                  <Text style={[s.ringNumber, type.number, left !== null && left < 0 && { color: color.over }]}>
                    {left !== null ? Math.abs(left).toLocaleString() : eaten.toLocaleString()}
                  </Text>
                  <Text style={type.small}>{left === null ? 'kcal eaten' : left >= 0 ? 'kcal left' : 'kcal over'}</Text>
                  {goal !== null && (
                    <Text style={[type.small, type.number, { fontSize: textSize.caption }]}>
                      {eaten.toLocaleString()} of {goal.toLocaleString()}{bonus > 0 ? ` (+${bonus})` : ''}
                    </Text>
                  )}
                </Ring>
                {barsBeside && !stacked && (
                  <View style={{ flex: 1 }}>
                    <MacroDisplay protein={day.totals.protein} carbs={day.totals.carbs} fat={day.totals.fat} goals={day.goals} style={style} />
                  </View>
                )}
              </View>
              {goal === null && <Text style={type.small}>Set a calorie goal in Settings → Goals and targets to see what’s left.</Text>}
              {(!barsBeside || stacked) && (
                <View style={s.macros}>
                  <MacroDisplay protein={day.totals.protein} carbs={day.totals.carbs} fat={day.totals.fat} goals={day.goals} style={style} />
                </View>
              )}
            </View>

            {/* Water is logged more often than any meal, so it sits right under the summary. */}
            {date <= todayLocal() && <WaterCard date={date} readOnly={Boolean(viewing)} />}
            {isToday && <FastingCard readOnly={Boolean(viewing)} />}

            {!canWrite && viewing && (
              <View style={s.readOnly}>
                <Ionicons name="eye-outline" size={18} color={color.ironSoft} />
                <Text style={[type.small, { flex: 1 }]}>You can see {viewing.name}’s food. Only {viewing.name} can add or change it.</Text>
              </View>
            )}

            {!viewing && suggestion && (
              <View style={s.suggestion} accessibilityLiveRegion="polite">
                <Text style={[type.body, { fontWeight: '700' }]}>{suggestion.fromCoach ? 'Your coach suggests new targets' : 'Suggested targets'}</Text>
                <Text style={[type.body, type.number]}>
                  {suggestion.kcal.toLocaleString()} kcal
                  {[suggestion.protein && `${suggestion.protein} g protein`, suggestion.carbs && `${suggestion.carbs} g carbs`, suggestion.fat && `${suggestion.fat} g fat`].filter(Boolean).map((x) => ` · ${x}`).join('')}
                </Text>
                {suggestion.note && <Text style={type.small}>{suggestion.note}</Text>}
                <View style={{ flexDirection: 'row', gap: space(2) }}>
                  <Pressable onPress={() => void answerSuggestion(true)} style={s.finishButton} accessibilityRole="button"><Text style={s.finishButtonText}>Use these</Text></Pressable>
                  <Pressable onPress={() => void answerSuggestion(false)} style={s.quietButton} accessibilityRole="button"><Text style={buttons.quietText}>Not now</Text></Pressable>
                </View>
              </View>
            )}

            {shownMeals().map((meal) => {
              const entries = day.entries.filter((e) => e.meal === meal);
              const kcal = sumEntries(entries).kcal;
              const open = canWrite && openMeal === meal;
              return (
                <View key={meal} style={s.meal}>
                  <View style={s.mealHead}>
                    <Ionicons name={MEAL_ICONS[meal]} size={20} color={color.ironSoft} />
                    <Text style={[type.heading, { flex: 1 }]} numberOfLines={1}>{MEAL_NAMES[meal]}</Text>
                    {kcal > 0 && <Text style={[type.small, type.number, { fontWeight: '700' }]}>{kcal} kcal</Text>}
                    {canWrite && (
                      <>
                        <Pressable
                          onPress={() => setOpenMeal(open ? null : meal)}
                          style={s.more}
                          accessibilityRole="button"
                          accessibilityLabel={`More ways to add to ${MEAL_NAMES[meal]}`}
                          accessibilityState={{ expanded: open }}
                        >
                          <Ionicons name="ellipsis-horizontal" size={20} color={open ? color.iron : color.ironSoft} />
                        </Pressable>
                        <Pressable onPress={() => router.push({ pathname: '/add', params: { meal, date } })} style={s.addTap} accessibilityRole="button" accessibilityLabel={`Add food to ${MEAL_NAMES[meal]}`}>
                          <View style={s.addRound}>
                            <Ionicons name="add" size={22} color={color.chalk} />
                          </View>
                        </Pressable>
                      </>
                    )}
                  </View>
                  {(() => {
                    // This weekday's plan for the meal, from your meal plan or your coach's.
                    const planned = planFor(meal);
                    if (!planned) return null;
                    const saved = planned.savedMealId ? savedMeals.find((m) => m.id === planned.savedMealId) : undefined;
                    return (
                      <View style={s.planned}>
                        <Ionicons name="clipboard-outline" size={16} color={color.ironSoft} />
                        <Text style={[type.small, { flex: 1 }]}>
                          Planned{planned.fromCoach ? ' by your coach' : ''}: {[planned.note, saved?.name].filter(Boolean).join(' · ')}
                        </Text>
                        {saved && canWrite && (
                          <Pressable disabled={logging === meal} onPress={() => { setLogging(meal); void logItems(date, meal, saved.items).catch((e) => showToast(`Couldn’t log ${saved.name}: ${message(e)}`)).finally(() => { setLogging(null); void load(); }); }} style={s.finishLink} accessibilityRole="button" accessibilityLabel={`Log ${saved.name}`}>
                            <Text style={s.link}>Log it</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })()}
                  {entries.map((e) => {
                    const n = forAmount(e.food.per100, e.grams);
                    // Name-based allergy and diet flags, so a mistake is easy to spot.
                    const flags = me ? checkFood(`${e.food.name} ${e.food.brand ?? ''}`, me.preferences).reasons.filter((r) => r.startsWith('may contain') || r.startsWith('not ') || r.startsWith('on your avoid')) : [];
                    return (
                      <SwipeRow
                        key={e.id}
                        left={canWrite ? { label: 'Copy', icon: 'copy-outline', tint: color.accent, run: () => setMenu(e) } : undefined}
                        right={canWrite ? { label: 'Remove', icon: 'trash-outline', tint: color.over, run: () => void removeWithUndo(e, load) } : undefined}
                      >
                        <Pressable
                          disabled={!canWrite}
                          onPress={() => (selected ? toggle(e.id) : router.push({ pathname: '/edit', params: { id: e.id } }))}
                          onLongPress={() => (selected ? toggle(e.id) : setMenu(e))}
                          accessibilityState={selected ? { checked: selected.includes(e.id) } : undefined}
                          delayLongPress={350}
                          style={({ pressed }) => [s.entry, pressed && { opacity: 0.7 }]}
                          accessibilityHint={canWrite ? 'Tap to change it. Swipe or hold to copy or remove it.' : undefined}
                        >
                          {selected ? (
                            <View style={[s.check, selected.includes(e.id) && s.checkOn]}>
                              <Check on={selected.includes(e.id)} tint={color.onAccent} />
                            </View>
                          ) : (
                            <FoodIcon name={e.food.name} brand={e.food.brand} size={38} />
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={type.body} numberOfLines={1}>{entryName(e)}</Text>
                            <Text style={type.small} numberOfLines={1}>
                              {e.food.brand ? `${e.food.brand} · ` : ''}{entryAmountText(e, me?.weightUnit ?? 'lb')} · {n.protein} g protein
                            </Text>
                            {flags.length > 0 && (
                              <View style={s.flagRow}>
                                <Ionicons name="warning-outline" size={13} color={color.warnText} />
                                <Text style={s.flag}>{flags.join(' · ')} (by name)</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[type.body, type.number, { fontWeight: '700' }]}>{n.kcal}</Text>
                        </Pressable>
                      </SwipeRow>
                    );
                  })}
                  {open && <MealQuickActions date={date} meal={meal} bell={bell} onChanged={load} />}
                </View>
              );
            })}

            {/* Planning and ideas come after the meals, so logging is the first thing on the screen. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space(4) }}>
              {!viewing && date >= todayLocal() && (
                <Pressable onPress={() => router.push({ pathname: '/plan', params: { date } })} style={s.planLink} accessibilityRole="link">
                  <Text style={s.link}>Plan {isToday ? 'the rest of today' : 'this day'} ›</Text>
                </Pressable>
              )}
              {(!viewing || foodCoach) && (
                <Pressable onPress={() => router.push('/meal-plan')} style={s.planLink} accessibilityRole="link">
                  <Text style={s.link}>Meal plan ›</Text>
                </Pressable>
              )}
            </View>
            {!viewing && <SuggestionsCard day={day} onChanged={load} />}
            {day.entries.length > 0 && <MicrosCard entries={day.entries} fiber={day.totals.fiber} />}

            {canWrite && day.entries.length > 0 && date <= todayLocal() && (
              <FinishDay
                date={date}
                finished={Boolean(day.complete)}
                onChange={async (finished) => {
                  setDay({ ...day, complete: finished });
                  try {
                    await setDayFinished(date, finished);
                    if (finished) showToast(isToday ? 'Today’s finished. Nice logging.' : 'Day finished.', { tone: 'celebrate', action: { label: 'Undo', run: () => { setDay((d) => d && { ...d, complete: false }); void setDayFinished(date, false); } } });
                  } catch (e) {
                    setDay({ ...day, complete: !finished });
                    showToast(`Couldn’t ${finished ? 'finish' : 'reopen'} the day: ${message(e)}`);
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
            <Pressable onPress={() => { setDate(pickDay); setCalendar(false); }} style={s.sheetButton} accessibilityRole="button">
              <Text style={s.sheetButtonText}>Go to {dayLabel(pickDay).toLowerCase()}</Text>
            </Pressable>
            {pickDay !== date && !viewing && (
              <Pressable onPress={() => copyWholeDay(pickDay)} style={{ alignItems: 'center', padding: space(2), minHeight: 44, justifyContent: 'center' }} accessibilityRole="button">
                <Text style={s.link}>Copy {dayLabel(pickDay).toLowerCase()}’s food into {dayLabel(date).toLowerCase()}</Text>
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
        <Ionicons name="checkmark-circle" size={24} color={color.iron} />
        <Text style={[type.body, { flex: 1, fontWeight: '700' }]}>{today ? 'Today is finished' : 'This day is finished'}</Text>
        <Pressable onPress={() => onChange(false)} hitSlop={10} style={s.finishLink} accessibilityRole="button" accessibilityLabel="Reopen this day">
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
  screen: { flex: 1, backgroundColor: color.chalk },
  dateBar: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingLeft: space(4), paddingRight: space(2), paddingTop: space(2), paddingBottom: space(1), maxWidth: 640, width: '100%', alignSelf: 'center' },
  dateButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(1), minHeight: 44 },
  arrows: { flexDirection: 'row' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space(4), paddingBottom: QUICK_BELL_ROOM, gap: space(4), maxWidth: 640, width: '100%', alignSelf: 'center' },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.dangerBg, borderRadius: radius.card, padding: space(4) },
  retry: { ...buttons.small, minHeight: 44 },
  summary: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(4) },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: space(5) },
  summaryStacked: { flexDirection: 'column', alignItems: 'center' },
  ringNumber: { fontSize: textSize.large, fontWeight: '800', letterSpacing: -0.5, color: color.iron },
  macros: { paddingTop: space(3), borderTopWidth: 1, borderTopColor: color.line },
  readOnly: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(1) },
  planLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  planned: { flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: color.raised, borderRadius: radius.input, paddingHorizontal: space(3), paddingVertical: space(2), minHeight: 44 },
  suggestion: { backgroundColor: color.infoBg, borderRadius: radius.card, padding: space(4), gap: space(2) },
  quietButton: { ...buttons.quiet, minHeight: 44 },
  link: { color: color.accent, fontWeight: '700', fontSize: textSize.body },
  meal: { gap: space(2), backgroundColor: color.card, borderRadius: radius.card, padding: space(4) },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 44 },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addTap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRound: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: color.iron, alignItems: 'center', justifyContent: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2), borderTopWidth: 1, borderTopColor: color.line },
  check: { width: 38, height: 38, borderRadius: radius.pill, borderWidth: 2, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: color.accent, borderColor: color.accent },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  flag: { flex: 1, fontSize: textSize.label, color: color.warnText, fontWeight: '600' },
  finish: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.card, padding: space(4) },
  finished: { backgroundColor: color.infoBg, borderColor: color.infoBg },
  finishButton: { ...buttons.small, minHeight: 44 },
  finishButtonText: buttons.smallText,
  finishLink: { minHeight: 44, justifyContent: 'center' },
  sheetButton: buttons.filled,
  sheetButtonText: buttons.filledText,
});
