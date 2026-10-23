// A light touch of feedback for the moments that matter: a set ticked, food
// logged, rest over, a day finished, a celebration. Phones only, and it can be
// switched off in Settings. Kept rare on purpose so each one means something.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { readCache, writeCache } from './sync';

const KEY = 'device:haptics';
export const hapticsSupported = Platform.OS === 'ios' || Platform.OS === 'android';
export const hapticsOn = () => hapticsSupported && readCache<boolean>(KEY) !== false;
export const setHapticsOn = (on: boolean) => writeCache(KEY, on);

const run = (f: () => Promise<void>) => {
  if (hapticsOn()) f().catch(() => {});
};

export const haptic = {
  /** a small tap: a set ticked, a choice made */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** something worked: food logged, a day finished, a goal reached */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** time's up: rest over */
  alert: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
