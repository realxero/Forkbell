// Settings → Siri and Shortcuts: make a Shortcut key, and how to build the
// shortcuts with it, step by step, using the action names as the Shortcuts
// app shows them.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { api, del, getServerUrl, post } from '../lib/api';
import { confirm } from '../lib/confirm';
import { color, radius, space, type } from '../lib/theme';

type Key = { id: string; label: string; hint: string; createdAt: string; lastUsedAt: string | null };

export function ShortcutsSection() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const server = getServerUrl() ?? 'https://your-forkbell';
  const load = useCallback(() => {
    api<{ keys: Key[] }>('/api/shortcuts/keys').then((r) => setKeys(r.keys), (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);
  const date = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <View style={{ gap: space(3) }}>
      <Text style={type.body}>
        Ask Bell with Siri, log food hands-free, or hear what’s left today. A Shortcut key lets the Shortcuts app do just that: it can’t open or change anything else in Forkbell. Bell still asks before anything is logged.
      </Text>

      <Text style={s.group}>Your keys</Text>
      {error && <Text style={{ color: color.over }}>{error}</Text>}
      {keys?.length === 0 && <Text style={type.small}>None yet.</Text>}
      {keys?.map((k) => (
        <View key={k.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '700' }]}>{k.label} <Text style={type.small}>{k.hint}</Text></Text>
            <Text style={type.small}>Made {date(k.createdAt)} · {k.lastUsedAt ? `last used ${date(k.lastUsedAt)}` : 'not used yet'}</Text>
          </View>
          <Pressable
            onPress={async () => {
              if (!(await confirm(`Remove “${k.label}”?`, 'Shortcuts using it stop working straight away.', 'Remove'))) return;
              await del(`/api/shortcuts/keys/${k.id}`).catch((e) => setError(e instanceof Error ? e.message : String(e)));
              load();
            }}
            hitSlop={8}
          >
            <Text style={[s.link, { color: color.over }]}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {fresh ? (
        <View style={s.fresh}>
          <Text style={[type.body, { fontWeight: '700' }]}>Your new key. Copy it now: it’s only shown once.</Text>
          <Text selectable style={s.token}>{fresh}</Text>
          <View style={{ flexDirection: 'row', gap: space(4) }}>
            <Pressable onPress={async () => { await Clipboard.setStringAsync(fresh); setCopied(true); }} style={s.button}>
              <Text style={s.buttonText}>{copied ? 'Copied' : 'Copy key'}</Text>
            </Pressable>
            <Pressable onPress={() => setFresh(null)} style={{ justifyContent: 'center' }}><Text style={s.link}>Done</Text></Pressable>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
          <TextInput value={label} onChangeText={setLabel} placeholder="Name it, e.g. iPhone" placeholderTextColor={color.placeholder} style={[s.input, { flex: 1 }]} />
          <Pressable
            onPress={async () => {
              setError(null);
              try {
                const r = await post<{ token: string }>('/api/shortcuts/keys', { label: label || 'iPhone' });
                setFresh(r.token);
                setCopied(false);
                setLabel('');
                load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
            style={s.button}
          >
            <Text style={s.buttonText}>Make a key</Text>
          </Pressable>
        </View>
      )}

      <Text style={s.group}>“Ask Bell”: questions and logging food</Text>
      <Text style={type.small}>In the Shortcuts app, make a new shortcut called Ask Bell (that’s what you’ll say to Siri), then add these actions in order:</Text>
      <Steps
        steps={[
          'Dictate Text.',
          `Get Contents of URL. Set the URL to ${server}/api/shortcuts/ask. Tap the arrow to show more: Method POST. Under Headers, add Authorization with the value Bearer, a space, then your key. Request Body JSON: add a Text field named text, and set it to Dictated Text.`,
          'Get Dictionary Value. Get Value for the key speak, in Contents of URL.',
          'Speak Text, with Dictionary Value.',
          'To log food too, carry on: Get Dictionary Value again, Value for addId, in Contents of URL (tap the input to pick it).',
          'If, Dictionary Value, has any value.',
          'Inside the If: Choose from Menu, with the prompt Add it? and two options, Yes and No.',
          `Under Yes: Get Contents of URL, ${server}/api/shortcuts/add, Method POST, the same Authorization header, and a JSON Text field named addId set to the addId Dictionary Value. Then Get Dictionary Value for speak, and Speak Text.`,
        ]}
      />
      <Text style={type.small}>Then: “Hey Siri, Ask Bell”, “I had two eggs and toast”, and say “Yes” to add them. Questions like “how much protein do I have left?” just get answered.</Text>

      <Text style={s.group}>“Food left”: quick and free</Text>
      <Steps
        steps={[
          `Get Contents of URL, ${server}/api/shortcuts/today, with the same Authorization header (Method stays GET).`,
          'Get Dictionary Value for speak, then Speak Text.',
        ]}
      />
      <Text style={type.small}>It reads out the calories and protein you have left, without using Bell’s AI.</Text>

      <Text style={s.group}>Without a key</Text>
      <Text style={type.small}>
        Open URLs with {server}/bell?ask= followed by Dictated Text opens Bell with your words sent, and the review card to tap Add. Handy on the web; the iPhone app only opens if your phone passes Forkbell links to it.
      </Text>
    </View>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <View style={{ gap: space(2) }}>
      {steps.map((step, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space(3), alignItems: 'flex-start' }}>
          <Text style={s.num}>{i + 1}</Text>
          <Text style={[type.body, { flex: 1 }]} selectable>{step}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  group: { ...type.small, marginTop: space(4), fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: color.card, borderRadius: radius.row, padding: space(3) },
  fresh: { gap: space(2), backgroundColor: color.card, borderRadius: radius.row, padding: space(3), borderWidth: 1, borderColor: color.accent },
  token: { fontFamily: 'Courier', fontSize: 13, color: color.iron, backgroundColor: color.chalk, padding: space(2), borderRadius: 8 },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  button: { backgroundColor: color.accent, borderRadius: 10, paddingVertical: space(3), paddingHorizontal: space(4) },
  buttonText: { color: color.onAccent, fontWeight: '700', fontSize: 15 },
  link: { color: color.accent, fontWeight: '700', fontSize: 16 },
  num: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', textAlign: 'center', lineHeight: 24, fontWeight: '800', fontSize: 13, color: color.onAccent, backgroundColor: color.accent },
});
