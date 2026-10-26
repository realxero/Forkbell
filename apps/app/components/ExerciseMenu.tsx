// An exercise's ⋯ options as a sheet from the bottom: a few short, grouped
// rows with icons instead of a block of links, rest time as a stepper, and
// the risky ones (pain, remove) apart at the bottom.
import type { ComponentProps, ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDuration } from '../lib/units';
import { haptic } from '../lib/haptics';
import { color, radius, space, type } from '../lib/theme';

type Icon = ComponentProps<typeof Ionicons>['name'];
export interface ExerciseMenuProps {
  visible: boolean;
  name: string;
  restSeconds: number;
  onClose: () => void;
  onRest: (by: number) => void;
  /** each action, or nothing when it doesn't apply here */
  howTo?: () => void;
  formCheck: () => void;
  swap: () => void;
  linkNext?: () => void;
  leaveGroup?: { label: string; run: () => void };
  perSide?: { on: boolean; run: () => void };
  moveUp?: () => void;
  moveDown?: () => void;
  pain: { on: boolean; run: () => void };
  remove: () => void;
}

export function ExerciseMenu(p: ExerciseMenuProps) {
  // iPhones can't open another sheet (how-to, swap, form check) while this one is
  // still closing, so the action waits for it to go.
  const then = (fn: () => void) => () => {
    haptic.tap();
    p.onClose();
    setTimeout(fn, Platform.OS === 'ios' ? 420 : 0);
  };
  const row = (icon: Icon, label: string, fn: (() => void) | undefined, opts: { danger?: boolean; detail?: string } = {}) =>
    fn ? (
      <Pressable key={label} onPress={then(fn)} style={({ pressed }) => [s.row, pressed && { backgroundColor: color.raised }]} accessibilityRole="button">
        <Ionicons name={icon} size={22} color={opts.danger ? color.over : color.accent} style={{ width: 28 }} />
        <View style={{ flex: 1 }}>
          <Text style={[s.rowText, opts.danger && { color: color.over }]}>{label}</Text>
          {opts.detail && <Text style={type.small}>{opts.detail}</Text>}
        </View>
      </Pressable>
    ) : null;
  const group = (items: (ReactNode | null)[]) => {
    const shown = items.filter(Boolean);
    return shown.length ? <View style={s.group}>{shown}</View> : null;
  };

  return (
    <Modal visible={p.visible} transparent animationType="slide" onRequestClose={p.onClose}>
      <Pressable style={s.backdrop} onPress={p.onClose} accessibilityLabel="Close">
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={[type.title, { fontSize: 20 }]} numberOfLines={1}>{p.name}</Text>
          <ScrollView contentContainerStyle={{ gap: space(3) }} style={{ maxHeight: 560 }}>
            <View style={[s.group, s.rest]}>
              <Ionicons name="timer-outline" size={22} color={color.accent} style={{ width: 28 }} />
              <Text style={[s.rowText, { flex: 1 }]}>Rest between sets</Text>
              <Pressable onPress={() => { haptic.tap(); p.onRest(-15); }} style={s.step} hitSlop={6} accessibilityLabel="15 seconds less rest">
                <Ionicons name="remove" size={20} color={color.iron} />
              </Pressable>
              <Text style={[type.body, type.number, { minWidth: 52, textAlign: 'center', fontWeight: '800' }]}>{formatDuration(p.restSeconds)}</Text>
              <Pressable onPress={() => { haptic.tap(); p.onRest(15); }} style={s.step} hitSlop={6} accessibilityLabel="15 seconds more rest">
                <Ionicons name="add" size={20} color={color.iron} />
              </Pressable>
            </View>
            {group([row('book-outline', 'How to do it', p.howTo), row('videocam-outline', 'Check my form', p.formCheck, { detail: 'Counts reps with the camera' })])}
            {group([
              row('link-outline', 'Superset with the next', p.linkNext),
              p.leaveGroup ? row('unlink-outline', p.leaveGroup.label, p.leaveGroup.run) : null,
              row('arrow-up', 'Move up', p.moveUp),
              row('arrow-down', 'Move down', p.moveDown),
            ])}
            {group([
              row('swap-horizontal-outline', 'Swap for a similar one', p.swap),
              p.perSide ? row('git-compare-outline', p.perSide.on ? 'Count reps in total' : 'Count reps per side', p.perSide.run) : null,
            ])}
            {group([row('bandage-outline', p.pain.on ? 'Clear the pain flag' : 'Flag pain or discomfort', p.pain.run, { danger: true }), row('trash-outline', 'Remove from this workout', p.remove, { danger: true })])}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.chalk, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(10), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: color.line },
  group: { backgroundColor: color.card, borderRadius: radius.row, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(3), minHeight: 50, paddingVertical: space(2) },
  rowText: { ...type.body, fontWeight: '600' },
  rest: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), minHeight: 54 },
  step: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
});
