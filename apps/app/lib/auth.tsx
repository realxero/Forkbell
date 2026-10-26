import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Me, SignInMethods } from '@forkbell/shared';
import { ApiError, api, loadConnection, getServerUrl, setServerUrl, setToken, post } from './api';
import { cachedGet, updateCache } from './sync';

type Status = 'loading' | 'signedOut' | 'signedIn';
type Auth = {
  status: Status;
  me: Me | null;
  error: string | null;
  /** How the server lets people in (and its version), once known. */
  methods: SignInMethods | null;
  /** Ask a server how to sign in. On the phone this also remembers the address. */
  loadMethods: (serverAddress?: string) => Promise<SignInMethods | null>;
  /** Single sign-on (Authelia). */
  signIn: (serverAddress?: string) => Promise<void>;
  signInWithPassword: (username: string, password: string) => Promise<void>;
  signUp: (details: { username: string; password: string; name?: string; code?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

/** What an older server (before 0.11) offers: single sign-on only, version unknown. */
const OLD_SERVER: SignInMethods = { server: { version: 'older than 0.11', commit: null, buildNumber: null, builtAt: null }, sso: { name: 'Authelia' }, password: null };

const AuthContext = createContext<Auth | null>(null);
WebBrowser.maybeCompleteAuthSession();

function normalizeServer(input: string) {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [methods, setMethods] = useState<SignInMethods | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      // Offline, this is the copy from last time, so the app still opens.
      const me = await cachedGet<Me>('/api/me');
      // Never sign in with something that isn't an account (a stray copy from a bad answer).
      if (!me || typeof me !== 'object' || !me.id || !me.goals) {
        updateCache('/api/me', () => undefined);
        throw new Error('The server’s answer didn’t look like a Forkbell account. Check the server address, then sign in again.');
      }
      setMe(me);
      setStatus('signedIn');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) updateCache('/api/me', () => undefined);
      setMe(null);
      setStatus('signedOut');
      if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    loadConnection().then(({ needsServer }) => (needsServer ? setStatus('signedOut') : refreshMe()));
  }, [refreshMe]);

  const signIn = useCallback(
    async (serverAddress?: string) => {
      setError(null);
      if (Platform.OS === 'web') {
        window.location.href = `${getServerUrl()}/auth/login?platform=web`;
        return;
      }
      const server = normalizeServer(serverAddress ?? getServerUrl() ?? '');
      await setServerUrl(server);
      // forkbell://auth in the real app; an exp:// link while testing in Expo Go.
      const returnTo = Linking.createURL('auth');
      const result = await WebBrowser.openAuthSessionAsync(
        `${server}/auth/login?platform=native&redirect=${encodeURIComponent(returnTo)}`,
        returnTo,
      );
      if (result.type !== 'success') return; // closed the sign-in window
      const code = Linking.parse(result.url).queryParams?.code;
      if (typeof code !== 'string') return setError('Sign-in did not finish. Try again.');
      try {
        const { token } = await post<{ token: string }>('/auth/exchange', { code });
        if (!token) throw new Error('Sign-in finished but the server sent no session. Check the server address and try again.');
        await setToken(token);
        await refreshMe();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [refreshMe],
  );

  const loadMethods = useCallback(async (serverAddress?: string) => {
    setError(null);
    if (Platform.OS !== 'web') {
      if (!serverAddress && !getServerUrl()) return null;
      await setServerUrl(normalizeServer(serverAddress ?? getServerUrl() ?? ''));
    }
    try {
      const m = await api<SignInMethods>('/auth/methods');
      if (!m || typeof m !== 'object' || !('server' in m)) throw new ApiError('not Forkbell', 404);
      setMethods(m);
      return m;
    } catch (e) {
      // A Forkbell server older than this app answers 404 here; it still has single sign-on.
      // (It answers with its web page, or a 404.) Anything else, like no connection, is shown.
      if (e instanceof ApiError && (e.status === 404 || e.status === 418)) {
        setMethods(OLD_SERVER);
        return OLD_SERVER;
      }
      setMethods(null);
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  /** A password sign-in or sign-up answered: keep the session, then load the account. */
  const passwordSession = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      setError(null);
      try {
        const native = Platform.OS !== 'web';
        const r = await post<{ token?: string; ok?: boolean }>(path, { ...body, platform: native ? 'native' : 'web' });
        // On the web the server set a cookie; the phone keeps the token in its keychain.
        if (native) {
          if (!r.token) throw new Error('The server signed you in but sent no session. Update the Forkbell server and try again.');
          await setToken(r.token);
        }
        await refreshMe();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [refreshMe],
  );
  const signInWithPassword = useCallback(
    (username: string, password: string) => passwordSession('/auth/password/login', { username, password }),
    [passwordSession],
  );
  const signUp = useCallback(
    (d: { username: string; password: string; name?: string; code?: string }) => passwordSession('/auth/password/signup', d),
    [passwordSession],
  );

  const signOut = useCallback(async () => {
    await post('/auth/logout', {}).catch(() => {});
    updateCache('/api/me', () => undefined);
    await setToken(null);
    setMe(null);
    setStatus('signedOut');
  }, []);

  return <AuthContext.Provider value={{ status, me, error, methods, loadMethods, signIn, signInWithPassword, signUp, signOut, refreshMe }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
