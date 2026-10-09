import type { RequestHandler } from "express";
import { AppError } from "../../errors/app-errors";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function createCorsMiddleware(frontendOrigin: string): RequestHandler {
  return (request, response, next) => {
    const origin = request.get("origin");

    if (origin !== frontendOrigin) {
      if (origin || stateChangingMethods.has(request.method)) {
        next(
          new AppError({
            message: "Request origin is not allowed",
            code: "ORIGIN_NOT_ALLOWED",
            statusCode: 403,
          }),
        );
        return;
      }

      next();
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", frontendOrigin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Max-Age", "600");
    response.setHeader("Vary", "Origin");

    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }

    next();
  };
}

export { createCorsMiddleware };