// Writes the widget's snapshot to the App Group this install has (see the Swift
// file). Only on iPhone builds that include this module; null everywhere else.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type WidgetStatus = { group: string | null; allowed: string[] | null; keychain: string[] | null; bundle: string | null };
type Native = { write(key: string, value: string): string | null; status(): string };

export const widgetStore = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('ForkbellWidgetStore') : null;

/** Whether the widget can share the app's numbers on this install; null without the module. */
export const widgetStatus = (): WidgetStatus | null => (widgetStore ? (JSON.parse(widgetStore.status()) as WidgetStatus) : null);
