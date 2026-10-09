import type { RequestHandler, Response } from "express";
import { AppError } from "../../errors/app-errors";
import { PublicUser, User } from "../../repositories/users/types";
import { LoginUserService } from "../../services/auth/login-user-service";
import { RegisterUserService } from "../../services/auth/register-user-service";

const sessionCookieName = "embaixador_session";

interface UserLookupService {
  execute(id: string): Promise<User | null>;
}

interface AuthenticatedLocals {
  auth?: { userId: string };
}

interface CreateAuthControllerInput {
  registerUserService: Pick<RegisterUserService, "execute">;
  loginUserService: Pick<LoginUserService, "execute">;
  findUserByIdService: UserLookupService;
  nodeEnv: string;
  sessionMaxAgeSeconds: number;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    themePreference: user.themePreference,
    retentionHours: user.retentionHours,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function createAuthController({
  registerUserService,
  loginUserService,
  findUserByIdService,
  nodeEnv,
  sessionMaxAgeSeconds,
}: CreateAuthControllerInput) {
  const secureCookie = nodeEnv === "production";

  const register: RequestHandler = async (request, response, next) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (
      !body ||
      typeof body.name !== "string" ||
      typeof body.email !== "string" ||
      typeof body.password !== "string"
    ) {
      next(new AppError({ message: "Invalid registration data", code: "INVALID_REQUEST", statusCode: 400 }));
      return;
    }

    try {
      const user = await registerUserService.execute({
        name: body.name,
        email: body.email,
        password: body.password,
      });
      response.status(201).json(user);
    } catch (error) {
      next(error);
    }
  };

  const login: RequestHandler = async (request, response, next) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (
      !body ||
      typeof body.email !== "string" ||
      typeof body.password !== "string"
    ) {
      next(new AppError({ message: "Invalid email or password", code: "INVALID_CREDENTIALS", statusCode: 401 }));
      return;
    }

    try {
      const result = await loginUserService.execute({ email: body.email, password: body.password });
      response.cookie(sessionCookieName, result.token, {
        httpOnly: true,
        secure: secureCookie,
        sameSite: "lax",
        path: "/",
        maxAge: sessionMaxAgeSeconds * 1000,
      });
      response.status(200).json({ account: result.user });
    } catch (error) {
      next(error);
    }
  };

  const logout: RequestHandler = (_request, response) => {
    response.cookie(sessionCookieName, "", {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    response.status(204).end();
  };

  const me: RequestHandler = async (_request, response: Response<unknown, AuthenticatedLocals>, next) => {
    const userId = response.locals.auth?.userId;
    if (!userId) {
      next(new AppError({ message: "Authentication required", code: "UNAUTHENTICATED", statusCode: 401 }));
      return;
    }

    try {
      const user = await findUserByIdService.execute(userId);
      if (!user) {
        next(new AppError({ message: "Account not found", code: "ACCOUNT_NOT_FOUND", statusCode: 404 }));
        return;
      }

      response.status(200).json(toPublicUser(user));
    } catch (error) {
      next(error);
    }
  };

  return { register, login, logout, me };
}

export { createAuthController };