// A finished workout's day and times, which can be fixed afterwards (logged
// on the wrong day, forgot to tap Finish). Records are read from the history
// as it now stands, so moving a workout moves its records with it.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addDays, formatClock, instant, parseClock, todayLocal } from '@forkbell/shared';
import { CalendarSheet } from './Calendar';
import { color, radius, space, type } from '../lib/theme';

/** "18:30" on a day, as an instant in this phone's time zone. */
export const atLocal = (date: string, hhmm: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [h, min] = hhmm.split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, h, min).toISOString();
};
const clockOf = (iso: string) => {
  const t = new Date(instant(iso));
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
};
const niceDay = (d: string) => (d === todayLocal() ? 'Today' : d === addDays(todayLocal(), -1) ? 'Yesterday' : new Date(`${d}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }));

export function WhenCard({ date, startedAt, finishedAt, onChange }: { date: string; startedAt: string; finishedAt: string; onChange: (w: { date: string; startedAt: string; finishedAt: string }) => void }) {
  const [editing, setEditing] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [day, setDay] = useState(date);
  const [start, setStart] = useState(formatClock(clockOf(startedAt)));
  const [minutes, setMinutes] = useState(String(Math.max(1, Math.round((instant(finishedAt) - instant(startedAt)) / 60_000))));
  const [problem, setProblem] = useState<string | null>(null);
  const mins = Math.round((instant(finishedAt) - instant(startedAt)) / 60_000);

  const save = () => {
    const hhmm = parseClock(start);
    const m = Math.round(Number(minutes));
    if (!hhmm) return setProblem('Type a start time like 6:30 pm or 18:30.');
    if (!(m >= 1 && m <= 600)) return setProblem('Type how many minutes it took (1 to 600).');
    const s = atLocal(day, hhmm);
    const f = new Date(Date.parse(s) + m * 60_000).toISOString();
    if (Date.parse(f) > Date.now() + 60_000) return setProblem('That ends in the future. Pick an earlier time or day.');
    setProblem(null);
    setEditing(false);
    onChange({ date: day, startedAt: s, finishedAt: f });
  };

  if (!editing)
    return (
      <View style={s.card}>
        <Text style={[type.body, { flex: 1 }]}>
          {niceDay(date)} · {formatClock(clockOf(startedAt))} · {mins} min
        </Text>
        <Pressable onPress={() => setEditing(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change the day or time of this workout">
          <Text style={s.link}>Change</Text>
        </Pressable>
      </View>
    );
  return (
    <View style={[s.card, { flexDirection: 'column', alignItems: 'stretch', gap: space(2) }]}>
      <Text style={type.label}>When you did it</Text>
      <Pressable onPress={() => setCalendar(true)} style={s.field} accessibilityRole="button">
        <Text style={type.body}>{niceDay(day)}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: space(2) }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.small}>Started</Text>
          <TextInput value={start} onChangeText={setStart} placeholder="6:30 pm" placeholderTextColor={color.placeholder} style={s.field} accessibilityLabel="Start time" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={type.small}>Minutes</Text>
          <TextInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" style={s.field} accessibilityLabel="How many minutes it took" />
        </View>
      </View>
      {problem && <Text style={[type.small, { color: color.over }]}>{problem}</Text>}
      <View style={{ flexDirection: 'row', gap: space(4), justifyContent: 'flex-end' }}>
        <Pressable onPress={() => setEditing(false)} hitSlop={8}><Text style={[s.link, { color: color.ironSoft }]}>Cancel</Text></Pressable>
        <Pressable onPress={save} hitSlop={8}><Text style={s.link}>Save</Text></Pressable>
      </View>
      <CalendarSheet visible={calendar} selected={day} title="Which day?" onPick={(d) => { if (d <= todayLocal()) setDay(d); setCalendar(false); }} onClose={() => setCalendar(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.card, borderRadius: radius.card, padding: space(3), gap: space(2) },
  link: { color: color.accent, fontWeight: '700', fontSize: 15 },
  field: { ...type.body, backgroundColor: color.chalk, borderRadius: 10, paddingHorizontal: space(3), paddingVertical: space(2), color: color.iron },
});
