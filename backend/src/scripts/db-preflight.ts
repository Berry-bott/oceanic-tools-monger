import "dotenv/config";

const raw = process.env.DIRECT_URL;
if (!raw) {
  console.error("Migration preflight failed: DIRECT_URL is required for Prisma Migrate. Set it only in the migration job environment.");
  process.exit(1);
}

const pooledRaw = process.env.DATABASE_URL;
if (!pooledRaw) {
  console.error("Migration preflight failed: DATABASE_URL is also required by the Prisma schema; use the pooled URL in the migration task.");
  process.exit(1);
}

let pooledUrl: URL;
try {
  pooledUrl = new URL(pooledRaw);
} catch {
  console.error("Migration preflight failed: DATABASE_URL must be a valid PostgreSQL URL.");
  process.exit(1);
}
if ((pooledUrl.protocol !== "postgres:" && pooledUrl.protocol !== "postgresql:") || !pooledUrl.hostname.includes("-pooler") || pooledUrl.searchParams.get("sslmode") !== "require") {
  console.error("Migration preflight failed: DATABASE_URL must use a TLS-enabled Neon pooled host.");
  process.exit(1);
}

let url: URL;
try {
  url = new URL(raw);
} catch {
  console.error("Migration preflight failed: DIRECT_URL must be a valid PostgreSQL URL.");
  process.exit(1);
}

if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
  console.error("Migration preflight failed: DIRECT_URL must use the PostgreSQL protocol.");
  process.exit(1);
}
if (url.hostname.includes("-pooler")) {
  console.error("Migration preflight failed: DIRECT_URL must use Neon direct host, without -pooler.");
  process.exit(1);
}
if (url.searchParams.get("sslmode") !== "require") {
  console.error("Migration preflight failed: DIRECT_URL must include sslmode=require.");
  process.exit(1);
}

const timeout = Number(url.searchParams.get("connect_timeout"));
if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60) {
  console.error("Migration preflight failed: set connect_timeout to an integer from 1 to 60 seconds.");
  process.exit(1);
}

console.info("Migration preflight passed: pooled and direct PostgreSQL URLs have the expected TLS and host settings.");
