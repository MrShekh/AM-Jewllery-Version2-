import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaErpRepository } from "../lib/domain/prisma-repository";
import { ErpDomainService } from "../lib/domain/erp-service";
import { ActorContext } from "../lib/domain/types";

async function main() {
  const dbUrl = process.env.DATABASE_URL || "";
  assert.ok(
    dbUrl.includes("am_jewellers_v2_test"),
    `Safety guard: DATABASE_URL must target am_jewellers_v2_test, got: ${dbUrl}`
  );

  const prisma = new PrismaClient();
  const orgId = "org_pg_billing_test";
  const userId = "usr_pg_billing_admin";

  // Clean slate for billing test org in am_jewellers_v2_test
  await prisma.customerPaymentAllocation.deleteMany({ where: { organizationId: orgId } });
  await prisma.customerGoldReceiptLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.customerGoldReceipt.deleteMany({ where: { organizationId: orgId } });
  await prisma.customerCashReceipt.deleteMany({ where: { organizationId: orgId } });
  await prisma.customerBillLine.deleteMany({ where: { customerBill: { organizationId: orgId } } });
  await prisma.customerBill.deleteMany({ where: { organizationId: orgId } });
  await prisma.billTemplate.deleteMany({ where: { organizationId: orgId } });
  await prisma.billSequence.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.lossWriteOff.deleteMany({ where: { organizationId: orgId } });
  await prisma.recoveryAllocation.deleteMany({ where: { organizationId: orgId } });
  await prisma.recoveryReceiptLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.recoveryReceipt.deleteMany({ where: { organizationId: orgId } });
  await prisma.processLossRecord.deleteMany({ where: { organizationId: orgId } });
  await prisma.metalMovement.deleteMany({ where: { organizationId: orgId } });
  await prisma.processVisit.deleteMany({ where: { organizationId: orgId } });
  await prisma.orderProcess.deleteMany({ where: { organizationId: orgId } });
  await prisma.order.deleteMany({ where: { organizationId: orgId } });
  await prisma.journalLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.journalTransaction.deleteMany({ where: { organizationId: orgId } });
  await prisma.stockAccount.deleteMany({ where: { organizationId: orgId } });
  await prisma.karigarCapability.deleteMany({ where: { organizationId: orgId } });
  await prisma.karigar.deleteMany({ where: { organizationId: orgId } });
  await prisma.customer.deleteMany({ where: { organizationId: orgId } });
  await prisma.purityDefinition.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });

  await prisma.organization.create({
    data: { id: orgId, code: "PG-BILL-TEST", name: "PG Billing Test Org" },
  });
  await prisma.user.create({
    data: {
      id: userId,
      organizationId: orgId,
      email: "pg-bill@test.local",
      name: "PG Billing Admin",
      passwordHash: "not-used",
      role: "OWNER_ADMIN",
    },
  });

  const admin: ActorContext = {
    userId,
    organizationId: orgId,
    role: "OWNER_ADMIN",
    email: "pg-bill@test.local",
    name: "PG Billing Admin",
  };

  const repo = new PrismaErpRepository(prisma);
  const service = new ErpDomainService(repo);

  const p92 = await service.configurePurity(admin, {
    code: "22K_92",
    displayLabel: "22K (92%)",
    karatLabel: "22KT",
    touchPercent: "92.0000",
  });
  const p755 = await service.configurePurity(admin, {
    code: "18K_755",
    displayLabel: "18K (75.5%)",
    karatLabel: "18KT",
    touchPercent: "75.5000",
  });
  const p999 = await service.configurePurity(admin, {
    code: "24K_999",
    displayLabel: "24K (99.9%)",
    karatLabel: "24KT",
    touchPercent: "99.9000",
  });

  await service.postOpeningBalance(admin, {
    purityId: p92.id,
    physicalWeight: "50.000",
    idempotencyKey: "pgb_open_92",
  });
  await service.postOpeningBalance(admin, {
    purityId: p755.id,
    physicalWeight: "50.000",
    idempotencyKey: "pgb_open_755",
  });

  const customer = await service.createCustomer(admin, {
    customerCode: "PGB_C1",
    name: "PG Billing Customer",
  });
  const karigar = await service.createKarigar(admin, {
    karigarCode: "PGB_K1",
    name: "PG Billing Karigar",
    capabilities: ["FILING"],
  });

  // Create & complete Order A (19.200g @ 92%) and Order B (10.000g @ 75.5%)
  const { order: ordA } = await service.createOrder(admin, {
    bagNumber: "PGB-A",
    orderName: "NECKLACE",
    customerId: customer.id,
    purityId: p92.id,
    selectedProcesses: ["FILING"],
  });
  await service.postProcessEntry(admin, {
    orderId: ordA.id,
    processType: "FILING",
    karigarId: karigar.id,
    grossInWeight: "20.000",
    grossOutWeight: "19.200",
    closeProcess: true,
    idempotencyKey: "pgb_a_fil",
  });
  await service.completeOrder(admin, { orderId: ordA.id, idempotencyKey: "pgb_comp_a" });

  const { order: ordB } = await service.createOrder(admin, {
    bagNumber: "PGB-B",
    orderName: "RING",
    customerId: customer.id,
    purityId: p755.id,
    selectedProcesses: ["FILING"],
  });
  await service.postProcessEntry(admin, {
    orderId: ordB.id,
    processType: "FILING",
    karigarId: karigar.id,
    grossInWeight: "10.500",
    grossOutWeight: "10.000",
    closeProcess: true,
    idempotencyKey: "pgb_b_fil",
  });
  await service.completeOrder(admin, { orderId: ordB.id, idempotencyKey: "pgb_comp_b" });

  // Advance 5.000g @ 99.9% = 4.995g fine
  await service.recordCustomerGoldReceipt(admin, {
    customerId: customer.id,
    lines: [{ purityId: p999.id, grossWeight: "5.000", touchPercent: "99.9" }],
    allocationMode: "NONE",
    idempotencyKey: "pgb_adv",
  });

  // Combined bill + advance application
  const posted = await service.postBillAndDeliver(admin, {
    customerId: customer.id,
    applyFineAdvance: true,
    lines: [
      { orderId: ordA.id, billingBasis: "NET_METAL", makingPercentagePoints: "3" },
      { orderId: ordB.id, billingBasis: "NET_METAL", makingPercentagePoints: "2" },
    ],
    idempotencyKey: "pgb_post_ab",
  });
  assert.equal(posted.bill.totalFineGold.toFixed(3), "25.990");
  assert.equal(posted.bill.deliveredFineMetal.toFixed(3), "25.214");
  assert.equal(posted.bill.commercialMakingFine.toFixed(3), "0.776");

  // Cash receipt (does not affect gold)
  await service.recordCustomerCashReceipt(admin, {
    customerId: customer.id,
    amountRupees: "1500.00",
    paymentMode: "UPI",
    allocationMode: "NONE",
    idempotencyKey: "pgb_cash_1",
  });

  const recon = await service.getDailyReconciliation(admin);
  assert.equal(recon.totals.discrepancyFine, "0.000");

  const dbBills = await prisma.customerBill.count({ where: { organizationId: orgId } });
  assert.equal(dbBills, 1);

  await prisma.$disconnect();
  console.log("PG_BILLING_INTEGRATION_TEST_PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
