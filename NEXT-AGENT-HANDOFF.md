# Next Agent Handoff (updated 2026-05-12)

Read this file first before touching anything.

---

## ENTRY #016: Payment methods — ลบ hard-coded options, ใช้จาก settings (2026-05-12)

### ปัญหา
4 ฟอร์มมี dropdown วิธีชำระเงิน hard-coded (cash/transfer/credit_card) แทนที่จะดึงจาก `/api/payment-methods?companyId=` ทำให้:
- ผู้ใช้ตั้งค่าช่องทางรับเงินใน Settings → Payment Methods แล้ว แต่ฟอร์มไม่แสดง
- journal ไม่ได้ลงบัญชีตามที่ตั้งค่าไว้ (resolvePaymentMethodAccountCode อ่านจาก DB ถูก แต่ dropdown ส่ง value ผิด)

### Fix
| ไฟล์ | สิ่งที่แก้ |
|---|---|
| `receipt-form.tsx` | ลบ fallback hard-coded block → `activePaymentMethods.map(...)` เสมอ |
| `credit-note-form.tsx` | ลบ fallback hard-coded block → `activePaymentMethods.map(...)` เสมอ |
| `purchase-invoice.tsx` | ลบ fallback hard-coded block → `activePaymentMethods.map(...)` เสมอ |
| `sales-order-form.tsx` | เพิ่ม `useQuery(["/api/payment-methods", companyId])` + `activePaymentMethods` filter (ไม่รวม Credit) + แทน hard-coded SelectItems |

### Note
- `receipt-form`, `credit-note-form`, `purchase-invoice` มี `activePaymentMethods` จาก API อยู่แล้ว — แค่มี ternary fallback hard-coded → ลบออก
- SO form ไม่มี payment-methods query เลย → ต้องเพิ่มใหม่ + filter ไม่รวม Credit (SO ไม่ใช้ credit)
- `resolvePaymentMethodAccountCode` บน backend ทำงานถูกอยู่แล้ว — journal ลงบัญชีตาม accountCode ที่ตั้งใน payment_methods table

### Status: Dev ✅ — รอพี่ช้าง authorize push production

---

## ENTRY #015: ผังบัญชี — เปลี่ยน businessType เป็น trading (2026-05-12)

### ปัญหา
บริษัท พลังแสง จำกัด (id=3684) เป็นบริษัท**ซื้อมาขายไป** แต่ `companies.business_type = 'mixed'`
→ `createAutoJournalEntry` เลือก `4100100 Service Revenue` แทน `4001000 Sales`

### revenueMap logic ใน route-helpers.ts (line ~345)
```
trading  → 4001000 รายได้จากการขายสินค้า  ✓
mixed    → 4100100 รายได้จากการให้บริการ  ✗
service  → 4100100 รายได้จากการให้บริการ
```

### Fix
1. **DB**: `UPDATE companies SET business_type='trading' WHERE id=3684` ✓
   → TIV ใหม่ทุกใบจะ journal ไปที่ 4001000 (Sales) อัตโนมัติ
2. **DB**: แก้ journal line ที่มีอยู่แล้วของ TIV6900001 (journal_entry id=12776):
   - ก่อน: account_id=1747741 (4100100 Service Revenue) CR 4,000
   - หลัง: account_id=1747736 (4001000 Sales) CR 4,000 ✓
3. **DB**: company 3684 ไม่มี custom `accounting_formulas` สำหรับ tax_invoice
   → ใช้ revenueMap default ทั้งหมด → แก้ businessType เพียงพอ

### Journal TIV6900001 หลัง fix
| Account | DR | CR |
|---|---|---|
| 1201000 ลูกหนี้การค้า | 4,280 | - |
| 2341000 ภาษีขาย | - | 280 |
| **4001000 รายได้จากการขายสินค้า** | - | **4,000** |

