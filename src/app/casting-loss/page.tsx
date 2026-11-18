"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell, AppShellUser } from "@/components/AppShell";
import { ArrowLeft, Flame, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  fetchActorCached,
  fetchCachedJson,
  getCachedActor,
} from "@/lib/client-cache";
import type {
  CastingLossFilter,
  CastingLossSummary,
} from "@/lib/casting-loss";
import { getTodayBusinessDateString } from "@/lib/date-and-export";
import { formatWeight3 } from "@/lib/decimal";

interface PurityOption {
  id: string;
  code: string;
  displayLabel: string;
  karatLabel: string;
  touchPercent: string;
  isFineCategory: boolean;
}

export default function CastingLossPage() {
  const [actor, setActor] = useState<AppShellUser | null>(() => getCachedActor());
  const [summary, setSummary] = useState<CastingLossSummary | null>(null);
  const [purities, setPurities] = useState<PurityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Filter state
  const [filter, setFilter] = useState<CastingLossFilter>("today");
  const [month, setMonth] = useState<string>(() =>
    getTodayBusinessDateString().slice(0, 7)
  );
  const [fromDate, setFromDate] = useState<string>(() =>
    getTodayBusinessDateString()
  );
  const [toDate, setToDate] = useState<string>(() =>
    getTodayBusinessDateString()
  );

  // Form state
  const [entryDate, setEntryDate] = useState<string>(() =>
    getTodayBusinessDateString()
  );
  const [selectedPurityId, setSelectedPurityId] = useState<string>("");
  const [lossWeight, setLossWeight] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const buildUrl = (
    f: CastingLossFilter,
    m: string,
    from: string,
    to: string
  ) => {
    const qs = new URLSearchParams({ filter: f });
    if (f === "month" && m) qs.set("month", m);
    if (f === "range") {
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
    }
    return `/api/casting-loss?${qs.toString()}`;
  };

  const loadData = useCallback(
    async (
      force = false,
      override?: {
        filter?: CastingLossFilter;
        month?: string;
        from?: string;
        to?: string;
      }
    ) => {
      const activeFilter = override?.filter ?? filter;
      const activeMonth = override?.month ?? month;
      const activeFrom = override?.from ?? fromDate;
      const activeTo = override?.to ?? toDate;
      const url = buildUrl(activeFilter, activeMonth, activeFrom, activeTo);

      setLoading(true);
      setError(null);
      try {
        const [u, data] = await Promise.all([
          fetchActorCached(force),
          fetchCachedJson<{
            ok?: boolean;
            summary?: CastingLossSummary;
            purities?: PurityOption[];
            error?: string;
          }>(url, { force: true }),
        ]);
        if (u) setActor(u);
        if (data.error) throw new Error(data.error);
        if (data.summary) setSummary(data.summary);
        if (data.purities) {
          setPurities(data.purities);
          setSelectedPurityId((prev) => {
            if (prev && data.purities?.some((p) => p.id === prev)) return prev;
            const preferred =
              data.purities?.find((p) => p.karatLabel === "22K") ||
              data.purities?.[0];
            return preferred?.id || "";
          });
        }
      } catch (e: unknown) {
        setError(
          e instanceof Error ? e.message : "Failed to load casting loss data"
        );
      } finally {
        setLoading(false);
      }
    },
    [filter, month, fromDate, toDate]
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const selectedPurity = useMemo(
    () => purities.find((p) => p.id === selectedPurityId) || null,
    [purities, selectedPurityId]
  );

  const previewFine = useMemo(() => {
    const wt = Number(lossWeight);
    const touch = Number(selectedPurity?.touchPercent || 0);
    if (!Number.isFinite(wt) || wt <= 0 || !Number.isFinite(touch) || touch <= 0) {
      return "0.000";
    }
    const raw = (wt * touch) / 100;
    const truncated = Math.floor(raw * 1000 + 1e-9) / 1000;
    return formatWeight3(truncated);
  }, [lossWeight, selectedPurity]);

  const weightMgHint = useMemo(() => {
    const wt = Number(lossWeight);
    if (!Number.isFinite(wt) || wt <= 0) return null;
    const mg = Math.round(wt * 1000);
    return `${mg} mg`;
  }, [lossWeight]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!selectedPurityId) {
      setError("Please select a karat / purity.");
      return;
    }
    const wt = Number(lossWeight);
    if (!Number.isFinite(wt) || wt <= 0) {
      setError("Please enter a valid casting loss weight greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/casting-loss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          purityId: selectedPurityId,
          lossWeightGrams: wt,
          businessDate: entryDate,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to record casting loss");
      }
      setMessage(
        `Recorded ${data.entry.lossWeightGrams} g (${data.entry.karatLabel}) = ${data.entry.fineWeightGrams} g fine. Workshop stock unchanged.`
      );
      setLossWeight("");
      setNote("");
      await loadData(true);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Failed to record casting loss"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/casting-loss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE", id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to delete entry");
      }
      setMessage("Casting loss entry deleted.");
      await loadData(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete entry");
    }
  };

  if (!actor) {
    return (
      <div className="p-6 text-xs text-slate-500">
        Loading casting loss register...
      </div>
    );
  }

  return (
    <AppShell actor={actor}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Home
              </Link>
              <h1 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-orange-600" />
                Casting Loss Register
              </h1>
              <span className="rounded-xs bg-orange-50 border border-orange-200 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                Info Only • Separate from Stock
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Log casting loss by karat to see fine-gold converted totals. Does not add to or deduct from any workshop stock.
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

        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            {message}
          </div>
        )}

        {/* Add Casting Loss Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-orange-200 bg-white p-4 space-y-3"
        >
          <div className="text-xs font-bold uppercase tracking-wide text-orange-900">
            Add Casting Loss Entry
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Date
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
                className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs font-mono bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Karat / Purity
              </label>
              <select
                value={selectedPurityId}
                onChange={(e) => setSelectedPurityId(e.target.value)}
                required
                className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-medium"
              >
                {purities.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayLabel} ({p.touchPercent}%)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Loss Weight (g){" "}
                {weightMgHint && (
                  <span className="font-mono text-orange-700 font-semibold">
                    • {weightMgHint}
                  </span>
                )}
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                placeholder="e.g. 1.250 or 0.040"
                value={lossWeight}
                onChange={(e) => setLossWeight(e.target.value)}
                required
                className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs font-mono bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Morning casting batch"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
              />
            </div>

            <div className="flex items-center justify-between gap-2 bg-orange-50/70 border border-orange-200 rounded-xs px-3 py-1.5">
              <div>
                <div className="text-[10px] uppercase font-semibold text-orange-800">
                  Fine Converted
                </div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                  {previewFine} g
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1 rounded-xs bg-orange-600 hover:bg-orange-700 disabled:opacity-60 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                {submitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>

        {/* Filter Bar + Totals */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Total Casting Loss (Fine Converted)
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="text-2xl font-bold font-mono tabular-nums text-orange-700">
                  {formatWeight3(summary?.totalFineGrams || "0.000")} g fine
                </span>
                <span className="text-xs font-mono text-slate-600">
                  ({formatWeight3(summary?.totalPhysicalGrams || "0.000")} g physical •{" "}
                  {summary?.entryCount || 0}{" "}
                  {(summary?.entryCount || 0) === 1 ? "entry" : "entries"} •{" "}
                  {summary
                    ? summary.fromDate === summary.toDate
                      ? summary.fromDate
                      : `${summary.fromDate} to ${summary.toDate}`
                    : "-"}
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
                    setFilter(fId);
                    void loadData(true, { filter: fId });
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-xs border cursor-pointer ${
                    filter === fId
                      ? "bg-orange-600 text-white border-orange-600"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {fLabel}
                </button>
              ))}

              {filter === "month" && (
                <input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    const nextMonth = e.target.value;
                    setMonth(nextMonth);
                    void loadData(true, { filter: "month", month: nextMonth });
                  }}
                  className="px-2 py-1 text-xs border border-slate-300 rounded-xs bg-white font-mono"
                />
              )}

              {filter === "range" && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      const nextFrom = e.target.value;
                      setFromDate(nextFrom);
                      void loadData(true, {
                        filter: "range",
                        from: nextFrom,
                        to: toDate,
                      });
                    }}
                    className="px-2 py-1 text-xs border border-slate-300 rounded-xs bg-white font-mono"
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      const nextTo = e.target.value;
                      setToDate(nextTo);
                      void loadData(true, {
                        filter: "range",
                        from: fromDate,
                        to: nextTo,
                      });
                    }}
                    className="px-2 py-1 text-xs border border-slate-300 rounded-xs bg-white font-mono"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Karat-wise Breakdown */}
          <div className="border-t border-slate-200 pt-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">
              Karat-Wise Casting Loss Breakdown
            </div>
            {!summary || summary.byKarat.length === 0 ? (
              <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
                No casting loss entries for this period.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {summary.byKarat.map((k) => (
                  <div
                    key={k.purityId}
                    className="rounded border border-orange-200 bg-orange-50/40 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">
                        {k.purityLabel}
                      </span>
                      <span className="text-[11px] font-mono text-slate-600">
                        {k.touchPercent}%
                      </span>
                    </div>
                    <div className="mt-2 text-lg font-bold font-mono tabular-nums text-orange-700">
                      {formatWeight3(k.totalFineGrams)} g fine
                    </div>
                    <div className="text-xs font-mono text-slate-600">
                      {formatWeight3(k.totalPhysicalGrams)} g physical • {k.entryCount}{" "}
                      {k.entryCount === 1 ? "entry" : "entries"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Entries Table */}
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Casting Loss Entries ({summary?.entries.length || 0})
            </span>
          </div>
          {!summary || summary.entries.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No entries recorded in the selected date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-[11px] font-semibold text-slate-600">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Karat / Purity</th>
                    <th className="px-3 py-2 text-right">Touch %</th>
                    <th className="px-3 py-2 text-right">Physical Loss (g)</th>
                    <th className="px-3 py-2 text-right">Fine Converted (g)</th>
                    <th className="px-3 py-2">Note</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-slate-100 hover:bg-slate-50/70"
                    >
                      <td className="px-3 py-2 font-mono text-slate-700">
                        {entry.businessDate}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {entry.purityLabel}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                        {entry.touchPercent}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                        {formatWeight3(entry.lossWeightGrams)} g
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-orange-700">
                        {formatWeight3(entry.fineWeightGrams)} g
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {entry.note || "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry.id)}
                          className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
