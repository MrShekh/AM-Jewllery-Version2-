import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, ValidationError } from "@/lib/domain/errors";
import type { ActorContext } from "@/lib/domain/types";

export const DEFAULT_CATALOGUE_CATEGORIES = [
  { code: "LADIES_RING", name: "Ladies Ring", sortOrder: 1 },
  { code: "GENTS_RING", name: "Gents Ring", sortOrder: 2 },
  { code: "BRACELET", name: "Bracelet", sortOrder: 3 },
  { code: "CHAIN", name: "Chain", sortOrder: 4 },
  { code: "PENDANT", name: "Pendant", sortOrder: 5 },
] as const;

export function formatPurityDisplay(p: {
  karatLabel?: string | null;
  displayLabel?: string | null;
  touchPercent: number | string | Prisma.Decimal;
}): string {
  const touchNum = Number(p.touchPercent);
  const touchStr = Number.isInteger(touchNum)
    ? String(touchNum)
    : touchNum.toFixed(1).replace(/\.0$/, "");
  const k = (p.karatLabel || "").trim();
  // Never emit "92K" — only emit karat label when it is an actual karat (e.g. "22KT" -> "22K / 92%")
  const karatMatch = /^(\d{1,2})\s*k(?:t)?$/i.exec(k);
  if (karatMatch) {
    return `${karatMatch[1]}K / ${touchStr}%`;
  }
  return `${touchStr}%`;
}

