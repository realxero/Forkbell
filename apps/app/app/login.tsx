import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Logo } from '../components/Logo';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BUILD, versionLabel } from '@forkbell/shared';
import { useAuth } from '../lib/auth';
import { getServerUrl } from '../lib/api';
import { color, space, type } from '../lib/theme';

type Mode = 'signIn' | 'signUp';

export default function Login() {
  const { status, error, methods, loadMethods, signIn, signInWithPassword, signInWithCode, signUp } = useAuth();
  const [codeOpen, setCodeOpen] = useState(false);
  const [signInCode, setSignInCode] = useState('');
  const isWeb = Platform.OS === 'web';
  const [server, setServer] = useState(getServerUrl() ?? '');
  // On the phone: has the address in the box been checked yet?
  const [checked, setChecked] = useState(isWeb);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('signIn');
  const [form, setForm] = useState({ username: '', password: '', name: '', code: '' });
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  // The web app is on the server itself; the phone remembers the last address.
  useEffect(() => {
    if (status !== 'signedOut') return;
    if (isWeb || getServerUrl()) loadMethods().then((m) => setChecked(!!m));
  }, [status, isWeb, loadMethods]);

  if (status === 'signedIn') return <Redirect href="/" />;
  if (status === 'loading') return <ActivityIndicator style={{ flex: 1 }} color={color.iron} />;

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    await fn();
    setBusy(null);
  };
  const check = () => run('check', async () => setChecked(!!(await loadMethods(server))));
  const sso = methods?.sso;
  const pw = methods?.password;
  const canSignUp = !!pw && pw.signup !== 'off';
  const ready = form.username.trim() && form.password && (mode === 'signIn' || pw?.signup !== 'code' || form.code.trim());
  const submit = () => {
    if (!ready || busy) return;
    if (mode === 'signIn') return run('password', () => signInWithPassword(form.username.trim(), form.password));
    return run('password', () => signUp({ username: form.username.trim(), password: form.password, name: form.name.trim() || undefined, code: form.code.trim() || undefined }));
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Logo size={88} />
          <Text style={s.wordmark}>Forkbell</Text>
          <Text style={s.lede}>Food and training, logged in one place on your own server.</Text>

          {!isWeb && (
            <View style={{ gap: space(2) }}>
              <Text style={type.small}>Server address</Text>
              <TextInput
                value={server}
                onChangeText={(v) => {
                  setServer(v);
                  setChecked(false);
                }}
                onSubmitEditing={check}
                placeholder="forkbell.example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                returnKeyType="go"
                style={s.input}
              />
            </View>
          )}

          {error && <Text style={s.error}>{error}</Text>}

          {!checked ? (
            <Pressable onPress={check} disabled={!!busy || !server.trim()} style={({ pressed }) => [s.button, (!!busy || !server.trim()) && s.dim, pressed && s.pressed]}>
              <Text style={s.buttonText}>{busy === 'check' ? 'Checking…' : 'Continue'}</Text>
            </Pressable>
          ) : !methods ? (
            <ActivityIndicator color={color.iron} />
          ) : (
            <View style={{ gap: space(4) }}>
              {sso && mode === 'signIn' && (
                <Pressable
                  onPress={() => run('sso', () => signIn(isWeb ? undefined : server))}
                  disabled={!!busy}
                  style={({ pressed }) => [pw ? s.buttonQuiet : s.button, !!busy && s.dim, pressed && s.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={pw ? s.buttonQuietText : s.buttonText}>{busy === 'sso' ? 'Opening sign-in…' : `Sign in with ${sso.name}`}</Text>
                </Pressable>
              )}

              {sso && pw && mode === 'signIn' && (
                <View style={s.or}>
                  <View style={s.orLine} />
                  <Text style={type.small}>or with a password</Text>
                  <View style={s.orLine} />
                </View>
              )}

              {pw && (
                <View style={{ gap: space(3) }}>
                  {mode === 'signUp' && (
                    <>
                      <Text style={[type.body, { fontWeight: '800' }]}>Create your account</Text>
                      <TextInput value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Your name (optional)" textContentType="name" autoComplete="name" style={s.input} />
                      {pw.signup === 'code' && (
                        <TextInput
                          value={form.code}
                          onChangeText={(code) => setForm({ ...form, code })}
                          placeholder="Sign-up code (from whoever runs this server)"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={s.input}
                        />
                      )}
                    </>
                  )}
                  <TextInput
                    value={form.username}
                    onChangeText={(username) => setForm({ ...form, username })}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    placeholder="Username"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                    autoComplete="username"
                    returnKeyType="next"
                    style={s.input}
                  />
                  <TextInput
                    ref={passwordRef}
                    value={form.password}
                    onChangeText={(password) => setForm({ ...form, password })}
                    onSubmitEditing={submit}
                    placeholder={mode === 'signUp' ? 'Password (10 characters or more)' : 'Password'}
                    secureTextEntry
                    textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
                    autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                    returnKeyType="go"
                    style={s.input}
                  />
                  <Pressable onPress={submit} disabled={!ready || !!busy} style={({ pressed }) => [s.button, (!ready || !!busy) && s.dim, pressed && s.pressed]} accessibilityRole="button">
                    <Text style={s.buttonText}>{busy === 'password' ? (mode === 'signUp' ? 'Creating…' : 'Signing in…') : mode === 'signUp' ? 'Create account' : 'Sign in'}</Text>
                  </Pressable>
                  {canSignUp && (
                    <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')} hitSlop={8} style={{ alignSelf: 'center' }}>
                      <Text style={s.link}>{mode === 'signIn' ? 'New here? Create an account' : 'I already have an account'}</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          )}

          {checked && methods && (
            <View style={{ gap: space(2), marginTop: space(4) }}>
              {!codeOpen ? (
                <Pressable onPress={() => setCodeOpen(true)} hitSlop={8} style={{ alignSelf: 'center' }} accessibilityRole="button">
                  <Text style={s.link}>Signed in on another device? Use a code</Text>
                </Pressable>
              ) : (
                <>
                  <Text style={type.small}>On the device you’re signed in on: Settings → Sign-in and security → Sign in another device. Type the code it shows.</Text>
                  <TextInput
                    value={signInCode}
                    onChangeText={setSignInCode}
                    placeholder="ABCD-2345"
                    placeholderTextColor={color.placeholder}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    style={[s.input, { textAlign: 'center', letterSpacing: 2, fontSize: 22, fontWeight: '700' }]}
                    accessibilityLabel="Code from your other device"
                    onSubmitEditing={() => signInCode.trim() && run('code', () => signInWithCode(signInCode))}
                  />
                  <Pressable
                    onPress={() => run('code', () => signInWithCode(signInCode))}
                    disabled={!signInCode.trim() || !!busy}
                    style={({ pressed }) => [s.button, (!signInCode.trim() || !!busy) && s.dim, pressed && s.pressed]}
                    accessibilityRole="button"
                  >
                    <Text style={s.buttonText}>{busy === 'code' ? 'Signing in…' : 'Sign in with the code'}</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}

          <Text style={[type.small, s.version]} selectable>
            App {versionLabel(BUILD)}
            {methods ? `  ·  Server ${versionLabel(methods.server)}` : ''}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.chalk },
  body: { flexGrow: 1, justifyContent: 'center', padding: space(6), gap: space(5), maxWidth: 480, width: '100%', alignSelf: 'center' },
  wordmark: { fontSize: 52, fontWeight: '900', letterSpacing: -2, color: color.iron },
  lede: { ...type.body, color: color.ironSoft, marginTop: -space(3) },
  input: { ...type.body, backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  error: { ...type.body, color: color.over },
  button: { backgroundColor: color.iron, borderRadius: 10, paddingVertical: space(4), alignItems: 'center' },
  buttonText: { color: color.chalk, fontSize: 17, fontWeight: '700' },
  buttonQuiet: { backgroundColor: color.card, borderWidth: 1, borderColor: color.line, borderRadius: 10, paddingVertical: space(4), alignItems: 'center' },
  buttonQuietText: { color: color.iron, fontSize: 17, fontWeight: '700' },
  dim: { opacity: 0.4 },
  pressed: { opacity: 0.8 },
  or: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  orLine: { flex: 1, height: 1, backgroundColor: color.line },
  link: { color: color.accent, fontWeight: '700', fontSize: 15 },
  version: { textAlign: 'center', color: color.ironSoft, marginTop: space(2) },
});
