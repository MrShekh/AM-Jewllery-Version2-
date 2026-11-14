import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService } from "@/lib/domain";
import {
  buildSafeCsv,
  formatKolkataDateDDMMYYYY,
} from "@/lib/date-and-export";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const format = req.nextUrl.searchParams.get("format");

    if (format === "csv_register") {
      const monthKey = req.nextUrl.searchParams.get("monthKey") || undefined;
      const reg = await erpService.listRegisterOrders(actor, { monthKey });
      const headers = [
        "Bag No",
        "Order Date",
        "Customer",
        "Order Name",
        "Purity",
        "Touch %",
        "Status",
        "Initial Issued Gold (g)",
        "Filing In (g)",
        "Filing Out (g)",
        "Filing Loss (g)",
        "Free Polish In (g)",
        "Free Polish Out (g)",
        "Free Polish Loss (g)",
        "Setting Gross In (g)",
        "Stones Added (g)",
        "Setting Gross Out (g)",
        "Setting Loss (g)",
        "Final Polish Gross In (g)",
        "Final Polish Gross Out (g)",
        "Final Polish Loss (g)",
        "Finished Gross (g)",
        "Finished Stone (g)",
        "Finished Net Gold (g)",
        "Total Raw Loss (g)",
        "Total Fine Loss (g)",
      ];

      const rows = reg.rows.map((r) => {
        const findP = (pt: string) =>
          r.processes.find((p) => p.processType === pt);
        const fil = findP("FILING");
        const fp = findP("FREE_POLISH");
        const set = findP("SETTING");
        const fin = findP("FINAL_POLISH");

        return [
          { value: r.order.bagNumber },
          { value: formatKolkataDateDDMMYYYY(r.order.orderDate) },
          { value: r.customer.name },
          { value: r.order.orderName },
          { value: r.purity.displayLabel },
          {
            value: r.order.touchSnapshot.toFixed(4).replace(/\.?0+$/, ""),
            isNumeric: true,
          },
          { value: r.order.status },
          {
            value: r.order.initialIssuedMetalWeight.toFixed(3),
            isNumeric: true,
          },
          {
            value: fil ? fil.latestGrossInWeight.toFixed(3) : "",
            isNumeric: true,
          },
          {
            value: fil ? fil.latestGrossOutWeight.toFixed(3) : "",
            isNumeric: true,
          },
          { value: fil ? fil.closedLossWeight.toFixed(3) : "", isNumeric: true },
          {
            value: fp ? fp.latestGrossInWeight.toFixed(3) : "",
            isNumeric: true,
          },
          {
            value: fp ? fp.latestGrossOutWeight.toFixed(3) : "",
            isNumeric: true,
          },
          { value: fp ? fp.closedLossWeight.toFixed(3) : "", isNumeric: true },
          {
            value: set ? set.latestGrossInWeight.toFixed(3) : "",
            isNumeric: true,
          },
          { value: set ? set.addedStoneWeight.toFixed(3) : "", isNumeric: true },
          {
            value: set ? set.latestGrossOutWeight.toFixed(3) : "",
            isNumeric: true,
          },
          { value: set ? set.closedLossWeight.toFixed(3) : "", isNumeric: true },
          {
            value: fin ? fin.latestGrossInWeight.toFixed(3) : "",
            isNumeric: true,
          },
          {
            value: fin ? fin.latestGrossOutWeight.toFixed(3) : "",
            isNumeric: true,
          },
          { value: fin ? fin.closedLossWeight.toFixed(3) : "", isNumeric: true },
          {
            value: r.order.finishedGrossWeight
              ? r.order.finishedGrossWeight.toFixed(3)
              : "",
            isNumeric: true,
          },
          {
            value: r.order.finishedStoneWeight
              ? r.order.finishedStoneWeight.toFixed(3)
              : "",
            isNumeric: true,
          },
          {
            value: r.order.finishedNetMetalWeight
              ? r.order.finishedNetMetalWeight.toFixed(3)
              : "",
            isNumeric: true,
          },
          { value: r.order.totalRawLossWeight.toFixed(3), isNumeric: true },
          { value: r.order.totalFineLossWeight.toFixed(3), isNumeric: true },
        ];
      });

      const csv = buildSafeCsv(headers, rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="AM_Jewellers_V2_Production_Register_${monthKey || "ALL"
            }.csv"`,
        },
      });
    }

    if (format === "csv_recovery") {
      const karigarId = req.nextUrl.searchParams.get("karigarId") || undefined;
      const ws = await erpService.getKarigarRecoveryWorkspace(actor, {
        karigarId,
      });
      const headers = [
        "Bag No",
        "Order Name",
        "Karigar",
        "Process",
        "Completion Date",
        "Touch %",
        "Raw Loss (g)",
        "Original Loss (g fine)",
        "Making Allowed (g fine)",
        "Gold Recovered (g fine)",
        "Accepted Shortage (g fine)",
        "Outstanding (g fine)",
        "Status",
      ];
      const rows = ws.eligibleLosses.map((l) => [
        { value: l.bagNumber },
        { value: l.orderName },
        { value: l.karigarName },
        { value: l.processType },
        { value: formatKolkataDateDDMMYYYY(l.completionDate) },
        { value: l.touchPercent, isNumeric: true },
        { value: l.rawLossWeight, isNumeric: true },
        { value: l.originalFineLoss, isNumeric: true },
        { value: l.makingAllowedFine, isNumeric: true },
        { value: l.recoveredFine, isNumeric: true },
        { value: l.writtenOffFine, isNumeric: true },
        { value: l.outstandingFine, isNumeric: true },
        { value: l.settlementStatus },
      ]);
      const csv = buildSafeCsv(headers, rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="AM_Jewellers_V2_Recovery_Statement.csv"`,
        },
      });
    }

    const report = await erpService.getDailyReconciliation(actor);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return handleApiError(err);
  }
}

