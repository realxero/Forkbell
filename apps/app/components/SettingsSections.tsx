import { useEffect, useState } from 'react';
import { DEFAULT_WATER_GOAL_ML, FAST_PRESETS, parseWaterGoal, presetGoals, todayLocal, waterText } from '@forkbell/shared';
import { cachedGet, readCache, writeCache } from '../lib/sync';
import { ACCENTS, nativeChoice, nativeThemeSupported, setNativeTheme, setWebAccent, setWebScheme, type AccentName, type SchemeChoice, savedNativeAccent } from '../lib/theme';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { Goals } from '@forkbell/shared';
import { useAuth } from '../lib/auth';
import { put } from '../lib/api';
import { color, space, type } from '../lib/theme';
import { Chip } from './AmountPicker';
import { AiSettings } from './AiSettings';
import { Platform, Switch } from 'react-native';
import { playSound, setSoundsOn, soundsOn, unlockAudio } from '../lib/sounds';
import { hapticsOn, hapticsSupported, setHapticsOn } from '../lib/haptics';
import { downloadAllPictures, onPictureProgress, pictureCacheSupported, pictureDownloadRunning, pictureStats, removeSavedPictures } from '../lib/picture-cache';
import { reminderSettings, remindersSupported, setReminderSettings, type ReminderSettings } from '../lib/reminders';
import { connectHealth, getHealthSettings, healthName, healthSupported, setHealthSettings, syncHealth, type HealthSettings } from '../lib/health-sync';

/** Settings → Goals and targets. */
export function GoalsSection() {
  const { me, refreshMe } = useAuth();
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
    <View style={{ gap: space(3) }}>
      <Pressable onPress={() => router.push({ pathname: '/onboarding', params: { from: 'settings' } })} style={s.cta}>
        <Text style={s.ctaText}>Recalculate my targets</Text>
        <Text style={[type.small, { color: color.onAccent }]}>From your goal, body and training</Text>
      </Pressable>
      <Text style={type.small}>Or set them yourself. Leave one empty to just track it.</Text>
      <Presets onPick={(g) => setForm({ kcal: String(g.kcal), protein: String(g.protein), carbs: String(g.carbs), fat: String(g.fat) })} />
      {field('kcal', 'Calories')}
      {field('protein', 'Protein (g)')}
      {field('carbs', 'Carbs (g)')}
      {field('fat', 'Fat (g)')}
      <Pressable onPress={save} style={s.button}>
        <Text style={s.buttonText}>Save goals</Text>
      </Pressable>
      {status && <Text style={type.body}>{status}</Text>}
      <WeekdayGoals />
      <WaterGoal />
      <FastingSetting />
    </View>
  );
}

/** Settings → Units and appearance. */
export function AppearanceSection() {
  const { me, refreshMe } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  return (
    <View style={{ gap: space(3) }}>
      <Text style={type.small}>Weights (body and lifting)</Text>
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
      {status && <Text style={type.body}>{status}</Text>}
      <Appearance />
    </View>
  );
}

/** Settings → This phone: reminders and saved exercise pictures. */
export function PhoneSection() {
  return (
    <View style={{ gap: space(3) }}>
      {remindersSupported && <Reminders />}
      {pictureCacheSupported && <SavedPictures />}
      {!remindersSupported && !pictureCacheSupported && <Text style={type.body}>Reminders and offline exercise pictures are in the Forkbell app on your phone.</Text>}
    </View>
  );
}

export { remindersSupported, pictureCacheSupported, AiSettings };

