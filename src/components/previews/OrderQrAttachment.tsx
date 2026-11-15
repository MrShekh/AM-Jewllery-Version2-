"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface OrderQrAttachmentProps {
  orderId: string;
  bagNumber: string;
  orderName: string;
  purityLabel: string;
  customerName?: string;
  baseUrl?: string;
}

export function buildOrderQrTargetUrl(
  orderIdOrBag: string,
  baseUrl?: string
): string {
  const browserOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const isRemoteBrowserOrigin =
    Boolean(browserOrigin) &&
    !browserOrigin.includes("localhost") &&
    !browserOrigin.includes("127.0.0.1");
  const root = (
    baseUrl ||
    (isRemoteBrowserOrigin ? browserOrigin : "") ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    browserOrigin ||
    "http://localhost:3001"
  ).replace(/\/+$/, "");
  return `${root}/scan/${encodeURIComponent(orderIdOrBag)}`;
}

/**
 * Renders the Order QR Code as an optional attachment/footer OUTSIDE the original
 * 400px V1 worksheet box, or as a standalone printable job-card QR label (Rule 2 & Rule 11).
 * Uses the laptop's LAN IP so scanning with a phone opens the bag's entry page on the laptop.
 */
export const OrderQrAttachment: React.FC<OrderQrAttachmentProps> = ({
  orderId,
  bagNumber,
  orderName,
  purityLabel,
  customerName,
  baseUrl,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [detectedBaseUrl, setDetectedBaseUrl] = useState<string>(baseUrl || "");

  useEffect(() => {
    if (baseUrl) {
      setDetectedBaseUrl(baseUrl);
      return;
    }
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
  }, [baseUrl]);

  const effectiveIdentifier = orderId || (bagNumber ? `bag-${bagNumber}` : "pending");
  const targetUrl = buildOrderQrTargetUrl(
    effectiveIdentifier,
    detectedBaseUrl || baseUrl
  );

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(targetUrl, {
      width: 120,
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
  }, [targetUrl]);

  return (
    <div
      className="bg-white border border-slate-300 rounded-md p-2.5 mt-2 flex items-center justify-between gap-3 text-slate-900 shadow-xs"
      style={{ width: "400px", fontFamily: "Arial, sans-serif" }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
          Scan QR to Open Entry Page on Laptop
        </div>
        <div className="text-xs font-bold mt-0.5 truncate">
          Bag #{bagNumber || "---"} • {orderName || "Order"}
        </div>
        <div className="text-[11px] text-slate-700 font-medium">
          Purity: {purityLabel}
          {customerName ? ` • ${customerName}` : ""}
        </div>
        <div className="text-[9px] text-slate-500 font-mono truncate mt-1">
          {targetUrl}
        </div>
      </div>
      <div className="shrink-0 border border-slate-300 p-1 bg-white rounded-xs">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt={`QR Code for Bag ${bagNumber}`}
            width={76}
            height={76}
            className="block"
          />
        ) : (
          <div className="w-[76px] h-[76px] flex items-center justify-center text-[10px] text-slate-400">
            QR...
          </div>
        )}
      </div>
    </div>
  );
};
