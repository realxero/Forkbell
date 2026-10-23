import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Me } from '@forkbell/shared';
import { ApiError, loadConnection, getServerUrl, setServerUrl, setToken, post } from './api';
import { cachedGet, updateCache } from './sync';

type Status = 'loading' | 'signedOut' | 'signedIn';
type Auth = {
  status: Status;
  me: Me | null;
  error: string | null;
  signIn: (serverAddress?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

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

  const refreshMe = useCallback(async () => {
    try {
      // Offline, this is the copy from last time, so the app still opens.
      setMe(await cachedGet<Me>('/api/me'));
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
        await setToken(token);
        await refreshMe();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [refreshMe],
  );

  const signOut = useCallback(async () => {
    await post('/auth/logout', {}).catch(() => {});
    updateCache('/api/me', () => undefined);
    await setToken(null);
    setMe(null);
    setStatus('signedOut');
  }, []);

  return <AuthContext.Provider value={{ status, me, error, signIn, signOut, refreshMe }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
