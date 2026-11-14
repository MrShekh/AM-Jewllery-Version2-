"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, AppShellUser } from "@/components/AppShell";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

interface DashboardSummary {
  groupA_adminStock: {
    totalFine: string;
    mixedPhysical: string;
    byPurity: Array<{
      purityId: string;
      displayLabel: string;
      touchPercent: string;
      physicalWeight: string;
      fineWeight: string;
    }>;
  };
  groupB_customerGoldOwed: {
    totalFine: string;
    openBillCount: number;
    items: Array<{
      billId: string;
      billNumber: string;
      customerId: string;
      outstandingFine: string;
    }>;
  };
  groupC_productionAndRecovery: {
    totalFine: string;
    wipPhysical: string;
    wipFine: string;
    wipOrders: Array<{
      orderId: string;
      bagNumber: string;
      orderName: string;
      custodyPhysical: string;
      custodyFine: string;
    }>;
    finishedGoodsPhysical: string;
    finishedGoodsFine: string;
    finishedGoodsOrders: Array<{
      orderId: string;
      bagNumber: string;
      orderName: string;
      netWeight: string;
    }>;
    outstandingLossFine: string;
    outstandingLosses: Array<{
      karigarId: string;
      karigarName: string;
      processType: string;
      outstandingFine: string;
    }>;
  };
  totals: {
    totalAccountedGoldFine: string;
    physicalGoldFine: string;
    physicalGoldMixed: string;
    unusedCustomerGoldCredits: string;
    karigarReturnObligations: string;
    netTrackedGoldPosition: string;
  };
}

