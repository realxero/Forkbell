import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MUSCLES, type Exercise, type ExerciseKind, type Muscle } from '@forkbell/shared';
import { post } from '../lib/api';
import { cachedGet, updateCache } from '../lib/sync';
import { Chip } from './AmountPicker';
import { color, space, type } from '../lib/theme';

type Listed = Exercise & { uses: number };
const KINDS: { kind: ExerciseKind; label: string }[] = [
  { kind: 'weight', label: 'Weight × reps' },
  { kind: 'bodyweight', label: 'Bodyweight reps' },
  { kind: 'time', label: 'Time' },
];
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight', 'band', 'other'];

/** Full-screen list to pick an exercise, with search, muscle filter and "create your own". */
export function ExercisePicker({
  visible,
  onPick,
  onClose,
  title = 'Add exercise',
  inline = false,
  initialMuscle = null,
}: {
  visible: boolean;
  onPick: (e: Exercise) => void;
  onClose: () => void;
  title?: string;
  /** render as a page instead of a sheet over the current screen */
  inline?: boolean;
  /** start filtered to one muscle, e.g. when suggesting a swap */
  initialMuscle?: string | null;
}) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>((initialMuscle as Muscle) ?? null);
  useEffect(() => {
    if (visible) setMuscle((initialMuscle as Muscle) ?? null);
  }, [visible, initialMuscle]);
  const [list, setList] = useState<Listed[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // The whole library is small, so it's loaded once (and kept for offline) and searched here.
  useEffect(() => {
    if (!visible) return;
    let live = true;
    cachedGet<{ exercises: Listed[] }>('/api/exercises').then(
      (r) => live && setList(r.exercises),
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [visible]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (list ?? []).filter(
    (e) => (!muscle || e.muscle === muscle) && words.every((w) => `${e.name} ${e.muscle} ${e.equipment}`.toLowerCase().includes(w)),
  );
  const used = shown.filter((e) => e.uses > 0);
  const rest = shown.filter((e) => e.uses === 0);

  const body = (
      <SafeAreaView style={s.screen}>
        <View style={s.head}>
          <Text style={type.title}>{creating ? 'New exercise' : title}</Text>
          <Pressable onPress={creating ? () => setCreating(false) : onClose} hitSlop={12}>
            <Text style={s.link}>{creating ? 'Back' : 'Close'}</Text>
          </Pressable>
        </View>
        {creating ? (
          <CreateExercise
            initialName={q}
            onCreated={(e) => {
              setCreating(false);
              onPick(e);
            }}
          />
        ) : (
          <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
            <TextInput value={q} onChangeText={setQ} placeholder="Search exercises" style={s.input} autoCorrect={false} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
              <Chip label="All" on={!muscle} onPress={() => setMuscle(null)} />
              {MUSCLES.map((m) => (
                <Chip key={m} label={cap(m)} on={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />
              ))}
            </ScrollView>
            {error && <Text style={s.error}>{error}</Text>}
            {!list && !error && <ActivityIndicator color={color.iron} />}
            {used.length > 0 && <Text style={s.section}>You’ve done these</Text>}
            {used.map((e) => <Row key={e.id} e={e} onPress={() => onPick(e)} />)}
            {rest.length > 0 && <Text style={s.section}>{used.length ? 'Everything else' : 'Exercises'}</Text>}
            {rest.map((e) => <Row key={e.id} e={e} onPress={() => onPick(e)} />)}
            {list && shown.length === 0 && <Text style={type.body}>Nothing matches. Create it below.</Text>}
            <Pressable onPress={() => setCreating(true)} style={{ paddingVertical: space(3) }}>
              <Text style={s.link}>Create your own exercise</Text>
            </Pressable>
          </ScrollView>
        )}
      </SafeAreaView>
  );
  if (inline) return body;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      {body}
    </Modal>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Row({ e, onPress }: { e: Listed; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{e.name}</Text>
        <Text style={type.small}>
          {cap(e.muscle)} · {e.equipment}
          {e.custom ? ' · yours' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function CreateExercise({ initialName, onCreated }: { initialName: string; onCreated: (e: Exercise) => void }) {
  const [name, setName] = useState(initialName.trim());
  const [muscle, setMuscle] = useState<Muscle>('chest');
  const [equipment, setEquipment] = useState('barbell');
  const [kind, setKind] = useState<ExerciseKind>('weight');
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    try {
      const { exercise } = await post<{ exercise: Exercise }>('/api/exercises', { name, muscle, equipment, kind, restSeconds: kind === 'time' ? 60 : 120 });
      updateCache<{ exercises: (Exercise & { uses: number })[] }>('/api/exercises', (l) => l && { exercises: [{ ...exercise, uses: 0 }, ...l.exercises] });
      onCreated(exercise);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <ScrollView contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
      <Text style={type.small}>Name</Text>
      <TextInput value={name} onChangeText={setName} style={s.input} />
      <Text style={s.section}>Main muscle</Text>
      <View style={s.wrap}>{MUSCLES.map((m) => <Chip key={m} label={cap(m)} on={muscle === m} onPress={() => setMuscle(m)} />)}</View>
      <Text style={s.section}>Equipment</Text>
      <View style={s.wrap}>{EQUIPMENT.map((m) => <Chip key={m} label={cap(m)} on={equipment === m} onPress={() => setEquipment(m)} />)}</View>
      <Text style={s.section}>How you log it</Text>
      <View style={s.wrap}>{KINDS.map((k) => <Chip key={k.kind} label={k.label} on={kind === k.kind} onPress={() => setKind(k.kind)} />)}</View>
      {error && <Text style={s.error}>{error}</Text>}
      <Pressable disabled={!name.trim()} onPress={save} style={[s.button, !name.trim() && { opacity: 0.4 }]}>
        <Text style={s.buttonText}>Save and add</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space(4) },
  list: { padding: space(4), gap: space(2), paddingBottom: space(16), maxWidth: 640, width: '100%', alignSelf: 'center' },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  section: { ...type.small, fontWeight: '700', marginTop: space(3) },
  row: { backgroundColor: color.card, padding: space(3), borderRadius: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  error: { ...type.body, color: color.over },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center', marginTop: space(3) },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
});
