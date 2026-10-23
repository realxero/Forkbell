import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { todayLocal } from '@forkbell/shared';
import { warmCache } from '../../lib/sync';
import { AppState } from 'react-native';
import { healthSupported, syncHealth } from '../../lib/health-sync';
import { SyncBanner } from '../../components/SyncBanner';
import { ProfileBar } from '../../components/ProfileBar';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { color } from '../../lib/theme';

export default function SignedInLayout() {
  const { status } = useAuth();
  useEffect(() => {
    if (status === 'signedIn') void warmCache(todayLocal());
    if (status !== 'signedIn' || !healthSupported) return;
    void syncHealth();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncHealth());
    return () => sub.remove();
  }, [status]);
  if (status === 'loading') return <ActivityIndicator style={{ flex: 1 }} color={color.iron} />;
  if (status === 'signedOut') return <Redirect href="/login" />;
  return (
    <View style={{ flex: 1 }}>
    <ProfileBar />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.chalk } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="edit" options={{ presentation: 'modal' }} />
    </Stack>
    <SyncBanner />
    </View>
  );
}
