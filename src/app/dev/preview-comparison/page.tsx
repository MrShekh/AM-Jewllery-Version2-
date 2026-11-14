"use client";

import React from "react";
import Link from "next/link";
import { ManufacturingWorksheetPreview } from "@/components/previews/v1/ManufacturingWorksheetPreview";
import {
  PreservedV1BillPreview,
  SYNTHETIC_V1_BILL_FIXTURE,
  SYNTHETIC_V1_WORKSHEET_FIXTURE,
} from "@/components/previews/v1/BillPreview";
import { adaptV2OrderToV1WorksheetProps } from "@/lib/previews/v2-preview-adapter";
import { OrderQrAttachment } from "@/components/previews/OrderQrAttachment";

/**
 * Developer Preview Comparison Page (Rule 2)
 * Compares the copied V1 template and the V2 adapted template side-by-side
 * using synthetic in-memory fixtures (zero database pollution).
 */
export default function DeveloperPreviewComparisonPage() {
  const adaptedV2Props = adaptV2OrderToV1WorksheetProps({
    orderId: "ord_synthetic_4360",
    bagNumber: "4360",
    customerName: "Zaveri Bazaar Traders",
    orderName: "LR RING",
    orderDate: "2026-11-08",
    dueDate: "2026-11-15",
    purityDisplayLabel: "22K (92%)",
    targetWeightGrams: 20,
    size: "16",
    selectedProcesses: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
    adDetails: [
      { id: "ad-1", adSize: "1.5mm", adPieces: 6 },
      { id: "ad-2", adSize: "2.0mm", adPieces: 4 },
    ],
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 space-y-6">
      <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 no-print">
        <div>
          <h1 className="text-base font-bold text-slate-900">
            V1 vs V2 Document Preview Preservation & Print Comparison
          </h1>
          <p className="text-xs text-slate-600">
            Uses synthetic in-memory fixtures (no database records created) to compare the copied V1 template and the V2 adapter output side-by-side at exact 400px print width.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-semibold bg-blue-700 text-white rounded-xs cursor-pointer"
          >
            Test Browser Print / PDF Output
          </button>
          <Link
            href="/production-register"
            className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-xs hover:bg-slate-100"
          >
            Back to Production Register
          </Link>
        </div>
      </div>

      {/* Side-by-Side Order Job Card Comparison */}
      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        <div className="bg-white border border-slate-200 rounded-xs p-4 flex flex-col items-center">
          <div className="w-full border-b border-slate-200 pb-2 mb-4 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">
              1. Copied V1 ManufacturingWorksheetPreview (Direct Fixture)
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Width: 400px • Arial 10px
            </span>
          </div>
          <ManufacturingWorksheetPreview {...SYNTHETIC_V1_WORKSHEET_FIXTURE} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xs p-4 flex flex-col items-center">
          <div className="w-full border-b border-slate-200 pb-2 mb-4 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">
              2. V2 Adapted Order Preview + Optional External QR Footer
            </span>
            <span className="text-[11px] font-mono text-blue-800">
              Original 400px Box Unmodified
            </span>
          </div>
          <ManufacturingWorksheetPreview {...adaptedV2Props} />
          <OrderQrAttachment
            orderId="ord_synthetic_4360"
            bagNumber="4360"
            orderName="LR RING"
            purityLabel="22K (92%)"
            customerName="Zaveri Bazaar Traders"
          />
        </div>
      </div>

      {/* Preserved V1 Bill Preview Fixture (For Increment 2 Billing) */}
      <div className="max-w-[1400px] mx-auto bg-white border border-slate-200 rounded-xs p-4 flex flex-col items-center">
        <div className="w-full border-b border-slate-200 pb-2 mb-4 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900">
            3. Preserved V1 Bill Preview Template (Synthetic Fixture for Later Billing Increment)
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            Safe DOM Rendering (No Untrusted HTML Execution)
          </span>
        </div>
        <PreservedV1BillPreview data={SYNTHETIC_V1_BILL_FIXTURE} />
      </div>
    </div>
  );
}

