import { PrismaClient } from "@prisma/client";

interface CreatePrismaClientInput {
  databaseUrl: string;
}

function createPrismaClient({ databaseUrl }: CreatePrismaClientInput): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}

export { createPrismaClient };