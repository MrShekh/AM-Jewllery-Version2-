import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ErpDomainService,
  ForbiddenError,
  InMemoryTransactionalRepository,
  UnauthorizedError,
  ValidationError,
  ActorContext,
} from "../lib/domain";
import {
  buildLoginRedirectUrl,
  sanitizeRedirectPath,
} from "../lib/auth-redirect";
import { sanitizeSpreadsheetText } from "../lib/date-and-export";

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
  const operator: ActorContext = {
    userId: "usr_op_1",
    organizationId: "org_am_jewellers",
    role: "OPERATOR",
    email: "operator@amjewellers.local",
    name: "Workshop Operator",
  };
  return { repo, service, admin, operator };
}

describe("AM Jewellers ERP V2 - Increment 1 Acceptance & Accounting Suite", () => {
  it("1. End-to-End 4-Process Numerical Scenario (100g @ 92% -> 80g Admin, 19.200g Net Finished Goods, 0.800g Loss, 92.000g Total Fine)", async () => {
    const { service, admin } = createTestEnvironment();

    // 1. Configure purity 92% (22K (92%))
    const purity92 = await service.configurePurity(admin, {
      code: "P_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });

    // 2. Post opening stock of 100.000g at 92% touch (92.000g fine equivalent)
    const openingTx = await service.postOpeningBalance(admin, {
      purityId: purity92.id,
      physicalWeight: "100.000",
      businessDate: "2026-11-08",
      reason: "Pilot Opening Balance",
      idempotencyKey: "idem_open_100g",
    });
    expect(openingTx.physicalWeight.toFixed(3)).toBe("100.000");
    expect(openingTx.fineEquivalentWeight.toFixed(3)).toBe("92.000");

    // 3. Create customer & karigar
    const customer = await service.createCustomer(admin, {
      name: "Zaveri Bazaar Wholesaler",
    });
    const karigar = await service.createKarigar(admin, {
      name: "Master Karigar A",
      capabilities: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
    });

    // 4. Create an order selecting Filing, Free Polish, Setting, Final Polish
    const { order, processes } = await service.createOrder(admin, {
      bagNumber: "4360",
      customerId: customer.id,
      orderName: "LR RING",
      purityId: purity92.id,
      targetWeight: "20.000",
      orderDate: "2026-11-08",
      selectedProcesses: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
    });
    expect(processes.map((p) => p.processType)).toEqual([
      "FILING",
      "FREE_POLISH",
      "SETTING",
      "FINAL_POLISH",
    ]);

    // Verify order creation did NOT deduct stock
    const reconAfterOrderCreate = await service.getDailyReconciliation(admin);
    expect(reconAfterOrderCreate.byPurity[0].adminPhysicalWeight).toBe("100.000");
    expect(reconAfterOrderCreate.totals.adminAvailableFine).toBe("92.000");

    // 5. Issue 20.000g from Admin Stock to Filing
    await service.issueMetalToOrder(admin, {
      orderId: order.id,
      karigarId: karigar.id,
      metalWeight: "20.000",
      businessDate: "2026-11-08",
      idempotencyKey: "idem_issue_20g",
    });

    const reconAfterIssue = await service.getDailyReconciliation(admin);
    expect(reconAfterIssue.byPurity[0].adminPhysicalWeight).toBe("80.000");
    expect(reconAfterIssue.byPurity[0].adminFineEquivalent).toBe("73.600");
    expect(reconAfterIssue.totals.karigarCustodyFine).toBe("18.400");

    // 6. Filing: 20.000g in -> 19.600g out -> 0.400g loss
    const filingRes = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "20.000",
      grossOutWeight: "19.600",
      businessDate: "2026-11-08",
      idempotencyKey: "idem_filing_1",
    });
    expect(filingRes.visit.rawLossWeight.toFixed(3)).toBe("0.400");
    expect(filingRes.visit.fineLossWeight.toFixed(3)).toBe("0.368");
    expect(filingRes.lossRecord?.eligibilityStatus).toBe("ELIGIBLE");

    // 7. Free Polish: 19.600g in -> 19.400g out -> 0.200g loss
    const freePolishRes = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FREE_POLISH",
      karigarId: karigar.id,
      grossInWeight: "19.600",
      grossOutWeight: "19.400",
      businessDate: "2026-11-08",
      idempotencyKey: "idem_freepolish_1",
    });
    expect(freePolishRes.visit.rawLossWeight.toFixed(3)).toBe("0.200");
    expect(freePolishRes.visit.fineLossWeight.toFixed(3)).toBe("0.184");

    // Verify stage transfer did NOT deduct Admin Stock again (still 80.000g)
    const reconMid = await service.getDailyReconciliation(admin);
    expect(reconMid.byPurity[0].adminPhysicalWeight).toBe("80.000");

    // 8. Setting: 19.400g in, add 1.200g AD (10 pcs) and 0.800g KL (4 pcs),
    // gross out 21.300g, net metal out 19.300g, 0.100g gold loss
    const settingRes = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "SETTING",
      karigarId: karigar.id,
      grossInWeight: "19.400",
      grossOutWeight: "21.300",
      stoneComponents: [
        { componentType: "AD", pieces: 10, weightGrams: "1.200", direction: "ADDED" },
        { componentType: "KL", pieces: 4, weightGrams: "0.800", direction: "ADDED" },
      ],
      businessDate: "2026-11-08",
      idempotencyKey: "idem_setting_1",
    });
    expect(settingRes.visit.nonGoldOutWeight.toFixed(3)).toBe("2.000");
    expect(settingRes.visit.metalOutWeight.toFixed(3)).toBe("19.300");
    expect(settingRes.visit.rawLossWeight.toFixed(3)).toBe("0.100");
    expect(settingRes.visit.fineLossWeight.toFixed(3)).toBe("0.092");
    expect(settingRes.nextProcess?.carriedStoneInWeight.toFixed(3)).toBe("2.000");

    // 9. Final Polish: 21.300g gross in (includes 2.000g stones), 21.200g gross out (includes 2.000g stones),
    // net metal out 19.200g, 0.100g gold loss
    const finalPolishRes = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FINAL_POLISH",
      karigarId: karigar.id,
      grossInWeight: "21.300",
      grossOutWeight: "21.200",
      businessDate: "2026-11-08",
      idempotencyKey: "idem_finalpolish_1",
    });
    expect(finalPolishRes.visit.nonGoldInWeight.toFixed(3)).toBe("2.000");
    expect(finalPolishRes.visit.metalInWeight.toFixed(3)).toBe("19.300");
    expect(finalPolishRes.visit.nonGoldOutWeight.toFixed(3)).toBe("2.000");
    expect(finalPolishRes.visit.metalOutWeight.toFixed(3)).toBe("19.200");
    expect(finalPolishRes.visit.rawLossWeight.toFixed(3)).toBe("0.100");
    expect(finalPolishRes.visit.fineLossWeight.toFixed(3)).toBe("0.092");

    // Under immediate-eligibility rule, closed process visits are immediately ELIGIBLE before order completion
    const reconBeforeComplete = await service.getDailyReconciliation(admin);
    expect(reconBeforeComplete.totals.processLossPendingFine).toBe("0.000");
    expect(reconBeforeComplete.totals.processLossEligibleFine).toBe("0.736");

    // 10. Complete the order
    const completed = await service.completeOrder(admin, {
      orderId: order.id,
      businessDate: "2026-11-08",
      idempotencyKey: "idem_complete_1",
    });

    expect(completed.order.status).toBe("COMPLETED");
    expect(completed.order.finishedGrossWeight?.toFixed(3)).toBe("21.200");
    expect(completed.order.finishedStoneWeight?.toFixed(3)).toBe("2.000");
    expect(completed.order.finishedNetMetalWeight?.toFixed(3)).toBe("19.200");
    expect(completed.order.finishedFineWeight?.toFixed(3)).toBe("17.664");
    expect(completed.order.totalRawLossWeight.toFixed(3)).toBe("0.800");
    expect(completed.order.totalFineLossWeight.toFixed(3)).toBe("0.736");
    expect(
      completed.lossRecords.every((lr) => lr.eligibilityStatus === "ELIGIBLE")
    ).toBe(true);

    // Final Reconciliation Check:
    // Admin available: 80.000g @ 92% (73.600g fine)
    // Finished goods: 19.200g net @ 92% (17.664g fine)
    // Total process loss: 0.800g raw @ 92% (0.736g fine)
    // Total fine accounted for: 73.600 + 17.664 + 0.736 = 92.000g fine
    const finalRecon = await service.getDailyReconciliation(admin);
    expect(finalRecon.byPurity[0].adminPhysicalWeight).toBe("80.000");
    expect(finalRecon.byPurity[0].adminFineEquivalent).toBe("73.600");
    expect(finalRecon.byPurity[0].finishedGoodsPhysicalWeight).toBe("19.200");
    expect(finalRecon.byPurity[0].finishedGoodsFineEquivalent).toBe("17.664");
    expect(finalRecon.totals.karigarCustodyFine).toBe("0.000");
    expect(finalRecon.totals.processLossPendingFine).toBe("0.000");
    expect(finalRecon.totals.processLossEligibleFine).toBe("0.736");
    expect(finalRecon.totals.totalProcessLossFine).toBe("0.736");
    expect(finalRecon.totals.totalAccountedFine).toBe("92.000");
    expect(finalRecon.totals.discrepancyFine).toBe("0.000");
    expect(finalRecon.totals.isBalanced).toBe(true);
  });

  it("2. Supports Filing-only order and Order skipping Free Polish (Filing -> Setting -> Final Polish)", async () => {
    const { service, admin } = createTestEnvironment();
    const purity = await service.configurePurity(admin, {
      code: "P_75",
      displayLabel: "18K (75%)",
      karatLabel: "18KT",
      touchPercent: "75.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: purity.id,
      physicalWeight: "50.000",
      idempotencyKey: "open_50",
    });
    const customer = await service.createCustomer(admin, { name: "Cust 1" });
    const karigar = await service.createKarigar(admin, {
      name: "Karigar 1",
      capabilities: ["FILING", "SETTING", "FINAL_POLISH"],
    });

    // Filing-only order
    const { order: o1 } = await service.createOrder(admin, {
      bagNumber: "BAG-FILING-ONLY",
      customerId: customer.id,
      orderName: "PLAIN BAND",
      purityId: purity.id,
      selectedProcesses: ["FILING"],
    });
    await service.postProcessEntry(admin, {
      orderId: o1.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "9.800",
      idempotencyKey: "fil_only_1",
    });
    const comp1 = await service.completeOrder(admin, {
      orderId: o1.id,
      idempotencyKey: "comp_fil_only_1",
    });
    expect(comp1.order.status).toBe("COMPLETED");
    expect(comp1.order.finishedNetMetalWeight?.toFixed(3)).toBe("9.800");

    // Skipping Free Polish: Filing -> Setting -> Final Polish (even if passed out of order, canonical sequence is enforced)
    const { order: o2, processes: p2 } = await service.createOrder(admin, {
      bagNumber: "BAG-SKIP-FP",
      customerId: customer.id,
      orderName: "STUDDED PENDANT",
      purityId: purity.id,
      selectedProcesses: ["FINAL_POLISH", "FILING", "SETTING"],
    });
    expect(p2.map((p) => p.processType)).toEqual([
      "FILING",
      "SETTING",
      "FINAL_POLISH",
    ]);

    await service.postProcessEntry(admin, {
      orderId: o2.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "9.700",
      idempotencyKey: "skip_fp_1",
    });
    await service.postProcessEntry(admin, {
      orderId: o2.id,
      processType: "SETTING",
      karigarId: karigar.id,
      grossInWeight: "9.700",
      grossOutWeight: "10.100",
      stoneComponents: [{ componentType: "AD", pieces: 5, weightGrams: "0.500" }],
      idempotencyKey: "skip_fp_2",
    });
    await service.postProcessEntry(admin, {
      orderId: o2.id,
      processType: "FINAL_POLISH",
      karigarId: karigar.id,
      grossInWeight: "10.100",
      grossOutWeight: "10.000",
      idempotencyKey: "skip_fp_3",
    });
    const comp2 = await service.completeOrder(admin, {
      orderId: o2.id,
      idempotencyKey: "comp_skip_fp",
    });
    expect(comp2.order.finishedGrossWeight?.toFixed(3)).toBe("10.000");
    expect(comp2.order.finishedStoneWeight?.toFixed(3)).toBe("0.500");
    expect(comp2.order.finishedNetMetalWeight?.toFixed(3)).toBe("9.500");
  });

  it("3. Partial return leaves remaining material in karigar custody (not loss) and blocks premature completion", async () => {
    const { service, admin } = createTestEnvironment();
    const purity = await service.configurePurity(admin, {
      code: "P_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: purity.id,
      physicalWeight: "30.000",
      idempotencyKey: "open_30",
    });
    const customer = await service.createCustomer(admin, { name: "Cust" });
    const karigar = await service.createKarigar(admin, {
      name: "Karigar",
      capabilities: ["FILING"],
    });
    const { order } = await service.createOrder(admin, {
      bagNumber: "BAG-PARTIAL",
      customerId: customer.id,
      orderName: "BANGLE PAIR",
      purityId: purity.id,
      selectedProcesses: ["FILING"],
    });

    // Issue 20g, return 8g partial while retaining 12g in custody (0g loss)
    const partialRes = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "20.000",
      grossOutWeight: "8.000",
      custodyRetainedMetalWeight: "12.000",
      closeProcess: false,
      idempotencyKey: "partial_visit_1",
    });
    expect(partialRes.process.status).toBe("PARTIAL_RETURN");
    expect(partialRes.process.custodyMetalWeight.toFixed(3)).toBe("12.000");
    expect(partialRes.visit.rawLossWeight.toFixed(3)).toBe("0.000");

    // Attempting to complete order while process is PARTIAL_RETURN is blocked
    await expect(
      service.completeOrder(admin, {
        orderId: order.id,
        idempotencyKey: "premature_complete",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("4. Enforces idempotency on duplicate submit, blocks concurrent overspend, and blocks negative loss", async () => {
    const { service, admin } = createTestEnvironment();
    const purity = await service.configurePurity(admin, {
      code: "P_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });
    await service.postOpeningBalance(admin, {
      purityId: purity.id,
      physicalWeight: "25.000",
      idempotencyKey: "open_25",
    });
    const customer = await service.createCustomer(admin, { name: "Cust" });
    const karigar = await service.createKarigar(admin, {
      name: "Karigar",
      capabilities: ["FILING"],
    });
    const { order: o1 } = await service.createOrder(admin, {
      bagNumber: "BAG-IDEM-1",
      customerId: customer.id,
      orderName: "RING 1",
      purityId: purity.id,
      selectedProcesses: ["FILING"],
    });
    const { order: o2 } = await service.createOrder(admin, {
      bagNumber: "BAG-IDEM-2",
      customerId: customer.id,
      orderName: "RING 2",
      purityId: purity.id,
      selectedProcesses: ["FILING"],
    });

    // Duplicate submission with same idempotencyKey only deducts once
    const [dup1, dup2] = await Promise.all([
      service.issueMetalToOrder(admin, {
        orderId: o1.id,
        karigarId: karigar.id,
        metalWeight: "15.000",
        idempotencyKey: "same_key_issue",
      }),
      service.issueMetalToOrder(admin, {
        orderId: o1.id,
        karigarId: karigar.id,
        metalWeight: "15.000",
        idempotencyKey: "same_key_issue",
      }),
    ]);
    expect(dup1.movement.id).toBe(dup2.movement.id);
    const reconAfterDup = await service.getDailyReconciliation(admin);
    expect(reconAfterDup.byPurity[0].adminPhysicalWeight).toBe("10.000");

    // Concurrent issue requests where second exceeds remaining 10.000g stock
    const results = await Promise.allSettled([
      service.issueMetalToOrder(admin, {
        orderId: o2.id,
        karigarId: karigar.id,
        metalWeight: "8.000",
        idempotencyKey: "conc_issue_1",
      }),
      service.issueMetalToOrder(admin, {
        orderId: o2.id,
        karigarId: karigar.id,
        metalWeight: "8.000",
        idempotencyKey: "conc_issue_2",
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Negative loss (metalOut > metalIn) is strictly blocked
    await expect(
      service.postProcessEntry(admin, {
        orderId: o1.id,
        processType: "FILING",
        karigarId: karigar.id,
        grossInWeight: "15.000",
        grossOutWeight: "15.100",
        idempotencyKey: "neg_loss_attempt",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("5. Enforces RBAC, QR redirect preservation, Month filter balance invariance, Duplicate completion prevention, and Controlled reversals", async () => {
    const { service, admin, operator } = createTestEnvironment();

    // Unauthenticated call is blocked
    await expect(
      service.listPurities(null as unknown as ActorContext)
    ).rejects.toThrow(UnauthorizedError);

    const purity = await service.configurePurity(admin, {
      code: "P_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });

    // Operator cannot post unrestricted opening stock or stock receipts
    await expect(
      service.postOpeningBalance(operator, {
        purityId: purity.id,
        physicalWeight: "100.000",
        idempotencyKey: "op_forbidden_open",
      })
    ).rejects.toThrow(ForbiddenError);

    const receiptTx = await service.postStockReceipt(admin, {
      purityId: purity.id,
      physicalWeight: "50.000",
      sourceReference: "BULLION-INV-01",
      businessDate: "2026-10-15",
      idempotencyKey: "rcpt_50",
    });

    const customer = await service.createCustomer(operator, { name: "Cust Oct" });
    const karigar = await service.createKarigar(admin, {
      name: "Karigar Oct",
      capabilities: ["FILING"],
    });

    // Create October order and November order
    const { order: octOrder } = await service.createOrder(operator, {
      bagNumber: "BAG-OCT-1",
      customerId: customer.id,
      orderName: "OCT CHAIN",
      purityId: purity.id,
      orderDate: "2026-10-20",
      selectedProcesses: ["FILING"],
    });
    const { order: novOrder } = await service.createOrder(operator, {
      bagNumber: "BAG-NOV-1",
      customerId: customer.id,
      orderName: "NOV CHAIN",
      purityId: purity.id,
      orderDate: "2026-11-05",
      selectedProcesses: ["FILING"],
    });

    await service.postProcessEntry(operator, {
      orderId: octOrder.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "9.800",
      businessDate: "2026-10-21",
      idempotencyKey: "oct_fil_1",
    });
    await service.completeOrder(operator, {
      orderId: octOrder.id,
      businessDate: "2026-10-21",
      idempotencyKey: "oct_comp_1",
    });

    // Prevent duplicate completion
    await expect(
      service.completeOrder(operator, {
        orderId: octOrder.id,
        idempotencyKey: "oct_comp_dup",
      })
    ).rejects.toThrow(ConflictError);

    // Month filter changes visible rows without altering stock or loss balances
    const octList = await service.listRegisterOrders(operator, {
      monthKey: "2026-10",
    });
    const novList = await service.listRegisterOrders(operator, {
      monthKey: "2026-11",
    });
    expect(octList.rows.length).toBe(1);
    expect(octList.rows[0].order.bagNumber).toBe("BAG-OCT-1");
    expect(novList.rows.length).toBe(1);
    expect(novList.rows[0].order.bagNumber).toBe("BAG-NOV-1");

    const recon = await service.getDailyReconciliation(operator);
    expect(recon.byPurity[0].adminPhysicalWeight).toBe("40.000");
    expect(recon.totals.processLossEligibleFine).toBe("0.184");

    // Unposted order cancels cleanly; posted order cannot be hard-deleted and enters CANCELLATION_PENDING_RECONCILIATION if movements exist
    const cancelledNov = await service.cancelOrder(admin, {
      orderId: novOrder.id,
      reason: "Customer cancelled before issue",
    });
    expect(cancelledNov.status).toBe("CANCELLED");

    // Cannot reverse stock receipt of 50.000g when only 40.000g remains in Admin Stock
    await expect(
      service.reverseUnusedStockReceipt(admin, {
        transactionId: receiptTx.id,
        reason: "Attempt unsafe reversal",
        idempotencyKey: "unsafe_rev_1",
      })
    ).rejects.toThrow(ConflictError);

    // QR target URL preserved across login redirect
    const qrTarget = `/production-register?order=${octOrder.id}`;
    const loginUrl = buildLoginRedirectUrl(qrTarget);
    expect(loginUrl).toBe(
      `/login?redirect=${encodeURIComponent(qrTarget)}`
    );
    expect(sanitizeRedirectPath(qrTarget)).toBe(qrTarget);
    expect(sanitizeRedirectPath("https://evil.example.com")).toBe(
      "/production-register"
    );

    // Spreadsheet formula-injection sanitization
    expect(sanitizeSpreadsheetText("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(sanitizeSpreadsheetText("+cmd|' /C calc'!A0")).toBe(
      "'+cmd|' /C calc'!A0"
    );
  });

  it("6. Additional gold issue in FILING only: cumulative Filing IN, single delta deduction, idempotency, and loss", async () => {
    const { service, admin } = createTestEnvironment();
    const purity = await service.configurePurity(admin, {
      code: "22K_92",
      displayLabel: "22K (92%)",
      karatLabel: "22KT",
      touchPercent: "92.0000",
    });

    // Opening admin stock: 100.000g at 92%
    await service.postOpeningBalance(admin, {
      purityId: purity.id,
      physicalWeight: "100.000",
      idempotencyKey: "add_fil_open_100",
    });

    const customer = await service.createCustomer(admin, {
      name: "Additional Gold Customer",
    });
    const karigar = await service.createKarigar(admin, {
      name: "Filing Master",
      capabilities: ["FILING", "FREE_POLISH"],
    });

    const { order } = await service.createOrder(admin, {
      bagNumber: "BAG-ADD-FIL-1",
      customerId: customer.id,
      orderName: "HEAVY BANGLE",
      purityId: purity.id,
      selectedProcesses: ["FILING", "FREE_POLISH"],
    });

    // Initial filing issue: 10.000g -> admin 90.000g
    await service.addFilingGoldIssue(admin, {
      orderId: order.id,
      additionalWeight: "10.000",
      karigarId: karigar.id,
      idempotencyKey: "fil_issue_1",
    });
    let recon = await service.getDailyReconciliation(admin);
    expect(recon.byPurity[0].adminPhysicalWeight).toBe("90.000");

    // Additional filing issue: 5.000g -> admin 85.000g
    const secondIssue = await service.addFilingGoldIssue(admin, {
      orderId: order.id,
      additionalWeight: "5.000",
      karigarId: karigar.id,
      idempotencyKey: "fil_issue_2",
    });
    expect(secondIssue.cumulativeFilingIn.toFixed(3)).toBe("15.000");

    // Repeating second request with same idempotencyKey must not create another issue
    const duplicateIssue = await service.addFilingGoldIssue(admin, {
      orderId: order.id,
      additionalWeight: "5.000",
      karigarId: karigar.id,
      idempotencyKey: "fil_issue_2",
    });
    expect(duplicateIssue.movement.id).toBe(secondIssue.movement.id);

    recon = await service.getDailyReconciliation(admin);
    expect(recon.byPurity[0].adminPhysicalWeight).toBe("85.000");

    // Reject zero/negative additions and insufficient stock
    await expect(
      service.addFilingGoldIssue(admin, {
        orderId: order.id,
        additionalWeight: "0",
        idempotencyKey: "fil_issue_zero",
      })
    ).rejects.toThrow(ValidationError);

    await expect(
      service.addFilingGoldIssue(admin, {
        orderId: order.id,
        additionalWeight: "90.000",
        idempotencyKey: "fil_issue_over",
      })
    ).rejects.toThrow(ValidationError);

    // Filing IN displays 15.000g with two issue records
    const reg = await service.listRegisterOrders(admin, {
      search: "BAG-ADD-FIL-1",
    });
    expect(reg.rows.length).toBe(1);
    expect(reg.rows[0].filingValidIssuedWeight).toBe("15.000");
    expect(reg.rows[0].filingIssues.length).toBe(2);
    expect(reg.rows[0].filingIssues[0].weightGrams).toBe("10.000");
    expect(reg.rows[0].filingIssues[1].weightGrams).toBe("5.000");

    // Close filing with OUT 14.700g -> filing loss 0.300g, equivalent to 0.276g fine
    const closeRes = await service.postProcessEntry(admin, {
      orderId: order.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "15.000",
      grossOutWeight: "14.700",
      closeProcess: true,
      idempotencyKey: "fil_close_1",
    });
    expect(closeRes.visit.rawLossWeight.toFixed(3)).toBe("0.300");
    expect(closeRes.visit.fineLossWeight.toFixed(3)).toBe("0.276");

    // Cannot add gold after Filing is closed without controlled reopening
    await expect(
      service.addFilingGoldIssue(admin, {
        orderId: order.id,
        additionalWeight: "2.000",
        idempotencyKey: "fil_issue_after_close",
      })
    ).rejects.toThrow(ConflictError);

    // Delete order with full gold rollback (14.700g custody + 0.300g loss = 15.000g back to Admin Stock)
    const delRes = await service.deleteOrderWithRollback(admin, {
      orderId: order.id,
      reason: "Customer cancelled mid-process",
      idempotencyKey: "del_mid_1",
    });
    expect(delRes.order.status).toBe("CANCELLED");
    expect(delRes.rolledBackPhysicalWeight.toFixed(3)).toBe("15.000");

    recon = await service.getDailyReconciliation(admin);
    expect(recon.byPurity[0].adminPhysicalWeight).toBe("100.000");
    expect(recon.totals.karigarCustodyFine).toBe("0.000");
    expect(recon.totals.totalProcessLossFine).toBe("0.000");
    expect(recon.totals.discrepancyFine).toBe("0.000");
  });

  it("A-G. Karigar Recovery: immediate eligibility, multi-order partial, mixed purity, carry-forward, early receipt, excess credit, write-off, undo, idempotency", async () => {
    const { service, admin, operator } = createTestEnvironment();
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
      physicalWeight: "200.000",
      businessDate: "2026-04-01",
      idempotencyKey: "rec_open_92",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_REC",
      name: "Recovery Test Customer",
    });
    const karigarA = await service.createKarigar(admin, {
      karigarCode: "KAR_A",
      name: "Karigar A",
      capabilities: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
    });
    const karigarB = await service.createKarigar(admin, {
      karigarCode: "KAR_B",
      name: "Karigar B",
      capabilities: ["FILING"],
    });

    // Scenario A: Recovery while order continues (Filing & Free Polish closed -> eligible; Setting ongoing -> custody, not eligible)
    const { order: order1 } = await service.createOrder(admin, {
      bagNumber: "BAG-REC-01",
      orderName: "RING-REC-1",
      customerId: customer.id,
      purityId: p92.id,
      selectedProcesses: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
    });
    await service.postProcessEntry(admin, {
      orderId: order1.id,
      processType: "FILING",
      karigarId: karigarA.id,
      grossInWeight: "10.000",
      grossOutWeight: "9.800", // 0.200g loss @ 92% = 0.1840g fine
      closeProcess: true,
      businessDate: "2026-04-05",
      idempotencyKey: "rec_o1_fil",
    });
    await service.postProcessEntry(admin, {
      orderId: order1.id,
      processType: "FREE_POLISH",
      karigarId: karigarA.id,
      grossInWeight: "9.800",
      grossOutWeight: "9.600", // 0.200g loss @ 92% = 0.1840g fine
      closeProcess: true,
      businessDate: "2026-04-06",
      idempotencyKey: "rec_o1_fp",
    });
    // Start Setting without closing (custody = 9.600g, not eligible loss)
    await service.postProcessEntry(admin, {
      orderId: order1.id,
      processType: "SETTING",
      karigarId: karigarA.id,
      grossInWeight: "9.600",
      grossOutWeight: "0.000",
      closeProcess: false,
      businessDate: "2026-04-06",
      idempotencyKey: "rec_o1_set_open",
    });

    let wsA = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigarA.id,
    });
    expect(wsA.eligibleLosses.length).toBe(2);
    expect(wsA.karigarSummaries[0].custodyFineWeight).toBe("8.8320"); // 9.600 * 0.92
    expect(wsA.karigarSummaries[0].eligibleOriginalFine).toBe("0.3680"); // 0.184 + 0.184
    expect(wsA.karigarSummaries[0].outstandingFine).toBe("0.3680");

    // Scenario B: Multiple orders & partial recovery
    const { order: order2 } = await service.createOrder(admin, {
      bagNumber: "BAG-REC-02",
      orderName: "BANGLE-REC-2",
      customerId: customer.id,
      purityId: p92.id,
      selectedProcesses: ["FILING"],
    });
    await service.postProcessEntry(admin, {
      orderId: order2.id,
      processType: "FILING",
      karigarId: karigarA.id,
      grossInWeight: "10.000",
      grossOutWeight: "9.700", // 0.300g loss @ 92% = 0.2760g fine
      closeProcess: true,
      businessDate: "2026-04-07",
      idempotencyKey: "rec_o2_fil",
    });
    wsA = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigarA.id,
    });
    expect(wsA.karigarSummaries[0].outstandingFine).toBe("0.6440"); // 0.3680 + 0.2760

    // Receive 0.500g @ 92% = 0.4600g fine, allocate oldest-first
    const rcpB = await service.recordRecoveryReceipt(admin, {
      karigarId: karigarA.id,
      businessDate: "2026-04-08",
      lines: [{ purityId: p92.id, grossWeight: "0.500", touchPercent: "92" }],
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "rec_rcp_B",
    });
    expect(rcpB.receipt.recoveredFineWeight.toFixed(4)).toBe("0.4600");
    expect(rcpB.receipt.unallocatedFineWeight.toFixed(4)).toBe("0.0000");

    // Idempotency retry must not duplicate receipt or stock
    const rcpBRetry = await service.recordRecoveryReceipt(admin, {
      karigarId: karigarA.id,
      businessDate: "2026-04-08",
      lines: [{ purityId: p92.id, grossWeight: "0.500", touchPercent: "92" }],
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "rec_rcp_B",
    });
    expect(rcpBRetry.receipt.id).toBe(rcpB.receipt.id);

    wsA = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigarA.id,
    });
    expect(wsA.karigarSummaries[0].recoveredFine).toBe("0.4600");
    expect(wsA.karigarSummaries[0].outstandingFine).toBe("0.1840"); // 0.6440 - 0.4600

    // Scenario C: Different received purity (99.9%) settles remaining 92% loss
    // Remaining outstanding is 0.1840g fine. Receive 0.200g @ 99.9% = 0.1998g fine
    const rcpC = await service.recordRecoveryReceipt(admin, {
      karigarId: karigarA.id,
      businessDate: "2026-04-09",
      lines: [
        { purityId: p999.id, grossWeight: "0.200", touchPercent: "99.9" },
      ],
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "rec_rcp_C",
    });
    expect(rcpC.receipt.recoveredFineWeight.toFixed(4)).toBe("0.1998");
    expect(rcpC.receipt.unallocatedFineWeight.toFixed(4)).toBe("0.0158"); // 0.1998 - 0.1840

    // Verify 99.9% admin stock increased by 0.200g and reconciliation balances
    const recon = await service.getDailyReconciliation(admin);
    const p999Row = recon.byPurity.find((r) => r.purityId === p999.id);
    expect(p999Row?.adminPhysicalWeight).toBe("0.200");
    expect(recon.totals.discrepancyFine).toBe("0.000");

    // Scenario D: Independent months carry-forward & older-unpaid warning
    const wsMay = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigarA.id,
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
    });
    expect(wsMay.eligibleLosses.length).toBe(0);
    expect(wsMay.periodReconciliation.openingOutstandingFine).toBe("0.0000");

    // Create a new loss in April for Karigar B and query May -> must show olderUnpaidWarning
    const { order: order3 } = await service.createOrder(admin, {
      bagNumber: "BAG-REC-03",
      orderName: "CHAIN-REC-3",
      customerId: customer.id,
      purityId: p92.id,
      selectedProcesses: ["FILING"],
    });
    const o3Fil = await service.postProcessEntry(admin, {
      orderId: order3.id,
      processType: "FILING",
      karigarId: karigarB.id,
      grossInWeight: "5.000",
      grossOutWeight: "4.900", // 0.100g @ 92% = 0.0920g fine
      closeProcess: true,
      businessDate: "2026-04-10",
      idempotencyKey: "rec_o3_fil",
    });
    const wsBMay = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigarB.id,
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
    });
    expect(wsBMay.olderOutstandingWarning.fineWeight).toBe("0.0920");
    expect(wsBMay.periodReconciliation.openingOutstandingFine).toBe("0.0920");

    // Scenario E & F: Early receipt before loss, then allocate without changing stock; excess credit
    const rcpEarly = await service.recordRecoveryReceipt(admin, {
      karigarId: karigarB.id,
      businessDate: "2026-05-02",
      lines: [{ purityId: p92.id, grossWeight: "0.200", touchPercent: "92" }], // 0.1840g fine
      allocationMode: "NONE",
      idempotencyKey: "rec_early_B",
    });
    expect(rcpEarly.receipt.unallocatedFineWeight.toFixed(4)).toBe("0.1840");

    const stockBeforeAlloc = (await service.getDailyReconciliation(admin)).totals
      .adminAvailableFine;
    const allocB = await service.allocateRecoveryReceipt(admin, {
      recoveryReceiptId: rcpEarly.receipt.id,
      allocations: [
        {
          processLossRecordId: o3Fil.lossRecord!.id,
          allocatedFineWeight: "0.0920",
        },
      ],
      idempotencyKey: "rec_alloc_B1",
    });
    const stockAfterAlloc = (await service.getDailyReconciliation(admin)).totals
      .adminAvailableFine;
    expect(stockAfterAlloc).toBe(stockBeforeAlloc);
    expect(allocB.receipt.unallocatedFineWeight.toFixed(4)).toBe("0.0920");

    // Scenario G: Cross-karigar allocation blocked, operator write-off blocked, undo allocation without stock decrease, write-off without stock increase
    await expect(
      service.allocateRecoveryReceipt(admin, {
        recoveryReceiptId: rcpEarly.receipt.id,
        allocations: [
          {
            processLossRecordId: wsA.eligibleLosses[0].id,
            allocatedFineWeight: "0.0100",
          },
        ],
        idempotencyKey: "rec_cross_kar",
      })
    ).rejects.toThrow();

    await expect(
      service.writeOffProcessLoss(operator, {
        processLossRecordId: o3Fil.lossRecord!.id,
        fineAmount: "0.0100",
        reason: "Operator should be blocked",
        idempotencyKey: "rec_op_wo",
      })
    ).rejects.toThrow();

    // Undo allocation -> restores unallocated credit, reopens loss, no stock change
    const undoRes = await service.undoRecoveryAllocation(admin, {
      allocationId: allocB.allocations[0].id,
      reason: "Undo test",
    });
    expect(undoRes.receipt.unallocatedFineWeight.toFixed(4)).toBe("0.1840");
    expect((await service.getDailyReconciliation(admin)).totals.adminAvailableFine).toBe(
      stockAfterAlloc
    );

    // Write-off 0.0920g fine -> settles loss without increasing admin stock
    await service.writeOffProcessLoss(admin, {
      processLossRecordId: o3Fil.lossRecord!.id,
      fineAmount: "0.0920",
      reason: "Owner approved tolerance",
      idempotencyKey: "rec_wo_B",
    });
    expect((await service.getDailyReconciliation(admin)).totals.adminAvailableFine).toBe(
      stockAfterAlloc
    );
    const wsBFinal = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigarB.id,
    });
    const summaryB = wsBFinal.karigarSummaries.find(
      (s) => s.karigarId === karigarB.id
    )!;
    expect(summaryB.outstandingFine).toBe("0.0000");
    expect(summaryB.writtenOffFine).toBe("0.0920");
    expect(summaryB.unallocatedCreditFine).toBe("0.1840");
  });
});

