import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Program, RoutineExercise } from '@forkbell/shared';
import { cachedGet } from '../../lib/sync';
import { api, del } from '../../lib/api';
import { confirm } from '../../lib/confirm';
import { formatDuration } from '../../lib/units';
import { ExercisePicker } from '../../components/ExercisePicker';
import { color, space, type } from '../../lib/theme';

/** Edit one training day: its name, exercises, sets, rep range and rest. */
export default function RoutineEditor() {
  const { id, programId } = useLocalSearchParams<{ id: string; programId: string }>();
  const [name, setName] = useState('');
  const [items, setItems] = useState<RoutineExercise[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    cachedGet<{ programs: Program[] }>('/api/programs').then(
      (r) => {
        const routine = r.programs.find((p) => p.id === programId)?.routines.find((x) => x.id === id);
        if (!routine) return setError('That day was not found.');
        setName(routine.name);
        setItems(routine.exercises);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [id, programId]);

  const change = (i: number, patch: Partial<RoutineExercise>) => setItems((list) => list!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) =>
    setItems((list) => {
      const l = [...list!];
      const j = i + by;
      if (j < 0 || j >= l.length) return l;
      [l[i], l[j]] = [l[j]!, l[i]!];
      return l;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/routines/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          exercises: items!.map((x) => ({ exerciseId: x.exercise.id, sets: x.sets, repMin: x.repMin, repMax: Math.max(x.repMin, x.repMax), restSeconds: x.restSeconds })),
        }),
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm('Delete this day?', 'Past workouts stay in your history.', 'Delete'))) return;
    await del(`/api/routines/${id}`).catch(() => {});
    router.back();
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={s.link}>Cancel</Text>
          </Pressable>
          <Pressable onPress={save} disabled={!items || saving || !name.trim()} hitSlop={12}>
            <Text style={[s.link, (!items || saving || !name.trim()) && { opacity: 0.4 }]}>Save</Text>
          </Pressable>
        </View>
        {error && <Text style={s.error}>{error}</Text>}
        {!items && !error && <ActivityIndicator color={color.iron} />}
        {items && (
          <>
            <TextInput value={name} onChangeText={setName} style={[s.input, type.title]} accessibilityLabel="Day name" />
            {items.length === 0 && <Text style={type.body}>No exercises yet.</Text>}
            {items.map((x, i) => (
              <View key={`${x.exercise.id}-${i}`} style={s.card}>
                <View style={s.row}>
                  <Text style={[type.body, { fontWeight: '700', flex: 1 }]}>{x.exercise.name}</Text>
                  <Pressable onPress={() => move(i, -1)} hitSlop={6}><Text style={s.icon}>↑</Text></Pressable>
                  <Pressable onPress={() => move(i, 1)} hitSlop={6}><Text style={s.icon}>↓</Text></Pressable>
                  <Pressable onPress={() => setItems((l) => l!.filter((_, j) => j !== i))} hitSlop={6}><Text style={[s.icon, { color: color.over }]}>✕</Text></Pressable>
                </View>
                <Stepper label="Sets" value={x.sets} min={1} max={20} onChange={(v) => change(i, { sets: v })} />
                {x.exercise.kind !== 'time' && (
                  <>
                    <Stepper label="Reps from" value={x.repMin} min={1} max={100} onChange={(v) => change(i, { repMin: v, repMax: Math.max(v, x.repMax) })} />
                    <Stepper label="Reps to" value={x.repMax} min={x.repMin} max={100} onChange={(v) => change(i, { repMax: v })} />
                  </>
                )}
                <Stepper label="Rest" value={x.restSeconds} min={0} max={900} step={15} format={formatDuration} onChange={(v) => change(i, { restSeconds: v })} />
              </View>
            ))}
            <Pressable onPress={() => setPicker(true)} style={s.add}>
              <Text style={s.link}>+ Add exercise</Text>
            </Pressable>
            <Text style={type.small}>
              Forkbell keeps the weight the same until you reach the top of the rep range on every set, then adds one step (5 lb or 2.5 kg; 10 lb or 5 kg for big leg lifts and deadlifts).
            </Text>
            <Pressable onPress={remove} style={{ alignSelf: 'center', padding: space(4) }}>
              <Text style={[s.link, { color: color.over }]}>Delete this day</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <ExercisePicker
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(e) => {
          setPicker(false);
          setItems((l) => [...(l ?? []), { exercise: e, sets: 3, repMin: e.kind === 'time' ? 1 : 8, repMax: e.kind === 'time' ? 1 : 12, restSeconds: e.restSeconds }]);
        }}
      />
    </SafeAreaView>
  );
}

function Stepper({ label, value, min, max, step = 1, format = String, onChange }: { label: string; value: number; min: number; max: number; step?: number; format?: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <View style={s.row}>
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <Pressable onPress={() => onChange(Math.max(min, value - step))} style={s.step} accessibilityLabel={`Less ${label}`}><Text style={s.stepText}>−</Text></Pressable>
      <Text style={[type.body, type.number, { minWidth: 48, textAlign: 'center', fontWeight: '700' }]}>{format(value)}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + step))} style={s.step} accessibilityLabel={`More ${label}`}><Text style={s.stepText}>+</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  input: { backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  card: { backgroundColor: color.card, borderRadius: 14, padding: space(3), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  icon: { fontSize: 18, color: color.ironSoft, paddingHorizontal: space(1) },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, color: color.iron, fontWeight: '700' },
  add: { borderWidth: 1, borderStyle: 'dashed', borderColor: color.line, borderRadius: 14, padding: space(4), alignItems: 'center', backgroundColor: color.card },
});
