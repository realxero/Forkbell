// Readiness this morning: a score from last night's sleep and your resting
// heart rate and HRV against your own usual, with what moved it.
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { todayLocal, type Readiness } from '@forkbell/shared';
import { cachedGet } from '../lib/sync';
import { color, radius, space, type } from '../lib/theme';

export function ReadinessCard({ r, compact }: { r: Readiness; compact?: boolean }) {
  const tint = r.label === 'Ready to push' ? color.fat : r.label === 'Normal' ? color.accent : color.carbs;
  const hours = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`;
  return (
    <View style={[s.card, compact && { padding: space(3) }]} accessibilityLabel={`Readiness ${r.score}, ${r.label}`}>
      <View style={s.row}>
        <View style={[s.badge, { borderColor: tint }]}>
          <Text style={[s.score, { color: tint }]}>{r.score}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '800' }]}>Readiness: {r.label}</Text>
          {r.sleep && (
            <Text style={type.small}>
              Sleep {hours(r.sleep.minutes)} · score {r.sleep.score}
              {r.sleep.usualMinutes ? ` (usual ${hours(r.sleep.usualMinutes)})` : ''}
            </Text>
          )}
        </View>
      </View>
      {!compact && (
        <Text style={type.small}>
          {r.reasons.length ? `${r.reasons.join('; ')}.` : 'Sleep and heart numbers are about your usual.'} Worked out from what your watch sends to Apple Health, against your own last four weeks.
          {r.label === 'Take it easier' ? ' A lighter session, or more rest between sets, makes sense today.' : ''}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  badge: { width: 52, height: 52, borderRadius: 26, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 20, fontWeight: '800' },
});

/** On Train: this morning's readiness, small, when there is one. */
export function TrainReadiness() {
  const [r, setR] = useState<Readiness | null>(null);
  useFocusEffect(
    useCallback(() => {
      cachedGet<{ activity?: { readiness?: Readiness | null } }>(`/api/progress?today=${todayLocal()}`).then((p) => setR(p.activity?.readiness ?? null), () => {});
    }, []),
  );
  return r ? <ReadinessCard r={r} compact /> : null;
}
