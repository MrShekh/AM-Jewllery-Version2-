import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService, ProcessType } from "@/lib/domain";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const sp = req.nextUrl.searchParams;
    const karigarId = sp.get("karigarId") || undefined;
    const processType = (sp.get("processType") as ProcessType) || undefined;
    const orderId = sp.get("orderId") || undefined;
    const fromDate = sp.get("fromDate") || undefined;
    const toDate = sp.get("toDate") || undefined;
    const settlementStatus =
      (sp.get("settlementStatus") as
        | "ALL"
        | "OUTSTANDING"
        | "PARTIAL"
        | "SETTLED") || "ALL";

    const data = await erpService.getKarigarRecoveryWorkspace(actor, {
      karigarId,
      processType,
      orderId,
      fromDate,
      toDate,
      settlementStatus,
    });

    return NextResponse.json({
      ok: true,
      ...data,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN"]);
    const body = await req.json();
    const action = String(body.action || "");
    const idempotencyKey =
      String(body.idempotencyKey || "") ||
      `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (action === "POST_RECOVERY_SETTLEMENT") {
      const res = await erpService.postRecoverySettlement(actor, {
        karigarId: String(body.karigarId || ""),
        scopeType: body.scopeType === "ALL_TOUCHES" ? "ALL_TOUCHES" : "SINGLE_TOUCH",
        scopeTouchPercent: body.scopeTouchPercent,
        scopeProcessType: body.scopeProcessType || undefined,
        businessDate: body.businessDate,
        makingDeductionInput: body.makingDeductionInput ?? "0",
        allowAdditionalMaking: Boolean(body.allowAdditionalMaking),
        additionalMakingReason: body.additionalMakingReason,
        lines: Array.isArray(body.lines) ? body.lines : [],
        shortageAction: body.shortageAction || undefined,
        acceptedShortageInput: body.acceptedShortageInput,
        snapshotClaimIds: Array.isArray(body.snapshotClaimIds)
          ? body.snapshotClaimIds
          : undefined,
        snapshotExpectedOutstandingFine: body.snapshotExpectedOutstandingFine,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        settlementId: res.settlement.id,
        settlementNumber: res.settlement.settlementNumber,
        receiptId: res.receipt?.id ?? null,
        receiptNumber: res.receipt?.receiptNumber ?? null,
        grossSelectedFine: res.settlement.grossSelectedFine.toFixed(4),
        makingDeductionFine: res.settlement.makingDeductionFine.toFixed(4),
        netExpectedFine: res.settlement.netExpectedFine.toFixed(4),
        receivedFine: res.settlement.receivedFine.toFixed(4),
        differenceFine: res.settlement.differenceFine.toFixed(4),
        shortageAction: res.settlement.shortageAction,
        acceptedShortageFine: res.settlement.acceptedShortageFine.toFixed(4),
        carriedShortageFine: res.settlement.carriedShortageFine.toFixed(4),
        excessFine: res.settlement.excessFine.toFixed(4),
      });
    }

    if (action === "REVERSE_RECOVERY_SETTLEMENT") {
      const res = await erpService.reverseRecoverySettlement(actor, {
        settlementId: String(body.settlementId || ""),
        reason: String(body.reason || ""),
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        settlementId: res.id,
        status: res.status,
      });
    }

    if (action === "RECORD_RECEIPT") {
      const res = await erpService.recordRecoveryReceipt(actor, {
        karigarId: String(body.karigarId || ""),
        businessDate: body.businessDate,
        referenceNumber: body.referenceNumber,
        notes: body.notes,
        lines: Array.isArray(body.lines) ? body.lines : [],
        allocationMode: body.allocationMode || "NONE",
        selectedLossRecordIds: Array.isArray(body.selectedLossRecordIds)
          ? body.selectedLossRecordIds
          : undefined,
        manualAllocations: Array.isArray(body.manualAllocations)
          ? body.manualAllocations
          : undefined,
        idempotencyKey,
      });

      return NextResponse.json({
        ok: true,
        receiptId: res.receipt.id,
        receiptNumber: res.receipt.receiptNumber,
        recoveredFineWeight: res.receipt.recoveredFineWeight.toFixed(4),
        unallocatedFineWeight: res.receipt.unallocatedFineWeight.toFixed(4),
        allocatedCount: res.allocations.length,
      });
    }

    if (action === "ALLOCATE_RECEIPT") {
      const res = await erpService.allocateRecoveryReceipt(actor, {
        recoveryReceiptId: String(body.recoveryReceiptId || ""),
        businessDate: body.businessDate,
        notes: body.notes,
        allocations: Array.isArray(body.allocations) ? body.allocations : [],
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        receiptId: res.receipt.id,
        unallocatedFineWeight: res.receipt.unallocatedFineWeight.toFixed(4),
        allocatedCount: res.allocations.length,
      });
    }

    if (action === "WRITE_OFF_LOSS") {
      const res = await erpService.writeOffProcessLoss(actor, {
        processLossRecordId: String(body.processLossRecordId || ""),
        fineAmount: String(body.fineAmount || "0"),
        businessDate: body.businessDate,
        reason: String(body.reason || ""),
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        writeOffId: res.id,
        writtenOffFineWeight: res.writtenOffFineWeight.toFixed(4),
      });
    }

    if (action === "UNDO_ALLOCATION") {
      const res = await erpService.undoRecoveryAllocation(actor, {
        allocationId: String(body.allocationId || ""),
        reason: String(body.reason || ""),
      });
      return NextResponse.json({
        ok: true,
        allocationId: res.allocation.id,
        unallocatedFineWeight: res.receipt.unallocatedFineWeight.toFixed(4),
      });
    }

    if (action === "REVERSE_RECEIPT") {
      const res = await erpService.reverseRecoveryReceipt(actor, {
        receiptId: String(body.receiptId || ""),
        reason: String(body.reason || ""),
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        receiptId: res.id,
        status: res.status,
      });
    }

    if (action === "REFUND_EXCESS") {
      const res = await erpService.refundExcessRecoveryReceipt(actor, {
        receiptId: String(body.receiptId || ""),
        purityId: String(body.purityId || ""),
        grossWeight: String(body.grossWeight || "0"),
        touchPercent: body.touchPercent,
        businessDate: body.businessDate,
        reason: String(body.reason || ""),
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        receiptId: res.id,
        unallocatedFineWeight: res.unallocatedFineWeight.toFixed(4),
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported recovery action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

