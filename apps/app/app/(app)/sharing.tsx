import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, del, post, put } from '../../lib/api';
import { confirm } from '../../lib/confirm';
import { getViewing, setViewing } from '../../lib/profile';
import { Chip } from '../../components/AmountPicker';
import { color, space, type } from '../../lib/theme';

type Perm = 'food_read' | 'food_write' | 'training_read' | 'progress_read' | 'wellbeing_read';
type Person = { shareId: string; personId: string; name: string; permissions: Perm[] };
type Data = { sharingWith: Person[]; sharedWithMe: Person[]; invites: { id: string; permissions: Perm[]; expiresAt: string }[] };
const PERMS: { key: Perm; label: string }[] = [
  { key: 'food_read', label: 'See food diary' },
  { key: 'food_write', label: 'Log food for me' },
  { key: 'training_read', label: 'See workouts' },
  { key: 'progress_read', label: 'See weight and progress' },
  { key: 'wellbeing_read', label: 'See sleep, mood and medications' },
];
const describe = (p: Perm[]) => PERMS.filter((x) => p.includes(x.key)).map((x) => x.label.toLowerCase()).join(', ');

/** Family sharing: invite someone with a code, choose exactly what they see, and end it any time. */
export default function Sharing() {
  const [data, setData] = useState<Data | null>(null);
  const [perms, setPerms] = useState<Perm[]>(['food_read', 'progress_read']);
  const [code, setCode] = useState<string | null>(null);
  const [accept, setAccept] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>('/api/shares'));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));
  const toggle = (list: Perm[], p: Perm) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMsg(null);
    try {
      await fn();
      await load();
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={12}><Text style={s.link}>‹ Back</Text></Pressable>
        <Text style={[type.hero, { fontSize: 30 }]}>Sharing</Text>
        <Text style={type.small}>Share with family or a partner who has an account on this Forkbell server. You choose exactly what they can see, and either of you can end it at any time.</Text>
        {msg && <Text style={type.body}>{msg}</Text>}
        {!data && <ActivityIndicator color={color.iron} />}

        {data && data.sharedWithMe.length > 0 && (
          <View style={s.card}>
            <Text style={type.title}>Shared with you</Text>
            {data.sharedWithMe.map((p) => (
              <View key={p.shareId} style={s.person}>
                <Text style={[type.body, { fontWeight: '700' }]}>{p.name}</Text>
                <Text style={type.small}>Can {describe(p.permissions)}.</Text>
                <View style={s.row}>
                  <Pressable onPress={() => { setViewing({ id: p.personId, name: p.name }); router.replace('/'); }}><Text style={s.link}>View {p.name}’s data</Text></Pressable>
                  <Pressable onPress={async () => (await confirm(`Stop seeing ${p.name}’s data?`, 'They can invite you again later.', 'Stop')) && run(() => del(`/api/shares/${p.shareId}`))}>
                    <Text style={[s.link, { color: color.over }]}>Stop seeing</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {getViewing() && <Pressable onPress={() => { setViewing(null); router.replace('/'); }}><Text style={s.link}>Back to your own data</Text></Pressable>}
          </View>
        )}

        {data && (
          <View style={s.card}>
            <Text style={type.title}>You’re sharing with</Text>
            {data.sharingWith.length === 0 && <Text style={type.small}>Nobody yet.</Text>}
            {data.sharingWith.map((p) => (
              <View key={p.shareId} style={s.person}>
                <Text style={[type.body, { fontWeight: '700' }]}>{p.name}</Text>
                <View style={s.chips}>
                  {PERMS.map((x) => (
                    <Chip key={x.key} label={x.label} on={p.permissions.includes(x.key)} onPress={() => {
                      const next = toggle(p.permissions, x.key);
                      if (next.length) run(() => put(`/api/shares/${p.shareId}`, { permissions: next }));
                    }} />
                  ))}
                </View>
                <Pressable onPress={async () => (await confirm(`Stop sharing with ${p.name}?`, 'They’ll no longer see any of your data.', 'Stop')) && run(() => del(`/api/shares/${p.shareId}`))}>
                  <Text style={[s.link, { color: color.over }]}>Stop sharing</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={s.card}>
          <Text style={type.title}>Invite someone</Text>
          <Text style={type.small}>Choose what they can see, then send them the code. It works once and expires in 7 days.</Text>
          <View style={s.chips}>{PERMS.map((x) => <Chip key={x.key} label={x.label} on={perms.includes(x.key)} onPress={() => setPerms(toggle(perms, x.key))} />)}</View>
          {perms.includes('food_write') && <Text style={type.small}>“Log food for me” lets them add, change and remove food in your diary, for example a parent logging for a child.</Text>}
          <Pressable disabled={!perms.length} onPress={() => run(async () => setCode((await post<{ code: string }>('/api/shares/invites', { permissions: perms })).code))} style={[s.button, !perms.length && { opacity: 0.4 }]}>
            <Text style={s.buttonText}>Create invite code</Text>
          </Pressable>
          {code && (
            <View style={s.code}>
              <Text style={[type.hero, { fontSize: 30, letterSpacing: 2 }]}>{code}</Text>
              <Pressable onPress={() => Share.share({ message: `Join me on Forkbell: Settings → Sharing → enter code ${code}` })}><Text style={s.link}>Send it</Text></Pressable>
            </View>
          )}
          {data && data.invites.length > 0 && (
            <Text style={type.small}>
              {data.invites.length} unused {data.invites.length === 1 ? 'invite' : 'invites'}.{' '}
              <Text style={s.link} onPress={() => run(async () => { for (const i of data.invites) await del(`/api/shares/invites/${i.id}`); }, 'Invites cancelled.')}>Cancel them</Text>
            </Text>
          )}
        </View>

        <View style={s.card}>
          <Text style={type.title}>Got a code?</Text>
          <View style={s.row}>
            <TextInput value={accept} onChangeText={setAccept} placeholder="ABCD-2345" autoCapitalize="characters" style={[s.input, { flex: 1 }]} />
            <Pressable onPress={() => run(async () => { await post('/api/shares/accept', { code: accept }); setAccept(''); }, 'Done. They’re now under “Shared with you”.')} style={s.small}>
              <Text style={s.buttonText}>Accept</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  content: { padding: space(4), paddingBottom: space(16), gap: space(3), maxWidth: 640, width: '100%', alignSelf: 'center' },
  link: { color: color.protein, fontWeight: '700', fontSize: 16 },
  card: { backgroundColor: color.card, borderRadius: 14, padding: space(4), gap: space(3) },
  person: { gap: space(2), borderTopWidth: 1, borderTopColor: color.line, paddingTop: space(3) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(4), flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  code: { alignItems: 'center', gap: space(2), backgroundColor: color.chalk, borderRadius: 12, padding: space(4) },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  small: { backgroundColor: color.iron, borderRadius: 10, paddingHorizontal: space(4), paddingVertical: space(3) },
  buttonText: { color: color.chalk, fontSize: 16, fontWeight: '700' },
});
