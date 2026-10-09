
import { AppError } from "../../errors/app-errors";
import { UserRepository } from "../../repositories/users";
import { UserUpdateInput } from "../../repositories/users/types";

class UpdateUserService {

  constructor(private userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async execute({ id, name, email, avatar, password }: UserUpdateInput): Promise<void> {
    const userExists = await this.userRepository.findById(id);

    if (!userExists) {
      throw new AppError({ message: "User not found", code: "USER_NOT_FOUND", statusCode: 404 });
    }

    const userAlreadyExistsWithEmail = await this.userRepository.findByEmail(email ?? "");

    if (userAlreadyExistsWithEmail && userAlreadyExistsWithEmail.id !== id) {
      throw new AppError({ message: "Email already in use", code: "EMAIL_ALREADY_IN_USE", statusCode: 400 });
    }

    try {
      await this.userRepository.update({ id, name, email, avatar, password });
    } catch (error) {
      throw new AppError({ message: "Error updating user", code: "USER_UPDATE_FAILED", statusCode: 500, details: JSON.stringify(error) });
    }
  }

}

export { UpdateUserService };