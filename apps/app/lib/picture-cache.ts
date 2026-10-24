// Exercise how-to pictures kept on the phone, so they show at the gym with no
// signal. Pictures for your everyday exercises (and any you've done) download
// by themselves, about 7 MB; the whole library (about 87 MB) is a button in
// Settings. Anything not saved yet loads from your Forkbell server as usual.
// The web keeps using the browser's own cache.
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { picturePaths, type Exercise, type Stretch } from '@forkbell/shared';
import { getServerUrl } from './api';
import { cachedGet, readCache, writeCache } from './sync';

export const pictureCacheSupported = Platform.OS !== 'web';
const AVERAGE_BYTES = 57_000;

const folder = () => new Directory(Paths.document, 'exercise-pictures');

/** "/api/media/exercise/Barbell_Squat/0.jpg" -> "Barbell_Squat-0.jpg" */
function fileName(path: string) {
  const m = /\/exercise\/([^/]+)\/(\d+)\.jpg$/.exec(path);
  return m ? `${decodeURIComponent(m[1]!).replace(/[^A-Za-z0-9_\-(),']/g, '_')}-${m[2]}.jpg` : null;
}
const fileFor = (path: string) => {
  const name = fileName(path);
  return name ? new File(folder(), name) : null;
};

/** Where to load a picture from: this phone if it's saved, otherwise your server. */
export function pictureSource(path: string): { uri: string } {
  if (pictureCacheSupported) {
    try {
      const f = fileFor(path);
      if (f?.exists) return { uri: f.uri };
    } catch {
      /* fall back to the server */
    }
  }
  return { uri: `${getServerUrl() ?? ''}${path}` };
}

let running: Promise<{ saved: number; failed: number }> | null = null;
const listeners = new Set<(p: { done: number; total: number }) => void>();
/** Follow a download's progress (Settings shows it). */
export function onPictureProgress(l: (p: { done: number; total: number }) => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const pictureDownloadRunning = () => running !== null;

/** Save the pictures that aren't on this phone yet, a few at a time. One download runs at once. */
export function downloadPictures(paths: string[]): Promise<{ saved: number; failed: number }> {
  if (!pictureCacheSupported) return Promise.resolve({ saved: 0, failed: 0 });
  running ??= (async () => {
    const dir = folder();
    if (!dir.exists) dir.create({ intermediates: true });
    const todo = paths.filter((p) => {
      const f = fileFor(p);
      return f && !f.exists;
    });
    let done = 0;
    let saved = 0;
    let failed = 0;
    const total = todo.length;
    const tell = () => listeners.forEach((l) => l({ done, total }));
    tell();
    const server = getServerUrl() ?? '';
    const worker = async () => {
      for (let p = todo.shift(); p; p = todo.shift()) {
        try {
          await File.downloadFileAsync(`${server}${p}`, fileFor(p)!, { idempotent: true });
          saved++;
        } catch {
          failed++;
        }
        done++;
        tell();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { saved, failed };
  })().finally(() => {
    running = null;
  });
  return running;
}

type Listed = Exercise & { uses?: number };
const everydayPaths = (list: Listed[]) => list.filter((e) => !e.library || (e.uses ?? 0) > 0).flatMap(picturePaths);
const allPaths = (list: Listed[]) => list.flatMap(picturePaths);
/** Warm-up and stretch pictures; part of the whole library. */
const stretchPaths = async () => ((await cachedGet<{ stretches: Stretch[] }>('/api/stretches').catch(() => null))?.stretches ?? []).flatMap(picturePaths);

/** What's saved on this phone, and what the full library would add. */
export async function pictureStats() {
  const list = (await cachedGet<{ exercises: Listed[] }>('/api/exercises').catch(() => ({ exercises: [] }))).exercises;
  const all = [...allPaths(list), ...(await stretchPaths())];
  let saved = 0;
  let bytes = 0;
  try {
    const dir = folder();
    if (dir.exists)
      for (const item of dir.list())
        if (item instanceof File) {
          saved++;
          bytes += item.size ?? 0;
        }
  } catch {
    /* nothing saved */
  }
  return { saved, bytes, total: all.length, remainingBytes: Math.max(0, all.length - saved) * AVERAGE_BYTES };
}

/** Download the whole library's pictures. */
export async function downloadAllPictures() {
  const list = (await cachedGet<{ exercises: Listed[] }>('/api/exercises')).exercises;
  return downloadPictures([...allPaths(list), ...(await stretchPaths())]);
}

/** Free the space; everyday pictures come back by themselves next time. */
export function removeSavedPictures() {
  try {
    const dir = folder();
    if (dir.exists) dir.delete();
  } catch {
    /* already gone */
  }
  writeCache('device:pictures-checked', null);
}

/**
 * Keep your everyday exercises' pictures on the phone. Runs at most once a day
 * when the app opens; quick when nothing's new.
 */
export async function keepEverydayPictures() {
  if (!pictureCacheSupported) return;
  const today = new Date().toDateString();
  if (readCache<string>('device:pictures-checked') === today) return;
  const list = (await cachedGet<{ exercises: Listed[] }>('/api/exercises').catch(() => null))?.exercises;
  if (!list?.length || !list.some((e) => e.howToRef)) return; // an older server: nothing to save yet
  const r = await downloadPictures(everydayPaths(list));
  if (!r.failed) writeCache('device:pictures-checked', today);
}
