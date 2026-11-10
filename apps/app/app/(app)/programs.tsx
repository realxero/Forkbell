import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../../components/Tap';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Program } from '@forkbell/shared';
import { cachedGet } from '../../lib/sync';
import { api, del, post } from '../../lib/api';
import { confirm } from '../../lib/confirm';
import { color, space, type, textSize, radius } from '../../lib/theme';
import { SkeletonCards } from '../../components/Skeleton';
import { buttons } from '../../lib/buttons';
import { useViewing } from '../../lib/profile';

type Starter = { key: string; name: string; daysPerWeek: string; description: string; routines: string[] };

/** Your programs, the days in the active one, and starter programs to copy. */
export default function Programs() {
  const [data, setData] = useState<{ programs: Program[]; starters: Starter[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  /** the new-day box, per program */
  const [dayNames, setDayNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await cachedGet('/api/programs'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Coaching someone (plan_write): every program opens for editing, and they choose which to run.
  const viewing = useViewing();
  const coaching = Boolean(viewing?.permissions?.includes('plan_write'));
  const active = data?.programs.find((p) => p.active);
  const cards = coaching ? (data?.programs ?? []) : active ? [active] : [];
  const others = coaching ? [] : (data?.programs.filter((p) => !p.active) ?? []);
  // Viewing someone's training without planning rights: look, don't touch.
  const readOnly = Boolean(viewing) && !coaching;

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Text style={type.title}>Programs</Text>
          <Pressable onPress={() => router.back()} style={s.tap} accessibilityRole="button">
            <Text style={s.link}>Done</Text>
          </Pressable>
        </View>
        {error && <Text style={s.error}>{error}</Text>}
        {!data && !error && <SkeletonCards count={3} />}

        {coaching && <Text style={type.body}>You’re planning {viewing!.name}’s training. They choose when to start a program, and their workouts stay theirs.</Text>}
        {cards.map((active) => (
          <View key={active.id} style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <Text style={[type.small, { flex: 1 }]}>{active.active ? 'Active program' : 'Not started yet'}</Text>
              {active.fromCoach && <Text style={s.badge}>{coaching ? 'You made this' : 'From your coach'}</Text>}
            </View>
            <Text style={type.title}>{active.name}</Text>
            <Text style={type.small}>Days run in this order. After you finish one, the next comes up, so a missed day just shifts the plan.</Text>
            {active.routines.map((r) => (
              <Pressable key={r.id} onPress={() => router.push({ pathname: '/routine', params: { id: r.id, programId: active.id } })} style={s.item}>
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>
                    {r.name}
                    {r.id === active.nextRoutineId ? '  · next' : ''}
                  </Text>
                  <Text style={type.small} numberOfLines={1}>{r.exercises.map((e) => e.exercise.name).join(' · ') || 'No exercises yet'}</Text>
                </View>
                <Text style={s.link}>Edit</Text>
              </Pressable>
            ))}
            {!readOnly && <View style={s.inline}>
              <TextInput value={dayNames[active.id] ?? ''} onChangeText={(t) => setDayNames({ ...dayNames, [active.id]: t })} placeholder="New day, e.g. Arms" placeholderTextColor={color.placeholder} accessibilityLabel={`New day for ${active.name}`} style={[s.input, { flex: 1 }]} />
              <Pressable
                disabled={!dayNames[active.id]?.trim() || busy}
                onPress={() => run(async () => { await post(`/api/programs/${active.id}/routines`, { name: dayNames[active.id] }); setDayNames({ ...dayNames, [active.id]: '' }); })}
                style={[s.small, (!dayNames[active.id]?.trim() || busy) && { opacity: 0.4 }]}
              >
                <Text style={s.smallText}>Add day</Text>
              </Pressable>
            </View>}
            {coaching && active.fromCoach && (
              <Pressable
                disabled={busy}
                onPress={async () => {
                  if (await confirm('Delete this program?', 'It’s one you made; their own programs stay.', 'Delete')) run(() => del(`/api/programs/${active.id}`));
                }}
                style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={[s.link, { color: color.over }]}>Delete this program</Text>
              </Pressable>
            )}
          </View>
        ))}

        {others.length > 0 && <Text style={s.section}>Your other programs</Text>}
        {others.map((p) => (
          <View key={p.id} style={[s.item, { backgroundColor: color.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{p.name}</Text>
              <Text style={type.small}>{p.routines.length} days{p.fromCoach ? ' · from your coach' : ''}</Text>
            </View>
            {!readOnly && <>
            <Pressable disabled={busy} onPress={() => run(() => post(`/api/programs/${p.id}/activate`, {}))} style={s.tap} accessibilityRole="button" accessibilityLabel={`Use ${p.name}`}>
              <Text style={s.link}>Use</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={async () => {
                if (await confirm('Delete this program?', 'Past workouts stay in your history.', 'Delete')) run(() => del(`/api/programs/${p.id}`));
              }}
              style={s.tap}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${p.name}`}
            >
              <Text style={[s.link, { color: color.over }]}>Delete</Text>
            </Pressable>
            </>}
          </View>
        ))}

        {!readOnly && <>
        <Text style={s.section}>Starter programs</Text>
        <Text style={type.small}>Copied into your programs, so you can change anything afterwards.</Text>
        {data?.starters.map((st) => (
          <View key={st.key} style={s.card}>
            <Text style={type.title}>{st.name}</Text>
            <Text style={type.small}>{st.daysPerWeek} · {st.routines.join(', ')}</Text>
            <Text style={type.body}>{st.description}</Text>
            <Pressable disabled={busy} onPress={() => run(() => post('/api/programs/starter', { key: st.key }))} style={[s.button, busy && { opacity: 0.5 }]}>
              <Text style={s.buttonText}>Use this program</Text>
            </Pressable>
          </View>
        ))}

        <Text style={s.section}>Build your own</Text>
        <View style={s.inline}>
          <TextInput value={newName} onChangeText={setNewName} placeholder="Program name" placeholderTextColor={color.placeholder} accessibilityLabel="New program name" style={[s.input, { flex: 1 }]} />
          <Pressable
            disabled={!newName.trim() || busy}
            onPress={() => run(async () => { await post('/api/programs', { name: newName }); setNewName(''); })}
            style={[s.small, (!newName.trim() || busy) && { opacity: 0.4 }]}
          >
            <Text style={s.smallText}>Create</Text>
          </Pressable>
        </View>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: textSize.body },
  error: { ...type.body, color: color.over },
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(2) },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.chalk, borderRadius: radius.input, padding: space(3) },
  section: { ...type.small, fontWeight: '700', marginTop: space(3) },
  inline: { flexDirection: 'row', gap: space(2), alignItems: 'center' },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: radius.input, padding: space(3) },
  small: { ...buttons.small },
  smallText: { ...buttons.smallText },
  button: { ...buttons.filled, marginTop: space(1) },
  buttonText: { ...buttons.filledText },
  tap: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  badge: { ...type.label, color: color.iron, backgroundColor: color.infoBg, paddingHorizontal: space(2), paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
});
