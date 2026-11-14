import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService } from "@/lib/domain";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const customerId = req.nextUrl.searchParams.get("customerId") || undefined;
    const data = await erpService.getBillingWorkspace(actor, { customerId });
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const body = await req.json();
    const action = String(body.action || "");
    const idempotencyKey =
      String(body.idempotencyKey || "") ||
      `bill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (action === "SAVE_DRAFT") {
      const res = await erpService.saveBillDraft(actor, {
        draftId: body.draftId,
        customerId: String(body.customerId || ""),
        billDate: body.billDate,
        billType: body.billType || "ORDER_DELIVERY",
        templateId: body.templateId,
        notes: body.notes,
        lines: Array.isArray(body.lines) ? body.lines : [],
      });
      return NextResponse.json({
        ok: true,
        billId: res.bill.id,
        billNumber: res.bill.billNumber,
        status: res.bill.status,
        totalFineGold: res.bill.totalFineGold.toFixed(4),
        totalCashRupees: res.bill.totalCashRupees.toFixed(2),
        previewHtml: res.bill.previewHtml,
      });
    }

    if (action === "POST_BILL_AND_DELIVER") {
      const res = await erpService.postBillAndDeliver(actor, {
        draftId: body.draftId,
        customerId: String(body.customerId || ""),
        billDate: body.billDate,
        billType: body.billType || "ORDER_DELIVERY",
        templateId: body.templateId,
        notes: body.notes,
        applyFineAdvance: Boolean(body.applyFineAdvance),
        customAdvanceFineAmount:
          body.customAdvanceFineAmount !== undefined &&
          body.customAdvanceFineAmount !== ""
            ? body.customAdvanceFineAmount
            : undefined,
        newReceiptAtIssuance:
          body.newReceiptAtIssuance &&
          Number(body.newReceiptAtIssuance.amountReceived || 0) > 0
            ? body.newReceiptAtIssuance
            : undefined,
        applyInrAdvance: Boolean(body.applyInrAdvance),
        lines: Array.isArray(body.lines) ? body.lines : [],
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        billId: res.bill.id,
        billNumber: res.bill.billNumber,
        status: res.bill.status,
        deliveryStatus: res.bill.deliveryStatus,
        settlementStatus: res.bill.settlementStatus,
        totalFineGold: res.bill.totalFineGold.toFixed(4),
        totalCashRupees: res.bill.totalCashRupees.toFixed(2),
        deliveredFineMetal: res.bill.deliveredFineMetal.toFixed(4),
        commercialMakingFine: res.bill.commercialMakingFine.toFixed(4),
        previewHtml: res.bill.previewHtml,
      });
    }

    if (action === "CONFIGURE_FINE_CONVENTION") {
      const res = await erpService.configureCustomerFineReceiptConvention(
        actor,
        {
          mode: body.mode,
          configuredTouch: body.configuredTouch,
          finePurityId: body.finePurityId,
        }
      );
      return NextResponse.json({ ok: true, convention: res });
    }

    if (action === "PREVIEW_FINE_RECEIPT") {
      const preview = await erpService.previewCustomerFineGoldReceipt(actor, {
        customerId: String(body.customerId || ""),
        amountReceived: body.amountReceived ?? "0",
        physicalWeightOverride: body.physicalWeightOverride,
        touchPercentOverride: body.touchPercentOverride,
        allocationMode: body.allocationMode || "OLDEST_FIRST",
        selectedBillIds: Array.isArray(body.selectedBillIds)
          ? body.selectedBillIds
          : undefined,
        manualAllocations: Array.isArray(body.manualAllocations)
          ? body.manualAllocations
          : undefined,
      });
      return NextResponse.json({ ok: true, preview });
    }

    if (action === "RECEIVE_FINE_GOLD") {
      const res = await erpService.receiveCustomerFineGold(actor, {
        customerId: String(body.customerId || ""),
        amountReceived: body.amountReceived,
        physicalWeightOverride: body.physicalWeightOverride,
        touchPercentOverride: body.touchPercentOverride,
        businessDate: body.businessDate,
        referenceNumber: body.referenceNumber,
        notes: body.notes,
        allocationMode: body.allocationMode || "OLDEST_FIRST",
        selectedBillIds: Array.isArray(body.selectedBillIds)
          ? body.selectedBillIds
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
        totalFineWeight: res.receipt.totalFineWeight.toFixed(4),
        unallocatedFineWeight: res.receipt.unallocatedFineWeight.toFixed(4),
        allocatedCount: res.allocations.length,
        unselectedUnpaidBillsCount: res.unselectedUnpaidBillsCount,
        unselectedUnpaidFineTotal: res.unselectedUnpaidFineTotal.toFixed(4),
      });
    }

    if (action === "REFUND_GOLD_ADVANCE") {
      const res = await erpService.refundCustomerGoldAdvance(actor, {
        customerId: String(body.customerId || ""),
        refundFineWeight: body.refundFineWeight,
        physicalReturnWeight: body.physicalReturnWeight,
        receiptId: body.receiptId,
        businessDate: body.businessDate,
        reason: String(body.reason || ""),
        idempotencyKey,
      });
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === "RECORD_GOLD_RECEIPT") {
      const res = await erpService.recordCustomerGoldReceipt(actor, {
        customerId: String(body.customerId || ""),
        businessDate: body.businessDate,
        referenceNumber: body.referenceNumber,
        notes: body.notes,
        lines: Array.isArray(body.lines) ? body.lines : [],
        allocationMode: body.allocationMode || "NONE",
        selectedBillIds: Array.isArray(body.selectedBillIds)
          ? body.selectedBillIds
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
        totalFineWeight: res.receipt.totalFineWeight.toFixed(4),
        unallocatedFineWeight: res.receipt.unallocatedFineWeight.toFixed(4),
      });
    }

    if (action === "RECORD_CASH_RECEIPT") {
      const res = await erpService.recordCustomerCashReceipt(actor, {
        customerId: String(body.customerId || ""),
        businessDate: body.businessDate,
        amountRupees: String(body.amountRupees || "0"),
        paymentMode: body.paymentMode || "CASH",
        referenceNumber: body.referenceNumber,
        notes: body.notes,
        allocationMode: body.allocationMode || "NONE",
        selectedBillIds: Array.isArray(body.selectedBillIds)
          ? body.selectedBillIds
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
        amountRupees: res.receipt.amountRupees.toFixed(2),
        unallocatedRupees: res.receipt.unallocatedRupees.toFixed(2),
      });
    }

    if (action === "ALLOCATE_PAYMENT") {
      const res = await erpService.allocateCustomerPayment(actor, {
        goldReceiptId: body.goldReceiptId,
        cashReceiptId: body.cashReceiptId,
        businessDate: body.businessDate,
        notes: body.notes,
        allocations: Array.isArray(body.allocations) ? body.allocations : [],
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        allocatedCount: res.allocations.length,
      });
    }

    if (action === "CANCEL_BILL") {
      const res = await erpService.cancelPostedBill(actor, {
        billId: String(body.billId || ""),
        reason: String(body.reason || ""),
      });
      return NextResponse.json({
        ok: true,
        billId: res.bill.id,
        creditNoteNumber: res.bill.creditNoteNumber,
        releasedAllocations: res.releasedAllocations,
      });
    }

    if (action === "UNDO_ALLOCATION") {
      const res = await erpService.undoCustomerPaymentAllocation(actor, {
        allocationId: String(body.allocationId || ""),
        reason: String(body.reason || ""),
      });
      return NextResponse.json({ ok: true, allocationId: res.id });
    }

    if (action === "REVERSE_GOLD_RECEIPT") {
      const res = await erpService.reverseCustomerGoldReceipt(actor, {
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

    if (action === "REVERSE_CASH_RECEIPT") {
      const res = await erpService.reverseCustomerCashReceipt(actor, {
        receiptId: String(body.receiptId || ""),
        reason: String(body.reason || ""),
      });
      return NextResponse.json({
        ok: true,
        receiptId: res.id,
        status: res.status,
      });
    }

    if (action === "CREATE_SHARE_TOKEN") {
      const token = await erpService.createBillShareToken(
        actor,
        String(body.billId || "")
      );
      return NextResponse.json({
        ok: true,
        shareToken: {
          id: token.id,
          token: token.token,
          billId: token.billId,
          isRevoked: token.isRevoked,
        },
      });
    }

    if (action === "REVOKE_SHARE_TOKEN") {
      const token = await erpService.revokeBillShareToken(
        actor,
        String(body.tokenId || "")
      );
      return NextResponse.json({ ok: true, id: token.id, isRevoked: token.isRevoked });
    }

    if (action === "CONSOLIDATED_STATEMENT") {
      const statement = await erpService.getCustomerConsolidatedStatement(
        actor,
        String(body.customerId || "")
      );
      return NextResponse.json({ ok: true, statement });
    }

    if (action === "SAVE_TEMPLATE") {
      const tpl = await erpService.saveBillTemplate(actor, body.template || {});
      return NextResponse.json({ ok: true, templateId: tpl.id });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported billing action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

