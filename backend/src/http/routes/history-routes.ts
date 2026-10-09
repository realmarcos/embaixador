import { Router } from "express";
import { DeleteHistoryService } from "../../services/history/delete-history-service";
import { ListHistoryService } from "../../services/history/list-history-service";
import { RedownloadFromHistoryService } from "../../services/history/redownload-from-history-service";
import { createHistoryController } from "../controllers/history-controller";
import { createAuthenticateMiddleware } from "../middlewares/authenticate-middleware";

export interface HistoryRoutesDependencies {
  listHistoryService: Pick<ListHistoryService, "execute">;
  deleteHistoryService: Pick<DeleteHistoryService, "deleteMedia" | "deleteOne" | "deleteAll">;
  redownloadService: Pick<RedownloadFromHistoryService, "execute">;
  verifyToken: (token: string) => Promise<{ subject: string }>;
}

function createHistoryRoutes(dependencies: HistoryRoutesDependencies): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware({ verifyToken: dependencies.verifyToken });
  const controller = createHistoryController(dependencies);
  router.get("/history", authenticate, controller.list);
  router.delete("/history", authenticate, controller.deleteAll);
  router.delete("/history/:downloadId/media", authenticate, controller.deleteMedia);
  router.delete("/history/:downloadId", authenticate, controller.deleteOne);
  router.post("/history/:downloadId/redownload", authenticate, controller.redownload);
  return router;
}

export { createHistoryRoutes };