// In the browser and the home-screen app: localStorage.
const KEY = 'forkbell-offline';

export async function loadStore(): Promise<unknown> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveStore(data: unknown) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full or private mode: the app still works online */
  }
}
