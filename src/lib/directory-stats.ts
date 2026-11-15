import { erpService, NotFoundError } from "@/lib/domain";
import type { ActorContext } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

export interface CustomerDirectorySummary {
  totalCustomers: number;
  totalActiveOrders: number;
  totalCompletedReady: number;
  totalOrdersAllTime: number;
}

export interface CustomerRowStats {
  activeOrders: number;
  totalOrders: number;
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
  const [totalCustomers, orders] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }),
    prisma.order.findMany({
      where: { organizationId, status: { not: "CANCELLED" } },
      select: {
        customerId: true,
        status: true,
        deliveryStatus: true,
      },
    }),
  ]);

  let totalActiveOrders = 0;
  let totalCompletedReady = 0;
  const byCustomer: Record<string, CustomerRowStats> = {};

  for (const o of orders) {
    if (!byCustomer[o.customerId]) {
      byCustomer[o.customerId] = { activeOrders: 0, totalOrders: 0 };
    }
    byCustomer[o.customerId].totalOrders += 1;

    const isDelivered = o.deliveryStatus === "DELIVERED";
    if (!isDelivered) {
      totalActiveOrders += 1;
      byCustomer[o.customerId].activeOrders += 1;
    }
    if (o.status === "COMPLETED" && !isDelivered) {
      totalCompletedReady += 1;
    }
  }

  return {
    summary: {
      totalCustomers,
      totalActiveOrders,
      totalCompletedReady,
      totalOrdersAllTime: orders.length,
    },
    byCustomer,
  };
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
