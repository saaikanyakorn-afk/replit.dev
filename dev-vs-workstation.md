# 🖥️ Environment Diff: Replit Dev vs พี่ช้าง Workstation

> อัปเดตล่าสุด: 2026-05-26
> ใช้งานไฟล์นี้ตลอดช่วงที่พี่ช้างอ่าน code อยู่ (ประมาณ 2-3 วัน)
> Workflow: **Replit Dev → พี่ช้าง review → push production**

---

## ✅ PUSHED — 2026-05-26 (github-production main)

| # | ไฟล์ | Commit |
|---|------|--------|
| 1 | `shared/permissions.ts` | `0674e21d` |
| 2 | `server/routes/core-routes.ts` | `2c06e7e8` |
| 3 | `server/routes/payment-methods-routes.ts` | `5680b072` |
| 4 | `client/src/pages/settings/payment-methods.tsx` | `cccb6cb1` |
| 5 | `client/src/components/settings-tabs.tsx` | `a58f7891` |
| 6 | `client/src/pages/purchases/purchase-invoice.tsx` | `edba62e3` |
| 7 | `client/src/pages/sales/tax-invoice-form.tsx` | `7e864228` |
| 8 | `client/src/pages/sales/tax-invoice-list.tsx` | `1a11ffa7` |
| 9 | `client/src/pages/inventory/stock-card.tsx` | `b584fd7a` |
| 10 | `server/routes/products-routes.ts` | `efe81db3` |
| 11 | `client/src/pages/settings/inventory-triggers.tsx` | `3173a397` |

---

## สิ่งที่อยู่บน Replit Dev แต่ยังไม่อยู่บน Workstation

| # | ไฟล์ | การเปลี่ยนแปลง | วันที่ | ผู้อนุมัติ |
|---|------|---------------|--------|-----------|
| 1 | `shared/permissions.ts` | PRIMARY_ONLY_MODULES ลดเหลือ `["firm-mgmt","etax-hub"]` | 2026-05-25 | พี่ทราย |
| 2 | `server/routes/core-routes.ts` | ลบ managerExceptions / accountantExceptions / empCashierExceptions — simplify เป็น filter เดียว | 2026-05-25 | พี่ทราย |
| 3 | `server/routes/payment-methods-routes.ts` | fix setDefault: allow multiple defaults per type + fix logic | 2026-05-26 | — |
| 4 | `client/src/pages/settings/payment-methods.tsx` | เพิ่ม payment_type selector เมื่อเพิ่ม payment method ใหม่ | 2026-05-26 | — |
| 5 | `client/src/components/settings-tabs.tsx` | เปลี่ยนชื่อ tab การชำระเงิน → การรับ/จ่ายเงิน | 2026-05-26 | — |
| 6 | `client/src/pages/purchases/purchase-invoice.tsx` | auto-select warehouse_id + validate paymentMethod ก่อน save | 2026-05-26 | — |
| 7 | `client/src/pages/sales/tax-invoice-form.tsx` | ลบ hardcode "เครดิต" ทุกจุด + อ่านจาก ★ default + validate ก่อน save | 2026-05-26 | — |
| 8 | `client/src/pages/sales/tax-invoice-list.tsx` | badge effectiveStatus (inv.status==="cash") + outstanding=0 fix | 2026-05-26 | — |
| 9 | `client/src/pages/inventory/stock-card.tsx` | always refetch on page enter (invalidateQueries) | 2026-05-26 | — |
| 10 | `server/routes/products-routes.ts` | fix product import: warehouse_id required → save ก่อน | 2026-05-26 | — |
| 11 | `client/src/pages/settings/inventory-triggers.tsx` | เพิ่มปุ่ม recalculate warehouse stock levels | 2026-05-26 | — |

---

## สิ่งที่อยู่บน Workstation แต่ไม่มีบน Replit Dev

| # | รายการ | รายละเอียด |
|---|--------|-----------|
| 1 | reCAPTCHA keys ใน `system_config` DB | Workstation: INSERT แล้วใน `helium_replit` / Replit Dev: ยังไม่มี → login ผ่าน reCAPTCHA widget ใน dev ไม่ได้ |
| 2 | `.env` → `REPL_SLUG=local-dev-workstation` | เฉพาะ Windows — bypass encryption check + bind localhost (ถ้าใช้ REPL_ID จะ crash รูปแบบ ENOTSUP) |
| 3 | `.env` → `PORT=5010` | เฉพาะ workstation — Replit dev ใช้ port ที่ระบบกำหนด |
| 4 | `vite-plugin-meta-images.ts` | สร้างไว้บน workstation เฉพาะ — ไม่มีใน repo |

---

## Workstation รายละเอียด

