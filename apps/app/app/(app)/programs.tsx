import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Program } from '@forkbell/shared';
import { api, del, post } from '../../lib/api';
import { confirm } from '../../lib/confirm';
import { color, space, type } from '../../lib/theme';

type Starter = { key: string; name: string; daysPerWeek: string; description: string; routines: string[] };

/** Your programs, the days in the active one, and starter programs to copy. */
export default function Programs() {
  const [data, setData] = useState<{ programs: Program[]; starters: Starter[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [dayName, setDayName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api('/api/programs'));
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

  const active = data?.programs.find((p) => p.active);
  const others = data?.programs.filter((p) => !p.active) ?? [];

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Text style={type.title}>Programs</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={s.link}>Done</Text>
          </Pressable>
        </View>
        {error && <Text style={s.error}>{error}</Text>}
        {!data && !error && <ActivityIndicator color={color.iron} />}

        {active && (
          <View style={s.card}>
            <Text style={type.small}>Active program</Text>
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
            <View style={s.inline}>
              <TextInput value={dayName} onChangeText={setDayName} placeholder="New day, e.g. Arms" style={[s.input, { flex: 1 }]} />
              <Pressable
                disabled={!dayName.trim() || busy}
                onPress={() => run(async () => { await post(`/api/programs/${active.id}/routines`, { name: dayName }); setDayName(''); })}
                style={[s.small, (!dayName.trim() || busy) && { opacity: 0.4 }]}
              >
                <Text style={s.smallText}>Add day</Text>
              </Pressable>
            </View>
          </View>
        )}

        {others.length > 0 && <Text style={s.section}>Your other programs</Text>}
        {others.map((p) => (
          <View key={p.id} style={[s.item, { backgroundColor: color.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{p.name}</Text>
              <Text style={type.small}>{p.routines.length} days</Text>
            </View>
            <Pressable disabled={busy} onPress={() => run(() => post(`/api/programs/${p.id}/activate`, {}))} hitSlop={6}>
              <Text style={s.link}>Use</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={async () => {
                if (await confirm('Delete this program?', 'Past workouts stay in your history.', 'Delete')) run(() => del(`/api/programs/${p.id}`));
              }}
              hitSlop={6}
            >
              <Text style={[s.link, { color: color.over }]}>Delete</Text>
            </Pressable>
          </View>
        ))}

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
          <TextInput value={newName} onChangeText={setNewName} placeholder="Program name" style={[s.input, { flex: 1 }]} />
          <Pressable
            disabled={!newName.trim() || busy}
            onPress={() => run(async () => { await post('/api/programs', { name: newName }); setNewName(''); })}
            style={[s.small, (!newName.trim() || busy) && { opacity: 0.4 }]}
          >
            <Text style={s.smallText}>Create</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  card: { backgroundColor: color.card, borderRadius: 16, padding: space(4), gap: space(2) },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.chalk, borderRadius: 10, padding: space(3) },
  section: { ...type.small, fontWeight: '700', marginTop: space(3) },
  inline: { flexDirection: 'row', gap: space(2), alignItems: 'center' },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  small: { backgroundColor: color.iron, borderRadius: 10, paddingHorizontal: space(4), paddingVertical: space(3) },
  smallText: { color: color.chalk, fontWeight: '700', fontSize: 15 },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center', marginTop: space(1) },
  buttonText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
});
