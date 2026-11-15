import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { ConflictError, erpService, NotFoundError } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const customerId = req.nextUrl.searchParams.get("customerId") || undefined;
    if (customerId) {
      const orderTab = (req.nextUrl.searchParams.get("orderTab") ||
        "ALL") as "ALL" | "ONGOING" | "COMPLETED" | "DELIVERED" | "CANCELLED";
      const monthFilter =
        req.nextUrl.searchParams.get("monthFilter") || undefined;
      const profile = await erpService.getCustomerProfileWorkspace(
        actor,
        customerId,
        { orderTab, monthFilter }
      );
      return NextResponse.json({ ok: true, ...profile });
    }
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const customers = await erpService.listCustomers(actor, search);
    return NextResponse.json({ ok: true, customers });
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
      `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

    if (action === "UPDATE_CUSTOMER") {
      const customer = await erpService.updateCustomer(actor, {
        customerId: String(body.customerId || ""),
        name: String(body.name || ""),
        phone: body.phone,
        email: body.email,
        address: body.address,
        gstNumber: body.gstNumber,
        notes: body.notes,
      });
      return NextResponse.json({ ok: true, customer });
    }

    const customer = await erpService.createCustomer(actor, {
      customerCode: body.customerCode,
      name: String(body.name || ""),
      phone: body.phone,
      email: body.email,
      address: body.address,
      gstNumber: body.gstNumber,
      notes: body.notes,
    });
    return NextResponse.json({ ok: true, customer });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN"]);
    const customerId = req.nextUrl.searchParams.get("customerId")?.trim() || "";
    if (!customerId) {
      throw new NotFoundError("Customer ID is required");
    }

    const existing = await prisma.customer.findFirst({
      where: { id: customerId, organizationId: actor.organizationId },
      select: {
        id: true,
        name: true,
        customerCode: true,
        _count: {
          select: {
            orders: true,
            customerBills: true,
            customerSettlements: true,
            customerGoldReceipts: true,
            customerCashReceipts: true,
            customerPaymentAllocations: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError("Customer not found");
    }

    const linkedCount =
      existing._count.orders +
      existing._count.customerBills +
      existing._count.customerSettlements +
      existing._count.customerGoldReceipts +
      existing._count.customerCashReceipts +
      existing._count.customerPaymentAllocations;

    if (linkedCount > 0) {
      throw new ConflictError(
        `Cannot delete customer "${existing.name}": they have existing orders, bills, or receipts. Delete/cancel those records first.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.customer.delete({ where: { id: existing.id } });
      await tx.auditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          entityType: "Customer",
          entityId: existing.id,
          action: "CUSTOMER_DELETED",
          summary: `Deleted customer ${existing.name} (${existing.customerCode})`,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      deletedCustomerId: existing.id,
      name: existing.name,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

