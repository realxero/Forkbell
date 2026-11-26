// Today's numbers in the widget's shape, from the diary and water days. Used by
// the Today screen and by the background refresh (widget.ios.ts).
import type { DiaryDay, Me, WaterDay } from '@forkbell/shared';
import { waterGoalMl } from '@forkbell/shared';
import type { WidgetToday } from './widget';

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
