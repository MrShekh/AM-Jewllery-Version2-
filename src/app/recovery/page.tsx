"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, AppShellUser } from "@/components/AppShell";
import {
  CANONICAL_PROCESS_SEQUENCE,
  PROCESS_DISPLAY_LABELS,
  ProcessType,
} from "@/lib/domain/types";
import {
  formatKolkataDateDDMMYYYY,
  getTodayBusinessDateString,
} from "@/lib/date-and-export";
import { formatWeight3 } from "@/lib/decimal";
import {
  fetchActorCached,
  fetchCachedJson,
  getCachedActor,
  getCachedJson,
} from "@/lib/client-cache";

interface KarigarSummary {
  karigarId: string;
  karigarCode: string;
  karigarName: string;
  custodyPhysicalWeight: string;
  custodyFineWeight: string;
  eligibleOriginalFine: string;
  makingAllowedFine: string;
  recoveredFine: string;
  writtenOffFine: string;
  outstandingFine: string;
  unallocatedCreditFine: string;
}

interface EligibleLossRow {
  id: string;
  orderId: string;
  bagNumber: string;
  orderName: string;
  orderStatus: string;
  processType: ProcessType;
  visitNumber: number;
  karigarId: string;
  karigarName: string;
  completionDate: string;
  businessDate: string;
  touchPercent: string;
  rawLossWeight: string;
  originalFineLoss: string;
  makingAllowedFine: string;
  recoveredFine: string;
  writtenOffFine: string;
  outstandingFine: string;
  settlementStatus: "OUTSTANDING" | "PARTIAL" | "SETTLED";
}

interface TouchGroupRow {
  touchPercent: string;
  outstandingMetalEquivalent: string;
  outstandingFine: string;
  originalFineLoss: string;
  makingAllowedFine: string;
  recoveredFine: string;
  writtenOffFine: string;
  hasPriorMakingDeduction: boolean;
  claimIds: string[];
  claimCount: number;
}

interface RecoverySettlementRow {
  id: string;
  settlementNumber: string;
  karigarId: string;
  karigarName: string;
  businessDate: string;
  scopeType: "SINGLE_TOUCH" | "ALL_TOUCHES";
  scopeTouchPercent: string | null;
  scopeProcessType: ProcessType | null;
  grossSelectedFine: string;
  makingDeductionFine: string;
  makingInputWeight: string;
  makingInputUnit: "RAW_AT_TOUCH" | "FINE";
  netExpectedFine: string;
  receivedFine: string;
  differenceFine: string;
  shortageAction: string | null;
  acceptedShortageFine: string;
  carriedShortageFine: string;
  excessFine: string;
  recoveryReceiptId: string | null;
  receiptNumber: string | null;
  receiptLines: Array<{
    id: string;
    purityId: string;
    purityLabel: string;
    grossWeight: string;
    touchPercent: string;
    fineWeight: string;
  }>;
  allocations?: Array<{
    id: string;
    processLossRecordId: string;
    bagNumber: string;
    processType: ProcessType;
    allocatedFineWeight: string;
    status: string;
    businessDate: string;
  }>;
  notes: string | null;
  status: "POSTED" | "REVERSED";
  reversedAt: string | null;
  reversalReason: string | null;
}

interface PeriodReconciliation {
  openingOutstandingFine: string;
  newlyEligibleLossFine: string;
  documentedAdjustmentsFine: string;
  makingDeductionsFine: string;
  recoveryAllocationsFine: string;
  writeOffsFine: string;
  closingOutstandingFine: string;
  physicalReceiptsFine: string;
}

interface PurityItem {
  id: string;
  displayLabel: string;
  touchPercent: string;
}

interface RecoveryReceiptRow {
  id: string;
  receiptNumber: string;
  karigarId: string;
  businessDate: string;
  recoveredFineWeight: string;
  allocatedFineWeight: string;
  unallocatedFineWeight: string;
  status: string;
  allocations: Array<{
    id: string;
    processLossRecordId: string;
    allocatedFineWeight: string;
    status: string;
  }>;
}

function RecoveryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialKarigarId = searchParams.get("karigarId") || "";

  const [actor, setActor] = useState<AppShellUser | null>(() => getCachedActor());
  const [karigarSummaries, setKarigarSummaries] = useState<KarigarSummary[]>([]);
  const [eligibleLosses, setEligibleLosses] = useState<EligibleLossRow[]>([]);
  const [touchGroups, setTouchGroups] = useState<TouchGroupRow[]>([]);
  const [settlements, setSettlements] = useState<RecoverySettlementRow[]>([]);
  const [receipts, setReceipts] = useState<RecoveryReceiptRow[]>([]);
  const [periodRecon, setPeriodRecon] = useState<PeriodReconciliation | null>(
    null
  );
  const [purities, setPurities] = useState<PurityItem[]>(
    () => getCachedJson<{ purities: PurityItem[] }>("/api/purities")?.purities || []
  );

  // Filters
  const [karigarFilter, setKarigarFilter] = useState<string>(initialKarigarId);
  const [processFilter, setProcessFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Expandable sections (collapsed by default)
  const [showOrders, setShowOrders] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(true);
  const [printableSettlement, setPrintableSettlement] =
    useState<RecoverySettlementRow | null>(null);
  const [expandedSettlementId, setExpandedSettlementId] = useState<
    string | null
  >(null);
  const [showMoreOptions, setShowMoreOptions] = useState<boolean>(false);

  // Active Recovery Settlement Modal/Panel
  const [activeRecovery, setActiveRecovery] = useState<{
    scopeType: "SINGLE_TOUCH" | "ALL_TOUCHES";
    touchPercent?: string;
    grossMetalEq?: string;
    grossFine: string;
    priorMakingFine: string;
    hasPriorMaking: boolean;
    claimIds: string[];
  } | null>(null);

  const [makingInput, setMakingInput] = useState<string>("0");
  const [allowAdditionalMaking, setAllowAdditionalMaking] =
    useState<boolean>(false);
  const [additionalMakingReason, setAdditionalMakingReason] =
    useState<string>("");
  const [recLines, setRecLines] = useState<
    Array<{ purityId: string; grossWeight: string; touchPercent: string }>
  >([]);
  const [shortageAction, setShortageAction] = useState<
    "CARRY_FORWARD" | "ACCEPT_AND_CLEAR" | "ACCEPT_PART" | ""
  >("");
  const [acceptedShortageInput, setAcceptedShortageInput] =
    useState<string>("");
  const [recDate, setRecDate] = useState<string>(getTodayBusinessDateString());
  const [recNotes, setRecNotes] = useState<string>("");
  const [recIdempotencyKey, setRecIdempotencyKey] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadWorkspace = useCallback(
    async (force = false) => {
      const qs = new URLSearchParams();
      if (karigarFilter) qs.set("karigarId", karigarFilter);
      if (processFilter) qs.set("processType", processFilter);
      if (fromDate) qs.set("fromDate", fromDate);
      if (toDate) qs.set("toDate", toDate);

      const [resolvedActor, recData, purData] = await Promise.all([
        fetchActorCached(),
        fetchCachedJson<{
          ok?: boolean;
          karigarSummaries?: KarigarSummary[];
          eligibleLosses?: EligibleLossRow[];
          touchGroups?: TouchGroupRow[];
          settlements?: RecoverySettlementRow[];
          receipts?: RecoveryReceiptRow[];
          periodReconciliation?: PeriodReconciliation | null;
        }>(`/api/recovery?${qs.toString()}`, { force }),
        fetchCachedJson<{ ok?: boolean; purities?: PurityItem[] }>(
          "/api/purities",
          { ttlMs: 300_000 }
        ),
      ]);

      if (!resolvedActor) {
        router.push("/login?redirect=/recovery");
        return;
      }
      setActor(resolvedActor);

      if (recData.ok) {
        const summaries: KarigarSummary[] = recData.karigarSummaries || [];
        setKarigarSummaries(summaries);
        setEligibleLosses(recData.eligibleLosses || []);
        setTouchGroups(recData.touchGroups || []);
        setSettlements(recData.settlements || []);
        setReceipts(recData.receipts || []);
        setPeriodRecon(recData.periodReconciliation || null);
        if (!karigarFilter && summaries.length > 0) {
          const firstWithOutstanding =
            summaries.find((k) => Number(k.outstandingFine) > 0) ?? summaries[0];
          setKarigarFilter(firstWithOutstanding.karigarId);
        }
      }
      if (purData.ok) {
        setPurities(purData.purities || []);
      }
    },
    [router, karigarFilter, processFilter, fromDate, toDate]
  );

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const activeKarigar = useMemo(
    () => karigarSummaries.find((k) => k.karigarId === karigarFilter) || null,
    [karigarSummaries, karigarFilter]
  );

  const totalOutstandingFine = useMemo(
    () =>
      touchGroups.reduce((s, g) => s + Number(g.outstandingFine || 0), 0),
    [touchGroups]
  );

  function openSingleTouchRecovery(g: TouchGroupRow) {
    setError(null);
    setSuccess(null);
    const matchedPurity =
      purities.find(
        (p) => Math.abs(Number(p.touchPercent) - Number(g.touchPercent)) < 0.05
      ) ?? purities[0];
    setActiveRecovery({
      scopeType: "SINGLE_TOUCH",
      touchPercent: g.touchPercent,
      grossMetalEq: g.outstandingMetalEquivalent,
      grossFine: g.outstandingFine,
      priorMakingFine: g.makingAllowedFine,
      hasPriorMaking: g.hasPriorMakingDeduction,
      claimIds: g.claimIds,
    });
    setMakingInput("0");
    setAllowAdditionalMaking(false);
    setAdditionalMakingReason("");
    setRecLines([
      {
        purityId: matchedPurity?.id || "",
        grossWeight: "",
        touchPercent: Number(g.touchPercent).toString(),
      },
    ]);
    setShortageAction("");
    setAcceptedShortageInput("");
    setRecDate(getTodayBusinessDateString());
    setRecNotes("");
    setRecIdempotencyKey(
      `set_${karigarFilter}_${g.touchPercent}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`
    );
  }

  function openRecoverAll() {
    if (touchGroups.length === 0) return;
    setError(null);
    setSuccess(null);
    const allClaimIds = touchGroups.flatMap((g) => g.claimIds);
    const priorMaking = touchGroups.reduce(
      (s, g) => s + Number(g.makingAllowedFine || 0),
      0
    );
    const hasPrior = touchGroups.some((g) => g.hasPriorMakingDeduction);
    const defaultPur = purities[0];
    setActiveRecovery({
      scopeType: "ALL_TOUCHES",
      grossFine: formatWeight3(totalOutstandingFine),
      priorMakingFine: formatWeight3(priorMaking),
      hasPriorMaking: hasPrior,
      claimIds: allClaimIds,
    });
    setMakingInput("0");
    setAllowAdditionalMaking(false);
    setAdditionalMakingReason("");
    setRecLines([
      {
        purityId: defaultPur?.id || "",
        grossWeight: "",
        touchPercent: defaultPur?.touchPercent || "92",
      },
    ]);
    setShortageAction("");
    setAcceptedShortageInput("");
    setRecDate(getTodayBusinessDateString());
    setRecNotes("");
    setRecIdempotencyKey(
      `set_all_${karigarFilter}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`
    );
  }

  const calcPreview = useMemo(() => {
    if (!activeRecovery) return null;
    const isSingle = activeRecovery.scopeType === "SINGLE_TOUCH";
    const scopeTouch = Number(activeRecovery.touchPercent || 0);
    const grossFine = Number(activeRecovery.grossFine || 0);
    const grossRaw =
      isSingle && scopeTouch > 0 ? grossFine / (scopeTouch / 100) : 0;

    const mkIn = Math.max(0, Number(makingInput || 0));
    const makingFine =
      isSingle && scopeTouch > 0 ? (mkIn * scopeTouch) / 100 : mkIn;
    const netExpectedFine = grossFine - makingFine;
    const netExpectedRaw =
      isSingle && scopeTouch > 0 ? netExpectedFine / (scopeTouch / 100) : 0;

    const receivedFine = recLines.reduce((s, l) => {
      const gw = Math.max(0, Number(l.grossWeight || 0));
      const tp = Math.max(0, Number(l.touchPercent || 0));
      return s + (gw * tp) / 100;
    }, 0);
    const receivedGross = recLines.reduce(
      (s, l) => s + Math.max(0, Number(l.grossWeight || 0)),
      0
    );

    const differenceFine = netExpectedFine - receivedFine;
    const isSameTouch =
      isSingle &&
      recLines.length === 1 &&
      Math.abs(Number(recLines[0]?.touchPercent || 0) - scopeTouch) < 0.01;
    const differenceRaw =
      isSingle && scopeTouch > 0 ? differenceFine / (scopeTouch / 100) : 0;

    const acceptPartIn = Math.max(0, Number(acceptedShortageInput || 0));
    const acceptPartFine =
      isSingle && scopeTouch > 0
        ? (acceptPartIn * scopeTouch) / 100
        : acceptPartIn;
    const carryPartFine = Math.max(0, differenceFine - acceptPartFine);
    const carryPartRaw =
      isSingle && scopeTouch > 0 ? carryPartFine / (scopeTouch / 100) : 0;

    return {
      isSingle,
      scopeTouch,
      grossFine,
      grossRaw,
      makingInputNum: mkIn,
      makingFine,
      netExpectedFine,
      netExpectedRaw,
      receivedFine,
      receivedGross,
      differenceFine,
      differenceRaw,
      isSameTouch,
      acceptPartIn,
      acceptPartFine,
      carryPartFine,
      carryPartRaw,
    };
  }, [activeRecovery, makingInput, recLines, acceptedShortageInput]);

  async function handleConfirmRecovery(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRecovery || !karigarFilter || submitting) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "POST_RECOVERY_SETTLEMENT",
          karigarId: karigarFilter,
          scopeType: activeRecovery.scopeType,
          scopeTouchPercent: activeRecovery.touchPercent,
          scopeProcessType: processFilter || undefined,
          businessDate: recDate,
          makingDeductionInput: makingInput || "0",
          allowAdditionalMaking,
          additionalMakingReason: additionalMakingReason || undefined,
          lines: recLines.filter((l) => Number(l.grossWeight || 0) > 0),
          shortageAction:
            calcPreview && calcPreview.differenceFine > 0.0001
              ? shortageAction || undefined
              : undefined,
          acceptedShortageInput:
            shortageAction === "ACCEPT_PART" ? acceptedShortageInput : undefined,
          snapshotClaimIds: activeRecovery.claimIds,
          snapshotExpectedOutstandingFine: activeRecovery.grossFine,
          notes: recNotes || undefined,
          idempotencyKey: recIdempotencyKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not post recovery settlement");
        if (res.status === 409) {
          await loadWorkspace();
        }
      } else {
        setActiveRecovery(null);
        setSuccess(
          `Confirmed ${data.settlementNumber}: Making ${data.makingDeductionFine}g fine, Received ${data.receivedFine}g fine${
            Number(data.acceptedShortageFine) > 0
              ? `, Accepted shortage ${data.acceptedShortageFine}g fine`
              : ""
          }${
            Number(data.carriedShortageFine) > 0
              ? `, Carried forward ${data.carriedShortageFine}g fine`
              : ""
          }${
            Number(data.excessFine) > 0
              ? `, Extra gold received ${data.excessFine}g fine (unallocated credit)`
              : ""
          }.`
        );
        await loadWorkspace();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReverseSettlement(
    settlementId: string,
    settlementNumber: string
  ) {
    const reason = window.prompt(
      `Reason for reversing settlement ${settlementNumber} (reverses making deduction, write-off, and linked stock receipt if unused):`
    );
    if (!reason || !reason.trim()) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVERSE_RECOVERY_SETTLEMENT",
          settlementId,
          reason: reason.trim(),
          idempotencyKey: `rev_set_${settlementId}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to reverse settlement");
      } else {
        setSuccess(`Reversed settlement ${settlementNumber}.`);
        await loadWorkspace();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWriteOffLoss(loss: EligibleLossRow) {
    const fineStr = window.prompt(
      `Write off fine gold (g) for Bag #${loss.bagNumber} (${PROCESS_DISPLAY_LABELS[loss.processType]}). Max ${loss.outstandingFine}g:`,
      loss.outstandingFine
    );
    if (!fineStr || Number(fineStr) <= 0) return;
    const reason = window.prompt("Reason for write-off:");
    if (!reason || !reason.trim()) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "WRITE_OFF_LOSS",
          processLossRecordId: loss.id,
          fineAmount: fineStr.trim(),
          reason: reason.trim(),
          idempotencyKey: `wo_${loss.id}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to write off loss");
      } else {
        setSuccess(`Written off ${data.writtenOffFineWeight}g fine on Bag #${loss.bagNumber}.`);
        await loadWorkspace();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAllocateReceipt(receipt: RecoveryReceiptRow) {
    const targetLoss = eligibleLosses.find(
      (l) => l.karigarId === receipt.karigarId && Number(l.outstandingFine) > 0
    );
    if (!targetLoss) {
      setError("No outstanding eligible loss found for this karigar to allocate credit.");
      return;
    }
    const maxAmt = Math.min(
      Number(receipt.unallocatedFineWeight),
      Number(targetLoss.outstandingFine)
    );
    const amt = window.prompt(
      `Allocate unallocated credit from ${receipt.receiptNumber} (${formatWeight3(receipt.unallocatedFineWeight)}g fine) to Bag #${targetLoss.bagNumber} (outstanding ${formatWeight3(targetLoss.outstandingFine)}g fine):`,
      formatWeight3(maxAmt)
    );
    if (!amt || Number(amt) <= 0) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ALLOCATE_RECEIPT",
          recoveryReceiptId: receipt.id,
          allocations: [
            {
              processLossRecordId: targetLoss.id,
              fineAmount: amt.trim(),
            },
          ],
          idempotencyKey: `alloc_${receipt.id}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to allocate receipt credit");
      } else {
        setSuccess(
          `Allocated ${amt.trim()}g fine from ${receipt.receiptNumber}. Remaining unallocated: ${data.unallocatedFineWeight}g.`
        );
        await loadWorkspace();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefundExcess(receipt: RecoveryReceiptRow) {
    const defaultPurity = purities[0];
    if (!defaultPurity) {
      setError("No purity configured.");
      return;
    }
    const purityLabelList = purities.map((p) => `${p.displayLabel} (${p.touchPercent}%)`).join(", ");
    const grossWeight = window.prompt(
      `Refund excess credit from ${receipt.receiptNumber} (${receipt.unallocatedFineWeight}g fine) using ${defaultPurity.displayLabel} (${defaultPurity.touchPercent}%).\nAvailable purities: ${purityLabelList}\nEnter gross weight (g) to refund:`
    );
    if (!grossWeight || Number(grossWeight) <= 0) return;
    const reason = window.prompt("Reason for excess refund:") || "Excess recovery gold returned to karigar";
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REFUND_EXCESS",
          receiptId: receipt.id,
          purityId: defaultPurity.id,
          touchPercent: defaultPurity.touchPercent,
          grossWeight: grossWeight.trim(),
          reason: reason.trim(),
          idempotencyKey: `ref_${receipt.id}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to refund excess credit");
      } else {
        setSuccess(
          `Refunded excess on ${receipt.receiptNumber}. Remaining unallocated: ${data.unallocatedFineWeight}g.`
        );
        await loadWorkspace();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUndoAllocation(allocationId: string) {
    const reason = window.prompt("Reason for undoing this recovery allocation:");
    if (!reason || !reason.trim()) return;
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UNDO_ALLOCATION",
          allocationId,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to undo allocation");
      } else {
        setSuccess(`Undid allocation. Receipt unallocated credit: ${data.unallocatedFineWeight}g.`);
        await loadWorkspace();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!actor) {
    return (
      <div className="p-6 text-xs text-slate-600">
        Loading karigar recovery workspace...
      </div>
    );
  }

  return (
    <AppShell actor={actor}>
      <div className="space-y-4">
        {/* Header & Karigar Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              Karigar Recovery
            </h1>
            <p className="text-xs text-slate-600">
              Select a karigar to recover eligible losses by touch or across all touches.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={karigarFilter}
              onChange={(e) => {
                setKarigarFilter(e.target.value);
                setActiveRecovery(null);
              }}
              className="px-2.5 py-1.5 border border-slate-300 rounded-xs bg-white font-semibold"
            >
              {karigarSummaries.map((k) => (
                <option key={k.karigarId} value={k.karigarId}>
                  {k.karigarName} ({k.karigarCode}) — {formatWeight3(k.outstandingFine)}g fine due
                </option>
              ))}
            </select>
            <select
              value={processFilter}
              onChange={(e) => {
                setProcessFilter(e.target.value);
                setActiveRecovery(null);
              }}
              className="px-2.5 py-1.5 border border-slate-300 rounded-xs bg-white"
            >
              <option value="">All Processes</option>
              {CANONICAL_PROCESS_SEQUENCE.map((pt) => (
                <option key={pt} value={pt}>
                  {PROCESS_DISPLAY_LABELS[pt]}
                </option>
              ))}
            </select>
            <a
              href={`/api/reconciliation?format=csv_recovery${
                karigarFilter ? `&karigarId=${encodeURIComponent(karigarFilter)}` : ""
              }`}
              className="px-2.5 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-xs font-medium text-slate-700"
            >
              Export Statement
            </a>
          </div>
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xs">
            {error}
          </div>
        )}
        {success && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs rounded-xs">
            {success}
          </div>
        )}

        {/* 3 Small Summary Cards (Fine Grams) */}
        {activeKarigar && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="bg-amber-50 border border-amber-300 rounded-xs p-2.5">
              <div className="text-[10px] font-bold uppercase text-amber-900">
                Gold with karigar
              </div>
              <div className="text-sm font-mono font-bold text-amber-950 mt-0.5 tabular-nums">
                {formatWeight3(activeKarigar.custodyFineWeight)} g fine
              </div>
              <div className="text-[10px] font-mono text-amber-800">
                {formatWeight3(activeKarigar.custodyPhysicalWeight)} g physical (Open Custody, Not Loss)
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-300 rounded-xs p-2.5">
              <div className="text-[10px] font-bold uppercase text-blue-900">
                Loss remaining to recover
              </div>
              <div className="text-sm font-mono font-bold text-blue-950 mt-0.5 tabular-nums">
                {formatWeight3(activeKarigar.outstandingFine)} g fine
              </div>
              <div className="text-[10px] text-blue-800">
                Unallocated credit: {formatWeight3(activeKarigar.unallocatedCreditFine)} g fine
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-300 rounded-xs p-2.5">
              <div className="text-[10px] font-bold uppercase text-emerald-900">
                Recovered this month
              </div>
              <div className="text-sm font-mono font-bold text-emerald-950 mt-0.5 tabular-nums">
                {periodRecon
                  ? `${formatWeight3(periodRecon.physicalReceiptsFine)} g fine`
                  : `${formatWeight3(activeKarigar.recoveredFine)} g fine`}
              </div>
              <div className="text-[10px] text-emerald-800">
                Making allowed: {formatWeight3(activeKarigar.makingAllowedFine)} g fine
              </div>
            </div>
          </div>
        )}

        {/* Simple Karigar-First Touch Table */}
        <div className="bg-white border border-slate-300 rounded-xs p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Outstanding Recoverable Loss by Touch
              {activeKarigar ? ` — ${activeKarigar.karigarName}` : ""}
            </h2>
            <span className="text-xs font-mono text-slate-600">
              All months • Oldest claims settled first
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xs">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <th className="p-2 text-left">Touch</th>
                  <th className="p-2 text-right">
                    Outstanding metal equivalent
                  </th>
                  <th className="p-2 text-right">Fine equivalent</th>
                  <th className="p-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {touchGroups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-500">
                      No outstanding recoverable loss for this karigar.
                    </td>
                  </tr>
                ) : (
                  touchGroups.map((g) => (
                    <tr
                      key={g.touchPercent}
                      className="border-b border-slate-100 font-mono tabular-nums"
                    >
                      <td className="p-2 font-sans font-semibold text-slate-900">
                        {Number(g.touchPercent)}%
                        {g.hasPriorMakingDeduction && (
                          <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xs">
                            Making already allowed: {formatWeight3(g.makingAllowedFine)}g fine
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right font-semibold text-slate-900">
                        {formatWeight3(g.outstandingMetalEquivalent)}g
                      </td>
                      <td className="p-2 text-right font-semibold text-blue-900">
                        {formatWeight3(g.outstandingFine)}g fine
                      </td>
                      <td className="p-2 text-right font-sans">
                        {actor.role === "OWNER_ADMIN" && (
                          <button
                            type="button"
                            onClick={() => openSingleTouchRecovery(g)}
                            className="px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                          >
                            Recover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="text-xs font-mono">
              Total outstanding:{" "}
              <strong className="text-sm text-blue-950">
                {formatWeight3(totalOutstandingFine)}g fine
              </strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOrders((prev) => !prev)}
                className="px-2.5 py-1.5 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 rounded-xs cursor-pointer"
              >
                {showOrders
                  ? "Hide orders"
                  : `View orders (${eligibleLosses.length})`}
              </button>
              {actor.role === "OWNER_ADMIN" && touchGroups.length > 0 && (
                <button
                  type="button"
                  onClick={openRecoverAll}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                >
                  Recover All
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Recovery Form (Single Touch or Recover All) */}
        {activeRecovery && calcPreview && actor.role === "OWNER_ADMIN" && (
          <form
            onSubmit={handleConfirmRecovery}
            className="bg-white border-2 border-blue-700 rounded-xs p-4 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {calcPreview.isSingle
                    ? `Recover ${calcPreview.scopeTouch}% Loss — ${activeKarigar?.karigarName || ""}`
                    : `Recover All Outstanding Losses — ${activeKarigar?.karigarName || ""}`}
                </h2>
                <p className="text-[11px] text-slate-600">
                  Scope:{" "}
                  {processFilter
                    ? PROCESS_DISPLAY_LABELS[processFilter as ProcessType]
                    : "All processes"}{" "}
                  • {activeRecovery.claimIds.length} eligible entry(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveRecovery(null)}
                className="text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {!calcPreview.isSingle && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xs text-xs space-y-1">
                <div className="font-bold text-slate-800">
                  Per-Touch Breakdown:
                </div>
                <div className="flex flex-wrap gap-3 font-mono">
                  {touchGroups.map((g) => (
                    <span
                      key={g.touchPercent}
                      className="px-2 py-0.5 bg-white border border-slate-300 rounded-xs"
                    >
                      {Number(g.touchPercent)}%: {formatWeight3(g.outstandingMetalEquivalent)}g
                      {" "}({formatWeight3(g.outstandingFine)}g fine)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Gross, Making, Net Expected */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xs">
                <div className="text-[11px] font-semibold text-slate-600">
                  Gross outstanding loss
                </div>
                <div className="text-sm font-mono font-bold text-slate-900 mt-0.5">
                  {calcPreview.isSingle
                    ? `${formatWeight3(calcPreview.grossRaw)}g @ ${calcPreview.scopeTouch}%`
                    : `${formatWeight3(calcPreview.grossFine)}g fine`}
                </div>
                {calcPreview.isSingle && (
                  <div className="text-[11px] font-mono text-slate-500">
                    ({formatWeight3(calcPreview.grossFine)}g fine)
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {calcPreview.isSingle
                    ? `Making charge deduction (g @ ${calcPreview.scopeTouch}%)`
                    : "Making charge deduction (g fine)"}
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={makingInput}
                  onChange={(e) => setMakingInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xs font-mono"
                />
                {calcPreview.isSingle && (
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    = {formatWeight3(calcPreview.makingFine)}g fine
                  </div>
                )}
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xs">
                <div className="text-[11px] font-semibold text-blue-900">
                  Net expected recovery
                </div>
                <div className="text-sm font-mono font-bold text-blue-950 mt-0.5">
                  {calcPreview.isSingle
                    ? `${formatWeight3(calcPreview.netExpectedRaw)}g @ ${calcPreview.scopeTouch}%`
                    : `${formatWeight3(calcPreview.netExpectedFine)}g fine`}
                </div>
                {calcPreview.isSingle && (
                  <div className="text-[11px] font-mono text-blue-700">
                    ({formatWeight3(calcPreview.netExpectedFine)}g fine)
                  </div>
                )}
              </div>
            </div>

            {/* Prior making guard */}
            {activeRecovery.hasPriorMaking && calcPreview.makingFine > 0 && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xs text-xs space-y-2">
                <div className="font-semibold text-amber-950">
                  Carried claims already have {formatWeight3(activeRecovery.priorMakingFine)}g fine making allowed. Confirm to apply an additional making deduction:
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowAdditionalMaking}
                    onChange={(e) => setAllowAdditionalMaking(e.target.checked)}
                  />
                  <span>Yes, allow additional making deduction</span>
                </label>
                <input
                  type="text"
                  required={allowAdditionalMaking}
                  value={additionalMakingReason}
                  onChange={(e) => setAdditionalMakingReason(e.target.value)}
                  placeholder="Reason for additional making adjustment..."
                  className="w-full px-2.5 py-1 border border-amber-300 rounded-xs bg-white"
                />
              </div>
            )}

            {/* Actual Gold Received */}
            <div className="space-y-2 bg-slate-50 p-3 border border-slate-200 rounded-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Actual gold received
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setRecLines((prev) => [
                      ...prev,
                      {
                        purityId: purities[0]?.id || "",
                        grossWeight: "",
                        touchPercent: purities[0]?.touchPercent || "92",
                      },
                    ])
                  }
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  + Add Metal Line
                </button>
              </div>
              {recLines.map((line, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end text-xs"
                >
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Purity
                    </label>
                    <select
                      value={line.purityId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const p = purities.find((x) => x.id === pid);
                        setRecLines((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  purityId: pid,
                                  touchPercent: p
                                    ? p.touchPercent
                                    : item.touchPercent,
                                }
                              : item
                          )
                        );
                      }}
                      className="w-full px-2 py-1 border border-slate-300 rounded-xs bg-white"
                    >
                      <option value="">Custom Touch</option>
                      {purities.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayLabel} ({p.touchPercent}%)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Actual gold received (g)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={line.grossWeight}
                      onChange={(e) =>
                        setRecLines((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, grossWeight: e.target.value }
                              : item
                          )
                        )
                      }
                      placeholder="38.000"
                      className="w-full px-2 py-1 border border-slate-300 rounded-xs bg-white font-mono"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Received touch (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      max="100"
                      required
                      value={line.touchPercent}
                      onChange={(e) =>
                        setRecLines((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, touchPercent: e.target.value }
                              : item
                          )
                        )
                      }
                      className="w-full px-2 py-1 border border-slate-300 rounded-xs bg-white font-mono"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center justify-between gap-1">
                    <span className="font-mono text-[11px] text-slate-600">
                      {formatWeight3(
                        (Number(line.grossWeight || 0) *
                          Number(line.touchPercent || 0)) /
                          100
                      )}
                      g fine
                    </span>
                    {recLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setRecLines((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="text-red-700 font-semibold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Calculated Difference & Shortage/Excess */}
            <div
              className={`p-3 border rounded-xs text-xs space-y-2 ${
                calcPreview.differenceFine > 0.0001
                  ? "bg-amber-50 border-amber-300"
                  : calcPreview.differenceFine < -0.0001
                  ? "bg-emerald-50 border-emerald-300"
                  : "bg-blue-50 border-blue-200"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                <span>
                  Received:{" "}
                  <strong>{formatWeight3(calcPreview.receivedGross)}g</strong> (
                  <strong>{formatWeight3(calcPreview.receivedFine)}g fine</strong>)
                </span>
                <span>
                  {calcPreview.differenceFine > 0.0001 ? (
                    <strong className="text-amber-950">
                      Remaining shortage:{" "}
                      {calcPreview.isSameTouch
                        ? `${formatWeight3(calcPreview.differenceRaw)}g @ ${calcPreview.scopeTouch}% (${formatWeight3(calcPreview.differenceFine)}g fine)`
                        : `${formatWeight3(calcPreview.differenceFine)}g fine`}
                    </strong>
                  ) : calcPreview.differenceFine < -0.0001 ? (
                    <strong className="text-emerald-900">
                      Extra gold received:{" "}
                      {calcPreview.isSameTouch
                        ? `${formatWeight3(Math.abs(calcPreview.differenceRaw))}g @ ${calcPreview.scopeTouch}% (${formatWeight3(Math.abs(calcPreview.differenceFine))}g fine)`
                        : `${formatWeight3(Math.abs(calcPreview.differenceFine))}g fine`}
                    </strong>
                  ) : (
                    <strong className="text-blue-900">Fully settled (0.000g difference)</strong>
                  )}
                </span>
              </div>

              {calcPreview.differenceFine > 0.0001 && (
                <div className="space-y-2 pt-2 border-t border-amber-200">
                  <div className="font-bold text-amber-950">
                    Choose how to handle shortage:
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="shortageAction"
                        checked={shortageAction === "ACCEPT_AND_CLEAR"}
                        onChange={() => setShortageAction("ACCEPT_AND_CLEAR")}
                      />
                      <span>Accept shortage & clear</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="shortageAction"
                        checked={shortageAction === "CARRY_FORWARD"}
                        onChange={() => setShortageAction("CARRY_FORWARD")}
                      />
                      <span>Carry forward</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="shortageAction"
                        checked={shortageAction === "ACCEPT_PART"}
                        onChange={() => setShortageAction("ACCEPT_PART")}
                      />
                      <span>Accept part, carry the rest</span>
                    </label>
                  </div>

                  {shortageAction === "ACCEPT_PART" && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                          {calcPreview.isSingle
                            ? `Accepted amount (g @ ${calcPreview.scopeTouch}%)`
                            : "Accepted amount (g fine)"}
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={acceptedShortageInput}
                          onChange={(e) =>
                            setAcceptedShortageInput(e.target.value)
                          }
                          placeholder="0.500"
                          className="w-36 px-2 py-1 bg-white border border-slate-300 rounded-xs font-mono"
                        />
                      </div>
                      <div className="font-mono text-xs text-slate-800 pt-3">
                        Carried forward:{" "}
                        <strong>
                          {calcPreview.isSingle
                            ? `${formatWeight3(calcPreview.carryPartRaw)}g @ ${calcPreview.scopeTouch}% (${formatWeight3(calcPreview.carryPartFine)}g fine)`
                            : `${formatWeight3(calcPreview.carryPartFine)}g fine`}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs items-end">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Recovery date *
                </label>
                <input
                  type="date"
                  required
                  value={recDate}
                  onChange={(e) => setRecDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Optional note
                </label>
                <input
                  type="text"
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  placeholder="Optional note..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                >
                  {submitting ? "Posting..." : "Confirm Recovery"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Expandable Order-Level Details ("View orders") */}
        {showOrders && (
          <div className="bg-white border border-slate-300 rounded-xs p-3 space-y-2">
            <h3 className="text-xs font-bold text-slate-900">
              Order-Level Loss Details
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xs">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="p-2 text-left">Bag / Order</th>
                    <th className="p-2 text-left">Process</th>
                    <th className="p-2 text-left">Completed</th>
                    <th className="p-2 text-right">Touch</th>
                    <th className="p-2 text-right">Original Loss (g fine)</th>
                    <th className="p-2 text-right">Making Allowed (g fine)</th>
                    <th className="p-2 text-right">Gold Recovered (g fine)</th>
                    <th className="p-2 text-right">Accepted Shortage (g fine)</th>
                    <th className="p-2 text-right">Outstanding (g fine)</th>
                    {actor.role === "OWNER_ADMIN" && (
                      <th className="p-2 text-right">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {eligibleLosses.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-slate-100 font-mono tabular-nums"
                    >
                      <td className="p-2 font-sans">
                        <span className="font-semibold">#{l.bagNumber}</span>{" "}
                        <span className="text-slate-600">{l.orderName}</span>
                      </td>
                      <td className="p-2 font-sans">
                        {PROCESS_DISPLAY_LABELS[l.processType]} (V{l.visitNumber})
                      </td>
                      <td className="p-2 font-sans">
                        {formatKolkataDateDDMMYYYY(l.completionDate)}
                      </td>
                      <td className="p-2 text-right">{l.touchPercent}%</td>
                      <td className="p-2 text-right">{formatWeight3(l.originalFineLoss)}</td>
                      <td className="p-2 text-right text-amber-800">
                        {formatWeight3(l.makingAllowedFine)}
                      </td>
                      <td className="p-2 text-right text-emerald-700">
                        {formatWeight3(l.recoveredFine)}
                      </td>
                      <td className="p-2 text-right text-slate-600">
                        {formatWeight3(l.writtenOffFine)}
                      </td>
                      <td className="p-2 text-right font-bold text-blue-900">
                        {formatWeight3(l.outstandingFine)}
                      </td>
                      {actor.role === "OWNER_ADMIN" && (
                        <td className="p-2 text-right font-sans">
                          {Number(l.outstandingFine) > 0 && (
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => handleWriteOffLoss(l)}
                              className="text-amber-700 underline cursor-pointer disabled:opacity-50"
                            >
                              Write Off
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Saved Recovery Sheets / Folders */}
        <div className="bg-white border border-slate-300 rounded-xs p-3 space-y-2">
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            aria-expanded={showHistory}
            className="flex items-center gap-2 text-xs font-bold text-slate-800 hover:text-blue-700 cursor-pointer"
          >
            <span>{showHistory ? "▼" : "▶"}</span>
            <span>Recovery History — Saved Sheets ({settlements.length})</span>
          </button>

          {showHistory && (
            <div className="overflow-x-auto border border-slate-200 rounded-xs">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Touch / Scope</th>
                    <th className="p-2 text-right">Gross loss</th>
                    <th className="p-2 text-right">Making</th>
                    <th className="p-2 text-right">Received fine</th>
                    <th className="p-2 text-right">Accepted shortage</th>
                    <th className="p-2 text-right">Carried balance</th>
                    <th className="p-2 text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-3 text-center text-slate-500">
                        No recovery settlements posted yet.
                      </td>
                    </tr>
                  ) : (
                    settlements.map((st) => (
                      <React.Fragment key={st.id}>
                        <tr
                          className={`border-b border-slate-100 font-mono tabular-nums ${
                            st.status === "REVERSED" ? "opacity-50 line-through" : ""
                          }`}
                        >
                          <td className="p-2 font-sans">
                            {formatKolkataDateDDMMYYYY(st.businessDate)}
                          </td>
                          <td className="p-2 font-sans">
                            {st.scopeType === "SINGLE_TOUCH"
                              ? `${Number(st.scopeTouchPercent || 0)}%`
                              : "All Touches"}
                            {st.scopeProcessType
                              ? ` • ${PROCESS_DISPLAY_LABELS[st.scopeProcessType]}`
                              : ""}
                          </td>
                          <td className="p-2 text-right">
                            {formatWeight3(st.grossSelectedFine)}g
                          </td>
                          <td className="p-2 text-right text-amber-800">
                            {formatWeight3(st.makingDeductionFine)}g
                          </td>
                          <td className="p-2 text-right text-emerald-700">
                            {formatWeight3(st.receivedFine)}g
                          </td>
                          <td className="p-2 text-right">
                            {formatWeight3(st.acceptedShortageFine)}g
                          </td>
                          <td className="p-2 text-right text-blue-900">
                            {formatWeight3(st.carriedShortageFine)}g
                          </td>
                          <td className="p-2 text-right font-sans">
                            <button
                              type="button"
                              onClick={() => setPrintableSettlement(st)}
                              className="text-emerald-700 font-semibold underline cursor-pointer mr-2"
                            >
                              Open / Print Sheet
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSettlementId((prev) =>
                                  prev === st.id ? null : st.id
                                )
                              }
                              className="text-blue-700 underline cursor-pointer mr-2"
                            >
                              {expandedSettlementId === st.id ? "Hide" : "Quick View"}
                            </button>
                            {st.status === "POSTED" &&
                              actor.role === "OWNER_ADMIN" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleReverseSettlement(
                                      st.id,
                                      st.settlementNumber
                                    )
                                  }
                                  className="text-red-700 underline cursor-pointer"
                                >
                                  Reverse
                                </button>
                              )}
                          </td>
                        </tr>
                        {expandedSettlementId === st.id && (
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <td colSpan={8} className="p-2.5 text-[11px] space-y-1">
                              <div>
                                <strong>{st.settlementNumber}</strong> • Action:{" "}
                                {st.shortageAction || "SETTLED"}
                                {Number(st.excessFine) > 0
                                  ? ` • Extra gold received: ${st.excessFine}g fine`
                                  : ""}
                                {st.notes ? ` • Note: ${st.notes}` : ""}
                              </div>
                              {st.receiptLines.length > 0 && (
                                <div className="font-mono">
                                  Receipt {st.receiptNumber}:{" "}
                                  {st.receiptLines
                                    .map(
                                      (rl) =>
                                        `${rl.grossWeight}g @ ${rl.touchPercent}% (${rl.fineWeight}g fine)`
                                    )
                                    .join(", ")}
                                </div>
                              )}
                              {st.status === "REVERSED" && (
                                <div className="text-red-700">
                                  Reversed: {st.reversalReason}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Printable Saved Recovery Sheet Modal */}
        {printableSettlement && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-300 rounded-xs max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Karigar Recovery Sheet — {printableSettlement.settlementNumber}
                  </h2>
                  <p className="text-slate-600">
                    {printableSettlement.karigarName} • Date:{" "}
                    {formatKolkataDateDDMMYYYY(printableSettlement.businessDate)}
                  </p>
                </div>
                <div className="flex items-center gap-2 no-print">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xs cursor-pointer"
                  >
                    Print Sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintableSettlement(null)}
                    className="px-3 py-1.5 border border-slate-300 text-slate-700 font-semibold rounded-xs cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-slate-50 p-3 border border-slate-200 rounded-xs font-mono tabular-nums">
                <div>
                  <div className="text-[10px] font-sans text-slate-500">Total Loss</div>
                  <div className="font-bold">
                    {formatWeight3(printableSettlement.grossSelectedFine)}g
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-sans text-slate-500">Making Allowed</div>
                  <div className="font-bold text-amber-800">
                    {formatWeight3(printableSettlement.makingDeductionFine)}g
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-sans text-slate-500">Gold Recovered</div>
                  <div className="font-bold text-emerald-700">
                    {formatWeight3(printableSettlement.receivedFine)}g
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-sans text-slate-500">Accepted Shortage</div>
                  <div className="font-bold">
                    {formatWeight3(printableSettlement.acceptedShortageFine)}g
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-sans text-slate-500">Carried Balance</div>
                  <div className="font-bold text-blue-800">
                    {formatWeight3(printableSettlement.carriedShortageFine)}g
                  </div>
                </div>
              </div>

              {printableSettlement.receiptLines.length > 0 && (
                <div className="space-y-1">
                  <div className="font-bold text-slate-800">
                    Metal Received ({printableSettlement.receiptNumber})
                  </div>
                  <table className="w-full border border-slate-200 border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-left">
                        <th className="p-1.5">Purity</th>
                        <th className="p-1.5 text-right">Gross (g)</th>
                        <th className="p-1.5 text-right">Touch (%)</th>
                        <th className="p-1.5 text-right">Fine (g)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printableSettlement.receiptLines.map((rl) => (
                        <tr key={rl.id} className="border-b border-slate-100 font-mono">
                          <td className="p-1.5 font-sans">{rl.purityLabel}</td>
                          <td className="p-1.5 text-right">{rl.grossWeight}</td>
                          <td className="p-1.5 text-right">{rl.touchPercent}%</td>
                          <td className="p-1.5 text-right font-bold">{rl.fineWeight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="space-y-1">
                <div className="font-bold text-slate-800">
                  Orders Included in This Recovery
                </div>
                <table className="w-full border border-slate-200 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-left">
                      <th className="p-1.5">Bag #</th>
                      <th className="p-1.5">Process</th>
                      <th className="p-1.5 text-right">Settled Fine (g)</th>
                      <th className="p-1.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(printableSettlement.allocations ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-2 text-center text-slate-500">
                          Settled via making allowance / write-off (no physical receipt lines).
                        </td>
                      </tr>
                    ) : (
                      (printableSettlement.allocations ?? []).map((al) => (
                        <tr key={al.id} className="border-b border-slate-100 font-mono">
                          <td className="p-1.5 font-bold">#{al.bagNumber}</td>
                          <td className="p-1.5 font-sans">
                            {PROCESS_DISPLAY_LABELS[al.processType]}
                          </td>
                          <td className="p-1.5 text-right">{al.allocatedFineWeight}g</td>
                          <td className="p-1.5 text-right font-sans">{al.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* More Options (Period Reconciliation) */}
        <div className="bg-white border border-slate-300 rounded-xs p-3 space-y-3">
          <button
            type="button"
            onClick={() => setShowMoreOptions((prev) => !prev)}
            aria-expanded={showMoreOptions}
            className="flex items-center gap-2 text-xs font-bold text-slate-800 hover:text-blue-700 cursor-pointer"
          >
            <span>{showMoreOptions ? "▼" : "▶"}</span>
            <span>More options (Period reconciliation & date filters)</span>
          </button>

          {showMoreOptions && periodRecon && (
            <div className="space-y-3 pt-2 border-t border-slate-200 text-xs">
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 font-mono">
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xs">
                  <div className="text-[10px] font-sans text-slate-500">
                    Opening Outstanding
                  </div>
                  <div className="font-bold">
                    {formatWeight3(periodRecon.openingOutstandingFine)}g
                  </div>
                </div>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xs">
                  <div className="text-[10px] font-sans text-slate-500">
                    + Newly Eligible
                  </div>
                  <div className="font-bold">
                    {formatWeight3(periodRecon.newlyEligibleLossFine)}g
                  </div>
                </div>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xs">
                  <div className="text-[10px] font-sans text-slate-500">
                    − Making Deductions
                  </div>
                  <div className="font-bold text-amber-800">
                    {formatWeight3(periodRecon.makingDeductionsFine)}g
                  </div>
                </div>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xs">
                  <div className="text-[10px] font-sans text-slate-500">
                    − Gold Recovered
                  </div>
                  <div className="font-bold text-emerald-700">
                    {formatWeight3(periodRecon.recoveryAllocationsFine)}g
                  </div>
                </div>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-xs">
                  <div className="text-[10px] font-sans text-slate-500">
                    − Accepted Shortage
                  </div>
                  <div className="font-bold">{formatWeight3(periodRecon.writeOffsFine)}g</div>
                </div>
                <div className="p-2 bg-blue-50 border border-blue-300 rounded-xs">
                  <div className="text-[10px] font-sans text-blue-900">
                    = Closing Outstanding
                  </div>
                  <div className="font-bold text-blue-950">
                    {formatWeight3(periodRecon.closingOutstandingFine)}g
                  </div>
                </div>
                <div className="p-2 bg-emerald-50 border border-emerald-300 rounded-xs">
                  <div className="text-[10px] font-sans text-emerald-900">
                    Physical Receipts
                  </div>
                  <div className="font-bold text-emerald-950">
                    {formatWeight3(periodRecon.physicalReceiptsFine)}g
                  </div>
                </div>
              </div>

              {actor.role === "OWNER_ADMIN" &&
                receipts.some(
                  (r) =>
                    r.status !== "REVERSED" &&
                    (Number(r.unallocatedFineWeight) > 0 ||
                      (r.allocations && r.allocations.some((a) => a.status === "ACTIVE")))
                ) && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="font-bold text-slate-800">
                      Unallocated Excess Credit &amp; Receipt Allocations
                    </div>
                    <div className="overflow-x-auto border border-slate-200 rounded-xs">
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                            <th className="p-1.5 text-left">Receipt</th>
                            <th className="p-1.5 text-right">Received (g fine)</th>
                            <th className="p-1.5 text-right">Allocated (g fine)</th>
                            <th className="p-1.5 text-right">Unallocated Credit</th>
                            <th className="p-1.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receipts
                            .filter(
                              (r) =>
                                r.status !== "REVERSED" &&
                                (Number(r.unallocatedFineWeight) > 0 ||
                                  (r.allocations && r.allocations.some((a) => a.status === "ACTIVE")))
                            )
                            .map((r) => (
                              <tr key={r.id} className="border-b border-slate-100 font-mono">
                                <td className="p-1.5 font-sans font-semibold">
                                  {r.receiptNumber}
                                </td>
                                <td className="p-1.5 text-right">{formatWeight3(r.recoveredFineWeight)}</td>
                                <td className="p-1.5 text-right">{formatWeight3(r.allocatedFineWeight)}</td>
                                <td className="p-1.5 text-right font-bold text-amber-800">
                                  {formatWeight3(r.unallocatedFineWeight)}
                                </td>
                                <td className="p-1.5 text-right font-sans space-x-2">
                                  {Number(r.unallocatedFineWeight) > 0 && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => handleAllocateReceipt(r)}
                                        className="text-blue-700 underline cursor-pointer disabled:opacity-50"
                                      >
                                        Apply to Loss
                                      </button>
                                      <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => handleRefundExcess(r)}
                                        className="text-amber-700 underline cursor-pointer disabled:opacity-50"
                                      >
                                        Refund Excess
                                      </button>
                                    </>
                                  )}
                                  {r.allocations
                                    ?.filter((a) => a.status === "ACTIVE")
                                    .slice(0, 1)
                                    .map((a) => (
                                      <button
                                        key={a.id}
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => handleUndoAllocation(a.id)}
                                        className="text-red-700 underline cursor-pointer disabled:opacity-50"
                                      >
                                        Undo Allocation
                                      </button>
                                    ))}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function RecoveryPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-xs text-slate-600">
          Loading karigar recovery workspace...
        </div>
      }
    >
      <RecoveryContent />
    </Suspense>
  );
}
