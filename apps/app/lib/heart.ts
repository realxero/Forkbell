// The heart-rate sensor you picked (Settings → Training setup), kept on this
// phone, and a live reading from it during a workout.
import { useEffect, useState } from 'react';
import { connectHeartSensor, disconnectHeartSensor, heartSensorSupported, onHeartRate, onHeartState, type HeartReading, type HeartState } from '../modules/forkbell-heart';
import { readCache, writeCache } from './sync';

const KEY = 'device:heart-sensor';
export type SavedSensor = { id: string; name: string };

export const savedHeartSensor = (): SavedSensor | null => (heartSensorSupported ? readCache<SavedSensor>(KEY) ?? null : null);
export const saveHeartSensor = (s: SavedSensor | null) => writeCache(KEY, s);

/** While `active`, stay connected to the saved sensor; the newest reading and the connection state. */
export function useLiveHeartRate(active: boolean): { reading: HeartReading | null; state: HeartState | 'none' } {
  const sensor = active ? savedHeartSensor() : null;
  const [reading, setReading] = useState<HeartReading | null>(null);
  const [state, setState] = useState<HeartState | 'none'>(sensor ? 'connecting' : 'none');
  useEffect(() => {
    if (!sensor) return;
    const a = onHeartRate(setReading);
    const b = onHeartState(setState);
    connectHeartSensor(sensor.id);
    return () => {
      a.remove();
      b.remove();
      disconnectHeartSensor();
    };
  }, [sensor?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { reading, state };
}
