import { KeyboardLift } from './KeyboardLift';
import { askBell } from '../lib/bell-ask';
import { WaterProposal } from './WaterProposal';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { bellHistory, bellMood, mealForTime, todayLocal, type BellMood, type BellReply, type BellTurn, type FoodProposal } from '@forkbell/shared';
import { api, ApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { speak, stopSpeaking } from '../lib/speak';
import { VoiceButton, voiceAvailable } from './VoiceButton';
import { BellAvatar } from './BellAvatar';
import { Proposals, Question } from '../app/(app)/(tabs)/bell';
import { color, radius, space, type } from '../lib/theme';

/**
 * Ask Bell from anywhere: a floating button above the tabs. Hold it and talk,
 * let go, and the answer appears (and is read out if you like). Tap it to
 * talk hands-free, or type in the sheet. Food Bell suggests is reviewed and
 * added right there. It keeps the conversation like the full chat does, so
 * Bell's questions can be answered with a tap.
 */
type Turn = BellTurn & { water?: { ml: number; date: string }; proposals?: FoodProposal[]; added?: boolean; answered?: string; mood?: BellMood };
/** After this long without a message, the next question starts a new conversation. */
const FRESH_AFTER = 15 * 60_000;

export function QuickBell() {
  const { me } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [hearing, setHearing] = useState<string | null>(null);
  const [text, setText] = useState('');
  // The whole conversation, like the full chat: Bell needs it to understand an
  // answer to its own question ("Oat milk", "16 oz").
  const [turns, setTurns] = useState<Turn[]>([]);
  const lastAt = useRef(0);
  const scroll = useRef<ScrollViewInstance>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voice = voiceAvailable();
  const readAloud = me?.preferences.bell?.readAloud ?? 'voice';

  useFocusEffect(
    useCallback(() => {
      api<{ enabled: boolean }>('/api/bell/status').then((s) => setEnabled(s.enabled), () => setEnabled(false));
    }, []),
  );
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);
  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [turns, busy]);

  const ask = async (question: string, spoken: boolean, answering?: number) => {
    const q = question.trim();
    if (!q || busy) return;
    setOpen(true);
    setError(null);
    // A new question long after the last one starts over; answering Bell never does.
    const fresh = answering === undefined && Date.now() - lastAt.current > FRESH_AFTER;
    const base = fresh ? [] : answering !== undefined ? turns.map((t, j) => (j === answering ? { ...t, answered: q } : t)) : turns;
    const next: Turn[] = [...base, { role: 'user', text: q }];
    setTurns(next);
    lastAt.current = Date.now();
    setBusy(true);
    try {
      const r = await askBell({
        messages: bellHistory(next),
        today: todayLocal(),
        meal: mealForTime(),
        localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      });
      setTurns([...next, { role: 'assistant', text: r.reply, question: r.question ?? null, proposals: r.proposals.length ? r.proposals : undefined, water: r.water ?? undefined, mood: bellMood({ userText: q, reply: r.reply, question: r.question }) }]);
      lastAt.current = Date.now();
      if (readAloud === 'always' || (readAloud !== 'never' && spoken)) void speak(r.question?.text ?? r.reply);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? 'Bell needs a connection.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const startOver = () => {
    stopSpeaking();
    setTurns([]);
    setError(null);
    lastAt.current = 0;
  };
  const lastIndex = turns.length - 1;
  const [excited, setExcited] = useState(false);
  useEffect(() => {
    if (!excited) return;
    const t = setTimeout(() => setExcited(false), 4000);
    return () => clearTimeout(t);
  }, [excited]);
  const mood: BellMood = busy ? 'thinking' : hearing !== null ? 'listening' : excited ? 'excited' : (turns.at(-1)?.mood ?? 'happy');

  if (!enabled) return null;
  return (
    <>
      <View pointerEvents="box-none" style={s.fabWrap}>
        {voice ? (
          <VoiceButton
            big
            onTap={() => setOpen(true)}
            // Don't open the sheet while the button is held: a Modal appearing under your finger
            // takes the touch away and ends the listening. It opens when you let go.
            onHearing={(t, on) => setHearing(on ? t : null)}
            onDone={(t) => void ask(t, true)}
            onError={(m) => {
              setOpen(true);
              setError(m);
            }}
          />
        ) : (
          <Pressable onPress={() => setOpen(true)} style={s.fab} accessibilityLabel="Ask Bell">
            <BellAvatar size={38} tint={color.onAccent} face={color.accent} />
          </Pressable>
        )}
      </View>

      {hearing !== null && !open && (
        <View pointerEvents="none" style={s.bubble} accessibilityLiveRegion="polite">
          <Ionicons name="mic" size={18} color={color.over} />
          <Text style={[type.body, { flexShrink: 1 }]} numberOfLines={4}>{hearing || 'Listening… let go when you’re done'}</Text>
        </View>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        {/* The sheet moves up with the keyboard, so what you type stays in view. */}
        <KeyboardLift>
        <Pressable style={s.backdrop} onPress={() => !busy && setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.head}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                <BellAvatar size={30} mood={mood} alive={open} />
                <Text style={type.title}>Ask Bell</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
            </View>
            <ScrollView ref={scroll} style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space(3) }} keyboardShouldPersistTaps="handled">
              {hearing !== null && (
                <View style={s.listening}>
                  <Ionicons name="mic" size={18} color={color.over} />
                  <Text style={[type.body, { flex: 1 }]}>{hearing || 'Listening… let go when you’re done'}</Text>
                </View>
              )}
              {turns.map((t, i) =>
                t.role === 'user' ? (
                  // An answer tapped on Bell's question shows on its button, not again here.
                  turns[i - 1]?.answered === t.text ? null : (
                    <Text key={i} style={[type.body, { fontWeight: '700' }]}>“{t.text}”</Text>
                  )
                ) : (
                  <View key={i} style={{ gap: space(2) }}>
                    {!!t.text && <Text style={type.body}>{t.text}</Text>}
                    {t.question && <Question q={t.question} answered={t.answered} live={i === lastIndex && !busy} onAnswer={(a) => void ask(a, false, i)} />}
                    {t.water && <WaterProposal ml={t.water.ml} date={t.water.date} onAdded={() => setExcited(true)} />}
                    {t.proposals && (
                      <Proposals items={t.proposals} added={Boolean(t.added)} onAdded={() => {
                        setTurns((l) => l.map((x, j) => (j === i ? { ...x, added: true } : x)));
                        setExcited(true);
                      }} />
                    )}
                  </View>
                ),
              )}
              {busy && <ActivityIndicator color={color.accent} />}
              {error && <Text style={{ color: color.over }}>{error}</Text>}
              {!turns.length && hearing === null && !error && (
                <Text style={type.small}>{voice ? 'Hold the button and talk, or type below.' : 'Type a question, or what you ate.'} For example: “How much protein do I have left?” or “I had two eggs and toast”.</Text>
              )}
            </ScrollView>
            <View style={s.inputRow}>
              <TextInput value={text} onChangeText={setText} placeholder="Ask Bell" style={s.input} onSubmitEditing={() => { void ask(text, false); setText(''); }} returnKeyType="send" />
              <Pressable disabled={!text.trim() || busy} onPress={() => { void ask(text, false); setText(''); }} style={[s.send, (!text.trim() || busy) && { opacity: 0.4 }]} accessibilityLabel="Send">
                <Ionicons name="arrow-up" size={20} color={color.onAccent} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {turns.length > 0 ? (
                <Pressable onPress={startOver} hitSlop={8}><Text style={s.link}>New question</Text></Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => { setOpen(false); router.push('/bell'); }} hitSlop={8}><Text style={s.link}>Open the full chat ›</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardLift>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fabWrap: { position: 'absolute', right: space(4), bottom: 96 },
  bubble: { position: 'absolute', right: space(4), bottom: 96 + 58 + 12, maxWidth: 300, flexDirection: 'row', gap: space(2), alignItems: 'center', backgroundColor: color.card, borderRadius: 16, padding: space(3), borderWidth: 1, borderColor: color.line, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center', maxHeight: '92%' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listening: { flexDirection: 'row', gap: space(2), alignItems: 'center', backgroundColor: color.dangerBg, borderRadius: 12, padding: space(3) },
  inputRow: { flexDirection: 'row', gap: space(2), alignItems: 'center' },
  input: { ...type.body, flex: 1, backgroundColor: color.chalk, borderRadius: 20, paddingHorizontal: space(4), paddingVertical: space(2) + 2, borderWidth: 1, borderColor: color.line },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  link: { color: color.accent, fontWeight: '700' },
});
