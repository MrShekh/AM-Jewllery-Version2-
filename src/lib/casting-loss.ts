import { prisma } from "@/lib/prisma";
import { erpService, type ActorContext } from "@/lib/domain";
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
  status: "PENDING" | "RECOVERED";
  recoveryId: string | null;
  createdAt: string;
}

export interface CastingLossRecoveryItem {
  id: string;
  businessDate: string;
  entryCount: number;
  entryIds: string[];
  expectedFineGrams: string;
  recoveredFineGrams: string;
  milligramLossGrams: string;
  extraGainGrams: string;
  netDifferenceGrams: string;
  transactionNumber: string;
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
  pendingFineGrams: string;
  entryCount: number;
}

export interface CastingLossSummary {
  filter: CastingLossFilter;
  fromDate: string;
  toDate: string;
  month: string;
  totalPhysicalGrams: string;
  totalFineGrams: string;
  pendingFineGrams: string;
  pendingEntryCount: number;
  allPendingFineGrams: string;
  allPendingEntries: CastingLossEntryItem[];
  recoveredFineGrams: string;
  milligramLossGrams: string;
  extraGainGrams: string;
  entryCount: number;
  byKarat: CastingLossKaratGroup[];
  entries: CastingLossEntryItem[];
  recoveries: CastingLossRecoveryItem[];
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
    status: "PENDING",
    recoveryId: null,
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
  const existing = await prisma.auditEvent.findFirst({
    where: {
      id,
      organizationId,
      entityType: "CASTING_LOSS_RECORD",
    },
  });
  if (!existing) return;
  if (existing.metadataJson) {
    try {
      const meta = JSON.parse(existing.metadataJson) as { status?: string };
      if (meta.status === "RECOVERED") {
        throw new Error(
          "Cannot delete a casting loss entry that has already been recovered."
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("already been recovered")) {
        throw err;
      }
    }
  }
  await prisma.auditEvent.deleteMany({
    where: {
      id,
      organizationId,
      entityType: "CASTING_LOSS_RECORD",
    },
  });
}

export async function recoverCastingLoss(
  actor: ActorContext,
  input: {
    entryIds?: string[];
    recoveredFineGrams: number | string;
    businessDate?: string;
    note?: string;
    idempotencyKey?: string;
  }
): Promise<CastingLossRecoveryItem> {
  const recoveredFine = roundOperational(toDecimal(input.recoveredFineGrams));
  if (recoveredFine.lte(ZERO)) {
    throw new Error("Recovered fine gold weight must be greater than 0.000 g.");
  }

  const businessDate =
    input.businessDate && /^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)
      ? input.businessDate
      : getIstTodayYmd();
  const note = (input.note || "").trim();

  const allEvents = await prisma.auditEvent.findMany({
    where: {
      organizationId: actor.organizationId,
      entityType: "CASTING_LOSS_RECORD",
      action: "CASTING_LOSS_RECORDED",
    },
    orderBy: { createdAt: "asc" },
  });

  const requestedIds = Array.isArray(input.entryIds) && input.entryIds.length > 0
    ? new Set(input.entryIds)
    : null;

  const targetEvents: Array<{
    ev: (typeof allEvents)[number];
    meta: Record<string, unknown>;
    fineWt: ReturnType<typeof toDecimal>;
  }> = [];

  for (const ev of allEvents) {
    if (!ev.metadataJson) continue;
    if (requestedIds && !requestedIds.has(ev.id)) continue;
    try {
      const meta = JSON.parse(ev.metadataJson) as Record<string, unknown>;
      if (meta.status === "RECOVERED") continue;
      const fineWt = roundOperational(
        toDecimal((meta.fineWeightGrams as string | number) || 0)
      );
      if (fineWt.lte(ZERO)) continue;
      targetEvents.push({ ev, meta, fineWt });
    } catch {
      continue;
    }
  }

  if (targetEvents.length === 0) {
    throw new Error("No pending casting loss entries selected for recovery.");
  }

  let expectedFine = ZERO;
  for (const item of targetEvents) {
    expectedFine = expectedFine.plus(item.fineWt);
  }
  expectedFine = roundOperational(expectedFine);

  const diff = expectedFine.minus(recoveredFine);
  const milligramLoss = diff.gt(ZERO) ? roundOperational(diff) : ZERO;
  const extraGain = recoveredFine.gt(expectedFine)
    ? roundOperational(recoveredFine.minus(expectedFine))
    : ZERO;
  const netDiff = roundOperational(recoveredFine.minus(expectedFine));

  const purities = await prisma.purityDefinition.findMany({
    where: { organizationId: actor.organizationId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { touchPercent: "desc" }],
  });
  const finePurity =
    purities.find((p) => Number(p.touchPercent) === 100) ||
    purities.find((p) => p.code === "ADMIN_FINE_GOLD") ||
    purities.find((p) => p.isFineCategory) ||
    purities[0];

