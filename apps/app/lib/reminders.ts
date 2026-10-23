// Smart reminders on the phone. Local notifications only: they're scheduled on
// this device, nothing is sent through a push server. Replanned whenever the
// app opens or you log something, so a meal you've logged loses its nudge.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { planReminders, reminderText, todayLocal, usualFinishTime, usualMealTimes, type DiaryDay, type Meal } from '@forkbell/shared';
import { cachedGet, readCache, writeCache } from './sync';
import { getViewing } from './profile';

export type ReminderSettings = { meals: boolean; finish: boolean };
const KEY = 'device:reminders';
const PREFIX = 'forkbell-';

export const remindersSupported = Platform.OS !== 'web';
export const reminderSettings = (): ReminderSettings => readCache<ReminderSettings>(KEY) ?? { meals: false, finish: false };

if (remindersSupported) {
  // Show a reminder even when it arrives while Forkbell is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/** Save the switches, asking for notification permission the first time one is turned on. */
export async function setReminderSettings(next: ReminderSettings): Promise<string | null> {
  if (!remindersSupported) return 'Reminders work in the iPhone and Android apps.';
  if (next.meals || next.finish) {
    const have = await Notifications.getPermissionsAsync();
    const ok = have.granted || (have.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!ok) return 'Notifications are off for Forkbell. You can turn them on in Settings, Notifications.';
  }
  writeCache(KEY, next);
  await refreshReminders();
  return null;
}

const localMinutes = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/** Replace this device's Forkbell reminders with a fresh plan. Safe to call any time. */
export async function refreshReminders(): Promise<void> {
  if (!remindersSupported) return;
  // While viewing someone who shared with you, their diary isn't yours to be reminded about.
  if (getViewing()) return;
  const settings = reminderSettings();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(scheduled.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!settings.meals && !settings.finish) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const today = todayLocal();
  const day = await cachedGet<DiaryDay>(`/api/diary/${today}`).catch(() => readCache<DiaryDay>(`/api/diary/${today}`) ?? null);
  const habits = await cachedGet<{ firsts: { date: string; meal: string; at: string }[]; finished: { date: string; at: string }[] }>('/api/diary/habits').catch(() => null);
  if (!habits) return; // an older server, or never online yet: no reminders rather than wrong ones

  const now = new Date();
  const plan = planReminders({
    today,
    nowMinutes: now.getHours() * 60 + now.getMinutes(),
    usual: usualMealTimes(habits.firsts.map((f) => ({ date: f.date, meal: f.meal, minutes: localMinutes(f.at) }))),
    finishAt: usualFinishTime(habits.finished.map((f) => localMinutes(f.at))),
    loggedToday: [...new Set((day?.entries ?? []).map((e) => e.meal))] as Meal[],
    finishedToday: Boolean(day?.complete),
    meals: settings.meals,
    finish: settings.finish,
  });
  for (const r of plan) {
    const [y, m, d] = r.date.split('-').map(Number) as [number, number, number];
    const when = new Date(y, m - 1, d, Math.floor(r.minutes / 60), r.minutes % 60);
    if (when.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { ...reminderText(r), data: { url: '/' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    }).catch(() => {});
  }
}
