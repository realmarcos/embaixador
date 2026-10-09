import { PrismaClient } from "@prisma/client";
import { AccountRepository } from "../../../users";
import { RetentionHours, User, UserRecordCreateInput } from "../../../users/types";

type PersistedUser = Omit<User, "avatar" | "retentionHours"> & {
  avatar: string | null;
  retentionHours: number;
};

const allowedRetentionHours: number[] = [1, 8, 24, 72, 168, 336, 720];

function toDomainUser(user: PersistedUser): User {
  if (!allowedRetentionHours.includes(user.retentionHours)) {
    throw new Error("Persisted retentionHours is outside the supported values");
  }

  return {
    ...user,
    avatar: user.avatar ?? "",
    retentionHours: user.retentionHours as RetentionHours,
  };
}

class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? toDomainUser(user) : null;
  }

  async findByNormalizedEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    return user ? toDomainUser(user) : null;
  }

  async createAccount(account: UserRecordCreateInput): Promise<User> {
    const user = await this.prisma.user.create({ data: account });
    return toDomainUser(user);
  }
}

export { PrismaAccountRepository };