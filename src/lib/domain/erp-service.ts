import crypto from "crypto";
import {
  Decimal,
  DecimalInput,
  ZERO,
  calculateFineEquivalent,
  roundInternal,
  roundTouch,
  toDecimal,
} from "../decimal";
import { getKolkataMonthKey, parseBusinessDate } from "../date-and-export";
import {
  computeOrderLineAmounts,
  getDefaultTemplateConfig,
  ParsedBillTemplate,
  parseTemplateEntity,
  renderBillSnapshotHtml,
  roundRupees,
} from "./billing-helpers";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
import { ErpRepository, ErpTransactionContext } from "./repository";
import {
  ActorContext,
  BillingBasis,
  BillLineType,
  BillSettlementStatus,
  BillShareTokenEntity,
  BillTemplateEntity,
  BillType,
  CANONICAL_PROCESS_SEQUENCE,
  CustomerBillEntity,
  CustomerBillLineEntity,
  CustomerCashReceiptEntity,
  CustomerEntity,
  CustomerFineReceiptMode,
  CustomerGoldReceiptEntity,
  CustomerGoldReceiptLineEntity,
  CustomerPaymentAllocationEntity,
  JournalLineDirection,
  JournalLineEntity,
  JournalTransactionEntity,
  JournalTransactionType,
  KarigarEntity,
  LossWriteOffEntity,
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
  RecoverySettlementEntity,
  StockAccountEntity,
  StockAccountType,
  StockConversionEntity,
  StockSaleEntity,
  StoneComponentEntryEntity,
  StoneComponentInput,
  UserRole,
} from "./types";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export interface CreatePurityInput {
  code: string;
  displayLabel: string;
  karatLabel: string;
  touchPercent: DecimalInput;
  isFineCategory?: boolean;
  sortOrder?: number;
}

export interface PostOpeningBalanceInput {
  purityId: string;
  physicalWeight: DecimalInput;
  businessDate?: string | Date;
  reason?: string;
  idempotencyKey: string;
}

export interface PostStockReceiptInput {
  purityId: string;
  physicalWeight: DecimalInput;
  sourceReference: string;
  reason?: string;
  businessDate?: string | Date;
  idempotencyKey: string;
}

export interface ReverseStockReceiptInput {
  transactionId: string;
  reason: string;
  businessDate?: string | Date;
  idempotencyKey: string;
}

export interface CreateCustomerInput {
  customerCode?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  gstNumber?: string;
  notes?: string;
}

export interface CreateKarigarInput {
  karigarCode?: string;
  name: string;
  phone?: string;
  specializationNotes?: string;
  capabilities: ProcessType[];
}

export interface CreateOrderInput {
  bagNumber: string;
  customerId: string;
  orderName: string;
  photoUrl?: string | null;
  purityId: string;
  targetWeight?: DecimalInput | null;
  size?: string | null;
  orderDate?: string | Date;
  dueDate?: string | Date | null;
  notes?: string | null;
  adDetailsJson?: string | null;
  selectedProcesses: ProcessType[];
}

export interface IssueMetalToOrderInput {
  orderId: string;
  karigarId: string;
  metalWeight: DecimalInput;
  businessDate?: string | Date;
  notes?: string;
  idempotencyKey: string;
}

export interface PostProcessEntryInput {
  orderId: string;
  processType: ProcessType;
  karigarId: string;
  nextKarigarId?: string;
  nextProcessType?: ProcessType | "COMPLETE";
  adjustAgainstKarigarBalance?: boolean;
  isRepairing?: boolean;
  settleNoksiImmediately?: boolean;
  grossInWeight: DecimalInput;
  nonGoldInWeight?: DecimalInput;
  grossOutWeight: DecimalInput;
  nonGoldOutWeight?: DecimalInput;
  extraMetalReturnedWeight?: DecimalInput;
  extraMetalTouchPercent?: DecimalInput;
  extraMetalPurityId?: string;
  custodyRetainedMetalWeight?: DecimalInput;
  stoneComponents?: StoneComponentInput[];
  closeProcess?: boolean;
  businessDate?: string | Date;
  notes?: string;
  idempotencyKey: string;
}

export interface AddFilingGoldIssueInput {
  orderId: string;
  additionalWeight: DecimalInput;
  karigarId?: string;
  businessDate?: string | Date;
  notes?: string;
  idempotencyKey: string;
}

export interface CompleteOrderInput {
  orderId: string;
  finishedGrossWeight?: DecimalInput;
  finishedStoneWeight?: DecimalInput;
  businessDate?: string | Date;
  notes?: string;
  idempotencyKey: string;
}

export interface CancelOrderInput {
  orderId: string;
  reason: string;
}

export interface PurityStockRow {
  purityId: string;
  code: string;
  displayLabel: string;
  karatLabel: string;
  touchPercent: string;
  isFineCategory: boolean;
  adminPhysicalWeight: string;
  adminFineEquivalent: string;
  finishedGoodsPhysicalWeight: string;
  finishedGoodsFineEquivalent: string;
  journalDerivedPhysicalWeight: string;
  journalDerivedFineEquivalent: string;
  isReconciled: boolean;
}

export interface DailyReconciliationReport {
  organizationId: string;
  asOfTimestamp: string;
  byPurity: PurityStockRow[];
  totals: {
    totalStockInflowFine: string;
    adminAvailableFine: string;
    karigarCustodyFine: string;
    finishedGoodsFine: string;
    processLossPendingFine: string;
    processLossEligibleFine: string;
    totalProcessLossFine: string;
    totalAccountedFine: string;
    discrepancyFine: string;
    isBalanced: boolean;
  };
  karigarCustodyBreakdown: Array<{
    karigarId: string;
    karigarCode: string;
    karigarName: string;
    custodyPhysicalWeight: string;
    custodyFineWeight: string;
    pendingLossRawWeight: string;
    pendingLossFineWeight: string;
    eligibleLossRawWeight: string;
    eligibleLossFineWeight: string;
  }>;
}

export class ErpDomainService {
  constructor(private readonly repo: ErpRepository) {}

  private assertAuthenticated(actor: ActorContext | null | undefined): ActorContext {
    if (!actor || !actor.userId || !actor.organizationId || !actor.role) {
      throw new UnauthorizedError("Valid authenticated session is required");
    }
    return actor;
  }

  private assertRole(
    actor: ActorContext | null | undefined,
    allowedRoles: UserRole[]
  ): ActorContext {
    const valid = this.assertAuthenticated(actor);
    if (!allowedRoles.includes(valid.role)) {
      throw new ForbiddenError(
        `Role ${valid.role} is not permitted to perform this operation`
      );
    }
    return valid;
  }

  private async ensureSystemAccount(
    tx: ErpTransactionContext,
    organizationId: string,
    accountCode: string,
    name: string,
    accountType: StockAccountType,
    purityId: string | null = null,
    karigarId: string | null = null
  ): Promise<StockAccountEntity> {
    const existing = await tx.getStockAccountByCode(organizationId, accountCode);
    if (existing) return existing;
    const now = new Date();
    return tx.createStockAccount({
      id: newId("acct"),
      organizationId,
      accountCode,
      name,
      accountType,
      purityId,
      karigarId,
      cachedPhysicalBalance: ZERO,
      cachedFineBalance: ZERO,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async postBalancedJournalEntry(
    tx: ErpTransactionContext,
    params: {
      organizationId: string;
      actorId: string;
      transactionType: JournalTransactionType;
      businessDate: Date;
      purity: PurityEntity;
      physicalWeight: Decimal;
      fineEquivalentWeight: Decimal;
      sourceAccount: StockAccountEntity;
      destinationAccount: StockAccountEntity;
      sourceReference?: string | null;
      reason: string;
      orderId?: string | null;
      orderProcessId?: string | null;
      processVisitId?: string | null;
      karigarId?: string | null;
      idempotencyKey: string;
      reversalOfTransactionId?: string | null;
    }
  ): Promise<JournalTransactionEntity> {
    const existing = await tx.getJournalTransactionByIdempotencyKey(
      params.idempotencyKey
    );
    if (existing) {
      return existing;
    }

    const weight = roundInternal(params.physicalWeight);
    const fine = roundInternal(params.fineEquivalentWeight);
    const touch = roundTouch(params.purity.touchPercent);
    const now = new Date();
    const txId = newId("jtx");
    const txNumber = `JNL-${now.getTime().toString().slice(-6)}-${txId.slice(-4).toUpperCase()}`;

    const journalTx = await tx.createJournalTransaction({
      id: txId,
      organizationId: params.organizationId,
      transactionNumber: txNumber,
      transactionType: params.transactionType,
      businessDate: params.businessDate,
      purityId: params.purity.id,
      touchSnapshot: touch,
      physicalWeight: weight,
      fineEquivalentWeight: fine,
      sourceReference: params.sourceReference ?? null,
      reason: params.reason,
      orderId: params.orderId ?? null,
      orderProcessId: params.orderProcessId ?? null,
      processVisitId: params.processVisitId ?? null,
      karigarId: params.karigarId ?? null,
      idempotencyKey: params.idempotencyKey,
      reversalOfTransactionId: params.reversalOfTransactionId ?? null,
      isReversed: false,
      actorId: params.actorId,
      createdAt: now,
    });

    // Credit source account (-weight, -fine)
    await tx.createJournalLine({
      id: newId("jln"),
      organizationId: params.organizationId,
      journalTransactionId: journalTx.id,
      accountId: params.sourceAccount.id,
      direction: "CREDIT_OUT" as JournalLineDirection,
      signedPhysicalDelta: weight.negated(),
      touchSnapshot: touch,
      signedFineDelta: fine.negated(),
      orderId: params.orderId ?? null,
      orderProcessId: params.orderProcessId ?? null,
      karigarId: params.karigarId ?? null,
      description: `${params.reason} (OUT from ${params.sourceAccount.accountCode})`,
      createdAt: now,
    });

    // Debit destination account (+weight, +fine)
    await tx.createJournalLine({
      id: newId("jln"),
      organizationId: params.organizationId,
      journalTransactionId: journalTx.id,
      accountId: params.destinationAccount.id,
      direction: "DEBIT_IN" as JournalLineDirection,
      signedPhysicalDelta: weight,
      touchSnapshot: touch,
      signedFineDelta: fine,
      orderId: params.orderId ?? null,
      orderProcessId: params.orderProcessId ?? null,
      karigarId: params.karigarId ?? null,
      description: `${params.reason} (IN to ${params.destinationAccount.accountCode})`,
      createdAt: now,
    });

    const freshSource = await tx.getStockAccountById(
      params.organizationId,
      params.sourceAccount.id
    );
    if (freshSource) {
      await tx.updateStockAccountBalances(
        freshSource.id,
        roundInternal(freshSource.cachedPhysicalBalance.sub(weight)),
        roundInternal(freshSource.cachedFineBalance.sub(fine))
      );
    }

    const freshDest = await tx.getStockAccountById(
      params.organizationId,
      params.destinationAccount.id
    );
    if (freshDest) {
      await tx.updateStockAccountBalances(
        freshDest.id,
        roundInternal(freshDest.cachedPhysicalBalance.add(weight)),
        roundInternal(freshDest.cachedFineBalance.add(fine))
      );
    }

    return journalTx;
  }

  // ==========================================================================
  // 1. PURITY CONFIGURATION
  // ==========================================================================

  public async configurePurity(
    actor: ActorContext,
    input: CreatePurityInput
  ): Promise<PurityEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const touch = roundTouch(input.touchPercent);
    if (touch.lte(ZERO) || touch.gt(new Decimal(100))) {
      throw new ValidationError(
        `Invalid touch percentage ${touch.toString()}%: must be between 0 and 100`
      );
    }
    const code = input.code.trim().toUpperCase();
    const displayLabel = input.displayLabel.trim();
    const karatLabel = input.karatLabel.trim();
    if (!code || !displayLabel) {
      throw new ValidationError("Purity code and displayLabel are required");
    }

    return this.repo.runInTransaction(async (tx) => {
      const duplicate = await tx.getPurityByCodeOrLabel(
        validActor.organizationId,
        code,
        displayLabel
      );
      if (duplicate) {
        throw new ConflictError(
          `Purity with code '${code}' or label '${displayLabel}' already exists`
        );
      }

      const now = new Date();
      const purity = await tx.createPurity({
        id: newId("pur"),
        organizationId: validActor.organizationId,
        code,
        displayLabel,
        karatLabel,
        touchPercent: touch,
        isFineCategory: Boolean(input.isFineCategory),
        isActive: true,
        sortOrder: input.sortOrder ?? 10,
        createdAt: now,
        updatedAt: now,
      });

      await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );

      await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `FINISHED_GOODS_${purity.code}`,
        `Finished Goods - ${purity.displayLabel}`,
        "FINISHED_GOODS",
        purity.id,
        null
      );

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "PurityDefinition",
        entityId: purity.id,
        action: "PURITY_CREATED",
        summary: `Configured purity ${purity.displayLabel} at touch ${purity.touchPercent.toFixed(4)}%`,
        metadataJson: JSON.stringify({ code, displayLabel, touch: touch.toFixed(4) }),
        createdAt: now,
      });

      return purity;
    });
  }

  public async listPurities(actor: ActorContext): Promise<PurityEntity[]> {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction((tx) =>
      tx.listPurities(validActor.organizationId)
    );
  }

  // ==========================================================================
  // 2. STOCK MODULE (OPENING BALANCES, RECEIPTS, CONTROLLED REVERSAL)
  // ==========================================================================

  public async postOpeningBalance(
    actor: ActorContext,
    input: PostOpeningBalanceInput
  ): Promise<JournalTransactionEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const weight = roundInternal(input.physicalWeight);
    if (weight.lte(ZERO)) {
      throw new ValidationError("Opening balance weight must be greater than zero");
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getJournalTransactionByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return existing;

      const purity = await tx.getPurityById(
        validActor.organizationId,
        input.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${input.purityId} not found`);
      }

      const fine = calculateFineEquivalent(weight, purity.touchPercent);
      const openingEquityAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `OPENING_EQUITY_${purity.code}`,
        `Opening Balance Equity - ${purity.displayLabel}`,
        "OPENING_EQUITY",
        purity.id,
        null
      );
      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );

      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "OPENING_BALANCE",
        businessDate,
        purity,
        physicalWeight: weight,
        fineEquivalentWeight: fine,
        sourceAccount: openingEquityAcct,
        destinationAccount: adminPoolAcct,
        sourceReference: "OPENING-BALANCE",
        reason: input.reason?.trim() || `Opening stock balance for ${purity.displayLabel}`,
        idempotencyKey: input.idempotencyKey,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "JournalTransaction",
        entityId: jtx.id,
        action: "OPENING_BALANCE_POSTED",
        summary: `Posted opening stock ${weight.toFixed(3)}g (${fine.toFixed(3)}g fine) of ${purity.displayLabel}`,
        metadataJson: null,
        createdAt: new Date(),
      });

      return jtx;
    });
  }

  public async postStockReceipt(
    actor: ActorContext,
    input: PostStockReceiptInput
  ): Promise<JournalTransactionEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const weight = roundInternal(input.physicalWeight);
    if (weight.lte(ZERO)) {
      throw new ValidationError("Stock receipt weight must be greater than zero");
    }
    const sourceRef = input.sourceReference?.trim();
    if (!sourceRef) {
      throw new ValidationError("Source / supplier reference is required for stock receipt");
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getJournalTransactionByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return existing;

      const purity = await tx.getPurityById(
        validActor.organizationId,
        input.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${input.purityId} not found`);
      }

      // Rule 6: Receiving metal increases its actual physical category ONLY.
      // Fine-equivalent calculation NEVER creates fine-bar stock.
      const fine = calculateFineEquivalent(weight, purity.touchPercent);
      const supplierInflowAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `EXTERNAL_INFLOW_${purity.code}`,
        `External Supplier Inflow - ${purity.displayLabel}`,
        "EXTERNAL_SUPPLIER_INFLOW",
        purity.id,
        null
      );
      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );

      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "STOCK_RECEIPT",
        businessDate,
        purity,
        physicalWeight: weight,
        fineEquivalentWeight: fine,
        sourceAccount: supplierInflowAcct,
        destinationAccount: adminPoolAcct,
        sourceReference: sourceRef,
        reason: input.reason?.trim() || `Stock receipt from ${sourceRef}`,
        idempotencyKey: input.idempotencyKey,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "JournalTransaction",
        entityId: jtx.id,
        action: "STOCK_RECEIPT_POSTED",
        summary: `Received ${weight.toFixed(3)}g (${fine.toFixed(3)}g fine) of ${purity.displayLabel} from ${sourceRef}`,
        metadataJson: null,
        createdAt: new Date(),
      });

      return jtx;
    });
  }

  public async reverseUnusedStockReceipt(
    actor: ActorContext,
    input: ReverseStockReceiptInput
  ): Promise<JournalTransactionEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("A clear reason is required to reverse a stock receipt");
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getJournalTransactionByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return existing;

      const orig = await tx.getJournalTransactionById(
        validActor.organizationId,
        input.transactionId
      );
      if (!orig) {
        throw new NotFoundError(`Transaction ${input.transactionId} not found`);
      }
      if (
        orig.transactionType !== "STOCK_RECEIPT" &&
        orig.transactionType !== "OPENING_BALANCE"
      ) {
        throw new ValidationError(
          `Only STOCK_RECEIPT or OPENING_BALANCE transactions can be reversed via receipt reversal`
        );
      }
      if (orig.isReversed) {
        throw new ConflictError(
          `Transaction ${orig.transactionNumber} has already been reversed`
        );
      }

      const purity = await tx.getPurityById(
        validActor.organizationId,
        orig.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${orig.purityId} not found`);
      }

      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );

      // Rule 6 & Rule 12: Block unsafe reversal when downstream movements have consumed this stock
      if (adminPoolAcct.cachedPhysicalBalance.lt(orig.physicalWeight)) {
        throw new ConflictError(
          `Cannot reverse receipt ${orig.transactionNumber} of ${orig.physicalWeight.toFixed(
            3
          )}g because available stock in ${purity.displayLabel} is only ${adminPoolAcct.cachedPhysicalBalance.toFixed(
            3
          )}g (downstream order issues depend on this receipt).`
        );
      }

      const counterAcct =
        orig.transactionType === "OPENING_BALANCE"
          ? await this.ensureSystemAccount(
              tx,
              validActor.organizationId,
              `OPENING_EQUITY_${purity.code}`,
              `Opening Balance Equity - ${purity.displayLabel}`,
              "OPENING_EQUITY",
              purity.id,
              null
            )
          : await this.ensureSystemAccount(
              tx,
              validActor.organizationId,
              `EXTERNAL_INFLOW_${purity.code}`,
              `External Supplier Inflow - ${purity.displayLabel}`,
              "EXTERNAL_SUPPLIER_INFLOW",
              purity.id,
              null
            );

      await tx.markJournalTransactionReversed(orig.id);

      const reversalTx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "STOCK_RECEIPT_REVERSAL",
        businessDate,
        purity,
        physicalWeight: orig.physicalWeight,
        fineEquivalentWeight: orig.fineEquivalentWeight,
        sourceAccount: adminPoolAcct,
        destinationAccount: counterAcct,
        sourceReference: orig.transactionNumber,
        reason: `Reversal of ${orig.transactionNumber}: ${reason}`,
        idempotencyKey: input.idempotencyKey,
        reversalOfTransactionId: orig.id,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "JournalTransaction",
        entityId: reversalTx.id,
        action: "STOCK_RECEIPT_REVERSED",
        summary: `Reversed ${orig.transactionNumber} (${orig.physicalWeight.toFixed(3)}g): ${reason}`,
        metadataJson: JSON.stringify({ originalTransactionId: orig.id, reason }),
        createdAt: new Date(),
      });

      return reversalTx;
    });
  }

  public async listJournalHistory(
    actor: ActorContext,
    search?: string
  ): Promise<
    Array<
      JournalTransactionEntity & {
        purityLabel: string;
        karigarName: string | null;
        bagNumber: string | null;
      }
    >
  > {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction(async (tx) => {
      const [txs, purities, karigars, orders] = await Promise.all([
        tx.listJournalTransactions(validActor.organizationId),
        tx.listPurities(validActor.organizationId),
        tx.listKarigars(validActor.organizationId),
        tx.listOrders(validActor.organizationId),
      ]);
      const purityMap = new Map(purities.map((p) => [p.id, p]));
      const karigarMap = new Map(karigars.map((k) => [k.id, k]));
      const orderMap = new Map(orders.map((o) => [o.id, o]));

      const enriched = txs.map((t) => ({
        ...t,
        purityLabel: purityMap.get(t.purityId)?.displayLabel ?? t.purityId,
        karigarName: t.karigarId ? karigarMap.get(t.karigarId)?.name ?? null : null,
        bagNumber: t.orderId ? orderMap.get(t.orderId)?.bagNumber ?? null : null,
      }));

      if (!search || !search.trim()) return enriched;
      const q = search.trim().toLowerCase();
      return enriched.filter(
        (t) =>
          t.transactionNumber.toLowerCase().includes(q) ||
          t.reason.toLowerCase().includes(q) ||
          (t.sourceReference && t.sourceReference.toLowerCase().includes(q)) ||
          t.purityLabel.toLowerCase().includes(q) ||
          (t.karigarName && t.karigarName.toLowerCase().includes(q)) ||
          (t.bagNumber && t.bagNumber.toLowerCase().includes(q))
      );
    });
  }

  // ==========================================================================
  // 3. CUSTOMERS & KARIGARS
  // ==========================================================================

  public async createCustomer(
    actor: ActorContext,
    input: CreateCustomerInput
  ): Promise<CustomerEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const name = input.name?.trim();
    if (!name) {
      throw new ValidationError("Customer name is required");
    }

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.listCustomers(validActor.organizationId);
      const code =
        input.customerCode?.trim().toUpperCase() ||
        `CUST-${String(existing.length + 1).padStart(3, "0")}`;
      const now = new Date();
      return tx.createCustomer({
        id: newId("cust"),
        organizationId: validActor.organizationId,
        customerCode: code,
        name,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        gstNumber: input.gstNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  public async updateCustomer(
    actor: ActorContext,
    input: {
      customerId: string;
      name: string;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      gstNumber?: string | null;
      notes?: string | null;
    }
  ): Promise<CustomerEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const name = input.name?.trim();
    if (!name) {
      throw new ValidationError("Customer name is required");
    }

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getCustomerById(
        validActor.organizationId,
        input.customerId
      );
      if (!existing) {
        throw new NotFoundError(`Customer ${input.customerId} not found`);
      }
      return tx.updateCustomer({
        ...existing,
        name,
        phone:
          input.phone !== undefined
            ? input.phone?.trim() || null
            : existing.phone,
        email:
          input.email !== undefined
            ? input.email?.trim() || null
            : existing.email,
        address:
          input.address !== undefined
            ? input.address?.trim() || null
            : existing.address,
        gstNumber:
          input.gstNumber !== undefined
            ? input.gstNumber?.trim() || null
            : existing.gstNumber,
        notes:
          input.notes !== undefined
            ? input.notes?.trim() || null
            : existing.notes,
        updatedAt: new Date(),
      });
    });
  }

  public async postStockRemoval(
    actor: ActorContext,
    input: {
      purityId: string;
      physicalWeight: DecimalInput;
      businessDate?: string | Date;
      reason?: string;
      sourceReference?: string;
      idempotencyKey: string;
    }
  ): Promise<JournalTransactionEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const weight = roundInternal(input.physicalWeight);
    if (weight.lte(ZERO)) {
      throw new ValidationError("Removal weight must be greater than zero");
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getJournalTransactionByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return existing;

      const purity = await tx.getPurityById(
        validActor.organizationId,
        input.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${input.purityId} not found`);
      }

      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );

      if (adminPoolAcct.cachedPhysicalBalance.lt(weight)) {
        throw new ValidationError(
          `Insufficient ${purity.displayLabel} stock (${adminPoolAcct.cachedPhysicalBalance.toFixed(
            3
          )}g available, requested ${weight.toFixed(3)}g)`
        );
      }

      const outflowAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `EXTERNAL_INFLOW_${purity.code}`,
        `External Supplier Inflow - ${purity.displayLabel}`,
        "EXTERNAL_SUPPLIER_INFLOW",
        purity.id,
        null
      );

      const fine = calculateFineEquivalent(weight, purity.touchPercent);
      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "STOCK_RECEIPT_REVERSAL",
        businessDate,
        purity,
        physicalWeight: weight,
        fineEquivalentWeight: fine,
        sourceAccount: adminPoolAcct,
        destinationAccount: outflowAcct,
        sourceReference: input.sourceReference?.trim() || "MANUAL-OUT",
        reason:
          input.reason?.trim() ||
          `Manual stock removal of ${weight.toFixed(3)}g (${purity.displayLabel})`,
        idempotencyKey: input.idempotencyKey,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "JournalTransaction",
        entityId: jtx.id,
        action: "STOCK_MANUAL_REMOVAL_POSTED",
        summary: `Removed ${weight.toFixed(3)}g (${fine.toFixed(3)}g fine) of ${purity.displayLabel}`,
        metadataJson: null,
        createdAt: new Date(),
      });

      return jtx;
    });
  }

  public async listCustomers(
    actor: ActorContext,
    search?: string
  ): Promise<CustomerEntity[]> {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction(async (tx) => {
      const all = await tx.listCustomers(validActor.organizationId);
      if (!search || !search.trim()) return all;
      const q = search.trim().toLowerCase();
      return all.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.customerCode.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q))
      );
    });
  }

  public async createKarigar(
    actor: ActorContext,
    input: CreateKarigarInput
  ): Promise<KarigarEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const name = input.name?.trim();
    if (!name) {
      throw new ValidationError("Karigar name is required");
    }
    if (!input.capabilities || input.capabilities.length === 0) {
      throw new ValidationError(
        "At least one manufacturing capability must be selected for a karigar"
      );
    }

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.listKarigars(validActor.organizationId);
      // Rule 7: Stable unique IDs and codes for karigars; never merge by name alone.
      const code =
        input.karigarCode?.trim().toUpperCase() ||
        `KAR-${String(existing.length + 1).padStart(3, "0")}`;
      const now = new Date();
      const karigar = await tx.createKarigar({
        id: newId("kar"),
        organizationId: validActor.organizationId,
        karigarCode: code,
        name,
        phone: input.phone?.trim() || null,
        specializationNotes: input.specializationNotes?.trim() || null,
        isActive: true,
        capabilities: Array.from(new Set(input.capabilities)),
        createdAt: now,
        updatedAt: now,
      });

      await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `KARIGAR_CUSTODY_${karigar.id}`,
        `Karigar Custody - ${karigar.name} (${karigar.karigarCode})`,
        "KARIGAR_CUSTODY",
        null,
        karigar.id
      );

      return karigar;
    });
  }

  public async listKarigars(
    actor: ActorContext,
    search?: string
  ): Promise<KarigarEntity[]> {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction(async (tx) => {
      const all = await tx.listKarigars(validActor.organizationId);
      if (!search || !search.trim()) return all;
      const q = search.trim().toLowerCase();
      return all.filter(
        (k) =>
          k.name.toLowerCase().includes(q) ||
          k.karigarCode.toLowerCase().includes(q) ||
          (k.phone && k.phone.toLowerCase().includes(q))
      );
    });
  }

  // ==========================================================================
  // 4. ORDER CREATION (NO AUTOMATIC STOCK DEDUCTION)
  // ==========================================================================

  public async createOrder(
    actor: ActorContext,
    input: CreateOrderInput
  ): Promise<{ order: OrderEntity; processes: OrderProcessEntity[] }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const bagNumber = input.bagNumber?.trim();
    if (!bagNumber) {
      throw new ValidationError("Bag / Order Number is required");
    }
    const orderName = input.orderName?.trim() || "Pending Item";
    if (!input.selectedProcesses || input.selectedProcesses.length === 0) {
      throw new ValidationError(
        "At least one manufacturing process must be selected for the order"
      );
    }

    // Rule 7: Sort and validate canonical process sequence:
    // 1. FILING -> 2. FREE_POLISH -> 3. SETTING -> 4. FINAL_POLISH
    const uniqueSelected = Array.from(new Set(input.selectedProcesses));
    const orderedProcesses = CANONICAL_PROCESS_SEQUENCE.filter((p) =>
      uniqueSelected.includes(p)
    );
    if (orderedProcesses.length === 0) {
      throw new ValidationError("Invalid manufacturing processes selected");
    }

    const orderDate = parseBusinessDate(input.orderDate);
    const dueDate = input.dueDate ? parseBusinessDate(input.dueDate) : null;
    const rawTargetWeightStr =
      input.targetWeight !== null && input.targetWeight !== undefined
        ? String(input.targetWeight).trim()
        : "";
    const targetWeightText = rawTargetWeightStr || null;
    const targetWeight =
      rawTargetWeightStr && /^\d+(\.\d+)?$/.test(rawTargetWeightStr)
        ? roundInternal(rawTargetWeightStr)
        : null;

    return this.repo.runInTransaction(async (tx) => {
      const dupBag = await tx.getOrderByBagNumber(
        validActor.organizationId,
        bagNumber
      );
      if (dupBag) {
        throw new ConflictError(
          `Bag / Order Number '${bagNumber}' already exists in this organization`
        );
      }

      const customer = await tx.getCustomerById(
        validActor.organizationId,
        input.customerId
      );
      if (!customer) {
        throw new NotFoundError(`Customer ${input.customerId} not found`);
      }

      // Row-level lock to prevent concurrent double-consumption of customer advance
      await tx.lockCustomerForUpdate(validActor.organizationId, customer.id);

      const purity = await tx.getPurityById(
        validActor.organizationId,
        input.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${input.purityId} not found`);
      }

      const now = new Date();
      // Rule 7: Creating an order MUST NOT deduct stock automatically.
      const order = await tx.createOrder({
        id: newId("ord"),
        organizationId: validActor.organizationId,
        bagNumber,
        customerId: customer.id,
        orderName,
        photoUrl: input.photoUrl ?? null,
        purityId: purity.id,
        touchSnapshot: roundTouch(purity.touchPercent),
        targetWeight,
        targetWeightText,
        size: input.size?.trim() || null,
        orderDate,
        dueDate,
        notes: input.notes?.trim() || null,
        adDetailsJson: input.adDetailsJson ?? null,
        status: "CREATED",
        initialIssuedMetalWeight: ZERO,
        retainedStoneWeight: ZERO,
        finishedGrossWeight: null,
        finishedStoneWeight: null,
        finishedNetMetalWeight: null,
        finishedFineWeight: null,
        totalRawLossWeight: ZERO,
        totalFineLossWeight: ZERO,
        completedAt: null,
        completedById: null,
        deliveryStatus: "NOT_DELIVERED",
        deliveredAt: null,
        deliveredById: null,
        billingStatus: "UNBILLED",
        activeBillId: null,
        cancelledAt: null,
        cancellationReason: null,
        createdById: validActor.userId,
        createdAt: now,
        updatedAt: now,
      });

      const createdProcesses: OrderProcessEntity[] = [];
      for (let i = 0; i < orderedProcesses.length; i++) {
        const pType = orderedProcesses[i];
        const canonicalSeq = CANONICAL_PROCESS_SEQUENCE.indexOf(pType) + 1;
        const proc = await tx.createOrderProcess({
          id: newId("oproc"),
          organizationId: validActor.organizationId,
          orderId: order.id,
          processType: pType,
          canonicalSequence: canonicalSeq,
          sequenceOrder: i + 1,
          assignedKarigarId: null,
          status: "PENDING",
          issuedMetalWeight: ZERO,
          returnedMetalWeight: ZERO,
          extraReturnedMetalWeight: ZERO,
          closedLossWeight: ZERO,
          custodyMetalWeight: ZERO,
          carriedStoneInWeight: ZERO,
          addedStoneWeight: ZERO,
          removedStoneWeight: ZERO,
          carriedStoneOutWeight: ZERO,
          latestGrossInWeight: ZERO,
          latestGrossOutWeight: ZERO,
          closedAt: null,
          closedById: null,
          createdAt: now,
          updatedAt: now,
        });
        createdProcesses.push(proc);
      }

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "Order",
        entityId: order.id,
        action: "ORDER_CREATED",
        summary: `Created order Bag #${order.bagNumber} (${order.orderName}) with processes: ${orderedProcesses.join(
          " -> "
        )}`,
        metadataJson: null,
        createdAt: now,
      });

      return { order, processes: createdProcesses };
    });
  }

  public async updateOrderDetails(
    actor: ActorContext,
    input: {
      orderId: string;
      customerId?: string;
      orderName?: string;
      purityId?: string;
      targetWeight?: DecimalInput | null;
      size?: string | null;
      orderDate?: string | Date;
      dueDate?: string | Date | null;
      notes?: string | null;
      photoUrl?: string | null;
      adDetailsJson?: string | null;
    }
  ): Promise<OrderEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    return this.repo.runInTransaction(async (tx) => {
      const order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      if (order.status === "CANCELLED") {
        throw new ConflictError("Cannot edit a cancelled order");
      }

      let nextCustomerId = order.customerId;
      if (input.customerId && input.customerId !== order.customerId) {
        const cust = await tx.getCustomerById(
          validActor.organizationId,
          input.customerId
        );
        if (!cust) {
          throw new NotFoundError(`Customer ${input.customerId} not found`);
        }
        nextCustomerId = cust.id;
      }

      let nextPurityId = order.purityId;
      let nextTouch = order.touchSnapshot;
      if (input.purityId && input.purityId !== order.purityId) {
        if (order.initialIssuedMetalWeight.gt(ZERO)) {
          throw new ConflictError(
            "Cannot change order purity after metal has already been issued"
          );
        }
        const purity = await tx.getPurityById(
          validActor.organizationId,
          input.purityId
        );
        if (!purity) {
          throw new NotFoundError(`Purity ${input.purityId} not found`);
        }
        nextPurityId = purity.id;
        nextTouch = purity.touchPercent;
      }

      let nextTargetWeight = order.targetWeight;
      let nextTargetWeightText = order.targetWeightText ?? null;
      if (input.targetWeight !== undefined) {
        const rawTw =
          input.targetWeight === null ? "" : String(input.targetWeight).trim();
        nextTargetWeightText = rawTw || null;
        nextTargetWeight =
          rawTw && /^\d+(\.\d+)?$/.test(rawTw) ? roundInternal(rawTw) : null;
      }

      const updated = await tx.updateOrder({
        ...order,
        customerId: nextCustomerId,
        orderName:
          input.orderName !== undefined
            ? input.orderName.trim() || "Pending Item"
            : order.orderName,
        purityId: nextPurityId,
        touchSnapshot: nextTouch,
        targetWeight: nextTargetWeight,
        targetWeightText: nextTargetWeightText,
        size: input.size !== undefined ? input.size?.trim() || null : order.size,
        orderDate:
          input.orderDate !== undefined
            ? parseBusinessDate(input.orderDate)
            : order.orderDate,
        dueDate:
          input.dueDate === undefined
            ? order.dueDate
            : input.dueDate
            ? parseBusinessDate(input.dueDate)
            : null,
        notes:
          input.notes !== undefined ? input.notes?.trim() || null : order.notes,
        photoUrl:
          input.photoUrl !== undefined ? input.photoUrl || null : order.photoUrl,
        adDetailsJson:
          input.adDetailsJson !== undefined
            ? input.adDetailsJson || null
            : order.adDetailsJson,
        updatedAt: new Date(),
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "Order",
        entityId: order.id,
        action: "ORDER_DETAILS_UPDATED",
        summary: `Updated details for Bag #${order.bagNumber} (${updated.orderName})`,
        metadataJson: null,
        createdAt: new Date(),
      });

      return updated;
    });
  }

  // ==========================================================================
  // 5. ISSUE METAL TO ORDER & PROCESS ENTRY / TRANSFERS / STONE TRACKING
  // ==========================================================================

  public async issueMetalToOrder(
    actor: ActorContext,
    input: IssueMetalToOrderInput
  ): Promise<{
    movement: MetalMovementEntity;
    journalTransaction: JournalTransactionEntity;
    order: OrderEntity;
    firstProcess: OrderProcessEntity;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const metalWeight = roundInternal(input.metalWeight);
    if (metalWeight.lte(ZERO)) {
      throw new ValidationError("Issued metal weight must be greater than zero");
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existingMov = await tx.getMetalMovementByIdempotencyKey(
        input.idempotencyKey
      );
      if (existingMov) {
        const order = (await tx.getOrderById(
          validActor.organizationId,
          existingMov.orderId
        ))!;
        const processes = await tx.listOrderProcesses(
          validActor.organizationId,
          order.id
        );
        const jtx = (await tx.getJournalTransactionById(
          validActor.organizationId,
          existingMov.journalTransactionId!
        ))!;
        return {
          movement: existingMov,
          journalTransaction: jtx,
          order,
          firstProcess: processes[0],
        };
      }

      let order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      if (
        order.status === "COMPLETED" ||
        order.status === "CANCELLED" ||
        order.status === "CANCELLATION_PENDING_RECONCILIATION"
      ) {
        throw new ValidationError(
          `Cannot issue metal to order in status ${order.status}`
        );
      }

      const karigar = await tx.getKarigarById(
        validActor.organizationId,
        input.karigarId
      );
      if (!karigar) {
        throw new NotFoundError(`Karigar ${input.karigarId} not found`);
      }

      const purity = await tx.getPurityById(
        validActor.organizationId,
        order.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${order.purityId} not found`);
      }

      const processes = await tx.listOrderProcesses(
        validActor.organizationId,
        order.id
      );
      const firstProcess = processes[0];
      if (!firstProcess) {
        throw new ValidationError("Order has no selected processes");
      }
      if (firstProcess.status === "CLOSED") {
        throw new ValidationError(
          `First selected process (${firstProcess.processType}) is already closed`
        );
      }

      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );

      // Rule 6: Prevent unapproved negative stock & concurrent overspend
      if (adminPoolAcct.cachedPhysicalBalance.lt(metalWeight)) {
        throw new ValidationError(
          `Insufficient stock in ${purity.displayLabel}: available ${adminPoolAcct.cachedPhysicalBalance.toFixed(
            3
          )}g, requested ${metalWeight.toFixed(3)}g`
        );
      }

      const karigarCustodyAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `KARIGAR_CUSTODY_${karigar.id}`,
        `Karigar Custody - ${karigar.name} (${karigar.karigarCode})`,
        "KARIGAR_CUSTODY",
        null,
        karigar.id
      );

      const fineWeight = calculateFineEquivalent(
        metalWeight,
        order.touchSnapshot
      );

      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "ORDER_METAL_ISSUE",
        businessDate,
        purity,
        physicalWeight: metalWeight,
        fineEquivalentWeight: fineWeight,
        sourceAccount: adminPoolAcct,
        destinationAccount: karigarCustodyAcct,
        sourceReference: `BAG-${order.bagNumber}`,
        reason: `Issued ${metalWeight.toFixed(3)}g to Bag #${order.bagNumber} (${firstProcess.processType})`,
        orderId: order.id,
        orderProcessId: firstProcess.id,
        karigarId: karigar.id,
        idempotencyKey: `jnl_${input.idempotencyKey}`,
      });

      const now = new Date();
      const movement = await tx.createMetalMovement({
        id: newId("mmov"),
        organizationId: validActor.organizationId,
        orderId: order.id,
        orderProcessId: firstProcess.id,
        processVisitId: null,
        movementType: "ADMIN_ISSUE_TO_ORDER",
        fromProcessType: null,
        toProcessType: firstProcess.processType,
        karigarId: karigar.id,
        businessDate,
        grossWeight: metalWeight,
        nonGoldWeight: ZERO,
        netMetalWeight: metalWeight,
        touchSnapshot: order.touchSnapshot,
        fineEquivalentWeight: fineWeight,
        journalTransactionId: jtx.id,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes ?? null,
        createdById: validActor.userId,
        createdAt: now,
      });

      const updatedFirstProcess = await tx.updateOrderProcess({
        ...firstProcess,
        assignedKarigarId: karigar.id,
        status: "IN_PROGRESS",
        issuedMetalWeight: roundInternal(
          firstProcess.issuedMetalWeight.add(metalWeight)
        ),
        custodyMetalWeight: roundInternal(
          firstProcess.custodyMetalWeight.add(metalWeight)
        ),
        latestGrossInWeight: roundInternal(
          firstProcess.issuedMetalWeight
            .add(metalWeight)
            .add(firstProcess.carriedStoneInWeight)
        ),
        updatedAt: now,
      });

      const updatedOrder = await tx.updateOrder({
        ...order,
        status: "IN_PROCESS",
        initialIssuedMetalWeight: roundInternal(
          order.initialIssuedMetalWeight.add(metalWeight)
        ),
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "OrderProcess",
        entityId: firstProcess.id,
        action: "ORDER_METAL_ISSUED",
        summary: `Issued ${metalWeight.toFixed(3)}g (${fineWeight.toFixed(3)}g fine) to Bag #${order.bagNumber} (${firstProcess.processType})`,
        metadataJson: null,
        createdAt: now,
      });

      return {
        movement,
        journalTransaction: jtx,
        order: updatedOrder,
        firstProcess: updatedFirstProcess,
      };
    });
  }

  /**
   * Issue additional gold from Admin Stock strictly to the FILING process while Filing is open
   * and before any downstream process has started.
   */
  public async addFilingGoldIssue(
    actor: ActorContext,
    input: AddFilingGoldIssueInput
  ): Promise<{
    movement: MetalMovementEntity;
    journalTransaction: JournalTransactionEntity;
    order: OrderEntity;
    filingProcess: OrderProcessEntity;
    cumulativeFilingIn: Decimal;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const additionalWeight = roundInternal(input.additionalWeight);
    if (additionalWeight.lte(ZERO)) {
      throw new ValidationError(
        "Additional Filing gold weight must be greater than zero"
      );
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      // Idempotency guard against double clicks and retries
      const existingMov = await tx.getMetalMovementByIdempotencyKey(
        input.idempotencyKey
      );
      if (existingMov) {
        const order = (await tx.getOrderById(
          validActor.organizationId,
          existingMov.orderId
        ))!;
        const processes = await tx.listOrderProcesses(
          validActor.organizationId,
          order.id
        );
        const filingProc = processes.find((p) => p.processType === "FILING")!;
        const jtx = (await tx.getJournalTransactionById(
          validActor.organizationId,
          existingMov.journalTransactionId!
        ))!;
        return {
          movement: existingMov,
          journalTransaction: jtx,
          order,
          filingProcess: filingProc,
          cumulativeFilingIn: filingProc.issuedMetalWeight,
        };
      }

      let order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      if (
        order.status === "COMPLETED" ||
        order.status === "CANCELLED" ||
        order.status === "CANCELLATION_PENDING_RECONCILIATION"
      ) {
        throw new ValidationError(
          `Cannot issue gold to order in status ${order.status}`
        );
      }

      const processes = await tx.listOrderProcesses(
        validActor.organizationId,
        order.id
      );
      const filingIndex = processes.findIndex(
        (p) => p.processType === "FILING"
      );
      if (filingIndex === -1) {
        throw new ValidationError(
          `Filing process is not selected for Bag #${order.bagNumber}. Additional gold issue is only allowed in Filing.`
        );
      }
      const filingProc = processes[filingIndex];
      if (filingProc.status === "CLOSED") {
        throw new ConflictError(
          `Filing process for Bag #${order.bagNumber} is already CLOSED. Reopen Filing via controlled correction before issuing additional gold.`
        );
      }

      // Block additions if any later process has already started
      const laterStarted = processes
        .slice(filingIndex + 1)
        .some((p) => p.status !== "PENDING");
      if (laterStarted) {
        throw new ConflictError(
          `Cannot add gold to Filing after a later process has started for Bag #${order.bagNumber}. Use a controlled correction workflow.`
        );
      }

      const resolvedKarigarId =
        input.karigarId?.trim() || filingProc.assignedKarigarId;
      if (!resolvedKarigarId) {
        throw new ValidationError(
          "Please select a Filing karigar before issuing gold"
        );
      }
      const karigar = await tx.getKarigarById(
        validActor.organizationId,
        resolvedKarigarId
      );
      if (!karigar) {
        throw new NotFoundError(`Karigar ${resolvedKarigarId} not found`);
      }

      const purity = await tx.getPurityById(
        validActor.organizationId,
        order.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${order.purityId} not found`);
      }

      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );

      if (adminPoolAcct.cachedPhysicalBalance.lt(additionalWeight)) {
        throw new ValidationError(
          `Insufficient stock in ${purity.displayLabel} (${order.touchSnapshot}%): available ${adminPoolAcct.cachedPhysicalBalance.toFixed(
            3
          )}g, requested ${additionalWeight.toFixed(3)}g`
        );
      }

      // Compute cumulative valid Filing IN from all posted non-reversed issue movements
      const [orderMovements, orgJtxs] = await Promise.all([
        tx.listMetalMovements(validActor.organizationId, order.id),
        tx.listJournalTransactions(validActor.organizationId),
      ]);
      const jtxMap = new Map(orgJtxs.map((j) => [j.id, j]));

      let priorValidIssued = ZERO;
      for (const mov of orderMovements) {
        if (mov.orderProcessId !== filingProc.id) continue;
        const linkedJtx = mov.journalTransactionId
          ? jtxMap.get(mov.journalTransactionId)
          : undefined;
        if (linkedJtx?.isReversed) continue;

        if (
          mov.movementType === "ADMIN_ISSUE_TO_ORDER" ||
          mov.movementType === "ADDITIONAL_ADMIN_ISSUE"
        ) {
          priorValidIssued = roundInternal(
            priorValidIssued.add(mov.netMetalWeight)
          );
        } else if (mov.movementType === "REVERSAL") {
          priorValidIssued = roundInternal(
            priorValidIssued.sub(mov.netMetalWeight)
          );
        }
      }
      if (priorValidIssued.lt(ZERO)) {
        priorValidIssued = ZERO;
      }

      const isInitialIssue = priorValidIssued.isZero();
      const movementType = isInitialIssue
        ? "ADMIN_ISSUE_TO_ORDER"
        : "ADDITIONAL_ADMIN_ISSUE";
      const cumulativeFilingIn = roundInternal(
        priorValidIssued.add(additionalWeight)
      );

      const karigarCustodyAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `KARIGAR_CUSTODY_${karigar.id}`,
        `Karigar Custody - ${karigar.name} (${karigar.karigarCode})`,
        "KARIGAR_CUSTODY",
        null,
        karigar.id
      );

      const fineWeight = calculateFineEquivalent(
        additionalWeight,
        order.touchSnapshot
      );

      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "ORDER_METAL_ISSUE",
        businessDate,
        purity,
        physicalWeight: additionalWeight,
        fineEquivalentWeight: fineWeight,
        sourceAccount: adminPoolAcct,
        destinationAccount: karigarCustodyAcct,
        sourceReference: `BAG-${order.bagNumber}`,
        reason: isInitialIssue
          ? `Initial Filing issue ${additionalWeight.toFixed(3)}g to Bag #${order.bagNumber}`
          : `Additional Filing issue +${additionalWeight.toFixed(3)}g to Bag #${order.bagNumber} (Cumulative Filing IN: ${cumulativeFilingIn.toFixed(3)}g)`,
        orderId: order.id,
        orderProcessId: filingProc.id,
        karigarId: karigar.id,
        idempotencyKey: `jnl_${input.idempotencyKey}`,
      });

      const now = new Date();
      const movement = await tx.createMetalMovement({
        id: newId("mmov"),
        organizationId: validActor.organizationId,
        orderId: order.id,
        orderProcessId: filingProc.id,
        processVisitId: null,
        movementType,
        fromProcessType: null,
        toProcessType: "FILING",
        karigarId: karigar.id,
        businessDate,
        grossWeight: additionalWeight,
        nonGoldWeight: ZERO,
        netMetalWeight: additionalWeight,
        touchSnapshot: order.touchSnapshot,
        fineEquivalentWeight: fineWeight,
        journalTransactionId: jtx.id,
        idempotencyKey: input.idempotencyKey,
        notes: input.notes?.trim() || null,
        createdById: validActor.userId,
        createdAt: now,
      });

      const updatedFilingProc = await tx.updateOrderProcess({
        ...filingProc,
        assignedKarigarId: karigar.id,
        status: filingProc.status === "PENDING" ? "IN_PROGRESS" : filingProc.status,
        issuedMetalWeight: cumulativeFilingIn,
        custodyMetalWeight: roundInternal(
          filingProc.custodyMetalWeight.add(additionalWeight)
        ),
        latestGrossInWeight: roundInternal(
          cumulativeFilingIn.add(filingProc.carriedStoneInWeight)
        ),
        updatedAt: now,
      });

      const updatedOrder = await tx.updateOrder({
        ...order,
        status: "IN_PROCESS",
        initialIssuedMetalWeight: roundInternal(
          order.initialIssuedMetalWeight.add(additionalWeight)
        ),
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "OrderProcess",
        entityId: filingProc.id,
        action: isInitialIssue
          ? "FILING_INITIAL_GOLD_ISSUED"
          : "FILING_ADDITIONAL_GOLD_ISSUED",
        summary: isInitialIssue
          ? `Issued initial ${additionalWeight.toFixed(3)}g (${fineWeight.toFixed(3)}g fine) to Filing for Bag #${order.bagNumber}`
          : `Issued additional +${additionalWeight.toFixed(3)}g (${fineWeight.toFixed(3)}g fine) to Filing for Bag #${order.bagNumber}. Total Filing IN: ${cumulativeFilingIn.toFixed(3)}g`,
        metadataJson: null,
        createdAt: now,
      });

      return {
        movement,
        journalTransaction: jtx,
        order: updatedOrder,
        filingProcess: updatedFilingProc,
        cumulativeFilingIn,
      };
    });
  }

  /**
   * Step A of a process: Give work to a karigar (save IN weight and optional SETTING stones)
   * without requiring OUT yet. Status becomes IN_PROGRESS ("With Karigar").
   */
  public async giveWorkToProcess(
    actor: ActorContext,
    input: {
      orderId: string;
      processType: ProcessType;
      karigarId: string;
      grossInWeight?: DecimalInput;
      stoneComponents?: StoneComponentInput[];
      businessDate?: string | Date;
      notes?: string;
      idempotencyKey: string;
    }
  ): Promise<{
    process: OrderProcessEntity;
    order: OrderEntity;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existingMov = await tx.getMetalMovementByIdempotencyKey(
        input.idempotencyKey
      );
      if (existingMov) {
        const order = (await tx.getOrderById(
          validActor.organizationId,
          existingMov.orderId
        ))!;
        const processes = await tx.listOrderProcesses(
          validActor.organizationId,
          order.id
        );
        const proc = processes.find((p) => p.id === existingMov.orderProcessId)!;
        return { process: proc, order };
      }

      let order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      if (
        order.status === "COMPLETED" ||
        order.status === "CANCELLED" ||
        order.status === "CANCELLATION_PENDING_RECONCILIATION"
      ) {
        throw new ValidationError(
          `Cannot give work to order in status ${order.status}`
        );
      }

      const karigar = await tx.getKarigarById(
        validActor.organizationId,
        input.karigarId
      );
      if (!karigar) {
        throw new NotFoundError(`Karigar ${input.karigarId} not found`);
      }

      const purity = (await tx.getPurityById(
        validActor.organizationId,
        order.purityId
      ))!;
      const processes = await tx.listOrderProcesses(
        validActor.organizationId,
        order.id
      );
      const procIndex = processes.findIndex(
        (p) => p.processType === input.processType
      );
      if (procIndex === -1) {
        throw new ValidationError(
          `Process ${input.processType} is not selected for Bag #${order.bagNumber}`
        );
      }

      let currentProc = processes[procIndex];
      if (currentProc.status === "CLOSED") {
        throw new ConflictError(
          `Process ${currentProc.processType} is already CLOSED`
        );
      }
      for (let i = 0; i < procIndex; i++) {
        if (processes[i].status !== "CLOSED") {
          throw new ValidationError(
            `Cannot give work to ${currentProc.processType} before prior process ${processes[i].processType} is CLOSED`
          );
        }
      }

      const now = new Date();

      // Case 1: First process with no metal issued yet -> issue from Admin Stock
      if (procIndex === 0 && currentProc.issuedMetalWeight.isZero()) {
        const grossIn = roundInternal(input.grossInWeight ?? ZERO);
        if (grossIn.lte(ZERO)) {
          throw new ValidationError("IN weight must be greater than zero");
        }
        const adminPoolAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `ADMIN_POOL_${purity.code}`,
          `Admin Stock Pool - ${purity.displayLabel}`,
          "ADMIN_KARAT_POOL",
          purity.id,
          null
        );
        if (adminPoolAcct.cachedPhysicalBalance.lt(grossIn)) {
          throw new ValidationError(
            `Insufficient stock in ${purity.displayLabel}: available ${adminPoolAcct.cachedPhysicalBalance.toFixed(
              3
            )}g, requested ${grossIn.toFixed(3)}g`
          );
        }
        const karigarCustodyAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `KARIGAR_CUSTODY_${karigar.id}`,
          `Karigar Custody - ${karigar.name} (${karigar.karigarCode})`,
          "KARIGAR_CUSTODY",
          null,
          karigar.id
        );
        const fineWeight = calculateFineEquivalent(
          grossIn,
          order.touchSnapshot
        );
        const jtx = await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "ORDER_METAL_ISSUE",
          businessDate,
          purity,
          physicalWeight: grossIn,
          fineEquivalentWeight: fineWeight,
          sourceAccount: adminPoolAcct,
          destinationAccount: karigarCustodyAcct,
          sourceReference: `BAG-${order.bagNumber}`,
          reason: `Issued ${grossIn.toFixed(3)}g to Bag #${order.bagNumber} (${currentProc.processType})`,
          orderId: order.id,
          orderProcessId: currentProc.id,
          karigarId: karigar.id,
          idempotencyKey: `gw_jnl_${input.idempotencyKey}`,
        });

        await tx.createMetalMovement({
          id: newId("mmov"),
          organizationId: validActor.organizationId,
          orderId: order.id,
          orderProcessId: currentProc.id,
          processVisitId: null,
          movementType: "ADMIN_ISSUE_TO_ORDER",
          fromProcessType: null,
          toProcessType: currentProc.processType,
          karigarId: karigar.id,
          businessDate,
          grossWeight: grossIn,
          nonGoldWeight: ZERO,
          netMetalWeight: grossIn,
          touchSnapshot: order.touchSnapshot,
          fineEquivalentWeight: fineWeight,
          journalTransactionId: jtx.id,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes ?? "Given work to karigar",
          createdById: validActor.userId,
          createdAt: now,
        });

        currentProc = await tx.updateOrderProcess({
          ...currentProc,
          assignedKarigarId: karigar.id,
          status: "IN_PROGRESS",
          issuedMetalWeight: grossIn,
          custodyMetalWeight: grossIn,
          latestGrossInWeight: grossIn,
          updatedAt: now,
        });
        order = await tx.updateOrder({
          ...order,
          status: "IN_PROCESS",
          initialIssuedMetalWeight: roundInternal(
            order.initialIssuedMetalWeight.add(grossIn)
          ),
          updatedAt: now,
        });
      } else {
        // Case 2: Downstream process (or already issued) — transfer custody if karigar changed & add any SETTING stones
      let updatedProc = currentProc;
      if (
        currentProc.assignedKarigarId &&
        currentProc.assignedKarigarId !== karigar.id &&
        currentProc.custodyMetalWeight.gt(ZERO)
      ) {
        const oldCustodyAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `KARIGAR_CUSTODY_${currentProc.assignedKarigarId}`,
          `Karigar Custody - ${currentProc.assignedKarigarId}`,
          "KARIGAR_CUSTODY",
          null,
          currentProc.assignedKarigarId
        );
        const newCustodyAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `KARIGAR_CUSTODY_${karigar.id}`,
          `Karigar Custody - ${karigar.name} (${karigar.karigarCode})`,
          "KARIGAR_CUSTODY",
          null,
          karigar.id
        );
        const xferFine = calculateFineEquivalent(
          currentProc.custodyMetalWeight,
          order.touchSnapshot
        );
        await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "PROCESS_CUSTODY_TRANSFER",
          businessDate,
          purity,
          physicalWeight: currentProc.custodyMetalWeight,
          fineEquivalentWeight: xferFine,
          sourceAccount: oldCustodyAcct,
          destinationAccount: newCustodyAcct,
          sourceReference: `BAG-${order.bagNumber}-${currentProc.processType}`,
          reason: `Assigned ${currentProc.processType} of Bag #${order.bagNumber} to ${karigar.name}`,
          orderId: order.id,
          orderProcessId: currentProc.id,
          karigarId: karigar.id,
          idempotencyKey: `gw_xfer_${input.idempotencyKey}`,
        });
        }
      }

      let addedStone = ZERO;
      let removedStone = ZERO;
      const stones = input.stoneComponents ?? [];
      for (const sc of stones) {
        const w = roundInternal(sc.weightGrams);
        if (w.lte(ZERO)) continue;
        const dir = sc.direction ?? "ADDED";
        if (dir === "ADDED") addedStone = roundInternal(addedStone.add(w));
        else if (dir === "REMOVED_LOST") removedStone = roundInternal(removedStone.add(w));
        await tx.createStoneComponentEntry({
          id: newId("stone"),
          organizationId: validActor.organizationId,
          orderId: order.id,
          orderProcessId: currentProc.id,
          processVisitId: null,
          componentType: sc.componentType,
          direction: dir,
          pieces: sc.pieces ?? 0,
          sizeLabel: sc.sizeLabel ?? null,
          weightGrams: w,
          notes: sc.notes ?? input.notes ?? null,
          createdById: validActor.userId,
          createdAt: now,
        });
      }

      const newAddedStone = roundInternal(
        currentProc.addedStoneWeight.add(addedStone)
      );
      const newRemovedStone = roundInternal(
        currentProc.removedStoneWeight.add(removedStone)
      );
      const newCarriedOut = roundInternal(
        currentProc.carriedStoneInWeight
          .add(newAddedStone)
          .sub(newRemovedStone)
      );
      if (newCarriedOut.lt(ZERO)) {
        throw new ValidationError("Retained stone weight cannot be negative");
      }

      const updatedProc = await tx.updateOrderProcess({
        ...currentProc,
        assignedKarigarId: karigar.id,
        status:
          currentProc.status === "PARTIAL_RETURN"
            ? "PARTIAL_RETURN"
            : "IN_PROGRESS",
        addedStoneWeight: newAddedStone,
        removedStoneWeight: newRemovedStone,
        carriedStoneOutWeight: newCarriedOut,
        updatedAt: now,
      });

      const updatedOrder = await tx.updateOrder({
        ...order,
        retainedStoneWeight: newCarriedOut,
        updatedAt: now,
      });

      return { process: updatedProc, order: updatedOrder };
    });
  }

  public async postProcessEntry(
    actor: ActorContext,
    input: PostProcessEntryInput
  ): Promise<{
    visit: ProcessVisitEntity;
    process: OrderProcessEntity;
    nextProcess: OrderProcessEntity | null;
    lossRecord: ProcessLossRecordEntity | null;
    order: OrderEntity;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const businessDate = parseBusinessDate(input.businessDate);
    const closeProcess = input.closeProcess ?? true;

    return this.repo.runInTransaction(async (tx) => {
      // Idempotency check (Rule 4 & Rule 13)
      const existingVisit = await tx.getProcessVisitByIdempotencyKey(
        input.idempotencyKey
      );
      if (existingVisit) {
        const order = (await tx.getOrderById(
          validActor.organizationId,
          existingVisit.orderId
        ))!;
        const processes = await tx.listOrderProcesses(
          validActor.organizationId,
          order.id
        );
        const proc = processes.find((p) => p.id === existingVisit.orderProcessId)!;
        const idx = processes.findIndex((p) => p.id === proc.id);
        const nextProc = idx >= 0 && idx + 1 < processes.length ? processes[idx + 1] : null;
        const losses = await tx.listProcessLossRecords(
          validActor.organizationId,
          order.id
        );
        const lossRecord =
          losses.find((l) => l.processVisitId === existingVisit.id) ?? null;
        return {
          visit: existingVisit,
          process: proc,
          nextProcess: nextProc,
          lossRecord,
          order,
        };
      }

      let order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      if (
        order.status === "COMPLETED" ||
        order.status === "CANCELLED" ||
        order.status === "CANCELLATION_PENDING_RECONCILIATION"
      ) {
        throw new ValidationError(
          `Cannot post process entry for order in status ${order.status}`
        );
      }

      const purity = (await tx.getPurityById(
        validActor.organizationId,
        order.purityId
      ))!;
      const karigar = await tx.getKarigarById(
        validActor.organizationId,
        input.karigarId
      );
      if (!karigar) {
        throw new NotFoundError(`Karigar ${input.karigarId} not found`);
      }

      const processes = await tx.listOrderProcesses(
        validActor.organizationId,
        order.id
      );
      const procIndex = processes.findIndex(
        (p) => p.processType === input.processType
      );
      if (procIndex === -1) {
        throw new ValidationError(
          `Process ${input.processType} is not selected for Bag #${order.bagNumber}`
        );
      }

      let currentProc = processes[procIndex];
      if (currentProc.status === "CLOSED") {
        throw new ConflictError(
          `Process ${currentProc.processType} is already CLOSED for Bag #${order.bagNumber}`
        );
      }

      // Verify prior selected processes are closed before posting to a downstream process
      for (let i = 0; i < procIndex; i++) {
        if (processes[i].status !== "CLOSED") {
          throw new ValidationError(
            `Cannot post to ${currentProc.processType} before prior selected process ${processes[i].processType} is CLOSED`
          );
        }
      }

      const grossIn = roundInternal(input.grossInWeight);
      const nonGoldIn =
        input.nonGoldInWeight !== undefined
          ? roundInternal(input.nonGoldInWeight)
          : roundInternal(currentProc.carriedStoneInWeight);
      const metalIn = roundInternal(grossIn.sub(nonGoldIn));

      if (metalIn.lte(ZERO)) {
        throw new ValidationError(
          `Net metal IN (${metalIn.toFixed(3)}g) must be greater than zero`
        );
      }

      // Compute stone components added or removed in this visit
      let addedStoneWeight = ZERO;
      let removedStoneWeight = ZERO;
      const stoneEntriesToCreate: StoneComponentInput[] = input.stoneComponents ?? [];
      for (const sc of stoneEntriesToCreate) {
        const w = roundInternal(sc.weightGrams);
        if (w.lt(ZERO)) {
          throw new ValidationError("Stone component weight cannot be negative");
        }
        const dir = sc.direction ?? "ADDED";
        if (dir === "ADDED") {
          addedStoneWeight = roundInternal(addedStoneWeight.add(w));
        } else if (dir === "REMOVED_LOST") {
          removedStoneWeight = roundInternal(removedStoneWeight.add(w));
        }
      }

      const baseNonGold =
        input.nonGoldInWeight === undefined &&
        (currentProc.addedStoneWeight.gt(ZERO) ||
          currentProc.removedStoneWeight.gt(ZERO))
          ? roundInternal(currentProc.carriedStoneOutWeight)
          : nonGoldIn;
      const expectedNonGoldOut = roundInternal(
        baseNonGold.add(addedStoneWeight).sub(removedStoneWeight)
      );
      const nonGoldOut =
        input.nonGoldOutWeight !== undefined
          ? roundInternal(input.nonGoldOutWeight)
          : expectedNonGoldOut;

      const grossOut = roundInternal(input.grossOutWeight);
      const metalOut = roundInternal(grossOut.sub(nonGoldOut));
      if (metalOut.lt(ZERO)) {
        throw new ValidationError(
          `Net metal OUT (${metalOut.toFixed(3)}g) cannot be negative (grossOut ${grossOut.toFixed(
            3
          )}g < nonGoldOut ${nonGoldOut.toFixed(3)}g)`
        );
      }

      // If this is the first selected process and metal has not yet been issued from Admin Stock,
      // automatically issue metalIn from Admin Stock so single-step entry works seamlessly!
      let activeOrder = order;
      if (procIndex === 0 && currentProc.issuedMetalWeight.isZero()) {
        const adminPoolAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `ADMIN_POOL_${purity.code}`,
          `Admin Stock Pool - ${purity.displayLabel}`,
          "ADMIN_KARAT_POOL",
          purity.id,
          null
        );
        if (adminPoolAcct.cachedPhysicalBalance.lt(metalIn)) {
          throw new ValidationError(
            `Insufficient stock in ${purity.displayLabel}: available ${adminPoolAcct.cachedPhysicalBalance.toFixed(
              3
            )}g, required ${metalIn.toFixed(3)}g`
          );
        }
        const karigarCustodyAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `KARIGAR_CUSTODY_${karigar.id}`,
          `Karigar Custody - ${karigar.name} (${karigar.karigarCode})`,
          "KARIGAR_CUSTODY",
          null,
          karigar.id
        );
        const issueFine = calculateFineEquivalent(metalIn, order.touchSnapshot);
        const issueJtx = await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "ORDER_METAL_ISSUE",
          businessDate,
          purity,
          physicalWeight: metalIn,
          fineEquivalentWeight: issueFine,
          sourceAccount: adminPoolAcct,
          destinationAccount: karigarCustodyAcct,
          sourceReference: `BAG-${order.bagNumber}`,
          reason: `Issued ${metalIn.toFixed(3)}g to Bag #${order.bagNumber} (${currentProc.processType})`,
          orderId: order.id,
          orderProcessId: currentProc.id,
          karigarId: karigar.id,
          idempotencyKey: `auto_issue_${input.idempotencyKey}`,
        });

        await tx.createMetalMovement({
          id: newId("mmov"),
          organizationId: validActor.organizationId,
          orderId: order.id,
          orderProcessId: currentProc.id,
          processVisitId: null,
          movementType: "ADMIN_ISSUE_TO_ORDER",
          fromProcessType: null,
          toProcessType: currentProc.processType,
          karigarId: karigar.id,
          businessDate,
          grossWeight: grossIn,
          nonGoldWeight: nonGoldIn,
          netMetalWeight: metalIn,
          touchSnapshot: order.touchSnapshot,
          fineEquivalentWeight: issueFine,
          journalTransactionId: issueJtx.id,
          idempotencyKey: `mmov_issue_${input.idempotencyKey}`,
          notes: "Issued from Admin Stock",
          createdById: validActor.userId,
          createdAt: new Date(),
        });

        currentProc = await tx.updateOrderProcess({
          ...currentProc,
          assignedKarigarId: karigar.id,
          status: "IN_PROGRESS",
          issuedMetalWeight: metalIn,
          custodyMetalWeight: metalIn,
          latestGrossInWeight: grossIn,
          updatedAt: new Date(),
        });

        activeOrder = await tx.updateOrder({
          ...activeOrder,
          status: "IN_PROCESS",
          initialIssuedMetalWeight: roundInternal(
            activeOrder.initialIssuedMetalWeight.add(metalIn)
          ),
          updatedAt: new Date(),
        });
      }

      // Validate that metalIn matches the custody available in this process
      if (!metalIn.eq(currentProc.custodyMetalWeight)) {
        throw new ValidationError(
          `Process ${currentProc.processType} custody mismatch: expected metalIn ${currentProc.custodyMetalWeight.toFixed(
            3
          )}g, received ${metalIn.toFixed(3)}g`
        );
      }

      const extraMetal =
        input.extraMetalReturnedWeight !== undefined &&
        input.extraMetalReturnedWeight !== ""
          ? roundInternal(input.extraMetalReturnedWeight)
          : ZERO;
      if (extraMetal.lt(ZERO)) {
        throw new ValidationError(
          "Extra metal returned weight cannot be negative"
        );
      }

      let extraTargetPurity = purity;
      let extraTouch = roundTouch(activeOrder.touchSnapshot);
      if (extraMetal.gt(ZERO)) {
        if (input.extraMetalPurityId) {
          const found = await tx.getPurityById(
            validActor.organizationId,
            input.extraMetalPurityId
          );
          if (!found) {
            throw new NotFoundError(
              `Extra metal purity ${input.extraMetalPurityId} not found`
            );
          }
          extraTargetPurity = found;
          extraTouch =
            input.extraMetalTouchPercent !== undefined &&
            input.extraMetalTouchPercent !== ""
              ? roundTouch(input.extraMetalTouchPercent)
              : roundTouch(found.touchPercent);
        } else if (
          input.extraMetalTouchPercent !== undefined &&
          input.extraMetalTouchPercent !== ""
        ) {
          extraTouch = roundTouch(input.extraMetalTouchPercent);
          if (!extraTouch.eq(roundTouch(purity.touchPercent))) {
            const allPurities = await tx.listPurities(
              validActor.organizationId
            );
            const matched = allPurities.find(
              (p) => p.isActive && roundTouch(p.touchPercent).eq(extraTouch)
            );
            if (!matched) {
              throw new ValidationError(
                `No active purity category matches touch ${extraTouch.toFixed(
                  2
                )}%. Please select a target purity category.`
              );
            }
            extraTargetPurity = matched;
          }
        }
        if (extraTouch.lte(ZERO) || extraTouch.gt(new Decimal(100))) {
          throw new ValidationError(
            "Extra metal touch % must be greater than 0 and at most 100"
          );
        }
      }

      const extraFine = extraMetal.gt(ZERO)
        ? calculateFineEquivalent(extraMetal, extraTouch)
        : ZERO;
      const isSameTouch =
        extraMetal.isZero() ||
        (extraTouch.eq(roundTouch(activeOrder.touchSnapshot)) &&
          extraTargetPurity.id === purity.id);
      const orderTouchRatio = roundTouch(activeOrder.touchSnapshot).div(100);
      const extraOrderEquiv = isSameTouch
        ? extraMetal
        : roundInternal(extraFine.div(orderTouchRatio));

      const custodyRetained = closeProcess
        ? ZERO
        : input.custodyRetainedMetalWeight !== undefined
        ? roundInternal(input.custodyRetainedMetalWeight)
        : roundInternal(metalIn.sub(metalOut).sub(extraOrderEquiv));

      if (custodyRetained.lt(ZERO)) {
        throw new ValidationError("Custody retained metal weight cannot be negative");
      }

      // Standard process calculation:
      // Same touch: processLoss = metalIn - metalOut - extraMetal - custodyRetained
      // Different touch: fineLoss = fine(metalIn) - fine(metalOut) - fine(extraMetal) - fine(custodyRetained)
      let rawLoss: Decimal;
      let fineLoss: Decimal;
      let isLockFittingAdjustment = false;
      if (isSameTouch) {
        rawLoss = roundInternal(
          metalIn.sub(metalOut).sub(extraMetal).sub(custodyRetained)
        );
        if (rawLoss.lt(ZERO)) {
          if (!input.adjustAgainstKarigarBalance || !extraMetal.isZero()) {
            throw new ValidationError(
              `Unexplained weight gain / negative process loss (${rawLoss.toFixed(
                3
              )}g) is blocked: metalOut (${metalOut.toFixed(
                3
              )}g) + extraMetalReturned (${extraMetal.toFixed(
                3
              )}g) + custodyRetained (${custodyRetained.toFixed(
                3
              )}g) exceeds metalIn (${metalIn.toFixed(3)}g)`
            );
          }
          isLockFittingAdjustment = true;
        }
        fineLoss = calculateFineEquivalent(rawLoss, activeOrder.touchSnapshot);
      } else {
        const metalInFine = calculateFineEquivalent(
          metalIn,
          activeOrder.touchSnapshot
        );
        const metalOutFine = calculateFineEquivalent(
          metalOut,
          activeOrder.touchSnapshot
        );
        const custodyRetainedFine = calculateFineEquivalent(
          custodyRetained,
          activeOrder.touchSnapshot
        );
        fineLoss = roundInternal(
          metalInFine.sub(metalOutFine).sub(extraFine).sub(custodyRetainedFine)
        );
        if (fineLoss.lt(ZERO)) {
          if (!input.adjustAgainstKarigarBalance || !extraMetal.isZero()) {
            throw new ValidationError(
              `Unexplained fine weight gain / negative process loss (${fineLoss.toFixed(
                3
              )}g fine) is blocked: returned fine + extra fine + custody fine exceeds metalIn fine (${metalInFine.toFixed(
                3
              )}g)`
            );
          }
          isLockFittingAdjustment = true;
        }
        rawLoss = roundInternal(fineLoss.div(orderTouchRatio));
      }

      // Reconciliation check:
      // issuedMetal = returnedMetal + extraReturnedMetal + closedProcessLoss + metalStillInCustody
      const cumulativeReturned = roundInternal(
        currentProc.returnedMetalWeight.add(metalOut)
      );
      const cumulativeExtraReturned = roundInternal(
        currentProc.extraReturnedMetalWeight.add(extraMetal)
      );
      const cumulativeLoss = roundInternal(
        currentProc.closedLossWeight.add(rawLoss)
      );
      if (isSameTouch && currentProc.extraReturnedMetalWeight.isZero()) {
        const reconciledSum = roundInternal(
          cumulativeReturned
            .add(cumulativeExtraReturned)
            .add(cumulativeLoss)
            .add(custodyRetained)
        );
        if (!reconciledSum.eq(currentProc.issuedMetalWeight)) {
          throw new ValidationError(
            `Process reconciliation failed for ${currentProc.processType}: issuedMetal (${currentProc.issuedMetalWeight.toFixed(
              3
            )}g) != returnedMetal (${cumulativeReturned.toFixed(
              3
            )}g) + extraReturned (${cumulativeExtraReturned.toFixed(
              3
            )}g) + closedProcessLoss (${cumulativeLoss.toFixed(
              3
            )}g) + metalStillInCustody (${custodyRetained.toFixed(3)}g)`
          );
        }
      } else {
        const expectedTotal = roundInternal(
          metalOut.add(extraOrderEquiv).add(rawLoss).add(custodyRetained)
        );
        if (expectedTotal.sub(metalIn).abs().gt(new Decimal("0.002"))) {
          throw new ValidationError(
            `Process fine-equivalent reconciliation failed for ${currentProc.processType}`
          );
        }
      }

      if (closeProcess && !custodyRetained.isZero()) {
        throw new ValidationError(
          `Cannot close process ${currentProc.processType} while ${custodyRetained.toFixed(
            3
          )}g remains in karigar custody`
        );
      }
      const existingVisits = await tx.listProcessVisits(
        validActor.organizationId,
        activeOrder.id
      );
      const procVisits = existingVisits.filter(
        (v) => v.orderProcessId === currentProc.id
      );
      const now = new Date();

      const visit = await tx.createProcessVisit({
        id: newId("pvis"),
        organizationId: validActor.organizationId,
        orderId: activeOrder.id,
        orderProcessId: currentProc.id,
        visitNumber: procVisits.length + 1,
        karigarId: karigar.id,
        businessDate,
        status: closeProcess ? "CLOSED" : "PARTIAL",
        grossInWeight: grossIn,
        nonGoldInWeight: nonGoldIn,
        metalInWeight: metalIn,
        grossOutWeight: grossOut,
        nonGoldOutWeight: nonGoldOut,
        metalOutWeight: metalOut,
        extraMetalReturnedWeight: extraMetal,
        extraMetalTouchPercent: extraMetal.gt(ZERO) ? extraTouch : null,
        extraMetalPurityId: extraMetal.gt(ZERO) ? extraTargetPurity.id : null,
        extraMetalFineWeight: extraFine,
        custodyRemainingWeight: custodyRetained,
        rawLossWeight: rawLoss,
        touchSnapshot: activeOrder.touchSnapshot,
        fineLossWeight: fineLoss,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey,
        createdById: validActor.userId,
        createdAt: now,
        updatedAt: now,
      });

      // Record stone component entries (AD, KL, etc.)
      for (const sc of stoneEntriesToCreate) {
        await tx.createStoneComponentEntry({
          id: newId("stn"),
          organizationId: validActor.organizationId,
          orderId: activeOrder.id,
          orderProcessId: currentProc.id,
          processVisitId: visit.id,
          componentType: sc.componentType.trim().toUpperCase(),
          direction: sc.direction ?? "ADDED",
          sizeLabel: sc.sizeLabel?.trim() || null,
          pieces: sc.pieces,
          weightGrams: roundInternal(sc.weightGrams),
          notes: sc.notes?.trim() || null,
          createdById: validActor.userId,
          createdAt: now,
        });
      }

      const karigarCustodyAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `KARIGAR_CUSTODY_${karigar.id}`,
        `Karigar Custody - ${karigar.name} (${karigar.karigarCode})`,
        "KARIGAR_CUSTODY",
        null,
        karigar.id
      );

      // If this process had custody assigned to a previous karigar (e.g. from the prior stage close)
      // and the operator selected a different karigar on this stage without calling giveWorkToProcess first,
      // transfer custody from the previous karigar's custody account to the selected karigar's custody account.
      if (
        currentProc.assignedKarigarId &&
        currentProc.assignedKarigarId !== karigar.id &&
        currentProc.custodyMetalWeight.gt(ZERO)
      ) {
        const prevCustodyAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `KARIGAR_CUSTODY_${currentProc.assignedKarigarId}`,
          `Karigar Custody - ${currentProc.assignedKarigarId}`,
          "KARIGAR_CUSTODY",
          null,
          currentProc.assignedKarigarId
        );
        const reassignFine = calculateFineEquivalent(
          currentProc.custodyMetalWeight,
          activeOrder.touchSnapshot
        );
        await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "PROCESS_CUSTODY_TRANSFER",
          businessDate,
          purity,
          physicalWeight: currentProc.custodyMetalWeight,
          fineEquivalentWeight: reassignFine,
          sourceAccount: prevCustodyAcct,
          destinationAccount: karigarCustodyAcct,
          sourceReference: `BAG-${activeOrder.bagNumber}-${currentProc.processType}-REASSIGN`,
          reason: `Assigned ${currentProc.processType} of Bag #${activeOrder.bagNumber} to ${karigar.name}`,
          orderId: activeOrder.id,
          orderProcessId: currentProc.id,
          karigarId: karigar.id,
          idempotencyKey: `reassign_jnl_${input.idempotencyKey}`,
        });
      }

      if (extraMetal.gt(ZERO)) {
        const adminExtraPoolAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `ADMIN_POOL_${extraTargetPurity.code}`,
          `Admin Stock Pool - ${extraTargetPurity.displayLabel}`,
          "ADMIN_KARAT_POOL",
          extraTargetPurity.id,
          null
        );
        const freshKarigarCustody = (await tx.getStockAccountById(
          validActor.organizationId,
          karigarCustodyAcct.id
        ))!;
        let extraJtx: JournalTransactionEntity;
        if (isSameTouch) {
          extraJtx = await this.postBalancedJournalEntry(tx, {
            organizationId: validActor.organizationId,
            actorId: validActor.userId,
            transactionType: "EXTRA_METAL_RETURN",
            businessDate,
            purity: extraTargetPurity,
            physicalWeight: extraMetal,
            fineEquivalentWeight: extraFine,
            sourceAccount: freshKarigarCustody,
            destinationAccount: adminExtraPoolAcct,
            sourceReference: `BAG-${activeOrder.bagNumber}-${currentProc.processType}-EXTRA`,
            reason: `Extra metal returned (${extraMetal.toFixed(3)}g @ ${extraTouch.toFixed(2)}%) from ${currentProc.processType} of Bag #${activeOrder.bagNumber}`,
            orderId: activeOrder.id,
            orderProcessId: currentProc.id,
            processVisitId: visit.id,
            karigarId: karigar.id,
            idempotencyKey: `extra_ret_jnl_${input.idempotencyKey}`,
          });
        } else {
          const existingExtraJtx =
            await tx.getJournalTransactionByIdempotencyKey(
              `extra_ret_jnl_${input.idempotencyKey}`
            );
          if (existingExtraJtx) {
            extraJtx = existingExtraJtx;
          } else {
            const jtxId = newId("jtx");
            extraJtx = await tx.createJournalTransaction({
              id: jtxId,
              organizationId: validActor.organizationId,
              transactionNumber: `JNL-${now.getTime().toString().slice(-6)}-${jtxId.slice(-4).toUpperCase()}`,
              transactionType: "EXTRA_METAL_RETURN",
              businessDate,
              purityId: extraTargetPurity.id,
              touchSnapshot: extraTouch,
              physicalWeight: extraMetal,
              fineEquivalentWeight: extraFine,
              sourceReference: `BAG-${activeOrder.bagNumber}-${currentProc.processType}-EXTRA`,
              reason: `Extra metal returned (${extraMetal.toFixed(3)}g @ ${extraTouch.toFixed(2)}%, order touch ${activeOrder.touchSnapshot.toFixed(2)}%) from ${currentProc.processType} of Bag #${activeOrder.bagNumber}`,
              orderId: activeOrder.id,
              orderProcessId: currentProc.id,
              processVisitId: visit.id,
              karigarId: karigar.id,
              idempotencyKey: `extra_ret_jnl_${input.idempotencyKey}`,
              reversalOfTransactionId: null,
              isReversed: false,
              actorId: validActor.userId,
              createdAt: now,
            });
            await tx.createJournalLine({
              id: newId("jln"),
              organizationId: validActor.organizationId,
              journalTransactionId: extraJtx.id,
              accountId: freshKarigarCustody.id,
              direction: "CREDIT_OUT" as JournalLineDirection,
              signedPhysicalDelta: extraOrderEquiv.negated(),
              touchSnapshot: activeOrder.touchSnapshot,
              signedFineDelta: extraFine.negated(),
              orderId: activeOrder.id,
              orderProcessId: currentProc.id,
              karigarId: karigar.id,
              description: `Extra metal return out from ${freshKarigarCustody.accountCode} (${extraFine.toFixed(3)}g fine)`,
              createdAt: now,
            });
            await tx.updateStockAccountBalances(
              freshKarigarCustody.id,
              roundInternal(
                freshKarigarCustody.cachedPhysicalBalance.sub(extraOrderEquiv)
              ),
              roundInternal(
                freshKarigarCustody.cachedFineBalance.sub(extraFine)
              )
            );
            await tx.createJournalLine({
              id: newId("jln"),
              organizationId: validActor.organizationId,
              journalTransactionId: extraJtx.id,
              accountId: adminExtraPoolAcct.id,
              direction: "DEBIT_IN" as JournalLineDirection,
              signedPhysicalDelta: extraMetal,
              touchSnapshot: extraTouch,
              signedFineDelta: extraFine,
              orderId: activeOrder.id,
              orderProcessId: currentProc.id,
              karigarId: karigar.id,
              description: `Extra metal return to ${adminExtraPoolAcct.accountCode} (${extraMetal.toFixed(3)}g @ ${extraTouch.toFixed(2)}%)`,
              createdAt: now,
            });
            await tx.updateStockAccountBalances(
              adminExtraPoolAcct.id,
              roundInternal(
                adminExtraPoolAcct.cachedPhysicalBalance.add(extraMetal)
              ),
              roundInternal(adminExtraPoolAcct.cachedFineBalance.add(extraFine))
            );
          }
        }

        await tx.createMetalMovement({
          id: newId("mmov"),
          organizationId: validActor.organizationId,
          orderId: activeOrder.id,
          orderProcessId: currentProc.id,
          processVisitId: visit.id,
          movementType: "EXTRA_METAL_RETURN",
          fromProcessType: currentProc.processType,
          toProcessType: null,
          karigarId: karigar.id,
          businessDate,
          grossWeight: extraMetal,
          nonGoldWeight: ZERO,
          netMetalWeight: extraMetal,
          touchSnapshot: extraTouch,
          fineEquivalentWeight: extraFine,
          journalTransactionId: extraJtx.id,
          idempotencyKey: `mmov_extra_ret_${input.idempotencyKey}`,
          notes: input.notes ?? `Extra metal returned (${extraTargetPurity.displayLabel})`,
          createdById: validActor.userId,
          createdAt: now,
        });
      }

      // Post Process Loss Record OR Lock-Fitting Balance Adjustment
      let lossRecord: ProcessLossRecordEntity | null = null;
      if (isLockFittingAdjustment && rawLoss.lt(ZERO)) {
        const weightGain = rawLoss.abs();
        const fineGain = fineLoss.abs();
        const [orderLosses, allAllocs, allWriteOffs, allMakingDeds] =
          await Promise.all([
            tx.listProcessLossRecords(validActor.organizationId, activeOrder.id),
            tx.listRecoveryAllocations(validActor.organizationId),
            tx.listLossWriteOffs(validActor.organizationId),
            tx.listMakingDeductionAllocations(validActor.organizationId),
          ]);
        const unsettledForProc = orderLosses
          .filter(
            (lr) =>
              lr.orderProcessId === currentProc.id &&
              lr.karigarId === karigar.id &&
              lr.eligibilityStatus !== "VOIDED"
          )
          .map((lr) => ({
            loss: lr,
            ...this.computeLossBalances(lr, allAllocs, allWriteOffs, allMakingDeds),
          }))
          .filter((item) => item.outstandingFine.gt(ZERO));

        const totalUnsettledFine = unsettledForProc.reduce(
          (s, item) => roundInternal(s.add(item.outstandingFine)),
          ZERO
        );
        if (totalUnsettledFine.add(new Decimal("0.0001")).lt(fineGain)) {
          throw new ValidationError(
            `Cannot adjust +${weightGain.toFixed(3)}g (${fineGain.toFixed(
              3
            )}g fine) against ${karigar.name}'s ${currentProc.processType} balance: only ${totalUnsettledFine.toFixed(
              3
            )}g fine unsettled loss remains on this process.`
          );
        }

        const lossPoolAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `PROCESS_LOSS_${purity.code}`,
          `Process Loss Account - ${purity.displayLabel}`,
          "PROCESS_LOSS",
          purity.id,
          null
        );
        await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "FILING_CORRECTION",
          businessDate,
          purity,
          physicalWeight: weightGain,
          fineEquivalentWeight: fineGain,
          sourceAccount: lossPoolAcct,
          destinationAccount: karigarCustodyAcct,
          sourceReference: `BAG-${activeOrder.bagNumber}-${currentProc.processType}-ADJ`,
          reason: `Lock-fitting / repairing return (+${weightGain.toFixed(
            3
          )}g) into Bag #${activeOrder.bagNumber} reducing ${karigar.name}'s ${currentProc.processType} loss`,
          orderId: activeOrder.id,
          orderProcessId: currentProc.id,
          processVisitId: visit.id,
          karigarId: karigar.id,
          idempotencyKey: `loss_adj_jnl_${input.idempotencyKey}`,
        });

        let remToReduce = fineGain;
        for (let idx = 0; idx < unsettledForProc.length && remToReduce.gt(ZERO); idx++) {
          const item = unsettledForProc[idx];
          const applyFine = Decimal.min(remToReduce, item.outstandingFine);
          await tx.createLossWriteOff({
            id: newId("lwo"),
            organizationId: validActor.organizationId,
            processLossRecordId: item.loss.id,
            karigarId: karigar.id,
            writtenOffFineWeight: roundInternal(applyFine),
            businessDate,
            reason: `LOCK_FITTING_RETURN: +${weightGain.toFixed(
              3
            )}g returned into order on Visit #${visit.visitNumber}`,
            status: "ACTIVE",
            idempotencyKey: `lf_adj_${input.idempotencyKey}_${idx}`,
            createdById: validActor.userId,
            createdAt: now,
            reversedAt: null,
            reversalReason: null,
          });
          remToReduce = roundInternal(remToReduce.sub(applyFine));
        }
      } else if (closeProcess || rawLoss.gt(ZERO)) {
        let lossJtxId: string | null = null;
        if (rawLoss.gt(ZERO)) {
          const lossPoolAcct = await this.ensureSystemAccount(
            tx,
            validActor.organizationId,
            `PROCESS_LOSS_${purity.code}`,
            `Process Loss Account - ${purity.displayLabel}`,
            "PROCESS_LOSS",
            purity.id,
            null
          );
          const lossJtx = await this.postBalancedJournalEntry(tx, {
            organizationId: validActor.organizationId,
            actorId: validActor.userId,
            transactionType: "PROCESS_LOSS_RECOGNITION",
            businessDate,
            purity,
            physicalWeight: rawLoss,
            fineEquivalentWeight: fineLoss,
            sourceAccount: karigarCustodyAcct,
            destinationAccount: lossPoolAcct,
            sourceReference: `BAG-${activeOrder.bagNumber}-${currentProc.processType}`,
            reason: `Process loss in ${currentProc.processType} for Bag #${activeOrder.bagNumber}`,
            orderId: activeOrder.id,
            orderProcessId: currentProc.id,
            processVisitId: visit.id,
            karigarId: karigar.id,
            idempotencyKey: `loss_jnl_${input.idempotencyKey}`,
          });
          lossJtxId = lossJtx.id;
        }

        // New Rule 1: A finalized loss becomes eligible immediately when that individual process visit is closed and reconciled.
        // Partial returns (closeProcess === false) remain PENDING_ORDER_COMPLETION until the process visit closes.
        lossRecord = await tx.createProcessLossRecord({
          id: newId("loss"),
          organizationId: validActor.organizationId,
          orderId: activeOrder.id,
          orderProcessId: currentProc.id,
          processVisitId: visit.id,
          karigarId: karigar.id,
          processType: currentProc.processType,
          businessDate,
          rawMetalLossWeight: rawLoss,
          touchSnapshot: activeOrder.touchSnapshot,
          fineEquivalentLossWeight: fineLoss,
          eligibilityStatus: closeProcess ? "ELIGIBLE" : "PENDING_ORDER_COMPLETION",
          journalTransactionId: lossJtxId,
          eligibleAt: closeProcess ? now : null,
          notes: input.notes ?? null,
          createdById: validActor.userId,
          createdAt: now,
          updatedAt: now,
        });

        // Outsourced Noksi loss can be settled immediately at return when chosen, or left ELIGIBLE for Recovery later
        if (
          currentProc.processType === "NOKSI" &&
          input.settleNoksiImmediately &&
          closeProcess &&
          fineLoss.gt(ZERO)
        ) {
          await tx.createLossWriteOff({
            id: newId("lwo"),
            organizationId: validActor.organizationId,
            processLossRecordId: lossRecord.id,
            karigarId: karigar.id,
            writtenOffFineWeight: fineLoss,
            businessDate,
            reason: "NOKSI_OUTSOURCE_SETTLED: Outsourced Noksi making/loss settled immediately",
            status: "ACTIVE",
            idempotencyKey: `noksi_settled_${input.idempotencyKey}`,
            createdById: validActor.userId,
            createdAt: now,
            reversedAt: null,
            reversalReason: null,
          });
        }
      }

      const updatedProc = await tx.updateOrderProcess({
        ...currentProc,
        assignedKarigarId: karigar.id,
        status: closeProcess ? "CLOSED" : "PARTIAL_RETURN",
        returnedMetalWeight: cumulativeReturned,
        extraReturnedMetalWeight: cumulativeExtraReturned,
        closedLossWeight: cumulativeLoss,
        custodyMetalWeight: custodyRetained,
        carriedStoneInWeight: nonGoldIn,
        addedStoneWeight: roundInternal(
          currentProc.addedStoneWeight.add(addedStoneWeight)
        ),
        removedStoneWeight: roundInternal(
          currentProc.removedStoneWeight.add(removedStoneWeight)
        ),
        carriedStoneOutWeight: nonGoldOut,
        latestGrossInWeight: grossIn,
        latestGrossOutWeight: grossOut,
        closedAt: closeProcess ? now : null,
        closedById: closeProcess ? validActor.userId : null,
        updatedAt: now,
      });

      await tx.createMetalMovement({
        id: newId("mmov"),
        organizationId: validActor.organizationId,
        orderId: activeOrder.id,
        orderProcessId: currentProc.id,
        processVisitId: visit.id,
        movementType: closeProcess
          ? "KARIGAR_FINAL_RETURN"
          : "KARIGAR_PARTIAL_RETURN",
        fromProcessType: currentProc.processType,
        toProcessType: null,
        karigarId: karigar.id,
        businessDate,
        grossWeight: grossOut,
        nonGoldWeight: nonGoldOut,
        netMetalWeight: metalOut,
        touchSnapshot: activeOrder.touchSnapshot,
        fineEquivalentWeight: calculateFineEquivalent(
          metalOut,
          activeOrder.touchSnapshot
        ),
        journalTransactionId: null,
        idempotencyKey: `mmov_ret_${input.idempotencyKey}`,
        notes: input.notes ?? null,
        createdById: validActor.userId,
        createdAt: now,
      });

      // Rule 8: Any-to-any process routing when this process closes.
      // If nextProcessType === "COMPLETE", do not hand off to another process (ready for order completion).
      // If nextProcessType is specified, route to that process (reopening if previously closed, or creating if not yet on order).
      // If omitted, default to the next sequential process on the order.
      let nextProc: OrderProcessEntity | null = null;
      if (closeProcess && input.nextProcessType !== "COMPLETE") {
        let rawNext: OrderProcessEntity | null = null;
        if (input.nextProcessType) {
          const existingTarget = processes.find(
            (p) => p.processType === input.nextProcessType
          );
          if (existingTarget) {
            rawNext = existingTarget;
          } else {
            const canonicalSeq =
              CANONICAL_PROCESS_SEQUENCE.indexOf(input.nextProcessType) + 1;
            const maxSeq = processes.reduce(
              (m, p) => Math.max(m, p.sequenceOrder),
              0
            );
            rawNext = await tx.createOrderProcess({
              id: newId("oproc"),
              organizationId: validActor.organizationId,
              orderId: activeOrder.id,
              processType: input.nextProcessType,
              canonicalSequence: canonicalSeq || maxSeq + 1,
              sequenceOrder: maxSeq + 1,
              assignedKarigarId: input.nextKarigarId || karigar.id,
              status: "PENDING",
              issuedMetalWeight: ZERO,
              returnedMetalWeight: ZERO,
              extraReturnedMetalWeight: ZERO,
              closedLossWeight: ZERO,
              custodyMetalWeight: ZERO,
              carriedStoneInWeight: ZERO,
              addedStoneWeight: ZERO,
              removedStoneWeight: ZERO,
              carriedStoneOutWeight: ZERO,
              latestGrossInWeight: ZERO,
              latestGrossOutWeight: ZERO,
              closedAt: null,
              closedById: null,
              createdAt: now,
              updatedAt: now,
            });
          }
        } else if (procIndex + 1 < processes.length) {
          rawNext = processes[procIndex + 1];
        }

        if (rawNext) {
          const nextKarigarId = input.nextKarigarId || karigar.id;
          const nextKarigar = await tx.getKarigarById(
            validActor.organizationId,
            nextKarigarId
          );
          if (!nextKarigar) {
            throw new NotFoundError(`Next karigar ${nextKarigarId} not found`);
          }

          const nextCustodyAcct = await this.ensureSystemAccount(
            tx,
            validActor.organizationId,
            `KARIGAR_CUSTODY_${nextKarigar.id}`,
            `Karigar Custody - ${nextKarigar.name} (${nextKarigar.karigarCode})`,
            "KARIGAR_CUSTODY",
            null,
            nextKarigar.id
          );

          const transferFine = calculateFineEquivalent(
            metalOut,
            activeOrder.touchSnapshot
          );

          const transferJtx = await this.postBalancedJournalEntry(tx, {
            organizationId: validActor.organizationId,
            actorId: validActor.userId,
            transactionType: "PROCESS_CUSTODY_TRANSFER",
            businessDate,
            purity,
            physicalWeight: metalOut,
            fineEquivalentWeight: transferFine,
            sourceAccount: karigarCustodyAcct,
            destinationAccount: nextCustodyAcct,
            sourceReference: `BAG-${activeOrder.bagNumber}-${currentProc.processType}-TO-${rawNext.processType}`,
            reason: `Stage transfer ${currentProc.processType} -> ${rawNext.processType} for Bag #${activeOrder.bagNumber}`,
            orderId: activeOrder.id,
            orderProcessId: rawNext.id,
            processVisitId: visit.id,
            karigarId: nextKarigar.id,
            idempotencyKey: `xfer_jnl_${input.idempotencyKey}`,
          });

          await tx.createMetalMovement({
            id: newId("mmov"),
            organizationId: validActor.organizationId,
            orderId: activeOrder.id,
            orderProcessId: rawNext.id,
            processVisitId: visit.id,
            movementType: "PROCESS_TRANSFER",
            fromProcessType: currentProc.processType,
            toProcessType: rawNext.processType,
            karigarId: nextKarigar.id,
            businessDate,
            grossWeight: grossOut,
            nonGoldWeight: nonGoldOut,
            netMetalWeight: metalOut,
            touchSnapshot: activeOrder.touchSnapshot,
            fineEquivalentWeight: transferFine,
            journalTransactionId: transferJtx.id,
            idempotencyKey: `mmov_xfer_${input.idempotencyKey}`,
            notes: `Transferred from ${currentProc.processType} to ${rawNext.processType}`,
            createdById: validActor.userId,
            createdAt: now,
          });

          nextProc = await tx.updateOrderProcess({
            ...rawNext,
            assignedKarigarId: nextKarigar.id,
            status: input.nextKarigarId ? "IN_PROGRESS" : "PENDING",
            issuedMetalWeight: roundInternal(rawNext.issuedMetalWeight.add(metalOut)),
            custodyMetalWeight: metalOut,
            carriedStoneInWeight: nonGoldOut,
            carriedStoneOutWeight: nonGoldOut,
            latestGrossInWeight: grossOut,
            closedAt: null,
            closedById: null,
            updatedAt: now,
          });
        }
      }

      const updatedOrder = await tx.updateOrder({
        ...activeOrder,
        status: "IN_PROCESS",
        retainedStoneWeight: nonGoldOut,
        totalRawLossWeight: roundInternal(
          activeOrder.totalRawLossWeight.add(rawLoss)
        ),
        totalFineLossWeight: roundInternal(
          activeOrder.totalFineLossWeight.add(fineLoss)
        ),
        updatedAt: now,
      });

      return {
        visit,
        process: updatedProc,
        nextProcess: nextProc,
        lossRecord,
        order: updatedOrder,
      };
    });
  }

  public async reverseProcessVisit(
    actor: ActorContext,
    input: {
      orderId: string;
      visitId: string;
      reason: string;
      businessDate?: string | Date;
      idempotencyKey: string;
    }
  ): Promise<{
    visit: ProcessVisitEntity;
    process: OrderProcessEntity;
    order: OrderEntity;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Reason is required to reverse a process visit");
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        throw new ConflictError(
          `Cannot reverse a process visit on ${order.status} order Bag #${order.bagNumber}`
        );
      }

      const visits = await tx.listProcessVisits(
        validActor.organizationId,
        order.id
      );
      const visit = visits.find((v) => v.id === input.visitId);
      if (!visit) {
        throw new NotFoundError(`Process visit ${input.visitId} not found`);
      }

      const processes = await tx.listOrderProcesses(
        validActor.organizationId,
        order.id
      );
      const currentProc = processes.find((p) => p.id === visit.orderProcessId);
      if (!currentProc) {
        throw new NotFoundError(`Order process ${visit.orderProcessId} not found`);
      }

      if (visit.status === "REVERSED") {
        return { visit, process: currentProc, order };
      }

      const downstreamStarted = processes.some(
        (p) =>
          p.sequenceOrder > currentProc.sequenceOrder && p.status !== "PENDING"
      );
      if (downstreamStarted) {
        throw new ConflictError(
          `Cannot reverse ${currentProc.processType} visit: downstream process has already started`
        );
      }

      const activeProcVisits = visits.filter(
        (v) => v.orderProcessId === currentProc.id && v.status !== "REVERSED"
      );
      const latestActiveVisit = activeProcVisits[activeProcVisits.length - 1];
      if (!latestActiveVisit || latestActiveVisit.id !== visit.id) {
        throw new ConflictError(
          "Only the latest active visit on a process can be reversed"
        );
      }

      const lossRecords = await tx.listProcessLossRecords(
        validActor.organizationId,
        order.id
      );
      const visitLoss = lossRecords.find(
        (lr) => lr.processVisitId === visit.id && lr.eligibilityStatus !== "VOIDED"
      );
      if (visitLoss) {
        const allocations = await tx.listRecoveryAllocations(
          validActor.organizationId,
          { processLossRecordId: visitLoss.id }
        );
        if (allocations.some((a) => a.status === "ACTIVE")) {
          throw new ConflictError(
            "Loss has already been recovered; reverse those recovery settlements explicitly before reversing this process visit"
          );
        }
        const writeOffs = await tx.listLossWriteOffs(
          validActor.organizationId,
          { processLossRecordId: visitLoss.id }
        );
        const nonAutoWriteOffs = writeOffs.filter(
          (w) =>
            w.status === "ACTIVE" &&
            !w.idempotencyKey.startsWith("noksi_settled_") &&
            !w.idempotencyKey.startsWith("lf_adj_")
        );
        if (nonAutoWriteOffs.length > 0) {
          throw new ConflictError(
            "Loss has already been written off; reverse those write-offs explicitly before reversing this process visit"
          );
        }
        for (const w of writeOffs) {
          if (w.status === "ACTIVE" && w.idempotencyKey.startsWith("noksi_settled_")) {
            await tx.updateLossWriteOff({
              ...w,
              status: "REVERSED",
              reversedAt: new Date(),
              reversalReason: reason,
            });
          }
        }
      }

      const purity = await tx.getPurityById(
        validActor.organizationId,
        order.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${order.purityId} not found`);
      }

      const karigarCustodyAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `KARIGAR_CUSTODY_${visit.karigarId}`,
        `Karigar Custody - ${visit.karigarId}`,
        "KARIGAR_CUSTODY",
        null,
        visit.karigarId
      );

      const now = new Date();
      // 1. Reverse extra metal return if posted
      if (visit.extraMetalReturnedWeight.gt(ZERO)) {
        const extraPurity = visit.extraMetalPurityId
          ? (await tx.getPurityById(
              validActor.organizationId,
              visit.extraMetalPurityId
            )) ?? purity
          : purity;
        const adminExtraPoolAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `ADMIN_POOL_${extraPurity.code}`,
          `Admin Stock Pool - ${extraPurity.displayLabel}`,
          "ADMIN_KARAT_POOL",
          extraPurity.id,
          null
        );
        if (
          adminExtraPoolAcct.cachedPhysicalBalance.lt(
            visit.extraMetalReturnedWeight
          )
        ) {
          throw new ValidationError(
            `Insufficient downstream stock in ${extraPurity.displayLabel} (${adminExtraPoolAcct.cachedPhysicalBalance.toFixed(
              3
            )}g) to reverse extra metal return (${visit.extraMetalReturnedWeight.toFixed(
              3
            )}g)`
          );
        }
        const extraTouch = visit.extraMetalTouchPercent ?? order.touchSnapshot;
        const extraFine = visit.extraMetalFineWeight;
        const orderTouchRatio = roundTouch(order.touchSnapshot).div(100);
        const extraOrderEquiv =
          extraPurity.id === purity.id &&
          roundTouch(extraTouch).eq(roundTouch(order.touchSnapshot))
            ? visit.extraMetalReturnedWeight
            : roundInternal(extraFine.div(orderTouchRatio));

        const revJtxId = newId("jtx");
        const revJtx = await tx.createJournalTransaction({
          id: revJtxId,
          organizationId: validActor.organizationId,
          transactionNumber: `JNL-${now.getTime().toString().slice(-6)}-${revJtxId.slice(-4).toUpperCase()}`,
          transactionType: "CONTROLLED_REVERSAL",
          businessDate,
          purityId: extraPurity.id,
          touchSnapshot: extraTouch,
          physicalWeight: visit.extraMetalReturnedWeight,
          fineEquivalentWeight: extraFine,
          sourceReference: `REV-BAG-${order.bagNumber}-${currentProc.processType}-EXTRA`,
          reason: `Reverse extra metal return (${visit.extraMetalReturnedWeight.toFixed(3)}g): ${reason}`,
          orderId: order.id,
          orderProcessId: currentProc.id,
          processVisitId: visit.id,
          karigarId: visit.karigarId,
          idempotencyKey: `rev_extra_${input.idempotencyKey}`,
          reversalOfTransactionId: null,
          isReversed: false,
          actorId: validActor.userId,
          createdAt: now,
        });
        await tx.createJournalLine({
          id: newId("jln"),
          organizationId: validActor.organizationId,
          journalTransactionId: revJtx.id,
          accountId: adminExtraPoolAcct.id,
          direction: "CREDIT_OUT" as JournalLineDirection,
          signedPhysicalDelta: visit.extraMetalReturnedWeight.negated(),
          touchSnapshot: extraTouch,
          signedFineDelta: extraFine.negated(),
          orderId: order.id,
          orderProcessId: currentProc.id,
          karigarId: visit.karigarId,
          description: `Reverse extra metal return out from ${adminExtraPoolAcct.accountCode}`,
          createdAt: now,
        });
        await tx.updateStockAccountBalances(
          adminExtraPoolAcct.id,
          roundInternal(
            adminExtraPoolAcct.cachedPhysicalBalance.sub(
              visit.extraMetalReturnedWeight
            )
          ),
          roundInternal(adminExtraPoolAcct.cachedFineBalance.sub(extraFine))
        );
        const freshKarigar = (await tx.getStockAccountById(
          validActor.organizationId,
          karigarCustodyAcct.id
        ))!;
        await tx.createJournalLine({
          id: newId("jln"),
          organizationId: validActor.organizationId,
          journalTransactionId: revJtx.id,
          accountId: freshKarigar.id,
          direction: "DEBIT_IN" as JournalLineDirection,
          signedPhysicalDelta: extraOrderEquiv,
          touchSnapshot: order.touchSnapshot,
          signedFineDelta: extraFine,
          orderId: order.id,
          orderProcessId: currentProc.id,
          karigarId: visit.karigarId,
          description: `Restore karigar custody on extra return reversal`,
          createdAt: now,
        });
        await tx.updateStockAccountBalances(
          freshKarigar.id,
          roundInternal(freshKarigar.cachedPhysicalBalance.add(extraOrderEquiv)),
          roundInternal(freshKarigar.cachedFineBalance.add(extraFine))
        );
      }

      // 2. Reverse process loss or lock-fitting balance adjustment if posted
      if (visit.rawLossWeight.lt(ZERO)) {
        const allWriteOffs = await tx.listLossWriteOffs(validActor.organizationId);
        const adjPrefix = `lf_adj_${visit.idempotencyKey}_`;
        for (const w of allWriteOffs) {
          if (w.status === "ACTIVE" && w.idempotencyKey.startsWith(adjPrefix)) {
            await tx.updateLossWriteOff({
              ...w,
              status: "REVERSED",
              reversedAt: now,
              reversalReason: reason,
            });
          }
        }
        const weightGain = visit.rawLossWeight.abs();
        const fineGain = visit.fineLossWeight.abs();
        const lossPoolAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `PROCESS_LOSS_${purity.code}`,
          `Process Loss Account - ${purity.displayLabel}`,
          "PROCESS_LOSS",
          purity.id,
          null
        );
        const freshKarigar = (await tx.getStockAccountById(
          validActor.organizationId,
          karigarCustodyAcct.id
        ))!;
        await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "CONTROLLED_REVERSAL",
          businessDate,
          purity,
          physicalWeight: weightGain,
          fineEquivalentWeight: fineGain,
          sourceAccount: freshKarigar,
          destinationAccount: lossPoolAcct,
          sourceReference: `REV-BAG-${order.bagNumber}-${currentProc.processType}-ADJ`,
          reason: `Reverse lock-fitting adjustment (+${weightGain.toFixed(3)}g): ${reason}`,
          orderId: order.id,
          orderProcessId: currentProc.id,
          processVisitId: visit.id,
          karigarId: visit.karigarId,
          idempotencyKey: `rev_loss_${input.idempotencyKey}`,
        });
      } else if (visitLoss) {
        if (visit.rawLossWeight.gt(ZERO)) {
          const lossPoolAcct = await this.ensureSystemAccount(
            tx,
            validActor.organizationId,
            `PROCESS_LOSS_${purity.code}`,
            `Process Loss Account - ${purity.displayLabel}`,
            "PROCESS_LOSS",
            purity.id,
            null
          );
          const freshKarigar = (await tx.getStockAccountById(
            validActor.organizationId,
            karigarCustodyAcct.id
          ))!;
          await this.postBalancedJournalEntry(tx, {
            organizationId: validActor.organizationId,
            actorId: validActor.userId,
            transactionType: "CONTROLLED_REVERSAL",
            businessDate,
            purity,
            physicalWeight: visit.rawLossWeight,
            fineEquivalentWeight: visit.fineLossWeight,
            sourceAccount: lossPoolAcct,
            destinationAccount: freshKarigar,
            sourceReference: `REV-BAG-${order.bagNumber}-${currentProc.processType}-LOSS`,
            reason: `Reverse process loss (${visit.rawLossWeight.toFixed(3)}g): ${reason}`,
            orderId: order.id,
            orderProcessId: currentProc.id,
            processVisitId: visit.id,
            karigarId: visit.karigarId,
            idempotencyKey: `rev_loss_${input.idempotencyKey}`,
          });
        }
        await tx.updateProcessLossRecord({
          ...visitLoss,
          eligibilityStatus: "VOIDED",
          updatedAt: now,
        });
      }

      const reversedVisit = await tx.updateProcessVisit({
        ...visit,
        status: "REVERSED",
        updatedAt: now,
      });

      const restoredReturned = roundInternal(
        currentProc.returnedMetalWeight.sub(visit.metalOutWeight)
      );
      const restoredExtra = roundInternal(
        currentProc.extraReturnedMetalWeight.sub(visit.extraMetalReturnedWeight)
      );
      const restoredLoss = roundInternal(
        currentProc.closedLossWeight.sub(visit.rawLossWeight)
      );
      const restoredCustody = roundInternal(
        currentProc.issuedMetalWeight
          .sub(restoredReturned)
          .sub(restoredExtra)
          .sub(restoredLoss)
      );
      const remainingActiveVisits = activeProcVisits.filter(
        (v) => v.id !== visit.id
      );

      const updatedProc = await tx.updateOrderProcess({
        ...currentProc,
        status:
          remainingActiveVisits.length > 0 ? "PARTIAL_RETURN" : "IN_PROGRESS",
        returnedMetalWeight: restoredReturned,
        extraReturnedMetalWeight: restoredExtra,
        closedLossWeight: restoredLoss,
        custodyMetalWeight: restoredCustody,
        closedAt: null,
        closedById: null,
        updatedAt: now,
      });

      const updatedOrder = await tx.updateOrder({
        ...order,
        totalRawLossWeight: roundInternal(
          order.totalRawLossWeight.sub(visit.rawLossWeight)
        ),
        totalFineLossWeight: roundInternal(
          order.totalFineLossWeight.sub(visit.fineLossWeight)
        ),
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "ProcessVisit",
        entityId: visit.id,
        action: "PROCESS_VISIT_REVERSED",
        summary: `Reversed ${currentProc.processType} visit #${visit.visitNumber} for Bag #${order.bagNumber}: ${reason}`,
        metadataJson: JSON.stringify({
          orderId: order.id,
          visitId: visit.id,
          metalOutWeight: visit.metalOutWeight.toFixed(3),
          extraMetalReturnedWeight: visit.extraMetalReturnedWeight.toFixed(3),
          rawLossWeight: visit.rawLossWeight.toFixed(3),
          reason,
        }),
        createdAt: now,
      });

      return { visit: reversedVisit, process: updatedProc, order: updatedOrder };
    });
  }

  // ==========================================================================
  // 6. WHOLE-ORDER COMPLETION
  // ==========================================================================

  public async completeOrder(
    actor: ActorContext,
    input: CompleteOrderInput
  ): Promise<{
    order: OrderEntity;
    journalTransaction: JournalTransactionEntity;
    lossRecords: ProcessLossRecordEntity[];
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existingCompletionTx =
        await tx.getJournalTransactionByIdempotencyKey(
          `complete_${input.idempotencyKey}`
        );
      if (existingCompletionTx) {
        const existingOrder = await tx.getOrderById(
          validActor.organizationId,
          input.orderId
        );
        if (existingOrder && existingOrder.status === "COMPLETED") {
          const lossRecords = await tx.listProcessLossRecords(
            validActor.organizationId,
            existingOrder.id
          );
          return {
            order: existingOrder,
            journalTransaction: existingCompletionTx,
            lossRecords,
          };
        }
      }

      let order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }

      // Rule 13: Prevent duplicate order completion
      if (order.status === "COMPLETED") {
        throw new ConflictError(
          `Bag #${order.bagNumber} is already COMPLETED`
        );
      }
      if (
        order.status === "CANCELLED" ||
        order.status === "CANCELLATION_PENDING_RECONCILIATION"
      ) {
        throw new ValidationError(
          `Cannot complete order in status ${order.status}`
        );
      }

      const processes = await tx.listOrderProcesses(
        validActor.organizationId,
        order.id
      );
      if (processes.length === 0) {
        throw new ValidationError("Order has no selected processes");
      }

      const allVisits = await tx.listProcessVisits(
        validActor.organizationId,
        order.id
      );
      const latestClosedVisit = [...allVisits]
        .filter((v) => v.status === "CLOSED")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .pop();

      for (const p of processes) {
        const isUnusedPending =
          p.status === "PENDING" &&
          p.custodyMetalWeight.isZero() &&
          p.issuedMetalWeight.isZero() &&
          Boolean(latestClosedVisit);
        if (p.status !== "CLOSED" && !isUnusedPending) {
          throw new ValidationError(
            `Cannot complete Bag #${order.bagNumber}: selected process ${p.processType} is in status ${p.status} (must be CLOSED)`
          );
        }
        if (!p.custodyMetalWeight.isZero()) {
          throw new ValidationError(
            `Cannot complete Bag #${order.bagNumber}: ${p.custodyMetalWeight.toFixed(
              3
            )}g still in karigar custody for ${p.processType}`
          );
        }
      }
      const finalProc =
        (latestClosedVisit
          ? processes.find((p) => p.id === latestClosedVisit.orderProcessId)
          : null) ?? processes[processes.length - 1];
      const expectedFinishedGross = roundInternal(
        latestClosedVisit ? latestClosedVisit.grossOutWeight : finalProc.latestGrossOutWeight
      );
      const expectedFinishedStone = roundInternal(
        latestClosedVisit ? latestClosedVisit.nonGoldOutWeight : finalProc.carriedStoneOutWeight
      );
      const expectedFinishedNet = roundInternal(
        latestClosedVisit ? latestClosedVisit.metalOutWeight : finalProc.returnedMetalWeight
      );

      const finishedGross =
        input.finishedGrossWeight !== undefined
          ? roundInternal(input.finishedGrossWeight)
          : expectedFinishedGross;
      const finishedStone =
        input.finishedStoneWeight !== undefined
          ? roundInternal(input.finishedStoneWeight)
          : expectedFinishedStone;
      const finishedNet = roundInternal(finishedGross.sub(finishedStone));

      if (!finishedNet.eq(expectedFinishedNet)) {
        throw new ValidationError(
          `Finished net metal weight (${finishedNet.toFixed(
            3
          )}g) does not reconcile with final process metal output (${expectedFinishedNet.toFixed(
            3
          )}g)`
        );
      }

      const lossRecords = await tx.listProcessLossRecords(
        validActor.organizationId,
        order.id
      );
      const sumClosedLoss = processes.reduce(
        (acc, p) => roundInternal(acc.add(p.closedLossWeight)),
        ZERO
      );
      const sumExtraOrderEquiv = allVisits
        .filter((v) => v.status !== "REVERSED" && v.extraMetalReturnedWeight.gt(ZERO))
        .reduce((acc, v) => {
          const orderTouchRatio = roundTouch(order.touchSnapshot).div(100);
          return roundInternal(acc.add(v.extraMetalFineWeight.div(orderTouchRatio)));
        }, ZERO);

      // Whole-order mass conservation check:
      // initialIssuedMetal == finishedNetMetal + sumClosedLoss + sumExtraReturned
      const totalAccountedMetal = roundInternal(
        finishedNet.add(sumClosedLoss).add(sumExtraOrderEquiv)
      );
      if (totalAccountedMetal.sub(order.initialIssuedMetalWeight).abs().gt(new Decimal("0.002"))) {
        throw new ValidationError(
          `Order mass reconciliation failed: initialIssuedMetal (${order.initialIssuedMetalWeight.toFixed(
            3
          )}g) != finishedNetMetal (${finishedNet.toFixed(
            3
          )}g) + totalProcessLoss (${sumClosedLoss.toFixed(3)}g) + extraReturned (${sumExtraOrderEquiv.toFixed(3)}g)`
        );
      }

      const purity = (await tx.getPurityById(
        validActor.organizationId,
        order.purityId
      ))!;
      const finalKarigarId = finalProc.assignedKarigarId!;
      const finalKarigar = (await tx.getKarigarById(
        validActor.organizationId,
        finalKarigarId
      ))!;

      const karigarCustodyAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `KARIGAR_CUSTODY_${finalKarigar.id}`,
        `Karigar Custody - ${finalKarigar.name} (${finalKarigar.karigarCode})`,
        "KARIGAR_CUSTODY",
        null,
        finalKarigar.id
      );

      const finishedGoodsAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `FINISHED_GOODS_${purity.code}`,
        `Finished Goods - ${purity.displayLabel}`,
        "FINISHED_GOODS",
        purity.id,
        null
      );

      const finishedFine = calculateFineEquivalent(
        finishedNet,
        order.touchSnapshot
      );

      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "ORDER_COMPLETION_FINISHED_GOODS",
        businessDate,
        purity,
        physicalWeight: finishedNet,
        fineEquivalentWeight: finishedFine,
        sourceAccount: karigarCustodyAcct,
        destinationAccount: finishedGoodsAcct,
        sourceReference: `BAG-${order.bagNumber}-COMPLETE`,
        reason: `Completed Bag #${order.bagNumber} into Finished Goods (${finishedGross.toFixed(
          3
        )}g gross, ${finishedStone.toFixed(3)}g stones, ${finishedNet.toFixed(
          3
        )}g net metal)`,
        orderId: order.id,
        orderProcessId: finalProc.id,
        karigarId: finalKarigar.id,
        idempotencyKey: input.idempotencyKey,
      });

      const now = new Date();
      await tx.createMetalMovement({
        id: newId("mmov"),
        organizationId: validActor.organizationId,
        orderId: order.id,
        orderProcessId: finalProc.id,
        processVisitId: null,
        movementType: "FINISHED_GOODS_COMPLETION",
        fromProcessType: finalProc.processType,
        toProcessType: null,
        karigarId: finalKarigar.id,
        businessDate,
        grossWeight: finishedGross,
        nonGoldWeight: finishedStone,
        netMetalWeight: finishedNet,
        touchSnapshot: order.touchSnapshot,
        fineEquivalentWeight: finishedFine,
        journalTransactionId: jtx.id,
        idempotencyKey: `mmov_comp_${input.idempotencyKey}`,
        notes: input.notes ?? "Moved to Finished Goods on order completion",
        createdById: validActor.userId,
        createdAt: now,
      });

      // Rule 9: Transition all ProcessLossRecords for this order from PENDING_ORDER_COMPLETION to ELIGIBLE
      // WITHOUT double-posting loss!
      const updatedLossRecords: ProcessLossRecordEntity[] = [];
      for (const lr of lossRecords) {
        if (lr.eligibilityStatus === "PENDING_ORDER_COMPLETION") {
          const updated = await tx.updateProcessLossRecord({
            ...lr,
            eligibilityStatus: "ELIGIBLE",
            eligibleAt: now,
            updatedAt: now,
          });
          updatedLossRecords.push(updated);
        } else {
          updatedLossRecords.push(lr);
        }
      }

      const updatedOrder = await tx.updateOrder({
        ...order,
        status: "COMPLETED",
        finishedGrossWeight: finishedGross,
        finishedStoneWeight: finishedStone,
        finishedNetMetalWeight: finishedNet,
        finishedFineWeight: finishedFine,
        completedAt: now,
        completedById: validActor.userId,
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "Order",
        entityId: order.id,
        action: "ORDER_COMPLETED",
        summary: `Completed Bag #${order.bagNumber}: ${finishedGross.toFixed(
          3
        )}g gross, ${finishedStone.toFixed(3)}g stone, ${finishedNet.toFixed(
          3
        )}g net gold (${finishedFine.toFixed(3)}g fine)`,
        metadataJson: null,
        createdAt: now,
      });

      return {
        order: updatedOrder,
        journalTransaction: jtx,
        lossRecords: updatedLossRecords,
      };
    });
  }

  // ==========================================================================
  // 7. CANCELLATION & CORRECTIONS (NO HARD DELETE OF POSTED TRANSACTIONS)
  // ==========================================================================

  public async cancelOrder(
    actor: ActorContext,
    input: CancelOrderInput
  ): Promise<OrderEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Cancellation reason is required");
    }

    return this.repo.runInTransaction(async (tx) => {
      let order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      if (order.status === "COMPLETED") {
        throw new ConflictError("Completed orders cannot be cancelled");
      }

      const movements = await tx.listMetalMovements(
        validActor.organizationId,
        order.id
      );
      const now = new Date();

      // Rule 12: Unposted order can be cancelled directly; posted order with movements/custody/losses
      // transitions to CANCELLATION_PENDING_RECONCILIATION and never deletes posted journal entries.
      const nextStatus =
        movements.length === 0 && order.initialIssuedMetalWeight.isZero()
          ? "CANCELLED"
          : "CANCELLATION_PENDING_RECONCILIATION";

      const updated = await tx.updateOrder({
        ...order,
        status: nextStatus,
        cancelledAt: now,
        cancellationReason: reason,
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "Order",
        entityId: order.id,
        action:
          nextStatus === "CANCELLED"
            ? "ORDER_CANCELLED"
            : "ORDER_CANCELLATION_PENDING_RECONCILIATION",
        summary: `Order Bag #${order.bagNumber} marked ${nextStatus}: ${reason}`,
        metadataJson: null,
        createdAt: now,
      });

      return updated;
    });
  }

  /**
   * Delete/Cancel an order and roll back ALL issued gold (from Karigar Custody,
   * Process Loss, and Finished Goods) back into Admin Stock via balanced CONTROLLED_REVERSAL
   * journal entries. Preserves append-only audit trail.
   */
  public async deleteOrderWithRollback(
    actor: ActorContext,
    input: {
      orderId: string;
      reason?: string;
      idempotencyKey: string;
    }
  ): Promise<{
    order: OrderEntity;
    rolledBackPhysicalWeight: Decimal;
    rolledBackFineWeight: Decimal;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim() || "Order deleted by Admin";
    const businessDate = parseBusinessDate(undefined);

    return this.repo.runInTransaction(async (tx) => {
      let order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      if (order.status === "CANCELLED") {
        throw new ConflictError(
          `Order Bag #${order.bagNumber} is already deleted/cancelled`
        );
      }
      if (
        order.billingStatus === "BILLED" ||
        order.deliveryStatus === "DELIVERED"
      ) {
        throw new ConflictError(
          `Cannot delete Bag #${order.bagNumber}: order is already billed/delivered. Cancel/reverse the bill first.`
        );
      }

      const purity = await tx.getPurityById(
        validActor.organizationId,
        order.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${order.purityId} not found`);
      }

      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );

      const processes = await tx.listOrderProcesses(
        validActor.organizationId,
        order.id
      );
      const lossRecords = await tx.listProcessLossRecords(
        validActor.organizationId,
        order.id
      );

      // Guard: prevent rolling back a process loss that already has active recovery allocations, making deductions, or manual write-offs
      let orderWriteOffs: LossWriteOffEntity[] = [];
      if (lossRecords.length > 0) {
        const [allocs, writeOffs, makingDeds] = await Promise.all([
          tx.listRecoveryAllocations(validActor.organizationId, {}),
          tx.listLossWriteOffs(validActor.organizationId, {}),
          tx.listMakingDeductionAllocations(validActor.organizationId, {}),
        ]);
        const lossIds = new Set(lossRecords.map((l) => l.id));
        orderWriteOffs = writeOffs.filter(
          (w) => w.status === "ACTIVE" && lossIds.has(w.processLossRecordId)
        );
        const hasManualWriteOff = orderWriteOffs.some(
          (w) =>
            !w.idempotencyKey.startsWith("lf_adj_") &&
            !w.idempotencyKey.startsWith("noksi_settled_")
        );
        const hasActiveSettlement =
          allocs.some(
            (a) => a.status === "ACTIVE" && lossIds.has(a.processLossRecordId)
          ) ||
          hasManualWriteOff ||
          makingDeds.some(
            (m) => m.status === "ACTIVE" && lossIds.has(m.processLossRecordId)
          );
        if (hasActiveSettlement) {
          throw new ConflictError(
            `Cannot delete Bag #${order.bagNumber}: one or more process losses already have active recovery allocations, making deductions, or write-offs. Reverse the recovery settlement first.`
          );
        }
      }

      const now = new Date();
      let rolledBackPhysical = ZERO;
      let rolledBackFine = ZERO;
      let rolledBackCustody = ZERO;

      // 1. Roll back any gold sitting in Karigar Custody on this order's processes
      for (let i = 0; i < processes.length; i++) {
        const proc = processes[i];
        if (proc.custodyMetalWeight.gt(ZERO) && proc.assignedKarigarId) {
          const custWeight = roundInternal(proc.custodyMetalWeight);
          const custFine = calculateFineEquivalent(
            custWeight,
            order.touchSnapshot
          );
          const karigarAcct = await this.ensureSystemAccount(
            tx,
            validActor.organizationId,
            `KARIGAR_CUSTODY_${proc.assignedKarigarId}`,
            `Karigar Custody - ${proc.assignedKarigarId}`,
            "KARIGAR_CUSTODY",
            null,
            proc.assignedKarigarId
          );

          const jtx = await this.postBalancedJournalEntry(tx, {
            organizationId: validActor.organizationId,
            actorId: validActor.userId,
            transactionType: "CONTROLLED_REVERSAL",
            businessDate,
            purity,
            physicalWeight: custWeight,
            fineEquivalentWeight: custFine,
            sourceAccount: karigarAcct,
            destinationAccount: adminPoolAcct,
            sourceReference: `DEL-BAG-${order.bagNumber}-CUST-${i}`,
            reason: `Order Delete Rollback (Custody) for Bag #${order.bagNumber} (${proc.processType}): ${reason}`,
            orderId: order.id,
            orderProcessId: proc.id,
            karigarId: proc.assignedKarigarId,
            idempotencyKey: `del_cust_${input.idempotencyKey}_${proc.id}`,
          });

          await tx.createMetalMovement({
            id: newId("mmov"),
            organizationId: validActor.organizationId,
            orderId: order.id,
            orderProcessId: proc.id,
            processVisitId: null,
            movementType: "RETURN_TO_ADMIN_STOCK",
            fromProcessType: proc.processType,
            toProcessType: null,
            karigarId: proc.assignedKarigarId,
            businessDate,
            grossWeight: custWeight,
            nonGoldWeight: ZERO,
            netMetalWeight: custWeight,
            touchSnapshot: order.touchSnapshot,
            fineEquivalentWeight: custFine,
            journalTransactionId: jtx.id,
            idempotencyKey: `del_mmov_cust_${input.idempotencyKey}_${proc.id}`,
            notes: `Rolled back custody on order delete: ${reason}`,
            createdById: validActor.userId,
            createdAt: now,
          });

          await tx.updateOrderProcess({
            ...proc,
            custodyMetalWeight: ZERO,
            updatedAt: now,
          });

          rolledBackPhysical = roundInternal(rolledBackPhysical.add(custWeight));
          rolledBackFine = roundInternal(rolledBackFine.add(custFine));
          rolledBackCustody = roundInternal(rolledBackCustody.add(custWeight));
        }
      }

      // 1b. If all processes (including the final process) were CLOSED but completeOrder was not yet called,
      // the final process's net metal out is still sitting in KARIGAR_CUSTODY awaiting completion.
      if (order.status !== "COMPLETED" && rolledBackCustody.isZero()) {
        const sortedProcs = [...processes].sort(
          (a, b) => a.canonicalSequence - b.canonicalSequence
        );
        const lastProc = sortedProcs[sortedProcs.length - 1];
        const awaitingWeight =
          lastProc &&
          lastProc.status === "CLOSED" &&
          lastProc.assignedKarigarId
            ? roundInternal(
                lastProc.latestGrossOutWeight.sub(lastProc.carriedStoneOutWeight)
              )
            : ZERO;
        if (lastProc && awaitingWeight.gt(ZERO) && lastProc.assignedKarigarId) {
          const awaitingFine = calculateFineEquivalent(
            awaitingWeight,
            order.touchSnapshot
          );
          const karigarAcct = await this.ensureSystemAccount(
            tx,
            validActor.organizationId,
            `KARIGAR_CUSTODY_${lastProc.assignedKarigarId}`,
            `Karigar Custody - ${lastProc.assignedKarigarId}`,
            "KARIGAR_CUSTODY",
            null,
            lastProc.assignedKarigarId
          );

          const jtx = await this.postBalancedJournalEntry(tx, {
            organizationId: validActor.organizationId,
            actorId: validActor.userId,
            transactionType: "CONTROLLED_REVERSAL",
            businessDate,
            purity,
            physicalWeight: awaitingWeight,
            fineEquivalentWeight: awaitingFine,
            sourceAccount: karigarAcct,
            destinationAccount: adminPoolAcct,
            sourceReference: `DEL-BAG-${order.bagNumber}-AWAIT-FG`,
            reason: `Order Delete Rollback (Awaiting Completion) for Bag #${order.bagNumber} (${lastProc.processType}): ${reason}`,
            orderId: order.id,
            orderProcessId: lastProc.id,
            karigarId: lastProc.assignedKarigarId,
            idempotencyKey: `del_await_${input.idempotencyKey}_${lastProc.id}`,
          });

          await tx.createMetalMovement({
            id: newId("mmov"),
            organizationId: validActor.organizationId,
            orderId: order.id,
            orderProcessId: lastProc.id,
            processVisitId: null,
            movementType: "RETURN_TO_ADMIN_STOCK",
            fromProcessType: lastProc.processType,
            toProcessType: null,
            karigarId: lastProc.assignedKarigarId,
            businessDate,
            grossWeight: awaitingWeight,
            nonGoldWeight: ZERO,
            netMetalWeight: awaitingWeight,
            touchSnapshot: order.touchSnapshot,
            fineEquivalentWeight: awaitingFine,
            journalTransactionId: jtx.id,
            idempotencyKey: `del_mmov_await_${input.idempotencyKey}_${lastProc.id}`,
            notes: `Rolled back awaiting-completion metal on order delete: ${reason}`,
            createdById: validActor.userId,
            createdAt: now,
          });

          rolledBackPhysical = roundInternal(rolledBackPhysical.add(awaitingWeight));
          rolledBackFine = roundInternal(rolledBackFine.add(awaitingFine));
        }
      }

      // 2. Roll back Finished Goods if the order was already COMPLETED
      if (
        order.status === "COMPLETED" &&
        order.finishedNetMetalWeight &&
        order.finishedNetMetalWeight.gt(ZERO)
      ) {
        const fgWeight = roundInternal(order.finishedNetMetalWeight);
        const fgFine = order.finishedFineWeight
          ? roundInternal(order.finishedFineWeight)
          : calculateFineEquivalent(fgWeight, order.touchSnapshot);
        const fgAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `FINISHED_GOODS_${purity.code}`,
          `Finished Goods - ${purity.displayLabel}`,
          "FINISHED_GOODS",
          purity.id,
          null
        );

        const jtx = await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "CONTROLLED_REVERSAL",
          businessDate,
          purity,
          physicalWeight: fgWeight,
          fineEquivalentWeight: fgFine,
          sourceAccount: fgAcct,
          destinationAccount: adminPoolAcct,
          sourceReference: `DEL-BAG-${order.bagNumber}-FG`,
          reason: `Order Delete Rollback (Finished Goods) for Bag #${order.bagNumber}: ${reason}`,
          orderId: order.id,
          idempotencyKey: `del_fg_${input.idempotencyKey}`,
        });

        await tx.createMetalMovement({
          id: newId("mmov"),
          organizationId: validActor.organizationId,
          orderId: order.id,
          orderProcessId: null,
          processVisitId: null,
          movementType: "RETURN_TO_ADMIN_STOCK",
          fromProcessType: null,
          toProcessType: null,
          karigarId: null,
          businessDate,
          grossWeight: fgWeight,
          nonGoldWeight: ZERO,
          netMetalWeight: fgWeight,
          touchSnapshot: order.touchSnapshot,
          fineEquivalentWeight: fgFine,
          journalTransactionId: jtx.id,
          idempotencyKey: `del_mmov_fg_${input.idempotencyKey}`,
          notes: `Rolled back finished goods on order delete: ${reason}`,
          createdById: validActor.userId,
          createdAt: now,
        });

        rolledBackPhysical = roundInternal(rolledBackPhysical.add(fgWeight));
        rolledBackFine = roundInternal(rolledBackFine.add(fgFine));
      }

      // 3. Roll back any non-voided Process Loss back to Admin Stock & mark VOIDED
      const touchRatio = roundTouch(order.touchSnapshot).div(100);
      for (const w of orderWriteOffs) {
        await tx.updateLossWriteOff({
          ...w,
          status: "REVERSED",
          reversedAt: now,
          reversalReason: `Order deleted: ${reason}`,
        });
      }
      for (const lr of lossRecords) {
        if (lr.eligibilityStatus !== "VOIDED" && lr.rawMetalLossWeight.gt(ZERO)) {
          const lfAdjFine = orderWriteOffs
            .filter(
              (w) =>
                w.processLossRecordId === lr.id &&
                w.idempotencyKey.startsWith("lf_adj_")
            )
            .reduce((s, w) => roundInternal(s.add(w.writtenOffFineWeight)), ZERO);
          const lossFine = roundInternal(
            lr.fineEquivalentLossWeight.sub(lfAdjFine)
          );
          const lossPhys = lfAdjFine.gt(ZERO)
            ? roundInternal(lossFine.div(touchRatio))
            : roundInternal(lr.rawMetalLossWeight);
          const lossExpenseAcct = await this.ensureSystemAccount(
            tx,
            validActor.organizationId,
            `PROCESS_LOSS_${purity.code}`,
            `Process Loss Account - ${purity.displayLabel}`,
            "PROCESS_LOSS",
            purity.id,
            null
          );

          if (lossPhys.gt(ZERO)) {
            const jtx = await this.postBalancedJournalEntry(tx, {
              organizationId: validActor.organizationId,
              actorId: validActor.userId,
              transactionType: "CONTROLLED_REVERSAL",
              businessDate,
              purity,
              physicalWeight: lossPhys,
              fineEquivalentWeight: lossFine,
              sourceAccount: lossExpenseAcct,
              destinationAccount: adminPoolAcct,
              sourceReference: `DEL-BAG-${order.bagNumber}-LOSS-${lr.id}`,
              reason: `Order Delete Rollback (Process Loss) for Bag #${order.bagNumber} (${lr.processType}): ${reason}`,
              orderId: order.id,
              orderProcessId: lr.orderProcessId,
              karigarId: lr.karigarId,
              idempotencyKey: `del_loss_${input.idempotencyKey}_${lr.id}`,
            });

            await tx.createMetalMovement({
              id: newId("mmov"),
              organizationId: validActor.organizationId,
              orderId: order.id,
              orderProcessId: lr.orderProcessId,
              processVisitId: lr.processVisitId,
              movementType: "REVERSAL",
              fromProcessType: lr.processType,
              toProcessType: null,
              karigarId: lr.karigarId,
              businessDate,
              grossWeight: lossPhys,
              nonGoldWeight: ZERO,
              netMetalWeight: lossPhys,
              touchSnapshot: order.touchSnapshot,
              fineEquivalentWeight: lossFine,
              journalTransactionId: jtx.id,
              idempotencyKey: `del_mmov_loss_${input.idempotencyKey}_${lr.id}`,
              notes: `Rolled back process loss on order delete: ${reason}`,
              createdById: validActor.userId,
              createdAt: now,
            });

            rolledBackPhysical = roundInternal(rolledBackPhysical.add(lossPhys));
            rolledBackFine = roundInternal(rolledBackFine.add(lossFine));
          }

          await tx.updateProcessLossRecord({
            ...lr,
            eligibilityStatus: "VOIDED",
            updatedAt: now,
          });
        }
      }

      const updatedOrder: OrderEntity = {
        ...order,
        status: "CANCELLED",
        cancelledAt: now,
        cancellationReason: reason,
        totalRawLossWeight: ZERO,
        totalFineLossWeight: ZERO,
        updatedAt: now,
      };

      await tx.deleteOrder(validActor.organizationId, order.id);

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "Order",
        entityId: order.id,
        action: "ORDER_DELETED_WITH_ROLLBACK",
        summary: `Deleted Bag #${order.bagNumber} and rolled back ${rolledBackPhysical.toFixed(
          3
        )}g (${rolledBackFine.toFixed(3)}g fine) to Admin Stock: ${reason}`,
        metadataJson: null,
        createdAt: now,
      });

      return {
        order: updatedOrder,
        rolledBackPhysicalWeight: rolledBackPhysical,
        rolledBackFineWeight: rolledBackFine,
      };
    });
  }

  // ==========================================================================
  // 8. DAILY RECONCILIATION & REGISTER QUERIES
  // ==========================================================================

  public async getDailyReconciliation(
    actor: ActorContext
  ): Promise<DailyReconciliationReport> {
    const validActor = this.assertAuthenticated(actor);

    return this.repo.runInTransaction(async (tx) => {
      const [purities, accounts, lines, karigars, lossRecords] =
        await Promise.all([
          tx.listPurities(validActor.organizationId),
          tx.listStockAccounts(validActor.organizationId),
          tx.listJournalLines(validActor.organizationId),
          tx.listKarigars(validActor.organizationId),
          tx.listProcessLossRecords(validActor.organizationId),
        ]);

      // Sum journal lines by accountId
      const linePhysByAcct = new Map<string, Decimal>();
      const lineFineByAcct = new Map<string, Decimal>();
      for (const l of lines) {
        linePhysByAcct.set(
          l.accountId,
          roundInternal(
            (linePhysByAcct.get(l.accountId) ?? ZERO).add(l.signedPhysicalDelta)
          )
        );
        lineFineByAcct.set(
          l.accountId,
          roundInternal(
            (lineFineByAcct.get(l.accountId) ?? ZERO).add(l.signedFineDelta)
          )
        );
      }

      const byPurity: PurityStockRow[] = purities.map((p) => {
        const adminAcct = accounts.find(
          (a) => a.accountType === "ADMIN_KARAT_POOL" && a.purityId === p.id
        );
        const fgAcct = accounts.find(
          (a) => a.accountType === "FINISHED_GOODS" && a.purityId === p.id
        );

        const adminPhys = adminAcct?.cachedPhysicalBalance ?? ZERO;
        const adminFine = adminAcct?.cachedFineBalance ?? ZERO;
        const fgPhys = fgAcct?.cachedPhysicalBalance ?? ZERO;
        const fgFine = fgAcct?.cachedFineBalance ?? ZERO;

        const jnlAdminPhys = adminAcct
          ? linePhysByAcct.get(adminAcct.id) ?? ZERO
          : ZERO;
        const jnlAdminFine = adminAcct
          ? lineFineByAcct.get(adminAcct.id) ?? ZERO
          : ZERO;

        const isReconciled =
          adminPhys.eq(jnlAdminPhys) && adminFine.eq(jnlAdminFine);

        return {
          purityId: p.id,
          code: p.code,
          displayLabel: p.displayLabel,
          karatLabel: p.karatLabel,
          touchPercent: p.touchPercent.toFixed(4).replace(/\.?0+$/, ""),
          isFineCategory: p.isFineCategory,
          adminPhysicalWeight: adminPhys.toFixed(3),
          adminFineEquivalent: adminFine.toFixed(3),
          finishedGoodsPhysicalWeight: fgPhys.toFixed(3),
          finishedGoodsFineEquivalent: fgFine.toFixed(3),
          journalDerivedPhysicalWeight: jnlAdminPhys.toFixed(3),
          journalDerivedFineEquivalent: jnlAdminFine.toFixed(3),
          isReconciled,
        };
      });

      // Total net stock inflow (negative of OPENING_EQUITY + EXTERNAL_SUPPLIER_INFLOW balances)
      let totalInflowFine = ZERO;
      let adminAvailableFine = ZERO;
      let karigarCustodyFine = ZERO;
      let finishedGoodsFine = ZERO;
      let customerDeliveredFine = ZERO;
      let refiningLossFine = ZERO;

      for (const acct of accounts) {
        const fine = lineFineByAcct.get(acct.id) ?? ZERO;
        if (
          acct.accountType === "OPENING_EQUITY" ||
          acct.accountType === "EXTERNAL_SUPPLIER_INFLOW"
        ) {
          totalInflowFine = roundInternal(totalInflowFine.add(fine.negated()));
        } else if (acct.accountType === "ADMIN_KARAT_POOL") {
          adminAvailableFine = roundInternal(adminAvailableFine.add(fine));
        } else if (acct.accountType === "KARIGAR_CUSTODY") {
          karigarCustodyFine = roundInternal(karigarCustodyFine.add(fine));
        } else if (acct.accountType === "FINISHED_GOODS") {
          finishedGoodsFine = roundInternal(finishedGoodsFine.add(fine));
        } else if (acct.accountType === "CUSTOMER_DELIVERED") {
          customerDeliveredFine = roundInternal(
            customerDeliveredFine.add(fine)
          );
        } else if (
          acct.accountType === "PROCESS_LOSS" &&
          acct.accountCode.startsWith("REFINING_LOSS_")
        ) {
          refiningLossFine = roundInternal(refiningLossFine.add(fine));
        }
      }

      let pendingLossFine = ZERO;
      let eligibleLossFine = ZERO;
      for (const lr of lossRecords) {
        if (lr.eligibilityStatus === "PENDING_ORDER_COMPLETION") {
          pendingLossFine = roundInternal(
            pendingLossFine.add(lr.fineEquivalentLossWeight)
          );
        } else if (lr.eligibilityStatus === "ELIGIBLE") {
          eligibleLossFine = roundInternal(
            eligibleLossFine.add(lr.fineEquivalentLossWeight)
          );
        }
      }

      const totalLossFine = roundInternal(
        pendingLossFine.add(eligibleLossFine)
      );
      const totalAccountedFine = roundInternal(
        adminAvailableFine
          .add(karigarCustodyFine)
          .add(finishedGoodsFine)
          .add(customerDeliveredFine)
          .add(totalLossFine)
          .add(refiningLossFine)
      );
      const discrepancyFine = roundInternal(
        totalInflowFine.sub(totalAccountedFine)
      );

      const karigarCustodyBreakdown = karigars.map((k) => {
        const kAcct = accounts.find(
          (a) => a.accountType === "KARIGAR_CUSTODY" && a.karigarId === k.id
        );
        const custPhys = kAcct ? linePhysByAcct.get(kAcct.id) ?? ZERO : ZERO;
        const custFine = kAcct ? lineFineByAcct.get(kAcct.id) ?? ZERO : ZERO;

        const kLosses = lossRecords.filter((lr) => lr.karigarId === k.id);
        const pendRaw = kLosses
          .filter((l) => l.eligibilityStatus === "PENDING_ORDER_COMPLETION")
          .reduce((s, l) => roundInternal(s.add(l.rawMetalLossWeight)), ZERO);
        const pendFine = kLosses
          .filter((l) => l.eligibilityStatus === "PENDING_ORDER_COMPLETION")
          .reduce(
            (s, l) => roundInternal(s.add(l.fineEquivalentLossWeight)),
            ZERO
          );
        const eligRaw = kLosses
          .filter((l) => l.eligibilityStatus === "ELIGIBLE")
          .reduce((s, l) => roundInternal(s.add(l.rawMetalLossWeight)), ZERO);
        const eligFine = kLosses
          .filter((l) => l.eligibilityStatus === "ELIGIBLE")
          .reduce(
            (s, l) => roundInternal(s.add(l.fineEquivalentLossWeight)),
            ZERO
          );

        return {
          karigarId: k.id,
          karigarCode: k.karigarCode,
          karigarName: k.name,
          custodyPhysicalWeight: custPhys.toFixed(3),
          custodyFineWeight: custFine.toFixed(3),
          pendingLossRawWeight: pendRaw.toFixed(3),
          pendingLossFineWeight: pendFine.toFixed(3),
          eligibleLossRawWeight: eligRaw.toFixed(3),
          eligibleLossFineWeight: eligFine.toFixed(3),
        };
      });

      return {
        organizationId: validActor.organizationId,
        asOfTimestamp: new Date().toISOString(),
        byPurity,
        totals: {
          totalStockInflowFine: totalInflowFine.toFixed(3),
          adminAvailableFine: adminAvailableFine.toFixed(3),
          karigarCustodyFine: karigarCustodyFine.toFixed(3),
          finishedGoodsFine: finishedGoodsFine.toFixed(3),
          processLossPendingFine: pendingLossFine.toFixed(3),
          processLossEligibleFine: eligibleLossFine.toFixed(3),
          totalProcessLossFine: totalLossFine.toFixed(3),
          totalAccountedFine: totalAccountedFine.toFixed(3),
          discrepancyFine: discrepancyFine.toFixed(3),
          isBalanced: discrepancyFine.isZero(),
        },
        karigarCustodyBreakdown,
      };
    });
  }

  public async listRegisterOrders(
    actor: ActorContext,
    filters?: {
      monthKey?: string;
      search?: string;
      status?: string;
      purityId?: string;
      processType?: ProcessType;
    }
  ) {
    const validActor = this.assertAuthenticated(actor);

    return this.repo.runInTransaction(async (tx) => {
      const [
        orders,
        customers,
        purities,
        karigars,
        processes,
        visits,
        stones,
        losses,
        movements,
        journalTransactions,
        stockAccounts,
      ] = await Promise.all([
        tx.listOrders(validActor.organizationId),
        tx.listCustomers(validActor.organizationId),
        tx.listPurities(validActor.organizationId),
        tx.listKarigars(validActor.organizationId),
        tx.listOrderProcesses(validActor.organizationId),
        tx.listProcessVisits(validActor.organizationId),
        tx.listStoneComponentEntries(validActor.organizationId),
        tx.listProcessLossRecords(validActor.organizationId),
        tx.listMetalMovements(validActor.organizationId),
        tx.listJournalTransactions(validActor.organizationId),
        tx.listStockAccounts(validActor.organizationId),
      ]);

      const customerMap = new Map(customers.map((c) => [c.id, c]));
      const purityMap = new Map(purities.map((p) => [p.id, p]));
      const karigarMap = new Map(karigars.map((k) => [k.id, k]));
      const jtxMap = new Map(journalTransactions.map((j) => [j.id, j]));
      const adminPoolByPurityId = new Map(
        stockAccounts
          .filter((a) => a.accountType === "ADMIN_KARAT_POOL" && a.purityId)
          .map((a) => [a.purityId!, a])
      );

      // Collect all distinct month keys (Asia/Kolkata) across orders
      const availableMonths = Array.from(
        new Set(orders.map((o) => getKolkataMonthKey(o.orderDate)))
      )
        .sort()
        .reverse();

      const rows = orders.map((o) => {
        const customer = customerMap.get(o.customerId)!;
        const purity = purityMap.get(o.purityId)!;
        const orderProcs = processes
          .filter((p) => p.orderId === o.id)
          .sort((a, b) => a.canonicalSequence - b.canonicalSequence);
        const orderVisits = visits.filter((v) => v.orderId === o.id);
        const orderStones = stones.filter((s) => s.orderId === o.id);
        const orderLosses = losses.filter((l) => l.orderId === o.id);
        const orderMovements = movements.filter((m) => m.orderId === o.id);
        const filingProc = orderProcs.find((p) => p.processType === "FILING");
        const adminPool = adminPoolByPurityId.get(o.purityId);

        const rawFilingIssues = filingProc
          ? orderMovements
              .filter(
                (m) =>
                  m.orderProcessId === filingProc.id &&
                  (m.movementType === "ADMIN_ISSUE_TO_ORDER" ||
                    m.movementType === "ADDITIONAL_ADMIN_ISSUE")
              )
              .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          : [];

        const filingIssues = rawFilingIssues.map((m, idx) => {
          const linkedJtx = m.journalTransactionId
            ? jtxMap.get(m.journalTransactionId)
            : undefined;
          const kar = m.karigarId ? karigarMap.get(m.karigarId) : undefined;
          return {
            id: m.id,
            issueNumber: idx + 1,
            label: idx === 0 ? "Initial issue" : "Additional issue",
            movementType: m.movementType,
            weightGrams: m.netMetalWeight.toFixed(3),
            fineWeightGrams: m.fineEquivalentWeight.toFixed(3),
            businessDate: m.businessDate.toISOString(),
            karigarId: m.karigarId,
            karigarName: kar ? `${kar.name} (${kar.karigarCode})` : null,
            notes: m.notes,
            isReversed: Boolean(linkedJtx?.isReversed),
            createdAt: m.createdAt.toISOString(),
          };
        });

        let validFilingIn = ZERO;
        if (filingProc) {
          for (const m of orderMovements) {
            if (m.orderProcessId !== filingProc.id) continue;
            const linkedJtx = m.journalTransactionId
              ? jtxMap.get(m.journalTransactionId)
              : undefined;
            if (linkedJtx?.isReversed) continue;
            if (
              m.movementType === "ADMIN_ISSUE_TO_ORDER" ||
              m.movementType === "ADDITIONAL_ADMIN_ISSUE"
            ) {
              validFilingIn = roundInternal(validFilingIn.add(m.netMetalWeight));
            } else if (m.movementType === "REVERSAL") {
              validFilingIn = roundInternal(validFilingIn.sub(m.netMetalWeight));
            }
          }
          if (validFilingIn.lt(ZERO)) validFilingIn = ZERO;
        }

        return {
          order: o,
          monthKey: getKolkataMonthKey(o.orderDate),
          customer,
          purity,
          adminAvailablePhysicalWeight: adminPool
            ? adminPool.cachedPhysicalBalance.toFixed(3)
            : "0.000",
          filingIssues,
          filingValidIssuedWeight: validFilingIn.toFixed(3),
          processes: orderProcs.map((p) => ({
            ...p,
            karigar: p.assignedKarigarId
              ? karigarMap.get(p.assignedKarigarId) ?? null
              : null,
          })),
          visits: orderVisits.map((v) => ({
            ...v,
            karigar: karigarMap.get(v.karigarId) ?? null,
          })),
          stoneComponents: orderStones,
          lossRecords: orderLosses.map((l) => ({
            ...l,
            karigar: karigarMap.get(l.karigarId) ?? null,
          })),
          movements: orderMovements,
        };
      });

      const filtered = rows.filter((r) => {
        if (
          filters?.monthKey &&
          filters.monthKey !== "ALL" &&
          r.monthKey !== filters.monthKey
        ) {
          return false;
        }
        if (
          filters?.status &&
          filters.status === "ACTIVE"
        ) {
          if (r.order.status === "CANCELLED") return false;
        } else if (
          filters?.status &&
          filters.status !== "ALL" &&
          r.order.status !== filters.status
        ) {
          return false;
        }
        if (
          filters?.purityId &&
          filters.purityId !== "ALL" &&
          r.order.purityId !== filters.purityId
        ) {
          return false;
        }
        if (filters?.processType) {
          const hasProc = r.processes.some(
            (p) => p.processType === filters.processType
          );
          if (!hasProc) return false;
        }
        if (filters?.search && filters.search.trim()) {
          const rawQ = filters.search.trim().toLowerCase();
          const q = rawQ.replace(/^bag\s*#?/i, "").replace(/^#/, "").trim();
          const matchBag =
            r.order.bagNumber.toLowerCase().includes(rawQ) ||
            (q.length > 0 && r.order.bagNumber.toLowerCase().includes(q));
          const matchOrder = r.order.orderName.toLowerCase().includes(rawQ);
          const matchCustomer =
            r.customer.name.toLowerCase().includes(rawQ) ||
            r.customer.customerCode.toLowerCase().includes(rawQ);
          const matchKarigar = r.processes.some(
            (p) => p.karigar && p.karigar.name.toLowerCase().includes(rawQ)
          );
          if (!matchBag && !matchOrder && !matchCustomer && !matchKarigar) {
            return false;
          }
        }
        return true;
      });

      return {
        availableMonths,
        rows: filtered,
      };
    });
  }

  // ==========================================================================
  // 9. KARIGAR RECOVERY MODULE (Receipts, Allocations, Write-Offs, Reports)
  // ==========================================================================

  private computeLossBalances(
    loss: ProcessLossRecordEntity,
    allocations: RecoveryAllocationEntity[],
    writeOffs: LossWriteOffEntity[],
    makingDeductions: MakingDeductionAllocationEntity[] = []
  ) {
    const makingAllowedFine = makingDeductions
      .filter((m) => m.processLossRecordId === loss.id && m.status === "ACTIVE")
      .reduce((s, m) => roundInternal(s.add(m.deductedFineWeight)), ZERO);
    const recoveredFine = allocations
      .filter((a) => a.processLossRecordId === loss.id && a.status === "ACTIVE")
      .reduce((s, a) => roundInternal(s.add(a.allocatedFineWeight)), ZERO);
    const writtenOffFine = writeOffs
      .filter((w) => w.processLossRecordId === loss.id && w.status === "ACTIVE")
      .reduce((s, w) => roundInternal(s.add(w.writtenOffFineWeight)), ZERO);
    const outstandingFine = roundInternal(
      loss.fineEquivalentLossWeight
        .sub(makingAllowedFine)
        .sub(recoveredFine)
        .sub(writtenOffFine)
    );
    return {
      makingAllowedFine,
      recoveredFine,
      writtenOffFine,
      outstandingFine: outstandingFine.lt(ZERO) ? ZERO : outstandingFine,
    };
  }

  public async postRecoverySettlement(
    actor: ActorContext,
    input: {
      karigarId: string;
      scopeType: "SINGLE_TOUCH" | "ALL_TOUCHES";
      scopeTouchPercent?: DecimalInput;
      scopeProcessType?: ProcessType;
      businessDate?: string | Date;
      makingDeductionInput?: DecimalInput;
      allowAdditionalMaking?: boolean;
      additionalMakingReason?: string;
      lines?: Array<{
        purityId?: string;
        grossWeight: DecimalInput;
        touchPercent?: DecimalInput;
      }>;
      shortageAction?: "CARRY_FORWARD" | "ACCEPT_AND_CLEAR" | "ACCEPT_PART";
      acceptedShortageInput?: DecimalInput;
      snapshotClaimIds?: string[];
      snapshotExpectedOutstandingFine?: DecimalInput;
      notes?: string;
      idempotencyKey: string;
    }
  ): Promise<{
    settlement: RecoverySettlementEntity;
    receipt: RecoveryReceiptEntity | null;
    makingAllocations: MakingDeductionAllocationEntity[];
    recoveryAllocations: RecoveryAllocationEntity[];
    writeOffs: LossWriteOffEntity[];
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getRecoverySettlementByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) {
        const [makingAllocs, recAllocs, writeOffs, receipt] = await Promise.all([
          tx.listMakingDeductionAllocations(validActor.organizationId, {
            recoverySettlementId: existing.id,
          }),
          existing.recoveryReceiptId
            ? tx.listRecoveryAllocations(validActor.organizationId, {
                recoveryReceiptId: existing.recoveryReceiptId,
              })
            : Promise.resolve([]),
          tx.listLossWriteOffs(validActor.organizationId, {
            karigarId: existing.karigarId,
          }),
          existing.recoveryReceiptId
            ? tx.getRecoveryReceiptById(
                validActor.organizationId,
                existing.recoveryReceiptId
              )
            : Promise.resolve(null),
        ]);
        return {
          settlement: existing,
          receipt,
          makingAllocations: makingAllocs,
          recoveryAllocations: recAllocs,
          writeOffs: writeOffs.filter(
            (w) => w.recoverySettlementId === existing.id
          ),
        };
      }

      const karigar = await tx.getKarigarById(
        validActor.organizationId,
        input.karigarId
      );
      if (!karigar) {
        throw new NotFoundError(`Karigar ${input.karigarId} not found`);
      }

      if (
        input.scopeType === "SINGLE_TOUCH" &&
        (input.scopeTouchPercent === undefined ||
          toDecimal(input.scopeTouchPercent).lte(ZERO))
      ) {
        throw new ValidationError(
          "Valid scopeTouchPercent is required for SINGLE_TOUCH recovery"
        );
      }
      const scopeTouchDec =
        input.scopeType === "SINGLE_TOUCH"
          ? roundTouch(input.scopeTouchPercent!)
          : null;

      const [allLosses, allAllocs, allWriteOffs, allMakingDeds, purities] =
        await Promise.all([
          tx.listProcessLossRecords(validActor.organizationId),
          tx.listRecoveryAllocations(validActor.organizationId),
          tx.listLossWriteOffs(validActor.organizationId),
          tx.listMakingDeductionAllocations(validActor.organizationId),
          tx.listPurities(validActor.organizationId),
        ]);

      // Select eligible outstanding claims in scope, ordered oldest-first
      const eligibleClaims = allLosses
        .filter((l) => {
          if (l.eligibilityStatus !== "ELIGIBLE") return false;
          if (l.karigarId !== karigar.id) return false;
          if (input.scopeProcessType && l.processType !== input.scopeProcessType)
            return false;
          if (scopeTouchDec) {
            if (l.touchSnapshot.sub(scopeTouchDec).abs().gt(new Decimal("0.005"))) {
              return false;
            }
          }
          return true;
        })
        .map((l) => {
          const bal = this.computeLossBalances(
            l,
            allAllocs,
            allWriteOffs,
            allMakingDeds
          );
          return {
            loss: l,
            ...bal,
          };
        })
        .filter((item) => item.outstandingFine.gt(ZERO))
        .sort((a, b) => {
          const da = (a.loss.eligibleAt ?? a.loss.businessDate).getTime();
          const db = (b.loss.eligibleAt ?? b.loss.businessDate).getTime();
          if (da !== db) return da - db;
          return a.loss.createdAt.getTime() - b.loss.createdAt.getTime();
        });

      if (eligibleClaims.length === 0) {
        throw new ValidationError(
          "No eligible outstanding loss claims found for this karigar and scope"
        );
      }

      const grossSelectedFine = eligibleClaims.reduce(
        (s, c) => roundInternal(s.add(c.outstandingFine)),
        ZERO
      );

      // Concurrency snapshot check
      if (input.snapshotClaimIds) {
        const currentIds = new Set(eligibleClaims.map((c) => c.loss.id));
        const snapIds = new Set(input.snapshotClaimIds);
        const sameSet =
          currentIds.size === snapIds.size &&
          Array.from(currentIds).every((id) => snapIds.has(id));
        if (!sameSet) {
          throw new ConflictError(
            "Eligible outstanding claims changed in another transaction. Please refresh and review the updated preview."
          );
        }
      }
      if (input.snapshotExpectedOutstandingFine !== undefined) {
        const snapFine = toDecimal(input.snapshotExpectedOutstandingFine);
        if (grossSelectedFine.sub(snapFine).abs().gt(new Decimal("0.001"))) {
          throw new ConflictError(
            "Outstanding balance changed in another transaction. Please refresh and review the updated preview."
          );
        }
      }

      // Making deduction validation & fine conversion
      const makingInput = toDecimal(input.makingDeductionInput ?? "0");
      if (makingInput.lt(ZERO)) {
        throw new ValidationError("Making deduction cannot be negative");
      }
      const makingInputUnit: "RAW_AT_TOUCH" | "FINE" =
        input.scopeType === "SINGLE_TOUCH" ? "RAW_AT_TOUCH" : "FINE";
      const makingDeductionFine =
        makingInputUnit === "RAW_AT_TOUCH" && scopeTouchDec
          ? calculateFineEquivalent(makingInput, scopeTouchDec)
          : roundInternal(makingInput);

      if (makingDeductionFine.gt(grossSelectedFine)) {
        throw new ValidationError(
          `Making deduction (${makingDeductionFine.toFixed(
            4
          )}g fine) cannot exceed selected outstanding (${grossSelectedFine.toFixed(
            4
          )}g fine)`
        );
      }

      const hasPriorMaking = eligibleClaims.some((c) =>
        c.makingAllowedFine.gt(ZERO)
      );
      if (makingDeductionFine.gt(ZERO) && hasPriorMaking) {
        if (!input.allowAdditionalMaking || !input.additionalMakingReason?.trim()) {
          throw new ValidationError(
            "Selected carried claims already have making allowed. Explicit confirmation and reason are required to apply an additional making deduction."
          );
        }
      }

      const netExpectedFine = roundInternal(
        grossSelectedFine.sub(makingDeductionFine)
      );

      // Validate & prepare receipt lines (physical metal received)
      const rawLines = (input.lines ?? []).filter(
        (l) => !toDecimal(l.grossWeight || "0").isZero()
      );
      let totalReceivedGross = ZERO;
      let actualReceivedFine = ZERO;
      const preparedLines: Array<{
        purity: PurityEntity;
        grossWeight: Decimal;
        touchPercent: Decimal;
        fineWeight: Decimal;
        adminPoolAcct: StockAccountEntity;
        inflowAcct: StockAccountEntity;
      }> = [];

      for (const line of rawLines) {
        const grossWeight = toDecimal(line.grossWeight);
        if (grossWeight.lt(ZERO)) {
          throw new ValidationError("Receipt weight cannot be negative");
        }
        if (grossWeight.isZero()) continue;

        let purity = line.purityId
          ? purities.find((p) => p.id === line.purityId)
          : undefined;
        const touchPercent =
          line.touchPercent !== undefined
            ? roundTouch(line.touchPercent)
            : purity?.touchPercent;
        if (
          !touchPercent ||
          touchPercent.lte(ZERO) ||
          touchPercent.gt(new Decimal(100))
        ) {
          throw new ValidationError(
            "Valid received touch (between 0 and 100%) is required"
          );
        }
        if (!purity) {
          purity =
            purities.find(
              (p) => p.touchPercent.sub(touchPercent).abs().lte(new Decimal("0.01"))
            ) ??
            (await tx.createPurity({
              id: newId("pur"),
              organizationId: validActor.organizationId,
              code: `TOUCH_${touchPercent.toFixed(2).replace(".", "_")}`,
              displayLabel: `${touchPercent.toFixed(2).replace(/\.?0+$/, "")}%`,
              karatLabel: `${touchPercent.toFixed(2).replace(/\.?0+$/, "")}%`,
              touchPercent,
              isFineCategory: touchPercent.gte(new Decimal("99.5")),
              sortOrder: purities.length + 1,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
          purities.push(purity);
        }

        const fineWeight = calculateFineEquivalent(grossWeight, touchPercent);
        const adminPoolAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `ADMIN_POOL_${purity.code}`,
          `Admin Stock Pool - ${purity.displayLabel}`,
          "ADMIN_KARAT_POOL",
          purity.id,
          null
        );
        const inflowAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `KARIGAR_RECOVERY_INFLOW_${purity.code}`,
          `Karigar Recovery Inflow - ${purity.displayLabel}`,
          "EXTERNAL_SUPPLIER_INFLOW",
          purity.id,
          null
        );

        totalReceivedGross = roundInternal(totalReceivedGross.add(grossWeight));
        actualReceivedFine = roundInternal(actualReceivedFine.add(fineWeight));
        preparedLines.push({
          purity,
          grossWeight,
          touchPercent,
          fineWeight,
          adminPoolAcct,
          inflowAcct,
        });
      }

      const differenceFine = roundInternal(
        netExpectedFine.sub(actualReceivedFine)
      );

      let shortageAction:
        | "CARRY_FORWARD"
        | "ACCEPT_AND_CLEAR"
        | "ACCEPT_PART"
        | "NONE"
        | "EXCESS" = "NONE";
      let acceptedShortageFine = ZERO;
      let carriedShortageFine = ZERO;
      let excessFine = ZERO;

      if (differenceFine.gt(ZERO)) {
        if (
          !input.shortageAction ||
          !["CARRY_FORWARD", "ACCEPT_AND_CLEAR", "ACCEPT_PART"].includes(
            input.shortageAction
          )
        ) {
          throw new ValidationError(
            "A shortage remains; please choose Carry forward, Accept shortage & clear, or Accept part, carry the rest"
          );
        }
        shortageAction = input.shortageAction;
        if (shortageAction === "CARRY_FORWARD") {
          acceptedShortageFine = ZERO;
          carriedShortageFine = differenceFine;
        } else if (shortageAction === "ACCEPT_AND_CLEAR") {
          acceptedShortageFine = differenceFine;
          carriedShortageFine = ZERO;
        } else if (shortageAction === "ACCEPT_PART") {
          const partInput = toDecimal(input.acceptedShortageInput ?? "0");
          if (partInput.lte(ZERO)) {
            throw new ValidationError(
              "Accepted shortage amount must be greater than zero"
            );
          }
          acceptedShortageFine =
            makingInputUnit === "RAW_AT_TOUCH" && scopeTouchDec
              ? calculateFineEquivalent(partInput, scopeTouchDec)
              : roundInternal(partInput);
          if (
            acceptedShortageFine.lte(ZERO) ||
            acceptedShortageFine.gte(differenceFine)
          ) {
            throw new ValidationError(
              `Accepted shortage (${acceptedShortageFine.toFixed(
                4
              )}g fine) must be between 0 and the total shortage (${differenceFine.toFixed(
                4
              )}g fine)`
            );
          }
          carriedShortageFine = roundInternal(
            differenceFine.sub(acceptedShortageFine)
          );
        }
      } else if (differenceFine.lt(ZERO)) {
        shortageAction = "EXCESS";
        excessFine = roundInternal(actualReceivedFine.sub(netExpectedFine));
      }

      // Zero receipt guard
      if (totalReceivedGross.isZero()) {
        const hasAdjustment =
          makingDeductionFine.gt(ZERO) || acceptedShortageFine.gt(ZERO);
        if (!hasAdjustment && netExpectedFine.gt(ZERO)) {
          throw new ValidationError(
            "Enter received gold weight or confirm a making/shortage adjustment"
          );
        }
      }

      const now = new Date();
      const settlementId = newId("set");
      const settlementNumber = `SET-${now.getTime().toString().slice(-6)}-${settlementId
        .slice(-4)
        .toUpperCase()}`;
      const preReceiptId = totalReceivedGross.gt(ZERO) ? newId("rcv") : null;

      // Create RecoverySettlement Header first so MakingDeductionAllocation FK resolves in PostgreSQL
      const settlement = await tx.createRecoverySettlement({
        id: settlementId,
        organizationId: validActor.organizationId,
        karigarId: karigar.id,
        settlementNumber,
        businessDate,
        scopeType: input.scopeType,
        scopeTouchPercent: scopeTouchDec,
        scopeProcessType: input.scopeProcessType ?? null,
        grossSelectedFine,
        makingDeductionFine,
        makingInputWeight: makingInput,
        makingInputUnit,
        netExpectedFine,
        receivedFine: actualReceivedFine,
        differenceFine,
        shortageAction,
        acceptedShortageFine,
        carriedShortageFine,
        excessFine,
        recoveryReceiptId: preReceiptId,
        notes: input.notes?.trim() || null,
        status: "POSTED",
        idempotencyKey: input.idempotencyKey,
        createdById: validActor.userId,
        createdAt: now,
        updatedAt: now,
        reversedAt: null,
        reversalReason: null,
      });

      // Track remaining per-claim balance as we allocate making -> receipt -> write-off oldest-first
      const claimRemaining = new Map<string, Decimal>(
        eligibleClaims.map((c) => [c.loss.id, c.outstandingFine])
      );

      // 1. Making Deduction Allocations
      const createdMakingAllocs: MakingDeductionAllocationEntity[] = [];
      let remMaking = makingDeductionFine;
      for (let i = 0; i < eligibleClaims.length && remMaking.gt(ZERO); i++) {
        const claim = eligibleClaims[i];
        const avail = claimRemaining.get(claim.loss.id) ?? ZERO;
        if (avail.lte(ZERO)) continue;
        const amt = remMaking.lt(avail) ? remMaking : avail;
        const ma = await tx.createMakingDeductionAllocation({
          id: newId("mkd"),
          organizationId: validActor.organizationId,
          recoverySettlementId: settlementId,
          processLossRecordId: claim.loss.id,
          karigarId: karigar.id,
          deductedFineWeight: amt,
          businessDate,
          reason:
            input.additionalMakingReason?.trim() ||
            input.notes?.trim() ||
            `Making deduction on ${settlementNumber}`,
          status: "ACTIVE",
          idempotencyKey: `mkd_${input.idempotencyKey}_${i}`,
          createdById: validActor.userId,
          createdAt: now,
          reversedAt: null,
          reversalReason: null,
        });
        createdMakingAllocs.push(ma);
        claimRemaining.set(claim.loss.id, roundInternal(avail.sub(amt)));
        remMaking = roundInternal(remMaking.sub(amt));
      }

      // 2. Physical Receipt & Stock Journal (only if totalReceivedGross > 0)
      let receipt: RecoveryReceiptEntity | null = null;
      const createdRecAllocs: RecoveryAllocationEntity[] = [];
      if (totalReceivedGross.gt(ZERO) && preReceiptId) {
        const receiptId = preReceiptId;
        const receiptNumber = `RCV-${now.getTime().toString().slice(-6)}-${receiptId
          .slice(-4)
          .toUpperCase()}`;
        const weightedTouch = roundTouch(
          actualReceivedFine.mul(new Decimal(100)).div(totalReceivedGross)
        );
        const allocatableReceiptFine = actualReceivedFine.gt(netExpectedFine)
          ? netExpectedFine
          : actualReceivedFine;

        receipt = await tx.createRecoveryReceipt({
          id: receiptId,
          organizationId: validActor.organizationId,
          karigarId: karigar.id,
          receiptNumber,
          businessDate,
          recoveredGrossWeight: totalReceivedGross,
          recoveredTouchPercent: weightedTouch,
          recoveredFineWeight: actualReceivedFine,
          unallocatedFineWeight: excessFine,
          referenceNumber: settlementNumber,
          notes: input.notes?.trim() || null,
          status: "POSTED",
          idempotencyKey: `rcv_${input.idempotencyKey}`,
          journalTransactionId: null,
          createdById: validActor.userId,
          createdAt: now,
          updatedAt: now,
          reversedAt: null,
          reversalReason: null,
          recoverySettlementId: settlementId,
        });

        for (let i = 0; i < preparedLines.length; i++) {
          const pl = preparedLines[i];
          const jtx = await this.postBalancedJournalEntry(tx, {
            organizationId: validActor.organizationId,
            actorId: validActor.userId,
            transactionType: "KARIGAR_RECOVERY_RECEIPT",
            businessDate,
            purity: pl.purity,
            physicalWeight: pl.grossWeight,
            fineEquivalentWeight: pl.fineWeight,
            sourceAccount: pl.inflowAcct,
            destinationAccount: pl.adminPoolAcct,
            sourceReference: settlementNumber,
            reason: `Recovery settlement ${settlementNumber} from ${karigar.name} (${pl.grossWeight.toFixed(
              3
            )}g @ ${pl.touchPercent.toFixed(2)}% = ${pl.fineWeight.toFixed(
              4
            )}g fine)`,
            karigarId: karigar.id,
            idempotencyKey: `set_jnl_${input.idempotencyKey}_${i}`,
          });
          if (i === 0) {
            receipt = await tx.updateRecoveryReceipt({
              ...receipt,
              journalTransactionId: jtx.id,
            });
          }
          await tx.createRecoveryReceiptLine({
            id: newId("rcvl"),
            organizationId: validActor.organizationId,
            recoveryReceiptId: receipt.id,
            purityId: pl.purity.id,
            destinationAccountId: pl.adminPoolAcct.id,
            grossWeight: pl.grossWeight,
            touchPercent: pl.touchPercent,
            fineWeight: pl.fineWeight,
            journalTransactionId: jtx.id,
            createdAt: now,
          });
        }

        let remRec = allocatableReceiptFine;
        for (let i = 0; i < eligibleClaims.length && remRec.gt(ZERO); i++) {
          const claim = eligibleClaims[i];
          const avail = claimRemaining.get(claim.loss.id) ?? ZERO;
          if (avail.lte(ZERO)) continue;
          const amt = remRec.lt(avail) ? remRec : avail;
          const alloc = await tx.createRecoveryAllocation({
            id: newId("ralloc"),
            organizationId: validActor.organizationId,
            recoveryReceiptId: receipt.id,
            processLossRecordId: claim.loss.id,
            allocatedFineWeight: amt,
            status: "ACTIVE",
            businessDate,
            notes: `Settlement ${settlementNumber}`,
            idempotencyKey: `ralloc_${input.idempotencyKey}_${i}`,
            createdById: validActor.userId,
            createdAt: now,
            undoneAt: null,
            undoneById: null,
            undoReason: null,
          });
          createdRecAllocs.push(alloc);
          claimRemaining.set(claim.loss.id, roundInternal(avail.sub(amt)));
          remRec = roundInternal(remRec.sub(amt));
        }
      }

      // 3. Accepted Shortage Write-Offs (does NOT touch physical stock)
      const createdWriteOffs: LossWriteOffEntity[] = [];
      let remWo = acceptedShortageFine;
      for (let i = 0; i < eligibleClaims.length && remWo.gt(ZERO); i++) {
        const claim = eligibleClaims[i];
        const avail = claimRemaining.get(claim.loss.id) ?? ZERO;
        if (avail.lte(ZERO)) continue;
        const amt = remWo.lt(avail) ? remWo : avail;
        const wo = await tx.createLossWriteOff({
          id: newId("wo"),
          organizationId: validActor.organizationId,
          processLossRecordId: claim.loss.id,
          karigarId: karigar.id,
          writtenOffFineWeight: amt,
          businessDate,
          reason:
            input.notes?.trim() ||
            `Accepted shortage on settlement ${settlementNumber}`,
          status: "ACTIVE",
          idempotencyKey: `wo_${input.idempotencyKey}_${i}`,
          createdById: validActor.userId,
          createdAt: now,
          reversedAt: null,
          reversalReason: null,
          recoverySettlementId: settlementId,
        });
        createdWriteOffs.push(wo);
        claimRemaining.set(claim.loss.id, roundInternal(avail.sub(amt)));
        remWo = roundInternal(remWo.sub(amt));
      }

      // 4. Audit Event
      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "RecoverySettlement",
        entityId: settlement.id,
        action: "RECOVERY_SETTLEMENT_POSTED",
        summary: `Posted ${settlementNumber} for ${karigar.name}: Gross ${grossSelectedFine.toFixed(
          4
        )}g fine, Making ${makingDeductionFine.toFixed(
          4
        )}g fine, Received ${actualReceivedFine.toFixed(
          4
        )}g fine, Action ${shortageAction}`,
        metadataJson: JSON.stringify({
          settlementId: settlement.id,
          receiptId: receipt?.id ?? null,
          claimCount: eligibleClaims.length,
        }),
        createdAt: now,
      });

      return {
        settlement,
        receipt,
        makingAllocations: createdMakingAllocs,
        recoveryAllocations: createdRecAllocs,
        writeOffs: createdWriteOffs,
      };
    });
  }

  public async reverseRecoverySettlement(
    actor: ActorContext,
    input: {
      settlementId: string;
      reason: string;
      idempotencyKey: string;
    }
  ): Promise<RecoverySettlementEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Reason is required to reverse a settlement");
    }

    return this.repo.runInTransaction(async (tx) => {
      const settlement = await tx.getRecoverySettlementById(
        validActor.organizationId,
        input.settlementId
      );
      if (!settlement) {
        throw new NotFoundError(
          `Recovery settlement ${input.settlementId} not found`
        );
      }
      if (settlement.status === "REVERSED") {
        return settlement;
      }

      const now = new Date();

      // Check receipt downstream dependencies before reversing anything
      if (settlement.recoveryReceiptId) {
        const receipt = await tx.getRecoveryReceiptById(
          validActor.organizationId,
          settlement.recoveryReceiptId
        );
        if (receipt && receipt.status === "POSTED") {
          const allAllocs = await tx.listRecoveryAllocations(
            validActor.organizationId,
            { recoveryReceiptId: receipt.id }
          );
          const externalActiveAllocs = allAllocs.filter(
            (a) =>
              a.status === "ACTIVE" &&
              !a.idempotencyKey.startsWith(`ralloc_${settlement.idempotencyKey}`)
          );
          if (externalActiveAllocs.length > 0) {
            throw new ConflictError(
              "Cannot reverse settlement: its excess receipt credit was already allocated to other loss claims. Undo those allocations first."
            );
          }
          if (receipt.unallocatedFineWeight.lt(settlement.excessFine)) {
            throw new ConflictError(
              "Cannot reverse settlement: part of its excess receipt credit has already been consumed or refunded."
            );
          }

          // Reverse linked allocations
          for (const alloc of allAllocs) {
            if (alloc.status === "ACTIVE") {
              await tx.updateRecoveryAllocation({
                ...alloc,
                status: "REVERSED_WITH_RECEIPT",
                undoneAt: now,
                undoneById: validActor.userId,
                undoReason: `Settlement reversed: ${reason}`,
              });
            }
          }

          // Reverse physical stock journal lines
          const [lines, purities, accounts] = await Promise.all([
            tx.listRecoveryReceiptLines(validActor.organizationId, receipt.id),
            tx.listPurities(validActor.organizationId),
            tx.listStockAccounts(validActor.organizationId),
          ]);
          for (let i = 0; i < lines.length; i++) {
            const rl = lines[i];
            const purity = purities.find((p) => p.id === rl.purityId);
            const destAcct = accounts.find(
              (a) => a.id === rl.destinationAccountId
            );
            const inflowAcct = accounts.find(
              (a) =>
                a.organizationId === validActor.organizationId &&
                a.accountType === "EXTERNAL_SUPPLIER_INFLOW" &&
                a.purityId === rl.purityId
            );
            if (purity && destAcct && inflowAcct) {
              if (destAcct.cachedPhysicalBalance.lt(rl.grossWeight)) {
                throw new ConflictError(
                  `Cannot reverse settlement: Admin Stock for ${purity.displayLabel} has already been consumed below ${rl.grossWeight.toFixed(
                    3
                  )}g.`
                );
              }
              await this.postBalancedJournalEntry(tx, {
                organizationId: validActor.organizationId,
                actorId: validActor.userId,
                transactionType: "CONTROLLED_REVERSAL",
                businessDate: now,
                purity,
                physicalWeight: rl.grossWeight,
                fineEquivalentWeight: rl.fineWeight,
                sourceAccount: destAcct,
                destinationAccount: inflowAcct,
                sourceReference: settlement.settlementNumber,
                reason: `Reversal of settlement ${settlement.settlementNumber}: ${reason}`,
                karigarId: settlement.karigarId,
                idempotencyKey: `set_rev_jnl_${input.idempotencyKey}_${i}`,
              });
            }
          }

          await tx.updateRecoveryReceipt({
            ...receipt,
            status: "REVERSED",
            unallocatedFineWeight: ZERO,
            reversedAt: now,
            reversalReason: reason,
            updatedAt: now,
          });
        }
      }

      // Reverse making deduction allocations
      const makingAllocs = await tx.listMakingDeductionAllocations(
        validActor.organizationId,
        { recoverySettlementId: settlement.id }
      );
      for (const ma of makingAllocs) {
        if (ma.status === "ACTIVE") {
          await tx.updateMakingDeductionAllocation({
            ...ma,
            status: "REVERSED",
            reversedAt: now,
            reversalReason: reason,
          });
        }
      }

      // Reverse linked write-offs
      const writeOffs = await tx.listLossWriteOffs(validActor.organizationId, {
        karigarId: settlement.karigarId,
      });
      for (const wo of writeOffs) {
        if (
          wo.recoverySettlementId === settlement.id &&
          wo.status === "ACTIVE"
        ) {
          await tx.updateLossWriteOff({
            ...wo,
            status: "REVERSED",
            reversedAt: now,
            reversalReason: reason,
          });
        }
      }

      const updatedSettlement = await tx.updateRecoverySettlement({
        ...settlement,
        status: "REVERSED",
        reversedAt: now,
        reversalReason: reason,
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "RecoverySettlement",
        entityId: settlement.id,
        action: "RECOVERY_SETTLEMENT_REVERSED",
        summary: `Reversed settlement ${settlement.settlementNumber}: ${reason}`,
        metadataJson: null,
        createdAt: now,
      });

      return updatedSettlement;
    });
  }

  public async recordRecoveryReceipt(
    actor: ActorContext,
    input: {
      karigarId: string;
      businessDate?: string | Date;
      referenceNumber?: string;
      notes?: string;
      lines: Array<{
        purityId: string;
        grossWeight: DecimalInput;
        touchPercent?: DecimalInput;
      }>;
      allocationMode?: "OLDEST_FIRST" | "MANUAL" | "NONE";
      selectedLossRecordIds?: string[];
      manualAllocations?: Array<{
        processLossRecordId: string;
        allocatedFineWeight: DecimalInput;
      }>;
      idempotencyKey: string;
    }
  ): Promise<{
    receipt: RecoveryReceiptEntity;
    lines: RecoveryReceiptLineEntity[];
    allocations: RecoveryAllocationEntity[];
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const businessDate = parseBusinessDate(input.businessDate);

    if (!input.lines || input.lines.length === 0) {
      throw new ValidationError(
        "At least one metal purity line is required for a recovery receipt"
      );
    }

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getRecoveryReceiptByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) {
        const [lines, allocs] = await Promise.all([
          tx.listRecoveryReceiptLines(validActor.organizationId, existing.id),
          tx.listRecoveryAllocations(validActor.organizationId, {
            recoveryReceiptId: existing.id,
          }),
        ]);
        return { receipt: existing, lines, allocations: allocs };
      }

      const karigar = await tx.getKarigarById(
        validActor.organizationId,
        input.karigarId
      );
      if (!karigar) {
        throw new NotFoundError(`Karigar ${input.karigarId} not found`);
      }

      const now = new Date();
      const receiptId = newId("rcv");
      const receiptNumber = `RCV-${now.getTime().toString().slice(-6)}-${receiptId
        .slice(-4)
        .toUpperCase()}`;

      let totalGross = ZERO;
      let totalFine = ZERO;
      const preparedLines: Array<{
        purity: PurityEntity;
        grossWeight: Decimal;
        touchPercent: Decimal;
        fineWeight: Decimal;
        adminPoolAcct: StockAccountEntity;
        inflowAcct: StockAccountEntity;
      }> = [];

      for (let i = 0; i < input.lines.length; i++) {
        const rawLine = input.lines[i];
        const purity = await tx.getPurityById(
          validActor.organizationId,
          rawLine.purityId
        );
        if (!purity) {
          throw new NotFoundError(`Purity ${rawLine.purityId} not found`);
        }
        const grossWeight = roundInternal(rawLine.grossWeight);
        if (grossWeight.lte(ZERO)) {
          throw new ValidationError(
            "Recovery receipt metal weight must be greater than zero"
          );
        }
        const touchPercent =
          rawLine.touchPercent !== undefined && rawLine.touchPercent !== ""
            ? roundTouch(rawLine.touchPercent)
            : purity.touchPercent;
        if (touchPercent.lte(ZERO) || touchPercent.gt(new Decimal("100"))) {
          throw new ValidationError(
            "Valid known touch (> 0% and <= 100%) is required. Unknown-purity dust requires assay/refining first."
          );
        }

        const fineWeight = calculateFineEquivalent(grossWeight, touchPercent);
        const adminPoolAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `ADMIN_POOL_${purity.code}`,
          `Admin Stock Pool - ${purity.displayLabel}`,
          "ADMIN_KARAT_POOL",
          purity.id,
          null
        );
        const inflowAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `KARIGAR_RECOVERY_INFLOW_${purity.code}`,
          `Karigar Recovery Inflow - ${purity.displayLabel}`,
          "EXTERNAL_SUPPLIER_INFLOW",
          purity.id,
          null
        );

        totalGross = roundInternal(totalGross.add(grossWeight));
        totalFine = roundInternal(totalFine.add(fineWeight));
        preparedLines.push({
          purity,
          grossWeight,
          touchPercent,
          fineWeight,
          adminPoolAcct,
          inflowAcct,
        });
      }

      const weightedTouch = totalGross.gt(ZERO)
        ? roundTouch(totalFine.mul(new Decimal(100)).div(totalGross))
        : ZERO;

      // Post receipt first so lines & allocations can reference it
      let receipt = await tx.createRecoveryReceipt({
        id: receiptId,
        organizationId: validActor.organizationId,
        karigarId: karigar.id,
        receiptNumber,
        businessDate,
        recoveredGrossWeight: totalGross,
        recoveredTouchPercent: weightedTouch,
        recoveredFineWeight: totalFine,
        unallocatedFineWeight: totalFine,
        referenceNumber: input.referenceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        status: "POSTED",
        idempotencyKey: input.idempotencyKey,
        journalTransactionId: null,
        createdById: validActor.userId,
        createdAt: now,
        updatedAt: now,
        reversedAt: null,
        reversalReason: null,
      });

      const createdLines: RecoveryReceiptLineEntity[] = [];
      for (let i = 0; i < preparedLines.length; i++) {
        const pl = preparedLines[i];
        const jtx = await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "KARIGAR_RECOVERY_RECEIPT",
          businessDate,
          purity: pl.purity,
          physicalWeight: pl.grossWeight,
          fineEquivalentWeight: pl.fineWeight,
          sourceAccount: pl.inflowAcct,
          destinationAccount: pl.adminPoolAcct,
          sourceReference: input.referenceNumber?.trim() || receiptNumber,
          reason: `Karigar recovery receipt ${receiptNumber} from ${karigar.name} (${pl.grossWeight.toFixed(
            3
          )}g @ ${pl.touchPercent.toFixed(2)}% = ${pl.fineWeight.toFixed(
            4
          )}g fine)`,
          karigarId: karigar.id,
          idempotencyKey: `rcv_jnl_${input.idempotencyKey}_${i}`,
        });

        if (i === 0) {
          receipt = { ...receipt, journalTransactionId: jtx.id };
        }

        const line = await tx.createRecoveryReceiptLine({
          id: newId("rcvl"),
          organizationId: validActor.organizationId,
          recoveryReceiptId: receipt.id,
          purityId: pl.purity.id,
          destinationAccountId: pl.adminPoolAcct.id,
          grossWeight: pl.grossWeight,
          touchPercent: pl.touchPercent,
          fineWeight: pl.fineWeight,
          journalTransactionId: jtx.id,
          createdAt: now,
        });
        createdLines.push(line);
      }

      // Perform optional allocation strictly among explicitly selected loss rows
      const createdAllocations: RecoveryAllocationEntity[] = [];
      let remainingReceiptFine = totalFine;

      const mode = input.allocationMode ?? "NONE";
      if (
        mode === "OLDEST_FIRST" ||
        (mode === "MANUAL" &&
          input.manualAllocations &&
          input.manualAllocations.length > 0)
      ) {
        const [allLosses, allAllocs, allWriteOffs, allMakingDeds] =
          await Promise.all([
            tx.listProcessLossRecords(validActor.organizationId),
            tx.listRecoveryAllocations(validActor.organizationId),
            tx.listLossWriteOffs(validActor.organizationId),
            tx.listMakingDeductionAllocations(validActor.organizationId),
          ]);

        if (mode === "MANUAL" && input.manualAllocations) {
          for (let i = 0; i < input.manualAllocations.length; i++) {
            const ma = input.manualAllocations[i];
            const allocAmt = roundInternal(ma.allocatedFineWeight);
            if (allocAmt.lte(ZERO)) continue;

            const loss = allLosses.find((l) => l.id === ma.processLossRecordId);
            if (!loss) {
              throw new NotFoundError(
                `Loss record ${ma.processLossRecordId} not found`
              );
            }
            if (loss.karigarId !== karigar.id) {
              throw new ValidationError(
                "Cross-karigar allocation is forbidden: loss record belongs to a different karigar"
              );
            }
            if (loss.eligibilityStatus !== "ELIGIBLE") {
              throw new ValidationError(
                `Loss record ${loss.id} is not ELIGIBLE for recovery (${loss.eligibilityStatus})`
              );
            }

            const { outstandingFine } = this.computeLossBalances(
              loss,
              allAllocs,
              allWriteOffs,
              allMakingDeds
            );
            if (allocAmt.gt(outstandingFine)) {
              throw new ValidationError(
                `Allocation (${allocAmt.toFixed(
                  4
                )}g fine) exceeds loss record outstanding balance (${outstandingFine.toFixed(
                  4
                )}g fine)`
              );
            }
            if (allocAmt.gt(remainingReceiptFine)) {
              throw new ValidationError(
                `Allocation exceeds remaining receipt fine balance (${remainingReceiptFine.toFixed(
                  4
                )}g fine)`
              );
            }

            const alloc = await tx.createRecoveryAllocation({
              id: newId("ralloc"),
              organizationId: validActor.organizationId,
              recoveryReceiptId: receipt.id,
              processLossRecordId: loss.id,
              allocatedFineWeight: allocAmt,
              status: "ACTIVE",
              businessDate,
              notes: input.notes?.trim() || null,
              idempotencyKey: `alloc_${input.idempotencyKey}_${i}`,
              createdById: validActor.userId,
              createdAt: now,
              undoneAt: null,
              undoneById: null,
              undoReason: null,
            });
            createdAllocations.push(alloc);
            allAllocs.push(alloc);
            remainingReceiptFine = roundInternal(
              remainingReceiptFine.sub(allocAmt)
            );
          }
        } else if (mode === "OLDEST_FIRST") {
          let selectedLosses: typeof allLosses;
          if (
            input.selectedLossRecordIds &&
            input.selectedLossRecordIds.length > 0
          ) {
            const selectedSet = new Set(input.selectedLossRecordIds);
            selectedLosses = allLosses
              .filter((l) => selectedSet.has(l.id))
              .sort(
                (a, b) => a.businessDate.getTime() - b.businessDate.getTime()
              );

            if (selectedLosses.length !== selectedSet.size) {
              throw new NotFoundError(
                "One or more selected loss records were not found in this organization"
              );
            }
          } else {
            selectedLosses = allLosses
              .filter(
                (l) =>
                  l.karigarId === karigar.id &&
                  l.eligibilityStatus === "ELIGIBLE"
              )
              .sort(
                (a, b) => a.businessDate.getTime() - b.businessDate.getTime()
              );
          }

          for (let i = 0; i < selectedLosses.length; i++) {
            const loss = selectedLosses[i];
            if (loss.karigarId !== karigar.id) {
              throw new ValidationError(
                "Cross-karigar allocation is forbidden: loss record belongs to a different karigar"
              );
            }
            if (loss.eligibilityStatus !== "ELIGIBLE") {
              throw new ValidationError(
                `Loss record ${loss.id} is not ELIGIBLE for recovery (${loss.eligibilityStatus})`
              );
            }
            if (remainingReceiptFine.lte(ZERO)) break;

            const { outstandingFine } = this.computeLossBalances(
              loss,
              allAllocs,
              allWriteOffs,
              allMakingDeds
            );
            if (outstandingFine.lte(ZERO)) continue;

            const toAllocate = remainingReceiptFine.lt(outstandingFine)
              ? remainingReceiptFine
              : outstandingFine;

            const alloc = await tx.createRecoveryAllocation({
              id: newId("ralloc"),
              organizationId: validActor.organizationId,
              recoveryReceiptId: receipt.id,
              processLossRecordId: loss.id,
              allocatedFineWeight: toAllocate,
              status: "ACTIVE",
              businessDate,
              notes: input.notes?.trim() || null,
              idempotencyKey: `alloc_${input.idempotencyKey}_${i}`,
              createdById: validActor.userId,
              createdAt: now,
              undoneAt: null,
              undoneById: null,
              undoReason: null,
            });
            createdAllocations.push(alloc);
            allAllocs.push(alloc);
            remainingReceiptFine = roundInternal(
              remainingReceiptFine.sub(toAllocate)
            );
          }
        }
      }

      receipt = await tx.updateRecoveryReceipt({
        ...receipt,
        unallocatedFineWeight: remainingReceiptFine,
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "RecoveryReceipt",
        entityId: receipt.id,
        action: "RECOVERY_RECEIPT_POSTED",
        summary: `Recorded recovery ${receiptNumber} from ${karigar.name}: ${totalGross.toFixed(
          3
        )}g (${totalFine.toFixed(
          4
        )}g fine). Allocated to ${createdAllocations.length} loss record(s); unallocated credit: ${remainingReceiptFine.toFixed(
          4
        )}g fine.`,
        metadataJson: null,
        createdAt: now,
      });

      return { receipt, lines: createdLines, allocations: createdAllocations };
    });
  }

  public async allocateRecoveryReceipt(
    actor: ActorContext,
    input: {
      recoveryReceiptId: string;
      businessDate?: string | Date;
      notes?: string;
      allocations: Array<{
        processLossRecordId: string;
        allocatedFineWeight: DecimalInput;
      }>;
      idempotencyKey: string;
    }
  ): Promise<{
    receipt: RecoveryReceiptEntity;
    allocations: RecoveryAllocationEntity[];
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existingFirst = await tx.getRecoveryAllocationByIdempotencyKey(
        `${input.idempotencyKey}_0`
      );
      if (existingFirst) {
        const receipt = (await tx.getRecoveryReceiptById(
          validActor.organizationId,
          existingFirst.recoveryReceiptId
        ))!;
        const allocs = await tx.listRecoveryAllocations(
          validActor.organizationId,
          { recoveryReceiptId: receipt.id }
        );
        return { receipt, allocations: allocs };
      }

      const receipt = await tx.getRecoveryReceiptById(
        validActor.organizationId,
        input.recoveryReceiptId
      );
      if (!receipt) {
        throw new NotFoundError(
          `Recovery receipt ${input.recoveryReceiptId} not found`
        );
      }
      if (receipt.status !== "POSTED") {
        throw new ConflictError("Cannot allocate a REVERSED recovery receipt");
      }

      const [allLosses, allAllocs, allWriteOffs, allMakingDeds] =
        await Promise.all([
          tx.listProcessLossRecords(validActor.organizationId),
          tx.listRecoveryAllocations(validActor.organizationId),
          tx.listLossWriteOffs(validActor.organizationId),
          tx.listMakingDeductionAllocations(validActor.organizationId),
        ]);

      let remaining = receipt.unallocatedFineWeight;
      const now = new Date();
      const created: RecoveryAllocationEntity[] = [];

      for (let i = 0; i < input.allocations.length; i++) {
        const item = input.allocations[i];
        const amt = roundInternal(item.allocatedFineWeight);
        if (amt.lte(ZERO)) {
          throw new ValidationError("Allocation fine amount must be positive");
        }
        const loss = allLosses.find((l) => l.id === item.processLossRecordId);
        if (!loss) {
          throw new NotFoundError(
            `Loss record ${item.processLossRecordId} not found`
          );
        }
        if (loss.karigarId !== receipt.karigarId) {
          throw new ValidationError(
            "Cross-karigar allocation is forbidden: receipt and loss belong to different karigars"
          );
        }
        if (loss.eligibilityStatus !== "ELIGIBLE") {
          throw new ValidationError(
            `Loss record ${loss.id} is not ELIGIBLE for recovery (${loss.eligibilityStatus})`
          );
        }

        const { outstandingFine } = this.computeLossBalances(
          loss,
          allAllocs,
          allWriteOffs,
          allMakingDeds
        );
        if (amt.gt(outstandingFine)) {
          throw new ValidationError(
            `Allocation (${amt.toFixed(
              4
            )}g) exceeds outstanding loss (${outstandingFine.toFixed(4)}g)`
          );
        }
        if (amt.gt(remaining)) {
          throw new ValidationError(
            `Allocation (${amt.toFixed(
              4
            )}g) exceeds unallocated receipt balance (${remaining.toFixed(4)}g)`
          );
        }

        const alloc = await tx.createRecoveryAllocation({
          id: newId("ralloc"),
          organizationId: validActor.organizationId,
          recoveryReceiptId: receipt.id,
          processLossRecordId: loss.id,
          allocatedFineWeight: amt,
          status: "ACTIVE",
          businessDate,
          notes: input.notes?.trim() || null,
          idempotencyKey: `${input.idempotencyKey}_${i}`,
          createdById: validActor.userId,
          createdAt: now,
          undoneAt: null,
          undoneById: null,
          undoReason: null,
        });
        created.push(alloc);
        allAllocs.push(alloc);
        remaining = roundInternal(remaining.sub(amt));
      }

      const updatedReceipt = await tx.updateRecoveryReceipt({
        ...receipt,
        unallocatedFineWeight: remaining,
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "RecoveryReceipt",
        entityId: receipt.id,
        action: "RECOVERY_ALLOCATED",
        summary: `Allocated ${receipt.unallocatedFineWeight
          .sub(remaining)
          .toFixed(4)}g fine from ${
          receipt.receiptNumber
        } across ${created.length} loss record(s). Remaining unallocated: ${remaining.toFixed(
          4
        )}g fine.`,
        metadataJson: null,
        createdAt: now,
      });

      return { receipt: updatedReceipt, allocations: created };
    });
  }

  public async writeOffProcessLoss(
    actor: ActorContext,
    input: {
      processLossRecordId: string;
      fineAmount: DecimalInput;
      businessDate?: string | Date;
      reason: string;
      idempotencyKey: string;
    }
  ): Promise<LossWriteOffEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const fineAmount = roundInternal(input.fineAmount);
    if (fineAmount.lte(ZERO)) {
      throw new ValidationError("Write-off fine amount must be greater than zero");
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Write-off reason is required");
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getLossWriteOffByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return existing;

      const loss = await tx.getProcessLossRecordById(
        validActor.organizationId,
        input.processLossRecordId
      );
      if (!loss) {
        throw new NotFoundError(
          `Process loss record ${input.processLossRecordId} not found`
        );
      }
      if (loss.eligibilityStatus !== "ELIGIBLE") {
        throw new ValidationError(
          `Cannot write off loss record in status ${loss.eligibilityStatus}`
        );
      }

      const [allocs, writeOffs, makingDeds] = await Promise.all([
        tx.listRecoveryAllocations(validActor.organizationId, {
          processLossRecordId: loss.id,
        }),
        tx.listLossWriteOffs(validActor.organizationId, {
          processLossRecordId: loss.id,
        }),
        tx.listMakingDeductionAllocations(validActor.organizationId, {
          processLossRecordId: loss.id,
        }),
      ]);
      const { outstandingFine } = this.computeLossBalances(
        loss,
        allocs,
        writeOffs,
        makingDeds
      );
      if (fineAmount.gt(outstandingFine)) {
        throw new ValidationError(
          `Write-off (${fineAmount.toFixed(
            4
          )}g fine) exceeds outstanding balance (${outstandingFine.toFixed(
            4
          )}g fine)`
        );
      }

      const now = new Date();
      const writeOff = await tx.createLossWriteOff({
        id: newId("lwo"),
        organizationId: validActor.organizationId,
        processLossRecordId: loss.id,
        karigarId: loss.karigarId,
        writtenOffFineWeight: fineAmount,
        businessDate,
        reason,
        status: "ACTIVE",
        idempotencyKey: input.idempotencyKey,
        createdById: validActor.userId,
        createdAt: now,
        reversedAt: null,
        reversalReason: null,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "ProcessLossRecord",
        entityId: loss.id,
        action: "PROCESS_LOSS_WRITTEN_OFF",
        summary: `Wrote off ${fineAmount.toFixed(
          4
        )}g fine on loss ${loss.id} (${loss.processType}): ${reason}`,
        metadataJson: null,
        createdAt: now,
      });

      return writeOff;
    });
  }

  public async undoRecoveryAllocation(
    actor: ActorContext,
    input: {
      allocationId: string;
      reason: string;
    }
  ): Promise<{
    allocation: RecoveryAllocationEntity;
    receipt: RecoveryReceiptEntity;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Reason is required to undo an allocation");
    }

    return this.repo.runInTransaction(async (tx) => {
      const alloc = await tx.getRecoveryAllocationById(
        validActor.organizationId,
        input.allocationId
      );
      if (!alloc) {
        throw new NotFoundError(`Allocation ${input.allocationId} not found`);
      }
      if (alloc.status !== "ACTIVE") {
        throw new ConflictError(
          `Allocation is already in status ${alloc.status}`
        );
      }

      const receipt = (await tx.getRecoveryReceiptById(
        validActor.organizationId,
        alloc.recoveryReceiptId
      ))!;
      if (receipt.status !== "POSTED") {
        throw new ConflictError("Parent receipt is already reversed");
      }

      const now = new Date();
      const updatedAlloc = await tx.updateRecoveryAllocation({
        ...alloc,
        status: "UNDONE",
        undoneAt: now,
        undoneById: validActor.userId,
        undoReason: reason,
      });

      // Restores unallocated receipt credit without any physical stock movement
      const updatedReceipt = await tx.updateRecoveryReceipt({
        ...receipt,
        unallocatedFineWeight: roundInternal(
          receipt.unallocatedFineWeight.add(alloc.allocatedFineWeight)
        ),
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "RecoveryAllocation",
        entityId: alloc.id,
        action: "RECOVERY_ALLOCATION_UNDONE",
        summary: `Undid allocation of ${alloc.allocatedFineWeight.toFixed(
          4
        )}g fine on receipt ${receipt.receiptNumber}: ${reason}`,
        metadataJson: null,
        createdAt: now,
      });

      return { allocation: updatedAlloc, receipt: updatedReceipt };
    });
  }

  public async reverseRecoveryReceipt(
    actor: ActorContext,
    input: {
      receiptId: string;
      reason: string;
      idempotencyKey: string;
    }
  ): Promise<RecoveryReceiptEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Reason is required to reverse a receipt");
    }

    return this.repo.runInTransaction(async (tx) => {
      const receipt = await tx.getRecoveryReceiptById(
        validActor.organizationId,
        input.receiptId
      );
      if (!receipt) {
        throw new NotFoundError(`Recovery receipt ${input.receiptId} not found`);
      }
      if (receipt.status === "REVERSED") {
        return receipt;
      }

      const [lines, allocs] = await Promise.all([
        tx.listRecoveryReceiptLines(validActor.organizationId, receipt.id),
        tx.listRecoveryAllocations(validActor.organizationId, {
          recoveryReceiptId: receipt.id,
        }),
      ]);

      const now = new Date();

      // Check stock availability on each line's destination account before reversing
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const adminPoolAcct = (await tx.getStockAccountById(
          validActor.organizationId,
          line.destinationAccountId
        ))!;
        if (adminPoolAcct.cachedPhysicalBalance.lt(line.grossWeight)) {
          throw new ConflictError(
            `Cannot reverse recovery receipt ${receipt.receiptNumber}: Admin stock (${adminPoolAcct.name}) only has ${adminPoolAcct.cachedPhysicalBalance.toFixed(
              3
            )}g available, need ${line.grossWeight.toFixed(3)}g`
          );
        }
      }

      // Reverse each line's stock journal transaction
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const purity = (await tx.getPurityById(
          validActor.organizationId,
          line.purityId
        ))!;
        const adminPoolAcct = (await tx.getStockAccountById(
          validActor.organizationId,
          line.destinationAccountId
        ))!;
        const inflowAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `KARIGAR_RECOVERY_INFLOW_${purity.code}`,
          `Karigar Recovery Inflow - ${purity.displayLabel}`,
          "EXTERNAL_SUPPLIER_INFLOW",
          purity.id,
          null
        );

        await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "KARIGAR_RECOVERY_RECEIPT_REVERSAL",
          businessDate: receipt.businessDate,
          purity,
          physicalWeight: line.grossWeight,
          fineEquivalentWeight: line.fineWeight,
          sourceAccount: adminPoolAcct,
          destinationAccount: inflowAcct,
          sourceReference: receipt.receiptNumber,
          reason: `Reversed recovery receipt ${receipt.receiptNumber}: ${reason}`,
          karigarId: receipt.karigarId,
          idempotencyKey: `rcv_rev_${input.idempotencyKey}_${i}`,
          reversalOfTransactionId: line.journalTransactionId,
        });
        await tx.markJournalTransactionReversed(line.journalTransactionId);
      }

      // Mark dependent active allocations as REVERSED_WITH_RECEIPT
      for (const a of allocs) {
        if (a.status === "ACTIVE") {
          await tx.updateRecoveryAllocation({
            ...a,
            status: "REVERSED_WITH_RECEIPT",
            undoneAt: now,
            undoneById: validActor.userId,
            undoReason: `Receipt reversed: ${reason}`,
          });
        }
      }

      const updatedReceipt = await tx.updateRecoveryReceipt({
        ...receipt,
        status: "REVERSED",
        unallocatedFineWeight: ZERO,
        reversedAt: now,
        reversalReason: reason,
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "RecoveryReceipt",
        entityId: receipt.id,
        action: "RECOVERY_RECEIPT_REVERSED",
        summary: `Reversed recovery receipt ${receipt.receiptNumber} (${receipt.recoveredGrossWeight.toFixed(
          3
        )}g / ${receipt.recoveredFineWeight.toFixed(4)}g fine): ${reason}`,
        metadataJson: null,
        createdAt: now,
      });

      return updatedReceipt;
    });
  }

  public async refundExcessRecoveryReceipt(
    actor: ActorContext,
    input: {
      receiptId: string;
      purityId: string;
      grossWeight: DecimalInput;
      touchPercent?: DecimalInput;
      businessDate?: string | Date;
      reason: string;
      idempotencyKey: string;
    }
  ): Promise<RecoveryReceiptEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const grossWeight = roundInternal(input.grossWeight);
    if (grossWeight.lte(ZERO)) {
      throw new ValidationError("Refund weight must be greater than zero");
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Refund reason is required");
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existingJtx = await tx.getJournalTransactionByIdempotencyKey(
        `rcv_refund_${input.idempotencyKey}`
      );
      const receipt = await tx.getRecoveryReceiptById(
        validActor.organizationId,
        input.receiptId
      );
      if (!receipt) {
        throw new NotFoundError(`Recovery receipt ${input.receiptId} not found`);
      }
      if (existingJtx) return receipt;
      if (receipt.status !== "POSTED") {
        throw new ConflictError("Cannot refund a reversed receipt");
      }

      const purity = await tx.getPurityById(
        validActor.organizationId,
        input.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${input.purityId} not found`);
      }
      const touch =
        input.touchPercent !== undefined && input.touchPercent !== ""
          ? roundTouch(input.touchPercent)
          : purity.touchPercent;
      const fineWeight = calculateFineEquivalent(grossWeight, touch);

      if (fineWeight.gt(receipt.unallocatedFineWeight)) {
        throw new ValidationError(
          `Refund fine (${fineWeight.toFixed(
            4
          )}g) exceeds unallocated credit (${receipt.unallocatedFineWeight.toFixed(
            4
          )}g)`
        );
      }

      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );
      if (adminPoolAcct.cachedPhysicalBalance.lt(grossWeight)) {
        throw new ValidationError(
          `Insufficient stock in ${purity.displayLabel} for refund`
        );
      }

      const inflowAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `KARIGAR_RECOVERY_INFLOW_${purity.code}`,
        `Karigar Recovery Inflow - ${purity.displayLabel}`,
        "EXTERNAL_SUPPLIER_INFLOW",
        purity.id,
        null
      );

      await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "KARIGAR_RECOVERY_REFUND",
        businessDate,
        purity,
        physicalWeight: grossWeight,
        fineEquivalentWeight: fineWeight,
        sourceAccount: adminPoolAcct,
        destinationAccount: inflowAcct,
        sourceReference: receipt.receiptNumber,
        reason: `Physical refund of excess recovery credit (${receipt.receiptNumber}): ${reason}`,
        karigarId: receipt.karigarId,
        idempotencyKey: `rcv_refund_${input.idempotencyKey}`,
      });

      const now = new Date();
      const updated = await tx.updateRecoveryReceipt({
        ...receipt,
        unallocatedFineWeight: roundInternal(
          receipt.unallocatedFineWeight.sub(fineWeight)
        ),
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "RecoveryReceipt",
        entityId: receipt.id,
        action: "RECOVERY_EXCESS_REFUNDED",
        summary: `Refunded ${grossWeight.toFixed(3)}g (${fineWeight.toFixed(
          4
        )}g fine) excess credit on ${receipt.receiptNumber}: ${reason}`,
        metadataJson: null,
        createdAt: now,
      });

      return updated;
    });
  }

  public async getKarigarRecoveryWorkspace(
    actor: ActorContext,
    filters?: {
      karigarId?: string;
      processType?: ProcessType;
      orderId?: string;
      fromDate?: string;
      toDate?: string;
      settlementStatus?: "ALL" | "OUTSTANDING" | "PARTIAL" | "SETTLED";
    }
  ) {
    const validActor = this.assertAuthenticated(actor);

    return this.repo.runInTransaction(async (tx) => {
      const [
        karigars,
        purities,
        orders,
        visits,
        losses,
        receipts,
        receiptLines,
        allocations,
        writeOffs,
        makingDeductions,
        settlements,
        accounts,
        lines,
      ] = await Promise.all([
        tx.listKarigars(validActor.organizationId),
        tx.listPurities(validActor.organizationId),
        tx.listOrders(validActor.organizationId),
        tx.listProcessVisits(validActor.organizationId),
        tx.listProcessLossRecords(validActor.organizationId),
        tx.listRecoveryReceipts(validActor.organizationId),
        tx.listRecoveryReceiptLines(validActor.organizationId),
        tx.listRecoveryAllocations(validActor.organizationId),
        tx.listLossWriteOffs(validActor.organizationId),
        tx.listMakingDeductionAllocations(validActor.organizationId),
        tx.listRecoverySettlements(validActor.organizationId),
        tx.listStockAccounts(validActor.organizationId),
        tx.listJournalLines(validActor.organizationId),
      ]);

      const karigarMap = new Map(karigars.map((k) => [k.id, k]));
      const purityMap = new Map(purities.map((p) => [p.id, p]));
      const orderMap = new Map(orders.map((o) => [o.id, o]));
      const visitMap = new Map(visits.map((v) => [v.id, v]));

      const linePhysByAcct = new Map<string, Decimal>();
      const lineFineByAcct = new Map<string, Decimal>();
      for (const l of lines) {
        linePhysByAcct.set(
          l.accountId,
          roundInternal(
            (linePhysByAcct.get(l.accountId) ?? ZERO).add(l.signedPhysicalDelta)
          )
        );
        lineFineByAcct.set(
          l.accountId,
          roundInternal(
            (lineFineByAcct.get(l.accountId) ?? ZERO).add(l.signedFineDelta)
          )
        );
      }

      // Build enriched eligible loss rows
      const allEligibleLossRows = losses
        .filter((l) => l.eligibilityStatus === "ELIGIBLE")
        .map((l) => {
          const order = orderMap.get(l.orderId);
          const visit = visitMap.get(l.processVisitId);
          const kar = karigarMap.get(l.karigarId);
          const {
            makingAllowedFine,
            recoveredFine,
            writtenOffFine,
            outstandingFine,
          } = this.computeLossBalances(
            l,
            allocations,
            writeOffs,
            makingDeductions
          );
          const settlementStatus = outstandingFine.isZero()
            ? "SETTLED"
            : makingAllowedFine.gt(ZERO) ||
              recoveredFine.gt(ZERO) ||
              writtenOffFine.gt(ZERO)
            ? "PARTIAL"
            : "OUTSTANDING";

          const completionDate = l.eligibleAt ?? l.businessDate;
          return {
            id: l.id,
            orderId: l.orderId,
            bagNumber: order?.bagNumber ?? "-",
            orderName: order?.orderName ?? "-",
            orderStatus: order?.status ?? "-",
            processType: l.processType,
            visitNumber: visit?.visitNumber ?? 1,
            karigarId: l.karigarId,
            karigarName: kar ? `${kar.name} (${kar.karigarCode})` : "-",
            completionDate: completionDate.toISOString(),
            businessDate: l.businessDate.toISOString(),
            touchPercent: l.touchSnapshot.toFixed(2),
            rawLossWeight: l.rawMetalLossWeight.toFixed(3),
            originalFineLoss: l.fineEquivalentLossWeight.toFixed(4),
            makingAllowedFine: makingAllowedFine.toFixed(4),
            recoveredFine: recoveredFine.toFixed(4),
            writtenOffFine: writtenOffFine.toFixed(4),
            outstandingFine: outstandingFine.toFixed(4),
            settlementStatus,
          };
        })
        .sort(
          (a, b) =>
            new Date(a.completionDate).getTime() -
            new Date(b.completionDate).getTime()
        );

      const fromBoundary = filters?.fromDate
        ? parseBusinessDate(filters.fromDate)
        : null;
      const toBoundary = filters?.toDate
        ? new Date(parseBusinessDate(filters.toDate).getTime() + 86399999)
        : null;

      // Filter loss rows without mutating data
      const filteredLosses = allEligibleLossRows.filter((row) => {
        if (filters?.karigarId && row.karigarId !== filters.karigarId)
          return false;
        if (filters?.processType && row.processType !== filters.processType)
          return false;
        if (filters?.orderId && row.orderId !== filters.orderId) return false;
        if (
          filters?.settlementStatus &&
          filters.settlementStatus !== "ALL" &&
          row.settlementStatus !== filters.settlementStatus
        ) {
          return false;
        }
        const dt = new Date(row.businessDate);
        if (fromBoundary && dt < fromBoundary) return false;
        if (toBoundary && dt > toBoundary) return false;
        return true;
      });

      // Check if older unpaid entries exist outside date filter
      let olderOutstandingCount = 0;
      let olderOutstandingFine = ZERO;
      if (fromBoundary) {
        for (const row of allEligibleLossRows) {
          if (filters?.karigarId && row.karigarId !== filters.karigarId)
            continue;
          const dt = new Date(row.businessDate);
          if (dt < fromBoundary && Number(row.outstandingFine) > 0) {
            olderOutstandingCount++;
            olderOutstandingFine = roundInternal(
              olderOutstandingFine.add(row.outstandingFine)
            );
          }
        }
      }

      // Per-karigar summaries
      const karigarSummaries = karigars.map((k) => {
        const kAcct = accounts.find(
          (a) => a.accountType === "KARIGAR_CUSTODY" && a.karigarId === k.id
        );
        const custodyPhysical = kAcct
          ? linePhysByAcct.get(kAcct.id) ?? ZERO
          : ZERO;
        const custodyFine = kAcct ? lineFineByAcct.get(kAcct.id) ?? ZERO : ZERO;

        const kLosses = allEligibleLossRows.filter((l) => l.karigarId === k.id);
        const eligibleOriginalFine = kLosses.reduce(
          (s, l) => roundInternal(s.add(l.originalFineLoss)),
          ZERO
        );
        const makingAllowedFine = kLosses.reduce(
          (s, l) => roundInternal(s.add(l.makingAllowedFine)),
          ZERO
        );
        const recoveredFine = kLosses.reduce(
          (s, l) => roundInternal(s.add(l.recoveredFine)),
          ZERO
        );
        const writtenOffFine = kLosses.reduce(
          (s, l) => roundInternal(s.add(l.writtenOffFine)),
          ZERO
        );
        const outstandingFine = kLosses.reduce(
          (s, l) => roundInternal(s.add(l.outstandingFine)),
          ZERO
        );
        const unallocatedCreditFine = receipts
          .filter((r) => r.karigarId === k.id && r.status === "POSTED")
          .reduce(
            (s, r) => roundInternal(s.add(r.unallocatedFineWeight)),
            ZERO
          );

        return {
          karigarId: k.id,
          karigarCode: k.karigarCode,
          karigarName: k.name,
          custodyPhysicalWeight: custodyPhysical.toFixed(3),
          custodyFineWeight: custodyFine.toFixed(4),
          eligibleOriginalFine: eligibleOriginalFine.toFixed(4),
          makingAllowedFine: makingAllowedFine.toFixed(4),
          recoveredFine: recoveredFine.toFixed(4),
          writtenOffFine: writtenOffFine.toFixed(4),
          outstandingFine: outstandingFine.toFixed(4),
          unallocatedCreditFine: unallocatedCreditFine.toFixed(4),
        };
      });

      // Enriched receipts
      const enrichedReceipts = receipts
        .filter((r) => !filters?.karigarId || r.karigarId === filters.karigarId)
        .map((r) => {
          const kar = r.karigarId ? karigarMap.get(r.karigarId) : undefined;
          const rLines = receiptLines
            .filter((l) => l.recoveryReceiptId === r.id)
            .map((l) => ({
              id: l.id,
              purityId: l.purityId,
              purityLabel: purityMap.get(l.purityId)?.displayLabel ?? "-",
              grossWeight: l.grossWeight.toFixed(3),
              touchPercent: l.touchPercent.toFixed(2),
              fineWeight: l.fineWeight.toFixed(4),
            }));
          const rAllocs = allocations
            .filter((a) => a.recoveryReceiptId === r.id)
            .map((a) => {
              const loss = losses.find((l) => l.id === a.processLossRecordId);
              const ord = loss ? orderMap.get(loss.orderId) : undefined;
              return {
                id: a.id,
                processLossRecordId: a.processLossRecordId,
                bagNumber: ord?.bagNumber ?? "-",
                processType: loss?.processType ?? "FILING",
                allocatedFineWeight: a.allocatedFineWeight.toFixed(4),
                status: a.status,
                businessDate: a.businessDate.toISOString(),
              };
            });
          return {
            id: r.id,
            receiptNumber: r.receiptNumber,
            karigarId: r.karigarId,
            karigarName: kar ? `${kar.name} (${kar.karigarCode})` : "-",
            businessDate: r.businessDate.toISOString(),
            createdAt: r.createdAt.toISOString(),
            recoveredGrossWeight: r.recoveredGrossWeight.toFixed(3),
            recoveredTouchPercent: r.recoveredTouchPercent.toFixed(2),
            recoveredFineWeight: r.recoveredFineWeight.toFixed(4),
            unallocatedFineWeight: r.unallocatedFineWeight.toFixed(4),
            referenceNumber: r.referenceNumber,
            notes: r.notes,
            status: r.status,
            lines: rLines,
            allocations: rAllocs,
          };
        });

      // Period Reconciliation (Rule 11):
      // opening outstanding + newly eligible loss + adjustments - recovery allocations - write-offs = closing outstanding
      const isBeforeFrom = (dt: Date) =>
        fromBoundary ? dt < fromBoundary : false;
      const isInPeriod = (dt: Date) =>
        (!fromBoundary || dt >= fromBoundary) &&
        (!toBoundary || dt <= toBoundary);

      const eligibleBeforePeriod = losses
        .filter(
          (l) =>
            l.eligibilityStatus === "ELIGIBLE" &&
            (!filters?.karigarId || l.karigarId === filters.karigarId) &&
            isBeforeFrom(l.businessDate)
        )
        .reduce(
          (s, l) => roundInternal(s.add(l.fineEquivalentLossWeight)),
          ZERO
        );
      const allocBeforePeriod = allocations
        .filter((a) => {
          if (a.status !== "ACTIVE") return false;
          const loss = losses.find((l) => l.id === a.processLossRecordId);
          if (filters?.karigarId && loss?.karigarId !== filters.karigarId)
            return false;
          return isBeforeFrom(a.businessDate);
        })
        .reduce((s, a) => roundInternal(s.add(a.allocatedFineWeight)), ZERO);
      const writeOffBeforePeriod = writeOffs
        .filter(
          (w) =>
            w.status === "ACTIVE" &&
            (!filters?.karigarId || w.karigarId === filters.karigarId) &&
            isBeforeFrom(w.businessDate)
        )
        .reduce((s, w) => roundInternal(s.add(w.writtenOffFineWeight)), ZERO);
      const makingBeforePeriod = makingDeductions
        .filter(
          (m) =>
            m.status === "ACTIVE" &&
            (!filters?.karigarId || m.karigarId === filters.karigarId) &&
            isBeforeFrom(m.businessDate)
        )
        .reduce((s, m) => roundInternal(s.add(m.deductedFineWeight)), ZERO);

      const openingOutstandingFine = roundInternal(
        eligibleBeforePeriod
          .sub(makingBeforePeriod)
          .sub(allocBeforePeriod)
          .sub(writeOffBeforePeriod)
      );

      const newlyEligibleLossFine = losses
        .filter(
          (l) =>
            l.eligibilityStatus === "ELIGIBLE" &&
            (!filters?.karigarId || l.karigarId === filters.karigarId) &&
            isInPeriod(l.businessDate)
        )
        .reduce(
          (s, l) => roundInternal(s.add(l.fineEquivalentLossWeight)),
          ZERO
        );

      const makingDeductionsFine = makingDeductions
        .filter(
          (m) =>
            m.status === "ACTIVE" &&
            (!filters?.karigarId || m.karigarId === filters.karigarId) &&
            isInPeriod(m.businessDate)
        )
        .reduce((s, m) => roundInternal(s.add(m.deductedFineWeight)), ZERO);

      const recoveryAllocationsFine = allocations
        .filter((a) => {
          if (a.status !== "ACTIVE") return false;
          const loss = losses.find((l) => l.id === a.processLossRecordId);
          if (filters?.karigarId && loss?.karigarId !== filters.karigarId)
            return false;
          return isInPeriod(a.businessDate);
        })
        .reduce((s, a) => roundInternal(s.add(a.allocatedFineWeight)), ZERO);

      const writeOffsFine = writeOffs
        .filter(
          (w) =>
            w.status === "ACTIVE" &&
            (!filters?.karigarId || w.karigarId === filters.karigarId) &&
            isInPeriod(w.businessDate)
        )
        .reduce((s, w) => roundInternal(s.add(w.writtenOffFineWeight)), ZERO);

      const physicalReceiptsFine = receipts
        .filter(
          (r) =>
            r.status === "POSTED" &&
            (!filters?.karigarId || r.karigarId === filters.karigarId) &&
            isInPeriod(r.businessDate)
        )
        .reduce((s, r) => roundInternal(s.add(r.recoveredFineWeight)), ZERO);

      const closingOutstandingFine = roundInternal(
        openingOutstandingFine
          .add(newlyEligibleLossFine)
          .sub(makingDeductionsFine)
          .sub(recoveryAllocationsFine)
          .sub(writeOffsFine)
      );

      // Group outstanding eligible losses by touchPercent for the selected karigar/process scope
      const touchGroupMap = new Map<
        string,
        {
          touchPercent: string;
          outstandingFine: Decimal;
          originalFineLoss: Decimal;
          makingAllowedFine: Decimal;
          recoveredFine: Decimal;
          writtenOffFine: Decimal;
          hasPriorMakingDeduction: boolean;
          claimIds: string[];
        }
      >();
      for (const row of filteredLosses) {
        if (Number(row.outstandingFine) <= 0) continue;
        const existing = touchGroupMap.get(row.touchPercent) ?? {
          touchPercent: row.touchPercent,
          outstandingFine: ZERO,
          originalFineLoss: ZERO,
          makingAllowedFine: ZERO,
          recoveredFine: ZERO,
          writtenOffFine: ZERO,
          hasPriorMakingDeduction: false,
          claimIds: [],
        };
        existing.outstandingFine = roundInternal(
          existing.outstandingFine.add(row.outstandingFine)
        );
        existing.originalFineLoss = roundInternal(
          existing.originalFineLoss.add(row.originalFineLoss)
        );
        existing.makingAllowedFine = roundInternal(
          existing.makingAllowedFine.add(row.makingAllowedFine)
        );
        existing.recoveredFine = roundInternal(
          existing.recoveredFine.add(row.recoveredFine)
        );
        existing.writtenOffFine = roundInternal(
          existing.writtenOffFine.add(row.writtenOffFine)
        );
        if (Number(row.makingAllowedFine) > 0) {
          existing.hasPriorMakingDeduction = true;
        }
        existing.claimIds.push(row.id);
        touchGroupMap.set(row.touchPercent, existing);
      }

      const touchGroups = Array.from(touchGroupMap.values())
        .sort((a, b) => Number(b.touchPercent) - Number(a.touchPercent))
        .map((g) => {
          const touchDec = toDecimal(g.touchPercent);
          const metalEq = touchDec.gt(ZERO)
            ? roundInternal(g.outstandingFine.div(touchDec.div(100)))
            : ZERO;
          return {
            touchPercent: g.touchPercent,
            outstandingMetalEquivalent: metalEq.toFixed(3),
            outstandingFine: g.outstandingFine.toFixed(4),
            originalFineLoss: g.originalFineLoss.toFixed(4),
            makingAllowedFine: g.makingAllowedFine.toFixed(4),
            recoveredFine: g.recoveredFine.toFixed(4),
            writtenOffFine: g.writtenOffFine.toFixed(4),
            hasPriorMakingDeduction: g.hasPriorMakingDeduction,
            claimIds: g.claimIds,
            claimCount: g.claimIds.length,
          };
        });

      const enrichedSettlements = settlements
        .filter((st) => !filters?.karigarId || st.karigarId === filters.karigarId)
        .map((st) => {
          const kar = karigarMap.get(st.karigarId);
          const linkedReceipt = st.recoveryReceiptId
            ? enrichedReceipts.find((r) => r.id === st.recoveryReceiptId) ?? null
            : null;
          return {
            id: st.id,
            settlementNumber: st.settlementNumber,
            karigarId: st.karigarId,
            karigarName: kar ? `${kar.name} (${kar.karigarCode})` : "-",
            businessDate: st.businessDate.toISOString(),
            scopeType: st.scopeType,
            scopeTouchPercent: st.scopeTouchPercent
              ? st.scopeTouchPercent.toFixed(2)
              : null,
            scopeProcessType: st.scopeProcessType,
            grossSelectedFine: st.grossSelectedFine.toFixed(4),
            makingDeductionFine: st.makingDeductionFine.toFixed(4),
            makingInputWeight: st.makingInputWeight.toFixed(3),
            makingInputUnit: st.makingInputUnit,
            netExpectedFine: st.netExpectedFine.toFixed(4),
            receivedFine: st.receivedFine.toFixed(4),
            differenceFine: st.differenceFine.toFixed(4),
            shortageAction: st.shortageAction,
            acceptedShortageFine: st.acceptedShortageFine.toFixed(4),
            carriedShortageFine: st.carriedShortageFine.toFixed(4),
            excessFine: st.excessFine.toFixed(4),
            recoveryReceiptId: st.recoveryReceiptId,
            receiptNumber: linkedReceipt?.receiptNumber ?? null,
            receiptLines: linkedReceipt?.lines ?? [],
            allocations: linkedReceipt?.allocations ?? [],
            notes: st.notes,
            status: st.status,
            reversedAt: st.reversedAt ? st.reversedAt.toISOString() : null,
            reversalReason: st.reversalReason,
          };
        });

      return {
        karigarSummaries,
        eligibleLosses: filteredLosses,
        touchGroups,
        settlements: enrichedSettlements,
        olderOutstandingWarning: {
          count: olderOutstandingCount,
          fineWeight: olderOutstandingFine.toFixed(4),
        },
        receipts: enrichedReceipts,
        periodReconciliation: {
          openingOutstandingFine: openingOutstandingFine.toFixed(4),
          newlyEligibleLossFine: newlyEligibleLossFine.toFixed(4),
          documentedAdjustmentsFine: "0.0000",
          makingDeductionsFine: makingDeductionsFine.toFixed(4),
          recoveryAllocationsFine: recoveryAllocationsFine.toFixed(4),
          writeOffsFine: writeOffsFine.toFixed(4),
          closingOutstandingFine: closingOutstandingFine.toFixed(4),
          physicalReceiptsFine: physicalReceiptsFine.toFixed(4),
        },
      };
    });
  }

  // =========================================================================
  // BILLING & CUSTOMER SETTLEMENT MODULE
  // =========================================================================

  private computeBillSettlement(
    bill: CustomerBillEntity,
    allocations: CustomerPaymentAllocationEntity[]
  ) {
    const activeAllocs = allocations.filter(
      (a) => a.billId === bill.id && a.status === "ACTIVE"
    );
    const finePaid = activeAllocs.reduce(
      (s, a) => roundInternal(s.add(a.allocatedFineWeight)),
      ZERO
    );
    const inrPaid = activeAllocs.reduce(
      (s, a) => roundRupees(s.add(a.allocatedRupees)),
      ZERO
    );
    const fineOutstanding = roundInternal(bill.totalFineGold.sub(finePaid));
    const inrOutstanding = roundRupees(bill.totalCashRupees.sub(inrPaid));

    let settlementStatus: BillSettlementStatus = "UNPAID";
    if (fineOutstanding.lte(ZERO) && inrOutstanding.lte(ZERO)) {
      settlementStatus = "SETTLED";
    } else if (finePaid.gt(ZERO) || inrPaid.gt(ZERO)) {
      settlementStatus = "PARTIALLY_SETTLED";
    }

    return {
      finePaid,
      inrPaid,
      fineOutstanding: fineOutstanding.lt(ZERO) ? ZERO : fineOutstanding,
      inrOutstanding: inrOutstanding.lt(ZERO) ? ZERO : inrOutstanding,
      settlementStatus,
    };
  }

  private async computeCustomerBalances(
    tx: ErpTransactionContext,
    organizationId: string,
    customerId: string
  ) {
    const [bills, allocs, goldReceipts, cashReceipts] = await Promise.all([
      tx.listCustomerBills(organizationId, customerId),
      tx.listCustomerPaymentAllocations(organizationId, { customerId }),
      tx.listCustomerGoldReceipts(organizationId, customerId),
      tx.listCustomerCashReceipts(organizationId, customerId),
    ]);

    const postedBills = bills.filter((b) => b.status === "POSTED");
    let fineOwed = ZERO;
    let inrOwed = ZERO;
    for (const b of postedBills) {
      const s = this.computeBillSettlement(b, allocs);
      fineOwed = roundInternal(fineOwed.add(s.fineOutstanding));
      inrOwed = roundRupees(inrOwed.add(s.inrOutstanding));
    }

    const postedReceipts = goldReceipts.filter((r) => r.status === "POSTED");
    const fineAdvance = postedReceipts.reduce(
      (s, r) => roundInternal(s.add(r.unallocatedFineWeight)),
      ZERO
    );
    const grossFineReceivedHistorical = postedReceipts.reduce(
      (s, r) => roundInternal(s.add(r.totalFineWeight)),
      ZERO
    );
    const totalFineRefunded = postedReceipts.reduce(
      (s, r) => roundInternal(s.add(r.refundedFineWeight ?? ZERO)),
      ZERO
    );
    const totalGoldReceivedHistorical = roundInternal(
      grossFineReceivedHistorical.sub(totalFineRefunded)
    );
    const inrAdvance = cashReceipts
      .filter((r) => r.status === "POSTED")
      .reduce((s, r) => roundRupees(s.add(r.unallocatedRupees)), ZERO);

    return {
      fineOwed,
      fineAdvance,
      grossFineReceivedHistorical,
      totalFineRefunded,
      totalGoldReceivedHistorical: totalGoldReceivedHistorical.lt(ZERO)
        ? ZERO
        : totalGoldReceivedHistorical,
      inrOwed,
      inrAdvance,
    };
  }

  private async resolveFineAccountAndConvention(
    tx: ErpTransactionContext,
    organizationId: string
  ): Promise<{
    config: OrganizationCustomerFineConfigEntity;
    purity: PurityEntity | null;
    account: StockAccountEntity | null;
    mode: CustomerFineReceiptMode;
    configuredTouch: Decimal | null;
    finePurity: PurityEntity;
  }> {
    const config = await tx.getOrganizationCustomerFineConfig(organizationId);
    const purities = await tx.listPurities(organizationId);
    let purity: PurityEntity | null = null;
    if (config.customerFineAccountPurityId) {
      purity =
        purities.find((p) => p.id === config.customerFineAccountPurityId) ??
        null;
    }
    if (!purity && config.customerFineReceiptMode !== "UNCONFIGURED") {
      if (
        config.customerFineReceiptMode === "PHYSICAL_AT_CONFIGURED_TOUCH" &&
        config.customerFineConfiguredTouch
      ) {
        purity =
          purities.find(
            (p) =>
              p.isFineCategory &&
              p.touchPercent.eq(config.customerFineConfiguredTouch!)
          ) ??
          purities.find((p) =>
            p.touchPercent.eq(config.customerFineConfiguredTouch!)
          ) ??
          null;
      } else {
        purity =
          purities.find((p) => p.code === "ADMIN_FINE_GOLD") ??
          purities.find(
            (p) => p.isFineCategory && p.touchPercent.eq(new Decimal(100))
          ) ??
          purities.find((p) => p.isFineCategory) ??
          null;
      }
    }
    let fallbackPurity =
      purity ??
      purities.find((p) => p.code === "ADMIN_FINE_GOLD") ??
      purities.find(
        (p) => p.isFineCategory && p.touchPercent.eq(new Decimal(100))
      ) ??
      purities.find((p) => p.isFineCategory) ??
      purities[0] ??
      null;
    if (!fallbackPurity) {
      fallbackPurity = await tx.createPurity({
        id: newId("pur"),
        organizationId,
        code: "ADMIN_FINE_GOLD",
        displayLabel: "Admin Fine Gold",
        karatLabel: "FINE",
        touchPercent: new Decimal(100),
        isFineCategory: true,
        isActive: true,
        sortOrder: 99,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    let account: StockAccountEntity | null = null;
    if (purity) {
      account = await this.ensureSystemAccount(
        tx,
        organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );
    }
    return {
      config,
      purity,
      account,
      mode: config.customerFineReceiptMode,
      configuredTouch: config.customerFineConfiguredTouch,
      finePurity: purity ?? fallbackPurity,
    };
  }

  public async getCustomerFineReceiptConvention(actor: ActorContext) {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction(async (tx) => {
      const { config, purity, account } =
        await this.resolveFineAccountAndConvention(
          tx,
          validActor.organizationId
        );
      return {
        isConfigured: config.customerFineReceiptMode !== "UNCONFIGURED",
        mode: config.customerFineReceiptMode,
        configuredTouch: config.customerFineConfiguredTouch
          ? config.customerFineConfiguredTouch.toFixed(4).replace(/\.?0+$/, "")
          : null,
        accountPurityId: purity?.id ?? config.customerFineAccountPurityId,
        accountPurityCode: purity?.code ?? null,
        accountPurityLabel: purity?.displayLabel ?? "Admin Fine Gold",
        destinationAccountCode: account?.accountCode ?? "ADMIN_FINE_GOLD",
        destinationAccountName:
          account?.name ?? "Admin Fine Gold Stock Account",
        inputLabel:
          config.customerFineReceiptMode === "PHYSICAL_AT_CONFIGURED_TOUCH"
            ? `Physical fine gold weight (g @ ${
                config.customerFineConfiguredTouch
                  ? config.customerFineConfiguredTouch
                      .toFixed(4)
                      .replace(/\.?0+$/, "")
                  : ""
              }% touch)`
            : "Fine gold received (g fine)",
        weightBasisDescription:
          config.customerFineReceiptMode === "PHYSICAL_AT_CONFIGURED_TOUCH"
            ? `Mode B: Input is measured physical weight at fixed ${
                config.customerFineConfiguredTouch
                  ? config.customerFineConfiguredTouch
                      .toFixed(4)
                      .replace(/\.?0+$/, "")
                  : ""
              }% touch (credited fine = physicalWeight × ${
                config.customerFineConfiguredTouch
                  ? config.customerFineConfiguredTouch
                      .toFixed(4)
                      .replace(/\.?0+$/, "")
                  : ""
              } / 100)`
            : config.customerFineReceiptMode === "FINE_EQUIVALENT"
            ? "Mode A: Input is already fine-equivalent grams (g fine). Physical weight is not fabricated unless separately measured."
            : "Unconfigured — Owner must choose Mode A (Fine-equivalent grams) or Mode B (Physical weight at configured touch) before receiving customer fine gold.",
      };
    });
  }

  public async configureCustomerFineReceiptConvention(
    actor: ActorContext,
    input: {
      mode: "FINE_EQUIVALENT" | "PHYSICAL_AT_CONFIGURED_TOUCH";
      configuredTouch?: DecimalInput;
      finePurityId?: string;
    }
  ) {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    if (
      input.mode !== "FINE_EQUIVALENT" &&
      input.mode !== "PHYSICAL_AT_CONFIGURED_TOUCH"
    ) {
      throw new ValidationError(
        "mode must be FINE_EQUIVALENT or PHYSICAL_AT_CONFIGURED_TOUCH"
      );
    }

    return this.repo.runInTransaction(async (tx) => {
      const now = new Date();
      const purities = await tx.listPurities(validActor.organizationId);
      let targetPurity: PurityEntity | null = null;
      let configuredTouch: Decimal | null = null;

      if (input.mode === "FINE_EQUIVALENT") {
        if (input.finePurityId) {
          targetPurity = await tx.getPurityById(
            validActor.organizationId,
            input.finePurityId
          );
          if (!targetPurity) {
            throw new NotFoundError(`Purity ${input.finePurityId} not found`);
          }
        } else {
          targetPurity =
            purities.find((p) => p.code === "ADMIN_FINE_GOLD") ??
            purities.find(
              (p) => p.isFineCategory && p.touchPercent.eq(new Decimal(100))
            ) ??
            purities.find((p) => p.isFineCategory) ??
            null;
          if (!targetPurity) {
            targetPurity = await tx.createPurity({
              id: newId("pur"),
              organizationId: validActor.organizationId,
              code: "ADMIN_FINE_GOLD",
              displayLabel: "Admin Fine Gold",
              karatLabel: "FINE",
              touchPercent: new Decimal(100),
              isFineCategory: true,
              isActive: true,
              sortOrder: 99,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      } else {
        // Mode B: PHYSICAL_AT_CONFIGURED_TOUCH
        if (input.finePurityId) {
          targetPurity = await tx.getPurityById(
            validActor.organizationId,
            input.finePurityId
          );
          if (!targetPurity) {
            throw new NotFoundError(`Purity ${input.finePurityId} not found`);
          }
          configuredTouch =
            input.configuredTouch !== undefined &&
            String(input.configuredTouch).trim() !== ""
              ? roundTouch(input.configuredTouch)
              : targetPurity.touchPercent;
        } else {
          if (
            input.configuredTouch === undefined ||
            String(input.configuredTouch).trim() === ""
          ) {
            throw new ValidationError(
              "configuredTouch is required for Mode B (PHYSICAL_AT_CONFIGURED_TOUCH)"
            );
          }
          configuredTouch = roundTouch(input.configuredTouch);
        }

        if (configuredTouch.lte(ZERO) || configuredTouch.gt(new Decimal(100))) {
          throw new ValidationError(
            "Configured fine touch must be > 0 and <= 100"
          );
        }

        if (!targetPurity) {
          targetPurity =
            purities.find(
              (p) => p.isFineCategory && p.touchPercent.eq(configuredTouch!)
            ) ??
            purities.find((p) => p.touchPercent.eq(configuredTouch!)) ??
            null;
        }
        if (!targetPurity) {
          const touchStr = configuredTouch
            .toFixed(2)
            .replace(/\.?0+$/, "")
            .replace(".", "_");
          const code = `FINE_${touchStr}`;
          const label = `Fine ${configuredTouch
            .toFixed(2)
            .replace(/\.?0+$/, "")}%`;
          const dup = await tx.getPurityByCodeOrLabel(
            validActor.organizationId,
            code,
            label
          );
          targetPurity =
            dup ??
            (await tx.createPurity({
              id: newId("pur"),
              organizationId: validActor.organizationId,
              code,
              displayLabel: label,
              karatLabel: `${configuredTouch
                .toFixed(2)
                .replace(/\.?0+$/, "")}%`,
              touchPercent: configuredTouch,
              isFineCategory: true,
              isActive: true,
              sortOrder: 95,
              createdAt: now,
              updatedAt: now,
            }));
        }
      }

      const adminAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${targetPurity.code}`,
        `Admin Stock Pool - ${targetPurity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        targetPurity.id,
        null
      );

      await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `FINISHED_GOODS_${targetPurity.code}`,
        `Finished Goods - ${targetPurity.displayLabel}`,
        "FINISHED_GOODS",
        targetPurity.id,
        null
      );

      const saved = await tx.updateOrganizationCustomerFineConfig({
        organizationId: validActor.organizationId,
        customerFineReceiptMode: input.mode,
        customerFineConfiguredTouch: configuredTouch,
        customerFineAccountPurityId: targetPurity.id,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "Organization",
        entityId: validActor.organizationId,
        action: "CUSTOMER_FINE_RECEIPT_CONVENTION_CONFIGURED",
        summary:
          input.mode === "FINE_EQUIVALENT"
            ? `Configured customer fine-gold receipt convention to Mode A (Fine-equivalent grams -> ${adminAcct.name})`
            : `Configured customer fine-gold receipt convention to Mode B (Physical weight @ ${configuredTouch!.toFixed(
                2
              )}% -> ${adminAcct.name})`,
        metadataJson: JSON.stringify({
          mode: saved.customerFineReceiptMode,
          configuredTouch: saved.customerFineConfiguredTouch?.toFixed(4) ?? null,
          accountPurityId: saved.customerFineAccountPurityId,
        }),
        createdAt: now,
      });

      return {
        isConfigured: true,
        mode: saved.customerFineReceiptMode,
        configuredTouch: saved.customerFineConfiguredTouch
          ? saved.customerFineConfiguredTouch.toFixed(4).replace(/\.?0+$/, "")
          : null,
        accountPurityId: targetPurity.id,
        accountPurityCode: targetPurity.code,
        accountPurityLabel: targetPurity.displayLabel,
        destinationAccountCode: adminAcct.accountCode,
        destinationAccountName: adminAcct.name,
      };
    });
  }

  private async buildAndValidateBillLines(
    tx: ErpTransactionContext,
    organizationId: string,
    customerId: string,
    billId: string,
    billType: BillType,
    inputLines: Array<{
      lineType?: BillLineType;
      orderId?: string;
      description?: string;
      billingBasis?: BillingBasis;
      manualChargeableWeight?: DecimalInput;
      customNetWeight?: DecimalInput;
      customStoneWeight?: DecimalInput;
      customAdWeight?: DecimalInput;
      customGrossWeight?: DecimalInput;
      makingPercentagePoints?: DecimalInput;
      extraFineCharge?: DecimalInput;
      fineDiscount?: DecimalInput;
      makingChargesRupees?: DecimalInput;
      stoneChargeRupees?: DecimalInput;
      rupeeDiscount?: DecimalInput;
      adjustmentReason?: string;
    }>,
    excludeBillId?: string
  ): Promise<{
    lines: CustomerBillLineEntity[];
    totalFineGold: Decimal;
    totalCashRupees: Decimal;
    deliveredFineMetal: Decimal;
    commercialMakingFine: Decimal;
    ordersToDeliver: Array<{ order: OrderEntity; netWeight: Decimal; fineWeight: Decimal }>;
  }> {
    if (!inputLines || inputLines.length === 0) {
      throw new ValidationError("At least one bill line is required");
    }

    const existingBills = await tx.listCustomerBills(organizationId);
    const allExistingLines = await tx.listAllCustomerBillLinesForOrg(
      organizationId
    );
    const activePostedBillIds = new Set(
      existingBills
        .filter((b) => b.status === "POSTED" && b.id !== excludeBillId)
        .map((b) => b.id)
    );
    const billedOrderIds = new Set(
      allExistingLines
        .filter((l) => l.orderId && activePostedBillIds.has(l.customerBillId))
        .map((l) => l.orderId!)
    );

    const seenOrderIds = new Set<string>();
    const builtLines: CustomerBillLineEntity[] = [];
    const ordersToDeliver: Array<{
      order: OrderEntity;
      netWeight: Decimal;
      fineWeight: Decimal;
    }> = [];

    let totalFineGold = ZERO;
    let totalCashRupees = ZERO;
    let deliveredFineMetal = ZERO;

    for (let i = 0; i < inputLines.length; i++) {
      const inp = inputLines[i];
      const lineType: BillLineType =
        billType === "ORDER_DELIVERY"
          ? inp.lineType === "MANUAL_SERVICE"
            ? "MANUAL_SERVICE"
            : "ORDER_LINE"
          : inp.lineType || "MANUAL_SERVICE";

      if (lineType === "ORDER_LINE") {
        if (billType !== "ORDER_DELIVERY") {
          throw new ValidationError(
            "Order lines can only appear on ORDER_DELIVERY bills"
          );
        }
        if (!inp.orderId) {
          throw new ValidationError("orderId is required on order bill lines");
        }
        if (seenOrderIds.has(inp.orderId)) {
          throw new ValidationError(
            `Duplicate order ${inp.orderId} in the same bill`
          );
        }
        seenOrderIds.add(inp.orderId);

        const order = await tx.getOrderById(organizationId, inp.orderId);
        if (!order) {
          throw new NotFoundError(`Order ${inp.orderId} not found`);
        }
        if (order.customerId !== customerId) {
          throw new ValidationError(
            `Order Bag #${order.bagNumber} belongs to a different customer`
          );
        }
        if (order.status !== "COMPLETED") {
          throw new ConflictError(
            `Order Bag #${order.bagNumber} is ${order.status} and cannot enter a delivery bill`
          );
        }
        const isSameBillEdit = Boolean(
          excludeBillId && order.activeBillId === excludeBillId
        );
        if (
          !isSameBillEdit &&
          (order.billingStatus === "BILLED" ||
            (order.deliveryStatus === "DELIVERED" &&
              order.billingStatus !== "REVERSED") ||
            billedOrderIds.has(order.id))
        ) {
          throw new ConflictError(
            `Order Bag #${order.bagNumber} is already billed/delivered`
          );
        }

        const grossWeight = roundInternal(order.finishedGrossWeight ?? ZERO);
        const stoneWeight = roundInternal(order.finishedStoneWeight ?? ZERO);
        const netWeight = roundInternal(order.finishedNetMetalWeight ?? ZERO);
        const touch = roundInternal(order.touchSnapshot);
        const actualDeliveredFine = order.finishedFineWeight
          ? roundInternal(order.finishedFineWeight)
          : calculateFineEquivalent(netWeight, touch);

        const basis: BillingBasis = inp.billingBasis || "NET_METAL";
        if (basis === "MANUAL") {
          if (
            inp.manualChargeableWeight === undefined ||
            toDecimal(inp.manualChargeableWeight).lte(ZERO)
          ) {
            throw new ValidationError(
              `Manual chargeable weight > 0 is required for Bag #${order.bagNumber}`
            );
          }
        }

        const calc = computeOrderLineAmounts({
          grossWeight,
          stoneWeight,
          netWeight,
          touchSnapshot: touch,
          billingBasis: basis,
          manualChargeableWeight: inp.manualChargeableWeight,
          makingPercentagePoints: inp.makingPercentagePoints,
          extraFineCharge: inp.extraFineCharge,
          fineDiscount: inp.fineDiscount,
          makingChargesRupees: inp.makingChargesRupees,
          stoneChargeRupees: inp.stoneChargeRupees,
          rupeeDiscount: inp.rupeeDiscount,
        });

        if (calc.fineGold.lt(ZERO) || calc.makingCharges.lt(ZERO)) {
          throw new ValidationError(
            `Line totals cannot be negative for Bag #${order.bagNumber}`
          );
        }

        const lineNetWt =
          inp.customNetWeight !== undefined
            ? roundInternal(inp.customNetWeight)
            : netWeight;
        const lineStoneWt =
          inp.customStoneWeight !== undefined
            ? roundInternal(inp.customStoneWeight)
            : stoneWeight;
        const lineAdWt =
          inp.customAdWeight !== undefined
            ? roundInternal(inp.customAdWeight)
            : inp.customStoneWeight !== undefined
            ? ZERO
            : stoneWeight;
        const lineGrossWt =
          inp.customGrossWeight !== undefined
            ? roundInternal(inp.customGrossWeight)
            : basis === "MANUAL"
            ? calc.chargeableWeight
            : grossWeight;

        builtLines.push({
          id: newId("bline"),
          customerBillId: billId,
          lineType: "ORDER_LINE",
          orderId: order.id,
          purityId: order.purityId,
          bagNumberSnapshot: order.bagNumber,
          orderNameSnapshot: order.orderName,
          photoUrlSnapshot: order.photoUrl,
          description:
            inp.description?.trim() ||
            `#${order.bagNumber} - ${order.orderName}`,
          grossWeight: lineGrossWt,
          stoneWeight: lineStoneWt,
          adKlWeight: lineAdWt,
          netWeight: lineNetWt,
          touchSnapshot: touch,
          chargeableWeight: calc.chargeableWeight,
          billingBasis: basis,
          wastagePercent: calc.makingPercentagePoints,
          makingPercentagePoints: calc.makingPercentagePoints,
          metalChargeFine: calc.metalChargeFine,
          makingChargeFine: calc.makingChargeFine,
          extraFineCharge: calc.extraFineCharge,
          fineDiscount: calc.fineDiscount,
          fineGold: calc.fineGold,
          makingCharges: calc.makingCharges,
          stoneChargeRupees: calc.stoneChargeRupees,
          rupeeDiscount: calc.rupeeDiscount,
          adjustmentReason: inp.adjustmentReason?.trim() || null,
        });

        ordersToDeliver.push({
          order,
          netWeight,
          fineWeight: actualDeliveredFine,
        });
        totalFineGold = roundInternal(totalFineGold.add(calc.fineGold));
        totalCashRupees = roundRupees(totalCashRupees.add(calc.makingCharges));
        deliveredFineMetal = roundInternal(
          deliveredFineMetal.add(actualDeliveredFine)
        );
      } else {
        // MANUAL_SERVICE (e.g. Additional Rupees on ORDER_DELIVERY) or MANUAL_COMMERCIAL lines
        if (billType !== "MANUAL_COMMERCIAL" && lineType !== "MANUAL_SERVICE") {
          throw new ValidationError(
            "Manual commercial lines are only allowed on MANUAL_COMMERCIAL bills"
          );
        }
        const desc = inp.description?.trim();
        if (!desc) {
          throw new ValidationError(
            "Description is required on manual bill lines"
          );
        }
        const extraFine = roundInternal(inp.extraFineCharge ?? ZERO);
        const fineDisc = roundInternal(inp.fineDiscount ?? ZERO);
        const netFine = roundInternal(extraFine.sub(fineDisc));
        const serviceInr = roundRupees(inp.makingChargesRupees ?? ZERO);
        const stoneInr = roundRupees(inp.stoneChargeRupees ?? ZERO);
        const discInr = roundRupees(inp.rupeeDiscount ?? ZERO);
        const netInr = roundRupees(serviceInr.add(stoneInr).sub(discInr));

        if (
          (fineDisc.gt(ZERO) || discInr.gt(ZERO)) &&
          !inp.adjustmentReason?.trim()
        ) {
          throw new ValidationError(
            "Reason is required for manual discount lines"
          );
        }

        builtLines.push({
          id: newId("bline"),
          customerBillId: billId,
          lineType,
          orderId: null,
          purityId: null,
          bagNumberSnapshot: null,
          orderNameSnapshot: null,
          photoUrlSnapshot: null,
          description: desc,
          grossWeight: ZERO,
          stoneWeight: ZERO,
          adKlWeight: ZERO,
          netWeight: ZERO,
          touchSnapshot: ZERO,
          chargeableWeight: ZERO,
          billingBasis: "MANUAL",
          wastagePercent: ZERO,
          makingPercentagePoints: ZERO,
          metalChargeFine: ZERO,
          makingChargeFine: ZERO,
          extraFineCharge: extraFine,
          fineDiscount: fineDisc,
          fineGold: netFine,
          makingCharges: netInr,
          stoneChargeRupees: stoneInr,
          rupeeDiscount: discInr,
          adjustmentReason: inp.adjustmentReason?.trim() || null,
        });

        totalFineGold = roundInternal(totalFineGold.add(netFine));
        totalCashRupees = roundRupees(totalCashRupees.add(netInr));
      }
    }

    if (totalFineGold.lt(ZERO) || totalCashRupees.lt(ZERO)) {
      throw new ValidationError("Bill totals cannot be negative");
    }

    const commercialMakingFine = roundInternal(
      totalFineGold.sub(deliveredFineMetal)
    );

    return {
      lines: builtLines,
      totalFineGold,
      totalCashRupees,
      deliveredFineMetal,
      commercialMakingFine,
      ordersToDeliver,
    };
  }

  public async saveBillTemplate(
    actor: ActorContext,
    input: {
      id?: string;
      name: string;
      isDefault?: boolean;
      businessName: string;
      contactInfo: string;
      logoUrl?: string | null;
      headerText?: string | null;
      footerText?: string | null;
      signatureUrl?: string | null;
      showPhotoColumn?: boolean;
      visibleColumns?: Record<string, boolean>;
      columnLabels?: Record<string, string>;
      columnWidths?: Record<string, string>;
      notesAndTerms?: string | null;
      fontSizePx?: number;
      paperSize?: "A4" | "A5";
    }
  ): Promise<BillTemplateEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Template name is required");
    const fontSize = Math.min(16, Math.max(10, Number(input.fontSizePx || 12)));
    const paperSize = input.paperSize === "A5" ? "A5" : "A4";
    const def = getDefaultTemplateConfig();

    return this.repo.runInTransaction(async (tx) => {
      const now = new Date();
      const existingList = await tx.listBillTemplates(
        validActor.organizationId
      );
      if (input.isDefault) {
        for (const t of existingList) {
          if (t.isDefault && t.id !== input.id) {
            await tx.updateBillTemplate({ ...t, isDefault: false, updatedAt: now });
          }
        }
      }

      if (input.id) {
        const existing = await tx.getBillTemplateById(
          validActor.organizationId,
          input.id
        );
        if (!existing) {
          throw new NotFoundError(`Bill template ${input.id} not found`);
        }
        return tx.updateBillTemplate({
          ...existing,
          name,
          isDefault: input.isDefault ?? existing.isDefault,
          businessName: input.businessName?.trim() || existing.businessName,
          contactInfo: input.contactInfo?.trim() || existing.contactInfo,
          logoUrl: input.logoUrl !== undefined ? input.logoUrl : existing.logoUrl,
          headerText:
            input.headerText !== undefined ? input.headerText : existing.headerText,
          footerText:
            input.footerText !== undefined ? input.footerText : existing.footerText,
          signatureUrl:
            input.signatureUrl !== undefined
              ? input.signatureUrl
              : existing.signatureUrl,
          showPhotoColumn:
            input.showPhotoColumn ?? existing.showPhotoColumn,
          visibleColumnsJson: input.visibleColumns
            ? JSON.stringify({ ...def.visibleColumns, ...input.visibleColumns })
            : existing.visibleColumnsJson,
          columnLabelsJson: input.columnLabels
            ? JSON.stringify({ ...def.columnLabels, ...input.columnLabels })
            : existing.columnLabelsJson,
          columnWidthsJson: input.columnWidths
            ? JSON.stringify(input.columnWidths)
            : existing.columnWidthsJson,
          notesAndTerms:
            input.notesAndTerms !== undefined
              ? input.notesAndTerms
              : existing.notesAndTerms,
          fontSizePx: fontSize,
          paperSize,
          updatedAt: now,
        });
      }

      return tx.createBillTemplate({
        id: newId("btpl"),
        organizationId: validActor.organizationId,
        name,
        isDefault: input.isDefault ?? existingList.length === 0,
        businessName: input.businessName?.trim() || def.businessName,
        contactInfo: input.contactInfo?.trim() || def.contactInfo,
        logoUrl: input.logoUrl || null,
        headerText: input.headerText || null,
        footerText: input.footerText || def.footerText,
        signatureUrl: input.signatureUrl || null,
        showPhotoColumn: Boolean(input.showPhotoColumn),
        visibleColumnsJson: JSON.stringify({
          ...def.visibleColumns,
          ...(input.visibleColumns || {}),
        }),
        columnLabelsJson: JSON.stringify({
          ...def.columnLabels,
          ...(input.columnLabels || {}),
        }),
        columnWidthsJson: input.columnWidths
          ? JSON.stringify(input.columnWidths)
          : null,
        notesAndTerms: input.notesAndTerms || null,
        fontSizePx: fontSize,
        paperSize,
        createdById: validActor.userId,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  public async saveBillDraft(
    actor: ActorContext,
    input: {
      draftId?: string;
      customerId: string;
      billDate?: string | Date;
      billType?: BillType;
      templateId?: string | null;
      notes?: string;
      lines: Array<{
        lineType?: BillLineType;
        orderId?: string;
        description?: string;
        billingBasis?: BillingBasis;
        manualChargeableWeight?: DecimalInput;
        customNetWeight?: DecimalInput;
        customStoneWeight?: DecimalInput;
        customAdWeight?: DecimalInput;
        customGrossWeight?: DecimalInput;
        makingPercentagePoints?: DecimalInput;
        extraFineCharge?: DecimalInput;
        fineDiscount?: DecimalInput;
        makingChargesRupees?: DecimalInput;
        stoneChargeRupees?: DecimalInput;
        rupeeDiscount?: DecimalInput;
        adjustmentReason?: string;
      }>;
    }
  ): Promise<{ bill: CustomerBillEntity; lines: CustomerBillLineEntity[] }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const billDate = parseBusinessDate(input.billDate);
    const billType: BillType = input.billType ?? "ORDER_DELIVERY";

    return this.repo.runInTransaction(async (tx) => {
      const customer = await tx.getCustomerById(
        validActor.organizationId,
        input.customerId
      );
      if (!customer) {
        throw new NotFoundError(`Customer ${input.customerId} not found`);
      }

      // Row-level lock to prevent concurrent double-consumption of customer advance
      await tx.lockCustomerForUpdate(validActor.organizationId, customer.id);

      let existingDraft: CustomerBillEntity | null = null;
      if (input.draftId) {
        existingDraft = await tx.getCustomerBillById(
          validActor.organizationId,
          input.draftId
        );
        if (!existingDraft) {
          throw new NotFoundError(`Draft bill ${input.draftId} not found`);
        }
        if (existingDraft.status !== "DRAFT") {
          throw new ConflictError(
            `Bill ${existingDraft.billNumber} is ${existingDraft.status} and cannot be edited as a draft`
          );
        }
      }

      const billId = existingDraft?.id ?? newId("bill");
      const billNumber =
        existingDraft?.billNumber ?? `DRAFT-${billId.slice(-6).toUpperCase()}`;

      const built = await this.buildAndValidateBillLines(
        tx,
        validActor.organizationId,
        customer.id,
        billId,
        billType,
        input.lines,
        billId
      );

      const templates = await tx.listBillTemplates(validActor.organizationId);
      const chosenTpl = input.templateId
        ? templates.find((t) => t.id === input.templateId)
        : templates.find((t) => t.isDefault) ?? templates[0];
      const parsedTpl: ParsedBillTemplate = parseTemplateEntity(chosenTpl);

      const histBal = await this.computeCustomerBalances(
        tx,
        validActor.organizationId,
        customer.id
      );

      const now = new Date();
      const draftBill: CustomerBillEntity = {
        id: billId,
        organizationId: validActor.organizationId,
        customerId: customer.id,
        billNumber,
        billDate,
        billType,
        status: "DRAFT",
        deliveryStatus: "NOT_DELIVERED",
        settlementStatus: "UNPAID",
        totalFineGold: built.totalFineGold,
        totalCashRupees: built.totalCashRupees,
        deliveredFineMetal: built.deliveredFineMetal,
        commercialMakingFine: built.commercialMakingFine,
        historicalFineBalance: histBal.fineOwed,
        historicalInrBalance: histBal.inrOwed,
        templateId: chosenTpl?.id ?? null,
        templateSnapshotJson: JSON.stringify(parsedTpl),
        customerSnapshotJson: JSON.stringify({
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          gstNumber: customer.gstNumber,
        }),
        previewHtml: null,
        notes: input.notes?.trim() || null,
        idempotencyKey: null,
        journalTransactionId: null,
        postedAt: null,
        postedById: null,
        cancelledAt: null,
        cancelledById: null,
        cancellationReason: null,
        creditNoteNumber: null,
        createdById: existingDraft?.createdById ?? validActor.userId,
        createdAt: existingDraft?.createdAt ?? now,
        updatedAt: now,
      };

      draftBill.previewHtml = renderBillSnapshotHtml({
        bill: draftBill,
        appliedFineCredit: ZERO,
        appliedInrCredit: ZERO,
        customer,
        lines: built.lines,
        template: parsedTpl,
      });

      const saved = existingDraft
        ? await tx.updateCustomerBill(draftBill)
        : await tx.createCustomerBill(draftBill);
      const savedLines = await tx.replaceCustomerBillLines(
        saved.id,
        built.lines
      );

      return { bill: saved, lines: savedLines };
    });
  }

  public async postBillAndDeliver(
    actor: ActorContext,
    input: {
      draftId?: string;
      customerId: string;
      billDate?: string | Date;
      billType?: BillType;
      templateId?: string | null;
      notes?: string;
      applyFineAdvance?: boolean;
      customAdvanceFineAmount?: DecimalInput;
      applyInrAdvance?: boolean;
      newReceiptAtIssuance?: {
        amountReceived: DecimalInput;
        referenceNumber?: string;
        notes?: string;
        actualPhysicalWeight?: DecimalInput;
        actualTouchPercent?: DecimalInput;
      };
      lines: Array<{
        lineType?: BillLineType;
        orderId?: string;
        description?: string;
        billingBasis?: BillingBasis;
        manualChargeableWeight?: DecimalInput;
        customNetWeight?: DecimalInput;
        customStoneWeight?: DecimalInput;
        customAdWeight?: DecimalInput;
        customGrossWeight?: DecimalInput;
        makingPercentagePoints?: DecimalInput;
        extraFineCharge?: DecimalInput;
        fineDiscount?: DecimalInput;
        makingChargesRupees?: DecimalInput;
        stoneChargeRupees?: DecimalInput;
        rupeeDiscount?: DecimalInput;
        adjustmentReason?: string;
      }>;
      idempotencyKey: string;
    }
  ): Promise<{
    bill: CustomerBillEntity;
    lines: CustomerBillLineEntity[];
    allocations: CustomerPaymentAllocationEntity[];
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const billDate = parseBusinessDate(input.billDate);
    const billType: BillType = input.billType ?? "ORDER_DELIVERY";

    return this.repo.runInTransaction(async (tx) => {
      const existingByKey = await tx.getCustomerBillByIdempotencyKey(
        input.idempotencyKey
      );
      if (existingByKey) {
        const [lines, allocs] = await Promise.all([
          tx.listCustomerBillLines(existingByKey.id),
          tx.listCustomerPaymentAllocations(validActor.organizationId, {
            billId: existingByKey.id,
          }),
        ]);
        return { bill: existingByKey, lines, allocations: allocs };
      }

      const customer = await tx.getCustomerById(
        validActor.organizationId,
        input.customerId
      );
      if (!customer) {
        throw new NotFoundError(`Customer ${input.customerId} not found`);
      }

      // Row-level lock to prevent concurrent double-consumption of customer advance
      await tx.lockCustomerForUpdate(validActor.organizationId, customer.id);

      let existingDraft: CustomerBillEntity | null = null;
      if (input.draftId) {
        existingDraft = await tx.getCustomerBillById(
          validActor.organizationId,
          input.draftId
        );
        if (!existingDraft) {
          throw new NotFoundError(`Bill ${input.draftId} not found`);
        }
        if (existingDraft.status !== "DRAFT") {
          throw new ConflictError(
            `Bill ${existingDraft.billNumber} is already ${existingDraft.status}`
          );
        }
      }

      const billId = existingDraft?.id ?? newId("bill");
      const billNumber = await tx.allocateNextBillNumber(
        validActor.organizationId,
        "INV"
      );

      const built = await this.buildAndValidateBillLines(
        tx,
        validActor.organizationId,
        customer.id,
        billId,
        billType,
        input.lines,
        billId
      );

      const histBal = await this.computeCustomerBalances(
        tx,
        validActor.organizationId,
        customer.id
      );

      const templates = await tx.listBillTemplates(validActor.organizationId);
      const chosenTpl = input.templateId
        ? templates.find((t) => t.id === input.templateId)
        : templates.find((t) => t.isDefault) ?? templates[0];
      const parsedTpl = parseTemplateEntity(chosenTpl);

      const now = new Date();
      let firstJournalTxId: string | null = null;

      // Physical delivery: remove actual delivered net metal from FINISHED_GOODS -> CUSTOMER_DELIVERED
      // (Skip orders already physically DELIVERED whose prior bill was CANCELLED/REVERSED)
      if (billType === "ORDER_DELIVERY" && built.ordersToDeliver.length > 0) {
        const byPurity = new Map<
          string,
          { netWeight: Decimal; fineWeight: Decimal; orders: OrderEntity[] }
        >();
        const alreadyDeliveredOrders: OrderEntity[] = [];
        for (const item of built.ordersToDeliver) {
          if (item.order.deliveryStatus === "DELIVERED") {
            alreadyDeliveredOrders.push(item.order);
            continue;
          }
          const cur = byPurity.get(item.order.purityId) ?? {
            netWeight: ZERO,
            fineWeight: ZERO,
            orders: [],
          };
          cur.netWeight = roundInternal(cur.netWeight.add(item.netWeight));
          cur.fineWeight = roundInternal(cur.fineWeight.add(item.fineWeight));
          cur.orders.push(item.order);
          byPurity.set(item.order.purityId, cur);
        }

        for (const ord of alreadyDeliveredOrders) {
          await tx.updateOrder({
            ...ord,
            billingStatus: "BILLED",
            activeBillId: billId,
            updatedAt: now,
          });
        }

        for (const [purityId, grp] of byPurity.entries()) {
          const purity = await tx.getPurityById(
            validActor.organizationId,
            purityId
          );
          if (!purity) {
            throw new NotFoundError(`Purity ${purityId} not found`);
          }
          const fgAcct = await this.ensureSystemAccount(
            tx,
            validActor.organizationId,
            `FINISHED_GOODS_${purity.code}`,
            `Finished Goods - ${purity.displayLabel}`,
            "FINISHED_GOODS",
            purity.id,
            null
          );
          if (fgAcct.cachedPhysicalBalance.lt(grp.netWeight)) {
            throw new ConflictError(
              `Insufficient Finished Goods stock in ${purity.displayLabel}: available ${fgAcct.cachedPhysicalBalance.toFixed(
                3
              )}g, required ${grp.netWeight.toFixed(3)}g`
            );
          }

          const deliveredAcct = await this.ensureSystemAccount(
            tx,
            validActor.organizationId,
            `CUSTOMER_DELIVERED_${purity.code}`,
            `Delivered to Customers - ${purity.displayLabel}`,
            "CUSTOMER_DELIVERED",
            purity.id,
            null
          );

          const jtx = await this.postBalancedJournalEntry(tx, {
            organizationId: validActor.organizationId,
            actorId: validActor.userId,
            transactionType: "BILL_POST_AND_DELIVER",
            businessDate: billDate,
            purity,
            physicalWeight: grp.netWeight,
            fineEquivalentWeight: grp.fineWeight,
            sourceAccount: fgAcct,
            destinationAccount: deliveredAcct,
            sourceReference: billNumber,
            reason: `Bill ${billNumber} delivery to ${customer.name} (${grp.orders
              .map((o) => `#${o.bagNumber}`)
              .join(", ")})`,
            idempotencyKey: `bill_del_${input.idempotencyKey}_${purity.id}`,
          });
          if (!firstJournalTxId) firstJournalTxId = jtx.id;

          for (const ord of grp.orders) {
            const oNet = roundInternal(ord.finishedNetMetalWeight ?? ZERO);
            const oFine = ord.finishedFineWeight
              ? roundInternal(ord.finishedFineWeight)
              : calculateFineEquivalent(oNet, ord.touchSnapshot);
            await tx.createMetalMovement({
              id: newId("mmov"),
              organizationId: validActor.organizationId,
              orderId: ord.id,
              orderProcessId: null,
              processVisitId: null,
              movementType: "CUSTOMER_DELIVERY",
              fromProcessType: null,
              toProcessType: null,
              karigarId: null,
              businessDate: billDate,
              grossWeight: roundInternal(ord.finishedGrossWeight ?? oNet),
              nonGoldWeight: roundInternal(ord.finishedStoneWeight ?? ZERO),
              netMetalWeight: oNet,
              touchSnapshot: ord.touchSnapshot,
              fineEquivalentWeight: oFine,
              journalTransactionId: jtx.id,
              idempotencyKey: `bill_mmov_${input.idempotencyKey}_${ord.id}`,
              notes: `Delivered on Bill ${billNumber}`,
              createdById: validActor.userId,
              createdAt: now,
            });

            await tx.updateOrder({
              ...ord,
              deliveryStatus: "DELIVERED",
              deliveredAt: now,
              deliveredById: validActor.userId,
              billingStatus: "BILLED",
              activeBillId: billId,
              updatedAt: now,
            });
          }
        }
      }

      const postedBill: CustomerBillEntity = {
        id: billId,
        organizationId: validActor.organizationId,
        customerId: customer.id,
        billNumber,
        billDate,
        billType,
        status: "POSTED",
        deliveryStatus:
          billType === "ORDER_DELIVERY" ? "DELIVERED" : "NOT_DELIVERED",
        settlementStatus: "UNPAID",
        totalFineGold: built.totalFineGold,
        totalCashRupees: built.totalCashRupees,
        deliveredFineMetal: built.deliveredFineMetal,
        commercialMakingFine: built.commercialMakingFine,
        historicalFineBalance: histBal.fineOwed,
        historicalInrBalance: histBal.inrOwed,
        templateId: chosenTpl?.id ?? null,
        templateSnapshotJson: JSON.stringify(parsedTpl),
        customerSnapshotJson: JSON.stringify({
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          gstNumber: customer.gstNumber,
        }),
        previewHtml: null,
        notes: input.notes?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        journalTransactionId: firstJournalTxId,
        postedAt: now,
        postedById: validActor.userId,
        cancelledAt: null,
        cancelledById: null,
        cancellationReason: null,
        creditNoteNumber: null,
        createdById: existingDraft?.createdById ?? validActor.userId,
        createdAt: existingDraft?.createdAt ?? now,
        updatedAt: now,
      };

      const savedBill = existingDraft
        ? await tx.updateCustomerBill(postedBill)
        : await tx.createCustomerBill(postedBill);
      const savedLines = await tx.replaceCustomerBillLines(
        savedBill.id,
        built.lines
      );

      // Apply existing advances if requested (without creating new stock!)
      const createdAllocations: CustomerPaymentAllocationEntity[] = [];
      let appliedFineCredit = ZERO;
      let appliedInrCredit = ZERO;

      if (input.applyFineAdvance && built.totalFineGold.gt(ZERO)) {
        let remainingFine = built.totalFineGold;
        if (input.customAdvanceFineAmount !== undefined) {
          const cap = roundInternal(input.customAdvanceFineAmount);
          if (cap.lt(ZERO)) {
            throw new ValidationError("Advance fine amount cannot be negative");
          }
          if (cap.gt(histBal.fineAdvance)) {
            throw new ConflictError(
              `Requested advance (${cap.toFixed(
                4
              )}g) exceeds available customer advance (${histBal.fineAdvance.toFixed(
                4
              )}g)`
            );
          }
          if (cap.lt(remainingFine)) {
            remainingFine = cap;
          }
        }
        const goldReceipts = (
          await tx.listCustomerGoldReceipts(
            validActor.organizationId,
            customer.id
          )
        )
          .filter(
            (r) => r.status === "POSTED" && r.unallocatedFineWeight.gt(ZERO)
          )
          .sort(
            (a, b) =>
              a.businessDate.getTime() - b.businessDate.getTime() ||
              a.createdAt.getTime() - b.createdAt.getTime()
          );

        for (let i = 0; i < goldReceipts.length; i++) {
          if (remainingFine.lte(ZERO)) break;
          const rcp = goldReceipts[i];
          const toApply = remainingFine.lt(rcp.unallocatedFineWeight)
            ? remainingFine
            : rcp.unallocatedFineWeight;
          const alloc = await tx.createCustomerPaymentAllocation({
            id: newId("cpalloc"),
            organizationId: validActor.organizationId,
            customerId: customer.id,
            billId: savedBill.id,
            goldReceiptId: rcp.id,
            cashReceiptId: null,
            allocatedFineWeight: toApply,
            allocatedRupees: ZERO,
            status: "ACTIVE",
            businessDate: billDate,
            notes: `Auto-applied fine advance from ${rcp.receiptNumber}`,
            idempotencyKey: `adv_fine_${input.idempotencyKey}_${i}`,
            createdById: validActor.userId,
            createdAt: now,
            undoneAt: null,
            undoneById: null,
            undoReason: null,
          });
          createdAllocations.push(alloc);
          await tx.updateCustomerGoldReceipt({
            ...rcp,
            unallocatedFineWeight: roundInternal(
              rcp.unallocatedFineWeight.sub(toApply)
            ),
          });
          remainingFine = roundInternal(remainingFine.sub(toApply));
          appliedFineCredit = roundInternal(appliedFineCredit.add(toApply));
        }
      }

      // Optional new fine-gold receipt collected at bill issuance (never double-counted as existing advance)
      let newReceiptFineApplied = ZERO;
      if (
        input.newReceiptAtIssuance &&
        toDecimal(input.newReceiptAtIssuance.amountReceived).gt(ZERO)
      ) {
        const postedRcp = await this.executeFineGoldReceiptInTx(
          tx,
          validActor,
          {
            customerId: customer.id,
            amountReceived: input.newReceiptAtIssuance.amountReceived,
            businessDate: billDate,
            referenceNumber:
              input.newReceiptAtIssuance.referenceNumber || billNumber,
            notes:
              input.newReceiptAtIssuance.notes ||
              `Received at issuance of ${billNumber}`,
            physicalWeightOverride:
              input.newReceiptAtIssuance.actualPhysicalWeight,
            touchPercentOverride:
              input.newReceiptAtIssuance.actualTouchPercent,
            allocationMode: "CHOOSE_BILLS",
            selectedBillIds: [savedBill.id],
            idempotencyKey: `issuance_rcp_${input.idempotencyKey}`,
          }
        );
        for (const a of postedRcp.allocations) {
          createdAllocations.push(a);
          newReceiptFineApplied = roundInternal(
            newReceiptFineApplied.add(a.allocatedFineWeight)
          );
        }
      }

      if (input.applyInrAdvance && built.totalCashRupees.gt(ZERO)) {
        let remainingInr = built.totalCashRupees;
        const cashReceipts = (
          await tx.listCustomerCashReceipts(
            validActor.organizationId,
            customer.id
          )
        )
          .filter((r) => r.status === "POSTED" && r.unallocatedRupees.gt(ZERO))
          .sort((a, b) => a.businessDate.getTime() - b.businessDate.getTime());

        for (let i = 0; i < cashReceipts.length; i++) {
          if (remainingInr.lte(ZERO)) break;
          const rcp = cashReceipts[i];
          const toApply = remainingInr.lt(rcp.unallocatedRupees)
            ? remainingInr
            : rcp.unallocatedRupees;
          const alloc = await tx.createCustomerPaymentAllocation({
            id: newId("cpalloc"),
            organizationId: validActor.organizationId,
            customerId: customer.id,
            billId: savedBill.id,
            goldReceiptId: null,
            cashReceiptId: rcp.id,
            allocatedFineWeight: ZERO,
            allocatedRupees: toApply,
            status: "ACTIVE",
            businessDate: billDate,
            notes: `Auto-applied cash advance from ${rcp.receiptNumber}`,
            idempotencyKey: `adv_inr_${input.idempotencyKey}_${i}`,
            createdById: validActor.userId,
            createdAt: now,
            undoneAt: null,
            undoneById: null,
            undoReason: null,
          });
          createdAllocations.push(alloc);
          await tx.updateCustomerCashReceipt({
            ...rcp,
            unallocatedRupees: roundRupees(
              rcp.unallocatedRupees.sub(toApply)
            ),
          });
          remainingInr = roundRupees(remainingInr.sub(toApply));
          appliedInrCredit = roundRupees(appliedInrCredit.add(toApply));
        }
      }

      const postIssuanceBalances = await this.computeCustomerBalances(
        tx,
        validActor.organizationId,
        customer.id
      );

      const settlement = this.computeBillSettlement(
        savedBill,
        createdAllocations
      );
      savedBill.settlementStatus = settlement.settlementStatus;
      savedBill.previousAdvanceFineSnapshot = histBal.fineAdvance;
      savedBill.appliedAdvanceFineSnapshot = appliedFineCredit;
      savedBill.newReceiptFineSnapshot = newReceiptFineApplied;
      savedBill.closingFineDueSnapshot = postIssuanceBalances.fineOwed;
      savedBill.remainingAdvanceFineSnapshot = postIssuanceBalances.fineAdvance;
      savedBill.previewHtml = renderBillSnapshotHtml({
        bill: savedBill,
        appliedFineCredit,
        appliedInrCredit,
        newReceiptFineApplied,
        remainingAdvanceFine: postIssuanceBalances.fineAdvance,
        customer,
        lines: savedLines,
        template: parsedTpl,
      });
      const finalBill = await tx.updateCustomerBill(savedBill);

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "CustomerBill",
        entityId: finalBill.id,
        action: "BILL_POST_AND_DELIVER",
        summary: `Posted Bill ${finalBill.billNumber} for ${customer.name} (${finalBill.totalFineGold.toFixed(
          3
        )}g fine, ₹${finalBill.totalCashRupees.toFixed(2)})`,
        metadataJson: JSON.stringify({
          billNumber: finalBill.billNumber,
          billType: finalBill.billType,
          orderCount: built.ordersToDeliver.length,
        }),
        createdAt: now,
      });

      return {
        bill: finalBill,
        lines: savedLines,
        allocations: createdAllocations,
      };
    });
  }

  public async recordCustomerGoldReceipt(
    actor: ActorContext,
    input: {
      customerId: string;
      businessDate?: string | Date;
      referenceNumber?: string;
      notes?: string;
      lines: Array<{
        purityId: string;
        grossWeight: DecimalInput;
        touchPercent?: DecimalInput;
      }>;
      allocationMode?: "OLDEST_FIRST" | "MANUAL" | "NONE";
      selectedBillIds?: string[];
      manualAllocations?: Array<{
        billId: string;
        allocatedFineWeight: DecimalInput;
      }>;
      idempotencyKey: string;
    }
  ): Promise<{
    receipt: CustomerGoldReceiptEntity;
    lines: CustomerGoldReceiptLineEntity[];
    allocations: CustomerPaymentAllocationEntity[];
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const businessDate = parseBusinessDate(input.businessDate);

    if (!input.lines || input.lines.length === 0) {
      throw new ValidationError(
        "At least one metal purity line is required for a customer gold receipt"
      );
    }

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getCustomerGoldReceiptByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) {
        const [lines, allocs] = await Promise.all([
          tx.listCustomerGoldReceiptLines(
            validActor.organizationId,
            existing.id
          ),
          tx.listCustomerPaymentAllocations(validActor.organizationId, {
            goldReceiptId: existing.id,
          }),
        ]);
        return { receipt: existing, lines, allocations: allocs };
      }

      const customer = await tx.getCustomerById(
        validActor.organizationId,
        input.customerId
      );
      if (!customer) {
        throw new NotFoundError(`Customer ${input.customerId} not found`);
      }

      // Row-level lock to prevent concurrent double-consumption of customer advance
      await tx.lockCustomerForUpdate(validActor.organizationId, customer.id);

      const existingReceipts = await tx.listCustomerGoldReceipts(
        validActor.organizationId
      );
      const receiptNumber = `CGR-${String(existingReceipts.length + 1).padStart(
        4,
        "0"
      )}`;
      const receiptId = newId("cgr");
      const now = new Date();

      let totalGross = ZERO;
      let totalFine = ZERO;
      let firstJournalTxId: string | null = null;
      const pendingLines: Array<{
        purityId: string;
        gross: Decimal;
        touch: Decimal;
        fine: Decimal;
        journalTransactionId: string;
      }> = [];

      for (let i = 0; i < input.lines.length; i++) {
        const line = input.lines[i];
        const gross = roundInternal(line.grossWeight);
        if (gross.lte(ZERO)) {
          throw new ValidationError(
            "Received gold weight must be greater than zero"
          );
        }
        const purity = await tx.getPurityById(
          validActor.organizationId,
          line.purityId
        );
        if (!purity) {
          throw new NotFoundError(
            `Purity ${line.purityId} not found. Unknown-purity metal cannot settle fine-gold balances.`
          );
        }

        const touch =
          line.touchPercent !== undefined
            ? roundTouch(line.touchPercent)
            : purity.touchPercent;
        if (touch.lte(ZERO) || touch.gt(100)) {
          throw new ValidationError(
            "Accepted purity touch percent must be between > 0 and 100"
          );
        }

        const fine = calculateFineEquivalent(gross, touch);
        const destAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `ADMIN_POOL_${purity.code}`,
          `Admin Stock Pool - ${purity.displayLabel}`,
          "ADMIN_KARAT_POOL",
          purity.id,
          null
        );
        const inflowAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `CUSTOMER_GOLD_INFLOW_${purity.code}`,
          `Customer Gold Collection Inflow - ${purity.displayLabel}`,
          "EXTERNAL_SUPPLIER_INFLOW",
          purity.id,
          null
        );

        const jtx = await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "CUSTOMER_GOLD_RECEIPT",
          businessDate,
          purity,
          physicalWeight: gross,
          fineEquivalentWeight: fine,
          sourceAccount: inflowAcct,
          destinationAccount: destAcct,
          sourceReference: receiptNumber,
          reason: `Customer gold collection ${receiptNumber} from ${customer.name} (${gross.toFixed(
            3
          )}g @ ${touch.toFixed(2)}%)`,
          idempotencyKey: `cgr_jtx_${input.idempotencyKey}_${i}`,
        });
        if (!firstJournalTxId) firstJournalTxId = jtx.id;

        pendingLines.push({
          purityId: purity.id,
          gross,
          touch,
          fine,
          journalTransactionId: jtx.id,
        });
        totalGross = roundInternal(totalGross.add(gross));
        totalFine = roundInternal(totalFine.add(fine));
      }

      const receipt = await tx.createCustomerGoldReceipt({
        id: receiptId,
        organizationId: validActor.organizationId,
        customerId: customer.id,
        receiptNumber,
        businessDate,
        totalGrossWeight: totalGross,
        totalFineWeight: totalFine,
        unallocatedFineWeight: totalFine,
        status: "POSTED",
        referenceNumber: input.referenceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        journalTransactionId: firstJournalTxId,
        createdById: validActor.userId,
        createdAt: now,
        reversedAt: null,
        reversedById: null,
        reversalReason: null,
      });

      const createdLines: CustomerGoldReceiptLineEntity[] = [];
      for (const pl of pendingLines) {
        const savedLine = await tx.createCustomerGoldReceiptLine({
          id: newId("cgrl"),
          organizationId: validActor.organizationId,
          receiptId,
          purityId: pl.purityId,
          grossWeight: pl.gross,
          touchPercent: pl.touch,
          fineWeight: pl.fine,
          journalTransactionId: pl.journalTransactionId,
        });
        createdLines.push(savedLine);
      }

      const createdAllocations: CustomerPaymentAllocationEntity[] = [];
      let remainingFine = totalFine;
      const mode = input.allocationMode ?? "NONE";

      if (
        mode === "OLDEST_FIRST" ||
        (mode === "MANUAL" &&
          input.manualAllocations &&
          input.manualAllocations.length > 0)
      ) {
        const [customerBills, allAllocs] = await Promise.all([
          tx.listCustomerBills(validActor.organizationId, customer.id),
          tx.listCustomerPaymentAllocations(validActor.organizationId, {
            customerId: customer.id,
          }),
        ]);

        if (mode === "MANUAL" && input.manualAllocations) {
          for (let i = 0; i < input.manualAllocations.length; i++) {
            const ma = input.manualAllocations[i];
            const amt = roundInternal(ma.allocatedFineWeight);
            if (amt.lte(ZERO)) continue;
            const bill = await tx.getCustomerBillById(
              validActor.organizationId,
              ma.billId
            );
            if (!bill) {
              throw new NotFoundError(`Bill ${ma.billId} not found`);
            }
            if (bill.customerId !== customer.id) {
              throw new ValidationError(
                "Cross-customer allocation is forbidden"
              );
            }
            if (bill.status !== "POSTED") {
              throw new ConflictError(
                `Bill ${bill.billNumber} is ${bill.status} and cannot receive allocations`
              );
            }
            const bal = this.computeBillSettlement(bill, allAllocs);
            if (amt.gt(bal.fineOutstanding)) {
              throw new ValidationError(
                `Allocation (${amt.toFixed(
                  4
                )}g) exceeds bill ${bill.billNumber} fine balance (${bal.fineOutstanding.toFixed(
                  4
                )}g)`
              );
            }
            if (amt.gt(remainingFine)) {
              throw new ValidationError(
                `Allocation exceeds remaining receipt fine (${remainingFine.toFixed(
                  4
                )}g)`
              );
            }

            const alloc = await tx.createCustomerPaymentAllocation({
              id: newId("cpalloc"),
              organizationId: validActor.organizationId,
              customerId: customer.id,
              billId: bill.id,
              goldReceiptId: receipt.id,
              cashReceiptId: null,
              allocatedFineWeight: amt,
              allocatedRupees: ZERO,
              status: "ACTIVE",
              businessDate,
              notes: input.notes?.trim() || null,
              idempotencyKey: `cgr_alloc_${input.idempotencyKey}_${i}`,
              createdById: validActor.userId,
              createdAt: now,
              undoneAt: null,
              undoneById: null,
              undoReason: null,
            });
            createdAllocations.push(alloc);
            allAllocs.push(alloc);
            remainingFine = roundInternal(remainingFine.sub(amt));

            const updatedBal = this.computeBillSettlement(bill, allAllocs);
            await tx.updateCustomerBill({
              ...bill,
              settlementStatus: updatedBal.settlementStatus,
            });
          }
        } else if (mode === "OLDEST_FIRST") {
          let targetBills = customerBills
            .filter((b) => b.status === "POSTED")
            .sort((a, b) => a.billDate.getTime() - b.billDate.getTime());
          if (input.selectedBillIds && input.selectedBillIds.length > 0) {
            const selectedSet = new Set(input.selectedBillIds);
            for (const bid of selectedSet) {
              const found = await tx.getCustomerBillById(
                validActor.organizationId,
                bid
              );
              if (!found) throw new NotFoundError(`Bill ${bid} not found`);
              if (found.customerId !== customer.id) {
                throw new ValidationError(
                  "Cross-customer allocation is forbidden"
                );
              }
            }
            targetBills = targetBills.filter((b) => selectedSet.has(b.id));
          }

          for (let i = 0; i < targetBills.length; i++) {
            if (remainingFine.lte(ZERO)) break;
            const bill = targetBills[i];
            const bal = this.computeBillSettlement(bill, allAllocs);
            if (bal.fineOutstanding.lte(ZERO)) continue;
            const toApply = remainingFine.lt(bal.fineOutstanding)
              ? remainingFine
              : bal.fineOutstanding;

            const alloc = await tx.createCustomerPaymentAllocation({
              id: newId("cpalloc"),
              organizationId: validActor.organizationId,
              customerId: customer.id,
              billId: bill.id,
              goldReceiptId: receipt.id,
              cashReceiptId: null,
              allocatedFineWeight: toApply,
              allocatedRupees: ZERO,
              status: "ACTIVE",
              businessDate,
              notes: input.notes?.trim() || null,
              idempotencyKey: `cgr_alloc_${input.idempotencyKey}_${i}`,
              createdById: validActor.userId,
              createdAt: now,
              undoneAt: null,
              undoneById: null,
              undoReason: null,
            });
            createdAllocations.push(alloc);
            allAllocs.push(alloc);
            remainingFine = roundInternal(remainingFine.sub(toApply));

            const updatedBal = this.computeBillSettlement(bill, allAllocs);
            await tx.updateCustomerBill({
              ...bill,
              settlementStatus: updatedBal.settlementStatus,
            });
          }
        }
      }

      const finalReceipt = await tx.updateCustomerGoldReceipt({
        ...receipt,
        unallocatedFineWeight: remainingFine,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "CustomerGoldReceipt",
        entityId: finalReceipt.id,
        action: "CUSTOMER_GOLD_RECEIPT",
        summary: `Received ${totalGross.toFixed(3)}g (${totalFine.toFixed(
          4
        )}g fine) from ${customer.name}`,
        metadataJson: JSON.stringify({ receiptNumber }),
        createdAt: now,
      });

      return {
        receipt: finalReceipt,
        lines: createdLines,
        allocations: createdAllocations,
      };
    });
  }

  private async executeFineGoldReceiptInTx(
    tx: ErpTransactionContext,
    validActor: ActorContext,
    input: {
      customerId: string;
      amountReceived: DecimalInput;
      physicalWeightOverride?: DecimalInput;
      touchPercentOverride?: DecimalInput;
      businessDate?: string | Date;
      referenceNumber?: string;
      notes?: string;
      allocationMode?: "OLDEST_FIRST" | "CHOOSE_BILLS" | "MANUAL" | "NONE";
      selectedBillIds?: string[];
      manualAllocations?: Array<{
        billId: string;
        allocatedFineWeight: DecimalInput;
      }>;
      idempotencyKey: string;
    }
  ): Promise<{
    receipt: CustomerGoldReceiptEntity;
    lines: CustomerGoldReceiptLineEntity[];
    allocations: CustomerPaymentAllocationEntity[];
    unselectedUnpaidBillsCount: number;
    unselectedUnpaidFineTotal: Decimal;
  }> {
    const existing = await tx.getCustomerGoldReceiptByIdempotencyKey(
      input.idempotencyKey
    );
    if (existing) {
      const [lines, allocs] = await Promise.all([
        tx.listCustomerGoldReceiptLines(validActor.organizationId, existing.id),
        tx.listCustomerPaymentAllocations(validActor.organizationId, {
          goldReceiptId: existing.id,
        }),
      ]);
      return {
        receipt: existing,
        lines,
        allocations: allocs,
        unselectedUnpaidBillsCount: 0,
        unselectedUnpaidFineTotal: ZERO,
      };
    }

    const customer = await tx.getCustomerById(
      validActor.organizationId,
      input.customerId
    );
    if (!customer) {
      throw new NotFoundError(`Customer ${input.customerId} not found`);
    }

    await tx.lockCustomerForUpdate(validActor.organizationId, customer.id);

    const conv = await this.resolveFineAccountAndConvention(
      tx,
      validActor.organizationId
    );
    if (conv.mode === "UNCONFIGURED") {
      throw new ValidationError(
        "Customer Fine Gold Receipt Convention is not configured. Configure the one-time owner setting (Mode A: Fine-equivalent grams or Mode B: Physical weight at configured fixed touch) before recording customer receipts."
      );
    }

    const businessDate = parseBusinessDate(input.businessDate);
    const amount = roundInternal(input.amountReceived);
    if (amount.lte(ZERO)) {
      throw new ValidationError(
        "Received fine gold amount must be greater than zero"
      );
    }

    let grossWeight = ZERO;
    let touchSnapshot = ZERO;
    let creditedFine = ZERO;
    let physicalWeightProvided = false;

    if (conv.mode === "FINE_EQUIVALENT") {
      creditedFine = amount;
      if (
        input.physicalWeightOverride !== undefined &&
        input.physicalWeightOverride !== null &&
        String(input.physicalWeightOverride).trim() !== ""
      ) {
        grossWeight = roundInternal(input.physicalWeightOverride);
        if (grossWeight.lte(ZERO)) {
          throw new ValidationError(
            "Optional measured physical weight must be greater than zero when provided"
          );
        }
        touchSnapshot =
          input.touchPercentOverride !== undefined &&
          input.touchPercentOverride !== null &&
          String(input.touchPercentOverride).trim() !== ""
            ? roundTouch(input.touchPercentOverride)
            : roundTouch(creditedFine.mul(100).div(grossWeight));
        physicalWeightProvided = true;
      } else {
        // Mode A without measured physical weight: do not fabricate physical weight or imply 100% purity
        grossWeight = ZERO;
        touchSnapshot = ZERO;
        physicalWeightProvided = false;
      }
    } else {
      // Mode B: PHYSICAL_AT_CONFIGURED_TOUCH
      grossWeight = amount;
      touchSnapshot = conv.configuredTouch!;
      creditedFine = calculateFineEquivalent(grossWeight, touchSnapshot);
      physicalWeightProvided = true;
    }

    if (creditedFine.lte(ZERO)) {
      throw new ValidationError(
        "Credited fine gold equivalent must be greater than zero"
      );
    }

    const existingReceipts = await tx.listCustomerGoldReceipts(
      validActor.organizationId
    );
    const receiptNumber = `CGR-${String(existingReceipts.length + 1).padStart(
      4,
      "0"
    )}`;
    const receiptId = newId("cgr");
    const now = new Date();

    const destAcct = await this.ensureSystemAccount(
      tx,
      validActor.organizationId,
      `ADMIN_POOL_${conv.finePurity.code}`,
      `Admin Stock Pool - ${conv.finePurity.displayLabel}`,
      "ADMIN_KARAT_POOL",
      conv.finePurity.id,
      null
    );
    const inflowAcct = await this.ensureSystemAccount(
      tx,
      validActor.organizationId,
      `CUSTOMER_GOLD_INFLOW_${conv.finePurity.code}`,
      `Customer Gold Collection Inflow - ${conv.finePurity.displayLabel}`,
      "EXTERNAL_SUPPLIER_INFLOW",
      conv.finePurity.id,
      null
    );

    const reasonDesc =
      conv.mode === "FINE_EQUIVALENT"
        ? physicalWeightProvided
          ? `Customer fine gold receipt ${receiptNumber} from ${customer.name} (${creditedFine.toFixed(
              4
            )}g fine; measured ${grossWeight.toFixed(
              3
            )}g @ ${touchSnapshot.toFixed(2)}%)`
          : `Customer fine gold receipt ${receiptNumber} from ${customer.name} (${creditedFine.toFixed(
              4
            )}g fine equivalent)`
        : `Customer fine gold receipt ${receiptNumber} from ${customer.name} (${grossWeight.toFixed(
            3
          )}g physical @ ${touchSnapshot.toFixed(2)}% = ${creditedFine.toFixed(
            4
          )}g fine)`;

    const jtx = await this.postBalancedJournalEntry(tx, {
      organizationId: validActor.organizationId,
      actorId: validActor.userId,
      transactionType: "CUSTOMER_GOLD_RECEIPT",
      businessDate,
      purity: conv.finePurity,
      physicalWeight: grossWeight,
      fineEquivalentWeight: creditedFine,
      sourceAccount: inflowAcct,
      destinationAccount: destAcct,
      sourceReference: receiptNumber,
      reason: reasonDesc,
      idempotencyKey: `cgr_jtx_${input.idempotencyKey}_0`,
    });

    const receipt = await tx.createCustomerGoldReceipt({
      id: receiptId,
      organizationId: validActor.organizationId,
      customerId: customer.id,
      receiptNumber,
      businessDate,
      totalGrossWeight: grossWeight,
      totalFineWeight: creditedFine,
      unallocatedFineWeight: creditedFine,
      refundedFineWeight: ZERO,
      inputModeSnapshot: conv.mode,
      physicalWeightProvided,
      status: "POSTED",
      referenceNumber: input.referenceNumber?.trim() || null,
      notes: input.notes?.trim() || null,
      idempotencyKey: input.idempotencyKey,
      journalTransactionId: jtx.id,
      createdById: validActor.userId,
      createdAt: now,
      reversedAt: null,
      reversedById: null,
      reversalReason: null,
    });

    const savedLine = await tx.createCustomerGoldReceiptLine({
      id: newId("cgrl"),
      organizationId: validActor.organizationId,
      receiptId,
      purityId: conv.finePurity.id,
      grossWeight,
      touchPercent: touchSnapshot,
      fineWeight: creditedFine,
      journalTransactionId: jtx.id,
    });

    const createdAllocations: CustomerPaymentAllocationEntity[] = [];
    let remainingFine = creditedFine;
    const mode = input.allocationMode ?? "OLDEST_FIRST";
    let unselectedUnpaidBillsCount = 0;
    let unselectedUnpaidFineTotal = ZERO;

    const [customerBills, allAllocs] = await Promise.all([
      tx.listCustomerBills(validActor.organizationId, customer.id),
      tx.listCustomerPaymentAllocations(validActor.organizationId, {
        customerId: customer.id,
      }),
    ]);

    const postedBillsOldestFirst = customerBills
      .filter((b) => b.status === "POSTED")
      .sort(
        (a, b) =>
          a.billDate.getTime() - b.billDate.getTime() ||
          a.createdAt.getTime() - b.createdAt.getTime()
      );

    if (
      mode === "MANUAL" &&
      input.manualAllocations &&
      input.manualAllocations.length > 0
    ) {
      const selectedSet = new Set<string>();
      for (let i = 0; i < input.manualAllocations.length; i++) {
        const ma = input.manualAllocations[i];
        const amt = roundInternal(ma.allocatedFineWeight);
        if (amt.lte(ZERO)) continue;
        const bill = await tx.getCustomerBillById(
          validActor.organizationId,
          ma.billId
        );
        if (!bill) throw new NotFoundError(`Bill ${ma.billId} not found`);
        if (bill.customerId !== customer.id) {
          throw new ValidationError("Cross-customer allocation is forbidden");
        }
        if (bill.status !== "POSTED") {
          throw new ConflictError(
            `Bill ${bill.billNumber} is ${bill.status} and cannot receive allocations`
          );
        }
        const bal = this.computeBillSettlement(bill, allAllocs);
        if (amt.gt(bal.fineOutstanding)) {
          throw new ValidationError(
            `Allocation (${amt.toFixed(4)}g) exceeds bill ${
              bill.billNumber
            } fine balance (${bal.fineOutstanding.toFixed(4)}g)`
          );
        }
        if (amt.gt(remainingFine)) {
          throw new ValidationError(
            `Allocation exceeds remaining receipt fine (${remainingFine.toFixed(
              4
            )}g)`
          );
        }
        selectedSet.add(bill.id);
        const alloc = await tx.createCustomerPaymentAllocation({
          id: newId("cpalloc"),
          organizationId: validActor.organizationId,
          customerId: customer.id,
          billId: bill.id,
          goldReceiptId: receipt.id,
          cashReceiptId: null,
          allocatedFineWeight: amt,
          allocatedRupees: ZERO,
          status: "ACTIVE",
          businessDate,
          notes: input.notes?.trim() || null,
          idempotencyKey: `cgr_alloc_${input.idempotencyKey}_${i}`,
          createdById: validActor.userId,
          createdAt: now,
          undoneAt: null,
          undoneById: null,
          undoReason: null,
        });
        createdAllocations.push(alloc);
        allAllocs.push(alloc);
        remainingFine = roundInternal(remainingFine.sub(amt));

        const updatedBal = this.computeBillSettlement(bill, allAllocs);
        await tx.updateCustomerBill({
          ...bill,
          settlementStatus: updatedBal.settlementStatus,
        });
      }
      for (const b of postedBillsOldestFirst) {
        if (!selectedSet.has(b.id)) {
          const bal = this.computeBillSettlement(b, allAllocs);
          if (bal.fineOutstanding.gt(ZERO)) {
            unselectedUnpaidBillsCount++;
            unselectedUnpaidFineTotal = roundInternal(
              unselectedUnpaidFineTotal.add(bal.fineOutstanding)
            );
          }
        }
      }
    } else if (mode === "OLDEST_FIRST" || mode === "CHOOSE_BILLS") {
      let targetBills = postedBillsOldestFirst;
      const hasExplicitSelection =
        mode === "CHOOSE_BILLS" ||
        (input.selectedBillIds !== undefined &&
          input.selectedBillIds.length > 0);
      if (hasExplicitSelection) {
        const selectedSet = new Set(input.selectedBillIds ?? []);
        for (const bid of selectedSet) {
          const found = await tx.getCustomerBillById(
            validActor.organizationId,
            bid
          );
          if (!found) throw new NotFoundError(`Bill ${bid} not found`);
          if (found.customerId !== customer.id) {
            throw new ValidationError("Cross-customer allocation is forbidden");
          }
          if (found.status !== "POSTED") {
            throw new ConflictError(
              `Bill ${found.billNumber} is ${found.status} and cannot receive allocations`
            );
          }
        }
        targetBills = postedBillsOldestFirst.filter((b) =>
          selectedSet.has(b.id)
        );
        for (const b of postedBillsOldestFirst) {
          if (!selectedSet.has(b.id)) {
            const bal = this.computeBillSettlement(b, allAllocs);
            if (bal.fineOutstanding.gt(ZERO)) {
              unselectedUnpaidBillsCount++;
              unselectedUnpaidFineTotal = roundInternal(
                unselectedUnpaidFineTotal.add(bal.fineOutstanding)
              );
            }
          }
        }
      }

      for (let i = 0; i < targetBills.length; i++) {
        if (remainingFine.lte(ZERO)) break;
        const bill = targetBills[i];
        const bal = this.computeBillSettlement(bill, allAllocs);
        if (bal.fineOutstanding.lte(ZERO)) continue;
        const toApply = remainingFine.lt(bal.fineOutstanding)
          ? remainingFine
          : bal.fineOutstanding;

        const alloc = await tx.createCustomerPaymentAllocation({
          id: newId("cpalloc"),
          organizationId: validActor.organizationId,
          customerId: customer.id,
          billId: bill.id,
          goldReceiptId: receipt.id,
          cashReceiptId: null,
          allocatedFineWeight: toApply,
          allocatedRupees: ZERO,
          status: "ACTIVE",
          businessDate,
          notes: input.notes?.trim() || null,
          idempotencyKey: `cgr_alloc_${input.idempotencyKey}_${i}`,
          createdById: validActor.userId,
          createdAt: now,
          undoneAt: null,
          undoneById: null,
          undoReason: null,
        });
        createdAllocations.push(alloc);
        allAllocs.push(alloc);
        remainingFine = roundInternal(remainingFine.sub(toApply));

        const updatedBal = this.computeBillSettlement(bill, allAllocs);
        await tx.updateCustomerBill({
          ...bill,
          settlementStatus: updatedBal.settlementStatus,
        });
      }
    } else if (mode === "NONE") {
      for (const b of postedBillsOldestFirst) {
        const bal = this.computeBillSettlement(b, allAllocs);
        if (bal.fineOutstanding.gt(ZERO)) {
          unselectedUnpaidBillsCount++;
          unselectedUnpaidFineTotal = roundInternal(
            unselectedUnpaidFineTotal.add(bal.fineOutstanding)
          );
        }
      }
    }

    const finalReceipt = await tx.updateCustomerGoldReceipt({
      ...receipt,
      unallocatedFineWeight: remainingFine,
    });

    await tx.createAuditEvent({
      id: newId("aud"),
      organizationId: validActor.organizationId,
      actorId: validActor.userId,
      entityType: "CustomerGoldReceipt",
      entityId: finalReceipt.id,
      action: "CUSTOMER_FINE_GOLD_RECEIPT",
      summary: reasonDesc,
      metadataJson: JSON.stringify({
        receiptNumber,
        mode: conv.mode,
        creditedFine: creditedFine.toFixed(4),
        physicalWeightProvided,
        allocatedFine: creditedFine.sub(remainingFine).toFixed(4),
        unallocatedAdvance: remainingFine.toFixed(4),
      }),
      createdAt: now,
    });

    return {
      receipt: finalReceipt,
      lines: [savedLine],
      allocations: createdAllocations,
      unselectedUnpaidBillsCount,
      unselectedUnpaidFineTotal,
    };
  }

  public async previewCustomerFineGoldReceipt(
    actor: ActorContext,
    input: {
      customerId: string;
      amountReceived: DecimalInput;
      physicalWeightOverride?: DecimalInput;
      touchPercentOverride?: DecimalInput;
      allocationMode?: "OLDEST_FIRST" | "CHOOSE_BILLS" | "MANUAL" | "NONE";
      selectedBillIds?: string[];
      manualAllocations?: Array<{
        billId: string;
        allocatedFineWeight: DecimalInput;
      }>;
    }
  ) {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction(async (tx) => {
      const customer = await tx.getCustomerById(
        validActor.organizationId,
        input.customerId
      );
      if (!customer) {
        throw new NotFoundError(`Customer ${input.customerId} not found`);
      }

      const conv = await this.resolveFineAccountAndConvention(
        tx,
        validActor.organizationId
      );
      if (conv.mode === "UNCONFIGURED") {
        throw new ValidationError(
          "Customer Fine Gold Receipt Convention is not configured. Configure Mode A or Mode B first."
        );
      }

      const preBal = await this.computeCustomerBalances(
        tx,
        validActor.organizationId,
        customer.id
      );

      const amount = roundInternal(input.amountReceived || 0);
      if (amount.lte(ZERO)) {
        throw new ValidationError("Amount received must be greater than zero");
      }

      let grossWeight: Decimal | null = null;
      let touchSnapshot: Decimal | null = null;
      let creditedFine = ZERO;

      if (conv.mode === "FINE_EQUIVALENT") {
        creditedFine = amount;
        if (
          input.physicalWeightOverride !== undefined &&
          input.physicalWeightOverride !== null &&
          String(input.physicalWeightOverride).trim() !== ""
        ) {
          grossWeight = roundInternal(input.physicalWeightOverride);
          touchSnapshot =
            input.touchPercentOverride !== undefined &&
            input.touchPercentOverride !== null &&
            String(input.touchPercentOverride).trim() !== ""
              ? roundTouch(input.touchPercentOverride)
              : grossWeight.gt(ZERO)
              ? roundTouch(creditedFine.mul(100).div(grossWeight))
              : null;
        }
      } else {
        grossWeight = amount;
        touchSnapshot = conv.configuredTouch!;
        creditedFine = calculateFineEquivalent(grossWeight, touchSnapshot);
      }

      const [customerBills, allAllocs] = await Promise.all([
        tx.listCustomerBills(validActor.organizationId, customer.id),
        tx.listCustomerPaymentAllocations(validActor.organizationId, {
          customerId: customer.id,
        }),
      ]);

      const postedBillsOldestFirst = customerBills
        .filter((b) => b.status === "POSTED")
        .sort(
          (a, b) =>
            a.billDate.getTime() - b.billDate.getTime() ||
            a.createdAt.getTime() - b.createdAt.getTime()
        );

      const mode = input.allocationMode ?? "OLDEST_FIRST";
      let remainingFine = creditedFine;
      let amountSettlingBills = ZERO;
      const billAllocationsPreview: Array<{
        billId: string;
        billNumber: string;
        billDate: string;
        fineBefore: string;
        allocatedFine: string;
        fineAfter: string;
        statusAfter: string;
      }> = [];
      let unselectedUnpaidBillsCount = 0;
      let unselectedUnpaidFineTotal = ZERO;

      if (mode === "MANUAL" && input.manualAllocations) {
        const manualMap = new Map(
          input.manualAllocations.map((m) => [
            m.billId,
            roundInternal(m.allocatedFineWeight || 0),
          ])
        );
        for (const bill of postedBillsOldestFirst) {
          const bal = this.computeBillSettlement(bill, allAllocs);
          if (bal.fineOutstanding.lte(ZERO)) continue;
          const reqAmt = manualMap.get(bill.id) ?? ZERO;
          if (reqAmt.gt(ZERO)) {
            const toApply = Decimal.min(
              reqAmt,
              bal.fineOutstanding,
              remainingFine
            );
            remainingFine = roundInternal(remainingFine.sub(toApply));
            amountSettlingBills = roundInternal(
              amountSettlingBills.add(toApply)
            );
            const after = roundInternal(bal.fineOutstanding.sub(toApply));
            billAllocationsPreview.push({
              billId: bill.id,
              billNumber: bill.billNumber,
              billDate: bill.billDate.toISOString().slice(0, 10),
              fineBefore: bal.fineOutstanding.toFixed(4),
              allocatedFine: toApply.toFixed(4),
              fineAfter: after.toFixed(4),
              statusAfter: after.lte(ZERO) ? "SETTLED" : "PARTIAL",
            });
          } else {
            unselectedUnpaidBillsCount++;
            unselectedUnpaidFineTotal = roundInternal(
              unselectedUnpaidFineTotal.add(bal.fineOutstanding)
            );
          }
        }
      } else if (mode === "OLDEST_FIRST" || mode === "CHOOSE_BILLS") {
        const hasExplicitSelection =
          mode === "CHOOSE_BILLS" ||
          (input.selectedBillIds !== undefined &&
            input.selectedBillIds.length > 0);
        const selectedSet = new Set(input.selectedBillIds ?? []);

        for (const bill of postedBillsOldestFirst) {
          const bal = this.computeBillSettlement(bill, allAllocs);
          if (bal.fineOutstanding.lte(ZERO)) continue;
          if (hasExplicitSelection && !selectedSet.has(bill.id)) {
            unselectedUnpaidBillsCount++;
            unselectedUnpaidFineTotal = roundInternal(
              unselectedUnpaidFineTotal.add(bal.fineOutstanding)
            );
            continue;
          }
          if (remainingFine.lte(ZERO)) {
            billAllocationsPreview.push({
              billId: bill.id,
              billNumber: bill.billNumber,
              billDate: bill.billDate.toISOString().slice(0, 10),
              fineBefore: bal.fineOutstanding.toFixed(4),
              allocatedFine: ZERO.toFixed(4),
              fineAfter: bal.fineOutstanding.toFixed(4),
              statusAfter:
                bal.finePaid.gt(ZERO) || bal.inrPaid.gt(ZERO)
                  ? "PARTIAL"
                  : "UNPAID",
            });
            continue;
          }
          const toApply = remainingFine.lt(bal.fineOutstanding)
            ? remainingFine
            : bal.fineOutstanding;
          remainingFine = roundInternal(remainingFine.sub(toApply));
          amountSettlingBills = roundInternal(amountSettlingBills.add(toApply));
          const after = roundInternal(bal.fineOutstanding.sub(toApply));
          billAllocationsPreview.push({
            billId: bill.id,
            billNumber: bill.billNumber,
            billDate: bill.billDate.toISOString().slice(0, 10),
            fineBefore: bal.fineOutstanding.toFixed(4),
            allocatedFine: toApply.toFixed(4),
            fineAfter: after.toFixed(4),
            statusAfter: after.lte(ZERO) ? "SETTLED" : "PARTIAL",
          });
        }
      } else {
        for (const bill of postedBillsOldestFirst) {
          const bal = this.computeBillSettlement(bill, allAllocs);
          if (bal.fineOutstanding.gt(ZERO)) {
            unselectedUnpaidBillsCount++;
            unselectedUnpaidFineTotal = roundInternal(
              unselectedUnpaidFineTotal.add(bal.fineOutstanding)
            );
          }
        }
      }

      const remainingDueAfterReceipt = roundInternal(
        Decimal.max(ZERO, preBal.fineOwed.sub(amountSettlingBills))
      );
      const advanceRemainingAfterSettlement = roundInternal(
        preBal.fineAdvance.add(remainingFine)
      );

      return {
        customerId: customer.id,
        customerName: customer.name,
        mode: conv.mode,
        configuredTouch: conv.configuredTouch
          ? conv.configuredTouch.toFixed(4)
          : null,
        destinationAccountCode: `ADMIN_POOL_${conv.finePurity.code}`,
        destinationAccountName: `Admin Stock Pool - ${conv.finePurity.displayLabel}`,
        currentGoldDue: preBal.fineOwed.toFixed(4),
        currentAdvanceAvailable: preBal.fineAdvance.toFixed(4),
        enteredAmount: amount.toFixed(4),
        physicalWeight: grossWeight ? grossWeight.toFixed(3) : null,
        touchPercent: touchSnapshot ? touchSnapshot.toFixed(2) : null,
        fineAmountCredited: creditedFine.toFixed(4),
        amountSettlingBills: amountSettlingBills.toFixed(4),
        remainingDue: remainingDueAfterReceipt.toFixed(4),
        newAdvanceFromReceipt: remainingFine.toFixed(4),
        advanceRemainingAfterSettlement:
          advanceRemainingAfterSettlement.toFixed(4),
        goldAddedToAdminStock: {
          fineEquivalentGrams: creditedFine.toFixed(4),
          physicalGrams: grossWeight ? grossWeight.toFixed(3) : null,
          accountCode: `ADMIN_POOL_${conv.finePurity.code}`,
          accountName: `Admin Stock Pool - ${conv.finePurity.displayLabel}`,
        },
        billAllocationsPreview,
        unselectedUnpaidBillsCount,
        unselectedUnpaidFineTotal: unselectedUnpaidFineTotal.toFixed(4),
      };
    });
  }

  public async receiveCustomerFineGold(
    actor: ActorContext,
    input: {
      customerId: string;
      amountReceived: DecimalInput;
      physicalWeightOverride?: DecimalInput;
      touchPercentOverride?: DecimalInput;
      businessDate?: string | Date;
      referenceNumber?: string;
      notes?: string;
      allocationMode?: "OLDEST_FIRST" | "CHOOSE_BILLS" | "MANUAL" | "NONE";
      selectedBillIds?: string[];
      manualAllocations?: Array<{
        billId: string;
        allocatedFineWeight: DecimalInput;
      }>;
      idempotencyKey: string;
    }
  ) {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    return this.repo.runInTransaction(async (tx) => {
      return this.executeFineGoldReceiptInTx(tx, validActor, input);
    });
  }

  public async refundCustomerGoldAdvance(
    actor: ActorContext,
    input: {
      customerId: string;
      refundFineWeight: DecimalInput;
      physicalReturnWeight?: DecimalInput;
      receiptId?: string;
      businessDate?: string | Date;
      reason: string;
      idempotencyKey: string;
    }
  ): Promise<{
    refundNumber: string;
    refundedFineWeight: string;
    physicalReturnedWeight: string;
    journalTransactionId: string;
    remainingAdvance: string;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError(
        "Reason is required to refund a customer gold advance"
      );
    }
    const requestedFine = roundInternal(input.refundFineWeight);
    if (requestedFine.lte(ZERO)) {
      throw new ValidationError(
        "Refund fine gold weight must be greater than zero"
      );
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const customer = await tx.getCustomerById(
        validActor.organizationId,
        input.customerId
      );
      if (!customer) {
        throw new NotFoundError(`Customer ${input.customerId} not found`);
      }

      await tx.lockCustomerForUpdate(validActor.organizationId, customer.id);

      const jtxIdempKey = `cust_gold_refund_${input.idempotencyKey}`;
      const existingJtx = await tx.getJournalTransactionByIdempotencyKey(
        jtxIdempKey
      );
      if (existingJtx) {
        const postBal = await this.computeCustomerBalances(
          tx,
          validActor.organizationId,
          customer.id
        );
        const allLines = await tx.listJournalLines(validActor.organizationId);
        const outEntry = allLines.find(
          (e) =>
            e.journalTransactionId === existingJtx.id &&
            e.direction === "CREDIT_OUT"
        );
        const refStr = existingJtx.sourceReference ?? "";
        return {
          refundNumber: refStr.split("|")[2] || refStr || "CRF",
          refundedFineWeight: (
            outEntry ? outEntry.signedFineDelta.abs() : requestedFine
          ).toFixed(4),
          physicalReturnedWeight: (
            outEntry ? outEntry.signedPhysicalDelta.abs() : ZERO
          ).toFixed(3),
          journalTransactionId: existingJtx.id,
          remainingAdvance: postBal.fineAdvance.toFixed(4),
        };
      }

      const preBal = await this.computeCustomerBalances(
        tx,
        validActor.organizationId,
        customer.id
      );
      if (requestedFine.gt(preBal.fineAdvance)) {
        throw new ValidationError(
          `Requested refund (${requestedFine.toFixed(
            4
          )}g fine) exceeds customer's available advance (${preBal.fineAdvance.toFixed(
            4
          )}g fine)`
        );
      }

      const allReceipts = await tx.listCustomerGoldReceipts(
        validActor.organizationId,
        customer.id
      );
      let candidateReceipts = allReceipts
        .filter(
          (r) => r.status === "POSTED" && r.unallocatedFineWeight.gt(ZERO)
        )
        .sort(
          (a, b) =>
            a.businessDate.getTime() - b.businessDate.getTime() ||
            a.createdAt.getTime() - b.createdAt.getTime()
        );

      if (input.receiptId) {
        candidateReceipts = candidateReceipts.filter(
          (r) => r.id === input.receiptId
        );
        if (candidateReceipts.length === 0) {
          throw new NotFoundError(
            `Receipt ${input.receiptId} has no available advance to refund`
          );
        }
      }

      let remainingToRefund = requestedFine;
      let calculatedPhysicalReturn = ZERO;
      const receiptUpdates: Array<{
        receipt: CustomerGoldReceiptEntity;
        consumeFine: Decimal;
      }> = [];

      for (const rcp of candidateReceipts) {
        if (remainingToRefund.lte(ZERO)) break;
        const consume = Decimal.min(
          rcp.unallocatedFineWeight,
          remainingToRefund
        );
        if (consume.lte(ZERO)) continue;
        receiptUpdates.push({ receipt: rcp, consumeFine: consume });
        if (
          rcp.physicalWeightProvided !== false &&
          rcp.totalGrossWeight.gt(ZERO) &&
          rcp.totalFineWeight.gt(ZERO)
        ) {
          const propPhys = roundInternal(
            rcp.totalGrossWeight.mul(consume).div(rcp.totalFineWeight)
          );
          calculatedPhysicalReturn = roundInternal(
            calculatedPhysicalReturn.add(propPhys)
          );
        }
        remainingToRefund = roundInternal(remainingToRefund.sub(consume));
      }

      if (remainingToRefund.gt(ZERO)) {
        throw new ValidationError(
          `Insufficient unallocated advance on selected receipt(s) to refund ${requestedFine.toFixed(
            4
          )}g fine`
        );
      }

      const conv = await this.resolveFineAccountAndConvention(
        tx,
        validActor.organizationId
      );
      let physicalReturn = calculatedPhysicalReturn;
      if (
        input.physicalReturnWeight !== undefined &&
        input.physicalReturnWeight !== null &&
        String(input.physicalReturnWeight).trim() !== ""
      ) {
        physicalReturn = roundInternal(input.physicalReturnWeight);
        if (physicalReturn.lt(ZERO)) {
          throw new ValidationError(
            "Physical return weight cannot be negative"
          );
        }
      }

      const adminFineAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${conv.finePurity.code}`,
        `Admin Stock Pool - ${conv.finePurity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        conv.finePurity.id,
        null
      );
      const inflowAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `CUSTOMER_GOLD_INFLOW_${conv.finePurity.code}`,
        `Customer Gold Collection Inflow - ${conv.finePurity.displayLabel}`,
        "EXTERNAL_SUPPLIER_INFLOW",
        conv.finePurity.id,
        null
      );

      if (adminFineAcct.cachedFineBalance.lt(requestedFine)) {
        throw new ConflictError(
          `Cannot refund ${requestedFine.toFixed(
            4
          )}g fine: Admin Fine Gold stock (${adminFineAcct.cachedFineBalance.toFixed(
            4
          )}g fine) has insufficient fine balance`
        );
      }
      if (
        physicalReturn.gt(ZERO) &&
        adminFineAcct.cachedPhysicalBalance.lt(physicalReturn)
      ) {
        throw new ConflictError(
          `Cannot refund ${physicalReturn.toFixed(
            3
          )}g physical: Admin Fine Gold stock (${adminFineAcct.cachedPhysicalBalance.toFixed(
            3
          )}g physical) has insufficient physical balance`
        );
      }

      for (const u of receiptUpdates) {
        await tx.updateCustomerGoldReceipt({
          ...u.receipt,
          unallocatedFineWeight: roundInternal(
            u.receipt.unallocatedFineWeight.sub(u.consumeFine)
          ),
          refundedFineWeight: roundInternal(
            (u.receipt.refundedFineWeight ?? ZERO).add(u.consumeFine)
          ),
        });
      }

      const refundNumber = `CRF-${Date.now().toString().slice(-6)}`;
      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "CUSTOMER_GOLD_REFUND",
        businessDate,
        purity: conv.finePurity,
        physicalWeight: physicalReturn,
        fineEquivalentWeight: requestedFine,
        sourceAccount: adminFineAcct,
        destinationAccount: inflowAcct,
        sourceReference: `REFUND|${customer.id}|${refundNumber}`,
        reason: `Customer advance refund ${refundNumber} to ${
          customer.name
        } (${requestedFine.toFixed(4)}g fine${
          physicalReturn.gt(ZERO)
            ? `, ${physicalReturn.toFixed(3)}g physical`
            : ""
        }): ${reason}`,
        idempotencyKey: jtxIdempKey,
      });

      const postBal = await this.computeCustomerBalances(
        tx,
        validActor.organizationId,
        customer.id
      );

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "Customer",
        entityId: customer.id,
        action: "CUSTOMER_GOLD_ADVANCE_REFUND",
        summary: `Refunded ${requestedFine.toFixed(4)}g fine advance (${refundNumber}) to ${customer.name}: ${reason}`,
        metadataJson: JSON.stringify({
          refundNumber,
          refundedFineWeight: requestedFine.toFixed(4),
          physicalReturnedWeight: physicalReturn.toFixed(3),
          reason,
          journalTransactionId: jtx.id,
        }),
        createdAt: new Date(),
      });

      return {
        refundNumber,
        refundedFineWeight: requestedFine.toFixed(4),
        physicalReturnedWeight: physicalReturn.toFixed(3),
        journalTransactionId: jtx.id,
        remainingAdvance: postBal.fineAdvance.toFixed(4),
      };
    });
  }

  public async recordCustomerCashReceipt(
    actor: ActorContext,
    input: {
      customerId: string;
      businessDate?: string | Date;
      amountRupees: DecimalInput;
      paymentMode?: string;
      referenceNumber?: string;
      notes?: string;
      allocationMode?: "OLDEST_FIRST" | "MANUAL" | "NONE";
      selectedBillIds?: string[];
      manualAllocations?: Array<{
        billId: string;
        allocatedRupees: DecimalInput;
      }>;
      idempotencyKey: string;
    }
  ): Promise<{
    receipt: CustomerCashReceiptEntity;
    allocations: CustomerPaymentAllocationEntity[];
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const businessDate = parseBusinessDate(input.businessDate);
    const amount = roundRupees(input.amountRupees);
    if (amount.lte(ZERO)) {
      throw new ValidationError("Cash receipt amount must be greater than zero");
    }

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getCustomerCashReceiptByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) {
        const allocs = await tx.listCustomerPaymentAllocations(
          validActor.organizationId,
          { cashReceiptId: existing.id }
        );
        return { receipt: existing, allocations: allocs };
      }

      const customer = await tx.getCustomerById(
        validActor.organizationId,
        input.customerId
      );
      if (!customer) {
        throw new NotFoundError(`Customer ${input.customerId} not found`);
      }

      // Row-level lock to prevent concurrent double-consumption of customer advance
      await tx.lockCustomerForUpdate(validActor.organizationId, customer.id);

      const existingCash = await tx.listCustomerCashReceipts(
        validActor.organizationId
      );
      const receiptNumber = `CCR-${String(existingCash.length + 1).padStart(
        4,
        "0"
      )}`;
      const now = new Date();

      const receipt = await tx.createCustomerCashReceipt({
        id: newId("ccr"),
        organizationId: validActor.organizationId,
        customerId: customer.id,
        receiptNumber,
        businessDate,
        amountRupees: amount,
        unallocatedRupees: amount,
        paymentMode: input.paymentMode || "CASH",
        status: "POSTED",
        referenceNumber: input.referenceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        idempotencyKey: input.idempotencyKey,
        createdById: validActor.userId,
        createdAt: now,
        reversedAt: null,
        reversedById: null,
        reversalReason: null,
      });

      const createdAllocations: CustomerPaymentAllocationEntity[] = [];
      let remainingInr = amount;
      const mode = input.allocationMode ?? "NONE";

      if (
        mode === "OLDEST_FIRST" ||
        (mode === "MANUAL" &&
          input.manualAllocations &&
          input.manualAllocations.length > 0)
      ) {
        const [customerBills, allAllocs] = await Promise.all([
          tx.listCustomerBills(validActor.organizationId, customer.id),
          tx.listCustomerPaymentAllocations(validActor.organizationId, {
            customerId: customer.id,
          }),
        ]);

        if (mode === "MANUAL" && input.manualAllocations) {
          for (let i = 0; i < input.manualAllocations.length; i++) {
            const ma = input.manualAllocations[i];
            const amt = roundRupees(ma.allocatedRupees);
            if (amt.lte(ZERO)) continue;
            const bill = await tx.getCustomerBillById(
              validActor.organizationId,
              ma.billId
            );
            if (!bill) throw new NotFoundError(`Bill ${ma.billId} not found`);
            if (bill.customerId !== customer.id) {
              throw new ValidationError(
                "Cross-customer allocation is forbidden"
              );
            }
            if (bill.status !== "POSTED") {
              throw new ConflictError(`Bill ${bill.billNumber} is ${bill.status}`);
            }
            const bal = this.computeBillSettlement(bill, allAllocs);
            if (amt.gt(bal.inrOutstanding)) {
              throw new ValidationError(
                `Allocation ₹${amt.toFixed(2)} exceeds bill ${
                  bill.billNumber
                } INR balance ₹${bal.inrOutstanding.toFixed(2)}`
              );
            }
            if (amt.gt(remainingInr)) {
              throw new ValidationError(
                `Allocation exceeds remaining cash receipt ₹${remainingInr.toFixed(
                  2
                )}`
              );
            }

            const alloc = await tx.createCustomerPaymentAllocation({
              id: newId("cpalloc"),
              organizationId: validActor.organizationId,
              customerId: customer.id,
              billId: bill.id,
              goldReceiptId: null,
              cashReceiptId: receipt.id,
              allocatedFineWeight: ZERO,
              allocatedRupees: amt,
              status: "ACTIVE",
              businessDate,
              notes: input.notes?.trim() || null,
              idempotencyKey: `ccr_alloc_${input.idempotencyKey}_${i}`,
              createdById: validActor.userId,
              createdAt: now,
              undoneAt: null,
              undoneById: null,
              undoReason: null,
            });
            createdAllocations.push(alloc);
            allAllocs.push(alloc);
            remainingInr = roundRupees(remainingInr.sub(amt));

            const updatedBal = this.computeBillSettlement(bill, allAllocs);
            await tx.updateCustomerBill({
              ...bill,
              settlementStatus: updatedBal.settlementStatus,
            });
          }
        } else if (mode === "OLDEST_FIRST") {
          let targetBills = customerBills
            .filter((b) => b.status === "POSTED")
            .sort((a, b) => a.billDate.getTime() - b.billDate.getTime());
          if (input.selectedBillIds && input.selectedBillIds.length > 0) {
            const selectedSet = new Set(input.selectedBillIds);
            targetBills = targetBills.filter((b) => selectedSet.has(b.id));
          }

          for (let i = 0; i < targetBills.length; i++) {
            if (remainingInr.lte(ZERO)) break;
            const bill = targetBills[i];
            const bal = this.computeBillSettlement(bill, allAllocs);
            if (bal.inrOutstanding.lte(ZERO)) continue;
            const toApply = remainingInr.lt(bal.inrOutstanding)
              ? remainingInr
              : bal.inrOutstanding;

            const alloc = await tx.createCustomerPaymentAllocation({
              id: newId("cpalloc"),
              organizationId: validActor.organizationId,
              customerId: customer.id,
              billId: bill.id,
              goldReceiptId: null,
              cashReceiptId: receipt.id,
              allocatedFineWeight: ZERO,
              allocatedRupees: toApply,
              status: "ACTIVE",
              businessDate,
              notes: input.notes?.trim() || null,
              idempotencyKey: `ccr_alloc_${input.idempotencyKey}_${i}`,
              createdById: validActor.userId,
              createdAt: now,
              undoneAt: null,
              undoneById: null,
              undoReason: null,
            });
            createdAllocations.push(alloc);
            allAllocs.push(alloc);
            remainingInr = roundRupees(remainingInr.sub(toApply));

            const updatedBal = this.computeBillSettlement(bill, allAllocs);
            await tx.updateCustomerBill({
              ...bill,
              settlementStatus: updatedBal.settlementStatus,
            });
          }
        }
      }

      const finalReceipt = await tx.updateCustomerCashReceipt({
        ...receipt,
        unallocatedRupees: remainingInr,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "CustomerCashReceipt",
        entityId: finalReceipt.id,
        action: "CUSTOMER_CASH_RECEIPT",
        summary: `Received ₹${amount.toFixed(2)} (${finalReceipt.paymentMode}) from ${customer.name}`,
        metadataJson: JSON.stringify({ receiptNumber }),
        createdAt: now,
      });

      return { receipt: finalReceipt, allocations: createdAllocations };
    });
  }

  public async allocateCustomerPayment(
    actor: ActorContext,
    input: {
      goldReceiptId?: string;
      cashReceiptId?: string;
      businessDate?: string | Date;
      notes?: string;
      allocations: Array<{ billId: string; amount: DecimalInput }>;
      idempotencyKey: string;
    }
  ): Promise<{ allocations: CustomerPaymentAllocationEntity[] }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const businessDate = parseBusinessDate(input.businessDate);
    if (!input.goldReceiptId && !input.cashReceiptId) {
      throw new ValidationError(
        "Either goldReceiptId or cashReceiptId is required"
      );
    }

    return this.repo.runInTransaction(async (tx) => {
      const now = new Date();
      const created: CustomerPaymentAllocationEntity[] = [];

      if (input.goldReceiptId) {
        const receipt = await tx.getCustomerGoldReceiptById(
          validActor.organizationId,
          input.goldReceiptId
        );
        if (!receipt) throw new NotFoundError("Gold receipt not found");
        if (receipt.status !== "POSTED") {
          throw new ConflictError("Cannot allocate a reversed receipt");
        }
        let remaining = receipt.unallocatedFineWeight;
        const allAllocs = await tx.listCustomerPaymentAllocations(
          validActor.organizationId,
          { customerId: receipt.customerId }
        );

        for (let i = 0; i < input.allocations.length; i++) {
          const item = input.allocations[i];
          const amt = roundInternal(item.amount);
          if (amt.lte(ZERO)) continue;
          const bill = await tx.getCustomerBillById(
            validActor.organizationId,
            item.billId
          );
          if (!bill) throw new NotFoundError(`Bill ${item.billId} not found`);
          if (bill.customerId !== receipt.customerId) {
            throw new ValidationError("Cross-customer allocation is forbidden");
          }
          if (bill.status !== "POSTED") {
            throw new ConflictError(`Bill ${bill.billNumber} is ${bill.status}`);
          }
          const bal = this.computeBillSettlement(bill, allAllocs);
          if (amt.gt(bal.fineOutstanding)) {
            throw new ValidationError("Allocation exceeds bill fine balance");
          }
          if (amt.gt(remaining)) {
            throw new ValidationError(
              "Allocation exceeds receipt unallocated fine credit"
            );
          }

          const key = `${input.idempotencyKey}_g_${i}`;
          const dup = await tx.getCustomerPaymentAllocationByIdempotencyKey(key);
          if (dup) {
            created.push(dup);
            continue;
          }

          const alloc = await tx.createCustomerPaymentAllocation({
            id: newId("cpalloc"),
            organizationId: validActor.organizationId,
            customerId: receipt.customerId,
            billId: bill.id,
            goldReceiptId: receipt.id,
            cashReceiptId: null,
            allocatedFineWeight: amt,
            allocatedRupees: ZERO,
            status: "ACTIVE",
            businessDate,
            notes: input.notes?.trim() || null,
            idempotencyKey: key,
            createdById: validActor.userId,
            createdAt: now,
            undoneAt: null,
            undoneById: null,
            undoReason: null,
          });
          created.push(alloc);
          allAllocs.push(alloc);
          remaining = roundInternal(remaining.sub(amt));
          const updatedBal = this.computeBillSettlement(bill, allAllocs);
          await tx.updateCustomerBill({
            ...bill,
            settlementStatus: updatedBal.settlementStatus,
          });
        }
        await tx.updateCustomerGoldReceipt({
          ...receipt,
          unallocatedFineWeight: remaining,
        });
      } else if (input.cashReceiptId) {
        const receipt = await tx.getCustomerCashReceiptById(
          validActor.organizationId,
          input.cashReceiptId
        );
        if (!receipt) throw new NotFoundError("Cash receipt not found");
        if (receipt.status !== "POSTED") {
          throw new ConflictError("Cannot allocate a reversed receipt");
        }
        let remaining = receipt.unallocatedRupees;
        const allAllocs = await tx.listCustomerPaymentAllocations(
          validActor.organizationId,
          { customerId: receipt.customerId }
        );

        for (let i = 0; i < input.allocations.length; i++) {
          const item = input.allocations[i];
          const amt = roundRupees(item.amount);
          if (amt.lte(ZERO)) continue;
          const bill = await tx.getCustomerBillById(
            validActor.organizationId,
            item.billId
          );
          if (!bill) throw new NotFoundError(`Bill ${item.billId} not found`);
          if (bill.customerId !== receipt.customerId) {
            throw new ValidationError("Cross-customer allocation is forbidden");
          }
          if (bill.status !== "POSTED") {
            throw new ConflictError(`Bill ${bill.billNumber} is ${bill.status}`);
          }
          const bal = this.computeBillSettlement(bill, allAllocs);
          if (amt.gt(bal.inrOutstanding)) {
            throw new ValidationError("Allocation exceeds bill INR balance");
          }
          if (amt.gt(remaining)) {
            throw new ValidationError(
              "Allocation exceeds receipt unallocated cash credit"
            );
          }

          const key = `${input.idempotencyKey}_c_${i}`;
          const dup = await tx.getCustomerPaymentAllocationByIdempotencyKey(key);
          if (dup) {
            created.push(dup);
            continue;
          }

          const alloc = await tx.createCustomerPaymentAllocation({
            id: newId("cpalloc"),
            organizationId: validActor.organizationId,
            customerId: receipt.customerId,
            billId: bill.id,
            goldReceiptId: null,
            cashReceiptId: receipt.id,
            allocatedFineWeight: ZERO,
            allocatedRupees: amt,
            status: "ACTIVE",
            businessDate,
            notes: input.notes?.trim() || null,
            idempotencyKey: key,
            createdById: validActor.userId,
            createdAt: now,
            undoneAt: null,
            undoneById: null,
            undoReason: null,
          });
          created.push(alloc);
          allAllocs.push(alloc);
          remaining = roundRupees(remaining.sub(amt));
          const updatedBal = this.computeBillSettlement(bill, allAllocs);
          await tx.updateCustomerBill({
            ...bill,
            settlementStatus: updatedBal.settlementStatus,
          });
        }
        await tx.updateCustomerCashReceipt({
          ...receipt,
          unallocatedRupees: remaining,
        });
      }

      return { allocations: created };
    });
  }

  public async cancelPostedBill(
    actor: ActorContext,
    input: {
      billId: string;
      reason: string;
    }
  ): Promise<{
    bill: CustomerBillEntity;
    releasedAllocations: number;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Cancellation reason is required");
    }

    return this.repo.runInTransaction(async (tx) => {
      const bill = await tx.getCustomerBillById(
        validActor.organizationId,
        input.billId
      );
      if (!bill) throw new NotFoundError(`Bill ${input.billId} not found`);
      if (bill.status !== "POSTED") {
        throw new ConflictError(
          `Only POSTED bills can be cancelled (current: ${bill.status})`
        );
      }

      const now = new Date();
      const creditNoteNumber = `CN-${bill.billNumber}`;

      // Release active allocations back to customer credit (preserve physical receipts!)
      const allocs = await tx.listCustomerPaymentAllocations(
        validActor.organizationId,
        { billId: bill.id }
      );
      let releasedCount = 0;
      for (const a of allocs) {
        if (a.status !== "ACTIVE") continue;
        await tx.updateCustomerPaymentAllocation({
          ...a,
          status: "RELEASED_ON_BILL_CANCEL",
          undoneAt: now,
          undoneById: validActor.userId,
          undoReason: `Bill ${bill.billNumber} cancelled: ${reason}`,
        });
        if (a.goldReceiptId && a.allocatedFineWeight.gt(ZERO)) {
          const gr = await tx.getCustomerGoldReceiptById(
            validActor.organizationId,
            a.goldReceiptId
          );
          if (gr) {
            await tx.updateCustomerGoldReceipt({
              ...gr,
              unallocatedFineWeight: roundInternal(
                gr.unallocatedFineWeight.add(a.allocatedFineWeight)
              ),
            });
          }
        }
        if (a.cashReceiptId && a.allocatedRupees.gt(ZERO)) {
          const cr = await tx.getCustomerCashReceiptById(
            validActor.organizationId,
            a.cashReceiptId
          );
          if (cr) {
            await tx.updateCustomerCashReceipt({
              ...cr,
              unallocatedRupees: roundRupees(
                cr.unallocatedRupees.add(a.allocatedRupees)
              ),
            });
          }
        }
        releasedCount++;
      }

      // Commercial reversal only: keep order.deliveryStatus = DELIVERED intact!
      const lines = await tx.listCustomerBillLines(bill.id);
      for (const line of lines) {
        if (line.orderId) {
          const ord = await tx.getOrderById(
            validActor.organizationId,
            line.orderId
          );
          if (ord && ord.activeBillId === bill.id) {
            await tx.updateOrder({
              ...ord,
              billingStatus: "REVERSED",
              activeBillId: null,
              updatedAt: now,
            });
          }
        }
      }

      const customer = (await tx.getCustomerById(
        validActor.organizationId,
        bill.customerId
      ))!;
      const tpl = bill.templateSnapshotJson
        ? (JSON.parse(bill.templateSnapshotJson) as ParsedBillTemplate)
        : getDefaultTemplateConfig();

      const updatedBill: CustomerBillEntity = {
        ...bill,
        status: "CANCELLED",
        cancelledAt: now,
        cancelledById: validActor.userId,
        cancellationReason: reason,
        creditNoteNumber,
        updatedAt: now,
      };
      updatedBill.previewHtml = renderBillSnapshotHtml({
        bill: updatedBill,
        appliedFineCredit: ZERO,
        appliedInrCredit: ZERO,
        customer,
        lines,
        template: tpl,
      });

      const saved = await tx.updateCustomerBill(updatedBill);

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "CustomerBill",
        entityId: saved.id,
        action: "BILL_CANCELLED_COMMERCIAL",
        summary: `Commercially cancelled Bill ${saved.billNumber} (${creditNoteNumber}); released ${releasedCount} allocations to customer credit; delivery history preserved`,
        metadataJson: JSON.stringify({ reason, creditNoteNumber }),
        createdAt: now,
      });

      return { bill: saved, releasedAllocations: releasedCount };
    });
  }

  public async editPostedBill(
    actor: ActorContext,
    input: {
      billId: string;
      billDate?: string | Date;
      notes?: string;
      templateId?: string;
      lines: Array<{
        lineType?: BillLineType;
        orderId?: string;
        description?: string;
        billingBasis?: BillingBasis;
        manualChargeableWeight?: DecimalInput;
        customNetWeight?: DecimalInput;
        customStoneWeight?: DecimalInput;
        customAdWeight?: DecimalInput;
        customGrossWeight?: DecimalInput;
        makingPercentagePoints?: DecimalInput;
        extraFineCharge?: DecimalInput;
        fineDiscount?: DecimalInput;
        makingChargesRupees?: DecimalInput;
        stoneChargeRupees?: DecimalInput;
        rupeeDiscount?: DecimalInput;
        adjustmentReason?: string;
      }>;
    }
  ): Promise<{
    bill: CustomerBillEntity;
    lines: CustomerBillLineEntity[];
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);

    return this.repo.runInTransaction(async (tx) => {
      const bill = await tx.getCustomerBillById(
        validActor.organizationId,
        input.billId
      );
      if (!bill) throw new NotFoundError(`Bill ${input.billId} not found`);
      if (bill.status !== "POSTED") {
        throw new ConflictError(
          `Only POSTED bills can be edited (current: ${bill.status})`
        );
      }

      await tx.lockCustomerForUpdate(validActor.organizationId, bill.customerId);

      const billDate = input.billDate
        ? parseBusinessDate(input.billDate)
        : bill.billDate;

      const built = await this.buildAndValidateBillLines(
        tx,
        validActor.organizationId,
        bill.customerId,
        bill.id,
        bill.billType,
        input.lines,
        bill.id
      );

      const allocs = await tx.listCustomerPaymentAllocations(
        validActor.organizationId,
        { billId: bill.id }
      );
      const activeAllocs = allocs.filter((a) => a.status === "ACTIVE");
      const activeFineAllocated = activeAllocs.reduce(
        (s, a) => roundInternal(s.add(a.allocatedFineWeight)),
        ZERO
      );
      const activeInrAllocated = activeAllocs.reduce(
        (s, a) => roundRupees(s.add(a.allocatedRupees)),
        ZERO
      );

      if (built.totalFineGold.lt(activeFineAllocated)) {
        throw new ConflictError(
          `Cannot reduce bill fine gold (${built.totalFineGold.toFixed(
            3
          )}g) below already-allocated payments (${activeFineAllocated.toFixed(
            3
          )}g). Undo excess payment allocation first.`
        );
      }
      if (built.totalCashRupees.lt(activeInrAllocated)) {
        throw new ConflictError(
          `Cannot reduce bill rupees (₹${built.totalCashRupees.toFixed(
            2
          )}) below already-allocated cash (₹${activeInrAllocated.toFixed(
            2
          )}). Undo excess cash allocation first.`
        );
      }

      const fineRem = roundInternal(built.totalFineGold.sub(activeFineAllocated));
      const inrRem = roundRupees(built.totalCashRupees.sub(activeInrAllocated));
      const settlementStatus: BillSettlementStatus =
        fineRem.lte(ZERO) && inrRem.lte(ZERO)
          ? "SETTLED"
          : activeFineAllocated.gt(ZERO) || activeInrAllocated.gt(ZERO)
          ? "PARTIALLY_SETTLED"
          : "UNPAID";

      const customer = (await tx.getCustomerById(
        validActor.organizationId,
        bill.customerId
      ))!;
      const templates = await tx.listBillTemplates(validActor.organizationId);
      const chosenTpl = input.templateId
        ? templates.find((t) => t.id === input.templateId)
        : templates.find((t) => t.isDefault) ?? templates[0];
      const parsedTpl = bill.templateSnapshotJson
        ? (JSON.parse(bill.templateSnapshotJson) as ParsedBillTemplate)
        : parseTemplateEntity(chosenTpl);

      const now = new Date();
      const updatedBill: CustomerBillEntity = {
        ...bill,
        billDate,
        notes: input.notes !== undefined ? input.notes.trim() || null : bill.notes,
        totalFineGold: built.totalFineGold,
        totalCashRupees: built.totalCashRupees,
        commercialMakingFine: built.commercialMakingFine,
        settlementStatus,
        closingFineDueSnapshot: roundInternal(
          (bill.historicalFineBalance ?? ZERO)
            .add(built.totalFineGold)
            .sub(activeFineAllocated)
        ),
        updatedAt: now,
      };
      updatedBill.previewHtml = renderBillSnapshotHtml({
        bill: updatedBill,
        appliedFineCredit: activeFineAllocated,
        appliedInrCredit: activeInrAllocated,
        customer,
        lines: built.lines,
        template: parsedTpl,
      });

      const savedBill = await tx.updateCustomerBill(updatedBill);
      const savedLines = await tx.replaceCustomerBillLines(
        savedBill.id,
        built.lines
      );

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "CustomerBill",
        entityId: savedBill.id,
        action: "BILL_EDITED",
        summary: `Edited Bill ${savedBill.billNumber}: totalFine=${savedBill.totalFineGold.toFixed(
          3
        )}g, totalRupees=₹${savedBill.totalCashRupees.toFixed(2)}`,
        metadataJson: null,
        createdAt: now,
      });

      return { bill: savedBill, lines: savedLines };
    });
  }

  public async undoCustomerPaymentAllocation(
    actor: ActorContext,
    input: { allocationId: string; reason: string }
  ): Promise<CustomerPaymentAllocationEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim() || "Undone by Admin";

    return this.repo.runInTransaction(async (tx) => {
      const alloc = await tx.getCustomerPaymentAllocationById(
        validActor.organizationId,
        input.allocationId
      );
      if (!alloc) throw new NotFoundError("Allocation not found");
      if (alloc.status !== "ACTIVE") {
        throw new ConflictError(`Allocation is already ${alloc.status}`);
      }

      const now = new Date();
      const updated = await tx.updateCustomerPaymentAllocation({
        ...alloc,
        status: "UNDONE",
        undoneAt: now,
        undoneById: validActor.userId,
        undoReason: reason,
      });

      if (alloc.goldReceiptId && alloc.allocatedFineWeight.gt(ZERO)) {
        const gr = await tx.getCustomerGoldReceiptById(
          validActor.organizationId,
          alloc.goldReceiptId
        );
        if (gr) {
          await tx.updateCustomerGoldReceipt({
            ...gr,
            unallocatedFineWeight: roundInternal(
              gr.unallocatedFineWeight.add(alloc.allocatedFineWeight)
            ),
          });
        }
      }
      if (alloc.cashReceiptId && alloc.allocatedRupees.gt(ZERO)) {
        const cr = await tx.getCustomerCashReceiptById(
          validActor.organizationId,
          alloc.cashReceiptId
        );
        if (cr) {
          await tx.updateCustomerCashReceipt({
            ...cr,
            unallocatedRupees: roundRupees(
              cr.unallocatedRupees.add(alloc.allocatedRupees)
            ),
          });
        }
      }

      const bill = await tx.getCustomerBillById(
        validActor.organizationId,
        alloc.billId
      );
      if (bill) {
        const allAllocs = await tx.listCustomerPaymentAllocations(
          validActor.organizationId,
          { billId: bill.id }
        );
        const bal = this.computeBillSettlement(bill, allAllocs);
        await tx.updateCustomerBill({
          ...bill,
          settlementStatus: bal.settlementStatus,
        });
      }

      return updated;
    });
  }

  public async reverseCustomerGoldReceipt(
    actor: ActorContext,
    input: { receiptId: string; reason: string; idempotencyKey: string }
  ): Promise<CustomerGoldReceiptEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) throw new ValidationError("Reversal reason is required");

    return this.repo.runInTransaction(async (tx) => {
      const receipt = await tx.getCustomerGoldReceiptById(
        validActor.organizationId,
        input.receiptId
      );
      if (!receipt) throw new NotFoundError("Customer gold receipt not found");
      if (receipt.status === "REVERSED") {
        throw new ConflictError("Receipt is already reversed");
      }

      if ((receipt.refundedFineWeight ?? ZERO).gt(ZERO)) {
        throw new ConflictError(
          `Receipt ${receipt.receiptNumber} has ${receipt.refundedFineWeight!.toFixed(
            4
          )}g of refunded advance credit and cannot be reversed directly.`
        );
      }

      const allocs = await tx.listCustomerPaymentAllocations(
        validActor.organizationId,
        { goldReceiptId: receipt.id }
      );
      if (allocs.some((a) => a.status === "ACTIVE")) {
        throw new ConflictError(
          "Receipt has active bill allocations. Undo allocations first before reversing the receipt."
        );
      }

      const lines = await tx.listCustomerGoldReceiptLines(
        validActor.organizationId,
        receipt.id
      );
      const businessDate = parseBusinessDate(undefined);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const purity = (await tx.getPurityById(
          validActor.organizationId,
          line.purityId
        ))!;
        const adminAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `ADMIN_POOL_${purity.code}`,
          `Admin Stock Pool - ${purity.displayLabel}`,
          "ADMIN_KARAT_POOL",
          purity.id,
          null
        );
        if (adminAcct.cachedFineBalance.lt(line.fineWeight)) {
          throw new ConflictError(
            `Cannot reverse receipt ${receipt.receiptNumber}: Admin Fine Stock in ${purity.displayLabel} (${adminAcct.cachedFineBalance.toFixed(
              4
            )}g fine) is less than ${line.fineWeight.toFixed(4)}g fine`
          );
        }
        if (
          line.grossWeight.gt(ZERO) &&
          adminAcct.cachedPhysicalBalance.lt(line.grossWeight)
        ) {
          throw new ConflictError(
            `Cannot reverse receipt ${receipt.receiptNumber}: Admin Stock in ${purity.displayLabel} (${adminAcct.cachedPhysicalBalance.toFixed(
              3
            )}g) is less than ${line.grossWeight.toFixed(3)}g`
          );
        }
        const inflowAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `CUSTOMER_GOLD_INFLOW_${purity.code}`,
          `Customer Gold Collection Inflow - ${purity.displayLabel}`,
          "EXTERNAL_SUPPLIER_INFLOW",
          purity.id,
          null
        );

        await this.postBalancedJournalEntry(tx, {
          organizationId: validActor.organizationId,
          actorId: validActor.userId,
          transactionType: "CUSTOMER_GOLD_RECEIPT_REVERSAL",
          businessDate,
          purity,
          physicalWeight: line.grossWeight,
          fineEquivalentWeight: line.fineWeight,
          sourceAccount: adminAcct,
          destinationAccount: inflowAcct,
          sourceReference: `REV-${receipt.receiptNumber}`,
          reason: `Reversal of ${receipt.receiptNumber}: ${reason}`,
          idempotencyKey: `cgr_rev_${input.idempotencyKey}_${i}`,
        });
        if (line.journalTransactionId) {
          await tx.markJournalTransactionReversed(line.journalTransactionId);
        }
      }

      return tx.updateCustomerGoldReceipt({
        ...receipt,
        status: "REVERSED",
        unallocatedFineWeight: ZERO,
        reversedAt: new Date(),
        reversedById: validActor.userId,
        reversalReason: reason,
      });
    });
  }

  public async getBillingWorkspace(
    actor: ActorContext,
    filters?: { customerId?: string }
  ) {
    const validActor = this.assertAuthenticated(actor);

    return this.repo.runInTransaction(async (tx) => {
      const [
        customers,
        orders,
        purities,
        bills,
        allLines,
        allocs,
        goldReceipts,
        goldReceiptLines,
        cashReceipts,
        templates,
        fineConv,
      ] = await Promise.all([
        tx.listCustomers(validActor.organizationId),
        tx.listOrders(validActor.organizationId),
        tx.listPurities(validActor.organizationId),
        tx.listCustomerBills(validActor.organizationId, filters?.customerId),
        tx.listAllCustomerBillLinesForOrg(validActor.organizationId),
        tx.listCustomerPaymentAllocations(validActor.organizationId, {
          customerId: filters?.customerId,
        }),
        tx.listCustomerGoldReceipts(
          validActor.organizationId,
          filters?.customerId
        ),
        tx.listCustomerGoldReceiptLines(validActor.organizationId),
        tx.listCustomerCashReceipts(
          validActor.organizationId,
          filters?.customerId
        ),
        tx.listBillTemplates(validActor.organizationId),
        this.resolveFineAccountAndConvention(tx, validActor.organizationId),
      ]);

      const purityMap = new Map(purities.map((p) => [p.id, p]));
      const customerMap = new Map(customers.map((c) => [c.id, c]));

      const customerSummaries = await Promise.all(
        customers.map(async (c) => {
          const bal = await this.computeCustomerBalances(
            tx,
            validActor.organizationId,
            c.id
          );
          return {
            customerId: c.id,
            customerCode: c.customerCode,
            name: c.name,
            phone: c.phone,
            fineOwed: bal.fineOwed.toFixed(4),
            fineAdvance: bal.fineAdvance.toFixed(4),
            totalGoldReceivedHistorical:
              bal.totalGoldReceivedHistorical.toFixed(4),
            inrOwed: bal.inrOwed.toFixed(2),
            inrAdvance: bal.inrAdvance.toFixed(2),
          };
        })
      );

      const orderRows = orders
        .filter(
          (o) => !filters?.customerId || o.customerId === filters.customerId
        )
        .map((o) => {
          const purity = purityMap.get(o.purityId);
          const customer = customerMap.get(o.customerId);
          let eligibility: "ELIGIBLE" | "INELIGIBLE" = "ELIGIBLE";
          let reason = "Ready to bill";

          if (
            o.status === "CANCELLED" ||
            o.status === "CANCELLATION_PENDING_RECONCILIATION"
          ) {
            eligibility = "INELIGIBLE";
            reason = `Order is ${o.status}`;
          } else if (o.status !== "COMPLETED") {
            eligibility = "INELIGIBLE";
            reason = `Incomplete (${o.status})`;
          } else if (
            o.billingStatus === "BILLED" ||
            (o.deliveryStatus === "DELIVERED" && o.billingStatus !== "REVERSED")
          ) {
            eligibility = "INELIGIBLE";
            reason = "Already billed & delivered";
          } else if (o.billingStatus === "REVERSED") {
            reason = "Ready to re-bill (cancelled bill)";
          } else if (
            o.finishedNetMetalWeight === null ||
            o.finishedGrossWeight === null
          ) {
            eligibility = "INELIGIBLE";
            reason = "Unresolved material reconciliation";
          }

          return {
            id: o.id,
            bagNumber: o.bagNumber,
            orderName: o.orderName,
            photoUrl: o.photoUrl,
            customerId: o.customerId,
            customerName: customer?.name || "",
            purityId: o.purityId,
            purityLabel: purity?.displayLabel || "",
            touchPercent: o.touchSnapshot.toFixed(2),
            status: o.status,
            billingStatus: o.billingStatus,
            deliveryStatus: o.deliveryStatus,
            completedAt: o.completedAt ? o.completedAt.toISOString() : null,
            grossWeight: (o.finishedGrossWeight ?? ZERO).toFixed(3),
            stoneWeight: (o.finishedStoneWeight ?? ZERO).toFixed(3),
            netWeight: (o.finishedNetMetalWeight ?? ZERO).toFixed(3),
            eligibility,
            ineligibleReason: reason,
          };
        });

      const enrichedBills = bills.map((b) => {
        const lines = allLines.filter((l) => l.customerBillId === b.id);
        const bal = this.computeBillSettlement(b, allocs);
        const cust = customerMap.get(b.customerId);
        return {
          id: b.id,
          billNumber: b.billNumber,
          billDate: b.billDate.toISOString().slice(0, 10),
          billType: b.billType,
          status: b.status,
          deliveryStatus: b.deliveryStatus,
          settlementStatus: b.settlementStatus,
          customerId: b.customerId,
          customerName: cust?.name || "",
          totalFineGold: b.totalFineGold.toFixed(4),
          totalCashRupees: b.totalCashRupees.toFixed(2),
          deliveredFineMetal: b.deliveredFineMetal.toFixed(4),
          commercialMakingFine: b.commercialMakingFine.toFixed(4),
          finePaid: bal.finePaid.toFixed(4),
          fineOutstanding: bal.fineOutstanding.toFixed(4),
          inrPaid: bal.inrPaid.toFixed(2),
          inrOutstanding: bal.inrOutstanding.toFixed(2),
          historicalFineBalance: b.historicalFineBalance.toFixed(4),
          historicalInrBalance: b.historicalInrBalance.toFixed(2),
          previousAdvanceFineSnapshot: (
            b.previousAdvanceFineSnapshot ?? ZERO
          ).toFixed(4),
          appliedAdvanceFineSnapshot: (
            b.appliedAdvanceFineSnapshot ?? ZERO
          ).toFixed(4),
          newReceiptFineSnapshot: (b.newReceiptFineSnapshot ?? ZERO).toFixed(4),
          closingFineDueSnapshot: (b.closingFineDueSnapshot ?? ZERO).toFixed(4),
          remainingAdvanceFineSnapshot: (
            b.remainingAdvanceFineSnapshot ?? ZERO
          ).toFixed(4),
          creditNoteNumber: b.creditNoteNumber,
          cancellationReason: b.cancellationReason,
          previewHtml: b.previewHtml,
          notes: b.notes,
          lines: lines.map((l) => ({
            id: l.id,
            lineType: l.lineType,
            orderId: l.orderId,
            bagNumberSnapshot: l.bagNumberSnapshot,
            orderNameSnapshot: l.orderNameSnapshot,
            description: l.description,
            grossWeight: l.grossWeight.toFixed(3),
            stoneWeight: l.stoneWeight.toFixed(3),
            adKlWeight: l.adKlWeight.toFixed(3),
            netWeight: l.netWeight.toFixed(3),
            touchSnapshot: l.touchSnapshot.toFixed(2),
            chargeableWeight: l.chargeableWeight.toFixed(3),
            billingBasis: l.billingBasis,
            makingPercentagePoints: l.makingPercentagePoints.toFixed(2),
            metalChargeFine: l.metalChargeFine.toFixed(4),
            makingChargeFine: l.makingChargeFine.toFixed(4),
            extraFineCharge: l.extraFineCharge.toFixed(4),
            fineDiscount: l.fineDiscount.toFixed(4),
            fineGold: l.fineGold.toFixed(4),
            makingCharges: l.makingCharges.toFixed(2),
            stoneChargeRupees: l.stoneChargeRupees.toFixed(2),
            rupeeDiscount: l.rupeeDiscount.toFixed(2),
            adjustmentReason: l.adjustmentReason,
          })),
        };
      });

      const enrichedGoldReceipts = goldReceipts.map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        customerId: r.customerId,
        customerName: customerMap.get(r.customerId)?.name || "",
        businessDate: r.businessDate.toISOString().slice(0, 10),
        totalGrossWeight: r.totalGrossWeight.toFixed(3),
        totalFineWeight: r.totalFineWeight.toFixed(4),
        unallocatedFineWeight: r.unallocatedFineWeight.toFixed(4),
        refundedFineWeight: (r.refundedFineWeight ?? ZERO).toFixed(4),
        inputModeSnapshot: r.inputModeSnapshot ?? "FINE_EQUIVALENT",
        physicalWeightProvided: r.physicalWeightProvided ?? true,
        status: r.status,
        referenceNumber: r.referenceNumber,
        notes: r.notes,
        lines: goldReceiptLines
          .filter((l) => l.receiptId === r.id)
          .map((l) => ({
            id: l.id,
            purityLabel: purityMap.get(l.purityId)?.displayLabel || "",
            grossWeight: l.grossWeight.toFixed(3),
            touchPercent: l.touchPercent.toFixed(2),
            fineWeight: l.fineWeight.toFixed(4),
          })),
      }));

      const enrichedCashReceipts = cashReceipts.map((r) => ({
        id: r.id,
        receiptNumber: r.receiptNumber,
        customerId: r.customerId,
        customerName: customerMap.get(r.customerId)?.name || "",
        businessDate: r.businessDate.toISOString().slice(0, 10),
        amountRupees: r.amountRupees.toFixed(2),
        unallocatedRupees: r.unallocatedRupees.toFixed(2),
        paymentMode: r.paymentMode,
        status: r.status,
        referenceNumber: r.referenceNumber,
        notes: r.notes,
      }));

      return {
        fineReceiptConvention: {
          mode: fineConv.mode,
          configuredTouch: fineConv.configuredTouch
            ? fineConv.configuredTouch.toFixed(4)
            : null,
          finePurityId: fineConv.finePurity.id,
          finePurityCode: fineConv.finePurity.code,
          finePurityLabel: fineConv.finePurity.displayLabel,
          destinationAccountCode: `ADMIN_POOL_${fineConv.finePurity.code}`,
          destinationAccountName: `Admin Stock Pool - ${fineConv.finePurity.displayLabel}`,
        },
        customerSummaries,
        orders: orderRows,
        bills: enrichedBills,
        goldReceipts: enrichedGoldReceipts,
        cashReceipts: enrichedCashReceipts,
        allocations: allocs.map((a) => ({
          id: a.id,
          customerId: a.customerId,
          billId: a.billId,
          goldReceiptId: a.goldReceiptId,
          cashReceiptId: a.cashReceiptId,
          allocatedFineWeight: a.allocatedFineWeight.toFixed(4),
          allocatedRupees: a.allocatedRupees.toFixed(2),
          status: a.status,
          businessDate: a.businessDate.toISOString().slice(0, 10),
          notes: a.notes,
        })),
        templates: templates.map((t) => parseTemplateEntity(t)),
        purities: purities.map((p) => ({
          id: p.id,
          code: p.code,
          displayLabel: p.displayLabel,
          touchPercent: p.touchPercent.toFixed(4),
        })),
      };
    });
  }

  public async getCustomerProfileWorkspace(
    actor: ActorContext,
    customerId: string,
    options?: {
      orderTab?: "ALL" | "ONGOING" | "COMPLETED" | "DELIVERED" | "CANCELLED";
      monthFilter?: string; // e.g. "2026-11"
    }
  ) {
    const validActor = this.assertAuthenticated(actor);

    return this.repo.runInTransaction(async (tx) => {
      const customer = await tx.getCustomerById(
        validActor.organizationId,
        customerId
      );
      if (!customer) {
        throw new NotFoundError(`Customer ${customerId} not found`);
      }

      const [
        fineConv,
        balances,
        allOrders,
        purities,
        bills,
        allBillLines,
        allocs,
        goldReceipts,
        goldReceiptLines,
        cashReceipts,
        journalTxs,
      ] = await Promise.all([
        this.resolveFineAccountAndConvention(tx, validActor.organizationId),
        this.computeCustomerBalances(tx, validActor.organizationId, customerId),
        tx.listOrders(validActor.organizationId),
        tx.listPurities(validActor.organizationId),
        tx.listCustomerBills(validActor.organizationId, customerId),
        tx.listAllCustomerBillLinesForOrg(validActor.organizationId),
        tx.listCustomerPaymentAllocations(validActor.organizationId, {
          customerId,
        }),
        tx.listCustomerGoldReceipts(validActor.organizationId, customerId),
        tx.listCustomerGoldReceiptLines(validActor.organizationId),
        tx.listCustomerCashReceipts(validActor.organizationId, customerId),
        tx.listJournalTransactions(validActor.organizationId),
      ]);

      const purityMap = new Map(purities.map((p) => [p.id, p]));
      const billMap = new Map(bills.map((b) => [b.id, b]));
      const goldReceiptMap = new Map(goldReceipts.map((r) => [r.id, r]));

      const customerOrders = allOrders
        .filter((o) => o.customerId === customerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const orderTab = options?.orderTab ?? "ALL";
      const filteredOrders = customerOrders.filter((o) => {
        if (orderTab === "ALL") return true;
        if (orderTab === "CANCELLED") {
          return (
            o.status === "CANCELLED" ||
            o.status === "CANCELLATION_PENDING_RECONCILIATION"
          );
        }
        if (orderTab === "DELIVERED") {
          return o.deliveryStatus === "DELIVERED";
        }
        if (orderTab === "COMPLETED") {
          return (
            o.status === "COMPLETED" && o.deliveryStatus !== "DELIVERED"
          );
        }
        if (orderTab === "ONGOING") {
          return (
            o.status !== "COMPLETED" &&
            o.status !== "CANCELLED" &&
            o.status !== "CANCELLATION_PENDING_RECONCILIATION" &&
            o.deliveryStatus !== "DELIVERED"
          );
        }
        return true;
      });

      const orderRows = filteredOrders.map((o) => {
        const purity = purityMap.get(o.purityId);
        const linkedBill = o.activeBillId
          ? billMap.get(o.activeBillId)
          : undefined;
        let displayTabStatus:
          | "ONGOING"
          | "COMPLETED"
          | "DELIVERED"
          | "CANCELLED" = "ONGOING";
        if (
          o.status === "CANCELLED" ||
          o.status === "CANCELLATION_PENDING_RECONCILIATION"
        ) {
          displayTabStatus = "CANCELLED";
        } else if (o.deliveryStatus === "DELIVERED") {
          displayTabStatus = "DELIVERED";
        } else if (o.status === "COMPLETED") {
          displayTabStatus = "COMPLETED";
        }

        return {
          id: o.id,
          bagNumber: o.bagNumber,
          orderName: o.orderName,
          date: o.orderDate.toISOString().slice(0, 10),
          status: o.status,
          displayTabStatus,
          billingStatus: o.billingStatus,
          deliveryStatus: o.deliveryStatus,
          purityLabel: purity?.displayLabel || "",
          touchPercent: o.touchSnapshot.toFixed(2),
          grossWeight: (o.finishedGrossWeight ?? ZERO).toFixed(3),
          netWeight: (o.finishedNetMetalWeight ?? ZERO).toFixed(3),
          billId: linkedBill?.id ?? null,
          billNumber: linkedBill?.billNumber ?? null,
          billLink: linkedBill
            ? `/billing?customerId=${customer.id}&billId=${linkedBill.id}`
            : null,
          viewLink: `/orders?bagNumber=${encodeURIComponent(o.bagNumber)}`,
        };
      });

      const sortedBills = [...bills].sort(
        (a, b) =>
          b.billDate.getTime() - a.billDate.getTime() ||
          b.createdAt.getTime() - a.createdAt.getTime()
      );

      const billRows = sortedBills.map((b) => {
        const bal = this.computeBillSettlement(b, allocs);
        const lines = allBillLines.filter((l) => l.customerBillId === b.id);
        return {
          id: b.id,
          billNumber: b.billNumber,
          date: b.billDate.toISOString().slice(0, 10),
          originalFineCharge: b.totalFineGold.toFixed(4),
          settledFine: bal.finePaid.toFixed(4),
          remainingFine: bal.fineOutstanding.toFixed(4),
          totalCashRupees: b.totalCashRupees.toFixed(2),
          settledInr: bal.inrPaid.toFixed(2),
          remainingInr: bal.inrOutstanding.toFixed(2),
          status:
            b.status === "CANCELLED" ? "CANCELLED" : bal.settlementStatus,
          documentStatus: b.status,
          settlementStatus: bal.settlementStatus,
          previewHtml: b.previewHtml,
          issuedSnapshot: {
            previousOutstandingFine: b.historicalFineBalance.toFixed(4),
            previousAdvanceFine: (
              b.previousAdvanceFineSnapshot ?? ZERO
            ).toFixed(4),
            newBillChargeFine: b.totalFineGold.toFixed(4),
            advanceAppliedFine: (
              b.appliedAdvanceFineSnapshot ?? ZERO
            ).toFixed(4),
            newReceiptAppliedFine: (
              b.newReceiptFineSnapshot ?? ZERO
            ).toFixed(4),
            totalOutstandingAfterIssuanceFine: (
              b.closingFineDueSnapshot ?? ZERO
            ).toFixed(4),
            remainingAdvanceAfterIssuanceFine: (
              b.remainingAdvanceFineSnapshot ?? ZERO
            ).toFixed(4),
          },
          livePaymentStatus: {
            originalFineCharge: b.totalFineGold.toFixed(4),
            liveSettledFine: bal.finePaid.toFixed(4),
            liveRemainingFine: bal.fineOutstanding.toFixed(4),
            liveSettlementStatus:
              b.status === "CANCELLED" ? "CANCELLED" : bal.settlementStatus,
          },
          linesCount: lines.length,
        };
      });

      // Build Customer Statement (Section 10)
      // Columns: Date | Reference | Gold charged | Gold received/credit | Allocation/adjustment | Running balance
      // Keep actual receipts distinguishable from allocation-only events.
      // Avoid adding allocated amounts to received totals a second time!
      type RawStatementEvent = {
        id: string;
        timestamp: number;
        date: string;
        eventType:
          | "NEW_BILL"
          | "BILL_CANCELLED"
          | "GOLD_RECEIPT"
          | "RECEIPT_REVERSED"
          | "ADVANCE_REFUND"
          | "BILL_ALLOCATION"
          | "ALLOCATION_UNDONE";
        reference: string;
        description: string;
        goldCharged: Decimal; // increases net due
        goldReceivedCredit: Decimal; // decreases net due (or negative when reversed/refunded)
        allocationAdjustmentText: string; // informational for allocation-only events
        netDeltaOnDue: Decimal; // +goldCharged - goldReceivedCredit (0 for allocation-only events!)
        isAllocationOnly: boolean;
      };

      const rawEvents: RawStatementEvent[] = [];

      for (const b of bills) {
        const bDate = b.billDate.toISOString().slice(0, 10);
        rawEvents.push({
          id: `stmt_bill_${b.id}`,
          timestamp: b.billDate.getTime() + 100,
          date: bDate,
          eventType: "NEW_BILL",
          reference: b.billNumber,
          description: `New Bill Issued (${b.billNumber})`,
          goldCharged: b.totalFineGold,
          goldReceivedCredit: ZERO,
          allocationAdjustmentText: "—",
          netDeltaOnDue: b.totalFineGold,
          isAllocationOnly: false,
        });
        if (b.status === "CANCELLED") {
          const cDate = (b.cancelledAt ?? b.updatedAt)
            .toISOString()
            .slice(0, 10);
          rawEvents.push({
            id: `stmt_bill_cancel_${b.id}`,
            timestamp: (b.cancelledAt ?? b.updatedAt).getTime() + 150,
            date: cDate,
            eventType: "BILL_CANCELLED",
            reference: b.creditNoteNumber || `CN-${b.billNumber}`,
            description: `Bill Cancelled (${b.billNumber}): ${
              b.cancellationReason || "Reversed"
            }`,
            goldCharged: ZERO,
            goldReceivedCredit: b.totalFineGold,
            allocationAdjustmentText: `Credit note reversal of ${b.billNumber}`,
            netDeltaOnDue: b.totalFineGold.neg(),
            isAllocationOnly: false,
          });
        }
      }

      for (const r of goldReceipts) {
        const rDate = r.businessDate.toISOString().slice(0, 10);
        const modeDesc =
          r.inputModeSnapshot === "PHYSICAL_AT_CONFIGURED_TOUCH"
            ? `${r.totalGrossWeight.toFixed(3)}g physical`
            : r.physicalWeightProvided && r.totalGrossWeight.gt(ZERO)
            ? `${r.totalFineWeight.toFixed(
                4
              )}g fine (${r.totalGrossWeight.toFixed(3)}g physical)`
            : `${r.totalFineWeight.toFixed(4)}g fine`;
        rawEvents.push({
          id: `stmt_rcp_${r.id}`,
          timestamp: r.businessDate.getTime() + 200,
          date: rDate,
          eventType: "GOLD_RECEIPT",
          reference: r.receiptNumber,
          description: `Actual Gold Receipt (${modeDesc})${
            r.referenceNumber ? ` [Ref: ${r.referenceNumber}]` : ""
          }`,
          goldCharged: ZERO,
          goldReceivedCredit: r.totalFineWeight,
          allocationAdjustmentText: "Actual metal receipt",
          netDeltaOnDue: r.totalFineWeight.neg(),
          isAllocationOnly: false,
        });
        if (r.status === "REVERSED") {
          const revDate = (r.reversedAt ?? r.createdAt)
            .toISOString()
            .slice(0, 10);
          rawEvents.push({
            id: `stmt_rcp_rev_${r.id}`,
            timestamp: (r.reversedAt ?? r.createdAt).getTime() + 250,
            date: revDate,
            eventType: "RECEIPT_REVERSED",
            reference: `REV-${r.receiptNumber}`,
            description: `Receipt Reversal (${r.receiptNumber}): ${
              r.reversalReason || "Mistaken entry"
            }`,
            goldCharged: r.totalFineWeight,
            goldReceivedCredit: ZERO,
            allocationAdjustmentText: `Reversal of ${r.receiptNumber}`,
            netDeltaOnDue: r.totalFineWeight,
            isAllocationOnly: false,
          });
        }
      }

      // Refund events from journal transactions
      const customerRefundTxs = journalTxs.filter(
        (j) =>
          j.transactionType === "CUSTOMER_GOLD_REFUND" &&
          (j.sourceReference ?? "").startsWith(`REFUND|${customer.id}|`)
      );
      if (customerRefundTxs.length > 0) {
        const allJournalLines = await tx.listJournalLines(
          validActor.organizationId
        );
        for (const jtx of customerRefundTxs) {
          const outEntry = allJournalLines.find(
            (e) =>
              e.journalTransactionId === jtx.id && e.direction === "CREDIT_OUT"
          );
          const refundFine = outEntry ? outEntry.signedFineDelta.abs() : ZERO;
          const refStr = jtx.sourceReference ?? "";
          const refundNumber = refStr.split("|")[2] || refStr || "CRF";
          const refDate = jtx.businessDate.toISOString().slice(0, 10);
          rawEvents.push({
            id: `stmt_refund_${jtx.id}`,
            timestamp: jtx.businessDate.getTime() + 300,
            date: refDate,
            eventType: "ADVANCE_REFUND",
            reference: refundNumber,
            description: `Outbound Gold Refund (${jtx.reason})`,
            goldCharged: refundFine,
            goldReceivedCredit: ZERO,
            allocationAdjustmentText: `Advance refunded (-${refundFine.toFixed(
              4
            )}g credit)`,
            netDeltaOnDue: refundFine,
            isAllocationOnly: false,
          });
        }
      }

      // Allocation-only events (distinguishable from actual receipts; do NOT double-add to received totals!)
      for (const a of allocs) {
        if (a.allocatedFineWeight.lte(ZERO)) continue;
        const bill = billMap.get(a.billId);
        const rcp = a.goldReceiptId
          ? goldReceiptMap.get(a.goldReceiptId)
          : undefined;
        const aDate = a.businessDate.toISOString().slice(0, 10);
        rawEvents.push({
          id: `stmt_alloc_${a.id}`,
          timestamp: a.businessDate.getTime() + 400,
          date: aDate,
          eventType: "BILL_ALLOCATION",
          reference: `${rcp?.receiptNumber || "ADV"} → ${
            bill?.billNumber || a.billId
          }`,
          description: `Allocation to Bill ${bill?.billNumber || ""}${
            a.notes ? ` (${a.notes})` : ""
          }`,
          goldCharged: ZERO,
          goldReceivedCredit: ZERO,
          allocationAdjustmentText: `Applied ${a.allocatedFineWeight.toFixed(
            4
          )}g fine to ${bill?.billNumber || "Bill"} (Allocation only)`,
          netDeltaOnDue: ZERO,
          isAllocationOnly: true,
        });

        if (a.status === "UNDONE" || a.status === "RELEASED_ON_BILL_CANCEL") {
          const uDate = (a.undoneAt ?? a.createdAt).toISOString().slice(0, 10);
          rawEvents.push({
            id: `stmt_alloc_undo_${a.id}`,
            timestamp: (a.undoneAt ?? a.createdAt).getTime() + 450,
            date: uDate,
            eventType: "ALLOCATION_UNDONE",
            reference: `UNDO ${rcp?.receiptNumber || "ADV"} ↛ ${
              bill?.billNumber || a.billId
            }`,
            description: `Allocation Released (${
              a.undoReason || a.status
            })`,
            goldCharged: ZERO,
            goldReceivedCredit: ZERO,
            allocationAdjustmentText: `Restored ${a.allocatedFineWeight.toFixed(
              4
            )}g fine to available credit`,
            netDeltaOnDue: ZERO,
            isAllocationOnly: true,
          });
        }
      }

      rawEvents.sort(
        (a, b) => a.date.localeCompare(b.date) || a.timestamp - b.timestamp
      );

      const monthFilter = options?.monthFilter?.trim() || "";
      let openingNetDue = ZERO; // > 0 means customer owes; < 0 means customer has advance credit
      let periodChargedTotal = ZERO;
      let periodReceivedTotal = ZERO;

      const statementRows: Array<{
        id: string;
        date: string;
        eventType: string;
        reference: string;
        description: string;
        goldCharged: string;
        goldReceivedCredit: string;
        allocationAdjustment: string;
        runningGoldDue: string;
        runningAdvanceAvailable: string;
        runningBalanceLabel: string;
        isAllocationOnly: boolean;
      }> = [];

      let runningNetDue = ZERO;

      for (const ev of rawEvents) {
        if (monthFilter && ev.date < `${monthFilter}-01`) {
          openingNetDue = roundInternal(openingNetDue.add(ev.netDeltaOnDue));
          runningNetDue = openingNetDue;
          continue;
        }
        if (monthFilter && !ev.date.startsWith(monthFilter)) {
          continue;
        }

        runningNetDue = roundInternal(runningNetDue.add(ev.netDeltaOnDue));
        if (!ev.isAllocationOnly) {
          periodChargedTotal = roundInternal(
            periodChargedTotal.add(ev.goldCharged)
          );
          if (ev.eventType === "GOLD_RECEIPT") {
            periodReceivedTotal = roundInternal(
              periodReceivedTotal.add(ev.goldReceivedCredit)
            );
          } else if (ev.eventType === "RECEIPT_REVERSED") {
            periodReceivedTotal = roundInternal(
              Decimal.max(ZERO, periodReceivedTotal.sub(ev.goldCharged))
            );
          }
        }

        const rowDue = runningNetDue.gt(ZERO) ? runningNetDue : ZERO;
        const rowAdv = runningNetDue.lt(ZERO) ? runningNetDue.abs() : ZERO;
        const runningLabel = rowDue.gt(ZERO)
          ? `${rowDue.toFixed(4)}g Due`
          : rowAdv.gt(ZERO)
          ? `${rowAdv.toFixed(4)}g Advance`
          : `0.0000g Settled`;

        statementRows.push({
          id: ev.id,
          date: ev.date,
          eventType: ev.eventType,
          reference: ev.reference,
          description: ev.description,
          goldCharged: ev.goldCharged.gt(ZERO)
            ? ev.goldCharged.toFixed(4)
            : "—",
          goldReceivedCredit: ev.goldReceivedCredit.gt(ZERO)
            ? ev.goldReceivedCredit.toFixed(4)
            : "—",
          allocationAdjustment: ev.allocationAdjustmentText,
          runningGoldDue: rowDue.toFixed(4),
          runningAdvanceAvailable: rowAdv.toFixed(4),
          runningBalanceLabel: runningLabel,
          isAllocationOnly: ev.isAllocationOnly,
        });
      }

      const openingDue = openingNetDue.gt(ZERO) ? openingNetDue : ZERO;
      const openingAdvance = openingNetDue.lt(ZERO)
        ? openingNetDue.abs()
        : ZERO;

      const closingDue = runningNetDue.gt(ZERO)
        ? runningNetDue
        : monthFilter
        ? ZERO
        : balances.fineOwed;
      const closingAdvance = runningNetDue.lt(ZERO)
        ? runningNetDue.abs()
        : monthFilter
        ? ZERO
        : balances.fineAdvance;

      return {
        customer: {
          id: customer.id,
          customerCode: customer.customerCode,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          gstNumber: customer.gstNumber,
          notes: customer.notes,
        },
        summaryCards: {
          goldDue: balances.fineOwed.toFixed(4),
          advanceAvailable: balances.fineAdvance.toFixed(4),
          totalGoldReceivedHistorical:
            balances.totalGoldReceivedHistorical.toFixed(4),
          grossGoldReceivedHistorical:
            balances.grossFineReceivedHistorical.toFixed(4),
          totalFineRefunded: balances.totalFineRefunded.toFixed(4),
          inrDue: balances.inrOwed.toFixed(2),
          inrAdvance: balances.inrAdvance.toFixed(2),
        },
        fineReceiptConvention: {
          mode: fineConv.mode,
          configuredTouch: fineConv.configuredTouch
            ? fineConv.configuredTouch.toFixed(4)
            : null,
          finePurityId: fineConv.finePurity.id,
          finePurityCode: fineConv.finePurity.code,
          finePurityLabel: fineConv.finePurity.displayLabel,
          destinationAccountCode: `ADMIN_POOL_${fineConv.finePurity.code}`,
          destinationAccountName: `Admin Stock Pool - ${fineConv.finePurity.displayLabel}`,
        },
        orderCounts: {
          ALL: customerOrders.length,
          ONGOING: customerOrders.filter(
            (o) =>
              o.status !== "COMPLETED" &&
              o.status !== "CANCELLED" &&
              o.status !== "CANCELLATION_PENDING_RECONCILIATION" &&
              o.deliveryStatus !== "DELIVERED"
          ).length,
          COMPLETED: customerOrders.filter(
            (o) => o.status === "COMPLETED" && o.deliveryStatus !== "DELIVERED"
          ).length,
          DELIVERED: customerOrders.filter(
            (o) => o.deliveryStatus === "DELIVERED"
          ).length,
          CANCELLED: customerOrders.filter(
            (o) =>
              o.status === "CANCELLED" ||
              o.status === "CANCELLATION_PENDING_RECONCILIATION"
          ).length,
        },
        orders: orderRows,
        bills: billRows,
        unpaidBills: billRows.filter(
          (b) =>
            b.documentStatus === "POSTED" && Number(b.remainingFine) > 0.00005
        ),
        statement: {
          monthFilter: monthFilter || null,
          openingDues: openingDue.toFixed(4),
          openingAdvance: openingAdvance.toFixed(4),
          openingBalanceLabel: openingDue.gt(ZERO)
            ? `${openingDue.toFixed(4)}g Opening Due`
            : openingAdvance.gt(ZERO)
            ? `${openingAdvance.toFixed(4)}g Opening Advance`
            : "0.0000g Opening Balance",
          periodTotalCharged: periodChargedTotal.toFixed(4),
          periodTotalActualGoldReceived: periodReceivedTotal.toFixed(4),
          closingDues: balances.fineOwed.toFixed(4),
          closingAvailableAdvance: balances.fineAdvance.toFixed(4),
          periodClosingDues: closingDue.toFixed(4),
          periodClosingAdvance: closingAdvance.toFixed(4),
          rows: statementRows,
        },
        transactionHistory: {
          goldReceipts: goldReceipts.map((r) => ({
            id: r.id,
            receiptNumber: r.receiptNumber,
            businessDate: r.businessDate.toISOString().slice(0, 10),
            totalGrossWeight: r.totalGrossWeight.toFixed(3),
            totalFineWeight: r.totalFineWeight.toFixed(4),
            unallocatedFineWeight: r.unallocatedFineWeight.toFixed(4),
            refundedFineWeight: (r.refundedFineWeight ?? ZERO).toFixed(4),
            inputModeSnapshot: r.inputModeSnapshot ?? "FINE_EQUIVALENT",
            physicalWeightProvided: r.physicalWeightProvided ?? true,
            status: r.status,
            referenceNumber: r.referenceNumber,
            notes: r.notes,
            reversalReason: r.reversalReason,
            lines: goldReceiptLines
              .filter((l) => l.receiptId === r.id)
              .map((l) => ({
                id: l.id,
                purityLabel: purityMap.get(l.purityId)?.displayLabel || "",
                grossWeight: l.grossWeight.toFixed(3),
                touchPercent: l.touchPercent.toFixed(2),
                fineWeight: l.fineWeight.toFixed(4),
              })),
          })),
          cashReceipts: cashReceipts.map((r) => ({
            id: r.id,
            receiptNumber: r.receiptNumber,
            businessDate: r.businessDate.toISOString().slice(0, 10),
            amountRupees: r.amountRupees.toFixed(2),
            unallocatedRupees: r.unallocatedRupees.toFixed(2),
            paymentMode: r.paymentMode,
            status: r.status,
            referenceNumber: r.referenceNumber,
            notes: r.notes,
          })),
          allocations: allocs.map((a) => ({
            id: a.id,
            billId: a.billId,
            billNumber: billMap.get(a.billId)?.billNumber || a.billId,
            goldReceiptId: a.goldReceiptId,
            goldReceiptNumber: a.goldReceiptId
              ? goldReceiptMap.get(a.goldReceiptId)?.receiptNumber ||
                a.goldReceiptId
              : null,
            cashReceiptId: a.cashReceiptId,
            allocatedFineWeight: a.allocatedFineWeight.toFixed(4),
            allocatedRupees: a.allocatedRupees.toFixed(2),
            status: a.status,
            businessDate: a.businessDate.toISOString().slice(0, 10),
            notes: a.notes,
            undoReason: a.undoReason,
          })),
        },
      };
    });
  }

  // =========================================================================
  // DEFAULT KARIGARS & KARIGAR UPDATE (Section 3)
  // =========================================================================

  public async ensureDefaultKarigars(actor: ActorContext): Promise<{
    karigars: KarigarEntity[];
    createdCount: number;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const desiredDefaults: Array<{
      name: string;
      capabilities: ProcessType[];
      defaultFor: ProcessType[];
      notes: string;
    }> = [
      {
        name: "Hasan Bhai",
        capabilities: ["FILING"],
        defaultFor: ["FILING"],
        notes: "Default Filing karigar",
      },
      {
        name: "Boro Bhai",
        capabilities: ["FREE_POLISH", "FINAL_POLISH"],
        defaultFor: ["FREE_POLISH", "FINAL_POLISH"],
        notes: "Default Free Polish & Final Polish karigar",
      },
      {
        name: "Josim",
        capabilities: ["SETTING"],
        defaultFor: ["SETTING"],
        notes: "Default Setting karigar",
      },
    ];

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.listKarigars(validActor.organizationId);
      let nextSeq = existing.length + 1;
      let createdCount = 0;

      for (const def of desiredDefaults) {
        // Do not overwrite if any karigar is already marked default for all these processes
        const hasDefaultForAll = def.defaultFor.every((proc) =>
          existing.some(
            (k) =>
              k.isActive &&
              (k.defaultForProcesses ?? []).includes(proc)
          )
        );
        if (hasDefaultForAll) continue;

        // Check if a karigar with this exact name & matching process capability already exists
        const match = existing.find(
          (k) =>
            k.name.trim().toLowerCase() === def.name.toLowerCase() &&
            def.capabilities.some((c) => k.capabilities.includes(c))
        );
        if (match) {
          const mergedCaps = Array.from(
            new Set<ProcessType>([...match.capabilities, ...def.capabilities])
          );
          const mergedDefaults = Array.from(
            new Set<ProcessType>([
              ...(match.defaultForProcesses ?? []),
              ...def.defaultFor.filter(
                (p) =>
                  !existing.some(
                    (other) =>
                      other.id !== match.id &&
                      other.isActive &&
                      (other.defaultForProcesses ?? []).includes(p)
                  )
              ),
            ])
          );
          const updated = await tx.updateKarigar({
            ...match,
            capabilities: mergedCaps,
            defaultForProcesses: mergedDefaults,
            updatedAt: new Date(),
          });
          const idx = existing.findIndex((x) => x.id === match.id);
          if (idx >= 0) existing[idx] = updated;
          continue;
        }

        const defaultProcessesToSet = def.defaultFor.filter(
          (p) =>
            !existing.some(
              (other) =>
                other.isActive &&
                (other.defaultForProcesses ?? []).includes(p)
            )
        );

        let code = `KAR-${String(nextSeq).padStart(3, "0")}`;
        while (existing.some((k) => k.karigarCode === code)) {
          nextSeq += 1;
          code = `KAR-${String(nextSeq).padStart(3, "0")}`;
        }
        nextSeq += 1;

        const now = new Date();
        const created = await tx.createKarigar({
          id: newId("kar"),
          organizationId: validActor.organizationId,
          karigarCode: code,
          name: def.name,
          phone: null,
          specializationNotes: def.notes,
          isActive: true,
          capabilities: def.capabilities,
          defaultForProcesses: defaultProcessesToSet,
          createdAt: now,
          updatedAt: now,
        });
        await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `KARIGAR_CUSTODY_${created.id}`,
          `Karigar Custody - ${created.name} (${created.karigarCode})`,
          "KARIGAR_CUSTODY",
          null,
          created.id
        );
        existing.push(created);
        createdCount += 1;
      }

      return { karigars: existing, createdCount };
    });
  }

  public async updateKarigar(
    actor: ActorContext,
    input: {
      karigarId: string;
      name?: string;
      phone?: string | null;
      specializationNotes?: string | null;
      isActive?: boolean;
      capabilities?: ProcessType[];
      defaultForProcesses?: ProcessType[];
    }
  ): Promise<KarigarEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getKarigarById(
        validActor.organizationId,
        input.karigarId
      );
      if (!existing) {
        throw new NotFoundError(`Karigar ${input.karigarId} not found`);
      }
      const nextCaps =
        input.capabilities && input.capabilities.length > 0
          ? input.capabilities
          : existing.capabilities;
      const nextDefaults = (
        input.defaultForProcesses ??
        existing.defaultForProcesses ??
        []
      ).filter((p) => nextCaps.includes(p));

      // Clear default flag from any other karigar for processes claimed as default here
      if (input.defaultForProcesses) {
        const allKarigars = await tx.listKarigars(validActor.organizationId);
        for (const other of allKarigars) {
          if (other.id === existing.id) continue;
          const otherDefaults = other.defaultForProcesses ?? [];
          const filtered = otherDefaults.filter(
            (p) => !nextDefaults.includes(p)
          );
          if (filtered.length !== otherDefaults.length) {
            await tx.updateKarigar({
              ...other,
              defaultForProcesses: filtered,
              updatedAt: new Date(),
            });
          }
        }
      }

      const updated = await tx.updateKarigar({
        ...existing,
        name: input.name !== undefined ? input.name.trim() : existing.name,
        phone:
          input.phone !== undefined
            ? input.phone?.trim() || null
            : existing.phone,
        specializationNotes:
          input.specializationNotes !== undefined
            ? input.specializationNotes
            : existing.specializationNotes,
        isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
        capabilities: nextCaps,
        defaultForProcesses: nextDefaults,
        updatedAt: new Date(),
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "Karigar",
        entityId: updated.id,
        action: "KARIGAR_UPDATED",
        summary: `Updated karigar ${updated.name} (${updated.karigarCode})`,
        metadataJson: JSON.stringify({
          isActive: updated.isActive,
          capabilities: updated.capabilities,
          defaultForProcesses: updated.defaultForProcesses,
        }),
        createdAt: new Date(),
      });

      return updated;
    });
  }

  // =========================================================================
  // FILING IN EDIT: RETURN UNUSED GOLD & CONTROLLED CORRECTION (Section 6)
  // =========================================================================

  public async returnUnusedGoldFromFiling(
    actor: ActorContext,
    input: {
      orderId: string;
      grossWeight: DecimalInput;
      businessDate?: string | Date;
      reason: string;
      idempotencyKey: string;
    }
  ): Promise<{
    order: OrderEntity;
    process: OrderProcessEntity;
    returnedWeight: Decimal;
    netIssuedWeight: Decimal;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const returnWeight = roundInternal(toDecimal(input.grossWeight));
    if (returnWeight.lte(ZERO)) {
      throw new ValidationError("Returned unused gold weight must be > 0");
    }
    const reason = input.reason?.trim() || "Unused gold returned from Filing";
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existingJtx = await tx.getJournalTransactionByIdempotencyKey(
        `filing_unused_ret_${input.idempotencyKey}`
      );
      let order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      const processes = await tx.listOrderProcesses(
        validActor.organizationId,
        order.id
      );
      const filingProc = processes.find((p) => p.processType === "FILING");
      if (!filingProc) {
        throw new ValidationError("Order does not have a Filing process");
      }

      if (existingJtx) {
        return {
          order,
          process: filingProc,
          returnedWeight: returnWeight,
          netIssuedWeight: filingProc.issuedMetalWeight,
        };
      }

      if (filingProc.status === "CLOSED") {
        throw new ConflictError(
          "Filing is already closed. Use controlled correction if an adjustment is needed."
        );
      }
      const laterStarted = processes.some(
        (p) =>
          p.sequenceOrder > filingProc.sequenceOrder && p.status !== "PENDING"
      );
      if (laterStarted) {
        throw new ConflictError(
          "Cannot return unused Filing gold after a downstream process has started"
        );
      }
      if (!filingProc.assignedKarigarId) {
        throw new ValidationError("Filing has no assigned karigar");
      }
      if (returnWeight.gt(filingProc.custodyMetalWeight)) {
        throw new ValidationError(
          `Cannot return ${returnWeight.toFixed(3)} g: only ${filingProc.custodyMetalWeight.toFixed(3)} g is in Filing custody`
        );
      }

      const purity = await tx.getPurityById(
        validActor.organizationId,
        order.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${order.purityId} not found`);
      }

      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );
      const karigarAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `KARIGAR_CUSTODY_${filingProc.assignedKarigarId}`,
        `Karigar Custody - ${filingProc.assignedKarigarId}`,
        "KARIGAR_CUSTODY",
        null,
        filingProc.assignedKarigarId
      );

      const returnFine = calculateFineEquivalent(returnWeight, order.touchSnapshot);
      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "FILING_UNUSED_RETURN",
        businessDate,
        purity,
        physicalWeight: returnWeight,
        fineEquivalentWeight: returnFine,
        sourceAccount: karigarAcct,
        destinationAccount: adminPoolAcct,
        sourceReference: order.bagNumber,
        reason: `${reason} (${returnWeight.toFixed(3)} g returned unused to Admin)`,
        orderId: order.id,
        karigarId: filingProc.assignedKarigarId,
        idempotencyKey: `filing_unused_ret_${input.idempotencyKey}`,
      });

      const now = new Date();
      await tx.createMetalMovement({
        id: newId("mov"),
        organizationId: validActor.organizationId,
        orderId: order.id,
        orderProcessId: filingProc.id,
        processVisitId: null,
        movementType: "FILING_UNUSED_RETURN",
        fromProcessType: "FILING",
        toProcessType: null,
        karigarId: filingProc.assignedKarigarId,
        businessDate,
        grossWeight: returnWeight,
        nonGoldWeight: ZERO,
        netMetalWeight: returnWeight,
        touchSnapshot: order.touchSnapshot,
        fineEquivalentWeight: returnFine,
        journalTransactionId: jtx.id,
        idempotencyKey: `mov_unused_ret_${input.idempotencyKey}`,
        notes: reason,
        createdById: validActor.userId,
        createdAt: now,
      });

      const nextIssued = roundInternal(
        filingProc.issuedMetalWeight.sub(returnWeight)
      );
      const nextCustody = roundInternal(
        filingProc.custodyMetalWeight.sub(returnWeight)
      );
      const nextGrossIn = roundInternal(
        filingProc.latestGrossInWeight.sub(returnWeight)
      );

      const updatedProc = await tx.updateOrderProcess({
        ...filingProc,
        issuedMetalWeight: nextIssued,
        custodyMetalWeight: nextCustody,
        latestGrossInWeight: nextGrossIn.lt(ZERO) ? ZERO : nextGrossIn,
        updatedAt: now,
      });

      const updatedOrder = await tx.updateOrder({
        ...order,
        initialIssuedMetalWeight: roundInternal(
          order.initialIssuedMetalWeight.sub(returnWeight)
        ),
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "OrderProcess",
        entityId: filingProc.id,
        action: "FILING_UNUSED_GOLD_RETURNED",
        summary: reason,
        metadataJson: JSON.stringify({
          bagNumber: order.bagNumber,
          returnedWeight: returnWeight.toFixed(3),
          netIssuedWeight: nextIssued.toFixed(3),
        }),
        createdAt: now,
      });

      return {
        order: updatedOrder,
        process: updatedProc,
        returnedWeight: returnWeight,
        netIssuedWeight: nextIssued,
      };
    });
  }

  public async correctFilingEntry(
    actor: ActorContext,
    input: {
      orderId: string;
      newNetIssuedWeight: DecimalInput;
      reason: string;
      businessDate?: string | Date;
      idempotencyKey: string;
    }
  ): Promise<{
    order: OrderEntity;
    process: OrderProcessEntity;
    deltaWeight: Decimal;
  }> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const targetIssued = roundInternal(toDecimal(input.newNetIssuedWeight));
    if (targetIssued.lte(ZERO)) {
      throw new ValidationError("Corrected Filing IN weight must be > 0");
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Reason is required for a Filing correction");
    }
    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existingJtx = await tx.getJournalTransactionByIdempotencyKey(
        `filing_corr_${input.idempotencyKey}`
      );
      let order = await tx.getOrderById(
        validActor.organizationId,
        input.orderId
      );
      if (!order) {
        throw new NotFoundError(`Order ${input.orderId} not found`);
      }
      const processes = await tx.listOrderProcesses(
        validActor.organizationId,
        order.id
      );
      const filingProc = processes.find((p) => p.processType === "FILING");
      if (!filingProc) {
        throw new ValidationError("Order does not have a Filing process");
      }
      if (existingJtx) {
        return {
          order,
          process: filingProc,
          deltaWeight: ZERO,
        };
      }
      if (filingProc.status === "CLOSED") {
        throw new ConflictError(
          "Filing is already closed. Reopen/cancel only if no downstream process or recovery settlement depends on it."
        );
      }
      const laterStarted = processes.some(
        (p) =>
          p.sequenceOrder > filingProc.sequenceOrder && p.status !== "PENDING"
      );
      if (laterStarted) {
        throw new ConflictError(
          "Cannot correct Filing IN after a downstream process has started"
        );
      }
      if (!filingProc.assignedKarigarId) {
        throw new ValidationError("Filing has no assigned karigar");
      }

      const delta = roundInternal(targetIssued.sub(filingProc.issuedMetalWeight));
      if (delta.isZero()) {
        throw new ValidationError(
          "Corrected weight matches current net Filing IN"
        );
      }

      const purity = await tx.getPurityById(
        validActor.organizationId,
        order.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${order.purityId} not found`);
      }
      const adminPoolAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );
      const karigarAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `KARIGAR_CUSTODY_${filingProc.assignedKarigarId}`,
        `Karigar Custody - ${filingProc.assignedKarigarId}`,
        "KARIGAR_CUSTODY",
        null,
        filingProc.assignedKarigarId
      );

      const absDelta = delta.abs();
      const absFine = calculateFineEquivalent(absDelta, order.touchSnapshot);

      if (delta.gt(ZERO) && adminPoolAcct.cachedPhysicalBalance.lt(absDelta)) {
        throw new ValidationError(
          `Insufficient Admin stock (${adminPoolAcct.cachedPhysicalBalance.toFixed(3)} g) to increase Filing IN by ${absDelta.toFixed(3)} g`
        );
      }
      if (delta.lt(ZERO) && filingProc.custodyMetalWeight.lt(absDelta)) {
        throw new ValidationError(
          `Cannot reduce Filing IN by ${absDelta.toFixed(3)} g: only ${filingProc.custodyMetalWeight.toFixed(3)} g remains in Filing custody`
        );
      }

      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "FILING_CORRECTION",
        businessDate,
        purity,
        physicalWeight: absDelta,
        fineEquivalentWeight: absFine,
        sourceAccount: delta.gt(ZERO) ? adminPoolAcct : karigarAcct,
        destinationAccount: delta.gt(ZERO) ? karigarAcct : adminPoolAcct,
        sourceReference: order.bagNumber,
        reason: `Filing IN correction (${filingProc.issuedMetalWeight.toFixed(3)} g -> ${targetIssued.toFixed(3)} g): ${reason}`,
        orderId: order.id,
        karigarId: filingProc.assignedKarigarId,
        idempotencyKey: `filing_corr_${input.idempotencyKey}`,
      });

      const now = new Date();
      await tx.createMetalMovement({
        id: newId("mov"),
        organizationId: validActor.organizationId,
        orderId: order.id,
        orderProcessId: filingProc.id,
        processVisitId: null,
        movementType: "FILING_CORRECTION",
        fromProcessType: delta.gt(ZERO) ? null : "FILING",
        toProcessType: delta.gt(ZERO) ? "FILING" : null,
        karigarId: filingProc.assignedKarigarId,
        businessDate,
        grossWeight: absDelta,
        nonGoldWeight: ZERO,
        netMetalWeight: absDelta,
        touchSnapshot: order.touchSnapshot,
        fineEquivalentWeight: absFine,
        journalTransactionId: jtx.id,
        idempotencyKey: `mov_corr_${input.idempotencyKey}`,
        notes: `Correction: ${reason}`,
        createdById: validActor.userId,
        createdAt: now,
      });

      const updatedProc = await tx.updateOrderProcess({
        ...filingProc,
        issuedMetalWeight: targetIssued,
        custodyMetalWeight: roundInternal(filingProc.custodyMetalWeight.add(delta)),
        latestGrossInWeight: roundInternal(
          filingProc.latestGrossInWeight.add(delta)
        ),
        updatedAt: now,
      });
      const updatedOrder = await tx.updateOrder({
        ...order,
        initialIssuedMetalWeight: roundInternal(
          order.initialIssuedMetalWeight.add(delta)
        ),
        updatedAt: now,
      });

      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "OrderProcess",
        entityId: filingProc.id,
        action: "FILING_ENTRY_CORRECTED",
        summary: reason,
        metadataJson: JSON.stringify({
          bagNumber: order.bagNumber,
          previousIssued: filingProc.issuedMetalWeight.toFixed(3),
          correctedIssued: targetIssued.toFixed(3),
          delta: delta.toFixed(3),
        }),
        createdAt: now,
      });

      return {
        order: updatedOrder,
        process: updatedProc,
        deltaWeight: delta,
      };
    });
  }

  // =========================================================================
  // ADMIN STOCK SALES, PURITY CONVERSIONS & REFINING (Section 2)
  // =========================================================================

  public async listStockSales(actor: ActorContext) {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction(async (tx) => {
      const [sales, purities] = await Promise.all([
        tx.listStockSales(validActor.organizationId),
        tx.listPurities(validActor.organizationId),
      ]);
      const pMap = new Map(purities.map((p) => [p.id, p]));
      return sales.map((s) => {
        const p = pMap.get(s.purityId);
        return {
          id: s.id,
          saleNumber: s.saleNumber,
          businessDate: s.businessDate.toISOString().slice(0, 10),
          purityId: s.purityId,
          purityLabel: p?.displayLabel ?? s.purityId,
          physicalWeight: s.physicalWeight.toFixed(3),
          touchPercent: s.touchPercentSnapshot.toFixed(2),
          fineEquivalentWeight: s.fineEquivalentWeight.toFixed(3),
          buyerName: s.buyerName,
          buyerPhone: s.buyerPhone,
          pricePerGramRupees: s.pricePerGramRupees.toFixed(2),
          totalAmountRupees: s.totalAmountRupees.toFixed(2),
          paidAmountRupees: s.paidAmountRupees.toFixed(2),
          paymentStatus: s.paymentStatus,
          status: s.status,
          referenceNumber: s.referenceNumber,
          notes: s.notes,
          reversalReason: s.reversalReason,
        };
      });
    });
  }

  public async postStockSale(
    actor: ActorContext,
    input: {
      purityId: string;
      physicalWeight: DecimalInput;
      businessDate?: string | Date;
      buyerName: string;
      buyerPhone?: string;
      pricePerGramRupees?: DecimalInput;
      paidAmountRupees?: DecimalInput;
      referenceNumber?: string;
      notes?: string;
      idempotencyKey: string;
    }
  ): Promise<StockSaleEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const phys = roundInternal(toDecimal(input.physicalWeight));
    if (phys.lte(ZERO)) {
      throw new ValidationError("Sale physical weight must be > 0");
    }
    const buyerName = input.buyerName?.trim();
    if (!buyerName) {
      throw new ValidationError("Buyer name is required for gold sale");
    }
    const pricePerGram = roundRupees(
      toDecimal(input.pricePerGramRupees ?? "0")
    );
    if (pricePerGram.lt(ZERO)) {
      throw new ValidationError("Price per gram cannot be negative");
    }
    const totalAmount = roundRupees(phys.mul(pricePerGram));
    const paidAmount = roundRupees(toDecimal(input.paidAmountRupees ?? "0"));
    if (paidAmount.lt(ZERO) || paidAmount.gt(totalAmount)) {
      throw new ValidationError(
        "Paid INR amount must be between 0 and total sale amount"
      );
    }
    const paymentStatus: StockSaleEntity["paymentStatus"] =
      totalAmount.gt(ZERO) && paidAmount.gte(totalAmount)
        ? "PAID"
        : paidAmount.gt(ZERO)
          ? "PARTIAL"
          : "UNPAID";

    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getStockSaleByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return existing;

      const purity = await tx.getPurityById(
        validActor.organizationId,
        input.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${input.purityId} not found`);
      }

      const adminAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );
      if (adminAcct.cachedPhysicalBalance.lt(phys)) {
        throw new ValidationError(
          `Insufficient ${purity.displayLabel} stock (${adminAcct.cachedPhysicalBalance.toFixed(3)} g available, requested ${phys.toFixed(3)} g)`
        );
      }

      const saleOutAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `STOCK_SALE_OUTFLOW_${purity.code}`,
        `Stock Sale Outflow - ${purity.displayLabel}`,
        "CUSTOMER_DELIVERED",
        purity.id,
        null
      );

      const fine = calculateFineEquivalent(phys, purity.touchPercent);
      const existingSales = await tx.listStockSales(validActor.organizationId);
      const saleNumber = `SAL-${String(existingSales.length + 1).padStart(4, "0")}`;

      const jtx = await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "STOCK_SALE",
        businessDate,
        purity,
        physicalWeight: phys,
        fineEquivalentWeight: fine,
        sourceAccount: adminAcct,
        destinationAccount: saleOutAcct,
        sourceReference: saleNumber,
        reason: `Gold sale ${saleNumber} to ${buyerName} (${phys.toFixed(3)} g @ ${purity.displayLabel})`,
        idempotencyKey: `sale_jnl_${input.idempotencyKey}`,
      });

      const sale = await tx.createStockSale({
        id: newId("sal"),
        organizationId: validActor.organizationId,
        saleNumber,
        businessDate,
        purityId: purity.id,
        physicalWeight: phys,
        touchPercentSnapshot: purity.touchPercent,
        fineEquivalentWeight: fine,
        buyerName,
        buyerPhone: input.buyerPhone?.trim() || null,
        pricePerGramRupees: pricePerGram,
        totalAmountRupees: totalAmount,
        paidAmountRupees: paidAmount,
        paymentStatus,
        status: "POSTED",
        referenceNumber: input.referenceNumber?.trim() || null,
        notes: input.notes?.trim() || null,
        journalTransactionId: jtx.id,
        idempotencyKey: input.idempotencyKey,
        createdById: validActor.userId,
        createdAt: new Date(),
        reversedAt: null,
        reversedById: null,
        reversalReason: null,
      });

      return sale;
    });
  }

  public async reverseStockSale(
    actor: ActorContext,
    input: { saleId: string; reason: string; idempotencyKey: string }
  ): Promise<StockSaleEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Reversal reason is required");
    }

    return this.repo.runInTransaction(async (tx) => {
      const sale = await tx.getStockSaleById(
        validActor.organizationId,
        input.saleId
      );
      if (!sale) {
        throw new NotFoundError(`Stock sale ${input.saleId} not found`);
      }
      if (sale.status === "REVERSED") {
        return sale;
      }
      const purity = await tx.getPurityById(
        validActor.organizationId,
        sale.purityId
      );
      if (!purity) {
        throw new NotFoundError(`Purity ${sale.purityId} not found`);
      }

      const adminAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${purity.code}`,
        `Admin Stock Pool - ${purity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        purity.id,
        null
      );
      const saleOutAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `STOCK_SALE_OUTFLOW_${purity.code}`,
        `Stock Sale Outflow - ${purity.displayLabel}`,
        "CUSTOMER_DELIVERED",
        purity.id,
        null
      );

      await this.postBalancedJournalEntry(tx, {
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        transactionType: "STOCK_SALE_REVERSAL",
        businessDate: new Date(),
        purity,
        physicalWeight: sale.physicalWeight,
        fineEquivalentWeight: sale.fineEquivalentWeight,
        sourceAccount: saleOutAcct,
        destinationAccount: adminAcct,
        sourceReference: sale.saleNumber,
        reason: `Reversal of ${sale.saleNumber}: ${reason}`,
        idempotencyKey: `sale_rev_${input.idempotencyKey}`,
      });

      return tx.updateStockSale({
        ...sale,
        status: "REVERSED",
        reversedAt: new Date(),
        reversedById: validActor.userId,
        reversalReason: reason,
      });
    });
  }

  public async listStockConversions(actor: ActorContext) {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction(async (tx) => {
      const [conversions, purities] = await Promise.all([
        tx.listStockConversions(validActor.organizationId),
        tx.listPurities(validActor.organizationId),
      ]);
      const pMap = new Map(purities.map((p) => [p.id, p]));
      return conversions.map((c) => ({
        id: c.id,
        conversionNumber: c.conversionNumber,
        conversionType: c.conversionType,
        businessDate: c.businessDate.toISOString().slice(0, 10),
        sourcePurityId: c.sourcePurityId,
        sourcePurityLabel: pMap.get(c.sourcePurityId)?.displayLabel ?? c.sourcePurityId,
        sourceWeight: c.sourceWeight.toFixed(3),
        sourceTouchPercent: c.sourceTouchPercent.toFixed(2),
        theoreticalFineWeight: c.theoreticalFineWeight.toFixed(4),
        targetPurityId: c.targetPurityId,
        targetPurityLabel: pMap.get(c.targetPurityId)?.displayLabel ?? c.targetPurityId,
        actualOutputWeight: c.actualOutputWeight.toFixed(3),
        actualOutputTouch: c.actualOutputTouch.toFixed(2),
        actualOutputFineWeight: c.actualOutputFineWeight.toFixed(4),
        residueWeight: c.residueWeight.toFixed(3),
        returnedMetalWeight: c.returnedMetalWeight.toFixed(3),
        lossFineWeight: c.lossFineWeight.toFixed(4),
        lossTreatment: c.lossTreatment,
        refinerOrPartner: c.refinerOrPartner,
        notes: c.notes,
      }));
    });
  }

  public async previewStockConversion(
    actor: ActorContext,
    input: {
      sourcePurityId: string;
      sourceWeight: DecimalInput;
      targetPurityId: string;
    }
  ) {
    const validActor = this.assertAuthenticated(actor);
    const sourceWeight = roundInternal(toDecimal(input.sourceWeight));
    if (sourceWeight.lte(ZERO)) {
      throw new ValidationError("Source weight must be > 0");
    }
    return this.repo.runInTransaction(async (tx) => {
      const [src, tgt] = await Promise.all([
        tx.getPurityById(validActor.organizationId, input.sourcePurityId),
        tx.getPurityById(validActor.organizationId, input.targetPurityId),
      ]);
      if (!src || !tgt) {
        throw new NotFoundError("Source or target purity not found");
      }
      const theoreticalFineWeight = calculateFineEquivalent(
        sourceWeight,
        src.touchPercent
      );
      const expectedTargetWeight = roundInternal(
        theoreticalFineWeight.mul(100).div(tgt.touchPercent)
      );
      const alloyAddedWeight = roundInternal(
        expectedTargetWeight.sub(sourceWeight)
      );
      return {
        sourcePurityLabel: src.displayLabel,
        sourceTouchPercent: src.touchPercent.toFixed(4),
        sourceWeight: sourceWeight.toFixed(3),
        theoreticalFineWeight: theoreticalFineWeight.toFixed(4),
        targetPurityLabel: tgt.displayLabel,
        targetTouchPercent: tgt.touchPercent.toFixed(4),
        expectedTargetWeight: expectedTargetWeight.toFixed(3),
        alloyAddedWeight: alloyAddedWeight.gt(ZERO)
          ? alloyAddedWeight.toFixed(3)
          : "0.000",
      };
    });
  }

  public async postStockConversion(
    actor: ActorContext,
    input: {
      conversionType: StockConversionEntity["conversionType"];
      businessDate?: string | Date;
      sourcePurityId: string;
      sourceWeight: DecimalInput;
      targetPurityId: string;
      actualOutputWeight: DecimalInput;
      residueWeight?: DecimalInput;
      returnedMetalWeight?: DecimalInput;
      lossTreatment?: StockConversionEntity["lossTreatment"];
      refinerOrPartner?: string;
      notes?: string;
      idempotencyKey: string;
    }
  ): Promise<StockConversionEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    const sourceWeight = roundInternal(toDecimal(input.sourceWeight));
    const actualOutputWeight = roundInternal(toDecimal(input.actualOutputWeight));
    const residueWeight = roundInternal(toDecimal(input.residueWeight ?? "0"));
    const returnedMetalWeight = roundInternal(
      toDecimal(input.returnedMetalWeight ?? "0")
    );

    if (sourceWeight.lte(ZERO) || actualOutputWeight.lte(ZERO)) {
      throw new ValidationError(
        "Source weight and actual output weight must be > 0"
      );
    }
    if (residueWeight.lt(ZERO) || returnedMetalWeight.lt(ZERO)) {
      throw new ValidationError(
        "Residue and returned metal weights cannot be negative"
      );
    }
    if (returnedMetalWeight.gte(sourceWeight)) {
      throw new ValidationError(
        "Returned un-converted metal cannot equal or exceed source input"
      );
    }

    const businessDate = parseBusinessDate(input.businessDate);

    return this.repo.runInTransaction(async (tx) => {
      const existing = await tx.getStockConversionByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) return existing;

      const [srcPurity, tgtPurity] = await Promise.all([
        tx.getPurityById(validActor.organizationId, input.sourcePurityId),
        tx.getPurityById(validActor.organizationId, input.targetPurityId),
      ]);
      if (!srcPurity || !tgtPurity) {
        throw new NotFoundError("Source or target purity not found");
      }

      const srcAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${srcPurity.code}`,
        `Admin Stock Pool - ${srcPurity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        srcPurity.id,
        null
      );
      const tgtAcct = await this.ensureSystemAccount(
        tx,
        validActor.organizationId,
        `ADMIN_POOL_${tgtPurity.code}`,
        `Admin Stock Pool - ${tgtPurity.displayLabel}`,
        "ADMIN_KARAT_POOL",
        tgtPurity.id,
        null
      );

      const netConsumedSourceWeight = roundInternal(
        sourceWeight.sub(returnedMetalWeight)
      );
      if (srcAcct.cachedPhysicalBalance.lt(netConsumedSourceWeight)) {
        throw new ValidationError(
          `Insufficient ${srcPurity.displayLabel} stock (${srcAcct.cachedPhysicalBalance.toFixed(3)} g available, net consumed ${netConsumedSourceWeight.toFixed(3)} g)`
        );
      }

      const theoreticalFineWeight = calculateFineEquivalent(
        sourceWeight,
        srcPurity.touchPercent
      );
      const netConsumedFine = calculateFineEquivalent(
        netConsumedSourceWeight,
        srcPurity.touchPercent
      );
      const actualOutputFineWeight = calculateFineEquivalent(
        actualOutputWeight,
        tgtPurity.touchPercent
      );
      const residueFine = calculateFineEquivalent(
        residueWeight,
        srcPurity.touchPercent
      );

      const accountedOutputFine = roundInternal(
        actualOutputFineWeight.add(residueFine)
      );

      if (accountedOutputFine.gt(netConsumedFine.add(new Decimal("0.0005")))) {
        throw new ValidationError(
          `Cannot invent gold: output fine (${accountedOutputFine.toFixed(4)} g) exceeds accounted input fine (${netConsumedFine.toFixed(4)} g)`
        );
      }

      const lossFineWeight = roundInternal(
        netConsumedFine.sub(actualOutputFineWeight)
      );
      const effectiveLossFine = lossFineWeight.gt(ZERO) ? lossFineWeight : ZERO;
      const lossTreatment: StockConversionEntity["lossTreatment"] =
        effectiveLossFine.gt(new Decimal("0.0001"))
          ? input.lossTreatment && input.lossTreatment !== "NONE"
            ? input.lossTreatment
            : "ACCEPTED"
          : "NONE";

      const convList = await tx.listStockConversions(validActor.organizationId);
      const conversionNumber = `CNV-${String(convList.length + 1).padStart(4, "0")}`;

      const txType: JournalTransactionType =
        input.conversionType === "REFINING" ||
        input.conversionType === "ALLOYING"
          ? "REFINING_BATCH"
          : "PURITY_CONVERSION";

      const now = new Date();
      const jtxId = newId("jtx");
      const jtx = await tx.createJournalTransaction({
        id: jtxId,
        organizationId: validActor.organizationId,
        transactionNumber: `JNL-${now.getTime().toString().slice(-6)}-${jtxId.slice(-4).toUpperCase()}`,
        transactionType: txType,
        businessDate,
        sourceReference: conversionNumber,
        reason: `${input.conversionType}: ${netConsumedSourceWeight.toFixed(3)} g @ ${srcPurity.displayLabel} -> ${actualOutputWeight.toFixed(3)} g @ ${tgtPurity.displayLabel}`,
        purityId: tgtPurity.id,
        touchSnapshot: tgtPurity.touchPercent,
        physicalWeight: actualOutputWeight,
        fineEquivalentWeight: actualOutputFineWeight,
        orderId: null,
        orderProcessId: null,
        processVisitId: null,
        karigarId: null,
        idempotencyKey: `conv_jnl_${input.idempotencyKey}`,
        reversalOfTransactionId: null,
        isReversed: false,
        actorId: validActor.userId,
        createdAt: now,
      });

      // 1. Credit out net consumed source metal
      await tx.createJournalLine({
        id: newId("jln"),
        organizationId: validActor.organizationId,
        journalTransactionId: jtx.id,
        accountId: srcAcct.id,
        direction: "CREDIT_OUT",
        signedPhysicalDelta: netConsumedSourceWeight.negated(),
        touchSnapshot: srcPurity.touchPercent,
        signedFineDelta: netConsumedFine.negated(),
        orderId: null,
        orderProcessId: null,
        karigarId: null,
        description: `${conversionNumber} source consumed (${srcPurity.displayLabel})`,
        createdAt: now,
      });
      await tx.updateStockAccountBalances(
        srcAcct.id,
        roundInternal(srcAcct.cachedPhysicalBalance.sub(netConsumedSourceWeight)),
        roundInternal(srcAcct.cachedFineBalance.sub(netConsumedFine))
      );

      // 2. Debit in actual measured output metal
      const tgtUpdatedAcct =
        tgtAcct.id === srcAcct.id
          ? (await tx.getStockAccountById(validActor.organizationId, tgtAcct.id))!
          : tgtAcct;
      await tx.createJournalLine({
        id: newId("jln"),
        organizationId: validActor.organizationId,
        journalTransactionId: jtx.id,
        accountId: tgtUpdatedAcct.id,
        direction: "DEBIT_IN",
        signedPhysicalDelta: actualOutputWeight,
        touchSnapshot: tgtPurity.touchPercent,
        signedFineDelta: actualOutputFineWeight,
        orderId: null,
        orderProcessId: null,
        karigarId: null,
        description: `${conversionNumber} actual output (${tgtPurity.displayLabel})`,
        createdAt: now,
      });
      await tx.updateStockAccountBalances(
        tgtUpdatedAcct.id,
        roundInternal(tgtUpdatedAcct.cachedPhysicalBalance.add(actualOutputWeight)),
        roundInternal(tgtUpdatedAcct.cachedFineBalance.add(actualOutputFineWeight))
      );

      // 3. Balance any refining/conversion fine difference (loss + residue) into REFINING_LOSS_
      const fineResidual = roundInternal(
        netConsumedFine.sub(actualOutputFineWeight)
      );
      if (!fineResidual.isZero()) {
        const refLossAcct = await this.ensureSystemAccount(
          tx,
          validActor.organizationId,
          `REFINING_LOSS_${srcPurity.code}`,
          `Refining / Conversion Loss - ${srcPurity.displayLabel}`,
          "PROCESS_LOSS",
          srcPurity.id,
          null
        );
        await tx.createJournalLine({
          id: newId("jln"),
          organizationId: validActor.organizationId,
          journalTransactionId: jtx.id,
          accountId: refLossAcct.id,
          direction: fineResidual.gt(ZERO) ? "DEBIT_IN" : "CREDIT_OUT",
          signedPhysicalDelta: residueWeight,
          touchSnapshot: srcPurity.touchPercent,
          signedFineDelta: fineResidual,
          orderId: null,
          orderProcessId: null,
          karigarId: null,
          description: `${conversionNumber} refining/conversion loss`,
          createdAt: now,
        });
        await tx.updateStockAccountBalances(
          refLossAcct.id,
          roundInternal(refLossAcct.cachedPhysicalBalance.add(residueWeight)),
          roundInternal(refLossAcct.cachedFineBalance.add(fineResidual))
        );
      }

      return tx.createStockConversion({
        id: newId("cnv"),
        organizationId: validActor.organizationId,
        conversionNumber,
        conversionType: input.conversionType,
        businessDate,
        sourcePurityId: srcPurity.id,
        sourceWeight,
        sourceTouchPercent: srcPurity.touchPercent,
        theoreticalFineWeight,
        targetPurityId: tgtPurity.id,
        actualOutputWeight,
        actualOutputTouch: tgtPurity.touchPercent,
        actualOutputFineWeight,
        residueWeight,
        returnedMetalWeight,
        lossFineWeight: effectiveLossFine,
        lossTreatment,
        refinerOrPartner: input.refinerOrPartner?.trim() || null,
        notes: input.notes?.trim() || null,
        journalTransactionId: jtx.id,
        idempotencyKey: input.idempotencyKey,
        createdById: validActor.userId,
        createdAt: now,
      });
    });
  }

  // =========================================================================
  // CUSTOMER CASH RECEIPT REVERSAL & CONSOLIDATED STATEMENT (Section 9)
  // =========================================================================

  public async reverseCustomerCashReceipt(
    actor: ActorContext,
    input: { receiptId: string; reason: string }
  ): Promise<CustomerCashReceiptEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError("Reversal reason is required");
    }
    return this.repo.runInTransaction(async (tx) => {
      const receipt = await tx.getCustomerCashReceiptById(
        validActor.organizationId,
        input.receiptId
      );
      if (!receipt) {
        throw new NotFoundError(`Cash receipt ${input.receiptId} not found`);
      }
      if (receipt.status === "REVERSED") {
        return receipt;
      }
      const allocs = await tx.listCustomerPaymentAllocations(
        validActor.organizationId,
        { cashReceiptId: receipt.id }
      );
      if (allocs.some((a) => a.status === "ACTIVE")) {
        throw new ConflictError(
          `Cannot reverse ${receipt.receiptNumber}: undo its active bill allocations first`
        );
      }
      const updated = await tx.updateCustomerCashReceipt({
        ...receipt,
        unallocatedRupees: ZERO,
        status: "REVERSED",
        reversedAt: new Date(),
        reversedById: validActor.userId,
        reversalReason: reason,
      });
      await tx.createAuditEvent({
        id: newId("aud"),
        organizationId: validActor.organizationId,
        actorId: validActor.userId,
        entityType: "CustomerCashReceipt",
        entityId: receipt.id,
        action: "CUSTOMER_CASH_RECEIPT_REVERSED",
        summary: reason,
        metadataJson: JSON.stringify({
          receiptNumber: receipt.receiptNumber,
          amountRupees: receipt.amountRupees.toFixed(2),
        }),
        createdAt: new Date(),
      });
      return updated;
    });
  }

  public async getCustomerConsolidatedStatement(
    actor: ActorContext,
    customerId: string
  ) {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction(async (tx) => {
      const customer = await tx.getCustomerById(
        validActor.organizationId,
        customerId
      );
      if (!customer) {
        throw new NotFoundError(`Customer ${customerId} not found`);
      }
      const [bills, goldReceipts, cashReceipts, allocations] =
        await Promise.all([
          tx.listCustomerBills(validActor.organizationId, customerId),
          tx.listCustomerGoldReceipts(validActor.organizationId, customerId),
          tx.listCustomerCashReceipts(validActor.organizationId, customerId),
          tx.listCustomerPaymentAllocations(validActor.organizationId, {
            customerId,
          }),
        ]);

      const postedBills = bills.filter((b) => b.status === "POSTED");
      const activeAllocs = allocations.filter((a) => a.status === "ACTIVE");

      let totalBilledFine = ZERO;
      let totalBilledInr = ZERO;
      let totalAllocatedFine = ZERO;
      let totalAllocatedInr = ZERO;

      const billRows = postedBills.map((b) => {
        const bAllocs = activeAllocs.filter((a) => a.billId === b.id);
        const allocFine = bAllocs.reduce(
          (s, a) => roundInternal(s.add(a.allocatedFineWeight)),
          ZERO
        );
        const allocInr = bAllocs.reduce(
          (s, a) => roundRupees(s.add(a.allocatedRupees)),
          ZERO
        );
        const outFine = roundInternal(b.totalFineGold.sub(allocFine));
        const outInr = roundRupees(b.totalCashRupees.sub(allocInr));
        totalBilledFine = roundInternal(totalBilledFine.add(b.totalFineGold));
        totalBilledInr = roundRupees(totalBilledInr.add(b.totalCashRupees));
        totalAllocatedFine = roundInternal(totalAllocatedFine.add(allocFine));
        totalAllocatedInr = roundRupees(totalAllocatedInr.add(allocInr));
        return {
          id: b.id,
          billNumber: b.billNumber,
          billDate: b.billDate.toISOString().slice(0, 10),
          totalFineGold: b.totalFineGold.toFixed(4),
          allocatedFine: allocFine.toFixed(4),
          outstandingFine: (outFine.gt(ZERO) ? outFine : ZERO).toFixed(4),
          totalCashRupees: b.totalCashRupees.toFixed(2),
          allocatedInr: allocInr.toFixed(2),
          outstandingInr: (outInr.gt(ZERO) ? outInr : ZERO).toFixed(2),
          settlementStatus: b.settlementStatus,
        };
      });

      const unallocatedGoldCredit = goldReceipts
        .filter((r) => r.status === "POSTED")
        .reduce(
          (s, r) => roundInternal(s.add(r.unallocatedFineWeight)),
          ZERO
        );
      const unallocatedCashCredit = cashReceipts
        .filter((r) => r.status === "POSTED")
        .reduce((s, r) => roundRupees(s.add(r.unallocatedRupees)), ZERO);

      const netBillFineDue = roundInternal(totalBilledFine.sub(totalAllocatedFine));
      const netBillInrDue = roundRupees(totalBilledInr.sub(totalAllocatedInr));

      return {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
        },
        bills: billRows,
        totals: {
          totalBilledFine: totalBilledFine.toFixed(4),
          totalAllocatedFine: totalAllocatedFine.toFixed(4),
          netOutstandingFine: (netBillFineDue.gt(ZERO) ? netBillFineDue : ZERO).toFixed(4),
          unallocatedGoldCredit: unallocatedGoldCredit.toFixed(4),
          totalBilledInr: totalBilledInr.toFixed(2),
          totalAllocatedInr: totalAllocatedInr.toFixed(2),
          netOutstandingInr: (netBillInrDue.gt(ZERO) ? netBillInrDue : ZERO).toFixed(2),
          unallocatedCashCredit: unallocatedCashCredit.toFixed(2),
        },
      };
    });
  }

  // =========================================================================
  // PUBLIC REVOCABLE BILL SHARE TOKENS (Section 10)
  // =========================================================================

  public async createBillShareToken(
    actor: ActorContext,
    billId: string
  ): Promise<BillShareTokenEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN", "OPERATOR"]);
    return this.repo.runInTransaction(async (tx) => {
      const bill = await tx.getCustomerBillById(
        validActor.organizationId,
        billId
      );
      if (!bill) {
        throw new NotFoundError(`Bill ${billId} not found`);
      }
      const existingTokens = await tx.listBillShareTokens(
        validActor.organizationId,
        bill.id
      );
      const active = existingTokens.find((t) => !t.isRevoked);
      if (active) return active;

      const token = crypto.randomBytes(24).toString("base64url");
      return tx.createBillShareToken({
        id: newId("bst"),
        organizationId: validActor.organizationId,
        billId: bill.id,
        token,
        isRevoked: false,
        expiresAt: null,
        createdByUserId: validActor.userId,
        createdAt: new Date(),
        revokedAt: null,
      });
    });
  }

  public async revokeBillShareToken(
    actor: ActorContext,
    tokenId: string
  ): Promise<BillShareTokenEntity> {
    const validActor = this.assertRole(actor, ["OWNER_ADMIN"]);
    return this.repo.runInTransaction(async (tx) => {
      const tokens = await tx.listBillShareTokens(validActor.organizationId);
      const found = tokens.find((t) => t.id === tokenId);
      if (!found) {
        throw new NotFoundError("Share token not found");
      }
      if (found.isRevoked) return found;
      return tx.updateBillShareToken({
        ...found,
        isRevoked: true,
        revokedAt: new Date(),
      });
    });
  }

  public async getPublicSharedBill(token: string) {
    return this.repo.runInTransaction(async (tx) => {
      const share = await tx.getBillShareTokenByToken(token);
      if (!share || share.isRevoked) {
        throw new NotFoundError("Shared bill link is invalid or revoked");
      }
      if (share.expiresAt && share.expiresAt < new Date()) {
        throw new NotFoundError("Shared bill link has expired");
      }
      const bill = await tx.getCustomerBillById(
        share.organizationId,
        share.billId
      );
      if (!bill) {
        throw new NotFoundError("Bill not found");
      }
      const customer = await tx.getCustomerById(
        share.organizationId,
        bill.customerId
      );
      return {
        billNumber: bill.billNumber,
        billDate: bill.billDate.toISOString().slice(0, 10),
        status: bill.status,
        customerName: customer?.name ?? "Customer",
        totalFineGold: bill.totalFineGold.toFixed(4),
        totalCashRupees: bill.totalCashRupees.toFixed(2),
        previewHtml: bill.previewHtml ?? "",
      };
    });
  }

  // =========================================================================
  // TOTAL STOCK & WORKSHOP DASHBOARD SUMMARY (Section 12)
  // =========================================================================

  public async getDashboardSummary(actor: ActorContext) {
    const validActor = this.assertAuthenticated(actor);
    return this.repo.runInTransaction(async (tx) => {
      const [
        purities,
        accounts,
        orders,
        processes,
        karigars,
        lossRecords,
        recoveryAllocs,
        writeOffs,
        makingDeds,
        recoveryReceipts,
        bills,
        goldReceipts,
        customerAllocs,
      ] = await Promise.all([
        tx.listPurities(validActor.organizationId),
        tx.listStockAccounts(validActor.organizationId),
        tx.listOrders(validActor.organizationId),
        tx.listOrderProcesses(validActor.organizationId),
        tx.listKarigars(validActor.organizationId),
        tx.listProcessLossRecords(validActor.organizationId),
        tx.listRecoveryAllocations(validActor.organizationId, {}),
        tx.listLossWriteOffs(validActor.organizationId, {}),
        tx.listMakingDeductionAllocations(validActor.organizationId, {}),
        tx.listRecoveryReceipts(validActor.organizationId),
        tx.listCustomerBills(validActor.organizationId),
        tx.listCustomerGoldReceipts(validActor.organizationId),
        tx.listCustomerPaymentAllocations(validActor.organizationId, {}),
      ]);

      // Group A: Admin Stock
      let adminPhysicalTotal = ZERO;
      let adminFineTotal = ZERO;
      const adminByPurity = purities.map((p) => {
        const acct = accounts.find(
          (a) => a.accountType === "ADMIN_KARAT_POOL" && a.purityId === p.id
        );
        const phys = acct?.cachedPhysicalBalance ?? ZERO;
        const fine = acct?.cachedFineBalance ?? ZERO;
        adminPhysicalTotal = roundInternal(adminPhysicalTotal.add(phys));
        adminFineTotal = roundInternal(adminFineTotal.add(fine));
        return {
          purityId: p.id,
          displayLabel: p.displayLabel,
          touchPercent: p.touchPercent.toFixed(2),
          physicalWeight: phys.toFixed(3),
          fineWeight: fine.toFixed(4),
        };
      });

      // Group B: Customer Gold Owed (posted bills - active fine allocations) & Unused Customer Credits
      const postedBills = bills.filter((b) => b.status === "POSTED");
      const activeCustAllocs = customerAllocs.filter(
        (a) => a.status === "ACTIVE"
      );
      let customerFineOwed = ZERO;
      const customerBillItems: Array<{
        billId: string;
        billNumber: string;
        customerId: string;
        outstandingFine: string;
      }> = [];
      for (const b of postedBills) {
        const allocFine = activeCustAllocs
          .filter((a) => a.billId === b.id)
          .reduce((s, a) => roundInternal(s.add(a.allocatedFineWeight)), ZERO);
        const rem = roundInternal(b.totalFineGold.sub(allocFine));
        if (rem.gt(ZERO)) {
          customerFineOwed = roundInternal(customerFineOwed.add(rem));
          customerBillItems.push({
            billId: b.id,
            billNumber: b.billNumber,
            customerId: b.customerId,
            outstandingFine: rem.toFixed(4),
          });
        }
      }
      const unusedCustomerGoldCredits = goldReceipts
        .filter((r) => r.status === "POSTED")
        .reduce(
          (s, r) => roundInternal(s.add(r.unallocatedFineWeight)),
          ZERO
        );

      // Group C: Production & Recovery Balance
      // C1. Work in progress (Karigar Custody accounts + order process custody)
      let wipPhysicalTotal = ZERO;
      let wipFineTotal = ZERO;
      const wipItems: Array<{
        orderId: string;
        bagNumber: string;
        orderName: string;
        custodyPhysical: string;
        custodyFine: string;
      }> = [];
      for (const ord of orders) {
        if (ord.status === "COMPLETED" || ord.status === "CANCELLED") continue;
        const ordProcs = processes.filter((p) => p.orderId === ord.id);
        const custPhys = ordProcs.reduce(
          (s, p) => roundInternal(s.add(p.custodyMetalWeight)),
          ZERO
        );
        if (custPhys.gt(ZERO)) {
          const custFine = calculateFineEquivalent(custPhys, ord.touchSnapshot);
          wipPhysicalTotal = roundInternal(wipPhysicalTotal.add(custPhys));
          wipFineTotal = roundInternal(wipFineTotal.add(custFine));
          wipItems.push({
            orderId: ord.id,
            bagNumber: ord.bagNumber,
            orderName: ord.orderName,
            custodyPhysical: custPhys.toFixed(3),
            custodyFine: custFine.toFixed(4),
          });
        }
      }

      // C2. Finished Goods awaiting delivery
      let fgPhysicalTotal = ZERO;
      let fgFineTotal = ZERO;
      const fgOrders = orders.filter(
        (o) =>
          o.status === "COMPLETED" &&
          o.deliveryStatus === "NOT_DELIVERED"
      );
      for (const p of purities) {
        const fgAcct = accounts.find(
          (a) => a.accountType === "FINISHED_GOODS" && a.purityId === p.id
        );
        if (fgAcct) {
          fgPhysicalTotal = roundInternal(
            fgPhysicalTotal.add(fgAcct.cachedPhysicalBalance)
          );
          fgFineTotal = roundInternal(fgFineTotal.add(fgAcct.cachedFineBalance));
        }
      }

      // C2b. Delivered orders whose bill was cancelled and are awaiting re-billing
      const deliveredUnbilledOrders = orders.filter(
        (o) =>
          o.status === "COMPLETED" &&
          o.deliveryStatus === "DELIVERED" &&
          o.billingStatus === "REVERSED"
      );
      let deliveredUnbilledFine = ZERO;
      for (const ord of deliveredUnbilledOrders) {
        const f = ord.finishedFineWeight
          ? roundInternal(ord.finishedFineWeight)
          : calculateFineEquivalent(
              roundInternal(ord.finishedNetMetalWeight ?? ZERO),
              ord.touchSnapshot
            );
        deliveredUnbilledFine = roundInternal(deliveredUnbilledFine.add(f));
      }

      // C3. Outstanding process losses (unsettled fine loss)
      let outstandingLossFine = ZERO;
      const kMap = new Map(karigars.map((k) => [k.id, k.name]));
      const lossItems: Array<{
        karigarId: string;
        karigarName: string;
        processType: ProcessType;
        outstandingFine: string;
      }> = [];
      for (const lr of lossRecords) {
        if (lr.eligibilityStatus === "VOIDED") continue;
        const settled = roundInternal(
          recoveryAllocs
            .filter(
              (a) => a.status === "ACTIVE" && a.processLossRecordId === lr.id
            )
            .reduce((s, a) => roundInternal(s.add(a.allocatedFineWeight)), ZERO)
            .add(
              writeOffs
                .filter(
                  (w) =>
                    w.status === "ACTIVE" && w.processLossRecordId === lr.id
                )
                .reduce(
                  (s, w) => roundInternal(s.add(w.writtenOffFineWeight)),
                  ZERO
                )
            )
            .add(
              makingDeds
                .filter(
                  (m) =>
                    m.status === "ACTIVE" && m.processLossRecordId === lr.id
                )
                .reduce(
                  (s, m) => roundInternal(s.add(m.deductedFineWeight)),
                  ZERO
                )
            )
        );
        const rem = roundInternal(lr.fineEquivalentLossWeight.sub(settled));
        if (rem.gt(ZERO)) {
          outstandingLossFine = roundInternal(outstandingLossFine.add(rem));
          lossItems.push({
            karigarId: lr.karigarId,
            karigarName: kMap.get(lr.karigarId) ?? lr.karigarId,
            processType: lr.processType,
            outstandingFine: rem.toFixed(4),
          });
        }
      }

      const karigarReturnObligations = recoveryReceipts
        .filter((r) => r.status === "POSTED")
        .reduce(
          (s, r) => roundInternal(s.add(r.unallocatedFineWeight)),
          ZERO
        );

      const adminOwnFineTotal = roundInternal(
        adminFineTotal.sub(unusedCustomerGoldCredits)
      );
      const groupCFine = roundInternal(
        wipFineTotal
          .add(fgFineTotal)
          .add(outstandingLossFine)
          .add(deliveredUnbilledFine)
      );
      const totalAccountedGoldFine = roundInternal(
        adminOwnFineTotal.add(customerFineOwed).add(groupCFine)
      );
      const physicalGoldFine = roundInternal(
        adminFineTotal.add(wipFineTotal).add(fgFineTotal)
      );
      const physicalGoldMixed = roundInternal(
        adminPhysicalTotal.add(wipPhysicalTotal).add(fgPhysicalTotal)
      );
      const netTrackedGoldPosition = roundInternal(
        totalAccountedGoldFine.sub(karigarReturnObligations)
      );

      return {
        groupA_adminStock: {
          totalFine: adminOwnFineTotal.toFixed(4),
          mixedPhysical: adminPhysicalTotal.toFixed(3),
          byPurity: adminByPurity,
        },
        groupB_customerGoldOwed: {
          totalFine: customerFineOwed.toFixed(4),
          openBillCount: customerBillItems.length,
          items: customerBillItems,
        },
        groupC_productionAndRecovery: {
          totalFine: groupCFine.toFixed(4),
          wipPhysical: wipPhysicalTotal.toFixed(3),
          wipFine: wipFineTotal.toFixed(4),
          wipOrders: wipItems,
          finishedGoodsPhysical: fgPhysicalTotal.toFixed(3),
          finishedGoodsFine: fgFineTotal.toFixed(4),
          finishedGoodsOrders: fgOrders.map((o) => ({
            orderId: o.id,
            bagNumber: o.bagNumber,
            orderName: o.orderName,
            netWeight: (o.finishedNetMetalWeight ?? ZERO).toFixed(3),
          })),
          outstandingLossFine: outstandingLossFine.toFixed(4),
          outstandingLosses: lossItems,
        },
        totals: {
          totalAccountedGoldFine: totalAccountedGoldFine.toFixed(4),
          physicalGoldFine: physicalGoldFine.toFixed(4),
          physicalGoldMixed: physicalGoldMixed.toFixed(3),
          unusedCustomerGoldCredits: unusedCustomerGoldCredits.toFixed(4),
          karigarReturnObligations: karigarReturnObligations.toFixed(4),
          netTrackedGoldPosition: netTrackedGoldPosition.toFixed(4),
        },
      };
    });
  }
}

