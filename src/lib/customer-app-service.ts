import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/domain/types";
import { createInAppNotification, notifyOrganizationManagers } from "@/lib/app-notifications";

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  AWAITING_APPROVAL: "Order Received",
  MORE_DETAILS_NEEDED: "Info Requested",
  APPROVED: "Approved",
  READY: "Ready",
  DELIVERED: "Delivered",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

export interface SubmitCustomerRequestItemInput {
  sourceType: "CATALOGUE" | "CUSTOM";
  designId?: string | null;
  customTitle?: string;
  quantity: number;
  size?: string;
  purityId?: string;
  customPurityLabel?: string;
  targetWeight?: string | number | null;
  requestedChanges?: string;
  textInstructions?: string;
  requestedItemDate?: string | null;
  voiceAttachmentId?: string | null;
  referenceMediaIds?: string[];
}

export async function submitCustomerOrderRequest(
  actor: ActorContext,
  input: {
    customerId?: string;
    requestedDeliveryDate?: string | null;
    customerNote?: string;
    items: SubmitCustomerRequestItemInput[];
    idempotencyKey: string;
  }
) {
  const customerId =
    actor.role === "CUSTOMER" ? actor.customerId : input.customerId;
  if (!customerId) {
    throw new ForbiddenError("Account is not linked to a verified customer profile");
  }
  if (!input.idempotencyKey?.trim()) {
    throw new ValidationError("idempotencyKey is required");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ValidationError("At least one item is required to submit a request");
  }

  // Idempotency guard: prevent duplicate requests on double-tap/retry
  const existing = await prisma.customerOrderRequest.findUnique({
    where: { idempotencyKey: input.idempotencyKey.trim() },
    include: { items: true },
  });
  if (existing) {
    if (existing.organizationId !== actor.organizationId || existing.customerId !== customerId) {
      throw new ForbiddenError("Duplicate idempotency key mismatch");
    }
    return { request: existing, deduplicated: true };
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: actor.organizationId, isActive: true },
  });
  if (!customer) {
    throw new NotFoundError("Customer record not found");
  }

  const [designs, purities] = await Promise.all([
    prisma.catalogueDesign.findMany({
      where: {
        organizationId: actor.organizationId,
        id: {
          in: input.items
            .map((i) => i.designId)
            .filter((x): x is string => Boolean(x)),
        },
      },
    }),
    prisma.purityDefinition.findMany({
      where: { organizationId: actor.organizationId, isActive: true },
    }),
  ]);
  const designMap = new Map(designs.map((d) => [d.id, d]));
  const purityMap = new Map(purities.map((p) => [p.id, p]));

  const created = await prisma.$transaction(async (tx) => {
    const count = await tx.customerOrderRequest.count({
      where: { organizationId: actor.organizationId },
    });
    const requestNumber = `REQ-${String(count + 1).padStart(4, "0")}`;

    const reqRow = await tx.customerOrderRequest.create({
      data: {
        organizationId: actor.organizationId,
        requestNumber,
        customerId: customer.id,
        submittedByUserId: actor.userId,
        status: "AWAITING_APPROVAL",
        requestedDeliveryDate: input.requestedDeliveryDate
          ? new Date(input.requestedDeliveryDate)
          : null,
        customerNote: input.customerNote?.trim() || null,
        idempotencyKey: input.idempotencyKey.trim(),
      },
    });

    for (const item of input.items) {
      const qty = Math.max(1, Math.floor(Number(item.quantity || 1)));
      const design = item.designId ? designMap.get(item.designId) : null;
      if (item.sourceType === "CATALOGUE" && !design) {
        throw new ValidationError("Selected catalogue design was not found");
      }
      const purity = item.purityId ? purityMap.get(item.purityId) : null;
      if (purity && Number(purity.touchPercent) >= 100) {
        throw new ValidationError("Fine (100%) purity cannot be selected for customer orders");
      }
      const snapshot = design
        ? {
            sourceType: "CATALOGUE",
            designId: design.id,
            code: design.code,
            name: design.name,
            categoryName: design.categoryName,
            thumbnailUrl: design.thumbnailUrl,
            approxWeightMin: design.approxWeightMin
              ? Number(design.approxWeightMin).toFixed(3)
              : null,
            approxWeightMax: design.approxWeightMax
              ? Number(design.approxWeightMax).toFixed(3)
              : null,
            description: design.description,
          }
        : {
            sourceType: "CUSTOM",
            code: "CUSTOM",
            name: (item.customTitle || "Custom Design Request").trim(),
            categoryName: "Custom",
            thumbnailUrl: item.referenceMediaIds?.[0]
              ? `/api/app-attachments/${item.referenceMediaIds[0]}`
              : null,
          };

      const targetWeightDec =
        item.targetWeight !== undefined &&
        item.targetWeight !== null &&
        String(item.targetWeight).trim() !== ""
          ? new Prisma.Decimal(Number(item.targetWeight).toFixed(3))
          : null;

      await tx.customerOrderRequestItem.create({
        data: {
          organizationId: actor.organizationId,
          requestId: reqRow.id,
          sourceType: item.sourceType,
          designId: design?.id ?? null,
          designSnapshotJson: JSON.stringify(snapshot),
          quantity: qty,
          size: item.size?.trim() || null,
          purityId: purity?.id ?? null,
          purityLabelSnapshot:
            (item.customPurityLabel || "").trim() || purity?.displayLabel || null,
          targetWeight: targetWeightDec,
          requestedChanges: item.requestedChanges?.trim() || null,
          textInstructions: item.textInstructions?.trim() || null,
          requestedItemDate: item.requestedItemDate
            ? new Date(item.requestedItemDate)
            : null,
          voiceAttachmentId: item.voiceAttachmentId || null,
          referenceMediaIdsJson: JSON.stringify(
            Array.isArray(item.referenceMediaIds) ? item.referenceMediaIds : []
          ),
        },
      });
    }

    return tx.customerOrderRequest.findUniqueOrThrow({
      where: { id: reqRow.id },
      include: { items: true },
    });
  });

  await notifyOrganizationManagers(actor.organizationId, {
    category: "REQUEST_STATUS",
    title: `New Customer Request ${created.requestNumber}`,
    body: `${customer.name} submitted ${created.items.length} item(s) awaiting approval.`,
    linkUrl: `/app-orders?requestId=${created.id}`,
    metadata: { requestId: created.id, customerId: customer.id },
  });

  return { request: created, deduplicated: false };
}

