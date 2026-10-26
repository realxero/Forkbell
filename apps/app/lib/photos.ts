// Progress photos on the phone: the list from the server, adding and removing,
// and the address of each picture (with your sign-in on phones; the web app
// sends its cookie by itself). Photos need a connection: they're never queued,
// so a few megabytes never wait on the phone.
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Pose, ProgressPhoto } from '@forkbell/shared';
import { api, authHeaders, del, getServerUrl, post } from './api';
import { pickImage } from './images';

export const photoSource = (id: string) => ({
  uri: `${getServerUrl() ?? ''}/api/photos/${id}/image`,
  ...(Platform.OS === 'web' ? {} : { headers: authHeaders() }),
});

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export function usePhotos() {
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Pose | null>(null);
  const load = useCallback(() => {
    api<{ photos: ProgressPhoto[] }>('/api/photos').then(
      (r) => {
        setPhotos(r.photos);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  useEffect(() => {
    load();
    listeners.add(load);
    return () => void listeners.delete(load);
  }, [load]);

  /** Take one (camera) or pick one (library) for a pose, dated today. */
  const add = async (pose: Pose, camera: boolean, date: string) => {
    setError(null);
    const r = await pickImage(camera);
    if (!r) return false;
    if ('error' in r) {
      setError(r.error);
      return false;
    }
    setBusy(pose);
    try {
      await post('/api/photos', { date, pose, image: r.image });
      changed();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const remove = async (id: string) => {
    try {
      await del(`/api/photos/${id}`);
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return { photos, error, busy, add, remove, reload: load };
}
