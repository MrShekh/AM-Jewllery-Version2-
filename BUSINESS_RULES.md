# AM Jewellers ERP V2 — Business Rules & Accounting Specification

## 1. Precision, Rounding & Decimal Safety
- **No Floating-Point Arithmetic:** All bullion, stone, purity, and loss calculations use `Decimal` (`decimal.js` + PostgreSQL `NUMERIC`).
- **Database & Internal Scale:**
  - Weights (`physicalWeight`, `fineEquivalentWeight`, `grossIn`, `grossOut`, `rawLoss`, `fineLoss`): `NUMERIC(18, 6)` (6 decimal places internally, `ROUND_HALF_UP`).
  - Purities (`touchPercent`): `NUMERIC(8, 4)` (4 decimal places, e.g. `92.0000%`, `75.5000%`, `37.5000%`, `99.0000%`, `99.9000%`, `100.0000%`).
  - Operational UI Display: 3 decimal places (`0.000 g`), right-aligned `tabular-nums`.

## 2. Purity & Fine Equivalent Rules
- Formula:
  $$\text{fineEquivalent} = \frac{\text{metalWeight} \times \text{touchPercent}}{100}$$
- Display labels such as `22K (92%)` never override the configured business touch of `92.0000%`.
- `Fine 99%`, `Fine 99.9%`, and `Fine 100%` are distinct purity categories and are never conflated.
- Receiving metal increases only its physical purity bucket (`ADMIN_KARAT_POOL`). A fine-equivalent calculation never creates physical fine-bar stock.

## 3. Canonical Manufacturing Process Sequence
1. `FILING` (Filing)
2. `FREE_POLISH` (Free Polish)
3. `SETTING` (Setting)
4. `FINAL_POLISH` (Final Polish)

- Any non-empty subset may be selected per order while preserving this relative order.
- Creating an order never deducts stock automatically.
- Issuing metal from Admin Stock to the first selected process deducts `ADMIN_KARAT_POOL` once and credits `KARIGAR_CUSTODY`.
- Transfers between subsequent selected processes move custody between karigar custody accounts without deducting Admin Stock again.

## 4. Process Calculations, Stone Tracking & Loss Eligibility
- Standard per-visit equations:
  - `metalIn = grossIn - nonGoldIn`
  - `metalOut = grossOut - nonGoldOut`
  - `processLoss = metalIn - metalOut - custodyRetained`
  - `fineLoss = processLoss × touchSnapshot / 100`
- **Negative Loss Blocked:** If `metalOut + custodyRetained > metalIn` (`processLoss < 0`), posting is blocked with a validation error (never clamped to zero).
- **Stone Carry-Forward:** Stones (`AD`, `KL`) added in `SETTING` do not increase gold stock. Their retained weight (`nonGoldOut`) carries forward automatically into `FINAL_POLISH` as `carriedStoneInWeight` (`nonGoldIn`).
- **Loss Eligibility (Immediate Per-Process Rule):** Every closed and reconciled process visit creates a `ProcessLossRecord` with status `ELIGIBLE` immediately upon process visit closure. Whole-order completion, billing, delivery, and customer payment do not gate karigar recovery eligibility and never duplicate loss records. Partial receipts (`closeProcess = false`) keep remaining metal in `KARIGAR_CUSTODY` and remain `PENDING_ORDER_COMPLETION` until reconciled.

