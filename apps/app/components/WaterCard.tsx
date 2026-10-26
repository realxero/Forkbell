// Water on Today: the day's total against your goal, a tap per cup or bottle,
// any amount typed ("20 oz", "1.5 L"), and Undo for the last one. Works
// offline: every change shows straight away and is sent when it can be.
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { parseWater, reachedGoal, waterButtons, waterGoalMl, waterText, type WaterDay } from '@forkbell/shared';
import { useAuth } from '../lib/auth';
import { cachedGet, readCache } from '../lib/sync';
import { addWater, undoWater } from '../lib/actions';
import { haptic } from '../lib/haptics';
import { showToast } from '../lib/toast';
import { Confetti } from './Confetti';
import { color, radius, space, type } from '../lib/theme';

export function WaterCard({ date, readOnly }: { date: string; readOnly?: boolean }) {
  const { me } = useAuth();
  const unit = me?.weightUnit ?? 'lb';
  const path = `/api/wellbeing/water/${date}`;
  const [day, setDay] = useState<WaterDay | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [party, setParty] = useState(0);
  const fromCache = useCallback(() => setDay(readCache<WaterDay>(path) ?? { date, entries: [], totalMl: 0 }), [path, date]);
  useFocusEffect(
    useCallback(() => {
      setDay(readCache<WaterDay>(path) ?? null);
      cachedGet<WaterDay>(path).then(setDay, fromCache);
    }, [path, fromCache]),
  );

  const prefs = me?.preferences.water;
  if (prefs && !prefs.show) return null;
  const goal = waterGoalMl(prefs?.goalMl);
  const total = day?.totalMl ?? 0;
  const pct = Math.min(1, total / goal);

  const add = async (ml: number) => {
    haptic.tap();
    setProblem(null);
    const before = total;
    const pending = addWater(date, ml);
    fromCache(); // shows before it's sent
    try {
      const after = await pending;
      fromCache();
      if (reachedGoal(before, after, goal)) {
        setParty((n) => n + 1);
        showToast(`Water goal reached: ${waterText(after, unit)}. Nice!`, { tone: 'celebrate' });
      }
    } catch (e) {
      fromCache();
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  const undo = async () => {
    haptic.tap();
    const last = await undoWater(date).catch((e) => {
      setProblem(e instanceof Error ? e.message : String(e));
      return null;
    });
    fromCache();
    if (last) showToast(`Took back ${waterText(last.ml, unit)}.`);
  };
  const addTyped = () => {
    const ml = parseWater(typing ?? '', unit);
    if (!ml) return setProblem(`Type an amount like ${unit === 'lb' ? '“20 oz” or “1.5 L”' : '“400 ml” or “1.5 L”'}.`);
    setTyping(null);
    void add(ml);
  };

  return (
    <View style={s.card}>
      {party > 0 && (
        <View key={party} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Confetti pieces={22} height={180} />
        </View>
      )}
      <View style={s.row}>
        <Ionicons name="water" size={22} color={color.water} />
        <Text style={[type.title, { flex: 1, fontSize: 18 }]}>Water</Text>
        <Text style={[type.body, type.number, { fontWeight: '800' }]} accessibilityLabel={`${waterText(total, unit)} of ${waterText(goal, unit)}`}>
          {waterText(total, unit)} <Text style={[type.small, { fontWeight: '400' }]}>of {waterText(goal, unit)}</Text>
        </Text>
      </View>
      <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
        <View style={[s.fill, { width: `${pct * 100}%` }]} />
      </View>
      {total >= goal && <Text style={[type.small, { color: color.water, fontWeight: '700' }]}>Goal reached 💧</Text>}
      {!readOnly && (
        <>
          <View style={s.row}>
            {waterButtons(unit).map((b) => (
              <Pressable key={b.ml} onPress={() => void add(b.ml)} style={({ pressed }) => [s.button, pressed && { backgroundColor: color.waterBg }]} accessibilityRole="button" accessibilityLabel={`Add ${b.label.slice(1)} of water`}>
                <Text style={s.buttonText}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.row}>
            {typing === null ? (
              <Pressable onPress={() => setTyping('')} hitSlop={6} style={{ flex: 1, minHeight: 36, justifyContent: 'center' }}>
                <Text style={s.link}>Other amount</Text>
              </Pressable>
            ) : (
              <>
                <TextInput
                  value={typing}
                  onChangeText={setTyping}
                  onSubmitEditing={addTyped}
                  placeholder={unit === 'lb' ? '20 oz or 1.5 L' : '400 ml or 1.5 L'}
                  placeholderTextColor={color.placeholder}
                  autoFocus
                  returnKeyType="done"
                  style={s.input}
                  accessibilityLabel="Amount of water"
                />
                <Pressable onPress={addTyped} style={s.addButton} accessibilityRole="button"><Text style={s.addButtonText}>Add</Text></Pressable>
                <Pressable onPress={() => { setTyping(null); setProblem(null); }} hitSlop={8} accessibilityLabel="Cancel"><Ionicons name="close" size={20} color={color.ironSoft} /></Pressable>
              </>
            )}
            {typing === null && Boolean(day?.entries.length) && (
              <Pressable onPress={() => void undo()} hitSlop={8} style={s.undo} accessibilityRole="button" accessibilityLabel={`Undo the last ${waterText(day!.entries.at(-1)!.ml, unit)}`}>
                <Ionicons name="arrow-undo-outline" size={18} color={color.ironSoft} />
                <Text style={type.small}>Undo {waterText(day!.entries.at(-1)!.ml, unit)}</Text>
              </Pressable>
            )}
          </View>
          {problem && <Text style={[type.small, { color: color.over }]}>{problem}</Text>}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  bar: { height: 10, borderRadius: 5, backgroundColor: color.track, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: color.water },
  button: { flex: 1, minHeight: 42, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.water, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: color.water, fontWeight: '800', fontSize: 15 },
  link: { color: color.water, fontWeight: '700' },
  input: { ...type.body, flex: 1, backgroundColor: color.chalk, borderRadius: 10, paddingHorizontal: space(3), paddingVertical: space(2), color: color.iron },
  addButton: { backgroundColor: color.water, borderRadius: 10, paddingHorizontal: space(4), paddingVertical: space(2) },
  addButtonText: { color: '#fff', fontWeight: '800' },
  undo: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
});
