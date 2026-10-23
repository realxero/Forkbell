// On phones: one JSON file in the app's documents folder.
import { File, Paths } from 'expo-file-system';

const file = () => new File(Paths.document, 'forkbell-offline.json');

export async function loadStore(): Promise<unknown> {
  try {
    const f = file();
    return f.exists ? JSON.parse(await f.text()) : null;
  } catch {
    return null;
  }
}

export async function saveStore(data: unknown) {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(data));
  } catch {
    /* storage full or unavailable: the app still works online */
  }
}
