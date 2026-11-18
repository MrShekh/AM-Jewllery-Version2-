import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService } from "@/lib/domain";
import { getAdminMakingChargeSummary } from "@/lib/admin-making-charge";
import { getCastingLossSummary } from "@/lib/casting-loss";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const sp = req.nextUrl.searchParams;
    const [summary, adminMakingCharge, castingLoss] = await Promise.all([
      erpService.getDashboardSummary(actor),
      actor.role === "OWNER_ADMIN"
        ? getAdminMakingChargeSummary(actor.organizationId, {
            filter: sp.get("makingFilter"),
            month: sp.get("month"),
            from: sp.get("from"),
            to: sp.get("to"),
          })
        : Promise.resolve(null),
      getCastingLossSummary(actor.organizationId, {
        filter: sp.get("castingFilter"),
        month: sp.get("castingMonth"),
        from: sp.get("castingFrom"),
        to: sp.get("castingTo"),
      }),
    ]);
    return NextResponse.json({ ok: true, summary, adminMakingCharge, castingLoss });
  } catch (err) {
    return handleApiError(err);
  }
}

