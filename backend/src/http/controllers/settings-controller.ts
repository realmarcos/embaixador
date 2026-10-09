import type { RequestHandler, Response } from "express";
import { AppError } from "../../errors/app-errors";
import { GetUserSettingsService } from "../../services/settings/get-user-settings-service";
import { UpdateUserSettingsService } from "../../services/settings/update-user-settings-service";

interface AuthenticatedLocals {
  auth?: { userId: string };
}

interface SettingsControllerDependencies {
  getSettingsService: Pick<GetUserSettingsService, "execute">;
  updateSettingsService: Pick<UpdateUserSettingsService, "execute">;
}

function createSettingsController({ getSettingsService, updateSettingsService }: SettingsControllerDependencies) {
  const get: RequestHandler = async (_request, response, next) => {
    const userId = (response as Response<unknown, AuthenticatedLocals>).locals.auth?.userId;
    if (!userId) {
      next(new AppError({ message: "Authentication required", code: "UNAUTHENTICATED", statusCode: 401 }));
      return;
    }
    try {
      response.status(200).json(await getSettingsService.execute(userId));
    } catch (error) {
      next(error);
    }
  };

  const patch: RequestHandler = async (request, response, next) => {
    const userId = (response as Response<unknown, AuthenticatedLocals>).locals.auth?.userId;
    if (!userId) {
      next(new AppError({ message: "Authentication required", code: "UNAUTHENTICATED", statusCode: 401 }));
      return;
    }
    try {
      response.status(200).json(await updateSettingsService.execute({ userId, settings: request.body as Record<string, unknown> }));
    } catch (error) {
      next(error);
    }
  };

  return { get, patch };
}

export { createSettingsController };