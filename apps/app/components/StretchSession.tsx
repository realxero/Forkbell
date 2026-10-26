// A guided warm-up or stretch routine: the pictures moving, the steps, and a
// timer for each one. Sided ones count down twice ("first side", "other side")
// with a buzz to switch. Pause any time; Back and Next skip around.
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { picturePaths, stretchDose, stretchSeconds, type Stretch } from '@forkbell/shared';
import { HowToFrames } from './HowTo';
import { haptic } from '../lib/haptics';
import { formatDuration } from '../lib/units';
import { color, radius, space, type } from '../lib/theme';

export function StretchSession({ items, title, onClose }: { items: Stretch[] | null; title: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [side, setSide] = useState(0);
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const endsAt = useRef(0);
  const cur = items?.[i];

  const startStep = (index: number, sideIndex: number) => {
    const s = items?.[index];
    if (!s) return;
    const secs = stretchDose(s).seconds;
    setI(index);
    setSide(sideIndex);
    setLeft(secs);
    endsAt.current = Date.now() + secs * 1000;
    setPaused(false);
  };

  useEffect(() => {
    if (!items?.length) return;
    setDone(false);
    startStep(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const next = () => {
    if (!items || !cur) return;
    if (cur.sides && side === 0) {
      haptic.alert();
      return startStep(i, 1);
    }
    if (i + 1 < items.length) {
      haptic.alert();
      return startStep(i + 1, 0);
    }
    haptic.success();
    setDone(true);
  };
  const back = () => {
    if (!items) return;
    if (side === 1) return startStep(i, 0);
    if (i > 0) startStep(i - 1, 0);
  };

  useEffect(() => {
    if (!items || done || paused) return;
    const t = setInterval(() => {
      const secs = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setLeft(secs);
      if (secs === 0) next();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, i, side, paused, done]);

  const togglePause = () => {
    if (paused) endsAt.current = Date.now() + left * 1000;
    setPaused(!paused);
  };

  const total = items?.reduce((n, s) => n + stretchSeconds(s), 0) ?? 0;
  return (
    <Modal visible={Boolean(items?.length)} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      {/* A modal is its own screen: it needs its own safe-area measurements, or the top sits under the clock. */}
      <SafeAreaProvider>
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <View style={s.head}>
          <Text style={[type.title, { flex: 1 }]} numberOfLines={1}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={s.close} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={color.ironSoft} />
          </Pressable>
        </View>
        {done ? (
          <View style={{ gap: space(4), padding: space(4) }}>
            <Text style={[type.hero, { fontSize: 30 }]}>All done.</Text>
            <Text style={type.body}>{items?.length} moves, about {formatDuration(total)}.</Text>
            <Pressable onPress={onClose} style={s.primary}><Text style={s.primaryText}>Done</Text></Pressable>
          </View>
        ) : cur ? (
          <ScrollView contentContainerStyle={s.content}>
            <Text style={type.small}>{i + 1} of {items!.length}</Text>
            <View style={s.progress}><View style={[s.progressFill, { width: `${(100 * (i + (cur.sides ? side / 2 : 0))) / items!.length}%` }]} /></View>
            <HowToFrames images={picturePaths(cur)} name={cur.name} />
            <Text style={[type.title, { fontSize: 24 }]}>{cur.name}</Text>
            <Text style={type.small}>{stretchDose(cur).label}{cur.equipment !== 'none' ? ` · needs ${cur.equipment === 'something to hold' ? 'something to hold or lean on' : `a ${cur.equipment}`}` : ''}</Text>
            <View style={s.timerRow} accessibilityLiveRegion="polite">
              <Text style={s.timer}>{formatDuration(left)}</Text>
              {cur.sides && <Text style={[type.body, { fontWeight: '700' }]}>{side === 0 ? 'First side' : 'Other side'}</Text>}
            </View>
            <View style={s.controls}>
              <Pressable onPress={back} disabled={i === 0 && side === 0} style={[s.ctrl, i === 0 && side === 0 && { opacity: 0.35 }]} accessibilityLabel="Back">
                <Ionicons name="play-back" size={24} color={color.iron} />
              </Pressable>
              <Pressable onPress={togglePause} style={[s.ctrl, s.ctrlMain]} accessibilityLabel={paused ? 'Resume' : 'Pause'}>
                <Ionicons name={paused ? 'play' : 'pause'} size={30} color={color.onAccent} />
              </Pressable>
              <Pressable onPress={next} style={s.ctrl} accessibilityLabel={cur.sides && side === 0 ? 'Other side' : 'Next'}>
                <Ionicons name="play-forward" size={24} color={color.iron} />
              </Pressable>
            </View>
            {cur.steps.map((step, n) => (
              <View key={n} style={s.step}>
                <Text style={s.num}>{n + 1}</Text>
                <Text style={[type.body, { flex: 1 }]}>{step}</Text>
              </View>
            ))}
            <Text style={type.small}>Ease in and stop if anything hurts; a stretch should feel like gentle tension, never pain.</Text>
            <Text style={[type.small, { fontSize: 11 }]}>Steps and pictures: Free Exercise DB (public domain)</Text>
          </ScrollView>
        ) : null}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk, paddingTop: space(12) },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(4), gap: space(2) },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  progress: { height: 6, borderRadius: 3, backgroundColor: color.line, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: color.accent },
  timerRow: { flexDirection: 'row', alignItems: 'baseline', gap: space(3) },
  timer: { fontSize: 48, fontWeight: '800', color: color.iron, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space(6), marginVertical: space(2) },
  ctrl: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: color.card },
  ctrlMain: { width: 68, height: 68, borderRadius: 34, backgroundColor: color.accent },
  step: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 24, fontWeight: '800', fontSize: 13, color: color.onAccent, backgroundColor: color.accent },
  primary: { backgroundColor: color.accent, borderRadius: radius.row, paddingVertical: space(3), alignItems: 'center' },
  primaryText: { color: color.onAccent, fontWeight: '800', fontSize: 16 },
});