export async function ensureDefaultCatalogueCategories(organizationId: string) {
  const existing = await prisma.catalogueCategory.findMany({
    where: { organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  if (existing.length > 0) return existing;

  await prisma.catalogueCategory.createMany({
    data: DEFAULT_CATALOGUE_CATEGORIES.map((c) => ({
      organizationId,
      code: c.code,
      name: c.name,
      sortOrder: c.sortOrder,
    })),
    skipDuplicates: true,
  });

  return prisma.catalogueCategory.findMany({
    where: { organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export interface CatalogueQueryInput {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  purityId?: string;
  size?: string;
  minWeight?: number;
  maxWeight?: number;
  status?: "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
}

export async function queryCatalogueDesigns(
  actor: ActorContext,
  query: CatalogueQueryInput
) {
  const page = Math.max(1, Math.floor(query.page || 1));
  const pageSize = Math.min(60, Math.max(1, Math.floor(query.pageSize || 24)));
  const isManager =
    actor.role === "OWNER_ADMIN" || actor.role === "OPERATOR";

  // Customers only ever see PUBLISHED designs
  const effectiveStatus = isManager
    ? query.status && query.status !== "ALL"
      ? query.status
      : undefined
    : "PUBLISHED";

  const where: Prisma.CatalogueDesignWhereInput = {
    organizationId: actor.organizationId,
    ...(effectiveStatus ? { status: effectiveStatus } : {}),
    ...(query.categoryId && query.categoryId !== "ALL"
      ? { categoryId: query.categoryId }
      : {}),
  };

  const andClauses: Prisma.CatalogueDesignWhereInput[] = [];

  if (query.search && query.search.trim()) {
    const q = query.search.trim();
    andClauses.push({
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { categoryName: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (
    query.minWeight !== undefined &&
    Number.isFinite(query.minWeight) &&
    query.minWeight > 0
  ) {
    andClauses.push({
      OR: [
        { approxWeightMax: { gte: query.minWeight } },
        {
          AND: [
            { approxWeightMax: null },
            { approxWeightMin: { gte: query.minWeight } },
          ],
        },
      ],
    });
  }

  if (
    query.maxWeight !== undefined &&
    Number.isFinite(query.maxWeight) &&
    query.maxWeight > 0
  ) {
    andClauses.push({
      approxWeightMin: { lte: query.maxWeight },
    });
  }

  if (query.purityId && query.purityId !== "ALL") {
    andClauses.push({
      supportedPurityIdsJson: { contains: `"${query.purityId}"` },
    });
  }

  if (query.size && query.size.trim()) {
    andClauses.push({
      supportedSizesJson: { contains: `"${query.size.trim()}"` },
    });
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }

  const [total, items, categories, purities] = await Promise.all([
    prisma.catalogueDesign.count({ where }),
    prisma.catalogueDesign.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { code: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    ensureDefaultCatalogueCategories(actor.organizationId),
    prisma.purityDefinition.findMany({
      where: { organizationId: actor.organizationId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { touchPercent: "desc" }],
    }),
  ]);

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: items.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      categoryId: d.categoryId,
      categoryName: d.categoryName,
      thumbnailUrl: d.thumbnailUrl,
      photos: safeJsonArray(d.photosJson),
      approxWeightMin: d.approxWeightMin ? Number(d.approxWeightMin).toFixed(3) : null,
      approxWeightMax: d.approxWeightMax ? Number(d.approxWeightMax).toFixed(3) : null,
      supportedSizes: safeJsonArray(d.supportedSizesJson),
      supportedPurityIds: safeJsonArray(d.supportedPurityIdsJson),
      description: d.description || "",
      status: d.status,
      updatedAt: d.updatedAt.toISOString(),
    })),
    categories: categories.filter((c) => c.isActive),
    purities: purities.map((p) => ({
      id: p.id,
      code: p.code,
      displayLabel: formatPurityDisplay(p),
      touchPercent: Number(p.touchPercent).toFixed(2),
    })),
  };
}

function safeJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface CsvImportRowResult {
  rowNumber: number;
  code: string;
  name: string;
  valid: boolean;
  errors: string[];
}

export async function bulkImportCatalogueRows(
  actor: ActorContext,
  rows: Array<{
    code?: string;
    name?: string;
    category?: string;
    approxWeightMin?: string | number;
    approxWeightMax?: string | number;
    sizes?: string;
    purities?: string;
    description?: string;
    photoUrls?: string;
    status?: string;
  }>,
  options?: { commit?: boolean; publishImmediately?: boolean }
) {
  if (actor.role !== "OWNER_ADMIN" && actor.role !== "OPERATOR") {
    throw new ForbiddenError("Only managers can import catalogue designs");
  }

  const [categories, purities] = await Promise.all([
    ensureDefaultCatalogueCategories(actor.organizationId),
    prisma.purityDefinition.findMany({
      where: { organizationId: actor.organizationId, isActive: true },
    }),
  ]);

  const categoryByName = new Map(
    categories.map((c) => [c.name.trim().toLowerCase(), c])
  );
  const categoryByCode = new Map(
    categories.map((c) => [c.code.trim().toLowerCase(), c])
  );

  const purityByToken = new Map<string, string>();
  for (const p of purities) {
    purityByToken.set(p.id.toLowerCase(), p.id);
    purityByToken.set(p.code.toLowerCase(), p.id);
    purityByToken.set(p.displayLabel.toLowerCase(), p.id);
    purityByToken.set(formatPurityDisplay(p).toLowerCase(), p.id);
    purityByToken.set(`${Number(p.touchPercent)}%`, p.id);
    purityByToken.set(String(Number(p.touchPercent)), p.id);
  }

  const existingCodes = new Set(
    (
      await prisma.catalogueDesign.findMany({
        where: { organizationId: actor.organizationId },
        select: { code: true },
      })
    ).map((d) => d.code.toUpperCase())
  );

  const seenInBatch = new Set<string>();
  const rowResults: CsvImportRowResult[] = [];
  const validPayloads: Prisma.CatalogueDesignCreateManyInput[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 1;
    const errors: string[] = [];
    const code = String(raw.code || "").trim().toUpperCase();
    const name = String(raw.name || "").trim();
    const catText = String(raw.category || "").trim();

    if (!code) errors.push("Design code is required");
    if (!name) errors.push("Design name is required");
    if (code && seenInBatch.has(code)) {
      errors.push(`Duplicate design code "${code}" inside CSV`);
    }
    if (code && existingCodes.has(code)) {
      errors.push(`Design code "${code}" already exists in catalogue`);
    }

    const matchedCat =
      categoryByName.get(catText.toLowerCase()) ||
      categoryByCode.get(catText.toLowerCase());
    if (!matchedCat) {
      errors.push(`Unknown category "${catText || "(empty)"}"`);
    }

    const wMin =
      raw.approxWeightMin !== undefined && String(raw.approxWeightMin).trim() !== ""
        ? Number(raw.approxWeightMin)
        : null;
    const wMax =
      raw.approxWeightMax !== undefined && String(raw.approxWeightMax).trim() !== ""
        ? Number(raw.approxWeightMax)
        : wMin;

    if (wMin !== null && (!Number.isFinite(wMin) || wMin <= 0)) {
      errors.push("Invalid approxWeightMin");
    }
    if (wMax !== null && (!Number.isFinite(wMax) || wMax <= 0)) {
      errors.push("Invalid approxWeightMax");
    }
    if (wMin !== null && wMax !== null && wMax < wMin) {
      errors.push("approxWeightMax cannot be less than approxWeightMin");
    }

    const purityIds: string[] = [];
    if (raw.purities && String(raw.purities).trim()) {
      for (const tok of String(raw.purities).split(/[|,;]/)) {
        const clean = tok.trim().toLowerCase();
        if (!clean) continue;
        const pid = purityByToken.get(clean);
        if (!pid) {
          errors.push(`Unknown purity "${tok.trim()}"`);
        } else if (!purityIds.includes(pid)) {
          purityIds.push(pid);
        }
      }
    }

    const sizes = String(raw.sizes || "")
      .split(/[|,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const photos = String(raw.photoUrls || "")
      .split(/[|,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (code) seenInBatch.add(code);

    rowResults.push({
      rowNumber,
      code,
      name,
      valid: errors.length === 0,
      errors,
    });

    if (errors.length === 0 && matchedCat) {
      validPayloads.push({
        organizationId: actor.organizationId,
        code,
        name,
        categoryId: matchedCat.id,
        categoryName: matchedCat.name,
        thumbnailUrl: photos[0] ?? null,
        photosJson: JSON.stringify(photos),
        approxWeightMin: wMin !== null ? new Prisma.Decimal(wMin.toFixed(3)) : null,
        approxWeightMax: wMax !== null ? new Prisma.Decimal(wMax.toFixed(3)) : null,
        supportedSizesJson: JSON.stringify(sizes),
        supportedPurityIdsJson: JSON.stringify(purityIds),
        description: String(raw.description || "").trim() || null,
        status: options?.publishImmediately ? "PUBLISHED" : "DRAFT",
        createdById: actor.userId,
      });
    }
  });

  let createdCount = 0;
  if (options?.commit && validPayloads.length > 0) {
    const res = await prisma.catalogueDesign.createMany({
      data: validPayloads,
      skipDuplicates: true,
    });
    createdCount = res.count;
  }

  return {
    totalRows: rows.length,
    validCount: validPayloads.length,
    errorCount: rowResults.filter((r) => !r.valid).length,
    createdCount,
    rows: rowResults,
  };
}

export function validateDesignInput(input: {
  code: string;
  name: string;
  categoryId: string;
}) {
  if (!input.code.trim()) throw new ValidationError("Design code is required");
  if (!input.name.trim()) throw new ValidationError("Design name is required");
  if (!input.categoryId.trim()) throw new ValidationError("Category is required");
}
