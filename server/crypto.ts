import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { ENV } from "./_core/env";

/**
 * Encryption helpers for securing API keys and credentials in the database.
 * Uses AES-256-GCM with the JWT_SECRET as the encryption key (derived via SHA-256).
 */

function getEncryptionKey(): Buffer {
  // Derive a 32-byte key from JWT_SECRET using SHA-256
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(ENV.cookieSecret).digest();
}

export interface EncryptedValue {
  ciphertext: string; // hex-encoded
  iv: string; // hex-encoded
  authTag: string; // hex-encoded
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
 * Mask a secret for display purposes (show first 4 and last 4 chars).
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return "••••••••";
  return secret.slice(0, 4) + "••••••••" + secret.slice(-4);
}
