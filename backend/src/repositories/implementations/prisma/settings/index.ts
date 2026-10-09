import type { PrismaClient } from "@prisma/client";
import { UserSettingsRepository } from "../../../settings";
import { UserSettings, UserSettingsUpdate } from "../../../settings/types";
import { RetentionHours } from "../../../users/types";

const allowedRetentionHours: RetentionHours[] = [1, 8, 24, 72, 168, 336, 720];

function toSettings(themePreference: string, retentionHours: number): UserSettings {
  if ((themePreference !== "LIGHT" && themePreference !== "DARK") || !allowedRetentionHours.includes(retentionHours as RetentionHours)) {
    throw new Error("Persisted user settings are outside the supported values");
  }

  return {
    themePreference,
    retentionHours: retentionHours as RetentionHours,
  };
}

class PrismaUserSettingsRepository implements UserSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<UserSettings | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { themePreference: true, retentionHours: true },
    });
    return user ? toSettings(user.themePreference, user.retentionHours) : null;
  }

  async updateByUserId(userId: string, settings: UserSettingsUpdate): Promise<UserSettings | null> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: settings,
        select: { themePreference: true, retentionHours: true },
      });
      return toSettings(user.themePreference, user.retentionHours);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
        return null;
      }
      throw error;
    }
  }
}

export { PrismaUserSettingsRepository };