import { useEffect, useState } from 'react';
import { presetGoals, todayLocal } from '@forkbell/shared';
import { cachedGet, readCache, writeCache } from '../../../lib/sync';
import { ACCENTS, nativeChoice, nativeThemeSupported, setNativeTheme, setWebAccent, setWebScheme, type AccentName, type SchemeChoice, savedNativeAccent } from '../../../lib/theme';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Goals } from '@forkbell/shared';
import { useAuth } from '../../../lib/auth';
import { put } from '../../../lib/api';
import { color, space, type } from '../../../lib/theme';
import { Chip } from '../../../components/AmountPicker';
import { AiSettings } from '../../../components/AiSettings';
import { Platform, Switch } from 'react-native';
import { hapticsOn, hapticsSupported, setHapticsOn } from '../../../lib/haptics';
import { reminderSettings, remindersSupported, setReminderSettings, type ReminderSettings } from '../../../lib/reminders';
import { connectHealth, getHealthSettings, healthName, healthSupported, setHealthSettings, syncHealth, type HealthSettings } from '../../../lib/health-sync';

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

        </View>
        <Text style={type.small}>Daily goals. Leave one empty to just track it.</Text>
        <Presets onPick={(g) => setForm({ kcal: String(g.kcal), protein: String(g.protein), carbs: String(g.carbs), fat: String(g.fat) })} />
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

        <Appearance />

        {remindersSupported && <Reminders />}

        <WeekdayGoals />

        <Pressable onPress={() => router.push('/preferences')} style={{ marginTop: space(6) }}>
          <Text style={s.link}>Food preferences and suggestions ›</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/sharing')} style={{ marginTop: space(3) }}>
          <Text style={s.link}>Sharing with family ›</Text>
        </Pressable>

        <AiSettings />

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

/** A light tap for ticked sets, logged food, rest over and celebrations. */
function HapticsSwitch() {
  const [on, setOn] = useState(hapticsOn);
  return (
    <View style={s.switchRow}>
      <Text style={[type.body, { flex: 1 }]}>Haptics</Text>
      <Switch value={on} onValueChange={(v) => { setOn(v); setHapticsOn(v); }} accessibilityLabel="Haptics" />
    </View>
  );
}

/** Smart reminders, set per device: they're notifications on this phone. */
function Reminders() {
  const [r, setR] = useState<ReminderSettings>(reminderSettings);
  const [problem, setProblem] = useState<string | null>(null);
  const change = async (next: ReminderSettings) => {
    setR(next);
    const err = await setReminderSettings(next);
    setProblem(err);
    if (err) setR(reminderSettings());
  };
  return (
    <View style={{ gap: space(2), marginTop: space(6) }}>
      <Text style={type.small}>Reminders on this phone</Text>
      <View style={s.switchRow}>
        <Text style={[type.body, { flex: 1 }]}>Meals I usually log</Text>
        <Switch value={r.meals} onValueChange={(v) => change({ ...r, meals: v })} accessibilityLabel="Meal reminders" />
      </View>
      <Text style={type.small}>
        Only for meals you log most days, about an hour after your usual time, and only if that meal is still empty. They start once Forkbell has a week or two of your logging to learn from.
      </Text>
      <View style={s.switchRow}>
        <Text style={[type.body, { flex: 1 }]}>Finish the day</Text>
        <Switch value={r.finish} onValueChange={(v) => change({ ...r, finish: v })} accessibilityLabel="Finish-the-day reminder" />
      </View>
      <Text style={type.small}>An evening nudge to mark the day finished, around when you usually do. Skipped on days with nothing logged.</Text>
      {problem && <Text style={[type.small, { color: color.over }]}>{problem}</Text>}
    </View>
  );
}

