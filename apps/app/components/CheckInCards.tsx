import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { addDays, todayLocal, trainingCheckIn, weekStart, type FoodCheckIn, type TrainingWeek } from '@forkbell/shared';
import { api, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { readCache, writeCache } from '../lib/sync';
import { useViewing } from '../lib/profile';
import { showToast } from '../lib/toast';
import { color, radius, space, type } from '../lib/theme';

const gotIt = (key: string) => readCache<boolean>(key) === true;

/** Weekly food check-in on Progress: shown each week until you tap Got it. */
export function FoodCheckInCard({ checkIn, unit, onChanged }: { checkIn: FoodCheckIn; unit: 'lb' | 'kg'; onChanged: () => void }) {
  const { me, refreshMe } = useAuth();
  const viewing = useViewing();
  const key = `device:checkin:food:${checkIn.weekOf}`;
  const [hidden, setHidden] = useState(gotIt(key));
  if (hidden || viewing) return null;
  const kg = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${(unit === 'lb' ? v * 2.20462 : v).toFixed(1)} ${unit}`);
  const apply = async () => {
    if (!checkIn.suggestion || !me) return;
    const before = me.goals;
    await put('/api/me/goals', { ...before, kcal: checkIn.suggestion.kcal });
    await refreshMe();
    onChanged();
    showToast(`Calorie goal set to ${checkIn.suggestion.kcal.toLocaleString()}`, { action: { label: 'Undo', run: async () => { await put('/api/me/goals', before); await refreshMe(); onChanged(); } } });
  };
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Ionicons name="clipboard-outline" size={20} color={color.accent} />
        <Text style={[type.title, { flex: 1 }]}>Weekly check-in</Text>
      </View>
      <View style={s.stats}>
        <Stat label="Avg intake" value={checkIn.avgKcal ? checkIn.avgKcal.toLocaleString() : '–'} />
        <Stat label="Days logged" value={`${checkIn.loggedDays} of 7`} />
        <Stat label="Trend" value={kg(checkIn.actualKg)} />
      </View>
      <Text style={type.body}>{checkIn.verdict}</Text>
      {(checkIn.sodium || checkIn.fiber) && (
        <Text style={type.small}>
          {checkIn.sodium ? `Sodium averaged ${checkIn.sodium.avg.toLocaleString()} mg${checkIn.sodium.daysOver ? ` (over 2,300 on ${checkIn.sodium.daysOver} days)` : ''}. ` : ''}
          {checkIn.fiber ? `Fiber averaged ${checkIn.fiber.avg} g${checkIn.fiber.daysUnder ? ` (under 28 on ${checkIn.fiber.daysUnder} days)` : ''}.` : ''}
        </Text>
      )}
      <View style={s.actions}>
        {checkIn.suggestion && (
          <Pressable onPress={apply} style={s.primary}>
            <Text style={s.primaryText}>Use {checkIn.suggestion.kcal.toLocaleString()} kcal</Text>
          </Pressable>
        )}
        <Pressable onPress={() => { writeCache(key, true); setHidden(true); }} style={s.secondary}>
          <Text style={s.secondaryText}>Got it</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Last week's training in one line and one adjustment. On Train, once a week. */
export function TrainingCheckInCard() {
  const viewing = useViewing();
  const today = todayLocal();
  const lastWeek = addDays(weekStart(today), -7);
  const key = `device:checkin:train:${lastWeek}`;
  const [hidden, setHidden] = useState(gotIt(key));
  const [w, setW] = useState<TrainingWeek | null>(null);
  useEffect(() => {
    if (hidden) return;
    api<TrainingWeek>(`/api/workouts/review?from=${lastWeek}&to=${addDays(lastWeek, 6)}`).then(setW, () => setW(null));
  }, [hidden, lastWeek]);
  if (hidden || !w || viewing) return null;
  const c = trainingCheckIn(w);
  const tint = c.tone === 'good' ? color.fat : c.tone === 'hold' ? color.over : color.accent;
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Ionicons name={c.tone === 'good' ? 'trophy-outline' : c.tone === 'hold' ? 'pause-circle-outline' : 'trending-up-outline'} size={20} color={tint} />
        <Text style={[type.title, { flex: 1 }]}>Last week</Text>
      </View>
      <Text style={[type.body, { fontWeight: '700' }]}>{c.headline}</Text>
      <Text style={type.body}>{c.advice}</Text>
      <Pressable onPress={() => { writeCache(key, true); setHidden(true); }} style={[s.secondary, { alignSelf: 'flex-start' }]}>
        <Text style={s.secondaryText}>Got it</Text>
      </Pressable>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={type.label}>{label}</Text>
      <Text style={[type.body, type.number, { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), borderWidth: 1, borderColor: color.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  stats: { flexDirection: 'row', gap: space(2) },
  stat: { flex: 1, backgroundColor: color.raised, borderRadius: 12, padding: space(2) + 2, gap: 2 },
  actions: { flexDirection: 'row', gap: space(3), alignItems: 'center' },
  primary: { backgroundColor: color.accent, borderRadius: 10, paddingVertical: space(2) + 2, paddingHorizontal: space(4) },
  primaryText: { color: color.onAccent, fontWeight: '700', fontSize: 15 },
  secondary: { borderRadius: 10, paddingVertical: space(2) + 2, paddingHorizontal: space(4), borderWidth: 1, borderColor: color.line },
  secondaryText: { color: color.accent, fontWeight: '700', fontSize: 15 },
});
