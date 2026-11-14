import { describe, expect, it } from "vitest";
import { ErpDomainService } from "../lib/domain/erp-service";
import { InMemoryTransactionalRepository } from "../lib/domain/repository";
import { ActorContext } from "../lib/domain/types";
import { ConflictError } from "../lib/domain/errors";

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

describe("Billing & Customer Settlement Acceptance Suite (A-G)", () => {
  it("A & B. Combined multi-touch bill (92% + 75.5%), finished goods delivery, making diff, advance & partial collections", async () => {
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
    const p95 = await service.configurePurity(admin, {
      code: "95_PCT",
      displayLabel: "95%",
      karatLabel: "95",
      touchPercent: "95.0000",
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
      businessDate: "2026-04-01",
      idempotencyKey: "bill_open_92",
    });
    await service.postOpeningBalance(admin, {
      purityId: p755.id,
      physicalWeight: "50.000",
      businessDate: "2026-04-01",
      idempotencyKey: "bill_open_755",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_B1",
      name: "Asha Jewels",
      phone: "9998887776",
    });
    const karigar = await service.createKarigar(admin, {
      karigarCode: "KAR_B1",
      name: "Ramesh Karigar",
      capabilities: ["FILING"],
    });

    // Order A: 20.000g -> 19.200g net @ 92% (0.800g loss)
    const { order: orderA } = await service.createOrder(admin, {
      bagNumber: "BAG-A",
      orderName: "NECKLACE-A",
      customerId: customer.id,
      purityId: p92.id,
      selectedProcesses: ["FILING"],
    });
    await service.postProcessEntry(admin, {
      orderId: orderA.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "20.000",
      grossOutWeight: "19.200",
      closeProcess: true,
      idempotencyKey: "bill_a_fil",
    });
    await service.completeOrder(admin, { orderId: orderA.id, idempotencyKey: "comp_a" });

    // Order B: 10.500g -> 10.000g net @ 75.5% (0.500g loss)
    const { order: orderB } = await service.createOrder(admin, {
      bagNumber: "BAG-B",
      orderName: "RING-B",
      customerId: customer.id,
      purityId: p755.id,
      selectedProcesses: ["FILING"],
    });
    await service.postProcessEntry(admin, {
      orderId: orderB.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.500",
      grossOutWeight: "10.000",
      closeProcess: true,
      idempotencyKey: "bill_b_fil",
    });
    await service.completeOrder(admin, { orderId: orderB.id, idempotencyKey: "comp_b" });

    // Scenario B setup: Existing advance 5.000g @ 99.9% = 4.995g fine
    const advRcp = await service.recordCustomerGoldReceipt(admin, {
      customerId: customer.id,
      businessDate: "2026-04-02",
      lines: [{ purityId: p999.id, grossWeight: "5.000", touchPercent: "99.9" }],
      allocationMode: "NONE",
      idempotencyKey: "bill_adv_5g",
    });
    expect(advRcp.receipt.totalFineWeight.toFixed(3)).toBe("4.995");

    const reconBeforeBill = await service.getDailyReconciliation(admin);
    const adminStockBeforeBill = reconBeforeBill.totals.adminAvailableFine;

    // Post combined bill for Order A (3 pts making) + Order B (2 pts making) and apply advance
    const postRes = await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      billDate: "2026-04-05",
      applyFineAdvance: true,
      lines: [
        { orderId: orderA.id, billingBasis: "NET_METAL", makingPercentagePoints: "3" },
        { orderId: orderB.id, billingBasis: "NET_METAL", makingPercentagePoints: "2" },
      ],
      idempotencyKey: "bill_post_ab",
    });

    expect(postRes.bill.totalFineGold.toFixed(3)).toBe("25.990");
    expect(postRes.bill.deliveredFineMetal.toFixed(3)).toBe("25.214");
    expect(postRes.bill.commercialMakingFine.toFixed(3)).toBe("0.776");
    expect(postRes.bill.deliveryStatus).toBe("DELIVERED");
    expect(postRes.bill.settlementStatus).toBe("PARTIALLY_SETTLED");
    expect(postRes.bill.previewHtml).toContain("BAG-A");
    expect(postRes.bill.previewHtml).toContain("BAG-B");

    // Admin stock must NOT change on bill posting or advance application
    const reconAfterBill = await service.getDailyReconciliation(admin);
    expect(reconAfterBill.totals.adminAvailableFine).toBe(adminStockBeforeBill);
    expect(reconAfterBill.totals.finishedGoodsFine).toBe("0.000");
    expect(reconAfterBill.totals.discrepancyFine).toBe("0.000");

    // Karigar loss balance must remain unchanged
    const recWs = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigar.id,
    });
    expect(recWs.karigarSummaries[0].outstandingFine).toBe("1.1135"); // 0.8*0.92 + 0.5*0.755 = 0.736 + 0.3775

    // Remaining after 4.995g advance = 20.995g fine
    let billWs = await service.getBillingWorkspace(admin, { customerId: customer.id });
    expect(Number(billWs.customerSummaries[0].fineOwed).toFixed(3)).toBe("20.995");

    // Receive 10.000g @ 95% = 9.500g fine -> Remaining = 11.495g
    await service.recordCustomerGoldReceipt(admin, {
      customerId: customer.id,
      businessDate: "2026-04-06",
      lines: [{ purityId: p95.id, grossWeight: "10.000", touchPercent: "95" }],
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "bill_col_10g_95",
    });
    billWs = await service.getBillingWorkspace(admin, { customerId: customer.id });
    expect(Number(billWs.customerSummaries[0].fineOwed).toFixed(3)).toBe("11.495");

    // Receive 12.000g @ 99.9% = 11.988g fine -> Settles 11.495g, credit = 0.493g
    await service.recordCustomerGoldReceipt(admin, {
      customerId: customer.id,
      businessDate: "2026-04-07",
      lines: [{ purityId: p999.id, grossWeight: "12.000", touchPercent: "99.9" }],
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "bill_col_12g_999",
    });
    billWs = await service.getBillingWorkspace(admin, { customerId: customer.id });
    expect(Number(billWs.customerSummaries[0].fineOwed).toFixed(3)).toBe("0.000");
    expect(Number(billWs.customerSummaries[0].fineAdvance).toFixed(3)).toBe("0.493");
    expect(billWs.bills[0].settlementStatus).toBe("SETTLED");

    // Final daily reconciliation stays balanced
    const finalRecon = await service.getDailyReconciliation(admin);
    expect(finalRecon.totals.discrepancyFine).toBe("0.000");
  });

  it("C, D, E, F. Historical balance, eligibility/concurrency, independent recovery, cancellation after payment, and previews", async () => {
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
      idempotencyKey: "cdef_open",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_CDEF",
      name: "Very Long Customer Name For Preview Wrap Verification Pvt Ltd",
      address: "123 Patavadi Chowk, Old City Jewellery Market, Ahmedabad",
    });
    const karigar = await service.createKarigar(admin, {
      karigarCode: "KAR_CDEF",
      name: "Mohan",
      capabilities: ["FILING", "FREE_POLISH"],
    });

    // Scenario C: Previous outstanding 4.000g via manual commercial bill, then new 12.000g bill -> displays 16.000g, adds 12.000g only
    await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      billType: "MANUAL_COMMERCIAL",
      lines: [
        {
          lineType: "MANUAL_FINE_CHARGE",
          description: "Opening commercial fine balance",
          extraFineCharge: "4.000",
        },
      ],
      idempotencyKey: "hist_4g",
    });
    const bill12 = await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      billType: "MANUAL_COMMERCIAL",
      notes: "Long notes check: All gold weights verified at 92% standard touch.",
      lines: [
        {
          lineType: "MANUAL_FINE_CHARGE",
          description: "Additional design & mould fine charge",
          extraFineCharge: "12.000",
        },
      ],
      idempotencyKey: "hist_12g",
    });
    expect(bill12.bill.historicalFineBalance.toFixed(3)).toBe("4.000");
    expect(bill12.bill.totalFineGold.toFixed(3)).toBe("12.000");
    expect(bill12.bill.previewHtml).toContain("4.000 g");
    expect(bill12.bill.previewHtml).toContain("16.000 g");
    const wsAfter12 = await service.getBillingWorkspace(admin, { customerId: customer.id });
    expect(Number(wsAfter12.customerSummaries[0].fineOwed).toFixed(3)).toBe("16.000");

    // Scenario D & E: 3 completed, 2 incomplete; recover filing loss before completion; duplicate & double-bill blocked
    const { order: ordComp1 } = await service.createOrder(admin, {
      bagNumber: "BAG-C1",
      orderName: "Completed 1",
      customerId: customer.id,
      purityId: p92.id,
      selectedProcesses: ["FILING", "FREE_POLISH"],
    });
    await service.postProcessEntry(admin, {
      orderId: ordComp1.id,
      processType: "FILING",
      karigarId: karigar.id,
      grossInWeight: "10.000",
      grossOutWeight: "9.800", // 0.200g @ 92% = 0.184g fine
      closeProcess: true,
      idempotencyKey: "c1_fil",
    });

    // Scenario E: Recover filing loss BEFORE order completes!
    await service.recordRecoveryReceipt(admin, {
      karigarId: karigar.id,
      lines: [{ purityId: p92.id, grossWeight: "0.200", touchPercent: "92" }],
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "e_rec_before_complete",
    });

    await service.postProcessEntry(admin, {
      orderId: ordComp1.id,
      processType: "FREE_POLISH",
      karigarId: karigar.id,
      grossInWeight: "9.800",
      grossOutWeight: "9.700",
      closeProcess: true,
      idempotencyKey: "c1_fp",
    });
    await service.completeOrder(admin, { orderId: ordComp1.id, idempotencyKey: "comp_c1" });

    // Incomplete order
    const { order: ordInc } = await service.createOrder(admin, {
      bagNumber: "BAG-INC",
      orderName: "Ongoing Order",
      customerId: customer.id,
      purityId: p92.id,
      selectedProcesses: ["FILING"],
    });

    // Cannot bill incomplete order
    await expect(
      service.postBillAndDeliver(admin, {
        customerId: customer.id,
        lines: [{ orderId: ordInc.id }],
        idempotencyKey: "fail_inc",
      })
    ).rejects.toThrow(ConflictError);

    // Post completed order bill + idempotent retry
    const bComp = await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      lines: [{ orderId: ordComp1.id, makingPercentagePoints: "2" }],
      idempotencyKey: "post_c1",
    });
    const bCompRetry = await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      lines: [{ orderId: ordComp1.id, makingPercentagePoints: "2" }],
      idempotencyKey: "post_c1",
    });
    expect(bCompRetry.bill.id).toBe(bComp.bill.id);

    // Second billing attempt with different idempotencyKey must be blocked
    await expect(
      service.postBillAndDeliver(admin, {
        customerId: customer.id,
        lines: [{ orderId: ordComp1.id, makingPercentagePoints: "2" }],
        idempotencyKey: "post_c1_second_attempt",
      })
    ).rejects.toThrow(ConflictError);

    // Verify recovery history & filing loss remained settled (0.1840g recovered)
    const recAfterBill = await service.getKarigarRecoveryWorkspace(admin, {
      karigarId: karigar.id,
    });
    expect(recAfterBill.karigarSummaries[0].recoveredFine).toBe("0.1840");

    // Scenario F: Receive payment on bComp, then cancel commercially -> preserves gold received, releases allocation to credit, keeps delivery intact
    await service.recordCustomerGoldReceipt(admin, {
      customerId: customer.id,
      lines: [{ purityId: p92.id, grossWeight: "5.000", touchPercent: "92" }], // 4.600g fine
      allocationMode: "MANUAL",
      manualAllocations: [{ billId: bComp.bill.id, allocatedFineWeight: "4.600" }],
      idempotencyKey: "f_pay_5g",
    });

    const fgBeforeCancel = (await service.getDailyReconciliation(admin)).totals.finishedGoodsFine;
    const cancelRes = await service.cancelPostedBill(admin, {
      billId: bComp.bill.id,
      reason: "Customer requested commercial credit note",
    });
    expect(cancelRes.bill.status).toBe("CANCELLED");
    expect(cancelRes.releasedAllocations).toBe(1);
    expect(cancelRes.bill.previewHtml).toContain("CANCELLED / CREDITED");

    // Finished goods NOT restored automatically; 4.600g fine preserved as customer credit
    expect((await service.getDailyReconciliation(admin)).totals.finishedGoodsFine).toBe(fgBeforeCancel);
    const wsFinal = await service.getBillingWorkspace(admin, { customerId: customer.id });
    expect(Number(wsFinal.customerSummaries[0].fineAdvance).toFixed(3)).toBe("4.600");
  });
});
