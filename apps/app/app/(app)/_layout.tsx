import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { todayLocal } from '@forkbell/shared';
import { warmCache } from '../../lib/sync';
import { AppState } from 'react-native';
import { healthSupported, syncHealth } from '../../lib/health-sync';
import { refreshReminders } from '../../lib/reminders';
import { followSystemScheme } from '../../lib/theme';
import { SyncBanner } from '../../components/SyncBanner';
import { ProfileBar } from '../../components/ProfileBar';
import { ToastHost } from '../../components/ToastHost';
import { Redirect, Stack, usePathname } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { color } from '../../lib/theme';

export default function SignedInLayout() {
  const { status, me } = useAuth();
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;
  useEffect(() => {
    if (status === 'signedIn') void warmCache(todayLocal());
    if (status !== 'signedIn') return;
    // Replan reminders whenever the app comes back: a new day, or food logged elsewhere.
    void refreshReminders().catch(() => {});
    const remind = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void refreshReminders().catch(() => {});
      // The system went light/dark while away: refresh the colours, unless mid-workout.
      if (!pathRef.current.startsWith('/workout')) void followSystemScheme().catch(() => {});
    });
    if (!healthSupported) return () => remind.remove();
    void syncHealth();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncHealth());
    return () => {
      sub.remove();
      remind.remove();
    };
  }, [status]);
  if (status === 'loading') return <ActivityIndicator style={{ flex: 1 }} color={color.iron} />;
  if (status === 'signedOut') return <Redirect href="/login" />;
  // First launch (or never set up): the setup wizard, once. Skip counts as done.
  if (me && !me.preferences.onboarded && path !== '/onboarding') return <Redirect href="/onboarding" />;
  return (
    <View style={{ flex: 1 }}>
    <ProfileBar />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.chalk } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="edit" options={{ presentation: 'modal' }} />
    </Stack>
    <SyncBanner />
    <ToastHost />
    </View>
  );
}
