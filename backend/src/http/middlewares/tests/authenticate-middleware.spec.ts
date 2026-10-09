import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../errors/app-errors";
import { createAuthenticateMiddleware } from "../authenticate-middleware";
import { createCorsMiddleware } from "../cors-middleware";

const frontendOrigin = "https://embaixador.example";

function createRequest({
  method = "GET",
  origin = frontendOrigin,
  cookie,
}: {
  method?: string;
  origin?: string;
  cookie?: string;
} = {}): Request {
  const requestOrigin = origin || undefined;

  return {
    method,
    headers: { origin: requestOrigin, cookie },
    get(name: string) {
      return name.toLowerCase() === "origin" ? requestOrigin : undefined;
    },
  } as unknown as Request;
}

function createResponse(): Response & {
  headers: Record<string, string>;
  locals: Record<string, unknown>;
  statusCode?: number;
  body?: unknown;
} {
  const response = {
    headers: {} as Record<string, string>,
    locals: {} as Record<string, unknown>,
    statusCode: undefined as number | undefined,
    setHeader(name: string, value: string) {
      response.headers[name.toLowerCase()] = value;
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    end() {
      return response;
    },
  };

  return response as unknown as Response & {
    headers: Record<string, string>;
    locals: Record<string, unknown>;
    statusCode?: number;
    body?: unknown;
  };
}

describe("createCorsMiddleware", () => {
  it("allows only the configured origin and credentials", () => {
    const middleware = createCorsMiddleware(frontendOrigin);
    const request = createRequest();
    const response = createResponse();
    const next = vi.fn();

    middleware(request, response, next as NextFunction);

    expect(response.headers["access-control-allow-origin"]).toBe(frontendOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers.vary).toBe("Origin");
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a different origin", () => {
    const middleware = createCorsMiddleware(frontendOrigin);
    const next = vi.fn();

    middleware(createRequest({ origin: "https://attacker.example" }), createResponse(), next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(AppError);
    expect((next.mock.calls[0]?.[0] as AppError).statusCode).toBe(403);
  });

  it("allows a read-only request with no Origin without adding credential headers", () => {
    const middleware = createCorsMiddleware(frontendOrigin);
    const request = createRequest({ method: "GET", origin: "" });
    const response = createResponse();
    const next = vi.fn();

    middleware(request, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("terminates a valid preflight request without invoking downstream middleware", () => {
    const middleware = createCorsMiddleware(frontendOrigin);
    const request = createRequest({ method: "OPTIONS" });
    const response = createResponse();
    const next = vi.fn();

    middleware(request, response, next);

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects state-changing requests without an Origin header", () => {
    const middleware = createCorsMiddleware(frontendOrigin);
    const next = vi.fn();

    middleware(createRequest({ method: "POST", origin: "" }), createResponse(), next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(AppError);
  });
});

describe("createAuthenticateMiddleware", () => {
  it("verifies the session cookie and sets the authenticated subject", async () => {
    const middleware = createAuthenticateMiddleware({
      verifyToken: vi.fn().mockResolvedValue({ subject: "user-123" }),
    });
    const request = createRequest({ cookie: "theme=dark; embaixador_session=signed-token" });
    const response = createResponse();
    const next = vi.fn();

    await middleware(request, response, next);

    expect(response.locals.auth).toEqual({ userId: "user-123" });
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects missing or invalid session cookies without exposing token data", async () => {
    const verifyToken = vi.fn().mockRejectedValue(new Error("token-secret"));
    const middleware = createAuthenticateMiddleware({ verifyToken });
    const request = createRequest({ cookie: "theme=dark" });
    const next = vi.fn();

    await middleware(request, createResponse(), next);

    expect(verifyToken).not.toHaveBeenCalled();
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(AppError);
    expect(String(next.mock.calls[0]?.[0])).not.toContain("token-secret");
  });

  it("rejects a verified token with an empty subject", async () => {
    const middleware = createAuthenticateMiddleware({
      verifyToken: vi.fn().mockResolvedValue({ subject: "" }),
    });
    const next = vi.fn();

    await middleware(createRequest({ cookie: "embaixador_session=token" }), createResponse(), next);

    expect(next.mock.calls[0]?.[0]).toMatchObject({ code: "UNAUTHENTICATED", statusCode: 401 });
  });

  it("skips malformed cookie segments and still finds the session cookie", async () => {
    const verifyToken = vi.fn().mockResolvedValue({ subject: "user-123" });
    const middleware = createAuthenticateMiddleware({ verifyToken });
    const response = createResponse();
    const next = vi.fn();

    await middleware(createRequest({ cookie: "broken-segment; embaixador_session=valid-token" }), response, next);

    expect(verifyToken).toHaveBeenCalledWith("valid-token");
    expect(response.locals.auth).toEqual({ userId: "user-123" });
  });
});