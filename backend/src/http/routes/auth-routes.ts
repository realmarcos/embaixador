import { Router } from "express";
import { createAuthenticateMiddleware } from "../middlewares/authenticate-middleware";
import { createAuthController } from "../controllers/auth-controller";
import { LoginUserService } from "../../services/auth/login-user-service";
import { RegisterUserService } from "../../services/auth/register-user-service";
import { User } from "../../repositories/users/types";

interface AuthRoutesDependencies {
  registerUserService: Pick<RegisterUserService, "execute">;
  loginUserService: Pick<LoginUserService, "execute">;
  findUserByIdService: { execute(id: string): Promise<User | null> };
  verifyToken: (token: string) => Promise<{ subject: string }>;
  nodeEnv: string;
  sessionMaxAgeSeconds: number;
}

function createAuthRoutes(dependencies: AuthRoutesDependencies): Router {
  const router = Router();
  const controller = createAuthController(dependencies);
  const authenticate = createAuthenticateMiddleware({ verifyToken: dependencies.verifyToken });

  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/logout", authenticate, controller.logout);
  router.get("/me", authenticate, controller.me);

  return router;
}

export { createAuthRoutes };