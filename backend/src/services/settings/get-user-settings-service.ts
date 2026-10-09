import { AppError } from "../../errors/app-errors";
import { UserSettingsRepository } from "../../repositories/settings";

interface GetUserSettingsServiceDependencies {
  settingsRepository: Pick<UserSettingsRepository, "findByUserId">;
}

class GetUserSettingsService {
  constructor(private readonly dependencies: GetUserSettingsServiceDependencies) {}

  async execute(userId: string) {
    const settings = await this.dependencies.settingsRepository.findByUserId(userId);
    if (!settings) {
      throw new AppError({ message: "Account not found", code: "ACCOUNT_NOT_FOUND", statusCode: 404 });
    }
    return settings;
  }
}

export { GetUserSettingsService };