| Item | ค่า |
|------|-----|
| OS | Windows 10 (Build 19044) |
| Path | `F:\SSD-Worrk\Kai_replit_project` |
| DB | PostgreSQL 16, DB name = `helium_replit`, port 5432 |
| Server port | 5010 |
| URL | `http://localhost:5010` |
| NODE_ENV | development |

---

## วิธี sync workstation ให้ตรงกับ Replit Dev

เมื่อพี่ช้าง approve การเปลี่ยนแปลงใดๆ บน Dev แล้ว ให้ pull code ลง workstation:

```bash
# บน workstation
cd F:\SSD-Worrk\Kai_replit_project
git pull
```

ไฟล์ที่ต้อง sync ล่าสุด (2026-05-25):
- `shared/permissions.ts`
- `server/routes/core-routes.ts`

---

## 🔍 PostgreSQL Transaction Audit — รอพี่ช้าง Review (2026-05-25)

> **Background:** pm2 stop hang ระหว่าง deploy 2026-05-25 — สาเหตุที่เป็นไปได้คือ transaction() ที่ไม่ release lock บน PostgreSQL
> **สถานะ:** พี่ช้างยังไม่มีเวลา — บันทึกไว้รอ review ภายหลัง

### สรุป
- **163 transactions** ใน **33 ไฟล์**
- มี **nested transactions** บางจุด — risk สูงสุดสำหรับ deadlock/lock ไม่ release

### จุดเสี่ยง: Nested Transactions
| ไฟล์ | บรรทัด | รายละเอียด |
|------|--------|-----------|
| `server/routes/ecommerce-routes.ts` | 5604 | `db.transaction` ซ้อนอยู่ใน `ecomDb.transaction` |
| `server/routes/sales-docs-routes.ts` | 2424, 3041 | nested transactions |
| `server/routes/purchase-routes.ts` | 750, 1451 | nested transactions |

### รายการทั้งหมด (จำนวน transactions per file)

| # | ไฟล์ | จำนวน |
|---|------|-------|
| 1 | `server/routes/sales-docs-routes.ts` | 24 |
| 2 | `server/routes/purchase-routes.ts` | 22 |
| 3 | `server/routes/ecommerce-routes.ts` | 14 |
| 4 | `server/routes/financial-docs-routes.ts` | 14 |
| 5 | `server/routes/products-routes.ts` | 11 |
| 6 | `server/routes/billing-notes-routes.ts` | 6 |
| 7 | `server/routes/expense-routes.ts` | 6 |
| 8 | `server/storage.ts` | 6 |
| 9 | `server/routes/petty-cash-routes.ts` | 6 |
| 10 | `server/routes/ecommerce-import-routes.ts` | 6 |
| 11 | `server/routes/accounting-routes.ts` | 4 |
| 12 | `server/routes/installment-routes.ts` | 4 |
| 13 | `server/routes/firm-routes.ts` | 4 |
| 14 | `server/routes/contacts-routes.ts` | 3 |
| 15 | `server/routes/delivery-note-routes.ts` | 3 |
| 16 | `server/routes/hr-routes.ts` | 2 |
| 17 | `server/routes/manufacturing-routes.ts` | 2 |
| 18 | `server/module-sync-engine.ts` | 2 |
| 19 | `server/data-archive.ts` | 2 |
| 20 | `server/route-helpers.ts` | 2 |
| 21 | `server/routes/internal-chat.ts` | 2 |
| 22 | `server/routes/gas-station-routes.ts` | 2 |
| 23 | `server/routes/fixed-assets-routes.ts` | 2 |
| 24 | `server/routes/reports-routes.ts` | 1 |
| 25 | `server/routes/notifications-routes.ts` | 1 |
| 26 | `server/routes/accounting-tools-routes.ts` | 1 |
| 27 | `server/routes/import-batch-routes.ts` | 1 |
| 28 | `server/routes/pos-routes.ts` | 1 (posDb) |
| 29 | `server/routes/legacy-import.ts` | 1 |
| 30 | `server/routes/subscription-routes.ts` | 1 |
| 31 | `server/routes/platform-routes.ts` | 1 |
| 32 | `server/auth.ts` | 1 |
| 33 | `server/index.ts` | 1 |

---

## กฎการอัปเดต status (พี่ช้าง 2026-05-25)

> **status เป็น "done" ได้เฉพาะเมื่อพี่ทรายยืนยันว่า "working on production" เท่านั้น**
> ถ้ายังไม่ได้รับการยืนยัน → status คือ "⏳ in progress"

---

## Log การเปลี่ยนแปลงสะสม (ต่อเนื่องจาก session นี้ไปเรื่อยๆ)

