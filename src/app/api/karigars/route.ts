import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { ConflictError, erpService, NotFoundError, ProcessType } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import {
  getKarigarDirectoryStats,
  getKarigarProfileWorkspace,
} from "@/lib/directory-stats";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireServerActor();
    const karigarId = req.nextUrl.searchParams.get("karigarId") || undefined;
    if (karigarId) {
      const profile = await getKarigarProfileWorkspace(actor, karigarId);
      return NextResponse.json({ ok: true, ...profile });
    }
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const [karigars, stats] = await Promise.all([
      erpService.listKarigars(actor, search),
      getKarigarDirectoryStats(actor.organizationId),
    ]);
    return NextResponse.json({
      ok: true,
      karigars,
      summary: stats.summary,
      byKarigar: stats.byKarigar,
    });
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

export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN"]);
    const karigarId = req.nextUrl.searchParams.get("karigarId")?.trim() || "";
    if (!karigarId) {
      throw new NotFoundError("Karigar ID is required");
    }

    const existing = await prisma.karigar.findFirst({
      where: { id: karigarId, organizationId: actor.organizationId },
      select: {
        id: true,
        name: true,
        karigarCode: true,
        _count: {
          select: {
            orderProcesses: true,
            processVisits: true,
            metalMovements: true,
            processLossRecords: true,
            journalTransactions: true,
            journalLines: true,
            recoveryReceipts: true,
            lossWriteOffs: true,
            recoverySettlements: true,
            makingDeductions: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError("Karigar not found");
    }

    const linkedCount =
      existing._count.orderProcesses +
      existing._count.processVisits +
      existing._count.metalMovements +
      existing._count.processLossRecords +
      existing._count.journalTransactions +
      existing._count.journalLines +
      existing._count.recoveryReceipts +
      existing._count.lossWriteOffs +
      existing._count.recoverySettlements +
      existing._count.makingDeductions;

    if (linkedCount > 0) {
      throw new ConflictError(
        `Cannot delete karigar "${existing.name}": they have existing order processes, gold movements, or recovery records. Deactivate them instead.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockAccount.deleteMany({
        where: { organizationId: actor.organizationId, karigarId: existing.id },
      });
      await tx.karigar.delete({ where: { id: existing.id } });
      await tx.auditEvent.create({
        data: {
          organizationId: actor.organizationId,
          actorId: actor.userId,
          entityType: "Karigar",
          entityId: existing.id,
          action: "KARIGAR_DELETED",
          summary: `Deleted karigar ${existing.name} (${existing.karigarCode})`,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      deletedKarigarId: existing.id,
      name: existing.name,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

