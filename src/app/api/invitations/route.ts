import crypto from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (token) {
      const invite = await prisma.accountInvitation.findUnique({
        where: { token },
        include: {
          customer: { select: { name: true, customerCode: true } },
          organization: { select: { name: true } },
        },
      });
      if (!invite) {
        return NextResponse.json(
          { ok: false, error: "Invitation link is invalid or expired" },
          { status: 404 }
        );
      }
      if (invite.acceptedAt) {
        return NextResponse.json({
          ok: true,
          alreadyAccepted: true,
          invite: {
            email: invite.email,
            displayName: invite.displayName,
            role: invite.role,
            organizationName: invite.organization.name,
            customerName: invite.customer?.name ?? null,
            customerCode: invite.customer?.customerCode ?? null,
            canViewBills: invite.canViewBills,
          },
        });
      }
      if (invite.expiresAt.getTime() < Date.now()) {
        return NextResponse.json(
          { ok: false, error: "Invitation link is invalid or expired" },
          { status: 404 }
        );
      }
      return NextResponse.json({
        ok: true,
        invite: {
          email: invite.email,
          displayName: invite.displayName,
          role: invite.role,
          organizationName: invite.organization.name,
          customerName: invite.customer?.name ?? null,
          customerCode: invite.customer?.customerCode ?? null,
          canViewBills: invite.canViewBills,
        },
      });
    }

    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const [invitations, designers, customers, linkedCustomerUsers] =
      await Promise.all([
        prisma.accountInvitation.findMany({
          where: { organizationId: actor.organizationId },
          orderBy: { createdAt: "desc" },
          take: 250,
          include: {
            customer: { select: { name: true, customerCode: true, phone: true } },
          },
        }),
        prisma.user.findMany({
          where: {
            organizationId: actor.organizationId,
            role: "CAD_DESIGNER",
          },
          select: { id: true, name: true, email: true, isActive: true, linkedKarigarId: true },
          orderBy: { name: "asc" },
        }),
        prisma.customer.findMany({
          where: { organizationId: actor.organizationId, isActive: true },
          select: { id: true, customerCode: true, name: true, phone: true, email: true },
          orderBy: { name: "asc" },
        }),
        prisma.user.findMany({
          where: {
            organizationId: actor.organizationId,
            role: "CUSTOMER",
          },
          select: { id: true, name: true, email: true, customerId: true, isActive: true, canViewBills: true },
        }),
      ]);

    return NextResponse.json({
      ok: true,
      invitations,
      designers,
      customers,
      linkedCustomerUsers,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body?.action || "CREATE_INVITE");

    if (action === "ACCEPT_INVITE") {
      const token = String(body?.token || "").trim();
      const password = String(body?.password || "");
      const displayName = String(body?.displayName || "").trim();
      if (!token || password.length < 6) {
        return NextResponse.json(
          { ok: false, error: "Valid token and password (min 6 chars) required" },
          { status: 400 }
        );
      }
      const invite = await prisma.accountInvitation.findUnique({
        where: { token },
      });
      if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) {
        return NextResponse.json(
          { ok: false, error: "Invitation link is invalid or expired" },
          { status: 400 }
        );
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            organizationId: invite.organizationId,
            email: invite.email.toLowerCase(),
            name: displayName || invite.displayName,
            passwordHash,
            role: invite.role,
            customerId: invite.role === "CUSTOMER" ? invite.customerId : null,
            linkedKarigarId:
              invite.role === "CAD_DESIGNER" ? invite.linkedKarigarId : null,
            canViewBills: invite.role === "CUSTOMER" ? invite.canViewBills : true,
          },
        });
        await tx.accountInvitation.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date(), acceptedUserId: created.id },
        });
        return created;
      });

      return NextResponse.json({
        ok: true,
        email: user.email,
        role: user.role,
      });
    }

    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);

    if (body?.action === "TOGGLE_BILL_ACCESS") {
      const userId = String(body?.userId || "").trim();
      const canViewBills = Boolean(body?.canViewBills);
      if (!userId) {
        return NextResponse.json(
          { ok: false, error: "userId is required" },
          { status: 400 }
        );
      }
      await prisma.user.updateMany({
        where: {
          id: userId,
          organizationId: actor.organizationId,
          role: "CUSTOMER",
        },
        data: { canViewBills },
      });
      return NextResponse.json({ ok: true, userId, canViewBills });
    }

    if (body?.action === "BULK_CREATE_CUSTOMER_INVITES") {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
      const [allCustomers, existingUsers, pendingInvites] = await Promise.all([
        prisma.customer.findMany({
          where: { organizationId: actor.organizationId, isActive: true },
          select: { id: true, customerCode: true, name: true, phone: true, email: true },
        }),
        prisma.user.findMany({
          where: {
            organizationId: actor.organizationId,
            role: "CUSTOMER",
            customerId: { not: null },
          },
          select: { customerId: true },
        }),
        prisma.accountInvitation.findMany({
          where: {
            organizationId: actor.organizationId,
            role: "CUSTOMER",
            acceptedAt: null,
            expiresAt: { gt: now },
            customerId: { not: null },
          },
          select: { customerId: true },
        }),
      ]);

      const linkedIds = new Set(existingUsers.map((u) => u.customerId!));
      const pendingIds = new Set(pendingInvites.map((i) => i.customerId!));

      const toInvite = allCustomers.filter(
        (c) => !linkedIds.has(c.id) && !pendingIds.has(c.id)
      );

      if (toInvite.length > 0) {
        await prisma.accountInvitation.createMany({
          data: toInvite.map((c) => {
            const digits = (c.phone || "").replace(/\D/g, "");
            const fallbackEmail = digits
              ? `${digits}@customer.amjewellers.local`
              : `${c.customerCode.toLowerCase().replace(/[^a-z0-9]/g, "")}@customer.amjewellers.local`;
            return {
              organizationId: actor.organizationId,
              token: crypto.randomBytes(24).toString("hex"),
              role: "CUSTOMER",
              email: (c.email || "").trim().toLowerCase() || fallbackEmail,
              displayName: c.name,
              customerId: c.id,
              expiresAt,
              createdById: actor.userId,
            };
          }),
        });
      }

      return NextResponse.json({
        ok: true,
        createdCount: toInvite.length,
        totalCustomers: allCustomers.length,
      });
    }

    const role = String(body?.role || "") as "CUSTOMER" | "CAD_DESIGNER";
    const email = String(body?.email || "").trim().toLowerCase();
    const displayName = String(body?.displayName || "").trim();
    const customerId = body?.customerId ? String(body.customerId) : null;
    const linkedKarigarId = body?.linkedKarigarId
      ? String(body.linkedKarigarId)
      : null;

    if ((role !== "CUSTOMER" && role !== "CAD_DESIGNER") || !email || !displayName) {
      return NextResponse.json(
        { ok: false, error: "Role, email, and displayName are required" },
        { status: 400 }
      );
    }
    if (role === "CUSTOMER" && !customerId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Customer accounts must be explicitly linked to a verified customerId",
        },
        { status: 400 }
      );
    }

    if (customerId) {
      const cust = await prisma.customer.findFirst({
        where: { id: customerId, organizationId: actor.organizationId },
      });
      if (!cust) {
        return NextResponse.json(
          { ok: false, error: "Customer not found in this business" },
          { status: 404 }
        );
      }
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const canViewBills = role === "CUSTOMER" ? body?.canViewBills !== false : true;

    const invite = await prisma.accountInvitation.create({
      data: {
        organizationId: actor.organizationId,
        token,
        role,
        email,
        displayName,
        customerId,
        linkedKarigarId,
        canViewBills,
        expiresAt,
        createdById: actor.userId,
      },
    });

    return NextResponse.json({
      ok: true,
      invite,
      invitePath: `/invite/${token}`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
