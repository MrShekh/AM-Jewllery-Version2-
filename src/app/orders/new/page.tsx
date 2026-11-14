"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, AppShellUser } from "@/components/AppShell";
import {
  AdDetail,
  ManufacturingWorksheetPreview,
} from "@/components/previews/v1/ManufacturingWorksheetPreview";
import { downloadManufacturingWorksheet } from "@/components/previews/v1/manufacturingWorksheetGenerator";
import { OrderQrAttachment } from "@/components/previews/OrderQrAttachment";
import {
  adaptV2OrderToV1WorksheetPDFData,
  adaptV2OrderToV1WorksheetProps,
} from "@/lib/previews/v2-preview-adapter";
import {
  CANONICAL_PROCESS_SEQUENCE,
  PROCESS_DISPLAY_LABELS,
  ProcessType,
} from "@/lib/domain/types";
import { getTodayBusinessDateString } from "@/lib/date-and-export";

interface CustomerOption {
  id: string;
  customerCode: string;
  name: string;
}

interface PurityOption {
  id: string;
  code: string;
  displayLabel: string;
  karatLabel: string;
  touchPercent: string;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [actor, setActor] = useState<AppShellUser | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [purities, setPurities] = useState<PurityOption[]>([]);

  const [bagNumber, setBagNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [orderName, setOrderName] = useState("");
  const [purityId, setPurityId] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [size, setSize] = useState("");
  const [orderDate, setOrderDate] = useState(getTodayBusinessDateString());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [selectedProcesses, setSelectedProcesses] = useState<ProcessType[]>([
    "FILING",
    "FREE_POLISH",
    "SETTING",
    "FINAL_POLISH",
  ]);

  const [adDetails, setAdDetails] = useState<AdDetail[]>([
    { id: "ad-1", adSize: "", adPieces: 0 },
    { id: "ad-2", adSize: "", adPieces: 0 },
  ]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadInitial = useCallback(async () => {
    const meRes = await fetch("/api/auth/me");
    if (meRes.status === 401) {
      router.push("/login?redirect=/orders/new");
      return;
    }
    const meData = await meRes.json();
    setActor(meData.actor);

    const [cRes, pRes] = await Promise.all([
      fetch("/api/customers"),
      fetch("/api/purities"),
    ]);
    const cData = await cRes.json();
    const pData = await pRes.json();
    if (cData.ok) {
      setCustomers(cData.customers);
      if (cData.customers.length > 0 && !customerId) {
        setCustomerId(cData.customers[0].id);
      }
    }
    if (pData.ok) {
      setPurities(pData.purities);
      if (pData.purities.length > 0 && !purityId) {
        setPurityId(pData.purities[0].id);
      }
    }
  }, [router, customerId, purityId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  function toggleProcess(p: ProcessType) {
    setSelectedProcesses((prev) => {
      const next = prev.includes(p)
        ? prev.filter((item) => item !== p)
        : [...prev, p];
      return CANONICAL_PROCESS_SEQUENCE.filter((canon) => next.includes(canon));
    });
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to upload photo");
      } else {
        setPhotoUrl(data.publicUrl);
      }
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleQuickAddCustomer() {
    if (!quickCustomerName.trim()) return;
    setError(null);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: quickCustomerName.trim() }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      setQuickCustomerName("");
      const nextList = [...customers, data.customer];
      setCustomers(nextList);
      setCustomerId(data.customer.id);
    } else {
      setError(data.error || "Could not create customer");
    }
  }

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let activeCustomerId = customerId;
      if (!activeCustomerId && quickCustomerName.trim()) {
        const cRes = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: quickCustomerName.trim() }),
        });
        const cData = await cRes.json();
        if (!cRes.ok || !cData.ok) {
          setError(cData.error || "Please select or create a customer");
          setSubmitting(false);
          return;
        }
        activeCustomerId = cData.customer.id;
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bagNumber,
          customerId: activeCustomerId,
          orderName,
          photoUrl: photoUrl || null,
          purityId,
          targetWeight: targetWeight ? targetWeight : null,
          size: size || null,
          orderDate,
          dueDate: dueDate || null,
          notes: notes || null,
          adDetails: adDetails.filter((a) => a.adSize || a.adPieces > 0),
          selectedProcesses,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to create order");
        setSubmitting(false);
        return;
      }
      router.push(`/production-register?order=${encodeURIComponent(data.orderId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
      setSubmitting(false);
    }
  }

  if (!actor) {
    return <div className="p-6 text-xs text-slate-600">Loading order form...</div>;
  }

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedPurity = purities.find((p) => p.id === purityId);

  const previewInput = {
    bagNumber,
    customerName: selectedCustomer?.name || quickCustomerName || "",
    orderName,
    orderDate,
    dueDate: dueDate || null,
    purityDisplayLabel: selectedPurity?.displayLabel || "22K (92%)",
    purityKaratLabel: selectedPurity?.karatLabel || "22KT",
    targetWeightGrams: targetWeight ? Number(targetWeight) : 0,
    size,
    photoUrl,
    selectedProcesses,
    adDetails,
  };

  const v1PreviewProps = adaptV2OrderToV1WorksheetProps(previewInput);

  return (
    <AppShell actor={actor}>
      {/* Dedicated Print-Only Container: prints ONLY the Job Card + QR Attachment */}
      <div className="print-only-worksheet">
        <ManufacturingWorksheetPreview {...v1PreviewProps} />
        <OrderQrAttachment
          orderId=""
          bagNumber={bagNumber}
          orderName={orderName}
          purityLabel={selectedPurity?.displayLabel || "22K (92%)"}
          customerName={selectedCustomer?.name || quickCustomerName || ""}
        />
      </div>

      <div className="space-y-4 hide-on-print">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              Create Manufacturing Order (Bag / Job Card)
            </h1>
            <p className="text-xs text-slate-600">
              Creating an order does not automatically deduct Admin Stock. Metal is deducted when issued to the first selected process.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xs">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Order Creation Form */}
          <form
            onSubmit={handleSubmitOrder}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xs p-4 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bag / Order Number *
                </label>
                <input
                  type="text"
                  required
                  value={bagNumber}
                  onChange={(e) => setBagNumber(e.target.value)}
                  placeholder="e.g. 4360"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Order / Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={orderName}
                  onChange={(e) => setOrderName(e.target.value)}
                  placeholder="e.g. LR RING"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Purity / Actual Touch *
                </label>
                <select
                  required
                  value={purityId}
                  onChange={(e) => setPurityId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs bg-white"
                >
                  {purities.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayLabel} (Touch {p.touchPercent}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Customer Selection or Quick Create */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-slate-50 p-3 border border-slate-200 rounded-xs">
              <div className="sm:col-span-6">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Customer *
                </label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs bg-white"
                >
                  <option value="">-- Choose Existing Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customerCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Or Quick-Create Customer
                </label>
                <input
                  type="text"
                  value={quickCustomerName}
                  onChange={(e) => setQuickCustomerName(e.target.value)}
                  placeholder="New Customer Name"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs bg-white"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleQuickAddCustomer}
                  className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xs cursor-pointer"
                >
                  + Create
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Weight (g)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={targetWeight}
                  onChange={(e) => setTargetWeight(e.target.value)}
                  placeholder="20.000"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Size
                </label>
                <input
                  type="text"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="e.g. 16"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Order Date *
                </label>
                <input
                  type="date"
                  required
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs"
                />
              </div>
            </div>

            {/* Canonical Process Sequence Selection */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xs space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Selected Manufacturing Processes (Canonical Order Preserved) *
                </label>
                <span className="text-[11px] font-mono text-blue-800">
                  {selectedProcesses.map((p) => PROCESS_DISPLAY_LABELS[p]).join(" → ") ||
                    "None"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CANONICAL_PROCESS_SEQUENCE.map((p, idx) => {
                  const checked = selectedProcesses.includes(p);
                  return (
                    <label
                      key={p}
                      className={`flex items-center gap-2 p-2 border rounded-xs text-xs font-medium cursor-pointer ${
                        checked
                          ? "bg-blue-50 border-blue-600 text-blue-900"
                          : "bg-white border-slate-300 text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProcess(p)}
                      />
                      <span>
                        {idx + 1}. {PROCESS_DISPLAY_LABELS[p]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Photo Upload & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Order Product Photo (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:border file:border-slate-300 file:rounded-xs file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700"
                />
                {uploadingPhoto && (
                  <p className="text-[11px] text-blue-700 mt-1">
                    Uploading photo...
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Workshop Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions..."
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs"
                />
              </div>
            </div>

            {/* Worksheet AD Details */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Job Card AD Stone Specification Rows
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setAdDetails((prev) => [
                      ...prev,
                      { id: `ad-${Date.now()}`, adSize: "", adPieces: 0 },
                    ])
                  }
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  + Add AD Row
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {adDetails.map((ad, i) => (
                  <div
                    key={ad.id}
                    className="flex items-center gap-1 bg-slate-50 p-1.5 border border-slate-200 rounded-xs"
                  >
                    <input
                      type="text"
                      value={ad.adSize}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAdDetails((prev) =>
                          prev.map((item, idx) =>
                            idx === i ? { ...item, adSize: val } : item
                          )
                        );
                      }}
                      placeholder="Size"
                      className="w-1/2 px-1.5 py-1 text-xs bg-white border border-slate-300 rounded-xs"
                    />
                    <input
                      type="number"
                      min="0"
                      value={ad.adPieces || ""}
                      onChange={(e) => {
                        const val = Number(e.target.value || 0);
                        setAdDetails((prev) =>
                          prev.map((item, idx) =>
                            idx === i ? { ...item, adPieces: val } : item
                          )
                        );
                      }}
                      placeholder="Pcs"
                      className="w-1/2 px-1.5 py-1 text-xs bg-white border border-slate-300 rounded-xs font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xs hover:bg-slate-100 cursor-pointer"
              >
                Print Job Card
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadManufacturingWorksheet(
                    adaptV2OrderToV1WorksheetPDFData(previewInput)
                  )
                }
                className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xs hover:bg-slate-100 cursor-pointer"
              >
                Download V1 Worksheet PDF
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xs cursor-pointer"
              >
                {submitting ? "Creating Order..." : "Create Order & Open Register"}
              </button>
            </div>
          </form>

          {/* Right: Preserved V1 Live Preview (Exact 400px Layout) */}
          <div className="lg:col-span-5 flex flex-col items-center bg-white border border-slate-200 rounded-xs p-4">
            <div className="w-full flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <span className="text-xs font-bold text-slate-800">
                Preserved V1 Live Job Card Preview (400px)
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                Exact V1 Typography & Borders
              </span>
            </div>
            <ManufacturingWorksheetPreview {...v1PreviewProps} />
            <OrderQrAttachment
              orderId=""
              bagNumber={bagNumber}
              orderName={orderName}
              purityLabel={selectedPurity?.displayLabel || "22K (92%)"}
              customerName={selectedCustomer?.name || quickCustomerName || ""}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