### Note สำหรับ production
Production DB ยังมี `business_type='mixed'` → ต้องรัน UPDATE เดียวกันหลัง push:
```sql
UPDATE companies SET business_type='trading' WHERE id=3684;
```
และตรวจ journal entries เก่าที่อาจใช้ 4100100 (อาจต้องแก้ manual ทีละใบ)

### Status: Dev ✅ — รอพี่ช้าง authorize push production

---

## ENTRY #014: Bug fixes — TIV Cash→Credit + stock card navigation (2026-05-12)

### Bug 5: TIV จาก SO แสดง "Cash[SO-TIV]" แทน "Credit[TIV]" + ถูก mark paid ผิด
**Root cause**: Effect ใน `tax-invoice-form.tsx` (line 399-406 เดิม):
```js
if (isNew && activePaymentMethods.length > 0 && form.paymentMethod === "เครดิต") {
  setForm(p => ({ ...p, paymentMethod: defaultMethod.accountCode }));
}
```
Fire ทุกครั้งที่โหลด form ใหม่ → override "เครดิต" (default) ด้วย accountCode ของธนาคาร (e.g. "1201000") → TIV CREATE route เห็น paymentMethod ≠ "เครดิต" → `status='paid'`, `paymentStatus='paid'` ทันที
และ dropdown "เครดิต (ตั้งลูกหนี้)" ซ่อนสำหรับ new TIV → ผู้ใช้เลือก credit ไม่ได้
**Fix**:
1. ลบ effect ที่ override "เครดิต" ออกทั้งก้อน (`tax-invoice-form.tsx`)
2. เปลี่ยน condition dropdown: `activePaymentMethods.length === 0 || form.paymentMethod === "เครดิต"` (เปิดให้เห็น "เครดิต" ตลอดเมื่อ form มีค่า "เครดิต" ทั้ง new และ edit)
3. DB fix TIV6900001 (id=10028): `payment_method='เครดิต'`, `payment_status='pending'`, `status='approved'` ✓
**Note**: Journal entry ของ TIV6900001 (SV6900001) ถูกต้องอยู่แล้ว — DR: 1201000 ลูกหนี้การค้า 4,280 / CR: VAT 280 + Revenue 4,000

### Bug 6: Stock card กดเลขเอกสารวิ่งไปหน้า edit โดยตรง
**Fix**: `REF_TYPE_LABELS` ใน `stock-card.tsx` — เปลี่ยน path จาก `/edit` / `/form` → list path:
- `goods_receiving/form` → `/inventory/receiving`
- `goods_requisition/form` → `/inventory/requisition`  
- `invoice/edit` → `/sales/invoice`
- `tax_invoice/edit` → `/sales/tax-invoice`
- `purchase_order/edit` → `/purchases/po`
- `purchase_invoice/edit` → `/purchases/ap`
และ `handleRefClick`: ลบ `/${refId}` ออก → navigate ไปแค่ list path

### Files changed
| File | สิ่งที่แก้ |
|---|---|
| `client/src/pages/sales/tax-invoice-form.tsx` | ลบ effect override "เครดิต"; เปิด dropdown เครดิต สำหรับ form ที่มีค่า "เครดิต" |
| `client/src/pages/inventory/stock-card.tsx` | `REF_TYPE_LABELS` → list paths; `handleRefClick` ไม่ append `/{id}` |
| DB: `tax_invoices` id=10028 | manual fix: payment_method/status/paymentStatus |

### Status: Dev ✅ — รอพี่ช้าง authorize push production

---

## ENTRY #013: Bug fixes — TIV reservation release + ต้นทุน/หน่วย ฿0.00 (2026-05-12)

