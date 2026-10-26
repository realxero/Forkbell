import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { addDays, sumEntries, todayLocal, type DiaryEntry, type Meal, entryName } from '@forkbell/shared';
import { addEntry, deleteEntry, saveMeal } from '../lib/actions';
import { showToast } from '../lib/toast';
import { CalendarSheet } from './Calendar';
import { Chip, MEAL_NAMES } from './AmountPicker';
import { color, radius, space, type } from '../lib/theme';

const dayName = (date: string) => {
  const t = todayLocal();
  if (date === t) return 'today';
  if (date === addDays(t, 1)) return 'tomorrow';
  if (date === addDays(t, -1)) return 'yesterday';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** The bar shown while picking several foods: copy them, save them as a meal, or remove them. */
export function SelectionBar({ entries, onDone, onChanged }: { entries: DiaryEntry[]; onDone: () => void; onChanged: () => void }) {
  const [copying, setCopying] = useState(false);
  const [target, setTarget] = useState(entries[0]?.date ?? todayLocal());
  const [meal, setMeal] = useState<Meal | 'keep'>('keep');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const n = entries.length;
  const kcal = sumEntries(entries).kcal;

  const copy = async () => {
    for (const e of entries) await addEntry({ date: target, meal: meal === 'keep' ? e.meal : meal, grams: e.grams, food: e.food });
    setCopying(false);
    onChanged();
    onDone();
    showToast(`Copied ${n} ${n === 1 ? 'food' : 'foods'} to ${dayName(target)}`);
  };
  const remove = async () => {
    const gone = [...entries];
    for (const e of gone) await deleteEntry(e);
    onChanged();
    onDone();
    showToast(`Removed ${gone.length} ${gone.length === 1 ? 'food' : 'foods'}`, {
      action: {
        label: 'Undo',
        run: async () => {
          for (const e of gone) await addEntry({ date: e.date, meal: e.meal, grams: e.grams, food: e.food });
          onChanged();
        },
      },
    });
  };
  const save = async () => {
    setError(null);
    try {
      await saveMeal(name.trim(), entries.map((e) => ({ food: e.food, grams: e.grams })));
      setNaming(false);
      onDone();
      showToast(`Saved “${name.trim()}”. Find it when you add food.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const btn = (icon: ComponentProps<typeof Ionicons>['name'], label: string, run: () => void, danger = false) => (
    <Pressable disabled={!n} onPress={run} style={[s.btn, !n && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={danger ? color.over : color.accent} />
      <Text style={[s.btnText, danger && { color: color.over }]}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <View style={s.bar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type.body, { fontWeight: '800' }]}>{n} selected{n ? ` · ${kcal} kcal` : ''}</Text>
          <Pressable onPress={onDone} hitSlop={10}><Text style={{ color: color.accent, fontWeight: '700' }}>Done</Text></Pressable>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {btn('copy-outline', 'Copy', () => setCopying(true))}
          {btn('bookmark-outline', 'Save as meal', () => { setName(''); setNaming(true); })}
          {btn('trash-outline', 'Remove', remove, true)}
        </View>
      </View>

      <CalendarSheet
        visible={copying}
        selected={target}
        title={`Copy ${n} ${n === 1 ? 'food' : 'foods'}`}
        onPick={setTarget}
        onClose={() => setCopying(false)}
        footer={
          <View style={{ gap: space(2) }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
              <Chip label="Keep each meal" on={meal === 'keep'} onPress={() => setMeal('keep')} />
              {(['breakfast', 'lunch', 'dinner', 'snacks'] as Meal[]).map((m) => <Chip key={m} label={MEAL_NAMES[m]} on={meal === m} onPress={() => setMeal(m)} />)}
            </View>
            <Pressable onPress={copy} style={s.primary}><Text style={s.primaryText}>Copy to {dayName(target)}</Text></Pressable>
          </View>
        }
      />

      <Modal visible={naming} transparent animationType="fade" onRequestClose={() => setNaming(false)}>
        <Pressable style={s.backdrop} onPress={() => setNaming(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={type.title}>Save as a meal</Text>
            <Text style={type.small}>{entries.map((e) => entryName(e)).join(', ')}</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. My usual breakfast" style={s.input} autoFocus maxLength={80} />
            {error && <Text style={{ color: color.over }}>{error}</Text>}
            <Pressable disabled={!name.trim()} onPress={save} style={[s.primary, !name.trim() && { opacity: 0.4 }]}><Text style={s.primaryText}>Save meal</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  bar: { position: 'absolute', left: space(3), right: space(3), bottom: space(3), backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, padding: space(3), gap: space(2), shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, maxWidth: 616, alignSelf: 'center', width: '94%' },
  btn: { alignItems: 'center', gap: 2, paddingHorizontal: space(3), paddingVertical: space(1), minWidth: 72 },
  btnText: { color: color.accent, fontWeight: '700', fontSize: 13 },
  primary: { backgroundColor: color.accent, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  primaryText: { color: color.onAccent, fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: space(4) },
  sheet: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), maxWidth: 440, width: '100%', alignSelf: 'center' },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
});
