import { describe, expect, it } from "vitest";
import { InMemoryTransactionalRepository } from "../lib/domain/repository";
import { ErpDomainService } from "../lib/domain/erp-service";
import { ActorContext } from "../lib/domain/types";

function makeActors() {
  const admin: ActorContext = {
    userId: "usr_admin",
    organizationId: "org_main",
    role: "OWNER_ADMIN",
    email: "admin@am.test",
    name: "Owner Admin",
  };
  const otherOrgAdmin: ActorContext = {
    userId: "usr_other",
    organizationId: "org_other",
    role: "OWNER_ADMIN",
    email: "other@am.test",
    name: "Other Org",
  };
  return { admin, otherOrgAdmin };
}

describe("AM Jewellers V2 Complete Specification Acceptance Tests (Section 15 A-F)", () => {
  it("A. Mixed admin stock, Gold Sale, and Purity Conversion / Refining rules", async () => {
    const repo = new InMemoryTransactionalRepository();
    const service = new ErpDomainService(repo);
    const { admin } = makeActors();

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
      isFineCategory: true,
    });

    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "10.000",
      idempotencyKey: "a_open_92",
    });
    await service.postOpeningBalance(admin, {
      purityId: p999.id,
      physicalWeight: "10.000",
      idempotencyKey: "a_open_999",
    });

    const dash = await service.getDashboardSummary(admin);
    expect(dash.groupA_adminStock.mixedPhysical).toBe("20.000");
    expect(dash.groupA_adminStock.totalFine).toBe("19.1900");

    // Preview conversion without changing stock
    const preview = await service.previewStockConversion(admin, {
      sourcePurityId: p999.id,
      sourceWeight: "5.000",
      targetPurityId: p92.id,
    });
    expect(preview.theoreticalFineWeight).toBe("4.9950");

    // Block inventing gold when output fine exceeds input fine
    await expect(
      service.postStockConversion(admin, {
        conversionType: "FINE_TO_KARAT",
        sourcePurityId: p999.id,
        sourceWeight: "5.000",
        targetPurityId: p92.id,
        actualOutputWeight: "6.000", // 5.520g fine > 4.995g fine
        idempotencyKey: "a_conv_bad",
      })
    ).rejects.toThrow(/Cannot invent gold/);

    // Valid physical conversion + Gold Sale
    await service.postStockConversion(admin, {
      conversionType: "FINE_TO_KARAT",
      sourcePurityId: p999.id,
      sourceWeight: "5.000",
      targetPurityId: p92.id,
      actualOutputWeight: "5.400", // 4.968g fine, 0.027g fine loss
      lossTreatment: "ACCEPTED",
      idempotencyKey: "a_conv_ok",
    });

    const sale = await service.postStockSale(admin, {
      purityId: p92.id,
      physicalWeight: "2.000",
      buyerName: "Bullion Buyer",
      pricePerGramRupees: "7500",
      paidAmountRupees: "15000",
      idempotencyKey: "a_sale_1",
    });
    expect(sale.totalAmountRupees.toFixed(2)).toBe("15000.00");
    expect(sale.paymentStatus).toBe("PAID");

    const recon = await service.getDailyReconciliation(admin);
    expect(recon.totals.discrepancyFine).toBe("0.000");
  });

  it("B. Filing: 100g opening -> +10g -> +5g -> return 2g unused -> receive 12.7g -> 0.3g loss", async () => {
    const repo = new InMemoryTransactionalRepository();
    const service = new ErpDomainService(repo);
    const { admin } = makeActors();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "100.000",
      idempotencyKey: "b_open_92",
    });
    const cust = await service.createCustomer(admin, { name: "Cust B" });
    const { karigars } = await service.ensureDefaultKarigars(admin);
    const hasan = karigars.find((k) => k.name === "Hasan Bhai")!;
    const boro = karigars.find((k) => k.name === "Boro Bhai")!;
    expect(boro.capabilities).toContain("FREE_POLISH");
    expect(boro.capabilities).toContain("FINAL_POLISH");

    const { order } = await service.createOrder(admin, {
      bagNumber: "B-101",
      orderName: "Filing Test Ring",
      customerId: cust.id,
      purityId: p92.id,
      selectedProcesses: ["FILING", "SETTING"],
    });

    // Save IN without OUT -> With Karigar
    await service.giveWorkToProcess(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: hasan.id,
      grossInWeight: "10.000",
      idempotencyKey: "b_give_1",
    });

    // Add 5g (retry with same idempotencyKey posts once)
    await service.addFilingGoldIssue(admin, {
      orderId: order.id,
      additionalWeight: "5.000",
      idempotencyKey: "b_add_5",
    });
    await service.addFilingGoldIssue(admin, {
      orderId: order.id,
      additionalWeight: "5.000",
      idempotencyKey: "b_add_5",
    });

    let recon = await service.getDailyReconciliation(admin);
    expect(recon.byPurity[0].adminPhysicalWeight).toBe("85.000");

    // Return 2g unused
    const ret = await service.returnUnusedGoldFromFiling(admin, {
      orderId: order.id,
      grossWeight: "2.000",
      reason: "Extra bar returned",
      idempotencyKey: "b_ret_2",
    });
    expect(ret.netIssuedWeight.toFixed(3)).toBe("13.000");

    recon = await service.getDailyReconciliation(admin);
    expect(recon.byPurity[0].adminPhysicalWeight).toBe("87.000");

    // Receive processed piece 12.700g and close Filing -> 0.300g loss
    const postRes = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: hasan.id,
      grossInWeight: "13.000",
      grossOutWeight: "12.700",
      closeProcess: true,
      idempotencyKey: "b_close_fil",
    });
    expect(postRes.visit.rawLossWeight.toFixed(3)).toBe("0.300");

    recon = await service.getDailyReconciliation(admin);
    expect(recon.byPurity[0].adminPhysicalWeight).toBe("87.000");
    expect(recon.totals.discrepancyFine).toBe("0.000");

    // Closed Filing loss is immediately recoverable while Setting is not started/open
    const ws = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(ws.karigarSummaries[0].eligibleOriginalFine).toBe("0.2760");
  });

  it("C. Setting: 10g + 0.5g AD + 1g KL = 11.5g IN, OUT 11.2g -> 0.3g gold loss, 9.7g returned gold", async () => {
    const repo = new InMemoryTransactionalRepository();
    const service = new ErpDomainService(repo);
    const { admin } = makeActors();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "50.000",
      idempotencyKey: "c_open_92",
    });
    const cust = await service.createCustomer(admin, { name: "Cust C" });
    const { karigars } = await service.ensureDefaultKarigars(admin);
    const josim = karigars.find((k) => k.name === "Josim")!;

    const { order } = await service.createOrder(admin, {
      bagNumber: "C-101",
      orderName: "Setting Stone Ring",
      customerId: cust.id,
      purityId: p92.id,
      selectedProcesses: ["SETTING", "FINAL_POLISH"],
    });

    await service.giveWorkToProcess(admin, {
      orderId: order.id,
      processType: "SETTING",
      karigarId: josim.id,
      grossInWeight: "10.000",
      stoneComponents: [
        { componentType: "AD", direction: "ADDED", pieces: 10, weightGrams: "0.500" },
        { componentType: "KL", direction: "ADDED", pieces: 2, weightGrams: "1.000" },
      ],
      idempotencyKey: "c_give_set",
    });

    // Admin stock deducted only 10.000g (stones do NOT move admin gold)
    const reconMid = await service.getDailyReconciliation(admin);
    expect(reconMid.byPurity[0].adminPhysicalWeight).toBe("40.000");

    const closeSet = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "SETTING",
      karigarId: josim.id,
      grossInWeight: "10.000",
      grossOutWeight: "11.200",
      closeProcess: true,
      idempotencyKey: "c_close_set",
    });
    expect(closeSet.visit.rawLossWeight.toFixed(3)).toBe("0.300");
    expect(closeSet.visit.metalOutWeight.toFixed(3)).toBe("9.700");
    expect(closeSet.visit.nonGoldOutWeight.toFixed(3)).toBe("1.500");
  });

  it("D. Recovery: 50g - 10g making - 38g received = 2g shortage (carry / accept / split) & no repeat making", async () => {
    const repo = new InMemoryTransactionalRepository();
    const service = new ErpDomainService(repo);
    const { admin } = makeActors();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "200.000",
      idempotencyKey: "d_open",
    });
    const cust = await service.createCustomer(admin, { name: "Cust D" });
    const { karigars } = await service.ensureDefaultKarigars(admin);
    const hasan = karigars.find((k) => k.name === "Hasan Bhai")!;

    const { order } = await service.createOrder(admin, {
      bagNumber: "D-101",
      orderName: "Big Loss Job",
      customerId: cust.id,
      purityId: p92.id,
      selectedProcesses: ["FILING"],
    });
    await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: hasan.id,
      grossInWeight: "100.000",
      grossOutWeight: "50.000", // 50.000g loss @ 92% = 46.0000g fine
      closeProcess: true,
      idempotencyKey: "d_loss_50",
    });

    // 50 - 10 making - 38 received = 2g carry forward
    const s1 = await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92",
      businessDate: "2026-04-10",
      lines: [{ purityId: p92.id, grossWeight: "38.000", touchPercent: "92" }],
      makingDeductionInput: "10.000",
      shortageAction: "CARRY_FORWARD",
      idempotencyKey: "d_set_1",
    });
    expect(s1.receipt?.journalTransactionId).toBeTruthy();

    // Admin received 38g only: 200 - 100 + 38 = 138.000g
    const recon = await service.getDailyReconciliation(admin);
    expect(recon.byPurity[0].adminPhysicalWeight).toBe("138.000");

    // Next recovery cannot apply making again without explicit confirmation
    await expect(
      service.postRecoverySettlement(admin, {
        karigarId: hasan.id,
        scopeType: "SINGLE_TOUCH",
        scopeTouchPercent: "92",
        businessDate: "2026-04-11",
        lines: [],
        makingDeductionInput: "0.500",
        shortageAction: "CARRY_FORWARD",
        idempotencyKey: "d_set_repeat_making",
      })
    ).rejects.toThrow(/Explicit confirmation/);

    // Accept 0.5g shortage and carry 1.5g, then settle remaining 1.5g
    await service.postRecoverySettlement(admin, {
      karigarId: hasan.id,
      scopeType: "SINGLE_TOUCH",
      scopeTouchPercent: "92",
      businessDate: "2026-04-12",
      lines: [],
      shortageAction: "ACCEPT_PART",
      acceptedShortageInput: "0.500",
      idempotencyKey: "d_set_part",
    });
    const wsMid = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: hasan.id,
    });
    expect(wsMid.touchGroups[0].outstandingMetalEquivalent).toBe("1.500");

    // Delete order blocked when loss already has active recovery allocations
    await expect(
      service.deleteOrderWithRollback(admin, {
        orderId: order.id,
        idempotencyKey: "d_del_blocked",
      })
    ).rejects.toThrow(/Reverse the recovery settlement first/);
  });

  it("E & F. Billing, advances, share tokens, cross-org isolation, and dashboard totals", async () => {
    const repo = new InMemoryTransactionalRepository();
    const service = new ErpDomainService(repo);
    const { admin, otherOrgAdmin } = makeActors();

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
      isFineCategory: true,
    });
    const p95 = await service.configurePurity(admin, {
      code: "23K_95",
      displayLabel: "23K (95%)",
      karatLabel: "23KT",
      touchPercent: "95.0000",
    });

    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "100.000",
      idempotencyKey: "e_open_92",
    });
    const cust = await service.createCustomer(admin, {
      name: "Cust E",
      phone: "9876543210",
    });
    const { karigars } = await service.ensureDefaultKarigars(admin);
    const hasan = karigars.find((k) => k.name === "Hasan Bhai")!;

    // Existing advance: 5g @ 99.9% = 4.995g fine
    await service.recordCustomerGoldReceipt(admin, {
      customerId: cust.id,
      businessDate: "2026-04-01",
      lines: [{ purityId: p999.id, grossWeight: "5.000", touchPercent: "99.9" }],
      allocationMode: "NONE",
      idempotencyKey: "e_adv_5",
    });

    // Order completed at 19.200g net metal
    const { order } = await service.createOrder(admin, {
      bagNumber: "E-101",
      orderName: "Bangle",
      customerId: cust.id,
      purityId: p92.id,
      selectedProcesses: ["FILING"],
    });
    await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: hasan.id,
      grossInWeight: "19.200",
      grossOutWeight: "19.200",
      closeProcess: true,
      idempotencyKey: "e_fil",
    });
    await service.completeOrder(admin, {
      orderId: order.id,
      finishedGrossWeight: "19.200",
      finishedStoneWeight: "0",
      idempotencyKey: "e_comp",
    });

    // Dashboard includes finished goods before delivery
    const dashBeforeDelivery = await service.getDashboardSummary(admin);
    expect(dashBeforeDelivery.groupC_productionAndRecovery.finishedGoodsPhysical).toBe("19.200");

    // Cross-org access fails
    await expect(
      service.getCustomerConsolidatedStatement(otherOrgAdmin, cust.id)
    ).rejects.toThrow();

    // Post Bill & Deliver: 19.2g @ (92% + 3pp) = 18.240g fine; auto-apply 4.995g advance -> 13.245g outstanding
    const billRes = await service.postBillAndDeliver(admin, {
      customerId: cust.id,
      lines: [
        {
          orderId: order.id,
          billingBasis: "NET_METAL",
          makingPercentagePoints: "3",
        },
      ],
      applyFineAdvance: true,
      idempotencyKey: "e_bill_1",
    });
    expect(billRes.bill.totalFineGold.toFixed(3)).toBe("18.240");
    expect(billRes.allocations[0].allocatedFineWeight.toFixed(3)).toBe("4.995");

    // Receive 10g @ 95% = 9.500g fine -> remaining 3.745g fine
    await service.recordCustomerGoldReceipt(admin, {
      customerId: cust.id,
      businessDate: "2026-04-05",
      lines: [{ purityId: p95.id, grossWeight: "10.000", touchPercent: "95" }],
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "e_rcp_10",
    });

    const stmt = await service.getCustomerConsolidatedStatement(admin, cust.id);
    expect(stmt.totals.netOutstandingFine).toBe("3.7450");

    // Public revocable share token
    const token = await service.createBillShareToken(admin, billRes.bill.id);
    const publicBill = await service.getPublicSharedBill(token.token);
    expect(publicBill.billNumber).toBe(billRes.bill.billNumber);
    await service.revokeBillShareToken(admin, token.id);
    await expect(service.getPublicSharedBill(token.token)).rejects.toThrow();
  });

  it("G. Deleting an order after final process closes (before Complete Order) rolls back 100% of issued gold", async () => {
    const repo = new InMemoryTransactionalRepository();
    const service = new ErpDomainService(repo);
    const { admin } = makeActors();

    const p92 = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: p92.id,
      physicalWeight: "100.000",
      reason: "Opening",
      idempotencyKey: "g_open",
    });

    const cust = await service.createCustomer(admin, { name: "Test Cust" });
    const hasan = await service.createKarigar(admin, {
      name: "Hasan Bhai",
      capabilities: ["FILING", "FINAL_POLISH"],
    });
    const { order } = await service.createOrder(admin, {
      bagNumber: "G-101",
      orderName: "Chain",
      customerId: cust.id,
      purityId: p92.id,
      selectedProcesses: ["FILING", "FINAL_POLISH"],
    });

    await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: hasan.id,
      grossInWeight: "10.000",
      grossOutWeight: "9.500",
      closeProcess: true,
      idempotencyKey: "g_fil",
    });
    await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FINAL_POLISH",
      karigarId: hasan.id,
      grossInWeight: "9.500",
      grossOutWeight: "8.320",
      closeProcess: true,
      idempotencyKey: "g_fin",
    });

    const del = await service.deleteOrderWithRollback(admin, {
      orderId: order.id,
      idempotencyKey: "g_del",
    });
    expect(del.rolledBackPhysicalWeight.toFixed(3)).toBe("10.000");

    const recon = await service.getDailyReconciliation(admin);
    expect(recon.byPurity[0].adminPhysicalWeight).toBe("100.000");
    expect(recon.totals.discrepancyFine).toBe("0.000");
  });
});
