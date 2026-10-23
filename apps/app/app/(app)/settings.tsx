import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Goals } from '@forkbell/shared';
import { useAuth } from '../../lib/auth';
import { put } from '../../lib/api';
import { color, space, type } from '../../lib/theme';
import { Chip } from '../../components/AmountPicker';
import { Platform, Switch } from 'react-native';
import { connectHealth, getHealthSettings, healthName, healthSupported, setHealthSettings, syncHealth, type HealthSettings } from '../../lib/health-sync';

export default function Settings() {
  const { me, signOut, refreshMe } = useAuth();
  const g = me?.goals;
  const str = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const [form, setForm] = useState({ kcal: str(g?.kcal), protein: str(g?.protein), carbs: str(g?.carbs), fat: str(g?.fat) });
  const [status, setStatus] = useState<string | null>(null);

  const toNum = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
  const save = async () => {
    const goals: Goals = { kcal: toNum(form.kcal), protein: toNum(form.protein), carbs: toNum(form.carbs), fat: toNum(form.fat) };
    if (goals.kcal !== null) goals.kcal = Math.round(goals.kcal);
    try {
      await put('/api/me/goals', goals);
      await refreshMe();
      setStatus('Goals saved.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const field = (k: keyof typeof form, label: string) => (
    <View style={{ gap: space(1) }}>
      <Text style={type.small}>{label}</Text>
      <TextInput value={form[k]} onChangeText={(v) => setForm({ ...form, [k]: v })} keyboardType="decimal-pad" placeholder="No goal" style={s.input} />
    </View>
  );

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.head}>
          <Text style={type.title}>Goals and settings</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={s.link}>Done</Text>
          </Pressable>
        </View>
        <Text style={type.small}>Daily goals. Leave one empty to just track it.</Text>
        {field('kcal', 'Calories')}
        {field('protein', 'Protein (g)')}
        {field('carbs', 'Carbs (g)')}
        {field('fat', 'Fat (g)')}
        <Pressable onPress={save} style={s.button}>
          <Text style={s.buttonText}>Save goals</Text>
        </Pressable>
        {status && <Text style={type.body}>{status}</Text>}

        <Text style={[type.small, { marginTop: space(6) }]}>Weights in workouts</Text>
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          {(['lb', 'kg'] as const).map((u) => (
            <Chip
              key={u}
              label={u === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}
              on={me?.weightUnit === u}
              onPress={async () => {
                try {
                  await put('/api/me/settings', { weightUnit: u });
                  await refreshMe();
                } catch (e) {
                  setStatus(e instanceof Error ? e.message : String(e));
                }
              }}
            />
          ))}
        </View>

        <Pressable onPress={() => router.push('/preferences')} style={{ marginTop: space(6) }}>
          <Text style={s.link}>Food preferences and suggestions ›</Text>
        </Pressable>

        <HealthSection />

        <View style={s.account}>
          <Text style={type.body}>Signed in as {me?.name ?? me?.email ?? 'you'}</Text>
          <Pressable onPress={signOut}>
            <Text style={[s.link, { color: color.over }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HealthSection() {
  const [h, setH] = useState<HealthSettings>(getHealthSettings());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!healthSupported) {
    return (
      <View style={{ gap: space(1), marginTop: space(6) }}>
        <Text style={type.small}>Apple Health and Health Connect</Text>
        <Text style={type.body}>
          {Platform.OS === 'web' ? 'These connect from the Forkbell app on your phone. Steps, activity and weight synced there show up here too.' : 'Not available on this device.'}
        </Text>
      </View>
    );
  }
  const toggle = (key: 'readActivity' | 'writeNutrition' | 'writeWorkouts', label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) }}>
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <Switch
        value={h[key]}
        onValueChange={(v) => {
          setHealthSettings({ [key]: v });
          setH(getHealthSettings());
        }}
      />
    </View>
  );
  const run = async (fn: () => Promise<string | null>, ok: string) => {
    setBusy(true);
    setMsg(null);
    const err = await fn();
    setH(getHealthSettings());
    setMsg(err ?? ok);
    setBusy(false);
  };
  return (
    <View style={{ gap: space(3), marginTop: space(6) }}>
      <Text style={type.small}>{healthName}</Text>
      {!h.connected ? (
        <>
          <Text style={type.body}>
            Bring in steps, active calories, resting heart rate and weigh-ins, and send your daily calories, macros and workouts to {healthName}. Weights you type into Forkbell always win over imported ones.
          </Text>
          <Pressable disabled={busy} onPress={() => run(connectHealth, `Connected to ${healthName}.`)} style={[s.button, busy && { opacity: 0.5 }]}>
            <Text style={s.buttonText}>Connect {healthName}</Text>
          </Pressable>
        </>
      ) : (
        <>
          {toggle('readActivity', 'Bring in steps, activity and weight')}
          {toggle('writeNutrition', `Send daily calories and macros to ${healthName}`)}
          {toggle('writeWorkouts', `Send workouts to ${healthName}`)}
          <Text style={type.small}>
            {h.lastSync ? `Last synced ${new Date(h.lastSync).toLocaleString()}.` : 'Not synced yet.'} Syncs when you open the app.
            {h.lastError ? ` Last problem: ${h.lastError}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: space(5) }}>
            <Pressable disabled={busy} onPress={() => run(() => syncHealth(true), 'Synced.')}>
              <Text style={s.link}>{busy ? 'Syncing…' : 'Sync now'}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setHealthSettings({ connected: false });
                setH(getHealthSettings());
                setMsg(`Disconnected. To remove Forkbell’s access completely, use ${healthName}’s own settings.`);
              }}
            >
              <Text style={[s.link, { color: color.over }]}>Disconnect</Text>
            </Pressable>
          </View>
        </>
      )}
      {msg && <Text style={type.body}>{msg}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(2) },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center' },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  account: { marginTop: space(8), paddingTop: space(4), borderTopWidth: 1, borderTopColor: color.line, gap: space(3) },
});
