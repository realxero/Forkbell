import { Text, View } from 'react-native';
import { foodEmoji } from '@forkbell/shared';
import { color } from '../lib/theme';

/** The little picture beside a food: an emoji picked from its name. */
export function FoodIcon({ name, brand, size = 40 }: { name: string; brand?: string | null; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.52 }}>{foodEmoji(name, brand)}</Text>
    </View>
  );
}
