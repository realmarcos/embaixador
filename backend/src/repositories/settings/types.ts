import { RetentionHours, ThemePreference } from "../users/types";

interface UserSettings {
  themePreference: ThemePreference;
  retentionHours: RetentionHours;
}

type UserSettingsUpdate = Partial<UserSettings>;

export { UserSettings, UserSettingsUpdate };