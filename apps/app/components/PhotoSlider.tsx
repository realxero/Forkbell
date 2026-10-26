// Before and after in one frame: drag across to wipe from your first photo
// to your latest. Both photos fill the same box, so line them up when you
// take them (same spot, same distance) for it to work best.
import { useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { color, radius, space, type } from '../lib/theme';

export function PhotoSlider({ before, after, beforeLabel, afterLabel }: { before: ImageSourcePropType; after: ImageSourcePropType; beforeLabel: string; afterLabel: string }) {
  const [width, setWidth] = useState(0);
  const [at, setAt] = useState(0.5);
  const w = useRef(0);
  const move = (x: number) => w.current > 0 && setAt(Math.min(1, Math.max(0, x / w.current)));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => move(e.nativeEvent.locationX),
      onPanResponderMove: (e) => move(e.nativeEvent.locationX),
    }),
  ).current;
  return (
    <View
      style={s.frame}
      onLayout={(e) => {
        w.current = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
      }}
      {...pan.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Before and after: ${beforeLabel} on the left, ${afterLabel} on the right`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(at * 100) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => setAt((a) => Math.min(1, Math.max(0, a + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
    >
      {/* the latest photo underneath, the first one wiped over it from the left */}
      <Image source={after} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={[s.clip, { width: width * at }]} pointerEvents="none">
        <Image source={before} style={{ width, height: '100%' }} resizeMode="cover" />
      </View>
      <View style={[s.handle, { left: width * at - 1.5 }]} pointerEvents="none">
        <View style={s.knob}><Text style={s.knobText}>‹ ›</Text></View>
      </View>
      <Text style={[s.tag, { left: space(2) }]} pointerEvents="none">{beforeLabel}</Text>
      <Text style={[s.tag, { right: space(2) }]} pointerEvents="none">{afterLabel}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.row, overflow: 'hidden', backgroundColor: color.raised },
  clip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  handle: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  knob: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  knobText: { color: '#000', fontWeight: '800' },
  tag: { ...type.small, position: 'absolute', bottom: space(2), color: '#fff', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, overflow: 'hidden', paddingHorizontal: space(2), paddingVertical: 2, fontWeight: '700' },
});
