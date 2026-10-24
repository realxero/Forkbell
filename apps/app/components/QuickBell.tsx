import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { mealForTime, todayLocal, type BellReply } from '@forkbell/shared';
import { api, ApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { speak, stopSpeaking } from '../lib/speak';
import { VoiceButton, voiceAvailable } from './VoiceButton';
import { Proposals } from '../app/(app)/(tabs)/bell';
import { color, radius, space, type } from '../lib/theme';

/**
 * Ask Bell from anywhere: a floating button above the tabs. Hold it and talk,
 * let go, and the answer appears (and is read out if you like). Tap it to
 * talk hands-free, or type in the sheet. Food Bell suggests is reviewed and
 * added right there.
 */
export function QuickBell() {
  const { me } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [hearing, setHearing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [reply, setReply] = useState<BellReply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
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

  const ask = async (question: string, spoken: boolean) => {
    const q = question.trim();
    if (!q) return;
    setOpen(true);
    setAsked(q);
    setReply(null);
    setAdded(false);
    setError(null);
    setBusy(true);
    try {
      const r = await post<BellReply>('/api/bell/chat', {
        messages: [{ role: 'user', text: q }],
        today: todayLocal(),
        meal: mealForTime(),
        localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      });
      setReply(r);
      if (readAloud === 'always' || (readAloud !== 'never' && spoken)) speak(r.question?.text ?? r.reply);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? 'Bell needs a connection.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;
  return (
    <>
      <View pointerEvents="box-none" style={s.fabWrap}>
        {voice ? (
          <VoiceButton
            big
            onTap={() => setOpen(true)}
            onHearing={(t, on) => {
              if (on) setOpen(true);
              setHearing(on ? t : null);
            }}
            onDone={(t) => void ask(t, true)}
            onError={(m) => {
              setOpen(true);
              setError(m);
            }}
          />
        ) : (
          <Pressable onPress={() => setOpen(true)} style={s.fab} accessibilityLabel="Ask Bell">
            <Ionicons name="chatbubble-ellipses" size={26} color={color.onAccent} />
          </Pressable>
        )}
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => !busy && setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <View style={s.head}>
              <Text style={type.title}>Ask Bell</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={color.ironSoft} /></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space(3) }} keyboardShouldPersistTaps="handled">
              {hearing !== null && (
                <View style={s.listening}>
                  <Ionicons name="mic" size={18} color={color.over} />
                  <Text style={[type.body, { flex: 1 }]}>{hearing || 'Listening… let go when you’re done'}</Text>
                </View>
              )}
              {asked && hearing === null && <Text style={[type.body, { fontWeight: '700' }]}>“{asked}”</Text>}
              {busy && <ActivityIndicator color={color.accent} />}
              {reply && (
                <>
                  <Text style={type.body}>{reply.question?.text ?? reply.reply}</Text>
                  {reply.proposals.length > 0 && <Proposals items={reply.proposals} added={added} onAdded={() => setAdded(true)} />}
                </>
              )}
              {error && <Text style={{ color: color.over }}>{error}</Text>}
              {!asked && hearing === null && !error && (
                <Text style={type.small}>{voice ? 'Hold the button and talk, or type below.' : 'Type a question, or what you ate.'} For example: “How much protein do I have left?” or “I had two eggs and toast”.</Text>
              )}
            </ScrollView>
            <View style={s.inputRow}>
              <TextInput value={text} onChangeText={setText} placeholder="Ask Bell" style={s.input} onSubmitEditing={() => { void ask(text, false); setText(''); }} returnKeyType="send" />
              <Pressable disabled={!text.trim() || busy} onPress={() => { void ask(text, false); setText(''); }} style={[s.send, (!text.trim() || busy) && { opacity: 0.4 }]} accessibilityLabel="Send">
                <Ionicons name="arrow-up" size={20} color={color.onAccent} />
              </Pressable>
            </View>
            <Pressable onPress={() => { setOpen(false); router.push('/bell'); }}><Text style={s.link}>Open the full chat ›</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fabWrap: { position: 'absolute', right: space(4), bottom: 96 },
  fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space(4), paddingBottom: space(8), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listening: { flexDirection: 'row', gap: space(2), alignItems: 'center', backgroundColor: color.dangerBg, borderRadius: 12, padding: space(3) },
  inputRow: { flexDirection: 'row', gap: space(2), alignItems: 'center' },
  input: { ...type.body, flex: 1, backgroundColor: color.chalk, borderRadius: 20, paddingHorizontal: space(4), paddingVertical: space(2) + 2, borderWidth: 1, borderColor: color.line },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  link: { color: color.accent, fontWeight: '700' },
});
