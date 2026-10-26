import { speak } from '../../../lib/speak';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { bellHistory, bellMood, forAmount, imageLinkIn, JUST_ESTIMATE, mealForTime, todayLocal, type BellMood, type BellQuestion, type BellReply, type FoodProposal, type Meal } from '@forkbell/shared';
import { api, ApiError, post } from '../../../lib/api';
import { addEntry } from '../../../lib/actions';
import { useAuth } from '../../../lib/auth';
import { readCache, writeCache } from '../../../lib/sync';
import { clipboardHasImage, imageFromLink, imageFromPasteEvent, pasteImage, pickImage, type ImageResult } from '../../../lib/images';
import { Chip, MEAL_NAMES } from '../../../components/AmountPicker';
import { NumberField } from '../../../components/NumberField';
import { FoodIcon } from '../../../components/FoodIcon';
import { VoiceButton, voiceAvailable } from '../../../components/VoiceButton';
import { BellAvatar } from '../../../components/BellAvatar';
import { color, space, type } from '../../../lib/theme';

type Message = {
  role: 'user' | 'assistant';
  text: string;
  image?: string;
  proposals?: FoodProposal[];
  added?: boolean;
  question?: BellQuestion;
  /** the answer tapped, once there is one */
  answered?: string;
  /** said out loud rather than typed */
  spoken?: boolean;
  /** Bell's face for this reply */
  mood?: BellMood;
};
const KEY = 'device:bell-chat';
const SUGGESTIONS = ['What have I eaten today?', 'How much protein do I have left?', 'Log 2 eggs and toast for breakfast', 'How is my bench press going?'];


