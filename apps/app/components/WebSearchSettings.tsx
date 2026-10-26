// Settings → Bell → Web search: the SearXNG Bell searches with, for a
// restaurant's or a product's published numbers. Your own address works when
// the server allows custom addresses; otherwise the server's own, if it has one.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, post, put } from '../lib/api';
import { useAuth } from '../lib/auth';
import { color, radius, space, type } from '../lib/theme';

type Status = { search?: { on: boolean; source: 'yours' | 'server' | null; server: boolean; yoursAllowed: boolean } };

export function WebSearchSettings() {
  const { me, refreshMe } = useAuth();
  const [status, setStatus] = useState<NonNullable<Status['search']> | null | undefined>(undefined);
  const [url, setUrl] = useState(me?.preferences.webSearchUrl ?? '');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api<Status>('/api/bell/status').then((s) => setStatus(s.search ?? null), () => setStatus(null));
  useEffect(() => {
    void load();
  }, []);

  const test = async (address: string | null) => {
    setBusy('test');
    setNote(null);
    try {
      const r = await post<{ ok: boolean; results?: number; error?: string }>('/api/bell/search-test', { url: address });
      setNote(r.ok ? { ok: true, text: `Working: a sample search found ${r.results} results.` } : { ok: false, text: r.error ?? 'It didn’t answer.' });
      return r.ok;
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(null);
    }
  };
  const save = async (address: string | null) => {
    if (!me) return;
    if (address && !(await test(address))) return; // only save one that works
    setBusy('save');
    try {
      await put('/api/me/preferences', { ...me.preferences, webSearchUrl: address });
      await refreshMe();
      await load();
      if (!address) setNote({ ok: true, text: 'Removed. Bell uses the server’s search, if it has one.' });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={s.card}>
      <Text style={type.label}>Web search</Text>
      <Text style={type.small}>
        Lets Bell look up a restaurant’s or product’s published nutrition before estimating, through a SearXNG search engine. Only Bell’s search words go to it.
      </Text>
      {status === undefined ? (
        <ActivityIndicator color={color.iron} />
      ) : status === null ? (
        <Text style={type.small}>Couldn’t reach the server to check.</Text>
      ) : (
        <Text style={[type.body, { fontWeight: '700', color: status.on ? color.fat : color.ironSoft }]}>
          {status.on ? (status.source === 'yours' ? 'On, with your address' : 'On, with the server’s search') : 'Off'}
        </Text>
      )}
      {status?.yoursAllowed ? (
        <>
          <Text style={type.small}>Your SearXNG address</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="http://192.168.1.10:8080"
            placeholderTextColor={color.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={s.input}
            accessibilityLabel="Your SearXNG address"
          />
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            <Pressable onPress={() => void save(url.trim() || null)} disabled={Boolean(busy)} style={[s.button, busy && { opacity: 0.5 }]} accessibilityRole="button">
              <Text style={s.buttonText}>{busy === 'test' ? 'Trying it…' : busy === 'save' ? 'Saving…' : 'Try and save'}</Text>
            </Pressable>
            {me?.preferences.webSearchUrl ? (
              <Pressable onPress={() => { setUrl(''); void save(null); }} style={[s.button, s.secondary]} accessibilityRole="button">
                <Text style={[s.buttonText, { color: color.iron }]}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={type.small}>
            The address as the Forkbell server reaches it (on the same Docker network, often http://searxng:8080). SearXNG needs JSON answers turned on: in its settings.yml, search → formats: [html, json].
          </Text>
        </>
      ) : status ? (
        <>
          {status.server && (
            <Pressable onPress={() => void test(null)} disabled={Boolean(busy)} style={[s.button, s.secondary]} accessibilityRole="button">
              <Text style={[s.buttonText, { color: color.iron }]}>{busy ? 'Trying it…' : 'Try the server’s search'}</Text>
            </Pressable>
          )}
          <Text style={type.small}>
            {status.server
              ? 'This server sets the search address itself.'
              : 'To turn it on, whoever runs the server adds SEARCH_URL (the SearXNG address) to the stack, or AI_ALLOW_CUSTOM_URL=true so you can enter one here.'}
          </Text>
        </>
      ) : null}
      {note && <Text style={[type.small, { color: note.ok ? color.fat : color.over }]}>{note.text}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(4), gap: space(2), marginTop: space(4) },
  input: { ...type.body, backgroundColor: color.chalk, borderRadius: 10, borderWidth: 1, borderColor: color.line, padding: space(3), color: color.iron },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), paddingHorizontal: space(4), alignItems: 'center' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.line },
  buttonText: { color: color.chalk, fontWeight: '700' },
});
