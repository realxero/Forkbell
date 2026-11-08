// A month of days to tap, for picking a date without typing one. Plain React
// Native, so it looks the same on iPhone, Android and the web. Weeks start on
// Sunday, like Your week on Train.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { todayLocal } from '@forkbell/shared';
import { Pressable } from './Tap';
import { color, radius, space, type } from '../lib/theme';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MonthCalendar({ value, onChange, min, max }: { value: string | null; onChange: (date: string) => void; min?: string; max?: string }) {
  const today = todayLocal();
  const start = value ?? min ?? today;
  const [cursor, setCursor] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }));
  const first = new Date(cursor.y, cursor.m, 1);
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const lead = first.getDay();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const move = (by: number) => setCursor(({ y, m }) => ({ y: y + Math.floor((m + by) / 12), m: (((m + by) % 12) + 12) % 12 }));
  const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const minMonth = min ? min.slice(0, 7) : null;
  const atMin = minMonth !== null && iso(cursor.y, cursor.m, 1).slice(0, 7) <= minMonth;
  const atMax = max !== undefined && iso(cursor.y, cursor.m, 1).slice(0, 7) >= max.slice(0, 7);

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Pressable onPress={() => move(-1)} disabled={atMin} style={[s.arrow, atMin && { opacity: 0.3 }]} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={20} color={color.iron} />
        </Pressable>
        <Text style={[type.heading, { flex: 1, textAlign: 'center' }]} accessibilityRole="header">{title}</Text>
        <Pressable onPress={() => move(1)} disabled={atMax} style={[s.arrow, atMax && { opacity: 0.3 }]} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={20} color={color.iron} />
        </Pressable>
      </View>
      <View style={s.grid}>
        {WEEKDAYS.map((d, i) => (
          <Text key={`w${i}`} style={[type.label, s.cell, s.weekday]} importantForAccessibility="no" accessibilityElementsHidden>{d}</Text>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <View key={`e${i}`} style={s.cell} />;
          const date = iso(cursor.y, cursor.m, d);
          const on = date === value;
          const off = Boolean((min && date < min) || (max && date > max));
          const isToday = date === today;
          return (
            <Pressable
              key={date}
              onPress={() => onChange(date)}
              disabled={off}
              style={[s.cell, s.day, isToday && !on && s.today, on && s.dayOn, off && { opacity: 0.3 }]}
              accessibilityLabel={`${isToday ? 'Today, ' : ''}${new Date(cursor.y, cursor.m, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
              accessibilityState={{ selected: on, disabled: off }}
            >
              <Text style={[type.body, type.number, on && { color: color.chalk, fontWeight: '700' }]}>{d}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: space(2) },
  head: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center' },
  weekday: { textAlign: 'center', paddingVertical: space(1) },
  day: { height: 44, borderRadius: radius.pill },
  dayOn: { backgroundColor: color.iron },
  // Today gets a ring so the month has a point to read from.
  today: { borderWidth: 1.5, borderColor: color.ironSoft },
});
