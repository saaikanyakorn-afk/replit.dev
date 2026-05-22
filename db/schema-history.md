# Schema Change History

This file records all changes that touched existing data content in the production database.
Each entry must include: what changed, backup location, datetime, and reason.

---

## 2026-04-30 — Warehouse Column Migration (commits 3b274b63, c94edb4e, 78c5efa6)

**What changed:**
- Added `warehouse_id INTEGER` to `goods_receivings`
- Added `warehouse_id INTEGER` to `goods_receiving_items`
- Added `return_to_stock BOOLEAN DEFAULT FALSE` to `sales_credit_notes`
- Added `return_warehouse_id INTEGER` to `sales_credit_notes`
- Added `warehouse_id INTEGER` to `ecommerce_orders`
- Added `source_warehouse_id INTEGER` to `manufacturing_orders`
- Added `target_warehouse_id INTEGER` to `manufacturing_orders`
- Added `inventory_triggers JSONB DEFAULT '{}'` to `general_settings`
- Backfilled `warehouse_stock_levels` from `purchase_invoice_items`, `invoice_items`, `tax_invoice_items`

**Backup location:** `db/backups/2026-04-30_warehouse_stock_levels_before_backfill_v85.sql`
(1,094 rows backed up before backfill ran)

**Migration code:** `shared/schema-extra.ts` → `runWarehouseColumnsMigration()`
**Caller:** `server/routes/warehouse-bin-routes.ts` (top-level call)
**Flag:** `WAREHOUSE_STOCK_BACKFILL_DONE` in `system_config`

**Reason:** Three commits (3b274b63, c94edb4e, 78c5efa6) had placed ALTER TABLE blocks
directly inside `server/index.ts` (protected file). These were moved to `schema-extra.ts`
following the TERTIARY USE procedure so index.ts is no longer touched for column additions.

**Status:** Deployed + comment-out + clean push done ✅

---

## 2026-05-07 — expenses: currency_code, exchange_rate, paid_amount (ENTRY #001)

**What changed:**
- Added `currency_code TEXT NOT NULL DEFAULT 'THB'` to `expenses`
- Added `exchange_rate DECIMAL(15,6) NOT NULL DEFAULT 1` to `expenses`
- Added `paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0` to `expenses`

**Backup location:** No backup required — additive columns only (NOT NULL with defaults, no existing rows touched)

**Migration code:** `server/schema-extra.ts` → `runExpenseCurrencyMigration()`
**Caller:** `server/routes/expense-routes.ts` (top-level call in `registerExpenseRoutes`)
**Flag:** `ADD_CURRENCY_COLUMNS_TO_EXPENSES_20260505` in `system_config`

**Reason:** Foreign currency support for expense module. currency_code stores original currency (USD, EUR, etc.), exchange_rate stores THB per 1 unit at time of entry, paid_amount tracks AP settlement balance.

**Production DB verified:** 2026-05-07 — columns absent from production before migration (45 cols, none of the 3 present)

**Status:** Deployed + comment-out + clean push done ✅ — FLAG=done_2026-05-07T14:33:31.731Z

---

## 2026-05-07 — DROP general_settings.bot_api_key (ENTRY #002 reversal / ENTRY #005 deposit)

**What changed:**
- Dropped `bot_api_key TEXT` from `general_settings` (dev DB only — column never reached production)
- Design changed: BOT API key moved to `system_config` table (platform-level, key = `BOT_API_KEY`)
- super_admin manages key via Settings > อัตราแลกเปลี่ยน screen

**Backup location:** No backup required — column was empty (no data, no constraints, dev only)

**Migration code:** `server/schema-extra.ts` → `runDropBotApiKeyMigration()` (to be commented out after verified on production)
**Caller:** `server/routes/doc-settings-routes.ts`
**Flag:** `DROP_BOT_API_KEY_FROM_GENERAL_SETTINGS_20260507` in `system_config`

**Reason:** Per-company BOT API key design was wrong. Key is platform-level — one key serves all tenants. super_admin sets it once via UI, stored in system_config. No .env file needed.

**Status:** Deployed + comment-out + clean push done ✅ — FLAG=done_2026-05-07T14:45:27.390Z

---

