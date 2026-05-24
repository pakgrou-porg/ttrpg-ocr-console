import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { ENV } from "../_core/env";
import { fetchWithRetry, isNetworkError, sleep, NETWORK_RETRY_DELAYS_MS } from "../_core/fetch-retry";
import { encryptSecret, decryptSecret } from "../crypto";
import { getDb } from "../db";
import { googleOAuthTokens } from "../../drizzle/schema";
import { desc, eq } from "drizzle-orm";

// ── Token management ──────────────────────────────────────────────────────────

interface TokenRow {
  encryptedAccessToken: string | null;
  accessTokenIv: string | null;
  accessTokenAuthTag: string | null;
  encryptedRefreshToken: string | null;
  refreshTokenIv: string | null;
  refreshTokenAuthTag: string | null;
  expiresAt: Date | null;
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetchWithRetry("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token refresh failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);
  return { accessToken: data.access_token, expiresAt };
}

export async function getGoogleAccessToken(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(googleOAuthTokens).orderBy(desc(googleOAuthTokens.id)).limit(1);
  const row = rows[0] as TokenRow | undefined;
  if (!row?.encryptedRefreshToken) throw new Error("Google Drive not connected. Authorize via Settings.");

  const refreshToken = decryptSecret({
    ciphertext: row.encryptedRefreshToken,
    iv: row.refreshTokenIv ?? "",
    authTag: row.refreshTokenAuthTag ?? "",
  });

  // Return cached access token if still valid (5-minute buffer)
  const now = new Date(Date.now() + 5 * 60 * 1000);
  if (row.encryptedAccessToken && row.expiresAt && row.expiresAt > now) {
    return decryptSecret({
      ciphertext: row.encryptedAccessToken,
      iv: row.accessTokenIv ?? "",
      authTag: row.accessTokenAuthTag ?? "",
    });
  }

  // Refresh
  const { accessToken, expiresAt } = await refreshAccessToken(refreshToken);
  const enc = encryptSecret(accessToken);
  await db.update(googleOAuthTokens)
    .set({
      encryptedAccessToken: enc.ciphertext,
      accessTokenIv: enc.iv,
      accessTokenAuthTag: enc.authTag,
      expiresAt,
    })
    .where(eq(googleOAuthTokens.id, (rows[0] as any).id));

  return accessToken;
}

export async function isGoogleConnected(): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: googleOAuthTokens.id, r: googleOAuthTokens.encryptedRefreshToken })
    .from(googleOAuthTokens).limit(1);
  return rows.length > 0 && !!rows[0].r;
}

export async function storeGoogleTokens(opts: {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn: number;
  scope?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const encAccess = encryptSecret(opts.accessToken);
  const expiresAt = new Date(Date.now() + opts.expiresIn * 1000);

  const existing = await db.select().from(googleOAuthTokens).limit(1);

  if (existing.length > 0) {
    // Always update the access token. Only overwrite the refresh token when
    // Google returns a new one — re-auth without revoking may omit it.
    const refreshFields = opts.refreshToken
      ? (() => {
          const enc = encryptSecret(opts.refreshToken);
          return {
            encryptedRefreshToken: enc.ciphertext,
            refreshTokenIv: enc.iv,
            refreshTokenAuthTag: enc.authTag,
          };
        })()
      : {};
    await db.update(googleOAuthTokens)
      .set({
        encryptedAccessToken: encAccess.ciphertext,
        accessTokenIv: encAccess.iv,
        accessTokenAuthTag: encAccess.authTag,
        expiresAt,
        scope: opts.scope ?? null,
        ...refreshFields,
      })
      .where(eq(googleOAuthTokens.id, existing[0].id));
  } else {
    if (!opts.refreshToken) throw new Error("Refresh token required for initial Google OAuth setup.");
    const encRefresh = encryptSecret(opts.refreshToken);
    await db.insert(googleOAuthTokens).values({
      encryptedAccessToken: encAccess.ciphertext,
      accessTokenIv: encAccess.iv,
      accessTokenAuthTag: encAccess.authTag,
      encryptedRefreshToken: encRefresh.ciphertext,
      refreshTokenIv: encRefresh.iv,
      refreshTokenAuthTag: encRefresh.authTag,
      expiresAt,
      scope: opts.scope ?? null,
    });
  }
}

export async function clearGoogleTokens(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(googleOAuthTokens);
}

// ── File operations ───────────────────────────────────────────────────────────

export async function downloadDriveFile(fileId: string, destPath: string): Promise<string> {
  let networkAttempt = 0;
  for (;;) {
    // Re-fetch a fresh access token on every attempt — it may have been refreshed
    // during a long network-down period, or the previous token may have expired.
    const token = await getGoogleAccessToken();
    try {
      const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Drive download failed: ${res.status} ${text.slice(0, 200)}`);
      }
      await pipeline(Readable.fromWeb(res.body as any), createWriteStream(destPath));
      return destPath;
    } catch (err: unknown) {
      // fetchWithRetry already exhausted its network budget for the fetch phase;
      // this outer loop handles stream-level failures (pipe broken mid-transfer).
      if (isNetworkError(err)) {
        const delay = NETWORK_RETRY_DELAYS_MS[networkAttempt++];
        if (delay === undefined) throw err;
        console.warn(
          `[drive] Stream error on ${fileId} (${(err as any)?.message?.slice(0, 80)}), ` +
          `waiting ${delay / 1_000}s before retry ${networkAttempt}/${NETWORK_RETRY_DELAYS_MS.length}…`,
        );
        await sleep(delay);
      } else {
        throw err;
      }
    }
  }
}

export async function getDriveFileName(fileId: string): Promise<string> {
  const token = await getGoogleAccessToken();
  const res = await fetchWithRetry(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive metadata fetch failed: ${res.status}`);
  const data = await res.json() as any;
  return data.name ?? fileId;
}

export async function deleteLocalFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // best-effort cleanup
  }
}
