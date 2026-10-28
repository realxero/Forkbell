// Settings → Export, import and backup → Import food history: a food diary
// CSV from MyFitnessPal, Lose It, Cronometer or Yazio. Read on the phone,
// previewed (days, lines, dates, days already here), then imported in one go.
// Days you've already logged in Forkbell are never touched.
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { FOOD_IMPORT_APPS, parseFoodExport, type FoodImportFormat, type FoodImportResult, type ImportedFoodLine } from '@forkbell/shared';
import { post } from '../lib/api';
import { color, radius, space, type } from '../lib/theme';

const niceDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export function ImportFoodHistory() {
  const [plan, setPlan] = useState<{ format: FoodImportFormat; lines: ImportedFoodLine[]; preview: FoodImportResult; problems: string[] } | null>(null);
  const [markComplete, setMarkComplete] = useState(true);
  const [done, setDone] = useState<FoodImportResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async () => {
    setProblem(null);
    setDone(null);
    setPlan(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true }).catch(() => null);
    const asset = r && !r.canceled ? r.assets[0] : null;
    if (!asset) return;
    setBusy('Reading…');
    try {
      const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
      const parsed = parseFoodExport(text);
      if (!parsed.format || !parsed.lines.length) throw new Error(parsed.problems.join(' '));
      const lines = parsed.lines.slice(-20000);
      const preview = await post<FoodImportResult>('/api/import/foods', { format: parsed.format, lines, dryRun: true });
      setPlan({ format: parsed.format, lines, preview, problems: parsed.problems });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const go = async () => {
    if (!plan) return;
    setBusy('Importing…');
    try {
      setDone(await post<FoodImportResult>('/api/import/foods', { format: plan.format, lines: plan.lines, markComplete, dryRun: false }));
      setPlan(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const p = plan?.preview;

  return (
    <View style={s.card}>
      <Text style={type.label}>Import food history</Text>
      <Text style={type.small}>
        Your food diary from MyFitnessPal, Lose It, Cronometer or Yazio, as a CSV file from that app’s export (on their website, usually under Reports or Account → Export). Days you’ve already logged in Forkbell are left as they are. MyFitnessPal only exports each meal’s totals, so those come in as one line per meal.
      </Text>
      <Pressable onPress={() => void pick()} disabled={Boolean(busy)} style={({ pressed }) => [s.button, (pressed || busy) && { opacity: 0.6 }]} accessibilityRole="button">
        <Text style={s.buttonText}>Choose the CSV file</Text>
      </Pressable>
      {busy && (
        <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
          <ActivityIndicator color={color.iron} />
          <Text style={type.small}>{busy}</Text>
        </View>
      )}
      {problem && <Text style={[type.small, { color: color.over }]}>{problem}</Text>}
      {plan && p && (
        <View style={{ gap: space(2) }}>
          <Text style={[type.body, { fontWeight: '700' }]}>
            {FOOD_IMPORT_APPS[plan.format]}: {p.days.toLocaleString()} days, {p.lines.toLocaleString()} lines{p.from ? `, ${niceDate(p.from)} to ${niceDate(p.to)}` : ''}
          </Text>
          {p.skippedDays > 0 && <Text style={type.small}>{p.skippedDays} day{p.skippedDays === 1 ? '' : 's'} already logged in Forkbell will be left as {p.skippedDays === 1 ? 'it is' : 'they are'}.</Text>}
          {plan.problems.map((x) => <Text key={x} style={type.small}>{x}</Text>)}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
            <Text style={[type.body, { flex: 1 }]}>Count these days as finished</Text>
            <Switch value={markComplete} onValueChange={setMarkComplete} accessibilityLabel="Count imported days as finished" />
          </View>
          <Text style={type.small}>Finished days (with your weigh-ins) let Forkbell work out your daily burn sooner. Leave it on if you logged fully in the other app.</Text>
          {p.lines > 0 ? (
            <Pressable onPress={() => void go()} disabled={Boolean(busy)} style={[s.button, { backgroundColor: color.accent }]} accessibilityRole="button">
              <Text style={[s.buttonText, { color: color.onAccent }]}>Import {p.days.toLocaleString()} days</Text>
            </Pressable>
          ) : (
            <Text style={type.small}>Nothing new to import.</Text>
          )}
        </View>
      )}
      {done && (
        <Text style={[type.body, { fontWeight: '700', color: color.fat }]}>
          Imported {done.days.toLocaleString()} days ({done.lines.toLocaleString()} lines). They’re in your diary and Progress; the foods stay out of search and your lists.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.row, padding: space(3), gap: space(2) },
  button: { backgroundColor: color.chalk, borderRadius: 10, paddingVertical: space(3), alignItems: 'center', borderWidth: 1, borderColor: color.line },
  buttonText: { color: color.iron, fontWeight: '700', fontSize: 15 },
});
