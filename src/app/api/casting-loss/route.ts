import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  deleteCastingLoss,
  getCastingLossSummary,
  recordCastingLoss,
  recoverCastingLoss,
} from "@/lib/casting-loss";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const sp = req.nextUrl.searchParams;
    const [summary, purities] = await Promise.all([
      getCastingLossSummary(actor.organizationId, {
        filter: sp.get("filter"),
        month: sp.get("month"),
        from: sp.get("from"),
        to: sp.get("to"),
      }),
      prisma.purityDefinition.findMany({
        where: { organizationId: actor.organizationId, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { touchPercent: "desc" }],
        select: {
          id: true,
          code: true,
          displayLabel: true,
          karatLabel: true,
          touchPercent: true,
          isFineCategory: true,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      summary,
      purities: purities.map((p) => ({
        ...p,
        touchPercent: Number(p.touchPercent).toFixed(2),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const body = await req.json();
    const action = body?.action || "CREATE";

    if (action === "DELETE") {
      await deleteCastingLoss(actor.organizationId, String(body?.id || ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "RECOVER") {
      const recovery = await recoverCastingLoss(actor, {
        entryIds: Array.isArray(body?.entryIds) ? body.entryIds.map(String) : undefined,
        recoveredFineGrams: body?.recoveredFineGrams,
        businessDate: body?.businessDate ? String(body.businessDate) : undefined,
        note: body?.note ? String(body.note) : undefined,
        idempotencyKey: body?.idempotencyKey ? String(body.idempotencyKey) : undefined,
      });
      return NextResponse.json({ ok: true, recovery });
    }

    const entry = await recordCastingLoss({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      purityId: String(body?.purityId || ""),
      lossWeightGrams: body?.lossWeightGrams,
      businessDate: body?.businessDate ? String(body.businessDate) : undefined,
      note: body?.note ? String(body.note) : undefined,
    });

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    return handleApiError(err);
  }
}
