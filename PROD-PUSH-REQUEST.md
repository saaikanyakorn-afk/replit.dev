# 🚀 Production Push Request
**วันที่:** 12 พฤษภาคม 2569  
**ขอโดย:** พี่ทราย  
**อัปเดตล่าสุด:** 12 พฤษภาคม 2569 (เพิ่ม 4 รายการใหม่)  
**สถานะ:** รอพี่ช้างอนุมัติ

---

## ขอบเขต: Bug fixes + Feature สำหรับบริษัท 3684 (พลังแสง จำกัด)

---

## 1. Git Commits ที่ต้อง Push

```
DEV branch: b9e09278 → HEAD (28+ commits)
```

รายการ commits:
```
578e4f25 Improve file download functionality across the application
85777ddb Fix Excel export and template download errors
c61bca28 Always add a default chart of accounts to new companies
59521a67 Improve account cleanup when changing company business types
a4ffb6ab Add ability to import accounting chart templates into company data
2a060792 Add default branch to all document forms
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

| Bug / Feature | รายละเอียด | Status |
|-----|-----------|--------|
| SO reserved_qty | ลบ/แก้ SO แล้วสต็อกไม่คืน | ✅ แก้แล้ว |
| ต้นทุน ฿0.00 | Stock card แสดงต้นทุน ฿0.00 | ✅ แก้แล้ว |
| Stock card links | กดลิงก์ไปหน้า edit แทน list | ✅ แก้แล้ว |
| TIV journal | Cash/Credit ลงบัญชีผิด | ✅ แก้แล้ว |
| Journal 4001000 | บริษัท trading ลงบัญชีรายได้ผิด code | ✅ แก้แล้ว |
| Payment dropdown | 4 ฟอร์มมี dropdown hard-coded | ✅ แก้แล้ว |
| Settings payment | แยก tab รับเงิน/จ่ายเงิน + บัญชี 2xxx | ✅ แก้แล้ว |
| Settings payment | บันทึกวิธีจ่ายเงิน type='pay' ถูกต้อง | ✅ แก้แล้ว |
| Payment dropdown (ทุกฟอร์ม) | ลบ hardcode เงินสด/โอน/เช็ค/ฯลฯ ออกจาก 13 ฟอร์ม ใช้ DB อย่างเดียว | ✅ แก้แล้ว |
| branch default | ทุกเอกสาร (13 ฟอร์ม ขาย+ซื้อ) ตั้ง default สาขา = สำนักงานใหญ่ | ✅ แก้แล้ว |
| **[ใหม่]** Cleanup ผังบัญชีเมื่อเปลี่ยนประเภทธุรกิจ | เปลี่ยน businessType → merge บัญชีใหม่ + ลบบัญชีเก่าที่ไม่ใช้งาน (บัญชีที่มีรายการแล้วไม่ถูกลบ) | ✅ แก้แล้ว |
| **[ใหม่]** บริษัทใหม่ไม่มีผังบัญชี | สร้างบริษัทโดยไม่ระบุประเภทธุรกิจ → ได้ STANDARD 384 บัญชีเสมอ | ✅ แก้แล้ว |
| **[ใหม่]** Export xlsx เปิดไม่ได้ | ไฟล์ผังบัญชี .xlsx ที่ download มา Excel เปิด error | ✅ แก้แล้ว |
| **[ใหม่]** ปุ่มดาวน์โหลดทุกปุ่มในระบบ | 9 หน้า (สินทรัพย์, HR, นำเข้าค่าใช้จ่าย/ใบซื้อ/ใบขาย, สินค้า, Bundle ฯลฯ) เปลี่ยนจาก window.open → fetch+blob ทั้งหมด | ✅ แก้แล้ว |
| **[ใหม่]** บันทึกบัญชีเอกสารซื้อ (trading) ไม่ได้ | preview แสดงได้แต่กด approve แล้ว error "ไม่พบสูตรบัญชีใน DB" — แก้ให้ fallback ไป DEFAULT_FORMULAS เหมือน preview | ✅ แก้แล้ว |

---

## 4. หมายเหตุเพิ่มเติม

- Feature **"บันทึกวิธีจ่ายเงิน"** แก้สำเร็จแล้ว — company 3684 มี pay methods แล้ว 2 รายการ (id=121 Credit/AP, id=122 Bank Transfer)
- หลัง push แนะนำให้ user **hard reload** (`Ctrl+Shift+R`) เพื่อเคลียร์ browser cache
- ไม่มีการแตะ `schema.ts`, `App.tsx`, `server/index.ts`, `routes.ts`, `storage.ts`, `db.ts`

---

## 5. Reference

รายละเอียดทางเทคนิคเพิ่มเติมดูที่ `NEXT-AGENT-HANDOFF.md` ENTRY #013 ถึง #017

---

*ไฟล์นี้สร้างโดย AI Agent วันที่ 12/05/2569 — สามารถลบได้หลัง push สำเร็จ*
