/**
 * Synthetic 30,000-design catalogue benchmark for the isolated staging Neon branch.
 * Strictly guarded by assertStagingDatabaseSafety().
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { assertStagingDatabaseSafety } from "../src/lib/env-safety";
import { ensureDefaultCatalogueCategories } from "../src/lib/catalogue-service";

const prisma = new PrismaClient();

async function main() {
  const safety = assertStagingDatabaseSafety("benchmark-catalogue-30k.ts");
  console.log(`[30K BENCHMARK] Running on ${safety.stagingIdentity} (${safety.targetSummary})`);

  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("Run seed-staging.ts first");

  const cats = await ensureDefaultCatalogueCategories(org.id);
  const existing = await prisma.catalogueDesign.count({
    where: { organizationId: org.id },
  });

  const targetTotal = 30_000;
  if (existing < targetTotal) {
    const batchSize = 2000;
    for (let offset = existing; offset < targetTotal; offset += batchSize) {
      const end = Math.min(targetTotal, offset + batchSize);
      const rows: Prisma.CatalogueDesignCreateManyInput[] = [];
      for (let i = offset; i < end; i++) {
        const cat = cats[i % cats.length];
        rows.push({
          organizationId: org.id,
          code: `BENCH-${String(i + 1).padStart(5, "0")}`,
          name: `Benchmark ${cat.name} #${i + 1}`,
          categoryId: cat.id,
          categoryName: cat.name,
          approxWeightMin: new Prisma.Decimal(((i % 15) + 1.5).toFixed(3)),
          approxWeightMax: new Prisma.Decimal(((i % 15) + 3.5).toFixed(3)),
          supportedSizesJson: JSON.stringify(["12", "14", "16"]),
          status: "PUBLISHED",
        });
      }
      await prisma.catalogueDesign.createMany({ data: rows, skipDuplicates: true });
    }
  }

  const t0 = performance.now();
  const [count, page1] = await Promise.all([
    prisma.catalogueDesign.count({
      where: { organizationId: org.id, status: "PUBLISHED", categoryId: cats[0].id },
    }),
    prisma.catalogueDesign.findMany({
      where: { organizationId: org.id, status: "PUBLISHED", categoryId: cats[0].id },
      orderBy: [{ createdAt: "desc" }, { code: "asc" }],
      skip: 0,
      take: 24,
    }),
  ]);
  const elapsedMs = (performance.now() - t0).toFixed(1);
  console.log(
    `[30K BENCHMARK] Filtered count=${count}, page1=${page1.length} rows in ${elapsedMs} ms`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