## 2026-05-07 — e-Tax Credit Note Columns (ENTRY #004)

**What changed:**
- Added `etax_sent_at TIMESTAMP` to `sales_credit_notes`
- Added `etax_sent_to TEXT` to `sales_credit_notes`
- Added `etax_sent_cc TEXT` to `sales_credit_notes`
- Added `etax_message_id TEXT` to `sales_credit_notes`

**Backup location:** No backup required — additive columns only (nullable, no existing data touched)

**Migration code:** `server/schema-extra.ts` → `runSalesCreditNoteEtaxMigration()` (commented out after verified)
**Caller:** `server/routes/etax-routes.ts` (call removed after verified)
**Flag:** `ADD_ETAX_COLUMNS_TO_SALES_CREDIT_NOTES_20260507` in `system_config` = `done_2026-05-07T07:09:58.365Z`

**Reason:** e-Tax Invoice ใบลดหนี้ feature requires tracking when and to whom an e-Tax credit note was sent via email (etax_sent_at, etax_sent_to, etax_sent_cc, etax_message_id).

**Status:** Deployed + comment-out + clean push done ✅

---

## 2026-05-08 — general_settings.default_vat_rate ADD COLUMN (ENTRY #005)

**What changed:**
- Added `default_vat_rate TEXT DEFAULT '7'` to `general_settings`

**Backup location:** Not required — ADD COLUMN nullable, no existing data touched. Revert = `DROP COLUMN default_vat_rate FROM general_settings`.

**VERIFY FIRST result (2026-05-08):** Column did NOT exist on production before migration. Table had 4 rows (company IDs: 4, 3822, 3951, 3953).

**Migration code:** `shared/schema-extra.ts` → `runDefaultVatRateMigration()`
**Caller:** `server/routes/doc-settings-routes.ts`
**Flag:** `ADD_DEFAULT_VAT_RATE_TO_GENERAL_SETTINGS_20260508` in `system_config`

**Reason:** VAT rate configurable at company level. Previously hardcoded 7% everywhere. Companies can now set their own default VAT rate (7% / 0%) per company in general settings.

**Status:** ✅ COMPLETE — Flag confirmed on production `done_2026-05-08T01:13:32.161Z`. Column verified. `runDefaultVatRateMigration()` call removed from `doc-settings-routes.ts`. Loop closed 2026-05-13.

---

## 2026-05-09 — Orphan stock_movements from warehouse CSV import (ENTRY #006)

**Type:** Data cleanup (DELETE) — not a schema change

**The unwanted record:**
- Table: `stock_movements`
- `id = 1463`, `product_id = 520`, `movement_type = "initial"`, `notes = "นำเข้าจากไฟล์"`
- `reference_type = NULL`, `reference_id = NULL` — no link to any document

---

**Cause — the reckless design that made this possible:**

`warehouse.tsx` has a "นำเข้าสต๊อกจากไฟล์ CSV" feature. When a user imports stock quantities,
the frontend calls `POST /api/product-stock/bulk-adjust` → server calls `storage.adjustStock()`
→ INSERTs a row into `stock_movements` with `reference_type = NULL` and `reference_id = NULL`.

This is reckless. A programmer who writes a feature that accepts user-supplied data and writes
it unconditionally into a table with no guard, no duplicate check, and no reference anchor,
has chosen to trust that the user will never make a mistake. That is not a boundary a programmer
can control. Any person can import the same Excel file twice — this takes no imagination at all
to foresee. Calling this "by design" and moving on is not production-grade thinking.
At minimum, the programmer should detect that the same product already has an existing initial
stock entry and warn the user: "this looks like it may have already been imported — are you sure?"
Instead, the risk was handed entirely to the user and to chance.

There is no single clear culprit here — the product import also did not prevent duplicate
product codes from creating new rows. Both features failed to respect the boundary between
what the programmer controls (the code) and what the programmer cannot control (the user).

---

**Mistake — what each side failed to do:**

1. `POST /api/product-stock/bulk-adjust`: accepted the import without checking whether an
   `initial` stock_movement already existed for the same product_id. Wrote blindly.

2. Product import (Excel → `/api/products/import`): when a product code already existed,
   it silently created a second product row instead of rejecting or merging.
   The result was `product_id = 520` (`5ST-6-CCTV100B`, `active = false`) — a duplicate
   that no one could see, because inactive products are hidden across all UI dropdowns.

