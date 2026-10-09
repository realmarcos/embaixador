import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError, serializeApiError } from "../../../errors/app-errors";
import { errorHandlerMiddleware } from "../error-handler-middleware";

describe("serializeApiError", () => {
  it("preserves safe client errors without exposing details", () => {
    const result = serializeApiError(
      new AppError({
        message: "Invalid media URL",
        code: "INVALID_MEDIA_URL",
        statusCode: 422,
        details: "private-url-and-provider-response",
      }),
      "request-123",
    );

    expect(result).toEqual({
      statusCode: 422,
      body: {
        error: {
          code: "INVALID_MEDIA_URL",
          message: "Invalid media URL",
          requestId: "request-123",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("private-url-and-provider-response");
  });

  it("replaces internal error messages and details with a generic response", () => {
    const result = serializeApiError(
      new AppError({
        message: "Failure for https://private.example/token=secret",
        code: "DOWNLOAD_FAILED",
        statusCode: 500,
        details: "raw provider output and credentials",
      }),
      "request-456",
    );

    expect(result).toEqual({
      statusCode: 500,
      body: {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occurred",
          requestId: "request-456",
        },
      },
    });
  });

  it("maps unknown exceptions to the same generic response", () => {
    const result = serializeApiError(new Error("database-password=secret"), "request-789");

    expect(result.statusCode).toBe(500);
    expect(JSON.stringify(result)).not.toContain("database-password=secret");
  });

  it("normalizes invalid application status codes to an internal error", () => {
    const result = serializeApiError(
      new AppError({ message: "bad status", code: "BAD_STATUS", statusCode: 200 }),
      "request-000",
    );

    expect(result.statusCode).toBe(500);
    expect(result.body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});

describe("errorHandlerMiddleware", () => {
  it("passes errors onward when the response has already been sent", () => {
    const error = new Error("private provider response");
    const request = {} as Request;
    const response = { headersSent: true } as Response;
    const next = vi.fn();

    errorHandlerMiddleware(error, request, response, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it("sends the safe serialized envelope for unsent responses", () => {
    const error = new Error("source URL token=private");
    const responseState = { statusCode: 0, body: undefined as unknown };
    const response = {
      headersSent: false,
      status(code: number) {
        responseState.statusCode = code;
        return response;
      },
      json(body: unknown) {
        responseState.body = body;
        return response;
      },
    } as unknown as Response;

    errorHandlerMiddleware(error, {} as Request, response, vi.fn());

    expect(responseState.statusCode).toBe(500);
    expect(JSON.stringify(responseState.body)).not.toContain("private");
  });
});