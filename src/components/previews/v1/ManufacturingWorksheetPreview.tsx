"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildOrderQrTargetUrl } from "@/components/previews/OrderQrAttachment";

export interface AdDetail {
  id: string;
  adSize: string;
  adPieces: number;
}

export interface ManufacturingWorksheetPreviewProps {
  customerName: string;
  orderNumber: string;
  orderName: string;
  date: string;
  deliveryDate: string;
  selectedKarat: string;
  weightInGrams: number;
  size: string;
  selectedProcesses: string[];
  adDetails: AdDetail[];
  productImage?: string;
  qrCodeOrderId?: string;
  qrCodeBagNumber?: string;
}

export const ManufacturingWorksheetPreview: React.FC<
  ManufacturingWorksheetPreviewProps
> = ({
  customerName,
  orderNumber,
  orderName,
  date,
  deliveryDate,
  selectedKarat,
  weightInGrams,
  size,
  adDetails,
  productImage,
  qrCodeOrderId,
  qrCodeBagNumber,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [detectedBaseUrl, setDetectedBaseUrl] = useState<string>("");

  const showQr = qrCodeOrderId !== undefined || qrCodeBagNumber !== undefined;

  useEffect(() => {
    if (!showQr) return;
    let active = true;
    fetch("/api/qr-bridge")
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.lanBaseUrl) {
          setDetectedBaseUrl(data.lanBaseUrl);
        }
      })
      .catch(() => {
        // Fallback to window.location.origin
      });
    return () => {
      active = false;
    };
  }, [showQr]);

  useEffect(() => {
    if (!showQr) {
      setQrDataUrl("");
      return;
    }
    const effectiveIdentifier =
      qrCodeOrderId || (qrCodeBagNumber ? `bag-${qrCodeBagNumber}` : "pending");
    const targetUrl = buildOrderQrTargetUrl(effectiveIdentifier, detectedBaseUrl);
    let mounted = true;
    QRCode.toDataURL(targetUrl, {
      width: 140,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (mounted) setQrDataUrl(url);
      })
      .catch(() => {
        if (mounted) setQrDataUrl("");
      });
    return () => {
      mounted = false;
    };
  }, [showQr, qrCodeOrderId, qrCodeBagNumber, detectedBaseUrl]);
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB");
  };

  const getKaratDisplay = (karat: string) => {
    switch (karat) {
      case "22K (92%)":
        return "22KT";
      case "18K (75%)":
        return "18KT";
      case "14K (59%)":
        return "14KT";
      case "9K (37.5%)":
        return "9KT";
      default:
        return karat;
    }
  };

  const totalAdPieces = adDetails.reduce(
    (sum, item) => sum + (item.adPieces || 0),
    0
  );

  const procGridClass = "grid grid-cols-[1.2fr_1fr_1fr_1fr_0.9fr]";

  const renderBlankRow = (key: string) => (
    <div key={key} className={`${procGridClass} border-b border-black`}>
      <div className="px-1 border-r border-black h-6" />
      <div className="border-r border-black h-6" />
      <div className="border-r border-black h-6" />
      <div className="border-r border-black h-6" />
      <div className="h-6" />
    </div>
  );

  const renderProcessSection = (label: string, keyPrefix: string) => (
    <React.Fragment key={keyPrefix}>
      <div className={`${procGridClass} border-b border-black`}>
        <div className="px-1 border-r border-black font-bold text-[10px] h-7 flex items-center">
          {label}
        </div>
        <div className="border-r border-black h-7" />
        <div className="border-r border-black h-7" />
        <div className="border-r border-black h-7" />
        <div className="h-7" />
      </div>
      {renderBlankRow(`${keyPrefix}-r2`)}
      {renderBlankRow(`${keyPrefix}-r3`)}
    </React.Fragment>
  );

  return (
    <div
      className="bg-white p-1.5 rounded-lg shadow-lg border border-gray-300 relative text-black break-inside-avoid"
      style={{
        fontFamily: "Arial, sans-serif",
        fontSize: "10px",
        width: "345px",
      }}
    >
      <div className="border border-black">
        {/* Top Media Strip: Order Info (Left) + QR & Product Image Side-by-Side (Right) */}
        <div className="grid grid-cols-[1fr_auto] border-b border-black">
          <div className="min-w-0">
            <div className="bg-yellow-200 px-1.5 py-1 border-b border-black flex items-center justify-between gap-1 font-bold">
              <span className="text-xs font-mono">
                {orderNumber ? `#${orderNumber}` : "BAG #"}
              </span>
              <span className="text-xs tracking-tight truncate">
                AM JEWELLARS
              </span>
              <span className="text-[10px] bg-white px-1 border border-black rounded-xs shrink-0">
                {getKaratDisplay(selectedKarat)}
              </span>
            </div>
            <div className="p-1.5 space-y-0.5 text-[10px] leading-tight">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate">
                  Customer: <strong>{customerName}</strong>
                </span>
                <span className="shrink-0">
                  Wt:{" "}
                  <strong className="text-blue-700">
                    {weightInGrams > 0 ? `${weightInGrams}g` : "—"}
                  </strong>
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="truncate">
                  Order: <strong>{orderName}</strong>
                </span>
                <span className="shrink-0">
                  Size: <strong>{size || "—"}</strong>
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[9.5px] text-gray-800">
                <span>In: {formatDate(date) || "—"}</span>
                <span>Due: {formatDate(deliveryDate) || "—"}</span>
              </div>
            </div>
          </div>

          {(showQr || productImage) && (
            <div className="border-l border-black p-1 flex items-center gap-1 bg-white shrink-0">
              {showQr && qrDataUrl && (
                <div className="border border-gray-300 p-0.5 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt={`QR Code for Bag ${qrCodeBagNumber || orderNumber}`}
                    className="w-[54px] h-[54px] object-contain block"
                  />
                </div>
              )}
              {productImage && (
                <div className="border border-gray-300 p-0.5 bg-white w-[54px] h-[54px] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={productImage}
                    alt="Product"
                    className="max-w-full max-h-full object-contain block"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Full-Width Process Table */}
        <div
          className={`${procGridClass} border-b border-black bg-gray-100 font-bold text-center text-[9.5px]`}
        >
          <div className="p-1 border-r border-black">PROCESS</div>
          <div className="p-1 border-r border-black">IN (g)</div>
          <div className="p-1 border-r border-black">OUT (g)</div>
          <div className="p-1 border-r border-black">EXTRA (g)</div>
          <div className="p-1">LOSS (g)</div>
        </div>

        {renderProcessSection("FILING", "filing")}
        {renderProcessSection("F. POLISH", "fpolish")}
        {renderProcessSection("SETTING", "setting")}

        {/* AD & KL Blue Rows */}
        <div className={`${procGridClass} border-b border-black bg-blue-100`}>
          <div className="px-1 border-r border-black font-bold text-[10px] h-6 flex items-center">
            AD
          </div>
          <div className="border-r border-black h-6" />
          <div className="border-r border-black h-6" />
          <div className="border-r border-black h-6" />
          <div className="h-6" />
        </div>
        <div className={`${procGridClass} border-b border-black bg-blue-100`}>
          <div className="px-1 border-r border-black font-bold text-[10px] h-6 flex items-center">
            KL
          </div>
          <div className="border-r border-black h-6" />
          <div className="border-r border-black h-6" />
          <div className="border-r border-black h-6" />
          <div className="h-6" />
        </div>

        {renderProcessSection("FINAL POLISH", "finalpolish")}

        {/* AD Details Header */}
        <div className="grid grid-cols-5 border-b border-black bg-gray-100 text-[9px] font-bold text-center">
          <div className="p-0.5 border-r border-black">AD SIZE</div>
          <div className="p-0.5 border-r border-black">AD PIS</div>
          <div className="p-0.5 border-r border-black">AD SIZ</div>
          <div className="p-0.5 border-r border-black">AD PIS</div>
          <div className="p-0.5">TOTAL</div>
        </div>

        {/* AD Details Rows */}
        {Array.from(
          { length: Math.max(2, Math.ceil(adDetails.length / 2)) },
          (_, rowIndex) => {
            const leftAd = adDetails[rowIndex * 2];
            const rightAd = adDetails[rowIndex * 2 + 1];

            return (
              <div
                key={rowIndex}
                className="grid grid-cols-5 border-b border-black text-center text-[10px]"
              >
                <div className="p-0.5 border-r border-black h-5">
                  {leftAd?.adSize || ""}
                </div>
                <div className="p-0.5 border-r border-black h-5">
                  {leftAd?.adPieces || ""}
                </div>
                <div className="p-0.5 border-r border-black h-5">
                  {rightAd?.adSize || ""}
                </div>
                <div className="p-0.5 border-r border-black h-5">
                  {rightAd?.adPieces || ""}
                </div>
                <div className="p-0.5 font-bold h-5">
                  {rowIndex === 0 && totalAdPieces > 0 ? totalAdPieces : ""}
                </div>
              </div>
            );
          }
        )}

        {/* Summary Footer */}
        <div className="grid grid-cols-3 bg-yellow-200 font-bold text-[10px]">
          <div className="p-1.5 border-r border-black">FINISH WT:</div>
          <div className="p-1.5 border-r border-black">AD / KL TOTAL:</div>
          <div className="p-1.5">TOTAL LOSS:</div>
        </div>
      </div>
    </div>
  );
};

