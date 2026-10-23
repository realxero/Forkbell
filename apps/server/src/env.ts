function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. See .env.example.`);
  return v;
}

const publicUrl = required('PUBLIC_URL').replace(/\/$/, '');

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  publicUrl,
  /** Where the web app lives; in dev the Expo server is on another port. */
  appUrl: (process.env.APP_URL ?? publicUrl).replace(/\/$/, ''),
  sessionSecret: required('SESSION_SECRET'),
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  oidc: {
    issuer: required('OIDC_ISSUER'),
    clientId: required('OIDC_CLIENT_ID'),
    clientSecret: required('OIDC_CLIENT_SECRET'),
  },
  usdaApiKey: process.env.USDA_API_KEY || null,
  /** Bell, the assistant. Off unless a provider is set. */
  ai: {
    provider: (process.env.AI_PROVIDER || null) as 'anthropic' | 'openai' | null,
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || (process.env.AI_PROVIDER === 'anthropic' ? 'claude-sonnet-5-5' : ''),
    /** for OpenAI-compatible servers (Ollama, LM Studio, OpenRouter...) or a proxy */
    baseUrl: (process.env.AI_BASE_URL || '').replace(/\/$/, ''),
  },
  webDir: process.env.WEB_DIR ?? null,
  secureCookies: publicUrl.startsWith('https://'),
};

if (env.ai.provider && !['anthropic', 'openai'].includes(env.ai.provider)) throw new Error('AI_PROVIDER must be anthropic or openai (use openai for any OpenAI-compatible server).');
if (env.ai.provider === 'openai' && !env.ai.model) throw new Error('Set AI_MODEL to the model Bell should use.');
if (env.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
