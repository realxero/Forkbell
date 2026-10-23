// Swipe a row to reveal an action: left for the action on the right side
// (Remove), right for the one on the left (Copy). Tap the action to do it.
// Built on React Native's own gestures, so there's nothing extra to install.
// On the web, and for VoiceOver, the same actions come from the row's
// long-press menu and its accessibility actions instead.
import { useRef, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { haptic } from '../lib/haptics';
import { color } from '../lib/theme';

type Action = { label: string; icon: ComponentProps<typeof Ionicons>['name']; tint: string; run: () => void };
const WIDTH = 92;

/** The row that's open now, so opening another closes it. */
let openRow: { close: () => void } | null = null;

export function SwipeRow({ left, right, children }: { left?: Action; right?: Action; children: ReactNode }) {
  const x = useRef(new Animated.Value(0)).current;
  const at = useRef(0);
  const me = useRef({ close: () => settle(0) }).current;

  const settle = (to: number) => {
    at.current = to;
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
    if (to === 0 && openRow === me) openRow = null;
  };

  const pan = useRef(
    PanResponder.create({
      // Only clearly sideways drags; vertical ones stay with the list's scrolling.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderGrant: () => {
        if (openRow && openRow !== me) openRow.close();
      },
      onPanResponderMove: (_, g) => {
        let next = at.current + g.dx;
        if (!left) next = Math.min(0, next);
        if (!right) next = Math.max(0, next);
        // Resist past the action's width.
        const limit = WIDTH;
        if (Math.abs(next) > limit) next = Math.sign(next) * (limit + (Math.abs(next) - limit) / 4);
        x.setValue(next);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => {
        const end = at.current + g.dx;
        if (right && end < -WIDTH / 2) {
          if (at.current !== -WIDTH) haptic.tap();
          openRow = me;
          return settle(-WIDTH);
        }
        if (left && end > WIDTH / 2) {
          if (at.current !== WIDTH) haptic.tap();
          openRow = me;
          return settle(WIDTH);
        }
        settle(0);
      },
      onPanResponderTerminate: () => settle(0),
    }),
  ).current;

  if (Platform.OS === 'web') return <>{children}</>;

  const button = (a: Action, side: 'left' | 'right') => (
    <Pressable
      onPress={() => {
        settle(0);
        a.run();
      }}
      style={[s.action, side === 'left' ? { left: 0 } : { right: 0 }, { backgroundColor: a.tint }]}
      accessibilityLabel={a.label}
    >
      <Ionicons name={a.icon} size={22} color="#FFFFFF" />
      <Text style={s.label}>{a.label}</Text>
    </Pressable>
  );

  return (
    <View style={s.wrap}>
      {left && button(left, 'left')}
      {right && button(right, 'right')}
      <Animated.View
        {...pan.panHandlers}
        style={{ transform: [{ translateX: x }], backgroundColor: color.card }}
        accessibilityActions={[...(left ? [{ name: 'left', label: left.label }] : []), ...(right ? [{ name: 'right', label: right.label }] : [])]}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'left' ? left?.run() : right?.run())}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  action: { position: 'absolute', top: 0, bottom: 0, width: WIDTH, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
