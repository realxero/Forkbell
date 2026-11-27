import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { instant, type Workout } from '@forkbell/shared';
import { formatDuration } from '../lib/units';

/** A workout's running time, ticking every second while its screen is showing (only this text redraws). */
export function Elapsed({ startedAt, finishedAt = null }: Pick<Workout, 'startedAt'> & { finishedAt?: string | null }) {
  const [now, setNow] = useState(Date.now());
  useFocusEffect(
    useCallback(() => {
      if (finishedAt) return;
      setNow(Date.now());
      const t = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(t);
    }, [finishedAt]),
  );
  const secs = Math.max(0, Math.floor(((finishedAt ? instant(finishedAt) : now) - instant(startedAt)) / 1000)) || 0;
  return <>{finishedAt ? `Finished · ${formatDuration(secs)}` : formatDuration(secs)}</>;
}
