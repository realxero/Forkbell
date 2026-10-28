// Settings → Food preferences → Meals: rename meals, turn on up to two more
// (Pre-workout, Second breakfast...), hide ones you don't use, and put them
// in your order. What's logged stays put: renaming only changes the name.
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { mealSlots, type MealSlot, type Preferences } from '@forkbell/shared';
import { color, space, type } from '../lib/theme';

export function MealSlotsEditor({ prefs, onChange }: { prefs: Preferences; onChange: (meals: MealSlot[]) => void }) {
  const slots = mealSlots(prefs.meals);
  const [names, setNames] = useState<Record<string, string>>({});
  const set = (next: MealSlot[]) => onChange(next);
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= slots.length) return;
    const next = [...slots];
    [next[i], next[j]] = [next[j]!, next[i]!];
    set(next);
  };
  const shownCount = slots.filter((s) => s.show).length;
  return (
    <View style={{ gap: space(2) }}>
      <Text style={s.note}>Rename them, turn on up to two more, hide ones you don’t use, and put them in order. Anything already logged stays where it is.</Text>
      {slots.map((slot, i) => (
        <View key={slot.key} style={[s.row, !slot.show && { opacity: 0.55 }]}>
          <TextInput
            value={names[slot.key] ?? slot.name}
            onChangeText={(t) => setNames((n) => ({ ...n, [slot.key]: t }))}
            onEndEditing={() => {
              const t = (names[slot.key] ?? slot.name).trim().slice(0, 30);
              if (t && t !== slot.name) set(slots.map((x) => (x.key === slot.key ? { ...x, name: t } : x)));
            }}
            style={s.input}
            maxLength={30}
            accessibilityLabel={`Name of meal ${i + 1}`}
          />
          <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={6} accessibilityLabel={`Move ${slot.name} up`} style={{ opacity: i === 0 ? 0.3 : 1 }}>
            <Ionicons name="chevron-up" size={20} color={color.ironSoft} />
          </Pressable>
          <Pressable onPress={() => move(i, 1)} disabled={i === slots.length - 1} hitSlop={6} accessibilityLabel={`Move ${slot.name} down`} style={{ opacity: i === slots.length - 1 ? 0.3 : 1 }}>
            <Ionicons name="chevron-down" size={20} color={color.ironSoft} />
          </Pressable>
          <Switch
            value={slot.show}
            disabled={slot.show && shownCount === 1}
            onValueChange={(show) => set(slots.map((x) => (x.key === slot.key ? { ...x, show } : x)))}
            accessibilityLabel={`Show ${slot.name}`}
          />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  input: { ...type.body, flex: 1, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, paddingHorizontal: space(3), paddingVertical: space(2), color: color.iron },
  note: { ...type.small },
});
