import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MEALS, amountChips, forAmount, type Food, type FoodCandidate, type Meal } from '@forkbell/shared';
import { color, space, type } from '../lib/theme';

export const MEAL_NAMES: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

type Props = {
  food: Food | FoodCandidate;
  initialGrams?: number;
  initialMeal: Meal;
  /** what you had last time, offered as the first chip */
  lastGrams?: number | null;
  submitLabel: (meal: Meal) => string;
  onSubmit: (grams: number, meal: Meal) => Promise<void>;
  error: string | null;
  /** extra actions under the main button, like Remove or Pick a different food */
  children?: ReactNode;
};

/** Pick how much and which meal. Used for adding a food and for editing an entry. */
export function AmountPicker({ food, initialGrams, initialMeal, lastGrams, submitLabel, onSubmit, error, children }: Props) {
  const [grams, setGrams] = useState(String(initialGrams ?? lastGrams ?? food.servingGrams ?? 100));
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [busy, setBusy] = useState(false);
  const g = Number(grams.replace(',', '.'));
  const valid = Number.isFinite(g) && g > 0 && g <= 10000;
  const n = useMemo(() => forAmount(food.per100, valid ? g : 0), [food, g, valid]);
  const chips = useMemo(() => amountChips(food, lastGrams), [food, lastGrams]);

  return (
    <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>{food.name}</Text>
      {food.brand ? <Text style={type.small}>{food.brand}</Text> : null}

      <View style={s.chips}>
        {chips.map((c) => (
          <Chip key={c.label} label={c.label} on={g === c.grams} onPress={() => setGrams(String(c.grams))} />
        ))}
      </View>

      <View style={s.row}>
        <TextInput
          value={grams}
          onChangeText={setGrams}
          keyboardType="decimal-pad"
          style={[s.input, { flex: 1 }]}
          selectTextOnFocus
          accessibilityLabel="Amount in grams"
        />
        <Text style={type.body}>grams</Text>
      </View>

      <View style={s.nutrition}>
        <Stat label="Calories" value={`${n.kcal}`} />
        <Stat label="Protein" value={`${n.protein} g`} tint={color.protein} />
        <Stat label="Carbs" value={`${n.carbs} g`} tint={color.carbs} />
        <Stat label="Fat" value={`${n.fat} g`} tint={color.fat} />
      </View>

      <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="Meal">
        {MEALS.map((m) => (
          <Chip key={m} label={MEAL_NAMES[m]} on={meal === m} onPress={() => setMeal(m)} />
        ))}
      </View>

      {error && <Text style={s.error}>{error}</Text>}
      <Pressable
        disabled={!valid || busy}
        onPress={async () => {
          setBusy(true);
          try {
            await onSubmit(g, meal);
          } finally {
            setBusy(false);
          }
        }}
        style={[s.button, (!valid || busy) && { opacity: 0.4 }]}
      >
        <Text style={s.buttonText}>{submitLabel(meal)}</Text>
      </Pressable>
      {children}
    </ScrollView>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]} accessibilityState={{ selected: on }}>
      <Text style={[type.small, on && { color: color.card }]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={{ flex: 1, gap: space(1) }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: tint ?? 'transparent' }} />
      <Text style={[type.title, type.number]}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  list: { padding: space(4), gap: space(2), paddingBottom: space(16), maxWidth: 640, width: '100%', alignSelf: 'center' },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(2) },
  chip: { borderWidth: 1, borderColor: color.line, borderRadius: 20, paddingHorizontal: space(3), paddingVertical: space(2), backgroundColor: color.card },
  chipOn: { backgroundColor: color.iron, borderColor: color.iron },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  nutrition: { flexDirection: 'row', gap: space(3), backgroundColor: color.card, borderRadius: 12, padding: space(4), marginVertical: space(2) },
  error: { ...type.body, color: color.over },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center', marginTop: space(2) },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
});
