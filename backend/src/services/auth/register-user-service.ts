import { AppError } from "../../errors/app-errors";
import { AccountRepository } from "../../repositories/users";
import { PublicUser, RetentionHours, ThemePreference, User } from "../../repositories/users/types";
import { PasswordHasher } from "./password-hasher";

interface RegisterUserInput {
  name: string;
  email: string;
  password: string;
}

interface RegisterUserServiceDependencies {
  accountRepository: AccountRepository;
  passwordHasher: PasswordHasher;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    themePreference: user.themePreference,
    retentionHours: user.retentionHours,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

class RegisterUserService {
  constructor(private readonly dependencies: RegisterUserServiceDependencies) {}

  async execute(input: RegisterUserInput): Promise<PublicUser> {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();

    if (name.length < 1 || name.length > 120) {
      throw new AppError({
        message: "Name must contain between 1 and 120 characters",
        code: "INVALID_NAME",
        statusCode: 400,
      });
    }

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError({
        message: "A valid email address is required",
        code: "INVALID_EMAIL",
        statusCode: 400,
      });
    }

    if (input.password.length < 12 || input.password.length > 128) {
      throw new AppError({
        message: "Password must contain between 12 and 128 characters",
        code: "INVALID_PASSWORD",
        statusCode: 400,
      });
    }

    const userAlreadyExists = await this.dependencies.accountRepository.findByNormalizedEmail(email);
    if (userAlreadyExists) {
      throw new AppError({
        message: "An account with this email already exists",
        code: "USER_ALREADY_EXISTS",
        statusCode: 409,
      });
    }

    const passwordHash = await this.dependencies.passwordHasher.hash(input.password);
    const user = await this.dependencies.accountRepository.createAccount({
      name,
      email,
      avatar: "",
      passwordHash,
      themePreference: "LIGHT" satisfies ThemePreference,
      retentionHours: 1 satisfies RetentionHours,
    });

    return toPublicUser(user);
  }
}

export { RegisterUserService };