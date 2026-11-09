import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Tap';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setViewing, useViewing } from '../lib/profile';
import { cachedGet } from '../lib/sync';
import { useWide } from '../lib/layout';
import { color, radius, space, textSize } from '../lib/theme';

type Person = { personId: string; name: string; permissions: string[] };

/**
 * A bar across the top whenever you're looking at someone else's data. On a
 * wide screen, when people have shared with you (family, or clients you
 * coach), it's a switcher: you and each of them, one click apart.
 */
export function ProfileBar() {
  const v = useViewing();
  const insets = useSafeAreaInsets();
  const wide = useWide();
  const [people, setPeople] = useState<Person[]>([]);
  useEffect(() => {
    if (!wide) return;
    cachedGet<{ sharedWithMe: Person[] }>('/api/shares').then((r) => setPeople(r.sharedWithMe), () => {});
  }, [wide, v?.id]);
  const go = (p: Person | null) => {
    setViewing(p && { id: p.personId, name: p.name, permissions: p.permissions });
    router.replace('/');
  };
  if (wide && people.length > 0) {
    const coaching = (p: Person) => p.permissions.includes('plan_write') || p.permissions.includes('food_plan');
    return (
      <View style={[s.bar, s.switcher]} accessibilityRole="tablist" accessibilityLabel="Whose data">
        <Text style={s.text}>Viewing</Text>
        {[null, ...people].map((p) => {
          const on = (p?.personId ?? null) === (v?.id ?? null);
          return (
            <Pressable key={p?.personId ?? 'me'} onPress={() => go(p)} style={[s.chip, on && s.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[s.chipText, on && { color: color.iron }]}>{p ? `${p.name}${coaching(p) ? ' · client' : ''}` : 'You'}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  if (!v) return null;
  return (
    <View style={[s.bar, { paddingTop: insets.top + space(1) }]}>
      <Text style={s.text} numberOfLines={1}>Viewing {v.name}’s data</Text>
      <Pressable onPress={() => { setViewing(null); router.replace('/'); }} hitSlop={10} accessibilityRole="button">
        <Text style={[s.text, { textDecorationLine: 'underline' }]}>Back to mine</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { backgroundColor: color.iron, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space(4), paddingBottom: space(2), gap: space(3) },
  text: { color: color.chalk, fontWeight: '700', fontSize: textSize.control },
  switcher: { justifyContent: 'flex-start', flexWrap: 'wrap', paddingTop: space(2) },
  chip: { minHeight: 44, paddingHorizontal: space(3), borderRadius: radius.pill, borderWidth: 1, borderColor: color.ironSoft, justifyContent: 'center' },
  chipOn: { backgroundColor: color.chalk, borderColor: color.chalk },
  chipText: { color: color.chalk, fontWeight: '700', fontSize: textSize.control },
});
