"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell, AppShellUser } from "@/components/AppShell";
import {
  fetchActorCached,
  fetchCachedJson,
  getCachedActor,
  getCachedJson,
} from "@/lib/client-cache";
import { formatWeight3 } from "@/lib/decimal";

type OrderTab = "ALL" | "ONGOING" | "COMPLETED" | "DELIVERED" | "CANCELLED";

interface FineConvention {
  mode: "UNCONFIGURED" | "FINE_EQUIVALENT" | "PHYSICAL_AT_CONFIGURED_TOUCH";
  configuredTouch: string | null;
  finePurityId: string;
  finePurityCode: string;
  finePurityLabel: string;
  destinationAccountCode: string;
  destinationAccountName: string;
}

interface OrderRow {
  id: string;
  bagNumber: string;
  orderName: string;
  date: string;
  status: string;
  displayTabStatus: OrderTab;
  billingStatus: string;
  deliveryStatus: string;
  purityLabel: string;
  touchPercent: string;
  grossWeight: string;
  netWeight: string;
  billId: string | null;
  billNumber: string | null;
  billLink: string | null;
  viewLink: string;
}

interface BillRow {
  id: string;
  billNumber: string;
  date: string;
  originalFineCharge: string;
  settledFine: string;
  remainingFine: string;
  totalCashRupees: string;
  settledInr: string;
  remainingInr: string;
  status: string;
  documentStatus: string;
  settlementStatus: string;
  previewHtml: string | null;
  issuedSnapshot: {
    previousOutstandingFine: string;
    previousAdvanceFine: string;
    newBillChargeFine: string;
    advanceAppliedFine: string;
    newReceiptAppliedFine: string;
    totalOutstandingAfterIssuanceFine: string;
    remainingAdvanceAfterIssuanceFine: string;
  };
  livePaymentStatus: {
    originalFineCharge: string;
    liveSettledFine: string;
    liveRemainingFine: string;
    liveSettlementStatus: string;
  };
  linesCount: number;
}

interface StatementRow {
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
}

interface ProfileWorkspace {
  customer: {
    id: string;
    customerCode: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    gstNumber: string | null;
    notes: string | null;
  };
  summaryCards: {
    goldDue: string;
    advanceAvailable: string;
    totalGoldReceivedHistorical: string;
    grossGoldReceivedHistorical: string;
    totalFineRefunded: string;
    inrDue: string;
    inrAdvance: string;
  };
  fineReceiptConvention: FineConvention;
  orderCounts: Record<OrderTab, number>;
  orders: OrderRow[];
  bills: BillRow[];
  unpaidBills: BillRow[];
  statement: {
    monthFilter: string | null;
    openingDues: string;
    openingAdvance: string;
    openingBalanceLabel: string;
    periodTotalCharged: string;
    periodTotalActualGoldReceived: string;
    closingDues: string;
    closingAvailableAdvance: string;
    periodClosingDues: string;
    periodClosingAdvance: string;
    rows: StatementRow[];
  };
  transactionHistory: {
    goldReceipts: Array<{
      id: string;
      receiptNumber: string;
      businessDate: string;
      totalGrossWeight: string;
      totalFineWeight: string;
      unallocatedFineWeight: string;
      refundedFineWeight: string;
      inputModeSnapshot: string;
      physicalWeightProvided: boolean;
      status: string;
      referenceNumber: string | null;
      notes: string | null;
      reversalReason: string | null;
    }>;
    cashReceipts: Array<{
      id: string;
      receiptNumber: string;
      businessDate: string;
      amountRupees: string;
      unallocatedRupees: string;
      paymentMode: string;
      status: string;
      referenceNumber: string | null;
      notes: string | null;
    }>;
    allocations: Array<{
      id: string;
      billId: string;
      billNumber: string;
      goldReceiptId: string | null;
      goldReceiptNumber: string | null;
      cashReceiptId: string | null;
      allocatedFineWeight: string;
      allocatedRupees: string;
      status: string;
      businessDate: string;
      notes: string | null;
      undoReason: string | null;
    }>;
  };
}

