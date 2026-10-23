import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { todayLocal } from '@forkbell/shared';
import { warmCache } from '../../lib/sync';
import { SyncBanner } from '../../components/SyncBanner';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { color } from '../../lib/theme';

export default function SignedInLayout() {
  const { status } = useAuth();
  useEffect(() => {
    if (status === 'signedIn') void warmCache(todayLocal());
  }, [status]);
  if (status === 'loading') return <ActivityIndicator style={{ flex: 1 }} color={color.iron} />;
  if (status === 'signedOut') return <Redirect href="/login" />;
  return (
    <View style={{ flex: 1 }}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.chalk } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="edit" options={{ presentation: 'modal' }} />
    </Stack>
    <SyncBanner />
    </View>
  );
}
