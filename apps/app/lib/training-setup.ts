// Your training setup (equipment, areas to protect, exercises to leave out,
// hidden tips, strength goals) lives with your other preferences on the server.
import { useCallback } from 'react';
import { preferencesSchema, type TrainingSetup } from '@forkbell/shared';
import { put } from './api';
import { useAuth } from './auth';

export function useTrainingSetup() {
  const { me, refreshMe } = useAuth();
  // Parsing fills in defaults for anything saved before these settings existed.
  const prefs = preferencesSchema.parse(me?.preferences ?? {});
  const save = useCallback(
    async (change: (t: TrainingSetup) => TrainingSetup) => {
      const current = preferencesSchema.parse(me?.preferences ?? {});
      await put('/api/me/preferences', { ...current, training: change(current.training) });
      await refreshMe();
    },
    [me, refreshMe],
  );
  return { setup: prefs.training, save };
}
