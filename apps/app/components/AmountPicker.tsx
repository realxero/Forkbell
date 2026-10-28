import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MEALS, amountFromGrams, amountText, forAmount, parseQuantity, unitFor, unitsFor, type DiaryDay, type Food, type FoodCandidate, type Meal } from '@forkbell/shared';
import { useAuth } from '../lib/auth';
import { readCache } from '../lib/sync';
import { setFoodServing } from '../lib/actions';
import { color, space, type } from '../lib/theme';

// Your meal names (Settings → Food preferences → Meals), shared by every screen.
export { MEAL_NAMES } from '../lib/meals';
import { MEAL_NAMES, shownMeals } from '../lib/meals';

type Props = {
  food: Food | FoodCandidate;
  initialGrams?: number;
  /** how the amount was said last time it was saved (editing an entry) */
  initialAmount?: { amount: number; unit: string } | null;
  initialMeal: Meal;
  /** what you had last time, offered as the first chip */
  lastGrams?: number | null;
  /** the day it goes on, so each number can show its share of that day's goal */
  date?: string;
  submitLabel: (meal: Meal) => string;
  /** grams for the numbers, and how you said it ("1" "serving", "4" "oz") */
  onSubmit: (grams: number, meal: Meal, said: { amount: number; unit: string }) => Promise<void>;
  error: string | null;
  /** extra actions under the main button, like Remove or Pick a different food */
  children?: ReactNode;
};

/**
 * How much and which meal, in the units people use: servings or the label's
 * word for one (bar, slice), oz, g, and for drinks fl oz, cups and ml. Used
 * for adding a food and for editing an entry.
 */
