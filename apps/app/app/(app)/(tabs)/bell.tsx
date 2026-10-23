import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { forAmount, mealForTime, todayLocal, type BellReply, type FoodProposal, type Meal } from '@forkbell/shared';
import { api, ApiError, post } from '../../../lib/api';
import { addEntry } from '../../../lib/actions';
import { readCache, writeCache } from '../../../lib/sync';
import { Chip, MEAL_NAMES } from '../../../components/AmountPicker';
import { NumberField } from '../../../components/NumberField';
import { color, space, type } from '../../../lib/theme';

type Message = { role: 'user' | 'assistant'; text: string; image?: string; proposals?: FoodProposal[]; added?: boolean };
const KEY = 'device:bell-chat';
const SUGGESTIONS = ['What have I eaten today?', 'How much protein do I have left?', 'Log 2 eggs and toast for breakfast', 'How is my bench press going?'];

export default function Bell() {
  const [status, setStatus] = useState<{ enabled: boolean; model: string | null } | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => readCache<Message[]>(KEY) ?? []);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    api<{ enabled: boolean; model: string | null }>('/api/bell/status').then(setStatus, () => setStatus({ enabled: false, model: null }));
  }, []);
  // Keep the conversation on this device (without photos, which are large).
  useEffect(() => {
    writeCache(KEY, messages.slice(-40).map((m) => ({ ...m, image: m.image ? 'photo' : undefined })));
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [messages]);

  const send = async (override?: string) => {
    const body = (override ?? text).trim();
    if ((!body && !image) || busy) return;
    const next: Message[] = [...messages, { role: 'user', text: body, image: image ?? undefined }];
    setMessages(next);
    setText('');
    setImage(null);
    setBusy(true);
    setError(null);
    try {
      const r = await post<BellReply>('/api/bell/chat', {
        messages: next.slice(-20).map((m) => ({ role: m.role, text: m.text, ...(m.image?.startsWith('data:') ? { image: m.image } : {}) })),
        today: todayLocal(),
        meal: mealForTime(),
        localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      });
      setMessages([...next, { role: 'assistant', text: r.reply, proposals: r.proposals.length ? r.proposals : undefined }]);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? 'Bell needs a connection.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async (camera: boolean) => {
    setError(null);
    if (camera && Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError('Camera access is off for Forkbell. You can turn it on in Settings.');
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.45, base64: true };
    const r = camera && Platform.OS !== 'web' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const url = a.base64 ? `data:${a.mimeType?.startsWith('image/') ? a.mimeType : 'image/jpeg'};base64,${a.base64}` : a.uri.startsWith('data:') ? a.uri : null;
    if (!url) return setError('Couldn’t read that photo.');
    if (url.length > 3_900_000) return setError('That photo is too large. Try a smaller one or crop it.');
    setImage(url);
  };

  if (status && !status.enabled) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <View style={s.content}>
          <Text style={[type.hero, { fontSize: 34 }]}>Bell</Text>
          <Text style={type.body}>
            Bell is Forkbell’s assistant: ask about your own data, log food by describing it or snapping a photo, and review everything before it’s added. It isn’t set up on this server yet.
          </Text>
          <Text style={type.small}>
            To turn it on, add AI_PROVIDER, AI_API_KEY and AI_MODEL to the server’s settings (any Anthropic or OpenAI-compatible model, including one running at home), then redeploy.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <View style={s.head}>
          <Text style={[type.hero, { fontSize: 34 }]}>Bell</Text>
          {messages.length > 0 && (
            <Pressable onPress={() => setMessages([])} hitSlop={10}>
              <Text style={s.link}>New chat</Text>
            </Pressable>
          )}
        </View>
        <ScrollView ref={scroll} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
          {messages.length === 0 && (
            <View style={{ gap: space(2) }}>
              <Text style={type.body}>Ask about your food, training and progress, or tell me what you ate. You check everything before it’s logged.</Text>
              {SUGGESTIONS.map((q) => (
                <Pressable key={q} onPress={() => send(q)} style={s.suggestion}>
                  <Text style={type.body}>{q}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {messages.map((m, i) => (
            <View key={i} style={[s.bubble, m.role === 'user' ? s.mine : s.theirs]}>
              {m.image?.startsWith('data:') && <Image source={{ uri: m.image }} style={s.photo} />}
              {m.image === 'photo' && <Text style={type.small}>[photo]</Text>}
              {!!m.text && <Text style={[type.body, m.role === 'user' && { color: color.chalk }]}>{m.text}</Text>}
              {m.proposals && (
                <Proposals
                  items={m.proposals}
                  added={Boolean(m.added)}
                  onAdded={() => setMessages((list) => list.map((x, j) => (j === i ? { ...x, added: true } : x)))}
                />
              )}
            </View>
          ))}
          {busy && (
            <View style={[s.bubble, s.theirs, { flexDirection: 'row', gap: space(2), alignItems: 'center' }]}>
              <ActivityIndicator color={color.iron} />
              <Text style={type.small}>Bell is thinking…</Text>
            </View>
          )}
          {error && <Text style={s.error}>{error}</Text>}
        </ScrollView>

        {image && (
          <View style={s.attached}>
            <Image source={{ uri: image }} style={{ width: 48, height: 48, borderRadius: 8 }} />
            <Text style={[type.small, { flex: 1 }]}>Photo attached. Add a note if you like (“half of this”, “with ranch”).</Text>
            <Pressable onPress={() => setImage(null)} hitSlop={8}>
              <Text style={[s.link, { color: color.over }]}>Remove</Text>
            </Pressable>
          </View>
        )}
        <View style={s.composer}>
          <Pressable onPress={() => pickPhoto(true)} style={s.icon} accessibilityLabel="Take a photo of your meal">
            <Text style={{ fontSize: 20 }}>📷</Text>
          </Pressable>
          {Platform.OS !== 'web' && (
            <Pressable onPress={() => pickPhoto(false)} style={s.icon} accessibilityLabel="Choose a photo">
              <Text style={{ fontSize: 20 }}>🖼</Text>
            </Pressable>
          )}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Ask Bell or describe a meal"
            style={s.input}
            multiline
            onSubmitEditing={() => send()}
            blurOnSubmit={false}
            accessibilityLabel="Message to Bell"
          />
          <Pressable onPress={() => send()} disabled={busy || (!text.trim() && !image)} style={[s.send, (busy || (!text.trim() && !image)) && { opacity: 0.4 }]}>
            <Text style={s.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Bell's suggested foods: change amounts or meals, untick any, then add them. */
function Proposals({ items, added, onAdded }: { items: FoodProposal[]; added: boolean; onAdded: () => void }) {
  const [list, setList] = useState(items.map((p) => ({ ...p, keep: true })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const per100 = (p: FoodProposal) => p.food?.per100 ?? p.per100!;
  const kept = list.filter((p) => p.keep);
  const total = kept.reduce((t, p) => t + forAmount(per100(p), p.grams).kcal, 0);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const p of kept) {
        await addEntry({
          date: p.date,
          meal: p.meal,
          grams: p.grams,
          food: p.food ?? { name: p.name, brand: p.brand, source: 'custom', sourceId: null, per100: p.per100!, servingGrams: null, servingLabel: null, barcode: null, portions: [] },
        });
      }
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      {list.map((p, i) => {
        const n = forAmount(per100(p), p.grams);
        return (
          <View key={i} style={[s.item, !p.keep && { opacity: 0.4 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space(2) }}>
              <Pressable
                disabled={added}
                onPress={() => setList((l) => l.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))}
                style={[s.tick, p.keep && s.tickOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: p.keep }}
                accessibilityLabel={`Include ${p.name}`}
              >
                <Text style={{ color: color.card, fontWeight: '800' }}>{p.keep ? '✓' : ''}</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: '700' }]}>{p.name}</Text>
                <Text style={type.small}>
                  {p.brand ? `${p.brand} · ` : ''}
                  {n.kcal} kcal · {n.protein} g protein
                  {p.estimate ? ' · estimate' : p.food ? ' · from your foods' : ''}
                </Text>
                {p.note && <Text style={type.small}>{p.note}</Text>}
              </View>
            </View>
            {!added && p.keep && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), flexWrap: 'wrap', marginLeft: 36 }}>
                <NumberField
                  label={`${p.name} grams`}
                  value={String(p.grams)}
                  onCommit={(t) => {
                    const g = Number(t.replace(',', '.'));
                    if (g > 0 && g <= 5000) setList((l) => l.map((x, j) => (j === i ? { ...x, grams: g } : x)));
                  }}
                  style={s.grams}
                />
                <Text style={type.small}>g</Text>
                {(['breakfast', 'lunch', 'dinner', 'snacks'] as Meal[]).map((m) => (
                  <Chip key={m} label={MEAL_NAMES[m]} on={p.meal === m} onPress={() => setList((l) => l.map((x, j) => (j === i ? { ...x, meal: m } : x)))} />
                ))}
              </View>
            )}
          </View>
        );
      })}
      {error && <Text style={s.error}>{error}</Text>}
      {added ? (
        <Text style={[type.small, { color: color.fat, fontWeight: '700' }]}>Added to your diary.</Text>
      ) : (
        <Pressable disabled={busy || !kept.length} onPress={add} style={[s.add, (busy || !kept.length) && { opacity: 0.4 }]}>
          <Text style={s.sendText}>
            Add {kept.length} {kept.length === 1 ? 'item' : 'items'} · {total} kcal
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space(4), paddingTop: space(4), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  list: { padding: space(4), gap: space(3), paddingBottom: space(6), maxWidth: 640, width: '100%', alignSelf: 'center' },
  suggestion: { backgroundColor: color.card, borderRadius: 12, padding: space(3), borderWidth: 1, borderColor: color.line },
  bubble: { borderRadius: 16, padding: space(3), gap: space(2), maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.iron },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.card },
  photo: { width: 200, height: 150, borderRadius: 10 },
  error: { ...type.body, color: color.over },
  card: { gap: space(3), marginTop: space(1) },
  item: { gap: space(2), borderTopWidth: 1, borderTopColor: color.line, paddingTop: space(2) },
  tick: { width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: color.fat, borderColor: color.fat },
  grams: { ...type.body, ...type.number, width: 70, textAlign: 'center', backgroundColor: color.chalk, borderRadius: 8, paddingVertical: space(1) },
  add: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  attached: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(2), backgroundColor: color.card, borderTopWidth: 1, borderTopColor: color.line },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2), padding: space(3), borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.card },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: color.chalk },
  input: { ...type.body, flex: 1, maxHeight: 120, backgroundColor: color.chalk, borderRadius: 18, paddingHorizontal: space(3), paddingVertical: space(2) },
  send: { backgroundColor: color.iron, borderRadius: 18, paddingHorizontal: space(4), paddingVertical: space(2) + 2 },
  sendText: { color: color.chalk, fontWeight: '700', fontSize: 15 },
});
