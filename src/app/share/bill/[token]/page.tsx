"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface SharedBillData {
  billNumber: string;
  billDate: string;
  status: string;
  customerName: string;
  totalFineGold: string;
  totalCashRupees: string;
  previewHtml: string;
}

export default function PublicSharedBillPage() {
  const params = useParams<{ token: string }>();
  const [bill, setBill] = useState<SharedBillData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.token) return;
    fetch(`/api/share/bill/${encodeURIComponent(params.token)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || "Link unavailable");
        setBill(d.bill);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Unable to load shared bill")
      );
  }, [params?.token]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white border border-red-300 rounded p-6 max-w-md text-center space-y-2">
          <div className="text-sm font-bold text-red-800">Bill Link Unavailable</div>
          <div className="text-xs text-slate-600">{error}</div>
        </div>
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-xs text-slate-600">
        Loading shared bill...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded p-4 sm:p-6 space-y-4 print:border-0 print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 print:hidden">
          <div>
            <div className="text-sm font-bold text-slate-900">
              Bill {bill.billNumber} — {bill.customerName}
            </div>
            <div className="text-xs text-slate-500">
              Read-only customer copy ({bill.billDate}) • Status: {bill.status}
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded cursor-pointer"
          >
            Print / Save PDF
          </button>
        </div>
        {bill.previewHtml ? (
          <div dangerouslySetInnerHTML={{ __html: bill.previewHtml }} />
        ) : (
          <div className="text-xs text-slate-600">
            Fine Gold: {bill.totalFineGold} g | Cash/Charges: ₹{bill.totalCashRupees}
          </div>
        )}
      </div>
    </div>
  );
}

