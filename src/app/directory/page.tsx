"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell, AppShellUser } from "@/components/AppShell";
import {
  CANONICAL_PROCESS_SEQUENCE,
  PROCESS_DISPLAY_LABELS,
  ProcessType,
} from "@/lib/domain/types";
import {
  fetchActorCached,
  fetchCachedJson,
  getCachedActor,
  getCachedJson,
} from "@/lib/client-cache";
import type {
  CustomerDirectorySummary,
  CustomerRowStats,
  KarigarDirectorySummary,
  KarigarRowStats,
} from "@/lib/directory-stats";

interface CustomerRow {
  id: string;
  customerCode: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstNumber: string | null;
}

interface KarigarRow {
  id: string;
  karigarCode: string;
  name: string;
  phone: string | null;
  specializationNotes: string | null;
  isActive: boolean;
  capabilities: ProcessType[];
  defaultForProcesses?: ProcessType[];
}

interface CustomersApiPayload {
  ok?: boolean;
  customers?: CustomerRow[];
  summary?: CustomerDirectorySummary;
  byCustomer?: Record<string, CustomerRowStats>;
}

interface KarigarsApiPayload {
  ok?: boolean;
  karigars?: KarigarRow[];
  summary?: KarigarDirectorySummary;
  byKarigar?: Record<string, KarigarRowStats>;
}

function DirectoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab: "customers" | "karigars" =
    searchParams.get("tab") === "karigars" ? "karigars" : "customers";

  const [actor, setActor] = useState<AppShellUser | null>(() => getCachedActor());
  const cachedCust = getCachedJson<CustomersApiPayload>("/api/customers");
  const cachedKar = getCachedJson<KarigarsApiPayload>("/api/karigars");

  const [customers, setCustomers] = useState<CustomerRow[]>(
    () => cachedCust?.customers || []
  );
  const [customerSummary, setCustomerSummary] = useState<CustomerDirectorySummary>(
    () =>
      cachedCust?.summary || {
        totalCustomers: 0,
        totalActiveOrders: 0,
        totalCompletedReady: 0,
        totalOrdersAllTime: 0,
      }
  );
  const [byCustomer, setByCustomer] = useState<Record<string, CustomerRowStats>>(
    () => cachedCust?.byCustomer || {}
  );

  const [karigars, setKarigars] = useState<KarigarRow[]>(
    () => cachedKar?.karigars || []
  );
  const [karigarSummary, setKarigarSummary] = useState<KarigarDirectorySummary>(
    () =>
      cachedKar?.summary || {
        totalKarigars: 0,
        activeKarigars: 0,
        totalKarigarOrders: 0,
        totalCustodyWeight: "0.000",
        totalRawLossWeight: "0.000",
        totalFineLossWeight: "0.000",
      }
  );
  const [byKarigar, setByKarigar] = useState<Record<string, KarigarRowStats>>(
    () => cachedKar?.byKarigar || {}
  );

  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchKarigar, setSearchKarigar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Customer form
  const [custName, setCustName] = useState("");
  const [custCode, setCustCode] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Karigar form
  const [karName, setKarName] = useState("");
  const [editingKarigar, setEditingKarigar] = useState<KarigarRow | null>(null);

  async function handleEnsureDefaults() {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/karigars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ENSURE_DEFAULTS" }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Failed to ensure default karigars");
    } else {
      setMessage(
        data.createdCount > 0
          ? `Created ${data.createdCount} default karigar(s) (Hasan Bhai, Boro Bhai, Josim).`
          : "Default karigars already configured."
      );
      await loadData();
    }
  }

  async function handleToggleKarigarActive(k: KarigarRow) {
    setError(null);
    const res = await fetch("/api/karigars", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ karigarId: k.id, isActive: !k.isActive }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Failed to update karigar");
    } else {
      setMessage(`${k.name} marked ${!k.isActive ? "Active" : "Inactive"}`);
      await loadData();
    }
  }

  async function handleSaveKarigarEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingKarigar) return;
    setError(null);
    const res = await fetch("/api/karigars", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        karigarId: editingKarigar.id,
        name: editingKarigar.name,
        phone: editingKarigar.phone,
        capabilities: editingKarigar.capabilities,
        defaultForProcesses: editingKarigar.defaultForProcesses ?? [],
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Failed to save karigar");
    } else {
      setEditingKarigar(null);
      setMessage(`Updated ${data.karigar.name}`);
      await loadData();
    }
  }
  const [karCode, setKarCode] = useState("");
  const [karPhone, setKarPhone] = useState("");
  const [karCapabilities, setKarCapabilities] = useState<ProcessType[]>([
    "FILING",
    "FREE_POLISH",
    "SETTING",
    "FINAL_POLISH",
  ]);
  const [savingKarigar, setSavingKarigar] = useState(false);

  const loadData = useCallback(
    async (force = false) => {
      const [resolvedActor, cData, kData] = await Promise.all([
        fetchActorCached(),
        fetchCachedJson<CustomersApiPayload>("/api/customers", {
          force,
          ttlMs: 120_000,
        }),
        fetchCachedJson<KarigarsApiPayload>("/api/karigars", {
          force,
          ttlMs: 120_000,
        }),
      ]);
      if (!resolvedActor) {
        router.push("/login?redirect=/directory");
        return;
      }
      setActor(resolvedActor);
      if (cData.ok && cData.customers) {
        setCustomers(cData.customers);
        if (cData.summary) setCustomerSummary(cData.summary);
        if (cData.byCustomer) setByCustomer(cData.byCustomer);
      }
      if (kData.ok && kData.karigars) {
        setKarigars(kData.karigars);
        if (kData.summary) setKarigarSummary(kData.summary);
        if (kData.byKarigar) setByKarigar(kData.byKarigar);
      }
    },
    [router]
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const filteredCustomers = useMemo(() => {
    const q = searchCustomer.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.customerCode.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
    );
  }, [customers, searchCustomer]);

  const filteredKarigars = useMemo(() => {
    const q = searchKarigar.trim().toLowerCase();
    if (!q) return karigars;
    return karigars.filter(
      (k) =>
        k.name.toLowerCase().includes(q) ||
        k.karigarCode.toLowerCase().includes(q) ||
        (k.phone || "").toLowerCase().includes(q)
    );
  }, [karigars, searchKarigar]);

  function toggleCapability(p: ProcessType) {
    setKarCapabilities((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSavingCustomer(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerCode: custCode || undefined,
          name: custName,
          phone: custPhone || undefined,
          address: custAddress || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to create customer");
      } else {
        setCustName("");
        setCustCode("");
        setCustPhone("");
        setCustAddress("");
        setMessage(`Created customer ${data.customer.name} (${data.customer.customerCode})`);
        await loadData();
      }
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleCreateKarigar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSavingKarigar(true);
    try {
      const res = await fetch("/api/karigars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          karigarCode: karCode || undefined,
          name: karName,
          phone: karPhone || undefined,
          capabilities: karCapabilities,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to create karigar");
      } else {
        setKarName("");
        setKarCode("");
        setKarPhone("");
        setMessage(
          `Created karigar ${data.karigar.name} with stable ID ${data.karigar.karigarCode}`
        );
        await loadData();
      }
    } finally {
      setSavingKarigar(false);
    }
  }

  async function handleDeleteCustomer(c: CustomerRow) {
    if (
      !window.confirm(
        `Delete customer "${c.name}" (${c.customerCode})? This only succeeds if they have no orders, bills, or receipts.`
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/customers?customerId=${encodeURIComponent(c.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to delete customer");
      } else {
        setMessage(`Deleted customer ${c.name} (${c.customerCode})`);
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete customer");
    }
  }

  async function handleDeleteKarigar(k: KarigarRow) {
    if (
      !window.confirm(
        `Delete karigar "${k.name}" (${k.karigarCode})? This only succeeds if they have no order processes, gold movements, or recovery records.`
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/karigars?karigarId=${encodeURIComponent(k.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to delete karigar");
      } else {
        setMessage(`Deleted karigar ${k.name} (${k.karigarCode})`);
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete karigar");
    }
  }

  if (!actor) {
    return <div className="p-6 text-xs text-slate-600">Loading directory...</div>;
  }

  return (
    <AppShell actor={actor}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              {activeTab === "karigars" ? "Karigars" : "Customers"}
            </h1>
            <p className="text-xs text-slate-600">
              {activeTab === "karigars"
                ? "Manage workshop karigars, process capabilities, orders, loss breakdown, and recovery profiles."
                : "Manage jewellery customers, active orders, customer profiles, and billing."}
            </p>
          </div>
          {activeTab === "karigars" && actor.role === "OWNER_ADMIN" && (
            <button
              type="button"
              onClick={() => void handleEnsureDefaults()}
              className="px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-xs hover:bg-amber-700 cursor-pointer"
            >
              Ensure Default Karigars
            </button>
          )}
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xs">
            {error}
          </div>
        )}
        {message && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs rounded-xs">
            {message}
          </div>
        )}

        {/* Customers KPI Cards */}
        {activeTab === "customers" && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xs p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total Customers
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-slate-900">
                {customerSummary.totalCustomers || customers.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Registered accounts
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xs p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total Active Orders
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-blue-700">
                {customerSummary.totalActiveOrders}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                In production / pending delivery
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xs p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Ready for Delivery
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-emerald-700">
                {customerSummary.totalCompletedReady}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Completed bags awaiting dispatch
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xs p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total Orders (All Time)
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-slate-900">
                {customerSummary.totalOrdersAllTime}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Excludes cancelled orders
              </div>
            </div>
          </div>
        )}

        {/* Karigars KPI Cards */}
        {activeTab === "karigars" && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xs p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total Karigars
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-slate-900">
                {karigarSummary.totalKarigars || karigars.length}
              </div>
              <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                {karigarSummary.activeKarigars} active
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xs p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total Karigar Orders
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-blue-700">
                {karigarSummary.totalKarigarOrders}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Assigned across all processes
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xs p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Active Custody Gold
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-amber-700">
                {karigarSummary.totalCustodyWeight} g
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Currently in karigar hands
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xs p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total Order Loss
              </div>
              <div className="mt-1 text-xl font-bold font-mono text-rose-700">
                {karigarSummary.totalRawLossWeight} g
              </div>
              <div className="text-[11px] text-slate-600 font-mono mt-0.5">
                Fine eq: {karigarSummary.totalFineLossWeight} g
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {/* Customers Panel */}
          {activeTab === "customers" && (
          <div className="bg-white border border-slate-200 rounded-xs p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-sm font-bold text-slate-900">
                Customers ({customers.length})
              </h2>
              <input
                type="search"
                value={searchCustomer}
                onChange={(e) => setSearchCustomer(e.target.value)}
                placeholder="Search customer name / code / phone..."
                className="px-2.5 py-1 text-xs border border-slate-300 rounded-xs w-56"
              />
            </div>

            <form
              onSubmit={handleCreateCustomer}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-slate-50 p-3 border border-slate-200 rounded-xs"
            >
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="e.g. Rajesh Jewellers"
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Phone
                </label>
                <input
                  type="text"
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  placeholder="98XXXXXXXX"
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Address / City
                </label>
                <input
                  type="text"
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  placeholder="Manek Chowk"
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="w-full py-1.5 px-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                >
                  + Add
                </button>
              </div>
            </form>

            <div className="overflow-x-auto border border-slate-200 rounded-xs">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="p-2 text-left font-semibold">Code</th>
                    <th className="p-2 text-left font-semibold">Customer Name</th>
                    <th className="p-2 text-left font-semibold">Phone</th>
                    <th className="p-2 text-left font-semibold">Address</th>
                    <th className="p-2 text-right font-semibold">Active / Total Orders</th>
                    <th className="p-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-4 text-center text-slate-500"
                      >
                        No customers created yet. Add your first customer above.
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => {
                      const stats = byCustomer[c.id];
                      return (
                      <tr
                        key={c.id}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="p-2 font-mono text-[11px] text-slate-600">
                          {c.customerCode}
                        </td>
                        <td className="p-2 font-semibold text-slate-900">
                          <Link
                            href={`/customers/${c.id}`}
                            className="text-blue-800 hover:underline"
                          >
                            {c.name}
                          </Link>
                        </td>
                        <td className="p-2 font-mono text-slate-700">
                          {c.phone || "-"}
                        </td>
                        <td className="p-2 text-slate-600">
                          {c.address || "-"}
                        </td>
                        <td className="p-2 text-right font-mono text-slate-800">
                          <span className="font-bold text-blue-700">
                            {stats?.activeOrders ?? 0}
                          </span>
                          <span className="text-slate-400"> / </span>
                          <span>{stats?.totalOrders ?? 0}</span>
                        </td>
                        <td className="p-2 text-right space-x-1.5">
                          <Link
                            href={`/customers/${c.id}`}
                            className="inline-block px-2 py-1 text-[11px] font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xs"
                          >
                            Customer Profile
                          </Link>
                          <Link
                            href={`/billing?customerId=${c.id}`}
                            className="inline-block px-2 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-xs"
                          >
                            New Bill
                          </Link>
                          {actor.role === "OWNER_ADMIN" && (
                            <button
                              type="button"
                              onClick={() => void handleDeleteCustomer(c)}
                              className="px-2 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-xs cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {/* Karigars Panel */}
          {activeTab === "karigars" && (
          <div className="bg-white border border-slate-200 rounded-xs p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h2 className="text-sm font-bold text-slate-900">
                Karigars ({karigars.length})
              </h2>
              <input
                type="search"
                value={searchKarigar}
                onChange={(e) => setSearchKarigar(e.target.value)}
                placeholder="Search karigar name / code..."
                className="px-2.5 py-1 text-xs border border-slate-300 rounded-xs w-56"
              />
            </div>

            {actor.role === "OWNER_ADMIN" && (
              <form
                onSubmit={handleCreateKarigar}
                className="space-y-2.5 bg-slate-50 p-3 border border-slate-200 rounded-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Karigar Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={karName}
                      onChange={(e) => setKarName(e.target.value)}
                      placeholder="e.g. Ramesh Bhai"
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Code (Optional)
                    </label>
                    <input
                      type="text"
                      value={karCode}
                      onChange={(e) => setKarCode(e.target.value)}
                      placeholder="KAR-001"
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs font-mono"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Phone
                    </label>
                    <input
                      type="text"
                      value={karPhone}
                      onChange={(e) => setKarPhone(e.target.value)}
                      placeholder="99XXXXXXXX"
                      className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[11px] font-semibold text-slate-700">
                      Process Capabilities:
                    </span>
                    {CANONICAL_PROCESS_SEQUENCE.map((p) => (
                      <label
                        key={p}
                        className="inline-flex items-center gap-1 text-xs text-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={karCapabilities.includes(p)}
                          onChange={() => toggleCapability(p)}
                          className="rounded-xs border-slate-300"
                        />
                        <span>{PROCESS_DISPLAY_LABELS[p]}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={savingKarigar}
                    className="py-1.5 px-3 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                  >
                    + Add Karigar
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-xs">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                    <th className="p-2 text-left font-semibold">Stable Code</th>
                    <th className="p-2 text-left font-semibold">Karigar Name</th>
                    <th className="p-2 text-left font-semibold">Phone</th>
                    <th className="p-2 text-left font-semibold">Capabilities</th>
                    <th className="p-2 text-right font-semibold">Orders (Active / Total)</th>
                    <th className="p-2 text-right font-semibold">Loss (g)</th>
                    <th className="p-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKarigars.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-4 text-center text-slate-500"
                      >
                        No karigars created yet. Add your first karigar above.
                      </td>
                    </tr>
                  ) : (
                    filteredKarigars.map((k) => {
                      const stats = byKarigar[k.id];
                      return (
                      <tr
                        key={k.id}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="p-2 font-mono text-[11px] font-semibold text-blue-800">
                          {k.karigarCode}
                        </td>
                        <td className="p-2 font-semibold text-slate-900">
                          <Link
                            href={`/karigars/${k.id}`}
                            className="text-blue-800 hover:underline"
                          >
                            {k.name}
                          </Link>
                          {!k.isActive && (
                            <span className="ml-1.5 px-1 py-0.5 text-[10px] bg-slate-200 text-slate-600 rounded-xs">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono text-slate-700">
                          {k.phone || "-"}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {k.capabilities.map((cap) => {
                              const isDef = (k.defaultForProcesses ?? []).includes(cap);
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
                        </td>
                        <td className="p-2 text-right font-mono text-slate-800">
                          <span className="font-bold text-blue-700">
                            {stats?.activeOrders ?? 0}
                          </span>
                          <span className="text-slate-400"> / </span>
                          <span>{stats?.totalOrders ?? 0}</span>
                        </td>
                        <td className="p-2 text-right font-mono text-rose-700 font-semibold">
                          {stats?.totalRawLossWeight ?? "0.000"}
                        </td>
                        <td className="p-2 text-right space-x-1 whitespace-nowrap">
                          <Link
                            href={`/karigars/${k.id}`}
                            className="inline-block px-2 py-1 text-[11px] font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-xs"
                          >
                            Karigar Profile
                          </Link>
                          <Link
                            href={`/recovery?karigarId=${k.id}`}
                            className="inline-block px-2 py-1 text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xs"
                          >
                            Recovery
                          </Link>
                          {actor.role === "OWNER_ADMIN" && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingKarigar({ ...k })}
                                className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 rounded-xs hover:bg-slate-50 cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleKarigarActive(k)}
                                className="px-2 py-1 text-[11px] font-medium bg-white border border-slate-300 rounded-xs hover:bg-slate-50 cursor-pointer"
                              >
                                {k.isActive ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteKarigar(k)}
                                className="px-2 py-1 text-[11px] font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 rounded-xs cursor-pointer"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>

        {editingKarigar && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <form
              onSubmit={handleSaveKarigarEdit}
              className="bg-white border border-slate-300 rounded-xs p-4 w-full max-w-md space-y-3 text-xs"
            >
              <div className="font-bold text-sm text-slate-900">
                Edit Karigar: {editingKarigar.karigarCode}
              </div>
              <div>
                <label className="block font-semibold mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={editingKarigar.name}
                  onChange={(e) =>
                    setEditingKarigar({ ...editingKarigar, name: e.target.value })
                  }
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Phone</label>
                <input
                  type="text"
                  value={editingKarigar.phone || ""}
                  onChange={(e) =>
                    setEditingKarigar({ ...editingKarigar, phone: e.target.value })
                  }
                  className="w-full px-2 py-1.5 border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Capabilities &amp; Defaults</label>
                <div className="space-y-1">
                  {CANONICAL_PROCESS_SEQUENCE.map((proc) => {
                    const hasCap = editingKarigar.capabilities.includes(proc);
                    const isDef = (editingKarigar.defaultForProcesses ?? []).includes(proc);
                    return (
                      <div key={proc} className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={hasCap}
                            onChange={(e) => {
                              const nextCaps = e.target.checked
                                ? [...editingKarigar.capabilities, proc]
                                : editingKarigar.capabilities.filter((c) => c !== proc);
                              setEditingKarigar({
                                ...editingKarigar,
                                capabilities: nextCaps,
                                defaultForProcesses: (editingKarigar.defaultForProcesses ?? []).filter(
                                  (d) => nextCaps.includes(d)
                                ),
                              });
                            }}
                          />
                          <span>{PROCESS_DISPLAY_LABELS[proc]}</span>
                        </label>
                        {hasCap && (
                          <label className="flex items-center gap-1 text-[11px] text-amber-800">
                            <input
                              type="checkbox"
                              checked={isDef}
                              onChange={(e) => {
                                const cur = editingKarigar.defaultForProcesses ?? [];
                                const nextDef = e.target.checked
                                  ? [...cur, proc]
                                  : cur.filter((d) => d !== proc);
                                setEditingKarigar({
                                  ...editingKarigar,
                                  defaultForProcesses: nextDef,
                                });
                              }}
                            />
                            Default
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingKarigar(null)}
                  className="px-3 py-1.5 border border-slate-300 rounded-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-blue-700 text-white font-semibold rounded-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function DirectoryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-slate-600">Loading directory...</div>}>
      <DirectoryContent />
    </Suspense>
  );
}

