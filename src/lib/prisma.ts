import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prismaV2: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prismaV2 ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prismaV2 = prisma;

