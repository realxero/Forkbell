// Water Bell suggests logging: one tap to add it, the same as food. Nothing
// is logged until then; Undo on the Water card takes it back.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { waterText } from '@forkbell/shared';
import { useAuth } from '../lib/auth';
import { addWater } from '../lib/actions';
import { haptic } from '../lib/haptics';
import { color, radius, space, type } from '../lib/theme';

export function WaterProposal({ ml, date, onAdded }: { ml: number; date: string; onAdded?: () => void }) {
  const { me } = useAuth();
  const unit = me?.weightUnit ?? 'lb';
  const [state, setState] = useState<'ready' | 'adding' | 'added' | string>('ready');
  const add = async () => {
    haptic.tap();
    setState('adding');
    try {
      await addWater(date, ml);
      setState('added');
      onAdded?.();
    } catch (e) {
      setState(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <View style={s.card}>
      <Ionicons name="water" size={20} color={color.water} />
      <Text style={[type.body, { flex: 1, fontWeight: '700' }]}>{waterText(ml, unit)} of water</Text>
      {state === 'added' ? (
        <Text style={[type.small, { color: color.water, fontWeight: '800' }]}>Added ✓</Text>
      ) : (
        <Pressable onPress={() => void add()} disabled={state === 'adding'} style={s.button} accessibilityRole="button" accessibilityLabel={`Add ${waterText(ml, unit)} of water`}>
          <Text style={s.buttonText}>{state === 'adding' ? 'Adding…' : 'Add'}</Text>
        </Pressable>
      )}
      {state !== 'ready' && state !== 'adding' && state !== 'added' && <Text style={[type.small, { color: color.over }]}>{state}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space(2), backgroundColor: color.waterBg, borderRadius: radius.row, padding: space(3) },
  button: { backgroundColor: color.water, borderRadius: 10, paddingHorizontal: space(4), paddingVertical: space(2) },
  buttonText: { color: '#fff', fontWeight: '800' },
});