export function AmountPicker({ food: given, initialGrams, initialAmount, initialMeal, lastGrams, date, submitLabel, onSubmit, error, children }: Props) {
  const { me } = useAuth();
  const prefer = me?.weightUnit ?? 'lb';
  // A serving added here ("1 bar" = this amount) applies straight away.
  const [serving, setServing] = useState<{ servingGrams: number; servingLabel: string | null } | null>(null);
  const food = useMemo(() => (serving ? { ...given, ...serving } : given), [given, serving]);
  const [naming, setNaming] = useState<string | null>(null);
  const [servingError, setServingError] = useState<string | null>(null);
  const units = useMemo(() => unitsFor(food, prefer), [food, prefer]);
  // Start with what was said before, else last time's amount, else one serving, else 100 g in your unit.
  const start = useMemo(() => {
    if (initialAmount) return { q: initialAmount.amount, key: unitFor(food, initialAmount.unit, prefer).key };
    const grams = initialGrams ?? lastGrams ?? null;
    if (grams) {
      const a = amountFromGrams(food, grams, prefer);
      return a.unit.key === 'g' && prefer === 'lb' ? { q: Math.round((grams / 28.349523) * 10) / 10, key: 'oz' } : { q: a.quantity, key: a.unit.key };
    }
    if (food.servingGrams) return { q: 1, key: 'serving' };
    return prefer === 'lb' ? { q: 3.5, key: 'oz' } : { q: 100, key: 'g' };
  }, [food, initialAmount, initialGrams, lastGrams, prefer]);
  const [qty, setQty] = useState(String(start.q));
  const [unitKey, setUnitKey] = useState(start.key);
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [busy, setBusy] = useState(false);
  const unit = units.find((u) => u.key === unitKey) ?? units[0]!;
  const q = parseQuantity(qty);
  const g = q === null ? NaN : Math.round(q * unit.grams * 10) / 10;
  const valid = Number.isFinite(g) && g > 0 && g <= 10000;
  const n = useMemo(() => forAmount(food.per100, valid ? g : 0), [food, g, valid]);
  // The day's goals, from this phone's copy of that day, for the bars.
  const goals = date ? readCache<DiaryDay>(`/api/diary/${date}`)?.goals ?? null : null;
  const pickUnit = (key: string) => {
    const next = units.find((u) => u.key === key)!;
    // Keep the same amount of food when switching units: 1 serving → 11.0 fl oz.
    if (q !== null && valid) {
      const v = g / next.grams;
      setQty(String(next.key === 'g' || next.key === 'ml' ? Math.round(v) : Math.round(v * 100) / 100));
    }
    setUnitKey(key);
  };
  const last = lastGrams && lastGrams > 0 ? amountFromGrams(food, lastGrams, prefer) : null;

  return (
    <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
      <Text style={type.title}>{food.name}</Text>
      {food.brand ? <Text style={type.small}>{food.brand}</Text> : null}
      {food.servingLabel || food.servingGrams ? (
        <Text style={type.small}>
          One serving: {food.servingLabel ? `${food.servingLabel}${food.servingGrams && !/\bg\b/.test(food.servingLabel) ? ` (${Math.round(food.servingGrams)} g)` : ''}` : `${Math.round(food.servingGrams!)} g`}
        </Text>
      ) : null}

      <View style={[s.row, { marginTop: space(2) }]}>
        <TextInput
          value={qty}
          onChangeText={setQty}
          keyboardType="decimal-pad"
          style={[s.input, s.qty]}
          selectTextOnFocus
          accessibilityLabel={`How many ${unit.label}`}
        />
        <Text style={[type.title, { flexShrink: 1 }]} numberOfLines={1}>
          {unit.count && q !== null && q > 1 && !/s$/.test(unit.label) ? `${unit.label}s` : unit.label}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.unitRow} keyboardShouldPersistTaps="handled">
        {units.map((u) => (
          <Chip key={u.key} label={u.label} on={u.key === unit.key} onPress={() => pickUnit(u.key)} />
        ))}
      </ScrollView>
      <View style={s.chips}>
        {unit.count &&
          [0.5, 1, 1.5, 2].map((x) => <Chip key={x} label={x === 0.5 ? '½' : x === 1.5 ? '1½' : String(x)} on={q === x} onPress={() => setQty(String(x))} />)}
        {last && (
          <Chip
            label={`Last time: ${amountText(last.quantity, last.unit)}`}
            on={valid && Math.abs(g - lastGrams!) < 0.5}
            onPress={() => {
              setUnitKey(last.unit.key);
              setQty(String(last.quantity));
            }}
          />
        )}
      </View>
      {!unit.count && valid && (
        // Several at once without the maths: 2 × 1.7 oz.
        <View style={s.chips}>
          {[0.5, 2, 3, 4].map((x) => (
            <Chip key={x} label={`× ${x === 0.5 ? '½' : x}`} on={false} onPress={() => setQty(String(Math.round(q! * x * 100) / 100))} />
          ))}
        </View>
      )}
      {valid && unit.key !== 'g' && <Text style={type.small}>= {Math.round(g)} g</Text>}
      {!food.servingGrams && 'id' in food && food.source !== 'builtin' && valid && (
        <View style={{ gap: space(1), marginTop: space(1) }}>
          {naming === null ? (
            <Pressable onPress={() => setNaming('')} hitSlop={6}>
              <Text style={s.link}>Make {amountText(q!, unit)} one serving (like 1 bar), to log “2 bars” next time</Text>
            </Pressable>
          ) : (
            <View style={s.row}>
              <Text style={type.body}>1</Text>
              <TextInput value={naming} onChangeText={setNaming} placeholder="bar, cookie, scoop…" placeholderTextColor={color.placeholder} autoFocus style={[s.input, { flex: 1 }]} accessibilityLabel="What one serving is called" />
              <Pressable
                onPress={async () => {
                  setServingError(null);
                  const label = naming.trim() ? `1 ${naming.trim().toLowerCase()}` : null;
                  try {
                    await setFoodServing(String(food.id), g, label);
                    setServing({ servingGrams: g, servingLabel: label });
                    setUnitKey('serving');
                    setQty('1');
                    setNaming(null);
                  } catch (e) {
                    setServingError(e instanceof Error ? e.message : String(e));
                  }
                }}
                style={s.smallButton}
                accessibilityRole="button"
              >
                <Text style={s.smallButtonText}>Save</Text>
              </Pressable>
            </View>
          )}
          {servingError && <Text style={s.error}>{servingError}</Text>}
        </View>
      )}
      {!valid && qty.trim() !== '' && <Text style={s.error}>Type an amount like 1, 1.5 or 1/2.</Text>}

      <View style={s.nutrition}>
        <Stat label="Calories" value={`${n.kcal}`} tint={color.accent} of={goals?.kcal} amount={n.kcal} />
        <Stat label="Protein" value={`${n.protein} g`} tint={color.protein} of={goals?.protein} amount={n.protein} />
        <Stat label="Carbs" value={`${n.carbs} g`} tint={color.carbs} of={goals?.carbs} amount={n.carbs} />
        <Stat label="Fat" value={`${n.fat} g`} tint={color.fat} of={goals?.fat} amount={n.fat} />
      </View>
      {goals?.kcal ? <Text style={type.small}>The bars show how much of the day’s goal this is.</Text> : null}

      <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel="Meal">
        {shownMeals().map((m) => (
          <Chip key={m} label={MEAL_NAMES[m]} on={meal === m} onPress={() => setMeal(m)} />
        ))}
      </View>
      {error && <Text style={s.error}>{error}</Text>}
      <Pressable
        disabled={!valid || busy}
        onPress={async () => {
          setBusy(true);
          try {
            await onSubmit(g, meal, { amount: q!, unit: unit.key });
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

/** A number with a bar: how much of the day's goal it is (full colour when there's no goal to compare with). */
function Stat({ label, value, tint, of, amount }: { label: string; value: string; tint: string; of?: number | null; amount: number }) {
  const share = of && of > 0 ? Math.min(1, amount / of) : null;
  return (
    <View style={{ flex: 1, gap: space(1) }} accessibilityLabel={`${label} ${value}${share !== null ? `, ${Math.round(share * 100)}% of the day's goal` : ''}`}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: share === null ? tint : color.track, overflow: 'hidden' }}>
        {share !== null && <View style={{ height: 4, width: `${Math.max(share * 100, amount > 0 ? 4 : 0)}%`, backgroundColor: tint }} />}
      </View>
      <Text style={[type.title, type.number]}>{value}</Text>
      <Text style={type.small}>
        {label}
        {share !== null ? ` · ${Math.round(share * 100)}%` : ''}
      </Text>
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
  link: { color: color.accent, fontWeight: '700' },
  smallButton: { backgroundColor: color.iron, borderRadius: 10, paddingHorizontal: space(4), paddingVertical: space(3) },
  smallButtonText: { color: color.chalk, fontWeight: '700' },
  qty: { width: 110, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  unitRow: { gap: space(2), paddingVertical: space(1) },
  nutrition: { flexDirection: 'row', gap: space(3), backgroundColor: color.card, borderRadius: 12, padding: space(4), marginVertical: space(2) },
  error: { ...type.body, color: color.over },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center', marginTop: space(2) },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
});
