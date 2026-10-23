import type { FoodCandidate } from '@forkbell/shared';
import { per100Problems } from '@forkbell/shared';

const UA = 'Forkbell/0.1 (self-hosted nutrition and fitness tracker)';
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
};

const n = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));

export function fromOff(p: OffProduct): FoodCandidate | null {
  const nm = p.nutriments ?? {};
  const kcal = n(nm['energy-kcal_100g']) ?? (n(nm['energy_100g']) !== null ? n(nm['energy_100g'])! / 4.184 : null);
  const protein = n(nm['proteins_100g']);
  const carbs = n(nm['carbohydrates_100g']);
  const fat = n(nm['fat_100g']);
  if (!p.product_name || !p.code || kcal === null || protein === null || carbs === null || fat === null) return null;
  const sodiumG = n(nm['sodium_100g']);
  const per100 = {
    kcal: Math.round(kcal * 10) / 10,
    protein,
    carbs,
    fat,
    fiber: n(nm['fiber_100g']),
    sugar: n(nm['sugars_100g']),
    sodium: sodiumG === null ? null : Math.round(sodiumG * 1000),
  };
  if (per100Problems(per100).length) return null; // community data: skip clearly broken rows
  const serving = n(p.serving_quantity);
  return {
    name: p.product_name.trim(),
    brand: p.brands?.split(',')[0]?.trim() || null,
    source: 'off',
    sourceId: p.code,
    per100,
    servingGrams: serving && serving > 0 ? serving : null,
    servingLabel: p.serving_size?.trim() || null,
    barcode: p.code,
    portions: [],
  };
}

export async function searchOff(query: string): Promise<FoodCandidate[]> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.search = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '20', fields: FIELDS }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map(fromOff).filter((f): f is FoodCandidate => f !== null);
}

/** Look a barcode up, trying the UPC-A and EAN-13 forms of the same number. */
export async function barcodeOff(codes: string[]): Promise<FoodCandidate | null> {
  for (const code of codes) {
    const found = await barcodeOffOnce(code);
    if (found) return found;
  }
  return null;
}

async function barcodeOffOnce(code: string): Promise<FoodCandidate | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  return data.status === 1 && data.product ? fromOff({ ...data.product, code }) : null;
}
