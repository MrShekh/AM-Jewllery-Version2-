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
  | "CANCELLED"
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
  submittedByName?: string | null;
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
    loginName?: string;
    loginEmail?: string;
    canViewBills?: boolean;
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
  const [customerDirSearch, setCustomerDirSearch] = useState("");
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
  const [inviteCanViewBills, setInviteCanViewBills] = useState(true);
  const [linkedCustomerUsers, setLinkedCustomerUsers] = useState<
    Array<{ id: string; name: string; email: string; customerId: string | null; isActive: boolean; canViewBills: boolean }>
  >([]);
  const [customers, setCustomers] = useState<
    Array<{ id: string; customerCode: string; name: string; phone?: string | null; email?: string | null }>
  >([]);
  const [invitations, setInvitations] = useState<
    Array<{
      id: string;
      token: string;
      role: string;
      email: string;
      displayName: string;
      customerId: string | null;
      acceptedAt: string | null;
      expiresAt: string;
    }>
  >([]);
  const [linkedCustomerIds, setLinkedCustomerIds] = useState<string[]>([]);
  const [invitesLoaded, setInvitesLoaded] = useState(false);
  const [bulkInviting, setBulkInviting] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
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
    const sync = () => {
      if (document.visibilityState === "visible") {
        void loadWorkspace();
      }
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const id = setInterval(sync, 12000);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      clearInterval(id);
    };
  }, [loadWorkspace]);

  const reloadInvites = useCallback(async () => {
    try {
      const r = await fetch("/api/invitations", { cache: "no-store" });
      const inv = await r.json();
      if (inv?.ok) {
        setCustomers(inv.customers || []);
        setInvitations(inv.invitations || []);
        setLinkedCustomerUsers(inv.linkedCustomerUsers || []);
        setLinkedCustomerIds(
          (inv.linkedCustomerUsers || [])
            .map((u: { customerId?: string | null }) => u.customerId)
            .filter(Boolean)
        );
        setInvitesLoaded(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (tab !== "INVITES" || invitesLoaded) return;
    void reloadInvites();
  }, [tab, invitesLoaded, reloadInvites]);

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
      | "CANCEL_ORDER"
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
        CANCEL_ORDER: "CANCELLED",
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
                    decision === "RESOLVE_CHANGE_REQUEST" ||
                    decision === "CANCEL_ORDER"
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
        <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div>
            <h1 className="font-serif text-lg sm:text-xl font-semibold text-[#0F3D2E]">
              Customer App Orders
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Click any customer card to review their orders, reference photos, voice notes, and approvals.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/orders/new"
              className="px-3.5 py-2 bg-[#0F3D2E] hover:bg-[#14533E] text-white rounded-xl text-xs font-semibold transition-colors"
            >
              + Create Bag (Link Order)
            </Link>
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-stone-200 bg-white hover:bg-stone-50 rounded-xl text-xs font-semibold text-stone-700 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
            {message}
          </div>
        )}

        {/* Focused 4 Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {([
              ["New Today", data.counts.newToday, "TODAY", "border-stone-200"],
              [
                "Pending Approval",
                data.counts.awaitingApproval,
                "AWAITING_APPROVAL",
                data.counts.awaitingApproval > 0
                  ? "border-amber-300 bg-amber-50/40"
                  : "border-stone-200",
              ],
              ["Need Customer Info", data.counts.waitingCustomerInfo, "MORE_DETAILS_NEEDED", "border-stone-200"],
              ["App Customers", data.appCustomers?.length || 0, null, "border-stone-200"],
            ] as Array<[string, number, RequestFilter | null, string]>).map(
              ([label, val, filterTarget, tone]) => (
                <button
                  key={String(label)}
                  type="button"
                  onClick={() => {
                    if (filterTarget) {
                      setTab("REQUESTS");
                      setSelectedCustomerId(null);
                      setReqFilter(filterTarget);
                    } else {
                      setTab("APP_CUSTOMERS");
                    }
                  }}
                  className={`text-left bg-white border ${tone} hover:border-[#0F3D2E]/50 rounded-2xl p-3.5 cursor-pointer transition-all shadow-2xs`}
                >
                  <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                    {label}
                  </div>
                  <div className="text-2xl font-bold font-mono text-stone-900 mt-1">
                    {val}
                  </div>
                </button>
              )
            )}
          </div>
        )}

        {/* Main Workspace Tabs */}
        <div className="flex flex-wrap gap-2 bg-white border border-stone-200/90 rounded-2xl p-2 text-xs shadow-2xs">
          {(
            [
              ["REQUESTS", `Customer Orders (${data?.requests.length || 0})`],
              ["APP_CUSTOMERS", `App Customers (${data?.appCustomers?.length || 0})`],
              ["INVITES", "Customer Invites"],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTab(k);
                setSelectedCustomerId(null);
              }}
              className={`px-4 py-2 rounded-xl font-semibold cursor-pointer transition-colors ${
                tab === k
                  ? "bg-[#0F3D2E] text-white"
                  : "bg-stone-100 text-stone-700 hover:bg-stone-200"
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
            <div className="bg-white border border-stone-200/90 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["ALL", "All"],
                    ["TODAY", "Today's Orders"],
                    ["AWAITING_APPROVAL", "Pending Approval"],
                    ["MORE_DETAILS_NEEDED", "Need Info"],
                    ["APPROVED", "Approved"],
                    ["DECLINED", "Declined"],
                    ["CANCELLED", "Cancelled"],
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
                    className={`px-3 py-1.5 rounded-full font-medium cursor-pointer transition-colors ${
                      reqFilter === fKey
                        ? "bg-[#0F3D2E] text-white"
                        : "bg-stone-100 text-stone-700 hover:bg-stone-200"
                    }`}
                  >
                    {fLabel}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search customer or request #..."
                  className="pl-8 pr-3 py-1.5 border border-stone-200 rounded-xl w-56 bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                />
              </div>
            </div>

            {/* Customer Cards Grid OR Selected Customer Detail */}
            {!activeCustomerCard ? (
              customerCards.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center text-xs text-stone-500">
                  No customer orders match this filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {customerCards.map((card) => (
                    <button
                      key={card.customer.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(card.customer.id)}
                      className={`text-left bg-white border rounded-2xl p-4 space-y-3 transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${
                        card.pendingCount > 0
                          ? "border-amber-300/90 ring-1 ring-amber-200/50"
                          : "border-stone-200/90 hover:border-[#0F3D2E]/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          {card.customer.profilePhotoUrl ? (
                            <img
                              src={card.customer.profilePhotoUrl}
                              alt={card.customer.name}
                              className="w-11 h-11 rounded-full object-cover border border-[#9E7C42]/40 shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-[#0F3D2E] text-white font-serif font-semibold text-base flex items-center justify-center shrink-0">
                              {card.customer.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-stone-900 truncate">
                              {card.customer.name}
                            </div>
                            <div className="text-[11px] font-mono text-stone-500 truncate">
                              {card.customer.customerCode}
                              {card.customer.phone ? ` • ${card.customer.phone}` : ""}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-stone-400 shrink-0 mt-1" />
                      </div>

                      {/* Order Photo Strip */}
                      {card.photos.length > 0 && (
                        <div className="flex gap-2">
                          {card.photos.map((src, i) => (
                            <img
                              key={`${src}-${i}`}
                              src={src}
                              alt="Order item"
                              className="w-14 h-14 rounded-xl object-cover border border-stone-200 bg-stone-50"
                            />
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 text-[11px] pt-0.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-800 font-semibold">
                          {card.requests.length} Orders
                        </span>
                        {card.pendingCount > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold">
                            {card.pendingCount} Pending
                          </span>
                        )}
                        {card.approvedCount > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-[#0F3D2E] font-semibold">
                            {card.approvedCount} Approved
                          </span>
                        )}
                        {card.todayCount > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                            {card.todayCount} Today
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between bg-white border border-stone-200/90 rounded-2xl px-4 py-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomerId(null)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      All Customers
                    </button>
                    <div className="flex items-center gap-2.5">
                      {activeCustomerCard.customer.profilePhotoUrl ? (
                        <img
                          src={activeCustomerCard.customer.profilePhotoUrl}
                          alt={activeCustomerCard.customer.name}
                          className="w-9 h-9 rounded-full object-cover border border-[#9E7C42]/40 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[#0F3D2E] text-white font-serif font-semibold text-xs flex items-center justify-center shrink-0">
                          {activeCustomerCard.customer.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="font-bold text-sm text-stone-900">
                          {activeCustomerCard.customer.name}
                        </span>
                        <span className="ml-2 text-xs font-mono text-stone-500">
                          ({activeCustomerCard.customer.customerCode})
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-stone-100 text-xs font-semibold text-stone-700">
                    {activeCustomerCard.requests.length} order(s)
                  </span>
                </div>

                {activeCustomerCard.requests.map((r) => {
                  const statusMap: Record<string, [string, string]> = {
                    AWAITING_APPROVAL: ["Pending Approval", "bg-amber-50 text-amber-800 border-amber-200"],
                    MORE_DETAILS_NEEDED: ["Need Info", "bg-orange-50 text-orange-800 border-orange-200"],
                    APPROVED: ["Approved", "bg-emerald-50 text-[#0F3D2E] border-emerald-200"],
                    READY: ["Ready", "bg-emerald-100 text-[#0F3D2E] border-emerald-300"],
                    DELIVERED: ["Delivered", "bg-stone-100 text-stone-700 border-stone-200"],
                    DECLINED: ["Declined", "bg-red-50 text-red-700 border-red-200"],
                    CANCELLED: ["Cancelled", "bg-stone-100 text-stone-600 border-stone-300"],
                  };
                  const [statusLabel, statusTone] = statusMap[r.status] || [
                    r.status,
                    "bg-stone-100 text-stone-800 border-stone-200",
                  ];
                  return (
                  <div
                    key={r.id}
                    className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5 text-xs shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-sm text-stone-900">
                          {r.requestNumber}
                        </span>
                        <span className="text-stone-400 font-mono">
                          {r.submittedAt.slice(0, 10)}
                        </span>
                        {r.submittedByName && (
                          <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[10px] font-medium">
                            By {r.submittedByName}
                          </span>
                        )}
                        {r.hasPendingChangeReq && (
                          <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-full font-semibold text-[10px]">
                            Change Request
                          </span>
                        )}
                      </div>
                      <span className={`px-3 py-1 rounded-full border font-semibold ${statusTone}`}>
                        {statusLabel}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {r.items.map((it) => {
                        const photos = getItemPhotoUrls(it);
                        return (
                          <div
                            key={it.id}
                            className="p-3.5 bg-[#FAF9F6]/80 border border-stone-200/80 rounded-2xl flex flex-col sm:flex-row gap-3.5"
                          >
                            {/* Item Photo(s) */}
                            <div className="flex gap-2 shrink-0">
                              {photos.length > 0 ? (
                                photos.map((src, idx) => (
                                  <button
                                    key={`${src}-${idx}`}
                                    type="button"
                                    onClick={() => setPreviewImageUrl(src)}
                                    className="w-20 h-20 rounded-xl overflow-hidden border border-stone-200 bg-white cursor-pointer hover:opacity-90 shadow-2xs"
                                  >
                                    <img
                                      src={src}
                                      alt={it.designSnapshot?.name || "Item"}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ))
                              ) : (
                                <div className="w-20 h-20 rounded-xl border border-dashed border-stone-300 bg-white flex items-center justify-center text-[10px] text-stone-400">
                                  No Image
                                </div>
                              )}
                            </div>

                            {/* Item Details + Spec Pills + Voice */}
                            <div className="flex-1 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-sm text-stone-900">
                                    {it.designSnapshot?.name || "Jewellery Item"}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-stone-200/70 text-stone-700 font-mono text-[10px] font-semibold">
                                    {it.designSnapshot?.code === "CUSTOM" ? "Custom" : it.designSnapshot?.code}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-[#0F3D2E]/10 text-[#0F3D2E] font-mono text-[10px] font-bold">
                                    × {it.quantity} pc
                                  </span>
                                </div>
                                <span className="text-[11px] text-stone-500 font-mono">
                                  Bags Linked: {it.linkedBagQuantity}/{it.quantity}
                                </span>
                              </div>

                              <div className="flex flex-wrap gap-1.5 text-[11px]">
                                {it.purityLabelSnapshot && (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-50 border border-[#9E7C42]/30 text-[#7D5E2A] font-semibold">
                                    {it.purityLabelSnapshot}
                                  </span>
                                )}
                                {it.size && (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-white border border-stone-200 text-stone-700 font-mono">
                                    Size {it.size}
                                  </span>
                                )}
                                {it.targetWeight && (
                                  <span className="px-2.5 py-0.5 rounded-lg bg-white border border-stone-200 text-stone-700 font-mono">
                                    {it.targetWeight}g
                                  </span>
                                )}
                              </div>

                              {it.textInstructions && (
                                <div className="text-stone-700 bg-white px-3 py-1.5 rounded-xl border border-stone-200/70">
                                  <strong>Note:</strong> {it.textInstructions}
                                </div>
                              )}
                              {it.requestedChanges && (
                                <div className="text-stone-700 bg-white px-3 py-1.5 rounded-xl border border-stone-200/70">
                                  <strong>Changes:</strong> {it.requestedChanges}
                                </div>
                              )}
                              {it.bagLinks.length > 0 && (
                                <div className="text-[#0F3D2E] font-mono font-semibold">
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
                      {(r.status === "APPROVED" ||
                        r.status === "READY" ||
                        r.hasPendingChangeReq) && (
                        <button
                          type="button"
                          disabled={busyReqId === r.id}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Cancel order ${r.requestNumber}?`
                              )
                            ) {
                              void reviewRequest(r.id, "CANCEL_ORDER");
                            }
                          }}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded font-semibold cursor-pointer"
                        >
                          Cancel Order
                        </button>
                      )}
                    </div>
                  </div>
                );
                })}
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
          <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 space-y-4 text-xs shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
              <div>
                <h2 className="font-serif font-semibold text-base text-[#0F3D2E]">
                  Registered App Customers ({data.appCustomers?.length || 0})
                </h2>
                <p className="text-[11px] text-stone-500">
                  Customers who have signed up or accepted an invite to use the AM Jewellery App.
                </p>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={customerDirSearch}
                  onChange={(e) => setCustomerDirSearch(e.target.value)}
                  placeholder="Search name, phone, city..."
                  className="pl-8 pr-3 py-1.5 border border-stone-200 rounded-xl w-56 bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                />
              </div>
            </div>
            {(data.appCustomers || []).length === 0 ? (
              <div className="p-8 text-center text-stone-500">
                No customers have registered on the app yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(data.appCustomers || [])
                  .filter((c) => {
                    const q = customerDirSearch.trim().toLowerCase();
                    if (!q) return true;
                    return `${c.name} ${c.loginName || ""} ${c.customerCode} ${c.phone || ""} ${c.loginEmail || c.email || ""} ${c.address || ""}`
                      .toLowerCase()
                      .includes(q);
                  })
                  .map((c) => (
                  <div
                    key={c.userId}
                    className="p-3.5 border border-stone-200/90 rounded-2xl bg-[#FAF9F6]/60 flex items-start gap-3"
                  >
                    {c.profilePhotoUrl ? (
                      <img
                        src={c.profilePhotoUrl}
                        alt={c.loginName || c.name}
                        className="w-11 h-11 rounded-full object-cover border border-[#9E7C42]/40 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-[#0F3D2E] text-white font-serif font-semibold text-sm flex items-center justify-center shrink-0">
                        {(c.loginName || c.name).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-bold text-stone-900 truncate">
                        {c.loginName || c.name}
                      </div>
                      {c.loginName && c.loginName !== c.name && (
                        <div className="text-[11px] font-medium text-[#0F3D2E] truncate">
                          Showroom: {c.name}
                        </div>
                      )}
                      <div className="font-mono text-[11px] text-stone-500 truncate">
                        {c.customerCode} • {c.loginEmail || c.email}
                      </div>
                      {c.phone && (
                        <div className="font-mono text-[11px] text-stone-400 truncate">
                          {c.phone}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-[#0F3D2E] font-semibold">
                          {c.orderCount} Orders
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            c.canViewBills === false
                              ? "bg-amber-50 text-amber-900 border-amber-200"
                              : "bg-stone-100 text-stone-700 border-stone-200"
                          }`}
                        >
                          {c.canViewBills === false ? "Order Staff Only" : "Bills: ON"}
                        </span>
                        <span className="text-stone-400 font-mono">
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
          <div className="space-y-4">
            <div id="create-single-invite-box" className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 space-y-3 text-xs shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-stone-900 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-[#0F3D2E]" />
                  Create Customer / Staff Invite
                </div>
                <span className="text-[11px] text-stone-500">
                  Multiple staff logins can link to the same showroom — zero double-counting.
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as "CUSTOMER" | "CAD_DESIGNER")
                  }
                  className="px-2.5 py-2 border border-stone-200 rounded-xl bg-white"
                >
                  <option value="CUSTOMER">Customer / Showroom Staff</option>
                  <option value="CAD_DESIGNER">CAD Designer</option>
                </select>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Person / Staff Name (e.g. Ramesh)"
                  className="px-2.5 py-2 border border-stone-200 rounded-xl"
                />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Login Email (unique per person)"
                  className="px-2.5 py-2 border border-stone-200 rounded-xl"
                />
                {inviteRole === "CUSTOMER" && (
                  <select
                    value={inviteCustomerId}
                    onChange={(e) => setInviteCustomerId(e.target.value)}
                    className="px-2.5 py-2 border border-stone-200 rounded-xl bg-white"
                  >
                    <option value="">-- Link to Showroom / Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.customerCode})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {inviteRole === "CUSTOMER" && (
                <label className="inline-flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!inviteCanViewBills}
                    onChange={(e) => setInviteCanViewBills(!e.target.checked)}
                    className="rounded border-stone-300"
                  />
                  <span>
                    <strong>Order Staff Only</strong> (Hide Bills &amp; Balance — staff can place &amp; track orders only)
                  </span>
                </label>
              )}
              <div>
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
                      canViewBills:
                        inviteRole === "CUSTOMER" ? inviteCanViewBills : true,
                    }),
                  });
                  const d = await res.json();
                  if (!res.ok || !d.ok) {
                    setError(d.error || "Failed to create invite");
                    return;
                  }
                  const full =
                    typeof window !== "undefined"
                      ? `${window.location.origin}${d.invitePath}`
                      : d.invitePath;
                  setCreatedInviteUrl(full);
                  await reloadInvites();
                }}
                className="px-4 py-2 bg-[#0F3D2E] hover:bg-[#14533E] text-white rounded-xl font-semibold cursor-pointer"
              >
                Generate Invite Link
              </button>
              </div>
              {createdInviteUrl && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl font-mono break-all">
                  Invite Link: <strong>{createdInviteUrl}</strong>
                </div>
              )}
            </div>

            {/* Bulk Customer Invites (Private Per-Customer Links) */}
            <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5 text-xs shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
                <div>
                  <h2 className="font-serif font-semibold text-base text-[#0F3D2E]">
                    Bulk Customer Invites ({customers.length} Customers)
                  </h2>
                  <p className="text-[11px] text-stone-500">
                    Generates a private, unique link for each customer. Send directly on WhatsApp so each customer receives only their own link.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={bulkInviting}
                  onClick={async () => {
                    setBulkInviting(true);
                    setError(null);
                    try {
                      const res = await fetch("/api/invitations", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "BULK_CREATE_CUSTOMER_INVITES" }),
                      });
                      const d = await res.json();
                      if (!res.ok || !d.ok) {
                        setError(d.error || "Bulk invite failed");
                      } else {
                        setMessage(`Generated ${d.createdCount} private customer invite link(s).`);
                        await reloadInvites();
                      }
                    } finally {
                      setBulkInviting(false);
                    }
                  }}
                  className="px-4 py-2 bg-[#0F3D2E] hover:bg-[#14533E] disabled:opacity-50 text-white rounded-xl font-semibold cursor-pointer"
                >
                  {bulkInviting ? "Generating..." : "Generate Links for All Uninvited"}
                </button>
              </div>

              <div className="relative max-w-xs">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  placeholder="Search customer name, code, phone..."
                  className="pl-8 pr-3 py-1.5 border border-stone-200 rounded-xl w-full bg-stone-50/50 focus:bg-white focus:outline-none focus:border-[#0F3D2E]"
                />
              </div>

              <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden max-h-[460px] overflow-y-auto">
                {customers
                  .filter((c) => {
                    const q = inviteSearch.trim().toLowerCase();
                    if (!q) return true;
                    return `${c.name} ${c.customerCode} ${c.phone || ""}`.toLowerCase().includes(q);
                  })
                  .map((c) => {
                    const customerLogins = linkedCustomerUsers.filter(
                      (u) => u.customerId === c.id
                    );
                    const isLinked = customerLogins.length > 0 || linkedCustomerIds.includes(c.id);
                    const pending = invitations.find(
                      (i) =>
                        i.customerId === c.id &&
                        i.role === "CUSTOMER" &&
                        !i.acceptedAt &&
                        new Date(i.expiresAt).getTime() > Date.now()
                    );
                    const origin =
                      typeof window !== "undefined" ? window.location.origin : "";
                    const inviteUrl = pending ? `${origin}/invite/${pending.token}` : "";
                    const waDigits = (c.phone || "").replace(/\D/g, "");
                    const waPhone =
                      waDigits.length === 10 ? `91${waDigits}` : waDigits;
                    const waText = encodeURIComponent(
                      `Hello ${c.name}, welcome to AM Jewellery! Tap your personal link to set your password and place orders directly: ${inviteUrl}`
                    );
                    return (
                      <div
                        key={c.id}
                        className="p-3 flex flex-wrap items-center justify-between gap-2 hover:bg-stone-50/60"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-stone-900">
                            {c.name}{" "}
                            <span className="font-mono text-[11px] text-stone-400">
                              ({c.customerCode})
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-stone-500">
                            {c.phone || "No phone"}
                          </div>
                          {customerLogins.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {customerLogins.map((u) => (
                                <button
                                  key={u.id}
                                  type="button"
                                  title="Click to toggle Bills visibility for this login"
                                  onClick={async () => {
                                    await fetch("/api/invitations", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        action: "TOGGLE_BILL_ACCESS",
                                        userId: u.id,
                                        canViewBills: !u.canViewBills,
                                      }),
                                    });
                                    await reloadInvites();
                                  }}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium border cursor-pointer ${
                                    u.canViewBills
                                      ? "bg-emerald-50 border-emerald-200 text-[#0F3D2E]"
                                      : "bg-amber-50 border-amber-200 text-amber-900"
                                  }`}
                                >
                                  {u.name} ({u.email}) • {u.canViewBills ? "Bills: ON" : "Order Only"}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setInviteRole("CUSTOMER");
                              setInviteCustomerId(c.id);
                              setInviteName("");
                              setInviteEmail("");
                              setInviteCanViewBills(false);
                              setCreatedInviteUrl(null);
                              document
                                .getElementById("create-single-invite-box")
                                ?.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="px-2.5 py-1 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-700 font-semibold text-[11px] cursor-pointer"
                          >
                            + Add Staff Login
                          </button>
                          {isLinked ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[#0F3D2E] font-semibold">
                              {customerLogins.length > 1
                                ? `${customerLogins.length} Logins Active`
                                : "Active on App"}
                            </span>
                          ) : pending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(inviteUrl);
                                  setCopiedToken(pending.token);
                                  setTimeout(() => setCopiedToken(null), 2000);
                                }}
                                className="px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 font-medium cursor-pointer"
                              >
                                {copiedToken === pending.token ? "Copied!" : "Copy Link"}
                              </button>
                              {waPhone && (
                                <a
                                  href={`https://wa.me/${waPhone}?text=${waText}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 rounded-lg bg-[#0F3D2E] hover:bg-[#14533E] text-white font-semibold"
                                >
                                  Send on WhatsApp
                                </a>
                              )}
                            </>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-500">
                              Not Invited
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
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
