import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '../lib/motion';
import { color } from '../lib/theme';

// A celebration is Bell's: the accent, plus the tile colours that never read as a macro.
const colors = () => [color.accent, color.tilePurple, color.tileMagenta, color.tileTeal, color.tileCopper];

/** A short burst of falling confetti over its parent. Nothing at all with Reduce Motion. */
export function Confetti({ pieces = 28, height = 260 }: { pieces?: number; height?: number }) {
  const still = useReduceMotion();
  const fall = useRef(new Animated.Value(0)).current;
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: `${Math.random() * 100}%` as const,
        delay: Math.random() * 0.35,
        drift: (Math.random() - 0.5) * 60,
        spin: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 360),
        color: colors()[i % 5]!,
        w: 6 + Math.random() * 5,
        round: Math.random() > 0.7,
      })),
    [pieces],
  );
  useEffect(() => {
    if (still) return;
    Animated.timing(fall, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [still, fall]);
  if (still) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bits.map((b, i) => {
        const p = fall.interpolate({ inputRange: [0, b.delay, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: -12,
              left: b.left,
              width: b.w,
              height: b.round ? b.w : b.w * 1.6,
              borderRadius: b.round ? b.w / 2 : 1.5,
              backgroundColor: b.color,
              opacity: p.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) },
                { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, b.drift] }) },
                { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${b.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
