"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, AppShellUser } from "@/components/AppShell";
import {
  DailyReconciliationReport,
  PurityStockRow,
} from "@/lib/domain/erp-service";
import { getTodayBusinessDateString } from "@/lib/date-and-export";
import {
  fetchActorCached,
  fetchCachedJson,
  getCachedActor,
  getCachedJson,
} from "@/lib/client-cache";

interface JournalHistoryRow {
  id: string;
  transactionNumber: string;
  transactionType: string;
  businessDate: string;
  purityId: string;
  purityLabel: string;
  touchSnapshot: string;
  physicalWeight: string;
  fineEquivalentWeight: string;
  sourceReference: string | null;
  reason: string;
  bagNumber: string | null;
  karigarName: string | null;
  isReversed: boolean;
  createdAt: string;
}

interface StockSaleRow {
  id: string;
  saleNumber: string;
  businessDate: string;
  purityId: string;
  purityLabel: string;
  physicalWeight: string;
  touchPercent: string;
  fineEquivalentWeight: string;
  buyerName: string;
  buyerPhone: string | null;
  pricePerGramRupees: string;
  totalAmountRupees: string;
  paidAmountRupees: string;
  paymentStatus: string;
  status: string;
  referenceNumber: string | null;
  notes: string | null;
  reversalReason: string | null;
}

