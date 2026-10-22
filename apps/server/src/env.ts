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
  webDir: process.env.WEB_DIR ?? null,
  secureCookies: publicUrl.startsWith('https://'),
};

if (env.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
