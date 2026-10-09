import { describe, expect, it } from "vitest";
import { InMemoryUserRepository } from "../index";

describe("InMemoryUserRepository", () => {
  it("supports lookup, normalization, list, update, and delete", async () => {
    const repository = new InMemoryUserRepository();
    const initialCount = repository.users.length;

    await expect(repository.findById("1")).resolves.toMatchObject({ id: "1" });
    await expect(repository.findById("missing")).resolves.toBeNull();
    await expect(repository.findByEmail("ana.silva@example.com")).resolves.toMatchObject({ id: "1" });
    await expect(repository.findByEmail("ANA.SILVA@example.com")).resolves.toBeNull();
    await expect(repository.findByNormalizedEmail(" ANA.SILVA@EXAMPLE.COM ")).resolves.toMatchObject({ id: "1" });
    await expect(repository.findByNormalizedEmail("missing@example.com")).resolves.toBeNull();
    await expect(repository.listAll()).resolves.toHaveLength(initialCount);

    await repository.create({ name: "New User", email: "new@example.test", password: "plain", avatar: "" });
    const createdUser = repository.users[0];
    expect(createdUser).toMatchObject({
      name: "New User",
      themePreference: "LIGHT",
      retentionHours: 1,
      passwordHash: "",
    });
    if (!createdUser) throw new Error("Expected a user to have been created");
    await repository.update({ id: createdUser.id, themePreference: "DARK", retentionHours: 24 });
    expect(repository.users[0]).toMatchObject({ themePreference: "DARK", retentionHours: 24 });
    await repository.update({ id: "missing", name: "Ignored" });
    await repository.delete("missing");
    expect(repository.users).toHaveLength(initialCount + 1);
    await repository.delete(createdUser.id);
    expect(repository.users).toHaveLength(initialCount);
  });

  it("creates an account record with supplied authentication and settings values", async () => {
    const repository = new InMemoryUserRepository();

    const createdUser = await repository.createAccount({
      name: "Account User",
      email: "account@example.test",
      avatar: "avatar.png",
      passwordHash: "scrypt-hash",
      themePreference: "DARK",
      retentionHours: 24,
    });
    expect(createdUser.id.length).toBeGreaterThan(0);
    expect(createdUser).toMatchObject({
      email: "account@example.test",
      passwordHash: "scrypt-hash",
      themePreference: "DARK",
      retentionHours: 24,
    });
  });
});