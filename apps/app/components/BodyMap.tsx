import { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Rect, Text as SvgText } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { muscleStatuses, todayLocal, trainNext, type Exercise, type MapMuscle, type MuscleStat, type MuscleState, type MuscleStatus } from '@forkbell/shared';
import { cachedGet } from '../lib/sync';
import { useAuth } from '../lib/auth';
import { HowToSheet } from './HowTo';
import { Thumb } from './ExercisePicker';
import { color, radius, space, type } from '../lib/theme';

const FILL: Record<MuscleState, string> = { due: color.track, some: color.accent, good: color.fat, recovering: color.carbs, plenty: color.over };
/** Some work shows as a paler accent; everything else is solid. */
const OPACITY: Record<MuscleState, number> = { due: 1, some: 0.45, good: 1, recovering: 1, plenty: 1 };
const LABEL: Record<MuscleState, string> = { due: 'Due', some: 'Some work', good: 'On track', recovering: 'Recovering', plenty: 'Plenty' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Shape = { m: MapMuscle; kind: 'e'; cx: number; cy: number; rx: number; ry: number } | { m: MapMuscle; kind: 'r'; x: number; y: number; w: number; h: number; r: number };
// Two simple figures, front and back, in a 120 × 250 box each. Symmetric pairs share a muscle.
const pair = (m: MapMuscle, cx: number, cy: number, rx: number, ry: number): Shape[] => [
  { m, kind: 'e', cx: 60 - cx, cy, rx, ry },
  { m, kind: 'e', cx: 60 + cx, cy, rx, ry },
];
const FRONT: Shape[] = [
  ...pair('shoulders', 24, 50, 10, 9),
  ...pair('chest', 10, 58, 10, 10),
  ...pair('biceps', 31, 76, 6, 13),
  { m: 'core', kind: 'r', x: 47, y: 72, w: 26, h: 42, r: 8 },
  ...pair('quads', 11, 150, 10, 28),
  ...pair('calves', 11, 206, 7, 20),
];
const BACK: Shape[] = [
  ...pair('shoulders', 24, 50, 10, 9),
  { m: 'back', kind: 'e', cx: 60, cy: 74, rx: 22, ry: 28 },
  ...pair('triceps', 31, 76, 6, 13),
  ...pair('glutes', 10, 122, 11, 10),
  ...pair('hamstrings', 11, 158, 9, 22),
  ...pair('calves', 11, 206, 8, 20),
];

function Figure({ shapes, x, label, fill, opacity, onPick, picked }: { shapes: Shape[]; x: number; label: string; fill: (m: MapMuscle) => string; opacity: (m: MapMuscle) => number; onPick: (m: MapMuscle) => void; picked: MapMuscle | null }) {
  const base = color.raised;
  return (
    <G transform={`translate(${x} 0)`}>
      {/* The body itself, behind the muscles */}
      <Circle cx={60} cy={18} r={12} fill={base} />
      <Rect x={55} y={28} width={10} height={10} fill={base} />
      <Rect x={38} y={40} width={44} height={78} rx={14} fill={base} />
      <Rect x={20} y={62} width={14} height={60} rx={7} fill={base} />
      <Rect x={86} y={62} width={14} height={60} rx={7} fill={base} />
      <Rect x={38} y={112} width={20} height={118} rx={9} fill={base} />
      <Rect x={62} y={112} width={20} height={118} rx={9} fill={base} />
      {shapes.map((s, i) => {
        const props = {
          fill: fill(s.m),
          fillOpacity: opacity(s.m),
          stroke: picked === s.m ? color.iron : color.line,
          strokeWidth: picked === s.m ? 2 : 1,
          onPress: () => onPick(s.m),
        };
        return s.kind === 'e' ? <Ellipse key={i} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...props} /> : <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} {...props} />;
      })}
      <SvgText x={60} y={246} fontSize={11} fill={color.ironSoft} textAnchor="middle" {...(Platform.OS === 'web' ? { fontFamily: 'system-ui, -apple-system, sans-serif' } : {})}>{label}</SvgText>
    </G>
  );
}

/**
 * Muscles this week on the Train tab: a front and back figure coloured by
 * how much each muscle got and how recently. Tap a muscle for what that means
 * and exercises for it; the line underneath says what to train next.
 */
