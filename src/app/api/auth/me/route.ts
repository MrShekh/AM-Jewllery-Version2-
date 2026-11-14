import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";

export async function GET() {
  const actor = await getCurrentActor();
  if (!actor) {
    return NextResponse.json({ ok: false, actor: null, user: null }, { status: 401 });
  }
  return NextResponse.json({ ok: true, actor, user: actor });
}