export default function StockPage() {
  const router = useRouter();
  const cachedStock = getCachedJson<{
    ok?: boolean;
    reconciliation?: DailyReconciliationReport;
    history?: JournalHistoryRow[];
    sales?: StockSaleRow[];
  }>("/api/stock");
  const [actor, setActor] = useState<AppShellUser | null>(() => getCachedActor());
  const [reconciliation, setReconciliation] =
    useState<DailyReconciliationReport | null>(
      () => cachedStock?.reconciliation || null
    );
  const [history, setHistory] = useState<JournalHistoryRow[]>(
    () => cachedStock?.history || []
  );
  const [sales, setSales] = useState<StockSaleRow[]>(
    () => cachedStock?.sales || []
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // V1-style toggleable forms
  const [showAddForm, setShowAddForm] = useState(false);
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [showSellForm, setShowSellForm] = useState(false);
  const [showPurityForm, setShowPurityForm] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);

  // Form 1: Add / Remove Gold
  const [addDate, setAddDate] = useState(getTodayBusinessDateString());
  const [addPurityId, setAddPurityId] = useState("");
  const [addDirection, setAddDirection] = useState<"ADD" | "REMOVE">("ADD");
  const [addWeight, setAddWeight] = useState("");
  const [addDescription, setAddDescription] = useState("");

  // Form 2: Convert Fine <-> Karat
  const [convDirection, setConvDirection] = useState<"FINE_TO_KARAT" | "KARAT_TO_FINE">(
    "FINE_TO_KARAT"
  );
  const [convDate, setConvDate] = useState(getTodayBusinessDateString());
  const [convTargetPurityId, setConvTargetPurityId] = useState("");
  const [convFineWeight, setConvFineWeight] = useState("");
  const [convActualOutput, setConvActualOutput] = useState("");
  const [convDescription, setConvDescription] = useState("");

  // Form 3: Sell Gold
  const [sellDate, setSellDate] = useState(getTodayBusinessDateString());
  const [sellPurityId, setSellPurityId] = useState("");
  const [sellWeight, setSellWeight] = useState("");
  const [sellAmountRupees, setSellAmountRupees] = useState("");
  const [sellBuyerName, setSellBuyerName] = useState("");
  const [sellNotes, setSellNotes] = useState("");

  // Optional New Purity Form
  const [purityCode, setPurityCode] = useState("");
  const [purityLabel, setPurityLabel] = useState("");
  const [purityKarat, setPurityKarat] = useState("");
  const [purityTouch, setPurityTouch] = useState("");

  // Controlled Reversal Modal
  const [reversalTarget, setReversalTarget] =
    useState<JournalHistoryRow | null>(null);
  const [reversalReason, setReversalReason] = useState("");

  const loadData = useCallback(
    async (force = false) => {
      const [resolvedActor, stkData] = await Promise.all([
        fetchActorCached(),
        fetchCachedJson<{
          ok?: boolean;
          reconciliation?: DailyReconciliationReport;
          history?: JournalHistoryRow[];
          sales?: StockSaleRow[];
        }>("/api/stock", { force }),
      ]);
      if (!resolvedActor) {
        router.push("/login?redirect=/stock");
        return;
      }
      setActor(resolvedActor);

      if (stkData.ok && stkData.reconciliation) {
        setReconciliation(stkData.reconciliation);
        setHistory(stkData.history || []);
        setSales(stkData.sales || []);

        const purities: PurityStockRow[] = stkData.reconciliation?.byPurity || [];
        const nonFinePurities = purities.filter(
          (p) => !p.isFineCategory && Number(p.touchPercent) < 99
        );
        const primaryFine =
          purities.find((p) => Number(p.touchPercent) === 100) ||
          purities.find((p) => p.code === "ADMIN_FINE_GOLD") ||
          purities.find((p) => p.isFineCategory) ||
          purities[0];
        if (!addPurityId && primaryFine) {
          setAddPurityId(primaryFine.purityId);
        }
        if (!convTargetPurityId && nonFinePurities.length > 0) {
          setConvTargetPurityId(nonFinePurities[0].purityId);
        }
        if (!sellPurityId && primaryFine) {
          setSellPurityId(primaryFine.purityId);
        }
      }
    },
    [router, addPurityId, convTargetPurityId, sellPurityId]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!actor || !reconciliation) {
    return (
      <div className="p-6 text-sm text-gray-600">Loading Admin Stock...</div>
    );
  }

  const allPurities = reconciliation.byPurity;
  const finePurities = allPurities.filter(
    (p) => p.isFineCategory || Number(p.touchPercent) >= 99
  );
  const finePurity =
    finePurities.find((p) => Number(p.touchPercent) === 100) ||
    finePurities.find((p) => p.code === "ADMIN_FINE_GOLD") ||
    finePurities[0] ||
    allPurities[0];
  const karatPurities = allPurities.filter(
    (p) => !p.isFineCategory && Number(p.touchPercent) < 99
  );
  // Single unified Fine Gold option + Karat options for dropdowns (no duplicate Fine 99% / 99.9% / 100%)
  const selectablePurities = finePurity
    ? [finePurity, ...karatPurities]
    : karatPurities;

  const totalAdminStockFine = allPurities.reduce(
    (sum, p) => sum + Number(p.adminFineEquivalent || 0),
    0
  );
  const directFineGold = finePurities.reduce(
    (sum, p) => sum + Number(p.adminFineEquivalent || 0),
    0
  );
  const directFinePhysical = finePurities.reduce(
    (sum, p) => sum + Number(p.adminPhysicalWeight || 0),
    0
  );

  // Handlers
  async function handleAddOrRemoveGold(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const weightNum = Number(addWeight);
    if (!addPurityId || !(weightNum > 0)) {
      setError("Please enter a valid gold weight.");
      return;
    }
    setSubmitting(true);
    try {
      const action =
        addDirection === "ADD" ? "STOCK_RECEIPT" : "STOCK_REMOVAL";
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          purityId: addPurityId,
          physicalWeight: weightNum.toFixed(3),
          businessDate: addDate,
          sourceReference:
            addDirection === "ADD" ? "MANUAL-ADD" : "MANUAL-REMOVE",
          reason:
            addDescription.trim() ||
            (addDirection === "ADD"
              ? "Added to Admin Stock"
              : "Removed from Admin Stock"),
          idempotencyKey: `ui_addrem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to update stock");
      } else {
        setAddWeight("");
        setAddDescription("");
        setShowAddForm(false);
        setMessage(
          `${addDirection === "ADD" ? "Added" : "Removed"} ${
            data.transaction.physicalWeight
          }g (${data.transaction.fineEquivalentWeight}g fine)`
        );
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConvertFineToKarat(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!finePurity) {
      setError("Fine gold purity is not configured.");
      return;
    }
    const inputAmt = Number(convFineWeight);
    const karatPurity = allPurities.find(
      (p) => p.purityId === convTargetPurityId
    );
    if (!karatPurity || !(inputAmt > 0)) {
      setError("Please select a karat purity and enter a valid weight.");
      return;
    }
    const karatTouch = Number(karatPurity.touchPercent);
    const fineTouch = Number(finePurity.touchPercent || 100);

    const isFineToKarat = convDirection === "FINE_TO_KARAT";
    const sourcePurityId = isFineToKarat ? finePurity.purityId : karatPurity.purityId;
    const targetPurityId = isFineToKarat ? karatPurity.purityId : finePurity.purityId;
    const sourcePhysical = isFineToKarat ? (inputAmt * 100) / fineTouch : inputAmt;
    const expectedOutput = isFineToKarat
      ? (inputAmt * 100) / karatTouch
      : (inputAmt * karatTouch) / fineTouch;
    const actualOutput =
      Number(convActualOutput) > 0 ? Number(convActualOutput) : expectedOutput;

    setSubmitting(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "POST_CONVERSION",
          conversionType: convDirection,
          businessDate: convDate,
          sourcePurityId,
          sourceWeight: sourcePhysical.toFixed(3),
          targetPurityId,
          actualOutputWeight: actualOutput.toFixed(3),
          returnedMetalWeight: "0",
          residueWeight: "0",
          lossTreatment: "ACCEPTED",
          notes:
            convDescription.trim() ||
            (isFineToKarat
              ? `Converted ${inputAmt.toFixed(3)}g Fine → ${actualOutput.toFixed(
                  3
                )}g of ${karatPurity.displayLabel}`
              : `Converted ${inputAmt.toFixed(3)}g ${karatPurity.displayLabel} → ${actualOutput.toFixed(
                  3
                )}g Fine`),
          idempotencyKey: `ui_conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to convert gold");
      } else {
        setConvFineWeight("");
        setConvActualOutput("");
        setConvDescription("");
        setShowConvertForm(false);
        setMessage(
          isFineToKarat
            ? `Converted ${inputAmt.toFixed(2)}g Fine → ${actualOutput.toFixed(
                2
              )}g of ${karatPurity.displayLabel}`
            : `Converted ${inputAmt.toFixed(2)}g ${karatPurity.displayLabel} → ${actualOutput.toFixed(
                2
              )}g Fine`
        );
        await loadData(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSellGold(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const w = Number(sellWeight);
    const totalRs = Number(sellAmountRupees);
    if (!sellPurityId || !(w > 0) || !(totalRs >= 0)) {
      setError("Please enter valid weight and amount.");
      return;
    }
    const ratePerGram = w > 0 ? totalRs / w : 0;
    const actualPaid = Number((w * Number(ratePerGram.toFixed(2))).toFixed(2));

    setSubmitting(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "STOCK_SALE",
          purityId: sellPurityId,
          physicalWeight: w.toFixed(3),
          businessDate: sellDate,
          buyerName: sellBuyerName.trim() || "Walk-in Buyer",
          pricePerGramRupees: ratePerGram.toFixed(2),
          paidAmountRupees: actualPaid.toFixed(2),
          notes: sellNotes.trim() || undefined,
          idempotencyKey: `ui_sale_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to record gold sale");
      } else {
        setSellWeight("");
        setSellAmountRupees("");
        setSellBuyerName("");
        setSellNotes("");
        setShowSellForm(false);
        setMessage(
          `Recorded Gold Sale ${data.sale.saleNumber}: ${data.sale.physicalWeight}g for ₹${data.sale.totalAmountRupees}`
        );
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreatePurity(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/purities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: purityCode,
          displayLabel: purityLabel,
          karatLabel: purityKarat || purityLabel,
          touchPercent: purityTouch,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to configure purity");
      } else {
        setPurityCode("");
        setPurityLabel("");
        setPurityKarat("");
        setPurityTouch("");
        setShowPurityForm(false);
        setMessage(`Added purity ${data.purity.displayLabel}`);
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReverseSale(saleId: string, saleNumber: string) {
    const reason = window.prompt(
      `Delete / reverse gold sale ${saleNumber}? Gold will be restored to stock. Enter reason:`
    );
    if (!reason) return;
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVERSE_STOCK_SALE",
          saleId,
          reason,
          idempotencyKey: `ui_revsale_${saleId}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to reverse sale");
      } else {
        setMessage(`Restored stock from sale ${saleNumber}.`);
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReversal(e: React.FormEvent) {
    e.preventDefault();
    if (!reversalTarget) return;
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVERSE_RECEIPT",
          transactionId: reversalTarget.id,
          reason: reversalReason,
          businessDate: getTodayBusinessDateString(),
          idempotencyKey: `ui_rev_${reversalTarget.id}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to reverse transaction");
      } else {
        setReversalTarget(null);
        setReversalReason("");
        setMessage(
          `Reversed entry via ${data.transaction.transactionNumber}`
        );
        await loadData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const internalTransferTypes = new Set([
    "PROCESS_CUSTODY_TRANSFER",
    "PROCESS_LOSS_RECOGNITION",
    "ORDER_COMPLETION_FINISHED_GOODS",
    "BILL_POST_AND_DELIVER",
  ]);
  const inTypes = new Set([
    "OPENING_BALANCE",
    "STOCK_RECEIPT",
    "KARIGAR_RECOVERY_RECEIPT",
    "CUSTOMER_GOLD_RECEIPT",
    "FILING_UNUSED_RETURN",
    "EXTRA_METAL_RETURN",
    "STOCK_SALE_REVERSAL",
  ]);

  const activeSales = sales.filter((s) => s.status !== "REVERSED");
  const totalSoldGrams = activeSales.reduce(
    (s, r) => s + Number(r.physicalWeight || 0),
    0
  );
  const totalSoldRupees = activeSales.reduce(
    (s, r) => s + Number(r.totalAmountRupees || 0),
    0
  );

  return (
    <AppShell actor={actor}>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Admin Stock</h1>
            <p className="text-sm text-gray-600 mt-1">
              Karat-wise gold on hand, converted to fine gold
            </p>
          </div>
          {actor.role === "OWNER_ADMIN" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm((prev) => !prev);
                  setShowConvertForm(false);
                  setShowSellForm(false);
                  setShowPurityForm(false);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-sm cursor-pointer"
              >
                {showAddForm ? "Cancel" : "Add / Remove Gold"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConvertForm((prev) => !prev);
                  setShowAddForm(false);
                  setShowSellForm(false);
                  setShowPurityForm(false);
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium text-sm cursor-pointer"
              >
                {showConvertForm ? "Cancel" : "Convert Fine → Karat"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSellForm((prev) => !prev);
                  setShowAddForm(false);
                  setShowConvertForm(false);
                  setShowPurityForm(false);
                }}
                className="px-4 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 font-medium text-sm cursor-pointer"
              >
                {showSellForm ? "Cancel" : "💰 Sell Gold"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPurityForm((prev) => !prev);
                  setShowAddForm(false);
                  setShowConvertForm(false);
                  setShowSellForm(false);
                }}
                className="px-3 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-200 font-medium text-sm cursor-pointer"
              >
                {showPurityForm ? "Cancel" : "+ Karat"}
              </button>
            </div>
          )}
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

        {/* Green Card: Total Admin Stock (Fine Gold) */}
        <div className="bg-gradient-to-br from-emerald-500 to-green-700 text-white p-6 rounded-xl shadow-lg">
          <p className="text-sm opacity-90">Total Admin Stock (Fine Gold)</p>
          <p className="text-4xl font-bold mt-2">
            {totalAdminStockFine.toFixed(2)}g
          </p>
          <p className="text-xs opacity-80 mt-2">
            Sum of every karat converted to fine (weight × purity ÷ 100) + direct
            fine gold
          </p>
        </div>

        {/* Sky-Blue Card: Fine Gold (Direct) */}
        <div className="bg-gradient-to-br from-sky-500 to-blue-700 text-white p-6 rounded-xl shadow-lg">
          <div className="flex flex-wrap justify-between items-start gap-2">
            <div>
              <p className="text-sm opacity-90">Fine Gold (Direct)</p>
              <p className="text-3xl font-bold mt-1">
                {directFineGold.toFixed(2)}g
              </p>
              <p className="text-xs opacity-80 mt-2">
                Directly added fine gold + recovered from customers — can be
                converted to any karat
              </p>
            </div>
            {directFinePhysical > 0 && (
              <span className="text-xs bg-white/20 px-2.5 py-1 rounded-md font-medium">
                Physical: {directFinePhysical.toFixed(2)}g
              </span>
            )}
          </div>
        </div>

        {/* Form 1: Add or Remove Gold */}
        {showAddForm && (
          <form
            onSubmit={handleAddOrRemoveGold}
            className="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-800">
              Add or Remove Gold
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Karat (Purity)
                </label>
                <select
                  value={addPurityId}
                  onChange={(e) => setAddPurityId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                >
                  {selectablePurities.map((p) => (
                    <option key={p.purityId} value={p.purityId}>
                      {p.purityId === finePurity?.purityId
                        ? "Fine (direct)"
                        : `${p.displayLabel} (${Number(p.touchPercent)
                            .toFixed(1)
                            .replace(/\.0$/, "")}%)`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Direction
                </label>
                <select
                  value={addDirection}
                  onChange={(e) =>
                    setAddDirection(e.target.value as "ADD" | "REMOVE")
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                >
                  <option value="ADD">Add (+)</option>
                  <option value="REMOVE">Remove (-)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight (grams)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={addWeight}
                  onChange={(e) => setAddWeight(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
                placeholder="Reason or note"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium cursor-pointer"
              >
                {submitting ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        )}

        {/* Form 2: Convert Fine Gold to Karat */}
        {showConvertForm && (
          <form
            onSubmit={handleConvertFineToKarat}
            className="bg-white p-6 rounded-lg shadow border-2 border-purple-200 space-y-4"
          >
            <h2 className="text-lg font-semibold text-purple-800">
              Convert Fine Gold to Karat
            </h2>
            <p className="text-sm text-gray-600">
              Available Fine Gold:{" "}
              <span className="font-bold text-sky-700">
                {directFineGold.toFixed(2)}g
              </span>
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConvDirection("FINE_TO_KARAT");
                    setConvActualOutput("");
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded border cursor-pointer ${
                    convDirection === "FINE_TO_KARAT"
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Fine → Karat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConvDirection("KARAT_TO_FINE");
                    setConvActualOutput("");
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded border cursor-pointer ${
                    convDirection === "KARAT_TO_FINE"
                      ? "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  Karat → Fine
                </button>
              </div>
              <span className="text-xs text-gray-500">
                Calculation preview is shown below; enter actual measured output if different.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={convDate}
                  onChange={(e) => setConvDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {convDirection === "FINE_TO_KARAT" ? "Target Karat" : "Source Karat"}
                </label>
                <select
                  value={convTargetPurityId}
                  onChange={(e) => setConvTargetPurityId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                >
                  {karatPurities.map((p) => (
                    <option key={p.purityId} value={p.purityId}>
                      {p.displayLabel} ({p.touchPercent}%)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {convDirection === "FINE_TO_KARAT"
                    ? "Fine Amount to Convert (g)"
                    : "Karat Weight to Convert (g)"}
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={convFineWeight}
                  onChange={(e) => setConvFineWeight(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Actual Physical Output (g)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={convActualOutput}
                  onChange={(e) => setConvActualOutput(e.target.value)}
                  placeholder="Auto from preview"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            {Number(convFineWeight) > 0 &&
              (() => {
                const targetP = allPurities.find(
                  (p) => p.purityId === convTargetPurityId
                );
                if (!targetP) return null;
                const fineTouch = Number(finePurity?.touchPercent || 100);
                const outG =
                  convDirection === "FINE_TO_KARAT"
                    ? (Number(convFineWeight) * 100) / Number(targetP.touchPercent)
                    : (Number(convFineWeight) * Number(targetP.touchPercent)) / fineTouch;
                return (
                  <div className="bg-purple-50 border border-purple-200 rounded-md p-3 text-sm text-purple-900">
                    <span className="font-semibold">Calculation Preview:</span>{" "}
                    {convDirection === "FINE_TO_KARAT" ? (
                      <>
                        <span className="font-semibold">
                          {Number(convFineWeight).toFixed(3)}g Fine
                        </span>{" "}
                        →{" "}
                        <span className="font-bold text-purple-700">
                          {outG.toFixed(3)}g of {targetP.displayLabel} gold
                        </span>{" "}
                        <span className="text-xs text-purple-600">
                          (Fine × 100 ÷ {targetP.touchPercent})
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">
                          {Number(convFineWeight).toFixed(3)}g {targetP.displayLabel}
                        </span>{" "}
                        →{" "}
                        <span className="font-bold text-purple-700">
                          {outG.toFixed(3)}g Fine Gold
                        </span>{" "}
                        <span className="text-xs text-purple-600">
                          (Karat × {targetP.touchPercent} ÷ {fineTouch})
                        </span>
                      </>
                    )}
                  </div>
                );
              })()}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={convDescription}
                onChange={(e) => setConvDescription(e.target.value)}
                placeholder="Reason or note"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium cursor-pointer"
              >
                {submitting ? "Converting..." : "Convert"}
              </button>
            </div>
          </form>
        )}

        {/* Form 3: Sell Gold */}
        {showSellForm && (
          <form
            onSubmit={handleSellGold}
            className="bg-white p-6 rounded-lg shadow border-2 border-rose-200 space-y-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-rose-800">
                💰 Sell Gold
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Sell fine or karat gold from admin stock and record the cash
                received.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={sellDate}
                  onChange={(e) => setSellDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Karat (Purity)
                </label>
                <select
                  value={sellPurityId}
                  onChange={(e) => setSellPurityId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                >
                  {selectablePurities.map((p) => (
                    <option key={p.purityId} value={p.purityId}>
                      {p.purityId === finePurity?.purityId
                        ? `Fine (direct) (Available: ${directFineGold.toFixed(2)}g)`
                        : `${p.displayLabel} (Available: ${p.adminPhysicalWeight}g)`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight Sold (grams) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={sellWeight}
                  onChange={(e) => setSellWeight(e.target.value)}
                  placeholder="e.g. 10.50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount Received (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={sellAmountRupees}
                  onChange={(e) => setSellAmountRupees(e.target.value)}
                  placeholder="e.g. 75000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buyer Name (optional)
                </label>
                <input
                  type="text"
                  value={sellBuyerName}
                  onChange={(e) => setSellBuyerName(e.target.value)}
                  placeholder="Buyer / customer name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={sellNotes}
                  onChange={(e) => setSellNotes(e.target.value)}
                  placeholder="Payment mode / remark"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            {Number(sellWeight) > 0 && Number(sellAmountRupees) > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-md p-3 text-sm text-rose-900 flex flex-wrap justify-between items-center gap-2">
                <div>
                  Sale Summary:{" "}
                  <span className="font-bold">
                    {Number(sellWeight).toFixed(2)}g
                  </span>{" "}
                  for{" "}
                  <span className="font-bold text-emerald-700">
                    ₹
                    {Number(sellAmountRupees).toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="text-xs text-rose-700 font-medium">
                  Rate: ₹
                  {(Number(sellAmountRupees) / Number(sellWeight)).toLocaleString(
                    "en-IN",
                    { maximumFractionDigits: 2 }
                  )}{" "}
                  / gram
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-rose-600 text-white rounded-md hover:bg-rose-700 font-medium cursor-pointer"
              >
                {submitting
                  ? "Recording..."
                  : "💰 Record Sale & Deduct Stock"}
              </button>
            </div>
          </form>
        )}

        {/* Optional Form 4: Add Custom Karat */}
        {showPurityForm && (
          <form
            onSubmit={handleCreatePurity}
            className="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-800">
              Add New Karat / Purity
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code *
                </label>
                <input
                  type="text"
                  required
                  value={purityCode}
                  onChange={(e) => setPurityCode(e.target.value)}
                  placeholder="e.g. P_91_6"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={purityLabel}
                  onChange={(e) => setPurityLabel(e.target.value)}
                  placeholder="e.g. 91.6% Gold"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Karat Label
                </label>
                <input
                  type="text"
                  value={purityKarat}
                  onChange={(e) => setPurityKarat(e.target.value)}
                  placeholder="e.g. 22K"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Touch % *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={purityTouch}
                  onChange={(e) => setPurityTouch(e.target.value)}
                  placeholder="e.g. 91.6"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium cursor-pointer"
              >
                Save Karat
              </button>
            </div>
          </form>
        )}

        {/* Stock by Karat Grid */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Stock by Karat / Stock by Touch
            </h2>
            <span className="text-xs text-gray-500">
              Mixed-Purity Physical:{" "}
              {allPurities
                .reduce((s, p) => s + Number(p.adminPhysicalWeight || 0), 0)
                .toFixed(2)}
              g
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {karatPurities.map((row) => {
              const weight = Number(row.adminPhysicalWeight || 0);
              const fine = Number(row.adminFineEquivalent || 0);
              return (
                <div
                  key={row.purityId}
                  className="bg-gradient-to-br from-amber-50 to-yellow-100 p-4 rounded-lg border-2 border-amber-200"
                >
                  <p className="text-sm text-gray-700 font-medium">
                    {row.displayLabel}{" "}
                    <span className="text-xs text-gray-500">
                      ({Number(row.touchPercent).toFixed(1).replace(/\.0$/, "")}
                      %)
                    </span>
                  </p>
                  <p className="text-3xl font-bold text-amber-800 mt-1">
                    {weight.toFixed(2)}g
                  </p>
                  <p className="text-xs text-amber-900 mt-2 font-medium">
                    Fine: {fine.toFixed(2)}g
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gold Sales History */}
        {sales.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  💰 Gold Sales History
                </h2>
                <p className="text-xs text-gray-500">
                  All gold sold from admin stock
                </p>
              </div>
              <div className="flex gap-4 text-right">
                <div className="bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">
                  <p className="text-[11px] text-rose-600 font-medium">
                    Total Gold Sold
                  </p>
                  <p className="text-base font-bold text-rose-800">
                    {totalSoldGrams.toFixed(2)}g
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                  <p className="text-[11px] text-emerald-600 font-medium">
                    Total Cash Received
                  </p>
                  <p className="text-base font-bold text-emerald-800">
                    ₹
                    {totalSoldRupees.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Karat
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Weight
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Fine Eq.
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Amount (₹)
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Rate / g
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Buyer / Notes
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {sales.map((sale) => {
                    const isRev = sale.status === "REVERSED";
                    return (
                      <tr
                        key={sale.id}
                        className={`hover:bg-gray-50 ${
                          isRev ? "line-through text-gray-400" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5 text-gray-700">
                          {sale.businessDate}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                            {sale.purityLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-rose-700">
                          -{Number(sale.physicalWeight).toFixed(2)}g
                        </td>
                        <td className="px-3 py-2.5 text-gray-600">
                          {Number(sale.fineEquivalentWeight).toFixed(2)}g
                        </td>
                        <td className="px-3 py-2.5 font-bold text-emerald-700">
                          ₹
                          {Number(sale.totalAmountRupees).toLocaleString(
                            "en-IN",
                            { maximumFractionDigits: 2 }
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">
                          ₹
                          {Number(sale.pricePerGramRupees).toLocaleString(
                            "en-IN",
                            { maximumFractionDigits: 0 }
                          )}
                          /g
                        </td>
                        <td className="px-3 py-2.5 text-gray-700">
                          {sale.buyerName && (
                            <span className="font-medium">
                              {sale.buyerName}
                            </span>
                          )}
                          {sale.notes && (
                            <span className="text-xs text-gray-500 block">
                              {sale.notes}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {!isRev && actor.role === "OWNER_ADMIN" && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleReverseSale(
                                  sale.id,
                                  sale.saleNumber
                                )
                              }
                              className="text-xs text-red-500 hover:text-red-700 cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Entry History */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryExpanded((prev) => !prev)}
              className="text-lg font-semibold text-gray-800 hover:text-blue-600 cursor-pointer flex items-center gap-2"
            >
              <span>{historyExpanded ? "▼" : "▶"}</span>
              <span>Entry / Transaction History ({history.length})</span>
            </button>
            {historyExpanded && (
              <button
                type="button"
                onClick={() => setShowTechDetails((prev) => !prev)}
                className="text-xs text-gray-500 hover:text-gray-800 underline cursor-pointer"
              >
                {showTechDetails ? "Hide Technical details" : "Technical details"}
              </button>
            )}
          </div>
          {historyExpanded &&
            (history.length === 0 ? (
              <p className="text-center text-gray-500 py-8 mt-4">
                No stock entries yet. Click &quot;Add / Remove Gold&quot; to
                record your stock.
              </p>
            ) : (
              <div className="space-y-3 mt-4">
                {history.map((entry) => {
                  const isPositive = inTypes.has(entry.transactionType);
                  const isInternal = internalTransferTypes.has(entry.transactionType);
                  const weight = Number(entry.physicalWeight || 0);
                  const fine = Number(entry.fineEquivalentWeight || 0);
                  const signPrefix = isInternal ? "" : isPositive ? "+" : "-";
                  return (
                    <div
                      key={entry.id}
                      className={`p-3 rounded-lg border flex flex-wrap justify-between items-center gap-2 ${
                        entry.isReversed
                          ? "bg-gray-100 border-gray-200 opacity-60 line-through"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            isInternal
                              ? "bg-slate-200 text-slate-800"
                              : isPositive
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {isInternal ? "Moved " : signPrefix}
                          {weight.toFixed(2)}g @ {entry.purityLabel}
                        </span>
                        <span className="text-xs text-gray-500">
                          (Fine: {signPrefix}
                          {fine.toFixed(2)}g{isInternal ? " • internal" : ""})
                        </span>
                        {showTechDetails && (
                          <span className="text-xs font-mono text-gray-400">
                            [{entry.transactionNumber}]
                          </span>
                        )}
                        <p className="text-sm font-medium text-gray-800 w-full mt-1">
                          {entry.reason}
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <p className="text-xs text-gray-500">
                          {entry.businessDate.slice(0, 10)}
                        </p>
                        {actor.role === "OWNER_ADMIN" &&
                          !entry.isReversed &&
                          (entry.transactionType === "STOCK_RECEIPT" ||
                            entry.transactionType === "OPENING_BALANCE") && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversalTarget(entry);
                                setReversalReason("");
                              }}
                              className="text-xs text-red-500 hover:text-red-700 cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>

        {/* Controlled Reversal Modal */}
        {reversalTarget && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
              <h3 className="text-lg font-bold text-gray-800">
                Reverse Stock Entry
              </h3>
              <p className="text-sm text-gray-600">
                Reverse{" "}
                <span className="font-semibold">
                  {reversalTarget.physicalWeight}g of{" "}
                  {reversalTarget.purityLabel}
                </span>
                ? Please enter a short reason:
              </p>
              <form onSubmit={handleConfirmReversal} className="space-y-4">
                <input
                  type="text"
                  required
                  autoFocus
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Entered by mistake"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReversalTarget(null)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-md hover:bg-red-700 cursor-pointer"
                  >
                    Confirm
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