3. The initial stock movement (`stock_movements id = 1463`) then followed the duplicate product,
   not the active one — because it was imported at the time the duplicate existed.

---

**Result — why it blocked everything:**

When `delete-inactive-duplicates` tried to remove `product_id = 520`:
- PostgreSQL FK constraint `stock_movements.product_id → products.id` fired
- The delete was rejected because `stock_movements id = 1463` still references `product_id = 520`
- The record has no document (reference_type = NULL) — invisible in history, reports, and all UI
- It exists only as a silent FK blocker that no user action can reach and no screen can display

---

**Fix procedure — "source file" method (NOT schema-extra):**

This case has a clear source: the product import screen. The fix lives there, not in schema-extra.ts.
schema-extra.ts is reserved for cases where there is no single screen or feature to blame.
Here, import is the culprit — so import is where the cleanup goes.

Why this method requires user interaction — two reasons, not one:
The import screen is also receiving a new safety-net (warn user when importing a product code
that already exists). We do not silently fix data behind the user's back. When the user next
uses the import screen, two things happen at once:
  (1) The one-time DELETE runs — cleaning up the orphan record.
  (2) The user deliberately tries to import the same duplicate product code again —
      to verify with their own eyes that the safety-net fires correctly and warns them.
This is a real-life production test, not just an acknowledgement. We want confirmation
that the guard actually works under real conditions, not just in dev.

Steps:
1. Add a one-time DELETE block inside the import screen's server handler
   (e.g. top-level in `server/routes/products-routes.ts` inside the import endpoint or its register function)
   - DELETE from `stock_movements` WHERE `movement_type = 'initial'` AND `reference_type IS NULL`
     AND `reference_id IS NULL` AND `product_id` IN (inactive duplicate product IDs affected)
   - Guard with a flag in `system_config` to prevent re-running on subsequent calls
2. Add the safety-net duplicate-code warning to the import screen (frontend + backend)
3. Push both files → tell พี่ช้าง to run standard 4-step server command
4. User triggers import screen → cleanup runs once → safety-net is now active
5. Kai connects to production DB (READ-ONLY) → verify the orphan record is gone (Phase 1c)
6. Comment out the DELETE block immediately → leave a note with: date/time executed,
   what it deleted, why, and confirmation it was verified on production DB
7. Push the clean code → log in this file with timestamp

**Backup required:** Yes — backup the target `stock_movements` rows before DELETE runs.
Backup location: `db/backups/YYYY-MM-DD_orphan_stock_movements_before_cleanup.sql`

**Status:** 📝 Documented — awaiting พี่ช้าง authorization to implement

---

## 2026-05-11 — active_products + inactive_products DROP + RECREATE + BACKFILL (ENTRY #007)

**Type:** Destructive DDL + data backfill — DROP TABLE, CREATE TABLE with FK CASCADE, INSERT from products

**What changed:**
- `active_products` — DROP TABLE (no FK constraints on old table) → CREATE with `id REFERENCES products(id) ON DELETE CASCADE` → backfill from `products WHERE active = true`
- `inactive_products` — DROP TABLE (no FK constraints on old table) → CREATE with `id REFERENCES products(id) ON DELETE CASCADE` → backfill from `products WHERE active = false`

**Root cause:**
- 1,094 orphan rows in `active_products` (rows with no matching `products.id` — FK never enforced)
- 1,788 rows missing from `active_products` (products with `active = true` not reflected in split table)
- Tables were created in a previous migration without FK constraints — stale/orphan data accumulated silently

**Backup location:**
- `backup_active_products_20260510` — PostgreSQL table (CREATE TABLE AS SELECT * inside migration Phase 0b, before DROP)
- `backup_inactive_products_20260510` — PostgreSQL table (CREATE TABLE AS SELECT * inside migration Phase 0b, before DROP)
- Backup tables remain in DB until พี่ช้าง manually reviews and clears

**Migration code:** `shared/schema-extra.ts` → `runProductSplitMigration()`
**Caller:** `server/routes/products-routes.ts` → `runProductSplitMigration(db)` inside `registerProductRoutes`
**Flag:** `PRODUCT_SPLIT_MIGRATION_20260510` in `system_config`

