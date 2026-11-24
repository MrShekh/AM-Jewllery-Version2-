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
  const dir =
    process.env.UPLOAD_STORAGE_DIR ||
    (process.env.VERCEL ? "/tmp/am-jewellers-uploads" : "./storage/uploads");
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

async function uploadToCloudinary(
  buffer: Buffer,
  mimeType: string,
  safeFileName: string
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = process.env.CLOUDINARY_API_KEY!;
  const apiSecret = process.env.CLOUDINARY_API_SECRET!;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = "am-jewellers-v2/orders";
  const publicId = safeFileName.replace(/\.[^.]+$/, "");

  // Cloudinary signed upload signature: sorted params + apiSecret, SHA-1 hex
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(toSign).digest("hex");

  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const form = new FormData();
  form.append("file", dataUri);
  form.append("api_key", apiKey);
  form.append("timestamp", timestamp);
  form.append("folder", folder);
  form.append("public_id", publicId);
  form.append("signature", signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    {
      method: "POST",
      body: form,
    }
  );
  const data = (await res.json()) as {
    secure_url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !data.secure_url) {
    throw new Error(
      data.error?.message || `Cloudinary upload failed (${res.status})`
    );
  }
  return data.secure_url;
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
    const buffer = Buffer.from(await file.arrayBuffer());

    const hasCloudinary =
      Boolean(process.env.CLOUDINARY_CLOUD_NAME?.trim()) &&
      Boolean(process.env.CLOUDINARY_API_KEY?.trim()) &&
      Boolean(process.env.CLOUDINARY_API_SECRET?.trim());

    if (hasCloudinary) {
      const secureUrl = await uploadToCloudinary(
        buffer,
        file.type,
        safeFileName
      );
      return NextResponse.json({
        ok: true,
        storage: "cloudinary",
        fileName: safeFileName,
        publicUrl: secureUrl,
      });
    }

    const uploadDir = resolveUploadDirectory();
    await fs.mkdir(uploadDir, { recursive: true });
    const fullPath = path.join(uploadDir, safeFileName);
    await fs.writeFile(fullPath, buffer);

    return NextResponse.json({
      ok: true,
      storage: "local",
      fileName: safeFileName,
      publicUrl: `/api/uploads/${safeFileName}`,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
