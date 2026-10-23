import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { todayLocal } from '@forkbell/shared';
import { api, del, post, put } from '../../lib/api';
import { confirm } from '../../lib/confirm';
import type { Med, Wellbeing } from '../../components/WellbeingCard';
import { color, space, type } from '../../lib/theme';

/** Add, pause and remove medications and supplements. */
export default function Medications() {
  const [meds, setMeds] = useState<Med[]>([]);
  const [form, setForm] = useState({ name: '', dose: '', times: '1', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setMeds((await api<Wellbeing>(`/api/wellbeing?today=${todayLocal()}`)).medications);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const body = (m: Med, patch: Partial<Med>) => ({ name: m.name, dose: m.dose, timesPerDay: m.timesPerDay, notes: m.notes, active: m.active, ...patch });

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
        <Text style={[type.hero, { fontSize: 30 }]}>Medications</Text>
        <Text style={type.small}>A simple checklist for medications and supplements. Forkbell doesn’t check doses or interactions; follow your prescription and ask your pharmacist or doctor about anything you’re unsure of.</Text>
        {error && <Text style={s.error}>{error}</Text>}
        {meds.map((m) => (
          <View key={m.id} style={s.card}>
            <View style={s.row}>
              <Text style={[type.body, { flex: 1, fontWeight: '700' }]}>{m.name}{m.dose ? ` · ${m.dose}` : ''}</Text>
              <Switch value={m.active} onValueChange={(v) => run(() => put(`/api/wellbeing/medications/${m.id}`, body(m, { active: v })))} />
            </View>
            <Text style={type.small}>{m.timesPerDay}× a day{m.active ? '' : ' · paused'}{m.notes ? ` · ${m.notes}` : ''}</Text>
            <Pressable onPress={async () => (await confirm(`Remove ${m.name}?`, 'Its history is removed too. To keep it, pause it instead.', 'Remove')) && run(() => del(`/api/wellbeing/medications/${m.id}`))}>
              <Text style={[s.link, { color: color.over }]}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <View style={s.card}>
          <Text style={type.title}>Add one</Text>
          <TextInput value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Name" style={s.input} />
          <TextInput value={form.dose} onChangeText={(v) => setForm({ ...form, dose: v })} placeholder="Dose (optional), e.g. 500 mg" style={s.input} />
          <View style={s.row}>
            <Text style={[type.body, { flex: 1 }]}>Times a day</Text>
            <TextInput value={form.times} onChangeText={(v) => setForm({ ...form, times: v })} keyboardType="number-pad" style={[s.input, { width: 60, textAlign: 'center' }]} />
          </View>
          <TextInput value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} placeholder="Notes (optional), e.g. with food" style={s.input} />
          <Pressable
            disabled={!form.name.trim()}
            onPress={() => run(async () => {
              await post('/api/wellbeing/medications', { name: form.name, dose: form.dose || null, timesPerDay: Math.min(6, Math.max(1, Number(form.times) || 1)), notes: form.notes || null });
              setForm({ name: '', dose: '', times: '1', notes: '' });
            })}
            style={[s.button, !form.name.trim() && { opacity: 0.4 }]}
          >
            <Text style={s.buttonText}>Add</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  card: { backgroundColor: color.card, borderRadius: 14, padding: space(4), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  buttonText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
});
