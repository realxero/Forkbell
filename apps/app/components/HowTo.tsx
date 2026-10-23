// How to do an exercise: the start and end pictures fading back and forth
// (so you see the movement without a video), the steps, and the level.
// With Reduce Motion on, the two pictures sit side by side instead.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Exercise, ExerciseHowTo } from '@forkbell/shared';
import { pictureSource } from '../lib/picture-cache';
import { cachedGet } from '../lib/sync';
import { color, radius, space, type } from '../lib/theme';

// Saved on this phone when it can be (works with no signal), otherwise from your server.
const src = pictureSource;

/** The movement, as its start and end positions fading into each other. */
export function HowToFrames({ images, name }: { images: string[]; name: string }) {
  const fade = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill, () => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (still || images.length < 2) return;
    // Hold each position long enough to see it, then move like a steady rep.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(fade, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, images.length, fade]);

  if (!images.length) return null;
  if (still || images.length < 2)
    return (
      <View style={s.pair} accessibilityRole="image" accessibilityLabel={`${name}: start and end positions`}>
        {images.slice(0, 2).map((p, i) => (
          <Image key={p} source={src(p)} style={[s.frame, { flex: 1 }]} resizeMode="cover" accessibilityLabel={i === 0 ? 'Start position' : 'End position'} />
        ))}
      </View>
    );
  return (
    <View style={s.stage} accessibilityRole="image" accessibilityLabel={`${name}, moving between the start and end positions`}>
      <Image source={src(images[0]!)} style={s.fill} resizeMode="cover" />
      <Animated.Image source={src(images[1]!)} style={[s.fill, { opacity: fade }]} resizeMode="cover" />
    </View>
  );
}

/** Pictures, level, helper muscles and steps. `short` shows two steps and a "Show all" link. */
export function HowToCard({ howTo, name, short }: { howTo: ExerciseHowTo; name: string; short?: boolean }) {
  const [all, setAll] = useState(!short);
  const steps = all ? howTo.steps : howTo.steps.slice(0, 2);
  return (
    <View style={{ gap: space(3) }}>
      <HowToFrames images={howTo.images} name={name} />
      {(howTo.level || howTo.secondary.length > 0) && (
        <Text style={type.small}>
          {[howTo.level && `${howTo.level.charAt(0).toUpperCase()}${howTo.level.slice(1)}`, howTo.secondary.length && `also works ${howTo.secondary.join(', ')}`].filter(Boolean).join(' · ')}
        </Text>
      )}
      {steps.map((step, i) => (
        <View key={i} style={s.step}>
          <Text style={s.num}>{i + 1}</Text>
          <Text style={[type.body, { flex: 1 }]}>{step}</Text>
        </View>
      ))}
      {!all && howTo.steps.length > 2 && (
        <Pressable onPress={() => setAll(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={s.link}>Show all {howTo.steps.length} steps</Text>
        </Pressable>
      )}
      <Text style={[type.small, { fontSize: 11 }]}>{howTo.credit}</Text>
    </View>
  );
}

/** "How to do it" over the workout, without leaving it. */
export function HowToSheet({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  const [howTo, setHowTo] = useState<ExerciseHowTo | null | undefined>(undefined);
  useEffect(() => {
    if (!exercise) return;
    setHowTo(undefined);
    cachedGet<{ howTo?: ExerciseHowTo | null }>(`/api/exercises/${exercise.id}`).then(
      (r) => setHowTo(r.howTo ?? null),
      () => setHowTo(null),
    );
  }, [exercise]);
  return (
    <Modal visible={Boolean(exercise)} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
            <Text style={[type.title, { flex: 1 }]} numberOfLines={2}>{exercise?.name}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={s.close} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={color.ironSoft} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: space(6) }}>
            {howTo === undefined && <ActivityIndicator color={color.iron} style={{ marginVertical: space(8) }} />}
            {howTo === null && <Text style={type.body}>No steps or pictures for this one yet.</Text>}
            {howTo && exercise && <HowToCard howTo={howTo} name={exercise.name} />}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  stage: { width: '100%', aspectRatio: 3 / 2, borderRadius: radius.row, overflow: 'hidden', backgroundColor: color.raised },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  pair: { flexDirection: 'row', gap: space(2) },
  frame: { aspectRatio: 3 / 2, borderRadius: radius.row, backgroundColor: color.raised },
  step: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 24, fontWeight: '800', fontSize: 13, color: color.onAccent, backgroundColor: color.accent },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), gap: space(3), maxHeight: '88%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
