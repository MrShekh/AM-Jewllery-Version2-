"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell, AppShellUser } from "@/components/AppShell";
import { PROCESS_DISPLAY_LABELS, ProcessType } from "@/lib/domain/types";
import { fetchActorCached, getCachedActor } from "@/lib/client-cache";

interface KarigarProfileResponse {
  ok: boolean;
  karigar: {
    id: string;
    karigarCode: string;
    name: string;
    phone: string | null;
    specializationNotes: string | null;
    isActive: boolean;
    capabilities: ProcessType[];
    defaultForProcesses: ProcessType[];
  };
  summary: {
    totalOrders: number;
    activeOrders: number;
    totalRawLossWeight: string;
    totalFineLossWeight: string;
    currentCustodyWeight: string;
    pendingRecoverableFine: string;
    recoveredFineWeight: string;
    writtenOffFineWeight: string;
    makingDeductedFineWeight: string;
    unallocatedAdvanceFine: string;
  };
  karatWiseLoss: Array<{
    purityId: string;
    karatLabel: string;
    displayLabel: string;
    touchPercent: string;
    orderCount: number;
    rawLossWeight: string;
    fineLossWeight: string;
  }>;
  orders: Array<{
    orderProcessId: string;
    orderId: string;
    bagNumber: string;
    orderName: string;
    customerId: string;
    customerName: string;
    purityLabel: string;
    karatLabel: string;
    orderStatus: string;
    processType: ProcessType;
    processStatus: string;
    custodyWeight: string;
    rawLossWeight: string;
    fineLossWeight: string;
    updatedAt: string;
  }>;
  recovery: {
    eligibleLosses: Array<{
      id: string;
      bagNumber: string;
      orderName: string;
      processType: ProcessType;
      purityDisplay: string;
      businessDate: string;
      rawMetalLossWeight: string;
      fineEquivalentLossWeight: string;
      recoveredFineWeight: string;
      writtenOffFineWeight: string;
      makingDeductedFineWeight: string;
      remainingPendingFineWeight: string;
      settlementStatus: string;
    }>;
    receipts: Array<{
      id: string;
      receiptNumber: string;
      businessDate: string;
      receiptMode: string;
      totalPhysicalWeight: string;
      totalFineWeight: string;
      allocatedFineWeight: string;
      unallocatedFineWeight: string;
      status: string;
    }>;
  };
  error?: string;
}

