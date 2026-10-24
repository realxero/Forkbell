import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatClock, parseClock, todayLocal } from '@forkbell/shared';
import { api, del, post, put } from '../../lib/api';
import { confirm } from '../../lib/confirm';
import { askForNotifications, refreshReminders, reminderSettings, remindersSupported } from '../../lib/reminders';
import type { Med, Wellbeing } from '../../components/WellbeingCard';
import { color, space, type } from '../../lib/theme';

const MAX_DOSES = 6;
const doseCount = (v: string) => Math.min(MAX_DOSES, Math.max(1, Number(v) || 1));

/** Add, pause and remove medications and supplements, with a reminder time for each dose. */
export default function Medications() {
  const [meds, setMeds] = useState<Med[]>([]);
  const [form, setForm] = useState({ name: '', dose: '', times: '1', notes: '' });
  const [formTimes, setFormTimes] = useState<(string | null)[]>([null]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
      void refreshReminders().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const timesOf = (m: Med) => Array.from({ length: m.timesPerDay }, (_, i) => m.reminderTimes?.[i] ?? null);
  const body = (m: Med, patch: Partial<Med>) => {
    const next = { ...m, ...patch };
    return { name: next.name, dose: next.dose, timesPerDay: next.timesPerDay, notes: next.notes, active: next.active, reminderTimes: timesOf(next).map((t) => t ?? '') };
  };
  /** The first reminder time asks for notifications, once. */
  const checkNotifications = async (times: (string | null)[]) => {
    if (!remindersSupported || !times.some(Boolean)) return;
    const off = await askForNotifications();
    if (off) setNotice(off);
    else if (!reminderSettings().meds) setNotice('Medication reminders are off on this phone. Turn them on in Settings → Reminders and offline pictures.');
    else setNotice(null);
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
        <Text style={[type.hero, { fontSize: 30 }]}>Medications</Text>
        <Text style={type.small}>A simple checklist for medications and supplements. Forkbell doesn’t check doses or interactions; follow your prescription and ask your pharmacist or doctor about anything you’re unsure of.</Text>
        <Text style={type.small}>
          {remindersSupported
            ? 'Give a dose a time and this phone reminds you then, with Taken and Skip buttons. A dose you’ve already ticked off doesn’t remind you.'
            : 'Reminder times you set here ring on your phone, in the Forkbell app.'}
        </Text>
        {error && <Text style={s.error}>{error}</Text>}
        {notice && <Text style={[type.small, { color: color.over }]}>{notice}</Text>}
        {meds.map((m) => (
          <View key={m.id} style={s.card}>
            <View style={s.row}>
              <Text style={[type.body, { flex: 1, fontWeight: '700' }]}>{m.name}{m.dose ? ` · ${m.dose}` : ''}</Text>
              <Switch value={m.active} onValueChange={(v) => run(() => put(`/api/wellbeing/medications/${m.id}`, body(m, { active: v })))} accessibilityLabel={`${m.name} active`} />
            </View>
            <Text style={type.small}>{m.timesPerDay}× a day{m.active ? '' : ' · paused, no reminders'}{m.notes ? ` · ${m.notes}` : ''}</Text>
            <DoseTimes
              times={timesOf(m)}
              onChange={(times) =>
                run(async () => {
                  await put(`/api/wellbeing/medications/${m.id}`, body(m, { reminderTimes: times }));
                  await checkNotifications(times);
                })
              }
            />
            <Pressable onPress={async () => (await confirm(`Remove ${m.name}?`, 'Its history is removed too. To keep it, pause it instead.', 'Remove')) && run(() => del(`/api/wellbeing/medications/${m.id}`))}>
              <Text style={[s.link, { color: color.over }]}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <View style={s.card}>
          <Text style={type.title}>Add one</Text>
          <TextInput value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Name" placeholderTextColor={color.placeholder} style={s.input} />
          <TextInput value={form.dose} onChangeText={(v) => setForm({ ...form, dose: v })} placeholder="Dose (optional), e.g. 500 mg" placeholderTextColor={color.placeholder} style={s.input} />
          <View style={s.row}>
            <Text style={[type.body, { flex: 1 }]}>Times a day</Text>
            <TextInput
              value={form.times}
              onChangeText={(v) => {
                setForm({ ...form, times: v });
                const n = doseCount(v);
                setFormTimes((t) => Array.from({ length: n }, (_, i) => t[i] ?? null));
              }}
              keyboardType="number-pad"
              style={[s.input, { width: 60, textAlign: 'center' }]}
              accessibilityLabel="Times a day"
            />
          </View>
          <DoseTimes times={formTimes} onChange={setFormTimes} />
          <TextInput value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} placeholder="Notes (optional), e.g. with food" placeholderTextColor={color.placeholder} style={s.input} />
          <Pressable
            disabled={!form.name.trim()}
            onPress={() =>
              run(async () => {
                const n = doseCount(form.times);
                const times = Array.from({ length: n }, (_, i) => formTimes[i] ?? null);
                await post('/api/wellbeing/medications', { name: form.name, dose: form.dose || null, timesPerDay: n, notes: form.notes || null, reminderTimes: times.map((t) => t ?? '') });
                await checkNotifications(times);
                setForm({ name: '', dose: '', times: '1', notes: '' });
                setFormTimes([null]);
              })
            }
            style={[s.button, !form.name.trim() && { opacity: 0.4 }]}
          >
            <Text style={s.buttonText}>Add</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** One time box per dose. Type a time the way you'd say it: 8, 8:30, 8pm, 20:30. Empty means no reminder. */
function DoseTimes({ times, onChange }: { times: (string | null)[]; onChange: (times: (string | null)[]) => void }) {
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [bad, setBad] = useState<number | null>(null);
  const commit = (i: number) => {
    const text = draft[i];
    if (text === undefined) return;
    const value = text.trim() ? parseClock(text) : null;
    if (text.trim() && !value) return setBad(i);
    setBad(null);
    setDraft((d) => {
      const { [i]: _, ...rest } = d;
      return rest;
    });
    if (value !== (times[i] ?? null)) onChange(times.map((t, j) => (j === i ? value : t)));
  };
  return (
    <View style={{ gap: space(1) }}>
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        <Text style={[type.small, { marginRight: space(1) }]}>Remind me at</Text>
        {times.map((t, i) => (
          <TextInput
            key={i}
            value={draft[i] ?? (t ? formatClock(t) : '')}
            onChangeText={(v) => setDraft((d) => ({ ...d, [i]: v }))}
            onEndEditing={() => commit(i)}
            onBlur={() => commit(i)}
            onSubmitEditing={() => commit(i)}
            placeholder={times.length > 1 ? `Dose ${i + 1}` : 'No reminder'}
            placeholderTextColor={color.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            style={[s.input, s.time, bad === i && { borderColor: color.over }]}
            accessibilityLabel={times.length > 1 ? `Reminder time for dose ${i + 1}` : 'Reminder time'}
            accessibilityHint="A time like 8 AM or 20:30. Leave it empty for no reminder."
          />
        ))}
      </View>
      {bad !== null && <Text style={[type.small, { color: color.over }]}>Use a time like 8, 8:30 PM or 20:30.</Text>}
    </View>
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
  time: { minWidth: 104, textAlign: 'center', paddingVertical: space(2) },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  buttonText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
});
