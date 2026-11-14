import { describe, expect, it } from "vitest";
import { ErpDomainService } from "../lib/domain/erp-service";
import { InMemoryTransactionalRepository } from "../lib/domain/repository";
import { ActorContext } from "../lib/domain/types";
import { ValidationError } from "../lib/domain/errors";

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

describe("Customer Profile, Fine Gold Receipt, Advance, Statement & Corrections Suite (A-G)", () => {
  it("Enforces one-time owner setting before allowing live customer fine-gold receipts", async () => {
    const { service, admin } = createTestEnv();
    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_UNCONF",
      name: "Unconfigured Test Jewellers",
    });

    const convBefore = await service.getCustomerFineReceiptConvention(admin);
    expect(convBefore.isConfigured).toBe(false);
    expect(convBefore.mode).toBe("UNCONFIGURED");

    await expect(
      service.receiveCustomerFineGold(admin, {
        customerId: customer.id,
        amountReceived: "10.000",
        idempotencyKey: "unconf_rcp_1",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("Test A (Mode A): 10 pending bills totaling 50g fine; receive 55g fine -> all 10 bills settled, customer due = 0g, advance = 5g, admin fine gold increases by 55g once", async () => {
    const { service, admin, repo } = createTestEnv();
    await service.configureCustomerFineReceiptConvention(admin, {
      mode: "FINE_EQUIVALENT",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_A",
      name: "Test A Customer",
    });

    // Create 10 pending bills of 5g fine each (total 50g fine) across multiple months
    for (let i = 1; i <= 10; i++) {
      const month = i <= 5 ? "09" : "10";
      const day = String(i).padStart(2, "0");
      await service.postBillAndDeliver(admin, {
        customerId: customer.id,
        billDate: `2026-${month}-${day}`,
        billType: "MANUAL_COMMERCIAL",
        applyFineAdvance: false,
        lines: [
          {
            lineType: "MANUAL_SERVICE",
            description: `Bill #${i} fine charge`,
            extraFineCharge: "5.0000",
          },
        ],
        idempotencyKey: `test_a_bill_${i}`,
      });
    }

    // Preview receiving 55g fine
    const preview = await service.previewCustomerFineGoldReceipt(admin, {
      customerId: customer.id,
      amountReceived: "55.0000",
      allocationMode: "OLDEST_FIRST",
    });
    expect(preview.currentGoldDue).toBe("50.0000");
    expect(preview.fineAmountCredited).toBe("55.0000");
    expect(preview.amountSettlingBills).toBe("50.0000");
    expect(preview.remainingDue).toBe("0.0000");
    expect(preview.advanceRemainingAfterSettlement).toBe("5.0000");
    expect(preview.goldAddedToAdminStock.fineEquivalentGrams).toBe("55.0000");
    expect(preview.goldAddedToAdminStock.physicalGrams).toBeNull();

    // Confirm Receipt of 55g fine
    const res = await service.receiveCustomerFineGold(admin, {
      customerId: customer.id,
      amountReceived: "55.0000",
      businessDate: "2026-11-01",
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "test_a_rcp_55",
    });

    expect(res.receipt.totalFineWeight.toFixed(4)).toBe("55.0000");
    expect(res.receipt.unallocatedFineWeight.toFixed(4)).toBe("5.0000");
    expect(res.receipt.physicalWeightProvided).toBe(false);
    expect(res.receipt.totalGrossWeight.toFixed(3)).toBe("0.000");
    expect(res.allocations.length).toBe(10);

    const profile = await service.getCustomerProfileWorkspace(
      admin,
      customer.id
    );
    expect(profile.summaryCards.goldDue).toBe("0.0000");
    expect(profile.summaryCards.advanceAvailable).toBe("5.0000");
    expect(profile.summaryCards.totalGoldReceivedHistorical).toBe("55.0000");
    expect(profile.bills.every((b) => b.status === "SETTLED")).toBe(true);

    // Verify Admin Fine Gold stock increased ONCE by 55g fine equivalent (no second stock receipt for advance or allocations)
    const jtxs = await repo.runInTransaction((tx) =>
      tx.listJournalTransactions(admin.organizationId)
    );
    const receiptJtxs = jtxs.filter(
      (j) => j.transactionType === "CUSTOMER_GOLD_RECEIPT"
    );
    expect(receiptJtxs.length).toBe(1);

    const accounts = await repo.runInTransaction((tx) =>
      tx.listStockAccounts(admin.organizationId)
    );
    const adminFineAcct = accounts.find(
      (a) => a.accountCode === "ADMIN_POOL_ADMIN_FINE_GOLD"
    )!;
    expect(adminFineAcct.cachedFineBalance.toFixed(4)).toBe("55.0000");
    expect(adminFineAcct.cachedPhysicalBalance.toFixed(3)).toBe("0.000");
  });

  it("Test B (Mode A): Customer has 5g advance; create a new 20g fine bill and apply advance -> 5g applied, remaining bill due = 15g, customer due = 15g, customer advance = 0g, no new stock inflow created", async () => {
    const { service, admin, repo } = createTestEnv();
    await service.configureCustomerFineReceiptConvention(admin, {
      mode: "FINE_EQUIVALENT",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_B",
      name: "Test B Customer",
    });

    // Customer starts with 5g advance
    await service.receiveCustomerFineGold(admin, {
      customerId: customer.id,
      amountReceived: "5.0000",
      businessDate: "2026-11-01",
      idempotencyKey: "test_b_adv_5",
    });

    const jtxCountBeforeBill = (
      await repo.runInTransaction((tx) =>
        tx.listJournalTransactions(admin.organizationId)
      )
    ).length;

    // Create a new 20g fine bill and apply advance
    const billRes = await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      billDate: "2026-11-05",
      billType: "MANUAL_COMMERCIAL",
      applyFineAdvance: true,
      lines: [
        {
          lineType: "MANUAL_SERVICE",
          description: "New 20g fine charge",
          extraFineCharge: "20.0000",
        },
      ],
      idempotencyKey: "test_b_bill_20",
    });

    expect(billRes.bill.totalFineGold.toFixed(4)).toBe("20.0000");
    expect(billRes.bill.appliedAdvanceFineSnapshot?.toFixed(4)).toBe("5.0000");
    expect(billRes.bill.closingFineDueSnapshot?.toFixed(4)).toBe("15.0000");
    expect(billRes.bill.remainingAdvanceFineSnapshot?.toFixed(4)).toBe(
      "0.0000"
    );

    const profile = await service.getCustomerProfileWorkspace(
      admin,
      customer.id
    );
    expect(profile.summaryCards.goldDue).toBe("15.0000");
    expect(profile.summaryCards.advanceAvailable).toBe("0.0000");
    expect(profile.bills[0].originalFineCharge).toBe("20.0000");
    expect(profile.bills[0].settledFine).toBe("5.0000");
    expect(profile.bills[0].remainingFine).toBe("15.0000");
    expect(profile.bills[0].status).toBe("PARTIALLY_SETTLED");

    // No new stock inflow created when applying existing advance
    const jtxAfterBill = await repo.runInTransaction((tx) =>
      tx.listJournalTransactions(admin.organizationId)
    );
    expect(jtxAfterBill.length).toBe(jtxCountBeforeBill);
  });

  it("Test C (Mode A): Customer owes 50g fine; receive 45g fine -> admin fine gold increases by 45g, 45g allocated oldest first, customer due = 5g, customer advance = 0g", async () => {
    const { service, admin, repo } = createTestEnv();
    await service.configureCustomerFineReceiptConvention(admin, {
      mode: "FINE_EQUIVALENT",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_C",
      name: "Test C Customer",
    });

    // Two bills: 30g (oldest) and 20g (newer) = 50g total due
    const bill1Res = await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      billDate: "2026-10-01",
      billType: "MANUAL_COMMERCIAL",
      applyFineAdvance: false,
      lines: [
        {
          lineType: "MANUAL_SERVICE",
          description: "Oldest Bill 30g",
          extraFineCharge: "30.0000",
        },
      ],
      idempotencyKey: "test_c_bill_1",
    });
    const bill2Res = await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      billDate: "2026-10-15",
      billType: "MANUAL_COMMERCIAL",
      applyFineAdvance: false,
      lines: [
        {
          lineType: "MANUAL_SERVICE",
          description: "Second Bill 20g",
          extraFineCharge: "20.0000",
        },
      ],
      idempotencyKey: "test_c_bill_2",
    });

    // Receive 45g fine
    await service.receiveCustomerFineGold(admin, {
      customerId: customer.id,
      amountReceived: "45.0000",
      businessDate: "2026-11-01",
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "test_c_rcp_45",
    });

    const profile = await service.getCustomerProfileWorkspace(
      admin,
      customer.id
    );
    expect(profile.summaryCards.goldDue).toBe("5.0000");
    expect(profile.summaryCards.advanceAvailable).toBe("0.0000");

    const oldestBill = profile.bills.find((b) => b.id === bill1Res.bill.id)!;
    const secondBill = profile.bills.find((b) => b.id === bill2Res.bill.id)!;
    expect(oldestBill.settledFine).toBe("30.0000");
    expect(oldestBill.remainingFine).toBe("0.0000");
    expect(oldestBill.status).toBe("SETTLED");

    expect(secondBill.settledFine).toBe("15.0000");
    expect(secondBill.remainingFine).toBe("5.0000");
    expect(secondBill.status).toBe("PARTIALLY_SETTLED");

    const accounts = await repo.runInTransaction((tx) =>
      tx.listStockAccounts(admin.organizationId)
    );
    const adminFineAcct = accounts.find(
      (a) => a.accountCode === "ADMIN_POOL_ADMIN_FINE_GOLD"
    )!;
    expect(adminFineAcct.cachedFineBalance.toFixed(4)).toBe("45.0000");
  });

  it("Test D (Mode A): Customer owes 5g fine from a previous bill; create a new 20g fine bill -> new bill charge = 20g, previous outstanding = 5g, total customer payable = 25g, ledger is not charged an extra 5g", async () => {
    const { service, admin } = createTestEnv();
    await service.configureCustomerFineReceiptConvention(admin, {
      mode: "FINE_EQUIVALENT",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_D",
      name: "Test D Customer",
    });

    await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      billDate: "2026-10-10",
      billType: "MANUAL_COMMERCIAL",
      applyFineAdvance: false,
      lines: [
        {
          lineType: "MANUAL_SERVICE",
          description: "Previous Bill 5g",
          extraFineCharge: "5.0000",
        },
      ],
      idempotencyKey: "test_d_bill_prev",
    });

    const newBillRes = await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      billDate: "2026-11-10",
      billType: "MANUAL_COMMERCIAL",
      applyFineAdvance: true,
      lines: [
        {
          lineType: "MANUAL_SERVICE",
          description: "New Bill 20g",
          extraFineCharge: "20.0000",
        },
      ],
      idempotencyKey: "test_d_bill_new",
    });

    expect(newBillRes.bill.totalFineGold.toFixed(4)).toBe("20.0000");
    expect(newBillRes.bill.historicalFineBalance.toFixed(4)).toBe("5.0000");
    expect(newBillRes.bill.closingFineDueSnapshot?.toFixed(4)).toBe("25.0000");

    const profile = await service.getCustomerProfileWorkspace(
      admin,
      customer.id
    );
    // Total customer payable is 25g (not 30g! The previous 5g was not posted a second time)
    expect(profile.summaryCards.goldDue).toBe("25.0000");
    const newBillRow = profile.bills.find(
      (b) => b.id === newBillRes.bill.id
    )!;
    expect(newBillRow.originalFineCharge).toBe("20.0000");
    expect(newBillRow.remainingFine).toBe("20.0000");
    expect(newBillRow.issuedSnapshot.previousOutstandingFine).toBe("5.0000");
    expect(newBillRow.issuedSnapshot.newBillChargeFine).toBe("20.0000");
    expect(newBillRow.issuedSnapshot.totalOutstandingAfterIssuanceFine).toBe(
      "25.0000"
    );
  });

  it("Test E (Mode A): Customer has no bills; receive 10g fine as advance -> customer advance = 10g, customer due = 0g, admin fine gold increases by 10g fine equivalent", async () => {
    const { service, admin, repo } = createTestEnv();
    await service.configureCustomerFineReceiptConvention(admin, {
      mode: "FINE_EQUIVALENT",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_E",
      name: "Test E Customer",
    });

    await service.receiveCustomerFineGold(admin, {
      customerId: customer.id,
      amountReceived: "10.0000",
      businessDate: "2026-11-01",
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "test_e_adv_10",
    });

    const profile = await service.getCustomerProfileWorkspace(
      admin,
      customer.id
    );
    expect(profile.summaryCards.goldDue).toBe("0.0000");
    expect(profile.summaryCards.advanceAvailable).toBe("10.0000");
    expect(profile.summaryCards.totalGoldReceivedHistorical).toBe("10.0000");

    const accounts = await repo.runInTransaction((tx) =>
      tx.listStockAccounts(admin.organizationId)
    );
    const adminFineAcct = accounts.find(
      (a) => a.accountCode === "ADMIN_POOL_ADMIN_FINE_GOLD"
    )!;
    expect(adminFineAcct.cachedFineBalance.toFixed(4)).toBe("10.0000");
  });

  it("Test F (Mode B — 99.9% fixed touch): Receive 55g physical fine gold against 50g due -> credited fine = 54.945g, 50g settles bills, 4.945g becomes advance, physical/touch/fine stored", async () => {
    const { service, admin, repo } = createTestEnv();
    await service.configureCustomerFineReceiptConvention(admin, {
      mode: "PHYSICAL_AT_CONFIGURED_TOUCH",
      configuredTouch: "99.9",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_F",
      name: "Test F Customer",
    });

    await service.postBillAndDeliver(admin, {
      customerId: customer.id,
      billDate: "2026-10-20",
      billType: "MANUAL_COMMERCIAL",
      applyFineAdvance: false,
      lines: [
        {
          lineType: "MANUAL_SERVICE",
          description: "50g fine bill",
          extraFineCharge: "50.0000",
        },
      ],
      idempotencyKey: "test_f_bill_50",
    });

    const preview = await service.previewCustomerFineGoldReceipt(admin, {
      customerId: customer.id,
      amountReceived: "55.000",
      allocationMode: "OLDEST_FIRST",
    });
    expect(preview.physicalWeight).toBe("55.000");
    expect(preview.touchPercent).toBe("99.90");
    expect(preview.fineAmountCredited).toBe("54.9450");
    expect(preview.amountSettlingBills).toBe("50.0000");
    expect(preview.remainingDue).toBe("0.0000");
    expect(preview.advanceRemainingAfterSettlement).toBe("4.9450");

    const rcpRes = await service.receiveCustomerFineGold(admin, {
      customerId: customer.id,
      amountReceived: "55.000",
      businessDate: "2026-11-02",
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "test_f_rcp_55",
    });

    expect(rcpRes.receipt.totalGrossWeight.toFixed(3)).toBe("55.000");
    expect(rcpRes.receipt.totalFineWeight.toFixed(4)).toBe("54.9450");
    expect(rcpRes.receipt.unallocatedFineWeight.toFixed(4)).toBe("4.9450");
    expect(rcpRes.lines[0].grossWeight.toFixed(3)).toBe("55.000");
    expect(rcpRes.lines[0].touchPercent.toFixed(2)).toBe("99.90");
    expect(rcpRes.lines[0].fineWeight.toFixed(4)).toBe("54.9450");

    // Changing convention later must NOT recalculate previous receipts
    await service.configureCustomerFineReceiptConvention(admin, {
      mode: "FINE_EQUIVALENT",
    });

    const profile = await service.getCustomerProfileWorkspace(
      admin,
      customer.id
    );
    expect(profile.summaryCards.goldDue).toBe("0.0000");
    expect(profile.summaryCards.advanceAvailable).toBe("4.9450");
    expect(profile.transactionHistory.goldReceipts[0].totalFineWeight).toBe(
      "54.9450"
    );

    const accounts = await repo.runInTransaction((tx) =>
      tx.listStockAccounts(admin.organizationId)
    );
    const fine999Acct = accounts.find(
      (a) => a.accountCode === "ADMIN_POOL_FINE_99_9"
    )!;
    expect(fine999Acct.cachedPhysicalBalance.toFixed(3)).toBe("55.000");
    expect(fine999Acct.cachedFineBalance.toFixed(4)).toBe("54.9450");
  });

  it("Test G: Concurrency protection on advance, undo allocation, outbound advance refund, historical bill snapshot preservation, and month-filtered statement accuracy", async () => {
    const { service, admin, repo } = createTestEnv();
    await service.configureCustomerFineReceiptConvention(admin, {
      mode: "FINE_EQUIVALENT",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "CUST_G",
      name: "Test G Customer",
    });

    // 1. Receive 5g fine advance in October
    await service.receiveCustomerFineGold(admin, {
      customerId: customer.id,
      amountReceived: "5.0000",
      businessDate: "2026-10-05",
      idempotencyKey: "test_g_adv_5",
    });

    // 2. Simultaneously post two 20g bills that both attempt to auto-apply the 5g advance
    const [b1, b2] = await Promise.all([
      service.postBillAndDeliver(admin, {
        customerId: customer.id,
        billDate: "2026-10-10",
        billType: "MANUAL_COMMERCIAL",
        applyFineAdvance: true,
        lines: [
          {
            lineType: "MANUAL_SERVICE",
            description: "Concurrent Bill 1",
            extraFineCharge: "20.0000",
          },
        ],
        idempotencyKey: "test_g_conc_bill_1",
      }),
      service.postBillAndDeliver(admin, {
        customerId: customer.id,
        billDate: "2026-10-10",
        billType: "MANUAL_COMMERCIAL",
        applyFineAdvance: true,
        lines: [
          {
            lineType: "MANUAL_SERVICE",
            description: "Concurrent Bill 2",
            extraFineCharge: "20.0000",
          },
        ],
        idempotencyKey: "test_g_conc_bill_2",
      }),
    ]);

    const totalAdvanceConsumed = b1.bill
      .appliedAdvanceFineSnapshot!.add(b2.bill.appliedAdvanceFineSnapshot!)
      .toFixed(4);
    // Advance of 5g must be consumed only ONCE across both concurrent bills!
    expect(totalAdvanceConsumed).toBe("5.0000");

    let profile = await service.getCustomerProfileWorkspace(admin, customer.id);
    // Total billed = 40g, advance applied = 5g -> remaining due = 35g, advance = 0g
    expect(profile.summaryCards.goldDue).toBe("35.0000");
    expect(profile.summaryCards.advanceAvailable).toBe("0.0000");

    // 3. Old bills preserve their original issued snapshot even after later payments occur
    const b1IssuedHtmlBefore = b1.bill.previewHtml;
    const b1SnapshotDueBefore = b1.bill.closingFineDueSnapshot?.toFixed(4);

    // Receive 45g fine in November (settles 35g due and leaves 10g advance)
    await service.receiveCustomerFineGold(admin, {
      customerId: customer.id,
      amountReceived: "45.0000",
      businessDate: "2026-11-05",
      allocationMode: "OLDEST_FIRST",
      idempotencyKey: "test_g_rcp_nov_45",
    });

    profile = await service.getCustomerProfileWorkspace(admin, customer.id);
    expect(profile.summaryCards.goldDue).toBe("0.0000");
    expect(profile.summaryCards.advanceAvailable).toBe("10.0000");

    const b1AfterLaterPayment = profile.bills.find(
      (x) => x.id === b1.bill.id
    )!;
    // Live status is SETTLED, but original issued snapshot & previewHtml remain unchanged!
    expect(b1AfterLaterPayment.livePaymentStatus.liveSettlementStatus).toBe(
      "SETTLED"
    );
    expect(b1AfterLaterPayment.previewHtml).toBe(b1IssuedHtmlBefore);
    expect(
      b1AfterLaterPayment.issuedSnapshot.totalOutstandingAfterIssuanceFine
    ).toBe(b1SnapshotDueBefore);

    // 4. Undoing a bill allocation restores receipt credit and reopens the bill without moving stock
    const activeAlloc = profile.transactionHistory.allocations.find(
      (a) => a.status === "ACTIVE" && a.billId === b1.bill.id
    )!;
    const jtxCountBeforeUndo = (
      await repo.runInTransaction((tx) =>
        tx.listJournalTransactions(admin.organizationId)
      )
    ).length;

    await service.undoCustomerPaymentAllocation(admin, {
      allocationId: activeAlloc.id,
      reason: "Test undo allocation",
    });

    const jtxCountAfterUndo = (
      await repo.runInTransaction((tx) =>
        tx.listJournalTransactions(admin.organizationId)
      )
    ).length;
    expect(jtxCountAfterUndo).toBe(jtxCountBeforeUndo); // No physical stock moved!

    profile = await service.getCustomerProfileWorkspace(admin, customer.id);
    expect(profile.summaryCards.goldDue).toBe(activeAlloc.allocatedFineWeight);
    expect(Number(profile.summaryCards.advanceAvailable)).toBeCloseTo(
      10 + Number(activeAlloc.allocatedFineWeight),
      4
    );

    // 5. Refunding an advance reduces available credit and reduces Admin Fine Gold stock
    const refundRes = await service.refundCustomerGoldAdvance(admin, {
      customerId: customer.id,
      refundFineWeight: "4.0000",
      businessDate: "2026-11-12",
      reason: "Returned 4g fine advance to customer",
      idempotencyKey: "test_g_refund_4",
    });
    expect(refundRes.refundedFineWeight).toBe("4.0000");

    const accounts = await repo.runInTransaction((tx) =>
      tx.listStockAccounts(admin.organizationId)
    );
    const adminFineAcct = accounts.find(
      (a) => a.accountCode === "ADMIN_POOL_ADMIN_FINE_GOLD"
    )!;
    // Received 5g + 45g = 50g fine; refunded 4g fine -> 46g fine in Admin Fine Gold stock
    expect(adminFineAcct.cachedFineBalance.toFixed(4)).toBe("46.0000");

    // 6. Customer Statement with Month Filter (2026-11) preserves October opening due (35g) and never double-counts allocations
    const novProfile = await service.getCustomerProfileWorkspace(
      admin,
      customer.id,
      { monthFilter: "2026-11" }
    );
    expect(novProfile.statement.openingDues).toBe("35.0000");
    // In November only 45g was actually received (allocations are not added a second time!)
    expect(novProfile.statement.periodTotalActualGoldReceived).toBe("45.0000");
  });
});
