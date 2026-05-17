import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { storeGoogleTokens } from "../pipeline/drive";

// ── Shared CSRF state store ───────────────────────────────────────────────────
// Short-lived in-memory state store for CSRF prevention (single-server personal app).
const googleStateStore = new Map<string, number>(); // state → expiry ms
const loginStateStore  = new Map<string, number>(); // state → expiry ms

function cleanStateStore(store: Map<string, number>) {
  const now = Date.now();
  for (const [k, v] of Array.from(store)) if (v < now) store.delete(k);
}

// ── Google Login (OpenID Connect) ─────────────────────────────────────────────
// Direct authentication — no Manus dependency.
// Uses openid+email+profile scope; Google sub becomes the user's openId.

export function registerLoginRoutes(app: Express) {
  if (!ENV.googleClientId || !ENV.googleClientSecret) {
    console.warn("[Login] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — direct Google login disabled");
    return;
  }

  app.get("/api/auth/login", (_req: Request, res: Response) => {
    cleanStateStore(loginStateStore);
    const state = randomBytes(16).toString("hex");
    loginStateStore.set(state, Date.now() + 10 * 60 * 1000); // 10 min TTL

    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: `${ENV.appUrl}/api/auth/login/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get("/api/auth/login/callback", async (req: Request, res: Response) => {
    const code  = typeof req.query.code  === "string" ? req.query.code  : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const error = typeof req.query.error === "string" ? req.query.error : undefined;

    if (error) {
      res.redirect(`/?login_error=${encodeURIComponent(error)}`);
      return;
    }
    if (!code || !state || !loginStateStore.has(state)) {
      res.status(400).send("Invalid or expired OAuth state. Please try again.");
      return;
    }
    loginStateStore.delete(state);

    try {
      // Exchange authorisation code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: `${ENV.appUrl}/api/auth/login/callback`,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) {
        const t = await tokenRes.text().catch(() => "");
        throw new Error(`Token exchange failed: ${tokenRes.status} ${t.slice(0, 200)}`);
      }
      const tokenData = await tokenRes.json() as { access_token: string; expires_in?: number };

      // Fetch user identity from Google
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userInfoRes.ok) throw new Error(`Failed to fetch user info: ${userInfoRes.status}`);
      const userInfo = await userInfoRes.json() as { id: string; email?: string; name?: string };

      if (!userInfo.id) throw new Error("Google userinfo response missing user id");

      const openId = `google:${userInfo.id}`;
      await db.upsertUser({
        openId,
        name: userInfo.name ?? null,
        email: userInfo.email ?? null,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: userInfo.name ?? "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (err: any) {
      console.error("[Google Login] Callback error:", err.message);
      res.redirect(`/?login_error=${encodeURIComponent(err.message)}`);
    }
  });
}

// ── Google Drive OAuth ────────────────────────────────────────────────────────

export function registerGoogleOAuthRoutes(app: Express) {
  if (!ENV.googleClientId || !ENV.googleClientSecret) return; // Drive not configured

  // Initiate OAuth flow
  app.get("/api/auth/google", (_req: Request, res: Response) => {
    cleanStateStore(googleStateStore);
    const state = randomBytes(16).toString("hex");
    googleStateStore.set(state, Date.now() + 10 * 60 * 1000); // 10 min TTL

    const params = new URLSearchParams({
      client_id: ENV.googleClientId,
      redirect_uri: `${ENV.appUrl}/api/auth/google/callback`,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.readonly",
      access_type: "offline",
      prompt: "consent", // always return refresh_token
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // OAuth callback — exchange code for tokens
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const error = typeof req.query.error === "string" ? req.query.error : undefined;

    if (error) {
      res.redirect(`/?google_error=${encodeURIComponent(error)}`);
      return;
    }
    if (!code || !state || !googleStateStore.has(state)) {
      res.status(400).send("Invalid or expired OAuth state. Please try again.");
      return;
    }
    googleStateStore.delete(state);

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: `${ENV.appUrl}/api/auth/google/callback`,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) {
        const t = await tokenRes.text().catch(() => "");
        throw new Error(`Token exchange failed: ${tokenRes.status} ${t.slice(0, 200)}`);
      }
      const data = await tokenRes.json() as any;
      await storeGoogleTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in ?? 3600,
        scope: data.scope,
      });
      res.redirect("/?google_connected=1");
    } catch (err: any) {
      console.error("[Google OAuth] Callback error:", err.message);
      res.redirect(`/?google_error=${encodeURIComponent(err.message)}`);
    }
  });
}
