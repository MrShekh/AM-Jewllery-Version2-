import { erpService, NotFoundError } from "@/lib/domain";
import type { ActorContext } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

export interface CustomerDirectorySummary {
  totalCustomers: number;
  totalActiveOrders: number;
  totalCompletedReady: number;
  totalOrdersAllTime: number;
  totalPendingFineGold: string;
  totalAdvanceFineGold: string;
  totalRecoveredFineGold: string;
  totalPendingCashRupees: string;
  totalAdvanceCashRupees: string;
  totalRecoveredCashRupees: string;
}

export interface CustomerRowStats {
  activeOrders: number;
  totalOrders: number;
  pendingFineGold: string;
  advanceFineGold: string;
  recoveredFineGold: string;
  pendingCashRupees: string;
  advanceCashRupees: string;
  recoveredCashRupees: string;
}

export interface CustomerAdvanceBreakdownRow {
  customerId: string;
  customerName: string;
  customerCode: string;
  advanceFine: string;
}

export interface KarigarDirectorySummary {
  totalKarigars: number;
  activeKarigars: number;
  totalKarigarOrders: number;
  totalCustodyWeight: string;
  totalRawLossWeight: string;
  totalFineLossWeight: string;
}

export interface KarigarRowStats {
  totalOrders: number;
  activeOrders: number;
  custodyWeight: string;
  totalRawLossWeight: string;
  totalFineLossWeight: string;
}

