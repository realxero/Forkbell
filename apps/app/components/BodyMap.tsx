import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { muscleStatuses, todayLocal, trainNext, type Exercise, type MapMuscle, type MuscleStat, type MuscleState, type MuscleStatus } from '@forkbell/shared';
import { cachedGet } from '../lib/sync';
import { BODY_PATHS, type BodyView } from '../lib/body-paths';
import { useAuth } from '../lib/auth';
import { HowToSheet } from './HowTo';
import { Thumb } from './ExercisePicker';
import { color, radius, space, type } from '../lib/theme';

const FILL: Record<MuscleState, string> = { due: color.track, some: color.accent, good: color.fat, recovering: color.carbs, plenty: color.over };
/** Some work shows as a paler accent; everything else is solid. */
const OPACITY: Record<MuscleState, number> = { due: 1, some: 0.45, good: 1, recovering: 1, plenty: 1 };
const LABEL: Record<MuscleState, string> = { due: 'Due', some: 'Some work', good: 'On track', recovering: 'Recovering', plenty: 'Plenty' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Body outlines come from MuscleMap (MIT, see THIRD_PARTY_NOTICES.md). Each shape is
// a MuscleMap muscle; this table says which of Forkbell's ten muscles it counts as.
// Shapes that aren't listed (head, hands, feet, forearms, shins...) are drawn but not tappable.
const SLUG_TO_MUSCLE: Record<string, MapMuscle> = {
  chest: 'chest',
  deltoids: 'shoulders',
  rotatorCuff: 'shoulders',
  trapezius: 'back',
  upperBack: 'back',
  lowerBack: 'back',
  rhomboids: 'back',
  biceps: 'biceps',
  triceps: 'triceps',
  abs: 'core',
  obliques: 'core',
  serratus: 'core',
  quadriceps: 'quads',
  hamstring: 'hamstrings',
  gluteal: 'glutes',
  calves: 'calves',
};
// MuscleMap also has finer regions (upper chest, inner quad...) drawn on top of the ones
// above. Forkbell tracks whole muscles, so those are left out.
const FINER = new Set(['frontDeltoid', 'rearDeltoid', 'upperTrapezius', 'lowerTrapezius', 'upperChest', 'lowerChest', 'upperAbs', 'lowerAbs', 'innerQuad', 'outerQuad', 'hipFlexors']);

type Piece = { key: string; d: string; m: MapMuscle | null };
function piecesOf(view: BodyView): Piece[] {
  return view.parts
    .filter((p) => !FINER.has(p.slug))
    .flatMap((p) => p.d.map((d, i) => ({ key: `${p.slug}${i}`, d, m: SLUG_TO_MUSCLE[p.slug] ?? null })));
}

function Figure({ view, label, fill, opacity, onPick, picked }: { view: BodyView; label: string; fill: (m: MapMuscle) => string; opacity: (m: MapMuscle) => number; onPick: (m: MapMuscle) => void; picked: MapMuscle | null }) {
  const pieces = useMemo(() => piecesOf(view), [view]);
  const [, , w, h] = view.viewBox.split(' ').map(Number);
  // The picked muscle is drawn last so its outline isn't hidden by its neighbours.
  const ordered = picked ? [...pieces.filter((p) => p.m !== picked), ...pieces.filter((p) => p.m === picked)] : pieces;
  return (
    <View style={{ flex: 1, maxWidth: 170, alignItems: 'center', gap: space(1) }}>
      <View style={{ width: '100%', aspectRatio: w / h }}>
        <Svg width="100%" height="100%" viewBox={view.viewBox}>
          {ordered.map((p) =>
            p.m ? (
              <Path
                key={p.key}
                d={p.d}
                fill={fill(p.m)}
                fillOpacity={opacity(p.m)}
                stroke={picked === p.m ? color.iron : color.line}
                strokeWidth={picked === p.m ? 7 : 2}
                strokeLinejoin="round"
                onPress={() => onPick(p.m!)}
              />
            ) : (
              <Path key={p.key} d={p.d} fill={color.raised} />
            ),
          )}
        </Svg>
      </View>
      <Text style={type.small}>{label}</Text>
    </View>
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
  const body = BODY_PATHS[me?.preferences.body?.sex ?? 'male'];
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
      <View style={s.figures}>
        <Figure view={body.front} label="Front" fill={(m) => FILL[by[m].state]} opacity={(m) => OPACITY[by[m].state]} onPick={setPicked} picked={picked} />
        <Figure view={body.back} label="Back" fill={(m) => FILL[by[m].state]} opacity={(m) => OPACITY[by[m].state]} onPick={setPicked} picked={picked} />
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
  figures: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: space(3), width: '100%', maxWidth: 360, alignSelf: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space(3), justifyContent: 'center' },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4, borderWidth: 1, borderColor: color.line },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: color.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(2), maxWidth: 640, width: '100%', alignSelf: 'center' },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: 4 },
});
