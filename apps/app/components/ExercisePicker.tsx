import { KeyboardLift } from './KeyboardLift';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../lib/auth';
import { pictureSource } from '../lib/picture-cache';
import { IdentifyEquipment } from './IdentifyEquipment';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MUSCLES, picturePath, type Exercise, type ExerciseKind, type Muscle } from '@forkbell/shared';
import { post } from '../lib/api';
import { cachedGet, updateCache } from '../lib/sync';
import { Chip } from './AmountPicker';
import { ChipRow } from './ChipRow';
import { color, space, type } from '../lib/theme';

type Listed = Exercise & { uses: number };
const KINDS: { kind: ExerciseKind; label: string }[] = [
  { kind: 'weight', label: 'Weight × reps' },
  { kind: 'bodyweight', label: 'Bodyweight reps' },
  { kind: 'time', label: 'Time' },
  { kind: 'cardio', label: 'Cardio (time and distance)' },
];
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight', 'band', 'cardio', 'other'];

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
  const [full, setFull] = useState(false);
  const [limit, setLimit] = useState(120);
  const { me } = useAuth();
  // Equipment filter: any, what you have (Settings → Training setup), or one kind.
  const owned = me?.preferences.training?.equipment ?? [];
  const [gear, setGear] = useState<string | null>(owned.length ? 'mine' : null);
  const [identify, setIdentify] = useState(false);
  const gearOk = (e: Listed) =>
    !gear || (gear === 'mine' ? e.equipment === 'bodyweight' || e.equipment === 'cardio' || e.equipment === 'other' || owned.includes(e.equipment as never) : e.equipment === gear);

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
  // The everyday list stays short; the full library joins in when you search or ask for it.
  const libraryCount = (list ?? []).filter((e) => e.library).length;
  const shown = (list ?? []).filter(
    (e) =>
      (!muscle || e.muscle === muscle) &&
      gearOk(e) &&
      (full || words.length > 0 || !e.library || e.uses > 0) &&
      words.every((w) => `${e.name} ${e.muscle} ${e.equipment}`.toLowerCase().includes(w)),
  );
  const used = shown.filter((e) => e.uses > 0);
  const rest = shown.filter((e) => e.uses === 0).sort((a, b) => Number(Boolean(a.library)) - Number(Boolean(b.library)));
  const visibleRest = rest.slice(0, limit);

  const body = (
      <SafeAreaView style={s.screen}>
        <View style={s.head}>
          <Text style={type.title}>{creating ? 'New exercise' : title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(4) }}>
            {!creating && (
              <Pressable onPress={() => setIdentify(true)} hitSlop={10} accessibilityLabel="What's this machine? Take a photo" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="camera-outline" size={22} color={color.accent} />
                <Text style={[s.link, { fontSize: 14 }]}>What’s this?</Text>
              </Pressable>
            )}
            <Pressable onPress={creating ? () => setCreating(false) : onClose} hitSlop={12}>
              <Text style={s.link}>{creating ? 'Back' : 'Close'}</Text>
            </Pressable>
          </View>
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
            <ChipRow>
              <Chip label="All" on={!muscle} onPress={() => setMuscle(null)} />
              {MUSCLES.map((m) => (
                <Chip key={m} label={cap(m)} on={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />
              ))}
            </ChipRow>
            <ChipRow>
              <Chip label="Any equipment" on={!gear} onPress={() => setGear(null)} />
              {owned.length > 0 && <Chip label="What I have" on={gear === 'mine'} onPress={() => setGear(gear === 'mine' ? null : 'mine')} />}
              {EQUIPMENT.filter((x) => x !== 'other').map((x) => (
                <Chip key={x} label={cap(x)} on={gear === x} onPress={() => setGear(gear === x ? null : x)} />
              ))}
            </ChipRow>
            {libraryCount > 0 && !words.length && (
              <Pressable onPress={() => { setFull(!full); setLimit(120); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={s.link}>{full ? 'Just the everyday list' : `Show the full library (${libraryCount} more, with how-to pictures)`}</Text>
              </Pressable>
            )}
            {error && <Text style={s.error}>{error}</Text>}
            {!list && !error && <ActivityIndicator color={color.iron} />}
            {used.length > 0 && <Text style={s.section}>You’ve done these</Text>}
            {used.map((e) => <Row key={e.id} e={e} onPress={() => onPick(e)} />)}
            {rest.length > 0 && <Text style={s.section}>{used.length ? 'Everything else' : 'Exercises'}</Text>}
            {visibleRest.map((e) => <Row key={e.id} e={e} onPress={() => onPick(e)} />)}
            {rest.length > visibleRest.length && (
              <Pressable onPress={() => setLimit(limit + 120)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={s.link}>Show more ({rest.length - visibleRest.length} left)</Text>
              </Pressable>
            )}
            {list && shown.length === 0 && <Text style={type.body}>Nothing matches. Create it below.</Text>}
            <Pressable onPress={() => setCreating(true)} style={{ paddingVertical: space(3) }}>
              <Text style={s.link}>Create your own exercise</Text>
            </Pressable>
          </ScrollView>
        )}
        {identify && (
          <IdentifyEquipment
            onClose={() => setIdentify(false)}
            onPick={(e) => {
              setIdentify(false);
              onPick(e);
            }}
          />
        )}
      </SafeAreaView>
  );
  if (inline) return body;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <KeyboardLift>
      {body}
      </KeyboardLift>
    </Modal>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Row({ e, onPress }: { e: Listed; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, { flexDirection: 'row', alignItems: 'center', gap: space(3) }, pressed && { opacity: 0.7 }]}>
      <Thumb e={e} />
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{e.name}</Text>
        <Text style={type.small}>
          {cap(e.muscle)} · {e.equipment}
          {e.custom ? ' · yours' : ''}
          {e.howTo ? ' · how-to' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const GEAR_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  barbell: 'barbell-outline',
  dumbbell: 'barbell-outline',
  kettlebell: 'fitness-outline',
  machine: 'cog-outline',
  cable: 'git-pull-request-outline',
  band: 'infinite-outline',
  bodyweight: 'body-outline',
};

/** The exercise's first how-to picture, or an icon for its equipment. */
export function Thumb({ e, size = 52 }: { e: Pick<Exercise, 'howToRef' | 'pictures' | 'equipment' | 'name'>; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (e.howToRef && (e.pictures ?? 0) > 0 && !failed)
    return (
      <Image
        source={pictureSource(picturePath(e.howToRef, 0))}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: 10, backgroundColor: color.raised }}
        resizeMode="cover"
        accessibilityLabel={`${e.name} start position`}
      />
    );
  return (
    <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={GEAR_ICONS[e.equipment] ?? 'barbell-outline'} size={size * 0.45} color={color.ironSoft} />
    </View>
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
