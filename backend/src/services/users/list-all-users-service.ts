
import { AppError } from "../../errors/app-errors";
import { UserRepository } from "../../repositories/users";
import { User } from "../../repositories/users/types";

class ListAllUsersService {

  constructor(private userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async execute(): Promise<User[]> {
    try {
      return await this.userRepository.listAll();
    } catch (error) {
      throw new AppError({ message: "Error listing users", code: "USER_LIST_FAILED", statusCode: 500, details: JSON.stringify(error) });
    }
  }
};


export { ListAllUsersService };