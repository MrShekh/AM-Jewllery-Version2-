import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

function resolveUploadDirectory(): string {
  const dir = process.env.UPLOAD_STORAGE_DIR || "./storage/uploads";
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await context.params;
    const cleanName = path.basename(filename);
    const fullPath = path.join(resolveUploadDirectory(), cleanName);
    const data = await fs.readFile(fullPath);

    const ext = path.extname(cleanName).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
        ? "image/gif"
        : "image/jpeg";

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
