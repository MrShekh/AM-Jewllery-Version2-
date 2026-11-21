import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService, ProcessType, StoneComponentInput } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

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

    if (action === "MOVE_PENDING_STAGE") {
      const fromProcessType = body.fromProcessType as ProcessType;
      const toProcessType = body.toProcessType as ProcessType;
      if (!fromProcessType || !toProcessType || fromProcessType === toProcessType) {
        return NextResponse.json(
          { ok: false, error: "Select a different destination stage" },
          { status: 400 }
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, organizationId: actor.organizationId },
        });
        if (!order) {
          throw new Error("Order not found");
        }
        const fromProc = await tx.orderProcess.findFirst({
          where: { orderId, processType: fromProcessType },
        });
        const toProc = await tx.orderProcess.findFirst({
          where: { orderId, processType: toProcessType },
        });
        if (!fromProc || !toProc) {
          throw new Error("Source or destination process stage not found on this order");
        }
        if (fromProc.status === "CLOSED") {
          throw new Error(`Cannot move ${fromProcessType}: stage is already CLOSED`);
        }
        if (toProc.status === "CLOSED") {
          throw new Error(`Cannot move to ${toProcessType}: destination stage is already CLOSED`);
        }
        if (Number(fromProc.custodyMetalWeight) <= 0 || Number(fromProc.issuedMetalWeight) <= 0) {
          throw new Error(`${fromProcessType} has no pending metal to move`);
        }
        if (Number(fromProc.returnedMetalWeight) > 0 || Number(fromProc.closedLossWeight) > 0) {
          throw new Error(`Cannot move ${fromProcessType}: work has already been returned on this stage`);
        }
        if (Number(toProc.custodyMetalWeight) > 0 || Number(toProc.issuedMetalWeight) > 0) {
          throw new Error(`Cannot move to ${toProcessType}: destination stage already has metal issued`);
        }

        await tx.orderProcess.update({
          where: { id: toProc.id },
          data: {
            assignedKarigarId: fromProc.assignedKarigarId,
            issuedMetalWeight: fromProc.issuedMetalWeight,
            custodyMetalWeight: fromProc.custodyMetalWeight,
            carriedStoneInWeight: fromProc.carriedStoneInWeight,
            latestGrossInWeight: fromProc.latestGrossInWeight,
          },
        });
        await tx.orderProcess.update({
          where: { id: fromProc.id },
          data: {
            assignedKarigarId: null,
            issuedMetalWeight: 0,
            custodyMetalWeight: 0,
            carriedStoneInWeight: 0,
            latestGrossInWeight: 0,
          },
        });
        await tx.metalMovement.updateMany({
          where: { orderProcessId: fromProc.id, movementType: "PROCESS_TRANSFER" },
          data: {
            orderProcessId: toProc.id,
            notes: `Moved from ${fromProcessType} to ${toProcessType}`,
          },
        });
        await tx.processVisit.updateMany({
          where: { orderProcessId: fromProc.id },
          data: { orderProcessId: toProc.id },
        });
        await tx.journalLine.updateMany({
          where: { orderProcessId: fromProc.id },
          data: { orderProcessId: toProc.id },
        });

        return {
          movedWeight: fromProc.custodyMetalWeight.toFixed(3),
          fromProcessType,
          toProcessType,
        };
      });

      return NextResponse.json({ ok: true, ...result });
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
        nextProcessType: body.nextProcessType || undefined,
        adjustAgainstKarigarBalance: Boolean(body.adjustAgainstKarigarBalance),
        isRepairing: Boolean(body.isRepairing),
        settleNoksiImmediately: Boolean(body.settleNoksiImmediately),
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
        extraMetalReturnedWeight:
          body.extraMetalReturnedWeight !== undefined &&
          body.extraMetalReturnedWeight !== ""
            ? String(body.extraMetalReturnedWeight)
            : undefined,
        extraMetalTouchPercent:
          body.extraMetalTouchPercent !== undefined &&
          body.extraMetalTouchPercent !== ""
            ? String(body.extraMetalTouchPercent)
            : undefined,
        extraMetalPurityId: body.extraMetalPurityId
          ? String(body.extraMetalPurityId)
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
        extraMetalReturnedWeight: res.visit.extraMetalReturnedWeight.toFixed(3),
        extraMetalFineWeight: res.visit.extraMetalFineWeight.toFixed(3),
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

