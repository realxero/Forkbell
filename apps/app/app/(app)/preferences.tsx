import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ALLERGENS, BODY_AREAS, DIETS, EQUIPMENT_KINDS, checkFood, defaultPreferences, preferencesSchema, type Preferences } from '@forkbell/shared';
import { put } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Chip } from '../../components/AmountPicker';
import { color, space, type } from '../../lib/theme';

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Food preferences and suggestion settings. */
export default function PreferencesScreen() {
  const { me, refreshMe } = useAuth();
  // Parsing fills in settings added since this copy was saved (e.g. offline).
  const [p, setP] = useState<Preferences>(me ? preferencesSchema.parse(me.preferences) : defaultPreferences());
  const [avoid, setAvoid] = useState(p.avoid.join(', '));
  const [dislikes, setDislikes] = useState(p.dislikes.join(', '));
  const [never, setNever] = useState(p.neverSuggest.join(', '));
  const [neverLifts, setNeverLifts] = useState(p.training.neverSuggest.join(', '));
  const [testName, setTestName] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const current = (): Preferences => ({ ...p, avoid: list(avoid), dislikes: list(dislikes), neverSuggest: list(never), training: { ...p.training, neverSuggest: list(neverLifts) } });
  const t = p.training;
  const toggle = <K extends 'equipment' | 'protectedAreas'>(key: K, v: Preferences['training'][K][number]) => {
    const now = t[key] as string[];
    setP({ ...p, training: { ...t, [key]: now.includes(v) ? now.filter((x) => x !== v) : [...now, v] } });
  };
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
            {sw('Saturated fat heads-up', sg.satFat, (v) => setP({ ...p, suggestions: { ...sg, satFat: v } }))}
            {sw('Sugar heads-up (needs a limit below)', sg.sugar, (v) => setP({ ...p, suggestions: { ...sg, sugar: v } }))}
            {sw('Fat heads-up (uses your fat goal)', sg.fat, (v) => setP({ ...p, suggestions: { ...sg, fat: v } }))}
            <Text style={s.label}>Your daily limits (empty uses 2,300 mg sodium and 20 g saturated fat; sugar is only watched with a limit)</Text>
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              {([['sodiumMg', 'Sodium mg'], ['satFatG', 'Sat. fat g'], ['sugarG', 'Sugar g']] as const).map(([k, label]) => (
                <View key={k} style={{ flex: 1, gap: 2 }}>
                  <Text style={type.small}>{label}</Text>
                  <TextInput
                    defaultValue={sg.limits[k] === null ? '' : String(sg.limits[k])}
                    onChangeText={(t) => {
                      const v = t.trim() ? Number(t.replace(',', '.')) : null;
                      setP((x) => ({ ...x, suggestions: { ...x.suggestions, limits: { ...x.suggestions.limits, [k]: v !== null && Number.isFinite(v) ? v : null } } }));
                    }}
                    keyboardType="number-pad"
                    style={s.input}
                    accessibilityLabel={`${label} limit`}
                  />
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={s.section}>Bell</Text>
        {sw('Ask me when it’s unsure', p.bell.askWhenUnsure, (v) => setP({ ...p, bell: { ...p.bell, askWhenUnsure: v } }))}
        <Text style={s.note}>When a portion or how something was cooked would change the calories a lot, Bell asks one quick question instead of guessing. You can always tap “Just estimate it”.</Text>
        {sw('Send voice messages when I let go', p.bell.voiceSends, (v) => setP({ ...p, bell: { ...p.bell, voiceSends: v } }))}
        <Text style={s.label}>Read Bell’s answers aloud</Text>
        <View style={s.chips}>
          {(['voice', 'always', 'never'] as const).map((x) => (
            <Chip key={x} label={x === 'voice' ? 'When I ask by voice' : x === 'always' ? 'Always' : 'Never'} on={p.bell.readAloud === x} onPress={() => setP({ ...p, bell: { ...p.bell, readAloud: x } })} />
          ))}
        </View>
        {sw('Patterns card on Progress', p.patterns, (v) => setP({ ...p, patterns: v }))}
        <Text style={s.note}>Off: what you said goes into the message box so you can fix it first.</Text>

        <Text style={s.section}>Training</Text>
        {sw('Safety tips on exercises', p.trainingTips, (v) => setP({ ...p, trainingTips: v }))}
        <Text style={s.note}>Lighter-day, check-up and stalled-lift tips, and big-jump heads-ups. Pain you flag always shows next time.</Text>
        {t.hiddenTips.length > 0 && (
          <Pressable onPress={() => setP({ ...p, training: { ...t, hiddenTips: [] } })} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={s.link}>Show tips again for the {t.hiddenTips.length} {t.hiddenTips.length === 1 ? 'exercise' : 'exercises'} you hid them on</Text>
          </Pressable>
        )}

        <Text style={s.label}>Equipment you have</Text>
        <View style={s.chips}>
          <Chip label="Full gym" on={t.equipment.length === 0} onPress={() => setP({ ...p, training: { ...t, equipment: [] } })} />
          {EQUIPMENT_KINDS.map((e) => <Chip key={e} label={cap(e)} on={t.equipment.includes(e)} onPress={() => toggle('equipment', e)} />)}
        </View>
        <Text style={s.note}>Swaps and Bell only suggest what you can do. Bodyweight exercises always count.</Text>

        <Text style={s.label}>Go easy on</Text>
        <View style={s.chips}>{BODY_AREAS.map((a) => <Chip key={a} label={cap(a)} on={t.protectedAreas.includes(a)} onPress={() => toggle('protectedAreas', a)} />)}</View>
        <Text style={s.note}>Swaps steer away from exercises that load these, and say when one is easier on them. This isn’t medical advice; if something hurts, get it checked.</Text>

        <Text style={s.label}>Never suggest these exercises</Text>
        <TextInput value={neverLifts} onChangeText={setNeverLifts} placeholder="e.g. upright row, good morning" placeholderTextColor={color.placeholder} style={s.input} />
        <Text style={s.note}>You can still log them; they just won’t be offered as swaps.</Text>
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
