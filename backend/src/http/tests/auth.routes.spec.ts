import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors/app-errors";
import { errorHandlerMiddleware } from "../../http/middlewares/error-handler-middleware";
import { createAuthRoutes } from "../../http/routes/auth-routes";

const publicUser = {
  id: "user-1",
  name: "Ana Silva",
  email: "ana@example.com",
  avatar: "",
  themePreference: "LIGHT",
  retentionHours: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function readJson<T>(response: Response): Promise<T> {
  const body: unknown = await response.json();
  return body as T;
}

describe("auth HTTP contract", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl: string;
  const registerUserService = { execute: vi.fn() };
  const loginUserService = { execute: vi.fn() };
  const findUserByIdService = { execute: vi.fn() };
  const verifyToken = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    registerUserService.execute.mockResolvedValue(publicUser);
    loginUserService.execute.mockResolvedValue({ user: publicUser, token: "signed-jws" });
    findUserByIdService.execute.mockResolvedValue({ ...publicUser, passwordHash: "must-not-leak" });
    verifyToken.mockResolvedValue({ subject: "user-1" });

    const app = express();
    app.use(express.json());
    app.use(
      "/auth",
      createAuthRoutes({
        registerUserService,
        loginUserService,
        findUserByIdService,
        verifyToken,
        nodeEnv: "test",
        sessionMaxAgeSeconds: 900,
      }),
    );
    app.use(errorHandlerMiddleware);
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", () => {
        resolve();
      });
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  it("registers an account and excludes password/hash fields from the response", async () => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ana Silva", email: "ana@example.com", password: "long-password" }),
    });

    expect(response.status).toBe(201);
    const body = await readJson<{ id: string; email: string; passwordHash?: string }>(response);
    expect(body).toMatchObject({ id: "user-1", email: "ana@example.com" });
    expect(body).not.toHaveProperty("passwordHash");
    expect(registerUserService.execute).toHaveBeenCalledWith({
      name: "Ana Silva",
      email: "ana@example.com",
      password: "long-password",
    });
  });

  it("sets the signed token only in an HttpOnly SameSite session cookie", async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "ana@example.com", password: "long-password" }),
    });

    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("embaixador_session=signed-jws");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    const body = await readJson<{ account: { id: string }; token?: string; passwordHash?: string }>(response);
    expect(body).toMatchObject({ account: { id: "user-1" } });
    expect(body).not.toHaveProperty("token");
    expect(body).not.toHaveProperty("passwordHash");
  });

  it("clears the session cookie on authenticated logout", async () => {
    const response = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { cookie: "embaixador_session=signed-jws" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns the current account without its password hash", async () => {
    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie: "embaixador_session=signed-jws" },
    });

    expect(response.status).toBe(200);
    const body = await readJson<{ id: string; email: string; passwordHash?: string }>(response);
    expect(body).toMatchObject({ id: "user-1", email: "ana@example.com" });
    expect(body).not.toHaveProperty("passwordHash");
  });

  it("rejects protected account requests without a session cookie", async () => {
    const response = await fetch(`${baseUrl}/auth/me`);

    expect(response.status).toBe(401);
    const body = await readJson<{ error: { code: string; requestId: string } }>(response);
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(body.error).toHaveProperty("requestId");
  });

  it("rejects invalid registration fields with the documented safe error shape", async () => {
    registerUserService.execute.mockRejectedValueOnce(
      new AppError({
        statusCode: 400,
        code: "INVALID_EMAIL",
        message: "A valid email address is required",
      }),
    );
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ana Silva", email: "invalid", password: "long-password" }),
    });

    expect(response.status).toBe(400);
    const body = await readJson<{ error: { code: string } }>(response);
    expect(body.error.code).toBe("INVALID_EMAIL");
  });
});