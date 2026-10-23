import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, del, post, put } from '../lib/api';
import { Chip } from './AmountPicker';
import { color, radius, space, type } from '../lib/theme';

type Provider = 'gemini' | 'anthropic' | 'openai' | 'custom';
type Info = {
  settings: { provider: Provider; model: string; baseUrl: string | null; keyHint: string | null; keyOk: boolean } | null;
  server: { provider: string; model: string } | null;
  customAllowed: boolean;
  providers: { id: Provider; label: string }[];
};
const KEY_PAGES: Partial<Record<Provider, string>> = {
  gemini: 'https://aistudio.google.com/apikey',
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};

/**
 * Settings → Bell: pick a provider, paste a key, check it, pick a model.
 * The key goes to your Forkbell server encrypted and is never shown again.
 */
export function AiSettings() {
  const [info, setInfo] = useState<Info | null>(null);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = async () => {
    const i = await api<Info>('/api/ai').catch(() => null);
    setInfo(i);
    if (i?.settings) {
      setProvider(i.settings.provider);
      setModel(i.settings.model);
      setBaseUrl(i.settings.baseUrl ?? '');
    }
  };
  useEffect(() => {
    void load();
  }, []);
  if (!info) return null;
  const saved = info.settings;
  const sameProvider = saved?.provider === provider;

  const check = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await post<{ models: string[] }>('/api/ai/models', { provider, ...(key.trim() ? { apiKey: key.trim() } : {}), ...(provider === 'custom' ? { baseUrl } : {}) });
      setModels(r.models);
      // Keep the current model if it's offered; else a sensible default (a "flash" or "sonnet"/"mini" model is fast and cheap).
      const pick = r.models.includes(model) ? model : (r.models.find((m) => /flash(?!-lite)/.test(m) && !/preview|exp/.test(m)) ?? r.models.find((m) => /sonnet|mini/.test(m)) ?? r.models[0] ?? '');
      setModel(pick);
      setMsg({ text: r.models.length ? `Key works. ${r.models.length} models available.` : 'Key works, but no suitable models were listed. Type a model name below.' });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await put('/api/ai', { provider, model: model.trim(), ...(key.trim() ? { apiKey: key.trim() } : {}), ...(provider === 'custom' ? { baseUrl } : {}) });
      setKey('');
      await load();
      setMsg({ text: 'Saved. Bell is ready.' });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    await del('/api/ai');
    setKey('');
    setModels(null);
    await load();
    setMsg({ text: info.server ? 'Removed. Bell uses the server’s AI again.' : 'Removed. Bell is off until a key is added.' });
  };

  return (
    <View style={s.card}>
      <Text style={type.title}>Bell</Text>
      <Text style={type.small}>
        {saved
          ? `${saved.provider === 'custom' ? 'Using your own server' : `Using your ${info.providers.find((p) => p.id === saved.provider)?.label ?? saved.provider} key`}${saved.keyHint ? ` (key ending …${saved.keyHint})` : ''}, model ${saved.model}.${saved.keyOk ? '' : ' The key needs entering again.'}`
          : info.server
            ? `Using the server’s AI (${info.server.model}). Add your own key to use your account instead.`
            : 'Add an AI key to turn on Bell: logging by chat, photos and labels, and answers about your own data.'}
      </Text>

      <View style={s.chips}>
        {info.providers.filter((p) => p.id !== 'custom' || info.customAllowed).map((p) => (
          <Chip key={p.id} label={p.label} on={provider === p.id} onPress={() => { setProvider(p.id); setModels(null); setMsg(null); }} />
        ))}
      </View>

      {provider === 'custom' && (
        <TextInput value={baseUrl} onChangeText={setBaseUrl} placeholder="Server address, e.g. http://192.168.1.20:11434/v1" autoCapitalize="none" autoCorrect={false} style={s.input} />
      )}
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder={sameProvider && saved?.keyHint ? `Saved key …${saved.keyHint} (paste to replace)` : provider === 'custom' ? 'API key (if your server needs one)' : 'Paste your API key'}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
        accessibilityLabel="API key"
      />
      {KEY_PAGES[provider] && (
        <Pressable onPress={() => Linking.openURL(KEY_PAGES[provider]!)}>
          <Text style={s.link}>Get a {info.providers.find((p) => p.id === provider)?.label} key ›</Text>
        </Pressable>
      )}

      <Pressable disabled={busy || (!key.trim() && !(sameProvider && saved?.keyHint) && provider !== 'custom')} onPress={check} style={[s.secondary, busy && { opacity: 0.5 }]}>
        {busy ? <ActivityIndicator color={color.accent} /> : <Text style={s.link}>Check key and load models</Text>}
      </Pressable>

      {models && models.length > 0 && (
        <View style={s.chips}>
          {models.slice(0, 12).map((m) => <Chip key={m} label={m} on={model === m} onPress={() => setModel(m)} />)}
        </View>
      )}
      {(models || saved) && <TextInput value={model} onChangeText={setModel} placeholder="Model" autoCapitalize="none" autoCorrect={false} style={s.input} accessibilityLabel="Model" />}
      {msg && <Text style={{ color: msg.bad ? color.over : color.fat, fontWeight: '600' }}>{msg.text}</Text>}

      <View style={{ flexDirection: 'row', gap: space(3), alignItems: 'center' }}>
        <Pressable disabled={busy || !model.trim() || (!key.trim() && !(sameProvider && saved?.keyHint) && provider !== 'custom')} onPress={save} style={[s.primary, (busy || !model.trim()) && { opacity: 0.4 }]}>
          <Text style={s.primaryText}>Save</Text>
        </Pressable>
        {saved && <Pressable onPress={remove}><Text style={{ color: color.over, fontWeight: '700' }}>Remove my key</Text></Pressable>}
      </View>
      <Text style={type.small}>
        Your key is encrypted on your Forkbell server and never shown again or shared, even with people you share your diary with. Bell only sends a message to the AI when you use it; you pay the provider for what you use (Gemini has a free tier).
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: space(3), marginTop: space(6), padding: space(4), backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  link: { color: color.accent, fontWeight: '700', fontSize: 15 },
  primary: { backgroundColor: color.accent, borderRadius: 10, paddingVertical: space(3), paddingHorizontal: space(6) },
  primaryText: { color: color.onAccent, fontWeight: '700', fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: color.line, borderRadius: 10, paddingVertical: space(3), alignItems: 'center' },
});
