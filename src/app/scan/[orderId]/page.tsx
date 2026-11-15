import React from "react";
import { recordQrScanRelay } from "@/lib/qr-bridge";
import ScanRelayClient from "./ScanRelayClient";

export const dynamic = "force-dynamic";

export default async function QrScanRelayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const rawTarget = decodeURIComponent(orderId || "");
  const result = await recordQrScanRelay(rawTarget);

  if (result.ok) {
    return (
      <ScanRelayClient
        rawTarget={rawTarget}
        initialStatus="SENT"
        initialInfo={{
          orderId: result.event.orderId,
          bagNumber: result.event.bagNumber,
          orderName: result.event.orderName,
          customerName: result.event.customerName,
        }}
        initialError=""
      />
    );
  }

  return (
    <ScanRelayClient
      rawTarget={rawTarget}
      initialStatus="ERROR"
      initialInfo={null}
      initialError={result.error}
    />
  );
}
