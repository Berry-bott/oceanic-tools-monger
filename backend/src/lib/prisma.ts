import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runtimeDatabaseUrl } from "./runtime-env.js";
import { safeErrorMetadata } from "./safe-error.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter: new PrismaPg(
    {
      connectionString: runtimeDatabaseUrl,
      max: 10,
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 30_000,
    },
    {
      onPoolError: (error) => console.error("PostgreSQL connection pool error.", safeErrorMetadata(error)),
      onConnectionError: (error) => console.error("PostgreSQL connection error.", safeErrorMetadata(error)),
    },
  ),
  transactionOptions: {
    maxWait: 10_000,
    timeout: 15_000,
  },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
