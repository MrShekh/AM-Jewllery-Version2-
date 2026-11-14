import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService } from "@/lib/domain";

export async function GET() {
  try {
    const actor = await requireServerActor();
    const summary = await erpService.getDashboardSummary(actor);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return handleApiError(err);
  }
}

