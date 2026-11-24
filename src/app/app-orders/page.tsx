"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell, AppShellUser } from "@/components/AppShell";
import { fetchActorCached } from "@/lib/client-cache";
import {
  RefreshCw,
  Send,
  UserPlus,
  Check,
  X,
  ArrowLeft,
  Search,
  ChevronRight,
} from "lucide-react";

type RequestFilter =
  | "ALL"
  | "TODAY"
  | "AWAITING_APPROVAL"
  | "MORE_DETAILS_NEEDED"
  | "APPROVED"
  | "DECLINED"
  | "READY";

interface RequestItemRow {
  id: string;
  quantity: number;
  linkedBagQuantity: number;
  size: string | null;
  purityLabelSnapshot: string | null;
  targetWeight: string | null;
  requestedChanges: string | null;
  textInstructions: string | null;
  voiceAttachmentId: string | null;
  referenceMediaIds: string[];
  designSnapshot: {
    code?: string;
    name?: string;
    thumbnailUrl?: string | null;
  };
  bagLinks: Array<{
    id: string;
    linkedQuantity: number;
    order: { id: string; bagNumber: string; status: string };
  }>;
}

interface RequestRow {
  id: string;
  requestNumber: string;
  status: string;
  requestedDeliveryDate: string | null;
  confirmedDeliveryDate: string | null;
  customerNote: string | null;
  managerVisibleNote: string | null;
  hasPendingChangeReq: boolean;
  submittedAt: string;
  customer: {
    id: string;
    customerCode: string;
    name: string;
    phone: string | null;
    profilePhotoUrl?: string | null;
  };
  items: RequestItemRow[];
  messages: Array<{
    id: string;
    senderRole: string;
    senderName: string;
    messageType: string;
    body: string;
    createdAt: string;
  }>;
}

interface ManagerWorkspaceData {
  counts: {
    newToday: number;
    awaitingApproval: number;
    waitingCustomerInfo: number;
    approvedAwaitingBag: number;
    cadUnassigned: number;
    cadInProgress: number;
    cadReady: number;
    cadChangesRequired: number;
  };
  requests: RequestRow[];
  cadDesigners: Array<{ id: string; name: string; email: string }>;
  bags: Array<{
    id: string;
    bagNumber: string;
    orderName: string;
    status: string;
    size: string | null;
    targetWeight: string | null;
    customer: { id: string; name: string };
    purity: { displayLabel: string };
    cadAssignment: {
      id: string;
      cadRequired: boolean;
      assignedDesignerId: string | null;
      status: string;
      cadDeadline: string | null;
      currentVersion: number;
      instructions: string;
      designerAskNote: string | null;
      selectedMediaIdsJson: string;
      assignedDesigner: { id: string; name: string } | null;
    } | null;
    linkedMedia: Array<{ id: string; kind: "IMAGE" | "VOICE_NOTE"; label: string }>;
  }>;
  appCustomers?: Array<{
    userId: string;
    customerId: string | null;
    customerCode: string;
    name: string;
    phone: string | null;
    email: string;
    address: string | null;
    profilePhotoUrl: string | null;
    orderCount: number;
    joinedAt: string;
  }>;
}

