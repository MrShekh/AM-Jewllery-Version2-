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

  const procGridClass =
    "grid grid-cols-[1.15fr_0.8fr_0.8fr_1.05fr_0.8fr_1.15fr]";

  return (
    <div
      className="bg-white p-1.5 rounded-lg shadow-lg border border-gray-300 relative text-black break-inside-avoid"
      style={{
        fontFamily: "Arial, sans-serif",
        fontSize: "9.5px",
        width: "365px",
      }}
    >
      {/* Top Header */}
      <div className="grid grid-cols-6 border border-black">
        <div className="bg-yellow-200 p-1 border-r border-black font-bold text-center text-xs">
          {orderNumber || "BAG NO-"}
        </div>
        <div className="col-span-4 bg-yellow-200 p-1 border-r border-black font-bold text-center text-sm">
          AM JEWELLARS
        </div>
        <div className="bg-yellow-200 p-1 text-center text-xs"></div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-6 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black font-bold text-[11px]">DATE-</div>
        <div className="p-1 border-r border-black font-bold text-[11px] col-span-2">
          Customer Name
        </div>
        <div className="p-1 border-r border-black font-bold text-[11px]">ORDER</div>
        <div className="p-1 border-r border-black font-bold text-center text-[11px]">
          {getKaratDisplay(selectedKarat)}
        </div>
        <div className="p-1 text-center text-[11px]"></div>
      </div>

      {/* Third Row - Values */}
      <div className="grid grid-cols-6 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black text-center text-[11px]">
          {formatDate(date)}
        </div>
        <div className="p-1 border-r border-black text-center font-bold text-[11px] col-span-2">
          {customerName}
        </div>
        <div className="p-1 border-r border-black text-center text-[11px]">
          {orderName}
        </div>
        <div className="p-1 border-r border-black text-center font-bold text-[11px]">
          {size ? `Size - ${size}` : ""}
        </div>
        <div className="p-1 text-center font-bold text-[11px]">D DATE -</div>
      </div>

      {/* Fourth Row - Process Header */}
      <div className={`${procGridClass} border-l border-r border-b border-black`}>
        <div className="p-0.5 border-r border-black text-center font-bold text-[9px] leading-tight flex items-center justify-center">
          Entry / Date
        </div>
        <div className="p-0.5 border-r border-black text-center font-bold text-[9px] leading-tight flex items-center justify-center">
          IN (g)
        </div>
        <div className="p-0.5 border-r border-black text-center font-bold text-[9px] leading-tight flex items-center justify-center">
          OUT (g)
        </div>
        <div className="p-0.5 border-r border-black text-center font-bold text-[8.5px] leading-tight flex items-center justify-center">
          Extra Return (g)
        </div>
        <div className="p-0.5 border-r border-black text-center font-bold text-[9px] leading-tight flex items-center justify-center">
          Loss (g)
        </div>
        <div className="p-0.5 text-center text-[10px] flex items-center justify-center">
          {formatDate(deliveryDate)}
        </div>
      </div>

      {/* Process Rows: FAILING through F PALISH with optional QR code above the image */}
      <div className="relative">
        {/* FAILING (3 handwriting rows) */}
        <div className={`${procGridClass} border-l border-r border-b border-black`}>
          <div className="p-0.5 border-r border-black font-bold text-[10px] h-5 flex items-center">
            FAILING
          </div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 h-5"></div>
        </div>
        <div className={`${procGridClass} border-l border-r border-b border-black`}>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 h-4"></div>
        </div>
        <div className={`${procGridClass} border-l border-r border-b border-black`}>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 h-4"></div>
        </div>

        {/* F PALISH (3 handwriting rows) */}
        <div className={`${procGridClass} border-l border-r border-b border-black`}>
          <div className="p-0.5 border-r border-black font-bold text-[10px] h-5 flex items-center">
            F PALISH
          </div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 h-5"></div>
        </div>
        <div className={`${procGridClass} border-l border-r border-b border-black`}>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 h-4"></div>
        </div>
        <div className={`${procGridClass} border-l border-r border-b border-black`}>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 h-4"></div>
        </div>

        {/* QR Code placed directly above the product image in the right column */}
        {showQr && qrDataUrl && (
          <div
            className="absolute top-0 bottom-0 right-0 flex items-center justify-center border-l border-r border-b border-black bg-white"
            style={{
              width: "20%",
              padding: "2px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt={`QR Code for Bag ${qrCodeBagNumber || orderNumber}`}
              className="w-[64px] h-[64px] object-contain block"
            />
          </div>
        )}
      </div>

      {/* SETTING (3 handwriting rows) + AD with merged image space */}
      <div className="relative">
        {/* SETTING Row 1 */}
        <div className={`${procGridClass} border-l border-r border-b border-black`}>
          <div className="p-0.5 border-r border-black font-bold text-[10px] h-5 flex items-center">
            SETTING
          </div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 h-5"></div>
        </div>
        {/* SETTING Row 2 */}
        <div className={`${procGridClass} border-l border-r border-b border-black`}>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 h-4"></div>
        </div>
        {/* SETTING Row 3 */}
        <div className={`${procGridClass} border-l border-r border-b border-black`}>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 border-r border-black h-4"></div>
          <div className="p-0.5 h-4"></div>
        </div>

        {/* AD Row - Blue Background */}
        <div className={`${procGridClass} border-l border-r border-b border-black bg-blue-200`}>
          <div className="p-0.5 border-r border-black font-bold text-center text-[10px] h-5 flex items-center justify-center">
            AD
          </div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 border-r border-black h-5"></div>
          <div className="p-0.5 h-5 bg-white"></div>
        </div>

        {/* Product Image spanning SETTING and AD rows */}
        {productImage && (
          <div
            className="absolute top-0 right-0 flex items-center justify-center border-l border-black bg-white"
            style={{
              width: "20%",
              height: "72px",
              padding: "2px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={productImage}
              alt="Product"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}
      </div>

      {/* KL Row - Blue Background */}
      <div className={`${procGridClass} border-l border-r border-b border-black bg-blue-200`}>
        <div className="p-0.5 border-r border-black font-bold text-center text-[10px] h-6 flex items-center justify-center">
          KL
        </div>
        <div className="p-0.5 border-r border-black h-6"></div>
        <div className="p-0.5 border-r border-black h-6"></div>
        <div className="p-0.5 border-r border-black h-6"></div>
        <div className="p-0.5 border-r border-black h-6"></div>
        <div className="p-0.5 h-6 flex items-center justify-center bg-white">
          <div className="text-center leading-tight">
            <div className="text-[10px] font-bold text-red-600">WT-</div>
            {weightInGrams > 0 && (
              <div className="text-[10px] font-bold text-blue-600">
                {weightInGrams}g
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TOTAL Row */}
      <div className={`${procGridClass} border-l border-r border-b border-black bg-gray-200`}>
        <div className="p-0.5 border-r border-black font-bold text-center text-[10px] h-5 flex items-center justify-center">
          TOTAL
        </div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 h-5 bg-white"></div>
      </div>

      {/* Empty Row after TOTAL */}
      <div className={`${procGridClass} border-l border-r border-b border-black`}>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 h-5 text-center font-bold text-[9px] flex items-center justify-center">
          FENESH WT
        </div>
      </div>

      {/* PALISH (3 handwriting rows) */}
      <div className={`${procGridClass} border-l border-r border-b border-black bg-gray-200`}>
        <div className="p-0.5 border-r border-black font-bold text-center text-[10px] h-5 flex items-center justify-center">
          PALISH
        </div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 border-r border-black h-5"></div>
        <div className="p-0.5 h-5 bg-white"></div>
      </div>
      <div className={`${procGridClass} border-l border-r border-b border-black`}>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 h-4"></div>
      </div>
      <div className={`${procGridClass} border-l border-r border-b border-black`}>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 border-r border-black h-4"></div>
        <div className="p-0.5 h-4"></div>
      </div>

      {/* AD Details Header */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black bg-gray-100">
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          AD SIZE
        </div>
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          AD PIS
        </div>
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          AD SIZ
        </div>
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          AD PIS
        </div>
        <div className="p-1 font-bold text-center text-xs">TOTAL</div>
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
              className="grid grid-cols-5 border-l border-r border-b border-black"
            >
              <div className="p-1 border-r border-black text-center text-xs h-5">
                {leftAd?.adSize || ""}
              </div>
              <div className="p-1 border-r border-black text-center text-xs h-5">
                {leftAd?.adPieces || ""}
              </div>
              <div className="p-1 border-r border-black text-center text-xs h-5">
                {rightAd?.adSize || ""}
              </div>
              <div className="p-1 border-r border-black text-center text-xs h-5">
                {rightAd?.adPieces || ""}
              </div>
              <div className="p-1 text-center font-bold text-xs h-5">
                {rowIndex === 0 && totalAdPieces > 0 ? totalAdPieces : ""}
              </div>
            </div>
          );
        }
      )}

      {/* TOTAL LOSS Footer */}
      <div className="border-l border-r border-b border-black bg-yellow-300 p-2 text-center font-bold text-xs">
        TOTAL LOSS
      </div>

      {/* Additional space below TOTAL LOSS */}
      <div className="border-l border-r border-b border-black h-6 bg-white"></div>
    </div>
  );
};