  if (!finePurity) {
    throw new Error("Fine gold purity is not configured.");
  }

  const idemKey =
    input.idempotencyKey ||
    `casting_rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const diffDesc = extraGain.gt(ZERO)
    ? `+${formatWeight3(extraGain)}g extra gain`
    : milligramLoss.gt(ZERO)
    ? `-${formatWeight3(milligramLoss)}g mg loss`
    : "exact match";

  const stockTx = await erpService.postStockReceipt(actor, {
    purityId: finePurity.id,
    physicalWeight: formatWeight3(recoveredFine),
    sourceReference: "CASTING-LOSS-RECOVERY",
    reason:
      note ||
      `Casting loss recovery (${targetEvents.length} entries, expected ${formatWeight3(
        expectedFine
      )}g fine, recovered ${formatWeight3(
        recoveredFine
      )}g fine, ${diffDesc} — settled)`,
    businessDate,
    idempotencyKey: idemKey,
  });

  const entryIds = targetEvents.map((t) => t.ev.id);
  const recoveryEvent = await prisma.auditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      entityType: "CASTING_LOSS_RECOVERY",
      entityId: stockTx.id,
      action: "CASTING_LOSS_RECOVERED",
      summary: `Recovered ${formatWeight3(
        recoveredFine
      )}g fine to Admin Stock (Expected ${formatWeight3(
        expectedFine
      )}g, ${diffDesc})`,
      metadataJson: JSON.stringify({
        businessDate,
        entryIds,
        entryCount: entryIds.length,
        expectedFineGrams: formatWeight3(expectedFine),
        recoveredFineGrams: formatWeight3(recoveredFine),
        milligramLossGrams: formatWeight3(milligramLoss),
        extraGainGrams: formatWeight3(extraGain),
        netDifferenceGrams: netDiff.toFixed(3),
        journalTransactionId: stockTx.id,
        transactionNumber: stockTx.transactionNumber,
        note,
      }),
    },
  });

  await prisma.$transaction(
    targetEvents.map(({ ev, meta }) =>
      prisma.auditEvent.update({
        where: { id: ev.id },
        data: {
          metadataJson: JSON.stringify({
            ...meta,
            status: "RECOVERED",
            recoveryId: recoveryEvent.id,
            recoveredBusinessDate: businessDate,
          }),
        },
      })
    )
  );

  return {
    id: recoveryEvent.id,
    businessDate,
    entryCount: entryIds.length,
    entryIds,
    expectedFineGrams: formatWeight3(expectedFine),
    recoveredFineGrams: formatWeight3(recoveredFine),
    milligramLossGrams: formatWeight3(milligramLoss),
    extraGainGrams: formatWeight3(extraGain),
    netDifferenceGrams: netDiff.toFixed(3),
    transactionNumber: stockTx.transactionNumber,
    note,
    createdAt: recoveryEvent.createdAt.toISOString(),
  };
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

  const [events, recoveryEvents] = await Promise.all([
    prisma.auditEvent.findMany({
      where: {
        organizationId,
        entityType: "CASTING_LOSS_RECORD",
        action: "CASTING_LOSS_RECORDED",
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditEvent.findMany({
      where: {
        organizationId,
        entityType: "CASTING_LOSS_RECOVERY",
        action: "CASTING_LOSS_RECOVERED",
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const entries: CastingLossEntryItem[] = [];
  const allPendingEntries: CastingLossEntryItem[] = [];
  let totalPhysical = ZERO;
  let totalFine = ZERO;
  let pendingFine = ZERO;
  let allPendingFine = ZERO;
  const karatMap = new Map<
    string,
    {
      purityId: string;
      karatLabel: string;
      purityLabel: string;
      touchPercent: string;
      physical: ReturnType<typeof toDecimal>;
      fine: ReturnType<typeof toDecimal>;
      pendingFine: ReturnType<typeof toDecimal>;
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
        status?: "PENDING" | "RECOVERED";
        recoveryId?: string | null;
      };
      const bDate = meta.businessDate || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bDate)) continue;

      const lossWt = roundOperational(toDecimal(meta.lossWeightGrams || 0));
      const fineWt = roundOperational(toDecimal(meta.fineWeightGrams || 0));
      const purityId = meta.purityId || ev.entityId;
      const karatLabel = meta.karatLabel || meta.purityLabel || "Unknown";
      const purityLabel = meta.purityLabel || karatLabel;
      const touchPercent = meta.touchPercent || "0.00";
      const status: "PENDING" | "RECOVERED" =
        meta.status === "RECOVERED" ? "RECOVERED" : "PENDING";
      const recoveryId = meta.recoveryId || null;

      const item: CastingLossEntryItem = {
        id: ev.id,
        businessDate: bDate,
        purityId,
        karatLabel,
        purityLabel,
        touchPercent,
        lossWeightGrams: formatWeight3(lossWt),
        fineWeightGrams: formatWeight3(fineWt),
        note: meta.note || "",
        status,
        recoveryId,
        createdAt: ev.createdAt.toISOString(),
      };

      if (status === "PENDING") {
        allPendingEntries.push(item);
        allPendingFine = allPendingFine.plus(fineWt);
      }

      if (bDate < fromDate || bDate > toDate) continue;

      totalPhysical = totalPhysical.plus(lossWt);
      totalFine = totalFine.plus(fineWt);
      if (status === "PENDING") {
        pendingFine = pendingFine.plus(fineWt);
      }

      entries.push(item);

      const existing = karatMap.get(purityId);
      if (existing) {
        existing.physical = existing.physical.plus(lossWt);
        existing.fine = existing.fine.plus(fineWt);
        if (status === "PENDING") {
          existing.pendingFine = existing.pendingFine.plus(fineWt);
        }
        existing.entryCount += 1;
      } else {
        karatMap.set(purityId, {
          purityId,
          karatLabel,
          purityLabel,
          touchPercent,
          physical: lossWt,
          fine: fineWt,
          pendingFine: status === "PENDING" ? fineWt : ZERO,
          entryCount: 1,
        });
      }
    } catch {
      // Ignore malformed metadata
    }
  }

  const recoveries: CastingLossRecoveryItem[] = [];
  let recoveredFineTotal = ZERO;
  let milligramLossTotal = ZERO;
  let extraGainTotal = ZERO;

  for (const rec of recoveryEvents) {
    if (!rec.metadataJson) continue;
    try {
      const meta = JSON.parse(rec.metadataJson) as {
        businessDate?: string;
        entryIds?: string[];
        entryCount?: number;
        expectedFineGrams?: string | number;
        recoveredFineGrams?: string | number;
        milligramLossGrams?: string | number;
        extraGainGrams?: string | number;
        netDifferenceGrams?: string | number;
        transactionNumber?: string;
        note?: string;
      };
      const bDate = meta.businessDate || "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bDate)) continue;
      if (bDate < fromDate || bDate > toDate) continue;

      const expectedWt = roundOperational(toDecimal(meta.expectedFineGrams || 0));
      const recoveredWt = roundOperational(toDecimal(meta.recoveredFineGrams || 0));
      const mgLossWt = roundOperational(toDecimal(meta.milligramLossGrams || 0));
      const extraGainWt =
        meta.extraGainGrams !== undefined
          ? roundOperational(toDecimal(meta.extraGainGrams))
          : recoveredWt.gt(expectedWt)
          ? roundOperational(recoveredWt.minus(expectedWt))
          : ZERO;
      const netDiffWt =
        meta.netDifferenceGrams !== undefined
          ? roundOperational(toDecimal(meta.netDifferenceGrams))
          : roundOperational(recoveredWt.minus(expectedWt));

      recoveredFineTotal = recoveredFineTotal.plus(recoveredWt);
      milligramLossTotal = milligramLossTotal.plus(mgLossWt);
      extraGainTotal = extraGainTotal.plus(extraGainWt);

      recoveries.push({
        id: rec.id,
        businessDate: bDate,
        entryCount: meta.entryCount ?? (meta.entryIds?.length || 0),
        entryIds: Array.isArray(meta.entryIds) ? meta.entryIds : [],
        expectedFineGrams: formatWeight3(expectedWt),
        recoveredFineGrams: formatWeight3(recoveredWt),
        milligramLossGrams: formatWeight3(mgLossWt),
        extraGainGrams: formatWeight3(extraGainWt),
        netDifferenceGrams: netDiffWt.toFixed(3),
        transactionNumber: meta.transactionNumber || "",
        note: meta.note || "",
        createdAt: rec.createdAt.toISOString(),
      });
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

  allPendingEntries.sort((a, b) => {
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
      pendingFineGrams: formatWeight3(roundOperational(k.pendingFine)),
      entryCount: k.entryCount,
    }));

  return {
    filter,
    fromDate,
    toDate,
    month,
    totalPhysicalGrams: formatWeight3(roundOperational(totalPhysical)),
    totalFineGrams: formatWeight3(roundOperational(totalFine)),
    pendingFineGrams: formatWeight3(roundOperational(pendingFine)),
    pendingEntryCount: allPendingEntries.length,
    allPendingFineGrams: formatWeight3(roundOperational(allPendingFine)),
    allPendingEntries,
    recoveredFineGrams: formatWeight3(roundOperational(recoveredFineTotal)),
    milligramLossGrams: formatWeight3(roundOperational(milligramLossTotal)),
    extraGainGrams: formatWeight3(roundOperational(extraGainTotal)),
    entryCount: entries.length,
    byKarat,
    entries,
    recoveries,
  };
}
