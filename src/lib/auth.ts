import crypto from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { ActorContext, UserRole } from "./domain/types";
import { ForbiddenError, UnauthorizedError } from "./domain/errors";

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "am_v2_session";

function getSecretKey(): Uint8Array {
  const secret =
    process.env.AUTH_SESSION_SECRET ||
    "dev-only-am-jewellers-v2-session-secret-key-change-in-prod-2026";
  return new TextEncoder().encode(secret);
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function issueSessionForUser(
  user: {
    id: string;
    organizationId: string;
    role: string;
    email: string;
    name: string;
    customerId: string | null;
    linkedKarigarId: string | null;
  },
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<{ token: string; expiresAt: Date; actor: ActorContext }> {
  const ttlHours = Number(process.env.SESSION_TTL_HOURS || "24");
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
  const rawNonce = crypto.randomBytes(24).toString("hex");

  const jwt = await new SignJWT({
    sub: user.id,
    orgId: user.organizationId,
    role: user.role,
    nonce: rawNonce,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());

  await prisma.userSession.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      tokenHash: hashToken(jwt),
      expiresAt,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  });

  return {
    token: jwt,
    expiresAt,
    actor: {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role as UserRole,
      email: user.email,
      name: user.name,
      customerId: user.customerId ?? null,
      linkedKarigarId: user.linkedKarigarId ?? null,
    },
  };
}

export async function authenticateAndCreateSession(
  emailOrPhone: string,
  password: string,
  meta?: { ipAddress?: string; userAgent?: string }
): Promise<{ token: string; expiresAt: Date; actor: ActorContext }> {
  const raw = emailOrPhone.trim();
  const normalizedEmail = raw.toLowerCase();
  const digitsOnly = raw.replace(/\D/g, "");

  const user = await prisma.user.findFirst({
    where: raw.includes("@")
      ? {
          email: { equals: normalizedEmail, mode: "insensitive" },
          isActive: true,
        }
      : {
          isActive: true,
          OR: [
            { email: { equals: normalizedEmail, mode: "insensitive" } },
            ...(digitsOnly.length >= 6
              ? [{ customer: { phone: { endsWith: digitsOnly.slice(-10) } } }]
              : []),
          ],
        },
    include: { organization: true },
  });

  if (!user) {
    throw new UnauthorizedError("Invalid email/phone or password");
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new UnauthorizedError("Invalid email/phone or password");
  }

  return issueSessionForUser(user, meta);
}

export async function getCurrentActor(): Promise<ActorContext | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.sub || !payload.orgId) return null;

    const tokenHash = hashToken(token);
    const session = await prisma.userSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() < Date.now() ||
      !session.user.isActive
    ) {
      return null;
    }

    return {
      userId: session.user.id,
      organizationId: session.user.organizationId,
      role: session.user.role as UserRole,
      email: session.user.email,
      name: session.user.name,
      customerId: session.user.customerId ?? null,
      linkedKarigarId: session.user.linkedKarigarId ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireServerActor(
  allowedRoles?: UserRole[]
): Promise<ActorContext> {
  const actor = await getCurrentActor();
  if (!actor) {
    throw new UnauthorizedError("Authentication required");
  }
  if (allowedRoles && !allowedRoles.includes(actor.role)) {
    throw new ForbiddenError(
      `Role ${actor.role} does not have permission for this action`
    );
  }
  return actor;
}

export async function revokeCurrentSession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return;
    const tokenHash = hashToken(token);
    await prisma.userSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // ignore
  }
}

