import { Router } from "express";
import { GetUserSettingsService } from "../../services/settings/get-user-settings-service";
import { UpdateUserSettingsService } from "../../services/settings/update-user-settings-service";
import { createSettingsController } from "../controllers/settings-controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate-middleware";

export interface SettingsRoutesDependencies {
  getSettingsService: Pick<GetUserSettingsService, "execute">;
  updateSettingsService: Pick<UpdateUserSettingsService, "execute">;
  verifyToken: (token: string) => Promise<{ subject: string }>;
}

function createSettingsRoutes(dependencies: SettingsRoutesDependencies): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware({ verifyToken: dependencies.verifyToken });
  const controller = createSettingsController(dependencies);
  router.get("/settings", authenticate, controller.get);
  router.patch("/settings", authenticate, controller.patch);
  return router;
}

export { createSettingsRoutes };