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
    const redirectTo = sanitizeRedirectPath(body.redirect);

    const { token, expiresAt, actor } = await authenticateAndCreateSession(
      email,
      password,
      {
        ipAddress: req.headers.get("x-forwarded-for") || "127.0.0.1",
        userAgent: req.headers.get("user-agent") || undefined,
      }
    );

    const res = NextResponse.json({
      ok: true,
      actor,
      redirectTo,
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });

    return res;
  } catch (err) {
    return handleApiError(err);
  }
}