export async function getCustomerDirectoryStats(organizationId: string): Promise<{
  summary: CustomerDirectorySummary;
  byCustomer: Record<string, CustomerRowStats>;
}> {
  const [totalCustomers, orders, bills, allocations, receipts, cashReceipts] =
    await Promise.all([
      prisma.customer.count({ where: { organizationId } }),
      prisma.order.findMany({
        where: { organizationId, status: { not: "CANCELLED" } },
        select: {
          customerId: true,
          status: true,
          deliveryStatus: true,
        },
      }),
      prisma.customerBill.findMany({
        where: { organizationId, status: "POSTED" },
        select: {
          id: true,
          customerId: true,
          totalFineGold: true,
          totalCashRupees: true,
        },
      }),
      prisma.customerPaymentAllocation.findMany({
        where: { organizationId, status: "ACTIVE" },
        select: {
          customerId: true,
          billId: true,
          allocatedFineWeight: true,
          allocatedRupees: true,
        },
      }),
      prisma.customerGoldReceipt.findMany({
        where: { organizationId, status: "POSTED" },
        select: {
          customerId: true,
          totalFineWeight: true,
          unallocatedFineWeight: true,
          refundedFineWeight: true,
        },
      }),
      prisma.customerCashReceipt.findMany({
        where: { organizationId, status: "POSTED" },
        select: {
          customerId: true,
          amountRupees: true,
          unallocatedRupees: true,
        },
      }),
    ]);

  let totalActiveOrders = 0;
  let totalCompletedReady = 0;
  const accum: Record<
    string,
    {
      activeOrders: number;
      totalOrders: number;
      pendingFine: number;
      advanceFine: number;
      recoveredFine: number;
      pendingCash: number;
      advanceCash: number;
      recoveredCash: number;
    }
  > = {};

  const ensureCust = (customerId: string) => {
    if (!accum[customerId]) {
      accum[customerId] = {
        activeOrders: 0,
        totalOrders: 0,
        pendingFine: 0,
        advanceFine: 0,
        recoveredFine: 0,
        pendingCash: 0,
        advanceCash: 0,
        recoveredCash: 0,
      };
    }
    return accum[customerId];
  };

  for (const o of orders) {
    const entry = ensureCust(o.customerId);
    entry.totalOrders += 1;

    const isDelivered = o.deliveryStatus === "DELIVERED";
    if (!isDelivered) {
      totalActiveOrders += 1;
      entry.activeOrders += 1;
    }
    if (o.status === "COMPLETED" && !isDelivered) {
      totalCompletedReady += 1;
    }
  }

  const allocByBill = new Map<string, { fine: number; cash: number }>();
  for (const a of allocations) {
    const prev = allocByBill.get(a.billId) || { fine: 0, cash: 0 };
    prev.fine += Number(a.allocatedFineWeight || 0);
    prev.cash += Number(a.allocatedRupees || 0);
    allocByBill.set(a.billId, prev);
  }

  let totalPendingFineGold = 0;
  let totalPendingCashRupees = 0;
  for (const b of bills) {
    const alloc = allocByBill.get(b.id) || { fine: 0, cash: 0 };
    const billPendingFine = Math.max(0, Number(b.totalFineGold || 0) - alloc.fine);
    const billPendingCash = Math.max(0, Number(b.totalCashRupees || 0) - alloc.cash);
    const entry = ensureCust(b.customerId);
    entry.pendingFine += billPendingFine;
    entry.pendingCash += billPendingCash;
    totalPendingFineGold += billPendingFine;
    totalPendingCashRupees += billPendingCash;
  }

  let totalAdvanceFineGold = 0;
  let totalRecoveredFineGold = 0;
  for (const r of receipts) {
    const unalloc = Math.max(0, Number(r.unallocatedFineWeight || 0));
    const netRecovered = Math.max(
      0,
      Number(r.totalFineWeight || 0) - Number(r.refundedFineWeight || 0)
    );
    const entry = ensureCust(r.customerId);
    entry.advanceFine += unalloc;
    entry.recoveredFine += netRecovered;
    totalAdvanceFineGold += unalloc;
    totalRecoveredFineGold += netRecovered;
  }

  let totalAdvanceCashRupees = 0;
  let totalRecoveredCashRupees = 0;
  for (const cr of cashReceipts) {
    const unalloc = Math.max(0, Number(cr.unallocatedRupees || 0));
    const amt = Math.max(0, Number(cr.amountRupees || 0));
    const entry = ensureCust(cr.customerId);
    entry.advanceCash += unalloc;
    entry.recoveredCash += amt;
    totalAdvanceCashRupees += unalloc;
    totalRecoveredCashRupees += amt;
  }

  const byCustomer: Record<string, CustomerRowStats> = {};
  for (const [custId, v] of Object.entries(accum)) {
    byCustomer[custId] = {
      activeOrders: v.activeOrders,
      totalOrders: v.totalOrders,
      pendingFineGold: v.pendingFine.toFixed(3),
      advanceFineGold: v.advanceFine.toFixed(3),
      recoveredFineGold: v.recoveredFine.toFixed(3),
      pendingCashRupees: v.pendingCash.toFixed(2),
      advanceCashRupees: v.advanceCash.toFixed(2),
      recoveredCashRupees: v.recoveredCash.toFixed(2),
    };
  }

  return {
    summary: {
      totalCustomers,
      totalActiveOrders,
      totalCompletedReady,
      totalOrdersAllTime: orders.length,
      totalPendingFineGold: totalPendingFineGold.toFixed(3),
      totalAdvanceFineGold: totalAdvanceFineGold.toFixed(3),
      totalRecoveredFineGold: totalRecoveredFineGold.toFixed(3),
      totalPendingCashRupees: totalPendingCashRupees.toFixed(2),
      totalAdvanceCashRupees: totalAdvanceCashRupees.toFixed(2),
      totalRecoveredCashRupees: totalRecoveredCashRupees.toFixed(2),
    },
    byCustomer,
  };
}

export async function getCustomerAdvanceBreakdown(
  organizationId: string
): Promise<CustomerAdvanceBreakdownRow[]> {
  const receipts = await prisma.customerGoldReceipt.findMany({
    where: {
      organizationId,
      status: "POSTED",
      unallocatedFineWeight: { gt: 0 },
    },
    select: {
      customerId: true,
      unallocatedFineWeight: true,
      customer: { select: { name: true, customerCode: true } },
    },
  });

  const map = new Map<
    string,
    { customerName: string; customerCode: string; advanceFine: number }
  >();
  for (const r of receipts) {
    const amt = Number(r.unallocatedFineWeight || 0);
    if (amt <= 0) continue;
    const prev = map.get(r.customerId);
    if (prev) {
      prev.advanceFine += amt;
    } else {
      map.set(r.customerId, {
        customerName: r.customer.name,
        customerCode: r.customer.customerCode,
        advanceFine: amt,
      });
    }
  }

  return Array.from(map.entries())
    .map(([customerId, v]) => ({
      customerId,
      customerName: v.customerName,
      customerCode: v.customerCode,
      advanceFine: v.advanceFine.toFixed(3),
    }))
    .sort((a, b) => Number(b.advanceFine) - Number(a.advanceFine));
}

