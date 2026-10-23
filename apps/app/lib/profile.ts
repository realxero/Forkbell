// Viewing someone who shared their data with you. Kept on this device; the
// server checks the share on every request.
import { useEffect, useState } from 'react';

export type Viewing = { id: string; name: string } | null;
let viewing: Viewing = null;
const listeners = new Set<() => void>();

// Routes that can show someone else's data; everything else is always yours.
const SHAREABLE = ['/api/diary', '/api/foods', '/api/meals', '/api/recipes', '/api/workouts', '/api/exercises', '/api/programs', '/api/routines', '/api/progress', '/api/wellbeing'];
export const isShareable = (path: string) => SHAREABLE.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));

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
