import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import {
  canActorAccessAttachment,
  resolveAppAttachmentDir,
} from "@/lib/app-attachments";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireServerActor([
      "OWNER_ADMIN",
      "OPERATOR",
      "CUSTOMER",
      "CAD_DESIGNER",
    ]);
    const { id } = await context.params;
    const access = await canActorAccessAttachment(actor, id);
    if (!access.allowed || !access.attachment) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const cleanKey = path.basename(access.attachment.storageKey);
    const fullPath = path.join(resolveAppAttachmentDir(), cleanKey);
    const data = await fs.readFile(fullPath);

    const isPublic = access.attachment.scope === "PUBLIC_CATALOGUE";
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": access.attachment.mimeType,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
        "Cache-Control": isPublic
          ? "private, max-age=3600"
          : "private, no-store, no-cache, must-revalidate",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
