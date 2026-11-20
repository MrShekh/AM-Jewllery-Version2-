import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService } from "@/lib/domain";
import { getCustomerAdvanceBreakdown } from "@/lib/directory-stats";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const [
      reconciliation,
      history,
      sales,
      conversions,
      dashboard,
      customerAdvanceBreakdown,
    ] = await Promise.all([
      erpService.getDailyReconciliation(actor),
      erpService.listJournalHistory(actor, search),
      erpService.listStockSales(actor),
      erpService.listStockConversions(actor),
      erpService.getDashboardSummary(actor),
      getCustomerAdvanceBreakdown(actor.organizationId),
    ]);

    return NextResponse.json({
      ok: true,
      reconciliation,
      sales,
      conversions,
      customerAdvanceFine: dashboard.totals.unusedCustomerGoldCredits,
      customerAdvanceBreakdown,
      history: history.map((h) => ({
        ...h,
        touchSnapshot: h.touchSnapshot.toFixed(4).replace(/\.?0+$/, ""),
        physicalWeight: h.physicalWeight.toFixed(3),
        fineEquivalentWeight: h.fineEquivalentWeight.toFixed(3),
      })),
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
      `stk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (action === "OPENING_BALANCE") {
      const tx = await erpService.postOpeningBalance(actor, {
        purityId: String(body.purityId || ""),
        physicalWeight: String(body.physicalWeight || "0"),
        businessDate: body.businessDate,
        reason: body.reason,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        transaction: {
          ...tx,
          physicalWeight: tx.physicalWeight.toFixed(3),
          fineEquivalentWeight: tx.fineEquivalentWeight.toFixed(3),
        },
      });
    }

    if (action === "STOCK_RECEIPT") {
      const tx = await erpService.postStockReceipt(actor, {
        purityId: String(body.purityId || ""),
        physicalWeight: String(body.physicalWeight || "0"),
        sourceReference: String(body.sourceReference || "MANUAL-IN"),
        reason: body.reason,
        businessDate: body.businessDate,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        transaction: {
          ...tx,
          physicalWeight: tx.physicalWeight.toFixed(3),
          fineEquivalentWeight: tx.fineEquivalentWeight.toFixed(3),
        },
      });
    }

    if (action === "STOCK_REMOVAL") {
      const tx = await erpService.postStockRemoval(actor, {
        purityId: String(body.purityId || ""),
        physicalWeight: String(body.physicalWeight || "0"),
        sourceReference: String(body.sourceReference || "MANUAL-OUT"),
        reason: body.reason,
        businessDate: body.businessDate,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        transaction: {
          ...tx,
          physicalWeight: tx.physicalWeight.toFixed(3),
          fineEquivalentWeight: tx.fineEquivalentWeight.toFixed(3),
        },
      });
    }

    if (action === "REVERSE_RECEIPT") {
      const tx = await erpService.reverseUnusedStockReceipt(actor, {
        transactionId: String(body.transactionId || ""),
        reason: String(body.reason || ""),
        businessDate: body.businessDate,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        transaction: {
          ...tx,
          physicalWeight: tx.physicalWeight.toFixed(3),
          fineEquivalentWeight: tx.fineEquivalentWeight.toFixed(3),
        },
      });
    }

    if (action === "STOCK_SALE") {
      const sale = await erpService.postStockSale(actor, {
        purityId: String(body.purityId || ""),
        physicalWeight: String(body.physicalWeight || "0"),
        businessDate: body.businessDate,
        buyerName: String(body.buyerName || ""),
        buyerPhone: body.buyerPhone,
        pricePerGramRupees: body.pricePerGramRupees,
        paidAmountRupees: body.paidAmountRupees,
        referenceNumber: body.referenceNumber,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        sale: {
          ...sale,
          physicalWeight: sale.physicalWeight.toFixed(3),
          fineEquivalentWeight: sale.fineEquivalentWeight.toFixed(3),
          totalAmountRupees: sale.totalAmountRupees.toFixed(2),
          paidAmountRupees: sale.paidAmountRupees.toFixed(2),
        },
      });
    }

    if (action === "REVERSE_STOCK_SALE") {
      const sale = await erpService.reverseStockSale(actor, {
        saleId: String(body.saleId || ""),
        reason: String(body.reason || ""),
        idempotencyKey,
      });
      return NextResponse.json({ ok: true, saleId: sale.id, status: sale.status });
    }

    if (action === "PREVIEW_CONVERSION") {
      const preview = await erpService.previewStockConversion(actor, {
        sourcePurityId: String(body.sourcePurityId || ""),
        sourceWeight: String(body.sourceWeight || "0"),
        targetPurityId: String(body.targetPurityId || ""),
      });
      return NextResponse.json({ ok: true, preview });
    }

    if (action === "POST_CONVERSION") {
      const conv = await erpService.postStockConversion(actor, {
        conversionType: body.conversionType,
        businessDate: body.businessDate,
        sourcePurityId: String(body.sourcePurityId || ""),
        sourceWeight: String(body.sourceWeight || "0"),
        targetPurityId: String(body.targetPurityId || ""),
        actualOutputWeight: String(body.actualOutputWeight || "0"),
        residueWeight: body.residueWeight,
        returnedMetalWeight: body.returnedMetalWeight,
        lossTreatment: body.lossTreatment,
        refinerOrPartner: body.refinerOrPartner,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        conversion: {
          ...conv,
          sourceWeight: conv.sourceWeight.toFixed(3),
          actualOutputWeight: conv.actualOutputWeight.toFixed(3),
          lossFineWeight: conv.lossFineWeight.toFixed(4),
        },
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown stock action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