export async function listCustomerOwnWorkspace(actor: ActorContext) {
  if (actor.role !== "CUSTOMER" || !actor.customerId) {
    throw new ForbiddenError("Customer account required");
  }

  const [customer, requests, bills, notifications, unreadCount] =
    await Promise.all([
      prisma.customer.findFirst({
        where: { id: actor.customerId, organizationId: actor.organizationId },
        select: {
          id: true,
          customerCode: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          gstNumber: true,
          profilePhotoUrl: true,
        },
      }),
      prisma.customerOrderRequest.findMany({
        where: {
          organizationId: actor.organizationId,
          customerId: actor.customerId,
        },
        orderBy: { submittedAt: "desc" },
        take: 50,
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              bagLinks: {
                include: {
                  order: { select: { activeBillId: true } },
                },
              },
            },
          },
          messages: {
            where: { visibility: "CUSTOMER_AND_MANAGER" },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      // Bills are intentionally omitted from the customer app for now
      Promise.resolve([] as Array<{
        id: string;
        billNumber: string;
        billDate: Date;
        totalFineGold: Prisma.Decimal;
        totalCashRupees: Prisma.Decimal;
        settlementStatus: string;
        deliveryStatus: string;
        previewHtml: string | null;
      }>),
      prisma.appNotification.findMany({
        where: {
          organizationId: actor.organizationId,
          recipientUserId: actor.userId,
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.appNotification.count({
        where: {
          organizationId: actor.organizationId,
          recipientUserId: actor.userId,
          isRead: false,
        },
      }),
    ]);

  if (!customer) throw new NotFoundError("Customer profile not found");

  const canViewBills = actor.canViewBills !== false;

  const submittedUserIds = Array.from(
    new Set(requests.map((r) => r.submittedByUserId).filter(Boolean))
  );
  const submitters =
    submittedUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: submittedUserIds } },
          select: { id: true, name: true },
        })
      : [];
  const submitterNameById = new Map(submitters.map((u) => [u.id, u.name]));

  const linkedBillIds = canViewBills
    ? Array.from(
        new Set(
          requests.flatMap((r) =>
            r.items.flatMap((it) =>
              it.bagLinks
                .map((bl) => bl.order?.activeBillId)
                .filter((id): id is string => Boolean(id))
            )
          )
        )
      )
    : [];
  const orderLinkedBills =
    canViewBills && linkedBillIds.length > 0
      ? await prisma.customerBill.findMany({
          where: {
            id: { in: linkedBillIds },
            organizationId: actor.organizationId,
            customerId: actor.customerId,
            status: "POSTED",
          },
          select: {
            id: true,
            billNumber: true,
            billDate: true,
            totalFineGold: true,
            totalCashRupees: true,
            settlementStatus: true,
            previewHtml: true,
          },
        })
      : [];
  const billById = new Map(
    orderLinkedBills.map((b) => [
      b.id,
      {
        id: b.id,
        billNumber: b.billNumber,
        billDate: b.billDate.toISOString().slice(0, 10),
        totalFineGold: Number(b.totalFineGold).toFixed(3),
        totalCashRupees: Number(b.totalCashRupees).toFixed(2),
        settlementStatus: b.settlementStatus,
        previewHtml: b.previewHtml,
      },
    ])
  );

  return {
    customer,
    loggedInUser: {
      id: actor.userId,
      name: actor.name || customer.name,
      email: actor.email || "",
    },
    canViewBills,
    requests: requests.map((r) => {
      const reqBillIds = canViewBills
        ? Array.from(
            new Set(
              r.items.flatMap((it) =>
                it.bagLinks
                  .map((bl) => bl.order?.activeBillId)
                  .filter((id): id is string => Boolean(id))
              )
            )
          )
        : [];
      const linkedBills = canViewBills
        ? reqBillIds
            .map((id) => billById.get(id))
            .filter((b): b is NonNullable<typeof b> => Boolean(b))
        : [];
      return {
        ...r,
        submittedByName: submitterNameById.get(r.submittedByUserId) ?? null,
        statusLabel: CUSTOMER_STATUS_LABELS[r.status] || r.status,
        requestedDeliveryDate: r.requestedDeliveryDate
          ? r.requestedDeliveryDate.toISOString().slice(0, 10)
          : null,
        confirmedDeliveryDate: r.confirmedDeliveryDate
          ? r.confirmedDeliveryDate.toISOString().slice(0, 10)
          : null,
        linkedBills,
        items: r.items.map((it) => ({
          ...it,
          targetWeight: it.targetWeight ? Number(it.targetWeight).toFixed(3) : null,
          designSnapshot: safeJsonObj(it.designSnapshotJson),
          referenceMediaIds: safeJsonArr(it.referenceMediaIdsJson),
        })),
        messages: r.messages.map((m) => ({
          ...m,
          attachmentIds: safeJsonArr(m.attachmentIdsJson),
        })),
      };
    }),
    bills: bills.map((b) => ({
      ...b,
      billDate: b.billDate.toISOString().slice(0, 10),
      totalFineGold: Number(b.totalFineGold).toFixed(3),
      totalCashRupees: Number(b.totalCashRupees).toFixed(2),
    })),
    notifications,
    unreadCount,
  };
}