/** Light, dark, or follow the phone, and an accent. Instant on the web; iPhone reloads its screens. */
function Appearance() {
  const [choice, setChoice] = useState<SchemeChoice>(Platform.OS === 'web' ? (readCache<SchemeChoice>('device:theme') ?? 'system') : nativeChoice);
  const [accent, setAccent] = useState<AccentName>((Platform.OS === 'web' ? readCache<AccentName>('device:accent') : savedNativeAccent()) ?? 'blue');
  const pick = (c: SchemeChoice) => {
    setChoice(c);
    writeCache('device:theme', c);
    setWebScheme(c);
    void setNativeTheme({ scheme: c });
  };
  return (
    <View style={{ gap: space(2), marginTop: space(6) }}>
      <Text style={type.small}>Appearance</Text>
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        {(['system', 'light', 'dark'] as const).map((c) => (
          <Chip key={c} label={c === 'system' ? 'Match device' : c === 'light' ? 'Light' : 'Dark'} on={choice === c} onPress={() => pick(c)} />
        ))}
      </View>
      {hapticsSupported && <HapticsSwitch />}
      {Platform.OS !== 'web' && (
        <Text style={type.small}>{nativeThemeSupported ? 'Forkbell refreshes for a second to change colours. Nothing is lost.' : 'On this phone Forkbell follows the system’s light and dark setting.'}</Text>
      )}
      <Text style={[type.small, { marginTop: space(3) }]}>Accent colour</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        {(Object.keys(ACCENTS) as AccentName[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => {
              setAccent(k);
              writeCache('device:accent', k);
              setWebAccent(k);
              void setNativeTheme({ accent: k });
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: accent === k }}
            accessibilityLabel={ACCENTS[k].label}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ACCENTS[k].light, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: accent === k ? color.iron : 'transparent' }}
          >
            {accent === k && <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text>}
          </Pressable>
        ))}
      </View>
      {Platform.OS !== 'web' && !nativeThemeSupported && <Text style={type.small}>On this phone the accent colour shows in the web version of Forkbell.</Text>}
    </View>
  );
}

/** Starting goals from your measured burn and weight. They fill the boxes; nothing is saved until you tap Save. */
function Presets({ onPick }: { onPick: (g: { kcal: number; protein: number; carbs: number; fat: number }) => void }) {
  const [info, setInfo] = useState<{ burn: number; kg: number } | null | undefined>(undefined);
  useEffect(() => {
    cachedGet<{ energy: { kcal: number | null }; weighIns: { trendKg: number }[] }>(`/api/progress?today=${todayLocal()}`).then(
      (p) => setInfo(p.energy.kcal && p.weighIns.length ? { burn: p.energy.kcal, kg: p.weighIns.at(-1)!.trendKg } : null),
      () => setInfo(null),
    );
  }, []);
  if (info === undefined) return null;
  if (info === null) return <Text style={type.small}>Presets appear once Forkbell knows your daily burn (about two weeks of logging and weigh-ins).</Text>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
      {(['lose', 'maintain', 'gain'] as const).map((k) => (
        <Chip key={k} label={k === 'lose' ? 'Lose steadily' : k === 'maintain' ? 'Maintain' : 'Gain slowly'} on={false} onPress={() => onPick(presetGoals(k, info.burn, info.kg))} />
      ))}
    </View>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Different calories (and protein) on particular days, e.g. more on training days or weekends. */
function WeekdayGoals() {
  const { me, refreshMe } = useAuth();
  const [day, setDay] = useState<number | null>(null);
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!me) return null;
  const wg = me.weekdayGoals ?? {};
  const pick = (d: number) => {
    setDay(d);
    const g = wg[String(d) as '0'];
    setKcal(g?.kcal ? String(g.kcal) : '');
    setProtein(g?.protein ? String(g.protein) : '');
  };
  const save = async (clear = false) => {
    if (day === null) return;
    const g = clear || !kcal.trim() ? null : { kcal: Math.round(Number(kcal)), protein: protein.trim() ? Number(protein) : me.goals.protein, carbs: null, fat: null };
    try {
      await put('/api/me/weekday-goals', { ...wg, [String(day)]: g });
      await refreshMe();
      setMsg(g ? `${WEEKDAYS[day]} goal saved.` : `${WEEKDAYS[day]} uses your everyday goals.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <View style={{ gap: space(2), marginTop: space(6) }}>
      <Text style={type.small}>Different goals on some days (optional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        {WEEKDAYS.map((w, i) => (
          <Chip key={w} label={wg[String(i) as '0'] ? `${w} · ${wg[String(i) as '0']!.kcal}` : w} on={day === i} onPress={() => pick(i)} />
        ))}
      </View>
      {day !== null && (
        <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
          <TextInput value={kcal} onChangeText={setKcal} keyboardType="number-pad" placeholder="kcal" style={[s.input, { flex: 1 }]} />
          <TextInput value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholder="protein g" style={[s.input, { flex: 1 }]} />
          <Pressable onPress={() => save()}><Text style={s.link}>Save</Text></Pressable>
          <Pressable onPress={() => save(true)}><Text style={[s.link, { color: color.ironSoft }]}>Clear</Text></Pressable>
        </View>
      )}
      {msg && <Text style={type.small}>{msg}</Text>}
    </View>
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 44 },
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(2) },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center' },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  account: { marginTop: space(8), paddingTop: space(4), borderTopWidth: 1, borderTopColor: color.line, gap: space(3) },
});
