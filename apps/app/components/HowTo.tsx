// How to do an exercise: the start and end pictures fading back and forth
// (so you see the movement without a video), the steps, and the level.
// With Reduce Motion on, the two pictures sit side by side instead.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Tap';
import { SheetFrame } from './Sheet';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EFFORT_GUIDE, exerciseCues, type Exercise, type ExerciseHowTo } from '@forkbell/shared';
import { pictureSource } from '../lib/picture-cache';
import { cachedGet } from '../lib/sync';
import { color, radius, space, type, textSize } from '../lib/theme';
import { SkeletonCards } from './Skeleton';

// Saved on this phone when it can be (works with no signal), otherwise from your server.
const src = pictureSource;

/** Where you should feel it, signs it's too heavy, and when to stop. */
export function CuesCard({ exercise }: { exercise: { name: string; muscle: string } }) {
  const c = exerciseCues(exercise);
  return (
    <View style={s.cues}>
      <View style={s.cueRow}>
        <Ionicons name="body-outline" size={18} color={color.ironSoft} />
        <View style={{ flex: 1 }}>
          <Text style={type.label}>Where you should feel it</Text>
          <Text style={type.body}>{c.feel}</Text>
        </View>
      </View>
      <View style={s.cueRow}>
        <Ionicons name="warning-outline" size={18} color={color.warnText} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.label}>Too heavy if</Text>
          {c.tooHeavy.map((t) => <Text key={t} style={type.body}>• {t}</Text>)}
        </View>
      </View>
      <Text style={type.small}>{EFFORT_GUIDE}</Text>
      <Text style={[type.small, { color: color.over, fontWeight: '700' }]}>{c.stop}</Text>
    </View>
  );
}

/** The movement, as its start and end positions fading into each other. */
export function HowToFrames({ images, name, compact }: { images: string[]; name: string; compact?: boolean }) {
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
          <Image key={p} source={src(p)} style={[s.frame, compact && s.compact, { flex: 1 }]} resizeMode="cover" accessibilityLabel={i === 0 ? 'Start position' : 'End position'} />
        ))}
      </View>
    );
  return (
    <View style={[s.stage, compact && s.compact]} accessibilityRole="image" accessibilityLabel={`${name}, moving between the start and end positions`}>
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
      {/* Done it before: a shorter picture, since it's a reminder now. */}
      <HowToFrames images={howTo.images} name={name} compact={short} />
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
      <Text style={[type.small, { fontSize: textSize.caption }]}>{howTo.credit}</Text>
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
      <SheetFrame onClose={onClose} style={s.sheet}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
          <Text style={[type.title, { flex: 1 }]} numberOfLines={2}>{exercise?.name}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={s.close} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={color.ironSoft} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: space(6) }}>
          {howTo === undefined && <SkeletonCards count={2} />}
          {howTo === null && <Text style={type.body}>No steps or pictures for this one yet.</Text>}
          {howTo && exercise && <HowToCard howTo={howTo} name={exercise.name} />}
          {howTo !== undefined && exercise && <CuesCard exercise={exercise} />}
        </ScrollView>
      </SheetFrame>
    </Modal>
  );
}

const s = StyleSheet.create({
  cues: { gap: space(3), marginTop: space(4), padding: space(3), borderRadius: radius.card, backgroundColor: color.raised },
  cueRow: { flexDirection: 'row', gap: space(2), alignItems: 'flex-start' },
  stage: { width: '100%', aspectRatio: 3 / 2, borderRadius: radius.row, overflow: 'hidden', backgroundColor: color.raised },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  pair: { flexDirection: 'row', gap: space(2) },
  compact: { aspectRatio: 2.4 },
  frame: { aspectRatio: 3 / 2, borderRadius: radius.row, backgroundColor: color.raised },
  step: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 24, fontWeight: '800', fontSize: textSize.small, color: color.onAccent, backgroundColor: color.accent },
  link: { color: color.accent, fontWeight: '700', fontSize: textSize.body },
  sheet: { maxHeight: '88%' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