### Bug 3: SO reservation ไม่ถูก release หลัง TIV สร้างสำเร็จ
**Root cause**: TIV CREATE route (`/api/tax-invoices` POST) ไม่มีการเรียก `releaseSOStock` เลย ต่างจาก IV CREATE ที่มีที่ line ~1058 (ใช้ `result.salesOrderId`). TIV table ไม่มี `salesOrderId` column ใน schema → ต้องใช้ `body.refDoc` แทน
**Fix**: เพิ่ม block หลัง `deductStockBundleAware` (line ~2096) ใน `sales-docs-routes.ts`:
- ถ้า `body.refDoc` ขึ้นต้นด้วย `"SO"` → `SELECT id FROM sales_orders WHERE order_no = refDoc` → `fetchSalesOrderItems(soId)` → `releaseSOStock(soItems, companyId)`
- ใช้ raw SQL (`db.execute(sql\`...\``) เพราะ `salesOrders.orderNo` อาจไม่ match column ใน schema
**DB manual fix**: SO6900001 reservation ค้างอยู่ (TIV สร้างไปก่อน fix) → `UPDATE warehouse_stock_levels SET reserved_qty=0 WHERE product_id=5399 AND warehouse_id=32` + `UPDATE product_stock SET reserved_qty=0 WHERE product_id=5399` ✓

### Bug 4: ต้นทุน/หน่วย = ฿0.00 ในหน้าคลังสินค้า / Stock card
**Root cause**: ยอดต้น (initial) stock_movements ถูกสร้างด้วย `unit_cost=0` (ไม่ได้ใส่ cost ตอน import). `inventory-costing.ts:calculateMovingAverage()` คำนวณ running avg จาก inbound movements → avg=0 → ต้นทุนทั้งหมด=0
**`product_stock` table ไม่มี `avgCost` column** — cost คำนวณ live จาก stock_movements เสมอ
**Fix**: DB backfill 779 rows:
```sql
UPDATE stock_movements sm
SET unit_cost = p.cost, total_cost = ROUND(ABS(sm.quantity) * p.cost, 2)
FROM products p
WHERE sm.product_id = p.id AND sm.company_id = p.company_id
  AND sm.movement_type = 'initial' AND sm.unit_cost = 0
  AND sm.company_id = 3684 AND p.cost > 0;
```
315 rows ที่เหลือ (unit_cost=0) = products ที่ `products.cost=0` จริงๆ (ไม่มี cost ใน master) → ถูกต้องแล้ว ไม่ต้อง fix

### Moving average ของ product 5399 หลัง fix:
- id=14924: initial 77u × ฿360 = ฿27,720
- id=14925: initial 5u × ฿360 = ฿1,800 → runningQty=82, runningAvg=฿360
- id=16019: sale_deduct -10u ที่ avg=฿360 → cost=฿3,600, กำไร=ราคาขาย-3600
- คงเหลือ: 72u × ฿360 = ฿25,920 ✓

### Files changed
| File | สิ่งที่แก้ |
|---|---|
| `server/routes/sales-docs-routes.ts` | TIV CREATE: เพิ่ม SO reservation release block (~line 2096) |
| DB: `stock_movements` | backfill 779 rows: unit_cost + total_cost จาก product.cost |
| DB: `warehouse_stock_levels` | manual reset reserved_qty=0 สำหรับ product 5399 warehouse 32 |
| DB: `product_stock` | manual reset reserved_qty=0 สำหรับ product 5399 |

### PENDING: push to production (#57–#63 pending — พี่ช้าง authorize)
DB backfill ทำบน dev DB แล้ว — production DB ยังไม่ได้แก้ (รอ push พร้อม migrate script)

---

## ROLES

- **พี่ช้าง** = Technical Authority — all production pushes require explicit authorization from พี่ช้าง
- **พี่ทราย** = Business Owner — tests on dev screen, approves UX/business behavior, cannot authorize production push

---

## ENTRY #011: Bug fixes — QO related docs + SO reservation display (2026-05-12)