## 5. Karigar Recovery, Precision & Settlement Policies
- **Fine-Equivalent Settlement Canonical Basis:** All recovery balances, allocations, write-offs, and cross-purity settlements are calculated in fine gold equivalent (`NUMERIC(18, 6)` internal precision; 4-decimal fine display `0.0000 g`; 3-decimal physical display `0.000 g`). Raw weights of different purities are never summed directly as comparable recoverable gold.
- **Per-Loss Outstanding Equation:**
  - `outstandingFine = originalFineLoss - activeMakingDeductionsFine - activeRecoveryAllocationsFine - activeWriteOffsFine`
  - Original loss (`rawLossWeight`, `touchPercentSnapshot`, `fineEquivalentLossWeight`) remains immutable after recovery.
  - **Making Charge Deduction:** An agreed `MakingDeductionAllocation` reduces the karigar's recoverable claim (`netExpectedFine = grossOutstandingFine - makingDeductionFine`) without creating a physical stock outflow or payment. Only actual received metal increases `ADMIN_KARAT_POOL`. Carried claims that already have making allowed cannot receive another making deduction unless explicitly confirmed with a reason.
  - **Shortage & Excess Handling:** Positive shortage (`netExpectedFine - receivedFine > 0`) requires choosing `Carry forward`, `Accept shortage & clear`, or `Accept part, carry the rest`. Negative difference (excess) settles claims up to their remaining balance and holds the excess as unallocated karigar credit.
- **Physical Receipt vs. Allocation Separation:**
  - Recording a `RecoveryReceipt` (with one or more purity lines) increases `ADMIN_KARAT_POOL` for the actual received purity bucket(s) exactly once via journal transaction `KARIGAR_RECOVERY_RECEIPT` (sourced from `KARIGAR_RECOVERY_INFLOW_<purity>`).
  - Allocating a receipt (`RecoveryAllocation`) settles one or more `ELIGIBLE` `ProcessLossRecord`s for the same karigar without modifying admin stock.
  - Early or excess receipts remain unallocated karigar credit (`unallocatedFineWeight`) and may be allocated to future eligible losses or refunded (`KARIGAR_RECOVERY_REFUND`).
- **Owner/Admin Write-Offs & Controlled Corrections:**
  - Only `OWNER_ADMIN` may record recovery receipts, allocate receipts, approve `LossWriteOff`s (which reduce `outstandingFine` without increasing admin stock), undo allocations (restoring unallocated credit and reopening loss without changing stock), or reverse unconsumed receipts (`KARIGAR_RECOVERY_RECEIPT_REVERSAL`).
- **Multi-Month Carry-Forward:** Unrecovered balances carry forward automatically across months. Date filters never reset balances or alter stock.

## 6. Billing, Delivery, Customer Profile & Fine-Gold Settlement Workflow
- **Customer Profile (`/customers/[id]`):**
  - Central workspace for viewing all customer order history (`All / Ongoing / Completed / Delivered / Cancelled`), viewing unpaid bills, receiving fine gold, recording gold advances, settling bills, and viewing remaining dues and available credit.
  - Summary cards display: `Gold Due` (`g fine`), `Advance Available` (`g fine`), `Total Gold Received — Historical Activity` (`g fine`, cumulative historical inflow after reversals/refunds), and `Separate INR Balance` (`INR Due` / `INR Advance`).
- **Customers Give Fine Gold Only (One-Time Owner Setting):**
  - The routine customer receipt form does not display a general karat selector; all customer fine-gold receipts enter the configured **Admin Fine Gold** stock account (`ADMIN_POOL_<finePurityCode>`).
  - Before live customer receipts are allowed, the owner configures `customerFineReceiptMode` once on `Organization`:
    - **Mode A (`FINE_EQUIVALENT`):** Labels the input *"Fine gold received (g fine)"*, credits the entered fine-equivalent amount, and never fabricates physical weight in stock reports (`physicalWeight = 0`, `physicalWeightProvided = false`) unless actual physical bar weight/touch is separately measured and provided.
    - **Mode B (`PHYSICAL_AT_CONFIGURED_TOUCH`):** Labels the input as physical weight, displays the configured fine touch read-only, calculates $\text{creditedFine} = \text{physicalWeight} \times \text{configuredTouch} / 100$, previews the credit before posting, and stores actual physical weight, touch snapshot, and fine equivalent.
  - Changing the default convention later applies only to future receipts and never recalculates historical receipts.
