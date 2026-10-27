// Recipes → Import a recipe: paste a link (a recipe site, or your Mealie) or
// the ingredient list. Bell works out each ingredient; you check them here,
// then they open in the recipe editor like any recipe, to adjust and save.
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { forAmount, type Food, type Per100 } from '@forkbell/shared';
import { post } from '../lib/api';
import { createFood } from '../lib/actions';
import { KeyboardLift } from './KeyboardLift';
import { color, radius, space, type } from '../lib/theme';

type Ingredient = { line: string; name: string; grams: number; per100: Per100; match: Food | null };
type Preview = { name: string; servings: number; source: 'web' | 'mealie' | 'text'; ingredients: Ingredient[]; skipped: string[] };

export function ImportRecipe({ visible, onClose, onReady }: { visible: boolean; onClose: () => void; onReady: (draft: { name: string; servings: string; items: { food: Food; grams: number }[] }) => void }) {
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const read = async () => {
    setBusy('Reading the recipe…');
    setProblem(null);
    try {
      setPreview(await post<Preview>('/api/recipes/import/preview', { source: source.trim() }));
      setSkip(new Set());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const use = async () => {
    if (!preview) return;
    setBusy('Adding the ingredients…');
    setProblem(null);
    try {
      const items: { food: Food; grams: number }[] = [];
      for (const [i, ing] of preview.ingredients.entries()) {
        if (skip.has(i)) continue;
        // A food you have is used as it is; a new one is saved to your foods.
        const food = ing.match ?? (await createFood({ name: ing.name.slice(0, 1).toUpperCase() + ing.name.slice(1), brand: null, source: 'custom', per100: ing.per100, servingGrams: null, barcode: null }));
        items.push({ food, grams: ing.grams });
      }
      onReady({ name: preview.name, servings: String(preview.servings), items });
      setPreview(null);
      setSource('');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const close = () => {
    if (busy) return;
    setPreview(null);
    setProblem(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardLift>
        <Pressable style={s.backdrop} onPress={close}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.head}>
              <Text style={type.title}>Import a recipe</Text>
              <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: space(3) }} keyboardShouldPersistTaps="handled">
              {!preview ? (
                <>
                  <Text style={type.small}>Paste a link to a recipe (most recipe sites, or one from your Mealie), or the ingredient list, one per line. A first line without numbers becomes the name.</Text>
                  <TextInput
                    value={source}
                    onChangeText={setSource}
                    multiline
                    placeholder={'https://…\nor\nPancakes\n1 cup flour\n2 eggs'}
                    placeholderTextColor={color.placeholder}
                    autoCapitalize="none"
                    style={s.input}
                    accessibilityLabel="Recipe link or ingredients"
                  />
                  <Pressable onPress={() => void read()} disabled={!source.trim() || Boolean(busy)} style={[s.button, (!source.trim() || busy) && { opacity: 0.5 }]} accessibilityRole="button">
                    <Text style={s.buttonText}>Read it</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={[type.body, { fontWeight: '700' }]}>
                    {preview.name} · {preview.servings} serving{preview.servings === 1 ? '' : 's'}
                  </Text>
                  <Text style={type.small}>Untick anything that’s wrong; you can change amounts and add more in the next step.</Text>
                  {preview.ingredients.map((ing, i) => {
                    const off = skip.has(i);
                    return (
                      <Pressable
                        key={i}
                        onPress={() => setSkip((set) => {
                          const next = new Set(set);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })}
                        style={[s.row, off && { opacity: 0.45 }]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !off }}
                      >
                        <Ionicons name={off ? 'square-outline' : 'checkbox'} size={22} color={off ? color.ironSoft : color.fat} />
                        <View style={{ flex: 1 }}>
                          <Text style={[type.body, { fontWeight: '600' }]}>{ing.match?.name ?? ing.name}</Text>
                          <Text style={type.small}>
                            {Math.round(ing.grams)} g · {forAmount(ing.per100, ing.grams).kcal} kcal · {ing.match ? 'a food you have' : 'new food (estimate)'}
                          </Text>
                          <Text style={[type.small, { fontStyle: 'italic' }]}>“{ing.line}”</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  {preview.skipped.length > 0 && <Text style={type.small}>Left out (no amount, or not an ingredient): {preview.skipped.join('; ')}</Text>}
                  <Pressable onPress={() => void use()} disabled={Boolean(busy)} style={[s.button, busy && { opacity: 0.5 }]} accessibilityRole="button">
                    <Text style={s.buttonText}>Use {preview.ingredients.length - skip.size} ingredients</Text>
                  </Pressable>
                  <Pressable onPress={() => setPreview(null)} hitSlop={8} style={{ alignSelf: 'center' }}><Text style={s.link}>Start again</Text></Pressable>
                </>
              )}
              {busy && (
                <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
                  <ActivityIndicator color={color.iron} />
                  <Text style={type.small}>{busy}</Text>
                </View>
              )}
              {problem && <Text style={[type.small, { color: color.over }]}>{problem}</Text>}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardLift>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(3), maxHeight: '92%', maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { ...type.body, minHeight: 140, textAlignVertical: 'top', backgroundColor: color.chalk, borderRadius: 10, borderWidth: 1, borderColor: color.line, padding: space(3), color: color.iron },
  row: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start', paddingVertical: space(1) },
  button: { backgroundColor: color.iron, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  buttonText: { color: color.chalk, fontWeight: '800', fontSize: 16 },
  link: { color: color.accent, fontWeight: '700' },
});
