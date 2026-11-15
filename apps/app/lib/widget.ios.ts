// Today's numbers for the home and lock screen widget (targets/widget). The
// snapshot lives in the App Group shared with the widget; it's rewritten when
// it changes, then the widget is asked to redraw.
import { ExtensionStorage } from '@bacons/apple-targets';
import type { WidgetToday } from './widget';

export type { WidgetToday } from './widget';

const storage = new ExtensionStorage('group.com.realxero.forkbell');
let last = '';

export function updateWidget(today: WidgetToday): void {
  const json = JSON.stringify(today);
  if (json === last) return;
  last = json;
  try {
    storage.set('today', json);
    ExtensionStorage.reloadWidget('today');
  } catch {
    // An install without the App Group (some sideloaders strip it): no widget, nothing else changes.
  }
}
