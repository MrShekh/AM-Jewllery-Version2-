import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService, ProcessType, StoneComponentInput } from "@/lib/domain";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const { id: orderId } = await context.params;
    const body = await req.json();
    const action = String(body.action || "POST_PROCESS_ENTRY");
    const idempotencyKey =
      String(body.idempotencyKey || "") ||
      `ord_${orderId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (action === "GIVE_WORK") {
      const stoneComponents: StoneComponentInput[] = Array.isArray(
        body.stoneComponents
      )
        ? body.stoneComponents
        : [];
      const res = await erpService.giveWorkToProcess(actor, {
        orderId,
        processType: body.processType as ProcessType,
        karigarId: String(body.karigarId || ""),
        grossInWeight:
          body.grossInWeight !== undefined && body.grossInWeight !== ""
            ? String(body.grossInWeight)
            : undefined,
        stoneComponents,
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        processStatus: res.process.status,
        grossInWeight: res.process.latestGrossInWeight.toFixed(3),
      });
    }

    if (action === "ISSUE_METAL") {
      const res = await erpService.issueMetalToOrder(actor, {
        orderId,
        karigarId: String(body.karigarId || ""),
        metalWeight: String(body.metalWeight || "0"),
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        movementId: res.movement.id,
        transactionNumber: res.journalTransaction.transactionNumber,
      });
    }

    if (action === "ADD_FILING_GOLD") {
      const res = await erpService.addFilingGoldIssue(actor, {
        orderId,
        additionalWeight: String(body.additionalWeight || "0"),
        karigarId: body.karigarId ? String(body.karigarId) : undefined,
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        movementId: res.movement.id,
        transactionNumber: res.journalTransaction.transactionNumber,
        cumulativeFilingIn: res.cumulativeFilingIn.toFixed(3),
      });
    }

    if (action === "RETURN_UNUSED_FILING_GOLD") {
      const res = await erpService.returnUnusedGoldFromFiling(actor, {
        orderId,
        grossWeight: String(body.grossWeight || "0"),
        businessDate: body.businessDate,
        reason: String(body.reason || "Unused gold returned to Admin"),
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        returnedWeight: res.returnedWeight.toFixed(3),
        netIssuedWeight: res.netIssuedWeight.toFixed(3),
      });
    }

    if (action === "CORRECT_FILING_ENTRY") {
      const res = await erpService.correctFilingEntry(actor, {
        orderId,
        newNetIssuedWeight: String(body.newNetIssuedWeight || "0"),
        reason: String(body.reason || ""),
        businessDate: body.businessDate,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        deltaWeight: res.deltaWeight.toFixed(3),
        netIssuedWeight: res.process.issuedMetalWeight.toFixed(3),
      });
    }

    if (action === "POST_PROCESS_ENTRY") {
      const stoneComponents: StoneComponentInput[] = Array.isArray(
        body.stoneComponents
      )
        ? body.stoneComponents
        : [];

      const res = await erpService.postProcessEntry(actor, {
        orderId,
        processType: body.processType as ProcessType,
        karigarId: String(body.karigarId || ""),
        nextKarigarId: body.nextKarigarId || undefined,
        grossInWeight: String(body.grossInWeight || "0"),
        nonGoldInWeight:
          body.nonGoldInWeight !== undefined && body.nonGoldInWeight !== ""
            ? String(body.nonGoldInWeight)
            : undefined,
        grossOutWeight: String(body.grossOutWeight || "0"),
        nonGoldOutWeight:
          body.nonGoldOutWeight !== undefined && body.nonGoldOutWeight !== ""
            ? String(body.nonGoldOutWeight)
            : undefined,
        custodyRetainedMetalWeight:
          body.custodyRetainedMetalWeight !== undefined &&
            body.custodyRetainedMetalWeight !== ""
            ? String(body.custodyRetainedMetalWeight)
            : undefined,
        stoneComponents,
        closeProcess:
          body.closeProcess !== undefined ? Boolean(body.closeProcess) : true,
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });

      return NextResponse.json({
        ok: true,
        visitId: res.visit.id,
        rawLossWeight: res.visit.rawLossWeight.toFixed(3),
        fineLossWeight: res.visit.fineLossWeight.toFixed(3),
      });
    }

    if (action === "COMPLETE_ORDER") {
      const res = await erpService.completeOrder(actor, {
        orderId,
        finishedGrossWeight:
          body.finishedGrossWeight !== undefined &&
            body.finishedGrossWeight !== ""
            ? String(body.finishedGrossWeight)
            : undefined,
        finishedStoneWeight:
          body.finishedStoneWeight !== undefined &&
            body.finishedStoneWeight !== ""
            ? String(body.finishedStoneWeight)
            : undefined,
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        status: res.order.status,
        finishedNetMetalWeight: res.order.finishedNetMetalWeight?.toFixed(3),
        finishedFineWeight: res.order.finishedFineWeight?.toFixed(3),
      });
    }

    if (action === "CANCEL_ORDER") {
      const res = await erpService.cancelOrder(actor, {
        orderId,
        reason: String(body.reason || ""),
      });
      return NextResponse.json({
        ok: true,
        status: res.status,
      });
    }

    if (action === "DELETE_ORDER") {
      const res = await erpService.deleteOrderWithRollback(actor, {
        orderId,
        reason: body.reason ? String(body.reason) : undefined,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        status: res.order.status,
        rolledBackPhysicalWeight: res.rolledBackPhysicalWeight.toFixed(3),
        rolledBackFineWeight: res.rolledBackFineWeight.toFixed(3),
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported order action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

