CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerSession" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerAccount_customerId_key" ON "CustomerAccount"("customerId");
CREATE UNIQUE INDEX "CustomerAccount_businessId_email_key" ON "CustomerAccount"("businessId", "email");
CREATE INDEX "CustomerAccount_businessId_createdAt_idx" ON "CustomerAccount"("businessId", "createdAt");
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");
CREATE INDEX "CustomerSession_customerAccountId_expiresAt_idx" ON "CustomerSession"("customerAccountId", "expiresAt");
CREATE INDEX "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");

ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
