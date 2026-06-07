import { describe, it, expect } from "vitest";
import {
  generateDmk,
  wrapDmk,
  unwrapDmk,
  encryptEntry,
  decryptEntry,
  deriveShardFromPassphrase,
  xorShards,
} from "../crypto";

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

describe("generateDmk", () => {
  it("returns an extractable AES-GCM 256-bit CryptoKey", async () => {
    const dmk = await generateDmk();
    expect(dmk).toBeInstanceOf(CryptoKey);
    expect(dmk.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(dmk.extractable).toBe(true);
    expect(dmk.usages).toContain("encrypt");
    expect(dmk.usages).toContain("decrypt");
  });
});

describe("wrapDmk / unwrapDmk", () => {
  it("round-trips: generate -> wrap -> unwrap produces identical encrypt/decrypt behavior", async () => {
    const dmk = await generateDmk();
    const deviceShard = randomBytes(32);
    const serverShard = randomBytes(32);
    const hkdfSalt = randomBytes(32);

    const { wrappedDmk, wrapIv } = await wrapDmk(
      dmk,
      deviceShard,
      serverShard,
      hkdfSalt
    );

    expect(wrappedDmk).toBeInstanceOf(ArrayBuffer);
    expect(wrapIv).toBeInstanceOf(Uint8Array);
    expect(wrapIv.length).toBe(12);

    const unwrapped = await unwrapDmk(
      wrappedDmk,
      wrapIv,
      deviceShard,
      serverShard,
      hkdfSalt
    );

    // Verify round-trip by encrypting with original, decrypting with unwrapped
    const plaintext = "Hello, Dead Letter Diary!";
    const entryId = "entry-001";
    const userId = "user-001";
    const wordCount = 4;

    const encrypted = await encryptEntry(
      dmk,
      plaintext,
      entryId,
      userId,
      wordCount
    );
    const decrypted = await decryptEntry(
      unwrapped,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.aad
    );
    expect(decrypted).toBe(plaintext);
  });

  it("unwrapped DMK is non-extractable", async () => {
    const dmk = await generateDmk();
    const deviceShard = randomBytes(32);
    const serverShard = randomBytes(32);
    const hkdfSalt = randomBytes(32);

    const { wrappedDmk, wrapIv } = await wrapDmk(
      dmk,
      deviceShard,
      serverShard,
      hkdfSalt
    );

    const unwrapped = await unwrapDmk(
      wrappedDmk,
      wrapIv,
      deviceShard,
      serverShard,
      hkdfSalt
    );

    expect(unwrapped.extractable).toBe(false);

    // Attempting to export should throw
    await expect(
      crypto.subtle.exportKey("raw", unwrapped)
    ).rejects.toThrow();
  });
});

describe("encryptEntry / decryptEntry", () => {
  it("round-trips correctly with matching AAD", async () => {
    const dmk = await generateDmk();
    const plaintext = "My secret diary entry content.";
    const entryId = "entry-123";
    const userId = "user-456";
    const wordCount = 5;

    const encrypted = await encryptEntry(
      dmk,
      plaintext,
      entryId,
      userId,
      wordCount
    );

    expect(encrypted.ciphertext).toBeInstanceOf(ArrayBuffer);
    expect(encrypted.iv).toBeInstanceOf(Uint8Array);
    expect(encrypted.iv.length).toBe(12);
    expect(encrypted.aad).toBeInstanceOf(Uint8Array);

    const decrypted = await decryptEntry(
      dmk,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.aad
    );
    expect(decrypted).toBe(plaintext);
  });

  it("each encryption produces a unique IV", async () => {
    const dmk = await generateDmk();
    const plaintext = "Same text twice";
    const entryId = "entry-1";
    const userId = "user-1";
    const wordCount = 3;

    const enc1 = await encryptEntry(dmk, plaintext, entryId, userId, wordCount);
    const enc2 = await encryptEntry(dmk, plaintext, entryId, userId, wordCount);

    // IVs must differ
    const iv1Hex = Array.from(enc1.iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const iv2Hex = Array.from(enc2.iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(iv1Hex).not.toBe(iv2Hex);
  });

  it("decryption with wrong AAD throws", async () => {
    const dmk = await generateDmk();
    const plaintext = "Protected content";
    const entryId = "entry-1";
    const userId = "user-1";
    const wordCount = 2;

    const encrypted = await encryptEntry(
      dmk,
      plaintext,
      entryId,
      userId,
      wordCount
    );

    // Tamper with AAD — different wordCount
    const wrongAad = new TextEncoder().encode(
      JSON.stringify({ entryId, userId, wordCount: 999 })
    );

    await expect(
      decryptEntry(dmk, encrypted.ciphertext, encrypted.iv, wrongAad)
    ).rejects.toThrow();
  });
});

describe("deriveShardFromPassphrase", () => {
  it("produces a 32-byte Uint8Array", async () => {
    const shard = await deriveShardFromPassphrase(
      "my-secret-passphrase",
      randomBytes(32)
    );
    expect(shard).toBeInstanceOf(Uint8Array);
    expect(shard.length).toBe(32);
  });

  it("produces deterministic output for same inputs", async () => {
    const salt = randomBytes(32);
    const shard1 = await deriveShardFromPassphrase("password123", salt);
    const shard2 = await deriveShardFromPassphrase("password123", salt);
    expect(Array.from(shard1)).toEqual(Array.from(shard2));
  });
});

describe("xorShards", () => {
  it("XORs two Uint8Arrays correctly", () => {
    const a = new Uint8Array([0xff, 0x00, 0xaa]);
    const b = new Uint8Array([0x0f, 0xf0, 0x55]);
    const result = xorShards(a, b);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([0xf0, 0xf0, 0xff]);
  });

  it("throws if lengths differ", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2]);
    expect(() => xorShards(a, b)).toThrow();
  });

  it("XOR with self produces all zeros", () => {
    const a = randomBytes(32);
    const result = xorShards(a, a);
    expect(result.every((b) => b === 0)).toBe(true);
  });
});
