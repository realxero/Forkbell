// Reduce Motion: when it's on in the phone's (or computer's) settings, Bell
// stops bobbing and blinking and celebrations skip the confetti.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

let current = false;
const listeners = new Set<(v: boolean) => void>();
const set = (v: boolean) => {
  current = v;
  for (const l of listeners) l(v);
};

if (Platform.OS === 'web') {
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    current = mq.matches;
    mq.addEventListener?.('change', (e) => set(e.matches));
  }
} else {
  AccessibilityInfo.isReduceMotionEnabled().then(set, () => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

export const reduceMotion = () => current;

export function useReduceMotion() {
  const [still, setStill] = useState(current);
  useEffect(() => {
    listeners.add(setStill);
    setStill(current);
    return () => void listeners.delete(setStill);
  }, []);
  return still;
}
