/**
 * Repeatable synthetic staging fixtures for Customer App, App Orders & CAD Dashboard.
 * Strictly guarded by assertStagingDatabaseSafety() — refuses to run against production.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";
import { assertStagingDatabaseSafety } from "../src/lib/env-safety";
import { ensureDefaultCatalogueCategories } from "../src/lib/catalogue-service";

const prisma = new PrismaClient();

async function main() {
  const safety = assertStagingDatabaseSafety("seed-staging.ts");
  console.log(
    `[STAGING SEED] Target verified: ${safety.stagingIdentity} (${safety.targetSummary})`
  );

  const orgCode = process.env.SEED_ORG_CODE || "AM_STAGING";
  const org = await prisma.organization.upsert({
    where: { code: orgCode },
    update: {},
    create: {
      code: orgCode,
      name: "AM Jewellery (Staging)",
      customerFineReceiptMode: "FINE_EQUIVALENT",
    },
  });

  // Ensure purities exist
  const puritySpecs = [
    { code: "FINE_100", displayLabel: "Fine (direct)", karatLabel: "24KT", touchPercent: 100, isFineCategory: true, sortOrder: 1 },
    { code: "P_92", displayLabel: "22K (92%)", karatLabel: "22KT", touchPercent: 92, isFineCategory: false, sortOrder: 2 },
    { code: "P_75", displayLabel: "18K (75%)", karatLabel: "18KT", touchPercent: 75, isFineCategory: false, sortOrder: 3 },
  ];
  for (const ps of puritySpecs) {
    await prisma.purityDefinition.upsert({
      where: { organizationId_code: { organizationId: org.id, code: ps.code } },
      update: {},
      create: {
        organizationId: org.id,
        code: ps.code,
        displayLabel: ps.displayLabel,
        karatLabel: ps.karatLabel,
        touchPercent: new Prisma.Decimal(ps.touchPercent),
        isFineCategory: ps.isFineCategory,
        sortOrder: ps.sortOrder,
      },
    });
  }
  const purities = await prisma.purityDefinition.findMany({
    where: { organizationId: org.id },
  });
  const p22 = purities.find((p) => p.code === "P_92")!;
  const p18 = purities.find((p) => p.code === "P_75")!;

  const genPass = () => crypto.randomBytes(8).toString("hex");
  const managerPass = process.env.STAGING_MANAGER_PASSWORD || genPass();
  const customerPass = process.env.STAGING_CUSTOMER_PASSWORD || genPass();
  const designerPass = process.env.STAGING_DESIGNER_PASSWORD || genPass();

  const [managerHash, customerHash, designerHash] = await Promise.all([
    bcrypt.hash(managerPass, 10),
    bcrypt.hash(customerPass, 10),
    bcrypt.hash(designerPass, 10),
  ]);

  const manager = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "manager@staging.local" } },
    update: {},
    create: {
      organizationId: org.id,
      email: "manager@staging.local",
      name: "Staging Manager",
      passwordHash: managerHash,
      role: "OWNER_ADMIN",
    },
  });

  // Synthetic Customers A & B
  const custA = await prisma.customer.upsert({
    where: { organizationId_customerCode: { organizationId: org.id, customerCode: "CUST-A" } },
    update: {},
    create: {
      organizationId: org.id,
      customerCode: "CUST-A",
      name: "Synthetic Customer A",
      phone: "9000000001",
    },
  });
  const custB = await prisma.customer.upsert({
    where: { organizationId_customerCode: { organizationId: org.id, customerCode: "CUST-B" } },
    update: {},
    create: {
      organizationId: org.id,
      customerCode: "CUST-B",
      name: "Synthetic Customer B",
      phone: "9000000002",
    },
  });

  const userCustA = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "customera@staging.local" } },
    update: { customerId: custA.id },
    create: {
      organizationId: org.id,
      email: "customera@staging.local",
      name: "Customer A User",
      passwordHash: customerHash,
      role: "CUSTOMER",
      customerId: custA.id,
    },
  });
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "customerb@staging.local" } },
    update: { customerId: custB.id },
    create: {
      organizationId: org.id,
      email: "customerb@staging.local",
      name: "Customer B User",
      passwordHash: customerHash,
      role: "CUSTOMER",
      customerId: custB.id,
    },
  });

  // CAD Designers: Ashid, Josim, Aftab (separate from any karigar record)
  const designers = [];
  for (const name of ["Ashid", "Josim", "Aftab"]) {
    const u = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: org.id,
          email: `${name.toLowerCase()}@staging.local`,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        email: `${name.toLowerCase()}@staging.local`,
        name,
        passwordHash: designerHash,
        role: "CAD_DESIGNER",
      },
    });
    designers.push(u);
  }

  // Catalogue Categories & 12 Realistic Published + 1 Draft Dummy Designs (3 gallery images each)
  const cats = await ensureDefaultCatalogueCategories(org.id);
  const catByCode = new Map(cats.map((c) => [c.code, c]));
  const makeThumb = (label: string, view: string, bg: string, accent: string) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f59e0b"/><stop offset="50%" stop-color="#d97706"/><stop offset="100%" stop-color="#b45309"/></linearGradient></defs><rect width="100%" height="100%" fill="${bg}"/><circle cx="240" cy="155" r="68" fill="none" stroke="url(#g)" stroke-width="14"/><circle cx="240" cy="87" r="14" fill="${accent}"/><text x="240" y="275" font-family="Georgia,serif" font-size="18" font-weight="bold" fill="#1c1917" text-anchor="middle">${label}</text><text x="240" y="302" font-family="Arial,sans-serif" font-size="12" fill="#78716c" text-anchor="middle">${view}</text></svg>`
    )}`;

  const dummyCatalog = [
    { code: "LR-101", name: "Classic Solitaire Ring", cat: "LADIES_RING", min: "3.200", max: "4.500", sizes: ["10", "12", "14", "16"], bg: "#faf7f2", accent: "#e7e5e4" },
    { code: "LR-102", name: "Floral Cocktail Ring", cat: "LADIES_RING", min: "4.800", max: "6.200", sizes: ["12", "14", "16"], bg: "#fdf2f8", accent: "#fbcfe8" },
    { code: "LR-103", name: "Emerald Halo Ring", cat: "LADIES_RING", min: "4.100", max: "5.400", sizes: ["10", "12", "14"], bg: "#ecfdf5", accent: "#34d399" },
    { code: "GR-201", name: "Square Signet Gents Ring", cat: "GENTS_RING", min: "7.500", max: "10.000", sizes: ["18", "20", "22", "24"], bg: "#f1f5f9", accent: "#cbd5e1" },
    { code: "GR-202", name: "Textured Band Ring", cat: "GENTS_RING", min: "5.200", max: "7.000", sizes: ["18", "20", "22"], bg: "#eff6ff", accent: "#bfdbfe" },
    { code: "BR-301", name: "Italian Box Bracelet", cat: "BRACELET", min: "11.000", max: "15.000", sizes: ["6.5 in", "7.0 in", "7.5 in"], bg: "#f0fdf4", accent: "#bbf7d0" },
    { code: "BR-302", name: "Tennis AD Bracelet", cat: "BRACELET", min: "13.500", max: "18.000", sizes: ["6.5 in", "7.0 in"], bg: "#faf5ff", accent: "#e9d5ff" },
    { code: "CH-401", name: "Rope Twist Chain", cat: "CHAIN", min: "8.000", max: "14.000", sizes: ["18 in", "20 in", "22 in"], bg: "#fff7ed", accent: "#fed7aa" },
    { code: "CH-402", name: "Box Link Daily Chain", cat: "CHAIN", min: "6.000", max: "10.000", sizes: ["16 in", "18 in", "20 in"], bg: "#f0f9ff", accent: "#bae6fd" },
    { code: "CH-403", name: "Heritage Temple Necklace", cat: "CHAIN", min: "18.000", max: "24.000", sizes: ["18 in", "20 in"], bg: "#fefce8", accent: "#fde047" },
    { code: "PD-501", name: "Lotus Temple Pendant", cat: "PENDANT", min: "4.000", max: "6.500", sizes: ["Standard"], bg: "#fefce8", accent: "#fef08a" },
    { code: "PD-502", name: "Heart Halo Pendant", cat: "PENDANT", min: "2.500", max: "3.800", sizes: ["Standard"], bg: "#fff1f2", accent: "#fecdd3" },
  ];

  let pubDesign: { id: string; code: string; name: string } | null = null;
  for (const item of dummyCatalog) {
    const cat = catByCode.get(item.cat) || cats[0];
    const p1 = makeThumb(item.name, "Front Studio View", item.bg, item.accent);
    const p2 = makeThumb(item.name, "Side Profile View", "#f5f5f4", item.accent);
    const p3 = makeThumb(item.name, "Close-Up Detail View", "#fffbeb", item.accent);
    const created = await prisma.catalogueDesign.upsert({
      where: { organizationId_code: { organizationId: org.id, code: item.code } },
      update: {
        thumbnailUrl: p1,
        photosJson: JSON.stringify([p1, p2, p3]),
      },
      create: {
        organizationId: org.id,
        code: item.code,
        name: item.name,
        categoryId: cat.id,
        categoryName: cat.name,
        thumbnailUrl: p1,
        photosJson: JSON.stringify([p1, p2, p3]),
        approxWeightMin: new Prisma.Decimal(item.min),
        approxWeightMax: new Prisma.Decimal(item.max),
        supportedSizesJson: JSON.stringify(item.sizes),
        supportedPurityIdsJson: JSON.stringify([p22.id, p18.id]),
        description: `Crafted in ${cat.name} style (${item.min}g–${item.max}g approx). Available in 22K / 92% and 18K / 75%.`,
        status: "PUBLISHED",
        createdById: manager.id,
      },
    });
    if (!pubDesign) pubDesign = created;
  }

  const ringCat = cats[0];
  await prisma.catalogueDesign.upsert({
    where: { organizationId_code: { organizationId: org.id, code: "LR-STG-DRAFT" } },
    update: {},
    create: {
      organizationId: org.id,
      code: "LR-STG-DRAFT",
      name: "Draft Halo Ring",
      categoryId: ringCat.id,
      categoryName: ringCat.name,
      status: "DRAFT",
      createdById: manager.id,
    },
  });

  // Requests: awaiting approval, needing details, approved awaiting bag
  const reqAwait = await prisma.customerOrderRequest.upsert({
    where: { idempotencyKey: "stg_req_await_1" },
    update: {},
    create: {
      organizationId: org.id,
      requestNumber: "REQ-0001",
      customerId: custA.id,
      submittedByUserId: userCustA.id,
      status: "AWAITING_APPROVAL",
      idempotencyKey: "stg_req_await_1",
      items: {
        create: {
          organizationId: org.id,
          sourceType: "CATALOGUE",
          designId: pubDesign!.id,
          designSnapshotJson: JSON.stringify({ code: pubDesign!.code, name: pubDesign!.name }),
          quantity: 1,
          size: "14",
          purityId: p22.id,
          purityLabelSnapshot: "22K (92%)",
          targetWeight: new Prisma.Decimal("3.800"),
        },
      },
    },
  });

  await prisma.customerOrderRequest.upsert({
    where: { idempotencyKey: "stg_req_details_2" },
    update: {},
    create: {
      organizationId: org.id,
      requestNumber: "REQ-0002",
      customerId: custA.id,
      submittedByUserId: userCustA.id,
      status: "MORE_DETAILS_NEEDED",
      managerVisibleNote: "Please confirm ring size.",
      idempotencyKey: "stg_req_details_2",
    },
  });

  await prisma.customerOrderRequest.upsert({
    where: { idempotencyKey: "stg_req_approved_3" },
    update: {},
    create: {
      organizationId: org.id,
      requestNumber: "REQ-0003",
      customerId: custA.id,
      submittedByUserId: userCustA.id,
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: manager.id,
      idempotencyKey: "stg_req_approved_3",
      items: {
        create: {
          organizationId: org.id,
          sourceType: "CATALOGUE",
          designId: pubDesign!.id,
          designSnapshotJson: JSON.stringify({ code: pubDesign!.code, name: pubDesign!.name }),
          quantity: 2,
          size: "16",
          purityId: p22.id,
          purityLabelSnapshot: "22K (92%)",
          targetWeight: new Prisma.Decimal("4.200"),
        },
      },
    },
  });

  // Legacy-style bag (no app link) + CAD task states
  const legacyOrder = await prisma.order.upsert({
    where: { organizationId_bagNumber: { organizationId: org.id, bagNumber: "STG-101" } },
    update: {},
    create: {
      organizationId: org.id,
      bagNumber: "STG-101",
      customerId: custA.id,
      orderName: "Legacy Walk-in Ring",
      purityId: p22.id,
      touchSnapshot: p22.touchPercent,
      orderDate: new Date(),
      createdById: manager.id,
    },
  });

  const cadStatuses = [
    { bag: "STG-102", status: "NOT_ASSIGNED" as const, designer: null },
    { bag: "STG-103", status: "TO_START" as const, designer: designers[0].id },
    { bag: "STG-104", status: "IN_PROGRESS" as const, designer: designers[1].id },
    { bag: "STG-105", status: "CHANGES_REQUIRED" as const, designer: designers[2].id },
    { bag: "STG-106", status: "CAD_READY" as const, designer: designers[0].id },
  ];
  for (const cs of cadStatuses) {
    const ord = await prisma.order.upsert({
      where: { organizationId_bagNumber: { organizationId: org.id, bagNumber: cs.bag } },
      update: {},
      create: {
        organizationId: org.id,
        bagNumber: cs.bag,
        customerId: custA.id,
        orderName: `Staging CAD Bag ${cs.bag}`,
        purityId: p22.id,
        touchSnapshot: p22.touchPercent,
        orderDate: new Date(),
        createdById: manager.id,
      },
    });
    await prisma.orderCadAssignment.upsert({
      where: { orderId: ord.id },
      update: {},
      create: {
        organizationId: org.id,
        orderId: ord.id,
        cadRequired: true,
        assignedDesignerId: cs.designer,
        status: cs.status,
        currentVersion: cs.designer ? 1 : 0,
        instructions: `Synthetic CAD instructions for ${cs.bag}`,
      },
    });
  }

  console.log("[STAGING SEED] Completed successfully.", {
    orgCode: org.code,
    legacyBag: legacyOrder.bagNumber,
    sampleRequest: reqAwait.requestNumber,
    generatedCredentialsSetViaEnv: Boolean(
      process.env.STAGING_MANAGER_PASSWORD &&
        process.env.STAGING_CUSTOMER_PASSWORD &&
        process.env.STAGING_DESIGNER_PASSWORD
    ),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
