ALTER TABLE "CustomerAccount" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "CustomerAccountToken" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" VARCHAR(30) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAccountToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "destination" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(180) NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerAccountToken_tokenHash_key" ON "CustomerAccountToken"("tokenHash");
CREATE INDEX "CustomerAccountToken_customerAccountId_purpose_expiresAt_idx" ON "CustomerAccountToken"("customerAccountId", "purpose", "expiresAt");
CREATE INDEX "EmailOutbox_status_nextAttemptAt_idx" ON "EmailOutbox"("status", "nextAttemptAt");
CREATE INDEX "EmailOutbox_businessId_createdAt_idx" ON "EmailOutbox"("businessId", "createdAt");
ALTER TABLE "CustomerAccountToken" ADD CONSTRAINT "CustomerAccountToken_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
