// A small ⓘ next to a card's heading that opens a short explanation, so the
// card itself keeps only what changes day to day and the "how this works"
// text is one tap away instead of always on screen.
//
//   <TitleWithInfo title="Your daily burn">How it's worked out…</TitleWithInfo>
//   <Info title="Readiness">…</Info>             just the ⓘ, placed yourself
import { useState, type ReactNode } from 'react';
import { Modal, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from './Tap';
import { SheetFrame } from './Sheet';
import { buttons } from '../lib/buttons';
import { color, space, type } from '../lib/theme';

export function Info({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={12} accessibilityLabel={`About ${title.toLowerCase()}`}>
        <Ionicons name="information-circle-outline" size={20} color={color.ironSoft} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <SheetFrame kind="dialog" onClose={() => setOpen(false)}>
          <Text style={type.title} accessibilityRole="header">{title}</Text>
          {typeof children === 'string' ? <Text style={type.body}>{children}</Text> : children}
          <Pressable onPress={() => setOpen(false)} style={[buttons.filled, { marginTop: space(1) }]}>
            <Text style={buttons.filledText}>Got it</Text>
          </Pressable>
        </SheetFrame>
      </Modal>
    </>
  );
}

/** A card heading with its ⓘ beside it. */
export function TitleWithInfo({ title, children, style }: { title: string; children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
      <Text style={[type.title, style]}>{title}</Text>
      <Info title={title}>{children}</Info>
    </View>
  );
}
