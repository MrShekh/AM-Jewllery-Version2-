"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, AppShellUser } from "@/components/AppShell";
import { DailyReconciliationReport } from "@/lib/domain/erp-service";

export default function ReconciliationPage() {
  const router = useRouter();
  const [actor, setActor] = useState<AppShellUser | null>(null);
  const [report, setReport] = useState<DailyReconciliationReport | null>(null);

  const loadData = useCallback(async () => {
    const meRes = await fetch("/api/auth/me");
    if (meRes.status === 401) {
      router.push("/login?redirect=/reconciliation");
      return;
    }
    const meData = await meRes.json();
    setActor(meData.actor);

    const rRes = await fetch("/api/reconciliation");
    const rData = await rRes.json();
    if (rData.ok) {
      setReport(rData.report);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!actor || !report) {
    return (
      <div className="p-6 text-xs text-slate-600">
        Loading daily reconciliation...
      </div>
    );
  }

  return (
    <AppShell actor={actor}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              Daily Bullion & Process Mass Reconciliation
            </h1>
            <p className="text-xs text-slate-600">
              Reconciles cached stock balances against the append-only journal and verifies conservation of fine gold across Admin Stock, Karigar Custody, Finished Goods, and Process Loss.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/api/reconciliation?format=csv_register"
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xs hover:bg-slate-100"
            >
              Export Production Register (Safe CSV)
            </a>
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xs cursor-pointer"
            >
              Re-Verify Now
            </button>
          </div>
        </div>

        {/* Conservation Equation Summary Bar */}
        <div className="bg-white border border-slate-200 rounded-xs p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Global Fine-Equivalent Conservation Check
            </h2>
            <span
              className={`px-2 py-0.5 text-xs font-mono font-bold border rounded-xs ${
                report.totals.isBalanced
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-red-50 text-red-800 border-red-300"
              }`}
            >
              {report.totals.isBalanced
                ? "RECONCILED (0.000 g Discrepancy)"
                : `DISCREPANCY: ${report.totals.discrepancyFine} g`}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 font-mono tabular-nums text-xs">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xs">
              <div className="text-[10px] text-slate-500 font-sans">
                1. Total Net Stock Inflow
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {report.totals.totalStockInflowFine} g
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xs">
              <div className="text-[10px] text-slate-500 font-sans">
                2. Admin Available Fine
              </div>
              <div className="text-sm font-bold text-blue-800 mt-0.5">
                {report.totals.adminAvailableFine} g
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xs">
              <div className="text-[10px] text-slate-500 font-sans">
                3. Karigar Custody (WIP)
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {report.totals.karigarCustodyFine} g
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xs">
              <div className="text-[10px] text-slate-500 font-sans">
                4. Finished Goods Fine
              </div>
              <div className="text-sm font-bold text-emerald-800 mt-0.5">
                {report.totals.finishedGoodsFine} g
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xs">
              <div className="text-[10px] text-slate-500 font-sans">
                5. Process Loss (Pend + Elig)
              </div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {report.totals.totalProcessLossFine} g
              </div>
              <div className="text-[10px] text-slate-500">
                P: {report.totals.processLossPendingFine}g | E:{" "}
                {report.totals.processLossEligibleFine}g
              </div>
            </div>
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xs">
              <div className="text-[10px] text-blue-900 font-sans font-semibold">
                Sum Accounted (2+3+4+5)
              </div>
              <div className="text-sm font-bold text-blue-900 mt-0.5">
                {report.totals.totalAccountedFine} g
              </div>
            </div>
          </div>
        </div>

        {/* Purity-by-Purity Cached vs Journal Verification */}
        <div className="bg-white border border-slate-200 rounded-xs p-4 space-y-2">
          <h2 className="text-sm font-bold text-slate-900">
            Purity-by-Purity Cached Balance vs Append-Only Journal Verification
          </h2>
          <div className="overflow-x-auto border border-slate-200 rounded-xs">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <th className="p-2 text-left">Purity</th>
                  <th className="p-2 text-right">Touch %</th>
                  <th className="p-2 text-right">Cached Admin Physical</th>
                  <th className="p-2 text-right">Journal-Derived Physical</th>
                  <th className="p-2 text-right">Cached Admin Fine</th>
                  <th className="p-2 text-right">Journal-Derived Fine</th>
                  <th className="p-2 text-right">Finished Goods Net</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.byPurity.map((p) => (
                  <tr
                    key={p.purityId}
                    className="border-b border-slate-100 font-mono tabular-nums"
                  >
                    <td className="p-2 font-sans font-semibold text-slate-900">
                      {p.displayLabel}
                    </td>
                    <td className="p-2 text-right">{p.touchPercent}%</td>
                    <td className="p-2 text-right font-bold">
                      {p.adminPhysicalWeight} g
                    </td>
                    <td className="p-2 text-right">
                      {p.journalDerivedPhysicalWeight} g
                    </td>
                    <td className="p-2 text-right text-blue-800">
                      {p.adminFineEquivalent} g
                    </td>
                    <td className="p-2 text-right text-blue-800">
                      {p.journalDerivedFineEquivalent} g
                    </td>
                    <td className="p-2 text-right text-emerald-800">
                      {p.finishedGoodsPhysicalWeight} g ({p.finishedGoodsFineEquivalent} g fine)
                    </td>
                    <td className="p-2 text-center font-sans">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-xs border ${
                          p.isReconciled
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-red-50 text-red-800 border-red-300"
                        }`}
                      >
                        {p.isReconciled ? "MATCH" : "MISMATCH"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Karigar Custody & Loss Eligibility Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xs p-4 space-y-2">
          <h2 className="text-sm font-bold text-slate-900">
            Karigar Custody (WIP) & Process Loss Eligibility Breakdown
          </h2>
          <p className="text-xs text-slate-600">
            Unreturned material remains in Karigar Custody and is never treated as loss. Process loss transitions from PENDING_ORDER_COMPLETION to ELIGIBLE only when the order completes.
          </p>
          <div className="overflow-x-auto border border-slate-200 rounded-xs">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <th className="p-2 text-left">Karigar Code</th>
                  <th className="p-2 text-left">Karigar Name</th>
                  <th className="p-2 text-right">Custody Physical (WIP)</th>
                  <th className="p-2 text-right">Custody Fine Eq</th>
                  <th className="p-2 text-right">
                    Pending Loss (Raw / Fine)
                  </th>
                  <th className="p-2 text-right">
                    Eligible Loss (Raw / Fine)
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.karigarCustodyBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500">
                      No karigars registered yet.
                    </td>
                  </tr>
                ) : (
                  report.karigarCustodyBreakdown.map((k) => (
                    <tr
                      key={k.karigarId}
                      className="border-b border-slate-100 font-mono tabular-nums"
                    >
                      <td className="p-2 font-semibold text-blue-800">
                        {k.karigarCode}
                      </td>
                      <td className="p-2 font-sans font-semibold text-slate-900">
                        {k.karigarName}
                      </td>
                      <td className="p-2 text-right font-bold">
                        {k.custodyPhysicalWeight} g
                      </td>
                      <td className="p-2 text-right text-blue-800">
                        {k.custodyFineWeight} g
                      </td>
                      <td className="p-2 text-right text-amber-800">
                        {k.pendingLossRawWeight} g ({k.pendingLossFineWeight} g fine)
                      </td>
                      <td className="p-2 text-right font-bold text-emerald-800">
                        {k.eligibleLossRawWeight} g ({k.eligibleLossFineWeight} g fine)
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

