"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, AppShellUser } from "@/components/AppShell";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  PlusCircle,
  Users,
  Coins,
  Scale,
} from "lucide-react";
import {
  fetchActorCached,
  fetchCachedJson,
  getCachedActor,
  getCachedJson,
} from "@/lib/client-cache";
import type {
  AdminMakingChargeSummary,
  MakingChargeFilter,
} from "@/lib/admin-making-charge";
import { formatWeight3 } from "@/lib/decimal";

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
  const cachedDash = getCachedJson<{
    summary: DashboardSummary;
    adminMakingCharge?: AdminMakingChargeSummary | null;
  }>("/api/dashboard");
  const [user, setUser] = useState<AppShellUser | null>(() => getCachedActor());
  const [summary, setSummary] = useState<DashboardSummary | null>(
    () => cachedDash?.summary || null
  );
  const [adminMakingCharge, setAdminMakingCharge] =
    useState<AdminMakingChargeSummary | null>(
      () => cachedDash?.adminMakingCharge || null
    );
  const [makingFilter, setMakingFilter] = useState<MakingChargeFilter>("today");
  const [makingMonth, setMakingMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [makingFrom, setMakingFrom] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [makingTo, setMakingTo] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [showMakingBills, setShowMakingBills] = useState(false);
  const [loading, setLoading] = useState(!cachedDash?.summary);
  const [error, setError] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<"A" | "B" | "C" | null>("A");
  const [showBreakdown, setShowBreakdown] = useState(false);

  const buildDashboardUrl = (
    filter: MakingChargeFilter,
    month: string,
    from: string,
    to: string
  ) => {
    const qs = new URLSearchParams({ makingFilter: filter });
    if (filter === "month" && month) qs.set("month", month);
    if (filter === "range") {
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
    }
    return `/api/dashboard?${qs.toString()}`;
  };

  const loadData = async (
    force = false,
    override?: {
      filter?: MakingChargeFilter;
      month?: string;
      from?: string;
      to?: string;
    }
  ) => {
    const activeFilter = override?.filter ?? makingFilter;
    const activeMonth = override?.month ?? makingMonth;
    const activeFrom = override?.from ?? makingFrom;
    const activeTo = override?.to ?? makingTo;
    const dashUrl = buildDashboardUrl(
      activeFilter,
      activeMonth,
      activeFrom,
      activeTo
    );

    if (!summary || force) setLoading(true);
    setError(null);
    try {
      const [actor, d] = await Promise.all([
        fetchActorCached(force),
        fetchCachedJson<{
          summary: DashboardSummary;
          adminMakingCharge?: AdminMakingChargeSummary | null;
          error?: string;
        }>(dashUrl, { force: force || activeFilter !== "today" }),
      ]);
      if (actor) setUser(actor);
      if (d.error) throw new Error(d.error);
      setSummary(d.summary);
      if (d.adminMakingCharge !== undefined) {
        setAdminMakingCharge(d.adminMakingCharge);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load home summary");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) {
    return (
      <div className="p-6 text-xs text-slate-500">
        Loading workshop home...
      </div>
    );
  }

  return (
    <AppShell actor={user}>
      <div className="space-y-4">
        {/* Header + Quick Shortcuts */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Workshop Home</h1>
            <p className="text-xs text-slate-500">
              All gold balances shown in fine gold equivalent (g fine).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData(true)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* 4 Useful Everyday Shortcuts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Link
            href="/orders/new"
            className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-900 hover:bg-blue-100 transition-colors"
          >
            <PlusCircle className="h-4 w-4 text-blue-700 shrink-0" />
            <span>New Order</span>
          </Link>
          <Link
            href="/directory?tab=customers"
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors"
          >
            <Users className="h-4 w-4 text-emerald-700 shrink-0" />
            <span>Receive Customer Gold</span>
          </Link>
          <Link
            href="/recovery"
            className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
          >
            <Coins className="h-4 w-4 text-amber-700 shrink-0" />
            <span>Recover Karigar Gold</span>
          </Link>
          <Link
            href="/stock"
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <Scale className="h-4 w-4 text-slate-700 shrink-0" />
            <span>Add/Purchase Gold</span>
          </Link>
        </div>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading && !summary ? (
          <div className="rounded border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
            Loading workshop gold balances...
          </div>
        ) : summary ? (
          <>
            {/* Admin Internal Making Charge Card */}
            {user.role === "OWNER_ADMIN" && adminMakingCharge && (
              <div className="rounded-lg border border-amber-300 bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-amber-800">
                      Total Making Charge (Admin Internal)
                    </div>
                    <div className="mt-1 flex items-baseline gap-2.5">
                      <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                        ₹
                        {Number(adminMakingCharge.totalRupees).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-xs font-medium text-slate-600">
                        ({adminMakingCharge.billCount}{" "}
                        {adminMakingCharge.billCount === 1 ? "bill" : "bills"} •{" "}
                        {adminMakingCharge.fromDate === adminMakingCharge.toDate
                          ? adminMakingCharge.fromDate
                          : `${adminMakingCharge.fromDate} to ${adminMakingCharge.toDate}`}
                        )
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        ["today", "Today"],
                        ["month", "Monthly"],
                        ["range", "Date Range"],
                      ] as const
                    ).map(([fId, fLabel]) => (
                      <button
                        key={fId}
                        type="button"
                        onClick={() => {
                          setMakingFilter(fId);
                          void loadData(true, { filter: fId });
                        }}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-xs border cursor-pointer ${
                          makingFilter === fId
                            ? "bg-amber-600 text-white border-amber-600"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {fLabel}
                      </button>
                    ))}

                    {makingFilter === "month" && (
                      <input
                        type="month"
                        value={makingMonth}
                        onChange={(e) => {
                          const nextMonth = e.target.value;
                          setMakingMonth(nextMonth);
                          void loadData(true, {
                            filter: "month",
                            month: nextMonth,
                          });
                        }}
                        className="px-2 py-1 text-xs border border-slate-300 rounded-xs bg-white font-mono"
                      />
                    )}

                    {makingFilter === "range" && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={makingFrom}
                          onChange={(e) => {
                            const nextFrom = e.target.value;
                            setMakingFrom(nextFrom);
                            void loadData(true, {
                              filter: "range",
                              from: nextFrom,
                              to: makingTo,
                            });
                          }}
                          className="px-2 py-1 text-xs border border-slate-300 rounded-xs bg-white font-mono"
                        />
                        <span className="text-xs text-slate-500">to</span>
                        <input
                          type="date"
                          value={makingTo}
                          onChange={(e) => {
                            const nextTo = e.target.value;
                            setMakingTo(nextTo);
                            void loadData(true, {
                              filter: "range",
                              from: makingFrom,
                              to: nextTo,
                            });
                          }}
                          className="px-2 py-1 text-xs border border-slate-300 rounded-xs bg-white font-mono"
                        />
                      </div>
                    )}

                    {adminMakingCharge.bills.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowMakingBills((v) => !v)}
                        className="px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xs hover:bg-amber-100 cursor-pointer"
                      >
                        {showMakingBills ? "Hide Bills" : "View Bills"}
                      </button>
                    )}
                  </div>
                </div>

                {showMakingBills && adminMakingCharge.bills.length > 0 && (
                  <div className="border-t border-amber-100 pt-2 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                          <th className="py-1">Bill #</th>
                          <th className="py-1">Date</th>
                          <th className="py-1 text-right">Making Charge (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminMakingCharge.bills.map((b) => (
                          <tr key={b.billId} className="border-b border-slate-100">
                            <td className="py-1 font-mono font-semibold text-slate-900">
                              {b.billNumber}
                            </td>
                            <td className="py-1 font-mono text-slate-600">
                              {b.billDate}
                            </td>
                            <td className="py-1 text-right font-mono font-semibold text-emerald-700">
                              ₹
                              {b.amountRupees.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 3 Main Balance Cards */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* 1. Gold Available with Admin */}
              <div className="rounded-lg border border-emerald-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenCard(openCard === "A" ? null : "A")}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-emerald-50/40 cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                      Gold Available with Admin
                    </div>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                      {formatWeight3(summary.groupA_adminStock.totalFine)} g fine
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      {formatWeight3(summary.groupA_adminStock.mixedPhysical)} g mixed physical on hand
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
                              {formatWeight3(p.physicalWeight)} g
                            </td>
                            <td className="py-1 text-right tabular-nums font-semibold">
                              {formatWeight3(p.fineWeight)} g
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-2 text-right">
                      <Link
                        href="/stock"
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        View Gold Stock →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Gold Due from Customers */}
              <div className="rounded-lg border border-blue-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenCard(openCard === "B" ? null : "B")}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-blue-50/40 cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-blue-800">
                      Gold Due from Customers
                    </div>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                      {formatWeight3(summary.groupB_customerGoldOwed.totalFine)} g fine
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Across {summary.groupB_customerGoldOwed.openBillCount} unpaid bill(s)
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
                      <p className="text-slate-500">No unpaid customer gold dues.</p>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
                            <th className="py-1">Bill #</th>
                            <th className="py-1 text-right">Due (g fine)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.groupB_customerGoldOwed.items.map((b) => (
                            <tr key={b.billId} className="border-b border-slate-100">
                              <td className="py-1 font-medium">
                                <Link
                                  href={`/customers/${b.customerId}`}
                                  className="text-blue-700 hover:underline"
                                >
                                  {b.billNumber}
                                </Link>
                              </td>
                              <td className="py-1 text-right tabular-nums font-semibold">
                                {formatWeight3(b.outstandingFine)} g
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div className="mt-2 text-right">
                      <Link
                        href="/billing"
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        View Bills →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Gold in Production & Recovery */}
              <div className="rounded-lg border border-amber-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenCard(openCard === "C" ? null : "C")}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-amber-50/40 cursor-pointer"
                >
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-amber-800">
                      Gold in Production &amp; Recovery
                    </div>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                      {formatWeight3(summary.groupC_productionAndRecovery.totalFine)} g fine
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      With Karigars {formatWeight3(summary.groupC_productionAndRecovery.wipFine)} + Finished{" "}
                      {formatWeight3(summary.groupC_productionAndRecovery.finishedGoodsFine)} + Loss{" "}
                      {formatWeight3(summary.groupC_productionAndRecovery.outstandingLossFine)}
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
                        Work with karigars / between processes (
                        {formatWeight3(summary.groupC_productionAndRecovery.wipFine)} g fine)
                      </div>
                      {summary.groupC_productionAndRecovery.wipOrders.length === 0 ? (
                        <div className="text-slate-400">None</div>
                      ) : (
                        <ul className="mt-1 space-y-0.5">
                          {summary.groupC_productionAndRecovery.wipOrders.map((w) => (
                            <li key={w.orderId} className="flex justify-between">
                              <Link
                                href={`/production-register?order=${w.orderId}`}
                                className="text-blue-700 hover:underline"
                              >
                                Bag #{w.bagNumber} ({w.orderName})
                              </Link>
                              <span className="tabular-nums font-medium">
                                {formatWeight3(w.custodyFine)} g fine
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <div className="font-semibold text-slate-700">
                        Finished jewellery waiting for delivery (
                        {formatWeight3(summary.groupC_productionAndRecovery.finishedGoodsFine)} g fine)
                      </div>
                      {summary.groupC_productionAndRecovery.finishedGoodsOrders.length === 0 ? (
                        <div className="text-slate-400">None</div>
                      ) : (
                        <ul className="mt-1 space-y-0.5">
                          {summary.groupC_productionAndRecovery.finishedGoodsOrders.map(
                            (fg) => (
                              <li key={fg.orderId} className="flex justify-between">
                                <Link
                                  href={`/production-register?order=${fg.orderId}`}
                                  className="text-blue-700 hover:underline"
                                >
                                  Bag #{fg.bagNumber} ({fg.orderName})
                                </Link>
                                <span className="tabular-nums font-medium">
                                  {formatWeight3(fg.netWeight)} g net
                                </span>
                              </li>
                            )
                          )}
                        </ul>
                      )}
                    </div>

                    <div>
                      <div className="font-semibold text-slate-700">
                        Loss remaining to recover (
                        {formatWeight3(summary.groupC_productionAndRecovery.outstandingLossFine)} g fine)
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
                                  {formatWeight3(l.outstandingFine)} g fine
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
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        View Orders →
                      </Link>
                      <Link
                        href="/recovery"
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        Recover Karigar Gold →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Total Accounted Gold + Expandable Physical/Advance/Net Breakdown */}
            <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-900">
                    Total Accounted Gold
                  </div>
                  <div className="mt-0.5 text-2xl font-bold tabular-nums text-amber-950">
                    {formatWeight3(summary.totals.totalAccountedGoldFine)} g fine
                  </div>
                  <p className="mt-0.5 text-xs text-amber-900">
                    Sum of gold with Admin ({formatWeight3(summary.groupA_adminStock.totalFine)}g) + gold due from customers ({formatWeight3(summary.groupB_customerGoldOwed.totalFine)}g) + gold in orders &amp; karigar recovery ({formatWeight3(summary.groupC_productionAndRecovery.totalFine)}g).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBreakdown((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 cursor-pointer"
                >
                  {showBreakdown ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <span>Physical Gold, Credits &amp; Net Position</span>
                </button>
              </div>

              {showBreakdown && (
                <div className="grid grid-cols-1 gap-3 pt-2 border-t border-amber-200 md:grid-cols-3">
                  <div className="rounded border border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-600">
                      Physical Gold On Hand
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                      {formatWeight3(summary.totals.physicalGoldFine)} g fine
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                      {formatWeight3(summary.totals.physicalGoldMixed)} g mixed physical (Admin + With Karigars + Finished)
                    </div>
                  </div>

                  <div className="rounded border border-slate-200 bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-600">
                      Customer Advances &amp; Return Obligations
                    </div>
                    <div className="mt-1 text-xs text-slate-700 tabular-nums">
                      Unused Customer Advances:{" "}
                      <span className="font-semibold text-blue-700">
                        {formatWeight3(summary.totals.unusedCustomerGoldCredits)} g fine
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-700 tabular-nums">
                      Karigar Return Obligations:{" "}
                      <span className="font-semibold text-indigo-700">
                        {formatWeight3(summary.totals.karigarReturnObligations)} g fine
                      </span>
                    </div>
                  </div>

                  <div className="rounded border border-emerald-300 bg-emerald-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-emerald-800">
                      Net Tracked Gold Position
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-emerald-950">
                      {formatWeight3(summary.totals.netTrackedGoldPosition)} g fine
                    </div>
                    <div className="mt-0.5 text-[11px] text-emerald-800">
                      Total Accounted Gold minus unused customer advances &amp; obligations
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
