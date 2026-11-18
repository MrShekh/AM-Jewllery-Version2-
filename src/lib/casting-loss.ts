import { prisma } from "@/lib/prisma";
import {
  calculateFineEquivalent,
  formatWeight3,
  roundOperational,
  toDecimal,
  ZERO,
} from "@/lib/decimal";

export type CastingLossFilter = "today" | "month" | "range";

export interface CastingLossEntryItem {
  id: string;
  businessDate: string;
  purityId: string;
  karatLabel: string;
  purityLabel: string;
  touchPercent: string;
  lossWeightGrams: string;
  fineWeightGrams: string;
  note: string;
  createdAt: string;
}

export interface CastingLossKaratGroup {
  purityId: string;
  karatLabel: string;
  purityLabel: string;
  touchPercent: string;
  totalPhysicalGrams: string;
  totalFineGrams: string;
  entryCount: number;
}

export interface CastingLossSummary {
  filter: CastingLossFilter;
  fromDate: string;
  toDate: string;
  month: string;
  totalPhysicalGrams: string;
  totalFineGrams: string;
  entryCount: number;
  byKarat: CastingLossKaratGroup[];
  entries: CastingLossEntryItem[];
}

function getIstTodayYmd(): string {
  const istMs = Date.now() + 330 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

function getMonthBounds(monthYyyyMm: string): {
  fromDate: string;
  toDate: string;
  month: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(monthYyyyMm);
  const todayYmd = getIstTodayYmd();
  const year = match ? Number(match[1]) : Number(todayYmd.slice(0, 4));
  const monthNum = match ? Number(match[2]) : Number(todayYmd.slice(5, 7));
  const safeMonth = Math.min(12, Math.max(1, monthNum));
  const lastDay = new Date(Date.UTC(year, safeMonth, 0)).getUTCDate();
  const mm = String(safeMonth).padStart(2, "0");
  return {
    month: `${year}-${mm}`,
    fromDate: `${year}-${mm}-01`,
    toDate: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

/**
 * Records an informational-only casting loss entry for a selected karat/purity.
 * Intentionally does NOT create any stock journal or alter any stock/customer/karigar balance.
 */
export async function recordCastingLoss(input: {
  organizationId: string;
  actorId: string;
  purityId: string;
  lossWeightGrams: number | string;
  businessDate?: string;
  note?: string;
}): Promise<CastingLossEntryItem> {
  const purity = await prisma.purityDefinition.findFirst({
    where: {
      id: input.purityId,
      organizationId: input.organizationId,
      isActive: true,
    },
  });
  if (!purity) {
    throw new Error("Selected karat/purity was not found.");
  }

  const rawWeight = toDecimal(input.lossWeightGrams);
  const lossWeight = roundOperational(rawWeight);
  if (lossWeight.lte(ZERO)) {
    throw new Error("Casting loss weight must be greater than 0.000 g.");
  }

  const businessDate =
    input.businessDate && /^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)
      ? input.businessDate
      : getIstTodayYmd();

  const fineWeight = roundOperational(
    calculateFineEquivalent(lossWeight, purity.touchPercent)
  );
  const note = (input.note || "").trim();

  const created = await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      entityType: "CASTING_LOSS_RECORD",
      entityId: purity.id,
      action: "CASTING_LOSS_RECORDED",
      summary: `Casting loss ${formatWeight3(lossWeight)} g (${purity.displayLabel}) = ${formatWeight3(fineWeight)} g fine`,
      metadataJson: JSON.stringify({
        businessDate,
        purityId: purity.id,
        karatLabel: purity.karatLabel,
        purityLabel: purity.displayLabel,
        touchPercent: Number(purity.touchPercent).toFixed(2),
        lossWeightGrams: formatWeight3(lossWeight),
        fineWeightGrams: formatWeight3(fineWeight),
        note,
      }),
    },
  });

  return {
    id: created.id,
    businessDate,
    purityId: purity.id,
    karatLabel: purity.karatLabel,
    purityLabel: purity.displayLabel,
    touchPercent: Number(purity.touchPercent).toFixed(2),
    lossWeightGrams: formatWeight3(lossWeight),
    fineWeightGrams: formatWeight3(fineWeight),
    note,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function deleteCastingLoss(
  organizationId: string,
  id: string
): Promise<void> {
  if (!id) {
    throw new Error("Casting loss entry ID is required.");
  }
  await prisma.auditEvent.deleteMany({
    where: {
      id,
      organizationId,
      entityType: "CASTING_LOSS_RECORD",
    },
  });
}

export async function getCastingLossSummary(
  organizationId: string,
  options?: {
    filter?: string | null;
    month?: string | null;
    from?: string | null;
    to?: string | null;
  }
): Promise<CastingLossSummary> {
  const todayYmd = getIstTodayYmd();
  const rawFilter = options?.filter;
  const filter: CastingLossFilter =
    rawFilter === "month" || rawFilter === "range" ? rawFilter : "today";

  let fromDate = todayYmd;
  let toDate = todayYmd;
  let month = todayYmd.slice(0, 7);

  if (filter === "month") {
    const bounds = getMonthBounds(options?.month || month);
    fromDate = bounds.fromDate;
    toDate = bounds.toDate;
    month = bounds.month;
  } else if (filter === "range") {
    const f =
      options?.from && /^\d{4}-\d{2}-\d{2}$/.test(options.from)
        ? options.from
        : todayYmd;
    const t =
      options?.to && /^\d{4}-\d{2}-\d{2}$/.test(options.to) ? options.to : f;
    fromDate = f <= t ? f : t;
    toDate = f <= t ? t : f;
  }

  const events = await prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType: "CASTING_LOSS_RECORD",
      action: "CASTING_LOSS_RECORDED",
    },
    orderBy: { createdAt: "desc" },
  });

  const entries: CastingLossEntryItem[] = [];
  let totalPhysical = ZERO;
  let totalFine = ZERO;
  const karatMap = new Map<
    string,
    {
      purityId: string;
      karatLabel: string;
      purityLabel: string;
      touchPercent: string;
      physical: ReturnType<typeof toDecimal>;
      fine: ReturnType<typeof toDecimal>;
      entryCount: number;
    }
  >();

  for (const ev of events) {
    if (!ev.metadataJson) continue;
    try {
      const meta = JSON.parse(ev.metadataJson) as {
        businessDate?: string;
        purityId?: string;
        karatLabel?: string;
        purityLabel?: string;
        touchPercent?: string;
        lossWeightGrams?: string | number;
        fineWeightGrams?: string | number;
        note?: string;
      };
      const bDate = meta.businessDate || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bDate)) continue;
      if (bDate < fromDate || bDate > toDate) continue;

      const lossWt = roundOperational(toDecimal(meta.lossWeightGrams || 0));
      const fineWt = roundOperational(toDecimal(meta.fineWeightGrams || 0));
      const purityId = meta.purityId || ev.entityId;
      const karatLabel = meta.karatLabel || meta.purityLabel || "Unknown";
      const purityLabel = meta.purityLabel || karatLabel;
      const touchPercent = meta.touchPercent || "0.00";

      totalPhysical = totalPhysical.plus(lossWt);
      totalFine = totalFine.plus(fineWt);

      entries.push({
        id: ev.id,
        businessDate: bDate,
        purityId,
        karatLabel,
        purityLabel,
        touchPercent,
        lossWeightGrams: formatWeight3(lossWt),
        fineWeightGrams: formatWeight3(fineWt),
        note: meta.note || "",
        createdAt: ev.createdAt.toISOString(),
      });

      const existing = karatMap.get(purityId);
      if (existing) {
        existing.physical = existing.physical.plus(lossWt);
        existing.fine = existing.fine.plus(fineWt);
        existing.entryCount += 1;
      } else {
        karatMap.set(purityId, {
          purityId,
          karatLabel,
          purityLabel,
          touchPercent,
          physical: lossWt,
          fine: fineWt,
          entryCount: 1,
        });
      }
    } catch {
      // Ignore malformed metadata
    }
  }

  entries.sort((a, b) => {
    if (a.businessDate !== b.businessDate) {
      return a.businessDate > b.businessDate ? -1 : 1;
    }
    return a.createdAt > b.createdAt ? -1 : 1;
  });

  const byKarat: CastingLossKaratGroup[] = Array.from(karatMap.values())
    .sort((a, b) => Number(b.touchPercent) - Number(a.touchPercent))
    .map((k) => ({
      purityId: k.purityId,
      karatLabel: k.karatLabel,
      purityLabel: k.purityLabel,
      touchPercent: k.touchPercent,
      totalPhysicalGrams: formatWeight3(roundOperational(k.physical)),
      totalFineGrams: formatWeight3(roundOperational(k.fine)),
      entryCount: k.entryCount,
    }));

  return {
    filter,
    fromDate,
    toDate,
    month,
    totalPhysicalGrams: formatWeight3(roundOperational(totalPhysical)),
    totalFineGrams: formatWeight3(roundOperational(totalFine)),
    entryCount: entries.length,
    byKarat,
    entries,
  };
}
