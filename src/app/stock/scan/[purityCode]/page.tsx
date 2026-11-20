"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { AppShell, AppShellUser } from "@/components/AppShell";
import type {
  DailyReconciliationReport,
  PurityStockRow,
} from "@/lib/domain/erp-service";
import { formatWeight3 } from "@/lib/decimal";
import {
  fetchActorCached,
  fetchCachedJson,
} from "@/lib/client-cache";
import { buildStockBoxQrUrl } from "@/components/stock/StockBoxQrModal";

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
  totalAmountRupees: string;
  status: string;
}

export default function StockBoxScanPage() {
  const params = useParams<{ purityCode: string }>();
  const router = useRouter();
  const rawCode = decodeURIComponent(params?.purityCode || "").trim();

  const [actor, setActor] = useState<AppShellUser | null>(null);
  const [reconciliation, setReconciliation] =
    useState<DailyReconciliationReport | null>(null);
  const [history, setHistory] = useState<JournalHistoryRow[]>([]);
  const [sales, setSales] = useState<StockSaleRow[]>([]);
  const [customerAdvanceFine, setCustomerAdvanceFine] = useState<number>(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const loadBox = useCallback(async () => {
    setLoading(true);
    try {
      const [resolvedActor, stkData] = await Promise.all([
        fetchActorCached(),
        fetchCachedJson<{
          ok?: boolean;
          reconciliation?: DailyReconciliationReport;
          history?: JournalHistoryRow[];
          sales?: StockSaleRow[];
          customerAdvanceFine?: string;
        }>("/api/stock", { force: true }),
      ]);
      if (!resolvedActor) {
        router.push(
          `/login?redirect=${encodeURIComponent(`/stock/scan/${rawCode}`)}`
        );
        return;
      }
      setActor(resolvedActor);
      if (stkData.ok && stkData.reconciliation) {
        setReconciliation(stkData.reconciliation);
        setHistory(stkData.history || []);
        setSales(stkData.sales || []);
        setCustomerAdvanceFine(Number(stkData.customerAdvanceFine || 0));
      }
    } finally {
      setLoading(false);
    }
  }, [rawCode, router]);

  useEffect(() => {
    void loadBox();
  }, [loadBox]);

  const matchedPurity: PurityStockRow | null = useMemo(() => {
    if (!reconciliation) return null;
    const all = reconciliation.byPurity;
    const lower = rawCode.toLowerCase();
    return (
      all.find((p) => p.code.toLowerCase() === lower) ||
      all.find((p) => p.purityId.toLowerCase() === lower) ||
      (lower === "fine" || lower === "admin_fine_gold"
        ? all.find((p) => p.isFineCategory || Number(p.touchPercent) >= 99) ||
          null
        : null)
    );
  }, [reconciliation, rawCode]);

  useEffect(() => {
    if (!matchedPurity) return;
    QRCode.toDataURL(buildStockBoxQrUrl(matchedPurity.code), {
      width: 180,
      margin: 1,
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [matchedPurity]);

  if (loading || !actor) {
    return (
      <div className="p-6 text-sm text-gray-600">Loading Gold Box Ledger...</div>
    );
  }

  if (!matchedPurity || !reconciliation) {
    return (
      <AppShell actor={actor}>
        <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl border border-red-200 space-y-3">
          <h1 className="text-lg font-bold text-red-700">
            Gold Box Not Found ({rawCode || "Unknown"})
          </h1>
          <p className="text-sm text-gray-600">
            No active purity matched code &ldquo;{rawCode}&rdquo;.
          </p>
          <Link
            href="/stock"
            className="inline-block px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium"
          >
            ← Back to Admin Stock
          </Link>
        </div>
      </AppShell>
    );
  }

  const isFine =
    matchedPurity.isFineCategory || Number(matchedPurity.touchPercent) >= 99;
  const finePurityIds = new Set(
    reconciliation.byPurity
      .filter((p) => p.isFineCategory || Number(p.touchPercent) >= 99)
      .map((p) => p.purityId)
  );

  const boxHistory = history.filter((h) =>
    isFine ? finePurityIds.has(h.purityId) : h.purityId === matchedPurity.purityId
  );
  const boxSales = sales.filter((s) =>
    isFine ? finePurityIds.has(s.purityId) : s.purityId === matchedPurity.purityId
  );

  const finePoolTotal = isFine
    ? reconciliation.byPurity
        .filter((p) => p.isFineCategory || Number(p.touchPercent) >= 99)
        .reduce((sum, p) => sum + Number(p.adminFineEquivalent || 0), 0)
    : Number(matchedPurity.adminFineEquivalent || 0);
  const finePhysicalTotal = isFine
    ? reconciliation.byPurity
        .filter((p) => p.isFineCategory || Number(p.touchPercent) >= 99)
        .reduce((sum, p) => sum + Number(p.adminPhysicalWeight || 0), 0)
    : Number(matchedPurity.adminPhysicalWeight || 0);
  const adminDirectFine = isFine
    ? Math.max(0, finePoolTotal - customerAdvanceFine)
    : Number(matchedPurity.adminFineEquivalent || 0);

  return (
    <AppShell actor={actor}>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/stock"
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              ← Back to Admin Stock
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">
              {isFine ? "Fine Gold (100%) Box" : `${matchedPurity.displayLabel} Gold Box`}
            </h1>
            <p className="text-xs text-gray-500">
              Touch: {matchedPurity.touchPercent}% • Box Code:{" "}
              <span className="font-mono">{matchedPurity.code}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadBox()}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md text-xs font-medium cursor-pointer"
            >
              ↻ Refresh
            </button>
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="Box QR"
                className="w-16 h-16 border border-gray-200 rounded bg-white p-1"
              />
            )}
          </div>
        </div>

        {/* Balance Cards */}
        {isFine ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-sky-500 to-blue-700 text-white p-5 rounded-xl shadow">
              <p className="text-xs opacity-90">Admin Fine Gold (Direct)</p>
              <p className="text-3xl font-bold mt-1">
                {formatWeight3(adminDirectFine)} g
              </p>
              <p className="text-[11px] opacity-80 mt-1">
                Admin&apos;s own fine gold
              </p>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-orange-700 text-white p-5 rounded-xl shadow">
              <p className="text-xs opacity-90">Customer Advance (Fine)</p>
              <p className="text-3xl font-bold mt-1">
                {formatWeight3(customerAdvanceFine)} g
              </p>
              <p className="text-[11px] opacity-80 mt-1">
                Held for future orders
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-green-700 text-white p-5 rounded-xl shadow">
              <p className="text-xs opacity-90">Total Physical in Box</p>
              <p className="text-3xl font-bold mt-1">
                {formatWeight3(finePhysicalTotal)} g
              </p>
              <p className="text-[11px] opacity-80 mt-1">
                Direct + Customer Advance
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-amber-500 to-yellow-600 text-white p-5 rounded-xl shadow">
              <p className="text-xs opacity-90">Physical Gold in Box</p>
              <p className="text-3xl font-bold mt-1">
                {formatWeight3(matchedPurity.adminPhysicalWeight)} g
              </p>
              <p className="text-[11px] opacity-80 mt-1">
                {matchedPurity.displayLabel}
              </p>
            </div>
            <div className="bg-gradient-to-br from-emerald-500 to-green-700 text-white p-5 rounded-xl shadow">
              <p className="text-xs opacity-90">Fine Gold Equivalent</p>
              <p className="text-3xl font-bold mt-1">
                {formatWeight3(matchedPurity.adminFineEquivalent)} g
              </p>
              <p className="text-[11px] opacity-80 mt-1">
                @ {matchedPurity.touchPercent}% touch
              </p>
            </div>
            <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
              <p className="text-xs text-gray-500">Finished Goods Stock</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatWeight3(matchedPurity.finishedGoodsPhysicalWeight)} g
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Fine Eq: {formatWeight3(matchedPurity.finishedGoodsFineEquivalent)} g
              </p>
            </div>
          </div>
        )}

        {/* Transactions Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              All Transactions for {isFine ? "Fine Gold" : matchedPurity.displayLabel} ({boxHistory.length})
            </h2>
          </div>
          {boxHistory.length === 0 ? (
            <div className="p-6 text-sm text-gray-500 text-center">
              No journal transactions recorded for this gold box yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-600 uppercase">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Date</th>
                    <th className="px-4 py-2.5 text-left">Txn #</th>
                    <th className="px-4 py-2.5 text-left">Type</th>
                    <th className="px-4 py-2.5 text-right">Physical (g)</th>
                    <th className="px-4 py-2.5 text-right">Fine (g)</th>
                    <th className="px-4 py-2.5 text-left">Bag / Ref / Karigar</th>
                    <th className="px-4 py-2.5 text-left">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {boxHistory.map((h) => (
                    <tr
                      key={h.id}
                      className={h.isReversed ? "opacity-50 line-through" : "hover:bg-gray-50"}
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {h.businessDate}
                      </td>
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                        {h.transactionNumber}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                          {h.transactionType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                        {h.physicalWeight} g
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 whitespace-nowrap">
                        {h.fineEquivalentWeight} g
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                        {[
                          h.bagNumber ? `Bag #${h.bagNumber}` : null,
                          h.karigarName,
                          h.sourceReference,
                        ]
                          .filter(Boolean)
                          .join(" • ") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-xs">
                        {h.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Gold Sales for this box if any */}
        {boxSales.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 text-sm">
                Gold Sales ({boxSales.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-600 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-left">Sale #</th>
                    <th className="px-4 py-2 text-left">Buyer</th>
                    <th className="px-4 py-2 text-right">Weight (g)</th>
                    <th className="px-4 py-2 text-right">Amount (₹)</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {boxSales.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2">{s.businessDate}</td>
                      <td className="px-4 py-2 font-mono">{s.saleNumber}</td>
                      <td className="px-4 py-2">{s.buyerName}</td>
                      <td className="px-4 py-2 text-right font-semibold">
                        {s.physicalWeight} g
                      </td>
                      <td className="px-4 py-2 text-right">
                        ₹{s.totalAmountRupees}
                      </td>
                      <td className="px-4 py-2">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
