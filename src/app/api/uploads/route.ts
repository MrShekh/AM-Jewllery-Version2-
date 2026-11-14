import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function resolveUploadDirectory(): string {
  const dir = process.env.UPLOAD_STORAGE_DIR || "./storage/uploads";
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

export async function POST(req: NextRequest) {
  try {
    await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Image file is required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Only JPEG, PNG, WEBP, and GIF images are allowed",
        },
        { status: 400 }
      );
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "File size must be under 8 MB" },
        { status: 400 }
      );
    }

    const ext =
      file.type === "image/png"
        ? ".png"
        : file.type === "image/webp"
        ? ".webp"
        : file.type === "image/gif"
        ? ".gif"
        : ".jpg";

    const safeFileName = `order_${Date.now()}_${crypto
      .randomBytes(6)
      .toString("hex")}${ext}`;

    const uploadDir = resolveUploadDirectory();
    await fs.mkdir(uploadDir, { recursive: true });
    const fullPath = path.join(uploadDir, safeFileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(fullPath, buffer);

    return NextResponse.json({
      ok: true,
      fileName: safeFileName,
      publicUrl: `/api/uploads/${safeFileName}`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
