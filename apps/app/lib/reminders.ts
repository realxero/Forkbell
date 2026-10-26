// Smart reminders on the phone. Local notifications only: they're scheduled on
// this device, nothing is sent through a push server. Replanned whenever the
// app opens or you log something, so a meal you've logged loses its nudge and
// a dose you've ticked off loses its reminder.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { planMedReminders, planReminders, reminderText, todayLocal, usualFinishTime, usualMealTimes, type DiaryDay, type Meal, type MedForReminders } from '@forkbell/shared';
import { cachedGet, readCache, send, writeCache } from './sync';
import { getViewing } from './profile';
import { showToast } from './toast';

/** meds: the times you set on each medication. rest: a buzz when the rest timer ends. */
export type ReminderSettings = { meals: boolean; finish: boolean; meds: boolean; rest: boolean };
const KEY = 'device:reminders';
const PREFIX = 'forkbell-';

export const remindersSupported = Platform.OS !== 'web';
export const reminderSettings = (): ReminderSettings => ({ meals: false, finish: false, meds: true, rest: true, ...readCache<Partial<ReminderSettings>>(KEY) });

/** The rest timer's alert; it has its own id so replanning the reminders never cancels it. */
export const REST_ID = 'rest-timer';
const MED_CATEGORY = 'forkbell-med';

if (remindersSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async (n) =>
      n.request.identifier === REST_ID
        ? // The workout screen shows the rest ending itself; this one is for a locked phone.
          { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }
        : // Show a reminder even when it arrives while Forkbell is open.
          { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false },
  });
  // Taken / Skip right on a medication reminder.
  void Notifications.setNotificationCategoryAsync(MED_CATEGORY, [
    { identifier: 'taken', buttonTitle: 'Taken', options: { opensAppToForeground: true } },
    { identifier: 'skipped', buttonTitle: 'Skip this dose', options: { opensAppToForeground: true } },
  ]).catch(() => {});
}

