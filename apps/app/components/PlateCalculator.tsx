import { KeyboardLift } from './KeyboardLift';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BARS, DEFAULT_PLATES, fromKg, loadPlates, toKg, type Bar, type WeightUnit } from '@forkbell/shared';
import { useTrainingSetup } from '../lib/training-setup';
import { Chip } from './AmountPicker';
import { ChipRow } from './ChipRow';
import { color, radius, space, type } from '../lib/theme';

// Competition plate colours, by kilogram size (lb plates use the nearest kg size).
const PLATE_COLOR: [number, string][] = [
  [25, '#D2423A'],
  [20, '#2B6BD6'],
  [15, '#E3B505'],
  [10, '#2E9E62'],
  [5, '#E9EDEF'],
  [2.5, '#1C252B'],
  [0, '#9BA7AE'],
];
const plateColor = (p: number, unit: WeightUnit) => {
  const kg = unit === 'lb' ? p * 0.4536 : p;
  return PLATE_COLOR.find(([min]) => kg >= min - 1.2)?.[1] ?? '#9BA7AE';
};
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
const ALL_PLATES: Record<WeightUnit, number[]> = { lb: [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25], kg: [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5] };

/** Pick a sensible bar for an exercise from its equipment and name. */
export function defaultBarId(exercise: { name: string; equipment: string } | null, unit: WeightUnit) {
  const n = exercise?.name.toLowerCase() ?? '';
  const kind = /leg press/.test(n) ? 'legpress' : /hack squat/.test(n) ? 'hack' : /smith/.test(n) ? 'smith' : /t-?bar|landmine/.test(n) ? 'tbar' : /trap bar|hex bar/.test(n) ? 'trap' : /ez|skull/.test(n) ? 'ez' : exercise?.equipment === 'machine' ? 'legpress' : 'olympic';
  return `${kind}-${unit}`;
}

/**
 * How many plates for a weight: pick the bar or machine, see each side drawn
 * out, and get the nearest weights you can load when it isn't exact. Your
 * gym's plates and your own bars are saved with your training setup.
 */
