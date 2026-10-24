// Warm-ups, stretches and foam rolling, each with its start and end pictures.
// Pick muscles and start a short guided routine, or browse and open any one.
// Opened from a workout with the muscles it trains, it can start straight away.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { buildStretchRoutine, MUSCLES, picturePath, picturePaths, STRETCH_KINDS, stretchDose, stretchSeconds, type Muscle, type Stretch, type StretchKind } from '@forkbell/shared';
import { cachedGet } from '../../lib/sync';
import { pictureSource } from '../../lib/picture-cache';
import { formatDuration } from '../../lib/units';
import { Chip } from '../../components/AmountPicker';
import { HowToCard } from '../../components/HowTo';
import { StretchSession } from '../../components/StretchSession';
import { color, radius, space, type } from '../../lib/theme';

const CREDIT = 'Steps and pictures: Free Exercise DB (public domain)';
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
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
        <Text style={[type.hero, { fontSize: 30 }]}>Warm-up and stretches</Text>
        <View style={s.tabs} accessibilityRole="tablist">
          {STRETCH_KINDS.map((k) => (
            <Pressable key={k.kind} onPress={() => setKind(k.kind)} style={[s.tab, kind === k.kind && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: kind === k.kind }}>
              <Text style={[s.tabText, kind === k.kind && { color: color.onAccent }]}>{k.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={type.small}>{info.when}</Text>

        <Text style={type.label}>For</Text>
        <View style={s.chips}>
          <Chip label="Everything" on={!muscles.length} onPress={() => setMuscles([])} />
          {BODY.map((m) => (
            <Chip key={m} label={m} on={muscles.includes(m)} onPress={() => setMuscles((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]))} />
          ))}
        </View>
        {kind !== 'roll' && (
          <View style={s.row}>
            <Text style={[type.body, { flex: 1 }]}>Include ones that need a chair, ball or wall</Text>
            <Switch value={anyEquipment} onValueChange={setAnyEquipment} accessibilityLabel="Include ones that need equipment" />
          </View>
        )}

        {error && <Text style={{ color: color.over }}>{error}</Text>}
        {!all && !error && <ActivityIndicator color={color.iron} />}
        {routine.length > 0 && (
          <Pressable onPress={() => setSession(routine)} style={s.start} accessibilityHint="Starts a guided routine with a timer">
            <Ionicons name="play" size={20} color={color.onAccent} />
            <View style={{ flex: 1 }}>
              <Text style={s.startText}>Start a {info.label.toLowerCase()} routine</Text>
              <Text style={[type.small, { color: color.onAccent }]} numberOfLines={2}>
                {routine.length} moves · about {minutes} min · {routine.map((r) => r.name).join(', ')}
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
              <Text style={type.small}>{x.muscles.slice(0, 3).join(', ')} · {stretchDose(x).label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={color.ironSoft} />
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={Boolean(open)} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
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
          </Pressable>
        </Pressable>
      </Modal>
      <StretchSession items={session} title={info.label} onClose={() => setSession(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  tabs: { flexDirection: 'row', backgroundColor: color.card, borderRadius: radius.pill, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: color.accent },
  tabText: { fontWeight: '700', color: color.iron },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  start: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.accent, borderRadius: radius.card, padding: space(4) },
  startText: { color: color.onAccent, fontWeight: '800', fontSize: 17 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.row, padding: space(2) },
  thumb: { width: 72, height: 48, borderRadius: 8, backgroundColor: color.raised },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), gap: space(3), maxHeight: '88%', width: '100%', maxWidth: 640, alignSelf: 'center' },
  secondary: { minHeight: 44, justifyContent: 'center' },
});
