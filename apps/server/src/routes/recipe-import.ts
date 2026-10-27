// Importing a recipe: from a web page (its schema.org Recipe), from your
// Mealie, or from pasted ingredient lines. Bell turns each ingredient line
// into a food and an amount in grams; ones that match a food you already
// have (or a built-in one) use it. This only previews: the app shows every
// ingredient for you to check, then saves the recipe with the usual routes.
import { Hono } from 'hono';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { foods, type connect } from '@forkbell/db';
import { extractJson, per100Problems, recipeFromHtml, servingsFrom, type Food, type Per100, type RecipeFound as Found } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { aiConfigFor, customAllowed } from '../bell/config.ts';
import { anthropic, openai } from '../bell/providers.ts';
import { toFood } from '../serialize.ts';

export interface ImportedIngredient {
  line: string;
  name: string;
  grams: number;
  per100: Per100;
  /** a food you already have (or a built-in one) with this name */
  match: Food | null;
}
export interface RecipePreview {
  name: string;
  servings: number;
  source: 'web' | 'mealie' | 'text';
  ingredients: ImportedIngredient[];
  /** lines Bell couldn't turn into a food */
  skipped: string[];
}

const MAX_PAGE = 3_000_000;

/** Private, loopback and link-local addresses: not fetched for someone unless the server allows it. */
function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:') && isPrivate(ip.slice(7));
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

/** A web page, following up to 3 redirects, checking each address. */
async function fetchPage(url: string): Promise<string> {
  let target = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(target.protocol)) throw new Error('Only http and https links can be imported.');
    if (!customAllowed()) {
      const addrs = await lookup(target.hostname, { all: true }).catch(() => []);
      if (!addrs.length) throw new Error('That site couldn’t be found.');
      if (addrs.some((a) => isPrivate(a.address))) throw new Error('That link is on a private network. Import it from Mealie, or ask whoever runs the server.');
    }
    const r = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'Forkbell recipe import', accept: 'text/html,application/xhtml+xml' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      target = new URL(r.headers.get('location')!, target);
      continue;
    }
    if (!r.ok) throw new Error(`The page answered ${r.status}.`);
    const text = await r.text();
    return text.slice(0, MAX_PAGE);
  }
  throw new Error('That link redirects too many times.');
}

