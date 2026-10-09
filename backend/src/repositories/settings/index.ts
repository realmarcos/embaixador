import { UserSettings, UserSettingsUpdate } from "./types";

interface UserSettingsRepository {
  findByUserId(userId: string): Promise<UserSettings | null>;
  updateByUserId(userId: string, settings: UserSettingsUpdate): Promise<UserSettings | null>;
}

export { UserSettingsRepository };