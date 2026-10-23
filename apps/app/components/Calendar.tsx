import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { addDays, todayLocal } from '@forkbell/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { color, radius, space, type } from '../lib/theme';

type DayTotal = { date: string; totals: { kcal: number } };
const pad = (n: number) => String(n).padStart(2, '0');
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A month calendar. Logged days get a dot: green within your goal, red over.
 * Used to jump to a day, and to pick where to copy food.
 */
export function CalendarSheet({
  visible,
  selected,
  title = 'Go to a day',
  onPick,
  onClose,
  footer,
}: {
  visible: boolean;
  selected: string;
  title?: string;
  onPick: (date: string) => void;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const { me } = useAuth();
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [totals, setTotals] = useState<Record<string, number>>({});
  useEffect(() => {
    if (visible) setMonth(selected.slice(0, 7));
  }, [visible, selected]);
  useEffect(() => {
    if (!visible) return;
    const from = `${month}-01`;
    const to = addDays(`${month}-01`, 40);
    api<{ days: DayTotal[] }>(`/api/diary/totals?from=${from}&to=${to}`).then(
      (r) => setTotals(Object.fromEntries(r.days.map((d) => [d.date, d.totals.kcal]))),
      () => setTotals({}),
    );
  }, [visible, month]);

  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const daysIn = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${pad(i + 1)}`)];
  const today = todayLocal();
  const goalFor = (date: string) => {
    const [yy, mm, dd] = date.split('-').map(Number) as [number, number, number];
    const wd = String(new Date(yy, mm - 1, dd).getDay()) as '0';
    return me?.weekdayGoals?.[wd]?.kcal ?? me?.goals.kcal ?? null;
  };
  const shift = (by: number) => {
    const d = new Date(y, m - 1 + by, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.head}>
            <Text style={type.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
          </View>
          <View style={s.monthRow}>
            <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityLabel="Previous month"><Ionicons name="chevron-back" size={22} color={color.accent} /></Pressable>
            <Text style={[type.body, { fontWeight: '700' }]}>{first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
            <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityLabel="Next month"><Ionicons name="chevron-forward" size={22} color={color.accent} /></Pressable>
          </View>
          <View style={s.grid}>
            {WEEK.map((w, i) => <Text key={i} style={[s.cell, type.label, { textAlign: 'center' }]}>{w}</Text>)}
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={s.cell} />;
              const kcal = totals[d];
              const goal = goalFor(d);
              const dot = kcal ? (goal && kcal > goal * 1.05 ? color.over : color.fat) : null;
              const on = d === selected;
              return (
                <Pressable key={d} onPress={() => onPick(d)} style={s.cell} accessibilityLabel={`${d}${kcal ? `, ${kcal} kcal logged` : ''}`}>
                  <View style={[s.day, on && { backgroundColor: color.accent }, d === today && !on && { borderWidth: 1.5, borderColor: color.accent }]}>
                    <Text style={[type.body, type.number, on && { color: color.onAccent, fontWeight: '800' }]}>{Number(d.slice(8))}</Text>
                  </View>
                  <View style={[s.dot, { backgroundColor: dot ?? 'transparent' }]} />
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: space(4) }}>
            <Text style={type.small}><Text style={{ color: color.fat }}>●</Text> logged</Text>
            <Text style={type.small}><Text style={{ color: color.over }}>●</Text> over goal</Text>
          </View>
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: space(4) },
  sheet: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), maxWidth: 440, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
});
