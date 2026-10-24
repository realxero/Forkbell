import { Tabs, usePathname } from 'expo-router';
import { View } from 'react-native';
import { QuickBell } from '../../../components/QuickBell';
import { BellAvatar } from '../../../components/BellAvatar';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Platform, type ColorValue } from 'react-native';
import { color } from '../../../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
const icon = (on: IconName, off: IconName) =>
  function TabIcon({ color: c, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? on : off} size={size} color={c as string} />;
  };

export default function TabsLayout() {
  const path = usePathname();
  // Ask Bell floats over Food, Train and Progress (Bell has its own chat; Settings stays clean).
  const quickBell = !path.startsWith('/bell') && !path.startsWith('/settings');
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        headerShown: false,
        // The tab's own background from the first frame, not white.
        sceneStyle: { backgroundColor: color.chalk },
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.ironSoft,
        // Phones: leave height and padding out entirely, so the tab bar works out its own
        // height with the home-indicator space. (A height key set to undefined still
        // overrides it and the bar collapses to nothing.) The web gets room for the labels.
        tabBarStyle:
          Platform.OS === 'web'
            ? { backgroundColor: color.card, borderTopColor: color.line, height: 74, paddingTop: 6, paddingBottom: 12 }
            : { backgroundColor: color.card, borderTopColor: color.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', lineHeight: 15, marginTop: 2 },
        tabBarItemStyle: { paddingBottom: 2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Food', tabBarIcon: icon('restaurant', 'restaurant-outline') }} />
      <Tabs.Screen name="train" options={{ title: 'Train', tabBarIcon: icon('barbell', 'barbell-outline') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('stats-chart', 'stats-chart-outline') }} />
      <Tabs.Screen name="bell" options={{ title: 'Bell', tabBarIcon: ({ color: c, focused, size }) => <BellAvatar size={size + 2} tint={c as string} outline={!focused} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings', 'settings-outline') }} />
    </Tabs>
    {quickBell && <QuickBell />}
    </View>
  );
}
