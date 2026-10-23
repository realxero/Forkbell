// Which AI Bell uses for someone: the provider and key they set in the app,
// or the server's own (AI_PROVIDER etc. in the stack) if they haven't.
import { eq } from 'drizzle-orm';
import { aiSettings, type connect } from '@forkbell/db';
import { env } from '../env.ts';
import { open } from '../secret-box.ts';

export const PROVIDERS = {
  gemini: { label: 'Google Gemini', format: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  anthropic: { label: 'Anthropic (Claude)', format: 'anthropic', baseUrl: 'https://api.anthropic.com' },
  openai: { label: 'OpenAI', format: 'openai', baseUrl: 'https://api.openai.com/v1' },
  custom: { label: 'Your own server (OpenAI-compatible)', format: 'openai', baseUrl: '' },
} as const;
export type ProviderName = keyof typeof PROVIDERS;

/** A custom server URL lets the server fetch any address, so it's only allowed when the stack says so. */
export const customAllowed = () => process.env.AI_ALLOW_CUSTOM_URL === 'true';

export interface AiConfig {
  format: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  baseUrl: string;
  source: 'yours' | 'server';
  provider: ProviderName | 'server';
}

export async function aiConfigFor(db: ReturnType<typeof connect>, userId: string): Promise<AiConfig | { error: string } | null> {
  const [row] = await db.asUser(userId, (tx) => tx.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1));
  if (row) {
    const p = PROVIDERS[row.provider];
    const apiKey = row.keyCiphertext ? open(row.keyCiphertext) : '';
    if (apiKey === null) return { error: 'Your AI key needs entering again (the server’s secret changed). Settings → Bell.' };
    if (row.provider !== 'custom' && !apiKey) return { error: 'Add your API key in Settings → Bell.' };
    if (row.provider === 'custom' && !customAllowed()) return { error: 'Custom AI servers are turned off on this server.' };
    return { format: p.format, apiKey: apiKey ?? '', model: row.model, baseUrl: row.provider === 'custom' ? (row.baseUrl ?? '') : p.baseUrl, source: 'yours', provider: row.provider };
  }
  if (env.ai.provider) {
    return { format: env.ai.provider, apiKey: env.ai.apiKey, model: env.ai.model, baseUrl: env.ai.baseUrl, source: 'server', provider: 'server' };
  }
  return null;
}

/** The models a key can use, newest-looking first. Also proves the key works. */
export async function listModels(format: 'anthropic' | 'openai', baseUrl: string, apiKey: string, provider: ProviderName): Promise<string[]> {
  const url = format === 'anthropic' ? `${baseUrl}/v1/models?limit=100` : `${baseUrl.replace(/\/$/, '')}/models`;
  const headers: Record<string, string> = format === 'anthropic' ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) throw new Error('That key was refused. Check it and try again.');
  if (!res.ok) throw new Error(`The AI service answered ${res.status}.`);
  const data = (await res.json()) as { data?: { id: string }[] };
  let ids = (data.data ?? []).map((m) => m.id.replace(/^models\//, ''));
  // Only chat models that can see photos and use tools.
  if (provider === 'gemini') ids = ids.filter((id) => id.startsWith('gemini') && !/embedding|imagen|tts|image|audio|live|aqa/i.test(id));
  if (provider === 'openai') ids = ids.filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/audio|realtime|search|transcribe|tts|image|instruct/i.test(id));
  if (provider === 'anthropic') ids = ids.filter((id) => id.startsWith('claude'));
  return [...new Set(ids)].sort((a, b) => b.localeCompare(a)).slice(0, 40);
}
