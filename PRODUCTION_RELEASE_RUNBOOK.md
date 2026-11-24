# Production Release & Rollback Runbook

> **Rule:** Never replace the production database with staging, and never run `seed-staging.ts` or copy dummy data into production.

## 1. Pre-Deployment Verification
1. Verify all automated tests and build checks pass on the feature branch (`feat/customer-cad-portal`):
   - `npx tsc --noEmit`
   - `npx vitest run`
   - `npx next build`
2. Complete the manual walkthrough on `customer-cad-staging` across Customer, Manager, and CAD Designer sessions.
3. Confirm production `.env` / hosting secrets have:
   - `APP_ENV="production"`
   - `NEXT_PUBLIC_APP_ENV="production"`
   - `ALLOW_STAGING_MUTATIONS` unset or `"false"`
   - Real production `DATABASE_URL` / `DIRECT_URL`

## 2. Additive Database Migration on Production
1. Take a Neon branch snapshot / point-in-time backup before migrating.
2. Review `prisma/migrations/0010_customer_app_and_cad/migration.sql` (additive-only: adds new enum values `CUSTOMER`, `CAD_DESIGNER`, nullable columns on `User`, and new tables for Catalogue, Customer Requests, Request-Bag Links, CAD Assignments, Attachments, and Notifications).
3. Apply the reviewed migration to production:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```
4. Verify existing manufacturing tables (`Order`, `OrderProcess`, `CustomerBill`, `StockAccount`, `JournalTransaction`) remain untouched and valid.

## 3. Provision Real Accounts (No Default Shared Passwords)
1. Use the Manager Invitation / Provisioning screen in `/app-orders` (or `/directory`) to generate one-time invite links for:
   - CAD Designers: **Ashid**, **Josim**, **Aftab** (explicitly linking `Josim` CAD account without merging with setting-karigar `Josim` unless intended).
   - Verified Customers: generate customer-specific invite links tied to their stable `customerId`.
2. Each user sets their own password upon accepting their invite.

## 4. Safe Rollback Plan
1. **Immediate Feature Disable (Zero Downtime / Zero Data Loss):**
   - Set any or all feature flags to `"false"` in production environment variables and redeploy/restart:
     - `FEATURE_CUSTOMER_APP="false"`
     - `FEATURE_CAD_DASHBOARD="false"`
     - `FEATURE_APP_ORDERS="false"`
     - `FEATURE_CATALOGUE="false"`
   - Core manufacturing (`/production-register`, `/stock`, `/billing`, `/recovery`, `/dashboard`) continues running normally.
2. **Code Rollback:**
   - Roll back application deployment to the previous `main` commit if needed. Because `0010_customer_app_and_cad` is strictly additive, existing manufacturing queries remain 100% compatible.
   - Do **not** drop new tables or restore an old database snapshot if live manufacturing orders or bills were created after deployment.
