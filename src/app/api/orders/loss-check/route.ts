import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { NotFoundError, ValidationError } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

function extractOrderOrBagToken(raw: string): string {
  const trimmed = raw.trim();
  const scanMatch = trimmed.match(/\/scan\/([^/?#]+)/i);
  if (scanMatch?.[1]) {
    return decodeURIComponent(scanMatch[1]);
  }
  const orderParamMatch = trimmed.match(/[?&]order=([^&#]+)/i);
  if (orderParamMatch?.[1]) {
    return decodeURIComponent(orderParamMatch[1]);
  }
  return trimmed.replace(/^bag[-\s#]*/i, "").replace(/^#/, "").trim();
}

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const rawQ = req.nextUrl.searchParams.get("q") || "";
    const token = extractOrderOrBagToken(rawQ);
    if (!token) {
      throw new ValidationError("Please scan a QR code or enter a bag number");
    }

    const order = await prisma.order.findFirst({
      where: {
        organizationId: actor.organizationId,
        OR: [{ id: token }, { bagNumber: token }],
      },
      include: {
        customer: { select: { id: true, name: true, customerCode: true } },
        purity: {
          select: {
            id: true,
            code: true,
            displayLabel: true,
            karatLabel: true,
            touchPercent: true,
          },
        },
        processes: {
          orderBy: { canonicalSequence: "asc" },
          include: {
            assignedKarigar: {
              select: { id: true, karigarCode: true, name: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`No bag/order found for "${rawQ.trim()}"`);
    }

    const touchNum = Number(order.touchSnapshot);
    const touchDisplay = order.touchSnapshot.toFixed(4).replace(/\.?0+$/, "");

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        bagNumber: order.bagNumber,
        orderName: order.orderName,
        customerName: order.customer.name,
        customerCode: order.customer.customerCode,
        purityId: order.purity.id,
        purityLabel: order.purity.displayLabel,
        karatLabel: order.purity.karatLabel,
        touchPercent: touchDisplay,
        status: order.status,
        totalRawLossWeight: Number(order.totalRawLossWeight).toFixed(3),
        totalFineLossWeight: Number(order.totalFineLossWeight).toFixed(3),
      },
      processes: order.processes.map((p) => {
        const rawLoss = Number(p.closedLossWeight);
        const fineLoss = (rawLoss * touchNum) / 100;
        return {
          processType: p.processType,
          karigarId: p.assignedKarigar?.id ?? null,
          karigarName: p.assignedKarigar?.name ?? "Unassigned",
          status: p.status,
          issuedMetalWeight: Number(p.issuedMetalWeight).toFixed(3),
          returnedMetalWeight: Number(p.returnedMetalWeight).toFixed(3),
          extraReturnedMetalWeight: Number(p.extraReturnedMetalWeight).toFixed(3),
          closedLossWeight: rawLoss.toFixed(3),
          fineLossWeight: fineLoss.toFixed(3),
        };
      }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