/** Ask for notifications if they aren't on yet. Returns a message when they're off. */
export async function askForNotifications(): Promise<string | null> {
  if (!remindersSupported) return 'Reminders work in the iPhone and Android apps.';
  const have = await Notifications.getPermissionsAsync();
  const ok = have.granted || (have.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  return ok ? null : 'Notifications are off for Forkbell. You can turn them on in Settings, Notifications.';
}

/** Save the switches, asking for notification permission the first time one is turned on. */
export async function setReminderSettings(next: ReminderSettings): Promise<string | null> {
  if (!remindersSupported) return 'Reminders work in the iPhone and Android apps.';
  const was = reminderSettings();
  const turnedOn = (Object.keys(next) as (keyof ReminderSettings)[]).some((k) => next[k] && !was[k]);
  if (turnedOn) {
    const off = await askForNotifications();
    if (off) return off;
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
  if (!settings.meals && !settings.finish && !settings.meds) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  if (settings.meds) await planMeds().catch(() => {});
  if (!settings.meals && !settings.finish) return;

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

type MedsResponse = { today: string; medications: (MedForReminders & { timesPerDay: number })[] };

/** Medication reminders at the times you set, for today and the next two days. */
async function planMeds() {
  const today = todayLocal();
  const w = await cachedGet<MedsResponse>(`/api/wellbeing?today=${today}`).catch(() => readCache<MedsResponse>(`/api/wellbeing?today=${today}`) ?? null);
  const meds = (w?.medications ?? []).filter((m) => Array.isArray(m.reminderTimes)); // an older server sends no times
  const now = new Date();
  for (const d of planMedReminders({ meds, today, nowMinutes: now.getHours() * 60 + now.getMinutes() })) {
    const [y, m, day] = d.date.split('-').map(Number) as [number, number, number];
    const when = new Date(y, m - 1, day, Math.floor(d.minutes / 60), d.minutes % 60);
    if (when.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: d.id,
      content: {
        title: d.title,
        body: d.body,
        sound: 'default',
        categoryIdentifier: MED_CATEGORY,
        data: { url: '/progress', kind: 'med', medicationId: d.medicationId, slot: d.slot, date: d.date, name: meds.find((x) => x.id === d.medicationId)?.name ?? '' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    }).catch(() => {});
  }
}

// Tapping a reminder (or one of its buttons) -----------------------------------
const handled = new Set<string>();

async function onResponse(r: Notifications.NotificationResponse) {
  const key = `${r.notification.request.identifier}:${r.actionIdentifier}:${r.notification.date}`;
  if (handled.has(key)) return;
  handled.add(key);
  const data = (r.notification.request.content.data ?? {}) as { url?: string; kind?: string; medicationId?: string; slot?: number; date?: string; name?: string };
  if (data.kind === 'med' && (r.actionIdentifier === 'taken' || r.actionIdentifier === 'skipped') && data.medicationId && data.date) {
    const status = r.actionIdentifier;
    try {
      await send('PUT', '/api/wellbeing/medication-logs', { medicationId: data.medicationId, date: data.date, slot: data.slot ?? 0, status }, { label: `${data.name || 'Medication'} dose`, coalesceKey: `dose:${data.medicationId}:${data.date}:${data.slot ?? 0}` });
      showToast(`${data.name || 'Medication'}: ${status === 'taken' ? 'marked taken' : 'skipped this dose'}`);
    } catch (e) {
      showToast(`Couldn’t save that dose: ${e instanceof Error ? e.message : String(e)}`);
    }
    void refreshReminders().catch(() => {});
    return;
  }
  if (data.url) router.push(data.url as Href);
}

/** Start handling reminder taps, including the one that opened the app. Returns a stop function. */
export function listenForReminderTaps(): () => void {
  if (!remindersSupported) return () => {};
  void Notifications.getLastNotificationResponseAsync().then((r) => r && onResponse(r), () => {});
  const sub = Notifications.addNotificationResponseReceivedListener((r) => void onResponse(r));
  return () => sub.remove();
}

// The rest timer --------------------------------------------------------------

/** Buzz when the rest ends, even with the phone locked. Replaces any earlier one. */
export async function scheduleRestAlert(endsAt: number, next: string | null) {
  if (!remindersSupported || !reminderSettings().rest) return;
  await cancelRestAlert();
  const seconds = Math.round((endsAt - Date.now()) / 1000);
  if (seconds < 3) return;
  const perm = await Notifications.getPermissionsAsync().catch(() => null);
  if (!perm?.granted) {
    // Asked once, the first time a rest starts; after that it's up to Settings.
    if (!perm?.canAskAgain || readCache<boolean>('device:rest-asked')) return;
    writeCache('device:rest-asked', true);
    if (!(await Notifications.requestPermissionsAsync()).granted) return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: REST_ID,
    content: { title: 'Rest over', body: next ? `Next up: ${next}` : 'Time for your next set.', sound: 'default', data: { kind: 'rest' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  }).catch(() => {});
}

export async function cancelRestAlert() {
  if (!remindersSupported) return;
  await Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => {});
}

// Not under PREFIX: refreshReminders() clears those, and this one must survive it.
const FAST_ID = 'fast-goal';
/** A buzz when a fast reaches its goal, even with Forkbell closed. Nothing for a fast that's over. */
export async function scheduleFastAlert(f: { startedAt: string; endedAt: string | null; targetHours: number } | null) {
  if (!remindersSupported) return;
  await Notifications.cancelScheduledNotificationAsync(FAST_ID).catch(() => {});
  if (!f || f.endedAt) return;
  const seconds = Math.round((Date.parse(f.startedAt) + f.targetHours * 3_600_000 - Date.now()) / 1000);
  if (seconds < 5) return;
  const perm = await Notifications.getPermissionsAsync().catch(() => null);
  if (!perm?.granted) {
    if (!perm?.canAskAgain || readCache<boolean>('device:fast-asked')) return;
    writeCache('device:fast-asked', true);
    if (!(await Notifications.requestPermissionsAsync()).granted) return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: FAST_ID,
    content: { title: `${f.targetHours} hours: fast complete`, body: 'End it in Forkbell whenever you’re ready to eat.', sound: 'default', data: { kind: 'fast', url: '/' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  }).catch(() => {});
}
