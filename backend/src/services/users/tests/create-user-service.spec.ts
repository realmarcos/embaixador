import { beforeEach, describe, expect, it, vi } from "vitest"
import { CreateUserService } from "../create-user-service"
import { InMemoryUserRepository } from "../../../repositories/implementations/in-memory/users"
import { UserCreateInput } from "../../../repositories/users/types";

let userRepository: InMemoryUserRepository;
let createUserService: CreateUserService;


describe("Create User service", () => {

  beforeEach(() => {
    userRepository = new InMemoryUserRepository()
    createUserService = new CreateUserService(userRepository)
  });

  it("Should create the user when the data is valid.", async () => {

    await createUserService.execute({
      name: "Marcos",
      email: "marcos@example.com",
      password: "password123",
      avatar: "avatar.png",
    });

    const user = userRepository.users[0]; // get first user (after push)

    expect(userRepository.users).toHaveLength(11)
    expect(userRepository.users[0]?.email).toEqual(user?.email)
  });

  it("Should reject the creation user when email is already registered.", async () => {

    const userData: UserCreateInput = {
      name: "Marcos",
      email: "marcos@example.com",
      password: "password123",
      avatar: "avatar.png",
    }

    await userRepository.create(userData);
    await expect(createUserService.execute(userData)).rejects.toThrow("User already exists")
  })

  it("maps repository creation failures without exposing raw errors to callers", async () => {
    const failingRepository = new InMemoryUserRepository();
    vi.spyOn(failingRepository, "findByEmail").mockResolvedValue(null);
    vi.spyOn(failingRepository, "create").mockRejectedValue(new Error("database password"));
    const service = new CreateUserService(failingRepository);

    await expect(service.execute({
      name: "Test",
      email: "test@example.test",
      password: "plain-password",
      avatar: "",
    })).rejects.toMatchObject({ code: "USER_CREATION_FAILED", statusCode: 500 });
  });
})