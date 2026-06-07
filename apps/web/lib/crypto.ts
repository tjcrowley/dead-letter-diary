/**
 * Client-side cryptographic operations for Dead Letter Diary.
 *
 * Uses Web Crypto API exclusively — no third-party crypto libraries.
 *
 * Key hierarchy:
 *   DMK (Diary Master Key) — AES-GCM 256-bit, encrypts/decrypts diary entries
 *   Wrapping key — derived via HKDF from XOR(deviceShard, serverShard)
 *   Device shard — from WebAuthn PRF output or PBKDF2(passphrase)
 *   Server shard — stored server-side, fetched at unlock time
 */

const HKDF_INFO = new TextEncoder().encode("dead-letter-diary-dmk-wrap");

// ---------------------------------------------------------------------------
// DMK generation
// ---------------------------------------------------------------------------

/**
 * Generate a fresh Diary Master Key.
 * Extractable = true so it can be wrapped (exported via wrapKey).
 * After wrapping, the unwrapped copy will be non-extractable.
 */
export async function generateDmk(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable — needed for wrapKey
    ["encrypt", "decrypt"]
  );
}

// ---------------------------------------------------------------------------
// Shard XOR
// ---------------------------------------------------------------------------

/**
 * Byte-wise XOR of two equal-length Uint8Arrays.
 * Used to combine device shard + server shard into HKDF input keying material.
 */
export function xorShards(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new Error(`Shard length mismatch: ${a.length} vs ${b.length}`);
  }
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

// ---------------------------------------------------------------------------
// HKDF wrapping key derivation (internal)
// ---------------------------------------------------------------------------

async function deriveWrappingKey(
  deviceShard: Uint8Array,
  serverShard: Uint8Array,
  hkdfSalt: Uint8Array
): Promise<CryptoKey> {
  const ikm = xorShards(deviceShard, serverShard);

  // Import XOR'd shards as HKDF base key — MUST be non-extractable per Web Crypto spec
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    ikm,
    "HKDF",
    false, // extractable must be false for HKDF
    ["deriveKey"]
  );

  // Derive AES-GCM wrapping key via HKDF-SHA256
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: hkdfSalt,
      info: HKDF_INFO,
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

// ---------------------------------------------------------------------------
// DMK wrap / unwrap
// ---------------------------------------------------------------------------

interface WrapResult {
  wrappedDmk: ArrayBuffer;
  wrapIv: Uint8Array;
}

/**
 * Wrap (encrypt) the DMK for storage.
 * Returns the wrapped key bytes and the IV used.
 */
export async function wrapDmk(
  dmk: CryptoKey,
  deviceShard: Uint8Array,
  serverShard: Uint8Array,
  hkdfSalt: Uint8Array
): Promise<WrapResult> {
  const wrappingKey = await deriveWrappingKey(deviceShard, serverShard, hkdfSalt);
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));

  const wrappedDmk = await crypto.subtle.wrapKey("raw", dmk, wrappingKey, {
    name: "AES-GCM",
    iv: wrapIv,
  });

  return { wrappedDmk, wrapIv };
}

/**
 * Unwrap (decrypt) the DMK from storage.
 * The resulting key is NON-extractable — it can only be used for encrypt/decrypt,
 * never exported again (CRYPT-08).
 */
export async function unwrapDmk(
  wrappedDmk: ArrayBuffer,
  wrapIv: Uint8Array,
  deviceShard: Uint8Array,
  serverShard: Uint8Array,
  hkdfSalt: Uint8Array
): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(deviceShard, serverShard, hkdfSalt);

  return crypto.subtle.unwrapKey(
    "raw",
    wrappedDmk,
    wrappingKey,
    { name: "AES-GCM", iv: wrapIv },
    { name: "AES-GCM", length: 256 },
    false, // NON-extractable — cannot be exported after unwrap
    ["encrypt", "decrypt"]
  );
}

// ---------------------------------------------------------------------------
// Entry encrypt / decrypt
// ---------------------------------------------------------------------------

interface EncryptResult {
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  aad: Uint8Array;
}

/**
 * Encrypt a diary entry with the DMK.
 * AAD binds the ciphertext to its metadata (entryId, userId, wordCount).
 * Fresh 12-byte IV per encryption (CRYPT-06).
 */
export async function encryptEntry(
  dmk: CryptoKey,
  plaintext: string,
  entryId: string,
  userId: string,
  wordCount: number
): Promise<EncryptResult> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(
    JSON.stringify({ entryId, userId, wordCount })
  );
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    dmk,
    encoded
  );

  return { ciphertext, iv, aad };
}

/**
 * Decrypt a diary entry with the DMK.
 * The provided AAD must exactly match what was used during encryption.
 */
export async function decryptEntry(
  dmk: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
  aad: Uint8Array
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    dmk,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// PBKDF2 passphrase shard derivation
// ---------------------------------------------------------------------------

/**
 * Derive a 32-byte device shard from a passphrase using PBKDF2-SHA256.
 * 600,000 iterations per OWASP 2024 recommendation (CRYPT-03).
 */
export async function deriveShardFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(passphrase);

  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoded,
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 600_000,
    },
    baseKey,
    256 // 32 bytes
  );

  return new Uint8Array(bits);
}

// ---------------------------------------------------------------------------
// Base64url helpers (for transport encoding)
// ---------------------------------------------------------------------------

export function uint8ToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlToUint8(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