### Bug 1: QO related docs ไม่โชว์ SO ("ไม่พบเอกสารที่เกี่ยวข้อง")
**Root cause**: `salesOrders.quotationId` ไม่มีใน Drizzle schema (salesOrders table ไม่มี column นี้) → Drizzle throw runtime error → API return 500 → frontend `res.ok = false` → แสดง empty
**Fix**: 2 จุด ใน `sales-docs-routes.ts`:
1. Related-docs route (line ~3075): เปลี่ยนจาก `db.select()...eq(salesOrders.quotationId, id)` → raw SQL `SELECT ... WHERE quotation_id = ${id}`
2. QO list route (line ~402): เปลี่ยน `soRows` จาก Drizzle query → raw SQL (รองรับ `quotation_id = ANY(${qIds})`)
**Verified**: DB simulation → SO6900001 พบจาก QO6900001 ✓

### Bug 2: ระบบจองแสดง "จอง 0" ในหน้าคลังสินค้า
**Root cause**: `upsertWarehouseReservedQty` แก้ `warehouseStockLevels.reservedQty` เท่านั้น แต่หน้าคลังสินค้าอ่านจาก `productStock.reservedQty` (คนละ table)
**Fix**: ใน `upsertWarehouseReservedQty` (route-helpers.ts) เพิ่ม sync step:
หลังอัปเดต warehouseStockLevels → SUM(`reserved_qty`) across all warehouses for this product → UPDATE `product_stock.reserved_qty`
**DB one-time fix**: `UPDATE product_stock SET reserved_qty = SUM(wsl.reserved_qty) ... WHERE company_id=3684` → 766 rows updated ✓
**Verified**: product_stock product_id=5399 → reserved_qty=10 ✓

### Files changed (in addition to ENTRY #010)
| File | สิ่งที่แก้ |
|---|---|
| `server/route-helpers.ts` | `upsertWarehouseReservedQty`: เพิ่ม productStock sync step |
| `server/routes/sales-docs-routes.ts` | related-docs route: raw SQL แทน `salesOrders.quotationId`; QO list route: soRows raw SQL |

### PENDING: push to production (#57–#62 all pending — SAME file set, same command)

---

## ENTRY #012: Bug fix — Payment method dropdown double-checkmark (2026-05-12)

### อาการ
ใน TIV form (และ form อื่นๆ) dropdown วิธีชำระเงินแสดง ✓ สองตัวพร้อมกัน เช่น "BBL" และ "พร้อมเพย์" ถูก tick พร้อมกัน

### Root cause
Payment methods id=87 (Bank Transfer/BBL) และ id=90 (PromptPay) ใช้ `accountCode = "1011000"` ซ้ำกัน → `<SelectItem value={m.accountCode}>` ทั้งสองตัวมี value เดียวกัน → Radix UI Select เลยแสดง checkmark ทั้งสองตัว

### Fix
เปลี่ยน SelectItem ให้ใช้ `value={\`pm_${m.id}\`}` (unique per item) แทน `value={m.accountCode}` และเพิ่ม helper ใน `value` prop + `onValueChange` ของ Select เพื่อ convert ระหว่าง `pm_{id}` กับ `accountCode` — `form.paymentMethod` ยังเก็บ accountCode เหมือนเดิม (backward compat)

### Files changed
| File | จุดที่แก้ |
|---|---|
| `client/src/pages/sales/tax-invoice-form.tsx` | Select วิธีชำระเงินใน TIV form |
| `client/src/pages/sales/receipt-form.tsx` | Select วิธีรับเงินใน receipt form |
| `client/src/pages/purchases/debit-note-form.tsx` | Select วิธีชำระเงินใน debit-note |
| `client/src/pages/finance/billing-notes.tsx` | Select วิธีรับเงิน + วิธีชำระเงิน (2 จุด) |

---

## ENTRY #010: SO Stock Reservation System — IMPLEMENTED (2026-05-12)

### What was built
ระบบจอง stock เมื่อสร้าง SO และ release เมื่อ SO ถูกลบ/แก้ไข หรือสร้าง IV จาก SO

