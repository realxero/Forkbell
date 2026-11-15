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
}

export function updateWidget(_today: WidgetToday): void {}
