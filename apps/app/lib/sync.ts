// Offline support. Two parts, both kept on the device:
//   cache   the last answer for each screen's data, shown when there's no connection
//   outbox  changes made offline, sent in order when the connection returns
//   held    changes the server kept failing, set aside so they can't block the
//           rest; sent again or discarded when the person chooses
// Screens read with cachedGet() and write with send(); they never need to know
// whether they're online.
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { afterRejected, afterRetry, classify, enqueue, newId, type OutboxItem } from '@forkbell/shared';
import { api, ApiError } from './api';
import { loadStore, saveStore } from './store';
import { getViewing, isShareable } from './profile';

type Entry = { t: number; data: unknown };
type State = { cache: Record<string, Entry>; outbox: OutboxItem[]; held: OutboxItem[]; problems: string[] };

const MAX_CACHE = 120;
let state: State = { cache: {}, outbox: [], held: [], problems: [] };
let online = true;
/** Offline because Forkbell itself answered with an error (not a lost connection): the copy shown may be out of date. */
let serverError = false;
/** Who's signed in. Changes are stamped with this and only sent while that person is signed in. */
let owner: string | null = null;
let syncing = false;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

export { newId };

/** Load what's on the device. Safe to call many times. */
export function initSync() {
  loaded ??= (async () => {
    const { data, problem } = await loadStore();
    const saved = data as Partial<State> | null;
    if (problem) state.problems = [problem];
    if (saved) state = { cache: saved.cache ?? {}, outbox: saved.outbox ?? [], held: saved.held ?? [], problems: saved.problems ?? [] };
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
const SAVE_FAILED = 'Changes made offline couldn’t be kept on this device (storage full or unavailable). Stay in the app until they’ve gone up.';
async function save() {
  // Keep the most recently used screens; drop the oldest.
  const keys = Object.keys(state.cache)
    .filter((k) => !k.startsWith('device:')) // settings for this phone are never dropped
    .sort((a, b) => state.cache[b]!.t - state.cache[a]!.t);
  for (const k of keys.slice(MAX_CACHE)) delete state.cache[k];
  const ok = await saveStore(state);
  const waiting = state.outbox.length + state.held.length > 0;
  if (!ok && waiting && !state.problems.includes(SAVE_FAILED)) {
    state.problems = [...state.problems, SAVE_FAILED].slice(-5);
    notify();
  }
}
/** Save soon (many quick changes become one write). */
function persist() {
  notify();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), 300);
}
/** Save now: a change was just queued, and it must survive the app being closed. */
function persistNow() {
  notify();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  return save();
}
const notify = () => listeners.forEach((l) => l());
function setOnline(v: boolean, fromServerError = false) {
  const trouble = !v && fromServerError;
  if (online !== v || serverError !== trouble) {
    online = v;
    serverError = trouble;
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

/** No connection, the server failing, or something in front of it answering instead. */
const isOffline = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500 || !e.fromForkbell);

/**
 * Read from the server, keep a copy, and fall back to the copy when there's
 * no connection. Waiting changes go up first, so the answer includes them.
 */
export async function cachedGet<T>(path: string): Promise<T> {
  await initSync();
  if (state.outbox.some(belongs)) await flush();
  if (state.outbox.some(belongs)) {
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
    const fromServer = e instanceof ApiError && e.fromForkbell && e.status >= 500;
    if (fromServer) console.warn(`Forkbell answered ${path} with ${(e as ApiError).status}; showing the saved copy.`, e);
    setOnline(false, fromServer);
    const copy = readCache<T>(path);
    if (copy !== undefined) return copy;
    // A login or proxy page says more than "offline" about what to fix.
    if (e instanceof ApiError && !e.fromForkbell) throw e;
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
  if (!state.outbox.some(belongs)) {
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
    userId: owner,
  });
  await persistNow();
  void flush();
  return { queued: true };
}

/** A change made by whoever is signed in now (older changes from before stamping count as theirs). */
const belongs = (item: OutboxItem) => owner !== null && (!item.userId || item.userId === owner);

/** Tell sync who is signed in (null when nobody is). Their waiting changes go up straight away. */
export function setSyncOwner(id: string | null) {
  if (owner === id) return;
  owner = id;
  notify();
  if (id) void flush();
}

/**
 * Signing out: drop this person's waiting and set-aside changes and every
 * cached copy of their data, so the next person to sign in on this phone
 * neither sends nor sees any of it. Settings that belong to the phone
 * (theme, sounds, the health connection, ...) stay.
 */
const PERSONAL_DEVICE_KEYS = ['device:tools-about', 'device:bell-chat', 'device:shopping', 'device:checkin:', 'device:fast-asked', 'device:rest-asked', 'device:streak-cheers'];
export async function forgetAccount() {
  await initSync();
  state.outbox = state.outbox.filter((o) => o.userId && o.userId !== owner);
  state.held = state.held.filter((o) => o.userId && o.userId !== owner);
  state.problems = [];
  for (const k of Object.keys(state.cache)) {
    if (!k.startsWith('device:') || PERSONAL_DEVICE_KEYS.some((p) => k.startsWith(p))) delete state.cache[k];
  }
  owner = null;
  if (saveTimer) clearTimeout(saveTimer);
  await saveStore(state);
  notify();
}

/** Send waiting changes in order. Stops at the first one that can't go yet. */
export async function flush(): Promise<void> {
  if (syncing) {
    while (syncing) await new Promise((r) => setTimeout(r, 100));
    return;
  }
  if (!state.outbox.some(belongs)) return;
  syncing = true;
  notify();
  try {
    while (state.outbox.some(belongs)) {
      // Only the signed-in person's changes, in their order; anyone else's wait for them.
      const item = state.outbox.find(belongs)!;
      const drop = () => (state.outbox = state.outbox.filter((o) => o.id !== item.id));
      let status = 0;
      try {
        await api(item.path, {
          method: item.method,
          headers: { 'x-forkbell-profile': item.profileId ?? '' },
          ...(item.body === undefined ? {} : { body: JSON.stringify(item.body) }),
        });
        status = 200;
      } catch (e) {
        // Only Forkbell's own answer can refuse a change; anything else in front of it counts as no connection.
        status = e instanceof ApiError && e.fromForkbell ? e.status : 0;
        if (classify(status, item.method) === 'rejected' && afterRejected(status, item.method, state.held.filter(belongs).length) === 'hold') {
          drop();
          state.held = [...state.held, item];
          persist();
          continue;
        }
        if (classify(status, item.method) === 'rejected') {
          state.problems = [...state.problems, `“${item.label}” couldn’t be saved: ${e instanceof Error ? e.message : 'refused'}`].slice(-5);
        }
      }
      const result = classify(status, item.method);
      if (result === 'retry') {
        item.attempts++;
        const { next, serverErrors } = afterRetry(item, status);
        item.serverErrors = serverErrors;
        if (next === 'hold') {
          // The server answered, but with an error, several times in a row: set it
          // aside so the changes behind it can go up, and let the person choose.
          drop();
          state.held = [...state.held, item];
          persist();
          continue;
        }
        if (status === 0) setOnline(false);
        persist();
        break;
      }
      drop();
      setOnline(true);
      persist();
    }
  } finally {
    syncing = false;
    notify();
  }
}

/** Send the set-aside changes again, ahead of anything newer, in their order. */
export async function retryHeld() {
  if (!state.held.length) return;
  state.outbox = [...state.held.map((h) => ({ ...h, serverErrors: 0 })), ...state.outbox];
  state.held = [];
  persist();
  await flush();
}

/** Give up on the set-aside changes. */
export function discardHeld() {
  state.held = [];
  persist();
}

export function clearProblems() {
  state.problems = [];
  persist();
}

/** The signed-in person's waiting changes right now (for a decision made after a flush). */
export function waitingNow() {
  const mine = state.outbox.filter((o) => !o.userId || o.userId === owner);
  return { count: mine.length, labels: mine.map((o) => o.label) };
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
  const mine = state.outbox.filter((o) => !o.userId || o.userId === owner);
  return { online, serverError, syncing, pending: mine.length, labels: mine.map((o) => o.label), problems: state.problems, held: state.held.map((h) => h.label) };
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
    '/api/wellbeing/fasts',
  ];
  for (const p of paths) await cachedGet(p).catch(() => {});
}
