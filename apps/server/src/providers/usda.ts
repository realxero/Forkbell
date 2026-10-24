import type { FoodCandidate } from '@forkbell/shared';
import { per100Problems, sameBarcode } from '@forkbell/shared';

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
  /** household measures, on survey (FNDDS) and SR Legacy foods: "1 cup" = 240 g */
  foodMeasures?: { disseminationText?: string; gramWeight?: number; rank?: number }[];
};

/** "1 cup", "1 medium" and the like, best first, without USDA's placeholders. */
function portionsOf(f: UsdaFood) {
  const seen = new Set<string>();
  return [...(f.foodMeasures ?? [])]
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .filter((m) => m.disseminationText && m.gramWeight && m.gramWeight > 0 && m.gramWeight <= 5000 && !/quantity not specified/i.test(m.disseminationText))
    .map((m) => ({ label: m.disseminationText!.trim().slice(0, 60), grams: Math.round(m.gramWeight! * 10) / 10 }))
    .filter((p) => !seen.has(p.label.toLowerCase()) && seen.add(p.label.toLowerCase()))
    .slice(0, 6);
}

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
    portions: portionsOf(f),
  };
}

// USDA descriptions are often SHOUTED for branded foods.
const toTitle = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s);

export async function searchUsda(query: string, apiKey: string): Promise<FoodCandidate[]> {
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Survey (FNDDS) foods are everyday dishes with real household portions: "1 cup chili".
    body: JSON.stringify({ query, pageSize: 20, dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`USDA answered ${res.status}`);
  const data = (await res.json()) as { foods?: UsdaFood[] };
  return (data.foods ?? []).map(fromUsda).filter((f): f is FoodCandidate => f !== null);
}

/**
 * A barcode in USDA's branded foods, which come from manufacturers' own label
 * data. Searches the code and keeps only an exact barcode match.
 */
export async function barcodeUsda(codes: string[], apiKey: string): Promise<FoodCandidate | null> {
  // USDA keeps most US barcodes as 12-digit UPC-A, some as 13 or 14 digits.
  // Search matches the stored form, so try the usual lengths, 12 first.
  const core = (codes[0] ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const tries = [...new Set([12, 13, 14].filter((n) => core.length <= n).map((n) => core.padStart(n, '0')).concat(codes))].slice(0, 3);
  for (const query of tries) {
    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, pageSize: 10, dataType: ['Branded'] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`USDA answered ${res.status}`);
    const data = (await res.json()) as { foods?: UsdaFood[] };
    const hit = (data.foods ?? []).find((f) => f.gtinUpc && codes.some((c) => sameBarcode(c, f.gtinUpc!)));
    const food = hit ? fromUsda(hit) : null;
    if (food) return food;
  }
  return null;
}
