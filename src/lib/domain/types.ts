import Decimal from "decimal.js";

export type UserRole = "OWNER_ADMIN" | "OPERATOR";

export type ProcessType =
  | "FILING"
  | "FREE_POLISH"
  | "SETTING"
  | "FINAL_POLISH";

export const CANONICAL_PROCESS_SEQUENCE: readonly ProcessType[] = [
  "FILING",
  "FREE_POLISH",
  "SETTING",
  "FINAL_POLISH",
] as const;

export const PROCESS_DISPLAY_LABELS: Record<ProcessType, string> = {
  FILING: "Filing",
  FREE_POLISH: "Free Polish",
  SETTING: "Setting",
  FINAL_POLISH: "Final Polish",
};

export type OrderStatus =
  | "DRAFT"
  | "CREATED"
  | "IN_PROCESS"
  | "COMPLETED"
  | "CANCELLED"
  | "CANCELLATION_PENDING_RECONCILIATION";

export type OrderProcessStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "PARTIAL_RETURN"
  | "CLOSED";

export type ProcessVisitStatus = "OPEN" | "PARTIAL" | "CLOSED" | "REVERSED";

export type StoneDirection = "ADDED" | "RETAINED" | "REMOVED_LOST";

export type LossEligibilityStatus =
  | "PENDING_ORDER_COMPLETION"
  | "ELIGIBLE"
  | "VOIDED";

export type StockAccountType =
  | "OPENING_EQUITY"
  | "EXTERNAL_SUPPLIER_INFLOW"
  | "ADMIN_KARAT_POOL"
  | "KARIGAR_CUSTODY"
  | "FINISHED_GOODS"
  | "CUSTOMER_DELIVERED"
  | "PROCESS_LOSS";

export type JournalTransactionType =
  | "OPENING_BALANCE"
  | "STOCK_RECEIPT"
  | "STOCK_RECEIPT_REVERSAL"
  | "ORDER_METAL_ISSUE"
  | "PROCESS_CUSTODY_TRANSFER"
  | "PROCESS_LOSS_RECOGNITION"
  | "ORDER_COMPLETION_FINISHED_GOODS"
  | "CONTROLLED_REVERSAL"
  | "KARIGAR_RECOVERY_RECEIPT"
  | "KARIGAR_RECOVERY_RECEIPT_REVERSAL"
  | "KARIGAR_RECOVERY_REFUND"
  | "BILL_POST_AND_DELIVER"
  | "BILL_CANCELLATION_REVERSAL"
  | "CUSTOMER_GOLD_RECEIPT"
  | "CUSTOMER_GOLD_RECEIPT_REVERSAL"
  | "CUSTOMER_GOLD_REFUND"
  | "STOCK_SALE"
  | "STOCK_SALE_REVERSAL"
  | "PURITY_CONVERSION"
  | "REFINING_BATCH"
  | "FILING_UNUSED_RETURN"
  | "FILING_CORRECTION"
  | "CUSTOMER_CASH_RECEIPT_REVERSAL"
  | "EXTRA_METAL_RETURN";

export type RecoveryReceiptStatus = "POSTED" | "REVERSED";
export type RecoveryAllocationStatus = "ACTIVE" | "UNDONE" | "REVERSED_WITH_RECEIPT";
export type LossWriteOffStatus = "ACTIVE" | "REVERSED";

export type OrderDeliveryStatus = "NOT_DELIVERED" | "DELIVERED" | "RETURNED";
export type OrderBillingStatus = "UNBILLED" | "BILLED" | "REVERSED";
export type BillType = "ORDER_DELIVERY" | "MANUAL_COMMERCIAL";
export type BillStatus = "DRAFT" | "POSTED" | "CANCELLED";
export type BillDeliveryStatus = "NOT_DELIVERED" | "DELIVERED" | "REVERSED";
export type BillSettlementStatus = "UNPAID" | "PARTIALLY_SETTLED" | "SETTLED";
export type BillingBasis = "NET_METAL" | "GROSS_WEIGHT" | "MANUAL";
export type BillLineType =
  | "ORDER_LINE"
  | "MANUAL_SERVICE"
  | "MANUAL_FINE_CHARGE"
  | "MANUAL_STONE_INR"
  | "MANUAL_DISCOUNT";
