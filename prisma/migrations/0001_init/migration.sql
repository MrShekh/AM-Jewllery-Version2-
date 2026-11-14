-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER_ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ProcessType" AS ENUM ('FILING', 'FREE_POLISH', 'SETTING', 'FINAL_POLISH');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CREATED', 'IN_PROCESS', 'COMPLETED', 'CANCELLED', 'CANCELLATION_PENDING_RECONCILIATION');

-- CreateEnum
CREATE TYPE "OrderProcessStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PARTIAL_RETURN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProcessVisitStatus" AS ENUM ('OPEN', 'PARTIAL', 'CLOSED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StoneDirection" AS ENUM ('ADDED', 'RETAINED', 'REMOVED_LOST');

-- CreateEnum
CREATE TYPE "LossEligibilityStatus" AS ENUM ('PENDING_ORDER_COMPLETION', 'ELIGIBLE', 'VOIDED');

-- CreateEnum
CREATE TYPE "StockAccountType" AS ENUM ('OPENING_EQUITY', 'EXTERNAL_SUPPLIER_INFLOW', 'ADMIN_KARAT_POOL', 'KARIGAR_CUSTODY', 'FINISHED_GOODS', 'PROCESS_LOSS');

-- CreateEnum
CREATE TYPE "JournalTransactionType" AS ENUM ('OPENING_BALANCE', 'STOCK_RECEIPT', 'STOCK_RECEIPT_REVERSAL', 'ORDER_METAL_ISSUE', 'PROCESS_CUSTODY_TRANSFER', 'PROCESS_LOSS_RECOGNITION', 'ORDER_COMPLETION_FINISHED_GOODS', 'CONTROLLED_REVERSAL');

-- CreateEnum
CREATE TYPE "JournalLineDirection" AS ENUM ('DEBIT_IN', 'CREDIT_OUT');

-- CreateEnum
CREATE TYPE "MetalMovementType" AS ENUM ('ADMIN_ISSUE_TO_ORDER', 'PROCESS_TRANSFER', 'KARIGAR_PARTIAL_RETURN', 'KARIGAR_FINAL_RETURN', 'ADDITIONAL_ADMIN_ISSUE', 'RETURN_TO_ADMIN_STOCK', 'FINISHED_GOODS_COMPLETION', 'REVERSAL');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurityDefinition" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "karatLabel" TEXT NOT NULL,
    "touchPercent" DECIMAL(8,4) NOT NULL,
    "isFineCategory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurityDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" "StockAccountType" NOT NULL,
    "purityId" TEXT,
    "karigarId" TEXT,
    "cachedPhysicalBalance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "cachedFineBalance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gstNumber" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Karigar" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "karigarCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "specializationNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Karigar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KarigarCapability" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "processType" "ProcessType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KarigarCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bagNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "photoUrl" TEXT,
    "purityId" TEXT NOT NULL,
    "touchSnapshot" DECIMAL(8,4) NOT NULL,
    "targetWeight" DECIMAL(18,6),
    "size" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "adDetailsJson" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "initialIssuedMetalWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "retainedStoneWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "finishedGrossWeight" DECIMAL(18,6),
    "finishedStoneWeight" DECIMAL(18,6),
    "finishedNetMetalWeight" DECIMAL(18,6),
    "finishedFineWeight" DECIMAL(18,6),
    "totalRawLossWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "totalFineLossWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProcess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "processType" "ProcessType" NOT NULL,
    "canonicalSequence" INTEGER NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "assignedKarigarId" TEXT,
    "status" "OrderProcessStatus" NOT NULL DEFAULT 'PENDING',
    "issuedMetalWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "returnedMetalWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "closedLossWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "custodyMetalWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "carriedStoneInWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "addedStoneWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "removedStoneWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "carriedStoneOutWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "latestGrossInWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "latestGrossOutWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderProcessId" TEXT NOT NULL,
    "visitNumber" INTEGER NOT NULL,
    "karigarId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "status" "ProcessVisitStatus" NOT NULL DEFAULT 'OPEN',
    "grossInWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "nonGoldInWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "metalInWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "grossOutWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "nonGoldOutWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "metalOutWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "custodyRemainingWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "rawLossWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "touchSnapshot" DECIMAL(8,4) NOT NULL,
    "fineLossWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetalMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderProcessId" TEXT,
    "processVisitId" TEXT,
    "movementType" "MetalMovementType" NOT NULL,
    "fromProcessType" "ProcessType",
    "toProcessType" "ProcessType",
    "karigarId" TEXT,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "grossWeight" DECIMAL(18,6) NOT NULL,
    "nonGoldWeight" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "netMetalWeight" DECIMAL(18,6) NOT NULL,
    "touchSnapshot" DECIMAL(8,4) NOT NULL,
    "fineEquivalentWeight" DECIMAL(18,6) NOT NULL,
    "journalTransactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetalMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoneComponentEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderProcessId" TEXT NOT NULL,
    "processVisitId" TEXT,
    "componentType" TEXT NOT NULL,
    "direction" "StoneDirection" NOT NULL DEFAULT 'ADDED',
    "sizeLabel" TEXT,
    "pieces" INTEGER NOT NULL DEFAULT 0,
    "weightGrams" DECIMAL(18,6) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoneComponentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessLossRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderProcessId" TEXT NOT NULL,
    "processVisitId" TEXT NOT NULL,
    "karigarId" TEXT NOT NULL,
    "processType" "ProcessType" NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "rawMetalLossWeight" DECIMAL(18,6) NOT NULL,
    "touchSnapshot" DECIMAL(8,4) NOT NULL,
    "fineEquivalentLossWeight" DECIMAL(18,6) NOT NULL,
    "eligibilityStatus" "LossEligibilityStatus" NOT NULL DEFAULT 'PENDING_ORDER_COMPLETION',
    "journalTransactionId" TEXT,
    "eligibleAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessLossRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "transactionNumber" TEXT NOT NULL,
    "transactionType" "JournalTransactionType" NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "purityId" TEXT NOT NULL,
    "touchSnapshot" DECIMAL(8,4) NOT NULL,
    "physicalWeight" DECIMAL(18,6) NOT NULL,
    "fineEquivalentWeight" DECIMAL(18,6) NOT NULL,
    "sourceReference" TEXT,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "orderProcessId" TEXT,
    "processVisitId" TEXT,
    "karigarId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reversalOfTransactionId" TEXT,
    "isReversed" BOOLEAN NOT NULL DEFAULT false,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "journalTransactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "JournalLineDirection" NOT NULL,
    "signedPhysicalDelta" DECIMAL(18,6) NOT NULL,
    "touchSnapshot" DECIMAL(8,4) NOT NULL,
    "signedFineDelta" DECIMAL(18,6) NOT NULL,
    "orderId" TEXT,
    "orderProcessId" TEXT,
    "karigarId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "karigarId" TEXT,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "recoveredGrossWeight" DECIMAL(18,6) NOT NULL,
    "recoveredTouchPercent" DECIMAL(8,4) NOT NULL,
    "recoveredFineWeight" DECIMAL(18,6) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryAllocation" (
    "id" TEXT NOT NULL,
    "recoveryReceiptId" TEXT NOT NULL,
    "processLossRecordId" TEXT NOT NULL,
    "allocatedFineWeight" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CastingBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "inputFineGold" DECIMAL(18,6) NOT NULL,
    "alloyAdded" DECIMAL(18,6) NOT NULL,
    "outputWeight" DECIMAL(18,6) NOT NULL,
    "targetTouch" DECIMAL(8,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CastingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerBill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL,
    "totalFineGold" DECIMAL(18,6) NOT NULL,
    "totalCashRupees" DECIMAL(18,2) NOT NULL,
    "previewHtml" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerBillLine" (
    "id" TEXT NOT NULL,
    "customerBillId" TEXT NOT NULL,
    "orderId" TEXT,
    "description" TEXT NOT NULL,
    "netWeight" DECIMAL(18,6) NOT NULL,
    "stoneWeight" DECIMAL(18,6) NOT NULL,
    "wastagePercent" DECIMAL(8,4) NOT NULL,
    "fineGold" DECIMAL(18,6) NOT NULL,
    "makingCharges" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "CustomerBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSettlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "settlementDate" TIMESTAMP(3) NOT NULL,
    "fineGoldPaid" DECIMAL(18,6) NOT NULL,
    "cashPaidRupees" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_organizationId_idx" ON "UserSession"("organizationId");

-- CreateIndex
CREATE INDEX "PurityDefinition_organizationId_idx" ON "PurityDefinition"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PurityDefinition_organizationId_code_key" ON "PurityDefinition"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PurityDefinition_organizationId_displayLabel_key" ON "PurityDefinition"("organizationId", "displayLabel");

-- CreateIndex
CREATE INDEX "StockAccount_organizationId_accountType_idx" ON "StockAccount"("organizationId", "accountType");

-- CreateIndex
CREATE INDEX "StockAccount_organizationId_purityId_idx" ON "StockAccount"("organizationId", "purityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAccount_organizationId_accountCode_key" ON "StockAccount"("organizationId", "accountCode");

-- CreateIndex
CREATE INDEX "Customer_organizationId_name_idx" ON "Customer"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_customerCode_key" ON "Customer"("organizationId", "customerCode");

-- CreateIndex
CREATE INDEX "Karigar_organizationId_name_idx" ON "Karigar"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Karigar_organizationId_karigarCode_key" ON "Karigar"("organizationId", "karigarCode");

-- CreateIndex
CREATE INDEX "KarigarCapability_organizationId_processType_idx" ON "KarigarCapability"("organizationId", "processType");

-- CreateIndex
CREATE UNIQUE INDEX "KarigarCapability_karigarId_processType_key" ON "KarigarCapability"("karigarId", "processType");

-- CreateIndex
CREATE INDEX "Order_organizationId_status_idx" ON "Order"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Order_organizationId_orderDate_idx" ON "Order"("organizationId", "orderDate");

-- CreateIndex
CREATE INDEX "Order_organizationId_customerId_idx" ON "Order"("organizationId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_bagNumber_key" ON "Order"("organizationId", "bagNumber");

-- CreateIndex
CREATE INDEX "OrderProcess_organizationId_orderId_idx" ON "OrderProcess"("organizationId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderProcess_orderId_processType_key" ON "OrderProcess"("orderId", "processType");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessVisit_idempotencyKey_key" ON "ProcessVisit"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProcessVisit_organizationId_orderId_idx" ON "ProcessVisit"("organizationId", "orderId");

-- CreateIndex
CREATE INDEX "ProcessVisit_orderProcessId_idx" ON "ProcessVisit"("orderProcessId");

-- CreateIndex
CREATE UNIQUE INDEX "MetalMovement_idempotencyKey_key" ON "MetalMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MetalMovement_organizationId_orderId_idx" ON "MetalMovement"("organizationId", "orderId");

-- CreateIndex
CREATE INDEX "StoneComponentEntry_organizationId_orderId_idx" ON "StoneComponentEntry"("organizationId", "orderId");

-- CreateIndex
CREATE INDEX "StoneComponentEntry_orderProcessId_idx" ON "StoneComponentEntry"("orderProcessId");

-- CreateIndex
CREATE INDEX "ProcessLossRecord_organizationId_orderId_idx" ON "ProcessLossRecord"("organizationId", "orderId");

-- CreateIndex
CREATE INDEX "ProcessLossRecord_organizationId_karigarId_eligibilityStatu_idx" ON "ProcessLossRecord"("organizationId", "karigarId", "eligibilityStatus");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTransaction_idempotencyKey_key" ON "JournalTransaction"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTransaction_reversalOfTransactionId_key" ON "JournalTransaction"("reversalOfTransactionId");

-- CreateIndex
CREATE INDEX "JournalTransaction_organizationId_businessDate_idx" ON "JournalTransaction"("organizationId", "businessDate");

-- CreateIndex
CREATE INDEX "JournalTransaction_organizationId_transactionType_idx" ON "JournalTransaction"("organizationId", "transactionType");

-- CreateIndex
CREATE INDEX "JournalTransaction_organizationId_orderId_idx" ON "JournalTransaction"("organizationId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTransaction_organizationId_transactionNumber_key" ON "JournalTransaction"("organizationId", "transactionNumber");

-- CreateIndex
CREATE INDEX "JournalLine_organizationId_accountId_idx" ON "JournalLine"("organizationId", "accountId");

-- CreateIndex
CREATE INDEX "JournalLine_journalTransactionId_idx" ON "JournalLine"("journalTransactionId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_entityType_entityId_idx" ON "AuditEvent"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_organizationId_orderId_idx" ON "Attachment"("organizationId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CastingBatch_organizationId_batchNumber_key" ON "CastingBatch"("organizationId", "batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBill_organizationId_billNumber_key" ON "CustomerBill"("organizationId", "billNumber");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurityDefinition" ADD CONSTRAINT "PurityDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAccount" ADD CONSTRAINT "StockAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAccount" ADD CONSTRAINT "StockAccount_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAccount" ADD CONSTRAINT "StockAccount_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Karigar" ADD CONSTRAINT "Karigar_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarCapability" ADD CONSTRAINT "KarigarCapability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KarigarCapability" ADD CONSTRAINT "KarigarCapability_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProcess" ADD CONSTRAINT "OrderProcess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProcess" ADD CONSTRAINT "OrderProcess_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProcess" ADD CONSTRAINT "OrderProcess_assignedKarigarId_fkey" FOREIGN KEY ("assignedKarigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessVisit" ADD CONSTRAINT "ProcessVisit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessVisit" ADD CONSTRAINT "ProcessVisit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessVisit" ADD CONSTRAINT "ProcessVisit_orderProcessId_fkey" FOREIGN KEY ("orderProcessId") REFERENCES "OrderProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessVisit" ADD CONSTRAINT "ProcessVisit_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetalMovement" ADD CONSTRAINT "MetalMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetalMovement" ADD CONSTRAINT "MetalMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetalMovement" ADD CONSTRAINT "MetalMovement_orderProcessId_fkey" FOREIGN KEY ("orderProcessId") REFERENCES "OrderProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetalMovement" ADD CONSTRAINT "MetalMovement_processVisitId_fkey" FOREIGN KEY ("processVisitId") REFERENCES "ProcessVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetalMovement" ADD CONSTRAINT "MetalMovement_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoneComponentEntry" ADD CONSTRAINT "StoneComponentEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoneComponentEntry" ADD CONSTRAINT "StoneComponentEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoneComponentEntry" ADD CONSTRAINT "StoneComponentEntry_orderProcessId_fkey" FOREIGN KEY ("orderProcessId") REFERENCES "OrderProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoneComponentEntry" ADD CONSTRAINT "StoneComponentEntry_processVisitId_fkey" FOREIGN KEY ("processVisitId") REFERENCES "ProcessVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessLossRecord" ADD CONSTRAINT "ProcessLossRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessLossRecord" ADD CONSTRAINT "ProcessLossRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessLossRecord" ADD CONSTRAINT "ProcessLossRecord_orderProcessId_fkey" FOREIGN KEY ("orderProcessId") REFERENCES "OrderProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessLossRecord" ADD CONSTRAINT "ProcessLossRecord_processVisitId_fkey" FOREIGN KEY ("processVisitId") REFERENCES "ProcessVisit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessLossRecord" ADD CONSTRAINT "ProcessLossRecord_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_purityId_fkey" FOREIGN KEY ("purityId") REFERENCES "PurityDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_orderProcessId_fkey" FOREIGN KEY ("orderProcessId") REFERENCES "OrderProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_processVisitId_fkey" FOREIGN KEY ("processVisitId") REFERENCES "ProcessVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_reversalOfTransactionId_fkey" FOREIGN KEY ("reversalOfTransactionId") REFERENCES "JournalTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTransaction" ADD CONSTRAINT "JournalTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalTransactionId_fkey" FOREIGN KEY ("journalTransactionId") REFERENCES "JournalTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StockAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_orderProcessId_fkey" FOREIGN KEY ("orderProcessId") REFERENCES "OrderProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryReceipt" ADD CONSTRAINT "RecoveryReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryReceipt" ADD CONSTRAINT "RecoveryReceipt_karigarId_fkey" FOREIGN KEY ("karigarId") REFERENCES "Karigar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAllocation" ADD CONSTRAINT "RecoveryAllocation_recoveryReceiptId_fkey" FOREIGN KEY ("recoveryReceiptId") REFERENCES "RecoveryReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAllocation" ADD CONSTRAINT "RecoveryAllocation_processLossRecordId_fkey" FOREIGN KEY ("processLossRecordId") REFERENCES "ProcessLossRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingBatch" ADD CONSTRAINT "CastingBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBill" ADD CONSTRAINT "CustomerBill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBill" ADD CONSTRAINT "CustomerBill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBillLine" ADD CONSTRAINT "CustomerBillLine_customerBillId_fkey" FOREIGN KEY ("customerBillId") REFERENCES "CustomerBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSettlement" ADD CONSTRAINT "CustomerSettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSettlement" ADD CONSTRAINT "CustomerSettlement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

