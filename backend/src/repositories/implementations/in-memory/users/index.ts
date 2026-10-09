import { randomUUID } from "node:crypto";
import { AccountRepository, UserRepository } from "../../../users";
import { User, UserCreateInput, UserRecordCreateInput, UserUpdateInput } from "../../../users/types";
import { users } from "../fake-data/users";


class InMemoryUserRepository implements UserRepository, AccountRepository {
  public users: User[] = [];

  constructor() {
    this.users = users.map((user) => ({ ...user }));
  }

  findById(id: string): Promise<User | null> {
    const user = this.users.find(user => user.id === id);
    return Promise.resolve(user ?? null);
  }

  findByEmail(email: string): Promise<User | null> {
    const user = this.users.find(user => user.email === email);
    return Promise.resolve(user ?? null);
  }

  findByNormalizedEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.users.find((candidate) => candidate.email.trim().toLowerCase() === normalizedEmail);
    return Promise.resolve(user ?? null);
  }

  createAccount(account: UserRecordCreateInput): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      ...account,
      createdAt: now,
      updatedAt: now,
    };

    this.users.unshift(user);
    return Promise.resolve(user);
  }

  listAll(): Promise<User[]> {
    return Promise.resolve(this.users);
  }

  create(user: UserCreateInput): Promise<void> {
    const newUser: User = {
      id: (this.users.length + 1).toString(),
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      passwordHash: "",
      themePreference: user.themePreference ?? "LIGHT",
      retentionHours: user.retentionHours ?? 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.unshift(newUser);
    return Promise.resolve();
  }

  update(user: UserUpdateInput): Promise<void> {
    const indexUser = this.users.findIndex(u => u.id === user.id);
    const oldUser = this.users[indexUser];

    if (indexUser !== -1 && oldUser) {
      this.users[indexUser] = {
        id: user.id,
        avatar: user.avatar ?? oldUser.avatar,
        email: user.email ?? oldUser.email,
        name: user.name ?? oldUser.name,
        passwordHash: oldUser.passwordHash,
        themePreference: user.themePreference ?? oldUser.themePreference,
        retentionHours: user.retentionHours ?? oldUser.retentionHours,
        createdAt: oldUser.createdAt,
        updatedAt: new Date(),
      };
    }

    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.users = this.users.filter(user => user.id !== id);
    return Promise.resolve();
  }

}


export { InMemoryUserRepository };