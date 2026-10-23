import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { DiaryEntry } from '@forkbell/shared';
import { api, ApiError } from '../../lib/api';
import { deleteEntry, findCachedEntry, updateEntry } from '../../lib/actions';
import { AmountPicker } from '../../components/AmountPicker';
import { color, space, type } from '../../lib/theme';

/** Change an entry's amount or meal, or remove it. */
export default function EditEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = findCachedEntry(id);
    api<{ entry: DiaryEntry }>(`/api/diary/entry/${id}`).then(
      (r) => setEntry(r.entry),
      (e) => (cached && (e instanceof ApiError ? e.status === 0 || e.status === 404 : false) ? setEntry(cached) : setError(e instanceof Error ? e.message : String(e))),
    );
  }, [id]);

  const remove = async () => {
    try {
      await deleteEntry(entry!);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.head}>
          <Text style={type.title}>Edit entry</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={s.link}>Cancel</Text>
          </Pressable>
        </View>
        {!entry ? (
          error ? <Text style={[s.error, { padding: space(4) }]}>{error}</Text> : <ActivityIndicator color={color.iron} style={{ marginTop: space(10) }} />
        ) : (
          <AmountPicker
            food={entry.food}
            initialGrams={entry.grams}
            initialMeal={entry.meal}
            submitLabel={() => 'Save'}
            error={error}
            onSubmit={async (grams, meal) => {
              setError(null);
              try {
                await updateEntry(entry, { grams, meal });
                router.back();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            <Pressable onPress={remove} style={s.remove} accessibilityLabel={`Remove ${entry.food.name}`}>
              <Text style={s.removeText}>Remove from diary</Text>
            </Pressable>
          </AmountPicker>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space(4) },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  remove: { alignSelf: 'center', padding: space(3), marginTop: space(2) },
  removeText: { color: color.over, fontWeight: '700', fontSize: 16 },
});
