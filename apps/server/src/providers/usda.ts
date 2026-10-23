import type { FoodCandidate } from '@forkbell/shared';
import { per100Problems } from '@forkbell/shared';

type UsdaFood = {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  dataType?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  gtinUpc?: string;
  foodNutrients?: { nutrientNumber?: string; value?: number }[];
};

// USDA nutrient numbers. Search results report these per 100 g for every data type.
const NUM = { kcal: '208', protein: '203', carbs: '205', fat: '204', fiber: '291', sugar: '269', sodium: '307', satFat: '606' } as const;

export function fromUsda(f: UsdaFood): FoodCandidate | null {
  const get = (num: string) => f.foodNutrients?.find((x) => x.nutrientNumber === num)?.value ?? null;
  const kcal = get(NUM.kcal);
  const protein = get(NUM.protein);
  const carbs = get(NUM.carbs);
  const fat = get(NUM.fat);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  const per100 = { kcal, protein, carbs, fat, fiber: get(NUM.fiber), sugar: get(NUM.sugar), sodium: get(NUM.sodium), satFat: get(NUM.satFat) };
  if (per100Problems(per100).length) return null;
  const unit = f.servingSizeUnit?.toLowerCase();
  const servingGrams = f.servingSize && (unit === 'g' || unit === 'ml' || unit === 'grm' || unit === 'mlt') ? f.servingSize : null;
  return {
    name: toTitle(f.description),
    brand: f.brandName || f.brandOwner || null,
    source: 'usda',
    sourceId: String(f.fdcId),
    per100,
    servingGrams,
    servingLabel: f.householdServingFullText || null,
    barcode: f.gtinUpc && /^\d{6,14}$/.test(f.gtinUpc) ? f.gtinUpc : null,
    portions: [],
  };
}

// USDA descriptions are often SHOUTED for branded foods.
const toTitle = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s);

export async function searchUsda(query: string, apiKey: string): Promise<FoodCandidate[]> {
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, pageSize: 20, dataType: ['Foundation', 'SR Legacy', 'Branded'] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`USDA answered ${res.status}`);
  const data = (await res.json()) as { foods?: UsdaFood[] };
  return (data.foods ?? []).map(fromUsda).filter((f): f is FoodCandidate => f !== null);
}
