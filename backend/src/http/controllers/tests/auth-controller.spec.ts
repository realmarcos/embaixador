import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { User } from "../../../repositories/users/types";
import { createAuthController } from "../auth-controller";

const account: User = {
  id: "user-1",
  name: "Test User",
  email: "test@example.test",
  passwordHash: "private-password-hash",
  avatar: "",
  themePreference: "LIGHT",
  retentionHours: 1,
  createdAt: new Date("2026-10-08T10:00:00.000Z"),
  updatedAt: new Date("2026-10-08T10:00:00.000Z"),
};

function createContext({ body, userId }: { body?: unknown; userId?: string } = {}) {
  const request = { body } as Request;
  const state = {
    statusCode: 0,
    body: undefined as unknown,
    cookies: [] as { name: string; value: string; options: Record<string, unknown> }[],
    ended: false,
  };
  const response = {
    locals: userId ? { auth: { userId } } : {},
    status(code: number) { state.statusCode = code; return response; },
    json(value: unknown) { state.body = value; return response; },
    end() { state.ended = true; return response; },
    cookie(name: string, value: string, options: Record<string, unknown>) {
      state.cookies.push({ name, value, options });
      return response;
    },
  } as unknown as Response;
  return { request, response, state };
}

describe("auth controller", () => {
  const registerUserService = { execute: vi.fn() };
  const loginUserService = { execute: vi.fn() };
  const findUserByIdService = { execute: vi.fn() };
  const controller = createAuthController({
    registerUserService,
    loginUserService,
    findUserByIdService,
    nodeEnv: "production",
    sessionMaxAgeSeconds: 900,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    registerUserService.execute.mockResolvedValue(account);
    loginUserService.execute.mockResolvedValue({ user: account, token: "opaque-test-token" });
    findUserByIdService.execute.mockResolvedValue(account);
  });

  it("validates registration input, returns success, and forwards service failures", async () => {
    for (const body of [undefined, {}, { name: "A", email: "a@example.test" }]) {
      const next = vi.fn();
      const http = createContext({ body });
      await controller.register(http.request, http.response, next);
      expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_REQUEST", statusCode: 400 });
    }

    const valid = createContext({ body: { name: "Test", email: "test@example.test", password: "long-test-password" } });
    await controller.register(valid.request, valid.response, vi.fn());
    expect(registerUserService.execute).toHaveBeenCalledWith({ name: "Test", email: "test@example.test", password: "long-test-password" });
    expect(valid.state.statusCode).toBe(201);

    const failure = new Error("registration failed");
    registerUserService.execute.mockRejectedValueOnce(failure);
    const failed = createContext({ body: { name: "Test", email: "test@example.test", password: "long-test-password" } });
    const next = vi.fn();
    await controller.register(failed.request, failed.response, next);
    expect(next.mock.calls[0]?.[0]).toBe(failure);
  });

  it("validates login, sets a protected cookie, and forwards service errors", async () => {
    for (const body of [undefined, {}, { email: "test@example.test" }]) {
      const next = vi.fn();
      const http = createContext({ body });
      await controller.login(http.request, http.response, next);
      expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "INVALID_CREDENTIALS", statusCode: 401 });
    }

    const valid = createContext({ body: { email: "test@example.test", password: "long-test-password" } });
    await controller.login(valid.request, valid.response, vi.fn());
    expect(loginUserService.execute).toHaveBeenCalledWith({ email: "test@example.test", password: "long-test-password" });
    expect(valid.state.statusCode).toBe(200);
    expect(valid.state.cookies[0]).toMatchObject({
      name: "embaixador_session",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 900_000 },
    });
    expect(valid.state.body).not.toHaveProperty("token");

    const failure = new Error("invalid credentials");
    loginUserService.execute.mockRejectedValueOnce(failure);
    const failed = createContext({ body: { email: "test@example.test", password: "long-test-password" } });
    const next = vi.fn();
    await controller.login(failed.request, failed.response, next);
    expect(next.mock.calls[0]?.[0]).toBe(failure);
  });

  it("clears the session cookie on logout", async () => {
    const http = createContext();
    await controller.logout(http.request, http.response, vi.fn());

    expect(http.state.statusCode).toBe(204);
    expect(http.state.ended).toBe(true);
    expect(http.state.cookies[0]).toMatchObject({
      name: "embaixador_session",
      value: "",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 },
    });
  });

  it("handles missing auth, missing account, service failure, and strips password hash", async () => {
    const anonymous = createContext();
    const unauthenticated = vi.fn();
    await controller.me(anonymous.request, anonymous.response, unauthenticated);
    expect(unauthenticated.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED", statusCode: 401 });

    findUserByIdService.execute.mockResolvedValueOnce(null);
    const missing = createContext({ userId: "deleted-user" });
    const notFound = vi.fn();
    await controller.me(missing.request, missing.response, notFound);
    expect(notFound.mock.calls[0]?.[0]).toMatchObject({ code: "ACCOUNT_NOT_FOUND", statusCode: 404 });

    const failure = new Error("lookup failed");
    findUserByIdService.execute.mockRejectedValueOnce(failure);
    const failed = createContext({ userId: "user-1" });
    const next = vi.fn();
    await controller.me(failed.request, failed.response, next);
    expect(next.mock.calls[0]?.[0]).toBe(failure);

    const current = createContext({ userId: "user-1" });
    await controller.me(current.request, current.response, vi.fn());
    expect(current.state.statusCode).toBe(200);
    expect(current.state.body).not.toHaveProperty("passwordHash");
  });
});