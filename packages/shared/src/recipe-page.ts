// Reading a recipe from a web page: the schema.org Recipe in its JSON-LD,
// which most recipe sites and apps (Mealie, WordPress recipe plugins) publish.

/** A recipe's name, servings and ingredient lines, as found on a page or in Mealie. */
export type RecipeFound = { name: string; servings: number; lines: string[] };

/** The first schema.org Recipe in a page's JSON-LD. */
export function recipeFromHtml(html: string): RecipeFound | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  const isRecipe = (x: unknown): x is Record<string, unknown> => {
    const t = (x as { '@type'?: unknown })?.['@type'];
    return Array.isArray(t) ? t.includes('Recipe') : t === 'Recipe';
  };
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(b.trim());
    } catch {
      continue;
    }
    const all = (Array.isArray(data) ? data : [data]).flatMap((x) => [x, ...(((x as { '@graph'?: unknown[] })?.['@graph'] as unknown[]) ?? [])]);
    const recipe = all.find(isRecipe);
    if (!recipe) continue;
    const lines = ((recipe.recipeIngredient ?? recipe.ingredients ?? []) as unknown[]).map((l) => String(l).replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { name: String(recipe.name ?? 'Imported recipe').slice(0, 200), servings: servingsFrom(recipe.recipeYield), lines };
  }
  return null;
}

/** "4", "4 servings", ["6", "6 servings"], "Serves 4-6" → 4. */
export function servingsFrom(y: unknown): number {
  const text = Array.isArray(y) ? y.map(String).join(' ') : String(y ?? '');
  const n = Number(/(\d+(?:\.\d+)?)/.exec(text)?.[1]);
  return n > 0 && n <= 100 ? n : 1;
}
