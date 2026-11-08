CREATE TYPE "StaffAccessRole" AS ENUM ('CASHIER', 'SENIOR_STAFF');

ALTER TABLE "User" ADD COLUMN "staffAccessRole" "StaffAccessRole";

UPDATE "User"
SET "staffAccessRole" = 'SENIOR_STAFF'
WHERE "role" = 'STAFF';
