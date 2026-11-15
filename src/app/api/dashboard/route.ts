import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService } from "@/lib/domain";
import { getAdminMakingChargeSummary } from "@/lib/admin-making-charge";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const sp = req.nextUrl.searchParams;
    const [summary, adminMakingCharge] = await Promise.all([
      erpService.getDashboardSummary(actor),
      actor.role === "OWNER_ADMIN"
        ? getAdminMakingChargeSummary(actor.organizationId, {
            filter: sp.get("makingFilter"),
            month: sp.get("month"),
            from: sp.get("from"),
            to: sp.get("to"),
          })
        : Promise.resolve(null),
    ]);
    return NextResponse.json({ ok: true, summary, adminMakingCharge });
  } catch (err) {
    return handleApiError(err);
  }
}