function getTodayYmd(): string {
  const ist = new Date(Date.now() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function getItemPhotoUrls(it: RequestItemRow): string[] {
  const urls: string[] = [];
  if (it.designSnapshot?.thumbnailUrl) {
    urls.push(it.designSnapshot.thumbnailUrl);
  }
  for (const mid of it.referenceMediaIds || []) {
    const u = `/api/app-attachments/${mid}`;
    if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

export default function AppOrdersManagerPage() {
  const [actor, setActor] = useState<AppShellUser | null>(null);
  const [data, setData] = useState<ManagerWorkspaceData | null>(null);
  const [tab, setTab] = useState<"REQUESTS" | "CAD_SHEETS" | "APP_CUSTOMERS" | "INVITES">("REQUESTS");
  const [loading, setLoading] = useState(true);
  const [busyReqId, setBusyReqId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Filters & Customer-Card Selection
  const [reqFilter, setReqFilter] = useState<RequestFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Request review state
  const [confirmDateByReq, setConfirmDateByReq] = useState<Record<string, string>>({});
  const [noteByReq, setNoteByReq] = useState<Record<string, string>>({});

  // CAD sheet editing state
  const [cadDraftByBag, setCadDraftByBag] = useState<
    Record<
      string,
      {
        cadRequired: boolean;
        assignedDesignerId: string;
        cadDeadline: string;
        instructions: string;
        selectedMediaIds: string[];
      }
    >
  >({});

  // Invitations state (lazy-loaded only when Invites tab is opened)
  const [inviteRole, setInviteRole] = useState<"CUSTOMER" | "CAD_DESIGNER">("CUSTOMER");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteCustomerId, setInviteCustomerId] = useState("");
  const [customers, setCustomers] = useState<
    Array<{ id: string; customerCode: string; name: string }>
  >([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, wsRes] = await Promise.all([
        fetchActorCached(false),
        fetch("/api/app-orders", { cache: "no-store" }),
      ]);
      if (u) setActor(u);
      const ws = await wsRes.json();
      if (!wsRes.ok || !ws.ok) throw new Error(ws.error || "Failed to load");
      setData(ws);

      const nextDrafts: typeof cadDraftByBag = {};
      for (const b of ws.bags || []) {
        let media: string[] = [];
        try {
          media = JSON.parse(b.cadAssignment?.selectedMediaIdsJson || "[]");
        } catch {
          media = [];
        }
        nextDrafts[b.id] = {
          cadRequired: b.cadAssignment?.cadRequired ?? true,
          assignedDesignerId: b.cadAssignment?.assignedDesignerId || "",
          cadDeadline: b.cadAssignment?.cadDeadline
            ? String(b.cadAssignment.cadDeadline).slice(0, 10)
            : "",
          instructions: b.cadAssignment?.instructions || "",
          selectedMediaIds: Array.isArray(media) ? media : [],
        };
      }
      setCadDraftByBag(nextDrafts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load App Orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (tab !== "INVITES" || invitesLoaded) return;
    fetch("/api/invitations", { cache: "no-store" })
      .then((r) => r.json())
      .then((inv) => {
        if (inv?.ok) {
          setCustomers(inv.customers || []);
          setInvitesLoaded(true);
        }
      })
      .catch(() => {});
  }, [tab, invitesLoaded]);

  const todayYmd = useMemo(() => getTodayYmd(), []);

  const filteredRequests = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.requests.filter((r) => {
      if (reqFilter === "TODAY" && !r.submittedAt.startsWith(todayYmd)) {
        return false;
      }
      if (
        reqFilter !== "ALL" &&
        reqFilter !== "TODAY" &&
        r.status !== reqFilter
      ) {
        return false;
      }
      if (q) {
        const matchCust =
          r.customer.name.toLowerCase().includes(q) ||
          r.customer.customerCode.toLowerCase().includes(q);
        const matchReq = r.requestNumber.toLowerCase().includes(q);
        const matchItem = r.items.some((it) =>
          (it.designSnapshot?.name || "").toLowerCase().includes(q)
        );
        if (!matchCust && !matchReq && !matchItem) return false;
      }
      return true;
    });
  }, [data, reqFilter, searchQuery, todayYmd]);

  // Group filtered requests into Customer-wise cards
  const customerCards = useMemo(() => {
    const map = new Map<
      string,
      {
        customer: RequestRow["customer"];
        requests: RequestRow[];
        pendingCount: number;
        approvedCount: number;
        todayCount: number;
        photos: string[];
      }
    >();
    for (const r of filteredRequests) {
      let entry = map.get(r.customer.id);
      if (!entry) {
        entry = {
          customer: r.customer,
          requests: [],
          pendingCount: 0,
          approvedCount: 0,
          todayCount: 0,
          photos: [],
        };
        map.set(r.customer.id, entry);
      }
      entry.requests.push(r);
      if (r.status === "AWAITING_APPROVAL" || r.status === "MORE_DETAILS_NEEDED") {
        entry.pendingCount += 1;
      }
      if (r.status === "APPROVED") entry.approvedCount += 1;
      if (r.submittedAt.startsWith(todayYmd)) entry.todayCount += 1;
      for (const it of r.items) {
        for (const p of getItemPhotoUrls(it)) {
          if (entry.photos.length < 4 && !entry.photos.includes(p)) {
            entry.photos.push(p);
          }
        }
      }
    }
    return Array.from(map.values());
  }, [filteredRequests, todayYmd]);

  const activeCustomerCard = useMemo(
    () =>
      selectedCustomerId
        ? customerCards.find((c) => c.customer.id === selectedCustomerId) || null
        : null,
    [customerCards, selectedCustomerId]
  );

  async function reviewRequest(
    requestId: string,
    decision:
      | "APPROVE"
      | "ASK_DETAILS"
      | "DECLINE"
      | "MARK_READY"
      | "MARK_DELIVERED"
      | "RESOLVE_CHANGE_REQUEST"
  ) {
    setError(null);
    setMessage(null);
    setBusyReqId(requestId);
    try {
      const confirmedDate = confirmDateByReq[requestId] || null;
      const note = noteByReq[requestId] || "";
      const res = await fetch("/api/app-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVIEW_REQUEST",
          requestId,
          decision,
          confirmedDeliveryDate: confirmedDate,
          note,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setError(d.error || "Failed to update request");
        return;
      }

      // Instant optimistic update in local state so user sees result immediately
      const statusMap: Record<string, string> = {
        APPROVE: "APPROVED",
        ASK_DETAILS: "MORE_DETAILS_NEEDED",
        DECLINE: "DECLINED",
        MARK_READY: "READY",
        MARK_DELIVERED: "DELIVERED",
      };
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          requests: prev.requests.map((r) =>
            r.id === requestId
              ? {
                  ...r,
                  status: statusMap[decision] || r.status,
                  confirmedDeliveryDate: confirmedDate || r.confirmedDeliveryDate,
                  managerVisibleNote: note || r.managerVisibleNote,
                  hasPendingChangeReq:
                    decision === "RESOLVE_CHANGE_REQUEST"
                      ? false
                      : r.hasPendingChangeReq,
                }
              : r
          ),
        };
      });
      setMessage(`Updated request (${decision}).`);
      void loadWorkspace();
    } finally {
      setBusyReqId(null);
    }
  }

  async function submitCadSheet(orderId: string, sendToDesigner: boolean) {
    const draft = cadDraftByBag[orderId];
    if (!draft) return;
    setError(null);
    setMessage(null);
    const res = await fetch("/api/app-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: sendToDesigner ? "SEND_CAD_TO_DESIGNER" : "SAVE_CAD_SHEET",
        orderId,
        cadRequired: draft.cadRequired,
        assignedDesignerId: draft.assignedDesignerId || null,
        cadDeadline: draft.cadDeadline || null,
        instructions: draft.instructions,
        selectedMediaIds: draft.selectedMediaIds,
      }),
    });
    const d = await res.json();
    if (!res.ok || !d.ok) {
      setError(d.error || "Failed to save CAD instruction sheet");
      return;
    }
    setMessage(
      sendToDesigner
        ? "Sent CAD instruction sheet to designer and created notification."
        : "Saved CAD instruction draft (designer not notified yet)."
    );
    await loadWorkspace();
  }

  if (!actor) return <div className="p-6 text-xs text-slate-500">Loading...</div>;

  return (
    <AppShell actor={actor}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              App Orders &amp; CAD Workspace
            </h1>
            <p className="text-xs text-slate-500">
              Click any customer card to review their orders, images, voice notes, and approvals.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/orders/new"
              className="px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-semibold"
            >
              + Create Bag (Link Request)
            </Link>
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 bg-white rounded-md text-xs font-semibold cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800">
            {message}
          </div>
        )}

        {/* Actionable Queues */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
            {([
              ["New Today", data.counts.newToday, "TODAY"],
              ["Awaiting Approval", data.counts.awaitingApproval, "AWAITING_APPROVAL"],
              ["Need Info", data.counts.waitingCustomerInfo, "MORE_DETAILS_NEEDED"],
              ["Awaiting Bag", data.counts.approvedAwaitingBag, "APPROVED"],
              ["CAD Unassigned", data.counts.cadUnassigned, null],
              ["CAD In Progress", data.counts.cadInProgress, null],
              ["CAD Ready", data.counts.cadReady, null],
              ["CAD Changes", data.counts.cadChangesRequired, null],
            ] as Array<[string, number, RequestFilter | null]>).map(([label, val, filterTarget]) => (
              <button
                key={String(label)}
                type="button"
                onClick={() => {
                  if (filterTarget) {
                    setTab("REQUESTS");
                    setSelectedCustomerId(null);
                    setReqFilter(filterTarget);
                  } else {
                    setTab("CAD_SHEETS");
                  }
                }}
                className="text-left bg-white border border-slate-200 hover:border-slate-400 rounded-lg p-2.5 cursor-pointer transition-colors"
              >
                <div className="text-[10px] font-semibold text-slate-500 uppercase">
                  {label}
                </div>
                <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                  {val}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Main Workspace Tabs */}
        <div className="flex gap-2 bg-white border border-slate-200 rounded-lg p-2 text-xs">
          {(
            [
              ["REQUESTS", `Customer Orders (${data?.requests.length || 0})`],
              ["CAD_SHEETS", `Bag CAD Sheets (${data?.bags.length || 0})`],
              ["APP_CUSTOMERS", `App Customers (${data?.appCustomers?.length || 0})`],
              ["INVITES", "Customer & Designer Invites"],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTab(k);
                setSelectedCustomerId(null);
              }}
              className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                tab === k
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* TAB: CUSTOMER REQUESTS (Customer-Wise Cards -> Click to Open Orders) */}
        {tab === "REQUESTS" && data && (
          <div className="space-y-3">
            {/* Filter Pills + Search */}
            <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["ALL", "All"],
                    ["TODAY", "Today's Orders"],
                    ["AWAITING_APPROVAL", "Pending Approval"],
                    ["MORE_DETAILS_NEEDED", "Need Info"],
                    ["APPROVED", "Approved"],
                    ["DECLINED", "Declined"],
                    ["READY", "Ready"],
                  ] as const
                ).map(([fKey, fLabel]) => (
                  <button
                    key={fKey}
                    type="button"
                    onClick={() => {
                      setReqFilter(fKey);
                      setSelectedCustomerId(null);
                    }}
                    className={`px-2.5 py-1 rounded-full font-medium cursor-pointer ${
                      reqFilter === fKey
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {fLabel}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search customer or request #..."
                  className="pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-md w-56"
                />
              </div>
            </div>

            {/* Customer Cards Grid OR Selected Customer Detail */}
            {!activeCustomerCard ? (
              customerCards.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-xs text-slate-500">
                  No customer orders match this filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customerCards.map((card) => (
                    <button
                      key={card.customer.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(card.customer.id)}
                      className="text-left bg-white border border-slate-200 hover:border-slate-400 hover:shadow-sm rounded-xl p-4 space-y-3 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {card.customer.profilePhotoUrl ? (
                            <img
                              src={card.customer.profilePhotoUrl}
                              alt={card.customer.name}
                              className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-semibold text-sm flex items-center justify-center shrink-0">
                              {card.customer.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 truncate">
                              {card.customer.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 truncate">
                              {card.customer.customerCode}
                              {card.customer.phone ? ` • ${card.customer.phone}` : ""}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                      </div>

                      {/* Order Photo Strip */}
                      {card.photos.length > 0 && (
                        <div className="flex gap-1.5">
                          {card.photos.map((src, i) => (
                            <img
                              key={`${src}-${i}`}
                              src={src}
                              alt="Order item"
                              className="w-11 h-11 rounded-md object-cover border border-slate-200 bg-slate-50"
                            />
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">
                          {card.requests.length} Orders
                        </span>
                        {card.pendingCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
                            {card.pendingCount} Pending
                          </span>
                        )}
                        {card.approvedCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                            {card.approvedCount} Approved
                          </span>
                        )}
                        {card.todayCount > 0 && (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                            {card.todayCount} Today
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerId(null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      All Customers
                    </button>
                    <div className="flex items-center gap-2.5">
                      {activeCustomerCard.customer.profilePhotoUrl ? (
                        <img
                          src={activeCustomerCard.customer.profilePhotoUrl}
                          alt={activeCustomerCard.customer.name}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-semibold text-xs flex items-center justify-center shrink-0">
                          {activeCustomerCard.customer.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="font-bold text-sm text-slate-900">
                          {activeCustomerCard.customer.name}
                        </span>
                        <span className="ml-2 text-xs font-mono text-slate-500">
                          ({activeCustomerCard.customer.customerCode})
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">
                    {activeCustomerCard.requests.length} order(s)
                  </span>
                </div>

                {activeCustomerCard.requests.map((r) => (
                  <div
                    key={r.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {r.requestNumber}
                        </span>
                        <span className="text-slate-500">
                          {r.submittedAt.slice(0, 10)}
                        </span>
                        {r.hasPendingChangeReq && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded font-bold text-[10px]">
                            Change Request
                          </span>
                        )}
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 font-bold text-slate-800">
                        {r.status}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {r.items.map((it) => {
                        const photos = getItemPhotoUrls(it);
                        return (
                          <div
                            key={it.id}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row gap-3"
                          >
                            {/* Item Photo(s) */}
                            <div className="flex gap-1.5 shrink-0">
                              {photos.length > 0 ? (
                                photos.map((src, idx) => (
                                  <button
                                    key={`${src}-${idx}`}
                                    type="button"
                                    onClick={() => setPreviewImageUrl(src)}
                                    className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-white cursor-pointer hover:opacity-90"
                                  >
                                    <img
                                      src={src}
                                      alt={it.designSnapshot?.name || "Item"}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ))
                              ) : (
                                <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center text-[10px] text-slate-400">
                                  No Image
                                </div>
                              )}
                            </div>

                            {/* Item Details + Voice */}
                            <div className="flex-1 space-y-1">
                              <div className="flex flex-wrap justify-between gap-2">
                                <span className="font-semibold text-slate-900">
                                  {it.designSnapshot?.code} — {it.designSnapshot?.name} ×{" "}
                                  {it.quantity}{" "}
                                  <span className="text-slate-500 font-normal">
                                    (Linked: {it.linkedBagQuantity}/{it.quantity})
                                  </span>
                                </span>
                                <span className="font-mono text-slate-700">
                                  {it.purityLabelSnapshot || "—"} • Size {it.size || "—"} •{" "}
                                  {it.targetWeight ? `${it.targetWeight}g` : "Weight —"}
                                </span>
                              </div>
                              {it.textInstructions && (
                                <div className="text-slate-700">
                                  Instructions: {it.textInstructions}
                                </div>
                              )}
                              {it.requestedChanges && (
                                <div className="text-slate-700">
                                  Changes: {it.requestedChanges}
                                </div>
                              )}
                              {it.bagLinks.length > 0 && (
                                <div className="text-emerald-700 font-mono">
                                  Linked Bags:{" "}
                                  {it.bagLinks
                                    .map((b) => `#${b.order.bagNumber} (${b.linkedQuantity} pcs)`)
                                    .join(", ")}
                                </div>
                              )}
                              {it.voiceAttachmentId && (
                                <audio
                                  controls
                                  src={`/api/app-attachments/${it.voiceAttachmentId}`}
                                  className="h-8 max-w-sm mt-1"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {r.messages.length > 0 && (
                      <div className="border-t border-slate-100 pt-2 space-y-1">
                        {r.messages.map((m) => (
                          <div key={m.id}>
                            <strong>{m.senderName}:</strong> {m.body}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                      <input
                        type="date"
                        value={confirmDateByReq[r.id] ?? r.confirmedDeliveryDate ?? ""}
                        onChange={(e) =>
                          setConfirmDateByReq((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                        className="px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                      />
                      <input
                        type="text"
                        value={noteByReq[r.id] || ""}
                        onChange={(e) =>
                          setNoteByReq((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        placeholder="Customer-visible note / details / decline reason..."
                        className="sm:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {r.status === "APPROVED" ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded font-semibold">
                          <Check className="w-3.5 h-3.5" />
                          Approved
                        </span>
                      ) : r.status === "READY" ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded font-semibold">
                          <Check className="w-3.5 h-3.5" />
                          Ready for Customer
                        </span>
                      ) : r.status === "DELIVERED" ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-700 rounded font-semibold">
                          <Check className="w-3.5 h-3.5" />
                          Delivered
                        </span>
                      ) : r.status === "DECLINED" ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded font-semibold">
                          <X className="w-3.5 h-3.5" />
                          Declined
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busyReqId === r.id}
                          onClick={() => void reviewRequest(r.id, "APPROVE")}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded font-semibold cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {busyReqId === r.id ? "Saving..." : "Approve"}
                        </button>
                      )}

                      {(r.status === "AWAITING_APPROVAL" || r.status === "MORE_DETAILS_NEEDED") && (
                        <>
                          <button
                            type="button"
                            disabled={busyReqId === r.id}
                            onClick={() => void reviewRequest(r.id, "ASK_DETAILS")}
                            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 rounded font-semibold cursor-pointer"
                          >
                            Ask Details
                          </button>
                          <button
                            type="button"
                            disabled={busyReqId === r.id}
                            onClick={() => void reviewRequest(r.id, "DECLINE")}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-red-50 border border-red-300 disabled:opacity-50 text-red-700 rounded font-semibold cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            Decline
                          </button>
                        </>
                      )}

                      {r.hasPendingChangeReq && (
                        <button
                          type="button"
                          disabled={busyReqId === r.id}
                          onClick={() =>
                            void reviewRequest(r.id, "RESOLVE_CHANGE_REQUEST")
                          }
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded font-semibold cursor-pointer"
                        >
                          Mark Change Reviewed
                        </button>
                      )}
                      {r.status === "APPROVED" && (
                        <button
                          type="button"
                          disabled={busyReqId === r.id}
                          onClick={() => void reviewRequest(r.id, "MARK_READY")}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded font-semibold cursor-pointer"
                        >
                          {busyReqId === r.id ? "Saving..." : "Mark Ready"}
                        </button>
                      )}
                      {r.status === "READY" && (
                        <button
                          type="button"
                          disabled={busyReqId === r.id}
                          onClick={() => void reviewRequest(r.id, "MARK_DELIVERED")}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded font-semibold cursor-pointer"
                        >
                          {busyReqId === r.id ? "Saving..." : "Mark Delivered"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: CAD SHEETS */}
        {tab === "CAD_SHEETS" && data && (
          <div className="space-y-3">
            {data.bags.map((b) => {
              const draft = cadDraftByBag[b.id];
              if (!draft) return null;
              return (
                <div
                  key={b.id}
                  className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <span className="font-mono font-bold text-sm text-slate-900">
                        Bag #{b.bagNumber}
                      </span>{" "}
                      — <span className="font-semibold">{b.orderName}</span> (
                      {b.customer.name} • {b.purity.displayLabel})
                    </div>
                    <span className="px-2.5 py-0.5 rounded bg-slate-100 font-bold">
                      {b.cadAssignment?.cadRequired === false
                        ? "CAD Not Required"
                        : b.cadAssignment?.assignedDesigner
                        ? `${b.cadAssignment.status} • ${b.cadAssignment.assignedDesigner.name} (v${b.cadAssignment.currentVersion})`
                        : "Not assigned to CAD"}
                    </span>
                  </div>

                  {b.cadAssignment?.designerAskNote && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-900">
                      <strong>Designer Question:</strong>{" "}
                      {b.cadAssignment.designerAskNote}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={draft.cadRequired}
                        onChange={(e) =>
                          setCadDraftByBag((prev) => ({
                            ...prev,
                            [b.id]: { ...draft, cadRequired: e.target.checked },
                          }))
                        }
                      />
                      CAD Required
                    </label>
                    <select
                      value={draft.assignedDesignerId}
                      onChange={(e) =>
                        setCadDraftByBag((prev) => ({
                          ...prev,
                          [b.id]: {
                            ...draft,
                            assignedDesignerId: e.target.value,
                          },
                        }))
                      }
                      className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      <option value="">-- Select CAD Designer --</option>
                      {data.cadDesigners.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={draft.cadDeadline}
                      onChange={(e) =>
                        setCadDraftByBag((prev) => ({
                          ...prev,
                          [b.id]: { ...draft, cadDeadline: e.target.value },
                        }))
                      }
                      className="px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                    />
                  </div>

                  {b.linkedMedia.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {b.linkedMedia.map((m) => (
                        <label
                          key={m.id}
                          className="inline-flex items-center gap-1.5 px-2 py-1 border border-slate-300 rounded bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={draft.selectedMediaIds.includes(m.id)}
                            onChange={(e) =>
                              setCadDraftByBag((prev) => ({
                                ...prev,
                                [b.id]: {
                                  ...draft,
                                  selectedMediaIds: e.target.checked
                                    ? [...draft.selectedMediaIds, m.id]
                                    : draft.selectedMediaIds.filter((x) => x !== m.id),
                                },
                              }))
                            }
                          />
                          <span>Share {m.label}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <textarea
                    rows={2}
                    value={draft.instructions}
                    onChange={(e) =>
                      setCadDraftByBag((prev) => ({
                        ...prev,
                        [b.id]: { ...draft, instructions: e.target.value },
                      }))
                    }
                    placeholder="Manager-written CAD instructions (customer chats & financials stay hidden)..."
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void submitCadSheet(b.id, false)}
                      className="px-3 py-1.5 border border-slate-300 bg-white rounded font-semibold cursor-pointer"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitCadSheet(b.id, true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded font-semibold cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Send to Designer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB: APP CUSTOMERS */}
        {tab === "APP_CUSTOMERS" && data && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h2 className="font-bold text-sm text-slate-900">
                  Registered Customer App Users ({data.appCustomers?.length || 0})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Customers who have signed up or accepted an invite to use the AM Jewellery App.
                </p>
              </div>
            </div>
            {(data.appCustomers || []).length === 0 ? (
              <div className="p-6 text-center text-slate-500">
                No customers have registered on the app yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(data.appCustomers || []).map((c) => (
                  <div
                    key={c.userId}
                    className="p-3.5 border border-slate-200 rounded-xl bg-slate-50/50 flex items-start gap-3"
                  >
                    {c.profilePhotoUrl ? (
                      <img
                        src={c.profilePhotoUrl}
                        alt={c.name}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-semibold text-sm flex items-center justify-center shrink-0">
                        {c.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-bold text-slate-900 truncate">
                        {c.name}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 truncate">
                        {c.customerCode} • {c.phone || c.email}
                      </div>
                      {c.address && (
                        <div className="text-[11px] text-slate-500 truncate">
                          {c.address}
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                          {c.orderCount} Orders
                        </span>
                        <span className="text-slate-400 font-mono">
                          Joined {c.joinedAt.slice(0, 10)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: INVITATIONS */}
        {tab === "INVITES" && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" />
              Create Verified Customer or CAD Designer Invite
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "CUSTOMER" | "CAD_DESIGNER")
                }
                className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="CUSTOMER">Customer</option>
                <option value="CAD_DESIGNER">CAD Designer</option>
              </select>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Name (e.g. Ashid)"
                className="px-2.5 py-1.5 border border-slate-300 rounded"
              />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email"
                className="px-2.5 py-1.5 border border-slate-300 rounded"
              />
              {inviteRole === "CUSTOMER" && (
                <select
                  value={inviteCustomerId}
                  onChange={(e) => setInviteCustomerId(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="">-- Link to Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customerCode})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                setError(null);
                const res = await fetch("/api/invitations", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    role: inviteRole,
                    displayName: inviteName,
                    email: inviteEmail,
                    customerId:
                      inviteRole === "CUSTOMER" ? inviteCustomerId : null,
                  }),
                });
                const d = await res.json();
                if (!res.ok || !d.ok) {
                  setError(d.error || "Failed to create invite");
                  return;
                }
                setCreatedInviteUrl(d.invitePath);
              }}
              className="px-4 py-1.5 bg-slate-900 text-white rounded font-semibold cursor-pointer"
            >
              Generate Invite Link
            </button>
            {createdInviteUrl && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded font-mono">
                Invite Link: <strong>{createdInviteUrl}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image Preview Lightbox */}
      {previewImageUrl && (
        <div
          onClick={() => setPreviewImageUrl(null)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 cursor-pointer"
        >
          <img
            src={previewImageUrl}
            alt="Preview"
            className="max-w-full max-h-[85vh] rounded-xl bg-white p-2"
          />
        </div>
      )}
    </AppShell>
  );
}
