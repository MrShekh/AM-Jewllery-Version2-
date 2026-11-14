import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService } from "@/lib/domain";

export async function GET() {
  try {
    const actor = await requireServerActor();
    const purities = await erpService.listPurities(actor);
    return NextResponse.json({
      ok: true,
      purities: purities.map((p) => ({
        ...p,
        touchPercent: p.touchPercent.toFixed(4).replace(/\.?0+$/, ""),
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN"]);
    const body = await req.json();
    const purity = await erpService.configurePurity(actor, {
      code: String(body.code || ""),
      displayLabel: String(body.displayLabel || ""),
      karatLabel: String(body.karatLabel || body.displayLabel || ""),
      touchPercent: String(body.touchPercent || ""),
      isFineCategory: Boolean(body.isFineCategory),
      sortOrder: body.sortOrder ? Number(body.sortOrder) : undefined,
    });
    return NextResponse.json({
      ok: true,
      purity: {
        ...purity,
        touchPercent: purity.touchPercent.toFixed(4).replace(/\.?0+$/, ""),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

