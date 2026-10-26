import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { users, type connect } from '@forkbell/db';
import { z } from 'zod';
import { BIG_JUMP, KOKORO_VOICES, TTS_VOICE, bellChatSchema, extractJson, incrementKg, jumpShare, progressIdeas, type Workout, labelReadSchema, labelToFood, preferencesSchema, type BellQuestion, type BellReply, type FoodProposal } from '@forkbell/shared';
import type { AppEnv } from '../auth.ts';
import { anthropic, openai, type ToolCall } from '../bell/providers.ts';
import { aiConfigFor } from '../bell/config.ts';
import { env } from '../env.ts';
import { runTool, systemPrompt, toolsFor, type ToolContext } from '../bell/tools.ts';

const MAX_ROUNDS = 8;
// A simple guard against runaway costs: 40 messages per person per 10 minutes.
const recent = new Map<string, number[]>();
function allowed(userId: string) {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= 40) return false;
  recent.set(userId, [...list, now]);
  return true;
}

// Bell's voice from your speech server: generous, but not unlimited (each one is GPU time).
const spoken = new Map<string, number[]>();
function mayspeak(userId: string) {
  const now = Date.now();
  const list = (spoken.get(userId) ?? []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= 150) return false;
  spoken.set(userId, [...list, now]);
  return true;
}
const ttsHeaders = () => ({ 'content-type': 'application/json', ...(env.tts.apiKey ? { authorization: `Bearer ${env.tts.apiKey}` } : {}) });

const labelSchema = z.object({ image: z.string().max(4_000_000).regex(/^data:image\/(jpeg|png|webp|gif);base64,/, 'Send a JPEG, PNG, WebP or GIF photo.') });

const EQUIPMENT_PROMPT = `You identify gym equipment from photos and explain it to a beginner. Be accurate; if unsure, say so.
Answer with one JSON object and nothing else:
{"recognized": boolean, "name": string|null, "what": string, "setup": string[], "how": string[], "safety": string[], "exercises": string[]}
- name: the usual name (e.g. "Seated cable row", "Leg press", "Smith machine", "Lat pulldown").
- what: one or two sentences on what it trains and why you'd use it.
- setup: up to 4 short steps to adjust it (seat height, pads, pin, grip), in order.
- how: up to 5 short steps to do the main exercise with good form.
- safety: up to 3 short points (e.g. don't lock your knees, use the safety stops, start light).
- exercises: up to 6 common exercise names done on it, main one first, in plain names like "Lat pulldown", "Seated cable row", "Cable fly".
If the photo isn't gym equipment, set recognized false and explain briefly in what.`;

const PLATE_PROMPT = `You find each separate food in a photo of a meal taken from straight above, so a depth sensor can measure each one. The photo may be sideways; that's fine.
Answer with one JSON object and nothing else:
{"container": "plate"|"bowl"|"tray"|"other"|null, "items": [{"name": string, "box": [left, top, right, bottom], "density": number, "note": string|null}]}
- name: the food as someone would log it ("white rice", "grilled chicken thigh", "steamed broccoli", "quesabirria taco").
- box: a tight box around that food only, as fractions of the image width and height measured from the top-left corner, each from 0 to 1, left < right and top < bottom. Boxes of different foods should overlap as little as possible.
- density: grams per millilitre of the food as it sits there, air gaps included. Rough guide: cooked rice 0.8, pasta 0.6, mashed potato 1.0, fries 0.4, leafy salad 0.15, chopped raw veg 0.5, steamed broccoli 0.35, meat or fish 1.0, beans or stew 1.0, bread 0.25, tortilla wrap 0.6, soup 1.0, cake 0.5.
- note: anything that matters for calories you can see (fried, creamy sauce, cheese on top), else null.
- Up to 8 items. Leave out the plate, cutlery, napkins, drinks in cups and packaging. A sauce gets its own item only if it's a separate pile.
- If there's no food, items is [].`;

