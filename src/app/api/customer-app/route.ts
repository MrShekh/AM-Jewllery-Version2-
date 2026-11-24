import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { getFeatureFlags } from "@/lib/env-safety";
import {
  deleteCustomerOrderRequest,
  listCustomerOwnWorkspace,
  postCustomerRequestMessage,
  submitCustomerOrderRequest,
  updateCustomerOwnProfile,
} from "@/lib/customer-app-service";

export async function GET() {
  try {
    if (!getFeatureFlags().customerApp) {
      return NextResponse.json(
        { ok: false, error: "Customer App is currently disabled" },
        { status: 503 }
      );
    }
    const actor = await requireServerActor(["CUSTOMER"]);
    const data = await listCustomerOwnWorkspace(actor);
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
    if (!getFeatureFlags().customerApp) {
      return NextResponse.json(
        { ok: false, error: "Customer App is currently disabled" },
        { status: 503 }
      );
    }
    const actor = await requireServerActor(["CUSTOMER"]);
    const body = await req.json();
    const action = String(body?.action || "SUBMIT_REQUEST");

    if (action === "SEND_MESSAGE" || action === "SUBMIT_CHANGE_REQUEST") {
      const msg = await postCustomerRequestMessage(actor, {
        requestId: String(body?.requestId || ""),
        body: String(body?.body || ""),
        isChangeRequest: action === "SUBMIT_CHANGE_REQUEST",
        attachmentIds: Array.isArray(body?.attachmentIds)
          ? body.attachmentIds.map(String)
          : [],
      });
      return NextResponse.json({ ok: true, message: msg });
    }

    if (action === "DELETE_REQUEST") {
      const res = await deleteCustomerOrderRequest(
        actor,
        String(body?.requestId || "")
      );
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === "UPDATE_PROFILE") {
      const res = await updateCustomerOwnProfile(actor, {
        name: body?.name,
        phone: body?.phone,
        email: body?.email,
        address: body?.address,
        gstNumber: body?.gstNumber,
        profilePhotoUrl: body?.profilePhotoUrl,
      });
      return NextResponse.json({ ok: true, ...res });
    }

    const res = await submitCustomerOrderRequest(actor, {
      requestedDeliveryDate: body?.requestedDeliveryDate || null,
      customerNote: body?.customerNote || "",
      items: Array.isArray(body?.items) ? body.items : [],
      idempotencyKey: String(
        body?.idempotencyKey ||
          `creq_${actor.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      ),
    });

    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return handleApiError(err);
  }
}
