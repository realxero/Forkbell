import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getViewing, isShareable } from './profile';

const isWeb = Platform.OS === 'web';
let serverUrl: string | null = null;
let token: string | null = null;

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Web is served by the Forkbell server itself; phones remember the address you typed. */
export async function loadConnection() {
  if (isWeb) {
    serverUrl = process.env.EXPO_PUBLIC_API_URL || window.location.origin;
    return { serverUrl, needsServer: false };
  }
  serverUrl = await SecureStore.getItemAsync('server');
  token = await SecureStore.getItemAsync('token');
  return { serverUrl, needsServer: !serverUrl };
}

export function getServerUrl() {
  return serverUrl;
}

export async function setServerUrl(url: string) {
  serverUrl = url;
  await SecureStore.setItemAsync('server', url);
}

export async function setToken(value: string | null) {
  token = value;
  if (isWeb) return;
  if (value) await SecureStore.setItemAsync('token', value);
  else await SecureStore.deleteItemAsync('token');
}

/** For downloads that aren't JSON (exports): the same sign-in the API calls use. */
export function authHeaders(): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!serverUrl) throw new ApiError('Add your Forkbell server address first.', 0);
  let res: Response;
  // Whose data: an explicit header (queued changes keep theirs), else who you're viewing now.
  const extra = { ...((init.headers as Record<string, string> | undefined) ?? {}) };
  const profile = 'x-forkbell-profile' in extra ? extra['x-forkbell-profile'] : getViewing()?.id;
  delete extra['x-forkbell-profile'];
  try {
    res = await fetch(serverUrl + path, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(profile && isShareable(path) ? { 'x-forkbell-profile': profile } : {}),
        ...extra,
      },
    });
  } catch {
    throw new ApiError(`Can't reach ${serverUrl}. Check the address and your connection.`, 0);
  }
  // Forkbell always answers in JSON. A web page here means something in front of the
  // server answered instead, most often a login page from the reverse proxy.
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    const page = res.redirected || (res.headers.get('content-type') ?? '').includes('text/html');
    throw new ApiError(
      page
        ? `${serverUrl} answered with a web page instead of Forkbell. If your reverse proxy puts a login (such as Authelia forward-auth) in front of Forkbell, turn it off for Forkbell: the app signs in with Authelia by itself.`
        : `${serverUrl} answered ${res.status} without Forkbell data. Check the server address.`,
      res.ok ? 418 : res.status,
    );
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `The server answered ${res.status}.`, res.status);
  return data as T;
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });
