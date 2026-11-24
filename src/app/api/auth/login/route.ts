import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  authenticateAndCreateSession,
} from "@/lib/auth";
import { sanitizeRedirectPath } from "@/lib/auth-redirect";
import { handleApiError } from "@/lib/api-response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "");
    const password = String(body.password || "");
    const rawRedirect = typeof body.redirect === "string" ? body.redirect : undefined;

    const { token, expiresAt, actor } = await authenticateAndCreateSession(
      email,
      password,
      {
        ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
        userAgent: req.headers.get("user-agent") || undefined,
      }
    );

    const roleFallback =
      actor.role === "CUSTOMER"
        ? "/customer-app"
        : actor.role === "CAD_DESIGNER"
        ? "/cad-dashboard"
        : "/production-register";
    const redirectTo =
      actor.role === "CUSTOMER"
        ? "/customer-app"
        : actor.role === "CAD_DESIGNER"
        ? "/cad-dashboard"
        : sanitizeRedirectPath(rawRedirect, roleFallback);

    const res = NextResponse.json({
      ok: true,
      actor,
      redirectTo,
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

