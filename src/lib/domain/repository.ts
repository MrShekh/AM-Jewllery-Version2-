import {
  AuditEventEntity,
  BillSequenceEntity,
  BillShareTokenEntity,
  BillTemplateEntity,
  CustomerBillEntity,
  CustomerBillLineEntity,
  CustomerCashReceiptEntity,
  CustomerEntity,
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

export interface ErpTransactionContext {
  // Purities
  listPurities(organizationId: string): Promise<PurityEntity[]>;
  getPurityById(organizationId: string, id: string): Promise<PurityEntity | null>;
  getPurityByCodeOrLabel(
    organizationId: string,
    code: string,
    displayLabel: string
  ): Promise<PurityEntity | null>;
  createPurity(purity: PurityEntity): Promise<PurityEntity>;

  // Stock Accounts
  listStockAccounts(organizationId: string): Promise<StockAccountEntity[]>;
  getStockAccountByCode(
    organizationId: string,
    accountCode: string
  ): Promise<StockAccountEntity | null>;
  getStockAccountById(
    organizationId: string,
    id: string
  ): Promise<StockAccountEntity | null>;
  createStockAccount(account: StockAccountEntity): Promise<StockAccountEntity>;
  updateStockAccountBalances(
    id: string,
    cachedPhysicalBalance: StockAccountEntity["cachedPhysicalBalance"],
    cachedFineBalance: StockAccountEntity["cachedFineBalance"]
  ): Promise<StockAccountEntity>;

  // Customers
  listCustomers(organizationId: string): Promise<CustomerEntity[]>;
  getCustomerById(
    organizationId: string,
    id: string
  ): Promise<CustomerEntity | null>;
  createCustomer(customer: CustomerEntity): Promise<CustomerEntity>;
  updateCustomer(customer: CustomerEntity): Promise<CustomerEntity>;

  // Karigars
  listKarigars(organizationId: string): Promise<KarigarEntity[]>;
  getKarigarById(
    organizationId: string,
    id: string
  ): Promise<KarigarEntity | null>;
  createKarigar(karigar: KarigarEntity): Promise<KarigarEntity>;
  updateKarigar(karigar: KarigarEntity): Promise<KarigarEntity>;

  // Orders & Processes
  listOrders(organizationId: string): Promise<OrderEntity[]>;
  getOrderById(organizationId: string, id: string): Promise<OrderEntity | null>;
  getOrderByBagNumber(
    organizationId: string,
    bagNumber: string
  ): Promise<OrderEntity | null>;
  createOrder(order: OrderEntity): Promise<OrderEntity>;
  updateOrder(order: OrderEntity): Promise<OrderEntity>;
  deleteOrder(organizationId: string, orderId: string): Promise<void>;

  listOrderProcesses(
    organizationId: string,
    orderId?: string
  ): Promise<OrderProcessEntity[]>;
  getOrderProcessById(
    organizationId: string,
    id: string
  ): Promise<OrderProcessEntity | null>;
  createOrderProcess(process: OrderProcessEntity): Promise<OrderProcessEntity>;
  updateOrderProcess(process: OrderProcessEntity): Promise<OrderProcessEntity>;

  // Process Visits & Movements & Stones & Losses
  listProcessVisits(
    organizationId: string,
    orderId?: string
  ): Promise<ProcessVisitEntity[]>;
  getProcessVisitByIdempotencyKey(
    idempotencyKey: string
  ): Promise<ProcessVisitEntity | null>;
  createProcessVisit(visit: ProcessVisitEntity): Promise<ProcessVisitEntity>;
  updateProcessVisit(visit: ProcessVisitEntity): Promise<ProcessVisitEntity>;

  listMetalMovements(
    organizationId: string,
    orderId?: string
  ): Promise<MetalMovementEntity[]>;
  getMetalMovementByIdempotencyKey(
    idempotencyKey: string
  ): Promise<MetalMovementEntity | null>;
  createMetalMovement(
    movement: MetalMovementEntity
  ): Promise<MetalMovementEntity>;

  listStoneComponentEntries(
    organizationId: string,
    orderId?: string
  ): Promise<StoneComponentEntryEntity[]>;
  createStoneComponentEntry(
    entry: StoneComponentEntryEntity
  ): Promise<StoneComponentEntryEntity>;

  listProcessLossRecords(
    organizationId: string,
    orderId?: string
  ): Promise<ProcessLossRecordEntity[]>;
  getProcessLossRecordById(
    organizationId: string,
    id: string
  ): Promise<ProcessLossRecordEntity | null>;
  createProcessLossRecord(
    record: ProcessLossRecordEntity
  ): Promise<ProcessLossRecordEntity>;
  updateProcessLossRecord(
    record: ProcessLossRecordEntity
  ): Promise<ProcessLossRecordEntity>;

  // Karigar Recovery: Receipts, Lines, Allocations, Write-Offs
  listRecoveryReceipts(
    organizationId: string,
    karigarId?: string
  ): Promise<RecoveryReceiptEntity[]>;
  getRecoveryReceiptById(
    organizationId: string,
    id: string
  ): Promise<RecoveryReceiptEntity | null>;
  getRecoveryReceiptByIdempotencyKey(
    idempotencyKey: string
  ): Promise<RecoveryReceiptEntity | null>;
  createRecoveryReceipt(
    receipt: RecoveryReceiptEntity
  ): Promise<RecoveryReceiptEntity>;
  updateRecoveryReceipt(
    receipt: RecoveryReceiptEntity
  ): Promise<RecoveryReceiptEntity>;

  listRecoveryReceiptLines(
    organizationId: string,
    recoveryReceiptId?: string
  ): Promise<RecoveryReceiptLineEntity[]>;
  createRecoveryReceiptLine(
    line: RecoveryReceiptLineEntity
  ): Promise<RecoveryReceiptLineEntity>;

  listRecoveryAllocations(
    organizationId: string,
    filter?: { recoveryReceiptId?: string; processLossRecordId?: string }
  ): Promise<RecoveryAllocationEntity[]>;
  getRecoveryAllocationById(
    organizationId: string,
    id: string
  ): Promise<RecoveryAllocationEntity | null>;
  getRecoveryAllocationByIdempotencyKey(
    idempotencyKey: string
  ): Promise<RecoveryAllocationEntity | null>;
  createRecoveryAllocation(
    allocation: RecoveryAllocationEntity
  ): Promise<RecoveryAllocationEntity>;
  updateRecoveryAllocation(
    allocation: RecoveryAllocationEntity
  ): Promise<RecoveryAllocationEntity>;

  listLossWriteOffs(
    organizationId: string,
    filter?: { processLossRecordId?: string; karigarId?: string }
  ): Promise<LossWriteOffEntity[]>;
  getLossWriteOffByIdempotencyKey(
    idempotencyKey: string
  ): Promise<LossWriteOffEntity | null>;
  createLossWriteOff(writeOff: LossWriteOffEntity): Promise<LossWriteOffEntity>;
  updateLossWriteOff(writeOff: LossWriteOffEntity): Promise<LossWriteOffEntity>;

  listRecoverySettlements(
    organizationId: string,
    filter?: { karigarId?: string }
  ): Promise<RecoverySettlementEntity[]>;
  getRecoverySettlementById(
    organizationId: string,
    id: string
  ): Promise<RecoverySettlementEntity | null>;
  getRecoverySettlementByIdempotencyKey(
    idempotencyKey: string
  ): Promise<RecoverySettlementEntity | null>;
  createRecoverySettlement(
    settlement: RecoverySettlementEntity
  ): Promise<RecoverySettlementEntity>;
  updateRecoverySettlement(
    settlement: RecoverySettlementEntity
  ): Promise<RecoverySettlementEntity>;

  listMakingDeductionAllocations(
    organizationId: string,
    filter?: {
      recoverySettlementId?: string;
      processLossRecordId?: string;
      karigarId?: string;
    }
  ): Promise<MakingDeductionAllocationEntity[]>;
  createMakingDeductionAllocation(
    deduction: MakingDeductionAllocationEntity
  ): Promise<MakingDeductionAllocationEntity>;
  updateMakingDeductionAllocation(
    deduction: MakingDeductionAllocationEntity
  ): Promise<MakingDeductionAllocationEntity>;

  // Append-Only Journal Transactions & Lines (NO delete methods exist!)
  listJournalTransactions(
    organizationId: string
  ): Promise<JournalTransactionEntity[]>;
  getJournalTransactionById(
    organizationId: string,
    id: string
  ): Promise<JournalTransactionEntity | null>;
  getJournalTransactionByIdempotencyKey(
    idempotencyKey: string
  ): Promise<JournalTransactionEntity | null>;
  createJournalTransaction(
    tx: JournalTransactionEntity
  ): Promise<JournalTransactionEntity>;
  markJournalTransactionReversed(
    id: string
  ): Promise<JournalTransactionEntity>;

  listJournalLines(
    organizationId: string,
    accountId?: string
  ): Promise<JournalLineEntity[]>;
  createJournalLine(line: JournalLineEntity): Promise<JournalLineEntity>;

  // Audit Events
  listAuditEvents(organizationId: string): Promise<AuditEventEntity[]>;
  createAuditEvent(event: AuditEventEntity): Promise<AuditEventEntity>;

  // Billing Sequence & Templates
  allocateNextBillNumber(
    organizationId: string,
    prefix?: string
  ): Promise<string>;
  listBillTemplates(organizationId: string): Promise<BillTemplateEntity[]>;
  getBillTemplateById(
    organizationId: string,
    id: string
  ): Promise<BillTemplateEntity | null>;
  createBillTemplate(
    template: BillTemplateEntity
  ): Promise<BillTemplateEntity>;
  updateBillTemplate(
    template: BillTemplateEntity
  ): Promise<BillTemplateEntity>;

  // Customer Bills & Lines
  listCustomerBills(
    organizationId: string,
    customerId?: string
  ): Promise<CustomerBillEntity[]>;
  getCustomerBillById(
    organizationId: string,
    id: string
  ): Promise<CustomerBillEntity | null>;
  getCustomerBillByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CustomerBillEntity | null>;
  createCustomerBill(bill: CustomerBillEntity): Promise<CustomerBillEntity>;
  updateCustomerBill(bill: CustomerBillEntity): Promise<CustomerBillEntity>;

  listCustomerBillLines(customerBillId: string): Promise<CustomerBillLineEntity[]>;
  listAllCustomerBillLinesForOrg(
    organizationId: string
  ): Promise<CustomerBillLineEntity[]>;
  replaceCustomerBillLines(
    customerBillId: string,
    lines: CustomerBillLineEntity[]
  ): Promise<CustomerBillLineEntity[]>;

  // Customer Gold Receipts & Lines
  listCustomerGoldReceipts(
    organizationId: string,
    customerId?: string
  ): Promise<CustomerGoldReceiptEntity[]>;
  getCustomerGoldReceiptById(
    organizationId: string,
    id: string
  ): Promise<CustomerGoldReceiptEntity | null>;
  getCustomerGoldReceiptByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CustomerGoldReceiptEntity | null>;
  createCustomerGoldReceipt(
    receipt: CustomerGoldReceiptEntity
  ): Promise<CustomerGoldReceiptEntity>;
  updateCustomerGoldReceipt(
    receipt: CustomerGoldReceiptEntity
  ): Promise<CustomerGoldReceiptEntity>;

  listCustomerGoldReceiptLines(
    organizationId: string,
    receiptId?: string
  ): Promise<CustomerGoldReceiptLineEntity[]>;
  createCustomerGoldReceiptLine(
    line: CustomerGoldReceiptLineEntity
  ): Promise<CustomerGoldReceiptLineEntity>;

  // Customer Cash Receipts
  listCustomerCashReceipts(
    organizationId: string,
    customerId?: string
  ): Promise<CustomerCashReceiptEntity[]>;
  getCustomerCashReceiptById(
    organizationId: string,
    id: string
  ): Promise<CustomerCashReceiptEntity | null>;
  getCustomerCashReceiptByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CustomerCashReceiptEntity | null>;
  createCustomerCashReceipt(
    receipt: CustomerCashReceiptEntity
  ): Promise<CustomerCashReceiptEntity>;
  updateCustomerCashReceipt(
    receipt: CustomerCashReceiptEntity
  ): Promise<CustomerCashReceiptEntity>;

  // Customer Payment Allocations
  listCustomerPaymentAllocations(
    organizationId: string,
    filter?: {
      customerId?: string;
      billId?: string;
      goldReceiptId?: string;
      cashReceiptId?: string;
    }
  ): Promise<CustomerPaymentAllocationEntity[]>;
  getCustomerPaymentAllocationById(
    organizationId: string,
    id: string
  ): Promise<CustomerPaymentAllocationEntity | null>;
  getCustomerPaymentAllocationByIdempotencyKey(
    idempotencyKey: string
  ): Promise<CustomerPaymentAllocationEntity | null>;
  createCustomerPaymentAllocation(
    alloc: CustomerPaymentAllocationEntity
  ): Promise<CustomerPaymentAllocationEntity>;
  updateCustomerPaymentAllocation(
    alloc: CustomerPaymentAllocationEntity
  ): Promise<CustomerPaymentAllocationEntity>;

  // Stock Sales
  listStockSales(organizationId: string): Promise<StockSaleEntity[]>;
  getStockSaleById(
    organizationId: string,
    id: string
  ): Promise<StockSaleEntity | null>;
  getStockSaleByIdempotencyKey(
    idempotencyKey: string
  ): Promise<StockSaleEntity | null>;
  createStockSale(sale: StockSaleEntity): Promise<StockSaleEntity>;
  updateStockSale(sale: StockSaleEntity): Promise<StockSaleEntity>;

  // Stock Conversions & Refining
  listStockConversions(organizationId: string): Promise<StockConversionEntity[]>;
  getStockConversionByIdempotencyKey(
    idempotencyKey: string
  ): Promise<StockConversionEntity | null>;
  createStockConversion(
    conversion: StockConversionEntity
  ): Promise<StockConversionEntity>;

  // Bill Share Tokens
  listBillShareTokens(
    organizationId: string,
    billId?: string
  ): Promise<BillShareTokenEntity[]>;
  getBillShareTokenByToken(token: string): Promise<BillShareTokenEntity | null>;
  createBillShareToken(
    token: BillShareTokenEntity
  ): Promise<BillShareTokenEntity>;
  updateBillShareToken(
    token: BillShareTokenEntity
  ): Promise<BillShareTokenEntity>;

  // Organization Customer Fine Config & Concurrency Lock
  getOrganizationCustomerFineConfig(
    organizationId: string
  ): Promise<OrganizationCustomerFineConfigEntity>;
  updateOrganizationCustomerFineConfig(
    config: OrganizationCustomerFineConfigEntity
  ): Promise<OrganizationCustomerFineConfigEntity>;
  lockCustomerForUpdate(
    organizationId: string,
    customerId: string
  ): Promise<void>;
}

export interface ErpRepository {
  runInTransaction<T>(
    fn: (tx: ErpTransactionContext) => Promise<T>
  ): Promise<T>;
}

interface StoreSnapshot {
  purities: Map<string, PurityEntity>;
  stockAccounts: Map<string, StockAccountEntity>;
  customers: Map<string, CustomerEntity>;
  karigars: Map<string, KarigarEntity>;
  orders: Map<string, OrderEntity>;
  orderProcesses: Map<string, OrderProcessEntity>;
  processVisits: Map<string, ProcessVisitEntity>;
  metalMovements: Map<string, MetalMovementEntity>;
  stoneComponentEntries: Map<string, StoneComponentEntryEntity>;
  processLossRecords: Map<string, ProcessLossRecordEntity>;
  journalTransactions: Map<string, JournalTransactionEntity>;
  journalLines: Map<string, JournalLineEntity>;
  auditEvents: Map<string, AuditEventEntity>;
  recoveryReceipts: Map<string, RecoveryReceiptEntity>;
  recoveryReceiptLines: Map<string, RecoveryReceiptLineEntity>;
  recoveryAllocations: Map<string, RecoveryAllocationEntity>;
  lossWriteOffs: Map<string, LossWriteOffEntity>;
  recoverySettlements: Map<string, RecoverySettlementEntity>;
  makingDeductionAllocations: Map<string, MakingDeductionAllocationEntity>;
  billSequences: Map<string, BillSequenceEntity>;
  billTemplates: Map<string, BillTemplateEntity>;
  customerBills: Map<string, CustomerBillEntity>;
  customerBillLines: Map<string, CustomerBillLineEntity>;
  customerGoldReceipts: Map<string, CustomerGoldReceiptEntity>;
  customerGoldReceiptLines: Map<string, CustomerGoldReceiptLineEntity>;
  customerCashReceipts: Map<string, CustomerCashReceiptEntity>;
  customerPaymentAllocations: Map<string, CustomerPaymentAllocationEntity>;
  stockSales: Map<string, StockSaleEntity>;
  stockConversions: Map<string, StockConversionEntity>;
  billShareTokens: Map<string, BillShareTokenEntity>;
  orgCustomerFineConfigs: Map<string, OrganizationCustomerFineConfigEntity>;
}

function cloneMap<T extends object>(map: Map<string, T>): Map<string, T> {
  const next = new Map<string, T>();
  for (const [k, v] of map.entries()) {
    next.set(k, { ...v });
  }
  return next;
}

/**
 * Serializable transactional in-memory repository used for deterministic
 * automated acceptance tests when a live PostgreSQL server is not attached.
 * Implements a strict mutex queue and full snapshot rollback on any error.
 */
export class InMemoryTransactionalRepository implements ErpRepository {
  private state: StoreSnapshot = {
    purities: new Map(),
    stockAccounts: new Map(),
    customers: new Map(),
    karigars: new Map(),
    orders: new Map(),
    orderProcesses: new Map(),
    processVisits: new Map(),
    metalMovements: new Map(),
    stoneComponentEntries: new Map(),
    processLossRecords: new Map(),
    journalTransactions: new Map(),
    journalLines: new Map(),
    auditEvents: new Map(),
    recoveryReceipts: new Map(),
    recoveryReceiptLines: new Map(),
    recoveryAllocations: new Map(),
    lossWriteOffs: new Map(),
    recoverySettlements: new Map(),
    makingDeductionAllocations: new Map(),
    billSequences: new Map(),
    billTemplates: new Map(),
    customerBills: new Map(),
    customerBillLines: new Map(),
    customerGoldReceipts: new Map(),
    customerGoldReceiptLines: new Map(),
    customerCashReceipts: new Map(),
    customerPaymentAllocations: new Map(),
    stockSales: new Map(),
    stockConversions: new Map(),
    billShareTokens: new Map(),
    orgCustomerFineConfigs: new Map(),
  };

  private mutexQueue: Promise<unknown> = Promise.resolve();

  public async runInTransaction<T>(
    fn: (tx: ErpTransactionContext) => Promise<T>
  ): Promise<T> {
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.mutexQueue;
    this.mutexQueue = prev.then(() => lock);
    await prev;

    const backup: StoreSnapshot = {
      purities: cloneMap(this.state.purities),
      stockAccounts: cloneMap(this.state.stockAccounts),
      customers: cloneMap(this.state.customers),
      karigars: cloneMap(this.state.karigars),
      orders: cloneMap(this.state.orders),
      orderProcesses: cloneMap(this.state.orderProcesses),
      processVisits: cloneMap(this.state.processVisits),
      metalMovements: cloneMap(this.state.metalMovements),
      stoneComponentEntries: cloneMap(this.state.stoneComponentEntries),
      processLossRecords: cloneMap(this.state.processLossRecords),
      journalTransactions: cloneMap(this.state.journalTransactions),
      journalLines: cloneMap(this.state.journalLines),
      auditEvents: cloneMap(this.state.auditEvents),
      recoveryReceipts: cloneMap(this.state.recoveryReceipts),
      recoveryReceiptLines: cloneMap(this.state.recoveryReceiptLines),
      recoveryAllocations: cloneMap(this.state.recoveryAllocations),
      lossWriteOffs: cloneMap(this.state.lossWriteOffs),
      recoverySettlements: cloneMap(this.state.recoverySettlements),
      makingDeductionAllocations: cloneMap(this.state.makingDeductionAllocations),
      billSequences: cloneMap(this.state.billSequences),
      billTemplates: cloneMap(this.state.billTemplates),
      customerBills: cloneMap(this.state.customerBills),
      customerBillLines: cloneMap(this.state.customerBillLines),
      customerGoldReceipts: cloneMap(this.state.customerGoldReceipts),
      customerGoldReceiptLines: cloneMap(this.state.customerGoldReceiptLines),
      customerCashReceipts: cloneMap(this.state.customerCashReceipts),
      customerPaymentAllocations: cloneMap(this.state.customerPaymentAllocations),
      stockSales: cloneMap(this.state.stockSales),
      stockConversions: cloneMap(this.state.stockConversions),
      billShareTokens: cloneMap(this.state.billShareTokens),
      orgCustomerFineConfigs: cloneMap(this.state.orgCustomerFineConfigs),
    };

    try {
      const ctx = this.createContext(this.state);
      const result = await fn(ctx);
      return result;
    } catch (err) {
      this.state = backup;
      throw err;
    } finally {
      release();
    }
  }

  private createContext(s: StoreSnapshot): ErpTransactionContext {
    return {
      listPurities: async (orgId) =>
        Array.from(s.purities.values())
          .filter((p) => p.organizationId === orgId)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      getPurityById: async (orgId, id) => {
        const p = s.purities.get(id);
        return p && p.organizationId === orgId ? { ...p } : null;
      },
      getPurityByCodeOrLabel: async (orgId, code, label) => {
        for (const p of s.purities.values()) {
          if (
            p.organizationId === orgId &&
            (p.code.toLowerCase() === code.toLowerCase() ||
              p.displayLabel.toLowerCase() === label.toLowerCase())
          ) {
            return { ...p };
          }
        }
        return null;
      },
      createPurity: async (purity) => {
        s.purities.set(purity.id, { ...purity });
        return { ...purity };
      },

      listStockAccounts: async (orgId) =>
        Array.from(s.stockAccounts.values()).filter(
          (a) => a.organizationId === orgId
        ),
      getStockAccountByCode: async (orgId, accountCode) => {
        for (const a of s.stockAccounts.values()) {
          if (a.organizationId === orgId && a.accountCode === accountCode) {
            return { ...a };
          }
        }
        return null;
      },
      getStockAccountById: async (orgId, id) => {
        const a = s.stockAccounts.get(id);
        return a && a.organizationId === orgId ? { ...a } : null;
      },
      createStockAccount: async (account) => {
        s.stockAccounts.set(account.id, { ...account });
        return { ...account };
      },
      updateStockAccountBalances: async (id, phys, fine) => {
        const existing = s.stockAccounts.get(id);
        if (!existing) throw new Error(`Stock account ${id} not found`);
        const updated: StockAccountEntity = {
          ...existing,
          cachedPhysicalBalance: phys,
          cachedFineBalance: fine,
          updatedAt: new Date(),
        };
        s.stockAccounts.set(id, updated);
        return { ...updated };
      },

      listCustomers: async (orgId) =>
        Array.from(s.customers.values())
          .filter((c) => c.organizationId === orgId)
          .sort((a, b) => a.name.localeCompare(b.name)),
      getCustomerById: async (orgId, id) => {
        const c = s.customers.get(id);
        return c && c.organizationId === orgId ? { ...c } : null;
      },
      createCustomer: async (customer) => {
        s.customers.set(customer.id, { ...customer });
        return { ...customer };
      },
      updateCustomer: async (customer) => {
        s.customers.set(customer.id, { ...customer });
        return { ...customer };
      },

      listKarigars: async (orgId) =>
        Array.from(s.karigars.values())
          .filter((k) => k.organizationId === orgId)
          .sort((a, b) => a.karigarCode.localeCompare(b.karigarCode)),
      getKarigarById: async (orgId, id) => {
        const k = s.karigars.get(id);
        return k && k.organizationId === orgId
          ? { ...k, capabilities: [...k.capabilities] }
          : null;
      },
      createKarigar: async (karigar) => {
        s.karigars.set(karigar.id, {
          ...karigar,
          capabilities: [...karigar.capabilities],
        });
        return { ...karigar };
      },
      updateKarigar: async (karigar) => {
        s.karigars.set(karigar.id, {
          ...karigar,
          capabilities: [...karigar.capabilities],
        });
        return { ...karigar };
      },

      listOrders: async (orgId) =>
        Array.from(s.orders.values())
          .filter((o) => o.organizationId === orgId)
          .sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime()),
      getOrderById: async (orgId, id) => {
        const o = s.orders.get(id);
        return o && o.organizationId === orgId ? { ...o } : null;
      },
      getOrderByBagNumber: async (orgId, bagNumber) => {
        for (const o of s.orders.values()) {
          if (
            o.organizationId === orgId &&
            o.bagNumber.toLowerCase() === bagNumber.toLowerCase()
          ) {
            return { ...o };
          }
        }
        return null;
      },
      createOrder: async (order) => {
        s.orders.set(order.id, { ...order });
        return { ...order };
      },
      updateOrder: async (order) => {
        s.orders.set(order.id, { ...order });
        return { ...order };
      },
      deleteOrder: async (orgId, orderId) => {
        const o = s.orders.get(orderId);
        if (!o || o.organizationId !== orgId) return;
        for (const [id, jtx] of s.journalTransactions.entries()) {
          if (jtx.orderId === orderId) {
            s.journalTransactions.set(id, {
              ...jtx,
              orderId: null,
              orderProcessId: null,
              processVisitId: null,
            });
          }
        }
        for (const [id, jl] of s.journalLines.entries()) {
          if (jl.orderId === orderId) {
            s.journalLines.set(id, {
              ...jl,
              orderId: null,
              orderProcessId: null,
            });
          }
        }
        for (const [id, lr] of s.processLossRecords.entries()) {
          if (lr.orderId === orderId) s.processLossRecords.delete(id);
        }
        for (const [id, sc] of s.stoneComponentEntries.entries()) {
          if (sc.orderId === orderId) s.stoneComponentEntries.delete(id);
        }
        for (const [id, mm] of s.metalMovements.entries()) {
          if (mm.orderId === orderId) s.metalMovements.delete(id);
        }
        for (const [id, pv] of s.processVisits.entries()) {
          if (pv.orderId === orderId) s.processVisits.delete(id);
        }
        for (const [id, op] of s.orderProcesses.entries()) {
          if (op.orderId === orderId) s.orderProcesses.delete(id);
        }
        s.orders.delete(orderId);
      },

      listOrderProcesses: async (orgId, orderId) =>
        Array.from(s.orderProcesses.values())
          .filter(
            (p) =>
              p.organizationId === orgId && (!orderId || p.orderId === orderId)
          )
          .sort((a, b) => a.canonicalSequence - b.canonicalSequence),
      getOrderProcessById: async (orgId, id) => {
        const p = s.orderProcesses.get(id);
        return p && p.organizationId === orgId ? { ...p } : null;
      },
      createOrderProcess: async (process) => {
        s.orderProcesses.set(process.id, { ...process });
        return { ...process };
      },
      updateOrderProcess: async (process) => {
        s.orderProcesses.set(process.id, { ...process });
        return { ...process };
      },

      listProcessVisits: async (orgId, orderId) =>
        Array.from(s.processVisits.values())
          .filter(
            (v) =>
              v.organizationId === orgId && (!orderId || v.orderId === orderId)
          )
          .sort((a, b) => a.visitNumber - b.visitNumber),
      getProcessVisitByIdempotencyKey: async (key) => {
        for (const v of s.processVisits.values()) {
          if (v.idempotencyKey === key) return { ...v };
        }
        return null;
      },
      createProcessVisit: async (visit) => {
        s.processVisits.set(visit.id, { ...visit });
        return { ...visit };
      },
      updateProcessVisit: async (visit) => {
        s.processVisits.set(visit.id, { ...visit });
        return { ...visit };
      },

      listMetalMovements: async (orgId, orderId) =>
        Array.from(s.metalMovements.values())
          .filter(
            (m) =>
              m.organizationId === orgId && (!orderId || m.orderId === orderId)
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      getMetalMovementByIdempotencyKey: async (key) => {
        for (const m of s.metalMovements.values()) {
          if (m.idempotencyKey === key) return { ...m };
        }
        return null;
      },
      createMetalMovement: async (movement) => {
        s.metalMovements.set(movement.id, { ...movement });
        return { ...movement };
      },

      listStoneComponentEntries: async (orgId, orderId) =>
        Array.from(s.stoneComponentEntries.values()).filter(
          (e) =>
            e.organizationId === orgId && (!orderId || e.orderId === orderId)
        ),
      createStoneComponentEntry: async (entry) => {
        s.stoneComponentEntries.set(entry.id, { ...entry });
        return { ...entry };
      },

      listProcessLossRecords: async (orgId, orderId) =>
        Array.from(s.processLossRecords.values()).filter(
          (r) =>
            r.organizationId === orgId && (!orderId || r.orderId === orderId)
        ),
      getProcessLossRecordById: async (orgId, id) => {
        const r = s.processLossRecords.get(id);
        return r && r.organizationId === orgId ? { ...r } : null;
      },
      createProcessLossRecord: async (record) => {
        s.processLossRecords.set(record.id, { ...record });
        return { ...record };
      },
      updateProcessLossRecord: async (record) => {
        s.processLossRecords.set(record.id, { ...record });
        return { ...record };
      },

      listRecoveryReceipts: async (orgId, karigarId) =>
        Array.from(s.recoveryReceipts.values())
          .filter(
            (r) =>
              r.organizationId === orgId &&
              (!karigarId || r.karigarId === karigarId)
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      getRecoveryReceiptById: async (orgId, id) => {
        const r = s.recoveryReceipts.get(id);
        return r && r.organizationId === orgId ? { ...r } : null;
      },
      getRecoveryReceiptByIdempotencyKey: async (key) => {
        for (const r of s.recoveryReceipts.values()) {
          if (r.idempotencyKey === key) return { ...r };
        }
        return null;
      },
      createRecoveryReceipt: async (receipt) => {
        s.recoveryReceipts.set(receipt.id, { ...receipt });
        return { ...receipt };
      },
      updateRecoveryReceipt: async (receipt) => {
        s.recoveryReceipts.set(receipt.id, { ...receipt });
        return { ...receipt };
      },

      listRecoveryReceiptLines: async (orgId, recoveryReceiptId) =>
        Array.from(s.recoveryReceiptLines.values()).filter(
          (l) =>
            l.organizationId === orgId &&
            (!recoveryReceiptId || l.recoveryReceiptId === recoveryReceiptId)
        ),
      createRecoveryReceiptLine: async (line) => {
        s.recoveryReceiptLines.set(line.id, { ...line });
        return { ...line };
      },

      listRecoveryAllocations: async (orgId, filter) =>
        Array.from(s.recoveryAllocations.values())
          .filter(
            (a) =>
              a.organizationId === orgId &&
              (!filter?.recoveryReceiptId ||
                a.recoveryReceiptId === filter.recoveryReceiptId) &&
              (!filter?.processLossRecordId ||
                a.processLossRecordId === filter.processLossRecordId)
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      getRecoveryAllocationById: async (orgId, id) => {
        const a = s.recoveryAllocations.get(id);
        return a && a.organizationId === orgId ? { ...a } : null;
      },
      getRecoveryAllocationByIdempotencyKey: async (key) => {
        for (const a of s.recoveryAllocations.values()) {
          if (a.idempotencyKey === key) return { ...a };
        }
        return null;
      },
      createRecoveryAllocation: async (alloc) => {
        s.recoveryAllocations.set(alloc.id, { ...alloc });
        return { ...alloc };
      },
      updateRecoveryAllocation: async (alloc) => {
        s.recoveryAllocations.set(alloc.id, { ...alloc });
        return { ...alloc };
      },

      listLossWriteOffs: async (orgId, filter) =>
        Array.from(s.lossWriteOffs.values())
          .filter(
            (w) =>
              w.organizationId === orgId &&
              (!filter?.processLossRecordId ||
                w.processLossRecordId === filter.processLossRecordId) &&
              (!filter?.karigarId || w.karigarId === filter.karigarId)
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      getLossWriteOffByIdempotencyKey: async (key) => {
        for (const w of s.lossWriteOffs.values()) {
          if (w.idempotencyKey === key) return { ...w };
        }
        return null;
      },
      createLossWriteOff: async (writeOff) => {
        s.lossWriteOffs.set(writeOff.id, { ...writeOff });
        return { ...writeOff };
      },
      updateLossWriteOff: async (writeOff) => {
        s.lossWriteOffs.set(writeOff.id, { ...writeOff });
        return { ...writeOff };
      },

      listRecoverySettlements: async (orgId, filter) =>
        Array.from(s.recoverySettlements.values())
          .filter(
            (st) =>
              st.organizationId === orgId &&
              (!filter?.karigarId || st.karigarId === filter.karigarId)
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      getRecoverySettlementById: async (orgId, id) => {
        const st = s.recoverySettlements.get(id);
        return st && st.organizationId === orgId ? { ...st } : null;
      },
      getRecoverySettlementByIdempotencyKey: async (key) => {
        for (const st of s.recoverySettlements.values()) {
          if (st.idempotencyKey === key) return { ...st };
        }
        return null;
      },
      createRecoverySettlement: async (settlement) => {
        s.recoverySettlements.set(settlement.id, { ...settlement });
        return { ...settlement };
      },
      updateRecoverySettlement: async (settlement) => {
        s.recoverySettlements.set(settlement.id, { ...settlement });
        return { ...settlement };
      },

      listMakingDeductionAllocations: async (orgId, filter) =>
        Array.from(s.makingDeductionAllocations.values())
          .filter(
            (d) =>
              d.organizationId === orgId &&
              (!filter?.recoverySettlementId ||
                d.recoverySettlementId === filter.recoverySettlementId) &&
              (!filter?.processLossRecordId ||
                d.processLossRecordId === filter.processLossRecordId) &&
              (!filter?.karigarId || d.karigarId === filter.karigarId)
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      createMakingDeductionAllocation: async (deduction) => {
        s.makingDeductionAllocations.set(deduction.id, { ...deduction });
        return { ...deduction };
      },
      updateMakingDeductionAllocation: async (deduction) => {
        s.makingDeductionAllocations.set(deduction.id, { ...deduction });
        return { ...deduction };
      },

      listJournalTransactions: async (orgId) =>
        Array.from(s.journalTransactions.values())
          .filter((t) => t.organizationId === orgId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      getJournalTransactionById: async (orgId, id) => {
        const t = s.journalTransactions.get(id);
        return t && t.organizationId === orgId ? { ...t } : null;
      },
      getJournalTransactionByIdempotencyKey: async (key) => {
        for (const t of s.journalTransactions.values()) {
          if (t.idempotencyKey === key) return { ...t };
        }
        return null;
      },
      createJournalTransaction: async (tx) => {
        s.journalTransactions.set(tx.id, { ...tx });
        return { ...tx };
      },
      markJournalTransactionReversed: async (id) => {
        const existing = s.journalTransactions.get(id);
        if (!existing) throw new Error(`Transaction ${id} not found`);
        const updated = { ...existing, isReversed: true };
        s.journalTransactions.set(id, updated);
        return { ...updated };
      },

      listJournalLines: async (orgId, accountId) =>
        Array.from(s.journalLines.values()).filter(
          (l) =>
            l.organizationId === orgId &&
            (!accountId || l.accountId === accountId)
        ),
      createJournalLine: async (line) => {
        s.journalLines.set(line.id, { ...line });
        return { ...line };
      },

      listAuditEvents: async (orgId) =>
        Array.from(s.auditEvents.values())
          .filter((e) => e.organizationId === orgId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      createAuditEvent: async (event) => {
        s.auditEvents.set(event.id, { ...event });
        return { ...event };
      },

      allocateNextBillNumber: async (orgId, prefix = "INV") => {
        const seq = s.billSequences.get(orgId) ?? {
          organizationId: orgId,
          prefix,
          nextNumber: 1,
          updatedAt: new Date(),
        };
        const num = seq.nextNumber;
        s.billSequences.set(orgId, {
          ...seq,
          nextNumber: num + 1,
          updatedAt: new Date(),
        });
        return `${seq.prefix}-${String(num).padStart(4, "0")}`;
      },
      listBillTemplates: async (orgId) =>
        Array.from(s.billTemplates.values())
          .filter((t) => t.organizationId === orgId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      getBillTemplateById: async (orgId, id) => {
        const t = s.billTemplates.get(id);
        return t && t.organizationId === orgId ? { ...t } : null;
      },
      createBillTemplate: async (tpl) => {
        s.billTemplates.set(tpl.id, { ...tpl });
        return { ...tpl };
      },
      updateBillTemplate: async (tpl) => {
        s.billTemplates.set(tpl.id, { ...tpl });
        return { ...tpl };
      },

      listCustomerBills: async (orgId, customerId) =>
        Array.from(s.customerBills.values())
          .filter(
            (b) =>
              b.organizationId === orgId &&
              (!customerId || b.customerId === customerId)
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      getCustomerBillById: async (orgId, id) => {
        const b = s.customerBills.get(id);
        return b && b.organizationId === orgId ? { ...b } : null;
      },
      getCustomerBillByIdempotencyKey: async (key) => {
        for (const b of s.customerBills.values()) {
          if (b.idempotencyKey === key) return { ...b };
        }
        return null;
      },
      createCustomerBill: async (bill) => {
        s.customerBills.set(bill.id, { ...bill });
        return { ...bill };
      },
      updateCustomerBill: async (bill) => {
        s.customerBills.set(bill.id, { ...bill });
        return { ...bill };
      },

      listCustomerBillLines: async (billId) =>
        Array.from(s.customerBillLines.values()).filter(
          (l) => l.customerBillId === billId
        ),
      listAllCustomerBillLinesForOrg: async (orgId) => {
        const billIds = new Set(
          Array.from(s.customerBills.values())
            .filter((b) => b.organizationId === orgId)
            .map((b) => b.id)
        );
        return Array.from(s.customerBillLines.values()).filter((l) =>
          billIds.has(l.customerBillId)
        );
      },
      replaceCustomerBillLines: async (billId, lines) => {
        for (const [id, line] of s.customerBillLines.entries()) {
          if (line.customerBillId === billId) {
            s.customerBillLines.delete(id);
          }
        }
        for (const l of lines) {
          s.customerBillLines.set(l.id, { ...l });
        }
        return lines.map((l) => ({ ...l }));
      },

      listCustomerGoldReceipts: async (orgId, customerId) =>
        Array.from(s.customerGoldReceipts.values())
          .filter(
            (r) =>
              r.organizationId === orgId &&
              (!customerId || r.customerId === customerId)
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      getCustomerGoldReceiptById: async (orgId, id) => {
        const r = s.customerGoldReceipts.get(id);
        return r && r.organizationId === orgId ? { ...r } : null;
      },
      getCustomerGoldReceiptByIdempotencyKey: async (key) => {
        for (const r of s.customerGoldReceipts.values()) {
          if (r.idempotencyKey === key) return { ...r };
        }
        return null;
      },
      createCustomerGoldReceipt: async (receipt) => {
        s.customerGoldReceipts.set(receipt.id, { ...receipt });
        return { ...receipt };
      },
      updateCustomerGoldReceipt: async (receipt) => {
        s.customerGoldReceipts.set(receipt.id, { ...receipt });
        return { ...receipt };
      },

      listCustomerGoldReceiptLines: async (orgId, receiptId) =>
        Array.from(s.customerGoldReceiptLines.values()).filter(
          (l) =>
            l.organizationId === orgId &&
            (!receiptId || l.receiptId === receiptId)
        ),
      createCustomerGoldReceiptLine: async (line) => {
        s.customerGoldReceiptLines.set(line.id, { ...line });
        return { ...line };
      },

      listCustomerCashReceipts: async (orgId, customerId) =>
        Array.from(s.customerCashReceipts.values())
          .filter(
            (r) =>
              r.organizationId === orgId &&
              (!customerId || r.customerId === customerId)
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      getCustomerCashReceiptById: async (orgId, id) => {
        const r = s.customerCashReceipts.get(id);
        return r && r.organizationId === orgId ? { ...r } : null;
      },
      getCustomerCashReceiptByIdempotencyKey: async (key) => {
        for (const r of s.customerCashReceipts.values()) {
          if (r.idempotencyKey === key) return { ...r };
        }
        return null;
      },
      createCustomerCashReceipt: async (receipt) => {
        s.customerCashReceipts.set(receipt.id, { ...receipt });
        return { ...receipt };
      },
      updateCustomerCashReceipt: async (receipt) => {
        s.customerCashReceipts.set(receipt.id, { ...receipt });
        return { ...receipt };
      },

      listCustomerPaymentAllocations: async (orgId, filter) =>
        Array.from(s.customerPaymentAllocations.values())
          .filter(
            (a) =>
              a.organizationId === orgId &&
              (!filter?.customerId || a.customerId === filter.customerId) &&
              (!filter?.billId || a.billId === filter.billId) &&
              (!filter?.goldReceiptId ||
                a.goldReceiptId === filter.goldReceiptId) &&
              (!filter?.cashReceiptId ||
                a.cashReceiptId === filter.cashReceiptId)
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      getCustomerPaymentAllocationById: async (orgId, id) => {
        const a = s.customerPaymentAllocations.get(id);
        return a && a.organizationId === orgId ? { ...a } : null;
      },
      getCustomerPaymentAllocationByIdempotencyKey: async (key) => {
        for (const a of s.customerPaymentAllocations.values()) {
          if (a.idempotencyKey === key) return { ...a };
        }
        return null;
      },
      createCustomerPaymentAllocation: async (alloc) => {
        s.customerPaymentAllocations.set(alloc.id, { ...alloc });
        return { ...alloc };
      },
      updateCustomerPaymentAllocation: async (alloc) => {
        s.customerPaymentAllocations.set(alloc.id, { ...alloc });
        return { ...alloc };
      },

      listStockSales: async (orgId) =>
        Array.from(s.stockSales.values())
          .filter((x) => x.organizationId === orgId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      getStockSaleById: async (orgId, id) => {
        const x = s.stockSales.get(id);
        return x && x.organizationId === orgId ? { ...x } : null;
      },
      getStockSaleByIdempotencyKey: async (key) => {
        for (const x of s.stockSales.values()) {
          if (x.idempotencyKey === key) return { ...x };
        }
        return null;
      },
      createStockSale: async (sale) => {
        s.stockSales.set(sale.id, { ...sale });
        return { ...sale };
      },
      updateStockSale: async (sale) => {
        s.stockSales.set(sale.id, { ...sale });
        return { ...sale };
      },

      listStockConversions: async (orgId) =>
        Array.from(s.stockConversions.values())
          .filter((x) => x.organizationId === orgId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      getStockConversionByIdempotencyKey: async (key) => {
        for (const x of s.stockConversions.values()) {
          if (x.idempotencyKey === key) return { ...x };
        }
        return null;
      },
      createStockConversion: async (conversion) => {
        s.stockConversions.set(conversion.id, { ...conversion });
        return { ...conversion };
      },

      listBillShareTokens: async (orgId, billId) =>
        Array.from(s.billShareTokens.values())
          .filter(
            (t) =>
              t.organizationId === orgId && (!billId || t.billId === billId)
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      getBillShareTokenByToken: async (token) => {
        for (const t of s.billShareTokens.values()) {
          if (t.token === token) return { ...t };
        }
        return null;
      },
      createBillShareToken: async (token) => {
        s.billShareTokens.set(token.id, { ...token });
        return { ...token };
      },
      updateBillShareToken: async (token) => {
        s.billShareTokens.set(token.id, { ...token });
        return { ...token };
      },

      getOrganizationCustomerFineConfig: async (orgId) => {
        const existing = s.orgCustomerFineConfigs.get(orgId);
        if (existing) return { ...existing };
        return {
          organizationId: orgId,
          customerFineReceiptMode: "UNCONFIGURED",
          customerFineConfiguredTouch: null,
          customerFineAccountPurityId: null,
        };
      },
      updateOrganizationCustomerFineConfig: async (config) => {
        s.orgCustomerFineConfigs.set(config.organizationId, { ...config });
        return { ...config };
      },
      lockCustomerForUpdate: async () => {
        // Serialized by mutexQueue in InMemoryTransactionalRepository
      },
    };
  }
}

