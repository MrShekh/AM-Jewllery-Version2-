-- Additive migration for Customer Catalogue, App Orders, CAD Designer Portal & Notifications
-- Preserves all existing manufacturing tables and records without modification or data loss.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CUSTOMER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CAD_DESIGNER';

CREATE TYPE "CatalogueDesignStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "CustomerRequestStatus" AS ENUM (
  'AWAITING_APPROVAL',
  'MORE_DETAILS_NEEDED',
  'APPROVED',
  'READY',
  'DELIVERED',
  'DECLINED',
  'CANCELLED'
);
CREATE TYPE "CadTaskStatus" AS ENUM (
  'NOT_ASSIGNED',
  'TO_START',
  'IN_PROGRESS',
  'CHANGES_REQUIRED',
  'CAD_READY'
);
CREATE TYPE "AppAttachmentKind" AS ENUM ('IMAGE', 'VOICE_NOTE');

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "customerId" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedKarigarId" TEXT;

CREATE INDEX IF NOT EXISTS "User_organizationId_role_idx" ON "User"("organizationId", "role");
CREATE INDEX IF NOT EXISTS "User_customerId_idx" ON "User"("customerId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "CatalogueCategory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogueCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CatalogueCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CatalogueCategory_organizationId_code_key" ON "CatalogueCategory"("organizationId", "code");
CREATE INDEX IF NOT EXISTS "CatalogueCategory_organizationId_isActive_sortOrder_idx" ON "CatalogueCategory"("organizationId", "isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "CatalogueDesign" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "categoryName" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "photosJson" TEXT NOT NULL DEFAULT '[]',
  "approxWeightMin" DECIMAL(12,3),
  "approxWeightMax" DECIMAL(12,3),
  "supportedSizesJson" TEXT NOT NULL DEFAULT '[]',
  "supportedPurityIdsJson" TEXT NOT NULL DEFAULT '[]',
  "description" TEXT,
  "status" "CatalogueDesignStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogueDesign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CatalogueDesign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CatalogueDesign_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CatalogueCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CatalogueDesign_organizationId_code_key" ON "CatalogueDesign"("organizationId", "code");
CREATE INDEX IF NOT EXISTS "CatalogueDesign_organizationId_status_categoryId_idx" ON "CatalogueDesign"("organizationId", "status", "categoryId");
CREATE INDEX IF NOT EXISTS "CatalogueDesign_organizationId_status_approxWeightMin_approxWeightM_idx" ON "CatalogueDesign"("organizationId", "status", "approxWeightMin", "approxWeightMax");
CREATE INDEX IF NOT EXISTS "CatalogueDesign_organizationId_name_idx" ON "CatalogueDesign"("organizationId", "name");

CREATE TABLE IF NOT EXISTS "AccountInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "customerId" TEXT,
  "linkedKarigarId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "acceptedUserId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccountInvitation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccountInvitation_token_key" ON "AccountInvitation"("token");
CREATE INDEX IF NOT EXISTS "AccountInvitation_organizationId_role_idx" ON "AccountInvitation"("organizationId", "role");
CREATE INDEX IF NOT EXISTS "AccountInvitation_customerId_idx" ON "AccountInvitation"("customerId");

CREATE TABLE IF NOT EXISTS "CustomerOrderRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestNumber" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "submittedByUserId" TEXT NOT NULL,
  "status" "CustomerRequestStatus" NOT NULL DEFAULT 'AWAITING_APPROVAL',
  "requestedDeliveryDate" TIMESTAMP(3),
  "confirmedDeliveryDate" TIMESTAMP(3),
  "customerNote" TEXT,
  "managerVisibleNote" TEXT,
  "declineReason" TEXT,
  "hasPendingChangeReq" BOOLEAN NOT NULL DEFAULT false,
  "idempotencyKey" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerOrderRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerOrderRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerOrderRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerOrderRequest_idempotencyKey_key" ON "CustomerOrderRequest"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerOrderRequest_organizationId_requestNumber_key" ON "CustomerOrderRequest"("organizationId", "requestNumber");
CREATE INDEX IF NOT EXISTS "CustomerOrderRequest_organizationId_status_submittedAt_idx" ON "CustomerOrderRequest"("organizationId", "status", "submittedAt");
CREATE INDEX IF NOT EXISTS "CustomerOrderRequest_organizationId_customerId_submittedAt_idx" ON "CustomerOrderRequest"("organizationId", "customerId", "submittedAt");

CREATE TABLE IF NOT EXISTS "CustomerOrderRequestItem" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'CATALOGUE',
  "designId" TEXT,
  "designSnapshotJson" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "linkedBagQuantity" INTEGER NOT NULL DEFAULT 0,
  "size" TEXT,
  "purityId" TEXT,
  "purityLabelSnapshot" TEXT,
  "targetWeight" DECIMAL(12,3),
  "requestedChanges" TEXT,
  "textInstructions" TEXT,
  "requestedItemDate" TIMESTAMP(3),
  "voiceAttachmentId" TEXT,
  "referenceMediaIdsJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerOrderRequestItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerOrderRequestItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerOrderRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CustomerOrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomerOrderRequestItem_designId_fkey" FOREIGN KEY ("designId") REFERENCES "CatalogueDesign"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CustomerOrderRequestItem_organizationId_requestId_idx" ON "CustomerOrderRequestItem"("organizationId", "requestId");

CREATE TABLE IF NOT EXISTS "CustomerRequestMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "senderRole" "UserRole" NOT NULL,
  "senderName" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'CUSTOMER_AND_MANAGER',
  "messageType" TEXT NOT NULL DEFAULT 'TEXT',
  "body" TEXT NOT NULL,
  "attachmentIdsJson" TEXT NOT NULL DEFAULT '[]',
  "reviewedByManagerAt" TIMESTAMP(3),
  "reviewedByManagerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerRequestMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerRequestMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerRequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CustomerOrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CustomerRequestMessage_organizationId_requestId_createdAt_idx" ON "CustomerRequestMessage"("organizationId", "requestId", "createdAt");

CREATE TABLE IF NOT EXISTS "RequestBagLink" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestItemId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "linkedQuantity" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "unlinkedAt" TIMESTAMP(3),
  "unlinkedReason" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestBagLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestBagLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RequestBagLink_requestItemId_fkey" FOREIGN KEY ("requestItemId") REFERENCES "CustomerOrderRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RequestBagLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RequestBagLink_organizationId_orderId_isActive_idx" ON "RequestBagLink"("organizationId", "orderId", "isActive");
CREATE INDEX IF NOT EXISTS "RequestBagLink_organizationId_requestItemId_isActive_idx" ON "RequestBagLink"("organizationId", "requestItemId", "isActive");

CREATE TABLE IF NOT EXISTS "OrderCadAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "cadRequired" BOOLEAN NOT NULL DEFAULT true,
  "assignedDesignerId" TEXT,
  "status" "CadTaskStatus" NOT NULL DEFAULT 'NOT_ASSIGNED',
  "cadDeadline" TIMESTAMP(3),
  "currentVersion" INTEGER NOT NULL DEFAULT 0,
  "acknowledgedVersion" INTEGER NOT NULL DEFAULT 0,
  "completedVersion" INTEGER,
  "completedById" TEXT,
  "completedByName" TEXT,
  "completedAt" TIMESTAMP(3),
  "confirmedSpecsJson" TEXT NOT NULL DEFAULT '{}',
  "instructions" TEXT NOT NULL DEFAULT '',
  "selectedMediaIdsJson" TEXT NOT NULL DEFAULT '[]',
  "assignmentHistoryJson" TEXT NOT NULL DEFAULT '[]',
  "designerAskNote" TEXT,
  "sentToDesignerAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderCadAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderCadAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrderCadAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderCadAssignment_assignedDesignerId_fkey" FOREIGN KEY ("assignedDesignerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrderCadAssignment_orderId_key" ON "OrderCadAssignment"("orderId");
CREATE INDEX IF NOT EXISTS "OrderCadAssignment_organizationId_assignedDesignerId_status_idx" ON "OrderCadAssignment"("organizationId", "assignedDesignerId", "status");
CREATE INDEX IF NOT EXISTS "OrderCadAssignment_organizationId_cadRequired_status_idx" ON "OrderCadAssignment"("organizationId", "cadRequired", "status");

CREATE TABLE IF NOT EXISTS "CadInstructionVersion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "assignedDesignerId" TEXT,
  "cadDeadline" TIMESTAMP(3),
  "confirmedSpecsJson" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "selectedMediaIdsJson" TEXT NOT NULL DEFAULT '[]',
  "changeSummary" TEXT,
  "publishedById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CadInstructionVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CadInstructionVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CadInstructionVersion_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "OrderCadAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CadInstructionVersion_assignmentId_versionNumber_key" ON "CadInstructionVersion"("assignmentId", "versionNumber");
CREATE INDEX IF NOT EXISTS "CadInstructionVersion_organizationId_assignmentId_idx" ON "CadInstructionVersion"("organizationId", "assignmentId");

CREATE TABLE IF NOT EXISTS "AppAttachment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" "AppAttachmentKind" NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'PRIVATE',
  "ownerUserId" TEXT NOT NULL,
  "customerId" TEXT,
  "requestId" TEXT,
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "AppAttachment_storageKey_key" ON "AppAttachment"("storageKey");
CREATE INDEX IF NOT EXISTS "AppAttachment_organizationId_customerId_idx" ON "AppAttachment"("organizationId", "customerId");
CREATE INDEX IF NOT EXISTS "AppAttachment_organizationId_requestId_idx" ON "AppAttachment"("organizationId", "requestId");
CREATE INDEX IF NOT EXISTS "AppAttachment_organizationId_orderId_idx" ON "AppAttachment"("organizationId", "orderId");

CREATE TABLE IF NOT EXISTS "AppNotification" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "linkUrl" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "deliveryChannel" TEXT NOT NULL DEFAULT 'IN_APP',
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AppNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AppNotification_organizationId_recipientUserId_isRead_created_idx" ON "AppNotification"("organizationId", "recipientUserId", "isRead", "createdAt");