export default function CustomerProfilePage() {
  const params = useParams<{ id: string }>();
  const customerId = params?.id || "";
  const router = useRouter();

  const [actor, setActor] = useState<AppShellUser | null>(() => getCachedActor());
  const [workspace, setWorkspace] = useState<ProfileWorkspace | null>(() =>
    customerId
      ? getCachedJson<ProfileWorkspace>(
          `/api/customers?customerId=${encodeURIComponent(customerId)}&orderTab=ALL`
        )
      : null
  );
  const [loading, setLoading] = useState(!workspace);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Filters
  const [orderTab, setOrderTab] = useState<OrderTab>("ALL");
  const [monthFilter, setMonthFilter] = useState<string>("");

  // Edit Customer Form
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Simple Gold Entry Form (Toggleable)
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptFormMode, setReceiptFormMode] = useState<
    "RECEIVE_FINE" | "ADD_ADVANCE"
  >("RECEIVE_FINE");
  const [amountReceived, setAmountReceived] = useState<string>("");
  const [receiptDate, setReceiptDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [receiptNotes, setReceiptNotes] = useState<string>("");
  const [showOptionalPhysical, setShowOptionalPhysical] = useState(false);
  const [physicalWeightOverride, setPhysicalWeightOverride] =
    useState<string>("");
  const [touchPercentOverride, setTouchPercentOverride] = useState<string>("");

  // Optional Advanced "Choose Bills" section
  const [showChooseBills, setShowChooseBills] = useState(false);
  const [allocationMode, setAllocationMode] = useState<
    "OLDEST_FIRST" | "CHOOSE_BILLS" | "NONE"
  >("OLDEST_FIRST");
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [postingReceipt, setPostingReceipt] = useState(false);

  // Owner Convention Settings (hidden unless opened)
  const [showConventionSettings, setShowConventionSettings] = useState(false);
  const [convMode, setConvMode] = useState<
    "FINE_EQUIVALENT" | "PHYSICAL_AT_CONFIGURED_TOUCH"
  >("FINE_EQUIVALENT");
  const [convTouch, setConvTouch] = useState<string>("99.90");
  const [savingConvention, setSavingConvention] = useState(false);

  // Apply Existing Advance to Bill modal
  const [settlingBillId, setSettlingBillId] = useState<string | null>(null);
  const [settleAmountFine, setSettleAmountFine] = useState<string>("");
  const [postingSettlement, setPostingSettlement] = useState(false);

  // Bill Viewer (Original Issued Document vs Live Status)
  const [viewingBill, setViewingBill] = useState<BillRow | null>(null);
  const [billViewTab, setBillViewTab] = useState<
    "ISSUED_DOCUMENT" | "LIVE_STATUS"
  >("ISSUED_DOCUMENT");

  // Refund Advance Form
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundFineWeight, setRefundFineWeight] = useState<string>("");
  const [refundPhysicalWeight, setRefundPhysicalWeight] = useState<string>("");
  const [refundReason, setRefundReason] = useState<string>("");
  const [postingRefund, setPostingRefund] = useState(false);

  const loadWorkspace = useCallback(
    async (force = false) => {
      if (!customerId) return;
      if (!workspace || force) setLoading(true);
      try {
        const qs = new URLSearchParams({
          customerId,
          orderTab,
        });
        if (monthFilter) qs.set("monthFilter", monthFilter);
        const url = `/api/customers?${qs.toString()}`;

        const [resolvedActor, data] = await Promise.all([
          fetchActorCached(),
          fetchCachedJson<ProfileWorkspace & { ok?: boolean; error?: string }>(
            url,
            { force }
          ),
        ]);

        if (!resolvedActor) {
          router.push(`/login?redirect=/customers/${customerId}`);
          return;
        }
        setActor(resolvedActor);

        if (!data.ok) {
          setError(data.error || "Failed to load customer profile");
        } else {
          setWorkspace(data);
          setEditName(data.customer.name || "");
          setEditPhone(data.customer.phone || "");
          setEditEmail(data.customer.email || "");
          setEditAddress(data.customer.address || "");
          if (data.fineReceiptConvention?.mode !== "UNCONFIGURED") {
            setConvMode(data.fineReceiptConvention.mode);
            if (data.fineReceiptConvention.configuredTouch) {
              setConvTouch(
                Number(data.fineReceiptConvention.configuredTouch).toFixed(2)
              );
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customerId, orderTab, monthFilter, router]
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  // Live calculation for Receipt Preview
  const liveReceiptPreview = useMemo(() => {
    if (!workspace) return null;
    const conv = workspace.fineReceiptConvention;
    const currentDue = Number(workspace.summaryCards.goldDue || 0);
    const currentAdv = Number(workspace.summaryCards.advanceAvailable || 0);
    const rawEntered = Number(amountReceived || 0);
    if (!Number.isFinite(rawEntered) || rawEntered <= 0) {
      return {
        currentGoldDue: currentDue,
        fineCredited: 0,
        settlingBills: 0,
        remainingDue: currentDue,
        advanceAfterSettlement: currentAdv,
        newAdvanceFromReceipt: 0,
        physicalToAdmin: null as number | null,
        unselectedBillsCount: 0,
        unselectedBillsFine: 0,
      };
    }

    let fineCredited = rawEntered;
    let physicalToAdmin: number | null = null;

    if (conv.mode === "PHYSICAL_AT_CONFIGURED_TOUCH") {
      const touch = Number(conv.configuredTouch || 100);
      physicalToAdmin = rawEntered;
      fineCredited = Number(((rawEntered * touch) / 100).toFixed(4));
    } else {
      fineCredited = Number(rawEntered.toFixed(4));
      if (showOptionalPhysical && Number(physicalWeightOverride || 0) > 0) {
        physicalToAdmin = Number(physicalWeightOverride);
      }
    }

    const unpaidOldestFirst = [...workspace.unpaidBills].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    let remainingToAllocate = fineCredited;
    let settlingBills = 0;
    let unselectedBillsCount = 0;
    let unselectedBillsFine = 0;

    if (allocationMode === "NONE") {
      for (const b of unpaidOldestFirst) {
        const rem = Number(b.remainingFine || 0);
        if (rem > 0) {
          unselectedBillsCount++;
          unselectedBillsFine += rem;
        }
      }
    } else {
      const selectedSet = new Set(selectedBillIds);
      for (const b of unpaidOldestFirst) {
        const rem = Number(b.remainingFine || 0);
        if (rem <= 0) continue;
        if (allocationMode === "CHOOSE_BILLS" && !selectedSet.has(b.id)) {
          unselectedBillsCount++;
          unselectedBillsFine += rem;
          continue;
        }
        const alloc = Math.min(remainingToAllocate, rem);
        remainingToAllocate = Math.max(
          0,
          Number((remainingToAllocate - alloc).toFixed(4))
        );
        settlingBills = Number((settlingBills + alloc).toFixed(4));
      }
    }

    const remainingDue = Math.max(
      0,
      Number((currentDue - settlingBills).toFixed(4))
    );
    const advanceAfterSettlement = Number(
      (currentAdv + remainingToAllocate).toFixed(4)
    );

    return {
      currentGoldDue: currentDue,
      fineCredited,
      settlingBills,
      remainingDue,
      advanceAfterSettlement,
      newAdvanceFromReceipt: remainingToAllocate,
      physicalToAdmin,
      unselectedBillsCount,
      unselectedBillsFine,
    };
  }, [
    workspace,
    amountReceived,
    showOptionalPhysical,
    physicalWeightOverride,
    allocationMode,
    selectedBillIds,
  ]);

  async function handleUpdateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setError(null);
    setMessage(null);
    setSavingCustomer(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_CUSTOMER",
          customerId: workspace.customer.id,
          name: editName,
          phone: editPhone,
          email: editEmail,
          address: editAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to update customer");
      } else {
        setIsEditingCustomer(false);
        setMessage("Customer details updated.");
        await loadWorkspace();
      }
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleSaveConvention(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSavingConvention(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CONFIGURE_FINE_CONVENTION",
          mode: convMode,
          configuredTouch:
            convMode === "PHYSICAL_AT_CONFIGURED_TOUCH" ? convTouch : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to save receipt convention");
      } else {
        setShowConventionSettings(false);
        setMessage(
          convMode === "FINE_EQUIVALENT"
            ? "Saved: Customer receipts are entered in Fine Gold grams (g fine)."
            : `Saved: Customer receipts are entered as physical weight at ${convTouch}% touch.`
        );
        await loadWorkspace();
      }
    } finally {
      setSavingConvention(false);
    }
  }

  async function handleConfirmReceipt(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setError(null);
    setMessage(null);
    setPostingReceipt(true);
    try {
      // Require explicit one-time owner setup if fine receipt convention is unconfigured
      if (workspace.fineReceiptConvention.mode === "UNCONFIGURED") {
        setShowConventionSettings(true);
        setError(
          "One-time setup required: please select whether fine gold receipts are entered as Fine Equivalent (g fine) or Physical Weight at a fixed touch."
        );
        setPostingReceipt(false);
        return;
      }

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RECEIVE_FINE_GOLD",
          customerId: workspace.customer.id,
          amountReceived,
          physicalWeightOverride:
            showOptionalPhysical && physicalWeightOverride
              ? physicalWeightOverride
              : undefined,
          touchPercentOverride:
            showOptionalPhysical && touchPercentOverride
              ? touchPercentOverride
              : undefined,
          businessDate: receiptDate,
          referenceNumber: referenceNumber || undefined,
          notes:
            receiptNotes ||
            (receiptFormMode === "ADD_ADVANCE"
              ? "Customer Fine Gold Advance"
              : "Fine Gold Received"),
          allocationMode,
          selectedBillIds:
            allocationMode === "CHOOSE_BILLS" ? selectedBillIds : undefined,
          idempotencyKey: `cgr_${workspace.customer.id}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to record gold receipt");
      } else {
        setAmountReceived("");
        setReferenceNumber("");
        setReceiptNotes("");
        setPhysicalWeightOverride("");
        setTouchPercentOverride("");
        setShowReceiptForm(false);
        setMessage(
          `Saved Receipt ${data.receiptNumber}: +${formatWeight3(
            data.totalFineWeight
          )}g Fine Gold added to Admin Stock.`
        );
        await loadWorkspace();
      }
    } finally {
      setPostingReceipt(false);
    }
  }

  async function handleApplyExistingAdvanceToBill(bill: BillRow) {
    if (!workspace) return;
    setError(null);
    setMessage(null);
    setPostingSettlement(true);
    try {
      const openReceipts = workspace.transactionHistory.goldReceipts.filter(
        (r) => r.status === "POSTED" && Number(r.unallocatedFineWeight) > 0
      );
      if (openReceipts.length === 0) {
        setError(
          "No advance available. Click 'Collect / Recover Gold' to receive gold."
        );
        return;
      }
      let remainingToSettle = Number(
        settleAmountFine || bill.remainingFine || 0
      );
      for (const rcp of openReceipts) {
        if (remainingToSettle <= 0) break;
        const avail = Number(rcp.unallocatedFineWeight);
        const applyAmt = Math.min(avail, remainingToSettle);
        if (applyAmt <= 0) continue;
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ALLOCATE_PAYMENT",
            goldReceiptId: rcp.id,
            allocations: [{ billId: bill.id, amount: applyAmt.toFixed(4) }],
            notes: `Settled ${bill.billNumber} from advance (${rcp.receiptNumber})`,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Failed to apply advance");
        }
        remainingToSettle = Number((remainingToSettle - applyAmt).toFixed(4));
      }
      setSettlingBillId(null);
      setSettleAmountFine("");
      setMessage(`Applied advance to Bill ${bill.billNumber}.`);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to settle bill");
    } finally {
      setPostingSettlement(false);
    }
  }

  async function handleUndoAllocation(allocationId: string) {
    const reason = window.prompt("Reason for undoing this bill settlement:");
    if (!reason) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "UNDO_ALLOCATION",
        allocationId,
        reason,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Failed to undo allocation");
    } else {
      setMessage("Undid settlement and restored credit.");
      await loadWorkspace();
    }
  }

  async function handleReverseReceipt(
    receiptId: string,
    receiptNumber: string
  ) {
    const reason = window.prompt(
      `Delete / reverse receipt ${receiptNumber}? Enter reason:`
    );
    if (!reason) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "REVERSE_GOLD_RECEIPT",
        receiptId,
        reason,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Failed to reverse receipt");
    } else {
      setMessage(`Reversed receipt ${receiptNumber}.`);
      await loadWorkspace();
    }
  }

  async function handleCancelBill(billId: string, billNumber: string) {
    const reason = window.prompt(
      `Cancel Bill ${billNumber}? Enter cancellation reason:`
    );
    if (!reason) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CANCEL_BILL",
        billId,
        reason,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Failed to cancel bill");
    } else {
      setMessage(`Cancelled Bill ${billNumber}.`);
      await loadWorkspace();
    }
  }

  async function handleRefundAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setError(null);
    setMessage(null);
    setPostingRefund(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REFUND_GOLD_ADVANCE",
          customerId: workspace.customer.id,
          refundFineWeight,
          physicalReturnWeight: refundPhysicalWeight || undefined,
          reason: refundReason,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to refund gold advance");
      } else {
        setShowRefundModal(false);
        setRefundFineWeight("");
        setRefundPhysicalWeight("");
        setRefundReason("");
        setMessage(
          `Refunded ${data.refundedFineWeight}g fine advance (${data.refundNumber}).`
        );
        await loadWorkspace();
      }
    } finally {
      setPostingRefund(false);
    }
  }

  function handleExportStatementCsv() {
    if (!workspace) return;
    const headers = [
      "Date",
      "Reference",
      "Description",
      "Gold Charged (g fine)",
      "Gold Received / Credit (g fine)",
      "Allocation / Adjustment",
      "Running Balance",
    ];
    const lines = [
      headers.join(","),
      [
        workspace.statement.monthFilter
          ? `${workspace.statement.monthFilter}-01`
          : "OPENING",
        "OPENING",
        "Opening Dues / Credit Carried Forward",
        workspace.statement.openingDues,
        workspace.statement.openingAdvance,
        "—",
        workspace.statement.openingBalanceLabel,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
      ...workspace.statement.rows.map((r) =>
        [
          r.date,
          r.reference,
          r.description,
          r.goldCharged,
          r.goldReceivedCredit,
          r.allocationAdjustment,
          r.runningBalanceLabel,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement_${workspace.customer.customerCode}_${
      workspace.statement.monthFilter || "all"
    }.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!actor || loading || !workspace) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Loading customer profile...
      </div>
    );
  }

  const { customer, summaryCards, fineReceiptConvention } = workspace;

  return (
    <AppShell actor={actor}>
      <div className="space-y-6">
        {/* Clean Header */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <Link
              href="/directory"
              className="text-blue-600 hover:underline text-sm mb-1 inline-block"
            >
              ← Back to Customers
            </Link>
            <h1 className="text-2xl font-bold text-gray-800">
              {customer.name}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/orders"
              className="px-4 py-2 bg-gray-100 text-gray-800 border border-gray-300 rounded-md hover:bg-gray-200 font-medium text-sm"
            >
              + New Order
            </Link>
            <Link
              href={`/billing?customerId=${customer.id}`}
              className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium text-sm"
            >
              Create Bill
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-sm rounded-lg">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm rounded-lg">
            {message}
          </div>
        )}

        {/* Customer Information Card with Simple Edit Form */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Customer Information
            </h2>
            <button
              type="button"
              onClick={() => setIsEditingCustomer((prev) => !prev)}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 cursor-pointer"
            >
              {isEditingCustomer ? "Cancel" : "Edit"}
            </button>
          </div>

          {isEditingCustomer ? (
            <form onSubmit={handleUpdateCustomer} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-sm cursor-pointer"
                >
                  {savingCustomer ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">Customer Code</p>
                <p className="font-medium text-gray-800">
                  {customer.customerCode}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="font-medium text-gray-800">
                  {customer.phone || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="font-medium text-gray-800">
                  {customer.email || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Address</p>
                <p className="font-medium text-gray-800">
                  {customer.address || "—"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Gold Balance Summary Card & Simple Entry Form */}
        <div
          id="receive-fine-gold-section"
          className="bg-white p-6 rounded-lg shadow"
        >
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-800">
                Gold Balance Summary
              </h2>
              {actor.role === "OWNER_ADMIN" && (
                <button
                  type="button"
                  onClick={() => setShowConventionSettings((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
                >
                  {fineReceiptConvention.mode ===
                  "PHYSICAL_AT_CONFIGURED_TOUCH"
                    ? `Basis: Physical @ ${Number(
                        fineReceiptConvention.configuredTouch || 0
                      ).toFixed(1)}%`
                    : "Basis: Fine Gold (g)"}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (showReceiptForm && receiptFormMode === "RECEIVE_FINE") {
                    setShowReceiptForm(false);
                  } else {
                    setReceiptFormMode("RECEIVE_FINE");
                    setAllocationMode("OLDEST_FIRST");
                    setShowReceiptForm(true);
                  }
                }}
                className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium text-sm cursor-pointer"
              >
                {showReceiptForm && receiptFormMode === "RECEIVE_FINE"
                  ? "Cancel"
                  : "Receive Fine Gold"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (showReceiptForm && receiptFormMode === "ADD_ADVANCE") {
                    setShowReceiptForm(false);
                  } else {
                    setReceiptFormMode("ADD_ADVANCE");
                    setAllocationMode("OLDEST_FIRST");
                    setShowReceiptForm(true);
                  }
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 font-medium text-sm cursor-pointer"
              >
                {showReceiptForm && receiptFormMode === "ADD_ADVANCE"
                  ? "Cancel"
                  : "+ Add Advance Gold"}
              </button>
              {actor.role === "OWNER_ADMIN" &&
                Number(summaryCards.advanceAvailable) > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowRefundModal(true)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 font-medium text-sm cursor-pointer"
                  >
                    Refund Advance
                  </button>
                )}
            </div>
          </div>

          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-amber-50 p-4 rounded-lg border-2 border-amber-200">
              <p className="text-sm text-gray-600">Total Gold Due (Jama)</p>
              <p className="text-3xl font-bold text-amber-700 mt-1">
                {formatWeight3(summaryCards.goldDue)}g
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Remaining unpaid fine gold across bills
              </p>
            </div>

            <div className="bg-emerald-50 p-4 rounded-lg border-2 border-emerald-200">
              <p className="text-sm text-gray-600">Advance Available</p>
              <p className="text-3xl font-bold text-emerald-700 mt-1">
                {formatWeight3(summaryCards.advanceAvailable)}g
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Credit ready to apply on future bills
              </p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Total Gold Received</p>
                <span className="text-[11px] bg-green-100 text-green-800 px-2 py-0.5 rounded font-medium">
                  Historical Activity
                </span>
              </div>
              <p className="text-3xl font-bold text-green-700 mt-1">
                {formatWeight3(summaryCards.totalGoldReceivedHistorical)}g
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Total fine gold collected from customer
              </p>
            </div>
          </div>

          {(Number(summaryCards.inrDue) > 0 ||
            Number(summaryCards.inrAdvance) > 0) && (
            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap gap-6 text-sm">
              <div>
                <span className="text-gray-500">INR Due: </span>
                <span className="font-bold text-gray-900">
                  ₹{summaryCards.inrDue}
                </span>
              </div>
              <div>
                <span className="text-gray-500">INR Advance: </span>
                <span className="font-bold text-emerald-700">
                  ₹{summaryCards.inrAdvance}
                </span>
              </div>
            </div>
          )}

          {/* Optional Owner Basis Setting */}
          {showConventionSettings && (
            <form
              onSubmit={handleSaveConvention}
              className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3"
            >
              <div className="text-sm font-semibold text-amber-900">
                Owner Setting: How do you enter customer fine gold?
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <label className="flex items-start gap-2 p-3 bg-white border border-amber-200 rounded-md cursor-pointer">
                  <input
                    type="radio"
                    checked={convMode === "FINE_EQUIVALENT"}
                    onChange={() => setConvMode("FINE_EQUIVALENT")}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-gray-800">
                      Mode A: Fine Gold Grams (g fine)
                    </div>
                    <div className="text-xs text-gray-500">
                      Enter fine gold directly (e.g. 50g fine).
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 p-3 bg-white border border-amber-200 rounded-md cursor-pointer">
                  <input
                    type="radio"
                    checked={convMode === "PHYSICAL_AT_CONFIGURED_TOUCH"}
                    onChange={() =>
                      setConvMode("PHYSICAL_AT_CONFIGURED_TOUCH")
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-800">
                      Mode B: Physical Weight at Fixed Touch %
                    </div>
                    {convMode === "PHYSICAL_AT_CONFIGURED_TOUCH" && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-600">Touch %:</span>
                        <input
                          type="number"
                          step="0.01"
                          value={convTouch}
                          onChange={(e) => setConvTouch(e.target.value)}
                          className="w-24 px-2 py-1 text-xs border border-gray-300 rounded"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConventionSettings(false)}
                  className="px-3 py-1.5 text-xs text-gray-600"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingConvention}
                  className="px-4 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-md cursor-pointer"
                >
                  {savingConvention ? "Saving..." : "Save Setting"}
                </button>
              </div>
            </form>
          )}

          {/* Simple Gold Entry Form */}
          {showReceiptForm && (
            <form
              onSubmit={handleConfirmReceipt}
              className="mt-6 pt-6 border-t border-gray-200 space-y-4"
            >
              <div className="flex flex-wrap justify-between items-center gap-2">
                <h3 className="text-base font-semibold text-gray-800">
                  {receiptFormMode === "ADD_ADVANCE"
                    ? "Add Advance Gold (Fine)"
                    : "Receive Fine Gold from Customer"}
                </h3>
                <span className="text-xs text-gray-500">
                  Automatically adds to Admin Fine Gold Stock & settles oldest
                  bills first
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {fineReceiptConvention.mode ===
                    "PHYSICAL_AT_CONFIGURED_TOUCH"
                      ? `Physical Gold Weight (g @ ${Number(
                          fineReceiptConvention.configuredTouch || 0
                        ).toFixed(1)}%) *`
                      : "Fine Gold Received (grams) *"}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder="e.g. 25.000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={receiptNotes}
                    onChange={(e) => setReceiptNotes(e.target.value)}
                    placeholder="e.g. Fine gold received"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              {/* Live Compact Preview */}
              {Number(amountReceived) > 0 && liveReceiptPreview && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm flex flex-wrap justify-between items-center gap-4">
                  <div>
                    Crediting:{" "}
                    <strong className="text-emerald-700">
                      +{formatWeight3(liveReceiptPreview.fineCredited)}g Fine
                    </strong>
                  </div>
                  <div>
                    Settling Bills:{" "}
                    <strong className="text-blue-700">
                      {formatWeight3(liveReceiptPreview.settlingBills)}g
                    </strong>
                  </div>
                  <div>
                    Remaining Due:{" "}
                    <strong className="text-amber-800">
                      {formatWeight3(liveReceiptPreview.remainingDue)}g
                    </strong>
                  </div>
                  <div>
                    Available Advance:{" "}
                    <strong className="text-emerald-700">
                      {formatWeight3(liveReceiptPreview.advanceAfterSettlement)}g
                    </strong>
                  </div>
                </div>
              )}

              {/* Optional Choose Bills toggle */}
              <div className="flex flex-wrap justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowChooseBills((v) => !v)}
                  className="text-xs text-blue-600 hover:underline cursor-pointer"
                >
                  {showChooseBills
                    ? "Hide bill selection"
                    : "Optional: Choose specific bills to settle"}
                </button>

                <button
                  type="submit"
                  disabled={postingReceipt || Number(amountReceived || 0) <= 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 font-medium text-sm cursor-pointer"
                >
                  {postingReceipt ? "Saving..." : "Confirm Receipt"}
                </button>
              </div>

              {showChooseBills && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2 text-xs">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={allocationMode === "OLDEST_FIRST"}
                        onChange={() => setAllocationMode("OLDEST_FIRST")}
                      />
                      <span>Settle oldest unpaid bills first (Default)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={allocationMode === "CHOOSE_BILLS"}
                        onChange={() => setAllocationMode("CHOOSE_BILLS")}
                      />
                      <span>Select specific bills</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={allocationMode === "NONE"}
                        onChange={() => setAllocationMode("NONE")}
                      />
                      <span>Keep entire amount as advance</span>
                    </label>
                  </div>

                  {allocationMode === "CHOOSE_BILLS" && (
                    <div className="space-y-1 pt-2">
                      {workspace.unpaidBills.map((b) => (
                        <label
                          key={b.id}
                          className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded cursor-pointer"
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedBillIds.includes(b.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedBillIds((prev) => [...prev, b.id]);
                                } else {
                                  setSelectedBillIds((prev) =>
                                    prev.filter((id) => id !== b.id)
                                  );
                                }
                              }}
                            />
                            <span className="font-semibold">
                              {b.billNumber}
                            </span>
                            <span className="text-gray-500">({b.date})</span>
                          </span>
                          <span className="font-semibold text-amber-800">
                            Due: {b.remainingFine}g
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>
          )}
        </div>

        {/* Orders History Card */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Order History
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  "ALL",
                  "ONGOING",
                  "COMPLETED",
                  "DELIVERED",
                  "CANCELLED",
                ] as OrderTab[]
              ).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setOrderTab(tab)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                    orderTab === tab
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {tab.charAt(0) + tab.slice(1).toLowerCase()} (
                  {workspace.orderCounts[tab] ?? 0})
                </button>
              ))}
            </div>
          </div>

          {workspace.orders.length === 0 ? (
            <p className="text-center text-gray-500 py-6 text-sm">
              No orders in this category.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Bag #
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Order
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Bill
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {workspace.orders.map((o) => (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-semibold text-gray-900">
                        #{o.bagNumber}
                      </td>
                      <td className="px-3 py-2.5 text-gray-800">
                        {o.orderName}{" "}
                        <span className="text-xs text-gray-500">
                          ({o.purityLabel})
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{o.date}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                            o.displayTabStatus === "DELIVERED"
                              ? "bg-green-100 text-green-800"
                              : o.displayTabStatus === "COMPLETED"
                              ? "bg-blue-100 text-blue-800"
                              : o.displayTabStatus === "CANCELLED"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {o.displayTabStatus}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {o.billLink && o.billNumber ? (
                          <Link
                            href={o.billLink}
                            className="text-blue-600 font-medium hover:underline"
                          >
                            {o.billNumber}
                          </Link>
                        ) : o.displayTabStatus === "COMPLETED" ? (
                          <Link
                            href={`/billing?customerId=${customer.id}`}
                            className="text-xs text-amber-600 font-semibold hover:underline"
                          >
                            + Create Bill
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Link
                          href={o.viewLink}
                          className="text-blue-600 hover:underline text-xs font-medium"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bills Card */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Customer Bills ({workspace.bills.length})
          </h2>

          {workspace.bills.length === 0 ? (
            <p className="text-center text-gray-500 py-6 text-sm">
              No bills created yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Bill #
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Fine Charge
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Settled
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Remaining
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {workspace.bills.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-semibold text-gray-900">
                        {b.billNumber}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{b.date}</td>
                      <td className="px-3 py-2.5 text-right">
                        {formatWeight3(b.originalFineCharge)}g
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">
                        {formatWeight3(b.settledFine)}g
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-amber-700">
                        {formatWeight3(b.remainingFine)}g
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                            b.status === "SETTLED"
                              ? "bg-green-100 text-green-800"
                              : b.status === "PARTIALLY_SETTLED" ||
                                b.status === "PARTIAL"
                              ? "bg-amber-100 text-amber-800"
                              : b.status === "CANCELLED"
                              ? "bg-gray-200 text-gray-500 line-through"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setViewingBill(b);
                            setBillViewTab("ISSUED_DOCUMENT");
                          }}
                          className="px-2.5 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-800 rounded cursor-pointer"
                        >
                          View Bill
                        </button>
                        {b.documentStatus === "POSTED" &&
                          Number(b.remainingFine) > 0 && (
                            <>
                              {Number(summaryCards.advanceAvailable) > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSettlingBillId(b.id);
                                    setSettleAmountFine(
                                      formatWeight3(
                                        Math.min(
                                          Number(b.remainingFine),
                                          Number(summaryCards.advanceAvailable)
                                        )
                                      )
                                    );
                                  }}
                                  className="px-2.5 py-1 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded cursor-pointer"
                                >
                                  Apply Advance
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiptFormMode("RECEIVE_FINE");
                                    setShowReceiptForm(true);
                                    setShowChooseBills(true);
                                    setAllocationMode("CHOOSE_BILLS");
                                    setSelectedBillIds([b.id]);
                                    setAmountReceived(b.remainingFine);
                                    document
                                      .getElementById(
                                        "receive-fine-gold-section"
                                      )
                                      ?.scrollIntoView({ behavior: "smooth" });
                                  }}
                                  className="px-2.5 py-1 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded cursor-pointer"
                                >
                                  Settle
                                </button>
                              )}
                            </>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {settlingBillId && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-sm">
              <div>
                Apply advance (Available: {summaryCards.advanceAvailable}g) to
                selected bill:
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.001"
                  value={settleAmountFine}
                  onChange={(e) => setSettleAmountFine(e.target.value)}
                  className="w-28 px-2 py-1 bg-white border border-gray-300 rounded"
                />
                <button
                  type="button"
                  disabled={postingSettlement}
                  onClick={() => {
                    const b = workspace.bills.find(
                      (x) => x.id === settlingBillId
                    );
                    if (b) void handleApplyExistingAdvanceToBill(b);
                  }}
                  className="px-3 py-1 bg-emerald-600 text-white font-medium rounded cursor-pointer"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => setSettlingBillId(null)}
                  className="px-2 py-1 text-gray-600 hover:underline cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Gold Recovery / Receipt History (Simple V1-style list) */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Gold Received History
          </h2>
          {workspace.transactionHistory.goldReceipts.length === 0 ? (
            <p className="text-center text-gray-500 py-6 text-sm">
              No gold receipts recorded yet.
            </p>
          ) : (
            <div className="space-y-3">
              {workspace.transactionHistory.goldReceipts.map((r) => (
                <div
                  key={r.id}
                  className={`p-3 rounded-lg border flex flex-wrap justify-between items-center gap-2 ${
                    r.status === "REVERSED"
                      ? "bg-gray-100 border-gray-200 opacity-60 line-through"
                      : "bg-green-50 border-green-200"
                  }`}
                >
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-green-200 text-green-800 mr-2">
                      +{formatWeight3(r.totalFineWeight)}g Fine
                    </span>
                    <span className="text-xs text-gray-500">
                      ({r.receiptNumber})
                    </span>
                    {Number(r.unallocatedFineWeight) > 0 && (
                      <span className="ml-2 text-xs text-emerald-700 font-medium">
                        • Advance left:{" "}
                        {formatWeight3(r.unallocatedFineWeight)}g
                      </span>
                    )}
                    <p className="text-sm font-medium text-gray-800 mt-1">
                      {r.notes || "Fine Gold Received"}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <p className="text-xs text-gray-500">{r.businessDate}</p>
                    {actor.role === "OWNER_ADMIN" && r.status === "POSTED" && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleReverseReceipt(r.id, r.receiptNumber)
                        }
                        className="text-xs text-red-500 hover:text-red-700 cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Collapsible Statement & Advanced Allocations */}
        <details className="bg-white p-6 rounded-lg shadow">
          <summary className="text-base font-semibold text-gray-800 cursor-pointer select-none">
            Full Customer Statement & Bill Allocations
          </summary>

          <div className="mt-4 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">
                  Month:
                </label>
                <input
                  type="month"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-300 rounded"
                />
                {monthFilter && (
                  <button
                    type="button"
                    onClick={() => setMonthFilter("")}
                    className="text-xs text-blue-600 hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportStatementCsv}
                  className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded cursor-pointer"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded cursor-pointer"
                >
                  Print
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Reference</th>
                    <th className="p-2 text-right">Gold Charged</th>
                    <th className="p-2 text-right">Gold Received</th>
                    <th className="p-2 text-left">Allocation</th>
                    <th className="p-2 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-gray-50 font-semibold">
                    <td className="p-2">
                      {workspace.statement.monthFilter
                        ? `${workspace.statement.monthFilter}-01`
                        : "OPENING"}
                    </td>
                    <td className="p-2">Opening Balance</td>
                    <td className="p-2 text-right">
                      {Number(workspace.statement.openingDues) > 0
                        ? `${workspace.statement.openingDues}g`
                        : "—"}
                    </td>
                    <td className="p-2 text-right text-emerald-700">
                      {Number(workspace.statement.openingAdvance) > 0
                        ? `${workspace.statement.openingAdvance}g`
                        : "—"}
                    </td>
                    <td className="p-2">—</td>
                    <td className="p-2 text-right">
                      {workspace.statement.openingBalanceLabel}
                    </td>
                  </tr>
                  {workspace.statement.rows.map((r) => (
                    <tr
                      key={r.id}
                      className={
                        r.isAllocationOnly ? "text-gray-500 italic" : ""
                      }
                    >
                      <td className="p-2">{r.date}</td>
                      <td className="p-2">
                        <strong>{r.reference}</strong> — {r.description}
                      </td>
                      <td className="p-2 text-right">
                        {r.goldCharged !== "—" ? `${r.goldCharged}g` : "—"}
                      </td>
                      <td className="p-2 text-right text-emerald-700">
                        {r.goldReceivedCredit !== "—"
                          ? `${r.goldReceivedCredit}g`
                          : "—"}
                      </td>
                      <td className="p-2">{r.allocationAdjustment}</td>
                      <td className="p-2 text-right font-semibold">
                        {r.runningBalanceLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {workspace.transactionHistory.allocations.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">
                  Bill Settlement Allocations
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Receipt #</th>
                        <th className="p-2 text-left">Bill #</th>
                        <th className="p-2 text-right">Settled Fine</th>
                        <th className="p-2 text-center">Status</th>
                        <th className="p-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {workspace.transactionHistory.allocations.map((a) => (
                        <tr key={a.id}>
                          <td className="p-2">{a.businessDate}</td>
                          <td className="p-2">{a.goldReceiptNumber || "—"}</td>
                          <td className="p-2 font-semibold">{a.billNumber}</td>
                          <td className="p-2 text-right">
                            {a.allocatedFineWeight}g
                          </td>
                          <td className="p-2 text-center">{a.status}</td>
                          <td className="p-2 text-right">
                            {actor.role === "OWNER_ADMIN" &&
                              a.status === "ACTIVE" && (
                                <button
                                  type="button"
                                  onClick={() => void handleUndoAllocation(a.id)}
                                  className="text-amber-700 hover:underline cursor-pointer"
                                >
                                  Undo
                                </button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </details>

        {/* Modal: View Bill */}
        {viewingBill && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-xl">
              <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-800">
                    Bill {viewingBill.billNumber} ({viewingBill.date})
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setBillViewTab("ISSUED_DOCUMENT")}
                      className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
                        billViewTab === "ISSUED_DOCUMENT"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      Original Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillViewTab("LIVE_STATUS")}
                      className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer ${
                        billViewTab === "LIVE_STATUS"
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      Live Payment Status
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {actor.role === "OWNER_ADMIN" &&
                    viewingBill.documentStatus === "POSTED" && (
                      <button
                        type="button"
                        onClick={() => {
                          const id = viewingBill.id;
                          const num = viewingBill.billNumber;
                          setViewingBill(null);
                          void handleCancelBill(id, num);
                        }}
                        className="text-xs text-red-600 hover:underline cursor-pointer"
                      >
                        Cancel Bill
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => setViewingBill(null)}
                    className="text-sm font-bold text-gray-600 hover:text-gray-900 cursor-pointer"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                {billViewTab === "ISSUED_DOCUMENT" ? (
                  viewingBill.previewHtml ? (
                    <div
                      className="border border-gray-200 p-4 rounded bg-white"
                      dangerouslySetInnerHTML={{
                        __html: viewingBill.previewHtml,
                      }}
                    />
                  ) : (
                    <p className="text-sm text-gray-500">
                      No invoice preview available.
                    </p>
                  )
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="p-4 border border-gray-200 rounded-lg space-y-2">
                      <div className="font-bold text-gray-800 border-b pb-1">
                        At Bill Issuance
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">
                          Previous Outstanding:
                        </span>
                        <span>
                          {viewingBill.issuedSnapshot.previousOutstandingFine}g
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">New Bill Charge:</span>
                        <span className="font-semibold">
                          {viewingBill.issuedSnapshot.newBillChargeFine}g
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Advance Applied:</span>
                        <span className="text-emerald-700">
                          {viewingBill.issuedSnapshot.advanceAppliedFine}g
                        </span>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-1">
                        <span>Total Due at Issuance:</span>
                        <span>
                          {
                            viewingBill.issuedSnapshot
                              .totalOutstandingAfterIssuanceFine
                          }
                          g
                        </span>
                      </div>
                    </div>

                    <div className="p-4 border border-blue-200 bg-blue-50/40 rounded-lg space-y-2">
                      <div className="font-bold text-blue-900 border-b pb-1">
                        Live Status Today
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Original Charge:</span>
                        <span>
                          {viewingBill.livePaymentStatus.originalFineCharge}g
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Settled So Far:</span>
                        <span className="text-emerald-700 font-semibold">
                          {viewingBill.livePaymentStatus.liveSettledFine}g
                        </span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span>Remaining on This Bill:</span>
                        <span className="text-amber-800">
                          {viewingBill.livePaymentStatus.liveRemainingFine}g
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-1 font-bold">
                        <span>Customer Total Due Today:</span>
                        <span>{summaryCards.goldDue}g</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Refund Advance */}
        {showRefundModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <form
              onSubmit={handleRefundAdvance}
              className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-base font-bold text-gray-800">
                  Refund Customer Advance Gold
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="text-gray-500"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-gray-600">
                Available Advance:{" "}
                <strong className="text-emerald-700">
                  {summaryCards.advanceAvailable}g fine
                </strong>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fine Gold to Refund (g) *
                </label>
                <input
                  type="number"
                  step="0.001"
                  max={summaryCards.advanceAvailable}
                  required
                  value={refundFineWeight}
                  onChange={(e) => setRefundFineWeight(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason *
                </label>
                <input
                  type="text"
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="e.g. Returned excess advance gold"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRefundModal(false)}
                  className="px-4 py-2 text-sm text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={postingRefund}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-md cursor-pointer"
                >
                  {postingRefund ? "Refunding..." : "Confirm Refund"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AppShell>
  );
}
