// Vitamins and minerals for the day, from the foods that list them (labels,
// Open Food Facts, USDA). Many don't, so it says how many foods counted and
// the numbers are a floor, not the whole day.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MICROS, microText, sumMicros, type DiaryEntry } from '@forkbell/shared';
import { color, radius, space, type } from '../lib/theme';

export function MicrosCard({ entries }: { entries: Pick<DiaryEntry, 'grams' | 'food'>[] }) {
  const [open, setOpen] = useState(false);
  const day = sumMicros(entries);
  if (!day.known) return null;
  const shown = MICROS.filter((m) => day.totals[m.key] !== undefined);
  return (
    <View style={s.card}>
      <Pressable onPress={() => setOpen((o) => !o)} style={s.head} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Ionicons name="nutrition-outline" size={20} color={color.fat} />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '700' }]}>Vitamins and minerals</Text>
          <Text style={type.small}>
            From {day.known} of {day.of} food{day.of === 1 ? '' : 's'} that list them
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={color.ironSoft} />
      </Pressable>
      {open && (
        <View style={{ gap: space(2) }}>
          {shown.map((m) => {
            const v = day.totals[m.key] ?? 0;
            const pct = Math.round((v / m.dv) * 100);
            return (
              <View key={m.key} style={{ gap: 4 }} accessibilityLabel={`${m.name}: ${microText(m.key, v)}, ${pct}% of the daily value`}>
                <View style={{ flexDirection: 'row' }}>
                  <Text style={[type.small, { flex: 1, color: color.iron }]}>{m.name}</Text>
                  <Text style={[type.small, type.number]}>
                    {microText(m.key, v)} · {pct}%
                  </Text>
                </View>
                <View style={s.track}>
                  <View style={[s.fill, { width: `${Math.min(100, pct)}%` }]} />
                </View>
              </View>
            );
          })}
          <Text style={type.small}>
            % of the daily value for adults on US labels. Foods that don’t list these (most home-made and many restaurant foods) aren’t counted, so the real day is likely higher.
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  track: { height: 6, borderRadius: 3, backgroundColor: color.track, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.fat },
});