/** A recipe from your Mealie, by its link (…/r/slug or …/recipe/slug). */
async function fromMealie(url: URL): Promise<Found> {
  const base = (process.env.MEALIE_URL ?? '').replace(/\/$/, '');
  const slug = /\/(?:r|recipe|recipes)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? url.pathname.split('/').filter(Boolean).pop();
  if (!slug) throw new Error('That Mealie link doesn’t point to a recipe.');
  const r = await fetch(`${base}/api/recipes/${encodeURIComponent(slug)}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: 'application/json', ...(process.env.MEALIE_TOKEN ? { authorization: `Bearer ${process.env.MEALIE_TOKEN}` } : {}) },
  });
  if (r.status === 401 || r.status === 403) throw new Error('Mealie wants a sign-in: set MEALIE_TOKEN (an API token from your Mealie profile) on the server.');
  if (!r.ok) throw new Error(`Mealie answered ${r.status}.`);
  const m = (await r.json()) as { name?: string; recipeYield?: unknown; recipeServings?: number; recipeIngredient?: { display?: string; note?: string; originalText?: string }[] };
  const lines = (m.recipeIngredient ?? []).map((i) => (i.display || i.originalText || i.note || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { name: (m.name ?? 'Imported recipe').slice(0, 200), servings: m.recipeServings && m.recipeServings > 0 ? m.recipeServings : servingsFrom(m.recipeYield), lines };
}

const INGREDIENTS_PROMPT = `You turn recipe ingredient lines into foods with amounts, for a nutrition tracker.
Answer with JSON only: {"items": [{"line": the line as given, "name": a plain food name to search for (e.g. "all-purpose flour", "large egg", "olive oil"), "grams": the line's amount in grams (estimate from cups, spoons, pieces; a large egg is 50 g, 1 cup flour 125 g, 1 tbsp oil 13.5 g), "per100": {"kcal", "protein", "carbs", "fat"} typical values per 100 g of that food}]}.
Skip lines that aren't ingredients (headings like "For the sauce:") and ones with no meaningful amount ("salt to taste", "water"). Never invent ingredients.`;

const aiItems = z.object({
  items: z.array(
    z.object({
      line: z.string().max(300),
      name: z.string().trim().min(1).max(120),
      grams: z.number().positive().max(20000),
      per100: z.object({ kcal: z.number().min(0).max(900), protein: z.number().min(0).max(100), carbs: z.number().min(0).max(100), fat: z.number().min(0).max(100) }),
    }),
  ),
});

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function recipeImportRoutes(db: ReturnType<typeof connect>) {
  const r = new Hono<AppEnv>();

  r.post('/preview', async (c) => {
    const p = z.object({ source: z.string().trim().min(3, 'Paste a link or the ingredients.').max(20_000) }).safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? 'Paste a link or the ingredients.' }, 400);
    const ai = await aiConfigFor(db, c.get('userId'));
    if (!ai || 'error' in ai) return c.json({ error: ai && 'error' in ai ? ai.error : 'Importing recipes needs Bell: add an AI key in Settings → Bell.' }, 503);

    // Where the recipe comes from.
    let found: Found;
    let source: RecipePreview['source'];
    const text = p.data.source;
    try {
      if (/^https?:\/\/\S+$/.test(text)) {
        const url = new URL(text);
        const mealie = process.env.MEALIE_URL ? new URL(process.env.MEALIE_URL) : null;
        if (mealie && url.host === mealie.host) {
          found = await fromMealie(url);
          source = 'mealie';
        } else {
          const page = recipeFromHtml(await fetchPage(text));
          if (!page || !page.lines.length) return c.json({ error: 'That page has no recipe Forkbell can read. Paste the ingredient list instead.' }, 422);
          found = page;
          source = 'web';
        }
      } else {
        // One ingredient per line; bullets are dropped, amounts kept.
        const lines = text.split(/\r?\n/).map((l) => l.replace(/^[\s•*\-–]+/, '').trim()).filter(Boolean);
        const first = lines[0] ?? '';
        const titled = lines.length > 1 && !/\d/.test(first) && first.length < 80;
        found = { name: titled ? first : 'Imported recipe', servings: 1, lines: titled ? lines.slice(1) : lines };
        source = 'text';
      }
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
    const lines = found.lines.slice(0, 60);
    if (!lines.length) return c.json({ error: 'No ingredients found.' }, 422);

    // Bell works out each line's food and grams.
    let answer: string;
    try {
      const cfg = { apiKey: ai.apiKey, model: ai.model, baseUrl: ai.baseUrl };
      const turns = [{ role: 'user' as const, text: lines.join('\n') }];
      const model = ai.format === 'anthropic' ? anthropic(cfg, INGREDIENTS_PROMPT, turns, []) : openai(cfg, INGREDIENTS_PROMPT, turns, []);
      answer = (await model.step()).text;
    } catch (e) {
      console.error('Recipe import:', e);
      return c.json({ error: 'Bell couldn’t reach the AI service. Try again.' }, 502);
    }
    const parsed = aiItems.safeParse(extractJson(answer));
    if (!parsed.success) return c.json({ error: 'Bell’s answer didn’t make sense. Try again, or paste fewer lines.' }, 422);

    // Use foods you already have (or built-in ones) when the name matches.
    const names = [...new Set(parsed.data.items.map((i) => norm(i.name)))];
    const rows = names.length
      ? await db.asUser(c.get('userId'), (tx) =>
          tx
            .select()
            .from(foods)
            .where(sql`lower(regexp_replace(${foods.name}, '[^a-zA-Z0-9]+', ' ', 'g')) in (${sql.join(names.map((n) => sql`${n}`), sql`, `)})`)
            .limit(200),
        )
      : [];
    const byName = new Map<string, ReturnType<typeof toFood>>();
    for (const row of rows) {
      const f = toFood(row);
      const k = norm(f.name);
      if (!byName.has(k) || row.ownerId) byName.set(k, f); // your own over built-in
    }
    const used = new Set(parsed.data.items.map((i) => i.line));
    const ingredients: ImportedIngredient[] = parsed.data.items
      .filter((i) => per100Problems({ ...i.per100 }).length === 0)
      .map((i) => {
        const hit = byName.get(norm(i.name));
        return { line: i.line, name: i.name, grams: Math.round(i.grams * 10) / 10, per100: hit ? hit.per100 : i.per100, match: hit ?? null };
      });
    const preview: RecipePreview = { name: found.name, servings: found.servings, source, ingredients, skipped: lines.filter((l) => !used.has(l)) };
    return c.json(preview);
  });

  return r;
}