export function BodyMap() {
  const { me } = useAuth();
  const [stats, setStats] = useState<MuscleStatus[] | null>(null);
  const [picked, setPicked] = useState<MapMuscle | null>(null);
  const [exercises, setExercises] = useState<(Exercise & { uses: number })[]>([]);
  const [howTo, setHowTo] = useState<Exercise | null>(null);

  useFocusEffect(
    useCallback(() => {
      const today = todayLocal();
      cachedGet<{ muscles: MuscleStat[] }>(`/api/workouts/muscle-map?today=${today}`).then((r) => setStats(muscleStatuses(r.muscles, today)), () => setStats(muscleStatuses([], today)));
      cachedGet<{ exercises: (Exercise & { uses: number })[] }>('/api/exercises').then((r) => setExercises(r.exercises), () => {});
    }, []),
  );
  if (!stats) return null;
  const by = Object.fromEntries(stats.map((s) => [s.muscle, s])) as Record<MapMuscle, MuscleStatus>;
  const { next, rest } = trainNext(stats);
  const owned = me?.preferences.training?.equipment ?? [];
  const sel = picked ? by[picked] : null;
  // Exercises for the picked muscle: ones you do first, then ones with pictures, using equipment you have.
  const forMuscle = picked
    ? exercises
        .filter((e) => e.muscle === picked && (!owned.length || e.equipment === 'bodyweight' || e.equipment === 'other' || owned.includes(e.equipment as never)))
        .sort((a, b) => b.uses - a.uses || Number(Boolean(b.pictures)) - Number(Boolean(a.pictures)) || Number(Boolean(a.library)) - Number(Boolean(b.library)))
        .slice(0, 8)
    : [];
  const alt = sel && (sel.state === 'recovering' || sel.state === 'plenty') ? next[0] : null;

  return (
    <View style={s.card}>
      <Text style={type.title}>Muscles this week</Text>
      <View style={{ alignItems: 'center' }}>
        <Svg width="100%" height={250} viewBox="0 0 250 250" style={{ maxWidth: 360 }}>
          <Figure shapes={FRONT} x={0} label="Front" fill={(m) => FILL[by[m].state]} opacity={(m) => OPACITY[by[m].state]} onPick={setPicked} picked={picked} />
          <Figure shapes={BACK} x={130} label="Back" fill={(m) => FILL[by[m].state]} opacity={(m) => OPACITY[by[m].state]} onPick={setPicked} picked={picked} />
        </Svg>
      </View>
      <View style={s.legend}>
        {(['due', 'some', 'good', 'recovering', 'plenty'] as MuscleState[]).map((k) => (
          <View key={k} style={s.key}>
            <View style={[s.swatch, { backgroundColor: FILL[k], opacity: OPACITY[k] }]} />
            <Text style={type.small}>{LABEL[k]}</Text>
          </View>
        ))}
      </View>
      {next.length > 0 && <Text style={type.body}><Text style={{ fontWeight: '800' }}>Train next: </Text>{next.slice(0, 4).map((x) => x.muscle).join(', ')}</Text>}
      {rest.length > 0 && <Text style={type.body}><Text style={{ fontWeight: '800' }}>Let rest: </Text>{rest.map((x) => x.muscle).join(', ')}</Text>}
      <Text style={type.small}>Tap a muscle for what it needs and exercises for it.</Text>

      <Modal visible={Boolean(picked)} transparent animationType="slide" onRequestClose={() => setPicked(null)}>
        <Pressable style={s.backdrop} onPress={() => setPicked(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            {sel && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
                  <View style={[s.dot, { backgroundColor: FILL[sel.state], opacity: OPACITY[sel.state] }]} />
                  <Text style={[type.title, { flex: 1 }]}>{cap(sel.muscle)}</Text>
                  <Pressable onPress={() => setPicked(null)} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
                </View>
                <Text style={[type.label, { color: color.iron }]}>{LABEL[sel.state]}</Text>
                <Text style={type.body}>{sel.note}</Text>
                {alt && <Text style={[type.body, { color: color.warnText }]}>Skip {sel.muscle} for now: {alt.muscle} could use the work more.</Text>}
                <Text style={[type.label, { marginTop: space(2) }]}>{alt ? 'When it’s ready' : 'Exercises for it'}</Text>
                <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: space(2) }}>
                  {forMuscle.length === 0 && <Text style={type.small}>Nothing with the equipment you have. Change it in Settings → Training setup.</Text>}
                  {forMuscle.map((e) => (
                    <Pressable key={e.id} onPress={() => setHowTo(e)} style={({ pressed }) => [s.exRow, pressed && { opacity: 0.6 }]} accessibilityHint="Opens how to do it">
                      <Thumb e={e} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text style={type.body}>{e.name}</Text>
                        <Text style={type.small}>{e.equipment}{e.uses ? ` · you’ve done it ${e.uses}×` : ''}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={color.ironSoft} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      <HowToSheet exercise={howTo} onClose={() => setHowTo(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), borderWidth: 1, borderColor: color.line },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3), justifyContent: 'center' },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4, borderWidth: 1, borderColor: color.line },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: color.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(2), maxWidth: 640, width: '100%', alignSelf: 'center' },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: 4 },
});
