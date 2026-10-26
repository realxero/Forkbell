function flag(name: string, fallback: boolean) {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  if (['1', 'true', 'on', 'yes'].includes(v)) return true;
  if (['0', 'false', 'off', 'no'].includes(v)) return false;
  throw new Error(`${name} must be on or off.`);
}

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
  /** Single sign-on (Authelia, or any OpenID Connect provider). Off when OIDC_ISSUER is empty. */
  oidc: process.env.OIDC_ISSUER
    ? {
        issuer: process.env.OIDC_ISSUER,
        clientId: required('OIDC_CLIENT_ID'),
        clientSecret: required('OIDC_CLIENT_SECRET'),
        /** What the sign-in button says: "Sign in with Authelia". */
        name: process.env.OIDC_NAME || 'Authelia',
      }
    : null,
  /** Username and password, for people who don't use the single sign-on. */
  password: {
    enabled: flag('PASSWORD_LOGIN', !process.env.OIDC_ISSUER),
    /** off: only people already here can add a password; code: new accounts need SIGNUP_CODE; open: anyone. */
    signup: (process.env.PASSWORD_SIGNUP || 'off') as 'off' | 'code' | 'open',
    signupCode: process.env.SIGNUP_CODE || '',
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
if (!env.oidc && !env.password.enabled) throw new Error('Turn on a way to sign in: set OIDC_ISSUER (Authelia) or PASSWORD_LOGIN=on.');
if (!['off', 'code', 'open'].includes(env.password.signup)) throw new Error('PASSWORD_SIGNUP must be off, code or open.');
if (env.password.signup === 'code' && env.password.signupCode.length < 8) throw new Error('PASSWORD_SIGNUP=code needs a SIGNUP_CODE of at least 8 characters.');
