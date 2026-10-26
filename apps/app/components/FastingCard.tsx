// The fasting timer on Today, when it's turned on in Settings → Goals and
// targets. Start now or from when you last ate, watch it count, end it any
// time. A notification when the goal is reached. Works offline.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { FAST_PRESETS, instant, fastProgress, hoursText, todayLocal, type Fasts } from '@forkbell/shared';
import { useAuth } from '../lib/auth';
import { cachedGet, readCache } from '../lib/sync';
import { endFast, removeFast, startFast } from '../lib/actions';
import { scheduleFastAlert } from '../lib/reminders';
import { confirm } from '../lib/confirm';
import { haptic } from '../lib/haptics';
import { showToast } from '../lib/toast';
import { Chip } from './AmountPicker';
import { color, radius, space, type } from '../lib/theme';

const PATH = '/api/wellbeing/fasts';

export function FastingCard({ readOnly }: { readOnly?: boolean }) {
  const { me } = useAuth();
  const prefs = me?.preferences.fasting;
  const [f, setF] = useState<Fasts | null>(() => readCache<Fasts>(PATH) ?? null);
  const [hours, setHours] = useState(prefs?.hours ?? 16);
  /** started this many hours ago (forgot to tap Start after dinner) */
  const [ago, setAgo] = useState(0);
  const [, tick] = useState(0);
  const fromCache = () => setF(readCache<Fasts>(PATH) ?? { open: null, recent: [], streak: 0 });
  const load = useCallback(() => {
    cachedGet<Fasts>(`${PATH}?today=${todayLocal()}&tz=${new Date().getTimezoneOffset()}`).then(
      (r) => {
        setF(r);
        if (!readOnly) void scheduleFastAlert(r.open);
      },
      () => fromCache(),
    );
  }, [readOnly]);
  useFocusEffect(useCallback(() => load(), [load]));
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!prefs?.show || !f) return null;

  const start = async () => {
    haptic.tap();
    const from = ago ? new Date(Date.now() - ago * 3_600_000).toISOString() : undefined;
    const p = startFast(hours, from);
    fromCache();
    try {
      const fast = await p;
      void scheduleFastAlert(fast);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      load();
    }
    setAgo(0);
  };
  const end = async () => {
    const open = f.open!;
    const p = fastProgress(open);
    if (!p.done && !(await confirm('End your fast early?', `You’re at ${hoursText(p.hours)} of ${open.targetHours} hours. That’s fine; it just won’t count toward your streak.`, 'End it'))) return;
    const pending = endFast(open);
    fromCache();
    void scheduleFastAlert(null);
    if (p.done) showToast(`${hoursText(p.hours)} fast done. Nice!`, { tone: 'celebrate' });
    await pending.catch((e) => showToast(e instanceof Error ? e.message : String(e)));
  };
  const remove = async () => {
    if (!(await confirm('Remove this fast?', 'It’s taken out completely, as if it never started.', 'Remove'))) return;
    const pending = removeFast(f.open!);
    fromCache();
    void scheduleFastAlert(null);
    await pending.catch(() => {});
  };

  const head = (
    <View style={s.row}>
      <Ionicons name="hourglass-outline" size={22} color={color.fat} />
      <Text style={[type.title, { flex: 1, fontSize: 18 }]}>Fasting</Text>
      {f.streak > 0 && <Text style={type.small}>🔥 {f.streak} in a row</Text>}
    </View>
  );

  if (f.open) {
    const p = fastProgress(f.open);
    return (
      <View style={s.card}>
        {head}
        <Text style={[type.hero, { fontSize: 32 }, type.number]}>{hoursText(p.hours)}</Text>
        <View style={s.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(p.fraction * 100) }}>
          <View style={[s.fill, { width: `${p.fraction * 100}%` }]} />
        </View>
        <Text style={type.small}>
          {p.done ? `Goal of ${f.open.targetHours} hours reached.` : `${hoursText(p.remainingMinutes / 60)} to go of ${f.open.targetHours} hours.`} Started{' '}
          {new Date(instant(f.open.startedAt)).toLocaleTimeString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.
        </Text>
        {!readOnly && (
          <View style={s.row}>
            <Pressable onPress={() => void end()} style={[s.button, p.done && s.buttonOn]} accessibilityRole="button">
              <Text style={[s.buttonText, p.done && { color: '#fff' }]}>{p.done ? 'End fast' : 'End early'}</Text>
            </Pressable>
            <Pressable onPress={() => void remove()} hitSlop={8}><Text style={[type.small, { color: color.ironSoft }]}>Remove</Text></Pressable>
          </View>
        )}
      </View>
    );
  }
  if (readOnly) return null;
  return (
    <View style={s.card}>
      {head}
      <View style={s.chips}>
        {FAST_PRESETS.map((h) => <Chip key={h} label={`${h}h`} on={hours === h} onPress={() => setHours(h)} />)}
      </View>
      <Text style={type.small}>Your last meal was</Text>
      <View style={s.chips}>
        {[0, 1, 2, 3, 4].map((h) => <Chip key={h} label={h === 0 ? 'Just now' : `${h}h ago`} on={ago === h} onPress={() => setAgo(h)} />)}
      </View>
      <Pressable onPress={() => void start()} style={s.button} accessibilityRole="button">
        <Text style={s.buttonText}>Start a {hours}-hour fast</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  bar: { height: 10, borderRadius: 5, backgroundColor: color.track, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: color.fat },
  button: { flex: 1, minHeight: 42, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.fat, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(2) },
  buttonOn: { backgroundColor: color.fat },
  buttonText: { color: color.fat, fontWeight: '800', textAlign: 'center' },
});
