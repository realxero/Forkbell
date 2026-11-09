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
// Tapping the dimmed area closes it, and a sheet can be pulled down by its
// grabber, the way iPhone sheets close. Only the grabber strip takes the drag,
// so lists and fields inside the sheet keep their own scrolling.
//
// The backdrop is a separate layer behind the card, not a wrapper around it, so VoiceOver and TalkBack can reach every
// button inside; the card is marked modal, and VoiceOver's escape gesture
// (a two-finger Z) closes it.
import { useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
  const drop = useRef(new Animated.Value(0)).current;
  const close = useRef(onClose);
  close.current = onClose;
  const pull = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4,
      onPanResponderMove: (_, g) => drop.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        // Far enough, or flicked: close (the Modal slides the rest of the way).
        if (g.dy > 90 || g.vy > 0.9) close.current();
        else Animated.spring(drop, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drop, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start(),
    }),
  ).current;
  return (
    <View style={[s.backdrop, dialog && s.centred]}>
      <Pressable feedback={false} style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <Animated.View
        style={[dialog ? s.dialog : [s.sheet, { paddingBottom: Math.max(space(8), insets.bottom + space(4)), transform: [{ translateY: drop }] }], style]}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
      >
        {/* VoiceOver closes with the escape gesture or the backdrop, so the grabber is hidden from it. */}
        {!dialog && (
          <View style={s.grabZone} {...pull.panHandlers} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <View style={s.grabber} />
          </View>
        )}
        {children}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  centred: { justifyContent: 'center', padding: space(4) },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), gap: space(3), width: '100%', maxWidth: 640, alignSelf: 'center', maxHeight: '92%' },
  // A 28 pt strip across the top of the sheet, eating into its top padding so the content doesn't move down much.
  grabZone: { alignSelf: 'stretch', height: 28, marginTop: -space(4), marginBottom: -space(3), alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: radius.pill, backgroundColor: color.ironSoft, opacity: 0.35 },
  dialog: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), width: '100%', maxWidth: 440, alignSelf: 'center' },
});
