import { describe, expect, it } from "vitest";
import { ErpDomainService } from "../lib/domain/erp-service";
import { InMemoryTransactionalRepository } from "../lib/domain/repository";
import { ActorContext } from "../lib/domain/types";
import { ConflictError, ValidationError } from "../lib/domain/errors";

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

async function seedOrderWithClosedLoss(
  service: ErpDomainService,
  admin: ActorContext,
  opts: {
    bagNumber: string;
    purityId: string;
    karigarId: string;
    issuedWeight: string;
    outWeight: string;
    processType?: "FILING" | "FREE_POLISH" | "SETTING" | "FINAL_POLISH";
  }
) {
  const cust = await service.createCustomer(admin, {
    name: `Customer ${opts.bagNumber}`,
  });
  const { order } = await service.createOrder(admin, {
    bagNumber: opts.bagNumber,
    customerId: cust.id,
    purityId: opts.purityId,
    orderName: `Item ${opts.bagNumber}`,
    orderDate: "2026-11-01",
    selectedProcesses: ["FILING", "SETTING", "FINAL_POLISH"],
  });
  await service.giveWorkToProcess(admin, {
    orderId: order.id,
    processType: "FILING",
    karigarId: opts.karigarId,
    grossInWeight: opts.issuedWeight,
    businessDate: "2026-11-01",
    idempotencyKey: `give_${opts.bagNumber}`,
  });
  await service.postProcessEntry(admin, {
    orderId: order.id,
    processType: "FILING",
    karigarId: opts.karigarId,
    grossInWeight: opts.issuedWeight,
    grossOutWeight: opts.outWeight,
    closeProcess: true,
    businessDate: "2026-11-02",
    idempotencyKey: `close_${opts.bagNumber}`,
  });
  return order;
}

