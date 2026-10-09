import { Router } from "express";
import { AnalyzeMediaService } from "../../services/downloads/analyze-media-service";
import { createAuthenticateMiddleware } from "../middlewares/authenticate-middleware";
import { createMediaController } from "../controllers/media-controller";

interface MediaRoutesDependencies {
  analyzeMediaService: Pick<AnalyzeMediaService, "execute">;
  verifyToken: (token: string) => Promise<{ subject: string }>;
}

function createMediaRoutes(dependencies: MediaRoutesDependencies): Router {
  const router = Router();
  const controller = createMediaController(dependencies);
  const authenticate = createAuthenticateMiddleware({ verifyToken: dependencies.verifyToken });

  router.post("/media/analysis", authenticate, controller.analyze);
  return router;
}

export { createMediaRoutes };