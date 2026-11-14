import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ErpDomainService } from "../lib/domain/erp-service";
import { InMemoryTransactionalRepository } from "../lib/domain/repository";
import { ActorContext } from "../lib/domain/types";

function createTestEnv() {
  const repo = new InMemoryTransactionalRepository();
  const service = new ErpDomainService(repo);
  const admin: ActorContext = {
    userId: "usr_admin",
    organizationId: "org_1",
    role: "OWNER_ADMIN",
    email: "admin@amjewellers.local",
    name: "Owner Admin",
  };
  return { repo, service, admin };
}

describe("Simplified Operational Workflows Acceptance Suite (A-G)", () => {
  it("A, B & C. Separate Filing IN (10g) -> Add Gold (+5g) -> Later Filing OUT (14.7g) = 0.3g loss", async () => {
    const { service, admin } = createTestEnv();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });

    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "100.000",
      businessDate: "2026-11-01",
      reason: "Opening 22K",
      idempotencyKey: "open_92",
    });

    const customer = await service.createCustomer(admin, {
      name: "Mehta Jewellers",
    });
    const karigar = await service.createKarigar(admin, {
      karigarCode: "KAR-01",
      name: "Ramesh Karigar",
      capabilities: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
    });

    const { order } = await service.createOrder(admin, {
      bagNumber: "1001",
      customerId: customer.id,
      purityId: p92.id,
      orderName: "Ring",
      orderDate: "2026-11-01",
      selectedProcesses: ["FILING", "SETTING", "FINAL_POLISH"],
    });

    // A. Give Work (Filing IN 10g without OUT)
    const giveFiling = await service.giveWorkToProcess(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      businessDate: "2026-11-01",
      notes: "Initial work",
      idempotencyKey: "give_filing_1",
    });
    expect(giveFiling.process.status).toBe("IN_PROGRESS");
    expect(Number(giveFiling.process.latestGrossInWeight)).toBeCloseTo(10, 3);

    let recon = await service.getDailyReconciliation(admin);
    const p92Row1 = recon.byPurity.find((r) => r.purityId === p92.id)!;
    expect(Number(p92Row1.adminPhysicalWeight)).toBeCloseTo(90, 3);
    expect(Number(recon.totals.karigarCustodyFine)).toBeCloseTo(9.2, 3);
    expect(Number(recon.totals.totalProcessLossFine)).toBeCloseTo(0, 3);

    let recWs = await service.getKarigarRecoveryWorkspace(admin, {});
    expect(recWs.eligibleLosses.length).toBe(0);

    // B. Edit Filing IN -> Add 5g
    const addGold = await service.addFilingGoldIssue(admin, {
      orderId: order.id,
      additionalWeight: "5.000",
      karigarId: karigar.id,
      businessDate: "2026-11-02",
      notes: "Extra wire",
      idempotencyKey: "add_filing_1",
    });
    expect(Number(addGold.cumulativeFilingIn)).toBeCloseTo(15, 3);

    recon = await service.getDailyReconciliation(admin);
    const p92Row2 = recon.byPurity.find((r) => r.purityId === p92.id)!;
    expect(Number(p92Row2.adminPhysicalWeight)).toBeCloseTo(85, 3);
    expect(Number(recon.totals.karigarCustodyFine)).toBeCloseTo(13.8, 3);

    // C. Receive Work later (Filing OUT 14.700g)
    const filingOut = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "15.000",
      grossOutWeight: "14.700",
      closeProcess: true,
      businessDate: "2026-11-03",
      idempotencyKey: "close_filing_1",
    });
    expect(Number(filingOut.visit.rawLossWeight)).toBeCloseTo(0.3, 3);
    expect(Number(filingOut.visit.fineLossWeight)).toBeCloseTo(0.276, 3);

    recWs = await service.getKarigarRecoveryWorkspace(admin, {});
    expect(recWs.eligibleLosses.length).toBe(1);
    expect(Number(recWs.eligibleLosses[0].originalFineLoss)).toBeCloseTo(0.276, 3);
  });

  it("D & E. Setting open entry with AD+KL stones (10g + 0.5g AD + 1g KL = 11.5g total IN) -> later OUT 11.2g -> carried stones preserved in Final Polish", async () => {
    const { service, admin } = createTestEnv();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "50.000",
      businessDate: "2026-11-01",
      reason: "Opening",
      idempotencyKey: "open_set",
    });

    const customer = await service.createCustomer(admin, { name: "Kiran" });
    const karigar = await service.createKarigar(admin, {
      karigarCode: "KAR-02",
      name: "Suresh",
      capabilities: ["FILING", "SETTING", "FINAL_POLISH"],
    });

    const { order } = await service.createOrder(admin, {
      bagNumber: "1002",
      customerId: customer.id,
      purityId: p92.id,
      orderName: "Bangle",
      orderDate: "2026-11-01",
      selectedProcesses: ["FILING", "SETTING", "FINAL_POLISH"],
    });

    // Close Filing with 10.000g OUT
    await service.giveWorkToProcess(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.200",
      businessDate: "2026-11-01",
      idempotencyKey: "f_in_2",
    });
    await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.200",
      grossOutWeight: "10.000",
      closeProcess: true,
      businessDate: "2026-11-01",
      idempotencyKey: "f_out_2",
    });

    // D. Give Work to Setting with AD 0.5g + KL 1.0g while open
    const giveSet = await service.giveWorkToProcess(admin, {
      orderId: order.id,
      processType: "SETTING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      stoneComponents: [
        { componentType: "AD", direction: "ADDED", pieces: 5, weightGrams: "0.500" },
        { componentType: "KL", direction: "ADDED", pieces: 2, weightGrams: "1.000" },
      ],
      businessDate: "2026-11-02",
      idempotencyKey: "s_in_2",
    });
    expect(Number(giveSet.process.addedStoneWeight)).toBeCloseTo(1.5, 3);

    // Admin stock unchanged by stones (still 50 - 10.2 = 39.8g)
    const reconAfterStones = await service.getDailyReconciliation(admin);
    const p92Row = reconAfterStones.byPurity.find((r) => r.purityId === p92.id)!;
    expect(Number(p92Row.adminPhysicalWeight)).toBeCloseTo(39.8, 3);

    // Later Setting OUT 11.200g (1.5g stones + 9.7g gold -> 0.3g gold loss)
    const setOut = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "SETTING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "11.200",
      closeProcess: true,
      businessDate: "2026-11-03",
      idempotencyKey: "s_out_2",
    });
    expect(Number(setOut.visit.metalOutWeight)).toBeCloseTo(9.7, 3);
    expect(Number(setOut.visit.rawLossWeight)).toBeCloseTo(0.3, 3);

    // E. Final Polish carries 1.500g stones without adding them twice
    const finOut = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FINAL_POLISH",
      karigarId: karigar.id,
      grossInWeight: "11.200",
      grossOutWeight: "11.000",
      closeProcess: true,
      businessDate: "2026-11-04",
      idempotencyKey: "fin_out_2",
    });
    expect(Number(finOut.visit.metalInWeight)).toBeCloseTo(9.7, 3);
    expect(Number(finOut.visit.metalOutWeight)).toBeCloseTo(9.5, 3);
    expect(Number(finOut.visit.rawLossWeight)).toBeCloseTo(0.2, 3);
  });

  it("F. Mixed-purity stock totals: 10g @ 92% + 20g @ 75.5% + 5g @ 99.9% = 35g physical & 29.295g fine", async () => {
    const { service, admin } = createTestEnv();

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
      physicalWeight: "10.000",
      businessDate: "2026-11-01",
      reason: "92%",
      idempotencyKey: "mix_92",
    });
    await service.postOpeningBalance(admin, {
      purityId: p755.id,
      physicalWeight: "20.000",
      businessDate: "2026-11-01",
      reason: "75.5%",
      idempotencyKey: "mix_755",
    });
    await service.postOpeningBalance(admin, {
      purityId: p999.id,
      physicalWeight: "5.000",
      businessDate: "2026-11-01",
      reason: "99.9%",
      idempotencyKey: "mix_999",
    });

    const recon = await service.getDailyReconciliation(admin);
    const totalMixedPhysical = recon.byPurity.reduce(
      (sum, row) => sum + Number(row.adminPhysicalWeight),
      0
    );
    expect(totalMixedPhysical).toBeCloseTo(35.0, 3);
    expect(Number(recon.totals.adminAvailableFine)).toBeCloseTo(29.295, 3);
  });

  it("G. Simplified UI source checks: collapsed history, separate Give/Receive Work, Setting stone order, simplified recovery", () => {
    const stockSrc = fs.readFileSync(
      path.resolve(__dirname, "../app/stock/page.tsx"),
      "utf8"
    );
    expect(stockSrc).toContain("useState(false)");
    expect(stockSrc).toContain("Transaction History ({history.length})");
    expect(stockSrc).toContain("Stock by Touch");
    expect(stockSrc).toContain("Mixed-Purity Physical");
    expect(stockSrc).toContain("Technical details");

    const regSrc = fs.readFileSync(
      path.resolve(__dirname, "../app/production-register/page.tsx"),
      "utf8"
    );
    expect(regSrc).toContain("Give Work (IN)");
    expect(regSrc).toContain("Receive Work (OUT)");
    expect(regSrc).toContain("Save Additional Gold");
    expect(regSrc).toContain("Previous issues");
    expect(regSrc).toContain("Partial return");
    expect(regSrc).toContain("Total IN including stones:");

    const recSrc = fs.readFileSync(
      path.resolve(__dirname, "../app/recovery/page.tsx"),
      "utf8"
    );
    expect(recSrc).toContain("Recover All");
    expect(recSrc).toContain("Confirm Recovery");
    expect(recSrc).toContain("Gold with karigar");
    expect(recSrc).toContain("Loss remaining to recover");
    expect(recSrc).toContain("Recovered this month");
    expect(recSrc).toContain("Recovery History");
    expect(recSrc).toContain("More options");
  });
});