### Files changed
| File | สิ่งที่เพิ่ม/แก้ |
|---|---|
| `server/route-helpers.ts` | `upsertWarehouseReservedQty(companyId, productId, warehouseId, delta)` — floor at 0 |
| `server/routes/sales-docs-routes.ts` | import `warehouses, warehouseStockLevels`; import `upsertWarehouseReservedQty`; helpers `getCompanySingleWarehouseId`, `reserveSOStock`, `releaseSOStock`; SO CREATE/UPDATE/DELETE; IV CREATE |
| `client/src/pages/sales/sales-order-form.tsx` | handleSubmit: if `warehouses.length > 1` + any product item missing warehouseId → toast error + return |

### Logic detail
- **SO CREATE** → `reserveSOStock(savedItems, companyId)` — เพิ่ม `reserved_qty` ทุก item
- **SO UPDATE** → `releaseSOStock(oldItems)` แล้ว `reserveSOStock(savedItems)` — release เก่า จอง ใหม่
- **SO DELETE** → `releaseSOStock(soItemsForRelease)` หลัง delete transaction
- **IV CREATE** (เมื่อ `salesOrderId` มีค่า) → `releaseSOStock(soItems)` หลัง deductStock
- **Single-warehouse company**: `getCompanySingleWarehouseId()` คืน warehouseId อัตโนมัติ → ไม่ต้อง frontend change
- **Multi-warehouse company**: frontend บล็อก save ถ้า product item ไม่มี warehouseId

### Dev compile
✅ server started on port 5000 — ไม่มี TS error

### PENDING: push to production (#57–#61 all pending)
```
git fetch origin
git checkout origin/main -- server/route-helpers.ts server/routes/sales-docs-routes.ts server/routes/products-routes.ts client/src/pages/inventory/inventory-list.tsx client/src/pages/sales/sales-order-form.tsx
npm run build
pm2 restart etax-center
```

### ⚠️ ยังรอพี่ช้าง authorize push ทั้ง #57–#61

---

## ENTRY #009: Expense 400 timeout — root cause found & fixed (2026-05-11)

### Root cause
`getNextJournalEntryNo()` ถูกเรียก **ภายใน** `db.transaction(async (tx) => { ... })` ทั้ง 3 จุด แต่ไม่ส่ง `tx` ไปด้วย ทำให้ function ใช้ `db` (global pool) แทน → ทุก expense POST/PATCH ต้อง acquire **2 DB connections** พร้อมกัน (1 สำหรับ transaction + 1 สำหรับ helper) แทนที่จะใช้แค่ 1

เมื่อ production มี concurrent users หลายคน pool (max=25) หมดเร็ว → `connectionTimeoutMillis: 10000` หมด → pg throw `"timeout exceeded when trying to connect"` → catch block คืน HTTP 400

### Fix (expense-routes.ts — 3 lines เปลี่ยน)
| Route | Line เดิม | Fix |
|---|---|---|
| POST /api/expenses | `getNextJournalEntryNo(doc.companyId, "payment", doc.expDate)` | + `, tx` |
| PATCH /api/expenses/:id | `getNextJournalEntryNo(txUpdated.companyId, "payment", txUpdated.expDate)` | + `, tx` |
| POST /api/expenses/:id/clone | `getNextJournalEntryNo(newDoc.companyId, "payment", newDoc.expDate)` | + `, tx` |

Dev server compiles & starts OK ✓

### Files to add to push list
- `server/routes/expense-routes.ts` — 3 lines fixed

### Note for next session
`resolvePaymentMethodAccountCode()` in route-helpers.ts ก็ hardcode `db` (ไม่รับ tx) และถูกเรียกใน transaction เช่นกัน (expense lines 414, 647) — เป็น secondary leak แก้ได้โดยเพิ่ม optional `dbConn` param เหมือน getNextDocNo แต่ยังไม่ emergency

---

## What was done this session (2026-05-11) — ENTRY #008: Inventory fixes

