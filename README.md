# AM Jewellers ERP — Version 2 (Increment 1 Pilot)

Version 2 (`./version2`) is a standalone, ground-up rebuild of the AM Jewellers Gold Manufacturing & Order ERP designed for a parallel 1-month real-entry pilot alongside V1 (`./AM-Jwellers`).

## Key Capabilities in Increment 1
- **PostgreSQL 16 + Prisma Transactional Foundation:** Append-only double-entry journal (`JournalTransaction` + `JournalLine`) with `NUMERIC(18, 6)` weights, `NUMERIC(8, 4)` purities, and `Serializable` transaction isolation.
- **Zero Dummy Data Bootstrap:** `npm run db:seed` sets up only the `AM-JEWELLERS` organization, `OWNER_ADMIN` and `OPERATOR` login accounts, and standard purity/touch definitions (`22K (92%)`, `75%`, etc.) with **0 dummy customers, 0 dummy karigars, 0 dummy orders, and 0.000 g stock** so you can test your own real entries cleanly.
- **Preserved V1 Previews:** Exact 400px V1 `ManufacturingWorksheetPreview` (`AM JEWELLARS`, `FAILING`, `F PALISH`, `SETTING`, `AD`, `KL`, `TOTAL`, `FENESH WT`, `PALISH`, `TOTAL LOSS`), PDF worksheet generator, and preserved V1 Bill preview template.
- **Spreadsheet-Style Production Register (`/production-register`):** Built with `@tanstack/react-table`, sticky header, stage column groups, `Asia/Kolkata` month filter tabs (which never reset stock or loss balances), and safe formula-escaped CSV export.
- **QR Deep-Linking:** Every order generates a QR code pointing to `APP_BASE_URL/production-register?order=<opaque-id>`. Scanning while logged out redirects through `/login?redirect=...` and lands directly on the target order.

## Quick Start (Windows PowerShell)
```powershell
cd version2
docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm run dev
```
Open **http://localhost:3001** in your browser.

See:
- [`SETUP.md`](./SETUP.md) for full setup, backup, and restore commands.
- [`BUSINESS_RULES.md`](./BUSINESS_RULES.md) for bullion formulas, precision/rounding, and loss eligibility rules.
- [`PILOT_TEST_CHECKLIST.md`](./PILOT_TEST_CHECKLIST.md) for the 1-month pilot verification checklist.
- [`PREVIEW_PRESERVATION.md`](./PREVIEW_PRESERVATION.md) for V1 preview preservation details.

