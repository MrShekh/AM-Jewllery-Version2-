"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { AppShell, AppShellUser } from "@/components/AppShell";
import {
  compressImageFileForUpload,
  safeParseJsonResponse,
} from "@/lib/image-upload";
import { ManufacturingWorksheetPreview } from "@/components/previews/v1/ManufacturingWorksheetPreview";
import { downloadManufacturingWorksheet } from "@/components/previews/v1/manufacturingWorksheetGenerator";
import {
  adaptV2OrderToV1WorksheetPDFData,
  adaptV2OrderToV1WorksheetProps,
} from "@/lib/previews/v2-preview-adapter";
import {
  CANONICAL_PROCESS_SEQUENCE,
  PROCESS_DISPLAY_LABELS,
  ProcessType,
} from "@/lib/domain/types";
import type { JobCardHolderType, JobCardTrackingInfo } from "@/lib/job-card-tracking";
import {
  formatKolkataDateDDMMYYYY,
  formatMonthKeyLabel,
  getTodayBusinessDateString,
} from "@/lib/date-and-export";
import { formatWeight3 } from "@/lib/decimal";
import {
  fetchActorCached,
  fetchCachedJson,
  getCachedActor,
  getCachedJson,
} from "@/lib/client-cache";

interface RegisterProcessItem {
  id: string;
  processType: ProcessType;
  canonicalSequence: number;
  sequenceOrder: number;
  assignedKarigarId: string | null;
  karigar: { id: string; karigarCode: string; name: string } | null;
  status: "PENDING" | "IN_PROGRESS" | "PARTIAL_RETURN" | "CLOSED";
  issuedMetalWeight: string;
  returnedMetalWeight: string;
  extraReturnedMetalWeight: string;
  closedLossWeight: string;
  custodyMetalWeight: string;
  carriedStoneInWeight: string;
  addedStoneWeight: string;
  removedStoneWeight: string;
  carriedStoneOutWeight: string;
  latestGrossInWeight: string;
  latestGrossOutWeight: string;
}

interface RegisterOrderRow {
  monthKey: string;
  order: {
    id: string;
    bagNumber: string;
    customerId: string;
    orderName: string;
    photoUrl: string | null;
    purityId: string;
    touchSnapshot: string;
    targetWeight: string | null;
    targetWeightText?: string | null;
    size: string | null;
    orderDate: string;
    dueDate: string | null;
    notes: string | null;
    adDetailsJson: string | null;
    status: string;
    deliveryStatus?: string;
    billingStatus?: string;
    initialIssuedMetalWeight: string;
    retainedStoneWeight: string;
    finishedGrossWeight: string | null;
    finishedStoneWeight: string | null;
    finishedNetMetalWeight: string | null;
    finishedFineWeight: string | null;
    totalRawLossWeight: string;
    totalFineLossWeight: string;
  };
  customer: {
    id: string;
    customerCode: string;
    name: string;
  };
  purity: {
    id: string;
    code: string;
    displayLabel: string;
    karatLabel: string;
    touchPercent: string;
  };
  adminAvailablePhysicalWeight: string;
  filingIssues: Array<{
    id: string;
    issueNumber: number;
    label: string;
    movementType: string;
    weightGrams: string;
    fineWeightGrams: string;
    businessDate: string;
    karigarId: string | null;
    karigarName: string | null;
    notes: string | null;
    isReversed: boolean;
    createdAt: string;
  }>;
  filingValidIssuedWeight: string;
  processes: RegisterProcessItem[];
  visits: Array<{
    id: string;
    orderProcessId: string;
    visitNumber: number;
    businessDate: string;
    status: string;
    grossInWeight: string;
    nonGoldInWeight: string;
    metalInWeight: string;
    grossOutWeight: string;
    nonGoldOutWeight: string;
    metalOutWeight: string;
    extraMetalReturnedWeight: string;
    extraMetalTouchPercent: string | null;
    extraMetalPurityId: string | null;
    extraMetalFineWeight: string;
    custodyRemainingWeight: string;
    rawLossWeight: string;
    fineLossWeight: string;
    karigar: { id: string; karigarCode: string; name: string } | null;
  }>;
  stoneComponents: Array<{
    id: string;
    orderProcessId: string;
    componentType: string;
    direction: string;
    pieces: number;
    weightGrams: string;
  }>;
  lossRecords: Array<{
    id: string;
    processType: ProcessType;
    rawMetalLossWeight: string;
    fineEquivalentLossWeight: string;
    eligibilityStatus: string;
    karigar: { id: string; karigarCode: string; name: string } | null;
  }>;
  movements: Array<{
    id: string;
    movementType: string;
    fromProcessType: ProcessType | null;
    toProcessType: ProcessType | null;
    grossWeight: string;
    nonGoldWeight: string;
    netMetalWeight: string;
    fineEquivalentWeight: string;
    businessDate: string;
    notes: string | null;
  }>;
}

interface KarigarOption {
  id: string;
  karigarCode: string;
  name: string;
  capabilities: ProcessType[];
}

function fmtCellWeight(val: string | null | undefined, showDashWhenZero = true): string {
  if (!val) return "-";
  const num = Number(val);
  if (!Number.isFinite(num)) return "-";
  if (showDashWhenZero && num === 0) return "-";
  return `${formatWeight3(val)} g`;
}

function ProductionRegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderIdFromUrl = searchParams.get("order");
  const scannedParam = searchParams.get("scanned");

  const [actor, setActor] = useState<AppShellUser | null>(null);
  const cachedInitOrders = getCachedJson<{
    ok?: boolean;
    rows: RegisterOrderRow[];
    availableMonths: string[];
  }>("/api/orders?status=ACTIVE");
  const [rows, setRows] = useState<RegisterOrderRow[]>(
    () => cachedInitOrders?.rows || []
  );
  const [availableMonths, setAvailableMonths] = useState<string[]>(
    () => cachedInitOrders?.availableMonths || []
  );
  const [karigars, setKarigars] = useState<KarigarOption[]>(
    () => getCachedJson<{ karigars: KarigarOption[] }>("/api/karigars")?.karigars || []
  );
  const [purities, setPurities] = useState<
    Array<{ id: string; displayLabel: string; touchPercent: string }>
  >(
    () =>
      getCachedJson<{
        purities: Array<{ id: string; displayLabel: string; touchPercent: string }>;
      }>("/api/purities")?.purities || []
  );
  const [mobileProcessTab, setMobileProcessTab] = useState<ProcessType>("FILING");

  // Register filters
  const [monthKey, setMonthKey] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [purityFilter, setPurityFilter] = useState<string>("ALL");
  const [processFilter, setProcessFilter] = useState<string>("");
  const [activeSheetId, setActiveSheetId] = useState<string>("ACTIVE");
  const [savedSheets, setSavedSheets] = useState<
    Array<{
      id: string;
      sheetNumber: number;
      title: string;
      orderCount: number;
      totalIssuedWeight: string;
      totalLossWeight: string;
      closedAt: string;
    }>
  >([]);
  const [savingSheet, setSavingSheet] = useState<boolean>(false);
  const [selectedPrintOrderIds, setSelectedPrintOrderIds] = useState<string[]>(
    []
  );
  const [printMode, setPrintMode] = useState<"SINGLE" | "BATCH">("SINGLE");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 220);
    return () => clearTimeout(t);
  }, [search]);

  // Column group visibility
  const [showFilingCols, setShowFilingCols] = useState(true);
  const [showFreePolishCols, setShowFreePolishCols] = useState(true);
  const [showSettingCols, setShowSettingCols] = useState(true);
  const [showNoksiCols, setShowNoksiCols] = useState(true);
  const [showFinalPolishCols, setShowFinalPolishCols] = useState(true);
  const [jobCardTracking, setJobCardTracking] = useState<
    Record<string, JobCardTrackingInfo>
  >({});
  const [locationFilter, setLocationFilter] = useState<
    | "ALL"
    | "NOT_PRINTED"
    | "PRINTED"
    | "CAD_DESIGNER"
    | "FILING"
    | "FREE_POLISH"
    | "SETTING"
    | "FINAL_POLISH"
    | "COMPLETED"
    | "DELIVERED"
  >("ALL");
  const [cadDesignerName, setCadDesignerName] = useState("");
  const [savingHolder, setSavingHolder] = useState(false);

  // Selected Order Drawer
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    orderIdFromUrl
  );
  const [drawerTab, setDrawerTab] = useState<
    "PROCESS_ENTRY" | "RECONCILIATION" | "JOB_CARD_QR" | "EDIT_ORDER"
  >("PROCESS_ENTRY");
  const [editOrderName, setEditOrderName] = useState("");
  const [editCustomerId, setEditCustomerId] = useState("");
  const [editPurityId, setEditPurityId] = useState("");
  const [customers, setCustomers] = useState<
    Array<{ id: string; customerCode: string; name: string }>
  >(
    () =>
      getCachedJson<{
        customers: Array<{ id: string; customerCode: string; name: string }>;
      }>("/api/customers")?.customers || []
  );
  const [editTargetWeight, setEditTargetWeight] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [uploadingEditPhoto, setUploadingEditPhoto] = useState(false);
  const [savingOrderEdit, setSavingOrderEdit] = useState(false);

  // Process Entry Form state
  const [activeProcessType, setActiveProcessType] =
    useState<ProcessType>("FILING");
  const [moveTargetStage, setMoveTargetStage] = useState<string>("");
  const [repairWeight, setRepairWeight] = useState("");
  const [repairKarigarId, setRepairKarigarId] = useState("");
  const [repairNotes, setRepairNotes] = useState("");
  const [stageAddGoldWeight, setStageAddGoldWeight] = useState("");
  const [stageAddGoldKarigarId, setStageAddGoldKarigarId] = useState("");
  const [stageAddGoldNotes, setStageAddGoldNotes] = useState("");
  const [showStageAddGoldBox, setShowStageAddGoldBox] = useState(false);
  const [showAdvancedEntry, setShowAdvancedEntry] = useState(false);
  const [weightGainPrompt, setWeightGainPrompt] = useState<{
    gainGrams: string;
    message: string;
  } | null>(null);
  const [selectedKarigarId, setSelectedKarigarId] = useState<string>("");
  const [quickKarigarName, setQuickKarigarName] = useState<string>("");
  const [grossInWeight, setGrossInWeight] = useState<string>("");
  const [grossOutWeight, setGrossOutWeight] = useState<string>("");
  const [extraMetalReturnedWeight, setExtraMetalReturnedWeight] =
    useState<string>("");
  const [showExtraTouchOverride, setShowExtraTouchOverride] =
    useState<boolean>(false);
  const [extraMetalTouchPercent, setExtraMetalTouchPercent] =
    useState<string>("");
  const [showReturnHistory, setShowReturnHistory] = useState<boolean>(false);
  const [adWeight, setAdWeight] = useState<string>("");
  const [adPieces, setAdPieces] = useState<string>("");
  const [klWeight, setKlWeight] = useState<string>("");
  const [klPieces, setKlPieces] = useState<string>("");
  const [closeProcess, setCloseProcess] = useState<boolean>(true);
  const [showPartialReturn, setShowPartialReturn] = useState<boolean>(false);
  const [nextProcessType, setNextProcessType] = useState<string>("");
  const [adjustAgainstKarigarBalance, setAdjustAgainstKarigarBalance] =
    useState<boolean>(false);
  const [isRepairing, setIsRepairing] = useState<boolean>(false);
  const [settleNoksiImmediately, setSettleNoksiImmediately] =
    useState<boolean>(false);
  const [entryStep, setEntryStep] = useState<"GIVE_WORK" | "RECEIVE_WORK">(
    "GIVE_WORK"
  );
  const [custodyRetainedWeight, setCustodyRetainedWeight] =
    useState<string>("");
  const [businessDate, setBusinessDate] = useState<string>(
    getTodayBusinessDateString()
  );
  const [entryNotes, setEntryNotes] = useState<string>("");
  const [cancelReason, setCancelReason] = useState<string>("");

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  // Additional Gold Issue (FILING only) state
  const [showAddFilingGoldForm, setShowAddFilingGoldForm] =
    useState<boolean>(false);
  const [filingEditMode, setFilingEditMode] = useState<
    "ADD" | "RETURN" | "CORRECT"
  >("ADD");
  const [returnUnusedWeight, setReturnUnusedWeight] = useState<string>("");
  const [returnUnusedReason, setReturnUnusedReason] = useState<string>("");
  const [correctFilingWeight, setCorrectFilingWeight] = useState<string>("");
  const [correctFilingReason, setCorrectFilingReason] = useState<string>("");
  const [showFilingIssueHistory, setShowFilingIssueHistory] =
    useState<boolean>(false);
  const [addFilingGoldWeight, setAddFilingGoldWeight] = useState<string>("");
  const [addFilingGoldDate, setAddFilingGoldDate] = useState<string>(
    getTodayBusinessDateString()
  );
  const [addFilingGoldNote, setAddFilingGoldNote] = useState<string>("");
  const [addFilingGoldIdempotencyKey, setAddFilingGoldIdempotencyKey] =
    useState<string>("");

  const loadRegister = useCallback(
    async (force = false) => {
      const qs = new URLSearchParams();
      if (monthKey && monthKey !== "ALL") qs.set("monthKey", monthKey);
      if (debouncedSearch.trim()) qs.set("search", debouncedSearch.trim());
      if (statusFilter && statusFilter !== "ALL") qs.set("status", statusFilter);
      if (purityFilter && purityFilter !== "ALL")
        qs.set("purityId", purityFilter);
      if (processFilter) qs.set("processType", processFilter);
      if (activeSheetId) qs.set("sheetId", activeSheetId);

      const ordersUrl = `/api/orders?${qs.toString()}`;

      const [
        resolvedActor,
        ordData,
        karData,
        purData,
        custData,
        sheetsData,
        trackData,
      ] = await Promise.all([
        fetchActorCached(),
        fetchCachedJson<{
          ok?: boolean;
          rows?: RegisterOrderRow[];
          availableMonths?: string[];
        }>(ordersUrl, { force }),
        fetchCachedJson<{ ok?: boolean; karigars?: KarigarOption[] }>(
          "/api/karigars",
          { ttlMs: 300_000 }
        ),
        fetchCachedJson<{
          ok?: boolean;
          purities?: Array<{
            id: string;
            displayLabel: string;
            touchPercent: string;
          }>;
        }>("/api/purities", { ttlMs: 300_000 }),
        fetchCachedJson<{
          ok?: boolean;
          customers?: Array<{ id: string; customerCode: string; name: string }>;
        }>("/api/customers", { ttlMs: 120_000 }),
        fetchCachedJson<{
          ok?: boolean;
          sheets?: Array<{
            id: string;
            sheetNumber: number;
            title: string;
            orderCount: number;
            totalIssuedWeight: string;
            totalLossWeight: string;
            closedAt: string;
          }>;
        }>("/api/orders/sheets", { force }),
        fetchCachedJson<{
          ok?: boolean;
          tracking?: Record<string, JobCardTrackingInfo>;
        }>("/api/orders/tracking", { force }),
      ]);

      if (!resolvedActor) {
        const target = orderIdFromUrl
          ? `/production-register?order=${encodeURIComponent(orderIdFromUrl)}`
          : "/production-register";
        router.push(`/login?redirect=${encodeURIComponent(target)}`);
        return;
      }
      setActor(resolvedActor);

      if (ordData.ok && ordData.rows) {
        setRows(ordData.rows);
        setAvailableMonths(ordData.availableMonths || []);
      }
      if (karData.ok && karData.karigars) {
        setKarigars(karData.karigars);
        if (karData.karigars.length > 0) {
          setSelectedKarigarId((prev) => prev || karData.karigars![0].id);
        }
      }
      if (purData.ok && purData.purities) {
        setPurities(purData.purities);
      }
      if (custData.ok && custData.customers) {
        setCustomers(custData.customers);
      }
      if (sheetsData.ok && sheetsData.sheets) {
        setSavedSheets(sheetsData.sheets);
      }
      if (trackData?.ok && trackData.tracking) {
        setJobCardTracking(trackData.tracking);
      }
    },
    [
      router,
      orderIdFromUrl,
      monthKey,
      debouncedSearch,
      statusFilter,
      purityFilter,
      processFilter,
      activeSheetId,
    ]
  );

  useEffect(() => {
    loadRegister();
  }, [loadRegister]);

  useEffect(() => {
    if (orderIdFromUrl) {
      setSelectedOrderId(orderIdFromUrl);
      setDrawerTab("PROCESS_ENTRY");
      setMonthKey("ALL");
      setSearch("");
      setStatusFilter("ALL");
      setPurityFilter("ALL");
      setProcessFilter("");
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [orderIdFromUrl, scannedParam]);

  const selectedOrderRow = useMemo(
    () => rows.find((r) => r.order.id === selectedOrderId) || null,
    [rows, selectedOrderId]
  );

  const lastSyncedOrderIdRef = useRef<string | null>(null);

  function resolveDefaultKarigarIdForProcess(processType: ProcessType): string | null {
    const defKar = karigars.find((k) =>
      (k as { defaultForProcesses?: ProcessType[] }).defaultForProcesses?.includes(
        processType
      )
    );
    if (defKar) return defKar.id;

    const nameMatchKeyword =
      processType === "FILING"
        ? "hasan"
        : processType === "FREE_POLISH" || processType === "FINAL_POLISH"
        ? "boro"
        : processType === "SETTING"
        ? "josim"
        : null;
    if (nameMatchKeyword) {
      const byName = karigars.find((k) =>
        k.name.toLowerCase().includes(nameMatchKeyword)
      );
      if (byName) return byName.id;
    }

    const byCap = karigars.find((k) => k.capabilities?.includes(processType));
    return byCap?.id ?? null;
  }

  // Sync default open process & pre-fill weights only when switching to a different order
  useEffect(() => {
    if (!selectedOrderRow) {
      lastSyncedOrderIdRef.current = null;
      return;
    }
    if (lastSyncedOrderIdRef.current === selectedOrderRow.order.id) {
      return;
    }
    lastSyncedOrderIdRef.current = selectedOrderRow.order.id;

    const openProc =
      selectedOrderRow.processes.find((p) => p.status !== "CLOSED") ||
      selectedOrderRow.processes[0];
    if (openProc) {
      setActiveProcessType(openProc.processType);
      const hasIn = Number(openProc.latestGrossInWeight || 0) > 0;
      setEntryStep(hasIn ? "RECEIVE_WORK" : "GIVE_WORK");
      const defKarId = resolveDefaultKarigarIdForProcess(openProc.processType);
      if (openProc.status === "PENDING" && defKarId) {
        setSelectedKarigarId(defKarId);
      } else if (openProc.assignedKarigarId) {
        setSelectedKarigarId(openProc.assignedKarigarId);
      } else if (defKarId) {
        setSelectedKarigarId(defKarId);
      }
      const openIdx = selectedOrderRow.processes.findIndex(
        (p) => p.id === openProc.id
      );
      const prevProc =
        openIdx > 0 ? selectedOrderRow.processes[openIdx - 1] : null;
      const suggestedIn =
        hasIn
          ? openProc.latestGrossInWeight
          : prevProc && Number(prevProc.latestGrossOutWeight || 0) > 0
          ? prevProc.latestGrossOutWeight
          : selectedOrderRow.order.targetWeight || "";
      setGrossInWeight(suggestedIn);
      setGrossOutWeight("");
      setExtraMetalReturnedWeight("");
      setShowExtraTouchOverride(false);
      setExtraMetalTouchPercent("");
      setShowReturnHistory(false);
      setAdWeight("");
      setAdPieces("");
      setKlWeight("");
      setKlPieces("");
      setCustodyRetainedWeight("");
      setCloseProcess(true);
      setShowPartialReturn(false);
      setShowAddFilingGoldForm(false);
      setShowFilingIssueHistory(false);
      setAddFilingGoldWeight("");
      setAddFilingGoldNote("");
    }
  }, [selectedOrderRow]);

  const activeProcessObj = useMemo(() => {
    if (!selectedOrderRow) return null;
    return (
      selectedOrderRow.processes.find(
        (p) => p.processType === activeProcessType
      ) || null
    );
  }, [selectedOrderRow, activeProcessType]);

  function selectOrder(orderId: string | null) {
    setSelectedOrderId(orderId);
    setActionError(null);
    setActionSuccess(null);
    if (orderId) {
      router.replace(`/production-register?order=${encodeURIComponent(orderId)}`, {
        scroll: false,
      });
    } else {
      router.replace("/production-register", { scroll: false });
    }
  }

  function openProcessAction(
    orderRow: RegisterOrderRow,
    processType: ProcessType,
    step: "GIVE_WORK" | "RECEIVE_WORK"
  ) {
    lastSyncedOrderIdRef.current = orderRow.order.id;
    selectOrder(orderRow.order.id);
    setDrawerTab("PROCESS_ENTRY");
    setActiveProcessType(processType);
    setEntryStep(step);
    const procIdx = orderRow.processes.findIndex(
      (p) => p.processType === processType
    );
    const proc = procIdx >= 0 ? orderRow.processes[procIdx] : null;
    const prevProc = procIdx > 0 ? orderRow.processes[procIdx - 1] : null;
    const defKarId = resolveDefaultKarigarIdForProcess(processType);
    if (proc?.status === "PENDING" && defKarId) {
      setSelectedKarigarId(defKarId);
    } else if (proc?.assignedKarigarId) {
      setSelectedKarigarId(proc.assignedKarigarId);
    } else if (defKarId) {
      setSelectedKarigarId(defKarId);
    }
    const suggestedIn =
      proc && Number(proc.latestGrossInWeight || 0) > 0
        ? proc.latestGrossInWeight
        : prevProc && Number(prevProc.latestGrossOutWeight || 0) > 0
        ? prevProc.latestGrossOutWeight
        : orderRow.order.targetWeight || "";
    setGrossInWeight(suggestedIn);
    setGrossOutWeight("");
    setExtraMetalReturnedWeight("");
    setShowExtraTouchOverride(false);
    setExtraMetalTouchPercent("");
    setCloseProcess(true);
    setShowPartialReturn(false);
    setNextProcessType("");
    setAdjustAgainstKarigarBalance(false);
    setIsRepairing(false);
    setSettleNoksiImmediately(false);
  }

  async function handleReopenForRepair(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrderRow || !activeProcessObj || submittingAction) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REOPEN_STAGE_FOR_REPAIR",
            toProcessType: activeProcessObj.processType,
            karigarId: repairKarigarId || selectedKarigarId,
            weightGrams: repairWeight,
            notes: repairNotes || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Failed to send piece for repair");
      } else {
        setActionSuccess(
          `Sent ${data.weightGrams} g to ${PROCESS_DISPLAY_LABELS[activeProcessObj.processType]} (${data.karigarName}) for repair — no Admin Stock deducted.`
        );
        setRepairWeight("");
        setRepairNotes("");
        setIsRepairing(true);
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleAddStageGold(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrderRow || !activeProcessObj || submittingAction) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ADD_STAGE_GOLD",
            processType: activeProcessObj.processType,
            karigarId: stageAddGoldKarigarId || selectedKarigarId,
            additionalWeight: stageAddGoldWeight,
            notes: stageAddGoldNotes || undefined,
            idempotencyKey: `ui_addstg_${selectedOrderRow.order.id}_${activeProcessObj.processType}_${Date.now()}`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Failed to add new piece / admin gold");
      } else {
        setActionSuccess(
          `Added +${data.addedWeight} g from Admin Stock to ${PROCESS_DISPLAY_LABELS[activeProcessObj.processType]} (${data.transactionNumber}).`
        );
        setStageAddGoldWeight("");
        setStageAddGoldNotes("");
        setShowStageAddGoldBox(false);
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleMovePendingStage() {
    if (!selectedOrderRow || !activeProcessObj || !moveTargetStage || submittingAction) {
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "MOVE_PENDING_STAGE",
            fromProcessType: activeProcessObj.processType,
            toProcessType: moveTargetStage,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Failed to move stage");
      } else {
        setActionSuccess(
          `Moved ${data.movedWeight} g from ${PROCESS_DISPLAY_LABELS[activeProcessObj.processType]} to ${PROCESS_DISPLAY_LABELS[moveTargetStage as ProcessType]}`
        );
        setActiveProcessType(moveTargetStage as ProcessType);
        setMoveTargetStage("");
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleGiveWork(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrderRow || !activeProcessObj || submittingAction) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const stoneComponents: Array<{
        componentType: "AD" | "KL";
        direction: "ADDED";
        pieces: number;
        weightGrams: string;
      }> = [];
      if (activeProcessObj.processType === "SETTING") {
        if (Number(adWeight) > 0 || Number(adPieces) > 0) {
          stoneComponents.push({
            componentType: "AD",
            direction: "ADDED",
            pieces: Number(adPieces || 0),
            weightGrams: String(adWeight || "0"),
          });
        }
        if (Number(klWeight) > 0 || Number(klPieces) > 0) {
          stoneComponents.push({
            componentType: "KL",
            direction: "ADDED",
            pieces: Number(klPieces || 0),
            weightGrams: String(klWeight || "0"),
          });
        }
      }

      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "GIVE_WORK",
            processType: activeProcessObj.processType,
            karigarId: selectedKarigarId,
            grossInWeight: grossInWeight || undefined,
            stoneComponents,
            businessDate,
            notes: entryNotes || undefined,
            idempotencyKey: `ui_give_${selectedOrderRow.order.id}_${activeProcessObj.processType}_${Date.now()}`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Failed to give work to karigar");
      } else {
        setActionSuccess(
          `${PROCESS_DISPLAY_LABELS[activeProcessObj.processType]} work given (${data.grossInWeight} g IN) — Status: With Karigar`
        );
        setAdWeight("");
        setAdPieces("");
        setKlWeight("");
        setKlPieces("");
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleReturnUnusedFilingGold() {
    if (!selectedOrderRow || submittingAction) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "RETURN_UNUSED_FILING_GOLD",
            grossWeight: returnUnusedWeight,
            businessDate: addFilingGoldDate,
            reason: returnUnusedReason || "Unused gold returned to Admin",
            idempotencyKey: `ui_ret_unused_${selectedOrderRow.order.id}_${Date.now()}`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Could not return unused gold");
      } else {
        setShowAddFilingGoldForm(false);
        setReturnUnusedWeight("");
        setReturnUnusedReason("");
        setActionSuccess(
          `Returned ${data.returnedWeight} g unused to Admin. Net Filing IN is now ${data.netIssuedWeight} g.`
        );
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleCorrectFilingEntry() {
    if (!selectedOrderRow || submittingAction) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "CORRECT_FILING_ENTRY",
            newNetIssuedWeight: correctFilingWeight,
            businessDate: addFilingGoldDate,
            reason: correctFilingReason,
            idempotencyKey: `ui_corr_filing_${selectedOrderRow.order.id}_${Date.now()}`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Could not correct Filing IN");
      } else {
        setShowAddFilingGoldForm(false);
        setCorrectFilingWeight("");
        setCorrectFilingReason("");
        setActionSuccess(
          `Corrected Filing IN to ${data.netIssuedWeight} g (adjustment ${data.deltaWeight} g).`
        );
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }

  async function handleQuickCreateKarigar() {
    if (!quickKarigarName.trim()) return;
    setActionError(null);
    const res = await fetch("/api/karigars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: quickKarigarName.trim(),
        capabilities: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setQuickKarigarName("");
      const next = [...karigars, data.karigar];
      setKarigars(next);
      setSelectedKarigarId(data.karigar.id);
    } else {
      setActionError(data.error || "Could not create karigar");
    }
  }

  async function handlePostProcessEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrderRow || !activeProcessObj) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);

    try {
      const stoneComponents: Array<{
        componentType: "AD" | "KL";
        direction: "ADDED";
        pieces: number;
        weightGrams: string;
      }> = [];
      // Stones are only added during SETTING; other processes just carry them forward.
      if (activeProcessObj.processType === "SETTING") {
        if (Number(adWeight) > 0 || Number(adPieces) > 0) {
          stoneComponents.push({
            componentType: "AD",
            direction: "ADDED",
            pieces: Number(adPieces || 0),
            weightGrams: String(adWeight || "0"),
          });
        }
        if (Number(klWeight) > 0 || Number(klPieces) > 0) {
          stoneComponents.push({
            componentType: "KL",
            direction: "ADDED",
            pieces: Number(klPieces || 0),
            weightGrams: String(klWeight || "0"),
          });
        }
      }

      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "POST_PROCESS_ENTRY",
            processType: activeProcessObj.processType,
            karigarId: selectedKarigarId,
            grossInWeight,
            grossOutWeight,
            extraMetalReturnedWeight: extraMetalReturnedWeight || undefined,
            extraMetalTouchPercent:
              showExtraTouchOverride && extraMetalTouchPercent
                ? extraMetalTouchPercent
                : undefined,
            stoneComponents,
            closeProcess,
            nextProcessType: closeProcess && nextProcessType ? nextProcessType : undefined,
            adjustAgainstKarigarBalance,
            isRepairing,
            settleNoksiImmediately:
              activeProcessObj.processType === "NOKSI"
                ? settleNoksiImmediately
                : false,
            custodyRetainedMetalWeight: closeProcess
              ? undefined
              : custodyRetainedWeight || undefined,
            businessDate,
            notes: isRepairing
              ? `[REPAIRING] ${entryNotes || ""}`.trim()
              : entryNotes || undefined,
            idempotencyKey: `ui_proc_${selectedOrderRow.order.id}_${
              activeProcessObj.processType
            }_${Date.now()}`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const errText = String(data.error || "Failed to post process entry");
        const gainMatch = errText.match(/\((-\d+\.\d+)g/);
        if (errText.includes("Unexplained") && gainMatch) {
          const absGain = Math.abs(Number(gainMatch[1])).toFixed(3);
          setWeightGainPrompt({
            gainGrams: absGain,
            message: errText,
          });
        } else {
          setActionError(errText);
        }
      } else {
        setWeightGainPrompt(null);
        setActionSuccess(
          `Posted ${
            PROCESS_DISPLAY_LABELS[activeProcessObj.processType]
          }: Loss ${data.rawLossWeight} g (${data.fineLossWeight} g fine)`
        );
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }




  function openAddFilingGoldForm() {
    if (!selectedOrderRow) return;
    setActionError(null);
    setActionSuccess(null);
    setAddFilingGoldWeight("");
    setAddFilingGoldDate(getTodayBusinessDateString());
    setAddFilingGoldNote("");
    setAddFilingGoldIdempotencyKey(
      `ui_add_filing_${selectedOrderRow.order.id}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 7)}`
    );
    setShowAddFilingGoldForm(true);
  }

  async function handleAddFilingGold(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrderRow || submittingAction) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);

    const idemKey =
      addFilingGoldIdempotencyKey ||
      `ui_add_filing_${selectedOrderRow.order.id}_${Date.now()}`;

    try {
      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ADD_FILING_GOLD",
            additionalWeight: addFilingGoldWeight,
            karigarId: selectedKarigarId || undefined,
            businessDate: addFilingGoldDate,
            notes: addFilingGoldNote,
            idempotencyKey: idemKey,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Could not issue additional gold to Filing");
      } else {
        setShowAddFilingGoldForm(false);
        setShowFilingIssueHistory(true);
        setAddFilingGoldWeight("");
        setAddFilingGoldNote("");
        setAddFilingGoldIdempotencyKey("");
        setActionSuccess(
          `Issued +${Number(addFilingGoldWeight).toFixed(
            3
          )} g to Filing. Cumulative Filing IN is now ${
            data.cumulativeFilingIn
          } g.`
        );
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }




  async function handleCompleteOrder() {
    if (!selectedOrderRow) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "COMPLETE_ORDER",
            businessDate,
            idempotencyKey: `ui_comp_${selectedOrderRow.order.id}_${Date.now()}`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Could not complete order");
      } else {
        setActionSuccess(
          `Order Completed! Finished Net Gold: ${data.finishedNetMetalWeight} g (${data.finishedFineWeight} g fine). Process losses are now ELIGIBLE.`
        );
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }




  async function handleDeleteOrder(
    orderId: string,
    bagNumber: string,
    customReason?: string
  ) {
    const confirmed = window.confirm(
      `Delete Bag #${bagNumber} and roll back all issued gold (from Karigar Custody, Process Loss, and Finished Goods) back to Admin Stock?`
    );
    if (!confirmed) return;

    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DELETE_ORDER",
          reason: customReason?.trim() || "Order deleted by Admin",
          idempotencyKey: `ui_del_${orderId}_${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Could not delete order");
      } else {
        setCancelReason("");
        if (selectedOrderId === orderId) {
          selectOrder(null);
        }
        setActionSuccess(
          `Deleted Bag #${bagNumber}. Rolled back ${data.rolledBackPhysicalWeight} g (${data.rolledBackFineWeight} g fine) to Admin Stock.`
        );
        await loadRegister();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not delete order");
    } finally {
      setSubmittingAction(false);
    }
  }




  async function handleCancelOrder() {
    if (!selectedOrderRow || !cancelReason.trim()) return;
    setActionError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(
        `/api/orders/${selectedOrderRow.order.id}/process`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "CANCEL_ORDER",
            reason: cancelReason.trim(),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error || "Could not cancel order");
      } else {
        setCancelReason("");
        setActionSuccess(`Order status updated to ${data.status}`);
        await loadRegister();
      }
    } finally {
      setSubmittingAction(false);
    }
  }




  const getOrderLocation = useCallback(
    (r: RegisterOrderRow) => {
      const tr = jobCardTracking[r.order.id];
      if (
        r.order.status === "DELIVERED" ||
        r.order.deliveryStatus === "DELIVERED" ||
        r.order.billingStatus === "BILLED"
      ) {
        return { type: "DELIVERED" as const, label: "Billed / Delivered" };
      }
      if (r.order.status === "COMPLETED") {
        return { type: "COMPLETED" as const, label: "Completed / Ready" };
      }
      if (r.order.status === "CANCELLED") {
        return { type: "OFFICE" as const, label: "Cancelled" };
      }
      const activeStage = r.processes.find(
        (p) => p.status !== "CLOSED" && Number(p.latestGrossInWeight || 0) > 0
      );
      if (activeStage) {
        return {
          type: activeStage.processType as
            | "FILING"
            | "FREE_POLISH"
            | "SETTING"
            | "FINAL_POLISH",
          label: `${PROCESS_DISPLAY_LABELS[activeStage.processType]}: ${
            activeStage.karigar?.name || "Karigar"
          }`,
        };
      }
      if (tr?.holderType === "CAD_DESIGNER") {
        return {
          type: "CAD_DESIGNER" as const,
          label: `CAD: ${tr.holderName || "Designer"}`,
        };
      }
      const anyClosed = r.processes.some((p) => p.status === "CLOSED");
      return {
        type: "OFFICE" as const,
        label: anyClosed ? "In Office (Between Stages)" : "In Office (New)",
      };
    },
    [jobCardTracking]
  );

  const getEffectivePrintCount = useCallback(
    (r: RegisterOrderRow) => {
      const tracked = jobCardTracking[r.order.id]?.printCount || 0;
      if (tracked > 0) return tracked;
      // Orders already in production (Filing/Polish/Setting/Completed) have already had their job cards printed
      if (r.order.status !== "CREATED" && r.order.status !== "CANCELLED") {
        return 1;
      }
      return 0;
    },
    [jobCardTracking]
  );

  const locationCounts = useMemo(() => {
    const counts = {
      ALL: rows.length,
      NOT_PRINTED: 0,
      PRINTED: 0,
      CAD_DESIGNER: 0,
      FILING: 0,
      FREE_POLISH: 0,
      SETTING: 0,
      FINAL_POLISH: 0,
      COMPLETED: 0,
      DELIVERED: 0,
    };
    for (const r of rows) {
      if (getEffectivePrintCount(r) > 0) counts.PRINTED += 1;
      else counts.NOT_PRINTED += 1;
      const loc = getOrderLocation(r);
      if (loc.type in counts) {
        counts[loc.type as keyof typeof counts] += 1;
      }
    }
    return counts;
  }, [rows, getEffectivePrintCount, getOrderLocation]);

  const displayRows = useMemo(() => {
    if (locationFilter === "ALL") return rows;
    if (locationFilter === "NOT_PRINTED") {
      return rows.filter((r) => getEffectivePrintCount(r) === 0);
    }
    if (locationFilter === "PRINTED") {
      return rows.filter((r) => getEffectivePrintCount(r) > 0);
    }
    return rows.filter((r) => getOrderLocation(r).type === locationFilter);
  }, [rows, locationFilter, getEffectivePrintCount, getOrderLocation]);

  const markOrdersPrinted = useCallback(async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    try {
      const res = await fetch("/api/orders/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MARK_PRINTED", orderIds }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.tracking) {
        setJobCardTracking(data.tracking);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  const handleAssignJobCardHolder = useCallback(
    async (
      orderId: string,
      holderType: JobCardHolderType,
      holderName: string
    ) => {
      setSavingHolder(true);
      try {
        const res = await fetch("/api/orders/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "SET_HOLDER",
            orderId,
            holderType,
            holderName,
          }),
        });
        const data = await res.json();
        if (res.ok && data.ok && data.info) {
          setJobCardTracking((prev) => ({ ...prev, [orderId]: data.info }));
          setCadDesignerName("");
        }
      } finally {
        setSavingHolder(false);
      }
    },
    []
  );

  // Headless Table Columns (@tanstack/react-table)
  const columns = useMemo<ColumnDef<RegisterOrderRow>[]>(() => {
    const findProc = (r: RegisterOrderRow, pt: ProcessType) =>
      r.processes.find((p) => p.processType === pt);

    const cols: ColumnDef<RegisterOrderRow>[] = [
      {
        id: "select_print",
        header: () => {
          const allSelected =
            rows.length > 0 &&
            rows.every((r) => selectedPrintOrderIds.includes(r.order.id));
          return (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedPrintOrderIds(rows.map((r) => r.order.id));
                } else {
                  setSelectedPrintOrderIds([]);
                }
              }}
              title="Select all visible orders for 4-per-A4 printing"
              className="cursor-pointer"
            />
          );
        },
        cell: ({ row }) => {
          const id = row.original.order.id;
          const checked = selectedPrintOrderIds.includes(id);
          return (
            <input
              type="checkbox"
              checked={checked}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                setSelectedPrintOrderIds((prev) =>
                  e.target.checked ? [...prev, id] : prev.filter((x) => x !== id)
                );
              }}
              title="Select for 4-per-A4 batch print"
              className="cursor-pointer"
            />
          );
        },
      },
      {
        id: "bagNumber",
        header: "Bag #",
        cell: ({ row }) => (
          <div className="font-mono font-bold text-blue-800">
            #{row.original.order.bagNumber}
          </div>
        ),
      },
      {
        id: "customer",
        header: "Customer / Order",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-slate-900 truncate max-w-[160px]">
              {row.original.customer.name}
            </div>
            <div className="text-[11px] text-slate-600 truncate max-w-[160px]">
              {row.original.order.orderName} •{" "}
              {formatKolkataDateDDMMYYYY(row.original.order.orderDate)}
            </div>
          </div>
        ),
      },
      {
        id: "purity",
        header: "Touch",
        cell: ({ row }) => (
          <div className="font-mono text-[11px]">
            <div className="font-semibold text-slate-900">
              {row.original.purity.displayLabel}
            </div>
            <div className="text-slate-500">
              {row.original.order.touchSnapshot}%
            </div>
          </div>
        ),
      },
      {
        id: "currentProcess",
        header: "Current Process",
        cell: ({ row }) => {
          const openProc = row.original.processes.find(
            (p) => p.status !== "CLOSED"
          );
          if (!openProc) {
            return (
              <span className="text-[11px] font-medium text-emerald-700">
                All Closed
              </span>
            );
          }
          const hasIn = Number(openProc.latestGrossInWeight || 0) > 0;
          return (
            <div className="text-[11px]">
              <div className="font-semibold text-slate-800">
                {PROCESS_DISPLAY_LABELS[openProc.processType]}
              </div>
              <div className="text-[10px] text-slate-500">
                {hasIn ? "With Karigar" : "Ready to give"}
              </div>
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Location & Print",
        cell: ({ row }) => {
          const loc = getOrderLocation(row.original);
          const pCount = getEffectivePrintCount(row.original);
          const locClass =
            loc.type === "COMPLETED"
              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
              : loc.type === "CAD_DESIGNER"
              ? "bg-purple-50 text-purple-800 border-purple-300"
              : loc.type === "OFFICE"
              ? "bg-slate-100 text-slate-700 border-slate-300"
              : "bg-blue-50 text-blue-800 border-blue-300";
          return (
            <div className="space-y-1">
              <span
                className={`inline-block px-1.5 py-0.5 text-[10px] font-sans font-bold border rounded-xs ${locClass}`}
              >
                {loc.label}
              </span>
              <div>
                <span
                  className={`inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-xs border ${
                    pCount > 0
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-800 border-amber-300"
                  }`}
                >
                  {pCount > 0 ? `Printed ${pCount}×` : "Not Printed"}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: "preview",
        header: "Photo / Preview",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            {row.original.order.photoUrl && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  selectOrder(row.original.order.id);
                  setDrawerTab("JOB_CARD_QR");
                }}
                className="shrink-0 cursor-pointer"
                title="View order photo & job card"
              >
                <img
                  src={row.original.order.photoUrl}
                  alt={row.original.order.orderName}
                  className="w-8 h-8 object-cover rounded-xs border border-slate-300"
                />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectOrder(row.original.order.id);
                setDrawerTab("JOB_CARD_QR");
              }}
              className="px-2 py-0.5 text-[10px] font-semibold border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-xs cursor-pointer"
            >
              Preview
            </button>
          </div>
        ),
      },
    ];

    const renderProcessInButton = (
      orderRow: RegisterOrderRow,
      p: RegisterProcessItem,
      displayWeight: string
    ) => {
      const hasIn = Number(displayWeight || 0) > 0;
      if (hasIn) {
        return <span className="font-mono">{fmtCellWeight(displayWeight)}</span>;
      }
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openProcessAction(orderRow, p.processType, "GIVE_WORK");
          }}
          className="px-1.5 py-0.5 text-[10px] font-sans font-semibold bg-slate-100 hover:bg-blue-50 text-blue-700 border border-slate-300 rounded-xs cursor-pointer"
        >
          + Give
        </button>
      );
    };

    const renderProcessOutButton = (
      orderRow: RegisterOrderRow,
      p: RegisterProcessItem
    ) => {
      const hasOut = Number(p.latestGrossOutWeight || 0) > 0;
      const hasIn = Number(p.latestGrossInWeight || 0) > 0;
      if (hasOut) {
        return (
          <span className="font-mono">
            {fmtCellWeight(p.latestGrossOutWeight)}
          </span>
        );
      }
      if (hasIn && p.status !== "CLOSED") {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openProcessAction(orderRow, p.processType, "RECEIVE_WORK");
            }}
            className="px-1.5 py-0.5 text-[10px] font-sans font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xs cursor-pointer"
            title="Not received yet — click to enter OUT weight"
          >
            — Receive
          </button>
        );
      }
      return <span className="text-slate-400">—</span>;
    };

    if (showFilingCols) {
      cols.push({
        id: "filing_group",
        header: "Filing (Karigar | IN | OUT | Extra Return (g) | Loss)",
        cell: ({ row }) => {
          const p = findProc(row.original, "FILING");
          if (!p) return <span className="text-slate-300">N/A</span>;
          const filingIssues = row.original.filingIssues ?? [];
          const displayWeight =
            Number(row.original.filingValidIssuedWeight || 0) > 0
              ? row.original.filingValidIssuedWeight
              : p.latestGrossInWeight;
          const canAddFilingGold =
            row.original.order.status !== "COMPLETED" &&
            row.original.order.status !== "CANCELLED";
          return (
            <div className="flex items-center justify-end gap-2 text-[11px] tabular-nums">
              <span className="text-slate-600 truncate max-w-[70px]">
                {p.karigar?.name || "—"}
              </span>
              <span className="text-slate-300">|</span>
              <div className="flex items-center gap-1">
                {renderProcessInButton(row.original, p, displayWeight)}
                {filingIssues.length > 1 && (
                  <span className="text-[10px] text-blue-700 font-semibold">
                    ({filingIssues.length})
                  </span>
                )}
                {canAddFilingGold && Number(displayWeight || 0) > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectOrder(row.original.order.id);
                      setDrawerTab("PROCESS_ENTRY");
                      setActiveProcessType("FILING");
                      setAddFilingGoldWeight("");
                      setAddFilingGoldDate(getTodayBusinessDateString());
                      setAddFilingGoldNote("");
                      setAddFilingGoldIdempotencyKey(
                        `ui_add_filing_${row.original.order.id}_${Date.now()}_${Math.random()
                          .toString(36)
                          .slice(2, 7)}`
                      );
                      setShowAddFilingGoldForm(true);
                    }}
                    className="px-1 py-0.5 text-[10px] font-sans font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xs cursor-pointer"
                    title="Edit Filing IN to add gold"
                  >
                    Edit
                  </button>
                )}
              </div>
              <span className="text-slate-300">|</span>
              {renderProcessOutButton(row.original, p)}
              <span className="text-slate-300">|</span>
              <span
                className={`font-mono ${
                  Number(p.extraReturnedMetalWeight || 0) > 0
                    ? "text-emerald-700 font-semibold"
                    : "text-slate-400"
                }`}
                title="Extra Metal Returned to Admin (g)"
              >
                {fmtCellWeight(p.extraReturnedMetalWeight)}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-mono font-semibold text-slate-800">
                {p.status === "CLOSED"
                  ? fmtCellWeight(p.closedLossWeight)
                  : Number(displayWeight || 0) > 0
                  ? "Pending"
                  : "—"}
              </span>
            </div>
          );
        },
      });
    }

    if (showFreePolishCols) {
      cols.push({
        id: "fp_group",
        header: "Free Polish (Karigar | IN | OUT | Extra Return (g) | Loss)",
        cell: ({ row }) => {
          const p = findProc(row.original, "FREE_POLISH");
          if (!p) return <span className="text-slate-300">N/A</span>;
          return (
            <div className="flex items-center justify-end gap-2 text-[11px] tabular-nums">
              <span className="text-slate-600 truncate max-w-[70px]">
                {p.karigar?.name || "—"}
              </span>
              <span className="text-slate-300">|</span>
              {renderProcessInButton(row.original, p, p.latestGrossInWeight)}
              <span className="text-slate-300">|</span>
              {renderProcessOutButton(row.original, p)}
              <span className="text-slate-300">|</span>
              <span
                className={`font-mono ${
                  Number(p.extraReturnedMetalWeight || 0) > 0
                    ? "text-emerald-700 font-semibold"
                    : "text-slate-400"
                }`}
                title="Extra Metal Returned to Admin (g)"
              >
                {fmtCellWeight(p.extraReturnedMetalWeight)}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-mono font-semibold text-slate-800">
                {p.status === "CLOSED"
                  ? fmtCellWeight(p.closedLossWeight)
                  : Number(p.latestGrossInWeight || 0) > 0
                  ? "Pending"
                  : "—"}
              </span>
            </div>
          );
        },
      });
    }

    if (showSettingCols) {
      cols.push({
        id: "setting_group",
        header: "Setting (Karigar | IN | AD | KL | Total IN | OUT | Extra Return (g) | Loss)",
        cell: ({ row }) => {
          const p = findProc(row.original, "SETTING");
          if (!p) return <span className="text-slate-300">N/A</span>;
          const settingStones = (row.original.stoneComponents ?? []).filter(
            (s) => s.orderProcessId === p.id && s.direction === "ADDED"
          );
          const adSum = settingStones
            .filter((s) => s.componentType === "AD")
            .reduce((acc, s) => acc + Number(s.weightGrams || 0), 0);
          const adPiecesSum = settingStones
            .filter((s) => s.componentType === "AD")
            .reduce((acc, s) => acc + (s.pieces || 0), 0);
          const klSum = settingStones
            .filter((s) => s.componentType === "KL")
            .reduce((acc, s) => acc + Number(s.weightGrams || 0), 0);
          const klPiecesSum = settingStones
            .filter((s) => s.componentType === "KL")
            .reduce((acc, s) => acc + (s.pieces || 0), 0);
          const totalIn =
            Number(p.latestGrossInWeight || 0) + Number(p.addedStoneWeight || 0);
          return (
            <div className="flex items-center justify-end gap-1.5 text-[11px] tabular-nums">
              <span className="text-slate-600 truncate max-w-[65px]">
                {p.karigar?.name || "—"}
              </span>
              <span className="text-slate-300">|</span>
              {renderProcessInButton(row.original, p, p.latestGrossInWeight)}
              <span className="text-slate-300">|</span>
              <span className="font-mono text-blue-800">
                {adSum > 0 || adPiecesSum > 0
                  ? `${adSum.toFixed(3)} (${adPiecesSum}p)`
                  : "—"}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-mono text-purple-800">
                {klSum > 0 || klPiecesSum > 0
                  ? `${klSum.toFixed(3)} (${klPiecesSum}p)`
                  : "—"}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-mono font-semibold text-slate-900">
                {totalIn > 0 ? totalIn.toFixed(3) : "—"}
              </span>
              <span className="text-slate-300">|</span>
              {renderProcessOutButton(row.original, p)}
              <span className="text-slate-300">|</span>
              <span
                className={`font-mono ${
                  Number(p.extraReturnedMetalWeight || 0) > 0
                    ? "text-emerald-700 font-semibold"
                    : "text-slate-400"
                }`}
                title="Extra Metal Returned to Admin (g)"
              >
                {fmtCellWeight(p.extraReturnedMetalWeight)}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-mono font-semibold text-slate-800">
                {p.status === "CLOSED"
                  ? fmtCellWeight(p.closedLossWeight)
                  : Number(p.latestGrossInWeight || 0) > 0
                  ? "Pending"
                  : "—"}
              </span>
            </div>
          );
        },
      });
    }

    if (showNoksiCols) {
      cols.push({
        id: "noksi_group",
        header: "Noksi (Shop | IN | OUT | Chol (g) | Loss)",
        cell: ({ row }) => {
          const p = findProc(row.original, "NOKSI");
          if (!p) return <span className="text-slate-300">N/A</span>;
          return (
            <div className="flex items-center justify-end gap-2 text-[11px] tabular-nums">
              <span className="text-slate-600 truncate max-w-[70px]">
                {p.karigar?.name || "—"}
              </span>
              <span className="text-slate-300">|</span>
              {renderProcessInButton(row.original, p, p.latestGrossInWeight)}
              <span className="text-slate-300">|</span>
              {renderProcessOutButton(row.original, p)}
              <span className="text-slate-300">|</span>
              <span
                className={`font-mono ${
                  Number(p.extraReturnedMetalWeight || 0) > 0
                    ? "text-emerald-700 font-semibold"
                    : "text-slate-400"
                }`}
                title="Chol / Extra Metal Returned to Admin (g)"
              >
                {fmtCellWeight(p.extraReturnedMetalWeight)}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-mono font-semibold text-slate-800">
                {p.status === "CLOSED"
                  ? fmtCellWeight(p.closedLossWeight)
                  : "—"}
              </span>
            </div>
          );
        },
      });
    }

    if (showFinalPolishCols) {
      cols.push({
        id: "final_group",
        header: "Final Polish (Karigar | IN | OUT | Extra Return (g) | Loss)",
        cell: ({ row }) => {
          const p = findProc(row.original, "FINAL_POLISH");
          if (!p) return <span className="text-slate-300">N/A</span>;
          return (
            <div className="flex items-center justify-end gap-2 text-[11px] tabular-nums">
              <span className="text-slate-600 truncate max-w-[70px]">
                {p.karigar?.name || "—"}
              </span>
              <span className="text-slate-300">|</span>
              {renderProcessInButton(row.original, p, p.latestGrossInWeight)}
              <span className="text-slate-300">|</span>
              {renderProcessOutButton(row.original, p)}
              <span className="text-slate-300">|</span>
              <span
                className={`font-mono ${
                  Number(p.extraReturnedMetalWeight || 0) > 0
                    ? "text-emerald-700 font-semibold"
                    : "text-slate-400"
                }`}
                title="Extra Metal Returned to Admin (g)"
              >
                {fmtCellWeight(p.extraReturnedMetalWeight)}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-mono font-semibold text-slate-800">
                {p.status === "CLOSED"
                  ? fmtCellWeight(p.closedLossWeight)
                  : Number(p.latestGrossInWeight || 0) > 0
                  ? "Pending"
                  : "—"}
              </span>
            </div>
          );
        },
      });
    }

    cols.push(
      {
        id: "finished_net",
        header: "FINISH WT (NET / GROSS)",
        cell: ({ row }) => {
          const o = row.original.order;
          if (!o.finishedNetMetalWeight) {
            return <div className="text-right font-mono text-slate-400">-</div>;
          }
          return (
            <div className="text-right font-mono tabular-nums">
              <div className="font-bold text-emerald-800">
                {o.finishedNetMetalWeight} g net
              </div>
              <div className="text-[10px] text-slate-500">
                {o.finishedGrossWeight} g gross ({o.finishedStoneWeight} g stn)
              </div>
            </div>
          );
        },
      },
      {
        id: "total_loss",
        header: "TOTAL LOSS (RAW / FINE)",
        cell: ({ row }) => {
          const o = row.original.order;
          const raw = Number(o.totalRawLossWeight);
          if (raw === 0 && o.status === "CREATED") {
            return <div className="text-right font-mono text-slate-400">-</div>;
          }
          return (
            <div className="text-right font-mono tabular-nums">
              <div className="font-bold text-slate-900">
                {o.totalRawLossWeight} g
              </div>
              <div className="text-[10px] text-blue-800">
                {o.totalFineLossWeight} g fine
              </div>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "ACTION",
        cell: ({ row }) => {
          const o = row.original.order;
          if (actor?.role !== "OWNER_ADMIN" || o.status === "CANCELLED") {
            return <div className="text-right text-[10px] text-slate-400">-</div>;
          }
          return (
            <div className="text-right">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteOrder(o.id, o.bagNumber);
                }}
                className="px-2 py-0.5 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-xs cursor-pointer"
                title="Delete order and roll back all gold to Admin Stock"
              >
                Delete
              </button>
            </div>
          );
        },
      }
    );

    return cols;
  }, [
    showFilingCols,
    showFreePolishCols,
    showSettingCols,
    showNoksiCols,
    showFinalPolishCols,
    actor?.role,
    rows,
    selectedPrintOrderIds,
    jobCardTracking,
    getOrderLocation,
    getEffectivePrintCount,
  ]);

  const table = useReactTable({
    data: displayRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (!actor) {
    return (
      <div className="p-6 text-xs text-slate-600">
        Loading production register...
      </div>
    );
  }

  // Live Pre-Post calculation inside the Drawer (matches backend baseNonGold logic)
  const liveStoneIn = activeProcessObj
    ? Number(activeProcessObj.carriedStoneInWeight || 0)
    : 0;
  const savedAddedStone = activeProcessObj
    ? Number(activeProcessObj.addedStoneWeight || 0)
    : 0;
  const savedRemovedStone = activeProcessObj
    ? Number(activeProcessObj.removedStoneWeight || 0)
    : 0;
  const baseNonGold =
    savedAddedStone > 0 || savedRemovedStone > 0
      ? Number(activeProcessObj?.carriedStoneOutWeight ?? liveStoneIn)
      : liveStoneIn;
  const liveStoneOut = Math.max(
    0,
    baseNonGold + Number(adWeight || 0) + Number(klWeight || 0)
  );
  const liveMetalIn = Math.max(0, Number((Number(grossInWeight || 0) - liveStoneIn).toFixed(6)));
  const liveMetalOut = Math.max(0, Number((Number(grossOutWeight || 0) - liveStoneOut).toFixed(6)));
  const liveExtraMetal = Math.max(0, Number(extraMetalReturnedWeight || 0));
  const liveTouch = selectedOrderRow
    ? Number(selectedOrderRow.order.touchSnapshot || 0)
    : 0;
  const liveExtraTouch =
    showExtraTouchOverride && Number(extraMetalTouchPercent || 0) > 0
      ? Number(extraMetalTouchPercent)
      : liveTouch;
  const liveExtraFine = Number(((liveExtraMetal * liveExtraTouch) / 100).toFixed(6));
  const liveCustodyRetained = closeProcess
    ? 0
    : Number(custodyRetainedWeight || 0);
  const liveFineLoss = Number(
    (liveExtraTouch === liveTouch
      ? ((liveMetalIn - liveMetalOut - liveExtraMetal - liveCustodyRetained) *
          liveTouch) /
        100
      : ((liveMetalIn - liveMetalOut - liveCustodyRetained) * liveTouch) / 100 -
        liveExtraFine
    ).toFixed(6)
  );
  const liveRawLoss = Number(
    (liveExtraTouch === liveTouch
      ? liveMetalIn - liveMetalOut - liveExtraMetal - liveCustodyRetained
      : liveTouch > 0
      ? liveFineLoss / (liveTouch / 100)
      : 0
    ).toFixed(6)
  );

  const allSelectedProcessesClosed =
    selectedOrderRow &&
    selectedOrderRow.processes.length > 0 &&
    selectedOrderRow.processes.some((p) => p.status === "CLOSED") &&
    selectedOrderRow.processes.every(
      (p) =>
        p.status === "CLOSED" ||
        (p.status === "PENDING" &&
          Number(p.custodyMetalWeight || 0) === 0 &&
          Number(p.latestGrossInWeight || 0) === 0)
    );

  return (
    <AppShell actor={actor}>
      {/* Dedicated Print-Only Container: prints either 2x2 Batch (4 per A4) OR Single Job Card */}
      {printMode === "BATCH" && selectedPrintOrderIds.length > 0 ? (
        <div className="print-only-worksheet">
          {(() => {
            const selectedRows = rows.filter((r) =>
              selectedPrintOrderIds.includes(r.order.id)
            );
            const pages: RegisterOrderRow[][] = [];
            for (let i = 0; i < selectedRows.length; i += 4) {
              pages.push(selectedRows.slice(i, i + 4));
            }
            return pages.map((pageRows, pageIdx) => (
              <div key={`print_page_${pageIdx}`} className="print-batch-page">
                {pageRows.map((r) => (
                  <ManufacturingWorksheetPreview
                    key={`batch_card_${r.order.id}`}
                    {...adaptV2OrderToV1WorksheetProps({
                      bagNumber: r.order.bagNumber,
                      customerName: r.customer.name,
                      orderName: r.order.orderName,
                      orderDate: r.order.orderDate,
                      dueDate: r.order.dueDate,
                      purityDisplayLabel: r.purity.displayLabel,
                      targetWeightGrams:
                        r.order.targetWeightText ||
                        r.order.targetWeight ||
                        r.order.initialIssuedMetalWeight,
                      size: r.order.size,
                      photoUrl: r.order.photoUrl,
                      selectedProcesses: r.processes.map((p) => p.processType),
                      adDetailsJson: r.order.adDetailsJson,
                    })}
                    qrCodeOrderId={r.order.id}
                    qrCodeBagNumber={r.order.bagNumber}
                    settingSummary={(() => {
                      const sp = (r.processes ?? []).find((p) => p.processType === "SETTING");
                      const stones = (r.stoneComponents ?? []).filter(
                        (s) => s.direction === "ADDED" && (!sp || s.orderProcessId === sp.id)
                      );
                      const adStones = stones.filter((s) => s.componentType === "AD");
                      const klStones = stones.filter((s) => s.componentType === "KL");
                      return {
                        inWeight: sp?.latestGrossInWeight,
                        outWeight: sp?.latestGrossOutWeight,
                        extraWeight: sp?.extraReturnedMetalWeight,
                        lossWeight: sp?.closedLossWeight,
                        adWeight: String(adStones.reduce((a, s) => a + Number(s.weightGrams || 0), 0)),
                        adPieces: adStones.reduce((a, s) => a + (s.pieces || 0), 0),
                        klWeight: String(klStones.reduce((a, s) => a + Number(s.weightGrams || 0), 0)),
                        klPieces: klStones.reduce((a, s) => a + (s.pieces || 0), 0),
                      };
                    })()}
                  />
                ))}
              </div>
            ));
          })()}
        </div>
      ) : (
        selectedOrderRow && (
          <div className="print-only-worksheet">
            <ManufacturingWorksheetPreview
              {...adaptV2OrderToV1WorksheetProps({
                bagNumber: selectedOrderRow.order.bagNumber,
                customerName: selectedOrderRow.customer.name,
                orderName: selectedOrderRow.order.orderName,
                orderDate: selectedOrderRow.order.orderDate,
                dueDate: selectedOrderRow.order.dueDate,
                purityDisplayLabel: selectedOrderRow.purity.displayLabel,
                targetWeightGrams:
                  selectedOrderRow.order.targetWeightText ||
                  selectedOrderRow.order.targetWeight ||
                  selectedOrderRow.order.initialIssuedMetalWeight,
                size: selectedOrderRow.order.size,
                photoUrl: selectedOrderRow.order.photoUrl,
                selectedProcesses: selectedOrderRow.processes.map(
                  (p) => p.processType
                ),
                adDetailsJson: selectedOrderRow.order.adDetailsJson,
              })}
              qrCodeOrderId={selectedOrderRow.order.id}
              qrCodeBagNumber={selectedOrderRow.order.bagNumber}
              settingSummary={(() => {
                const sp = (selectedOrderRow.processes ?? []).find((p) => p.processType === "SETTING");
                const stones = (selectedOrderRow.stoneComponents ?? []).filter(
                  (s) => s.direction === "ADDED" && (!sp || s.orderProcessId === sp.id)
                );
                const adStones = stones.filter((s) => s.componentType === "AD");
                const klStones = stones.filter((s) => s.componentType === "KL");
                return {
                  inWeight: sp?.latestGrossInWeight,
                  outWeight: sp?.latestGrossOutWeight,
                  extraWeight: sp?.extraReturnedMetalWeight,
                  lossWeight: sp?.closedLossWeight,
                  adWeight: String(adStones.reduce((a, s) => a + Number(s.weightGrams || 0), 0)),
                  adPieces: adStones.reduce((a, s) => a + (s.pieces || 0), 0),
                  klWeight: String(klStones.reduce((a, s) => a + Number(s.weightGrams || 0), 0)),
                  klPieces: klStones.reduce((a, s) => a + (s.pieces || 0), 0),
                };
              })()}
            />
          </div>
        )
      )}

      <div className="space-y-3 hide-on-print">
        {!selectedOrderRow && actionError && (
          <div className="p-2.5 bg-red-50 border border-red-300 text-red-800 text-xs font-medium rounded-xs">
            {actionError}
          </div>
        )}
        {!selectedOrderRow && actionSuccess && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-medium rounded-xs">
            {actionSuccess}
          </div>
        )}
        {/* Top Toolbar */}
        <div className="bg-white border border-slate-200 rounded-xs p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-base font-extrabold text-slate-900">
                Production Register
              </h1>
              <span className="px-2 py-0.5 bg-slate-900 text-white text-xs font-bold font-mono rounded-xs">
                Total Orders: {rows.length}
              </span>
              <span className="text-xs font-medium text-slate-600 font-mono">
                {new Date().toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <Link
                href="/orders/new"
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xs"
              >
                + New Order
              </Link>
              {selectedPrintOrderIds.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintMode("BATCH");
                      void markOrdersPrinted(selectedPrintOrderIds);
                      setTimeout(() => window.print(), 250);
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                  >
                    Print 4-per-A4 ({selectedPrintOrderIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPrintOrderIds([])}
                    className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xs cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const cleanQ = search
                      .trim()
                      .toLowerCase()
                      .replace(/^bag\s*#?/i, "")
                      .replace(/^#/, "");
                    const exact = rows.find(
                      (r) => r.order.bagNumber.toLowerCase() === cleanQ
                    );
                    if (exact) {
                      selectOrder(exact.order.id);
                    }
                  }
                }}
                placeholder="Search bag #, customer, order, karigar..."
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs w-64"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded-xs bg-white"
              >
                <option value="ACTIVE">Active Orders</option>
                <option value="ALL">All Orders (Incl. Billed)</option>
                <option value="CREATED">Not Started</option>
                <option value="IN_PROCESS">With Karigar / In Process</option>
                <option value="COMPLETED">Completed (Ready to Bill)</option>
                <option value="DELIVERED">Billed / Delivered</option>
              </select>
              <select
                value={purityFilter}
                onChange={(e) => setPurityFilter(e.target.value)}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded-xs bg-white"
              >
                <option value="ALL">All Purities</option>
                {purities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayLabel}
                  </option>
                ))}
              </select>
              <select
                value={processFilter}
                onChange={(e) => setProcessFilter(e.target.value)}
                className="px-2 py-1.5 text-xs border border-slate-300 rounded-xs bg-white"
              >
                <option value="">All Processes</option>
                {CANONICAL_PROCESS_SEQUENCE.map((p) => (
                  <option key={p} value={p}>
                    {PROCESS_DISPLAY_LABELS[p]}
                  </option>
                ))}
              </select>
              <a
                href={(() => {
                  const csvQs = new URLSearchParams();
                  csvQs.set("format", "csv_register");
                  if (monthKey && monthKey !== "ALL") csvQs.set("monthKey", monthKey);
                  if (debouncedSearch.trim()) csvQs.set("search", debouncedSearch.trim());
                  if (statusFilter && statusFilter !== "ALL") csvQs.set("status", statusFilter);
                  if (purityFilter && purityFilter !== "ALL") csvQs.set("purityId", purityFilter);
                  if (processFilter) csvQs.set("processType", processFilter);
                  if (activeSheetId) csvQs.set("sheetId", activeSheetId);
                  const stages: string[] = [];
                  if (showFilingCols) stages.push("FILING");
                  if (showFreePolishCols) stages.push("FREE_POLISH");
                  if (showSettingCols) stages.push("SETTING");
                  if (showNoksiCols) stages.push("NOKSI");
                  if (showFinalPolishCols) stages.push("FINAL_POLISH");
                  csvQs.set("stages", stages.join(","));
                  return `/api/reconciliation?${csvQs.toString()}`;
                })()}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xs"
              >
                Export Safe CSV
              </a>
              {activeSheetId === "ACTIVE" && (
                <button
                  type="button"
                  disabled={savingSheet}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "Complete & Save Sheet? All COMPLETED orders in the active sheet will be saved into a new sheet folder, and in-process orders will stay on your active sheet."
                      )
                    ) {
                      return;
                    }
                    setActionError(null);
                    setActionSuccess(null);
                    setSavingSheet(true);
                    try {
                      const res = await fetch("/api/orders/sheets", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({}),
                      });
                      const data = await res.json();
                      if (!res.ok || !data.ok) {
                        setActionError(data.error || "Failed to save sheet");
                      } else {
                        setActionSuccess(
                          `Saved ${data.sheet.title} (${data.sheet.orderCount} completed orders). Active sheet is ready for new work!`
                        );
                        await loadRegister(true);
                      }
                    } finally {
                      setSavingSheet(false);
                    }
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-xs cursor-pointer disabled:opacity-60"
                >
                  {savingSheet ? "Saving Sheet..." : "Complete & Save Sheet"}
                </button>
              )}
            </div>
          </div>

          {/* Quick Job Card Print & Karigar/Designer Location Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
            {(
              [
                ["ALL", `All (${locationCounts.ALL})`],
                ["NOT_PRINTED", `Not Printed (${locationCounts.NOT_PRINTED})`],
                ["PRINTED", `Printed (${locationCounts.PRINTED})`],
                ["CAD_DESIGNER", `CAD Designer (${locationCounts.CAD_DESIGNER})`],
                ["FILING", `Filing (${locationCounts.FILING})`],
                ["FREE_POLISH", `Free Polish (${locationCounts.FREE_POLISH})`],
                ["SETTING", `Setting (${locationCounts.SETTING})`],
                ["FINAL_POLISH", `Final Polish (${locationCounts.FINAL_POLISH})`],
                ["COMPLETED", `Completed (${locationCounts.COMPLETED})`],
                ["DELIVERED", `Billed / Delivered (${locationCounts.DELIVERED})`],
              ] as const
            ).map(([fKey, fLabel]) => (
              <button
                key={fKey}
                type="button"
                onClick={() => {
                  setLocationFilter(fKey);
                  if (fKey === "DELIVERED" && statusFilter === "ACTIVE") {
                    setStatusFilter("ALL");
                  }
                }}
                className={`px-2.5 py-1 rounded-xs font-bold border cursor-pointer ${
                  locationFilter === fKey
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {fLabel}
              </button>
            ))}
          </div>

          {/* Excel-like Saved Sheet Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
            <span className="font-semibold text-[11px] text-slate-500 uppercase mr-1">
              Register Sheets:
            </span>
            <button
              type="button"
              onClick={() => setActiveSheetId("ACTIVE")}
              className={`px-2.5 py-1 rounded-xs font-semibold cursor-pointer ${
                activeSheetId === "ACTIVE"
                  ? "bg-blue-700 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Active Sheet
            </button>
            {savedSheets.map((sh) => (
              <button
                key={sh.id}
                type="button"
                onClick={() => setActiveSheetId(sh.id)}
                className={`px-2.5 py-1 rounded-xs font-semibold cursor-pointer ${
                  activeSheetId === sh.id
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100"
                }`}
                title={`${sh.orderCount} orders • Issued ${sh.totalIssuedWeight}g • Loss ${sh.totalLossWeight}g`}
              >
                {sh.title} ({sh.orderCount})
              </button>
            ))}
            {savedSheets.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveSheetId("ALL")}
                className={`px-2.5 py-1 rounded-xs font-semibold cursor-pointer ${
                  activeSheetId === "ALL"
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All Orders
              </button>
            )}
            <div className="ml-auto flex items-center gap-3 font-mono text-[11px]">
              <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-xs font-semibold">
                Total AD Pcs:{" "}
                {rows.reduce(
                  (sum, r) =>
                    sum +
                    (r.stoneComponents ?? [])
                      .filter(
                        (s) => s.direction === "ADDED" && s.componentType === "AD"
                      )
                      .reduce((a, s) => a + (s.pieces || 0), 0),
                  0
                )}
              </span>
              <span className="px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200 rounded-xs font-semibold">
                Total KL Pcs:{" "}
                {rows.reduce(
                  (sum, r) =>
                    sum +
                    (r.stoneComponents ?? [])
                      .filter(
                        (s) => s.direction === "ADDED" && s.componentType === "KL"
                      )
                      .reduce((a, s) => a + (s.pieces || 0), 0),
                  0
                )}
              </span>
            </div>
          </div>

          {/* Column Visibility Toggles */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-slate-700">
              <span className="font-semibold text-[11px] text-slate-500 uppercase">
                Stage Columns:
              </span>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFilingCols}
                  onChange={(e) => setShowFilingCols(e.target.checked)}
                />
                <span>1. Filing</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFreePolishCols}
                  onChange={(e) => setShowFreePolishCols(e.target.checked)}
                />
                <span>2. Free Polish</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSettingCols}
                  onChange={(e) => setShowSettingCols(e.target.checked)}
                />
                <span>3. Setting (+AD/KL)</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showNoksiCols}
                  onChange={(e) => setShowNoksiCols(e.target.checked)}
                />
                <span>4. Noksi</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showFinalPolishCols}
                  onChange={(e) => setShowFinalPolishCols(e.target.checked)}
                />
                <span>5. Final Polish</span>
              </label>
            </div>
            <div className="text-[11px] text-slate-500">
              Click any order row (or scan its Job Card QR) to open the Process Entry & Reconciliation workspace.
            </div>
          </div>
        </div>

        {/* Selected Order Process & Reconciliation Workspace (Placed at top when open for immediate QR scan entry) */}
        {selectedOrderRow && (
          <div className="bg-white border-2 border-blue-700 rounded-xs p-4 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                {selectedOrderRow.order.photoUrl && (
                  <img
                    src={selectedOrderRow.order.photoUrl}
                    alt={selectedOrderRow.order.orderName}
                    className="w-12 h-12 object-cover rounded-xs border border-slate-300 shrink-0"
                  />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-700 text-white font-mono font-bold text-xs rounded-xs">
                      Bag #{selectedOrderRow.order.bagNumber}
                    </span>
                    <h2 className="text-sm font-bold text-slate-900">
                      {selectedOrderRow.order.orderName} •{" "}
                      {selectedOrderRow.customer.name}
                    </h2>
                    <span className="text-xs font-mono text-slate-600">
                      ({selectedOrderRow.purity.displayLabel} @{" "}
                      {selectedOrderRow.order.touchSnapshot}% touch)
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Selected Sequence:{" "}
                    <span className="font-semibold text-slate-800">
                      {selectedOrderRow.processes
                        .map((p) => `${PROCESS_DISPLAY_LABELS[p.processType]} [${p.status}]`)
                        .join(" → ")}
                    </span>
                  </p>
                  {(() => {
                    const supplied = Number(selectedOrderRow.order.initialIssuedMetalWeight || 0);
                    const totalLoss = selectedOrderRow.processes.reduce(
                      (s, p) => s + Number(p.closedLossWeight || 0),
                      0
                    );
                    const totalExtra = selectedOrderRow.processes.reduce(
                      (s, p) => s + Number(p.extraReturnedMetalWeight || 0),
                      0
                    );
                    const totalCustody = selectedOrderRow.processes.reduce(
                      (s, p) => s + Number(p.custodyMetalWeight || 0),
                      0
                    );
                    const isDone =
                      selectedOrderRow.order.status === "COMPLETED" ||
                      selectedOrderRow.order.status === "DELIVERED";
                    const finishedNet = Number(
                      selectedOrderRow.order.finishedNetMetalWeight || 0
                    );
                    const diff = isDone
                      ? supplied - (finishedNet + totalExtra + totalLoss)
                      : 0;
                    const balanced = isDone && Math.abs(diff) <= 0.005;
                    return (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                          Supplied: {supplied.toFixed(3)} g
                        </span>
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                          Net Loss: {totalLoss.toFixed(3)} g
                        </span>
                        {totalExtra > 0 && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Extra Ret: {totalExtra.toFixed(3)} g
                          </span>
                        )}
                        {totalCustody > 0 && (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                            In Karigar Custody: {totalCustody.toFixed(3)} g
                          </span>
                        )}
                        {isDone && (
                          <span
                            className={`px-2 py-0.5 rounded font-bold border ${
                              balanced
                                ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                : "bg-amber-100 text-amber-900 border-amber-300"
                            }`}
                          >
                            {balanced
                              ? "✓ Bag Balanced"
                              : `⚠ Diff: ${diff.toFixed(3)} g — review entries`}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDrawerTab("PROCESS_ENTRY")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xs cursor-pointer ${
                    drawerTab === "PROCESS_ENTRY"
                      ? "bg-blue-700 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  1. Process Entry & Completion
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("RECONCILIATION")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xs cursor-pointer ${
                    drawerTab === "RECONCILIATION"
                      ? "bg-blue-700 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  2. Weight Reconciliation & Ledger
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("JOB_CARD_QR")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xs cursor-pointer ${
                    drawerTab === "JOB_CARD_QR"
                      ? "bg-blue-700 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  3. Job Card &amp; QR Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditOrderName(selectedOrderRow.order.orderName || "");
                    setEditCustomerId(selectedOrderRow.customer.id || "");
                    setEditPurityId(selectedOrderRow.purity.id || "");
                    setEditTargetWeight(
                      selectedOrderRow.order.targetWeightText ??
                        selectedOrderRow.order.targetWeight ??
                        ""
                    );
                    setEditSize(selectedOrderRow.order.size || "");
                    setEditDueDate(
                      selectedOrderRow.order.dueDate
                        ? selectedOrderRow.order.dueDate.slice(0, 10)
                        : ""
                    );
                    setEditNotes(selectedOrderRow.order.notes || "");
                    setEditPhotoUrl(selectedOrderRow.order.photoUrl || "");
                    setDrawerTab("EDIT_ORDER");
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xs cursor-pointer ${
                    drawerTab === "EDIT_ORDER"
                      ? "bg-blue-700 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  4. Edit Details
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintMode("SINGLE");
                    void markOrdersPrinted([selectedOrderRow.order.id]);
                    setTimeout(() => window.print(), 80);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xs cursor-pointer"
                >
                  Print Job Card ({getEffectivePrintCount(selectedOrderRow)}×)
                </button>
                {actor.role === "OWNER_ADMIN" &&
                  selectedOrderRow.order.status !== "CANCELLED" && (
                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={() =>
                        handleDeleteOrder(
                          selectedOrderRow.order.id,
                          selectedOrderRow.order.bagNumber
                        )
                      }
                      className="px-3 py-1.5 text-xs font-semibold bg-red-700 hover:bg-red-800 text-white rounded-xs cursor-pointer"
                    >
                      Delete & Rollback Gold
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => selectOrder(null)}
                  className="ml-2 px-2.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-300 rounded-xs hover:bg-slate-100 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Job Card Location & CAD Designer Tracker Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xs px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-700">Job Card Location:</span>
                <span className="px-2 py-0.5 rounded-xs font-bold bg-blue-100 text-blue-900">
                  {getOrderLocation(selectedOrderRow).label}
                </span>
                <span className="px-2 py-0.5 rounded-xs font-mono font-semibold bg-white border border-slate-300 text-slate-700">
                  Printed: {getEffectivePrintCount(selectedOrderRow)}×
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="text"
                  placeholder="CAD Designer name..."
                  value={cadDesignerName}
                  onChange={(e) => setCadDesignerName(e.target.value)}
                  className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs w-40"
                />
                <button
                  type="button"
                  disabled={savingHolder}
                  onClick={() =>
                    void handleAssignJobCardHolder(
                      selectedOrderRow.order.id,
                      "CAD_DESIGNER",
                      cadDesignerName.trim() || "CAD Designer"
                    )
                  }
                  className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                >
                  Send to CAD Designer
                </button>
                <button
                  type="button"
                  disabled={savingHolder}
                  onClick={() =>
                    void handleAssignJobCardHolder(
                      selectedOrderRow.order.id,
                      "OFFICE",
                      "Office"
                    )
                  }
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xs cursor-pointer"
                >
                  Back to Office
                </button>
              </div>
            </div>

            {actionError && (
              <div className="p-2.5 bg-red-50 border border-red-300 text-red-800 text-xs font-medium rounded-xs">
                {actionError}
              </div>
            )}
            {actionSuccess && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-medium rounded-xs">
                {actionSuccess}
              </div>
            )}

            {drawerTab === "PROCESS_ENTRY" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left: Stacked Process Cards */}
                <div className="lg:col-span-5 space-y-2">
                  <div className="text-xs font-bold text-slate-700 uppercase">
                    Selected Order Processes (Click to Inspect/Enter)
                  </div>
                  {selectedOrderRow.processes.map((proc, idx) => {
                    const isCurrent = proc.processType === activeProcessType;
                    return (
                      <div
                        key={proc.id}
                        onClick={() => {
                          if (proc.processType !== activeProcessType) {
                            setAdWeight("");
                            setAdPieces("");
                            setKlWeight("");
                            setKlPieces("");
                            setGrossOutWeight("");
                          }
                          setActiveProcessType(proc.processType);
                          const defKarId = resolveDefaultKarigarIdForProcess(
                            proc.processType
                          );
                          if (proc.status === "PENDING" && defKarId) {
                            setSelectedKarigarId(defKarId);
                          } else if (proc.assignedKarigarId) {
                            setSelectedKarigarId(proc.assignedKarigarId);
                          } else if (defKarId) {
                            setSelectedKarigarId(defKarId);
                          }
                          if (Number(proc.latestGrossInWeight) > 0) {
                            setGrossInWeight(proc.latestGrossInWeight);
                          }
                        }}
                        className={`p-3 border rounded-xs cursor-pointer transition-colors ${
                          isCurrent
                            ? "border-blue-700 bg-blue-50/50"
                            : "border-slate-200 bg-slate-50 hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">
                            Stage {idx + 1}:{" "}
                            {PROCESS_DISPLAY_LABELS[proc.processType]}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold border rounded-xs ${
                              proc.status === "CLOSED"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : proc.status === "PENDING"
                                ? "bg-white text-slate-600 border-slate-300"
                                : "bg-blue-50 text-blue-800 border-blue-300"
                            }`}
                          >
                            {proc.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 mt-2 text-[11px] font-mono tabular-nums">
                          <div>
                            <div className="text-slate-500">Gross In</div>
                            <div className="font-semibold">
                              {proc.latestGrossInWeight} g
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">Stones Out</div>
                            <div className="font-semibold text-blue-800">
                              {proc.carriedStoneOutWeight} g
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">Gross Out</div>
                            <div className="font-semibold">
                              {proc.latestGrossOutWeight} g
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">Gold Loss</div>
                            <div className="font-bold text-slate-900">
                              {proc.closedLossWeight} g
                            </div>
                          </div>
                        </div>
                        {proc.karigar && (
                          <div className="mt-1.5 text-[11px] text-slate-600">
                            Karigar: <span className="font-semibold">{proc.karigar.name}</span> ({proc.karigar.karigarCode})
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Complete Order Card when all selected processes are CLOSED */}
                  {allSelectedProcessesClosed &&
                    selectedOrderRow.order.status !== "COMPLETED" && (
                      <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xs space-y-2">
                        <div className="text-xs font-bold text-emerald-900">
                          All Selected Processes Are Closed & Reconciled!
                        </div>
                        <p className="text-[11px] text-emerald-800">
                          Completing this order moves the final net gold to Finished Goods and transitions its process loss records ({selectedOrderRow.order.totalRawLossWeight} g raw / {selectedOrderRow.order.totalFineLossWeight} g fine) from PENDING_ORDER_COMPLETION to ELIGIBLE.
                        </p>
                        <button
                          type="button"
                          disabled={submittingAction}
                          onClick={handleCompleteOrder}
                          className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                        >
                          Complete Order & Move to Finished Goods
                        </button>
                      </div>
                    )}
                  {(selectedOrderRow.order.status === "DELIVERED" ||
                    selectedOrderRow.order.deliveryStatus === "DELIVERED" ||
                    selectedOrderRow.order.billingStatus === "BILLED") && (
                    <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xs flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-emerald-900">
                        Billed &amp; Delivered
                      </span>
                      <a
                        href={`/billing?customerId=${selectedOrderRow.order.customerId}`}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xs"
                      >
                        View Bills
                      </a>
                    </div>
                  )}
                  {selectedOrderRow.order.status === "COMPLETED" &&
                    selectedOrderRow.order.deliveryStatus !== "DELIVERED" &&
                    selectedOrderRow.order.billingStatus !== "BILLED" && (
                    <div className="p-3 bg-blue-50 border border-blue-300 rounded-xs flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-blue-900">
                        Order Completed — Ready for Billing &amp; Delivery
                      </span>
                      <a
                        href={`/billing?customerId=${selectedOrderRow.order.customerId}&orderIds=${selectedOrderRow.order.id}`}
                        className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs"
                      >
                        Create Bill
                      </a>
                    </div>
                  )}
                </div>

                {/* Right: Explicit Process Entry Form */}
                <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xs p-4">
                  {activeProcessObj && activeProcessObj.status !== "CLOSED" ? (
                    <form
                      onSubmit={
                        entryStep === "GIVE_WORK"
                          ? handleGiveWork
                          : handlePostProcessEntry
                      }
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold text-slate-900 uppercase">
                            {PROCESS_DISPLAY_LABELS[activeProcessObj.processType]}
                          </h3>
                          <div className="inline-flex rounded-xs border border-slate-300 overflow-hidden text-[11px]">
                            <button
                              type="button"
                              onClick={() => setEntryStep("GIVE_WORK")}
                              className={`px-2.5 py-0.5 font-semibold cursor-pointer ${
                                entryStep === "GIVE_WORK"
                                  ? "bg-blue-700 text-white"
                                  : "bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              Give Work (IN)
                            </button>
                            <button
                              type="button"
                              onClick={() => setEntryStep("RECEIVE_WORK")}
                              className={`px-2.5 py-0.5 font-semibold cursor-pointer ${
                                entryStep === "RECEIVE_WORK"
                                  ? "bg-emerald-700 text-white"
                                  : "bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              Receive Work (OUT)
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowStageAddGoldBox((v) => !v)}
                              className="px-2.5 py-0.5 font-semibold cursor-pointer bg-amber-50 text-amber-900 hover:bg-amber-100 border-l border-slate-300"
                            >
                              + New Piece / Gold
                            </button>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono text-slate-600">
                          {Number(activeProcessObj.latestGrossInWeight || 0) > 0
                            ? "Status: With Karigar"
                            : `Carried Stone In: ${activeProcessObj.carriedStoneInWeight} g`}
                        </span>
                      </div>

                      {showStageAddGoldBox && (
                        <div className="p-3 bg-amber-50 border border-amber-300 rounded-xs space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-amber-950">
                              + Add New Piece / Admin Gold to {PROCESS_DISPLAY_LABELS[activeProcessObj.processType]}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowStageAddGoldBox(false)}
                              className="text-amber-800 hover:underline text-[11px] cursor-pointer"
                            >
                              Close
                            </button>
                          </div>
                          <p className="text-[11px] text-amber-900">
                            Deducts Admin Stock once and adds to Bag Total Supplied.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={stageAddGoldWeight}
                              onChange={(e) => setStageAddGoldWeight(e.target.value)}
                              placeholder="Weight (g) e.g. 0.781"
                              className="px-2 py-1 bg-white border border-amber-300 rounded-xs font-mono"
                            />
                            <select
                              value={stageAddGoldKarigarId || selectedKarigarId}
                              onChange={(e) => setStageAddGoldKarigarId(e.target.value)}
                              className="px-2 py-1 bg-white border border-amber-300 rounded-xs"
                            >
                              <option value="">-- Select Karigar --</option>
                              {karigars.map((k) => (
                                <option key={k.id} value={k.id}>
                                  {k.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={submittingAction || !stageAddGoldWeight}
                              onClick={(e) => void handleAddStageGold(e)}
                              className="px-3 py-1 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-semibold rounded-xs cursor-pointer"
                            >
                              {submittingAction ? "Adding..." : "Deduct & Add Gold"}
                            </button>
                          </div>
                        </div>
                      )}

                      {Number(activeProcessObj.custodyMetalWeight || 0) > 0 &&
                        Number(activeProcessObj.returnedMetalWeight || 0) === 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xs px-2.5 py-1.5 text-[11px]">
                            <span className="text-amber-900 font-medium">
                              Wrong stage? Move{" "}
                              <strong className="font-mono">
                                {Number(activeProcessObj.custodyMetalWeight).toFixed(3)} g
                              </strong>{" "}
                              to:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={moveTargetStage}
                                onChange={(e) => setMoveTargetStage(e.target.value)}
                                className="px-2 py-1 text-[11px] bg-white border border-amber-300 rounded-xs"
                              >
                                <option value="">-- Select Stage --</option>
                                {selectedOrderRow.processes
                                  .filter(
                                    (p) =>
                                      p.processType !== activeProcessObj.processType &&
                                      p.status !== "CLOSED" &&
                                      Number(p.custodyMetalWeight || 0) === 0 &&
                                      Number(p.issuedMetalWeight || 0) === 0
                                  )
                                  .map((p) => (
                                    <option key={p.id} value={p.processType}>
                                      {PROCESS_DISPLAY_LABELS[p.processType]}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                disabled={!moveTargetStage || submittingAction}
                                onClick={() => void handleMovePendingStage()}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-xs cursor-pointer"
                              >
                                Move Stage →
                              </button>
                            </div>
                          </div>
                        )}

                      {/* Karigar Selector + Quick Create */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-12">
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-semibold text-slate-700">
                              {activeProcessObj.processType === "SETTING"
                                ? "Setting Karigar *"
                                : "Assign Karigar *"}
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowAdvancedEntry((v) => !v)}
                              className="text-[11px] font-semibold text-slate-600 hover:text-blue-700 underline cursor-pointer"
                            >
                              {showAdvancedEntry ? "Hide More Options ▲" : "More Options (Date / Quick-Add / Partial) ▾"}
                            </button>
                          </div>
                          <select
                            required
                            value={selectedKarigarId}
                            onChange={(e) =>
                              setSelectedKarigarId(e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                          >
                            <option value="">-- Select Karigar --</option>
                            {karigars.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.name} ({k.karigarCode})
                              </option>
                            ))}
                          </select>
                        </div>
                        {showAdvancedEntry && actor.role === "OWNER_ADMIN" && (
                          <>
                            <div className="sm:col-span-8">
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Or Quick-Add New Karigar
                              </label>
                              <input
                                type="text"
                                value={quickKarigarName}
                                onChange={(e) =>
                                  setQuickKarigarName(e.target.value)
                                }
                                placeholder="Karigar Name"
                                className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                              />
                            </div>
                            <div className="sm:col-span-4">
                              <button
                                type="button"
                                onClick={handleQuickCreateKarigar}
                                className="w-full py-1.5 px-2 bg-slate-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                              >
                                + Add Karigar
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <label className="block text-xs font-semibold text-slate-700">
                              {activeProcessObj.processType === "FILING"
                                ? "Filing IN (g) *"
                                : activeProcessObj.processType === "SETTING"
                                ? "Setting IN (g) *"
                                : "Gross IN Weight (g) *"}
                            </label>
                            {activeProcessObj.processType === "FILING" && (
                              <div className="flex items-center gap-1.5">
                                {(selectedOrderRow.filingIssues ?? []).length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowFilingIssueHistory((v) => !v)
                                    }
                                    className="text-[10px] font-mono font-semibold text-blue-700 hover:underline cursor-pointer"
                                  >
                                    {showFilingIssueHistory
                                      ? "Hide History"
                                      : `History (${(selectedOrderRow.filingIssues ?? []).length})`}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            required
                            value={grossInWeight}
                            onChange={(e) => setGrossInWeight(e.target.value)}
                            placeholder="20.000"
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs font-mono tabular-nums"
                          />
                        </div>
                        {entryStep === "RECEIVE_WORK" ? (
                          <>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                {activeProcessObj.processType === "SETTING"
                                  ? "Setting OUT (g) *"
                                  : `${PROCESS_DISPLAY_LABELS[activeProcessObj.processType]} OUT (g) *`}
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                required
                                value={grossOutWeight}
                                onChange={(e) => setGrossOutWeight(e.target.value)}
                                placeholder="19.600"
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs font-mono tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Extra Metal Returned (g)
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                value={extraMetalReturnedWeight}
                                onChange={(e) =>
                                  setExtraMetalReturnedWeight(e.target.value)
                                }
                                placeholder="0.000"
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs font-mono tabular-nums"
                              />
                              {showAdvancedEntry && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setShowExtraTouchOverride((prev) => !prev)
                                    }
                                    className="mt-1 text-[10px] text-blue-700 underline cursor-pointer"
                                  >
                                    {showExtraTouchOverride
                                      ? "Use order touch"
                                      : "Different touch? (Advanced)"}
                                  </button>
                                  {showExtraTouchOverride && (
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0.01"
                                      max="100"
                                      value={extraMetalTouchPercent}
                                      onChange={(e) =>
                                        setExtraMetalTouchPercent(e.target.value)
                                      }
                                      placeholder={`Touch % (${liveTouch}%)`}
                                      className="mt-1 w-full px-2 py-1 text-[11px] bg-white border border-blue-300 rounded-xs font-mono tabular-nums"
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          </>
                        ) : (
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              OUT Weight (entered later)
                            </label>
                            <div className="w-full px-2.5 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded-xs text-slate-500 font-mono">
                              — (Not received)
                            </div>
                          </div>
                        )}
                        {showAdvancedEntry && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Business Date *
                            </label>
                            <input
                              type="date"
                              required
                              value={businessDate}
                              onChange={(e) => setBusinessDate(e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                            />
                          </div>
                        )}
                      </div>

                      {/* Clear Given / Added Gold / Repairing Breakdown for active stage */}
                      {(() => {
                        const stageMovs = (selectedOrderRow.movements ?? []).filter(
                          (m) =>
                            m.toProcessType === activeProcessObj.processType &&
                            (m.movementType === "ADMIN_ISSUE_TO_ORDER" ||
                              m.movementType === "ADDITIONAL_ADMIN_ISSUE" ||
                              m.movementType === "PROCESS_TRANSFER")
                        );
                        const stageClosedVisits = (selectedOrderRow.visits ?? []).filter(
                          (v) =>
                            v.orderProcessId === activeProcessObj.id &&
                            v.status === "CLOSED"
                        );
                        if (stageMovs.length <= 1 && stageClosedVisits.length === 0) {
                          return null;
                        }
                        return (
                          <div className="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xs text-[11px] space-y-1.5">
                            <div className="font-bold text-blue-950 uppercase tracking-wide text-[10px]">
                              {PROCESS_DISPLAY_LABELS[activeProcessObj.processType]} — Given &amp; Repairing Breakdown
                            </div>
                            {stageMovs.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {stageMovs.map((m, idx) => {
                                  const label =
                                    m.movementType === "ADMIN_ISSUE_TO_ORDER"
                                      ? "1st Given (Admin)"
                                      : m.movementType === "ADDITIONAL_ADMIN_ISSUE"
                                      ? "+ Added Gold (Admin)"
                                      : m.fromProcessType
                                      ? `From ${PROCESS_DISPLAY_LABELS[m.fromProcessType]}`
                                      : "Repairing IN";
                                  return (
                                    <span
                                      key={m.id}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs border font-mono ${
                                        m.movementType === "ADDITIONAL_ADMIN_ISSUE"
                                          ? "bg-amber-50 border-amber-300 text-amber-900 font-semibold"
                                          : m.movementType === "PROCESS_TRANSFER" && !m.fromProcessType
                                          ? "bg-purple-50 border-purple-300 text-purple-900 font-semibold"
                                          : "bg-white border-blue-200 text-slate-800"
                                      }`}
                                    >
                                      <span>{idx > 0 ? `+ ` : ""}{label}:</span>
                                      <strong>{formatWeight3(m.grossWeight)}g</strong>
                                    </span>
                                  );
                                })}
                                {Number(activeProcessObj.latestGrossInWeight || 0) > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-xs bg-blue-700 text-white font-mono font-bold">
                                    Current IN: {formatWeight3(activeProcessObj.latestGrossInWeight)}g
                                  </span>
                                )}
                              </div>
                            )}
                            {stageClosedVisits.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-600 font-mono">
                                {stageClosedVisits.map((v, idx) => (
                                  <span
                                    key={v.id}
                                    className="px-1.5 py-0.5 bg-white border border-slate-200 rounded-xs"
                                  >
                                    Visit {idx + 1} (Closed): IN {formatWeight3(v.grossInWeight)}g → OUT {formatWeight3(v.grossOutWeight)}g • Loss {formatWeight3(v.rawLossWeight)}g
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* FILING ONLY: Edit Filing IN (Add / Return Unused / Correct) */}
                      {activeProcessObj.processType === "FILING" &&
                        showAddFilingGoldForm && (
                          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xs space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => setFilingEditMode("ADD")}
                                  className={`px-2 py-1 text-[11px] font-semibold rounded-xs cursor-pointer ${
                                    filingEditMode === "ADD"
                                      ? "bg-amber-700 text-white"
                                      : "bg-white border border-amber-300 text-amber-900"
                                  }`}
                                >
                                  Add More Gold
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFilingEditMode("RETURN")}
                                  className={`px-2 py-1 text-[11px] font-semibold rounded-xs cursor-pointer ${
                                    filingEditMode === "RETURN"
                                      ? "bg-emerald-700 text-white"
                                      : "bg-white border border-amber-300 text-amber-900"
                                  }`}
                                >
                                  Return Unused Gold
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFilingEditMode("CORRECT")}
                                  className={`px-2 py-1 text-[11px] font-semibold rounded-xs cursor-pointer ${
                                    filingEditMode === "CORRECT"
                                      ? "bg-blue-700 text-white"
                                      : "bg-white border border-amber-300 text-amber-900"
                                  }`}
                                >
                                  Correct a Mistake
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowAddFilingGoldForm(false)}
                                className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>

                            {filingEditMode === "RETURN" ? (
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                    Return Unused (g) *
                                  </label>
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    value={returnUnusedWeight}
                                    onChange={(e) =>
                                      setReturnUnusedWeight(e.target.value)
                                    }
                                    placeholder="2.000"
                                    className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs font-mono tabular-nums"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                    Reason / Note
                                  </label>
                                  <input
                                    type="text"
                                    value={returnUnusedReason}
                                    onChange={(e) =>
                                      setReturnUnusedReason(e.target.value)
                                    }
                                    placeholder="Unused gold returned to Admin"
                                    className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs"
                                  />
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    disabled={submittingAction}
                                    onClick={() => void handleReturnUnusedFilingGold()}
                                    className="w-full py-1.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                                  >
                                    {submittingAction ? "Saving..." : "Return to Admin"}
                                  </button>
                                </div>
                              </div>
                            ) : filingEditMode === "CORRECT" ? (
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                    Corrected Net IN (g) *
                                  </label>
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0.001"
                                    value={correctFilingWeight}
                                    onChange={(e) =>
                                      setCorrectFilingWeight(e.target.value)
                                    }
                                    placeholder={Number(
                                      selectedOrderRow.filingValidIssuedWeight || 0
                                    ).toFixed(3)}
                                    className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs font-mono tabular-nums"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                    Correction Reason *
                                  </label>
                                  <input
                                    type="text"
                                    value={correctFilingReason}
                                    onChange={(e) =>
                                      setCorrectFilingReason(e.target.value)
                                    }
                                    placeholder="Typing mistake correction..."
                                    className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs"
                                  />
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    disabled={submittingAction}
                                    onClick={() => void handleCorrectFilingEntry()}
                                    className="w-full py-1.5 px-3 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                                  >
                                    {submittingAction ? "Saving..." : "Post Correction"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums bg-white p-2 border border-amber-200 rounded-xs">
                              <div>
                                <div className="text-[10px] font-sans text-slate-500">
                                  Current Filing IN
                                </div>
                                <div className="font-bold text-slate-900">
                                  {Number(
                                    selectedOrderRow.filingValidIssuedWeight || 0
                                  ).toFixed(3)}{" "}
                                  g
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-sans text-slate-500">
                                  Available admin stock at this touch ({selectedOrderRow.order.touchSnapshot}%)
                                </div>
                                <div className="font-bold text-blue-800">
                                  {selectedOrderRow.adminAvailablePhysicalWeight} g
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-sans text-slate-500">
                                  Additional gold
                                </div>
                                <div className="font-bold text-amber-900">
                                  +
                                  {Number(addFilingGoldWeight || 0).toFixed(3)}{" "}
                                  g
                                </div>
                              </div>
                              <div>
                                <div className="text-[10px] font-sans text-slate-500">
                                  New Filing IN (Admin deduction now: {Number(addFilingGoldWeight || 0).toFixed(3)} g)
                                </div>
                                <div className="font-bold text-emerald-800">
                                  {(
                                    Number(
                                      selectedOrderRow.filingValidIssuedWeight ||
                                        0
                                    ) + Number(addFilingGoldWeight || 0)
                                  ).toFixed(3)}{" "}
                                  g
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Additional gold (g) *
                                </label>
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0.001"
                                  value={addFilingGoldWeight}
                                  onChange={(e) =>
                                    setAddFilingGoldWeight(e.target.value)
                                  }
                                  placeholder="5.000"
                                  className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs font-mono tabular-nums"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Issue Date *
                                </label>
                                <input
                                  type="date"
                                  value={addFilingGoldDate}
                                  onChange={(e) =>
                                    setAddFilingGoldDate(e.target.value)
                                  }
                                  className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Optional Note
                                </label>
                                <input
                                  type="text"
                                  value={addFilingGoldNote}
                                  onChange={(e) =>
                                    setAddFilingGoldNote(e.target.value)
                                  }
                                  placeholder="Extra solder / wire..."
                                  className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs"
                                />
                              </div>
                              <div>
                                <button
                                  type="button"
                                  disabled={submittingAction}
                                  onClick={(e) => handleAddFilingGold(e)}
                                  className="w-full py-1.5 px-3 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                                >
                                  {submittingAction
                                    ? "Saving..."
                                    : "Save Additional Gold"}
                                </button>
                              </div>
                            </div>
                              </>
                            )}
                          </div>
                        )}

                      {activeProcessObj.processType === "FILING" &&
                        showFilingIssueHistory &&
                        (selectedOrderRow.filingIssues ?? []).length > 0 && (
                          <div className="p-2.5 bg-white border border-slate-300 rounded-xs space-y-1.5 text-xs">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                              <span className="font-bold text-slate-800">
                                Previous issues
                              </span>
                              <span className="font-mono font-bold text-blue-900">
                                Net Filing IN:{" "}
                                {Number(activeProcessObj.issuedMetalWeight || 0).toFixed(3)} g
                              </span>
                            </div>
                            <div className="space-y-1">
                              {(selectedOrderRow.filingIssues ?? []).map((iss) => (
                                <div
                                  key={iss.id}
                                  className={`flex items-center justify-between text-[11px] font-mono ${
                                    iss.isReversed
                                      ? "line-through text-slate-400"
                                      : "text-slate-800"
                                  }`}
                                >
                                  <span>
                                    {iss.issueNumber}. {iss.label}:{" "}
                                    <strong>{iss.weightGrams} g</strong>
                                    {iss.karigarName
                                      ? ` • ${iss.karigarName}`
                                      : ""}
                                    {iss.notes ? ` (${iss.notes})` : ""}
                                  </span>
                                  <span className="text-slate-500">
                                    {formatKolkataDateDDMMYYYY(iss.businessDate)}
                                    {iss.isReversed ? " [REVERSED]" : ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Setting AD & KL Stone Component Inputs */}
                      {activeProcessObj.processType === "SETTING" && (
                        <div className="p-3 bg-white border border-blue-200 rounded-xs space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-blue-900">
                              Setting Stones (AD / KL) — Does NOT deduct gold from stock
                            </span>
                            <span className="text-xs font-mono font-bold text-slate-900">
                              Total IN including stones:{" "}
                              {(
                                Number(grossInWeight || 0) +
                                Number(adWeight || 0) +
                                Number(klWeight || 0) +
                                Number(activeProcessObj.addedStoneWeight || 0)
                              ).toFixed(3)}{" "}
                              g
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                AD weight added (g)
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                value={adWeight}
                                onChange={(e) => setAdWeight(e.target.value)}
                                placeholder="0.500"
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded-xs font-mono tabular-nums"
                              />
                              {Number(adWeight || 0) > 0 && (
                                <div className="text-[10px] font-mono font-bold text-amber-800 mt-0.5">
                                  {Math.round(Number(adWeight) * 1000)} mg
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                AD pieces
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={adPieces}
                                onChange={(e) => setAdPieces(e.target.value)}
                                placeholder="10"
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded-xs font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                KL weight added (g)
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                value={klWeight}
                                onChange={(e) => setKlWeight(e.target.value)}
                                placeholder="1.000"
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded-xs font-mono tabular-nums"
                              />
                              {Number(klWeight || 0) > 0 && (
                                <div className="text-[10px] font-mono font-bold text-amber-800 mt-0.5">
                                  {Math.round(Number(klWeight) * 1000)} mg
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                KL pieces
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={klPieces}
                                onChange={(e) => setKlPieces(e.target.value)}
                                placeholder="4"
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded-xs font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Optional Partial Return (only in More Options) */}
                      {entryStep === "RECEIVE_WORK" && showAdvancedEntry && (
                        <div className="space-y-2 pt-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const next = !showPartialReturn;
                                setShowPartialReturn(next);
                                setCloseProcess(!next);
                              }}
                              className="text-xs font-semibold text-slate-700 underline hover:text-blue-700 cursor-pointer"
                            >
                              {showPartialReturn
                                ? "Back to full return & close"
                                : "Partial return"}
                            </button>
                            {!showPartialReturn && (
                              <span className="text-[11px] text-emerald-800 font-medium">
                                Confirms full return & closes{" "}
                                {PROCESS_DISPLAY_LABELS[activeProcessObj.processType]}
                              </span>
                            )}
                          </div>
                          {showPartialReturn && !closeProcess && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-700">
                                Retained in Karigar Custody (g):
                              </span>
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                value={custodyRetainedWeight}
                                onChange={(e) =>
                                  setCustodyRetainedWeight(e.target.value)
                                }
                                placeholder="12.000"
                                className="w-28 px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs font-mono"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Noksi outsource info + Any-to-any routing + Repairing & Lock-Fitting adjustment */}
                      {entryStep === "RECEIVE_WORK" && (
                        <div className="space-y-2 pt-1">
                          {activeProcessObj.processType === "NOKSI" && (
                            <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-xs text-[11px] text-indigo-900 space-y-1.5">
                              <div>
                                <strong>Noksi (Outsource):</strong> Enter any remaining chol returned with the order in{" "}
                                <strong>Extra Metal Returned</strong>.
                              </div>
                              {closeProcess && (
                                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={settleNoksiImmediately}
                                    onChange={(e) =>
                                      setSettleNoksiImmediately(e.target.checked)
                                    }
                                  />
                                  <span>
                                    Settle Noksi making/loss immediately (leave unchecked if settling later in Recovery)
                                  </span>
                                </label>
                              )}
                            </div>
                          )}

                          {closeProcess && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                                  Send Next To (Any-to-Any Process)
                                </label>
                                <select
                                  value={nextProcessType}
                                  onChange={(e) => setNextProcessType(e.target.value)}
                                  className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded-xs"
                                >
                                  <option value="">Auto (Next Selected Process)</option>
                                  <option value="FILING">Filing (or Lock Fitting / Repairing)</option>
                                  <option value="FREE_POLISH">Free Polish (or Repairing)</option>
                                  <option value="SETTING">Setting (or Repairing)</option>
                                  <option value="NOKSI">Noksi (Outsource / Repairing)</option>
                                  <option value="FINAL_POLISH">Final Polish (or Repairing)</option>
                                  <option value="COMPLETE">Ready to Complete Order</option>
                                </select>
                              </div>
                              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer pt-4">
                                <input
                                  type="checkbox"
                                  checked={isRepairing}
                                  onChange={(e) => setIsRepairing(e.target.checked)}
                                />
                                <span>Mark as Repairing</span>
                              </label>
                            </div>
                          )}

                          {Number(activeProcessObj.carriedStoneInWeight || 0) > 0 && (
                            <div className="p-2 bg-amber-50 border border-amber-200 rounded-xs text-[11px] text-amber-900">
                              Already carrying{" "}
                              <strong className="font-mono">
                                {Number(activeProcessObj.carriedStoneInWeight).toFixed(3)} g
                              </strong>{" "}
                              stone/KL in this piece. Enter <strong>ONLY newly added</strong> stone below (leave blank if no new stone was added).
                            </div>
                          )}

                          {liveRawLoss < -0.0001 && (
                            <label className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-300 rounded-xs text-[11px] text-amber-950 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={adjustAgainstKarigarBalance}
                                onChange={(e) =>
                                  setAdjustAgainstKarigarBalance(e.target.checked)
                                }
                                className="mt-0.5"
                              />
                              <span>
                                <strong>Lock-Fitting / Weight Increase (+{formatWeight3(Math.abs(liveRawLoss))} g):</strong>{" "}
                                Adjust against karigar&apos;s outstanding{" "}
                                {PROCESS_DISPLAY_LABELS[activeProcessObj.processType]} loss balance (adds into jewellery without increasing Admin Stock).
                              </span>
                            </label>
                          )}
                        </div>
                      )}

                      {/* Pre-Post Calculation Summary Box */}
                      <div className="p-2.5 bg-white border border-slate-300 rounded-xs space-y-2 text-xs font-mono tabular-nums">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <div className="text-[10px] text-slate-500">
                              Net Metal IN
                            </div>
                            <div className="font-bold">
                              {formatWeight3(liveMetalIn)} g
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500">
                              Stone / Non-Gold OUT
                            </div>
                            <div className="font-bold text-blue-800">
                              {formatWeight3(liveStoneOut)} g
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500">
                              Net Metal OUT
                            </div>
                            <div className="font-bold">
                              {entryStep === "GIVE_WORK"
                                ? "—"
                                : `${formatWeight3(liveMetalOut)} g`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500">
                              {entryStep === "GIVE_WORK"
                                ? "Loss Status"
                                : "Process Gold Loss"}
                            </div>
                            <div
                              className={`font-bold ${
                                entryStep === "RECEIVE_WORK" && liveRawLoss < 0
                                  ? "text-red-700"
                                  : "text-slate-900"
                              }`}
                            >
                              {entryStep === "GIVE_WORK"
                                ? "Pending"
                                : `${formatWeight3(liveRawLoss)} g (${formatWeight3(liveFineLoss)} g fine)`}
                            </div>
                          </div>
                        </div>
                        {entryStep === "RECEIVE_WORK" && (
                          <div className="pt-1.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] font-sans text-slate-700">
                            <span>
                              Jewellery returned:{" "}
                              <strong className="font-mono">
                                {formatWeight3(liveMetalOut)}g
                              </strong>
                            </span>
                            <span>
                              Gold back to admin:{" "}
                              <strong className="font-mono text-emerald-800">
                                {formatWeight3(liveExtraMetal)}g at {liveExtraTouch}%
                              </strong>
                            </span>
                            <span>
                              Process loss:{" "}
                              <strong
                                className={`font-mono ${
                                  liveRawLoss < 0 ? "text-red-700" : "text-slate-900"
                                }`}
                              >
                                {formatWeight3(liveRawLoss)}g
                              </strong>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setShowReturnHistory((prev) => !prev)
                              }
                              className="text-blue-700 underline font-semibold cursor-pointer"
                            >
                              {showReturnHistory ? "Hide History" : "View History"}
                            </button>
                          </div>
                        )}
                        {entryStep === "RECEIVE_WORK" && showReturnHistory && (
                          <div className="pt-1.5 border-t border-slate-200 space-y-1 text-[11px] font-sans">
                            {(selectedOrderRow.visits || []).filter(
                              (v) => v.orderProcessId === activeProcessObj.id
                            ).length === 0 ? (
                              <div className="text-slate-500">
                                No returns recorded yet for{" "}
                                {PROCESS_DISPLAY_LABELS[activeProcessObj.processType]}.
                              </div>
                            ) : (
                              (selectedOrderRow.visits || [])
                                .filter(
                                  (v) => v.orderProcessId === activeProcessObj.id
                                )
                                .map((v) => (
                                  <div
                                    key={v.id}
                                    className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-2 py-1 rounded-xs border border-slate-200"
                                  >
                                    <span>
                                      #{v.visitNumber} •{" "}
                                      {formatKolkataDateDDMMYYYY(v.businessDate)} •{" "}
                                      {v.karigar?.name || "—"} ({v.status})
                                    </span>
                                    <span className="font-mono">
                                      IN {v.metalInWeight}g | OUT {v.metalOutWeight}g |
                                      Extra {v.extraMetalReturnedWeight}g | Loss{" "}
                                      {v.rawLossWeight}g
                                    </span>
                                  </div>
                                ))
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={entryNotes}
                          onChange={(e) => setEntryNotes(e.target.value)}
                          placeholder="Optional entry note..."
                          className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                        />
                        <button
                          type="submit"
                          disabled={submittingAction}
                          className={`px-4 py-1.5 text-white text-xs font-semibold rounded-xs cursor-pointer ${
                            entryStep === "GIVE_WORK"
                              ? "bg-blue-700 hover:bg-blue-800"
                              : "bg-emerald-700 hover:bg-emerald-800"
                          }`}
                        >
                          {submittingAction
                            ? "Saving..."
                            : entryStep === "GIVE_WORK"
                            ? "Save & Give Work"
                            : closeProcess
                            ? "Confirm Return"
                            : "Save Partial Return"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="p-4 text-xs text-slate-700 space-y-4">
                      <div>
                        <div className="font-bold text-slate-900">
                          {activeProcessObj
                            ? `${PROCESS_DISPLAY_LABELS[activeProcessObj.processType]} is CLOSED.`
                            : "Select a process stage on the left."}
                        </div>
                        <p className="mt-1">
                          Select the next open process stage on the left, or click{" "}
                          <span className="font-semibold">
                            Complete Order & Move to Finished Goods
                          </span>{" "}
                          once all selected stages are closed.
                        </p>
                      </div>

                      {activeProcessObj &&
                        selectedOrderRow.order.status !== "COMPLETED" &&
                        selectedOrderRow.order.status !== "DELIVERED" &&
                        selectedOrderRow.order.status !== "CANCELLED" && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                            <form
                              onSubmit={handleReopenForRepair}
                              className="p-3 bg-white border border-blue-200 rounded-xs space-y-2"
                            >
                              <div className="font-bold text-blue-900">
                                🔧 Send Existing Piece for Repair
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Reopens {PROCESS_DISPLAY_LABELS[activeProcessObj.processType]} without deducting Admin Stock (e.g. 1 ring 3.455 g sent back for repair).
                              </p>
                              <input
                                type="number"
                                step="0.001"
                                min="0.001"
                                required
                                value={repairWeight}
                                onChange={(e) => setRepairWeight(e.target.value)}
                                placeholder="Piece weight (g) e.g. 3.455"
                                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs font-mono"
                              />
                              <select
                                required
                                value={repairKarigarId || selectedKarigarId}
                                onChange={(e) => setRepairKarigarId(e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs"
                              >
                                <option value="">-- Select Karigar --</option>
                                {karigars.map((k) => (
                                  <option key={k.id} value={k.id}>
                                    {k.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                disabled={submittingAction}
                                className="w-full py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-xs cursor-pointer"
                              >
                                Send for Repair (0 Stock Deducted)
                              </button>
                            </form>

                            <form
                              onSubmit={handleAddStageGold}
                              className="p-3 bg-white border border-amber-200 rounded-xs space-y-2"
                            >
                              <div className="font-bold text-amber-900">
                                ➕ Add New Piece / Admin Gold
                              </div>
                              <p className="text-[11px] text-slate-500">
                                Adds a separate new piece or extra gold (e.g. 0.781 g) from Admin Stock and reopens {PROCESS_DISPLAY_LABELS[activeProcessObj.processType]}.
                              </p>
                              <input
                                type="number"
                                step="0.001"
                                min="0.001"
                                required
                                value={stageAddGoldWeight}
                                onChange={(e) => setStageAddGoldWeight(e.target.value)}
                                placeholder="New gold weight (g) e.g. 0.781"
                                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs font-mono"
                              />
                              <select
                                required
                                value={stageAddGoldKarigarId || selectedKarigarId}
                                onChange={(e) => setStageAddGoldKarigarId(e.target.value)}
                                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-xs"
                              >
                                <option value="">-- Select Karigar --</option>
                                {karigars.map((k) => (
                                  <option key={k.id} value={k.id}>
                                    {k.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                disabled={submittingAction}
                                className="w-full py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-semibold rounded-xs cursor-pointer"
                              >
                                Deduct Admin Stock & Reopen
                              </button>
                            </form>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {drawerTab === "RECONCILIATION" && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 p-3 border border-slate-200 rounded-xs font-mono tabular-nums">
                  <div>
                    <div className="text-slate-500 text-[11px]">
                      Initial Issued Metal
                    </div>
                    <div className="text-sm font-bold">
                      {selectedOrderRow.order.initialIssuedMetalWeight} g
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[11px]">
                      Retained Stones (AD+KL)
                    </div>
                    <div className="text-sm font-bold text-blue-800">
                      {selectedOrderRow.order.retainedStoneWeight} g
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[11px]">
                      Total Raw Gold Loss
                    </div>
                    <div className="text-sm font-bold">
                      {selectedOrderRow.order.totalRawLossWeight} g
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[11px]">
                      Total Fine Loss ({selectedOrderRow.order.touchSnapshot}%)
                    </div>
                    <div className="text-sm font-bold text-blue-800">
                      {selectedOrderRow.order.totalFineLossWeight} g
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[11px]">
                      Finished Net Gold
                    </div>
                    <div className="text-sm font-bold text-emerald-800">
                      {selectedOrderRow.order.finishedNetMetalWeight
                        ? `${selectedOrderRow.order.finishedNetMetalWeight} g`
                        : "In Progress"}
                    </div>
                  </div>
                </div>

                {/* Per-Process Loss Records */}
                <div>
                  <h4 className="font-bold text-slate-900 mb-1.5">
                    Per-Process Loss Records (Recovery Eligibility)
                  </h4>
                  <table className="w-full border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        <th className="p-2 text-left">Process</th>
                        <th className="p-2 text-left">Karigar</th>
                        <th className="p-2 text-right">Raw Gold Loss (g)</th>
                        <th className="p-2 text-right">Fine Loss (g)</th>
                        <th className="p-2 text-left">Eligibility Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderRow.lossRecords.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-3 text-center text-slate-500"
                          >
                            No process loss records posted yet.
                          </td>
                        </tr>
                      ) : (
                        selectedOrderRow.lossRecords.map((lr) => (
                          <tr
                            key={lr.id}
                            className="border-b border-slate-100 font-mono"
                          >
                            <td className="p-2 font-sans font-semibold">
                              {PROCESS_DISPLAY_LABELS[lr.processType]}
                            </td>
                            <td className="p-2 font-sans">
                              {lr.karigar
                                ? `${lr.karigar.name} (${lr.karigar.karigarCode})`
                                : "-"}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {lr.rawMetalLossWeight} g
                            </td>
                            <td className="p-2 text-right tabular-nums text-blue-800">
                              {lr.fineEquivalentLossWeight} g
                            </td>
                            <td className="p-2">
                              <span
                                className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-xs border ${
                                  lr.eligibilityStatus === "ELIGIBLE"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                    : "bg-amber-50 text-amber-800 border-amber-300"
                                }`}
                              >
                                {lr.eligibilityStatus}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Controlled Cancellation */}
                {actor.role === "OWNER_ADMIN" &&
                  selectedOrderRow.order.status !== "COMPLETED" &&
                  selectedOrderRow.order.status !== "CANCELLED" && (
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
                      <span className="text-slate-600">
                        Need to cancel this order? Unposted orders cancel immediately; posted orders enter CANCELLATION_PENDING_RECONCILIATION without deleting journal entries.
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Reason for cancellation..."
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded-xs"
                        />
                        <button
                          type="button"
                          onClick={handleCancelOrder}
                          className="px-3 py-1 bg-red-700 text-white text-xs font-semibold rounded-xs cursor-pointer"
                        >
                          Cancel Order
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {drawerTab === "JOB_CARD_QR" && (
              <div className="flex flex-col md:flex-row items-start justify-center gap-6 p-2">
                <div>
                  <div className="text-xs font-bold text-slate-700 mb-2">
                    Job Card (With QR Above Image)
                  </div>
                  <ManufacturingWorksheetPreview
                    {...adaptV2OrderToV1WorksheetProps({
                      bagNumber: selectedOrderRow.order.bagNumber,
                      customerName: selectedOrderRow.customer.name,
                      orderName: selectedOrderRow.order.orderName,
                      orderDate: selectedOrderRow.order.orderDate,
                      dueDate: selectedOrderRow.order.dueDate,
                      purityDisplayLabel:
                        selectedOrderRow.purity.displayLabel,
                      targetWeightGrams:
                        selectedOrderRow.order.targetWeightText ||
                        selectedOrderRow.order.targetWeight ||
                        selectedOrderRow.order.initialIssuedMetalWeight,
                      size: selectedOrderRow.order.size,
                      photoUrl: selectedOrderRow.order.photoUrl,
                      selectedProcesses: selectedOrderRow.processes.map(
                        (p) => p.processType
                      ),
                      adDetailsJson: selectedOrderRow.order.adDetailsJson,
                    })}
                    qrCodeOrderId={selectedOrderRow.order.id}
                    qrCodeBagNumber={selectedOrderRow.order.bagNumber}
                    settingSummary={(() => {
                      const sp = (selectedOrderRow.processes ?? []).find((p) => p.processType === "SETTING");
                      const stones = (selectedOrderRow.stoneComponents ?? []).filter(
                        (s) => s.direction === "ADDED" && (!sp || s.orderProcessId === sp.id)
                      );
                      const adStones = stones.filter((s) => s.componentType === "AD");
                      const klStones = stones.filter((s) => s.componentType === "KL");
                      return {
                        inWeight: sp?.latestGrossInWeight,
                        outWeight: sp?.latestGrossOutWeight,
                        extraWeight: sp?.extraReturnedMetalWeight,
                        lossWeight: sp?.closedLossWeight,
                        adWeight: String(adStones.reduce((a, s) => a + Number(s.weightGrams || 0), 0)),
                        adPieces: adStones.reduce((a, s) => a + (s.pieces || 0), 0),
                        klWeight: String(klStones.reduce((a, s) => a + Number(s.weightGrams || 0), 0)),
                        klPieces: klStones.reduce((a, s) => a + (s.pieces || 0), 0),
                      };
                    })()}
                  />
                </div>

                <div className="space-y-2 no-print">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintMode("SINGLE");
                      setTimeout(() => window.print(), 80);
                    }}
                    className="block w-full px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-xs cursor-pointer"
                  >
                    Print Job Card & QR Label
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadManufacturingWorksheet(
                        adaptV2OrderToV1WorksheetPDFData({
                          bagNumber: selectedOrderRow.order.bagNumber,
                          customerName: selectedOrderRow.customer.name,
                          orderName: selectedOrderRow.order.orderName,
                          orderDate: selectedOrderRow.order.orderDate,
                          dueDate: selectedOrderRow.order.dueDate,
                          purityDisplayLabel:
                            selectedOrderRow.purity.displayLabel,
                          targetWeightGrams:
                            selectedOrderRow.order.targetWeight ||
                            selectedOrderRow.order.initialIssuedMetalWeight,
                          size: selectedOrderRow.order.size,
                          photoUrl: selectedOrderRow.order.photoUrl,
                          selectedProcesses: selectedOrderRow.processes.map(
                            (p) => p.processType
                          ),
                          adDetailsJson: selectedOrderRow.order.adDetailsJson,
                        })
                      )
                    }
                    className="block w-full px-4 py-2 bg-white text-slate-800 border border-slate-300 text-xs font-semibold rounded-xs hover:bg-slate-100 cursor-pointer"
                  >
                    Download V1 PDF Worksheet
                  </button>
                </div>
              </div>
            )}

            {drawerTab === "EDIT_ORDER" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (savingOrderEdit) return;
                  setActionError(null);
                  setActionSuccess(null);
                  setSavingOrderEdit(true);
                  try {
                    const res = await fetch("/api/orders", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        orderId: selectedOrderRow.order.id,
                        customerId: editCustomerId || undefined,
                        purityId: editPurityId || undefined,
                        orderName: editOrderName,
                        targetWeight: editTargetWeight || null,
                        size: editSize || null,
                        dueDate: editDueDate || null,
                        notes: editNotes || null,
                        photoUrl: editPhotoUrl || null,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.ok) {
                      setActionError(data.error || "Failed to update order details");
                    } else {
                      setActionSuccess(
                        `Updated details for Bag #${selectedOrderRow.order.bagNumber}`
                      );
                      await loadRegister(true);
                    }
                  } catch (err) {
                    setActionError(
                      err instanceof Error
                        ? err.message
                        : "Failed to update order details"
                    );
                  } finally {
                    setSavingOrderEdit(false);
                  }
                }}
                className="bg-slate-50 border border-slate-200 rounded-xs p-4 space-y-3 max-w-2xl"
              >
                <div className="text-xs font-bold text-slate-900">
                  Edit Order Details — Bag #{selectedOrderRow.order.bagNumber}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Customer
                    </label>
                    <select
                      value={editCustomerId}
                      onChange={(e) => setEditCustomerId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xs"
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.customerCode})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Karat / Purity
                    </label>
                    <select
                      value={editPurityId}
                      onChange={(e) => setEditPurityId(e.target.value)}
                      disabled={
                        selectedOrderRow.order.status === "COMPLETED" ||
                        selectedOrderRow.order.status === "DELIVERED" ||
                        selectedOrderRow.order.status === "CANCELLED"
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xs disabled:bg-slate-100"
                    >
                      {purities.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayLabel} ({p.touchPercent}%)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Order / Item Name
                    </label>
                    <input
                      type="text"
                      value={editOrderName}
                      onChange={(e) => setEditOrderName(e.target.value)}
                      placeholder="e.g. LR RING"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Weight (Text / Grams)
                    </label>
                    <input
                      type="text"
                      value={editTargetWeight}
                      onChange={(e) => setEditTargetWeight(e.target.value)}
                      placeholder="e.g. 15.000 or 15-16g"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Size
                    </label>
                    <input
                      type="text"
                      value={editSize}
                      onChange={(e) => setEditSize(e.target.value)}
                      placeholder="e.g. 2.4"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Notes
                    </label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Optional order notes..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Product Photo
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      {editPhotoUrl ? (
                        <img
                          src={editPhotoUrl}
                          alt="Product"
                          className="w-16 h-16 object-cover rounded border border-slate-300 bg-white"
                        />
                      ) : (
                        <div className="w-16 h-16 flex items-center justify-center rounded border border-dashed border-slate-300 bg-white text-[10px] text-slate-400">
                          No photo
                        </div>
                      )}
                      <div className="space-y-1">
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploadingEditPhoto}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingEditPhoto(true);
                            setActionError(null);
                            try {
                              const compressed = await compressImageFileForUpload(file);
                              const fd = new FormData();
                              fd.append("file", compressed);
                              const res = await fetch("/api/uploads", {
                                method: "POST",
                                body: fd,
                              });
                              const data = await safeParseJsonResponse<{
                                ok?: boolean;
                                publicUrl?: string;
                                error?: string;
                              }>(res);
                              if (!res.ok || !data.ok || !data.publicUrl) {
                                setActionError(data.error || "Failed to upload photo");
                              } else {
                                setEditPhotoUrl(data.publicUrl);
                              }
                            } catch (err) {
                              setActionError(
                                err instanceof Error
                                  ? err.message
                                  : "Failed to upload photo"
                              );
                            } finally {
                              setUploadingEditPhoto(false);
                            }
                          }}
                          className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-xs file:border file:border-slate-300 file:bg-white file:text-slate-700 file:font-semibold hover:file:bg-slate-100 cursor-pointer"
                        />
                        {uploadingEditPhoto && (
                          <div className="text-[11px] text-blue-700 font-medium">
                            Uploading photo...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={savingOrderEdit}
                    className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs cursor-pointer disabled:opacity-60"
                  >
                    {savingOrderEdit ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerTab("JOB_CARD_QR")}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                  >
                    Open Job Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawerTab("JOB_CARD_QR")}
                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Mobile Cards (one readable process section at a time on phones) */}
        <div className="md:hidden space-y-2.5">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {CANONICAL_PROCESS_SEQUENCE.map((pt) => (
              <button
                key={`mob_tab_${pt}`}
                type="button"
                onClick={() => setMobileProcessTab(pt)}
                className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-xs border whitespace-nowrap cursor-pointer ${
                  mobileProcessTab === pt
                    ? "bg-blue-700 text-white border-blue-700"
                    : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                {PROCESS_DISPLAY_LABELS[pt]}
              </button>
            ))}
          </div>

          {rows.map((row) => {
            const selectedProc = row.processes.find(
              (p) => p.processType === mobileProcessTab
            );
            const openProc =
              selectedProc ||
              row.processes.find((p) => p.status !== "CLOSED") ||
              row.processes[0];
            const hasIn =
              openProc && Number(openProc.latestGrossInWeight || 0) > 0;
            const hasOut =
              openProc && Number(openProc.latestGrossOutWeight || 0) > 0;
            return (
              <div
                key={`mob_${row.order.id}`}
                onClick={() => selectOrder(row.order.id)}
                className="bg-white border border-slate-300 rounded-xs p-3 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-800">
                    #{row.order.bagNumber} • {row.purity.displayLabel}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-700">
                    {openProc
                      ? `${PROCESS_DISPLAY_LABELS[openProc.processType]} • ${
                          openProc.status === "CLOSED"
                            ? "Closed"
                            : hasIn
                            ? "With Karigar"
                            : "Not Started"
                        }`
                      : row.order.status}
                  </span>
                </div>
                <div className="text-slate-700 font-medium">
                  {row.customer.name} — {row.order.orderName}
                </div>
                {openProc && (
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-200 rounded-xs p-2 font-mono text-[11px]">
                    <div>
                      <div className="text-[10px] font-sans text-slate-500">IN</div>
                      <div className="font-semibold">
                        {hasIn ? `${formatWeight3(openProc.latestGrossInWeight)}g` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-sans text-slate-500">OUT</div>
                      <div className="font-semibold">
                        {hasOut ? `${formatWeight3(openProc.latestGrossOutWeight)}g` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-sans text-slate-500">Loss</div>
                      <div className="font-semibold">
                        {openProc.status === "CLOSED"
                          ? `${formatWeight3(openProc.closedLossWeight)}g`
                          : hasIn
                          ? "Pending"
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}
                {openProc && openProc.status !== "CLOSED" && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openProcessAction(
                          row,
                          openProc.processType,
                          "GIVE_WORK"
                        );
                      }}
                      className="flex-1 py-1.5 px-2 bg-blue-700 text-white font-semibold rounded-xs cursor-pointer"
                    >
                      Give Work
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openProcessAction(
                          row,
                          openProc.processType,
                          "RECEIVE_WORK"
                        );
                      }}
                      className="flex-1 py-1.5 px-2 bg-emerald-700 text-white font-semibold rounded-xs cursor-pointer"
                    >
                      Receive Work
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Spreadsheet Table */}
        <div className="hidden md:block bg-white border border-slate-300 rounded-xs overflow-x-auto max-h-[62vh]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 text-slate-800">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header, idx) => (
                    <th
                      key={header.id}
                      className={`px-2.5 py-2 text-[11px] font-bold tracking-tight border-r border-slate-200 whitespace-nowrap ${
                        idx === 0
                          ? "text-left bg-slate-100 sticky left-0 z-20 min-w-[72px]"
                          : idx === 1
                          ? "text-left bg-slate-100 sticky left-[72px] z-20"
                          : "text-right"
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="p-8 text-center text-slate-500"
                  >
                    No orders found in this view. Click{" "}
                    <Link
                      href="/orders/new"
                      className="text-blue-700 font-semibold underline"
                    >
                      + New Order
                    </Link>{" "}
                    to create your first order.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isSelected =
                    row.original.order.id === selectedOrderId;
                  return (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onClick={() => selectOrder(row.original.order.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectOrder(row.original.order.id);
                        }
                      }}
                      className={`border-b border-slate-200 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600 ${
                        isSelected
                          ? "bg-blue-50/90"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      {row.getVisibleCells().map((cell, cIdx) => (
                        <td
                          key={cell.id}
                          className={`px-2.5 py-1.5 border-r border-slate-100 whitespace-nowrap ${
                            cIdx === 0
                              ? `sticky left-0 z-10 min-w-[72px] ${isSelected ? "bg-blue-50" : "bg-white"}`
                              : cIdx === 1
                              ? `sticky left-[72px] z-10 ${isSelected ? "bg-blue-50" : "bg-white"}`
                              : ""
                          }`}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Month Sheet Bar (Rule 10 & Rule 14: Filters rows only, never resets balances) */}
        <div className="bg-white border border-slate-200 rounded-xs px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-[11px] text-slate-500 mr-1">
              SHEETS (Asia/Kolkata):
            </span>
            <button
              type="button"
              onClick={() => setMonthKey("ALL")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-xs border cursor-pointer ${
                monthKey === "ALL"
                  ? "bg-blue-700 text-white border-blue-700"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              All Time
            </button>
            {availableMonths.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonthKey(m)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-xs border cursor-pointer ${
                  monthKey === m
                    ? "bg-blue-700 text-white border-blue-700"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {formatMonthKeyLabel(m)}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-slate-500">
            Showing {rows.length} order(s) • Month tabs filter rows only and never reset stock or loss balances.
          </div>
        </div>
        {weightGainPrompt && selectedOrderRow && activeProcessObj && (
          <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl border border-amber-300">
              <div className="border-b pb-2">
                <h3 className="text-sm font-bold text-amber-950">
                  Weight Increased by +{weightGainPrompt.gainGrams} g — Where did it come from?
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Output weight is +{weightGainPrompt.gainGrams} g higher than recorded input for{" "}
                  <strong>{PROCESS_DISPLAY_LABELS[activeProcessObj.processType]}</strong>.
                </p>
              </div>
              <div className="space-y-2 text-xs">
                <button
                  type="button"
                  disabled={submittingAction}
                  onClick={async () => {
                    setSubmittingAction(true);
                    setActionError(null);
                    try {
                      const res = await fetch(
                        `/api/orders/${selectedOrderRow.order.id}/process`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "POST_PROCESS_ENTRY",
                            processType: activeProcessObj.processType,
                            karigarId: selectedKarigarId,
                            grossInWeight,
                            grossOutWeight,
                            extraMetalReturnedWeight: extraMetalReturnedWeight || undefined,
                            closeProcess,
                            nextProcessType: closeProcess && nextProcessType ? nextProcessType : undefined,
                            adjustAgainstKarigarBalance: true,
                            isRepairing,
                            businessDate,
                            notes: entryNotes || undefined,
                            idempotencyKey: `ui_proc_adj_${selectedOrderRow.order.id}_${activeProcessObj.processType}_${Date.now()}`,
                          }),
                        }
                      );
                      const data = await res.json();
                      if (!res.ok || !data.ok) {
                        setActionError(data.error || "Failed to adjust against karigar balance");
                      } else {
                        setWeightGainPrompt(null);
                        setActionSuccess(
                          `Adjusted +${weightGainPrompt.gainGrams} g against karigar balance (${PROCESS_DISPLAY_LABELS[activeProcessObj.processType]}).`
                        );
                        await loadRegister();
                      }
                    } finally {
                      setSubmittingAction(false);
                    }
                  }}
                  className="w-full text-left p-3 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
                >
                  <div className="font-bold text-emerald-900">
                    1. From Karigar&apos;s Outstanding Balance (-{weightGainPrompt.gainGrams} g loss)
                  </div>
                  <div className="text-[11px] text-emerald-800 mt-0.5">
                    Karigar used his own / previously lost gold; reduces his loss balance.
                  </div>
                </button>

                <button
                  type="button"
                  disabled={submittingAction}
                  onClick={async () => {
                    setSubmittingAction(true);
                    setActionError(null);
                    try {
                      const addRes = await fetch(
                        `/api/orders/${selectedOrderRow.order.id}/process`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "ADD_STAGE_GOLD",
                            processType: activeProcessObj.processType,
                            karigarId: selectedKarigarId,
                            additionalWeight: weightGainPrompt.gainGrams,
                            notes: `Extra gold added during ${activeProcessObj.processType}`,
                            idempotencyKey: `ui_gain_add_${selectedOrderRow.order.id}_${Date.now()}`,
                          }),
                        }
                      );
                      const addData = await addRes.json();
                      if (!addRes.ok || !addData.ok) {
                        setActionError(addData.error || "Failed to deduct from Admin Stock");
                        return;
                      }
                      const updatedGrossIn = (
                        Number(grossInWeight || 0) + Number(weightGainPrompt.gainGrams)
                      ).toFixed(3);
                      const postRes = await fetch(
                        `/api/orders/${selectedOrderRow.order.id}/process`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "POST_PROCESS_ENTRY",
                            processType: activeProcessObj.processType,
                            karigarId: selectedKarigarId,
                            grossInWeight: updatedGrossIn,
                            grossOutWeight,
                            extraMetalReturnedWeight: extraMetalReturnedWeight || undefined,
                            closeProcess,
                            nextProcessType: closeProcess && nextProcessType ? nextProcessType : undefined,
                            adjustAgainstKarigarBalance: false,
                            isRepairing,
                            businessDate,
                            notes: entryNotes || undefined,
                            idempotencyKey: `ui_gain_post_${selectedOrderRow.order.id}_${Date.now()}`,
                          }),
                        }
                      );
                      const postData = await postRes.json();
                      if (!postRes.ok || !postData.ok) {
                        setActionError(postData.error || "Added stock, but failed to post return");
                      } else {
                        setWeightGainPrompt(null);
                        setActionSuccess(
                          `Deducted +${weightGainPrompt.gainGrams} g from Admin Stock and closed ${PROCESS_DISPLAY_LABELS[activeProcessObj.processType]}.`
                        );
                        await loadRegister();
                      }
                    } finally {
                      setSubmittingAction(false);
                    }
                  }}
                  className="w-full text-left p-3 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 cursor-pointer"
                >
                  <div className="font-bold text-amber-900">
                    2. New Gold Added from Admin Stock (+{weightGainPrompt.gainGrams} g)
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5">
                    Deducts +{weightGainPrompt.gainGrams} g from Admin Stock once and adds to Bag Supplied.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setWeightGainPrompt(null)}
                  className="w-full p-2 text-center rounded border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
                >
                  3. Cancel &amp; Fix Weights Manually
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function ProductionRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-xs text-slate-600">
          Loading production register...
        </div>
      }
    >
      <ProductionRegisterContent />
    </Suspense>
  );
}

