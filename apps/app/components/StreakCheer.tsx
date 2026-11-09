import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { streakCheer, todayLocal, type Streaks } from '@forkbell/shared';
import { api } from '../lib/api';
import { readCache, writeCache } from '../lib/sync';
import { haptic } from '../lib/haptics';
import { showToast } from '../lib/toast';

const SEEN = 'device:streak-cheers';

/**
 * Bell cheering a streak milestone on Today: 3, 7, 14, 21 and 30 days of
 * logging, 2, 4 and 8 weeks of training. Each milestone of a streak shows once,
 * as a celebration toast, so it never pushes the meals down the screen.
 */
export function StreakCheer({ enabled, tick = 0 }: { enabled: boolean; /** changes when food is logged, to check again */ tick?: number }) {
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
          haptic.success();
          showToast(`${c.title} ${c.detail}`, { tone: 'celebrate', ms: 5000 });
        },
        () => {}, // offline: celebrate next time
      );
      return () => {
        gone = true;
      };
    }, [enabled, tick]),
  );
  return null;
}
