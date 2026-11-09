// On phones: one JSON file in the app's documents folder.
import { File, Paths } from 'expo-file-system';

const NAME = 'forkbell-offline.json';
const file = () => new File(Paths.document, NAME);

const UNREADABLE = 'The offline copy on this device couldn’t be read, so it was set aside (forkbell-offline.unreadable.json) instead of being overwritten.';

/** What was saved, or null. A file that can't be read is kept aside, never silently replaced. */
export async function loadStore(): Promise<{ data: unknown; problem?: string }> {
  const f = file();
  let text: string;
  try {
    if (!f.exists) return { data: null };
    text = await f.text();
  } catch {
    return { data: null, problem: UNREADABLE };
  }
  try {
    return { data: JSON.parse(text) };
  } catch {
    try {
      const aside = new File(Paths.document, 'forkbell-offline.unreadable.json');
      if (!aside.exists) aside.create();
      aside.write(text);
    } catch {
      /* nothing more we can do */
    }
    return { data: null, problem: UNREADABLE };
  }
}

/** False when it couldn't be written (storage full or unavailable). */
export async function saveStore(data: unknown): Promise<boolean> {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
