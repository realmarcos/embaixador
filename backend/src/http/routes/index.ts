import { Router } from "express";
import { createAuthRoutes } from "./auth-routes";
import { createMediaRoutes } from "./media-routes";
import { createDownloadRoutes } from "./download-routes";
import { createSettingsRoutes } from "./settings-routes";
import { createHistoryRoutes } from "./history-routes";
import { SettingsRoutesDependencies } from "./settings-routes";
import { HistoryRoutesDependencies } from "./history-routes";

interface CreateApiRouterInput {
  auth: Parameters<typeof createAuthRoutes>[0];
  media: Parameters<typeof createMediaRoutes>[0];
  downloads: Parameters<typeof createDownloadRoutes>[0];
  settings: SettingsRoutesDependencies;
  history: HistoryRoutesDependencies;
}

function createApiRouter({ auth, media, downloads, settings, history }: CreateApiRouterInput): Router {
  const router = Router();
  router.use("/auth", createAuthRoutes(auth));
  router.use(createMediaRoutes(media));
  router.use(createDownloadRoutes(downloads));
  router.use(createSettingsRoutes(settings));
  router.use(createHistoryRoutes(history));
  return router;
}

export { createApiRouter };