// Ask Bell from inside a workout. Bell sees the session as it stands (what
// you've done, what's left, last time), so "what weight next?" just works.
// Short answers, quick questions to tap, and hold the mic to talk.
import { askBell } from '../lib/bell-ask';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { bellMood, mealForTime, todayLocal, type BellMood, type BellReply } from '@forkbell/shared';
import { api, ApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { speak, stopSpeaking } from '../lib/speak';
import { BellAvatar } from './BellAvatar';
import { VoiceButton, voiceAvailable } from './VoiceButton';
import { color, radius, space, type } from '../lib/theme';

const QUICK = ['What weight for my next set?', 'How long should I rest?', 'This machine’s taken. What can I do instead?', 'Am I on track to beat last time?'];

type Msg = { role: 'user' | 'assistant'; text: string; mood?: BellMood };

/** The floating Bell button for the workout screen, and its sheet. Hidden when Bell has no AI key. */
export function WorkoutBell({ workoutId, beforeAsk, lifted }: { workoutId: string; beforeAsk: () => Promise<void>; lifted: boolean }) {
  const { me } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hearing, setHearing] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const voice = voiceAvailable();
  const readAloud = me?.preferences.bell?.readAloud ?? 'voice';

  useEffect(() => {
    api<{ enabled: boolean }>('/api/bell/status').then((s) => setEnabled(s.enabled), () => setEnabled(false));
  }, []);
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  const ask = async (question: string, spoken: boolean) => {
    const q = question.trim();
    if (!q || busy) return;
    setOpen(true);
    setError(null);
    const next: Msg[] = [...messages, { role: 'user', text: q }];
    setMessages(next);
    setBusy(true);
    try {
      await beforeAsk().catch(() => {}); // the sets you just ticked, saved first so Bell sees them
      const r = await askBell({
        messages: next.slice(-12).map(({ role, text }) => ({ role, text })),
        today: todayLocal(),
        meal: mealForTime(),
        localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        workoutId,
      });
      const answer = r.question?.text ?? r.reply;
      setMessages((m) => [...m, { role: 'assistant', text: answer, mood: bellMood({ userText: q, reply: r.reply, question: r.question }) }]);
      if (readAloud === 'always' || (readAloud !== 'never' && spoken)) void speak(answer);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? 'Bell needs a connection.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  if (!enabled) return null;
  return (
    <>
      <View pointerEvents="box-none" style={[s.fabWrap, lifted && { bottom: 120 }]}>
        {voice ? (
          <VoiceButton big onTap={() => setOpen(true)} onHearing={(t, on) => setHearing(on ? t : null)} onDone={(t) => void ask(t, true)} onError={(m) => { setOpen(true); setError(m); }} />
        ) : (
          <Pressable onPress={() => setOpen(true)} style={s.fab} accessibilityLabel="Ask Bell about this workout">
            <BellAvatar size={38} tint={color.onAccent} face={color.accent} />
          </Pressable>
        )}
      </View>
      {hearing !== null && !open && (
        <View pointerEvents="none" style={[s.bubble, lifted && { bottom: 120 + 70 }]} accessibilityLiveRegion="polite">
          <Ionicons name="mic" size={18} color={color.over} />
          <Text style={[type.body, { flexShrink: 1 }]} numberOfLines={3}>{hearing || 'Listening… let go when you’re done'}</Text>
        </View>
      )}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => !busy && setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.head}>
              <BellAvatar size={30} mood={busy ? 'thinking' : hearing !== null ? 'listening' : (messages.at(-1)?.mood ?? 'happy')} alive={open} />
              <Text style={[type.title, { flex: 1 }]}>Bell · this workout</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
            </View>
            <ScrollView ref={scroll} style={{ maxHeight: 360 }} contentContainerStyle={{ gap: space(2) }} keyboardShouldPersistTaps="handled">
              {messages.length === 0 && <Text style={type.small}>Bell can see what you’ve done so far and what you did last time.</Text>}
              {messages.map((m, i) => (
                <View key={i} style={[s.msg, m.role === 'user' ? s.mine : s.theirs]}>
                  <Text style={[type.body, m.role === 'user' && { color: color.chalk }]}>{m.text}</Text>
                </View>
              ))}
              {busy && <ActivityIndicator color={color.accent} />}
              {error && <Text style={{ color: color.over }}>{error}</Text>}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }} keyboardShouldPersistTaps="handled">
              {QUICK.map((q) => (
                <Pressable key={q} onPress={() => void ask(q, false)} disabled={busy} style={[s.quick, busy && { opacity: 0.5 }]}>
                  <Text style={type.small}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={s.inputRow}>
              <TextInput value={text} onChangeText={setText} placeholder="Ask about this workout" placeholderTextColor={color.placeholder} style={s.input} returnKeyType="send" onSubmitEditing={() => { void ask(text, false); setText(''); }} />
              <Pressable disabled={!text.trim() || busy} onPress={() => { void ask(text, false); setText(''); }} style={[s.send, (!text.trim() || busy) && { opacity: 0.4 }]} accessibilityLabel="Send">
                <Ionicons name="arrow-up" size={20} color={color.onAccent} />
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fabWrap: { position: 'absolute', right: space(4), bottom: space(6) },
  fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  bubble: { position: 'absolute', right: space(4), bottom: space(6) + 70, maxWidth: 300, flexDirection: 'row', gap: space(2), alignItems: 'center', backgroundColor: color.card, borderRadius: 16, padding: space(3), borderWidth: 1, borderColor: color.line },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  msg: { borderRadius: 14, padding: space(3), maxWidth: '88%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.iron },
  theirs: { alignSelf: 'flex-start', backgroundColor: color.raised },
  quick: { borderWidth: 1, borderColor: color.line, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2) },
  inputRow: { flexDirection: 'row', gap: space(2), alignItems: 'center' },
  input: { ...type.body, flex: 1, backgroundColor: color.chalk, borderRadius: 20, paddingHorizontal: space(4), paddingVertical: space(2) + 2, borderWidth: 1, borderColor: color.line },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
});
