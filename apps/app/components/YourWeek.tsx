import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { planTrainingWeek, starterFor, STARTER_PROGRAMS, todayLocal, type Program } from '@forkbell/shared';
import { post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Chip } from './AmountPicker';
import { color, radius, space, type } from '../lib/theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NARROW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Your week on Train: pick the days you train, and the program's workouts are
 * laid over the next 7 days in order. A missed day moves the plan along.
 */
export function YourWeek({ program, finished, onChanged }: { program: Program | null; finished: { date: string; name: string }[]; onChanged: () => void }) {
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
                  <Ionicons name="checkmark-circle" size={22} color={color.fat} />
                ) : d.routine ? (
                  <View style={[s.dot, { backgroundColor: color.accent }]} />
                ) : (
                  <View style={[s.dot, { backgroundColor: color.track }]} />
                )}
                <Text style={[s.name, !d.routine && !d.done && { color: color.ironSoft }]} numberOfLines={2}>
                  {d.done ?? d.routine?.name ?? 'Rest'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {saved.length > 0 && !program && <Text style={type.small}>No active program yet: tap Change days for a starter that fits.</Text>}

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable style={s.backdrop} onPress={() => setEditing(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={type.title}>Which days do you train?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
              {DAYS.map((name, i) => (
                <Chip key={name} label={name} on={days.includes(i)} onPress={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))} />
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
              <Text style={program ? s.primaryText : s.link}>Save days</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), borderWidth: 1, borderColor: color.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  link: { color: color.accent, fontWeight: '700', fontSize: 15 },
  week: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: space(2), borderRadius: 12, backgroundColor: color.raised },
  today: { borderWidth: 1.5, borderColor: color.accent },
  dot: { width: 10, height: 10, borderRadius: 5, marginVertical: 6 },
  name: { fontSize: 10, fontWeight: '700', color: color.iron, textAlign: 'center', paddingHorizontal: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: space(4) },
  sheet: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), maxWidth: 440, width: '100%', alignSelf: 'center' },
  starter: { backgroundColor: color.infoBg, borderRadius: 12, padding: space(3), gap: space(2) },
  primary: { backgroundColor: color.accent, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  primaryText: { color: color.onAccent, fontWeight: '700', fontSize: 15 },
  secondary: { borderRadius: 10, paddingVertical: space(3), alignItems: 'center', borderWidth: 1, borderColor: color.line },
});