export async function postCustomerRequestMessage(
  actor: ActorContext,
  input: {
    requestId: string;
    body: string;
    isChangeRequest?: boolean;
    attachmentIds?: string[];
  }
) {
  const text = input.body?.trim();
  if (!text) throw new ValidationError("Message text is required");

  const reqRow = await prisma.customerOrderRequest.findFirst({
    where: {
      id: input.requestId,
      organizationId: actor.organizationId,
    },
    include: { customer: true },
  });
  if (!reqRow) throw new NotFoundError("Order request not found");

  if (actor.role === "CUSTOMER" && reqRow.customerId !== actor.customerId) {
    throw new ForbiddenError("Access denied to another customer's request");
  }

  const isCustomer = actor.role === "CUSTOMER";
  const msgType = isCustomer && input.isChangeRequest ? "CHANGE_REQUEST" : "TEXT";

  const msg = await prisma.$transaction(async (tx) => {
    const created = await tx.customerRequestMessage.create({
      data: {
        organizationId: actor.organizationId,
        requestId: reqRow.id,
        senderUserId: actor.userId,
        senderRole: actor.role,
        senderName: actor.name || (isCustomer ? reqRow.customer.name : "Manager"),
        visibility: "CUSTOMER_AND_MANAGER",
        messageType: msgType,
        body: text,
        attachmentIdsJson: JSON.stringify(
          Array.isArray(input.attachmentIds) ? input.attachmentIds : []
        ),
      },
    });

    if (isCustomer && input.isChangeRequest) {
      await tx.customerOrderRequest.update({
        where: { id: reqRow.id },
        data: { hasPendingChangeReq: true },
      });
    } else if (isCustomer && reqRow.status === "MORE_DETAILS_NEEDED") {
      await tx.customerOrderRequest.update({
        where: { id: reqRow.id },
        data: { status: "AWAITING_APPROVAL" },
      });
    }

    return created;
  });

  if (isCustomer) {
    await notifyOrganizationManagers(actor.organizationId, {
      category: "REQUEST_STATUS",
      title: input.isChangeRequest
        ? `Change Request on ${reqRow.requestNumber}`
        : `Customer Reply on ${reqRow.requestNumber}`,
      body: `${reqRow.customer.name}: ${text.slice(0, 120)}`,
      linkUrl: `/app-orders?requestId=${reqRow.id}`,
      metadata: { requestId: reqRow.id },
    });
  } else {
    const custUsers = await prisma.user.findMany({
      where: {
        organizationId: actor.organizationId,
        customerId: reqRow.customerId,
        role: "CUSTOMER",
        isActive: true,
      },
      select: { id: true },
    });
    await Promise.all(
      custUsers.map((cu) =>
        createInAppNotification({
          organizationId: actor.organizationId,
          recipientUserId: cu.id,
          category: "REQUEST_STATUS",
          title: `Message on ${reqRow.requestNumber}`,
          body: text.slice(0, 140),
          linkUrl: `/customer-app?tab=orders&requestId=${reqRow.id}`,
        })
      )
    );
  }

  return msg;
}

