// Today's numbers for the home and lock screen widget (targets/widget). The
// snapshot lives in the App Group shared with the widget; it's rewritten when
// it changes, then the widget is asked to redraw.
import { ExtensionStorage } from '@bacons/apple-targets';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { todayLocal, type DiaryDay, type Me, type WaterDay } from '@forkbell/shared';
import { api, loadConnection } from './api';
import { onSyncChange, waitingNow } from './sync';
import { widgetStore } from '../modules/forkbell-widget';
import { widgetToday } from '@forkbell/shared';
import type { WidgetToday } from './widget';

export type { WidgetToday } from './widget';

let last = '';
let shown: WidgetToday | null = null;

export function updateWidget(today: WidgetToday): void {
  shown = today;
  // pending: changes not on the server yet, so the widget keeps these numbers over the server's until they're sent.
  const json = JSON.stringify({ ...today, pending: waitingNow().count > 0 });
  if (json === last) return;
  last = json;
  try {
    // The native module finds the group a re-signed install really has; older builds without it use the built-in name.
    if (widgetStore) widgetStore.write('today', json);
    else {
      new ExtensionStorage('group.com.realxero.forkbell').set('today', json);
      ExtensionStorage.reloadWidget('today');
    }
  } catch {
    // An install without the App Group (some sideloaders strip it): no widget, nothing else changes.
  }
}

// Once the outbox empties, say so, and the widget goes back to asking the server.
onSyncChange(() => shown && updateWidget(shown));

// Now and then while the app is closed, iOS wakes it briefly to fetch today and
// redraw the widget, so food logged elsewhere (Shortcuts, the web, another phone)
// shows up. iOS picks the times: usually every hour or so, less on low battery.
const TASK = 'forkbell-widget-refresh';

TaskManager.defineTask(TASK, async () => {
  try {
    await loadConnection();
    const date = todayLocal();
    // Always your own day, even if you were last looking at someone else's.
    const own = { headers: { 'x-forkbell-profile': '' } };
    const [me, day, water] = await Promise.all([
      api<Me>('/api/me', own),
      api<DiaryDay>(`/api/diary/${date}`, own),
      api<WaterDay>(`/api/wellbeing/water/${date}`, own).catch(() => null),
    ]);
    updateWidget(widgetToday(day, me, water));
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // Offline, signed out, or the phone is locked (the sign-in is kept locked away until you unlock).
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

let started = false;
export function startWidgetRefresh(): void {
  if (started) return;
  started = true;
  void BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 30 }).catch(() => {});
}
