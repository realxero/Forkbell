// Settings → Export and backup. Downloads come from your own server; on the
// phone they open the share sheet (Save to Files, AirDrop, Mail), on the web
// they download.
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { File, Paths } from 'expo-file-system';
import { authHeaders, getServerUrl } from '../lib/api';
import { color, radius, space, type } from '../lib/theme';
import { ImportWorkouts } from './ImportWorkouts';
import { ImportFoodHistory } from './ImportFoodHistory';

const EXPORTS = [
  { path: '/api/export', name: 'forkbell', ext: 'json', title: 'Everything (JSON)', detail: 'Every food, diary entry, workout, set, weigh-in, check-in and medication. For keeping, or moving to another app.' },
  { path: '/api/export/diary.csv', name: 'forkbell-diary', ext: 'csv', title: 'Food diary (CSV)', detail: 'One row per food you logged, with calories and macros. Opens in Excel or Numbers.' },
  { path: '/api/export/workouts.csv', name: 'forkbell-workouts', ext: 'csv', title: 'Workouts (CSV)', detail: 'One row per set: exercise, weight in kg and lb, reps, time and RPE.' },
] as const;

async function download(path: string, name: string, ext: string) {
  const server = getServerUrl();
  if (!server) throw new Error('Add your Forkbell server address first.');
  const res = await fetch(server + path, { credentials: 'include', headers: authHeaders() });
  if (!res.ok) throw new Error(`The server answered ${res.status}.`);
  const text = await res.text();
  const file = `${name}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: ext === 'csv' ? 'text/csv' : 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const f = new File(Paths.cache, file);
  if (f.exists) f.delete();
  f.create();
  f.write(text);
  // iPhone shares the file itself; Android's share sheet only takes text, so the file's contents go.
  await Share.share(Platform.OS === 'ios' ? { url: f.uri } : { message: text, title: file });
}

export function DataSection() {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  return (
    <View style={{ gap: space(3) }}>
      <Text style={type.body}>Your data is yours. Take a copy any time.</Text>
      {EXPORTS.map((e) => (
        <Pressable
          key={e.path}
          disabled={busy !== null}
          onPress={async () => {
            setBusy(e.path);
            setNote(null);
            try {
              await download(e.path, e.name, e.ext);
            } catch (err) {
              setNote(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(null);
            }
          }}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Ionicons name={e.ext === 'csv' ? 'grid-outline' : 'archive-outline'} size={22} color={color.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.body, { fontWeight: '700' }]}>{e.title}</Text>
            <Text style={type.small}>{e.detail}</Text>
          </View>
          {busy === e.path ? <ActivityIndicator color={color.accent} /> : <Ionicons name="download-outline" size={20} color={color.ironSoft} />}
        </Pressable>
      ))}
      {note && <Text style={{ color: color.over }}>{note}</Text>}
      <ImportWorkouts />
      <ImportFoodHistory />
      <Text style={[type.small, { marginTop: space(4) }]}>Backups</Text>
      <Text style={type.body}>
        Your server can back up the whole database every night by itself: add the backup service from Forkbell’s docker-compose.yml to your stack. It keeps two weeks of copies next to your other Forkbell data. docs/BACKUP.md in the repo has the steps, and how to restore one.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.row, padding: space(3), minHeight: 56 },
});