/** Exercise how-to pictures on this phone, for the gym with no signal. */
function SavedPictures() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof pictureStats>> | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(pictureDownloadRunning() ? { done: 0, total: 0 } : null);
  const [note, setNote] = useState<string | null>(null);
  const refresh = () => void pictureStats().then(setStats, () => {});
  useEffect(() => {
    refresh();
    return onPictureProgress((p) => setProgress(p.done >= p.total ? null : p));
  }, []);
  const mb = (b: number) => `${Math.max(1, Math.round(b / 1e6))} MB`;
  const all = stats && stats.total > 0 && stats.saved >= stats.total;
  return (
    <View style={{ gap: space(2), marginTop: space(6) }}>
      <Text style={type.small}>Exercise pictures on this phone</Text>
      <Text style={type.body}>
        {!stats ? 'Checking…' : stats.saved ? `${stats.saved} of ${stats.total} saved (${mb(stats.bytes)})` : 'None saved yet'}
      </Text>
      <Text style={type.small}>
        Pictures for your everyday exercises, and any you’ve done, save by themselves (about 7 MB), so how-to works with no signal. The rest load from your server when you open them.
      </Text>
      {progress ? (
        <Text style={type.body} accessibilityLiveRegion="polite">
          Downloading {progress.done} of {progress.total}…
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(4) }}>
          {!all && stats && stats.total > 0 && (
            <Pressable
              onPress={async () => {
                setNote(null);
                try {
                  const r = await downloadAllPictures();
                  setNote(r.failed ? `${r.failed} couldn’t download. Try again on a better connection.` : 'The whole library is on this phone.');
                } catch (e) {
                  setNote(e instanceof Error ? e.message : String(e));
                }
                refresh();
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={s.link}>Download the whole library (about {mb(stats.remainingBytes)})</Text>
            </Pressable>
          )}
          {stats && stats.saved > 0 && (
            <Pressable
              onPress={() => {
                removeSavedPictures();
                setNote('Removed. Everyday pictures will save again next time Forkbell opens.');
                refresh();
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={[s.link, { color: color.ironSoft }]}>Remove saved pictures</Text>
            </Pressable>
          )}
        </View>
      )}
      {note && <Text style={type.small}>{note}</Text>}
    </View>
  );
}

/** A light tap for ticked sets, logged food, rest over and celebrations. */
/** Chimes when rest is over and when a workout is done. */
function SoundSwitch() {
  const [on, setOn] = useState(soundsOn());
  return (
    <View style={s.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>Sounds</Text>
        <Text style={type.small}>A chime when rest is over and when you finish a workout. Plays over your music without pausing it{Platform.OS === 'ios' ? ' and follows the silent switch' : ''}.</Text>
      </View>
      <Switch value={on} onValueChange={(v) => { setOn(v); setSoundsOn(v); if (v) { unlockAudio(); playSound('rest'); } }} accessibilityLabel="Sounds" />
    </View>
  );
}

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
      <View style={s.switchRow}>
        <Text style={[type.body, { flex: 1 }]}>Medication times</Text>
        <Switch value={r.meds} onValueChange={(v) => change({ ...r, meds: v })} accessibilityLabel="Medication reminders" />
      </View>
      <Text style={type.small}>At the times you set on each medication, with Taken and Skip buttons. Doses you’ve already ticked off stay quiet.</Text>
      <View style={s.switchRow}>
        <Text style={[type.body, { flex: 1 }]}>Rest timer</Text>
        <Switch value={r.rest} onValueChange={(v) => change({ ...r, rest: v })} accessibilityLabel="Rest timer alert" />
      </View>
      <Text style={type.small}>A buzz and a notification when your rest is up, even with the phone locked or Forkbell in the background.</Text>
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
      <SoundSwitch />
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

export function HealthSection() {
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
            {h.weightHistoryImported && h.weightHistoryCount ? ` Brought in ${h.weightHistoryCount} past weigh-ins.` : ''}
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
  cta: { backgroundColor: color.accent, borderRadius: 14, padding: space(4), gap: 2 },
  ctaText: { color: color.onAccent, fontSize: 17, fontWeight: '800' },
  account: { marginTop: space(8), paddingTop: space(4), borderTopWidth: 1, borderTopColor: color.line, gap: space(3) },
});

/** Settings → Goals: the daily water goal, and whether the Water card shows on Today. */
function WaterGoal() {
  const { me, refreshMe } = useAuth();
  const unit = me?.weightUnit ?? 'lb';
  const water = me?.preferences.water ?? { show: true, goalMl: DEFAULT_WATER_GOAL_ML };
  const [text, setText] = useState(waterText(water.goalMl, unit));
  const [status, setStatus] = useState<string | null>(null);
  const save = async (next: { show: boolean; goalMl: number }) => {
    if (!me) return;
    try {
      await put('/api/me/preferences', { ...me.preferences, water: next });
      await refreshMe();
      setStatus(next.show ? `Water goal: ${waterText(next.goalMl, unit)} a day.` : 'The Water card is hidden. Your water history is kept.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const saveGoal = () => {
    const ml = parseWaterGoal(text, unit);
    if (!ml) return setStatus(`Type a daily amount like ${unit === 'lb' ? '“68 oz” or “2.5 L”' : '“2.5 L” or “2500 ml”'}.`);
    setText(waterText(ml, unit));
    void save({ ...water, goalMl: ml });
  };
  return (
    <View style={{ gap: space(2), marginTop: space(4) }}>
      <Text style={type.label}>Water</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
        <Text style={[type.body, { flex: 1 }]}>Show the Water card on Today</Text>
        <Switch value={water.show} onValueChange={(show) => void save({ ...water, show })} accessibilityLabel="Show the Water card on Today" />
      </View>
      {water.show && (
        <>
          <Text style={type.small}>Daily goal (2 L, about 68 oz, to start). Type it in oz, ml or L.</Text>
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            <TextInput value={text} onChangeText={setText} onSubmitEditing={saveGoal} placeholder={unit === 'lb' ? '68 oz' : '2 L'} style={[s.input, { flex: 1 }]} accessibilityLabel="Daily water goal" />
            <Pressable onPress={saveGoal} style={[s.button, { paddingHorizontal: space(5) }]}><Text style={s.buttonText}>Save</Text></Pressable>
          </View>
        </>
      )}
      {status && <Text style={type.small}>{status}</Text>}
    </View>
  );
}

/** Settings → Goals: the fasting timer on Today (off until turned on) and the goal it starts with. */
function FastingSetting() {
  const { me, refreshMe } = useAuth();
  const fasting = me?.preferences.fasting ?? { show: false, hours: 16 };
  const save = async (next: { show: boolean; hours: number }) => {
    if (!me) return;
    await put('/api/me/preferences', { ...me.preferences, fasting: next }).catch(() => {});
    await refreshMe();
  };
  return (
    <View style={{ gap: space(2), marginTop: space(4) }}>
      <Text style={type.label}>Fasting</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
        <Text style={[type.body, { flex: 1 }]}>Show the fasting timer on Today</Text>
        <Switch value={fasting.show} onValueChange={(show) => void save({ ...fasting, show })} accessibilityLabel="Show the fasting timer on Today" />
      </View>
      {fasting.show && (
        <>
          <Text style={type.small}>Usual goal</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {FAST_PRESETS.map((h) => <Chip key={h} label={`${h} hours`} on={fasting.hours === h} onPress={() => void save({ ...fasting, hours: h })} />)}
          </View>
        </>
      )}
      <Text style={type.small}>Optional. If you’re pregnant, diabetic, on medication, or fasting has ever made eating feel hard, check with your doctor first.</Text>
    </View>
  );
}
