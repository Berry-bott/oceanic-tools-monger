-- Existing administrator sessions used a seven-day access cookie. Expire them
-- during deployment so every session is re-established with the new cookie pair.
ALTER TABLE "Session"
  ADD COLUMN "revokedAt" TIMESTAMP(3);

UPDATE "Session" SET "expiresAt" = CURRENT_TIMESTAMP;

CREATE INDEX "Session_revokedAt_idx" ON "Session"("revokedAt");

CREATE TABLE "RefreshToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_sessionId_expiresAt_idx" ON "RefreshToken"("sessionId", "expiresAt");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

ALTER TABLE "RefreshToken"
  ADD CONSTRAINT "RefreshToken_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
