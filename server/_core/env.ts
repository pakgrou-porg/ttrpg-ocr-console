/**
 * Environment variable access with startup validation.
 *
 * P0 Security: Fail fast if required secrets are absent.
 * For self-hosted deployments, set JWT_SECRET to at least 32 random characters
 * and CREDENTIAL_ENCRYPTION_KEY to a separate 32+ character value.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[ENV] Required environment variable "${key}" is missing or empty. ` +
        `Set it before starting the server.`
    );
  }
  return value;
}

function optionalEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

const cookieSecret = requireEnv("JWT_SECRET");

if (cookieSecret.length < 16) {
  console.error(
    `[ENV] WARNING: JWT_SECRET is only ${cookieSecret.length} characters. ` +
      "Use at least 32 random characters for production deployments."
  );
}

let credentialEncryptionKey: string;
if (process.env.CREDENTIAL_ENCRYPTION_KEY && process.env.CREDENTIAL_ENCRYPTION_KEY.trim().length >= 16) {
  credentialEncryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
} else {
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[ENV] CREDENTIAL_ENCRYPTION_KEY is not set. " +
        "Falling back to JWT_SECRET for credential encryption. " +
        "Set CREDENTIAL_ENCRYPTION_KEY to a separate 32+ char secret in production."
    );
  }
  credentialEncryptionKey = cookieSecret;
}

export const ENV = {
  appId: optionalEnv("VITE_APP_ID"),
  cookieSecret,
  credentialEncryptionKey,
  databaseUrl: optionalEnv("DATABASE_URL"),
  oAuthServerUrl: optionalEnv("OAUTH_SERVER_URL"),
  oAuthPortalUrl: optionalEnv("VITE_OAUTH_PORTAL_URL", "https://manus.im"),
  ownerOpenId: optionalEnv("OWNER_OPEN_ID"),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: optionalEnv("BUILT_IN_FORGE_API_URL"),
  forgeApiKey: optionalEnv("BUILT_IN_FORGE_API_KEY"),
  // Supabase REST API — used for storage, realtime, and future edge function calls
  supabaseUrl: optionalEnv("SUPABASE_URL"),
  supabaseAnonKey: optionalEnv("SUPABASE_ANON_KEY"),
  supabaseServiceKey: optionalEnv("SUPABASE_SERVICE_KEY"),
};