const plateSchema = z.object({
  container: z.enum(['plate', 'bowl', 'tray', 'other']).nullable().optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        density: z.number().min(0.05).max(3).catch(0.8),
        note: z.string().max(200).nullable().optional(),
      }),
    )
    .max(8),
});

const equipmentSchema = z.object({
  recognized: z.boolean(),
  name: z.string().max(120).nullable().optional(),
  what: z.string().max(600).nullable().optional(),
  setup: z.array(z.string().max(200)).max(6).default([]),
  how: z.array(z.string().max(200)).max(8).default([]),
  safety: z.array(z.string().max(200)).max(5).default([]),
  exercises: z.array(z.string().max(80)).max(8).default([]),
});

const LABEL_PROMPT = `You read nutrition labels from photos for a food tracker. Report only what is printed; never estimate or fill in missing numbers.
Answer with one JSON object and nothing else:
{"readable": boolean, "name": string|null, "brand": string|null, "serving_label": string|null, "serving_g": number|null,
 "per100": {"kcal","kj","protein","carbs","fat","fiber","sugar","sodium_mg","salt_g"} | null,
 "per_serving": {same keys} | null, "note": string|null}
Rules:
- per100 is the "per 100 g" or "per 100 ml" column. per_serving is the "per serving" or "amount per serving" column. Fill whichever columns are printed; use null for anything not printed.
- serving_g is the serving size in grams or ml, e.g. "2/3 cup (55g)" gives 55. If no gram or ml amount is printed, use null.
- kcal is food energy in kcal (US "Calories"). If only kJ is printed, put it in kj and set kcal to null.
- carbs is total carbohydrate. sodium_mg in milligrams; salt_g only if salt is printed instead of sodium.
- name and brand only if you can read them on the pack; otherwise null.
- If the photo isn't a nutrition label, or you can't read the numbers clearly, set readable to false and say why in note.`;

