import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryUserRepository } from "../../../repositories/implementations/in-memory/users";
import { FakePasswordHasher } from "./fakes/fake-password-hasher";
import { LoginUserService } from "../login-user-service";

const user = {
  id: "user-1",
  name: "Ana Silva",
  email: "ana@example.com",
  passwordHash: "",
  avatar: "",
  themePreference: "LIGHT" as const,
  retentionHours: 1 as const,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("LoginUserService", () => {
  let accountRepository: InMemoryUserRepository;
  let passwordHasher: FakePasswordHasher;
  const tokenSigner = { sign: vi.fn() };
  let service: LoginUserService;

  beforeEach(async () => {
    vi.clearAllMocks();
    accountRepository = new InMemoryUserRepository();
    passwordHasher = new FakePasswordHasher();
    await accountRepository.createAccount({
      ...user,
      passwordHash: await passwordHasher.hash("correct-password"),
    });
    service = new LoginUserService({ accountRepository, passwordHasher, tokenSigner });
  });

  it("normalizes email, verifies the hash, and issues a token for the account", async () => {
    tokenSigner.sign.mockResolvedValue("signed-jws");

    const result = await service.execute({ email: " ANA@Example.com ", password: "correct-password" });

    expect(passwordHasher.verifyInputs).toEqual([
      { passwordHash: "test-hash:correct-password", password: "correct-password" },
    ]);
    expect(tokenSigner.sign).toHaveBeenCalledWith("user-1");
    expect(result.token).toBe("signed-jws");
    expect(result.user).not.toHaveProperty("passwordHash");
  });

  it("returns the same safe authentication failure for an unknown email", async () => {
    await expect(
      service.execute({ email: "unknown@example.com", password: "wrong-password" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", statusCode: 401 });

    expect(passwordHasher.verifyInputs).toHaveLength(0);
    expect(tokenSigner.sign).not.toHaveBeenCalled();
  });

  it("does not issue a token when the password does not match", async () => {
    await expect(
      service.execute({ email: "ana@example.com", password: "wrong-password" }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", statusCode: 401 });

    expect(tokenSigner.sign).not.toHaveBeenCalled();
  });
});