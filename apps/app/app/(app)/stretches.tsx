// Warm-ups, stretches and foam rolling, each with its start and end pictures.
// Pick muscles and start a short guided routine, or browse and open any one.
// Opened from a workout with the muscles it trains, it can start straight away.
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Pressable } from '../../components/Tap';
import { SheetFrame } from '../../components/Sheet';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { buildStretchRoutine, MUSCLES, picturePath, picturePaths, STRETCH_KINDS, stretchDose, stretchSeconds, type Muscle, type Stretch, type StretchKind } from '@forkbell/shared';
import { cachedGet } from '../../lib/sync';
import { pictureSource } from '../../lib/picture-cache';
import { formatDuration } from '../../lib/units';
import { Chip } from '../../components/AmountPicker';
import { ChipRow } from '../../components/ChipRow';
import { buttons } from '../../lib/buttons';
import { HowToCard } from '../../components/HowTo';
import { StretchSession } from '../../components/StretchSession';
import { color, radius, space, type, textSize } from '../../lib/theme';
import { SkeletonRows } from '../../components/Skeleton';

const CREDIT = 'Steps and pictures: Free Exercise DB (public domain)';
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
/** Only what's different about a move: both sides, or something it needs. */
const differs = (x: Stretch) => [
  ...(x.sides ? ['each side'] : []),
  ...(x.equipment !== 'none' && x.kind !== 'roll' ? [x.equipment === 'something to hold' ? 'needs something to hold' : `needs a ${x.equipment}`] : []),
];
const BODY = MUSCLES.filter((m) => m !== 'full body');

