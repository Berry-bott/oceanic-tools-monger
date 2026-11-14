ALTER TABLE "Branch"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "isPickupLocation" BOOLEAN NOT NULL DEFAULT false;
