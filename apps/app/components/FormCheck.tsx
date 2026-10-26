import { createElement, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getServerUrl } from '../lib/api';
import { color, nativeScheme, space, type } from '../lib/theme';

export type FormCheckResult = { exercise: string; reps: number; goodReps: number; summary: string[]; pattern: string };

/**
 * Form check: the camera page from your server (/form/), shown full screen.
 * The pose tracking runs inside that page on the phone; the video is never
 * uploaded. When a set is finished the page sends back the rep count and notes.
 */
export function FormCheck({ exercise, onClose, onResult }: { exercise: string | null; onClose: () => void; onResult: (r: FormCheckResult) => void }) {
  const [last, setLast] = useState<FormCheckResult | null>(null);
  const base = Platform.OS === 'web' ? window.location.origin : (getServerUrl() ?? '');
  // The page matches Forkbell's look: the light/dark setting and the accent colour.
  const url = exercise ? `${base.replace(/\/$/, '')}/form/index.html?ex=${encodeURIComponent(exercise)}&${lookParams()}` : '';
  const take = (data: unknown) => {
    const d = (typeof data === 'string' ? safeParse(data) : data) as FormCheckResult & { type?: string };
    if (d?.type !== 'forkbell-form') return;
    setLast(d);
    onResult(d);
  };

  // On the web the page is an iframe on the same origin; its result comes as a message.
  useEffect(() => {
    if (Platform.OS !== 'web' || !exercise) return;
    const on = (e: MessageEvent) => e.origin === window.location.origin && take(e.data);
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise]);
  useEffect(() => setLast(null), [exercise]);

  if (!exercise) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {/* A modal is its own screen: it needs its own safe-area measurements, or the top sits under the clock. */}
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: color.chalk }} edges={['top', 'bottom']}>
        <View style={s.head}>
          <Text style={type.title}>Form check</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Back to the workout">
            <Text style={s.link}>{last ? 'Done' : 'Close'}</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          {Platform.OS === 'web' ? (
            createElement('iframe', { src: url, title: 'Form check camera', allow: 'camera', style: { border: 0, width: '100%', height: '100%' } })
          ) : (
            <NativePage url={url} onMessage={take} />
          )}
        </View>
        {last && (
          <View style={s.bar}>
            <Ionicons name="checkmark-circle" size={20} color={color.fat} />
            <Text style={[type.body, { flex: 1 }]}>{last.reps} reps sent to your workout.</Text>
          </View>
        )}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** The phone app shows the page in a web view that may use the camera. */
function NativePage({ url, onMessage }: { url: string; onMessage: (data: string) => void }) {
  // Loaded only on phones, so the web build never pulls in the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WebView } = require('react-native-webview') as typeof import('react-native-webview');
  return (
    <WebView
      source={{ uri: url }}
      onMessage={(e) => onMessage(e.nativeEvent.data)}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      mediaCapturePermissionGrantType="grant"
      javaScriptEnabled
      originWhitelist={[new URL(url).origin]}
      style={{ flex: 1, backgroundColor: 'transparent' }}
    />
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space(4), paddingVertical: space(2) },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space(2), padding: space(4), borderTopWidth: 1, borderTopColor: color.line },
});

/** "theme=dark&accent=%235C9BFF": how Forkbell looks right now, for the camera page. */
function lookParams() {
  if (Platform.OS !== 'web') return `theme=${nativeScheme}&accent=${encodeURIComponent(color.accent)}`;
  const root = document.documentElement;
  const set = root.getAttribute('data-theme');
  const dark = set ? set === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  const accent = getComputedStyle(root).getPropertyValue('--fb-accent').trim();
  return `theme=${dark ? 'dark' : 'light'}${/^#[0-9a-fA-F]{6}$/.test(accent) ? `&accent=${encodeURIComponent(accent)}` : ''}`;
}