export default function KarigarProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const karigarId = params?.id;

  const [actor, setActor] = useState<AppShellUser | null>(() => getCachedActor());
  const [profile, setProfile] = useState<KarigarProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!karigarId) return;
    setLoading(true);
    setError(null);
    try {
      const resolvedActor = await fetchActorCached();
      if (!resolvedActor) {
        router.push(`/login?redirect=/karigars/${karigarId}`);
        return;
      }
      setActor(resolvedActor);

      const res = await fetch(
        `/api/karigars?karigarId=${encodeURIComponent(karigarId)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as KarigarProfileResponse;
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to load karigar profile");
      } else {
        setProfile(data);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load karigar profile"
      );
    } finally {
      setLoading(false);
    }
  }, [karigarId, router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (!actor) {
    return <div className="p-6 text-xs text-slate-600">Loading karigar profile...</div>;
  }

  return (
    <AppShell actor={actor}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/directory?tab=karigars"
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                &larr; Karigars
              </Link>
              <span className="text-slate-300">/</span>
              <h1 className="text-base font-bold text-slate-900">
                {profile?.karigar.name || "Karigar Profile"}
              </h1>
              {profile?.karigar.karigarCode && (
                <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-blue-50 text-blue-800 border border-blue-200 rounded-xs">
                  {profile.karigar.karigarCode}
                </span>
              )}
              {profile && (
                <span
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded-xs border ${
                    profile.karigar.isActive
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-slate-100 text-slate-600 border-slate-300"
                  }`}
                >
                  {profile.karigar.isActive ? "Active" : "Inactive"}
                </span>
              )}
            </div>
            {profile && (
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>Phone: {profile.karigar.phone || "-"}</span>
                <span>•</span>
                <div className="flex flex-wrap items-center gap-1">
                  <span>Capabilities:</span>
                  {profile.karigar.capabilities.map((cap) => {
                    const isDef = profile.karigar.defaultForProcesses.includes(cap);
                    return (
                      <span
                        key={cap}
                        className={`px-1.5 py-0.5 text-[10px] font-medium border rounded-xs ${
                          isDef
                            ? "bg-amber-50 border-amber-300 text-amber-900"
                            : "bg-slate-100 border-slate-300 text-slate-700"
                        }`}
                      >
                        {PROCESS_DISPLAY_LABELS[cap]}
                        {isDef ? " ★" : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {profile && (
            <div className="flex items-center gap-2">
              <Link
                href={`/recovery?karigarId=${profile.karigar.id}`}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xs"
              >
                Open Recovery &amp; Settlement
              </Link>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xs">
            {error}
          </div>
        )}

        {loading && !profile ? (
          <div className="p-6 bg-white border border-slate-200 rounded-xs text-xs text-slate-500">
            Loading karigar orders, loss breakdown, and recovery ledger...
          </div>
        ) : profile ? (
          <>
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white border border-slate-200 rounded-xs p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Total Orders
                </div>
                <div className="mt-1 text-xl font-bold font-mono text-slate-900">
                  {profile.summary.totalOrders}
                </div>
                <div className="text-[11px] text-blue-700 font-medium mt-0.5">
                  {profile.summary.activeOrders} active in-hand
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xs p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Total Order Loss
                </div>
                <div className="mt-1 text-xl font-bold font-mono text-rose-700">
                  {profile.summary.totalRawLossWeight} g
                </div>
                <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                  Fine eq: {profile.summary.totalFineLossWeight} g
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xs p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Pending Recovery (Fine)
                </div>
                <div className="mt-1 text-xl font-bold font-mono text-amber-700">
                  {profile.summary.pendingRecoverableFine} g
                </div>
                <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                  Advance: {profile.summary.unallocatedAdvanceFine} g
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xs p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Recovered / Settled (Fine)
                </div>
                <div className="mt-1 text-xl font-bold font-mono text-emerald-700">
                  {profile.summary.recoveredFineWeight} g
                </div>
                <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                  Write-off: {profile.summary.writtenOffFineWeight} g • Making:{" "}
                  {profile.summary.makingDeductedFineWeight} g
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xs p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Current Custody Gold
                </div>
                <div className="mt-1 text-xl font-bold font-mono text-slate-900">
                  {profile.summary.currentCustodyWeight} g
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Across open processes
                </div>
              </div>
            </div>

            {/* Karat-Wise Order Loss Breakdown */}
            <div className="bg-white border border-slate-200 rounded-xs p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
                Karat-Wise Order Loss Breakdown
              </h2>
              <div className="overflow-x-auto border border-slate-200 rounded-xs">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                      <th className="p-2 text-left font-semibold">Karat / Purity</th>
                      <th className="p-2 text-right font-semibold">Touch %</th>
                      <th className="p-2 text-right font-semibold">Total Orders</th>
                      <th className="p-2 text-right font-semibold">Raw Metal Loss (g)</th>
                      <th className="p-2 text-right font-semibold">Fine Equivalent Loss (g)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.karatWiseLoss.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-500">
                          No orders or process loss recorded for this karigar yet.
                        </td>
                      </tr>
                    ) : (
                      profile.karatWiseLoss.map((row) => (
                        <tr
                          key={row.purityId}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="p-2 font-semibold text-slate-900">
                            {row.displayLabel}
                          </td>
                          <td className="p-2 text-right font-mono text-slate-700">
                            {row.touchPercent}%
                          </td>
                          <td className="p-2 text-right font-mono font-semibold text-slate-900">
                            {row.orderCount}
                          </td>
                          <td className="p-2 text-right font-mono font-semibold text-rose-700">
                            {row.rawLossWeight} g
                          </td>
                          <td className="p-2 text-right font-mono font-semibold text-amber-800">
                            {row.fineLossWeight} g
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Orders & Process Work History */}
            <div className="bg-white border border-slate-200 rounded-xs p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
                Orders &amp; Process History ({profile.orders.length})
              </h2>
              <div className="overflow-x-auto border border-slate-200 rounded-xs">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                      <th className="p-2 text-left font-semibold">Bag #</th>
                      <th className="p-2 text-left font-semibold">Order Name</th>
                      <th className="p-2 text-left font-semibold">Customer</th>
                      <th className="p-2 text-left font-semibold">Karat</th>
                      <th className="p-2 text-left font-semibold">Process</th>
                      <th className="p-2 text-left font-semibold">Status</th>
                      <th className="p-2 text-right font-semibold">Custody (g)</th>
                      <th className="p-2 text-right font-semibold">Loss (g)</th>
                      <th className="p-2 text-right font-semibold">Fine Loss (g)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.orders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-4 text-center text-slate-500">
                          No orders assigned to this karigar yet.
                        </td>
                      </tr>
                    ) : (
                      profile.orders.map((o) => (
                        <tr
                          key={o.orderProcessId}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="p-2 font-mono font-bold text-blue-800">
                            <Link
                              href={`/production-register?order=${o.orderId}`}
                              className="hover:underline"
                            >
                              #{o.bagNumber}
                            </Link>
                          </td>
                          <td className="p-2 font-semibold text-slate-900">
                            {o.orderName}
                          </td>
                          <td className="p-2 text-slate-700">
                            <Link
                              href={`/customers/${o.customerId}`}
                              className="text-blue-700 hover:underline"
                            >
                              {o.customerName}
                            </Link>
                          </td>
                          <td className="p-2 text-slate-700">{o.purityLabel}</td>
                          <td className="p-2 font-medium text-slate-800">
                            {PROCESS_DISPLAY_LABELS[o.processType]}
                          </td>
                          <td className="p-2">
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 border border-slate-300 rounded-xs">
                              {o.processStatus}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono text-slate-700">
                            {o.custodyWeight}
                          </td>
                          <td className="p-2 text-right font-mono text-rose-700">
                            {o.rawLossWeight}
                          </td>
                          <td className="p-2 text-right font-mono font-semibold text-amber-800">
                            {o.fineLossWeight}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recovery & Loss Settlement Ledger */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xs p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-sm font-bold text-slate-900">
                    Loss Recovery Status ({profile.recovery.eligibleLosses.length})
                  </h2>
                  <Link
                    href={`/recovery?karigarId=${profile.karigar.id}`}
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Settle Loss &rarr;
                  </Link>
                </div>
                <div className="overflow-x-auto border border-slate-200 rounded-xs">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                        <th className="p-2 text-left font-semibold">Bag / Process</th>
                        <th className="p-2 text-right font-semibold">Fine Loss</th>
                        <th className="p-2 text-right font-semibold">Recovered</th>
                        <th className="p-2 text-right font-semibold">Pending</th>
                        <th className="p-2 text-left font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.recovery.eligibleLosses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-500">
                            No eligible loss records yet.
                          </td>
                        </tr>
                      ) : (
                        profile.recovery.eligibleLosses.map((l) => (
                          <tr
                            key={l.id}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="p-2">
                              <div className="font-mono font-bold text-slate-900">
                                #{l.bagNumber} • {l.orderName}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {PROCESS_DISPLAY_LABELS[l.processType]} ({l.purityDisplay})
                              </div>
                            </td>
                            <td className="p-2 text-right font-mono">
                              {l.fineEquivalentLossWeight} g
                            </td>
                            <td className="p-2 text-right font-mono text-emerald-700">
                              {l.recoveredFineWeight} g
                            </td>
                            <td className="p-2 text-right font-mono font-semibold text-amber-800">
                              {l.remainingPendingFineWeight} g
                            </td>
                            <td className="p-2">
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 border border-slate-300 rounded-xs">
                                {l.settlementStatus}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xs p-4 space-y-3">
                <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2">
                  Recovery Receipts ({profile.recovery.receipts.length})
                </h2>
                <div className="overflow-x-auto border border-slate-200 rounded-xs">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                        <th className="p-2 text-left font-semibold">Receipt #</th>
                        <th className="p-2 text-left font-semibold">Date</th>
                        <th className="p-2 text-right font-semibold">Physical (g)</th>
                        <th className="p-2 text-right font-semibold">Fine (g)</th>
                        <th className="p-2 text-right font-semibold">Unallocated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.recovery.receipts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-500">
                            No recovery receipts recorded yet.
                          </td>
                        </tr>
                      ) : (
                        profile.recovery.receipts.map((r) => (
                          <tr
                            key={r.id}
                            className="border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="p-2 font-mono font-semibold text-slate-900">
                              {r.receiptNumber}
                            </td>
                            <td className="p-2 text-slate-600">{r.businessDate}</td>
                            <td className="p-2 text-right font-mono">
                              {r.totalPhysicalWeight} g
                            </td>
                            <td className="p-2 text-right font-mono text-emerald-700 font-semibold">
                              {r.totalFineWeight} g
                            </td>
                            <td className="p-2 text-right font-mono text-amber-700">
                              {r.unallocatedFineWeight} g
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
