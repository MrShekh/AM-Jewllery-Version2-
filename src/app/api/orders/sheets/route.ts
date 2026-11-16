import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { ValidationError } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { formatKolkataDateDDMMYYYY } from "@/lib/date-and-export";

export async function GET() {
  try {
    const actor = await requireServerActor();
    const sheets = await prisma.registerSheet.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { sheetNumber: "desc" },
    });
    return NextResponse.json({
      ok: true,
      sheets: sheets.map((s) => ({
        id: s.id,
        sheetNumber: s.sheetNumber,
        title: s.title,
        orderCount: s.orderCount,
        totalIssuedWeight: Number(s.totalIssuedWeight).toFixed(3),
        totalLossWeight: Number(s.totalLossWeight).toFixed(3),
        closedAt: s.closedAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const body = await req.json().catch(() => ({}));
    const customTitle =
      typeof body.title === "string" ? body.title.trim() : "";

    const result = await prisma.$transaction(async (tx) => {
      const completedOrders = await tx.order.findMany({
        where: {
          organizationId: actor.organizationId,
          registerSheetId: null,
          status: "COMPLETED",
        },
        select: {
          id: true,
          initialIssuedMetalWeight: true,
          totalRawLossWeight: true,
        },
      });

      if (completedOrders.length === 0) {
        throw new ValidationError(
          "No completed orders in the active sheet to save. Mark orders as Completed first; in-process orders stay on the active sheet."
        );
      }

      const lastSheet = await tx.registerSheet.findFirst({
        where: { organizationId: actor.organizationId },
        orderBy: { sheetNumber: "desc" },
        select: { sheetNumber: true },
      });
      const nextNum = (lastSheet?.sheetNumber ?? 0) + 1;
      const now = new Date();
      const title =
        customTitle ||
        `Sheet #${nextNum} (${formatKolkataDateDDMMYYYY(now)})`;

      let totalIssued = 0;
      let totalLoss = 0;
      for (const o of completedOrders) {
        totalIssued += Number(o.initialIssuedMetalWeight || 0);
        totalLoss += Number(o.totalRawLossWeight || 0);
      }

      const sheet = await tx.registerSheet.create({
        data: {
          organizationId: actor.organizationId,
          sheetNumber: nextNum,
          title,
          orderCount: completedOrders.length,
          totalIssuedWeight: totalIssued.toFixed(6),
          totalLossWeight: totalLoss.toFixed(6),
          closedAt: now,
          closedById: actor.userId,
        },
      });

      await tx.order.updateMany({
        where: {
          id: { in: completedOrders.map((o) => o.id) },
        },
        data: { registerSheetId: sheet.id },
      });

      return sheet;
    });

    return NextResponse.json({
      ok: true,
      sheet: {
        id: result.id,
        sheetNumber: result.sheetNumber,
        title: result.title,
        orderCount: result.orderCount,
        totalIssuedWeight: Number(result.totalIssuedWeight).toFixed(3),
        totalLossWeight: Number(result.totalLossWeight).toFixed(3),
        closedAt: result.closedAt.toISOString(),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
