import { useEffect } from 'react';
import { AccessibilityInfo, Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearProblems, discardHeld, flush, retryHeld, useSync } from '../lib/sync';
import { color, space, textSize } from '../lib/theme';

/**
 * A small pill near the bottom (clear of headers and the tab bar) when offline,
 * syncing, or something couldn't be saved. Hidden otherwise.
 */
export function SyncBanner() {
  const { online, serverError, syncing, pending, problems, held } = useSync();
  const insets = useSafeAreaInsets();
  // VoiceOver doesn't follow live regions (Android only): say what changed.
  const said = held.length ? `${held.length} ${held.length === 1 ? 'change' : 'changes'} couldn’t be saved` : problems.at(-1) ?? (!online ? 'Offline' : null);
  useEffect(() => {
    if (said) AccessibilityInfo.announceForAccessibility(said);
  }, [said]);
  if (held.length) {
    const what = held.length === 1 ? `“${held[0]}”` : `${held.length} changes`;
    return (
      <View style={[s.wrap, { bottom: insets.bottom + 96 }]} pointerEvents="box-none">
        <Pressable onPress={() => chooseHeld(what)} style={[s.pill, { backgroundColor: color.over }]} accessibilityLabel={`${what} couldn’t be saved. Choose to send again or discard.`}>
          <Text style={s.text}>{what} couldn’t be saved: the server keeps answering with an error. Tap to choose.</Text>
        </Pressable>
      </View>
    );
  }
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
  const text = !online && serverError
    ? `The server answered with an error · showing what’s saved on this device, which may be out of date${pending ? ` · ${pending} ${pending === 1 ? 'change' : 'changes'} waiting` : ''}`
    : !online
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

/** Send the set-aside changes again, or discard them. Keeping them is the safe default. */
function chooseHeld(what: string) {
  const message = `The server answered ${what} with an error several times, so it was set aside to let your other changes through. If the server has been fixed, send it again.`;
  if (Platform.OS === 'web') {
    if (window.confirm(`Send ${what} again?\n\n${message}`)) void retryHeld();
    else if (window.confirm(`Discard ${what}? This can’t be undone.`)) discardHeld();
    return;
  }
  Alert.alert(`${what} couldn’t be saved`, message, [
    { text: 'Keep for now', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: () => Alert.alert(`Discard ${what}?`, 'This can’t be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: discardHeld }]) },
    { text: 'Send again', onPress: () => void retryHeld() },
  ]);
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 100 },
  pill: { borderRadius: 20, paddingHorizontal: space(4), paddingVertical: space(2), maxWidth: 360, opacity: 0.95 },
  text: { color: color.onAccent, fontWeight: '700', fontSize: textSize.small, textAlign: 'center' },
});
