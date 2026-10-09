import type { Request, RequestHandler, Response } from "express";
import { AppError } from "../../errors/app-errors";

const sessionCookieName = "embaixador_session";

interface VerifiedSession {
  subject: string;
}

interface CreateAuthenticateMiddlewareInput {
  verifyToken: (token: string) => Promise<VerifiedSession>;
}

interface AuthenticatedLocals {
  auth?: { userId: string };
}

function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();
    if (name === sessionCookieName && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function createAuthenticateMiddleware({
  verifyToken,
}: CreateAuthenticateMiddlewareInput): RequestHandler {
  return async (request: Request, response: Response, next) => {
    const token = readSessionCookie(request.headers.cookie);
    if (!token) {
      next(
        new AppError({
          message: "Authentication required",
          code: "UNAUTHENTICATED",
          statusCode: 401,
        }),
      );
      return;
    }

    try {
      const session = await verifyToken(token);
      if (!session.subject) {
        throw new Error("Invalid session subject");
      }

      (response as Response<unknown, AuthenticatedLocals>).locals.auth = {
        userId: session.subject,
      };
      next();
    } catch {
      next(
        new AppError({
          message: "Authentication required",
          code: "UNAUTHENTICATED",
          statusCode: 401,
        }),
      );
    }
  };
}

export { createAuthenticateMiddleware };