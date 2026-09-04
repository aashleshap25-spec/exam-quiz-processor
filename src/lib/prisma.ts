import { PrismaClient } from "@prisma/client";

// In dev, Next.js hot-reloads modules on every file change.
// Without this guard, that would create a brand new PrismaClient
// (and a new DB connection pool) on every reload.
// We stash the client on the global object so it survives reloads.

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
