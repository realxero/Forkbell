// Writes the widget's snapshot to the App Group this install has (see the Swift
// file). Only on iPhone builds that include this module; null everywhere else.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Native = { write(key: string, value: string): string | null };

export const widgetStore = Platform.OS === 'ios' ? requireOptionalNativeModule<Native>('ForkbellWidget') : null;
