// Settings → Export and backup → Import workouts: a CSV export from Strong,
// Hevy or FitNotes. Read on the phone, previewed (what matches, what will be
// added, what's already here), then imported in one go. Importing the same
// file again adds nothing.
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { IMPORT_APPS, parseWorkoutExport, type ImportedWorkout, type ImportFormat, type WeightUnit, type WorkoutImportResult } from '@forkbell/shared';
import { post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Chip } from './AmountPicker';
import { color, radius, space, type } from '../lib/theme';

const niceDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export function ImportWorkouts() {
  const { me } = useAuth();
  const [unit, setUnit] = useState<WeightUnit>(me?.weightUnit ?? 'lb');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [plan, setPlan] = useState<{ format: ImportFormat; workouts: ImportedWorkout[]; preview: WorkoutImportResult; problems: string[] } | null>(null);
  const [done, setDone] = useState<WorkoutImportResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const read = async (text: string, u: WeightUnit) => {
    setProblem(null);
    setDone(null);
    setPlan(null);
    const r = parseWorkoutExport(text, u);
    if (!r.format || !r.workouts.length) return setProblem(r.problems.join(' '));
    setBusy('Checking…');
    try {
      const preview = await post<WorkoutImportResult>('/api/import/workouts', { format: r.format, workouts: r.workouts.slice(-5000), dryRun: true });
      setPlan({ format: r.format, workouts: r.workouts.slice(-5000), preview, problems: [...r.problems, ...(r.workouts.length > 5000 ? ['Only the newest 5,000 workouts are imported at a time.'] : [])] });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const pick = async () => {
    setProblem(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true, multiple: false }).catch((e) => {
      setProblem(e instanceof Error ? e.message : String(e));
      return null;
    });
    const asset = r && !r.canceled ? r.assets[0] : null;
    if (!asset) return;
    try {
      const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
      setFile({ name: asset.name, text });
      await read(text, unit);
    } catch (e) {
      setProblem(`That file couldn’t be opened: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const go = async () => {
    if (!plan) return;
    setBusy('Importing…');
    setProblem(null);
    try {
      setDone(await post<WorkoutImportResult>('/api/import/workouts', { format: plan.format, workouts: plan.workouts, dryRun: false }));
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
      <Text style={type.label}>Import workouts</Text>
      <Text style={type.small}>
        From Strong, Hevy or FitNotes. In that app, export your workouts as a CSV file (it’s in the app’s settings, usually under Export), save it to Files, then pick it here.
      </Text>
      <Text style={type.small}>Weights in the file are in</Text>
      <View style={s.chips}>
        {(['lb', 'kg'] as const).map((u) => (
          <Chip key={u} label={u === 'lb' ? 'Pounds' : 'Kilograms'} on={unit === u} onPress={() => { setUnit(u); if (file) void read(file.text, u); }} />
        ))}
      </View>
      <Text style={type.small}>Hevy and FitNotes say which in the file. Strong doesn’t: pick the unit Strong was set to.</Text>
      <Pressable onPress={() => void pick()} disabled={Boolean(busy)} style={({ pressed }) => [s.button, (pressed || busy) && { opacity: 0.6 }]} accessibilityRole="button">
        <Text style={s.buttonText}>{file ? 'Choose a different file' : 'Choose the CSV file'}</Text>
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
            {IMPORT_APPS[plan.format]}: {p.workouts} workout{p.workouts === 1 ? '' : 's'}, {p.sets.toLocaleString()} sets
            {p.from ? `, ${niceDate(p.from)} to ${niceDate(p.to)}` : ''}
          </Text>
          {p.skipped > 0 && <Text style={type.small}>{p.skipped} already in Forkbell (same start time) will be left alone.</Text>}
          <Text style={type.small}>
            {p.matched.length} exercise{p.matched.length === 1 ? '' : 's'} match ones Forkbell has
            {p.matched.length ? `: ${p.matched.slice(0, 6).map((m) => (m.from === m.to ? m.to : `${m.from} → ${m.to}`)).join(', ')}${p.matched.length > 6 ? '…' : ''}` : ''}.
          </Text>
          {p.added.length > 0 && (
            <Text style={type.small}>
              {p.added.length} will be added as your own: {p.added.slice(0, 8).join(', ')}
              {p.added.length > 8 ? '…' : ''}. You can rename them later.
            </Text>
          )}
          {plan.problems.map((x) => <Text key={x} style={type.small}>{x}</Text>)}
          {p.workouts > 0 ? (
            <Pressable onPress={() => void go()} disabled={Boolean(busy)} style={({ pressed }) => [s.button, { backgroundColor: color.accent }, (pressed || busy) && { opacity: 0.6 }]} accessibilityRole="button">
              <Text style={[s.buttonText, { color: color.onAccent }]}>Import {p.workouts} workout{p.workouts === 1 ? '' : 's'}</Text>
            </Pressable>
          ) : (
            <Text style={type.small}>Nothing new to import.</Text>
          )}
        </View>
      )}
      {done && (
        <Text style={[type.body, { fontWeight: '700', color: color.fat }]}>
          Imported {done.workouts} workout{done.workouts === 1 ? '' : 's'} ({done.sets.toLocaleString()} sets){done.added.length ? ` and ${done.added.length} new exercise${done.added.length === 1 ? '' : 's'}` : ''}. They’re in Train → History, and your records include them.
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.row, padding: space(3), gap: space(2) },
  chips: { flexDirection: 'row', gap: space(2) },
  button: { backgroundColor: color.chalk, borderRadius: 10, paddingVertical: space(3), alignItems: 'center', borderWidth: 1, borderColor: color.line },
  buttonText: { color: color.iron, fontWeight: '700', fontSize: 15 },
});
