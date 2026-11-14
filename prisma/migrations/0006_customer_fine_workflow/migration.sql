-- AlterTable Organization: One-time customer fine-gold receipt convention
ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "customerFineReceiptMode" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
  ADD COLUMN IF NOT EXISTS "customerFineConfiguredTouch" DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS "customerFineAccountPurityId" TEXT;

-- AlterTable CustomerBill: Issuance-time balance and allocation snapshots
ALTER TABLE "CustomerBill"
  ADD COLUMN IF NOT EXISTS "previousAdvanceFineSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "appliedAdvanceFineSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "newReceiptFineSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "closingFineDueSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "remainingAdvanceFineSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 0;

-- AlterTable CustomerGoldReceipt: Mode snapshot, physical weight indicator, and refunded fine weight
ALTER TABLE "CustomerGoldReceipt"
  ADD COLUMN IF NOT EXISTS "refundedFineWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inputModeSnapshot" TEXT NOT NULL DEFAULT 'FINE_EQUIVALENT',
  ADD COLUMN IF NOT EXISTS "physicalWeightProvided" BOOLEAN NOT NULL DEFAULT true;
