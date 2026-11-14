-- Additive, non-destructive migration for Billing & Customer Settlement module

-- 1. Extend existing enums
ALTER TYPE "StockAccountType" ADD VALUE IF NOT EXISTS 'CUSTOMER_DELIVERED';

ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'BILL_POST_AND_DELIVER';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'BILL_CANCELLATION_REVERSAL';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'CUSTOMER_GOLD_RECEIPT';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'CUSTOMER_GOLD_RECEIPT_REVERSAL';
ALTER TYPE "JournalTransactionType" ADD VALUE IF NOT EXISTS 'CUSTOMER_GOLD_REFUND';

ALTER TYPE "MetalMovementType" ADD VALUE IF NOT EXISTS 'CUSTOMER_DELIVERY';

-- 2. Create new enums
DO $$ BEGIN CREATE TYPE "OrderDeliveryStatus" AS ENUM ('NOT_DELIVERED', 'DELIVERED', 'RETURNED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OrderBillingStatus" AS ENUM ('UNBILLED', 'BILLED', 'REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BillType" AS ENUM ('ORDER_DELIVERY', 'MANUAL_COMMERCIAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BillDeliveryStatus" AS ENUM ('NOT_DELIVERED', 'DELIVERED', 'REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BillSettlementStatus" AS ENUM ('UNPAID', 'PARTIALLY_SETTLED', 'SETTLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BillingBasis" AS ENUM ('NET_METAL', 'GROSS_WEIGHT', 'MANUAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BillLineType" AS ENUM ('ORDER_LINE', 'MANUAL_SERVICE', 'MANUAL_FINE_CHARGE', 'MANUAL_STONE_INR', 'MANUAL_DISCOUNT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CustomerReceiptStatus" AS ENUM ('POSTED', 'REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CustomerAllocationStatus" AS ENUM ('ACTIVE', 'UNDONE', 'REVERSED_WITH_RECEIPT', 'RELEASED_ON_BILL_CANCEL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Extend Order table
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryStatus" "OrderDeliveryStatus" NOT NULL DEFAULT 'NOT_DELIVERED';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredById" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "billingStatus" "OrderBillingStatus" NOT NULL DEFAULT 'UNBILLED';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "activeBillId" TEXT;

-- 4. Create BillSequence and BillTemplate
CREATE TABLE IF NOT EXISTS "BillSequence" (
    "organizationId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'INV',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillSequence_pkey" PRIMARY KEY ("organizationId")
);

CREATE TABLE IF NOT EXISTS "BillTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "businessName" TEXT NOT NULL,
    "contactInfo" TEXT NOT NULL,
    "logoUrl" TEXT,
    "headerText" TEXT,
    "footerText" TEXT,
    "signatureUrl" TEXT,
    "showPhotoColumn" BOOLEAN NOT NULL DEFAULT false,
    "visibleColumnsJson" TEXT NOT NULL,
    "columnLabelsJson" TEXT NOT NULL,
    "columnWidthsJson" TEXT,
    "notesAndTerms" TEXT,
    "fontSizePx" INTEGER NOT NULL DEFAULT 12,
    "paperSize" TEXT NOT NULL DEFAULT 'A4',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BillTemplate_organizationId_isDefault_idx" ON "BillTemplate"("organizationId", "isDefault");

-- 5. Extend CustomerBill and CustomerBillLine
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "billType" "BillType" NOT NULL DEFAULT 'ORDER_DELIVERY';
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "status" "BillStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "deliveryStatus" "BillDeliveryStatus" NOT NULL DEFAULT 'NOT_DELIVERED';
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "settlementStatus" "BillSettlementStatus" NOT NULL DEFAULT 'UNPAID';
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "deliveredFineMetal" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "commercialMakingFine" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "historicalFineBalance" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "historicalInrBalance" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "templateSnapshotJson" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "customerSnapshotJson" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "journalTransactionId" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3);
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "postedById" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "cancelledById" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "creditNoteNumber" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "CustomerBill" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerBill_idempotencyKey_key" ON "CustomerBill"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "CustomerBill_organizationId_customerId_status_idx" ON "CustomerBill"("organizationId", "customerId", "status");
CREATE INDEX IF NOT EXISTS "CustomerBill_organizationId_billDate_idx" ON "CustomerBill"("organizationId", "billDate");

ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "lineType" "BillLineType" NOT NULL DEFAULT 'ORDER_LINE';
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "purityId" TEXT;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "bagNumberSnapshot" TEXT;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "orderNameSnapshot" TEXT;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "photoUrlSnapshot" TEXT;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "grossWeight" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "adKlWeight" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "touchSnapshot" DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "chargeableWeight" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "billingBasis" "BillingBasis" NOT NULL DEFAULT 'NET_METAL';
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "makingPercentagePoints" DECIMAL(8,4) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "metalChargeFine" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "makingChargeFine" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "extraFineCharge" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "fineDiscount" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "stoneChargeRupees" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "rupeeDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerBillLine" ADD COLUMN IF NOT EXISTS "adjustmentReason" TEXT;
ALTER TABLE "CustomerBillLine" ALTER COLUMN "netWeight" SET DEFAULT 0;
ALTER TABLE "CustomerBillLine" ALTER COLUMN "stoneWeight" SET DEFAULT 0;
ALTER TABLE "CustomerBillLine" ALTER COLUMN "wastagePercent" SET DEFAULT 0;
ALTER TABLE "CustomerBillLine" ALTER COLUMN "fineGold" SET DEFAULT 0;
ALTER TABLE "CustomerBillLine" ALTER COLUMN "makingCharges" SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS "CustomerBillLine_customerBillId_idx" ON "CustomerBillLine"("customerBillId");
CREATE INDEX IF NOT EXISTS "CustomerBillLine_orderId_idx" ON "CustomerBillLine"("orderId");

-- 6. Create CustomerGoldReceipt, CustomerGoldReceiptLine, CustomerCashReceipt, CustomerPaymentAllocation
CREATE TABLE IF NOT EXISTS "CustomerGoldReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "totalGrossWeight" DECIMAL(18,6) NOT NULL,
    "totalFineWeight" DECIMAL(18,6) NOT NULL,
    "unallocatedFineWeight" DECIMAL(18,6) NOT NULL,
    "status" "CustomerReceiptStatus" NOT NULL DEFAULT 'POSTED',
    "referenceNumber" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "journalTransactionId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    CONSTRAINT "CustomerGoldReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerGoldReceipt_idempotencyKey_key" ON "CustomerGoldReceipt"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerGoldReceipt_organizationId_receiptNumber_key" ON "CustomerGoldReceipt"("organizationId", "receiptNumber");
CREATE INDEX IF NOT EXISTS "CustomerGoldReceipt_organizationId_customerId_status_idx" ON "CustomerGoldReceipt"("organizationId", "customerId", "status");

CREATE TABLE IF NOT EXISTS "CustomerGoldReceiptLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "purityId" TEXT NOT NULL,
    "grossWeight" DECIMAL(18,6) NOT NULL,
    "touchPercent" DECIMAL(8,4) NOT NULL,
    "fineWeight" DECIMAL(18,6) NOT NULL,
    "journalTransactionId" TEXT,
    CONSTRAINT "CustomerGoldReceiptLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerGoldReceiptLine_organizationId_receiptId_idx" ON "CustomerGoldReceiptLine"("organizationId", "receiptId");

CREATE TABLE IF NOT EXISTS "CustomerCashReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "amountRupees" DECIMAL(18,2) NOT NULL,
    "unallocatedRupees" DECIMAL(18,2) NOT NULL,
    "paymentMode" TEXT NOT NULL DEFAULT 'CASH',
    "status" "CustomerReceiptStatus" NOT NULL DEFAULT 'POSTED',
    "referenceNumber" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    CONSTRAINT "CustomerCashReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCashReceipt_idempotencyKey_key" ON "CustomerCashReceipt"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerCashReceipt_organizationId_receiptNumber_key" ON "CustomerCashReceipt"("organizationId", "receiptNumber");
CREATE INDEX IF NOT EXISTS "CustomerCashReceipt_organizationId_customerId_status_idx" ON "CustomerCashReceipt"("organizationId", "customerId", "status");

CREATE TABLE IF NOT EXISTS "CustomerPaymentAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "goldReceiptId" TEXT,
    "cashReceiptId" TEXT,
    "allocatedFineWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "allocatedRupees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "CustomerAllocationStatus" NOT NULL DEFAULT 'ACTIVE',
    "businessDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,
    "undoReason" TEXT,
    CONSTRAINT "CustomerPaymentAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPaymentAllocation_idempotencyKey_key" ON "CustomerPaymentAllocation"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "CustomerPaymentAllocation_organizationId_customerId_status_idx" ON "CustomerPaymentAllocation"("organizationId", "customerId", "status");
CREATE INDEX IF NOT EXISTS "CustomerPaymentAllocation_organizationId_billId_idx" ON "CustomerPaymentAllocation"("organizationId", "billId");

-- 7. Foreign Keys (added safely if not exists)
DO $$ BEGIN ALTER TABLE "BillSequence" ADD CONSTRAINT "BillSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "BillTemplate" ADD CONSTRAINT "BillTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerGoldReceipt" ADD CONSTRAINT "CustomerGoldReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerGoldReceipt" ADD CONSTRAINT "CustomerGoldReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerGoldReceiptLine" ADD CONSTRAINT "CustomerGoldReceiptLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerGoldReceiptLine" ADD CONSTRAINT "CustomerGoldReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "CustomerGoldReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerCashReceipt" ADD CONSTRAINT "CustomerCashReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerCashReceipt" ADD CONSTRAINT "CustomerCashReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerPaymentAllocation" ADD CONSTRAINT "CustomerPaymentAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerPaymentAllocation" ADD CONSTRAINT "CustomerPaymentAllocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerPaymentAllocation" ADD CONSTRAINT "CustomerPaymentAllocation_billId_fkey" FOREIGN KEY ("billId") REFERENCES "CustomerBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerPaymentAllocation" ADD CONSTRAINT "CustomerPaymentAllocation_goldReceiptId_fkey" FOREIGN KEY ("goldReceiptId") REFERENCES "CustomerGoldReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "CustomerPaymentAllocation" ADD CONSTRAINT "CustomerPaymentAllocation_cashReceiptId_fkey" FOREIGN KEY ("cashReceiptId") REFERENCES "CustomerCashReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