export default function DashboardPage() {
  const [user, setUser] = useState<AppShellUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<"A" | "B" | "C" | null>("A");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, dashRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch("/api/dashboard", { cache: "no-store" }),
      ]);
      if (meRes.ok) {
        const me = await meRes.json();
        setUser(me.actor || me.user || null);
      }
      const d = await dashRes.json();
      if (!dashRes.ok) throw new Error(d.error || "Failed to load dashboard");
      setSummary(d.summary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (!user) {
    return (
      <div className="p-6 text-xs text-slate-500">
        Loading workshop dashboard...
      </div>
    );
  }

  return (
    <AppShell actor={user}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Total Stock &amp; Workshop Balance
            </h1>
            <p className="text-xs text-slate-500">
              All totals in fine gold equivalent (g fine); mixed-purity physical weights are labelled separately.
            </p>
          </div>
          <button
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading || !summary ? (
          <div className="rounded border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
            Loading workshop stock summary...
          </div>
        ) : (
          <>
            {/* Top Formula Strip */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  Total Accounted Gold (A + B + C)
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-amber-950">
                  {summary.totals.totalAccountedGoldFine} g fine
                </div>
                <div className="mt-0.5 text-[11px] text-amber-800">
                  Admin + Customer Owed + Production &amp; Loss
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Physical Gold On Hand
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {summary.totals.physicalGoldFine} g fine
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                  {summary.totals.physicalGoldMixed} g mixed physical (Admin + WIP + FG)
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Credits &amp; Return Obligations
                </div>
                <div className="mt-1 text-xs text-slate-700 tabular-nums">
                  Unused Customer Credits:{" "}
                  <span className="font-semibold text-blue-700">
                    {summary.totals.unusedCustomerGoldCredits} g fine
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-700 tabular-nums">
                  Karigar Return Obligations:{" "}
                  <span className="font-semibold text-indigo-700">
                    {summary.totals.karigarReturnObligations} g fine
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                  Net Tracked Gold Position
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-emerald-950">
                  {summary.totals.netTrackedGoldPosition} g fine
                </div>
                <div className="mt-0.5 text-[11px] text-emerald-800">
                  Accounted Gold minus unallocated credits/obligations
                </div>
              </div>
            </div>

            {/* 3 Main Groups: A, B, C */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Group A: Admin Stock */}
              <div className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenCard(openCard === "A" ? null : "A")}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                >
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      A. Admin Stock
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                      {summary.groupA_adminStock.totalFine} g fine
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      {summary.groupA_adminStock.mixedPhysical} g mixed physical
                    </div>
                  </div>
                  {openCard === "A" ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>
                {openCard === "A" && (
                  <div className="border-t border-slate-100 px-4 py-3 text-xs">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                          <th className="py-1">Touch</th>
                          <th className="py-1 text-right">Physical</th>
                          <th className="py-1 text-right">Fine Eq.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.groupA_adminStock.byPurity.map((p) => (
                          <tr key={p.purityId} className="border-b border-slate-100">
                            <td className="py-1 font-medium">{p.displayLabel}</td>
                            <td className="py-1 text-right tabular-nums">
                              {p.physicalWeight} g
                            </td>
                            <td className="py-1 text-right tabular-nums font-semibold">
                              {p.fineWeight} g
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-2 text-right">
                      <Link
                        href="/stock"
                        className="text-[11px] font-semibold text-amber-700 hover:underline"
                      >
                        Open Stock &amp; Journal →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Group B: Customer Gold Owed */}
              <div className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenCard(openCard === "B" ? null : "B")}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                >
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      B. Customer Gold Owed
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                      {summary.groupB_customerGoldOwed.totalFine} g fine
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {summary.groupB_customerGoldOwed.openBillCount} open posted bill(s)
                    </div>
                  </div>
                  {openCard === "B" ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>
                {openCard === "B" && (
                  <div className="border-t border-slate-100 px-4 py-3 text-xs">
                    {summary.groupB_customerGoldOwed.items.length === 0 ? (
                      <p className="text-slate-500">No outstanding customer bill gold.</p>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                            <th className="py-1">Bill #</th>
                            <th className="py-1 text-right">Outstanding Fine</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.groupB_customerGoldOwed.items.map((b) => (
                            <tr key={b.billId} className="border-b border-slate-100">
                              <td className="py-1 font-medium">{b.billNumber}</td>
                              <td className="py-1 text-right tabular-nums font-semibold">
                                {b.outstandingFine} g
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div className="mt-2 text-right">
                      <Link
                        href="/billing"
                        className="text-[11px] font-semibold text-amber-700 hover:underline"
                      >
                        Open Billing &amp; Settlement →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Group C: Production & Recovery Balance */}
              <div className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenCard(openCard === "C" ? null : "C")}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                >
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      C. Production &amp; Recovery Balance
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                      {summary.groupC_productionAndRecovery.totalFine} g fine
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      WIP {summary.groupC_productionAndRecovery.wipFine} + FG{" "}
                      {summary.groupC_productionAndRecovery.finishedGoodsFine} + Loss{" "}
                      {summary.groupC_productionAndRecovery.outstandingLossFine}
                    </div>
                  </div>
                  {openCard === "C" ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                </button>
                {openCard === "C" && (
                  <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-700">
                        Work In Progress ({summary.groupC_productionAndRecovery.wipFine} g fine)
                      </div>
                      {summary.groupC_productionAndRecovery.wipOrders.length === 0 ? (
                        <div className="text-slate-400">None</div>
                      ) : (
                        <ul className="mt-1 space-y-0.5">
                          {summary.groupC_productionAndRecovery.wipOrders.map((w) => (
                            <li key={w.orderId} className="flex justify-between">
                              <span>
                                Bag #{w.bagNumber} ({w.orderName})
                              </span>
                              <span className="tabular-nums font-medium">
                                {w.custodyFine} g fine
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <div className="font-semibold text-slate-700">
                        Finished Goods Awaiting Delivery (
                        {summary.groupC_productionAndRecovery.finishedGoodsFine} g fine)
                      </div>
                      {summary.groupC_productionAndRecovery.finishedGoodsOrders.length === 0 ? (
                        <div className="text-slate-400">None</div>
                      ) : (
                        <ul className="mt-1 space-y-0.5">
                          {summary.groupC_productionAndRecovery.finishedGoodsOrders.map(
                            (fg) => (
                              <li key={fg.orderId} className="flex justify-between">
                                <span>
                                  Bag #{fg.bagNumber} ({fg.orderName})
                                </span>
                                <span className="tabular-nums font-medium">
                                  {fg.netWeight} g net
                                </span>
                              </li>
                            )
                          )}
                        </ul>
                      )}
                    </div>

                    <div>
                      <div className="font-semibold text-slate-700">
                        Outstanding Process Losses (
                        {summary.groupC_productionAndRecovery.outstandingLossFine} g fine)
                      </div>
                      {summary.groupC_productionAndRecovery.outstandingLosses.length === 0 ? (
                        <div className="text-slate-400">None</div>
                      ) : (
                        <ul className="mt-1 space-y-0.5">
                          {summary.groupC_productionAndRecovery.outstandingLosses.map(
                            (l, idx) => (
                              <li key={idx} className="flex justify-between">
                                <span>
                                  {l.karigarName} — {l.processType}
                                </span>
                                <span className="tabular-nums font-medium text-red-700">
                                  {l.outstandingFine} g fine
                                </span>
                              </li>
                            )
                          )}
                        </ul>
                      )}
                    </div>

                    <div className="flex justify-between pt-1">
                      <Link
                        href="/production-register"
                        className="text-[11px] font-semibold text-amber-700 hover:underline"
                      >
                        Production Register →
                      </Link>
                      <Link
                        href="/recovery"
                        className="text-[11px] font-semibold text-amber-700 hover:underline"
                      >
                        Karigar Recovery →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