export function PlateCalculator({
  visible,
  weightKg,
  exercise,
  unit,
  onClose,
  onUse,
}: {
  visible: boolean;
  weightKg: number | null;
  exercise: { id: string; name: string; equipment: string } | null;
  unit: WeightUnit;
  onClose: () => void;
  /** use a weight (kg) for the set */
  onUse?: (kg: number) => void;
}) {
  const { setup, save } = useTrainingSetup();
  const bars: Bar[] = [...BARS.filter((b) => b.unit === unit), ...setup.bars.filter((b) => b.unit === unit).map((b) => ({ ...b, custom: true }))];
  const plates = setup.plates[unit] ?? DEFAULT_PLATES[unit];
  const [barId, setBarId] = useState(defaultBarId(exercise, unit));
  const [target, setTarget] = useState('');
  const [editPlates, setEditPlates] = useState(false);
  const [newBar, setNewBar] = useState<{ name: string; weight: string; sides: 1 | 2 } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setBarId((exercise && setup.barFor[exercise.id]) || defaultBarId(exercise, unit));
    setTarget(weightKg ? fmt(Math.round(fromKg(weightKg, unit) * 4) / 4) : '');
    setEditPlates(false);
    setNewBar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const bar = bars.find((b) => b.id === barId) ?? bars[0]!;
  const t = Number(target.replace(',', '.'));
  const load = t > 0 ? loadPlates(t, bar, plates) : null;
  const pickBar = (id: string) => {
    setBarId(id);
    // Remember it for this exercise.
    if (exercise) void save((s) => ({ ...s, barFor: { ...s.barFor, [exercise.id]: id } })).catch(() => {});
  };
  const togglePlate = (p: number) => {
    const next = plates.includes(p) ? plates.filter((x) => x !== p) : [...plates, p].sort((a, b) => b - a);
    if (next.length) void save((s) => ({ ...s, plates: { ...s.plates, [unit]: next } }));
  };
  const addBar = async () => {
    if (!newBar) return;
    const w = Number(newBar.weight.replace(',', '.'));
    if (!newBar.name.trim() || !(w >= 0)) return;
    const id = `custom-${Date.now().toString(36)}`;
    await save((s) => ({ ...s, bars: [...s.bars, { id, name: newBar.name.trim(), weight: w, unit, sides: newBar.sides }] }));
    setNewBar(null);
    pickBar(id);
  };
  const removeBar = (id: string) => void save((s) => ({ ...s, bars: s.bars.filter((b) => b.id !== id) }));
  const step = (by: number) => setTarget(fmt(Math.max(0, (t || bar.weight) + by)));
  const smallest = Math.min(...plates) * bar.sides;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardLift>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.head}>
            <Text style={type.title}>Plate calculator</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: space(3) }} keyboardShouldPersistTaps="handled">
            <View style={s.targetRow}>
              <Pressable onPress={() => step(-smallest)} style={s.stepBtn} accessibilityLabel="Less"><Ionicons name="remove" size={22} color={color.iron} /></Pressable>
              <TextInput value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder={fmt(bar.weight)} style={s.target} accessibilityLabel={`Target weight in ${unit}`} />
              <Text style={[type.title, { color: color.ironSoft }]}>{unit}</Text>
              <Pressable onPress={() => step(smallest)} style={s.stepBtn} accessibilityLabel="More"><Ionicons name="add" size={22} color={color.iron} /></Pressable>
            </View>

            <Text style={type.label}>Bar or machine</Text>
            <ChipRow>
              {bars.map((b) => (
                <Chip key={b.id} label={`${b.name}${b.weight ? ` · ${fmt(b.weight)}` : ''}`} on={b.id === bar.id} onPress={() => pickBar(b.id)} />
              ))}
              <Chip label="+ Your own" on={false} onPress={() => setNewBar({ name: '', weight: '', sides: 2 })} />
            </ChipRow>
            {bar.custom && <Pressable onPress={() => removeBar(bar.id)}><Text style={[type.small, { color: color.over }]}>Remove “{bar.name}”</Text></Pressable>}
            {/typical/.test(bar.name) && <Text style={type.small}>Machines differ: the empty weight is often on a sticker. Add yours with “+ Your own” for exact numbers.</Text>}
            {newBar && (
              <View style={s.box}>
                <TextInput value={newBar.name} onChangeText={(v) => setNewBar({ ...newBar, name: v })} placeholder="Name, e.g. Gym leg press" style={s.input} />
                <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
                  <TextInput value={newBar.weight} onChangeText={(v) => setNewBar({ ...newBar, weight: v })} keyboardType="decimal-pad" placeholder={`Empty weight (${unit})`} style={[s.input, { flex: 1 }]} />
                  <Chip label="Both sides" on={newBar.sides === 2} onPress={() => setNewBar({ ...newBar, sides: 2 })} />
                  <Chip label="One side" on={newBar.sides === 1} onPress={() => setNewBar({ ...newBar, sides: 1 })} />
                </View>
                <Pressable onPress={addBar} style={s.primary}><Text style={s.primaryText}>Save bar</Text></Pressable>
              </View>
            )}

            {load && (
              <View style={s.box}>
                {/* The bar end, drawn with the plates on it, heaviest nearest the middle. */}
                <View style={s.barDraw}>
                  <View style={s.sleeveStop} />
                  {load.perSide.map((p, i) => (
                    <View key={i} style={[s.plate, { backgroundColor: plateColor(p, unit), height: 36 + Math.min(70, p * (unit === 'lb' ? 1.4 : 3)) }]}>
                      <Text style={[s.plateText, { color: plateColor(p, unit) === '#E9EDEF' ? '#1C252B' : '#fff' }]}>{fmt(p)}</Text>
                    </View>
                  ))}
                  <View style={s.sleeve} />
                </View>
                <Text style={[type.body, { fontWeight: '800' }]}>
                  {load.perSide.length ? `${bar.sides === 2 ? 'Each side' : 'On the end'}: ${load.perSide.map(fmt).join(' + ')}` : bar.weight ? 'Just the bar' : 'No plates'}
                </Text>
                <Text style={type.small}>
                  {fmt(load.total)} {unit} = {bar.weight ? `${fmt(bar.weight)} ${bar.name.toLowerCase().includes('sled') || bar.name.toLowerCase().includes('machine') ? 'machine' : 'bar'} + ` : ''}
                  {fmt(load.total - bar.weight)} in plates
                </Text>
                {load.nearest && (
                  <View style={{ gap: space(2) }}>
                    <Text style={[type.small, { color: color.warnText }]}>{fmt(t)} {unit} can’t be loaded exactly with your plates.</Text>
                    <View style={{ flexDirection: 'row', gap: space(2) }}>
                      <Chip label={`Use ${fmt(load.nearest.below)}`} on={false} onPress={() => setTarget(fmt(load.nearest!.below))} />
                      {load.nearest.above !== null && <Chip label={`Use ${fmt(load.nearest.above)}`} on={false} onPress={() => setTarget(fmt(load.nearest!.above!))} />}
                    </View>
                  </View>
                )}
                {t > 0 && t < bar.weight && <Text style={[type.small, { color: color.over }]}>That’s less than the {bar.name.toLowerCase()} weighs ({fmt(bar.weight)} {unit}).</Text>}
              </View>
            )}

            <Pressable onPress={() => setEditPlates(!editPlates)}>
              <Text style={s.link}>{editPlates ? 'Done with plates' : `Plates at your gym: ${plates.map(fmt).join(', ')} ›`}</Text>
            </Pressable>
            {editPlates && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
                {ALL_PLATES[unit].map((p) => <Chip key={p} label={`${fmt(p)} ${unit}`} on={plates.includes(p)} onPress={() => togglePlate(p)} />)}
              </View>
            )}
            {onUse && load && load.total > 0 && (
              <Pressable onPress={() => { onUse(toKg(load.total, unit)); onClose(); }} style={s.primary}>
                <Text style={s.primaryText}>Use {fmt(load.total)} {unit} for this set</Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardLift>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(3), maxHeight: '92%', maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), justifyContent: 'center' },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  target: { fontSize: 40, fontWeight: '900', color: color.iron, textAlign: 'center', minWidth: 120, fontVariant: ['tabular-nums'] },
  box: { backgroundColor: color.raised, borderRadius: radius.card, padding: space(3), gap: space(2) },
  barDraw: { flexDirection: 'row', alignItems: 'center', height: 110, gap: 2 },
  sleeveStop: { width: 10, height: 34, borderRadius: 3, backgroundColor: '#9BA7AE' },
  plate: { width: 22, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  plateText: { fontSize: 9, fontWeight: '900', transform: [{ rotate: '-90deg' }], width: 40, textAlign: 'center' },
  sleeve: { flex: 1, height: 12, borderRadius: 3, backgroundColor: '#9BA7AE' },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  link: { color: color.accent, fontWeight: '700' },
  primary: { backgroundColor: color.accent, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  primaryText: { color: color.onAccent, fontWeight: '700', fontSize: 16 },
});
