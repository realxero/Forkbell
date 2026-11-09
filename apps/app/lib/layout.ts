// Screen width for layout. Phones never cross either line.
// - Sidebar (768, an iPad in portrait or a small window): the tabs become a
//   sidebar with Tools in it, instead of a phone tab bar stretched across.
// - Wide (1024, an iPad in landscape or a desktop browser): pages that have
//   more to show (Progress, Tools) use columns.
import { useWindowDimensions } from 'react-native';

export const SIDEBAR = 768;
export const WIDE = 1024;
export const useSidebar = () => useWindowDimensions().width >= SIDEBAR;
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
