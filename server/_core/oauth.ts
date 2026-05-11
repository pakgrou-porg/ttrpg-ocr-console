import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { storeGoogleTokens } from "../pipeline/drive";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
// Short-lived in-memory state store for CSRF prevention (single-server personal app).
const googleStateStore = new Map<string, number>(); // state → expiry ms

function cleanGoogleState() {
  const now = Date.now();
  for (const [k, v] of googleStateStore) if (v < now) googleStateStore.delete(k);
}

export function registerGoogleOAuthRoutes(app: Express) {
  if (!ENV.googleClientId || !ENV.googleClientSecret) return; // Drive not configured

  // Initiate OAuth flow
  app.get("/api/auth/google", (_req: Request, res: Response) => {
    cleanGoogleState();
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

// ── Manus OAuth ───────────────────────────────────────────────────────────────

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