export default function Stretches() {
  const params = useLocalSearchParams<{ kind?: StretchKind; muscles?: string; start?: string }>();
  const [all, setAll] = useState<Stretch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<StretchKind>(params.kind && ['dynamic', 'static', 'roll'].includes(params.kind) ? params.kind : 'dynamic');
  const [muscles, setMuscles] = useState<Muscle[]>(() => (params.muscles ?? '').split(',').filter((m): m is Muscle => (BODY as readonly string[]).includes(m)));
  const [anyEquipment, setAnyEquipment] = useState(false);
  const [open, setOpen] = useState<Stretch | null>(null);
  const [session, setSession] = useState<Stretch[] | null>(null);

  useEffect(() => {
    cachedGet<{ stretches: Stretch[] }>('/api/stretches').then(
      (r) => setAll(r.stretches),
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);

  const routine = useMemo(() => (all ? buildStretchRoutine(all, { kind, muscles, anyEquipment }) : []), [all, kind, muscles, anyEquipment]);
  // Opened from a workout ("Warm up first" / "Cool down"): go straight into it, once.
  const [autoStarted, setAutoStarted] = useState(false);
  useEffect(() => {
    if (params.start === '1' && !autoStarted && routine.length) {
      setAutoStarted(true);
      setSession(routine);
    }
  }, [params.start, autoStarted, routine]);

  const shown = (all ?? []).filter((s) => s.kind === kind && (!muscles.length || s.muscles.some((m) => muscles.includes(m))) && (anyEquipment || kind === 'roll' || s.equipment === 'none'));
  const info = STRETCH_KINDS.find((k) => k.kind === kind)!;
  const minutes = Math.max(1, Math.round(routine.reduce((n, s) => n + stretchSeconds(s), 0) / 60));

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={[buttons.link, { alignSelf: 'flex-start' }]}><Text style={s.link}>‹ Back</Text></Pressable>
        <Text style={type.pageTitle}>Warm-up and stretches</Text>
        <View style={s.tabs} accessibilityRole="tablist">
          {STRETCH_KINDS.map((k) => (
            <Pressable key={k.kind} onPress={() => setKind(k.kind)} style={[s.tab, kind === k.kind && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: kind === k.kind }}>
              <Text style={[s.tabText, kind === k.kind && { color: color.chalk }]}>{k.label}</Text>
            </Pressable>
          ))}
        </View>
        {/* The usual timing once here, so each row only says what's different about it. */}
        <Text style={type.small}>{info.when} Each one: {stretchDose({ kind, sides: false }).label.replace(/^Hold /, 'hold ')}.</Text>

        <ChipRow>
          <Chip label="Everything" on={!muscles.length} onPress={() => setMuscles([])} />
          {BODY.map((m) => (
            <Chip role="checkbox" key={m} label={cap(m)} on={muscles.includes(m)} onPress={() => setMuscles((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]))} />
          ))}
        </ChipRow>
        {kind !== 'roll' && (
          <View style={s.row}>
            <Text style={[type.body, { flex: 1 }]}>Include ones that need a chair, ball or wall</Text>
            <Switch value={anyEquipment} onValueChange={setAnyEquipment} accessibilityLabel="Include ones that need equipment" />
          </View>
        )}

        {error && <Text style={{ color: color.over }}>{error}</Text>}
        {!all && !error && <SkeletonRows rows={5} />}
        {routine.length > 0 && (
          <Pressable onPress={() => setSession(routine)} style={s.start} accessibilityHint="Starts a guided routine with a timer">
            <Ionicons name="play" size={20} color={color.chalk} />
            <View style={{ flex: 1 }}>
              <Text style={s.startText}>Start a {info.label.toLowerCase()} routine</Text>
              <Text style={[type.small, { color: color.chalk }]}>
                {routine.length} moves · about {minutes} min
              </Text>
            </View>
          </Pressable>
        )}

        {all && <Text style={type.label}>{shown.length} {info.label.toLowerCase()} moves</Text>}
        {shown.map((x) => (
          <Pressable key={x.key} onPress={() => setOpen(x)} style={({ pressed }) => [s.item, pressed && { opacity: 0.7 }]} accessibilityHint="Opens the pictures and steps">
            <Image source={pictureSource(picturePath(x.howToRef, 0))} style={s.thumb} accessibilityIgnoresInvertColors />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.body, { fontWeight: '700' }]}>{x.name}</Text>
              <Text style={type.small}>{[x.muscles.slice(0, 3).map(cap).join(', '), ...differs(x)].join(' · ')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={color.ironSoft} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={Boolean(open)} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <SheetFrame onClose={() => setOpen(null)} style={s.sheet}>
          <View style={s.row}>
            <Text style={[type.title, { flex: 1 }]}>{open?.name}</Text>
            <Pressable onPress={() => setOpen(null)} hitSlop={12} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: space(3), paddingBottom: space(6) }}>
            {open && <Text style={type.small}>{stretchDose(open).label}</Text>}
            {open && <HowToCard name={open.name} howTo={{ steps: open.steps, level: open.level, secondary: open.muscles.slice(1), images: picturePaths(open), credit: CREDIT }} />}
            {open && (
              <Pressable onPress={() => { const one = open; setOpen(null); setSession([one]); }} style={s.secondary}>
                <Text style={s.link}>Do this one with a timer</Text>
              </Pressable>
            )}
          </ScrollView>
        </SheetFrame>
      </Modal>
      <StretchSession items={session} title={info.label} onClose={() => setSession(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: textSize.body },
  tabs: { flexDirection: 'row', backgroundColor: color.card, borderRadius: radius.pill, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  // Selected is iron, the same as a selected chip; the accent belongs to Bell and links.
  tabOn: { backgroundColor: color.iron },
  tabText: { fontWeight: '700', color: color.iron },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  // The screen's main action: iron, like every other Start.
  start: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.iron, borderRadius: radius.card, padding: space(4) },
  startText: { color: color.chalk, fontWeight: '800', fontSize: textSize.body },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.row, padding: space(2) },
  thumb: { width: 72, height: 48, borderRadius: radius.input, backgroundColor: color.raised },
  sheet: { maxHeight: '88%' },
  secondary: { minHeight: 44, justifyContent: 'center' },
});
