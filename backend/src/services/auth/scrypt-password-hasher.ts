import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { PasswordHasher } from "./password-hasher";

const algorithm = "scrypt";
const version = "v1";
const cost = 16384;
const blockSize = 8;
const parallelization = 1;
const saltBytes = 16;
const derivedKeyBytes = 64;
const maximumMemoryBytes = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      derivedKeyBytes,
      { N: cost, r: blockSize, p: parallelization, maxmem: maximumMemoryBytes },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(saltBytes);
    const derivedKey = await deriveKey(password, salt);

    return [
      algorithm,
      version,
      String(cost),
      String(blockSize),
      String(parallelization),
      salt.toString("hex"),
      derivedKey.toString("hex"),
    ].join("$");
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    const parts = passwordHash.split("$");
    if (parts.length !== 7) {
      return false;
    }

    const [storedAlgorithm, storedVersion, storedCost, storedBlockSize, storedParallelization, saltHex, hashHex] = parts;
    if (
      storedAlgorithm !== algorithm ||
      storedVersion !== version ||
      storedCost !== String(cost) ||
      storedBlockSize !== String(blockSize) ||
      storedParallelization !== String(parallelization) ||
      !saltHex ||
      !/^[0-9a-f]{32}$/i.test(saltHex) ||
      !hashHex ||
      !/^[0-9a-f]{128}$/i.test(hashHex)
    ) {
      return false;
    }

    try {
      const salt = Buffer.from(saltHex, "hex");
      const expectedHash = Buffer.from(hashHex, "hex");
      const actualHash = await deriveKey(password, salt);
      return timingSafeEqual(actualHash, expectedHash);
    } catch {
      return false;
    }
  }
}

export { ScryptPasswordHasher };