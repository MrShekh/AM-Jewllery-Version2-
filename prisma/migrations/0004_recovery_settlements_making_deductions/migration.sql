-- AlterTable: add nullable recoverySettlementId to RecoveryReceipt and LossWriteOff (preserves existing data)
ALTER TABLE "RecoveryReceipt" ADD COLUMN IF NOT EXISTS "recoverySettlementId" TEXT;
ALTER TABLE "LossWriteOff" ADD COLUMN IF NOT EXISTS "recoverySettlementId" TEXT;

-- CreateTable: RecoverySettlement
CREATE TABLE IF NOT EXISTS "RecoverySettlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "settlementNumber" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeTouchPercent" DECIMAL(8,4),
    "scopeProcessType" "ProcessType",
    "grossSelectedFine" DECIMAL(18,6) NOT NULL,
    "makingDeductionFine" DECIMAL(18,6) NOT NULL,
    "makingInputWeight" DECIMAL(18,6) NOT NULL,
    "makingInputUnit" TEXT NOT NULL,
    "netExpectedFine" DECIMAL(18,6) NOT NULL,
    "receivedFine" DECIMAL(18,6) NOT NULL,
    "differenceFine" DECIMAL(18,6) NOT NULL,
    "shortageAction" TEXT,
    "acceptedShortageFine" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "carriedShortageFine" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "excessFine" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "recoveryReceiptId" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "RecoverySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MakingDeductionAllocation
CREATE TABLE IF NOT EXISTS "MakingDeductionAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recoverySettlementId" TEXT NOT NULL,
    "processLossRecordId" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "deductedFineWeight" DECIMAL(18,6) NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "MakingDeductionAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RecoverySettlement_idempotencyKey_key" ON "RecoverySettlement"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "RecoverySettlement_organizationId_settlementNumber_key" ON "RecoverySettlement"("organizationId", "settlementNumber");
CREATE INDEX IF NOT EXISTS "RecoverySettlement_organizationId_karigarId_businessDate_idx" ON "RecoverySettlement"("organizationId", "karigarId", "businessDate");

CREATE UNIQUE INDEX IF NOT EXISTS "MakingDeductionAllocation_idempotencyKey_key" ON "MakingDeductionAllocation"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "MakingDeductionAllocation_organizationId_processLossRecordId_status_idx" ON "MakingDeductionAllocation"("organizationId", "processLossRecordId", "status");
CREATE INDEX IF NOT EXISTS "MakingDeductionAllocation_organizationId_karigarId_status_idx" ON "MakingDeductionAllocation"("organizationId", "karigarId", "status");
CREATE INDEX IF NOT EXISTS "MakingDeductionAllocation_recoverySettlementId_idx" ON "MakingDeductionAllocation"("recoverySettlementId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "RecoverySettlement" ADD CONSTRAINT "RecoverySettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "RecoverySettlement" ADD CONSTRAINT "RecoverySettlement_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "MakingDeductionAllocation" ADD CONSTRAINT "MakingDeductionAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "MakingDeductionAllocation" ADD CONSTRAINT "MakingDeductionAllocation_recoverySettlementId_fkey" FOREIGN KEY ("recoverySettlementId") REFERENCES "RecoverySettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "MakingDeductionAllocation" ADD CONSTRAINT "MakingDeductionAllocation_processLossRecordId_fkey" FOREIGN KEY ("processLossRecordId") REFERENCES "ProcessLossRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "MakingDeductionAllocation" ADD CONSTRAINT "MakingDeductionAllocation_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

