// The dimmed backdrop and the card of every pop-up sheet and dialog. Each
// screen keeps its own Modal (and keyboard handling) and puts this inside it:
//
//   <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
//     <SheetFrame onClose={close}>…</SheetFrame>
//   </Modal>
//
// kind="sheet" (the default) rises from the bottom, up to 640 wide, and keeps
// its last row clear of the iPhone's home bar. kind="dialog" sits in the
// middle, up to 440 wide (the calendar, renaming, small choices).
//
// Tapping the dimmed area closes it. The backdrop is a separate layer behind
// the card, not a wrapper around it, so VoiceOver and TalkBack can reach every
// button inside; the card is marked modal, and VoiceOver's escape gesture
// (a two-finger Z) closes it.
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Tap';
import { color, radius, space } from '../lib/theme';

type Props = {
  onClose: () => void;
  kind?: 'sheet' | 'dialog';
  /** Only what this sheet does differently: a fixed height, a tighter gap. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function SheetFrame({ onClose, kind = 'sheet', style, children }: Props) {
  const insets = useSafeAreaInsets();
  const dialog = kind === 'dialog';
  return (
    <View style={[s.backdrop, dialog && s.centred]}>
      <Pressable feedback={false} style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View
        style={[dialog ? s.dialog : [s.sheet, { paddingBottom: Math.max(space(8), insets.bottom + space(4)) }], style]}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  centred: { justifyContent: 'center', padding: space(4) },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), gap: space(3), width: '100%', maxWidth: 640, alignSelf: 'center', maxHeight: '92%' },
  dialog: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), width: '100%', maxWidth: 440, alignSelf: 'center' },
});
