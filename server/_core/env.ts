/**
 * Environment variable access with startup validation.
 *
 * P0 Security: Fail fast if required secrets are absent (empty string / missing).
 * The platform injects JWT_SECRET as a cryptographically random value; we trust
 * the platform's entropy but still guard against completely missing values.
 *
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

// Validate critical secrets at module load time so the process exits immediately
// rather than failing silently at runtime.
const cookieSecret = requireEnv("JWT_SECRET");

// Warn if the secret is suspiciously short (< 16 chars) — not a hard failure
// because the platform injects a 22-char base64url value that is cryptographically
// random. Self-hosted deployments should use 32+ chars.
if (cookieSecret.length < 16) {
  console.error(
    `[ENV] WARNING: JWT_SECRET is only ${cookieSecret.length} characters. ` +
      "Use at least 32 random characters for production deployments."
  );
}

// CREDENTIAL_ENCRYPTION_KEY is used exclusively for encrypting provider API keys
// and DB credentials at rest. It is intentionally separate from the session secret
// so that rotating the session secret does not invalidate stored credentials.
// Falls back to the cookie secret for backward compatibility, but logs a warning.
let credentialEncryptionKey: string;
if (process.env.CREDENTIAL_ENCRYPTION_KEY && process.env.CREDENTIAL_ENCRYPTION_KEY.trim().length >= 16) {
  credentialEncryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
} else {
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[ENV] CREDENTIAL_ENCRYPTION_KEY is not set. " +
        "Falling back to JWT_SECRET for credential encryption. " +
        "Set CREDENTIAL_ENCRYPTION_KEY to a separate 32+ char secret in production " +
        "so that rotating the session secret does not invalidate stored credentials."
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
  ownerOpenId: optionalEnv("OWNER_OPEN_ID"),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: optionalEnv("BUILT_IN_FORGE_API_URL"),
  forgeApiKey: optionalEnv("BUILT_IN_FORGE_API_KEY"),
};
