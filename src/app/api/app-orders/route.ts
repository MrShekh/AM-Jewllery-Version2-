import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { getFeatureFlags } from "@/lib/env-safety";
import {
  getManagerAppOrdersWorkspace,
  linkRequestItemsToBag,
  reviewCustomerOrderRequest,
  saveOrSendBagCadSheet,
  unlinkBagFromRequests,
} from "@/lib/app-orders-cad-service";
import { postCustomerRequestMessage } from "@/lib/customer-app-service";

export async function GET() {
  try {
    if (!getFeatureFlags().appOrders) {
      return NextResponse.json(
        { ok: false, error: "App Orders module is currently disabled" },
        { status: 503 }
      );
    }
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const data = await getManagerAppOrdersWorkspace(actor);
    return NextResponse.json(
      { ok: true, ...data },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!getFeatureFlags().appOrders) {
      return NextResponse.json(
        { ok: false, error: "App Orders module is currently disabled" },
        { status: 503 }
      );
    }
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "REVIEW_REQUEST") {
      const res = await reviewCustomerOrderRequest(actor, {
        requestId: String(body?.requestId || ""),
        decision: body?.decision,
        confirmedDeliveryDate: body?.confirmedDeliveryDate || null,
        note: body?.note || "",
      });
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === "MESSAGE_CUSTOMER") {
      const msg = await postCustomerRequestMessage(actor, {
        requestId: String(body?.requestId || ""),
        body: String(body?.body || ""),
      });
      return NextResponse.json({ ok: true, message: msg });
    }

    if (action === "LINK_BAG") {
      const links = await linkRequestItemsToBag(
        actor,
        String(body?.orderId || ""),
        Array.isArray(body?.links) ? body.links : []
      );
      return NextResponse.json({ ok: true, links });
    }

    if (action === "UNLINK_BAG") {
      const count = await unlinkBagFromRequests(
        actor,
        String(body?.orderId || ""),
        String(body?.reason || "Unlinked by manager")
      );
      return NextResponse.json({ ok: true, unlinkedCount: count });
    }

    if (action === "SAVE_CAD_SHEET" || action === "SEND_CAD_TO_DESIGNER") {
      const assignment = await saveOrSendBagCadSheet(actor, {
        orderId: String(body?.orderId || ""),
        cadRequired: body?.cadRequired !== false,
        assignedDesignerId: body?.assignedDesignerId || null,
        cadDeadline: body?.cadDeadline || null,
        confirmedSpecs: body?.confirmedSpecs || {},
        instructions: String(body?.instructions || ""),
        selectedMediaIds: Array.isArray(body?.selectedMediaIds)
          ? body.selectedMediaIds.map(String)
          : [],
        sendToDesigner: action === "SEND_CAD_TO_DESIGNER",
        changeSummary: body?.changeSummary || undefined,
      });
      return NextResponse.json({ ok: true, assignment });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
