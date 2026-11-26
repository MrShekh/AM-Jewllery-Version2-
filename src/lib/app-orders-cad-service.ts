import { prisma } from "@/lib/prisma";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/domain/types";
import {
  createInAppNotification,
  notifyOrganizationManagers,
} from "@/lib/app-notifications";

export async function getManagerAppOrdersWorkspace(actor: ActorContext) {
  if (actor.role !== "OWNER_ADMIN" && actor.role !== "OPERATOR") {
    throw new ForbiddenError("Manager access required");
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [requests, cadDesigners, ordersWithCad, appUsers] = await Promise.all([
    prisma.customerOrderRequest.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { submittedAt: "desc" },
      take: 250,
      include: {
        customer: {
          select: { id: true, customerCode: true, name: true, phone: true, profilePhotoUrl: true },
        },
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            bagLinks: {
              where: { isActive: true },
              include: {
                order: { select: { id: true, bagNumber: true, status: true } },
              },
            },
          },
        },
        messages: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.user.findMany({
      where: {
        organizationId: actor.organizationId,
        role: "CAD_DESIGNER",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        linkedKarigarId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.order.findMany({
      where: {
        organizationId: actor.organizationId,
        status: { not: "CANCELLED" },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        bagNumber: true,
        orderName: true,
        status: true,
        size: true,
        targetWeight: true,
        photoUrl: true,
        notes: true,
        customer: { select: { id: true, name: true, customerCode: true } },
        purity: { select: { id: true, displayLabel: true, touchPercent: true } },
        cadAssignment: {
          include: {
            assignedDesigner: { select: { id: true, name: true } },
            versions: { orderBy: { versionNumber: "desc" }, take: 5 },
          },
        },
        requestBagLinks: {
          where: { isActive: true },
          include: {
            requestItem: {
              select: {
                id: true,
                requestId: true,
                voiceAttachmentId: true,
                referenceMediaIdsJson: true,
                textInstructions: true,
                requestedChanges: true,
                request: { select: { requestNumber: true } },
              },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        organizationId: actor.organizationId,
        role: "CUSTOMER",
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        customer: {
          select: {
            id: true,
            customerCode: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            profilePhotoUrl: true,
            _count: { select: { orderRequests: true } },
          },
        },
      },
    }),
  ]);

  const newToday = requests.filter((r) => r.submittedAt >= todayStart).length;
  const awaitingApproval = requests.filter(
    (r) => r.status === "AWAITING_APPROVAL"
  ).length;
  const waitingCustomerInfo = requests.filter(
    (r) => r.status === "MORE_DETAILS_NEEDED"
  ).length;

  const unlinkedApprovedItems: Array<{
    requestId: string;
    requestNumber: string;
    customerId: string;
    customerName: string;
    confirmedDeliveryDate: string | null;
    itemId: string;
    designCode: string;
    designName: string;
    thumbnailUrl: string | null;
    quantity: number;
    linkedBagQuantity: number;
    remainingQuantity: number;
    size: string | null;
    purityId: string | null;
    purityLabel: string | null;
    targetWeight: string | null;
    textInstructions: string | null;
    requestedChanges: string | null;
    voiceAttachmentId: string | null;
    referenceMediaIds: string[];
  }> = [];

  for (const r of requests) {
    if (r.status !== "APPROVED") continue;
    for (const it of r.items) {
      const rem = it.quantity - it.linkedBagQuantity;
      if (rem <= 0) continue;
      const snap = safeObj(it.designSnapshotJson);
      unlinkedApprovedItems.push({
        requestId: r.id,
        requestNumber: r.requestNumber,
        customerId: r.customerId,
        customerName: r.customer.name,
        confirmedDeliveryDate: r.confirmedDeliveryDate
          ? r.confirmedDeliveryDate.toISOString().slice(0, 10)
          : null,
        itemId: it.id,
        designCode: String(snap.code || "CUSTOM"),
        designName: String(snap.name || "Custom Design"),
        thumbnailUrl: snap.thumbnailUrl ? String(snap.thumbnailUrl) : null,
        quantity: it.quantity,
        linkedBagQuantity: it.linkedBagQuantity,
        remainingQuantity: rem,
        size: it.size,
        purityId: it.purityId,
        purityLabel: it.purityLabelSnapshot,
        targetWeight: it.targetWeight ? Number(it.targetWeight).toFixed(3) : null,
        textInstructions: it.textInstructions,
        requestedChanges: it.requestedChanges,
        voiceAttachmentId: it.voiceAttachmentId,
        referenceMediaIds: safeArr(it.referenceMediaIdsJson),
      });
    }
  }

  const approvedAwaitingBag = new Set(
    unlinkedApprovedItems.map((i) => i.requestId)
  ).size;

  const cadUnassigned = ordersWithCad.filter(
    (o) =>
      o.cadAssignment?.cadRequired &&
      (o.cadAssignment.status === "NOT_ASSIGNED" ||
        !o.cadAssignment.assignedDesignerId)
  ).length;
  const cadInProgress = ordersWithCad.filter(
    (o) =>
      o.cadAssignment?.cadRequired &&
      (o.cadAssignment.status === "TO_START" ||
        o.cadAssignment.status === "IN_PROGRESS")
  ).length;
  const cadReady = ordersWithCad.filter(
    (o) => o.cadAssignment?.cadRequired && o.cadAssignment.status === "CAD_READY"
  ).length;
  const cadChangesRequired = ordersWithCad.filter(
    (o) =>
      o.cadAssignment?.cadRequired &&
      o.cadAssignment.status === "CHANGES_REQUIRED"
  ).length;

  return {
    counts: {
      newToday,
      awaitingApproval,
      waitingCustomerInfo,
      approvedAwaitingBag,
      cadUnassigned,
      cadInProgress,
      cadReady,
      cadChangesRequired,
      appCustomers: appUsers.length,
    },
    appCustomers: appUsers.map((u) => ({
      userId: u.id,
      customerId: u.customer?.id || null,
      customerCode: u.customer?.customerCode || "—",
      name: u.customer?.name || u.name,
      phone: u.customer?.phone || null,
      email: u.customer?.email || u.email,
      address: u.customer?.address || null,
      profilePhotoUrl: u.customer?.profilePhotoUrl || null,
      orderCount: u.customer?._count.orderRequests || 0,
      joinedAt: u.createdAt.toISOString(),
    })),
    requests: requests.map((r) => ({
      ...r,
      requestedDeliveryDate: r.requestedDeliveryDate
        ? r.requestedDeliveryDate.toISOString().slice(0, 10)
        : null,
      confirmedDeliveryDate: r.confirmedDeliveryDate
        ? r.confirmedDeliveryDate.toISOString().slice(0, 10)
        : null,
      items: r.items.map((it) => ({
        ...it,
        targetWeight: it.targetWeight ? Number(it.targetWeight).toFixed(3) : null,
        designSnapshot: safeObj(it.designSnapshotJson),
        referenceMediaIds: safeArr(it.referenceMediaIdsJson),
      })),
    })),
    unlinkedApprovedItems,
    cadDesigners,
    bags: ordersWithCad.map((o) => ({
      id: o.id,
      bagNumber: o.bagNumber,
      orderName: o.orderName,
      status: o.status,
      size: o.size,
      targetWeight: o.targetWeight ? Number(o.targetWeight).toFixed(3) : null,
      photoUrl: o.photoUrl,
      notes: o.notes,
      customer: o.customer,
      purity: o.purity,
      cadAssignment: o.cadAssignment,
      linkedMedia: o.requestBagLinks.flatMap((l) => {
        const media: Array<{ id: string; kind: "IMAGE" | "VOICE_NOTE"; label: string }> = [];
        if (l.requestItem.voiceAttachmentId) {
          media.push({
            id: l.requestItem.voiceAttachmentId,
            kind: "VOICE_NOTE",
            label: `${l.requestItem.request.requestNumber} Voice Note`,
          });
        }
        for (const mid of safeArr(l.requestItem.referenceMediaIdsJson)) {
          media.push({
            id: mid,
            kind: "IMAGE",
            label: `${l.requestItem.request.requestNumber} Ref Image`,
          });
        }
        return media;
      }),
    })),
  };
}

export async function reviewCustomerOrderRequest(
  actor: ActorContext,
  input: {
    requestId: string;
    decision:
      | "APPROVE"
      | "ASK_DETAILS"
      | "DECLINE"
      | "MARK_READY"
      | "MARK_DELIVERED"
      | "RESOLVE_CHANGE_REQUEST"
      | "CANCEL_ORDER";
    confirmedDeliveryDate?: string | null;
    note?: string;
  }
) {
  if (actor.role !== "OWNER_ADMIN" && actor.role !== "OPERATOR") {
    throw new ForbiddenError("Only managers can review requests");
  }

  const reqRow = await prisma.customerOrderRequest.findFirst({
    where: { id: input.requestId, organizationId: actor.organizationId },
    include: { customer: true },
  });
  if (!reqRow) throw new NotFoundError("Request not found");

  const note = (input.note || "").trim();

  // Idempotent approval guard: repeated approval does not duplicate notifications or records
  if (input.decision === "APPROVE" && reqRow.status === "APPROVED") {
    return { request: reqRow, deduplicated: true };
  }

  const updated = await prisma.$transaction(async (tx) => {
    let nextStatus = reqRow.status;
    const data: Record<string, unknown> = {};

    if (input.decision === "APPROVE") {
      nextStatus = "APPROVED";
      data.status = "APPROVED";
      data.approvedAt = new Date();
      data.approvedById = actor.userId;
      if (input.confirmedDeliveryDate) {
        data.confirmedDeliveryDate = new Date(input.confirmedDeliveryDate);
      }
      if (note) data.managerVisibleNote = note;
    } else if (input.decision === "ASK_DETAILS") {
      if (!note) throw new ValidationError("Please enter what details are needed");
      nextStatus = "MORE_DETAILS_NEEDED";
      data.status = "MORE_DETAILS_NEEDED";
      data.managerVisibleNote = note;
    } else if (input.decision === "DECLINE") {
      if (!note) throw new ValidationError("Please enter a decline reason");
      nextStatus = "DECLINED";
      data.status = "DECLINED";
      data.declineReason = note;
    } else if (input.decision === "MARK_READY") {
      nextStatus = "READY";
      data.status = "READY";
    } else if (input.decision === "MARK_DELIVERED") {
      nextStatus = "DELIVERED";
      data.status = "DELIVERED";
    } else if (input.decision === "RESOLVE_CHANGE_REQUEST") {
      data.hasPendingChangeReq = false;
      if (note) data.managerVisibleNote = note;
    } else if (input.decision === "CANCEL_ORDER") {
      nextStatus = "CANCELLED";
      data.status = "CANCELLED";
      data.hasPendingChangeReq = false;
      data.declineReason = note || "Cancelled by manager";
    }

    const saved = await tx.customerOrderRequest.update({
      where: { id: reqRow.id },
      data,
    });

    if (note) {
      await tx.customerRequestMessage.create({
        data: {
          organizationId: actor.organizationId,
          requestId: reqRow.id,
          senderUserId: actor.userId,
          senderRole: actor.role,
          senderName: actor.name || "Manager",
          visibility: "CUSTOMER_AND_MANAGER",
          messageType:
            input.decision === "APPROVE"
              ? "APPROVAL_NOTE"
              : input.decision === "ASK_DETAILS"
              ? "DETAILS_REQUEST"
              : "TEXT",
          body: note,
          reviewedByManagerAt: new Date(),
          reviewedByManagerId: actor.userId,
        },
      });
    }

    return { saved, nextStatus };
  });

  // Notify customer users safely (never rolls back committed action)
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
        title: `Order ${reqRow.requestNumber}: ${updated.nextStatus.replace(/_/g, " ")}`,
        body:
          note ||
          (input.decision === "APPROVE"
            ? `Your order request was approved.${
                input.confirmedDeliveryDate
                  ? ` Confirmed delivery: ${input.confirmedDeliveryDate}.`
                  : ""
              }`
            : `Status updated to ${updated.nextStatus}`),
        linkUrl: `/customer-app?tab=orders&requestId=${reqRow.id}`,
      })
    )
  );

  return { request: updated.saved, deduplicated: false };
}

export async function linkRequestItemsToBag(
  actor: ActorContext,
  orderId: string,
  links: Array<{ requestItemId: string; quantity: number }>
) {
  if (actor.role !== "OWNER_ADMIN" && actor.role !== "OPERATOR") {
    throw new ForbiddenError("Manager access required");
  }
  if (!Array.isArray(links) || links.length === 0) return [];

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, organizationId: actor.organizationId },
    });
    if (!order) throw new NotFoundError("Bag / Order not found");

    const createdLinks = [];
    for (const ln of links) {
      const qty = Math.max(1, Math.floor(Number(ln.quantity || 1)));
      const item = await tx.customerOrderRequestItem.findFirst({
        where: { id: ln.requestItemId, organizationId: actor.organizationId },
        include: { request: true },
      });
      if (!item) throw new NotFoundError("Request item not found");
      if (item.request.status !== "APPROVED") {
        throw new ValidationError("Only APPROVED requests can be linked to bags");
      }
      if (item.linkedBagQuantity + qty > item.quantity) {
        throw new ValidationError(
          `Cannot link ${qty} pcs: only ${item.quantity - item.linkedBagQuantity} pcs remaining unlinked`
        );
      }

      const linkRow = await tx.requestBagLink.create({
        data: {
          organizationId: actor.organizationId,
          requestItemId: item.id,
          orderId: order.id,
          linkedQuantity: qty,
          isActive: true,
          createdById: actor.userId,
        },
      });
      await tx.customerOrderRequestItem.update({
        where: { id: item.id },
        data: { linkedBagQuantity: { increment: qty } },
      });
      createdLinks.push(linkRow);
    }
    return createdLinks;
  });
}

