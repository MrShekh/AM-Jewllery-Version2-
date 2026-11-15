import { describe, expect, it } from "vitest";
import {
  ActorContext,
  ConflictError,
  ErpDomainService,
  InMemoryTransactionalRepository,
  ValidationError,
} from "../lib/domain";

function createTestEnvironment() {
  const repo = new InMemoryTransactionalRepository();
  const service = new ErpDomainService(repo);
  const admin: ActorContext = {
    userId: "usr_admin_1",
    organizationId: "org_am_jewellers",
    role: "OWNER_ADMIN",
    email: "admin@amjewellers.local",
    name: "Owner Admin",
  };
  return { repo, service, admin };
}

async function setupBase(openingGrams = "100.000") {
  const env = createTestEnvironment();
  const purity92 = await env.service.configurePurity(env.admin, {
    code: "P_92",
    displayLabel: "22K (92%)",
    karatLabel: "22KT",
    touchPercent: "92.0000",
  });
  await env.service.postOpeningBalance(env.admin, {
    purityId: purity92.id,
    physicalWeight: openingGrams,
    businessDate: "2026-11-15",
    reason: "Opening Stock",
    idempotencyKey: "open_1",
  });
  const customer = await env.service.createCustomer(env.admin, {
    name: "Shekh Asif",
    phone: "9999999999",
  });
  const karigar = await env.service.createKarigar(env.admin, {
    name: "Ramesh Karigar",
    karigarCode: "KAR-01",
    capabilities: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
  });
  return { ...env, purity92, customer, karigar };
}

