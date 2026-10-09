import { UserRepository } from "../../../users";
import { UserSettingsRepository } from "../../../settings";
import { UserSettings, UserSettingsUpdate } from "../../../settings/types";

class InMemoryUserSettingsRepository implements UserSettingsRepository {
  constructor(private readonly userRepository: Pick<UserRepository, "findById" | "update">) {}

  async findByUserId(userId: string): Promise<UserSettings | null> {
    const user = await this.userRepository.findById(userId);
    return user ? { themePreference: user.themePreference, retentionHours: user.retentionHours } : null;
  }

  async updateByUserId(userId: string, settings: UserSettingsUpdate): Promise<UserSettings | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    await this.userRepository.update({ id: userId, ...settings });
    return {
      themePreference: settings.themePreference ?? user.themePreference,
      retentionHours: settings.retentionHours ?? user.retentionHours,
    };
  }
}

export { InMemoryUserSettingsRepository };