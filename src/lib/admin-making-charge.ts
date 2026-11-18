import { prisma } from "@/lib/prisma";

export type MakingChargeFilter = "today" | "month" | "range";

export interface AdminMakingChargeBillItem {
  billId: string;
  billNumber: string;
  billDate: string;
  amountRupees: number;
}

export interface AdminMakingChargeSummary {
  filter: MakingChargeFilter;
  fromDate: string;
  toDate: string;
  month: string;
  totalRupees: string;
  billCount: number;
  bills: AdminMakingChargeBillItem[];
}

function getIstTodayYmd(): string {
  // Asia/Kolkata is UTC+05:30
  const istMs = Date.now() + 330 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
}

function getMonthBounds(monthYyyyMm: string): { fromDate: string; toDate: string; month: string } {
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

export async function recordBillAdminMakingCharge(input: {
  organizationId: string;
  actorId: string;
  billId: string;
  billNumber: string;
  billDate: Date;
  customerId: string;
  amountRupees: number;
}): Promise<void> {
  const safeAmount = Number.isFinite(input.amountRupees)
    ? Math.max(0, Math.round(input.amountRupees * 100) / 100)
    : 0;
  const billDateIst = new Date(input.billDate.getTime() + 330 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  await prisma.auditEvent.deleteMany({
    where: {
      organizationId: input.organizationId,
      entityType: "BILL_ADMIN_MAKING_CHARGE",
      entityId: input.billId,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      entityType: "BILL_ADMIN_MAKING_CHARGE",
      entityId: input.billId,
      action: "ADMIN_MAKING_CHARGE_RECORDED",
      summary: `Admin internal making charge ₹${safeAmount.toFixed(2)} for Bill ${input.billNumber}`,
      metadataJson: JSON.stringify({
        billId: input.billId,
        billNumber: input.billNumber,
        billDate: billDateIst,
        customerId: input.customerId,
        amountRupees: safeAmount,
      }),
    },
  });
}

export async function getAdminMakingChargeSummary(
  organizationId: string,
  options?: {
    filter?: string | null;
    month?: string | null;
    from?: string | null;
    to?: string | null;
  }
): Promise<AdminMakingChargeSummary> {
  const todayYmd = getIstTodayYmd();
  const rawFilter = options?.filter;
  const filter: MakingChargeFilter =
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
    const f = options?.from && /^\d{4}-\d{2}-\d{2}$/.test(options.from) ? options.from : todayYmd;
    const t = options?.to && /^\d{4}-\d{2}-\d{2}$/.test(options.to) ? options.to : f;
    fromDate = f <= t ? f : t;
    toDate = f <= t ? t : f;
  }

  const events = await prisma.auditEvent.findMany({
    where: {
      organizationId,
      entityType: "BILL_ADMIN_MAKING_CHARGE",
      action: "ADMIN_MAKING_CHARGE_RECORDED",
    },
    orderBy: { createdAt: "desc" },
    select: {
      entityId: true,
      metadataJson: true,
    },
  });

  // Keep only the latest entry per billId
  const latestByBill = new Map<string, AdminMakingChargeBillItem>();
  for (const ev of events) {
    if (latestByBill.has(ev.entityId) || !ev.metadataJson) continue;
    try {
      const parsed = JSON.parse(ev.metadataJson) as Partial<AdminMakingChargeBillItem>;
      if (!parsed.billId || !parsed.billDate) continue;
      latestByBill.set(ev.entityId, {
        billId: parsed.billId,
        billNumber: parsed.billNumber || "",
        billDate: parsed.billDate,
        amountRupees: Number(parsed.amountRupees || 0),
      });
    } catch {
      // skip malformed metadata
    }
  }

  const candidateIds = Array.from(latestByBill.keys());
  const nonCancelledBillIds = new Set<string>();
  if (candidateIds.length > 0) {
    const validBills = await prisma.customerBill.findMany({
      where: {
        organizationId,
        id: { in: candidateIds },
        status: { not: "CANCELLED" },
      },
      select: { id: true },
    });
    for (const b of validBills) {
      nonCancelledBillIds.add(b.id);
    }
  }

  const bills: AdminMakingChargeBillItem[] = [];
  let total = 0;

  for (const item of latestByBill.values()) {
    if (!nonCancelledBillIds.has(item.billId)) continue;
    if (item.billDate < fromDate || item.billDate > toDate) continue;
    if (item.amountRupees <= 0) continue;
    total += item.amountRupees;
    bills.push(item);
  }

  bills.sort((a, b) => b.billDate.localeCompare(a.billDate) || b.billNumber.localeCompare(a.billNumber));

  return {
    filter,
    fromDate,
    toDate,
    month,
    totalRupees: total.toFixed(2),
    billCount: bills.length,
    bills,
  };
}
