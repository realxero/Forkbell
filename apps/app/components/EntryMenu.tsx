import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { router } from 'expo-router';
import { addDays, betterOptions, defaultPreferences, forAmount, mealForTime, todayLocal, type BetterOption, type DiaryEntry, type Meal } from '@forkbell/shared';
import { useAuth } from '../lib/auth';
import { addEntry, deleteEntry, foodLibrary } from '../lib/actions';
import { showToast } from '../lib/toast';
import { CalendarSheet } from './Calendar';
import { Chip, MEAL_NAMES } from './AmountPicker';
import { FoodIcon } from './FoodIcon';
import { color, radius, space, type } from '../lib/theme';

const dayName = (date: string) => {
  const today = todayLocal();
  if (date === today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  if (date === addDays(today, -1)) return 'yesterday';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** Remove an entry, with Undo in the toast. */
export async function removeWithUndo(e: DiaryEntry, after?: () => void) {
  await deleteEntry(e);
  after?.();
  showToast(`Removed ${e.food.name}`, {
    action: {
      label: 'Undo',
      run: async () => {
        await addEntry({ date: e.date, meal: e.meal, grams: e.grams, food: e.food });
        after?.();
      },
    },
  });
}

/** What you get by holding a logged food: copy it somewhere, edit, or remove. */
export function EntryMenu({ entry, onClose, onChanged, onSelect }: { entry: DiaryEntry | null; onClose: () => void; onChanged: () => void; onSelect?: (e: DiaryEntry) => void }) {
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [meal, setMeal] = useState<Meal | null>(null);
  const [better, setBetter] = useState<BetterOption[] | null>(null);
  const { me } = useAuth();
  if (!entry) return null;
  const close = () => {
    setBetter(null);
    onClose();
  };
  const findBetter = async () => {
    setBetter(betterOptions(entry, await foodLibrary(), me?.preferences ?? defaultPreferences()));
  };
  const swapTo = async (o: BetterOption) => {
    await addEntry({ date: entry.date, meal: entry.meal, grams: o.grams, food: o.food });
    await deleteEntry(entry);
    onChanged();
    close();
    showToast(`Swapped to ${o.food.name}`, {
      action: {
        label: 'Undo',
        run: async () => {
          await addEntry({ date: entry.date, meal: entry.meal, grams: entry.grams, food: entry.food });
          onChanged();
        },
      },
    });
  };
  const today = todayLocal();

  const copyTo = async (date: string, m: Meal) => {
    await addEntry({ date, meal: m, grams: entry.grams, food: entry.food });
    onChanged();
    showToast(`Copied ${entry.food.name} to ${MEAL_NAMES[m].toLowerCase()}, ${dayName(date)}`);
    setPicking(false);
    setTarget(null);
    onClose();
  };
  const item = (icon: ComponentProps<typeof Ionicons>['name'], label: string, run: () => void, danger = false) => (
    <Pressable onPress={run} style={({ pressed }) => [s.item, pressed && { backgroundColor: color.raised }]} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={danger ? color.over : color.accent} />
      <Text style={[type.body, danger && { color: color.over }]}>{label}</Text>
    </Pressable>
  );
  const n = forAmount(entry.food.per100, entry.grams);

  return (
    <>
      <Modal visible={!picking} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={s.backdrop} onPress={close}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.head}>
              <FoodIcon name={entry.food.name} brand={entry.food.brand} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: '700' }]} numberOfLines={1}>{entry.food.name}</Text>
                <Text style={type.small}>{entry.grams} g · {n.kcal} kcal · {MEAL_NAMES[entry.meal]}, {dayName(entry.date)}</Text>
              </View>
            </View>
            {better ? (
              <View style={{ gap: space(2), paddingVertical: space(2) }}>
                <Text style={type.label}>Better options for your goal</Text>
                {better.length === 0 && <Text style={type.small}>Nothing clearly lighter or higher in protein among your foods and the common ones. Bell can look further.</Text>}
                {better.map((o) => (
                  <View key={o.food.id} style={s.option}>
                    <FoodIcon name={o.food.name} brand={o.food.brand} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.body} numberOfLines={1}>{o.food.name}</Text>
                      <Text style={[type.small, { color: color.fat }]}>{o.why}</Text>
                    </View>
                    <Pressable onPress={() => swapTo(o)} style={s.swap}><Text style={s.swapText}>Swap</Text></Pressable>
                  </View>
                ))}
                {/* Bell looks further: real products, or what to order at a restaurant. */}
                {item('chatbubble-ellipses-outline', 'Ask Bell for real products', () => {
                  close();
                  router.push({ pathname: '/bell', params: { ask: `Find 3 real, buyable alternatives to ${entry.food.name}${entry.food.brand ? ` (${entry.food.brand})` : ''} that fit my goal better. For each, say why and give calories and protein for about ${entry.grams} g, and offer to log one instead.` } });
                })}
                {item('restaurant-outline', 'At a restaurant? Ask Bell for menu options', () => {
                  close();
                  router.push({ pathname: '/bell', params: { ask: `I'm eating out${entry.food.brand ? ` at ${entry.food.brand}` : ''}. Instead of ${entry.food.name}, suggest 3 menu items that fit what I have left today, with how to order each.` } });
                })}
                <Pressable onPress={() => setBetter(null)}><Text style={[type.small, { color: color.accent, fontWeight: '700' }]}>‹ Back</Text></Pressable>
              </View>
            ) : (
            <>
            {onSelect && item('checkmark-circle-outline', 'Select several…', () => { const e = entry; close(); onSelect(e); })}
            {item('sparkles-outline', 'Better option for my goal', findBetter)}
            {entry.date !== today && item('today-outline', `Copy to today (${MEAL_NAMES[mealForTime()].toLowerCase()})`, () => copyTo(today, mealForTime()))}
            {item('arrow-forward-circle-outline', `Copy to ${entry.date === today ? 'tomorrow' : 'the next day'}`, () => copyTo(addDays(entry.date, 1), entry.meal))}
            {item('calendar-outline', 'Copy to another day…', () => {
              setTarget(entry.date);
              setMeal(entry.meal);
              setPicking(true);
            })}
            {item('create-outline', 'Change amount or meal', () => {
              onClose();
              router.push({ pathname: '/edit', params: { id: entry.id } });
            })}
            {item('trash-outline', 'Remove', () => {
              close();
              removeWithUndo(entry, onChanged);
            }, true)}
            </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      <CalendarSheet
        visible={picking}
        selected={target ?? entry.date}
        title={`Copy ${entry.food.name}`}
        onPick={setTarget}
        onClose={() => setPicking(false)}
        footer={
          <View style={{ gap: space(2) }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
              {(['breakfast', 'lunch', 'dinner', 'snacks'] as Meal[]).map((m) => <Chip key={m} label={MEAL_NAMES[m]} on={meal === m} onPress={() => setMeal(m)} />)}
            </View>
            <Pressable onPress={() => target && meal && copyTo(target, meal)} style={s.button}>
              <Text style={s.buttonText}>Copy to {target ? dayName(target) : '…'}</Text>
            </Pressable>
          </View>
        }
      />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(1), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingBottom: space(3), borderBottomWidth: 1, borderBottomColor: color.line, marginBottom: space(1) },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3), paddingHorizontal: space(2), borderRadius: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  swap: { backgroundColor: color.accent, borderRadius: 999, paddingHorizontal: space(4), paddingVertical: space(2) },
  swapText: { color: color.onAccent, fontWeight: '800' },
  button: { backgroundColor: color.accent, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  buttonText: { color: color.onAccent, fontSize: 16, fontWeight: '700' },
});
