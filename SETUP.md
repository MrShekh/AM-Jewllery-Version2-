# AM Jewellers ERP V2 — Setup, Operations & Backup Guide

## 1. Prerequisites
- **Node.js** 20+ and npm
- **Docker Desktop** (for local PostgreSQL 16 container on port `5433`) or a local PostgreSQL 16 instance

## 2. Environment Configuration
1. Copy `.env.example` to `.env` inside `./version2`:
   ```powershell
   cd "e:\Kaam\Freelance_client\AM Jewellers Software Currently\AM Jwellers\version2"
   Copy-Item .env.example .env
   ```
2. Default PostgreSQL connection in `.env`:
   ```env
   DATABASE_URL="postgresql://am_v2_user:am_v2_dev_password_change_me@localhost:5433/am_jewellers_v2_dev?schema=public"
   APP_BASE_URL="http://localhost:3001"
   NEXT_PUBLIC_APP_BASE_URL="http://localhost:3001"
   ```

## 3. Starting PostgreSQL & Running Migrations
```powershell
cd "e:\Kaam\Freelance_client\AM Jewellers Software Currently\AM Jwellers\version2"
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
```
- `npm run db:seed` creates:
  - Organization: `AM Jewellers (AM-JEWELLERS)`
  - Owner/Admin Login: `admin@amjewellers.local` / `ChangeMeAdmin!2026`
  - Operator Login: `operator@amjewellers.local` / `ChangeMeOperator!2026`
  - Standard Purity Master (`22K (92%)`, `88%`, `84%`, `80%`, `76%`, `75.5%`, `18K (75%)`, `14K (59%)`, `9K (37.5%)`, `Fine 99%`, `Fine 99.9%`, `Fine 100%`)
  - **Zero** dummy customers, karigars, stock, or orders.

## 4. Running V2 on Port 3001 (Safe Alongside V1 on Port 3000)
```powershell
npm run dev
```
- V2 runs on **http://localhost:3001**.
- V1 remains completely untouched in `../AM-Jwellers`.

## 5. Running Automated Acceptance Tests
```powershell
npm test
```
- Runs the Vitest suite (`src/__tests__/acceptance.test.ts`) against an isolated transactional test store so your PostgreSQL database stays 100% clean.

## 6. Database Backup & Restore Commands (One-Month Pilot)
### Create Daily Backup:
```powershell
docker exec -t am_jewellers_v2_postgres pg_dump -U am_v2_user -d am_jewellers_v2_dev -F c -f /tmp/am_v2_backup.dump
docker cp am_jewellers_v2_postgres:/tmp/am_v2_backup.dump .\am_v2_backup_$(Get-Date -Format "yyyyMMdd").dump
```
### Restore Backup:
```powershell
docker cp .\am_v2_backup_YYYYMMDD.dump am_jewellers_v2_postgres:/tmp/restore.dump
docker exec -t am_jewellers_v2_postgres pg_restore -U am_v2_user -d am_jewellers_v2_dev --clean --if-exists /tmp/restore.dump
```

