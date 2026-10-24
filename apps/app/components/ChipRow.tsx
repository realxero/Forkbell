import { Platform, ScrollView, View } from 'react-native';
import { space } from '../lib/theme';

/**
 * A row of chips. On phones it scrolls sideways with a swipe; on the web
 * (where a mouse can't swipe sideways) the chips wrap onto more lines instead.
 */
export function ChipRow({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web') return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>{children}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
      {children}
    </ScrollView>
  );
}