- **Primary Receipt, Excess Advance & Partial Settlement Rules:**
  - Recording a customer fine-gold receipt (`receiveCustomerFineGold`) increases the Admin Fine Gold stock account **once** (`CUSTOMER_GOLD_RECEIPT`). Allocating the receipt to bills (`CustomerPaymentAllocation`) never creates another stock receipt.
  - **Default Settlement (`OLDEST_FIRST`):** Automatically settles the oldest outstanding `POSTED` bills first across all months.
  - **Choose Bills (`CHOOSE_BILLS`):** Under the optional advanced section, allocates only to selected bills, preserves remaining credit as advance, and explicitly displays any unselected unpaid bills without silently settling them.
  - **Excess Receipt Becomes Advance:** Any credited fine gold exceeding settled bills remains on the same `CustomerGoldReceipt` as `unallocatedFineWeight` (`Advance Available`) without generating a second stock entry.
  - **Partial Receipt Leaves Dues:** Any unpaid bill balance remains on the bill and carries forward automatically without re-posting a new charge.
  - **Advance Before Any Bill (`Add Advance`):** Uses the same receipt workflow; if no bills are pending, the entire credited amount becomes `Advance Available` and enters Admin Fine Gold stock once.
- **Order Eligibility, Advance Application & Previous Dues on New Bills:**
  - Only `COMPLETED`, unbilled, undelivered orders with reconciled `finishedNetMetalWeight` can enter a posted delivery bill. `Post Bill & Deliver` atomically posts only the **new bill charge**, moves delivered net metal from `FINISHED_GOODS_<purity>` to `CUSTOMER_DELIVERED_<purity>`, and applies available customer advance (`unallocatedFineWeight`) using row-level concurrency locks (`SELECT ... FOR UPDATE`) without adding gold to admin stock again.
  - Previous unpaid dues (`historicalFineBalance`) are shown in the bill summary for transparency (`New bill outstanding` vs `Overall customer outstanding`) and are never re-posted as new charges.
- **Bill Display & Historical Accuracy:**
  - Every posted bill saves immutable issuance-time snapshots (`historicalFineBalance`, `previousAdvanceFineSnapshot`, `totalFineGold`, `appliedAdvanceFineSnapshot`, `newReceiptFineSnapshot`, `closingFineDueSnapshot`, `remainingAdvanceFineSnapshot`, and `previewHtml`).
  - Old bill reprints preserve their original issued figures, while the Customer Profile displays the latest live balance and a separately labelled **Current Live Payment Status** view.
- **Customer Statement & Corrections:**
  - **Customer Statement:** Displays `Date | Reference | Gold charged | Gold received/credit | Allocation/adjustment | Running balance`, keeping allocation-only events distinct from actual receipts so allocated amounts are never added to received totals a second time. Month filters (`YYYY-MM`) carry forward earlier activity into `Opening Dues / Credit`.
  - **Never Hard-Delete:** Posted receipts, bills, and allocations are never hard-deleted.
  - **Undo Allocation (`undoCustomerPaymentAllocation`):** Restores receipt `unallocatedFineWeight` and reopens the bill balance without moving physical stock.
  - **Refund Advance (`refundCustomerGoldAdvance`):** Requires `OWNER_ADMIN` and a reason; posts an explicit outbound journal transaction (`CUSTOMER_GOLD_REFUND`), reduces `unallocatedFineWeight` (`refundedFineWeight`), and deducts Admin Fine Gold stock.
  - **Reverse Mistaken Receipt (`reverseCustomerGoldReceipt`):** Requires `OWNER_ADMIN` and a reason; verifies no active allocations or refunded credits exist and checks stock availability before posting `CUSTOMER_GOLD_RECEIPT_REVERSAL`.
  - **Cancel Bill (`cancelPostedBill`):** Issues credit note `CN-<billNumber>` and releases active allocations (`RELEASED_ON_BILL_CANCEL`) back to customer credit while preserving actual received gold and delivery history.

