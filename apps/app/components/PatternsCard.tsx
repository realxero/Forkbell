import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { todayLocal, type Insight } from '@forkbell/shared';
import { useAuth } from '../lib/auth';
import { cachedGet } from '../lib/sync';
import { useViewing } from '../lib/profile';
import { color, radius, space, type } from '../lib/theme';

/** What your own last 90 days say. Only patterns that pass the checks; always says it's a pattern, not proof. */
export function PatternsCard() {
  const { me } = useAuth();
  const viewing = useViewing();
  const [data, setData] = useState<{ insights: Insight[]; daysLooked: number } | null>(null);
  useEffect(() => {
    cachedGet<{ insights?: Insight[]; daysLooked?: number }>(`/api/progress/patterns?today=${todayLocal()}`).then(
      (r) => setData({ insights: r.insights ?? [], daysLooked: r.daysLooked ?? 0 }),
      () => setData(null),
    );
  }, [viewing]);
  if (!data || me?.preferences.patterns === false) return null;
  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), borderWidth: 1, borderColor: color.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <Ionicons name="analytics-outline" size={20} color={color.accent} />
        <Text style={type.title}>Patterns</Text>
      </View>
      {data.insights.length === 0 ? (
        <Text style={type.small}>
          Nothing clear yet from {data.daysLooked} logged days. Patterns show up once there are enough days on both sides to be sure, usually after a few weeks.
        </Text>
      ) : (
        data.insights.map((i) => (
          <View key={i.key} style={{ flexDirection: 'row', gap: space(2) }}>
            <Text style={{ color: color.accent, fontWeight: '900' }}>•</Text>
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{i.text}</Text>
              <Text style={[type.small, { fontSize: 11 }]}>Based on {i.days} days</Text>
            </View>
          </View>
        ))
      )}
      {data.insights.length > 0 && <Text style={type.small}>Patterns in your own logging, not proof of cause. Use them as hints.</Text>}
    </View>
  );
}
