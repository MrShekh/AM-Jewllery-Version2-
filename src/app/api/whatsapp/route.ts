import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import {
  ensureWhatsAppClient,
  getWhatsAppState,
  sendBillPdfViaWhatsApp,
} from "@/lib/whatsapp-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const state = getWhatsAppState();
    return NextResponse.json({
      ok: true,
      ...state,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const body = await req.json();
    const action = body.action as string;

    if (action === "CONNECT") {
      const state = await ensureWhatsAppClient(false);
      return NextResponse.json({ ok: true, ...state });
    }

    if (action === "RESET") {
      const state = await ensureWhatsAppClient(true);
      return NextResponse.json({ ok: true, ...state });
    }

    if (action === "SEND_BILL") {
      const { phone, customerName, billNumber, pdfBase64 } = body;
      if (!phone || !customerName || !billNumber || !pdfBase64) {
        return NextResponse.json(
          {
            ok: false,
            error: "Missing phone, customerName, billNumber, or pdfBase64",
          },
          { status: 400 }
        );
      }

      const result = await sendBillPdfViaWhatsApp({
        phone,
        customerName,
        billNumber,
        pdfBase64,
      });

      return NextResponse.json({
        ok: true,
        phone: result.phone,
        message: `Bill ${billNumber} PDF sent directly to ${customerName} (${result.phone}) on WhatsApp`,
      });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "WhatsApp action failed",
      },
      { status: 400 }
    );
  }
}
