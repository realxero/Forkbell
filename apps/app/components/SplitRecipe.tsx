// Split a recipe across meals and days: a batch you cooked once and eat over
// the week (meal prep). Pick how many portions, the meal and the first day;
// each portion is logged as one serving on its day, offline too.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { addDays, forAmount, mealForTime, todayLocal, type Meal, type Recipe } from '@forkbell/shared';
import { addEntry } from '../lib/actions';
import { MEAL_NAMES, mealNow, shownMeals } from '../lib/meals';
import { showToast } from '../lib/toast';
import { Chip } from './AmountPicker';
import { color, radius, space, type } from '../lib/theme';

const dayName = (d: string) => (d === todayLocal() ? 'Today' : d === addDays(todayLocal(), 1) ? 'Tomorrow' : new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));

export function SplitRecipe({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const [portions, setPortions] = useState<number | null>(null);
  const [meal, setMeal] = useState<Meal>(mealNow(mealForTime()));
  const [start, setStart] = useState(todayLocal());
  const [mode, setMode] = useState<'days' | 'today'>('days');
  const [busy, setBusy] = useState(false);
  if (!recipe) return null;
  const count = portions ?? Math.max(1, Math.round(recipe.servings));
  const serving = recipe.food.servingGrams ?? (recipe.cookedGrams ?? recipe.items.reduce((n, i) => n + i.grams, 0)) / Math.max(1, recipe.servings);
  const each = forAmount(recipe.food.per100, serving);
  // Every day at the same meal, or (for "today") across today's meals in order.
  const meals = shownMeals();
  const plan = Array.from({ length: count }, (_, i) =>
    mode === 'days' ? { date: addDays(start, i), meal } : { date: start, meal: meals[(Math.max(0, meals.indexOf(meal)) + i) % meals.length]! },
  );

  const go = async () => {
    setBusy(true);
    try {
      for (const p of plan) await addEntry({ date: p.date, meal: p.meal, grams: Math.round(serving * 10) / 10, food: recipe.food, amount: 1, unit: 'serving' });
      showToast(`Logged ${count} portion${count === 1 ? '' : 's'} of ${recipe.food.name}.`);
      setPortions(null);
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.head}>
            <Text style={type.title} numberOfLines={1}>Split {recipe.food.name}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: space(3) }}>
            <Text style={type.small}>A batch you’ll eat over several meals or days. Each portion is one serving: {Math.round(serving)} g, {each.kcal} kcal, {each.protein} g protein.</Text>
            <Text style={type.label}>Portions</Text>
            <View style={s.stepper}>
              <Pressable onPress={() => setPortions(Math.max(1, count - 1))} style={s.step} accessibilityLabel="One fewer portion"><Ionicons name="remove" size={20} color={color.iron} /></Pressable>
              <Text style={[type.title, { minWidth: 40, textAlign: 'center' }]}>{count}</Text>
              <Pressable onPress={() => setPortions(Math.min(14, count + 1))} style={s.step} accessibilityLabel="One more portion"><Ionicons name="add" size={20} color={color.iron} /></Pressable>
            </View>
            <View style={s.chips}>
              <Chip label="One a day" on={mode === 'days'} onPress={() => setMode('days')} />
              <Chip label="Across one day’s meals" on={mode === 'today'} onPress={() => setMode('today')} />
            </View>
            <Text style={type.label}>{mode === 'days' ? 'At' : 'Starting at'}</Text>
            <View style={s.chips}>{meals.map((m) => <Chip key={m} label={MEAL_NAMES[m]} on={meal === m} onPress={() => setMeal(m)} />)}</View>
            <Text style={type.label}>{mode === 'days' ? 'Starting' : 'On'}</Text>
            <View style={s.chips}>
              {[0, 1].map((d) => <Chip key={d} label={dayName(addDays(todayLocal(), d))} on={start === addDays(todayLocal(), d)} onPress={() => setStart(addDays(todayLocal(), d))} />)}
            </View>
            <Text style={type.small}>{plan.map((p) => `${dayName(p.date)} ${MEAL_NAMES[p.meal].toLowerCase()}`).join(' · ')}</Text>
            <Pressable onPress={() => void go()} disabled={busy} style={[s.button, busy && { opacity: 0.5 }]} accessibilityRole="button">
              <Text style={s.buttonText}>{busy ? 'Logging…' : `Log ${count} portion${count === 1 ? '' : 's'}`}</Text>
            </Pressable>
            <Text style={type.small}>Portions on later days show in their days, and can be moved or removed like any entry.</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(3), maxHeight: '90%', maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  step: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  button: { backgroundColor: color.iron, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  buttonText: { color: color.chalk, fontWeight: '800', fontSize: 16 },
});
