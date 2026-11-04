-- Merge the former operational roles into STAFF while preserving ownership.
CREATE TYPE "UserRole_new" AS ENUM ('OWNER', 'STAFF');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE
      WHEN "role"::text = 'OWNER' THEN 'OWNER'::"UserRole_new"
      ELSE 'STAFF'::"UserRole_new"
    END
  );

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STAFF';
