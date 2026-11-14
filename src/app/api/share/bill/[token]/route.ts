import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { erpService } from "@/lib/domain";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const bill = await erpService.getPublicSharedBill(token);
    return NextResponse.json({ ok: true, bill });
  } catch (err) {
    return handleApiError(err);
  }
}

