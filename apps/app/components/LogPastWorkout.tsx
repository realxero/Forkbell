// "Log a past workout" on Train: a workout you did without logging it (on
// paper, phone dead). Pick the day, the time and how long, and optionally a
// program day; it's saved as finished and opens so you can fill in the sets.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { addDays, parseClock, todayLocal, type Program } from '@forkbell/shared';
import { logPastWorkout } from '../lib/actions';
import { atLocal } from './WhenCard';
import { CalendarSheet } from './Calendar';
import { Chip } from './AmountPicker';
import { color, radius, space, type } from '../lib/theme';

export function LogPastWorkout({ visible, program, onClose }: { visible: boolean; program: Program | null; onClose: () => void }) {
  const [day, setDay] = useState(addDays(todayLocal(), -1));
  const [calendar, setCalendar] = useState(false);
  const [start, setStart] = useState('6:00 pm');
  const [minutes, setMinutes] = useState('60');
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const go = async () => {
    const hhmm = parseClock(start);
    const m = Math.round(Number(minutes));
    if (!hhmm) return setProblem('Type a start time like 6:30 pm or 18:30.');
    if (!(m >= 1 && m <= 600)) return setProblem('Type how many minutes it took (1 to 600).');
    const startedAt = atLocal(day, hhmm);
    const finishedAt = new Date(Date.parse(startedAt) + m * 60_000).toISOString();
    if (Date.parse(finishedAt) > Date.now() + 60_000) return setProblem('That ends in the future. Pick an earlier time or day.');
    setBusy(true);
    setProblem(null);
    try {
      const w = await logPastWorkout({ date: day, startedAt, finishedAt, ...(routineId ? { routineId } : {}) });
      onClose();
      router.push({ pathname: '/workout', params: { id: w.id } });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const nice = (d: string) => (d === todayLocal() ? 'Today' : d === addDays(todayLocal(), -1) ? 'Yesterday' : new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.head}>
            <Text style={type.title}>Log a past workout</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: space(3) }} keyboardShouldPersistTaps="handled">
            <Text style={type.small}>For a workout you did without logging it. It’s saved as finished; then add exercises and tick the sets you did.</Text>
            <Text style={type.label}>Day</Text>
            <Pressable onPress={() => setCalendar(true)} style={s.field} accessibilityRole="button"><Text style={type.body}>{nice(day)}</Text></Pressable>
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={type.label}>Started</Text>
                <TextInput value={start} onChangeText={setStart} style={s.field} placeholder="6:00 pm" placeholderTextColor={color.placeholder} accessibilityLabel="Start time" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={type.label}>Minutes</Text>
                <TextInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={s.field} accessibilityLabel="How many minutes it took" />
              </View>
            </View>
            {program && program.routines.length > 0 && (
              <>
                <Text style={type.label}>From your program (optional)</Text>
                <View style={s.chips}>
                  <Chip label="Empty" on={routineId === null} onPress={() => setRoutineId(null)} />
                  {program.routines.map((r) => <Chip key={r.id} label={r.name} on={routineId === r.id} onPress={() => setRoutineId(r.id)} />)}
                </View>
              </>
            )}
            {problem && <Text style={[type.small, { color: color.over }]}>{problem}</Text>}
            <Pressable onPress={() => void go()} disabled={busy} style={[s.button, busy && { opacity: 0.5 }]} accessibilityRole="button">
              <Text style={s.buttonText}>{busy ? 'Saving…' : 'Log it and add the sets'}</Text>
            </Pressable>
          </ScrollView>
          <CalendarSheet visible={calendar} selected={day} title="Which day?" onPick={(d) => { if (d <= todayLocal()) setDay(d); setCalendar(false); }} onClose={() => setCalendar(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(3), maxHeight: '90%', maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  field: { ...type.body, backgroundColor: color.chalk, borderRadius: 10, paddingHorizontal: space(3), paddingVertical: space(3), color: color.iron },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  button: { backgroundColor: color.accent, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  buttonText: { color: color.onAccent, fontWeight: '800', fontSize: 16 },
});