export async function unlinkBagFromRequests(
  actor: ActorContext,
  orderId: string,
  reason = "Unlinked / Bag cancelled"
) {
  return prisma.$transaction(async (tx) => {
    const activeLinks = await tx.requestBagLink.findMany({
      where: {
        organizationId: actor.organizationId,
        orderId,
        isActive: true,
      },
    });
    for (const ln of activeLinks) {
      await tx.requestBagLink.update({
        where: { id: ln.id },
        data: {
          isActive: false,
          unlinkedAt: new Date(),
          unlinkedReason: reason,
        },
      });
      await tx.customerOrderRequestItem.update({
        where: { id: ln.requestItemId },
        data: {
          linkedBagQuantity: { decrement: ln.linkedQuantity },
        },
      });
    }
    return activeLinks.length;
  });
}

export async function saveOrSendBagCadSheet(
  actor: ActorContext,
  input: {
    orderId: string;
    cadRequired: boolean;
    assignedDesignerId?: string | null;
    cadDeadline?: string | null;
    confirmedSpecs?: Record<string, unknown>;
    instructions: string;
    selectedMediaIds?: string[];
    sendToDesigner: boolean;
    changeSummary?: string;
  }
) {
  if (actor.role !== "OWNER_ADMIN" && actor.role !== "OPERATOR") {
    throw new ForbiddenError("Manager access required");
  }

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, organizationId: actor.organizationId },
  });
  if (!order) throw new NotFoundError("Order / Bag not found");

  let designer: { id: string; name: string } | null = null;
  if (input.assignedDesignerId) {
    designer = await prisma.user.findFirst({
      where: {
        id: input.assignedDesignerId,
        organizationId: actor.organizationId,
        role: "CAD_DESIGNER",
        isActive: true,
      },
      select: { id: true, name: true },
    });
    if (!designer) {
      throw new ValidationError("Selected CAD designer not found");
    }
  }

  if (input.sendToDesigner && input.cadRequired && !designer) {
    throw new ValidationError("Select a CAD designer before sending");
  }

  const existing = await prisma.orderCadAssignment.findUnique({
    where: { orderId: order.id },
  });

  const previousDesignerId = existing?.assignedDesignerId ?? null;
  const history = existing
    ? (safeArrObj(existing.assignmentHistoryJson) as Array<Record<string, unknown>>)
    : [];

  const nextSpecsJson = JSON.stringify(input.confirmedSpecs ?? {});
  const nextMediaJson = JSON.stringify(input.selectedMediaIds ?? []);
  const nextDeadline = input.cadDeadline ? new Date(input.cadDeadline) : null;

  const isPublishing = input.sendToDesigner && input.cadRequired;
  const nextVersion = isPublishing
    ? (existing?.currentVersion ?? 0) + 1
    : existing?.currentVersion ?? 0;

  let nextStatus = existing?.status ?? "NOT_ASSIGNED";
  if (!input.cadRequired) {
    nextStatus = "NOT_ASSIGNED";
  } else if (isPublishing) {
    if (
      existing?.status === "CAD_READY" &&
      previousDesignerId === designer?.id
    ) {
      nextStatus = "CHANGES_REQUIRED";
    } else if (
      existing?.status === "IN_PROGRESS" &&
      previousDesignerId === designer?.id
    ) {
      nextStatus = "CHANGES_REQUIRED";
    } else {
      nextStatus = "TO_START";
    }
  } else if (!existing) {
    nextStatus = "NOT_ASSIGNED";
  }

  if (isPublishing && designer && previousDesignerId !== designer.id) {
    history.push({
      designerId: designer.id,
      designerName: designer.name,
      assignedAt: new Date().toISOString(),
      assignedById: actor.userId,
      previousDesignerId,
    });
  }

  const saved = await prisma.$transaction(async (tx) => {
    const upserted = await tx.orderCadAssignment.upsert({
      where: { orderId: order.id },
      update: {
        cadRequired: input.cadRequired,
        assignedDesignerId: designer?.id ?? null,
        status: nextStatus,
        cadDeadline: nextDeadline,
        currentVersion: nextVersion,
        confirmedSpecsJson: nextSpecsJson,
        instructions: input.instructions.trim(),
        selectedMediaIdsJson: nextMediaJson,
        assignmentHistoryJson: JSON.stringify(history),
        ...(isPublishing ? { sentToDesignerAt: new Date() } : {}),
      },
      create: {
        organizationId: actor.organizationId,
        orderId: order.id,
        cadRequired: input.cadRequired,
        assignedDesignerId: designer?.id ?? null,
        status: nextStatus,
        cadDeadline: nextDeadline,
        currentVersion: nextVersion,
        confirmedSpecsJson: nextSpecsJson,
        instructions: input.instructions.trim(),
        selectedMediaIdsJson: nextMediaJson,
        assignmentHistoryJson: JSON.stringify(history),
        sentToDesignerAt: isPublishing ? new Date() : null,
      },
    });

    if (isPublishing) {
      await tx.cadInstructionVersion.create({
        data: {
          organizationId: actor.organizationId,
          assignmentId: upserted.id,
          versionNumber: nextVersion,
          assignedDesignerId: designer?.id ?? null,
          cadDeadline: nextDeadline,
          confirmedSpecsJson: nextSpecsJson,
          instructions: input.instructions.trim(),
          selectedMediaIdsJson: nextMediaJson,
          changeSummary: input.changeSummary?.trim() || null,
          publishedById: actor.userId,
        },
      });
    }

    return upserted;
  });

  if (isPublishing && designer) {
    await createInAppNotification({
      organizationId: actor.organizationId,
      recipientUserId: designer.id,
      category: nextVersion > 1 ? "CAD_UPDATE" : "CAD_ASSIGNED",
      title:
        nextVersion > 1
          ? `CAD Instructions Updated — Bag #${order.bagNumber} (v${nextVersion})`
          : `New CAD Job Assigned — Bag #${order.bagNumber}`,
      body: input.instructions.trim().slice(0, 140),
      linkUrl: `/cad-dashboard?orderId=${order.id}`,
      metadata: { orderId: order.id, version: nextVersion },
    });
  }

  return saved;
}