describe("Agreed Karigar Recovery Module Acceptance Tests (A-G)", () => {
  it("Test A & D — Carry the shortage (50g - 10g making - 38g received = 2g carried), then Next recovery (2g received, no repeat making)", async () => {
    const { service, admin } = createTestEnv();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "200.000",
      businessDate: "2026-11-01",
      reason: "Opening 92%",
      idempotencyKey: "open_a",
    });

    const hasan = await service.createKarigar(admin, {
      karigarCode: "HASAN",
      name: "Hasan Bhai",
      capabilities: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
    });

    // 100g issued, 50g returned -> 50.000g loss @ 92% = 46.0000g fine
    await seedOrderWithClosedLoss(service, admin, {
      bagNumber: "A-101",
      purityId: p92.id,
      karigarId: hasan.id,
      issuedWeight: "100.000",
      outWeight: "50.000",
    });

    let ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(ws.touchGroups.length).toBe(1);
    expect(ws.touchGroups[0].outstandingMetalEquivalent).toBe("50.000");
    expect(ws.touchGroups[0].outstandingFine).toBe("46.0000");

    const adminBefore = Number(
      (await service.getDailyReconciliation(admin)).byPurity.find(
        (r) => r.purityId === p92.id
      )!.adminPhysicalWeight
    );

    // Test A: Making 10g @ 92%, Received 38g @ 92%, Carry forward 2g
    const resA = await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92.00",
      businessDate: "2026-11-05",
      makingDeductionInput: "10.000",
      lines: [{ purityId: p92.id, grossWeight: "38.000", touchPercent: "92" }],
      shortageAction: "CARRY_FORWARD",
      snapshotClaimIds: ws.touchGroups[0].claimIds,
      snapshotExpectedOutstandingFine: ws.touchGroups[0].outstandingFine,
      idempotencyKey: "test_a_1",
    });

    expect(Number(resA.settlement.grossSelectedFine)).toBeCloseTo(46.0, 4);
    expect(Number(resA.settlement.makingDeductionFine)).toBeCloseTo(9.2, 4);
    expect(Number(resA.settlement.netExpectedFine)).toBeCloseTo(36.8, 4);
    expect(Number(resA.settlement.receivedFine)).toBeCloseTo(34.96, 4);
    expect(Number(resA.settlement.carriedShortageFine)).toBeCloseTo(1.84, 4);

    // Admin stock increased by exactly 38.000g (NO physical 10g making payment)
    const adminAfterA = Number(
      (await service.getDailyReconciliation(admin)).byPurity.find(
        (r) => r.purityId === p92.id
      )!.adminPhysicalWeight
    );
    expect(adminAfterA - adminBefore).toBeCloseTo(38.0, 3);

    ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(ws.touchGroups[0].outstandingMetalEquivalent).toBe("2.000");
    expect(ws.touchGroups[0].outstandingFine).toBe("1.8400");
    expect(ws.touchGroups[0].hasPriorMakingDeduction).toBe(true);

    // Guard: Cannot silently apply making deduction again on carried claim without explicit confirmation + reason
    await expect(
      service.postRecoverySettlement(admin, {
        karigarId: hasan.id,
        scopeType: "SINGLE_TOUCH",
        scopeTouchPercent: "92.00",
        businessDate: "2026-11-06",
        makingDeductionInput: "1.000",
        lines: [{ purityId: p92.id, grossWeight: "1.000", touchPercent: "92" }],
        idempotencyKey: "test_d_blocked_making",
      })
    ).rejects.toThrow(ValidationError);

    // Test D: Next recovery — receive 2.000g @ 92%, no new making deduction
    const resD = await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92.00",
      businessDate: "2026-11-06",
      makingDeductionInput: "0",
      lines: [{ purityId: p92.id, grossWeight: "2.000", touchPercent: "92" }],
      snapshotClaimIds: ws.touchGroups[0].claimIds,
      snapshotExpectedOutstandingFine: ws.touchGroups[0].outstandingFine,
      idempotencyKey: "test_d_1",
    });
    expect(Number(resD.settlement.makingDeductionFine)).toBeCloseTo(0, 4);
    expect(Number(resD.settlement.receivedFine)).toBeCloseTo(1.84, 4);

    ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(ws.touchGroups.length).toBe(0);
    expect(Number(ws.karigarSummaries[0].outstandingFine)).toBeCloseTo(0, 4);

    const adminAfterD = Number(
      (await service.getDailyReconciliation(admin)).byPurity.find(
        (r) => r.purityId === p92.id
      )!.adminPhysicalWeight
    );
    expect(adminAfterD - adminAfterA).toBeCloseTo(2.0, 3);
  });

  it("Test B — Accept and clear (50g - 10g making - 38g received, accept 2g shortage)", async () => {
    const { service, admin } = createTestEnv();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "200.000",
      businessDate: "2026-11-01",
      reason: "Opening",
      idempotencyKey: "open_b",
    });

    const hasan = await service.createKarigar(admin, {
      karigarCode: "HASAN",
      name: "Hasan Bhai",
      capabilities: ["FILING"],
    });
    await seedOrderWithClosedLoss(service, admin, {
      bagNumber: "B-101",
      purityId: p92.id,
      karigarId: hasan.id,
      issuedWeight: "100.000",
      outWeight: "50.000",
    });

    const adminBefore = Number(
      (await service.getDailyReconciliation(admin)).byPurity.find(
        (r) => r.purityId === p92.id
      )!.adminPhysicalWeight
    );

    const resB = await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92.00",
      businessDate: "2026-11-05",
      makingDeductionInput: "10.000",
      lines: [{ purityId: p92.id, grossWeight: "38.000", touchPercent: "92" }],
      shortageAction: "ACCEPT_AND_CLEAR",
      idempotencyKey: "test_b_1",
    });

    expect(Number(resB.settlement.makingDeductionFine)).toBeCloseTo(9.2, 4);
    expect(Number(resB.settlement.receivedFine)).toBeCloseTo(34.96, 4);
    expect(Number(resB.settlement.acceptedShortageFine)).toBeCloseTo(1.84, 4);
    expect(Number(resB.settlement.carriedShortageFine)).toBeCloseTo(0, 4);

    const ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(ws.touchGroups.length).toBe(0);
    expect(Number(ws.karigarSummaries[0].outstandingFine)).toBeCloseTo(0, 4);

    const adminAfter = Number(
      (await service.getDailyReconciliation(admin)).byPurity.find(
        (r) => r.purityId === p92.id
      )!.adminPhysicalWeight
    );
    expect(adminAfter - adminBefore).toBeCloseTo(38.0, 3);
  });

  it("Test C — Accept part (accept 0.500g @ 92% = 0.460g fine, carry 1.500g @ 92% = 1.380g fine)", async () => {
    const { service, admin } = createTestEnv();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "200.000",
      businessDate: "2026-11-01",
      reason: "Opening",
      idempotencyKey: "open_c",
    });

    const hasan = await service.createKarigar(admin, {
      karigarCode: "HASAN",
      name: "Hasan Bhai",
      capabilities: ["FILING"],
    });
    await seedOrderWithClosedLoss(service, admin, {
      bagNumber: "C-101",
      purityId: p92.id,
      karigarId: hasan.id,
      issuedWeight: "100.000",
      outWeight: "50.000",
    });

    const resC = await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92.00",
      businessDate: "2026-11-05",
      makingDeductionInput: "10.000",
      lines: [{ purityId: p92.id, grossWeight: "38.000", touchPercent: "92" }],
      shortageAction: "ACCEPT_PART",
      acceptedShortageInput: "0.500",
      idempotencyKey: "test_c_1",
    });

    expect(Number(resC.settlement.acceptedShortageFine)).toBeCloseTo(0.46, 4);
    expect(Number(resC.settlement.carriedShortageFine)).toBeCloseTo(1.38, 4);

    const ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(ws.touchGroups[0].outstandingMetalEquivalent).toBe("1.500");
    expect(ws.touchGroups[0].outstandingFine).toBe("1.3800");
  });

  it("Test E — Recover All across 92% (50g) + 75.5% (20g) = 61.1g fine, making 10g fine, receive 50g @ 99% = 49.5g fine, shortage 1.6g fine", async () => {
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
    const p99 = await service.configurePurity(admin, {
      code: "99_PCT",
      displayLabel: "99%",
      karatLabel: "99",
      touchPercent: "99.0000",
    });

    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "200.000",
      businessDate: "2026-11-01",
      reason: "Open 92",
      idempotencyKey: "open_e_92",
    });
    await service.postOpeningBalance(admin, {
      purityId: p755.id,
      physicalWeight: "200.000",
      businessDate: "2026-11-01",
      reason: "Open 75.5",
      idempotencyKey: "open_e_755",
    });

    const hasan = await service.createKarigar(admin, {
      karigarCode: "HASAN",
      name: "Hasan Bhai",
      capabilities: ["FILING"],
    });

    await seedOrderWithClosedLoss(service, admin, {
      bagNumber: "E-1",
      purityId: p92.id,
      karigarId: hasan.id,
      issuedWeight: "100.000",
      outWeight: "50.000",
    });
    await seedOrderWithClosedLoss(service, admin, {
      bagNumber: "E-2",
      purityId: p755.id,
      karigarId: hasan.id,
      issuedWeight: "50.000",
      outWeight: "30.000",
    });

    let ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(ws.touchGroups.length).toBe(2);
    expect(Number(ws.karigarSummaries[0].outstandingFine)).toBeCloseTo(61.1, 3);

    const resE = await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "ALL_TOUCHES",
      businessDate: "2026-11-05",
      makingDeductionInput: "10.000",
      lines: [{ purityId: p99.id, grossWeight: "50.000", touchPercent: "99" }],
      shortageAction: "CARRY_FORWARD",
      idempotencyKey: "test_e_1",
    });

    expect(Number(resE.settlement.grossSelectedFine)).toBeCloseTo(61.1, 4);
    expect(Number(resE.settlement.makingDeductionFine)).toBeCloseTo(10.0, 4);
    expect(Number(resE.settlement.netExpectedFine)).toBeCloseTo(51.1, 4);
    expect(Number(resE.settlement.receivedFine)).toBeCloseTo(49.5, 4);
    expect(Number(resE.settlement.carriedShortageFine)).toBeCloseTo(1.6, 4);

    // Receipt stock posted at 99% purity
    const recon = await service.getDailyReconciliation(admin);
    const p99Row = recon.byPurity.find((r) => r.purityId === p99.id)!;
    expect(Number(p99Row.adminPhysicalWeight)).toBeCloseTo(50.0, 3);
  });

  it("Test F — Excess recovery (50g - 10g making - 42g received = 2g @ 92% = 1.84g fine unallocated credit)", async () => {
    const { service, admin } = createTestEnv();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "200.000",
      businessDate: "2026-11-01",
      reason: "Open",
      idempotencyKey: "open_f",
    });

    const hasan = await service.createKarigar(admin, {
      karigarCode: "HASAN",
      name: "Hasan Bhai",
      capabilities: ["FILING"],
    });
    await seedOrderWithClosedLoss(service, admin, {
      bagNumber: "F-101",
      purityId: p92.id,
      karigarId: hasan.id,
      issuedWeight: "100.000",
      outWeight: "50.000",
    });

    const adminBefore = Number(
      (await service.getDailyReconciliation(admin)).byPurity.find(
        (r) => r.purityId === p92.id
      )!.adminPhysicalWeight
    );

    const resF = await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92.00",
      businessDate: "2026-11-05",
      makingDeductionInput: "10.000",
      lines: [{ purityId: p92.id, grossWeight: "42.000", touchPercent: "92" }],
      idempotencyKey: "test_f_1",
    });

    expect(resF.settlement.shortageAction).toBe("EXCESS");
    expect(Number(resF.settlement.excessFine)).toBeCloseTo(1.84, 4);
    expect(Number(resF.receipt!.unallocatedFineWeight)).toBeCloseTo(1.84, 4);

    const ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(Number(ws.karigarSummaries[0].outstandingFine)).toBeCloseTo(0, 4);
    expect(Number(ws.karigarSummaries[0].unallocatedCreditFine)).toBeCloseTo(
      1.84,
      4
    );

    const adminAfter = Number(
      (await service.getDailyReconciliation(admin)).byPurity.find(
        (r) => r.purityId === p92.id
      )!.adminPhysicalWeight
    );
    expect(adminAfter - adminBefore).toBeCloseTo(42.0, 3);
  });

  it("Test G — Idempotency, concurrency snapshot conflict, and controlled settlement reversal", async () => {
    const { service, admin } = createTestEnv();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "200.000",
      businessDate: "2026-11-01",
      reason: "Open",
      idempotencyKey: "open_g",
    });

    const hasan = await service.createKarigar(admin, {
      karigarCode: "HASAN",
      name: "Hasan Bhai",
      capabilities: ["FILING"],
    });
    await seedOrderWithClosedLoss(service, admin, {
      bagNumber: "G-101",
      purityId: p92.id,
      karigarId: hasan.id,
      issuedWeight: "100.000",
      outWeight: "50.000",
    });

    const ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });

    // Stale snapshot rejected with ConflictError
    await expect(
      service.postRecoverySettlement(admin, {
        karigarId: hasan.id,
        scopeType: "SINGLE_TOUCH",
        scopeTouchPercent: "92.00",
        businessDate: "2026-11-05",
        makingDeductionInput: "0",
        lines: [{ purityId: p92.id, grossWeight: "50.000", touchPercent: "92" }],
        snapshotClaimIds: ws.touchGroups[0].claimIds,
        snapshotExpectedOutstandingFine: "10.0000",
        idempotencyKey: "test_g_stale",
      })
    ).rejects.toThrow(ConflictError);

    // Duplicate idempotency key posts stock once
    const first = await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92.00",
      businessDate: "2026-11-05",
      makingDeductionInput: "10.000",
      lines: [{ purityId: p92.id, grossWeight: "38.000", touchPercent: "92" }],
      shortageAction: "CARRY_FORWARD",
      idempotencyKey: "test_g_idem",
    });
    const second = await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92.00",
      businessDate: "2026-11-05",
      makingDeductionInput: "10.000",
      lines: [{ purityId: p92.id, grossWeight: "38.000", touchPercent: "92" }],
      shortageAction: "CARRY_FORWARD",
      idempotencyKey: "test_g_idem",
    });
    expect(second.settlement.id).toBe(first.settlement.id);

    // Reversing the settlement restores the full 46.0000g fine outstanding and reverses the 38g stock receipt
    const rev = await service.reverseRecoverySettlement(admin, {
      settlementId: first.settlement.id,
      reason: "Wrong karigar",
      idempotencyKey: "rev_g_1",
    });
    expect(rev.status).toBe("REVERSED");

    const wsAfterRev = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(wsAfterRev.touchGroups[0].outstandingMetalEquivalent).toBe("50.000");
    expect(wsAfterRev.touchGroups[0].outstandingFine).toBe("46.0000");
  });
});

