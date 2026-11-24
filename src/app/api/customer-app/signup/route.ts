import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { issueSessionForUser, SESSION_COOKIE_NAME } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { ConflictError, ValidationError } from "@/lib/domain/errors";
import { getFeatureFlags } from "@/lib/env-safety";

export async function POST(req: NextRequest) {
  try {
    if (!getFeatureFlags().customerApp) {
      return NextResponse.json(
        { ok: false, error: "Customer App is currently disabled" },
        { status: 503 }
      );
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();
    const phone = String(body?.phone || "").trim();
    const rawEmail = String(body?.email || "").trim().toLowerCase();
    const address = String(body?.address || "").trim();
    const password = String(body?.password || "");

    const digits = phone.replace(/\D/g, "");
    if (!name) throw new ValidationError("Name or Showroom Name is required");
    if (digits.length < 6) {
      throw new ValidationError("Please enter a valid phone number");
    }
    if (password.length < 6) {
      throw new ValidationError("Password must be at least 6 characters");
    }

    const emailToSave =
      rawEmail || `${digits}@customer.amjewellers.local`;

    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!org) {
      throw new ValidationError("Organization is not configured");
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId: org.id,
        OR: [
          { email: { equals: emailToSave, mode: "insensitive" } },
          { customer: { phone: { endsWith: digits.slice(-10) } } },
        ],
      },
    });
    if (existingUser) {
      throw new ConflictError(
        "An account with this phone or email already exists. Please Sign In."
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await prisma.$transaction(async (tx) => {
      // Link to existing Customer with matching phone if not yet linked, else create new Customer
      let customer = await tx.customer.findFirst({
        where: {
          organizationId: org.id,
          isActive: true,
          phone: { endsWith: digits.slice(-10) },
          appUsers: { none: {} },
        },
      });

      if (!customer) {
        const suffix = `${Date.now().toString().slice(-4)}${Math.floor(
          10 + Math.random() * 90
        )}`;
        customer = await tx.customer.create({
          data: {
            organizationId: org.id,
            customerCode: `APP-${suffix}`,
            name,
            phone,
            email: rawEmail || null,
            address: address || null,
          },
        });
      } else {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            name: customer.name || name,
            email: customer.email || rawEmail || null,
            address: customer.address || address || null,
          },
        });
      }

      return tx.user.create({
        data: {
          organizationId: org.id,
          email: emailToSave,
          name,
          passwordHash,
          role: "CUSTOMER",
          customerId: customer.id,
          isActive: true,
        },
      });
    });

    const { token, expiresAt, actor } = await issueSessionForUser(createdUser, {
      ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
      userAgent: req.headers.get("user-agent") || undefined,
    });

    const res = NextResponse.json({
      ok: true,
      actor,
      redirectTo: "/customer-app",
    });

    const isHttps =
      req.headers.get("x-forwarded-proto") === "https" ||
      req.nextUrl.protocol === "https:" ||
      (process.env.APP_BASE_URL || "").startsWith("https://");
    const cookieSecure =
      process.env.COOKIE_SECURE === "true"
        ? true
        : process.env.COOKIE_SECURE === "false"
        ? false
        : isHttps;

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure,
      path: "/",
      expires: expiresAt,
    });

    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
