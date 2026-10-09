import { AppError } from "../../errors/app-errors";
import { AccountRepository } from "../../repositories/users";
import { PublicUser, User } from "../../repositories/users/types";
import { PasswordHasher } from "./password-hasher";
import { SessionTokenSigner } from "./session-token-signer";

interface LoginUserInput {
  email: string;
  password: string;
}

interface LoginUserServiceDependencies {
  accountRepository: AccountRepository;
  passwordHasher: PasswordHasher;
  tokenSigner: SessionTokenSigner;
}

interface LoginUserResult {
  user: PublicUser;
  token: string;
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

class LoginUserService {
  constructor(private readonly dependencies: LoginUserServiceDependencies) {}

  async execute(input: LoginUserInput): Promise<LoginUserResult> {
    const email = input.email.trim().toLowerCase();
    const user = await this.dependencies.accountRepository.findByNormalizedEmail(email);

    if (!user || input.password.length === 0 || input.password.length > 128) {
      throw this.invalidCredentialsError();
    }

    const passwordMatches = await this.dependencies.passwordHasher.verify(
      user.passwordHash,
      input.password,
    );
    if (!passwordMatches) {
      throw this.invalidCredentialsError();
    }

    return {
      user: toPublicUser(user),
      token: await this.dependencies.tokenSigner.sign(user.id),
    };
  }

  private invalidCredentialsError(): AppError {
    return new AppError({
      message: "Invalid email or password",
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  }
}

export { LoginUserService };