export function bellRoutes(db: ReturnType<typeof connect>, internal: (path: string, userId: string) => Promise<unknown>) {
  const { asUser } = db;
  const r = new Hono<AppEnv>();

  r.get('/status', async (c) => {
    const cfg = await aiConfigFor(db, c.get('userId'));
    const tts = Boolean(env.tts.baseUrl);
    if (!cfg) return c.json({ enabled: false, provider: null, model: null, source: null, tts });
    if ('error' in cfg) return c.json({ enabled: false, provider: null, model: null, source: 'yours', error: cfg.error, tts });
    return c.json({ enabled: true, provider: cfg.provider, model: cfg.model, source: cfg.source, tts });
  });

  /** The voices your speech server offers (Kokoro lists its own), and which one it uses by default. */
  r.get('/voices', async (c) => {
    if (!env.tts.baseUrl) return c.json({ server: false, voices: [], default: null });
    let voices: string[] = [];
    try {
      const res = await fetch(`${env.tts.baseUrl}/audio/voices`, { headers: ttsHeaders(), signal: AbortSignal.timeout(5000) });
      const data = (await res.json()) as { voices?: unknown };
      if (res.ok && Array.isArray(data.voices)) voices = data.voices.filter((v): v is string => typeof v === 'string' && TTS_VOICE.test(v)).slice(0, 200);
    } catch {
      return c.json({ server: true, reachable: false, voices: KOKORO_VOICES, default: env.tts.voice });
    }
    return c.json({ server: true, reachable: true, voices: voices.length ? voices : KOKORO_VOICES, default: env.tts.voice });
  });

  /**
   * Bell's words as speech from your speech server, as MP3. A GET, so the
   * app's audio player can stream it straight from this address.
   */
  r.get('/speak', async (c) => {
    if (!env.tts.baseUrl) return c.json({ error: 'No speech server is set up (TTS_BASE_URL).' }, 404);
    const text = (c.req.query('text') ?? '').trim().slice(0, 1500);
    const voice = c.req.query('voice') || env.tts.voice;
    const speed = Math.min(1.5, Math.max(0.6, Number(c.req.query('speed') ?? 1) || 1));
    if (!text) return c.json({ error: 'Nothing to say.' }, 400);
    if (!TTS_VOICE.test(voice)) return c.json({ error: 'Unknown voice.' }, 400);
    if (!mayspeak(c.get('userId'))) return c.json({ error: 'That’s a lot of speaking in a short time. Try again in a few minutes.' }, 429);
    let res: Response;
    try {
      res = await fetch(`${env.tts.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: ttsHeaders(),
        body: JSON.stringify({ model: env.tts.model, input: text, voice, response_format: 'mp3', speed }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      return c.json({ error: 'The speech server didn’t answer. Is it running?' }, 502);
    }
    if (!res.ok || !res.body) return c.json({ error: `The speech server answered ${res.status}.` }, 502);
    return new Response(res.body, { headers: { 'content-type': res.headers.get('content-type') ?? 'audio/mpeg', 'cache-control': 'private, max-age=3600' } });
  });

  r.post('/chat', async (c) => {
    const ai = await aiConfigFor(db, c.get('userId'));
    if (!ai) return c.json({ error: 'Bell needs an AI key. Add yours in Settings → Bell.' }, 503);
    if ('error' in ai) return c.json({ error: ai.error }, 503);
    const userId = c.get('profileId');
    if (!allowed(userId)) return c.json({ error: 'That’s a lot of messages in a short time. Try again in a few minutes.' }, 429);
    const parsed = bellChatSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Check the message.' }, 400);
    const { messages, today, meal, localTime, workoutId } = parsed.data;

    const [me] = await asUser(userId, (tx) => tx.select({ name: users.name, unit: users.weightUnit, prefs: users.preferences }).from(users).where(eq(users.id, userId)).limit(1));
    // Only the newest photo goes to the model; older ones are just mentioned.
    const window = messages.slice(-20);
    const lastImage = window.map((m) => Boolean(m.image)).lastIndexOf(true);
    const turns = window.map((m, i) => ({
      role: m.role,
      // Models reject empty turns; an assistant turn can be empty when it only asked a question.
      text: m.image && i !== lastImage ? `${m.text} [photo]` : m.text || (m.role === 'assistant' ? '(asked a question)' : ''),
      image: i === lastImage ? m.image : undefined,
    }));
    const prefs = preferencesSchema.parse(me?.prefs ?? {});
    let system = systemPrompt({ today, localTime, unit: me?.unit ?? 'lb', name: me?.name ?? null, prefs });
    // Asked from inside a workout: the session as it stands, so "next set?" needs no lookup.
    if (workoutId) {
      const w = await internal(`/api/workouts/${workoutId}`, userId).then((r) => (r as { workout: Workout }).workout, () => null);
      if (w) system += workoutContext(w, me?.unit ?? 'lb', localTime);
    }
    const cfg = { apiKey: ai.apiKey, model: ai.model, baseUrl: ai.baseUrl };
    const tools = toolsFor(prefs);
    const model = ai.format === 'anthropic' ? anthropic(cfg, system, turns, tools) : openai(cfg, system, turns, tools);

    const ctx: ToolContext = {
      call: (path: string) => internal(path, userId),
      today,
      meal,
      proposals: [] as FoodProposal[],
      prefs,
      // The last few things they said, so an amount given before a question still counts.
      userText: messages.filter((m) => m.role === 'user').slice(-3).map((m) => m.text).join('\n'),
      question: null as BellQuestion | null,
    };
    let results: { call: ToolCall; output: string }[] | undefined;
    let text = '';
    let unfinished = false;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const step = await model.step(results);
        text = step.text || text;
        unfinished = step.calls.length > 0;
        if (!step.calls.length) break;
        results = [];
        for (const tc of step.calls) {
          let output: string;
          try {
            output = await runTool(tc.name, tc.args, ctx);
          } catch (e) {
            output = `Tool failed: ${e instanceof Error ? e.message : String(e)}`;
          }
          results.push({ call: tc, output });
        }
        // A question means waiting for the person; another model call would only guess.
        if (ctx.question) {
          unfinished = false;
          break;
        }
      }
    } catch (e) {
      console.error('Bell:', e);
      return c.json({ error: e instanceof Error && e.message.startsWith('The AI service') ? e.message : 'Bell couldn’t reach the AI service. Check the server log.' }, 502);
    }
    const { proposals, question } = ctx;
    // Bell always answers with something you can act on, never an empty bubble.
    const fallback = question
      ? ''
      : proposals.length
        ? 'Here’s what I’d log. Check the amounts and tap Add.'
        : unfinished
          ? 'That took more steps than I’m allowed. Try asking about one thing at a time.'
          : 'I didn’t get an answer from the model. Try asking again, or rephrase it.';
    const body: BellReply = { reply: unfinished && !proposals.length ? fallback : text || fallback, proposals, question };
    return c.json(body);
  });

  /** Read a nutrition label photo. Nothing is saved: the app shows the numbers to check first. */
  r.post('/label', async (c) => {
    const ai = await aiConfigFor(db, c.get('userId'));
    if (!ai || 'error' in ai) return c.json({ error: ai && 'error' in ai ? ai.error : 'Reading labels needs Bell: add an AI key in Settings → Bell.' }, 503);
    const userId = c.get('profileId');
    if (!allowed(userId)) return c.json({ error: 'That’s a lot of requests in a short time. Try again in a few minutes.' }, 429);
    const parsed = labelSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Send a photo of the label.' }, 400);
    const cfg = { apiKey: ai.apiKey, model: ai.model, baseUrl: ai.baseUrl };
    const turns = [{ role: 'user' as const, text: 'Read this nutrition label.', image: parsed.data.image }];
    let answer: string;
    try {
      const model = ai.format === 'anthropic' ? anthropic(cfg, LABEL_PROMPT, turns, []) : openai(cfg, LABEL_PROMPT, turns, []);
      answer = (await model.step()).text;
    } catch (e) {
      console.error('Bell label:', e);
      return c.json({ error: 'Couldn’t reach the AI service. Type the numbers in instead.' }, 502);
    }
    const read = labelReadSchema.safeParse(extractJson(answer));
    if (!read.success) return c.json({ error: 'The model’s answer didn’t make sense. Try another photo, or type the numbers in.' }, 422);
    const result = labelToFood(read.data);
    if ('error' in result) return c.json({ error: result.error }, 422);
    return c.json(result);
  });

  /**
   * The foods on a plate, boxed in the photo, for measuring each with the
   * phone's LiDAR. Bell only finds and names them (and how dense they are);
   * the phone measures their size. Nothing is saved.
   */
  r.post('/plate', async (c) => {
    const ai = await aiConfigFor(db, c.get('userId'));
    if (!ai || 'error' in ai) return c.json({ error: ai && 'error' in ai ? ai.error : 'Scanning a plate uses Bell: add an AI key in Settings → Bell.' }, 503);
    if (!allowed(c.get('userId'))) return c.json({ error: 'That’s a lot of requests in a short time. Try again in a few minutes.' }, 429);
    const parsed = labelSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Send a photo of the plate.' }, 400);
    let answer = '';
    try {
      const cfg = { apiKey: ai.apiKey, model: ai.model, baseUrl: ai.baseUrl };
      const turns = [{ role: 'user' as const, text: 'Find each food on this plate.', image: parsed.data.image }];
      const model = ai.format === 'anthropic' ? anthropic(cfg, PLATE_PROMPT, turns, []) : openai(cfg, PLATE_PROMPT, turns, []);
      answer = (await model.step()).text;
    } catch (e) {
      console.error('Bell plate:', e);
      return c.json({ error: 'Couldn’t reach the AI service. Try again in a moment.' }, 502);
    }
    const read = plateSchema.safeParse(extractJson(answer));
    if (!read.success) return c.json({ error: 'Bell couldn’t make sense of that photo. Try again with the whole plate in view.' }, 422);
    const clamp = (n: number) => Math.min(1, Math.max(0, n > 1 && n <= 1000 ? n / 1000 : n)); // some models answer in thousandths
    const items = read.data.items
      .map((i) => {
        const [l, t, r2, b] = i.box.map(clamp) as [number, number, number, number];
        return { ...i, note: i.note ?? null, box: [Math.min(l, r2), Math.min(t, b), Math.max(l, r2), Math.max(t, b)] as [number, number, number, number] };
      })
      .filter((i) => i.box[2] - i.box[0] > 0.02 && i.box[3] - i.box[1] > 0.02);
    return c.json({ container: read.data.container ?? null, items });
  });

  /**
   * "What's this machine?": a photo of gym equipment. The model names it, says
   * what it's for and how to set it up and use it safely, and suggests
   * exercises; those are matched to your exercise library so you can open
   * their how-to pictures or add them to a workout.
   */
  r.post('/equipment', async (c) => {
    const ai = await aiConfigFor(db, c.get('userId'));
    if (!ai || 'error' in ai) return c.json({ error: ai && 'error' in ai ? ai.error : 'This uses Bell: add an AI key in Settings → Bell.' }, 503);
    if (!allowed(c.get('userId'))) return c.json({ error: 'That’s a lot of requests in a short time. Try again in a few minutes.' }, 429);
    const parsed = labelSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Send a photo of the equipment.' }, 400);
    let answer = '';
    try {
      const cfg = { apiKey: ai.apiKey, model: ai.model, baseUrl: ai.baseUrl };
      const turns = [{ role: 'user' as const, text: 'What is this gym equipment and how do I use it?', image: parsed.data.image }];
      const model = ai.format === 'anthropic' ? anthropic(cfg, EQUIPMENT_PROMPT, turns, []) : openai(cfg, EQUIPMENT_PROMPT, turns, []);
      answer = (await model.step()).text;
    } catch (e) {
      console.error('Bell equipment:', e);
      return c.json({ error: 'Couldn’t reach the AI service. Try again in a moment.' }, 502);
    }
    const read = equipmentSchema.safeParse(extractJson(answer));
    if (!read.success) return c.json({ error: 'Bell couldn’t make sense of that photo. Try one that shows the whole machine.' }, 422);
    const out = read.data;
    if (!out.recognized) return c.json({ recognized: false, name: null, what: out.what ?? 'That doesn’t look like gym equipment Bell can recognise. Try another angle that shows the whole thing.', setup: [], how: [], safety: [], exercises: [] });
    // Match the suggested exercises to the library (yours and the built-in ones), best first.
    const list = (await internal('/api/exercises', c.get('userId'))) as { exercises: { id: string; name: string; muscle: string; equipment: string; howToRef?: string | null; pictures?: number; library?: boolean }[] };
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const matched: typeof list.exercises = [];
    for (const want of out.exercises) {
      const w = norm(want);
      const words = w.split(' ').filter((x) => x.length > 2);
      const scored = list.exercises
        .map((e) => {
          const n = norm(e.name);
          const hits = words.filter((x) => n.includes(x)).length;
          return { e, score: n === w ? 100 : hits / Math.max(words.length, 1) + (e.library ? 0 : 0.05) + (e.pictures ? 0.05 : 0) };
        })
        .filter((x) => x.score >= 0.75 && !matched.some((m) => m.id === x.e.id))
        .sort((a, b) => b.score - a.score);
      if (scored[0]) matched.push(scored[0].e);
    }
    return c.json({ recognized: true, name: out.name, what: out.what, setup: out.setup, how: out.how, safety: out.safety, exercises: matched.slice(0, 6), suggested: out.exercises });
  });

  return r;
}

/** The workout in progress, in plain lines, for Bell's instructions. Weights in their unit. */
export function workoutContext(w: Workout, unit: 'lb' | 'kg', localTime?: string): string {
  const show = (kg: number | null) => (kg === null ? 'bodyweight' : `${Math.round((unit === 'lb' ? kg * 2.20462 : kg) * 2) / 2} ${unit}`);
  const set = (x: Workout['exercises'][number]['sets'][number]) =>
    `${x.warmup ? 'warm-up ' : ''}${x.seconds ? `${x.seconds} s` : `${show(x.weightKg)} × ${x.reps ?? '?'}`}${x.rpe ? ` @ RPE ${x.rpe}` : ''}`;
  const current = w.exercises.findIndex((e) => e.sets.some((x) => !x.done));
  // When the smallest jump is a big share of the weight (5 lb on a 15 lb raise), say so.
  const bigJump = (e: Workout['exercises'][number]) => {
    if (e.exercise.kind !== 'weight') return '';
    const working = [...e.sets.filter((x) => x.done && !x.warmup), ...e.previous.filter((x) => !x.warmup)].map((x) => x.weightKg ?? 0).filter((kg) => kg > 0);
    if (!working.length) return '';
    const kg = Math.max(...working);
    const jump = incrementKg(e.exercise.increment, unit);
    const share = jumpShare(kg, jump);
    if (share <= BIG_JUMP) return '';
    const ideas = progressIdeas(e.exercise).slice(0, 5).map((i) => i.title.toLowerCase()).join(', ');
    return `  the next jump (+${show(jump)}) is ${Math.round(share * 100)}% more than ${show(kg)}: a big step. Progress another way first: ${ideas}`;
  };
  const lines = w.exercises.map((e, i) => {
    const done = e.sets.filter((x) => x.done);
    const target = e.repMin ? ` (target ${e.targetSets ?? e.sets.length} sets of ${e.repMin}${e.repMax && e.repMax !== e.repMin ? `-${e.repMax}` : ''})` : '';
    return [
      `${i === current ? '-> NOW: ' : '- '}${e.exercise.name} [${e.exercise.muscle}, ${e.exercise.equipment}]${target}, rest ${e.restSeconds} s`,
      `  done: ${done.length ? done.map(set).join('; ') : 'nothing yet'}; ${e.sets.length - done.length} set(s) left`,
      e.previous.length ? `  last time: ${e.previous.map(set).join('; ')}` : '',
      e.pain ? `  they flagged pain here${e.painNote ? `: ${e.painNote}` : ''}` : '',
      bigJump(e),
    ].filter(Boolean).join('\n');
  });
  const minutes = Math.round((Date.now() - Date.parse(w.startedAt)) / 60000);
  return `

They're in the middle of a workout right now${localTime ? ` (${localTime})` : ''}, asking between sets. "${w.name}", started ${minutes} min ago:
${lines.join('\n') || '(no exercises yet)'}

In the workout:
- Answer in one to three short sentences; they're resting with the phone in their hand. Lead with the number or the answer.
- Next-set weight: base it on what they just did and the rep target. Hit the top of the range with reps to spare: add the smallest jump (${unit === 'lb' ? '5 lb for upper body, 10 lb for lower' : '2.5 kg for upper body, 5 kg for lower'}). Missed the bottom of the range or the last set was a grind: stay or drop about 10%. When unsure, stay.
- When the next weight jump is too big (marked above), they've stalled (no progress over the last few sessions; check get_exercise), or they ask how to keep progressing: suggest one way to progress besides weight (more reps, an extra set, a slow 3-4 s lowering, a pause at the bottom, 1½ reps, shorter rest, one side at a time, longer holds for timed exercises) or a harder variation by name (get_exercise lists them). One idea at a time, said plainly.
- Swaps: suggest a similar exercise for the same muscle with equipment they have, in plain names they can find in the library.
- Rest: usually 2-3 min for heavy compound lifts, 60-90 s for small isolation work.
- If they mention pain (not normal effort burn), tell them to stop that exercise, and suggest a pain-free alternative or calling it for today. Never push through pain.
- Use get_exercise for their records and older history when it helps.`;
}
