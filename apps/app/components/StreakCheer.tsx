import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { streakCheer, todayLocal, type StreakCheer as Cheer, type Streaks } from '@forkbell/shared';
import { api } from '../lib/api';
import { readCache, writeCache } from '../lib/sync';
import { haptic } from '../lib/haptics';
import { BellAvatar } from './BellAvatar';
import { Confetti } from './Confetti';
import { color, radius, space, type } from '../lib/theme';

const SEEN = 'device:streak-cheers';

/**
 * Bell cheering a streak milestone on Today: 3, 7, 14, 21 and 30 days of
 * logging, 2, 4 and 8 weeks of training. Each milestone of a streak shows once.
 */
export function StreakCheer({ enabled, tick = 0 }: { enabled: boolean; /** changes when food is logged, to check again */ tick?: number }) {
  const [cheer, setCheer] = useState<Cheer | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let gone = false;
      api<Streaks>(`/api/progress/streaks?today=${todayLocal()}`).then(
        (st) => {
          const seen = readCache<string[]>(SEEN) ?? [];
          const c = streakCheer(st, seen);
          if (!c || gone) return;
          // Marked as shown straight away: leaving and coming back doesn't repeat it.
          writeCache(SEEN, [...seen, c.key].slice(-60));
          setCheer(c);
          haptic.success();
        },
        () => {}, // offline: celebrate next time
      );
      return () => {
        gone = true;
      };
    }, [enabled, tick]),
  );
  if (!cheer) return null;
  return (
    <View style={s.card} accessibilityLiveRegion="polite">
      <Confetti height={180} />
      <BellAvatar size={56} mood="proud" alive />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { fontWeight: '800' }]}>{cheer.kind === 'food' ? '🔥 ' : '🏋 '}{cheer.title}</Text>
        <Text style={type.small}>{cheer.detail}</Text>
      </View>
      <Pressable onPress={() => setCheer(null)} hitSlop={12} accessibilityLabel="Dismiss">
        <Ionicons name="close" size={20} color={color.ironSoft} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, padding: space(4), overflow: 'hidden' },
});
