import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import type { BellReply, Meal } from '@forkbell/shared';
import { api, ApiError, post } from '../lib/api';
import { addEntry } from '../lib/actions';
import { pickImage } from '../lib/images';
import { showToast } from '../lib/toast';
import { Proposals } from '../app/(app)/(tabs)/bell';
import { MEAL_NAMES } from './AmountPicker';
import { color, radius, space, type } from '../lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** The small buttons on each meal card: scan, quick add, photo. */
export function MealQuickActions({ date, meal, onChanged }: { date: string; meal: Meal; onChanged: () => void }) {
  const [quick, setQuick] = useState(false);
  const [photo, setPhoto] = useState(false);
  const chip = (icon: IconName, label: string, run: () => void) => (
    <Pressable onPress={run} style={s.chip} accessibilityRole="button" accessibilityLabel={`${label} for ${MEAL_NAMES[meal]}`}>
      <Ionicons name={icon} size={16} color={color.accent} />
      <Text style={s.chipText}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={s.row}>
      {chip('barcode-outline', 'Scan', () => router.push({ pathname: '/add', params: { meal, date, scan: '1' } }))}
      {chip('flash-outline', 'Quick add', () => setQuick(true))}
      {chip('camera-outline', 'Photo', () => setPhoto(true))}
      <QuickAdd visible={quick} date={date} meal={meal} onClose={() => setQuick(false)} onAdded={onChanged} />
      {photo && <PhotoLog date={date} meal={meal} onClose={() => setPhoto(false)} onAdded={onChanged} />}
    </View>
  );
}

/**
 * Quick add: just the calories (and macros if you know them), no food search.
 * Saved as one of your foods called "Quick add" or the name you give it.
 */
