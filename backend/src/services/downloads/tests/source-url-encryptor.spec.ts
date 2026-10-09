import { describe, expect, it } from "vitest";
import { createSourceUrlDecryptor, createSourceUrlEncryptor } from "../source-url-encryptor";

describe("source URL AES-GCM encryption", () => {
  const key = Buffer.alloc(32, 9).toString("base64");

  it("round-trips a URL while storing no plaintext in its ciphertext", () => {
    const encrypt = createSourceUrlEncryptor(key);
    const decrypt = createSourceUrlDecryptor(key);
    const sourceUrl = "https://www.youtube.com/watch?v=private-video";
    const encrypted = encrypt(sourceUrl);

    expect(encrypted.keyVersion).toBe("v1");
    expect(encrypted.ciphertext).not.toContain(sourceUrl);
    expect(decrypt(encrypted)).toBe(sourceUrl);
  });

  it("uses a fresh random IV for every encryption", () => {
    const encrypt = createSourceUrlEncryptor(key);
    const sourceUrl = "https://www.youtube.com/watch?v=private-video";

    expect(encrypt(sourceUrl).iv).not.toBe(encrypt(sourceUrl).iv);
  });

  it("rejects a tampered authentication tag without returning plaintext", () => {
    const encrypt = createSourceUrlEncryptor(key);
    const decrypt = createSourceUrlDecryptor(key);
    const encrypted = encrypt("https://www.youtube.com/watch?v=private-video");
    const tampered = { ...encrypted, tag: Buffer.alloc(16).toString("base64") };

    expect(() => decrypt(tampered)).toThrow("Unable to decrypt source URL");
  });

  it("rejects keys that are not canonical base64-encoded 32-byte values", () => {
    expect(() => createSourceUrlEncryptor("not-a-key")).toThrow(
      "SOURCE_URL_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
    expect(() => createSourceUrlDecryptor("not-a-key")).toThrow(
      "SOURCE_URL_ENCRYPTION_KEY must be a base64-encoded 32-byte key",
    );
  });

  it("rejects unsupported versions, invalid IV/tag sizes, and tampered ciphertext", () => {
    const encrypt = createSourceUrlEncryptor(key);
    const decrypt = createSourceUrlDecryptor(key);
    const encrypted = encrypt("https://www.youtube.com/watch?v=private-video");

    expect(() => decrypt({ ...encrypted, keyVersion: "v2" })).toThrow("Unsupported source URL key version");
    expect(() => decrypt({ ...encrypted, iv: Buffer.alloc(8).toString("base64") })).toThrow("Invalid encrypted source URL");
    expect(() => decrypt({ ...encrypted, tag: Buffer.alloc(8).toString("base64") })).toThrow("Invalid encrypted source URL");
    expect(() => decrypt({ ...encrypted, ciphertext: Buffer.alloc(16, 1).toString("base64") }))
      .toThrow("Unable to decrypt source URL");
  });
});