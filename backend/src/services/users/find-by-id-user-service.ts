
import { UserRepository } from "../../repositories/users";
import { User } from "../../repositories/users/types";
import { AppError } from "../../errors/app-errors";

class FindByIdUserService {

  constructor(private userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async execute(id: string): Promise<User | null> {
    try {
      return await this.userRepository.findById(id);
    } catch (error) {
      throw new AppError({
        message: "Error finding user by ID",
        code: "USER_FIND_BY_ID_FAILED",
        statusCode: 500,
        details: JSON.stringify(error)
      });
    }
  }
}

export { FindByIdUserService };