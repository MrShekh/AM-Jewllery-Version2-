-- Additive migration for Production Register Saved Sheets (RegisterSheet)
CREATE TABLE IF NOT EXISTS "RegisterSheet" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sheetNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "orderCount" INTEGER NOT NULL DEFAULT 0,
  "totalIssuedWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "totalLossWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegisterSheet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RegisterSheet_organizationId_sheetNumber_key"
  ON "RegisterSheet"("organizationId", "sheetNumber");

CREATE INDEX IF NOT EXISTS "RegisterSheet_organizationId_closedAt_idx"
  ON "RegisterSheet"("organizationId", "closedAt");

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "registerSheetId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_organizationId_registerSheetId_idx"
  ON "Order"("organizationId", "registerSheetId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_registerSheetId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_registerSheetId_fkey"
      FOREIGN KEY ("registerSheetId") REFERENCES "RegisterSheet"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