export async function getKarigarDirectoryStats(organizationId: string): Promise<{
  summary: KarigarDirectorySummary;
  byKarigar: Record<string, KarigarRowStats>;
}> {
  const [karigars, processes, losses] = await Promise.all([
    prisma.karigar.findMany({
      where: { organizationId },
      select: { id: true, isActive: true },
    }),
    prisma.orderProcess.findMany({
      where: {
        organizationId,
        assignedKarigarId: { not: null },
        order: { status: { not: "CANCELLED" } },
      },
      select: {
        assignedKarigarId: true,
        orderId: true,
        status: true,
        custodyMetalWeight: true,
        order: { select: { status: true, deliveryStatus: true } },
      },
    }),
    prisma.processLossRecord.findMany({
      where: {
        organizationId,
        eligibilityStatus: { not: "VOIDED" },
        order: { status: { not: "CANCELLED" } },
      },
      select: {
        karigarId: true,
        rawMetalLossWeight: true,
        fineEquivalentLossWeight: true,
      },
    }),
  ]);

  const distinctOrderSets = new Map<string, Set<string>>();
  const activeOrderSets = new Map<string, Set<string>>();
  const custodyByKarigar = new Map<string, number>();
  const rawLossByKarigar = new Map<string, number>();
  const fineLossByKarigar = new Map<string, number>();
  const allOrderIds = new Set<string>();

  let totalCustody = 0;
  for (const p of processes) {
    const kId = p.assignedKarigarId;
    if (!kId) continue;
    allOrderIds.add(p.orderId);

    if (!distinctOrderSets.has(kId)) distinctOrderSets.set(kId, new Set());
    distinctOrderSets.get(kId)!.add(p.orderId);

    const isDelivered = p.order.deliveryStatus === "DELIVERED";
    if (!isDelivered && p.status !== "CLOSED") {
      if (!activeOrderSets.has(kId)) activeOrderSets.set(kId, new Set());
      activeOrderSets.get(kId)!.add(p.orderId);
    }

    const cust = Number(p.custodyMetalWeight || 0);
    if (cust > 0) {
      totalCustody += cust;
      custodyByKarigar.set(kId, (custodyByKarigar.get(kId) || 0) + cust);
    }
  }

  let totalRawLoss = 0;
  let totalFineLoss = 0;
  for (const l of losses) {
    const raw = Number(l.rawMetalLossWeight || 0);
    const fine = Number(l.fineEquivalentLossWeight || 0);
    totalRawLoss += raw;
    totalFineLoss += fine;
    rawLossByKarigar.set(l.karigarId, (rawLossByKarigar.get(l.karigarId) || 0) + raw);
    fineLossByKarigar.set(l.karigarId, (fineLossByKarigar.get(l.karigarId) || 0) + fine);
  }

  const byKarigar: Record<string, KarigarRowStats> = {};
  for (const k of karigars) {
    byKarigar[k.id] = {
      totalOrders: distinctOrderSets.get(k.id)?.size || 0,
      activeOrders: activeOrderSets.get(k.id)?.size || 0,
      custodyWeight: (custodyByKarigar.get(k.id) || 0).toFixed(3),
      totalRawLossWeight: (rawLossByKarigar.get(k.id) || 0).toFixed(3),
      totalFineLossWeight: (fineLossByKarigar.get(k.id) || 0).toFixed(3),
    };
  }

  return {
    summary: {
      totalKarigars: karigars.length,
      activeKarigars: karigars.filter((k) => k.isActive).length,
      totalKarigarOrders: allOrderIds.size,
      totalCustodyWeight: totalCustody.toFixed(3),
      totalRawLossWeight: totalRawLoss.toFixed(3),
      totalFineLossWeight: totalFineLoss.toFixed(3),
    },
    byKarigar,
  };
}

