-- Additive migration for Extra Metal Returned across manufacturing processes
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'EXTRA_METAL_RETURN';
ALTER TYPE "MetalMovementType" ADD VALUE IF NOT EXISTS 'EXTRA_METAL_RETURN';

ALTER TABLE "OrderProcess"
  ADD COLUMN IF NOT EXISTS "extraReturnedMetalWeight" DECIMAL(18,6) NOT NULL DEFAULT 0;

ALTER TABLE "ProcessVisit"
  ADD COLUMN IF NOT EXISTS "extraMetalReturnedWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "extraMetalTouchPercent" DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS "extraMetalPurityId" TEXT,
  ADD COLUMN IF NOT EXISTS "extraMetalFineWeight" DECIMAL(18,6) NOT NULL DEFAULT 0;
