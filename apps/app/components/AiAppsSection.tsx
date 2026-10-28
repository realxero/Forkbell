// Settings → AI apps: keys for Claude Desktop (and other apps that speak the
// Model Context Protocol) to read your Forkbell, and optionally log to it.
// Each key works only at /mcp; remove one and that app loses access at once.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { api, del, getServerUrl, post } from '../lib/api';
import { confirm } from '../lib/confirm';
import { color, radius, space, type } from '../lib/theme';

type Key = { id: string; label: string; hint: string; createdAt: string; lastUsedAt: string | null; kind: string; canWrite: boolean };

/** Claude Desktop's config for this server and key (through mcp-remote, which passes the key along). */
export const claudeConfig = (server: string, token: string) =>
  JSON.stringify({ mcpServers: { forkbell: { command: 'npx', args: ['-y', 'mcp-remote', `${server.replace(/\/$/, '')}/mcp`, '--header', 'Authorization:${FORKBELL_KEY}'], env: { FORKBELL_KEY: `Bearer ${token}` } } } }, null, 2);

export function AiAppsSection() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const server = getServerUrl() ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const load = useCallback(() => {
    api<{ keys: Key[] }>('/api/shortcuts/keys').then((r) => setKeys(r.keys.filter((k) => k.kind === 'mcp')), (e) => setProblem(e instanceof Error ? e.message : String(e)));
  }, []);
  useFocusEffect(useCallback(() => load(), [load]));

  const make = async () => {
    setProblem(null);
    try {
      const r = await post<{ token: string }>('/api/shortcuts/keys', { label: canWrite ? 'AI app (can log)' : 'AI app (reads)', kind: 'mcp', canWrite });
      setFresh(r.token);
      load();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  const copy = async (what: string, text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(what);
  };

  return (
    <View style={{ gap: space(3) }}>
      <Text style={type.body}>
        Let Claude Desktop (or another app that speaks MCP, the Model Context Protocol) see your diary, progress, foods and workouts, so you can ask it things like “how has my protein been this week?”. A key can also log food and water if you allow it; the app asks you before each thing it does.
      </Text>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={[type.body, { flex: 1 }]}>This key can log food and water</Text>
          <Switch value={canWrite} onValueChange={setCanWrite} accessibilityLabel="This key can log food and water" />
        </View>
        <Pressable onPress={() => void make()} style={s.button} accessibilityRole="button">
          <Text style={s.buttonText}>Make a key</Text>
        </Pressable>
      </View>
      {fresh && (
        <View style={s.card}>
          <Text style={[type.body, { fontWeight: '700' }]}>Your key (shown once)</Text>
          <Text selectable style={s.code}>{fresh}</Text>
          <Text style={type.small}>
            In Claude Desktop: Settings → Developer → Edit Config, and put this in claude_desktop_config.json (keep anything already there), then restart Claude Desktop. It needs Node.js on that computer.
          </Text>
          <Text selectable style={s.code}>{claudeConfig(server, fresh)}</Text>
          <View style={s.row}>
            <Pressable onPress={() => void copy('config', claudeConfig(server, fresh))} style={[s.button, { flex: 1 }]}><Text style={s.buttonText}>{copied === 'config' ? 'Copied' : 'Copy the config'}</Text></Pressable>
            <Pressable onPress={() => void copy('key', fresh)} style={[s.button, s.secondary, { flex: 1 }]}><Text style={[s.buttonText, { color: color.iron }]}>{copied === 'key' ? 'Copied' : 'Copy the key'}</Text></Pressable>
          </View>
          <Text style={type.small}>Other apps: the server is {server}/mcp (Streamable HTTP), with the header Authorization: Bearer and the key.</Text>
        </View>
      )}
      <Text style={type.label}>Keys</Text>
      {keys === null && !problem && <ActivityIndicator color={color.iron} />}
      {keys?.length === 0 && <Text style={type.small}>None yet.</Text>}
      {keys?.map((k) => (
        <View key={k.id} style={[s.card, s.row]}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '600' }]}>{k.label} {k.hint}</Text>
            <Text style={type.small}>{k.canWrite ? 'Reads and logs' : 'Reads only'} · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'not used yet'}</Text>
          </View>
          <Pressable
            onPress={async () => {
              if (!(await confirm('Remove this key?', 'The app using it loses access straight away.', 'Remove'))) return;
              await del(`/api/shortcuts/keys/${k.id}`).catch(() => {});
              load();
            }}
            hitSlop={8}
          >
            <Text style={{ color: color.over, fontWeight: '700' }}>Remove</Text>
          </Pressable>
        </View>
      ))}
      {problem && <Text style={[type.small, { color: color.over }]}>{problem}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, padding: space(3), gap: space(2) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.line },
  buttonText: { color: color.chalk, fontWeight: '700' },
  code: { fontFamily: 'Menlo', fontSize: 12, color: color.iron, backgroundColor: color.chalk, padding: space(2), borderRadius: 8 },
});