function QuickAdd({ visible, date, meal, onClose, onAdded }: { visible: boolean; date: string; meal: Meal; onClose: () => void; onAdded: () => void }) {
  const [v, setV] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [error, setError] = useState<string | null>(null);
  const n = (k: keyof typeof v) => Number(v[k].replace(',', '.')) || 0;
  const save = async () => {
    setError(null);
    const t = { kcal: n('kcal'), protein: n('protein'), carbs: n('carbs'), fat: n('fat') };
    if (!(t.kcal > 0)) return setError('Enter the calories.');
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    if (fromMacros > 0 && t.kcal >= 10 && (fromMacros / t.kcal < 0.5 || fromMacros / t.kcal > 1.6)) return setError(`Those macros make about ${Math.round(fromMacros)} kcal, not ${t.kcal}.`);
    // Stored per 100 g like every food; pick an amount so the numbers stay valid.
    const grams = Math.max(100, Math.ceil(t.kcal / 8), Math.ceil(t.protein + t.carbs + t.fat));
    const k = 100 / grams;
    const name = v.name.trim() || 'Quick add';
    try {
      await addEntry({
        date,
        meal,
        grams,
        food: { name, brand: null, source: 'custom', sourceId: null, per100: { kcal: Math.round(t.kcal * k * 10) / 10, protein: Math.round(t.protein * k * 10) / 10, carbs: Math.round(t.carbs * k * 10) / 10, fat: Math.round(t.fat * k * 10) / 10 }, servingGrams: grams, servingLabel: '1 entry', barcode: null, portions: [] },
      });
      setV({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
      onAdded();
      onClose();
      showToast(`Added ${t.kcal} kcal to ${MEAL_NAMES[meal].toLowerCase()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const field = (k: keyof typeof v, label: string, flex = 1) => (
    <View style={{ flex, gap: 2 }}>
      <Text style={type.small}>{label}</Text>
      <TextInput value={v[k]} onChangeText={(x) => setV({ ...v, [k]: x })} keyboardType={k === 'name' ? 'default' : 'decimal-pad'} style={s.input} accessibilityLabel={label} autoFocus={k === 'kcal'} />
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={type.title}>Quick add to {MEAL_NAMES[meal]}</Text>
          {field('kcal', 'Calories')}
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            {field('protein', 'Protein g')}
            {field('carbs', 'Carbs g')}
            {field('fat', 'Fat g')}
          </View>
          {field('name', 'Name (optional)')}
          {error && <Text style={{ color: color.over }}>{error}</Text>}
          <Pressable onPress={save} style={s.primary}><Text style={s.primaryText}>Add</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Photo: snap or pick a meal, Bell estimates it, you check and add. Right from the diary. */
function PhotoLog({ date, meal, onClose, onAdded }: { date: string; meal: Meal; onClose: () => void; onAdded: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<BellReply | null>(null);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (camera: boolean) => {
    setError(null);
    const r = await pickImage(camera);
    if (!r) return;
    if ('error' in r) return setError(r.error);
    setImage(r.image);
  };
  const ask = async () => {
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const status = await api<{ enabled: boolean; error?: string }>('/api/bell/status');
      if (!status.enabled) throw new Error(status.error ?? 'Photo logging uses Bell. Add an AI key in Settings → Bell first.');
      const r = await post<BellReply>('/api/bell/chat', {
        messages: [{ role: 'user', text: `Log this photo for ${MEAL_NAMES[meal].toLowerCase()}${note.trim() ? `: ${note.trim()}` : ''}. Estimate each food and its amount.`, image }],
        today: date,
        meal,
        localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      });
      setReply(r);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? 'Photo logging needs a connection.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.page, { backgroundColor: color.chalk }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={type.title}>Photo for {MEAL_NAMES[meal]}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Text style={{ color: color.accent, fontWeight: '700', fontSize: 16 }}>{added ? 'Done' : 'Cancel'}</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: space(3), paddingBottom: space(10) }}>
          {!image ? (
            <View style={{ gap: space(3), paddingTop: space(4) }}>
              <Pressable onPress={() => take(true)} style={s.primary}><Text style={s.primaryText}>Take a photo</Text></Pressable>
              <Pressable onPress={() => take(false)} style={s.secondary}><Text style={s.secondaryText}>Choose from photos</Text></Pressable>
              <Text style={type.small}>Bell names each food and estimates the amount. You check everything before it’s added.</Text>
            </View>
          ) : (
            <>
              <Image source={{ uri: image }} style={{ width: '100%', height: 220, borderRadius: radius.card }} resizeMode="cover" />
              {!reply && (
                <>
                  <TextInput value={note} onChangeText={setNote} placeholder="Anything to add? e.g. “half of it”, “cooked in butter”" style={s.input} />
                  <Pressable disabled={busy} onPress={ask} style={[s.primary, busy && { opacity: 0.6 }]}>
                    {busy ? <ActivityIndicator color={color.onAccent} /> : <Text style={s.primaryText}>Estimate this meal</Text>}
                  </Pressable>
                </>
              )}
              {reply && (
                <View style={{ gap: space(2) }}>
                  {!!reply.reply && <Text style={type.body}>{reply.reply}</Text>}
                  {reply.proposals.length > 0 ? (
                    <Proposals items={reply.proposals} added={added} onAdded={() => { setAdded(true); onAdded(); }} />
                  ) : (
                    <Text style={type.small}>Bell didn’t suggest anything to add. Try a clearer photo, or add a note.</Text>
                  )}
                </View>
              )}
            </>
          )}
          {error && <Text style={{ color: color.over }}>{error}</Text>}
          {error?.includes('Settings') && (
            <Pressable onPress={() => { onClose(); router.push('/setting/bell'); }}><Text style={{ color: color.accent, fontWeight: '700' }}>Open Settings ›</Text></Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(1) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space(2), paddingHorizontal: space(3), borderRadius: 999, borderWidth: 1, borderColor: color.line },
  chipText: { color: color.accent, fontWeight: '700', fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: space(4) },
  sheet: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(3), maxWidth: 440, width: '100%', alignSelf: 'center' },
  page: { flex: 1, padding: space(4), gap: space(3) },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  primary: { backgroundColor: color.accent, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  primaryText: { color: color.onAccent, fontSize: 16, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: color.line, borderRadius: 12, paddingVertical: space(3), alignItems: 'center' },
  secondaryText: { color: color.accent, fontSize: 16, fontWeight: '700' },
});

