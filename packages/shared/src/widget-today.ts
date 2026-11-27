// Today's numbers in the widget's shape, from the diary and water days. Used by
// the app (Today screen, background refresh) and by the server, for a widget
// that fetches today itself.
import type { DiaryDay, Me } from './types.ts';
import type { WaterDay } from './water.ts';
import { waterGoalMl } from './water.ts';

/** What the home screen widget shows: the app writes it to the widget, and the widget can fetch it from /api/shortcuts/today. */
export interface WidgetToday {
  date: string;
  kcalGoal: number | null;
  kcalEaten: number;
  protein: number;
  proteinGoal: number | null;
  carbs: number;
  carbsGoal: number | null;
  fat: number;
  fatGoal: number | null;
  netCarbs: boolean;
  waterMl?: number;
  waterGoalMl?: number;
}

export function widgetToday(day: DiaryDay, me: Me, water: WaterDay | null | undefined): WidgetToday {
  const net = !!me.preferences.netCarbs;
  // Exercise adds to the goal when that's turned on, as on Today.
  const bonus = day.goals.kcal ? day.bonus?.kcal ?? 0 : 0;
  return {
    date: day.date,
    kcalGoal: day.goals.kcal != null ? day.goals.kcal + bonus : null,
    kcalEaten: day.totals.kcal,
    protein: day.totals.protein,
    proteinGoal: day.goals.protein,
    carbs: net ? Math.max(0, day.totals.carbs - day.totals.fiber) : day.totals.carbs,
    carbsGoal: day.goals.carbs,
    fat: day.totals.fat,
    fatGoal: day.goals.fat,
    netCarbs: net,
    ...(water && me.preferences.water?.show !== false ? { waterMl: water.totalMl, waterGoalMl: waterGoalMl(me.preferences.water?.goalMl) } : {}),
  };
}
