-- Additive, non-destructive migration for Karigar Recovery Module (Rule 12)
-- 1. Extend JournalTransactionType enum
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'KARIGAR_RECOVERY_RECEIPT';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'KARIGAR_RECOVERY_RECEIPT_REVERSAL';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'KARIGAR_RECOVERY_REFUND';

-- 2. Create Recovery enums
DO $$ BEGIN
    CREATE TYPE "RecoveryReceiptStatus" AS ENUM ('POSTED', 'REVERSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "RecoveryAllocationStatus" AS ENUM ('ACTIVE', 'UNDONE', 'REVERSED_WITH_RECEIPT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "LossWriteOffStatus" AS ENUM ('ACTIVE', 'REVERSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Extend RecoveryReceipt table non-destructively
ALTER TABLE "RecoveryReceipt"
    ADD COLUMN IF NOT EXISTS "receiptNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "unallocatedFineWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "status" "RecoveryReceiptStatus" NOT NULL DEFAULT 'POSTED',
    ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
    ADD COLUMN IF NOT EXISTS "journalTransactionId" TEXT,
    ADD COLUMN IF NOT EXISTS "createdById" TEXT,
    ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;

UPDATE "RecoveryReceipt"
SET
    "receiptNumber" = COALESCE("receiptNumber", 'RCV-LEGACY-' || "id"),
    "idempotencyKey" = COALESCE("idempotencyKey", 'legacy_rcv_' || "id"),
    "createdById" = COALESCE("createdById", 'SYSTEM_MIGRATION')
WHERE "receiptNumber" IS NULL OR "idempotencyKey" IS NULL OR "createdById" IS NULL;

ALTER TABLE "RecoveryReceipt"
    ALTER COLUMN "receiptNumber" SET NOT NULL,
    ALTER COLUMN "idempotencyKey" SET NOT NULL,
    ALTER COLUMN "createdById" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryReceipt_idempotencyKey_key" ON "RecoveryReceipt"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryReceipt_organizationId_receiptNumber_key" ON "RecoveryReceipt"("organizationId", "receiptNumber");
CREATE INDEX IF NOT EXISTS "RecoveryReceipt_organizationId_karigarId_status_idx" ON "RecoveryReceipt"("organizationId", "karigarId", "status");
CREATE INDEX IF NOT EXISTS "RecoveryReceipt_organizationId_businessDate_idx" ON "RecoveryReceipt"("organizationId", "businessDate");

-- 4. Create RecoveryReceiptLine table
CREATE TABLE IF NOT EXISTS "RecoveryReceiptLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recoveryReceiptId" TEXT NOT NULL,
    "purityId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "grossWeight" DECIMAL(18,6) NOT NULL,
    "touchPercent" DECIMAL(8,4) NOT NULL,
    "fineWeight" DECIMAL(18,6) NOT NULL,
    "journalTransactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryReceiptLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RecoveryReceiptLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecoveryReceiptLine_recoveryReceiptId_fkey" FOREIGN KEY ("recoveryReceiptId") REFERENCES "RecoveryReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RecoveryReceiptLine_recoveryReceiptId_idx" ON "RecoveryReceiptLine"("recoveryReceiptId");
CREATE INDEX IF NOT EXISTS "RecoveryReceiptLine_organizationId_purityId_idx" ON "RecoveryReceiptLine"("organizationId", "purityId");

-- 5. Extend RecoveryAllocation table non-destructively
ALTER TABLE "RecoveryAllocation"
    ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
    ADD COLUMN IF NOT EXISTS "status" "RecoveryAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS "businessDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "notes" TEXT,
    ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
    ADD COLUMN IF NOT EXISTS "createdById" TEXT,
    ADD COLUMN IF NOT EXISTS "undoneAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "undoneById" TEXT,
    ADD COLUMN IF NOT EXISTS "undoReason" TEXT;

UPDATE "RecoveryAllocation" ra
SET
    "organizationId" = COALESCE(ra."organizationId", rr."organizationId"),
    "idempotencyKey" = COALESCE(ra."idempotencyKey", 'legacy_alloc_' || ra."id"),
    "createdById" = COALESCE(ra."createdById", 'SYSTEM_MIGRATION')
FROM "RecoveryReceipt" rr
WHERE ra."recoveryReceiptId" = rr."id"
  AND (ra."organizationId" IS NULL OR ra."idempotencyKey" IS NULL OR ra."createdById" IS NULL);

ALTER TABLE "RecoveryAllocation"
    ALTER COLUMN "organizationId" SET NOT NULL,
    ALTER COLUMN "idempotencyKey" SET NOT NULL,
    ALTER COLUMN "createdById" SET NOT NULL;

DO $$ BEGIN
    ALTER TABLE "RecoveryAllocation"
        ADD CONSTRAINT "RecoveryAllocation_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryAllocation_idempotencyKey_key" ON "RecoveryAllocation"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "RecoveryAllocation_organizationId_recoveryReceiptId_status_idx" ON "RecoveryAllocation"("organizationId", "recoveryReceiptId", "status");
CREATE INDEX IF NOT EXISTS "RecoveryAllocation_organizationId_processLossRecordId_status_idx" ON "RecoveryAllocation"("organizationId", "processLossRecordId", "status");

-- 6. Create LossWriteOff table
CREATE TABLE IF NOT EXISTS "LossWriteOff" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "processLossRecordId" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "writtenOffFineWeight" DECIMAL(18,6) NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LossWriteOffStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,

    CONSTRAINT "LossWriteOff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LossWriteOff_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LossWriteOff_processLossRecordId_fkey" FOREIGN KEY ("processLossRecordId") REFERENCES "ProcessLossRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LossWriteOff_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LossWriteOff_idempotencyKey_key" ON "LossWriteOff"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "LossWriteOff_organizationId_processLossRecordId_status_idx" ON "LossWriteOff"("organizationId", "processLossRecordId", "status");
CREATE INDEX IF NOT EXISTS "LossWriteOff_organizationId_karigarId_status_idx" ON "LossWriteOff"("organizationId", "karigarId", "status");

-- 7. Rule 12: Migrate existing closed, reconciled process visits from PENDING_ORDER_COMPLETION to ELIGIBLE
-- Does NOT infer completion merely from an OUT weight; strictly checks OrderProcess.status = 'CLOSED' AND ProcessVisit.status = 'CLOSED'.
UPDATE "ProcessLossRecord" plr
SET
    "eligibilityStatus" = 'ELIGIBLE',
    "eligibleAt" = COALESCE(plr."eligibleAt", op."closedAt", plr."createdAt"),
    "updatedAt" = CURRENT_TIMESTAMP
FROM "OrderProcess" op, "ProcessVisit" pv
WHERE plr."orderProcessId" = op."id"
  AND plr."processVisitId" = pv."id"
  AND plr."eligibilityStatus" = 'PENDING_ORDER_COMPLETION'
  AND op."status" = 'CLOSED'
  AND pv."status" = 'CLOSED';

