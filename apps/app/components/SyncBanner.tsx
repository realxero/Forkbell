import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearProblems, flush, useSync } from '../lib/sync';
import { color, space } from '../lib/theme';

/**
 * A small pill near the bottom (clear of headers and the tab bar) when offline,
 * syncing, or something couldn't be saved. Hidden otherwise.
 */
export function SyncBanner() {
  const { online, syncing, pending, problems } = useSync();
  const insets = useSafeAreaInsets();
  if (problems.length) {
    return (
      <View style={[s.wrap, { bottom: insets.bottom + 96 }]} pointerEvents="box-none">
        <Pressable onPress={clearProblems} style={[s.pill, { backgroundColor: color.over }]}>
          <Text style={s.text}>{problems.at(-1)} Tap to dismiss.</Text>
        </Pressable>
      </View>
    );
  }
  if (online && !pending) return null;
  const text = !online
    ? pending
      ? `Offline · ${pending} ${pending === 1 ? 'change' : 'changes'} saved on this device`
      : 'Offline · showing what’s saved on this device'
    : syncing
      ? `Syncing ${pending} ${pending === 1 ? 'change' : 'changes'}…`
      : `${pending} ${pending === 1 ? 'change' : 'changes'} waiting to sync`;
  return (
    <View style={[s.wrap, { bottom: insets.bottom + 96 }]} pointerEvents="box-none">
      <Pressable onPress={() => void flush()} style={[s.pill, { backgroundColor: online ? color.protein : color.iron }]} accessibilityRole="button" accessibilityLabel={`${text}. Tap to try now.`}>
        <Text style={s.text}>{text}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  pill: { borderRadius: 20, paddingHorizontal: space(4), paddingVertical: space(2), maxWidth: 360, opacity: 0.95 },
  text: { color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
});