export async function getKarigarProfileWorkspace(
  actor: ActorContext,
  karigarId: string
) {
  const [karigarRow, processes, losses, recoveryWorkspace] = await Promise.all([
    prisma.karigar.findFirst({
      where: { id: karigarId, organizationId: actor.organizationId },
      include: { capabilities: true },
    }),
    prisma.orderProcess.findMany({
      where: {
        organizationId: actor.organizationId,
        assignedKarigarId: karigarId,
        order: { status: { not: "CANCELLED" } },
      },
      include: {
        order: {
          select: {
            id: true,
            bagNumber: true,
            orderName: true,
            status: true,
            deliveryStatus: true,
            orderDate: true,
            updatedAt: true,
            touchSnapshot: true,
            customer: { select: { id: true, name: true } },
            purity: {
              select: {
                id: true,
                karatLabel: true,
                displayLabel: true,
                touchPercent: true,
              },
            },
          },
        },
        stoneComponentEntries: {
          where: { direction: "ADDED" },
          select: { componentType: true, pieces: true, weightGrams: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.processLossRecord.findMany({
      where: {
        organizationId: actor.organizationId,
        karigarId,
        eligibilityStatus: { not: "VOIDED" },
        order: { status: { not: "CANCELLED" } },
      },
      include: {
        order: {
          select: {
            id: true,
            bagNumber: true,
            orderName: true,
            purityId: true,
            purity: {
              select: {
                id: true,
                karatLabel: true,
                displayLabel: true,
                touchPercent: true,
              },
            },
          },
        },
      },
      orderBy: { businessDate: "desc" },
    }),
    erpService.getKarigarRecoveryWorkspace(actor, { karigarId }),
  ]);

  if (!karigarRow) {
    throw new NotFoundError("Karigar not found");
  }

  const orderIds = new Set<string>();
  const activeOrderIds = new Set<string>();
  let currentCustodyWeight = 0;

  const lossByOrderProcess = new Map<string, { raw: number; fine: number }>();
  const karatMap = new Map<
    string,
    {
      purityId: string;
      karatLabel: string;
      displayLabel: string;
      touchPercent: string;
      orderIds: Set<string>;
      rawLoss: number;
      fineLoss: number;
    }
  >();

  let totalRawLoss = 0;
  let totalFineLoss = 0;

  for (const l of losses) {
    const raw = Number(l.rawMetalLossWeight || 0);
    const fine = Number(l.fineEquivalentLossWeight || 0);
    totalRawLoss += raw;
    totalFineLoss += fine;

    const prev = lossByOrderProcess.get(l.orderProcessId) || { raw: 0, fine: 0 };
    lossByOrderProcess.set(l.orderProcessId, {
      raw: prev.raw + raw,
      fine: prev.fine + fine,
    });

    const p = l.order.purity;
    if (!karatMap.has(p.id)) {
      karatMap.set(p.id, {
        purityId: p.id,
        karatLabel: p.karatLabel,
        displayLabel: p.displayLabel,
        touchPercent: Number(p.touchPercent).toFixed(2),
        orderIds: new Set<string>(),
        rawLoss: 0,
        fineLoss: 0,
      });
    }
    const kEntry = karatMap.get(p.id)!;
    kEntry.orderIds.add(l.orderId);
    kEntry.rawLoss += raw;
    kEntry.fineLoss += fine;
  }

  let totalAdPieces = 0;
  let totalKlPieces = 0;

  const orderProcessRows = processes.map((proc) => {
    orderIds.add(proc.orderId);
    const isDelivered = proc.order.deliveryStatus === "DELIVERED";
    if (!isDelivered && proc.status !== "CLOSED") {
      activeOrderIds.add(proc.orderId);
    }
    const cust = Number(proc.custodyMetalWeight || 0);
    currentCustodyWeight += cust;

    const p = proc.order.purity;
    if (!karatMap.has(p.id)) {
      karatMap.set(p.id, {
        purityId: p.id,
        karatLabel: p.karatLabel,
        displayLabel: p.displayLabel,
        touchPercent: Number(p.touchPercent).toFixed(2),
        orderIds: new Set<string>(),
        rawLoss: 0,
        fineLoss: 0,
      });
    }
    karatMap.get(p.id)!.orderIds.add(proc.orderId);

    const procLoss = lossByOrderProcess.get(proc.id) || { raw: 0, fine: 0 };
    const adPieces = proc.stoneComponentEntries
      .filter((s) => s.componentType === "AD")
      .reduce((acc, s) => acc + (s.pieces || 0), 0);
    const klPieces = proc.stoneComponentEntries
      .filter((s) => s.componentType === "KL")
      .reduce((acc, s) => acc + (s.pieces || 0), 0);
    totalAdPieces += adPieces;
    totalKlPieces += klPieces;

    return {
      orderProcessId: proc.id,
      orderId: proc.order.id,
      bagNumber: proc.order.bagNumber,
      orderName: proc.order.orderName,
      customerId: proc.order.customer.id,
      customerName: proc.order.customer.name,
      purityLabel: p.displayLabel,
      karatLabel: p.karatLabel,
      orderStatus: proc.order.status,
      processType: proc.processType,
      processStatus: proc.status,
      custodyWeight: cust.toFixed(3),
      rawLossWeight: procLoss.raw.toFixed(3),
      fineLossWeight: procLoss.fine.toFixed(3),
      adPieces,
      klPieces,
      updatedAt: proc.updatedAt.toISOString(),
    };
  });

  const karatWiseLoss = Array.from(karatMap.values()).map((k) => ({
    purityId: k.purityId,
    karatLabel: k.karatLabel,
    displayLabel: k.displayLabel,
    touchPercent: k.touchPercent,
    orderCount: k.orderIds.size,
    rawLossWeight: k.rawLoss.toFixed(3),
    fineLossWeight: k.fineLoss.toFixed(3),
  }));

  const karigarSummaryFromRecovery = recoveryWorkspace.karigarSummaries?.[0];

  return {
    karigar: {
      id: karigarRow.id,
      karigarCode: karigarRow.karigarCode,
      name: karigarRow.name,
      phone: karigarRow.phone,
      specializationNotes: karigarRow.specializationNotes,
      isActive: karigarRow.isActive,
      capabilities: karigarRow.capabilities
        .filter((c) => c.isActive)
        .map((c) => c.processType),
      defaultForProcesses: karigarRow.capabilities
        .filter((c) => c.isActive && c.isDefault)
        .map((c) => c.processType),
    },
    summary: {
      totalOrders: orderIds.size,
      activeOrders: activeOrderIds.size,
      totalRawLossWeight: totalRawLoss.toFixed(3),
      totalFineLossWeight: totalFineLoss.toFixed(3),
      currentCustodyWeight: currentCustodyWeight.toFixed(3),
      pendingRecoverableFine:
        karigarSummaryFromRecovery?.outstandingFine ?? "0.000",
      recoveredFineWeight:
        karigarSummaryFromRecovery?.recoveredFine ?? "0.000",
      writtenOffFineWeight:
        karigarSummaryFromRecovery?.writtenOffFine ?? "0.000",
      makingDeductedFineWeight:
        karigarSummaryFromRecovery?.makingAllowedFine ?? "0.000",
      unallocatedAdvanceFine:
        karigarSummaryFromRecovery?.unallocatedCreditFine ?? "0.000",
      totalAdPieces,
      totalKlPieces,
    },
    karatWiseLoss,
    orders: orderProcessRows,
    recovery: {
      eligibleLosses: recoveryWorkspace.eligibleLosses ?? [],
      receipts: recoveryWorkspace.receipts ?? [],
      settlements: recoveryWorkspace.settlements ?? [],
    },
  };
}
