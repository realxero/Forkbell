import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { color } from '../../../lib/theme';

// Food, training and progress. Glyphs keep it free of icon fonts.
const icon = (glyph: string) =>
  function TabIcon({ color: c }: { color: ColorValue }) {
    return <Text style={{ fontSize: 20, color: c }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.iron,
        tabBarInactiveTintColor: color.ironSoft,
        tabBarStyle: { backgroundColor: color.card, borderTopColor: color.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Food', tabBarIcon: icon('🍽') }} />
      <Tabs.Screen name="train" options={{ title: 'Train', tabBarIcon: icon('🏋') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('📈') }} />
      <Tabs.Screen name="bell" options={{ title: 'Bell', tabBarIcon: icon('🔔') }} />
    </Tabs>
  );
}
