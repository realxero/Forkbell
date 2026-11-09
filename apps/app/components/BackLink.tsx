// "‹ Back" at the top of a page. One component so it sits in the same place
// on every page: hitSlop gives it a 44 pt reach without pushing the title down.
import { Text, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Pressable } from './Tap';
import { color, textSize } from '../lib/theme';

export function BackLink({ onPress = () => router.back(), style }: { onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={[{ alignSelf: 'flex-start' }, style]} accessibilityLabel="Back">
      <Text style={{ color: color.accent, fontWeight: '700', fontSize: textSize.body }}>‹ Back</Text>
    </Pressable>
  );
}
