-- Additive migration for free-text informational targetWeightText on Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "targetWeightText" TEXT;
