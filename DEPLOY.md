# Deployment and database change procedure

## Runtime and migration credentials

- The API and worker receive only `DATABASE_URL`, using the Neon pooled host with `sslmode=require` in production.
- The one-off migration job receives pooled `DATABASE_URL` (needed because the Prisma schema references it) and `DIRECT_URL`, using the Neon unpooled host and `sslmode=require&connect_timeout=30`.
- Store each value in the platform's secret manager. Do not put either value in build arguments, frontend variables, logs, workflow YAML, or committed files.
- The migration job must run `cd backend`, `npm ci`, `npm run db:preflight`, then `npm run db:deploy`. Stop deployment if either command fails. Deploy the new API/worker image only after migration succeeds.
- `npm run db:status` is a read-only state check but still needs the migration job's `DIRECT_URL`.
- API and worker startup validate the runtime URL and do not read `DIRECT_URL`. `db:generate` also works without `DIRECT_URL`.

## Production rollout

1. Confirm a recent Neon restore point and test the migration on a separate Neon branch with a dedicated migration identity.
2. Review generated SQL and the migration safety CI result. Any flagged destructive DDL requires a separate reviewed rollout; use an expand, backfill, contract sequence for incompatible changes.
3. Run the one-off production migration job. Do not run `migrate dev`, reset, resolve, or hand-written SQL against production.
4. Confirm migration success in the job output and health-check the new service after rollout. Keep the prior application release available for rollback; database changes should remain backward-compatible during the rollback window.

## Suggested least-privilege role design (review only)

Do not use the Neon owner role as the application's runtime login. Provision runtime and migration identities through the Neon Console/API according to the current Neon role model. Neon role creation methods have different inherited privileges, so inspect role membership and grants in a non-production branch before granting access. The SQL below is a review template only; it has placeholders and is not executed by this repository.

```sql
-- Replace every placeholder after creating the roles in Neon.
GRANT CONNECT ON DATABASE <database_name> TO <runtime_role>;
GRANT USAGE ON SCHEMA public TO <runtime_role>;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO <runtime_role>;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO <runtime_role>;

-- Run as the migration object owner so future objects get runtime DML grants.
ALTER DEFAULT PRIVILEGES FOR ROLE <migration_role> IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO <runtime_role>;
ALTER DEFAULT PRIVILEGES FOR ROLE <migration_role> IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO <runtime_role>;
```

Prisma Migrate needs a separate migration identity with schema-change privileges. Prefer the owner identity supplied by Neon for this isolated job, or a custom role whose ownership and grants have been validated on a branch. Do not grant runtime `CREATE`, ownership, role membership, or superuser-equivalent privileges. If migrations create objects under a different role, adjust default privileges for the role that actually creates those objects. Keep role passwords out of this document and rotate them through Neon's secret-management process.

## Local Git secret hook

Install Gitleaks, then enable the staged-change hook from the repository root:

```sh
git config core.hooksPath .githooks
```

GitHub Actions runs the repository scan for pull requests and pushes to `main`/`master`. Findings must be investigated and credentials rotated; never paste secret-bearing scan output into an issue or chat.
