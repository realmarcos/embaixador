import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryUserRepository } from "../../../repositories/implementations/in-memory/users";
import { InMemoryUserSettingsRepository } from "../../../repositories/implementations/in-memory/settings";
import { GetUserSettingsService } from "../get-user-settings-service";
import { UpdateUserSettingsService } from "../update-user-settings-service";

describe("user settings services", () => {
  let users: InMemoryUserRepository;
  let settingsRepository: InMemoryUserSettingsRepository;
  let getSettingsService: GetUserSettingsService;
  let updateSettingsService: UpdateUserSettingsService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    settingsRepository = new InMemoryUserSettingsRepository(users);
    getSettingsService = new GetUserSettingsService({ settingsRepository });
    updateSettingsService = new UpdateUserSettingsService({ settingsRepository });
  });

  it("returns the persisted default theme and one-hour retention", async () => {
    await expect(getSettingsService.execute("1")).resolves.toEqual({
      themePreference: "LIGHT",
      retentionHours: 1,
    });
  });

  it.each([1, 8, 24, 72, 168, 336, 720])("accepts %i-hour retention", async (retentionHours) => {
    await expect(updateSettingsService.execute({ userId: "1", settings: { retentionHours: retentionHours as 1 } })).resolves.toEqual({
      themePreference: "LIGHT",
      retentionHours,
    });
  });

  it("accepts either supported theme preference", async () => {
    await expect(updateSettingsService.execute({
      userId: "1",
      settings: { themePreference: "DARK" },
    })).resolves.toMatchObject({ themePreference: "DARK" });
  });

  it.each([0, 2, 48, 1440])("rejects unsupported retention value %i", async (retentionHours) => {
    await expect(updateSettingsService.execute({
      userId: "1",
      settings: { retentionHours: retentionHours as 1 },
    })).rejects.toMatchObject({ code: "INVALID_SETTINGS", statusCode: 400 });
  });

  it("rejects unsupported themes and empty updates", async () => {
    await expect(updateSettingsService.execute({
      userId: "1",
      settings: { themePreference: "SYSTEM" as "DARK" },
    })).rejects.toMatchObject({ code: "INVALID_SETTINGS", statusCode: 400 });
    await expect(updateSettingsService.execute({ userId: "1", settings: {} }))
      .rejects.toMatchObject({ code: "INVALID_SETTINGS", statusCode: 400 });
  });

  it("reads and updates only the requested account", async () => {
    await updateSettingsService.execute({ userId: "1", settings: { retentionHours: 8 } });

    await expect(getSettingsService.execute("1")).resolves.toMatchObject({ retentionHours: 8 });
    await expect(getSettingsService.execute("2")).resolves.toEqual({
      themePreference: "LIGHT",
      retentionHours: 1,
    });
  });

  it("rejects settings for an unknown account", async () => {
    await expect(getSettingsService.execute("unknown")).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
    await expect(updateSettingsService.execute({ userId: "unknown", settings: { retentionHours: 8 } }))
      .rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
  });
});