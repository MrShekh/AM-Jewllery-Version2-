-- Additive, non-destructive migration for audit fixes and new features
-- 1. Extend enums
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'STOCK_SALE';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'STOCK_SALE_REVERSAL';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'PURITY_CONVERSION';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'REFINING_BATCH';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'FILING_UNUSED_RETURN';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'FILING_CORRECTION';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'CUSTOMER_CASH_RECEIPT_REVERSAL';

ALTER TYPE "MetalMovementType" ADD VALUE IF NOT EXISTS 'FILING_UNUSED_RETURN';
ALTER TYPE "MetalMovementType" ADD VALUE IF NOT EXISTS 'FILING_CORRECTION';

CREATE TYPE "StockSaleStatus" AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE "StockSalePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');
CREATE TYPE "StockConversionType" AS ENUM ('FINE_TO_KARAT', 'KARAT_TO_FINE', 'REFINING', 'ALLOYING');
CREATE TYPE "RefiningLossTreatment" AS ENUM ('NONE', 'OUTSTANDING', 'ACCEPTED');

-- 2. Default Karigar flag on KarigarCapability
ALTER TABLE "KarigarCapability" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- 3. StockSale table
CREATE TABLE IF NOT EXISTS "StockSale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "purityId" TEXT NOT NULL,
    "physicalWeight" DECIMAL(18,6) NOT NULL,
    "touchPercentSnapshot" DECIMAL(8,4) NOT NULL,
    "fineEquivalentWeight" DECIMAL(18,6) NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "pricePerGramRupees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmountRupees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paidAmountRupees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentStatus" "StockSalePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "status" "StockSaleStatus" NOT NULL DEFAULT 'POSTED',
    "referenceNumber" TEXT,
    "notes" TEXT,
    "journalTransactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    CONSTRAINT "StockSale_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockSale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockSale_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockSale_idempotencyKey_key" ON "StockSale"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "StockSale_organizationId_saleNumber_key" ON "StockSale"("organizationId", "saleNumber");
CREATE INDEX IF NOT EXISTS "StockSale_organizationId_businessDate_idx" ON "StockSale"("organizationId", "businessDate");

-- 4. StockConversion table
CREATE TABLE IF NOT EXISTS "StockConversion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversionNumber" TEXT NOT NULL,
    "conversionType" "StockConversionType" NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "sourcePurityId" TEXT NOT NULL,
    "sourceWeight" DECIMAL(18,6) NOT NULL,
    "sourceTouchPercent" DECIMAL(8,4) NOT NULL,
    "theoreticalFineWeight" DECIMAL(18,6) NOT NULL,
    "targetPurityId" TEXT NOT NULL,
    "actualOutputWeight" DECIMAL(18,6) NOT NULL,
    "actualOutputTouch" DECIMAL(8,4) NOT NULL,
    "actualOutputFineWeight" DECIMAL(18,6) NOT NULL,
    "residueWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "returnedMetalWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lossFineWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lossTreatment" "RefiningLossTreatment" NOT NULL DEFAULT 'NONE',
    "refinerOrPartner" TEXT,
    "notes" TEXT,
    "journalTransactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockConversion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockConversion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockConversion_sourcePurityId_fkey" FOREIGN KEY ("sourcePurityId") REFERENCES "PurityDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockConversion_targetPurityId_fkey" FOREIGN KEY ("targetPurityId") REFERENCES "PurityDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StockConversion_idempotencyKey_key" ON "StockConversion"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "StockConversion_organizationId_conversionNumber_key" ON "StockConversion"("organizationId", "conversionNumber");
CREATE INDEX IF NOT EXISTS "StockConversion_organizationId_businessDate_idx" ON "StockConversion"("organizationId", "businessDate");

-- 5. BillShareToken table
CREATE TABLE IF NOT EXISTS "BillShareToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "BillShareToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BillShareToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BillShareToken_billId_fkey" FOREIGN KEY ("billId") REFERENCES "CustomerBill"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "BillShareToken_token_key" ON "BillShareToken"("token");
CREATE INDEX IF NOT EXISTS "BillShareToken_organizationId_billId_idx" ON "BillShareToken"("organizationId", "billId");

