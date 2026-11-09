// Screen width for layout. Wide (a desktop browser, an iPad in landscape)
// gets the sidebar instead of the tab bar, and pages that have more to show
// use the room. Phones never cross it.
import { useWindowDimensions } from 'react-native';

export const WIDE = 1024;
export const useWide = () => useWindowDimensions().width >= WIDE;

// Simple or Advanced (Tools, Progress on a wide screen): one setting on this
// device, so changing it on one screen changes it on every screen that's open.
import { useEffect, useState } from 'react';
import { readCache, writeCache } from './sync';

const DETAIL = 'device:tools-detail';
const detailListeners = new Set<() => void>();
export function useAdvanced(): [boolean, (on: boolean) => void] {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    detailListeners.add(l);
    return () => void detailListeners.delete(l);
  }, []);
  const set = (on: boolean) => {
    writeCache(DETAIL, on);
    detailListeners.forEach((l) => l());
  };
  return [readCache<boolean>(DETAIL) ?? false, set];
}
