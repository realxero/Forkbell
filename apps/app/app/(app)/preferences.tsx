import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ALLERGENS, DIETS, checkFood, defaultPreferences, type Preferences } from '@forkbell/shared';
import { put } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Chip } from '../../components/AmountPicker';
import { color, space, type } from '../../lib/theme';

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Food preferences and suggestion settings. */
export default function PreferencesScreen() {
  const { me, refreshMe } = useAuth();
  const [p, setP] = useState<Preferences>(me?.preferences ?? defaultPreferences());
  const [avoid, setAvoid] = useState(p.avoid.join(', '));
  const [dislikes, setDislikes] = useState(p.dislikes.join(', '));
  const [never, setNever] = useState(p.neverSuggest.join(', '));
  const [testName, setTestName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const current = (): Preferences => ({ ...p, avoid: list(avoid), dislikes: list(dislikes), neverSuggest: list(never) });
  const test = testName.trim() ? checkFood(testName, current()) : null;

  const save = async () => {
    try {
      await put('/api/me/preferences', current());
      await refreshMe();
      router.back();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const toggleAllergy = (a: (typeof ALLERGENS)[number]) => setP({ ...p, allergies: p.allergies.includes(a) ? p.allergies.filter((x) => x !== a) : [...p.allergies, a] });
  const sw = (label: string, value: boolean, set: (v: boolean) => void) => (
    <View style={s.row}>
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={set} />
    </View>
  );
  const sg = p.suggestions;

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>Cancel</Text></Pressable>
          <Text style={type.title}>Food and suggestions</Text>
          <Pressable onPress={save} hitSlop={12}><Text style={s.link}>Save</Text></Pressable>
        </View>
        {status && <Text style={s.error}>{status}</Text>}

        <Text style={s.section}>Allergies</Text>
        <View style={s.chips}>{ALLERGENS.map((a) => <Chip key={a} label={cap(a)} on={p.allergies.includes(a)} onPress={() => toggleAllergy(a)} />)}</View>
        <Text style={s.label}>Anything else to keep out completely (comma-separated)</Text>
        <TextInput value={avoid} onChangeText={setAvoid} placeholder="e.g. mushrooms, alcohol" style={s.input} />
        <Text style={s.note}>
          Forkbell checks food names only; it has no ingredient lists. It errs toward keeping things out, but it can’t see sauces, hidden ingredients or cross-contact, so it never tells you a food is safe. Always check labels.
        </Text>

        <Text style={s.section}>Diet</Text>
        <View style={s.chips}>{DIETS.map((d) => <Chip key={d} label={d === 'none' ? 'No restriction' : cap(d)} on={p.diet === d} onPress={() => setP({ ...p, diet: d })} />)}</View>

        <Text style={s.label}>Foods you dislike (never suggested, still loggable)</Text>
        <TextInput value={dislikes} onChangeText={setDislikes} placeholder="e.g. olives, cilantro" style={s.input} />
        <Text style={s.label}>Never suggest these</Text>
        <TextInput value={never} onChangeText={setNever} placeholder="e.g. cottage cheese" style={s.input} />

        <Text style={s.label}>Test a food</Text>
        <TextInput value={testName} onChangeText={setTestName} placeholder="Type a food name" style={s.input} />
        {test && <Text style={[type.small, { color: test.skip ? color.over : color.fat }]}>{test.skip ? `Kept out of suggestions: ${test.reasons.join('; ')}.` : 'Nothing on your lists matches this name (that doesn’t mean it’s safe).'}</Text>}

        <Text style={s.section}>Smart suggestions</Text>
        {sw('Show suggestions in the diary', sg.enabled, (v) => setP({ ...p, suggestions: { ...sg, enabled: v } }))}
        {sg.enabled && (
          <>
            <Text style={s.label}>How often</Text>
            <View style={s.chips}>
              {(['gentle', 'balanced', 'thorough'] as const).map((x) => <Chip key={x} label={cap(x)} on={sg.strictness === x} onPress={() => setP({ ...p, suggestions: { ...sg, strictness: x } })} />)}
            </View>
            <Text style={s.note}>Gentle only speaks up for very sugary drinks and big protein gaps, later in the day. Thorough notices smaller things.</Text>
            {sw('Lighter drink swaps', sg.drinks, (v) => setP({ ...p, suggestions: { ...sg, drinks: v } }))}
            {sw('Protein ideas', sg.protein, (v) => setP({ ...p, suggestions: { ...sg, protein: v } }))}
            {sw('Fiber ideas', sg.fiber, (v) => setP({ ...p, suggestions: { ...sg, fiber: v } }))}
            {sw('Sodium heads-up', sg.sodium, (v) => setP({ ...p, suggestions: { ...sg, sodium: v } }))}
          </>
        )}

        <Text style={s.section}>Training</Text>
        {sw('Safety tips on exercises', p.trainingTips, (v) => setP({ ...p, trainingTips: v }))}
        <Text style={s.note}>Lighter-day and check-up tips, and big-jump heads-ups. Pain you flag always shows next time.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(2), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(2) },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  error: { ...type.body, color: color.over },
  section: { ...type.title, fontSize: 17, marginTop: space(4) },
  label: { ...type.small, marginTop: space(2) },
  note: { ...type.small },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(1) },
});
