import { formatWeight, fromKg, toKg, type WeightUnit } from '@forkbell/shared';
import { useAuth } from './auth';

/** The signed-in person's weight unit, with helpers to show and read weights in it. */
export function useUnit() {
  const { me } = useAuth();
  const unit: WeightUnit = me?.weightUnit ?? 'lb';
  return {
    unit,
    show: (kg: number | null) => formatWeight(kg, unit),
    /** "135 lb", or "" for no weight */
    label: (kg: number | null) => (kg === null ? '' : `${formatWeight(kg, unit)} ${unit}`),
    /** whole numbers, for estimates where a decimal would claim false precision */
    roundLabel: (kg: number) => `${Math.round(fromKg(kg, unit))} ${unit}`,
    read: (text: string) => {
      const v = Number(text.replace(',', '.'));
      return text.trim() === '' || !Number.isFinite(v) || v < 0 ? null : toKg(v, unit);
    },
  };
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
