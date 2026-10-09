export class AppError extends Error {
  public readonly message: string;
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor({ message, statusCode = 400, code, details }: AppErrorProps) {
    super(message);
    this.message = message;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

}

interface AppErrorProps {
  message: string;
  statusCode?: number;
  code: string;
  details?: unknown;
}

interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

interface SerializedApiError {
  statusCode: number;
  body: ApiErrorResponse;
}

function serializeApiError(error: unknown, requestId: string): SerializedApiError {
  if (
    error instanceof AppError &&
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          requestId,
        },
      },
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
        requestId,
      },
    },
  };
}

export { serializeApiError };