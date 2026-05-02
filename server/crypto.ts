/**
 * Encryption helpers for securing API keys and credentials in the database.
 *
 * P0 Security fixes:
 *  - Replaced require("crypto") with static ESM import (was broken under native ESM)
 *  - Now uses ENV.credentialEncryptionKey (separate from the session secret) so that
 *    rotating the JWT session secret does not invalidate stored encrypted credentials
 *  - Added storeSecretHint() to avoid decrypting secrets just for list/display views
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { ENV } from "./_core/env";

/**
 * Derive a 32-byte AES key from the credential encryption key using SHA-256.
 * Uses ENV.credentialEncryptionKey (not the session cookie secret).
 */
function getEncryptionKey(): Buffer {
  return createHash("sha256").update(ENV.credentialEncryptionKey).digest();
}

export interface EncryptedValue {
  ciphertext: string; // hex-encoded
  iv: string;         // hex-encoded
  authTag: string;    // hex-encoded
}

/**
 * A non-sensitive display hint stored alongside encrypted secrets.
 * Avoids decrypting the secret just to show a masked version in list views.
 */
export interface SecretHint {
  keyPrefix: string; // first 4 chars of the plaintext
  keySuffix: string; // last 4 chars of the plaintext
  keyLength: number; // total length of the plaintext
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns the ciphertext, IV, and auth tag as hex strings.
 */
export function encryptSecret(plaintext: string): EncryptedValue {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    authTag,
  };
}

/**
 * Decrypt a ciphertext using AES-256-GCM.
 * Requires the IV and auth tag that were produced during encryption.
 */
export function decryptSecret(encrypted: EncryptedValue): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encrypted.iv, "hex");
  const authTag = Buffer.from(encrypted.authTag, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Produce a non-sensitive display hint from a plaintext secret.
 * Store this at write time so list views never need to decrypt.
 *
 * Example: "sk-abc...xyz" → { keyPrefix: "sk-a", keySuffix: "...xyz", keyLength: 51 }
 */
export function storeSecretHint(plaintext: string): SecretHint {
  const len = plaintext.length;
  return {
    keyPrefix: len >= 4 ? plaintext.slice(0, 4) : plaintext.slice(0, Math.floor(len / 2)),
    keySuffix: len >= 8 ? plaintext.slice(-4) : plaintext.slice(Math.ceil(len / 2)),
    keyLength: len,
  };
}

/**
 * Render a masked display string from a stored SecretHint.
 * Use this for list views instead of decrypting the secret.
 */
export function renderMaskedSecret(hint: SecretHint): string {
  if (hint.keyLength <= 8) return "••••••••";
  return `${hint.keyPrefix}${"•".repeat(Math.min(8, hint.keyLength - 8))}${hint.keySuffix}`;
}

/**
 * Legacy: mask a plaintext secret for display (kept for backward compatibility).
 * Prefer storeSecretHint + renderMaskedSecret to avoid decrypting for display.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return secret.slice(0, 4) + "••••••••" + secret.slice(-4);
}
