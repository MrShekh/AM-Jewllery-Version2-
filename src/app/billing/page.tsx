"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, AppShellUser } from "@/components/AppShell";
import { Printer, Plus, Trash2, CheckCircle2, AlertTriangle, Share2, Download, FileText } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import {
  fetchActorCached,
  fetchCachedJson,
  getCachedActor,
  getCachedJson,
} from "@/lib/client-cache";

interface CustomerSummary {
  customerId: string;
  customerCode: string;
  name: string;
  phone: string | null;
  fineOwed: string;
  fineAdvance: string;
  inrOwed: string;
  inrAdvance: string;
}

interface OrderRow {
  id: string;
  bagNumber: string;
  orderName: string;
  photoUrl: string | null;
  customerId: string;
  customerName: string;
  purityId: string;
  purityLabel: string;
  touchPercent: string;
  status: string;
  billingStatus: string;
  deliveryStatus: string;
  completedAt: string | null;
  grossWeight: string;
  stoneWeight: string;
  netWeight: string;
  eligibility: "ELIGIBLE" | "INELIGIBLE";
  ineligibleReason: string;
}

interface BillRow {
  id: string;
  billNumber: string;
  billDate: string;
  billType: "ORDER_DELIVERY" | "MANUAL_COMMERCIAL";
  status: "DRAFT" | "POSTED" | "CANCELLED";
  deliveryStatus: string;
  settlementStatus: string;
  customerId: string;
  customerName: string;
  totalFineGold: string;
  totalCashRupees: string;
  deliveredFineMetal: string;
  commercialMakingFine: string;
  finePaid: string;
  fineOutstanding: string;
  inrPaid: string;
  inrOutstanding: string;
  historicalFineBalance: string;
  historicalInrBalance: string;
  creditNoteNumber: string | null;
  cancellationReason: string | null;
  previewHtml: string | null;
  notes: string | null;
}

interface GoldReceiptRow {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  businessDate: string;
  totalGrossWeight: string;
  totalFineWeight: string;
  unallocatedFineWeight: string;
  status: string;
  referenceNumber: string | null;
  lines: Array<{
    id: string;
    purityLabel: string;
    grossWeight: string;
    touchPercent: string;
    fineWeight: string;
  }>;
}

interface CashReceiptRow {
  id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  businessDate: string;
  amountRupees: string;
  unallocatedRupees: string;
  paymentMode: string;
  status: string;
  referenceNumber: string | null;
}

interface TemplateConfig {
  id: string;
  name: string;
  businessName: string;
  contactInfo: string;
  logoUrl: string | null;
  headerText: string | null;
  footerText: string | null;
  signatureUrl: string | null;
  showPhotoColumn: boolean;
  visibleColumns: Record<string, boolean>;
  columnLabels: Record<string, string>;
  notesAndTerms: string | null;
  fontSizePx: number;
  paperSize: "A4" | "A5";
}

interface PurityOption {
  id: string;
  code: string;
  displayLabel: string;
  touchPercent: string;
}

interface OrderLineDraft {
  orderId: string;
  finishWeight: string;
  netWeight: string;
  baseWeightOption: "pure_gold" | "with_stones";
  customStoneWeight: string;
  customAdWeight: string;
  billingBasis: "NET_METAL" | "GROSS_WEIGHT" | "MANUAL";
  manualChargeableWeight: string;
  makingPercentagePoints: string;
  extraFineCharge: string;
  fineDiscount: string;
  makingChargesRupees: string;
  stoneChargeRupees: string;
  rupeeDiscount: string;
  adjustmentReason: string;
}

const WASTAGE_PRESET_OPTIONS = [
  "0",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "4.5",
  "5",
  "5.5",
  "6",
  "6.5",
  "7",
  "7.5",
  "8",
  "8.5",
  "9",
  "9.5",
  "10",
];

interface ManualLineDraft {
  lineType: "MANUAL_SERVICE" | "MANUAL_FINE_CHARGE" | "MANUAL_STONE_INR" | "MANUAL_DISCOUNT";
  description: string;
  extraFineCharge: string;
  fineDiscount: string;
  makingChargesRupees: string;
  stoneChargeRupees: string;
  rupeeDiscount: string;
  adjustmentReason: string;
}

function BillingWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCustomerId = searchParams.get("customerId") || "";
  const initialOrderIdsParam = searchParams.get("orderIds") || "";
  const initialTab = (searchParams.get("tab") as "new-bill" | "bills" | "collections" | "templates") || "new-bill";

  const [actor, setActor] = useState<AppShellUser | null>(() => getCachedActor());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"new-bill" | "bills" | "collections" | "templates">(initialTab);
  const [customerId, setCustomerId] = useState(initialCustomerId);

  const [customerSummaries, setCustomerSummaries] = useState<CustomerSummary[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [goldReceipts, setGoldReceipts] = useState<GoldReceiptRow[]>([]);
  const [cashReceipts, setCashReceipts] = useState<CashReceiptRow[]>([]);
  const [templates, setTemplates] = useState<TemplateConfig[]>([]);
  const [purities, setPurities] = useState<PurityOption[]>([]);

  // New Bill State
  const [billType, setBillType] = useState<"ORDER_DELIVERY" | "MANUAL_COMMERCIAL">("ORDER_DELIVERY");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [billNotes, setBillNotes] = useState("");
  const [adminMakingCharge, setAdminMakingCharge] = useState("");
  const [applyFineAdvance, setApplyFineAdvance] = useState(true);
  const [applyInrAdvance, setApplyInrAdvance] = useState(true);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [livePreviewHtml, setLivePreviewHtml] = useState<string | null>(null);

  const [selectedOrderLines, setSelectedOrderLines] = useState<Record<string, OrderLineDraft>>({});
  const [manualLines, setManualLines] = useState<ManualLineDraft[]>([
    {
      lineType: "MANUAL_SERVICE",
      description: "",
      extraFineCharge: "0",
      fineDiscount: "0",
      makingChargesRupees: "0",
      stoneChargeRupees: "0",
      rupeeDiscount: "0",
      adjustmentReason: "",
    },
  ]);

  // Modal Preview for Posted Bills
  const [inspectBill, setInspectBill] = useState<BillRow | null>(null);

  // Collections State (Customers Give Fine Gold Only — Section 2)
  const [fineReceiptConvention, setFineReceiptConvention] = useState<{
    mode: "UNCONFIGURED" | "FINE_EQUIVALENT" | "PHYSICAL_AT_CONFIGURED_TOUCH";
    configuredTouch: string | null;
    finePurityId: string;
    finePurityCode: string;
    finePurityLabel: string;
    destinationAccountCode: string;
    destinationAccountName: string;
  } | null>(null);
  const [goldAmountReceived, setGoldAmountReceived] = useState("");
  const [goldDate, setGoldDate] = useState(new Date().toISOString().slice(0, 10));
  const [goldRef, setGoldRef] = useState("");
  const [goldNotes, setGoldNotes] = useState("");
  const [goldAllocMode, setGoldAllocMode] = useState<"OLDEST_FIRST" | "NONE">("OLDEST_FIRST");
  const [goldLines, setGoldLines] = useState<Array<{ purityId: string; grossWeight: string; touchPercent: string }>>([
    { purityId: "", grossWeight: "", touchPercent: "" },
  ]);

  const [cashDate, setCashDate] = useState(new Date().toISOString().slice(0, 10));
  const [cashAmount, setCashAmount] = useState("");
  const [cashMode, setCashMode] = useState("CASH");
  const [cashRef, setCashRef] = useState("");
  const [cashNotes, setCashNotes] = useState("");
  const [cashAllocMode, setCashAllocMode] = useState<"OLDEST_FIRST" | "NONE">("OLDEST_FIRST");

  // Template Editor State
  const [tplId, setTplId] = useState<string>("");
  const [tplName, setTplName] = useState("AM Jwellers Custom");
  const [tplBizName, setTplBizName] = useState("AM Jwellers");
  const [tplContact, setTplContact] = useState("Shekh Nayem • Patavadi Chowk • Phone: 9907047429");
  const [tplLogoUrl, setTplLogoUrl] = useState("");
  const [tplHeaderText, setTplHeaderText] = useState("");
  const [tplFooterText, setTplFooterText] = useState("Thank you for your business!");
  const [tplSigUrl, setTplSigUrl] = useState("");
  const [tplShowPhoto, setTplShowPhoto] = useState(false);
  const [tplFontSize, setTplFontSize] = useState(12);
  const [tplPaperSize, setTplPaperSize] = useState<"A4" | "A5">("A4");
  const [tplNotesTerms, setTplNotesTerms] = useState("");
  const [tplIsDefault, setTplIsDefault] = useState(true);
  const [tplVisibleCols, setTplVisibleCols] = useState<string[]>([
    "description",
    "purity",
    "netWeight",
    "making",
    "fineTotal",
    "cashTotal",
  ]);

  // Allocations, Consolidated Statement & WhatsApp Share State
  const [allocations, setAllocations] = useState<Array<{
    id: string;
    customerId: string;
    billId: string;
    goldReceiptId: string | null;
    cashReceiptId: string | null;
    allocatedFineWeight: string;
    allocatedRupees: string;
    status: string;
    businessDate: string;
  }>>([]);
  const [manualAllocBillId, setManualAllocBillId] = useState("");
  const [manualAllocReceiptKey, setManualAllocReceiptKey] = useState("");
  const [manualAllocAmount, setManualAllocAmount] = useState("");
  const [consolidatedStmt, setConsolidatedStmt] = useState<{
    customer: { name: string; phone: string | null; address: string | null };
    bills: Array<{
      id: string;
      billNumber: string;
      billDate: string;
      totalFineGold: string;
      outstandingFine: string;
      totalCashRupees: string;
      outstandingInr: string;
      settlementStatus: string;
    }>;
    totals: {
      totalBilledFine: string;
      netOutstandingFine: string;
      unallocatedGoldCredit: string;
      totalBilledInr: string;
      netOutstandingInr: string;
      unallocatedCashCredit: string;
    };
  } | null>(null);
  const [shareModalBill, setShareModalBill] = useState<BillRow | null>(null);
  const [shareTokenInfo, setShareTokenInfo] = useState<{
    id: string;
    token: string;
    url: string;
  } | null>(null);
  const [shareStatusNote, setShareStatusNote] = useState<string | null>(null);
  const [waState, setWaState] = useState<{
    status: "disconnected" | "connecting" | "qr" | "connected";
    isReady: boolean;
    qrDataUrl: string | null;
    connectedUser: string | null;
    lastError: string | null;
  }>({
    status: "disconnected",
    isReady: false,
    qrDataUrl: null,
    connectedUser: null,
    lastError: null,
  });
  const [waQrModalOpen, setWaQrModalOpen] = useState(false);
  const [sendingWaBillId, setSendingWaBillId] = useState<string | null>(null);
  const [pendingWaBill, setPendingWaBill] = useState<BillRow | null>(null);

  const refreshWaStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp");
      if (res.ok) {
        const data = await res.json();
        setWaState(data);
        return data;
      }
    } catch {
      // ignore network error
    }
    return null;
  }, []);

  useEffect(() => {
    void refreshWaStatus();
  }, [refreshWaStatus]);

  const loadWorkspace = useCallback(
    async (force = false) => {
      const q = customerId ? `?customerId=${encodeURIComponent(customerId)}` : "";
      const url = `/api/billing${q}`;
      const cached = getCachedJson<Record<string, unknown>>(url);
      if (!cached || force) setLoading(true);
      try {
        const [resolvedActor, data] = await Promise.all([
          fetchActorCached(),
          fetchCachedJson<{
            error?: string;
            customerSummaries?: CustomerSummary[];
            orders?: OrderRow[];
            bills?: BillRow[];
            goldReceipts?: GoldReceiptRow[];
            cashReceipts?: CashReceiptRow[];
            allocations?: Array<{
              id: string;
              customerId: string;
              billId: string;
              goldReceiptId: string | null;
              cashReceiptId: string | null;
              allocatedFineWeight: string;
              allocatedRupees: string;
              status: string;
              businessDate: string;
            }>;
            templates?: TemplateConfig[];
            purities?: PurityOption[];
            fineReceiptConvention?: {
              mode: "UNCONFIGURED" | "FINE_EQUIVALENT" | "PHYSICAL_AT_CONFIGURED_TOUCH";
              configuredTouch: string | null;
              finePurityId: string;
              finePurityCode: string;
              finePurityLabel: string;
              destinationAccountCode: string;
              destinationAccountName: string;
            };
          }>(url, { force }),
        ]);

        if (!resolvedActor) {
          router.replace("/login?redirect=/billing");
          return;
        }
        setActor(resolvedActor);
        if (data.error) throw new Error(data.error);

        setCustomerSummaries(data.customerSummaries || []);
        setOrders(data.orders || []);
        setBills(data.bills || []);
        setGoldReceipts(data.goldReceipts || []);
        setCashReceipts(data.cashReceipts || []);
        setAllocations(data.allocations || []);
        setTemplates(data.templates || []);
        setPurities(data.purities || []);
        if (data.fineReceiptConvention) {
          setFineReceiptConvention(data.fineReceiptConvention);
        }

        if (!customerId && data.customerSummaries && data.customerSummaries.length > 0) {
          setCustomerId(data.customerSummaries[0].customerId);
        }
        if (data.purities && data.purities.length > 0 && goldLines[0]?.purityId === "") {
          setGoldLines([
            {
              purityId: data.purities[0].id,
              grossWeight: "",
              touchPercent: Number(data.purities[0].touchPercent).toString(),
            },
          ]);
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to load billing");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerId, router]
  );

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const [customAdvanceGoldUsed, setCustomAdvanceGoldUsed] = useState("0");

  // Pre-select orders passed via ?orderIds=...
  useEffect(() => {
    if (!initialOrderIdsParam || orders.length === 0) return;
    const ids = initialOrderIdsParam.split(",").filter(Boolean);
    const next: Record<string, OrderLineDraft> = {};
    for (const id of ids) {
      const ord = orders.find((o) => o.id === id && o.eligibility === "ELIGIBLE");
      if (ord) {
        next[id] = {
          orderId: id,
          finishWeight: ord.grossWeight,
          netWeight: ord.netWeight,
          baseWeightOption: "pure_gold",
          customStoneWeight: "0",
          customAdWeight: "0",
          billingBasis: "MANUAL",
          manualChargeableWeight: ord.netWeight,
          makingPercentagePoints: "4",
          extraFineCharge: "0",
          fineDiscount: "0",
          makingChargesRupees: "0",
          stoneChargeRupees: "0",
          rupeeDiscount: "0",
          adjustmentReason: "",
        };
      }
    }
    if (Object.keys(next).length > 0) {
      setSelectedOrderLines(next);
    }
  }, [initialOrderIdsParam, orders]);

  const activeCustomer = useMemo(
    () => customerSummaries.find((c) => c.customerId === customerId) || null,
    [customerSummaries, customerId]
  );

  const toggleOrderSelection = (ord: OrderRow) => {
    if (ord.eligibility !== "ELIGIBLE") return;
    setSelectedOrderLines((prev) => {
      const next = { ...prev };
      if (next[ord.id]) {
        delete next[ord.id];
      } else {
        next[ord.id] = {
          orderId: ord.id,
          finishWeight: ord.grossWeight,
          netWeight: ord.netWeight,
          baseWeightOption: "pure_gold",
          customStoneWeight: "0",
          customAdWeight: "0",
          billingBasis: "MANUAL",
          manualChargeableWeight: ord.netWeight,
          makingPercentagePoints: "4",
          extraFineCharge: "0",
          fineDiscount: "0",
          makingChargesRupees: "0",
          stoneChargeRupees: "0",
          rupeeDiscount: "0",
          adjustmentReason: "",
        };
      }
      return next;
    });
  };

  const updateOrderLine = (orderId: string, patch: Partial<OrderLineDraft>) => {
    setSelectedOrderLines((prev) => ({
      ...prev,
      [orderId]: { ...prev[orderId], ...patch },
    }));
  };

  // Live numerical preview of selected lines (Exact V1 Formula)
  const draftTotals = useMemo(() => {
    let fineTotal = 0;
    let inrTotal = 0;
    let deliveredFine = 0;

    if (billType === "ORDER_DELIVERY") {
      for (const draft of Object.values(selectedOrderLines)) {
        const ord = orders.find((o) => o.id === draft.orderId);
        if (!ord) continue;
        const origNet = Number(ord.netWeight || 0);
        const touch = Number(ord.touchPercent || 0);
        const baseWt =
          draft.baseWeightOption === "with_stones"
            ? Number(draft.finishWeight || 0)
            : Number(draft.netWeight || 0);
        const customStone = Number(draft.customStoneWeight || 0);
        const customAd = Number(draft.customAdWeight || 0);
        const finalBillingWt = Math.max(0, baseWt + customStone + customAd);
        const pts = Number(draft.makingPercentagePoints || 0);
        const effectivePurity = (touch + pts) / 100;
        const lineFine =
          finalBillingWt * effectivePurity +
          Number(draft.extraFineCharge || 0) -
          Number(draft.fineDiscount || 0);
        const lineInr =
          Number(draft.makingChargesRupees || 0) +
          Number(draft.stoneChargeRupees || 0) -
          Number(draft.rupeeDiscount || 0);

        fineTotal += lineFine;
        inrTotal += lineInr;
        deliveredFine += (origNet * touch) / 100;
      }
    } else {
      for (const ml of manualLines) {
        fineTotal += Number(ml.extraFineCharge || 0) - Number(ml.fineDiscount || 0);
        inrTotal +=
          Number(ml.makingChargesRupees || 0) +
          Number(ml.stoneChargeRupees || 0) -
          Number(ml.rupeeDiscount || 0);
      }
    }

    const availAdv = Number(activeCustomer?.fineAdvance || 0);
    const advUsed = applyFineAdvance
      ? Math.min(availAdv, Math.max(0, Number(customAdvanceGoldUsed || 0)))
      : 0;
    const netCustomerOwesFine = Math.max(0, fineTotal - advUsed);
    const pastJamaFine = Number(activeCustomer?.fineOwed || 0);

    return {
      fineTotal,
      inrTotal,
      deliveredFine,
      makingDiff: fineTotal - deliveredFine,
      availAdv,
      advUsed,
      netCustomerOwesFine,
      pastJamaFine,
      grandTotalFineWithPast: netCustomerOwesFine + pastJamaFine,
    };
  }, [
    billType,
    selectedOrderLines,
    manualLines,
    orders,
    activeCustomer,
    applyFineAdvance,
    customAdvanceGoldUsed,
  ]);

  const handleBillSubmit = async (action: "SAVE_DRAFT" | "POST_BILL_AND_DELIVER") => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const lines =
        billType === "ORDER_DELIVERY"
          ? Object.values(selectedOrderLines).map((draft) => {
              const baseWt =
                draft.baseWeightOption === "with_stones"
                  ? Number(draft.finishWeight || 0)
                  : Number(draft.netWeight || 0);
              const customStone = Number(draft.customStoneWeight || 0);
              const customAd = Number(draft.customAdWeight || 0);
              const finalBillingWt = Math.max(0, baseWt + customStone + customAd);
              return {
                ...draft,
                billingBasis: "MANUAL" as const,
                manualChargeableWeight: finalBillingWt.toFixed(3),
                customGrossWeight: baseWt.toFixed(3),
                customStoneWeight: customStone.toFixed(3),
                customAdWeight: customAd.toFixed(3),
                customNetWeight: finalBillingWt.toFixed(3),
              };
            })
          : manualLines;
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          draftId,
          customerId,
          billDate,
          billType,
          templateId: selectedTemplateId || undefined,
          notes: billNotes,
          adminMakingChargeRupees: Number(adminMakingCharge || 0),
          applyFineAdvance: applyFineAdvance && draftTotals.advUsed > 0,
          customAdvanceFineAmount:
            applyFineAdvance && draftTotals.advUsed > 0
              ? draftTotals.advUsed.toFixed(3)
              : "0",
          applyInrAdvance,
          lines,
          idempotencyKey: `bill_${action}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Billing action failed");

      setLivePreviewHtml(data.previewHtml || null);
      if (action === "SAVE_DRAFT") {
        setDraftId(data.billId);
        setSuccessMsg(`Saved draft ${data.billNumber}`);
      } else {
        setDraftId(undefined);
        setSelectedOrderLines({});
        setAdminMakingCharge("");
        setSuccessMsg(
          `Posted & Delivered Bill ${data.billNumber} (${data.totalFineGold}g fine, ₹${data.totalCashRupees})`
        );
      }
      await loadWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordGoldReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RECEIVE_FINE_GOLD",
          customerId,
          amountReceived: goldAmountReceived,
          businessDate: goldDate,
          referenceNumber: goldRef,
          notes: goldNotes,
          allocationMode: goldAllocMode,
          idempotencyKey: `cgr_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record fine gold receipt");
      setSuccessMsg(
        `Confirmed ${data.receiptNumber}: Credited ${data.totalFineWeight}g fine (unallocated advance: ${data.unallocatedFineWeight}g)`
      );
      setGoldAmountReceived("");
      setGoldRef("");
      setGoldNotes("");
      await loadWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to record fine gold");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordCashReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RECORD_CASH_RECEIPT",
          customerId,
          businessDate: cashDate,
          amountRupees: cashAmount,
          paymentMode: cashMode,
          referenceNumber: cashRef,
          notes: cashNotes,
          allocationMode: cashAllocMode,
          idempotencyKey: `ccr_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record cash receipt");
      setSuccessMsg(
        `Recorded ${data.receiptNumber}: ₹${data.amountRupees} (unallocated: ₹${data.unallocatedRupees})`
      );
      setCashAmount("");
      setCashRef("");
      setCashNotes("");
      await loadWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to record cash");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBill = async (bill: BillRow) => {
    const reason = window.prompt(
      `Cancel Bill ${bill.billNumber}? This creates a commercial credit note and releases paid allocations to customer credit without restoring delivered jewellery. Enter reason:`
    );
    if (!reason) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CANCEL_BILL",
          billId: bill.id,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");
      setSuccessMsg(
        `Bill ${bill.billNumber} cancelled (${data.creditNoteNumber}). Released ${data.releasedAllocations} allocation(s) to customer credit.`
      );
      await loadWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Cancel failed");
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SAVE_TEMPLATE",
          template: {
            id: tplId || undefined,
            name: tplName,
            businessName: tplBizName,
            contactInfo: tplContact,
            logoUrl: tplLogoUrl || null,
            headerText: tplHeaderText || null,
            footerText: tplFooterText || null,
            signatureUrl: tplSigUrl || null,
            showPhotoColumn: tplShowPhoto,
            visibleColumns: tplVisibleCols,
            fontSizePx: tplFontSize,
            paperSize: tplPaperSize,
            notesAndTerms: tplNotesTerms || null,
            isDefault: tplIsDefault,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save template");
      setSuccessMsg("Saved bill template");
      await loadWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save template failed");
    }
  };

  const renderBillToCanvas = async (b: BillRow): Promise<HTMLCanvasElement | null> => {
    if (!b.previewHtml || typeof document === "undefined") return null;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-9999px";
    iframe.style.top = "0";
    iframe.style.width = "800px";
    iframe.style.height = "1200px";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return null;
      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <base href="${window.location.origin}/" />
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      border-color: #e2e8f0;
      outline-color: transparent;
    }
    html, body {
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      color: #0f172a;
      font-family: Arial, sans-serif;
    }
  </style>
</head>
<body>
  <div id="invoice-root" style="display:inline-block;background:#ffffff;">${b.previewHtml}</div>
</body>
</html>`);
      iframeDoc.close();

      const rootEl = iframeDoc.getElementById("invoice-root") as HTMLElement;
      const imgs = Array.from(rootEl.querySelectorAll("img"));
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete && img.naturalHeight !== 0) {
                resolve();
                return;
              }
              img.onload = () => resolve();
              img.onerror = () => resolve();
            })
        )
      );

      const targetEl = (rootEl.firstElementChild as HTMLElement) || rootEl;
      return await html2canvas(targetEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        windowWidth: 800,
      });
    } finally {
      document.body.removeChild(iframe);
    }
  };

  const buildBillPdfBlob = async (b: BillRow): Promise<Blob> => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const canvas = await renderBillToCanvas(b);
    if (canvas) {
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 24;
      const usableWidth = pageWidth - margin * 2;
      const renderedHeight = (canvas.height * usableWidth) / canvas.width;
      doc.addImage(imgData, "PNG", margin, margin, usableWidth, renderedHeight);
      return doc.output("blob");
    }

    doc.setFontSize(15);
    doc.text(`AM Jewellery — Bill ${b.billNumber}`, 40, 50);
    doc.setFontSize(10);
    doc.text(`Date: ${b.billDate}   Status: ${b.status}   Settlement: ${b.settlementStatus}`, 40, 72);
    doc.text(`Customer: ${b.customerName}`, 40, 90);
    doc.text(`Total Fine Gold Charge: ${b.totalFineGold} g fine`, 40, 118);
    doc.text(`Total Cash / Making Charge: INR ${b.totalCashRupees}`, 40, 136);
    doc.text(`Outstanding Fine: ${b.fineOutstanding} g   Outstanding INR: ${b.inrOutstanding}`, 40, 154);
    if (b.creditNoteNumber) {
      doc.text(`Credit Note: ${b.creditNoteNumber}`, 40, 174);
    }
    return doc.output("blob");
  };

  const handleDownloadBillPdf = async (b: BillRow) => {
    const blob = await buildBillPdfBlob(b);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${b.billNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const sendBillDirectlyToCustomerWhatsApp = useCallback(
    async (b: BillRow) => {
      setErrorMsg(null);
      setSuccessMsg(null);

      const cust = customerSummaries.find(
        (c) =>
          c.customerId === b.customerId ||
          c.name.toLowerCase() === b.customerName.toLowerCase()
      );
      const rawPhone = (cust?.phone || "").replace(/[^0-9]/g, "");
      if (!rawPhone || rawPhone.length < 10) {
        setErrorMsg(
          `Customer "${b.customerName}" does not have a valid 10-digit WhatsApp phone number saved in Customers & Karigars.`
        );
        return;
      }

      setSendingWaBillId(b.id);
      try {
        // Check WhatsApp connection status first
        const statusRes = await fetch("/api/whatsapp");
        const statusData = statusRes.ok ? await statusRes.json() : null;
        if (statusData) setWaState(statusData);

        if (!statusData?.isReady) {
          // Try auto-reconnecting saved session first before showing QR modal
          const connectRes = await fetch("/api/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "CONNECT" }),
          });
          const connectData = connectRes.ok ? await connectRes.json() : null;
          if (connectData) setWaState(connectData);

          if (!connectData?.isReady) {
            // Only open QR modal if no saved session is connected yet
            setPendingWaBill(b);
            setWaQrModalOpen(true);
            setSendingWaBillId(null);
            return;
          }
        }

        // Generate the exact visual PDF of the bill
        const pdfBlob = await buildBillPdfBlob(b);
        if (!pdfBlob) {
          throw new Error("Could not render invoice PDF for WhatsApp.");
        }
        const pdfBase64 = await blobToBase64(pdfBlob);

        // Send the PDF file directly to customer's WhatsApp number via backend socket
        const sendRes = await fetch("/api/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "SEND_BILL",
            phone: rawPhone,
            customerName: b.customerName,
            billNumber: b.billNumber,
            pdfBase64,
          }),
        });
        const sendData = await sendRes.json();
        if (!sendRes.ok) {
          if (sendData?.needsQr) {
            setPendingWaBill(b);
            setWaQrModalOpen(true);
            await refreshWaStatus();
            return;
          }
          throw new Error(sendData?.error || "Failed to send bill PDF on WhatsApp");
        }

        setSuccessMsg(
          `✅ Bill ${b.billNumber} PDF sent directly to ${b.customerName} (${sendData.phone}) on WhatsApp!`
        );
        setShareModalBill(null);
      } catch (err: any) {
        setErrorMsg(err?.message || "Failed to send PDF on WhatsApp");
      } finally {
        setSendingWaBillId(null);
      }
    },
    [customerSummaries, refreshWaStatus]
  );

  // Poll WhatsApp status while QR modal is open or connecting, and auto-send pending bill once connected
  useEffect(() => {
    if (!waQrModalOpen && waState.status !== "connecting" && waState.status !== "qr") {
      return;
    }
    const timer = setInterval(async () => {
      const latest = await refreshWaStatus();
      if (latest?.isReady) {
        setWaQrModalOpen(false);
        if (pendingWaBill) {
          const billToSend = pendingWaBill;
          setPendingWaBill(null);
          void sendBillDirectlyToCustomerWhatsApp(billToSend);
        }
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [waQrModalOpen, waState.status, pendingWaBill, refreshWaStatus, sendBillDirectlyToCustomerWhatsApp]);

  const handleOpenWhatsAppShare = async (b: BillRow) => {
    setErrorMsg(null);
    setShareStatusNote(null);
    await sendBillDirectlyToCustomerWhatsApp(b);
  };

  const handleNativeFileShare = async () => {
    if (!shareModalBill) return;
    await sendBillDirectlyToCustomerWhatsApp(shareModalBill);
  };

  const handleManualAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAllocBillId || !manualAllocReceiptKey || !manualAllocAmount) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    const [kind, rId] = manualAllocReceiptKey.split(":");
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ALLOCATE_PAYMENT",
        customerId,
        allocations: [
          kind === "GOLD"
            ? { billId: manualAllocBillId, goldReceiptId: rId, allocatedFineWeight: manualAllocAmount }
            : { billId: manualAllocBillId, cashReceiptId: rId, allocatedRupees: manualAllocAmount },
        ],
        idempotencyKey: `ui_alloc_${Date.now()}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || "Allocation failed");
    } else {
      setManualAllocAmount("");
      setSuccessMsg("Allocated payment to bill.");
      await loadWorkspace();
    }
  };

  const handleUndoAllocation = async (allocationId: string) => {
    const reason = window.prompt("Reason for undoing allocation:");
    if (!reason) return;
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "UNDO_ALLOCATION", allocationId, reason }),
    });
    const data = await res.json();
    if (!res.ok) setErrorMsg(data.error || "Undo failed");
    else {
      setSuccessMsg("Allocation undone.");
      await loadWorkspace();
    }
  };

  const handleReverseGoldReceipt = async (receiptId: string) => {
    const reason = window.prompt("Reason for reversing Gold Receipt:");
    if (!reason) return;
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REVERSE_GOLD_RECEIPT", receiptId, reason }),
    });
    const data = await res.json();
    if (!res.ok) setErrorMsg(data.error || "Reversal failed");
    else {
      setSuccessMsg("Gold receipt reversed.");
      await loadWorkspace();
    }
  };

  const handleReverseCashReceipt = async (receiptId: string) => {
    const reason = window.prompt("Reason for reversing Cash Receipt:");
    if (!reason) return;
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REVERSE_CASH_RECEIPT", receiptId, reason }),
    });
    const data = await res.json();
    if (!res.ok) setErrorMsg(data.error || "Reversal failed");
    else {
      setSuccessMsg("Cash receipt reversed.");
      await loadWorkspace();
    }
  };

  const handleOpenConsolidatedStatement = async () => {
    if (!customerId) return;
    setErrorMsg(null);
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONSOLIDATED_STATEMENT", customerId }),
    });
    const data = await res.json();
    if (!res.ok) setErrorMsg(data.error || "Failed to load statement");
    else setConsolidatedStmt(data.statement);
  };

  if (!actor) {
    return <div className="p-6 text-xs text-slate-600">Loading billing workspace...</div>;
  }

  return (
    <AppShell actor={actor}>
      <div className="p-4 space-y-4 max-w-[1440px] mx-auto print:hidden">
        {/* Header & Customer Selector */}
        <div className="bg-white border border-slate-300 rounded-xs p-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              Billing &amp; Customer Settlement
            </h1>
            <p className="text-[11px] text-slate-600">
              Fine gold and INR balances are tracked separately. Posting delivers finished goods; production and karigar recovery remain independent.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                setWaQrModalOpen(true);
                if (!waState.isReady) {
                  const res = await fetch("/api/whatsapp", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "CONNECT" }),
                  });
                  if (res.ok) setWaState(await res.json());
                } else {
                  await refreshWaStatus();
                }
              }}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-xs border flex items-center gap-1.5 cursor-pointer ${
                waState.isReady
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                  : "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
              }`}
              title="Link your WhatsApp once to send Bill PDFs directly to customer numbers"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  waState.isReady ? "bg-emerald-600" : "bg-amber-500 animate-pulse"
                }`}
              />
              {waState.isReady
                ? `WhatsApp PDF Sender: Connected${waState.connectedUser ? ` (${waState.connectedUser})` : ""}`
                : "Link WhatsApp (Direct PDF Sender)"}
            </button>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">Customer:</label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setSelectedOrderLines({});
                  setDraftId(undefined);
                }}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded-xs bg-white min-w-[220px]"
              >
                <option value="">-- All Customers --</option>
                {customerSummaries.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.name} ({c.customerCode})
                  </option>
                ))}
              </select>
              {customerId && (
                <Link
                  href={`/customers/${customerId}`}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xs"
                >
                  Customer Profile →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Customer Balance Strip */}
        {activeCustomer && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-300 rounded-xs p-2.5">
              <div className="text-[11px] text-slate-500 font-semibold">Fine Gold Owed</div>
              <div className="text-base font-bold font-mono tabular-nums text-red-700">
                {Number(activeCustomer.fineOwed).toFixed(3)} g
              </div>
            </div>
            <div className="bg-white border border-slate-300 rounded-xs p-2.5">
              <div className="text-[11px] text-slate-500 font-semibold">Fine Gold Advance / Credit</div>
              <div className="text-base font-bold font-mono tabular-nums text-emerald-700">
                {Number(activeCustomer.fineAdvance).toFixed(3)} g
              </div>
            </div>
            <div className="bg-white border border-slate-300 rounded-xs p-2.5">
              <div className="text-[11px] text-slate-500 font-semibold">INR Owed</div>
              <div className="text-base font-bold font-mono tabular-nums text-red-700">
                ₹{Number(activeCustomer.inrOwed).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="bg-white border border-slate-300 rounded-xs p-2.5">
              <div className="text-[11px] text-slate-500 font-semibold">INR Advance / Credit</div>
              <div className="text-base font-bold font-mono tabular-nums text-emerald-700">
                ₹{Number(activeCustomer.inrAdvance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-300 text-red-800 px-3 py-2 rounded-xs text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-2 rounded-xs text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-slate-300">
          {(
            [
              ["new-bill", "Create Bill & Deliver"],
              ["bills", `Bills & History (${bills.length})`],
              ["collections", "Receive Gold & Cash"],
              ["templates", "Bill Templates"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-3 py-2 text-xs font-semibold border-t border-l border-r rounded-t-xs cursor-pointer ${
                activeTab === id
                  ? "bg-white border-slate-300 text-blue-700 -mb-px pb-2.5"
                  : "bg-slate-100 border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* TAB 1: CREATE BILL & DELIVER */}
        {activeTab === "new-bill" && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-300 rounded-xs p-3 flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Bill Type:</span>
                <select
                  value={billType}
                  onChange={(e) =>
                    setBillType(e.target.value as "ORDER_DELIVERY" | "MANUAL_COMMERCIAL")
                  }
                  className="px-2 py-1 border border-slate-300 rounded-xs"
                >
                  <option value="ORDER_DELIVERY">Completed Orders Delivery Bill</option>
                  <option value="MANUAL_COMMERCIAL">Manual Commercial Bill (No Stock Movement)</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Bill Date:</span>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Template:</span>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded-xs"
                >
                  <option value="">Default (V1 Classic)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyFineAdvance}
                    onChange={(e) => setApplyFineAdvance(e.target.checked)}
                  />
                  <span>Apply Fine Advance</span>
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyInrAdvance}
                    onChange={(e) => setApplyInrAdvance(e.target.checked)}
                  />
                  <span>Apply INR Advance</span>
                </label>
              </div>
            </div>

            {billType === "ORDER_DELIVERY" ? (
              <div className="bg-white border border-slate-300 rounded-xs overflow-x-auto">
                <div className="p-2.5 bg-slate-100 border-b border-slate-300 text-xs font-bold text-slate-800">
                  1. Select Completed Orders ({customerId ? activeCustomer?.name : "Select a customer above"})
                </div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-300 text-slate-700">
                      <th className="p-2 text-center w-8">Sel</th>
                      <th className="p-2 text-left">Bag #</th>
                      <th className="p-2 text-left">Photo</th>
                      <th className="p-2 text-left">Order Name</th>
                      <th className="p-2 text-left">Completed</th>
                      <th className="p-2 text-right">Gross (g)</th>
                      <th className="p-2 text-right">Stone (g)</th>
                      <th className="p-2 text-right">Net Metal (g)</th>
                      <th className="p-2 text-right">Touch</th>
                      <th className="p-2 text-left">Eligibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-4 text-center text-slate-500">
                          No orders found for this customer.
                        </td>
                      </tr>
                    ) : (
                      orders.map((ord) => {
                        const checked = Boolean(selectedOrderLines[ord.id]);
                        return (
                          <tr
                            key={ord.id}
                            className={`border-b border-slate-200 ${
                              ord.eligibility !== "ELIGIBLE" ? "bg-slate-50 text-slate-400" : "hover:bg-blue-50/40"
                            }`}
                          >
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                disabled={ord.eligibility !== "ELIGIBLE"}
                                checked={checked}
                                onChange={() => toggleOrderSelection(ord)}
                              />
                            </td>
                            <td className="p-2 font-mono font-semibold text-slate-800">
                              #{ord.bagNumber}
                            </td>
                            <td className="p-2">
                              {ord.photoUrl ? (
                                <img
                                  src={ord.photoUrl}
                                  alt={ord.orderName}
                                  className="w-7 h-7 object-cover border border-slate-300 rounded-xs"
                                />
                              ) : (
                                <span className="text-[10px] text-slate-400">—</span>
                              )}
                            </td>
                            <td className="p-2 font-semibold">{ord.orderName}</td>
                            <td className="p-2 font-mono text-[11px]">
                              {ord.completedAt ? ord.completedAt.slice(0, 10) : "—"}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums">{ord.grossWeight}</td>
                            <td className="p-2 text-right font-mono tabular-nums">{ord.stoneWeight}</td>
                            <td className="p-2 text-right font-mono tabular-nums font-semibold">
                              {ord.netWeight}
                            </td>
                            <td className="p-2 text-right font-mono">{ord.touchPercent}%</td>
                            <td className="p-2">
                              <span
                                className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-xs border ${
                                  ord.eligibility === "ELIGIBLE"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                    : "bg-slate-100 text-slate-600 border-slate-300"
                                }`}
                              >
                                {ord.ineligibleReason}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white border border-slate-300 rounded-xs p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="text-xs font-bold text-slate-800">
                    Manual Commercial Lines (Service / Fine Charge / Stone INR / Discount — No Physical Stock Change)
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setManualLines((p) => [
                        ...p,
                        {
                          lineType: "MANUAL_SERVICE",
                          description: "",
                          extraFineCharge: "0",
                          fineDiscount: "0",
                          makingChargesRupees: "0",
                          stoneChargeRupees: "0",
                          rupeeDiscount: "0",
                          adjustmentReason: "",
                        },
                      ])
                    }
                    className="px-2 py-1 text-xs bg-slate-100 border border-slate-300 rounded-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Line
                  </button>
                </div>
                {manualLines.map((ml, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs border-t border-slate-200 pt-2">
                    <select
                      value={ml.lineType}
                      onChange={(e) => {
                        const copy = [...manualLines];
                        copy[idx].lineType = e.target.value as ManualLineDraft["lineType"];
                        setManualLines(copy);
                      }}
                      className="col-span-2 px-1.5 py-1 border border-slate-300 rounded-xs"
                    >
                      <option value="MANUAL_SERVICE">Service (INR)</option>
                      <option value="MANUAL_FINE_CHARGE">Fine Charge (g)</option>
                      <option value="MANUAL_STONE_INR">Stone (INR)</option>
                      <option value="MANUAL_DISCOUNT">Discount</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Description"
                      value={ml.description}
                      onChange={(e) => {
                        const copy = [...manualLines];
                        copy[idx].description = e.target.value;
                        setManualLines(copy);
                      }}
                      className="col-span-3 px-2 py-1 border border-slate-300 rounded-xs"
                    />
                    <input
                      type="number"
                      step="0.001"
                      placeholder="Fine +g"
                      value={ml.extraFineCharge}
                      onChange={(e) => {
                        const copy = [...manualLines];
                        copy[idx].extraFineCharge = e.target.value;
                        setManualLines(copy);
                      }}
                      className="col-span-1 px-1.5 py-1 border border-slate-300 rounded-xs font-mono"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="INR +"
                      value={ml.makingChargesRupees}
                      onChange={(e) => {
                        const copy = [...manualLines];
                        copy[idx].makingChargesRupees = e.target.value;
                        setManualLines(copy);
                      }}
                      className="col-span-2 px-1.5 py-1 border border-slate-300 rounded-xs font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Reason (required for discounts)"
                      value={ml.adjustmentReason}
                      onChange={(e) => {
                        const copy = [...manualLines];
                        copy[idx].adjustmentReason = e.target.value;
                        setManualLines(copy);
                      }}
                      className="col-span-3 px-2 py-1 border border-slate-300 rounded-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setManualLines((p) => p.filter((_, i) => i !== idx))}
                      className="col-span-1 text-red-600 flex justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* V1-Faithful Horizontal Quick-Entry Table & Live Preview with Order Photos */}
            {billType === "ORDER_DELIVERY" && Object.keys(selectedOrderLines).length > 0 && (
              <div className="space-y-4">
                {/* Step 2: Horizontal Quick-Entry Table for Selected Orders */}
                <div className="bg-white border border-slate-300 rounded-xs shadow-xs overflow-hidden">
                  <div className="bg-slate-100 border-b border-slate-300 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-800">
                        2. Configure Selected Orders — Horizontal Quick Entry ({Object.keys(selectedOrderLines).length}{" "}
                        selected)
                      </span>
                      <span className="ml-2 text-[11px] text-slate-600">
                        Edit weights, base mode, stone/AD adjustments, wastage %, and rupees side-by-side in one row per order
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-blue-700">
                      Formula: Gross Billing Wt = Selected Base Wt + Custom Stone + Custom AD • Fine Gold = Gross × (Touch% + Wastage%)
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-300 text-slate-700">
                          <th className="py-2 px-2.5 text-left font-bold whitespace-nowrap">Order & Photo</th>
                          <th className="py-2 px-2 text-left font-bold whitespace-nowrap">Base Weight Mode</th>
                          <th className="py-2 px-2 text-right font-bold whitespace-nowrap">Finish Wt (g)</th>
                          <th className="py-2 px-2 text-right font-bold whitespace-nowrap">Net Gold Wt (g)</th>
                          <th className="py-2 px-2 text-right font-bold whitespace-nowrap">+/- Stone KL (g)</th>
                          <th className="py-2 px-2 text-right font-bold whitespace-nowrap">+/- AD Wt (g)</th>
                          <th className="py-2 px-2 text-left font-bold whitespace-nowrap">Wastage / Making %</th>
                          <th className="py-2 px-2 text-right font-bold whitespace-nowrap bg-emerald-50/60">
                            Gross Wt (g)
                          </th>
                          <th className="py-2 px-2 text-right font-bold whitespace-nowrap bg-amber-50/70">
                            Total Fine (g)
                          </th>
                          <th className="py-2 px-2.5 text-right font-bold whitespace-nowrap">Rupees (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {Object.values(selectedOrderLines).map((draft) => {
                          const ord = orders.find((o) => o.id === draft.orderId);
                          if (!ord) return null;
                          const origStone = Number(ord.stoneWeight || 0);
                          const touch = Number(ord.touchPercent || 0);
                          const makingPts = Number(draft.makingPercentagePoints || 0);
                          const effectivePurity = touch + makingPts;
                          const baseWt =
                            draft.baseWeightOption === "with_stones"
                              ? Number(draft.finishWeight || 0)
                              : Number(draft.netWeight || 0);
                          const customStone = Number(draft.customStoneWeight || 0);
                          const customAd = Number(draft.customAdWeight || 0);
                          const totalCustomStone = customStone + customAd;
                          const finalBillingWt = Math.max(0, baseWt + totalCustomStone);
                          const lineFine =
                            (finalBillingWt * effectivePurity) / 100 +
                            Number(draft.extraFineCharge || 0) -
                            Number(draft.fineDiscount || 0);

                          return (
                            <tr key={draft.orderId} className="hover:bg-blue-50/20 align-top">
                              {/* 1. Order Info & Photo */}
                              <td className="py-2.5 px-2.5 min-w-[170px]">
                                <div className="flex items-center gap-2">
                                  {ord.photoUrl ? (
                                    <img
                                      src={ord.photoUrl}
                                      alt={ord.orderName}
                                      className="w-10 h-10 object-cover rounded-xs border border-slate-300 shrink-0"
                                      title={`#${ord.bagNumber} ${ord.orderName}`}
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-xs border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-[9px] text-slate-400 shrink-0">
                                      No Img
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-bold text-slate-900">
                                      #{ord.bagNumber} — {ord.orderName}
                                    </div>
                                    <div className="inline-block mt-0.5 px-1.5 py-0.5 bg-emerald-50 border border-emerald-300 rounded-xs text-[10px] font-mono font-bold text-emerald-800">
                                      Touch: {ord.touchPercent}%
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">
                                      Orig: {ord.grossWeight}g (St: {ord.stoneWeight}g)
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* 2. Base Weight Mode Toggle (Pure Gold vs Final With Stones) */}
                              <td className="py-2.5 px-2 min-w-[155px]">
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateOrderLine(draft.orderId, {
                                        baseWeightOption: "pure_gold",
                                      })
                                    }
                                    className={`px-2 py-1 rounded-xs text-left text-[11px] font-semibold border transition-colors cursor-pointer ${
                                      draft.baseWeightOption === "pure_gold"
                                        ? "bg-blue-600 text-white border-blue-600"
                                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                                    }`}
                                  >
                                    ● Pure Gold ({Number(draft.netWeight || 0).toFixed(2)}g)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateOrderLine(draft.orderId, {
                                        baseWeightOption: "with_stones",
                                      })
                                    }
                                    className={`px-2 py-1 rounded-xs text-left text-[11px] font-semibold border transition-colors cursor-pointer ${
                                      draft.baseWeightOption === "with_stones"
                                        ? "bg-purple-600 text-white border-purple-600"
                                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                                    }`}
                                  >
                                    ● With Stones ({Number(draft.finishWeight || 0).toFixed(2)}g)
                                  </button>
                                </div>
                              </td>

                              {/* 3. Editable Finish Weight (g) */}
                              <td className="py-2.5 px-2 min-w-[110px]">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={draft.finishWeight}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const fWeight = parseFloat(val) || 0;
                                    const nWeight = Math.max(0, fWeight - origStone);
                                    updateOrderLine(draft.orderId, {
                                      finishWeight: val,
                                      netWeight: nWeight.toFixed(3),
                                    });
                                  }}
                                  className={`w-24 px-2 py-1.5 text-right text-xs border rounded-xs font-mono font-bold ${
                                    draft.baseWeightOption === "with_stones"
                                      ? "border-purple-500 bg-purple-50/40 text-purple-950"
                                      : "border-slate-300 bg-white text-slate-800"
                                  }`}
                                  placeholder="0.000"
                                />
                                <div className="text-[10px] text-right text-slate-500 mt-0.5">
                                  Final: {ord.grossWeight}g
                                </div>
                              </td>

                              {/* 4. Editable Net Gold Weight (g) */}
                              <td className="py-2.5 px-2 min-w-[110px]">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={draft.netWeight}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const nWeight = parseFloat(val) || 0;
                                    const fWeight = nWeight + origStone;
                                    updateOrderLine(draft.orderId, {
                                      netWeight: val,
                                      finishWeight: fWeight.toFixed(3),
                                    });
                                  }}
                                  className={`w-24 px-2 py-1.5 text-right text-xs border rounded-xs font-mono font-bold ${
                                    draft.baseWeightOption === "pure_gold"
                                      ? "border-blue-500 bg-blue-50/40 text-blue-950"
                                      : "border-slate-300 bg-white text-slate-800"
                                  }`}
                                  placeholder="0.000"
                                />
                                <div className="text-[10px] text-right text-slate-500 mt-0.5">
                                  Gold: {ord.netWeight}g
                                </div>
                              </td>

                              {/* 5. Custom Stone / Kales Weight (+ or -) */}
                              <td className="py-2.5 px-2 min-w-[105px]">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={draft.customStoneWeight}
                                  onChange={(e) =>
                                    updateOrderLine(draft.orderId, {
                                      customStoneWeight: e.target.value,
                                    })
                                  }
                                  className="w-20 px-2 py-1.5 text-right text-xs border border-amber-300 rounded-xs bg-white font-mono"
                                  placeholder="0"
                                />
                                <div className="text-[10px] text-right text-slate-500 mt-0.5">
                                  + add / - less
                                </div>
                              </td>

                              {/* 6. Custom AD Weight (+ or -) */}
                              <td className="py-2.5 px-2 min-w-[105px]">
                                <input
                                  type="number"
                                  step="0.001"
                                  value={draft.customAdWeight}
                                  onChange={(e) =>
                                    updateOrderLine(draft.orderId, {
                                      customAdWeight: e.target.value,
                                    })
                                  }
                                  className="w-20 px-2 py-1.5 text-right text-xs border border-amber-300 rounded-xs bg-white font-mono"
                                  placeholder="0"
                                />
                                <div className="text-[10px] text-right text-slate-500 mt-0.5">
                                  + add / - less
                                </div>
                              </td>

                              {/* 7. Wastage / Making % (Preset 0-10 + Custom Input) */}
                              <td className="py-2.5 px-2 min-w-[185px]">
                                <div className="flex items-center gap-1">
                                  <select
                                    value={
                                      WASTAGE_PRESET_OPTIONS.includes(draft.makingPercentagePoints)
                                        ? draft.makingPercentagePoints
                                        : "CUSTOM"
                                    }
                                    onChange={(e) => {
                                      if (e.target.value !== "CUSTOM") {
                                        updateOrderLine(draft.orderId, {
                                          makingPercentagePoints: e.target.value,
                                        });
                                      }
                                    }}
                                    className="px-1.5 py-1.5 text-xs border border-slate-300 rounded-xs bg-white font-semibold"
                                    title="Preset Wastage (0 to 10)"
                                  >
                                    {WASTAGE_PRESET_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}%
                                      </option>
                                    ))}
                                    <option value="CUSTOM">Custom</option>
                                  </select>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={draft.makingPercentagePoints}
                                    onChange={(e) =>
                                      updateOrderLine(draft.orderId, {
                                        makingPercentagePoints: e.target.value,
                                      })
                                    }
                                    className="w-16 px-2 py-1.5 text-right text-xs border border-slate-300 rounded-xs bg-white font-mono font-bold"
                                    placeholder="4"
                                  />
                                </div>
                                <div className="text-[10px] font-semibold text-blue-700 mt-0.5">
                                  {touch}% + {makingPts} = {effectivePurity.toFixed(2).replace(/\.?0+$/, "")}%
                                </div>
                              </td>

                              {/* 8. Calculated Gross Billing Wt */}
                              <td className="py-2.5 px-2 text-right font-mono bg-emerald-50/40 min-w-[100px]">
                                <div className="text-sm font-bold text-emerald-800">
                                  {finalBillingWt.toFixed(3)} g
                                </div>
                                {totalCustomStone !== 0 && (
                                  <div className="text-[10px] text-slate-600">
                                    ({baseWt.toFixed(2)} {totalCustomStone >= 0 ? "+" : ""}
                                    {totalCustomStone.toFixed(2)})
                                  </div>
                                )}
                              </td>

                              {/* 9. Calculated Fine Gold Total */}
                              <td className="py-2.5 px-2 text-right font-mono bg-amber-50/50 min-w-[105px]">
                                <div className="text-sm font-bold text-amber-950">
                                  {lineFine.toFixed(3)} g
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  @ {effectivePurity.toFixed(1)}%
                                </div>
                              </td>

                              {/* 10. Rupees Amount (₹) */}
                              <td className="py-2.5 px-2.5 text-right min-w-[115px]">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={draft.makingChargesRupees}
                                  onChange={(e) =>
                                    updateOrderLine(draft.orderId, {
                                      makingChargesRupees: e.target.value,
                                    })
                                  }
                                  className="w-24 px-2 py-1.5 text-right text-xs border border-slate-300 rounded-xs bg-white font-mono font-bold"
                                  placeholder="0.00"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Step 3: Side-by-Side Complete Billing Summary & Live AM Jewellers Invoice Preview */}
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                  {/* Left 5 Cols: Advance Gold, Notes & Submit Action */}
                  <div className="xl:col-span-5 bg-indigo-50/70 border border-indigo-200 rounded-xs p-4 space-y-3 text-xs">
                    <div className="text-sm font-bold text-indigo-950">
                      3. Complete Billing Summary & Submit
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                          Advance Gold to Use (g fine)
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          max={draftTotals.availAdv}
                          value={customAdvanceGoldUsed}
                          onChange={(e) => setCustomAdvanceGoldUsed(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xs bg-white font-mono"
                          placeholder="0.000"
                        />
                        <span className="text-[10px] text-slate-500">
                          Available Advance: {draftTotals.availAdv.toFixed(3)} g fine
                        </span>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                          Billing Notes (Optional)
                        </label>
                        <input
                          type="text"
                          value={billNotes}
                          onChange={(e) => setBillNotes(e.target.value)}
                          placeholder="Any additional notes for this bill..."
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-amber-900 mb-0.5">
                          Admin Internal Making Charge (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={adminMakingCharge}
                          onChange={(e) => setAdminMakingCharge(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-1.5 border border-amber-300 rounded-xs bg-amber-50/40 font-mono"
                        />
                        <span className="text-[10px] text-amber-800">
                          Dashboard only — not shown on customer bill PDF/preview
                        </span>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xs p-3 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Current Order Subtotal (Fine Gold):</span>
                        <span className="font-mono font-semibold">
                          {draftTotals.fineTotal.toFixed(3)} g fine
                        </span>
                      </div>
                      {draftTotals.advUsed > 0 && (
                        <div className="flex justify-between text-red-700">
                          <span>Less: Advance Gold Used:</span>
                          <span className="font-mono font-semibold">
                            -{draftTotals.advUsed.toFixed(3)} g fine
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-sm border-t border-slate-200 pt-1.5">
                        <span className="text-slate-900">Customer Owes (Current Order):</span>
                        <span className="font-mono text-orange-600">
                          {draftTotals.netCustomerOwesFine.toFixed(3)} g fine gold
                        </span>
                      </div>
                      {draftTotals.pastJamaFine > 0 && (
                        <div className="flex justify-between text-red-700 pt-1">
                          <span>Past Jama Gold (Previous Unpaid Bills):</span>
                          <span className="font-mono font-semibold">
                            +{draftTotals.pastJamaFine.toFixed(3)} g fine
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-sm border-t border-slate-200 pt-1.5">
                        <span className="text-slate-900">Grand Total Fine Gold Balance:</span>
                        <span className="font-mono text-blue-800">
                          {draftTotals.grandTotalFineWithPast.toFixed(3)} g fine
                        </span>
                      </div>
                      {draftTotals.inrTotal > 0 && (
                        <div className="flex justify-between font-semibold text-slate-800 pt-1">
                          <span>Rupees Amount:</span>
                          <span className="font-mono">
                            ₹{draftTotals.inrTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        disabled={submitting || !customerId}
                        onClick={() => handleBillSubmit("SAVE_DRAFT")}
                        className="px-4 py-2 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded-xs cursor-pointer"
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        disabled={submitting || !customerId}
                        onClick={() => handleBillSubmit("POST_BILL_AND_DELIVER")}
                        className="flex-1 px-5 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xs cursor-pointer shadow-xs"
                      >
                        {submitting
                          ? "Creating Bill..."
                          : `Create Bill & Deliver (${draftTotals.netCustomerOwesFine.toFixed(3)} g Fine Gold)`}
                      </button>
                    </div>
                  </div>

                  {/* Right 7 Cols: Simple Minimalist Invoice Preview with AM Jewellery Logo */}
                  <div className="xl:col-span-7 bg-white border border-slate-300 rounded-xs p-8 shadow-xs space-y-6 text-slate-900">
                    {/* Top Row: INVOICE on Left, AM Jewellery Logo on Right */}
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h2 className="text-3xl font-normal tracking-widest text-slate-900 uppercase">
                          INVOICE
                        </h2>
                        <div className="mt-8 text-xs text-slate-500">
                          <strong className="text-slate-700 font-semibold">AM Jewellery,</strong>{" "}
                          Shekh Nayem, Patavadi Chowk • Phone: 9907047429
                        </div>
                      </div>
                      <div className="flex flex-col items-center text-center shrink-0">
                        <img
                          src="/am-logo-icon.png"
                          alt="AM Jewellery"
                          className="w-16 h-20 object-contain"
                        />
                        <div className="mt-1.5 text-sm font-serif tracking-[0.22em] text-slate-800 uppercase">
                          AM JEWELLERY
                        </div>
                      </div>
                    </div>

                    {/* BILL TO (Left) & Invoice Meta (Right) */}
                    <div className="flex flex-wrap justify-between items-start gap-6 pt-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-900 uppercase tracking-wider mb-1">
                          BILL TO
                        </div>
                        <div className="font-semibold text-slate-900 text-sm">
                          {activeCustomer?.name || "—"}
                        </div>
                        {activeCustomer?.phone && (
                          <div className="text-slate-700">Phone: {activeCustomer.phone}</div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs min-w-[210px]">
                        <span className="text-slate-600">Invoice No.:</span>
                        <span className="text-right font-bold text-slate-900 font-mono">
                          PREVIEW
                        </span>
                        <span className="text-slate-600">Issue date:</span>
                        <span className="text-right font-bold text-slate-900 font-mono">
                          {billDate}
                        </span>
                        <span className="text-slate-600 pt-1">Reference:</span>
                        <span className="text-right font-bold text-slate-900 font-mono pt-1">
                          {Object.values(selectedOrderLines)
                            .map((d) => {
                              const o = orders.find((ord) => ord.id === d.orderId);
                              return o ? `#${o.bagNumber}` : "";
                            })
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Clean Minimalist Items Table */}
                    <div className="overflow-x-auto pt-2">
                      <table className="w-full border-collapse border border-slate-200 text-xs">
                        <thead>
                          <tr className="bg-slate-100/90 text-slate-900 uppercase text-[11px] tracking-wide">
                            <th className="border border-slate-200 px-2 py-2.5 text-center font-bold">
                              SR
                            </th>
                            <th className="border border-slate-200 px-2 py-2.5 text-center font-bold">
                              PHOTO
                            </th>
                            <th className="border border-slate-200 px-3 py-2.5 text-left font-bold">
                              ORDER DETAIL
                            </th>
                            <th className="border border-slate-200 px-2 py-2.5 text-right font-bold">
                              GROSS WEIGHT
                            </th>
                            <th className="border border-slate-200 px-2 py-2.5 text-right font-bold">
                              STONE WEIGHT
                            </th>
                            <th className="border border-slate-200 px-2 py-2.5 text-right font-bold">
                              AD WEIGHT
                            </th>
                            <th className="border border-slate-200 px-2 py-2.5 text-right font-bold">
                              NET WEIGHT
                            </th>
                            <th className="border border-slate-200 px-2 py-2.5 text-center font-bold">
                              WASTAGE
                            </th>
                            <th className="border border-slate-200 px-2.5 py-2.5 text-right font-bold">
                              FINE
                            </th>
                            <th className="border border-slate-200 px-2.5 py-2.5 text-right font-bold">
                              RUPEES
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(selectedOrderLines).map((draft, idx) => {
                            const ord = orders.find((o) => o.id === draft.orderId);
                            if (!ord) return null;
                            const touch = Number(ord.touchPercent || 0);
                            const makingPts = Number(draft.makingPercentagePoints || 0);
                            const baseWt =
                              draft.baseWeightOption === "with_stones"
                                ? Number(draft.finishWeight || 0)
                                : Number(draft.netWeight || 0);
                            const customStone = Number(draft.customStoneWeight || 0);
                            const customAd = Number(draft.customAdWeight || 0);
                            const finalBillingWt = Math.max(0, baseWt + customStone + customAd);
                            const lineFine =
                              (finalBillingWt * (touch + makingPts)) / 100 +
                              Number(draft.extraFineCharge || 0) -
                              Number(draft.fineDiscount || 0);
                            const lineInr =
                              Number(draft.makingChargesRupees || 0) +
                              Number(draft.stoneChargeRupees || 0) -
                              Number(draft.rupeeDiscount || 0);

                            return (
                              <tr key={draft.orderId} className="border-b border-slate-200">
                                <td className="border border-slate-200 px-2 py-2.5 text-center font-mono text-slate-600">
                                  {idx + 1}
                                </td>
                                <td className="border border-slate-200 px-2 py-1.5 text-center">
                                  {ord.photoUrl ? (
                                    <img
                                      src={ord.photoUrl}
                                      alt={ord.orderName}
                                      className="w-10 h-10 object-cover rounded-xs border border-slate-200 mx-auto"
                                      title={`#${ord.bagNumber} ${ord.orderName}`}
                                    />
                                  ) : (
                                    <span className="text-[10px] text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="border border-slate-200 px-3 py-2.5 font-medium text-slate-900">
                                  #{ord.bagNumber} - {ord.orderName} ({Number(ord.touchPercent).toFixed(2).replace(/\.?0+$/, "")}%)
                                </td>
                                <td className="border border-slate-200 px-2 py-2.5 text-right font-mono">
                                  {baseWt.toFixed(3)}
                                </td>
                                <td className="border border-slate-200 px-2 py-2.5 text-right font-mono">
                                  {customStone.toFixed(3)}
                                </td>
                                <td className="border border-slate-200 px-2 py-2.5 text-right font-mono">
                                  {customAd.toFixed(3)}
                                </td>
                                <td className="border border-slate-200 px-2 py-2.5 text-right font-mono font-semibold">
                                  {finalBillingWt.toFixed(3)}
                                </td>
                                <td className="border border-slate-200 px-2 py-2.5 text-center font-mono">
                                  {makingPts}%
                                </td>
                                <td className="border border-slate-200 px-2.5 py-2.5 text-right font-mono font-bold">
                                  {lineFine.toFixed(3)}
                                </td>
                                <td className="border border-slate-200 px-2.5 py-2.5 text-right font-mono">
                                  ₹{lineInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Right-Aligned Totals Box & Signature (Matching Reference Invoice) */}
                    <div className="flex flex-col items-end space-y-5 pt-1">
                      <div className="w-full sm:w-80 border border-slate-200 text-xs">
                        {draftTotals.pastJamaFine > 0 && (
                          <div className="flex justify-between items-center px-3.5 py-2 border-b border-slate-200 bg-white">
                            <span className="font-bold text-slate-700 uppercase">
                              PAST JAMA (FINE):
                            </span>
                            <span className="font-mono font-semibold text-red-700">
                              {draftTotals.pastJamaFine.toFixed(3)} g
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-slate-200 bg-white">
                          <span className="font-bold text-slate-700 uppercase">
                            TOTAL (FINE GOLD):
                          </span>
                          <span className="font-mono font-semibold text-slate-900">
                            {draftTotals.netCustomerOwesFine.toFixed(3)} g
                          </span>
                        </div>
                        {draftTotals.inrTotal > 0 && (
                          <div className="flex justify-between items-center px-3.5 py-2 border-b border-slate-200 bg-white">
                            <span className="font-bold text-slate-700 uppercase">
                              AMOUNT (INR):
                            </span>
                            <span className="font-mono font-semibold text-slate-900">
                              ₹{draftTotals.inrTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center px-3.5 py-3 bg-[#9e7c42] text-white font-bold">
                          <span className="uppercase tracking-wide">TOTAL DUE (FINE):</span>
                          <span className="font-mono text-sm">
                            {draftTotals.grandTotalFineWithPast.toFixed(3)} g
                          </span>
                        </div>
                      </div>

                      {/* Signature Area */}
                      <div className="text-right pt-2">
                        <div className="text-[11px] font-bold text-slate-900">
                          Issued by, signature:
                        </div>
                        <div
                          className="mt-2 text-2xl italic text-slate-800 select-none"
                          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
                        >
                          AM Jewellery
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Totals & Action Bar for Manual Commercial Bills */}
            {billType === "MANUAL_COMMERCIAL" && (
              <div className="bg-white border border-slate-300 rounded-xs p-3 flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-6 text-xs">
                  <div>
                    <span className="text-slate-500">Total Bill Charge (Fine): </span>
                    <strong className="font-mono text-blue-800">
                      {draftTotals.fineTotal.toFixed(3)} g
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Total Bill Charge (INR): </span>
                    <strong className="font-mono text-blue-800">
                      ₹{draftTotals.inrTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Admin Making (₹)"
                    title="Admin internal making charge (hidden from customer bill PDF/preview)"
                    value={adminMakingCharge}
                    onChange={(e) => setAdminMakingCharge(e.target.value)}
                    className="w-36 px-2 py-1.5 text-xs border border-amber-300 bg-amber-50/40 rounded-xs font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Bill notes..."
                    value={billNotes}
                    onChange={(e) => setBillNotes(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-slate-300 rounded-xs"
                  />
                  <button
                    type="button"
                    disabled={submitting || !customerId}
                    onClick={() => handleBillSubmit("SAVE_DRAFT")}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xs cursor-pointer"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !customerId}
                    onClick={() => handleBillSubmit("POST_BILL_AND_DELIVER")}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-xs cursor-pointer"
                  >
                    Post Bill &amp; Deliver
                  </button>
                </div>
              </div>
            )}

            {livePreviewHtml && (
              <div className="bg-slate-100 border border-slate-300 rounded-xs p-4 overflow-x-auto">
                <div className="text-xs font-bold text-slate-700 mb-2">
                  Generated Bill Preview (V1 Preserved Layout)
                </div>
                <div dangerouslySetInnerHTML={{ __html: livePreviewHtml }} />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: BILLS & HISTORY */}
        {activeTab === "bills" && (
          <div className="bg-white border border-slate-300 rounded-xs overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                  <th className="p-2 text-left">Bill #</th>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Customer</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Delivery</th>
                  <th className="p-2 text-left">Settlement</th>
                  <th className="p-2 text-right">Fine Total</th>
                  <th className="p-2 text-right">Fine Bal</th>
                  <th className="p-2 text-right">INR Total</th>
                  <th className="p-2 text-right">INR Bal</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-2 font-mono font-bold text-blue-800">{b.billNumber}</td>
                    <td className="p-2 font-mono">{b.billDate}</td>
                    <td className="p-2 font-semibold">{b.customerName}</td>
                    <td className="p-2">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-xs ${
                          b.status === "POSTED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-300"
                            : b.status === "CANCELLED"
                            ? "bg-red-50 text-red-700 border border-red-300"
                            : "bg-amber-50 text-amber-700 border border-amber-300"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="p-2 text-[11px]">{b.deliveryStatus}</td>
                    <td className="p-2 text-[11px] font-semibold">{b.settlementStatus}</td>
                    <td className="p-2 text-right font-mono tabular-nums">{Number(b.totalFineGold).toFixed(3)} g</td>
                    <td className="p-2 text-right font-mono tabular-nums font-semibold text-red-700">
                      {Number(b.fineOutstanding).toFixed(3)} g
                    </td>
                    <td className="p-2 text-right font-mono tabular-nums">₹{b.totalCashRupees}</td>
                    <td className="p-2 text-right font-mono tabular-nums font-semibold text-red-700">
                      ₹{b.inrOutstanding}
                    </td>
                    <td className="p-2 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setInspectBill(b)}
                        className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xs cursor-pointer"
                      >
                        Preview / Print
                      </button>
                      <button
                        type="button"
                        disabled={sendingWaBillId === b.id}
                        onClick={() => void handleOpenWhatsAppShare(b)}
                        className="px-2 py-1 text-[11px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-xs cursor-pointer"
                      >
                        {sendingWaBillId === b.id ? "Sending PDF..." : "WhatsApp PDF"}
                      </button>
                      {b.status === "POSTED" && actor.role === "OWNER_ADMIN" && (
                        <button
                          type="button"
                          onClick={() => handleCancelBill(b)}
                          className="px-2 py-1 text-[11px] bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: COLLECTIONS (GOLD & CASH) */}
        {activeTab === "collections" && (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Receive Fine Gold Only (No general karat selector) */}
            <form onSubmit={handleRecordGoldReceipt} className="bg-white border border-slate-300 rounded-xs p-3 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <div className="text-xs font-bold text-slate-900">
                  Receive Fine Gold ({fineReceiptConvention?.destinationAccountName || "Admin Fine Gold"})
                </div>
                {customerId && (
                  <Link
                    href={`/customers/${customerId}`}
                    className="text-[11px] font-semibold text-blue-700 hover:underline"
                  >
                    Full Receipt &amp; Advance Preview →
                  </Link>
                )}
              </div>
              {fineReceiptConvention?.mode === "UNCONFIGURED" ? (
                <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded-xs">
                  One-time owner setting required before receiving customer fine gold.{" "}
                  {customerId ? (
                    <Link href={`/customers/${customerId}`} className="font-bold underline">
                      Configure on Customer Profile →
                    </Link>
                  ) : (
                    "Select a customer and open their Customer Profile to configure Mode A or Mode B."
                  )}
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-slate-600 bg-slate-50 px-2 py-1 border border-slate-200 rounded-xs">
                    Weight Basis:{" "}
                    <strong>
                      {fineReceiptConvention?.mode === "PHYSICAL_AT_CONFIGURED_TOUCH"
                        ? `Mode B — Physical fine gold weight @ fixed ${Number(
                            fineReceiptConvention?.configuredTouch || 0
                          ).toFixed(2)}% touch`
                        : "Mode A — Fine gold received (g fine)"}
                    </strong>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold mb-0.5">
                        {fineReceiptConvention?.mode === "PHYSICAL_AT_CONFIGURED_TOUCH"
                          ? "Physical Weight (g) *"
                          : "Fine Gold (g fine) *"}
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        required
                        value={goldAmountReceived}
                        onChange={(e) => setGoldAmountReceived(e.target.value)}
                        placeholder="0.0000"
                        className="w-full px-2 py-1 border border-slate-300 rounded-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-0.5">Receipt Date</label>
                      <input
                        type="date"
                        value={goldDate}
                        onChange={(e) => setGoldDate(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-0.5">Settlement</label>
                      <select
                        value={goldAllocMode}
                        onChange={(e) => setGoldAllocMode(e.target.value as "OLDEST_FIRST" | "NONE")}
                        className="w-full px-2 py-1 border border-slate-300 rounded-xs"
                      >
                        <option value="OLDEST_FIRST">Oldest Bills First (Default)</option>
                        <option value="NONE">Keep as Unallocated Advance</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold mb-0.5">Reference / Note</label>
                      <input
                        type="text"
                        value={goldRef}
                        onChange={(e) => setGoldRef(e.target.value)}
                        placeholder="Optional ref/note"
                        className="w-full px-2 py-1 border border-slate-300 rounded-xs"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting || !customerId}
                    className="w-full py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                  >
                    Confirm Receipt
                  </button>
                </>
              )}

              <div className="pt-2 border-t border-slate-200 space-y-1 max-h-48 overflow-y-auto">
                {goldReceipts.map((r) => (
                  <div key={r.id} className="text-[11px] flex justify-between border-b border-slate-100 py-1">
                    <span>
                      <strong>{r.receiptNumber}</strong> ({r.businessDate}) — {r.totalGrossWeight}g ({r.totalFineWeight}g fine)
                    </span>
                    <span className="font-mono text-emerald-700">Credit: {r.unallocatedFineWeight}g</span>
                  </div>
                ))}
              </div>
            </form>

            {/* Receive Cash (INR) */}
            <form onSubmit={handleRecordCashReceipt} className="bg-white border border-slate-300 rounded-xs p-3 space-y-3">
              <div className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1.5">
                Receive Customer Cash / INR (Settles INR Charges Only)
              </div>
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2 rounded-xs text-[11px]">
                Note: Cash receipts do not increase gold stock and are never auto-converted to fine gold. Cross-unit gold/cash conversion requires an explicit future bullion rate settlement workflow.
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold mb-0.5">Date</label>
                  <input
                    type="date"
                    value={cashDate}
                    onChange={(e) => setCashDate(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-0.5">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-0.5">Mode</label>
                  <select
                    value={cashMode}
                    onChange={(e) => setCashMode(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded-xs"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-0.5">Allocation</label>
                  <select
                    value={cashAllocMode}
                    onChange={(e) => setCashAllocMode(e.target.value as "OLDEST_FIRST" | "NONE")}
                    className="w-full px-2 py-1 border border-slate-300 rounded-xs"
                  >
                    <option value="OLDEST_FIRST">Auto Oldest-First</option>
                    <option value="NONE">Keep as INR Advance</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting || !customerId}
                className="w-full py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
              >
                Post Customer Cash Receipt
              </button>

              <div className="pt-2 border-t border-slate-200 space-y-1 max-h-48 overflow-y-auto">
                {cashReceipts.map((r) => (
                  <div key={r.id} className="text-[11px] flex justify-between items-center border-b border-slate-100 py-1">
                    <span>
                      <strong>{r.receiptNumber}</strong> ({r.businessDate}, {r.paymentMode}) — ₹{r.amountRupees} [{r.status}]
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-700">Credit: ₹{r.unallocatedRupees}</span>
                      {actor.role === "OWNER_ADMIN" && r.status === "POSTED" && (
                        <button
                          type="button"
                          onClick={() => void handleReverseCashReceipt(r.id)}
                          className="text-[10px] text-red-700 hover:underline cursor-pointer"
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </form>
            </div>

            <div className="lg:col-span-2 bg-white border border-slate-300 rounded-xs p-3 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-900">
                  Manual Payment Allocation &amp; Reversals
                </span>
                <button
                  type="button"
                  onClick={() => void handleOpenConsolidatedStatement()}
                  className="px-2.5 py-1 bg-slate-800 text-white text-[11px] font-semibold rounded-xs cursor-pointer"
                >
                  Consolidated Customer Statement
                </button>
              </div>
              <form onSubmit={handleManualAllocate} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-semibold mb-0.5">Unallocated Receipt</label>
                  <select
                    value={manualAllocReceiptKey}
                    onChange={(e) => setManualAllocReceiptKey(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded-xs bg-white"
                  >
                    <option value="">Select receipt...</option>
                    {goldReceipts
                      .filter((r) => r.status === "POSTED" && Number(r.unallocatedFineWeight) > 0)
                      .map((r) => (
                        <option key={r.id} value={`GOLD:${r.id}`}>
                          {r.receiptNumber} (Gold credit: {r.unallocatedFineWeight} g)
                        </option>
                      ))}
                    {cashReceipts
                      .filter((r) => r.status === "POSTED" && Number(r.unallocatedRupees) > 0)
                      .map((r) => (
                        <option key={r.id} value={`CASH:${r.id}`}>
                          {r.receiptNumber} (Cash credit: ₹{r.unallocatedRupees})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-0.5">Target Posted Bill</label>
                  <select
                    value={manualAllocBillId}
                    onChange={(e) => setManualAllocBillId(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded-xs bg-white"
                  >
                    <option value="">Select bill...</option>
                    {bills
                      .filter((b) => b.status === "POSTED" && b.settlementStatus !== "SETTLED")
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.billNumber} (Due: {b.fineOutstanding} g / ₹{b.inrOutstanding})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-0.5">Amount (g fine or ₹)</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={manualAllocAmount}
                    onChange={(e) => setManualAllocAmount(e.target.value)}
                    className="w-full px-2 py-1 border border-slate-300 rounded-xs font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="py-1.5 px-3 bg-emerald-700 text-white font-semibold rounded-xs cursor-pointer"
                >
                  Allocate
                </button>
              </form>

              <div className="space-y-1 max-h-40 overflow-y-auto border-t border-slate-200 pt-2">
                {goldReceipts
                  .filter((r) => r.status === "POSTED")
                  .map((r) => (
                    <div key={r.id} className="flex justify-between text-[11px] border-b border-slate-100 py-0.5">
                      <span>Gold {r.receiptNumber} ({r.totalFineWeight} g fine)</span>
                      {actor.role === "OWNER_ADMIN" && (
                        <button
                          type="button"
                          onClick={() => void handleReverseGoldReceipt(r.id)}
                          className="text-red-700 hover:underline cursor-pointer"
                        >
                          Reverse Gold Receipt
                        </button>
                      )}
                    </div>
                  ))}
                {allocations
                  .filter((a) => a.status === "ACTIVE")
                  .map((a) => (
                    <div key={a.id} className="flex justify-between text-[11px] border-b border-slate-100 py-0.5">
                      <span>
                        Alloc {a.businessDate}: {Number(a.allocatedFineWeight) > 0 ? `${a.allocatedFineWeight} g fine` : `₹${a.allocatedRupees}`}
                      </span>
                      {actor.role === "OWNER_ADMIN" && (
                        <button
                          type="button"
                          onClick={() => void handleUndoAllocation(a.id)}
                          className="text-amber-700 hover:underline cursor-pointer"
                        >
                          Undo Allocation
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}

        {/* TAB 4: BILL TEMPLATES */}
        {activeTab === "templates" && (
          <form onSubmit={handleSaveTemplate} className="bg-white border border-slate-300 rounded-xs p-4 space-y-3 max-w-2xl">
            <div className="text-xs font-bold text-slate-900">
              Admin Bill Template Editor (Structured &amp; Safe — No Arbitrary Scripts)
            </div>
            <div className="text-xs">
              <label className="block text-[11px] font-semibold mb-0.5">Edit Existing Template (or leave New)</label>
              <select
                value={tplId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTplId(id);
                  const found = templates.find((t) => t.id === id);
                  if (found) {
                    setTplName(found.name);
                    setTplBizName(found.businessName);
                    setTplContact(found.contactInfo || "");
                    setTplHeaderText(found.headerText || "");
                    setTplFooterText(found.footerText || "");
                    setTplShowPhoto(found.showPhotoColumn);
                    setTplFontSize(found.fontSizePx);
                    setTplPaperSize(found.paperSize);
                    setTplNotesTerms(found.notesAndTerms || "");
                    setTplVisibleCols(
                      Object.entries(found.visibleColumns || {})
                        .filter(([, v]) => Boolean(v))
                        .map(([k]) => k)
                    );
                  }
                }}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-xs bg-white"
              >
                <option value="">+ Create New Template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Header Text</label>
                <input
                  type="text"
                  value={tplHeaderText}
                  onChange={(e) => setTplHeaderText(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Footer Text</label>
                <input
                  type="text"
                  value={tplFooterText}
                  onChange={(e) => setTplFooterText(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
            </div>
            <div className="text-xs">
              <label className="block text-[11px] font-semibold mb-1">Visible Columns</label>
              <div className="flex flex-wrap gap-3">
                {["description", "purity", "grossWeight", "stoneWeight", "netWeight", "making", "fineTotal", "cashTotal"].map((col) => (
                  <label key={col} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={tplVisibleCols.includes(col)}
                      onChange={(e) =>
                        setTplVisibleCols((prev) =>
                          e.target.checked ? [...prev, col] : prev.filter((c) => c !== col)
                        )
                      }
                    />
                    <span>{col}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Template Name</label>
                <input
                  type="text"
                  required
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Business Name</label>
                <input
                  type="text"
                  required
                  value={tplBizName}
                  onChange={(e) => setTplBizName(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold mb-0.5">Contact Info</label>
                <input
                  type="text"
                  required
                  value={tplContact}
                  onChange={(e) => setTplContact(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Logo URL (optional)</label>
                <input
                  type="text"
                  value={tplLogoUrl}
                  onChange={(e) => setTplLogoUrl(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Signature/Stamp URL (optional)</label>
                <input
                  type="text"
                  value={tplSigUrl}
                  onChange={(e) => setTplSigUrl(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Font Size (10–16 px)</label>
                <input
                  type="number"
                  min={10}
                  max={16}
                  value={tplFontSize}
                  onChange={(e) => setTplFontSize(Number(e.target.value))}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-0.5">Paper Size</label>
                <select
                  value={tplPaperSize}
                  onChange={(e) => setTplPaperSize(e.target.value as "A4" | "A5")}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                >
                  <option value="A4">A4</option>
                  <option value="A5">A5</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold mb-0.5">Notes &amp; Terms</label>
                <textarea
                  value={tplNotesTerms}
                  onChange={(e) => setTplNotesTerms(e.target.value)}
                  rows={2}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={tplShowPhoto}
                  onChange={(e) => setTplShowPhoto(e.target.checked)}
                />
                <span>Show Order Photo Column</span>
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={tplIsDefault}
                  onChange={(e) => setTplIsDefault(e.target.checked)}
                />
                <span>Set as Default Template</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={actor.role !== "OWNER_ADMIN"}
              className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-semibold rounded-xs cursor-pointer"
            >
              Save Template
            </button>
          </form>
        )}
      </div>

      {/* Immutable Posted Bill Snapshot Modal + Print View */}
      {inspectBill && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0">
          <div className="bg-white rounded-xs max-w-4xl w-full max-h-[92vh] overflow-y-auto p-4 space-y-3 print:max-h-none print:overflow-visible print:p-0">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2 print:hidden">
              <span className="text-xs font-bold">
                Bill Snapshot: {inspectBill.billNumber} ({inspectBill.status})
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadBillPdf(inspectBill)}
                  className="px-3 py-1 bg-slate-800 text-white text-xs font-semibold rounded-xs flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button
                  type="button"
                  disabled={sendingWaBillId === inspectBill.id}
                  onClick={() => void handleOpenWhatsAppShare(inspectBill)}
                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold rounded-xs flex items-center gap-1 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />{" "}
                  {sendingWaBillId === inspectBill.id
                    ? "Sending PDF..."
                    : "Send PDF on WhatsApp"}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-blue-700 text-white text-xs font-semibold rounded-xs flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setInspectBill(null)}
                  className="px-3 py-1 bg-slate-200 text-xs font-semibold rounded-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
            {inspectBill.previewHtml ? (
              <div dangerouslySetInnerHTML={{ __html: inspectBill.previewHtml }} />
            ) : (
              <div className="text-xs text-slate-500">No preview snapshot available.</div>
            )}
          </div>
        </div>
      )}

      {/* Share on WhatsApp Confirmation Modal */}
      {shareModalBill && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xs max-w-md w-full p-4 space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="font-bold text-slate-900">
                Share Bill on WhatsApp — {shareModalBill.billNumber}
              </span>
              <button
                type="button"
                onClick={() => setShareModalBill(null)}
                className="text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xs space-y-1">
              <div><strong>Recipient:</strong> {shareModalBill.customerName} ({customerSummaries.find((c) => c.customerId === customerId)?.phone || "No saved phone"})</div>
              <div><strong>Fine Gold:</strong> {shareModalBill.totalFineGold} g fine</div>
              <div><strong>Cash / Charges:</strong> ₹{shareModalBill.totalCashRupees}</div>
              {shareTokenInfo && (
                <div className="pt-1">
                  <strong>Read-Only Customer Link:</strong>
                  <div className="font-mono text-[10px] break-all text-blue-700">{shareTokenInfo.url}</div>
                </div>
              )}
            </div>
            {shareStatusNote && (
              <div className="p-2 bg-amber-50 border border-amber-300 text-amber-900 rounded-xs text-[11px]">
                {shareStatusNote}
              </div>
            )}
            <div className="flex justify-end gap-2">
              {shareTokenInfo && actor.role === "OWNER_ADMIN" && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/billing", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "REVOKE_SHARE_TOKEN", tokenId: shareTokenInfo.id }),
                    });
                    setShareTokenInfo(null);
                    setShareStatusNote("Share link revoked.");
                  }}
                  className="px-2.5 py-1.5 border border-red-300 text-red-700 rounded-xs cursor-pointer"
                >
                  Revoke Link
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleNativeFileShare()}
                className="px-3 py-1.5 bg-emerald-700 text-white font-semibold rounded-xs cursor-pointer"
              >
                Send PDF on WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Direct PDF Sender — QR Code Link Modal */}
      {waQrModalOpen && (
        <div className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xs max-w-md w-full p-5 space-y-4 text-xs shadow-xl">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2.5">
              <div>
                <div className="font-bold text-sm text-slate-900">
                  Link WhatsApp for Direct PDF Billing
                </div>
                <div className="text-[11px] text-slate-500">
                  One-time link — automatically sends the full invoice PDF directly to customer numbers
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWaQrModalOpen(false);
                  setPendingWaBill(null);
                }}
                className="text-slate-500 hover:text-slate-900 font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            {pendingWaBill && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-xs text-[11px]">
                <strong>Queued to send automatically:</strong> Bill{" "}
                <span className="font-mono font-bold">{pendingWaBill.billNumber}</span> PDF to{" "}
                <strong>{pendingWaBill.customerName}</strong> as soon as you scan the QR code below.
              </div>
            )}

            {waState.isReady ? (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xs text-center space-y-2">
                <div className="text-sm font-bold text-emerald-800">
                  ✅ WhatsApp Connected
                </div>
                {waState.connectedUser && (
                  <div className="text-xs text-emerald-700 font-mono">
                    Linked Number: +{waState.connectedUser}
                  </div>
                )}
                <p className="text-[11px] text-emerald-700">
                  Clicking &ldquo;WhatsApp PDF&rdquo; on any bill will immediately send the generated PDF file directly to the customer&apos;s WhatsApp chat.
                </p>
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch("/api/whatsapp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "RESET" }),
                      });
                      if (res.ok) setWaState(await res.json());
                    }}
                    className="px-3 py-1.5 border border-red-300 bg-white text-red-700 rounded-xs font-semibold cursor-pointer"
                  >
                    Disconnect / Change Number
                  </button>
                  <button
                    type="button"
                    onClick={() => setWaQrModalOpen(false)}
                    className="px-4 py-1.5 bg-emerald-700 text-white rounded-xs font-semibold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                {waState.qrDataUrl ? (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="p-3 bg-white border-2 border-emerald-500 rounded-xs inline-block">
                      <img
                        src={waState.qrDataUrl}
                        alt="WhatsApp QR Code"
                        className="w-60 h-60 object-contain"
                      />
                    </div>
                    <div className="text-xs font-semibold text-slate-800">
                      Scan with WhatsApp on your phone:
                    </div>
                    <ol className="text-[11px] text-slate-600 text-left space-y-1 bg-slate-50 p-3 rounded-xs border border-slate-200 w-full">
                      <li>1. Open <strong>WhatsApp</strong> on your phone</li>
                      <li>2. Tap <strong>Menu (⋮) or Settings</strong> &rarr; <strong>Linked Devices</strong></li>
                      <li>3. Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
                    </ol>
                  </div>
                ) : (
                  <div className="py-10 space-y-2 text-slate-600">
                    <div className="text-xs font-semibold animate-pulse">
                      Generating WhatsApp QR Code...
                    </div>
                    {waState.lastError && (
                      <div className="text-[11px] text-red-600">{waState.lastError}</div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch("/api/whatsapp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "RESET" }),
                      });
                      if (res.ok) setWaState(await res.json());
                    }}
                    className="px-2.5 py-1 text-[11px] border border-slate-300 text-slate-700 rounded-xs cursor-pointer"
                  >
                    Refresh QR Code
                  </button>
                  <span className="text-[11px] text-slate-500">
                    Status: <strong className="uppercase">{waState.status}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Consolidated Customer Statement Modal */}
      {consolidatedStmt && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xs max-w-2xl w-full max-h-[85vh] overflow-y-auto p-4 space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="font-bold text-sm">
                Consolidated Statement — {consolidatedStmt.customer.name}
              </span>
              <button
                type="button"
                onClick={() => setConsolidatedStmt(null)}
                className="px-2 py-1 bg-slate-200 rounded-xs cursor-pointer"
              >
                Close
              </button>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-left">
                  <th className="p-1.5">Bill #</th>
                  <th className="p-1.5">Date</th>
                  <th className="p-1.5 text-right">Billed Fine</th>
                  <th className="p-1.5 text-right">Out Fine</th>
                  <th className="p-1.5 text-right">Billed ₹</th>
                  <th className="p-1.5 text-right">Out ₹</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedStmt.bills.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100">
                    <td className="p-1.5 font-mono font-semibold">{b.billNumber}</td>
                    <td className="p-1.5">{b.billDate}</td>
                    <td className="p-1.5 text-right font-mono">{b.totalFineGold} g</td>
                    <td className="p-1.5 text-right font-mono font-semibold">{b.outstandingFine} g</td>
                    <td className="p-1.5 text-right font-mono">₹{b.totalCashRupees}</td>
                    <td className="p-1.5 text-right font-mono font-semibold">₹{b.outstandingInr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xs grid grid-cols-2 gap-2">
              <div><strong>Net Outstanding Fine:</strong> {consolidatedStmt.totals.netOutstandingFine} g</div>
              <div><strong>Unallocated Gold Credit:</strong> {consolidatedStmt.totals.unallocatedGoldCredit} g</div>
              <div><strong>Net Outstanding INR:</strong> ₹{consolidatedStmt.totals.netOutstandingInr}</div>
              <div><strong>Unallocated Cash Credit:</strong> ₹{consolidatedStmt.totals.unallocatedCashCredit}</div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-slate-600">Loading billing...</div>}>
      <BillingWorkspaceInner />
    </Suspense>
  );
}

