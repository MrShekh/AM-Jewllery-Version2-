"use client";

import React from "react";
import { AdDetail, ManufacturingWorksheetPreviewProps } from "./ManufacturingWorksheetPreview";

/**
 * Preserved V1 Bill Preview Generator & Synthetic Fixtures (Rule 2)
 * Kept available for the developer comparison page (/dev/preview-comparison)
 * and future billing increment without executing untrusted scripts.
 */
export interface PreservedBillItem {
  id: string;
  orderNumber: string;
  orderName: string;
  karat: string;
  netWeight: number;
  stoneWeight: number;
  adWeight: number;
  wastagePercent: number;
  wastageWeight: number;
  grossWeight: number;
  totalFineGold: number;
  makingChargesRupees: number;
}

export interface PreservedBillData {
  billNumber: string;
  date: string;
  customerName: string;
  customerPhone?: string;
  pastJamaGold?: number;
  items: PreservedBillItem[];
  productImage?: string;
}

export const PreservedV1BillPreview: React.FC<{ data: PreservedBillData }> = ({
  data,
}) => {
  const currentTotalFine = data.items.reduce(
    (s, i) => s + i.totalFineGold,
    0
  );
  const currentTotalRupees = data.items.reduce(
    (s, i) => s + i.makingChargesRupees,
    0
  );
  const pastJama = data.pastJamaGold ?? 0;
  const netPayableFine = currentTotalFine - pastJama;

  return (
    <div
      className="bg-white border-2 border-gray-800 p-4 text-black shadow-md"
      style={{
        fontFamily: "Arial, sans-serif",
        width: "760px",
        fontSize: "12px",
      }}
    >
      {/* Header */}
      <div className="grid grid-cols-12 border-2 border-black">
        <div className="col-span-8 p-3 border-r-2 border-black">
          <div className="text-2xl font-extrabold tracking-wide text-gray-900">
            AM Jwellers
          </div>
          <div className="text-xs font-semibold text-gray-700 mt-1">
            Shekh Nayem • Patavadi Chowk • Phone: 9907047429
          </div>
          <div className="mt-3 pt-2 border-t border-gray-400">
            <span className="font-bold">TO: </span>
            <span className="font-bold text-sm">{data.customerName}</span>
            {data.customerPhone && (
              <span className="ml-3 text-xs text-gray-600">
                ({data.customerPhone})
              </span>
            )}
          </div>
        </div>
        <div className="col-span-4 bg-blue-50 p-3 flex flex-col justify-between">
          <div>
            <div className="font-bold text-sm text-blue-900">
              INVOICE: {data.billNumber}
            </div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">
              DATE: {data.date}
            </div>
          </div>
          {pastJama > 0 && (
            <div className="mt-2 bg-yellow-200 border border-black p-1.5 text-xs font-bold">
              Past Jama Gold: {pastJama.toFixed(3)} g
            </div>
          )}
        </div>
      </div>

      {/* 9-Column Items Table */}
      <table className="w-full border-collapse border-l-2 border-r-2 border-b-2 border-black mt-0 text-xs">
        <thead>
          <tr className="bg-gray-200 border-b-2 border-black">
            <th className="border-r border-black p-1.5 text-center w-8">Sr</th>
            <th className="border-r border-black p-1.5 text-left">
              Order Detail
            </th>
            <th className="border-r border-black p-1.5 text-right">Net Wt</th>
            <th className="border-r border-black p-1.5 text-right">Stone</th>
            <th className="border-r border-black p-1.5 text-right">Ad Wt</th>
            <th className="border-r border-black p-1.5 text-right">Wastage</th>
            <th className="border-r border-black p-1.5 text-right">
              Gross Wt
            </th>
            <th className="border-r border-black p-1.5 text-right">
              Total (Fine)
            </th>
            <th className="p-1.5 text-right">Rupees</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, idx) => (
            <tr key={item.id} className="border-b border-black">
              <td className="border-r border-black p-1.5 text-center">
                {idx + 1}
              </td>
              <td className="border-r border-black p-1.5 font-semibold">
                #{item.orderNumber} - {item.orderName} ({item.karat})
              </td>
              <td className="border-r border-black p-1.5 text-right font-mono">
                {item.netWeight.toFixed(3)}
              </td>
              <td className="border-r border-black p-1.5 text-right font-mono">
                {item.stoneWeight.toFixed(3)}
              </td>
              <td className="border-r border-black p-1.5 text-right font-mono">
                {item.adWeight.toFixed(3)}
              </td>
              <td className="border-r border-black p-1.5 text-right font-mono">
                {item.wastageWeight.toFixed(3)} ({item.wastagePercent}%)
              </td>
              <td className="border-r border-black p-1.5 text-right font-mono">
                {item.grossWeight.toFixed(3)}
              </td>
              <td className="border-r border-black p-1.5 text-right font-mono font-bold">
                {item.totalFineGold.toFixed(3)}
              </td>
              <td className="p-1.5 text-right font-mono">
                ₹{item.makingChargesRupees.toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Billing Summary */}
      <div className="grid grid-cols-12 border-l-2 border-r-2 border-b-2 border-black bg-gray-50">
        <div className="col-span-7 p-2 border-r border-black text-xs text-gray-600">
          Preserved V1 Bill Preview Template (Read-Only Synthetic Fixture for Increment 2 Billing)
        </div>
        <div className="col-span-5 p-2 text-xs">
          <div className="font-bold border-b border-gray-400 pb-1 mb-1">
            BILLING SUMMARY
          </div>
          <div className="flex justify-between py-0.5">
            <span>Past jama order:</span>
            <span className="font-mono">{pastJama.toFixed(3)} g</span>
          </div>
          <div className="flex justify-between py-0.5">
            <span>Current order:</span>
            <span className="font-mono">{currentTotalFine.toFixed(3)} g</span>
          </div>
          <div className="flex justify-between py-1 border-t border-black font-bold">
            <span>Total Fine Gold:</span>
            <span className="font-mono">{netPayableFine.toFixed(3)} g</span>
          </div>
          <div className="flex justify-between py-0.5 font-bold text-blue-900">
            <span>Total Rupees:</span>
            <span className="font-mono">
              ₹{currentTotalRupees.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SYNTHETIC_V1_WORKSHEET_FIXTURE: ManufacturingWorksheetPreviewProps =
  {
    customerName: "Zaveri Bazaar Traders",
    orderNumber: "4360",
    orderName: "LR RING",
    date: "2026-11-08",
    deliveryDate: "2026-11-15",
    selectedKarat: "22K (92%)",
    weightInGrams: 20,
    size: "16",
    selectedProcesses: ["Filing", "Free Polish", "Setting", "Final Polish"],
    adDetails: [
      { id: "ad-1", adSize: "1.5mm", adPieces: 6 },
      { id: "ad-2", adSize: "2.0mm", adPieces: 4 },
    ] as AdDetail[],
  };

export const SYNTHETIC_V1_BILL_FIXTURE: PreservedBillData = {
  billNumber: "INV-2026-0101",
  date: "08/11/2026",
  customerName: "Zaveri Bazaar Traders",
  customerPhone: "9825011223",
  pastJamaGold: 2.5,
  items: [
    {
      id: "line-1",
      orderNumber: "4360",
      orderName: "LR RING",
      karat: "22K (92%)",
      netWeight: 19.2,
      stoneWeight: 0.8,
      adWeight: 1.2,
      wastagePercent: 2.0,
      wastageWeight: 0.384,
      grossWeight: 21.2,
      totalFineGold: 18.048,
      makingChargesRupees: 2400,
    },
  ],
};