**Authorization:** พี่ทราย confirmed 2026-05-11: Choice A — hard DELETE ("ลบแล้วนำเข้าใหม่ได้ แต่ขอให้ลบให้จริงไม่ใช่ซ่อนที่ลบไว้")

**Reason:** active_products and inactive_products are denormalized views of the products table used for performance. The split tables had drifted permanently from the source of truth (products table) because they were never enforced by FK constraints. The only safe recovery was DROP + RECREATE + BACKFILL from the authoritative source.

**Status:** ✅ Fully closed 2026-05-11
- Restart #1: migration ran — FLAG `PRODUCT_SPLIT_MIGRATION_20260510` = `done_2026-05-11T13:35:09.281Z`
- Verify: `active_products` 2,603 | `inactive_products` 778 | `products` 3,381 — 2,603+778=3,381 ✅ | 0 orphan rows ✅
- Restart #2: migration block commented out — commit `98d3dd2c` — block gone permanently

---

## ENTRY #010 — 2026-05-12 — Initial Stock Movement Backfill

**What changed:**
- Inserted 1,091 rows into `stock_movements` (movement_type = `initial`)
- Source: `warehouse_stock_levels` WHERE quantity > 0 AND no existing initial movement for (company_id, product_id)
- Notes pattern: `ตั้งต้นสต๊อก (ตั้งต้น) คลัง {warehouse_name}`
- unit_cost = 0, total_cost = 0, reference_type = NULL, reference_id = NULL
- created_at = '2026-04-01 00:00:00' (วันเปิดบัญชีสต๊อก — กำหนดโดยพี่ทราย 2026-05-12)

**Backup location:** Not required — additive INSERT only, no existing rows modified or deleted.

**Migration code:** `shared/schema-extra.ts` → `runInitialStockMovementBackfill()`
**Caller:** `server/routes/products-routes.ts` (registerProductsRoutes startup)
**Flag:** `INITIAL_STOCK_MOVEMENT_BACKFILL_20260512` in `system_config`
**Value:** `done_2026-05-12T08:06:00.037Z`

**Also fixed in this session:**
- `products-routes.ts` import execute: removed silent try-catch around `stock_movements` INSERT — Rule 0a compliance
- `products-routes.ts` import execute: movement_type already = `initial`, delta-based (qty - prevQty) — correct going forward for new Excel imports

**Reason:** Products imported via Excel before commit `080c7528` (2026-05-11) had stock set directly in `warehouse_stock_levels` without creating any `stock_movements` record. Stock card (สต๊อกการ์ด) showed 0 movements for all products on production. This migration backfills those missing initial entries so the stock card reflects the opening balance correctly.

**Status:** ❌ CANCELLED 2026-05-12
- Dev data cleaned up: 1,091 rows + flag `INITIAL_STOCK_MOVEMENT_BACKFILL_20260512` deleted from dev DB
- Approach changed: user inputs วันที่เริ่มต้นสต๊อก via date picker in Excel import dialog
- `runInitialStockMovementBackfill` commented out from schema-extra.ts — never deployed to production
- Replacement: `stockOpenDate` field added to `/api/products/import/execute` — initial movement uses user-supplied date as `created_at`

---

## INVESTIGATION SESSION — 2026-05-13 — Production DB Full State Audit

**Conducted by:** Kai | **Authorized by:** พี่ช้าง (Technical Authority)

**Purpose:** พี่ช้าง requested a complete separation of all 346 pending dev commits into
List 1 (DB changes) and List 2 (code-only changes), with verified production DB state.

---

### Production DB — Verified State (all queries run directly against deep-main.hopto.org)

**Columns confirmed present on production:**

| Table | Columns | Verified |
|-------|---------|---------|
| `sales_credit_notes` | `original_invoice_amount`, `correct_invoice_amount` | ✅ 2026-05-13 |
| `sales_credit_notes` | `share_token` | ✅ 2026-05-13 — FLAG `ADD_SHARE_TOKEN_TO_SALES_CREDIT_NOTES_2026-04-30` = done |
| `sales_credit_notes` | `return_to_stock`, `return_warehouse_id` | ✅ 2026-05-13 |
| `payment_methods` | `bank_name`, `bank_account_no` | ✅ 2026-05-13 — FLAG `ADD_BANK_INFO_TO_PAYMENT_METHODS_2026-04-29` = done |
| `firm_clients` | `target_db_machine_id` | ✅ 2026-05-13 |
| `line_documents` | `read_at` | ✅ 2026-05-13 |

