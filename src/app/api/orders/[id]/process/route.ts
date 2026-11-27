import { NextRequest, NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";
import { erpService, ProcessType, StoneComponentInput } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireServerActor(["OWNER_ADMIN", "OPERATOR"]);
    const { id: orderId } = await context.params;
    const body = await req.json();
    const action = String(body.action || "POST_PROCESS_ENTRY");
    const idempotencyKey =
      String(body.idempotencyKey || "") ||
      `ord_${orderId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    if (action === "GIVE_WORK") {
      const stoneComponents: StoneComponentInput[] = Array.isArray(
        body.stoneComponents
      )
        ? body.stoneComponents
        : [];
      const res = await erpService.giveWorkToProcess(actor, {
        orderId,
        processType: body.processType as ProcessType,
        karigarId: String(body.karigarId || ""),
        grossInWeight:
          body.grossInWeight !== undefined && body.grossInWeight !== ""
            ? String(body.grossInWeight)
            : undefined,
        stoneComponents,
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        processStatus: res.process.status,
        grossInWeight: res.process.latestGrossInWeight.toFixed(3),
      });
    }

    if (action === "ISSUE_METAL") {
      const res = await erpService.issueMetalToOrder(actor, {
        orderId,
        karigarId: String(body.karigarId || ""),
        metalWeight: String(body.metalWeight || "0"),
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        movementId: res.movement.id,
        transactionNumber: res.journalTransaction.transactionNumber,
      });
    }

    if (action === "ADD_FILING_GOLD") {
      const res = await erpService.addFilingGoldIssue(actor, {
        orderId,
        additionalWeight: String(body.additionalWeight || "0"),
        karigarId: body.karigarId ? String(body.karigarId) : undefined,
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        movementId: res.movement.id,
        transactionNumber: res.journalTransaction.transactionNumber,
        cumulativeFilingIn: res.cumulativeFilingIn.toFixed(3),
      });
    }

    if (action === "RETURN_UNUSED_FILING_GOLD") {
      const res = await erpService.returnUnusedGoldFromFiling(actor, {
        orderId,
        grossWeight: String(body.grossWeight || "0"),
        businessDate: body.businessDate,
        reason: String(body.reason || "Unused gold returned to Admin"),
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        returnedWeight: res.returnedWeight.toFixed(3),
        netIssuedWeight: res.netIssuedWeight.toFixed(3),
      });
    }

    if (action === "CORRECT_FILING_ENTRY") {
      const res = await erpService.correctFilingEntry(actor, {
        orderId,
        newNetIssuedWeight: String(body.newNetIssuedWeight || "0"),
        reason: String(body.reason || ""),
        businessDate: body.businessDate,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        deltaWeight: res.deltaWeight.toFixed(3),
        netIssuedWeight: res.process.issuedMetalWeight.toFixed(3),
      });
    }

    if (action === "REOPEN_STAGE_FOR_REPAIR") {
      const toProcessType = body.toProcessType as ProcessType;
      const karigarId = String(body.karigarId || "").trim();
      const weightNum = Number(body.weightGrams || 0);
      const notes = body.notes ? String(body.notes).trim() : "";

      if (!toProcessType || !karigarId || !Number.isFinite(weightNum) || weightNum <= 0) {
        return NextResponse.json(
          { ok: false, error: "Select stage, karigar, and weight > 0" },
          { status: 400 }
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, organizationId: actor.organizationId },
        });
        if (!order) throw new Error("Order not found");
        if (order.status === "COMPLETED" || order.status === "CANCELLED") {
          throw new Error(`Cannot send piece for repair on ${order.status} order`);
        }

        const targetProc = await tx.orderProcess.findFirst({
          where: { orderId, processType: toProcessType },
        });
        if (!targetProc) {
          throw new Error(`Stage ${toProcessType} is not on this order`);
        }

        const karigar = await tx.karigar.findFirst({
          where: { id: karigarId, organizationId: actor.organizationId },
        });
        if (!karigar) throw new Error("Karigar not found");

        const w = new Decimal(weightNum.toFixed(6));

        // If a downstream open stage currently holds unreturned metal/gross >= w, transfer custody from it
        const holderProc = await tx.orderProcess.findFirst({
          where: {
            orderId,
            id: { not: targetProc.id },
            status: { not: "CLOSED" },
            OR: [
              { custodyMetalWeight: { gte: w } },
              { latestGrossInWeight: { gte: w } },
            ],
            returnedMetalWeight: 0,
          },
          orderBy: { sequenceOrder: "desc" },
        });

        let metalTransferNum = weightNum;
        let stoneTransferNum = 0;

        if (holderProc) {
          const holderCustody = Number(holderProc.custodyMetalWeight);
          const holderStones = Number(holderProc.carriedStoneInWeight);
          if (weightNum > holderCustody + 1e-6 && holderStones > 0) {
            stoneTransferNum = Math.min(holderStones, Math.max(0, weightNum - holderCustody));
            metalTransferNum = Math.min(holderCustody, Math.max(0, weightNum - stoneTransferNum));
          } else {
            metalTransferNum = Math.min(holderCustody, weightNum);
            stoneTransferNum = 0;
          }

          const metalDec = new Decimal(metalTransferNum.toFixed(6));
          await tx.orderProcess.update({
            where: { id: holderProc.id },
            data: {
              issuedMetalWeight: { decrement: metalDec },
              custodyMetalWeight: { decrement: metalDec },
              carriedStoneInWeight: {
                set: new Decimal(Math.max(0, holderStones - stoneTransferNum).toFixed(6)),
              },
              carriedStoneOutWeight: {
                set: new Decimal(
                  Math.max(0, Number(holderProc.carriedStoneOutWeight) - stoneTransferNum).toFixed(6)
                ),
              },
              latestGrossInWeight: {
                set: new Decimal(
                  Math.max(0, Number(holderProc.latestGrossInWeight) - weightNum).toFixed(6)
                ),
              },
            },
          });
        }

        const metalTransferDec = new Decimal(metalTransferNum.toFixed(6));
        const stoneTransferDec = new Decimal(stoneTransferNum.toFixed(6));

        await tx.orderProcess.update({
          where: { id: targetProc.id },
          data: {
            status: "IN_PROGRESS",
            assignedKarigarId: karigar.id,
            issuedMetalWeight: { increment: metalTransferDec },
            custodyMetalWeight: { increment: metalTransferDec },
            carriedStoneInWeight: { increment: stoneTransferDec },
            latestGrossInWeight: w,
            closedAt: null,
            closedById: null,
          },
        });

        await tx.metalMovement.create({
          data: {
            organizationId: actor.organizationId,
            orderId: order.id,
            orderProcessId: targetProc.id,
            movementType: "PROCESS_TRANSFER",
            fromProcessType: holderProc ? holderProc.processType : null,
            toProcessType,
            karigarId: karigar.id,
            businessDate: new Date(),
            grossWeight: w,
            nonGoldWeight: stoneTransferDec,
            netMetalWeight: metalTransferDec,
            touchSnapshot: order.touchSnapshot,
            fineEquivalentWeight: new Decimal(
              ((metalTransferNum * Number(order.touchSnapshot)) / 100).toFixed(6)
            ),
            notes: notes || `Repair piece sent to ${toProcessType} (${weightNum.toFixed(3)} g)`,
            idempotencyKey: `repair_${orderId}_${toProcessType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            createdById: actor.userId,
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "IN_PROCESS",
          },
        });

        return {
          toProcessType,
          weightGrams: weightNum.toFixed(3),
          karigarName: karigar.name,
        };
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "UNDO_LAST_STEP") {
      if (actor.role !== "OWNER_ADMIN") {
        return NextResponse.json(
          { ok: false, error: "Only Owner/Admin can undo process steps" },
          { status: 403 }
        );
      }

      const order = await prisma.order.findFirst({
        where: { id: orderId, organizationId: actor.organizationId },
        include: {
          processes: { orderBy: { sequenceOrder: "asc" } },
        },
      });
      if (!order) {
        return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
      }
      if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        return NextResponse.json(
          { ok: false, error: `Cannot undo steps on ${order.status} Bag #${order.bagNumber}` },
          { status: 409 }
        );
      }

      const latestActiveVisit = await prisma.processVisit.findFirst({
        where: { orderId, organizationId: actor.organizationId, status: { not: "REVERSED" } },
        orderBy: { createdAt: "desc" },
      });

      const latestRepairMovement = await prisma.metalMovement.findFirst({
        where: {
          orderId,
          organizationId: actor.organizationId,
          idempotencyKey: { startsWith: "repair_" },
        },
        orderBy: { createdAt: "desc" },
      });

      // Case A: Latest action was a "Send Existing Piece for Repair" transfer
      if (
        latestRepairMovement &&
        (!latestActiveVisit ||
          latestRepairMovement.createdAt.getTime() >= latestActiveVisit.createdAt.getTime())
      ) {
        const targetProc = order.processes.find(
          (p) => p.id === latestRepairMovement.orderProcessId
        );
        if (!targetProc) {
          return NextResponse.json(
            { ok: false, error: "Target process for repair movement not found" },
            { status: 404 }
          );
        }

        const priorVisitOnTarget = await prisma.processVisit.findFirst({
          where: {
            orderId,
            orderProcessId: targetProc.id,
            status: { not: "REVERSED" },
          },
          orderBy: { createdAt: "desc" },
        });

        await prisma.$transaction(
          async (tx) => {
            const metalDec = latestRepairMovement.netMetalWeight;
            const stoneDec = latestRepairMovement.nonGoldWeight;
            const grossNum = Number(latestRepairMovement.grossWeight);

            const nextIssued = Math.max(0, Number(targetProc.issuedMetalWeight) - Number(metalDec));
            const nextCustody = Math.max(0, Number(targetProc.custodyMetalWeight) - Number(metalDec));
            const nextStoneIn = Math.max(0, Number(targetProc.carriedStoneInWeight) - Number(stoneDec));

            const wasClosedBefore = Boolean(priorVisitOnTarget && targetProc.returnedMetalWeight.gt(0));

            await tx.orderProcess.update({
              where: { id: targetProc.id },
              data: {
                status: wasClosedBefore
                  ? "CLOSED"
                  : nextIssued > 0
                  ? "IN_PROGRESS"
                  : "PENDING",
                issuedMetalWeight: new Decimal(nextIssued.toFixed(6)),
                custodyMetalWeight: new Decimal(nextCustody.toFixed(6)),
                carriedStoneInWeight: new Decimal(nextStoneIn.toFixed(6)),
                latestGrossInWeight: wasClosedBefore && priorVisitOnTarget
                  ? priorVisitOnTarget.grossInWeight
                  : new Decimal(Math.max(0, Number(targetProc.latestGrossInWeight) - grossNum).toFixed(6)),
                closedAt: wasClosedBefore && priorVisitOnTarget ? priorVisitOnTarget.createdAt : null,
                closedById: wasClosedBefore && priorVisitOnTarget ? priorVisitOnTarget.createdById : null,
              },
            });

            if (latestRepairMovement.fromProcessType) {
              const holderProc = order.processes.find(
                (p) => p.processType === latestRepairMovement.fromProcessType
              );
              if (holderProc) {
                await tx.orderProcess.update({
                  where: { id: holderProc.id },
                  data: {
                    issuedMetalWeight: { increment: metalDec },
                    custodyMetalWeight: { increment: metalDec },
                    carriedStoneInWeight: { increment: stoneDec },
                    carriedStoneOutWeight: { increment: stoneDec },
                    latestGrossInWeight: { increment: latestRepairMovement.grossWeight },
                  },
                });
              }
            }

            await tx.metalMovement.delete({
              where: { id: latestRepairMovement.id },
            });

            await tx.auditEvent.create({
              data: {
                id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                organizationId: actor.organizationId,
                actorId: actor.userId,
                entityType: "OrderProcess",
                entityId: targetProc.id,
                action: "REPAIR_TRANSFER_REVERSED",
                summary: `Undid repair transfer (${Number(latestRepairMovement.grossWeight).toFixed(3)} g) to ${targetProc.processType} on Bag #${order.bagNumber}`,
                metadataJson: JSON.stringify({
                  orderId: order.id,
                  movementId: latestRepairMovement.id,
                  toProcessType: targetProc.processType,
                  fromProcessType: latestRepairMovement.fromProcessType,
                  grossWeight: latestRepairMovement.grossWeight.toString(),
                }),
              },
            });
          },
          { timeout: 20000 }
        );

        return NextResponse.json({
          ok: true,
          undoneType: "REPAIR_TRANSFER",
          processType: targetProc.processType,
          message: `Undid repair transfer (${Number(latestRepairMovement.grossWeight).toFixed(3)} g) to ${targetProc.processType}.`,
        });
      }

      // Case B: Latest action was a completed/partial ProcessVisit
      if (!latestActiveVisit) {
        return NextResponse.json(
          { ok: false, error: "No completed process step or repair transfer to undo on this bag" },
          { status: 400 }
        );
      }

      const revResult = await erpService.reverseProcessVisit(actor, {
        orderId,
        visitId: latestActiveVisit.id,
        reason: String(body.reason || "Undo last process step from Production Register"),
        businessDate: body.businessDate,
        idempotencyKey,
      });

      // Clean up stones, MetalMovements, and any PENDING downstream stage created by that visit
      await prisma.$transaction(
        async (tx) => {
          const visitStones = await tx.stoneComponentEntry.findMany({
            where: {
              orderId,
              organizationId: actor.organizationId,
              processVisitId: latestActiveVisit.id,
            },
          });

          const removedAddedStoneWeight = visitStones
            .filter((s) => s.direction === "ADDED")
            .reduce((sum, s) => sum + Number(s.weightGrams), 0);

          if (visitStones.length > 0) {
            await tx.stoneComponentEntry.deleteMany({
              where: {
                id: { in: visitStones.map((s) => s.id) },
              },
            });
          }

          const visitMovements = await tx.metalMovement.findMany({
            where: {
              orderId,
              organizationId: actor.organizationId,
              processVisitId: latestActiveVisit.id,
            },
          });

          for (const mv of visitMovements) {
            if (mv.movementType === "PROCESS_TRANSFER" && mv.toProcessType) {
              const downstream = await tx.orderProcess.findFirst({
                where: { orderId, processType: mv.toProcessType },
              });
              if (downstream && downstream.status === "PENDING") {
                await tx.orderProcess.update({
                  where: { id: downstream.id },
                  data: {
                    assignedKarigarId: null,
                    issuedMetalWeight: new Decimal(0),
                    custodyMetalWeight: new Decimal(0),
                    carriedStoneInWeight: new Decimal(0),
                    carriedStoneOutWeight: new Decimal(0),
                    latestGrossInWeight: new Decimal(0),
                  },
                });
              }
            }
          }

          if (visitMovements.length > 0) {
            await tx.metalMovement.deleteMany({
              where: {
                id: { in: visitMovements.map((m) => m.id) },
              },
            });
          }

          const prevActiveVisit = await tx.processVisit.findFirst({
            where: {
              orderId,
              orderProcessId: revResult.process.id,
              status: { not: "REVERSED" },
            },
            orderBy: { createdAt: "desc" },
          });

          const currentProcFresh = await tx.orderProcess.findUnique({
            where: { id: revResult.process.id },
          });

          if (currentProcFresh) {
            await tx.orderProcess.update({
              where: { id: currentProcFresh.id },
              data: {
                addedStoneWeight: new Decimal(
                  Math.max(0, Number(currentProcFresh.addedStoneWeight) - removedAddedStoneWeight).toFixed(6)
                ),
                carriedStoneOutWeight: new Decimal(
                  Math.max(0, Number(currentProcFresh.carriedStoneOutWeight) - removedAddedStoneWeight).toFixed(6)
                ),
                latestGrossOutWeight: prevActiveVisit
                  ? prevActiveVisit.grossOutWeight
                  : new Decimal(0),
              },
            });
          }

          if (removedAddedStoneWeight > 0) {
            const ordFresh = await tx.order.findUnique({ where: { id: orderId } });
            if (ordFresh) {
              await tx.order.update({
                where: { id: orderId },
                data: {
                  retainedStoneWeight: new Decimal(
                    Math.max(0, Number(ordFresh.retainedStoneWeight) - removedAddedStoneWeight).toFixed(6)
                  ),
                },
              });
            }
          }
        },
        { timeout: 20000 }
      );

      return NextResponse.json({
        ok: true,
        undoneType: "PROCESS_VISIT",
        processType: revResult.process.processType,
        message: `Reversed ${revResult.process.processType} back to IN_PROGRESS with all weights, stones & losses restored.`,
      });
    }

    if (action === "ADD_STAGE_GOLD") {
      const processType = body.processType as ProcessType;
      const karigarId = String(body.karigarId || "").trim();
      const weightNum = Number(body.additionalWeight || 0);
      const notes = body.notes ? String(body.notes).trim() : "";

      if (!processType || !karigarId || !Number.isFinite(weightNum) || weightNum <= 0) {
        return NextResponse.json(
          { ok: false, error: "Select stage, karigar, and additional weight > 0" },
          { status: 400 }
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, organizationId: actor.organizationId },
          include: { purity: true },
        });
        if (!order) throw new Error("Order not found");
        if (order.status === "COMPLETED" || order.status === "CANCELLED") {
          throw new Error(`Cannot add gold to ${order.status} order`);
        }

        const targetProc = await tx.orderProcess.findFirst({
          where: { orderId, processType },
        });
        if (!targetProc) throw new Error(`Stage ${processType} not found on this order`);

        const karigar = await tx.karigar.findFirst({
          where: { id: karigarId, organizationId: actor.organizationId },
        });
        if (!karigar) throw new Error("Karigar not found");

        const adminPoolAcct = await tx.stockAccount.findFirst({
          where: {
            organizationId: actor.organizationId,
            accountCode: `ADMIN_POOL_${order.purity.code}`,
          },
        });
        if (!adminPoolAcct || Number(adminPoolAcct.cachedPhysicalBalance) < weightNum) {
          throw new Error(
            `Insufficient ${order.purity.displayLabel} stock (${Number(adminPoolAcct?.cachedPhysicalBalance || 0).toFixed(3)} g available, required ${weightNum.toFixed(3)} g)`
          );
        }

        let karigarCustodyAcct = await tx.stockAccount.findFirst({
          where: {
            organizationId: actor.organizationId,
            accountCode: `KARIGAR_CUSTODY_${karigar.id}`,
          },
        });
        if (!karigarCustodyAcct) {
          karigarCustodyAcct = await tx.stockAccount.create({
            data: {
              organizationId: actor.organizationId,
              accountCode: `KARIGAR_CUSTODY_${karigar.id}`,
              name: `Karigar Custody - ${karigar.name} (${karigar.karigarCode})`,
              accountType: "KARIGAR_CUSTODY",
              karigarId: karigar.id,
              cachedPhysicalBalance: 0,
              cachedFineBalance: 0,
            },
          });
        }

        const w = new Decimal(weightNum.toFixed(6));
        const fineNum = (weightNum * Number(order.touchSnapshot)) / 100;
        const fineW = new Decimal(fineNum.toFixed(6));
        const txNum = `JTX-ADD-${Date.now().toString().slice(-6)}`;

        const jtx = await tx.journalTransaction.create({
          data: {
            organizationId: actor.organizationId,
            transactionNumber: txNum,
            transactionType: "ORDER_METAL_ISSUE",
            businessDate: new Date(),
            purityId: order.purityId,
            touchSnapshot: order.touchSnapshot,
            physicalWeight: w,
            fineEquivalentWeight: fineW,
            orderId: order.id,
            orderProcessId: targetProc.id,
            karigarId: karigar.id,
            sourceReference: `BAG-${order.bagNumber}`,
            reason: notes || `New piece / admin gold +${weightNum.toFixed(3)}g to Bag #${order.bagNumber} (${processType})`,
            idempotencyKey: `add_stg_jtx_${idempotencyKey}`,
            actorId: actor.userId,
          },
        });

        await tx.journalLine.createMany({
          data: [
            {
              organizationId: actor.organizationId,
              journalTransactionId: jtx.id,
              accountId: adminPoolAcct.id,
              direction: "CREDIT_OUT",
              signedPhysicalDelta: w.neg(),
              touchSnapshot: order.touchSnapshot,
              signedFineDelta: fineW.neg(),
              orderId: order.id,
              orderProcessId: targetProc.id,
              karigarId: karigar.id,
              description: `Issued +${weightNum.toFixed(3)}g to Bag #${order.bagNumber} (${processType})`,
            },
            {
              organizationId: actor.organizationId,
              journalTransactionId: jtx.id,
              accountId: karigarCustodyAcct.id,
              direction: "DEBIT_IN",
              signedPhysicalDelta: w,
              touchSnapshot: order.touchSnapshot,
              signedFineDelta: fineW,
              orderId: order.id,
              orderProcessId: targetProc.id,
              karigarId: karigar.id,
              description: `Received +${weightNum.toFixed(3)}g for Bag #${order.bagNumber} (${processType})`,
            },
          ],
        });

        await tx.stockAccount.update({
          where: { id: adminPoolAcct.id },
          data: {
            cachedPhysicalBalance: { decrement: w },
            cachedFineBalance: { decrement: fineW },
          },
        });
        await tx.stockAccount.update({
          where: { id: karigarCustodyAcct.id },
          data: {
            cachedPhysicalBalance: { increment: w },
            cachedFineBalance: { increment: fineW },
          },
        });

        await tx.metalMovement.create({
          data: {
            organizationId: actor.organizationId,
            orderId: order.id,
            orderProcessId: targetProc.id,
            movementType: "ADDITIONAL_ADMIN_ISSUE",
            toProcessType: processType,
            karigarId: karigar.id,
            businessDate: new Date(),
            grossWeight: w,
            nonGoldWeight: 0,
            netMetalWeight: w,
            touchSnapshot: order.touchSnapshot,
            fineEquivalentWeight: fineW,
            journalTransactionId: jtx.id,
            notes: notes || `Added +${weightNum.toFixed(3)}g from Admin Stock to ${processType}`,
            idempotencyKey: `add_stg_mov_${idempotencyKey}`,
            createdById: actor.userId,
          },
        });

        const isClosedTarget = targetProc.status === "CLOSED";
        await tx.orderProcess.update({
          where: { id: targetProc.id },
          data: {
            status: "IN_PROGRESS",
            assignedKarigarId: karigar.id,
            issuedMetalWeight: { increment: w },
            custodyMetalWeight: { increment: w },
            latestGrossInWeight: isClosedTarget ? w : { increment: w },
            closedAt: null,
            closedById: null,
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "IN_PROCESS",
            initialIssuedMetalWeight: { increment: w },
          },
        });

        return {
          processType,
          addedWeight: weightNum.toFixed(3),
          transactionNumber: txNum,
        };
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "MOVE_PENDING_STAGE") {
      const fromProcessType = body.fromProcessType as ProcessType;
      const toProcessType = body.toProcessType as ProcessType;
      if (!fromProcessType || !toProcessType || fromProcessType === toProcessType) {
        return NextResponse.json(
          { ok: false, error: "Select a different destination stage" },
          { status: 400 }
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, organizationId: actor.organizationId },
        });
        if (!order) {
          throw new Error("Order not found");
        }
        const fromProc = await tx.orderProcess.findFirst({
          where: { orderId, processType: fromProcessType },
        });
        const toProc = await tx.orderProcess.findFirst({
          where: { orderId, processType: toProcessType },
        });
        if (!fromProc || !toProc) {
          throw new Error("Source or destination process stage not found on this order");
        }
        if (fromProc.status === "CLOSED") {
          throw new Error(`Cannot move ${fromProcessType}: stage is already CLOSED`);
        }
        if (toProc.status === "CLOSED") {
          throw new Error(`Cannot move to ${toProcessType}: destination stage is already CLOSED`);
        }
        if (Number(fromProc.custodyMetalWeight) <= 0 || Number(fromProc.issuedMetalWeight) <= 0) {
          throw new Error(`${fromProcessType} has no pending metal to move`);
        }
        if (Number(fromProc.returnedMetalWeight) > 0 || Number(fromProc.closedLossWeight) > 0) {
          throw new Error(`Cannot move ${fromProcessType}: work has already been returned on this stage`);
        }
        if (Number(toProc.custodyMetalWeight) > 0 || Number(toProc.issuedMetalWeight) > 0) {
          throw new Error(`Cannot move to ${toProcessType}: destination stage already has metal issued`);
        }

        await tx.orderProcess.update({
          where: { id: toProc.id },
          data: {
            assignedKarigarId: fromProc.assignedKarigarId,
            issuedMetalWeight: fromProc.issuedMetalWeight,
            custodyMetalWeight: fromProc.custodyMetalWeight,
            carriedStoneInWeight: fromProc.carriedStoneInWeight,
            latestGrossInWeight: fromProc.latestGrossInWeight,
          },
        });
        await tx.orderProcess.update({
          where: { id: fromProc.id },
          data: {
            assignedKarigarId: null,
            issuedMetalWeight: 0,
            custodyMetalWeight: 0,
            carriedStoneInWeight: 0,
            latestGrossInWeight: 0,
          },
        });
        await tx.metalMovement.updateMany({
          where: { orderProcessId: fromProc.id, movementType: "PROCESS_TRANSFER" },
          data: {
            orderProcessId: toProc.id,
            notes: `Moved from ${fromProcessType} to ${toProcessType}`,
          },
        });
        await tx.processVisit.updateMany({
          where: { orderProcessId: fromProc.id },
          data: { orderProcessId: toProc.id },
        });
        await tx.journalLine.updateMany({
          where: { orderProcessId: fromProc.id },
          data: { orderProcessId: toProc.id },
        });

        return {
          movedWeight: fromProc.custodyMetalWeight.toFixed(3),
          fromProcessType,
          toProcessType,
        };
      });

      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "POST_PROCESS_ENTRY") {
      const stoneComponents: StoneComponentInput[] = Array.isArray(
        body.stoneComponents
      )
        ? body.stoneComponents
        : [];

      const res = await erpService.postProcessEntry(actor, {
        orderId,
        processType: body.processType as ProcessType,
        karigarId: String(body.karigarId || ""),
        nextKarigarId: body.nextKarigarId || undefined,
        nextProcessType: body.nextProcessType || undefined,
        adjustAgainstKarigarBalance: Boolean(body.adjustAgainstKarigarBalance),
        isRepairing: Boolean(body.isRepairing),
        settleNoksiImmediately: Boolean(body.settleNoksiImmediately),
        grossInWeight: String(body.grossInWeight || "0"),
        nonGoldInWeight:
          body.nonGoldInWeight !== undefined && body.nonGoldInWeight !== ""
            ? String(body.nonGoldInWeight)
            : undefined,
        grossOutWeight: String(body.grossOutWeight || "0"),
        nonGoldOutWeight:
          body.nonGoldOutWeight !== undefined && body.nonGoldOutWeight !== ""
            ? String(body.nonGoldOutWeight)
            : undefined,
        extraMetalReturnedWeight:
          body.extraMetalReturnedWeight !== undefined &&
          body.extraMetalReturnedWeight !== ""
            ? String(body.extraMetalReturnedWeight)
            : undefined,
        extraMetalTouchPercent:
          body.extraMetalTouchPercent !== undefined &&
          body.extraMetalTouchPercent !== ""
            ? String(body.extraMetalTouchPercent)
            : undefined,
        extraMetalPurityId: body.extraMetalPurityId
          ? String(body.extraMetalPurityId)
          : undefined,
        custodyRetainedMetalWeight:
          body.custodyRetainedMetalWeight !== undefined &&
            body.custodyRetainedMetalWeight !== ""
            ? String(body.custodyRetainedMetalWeight)
            : undefined,
        stoneComponents,
        closeProcess:
          body.closeProcess !== undefined ? Boolean(body.closeProcess) : true,
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });

      return NextResponse.json({
        ok: true,
        visitId: res.visit.id,
        rawLossWeight: res.visit.rawLossWeight.toFixed(3),
        fineLossWeight: res.visit.fineLossWeight.toFixed(3),
        extraMetalReturnedWeight: res.visit.extraMetalReturnedWeight.toFixed(3),
        extraMetalFineWeight: res.visit.extraMetalFineWeight.toFixed(3),
      });
    }

    if (action === "COMPLETE_ORDER") {
      const res = await erpService.completeOrder(actor, {
        orderId,
        finishedGrossWeight:
          body.finishedGrossWeight !== undefined &&
            body.finishedGrossWeight !== ""
            ? String(body.finishedGrossWeight)
            : undefined,
        finishedStoneWeight:
          body.finishedStoneWeight !== undefined &&
            body.finishedStoneWeight !== ""
            ? String(body.finishedStoneWeight)
            : undefined,
        businessDate: body.businessDate,
        notes: body.notes,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        status: res.order.status,
        finishedNetMetalWeight: res.order.finishedNetMetalWeight?.toFixed(3),
        finishedFineWeight: res.order.finishedFineWeight?.toFixed(3),
      });
    }

    if (action === "CANCEL_ORDER") {
      const res = await erpService.cancelOrder(actor, {
        orderId,
        reason: String(body.reason || ""),
      });
      return NextResponse.json({
        ok: true,
        status: res.status,
      });
    }

    if (action === "DELETE_ORDER") {
      const res = await erpService.deleteOrderWithRollback(actor, {
        orderId,
        reason: body.reason ? String(body.reason) : undefined,
        idempotencyKey,
      });
      return NextResponse.json({
        ok: true,
        status: res.order.status,
        rolledBackPhysicalWeight: res.rolledBackPhysicalWeight.toFixed(3),
        rolledBackFineWeight: res.rolledBackFineWeight.toFixed(3),
      });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported order action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

