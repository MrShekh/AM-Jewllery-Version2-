import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { getFeatureFlags } from "@/lib/env-safety";
import {
  listCadDesignerJobs,
  performCadDesignerAction,
} from "@/lib/app-orders-cad-service";

export async function GET() {
  try {
    if (!getFeatureFlags().cadDashboard) {
      return NextResponse.json(
        { ok: false, error: "CAD Dashboard is currently disabled" },
        { status: 503 }
      );
    }
    const actor = await requireServerActor(["CAD_DESIGNER"]);
    const data = await listCadDesignerJobs(actor);
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
    if (!getFeatureFlags().cadDashboard) {
      return NextResponse.json(
        { ok: false, error: "CAD Dashboard is currently disabled" },
        { status: 503 }
      );
    }
    const actor = await requireServerActor(["CAD_DESIGNER"]);
    const body = await req.json();
    const assignment = await performCadDesignerAction(actor, {
      assignmentId: String(body?.assignmentId || ""),
      action: body?.action,
      expectedVersion:
        body?.expectedVersion !== undefined
          ? Number(body.expectedVersion)
          : undefined,
      questionNote: body?.questionNote ? String(body.questionNote) : undefined,
    });
    return NextResponse.json({ ok: true, assignment });
  } catch (err) {
    return handleApiError(err);
  }
}
