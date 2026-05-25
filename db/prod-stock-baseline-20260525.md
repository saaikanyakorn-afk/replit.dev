# Production Database Baseline — Stock Tables
## Verified by Kai (2026-05-25) — SELECT only, no mutations

**Connection:** deep-main.hopto.org:20541 → db `etax-production` user `etaxusr`

---

## Table: `stock_movements`

### Columns (14 columns — verified on production)

| ordinal | column_name   | data_type                   | nullable | default                              |
|---------|---------------|-----------------------------|----------|--------------------------------------|
| 1       | id            | integer                     | NO       | nextval('stock_movements_id_seq')    |
| 2       | company_id    | integer                     | NO       |                                      |
| 3       | product_id    | integer                     | NO       |                                      |
| 4       | movement_type | text                        | NO       |                                      |
| 5       | quantity      | numeric                     | NO       |                                      |
| 6       | reference_type| text                        | YES      |                                      |
| 7       | reference_id  | integer                     | YES      |                                      |
| 8       | notes         | text                        | YES      |                                      |
| 9       | created_at    | timestamp without time zone | YES      | now()                                |
| 10      | unit_cost     | numeric                     | YES      | 0                                    |
| 11      | total_cost    | numeric                     | YES      | 0                                    |
| 12      | reference_no  | text                        | YES      |                                      |
| 13      | created_by    | integer                     | YES      |                                      |
| 14      | lot_id        | integer                     | YES      |                                      |

### ❌ `warehouse_id` column — DOES NOT EXIST on production

Migration `N16` (runStockMovementWarehouseMigration) has NOT run on production.
Column must be added before any code that writes `warehouse_id` to `stock_movements` can be deployed.

### Row counts (1,306 total rows)

| movement_type | reference_type   | count |
|---------------|------------------|-------|
| initial       | (null)           | 1,098 |
| receive       | (null)           |   181 |
| sale_deduct   | tax_invoice      |    13 |
| sale_deduct   | invoice          |    12 |
| goods_in      | purchase_invoice |     2 |

---

## Table: `warehouse_stock_levels`

### Columns (9 columns — verified on production)

| ordinal | column_name  | data_type                   | nullable |
|---------|--------------|-----------------------------|----------|
| 1       | id           | integer                     | NO       |
| 2       | warehouse_id | integer                     | NO       |
| 3       | product_id   | integer                     | NO       |
| 4       | company_id   | integer                     | NO       |
| 5       | quantity     | numeric                     | NO       |
| 6       | reserved_qty | numeric                     | NO       |
| 7       | min_stock    | numeric                     | YES      |
| 8       | max_stock    | numeric                     | YES      |
| 9       | updated_at   | timestamp without time zone | YES      |

### ✅ `warehouse_stock_levels` — EXISTS and has correct structure

---

## Summary — What production really needs

| Item | Status | Action needed |
|------|--------|---------------|
| `stock_movements.warehouse_id` | ❌ NOT on production | Must run migration (N16) before deploying code that writes this column |
| `warehouse_stock_levels` table | ✅ Exists, correct schema | No migration needed |

---

## Implication for N16 deployment

Code in dev that already writes `warehouse_id` to `stock_movements`:
- `server/storage.ts` — `adjustStock()` sends `warehouseId`
- `server/route-helpers.ts` — `deductStockBundleAware()` passes `warehouseId`
- `server/routes/purchase-routes.ts` — AP PATCH sets `warehouse_id`

If these files are pushed to production **before** the migration runs → production will error on every stock movement write.

**Correct order:** Migration (N16) must run first → verify column exists → then push code files.

---

_Baseline recorded: 2026-05-25 by Kai (mid-session replacement agent)_
_Source: direct SELECT on deep-main.hopto.org:20541/etax-production — read-only, no mutations made_
