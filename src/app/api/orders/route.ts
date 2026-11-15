import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService, ProcessType } from "@/lib/domain";

function serializeOrderRow(r: Awaited<ReturnType<typeof erpService.listRegisterOrders>>["rows"][number]) {
  return {
    monthKey: r.monthKey,
    order: {
      ...r.order,
      touchSnapshot: r.order.touchSnapshot.toFixed(4).replace(/\.?0+$/, ""),
      targetWeight: r.order.targetWeight
        ? r.order.targetWeight.toFixed(3)
        : null,
      initialIssuedMetalWeight: r.order.initialIssuedMetalWeight.toFixed(3),
      retainedStoneWeight: r.order.retainedStoneWeight.toFixed(3),
      finishedGrossWeight: r.order.finishedGrossWeight
        ? r.order.finishedGrossWeight.toFixed(3)
        : null,
      finishedStoneWeight: r.order.finishedStoneWeight
        ? r.order.finishedStoneWeight.toFixed(3)
        : null,
      finishedNetMetalWeight: r.order.finishedNetMetalWeight
        ? r.order.finishedNetMetalWeight.toFixed(3)
        : null,
      finishedFineWeight: r.order.finishedFineWeight
        ? r.order.finishedFineWeight.toFixed(3)
        : null,
      totalRawLossWeight: r.order.totalRawLossWeight.toFixed(3),
      totalFineLossWeight: r.order.totalFineLossWeight.toFixed(3),
    },
    customer: r.customer,
    purity: {
      ...r.purity,
      touchPercent: r.purity.touchPercent.toFixed(4).replace(/\.?0+$/, ""),
    },
    processes: r.processes.map((p) => ({
      ...p,
      issuedMetalWeight: p.issuedMetalWeight.toFixed(3),
      returnedMetalWeight: p.returnedMetalWeight.toFixed(3),
      extraReturnedMetalWeight: p.extraReturnedMetalWeight.toFixed(3),
      closedLossWeight: p.closedLossWeight.toFixed(3),
      custodyMetalWeight: p.custodyMetalWeight.toFixed(3),
      carriedStoneInWeight: p.carriedStoneInWeight.toFixed(3),
      addedStoneWeight: p.addedStoneWeight.toFixed(3),
      removedStoneWeight: p.removedStoneWeight.toFixed(3),
      carriedStoneOutWeight: p.carriedStoneOutWeight.toFixed(3),
      latestGrossInWeight: p.latestGrossInWeight.toFixed(3),
      latestGrossOutWeight: p.latestGrossOutWeight.toFixed(3),
    })),
    visits: r.visits.map((v) => ({
      ...v,
      grossInWeight: v.grossInWeight.toFixed(3),
      nonGoldInWeight: v.nonGoldInWeight.toFixed(3),
      metalInWeight: v.metalInWeight.toFixed(3),
      grossOutWeight: v.grossOutWeight.toFixed(3),
      nonGoldOutWeight: v.nonGoldOutWeight.toFixed(3),
      metalOutWeight: v.metalOutWeight.toFixed(3),
      extraMetalReturnedWeight: v.extraMetalReturnedWeight.toFixed(3),
      extraMetalTouchPercent: v.extraMetalTouchPercent
        ? v.extraMetalTouchPercent.toFixed(4).replace(/\.?0+$/, "")
        : null,
      extraMetalPurityId: v.extraMetalPurityId,
      extraMetalFineWeight: v.extraMetalFineWeight.toFixed(3),
      custodyRemainingWeight: v.custodyRemainingWeight.toFixed(3),
      rawLossWeight: v.rawLossWeight.toFixed(3),
      touchSnapshot: v.touchSnapshot.toFixed(4).replace(/\.?0+$/, ""),
      fineLossWeight: v.fineLossWeight.toFixed(3),
    })),
    stoneComponents: r.stoneComponents.map((s) => ({
      ...s,
      weightGrams: s.weightGrams.toFixed(3),
    })),
    lossRecords: r.lossRecords.map((l) => ({
      ...l,
      rawMetalLossWeight: l.rawMetalLossWeight.toFixed(3),
      touchSnapshot: l.touchSnapshot.toFixed(4).replace(/\.?0+$/, ""),
      fineEquivalentLossWeight: l.fineEquivalentLossWeight.toFixed(3),
    })),
    movements: r.movements.map((m) => ({
      ...m,
      grossWeight: m.grossWeight.toFixed(3),
      nonGoldWeight: m.nonGoldWeight.toFixed(3),
      netMetalWeight: m.netMetalWeight.toFixed(3),
      touchSnapshot: m.touchSnapshot.toFixed(4).replace(/\.?0+$/, ""),
      fineEquivalentWeight: m.fineEquivalentWeight.toFixed(3),
    })),
    adminAvailablePhysicalWeight: r.adminAvailablePhysicalWeight,
    filingValidIssuedWeight: r.filingValidIssuedWeight,
    filingIssues: r.filingIssues,
  };
}

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const sp = req.nextUrl.searchParams;
    const monthKey = sp.get("monthKey") || undefined;
    const search = sp.get("search") || undefined;
    const status = sp.get("status") || undefined;
    const purityId = sp.get("purityId") || undefined;
    const processType = (sp.get("processType") as ProcessType) || undefined;

    const result = await erpService.listRegisterOrders(actor, {
      monthKey,
      search,
      status,
      purityId,
      processType,
    });

    return NextResponse.json({
      ok: true,
      availableMonths: result.availableMonths,
      rows: result.rows.map(serializeOrderRow),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const body = await req.json();
    const selectedProcesses: ProcessType[] = Array.isArray(
      body.selectedProcesses
    )
      ? body.selectedProcesses
      : [];

    const created = await erpService.createOrder(actor, {
      bagNumber: String(body.bagNumber || ""),
      customerId: String(body.customerId || ""),
      orderName: String(body.orderName || ""),
      photoUrl: body.photoUrl || null,
      purityId: String(body.purityId || ""),
      targetWeight: body.targetWeight ?? null,
      size: body.size ?? null,
      orderDate: body.orderDate,
      dueDate: body.dueDate ?? null,
      notes: body.notes ?? null,
      adDetailsJson: body.adDetails
        ? JSON.stringify(body.adDetails)
        : body.adDetailsJson ?? null,
      selectedProcesses,
    });

    return NextResponse.json({
      ok: true,
      orderId: created.order.id,
      bagNumber: created.order.bagNumber,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