export async function listCadDesignerJobs(actor: ActorContext) {
  if (actor.role !== "CAD_DESIGNER") {
    throw new ForbiddenError("CAD Designer access required");
  }

  const [assignments, notifications, unreadCount] = await Promise.all([
    prisma.orderCadAssignment.findMany({
      where: {
        organizationId: actor.organizationId,
        assignedDesignerId: actor.userId,
        cadRequired: true,
        status: { not: "NOT_ASSIGNED" },
      },
      orderBy: [{ cadDeadline: "asc" }, { updatedAt: "desc" }],
      include: {
        order: {
          select: {
            id: true,
            bagNumber: true,
            orderName: true,
            photoUrl: true,
            size: true,
            targetWeight: true,
            purity: { select: { displayLabel: true, touchPercent: true } },
          },
        },
        versions: { orderBy: { versionNumber: "desc" } },
      },
    }),
    prisma.appNotification.findMany({
      where: {
        organizationId: actor.organizationId,
        recipientUserId: actor.userId,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.appNotification.count({
      where: {
        organizationId: actor.organizationId,
        recipientUserId: actor.userId,
        isRead: false,
      },
    }),
  ]);

  // Never expose customer contact details, full chat, or financial balances to designers
  const mediaIds = Array.from(
    new Set(assignments.flatMap((a) => safeArr(a.selectedMediaIdsJson)))
  );
  const mediaRows =
    mediaIds.length > 0
      ? await prisma.appAttachment.findMany({
          where: {
            organizationId: actor.organizationId,
            id: { in: mediaIds },
          },
          select: { id: true, kind: true, originalName: true, mimeType: true },
        })
      : [];
  const mediaMap = new Map(mediaRows.map((m) => [m.id, m]));

  return {
    jobs: assignments.map((a) => ({
      id: a.id,
      orderId: a.orderId,
      bagNumber: a.order.bagNumber,
      orderName: a.order.orderName,
      photoUrl: a.order.photoUrl,
      size: a.order.size,
      targetWeight: a.order.targetWeight
        ? Number(a.order.targetWeight).toFixed(3)
        : null,
      purityLabel: a.order.purity.displayLabel,
      status: a.status,
      cadDeadline: a.cadDeadline ? a.cadDeadline.toISOString().slice(0, 10) : null,
      currentVersion: a.currentVersion,
      acknowledgedVersion: a.acknowledgedVersion,
      hasNewInstruction: a.currentVersion > a.acknowledgedVersion,
      completedVersion: a.completedVersion,
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      confirmedSpecs: safeObj(a.confirmedSpecsJson),
      instructions: a.instructions,
      designerAskNote: a.designerAskNote,
      selectedMedia: safeArr(a.selectedMediaIdsJson)
        .map((id) => mediaMap.get(id))
        .filter(Boolean),
      versions: a.versions,
    })),
    notifications,
    unreadCount,
  };
}

export async function performCadDesignerAction(
  actor: ActorContext,
  input: {
    assignmentId: string;
    action: "START_WORK" | "ACKNOWLEDGE" | "ASK_MANAGER" | "MARK_CAD_READY";
    expectedVersion?: number;
    questionNote?: string;
  }
) {
  if (actor.role !== "CAD_DESIGNER") {
    throw new ForbiddenError("CAD Designer access required");
  }

  const assignment = await prisma.orderCadAssignment.findFirst({
    where: {
      id: input.assignmentId,
      organizationId: actor.organizationId,
    },
    include: {
      order: { select: { id: true, bagNumber: true } },
    },
  });

  if (!assignment) throw new NotFoundError("CAD assignment not found");
  if (assignment.assignedDesignerId !== actor.userId) {
    throw new ForbiddenError(
      "You are no longer assigned to this CAD task"
    );
  }

  if (input.action === "START_WORK") {
    return prisma.orderCadAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "IN_PROGRESS",
        acknowledgedVersion: assignment.currentVersion,
      },
    });
  }

  if (input.action === "ACKNOWLEDGE") {
    return prisma.orderCadAssignment.update({
      where: { id: assignment.id },
      data: {
        acknowledgedVersion: assignment.currentVersion,
      },
    });
  }

  if (input.action === "ASK_MANAGER") {
    const note = (input.questionNote || "").trim();
    if (!note) throw new ValidationError("Enter a question for the manager");
    const updated = await prisma.orderCadAssignment.update({
      where: { id: assignment.id },
      data: {
        designerAskNote: note,
        acknowledgedVersion: assignment.currentVersion,
      },
    });
    await notifyOrganizationManagers(actor.organizationId, {
      category: "CAD_QUESTION",
      title: `CAD Question — Bag #${assignment.order.bagNumber}`,
      body: `${actor.name || "Designer"}: ${note}`,
      linkUrl: `/app-orders?bag=${assignment.order.bagNumber}`,
      metadata: { orderId: assignment.orderId, assignmentId: assignment.id },
    });
    return updated;
  }

  // MARK_CAD_READY — NO file upload required, strictly enforces current version!
  if (
    input.expectedVersion !== undefined &&
    Number(input.expectedVersion) !== assignment.currentVersion
  ) {
    throw new ConflictError(
      `Cannot mark CAD Ready on outdated instruction v${input.expectedVersion}; manager published v${assignment.currentVersion}. Review & acknowledge the latest instructions first.`
    );
  }
  if (assignment.currentVersion <= 0) {
    throw new ValidationError("No published instruction version exists yet");
  }

  const now = new Date();
  const updated = await prisma.orderCadAssignment.updateMany({
    where: {
      id: assignment.id,
      assignedDesignerId: actor.userId,
      currentVersion: assignment.currentVersion,
    },
    data: {
      status: "CAD_READY",
      acknowledgedVersion: assignment.currentVersion,
      completedVersion: assignment.currentVersion,
      completedById: actor.userId,
      completedByName: actor.name || actor.email || "CAD Designer",
      completedAt: now,
    },
  });
  if (updated.count === 0) {
    throw new ConflictError(
      "Instruction version changed concurrently. Refresh to review the latest version."
    );
  }

  await notifyOrganizationManagers(actor.organizationId, {
    category: "CAD_READY",
    title: `CAD Ready — Bag #${assignment.order.bagNumber}`,
    body: `${actor.name || "Designer"} marked Bag #${assignment.order.bagNumber} CAD Ready (v${assignment.currentVersion}).`,
    linkUrl: `/app-orders?bag=${assignment.order.bagNumber}`,
    metadata: {
      orderId: assignment.orderId,
      assignmentId: assignment.id,
      version: assignment.currentVersion,
    },
  });

  return prisma.orderCadAssignment.findUniqueOrThrow({
    where: { id: assignment.id },
  });
}

function safeObj(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeArr(raw: string): string[] {
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

function safeArrObj(raw: string): unknown[] {
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}
