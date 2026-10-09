import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../../../errors/app-errors";
import { InMemoryUserRepository } from "../../../repositories/implementations/in-memory/users";
import { FakePasswordHasher } from "./fakes/fake-password-hasher";
import { RegisterUserService } from "../register-user-service";

describe("RegisterUserService", () => {
  let accountRepository: InMemoryUserRepository;
  let passwordHasher: FakePasswordHasher;
  let service: RegisterUserService;

  beforeEach(() => {
    accountRepository = new InMemoryUserRepository();
    passwordHasher = new FakePasswordHasher();
    service = new RegisterUserService({ accountRepository, passwordHasher });
  });

  it("normalizes email, hashes the password, and returns no password hash", async () => {
    const result = await service.execute({
      name: "New User",
      email: "  New@Example.com ",
      password: "long-enough-password",
    });

    const persistedUser = accountRepository.users.find((user) => user.email === "new@example.com");
    expect(passwordHasher.hashInputs).toEqual(["long-enough-password"]);
    expect(persistedUser).toMatchObject({
      name: "New User",
      email: "new@example.com",
      passwordHash: "test-hash:long-enough-password",
      themePreference: "LIGHT",
      retentionHours: 1,
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result.email).toBe("new@example.com");
  });

  it("rejects a duplicate normalized email before hashing the password", async () => {
    await accountRepository.createAccount({
      name: "Existing User",
      email: "existing@example.com",
      avatar: "",
      passwordHash: "test-hash:existing-password",
      themePreference: "LIGHT",
      retentionHours: 1,
    });

    await expect(
      service.execute({ name: "New User", email: " EXISTING@example.com ", password: "long-enough-password" }),
    ).rejects.toMatchObject({ code: "USER_ALREADY_EXISTS", statusCode: 409 });

    expect(passwordHasher.hashInputs).toHaveLength(0);
    expect(accountRepository.users).toHaveLength(11);
  });

  it.each([
    { name: "", email: "user@example.com", password: "long-enough-password" },
    { name: "Valid Name", email: "not-an-email", password: "long-enough-password" },
    { name: "Valid Name", email: "user@example.com", password: "short" },
    { name: "x".repeat(121), email: "user@example.com", password: "long-enough-password" },
  ])("rejects invalid registration input without persisting", async (input) => {
    await expect(service.execute(input)).rejects.toBeInstanceOf(AppError);
    expect(accountRepository.users).toHaveLength(10);
  });
});