| วันที่ | ไฟล์ | สิ่งที่แก้ | Pushed | สถานะ |
|--------|------|-----------|--------|-------|
| ก่อนหน้า | `client/src/lib/mock-data.ts` | เพิ่มเมนู "ใบรับสินค้า (GR)" + "เบิกวัตถุดิบ" ใน sidebar ควบคุมสินค้า | ✅ `fd105271` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `shared/permissions.ts` | PRIMARY_ONLY_MODULES: ลดเหลือ `["firm-mgmt","etax-hub"]` | ✅ `cea43be4` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `server/routes/core-routes.ts` | cleanup managerExceptions/accountantExceptions/empCashierExceptions | ✅ `71705e7a` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/app-extra.tsx` | urlBase="/manufacturing" + support singular+plural material-issue routes | ✅ `d2822970` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/components/manufacturing-layout.tsx` | NAV_KEY_MAP: `/material-issue/form` → `/material-issues/form` | ✅ `37024ab7` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/pages/inventory/material-issue-list.tsx` | เพิ่มปุ่ม ← กลับ + แก้ navigate URLs singular → plural | ✅ `ceead1af` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/pages/inventory/material-issue-form.tsx` | แก้ post-save MO navigate: ลบ double `/manufacturing/` | ✅ `ebcf2cbd` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `server/storage.ts` | adjustStock: save warehouse_id ใน stock_movements | ✅ `621705e3` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `server/route-helpers.ts` | deductStockBundleAware: ส่ง warehouseId → adjustStock | ✅ `1fb4076c` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `server/routes/purchase-routes.ts` | AP stock movements + UPDATE warehouse_id | ✅ `369ab7e7` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `server/inventory-costing.ts` | MovementWithCost type + fetch warehouse name ใน stock card | ✅ `6ea481fb` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `server/routes/products-routes.ts` | เพิ่ม API `/api/warehouse-stock/levels` | ✅ `b75184d4` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/pages/inventory/stock-card.tsx` | เพิ่มคอลัมน์ "คลัง" | ✅ `e115e3af` | ✅ done — พี่ทราย verified production (2026-05-25) |
| 2026-05-25 | `client/src/pages/sales/tax-invoice-form.tsx` | dropdown คลังแสดงจำนวน + invalidateQueries stock | ✅ `f2e4a95f` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/pages/sales/tax-invoice-list.tsx` | invalidateQueries stock หลัง save/delete | ✅ `57e82fc5` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/pages/purchases/purchase-invoice.tsx` | invalidateQueries stock หลัง save/delete | ✅ `2ef10d5b` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/pages/purchases/purchase-invoice-list.tsx` | invalidateQueries stock หลัง delete | ✅ `fc8de039` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/pages/inventory/goods-receiving-form.tsx` | invalidateQueries stock หลัง save | ✅ `c0fba5f7` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-25 | `client/src/components/send-email-dialog.tsx` | ไฟล์ใหม่ — dependency ของ tax-invoice-list.tsx ที่ไม่เคยมีบน GitHub | ✅ `4ec457c4` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-26 | `server/routes/payment-methods-routes.ts` | fix setDefault: allow multiple defaults per type + fix logic | ✅ `e60fbcb5` `95edf537` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-26 | `client/src/pages/settings/payment-methods.tsx` | เพิ่ม payment_type selector เมื่อเพิ่ม payment method ใหม่ | ✅ `f4faa670` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-26 | `client/src/components/settings-tabs.tsx` | เปลี่ยนชื่อ tab การชำระเงิน → การรับ/จ่ายเงิน | ✅ `43a9f7cd` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-26 | `client/src/pages/purchases/purchase-invoice.tsx` | auto-select warehouse_id ใน items เมื่อเปิดฟอร์ม | ✅ `443ca098` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-26 | `client/src/pages/sales/tax-invoice-form.tsx` | default paymentMethod = credit + badge isCashMethod() fix | ✅ `c2e7240d` `26edaeda` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-26 | `client/src/pages/sales/tax-invoice-list.tsx` | badge effectiveStatus (inv.status==="cash") + outstanding=0 fix | ✅ `95e15df5` `c143480c` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-26 | `client/src/pages/inventory/stock-card.tsx` | always refetch on page enter (invalidateQueries) | ✅ `93d70dbe` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-26 | `server/routes/products-routes.ts` | fix product import: warehouse_id required → save ก่อน | ✅ `27673733` | ⏳ in progress — รอพี่ทราย verify production |
| 2026-05-26 | `client/src/pages/settings/inventory-triggers.tsx` | เพิ่มปุ่ม recalculate warehouse stock levels | ✅ `8b7b227c` | ⏳ in progress — รอพี่ทราย verify production |
