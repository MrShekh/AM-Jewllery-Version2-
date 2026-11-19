import { prisma } from "@/lib/prisma";

export type JobCardHolderType =
  | "OFFICE"
  | "CAD_DESIGNER"
  | "FILING"
  | "FREE_POLISH"
  | "SETTING"
  | "NOKSI"
  | "FINAL_POLISH"
  | "COMPLETED";

export interface JobCardTrackingInfo {
  printCount: number;
  lastPrintedAt: string | null;
  holderType: JobCardHolderType | null;
  holderName: string | null;
  holderNote: string | null;
  holderUpdatedAt: string | null;
}

export async function recordJobCardPrints(
  organizationId: string,
  actorId: string,
  orderIds: string[]
): Promise<void> {
  const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  await prisma.auditEvent.createMany({
    data: uniqueIds.map((orderId) => ({
      organizationId,
      actorId,
      entityType: "JOB_CARD_PRINT",
      entityId: orderId,
      action: "JOB_CARD_PRINTED",
      summary: `Printed job card for order ${orderId}`,
      metadataJson: JSON.stringify({
        orderId,
        printedAt: new Date().toISOString(),
      }),
    })),
  });
}

export async function setJobCardHolder(input: {
  organizationId: string;
  actorId: string;
  orderId: string;
  holderType: JobCardHolderType;
  holderName: string;
  holderNote?: string;
}): Promise<JobCardTrackingInfo> {
  const nowIso = new Date().toISOString();
  await prisma.auditEvent.deleteMany({
    where: {
      organizationId: input.organizationId,
      entityType: "JOB_CARD_HOLDER",
      entityId: input.orderId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      entityType: "JOB_CARD_HOLDER",
      entityId: input.orderId,
      action: "JOB_CARD_HOLDER_UPDATED",
      summary: `Job card moved to ${input.holderType}: ${input.holderName}`,
      metadataJson: JSON.stringify({
        holderType: input.holderType,
        holderName: input.holderName.trim(),
        holderNote: (input.holderNote || "").trim(),
        updatedAt: nowIso,
      }),
    },
  });

  const printCount = await prisma.auditEvent.count({
    where: {
      organizationId: input.organizationId,
      entityType: "JOB_CARD_PRINT",
      entityId: input.orderId,
    },
  });

  return {
    printCount,
    lastPrintedAt: null,
    holderType: input.holderType,
    holderName: input.holderName.trim(),
    holderNote: (input.holderNote || "").trim() || null,
    holderUpdatedAt: nowIso,
  };
}

export async function getJobCardTrackingMap(
  organizationId: string
): Promise<Record<string, JobCardTrackingInfo>> {
  const events = await prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType: { in: ["JOB_CARD_PRINT", "JOB_CARD_HOLDER"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      entityType: true,
      entityId: true,
      metadataJson: true,
      createdAt: true,
    },
  });

  const map: Record<string, JobCardTrackingInfo> = {};
  const ensure = (orderId: string): JobCardTrackingInfo => {
    if (!map[orderId]) {
      map[orderId] = {
        printCount: 0,
        lastPrintedAt: null,
        holderType: null,
        holderName: null,
        holderNote: null,
        holderUpdatedAt: null,
      };
    }
    return map[orderId];
  };

  for (const ev of events) {
    const entry = ensure(ev.entityId);
    if (ev.entityType === "JOB_CARD_PRINT") {
      entry.printCount += 1;
      entry.lastPrintedAt = ev.createdAt.toISOString();
    } else if (ev.entityType === "JOB_CARD_HOLDER" && ev.metadataJson) {
      try {
        const meta = JSON.parse(ev.metadataJson) as {
          holderType?: JobCardHolderType;
          holderName?: string;
          holderNote?: string;
          updatedAt?: string;
        };
        entry.holderType = meta.holderType || null;
        entry.holderName = meta.holderName || null;
        entry.holderNote = meta.holderNote || null;
        entry.holderUpdatedAt = meta.updatedAt || ev.createdAt.toISOString();
      } catch {
        // ignore malformed metadata
      }
    }
  }

  return map;
}