export type CustomerReceiptStatus = "POSTED" | "REVERSED";
export type CustomerAllocationStatus =
  | "ACTIVE"
  | "UNDONE"
  | "REVERSED_WITH_RECEIPT"
  | "RELEASED_ON_BILL_CANCEL";

export type JournalLineDirection = "DEBIT_IN" | "CREDIT_OUT";

export type MetalMovementType =
  | "ADMIN_ISSUE_TO_ORDER"
  | "PROCESS_TRANSFER"
  | "KARIGAR_PARTIAL_RETURN"
  | "KARIGAR_FINAL_RETURN"
  | "ADDITIONAL_ADMIN_ISSUE"
  | "RETURN_TO_ADMIN_STOCK"
  | "FINISHED_GOODS_COMPLETION"
  | "CUSTOMER_DELIVERY"
  | "REVERSAL"
  | "FILING_UNUSED_RETURN"
  | "FILING_CORRECTION"
  | "EXTRA_METAL_RETURN";

export interface ActorContext {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  name?: string;
}

export interface PurityEntity {
  id: string;
  organizationId: string;
  code: string;
  displayLabel: string;
  karatLabel: string;
  touchPercent: Decimal;
  isFineCategory: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockAccountEntity {
  id: string;
  organizationId: string;
  accountCode: string;
  name: string;
  accountType: StockAccountType;
  purityId: string | null;
  karigarId: string | null;
  cachedPhysicalBalance: Decimal;
  cachedFineBalance: Decimal;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerEntity {
  id: string;
  organizationId: string;
  customerCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface KarigarEntity {
  id: string;
  organizationId: string;
  karigarCode: string;
  name: string;
  phone: string | null;
  specializationNotes: string | null;
  isActive: boolean;
  capabilities: ProcessType[];
  defaultForProcesses?: ProcessType[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdDetailItem {
  id: string;
  adSize: string;
  adPieces: number;
}

export interface OrderEntity {
  id: string;
  organizationId: string;
  bagNumber: string;
  customerId: string;
  orderName: string;
  photoUrl: string | null;
  purityId: string;
  touchSnapshot: Decimal;
  targetWeight: Decimal | null;
  size: string | null;
  orderDate: Date;
  dueDate: Date | null;
  notes: string | null;
  adDetailsJson: string | null;
  status: OrderStatus;
  initialIssuedMetalWeight: Decimal;
  retainedStoneWeight: Decimal;
  finishedGrossWeight: Decimal | null;
  finishedStoneWeight: Decimal | null;
  finishedNetMetalWeight: Decimal | null;
  finishedFineWeight: Decimal | null;
  totalRawLossWeight: Decimal;
  totalFineLossWeight: Decimal;
  completedAt: Date | null;
  completedById: string | null;
  deliveryStatus: OrderDeliveryStatus;
  deliveredAt: Date | null;
  deliveredById: string | null;
  billingStatus: OrderBillingStatus;
  activeBillId: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderProcessEntity {
  id: string;
  organizationId: string;
  orderId: string;
  processType: ProcessType;
  canonicalSequence: number;
  sequenceOrder: number;
  assignedKarigarId: string | null;
  status: OrderProcessStatus;
  issuedMetalWeight: Decimal;
  returnedMetalWeight: Decimal;
  extraReturnedMetalWeight: Decimal;
  closedLossWeight: Decimal;
  custodyMetalWeight: Decimal;
  carriedStoneInWeight: Decimal;
  addedStoneWeight: Decimal;
  removedStoneWeight: Decimal;
  carriedStoneOutWeight: Decimal;
  latestGrossInWeight: Decimal;
  latestGrossOutWeight: Decimal;
  closedAt: Date | null;
  closedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessVisitEntity {
  id: string;
  organizationId: string;
  orderId: string;
  orderProcessId: string;
  visitNumber: number;
  karigarId: string;
  businessDate: Date;
  status: ProcessVisitStatus;
  grossInWeight: Decimal;
  nonGoldInWeight: Decimal;
  metalInWeight: Decimal;
  grossOutWeight: Decimal;
  nonGoldOutWeight: Decimal;
  metalOutWeight: Decimal;
  extraMetalReturnedWeight: Decimal;
  extraMetalTouchPercent: Decimal | null;
  extraMetalPurityId: string | null;
  extraMetalFineWeight: Decimal;
  custodyRemainingWeight: Decimal;
  rawLossWeight: Decimal;
  touchSnapshot: Decimal;
  fineLossWeight: Decimal;
  notes: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetalMovementEntity {
  id: string;
  organizationId: string;
  orderId: string;
  orderProcessId: string | null;
  processVisitId: string | null;
  movementType: MetalMovementType;
  fromProcessType: ProcessType | null;
  toProcessType: ProcessType | null;
  karigarId: string | null;
  businessDate: Date;
  grossWeight: Decimal;
  nonGoldWeight: Decimal;
  netMetalWeight: Decimal;
  touchSnapshot: Decimal;
  fineEquivalentWeight: Decimal;
  journalTransactionId: string | null;
  idempotencyKey: string;
  notes: string | null;
  createdById: string;
  createdAt: Date;
}

export interface StoneComponentEntryEntity {
  id: string;
  organizationId: string;
  orderId: string;
  orderProcessId: string;
  processVisitId: string | null;
  componentType: string;
  direction: StoneDirection;
  sizeLabel: string | null;
  pieces: number;
  weightGrams: Decimal;
  notes: string | null;
  createdById: string;
  createdAt: Date;
}

export interface ProcessLossRecordEntity {
  id: string;
  organizationId: string;
  orderId: string;
  orderProcessId: string;
  processVisitId: string;
  karigarId: string;
  processType: ProcessType;
  businessDate: Date;
  rawMetalLossWeight: Decimal;
  touchSnapshot: Decimal;
  fineEquivalentLossWeight: Decimal;
  eligibilityStatus: LossEligibilityStatus;
  journalTransactionId: string | null;
  eligibleAt: Date | null;
  notes: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalTransactionEntity {
  id: string;
  organizationId: string;
  transactionNumber: string;
  transactionType: JournalTransactionType;
  businessDate: Date;
  purityId: string;
  touchSnapshot: Decimal;
  physicalWeight: Decimal;
  fineEquivalentWeight: Decimal;
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
}

export interface JournalLineEntity {
  id: string;
  organizationId: string;
  journalTransactionId: string;
  accountId: string;
  direction: JournalLineDirection;
  signedPhysicalDelta: Decimal;
  touchSnapshot: Decimal;
  signedFineDelta: Decimal;
  orderId: string | null;
  orderProcessId: string | null;
  karigarId: string | null;
  description: string;
  createdAt: Date;
}

export interface AuditEventEntity {
  id: string;
  organizationId: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  metadataJson: string | null;
  createdAt: Date;
}

export interface StoneComponentInput {
  componentType: string; // e.g., "AD", "KL"
  direction?: StoneDirection; // default "ADDED"
  sizeLabel?: string;
  pieces: number;
  weightGrams: Decimal | string | number;
  notes?: string;
}

export interface RecoveryReceiptEntity {
  id: string;
  organizationId: string;
  karigarId: string | null;
  receiptNumber: string;
  businessDate: Date;
  recoveredGrossWeight: Decimal;
  recoveredTouchPercent: Decimal;
  recoveredFineWeight: Decimal;
  unallocatedFineWeight: Decimal;
  referenceNumber: string | null;
  notes: string | null;
  status: RecoveryReceiptStatus;
  idempotencyKey: string;
  journalTransactionId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  reversedAt: Date | null;
  reversalReason: string | null;
  recoverySettlementId?: string | null;
}

export interface BillSequenceEntity {
  organizationId: string;
  prefix: string;
  nextNumber: number;
  updatedAt: Date;
}

export interface BillTemplateEntity {
  id: string;
  organizationId: string;
  name: string;
  isDefault: boolean;
  businessName: string;
  contactInfo: string;
  logoUrl: string | null;
  headerText: string | null;
  footerText: string | null;
  signatureUrl: string | null;
  showPhotoColumn: boolean;
  visibleColumnsJson: string;
  columnLabelsJson: string;
  columnWidthsJson: string | null;
  notesAndTerms: string | null;
  fontSizePx: number;
  paperSize: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerBillEntity {
  id: string;
  organizationId: string;
  customerId: string;
  billNumber: string;
  billDate: Date;
  billType: BillType;
  status: BillStatus;
  deliveryStatus: BillDeliveryStatus;
  settlementStatus: BillSettlementStatus;
  totalFineGold: Decimal;
  totalCashRupees: Decimal;
  deliveredFineMetal: Decimal;
  commercialMakingFine: Decimal;
  historicalFineBalance: Decimal;
  historicalInrBalance: Decimal;
  previousAdvanceFineSnapshot?: Decimal;
  appliedAdvanceFineSnapshot?: Decimal;
  newReceiptFineSnapshot?: Decimal;
  closingFineDueSnapshot?: Decimal;
  remainingAdvanceFineSnapshot?: Decimal;
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
}

export interface CustomerBillLineEntity {
  id: string;
  customerBillId: string;
  lineType: BillLineType;
  orderId: string | null;
  purityId: string | null;
  bagNumberSnapshot: string | null;
  orderNameSnapshot: string | null;
  photoUrlSnapshot: string | null;
  description: string;
  grossWeight: Decimal;
  stoneWeight: Decimal;
  adKlWeight: Decimal;
  netWeight: Decimal;
  touchSnapshot: Decimal;
  chargeableWeight: Decimal;
  billingBasis: BillingBasis;
  wastagePercent: Decimal;
  makingPercentagePoints: Decimal;
  metalChargeFine: Decimal;
  makingChargeFine: Decimal;
  extraFineCharge: Decimal;
  fineDiscount: Decimal;
  fineGold: Decimal;
  makingCharges: Decimal;
  stoneChargeRupees: Decimal;
  rupeeDiscount: Decimal;
  adjustmentReason: string | null;
}

export interface CustomerGoldReceiptEntity {
  id: string;
  organizationId: string;
  customerId: string;
  receiptNumber: string;
  businessDate: Date;
  totalGrossWeight: Decimal;
  totalFineWeight: Decimal;
  unallocatedFineWeight: Decimal;
  refundedFineWeight?: Decimal;
  inputModeSnapshot?: "FINE_EQUIVALENT" | "PHYSICAL_AT_CONFIGURED_TOUCH" | "LEGACY_LINE";
  physicalWeightProvided?: boolean;
  status: CustomerReceiptStatus;
  referenceNumber: string | null;
  notes: string | null;
  idempotencyKey: string;
  journalTransactionId: string | null;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
}

export interface CustomerGoldReceiptLineEntity {
  id: string;
  organizationId: string;
  receiptId: string;
  purityId: string;
  grossWeight: Decimal;
  touchPercent: Decimal;
  fineWeight: Decimal;
  journalTransactionId: string | null;
}

export interface CustomerCashReceiptEntity {
  id: string;
  organizationId: string;
  customerId: string;
  receiptNumber: string;
  businessDate: Date;
  amountRupees: Decimal;
  unallocatedRupees: Decimal;
  paymentMode: string;
  status: CustomerReceiptStatus;
  referenceNumber: string | null;
  notes: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
}

export interface CustomerPaymentAllocationEntity {
  id: string;
  organizationId: string;
  customerId: string;
  billId: string;
  goldReceiptId: string | null;
  cashReceiptId: string | null;
  allocatedFineWeight: Decimal;
  allocatedRupees: Decimal;
  status: CustomerAllocationStatus;
  businessDate: Date;
  notes: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  undoneAt: Date | null;
  undoneById: string | null;
  undoReason: string | null;
}

export interface RecoveryReceiptLineEntity {
  id: string;
  organizationId: string;
  recoveryReceiptId: string;
  purityId: string;
  destinationAccountId: string;
  grossWeight: Decimal;
  touchPercent: Decimal;
  fineWeight: Decimal;
  journalTransactionId: string;
  createdAt: Date;
}

export interface RecoveryAllocationEntity {
  id: string;
  organizationId: string;
  recoveryReceiptId: string;
  processLossRecordId: string;
  allocatedFineWeight: Decimal;
  status: RecoveryAllocationStatus;
  businessDate: Date;
  notes: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  undoneAt: Date | null;
  undoneById: string | null;
  undoReason: string | null;
}

export interface LossWriteOffEntity {
  id: string;
  organizationId: string;
  processLossRecordId: string;
  karigarId: string;
  writtenOffFineWeight: Decimal;
  businessDate: Date;
  reason: string;
  status: LossWriteOffStatus;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversalReason: string | null;
  recoverySettlementId?: string | null;
}

export interface RecoverySettlementEntity {
  id: string;
  organizationId: string;
  karigarId: string;
  settlementNumber: string;
  businessDate: Date;
  scopeType: "SINGLE_TOUCH" | "ALL_TOUCHES";
  scopeTouchPercent: Decimal | null;
  scopeProcessType: ProcessType | null;
  grossSelectedFine: Decimal;
  makingDeductionFine: Decimal;
  makingInputWeight: Decimal;
  makingInputUnit: "RAW_AT_TOUCH" | "FINE";
  netExpectedFine: Decimal;
  receivedFine: Decimal;
  differenceFine: Decimal;
  shortageAction: "CARRY_FORWARD" | "ACCEPT_AND_CLEAR" | "ACCEPT_PART" | "NONE" | "EXCESS" | null;
  acceptedShortageFine: Decimal;
  carriedShortageFine: Decimal;
  excessFine: Decimal;
  recoveryReceiptId: string | null;
  notes: string | null;
  status: "POSTED" | "REVERSED";
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  reversedAt: Date | null;
  reversalReason: string | null;
}

export interface MakingDeductionAllocationEntity {
  id: string;
  organizationId: string;
  recoverySettlementId: string;
  processLossRecordId: string;
  karigarId: string;
  deductedFineWeight: Decimal;
  businessDate: Date;
  reason: string | null;
  status: "ACTIVE" | "REVERSED";
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversalReason: string | null;
}

export interface BillSequenceEntity {
  organizationId: string;
  prefix: string;
  nextNumber: number;
  updatedAt: Date;
}

export interface BillTemplateEntity {
  id: string;
  organizationId: string;
  name: string;
  isDefault: boolean;
  businessName: string;
  contactInfo: string;
  logoUrl: string | null;
  headerText: string | null;
  footerText: string | null;
  signatureUrl: string | null;
  showPhotoColumn: boolean;
  visibleColumnsJson: string;
  columnLabelsJson: string;
  columnWidthsJson: string | null;
  notesAndTerms: string | null;
  fontSizePx: number;
  paperSize: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerBillEntity {
  id: string;
  organizationId: string;
  customerId: string;
  billNumber: string;
  billDate: Date;
  billType: BillType;
  status: BillStatus;
  deliveryStatus: BillDeliveryStatus;
  settlementStatus: BillSettlementStatus;
  totalFineGold: Decimal;
  totalCashRupees: Decimal;
  deliveredFineMetal: Decimal;
  commercialMakingFine: Decimal;
  historicalFineBalance: Decimal;
  historicalInrBalance: Decimal;
  previousAdvanceFineSnapshot?: Decimal;
  appliedAdvanceFineSnapshot?: Decimal;
  newReceiptFineSnapshot?: Decimal;
  closingFineDueSnapshot?: Decimal;
  remainingAdvanceFineSnapshot?: Decimal;
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
}

export interface CustomerBillLineEntity {
  id: string;
  customerBillId: string;
  lineType: BillLineType;
  orderId: string | null;
  purityId: string | null;
  bagNumberSnapshot: string | null;
  orderNameSnapshot: string | null;
  photoUrlSnapshot: string | null;
  description: string;
  grossWeight: Decimal;
  stoneWeight: Decimal;
  adKlWeight: Decimal;
  netWeight: Decimal;
  touchSnapshot: Decimal;
  chargeableWeight: Decimal;
  billingBasis: BillingBasis;
  wastagePercent: Decimal;
  makingPercentagePoints: Decimal;
  metalChargeFine: Decimal;
  makingChargeFine: Decimal;
  extraFineCharge: Decimal;
  fineDiscount: Decimal;
  fineGold: Decimal;
  makingCharges: Decimal;
  stoneChargeRupees: Decimal;
  rupeeDiscount: Decimal;
  adjustmentReason: string | null;
}

export interface CustomerGoldReceiptEntity {
  id: string;
  organizationId: string;
  customerId: string;
  receiptNumber: string;
  businessDate: Date;
  totalGrossWeight: Decimal;
  totalFineWeight: Decimal;
  unallocatedFineWeight: Decimal;
  refundedFineWeight?: Decimal;
  inputModeSnapshot?: "FINE_EQUIVALENT" | "PHYSICAL_AT_CONFIGURED_TOUCH" | "LEGACY_LINE";
  physicalWeightProvided?: boolean;
  status: CustomerReceiptStatus;
  referenceNumber: string | null;
  notes: string | null;
  idempotencyKey: string;
  journalTransactionId: string | null;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
}

export interface CustomerGoldReceiptLineEntity {
  id: string;
  organizationId: string;
  receiptId: string;
  purityId: string;
  grossWeight: Decimal;
  touchPercent: Decimal;
  fineWeight: Decimal;
  journalTransactionId: string | null;
}

export interface CustomerCashReceiptEntity {
  id: string;
  organizationId: string;
  customerId: string;
  receiptNumber: string;
  businessDate: Date;
  amountRupees: Decimal;
  unallocatedRupees: Decimal;
  paymentMode: string;
  status: CustomerReceiptStatus;
  referenceNumber: string | null;
  notes: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
}

export interface CustomerPaymentAllocationEntity {
  id: string;
  organizationId: string;
  customerId: string;
  billId: string;
  goldReceiptId: string | null;
  cashReceiptId: string | null;
  allocatedFineWeight: Decimal;
  allocatedRupees: Decimal;
  status: CustomerAllocationStatus;
  businessDate: Date;
  notes: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  undoneAt: Date | null;
  undoneById: string | null;
  undoReason: string | null;
}

export type StockSaleStatus = "POSTED" | "REVERSED";
export type StockSalePaymentStatus = "UNPAID" | "PARTIAL" | "PAID";
export type StockConversionType = "FINE_TO_KARAT" | "KARAT_TO_FINE" | "REFINING" | "ALLOYING";
export type RefiningLossTreatment = "NONE" | "OUTSTANDING" | "ACCEPTED";

export interface StockSaleEntity {
  id: string;
  organizationId: string;
  saleNumber: string;
  businessDate: Date;
  purityId: string;
  physicalWeight: Decimal;
  touchPercentSnapshot: Decimal;
  fineEquivalentWeight: Decimal;
  buyerName: string;
  buyerPhone: string | null;
  pricePerGramRupees: Decimal;
  totalAmountRupees: Decimal;
  paidAmountRupees: Decimal;
  paymentStatus: StockSalePaymentStatus;
  status: StockSaleStatus;
  referenceNumber: string | null;
  notes: string | null;
  journalTransactionId: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
  reversedAt: Date | null;
  reversedById: string | null;
  reversalReason: string | null;
}

export interface StockConversionEntity {
  id: string;
  organizationId: string;
  conversionNumber: string;
  conversionType: StockConversionType;
  businessDate: Date;
  sourcePurityId: string;
  sourceWeight: Decimal;
  sourceTouchPercent: Decimal;
  theoreticalFineWeight: Decimal;
  targetPurityId: string;
  actualOutputWeight: Decimal;
  actualOutputTouch: Decimal;
  actualOutputFineWeight: Decimal;
  residueWeight: Decimal;
  returnedMetalWeight: Decimal;
  lossFineWeight: Decimal;
  lossTreatment: RefiningLossTreatment;
  refinerOrPartner: string | null;
  notes: string | null;
  journalTransactionId: string | null;
  idempotencyKey: string;
  createdById: string;
  createdAt: Date;
}

export interface BillShareTokenEntity {
  id: string;
  organizationId: string;
  billId: string;
  token: string;
  isRevoked: boolean;
  expiresAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  revokedAt: Date | null;
}

export type CustomerFineReceiptMode =
  | "UNCONFIGURED"
  | "FINE_EQUIVALENT"
  | "PHYSICAL_AT_CONFIGURED_TOUCH";

export interface OrganizationCustomerFineConfigEntity {
  organizationId: string;
  customerFineReceiptMode: CustomerFineReceiptMode;
  customerFineConfiguredTouch: Decimal | null;
  customerFineAccountPurityId: string | null;
}



