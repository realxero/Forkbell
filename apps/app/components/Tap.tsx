// Every tap answers the finger. This Pressable dims while it's held down, so
// a button, row or link shows it was touched (and nobody taps twice to be
// sure, which would log a food twice). Screens import it in place of React
// Native's own Pressable; everything else about it is the same.
//
// It stays out of the way when a caller handles the pressed look itself (a
// style or children function), when there's nothing to press (no onPress or
// onLongPress), when it's disabled, and for feedback={false}: backdrops and
// the sheets on them, which would otherwise dim the whole sheet.
import type { ComponentProps } from 'react';
import { Pressable as NativePressable, StyleSheet } from 'react-native';

type Props = ComponentProps<typeof NativePressable> & {
  /** false for backdrops and the sheets on them. */
  feedback?: boolean;
};

export function Pressable({ feedback = true, style, ...rest }: Props) {
  if (typeof style === 'function' || typeof rest.children === 'function' || !feedback || rest.disabled || !(rest.onPress || rest.onLongPress)) {
    return <NativePressable {...rest} style={style} />;
  }
  return <NativePressable {...rest} style={({ pressed }) => [style, pressed && s.pressed]} />;
}

const s = StyleSheet.create({ pressed: { opacity: 0.6 } });
