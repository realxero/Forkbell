import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { shareText } from '../../lib/share';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { aisleOf, nextDays, shoppingList, todayLocal, type DiaryDay, type ShoppingItem } from '@forkbell/shared';
import { cachedGet, readCache, writeCache } from '../../lib/sync';
import { color, space, type } from '../../lib/theme';

const KEY = 'device:shopping';
type Saved = { ticked: string[]; extra: string[] };

/** Everything in the diary for the next week, added up and grouped by aisle, plus your own items. */
export default function Shopping() {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [saved, setSaved] = useState<Saved>(readCache<Saved>(KEY) ?? { ticked: [], extra: [] });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = (next: Saved) => {
    setSaved(next);
    writeCache(KEY, next);
  };

  const load = useCallback(async () => {
    try {
      const days = await Promise.all(nextDays(todayLocal(), 7).map((d) => cachedGet<DiaryDay>(`/api/diary/${d}`).catch(() => null)));
      setItems(shoppingList(days.flatMap((d) => d?.entries ?? [])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const all: ShoppingItem[] = [...(items ?? []), ...saved.extra.map((name) => ({ name, grams: 0, aisle: aisleOf(name) }))];
  const aisles = [...new Set(all.map((i) => i.aisle))];
  const amount = (g: number) => (g >= 1000 ? `${Math.round(g / 100) / 10} kg` : `${Math.round(g)} g`);
  const toggle = (name: string) => save({ ...saved, ticked: saved.ticked.includes(name) ? saved.ticked.filter((x) => x !== name) : [...saved.ticked, name] });
  const asText = () => aisles.map((a) => `${a}\n${all.filter((i) => i.aisle === a).map((i) => `- ${i.name}${i.grams ? ` (${amount(i.grams)})` : ''}`).join('\n')}`).join('\n\n');

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
          <Pressable onPress={() => void shareText(asText())} hitSlop={12}><Text style={s.link}>Share</Text></Pressable>
        </View>
        <Text style={[type.hero, { fontSize: 30 }]}>Shopping list</Text>
        <Text style={type.small}>Everything planned or logged for today and the next 6 days, added up. Amounts are what you’ll eat, not package sizes.</Text>
        {error && <Text style={s.error}>{error}</Text>}
        {!items && !error && <ActivityIndicator color={color.iron} />}
        {items && all.length === 0 && <Text style={type.body}>Nothing planned yet. Plan a few days first, or add items below.</Text>}
        {aisles.map((a) => (
          <View key={a} style={s.card}>
            <Text style={[type.small, { fontWeight: '700' }]}>{a}</Text>
            {all.filter((i) => i.aisle === a).map((i) => {
              const done = saved.ticked.includes(i.name);
              return (
                <Pressable key={i.name} onPress={() => toggle(i.name)} style={s.row} accessibilityRole="checkbox" accessibilityState={{ checked: done }}>
                  <View style={[s.box, done && s.boxOn]}><Text style={{ color: color.card, fontWeight: '800' }}>{done ? '✓' : ''}</Text></View>
                  <Text style={[type.body, { flex: 1 }, done && { textDecorationLine: 'line-through', color: color.ironSoft }]}>{i.name}</Text>
                  {i.grams > 0 && <Text style={[type.small, type.number]}>{amount(i.grams)}</Text>}
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={s.row}>
          <TextInput value={text} onChangeText={setText} placeholder="Add an item" style={[s.input, { flex: 1 }]} onSubmitEditing={() => { if (text.trim()) save({ ...saved, extra: [...saved.extra, text.trim()] }); setText(''); }} />
        </View>
        {(saved.ticked.length > 0 || saved.extra.length > 0) && (
          <Pressable onPress={() => save({ ticked: [], extra: [] })}><Text style={[s.link, { color: color.over }]}>Clear ticks and added items</Text></Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  card: { backgroundColor: color.card, borderRadius: 14, padding: space(4), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.fat, borderColor: color.fat },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
});
