import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ErpDomainService } from "../src/lib/domain/erp-service";
import { PrismaErpRepository } from "../src/lib/domain/prisma-repository";
import { ActorContext } from "../src/lib/domain/types";

const prisma = new PrismaClient();
const repo = new PrismaErpRepository(prisma);
const service = new ErpDomainService(repo);

async function main() {
  const orgCode = process.env.SEED_ORG_CODE || "AM-JEWELLERS";
  const orgName = process.env.SEED_ORG_NAME || "AM Jewellers";
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@amjewellers.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "ChangeMeAdmin!2026";
  const operatorEmail =
    process.env.SEED_OPERATOR_EMAIL || "operator@amjewellers.local";
  const operatorPassword =
    process.env.SEED_OPERATOR_PASSWORD || "ChangeMeOperator!2026";

  console.log(`[Bootstrap] Setting up organization ${orgCode} (${orgName})...`);
  const org = await prisma.organization.upsert({
    where: { code: orgCode },
    update: { name: orgName },
    create: {
      code: orgCode,
      name: orgName,
      timezone: "Asia/Kolkata",
    },
  });

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const operatorHash = await bcrypt.hash(operatorPassword, 10);

  const adminUser = await prisma.user.upsert({
    where: {
      organizationId_email: { organizationId: org.id, email: adminEmail },
    },
    update: {
      name: "Shekh Nayem (Owner/Admin)",
      passwordHash: adminHash,
      role: "OWNER_ADMIN",
      isActive: true,
    },
    create: {
      organizationId: org.id,
      email: adminEmail,
      name: "Shekh Nayem (Owner/Admin)",
      passwordHash: adminHash,
      role: "OWNER_ADMIN",
      isActive: true,
    },
  });

  const operatorUser = await prisma.user.upsert({
    where: {
      organizationId_email: { organizationId: org.id, email: operatorEmail },
    },
    update: {
      name: "Workshop Operator",
      passwordHash: operatorHash,
      role: "OPERATOR",
      isActive: true,
    },
    create: {
      organizationId: org.id,
      email: operatorEmail,
      name: "Workshop Operator",
      passwordHash: operatorHash,
      role: "OPERATOR",
      isActive: true,
    },
  });

  const actor: ActorContext = {
    userId: adminUser.id,
    organizationId: org.id,
    role: "OWNER_ADMIN",
    email: adminUser.email,
    name: adminUser.name,
  };

  // Standard AM Jewellers purity/touch master definitions ONLY (no dummy customers, karigars, orders, or stock)
  const defaultPurities = [
    {
      code: "P_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
      isFineCategory: false,
      sortOrder: 1,
    },
    {
      code: "P_88",
      displayLabel: "88%",
      karatLabel: "88%",
      touchPercent: "88.0000",
      isFineCategory: false,
      sortOrder: 2,
    },
    {
      code: "P_84",
      displayLabel: "84%",
      karatLabel: "84%",
      touchPercent: "84.0000",
      isFineCategory: false,
      sortOrder: 3,
    },
    {
      code: "P_80",
      displayLabel: "80%",
      karatLabel: "80%",
      touchPercent: "80.0000",
      isFineCategory: false,
      sortOrder: 4,
    },
    {
      code: "P_76",
      displayLabel: "76%",
      karatLabel: "76%",
      touchPercent: "76.0000",
      isFineCategory: false,
      sortOrder: 5,
    },
    {
      code: "P_75_5",
      displayLabel: "75.5%",
      karatLabel: "75.5%",
      touchPercent: "75.5000",
      isFineCategory: false,
      sortOrder: 6,
    },
    {
      code: "P_75",
      displayLabel: "18K (75%)",
      karatLabel: "18KT",
      touchPercent: "75.0000",
      isFineCategory: false,
      sortOrder: 7,
    },
    {
      code: "P_59",
      displayLabel: "14K (59%)",
      karatLabel: "14KT",
      touchPercent: "59.0000",
      isFineCategory: false,
      sortOrder: 8,
    },
    {
      code: "P_37_5",
      displayLabel: "9K (37.5%)",
      karatLabel: "9KT",
      touchPercent: "37.5000",
      isFineCategory: false,
      sortOrder: 9,
    },
    {
      code: "FINE_100",
      displayLabel: "Fine (direct)",
      karatLabel: "24KT",
      touchPercent: "100.0000",
      isFineCategory: true,
      sortOrder: 10,
    },
  ];

  const existingPurities = await service.listPurities(actor);
  for (const p of defaultPurities) {
    if (!existingPurities.some((ep) => ep.code === p.code)) {
      await service.configurePurity(actor, p);
      console.log(`[Bootstrap] Configured purity: ${p.displayLabel} (${p.touchPercent}%)`);
    }
  }

  console.log("\n============================================================");
  console.log("AM Jewellers ERP V2 Clean Bootstrap Complete (Zero Dummy Data)!");
  console.log(`Organization : ${org.name} (${org.code})`);
  console.log(`Admin Login  : ${adminUser.email} / ${adminPassword}`);
  console.log(`Operator     : ${operatorUser.email} / ${operatorPassword}`);
  console.log("Customers    : 0 (Clean for real testing)");
  console.log("Karigars     : 0 (Clean for real testing)");
  console.log("Orders       : 0 (Clean for real testing)");
  console.log("Stock        : 0.000 g across all purities");
  console.log("============================================================\n");
}

main()
  .catch((e) => {
    console.error("[Bootstrap Error]", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
