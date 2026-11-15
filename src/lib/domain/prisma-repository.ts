import { Prisma, PrismaClient } from "@prisma/client";
import { toDecimal, ZERO } from "../decimal";
import { ErpRepository, ErpTransactionContext } from "./repository";
import {
  AuditEventEntity,
  BillShareTokenEntity,
  BillTemplateEntity,
  CustomerBillEntity,
  CustomerBillLineEntity,
  CustomerCashReceiptEntity,
  CustomerEntity,
  CustomerFineReceiptMode,
  CustomerGoldReceiptEntity,
  CustomerGoldReceiptLineEntity,
  CustomerPaymentAllocationEntity,
  JournalLineEntity,
  JournalTransactionEntity,
  KarigarEntity,
  LossWriteOffEntity,
  RecoverySettlementEntity,
  MakingDeductionAllocationEntity,
  MetalMovementEntity,
  OrderEntity,
  OrderProcessEntity,
  OrganizationCustomerFineConfigEntity,
  ProcessLossRecordEntity,
  ProcessType,
  ProcessVisitEntity,
  PurityEntity,
  RecoveryAllocationEntity,
  RecoveryReceiptEntity,
  RecoveryReceiptLineEntity,
  StockAccountEntity,
  StockConversionEntity,
  StockSaleEntity,
  StoneComponentEntryEntity,
} from "./types";

