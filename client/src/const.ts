export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL — always uses direct Google OpenID Connect.
export const getLoginUrl = () => "/api/auth/login";
