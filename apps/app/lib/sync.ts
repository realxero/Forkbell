// Offline support. Two parts, both kept on the device:
//   cache   the last answer for each screen's data, shown when there's no connection
//   outbox  changes made offline, sent in order when the connection returns
// Screens read with cachedGet() and write with send(); they never need to know
// whether they're online.
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { classify, enqueue, newId, type OutboxItem } from '@forkbell/shared';
import { api, ApiError } from './api';
import { loadStore, saveStore } from './store';
import { getViewing, isShareable } from './profile';

type Entry = { t: number; data: unknown };
type State = { cache: Record<string, Entry>; outbox: OutboxItem[]; problems: string[] };

const MAX_CACHE = 120;
let state: State = { cache: {}, outbox: [], problems: [] };
let online = true;
let syncing = false;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

export { newId };

/** Load what's on the device. Safe to call many times. */
export function initSync() {
  loaded ??= (async () => {
    const saved = (await loadStore()) as Partial<State> | null;
    if (saved) state = { cache: saved.cache ?? {}, outbox: saved.outbox ?? [], problems: saved.problems ?? [] };
    if (Platform.OS === 'web') {
      window.addEventListener('online', () => void flush());
      window.addEventListener('offline', () => setOnline(false));
    }
    AppState.addEventListener('change', (s) => s === 'active' && void flush());
    setInterval(() => state.outbox.length && void flush(), 20000);
    void flush();
  })();
  return loaded;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  notify();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // Keep the most recently used screens; drop the oldest.
    const keys = Object.keys(state.cache)
      .filter((k) => !k.startsWith('device:')) // settings for this phone are never dropped
      .sort((a, b) => state.cache[b]!.t - state.cache[a]!.t);
    for (const k of keys.slice(MAX_CACHE)) delete state.cache[k];
    void saveStore(state);
  }, 300);
}
const notify = () => listeners.forEach((l) => l());
function setOnline(v: boolean) {
  if (online !== v) {
    online = v;
    notify();
  }
}

// Someone else's data is kept apart from yours: their copies are keyed by who.
const keyOf = (path: string) => {
  const base = path.split('?')[0]!;
  const v = getViewing();
  return v && isShareable(base) ? `@${v.id}${base}` : base;
};

export function readCache<T>(path: string): T | undefined {
  return state.cache[keyOf(path)]?.data as T | undefined;
}
export function writeCache(path: string, data: unknown) {
  state.cache[keyOf(path)] = { t: Date.now(), data };
  persist();
}
/** Change a cached answer in place, e.g. to show an offline change straight away. */
export function updateCache<T>(path: string, fn: (old: T | undefined) => T | undefined) {
  const next = fn(readCache<T>(path));
  if (next === undefined) delete state.cache[keyOf(path)];
  else state.cache[keyOf(path)] = { t: Date.now(), data: next };
  persist();
}
export function cachedPaths(prefix: string) {
  return Object.keys(state.cache).filter((k) => k.startsWith(prefix));
}

const isOffline = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500);

/**
 * Read from the server, keep a copy, and fall back to the copy when there's
 * no connection. Waiting changes go up first, so the answer includes them.
 */
export async function cachedGet<T>(path: string): Promise<T> {
  await initSync();
  if (state.outbox.length) await flush();
  if (state.outbox.length) {
    // Still can't send: the server doesn't have our changes yet, so the copy is more current.
    const copy = readCache<T>(path);
    if (copy !== undefined) return copy;
  }
  try {
    const data = await api<T>(path);
    setOnline(true);
    writeCache(path, data);
    return data;
  } catch (e) {
    if (!isOffline(e)) throw e;
    setOnline(false);
    const copy = readCache<T>(path);
    if (copy !== undefined) return copy;
    throw new ApiError('You’re offline, and this hasn’t been opened on this device before.', 0);
  }
}

type SendOptions = { label: string; coalesceKey?: string };
export type SendResult<T> = { queued: false; data: T } | { queued: true };

/**
 * Send a change now if possible; otherwise keep it and send it later, in
 * order. The server refusing it (bad data) throws, so the screen can say why.
 */
export async function send<T = unknown>(method: OutboxItem['method'], path: string, body: unknown, opts: SendOptions): Promise<SendResult<T>> {
  await initSync();
  if (!state.outbox.length) {
    try {
      const data = await api<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      setOnline(true);
      return { queued: false, data };
    } catch (e) {
      if (e instanceof ApiError && classify(e.status, method) === 'ok') return { queued: false, data: undefined as T };
      if (!isOffline(e)) throw e;
      setOnline(false);
    }
  }
  state.outbox = enqueue(state.outbox, {
    id: newId(),
    method,
    path,
    body,
    coalesceKey: opts.coalesceKey ?? null,
    label: opts.label,
    createdAt: Date.now(),
    attempts: 0,
    profileId: isShareable(path) ? (getViewing()?.id ?? null) : null,
  });
  persist();
  void flush();
  return { queued: true };
}

/** Send waiting changes in order. Stops at the first one that can't go yet. */
export async function flush(): Promise<void> {
  if (syncing) {
    while (syncing) await new Promise((r) => setTimeout(r, 100));
    return;
  }
  if (!state.outbox.length) return;
  syncing = true;
  notify();
  try {
    while (state.outbox.length) {
      const item = state.outbox[0]!;
      let status = 0;
      try {
        await api(item.path, {
          method: item.method,
          headers: { 'x-forkbell-profile': item.profileId ?? '' },
          ...(item.body === undefined ? {} : { body: JSON.stringify(item.body) }),
        });
        status = 200;
      } catch (e) {
        status = e instanceof ApiError ? e.status : 0;
        if (classify(status, item.method) === 'rejected') {
          state.problems = [...state.problems, `“${item.label}” couldn’t be saved: ${e instanceof Error ? e.message : 'refused'}`].slice(-5);
        }
      }
      const result = classify(status, item.method);
      if (result === 'retry') {
        item.attempts++;
        setOnline(status !== 0 ? online : false);
        persist();
        break;
      }
      state.outbox = state.outbox.slice(1);
      setOnline(true);
      persist();
    }
  } finally {
    syncing = false;
    notify();
  }
}

export function clearProblems() {
  state.problems = [];
  persist();
}

/** Connection and sync status for the banner. */
export function useSync() {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((n) => n + 1);
    listeners.add(l);
    void initSync();
    return () => void listeners.delete(l);
  }, []);
  return { online, syncing, pending: state.outbox.length, labels: state.outbox.map((o) => o.label), problems: state.problems };
}

/**
 * Fetch what each screen needs in the background, so the app works offline
 * even for screens you haven't opened today.
 */
export async function warmCache(today: string) {
  const paths = [
    `/api/diary/${today}`,
    '/api/foods/recent',
    '/api/foods/library',
    '/api/exercises',
    '/api/programs',
    '/api/workouts/open',
    '/api/workouts',
    `/api/progress?today=${today}`,
    `/api/wellbeing/water/${today}`,
  ];
  for (const p of paths) await cachedGet(p).catch(() => {});
}
