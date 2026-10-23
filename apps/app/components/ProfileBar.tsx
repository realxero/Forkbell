import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setViewing, useViewing } from '../lib/profile';
import { color, space } from '../lib/theme';

/** A bar across the top whenever you're looking at someone else's data. */
export function ProfileBar() {
  const v = useViewing();
  const insets = useSafeAreaInsets();
  if (!v) return null;
  return (
    <View style={[s.bar, { paddingTop: insets.top + space(1) }]}>
      <Text style={s.text} numberOfLines={1}>Viewing {v.name}’s data</Text>
      <Pressable onPress={() => { setViewing(null); router.replace('/'); }} hitSlop={10} accessibilityRole="button">
        <Text style={[s.text, { textDecorationLine: 'underline' }]}>Back to mine</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { backgroundColor: color.protein, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space(4), paddingBottom: space(2), gap: space(3) },
  text: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