**Tables confirmed present on production:**

| Table | Row count | Notes |
|-------|-----------|-------|
| `active_products` | 2,603 | FLAG `PRODUCT_SPLIT_MIGRATION_20260510` = done_2026-05-11T13:35:09.281Z ✅ |
| `inactive_products` | 5 | |
| `backup_active_products_20260510` | exists | Backup table — awaiting พี่ช้าง review before clearing |
| `backup_inactive_products_20260510` | exists | Backup table — awaiting พี่ช้าง review before clearing |

**Migration flags confirmed in `system_config` on production:**

| Flag | Value |
|------|-------|
| `PRODUCT_SPLIT_MIGRATION_20260510` | `done_2026-05-11T13:35:09.281Z` |
| `ADD_SHARE_TOKEN_TO_SALES_CREDIT_NOTES_2026-04-30` | `done` |
| `ADD_BANK_INFO_TO_PAYMENT_METHODS_2026-04-29` | `done` |

**Conclusion:** List 1 (DB changes) = ZERO pending. All structure and content changes
already on production. No migration needs to run before code deployment.

---

### Discrepancy Found — products vs split tables

- `products` total: **2,680**
- `active_products` + `inactive_products`: **2,608** (2,603 + 5)
- **Gap: 72 products** in neither split table

**Root cause:** The previous agent ran `runProductSplitMigration` on dev only, with FLAG set to
`done_2026-05-11T13:35:09.281Z`. On production, however, the migration ran while the code had
already been manipulated (cheated) on dev — meaning production data may have been half-baked.

**Decision (พี่ช้าง + พี่ทราย, 2026-05-13):** พี่ทราย will delete all product data on production
and re-import fresh from Excel. No backfill migration needed — delete + re-import is the
chosen remedy.

---

### Critical Finding — Product Split Migration Was Only Half Done

**What was built correctly:**
- `active_products` and `inactive_products` tables with `ON DELETE CASCADE` referencing `products.id`
- `syncProductSplit()` in `server/storage.ts` — correctly moves rows between tables on every create/update/delete
- `bulk-permanent-delete` endpoint — true hard delete, cascades automatically

**What was NOT completed:**
- The `products.active` boolean column is still the **real source of truth** for the entire backend
- **92 places** across `server/routes/` still query `products.active` directly:
  - `commerce-intelligence.ts`, `price-calculator.ts`, `ad-cost-routes.ts`
  - `pos-routes.ts`, `ecommerce-routes.ts`, `notifications-routes.ts`
  - `products-routes.ts`, `storage.ts`, and more
- Because of this, `storage.deleteProduct()` still does `UPDATE products SET active = false` (soft delete)
  before calling `syncProductSplit()` — the `active` column cannot be dropped until all 92 sites are migrated

**Consequence:** The single delete button in the UI is still a **soft delete** (marks `active = false`,
moves to `inactive_products`). Only `bulk-permanent-delete` is a true hard delete.

**What พี่ทราย was worried about:** In the past, "delete" didn't really delete. This is still true
for the single delete button. The new code only truly hard-deletes via the bulk permanent delete path.

---

### ⏳ PENDING FUTURE TASK — Migrate 92 query sites off `products.active`

**Task:** Replace all 92 occurrences of `eq(products.active, true/false)` across `server/routes/`
with queries against `active_products` / `inactive_products` tables.

**Files confirmed containing `products.active` queries (grep 2026-05-13):**
- `server/routes/commerce-intelligence.ts`
- `server/routes/price-calculator.ts`
- `server/routes/ad-cost-routes.ts`
- `server/routes/pos-routes.ts`
- `server/routes/ecommerce-routes.ts`
- `server/routes/notifications-routes.ts`
- `server/routes/products-routes.ts`
- `server/storage.ts`
- (and others — full count: 92 occurrences)

