// Short messages at the bottom of the screen, with an optional action
// ("Undo"). One at a time; a new one replaces the old.
import { useEffect, useState } from 'react';

export type Toast = { id: number; text: string; action?: { label: string; run: () => void | Promise<void> }; tone?: 'normal' | 'celebrate' };
let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
let n = 0;

export function showToast(text: string, opts: { action?: Toast['action']; tone?: Toast['tone']; ms?: number } = {}) {
  current = { id: ++n, text, action: opts.action, tone: opts.tone };
  listeners.forEach((l) => l());
  if (timer) clearTimeout(timer);
  timer = setTimeout(dismissToast, opts.ms ?? (opts.action ? 6000 : 3500));
}
export function dismissToast() {
  current = null;
  listeners.forEach((l) => l());
}
export function useToast() {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((x) => x + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return current;
}
