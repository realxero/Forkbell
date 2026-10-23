import { useState } from 'react';
import { Logo } from '../components/Logo';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { getServerUrl } from '../lib/api';
import { color, space, type } from '../lib/theme';

export default function Login() {
  const { status, signIn, error } = useAuth();
  const [server, setServer] = useState(getServerUrl() ?? '');
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Redirect href="/" />;
  if (status === 'loading') return <ActivityIndicator style={{ flex: 1 }} color={color.iron} />;

  const needsAddress = Platform.OS !== 'web';
  const go = async () => {
    setBusy(true);
    await signIn(needsAddress ? server : undefined);
    setBusy(false);
  };

  return (
    <SafeAreaView style={s.screen}>
      <View style={s.body}>
        <Logo size={88} />
        <Text style={s.wordmark}>Forkbell</Text>
        <Text style={s.lede}>Food and training, logged in one place on your own server.</Text>

        {needsAddress && (
          <View style={{ gap: space(2) }}>
            <Text style={type.small}>Server address</Text>
            <TextInput
              value={server}
              onChangeText={setServer}
              placeholder="forkbell.example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={s.input}
            />
          </View>
        )}

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable
          onPress={go}
          disabled={busy || (needsAddress && !server.trim())}
          style={({ pressed }) => [s.button, (busy || (needsAddress && !server.trim())) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
        >
          <Text style={s.buttonText}>{busy ? 'Opening sign-in…' : 'Sign in'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  body: { flex: 1, justifyContent: 'center', padding: space(6), gap: space(5), maxWidth: 480, width: '100%', alignSelf: 'center' },
  wordmark: { fontSize: 52, fontWeight: '900', letterSpacing: -2, color: color.iron },
  lede: { ...type.body, color: color.ironSoft, marginTop: -space(3) },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  error: { ...type.body, color: color.over },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center' },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
});
