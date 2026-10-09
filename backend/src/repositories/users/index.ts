import {
  User,
  UserCreateInput,
  UserRecordCreateInput,
  UserUpdateInput,
} from "./types";


export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  listAll(): Promise<User[]>;
  create(user: UserCreateInput): Promise<void>;
  update(user: UserUpdateInput): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface AccountRepository {
  findByNormalizedEmail(email: string): Promise<User | null>;
  createAccount(account: UserRecordCreateInput): Promise<User>;
}