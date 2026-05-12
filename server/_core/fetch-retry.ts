/**
 * Resilient fetch utilities for handling temporary network outages.
 *
 * Distinguishes two failure modes with separate retry budgets:
 *
 * NETWORK ERRORS (gateway down, DNS failure, connection refused/reset)
 *   Retries up to 9 times over ~6.25 minutes so the pipeline survives a
 *   daily ~5-minute gateway reset without failing jobs.
 *   Each attempt gets its own timeout so the window is purely the delay budget.
 *
 * HTTP 5xx / 429 ERRORS (transient server blips)
 *   Short exponential back-off (≤ 15 s) — fast-fail if the server is
 *   genuinely broken rather than the local network being temporarily absent.
 */

// ── Retry budgets ─────────────────────────────────────────────────────────────

/**
 * Delays between network-error retries (milliseconds).
 * Cumulative: 5+10+20+40+60+60+60+60+60 = 375 s ≈ 6.25 min.
 * Provides a comfortable margin over the typical 5-minute gateway reset window.
 */
export const NETWORK_RETRY_DELAYS_MS = [
  5_000, 10_000, 20_000, 40_000,
  60_000, 60_000, 60_000, 60_000, 60_000,
] as const;

/** HTTP status codes that indicate a transient server state worth retrying. */
export const RETRYABLE_HTTP_STATUS = new Set([429, 502, 503, 504]);

/** Delays between HTTP-error retries (milliseconds). */
const HTTP_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;

/**
 * Per-attempt wall-clock timeout (ms).
 * Network errors fail near-instantly so this budget is only consumed by
 * genuinely slow or hung inference servers / large Drive downloads.
 */
export const PER_ATTEMPT_TIMEOUT_MS = 120_000; // 2 min

// ── Helpers ───────────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Returns true when `err` is a low-level network failure that is likely to
 * resolve once the gateway comes back online.
 *
 * Distinguishes these from:
 *   - AbortError  — our own per-attempt timeout fired
 *   - HTTP errors — the server responded but with a bad status
 *   - Auth / parse errors — not transient
 */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, any>;
  if (e.name === "AbortError") return false; // our timeout — not a network issue
  const code: string | undefined = e.cause?.code ?? e.code;
  if (code) {
    return /^(ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|ENETUNREACH|ENETDOWN|EAI_AGAIN|ECONNABORTED)$/.test(code);
  }
  // Node's undici (fetch) throws TypeError("fetch failed") for all network errors
  return e.name === "TypeError" && typeof e.message === "string" && /fetch failed/i.test(e.message);
}

// ── Core retry loop ───────────────────────────────────────────────────────────

/**
 * Drop-in replacement for `fetch` that retries on network failures and
 * retriable HTTP status codes.
 *
 * The `signal` field is intentionally omitted from `init` — each attempt gets
 * its own fresh `AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS)` so retries are
 * not penalised by a shared timeout that was created before the loop started.
 *
 * If you need a caller-side cancellation signal, pass it separately via
 * `fetchWithRetryAndCancel`.
 */
export async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, "signal">,
): Promise<Response> {
  let networkAttempt = 0;
  let httpAttempt = 0;

  for (;;) {
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
      });

      if (res.ok || !RETRYABLE_HTTP_STATUS.has(res.status)) return res;

      const errText = await res.text().catch(() => "");
      const delay = HTTP_RETRY_DELAYS_MS[httpAttempt++];
      if (delay === undefined) throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      console.warn(`[fetch] HTTP ${res.status}, waiting ${delay / 1_000}s before retry ${httpAttempt}…`);
      await sleep(delay);

    } catch (err: any) {
      if (err?.name === "AbortError") throw err; // per-attempt timeout — don't retry

      if (isNetworkError(err)) {
        const delay = NETWORK_RETRY_DELAYS_MS[networkAttempt++];
        if (delay === undefined) throw err; // exhausted network retry budget
        console.warn(
          `[fetch] Network error (${err.message?.slice(0, 80)}), ` +
          `waiting ${delay / 1_000}s before retry ${networkAttempt}/${NETWORK_RETRY_DELAYS_MS.length}…`,
        );
        await sleep(delay);
      } else {
        throw err; // auth failure, parse error, etc. — not transient
      }
    }
  }
}
