// The workout's own number pad, in place of the phone keyboard: compact, with
// a step down and up (−5 / +5 lb, −1 / +1 rep), Next to move along the row,
// and Done. It never covers the box you're typing in and goes away with a tap
// or a scroll. Gym apps (Strong, Hevy) do the same for one-thumb logging.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Tap';
import { haptic } from '../lib/haptics';
import { color, radius, space, textSize, type } from '../lib/theme';

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | ':' | 'back';

/** About how tall the pad is above the home bar, for scrolling the row you're in clear of it. */
export const PAD_HEIGHT = 268;

export function SetPad({
  title,
  sep,
  step,
  onKey,
  onStep,
  onNext,
  onDone,
  last,
  extra,
}: {
  /** what you're filling in: "Set 2 · lb" */
  title: string;
  /** the decimal point, a colon for minutes, or nothing for whole numbers */
  sep: '.' | ':' | null;
  /** the step's label, e.g. "5" */
  step: string;
  onKey: (k: PadKey) => void;
  onStep: (dir: 1 | -1) => void;
  onNext: () => void;
  onDone: () => void;
  /** the last box: Next becomes Done */
  last: boolean;
  /** the rest timer, while resting */
  extra?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const key = (label: string, run: () => void, a11y: string, style?: object, content?: ReactNode) => (
    <Pressable
      key={a11y}
      onPress={() => {
        haptic.tap();
        run();
      }}
      style={[s.key, style]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      {content ?? <Text style={s.keyText}>{label}</Text>}
    </Pressable>
  );
  const digit = (d: PadKey) => key(d, () => onKey(d), d);
  return (
    <View style={[s.pad, { paddingBottom: insets.bottom + space(2) }]}>
      <View style={s.top}>
        <Text style={[type.label, { flex: 1 }]} numberOfLines={1}>{title}</Text>
        {extra}
        <Pressable onPress={onDone} hitSlop={8} style={s.done} accessibilityRole="button" accessibilityLabel="Hide the number pad">
          <Ionicons name="chevron-down" size={22} color={color.iron} />
        </Pressable>
      </View>
      <View style={s.grid}>
        <View style={s.row}>{digit('1')}{digit('2')}{digit('3')}{key('', () => onKey('back'), 'Delete', s.side, <Ionicons name="backspace-outline" size={22} color={color.iron} />)}</View>
        <View style={s.row}>{digit('4')}{digit('5')}{digit('6')}{key(`−${step}`, () => onStep(-1), `Minus ${step}`, s.side)}</View>
        <View style={s.row}>{digit('7')}{digit('8')}{digit('9')}{key(`+${step}`, () => onStep(1), `Plus ${step}`, s.side)}</View>
        <View style={s.row}>
          {sep ? digit(sep) : <View style={[s.key, { backgroundColor: 'transparent' }]} />}
          {digit('0')}
          {key(last ? 'Done' : 'Next', last ? onDone : onNext, last ? 'Done' : 'Next box', s.next, <Text style={s.nextText}>{last ? 'Done' : 'Next'}</Text>)}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // It floats over the list, so it takes the Float shadow (DESIGN.md: only floaters cast shadows).
  pad: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingHorizontal: space(2), paddingTop: space(1), shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 40, paddingHorizontal: space(2) },
  done: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  grid: { gap: 6, maxWidth: 520, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 6 },
  key: { flex: 1, height: 46, borderRadius: radius.input, backgroundColor: color.chalk, alignItems: 'center', justifyContent: 'center' },
  side: { backgroundColor: color.raised },
  keyText: { ...type.number, fontSize: textSize.heading, fontWeight: '600', color: color.iron },
  // Next is the pad's main action: iron, like every main action.
  next: { flex: 2, backgroundColor: color.iron },
  nextText: { color: color.chalk, fontWeight: '800', fontSize: textSize.body },
});
