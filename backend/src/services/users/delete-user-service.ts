
import { AppError } from "../../errors/app-errors";
import { UserRepository } from "../../repositories/users";

class DeleteUserService {

  constructor(private userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async execute(id: string): Promise<void> {
    const userExists = await this.userRepository.findById(id);

    if (!userExists) {
      throw new AppError({ message: "User not found", code: "USER_NOT_FOUND", statusCode: 404 });
    }

    try {
      await this.userRepository.delete(id);
    } catch (error) {
      throw new AppError({ message: "Error deleting user", code: "USER_DELETE_FAILED", statusCode: 500, details: JSON.stringify(error) });
    }
  }
}

export { DeleteUserService };