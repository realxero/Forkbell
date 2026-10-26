import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AccountSecurity } from '@forkbell/shared';
import { api, del, post, put } from '../lib/api';
import { confirm } from '../lib/confirm';
import { color, radius, space, type } from '../lib/theme';

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Settings → Sign-in and security: a password, and where you're signed in. */
export function SecuritySection() {
  const [sec, setSec] = useState<AccountSecurity | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState({ username: '', password: '', current: '' });
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api<AccountSecurity>('/api/me/security');
      setSec(s);
      setForm((f) => ({ ...f, username: f.username || s.username || '' }));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (!sec) return <Text style={type.body}>{status ?? 'Loading…'}</Text>;

  const hasPassword = !!sec.username;
  const savePassword = async () => {
    setStatus(null);
    try {
      const r = await put<{ signedOut: number }>('/api/me/security/password', {
        username: form.username.trim(),
        password: form.password,
        ...(hasPassword ? { current: form.current } : {}),
      });
      setForm({ username: form.username.trim().toLowerCase(), password: '', current: '' });
      setEditing(false);
      setStatus(`Password saved.${r.signedOut ? ` Signed out ${r.signedOut} other device${r.signedOut === 1 ? '' : 's'}.` : ''}`);
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const removePassword = async () => {
    if (!(await confirm('Remove your password?', `You’ll sign in with ${sec.sso ?? 'single sign-on'} only.`))) return;
    try {
      await del('/api/me/security/password');
      setForm({ username: '', password: '', current: '' });
      setStatus('Password removed.');
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const endOne = async (id: string) => {
    try {
      await del(`/api/me/security/sessions/${id}`);
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const endOthers = async () => {
    if (!(await confirm('Sign out everywhere else?', 'Every other phone and browser will need to sign in again. Shortcut keys keep working.'))) return;
    try {
      const r = await post<{ signedOut: number }>('/api/me/security/sessions/sign-out-others', {});
      setStatus(`Signed out ${r.signedOut} other device${r.signedOut === 1 ? '' : 's'}.`);
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const others = sec.sessions.filter((x) => !x.current).length;
  return (
    <View style={{ gap: space(4) }}>
      <View style={s.card}>
        <Text style={type.label}>How you sign in</Text>
        <Text style={type.body}>
          {sec.accountKind === 'sso'
            ? `With ${sec.sso ?? 'single sign-on'}${hasPassword ? `, or the username ${sec.username} and your password` : ''}.`
            : `With the username ${sec.username} and your password.`}
        </Text>
        {sec.passwordChangedAt && <Text style={type.small}>Password last changed {when(sec.passwordChangedAt)}.</Text>}
      </View>

      {sec.passwordLogin ? (
        <View style={s.card}>
          <Text style={type.label}>{hasPassword ? 'Password' : 'Add a password'}</Text>
          {!hasPassword && !editing && <Text style={type.small}>Sign in without {sec.sso ?? 'single sign-on'} too, for example on a device that can’t reach it.</Text>}
          {!editing ? (
            <View style={{ flexDirection: 'row', gap: space(2), flexWrap: 'wrap' }}>
              <Pressable onPress={() => setEditing(true)} style={s.button}>
                <Text style={s.buttonText}>{hasPassword ? 'Change password' : 'Add a password'}</Text>
              </Pressable>
              {hasPassword && sec.accountKind === 'sso' && (
                <Pressable onPress={removePassword} style={s.quiet}>
                  <Text style={[s.quietText, { color: color.over }]}>Remove</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={{ gap: space(2) }}>
              <TextInput value={form.username} onChangeText={(username) => setForm({ ...form, username })} placeholder="Username" autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="username" style={s.input} />
              {hasPassword && (
                <TextInput value={form.current} onChangeText={(current) => setForm({ ...form, current })} placeholder="Current password" secureTextEntry textContentType="password" autoComplete="current-password" style={s.input} />
              )}
              <TextInput value={form.password} onChangeText={(password) => setForm({ ...form, password })} placeholder="New password (10 characters or more)" secureTextEntry textContentType="newPassword" autoComplete="new-password" style={s.input} />
              <Text style={type.small}>Saving signs out your other devices.</Text>
              <View style={{ flexDirection: 'row', gap: space(2) }}>
                <Pressable onPress={savePassword} disabled={!form.username.trim() || !form.password} style={[s.button, (!form.username.trim() || !form.password) && { opacity: 0.4 }]}>
                  <Text style={s.buttonText}>Save password</Text>
                </Pressable>
                <Pressable onPress={() => setEditing(false)} style={s.quiet}>
                  <Text style={s.quietText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      ) : (
        <Text style={type.small}>Password sign-in is off on this server. Whoever runs it can turn it on with PASSWORD_LOGIN=on.</Text>
      )}

      <SignInCode />

      <View style={s.card}>
        <Text style={type.label}>Where you’re signed in</Text>
        {sec.sessions.map((x, i) => (
          <View key={x.id} style={[s.row, i > 0 && s.rowLine]}>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontWeight: x.current ? '800' : '400' }]}>
                {x.device ?? 'A device'}
                {x.current ? ' · this one' : ''}
              </Text>
              <Text style={type.small}>
                {x.method === 'password' ? 'Password' : x.method === 'sso' ? (sec.sso ?? 'Single sign-on') : x.method === 'code' ? 'Code from another device' : 'Signed in'} · since {when(x.createdAt)}
              </Text>
            </View>
            {!x.current && (
              <Pressable onPress={() => endOne(x.id)} hitSlop={8} accessibilityLabel={`Sign out ${x.device ?? 'this device'}`}>
                <Text style={[s.quietText, { color: color.over }]}>Sign out</Text>
              </Pressable>
            )}
          </View>
        ))}
        {others > 0 && (
          <Pressable onPress={endOthers} style={s.quiet}>
            <Text style={[s.quietText, { color: color.over }]}>Sign out everywhere else</Text>
          </Pressable>
        )}
      </View>

      {status && <Text style={type.body}>{status}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, padding: space(4), gap: space(2) },
  input: { ...type.body, backgroundColor: color.chalk, borderWidth: 1, borderColor: color.line, borderRadius: 10, padding: space(3) },
  button: { backgroundColor: color.accent, borderRadius: 10, paddingVertical: space(3), paddingHorizontal: space(4), alignItems: 'center' },
  buttonText: { color: color.onAccent, fontWeight: '700', fontSize: 15 },
  quiet: { paddingVertical: space(3), paddingHorizontal: space(2), alignItems: 'center' },
  quietText: { color: color.accent, fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2) },
  rowLine: { borderTopWidth: 1, borderTopColor: color.line },
});

/**
 * "Sign in another device": a code for the new phone or browser to type on
 * its sign-in screen. Five minutes, one use; making a new one ends the last.
 */
function SignInCode() {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code]);
  const left = code ? Math.max(0, Math.round((Date.parse(code.expiresAt) - now) / 1000)) : 0;
  const make = async () => {
    setProblem(null);
    try {
      setCode(await post<{ code: string; expiresAt: string }>('/api/me/security/sign-in-code', {}));
      setNow(Date.now());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <View style={s.card}>
      <Text style={type.label}>Sign in another device</Text>
      <Text style={type.small}>No password to type on the new phone or browser: on its sign-in screen, tap “Signed in on another device? Use a code” and type the code shown here.</Text>
      {code && left > 0 ? (
        <>
          <Text style={{ fontSize: 34, fontWeight: '800', letterSpacing: 4, textAlign: 'center', color: color.iron }} selectable accessibilityLabel={`Code ${code.code.split('').join(' ')}`}>
            {code.code}
          </Text>
          <Text style={[type.small, { textAlign: 'center' }]}>Works once, for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} more. Only type it on a device you’re holding.</Text>
        </>
      ) : (
        <Pressable onPress={() => void make()} style={({ pressed }) => [s.button, pressed && { opacity: 0.7 }]} accessibilityRole="button">
          <Text style={s.buttonText}>{code ? 'That code ran out. Show a new one' : 'Show a code'}</Text>
        </Pressable>
      )}
      {problem && <Text style={[type.small, { color: color.over }]}>{problem}</Text>}
    </View>
  );
}
