import { PrismaClient, Prisma } from "@prisma/client";

export * from "@prisma/client";
export { Prisma };

/**
 * The one user this installation serves. Every row's userId is this value.
 * Kept as a column and a parameter so a second user is a data change, not a
 * schema change.
 */
export const LOCAL_USER_ID = "local";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

/**
 * Runs fn inside a transaction. The userId is not used for isolation any
 * more (there is one user and no RLS); it stays in the signature so every
 * data access site names whose data it touches and so the multi-user
 * version, if it ever comes, is a change here rather than everywhere.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!userId) throw new Error("withUser called without a userId");
  return prisma.$transaction(fn);
}
