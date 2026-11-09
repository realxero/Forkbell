// Viewing someone who shared their data with you. Kept on this device; the
// server checks the share on every request.
import { useEffect, useState } from 'react';

/** `permissions` is what the share allows (e.g. 'food_write' for "Log food for me"). */
export type Viewing = { id: string; name: string; permissions?: string[] } | null;
let viewing: Viewing = null;
const listeners = new Set<() => void>();

// Routes that can show someone else's data; everything else is always yours.
const SHAREABLE = ['/api/diary', '/api/foods', '/api/meals', '/api/recipes', '/api/workouts', '/api/exercises', '/api/programs', '/api/routines', '/api/progress', '/api/wellbeing', '/api/plans'];
export const isShareable = (path: string) => SHAREABLE.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));

/** Whether food can be added or changed: always for your own diary, for someone else's only with "Log food for me". */
export const canLogFood = (v: Viewing) => !v || Boolean(v.permissions?.includes('food_write'));

export function getViewing() {
  return viewing;
}
export function setViewing(v: Viewing) {
  viewing = v;
  listeners.forEach((l) => l());
}
export function useViewing() {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return viewing;
}
