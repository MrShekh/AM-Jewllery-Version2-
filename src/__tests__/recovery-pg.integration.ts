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
  const orgId = "org_pg_recovery_test";
  const userId = "usr_pg_recovery_admin";

  // Clean slate in am_jewellers_v2_test
  await prisma.makingDeductionAllocation.deleteMany({ where: { organizationId: orgId } });
  await prisma.recoverySettlement.deleteMany({ where: { organizationId: orgId } });
  await prisma.lossWriteOff.deleteMany({ where: { organizationId: orgId } });
  await prisma.recoveryAllocation.deleteMany({ where: { organizationId: orgId } });
  await prisma.recoveryReceiptLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.recoveryReceipt.deleteMany({ where: { organizationId: orgId } });
  await prisma.processLossRecord.deleteMany({ where: { organizationId: orgId } });
  await prisma.processVisit.deleteMany({ where: { organizationId: orgId } });
  await prisma.orderProcess.deleteMany({ where: { organizationId: orgId } });
  await prisma.order.deleteMany({ where: { organizationId: orgId } });
  await prisma.journalLine.deleteMany({ where: { organizationId: orgId } });
  await prisma.journalTransaction.deleteMany({ where: { organizationId: orgId } });
  await prisma.stockAccount.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.metalMovement.deleteMany({ where: { organizationId: orgId } });
  await prisma.karigarCapability.deleteMany({ where: { organizationId: orgId } });
  await prisma.karigar.deleteMany({ where: { organizationId: orgId } });
  await prisma.customer.deleteMany({ where: { organizationId: orgId } });
  await prisma.purityDefinition.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });

  await prisma.organization.create({
    data: {
      id: orgId,
      code: "PG-REC-TEST",
      name: "PG Recovery Integration Org",
    },
  });
  await prisma.user.create({
    data: {
      id: userId,
      organizationId: orgId,
      email: "pg-admin@test.local",
      name: "PG Test Admin",
      passwordHash: "not-used",
      role: "OWNER_ADMIN",
    },
  });

  const admin: ActorContext = {
    userId,
    organizationId: orgId,
    role: "OWNER_ADMIN",
    email: "pg-admin@test.local",
    name: "PG Test Admin",
  };

  const repo = new PrismaErpRepository(prisma);
  const service = new ErpDomainService(repo);

  const p92 = await service.configurePurity(admin, {
    code: "22K_92",
    displayLabel: "22K (92%)",
    karatLabel: "22KT",
    touchPercent: "92.0000",
  });
  const p999 = await service.configurePurity(admin, {
    code: "24K_999",
    displayLabel: "24K (99.9%)",
    karatLabel: "24KT",
    touchPercent: "99.9000",
  });

  await service.postOpeningBalance(admin, {
    purityId: p92.id,
    physicalWeight: "100.000",
    businessDate: "2026-04-01",
    idempotencyKey: "pg_open_92",
  });

  const customer = await service.createCustomer(admin, {
    customerCode: "PG_CUST_1",
    name: "PG Customer",
  });
  const karigar = await service.createKarigar(admin, {
    karigarCode: "PG_KAR_1",
    name: "PG Karigar",
    capabilities: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
  });

  // Scenario A & B: Filing + Free Polish closed -> eligible while Setting is ongoing
  const { order } = await service.createOrder(admin, {
    bagNumber: "PG-BAG-01",
    orderName: "PG RING",
    customerId: customer.id,
    purityId: p92.id,
    selectedProcesses: ["FILING", "FREE_POLISH", "SETTING"],
  });

  await service.postProcessEntry(admin, {
    orderId: order.id,
    processType: "FILING",
    karigarId: karigar.id,
    grossInWeight: "10.000",
    grossOutWeight: "9.700", // 0.300g @ 92% = 0.2760g fine
    closeProcess: true,
    businessDate: "2026-04-05",
    idempotencyKey: "pg_fil_1",
  });
  await service.postProcessEntry(admin, {
    orderId: order.id,
    processType: "FREE_POLISH",
    karigarId: karigar.id,
    grossInWeight: "9.700",
    grossOutWeight: "9.400", // 0.300g @ 92% = 0.2760g fine
    closeProcess: true,
    businessDate: "2026-04-06",
    idempotencyKey: "pg_fp_1",
  });
  await service.postProcessEntry(admin, {
    orderId: order.id,
    processType: "SETTING",
    karigarId: karigar.id,
    grossInWeight: "9.400",
    grossOutWeight: "0.000",
    closeProcess: false,
    businessDate: "2026-04-06",
    idempotencyKey: "pg_set_open",
  });

  // Receive 0.500g @ 92% = 0.4600g fine (partial of 0.5520g fine)
  const rcp1 = await service.recordRecoveryReceipt(admin, {
    karigarId: karigar.id,
    businessDate: "2026-04-08",
    lines: [{ purityId: p92.id, grossWeight: "0.500", touchPercent: "92" }],
    allocationMode: "OLDEST_FIRST",
    idempotencyKey: "pg_rcp_1",
  });
  assert.equal(rcp1.receipt.recoveredFineWeight.toFixed(4), "0.4600");
  assert.equal(rcp1.receipt.unallocatedFineWeight.toFixed(4), "0.0000");

  // Idempotent retry
  const rcp1Retry = await service.recordRecoveryReceipt(admin, {
    karigarId: karigar.id,
    businessDate: "2026-04-08",
    lines: [{ purityId: p92.id, grossWeight: "0.500", touchPercent: "92" }],
    allocationMode: "OLDEST_FIRST",
    idempotencyKey: "pg_rcp_1",
  });
  assert.equal(rcp1Retry.receipt.id, rcp1.receipt.id);

  // Scenario C & F: Receive 0.100g @ 99.9% = 0.0999g fine -> settles remaining 0.0920g fine, leaving 0.0079g credit
  const rcp2 = await service.recordRecoveryReceipt(admin, {
    karigarId: karigar.id,
    businessDate: "2026-04-09",
    lines: [{ purityId: p999.id, grossWeight: "0.100", touchPercent: "99.9" }],
    allocationMode: "OLDEST_FIRST",
    idempotencyKey: "pg_rcp_2",
  });
  assert.equal(rcp2.receipt.unallocatedFineWeight.toFixed(4), "0.0079");

  const ws = await service.getKarigarRecoveryWorkspace(admin, {
    karigarId: karigar.id,
  });
  const summary = ws.karigarSummaries.find((s) => s.karigarId === karigar.id)!;
  assert.equal(summary.custodyFineWeight, "8.6480"); // 9.400 * 0.92
  assert.equal(summary.eligibleOriginalFine, "0.5520");
  assert.equal(summary.recoveredFine, "0.5520");
  assert.equal(summary.outstandingFine, "0.0000");
  assert.equal(summary.unallocatedCreditFine, "0.0079");

  const recon = await service.getDailyReconciliation(admin);
  assert.equal(recon.totals.discrepancyFine, "0.000");

  // Verify DB rows directly via Prisma
  const dbReceiptCount = await prisma.recoveryReceipt.count({
    where: { organizationId: orgId },
  });
  assert.equal(dbReceiptCount, 2);

  // Scenario D: postRecoverySettlement with making deduction + reverseRecoverySettlement on real PostgreSQL
  await service.postProcessEntry(admin, {
    orderId: order.id,
    processType: "SETTING",
    karigarId: karigar.id,
    grossInWeight: "9.400",
    grossOutWeight: "8.900", // 0.500g loss @ 92% = 0.4600g fine
    closeProcess: true,
    businessDate: "2026-04-10",
    idempotencyKey: "pg_set_close",
  });

  const settlementRes = await service.postRecoverySettlement(admin, {
    karigarId: karigar.id,
    scopeType: "SINGLE_TOUCH",
    scopeTouchPercent: "92",
    businessDate: "2026-04-11",
    lines: [{ purityId: p92.id, grossWeight: "0.200", touchPercent: "92" }],
    makingDeductionInput: "0.100",
    shortageAction: "CARRY_FORWARD",
    notes: "PG making deduction FK test",
    idempotencyKey: "pg_settle_making_1",
  });
  assert.ok(settlementRes.settlement.id);

  const dbMakingDedCount = await prisma.makingDeductionAllocation.count({
    where: { recoverySettlementId: settlementRes.settlement.id },
  });
  assert.equal(dbMakingDedCount, 1);

  await service.reverseRecoverySettlement(admin, {
    settlementId: settlementRes.settlement.id,
    reason: "PG reversal test",
    idempotencyKey: "pg_settle_rev_1",
  });

  const reversedSettlement = await prisma.recoverySettlement.findUnique({
    where: { id: settlementRes.settlement.id },
  });
  assert.equal(reversedSettlement?.status, "REVERSED");

  await prisma.$disconnect();
  console.log("PG_INTEGRATION_TEST_PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
