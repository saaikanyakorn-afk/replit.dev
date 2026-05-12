# 🚀 Production Push Request
**วันที่:** 12 พฤษภาคม 2569  
**ขอโดย:** พี่ทราย  
**สถานะ:** รอพี่ช้างอนุมัติ

---

## ขอบเขต: Bug fixes + Feature สำหรับบริษัท 3684 (พลังแสง จำกัด)

---

## 1. Git Commits ที่ต้อง Push

```
DEV branch: b9e09278 → ea477f4a (21 commits)
```

รายการ commits:
```
ea477f4a Improve payment method saving functionality by fixing state updates
9d14c4cf Add ability to add new payment methods with correct payment type
dad0fac2 Update payment settings to include accounts payable
12e80608 Add payment type selection to payment methods
00164c69 Update payment method selection to use user-defined settings
202058c8 Correctly assign sales revenue for trading companies
1187028a Update payment method selection logic for tax invoices
814efb60 Direct document links to their list views instead of edit pages
c7043d12 Fix issues with sales order reservations and inventory costing accuracy
73fed4f5 Improve payment method selection and default handling
170d1db9 Fix issue where multiple payment methods appear selected in forms
cd861904 Fix issues with sales orders not appearing in related documents
7485d012 Implement stock reservation and release for sales orders
7a42a0db Fix phantom stock increases when deleting sales documents
...และอื่นๆ
```

---

## 2. SQL ที่ต้องรันบน Production (สำคัญมาก — รันก่อนหรือหลัง deploy)

```sql
-- =============================================
-- Step 1: ตั้งค่า business_type บริษัทพลังแสง
-- =============================================
UPDATE companies
SET business_type = 'trading'
WHERE id = 3684;

-- =============================================
-- Step 2: เพิ่ม column ใหม่ใน payment_methods
-- (DDL — รันก่อน deploy ปลอดภัยกว่า)
-- =============================================
ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'receive';

-- =============================================
-- Step 3: เคลียร์ reserved_qty ที่ค้างผิดพลาด
-- =============================================
UPDATE products
SET reserved_qty = 0
WHERE id = 5399
  AND company_id = 3684;

-- =============================================
-- Step 4: Backfill unit_cost ใน stock_movements
-- (เฉพาะ rows ที่ยังเป็น 0 และเป็นการรับสินค้า)
-- =============================================
UPDATE stock_movements sm
SET unit_cost = p.purchase_price
FROM products p
WHERE sm.product_id = p.id
  AND sm.unit_cost = 0
  AND sm.movement_type IN ('in', 'purchase')
  AND sm.company_id = 3684;

-- =============================================
-- Step 5: ตรวจสอบ (SELECT only — ไม่แก้อะไร)
-- =============================================
SELECT business_type FROM companies WHERE id = 3684;
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'payment_methods' AND column_name = 'payment_type';
SELECT reserved_qty FROM products WHERE id = 5399;
```

---

## 3. สรุปสิ่งที่แก้ไข

| Bug | รายละเอียด | Status |
|-----|-----------|--------|
| SO reserved_qty | ลบ/แก้ SO แล้วสต็อกไม่คืน | ✅ แก้แล้ว |
| ต้นทุน ฿0.00 | Stock card แสดงต้นทุน ฿0.00 | ✅ แก้แล้ว |
| Stock card links | กดลิงก์ไปหน้า edit แทน list | ✅ แก้แล้ว |
| TIV journal | Cash/Credit ลงบัญชีผิด | ✅ แก้แล้ว |
| Journal 4001000 | บริษัท trading ลงบัญชีรายได้ผิด code | ✅ แก้แล้ว |
| Payment dropdown | 4 ฟอร์มมี dropdown hard-coded | ✅ แก้แล้ว |
| Settings payment | แยก tab รับเงิน/จ่ายเงิน + บัญชี 2xxx | ✅ แก้แล้ว |

---

## 4. หมายเหตุเพิ่มเติม

- Feature **"บันทึกวิธีจ่ายเงิน"** ยังอยู่ระหว่าง debug (UI แสดงถูก แต่ save type ยัง 'receive') — ยังไม่ impact production จนกว่าจะ config วิธีจ่ายเงินจริง
- หลัง push แนะนำให้ user **hard reload** (`Ctrl+Shift+R`) เพื่อเคลียร์ browser cache
- ไม่มีการแตะ `schema.ts`, `App.tsx`, `server/index.ts`, `routes.ts`, `storage.ts`, `db.ts`

---

## 5. Reference

รายละเอียดทางเทคนิคเพิ่มเติมดูที่ `NEXT-AGENT-HANDOFF.md` ENTRY #013 ถึง #017

---

*ไฟล์นี้สร้างโดย AI Agent วันที่ 12/05/2569 — สามารถลบได้หลัง push สำเร็จ*
