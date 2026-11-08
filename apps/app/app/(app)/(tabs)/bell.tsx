import { askBell, BellStopped } from '../../../lib/bell-ask';
import { WaterProposal } from '../../../components/WaterProposal';
import { speak } from '../../../lib/speak';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { Pressable } from '../../../components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { bellHistory, bellMood, forAmount, imageLinkIn, JUST_ESTIMATE, mealForTime, todayLocal, type BellMood, type BellQuestion, type FoodProposal, type Meal, amountFromGrams, parseQuantity, unitFor, unitsFor } from '@forkbell/shared';
import { api } from '../../../lib/api';
import { problem, unreachable } from '../../../lib/problem';
import { showToast } from '../../../lib/toast';
import { useViewing } from '../../../lib/profile';
import { buttons } from '../../../lib/buttons';
import { addEntry, removeEntryById } from '../../../lib/actions';
import { useAuth } from '../../../lib/auth';
import { readCache, writeCache } from '../../../lib/sync';
import { clipboardHasImage, imageFromLink, imageFromPasteEvent, pasteImage, pickImage, type ImageResult } from '../../../lib/images';
import { Chip, MEAL_NAMES } from '../../../components/AmountPicker';
import { NumberField } from '../../../components/NumberField';
import { FoodIcon } from '../../../components/FoodIcon';
import { VoiceButton, voiceAvailable } from '../../../components/VoiceButton';
import { BellAvatar } from '../../../components/BellAvatar';
import { color, radius, space, type, textSize } from '../../../lib/theme';
import { Check } from '../../../components/Check';

type Message = {
  role: 'user' | 'assistant';
  text: string;
  image?: string;
  proposals?: FoodProposal[];
  water?: { ml: number; date: string };
  added?: boolean;
  /** which of the proposals are already in the diary, when only some went in */
  addedItems?: number[];
  question?: BellQuestion;
  /** the answer tapped, once there is one */
  answered?: string;
  /** said out loud rather than typed */
  spoken?: boolean;
  /** Bell's face for this reply */
  mood?: BellMood;
};
type Status = { enabled: boolean; model: string | null; error?: string };
const KEY = 'device:bell-chat';
const SUGGESTIONS = ['What have I eaten today?', 'How much protein do I have left?', 'Log 2 eggs and toast for breakfast', 'How is my bench press going?'];

/** Plain words for a failed question to Bell. Bell's own server messages are already written for people. */
const bellProblem = (e: unknown) => (unreachable(e) ? 'Bell needs a connection. Your message is saved.' : e instanceof Error ? e.message : String(e));