function mapPurity(row: {
  id: string;
  organizationId: string;
  code: string;
  displayLabel: string;
  karatLabel: string;
  touchPercent: Prisma.Decimal;
  isFineCategory: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): PurityEntity {
  return {
    ...row,
    touchPercent: toDecimal(row.touchPercent.toString()),
  };
}

function mapStockAccount(row: {
  id: string;
  organizationId: string;
  accountCode: string;
  name: string;
  accountType: StockAccountEntity["accountType"];
  purityId: string | null;
  karigarId: string | null;
  cachedPhysicalBalance: Prisma.Decimal;
  cachedFineBalance: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}): StockAccountEntity {
  return {
    ...row,
    cachedPhysicalBalance: toDecimal(row.cachedPhysicalBalance.toString()),
    cachedFineBalance: toDecimal(row.cachedFineBalance.toString()),
  };
}

function mapOrder(row: {
  id: string;
  organizationId: string;
  bagNumber: string;
  customerId: string;
  orderName: string;
  photoUrl: string | null;
  purityId: string;
  touchSnapshot: Prisma.Decimal;
  targetWeight: Prisma.Decimal | null;
  size: string | null;
  orderDate: Date;
  dueDate: Date | null;
  notes: string | null;
  adDetailsJson: string | null;
  status: OrderEntity["status"];
  initialIssuedMetalWeight: Prisma.Decimal;
  retainedStoneWeight: Prisma.Decimal;
  finishedGrossWeight: Prisma.Decimal | null;
  finishedStoneWeight: Prisma.Decimal | null;
  finishedNetMetalWeight: Prisma.Decimal | null;
  finishedFineWeight: Prisma.Decimal | null;
  totalRawLossWeight: Prisma.Decimal;
  totalFineLossWeight: Prisma.Decimal;
  completedAt: Date | null;
  completedById: string | null;
  deliveryStatus: OrderEntity["deliveryStatus"];
  deliveredAt: Date | null;
  deliveredById: string | null;
  billingStatus: OrderEntity["billingStatus"];
  activeBillId: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): OrderEntity {
  return {
    ...row,
    touchSnapshot: toDecimal(row.touchSnapshot.toString()),
    targetWeight: row.targetWeight ? toDecimal(row.targetWeight.toString()) : null,
    initialIssuedMetalWeight: toDecimal(row.initialIssuedMetalWeight.toString()),
    retainedStoneWeight: toDecimal(row.retainedStoneWeight.toString()),
    finishedGrossWeight: row.finishedGrossWeight
      ? toDecimal(row.finishedGrossWeight.toString())
      : null,
    finishedStoneWeight: row.finishedStoneWeight
      ? toDecimal(row.finishedStoneWeight.toString())
      : null,
    finishedNetMetalWeight: row.finishedNetMetalWeight
      ? toDecimal(row.finishedNetMetalWeight.toString())
      : null,
    finishedFineWeight: row.finishedFineWeight
      ? toDecimal(row.finishedFineWeight.toString())
      : null,
    totalRawLossWeight: toDecimal(row.totalRawLossWeight.toString()),
    totalFineLossWeight: toDecimal(row.totalFineLossWeight.toString()),
  };
}

function mapOrderProcess(row: {
  id: string;
  organizationId: string;
  orderId: string;
  processType: ProcessType;
  canonicalSequence: number;
  sequenceOrder: number;
  assignedKarigarId: string | null;
  status: OrderProcessEntity["status"];
  issuedMetalWeight: Prisma.Decimal;
  returnedMetalWeight: Prisma.Decimal;
  extraReturnedMetalWeight: Prisma.Decimal;
  closedLossWeight: Prisma.Decimal;
  custodyMetalWeight: Prisma.Decimal;
  carriedStoneInWeight: Prisma.Decimal;
  addedStoneWeight: Prisma.Decimal;
  removedStoneWeight: Prisma.Decimal;
  carriedStoneOutWeight: Prisma.Decimal;
  latestGrossInWeight: Prisma.Decimal;
  latestGrossOutWeight: Prisma.Decimal;
  closedAt: Date | null;
  closedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OrderProcessEntity {
  return {
    ...row,
    issuedMetalWeight: toDecimal(row.issuedMetalWeight.toString()),
    returnedMetalWeight: toDecimal(row.returnedMetalWeight.toString()),
    extraReturnedMetalWeight: toDecimal(row.extraReturnedMetalWeight.toString()),
    closedLossWeight: toDecimal(row.closedLossWeight.toString()),
    custodyMetalWeight: toDecimal(row.custodyMetalWeight.toString()),
    carriedStoneInWeight: toDecimal(row.carriedStoneInWeight.toString()),
    addedStoneWeight: toDecimal(row.addedStoneWeight.toString()),
    removedStoneWeight: toDecimal(row.removedStoneWeight.toString()),
    carriedStoneOutWeight: toDecimal(row.carriedStoneOutWeight.toString()),
    latestGrossInWeight: toDecimal(row.latestGrossInWeight.toString()),
    latestGrossOutWeight: toDecimal(row.latestGrossOutWeight.toString()),
  };
}

function mapProcessVisit(row: {
  id: string;
  organizationId: string;
  orderId: string;
  orderProcessId: string;
  visitNumber: number;
  karigarId: string;
  businessDate: Date;
  status: ProcessVisitEntity["status"];
  grossInWeight: Prisma.Decimal;
  nonGoldInWeight: Prisma.Decimal;
  metalInWeight: Prisma.Decimal;
  grossOutWeight: Prisma.Decimal;
  nonGoldOutWeight: Prisma.Decimal;
  metalOutWeight: Prisma.Decimal;
  extraMetalReturnedWeight: Prisma.Decimal;
  extraMetalTouchPercent: Prisma.Decimal | null;
  extraMetalPurityId: string | null;
  extraMetalFineWeight: Prisma.Decimal;
  custodyRemainingWeight: Prisma.Decimal;
  rawLossWeight: Prisma.Decimal;
  touchSnapshot: Prisma.Decimal;
  fineLossWeight: Prisma.Decimal;
  notes: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): ProcessVisitEntity {
  return {
    ...row,
    grossInWeight: toDecimal(row.grossInWeight.toString()),
    nonGoldInWeight: toDecimal(row.nonGoldInWeight.toString()),
    metalInWeight: toDecimal(row.metalInWeight.toString()),
    grossOutWeight: toDecimal(row.grossOutWeight.toString()),
    nonGoldOutWeight: toDecimal(row.nonGoldOutWeight.toString()),
    metalOutWeight: toDecimal(row.metalOutWeight.toString()),
    extraMetalReturnedWeight: toDecimal(row.extraMetalReturnedWeight.toString()),
    extraMetalTouchPercent: row.extraMetalTouchPercent
      ? toDecimal(row.extraMetalTouchPercent.toString())
      : null,
    extraMetalPurityId: row.extraMetalPurityId,
    extraMetalFineWeight: toDecimal(row.extraMetalFineWeight.toString()),
    custodyRemainingWeight: toDecimal(row.custodyRemainingWeight.toString()),
    rawLossWeight: toDecimal(row.rawLossWeight.toString()),
    touchSnapshot: toDecimal(row.touchSnapshot.toString()),
    fineLossWeight: toDecimal(row.fineLossWeight.toString()),
  };
}

function mapMetalMovement(row: {
  id: string;
  organizationId: string;
  orderId: string;
  orderProcessId: string | null;
  processVisitId: string | null;
  movementType: MetalMovementEntity["movementType"];
  fromProcessType: ProcessType | null;
  toProcessType: ProcessType | null;
  karigarId: string | null;
  businessDate: Date;
  grossWeight: Prisma.Decimal;
  nonGoldWeight: Prisma.Decimal;
  netMetalWeight: Prisma.Decimal;
  touchSnapshot: Prisma.Decimal;
  fineEquivalentWeight: Prisma.Decimal;
  journalTransactionId: string | null;
  idempotencyKey: string;
  notes: string | null;
  createdById: string;
  createdAt: Date;
}): MetalMovementEntity {
  return {
    ...row,
    grossWeight: toDecimal(row.grossWeight.toString()),
    nonGoldWeight: toDecimal(row.nonGoldWeight.toString()),
    netMetalWeight: toDecimal(row.netMetalWeight.toString()),
    touchSnapshot: toDecimal(row.touchSnapshot.toString()),
    fineEquivalentWeight: toDecimal(row.fineEquivalentWeight.toString()),
  };
}

function mapStoneComponent(row: {
  id: string;
  organizationId: string;
  orderId: string;
  orderProcessId: string;
  processVisitId: string | null;
  componentType: string;
  direction: StoneComponentEntryEntity["direction"];
  sizeLabel: string | null;
  pieces: number;
  weightGrams: Prisma.Decimal;
  notes: string | null;
  createdById: string;
  createdAt: Date;
}): StoneComponentEntryEntity {
  return {
    ...row,
    weightGrams: toDecimal(row.weightGrams.toString()),
  };
}

function mapProcessLossRecord(row: {
  id: string;
  organizationId: string;
  orderId: string;
  orderProcessId: string;
  processVisitId: string;
  karigarId: string;
  processType: ProcessType;
  businessDate: Date;
  rawMetalLossWeight: Prisma.Decimal;
  touchSnapshot: Prisma.Decimal;
  fineEquivalentLossWeight: Prisma.Decimal;
  eligibilityStatus: ProcessLossRecordEntity["eligibilityStatus"];
  journalTransactionId: string | null;
  eligibleAt: Date | null;
  notes: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}): ProcessLossRecordEntity {
  return {
    ...row,
    rawMetalLossWeight: toDecimal(row.rawMetalLossWeight.toString()),
    touchSnapshot: toDecimal(row.touchSnapshot.toString()),
    fineEquivalentLossWeight: toDecimal(row.fineEquivalentLossWeight.toString()),
  };
}

function mapJournalTransaction(row: {
  id: string;
  organizationId: string;
  transactionNumber: string;
  transactionType: JournalTransactionEntity["transactionType"];
  businessDate: Date;
  purityId: string;
  touchSnapshot: Prisma.Decimal;
  physicalWeight: Prisma.Decimal;
  fineEquivalentWeight: Prisma.Decimal;
  sourceReference: string | null;
  reason: string;
  orderId: string | null;
  orderProcessId: string | null;
  processVisitId: string | null;
  karigarId: string | null;
  idempotencyKey: string;
  reversalOfTransactionId: string | null;
  isReversed: boolean;
  actorId: string;
  createdAt: Date;
}): JournalTransactionEntity {
  return {
    ...row,
    touchSnapshot: toDecimal(row.touchSnapshot.toString()),
    physicalWeight: toDecimal(row.physicalWeight.toString()),
    fineEquivalentWeight: toDecimal(row.fineEquivalentWeight.toString()),
  };
}

function mapJournalLine(row: {
  id: string;
  organizationId: string;
  journalTransactionId: string;
  accountId: string;
  direction: JournalLineEntity["direction"];
  signedPhysicalDelta: Prisma.Decimal;
  touchSnapshot: Prisma.Decimal;
  signedFineDelta: Prisma.Decimal;
  orderId: string | null;
  orderProcessId: string | null;
  karigarId: string | null;
  description: string;
  createdAt: Date;
}): JournalLineEntity {
  return {
    ...row,
    signedPhysicalDelta: toDecimal(row.signedPhysicalDelta.toString()),
    touchSnapshot: toDecimal(row.touchSnapshot.toString()),
    signedFineDelta: toDecimal(row.signedFineDelta.toString()),
  };
}

export class PrismaErpRepository implements ErpRepository {
  constructor(private readonly client: PrismaClient) { }

  public async runInTransaction<T>(
    fn: (tx: ErpTransactionContext) => Promise<T>
  ): Promise<T> {
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.client.$transaction(
          async (ptx) => {
            const ctx = this.createContext(ptx);
            return fn(ctx);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10000,
            timeout: 20000,
          }
        );
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === "P2034" && attempt < maxRetries) {
          // Retry on PostgreSQL serialization conflict (40001)
          await new Promise((r) => setTimeout(r, 25 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Transaction exceeded maximum serialization retries");
  }

  private createContext(
    ptx: Prisma.TransactionClient
  ): ErpTransactionContext {
    return {
      listPurities: async (organizationId) => {
        const rows = await ptx.purityDefinition.findMany({
          where: { organizationId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });
        return rows.map(mapPurity);
      },
      getPurityById: async (organizationId, id) => {
        const row = await ptx.purityDefinition.findFirst({
          where: { id, organizationId },
        });
        return row ? mapPurity(row) : null;
      },
      getPurityByCodeOrLabel: async (organizationId, code, displayLabel) => {
        const row = await ptx.purityDefinition.findFirst({
          where: {
            organizationId,
            OR: [
              { code: { equals: code, mode: "insensitive" } },
              { displayLabel: { equals: displayLabel, mode: "insensitive" } },
            ],
          },
        });
        return row ? mapPurity(row) : null;
      },
      createPurity: async (purity) => {
        const row = await ptx.purityDefinition.create({
          data: {
            id: purity.id,
            organizationId: purity.organizationId,
            code: purity.code,
            displayLabel: purity.displayLabel,
            karatLabel: purity.karatLabel,
            touchPercent: purity.touchPercent.toFixed(4),
            isFineCategory: purity.isFineCategory,
            isActive: purity.isActive,
            sortOrder: purity.sortOrder,
          },
        });
        return mapPurity(row);
      },

      listStockAccounts: async (organizationId) => {
        const rows = await ptx.stockAccount.findMany({
          where: { organizationId },
        });
        return rows.map(mapStockAccount);
      },
      getStockAccountByCode: async (organizationId, accountCode) => {
        const row = await ptx.stockAccount.findUnique({
          where: {
            organizationId_accountCode: { organizationId, accountCode },
          },
        });
        return row ? mapStockAccount(row) : null;
      },
      getStockAccountById: async (organizationId, id) => {
        const row = await ptx.stockAccount.findFirst({
          where: { id, organizationId },
        });
        return row ? mapStockAccount(row) : null;
      },
      createStockAccount: async (account) => {
        const row = await ptx.stockAccount.create({
          data: {
            id: account.id,
            organizationId: account.organizationId,
            accountCode: account.accountCode,
            name: account.name,
            accountType: account.accountType,
            purityId: account.purityId,
            karigarId: account.karigarId,
            cachedPhysicalBalance: account.cachedPhysicalBalance.toFixed(6),
            cachedFineBalance: account.cachedFineBalance.toFixed(6),
          },
        });
        return mapStockAccount(row);
      },
      updateStockAccountBalances: async (id, phys, fine) => {
        const row = await ptx.stockAccount.update({
          where: { id },
          data: {
            cachedPhysicalBalance: phys.toFixed(6),
            cachedFineBalance: fine.toFixed(6),
          },
        });
        return mapStockAccount(row);
      },

      listCustomers: async (organizationId) => {
        return ptx.customer.findMany({
          where: { organizationId },
          orderBy: { name: "asc" },
        });
      },
      getCustomerById: async (organizationId, id) => {
        return ptx.customer.findFirst({ where: { id, organizationId } });
      },
      createCustomer: async (customer: CustomerEntity) => {
        return ptx.customer.create({
          data: {
            id: customer.id,
            organizationId: customer.organizationId,
            customerCode: customer.customerCode,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            gstNumber: customer.gstNumber,
            notes: customer.notes,
            isActive: customer.isActive,
          },
        });
      },
      updateCustomer: async (customer: CustomerEntity) => {
        return ptx.customer.update({
          where: { id: customer.id },
          data: {
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
            gstNumber: customer.gstNumber,
            notes: customer.notes,
            isActive: customer.isActive,
          },
        });
      },

      listKarigars: async (organizationId) => {
        const rows = await ptx.karigar.findMany({
          where: { organizationId },
          include: { capabilities: true },
          orderBy: { karigarCode: "asc" },
        });
        return rows.map((r) => ({
          id: r.id,
          organizationId: r.organizationId,
          karigarCode: r.karigarCode,
          name: r.name,
          phone: r.phone,
          specializationNotes: r.specializationNotes,
          isActive: r.isActive,
          capabilities: r.capabilities
            .filter((c) => c.isActive)
            .map((c) => c.processType),
          defaultForProcesses: r.capabilities
            .filter((c) => c.isActive && c.isDefault)
            .map((c) => c.processType),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }));
      },
      getKarigarById: async (organizationId, id) => {
        const r = await ptx.karigar.findFirst({
          where: { id, organizationId },
          include: { capabilities: true },
        });
        if (!r) return null;
        return {
          id: r.id,
          organizationId: r.organizationId,
          karigarCode: r.karigarCode,
          name: r.name,
          phone: r.phone,
          specializationNotes: r.specializationNotes,
          isActive: r.isActive,
          capabilities: r.capabilities
            .filter((c) => c.isActive)
            .map((c) => c.processType),
          defaultForProcesses: r.capabilities
            .filter((c) => c.isActive && c.isDefault)
            .map((c) => c.processType),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      },
      createKarigar: async (karigar: KarigarEntity) => {
        const r = await ptx.karigar.create({
          data: {
            id: karigar.id,
            organizationId: karigar.organizationId,
            karigarCode: karigar.karigarCode,
            name: karigar.name,
            phone: karigar.phone,
            specializationNotes: karigar.specializationNotes,
            isActive: karigar.isActive,
            capabilities: {
              create: karigar.capabilities.map((pType) => ({
                organizationId: karigar.organizationId,
                processType: pType,
                isDefault: (karigar.defaultForProcesses ?? []).includes(pType),
                isActive: true,
              })),
            },
          },
          include: { capabilities: true },
        });
        return {
          id: r.id,
          organizationId: r.organizationId,
          karigarCode: r.karigarCode,
          name: r.name,
          phone: r.phone,
          specializationNotes: r.specializationNotes,
          isActive: r.isActive,
          capabilities: r.capabilities.map((c) => c.processType),
          defaultForProcesses: r.capabilities
            .filter((c) => c.isDefault)
            .map((c) => c.processType),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      },
      updateKarigar: async (karigar: KarigarEntity) => {
        await ptx.karigarCapability.deleteMany({
          where: { karigarId: karigar.id },
        });
        const r = await ptx.karigar.update({
          where: { id: karigar.id },
          data: {
            name: karigar.name,
            phone: karigar.phone,
            specializationNotes: karigar.specializationNotes,
            isActive: karigar.isActive,
            capabilities: {
              create: karigar.capabilities.map((pType) => ({
                organizationId: karigar.organizationId,
                processType: pType,
                isDefault: (karigar.defaultForProcesses ?? []).includes(pType),
                isActive: true,
              })),
            },
          },
          include: { capabilities: true },
        });
        return {
          id: r.id,
          organizationId: r.organizationId,
          karigarCode: r.karigarCode,
          name: r.name,
          phone: r.phone,
          specializationNotes: r.specializationNotes,
          isActive: r.isActive,
          capabilities: r.capabilities.map((c) => c.processType),
          defaultForProcesses: r.capabilities
            .filter((c) => c.isDefault)
            .map((c) => c.processType),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      },

      listOrders: async (organizationId) => {
        const rows = await ptx.order.findMany({
          where: { organizationId },
          orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
        });
        return rows.map(mapOrder);
      },
      getOrderById: async (organizationId, id) => {
        const row = await ptx.order.findFirst({
          where: { id, organizationId },
        });
        return row ? mapOrder(row) : null;
      },
      getOrderByBagNumber: async (organizationId, bagNumber) => {
        const row = await ptx.order.findFirst({
          where: {
            organizationId,
            bagNumber: { equals: bagNumber, mode: "insensitive" },
          },
        });
        return row ? mapOrder(row) : null;
      },
      createOrder: async (order) => {
        const row = await ptx.order.create({
          data: {
            id: order.id,
            organizationId: order.organizationId,
            bagNumber: order.bagNumber,
            customerId: order.customerId,
            orderName: order.orderName,
            photoUrl: order.photoUrl,
            purityId: order.purityId,
            touchSnapshot: order.touchSnapshot.toFixed(4),
            targetWeight: order.targetWeight
              ? order.targetWeight.toFixed(6)
              : null,
            size: order.size,
            orderDate: order.orderDate,
            dueDate: order.dueDate,
            notes: order.notes,
            adDetailsJson: order.adDetailsJson,
            status: order.status,
            initialIssuedMetalWeight:
              order.initialIssuedMetalWeight.toFixed(6),
            retainedStoneWeight: order.retainedStoneWeight.toFixed(6),
            totalRawLossWeight: order.totalRawLossWeight.toFixed(6),
            totalFineLossWeight: order.totalFineLossWeight.toFixed(6),
            createdById: order.createdById,
          },
        });
        return mapOrder(row);
      },
      updateOrder: async (order) => {
        const row = await ptx.order.update({
          where: { id: order.id },
          data: {
            status: order.status,
            initialIssuedMetalWeight:
              order.initialIssuedMetalWeight.toFixed(6),
            retainedStoneWeight: order.retainedStoneWeight.toFixed(6),
            finishedGrossWeight: order.finishedGrossWeight
              ? order.finishedGrossWeight.toFixed(6)
              : null,
            finishedStoneWeight: order.finishedStoneWeight
              ? order.finishedStoneWeight.toFixed(6)
              : null,
            finishedNetMetalWeight: order.finishedNetMetalWeight
              ? order.finishedNetMetalWeight.toFixed(6)
              : null,
            finishedFineWeight: order.finishedFineWeight
              ? order.finishedFineWeight.toFixed(6)
              : null,
            totalRawLossWeight: order.totalRawLossWeight.toFixed(6),
            totalFineLossWeight: order.totalFineLossWeight.toFixed(6),
            completedAt: order.completedAt,
            completedById: order.completedById,
            deliveryStatus: order.deliveryStatus,
            deliveredAt: order.deliveredAt,
            deliveredById: order.deliveredById,
            billingStatus: order.billingStatus,
            activeBillId: order.activeBillId,
            cancelledAt: order.cancelledAt,
            cancellationReason: order.cancellationReason,
          },
        });
        return mapOrder(row);
      },
      deleteOrder: async (organizationId, orderId) => {
        await ptx.journalLine.updateMany({
          where: { organizationId, orderId },
          data: { orderId: null, orderProcessId: null },
        });
        await ptx.journalTransaction.updateMany({
          where: { organizationId, orderId },
          data: { orderId: null, orderProcessId: null, processVisitId: null },
        });
        await ptx.recoveryAllocation.deleteMany({
          where: {
            organizationId,
            processLossRecord: { orderId },
          },
        });
        await ptx.lossWriteOff.deleteMany({
          where: {
            organizationId,
            processLossRecord: { orderId },
          },
        });
        await ptx.makingDeductionAllocation.deleteMany({
          where: {
            organizationId,
            processLossRecord: { orderId },
          },
        });
        await ptx.processLossRecord.deleteMany({
          where: { organizationId, orderId },
        });
        await ptx.stoneComponentEntry.deleteMany({
          where: { organizationId, orderId },
        });
        await ptx.metalMovement.deleteMany({
          where: { organizationId, orderId },
        });
        await ptx.processVisit.deleteMany({
          where: { organizationId, orderId },
        });
        await ptx.orderProcess.deleteMany({
          where: { organizationId, orderId },
        });
        await ptx.attachment.deleteMany({
          where: { organizationId, orderId },
        });
        await ptx.order.deleteMany({
          where: { organizationId, id: orderId },
        });
      },

      listOrderProcesses: async (organizationId, orderId) => {
        const rows = await ptx.orderProcess.findMany({
          where: { organizationId, ...(orderId ? { orderId } : {}) },
          orderBy: { canonicalSequence: "asc" },
        });
        return rows.map(mapOrderProcess);
      },
      getOrderProcessById: async (organizationId, id) => {
        const row = await ptx.orderProcess.findFirst({
          where: { id, organizationId },
        });
        return row ? mapOrderProcess(row) : null;
      },
      createOrderProcess: async (proc) => {
        const row = await ptx.orderProcess.create({
          data: {
            id: proc.id,
            organizationId: proc.organizationId,
            orderId: proc.orderId,
            processType: proc.processType,
            canonicalSequence: proc.canonicalSequence,
            sequenceOrder: proc.sequenceOrder,
            assignedKarigarId: proc.assignedKarigarId,
            status: proc.status,
            issuedMetalWeight: proc.issuedMetalWeight.toFixed(6),
            returnedMetalWeight: proc.returnedMetalWeight.toFixed(6),
            extraReturnedMetalWeight: proc.extraReturnedMetalWeight.toFixed(6),
            closedLossWeight: proc.closedLossWeight.toFixed(6),
            custodyMetalWeight: proc.custodyMetalWeight.toFixed(6),
            carriedStoneInWeight: proc.carriedStoneInWeight.toFixed(6),
            addedStoneWeight: proc.addedStoneWeight.toFixed(6),
            removedStoneWeight: proc.removedStoneWeight.toFixed(6),
            carriedStoneOutWeight: proc.carriedStoneOutWeight.toFixed(6),
            latestGrossInWeight: proc.latestGrossInWeight.toFixed(6),
            latestGrossOutWeight: proc.latestGrossOutWeight.toFixed(6),
          },
        });
        return mapOrderProcess(row);
      },
      updateOrderProcess: async (proc) => {
        const row = await ptx.orderProcess.update({
          where: { id: proc.id },
          data: {
            assignedKarigarId: proc.assignedKarigarId,
            status: proc.status,
            issuedMetalWeight: proc.issuedMetalWeight.toFixed(6),
            returnedMetalWeight: proc.returnedMetalWeight.toFixed(6),
            extraReturnedMetalWeight: proc.extraReturnedMetalWeight.toFixed(6),
            closedLossWeight: proc.closedLossWeight.toFixed(6),
            custodyMetalWeight: proc.custodyMetalWeight.toFixed(6),
            carriedStoneInWeight: proc.carriedStoneInWeight.toFixed(6),
            addedStoneWeight: proc.addedStoneWeight.toFixed(6),
            removedStoneWeight: proc.removedStoneWeight.toFixed(6),
            carriedStoneOutWeight: proc.carriedStoneOutWeight.toFixed(6),
            latestGrossInWeight: proc.latestGrossInWeight.toFixed(6),
            latestGrossOutWeight: proc.latestGrossOutWeight.toFixed(6),
            closedAt: proc.closedAt,
            closedById: proc.closedById,
          },
        });
        return mapOrderProcess(row);
      },

      listProcessVisits: async (organizationId, orderId) => {
        const rows = await ptx.processVisit.findMany({
          where: { organizationId, ...(orderId ? { orderId } : {}) },
          orderBy: { visitNumber: "asc" },
        });
        return rows.map(mapProcessVisit);
      },
      getProcessVisitByIdempotencyKey: async (idempotencyKey) => {
        const row = await ptx.processVisit.findUnique({
          where: { idempotencyKey },
        });
        return row ? mapProcessVisit(row) : null;
      },
      createProcessVisit: async (visit) => {
        const row = await ptx.processVisit.create({
          data: {
            id: visit.id,
            organizationId: visit.organizationId,
            orderId: visit.orderId,
            orderProcessId: visit.orderProcessId,
            visitNumber: visit.visitNumber,
            karigarId: visit.karigarId,
            businessDate: visit.businessDate,
            status: visit.status,
            grossInWeight: visit.grossInWeight.toFixed(6),
            nonGoldInWeight: visit.nonGoldInWeight.toFixed(6),
            metalInWeight: visit.metalInWeight.toFixed(6),
            grossOutWeight: visit.grossOutWeight.toFixed(6),
            nonGoldOutWeight: visit.nonGoldOutWeight.toFixed(6),
            metalOutWeight: visit.metalOutWeight.toFixed(6),
            extraMetalReturnedWeight: visit.extraMetalReturnedWeight.toFixed(6),
            extraMetalTouchPercent: visit.extraMetalTouchPercent
              ? visit.extraMetalTouchPercent.toFixed(4)
              : null,
            extraMetalPurityId: visit.extraMetalPurityId,
            extraMetalFineWeight: visit.extraMetalFineWeight.toFixed(6),
            custodyRemainingWeight: visit.custodyRemainingWeight.toFixed(6),
            rawLossWeight: visit.rawLossWeight.toFixed(6),
            touchSnapshot: visit.touchSnapshot.toFixed(4),
            fineLossWeight: visit.fineLossWeight.toFixed(6),
            notes: visit.notes,
            idempotencyKey: visit.idempotencyKey,
            createdById: visit.createdById,
          },
        });
        return mapProcessVisit(row);
      },
      updateProcessVisit: async (visit) => {
        const row = await ptx.processVisit.update({
          where: { id: visit.id },
          data: {
            status: visit.status,
          },
        });
        return mapProcessVisit(row);
      },

      listMetalMovements: async (organizationId, orderId) => {
        const rows = await ptx.metalMovement.findMany({
          where: { organizationId, ...(orderId ? { orderId } : {}) },
          orderBy: { createdAt: "asc" },
        });
        return rows.map(mapMetalMovement);
      },
      getMetalMovementByIdempotencyKey: async (idempotencyKey) => {
        const row = await ptx.metalMovement.findUnique({
          where: { idempotencyKey },
        });
        return row ? mapMetalMovement(row) : null;
      },
      createMetalMovement: async (mov) => {
        const row = await ptx.metalMovement.create({
          data: {
            id: mov.id,
            organizationId: mov.organizationId,
            orderId: mov.orderId,
            orderProcessId: mov.orderProcessId,
            processVisitId: mov.processVisitId,
            movementType: mov.movementType,
            fromProcessType: mov.fromProcessType,
            toProcessType: mov.toProcessType,
            karigarId: mov.karigarId,
            businessDate: mov.businessDate,
            grossWeight: mov.grossWeight.toFixed(6),
            nonGoldWeight: mov.nonGoldWeight.toFixed(6),
            netMetalWeight: mov.netMetalWeight.toFixed(6),
            touchSnapshot: mov.touchSnapshot.toFixed(4),
            fineEquivalentWeight: mov.fineEquivalentWeight.toFixed(6),
            journalTransactionId: mov.journalTransactionId,
            idempotencyKey: mov.idempotencyKey,
            notes: mov.notes,
            createdById: mov.createdById,
          },
        });
        return mapMetalMovement(row);
      },

      listStoneComponentEntries: async (organizationId, orderId) => {
        const rows = await ptx.stoneComponentEntry.findMany({
          where: { organizationId, ...(orderId ? { orderId } : {}) },
          orderBy: { createdAt: "asc" },
        });
        return rows.map(mapStoneComponent);
      },
      createStoneComponentEntry: async (entry) => {
        const row = await ptx.stoneComponentEntry.create({
          data: {
            id: entry.id,
            organizationId: entry.organizationId,
            orderId: entry.orderId,
            orderProcessId: entry.orderProcessId,
            processVisitId: entry.processVisitId,
            componentType: entry.componentType,
            direction: entry.direction,
            sizeLabel: entry.sizeLabel,
            pieces: entry.pieces,
            weightGrams: entry.weightGrams.toFixed(6),
            notes: entry.notes,
            createdById: entry.createdById,
          },
        });
        return mapStoneComponent(row);
      },

      listProcessLossRecords: async (organizationId, orderId) => {
        const rows = await ptx.processLossRecord.findMany({
          where: { organizationId, ...(orderId ? { orderId } : {}) },
          orderBy: { createdAt: "asc" },
        });
        return rows.map(mapProcessLossRecord);
      },
      getProcessLossRecordById: async (organizationId, id) => {
        const row = await ptx.processLossRecord.findFirst({
          where: { id, organizationId },
        });
        return row ? mapProcessLossRecord(row) : null;
      },
      createProcessLossRecord: async (rec) => {
        const row = await ptx.processLossRecord.create({
          data: {
            id: rec.id,
            organizationId: rec.organizationId,
            orderId: rec.orderId,
            orderProcessId: rec.orderProcessId,
            processVisitId: rec.processVisitId,
            karigarId: rec.karigarId,
            processType: rec.processType,
            businessDate: rec.businessDate,
            rawMetalLossWeight: rec.rawMetalLossWeight.toFixed(6),
            touchSnapshot: rec.touchSnapshot.toFixed(4),
            fineEquivalentLossWeight: rec.fineEquivalentLossWeight.toFixed(6),
            eligibilityStatus: rec.eligibilityStatus,
            journalTransactionId: rec.journalTransactionId,
            eligibleAt: rec.eligibleAt,
            notes: rec.notes,
            createdById: rec.createdById,
          },
        });
        return mapProcessLossRecord(row);
      },
      updateProcessLossRecord: async (rec) => {
        const row = await ptx.processLossRecord.update({
          where: { id: rec.id },
          data: {
            eligibilityStatus: rec.eligibilityStatus,
            eligibleAt: rec.eligibleAt,
          },
        });
        return mapProcessLossRecord(row);
      },

      listJournalTransactions: async (organizationId) => {
        const rows = await ptx.journalTransaction.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
        });
        return rows.map(mapJournalTransaction);
      },
      getJournalTransactionById: async (organizationId, id) => {
        const row = await ptx.journalTransaction.findFirst({
          where: { id, organizationId },
        });
        return row ? mapJournalTransaction(row) : null;
      },
      getJournalTransactionByIdempotencyKey: async (idempotencyKey) => {
        const row = await ptx.journalTransaction.findUnique({
          where: { idempotencyKey },
        });
        return row ? mapJournalTransaction(row) : null;
      },
      createJournalTransaction: async (jtx) => {
        const row = await ptx.journalTransaction.create({
          data: {
            id: jtx.id,
            organizationId: jtx.organizationId,
            transactionNumber: jtx.transactionNumber,
            transactionType: jtx.transactionType,
            businessDate: jtx.businessDate,
            purityId: jtx.purityId,
            touchSnapshot: jtx.touchSnapshot.toFixed(4),
            physicalWeight: jtx.physicalWeight.toFixed(6),
            fineEquivalentWeight: jtx.fineEquivalentWeight.toFixed(6),
            sourceReference: jtx.sourceReference,
            reason: jtx.reason,
            orderId: jtx.orderId,
            orderProcessId: jtx.orderProcessId,
            processVisitId: jtx.processVisitId,
            karigarId: jtx.karigarId,
            idempotencyKey: jtx.idempotencyKey,
            reversalOfTransactionId: jtx.reversalOfTransactionId,
            isReversed: jtx.isReversed,
            actorId: jtx.actorId,
          },
        });
        return mapJournalTransaction(row);
      },
      markJournalTransactionReversed: async (id) => {
        const row = await ptx.journalTransaction.update({
          where: { id },
          data: { isReversed: true },
        });
        return mapJournalTransaction(row);
      },

      listJournalLines: async (organizationId, accountId) => {
        const rows = await ptx.journalLine.findMany({
          where: { organizationId, ...(accountId ? { accountId } : {}) },
          orderBy: { createdAt: "asc" },
        });
        return rows.map(mapJournalLine);
      },
      createJournalLine: async (line) => {
        const row = await ptx.journalLine.create({
          data: {
            id: line.id,
            organizationId: line.organizationId,
            journalTransactionId: line.journalTransactionId,
            accountId: line.accountId,
            direction: line.direction,
            signedPhysicalDelta: line.signedPhysicalDelta.toFixed(6),
            touchSnapshot: line.touchSnapshot.toFixed(4),
            signedFineDelta: line.signedFineDelta.toFixed(6),
            orderId: line.orderId,
            orderProcessId: line.orderProcessId,
            karigarId: line.karigarId,
            description: line.description,
          },
        });
        return mapJournalLine(row);
      },

      listAuditEvents: async (organizationId) => {
        return ptx.auditEvent.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
        });
      },
      createAuditEvent: async (event: AuditEventEntity) => {
        return ptx.auditEvent.create({
          data: {
            id: event.id,
            organizationId: event.organizationId,
            actorId: event.actorId,
            entityType: event.entityType,
            entityId: event.entityId,
            action: event.action,
            summary: event.summary,
            metadataJson: event.metadataJson,
          },
        });
      },

      // Karigar Recovery: Receipts, Lines, Allocations, Write-Offs
      listRecoveryReceipts: async (organizationId, karigarId) => {
        const rows = await ptx.recoveryReceipt.findMany({
          where: { organizationId, ...(karigarId ? { karigarId } : {}) },
          orderBy: { createdAt: "desc" },
        });
        return rows.map((r) => ({
          ...r,
          recoveredGrossWeight: toDecimal(r.recoveredGrossWeight.toString()),
          recoveredTouchPercent: toDecimal(r.recoveredTouchPercent.toString()),
          recoveredFineWeight: toDecimal(r.recoveredFineWeight.toString()),
          unallocatedFineWeight: toDecimal(r.unallocatedFineWeight.toString()),
        }));
      },
      getRecoveryReceiptById: async (organizationId, id) => {
        const r = await ptx.recoveryReceipt.findFirst({
          where: { id, organizationId },
        });
        if (!r) return null;
        return {
          ...r,
          recoveredGrossWeight: toDecimal(r.recoveredGrossWeight.toString()),
          recoveredTouchPercent: toDecimal(r.recoveredTouchPercent.toString()),
          recoveredFineWeight: toDecimal(r.recoveredFineWeight.toString()),
          unallocatedFineWeight: toDecimal(r.unallocatedFineWeight.toString()),
        };
      },
      getRecoveryReceiptByIdempotencyKey: async (idempotencyKey) => {
        const r = await ptx.recoveryReceipt.findUnique({
          where: { idempotencyKey },
        });
        if (!r) return null;
        return {
          ...r,
          recoveredGrossWeight: toDecimal(r.recoveredGrossWeight.toString()),
          recoveredTouchPercent: toDecimal(r.recoveredTouchPercent.toString()),
          recoveredFineWeight: toDecimal(r.recoveredFineWeight.toString()),
          unallocatedFineWeight: toDecimal(r.unallocatedFineWeight.toString()),
        };
      },
      createRecoveryReceipt: async (receipt: RecoveryReceiptEntity) => {
        const r = await ptx.recoveryReceipt.create({
          data: {
            id: receipt.id,
            organizationId: receipt.organizationId,
            karigarId: receipt.karigarId,
            receiptNumber: receipt.receiptNumber,
            businessDate: receipt.businessDate,
            recoveredGrossWeight: receipt.recoveredGrossWeight.toFixed(6),
            recoveredTouchPercent: receipt.recoveredTouchPercent.toFixed(4),
            recoveredFineWeight: receipt.recoveredFineWeight.toFixed(6),
            unallocatedFineWeight: receipt.unallocatedFineWeight.toFixed(6),
            referenceNumber: receipt.referenceNumber,
            notes: receipt.notes,
            status: receipt.status,
            idempotencyKey: receipt.idempotencyKey,
            journalTransactionId: receipt.journalTransactionId,
            createdById: receipt.createdById,
            reversedAt: receipt.reversedAt,
            reversalReason: receipt.reversalReason,
            recoverySettlementId: receipt.recoverySettlementId ?? null,
          },
        });
        return {
          ...r,
          recoveredGrossWeight: toDecimal(r.recoveredGrossWeight.toString()),
          recoveredTouchPercent: toDecimal(r.recoveredTouchPercent.toString()),
          recoveredFineWeight: toDecimal(r.recoveredFineWeight.toString()),
          unallocatedFineWeight: toDecimal(r.unallocatedFineWeight.toString()),
        };
      },
      updateRecoveryReceipt: async (receipt: RecoveryReceiptEntity) => {
        const r = await ptx.recoveryReceipt.update({
          where: { id: receipt.id },
          data: {
            unallocatedFineWeight: receipt.unallocatedFineWeight.toFixed(6),
            status: receipt.status,
            reversedAt: receipt.reversedAt,
            reversalReason: receipt.reversalReason,
            recoverySettlementId: receipt.recoverySettlementId ?? null,
          },
        });
        return {
          ...r,
          recoveredGrossWeight: toDecimal(r.recoveredGrossWeight.toString()),
          recoveredTouchPercent: toDecimal(r.recoveredTouchPercent.toString()),
          recoveredFineWeight: toDecimal(r.recoveredFineWeight.toString()),
          unallocatedFineWeight: toDecimal(r.unallocatedFineWeight.toString()),
        };
      },

      listRecoveryReceiptLines: async (organizationId, recoveryReceiptId) => {
        const rows = await ptx.recoveryReceiptLine.findMany({
          where: {
            organizationId,
            ...(recoveryReceiptId ? { recoveryReceiptId } : {}),
          },
          orderBy: { createdAt: "asc" },
        });
        return rows.map((l) => ({
          ...l,
          grossWeight: toDecimal(l.grossWeight.toString()),
          touchPercent: toDecimal(l.touchPercent.toString()),
          fineWeight: toDecimal(l.fineWeight.toString()),
        }));
      },
      createRecoveryReceiptLine: async (line: RecoveryReceiptLineEntity) => {
        const l = await ptx.recoveryReceiptLine.create({
          data: {
            id: line.id,
            organizationId: line.organizationId,
            recoveryReceiptId: line.recoveryReceiptId,
            purityId: line.purityId,
            destinationAccountId: line.destinationAccountId,
            grossWeight: line.grossWeight.toFixed(6),
            touchPercent: line.touchPercent.toFixed(4),
            fineWeight: line.fineWeight.toFixed(6),
            journalTransactionId: line.journalTransactionId,
          },
        });
        return {
          ...l,
          grossWeight: toDecimal(l.grossWeight.toString()),
          touchPercent: toDecimal(l.touchPercent.toString()),
          fineWeight: toDecimal(l.fineWeight.toString()),
        };
      },

      listRecoveryAllocations: async (organizationId, filter) => {
        const rows = await ptx.recoveryAllocation.findMany({
          where: {
            organizationId,
            ...(filter?.recoveryReceiptId
              ? { recoveryReceiptId: filter.recoveryReceiptId }
              : {}),
            ...(filter?.processLossRecordId
              ? { processLossRecordId: filter.processLossRecordId }
              : {}),
          },
          orderBy: { createdAt: "asc" },
        });
        return rows.map((a) => ({
          ...a,
          allocatedFineWeight: toDecimal(a.allocatedFineWeight.toString()),
        }));
      },
      getRecoveryAllocationById: async (organizationId, id) => {
        const a = await ptx.recoveryAllocation.findFirst({
          where: { id, organizationId },
        });
        if (!a) return null;
        return {
          ...a,
          allocatedFineWeight: toDecimal(a.allocatedFineWeight.toString()),
        };
      },
      getRecoveryAllocationByIdempotencyKey: async (idempotencyKey) => {
        const a = await ptx.recoveryAllocation.findUnique({
          where: { idempotencyKey },
        });
        if (!a) return null;
        return {
          ...a,
          allocatedFineWeight: toDecimal(a.allocatedFineWeight.toString()),
        };
      },
      createRecoveryAllocation: async (alloc: RecoveryAllocationEntity) => {
        const a = await ptx.recoveryAllocation.create({
          data: {
            id: alloc.id,
            organizationId: alloc.organizationId,
            recoveryReceiptId: alloc.recoveryReceiptId,
            processLossRecordId: alloc.processLossRecordId,
            allocatedFineWeight: alloc.allocatedFineWeight.toFixed(6),
            status: alloc.status,
            businessDate: alloc.businessDate,
            notes: alloc.notes,
            idempotencyKey: alloc.idempotencyKey,
            createdById: alloc.createdById,
            undoneAt: alloc.undoneAt,
            undoneById: alloc.undoneById,
            undoReason: alloc.undoReason,
          },
        });
        return {
          ...a,
          allocatedFineWeight: toDecimal(a.allocatedFineWeight.toString()),
        };
      },
      updateRecoveryAllocation: async (alloc: RecoveryAllocationEntity) => {
        const a = await ptx.recoveryAllocation.update({
          where: { id: alloc.id },
          data: {
            status: alloc.status,
            undoneAt: alloc.undoneAt,
            undoneById: alloc.undoneById,
            undoReason: alloc.undoReason,
          },
        });
        return {
          ...a,
          allocatedFineWeight: toDecimal(a.allocatedFineWeight.toString()),
        };
      },

      listLossWriteOffs: async (organizationId, filter) => {
        const rows = await ptx.lossWriteOff.findMany({
          where: {
            organizationId,
            ...(filter?.processLossRecordId
              ? { processLossRecordId: filter.processLossRecordId }
              : {}),
            ...(filter?.karigarId ? { karigarId: filter.karigarId } : {}),
          },
          orderBy: { createdAt: "asc" },
        });
        return rows.map((w) => ({
          ...w,
          writtenOffFineWeight: toDecimal(w.writtenOffFineWeight.toString()),
        }));
      },
      getLossWriteOffByIdempotencyKey: async (idempotencyKey) => {
        const w = await ptx.lossWriteOff.findUnique({
          where: { idempotencyKey },
        });
        if (!w) return null;
        return {
          ...w,
          writtenOffFineWeight: toDecimal(w.writtenOffFineWeight.toString()),
        };
      },
      createLossWriteOff: async (writeOff: LossWriteOffEntity) => {
        const w = await ptx.lossWriteOff.create({
          data: {
            id: writeOff.id,
            organizationId: writeOff.organizationId,
            processLossRecordId: writeOff.processLossRecordId,
            karigarId: writeOff.karigarId,
            writtenOffFineWeight: writeOff.writtenOffFineWeight.toFixed(6),
            businessDate: writeOff.businessDate,
            reason: writeOff.reason,
            status: writeOff.status,
            idempotencyKey: writeOff.idempotencyKey,
            createdById: writeOff.createdById,
            reversedAt: writeOff.reversedAt,
            reversalReason: writeOff.reversalReason,
            recoverySettlementId: writeOff.recoverySettlementId ?? null,
          },
        });
        return {
          ...w,
          writtenOffFineWeight: toDecimal(w.writtenOffFineWeight.toString()),
        };
      },
      updateLossWriteOff: async (writeOff: LossWriteOffEntity) => {
        const w = await ptx.lossWriteOff.update({
          where: { id: writeOff.id },
          data: {
            status: writeOff.status,
            reversedAt: writeOff.reversedAt,
            reversalReason: writeOff.reversalReason,
            recoverySettlementId: writeOff.recoverySettlementId ?? null,
          },
        });
        return {
          ...w,
          writtenOffFineWeight: toDecimal(w.writtenOffFineWeight.toString()),
        };
      },

      listRecoverySettlements: async (organizationId, filter) => {
        const rows = await ptx.recoverySettlement.findMany({
          where: {
            organizationId,
            ...(filter?.karigarId ? { karigarId: filter.karigarId } : {}),
          },
          orderBy: { createdAt: "desc" },
        });
        return rows.map((st) => ({
          ...st,
          scopeType: st.scopeType as "SINGLE_TOUCH" | "ALL_TOUCHES",
          scopeTouchPercent: st.scopeTouchPercent
            ? toDecimal(st.scopeTouchPercent.toString())
            : null,
          grossSelectedFine: toDecimal(st.grossSelectedFine.toString()),
          makingDeductionFine: toDecimal(st.makingDeductionFine.toString()),
          makingInputWeight: toDecimal(st.makingInputWeight.toString()),
          makingInputUnit: st.makingInputUnit as "RAW_AT_TOUCH" | "FINE",
          netExpectedFine: toDecimal(st.netExpectedFine.toString()),
          receivedFine: toDecimal(st.receivedFine.toString()),
          differenceFine: toDecimal(st.differenceFine.toString()),
          shortageAction: st.shortageAction as
            | "CARRY_FORWARD"
            | "ACCEPT_AND_CLEAR"
            | "ACCEPT_PART"
            | "NONE"
            | "EXCESS"
            | null,
          acceptedShortageFine: toDecimal(st.acceptedShortageFine.toString()),
          carriedShortageFine: toDecimal(st.carriedShortageFine.toString()),
          excessFine: toDecimal(st.excessFine.toString()),
          status: st.status as "POSTED" | "REVERSED",
        }));
      },
      getRecoverySettlementById: async (organizationId, id) => {
        const st = await ptx.recoverySettlement.findFirst({
          where: { id, organizationId },
        });
        if (!st) return null;
        return {
          ...st,
          scopeType: st.scopeType as "SINGLE_TOUCH" | "ALL_TOUCHES",
          scopeTouchPercent: st.scopeTouchPercent
            ? toDecimal(st.scopeTouchPercent.toString())
            : null,
          grossSelectedFine: toDecimal(st.grossSelectedFine.toString()),
          makingDeductionFine: toDecimal(st.makingDeductionFine.toString()),
          makingInputWeight: toDecimal(st.makingInputWeight.toString()),
          makingInputUnit: st.makingInputUnit as "RAW_AT_TOUCH" | "FINE",
          netExpectedFine: toDecimal(st.netExpectedFine.toString()),
          receivedFine: toDecimal(st.receivedFine.toString()),
          differenceFine: toDecimal(st.differenceFine.toString()),
          shortageAction: st.shortageAction as
            | "CARRY_FORWARD"
            | "ACCEPT_AND_CLEAR"
            | "ACCEPT_PART"
            | "NONE"
            | "EXCESS"
            | null,
          acceptedShortageFine: toDecimal(st.acceptedShortageFine.toString()),
          carriedShortageFine: toDecimal(st.carriedShortageFine.toString()),
          excessFine: toDecimal(st.excessFine.toString()),
          status: st.status as "POSTED" | "REVERSED",
        };
      },
      getRecoverySettlementByIdempotencyKey: async (idempotencyKey) => {
        const st = await ptx.recoverySettlement.findUnique({
          where: { idempotencyKey },
        });
        if (!st) return null;
        return {
          ...st,
          scopeType: st.scopeType as "SINGLE_TOUCH" | "ALL_TOUCHES",
          scopeTouchPercent: st.scopeTouchPercent
            ? toDecimal(st.scopeTouchPercent.toString())
            : null,
          grossSelectedFine: toDecimal(st.grossSelectedFine.toString()),
          makingDeductionFine: toDecimal(st.makingDeductionFine.toString()),
          makingInputWeight: toDecimal(st.makingInputWeight.toString()),
          makingInputUnit: st.makingInputUnit as "RAW_AT_TOUCH" | "FINE",
          netExpectedFine: toDecimal(st.netExpectedFine.toString()),
          receivedFine: toDecimal(st.receivedFine.toString()),
          differenceFine: toDecimal(st.differenceFine.toString()),
          shortageAction: st.shortageAction as
            | "CARRY_FORWARD"
            | "ACCEPT_AND_CLEAR"
            | "ACCEPT_PART"
            | "NONE"
            | "EXCESS"
            | null,
          acceptedShortageFine: toDecimal(st.acceptedShortageFine.toString()),
          carriedShortageFine: toDecimal(st.carriedShortageFine.toString()),
          excessFine: toDecimal(st.excessFine.toString()),
          status: st.status as "POSTED" | "REVERSED",
        };
      },
      createRecoverySettlement: async (
        settlement: RecoverySettlementEntity
      ) => {
        const st = await ptx.recoverySettlement.create({
          data: {
            id: settlement.id,
            organizationId: settlement.organizationId,
            karigarId: settlement.karigarId,
            settlementNumber: settlement.settlementNumber,
            businessDate: settlement.businessDate,
            scopeType: settlement.scopeType,
            scopeTouchPercent: settlement.scopeTouchPercent
              ? settlement.scopeTouchPercent.toFixed(4)
              : null,
            scopeProcessType: settlement.scopeProcessType,
            grossSelectedFine: settlement.grossSelectedFine.toFixed(6),
            makingDeductionFine: settlement.makingDeductionFine.toFixed(6),
            makingInputWeight: settlement.makingInputWeight.toFixed(6),
            makingInputUnit: settlement.makingInputUnit,
            netExpectedFine: settlement.netExpectedFine.toFixed(6),
            receivedFine: settlement.receivedFine.toFixed(6),
            differenceFine: settlement.differenceFine.toFixed(6),
            shortageAction: settlement.shortageAction,
            acceptedShortageFine: settlement.acceptedShortageFine.toFixed(6),
            carriedShortageFine: settlement.carriedShortageFine.toFixed(6),
            excessFine: settlement.excessFine.toFixed(6),
            recoveryReceiptId: settlement.recoveryReceiptId,
            notes: settlement.notes,
            status: settlement.status,
            idempotencyKey: settlement.idempotencyKey,
            createdById: settlement.createdById,
            reversedAt: settlement.reversedAt,
            reversalReason: settlement.reversalReason,
          },
        });
        return {
          ...st,
          scopeType: st.scopeType as "SINGLE_TOUCH" | "ALL_TOUCHES",
          scopeTouchPercent: st.scopeTouchPercent
            ? toDecimal(st.scopeTouchPercent.toString())
            : null,
          grossSelectedFine: toDecimal(st.grossSelectedFine.toString()),
          makingDeductionFine: toDecimal(st.makingDeductionFine.toString()),
          makingInputWeight: toDecimal(st.makingInputWeight.toString()),
          makingInputUnit: st.makingInputUnit as "RAW_AT_TOUCH" | "FINE",
          netExpectedFine: toDecimal(st.netExpectedFine.toString()),
          receivedFine: toDecimal(st.receivedFine.toString()),
          differenceFine: toDecimal(st.differenceFine.toString()),
          shortageAction: st.shortageAction as
            | "CARRY_FORWARD"
            | "ACCEPT_AND_CLEAR"
            | "ACCEPT_PART"
            | "NONE"
            | "EXCESS"
            | null,
          acceptedShortageFine: toDecimal(st.acceptedShortageFine.toString()),
          carriedShortageFine: toDecimal(st.carriedShortageFine.toString()),
          excessFine: toDecimal(st.excessFine.toString()),
          status: st.status as "POSTED" | "REVERSED",
        };
      },
      updateRecoverySettlement: async (
        settlement: RecoverySettlementEntity
      ) => {
        const st = await ptx.recoverySettlement.update({
          where: { id: settlement.id },
          data: {
            status: settlement.status,
            reversedAt: settlement.reversedAt,
            reversalReason: settlement.reversalReason,
          },
        });
        return {
          ...st,
          scopeType: st.scopeType as "SINGLE_TOUCH" | "ALL_TOUCHES",
          scopeTouchPercent: st.scopeTouchPercent
            ? toDecimal(st.scopeTouchPercent.toString())
            : null,
          grossSelectedFine: toDecimal(st.grossSelectedFine.toString()),
          makingDeductionFine: toDecimal(st.makingDeductionFine.toString()),
          makingInputWeight: toDecimal(st.makingInputWeight.toString()),
          makingInputUnit: st.makingInputUnit as "RAW_AT_TOUCH" | "FINE",
          netExpectedFine: toDecimal(st.netExpectedFine.toString()),
          receivedFine: toDecimal(st.receivedFine.toString()),
          differenceFine: toDecimal(st.differenceFine.toString()),
          shortageAction: st.shortageAction as
            | "CARRY_FORWARD"
            | "ACCEPT_AND_CLEAR"
            | "ACCEPT_PART"
            | "NONE"
            | "EXCESS"
            | null,
          acceptedShortageFine: toDecimal(st.acceptedShortageFine.toString()),
          carriedShortageFine: toDecimal(st.carriedShortageFine.toString()),
          excessFine: toDecimal(st.excessFine.toString()),
          status: st.status as "POSTED" | "REVERSED",
        };
      },

      listMakingDeductionAllocations: async (organizationId, filter) => {
        const rows = await ptx.makingDeductionAllocation.findMany({
          where: {
            organizationId,
            ...(filter?.recoverySettlementId
              ? { recoverySettlementId: filter.recoverySettlementId }
              : {}),
            ...(filter?.processLossRecordId
              ? { processLossRecordId: filter.processLossRecordId }
              : {}),
            ...(filter?.karigarId ? { karigarId: filter.karigarId } : {}),
          },
          orderBy: { createdAt: "asc" },
        });
        return rows.map((d) => ({
          ...d,
          deductedFineWeight: toDecimal(d.deductedFineWeight.toString()),
          status: d.status as "ACTIVE" | "REVERSED",
        }));
      },
      createMakingDeductionAllocation: async (
        deduction: MakingDeductionAllocationEntity
      ) => {
        const d = await ptx.makingDeductionAllocation.create({
          data: {
            id: deduction.id,
            organizationId: deduction.organizationId,
            recoverySettlementId: deduction.recoverySettlementId,
            processLossRecordId: deduction.processLossRecordId,
            karigarId: deduction.karigarId,
            deductedFineWeight: deduction.deductedFineWeight.toFixed(6),
            businessDate: deduction.businessDate,
            reason: deduction.reason,
            status: deduction.status,
            idempotencyKey: deduction.idempotencyKey,
            createdById: deduction.createdById,
            reversedAt: deduction.reversedAt,
            reversalReason: deduction.reversalReason,
          },
        });
        return {
          ...d,
          deductedFineWeight: toDecimal(d.deductedFineWeight.toString()),
          status: d.status as "ACTIVE" | "REVERSED",
        };
      },
      updateMakingDeductionAllocation: async (
        deduction: MakingDeductionAllocationEntity
      ) => {
        const d = await ptx.makingDeductionAllocation.update({
          where: { id: deduction.id },
          data: {
            status: deduction.status,
            reversedAt: deduction.reversedAt,
            reversalReason: deduction.reversalReason,
          },
        });
        return {
          ...d,
          deductedFineWeight: toDecimal(d.deductedFineWeight.toString()),
          status: d.status as "ACTIVE" | "REVERSED",
        };
      },

      // Billing Sequence & Templates
      allocateNextBillNumber: async (organizationId, prefix = "INV") => {
        const seq = await ptx.billSequence.upsert({
          where: { organizationId },
          update: { nextNumber: { increment: 1 } },
          create: { organizationId, prefix, nextNumber: 2 },
        });
        const allocatedNum = seq.nextNumber - 1;
        return `${seq.prefix}-${String(allocatedNum).padStart(4, "0")}`;
      },
      listBillTemplates: async (organizationId) => {
        return ptx.billTemplate.findMany({
          where: { organizationId },
          orderBy: { createdAt: "asc" },
        });
      },
      getBillTemplateById: async (organizationId, id) => {
        return ptx.billTemplate.findFirst({ where: { id, organizationId } });
      },
      createBillTemplate: async (tpl: BillTemplateEntity) => {
        return ptx.billTemplate.create({
          data: {
            id: tpl.id,
            organizationId: tpl.organizationId,
            name: tpl.name,
            isDefault: tpl.isDefault,
            businessName: tpl.businessName,
            contactInfo: tpl.contactInfo,
            logoUrl: tpl.logoUrl,
            headerText: tpl.headerText,
            footerText: tpl.footerText,
            signatureUrl: tpl.signatureUrl,
            showPhotoColumn: tpl.showPhotoColumn,
            visibleColumnsJson: tpl.visibleColumnsJson,
            columnLabelsJson: tpl.columnLabelsJson,
            columnWidthsJson: tpl.columnWidthsJson,
            notesAndTerms: tpl.notesAndTerms,
            fontSizePx: tpl.fontSizePx,
            paperSize: tpl.paperSize,
            createdById: tpl.createdById,
          },
        });
      },
      updateBillTemplate: async (tpl: BillTemplateEntity) => {
        return ptx.billTemplate.update({
          where: { id: tpl.id },
          data: {
            name: tpl.name,
            isDefault: tpl.isDefault,
            businessName: tpl.businessName,
            contactInfo: tpl.contactInfo,
            logoUrl: tpl.logoUrl,
            headerText: tpl.headerText,
            footerText: tpl.footerText,
            signatureUrl: tpl.signatureUrl,
            showPhotoColumn: tpl.showPhotoColumn,
            visibleColumnsJson: tpl.visibleColumnsJson,
            columnLabelsJson: tpl.columnLabelsJson,
            columnWidthsJson: tpl.columnWidthsJson,
            notesAndTerms: tpl.notesAndTerms,
            fontSizePx: tpl.fontSizePx,
            paperSize: tpl.paperSize,
          },
        });
      },

      // Customer Bills & Lines
      listCustomerBills: async (organizationId, customerId) => {
        const rows = await ptx.customerBill.findMany({
          where: { organizationId, ...(customerId ? { customerId } : {}) },
          orderBy: { createdAt: "desc" },
        });
        return rows.map(mapCustomerBill);
      },
      getCustomerBillById: async (organizationId, id) => {
        const row = await ptx.customerBill.findFirst({
          where: { id, organizationId },
        });
        return row ? mapCustomerBill(row) : null;
      },
      getCustomerBillByIdempotencyKey: async (idempotencyKey) => {
        const row = await ptx.customerBill.findUnique({
          where: { idempotencyKey },
        });
        return row ? mapCustomerBill(row) : null;
      },
      createCustomerBill: async (bill: CustomerBillEntity) => {
        const row = await ptx.customerBill.create({
          data: {
            id: bill.id,
            organizationId: bill.organizationId,
            customerId: bill.customerId,
            billNumber: bill.billNumber,
            billDate: bill.billDate,
            billType: bill.billType,
            status: bill.status,
            deliveryStatus: bill.deliveryStatus,
            settlementStatus: bill.settlementStatus,
            totalFineGold: bill.totalFineGold.toFixed(6),
            totalCashRupees: bill.totalCashRupees.toFixed(2),
            deliveredFineMetal: bill.deliveredFineMetal.toFixed(6),
            commercialMakingFine: bill.commercialMakingFine.toFixed(6),
            historicalFineBalance: bill.historicalFineBalance.toFixed(6),
            historicalInrBalance: bill.historicalInrBalance.toFixed(2),
            previousAdvanceFineSnapshot: (
              bill.previousAdvanceFineSnapshot ?? ZERO
            ).toFixed(6),
            appliedAdvanceFineSnapshot: (
              bill.appliedAdvanceFineSnapshot ?? ZERO
            ).toFixed(6),
            newReceiptFineSnapshot: (
              bill.newReceiptFineSnapshot ?? ZERO
            ).toFixed(6),
            closingFineDueSnapshot: (
              bill.closingFineDueSnapshot ?? ZERO
            ).toFixed(6),
            remainingAdvanceFineSnapshot: (
              bill.remainingAdvanceFineSnapshot ?? ZERO
            ).toFixed(6),
            templateId: bill.templateId,
            templateSnapshotJson: bill.templateSnapshotJson,
            customerSnapshotJson: bill.customerSnapshotJson,
            previewHtml: bill.previewHtml,
            notes: bill.notes,
            idempotencyKey: bill.idempotencyKey,
            journalTransactionId: bill.journalTransactionId,
            postedAt: bill.postedAt,
            postedById: bill.postedById,
            cancelledAt: bill.cancelledAt,
            cancelledById: bill.cancelledById,
            cancellationReason: bill.cancellationReason,
            creditNoteNumber: bill.creditNoteNumber,
            createdById: bill.createdById,
          },
        });
        return mapCustomerBill(row);
      },
      updateCustomerBill: async (bill: CustomerBillEntity) => {
        const row = await ptx.customerBill.update({
          where: { id: bill.id },
          data: {
            billDate: bill.billDate,
            status: bill.status,
            deliveryStatus: bill.deliveryStatus,
            settlementStatus: bill.settlementStatus,
            totalFineGold: bill.totalFineGold.toFixed(6),
            totalCashRupees: bill.totalCashRupees.toFixed(2),
            deliveredFineMetal: bill.deliveredFineMetal.toFixed(6),
            commercialMakingFine: bill.commercialMakingFine.toFixed(6),
            historicalFineBalance: bill.historicalFineBalance.toFixed(6),
            historicalInrBalance: bill.historicalInrBalance.toFixed(2),
            previousAdvanceFineSnapshot: (
              bill.previousAdvanceFineSnapshot ?? ZERO
            ).toFixed(6),
            appliedAdvanceFineSnapshot: (
              bill.appliedAdvanceFineSnapshot ?? ZERO
            ).toFixed(6),
            newReceiptFineSnapshot: (
              bill.newReceiptFineSnapshot ?? ZERO
            ).toFixed(6),
            closingFineDueSnapshot: (
              bill.closingFineDueSnapshot ?? ZERO
            ).toFixed(6),
            remainingAdvanceFineSnapshot: (
              bill.remainingAdvanceFineSnapshot ?? ZERO
            ).toFixed(6),
            templateId: bill.templateId,
            templateSnapshotJson: bill.templateSnapshotJson,
            customerSnapshotJson: bill.customerSnapshotJson,
            previewHtml: bill.previewHtml,
            notes: bill.notes,
            idempotencyKey: bill.idempotencyKey,
            journalTransactionId: bill.journalTransactionId,
            postedAt: bill.postedAt,
            postedById: bill.postedById,
            cancelledAt: bill.cancelledAt,
            cancelledById: bill.cancelledById,
            cancellationReason: bill.cancellationReason,
            creditNoteNumber: bill.creditNoteNumber,
          },
        });
        return mapCustomerBill(row);
      },

      listCustomerBillLines: async (customerBillId) => {
        const rows = await ptx.customerBillLine.findMany({
          where: { customerBillId },
        });
        return rows.map(mapCustomerBillLine);
      },
      listAllCustomerBillLinesForOrg: async (organizationId) => {
        const rows = await ptx.customerBillLine.findMany({
          where: { customerBill: { organizationId } },
        });
        return rows.map(mapCustomerBillLine);
      },
      replaceCustomerBillLines: async (
        customerBillId,
        lines: CustomerBillLineEntity[]
      ) => {
        await ptx.customerBillLine.deleteMany({ where: { customerBillId } });
        if (lines.length === 0) return [];
        await ptx.customerBillLine.createMany({
          data: lines.map((l) => ({
            id: l.id,
            customerBillId: l.customerBillId,
            lineType: l.lineType,
            orderId: l.orderId,
            purityId: l.purityId,
            bagNumberSnapshot: l.bagNumberSnapshot,
            orderNameSnapshot: l.orderNameSnapshot,
            photoUrlSnapshot: l.photoUrlSnapshot,
            description: l.description,
            grossWeight: l.grossWeight.toFixed(6),
            stoneWeight: l.stoneWeight.toFixed(6),
            adKlWeight: l.adKlWeight.toFixed(6),
            netWeight: l.netWeight.toFixed(6),
            touchSnapshot: l.touchSnapshot.toFixed(4),
            chargeableWeight: l.chargeableWeight.toFixed(6),
            billingBasis: l.billingBasis,
            wastagePercent: l.wastagePercent.toFixed(4),
            makingPercentagePoints: l.makingPercentagePoints.toFixed(4),
            metalChargeFine: l.metalChargeFine.toFixed(6),
            makingChargeFine: l.makingChargeFine.toFixed(6),
            extraFineCharge: l.extraFineCharge.toFixed(6),
            fineDiscount: l.fineDiscount.toFixed(6),
            fineGold: l.fineGold.toFixed(6),
            makingCharges: l.makingCharges.toFixed(2),
            stoneChargeRupees: l.stoneChargeRupees.toFixed(2),
            rupeeDiscount: l.rupeeDiscount.toFixed(2),
            adjustmentReason: l.adjustmentReason,
          })),
        });
        return lines;
      },

      // Customer Gold Receipts & Lines
      listCustomerGoldReceipts: async (organizationId, customerId) => {
        const rows = await ptx.customerGoldReceipt.findMany({
          where: { organizationId, ...(customerId ? { customerId } : {}) },
          orderBy: { createdAt: "desc" },
        });
        return rows.map(mapCustomerGoldReceipt);
      },
      getCustomerGoldReceiptById: async (organizationId, id) => {
        const row = await ptx.customerGoldReceipt.findFirst({
          where: { id, organizationId },
        });
        return row ? mapCustomerGoldReceipt(row) : null;
      },
      getCustomerGoldReceiptByIdempotencyKey: async (idempotencyKey) => {
        const row = await ptx.customerGoldReceipt.findUnique({
          where: { idempotencyKey },
        });
        return row ? mapCustomerGoldReceipt(row) : null;
      },
      createCustomerGoldReceipt: async (r: CustomerGoldReceiptEntity) => {
        const row = await ptx.customerGoldReceipt.create({
          data: {
            id: r.id,
            organizationId: r.organizationId,
            customerId: r.customerId,
            receiptNumber: r.receiptNumber,
            businessDate: r.businessDate,
            totalGrossWeight: r.totalGrossWeight.toFixed(6),
            totalFineWeight: r.totalFineWeight.toFixed(6),
            unallocatedFineWeight: r.unallocatedFineWeight.toFixed(6),
            refundedFineWeight: (r.refundedFineWeight ?? ZERO).toFixed(6),
            inputModeSnapshot: r.inputModeSnapshot ?? "FINE_EQUIVALENT",
            physicalWeightProvided: r.physicalWeightProvided ?? true,
            status: r.status,
            referenceNumber: r.referenceNumber,
            notes: r.notes,
            idempotencyKey: r.idempotencyKey,
            journalTransactionId: r.journalTransactionId,
            createdById: r.createdById,
            reversedAt: r.reversedAt,
            reversedById: r.reversedById,
            reversalReason: r.reversalReason,
          },
        });
        return mapCustomerGoldReceipt(row);
      },
      updateCustomerGoldReceipt: async (r: CustomerGoldReceiptEntity) => {
        const row = await ptx.customerGoldReceipt.update({
          where: { id: r.id },
          data: {
            unallocatedFineWeight: r.unallocatedFineWeight.toFixed(6),
            refundedFineWeight: (r.refundedFineWeight ?? ZERO).toFixed(6),
            status: r.status,
            reversedAt: r.reversedAt,
            reversedById: r.reversedById,
            reversalReason: r.reversalReason,
          },
        });
        return mapCustomerGoldReceipt(row);
      },

      listCustomerGoldReceiptLines: async (organizationId, receiptId) => {
        const rows = await ptx.customerGoldReceiptLine.findMany({
          where: { organizationId, ...(receiptId ? { receiptId } : {}) },
        });
        return rows.map((l) => ({
          ...l,
          grossWeight: toDecimal(l.grossWeight.toString()),
          touchPercent: toDecimal(l.touchPercent.toString()),
          fineWeight: toDecimal(l.fineWeight.toString()),
        }));
      },
      createCustomerGoldReceiptLine: async (l: CustomerGoldReceiptLineEntity) => {
        const row = await ptx.customerGoldReceiptLine.create({
          data: {
            id: l.id,
            organizationId: l.organizationId,
            receiptId: l.receiptId,
            purityId: l.purityId,
            grossWeight: l.grossWeight.toFixed(6),
            touchPercent: l.touchPercent.toFixed(4),
            fineWeight: l.fineWeight.toFixed(6),
            journalTransactionId: l.journalTransactionId,
          },
        });
        return {
          ...row,
          grossWeight: toDecimal(row.grossWeight.toString()),
          touchPercent: toDecimal(row.touchPercent.toString()),
          fineWeight: toDecimal(row.fineWeight.toString()),
        };
      },

      // Customer Cash Receipts
      listCustomerCashReceipts: async (organizationId, customerId) => {
        const rows = await ptx.customerCashReceipt.findMany({
          where: { organizationId, ...(customerId ? { customerId } : {}) },
          orderBy: { createdAt: "desc" },
        });
        return rows.map(mapCustomerCashReceipt);
      },
      getCustomerCashReceiptById: async (organizationId, id) => {
        const row = await ptx.customerCashReceipt.findFirst({
          where: { id, organizationId },
        });
        return row ? mapCustomerCashReceipt(row) : null;
      },
      getCustomerCashReceiptByIdempotencyKey: async (idempotencyKey) => {
        const row = await ptx.customerCashReceipt.findUnique({
          where: { idempotencyKey },
        });
        return row ? mapCustomerCashReceipt(row) : null;
      },
      createCustomerCashReceipt: async (r: CustomerCashReceiptEntity) => {
        const row = await ptx.customerCashReceipt.create({
          data: {
            id: r.id,
            organizationId: r.organizationId,
            customerId: r.customerId,
            receiptNumber: r.receiptNumber,
            businessDate: r.businessDate,
            amountRupees: r.amountRupees.toFixed(2),
            unallocatedRupees: r.unallocatedRupees.toFixed(2),
            paymentMode: r.paymentMode,
            status: r.status,
            referenceNumber: r.referenceNumber,
            notes: r.notes,
            idempotencyKey: r.idempotencyKey,
            createdById: r.createdById,
            reversedAt: r.reversedAt,
            reversedById: r.reversedById,
            reversalReason: r.reversalReason,
          },
        });
        return mapCustomerCashReceipt(row);
      },
      updateCustomerCashReceipt: async (r: CustomerCashReceiptEntity) => {
        const row = await ptx.customerCashReceipt.update({
          where: { id: r.id },
          data: {
            unallocatedRupees: r.unallocatedRupees.toFixed(2),
            status: r.status,
            reversedAt: r.reversedAt,
            reversedById: r.reversedById,
            reversalReason: r.reversalReason,
          },
        });
        return mapCustomerCashReceipt(row);
      },

      // Customer Payment Allocations
      listCustomerPaymentAllocations: async (organizationId, filter) => {
        const rows = await ptx.customerPaymentAllocation.findMany({
          where: {
            organizationId,
            ...(filter?.customerId ? { customerId: filter.customerId } : {}),
            ...(filter?.billId ? { billId: filter.billId } : {}),
            ...(filter?.goldReceiptId
              ? { goldReceiptId: filter.goldReceiptId }
              : {}),
            ...(filter?.cashReceiptId
              ? { cashReceiptId: filter.cashReceiptId }
              : {}),
          },
          orderBy: { createdAt: "asc" },
        });
        return rows.map(mapCustomerPaymentAllocation);
      },
      getCustomerPaymentAllocationById: async (organizationId, id) => {
        const row = await ptx.customerPaymentAllocation.findFirst({
          where: { id, organizationId },
        });
        return row ? mapCustomerPaymentAllocation(row) : null;
      },
      getCustomerPaymentAllocationByIdempotencyKey: async (idempotencyKey) => {
        const row = await ptx.customerPaymentAllocation.findUnique({
          where: { idempotencyKey },
        });
        return row ? mapCustomerPaymentAllocation(row) : null;
      },
      createCustomerPaymentAllocation: async (
        a: CustomerPaymentAllocationEntity
      ) => {
        const row = await ptx.customerPaymentAllocation.create({
          data: {
            id: a.id,
            organizationId: a.organizationId,
            customerId: a.customerId,
            billId: a.billId,
            goldReceiptId: a.goldReceiptId,
            cashReceiptId: a.cashReceiptId,
            allocatedFineWeight: a.allocatedFineWeight.toFixed(6),
            allocatedRupees: a.allocatedRupees.toFixed(2),
            status: a.status,
            businessDate: a.businessDate,
            notes: a.notes,
            idempotencyKey: a.idempotencyKey,
            createdById: a.createdById,
            undoneAt: a.undoneAt,
            undoneById: a.undoneById,
            undoReason: a.undoReason,
          },
        });
        return mapCustomerPaymentAllocation(row);
      },
      updateCustomerPaymentAllocation: async (
        a: CustomerPaymentAllocationEntity
      ) => {
        const row = await ptx.customerPaymentAllocation.update({
          where: { id: a.id },
          data: {
            status: a.status,
            undoneAt: a.undoneAt,
            undoneById: a.undoneById,
            undoReason: a.undoReason,
          },
        });
        return mapCustomerPaymentAllocation(row);
      },

      listStockSales: async (organizationId) => {
        const rows = await ptx.stockSale.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
        });
        return rows.map((row) => ({
          ...row,
          physicalWeight: toDecimal(row.physicalWeight.toString()),
          touchPercentSnapshot: toDecimal(row.touchPercentSnapshot.toString()),
          fineEquivalentWeight: toDecimal(row.fineEquivalentWeight.toString()),
          pricePerGramRupees: toDecimal(row.pricePerGramRupees.toString()),
          totalAmountRupees: toDecimal(row.totalAmountRupees.toString()),
          paidAmountRupees: toDecimal(row.paidAmountRupees.toString()),
        }));
      },
      getStockSaleById: async (organizationId, id) => {
        const row = await ptx.stockSale.findFirst({
          where: { id, organizationId },
        });
        if (!row) return null;
        return {
          ...row,
          physicalWeight: toDecimal(row.physicalWeight.toString()),
          touchPercentSnapshot: toDecimal(row.touchPercentSnapshot.toString()),
          fineEquivalentWeight: toDecimal(row.fineEquivalentWeight.toString()),
          pricePerGramRupees: toDecimal(row.pricePerGramRupees.toString()),
          totalAmountRupees: toDecimal(row.totalAmountRupees.toString()),
          paidAmountRupees: toDecimal(row.paidAmountRupees.toString()),
        };
      },
      getStockSaleByIdempotencyKey: async (idempotencyKey) => {
        const row = await ptx.stockSale.findUnique({
          where: { idempotencyKey },
        });
        if (!row) return null;
        return {
          ...row,
          physicalWeight: toDecimal(row.physicalWeight.toString()),
          touchPercentSnapshot: toDecimal(row.touchPercentSnapshot.toString()),
          fineEquivalentWeight: toDecimal(row.fineEquivalentWeight.toString()),
          pricePerGramRupees: toDecimal(row.pricePerGramRupees.toString()),
          totalAmountRupees: toDecimal(row.totalAmountRupees.toString()),
          paidAmountRupees: toDecimal(row.paidAmountRupees.toString()),
        };
      },
      createStockSale: async (sale: StockSaleEntity) => {
        const row = await ptx.stockSale.create({
          data: {
            id: sale.id,
            organizationId: sale.organizationId,
            saleNumber: sale.saleNumber,
            businessDate: sale.businessDate,
            purityId: sale.purityId,
            physicalWeight: sale.physicalWeight.toFixed(6),
            touchPercentSnapshot: sale.touchPercentSnapshot.toFixed(4),
            fineEquivalentWeight: sale.fineEquivalentWeight.toFixed(6),
            buyerName: sale.buyerName,
            buyerPhone: sale.buyerPhone,
            pricePerGramRupees: sale.pricePerGramRupees.toFixed(2),
            totalAmountRupees: sale.totalAmountRupees.toFixed(2),
            paidAmountRupees: sale.paidAmountRupees.toFixed(2),
            paymentStatus: sale.paymentStatus,
            status: sale.status,
            referenceNumber: sale.referenceNumber,
            notes: sale.notes,
            journalTransactionId: sale.journalTransactionId,
            idempotencyKey: sale.idempotencyKey,
            createdById: sale.createdById,
          },
        });
        return {
          ...row,
          physicalWeight: toDecimal(row.physicalWeight.toString()),
          touchPercentSnapshot: toDecimal(row.touchPercentSnapshot.toString()),
          fineEquivalentWeight: toDecimal(row.fineEquivalentWeight.toString()),
          pricePerGramRupees: toDecimal(row.pricePerGramRupees.toString()),
          totalAmountRupees: toDecimal(row.totalAmountRupees.toString()),
          paidAmountRupees: toDecimal(row.paidAmountRupees.toString()),
        };
      },
      updateStockSale: async (sale: StockSaleEntity) => {
        const row = await ptx.stockSale.update({
          where: { id: sale.id },
          data: {
            paidAmountRupees: sale.paidAmountRupees.toFixed(2),
            paymentStatus: sale.paymentStatus,
            status: sale.status,
            reversedAt: sale.reversedAt,
            reversedById: sale.reversedById,
            reversalReason: sale.reversalReason,
          },
        });
        return {
          ...row,
          physicalWeight: toDecimal(row.physicalWeight.toString()),
          touchPercentSnapshot: toDecimal(row.touchPercentSnapshot.toString()),
          fineEquivalentWeight: toDecimal(row.fineEquivalentWeight.toString()),
          pricePerGramRupees: toDecimal(row.pricePerGramRupees.toString()),
          totalAmountRupees: toDecimal(row.totalAmountRupees.toString()),
          paidAmountRupees: toDecimal(row.paidAmountRupees.toString()),
        };
      },

      listStockConversions: async (organizationId) => {
        const rows = await ptx.stockConversion.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
        });
        return rows.map((row) => ({
          ...row,
          sourceWeight: toDecimal(row.sourceWeight.toString()),
          sourceTouchPercent: toDecimal(row.sourceTouchPercent.toString()),
          theoreticalFineWeight: toDecimal(row.theoreticalFineWeight.toString()),
          actualOutputWeight: toDecimal(row.actualOutputWeight.toString()),
          actualOutputTouch: toDecimal(row.actualOutputTouch.toString()),
          actualOutputFineWeight: toDecimal(row.actualOutputFineWeight.toString()),
          residueWeight: toDecimal(row.residueWeight.toString()),
          returnedMetalWeight: toDecimal(row.returnedMetalWeight.toString()),
          lossFineWeight: toDecimal(row.lossFineWeight.toString()),
        }));
      },
      getStockConversionByIdempotencyKey: async (idempotencyKey) => {
        const row = await ptx.stockConversion.findUnique({
          where: { idempotencyKey },
        });
        if (!row) return null;
        return {
          ...row,
          sourceWeight: toDecimal(row.sourceWeight.toString()),
          sourceTouchPercent: toDecimal(row.sourceTouchPercent.toString()),
          theoreticalFineWeight: toDecimal(row.theoreticalFineWeight.toString()),
          actualOutputWeight: toDecimal(row.actualOutputWeight.toString()),
          actualOutputTouch: toDecimal(row.actualOutputTouch.toString()),
          actualOutputFineWeight: toDecimal(row.actualOutputFineWeight.toString()),
          residueWeight: toDecimal(row.residueWeight.toString()),
          returnedMetalWeight: toDecimal(row.returnedMetalWeight.toString()),
          lossFineWeight: toDecimal(row.lossFineWeight.toString()),
        };
      },
      createStockConversion: async (conv: StockConversionEntity) => {
        const row = await ptx.stockConversion.create({
          data: {
            id: conv.id,
            organizationId: conv.organizationId,
            conversionNumber: conv.conversionNumber,
            conversionType: conv.conversionType,
            businessDate: conv.businessDate,
            sourcePurityId: conv.sourcePurityId,
            sourceWeight: conv.sourceWeight.toFixed(6),
            sourceTouchPercent: conv.sourceTouchPercent.toFixed(4),
            theoreticalFineWeight: conv.theoreticalFineWeight.toFixed(6),
            targetPurityId: conv.targetPurityId,
            actualOutputWeight: conv.actualOutputWeight.toFixed(6),
            actualOutputTouch: conv.actualOutputTouch.toFixed(4),
            actualOutputFineWeight: conv.actualOutputFineWeight.toFixed(6),
            residueWeight: conv.residueWeight.toFixed(6),
            returnedMetalWeight: conv.returnedMetalWeight.toFixed(6),
            lossFineWeight: conv.lossFineWeight.toFixed(6),
            lossTreatment: conv.lossTreatment,
            refinerOrPartner: conv.refinerOrPartner,
            notes: conv.notes,
            journalTransactionId: conv.journalTransactionId,
            idempotencyKey: conv.idempotencyKey,
            createdById: conv.createdById,
          },
        });
        return {
          ...row,
          sourceWeight: toDecimal(row.sourceWeight.toString()),
          sourceTouchPercent: toDecimal(row.sourceTouchPercent.toString()),
          theoreticalFineWeight: toDecimal(row.theoreticalFineWeight.toString()),
          actualOutputWeight: toDecimal(row.actualOutputWeight.toString()),
          actualOutputTouch: toDecimal(row.actualOutputTouch.toString()),
          actualOutputFineWeight: toDecimal(row.actualOutputFineWeight.toString()),
          residueWeight: toDecimal(row.residueWeight.toString()),
          returnedMetalWeight: toDecimal(row.returnedMetalWeight.toString()),
          lossFineWeight: toDecimal(row.lossFineWeight.toString()),
        };
      },

      listBillShareTokens: async (organizationId, billId) => {
        return ptx.billShareToken.findMany({
          where: {
            organizationId,
            ...(billId ? { billId } : {}),
          },
          orderBy: { createdAt: "desc" },
        });
      },
      getBillShareTokenByToken: async (token) => {
        return ptx.billShareToken.findUnique({ where: { token } });
      },
      createBillShareToken: async (t: BillShareTokenEntity) => {
        return ptx.billShareToken.create({
          data: {
            id: t.id,
            organizationId: t.organizationId,
            billId: t.billId,
            token: t.token,
            isRevoked: t.isRevoked,
            expiresAt: t.expiresAt,
            createdByUserId: t.createdByUserId,
          },
        });
      },
      updateBillShareToken: async (t: BillShareTokenEntity) => {
        return ptx.billShareToken.update({
          where: { id: t.id },
          data: {
            isRevoked: t.isRevoked,
            revokedAt: t.revokedAt,
          },
        });
      },

      getOrganizationCustomerFineConfig: async (organizationId) => {
        const org = await ptx.organization.findUnique({
          where: { id: organizationId },
        });
        if (!org) {
          return {
            organizationId,
            customerFineReceiptMode: "UNCONFIGURED",
            customerFineConfiguredTouch: null,
            customerFineAccountPurityId: null,
          };
        }
        return {
          organizationId: org.id,
          customerFineReceiptMode: (org.customerFineReceiptMode ||
            "UNCONFIGURED") as CustomerFineReceiptMode,
          customerFineConfiguredTouch: org.customerFineConfiguredTouch
            ? toDecimal(org.customerFineConfiguredTouch.toString())
            : null,
          customerFineAccountPurityId: org.customerFineAccountPurityId ?? null,
        };
      },

      updateOrganizationCustomerFineConfig: async (
        config: OrganizationCustomerFineConfigEntity
      ) => {
        const org = await ptx.organization.update({
          where: { id: config.organizationId },
          data: {
            customerFineReceiptMode: config.customerFineReceiptMode,
            customerFineConfiguredTouch: config.customerFineConfiguredTouch
              ? config.customerFineConfiguredTouch.toFixed(4)
              : null,
            customerFineAccountPurityId: config.customerFineAccountPurityId,
          },
        });
        return {
          organizationId: org.id,
          customerFineReceiptMode:
            org.customerFineReceiptMode as CustomerFineReceiptMode,
          customerFineConfiguredTouch: org.customerFineConfiguredTouch
            ? toDecimal(org.customerFineConfiguredTouch.toString())
            : null,
          customerFineAccountPurityId: org.customerFineAccountPurityId ?? null,
        };
      },

      lockCustomerForUpdate: async (organizationId, customerId) => {
        await ptx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      },
    };
  }
}

function mapCustomerBill(row: {
  id: string;
  organizationId: string;
  customerId: string;
  billNumber: string;
  billDate: Date;
  billType: CustomerBillEntity["billType"];
  status: CustomerBillEntity["status"];
  deliveryStatus: CustomerBillEntity["deliveryStatus"];
  settlementStatus: CustomerBillEntity["settlementStatus"];
  totalFineGold: Prisma.Decimal;
  totalCashRupees: Prisma.Decimal;
  deliveredFineMetal: Prisma.Decimal;
  commercialMakingFine: Prisma.Decimal;
  historicalFineBalance: Prisma.Decimal;
  historicalInrBalance: Prisma.Decimal;
  previousAdvanceFineSnapshot?: Prisma.Decimal;
  appliedAdvanceFineSnapshot?: Prisma.Decimal;
  newReceiptFineSnapshot?: Prisma.Decimal;
  closingFineDueSnapshot?: Prisma.Decimal;
  remainingAdvanceFineSnapshot?: Prisma.Decimal;
  templateId: string | null;
  templateSnapshotJson: string | null;
  customerSnapshotJson: string | null;
  previewHtml: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  journalTransactionId: string | null;
  postedAt: Date | null;
  postedById: string | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  creditNoteNumber: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CustomerBillEntity {
  return {
    ...row,
    totalFineGold: toDecimal(row.totalFineGold.toString()),
    totalCashRupees: toDecimal(row.totalCashRupees.toString()),
    deliveredFineMetal: toDecimal(row.deliveredFineMetal.toString()),
    commercialMakingFine: toDecimal(row.commercialMakingFine.toString()),
    historicalFineBalance: toDecimal(row.historicalFineBalance.toString()),
    historicalInrBalance: toDecimal(row.historicalInrBalance.toString()),
    previousAdvanceFineSnapshot: row.previousAdvanceFineSnapshot
      ? toDecimal(row.previousAdvanceFineSnapshot.toString())
      : ZERO,
    appliedAdvanceFineSnapshot: row.appliedAdvanceFineSnapshot
      ? toDecimal(row.appliedAdvanceFineSnapshot.toString())
      : ZERO,
    newReceiptFineSnapshot: row.newReceiptFineSnapshot
      ? toDecimal(row.newReceiptFineSnapshot.toString())
      : ZERO,
    closingFineDueSnapshot: row.closingFineDueSnapshot
      ? toDecimal(row.closingFineDueSnapshot.toString())
      : ZERO,
    remainingAdvanceFineSnapshot: row.remainingAdvanceFineSnapshot
      ? toDecimal(row.remainingAdvanceFineSnapshot.toString())
      : ZERO,
  };
}

function mapCustomerBillLine(row: {
  id: string;
  customerBillId: string;
  lineType: CustomerBillLineEntity["lineType"];
  orderId: string | null;
  purityId: string | null;
  bagNumberSnapshot: string | null;
  orderNameSnapshot: string | null;
  photoUrlSnapshot: string | null;
  description: string;
  grossWeight: Prisma.Decimal;
  stoneWeight: Prisma.Decimal;
  adKlWeight: Prisma.Decimal;
  netWeight: Prisma.Decimal;
  touchSnapshot: Prisma.Decimal;
  chargeableWeight: Prisma.Decimal;
  billingBasis: CustomerBillLineEntity["billingBasis"];
  wastagePercent: Prisma.Decimal;
  makingPercentagePoints: Prisma.Decimal;
  metalChargeFine: Prisma.Decimal;
  makingChargeFine: Prisma.Decimal;
  extraFineCharge: Prisma.Decimal;
  fineDiscount: Prisma.Decimal;
  fineGold: Prisma.Decimal;
  makingCharges: Prisma.Decimal;
  stoneChargeRupees: Prisma.Decimal;
  rupeeDiscount: Prisma.Decimal;
  adjustmentReason: string | null;
}): CustomerBillLineEntity {
  return {
    ...row,
    grossWeight: toDecimal(row.grossWeight.toString()),
    stoneWeight: toDecimal(row.stoneWeight.toString()),
    adKlWeight: toDecimal(row.adKlWeight.toString()),
    netWeight: toDecimal(row.netWeight.toString()),
    touchSnapshot: toDecimal(row.touchSnapshot.toString()),
    chargeableWeight: toDecimal(row.chargeableWeight.toString()),
    wastagePercent: toDecimal(row.wastagePercent.toString()),
    makingPercentagePoints: toDecimal(row.makingPercentagePoints.toString()),
    metalChargeFine: toDecimal(row.metalChargeFine.toString()),
    makingChargeFine: toDecimal(row.makingChargeFine.toString()),
    extraFineCharge: toDecimal(row.extraFineCharge.toString()),
    fineDiscount: toDecimal(row.fineDiscount.toString()),
    fineGold: toDecimal(row.fineGold.toString()),
    makingCharges: toDecimal(row.makingCharges.toString()),
    stoneChargeRupees: toDecimal(row.stoneChargeRupees.toString()),
    rupeeDiscount: toDecimal(row.rupeeDiscount.toString()),
  };
}

function mapCustomerGoldReceipt(row: {
  id: string;
  organizationId: string;
  customerId: string;
  receiptNumber: string;
  businessDate: Date;
  totalGrossWeight: Prisma.Decimal;
  totalFineWeight: Prisma.Decimal;
  unallocatedFineWeight: Prisma.Decimal;
  refundedFineWeight?: Prisma.Decimal;
  inputModeSnapshot?: string;
  physicalWeightProvided?: boolean;
  status: CustomerGoldReceiptEntity["status"];
  referenceNumber: string | null;
  notes: string | null;
  idempotencyKey: string;
  journalTransactionId: string | null;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
}): CustomerGoldReceiptEntity {
  return {
    ...row,
    totalGrossWeight: toDecimal(row.totalGrossWeight.toString()),
    totalFineWeight: toDecimal(row.totalFineWeight.toString()),
    unallocatedFineWeight: toDecimal(row.unallocatedFineWeight.toString()),
    refundedFineWeight: row.refundedFineWeight
      ? toDecimal(row.refundedFineWeight.toString())
      : ZERO,
    inputModeSnapshot: (row.inputModeSnapshot || "FINE_EQUIVALENT") as
      | "FINE_EQUIVALENT"
      | "PHYSICAL_AT_CONFIGURED_TOUCH"
      | "LEGACY_LINE",
    physicalWeightProvided: row.physicalWeightProvided ?? true,
  };
}

function mapCustomerCashReceipt(row: {
  id: string;
  organizationId: string;
  customerId: string;
  receiptNumber: string;
  businessDate: Date;
  amountRupees: Prisma.Decimal;
  unallocatedRupees: Prisma.Decimal;
  paymentMode: string;
  status: CustomerCashReceiptEntity["status"];
  referenceNumber: string | null;
  notes: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
}): CustomerCashReceiptEntity {
  return {
    ...row,
    amountRupees: toDecimal(row.amountRupees.toString()),
    unallocatedRupees: toDecimal(row.unallocatedRupees.toString()),
  };
}

function mapCustomerPaymentAllocation(row: {
  id: string;
  organizationId: string;
  customerId: string;
  billId: string;
  goldReceiptId: string | null;
  cashReceiptId: string | null;
  allocatedFineWeight: Prisma.Decimal;
  allocatedRupees: Prisma.Decimal;
  status: CustomerPaymentAllocationEntity["status"];
  businessDate: Date;
  notes: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  undoneAt: Date | null;
  undoneById: string | null;
  undoReason: string | null;
}): CustomerPaymentAllocationEntity {
  return {
    ...row,
    allocatedFineWeight: toDecimal(row.allocatedFineWeight.toString()),
    allocatedRupees: toDecimal(row.allocatedRupees.toString()),
  };
}

