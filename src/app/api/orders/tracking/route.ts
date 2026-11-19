import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import {
  getJobCardTrackingMap,
  recordJobCardPrints,
  setJobCardHolder,
  type JobCardHolderType,
} from "@/lib/job-card-tracking";

export async function GET() {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const tracking = await getJobCardTrackingMap(actor.organizationId);
    return NextResponse.json({ ok: true, tracking });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "MARK_PRINTED") {
      const orderIds = Array.isArray(body?.orderIds)
        ? body.orderIds.map(String)
        : body?.orderId
        ? [String(body.orderId)]
        : [];
      await recordJobCardPrints(actor.organizationId, actor.userId, orderIds);
      const tracking = await getJobCardTrackingMap(actor.organizationId);
      return NextResponse.json({ ok: true, tracking });
    }

    if (action === "SET_HOLDER") {
      const orderId = String(body?.orderId || "");
      const holderType = String(body?.holderType || "OFFICE") as JobCardHolderType;
      const holderName = String(body?.holderName || "");
      const holderNote = body?.holderNote ? String(body.holderNote) : undefined;
      if (!orderId) {
        return NextResponse.json(
          { ok: false, error: "orderId is required" },
          { status: 400 }
        );
      }
      const info = await setJobCardHolder({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        orderId,
        holderType,
        holderName: holderName || holderType,
        holderNote,
      });
      return NextResponse.json({ ok: true, info });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown tracking action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