**When this task is complete:**
- `products.active` column becomes redundant and can be removed from `products` table
- `storage.deleteProduct()` should be changed to a true hard delete (matching bulk-permanent-delete)
- Single delete button in UI will truly delete, not soft-delete
- No more dual-maintenance of `products.active` + split tables

**Who authorized this note:** พี่ช้าง — 2026-05-13
**Priority:** Scheduled for a future sprint — do NOT begin without พี่ช้าง approval

---

## 2026-05-16 — products unique index (company_id, code) (ENTRY #008)

**What:** Added DB-level unique index on `products(company_id, code)`.

**Why:** `code` was only `notNull()` with no uniqueness constraint at DB level. Uniqueness was enforced only by application-level `findDuplicateProducts()` check — race conditions on concurrent inserts or bulk imports could silently create duplicate codes within the same company, breaking QR scanner lookup and product search.

**SQL run on dev (2026-05-16):**
```sql
CREATE UNIQUE INDEX products_company_id_code_unique ON products (company_id, code);
```

**Pre-check:** Confirmed zero existing `(company_id, code)` duplicates before creating index.

**Error handling added:** `POST /api/products` and `PATCH /api/products/:id` both now catch PostgreSQL error code `23505` with constraint `products_company_id_code_unique` and return `409 { message: "รหัสสินค้า ... ถูกใช้แล้ว", field: "code" }` — no 500 crash.

**⚠️ MUST RUN ON PRODUCTION BEFORE DEPLOYMENT:**
```sql
CREATE UNIQUE INDEX products_company_id_code_unique ON products (company_id, code);
```
Verify no duplicates first:
```sql
SELECT company_id, code, COUNT(*) FROM products GROUP BY company_id, code HAVING COUNT(*) > 1;
```

**Authorized by:** พี่ช้าง — 2026-05-16

---

## 2026-05-17 — material_issues + material_issue_items tables (ENTRY #009)

**What changed:**
- Added `material_issues` table: id, company_id, issue_no, mo_id (FK→manufacturing_orders), issued_by_user_id (FK→users), notes, status (draft/confirmed), issued_at
- Added `material_issue_items` table: id, material_issue_id (FK→material_issues ON DELETE CASCADE), product_id, product_name, lot_id, lot_number, quantity, unit

**Backup location:** No backup required — new tables (no existing data affected)

**Migration code:** `shared/schema-extra.ts` → `runMaterialIssueMigration()`
**Caller (after 2026-05-20 refactor):** `server/migrations-runner.ts` → `runPendingMigrations()` → called from `server/index-extra.ts` startup
**Flag:** `CREATE_MATERIAL_ISSUE_TABLES_20260517` in `system_config`

**Actual prod state (discovered 2026-05-20 via schema:diff):**
- Tables `material_issues` + `material_issue_items` already existed on prod (pushed by earlier session — not recorded)
- Column `from_warehouse_id` was MISSING on prod → patched: migration now includes `ALTER TABLE material_issues ADD COLUMN IF NOT EXISTS from_warehouse_id INTEGER`
- Flag `CREATE_MATERIAL_ISSUE_TABLES_20260517` was NOT set on prod before deploy

**Lesson learned (2026-05-20):** Production runs `node dist/index.cjs` — deploy command MUST include `npm run build` before `pm2 start` or server runs stale compiled code silently. Rule added to replit.md + handoff.md.

**Reason:** Task #35 — เบิกวัตถุดิบล็อตเข้าไลน์ผลิตด้วย QR Scan. New module for issuing raw materials to production lines, with QR scan support for employee cards and product lot labels.

**Status:** ✅ CONFIRMED on production 2026-05-20 12:21 Bangkok — flag `done_2026-05-20 12:21:57.506835+07`, `from_warehouse_id` column EXISTS. Commits: `585cd33` (schema-extra), `845583b` (migrations-runner NEW), `b4fc9d6` (products-routes), `40c80c7` (index-extra).

---

## 2026-05-17 — production_receipts + production_receipt_items tables (ENTRY #011)

**What changed:**
- Added `production_receipts` table: id, company_id, receipt_no, mo_id (FK→manufacturing_orders), received_by_user_id (FK→users), to_warehouse_id, notes, status (draft/confirmed), received_at
- Added `production_receipt_items` table: id, production_receipt_id (FK→production_receipts ON DELETE CASCADE), product_id, product_name, lot_id, lot_number, quantity, unit

