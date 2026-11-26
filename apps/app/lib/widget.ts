// Today's numbers for the iPhone home and lock screen widget (widget.ios.ts).
// Other platforms have no widget yet, so this does nothing.
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

export function updateWidget(_today: WidgetToday): void {}

/** Keep the widget fresh while the app is closed (iPhone only). */
export function startWidgetRefresh(): void {}
