
import { AppError } from "../../errors/app-errors";
import { UserRepository } from "../../repositories/users";
import { UserCreateInput } from "../../repositories/users/types";

class CreateUserService {

  constructor(private userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async execute({ name, email, avatar, password }: UserCreateInput): Promise<void> {
    const userAlreadyExists = await this.userRepository.findByEmail(email);

    if (userAlreadyExists) {
      throw new AppError({ message: "User already exists", code: "USER_ALREADY_EXISTS", statusCode: 400 });
    }

    try {
      await this.userRepository.create({ name, email, avatar, password });
    } catch (error) {
      throw new AppError({ message: "Error creating user", code: "USER_CREATION_FAILED", statusCode: 500, details: JSON.stringify(error) });
    }

  }
}

export { CreateUserService };