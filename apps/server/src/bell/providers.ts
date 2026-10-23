// Two wire formats cover every model Bell can use: Anthropic's Messages API,
// and OpenAI's Chat Completions (which Ollama, LM Studio, OpenRouter and many
// others also speak). Each turns our neutral conversation into its own format.

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}
export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** data: URL of a JPEG/PNG, only on the latest user turn */
  image?: string;
}
export interface Step {
  text: string;
  calls: ToolCall[];
}

export interface Provider {
  /** One model call. Pass the tool results from the previous step, if any. */
  step(results?: { call: ToolCall; output: string }[]): Promise<Step>;
}

type Config = { apiKey: string; model: string; baseUrl: string };

const parseDataUrl = (url: string) => {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(url);
  return m ? { mediaType: m[1]!, data: m[2]! } : null;
};

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`The AI service answered ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

export function anthropic(cfg: Config, system: string, turns: ChatTurn[], tools: ToolSpec[]): Provider {
  const messages: unknown[] = turns.map((t) => {
    const img = t.image ? parseDataUrl(t.image) : null;
    return {
      role: t.role,
      content: img
        ? [{ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }, { type: 'text', text: t.text || 'What is in this photo?' }]
        : t.text,
    };
  });
  return {
    async step(results) {
      if (results?.length) {
        messages.push({ role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.call.id, content: r.output })) });
      }
      const data = await post(
        `${cfg.baseUrl || 'https://api.anthropic.com'}/v1/messages`,
        { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        {
          model: cfg.model,
          max_tokens: 1500,
          system,
          messages,
          // Some APIs reject an empty tool list, so leave it out when there are none.
          ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
        },
      );
      const content = (data.content as { type: string; text?: string; id?: string; name?: string; input?: unknown }[]) ?? [];
      messages.push({ role: 'assistant', content });
      return {
        text: content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim(),
        calls: content.filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id!, name: c.name!, args: c.input })),
      };
    },
  };
}

export function openai(cfg: Config, system: string, turns: ChatTurn[], tools: ToolSpec[]): Provider {
  const messages: unknown[] = [
    { role: 'system', content: system },
    ...turns.map((t) => ({
      role: t.role,
      content: t.image ? [{ type: 'text', text: t.text || 'What is in this photo?' }, { type: 'image_url', image_url: { url: t.image } }] : t.text,
    })),
  ];
  return {
    async step(results) {
      for (const r of results ?? []) messages.push({ role: 'tool', tool_call_id: r.call.id, content: r.output });
      const data = await post(
        `${cfg.baseUrl || 'https://api.openai.com/v1'}/chat/completions`,
        cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
        {
          model: cfg.model,
          messages,
          ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
        },
      );
      const msg = ((data.choices as { message?: Record<string, unknown> }[])?.[0]?.message ?? {}) as {
        content?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
      messages.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
      return {
        text: (msg.content ?? '').trim(),
        calls: (msg.tool_calls ?? []).map((c) => {
          let args: unknown = {};
          try {
            args = JSON.parse(c.function.arguments || '{}');
          } catch {
            args = { _unparsed: c.function.arguments };
          }
          return { id: c.id, name: c.function.name, args };
        }),
      };
    },
  };
}
