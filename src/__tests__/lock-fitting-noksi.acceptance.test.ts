import { describe, expect, it } from "vitest";
import {
  ActorContext,
  ErpDomainService,
  InMemoryTransactionalRepository,
} from "../lib/domain";

describe("Lock-Fitting Any-to-Any Routing & Noksi Outsource Acceptance", () => {
  it("handles client live example: Filing -> Free Polish -> Setting -> Filing (Lock Fitting +0.018g) -> Noksi (Chol + Immediate Settlement) -> Complete", async () => {
    const repo = new InMemoryTransactionalRepository();
    const service = new ErpDomainService(repo);
    const orgId = "org_test";

    const admin: ActorContext = {
      userId: "u_admin",
      organizationId: orgId,
      role: "OWNER_ADMIN",
      email: "admin@am.local",
      name: "Admin",
    };

    const purity22k = await service.configurePurity(admin, {
      code: "22K",
      displayLabel: "22K (92%)",
      karatLabel: "22K",
      touchPercent: "92",
    });

    await service.postOpeningBalance(admin, {
      purityId: purity22k.id,
      physicalWeight: "50.000",
      businessDate: "2026-11-18",
      idempotencyKey: "open_22k",
    });

    const customer = await service.createCustomer(admin, {
      customerCode: "C01",
      name: "Test Customer",
    });

    const hasan = await service.createKarigar(admin, {
      karigarCode: "K_HASAN",
      name: "Hasan Bhai",
      capabilities: ["FILING"],
    });
    const boro = await service.createKarigar(admin, {
      karigarCode: "K_BORO",
      name: "Boro",
      capabilities: ["FREE_POLISH"],
    });
    const josim = await service.createKarigar(admin, {
      karigarCode: "K_JOSIM",
      name: "Josim",
      capabilities: ["SETTING"],
    });
    const noksiShop = await service.createKarigar(admin, {
      karigarCode: "K_NOKSI",
      name: "Noksi Shop",
      capabilities: ["NOKSI"],
    });

    // Create Order with 11.641 + 1.170 = 12.811g issued to Filing
    const created = await service.createOrder(admin, {
      bagNumber: "901",
      customerId: customer.id,
      orderName: "Live Ring",
      purityId: purity22k.id,
      selectedProcesses: ["FILING", "FREE_POLISH", "SETTING", "FINAL_POLISH"],
      orderDate: "2026-11-18",
    });

    await service.issueMetalToOrder(admin, {
      orderId: created.order.id,
      karigarId: hasan.id,
      metalWeight: "11.641",
      businessDate: "2026-11-18",
      idempotencyKey: "ord_901_issue",
    });

    await service.addFilingGoldIssue(admin, {
      orderId: created.order.id,
      additionalWeight: "1.170",
      karigarId: hasan.id,
      businessDate: "2026-11-18",
      idempotencyKey: "add_1170",
    });

    // 1. Filing OUT = 11.976g -> Loss = 0.835g
    const filingRes = await service.postProcessEntry(admin, {
      orderId: created.order.id,
      processType: "FILING",
      karigarId: hasan.id,
      nextKarigarId: boro.id,
      grossInWeight: "12.811",
      grossOutWeight: "11.976",
      closeProcess: true,
      businessDate: "2026-11-18",
      idempotencyKey: "v_filing_1",
    });
    expect(filingRes.visit.rawLossWeight.toFixed(3)).toBe("0.835");

    // 2. Free Polish OUT = 11.318g -> Loss = 0.658g
    const fpRes = await service.postProcessEntry(admin, {
      orderId: created.order.id,
      processType: "FREE_POLISH",
      karigarId: boro.id,
      nextKarigarId: josim.id,
      grossInWeight: "11.976",
      grossOutWeight: "11.318",
      closeProcess: true,
      businessDate: "2026-11-18",
      idempotencyKey: "v_fp_1",
    });
    expect(fpRes.visit.rawLossWeight.toFixed(3)).toBe("0.658");

    // 3. Setting IN = 11.318 + 0.434 AD = 11.752g, OUT = 11.498g -> Loss = 0.254g
    // Route back to FILING (Lock Fitting) instead of FINAL_POLISH!
    const setRes = await service.postProcessEntry(admin, {
      orderId: created.order.id,
      processType: "SETTING",
      karigarId: josim.id,
      nextKarigarId: hasan.id,
      nextProcessType: "FILING",
      grossInWeight: "11.752",
      nonGoldInWeight: "0.434",
      grossOutWeight: "11.498",
      nonGoldOutWeight: "0.434",
      stoneComponents: [
        { componentType: "AD", direction: "ADDED", pieces: 10, weightGrams: "0.434" },
      ],
      closeProcess: true,
      businessDate: "2026-11-18",
      idempotencyKey: "v_set_1",
    });
    expect(setRes.visit.rawLossWeight.toFixed(3)).toBe("0.254");
    expect(setRes.nextProcess?.processType).toBe("FILING");

    // 4. Filing Visit 2 (Lock Fitting): 11.498g IN -> 11.516g OUT (+0.018g returned into order)
    // Route next to NOKSI (dynamically created on order!)
    const lockFitRes = await service.postProcessEntry(admin, {
      orderId: created.order.id,
      processType: "FILING",
      karigarId: hasan.id,
      nextKarigarId: noksiShop.id,
      nextProcessType: "NOKSI",
      adjustAgainstKarigarBalance: true,
      isRepairing: true,
      grossInWeight: "11.498",
      nonGoldInWeight: "0.434",
      grossOutWeight: "11.516",
      nonGoldOutWeight: "0.434",
      closeProcess: true,
      businessDate: "2026-11-18",
      notes: "Lock fitting",
      idempotencyKey: "v_filing_2",
    });
    expect(lockFitRes.visit.rawLossWeight.toFixed(3)).toBe("-0.018");
    expect(lockFitRes.visit.metalOutWeight.toFixed(3)).toBe("11.082");
    expect(lockFitRes.process.closedLossWeight.toFixed(3)).toBe("0.817");
    expect(lockFitRes.nextProcess?.processType).toBe("NOKSI");

    // Check Hasan's recovery balance: 0.817 * 0.92 = 0.75164 fine (original 0.835g record kept!)
    const recWs = await service.getKarigarRecoveryWorkspace(admin, { karigarId: hasan.id });
    const hasanSummary = recWs.karigarSummaries.find((k) => k.karigarId === hasan.id)!;
    expect(Number(hasanSummary.outstandingFine).toFixed(4)).toBe("0.7516");

    // 5. Noksi (Outsource): 11.516g IN (11.082 metal + 0.434 AD) -> 11.216g OUT (10.782 metal + 0.434 AD) + 0.200g Chol -> 0.100g Noksi loss (settled immediately when settleNoksiImmediately: true)
    const noksiRes = await service.postProcessEntry(admin, {
      orderId: created.order.id,
      processType: "NOKSI",
      karigarId: noksiShop.id,
      nextProcessType: "COMPLETE",
      settleNoksiImmediately: true,
      grossInWeight: "11.516",
      nonGoldInWeight: "0.434",
      grossOutWeight: "11.216",
      nonGoldOutWeight: "0.434",
      extraMetalReturnedWeight: "0.200",
      closeProcess: true,
      businessDate: "2026-11-18",
      idempotencyKey: "v_noksi_1",
    });
    expect(noksiRes.visit.rawLossWeight.toFixed(3)).toBe("0.100");
    expect(noksiRes.nextProcess).toBeNull();

    // Noksi Shop should have 0 outstanding in Recovery (immediately settled!)
    const noksiRecWs = await service.getKarigarRecoveryWorkspace(admin, { karigarId: noksiShop.id });
    const noksiSummary = noksiRecWs.karigarSummaries.find((k) => k.karigarId === noksiShop.id);
    expect(Number(noksiSummary?.outstandingFine ?? 0)).toBe(0);

    // 6. Complete Order: should succeed with finishedNet = 10.782g
    const completed = await service.completeOrder(admin, {
      orderId: created.order.id,
      businessDate: "2026-11-18",
      idempotencyKey: "comp_901",
    });
    expect(completed.order.finishedGrossWeight?.toFixed(3)).toBe("11.216");
    expect(completed.order.finishedStoneWeight?.toFixed(3)).toBe("0.434");
    expect(completed.order.finishedNetMetalWeight?.toFixed(3)).toBe("10.782");

    // Verify Admin 22K Stock: 50.000 - 12.811 + 0.200 (chol) = 37.389g
    const dash = await service.getDashboardSummary(admin);
    expect(dash.groupA_adminStock.mixedPhysical).toBe("37.389");
  });

  it("keeps Noksi loss in Recovery when settleNoksiImmediately is false", async () => {
    const repo = new InMemoryTransactionalRepository();
    const service = new ErpDomainService(repo);
    const admin: ActorContext = {
      userId: "u_admin",
      organizationId: "org_test2",
      role: "OWNER_ADMIN",
      email: "admin@am.local",
      name: "Admin",
    };
    const purity22k = await service.configurePurity(admin, {
      code: "22K",
      displayLabel: "22K (92%)",
      karatLabel: "22K",
      touchPercent: "92",
    });
    await service.postOpeningBalance(admin, {
      purityId: purity22k.id,
      physicalWeight: "20.000",
      businessDate: "2026-11-18",
      idempotencyKey: "open_2",
    });
    const customer = await service.createCustomer(admin, { name: "Cust 2" });
    const noksiShop = await service.createKarigar(admin, {
      name: "Noksi Deferred",
      capabilities: ["NOKSI"],
    });
    const created = await service.createOrder(admin, {
      bagNumber: "902",
      customerId: customer.id,
      orderName: "Noksi Deferred Ring",
      purityId: purity22k.id,
      selectedProcesses: ["NOKSI"],
      orderDate: "2026-11-18",
    });
    await service.issueMetalToOrder(admin, {
      orderId: created.order.id,
      karigarId: noksiShop.id,
      metalWeight: "10.000",
      businessDate: "2026-11-18",
      idempotencyKey: "issue_902",
    });
    await service.postProcessEntry(admin, {
      orderId: created.order.id,
      processType: "NOKSI",
      karigarId: noksiShop.id,
      nextProcessType: "COMPLETE",
      settleNoksiImmediately: false,
      grossInWeight: "10.000",
      grossOutWeight: "9.800",
      extraMetalReturnedWeight: "0.100",
      closeProcess: true,
      businessDate: "2026-11-18",
      idempotencyKey: "noksi_902",
    });
    const recWs = await service.getKarigarRecoveryWorkspace(admin, { karigarId: noksiShop.id });
    const summary = recWs.karigarSummaries.find((k) => k.karigarId === noksiShop.id)!;
    // 0.100g * 92% = 0.0920g fine remains due in Recovery
    expect(Number(summary.outstandingFine).toFixed(4)).toBe("0.0920");
  });
});
