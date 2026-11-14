# AM Jewellers ERP V2 — One-Month Pilot Test Checklist

Use this step-by-step checklist to test V2 on **http://localhost:3001** with your own real data.

## Step 1: Sign In & Dashboard (`/dashboard`)
- [ ] Open `http://localhost:3001/login`.
- [ ] Sign in as Admin (`admin@amjewellers.local` / `ChangeMeAdmin!2026`).
- [ ] Verify the header badge shows `v2.0.0-pilot.1` and `OWNER_ADMIN • Asia/Kolkata`.
- [ ] Verify `/` redirects to `/dashboard` showing **Group A (Admin Stock)**, **Group B (In-Process Metal with Karigars)**, **Group C (Production & Recovery)**, **Credits & Obligations**, and expandable drilldowns.

## Step 2: Default & Custom Customers & Karigars (`/directory`)
- [ ] Navigate to **Customers & Karigars** (`/directory`).
- [ ] Click **Ensure Default Karigars** and verify `Hasan Bhai` (Filing), `Boro Bhai` (Free Polish + Final Polish), and `Josim` (Setting) appear with `Default` badges.
- [ ] Add a Customer and verify it gets a unique `CUST-XXX` code; test editing/deactivating a karigar.

## Step 3: Admin Stock, Gold Sale & Purity Conversion / Refining (`/stock`)
- [ ] Navigate to **Stock & Journal** (`/stock`).
- [ ] Select `22K (92%)` and post an **Opening Balance** of `100.000 g`.
- [ ] Verify **Stock by Touch** shows `100.000 g` physical and `92.000 g` fine equivalent, while `Fine 99%`, `Fine 99.9%`, and `Fine 100%` remain separate.
- [ ] Post a **Gold Sale** (`STOCK_SALE`) and verify physical stock decreases; test **Reverse** and verify stock restores.
- [ ] Test **Purity Conversion / Refining** in **Preview Only** mode (stock unchanged), then **Post Physical Conversion** and verify **Daily Reconciliation** (`/reconciliation`) discrepancy stays `0.000 g`.
- [ ] Confirm **Transaction History** is collapsed by default and **Technical Ledger Details** is behind a toggle.

## Step 4: Create an Order & Verify Preserved V1 Preview (`/orders/new`)
- [ ] Navigate to **New Order** (`/orders/new`).
- [ ] Enter a Bag Number, select your Customer, Order Name, `22K (92%)`, Target Weight `20.000 g`, and select processes.
- [ ] Verify the live 400px V1 Job Card preview on the right matches V1 layout (`AM JEWELLARS`, `FAILING`, `F PALISH`, `SETTING`, `AD`, `KL`, `TOTAL`, `FENESH WT`, `PALISH`, `TOTAL LOSS`).
- [ ] Click **Create Order & Open Register**. Verify Admin Stock is still unchanged (order creation does not deduct stock).

## Step 5: Separate IN/OUT, Filing Edit & Setting Stones (`/production-register`)
- [ ] In the selected Order workspace on `/production-register`, verify default karigars auto-select on unassigned processes:
  1. **Filing (Give Work):** Select `Hasan Bhai`, enter `10.000 g`, click **Give Work**. Verify status becomes `With Karigar`, OUT shows `—`, Loss shows `Pending`.
  2. **Filing (Edit IN):** Open **Edit Filing IN** -> **Add Gold** (`+5.000 g`), **Return Unused** (`-2.000 g`), and test **Correct Entry**; verify Admin Stock updates accurately.
  3. **Filing (Receive Work):** Enter `Gross OUT = 12.700 g`, click **Confirm Return & Close Process**. Verify `0.300 g` loss (`0.276 g` fine) and immediate eligibility in Recovery.
  4. **Setting:** Give Work with `AD` and `KL` stone entries, verify Admin Stock does NOT change for stones, then Receive Work later and verify stone carry-forward into **Final Polish**.
- [ ] Click **Complete Order & Move to Finished Goods**.
- [ ] On an unbilled order without active recovery allocations, test **Delete Order** and verify all gold rolls back cleanly; verify deletion is blocked if recovery allocations exist.

## Step 6: Verify Daily Reconciliation & QR Deep Link (`/reconciliation`)
- [ ] Open **Daily Reconciliation** (`/reconciliation`).
- [ ] Verify `Total Accounted Gold = Admin Available Fine + Karigar Custody + Finished Goods + Process/Refining Loss` (`Discrepancy: 0.000 g`).
- [ ] Open the order's **3. V1 Job Card & QR Code** tab and test scanning/opening the QR URL in a logged-out browser window to verify it redirects back to the exact order after login.

## Step 7: Karigar Recovery (`/recovery`)
- [ ] Close `FILING` on an ongoing order and open **Karigar Recovery** (`/recovery`). Verify the closed process loss is immediately `ELIGIBLE` while open processes remain in **Custody**.
- [ ] Select a karigar, verify touch groups (`92%`, `75.5%`) and **Recover** / **Recover All**; verify shortage handling (`Carry forward`, `Accept & clear`, `Accept part`) and no repeat making deduction without confirmation.
- [ ] Expand **View orders** for per-order breakdown and optional **Write Off**; expand **More options** for period reconciliation and unallocated excess credit (**Apply to Loss** / **Refund Excess** / **Undo Allocation**).

## Step 8: Customer Profile, Fine-Gold Receipt Workflow, Advances & Billing (`/customers/[id]` & `/billing`)
- [ ] In **Directory** (`/directory`), click **Customer Profile** on a customer to open `/customers/[id]`.
- [ ] Verify the 4 summary cards: **Gold Due**, **Advance Available**, **Total Gold Received (Historical Activity)**, and **Separate INR Balance**.
- [ ] Configure the one-time **Owner Fine-Gold Receipt Convention** (Mode A: Fine-equivalent grams `g fine`, or Mode B: Physical weight at configured fixed touch such as `99.90%`). Verify the routine receipt form does not show a general karat selector.
- [ ] Click **+ Add Advance** or **Receive Fine Gold**, verify the live **Receipt & Settlement Preview** (`Current gold due`, `Fine amount being credited`, `Amount settling outstanding bills`, `Remaining due`, `Advance remaining after settlement`, `Gold being added to admin stock`), and click **Confirm Receipt**.
- [ ] Open **Billing & Settlement** (`/billing`), select completed orders, verify **Previous Outstanding**, **Available Advance**, **New Order Charges**, **Advance Applied**, and **Resulting Payable Balance**, and click **Create Bill & Deliver**.
- [ ] Back on **Customer Profile** (`/customers/[id]`), check the **Orders** tabs (`All / Ongoing / Completed / Delivered / Cancelled`) and **Bills** table (`Bill number | Date | Original fine charge | Settled | Remaining | Status`).
- [ ] Click **Issued Bill / Live Status** on a bill to compare the immutable **Original Issued Document (Reprint)** against the **Current Live Payment Status**.
- [ ] Test **Customer Statement** (`Date | Reference | Gold charged | Gold received/credit | Allocation/adjustment | Running balance`) with a **Month Filter**, **Export CSV**, and **Print Statement**; verify earlier balances carry forward as `Opening Dues / Credit` and allocations are not double-counted as received gold.
- [ ] Expand **Detailed Transaction History & Corrections** to test **Undo Allocation**, **Reverse Mistaken Receipt**, and **Refund Advance** (outbound gold transaction).
- [ ] Test **Download PDF** and **WhatsApp PDF** on `/billing`, and verify **Daily Reconciliation** (`/reconciliation`) still shows `Discrepancy: 0.000 g`.