### 1. Deactivate/Reactivate buttons (inventory-list.tsx)
- XCircle (amber) = deactivate active product per row
- CheckCircle2 (green) = reactivate inactive product per row
- พี่ทราย tested ✓

### 2. Stock Card fixed — was always returning 400 error
Root cause: `server/routes/products-routes.ts` had 4 dynamic imports using `"./inventory-costing"` (wrong path — file is at `server/inventory-costing.ts` not `server/routes/inventory-costing.ts`). All inventory report APIs (stock-card, valuation, movement-summary, slow-moving) returned 400.
- Fixed: changed all 4 to `"../inventory-costing"` ✅

### 3. Stock movements backfilled for company 3684
- 1,093 `initial` stock_movements (2026-04-23) from warehouse_stock_levels
- 1 `sale_deduct` for TIV6900001 (product 3775, -1 unit, 2026-05-11)
- product_stock = 81, warehouse_stock_levels warehouse 32 = 76

### 4. Product Excel import now creates stock_movements
- `products-routes.ts` import route: INSERT `initial` movement for each warehouse stock set (delta from prev qty)

### 5. Silent catch fixed (sales-docs-routes.ts)
- Invoice deduction (line ~1018) and TIV deduction (line ~2041): `.catch(() => {})` → now `.catch((err) => console.error(...))`

### 6. Bulk permanent delete — show referenced documents
- Backend: added docs query (QT/SO/IV/TIV/receipt/PO/AP/POS/GR/GIQ) for skipped products, returns `docs: string[]`
- Frontend (inventory-list.tsx): shows ↳ doc list under each skipped product in dialog

### 7. Bulk permanent delete — stock_movements no longer blocks deletion
- Removed `stock_movements` from FK ref check (it is audit history, not a document)
- Added `DELETE FROM stock_movements WHERE product_id = ANY(...)` inside delete transaction (cascade cleanup)
- พี่ทราย tested all flows ✓

---

## NEXT STEPS (waiting for พี่ช้าง authorization)

### Files to push (same set as ENTRY #007 + new fixes):
- `shared/schema-extra.ts` — active_products/inactive_products DDL + migration
- `server/storage.ts` — syncProductSplit helper
- `server/routes/products-routes.ts` — all fixes this session + ENTRY #007
- `server/routes/sales-docs-routes.ts` — silent catch fix
- `client/src/pages/inventory/inventory-list.tsx` — deactivate/reactivate buttons + delete dialog with docs

### After push to production:
1. Verify `[migration] ✅ active_products + inactive_products tables ready` in prod logs
2. Update `db/schema-history.md` ENTRY #007 + ENTRY #008 with production timestamp

---

## Previous session context (ENTRY #007 — Product Split, 2026-05-10)

### Architecture
- `products` = master registry (34 FK tables point here — no FK changes)
- `active_products` + `inactive_products` = satellite 1:1 via FK ON DELETE CASCADE
- `syncProductSplit(id, isActive)` in storage.ts syncs on every CUD

### Migration status on dev DB
- active_products: 2,019 rows; inactive_products: 5 rows; orphans: 0; FK integrity: intact

### ENTRY #006 cleanup (pending)
One-time block in products-routes.ts (orphan stock_movements deletion, FLAG `ORPHAN_STOCK_MOVEMENT_CLEANUP_20260509`) runs automatically on first import. After it runs:
1. Verify `stock_movements id=1463` gone from prod
2. Comment out cleanup block → push clean
3. Update `db/schema-history.md` ENTRY #006

---

## Permanent delete policy (confirmed by พี่ทราย 2026-05-11)
| Case | Behavior |
|---|---|
| Product has document references (IV/TIV/QT/SO/PO/AP/POS/GR) | Cannot delete — shows which documents |
| Product has only stock_movements (no docs) | Can delete — movements cascade-deleted |
| Product has no references | Can delete immediately |
