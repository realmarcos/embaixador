import { Router } from "express";
import { MediaStorageProvider } from "../../providers/media-storage";
import { CreateDownloadService } from "../../services/downloads/create-download-service";
import { FindDownloadService } from "../../services/downloads/find-download-service";
import { createDownloadController } from "../controllers/download-controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate-middleware";

interface DownloadRoutesDependencies {
  createDownloadService: Pick<CreateDownloadService, "execute">;
  findDownloadService: Pick<FindDownloadService, "execute">;
  mediaStorage: Pick<MediaStorageProvider, "getObjectStream">;
  verifyToken: (token: string) => Promise<{ subject: string }>;
}

function createDownloadRoutes(dependencies: DownloadRoutesDependencies): Router {
  const router = Router();
  const controller = createDownloadController(dependencies);
  const authenticate = createAuthenticateMiddleware({ verifyToken: dependencies.verifyToken });

  router.post("/downloads", authenticate, controller.create);
  router.get("/downloads/:downloadId", authenticate, controller.find);
  router.get("/downloads/:downloadId/file", authenticate, controller.stream);
  return router;
}

export { createDownloadRoutes };