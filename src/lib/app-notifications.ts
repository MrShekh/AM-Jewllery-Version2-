import { prisma } from "@/lib/prisma";
import { isExternalNotificationsDisabled } from "@/lib/env-safety";

export interface CreateNotificationInput {
  organizationId: string;
  recipientUserId: string;
  category:
    | "REQUEST_STATUS"
    | "CAD_ASSIGNED"
    | "CAD_UPDATE"
    | "CAD_READY"
    | "CAD_QUESTION"
    | "MANAGER_ALERT";
  title: string;
  body: string;
  linkUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists an in-app notification safely.
 * Notification failures are swallowed and logged so they never roll back
 * a committed order approval, CAD assignment, or CAD Ready action.
 */
export async function createInAppNotification(
  input: CreateNotificationInput
): Promise<{ ok: boolean; id?: string }> {
  try {
    const channel = isExternalNotificationsDisabled() ? "TEST_SINK" : "IN_APP";
    const created = await prisma.appNotification.create({
      data: {
        organizationId: input.organizationId,
        recipientUserId: input.recipientUserId,
        category: input.category,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl ?? null,
        deliveryChannel: channel,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
    return { ok: true, id: created.id };
  } catch (err) {
    console.error("[AppNotification] Non-fatal delivery error:", err);
    return { ok: false };
  }
}

export async function notifyOrganizationManagers(
  organizationId: string,
  input: Omit<CreateNotificationInput, "organizationId" | "recipientUserId">
): Promise<void> {
  try {
    const managers = await prisma.user.findMany({
      where: {
        organizationId,
        role: { in: ["OWNER_ADMIN", "OPERATOR"] },
        isActive: true,
      },
      select: { id: true },
    });
    await Promise.all(
      managers.map((m) =>
        createInAppNotification({
          ...input,
          organizationId,
          recipientUserId: m.id,
        })
      )
    );
  } catch (err) {
    console.error("[AppNotification] Non-fatal manager notify error:", err);
  }
}