export default function Bell() {
  const { me } = useAuth();
  const prefs = me?.preferences.bell ?? { askWhenUnsure: true, voiceSends: true, readAloud: 'voice' as const };
  const params = useLocalSearchParams<{ ask?: string }>();
  // 'unreachable' is not "off": the key may be fine and the phone just has no signal.
  const [status, setStatus] = useState<Status | 'unreachable' | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => readCache<Message[]>(KEY) ?? []);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ message: string; retry: Message[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hearing, setHearing] = useState<{ text: string } | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [canTalk] = useState(voiceAvailable);
  const scroll = useRef<ScrollViewInstance>(null);
  const triedLink = useRef<string | null>(null);
  const stopper = useRef<AbortController | null>(null);
  // A few seconds of excitement when you add the food Bell found.
  const [excited, setExcited] = useState(false);
  useEffect(() => {
    if (!excited) return;
    const t = setTimeout(() => setExcited(false), 4000);
    return () => clearTimeout(t);
  }, [excited]);

  // Checked each time you open the tab, so a key added in Settings takes effect straight away.
  const checkStatus = useCallback(() => {
    api<Status>('/api/bell/status').then(setStatus, () => setStatus('unreachable'));
  }, []);
  useFocusEffect(checkStatus);
  // Keep the conversation on this device (without photos, which are large).
  useEffect(() => {
    writeCache(KEY, messages.slice(-40).map((m) => ({ ...m, image: m.image ? 'photo' : undefined })));
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [messages]);

  const takeImage = (r: ImageResult) => {
    if (!r) return;
    if ('error' in r) return setNotice(r.error);
    setNotice(null);
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

  /** Ask Bell about the conversation so far. On failure the conversation stays, ready for Try again. */
  const ask = async (next: Message[], opts: { spoken?: boolean; body: string }) => {
    const stop = new AbortController();
    stopper.current = stop;
    setBusy(true);
    setFailed(null);
    setNotice(null);
    try {
      const r = await askBell(
        {
          messages: bellHistory(next),
          today: todayLocal(),
          meal: mealForTime(),
          localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        },
        { signal: stop.signal },
      );
      if (stop.signal.aborted) return;
      const mood = bellMood({ userText: opts.body, reply: r.reply, question: r.question });
      setMessages([...next, { role: 'assistant', text: r.reply, proposals: r.proposals.length ? r.proposals : undefined, water: r.water ?? undefined, question: r.question ?? undefined, mood }]);
      // Read the answer aloud: always, or when you asked by voice (Settings → Bell).
      const aloud = prefs.readAloud === 'always' || (prefs.readAloud !== 'never' && opts.spoken);
      if (aloud) void speak(r.reply);
      else AccessibilityInfo.announceForAccessibility(`Bell said: ${r.reply}`);
    } catch (e) {
      if (e instanceof BellStopped || stop.signal.aborted) return;
      if (unreachable(e)) checkStatus();
      setFailed({ message: bellProblem(e), retry: next });
    } finally {
      if (stopper.current === stop) {
        stopper.current = null;
        setBusy(false);
      }
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
    await ask(next, { spoken: opts.spoken, body });
  };

  /** Stop waiting for Bell. Your message stays; the answer, if it still comes, is dropped. */
  const stop = () => {
    stopper.current?.abort();
    stopper.current = null;
    setBusy(false);
    AccessibilityInfo.announceForAccessibility('Stopped');
  };

  /** Clear the chat, with Undo; foods you hadn't added yet are named so they aren't lost by surprise. */
  const newChat = () => {
    const before = messages;
    const unadded = before.filter((m) => m.proposals && !m.added).reduce((n, m) => n + m.proposals!.length - (m.addedItems?.length ?? 0), 0);
    if (busy) stop();
    setMessages([]);
    setFailed(null);
    showToast(unadded ? `Chat cleared, including ${unadded} ${unadded === 1 ? 'food' : 'foods'} you hadn’t added` : 'Chat cleared', { action: { label: 'Undo', run: () => setMessages(before) } });
  };

  // Opened with a question from elsewhere (e.g. Better option → Ask Bell): send it once.
  const asked = useRef<string | null>(null);
  const enabled = typeof status === 'object' && status?.enabled;
  useEffect(() => {
    if (!params.ask || !enabled || asked.current === params.ask) return;
    asked.current = params.ask;
    void send(params.ask);
    router.setParams({ ask: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ask, enabled]);

  const heardAll = (words: string) => {
    if (!words) return;
    if (prefs.voiceSends) return send(words, { spoken: true });
    setText((t) => (t ? `${t} ${words}` : words));
  };

  if (status && status !== 'unreachable' && !status.enabled) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <View style={s.content}>
          <Text style={type.pageTitle}>Bell</Text>
          <View style={s.hello}>
            <BellAvatar size={56} mood="curious" />
            <View style={{ flex: 1, gap: space(1) }}>
              <Text style={[type.body, { fontWeight: '800' }]}>Bell is off</Text>
              <Text style={type.small}>
                Bell is Forkbell’s assistant: ask about your own data, log food by describing it or snapping a photo, and review everything before it’s added. Everything else in Forkbell works without it.
              </Text>
            </View>
          </View>
          <Text style={type.small}>{status.error ?? 'Add an AI key to turn it on. Google Gemini, Anthropic and OpenAI all work; Gemini has a free tier.'}</Text>
          <Pressable onPress={() => router.push('/setting/bell')} style={s.accentButton}>
            <Text style={s.accentButtonText}>Add a key in Settings</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const offline = status === 'unreachable';
  const lastIndex = messages.length - 1;
  const lastMood = [...messages].reverse().find((m) => m.role === 'assistant')?.mood ?? 'happy';
  const headMood: BellMood = busy ? 'thinking' : hearing ? 'listening' : excited ? 'excited' : offline ? 'concerned' : lastMood;
  const empty = !text.trim() && !image;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <View style={s.head}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <BellAvatar size={36} mood={headMood} alive />
            <Text style={type.pageTitle} accessibilityRole="header">Bell</Text>
          </View>
          {messages.length > 0 && (
            <Pressable onPress={newChat} hitSlop={12} style={s.headButton}>
              <Text style={s.link}>New chat</Text>
            </Pressable>
          )}
        </View>
        <ScrollView ref={scroll} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
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
                <Pressable key={q} onPress={() => send(q)} disabled={offline} style={[s.suggestion, offline && { opacity: 0.5 }]}>
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
                {m.image === 'photo' && (
                  <View style={s.photoTag}>
                    <Ionicons name="image-outline" size={16} color={m.role === 'user' ? color.chalk : color.ironSoft} />
                    <Text style={[type.small, m.role === 'user' && { color: color.chalk }]}>Photo</Text>
                  </View>
                )}
                {!!m.text && (
                  <Text style={[type.body, m.role === 'user' && { color: color.chalk }]} accessibilityLabel={`${m.role === 'user' ? (m.spoken ? 'You said out loud' : 'You said') : 'Bell said'}: ${m.text}`}>
                    {m.spoken ? <Ionicons name="mic" size={15} color={m.role === 'user' ? color.chalk : color.ironSoft} /> : null}
                    {m.spoken ? ' ' : ''}
                    {m.text}
                  </Text>
                )}
                {m.proposals && (
                  <Proposals
                    items={m.proposals}
                    added={Boolean(m.added)}
                    done={m.addedItems}
                    onProgress={(done) => setMessages((list) => list.map((x, j) => (j === i ? { ...x, addedItems: done } : x)))}
                    onAdded={() => {
                      setMessages((list) => list.map((x, j) => (j === i ? { ...x, added: true } : x)));
                      setExcited(true);
                    }}
                  />
                )}
                {m.water && <WaterProposal ml={m.water.ml} date={m.water.date} onAdded={() => setExcited(true)} />}
                {m.question && <Question q={m.question} answered={m.answered} live={i === lastIndex && !busy} onAnswer={(a) => send(a, { answering: i })} />}
              </View>
            </View>
          ))}
          {busy && (
            <View style={s.theirRow} accessibilityLiveRegion="polite">
              <BellAvatar size={28} mood="thinking" alive />
              <View style={[s.bubble, s.theirs, { flexDirection: 'row', gap: space(2), alignItems: 'center' }]}>
                <ActivityIndicator color={color.iron} />
                <Text style={type.small}>Bell is thinking…</Text>
              </View>
            </View>
          )}
          {failed && !busy && (
            <View style={s.problem} accessibilityLiveRegion="polite">
              <Text style={[type.small, { flex: 1, color: color.iron }]}>{failed.message}</Text>
              <Pressable onPress={() => void ask(failed.retry, { body: failed.retry.at(-1)?.text ?? '' })} disabled={offline} style={[s.retry, offline && { opacity: 0.5 }]}>
                <Text style={buttons.smallText}>Try again</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        {offline && (
          <View style={s.offline} accessibilityLiveRegion="polite">
            <Ionicons name="cloud-offline-outline" size={20} color={color.ironSoft} />
            <Text style={[type.small, { flex: 1, color: color.iron }]}>Bell needs a connection. Your chat is saved.</Text>
            <Pressable onPress={checkStatus} hitSlop={10} style={s.headButton}>
              <Text style={s.link}>Try again</Text>
            </Pressable>
          </View>
        )}
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
            {image ? <Image source={{ uri: image }} style={{ width: 48, height: 48, borderRadius: radius.input }} /> : <ActivityIndicator color={color.iron} />}
            <Text style={[type.small, { flex: 1 }]}>{image ? 'Photo attached. Add a note if you like (“half of this”, “with ranch”).' : 'Loading the image from that link…'}</Text>
            {image && (
              <Pressable onPress={() => setImage(null)} hitSlop={12} style={s.headButton}>
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
              <Ionicons name="clipboard-outline" size={16} color={color.iron} />
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
          {busy ? (
            <Pressable onPress={stop} style={s.send} accessibilityLabel="Stop waiting for Bell">
              <Ionicons name="stop" size={18} color={color.chalk} />
            </Pressable>
          ) : empty && canTalk ? (
            <VoiceButton
              disabled={offline}
              onHearing={(t, on) => setHearing(on ? { text: t } : null)}
              onDone={heardAll}
              onError={(m) => setNotice(m)}
            />
          ) : (
            <Pressable onPress={() => send()} disabled={empty || offline} style={[s.send, (empty || offline) && { opacity: 0.4 }]} accessibilityLabel="Send" accessibilityState={{ disabled: empty || offline }}>
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

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

/**
 * Bell's suggested foods: change amounts or meals, untick any, then add them.
 * Each item is added on its own and remembered once it's in, so if one fails,
 * Try again only sends the rest and nothing lands in the diary twice.
 */
export function Proposals({ items, added, done = [], onProgress, onAdded }: { items: FoodProposal[]; added: boolean; done?: number[]; onProgress?: (done: number[]) => void; onAdded: () => void }) {
  const viewing = useViewing();
  const [list, setList] = useState(items.map((p, i) => ({ ...p, keep: !done.includes(i) })));
  const [inDiary, setInDiary] = useState<number[]>(added ? items.map((_, i) => i) : done);
  // Corrections whose old entry is still there: the new one went in, removing the old one didn't.
  const [stuck, setStuck] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sameMeal = list.every((p) => p.meal === list[0]?.meal);
  const [perItem, setPerItem] = useState(!sameMeal);
  const per100 = (p: FoodProposal) => p.food?.per100 ?? p.per100!;
  const todo = list.map((p, i) => ({ p, i })).filter(({ p, i }) => p.keep && !inDiary.includes(i));
  const total = todo.reduce((t, { p }) => t + forAmount(per100(p), p.grams).kcal, 0);
  const allIn = added || (inDiary.length > 0 && todo.length === 0 && stuck.length === 0);
  const patch = (i: number, change: Partial<FoodProposal>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...change } : x)));

  const removeOld = async (i: number) => {
    const p = list[i]!;
    try {
      await removeEntryById(p.replaces!.id, p.date);
      setStuck((x) => x.filter((y) => y !== i));
      return true;
    } catch {
      setStuck((x) => (x.includes(i) ? x : [...x, i]));
      return false;
    }
  };

  const add = async () => {
    setBusy(true);
    setError(null);
    const inNow = [...inDiary];
    try {
      for (const { p, i } of todo) {
        await addEntry({
          date: p.date,
          meal: p.meal,
          grams: p.grams,
          amount: p.amount ?? null,
          unit: p.unit ?? null,
          // Bell's estimate keeps its serving, so next time "1 shake" is a tap.
          food: p.food ?? { name: p.name, brand: p.brand, source: 'custom', sourceId: null, per100: p.per100!, servingGrams: p.servingGrams ?? null, servingLabel: p.servingLabel ?? null, barcode: null, portions: [] },
        });
        inNow.push(i);
        setInDiary([...inNow]);
        onProgress?.([...inNow]);
        // A correction: the entry it replaces goes once the new one is in.
        if (p.replaces) await removeOld(i);
      }
      onAdded();
    } catch (e) {
      const left = todo.length - (inNow.length - inDiary.length);
      setError(`${inNow.length > inDiary.length ? `Added ${inNow.length - inDiary.length}, but ` : ''}${left === 1 ? 'one item' : `${left} items`} didn’t go in. ${problem(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const whose = viewing ? ` to ${viewing.name.split(' ')[0]}’s diary` : '';
  return (
    <View style={s.card}>
      {!allIn && !perItem && list[0] && (
        <View style={{ gap: space(1) }}>
          <View style={s.row}>
            <Text style={[type.label, { flex: 1 }]}>Meal</Text>
            {list.length > 1 && (
              <Pressable onPress={() => setPerItem(true)} hitSlop={10} style={s.headButton}>
                <Text style={s.smallLink}>Different meals</Text>
              </Pressable>
            )}
          </View>
          <View style={s.choices}>
            {MEALS.map((m) => (
              <Chip key={m} label={MEAL_NAMES[m]} on={list[0]!.meal === m} onPress={() => setList((l) => l.map((x) => ({ ...x, meal: m })))} />
            ))}
          </View>
        </View>
      )}
      {list.map((p, i) => {
        const n = forAmount(per100(p), p.grams);
        const isIn = added || inDiary.includes(i);
        const editable = !isIn && p.keep && !busy;
        return (
          <View key={i} style={[s.item, !p.keep && !isIn && { opacity: 0.45 }]}>
            <View style={s.itemHead}>
              {isIn ? (
                <View style={[s.tick, s.tickOn]} accessibilityLabel={`${p.name}, added`}>
                  <Check on tint={color.chalk} size={18} />
                </View>
              ) : (
                <Pressable
                  disabled={busy}
                  onPress={() => patch(i, { keep: !p.keep } as Partial<FoodProposal>)}
                  hitSlop={10}
                  style={[s.tick, p.keep && s.tickOn]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: p.keep }}
                  accessibilityLabel={`Include ${p.name}`}
                >
                  <Check on={p.keep} tint={color.chalk} size={18} />
                </Pressable>
              )}
              <FoodIcon name={p.name} brand={p.brand} size={32} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.body, { fontWeight: '700' }]}>{p.name}</Text>
                <Text style={[type.small, type.number]}>
                  {p.brand ? `${p.brand} · ` : ''}
                  {n.kcal} kcal · {n.protein} g protein
                  {p.estimate ? ' · estimate' : p.food ? ' · from your foods' : ''}
                  {isIn ? ' · added' : ''}
                </Text>
                {p.note && <Text style={type.small}>{p.note}</Text>}
                {p.replaces && (
                  <Text style={[type.small, { fontWeight: '700' }]}>
                    Replaces {p.replaces.name} ({p.replaces.kcal} kcal){isIn ? '' : ' when you tap Add'}
                  </Text>
                )}
                {p.warnings?.length > 0 && (
                  <View style={s.warning}>
                    <Ionicons name="warning-outline" size={16} color={color.warnText} />
                    <Text style={[type.small, { flex: 1, color: color.warnText, fontWeight: '700' }]}>{p.warnings.join(' · ')} (by name)</Text>
                  </View>
                )}
              </View>
            </View>
            {stuck.includes(i) && (
              <View style={s.stuck}>
                <Text style={[type.small, { flex: 1, color: color.iron }]}>Added, but the old {p.replaces!.name} is still in your diary.</Text>
                <Pressable onPress={() => void removeOld(i)} style={s.retry}>
                  <Text style={buttons.smallText}>Remove it</Text>
                </Pressable>
              </View>
            )}
            {editable && (
              <View style={s.controls}>
                <View style={s.amountRow}>
                  <ProposalAmount p={p} onChange={(change) => patch(i, change)} />
                </View>
                {perItem && (
                  <View style={s.choices}>
                    {MEALS.map((m) => (
                      <Chip key={m} label={MEAL_NAMES[m]} on={p.meal === m} onPress={() => patch(i, { meal: m })} />
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
      {error && (
        <Text style={s.fieldProblem} accessibilityLiveRegion="assertive">{error}</Text>
      )}
      {allIn ? (
        <View style={s.addedLine} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={18} color={color.fat} />
          <Text style={[type.small, { color: color.fatText, fontWeight: '700' }]}>Added to {viewing ? `${viewing.name.split(' ')[0]}’s` : 'your'} diary.</Text>
        </View>
      ) : (
        todo.length > 0 && (
          <Pressable disabled={busy} onPress={add} style={[s.add, busy && { opacity: 0.5 }]} accessibilityState={{ busy }}>
            <Text style={buttons.filledText}>
              {busy ? 'Adding…' : `${error ? 'Try again: add' : 'Add'} ${todo.length} ${todo.length === 1 ? 'item' : 'items'}${whose} · ${total} kcal`}
            </Text>
          </Pressable>
        )
      )}
    </View>
  );
}

const s = StyleSheet.create({
  theirRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2), maxWidth: '100%' },
  hello: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.card, padding: space(3) },
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space(4), paddingTop: space(4), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.accent, fontWeight: '700', fontSize: textSize.body },
  smallLink: { color: color.accent, fontWeight: '700', fontSize: textSize.control },
  headButton: { minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  // Bell's own answers keep Bell's accent.
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space(4), borderRadius: radius.pill, borderWidth: 1, borderColor: color.accent, backgroundColor: color.card },
  choiceOn: { backgroundColor: color.accent },
  choiceText: { color: color.accent, fontWeight: '700', fontSize: textSize.control },
  hearing: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(3), backgroundColor: color.card, borderTopWidth: 1, borderTopColor: color.line },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(1), backgroundColor: color.raised, borderTopWidth: 1, borderTopColor: color.line },
  dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color.over },
  pasteRow: { flexDirection: 'row', paddingHorizontal: space(3), paddingTop: space(2), backgroundColor: color.card, borderTopWidth: 1, borderTopColor: color.line },
  pasteChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space(3), borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, backgroundColor: color.card },
  pasteText: { color: color.iron, fontWeight: '700', fontSize: textSize.control },
  list: { padding: space(4), gap: space(3), paddingBottom: space(6), maxWidth: 640, width: '100%', alignSelf: 'center' },
  suggestion: { backgroundColor: color.card, borderRadius: radius.row, padding: space(3), borderWidth: 1, borderColor: color.line, minHeight: 44, justifyContent: 'center' },
  bubble: { borderRadius: radius.card, padding: space(3), gap: space(2), maxWidth: '92%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.iron },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.card },
  photo: { width: 200, height: 150, borderRadius: radius.input },
  photoTag: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.dangerBg, borderRadius: radius.card, padding: space(3) },
  retry: { ...buttons.small, minHeight: 44 },
  fieldProblem: { ...type.small, color: color.over },
  card: { gap: space(3), marginTop: space(1) },
  item: { gap: space(2), borderTopWidth: 1, borderTopColor: color.line, paddingTop: space(3) },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space(2) },
  // The controls for one food, grouped under it and lined up with its name.
  controls: { gap: space(2), marginLeft: 36 + space(2), backgroundColor: color.raised, borderRadius: radius.row, padding: space(2) },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), flexWrap: 'wrap' },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: space(1) },
  stuck: { flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: color.warnBg, borderRadius: radius.row, padding: space(2) },
  tick: { width: 28, height: 28, borderRadius: radius.input - 2, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: color.iron, borderColor: color.iron },
  grams: { ...type.body, ...type.number, width: 70, minHeight: 44, textAlign: 'center', backgroundColor: color.card, borderRadius: radius.input, borderWidth: 1, borderColor: color.line, paddingVertical: space(1) },
  add: { ...buttons.filled },
  addedLine: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  attached: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingHorizontal: space(4), paddingVertical: space(2), backgroundColor: color.card, borderTopWidth: 1, borderTopColor: color.line },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2), padding: space(3), borderTopWidth: 1, borderTopColor: color.line, backgroundColor: color.card },
  icon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: color.chalk },
  input: { ...type.body, flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: color.chalk, borderRadius: radius.card, paddingHorizontal: space(4), paddingVertical: space(3) },
  send: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: color.iron, alignItems: 'center', justifyContent: 'center' },
  accentButton: { ...buttons.filled, backgroundColor: color.accent },
  accentButtonText: { ...buttons.filledText, color: color.onAccent },
});

/**
 * How much, on one of Bell's cards: a number in the unit Bell (or you) used,
 * and the units that fit the food, the same as logging it yourself.
 */
function ProposalAmount({ p, onChange }: { p: FoodProposal; onChange: (patch: Pick<FoodProposal, 'grams' | 'amount' | 'unit'>) => void }) {
  const { me } = useAuth();
  const prefer = me?.weightUnit ?? 'lb';
  const food = p.food ?? { name: p.name, servingGrams: p.servingGrams ?? null, servingLabel: p.servingLabel ?? null, portions: [] };
  const units = unitsFor(food, prefer);
  const said = p.amount && p.unit ? { quantity: p.amount, unit: unitFor(food, p.unit, prefer) } : amountFromGrams(food, p.grams, prefer);
  const set = (quantity: number, key: string) => {
    const u = units.find((x) => x.key === key) ?? said.unit;
    const grams = Math.round(quantity * u.grams * 10) / 10;
    if (grams > 0 && grams <= 5000) onChange({ grams, amount: quantity, unit: u.key });
  };
  return (
    <>
      <NumberField
        label={`${p.name}, how many ${said.unit.label}`}
        value={String(Math.round(said.quantity * 100) / 100)}
        onCommit={(t) => {
          const q = parseQuantity(t);
          if (q) set(q, said.unit.key);
        }}
        style={s.grams}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(1) }} style={{ flexGrow: 0, maxWidth: '100%' }}>
        {units.slice(0, 6).map((u) => (
          <Chip
            key={u.key}
            label={u.label}
            on={u.key === said.unit.key}
            onPress={() => {
              // The same amount of food in the new unit.
              const q = p.grams / u.grams;
              set(u.key === 'g' || u.key === 'ml' ? Math.round(q) : Math.round(q * 100) / 100, u.key);
            }}
          />
        ))}
      </ScrollView>
      {said.unit.key !== 'g' && <Text style={type.small}>{Math.round(p.grams)} g</Text>}
    </>
  );
}
