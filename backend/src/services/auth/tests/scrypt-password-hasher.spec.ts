import { describe, expect, it } from "vitest";
import { ScryptPasswordHasher } from "../scrypt-password-hasher";

describe("ScryptPasswordHasher", () => {
  const hasher = new ScryptPasswordHasher();

  it("generates a unique salt for each password hash", async () => {
    const firstHash = await hasher.hash("a-long-password-value");
    const secondHash = await hasher.hash("a-long-password-value");

    expect(firstHash).not.toBe(secondHash);
    expect(firstHash.split("$")).toHaveLength(7);
  });

  it("verifies the original password", async () => {
    const passwordHash = await hasher.hash("a-long-password-value");

    await expect(hasher.verify(passwordHash, "a-long-password-value")).resolves.toBe(true);
  });

  it("rejects a different password", async () => {
    const passwordHash = await hasher.hash("a-long-password-value");

    await expect(hasher.verify(passwordHash, "another-password-value")).resolves.toBe(false);
  });

  it.each(["", "plain-text", "scrypt$invalid", "scrypt$16384$8$1$abcd$00"]) (
    "rejects malformed stored hash %s without throwing",
    async (passwordHash) => {
      await expect(hasher.verify(passwordHash, "a-long-password-value")).resolves.toBe(false);
    },
  );

  it("rejects hashes with mismatched algorithm parameters or malformed hex fields", async () => {
    const salt = "a".repeat(32);
    const derivedKey = "b".repeat(128);
    const validParts = ["scrypt", "v1", "16384", "8", "1", salt, derivedKey];
    const malformedHashes = [
      ["argon2", ...validParts.slice(1)].join("$"),
      [validParts[0], "v2", ...validParts.slice(2)].join("$"),
      [validParts[0], validParts[1], "32768", ...validParts.slice(3)].join("$"),
      [validParts[0], validParts[1], validParts[2], "4", ...validParts.slice(4)].join("$"),
      [validParts[0], validParts[1], validParts[2], validParts[3], "2", ...validParts.slice(5)].join("$"),
      [validParts[0], validParts[1], validParts[2], validParts[3], validParts[4], "z".repeat(32), derivedKey].join("$"),
      [validParts[0], validParts[1], validParts[2], validParts[3], validParts[4], salt, "g".repeat(128)].join("$"),
    ];

    for (const passwordHash of malformedHashes) {
      await expect(hasher.verify(passwordHash, "a-long-password-value")).resolves.toBe(false);
    }
  });

  it("maps native key derivation input errors to a failed verification", async () => {
    const passwordHash = await hasher.hash("a-long-password-value");

    await expect(hasher.verify(passwordHash, null as unknown as string)).resolves.toBe(false);
  });
});