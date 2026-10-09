import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

interface EncryptedSourceUrl {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: string;
}

function createSourceUrlEncryptor(encodedKey: string): (sourceUrl: string) => EncryptedSourceUrl {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("SOURCE_URL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }

  return (sourceUrl) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(sourceUrl, "utf8"), cipher.final()]);

    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      keyVersion: "v1",
    };
  };
}

function createSourceUrlDecryptor(encodedKey: string): (sourceUrl: EncryptedSourceUrl) => string {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("SOURCE_URL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }

  return (encryptedSourceUrl) => {
    if (encryptedSourceUrl.keyVersion !== "v1") {
      throw new Error("Unsupported source URL key version");
    }

    const iv = Buffer.from(encryptedSourceUrl.iv, "base64");
    const tag = Buffer.from(encryptedSourceUrl.tag, "base64");
    const ciphertext = Buffer.from(encryptedSourceUrl.ciphertext, "base64");
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error("Invalid encrypted source URL");
    }

    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      throw new Error("Unable to decrypt source URL");
    }
  };
}

export { createSourceUrlDecryptor, createSourceUrlEncryptor, EncryptedSourceUrl };