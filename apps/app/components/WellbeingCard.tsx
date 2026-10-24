import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { todayLocal } from '@forkbell/shared';
import { cachedGet, send } from '../lib/sync';
import { useViewing } from '../lib/profile';
import { Chip } from './AmountPicker';
import { color, space, type } from '../lib/theme';

export type CheckIn = { date: string; sleepHours: number | null; sleepQuality: number | null; mood: number | null; energy: number | null; note: string | null };
export type Med = { id: string; name: string; dose: string | null; timesPerDay: number; notes: string | null; active: boolean; reminderTimes?: (string | null)[]; today: ('taken' | 'skipped' | null)[]; lastWeek: { taken: number; planned: number } };
export type Wellbeing = { today: string; checkIns: CheckIn[]; medications: Med[] };

const FACES = ['😞', '🙁', '😐', '🙂', '😄'];
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

/** Today's sleep, mood and energy, a week's averages, and today's medications. */
export function WellbeingCard({ healthSleepMin = null }: { healthSleepMin?: number | null }) {
  const viewing = useViewing();
  const [w, setW] = useState<Wellbeing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CheckIn>({ date: todayLocal(), sleepHours: null, sleepQuality: null, mood: null, energy: null, note: null });
  const [sleep, setSleep] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await cachedGet<Wellbeing>(`/api/wellbeing?today=${todayLocal()}`);
      setW(data);
      const t = data.checkIns.find((c) => c.date === data.today);
      if (t) {
        setForm(t);
        setSleep(t.sleepHours === null ? '' : String(t.sleepHours));
      }
      // Sleep from Apple Health / Health Connect fills in the hours if you haven't.
      if ((!t || t.sleepHours === null) && healthSleepMin) setSleep(String(Math.round((healthSleepMin / 60) * 10) / 10));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [healthSleepMin]);
  useEffect(() => {
    load();
  }, [load, viewing, healthSleepMin]);

  if (error) return viewing ? null : <Text style={type.small}>{error}</Text>;
  if (!w) return null;
  const week = w.checkIns.filter((c) => c.date > new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const scale = (key: 'sleepQuality' | 'mood' | 'energy', label: string) => (
    <View style={{ gap: space(1) }}>
      <Text style={type.small}>{label}</Text>
      <View style={s.chips}>
        {FACES.map((f, i) => (
          <Chip key={i} label={f} on={form[key] === i + 1} onPress={() => !viewing && setForm({ ...form, [key]: form[key] === i + 1 ? null : i + 1 })} />
        ))}
      </View>
    </View>
  );
  const save = async () => {
    const v = sleep.trim() ? Number(sleep.replace(',', '.')) : null;
    await send('PUT', '/api/wellbeing/check-ins', { ...form, sleepHours: v !== null && v >= 0 && v <= 24 ? v : null }, { label: 'Check-in', coalesceKey: `checkin:${form.date}` });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  const dose = async (m: Med, slot: number) => {
    const next = m.today[slot] === 'taken' ? null : 'taken';
    setW({ ...w, medications: w.medications.map((x) => (x.id === m.id ? { ...x, today: x.today.map((t, i) => (i === slot ? next : t)) } : x)) });
    await send('PUT', '/api/wellbeing/medication-logs', { medicationId: m.id, date: w.today, slot, status: next }, { label: `${m.name} dose`, coalesceKey: `dose:${m.id}:${w.today}:${slot}` });
    // A dose ticked off doesn't need its reminder any more (and an unticked one gets it back).
    void import('../lib/reminders').then((r) => r.refreshReminders()).catch(() => {});
  };
  const active = w.medications.filter((m) => m.active);

  return (
    <View style={s.card}>
      <Text style={type.title}>How you’re doing</Text>
      {!viewing && (
        <>
          <View style={s.row}>
            <Text style={[type.body, { flex: 1 }]}>Sleep last night</Text>
            <TextInput value={sleep} onChangeText={setSleep} keyboardType="decimal-pad" placeholder="hours" style={s.input} accessibilityLabel="Hours of sleep" />
          </View>
          {healthSleepMin !== null && <Text style={[type.small, { marginTop: -space(2) }]}>From your phone’s health data. Change it if it’s off.</Text>}
          {scale('sleepQuality', 'Sleep quality')}
          {scale('mood', 'Mood')}
          {scale('energy', 'Energy')}
          <Pressable onPress={save} style={s.small}><Text style={s.smallText}>{saved ? 'Saved' : 'Save check-in'}</Text></Pressable>
        </>
      )}
      {week.length > 0 && (
        <Text style={type.small}>
          Last 7 days: sleep {avg(week.map((c) => c.sleepHours)) ?? '–'} h · mood {avg(week.map((c) => c.mood)) ?? '–'}/5 · energy {avg(week.map((c) => c.energy)) ?? '–'}/5 ({week.length} check-ins)
        </Text>
      )}

      <View style={[s.row, { marginTop: space(2) }]}>
        <Text style={[type.title, { fontSize: 17, flex: 1 }]}>Medications</Text>
        {!viewing && <Pressable onPress={() => router.push('/medications')}><Text style={s.link}>{active.length ? 'Manage' : 'Add'}</Text></Pressable>}
      </View>
      {active.length === 0 && <Text style={type.small}>Nothing added. Tick doses off each day to keep track.</Text>}
      {active.map((m) => (
        <View key={m.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={type.body}>{m.name}{m.dose ? ` · ${m.dose}` : ''}</Text>
            <Text style={type.small}>Last 7 days: {m.lastWeek.taken} of {m.lastWeek.planned}</Text>
          </View>
          {m.today.map((t, slot) => (
            <Pressable key={slot} disabled={Boolean(viewing)} onPress={() => dose(m, slot)} hitSlop={6} style={[s.dose, t === 'taken' && s.doseOn]} accessibilityRole="checkbox" accessibilityState={{ checked: t === 'taken' }} accessibilityLabel={`${m.name} dose ${slot + 1} taken`}>
              <Text style={{ color: t === 'taken' ? color.card : color.ironSoft, fontWeight: '800' }}>{t === 'taken' ? '✓' : slot + 1}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: 16, padding: space(4), gap: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  input: { ...type.body, width: 80, textAlign: 'center', backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(2) },
  small: { backgroundColor: color.iron, borderRadius: 10, paddingHorizontal: space(4), paddingVertical: space(3), alignSelf: 'flex-start' },
  smallText: { color: color.chalk, fontWeight: '700', fontSize: 15 },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  dose: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  doseOn: { backgroundColor: color.fat, borderColor: color.fat },
});
