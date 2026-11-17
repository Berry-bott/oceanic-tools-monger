import "dotenv/config";
import { prisma } from "../lib/prisma.js";

async function main() {
  console.log("Cleaning all tables in database...");
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename::text as tablename FROM pg_tables WHERE schemaname='public';
  `;

  for (const { tablename } of tables) {
    if (tablename === "_prisma_migrations") continue;
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`);
      console.log(`Truncated table: ${tablename}`);
    } catch (err) {
      console.error(`Error truncating ${tablename}:`, err);
    }
  }

  console.log("Database reset complete: all tables are clean.");
}

main()
  .catch((e) => {
    console.error("Database reset failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
