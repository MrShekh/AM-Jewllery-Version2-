import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/env-safety";
import {
  bulkImportCatalogueRows,
  ensureDefaultCatalogueCategories,
  queryCatalogueDesigns,
  validateDesignInput,
} from "@/lib/catalogue-service";

export async function GET(req: NextRequest) {
  try {
    if (!getFeatureFlags().catalogue) {
      return NextResponse.json(
        { ok: false, error: "Catalogue module is currently disabled" },
        { status: 503 }
      );
    }
    const actor = await requireServerActor([
      "OWNER_ADMIN",
      "OPERATOR",
      "CUSTOMER",
    ]);
    const sp = req.nextUrl.searchParams;
    const data = await queryCatalogueDesigns(actor, {
      page: Number(sp.get("page") || "1"),
      pageSize: Number(sp.get("pageSize") || "24"),
      search: sp.get("search") || undefined,
      categoryId: sp.get("categoryId") || undefined,
      purityId: sp.get("purityId") || undefined,
      size: sp.get("size") || undefined,
      minWeight: sp.get("minWeight") ? Number(sp.get("minWeight")) : undefined,
      maxWeight: sp.get("maxWeight") ? Number(sp.get("maxWeight")) : undefined,
      status: (sp.get("status") as "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED") || undefined,
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!getFeatureFlags().catalogue) {
      return NextResponse.json(
        { ok: false, error: "Catalogue module is currently disabled" },
        { status: 503 }
      );
    }
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const body = await req.json();
    const action = String(body?.action || "UPSERT_DESIGN");

    if (action === "CREATE_CATEGORY") {
      const name = String(body?.name || "").trim();
      if (!name) {
        return NextResponse.json(
          { ok: false, error: "Category name is required" },
          { status: 400 }
        );
      }
      const code = name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const existing = await ensureDefaultCatalogueCategories(actor.organizationId);
      const created = await prisma.catalogueCategory.upsert({
        where: {
          organizationId_code: {
            organizationId: actor.organizationId,
            code,
          },
        },
        update: { name, isActive: true },
        create: {
          organizationId: actor.organizationId,
          code,
          name,
          sortOrder: existing.length + 1,
        },
      });
      return NextResponse.json({ ok: true, category: created });
    }

    if (action === "BULK_IMPORT") {
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const result = await bulkImportCatalogueRows(actor, rows, {
        commit: Boolean(body?.commit),
        publishImmediately: Boolean(body?.publishImmediately),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "SET_STATUS") {
      const id = String(body?.id || "");
      const status = String(body?.status || "PUBLISHED") as
        | "DRAFT"
        | "PUBLISHED"
        | "ARCHIVED";
      const updated = await prisma.catalogueDesign.updateMany({
        where: { id, organizationId: actor.organizationId },
        data: { status },
      });
      if (updated.count === 0) {
        return NextResponse.json(
          { ok: false, error: "Design not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "PUBLISH_ALL_DRAFTS") {
      const res = await prisma.catalogueDesign.updateMany({
        where: { organizationId: actor.organizationId, status: "DRAFT" },
        data: { status: "PUBLISHED" },
      });
      return NextResponse.json({ ok: true, publishedCount: res.count });
    }

    const id = body?.id ? String(body.id) : null;
    const code = String(body?.code || "").trim().toUpperCase();
    const name = String(body?.name || "").trim();
    const categoryId = String(body?.categoryId || "");
    validateDesignInput({ code, name, categoryId });

    const cat = await prisma.catalogueCategory.findFirst({
      where: { id: categoryId, organizationId: actor.organizationId },
    });
    if (!cat) {
      return NextResponse.json(
        { ok: false, error: "Selected category not found" },
        { status: 400 }
      );
    }

    const photos: string[] = Array.isArray(body?.photos)
      ? body.photos.map(String).filter(Boolean)
      : [];
    const sizes: string[] = Array.isArray(body?.supportedSizes)
      ? body.supportedSizes.map(String).filter(Boolean)
      : [];
    const purityIds: string[] = Array.isArray(body?.supportedPurityIds)
      ? body.supportedPurityIds.map(String).filter(Boolean)
      : [];

    const wMin =
      body?.approxWeightMin !== undefined &&
      String(body.approxWeightMin).trim() !== ""
        ? new Prisma.Decimal(Number(body.approxWeightMin).toFixed(3))
        : null;
    const wMax =
      body?.approxWeightMax !== undefined &&
      String(body.approxWeightMax).trim() !== ""
        ? new Prisma.Decimal(Number(body.approxWeightMax).toFixed(3))
        : wMin;

    const status = (body?.status || "DRAFT") as
      | "DRAFT"
      | "PUBLISHED"
      | "ARCHIVED";

    const design = id
      ? await prisma.catalogueDesign.update({
          where: { id },
          data: {
            code,
            name,
            categoryId: cat.id,
            categoryName: cat.name,
            thumbnailUrl: photos[0] ?? null,
            photosJson: JSON.stringify(photos),
            approxWeightMin: wMin,
            approxWeightMax: wMax,
            supportedSizesJson: JSON.stringify(sizes),
            supportedPurityIdsJson: JSON.stringify(purityIds),
            description: String(body?.description || "").trim() || null,
            status,
          },
        })
      : await prisma.catalogueDesign.create({
          data: {
            organizationId: actor.organizationId,
            code,
            name,
            categoryId: cat.id,
            categoryName: cat.name,
            thumbnailUrl: photos[0] ?? null,
            photosJson: JSON.stringify(photos),
            approxWeightMin: wMin,
            approxWeightMax: wMax,
            supportedSizesJson: JSON.stringify(sizes),
            supportedPurityIdsJson: JSON.stringify(purityIds),
            description: String(body?.description || "").trim() || null,
            status,
            createdById: actor.userId,
          },
        });

    return NextResponse.json({ ok: true, design });
  } catch (err) {
    return handleApiError(err);
  }
}
