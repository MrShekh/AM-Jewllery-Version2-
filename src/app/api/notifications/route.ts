import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const actor = await requireServerActor([
      "OWNER_ADMIN",
      "OPERATOR",
      "CUSTOMER",
      "CAD_DESIGNER",
    ]);
    const [notifications, unreadCount] = await Promise.all([
      prisma.appNotification.findMany({
        where: {
          organizationId: actor.organizationId,
          recipientUserId: actor.userId,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.appNotification.count({
        where: {
          organizationId: actor.organizationId,
          recipientUserId: actor.userId,
          isRead: false,
        },
      }),
    ]);

    return NextResponse.json(
      { ok: true, notifications, unreadCount },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor([
      "OWNER_ADMIN",
      "OPERATOR",
      "CUSTOMER",
      "CAD_DESIGNER",
    ]);
    const body = await req.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : null;

    await prisma.appNotification.updateMany({
      where: {
        organizationId: actor.organizationId,
        recipientUserId: actor.userId,
        isRead: false,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
