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

**Status:** 🔄 Migration active — awaiting deploy + verify + comment-out

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