describe("Extra Metal Returned - Acceptance Tests A-F", () => {
  it("A. Basic filing return: 100g admin, issue 10g, receive 8g + 0.500g extra => admin 90.5g, prod 8g, loss 1.5g", async () => {
    const { service, admin, purity92, customer, karigar } = await setupBase("100.000");

    const { order } = await service.createOrder(admin, {
      bagNumber: "101",
      customerId: customer.id,
      orderName: "Ring",
      purityId: purity92.id,
      orderDate: "2026-11-15",
      selectedProcesses: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
    });

    const res = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "8.000",
      extraMetalReturnedWeight: "0.500",
      closeProcess: true,
      businessDate: "2026-11-15",
      idempotencyKey: "proc_A_filing",
    });

    expect(res.visit.metalOutWeight.toFixed(3)).toBe("8.000");
    expect(res.visit.extraMetalReturnedWeight.toFixed(3)).toBe("0.500");
    expect(res.visit.extraMetalFineWeight.toFixed(3)).toBe("0.460");
    expect(res.visit.rawLossWeight.toFixed(3)).toBe("1.500");
    expect(res.process.returnedMetalWeight.toFixed(3)).toBe("8.000");
    expect(res.process.extraReturnedMetalWeight.toFixed(3)).toBe("0.500");
    expect(res.process.closedLossWeight.toFixed(3)).toBe("1.500");
    expect(res.lossRecord?.rawMetalLossWeight.toFixed(3)).toBe("1.500");

    const recon = await service.getDailyReconciliation(admin);
    const p92Recon = recon.byPurity.find((b) => b.purityId === purity92.id);
    expect(p92Recon?.adminPhysicalWeight).toBe("90.500");
    expect(p92Recon?.adminFineEquivalent).toBe("83.260");
    expect(recon.totals.karigarCustodyFine).toBe("7.360"); // 8.000g * 0.92
    expect(recon.totals.totalAccountedFine).toBe("92.000");

    const ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigar.id,
    });
    expect(Number(ws.karigarSummaries[0].outstandingFine).toFixed(3)).toBe("1.380"); // 1.500g * 0.92 (not 2.0g!)
  });

  it("B. Incremental filing issue: 10g + 5g = 15g, OUT 14.000g + extra 0.500g => loss 0.500g", async () => {
    const { service, admin, purity92, customer, karigar } = await setupBase("100.000");

    const { order } = await service.createOrder(admin, {
      bagNumber: "102",
      customerId: customer.id,
      orderName: "Bangle",
      purityId: purity92.id,
      orderDate: "2026-11-15",
      selectedProcesses: ["FILING"],
    });

    await service.issueMetalToOrder(admin, {
      orderId: order.id,
      karigarId: karigar.id,
      metalWeight: "10.000",
      businessDate: "2026-11-15",
      idempotencyKey: "issue_B1",
    });

    await service.addFilingGoldIssue(admin, {
      orderId: order.id,
      additionalWeight: "5.000",
      karigarId: karigar.id,
      businessDate: "2026-11-15",
      idempotencyKey: "add_B",
    });

    const res = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "15.000",
      grossOutWeight: "14.000",
      extraMetalReturnedWeight: "0.500",
      closeProcess: true,
      businessDate: "2026-11-15",
      idempotencyKey: "proc_B_filing",
    });

    expect(res.visit.rawLossWeight.toFixed(3)).toBe("0.500");
    expect(res.process.returnedMetalWeight.toFixed(3)).toBe("14.000");
    expect(res.process.extraReturnedMetalWeight.toFixed(3)).toBe("0.500");
  });

  it("C. Earlier unused return: issue 15g, return 2g unused, later OUT 12.5g + extra 0.2g => loss 0.300g without double deduction", async () => {
    const { service, admin, purity92, customer, karigar } = await setupBase("100.000");

    const { order } = await service.createOrder(admin, {
      bagNumber: "103",
      customerId: customer.id,
      orderName: "Chain",
      purityId: purity92.id,
      orderDate: "2026-11-15",
      selectedProcesses: ["FILING"],
    });

    await service.issueMetalToOrder(admin, {
      orderId: order.id,
      karigarId: karigar.id,
      metalWeight: "15.000",
      businessDate: "2026-11-15",
      idempotencyKey: "issue_C",
    });

    await service.returnUnusedGoldFromFiling(admin, {
      orderId: order.id,
      grossWeight: "2.000",
      reason: "Unused cutting",
      businessDate: "2026-11-15",
      idempotencyKey: "ret_unused_C",
    });

    const res = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "13.000",
      grossOutWeight: "12.500",
      extraMetalReturnedWeight: "0.200",
      closeProcess: true,
      businessDate: "2026-11-15",
      idempotencyKey: "proc_C_filing",
    });

    expect(res.visit.rawLossWeight.toFixed(3)).toBe("0.300");

    const recon = await service.getDailyReconciliation(admin);
    const p92Recon = recon.byPurity.find((b) => b.purityId === purity92.id);
    // 100 - 15 + 2 + 0.2 = 87.200
    expect(p92Recon?.adminPhysicalWeight).toBe("87.200");
  });

  it("D. Setting with stones: 10g gold + 0.5g AD + 1.0g KL = 11.5g IN, 11.2g OUT + 0.1g extra => 9.7g gold OUT, 0.2g loss, 1.5g stones carried", async () => {
    const { service, admin, purity92, customer, karigar } = await setupBase("100.000");

    const { order } = await service.createOrder(admin, {
      bagNumber: "104",
      customerId: customer.id,
      orderName: "AD Ring",
      purityId: purity92.id,
      orderDate: "2026-11-15",
      selectedProcesses: ["SETTING", "FINAL_POLISH"],
    });

    const res = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "SETTING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "11.200",
      extraMetalReturnedWeight: "0.100",
      stoneComponents: [
        { componentType: "AD", direction: "ADDED", pieces: 10, weightGrams: "0.500" },
        { componentType: "KL", direction: "ADDED", pieces: 4, weightGrams: "1.000" },
      ],
      closeProcess: true,
      businessDate: "2026-11-15",
      idempotencyKey: "proc_D_setting",
    });

    expect(res.visit.metalOutWeight.toFixed(3)).toBe("9.700");
    expect(res.visit.nonGoldOutWeight.toFixed(3)).toBe("1.500");
    expect(res.visit.extraMetalReturnedWeight.toFixed(3)).toBe("0.100");
    expect(res.visit.rawLossWeight.toFixed(3)).toBe("0.200");
    expect(res.nextProcess?.carriedStoneInWeight.toFixed(3)).toBe("1.500");
    expect(res.nextProcess?.issuedMetalWeight.toFixed(3)).toBe("9.700");
  });

  it("E. No extra return defaults to 0.000g and preserves standard workflow", async () => {
    const { service, admin, purity92, customer, karigar } = await setupBase("100.000");

    const { order } = await service.createOrder(admin, {
      bagNumber: "105",
      customerId: customer.id,
      orderName: "Plain Band",
      purityId: purity92.id,
      orderDate: "2026-11-15",
      selectedProcesses: ["FILING"],
    });

    const res = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "9.800",
      closeProcess: true,
      businessDate: "2026-11-15",
      idempotencyKey: "proc_E",
    });

    expect(res.visit.extraMetalReturnedWeight.toFixed(3)).toBe("0.000");
    expect(res.visit.rawLossWeight.toFixed(3)).toBe("0.200");
  });

  it("F1. Safety: Idempotency, Partial Returns, and Over-return Blocking", async () => {
    const { service, admin, purity92, customer, karigar } = await setupBase("100.000");

    const { order } = await service.createOrder(admin, {
      bagNumber: "106",
      customerId: customer.id,
      orderName: "Necklace",
      purityId: purity92.id,
      orderDate: "2026-11-15",
      selectedProcesses: ["FILING"],
    });

    await service.issueMetalToOrder(admin, {
      orderId: order.id,
      karigarId: karigar.id,
      metalWeight: "10.000",
      businessDate: "2026-11-15",
      idempotencyKey: "issue_F1",
    });

    // Over-return must be blocked (never clamped to zero)
    await expect(
      service.postProcessEntry(admin, {
        orderId: order.id,
        processType: "FILING",
        karigarId: karigar.id,
        grossInWeight: "10.000",
        grossOutWeight: "9.600",
        extraMetalReturnedWeight: "0.500",
        closeProcess: true,
        businessDate: "2026-11-15",
        idempotencyKey: "proc_F1_over",
      })
    ).rejects.toThrow(ValidationError);

    // Partial return: 4.000g OUT + 0.500g extra, 5.500g still with karigar -> 0 loss so far
    const p1 = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "4.000",
      extraMetalReturnedWeight: "0.500",
      custodyRetainedMetalWeight: "5.500",
      closeProcess: false,
      businessDate: "2026-11-15",
      idempotencyKey: "proc_F1_part1",
    });
    expect(p1.visit.rawLossWeight.toFixed(3)).toBe("0.000");

    // Idempotent retry does not double-credit admin
    const p1Retry = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "4.000",
      extraMetalReturnedWeight: "0.500",
      custodyRetainedMetalWeight: "5.500",
      closeProcess: false,
      businessDate: "2026-11-15",
      idempotencyKey: "proc_F1_part1",
    });
    expect(p1Retry.visit.id).toBe(p1.visit.id);

    const recon = await service.getDailyReconciliation(admin);
    const p92Recon = recon.byPurity.find((b) => b.purityId === purity92.id);
    expect(p92Recon?.adminPhysicalWeight).toBe("90.500");

    // Final close on remaining 5.500g: 5.000g OUT + 0.200g extra => 0.300g loss
    const p2 = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "5.500",
      grossOutWeight: "5.000",
      extraMetalReturnedWeight: "0.200",
      closeProcess: true,
      businessDate: "2026-11-15",
      idempotencyKey: "proc_F1_part2",
    });
    expect(p2.visit.rawLossWeight.toFixed(3)).toBe("0.300");
    expect(p2.process.returnedMetalWeight.toFixed(3)).toBe("9.000");
    expect(p2.process.extraReturnedMetalWeight.toFixed(3)).toBe("0.700");
  });

  it("F2. Safety: Different-touch fine reconciliation & reversal guards", async () => {
    const { service, admin, purity92, customer, karigar } = await setupBase("100.000");
    const purity75 = await service.configurePurity(admin, {
      code: "P_75",
      displayLabel: "18K (75%)",
      karatLabel: "18KT",
      touchPercent: "75.0000",
    });

    const { order } = await service.createOrder(admin, {
      bagNumber: "107",
      customerId: customer.id,
      orderName: "Mixed Pendant",
      purityId: purity92.id,
      orderDate: "2026-11-15",
      selectedProcesses: ["FILING"],
    });

    // 10g @ 92% = 9.200g fine. Return 8.000g @ 92% (7.360g fine) + 1.000g @ 75% (0.750g fine)
    // Fine loss = 9.200 - 7.360 - 0.750 = 1.090g fine
    const res = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "8.000",
      extraMetalReturnedWeight: "1.000",
      extraMetalTouchPercent: "75",
      extraMetalPurityId: purity75.id,
      closeProcess: true,
      businessDate: "2026-11-15",
      idempotencyKey: "proc_F2",
    });

    expect(res.visit.extraMetalFineWeight.toFixed(3)).toBe("0.750");
    expect(res.visit.fineLossWeight.toFixed(3)).toBe("1.090");

    const recon = await service.getDailyReconciliation(admin);
    const p75Recon = recon.byPurity.find((b) => b.purityId === purity75.id);
    expect(p75Recon?.adminPhysicalWeight).toBe("1.000");
    expect(p75Recon?.adminFineEquivalent).toBe("0.750");

    // Reversal blocked if loss is recovered
    const ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigar.id,
    });
    await service.postRecoverySettlement(admin, {
      karigarId: karigar.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92.00",
      businessDate: "2026-11-15",
      makingDeductionInput: "0",
      lines: [{ purityId: purity92.id, grossWeight: "0.500", touchPercent: "92" }],
      shortageAction: "CARRY_FORWARD",
      snapshotClaimIds: ws.touchGroups[0].claimIds,
      snapshotExpectedOutstandingFine: ws.touchGroups[0].outstandingFine,
      idempotencyKey: "rec_F2",
    });

    await expect(
      service.reverseProcessVisit(admin, {
        orderId: order.id,
        visitId: res.visit.id,
        reason: "Try reversing after recovery",
        businessDate: "2026-11-15",
        idempotencyKey: "rev_F2_fail",
      })
    ).rejects.toThrow(ConflictError);
  });
});
