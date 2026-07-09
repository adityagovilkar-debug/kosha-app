import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Server-only. Never import this from a "use client" file or an app/
// route that ships to the browser — it reads a secret from process.env
// that must never be exposed client-side.
//
// Encrypts the user's own Anthropic API key at rest (KOSHA-PLAN.md §8:
// "stored server-side ... encrypted column — never in client bundle").
// AES-256-GCM with a key derived from KOSHA_ENCRYPTION_KEY (set in
// .env.local, generate once with: openssl rand -hex 32).

function getKey(): Buffer {
  const secret = process.env.KOSHA_ENCRYPTION_KEY;
  if (!secret) throw new Error("KOSHA_ENCRYPTION_KEY is not set");
  // scrypt with a static salt is fine here — the secret itself is high
  // entropy (32 random bytes), this just shapes it into a 256-bit key.
  return scryptSync(secret, "kosha-static-salt", 32);
}

/** Returns "iv:authTag:ciphertext", each hex-encoded. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, authTagHex, ciphertextHex] = payload.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error("Malformed encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}