**Backup location:** No backup required — new tables (no existing data affected)

**Migration code:** `shared/schema-extra.ts` → `runProductionFinishMigration()`
**Flag:** `CREATE_PRODUCTION_FINISH_TABLES_20260517` in `system_config`
**Production DB verified:** 2026-05-21 — tables existed already (CREATE IF NOT EXISTS skipped). Flag = `done_2026-05-21 16:28:12.483517+07`
**Status:** ✅ CONFIRMED on production 2026-05-21. Commits: `3e43ad9` (uncomment), `40accd1` (schema-extra), `5cf60e9` (clean re-comment)

---

## 2026-05-17 — lot_low_stock_threshold column on general_settings (ENTRY #012a)

**What changed:**
- Added `lot_low_stock_threshold INTEGER DEFAULT 10` column to `general_settings`
- Company-wide fallback threshold for lot low-stock warnings (product-level takes priority)

**Backup location:** No backup required — pure ADD COLUMN with default (no data affected)

**Migration code:** `shared/schema-extra.ts` → `runLotLowStockThresholdMigration()`
**Flag:** `ADD_LOT_LOW_STOCK_THRESHOLD_TO_GENERAL_SETTINGS_20260517` in `system_config`
**Note:** Column was previously in `shared/schema.ts` (removed — now handled via raw SQL migration only)
**Production DB verified:** 2026-05-21 — column `lot_low_stock_threshold INTEGER` confirmed present. Flag = `done_2026-05-21 16:28:12.586352+07`
**Status:** ✅ CONFIRMED on production 2026-05-21. Commits: `3e43ad9` (uncomment), `40accd1` (schema-extra), `5cf60e9` (clean re-comment)

---

## 2026-05-17 — ncr_reports table (ENTRY #012b)

**What changed:**
- Added `ncr_reports` table: id, company_id, ncr_no, mo_id, product_id, product_name, defect_qty, defect_type, description, corrective_action, status (open/closed), created_by, created_at, closed_at

**Backup location:** No backup required — new table

**Migration code:** `shared/schema-extra.ts` → `runNcrMigration()`
**Flag:** `CREATE_NCR_REPORTS_TABLE_20260517` in `system_config`
**Production DB verified:** 2026-05-21 — table existed already (CREATE IF NOT EXISTS skipped). Flag = `done_2026-05-21 16:28:12.487363+07`
**Status:** ✅ CONFIRMED on production 2026-05-21. Commits: `3e43ad9` (uncomment), `40accd1` (schema-extra), `5cf60e9` (clean re-comment)

---

## 2026-05-17 — warehouse columns on mfg tables (ENTRY #012c / runWarehouseColumnsForMfgMigration)

**What changed:**
- `ALTER TABLE material_issues ADD COLUMN IF NOT EXISTS from_warehouse_id INTEGER`
- `ALTER TABLE production_receipts ADD COLUMN IF NOT EXISTS to_warehouse_id INTEGER`

**Backup location:** No backup required — ADD COLUMN IF NOT EXISTS (safe)

**Migration code:** `shared/schema-extra.ts` → `runWarehouseColumnsForMfgMigration()`
**Flag:** `ADD_WAREHOUSE_COLS_TO_MFG_TABLES_20260517` in `system_config`
**Production DB verified:** 2026-05-21 — `to_warehouse_id` added to `production_receipts` ✅, `from_warehouse_id` already existed (IF NOT EXISTS skipped). Flag = `done_2026-05-21 16:28:12.528841+07`
**Status:** ✅ CONFIRMED on production 2026-05-21. Commits: `3e43ad9` (uncomment), `40accd1` (schema-extra), `5cf60e9` (clean re-comment)

---

## 2026-05-17 — bom_process_steps + mo_process_logs tables (ENTRY #013)

**What changed:**
- Added `bom_process_steps` table: id, bom_id (FK→bom_headers ON DELETE CASCADE), step_no, name, description, created_at + index on bom_id
- Added `mo_process_logs` table: id, mo_id (FK→manufacturing_orders ON DELETE CASCADE), step_no, step_name, qty_passed, notes, logged_by_employee_id, logged_by_name, logged_at + index on mo_id

