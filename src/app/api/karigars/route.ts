import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService, ProcessType } from "@/lib/domain";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const karigars = await erpService.listKarigars(actor, search);
    return NextResponse.json({ ok: true, karigars });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN"]);
    const body = await req.json();
    if (body.action === "ENSURE_DEFAULTS") {
      const res = await erpService.ensureDefaultKarigars(actor);
      return NextResponse.json({ ok: true, ...res });
    }
    const capabilities: ProcessType[] = Array.isArray(body.capabilities)
      ? body.capabilities
      : [];
    const karigar = await erpService.createKarigar(actor, {
      karigarCode: body.karigarCode,
      name: String(body.name || ""),
      phone: body.phone,
      specializationNotes: body.specializationNotes,
      capabilities,
    });
    return NextResponse.json({ ok: true, karigar });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN"]);
    const body = await req.json();
    const karigar = await erpService.updateKarigar(actor, {
      karigarId: String(body.karigarId || ""),
      name: body.name,
      phone: body.phone,
      specializationNotes: body.specializationNotes,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      capabilities: Array.isArray(body.capabilities)
        ? (body.capabilities as ProcessType[])
        : undefined,
      defaultForProcesses: Array.isArray(body.defaultForProcesses)
        ? (body.defaultForProcesses as ProcessType[])
        : undefined,
    });
    return NextResponse.json({ ok: true, karigar });
  } catch (err) {
    return handleApiError(err);
  }
}