export async function deleteCustomerOrderRequest(
  actor: ActorContext,
  requestId: string
) {
  if (actor.role !== "CUSTOMER" || !actor.customerId) {
    throw new ForbiddenError("Only customers can delete their order requests");
  }
  const reqRow = await prisma.customerOrderRequest.findFirst({
    where: {
      id: requestId,
      organizationId: actor.organizationId,
      customerId: actor.customerId,
    },
    include: {
      customer: { select: { name: true } },
      items: {
        include: {
          bagLinks: { select: { id: true } },
        },
      },
    },
  });
  if (!reqRow) {
    throw new NotFoundError("Order request not found");
  }
  const hasLinkedBags = reqRow.items.some((it) => it.bagLinks.length > 0);
  if (
    hasLinkedBags ||
    (reqRow.status !== "AWAITING_APPROVAL" &&
      reqRow.status !== "MORE_DETAILS_NEEDED" &&
      reqRow.status !== "DECLINED")
  ) {
    throw new ConflictError(
      "Approved or in-production orders cannot be deleted. Please message the manager."
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerRequestMessage.deleteMany({
      where: { requestId: reqRow.id },
    });
    await tx.customerOrderRequestItem.deleteMany({
      where: { requestId: reqRow.id },
    });
    await tx.customerOrderRequest.delete({
      where: { id: reqRow.id },
    });
  });

  await notifyOrganizationManagers(actor.organizationId, {
    category: "REQUEST_STATUS",
    title: `Order Deleted: ${reqRow.requestNumber}`,
    body: `${reqRow.customer.name} deleted order request ${reqRow.requestNumber}.`,
    linkUrl: "/app-orders",
    metadata: { requestId: reqRow.id, requestNumber: reqRow.requestNumber },
  });

  return { deletedId: reqRow.id, requestNumber: reqRow.requestNumber };
}

export async function updateCustomerOwnProfile(
  actor: ActorContext,
  input: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    gstNumber?: string;
    profilePhotoUrl?: string | null;
  }
) {
  if (actor.role !== "CUSTOMER" || !actor.customerId) {
    throw new ForbiddenError("Only customers can update their profile");
  }
  const name = (input.name || "").trim();
  if (!name) {
    throw new ValidationError("Name or Showroom Name is required");
  }

  const data: Record<string, unknown> = {
    name,
    phone: (input.phone || "").trim() || null,
    email: (input.email || "").trim() || null,
    address: (input.address || "").trim() || null,
    gstNumber: (input.gstNumber || "").trim() || null,
  };
  if (input.profilePhotoUrl !== undefined) {
    data.profilePhotoUrl = input.profilePhotoUrl ? String(input.profilePhotoUrl).trim() : null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const cust = await tx.customer.update({
      where: { id: actor.customerId! },
      data,
      select: {
        id: true,
        customerCode: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        gstNumber: true,
        profilePhotoUrl: true,
      },
    });
    await tx.user.update({
      where: { id: actor.userId },
      data: { name },
    });
    return cust;
  });

  return { customer: updated };
}

function safeJsonObj(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeJsonArr(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