export default function Bell() {
  const { me } = useAuth();
  const prefs = me?.preferences.bell ?? { askWhenUnsure: true, voiceSends: true, readAloud: 'voice' as const };
  const params = useLocalSearchParams<{ ask?: string }>();
  const [status, setStatus] = useState<{ enabled: boolean; model: string | null; error?: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => readCache<Message[]>(KEY) ?? []);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hearing, setHearing] = useState<{ text: string } | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [canTalk] = useState(voiceAvailable);
  const scroll = useRef<ScrollViewInstance>(null);
  const triedLink = useRef<string | null>(null);
  // A few seconds of excitement when you add the food Bell found.
  const [excited, setExcited] = useState(false);
  useEffect(() => {
    if (!excited) return;
    const t = setTimeout(() => setExcited(false), 4000);
    return () => clearTimeout(t);
  }, [excited]);

  // Checked each time you open the tab, so a key added in Settings takes effect straight away.
  useFocusEffect(
    useCallback(() => {
      api<{ enabled: boolean; model: string | null; error?: string }>('/api/bell/status').then(setStatus, () => setStatus({ enabled: false, model: null }));
    }, []),
  );
  // Keep the conversation on this device (without photos, which are large).
  useEffect(() => {
    writeCache(KEY, messages.slice(-40).map((m) => ({ ...m, image: m.image ? 'photo' : undefined })));
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [messages]);

  const takeImage = (r: ImageResult) => {
    if (!r) return;
    if ('error' in r) return setError(r.error);
    setError(null);
    setImage(r.image);
  };

  // Phones: offer a Paste button when there's an image on the clipboard.
  const checkClipboard = useCallback(() => {
    clipboardHasImage().then(setCanPaste);
  }, []);
  useFocusEffect(checkClipboard);

  // Web: Ctrl/Cmd+V with an image pastes it as the photo.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return;
      const onPaste = (e: ClipboardEvent) => {
        if (!Array.from(e.clipboardData?.items ?? []).some((i) => i.kind === 'file' && i.type.startsWith('image/'))) return;
        e.preventDefault();
        imageFromPasteEvent(e).then(takeImage);
      };
      document.addEventListener('paste', onPaste);
      return () => document.removeEventListener('paste', onPaste);
    }, []),
  );

  /** A pasted image link turns into the photo itself, and the link leaves the message. */
  const onChangeText = async (v: string) => {
    setText(v);
    const link = imageLinkIn(v);
    if (!link || image || link === triedLink.current) return;
    triedLink.current = link;
    setLoadingImage(true);
    const r = await imageFromLink(link);
    setLoadingImage(false);
    if (r && 'image' in r) {
      setImage(r.image);
      setText((t) => t.replace(link, '').replace(/\s{2,}/g, ' ').trim());
      setNotice(null);
    } else if (r) {
      setNotice(r.error);
    }
  };

  const send = async (override?: string, opts: { spoken?: boolean; answering?: number } = {}) => {
    const body = (override ?? text).trim();
    if ((!body && !image) || busy) return;
    const base = opts.answering !== undefined ? messages.map((m, j) => (j === opts.answering ? { ...m, answered: body } : m)) : messages;
    const next: Message[] = [...base, { role: 'user', text: body, image: image ?? undefined, spoken: opts.spoken }];
    setMessages(next);
    if (override === undefined) setText('');
    setImage(null);
    triedLink.current = null;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await post<BellReply>('/api/bell/chat', {
        messages: bellHistory(next),
        today: todayLocal(),
        meal: mealForTime(),
        localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      });
      const mood = bellMood({ userText: body, reply: r.reply, question: r.question });
      setMessages([...next, { role: 'assistant', text: r.reply, proposals: r.proposals.length ? r.proposals : undefined, question: r.question ?? undefined, mood }]);
      // Read the answer aloud: always, or when you asked by voice (Settings → Bell).
      if (prefs.readAloud === 'always' || (prefs.readAloud !== 'never' && opts.spoken)) speak(r.reply);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? 'Bell needs a connection.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Opened with a question from elsewhere (e.g. Better option → Ask Bell): send it once.
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!params.ask || !status?.enabled || asked.current === params.ask) return;
    asked.current = params.ask;
    void send(params.ask);
    router.setParams({ ask: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ask, status?.enabled]);

  const heardAll = (words: string) => {
    if (!words) return;
    if (prefs.voiceSends) return send(words, { spoken: true });
    setText((t) => (t ? `${t} ${words}` : words));
  };

  if (status && !status.enabled) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <View style={s.content}>
          <Text style={[type.hero, { fontSize: 34 }]}>Bell</Text>
          <Text style={type.body}>
            Bell is Forkbell’s assistant: ask about your own data, log food by describing it or snapping a photo, and review everything before it’s added.
          </Text>
          <Text style={type.small}>{status.error ?? 'Add an AI key to turn it on. Google Gemini, Anthropic and OpenAI all work; Gemini has a free tier.'}</Text>
          <Pressable onPress={() => router.push('/setting/bell')} style={{ backgroundColor: color.accent, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' }}>
            <Text style={{ color: color.onAccent, fontWeight: '700', fontSize: 16 }}>Add a key in Settings</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const lastIndex = messages.length - 1;
  const lastMood = [...messages].reverse().find((m) => m.role === 'assistant')?.mood ?? 'happy';
  const headMood: BellMood = busy ? 'thinking' : hearing ? 'listening' : excited ? 'excited' : lastMood;
  const empty = !text.trim() && !image;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <View style={s.head}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <BellAvatar size={36} mood={headMood} alive />
            <Text style={[type.hero, { fontSize: 34 }]}>Bell</Text>
          </View>
          {messages.length > 0 && (
            <Pressable onPress={() => setMessages([])} hitSlop={12} style={s.headButton}>
              <Text style={s.link}>New chat</Text>
            </Pressable>
          )}
        </View>
        <ScrollView ref={scroll} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled">
          {messages.length === 0 && (
            <View style={{ gap: space(2) }}>
              <View style={s.hello}>
                <BellAvatar size={56} alive />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.body, { fontWeight: '800' }]}>Hey{me?.name ? ` ${me.name.split(' ')[0]}` : ''}! I’m Bell, your gym buddy.</Text>
                  <Text style={type.small}>
                    Ask me about your food, training and progress, or tell me what you ate{canTalk ? ' (hold the mic to say it)' : ''}. You check everything before it’s logged.
                  </Text>
                </View>
              </View>
              {SUGGESTIONS.map((q) => (
                <Pressable key={q} onPress={() => send(q)} style={s.suggestion}>
                  <Text style={type.body}>{q}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {messages.map((m, i) => (
            <View key={i} style={m.role === 'user' ? undefined : s.theirRow}>
            {m.role !== 'user' && <BellAvatar size={28} mood={i === lastIndex && excited ? 'excited' : (m.mood ?? 'happy')} alive={i === lastIndex} />}
            <View style={[s.bubble, m.role === 'user' ? s.mine : s.theirs]}>
              {m.image?.startsWith('data:') && <Image source={{ uri: m.image }} style={s.photo} accessibilityLabel="Your photo" />}
              {m.image === 'photo' && <Text style={[type.small, m.role === 'user' && { color: color.chalk }]}>[photo]</Text>}
              {!!m.text && (
                <Text style={[type.body, m.role === 'user' && { color: color.chalk }]}>
                  {m.spoken ? '🎙 ' : ''}
                  {m.text}
                </Text>
              )}
              {m.proposals && (
                <Proposals
                  items={m.proposals}
                  added={Boolean(m.added)}
                  onAdded={() => {
                    setMessages((list) => list.map((x, j) => (j === i ? { ...x, added: true } : x)));
                    setExcited(true);
                  }}
                />
              )}
              {m.question && <Question q={m.question} answered={m.answered} live={i === lastIndex && !busy} onAnswer={(a) => send(a, { answering: i })} />}
            </View>
            </View>
          ))}
          {busy && (
            <View style={s.theirRow}>
              <BellAvatar size={28} mood="thinking" alive />
              <View style={[s.bubble, s.theirs, { flexDirection: 'row', gap: space(2), alignItems: 'center' }]}>
                <ActivityIndicator color={color.iron} />
                <Text style={type.small}>Bell is thinking…</Text>
              </View>
            </View>
          )}
          {error && <Text style={s.error}>{error}</Text>}
        </ScrollView>

        {hearing && (
          <View style={s.hearing} accessibilityLiveRegion="polite">
            <View style={s.dot} />
            <Text style={[type.body, { flex: 1 }]} numberOfLines={3}>
              {hearing.text || 'Listening…'}
            </Text>
            <Text style={type.small}>{prefs.voiceSends ? 'Let go to send' : 'Let go to finish'}</Text>
          </View>
        )}
        {notice && !hearing && (
          <View style={s.attached}>
            <Text style={[type.small, { flex: 1 }]}>{notice}</Text>
            <Pressable onPress={() => setNotice(null)} hitSlop={12} accessibilityLabel="Dismiss">
              <Ionicons name="close" size={18} color={color.ironSoft} />
            </Pressable>
          </View>
        )}
        {(image || loadingImage) && (
          <View style={s.attached}>
            {image ? <Image source={{ uri: image }} style={{ width: 48, height: 48, borderRadius: 8 }} /> : <ActivityIndicator color={color.iron} />}
            <Text style={[type.small, { flex: 1 }]}>{image ? 'Photo attached. Add a note if you like (“half of this”, “with ranch”).' : 'Loading the image from that link…'}</Text>
            {image && (
              <Pressable onPress={() => setImage(null)} hitSlop={12}>
                <Text style={[s.link, { color: color.over }]}>Remove</Text>
              </Pressable>
            )}
          </View>
        )}
        {canPaste && !image && !hearing && (
          <View style={s.pasteRow}>
            <Pressable
              onPress={async () => {
                takeImage(await pasteImage());
                setCanPaste(false);
              }}
              style={s.pasteChip}
              accessibilityLabel="Paste the image from the clipboard"
            >
              <Ionicons name="clipboard-outline" size={16} color={color.accent} />
              <Text style={s.pasteText}>Paste image</Text>
            </Pressable>
          </View>
        )}
        <View style={s.composer}>
          <Pressable onPress={async () => takeImage(await pickImage(true))} style={s.icon} accessibilityLabel="Take a photo of your meal">
            <Ionicons name="camera-outline" size={22} color={color.iron} />
          </Pressable>
          {Platform.OS !== 'web' && (
            <Pressable onPress={async () => takeImage(await pickImage(false))} style={s.icon} accessibilityLabel="Choose a photo">
              <Ionicons name="images-outline" size={22} color={color.iron} />
            </Pressable>
          )}
          <TextInput
            value={text}
            onChangeText={onChangeText}
            onFocus={checkClipboard}
            placeholder={Platform.OS === 'web' ? 'Ask Bell, describe a meal, or paste a photo' : 'Ask Bell or describe a meal'}
            placeholderTextColor={color.placeholder}
            style={s.input}
            multiline
            onSubmitEditing={() => send()}
            blurOnSubmit={false}
            accessibilityLabel="Message to Bell"
          />
          {empty && canTalk ? (
            <VoiceButton
              disabled={busy}
              onHearing={(t, on) => setHearing(on ? { text: t } : null)}
              onDone={heardAll}
              onError={(m) => setNotice(m)}
            />
          ) : (
            <Pressable onPress={() => send()} disabled={busy || empty} style={[s.send, (busy || empty) && { opacity: 0.4 }]} accessibilityLabel="Send">
              <Ionicons name="arrow-up" size={22} color={color.chalk} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** A question from Bell, answered with one tap. "Just estimate it" is always there. */
export function Question({ q, answered, live, onAnswer }: { q: BellQuestion; answered?: string; live: boolean; onAnswer: (a: string) => void }) {
  const choices = q.choices.some((c) => c.toLowerCase() === JUST_ESTIMATE.toLowerCase()) ? q.choices : [...q.choices, JUST_ESTIMATE];
  return (
    <View style={{ gap: space(2) }}>
      <Text style={[type.body, { fontWeight: '700' }]}>{q.text}</Text>
      <View style={s.choices}>
        {choices.map((c) => (
          <Pressable
            key={c}
            disabled={!live || Boolean(answered)}
            onPress={() => onAnswer(c)}
            style={[s.choice, answered === c && s.choiceOn, (!live || answered) && answered !== c && { opacity: 0.45 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: answered === c, disabled: !live || Boolean(answered) }}
          >
            <Text style={[s.choiceText, answered === c && { color: color.onAccent }]}>{c}</Text>
          </Pressable>
        ))}
      </View>
      {live && !answered && <Text style={type.small}>Or type your own answer.</Text>}
    </View>
  );
}

/** Bell's suggested foods: change amounts or meals, untick any, then add them. */
export function Proposals({ items, added, onAdded }: { items: FoodProposal[]; added: boolean; onAdded: () => void }) {
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
                hitSlop={10}
                style={[s.tick, p.keep && s.tickOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: p.keep }}
                accessibilityLabel={`Include ${p.name}`}
              >
                <Text style={{ color: color.card, fontWeight: '800' }}>{p.keep ? '✓' : ''}</Text>
              </Pressable>
              <FoodIcon name={p.name} brand={p.brand} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: '700' }]}>{p.name}</Text>
                <Text style={type.small}>
                  {p.brand ? `${p.brand} · ` : ''}
                  {n.kcal} kcal · {n.protein} g protein
                  {p.estimate ? ' · estimate' : p.food ? ' · from your foods' : ''}
                </Text>
                {p.note && <Text style={type.small}>{p.note}</Text>}
                {p.warnings?.length > 0 && <Text style={[type.small, { color: color.warnText, fontWeight: '700' }]}>⚠ {p.warnings.join(' · ')} (by name)</Text>}
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
  theirRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2), maxWidth: '100%' },
  hello: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: 16, padding: space(3), borderWidth: 1, borderColor: color.line },
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space(4), paddingTop: space(4), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  headButton: { minHeight: 44, justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space(4), borderRadius: 22, borderWidth: 1, borderColor: color.accent, backgroundColor: color.card },
  choiceOn: { backgroundColor: color.accent },
  choiceText: { color: color.accent, fontWeight: '700', fontSize: 15 },
  hearing: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3), backgroundColor: color.card, borderTopWidth: 1, borderTopColor: color.line },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.over },
  pasteRow: { flexDirection: 'row', paddingHorizontal: space(3), paddingTop: space(2), backgroundColor: color.card, borderTopWidth: 1, borderTopColor: color.line },
  pasteChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: space(3), borderRadius: 18, borderWidth: 1, borderColor: color.line },
  pasteText: { color: color.accent, fontWeight: '700', fontSize: 14 },
  list: { padding: space(4), gap: space(3), paddingBottom: space(6), maxWidth: 640, width: '100%', alignSelf: 'center' },
  suggestion: { backgroundColor: color.card, borderRadius: 12, padding: space(3), borderWidth: 1, borderColor: color.line },
  bubble: { borderRadius: 16, padding: space(3), gap: space(2), maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.iron },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.card },
  photo: { width: 200, height: 150, borderRadius: 10 },
  error: { ...type.body, color: color.over },
  card: { gap: space(3), marginTop: space(1) },
  item: { gap: space(2), borderTopWidth: 1, borderTopColor: color.line, paddingTop: space(2) },
  tick: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: color.fat, borderColor: color.fat },
  grams: { ...type.body, ...type.number, width: 70, textAlign: 'center', backgroundColor: color.chalk, borderRadius: 8, paddingVertical: space(1) },
  add: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  attached: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(2), backgroundColor: color.card, borderTopWidth: 1, borderTopColor: color.line },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2), padding: space(3), borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.card },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.chalk },
  input: { ...type.body, flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: color.chalk, borderRadius: 22, paddingHorizontal: space(4), paddingVertical: space(3) },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.iron, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: color.chalk, fontWeight: '700', fontSize: 15 },
});
