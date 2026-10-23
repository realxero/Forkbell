// A stand-in AI service for testing Bell without a real model or API key.
// Speaks both the OpenAI and Anthropic formats and follows a fixed script:
//   "what did I eat"  -> calls get_day, then answers from the result
//   "log ..."         -> calls search_foods, then proposes an entry
//   a photo           -> proposes two estimated foods
//   "bad label"       -> proposes impossible numbers (Bell must refuse them)
// Run: node scripts/mock-ai.mjs 8787
import http from 'node:http';

const port = Number(process.argv[2] || 8787);
const lastUser = (msgs) => [...msgs].reverse().find((m) => m.role === 'user');
const textOf = (m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((c) => c.text || '').join(' '));
const hasImage = (m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'image' || c.type === 'image_url');

function plan(messages, toolResults) {
  const user = lastUser(messages.filter((m) => !(Array.isArray(m.content) && m.content.some((c) => c.type === 'tool_result'))));
  const text = textOf(user).toLowerCase();
  const n = toolResults.length;
  if (hasImage(user)) {
    if (n === 0) return { call: ['propose_food_entries', { items: [
      { name: 'Grilled chicken breast', grams: 150, per100: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, estimate: true, note: 'assumed a palm-sized piece' },
      { name: 'White rice', grams: 180, per100: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, estimate: true },
    ] }] };
    return { text: 'Chicken and rice, about 520 kcal. Check the amounts.' };
  }
  if (text.includes('bad label')) {
    if (n === 0) return { call: ['propose_food_entries', { items: [{ name: 'Mystery bar', grams: 60, per100: { kcal: 250, protein: 60, carbs: 30, fat: 10 }, estimate: false }] }] };
    return { text: `Tool said: ${toolResults.at(-1)}` };
  }
  if (text.includes('what did i eat')) {
    if (n === 0) return { call: ['get_day', { date: '__TODAY__' }] };
    const day = JSON.parse(toolResults.at(-1));
    return { text: `You logged ${day.entries.length} foods for ${day.totals.kcal} kcal: ${day.entries.map((e) => e.name).join(', ')}.` };
  }
  if (text.startsWith('log')) {
    if (n === 0) return { call: ['search_foods', { query: 'banana' }] };
    if (n === 1) {
      const found = JSON.parse(toolResults.at(-1));
      const banana = found.mine.find((f) => f.name === 'Banana');
      return { call: ['propose_food_entries', { items: [{ name: 'Banana', grams: 118, food_id: banana.id, meal: 'snacks' }] }] };
    }
    return { text: 'Here’s a medium banana for your snacks.' };
  }
  return { text: 'Hi, I’m Bell.' };
}

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      const anthropic = req.url.includes('/v1/messages');
      const msgs = b.messages || [];
      const today = (b.system || textOf(msgs[0] || {})).match(/Today is (\d{4}-\d{2}-\d{2})/)?.[1];
      // Tool results so far in this exchange, in order.
      const results = anthropic
        ? msgs.flatMap((m) => (Array.isArray(m.content) ? m.content.filter((c) => c.type === 'tool_result').map((c) => c.content) : []))
        : msgs.filter((m) => m.role === 'tool').map((m) => m.content);
      const lastUserIdx = anthropic
        ? msgs.map((m) => m.role === 'user' && !(Array.isArray(m.content) && m.content.some((c) => c.type === 'tool_result'))).lastIndexOf(true)
        : msgs.map((m) => m.role === 'user').lastIndexOf(true);
      const fresh = anthropic
        ? msgs.slice(lastUserIdx).flatMap((m) => (Array.isArray(m.content) ? m.content.filter((c) => c.type === 'tool_result').map((c) => c.content) : []))
        : msgs.slice(lastUserIdx).filter((m) => m.role === 'tool').map((m) => m.content);
      void results;
      const step = plan(msgs.slice(lastUserIdx), fresh);
      if (step.call && step.call[1].date === '__TODAY__') step.call[1].date = today;
      res.setHeader('content-type', 'application/json');
      const id = `call_${Math.random().toString(36).slice(2, 8)}`;
      if (anthropic) {
        res.end(JSON.stringify({ content: step.call ? [{ type: 'tool_use', id, name: step.call[0], input: step.call[1] }] : [{ type: 'text', text: step.text }], stop_reason: step.call ? 'tool_use' : 'end_turn' }));
      } else {
        res.end(JSON.stringify({ choices: [{ message: step.call ? { content: null, tool_calls: [{ id, type: 'function', function: { name: step.call[0], arguments: JSON.stringify(step.call[1]) } }] } : { content: step.text } }] }));
      }
    });
  })
  .listen(port, () => console.log(`mock AI on :${port}`));
