import { SignJWT, jwtVerify } from "jose";
import type { PrismaClient } from "@prisma/client";
import { PrismaAccountRepository } from "../../repositories/implementations/prisma/users";
import { LoginUserService } from "../../services/auth/login-user-service";
import { RegisterUserService } from "../../services/auth/register-user-service";
import { ScryptPasswordHasher } from "../../services/auth/scrypt-password-hasher";

const sessionIssuer = "embaixador";
const sessionAudience = "embaixador-web";
const sessionMaxAgeSeconds = 15 * 60;

interface CreateAuthServiceFactoryInput {
  prisma: PrismaClient;
  jwtSigningKey: string;
}

interface VerifiedSession {
  subject: string;
}

function createAuthServiceFactory({ prisma, jwtSigningKey }: CreateAuthServiceFactoryInput) {
  if (Buffer.byteLength(jwtSigningKey, "utf8") < 32) {
    throw new Error("JWT_SIGNING_KEY must contain at least 32 bytes");
  }

  const key = new TextEncoder().encode(jwtSigningKey);
  const accountRepository = new PrismaAccountRepository(prisma);
  const passwordHasher = new ScryptPasswordHasher();

  const tokenSigner = {
    async sign(userId: string): Promise<string> {
      return new SignJWT({})
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuer(sessionIssuer)
        .setAudience(sessionAudience)
        .setSubject(userId)
        .setIssuedAt()
        .setExpirationTime(`${sessionMaxAgeSeconds}s`)
        .sign(key);
    },
  };

  async function verifyToken(token: string): Promise<VerifiedSession> {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer: sessionIssuer,
      audience: sessionAudience,
    });

    if (!payload.sub) {
      throw new Error("Session token is missing its subject");
    }

    return { subject: payload.sub };
  }

  return {
    registerUserService: new RegisterUserService({ accountRepository, passwordHasher }),
    loginUserService: new LoginUserService({ accountRepository, passwordHasher, tokenSigner }),
    findUserByIdService: { execute: (userId: string) => accountRepository.findById(userId) },
    verifyToken,
    sessionMaxAgeSeconds,
  };
}

export { createAuthServiceFactory };