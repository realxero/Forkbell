// Today's numbers for the iPhone home and lock screen widget (widget.ios.ts).
// Other platforms have no widget yet, so this does nothing.
export type { WidgetToday } from '@forkbell/shared';
import type { WidgetToday } from '@forkbell/shared';

export function updateWidget(_today: WidgetToday): void {}

/** Keep the widget fresh while the app is closed (iPhone only). */
export function startWidgetRefresh(): void {}
