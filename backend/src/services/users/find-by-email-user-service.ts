
import { AppError } from "../../errors/app-errors";
import { UserRepository } from "../../repositories/users";
import { User } from "../../repositories/users/types";

class FindByEmailUserService {

  constructor(private userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async execute(email: string): Promise<User | null> {
    try {
      return await this.userRepository.findByEmail(email);
    } catch (error) {
      throw new AppError({
        message: "Error finding user by email",
        code: "USER_FIND_BY_EMAIL_FAILED",
        statusCode: 500,
        details: JSON.stringify(error)
      });
    }
  }

}

export { FindByEmailUserService };