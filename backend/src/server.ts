import "dotenv/config";
import { app } from "./app.js";
import { prisma } from "./lib/prisma.js";

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, () => console.info(`Oceanic Tools API listening on port ${port}`));

async function shutdown(signal: string) {
  console.info(`${signal} received. Shutting down API.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
