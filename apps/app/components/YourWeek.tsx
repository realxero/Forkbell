import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Tap';
import { SheetFrame } from './Sheet';
import Ionicons from '@expo/vector-icons/Ionicons';
import { addDays, planTrainingWeek, starterFor, STARTER_PROGRAMS, todayLocal, weekStart, weeksTrainedInARow, type Program } from '@forkbell/shared';
import { readCache, writeCache } from '../lib/sync';
import { post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Chip } from './AmountPicker';
import { buttons } from '../lib/buttons';
import { color, radius, space, type, textSize } from '../lib/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NARROW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Your week on Train: pick the days you train, and the program's workouts are
 * laid over the next 7 days in order. A missed day moves the plan along.
 */
export function YourWeek({ program, finished, pastDates = [], onChanged }: { program: Program | null; finished: { date: string; name: string }[]; pastDates?: string[]; onChanged: () => void }) {
  const { me, refreshMe } = useAuth();
  const [editing, setEditing] = useState(false);
  const saved = me?.preferences.training?.trainingDays ?? [];
  const [days, setDays] = useState<number[]>(saved);
  const [error, setError] = useState<string | null>(null);
  const today = todayLocal();
  if (!me) return null;
  const plan = planTrainingWeek(program, saved, today, finished);

  const save = async () => {
    setError(null);
    try {
      await put('/api/me/preferences', { ...me.preferences, training: { ...me.preferences.training, trainingDays: [...days].sort() } });
      await refreshMe();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const useStarter = async () => {
    setError(null);
    try {
      await post('/api/programs/starter', { key: starterFor(days.length) });
      await save();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const starter = STARTER_PROGRAMS.find((p) => p.key === starterFor(days.length));

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={[type.title, { flex: 1 }]}>Your week</Text>
        <Pressable onPress={() => { setDays(saved); setEditing(true); }} hitSlop={8}>
          <Text style={s.link}>{saved.length ? 'Change days' : 'Pick your days'}</Text>
        </Pressable>
      </View>
      {saved.length === 0 ? (
        <Text style={type.small}>Pick the days you train and Forkbell lays out your program over the week.</Text>
      ) : (
        <View style={s.week}>
          {plan.map((d) => {
            const isToday = d.date === today;
            return (
              <View key={d.date} style={[s.day, isToday && s.today]}>
                <Text style={[type.label, isToday && { color: color.accent }]}>{NARROW[d.weekday]}</Text>
                {d.done ? (
                  <Ionicons name="checkmark-circle" size={22} color={color.iron} />
                ) : d.routine ? (
                  <View style={[s.dot, { backgroundColor: color.accent }]} />
                ) : (
                  <View style={[s.dot, { backgroundColor: color.track }]} />
                )}
                <Text style={[s.name, !d.routine && !d.done && { color: color.ironSoft }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
                  {d.done ?? d.routine?.name ?? 'Rest'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {saved.length > 0 && !program && <Text style={type.small}>No active program yet: tap Change days for a starter that fits.</Text>}
      {program && <Deload pastDates={pastDates} />}

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <SheetFrame onClose={() => setEditing(false)} kind="dialog">
          <Text style={type.title}>Which days do you train?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {DAYS.map((name, i) => (
              <Chip role="checkbox" key={name} label={name} on={days.includes(i)} onPress={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} />
            ))}
          </View>
          <Text style={type.small}>{days.length} {days.length === 1 ? 'day' : 'days'} a week. Rest days are part of the plan.</Text>
          {!program && days.length > 0 && starter && (
            <View style={s.starter}>
              <Text style={[type.body, { fontWeight: '700' }]}>Suggested: {starter.name}</Text>
              <Text style={type.small}>A good fit for {days.length} {days.length === 1 ? 'day' : 'days'} a week. You can change it any time in Programs.</Text>
              <Pressable onPress={useStarter} style={s.primary}><Text style={s.primaryText}>Use {starter.name} and save</Text></Pressable>
            </View>
          )}
          {error && <Text style={{ color: color.over }}>{error}</Text>}
          <Pressable onPress={save} style={program ? s.primary : s.secondary}>
            <Text style={program ? s.primaryText : s.secondaryText}>Save days</Text>
          </Pressable>
        </SheetFrame>
      </Modal>
    </View>
  );
}

/**
 * After several weeks of training in a row, offer a lighter week: half the sets
 * at about 90% of the weight. Workouts started from the program that week come
 * out lighter, and next week's targets pick up from the last full week.
 */
function Deload({ pastDates }: { pastDates: string[] }) {
  const { me, refreshMe } = useAuth();
  const today = todayLocal();
  const [notNow, setNotNow] = useState(readCache<string>('device:deload:notnow') === weekStart(today));
  if (!me) return null;
  const training = me.preferences.training;
  const d = training.deload;
  const on = !!d.from && !!d.until && today >= d.from && today <= d.until;
  const inARow = weeksTrainedInARow(pastDates, today, d.until);
  const save = async (deload: typeof d) => {
    await put('/api/me/preferences', { ...me.preferences, training: { ...training, deload } });
    await refreshMe();
  };
  const day = (x: string) => new Date(`${x}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
  if (on) {
    return (
      <View style={s.starter}>
        <Text style={type.body}>Deload week until {day(d.until!)}: half the sets at about 90% of the weight. Next week picks up where you left off.</Text>
        <Pressable onPress={() => save({ ...d, until: addDays(today, -1) })} style={buttons.link} accessibilityRole="button">
          <Text style={s.link}>End it now</Text>
        </Pressable>
      </View>
    );
  }
  if (notNow || d.every === 0 || inARow < d.every) return null;
  return (
    <View style={s.starter}>
      <Text style={type.body}>{inARow} weeks of training in a row. A lighter week now helps you recover and come back stronger.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        <Pressable onPress={() => save({ ...d, from: today, until: addDays(today, 6) })} style={s.secondary} accessibilityRole="button">
          <Text style={s.secondaryText}>Start a deload week</Text>
        </Pressable>
        <Pressable onPress={() => { writeCache('device:deload:notnow', weekStart(today)); setNotNow(true); }} style={buttons.link} accessibilityRole="button">
          <Text style={s.link}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  link: { color: color.accent, fontWeight: '700', fontSize: textSize.control },
  week: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: space(2), borderRadius: radius.input, backgroundColor: color.raised },
  today: { borderWidth: 1.5, borderColor: color.accent },
  dot: { width: 10, height: 10, borderRadius: 5, marginVertical: 6 },
  name: { fontSize: 10, fontWeight: '700', color: color.iron, textAlign: 'center', paddingHorizontal: 2 },
  starter: { backgroundColor: color.infoBg, borderRadius: radius.row, padding: space(3), gap: space(2) },
  primary: { ...buttons.small, minHeight: 44 },
  primaryText: buttons.smallText,
  secondary: { ...buttons.quiet, paddingVertical: space(3), minHeight: 44 },
  secondaryText: { ...buttons.quietText, fontSize: textSize.control },
});
