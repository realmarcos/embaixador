import type { PrismaClient } from "@prisma/client";
import { PrismaUserSettingsRepository } from "../../repositories/implementations/prisma/settings";
import { GetUserSettingsService } from "../../services/settings/get-user-settings-service";
import { UpdateUserSettingsService } from "../../services/settings/update-user-settings-service";

function createUserSettingsServiceFactory(prisma: PrismaClient) {
  const settingsRepository = new PrismaUserSettingsRepository(prisma);
  return {
    settingsRepository,
    getUserSettingsService: new GetUserSettingsService({ settingsRepository }),
    updateUserSettingsService: new UpdateUserSettingsService({ settingsRepository }),
  };
}

export { createUserSettingsServiceFactory };