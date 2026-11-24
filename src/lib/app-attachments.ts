import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { ActorContext } from "@/lib/domain/types";
import { isStagingEnvironment } from "@/lib/env-safety";

export const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const ALLOWED_AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
]);

export function resolveAppAttachmentDir(): string {
  const configured =
    process.env.UPLOAD_STORAGE_DIR ||
    (process.env.VERCEL
      ? "/tmp/am-jewellers-uploads"
      : isStagingEnvironment()
      ? "./storage/staging-uploads"
      : "./storage/uploads");
  const base = path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
  return path.join(base, "app-media");
}

function hasCloudinaryConfig(): boolean {
  return (
    Boolean(process.env.CLOUDINARY_CLOUD_NAME?.trim()) &&
    Boolean(process.env.CLOUDINARY_API_KEY?.trim()) &&
    Boolean(process.env.CLOUDINARY_API_SECRET?.trim())
  );
}

async function uploadAppMediaToCloudinary(
  buffer: Buffer,
  mimeType: string,
  publicId: string,
  kind: "IMAGE" | "VOICE_NOTE"
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY!.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET!.trim();

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = "am-jewellers-v2/app-media";
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

  const resourceType = kind === "VOICE_NOTE" ? "video" : "image";
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`,
    { method: "POST", body: form }
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

export function extForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/jpeg":
      return ".jpg";
    case "audio/webm":
      return ".webm";
    case "audio/ogg":
      return ".ogg";
    case "audio/mp4":
      return ".m4a";
    case "audio/mpeg":
    case "audio/mp3":
      return ".mp3";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/aac":
      return ".aac";
    default:
      return ".bin";
  }
}

export async function saveAppAttachmentFile(params: {
  actor: ActorContext;
  file: File;
  kind: "IMAGE" | "VOICE_NOTE";
  scope?: "PUBLIC_CATALOGUE" | "PRIVATE";
  customerId?: string | null;
  requestId?: string | null;
  orderId?: string | null;
}) {
  const mime = (params.file.type || "").split(";")[0].trim().toLowerCase();
  if (params.kind === "IMAGE") {
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      throw new Error("Only JPEG, PNG, WEBP, and GIF images are allowed.");
    }
    if (params.file.size > 8 * 1024 * 1024) {
      throw new Error("Image must be under 8 MB.");
    }
  } else {
    if (!ALLOWED_AUDIO_MIMES.has(mime)) {
      throw new Error("Only WEBM, OGG, M4A, MP3, WAV, or AAC audio files are allowed.");
    }
    if (params.file.size > 15 * 1024 * 1024) {
      throw new Error("Voice recording must be under 15 MB.");
    }
  }

  const randomKey = `${Date.now()}_${crypto.randomBytes(16).toString("hex")}${extForMime(mime)}`;
  const buffer = Buffer.from(await params.file.arrayBuffer());
  let storageKey = randomKey;

  if (hasCloudinaryConfig()) {
    const publicId = randomKey.replace(/\.[^.]+$/, "");
    storageKey = await uploadAppMediaToCloudinary(
      buffer,
      mime,
      publicId,
      params.kind
    );
  } else {
    const dir = resolveAppAttachmentDir();
    await fs.mkdir(dir, { recursive: true });
    const fullPath = path.join(dir, randomKey);
    await fs.writeFile(fullPath, buffer);
  }

  const created = await prisma.appAttachment.create({
    data: {
      organizationId: params.actor.organizationId,
      kind: params.kind,
      originalName: path.basename(params.file.name || `upload${extForMime(mime)}`),
      mimeType: mime,
      sizeBytes: buffer.length,
      storageKey,
      scope: params.scope ?? "PRIVATE",
      ownerUserId: params.actor.userId,
      customerId: params.customerId ?? params.actor.customerId ?? null,
      requestId: params.requestId ?? null,
      orderId: params.orderId ?? null,
    },
  });

  return {
    id: created.id,
    kind: created.kind,
    mimeType: created.mimeType,
    sizeBytes: created.sizeBytes,
    originalName: created.originalName,
    url: `/api/app-attachments/${created.id}`,
  };
}

/**
 * Enforces strict business + role + ownership isolation on attachment downloads.
 */
export async function canActorAccessAttachment(
  actor: ActorContext,
  attachmentId: string
): Promise<{
  allowed: boolean;
  attachment?: {
    id: string;
    mimeType: string;
    storageKey: string;
    originalName: string;
    scope: string;
  };
}> {
  const att = await prisma.appAttachment.findFirst({
    where: {
      id: attachmentId,
      organizationId: actor.organizationId,
    },
  });
  if (!att) return { allowed: false };

  if (actor.role === "OWNER_ADMIN" || actor.role === "OPERATOR") {
    return { allowed: true, attachment: att };
  }

  if (att.scope === "PUBLIC_CATALOGUE") {
    return { allowed: true, attachment: att };
  }

  if (actor.role === "CUSTOMER") {
    const ownsByUser = att.ownerUserId === actor.userId;
    const ownsByCustomer =
      Boolean(actor.customerId) && att.customerId === actor.customerId;
    if (!ownsByUser && !ownsByCustomer) {
      return { allowed: false };
    }
    return { allowed: true, attachment: att };
  }

  if (actor.role === "CAD_DESIGNER") {
    // Designers may ONLY access media explicitly shared on a CAD assignment currently assigned to them
    const assignments = await prisma.orderCadAssignment.findMany({
      where: {
        organizationId: actor.organizationId,
        assignedDesignerId: actor.userId,
        cadRequired: true,
      },
      select: { selectedMediaIdsJson: true },
    });
    for (const a of assignments) {
      try {
        const ids = JSON.parse(a.selectedMediaIdsJson || "[]") as string[];
        if (Array.isArray(ids) && ids.includes(att.id)) {
          return { allowed: true, attachment: att };
        }
      } catch {
        // ignore
      }
    }
    return { allowed: false };
  }

  return { allowed: false };
}
