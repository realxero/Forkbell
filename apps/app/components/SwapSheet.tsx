// Ranked swaps for one exercise, each with why it fits. Uses your equipment,
// areas to protect and never-suggest list; "Pick any exercise" is always there.
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Tap';
import { SheetFrame } from './Sheet';
import Ionicons from '@expo/vector-icons/Ionicons';
import { rankSwaps, type Exercise, type Swap } from '@forkbell/shared';
import { cachedGet } from '../lib/sync';
import { useTrainingSetup } from '../lib/training-setup';
import { color, radius, space, type, textSize } from '../lib/theme';
import { SkeletonRows } from './Skeleton';

export function SwapSheet({ target, onPick, onPickAny, onClose }: { target: Exercise | null; onPick: (e: Exercise) => void; onPickAny: () => void; onClose: () => void }) {
  const { setup } = useTrainingSetup();
  const [swaps, setSwaps] = useState<Swap[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setSwaps(null);
    setError(null);
    cachedGet<{ exercises: (Exercise & { uses: number })[] }>('/api/exercises').then(
      (r) => setSwaps(rankSwaps(target, r.exercises, setup)),
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
    // setup is read once per opening; changing it happens elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const limited = setup.equipment.length > 0 || setup.protectedAreas.length > 0 || setup.neverSuggest.length > 0;

  return (
    <Modal visible={Boolean(target)} transparent animationType="slide" onRequestClose={onClose}>
      <SheetFrame onClose={onClose} style={s.sheet}>
        <View style={s.head}>
          <Text style={[type.title, { flex: 1 }]} numberOfLines={2}>
            Swap {target?.name}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={s.close} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={color.ironSoft} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: space(2) }}>
          {!swaps && !error && <SkeletonRows rows={3} />}
          {error && <Text style={[type.body, { color: color.over }]}>{error}</Text>}
          {swaps?.length === 0 && (
            <Text style={type.body}>
              Nothing else for your {target?.muscle} fits{limited ? ' your equipment, areas to protect and never-suggest list' : ''}. Pick any exercise instead.
            </Text>
          )}
          {swaps?.map(({ exercise, reasons }) => (
            <Pressable key={exercise.id} onPress={() => onPick(exercise)} style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]} accessibilityHint={reasons.join(', ')}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.body, { fontWeight: '700' }]}>{exercise.name}</Text>
                <Text style={type.small}>{reasons.map((r, i) => (i === 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r)).join(' · ')}</Text>
              </View>
              <Ionicons name="swap-horizontal" size={20} color={color.accent} />
            </Pressable>
          ))}
        </ScrollView>
        <Pressable onPress={onPickAny} style={s.any}>
          <Text style={s.anyText}>Pick any exercise</Text>
        </Pressable>
        {limited && <Text style={[type.small, { textAlign: 'center' }]}>Using your training setup from Settings, Food and suggestions.</Text>}
      </SheetFrame>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: { maxHeight: '80%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 56, padding: space(3), borderRadius: radius.row, backgroundColor: color.raised },
  any: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.row, borderWidth: 1, borderColor: color.accent },
  anyText: { color: color.accent, fontWeight: '700', fontSize: textSize.body },
});
