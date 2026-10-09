import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler } from "express";
import { serializeApiError } from "../../errors/app-errors";

const errorHandlerMiddleware: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const serializedError = serializeApiError(error, randomUUID());

  response.status(serializedError.statusCode).json(serializedError.body);
};

export { errorHandlerMiddleware };