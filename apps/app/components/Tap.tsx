// Every tap answers the finger. This Pressable dims while it's held down, so
// a button, row or link shows it was touched (and nobody taps twice to be
// sure, which would log a food twice). Screens import it in place of React
// Native's own Pressable; everything else about it is the same.
//
// It stays out of the way when a caller handles the pressed look itself (a
// style or children function), when there's nothing to press (no onPress or
// onLongPress), when it's disabled, and for feedback={false}: backdrops and
// the sheets on them, which would otherwise dim the whole sheet.
//
// It also tells VoiceOver and TalkBack that it's a button, when the caller
// hasn't given it a role of its own.
import type { ComponentProps } from 'react';
import { Pressable as NativePressable, StyleSheet } from 'react-native';

type Props = ComponentProps<typeof NativePressable> & {
  /** false for backdrops and the sheets on them. */
  feedback?: boolean;
};

export function Pressable({ feedback = true, style, ...props }: Props) {
  // Anything you can tap is announced as a button ("Add food, button") unless
  // the caller says what it is (a checkbox, a link, a tab).
  const pressable = Boolean(props.onPress || props.onLongPress);
  const rest = { ...props, accessibilityRole: props.accessibilityRole ?? (pressable ? ('button' as const) : undefined) };
  if (typeof style === 'function' || typeof rest.children === 'function' || !feedback || rest.disabled || !pressable) {
    return <NativePressable {...rest} style={style} />;
  }
  return <NativePressable {...rest} style={({ pressed }) => [style, pressed && s.pressed]} />;
}

const s = StyleSheet.create({ pressed: { opacity: 0.6 } });