## 7. Stock Sales, Purity Conversions & Refining
- **Gold Sale (`STOCK_SALE`):** Deducts physical metal from the selected `ADMIN_KARAT_POOL_<purity>` (blocking insufficient stock) and posts a sale record with optional rate, cash received, and payment status (`PAID` / `PARTIAL` / `UNPAID`). Reversal (`STOCK_SALE_REVERSAL`) restores physical stock in the same purity bucket.
- **Purity Conversion / Refining (`PURITY_CONVERSION` / `REFINING_BATCH`):**
  - Supports **Preview Calculation** (no stock movement) and **Post Physical Conversion** (`OWNER_ADMIN`).
  - Deducts input metal from source `ADMIN_KARAT_POOL` and credits actual recovered metal to target `ADMIN_KARAT_POOL`.
  - Any fine-gold difference is recorded explicitly into `REFINING_LOSS_<purity>` (`PROCESS_LOSS` account) as `REFINING_LOSS` or `REFINING_GAIN` — never silently dropped or invented, keeping daily reconciliation discrepancy at `0.000 g`.

## 8. Default Karigars & Filing IN Edit Controls
- **Default Karigars:** `Hasan Bhai` (`FILING`), `Boro Bhai` (`FREE_POLISH`, `FINAL_POLISH`), `Josim` (`SETTING`) are provisioned via **Ensure Default Karigars** and auto-selected when creating/opening unassigned processes. Karigars can be edited or deactivated (preserving historical orders and recovery claims).
- **Filing IN Edit Actions (while `FILING` is open):**
  - **Add Gold:** Issues additional metal from `ADMIN_KARAT_POOL` to `KARIGAR_CUSTODY`.
  - **Return Unused Gold (`FILING_UNUSED_RETURN`):** Returns unused raw metal from `KARIGAR_CUSTODY` back to `ADMIN_KARAT_POOL` without creating loss.
  - **Correct Entry (`FILING_CORRECTION`):** Adjusts issued weight with a required reason and reverses/re-issues the delta against `ADMIN_KARAT_POOL`.

## 9. Total Stock & Workshop Dashboard (`/dashboard`)
- **Group A (Admin Stock):** Per-purity physical weight, fine equivalent, total Admin Fine Equivalent, and separately labelled mixed-purity physical weight.
- **Group B (In-Process Metal with Karigars):** Custody metal held across `FILING`, `FREE_POLISH`, `SETTING`, `FINAL_POLISH`, plus process-wise stone summary (`AD`, `KL`).
- **Group C (Production & Recovery):** Finished goods awaiting delivery and outstanding karigar loss recovery (`fine` and metal-equivalent).
- **Credits & Obligations:** Customer fine/INR receivables, customer advance fine/INR credits, and unallocated karigar excess credits.
- **Total Accounted Gold:** `Admin Stock + In-Process Custody + Finished Goods + Unrecovered/Open Process & Refining Loss` matches tracked opening + inflows - outflows.

## 10. Consolidated Customer Statement, PDF, WhatsApp & Revocable Share Links
- **Consolidated Statement:** Summarizes opening/current fine & INR balances, itemized bills, gold receipts, cash receipts, and active allocations per customer.
- **PDF & WhatsApp Share:** Generates an A4/bill PDF via `jsPDF`, supports native Web Share (`navigator.share` with file when supported) or PDF download + `wa.me` prefilled message, and generates revocable read-only `/share/bill/[token]` links (`BillShareToken`).

## 11. Deletion & Data Safety Guards
- **Order Delete with Rollback (`deleteOrderWithRollback`):** Allowed only before billing/delivery and only when no `ProcessLossRecord` has active `RecoveryAllocation`, `LossWriteOff`, or `MakingDeductionAllocation`. Rolls back all order metal movements and stock balances atomically.
- **V1 & Pilot Data Protection:** All V1 files outside `./version2` remain strictly read-only. Schema changes are additive-only (`0005_audit_features_and_conversions`), preserving `am_jewellers_v2_dev` pilot data and all existing HTML previews, print layouts, and QR deep links.


