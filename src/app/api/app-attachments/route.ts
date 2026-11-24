import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { saveAppAttachmentFile } from "@/lib/app-attachments";

export async function POST(req: NextRequest) {
  try {
    const actor = await requireServerActor([
      "OWNER_ADMIN",
      "OPERATOR",
      "CUSTOMER",
    ]);
    const formData = await req.formData();
    const file = formData.get("file");
    const kind =
      String(formData.get("kind") || "IMAGE") === "VOICE_NOTE"
        ? "VOICE_NOTE"
        : "IMAGE";
    const scope =
      String(formData.get("scope") || "PRIVATE") === "PUBLIC_CATALOGUE" &&
      (actor.role === "OWNER_ADMIN" || actor.role === "OPERATOR")
        ? "PUBLIC_CATALOGUE"
        : "PRIVATE";

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "File is required" },
        { status: 400 }
      );
    }

    const saved = await saveAppAttachmentFile({
      actor,
      file,
      kind,
      scope,
      customerId: actor.customerId ?? null,
    });

    return NextResponse.json({ ok: true, attachment: saved });
  } catch (err) {
    return handleApiError(err);
  }
}
