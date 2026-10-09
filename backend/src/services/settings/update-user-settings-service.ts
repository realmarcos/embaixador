import { AppError } from "../../errors/app-errors";
import { UserSettingsRepository } from "../../repositories/settings";
import { RetentionHours, ThemePreference } from "../../repositories/users/types";
import { UserSettingsUpdate } from "../../repositories/settings/types";

const allowedRetentionHours: RetentionHours[] = [1, 8, 24, 72, 168, 336, 720];
const allowedThemePreferences: ThemePreference[] = ["LIGHT", "DARK"];

interface UpdateUserSettingsServiceInput {
  userId: string;
  settings: UserSettingsUpdate;
}

interface UpdateUserSettingsServiceDependencies {
  settingsRepository: Pick<UserSettingsRepository, "updateByUserId">;
}

function invalidSettingsError(): AppError {
  return new AppError({
    message: "The settings values are invalid",
    code: "INVALID_SETTINGS",
    statusCode: 400,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSettings(value: unknown): UserSettingsUpdate {
  if (!isRecord(value)) {
    throw invalidSettingsError();
  }

  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some((key) => key !== "themePreference" && key !== "retentionHours") ||
    ("themePreference" in value && !allowedThemePreferences.includes(value.themePreference as ThemePreference)) ||
    ("retentionHours" in value && !allowedRetentionHours.includes(value.retentionHours as RetentionHours))
  ) {
    throw invalidSettingsError();
  }

  return {
    ...(typeof value.themePreference === "string" ? { themePreference: value.themePreference as ThemePreference } : {}),
    ...(typeof value.retentionHours === "number" ? { retentionHours: value.retentionHours as RetentionHours } : {}),
  };
}

class UpdateUserSettingsService {
  constructor(private readonly dependencies: UpdateUserSettingsServiceDependencies) {}

  async execute({ userId, settings }: UpdateUserSettingsServiceInput) {
    const validatedSettings = validateSettings(settings);
    const updated = await this.dependencies.settingsRepository.updateByUserId(userId, validatedSettings);
    if (!updated) {
      throw new AppError({ message: "Account not found", code: "ACCOUNT_NOT_FOUND", statusCode: 404 });
    }
    return updated;
  }
}

export { UpdateUserSettingsService };