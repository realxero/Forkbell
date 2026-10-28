// Forkbell for AI apps (Claude Desktop, Cursor and others) over the Model
// Context Protocol: Streamable HTTP at /mcp, answering plain JSON (no
// streaming). Each app gets its own key (Settings → AI apps), which reads your
// diary, progress, foods and workouts, and logs food and water only if you
// allowed that when you made the key. The app itself asks you before each
// tool call; every call is checked here against the key.
import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { shortcutKeys, users, type connect } from '@forkbell/db';
import { BUILD, MEALS, parseWater, preferencesSchema, todayLocal, waterText, type Meal } from '@forkbell/shared';
import { MCP_PREFIX, hashToken } from '../auth.ts';
import { runTool, TOOLS, type ToolContext } from '../bell/tools.ts';

type Internal = (path: string, userId: string, init?: { method: string; body: unknown }) => Promise<unknown>;
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };

const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
/** Bell's read tools, as they are. */
const READ = ['get_day', 'get_progress', 'get_recent_foods', 'search_foods', 'get_workouts', 'get_exercise'];

const WRITE: Tool[] = [
  {
    name: 'log_food',
    description:
      'Log a food to the diary. Use food_id from search_foods or get_recent_foods when there is one (its numbers are used); otherwise give name and per100 (kcal, protein, carbs, fat per 100 g). grams is what was eaten. meal is one of the meal keys from get_day.',
    inputSchema: {
      type: 'object',
      properties: {
        food_id: { type: 'string' },
        name: { type: 'string' },
        brand: { type: 'string' },
        per100: { type: 'object', properties: { kcal: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' } } },
        grams: { type: 'number' },
        meal: { type: 'string', enum: [...MEALS] },
        date: { type: 'string', description: 'YYYY-MM-DD; today if left out' },
      },
      required: ['grams', 'meal'],
    },
  },
  {
    name: 'log_water',
    description: 'Log water drunk today: amount with a unit ("16.9 oz", "500 ml", "1 L").',
    inputSchema: { type: 'object', properties: { amount: { type: 'string' }, date: { type: 'string' } }, required: ['amount'] },
  },
];

const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

export function mcpRoutes(db: ReturnType<typeof connect>, internal: Internal) {
  const r = new Hono();

  // No server-to-client stream here; answers come back on each POST.
  r.get('/', (c) => c.text('Forkbell answers MCP requests with POST.', 405, { allow: 'POST' }));
  r.delete('/', (c) => c.body(null, 204));

  r.post('/', async (c) => {
    const auth = c.req.header('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token.startsWith(MCP_PREFIX)) return c.json({ error: 'Use a key from Forkbell → Settings → AI apps.' }, 401, { 'www-authenticate': 'Bearer' });
    const hash = hashToken(token);
    const [row] = (await db.db.execute(sql`select auth_session_user(${hash}) as id`)) as unknown as { id: string | null }[];
    const userId = row?.id;
    if (!userId) return c.json({ error: 'That key has been removed or has run out.' }, 401, { 'www-authenticate': 'Bearer' });
    const [key] = await db.asUser(userId, (tx) => tx.select({ kind: shortcutKeys.kind, canWrite: shortcutKeys.canWrite }).from(shortcutKeys).where(eq(shortcutKeys.tokenHash, hash)).limit(1));
    if (!key || key.kind !== 'mcp') return c.json({ error: 'That isn’t a key for AI apps.' }, 403);
    void db.asUser(userId, (tx) => tx.update(shortcutKeys).set({ lastUsedAt: sql`now()` }).where(eq(shortcutKeys.tokenHash, hash))).catch(() => {});

    const body = (await c.req.json().catch(() => null)) as Rpc | Rpc[] | null;
    if (!body) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    const one = async (m: Rpc) => {
      const reply = (result: unknown) => ({ jsonrpc: '2.0', id: m.id ?? null, result });
      const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: m.id ?? null, error: { code, message } });
      switch (m.method) {
        case 'initialize': {
          const asked = String(m.params?.protocolVersion ?? '');
          return reply({
            protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'Forkbell', version: BUILD.version },
            instructions: `This is the person's own Forkbell (food and training tracker). Read tools are always allowed${key.canWrite ? '; log_food and log_water add to their diary, so say what you are about to log' : '; this key can only read'}. Amounts are grams; foods are per 100 g.`,
          });
        }
        case 'ping':
          return reply({});
        case 'tools/list': {
          const read: Tool[] = TOOLS.filter((t) => READ.includes(t.name)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters as Record<string, unknown> }));
          return reply({ tools: [...read, ...(key.canWrite ? WRITE : [])] });
        }
        case 'tools/call': {
          const name = String(m.params?.name ?? '');
          const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
          try {
            if (READ.includes(name)) return reply(text(await runTool(name, args, await contextFor(userId))));
            if (name === 'log_food' || name === 'log_water') {
              if (!key.canWrite) return reply(text('This key can only read. Make a key that can log in Forkbell → Settings → AI apps.', true));
              return reply(name === 'log_food' ? await logFood(userId, args) : await logWater(userId, args));
            }
            return fail(-32602, `No tool called ${name}.`);
          } catch (e) {
            return reply(text(e instanceof Error ? e.message : String(e), true));
          }
        }
        default:
          return m.id === undefined ? null : fail(-32601, `Method not found: ${m.method}`);
      }
    };
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(one))).filter(Boolean);
      return out.length ? c.json(out) : c.body(null, 202);
    }
    const out = await one(body);
    return out ? c.json(out) : c.body(null, 202); // a notification gets no answer
  });

  async function contextFor(userId: string): Promise<ToolContext> {
    const [me] = await db.asUser(userId, (tx) => tx.select({ unit: users.weightUnit, prefs: users.preferences }).from(users).where(eq(users.id, userId)).limit(1));
    return { call: (path: string) => internal(path, userId), today: todayLocal(), meal: 'snacks', proposals: [], prefs: preferencesSchema.parse(me?.prefs ?? {}), userText: '', question: null, unit: (me?.unit ?? 'lb') as 'lb' | 'kg' };
  }

  async function logFood(userId: string, a: Record<string, unknown>) {
    const grams = Number(a.grams);
    const meal = String(a.meal) as Meal;
    if (!(grams > 0 && grams <= 5000)) return text('grams must be between 0 and 5000.', true);
    if (!MEALS.includes(meal)) return text(`meal must be one of ${MEALS.join(', ')}.`, true);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? '')) ? String(a.date) : todayLocal();
    const p = a.per100 as { kcal?: number; protein?: number; carbs?: number; fat?: number } | undefined;
    const body = a.food_id
      ? { date, meal, grams, foodId: String(a.food_id) }
      : p && a.name
        ? { date, meal, grams, food: { name: String(a.name).slice(0, 200), brand: a.brand ? String(a.brand).slice(0, 120) : null, source: 'custom', per100: { kcal: Number(p.kcal), protein: Number(p.protein), carbs: Number(p.carbs), fat: Number(p.fat) }, servingGrams: null, barcode: null } }
        : null;
    if (!body) return text('Give food_id, or name and per100.', true);
    const r = (await internal('/api/diary', userId, { method: 'POST', body })) as { entry?: { food: { name: string; per100: { kcal: number } } } };
    const kcal = r.entry ? Math.round((r.entry.food.per100.kcal * grams) / 100) : null;
    return text(`Logged ${r.entry?.food.name ?? 'it'}, ${Math.round(grams)} g${kcal !== null ? ` (${kcal} kcal)` : ''}, to ${meal} on ${date}.`);
  }

  async function logWater(userId: string, a: Record<string, unknown>) {
    const ml = parseWater(String(a.amount ?? ''), 'kg');
    if (!ml) return text('Give an amount with a unit, like "16.9 oz" or "500 ml".', true);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date ?? '')) ? String(a.date) : todayLocal();
    await internal('/api/wellbeing/water', userId, { method: 'POST', body: { date, ml } });
    return text(`Logged ${waterText(ml, 'kg')} of water on ${date}.`);
  }

  return r;
}
