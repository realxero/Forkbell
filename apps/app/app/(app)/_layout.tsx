import { ActivityIndicator } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { color } from '../../lib/theme';

export default function SignedInLayout() {
  const { status } = useAuth();
  if (status === 'loading') return <ActivityIndicator style={{ flex: 1 }} color={color.iron} />;
  if (status === 'signedOut') return <Redirect href="/login" />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.chalk } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="edit" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