**Backup location:** No backup required — new tables

**Migration code:** `shared/schema-extra.ts` → `runBomProcessStepsMigration()`
**Flag:** `CREATE_BOM_PROCESS_STEPS_AND_MO_PROCESS_LOGS_20260517` in `system_config`
**Reason:** Task #68 — ขั้นตอนการผลิตต่อ BOM + Scan Station
**Production DB verified:** 2026-05-21 — tables existed already (CREATE IF NOT EXISTS skipped). Flag = `done_2026-05-21 16:28:12.521994+07`
**Status:** ✅ CONFIRMED on production 2026-05-21. Commits: `3e43ad9` (uncomment), `40accd1` (schema-extra), `5cf60e9` (clean re-comment)

---

## 2026-05-22 — RD VAT cache tables (ENTRY #016)

**What changed:**
- Created new table `rd_vat_cache(id, tax_id, branch_number, name, address, branch_label, fetched_at, UNIQUE(tax_id, branch_number))` + index on `tax_id`
- Created new table `rd_crawl_status(tax_id PK, started_at, completed_at, total_found)` — tracks background sequential crawl progress per tax_id
- No existing data affected — purely new tables

**Backup location:** No backup required — new tables, no existing rows

**Migration code:** `shared/schema-extra.ts` → `runRdVatCacheMigration()`
**Caller:** `server/migrations-runner.ts` (central runner)
**Flag:** `CREATE_RD_VAT_CACHE_TABLES_20260522` in `system_config`
**Reason:** N15 — sequential background SOAP crawler to pre-warm branch data from กรมสรรพากร. Fixes unreliable parallel SOAP in dev sandbox; improves production repeat-lookup speed.

**Dev DB verified:** 2026-05-22 04:22 — `[migration] ✅ rd_vat_cache + rd_crawl_status tables created`
**Status:** 🔄 Active in dev — awaiting push approval from พี่ช้าง

---

## 2026-05-22 — payment_type column on payment_methods (ENTRY #015)

**What changed:**
- Added `payment_type TEXT` (nullable) to `payment_methods`
- Enables N4 two-tab UI: รับเงิน / จ่ายเงิน filtering by `payment_type = 'receive' | 'pay'`

**Backup location:** No backup required — ADD COLUMN nullable, no default, no existing data affected (Rule 4)

**Migration code:** `shared/schema-extra.ts` → `runPaymentTypeColumnMigration()`
**Caller:** `server/migrations-runner.ts` (central runner called from `server/index-extra.ts`)
**Flag:** `ADD_PAYMENT_TYPE_TO_PAYMENT_METHODS_20260522` in `system_config`
**Reason:** `payment-methods-routes.ts` deployed (ACE Batch 2026-05-21) references `payment_type` in every SELECT/INSERT/UPDATE/WHERE — production DB missing column → error on all PM operations. Root cause: column was added to dev DB directly (db:push) without migration function. Fix: migration function with no `IF NOT EXISTS` fallback per Rule 0a.

**Production DB verified:** 2026-05-22 — confirmed absent by error: `column "payment_type" of relation "payment_methods" does not exist`
**Status:** 🔄 Migration active — awaiting push approval from พี่ช้าง

---

## 2026-05-17 — wip_warehouse_id column on manufacturing_orders (ENTRY #014)

**What changed:**
- Added `wip_warehouse_id INTEGER` column to `manufacturing_orders`
- Supports Raw Material → WIP → Finished Goods warehouse flow

**Backup location:** No backup required — ADD COLUMN (no existing data affected)

**Migration code:** `shared/schema-extra.ts` → `runWipWarehouseMigration()`
**Flag:** `ADD_WIP_WAREHOUSE_TO_MFG_ORDERS_20260517` in `system_config`
**Production DB verified:** 2026-05-21 — column `wip_warehouse_id INTEGER` confirmed present on `manufacturing_orders`. Flag = `done_2026-05-21 16:28:12.547895+07`
**Status:** ✅ CONFIRMED on production 2026-05-21. Commits: `3e43ad9` (uncomment), `40accd1` (schema-extra), `5cf60e9` (clean re-comment)
