import type { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScryptPasswordHasher } from "../../../services/auth/scrypt-password-hasher";
import { createAuthServiceFactory } from "../create-auth-service-factory";

const signingKey = "unit-test-signing-key-with-at-least-32-bytes";

describe("createAuthServiceFactory", () => {
  const passwordHasher = new ScryptPasswordHasher();
  let findUnique: ReturnType<typeof vi.fn>;
  let prisma: PrismaClient;
  let passwordHash: string;

  beforeEach(async () => {
    findUnique = vi.fn();
    prisma = { user: { findUnique } } as unknown as PrismaClient;
    passwordHash = await passwordHasher.hash("correct-password");
    findUnique.mockResolvedValue({
      id: "user-1",
      name: "Ana Silva",
      email: "ana@example.com",
      passwordHash,
      avatar: null,
      themePreference: "LIGHT",
      retentionHours: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("issues a signed session that verifies and expires in 15 minutes", async () => {
    const auth = createAuthServiceFactory({ prisma, jwtSigningKey: signingKey });
    const login = await auth.loginUserService.execute({
      email: "ana@example.com",
      password: "correct-password",
    });

    await expect(auth.verifyToken(login.token)).resolves.toEqual({ subject: "user-1" });
    expect(auth.sessionMaxAgeSeconds).toBe(900);
    expect(login.user).not.toHaveProperty("passwordHash");
    await expect(auth.findUserByIdService.execute("user-1")).resolves.toMatchObject({ id: "user-1" });
  });

  it("rejects a signing key shorter than 32 bytes", () => {
    expect(() => createAuthServiceFactory({ prisma, jwtSigningKey: "short" })).toThrow(
      "JWT_SIGNING_KEY must contain at least 32 bytes",
    );
  });

  it("rejects invalid signatures, expired tokens, and validly signed tokens without a subject", async () => {
    const auth = createAuthServiceFactory({ prisma, jwtSigningKey: signingKey });
    const login = await auth.loginUserService.execute({ email: "ana@example.com", password: "correct-password" });
    const invalidSignature = `${login.token.slice(0, -1)}x`;
    await expect(auth.verifyToken(invalidSignature)).rejects.toThrow();

    const key = new TextEncoder().encode(signingKey);
    const expiredWithoutSubject = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("embaixador")
      .setAudience("embaixador-web")
      .setIssuedAt(Math.floor(Date.now() / 1000) - 1200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 600)
      .sign(key);
    await expect(auth.verifyToken(expiredWithoutSubject)).rejects.toThrow();

    const noSubject = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("embaixador")
      .setAudience("embaixador-web")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    await expect(auth.verifyToken(noSubject)).rejects.toThrow("Session token is missing its subject");
  });
});