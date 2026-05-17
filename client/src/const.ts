export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

type RuntimeConfig = { VITE_APP_ID?: string; VITE_OAUTH_PORTAL_URL?: string };
const rc = (window as any).__RUNTIME_CONFIG__ as RuntimeConfig | undefined;

function getEnv(key: keyof RuntimeConfig): string {
  return rc?.[key] || import.meta.env[key] || "";
}

// Generate login URL at runtime so redirect URI reflects the current origin.
// Prefers Manus OAuth when configured; falls back to direct Google login.
export const getLoginUrl = () => {
  const oauthPortalUrl = getEnv("VITE_OAUTH_PORTAL_URL");
  const appId = getEnv("VITE_APP_ID");

  if (oauthPortalUrl && appId) {
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);
    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    return url.toString();
  }

  // Self-hosted without Manus — use direct Google login
  return "/api/auth/login";
};
