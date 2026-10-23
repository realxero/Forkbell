import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { color, isDark, setWebAccent, setWebScheme, themeCss, applyNativeScheme, type AccentName, type SchemeChoice } from '../lib/theme';
import { initSync, readCache } from '../lib/sync';

export default function RootLayout() {
  const [scheme, setScheme] = useState<SchemeChoice>('system');
  useEffect(() => {
    // Light, dark, or follow the system: the saved choice on this device.
    initSync().then(() => {
      const choice = readCache<SchemeChoice>('device:theme') ?? 'system';
      setWebScheme(choice);
      setWebAccent(readCache<AccentName>('device:accent') ?? 'blue');
      applyNativeScheme(choice);
      setScheme(choice);
    });
  }, []);
  useEffect(() => {
    // Keep the web app on the device so it opens without a connection.
    if (Platform.OS === 'web' && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {Platform.OS === 'web' && <style>{themeCss()}</style>}
        <StatusBar style={isDark(scheme) ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.chalk } }} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
