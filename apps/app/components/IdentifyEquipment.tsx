import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { Exercise } from '@forkbell/shared';
import { ApiError, post } from '../lib/api';
import { pickImage } from '../lib/images';
import { HowToSheet } from './HowTo';
import { Thumb } from './ExercisePicker';
import { color, radius, space, type } from '../lib/theme';

type Result = {
  recognized: boolean;
  name: string | null;
  what: string | null;
  setup: string[];
  how: string[];
  safety: string[];
  exercises: Exercise[];
  suggested?: string[];
};

/**
 * "What's this?": photograph a machine or piece of equipment at the gym.
 * Bell says what it is, how to set it up and use it, and which exercises in
 * your library use it (tap for the how-to pictures, or add one).
 */
export function IdentifyEquipment({ onClose, onPick }: { onClose: () => void; onPick?: (e: Exercise) => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [howTo, setHowTo] = useState<Exercise | null>(null);

  const take = async (camera: boolean) => {
    setError(null);
    const got = await pickImage(camera);
    if (!got) return;
    if ('error' in got) return setError(got.error);
    setImage(got.image);
    setR(null);
    setBusy(true);
    try {
      setR(await post<Result>('/api/bell/equipment', { image: got.image }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? 'This needs a connection.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const list = (title: string, items: string[], icon: React.ComponentProps<typeof Ionicons>['name'], tint: string) =>
    items.length > 0 && (
      <View style={s.block}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <Ionicons name={icon} size={18} color={tint} />
          <Text style={type.label}>{title}</Text>
        </View>
        {items.map((t, i) => <Text key={i} style={type.body}>{i + 1}. {t}</Text>)}
      </View>
    );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.page, { backgroundColor: color.chalk }]}>
        <View style={s.head}>
          <Text style={type.title}>What’s this machine?</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={s.link}>Close</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: space(3), paddingBottom: space(12) }}>
          {image ? (
            <Image source={{ uri: image }} style={s.photo} resizeMode="cover" />
          ) : (
            <View style={s.empty}>
              <Ionicons name="camera-outline" size={44} color={color.accent} />
              <Text style={[type.body, { textAlign: 'center' }]}>Take a photo of a machine or piece of equipment. Bell tells you what it’s for, how to set it up and use it, and which exercises it’s for.</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            <Pressable disabled={busy} onPress={() => take(true)} style={[s.primary, { flex: 1 }]}><Text style={s.primaryText}>{image ? 'Another photo' : 'Take a photo'}</Text></Pressable>
            <Pressable disabled={busy} onPress={() => take(false)} style={[s.secondary, { flex: 1 }]}><Text style={s.link}>Choose a photo</Text></Pressable>
          </View>
          {busy && <ActivityIndicator color={color.accent} style={{ marginVertical: space(4) }} />}
          {error && <Text style={{ color: color.over }}>{error}</Text>}
          {error?.includes('Settings') && (
            <Pressable onPress={() => { onClose(); router.push('/setting/bell'); }}><Text style={s.link}>Open Bell settings ›</Text></Pressable>
          )}
          {r && (
            <>
              <View style={s.block}>
                <Text style={[type.title, { fontSize: 22 }]}>{r.recognized ? r.name : 'Not sure what this is'}</Text>
                {!!r.what && <Text style={type.body}>{r.what}</Text>}
              </View>
              {list('Set it up', r.setup, 'construct-outline', color.accent)}
              {list('How to use it', r.how, 'play-circle-outline', color.fat)}
              {list('Stay safe', r.safety, 'shield-checkmark-outline', color.over)}
              {r.exercises.length > 0 && (
                <View style={s.block}>
                  <Text style={type.label}>Exercises on it</Text>
                  {r.exercises.map((e) => (
                    <View key={e.id} style={s.exRow}>
                      <Pressable onPress={() => setHowTo(e)} style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), flex: 1 }} accessibilityLabel={`How to do ${e.name}`}>
                        <Thumb e={e} size={48} />
                        <View style={{ flex: 1 }}>
                          <Text style={type.body}>{e.name}</Text>
                          <Text style={type.small}>Tap for how-to pictures</Text>
                        </View>
                      </Pressable>
                      {onPick && (
                        <Pressable onPress={() => onPick(e)} style={s.add} accessibilityLabel={`Add ${e.name}`}>
                          <Ionicons name="add" size={20} color={color.onAccent} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              )}
              {r.recognized && r.exercises.length === 0 && !!r.suggested?.length && (
                <Text style={type.small}>Common exercises on it: {r.suggested.join(', ')}. None of these are in your library yet; search for them or create one.</Text>
              )}
              <Text style={type.small}>Bell can be wrong about equipment. If something looks off, ask a coach or staff member before loading it up.</Text>
            </>
          )}
        </ScrollView>
      </View>
      <HowToSheet exercise={howTo} onClose={() => setHowTo(null)} />
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, padding: space(4), gap: space(3) },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  photo: { width: '100%', height: 240, borderRadius: radius.card },
  empty: { alignItems: 'center', gap: space(3), padding: space(6), borderRadius: radius.card, backgroundColor: color.card, borderWidth: 1, borderColor: color.line },
  block: { gap: space(2), backgroundColor: color.card, borderRadius: radius.card, padding: space(4), borderWidth: 1, borderColor: color.line },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  add: { width: 34, height: 34, borderRadius: 17, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: color.accent, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  primaryText: { color: color.onAccent, fontWeight: '700', fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: color.line, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
});
