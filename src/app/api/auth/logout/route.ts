import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, revokeCurrentSession } from "@/lib/auth";

export async function POST() {
  await revokeCurrentSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}

