import { prisma } from "@/lib/prisma";

export interface QrScanBridgeEvent {
  scanId: string;
  orderId: string;
  bagNumber: string;
  orderName: string;
  customerName: string;
  scannedAt: number;
}

export const globalForQrBridge = globalThis as unknown as {
  latestQrScanEvent?: QrScanBridgeEvent;
  lastLaptopPollAt?: number;
};

export async function getLatestQrScanEvent(): Promise<QrScanBridgeEvent | null> {
  if (
    globalForQrBridge.latestQrScanEvent &&
    Date.now() - globalForQrBridge.latestQrScanEvent.scannedAt < 30_000
  ) {
    return globalForQrBridge.latestQrScanEvent;
  }

  try {
    const recentEvent = await prisma.auditEvent.findFirst({
      where: {
        entityType: "QR_SCAN_BRIDGE",
        action: "QR_SCAN_RELAY",
        createdAt: { gte: new Date(Date.now() - 30_000) },
      },
      orderBy: { createdAt: "desc" },
      select: { metadataJson: true },
    });
    if (recentEvent?.metadataJson) {
      const parsed = JSON.parse(recentEvent.metadataJson) as QrScanBridgeEvent;
      globalForQrBridge.latestQrScanEvent = parsed;
      return parsed;
    }
  } catch {
    // ignore transient DB read error on poll
  }

  return null;
}

export async function recordQrScanRelay(
  rawTarget: string
): Promise<
  | { ok: true; event: QrScanBridgeEvent }
  | { ok: false; status: number; error: string }
> {
  const trimmed = rawTarget.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: 400,
      error: "Order ID or Bag Number is required",
    };
  }

  const cleanBag = trimmed.replace(/^bag-/i, "").trim();
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { id: trimmed },
        { bagNumber: trimmed },
        { bagNumber: cleanBag },
      ],
    },
    select: {
      id: true,
      organizationId: true,
      bagNumber: true,
      orderName: true,
      customer: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!order) {
    return {
      ok: false,
      status: 404,
      error: `No order found for scanned code "${cleanBag}". Please make sure the order is saved first.`,
    };
  }

  const event: QrScanBridgeEvent = {
    scanId: `${order.id}-${Date.now()}`,
    orderId: order.id,
    bagNumber: order.bagNumber,
    orderName: order.orderName,
    customerName: order.customer.name,
    scannedAt: Date.now(),
  };

  globalForQrBridge.latestQrScanEvent = event;

  // Persist to Neon PostgreSQL so Vercel serverless instances share phone-to-laptop scans
  await prisma.auditEvent.create({
    data: {
      organizationId: order.organizationId,
      entityType: "QR_SCAN_BRIDGE",
      entityId: order.id,
      action: "QR_SCAN_RELAY",
      summary: `QR scan relay for Bag #${order.bagNumber}`,
      metadataJson: JSON.stringify(event),
    },
  });

  return { ok: true, event };
}
