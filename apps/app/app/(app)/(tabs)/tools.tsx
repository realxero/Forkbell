// Tools: calculators for the gym and the weight journey. In the sidebar on a
// wide screen; the list sits beside the open tool when there's room. The
// maths lives in @forkbell/shared; this page only takes inputs and shows
// results, which update as you type. Advanced shows how each number is made.
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { estimatedOneRepMax, weightForReps } from '@forkbell/shared';
import { Pressable } from '../../../components/Tap';
import { Chip } from '../../../components/AmountPicker';
import { PlateCalculator } from '../../../components/PlateCalculator';
import { buttons } from '../../../lib/buttons';
import { useWide } from '../../../lib/layout';
import { readCache, writeCache } from '../../../lib/sync';
import { useUnit } from '../../../lib/units';
import { color, radius, space, type } from '../../../lib/theme';

type ToolId = 'max' | 'plates';
const TOOLS: { id: ToolId; title: string; detail: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'max', title: 'One-rep max', detail: 'Your max from any set, and what to lift for each rep count', icon: 'trending-up-outline' },
  { id: 'plates', title: 'Plates', detail: 'What to load on each side of the bar', icon: 'barbell-outline' },
];

/** Simple shows the answer; Advanced also shows the working. Remembered on this device. */
const DETAIL = 'device:tools-detail';

export default function Tools() {
  const wide = useWide();
  const [open, setOpen] = useState<ToolId>('max');
  const [advanced, setAdvanced] = useState(readCache<boolean>(DETAIL) ?? false);
  const detail = (on: boolean) => {
    setAdvanced(on);
    writeCache(DETAIL, on);
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[s.content, wide && s.contentWide]}>
        <View style={s.head}>
          <Text style={[type.pageTitle, { flex: 1 }]}>Tools</Text>
          <View style={{ flexDirection: 'row', gap: space(2) }} accessibilityRole="radiogroup" accessibilityLabel="Detail">
            <Chip label="Simple" on={!advanced} onPress={() => detail(false)} />
            <Chip label="Advanced" on={advanced} onPress={() => detail(true)} />
          </View>
        </View>
        <View style={[s.body, wide && s.bodyWide]}>
          <View style={[s.list, wide && s.listWide]}>
            {TOOLS.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setOpen(t.id)}
                style={[s.item, open === t.id && s.itemOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: open === t.id }}
              >
                <Ionicons name={t.icon} size={22} color={color.iron} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '700' }]}>{t.title}</Text>
                  <Text style={type.small}>{t.detail}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }}>
            {open === 'max' && <OneRepMax advanced={advanced} />}
            {open === 'plates' && <Plates />}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Weight × reps → estimated max, then the weight for every rep count from 1 to 12. */
function OneRepMax({ advanced }: { advanced: boolean }) {
  const units = useUnit();
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('5');
  const kg = units.read(weight);
  const n = Math.round(Number(reps));
  const max = kg ? estimatedOneRepMax(kg, n) : null;
  return (
    <View style={s.card}>
      <Text style={type.title} accessibilityRole="header">One-rep max</Text>
      <View style={s.inputs}>
        <View style={{ flex: 1, gap: space(1) }}>
          <Text style={type.label}>WEIGHT ({units.unit})</Text>
          <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={units.unit === 'lb' ? '185' : '85'} placeholderTextColor={color.placeholder} style={s.input} accessibilityLabel={`Weight lifted in ${units.unit}`} />
        </View>
        <View style={{ flex: 1, gap: space(1) }}>
          <Text style={type.label}>REPS</Text>
          <TextInput value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="5" placeholderTextColor={color.placeholder} style={s.input} accessibilityLabel="Reps done" />
        </View>
      </View>
      {kg && n > 12 && <Text style={type.small}>Up to 12 reps: past that the estimate drifts too far to trust.</Text>}
      {max !== null && (
        <>
          <View accessible accessibilityLabel={`Estimated one-rep max ${units.roundLabel(max)}`}>
            <Text style={type.label}>ESTIMATED MAX</Text>
            <Text style={[type.pageTitle, type.number]}>{units.roundLabel(max)}</Text>
          </View>
          {advanced && (
            <Text style={type.small}>
              Epley’s formula: weight × (1 + reps ÷ 30), so {units.label(kg!)} × (1 + {n} ÷ 30). Each row below runs it backwards.
            </Text>
          )}
          <View style={s.table}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((r) => (
              <View key={r} style={[s.row, r === n && s.rowOn]} accessible accessibilityLabel={`${r} ${r === 1 ? 'rep' : 'reps'}: ${units.roundLabel(weightForReps(max, r))}`}>
                <Text style={[type.body, type.number, { width: 72 }]}>{r} {r === 1 ? 'rep' : 'reps'}</Text>
                <Text style={[type.body, type.number, { flex: 1, fontWeight: '700' }]}>{units.roundLabel(weightForReps(max, r))}</Text>
                {advanced && <Text style={[type.small, type.number]}>{Math.round((weightForReps(max, r) / max) * 100)}%</Text>}
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/** The plate calculator from Train, opened from here. */
function Plates() {
  const units = useUnit();
  const [open, setOpen] = useState(false);
  return (
    <View style={s.card}>
      <Text style={type.title} accessibilityRole="header">Plates</Text>
      <Text style={type.body}>Pick the bar, type the weight, and see each side drawn out, with the nearest weights you can load when it isn’t exact. Your gym’s plates are saved with your training setup.</Text>
      <Pressable onPress={() => setOpen(true)} style={buttons.filled} accessibilityRole="button">
        <Text style={buttons.filledText}>Open the plate calculator</Text>
      </Pressable>
      <PlateCalculator visible={open} weightKg={null} exercise={null} unit={units.unit} onClose={() => setOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), gap: space(4), maxWidth: 640, width: '100%', alignSelf: 'center' },
  contentWide: { maxWidth: 1200, padding: space(6) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3), flexWrap: 'wrap' },
  body: { gap: space(4) },
  bodyWide: { flexDirection: 'row', alignItems: 'flex-start' },
  list: { gap: space(2) },
  listWide: { width: 320 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.row, padding: space(4), minHeight: 44 },
  itemOn: { backgroundColor: color.raised },
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3) },
  inputs: { flexDirection: 'row', gap: space(3) },
  input: { ...type.body, ...type.number, backgroundColor: color.chalk, borderRadius: radius.input, borderWidth: 1, borderColor: color.line, padding: space(3), color: color.iron },
  table: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2), paddingHorizontal: space(3), borderRadius: radius.input },
  rowOn: { backgroundColor: color.raised },
});
