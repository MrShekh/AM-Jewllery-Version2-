# Staging Setup Guide (`customer-cad-staging`)

## 1. Create the Isolated Neon Staging Branch
1. Open your Neon project → **Branches** → **New branch**.
2. Name it `customer-cad-staging`.
3. Select **Schema only** (so production customer, order, and stock records are NOT copied).
4. Set an expiration window long enough for your testing cycle.
5. Copy the pooled and direct connection strings for `customer-cad-staging`.

## 2. Configure Staging Environment Variables
1. Copy `.env.staging.example` to `.env.staging` (do **not** overwrite production `.env`).
2. Set `DATABASE_URL` and `DIRECT_URL` to the `customer-cad-staging` connection strings.
3. Keep `APP_ENV="staging"`, `NEXT_PUBLIC_APP_ENV="staging"`, `STAGING_DB_IDENTITY="customer-cad-staging"`, `ALLOW_STAGING_MUTATIONS="true"`, and `DISABLE_EXTERNAL_NOTIFICATIONS="true"`.
4. Leave `CLOUDINARY_*` unset in staging so uploads go to `./storage/staging-uploads` instead of production Cloudinary.

## 3. Reconcile / Baseline Migration History on Schema-Only Neon Branch
A schema-only Neon branch may contain `_prisma_migrations` without its rows. Before running `prisma migrate deploy`:
1. Inspect existing tables & `_prisma_migrations`:
   ```bash
   npx prisma migrate status
   ```
2. If `_prisma_migrations` is empty while tables `0001_init` through `0009_order_weight_text` already exist, mark those existing migrations as applied (do **not** reset or rerun `0001`–`0009`):
   ```bash
   npx prisma migrate resolve --applied 0001_init
   npx prisma migrate resolve --applied 0002_karigar_recovery
   npx prisma migrate resolve --applied 0003_billing_and_customer_settlement
   npx prisma migrate resolve --applied 0004_recovery_settlements_making_deductions
   npx prisma migrate resolve --applied 0005_audit_features_and_conversions
   npx prisma migrate resolve --applied 0006_customer_fine_workflow
   npx prisma migrate resolve --applied 0007_extra_metal_returned
   npx prisma migrate resolve --applied 0008_register_sheets
   npx prisma migrate resolve --applied 0009_order_weight_text
   ```
3. Then apply the new additive migration:
   ```bash
   npx prisma migrate deploy
   ```

## 4. Seed Synthetic Staging Fixtures & Run 30,000-Design Benchmark
```bash
npx tsx prisma/seed-staging.ts
npx tsx prisma/benchmark-catalogue-30k.ts
```
Both scripts enforce `assertStagingDatabaseSafety()` and refuse to run against production.
