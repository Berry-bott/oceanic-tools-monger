const databaseUrl = process.env.DATABASE_URL;

function validateDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("DATABASE_URL is required for API and worker runtime.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol.");
  }

  if (!url.hostname) throw new Error("DATABASE_URL must include a database host.");

  if (process.env.NODE_ENV === "production") {
    if (!url.hostname.includes("-pooler")) {
      throw new Error("Production DATABASE_URL must use Neon pooled host for application traffic.");
    }
    if (!["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "")) {
      throw new Error("Production DATABASE_URL must require TLS with sslmode=require or sslmode=verify-full.");
    }
  }

  // pg-connection-string currently treats `require` as `verify-full`, but
  // warns that this alias will change in pg 9. Make today's verified behavior
  // explicit so future pg upgrades do not silently weaken TLS verification.
  if (url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("sslmode", "verify-full");
  }

  // Neon may need extra time to wake an idle compute. Keep an explicit
  // setting from the deployment environment, but use a safer default when
  // the pooled runtime URL omits it.
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.set("connect_timeout", "30");
  }

  return url.toString();
}

export const runtimeDatabaseUrl = validateDatabaseUrl(databaseUrl);
