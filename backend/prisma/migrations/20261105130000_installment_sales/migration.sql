CREATE TYPE "InstallmentAgreementStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

CREATE TABLE "InstallmentAgreement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "number" VARCHAR(50) NOT NULL,
    "status" "InstallmentAgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "total" DECIMAL(14,2) NOT NULL,
    "paidTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "installmentCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "InstallmentAgreement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstallmentAgreementLine" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" VARCHAR(180) NOT NULL,
    "sku" VARCHAR(80) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "InstallmentAgreementLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstallmentDue" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstallmentDue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstallmentPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "refundedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstallmentPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstallmentRefund" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reference" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstallmentRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstallmentAgreement_businessId_number_key" ON "InstallmentAgreement"("businessId", "number");
CREATE INDEX "InstallmentAgreement_businessId_status_createdAt_idx" ON "InstallmentAgreement"("businessId", "status", "createdAt");
CREATE INDEX "InstallmentAgreement_customerId_createdAt_idx" ON "InstallmentAgreement"("customerId", "createdAt");
CREATE INDEX "InstallmentAgreementLine_agreementId_idx" ON "InstallmentAgreementLine"("agreementId");
CREATE INDEX "InstallmentDue_status_dueAt_idx" ON "InstallmentDue"("status", "dueAt");
CREATE UNIQUE INDEX "InstallmentDue_agreementId_sequence_key" ON "InstallmentDue"("agreementId", "sequence");
CREATE UNIQUE INDEX "InstallmentPayment_paymentId_key" ON "InstallmentPayment"("paymentId");
CREATE INDEX "InstallmentPayment_agreementId_createdAt_idx" ON "InstallmentPayment"("agreementId", "createdAt");
CREATE UNIQUE INDEX "InstallmentRefund_reference_key" ON "InstallmentRefund"("reference");
CREATE INDEX "InstallmentRefund_agreementId_createdAt_idx" ON "InstallmentRefund"("agreementId", "createdAt");

ALTER TABLE "InstallmentAgreement" ADD CONSTRAINT "InstallmentAgreement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentAgreement" ADD CONSTRAINT "InstallmentAgreement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentAgreement" ADD CONSTRAINT "InstallmentAgreement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentAgreement" ADD CONSTRAINT "InstallmentAgreement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentAgreementLine" ADD CONSTRAINT "InstallmentAgreementLine_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "InstallmentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentAgreementLine" ADD CONSTRAINT "InstallmentAgreementLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentDue" ADD CONSTRAINT "InstallmentDue_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "InstallmentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "InstallmentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "InstallmentDue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentRefund" ADD CONSTRAINT "InstallmentRefund_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentRefund" ADD CONSTRAINT "InstallmentRefund_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "InstallmentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstallmentRefund" ADD CONSTRAINT "InstallmentRefund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Account" ("id", "businessId", "code", "name", "type")
SELECT md5(random()::text || clock_timestamp()::text || business."id"), business."id", '2300', 'Customer instalments received', 'LIABILITY'
FROM "Business" AS business
ON CONFLICT ("businessId", "code") DO NOTHING;

ALTER TABLE "StockReservation" ADD COLUMN "installmentAgreementId" TEXT;
CREATE UNIQUE INDEX "StockReservation_installmentAgreementId_productId_key" ON "StockReservation"("installmentAgreementId", "productId");
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_installmentAgreementId_fkey" FOREIGN KEY ("installmentAgreementId") REFERENCES "InstallmentAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
