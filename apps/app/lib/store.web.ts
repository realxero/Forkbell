// In the browser and the home-screen app: localStorage.
const KEY = 'forkbell-offline';

const UNREADABLE = 'The offline copy in this browser couldn’t be read, so it was set aside instead of being overwritten.';

/** What was saved, or null. A copy that can't be read is kept aside, never silently replaced. */
export async function loadStore(): Promise<{ data: unknown; problem?: string }> {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return { data: null }; // private mode or storage blocked: nothing was ever saved
  }
  if (!raw) return { data: null };
  try {
    return { data: JSON.parse(raw) };
  } catch {
    try {
      window.localStorage.setItem(`${KEY}-unreadable`, raw);
    } catch {
      /* nothing more we can do */
    }
    return { data: null, problem: UNREADABLE };
  }
}

/** False when it couldn't be written (storage full or private mode). */
export async function saveStore(data: unknown): Promise<boolean> {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
