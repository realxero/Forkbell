import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { kokoroLabel, voiceLabel, type VoiceInfo } from '@forkbell/shared';
import { getVoiceChoice, listDeviceVoices, previewVoice, refreshDeviceVoices, serverVoices, setVoiceChoice, stopSpeaking, type VoiceChoice } from '../lib/speak';
import { color, radius, space, type } from '../lib/theme';

const same = (a: VoiceChoice, b: VoiceChoice) => a.kind === b.kind && (a.kind === 'auto' || (b.kind !== 'auto' && a.id === b.id));

/** Settings → Bell → Bell's voice: every good voice, with a play button, and a pick that stays on this device. */
export function BellVoice() {
  const [choice, setChoice] = useState<VoiceChoice>(getVoiceChoice);
  const [device, setDevice] = useState<VoiceInfo[] | null>(null);
  const [server, setServer] = useState<{ voices: string[]; default: string | null; reachable?: boolean } | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    listDeviceVoices().then(setDevice, () => setDevice([]));
    serverVoices().then((r) => setServer(r.server ? r : null));
    return stopSpeaking;
  }, []);

  const pick = (c: VoiceChoice) => {
    setChoice(c);
    setVoiceChoice(c);
  };
  const premium = device?.some((v) => /\.premium\./i.test(v.id));
  const shown = device ? (all ? device : device.slice(0, 6)) : [];

  const row = (c: VoiceChoice, title: string, detail: string | null, key: string) => (
    <View key={key} style={s.row}>
      <Pressable onPress={() => pick(c)} style={s.pick} accessibilityRole="radio" accessibilityState={{ checked: same(choice, c) }}>
        <Ionicons name={same(choice, c) ? 'radio-button-on' : 'radio-button-off'} size={22} color={same(choice, c) ? color.accent : color.ironSoft} />
        <View style={{ flex: 1 }}>
          <Text style={type.body}>{title}</Text>
          {detail && <Text style={type.small}>{detail}</Text>}
        </View>
      </Pressable>
      <Pressable onPress={() => void previewVoice(c)} hitSlop={8} style={s.play} accessibilityLabel={`Play ${title}`}>
        <Ionicons name="play" size={16} color={color.onAccent} />
      </Pressable>
    </View>
  );

  return (
    <View style={s.card}>
      <Text style={[type.title, { fontSize: 18 }]}>Bell’s voice</Text>
      <Text style={type.small}>Used when Bell reads answers out loud. Your pick is kept on this {Platform.OS === 'web' ? 'browser' : 'phone'}.</Text>

      {row({ kind: 'auto' }, 'Automatic', server && server.reachable !== false ? 'Your server’s natural voice, or the best one here if it’s off' : 'The best voice on this device', 'auto')}

      {server && (
        <>
          <Text style={s.group}>From your Forkbell server{server.reachable === false ? ' (not answering right now)' : ''}</Text>
          {server.voices.slice(0, all ? 60 : 6).map((v) => row({ kind: 'server', id: v }, kokoroLabel(v), v === server.default ? 'The server’s default' : null, `s:${v}`))}
        </>
      )}

      <Text style={s.group}>On this {Platform.OS === 'web' ? 'browser' : 'device'}</Text>
      {!device ? (
        <ActivityIndicator color={color.iron} />
      ) : device.length === 0 ? (
        <Text style={type.small}>No voices found.</Text>
      ) : (
        shown.map((v) => row({ kind: 'device', id: v.id }, voiceLabel(v), v.lang, `d:${v.id}`))
      )}
      {((device?.length ?? 0) > 6 || (server?.voices.length ?? 0) > 6) && (
        <Pressable onPress={() => setAll(!all)} style={{ minHeight: 36, justifyContent: 'center' }}>
          <Text style={s.link}>{all ? 'Show fewer' : 'Show all voices'}</Text>
        </Pressable>
      )}

      {Platform.OS === 'ios' && !premium && (
        <View style={s.tip}>
          <Text style={[type.small, { fontWeight: '700' }]}>Want a much more natural voice? It’s free.</Text>
          <Text style={type.small}>
            iPhone Settings → Accessibility → Spoken Content → Voices → English, and download a Premium voice such as Ava, Zoe, Evan or Nathan. Then come back here.
          </Text>
          <Pressable onPress={() => refreshDeviceVoices().then(setDevice)} hitSlop={8}>
            <Text style={s.link}>I downloaded one, check again</Text>
          </Pressable>
        </View>
      )}
      {!server && <Text style={type.small}>For the most human-sounding voice, whoever runs your Forkbell server can connect a speech server such as Kokoro (TTS_BASE_URL).</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: space(2), marginTop: space(6), padding: space(4), backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line },
  group: { ...type.label, marginTop: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2), minHeight: 48 },
  pick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(3), minHeight: 44 },
  play: { width: 34, height: 34, borderRadius: 17, backgroundColor: color.accent, alignItems: 'center', justifyContent: 'center' },
  tip: { gap: space(1), backgroundColor: color.chalk, borderRadius: 12, padding: space(3), marginTop: space(2) },
  link: { color: color.accent, fontWeight: '700', fontSize: 15 },
});
