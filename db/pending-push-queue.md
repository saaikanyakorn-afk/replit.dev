# PENDING PUSH QUEUE — Single Source of Truth

**This file is the ONLY place that tracks what is awaiting push to production.**

Every push to production MUST be reflected in this file. If a file is not in this queue, it CANNOT be pushed. Every push session updates this file BEFORE and AFTER.

---

## How to use this file

### Before pushing a file
1. Find the entry for the ticket/feature this file belongs to
2. If no entry exists → CREATE one before doing anything else
3. Confirm พี่ช้าง permission per `handoff.md` PUSH METHOD
4. Only then call GitHub API PUT

### After pushing a file
1. Update the entry's file row: change status from `⏳ awaiting` to `✅ pushed YYYY-MM-DD HH:mm (Bangkok)`
2. When ALL files in an entry are ✅ → move the entry to "## DEPLOYED — HISTORY" section at the bottom
3. NEVER delete an entry — only move it down

### Statuses
- 📝 **dev** — code on dev, not yet tested by พี่ทราย
- ⏳ **awaiting** — พี่ทรายtested, awaiting พี่ช้าง push approval
- 🚀 **pushing** — currently in push session
- ✅ **pushed YYYY-MM-DD HH:mm** — confirmed on production

---

## ACTIVE QUEUE

---

## 🚀 ACE Batch — Combined Deploy Entry
**วันที่สร้าง:** 2026-05-21
**อนุมัติ:** พี่ช้าง ✅ (2026-05-21)
**รวม:** N4 + N6-hotfix2 + N7 + N8

### สรุปสิ่งที่แก้
| กลุ่ม | สิ่งที่แก้ |
|------|-----------|
| **N4** | Payment method fixes ทุกเอกสาร, Expense บันทึกได้ (🔴 prod bug), RE overpayment block, Settings > วิธีชำระเงิน (NEW), server timeout fix |
| **N6-hotfix2** | /share/wht-cert/:token 404 บน production หาย |
| **N7** | ค้นหาบริษัทจากกรมสรรพากร (RD VAT) แทน DBD, multi-branch dialog, address formatting |
| **N8** | Platform Email config UI (etaxcenter.com webmail), SMTP ใช้ PLATFORM_EMAIL_SMTP_* เท่านั้น |

### ⚠️ N8 Pre-deploy DB INSERT (ก่อน push)
ต้อง INSERT 6 rows เข้า `system_config` บน production ก่อน — ดู handoff.md N8 section สำหรับ SQL (credentials ถามพี่ทรายตอน deploy — ห้าม hardcode)

### ไฟล์ทั้งหมด (29 ไฟล์)

**Backend (9 ไฟล์):**
| File | สิ่งที่แก้ | จาก | Status |
|------|-----------|-----|--------|
| `server/db.ts` | Connection timeout 20s + warmup pool | N4 | ⏳ awaiting |
| `server/route-helpers.ts` | เพิ่ม `computeRemainingBalance()` | N4 | ⏳ awaiting |
| `server/static.ts` | Route `/share/wht-cert/:token` — ลิงก์จาก LINE 404 หาย | N6-hotfix2 | ⏳ awaiting |
| `server/routes/expense-routes.ts` | Credit PM logic + paymentStatus + WHT email (N4+N8 รวม) | N4+N8 | ⏳ awaiting |
| `server/routes/billing-notes-routes.ts` | RE overpayment validation + sendPlatformEmail | N4 | ⏳ awaiting |
| `server/routes/notifications-routes.ts` | RE overpayment validation (batch) | N4 | ⏳ awaiting |
| `server/routes/sales-docs-routes.ts` | RE overpayment + TIV journal fix + Quotation URL fix | N4 | ⏳ awaiting |
| `server/routes/purchase-routes.ts` | Address formatting ครบทุก field + branch code 5 หลัก | N7 | ⏳ awaiting |
| `server/routes/doc-settings-routes.ts` | GET/PUT/test ใช้ `PLATFORM_EMAIL_SMTP_*` เท่านั้น (N8+N12 รวม) | N8 | ⏳ awaiting |

**Frontend (20 ไฟล์):**
| File | สิ่งที่แก้ | จาก | Status |
|------|-----------|-----|--------|
| `client/src/pages/settings/payment-methods.tsx` | **NEW** — UI ตั้งค่าวิธีรับ/จ่ายเงิน + ผูกรหัสบัญชี | N4 | ⏳ awaiting |
| `client/src/pages/purchases/expense.tsx` | Payment status fix | N4 | ⏳ awaiting |
| `client/src/pages/purchases/purchase-invoice.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/purchases/purchase-order.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/purchases/purchase-request.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/purchases/purchase-deposit-form.tsx` | Credit PM fix | N4 | ⏳ awaiting |
| `client/src/pages/purchases/debit-note-form.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/sales/tax-invoice-form.tsx` | lineItemAccounts → JournalPreviewPanel | N4 | ⏳ awaiting |
| `client/src/pages/sales/receipt-form.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/sales/credit-note-form.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/sales/deposit-form.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/sales/sales-order-form.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/finance/ap-billing.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/finance/receipt-billing.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/pages/ecommerce/ecommerce-quick-invoice.tsx` | PM dropdown fallback | N4 | ⏳ awaiting |
| `client/src/components/related-docs-dialog.tsx` | Navigate → listPath?docNo=xxx (ลบ editPath) | N4 | ⏳ awaiting |
| `client/src/hooks/use-dbd-lookup.ts` | เรียก `selectBranch()` singleton แทน Context hook | N7 | ⏳ awaiting |
| `client/src/contexts/branch-select-context.tsx` | **NEW** — `BranchSelectPortal` singleton + `BranchSelectProvider` no-op | N7 | ⏳ awaiting |
| `client/src/app-extra.tsx` | render `<BranchSelectPortal />` (แทน App.tsx ที่ NEVER push) | N7 | ⏳ awaiting |
| `client/src/pages/platform/email-config.tsx` | **NEW** — SMTP config UI preset etaxcenter.com | N8 | ⏳ awaiting |

### Rebuild
**YES** — มีทั้ง frontend (.tsx) และ backend (.ts) → ต้อง `npm run build` ก่อน start

### Deploy Command (Production)
```bash
pm2 stop etax-center && \
git fetch origin && \
git checkout origin/main -- \
  server/db.ts \
  server/route-helpers.ts \
  server/static.ts \
  server/routes/expense-routes.ts \
  server/routes/billing-notes-routes.ts \
  server/routes/notifications-routes.ts \
  server/routes/sales-docs-routes.ts \
  server/routes/purchase-routes.ts \
  server/routes/doc-settings-routes.ts \
  client/src/pages/settings/payment-methods.tsx \
  client/src/pages/purchases/expense.tsx \
  client/src/pages/purchases/purchase-invoice.tsx \
  client/src/pages/purchases/purchase-order.tsx \
  client/src/pages/purchases/purchase-request.tsx \
  client/src/pages/purchases/purchase-deposit-form.tsx \
  client/src/pages/purchases/debit-note-form.tsx \
  client/src/pages/sales/tax-invoice-form.tsx \
  client/src/pages/sales/receipt-form.tsx \
  client/src/pages/sales/credit-note-form.tsx \
  client/src/pages/sales/deposit-form.tsx \
  client/src/pages/sales/sales-order-form.tsx \
  client/src/pages/finance/ap-billing.tsx \
  client/src/pages/finance/receipt-billing.tsx \
  client/src/pages/ecommerce/ecommerce-quick-invoice.tsx \
  client/src/components/related-docs-dialog.tsx \
  client/src/hooks/use-dbd-lookup.ts \
  client/src/contexts/branch-select-context.tsx \
  client/src/app-extra.tsx \
  client/src/pages/platform/email-config.tsx && \
npm run build && \
pm2 start etax-center
```

### Build Result
> กรอกผลหลัง build: `✅ Build สำเร็จ YYYY-MM-DD HH:mm` หรือ `❌ Error: ...`

---

## 📋 รายการ Code ที่รอ Push ทั้งหมด — จัดตาม Function ภาษาไทย
**อัพเดต:** 2026-05-21

> ⏳ = พี่ทราย tested แล้ว รอพี่ช้าง approve push
> 📝 = รอพี่ทราย verify บน dev ก่อน
> 🔴 = Production bug ที่จะหายเมื่อ push

---

### 🔴 ปัญหา Production ตอนนี้ (2026-05-21)
**ค่าใช้จ่าย (Expense) บันทึกไม่ได้** — error "วิธีชำระเงิน Cash ยังไม่ได้ตั้งค่ารหัสบัญชีในระบบ"
→ หน้า UI **Settings > วิธีชำระเงิน ยังไม่มีบน production** (อยู่ใน N4 ที่รอ push)
→ error จะหายเองเมื่อ **N4 deploy ครบ**

---

### 1. ตั้งค่าวิธีชำระเงิน 🔴 (N4 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `client/src/pages/settings/payment-methods.tsx` | UI ตั้งค่า วิธีรับเงิน / วิธีจ่ายเงิน + ผูกรหัสบัญชี — **ยังไม่มีบน production** |

---

### 2. ค่าใช้จ่าย (Expense) 🔴 (N4 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `server/routes/expense-routes.ts` | Credit PM logic + paymentStatus + WHT email (N4+N8+N9 รวม) |
| `client/src/pages/purchases/expense.tsx` | Payment status fix |

---

### 3. ใบสั่งซื้อ / ใบขอซื้อ / ใบมัดจำซื้อ / ใบเดบิต (N4 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `client/src/pages/purchases/purchase-invoice.tsx` | PM dropdown fallback |
| `client/src/pages/purchases/purchase-order.tsx` | PM dropdown fallback |
| `client/src/pages/purchases/purchase-request.tsx` | PM dropdown fallback |
| `client/src/pages/purchases/purchase-deposit-form.tsx` | Credit PM fix |
| `client/src/pages/purchases/debit-note-form.tsx` | PM dropdown fallback |

---

### 4. ใบขาย / ใบกำกับภาษี / ใบเสร็จ / ใบลดหนี้ (N4 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `server/routes/sales-docs-routes.ts` | RE overpayment + TIV journal fix + Quotation URL fix (N4+N9+N10 รวม) |
| `client/src/pages/sales/tax-invoice-form.tsx` | lineItemAccounts → JournalPreviewPanel |
| `client/src/pages/sales/receipt-form.tsx` | PM dropdown fallback |
| `client/src/pages/sales/credit-note-form.tsx` | PM dropdown fallback |
| `client/src/pages/sales/deposit-form.tsx` | PM dropdown fallback |
| `client/src/pages/sales/sales-order-form.tsx` | PM dropdown fallback |

---

### 5. ใบวางบิล / ชำระหนี้ (AP/AR Billing) (N4 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `server/routes/billing-notes-routes.ts` | RE overpayment validation + sendPlatformEmail (N4+N9 รวม) |
| `server/routes/notifications-routes.ts` | RE overpayment validation (batch) |
| `client/src/pages/finance/ap-billing.tsx` | PM dropdown fallback |
| `client/src/pages/finance/receipt-billing.tsx` | PM dropdown fallback |

---

### 6. E-Commerce (N4 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `client/src/pages/ecommerce/ecommerce-quick-invoice.tsx` | PM dropdown fallback |

---

### 7. เอกสารเกี่ยวข้อง (Related Docs Navigation) (N4 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `client/src/components/related-docs-dialog.tsx` | Navigate → listPath?docNo=xxx (ลบ editPath) |

---

### 8. ระบบ — Server Core (N4 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `server/db.ts` | Connection timeout 20s + warmup pool |
| `server/route-helpers.ts` | เพิ่ม `computeRemainingBalance()` |

---

### 9. ใบ 50 ทวิ — Share Link (N6-hotfix2 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `server/static.ts` | Route `/share/wht-cert/:token` — กดลิงก์จาก LINE แล้ว 404 บน production |

---

### 10. ค้นหาบริษัทจากกรมสรรพากร + Multi-Branch (N7 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `client/src/hooks/use-dbd-lookup.ts` | RD VAT lookup — เรียก `selectBranch()` singleton แทน Context hook |
| `client/src/contexts/branch-select-context.tsx` | **NEW** — `BranchSelectPortal` singleton (createPortal→body) + `BranchSelectProvider` no-op |
| `server/routes/purchase-routes.ts` | Address formatting + รหัส branch 5 หลัก |
| `client/src/app-extra.tsx` | render `<BranchSelectPortal />` — ใช้แทน App.tsx (rule: NEVER push App.tsx) |

---

### 11. ตั้งค่า Email แพลตฟอร์ม (Platform Email) (N8 — ⏳ รอ พี่ช้าง approve)
| File | หมายเหตุ |
|------|---------|
| `client/src/pages/platform/email-config.tsx` | UI preset etaxcenter.com webmail |
| `server/routes/doc-settings-routes.ts` | GET/PUT/test ใช้ PLATFORM_EMAIL_SMTP_* (N8+N12 รวม) |

---

### 12–22. Manufacturing Features — แยกตาม Function (N12 — ⏳ รอ พี่ช้าง approve)

> Schema deploy แล้วใน N11 (2026-05-21) — พี่ทราย tested ✅ 2026-05-21 — code เท่านั้นที่รอ push

| Function | Files |
|---------|-------|
| ใบสั่งผลิต | `manufacturing-form.tsx`, `manufacturing-list.tsx`, `orders.tsx` |
| สูตรการผลิต BOM | `bom-form.tsx`, `bom.tsx` |
| ขั้นตอนการผลิต + สแกนสเตชั่น | `process-scan-station.tsx`, `mes-scan-station.tsx`, `mes-unit-detail.tsx`, `mes-work-orders.tsx` |
| ใบเบิกวัตถุดิบ | `material-issue-form.tsx`, `material-issue-list.tsx` |
| ใบเสร็จสิ้นการผลิต | `production-finish-form.tsx`, `production-finish-list.tsx` |
| NCR (รายงานความไม่สอดคล้อง) | `ncr-form.tsx`, `ncr-list.tsx` |
| ล็อตสินค้า + แจ้งเตือนสต็อกต่ำ | `product-lots.tsx` |
| ใบรับสินค้า | `goods-receiving-form.tsx`, `goods-receiving-list.tsx` |
| ตรวจสอบย้อนกลับ | `traceability.tsx` |
| การตั้งค่าทั่วไป (Lot Threshold) | `general-settings.tsx` |
| Server + Layout (push พร้อมทุก function) | `manufacturing-routes.ts`, `products-routes.ts`, `app-extra.tsx`, `manufacturing-layout.tsx` |

ดูรายละเอียด file ทีละไฟล์ได้ที่ **N12 section** ด้านล่าง

---

### N3 — Material Issue (เบิกวัตถุดิบ Lot Scan)
**Status:** ✅ DONE 2026-05-20 12:21 (Bangkok) — migration confirmed: flag SET, `from_warehouse_id` EXISTS on prod
**Schema change:** YES — `material_issues` + `material_issue_items` tables (ENTRY #009)
**Push type:** Schema migration push (Rule 2 — 10-step procedure)

| File | Role | Status |
|------|------|--------|
| `shared/schema-extra.ts` | Migration function `runMaterialIssueMigration()` + all other pending migrations | ✅ pushed 2026-05-20 commit `585cd33` |
| `server/migrations-runner.ts` | **NEW FILE** — central migration runner. N3 (`runMaterialIssueMigration`) enabled, all others commented. | ✅ pushed 2026-05-20 commit `845583b` |
| `server/routes/products-routes.ts` | N3 API routes + N3 SQL. Migration calls removed. | ✅ pushed 2026-05-20 commit `b4fc9d6` |
| `server/index-extra.ts` | Added `runPendingMigrations()` call at startup | ✅ pushed 2026-05-20 commit `40c80c7` |

**✅ All 4 files already on prod repo** — พี่ช้าง only needs to run the corrected one-liner (with `npm run build`):
```
pm2 stop etax-center && git fetch origin && git checkout origin/main -- shared/schema-extra.ts server/migrations-runner.ts server/routes/products-routes.ts server/index-extra.ts && npm install && npm run build && pm2 start etax-center
```

⚠️ **`npm run build` IS MANDATORY** — prod runs `node dist/index.cjs`. Without build, server runs old compiled code silently.
⚠️ **Do NOT push `server/migrations-runner.ts` with any migration other than N3 uncommented** — other migrations in that file are pending their own queue entries + approval.

---

### N4 — Payment fixes + TIV accounting + RE overpayment block + ซื้อ timeout + Related docs navigation
**Status:** ⏳ awaiting พี่ช้าง approval — พี่ทราย tested ✅
**Schema change:** NO
**Push type:** Code-only push

**สิ่งที่เปลี่ยน:**
1. **ซื้อ timeout** — `server/db.ts` เพิ่ม connection timeout 20s + warmup pool ป้องกัน cold-start timeout
2. **TIV ลงบัญชี/ตัดสต็อก** — `sales-docs-routes.ts` + `tax-invoice-form.tsx` แก้ journalStatuses เพิ่ม "cash", fix lineItemAccounts ส่งถูก account
3. **RE ห้ามเกินยอดค้าง** — `route-helpers.ts` เพิ่ม `computeRemainingBalance()`, validate ใน 3 จุด (direct RE, BN, batch)
4. **Payment method dropdown** — 14 frontend forms แก้ fallback logic ให้แสดง PM ถูก type (pay/receive)
5. **Expense payment status** — `expense-routes.ts` + `expense.tsx` แก้ credit PM logic + paymentStatus override
6. **Related docs navigation** — `related-docs-dialog.tsx` ลบ navigate-to-editPath → ใช้ navigate-to-listPath?docNo=xxx แทน (คลิกเอกสารเกี่ยวข้องแล้วกรองใน list)

⚠️ **หมายเหตุ:** `billing-notes-routes.ts`, `sales-docs-routes.ts`, `expense-routes.ts` มีการแก้ทั้ง N4 (logic) และ N9 (SMTP migration) — push ในสถานะ dev ปัจจุบันครอบคลุมทั้งคู่แล้ว

🔴 **Production bug (2026-05-21):** ค่าใช้จ่าย (Expense) บันทึกไม่ได้ — error "วิธีชำระเงิน Cash ยังไม่ได้ตั้งค่ารหัสบัญชีในระบบ" เกิดจาก `expense-routes.ts` (N4) ที่ยังไม่ได้ push + `client/src/pages/settings/payment-methods.tsx` ยังไม่มีบน production — **error นี้จะหายเมื่อ N4 deploy ครบ**

| File | Role | Status |
|------|------|--------|
| `server/db.ts` | Connection timeout 20s + warmup | ⏳ awaiting |
| `server/route-helpers.ts` | เพิ่ม `computeRemainingBalance()` | ⏳ awaiting |
| `server/routes/expense-routes.ts` | Credit PM logic + paymentStatus | ⏳ awaiting |
| `server/routes/billing-notes-routes.ts` | RE overpayment validation | ⏳ awaiting |
| `server/routes/notifications-routes.ts` | RE overpayment validation (batch) | ⏳ awaiting |
| `server/routes/sales-docs-routes.ts` | RE overpayment + TIV journal fix | ⏳ awaiting |
| `client/src/pages/sales/tax-invoice-form.tsx` | lineItemAccounts → JournalPreviewPanel | ⏳ awaiting |
| `client/src/pages/purchases/expense.tsx` | Payment status fix | ⏳ awaiting |
| `client/src/pages/purchases/purchase-deposit-form.tsx` | Credit PM fix | ⏳ awaiting |
| `client/src/pages/ecommerce/ecommerce-quick-invoice.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/finance/ap-billing.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/finance/receipt-billing.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/purchases/debit-note-form.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/purchases/purchase-invoice.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/purchases/purchase-order.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/purchases/purchase-request.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/sales/credit-note-form.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/sales/deposit-form.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/sales/receipt-form.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/pages/sales/sales-order-form.tsx` | PM dropdown fallback | ⏳ awaiting |
| `client/src/components/related-docs-dialog.tsx` | Navigate → listPath?docNo=xxx (ลบ editPath) | ⏳ awaiting |

---

### N6 — WHT cert email + PDF + Niramit font + LINE card
**Status:** ✅ DONE 2026-05-20 (Bangkok) — 11 files deployed, build passed, server online
**Schema change:** NO
**Push type:** Code-only push (multiple files, must push together — code-dependent)

| File | Role | Status |
|------|------|--------|
| `server/pdf-wht-cert.ts` | PDF generation + signature image embed | ✅ pushed commit `00de1d7` |
| `server/routes/expense-routes.ts` | Share/Email/LINE routes — dynamic require → static import | ✅ pushed commit `86e5ebb` |
| `server/routes/line-routes.ts` | LINE card purple/data fix (Group 2 — extra permission) | ✅ pushed commit `28d611c` |
| `client/src/pages/purchases/wht-cert-list.tsx` | DropdownMenu actions | ✅ pushed commit `473fb4f` |
| `client/src/pages/purchases/wht-cert-print.tsx` | Print page | ✅ pushed commit `f64ccc1` |
| `client/src/components/line-send-dialog.tsx` | LINE dialog | ✅ pushed commit `35aacad` |
| `client/src/components/document-renderer.tsx` | Removed CDN @import (Niramit now bundled) | ✅ pushed commit `d4011b8` |
| `client/src/index.css` | Added `@fontsource/niramit` import | ✅ pushed commit `599adb7` |
| `package.json` | Added `@fontsource/niramit` dep | ✅ pushed commit `3c7fc28` |
| `package-lock.json` | Lock for `@fontsource/niramit` | ✅ pushed commit `1a1b171` |
| `client/src/pages/purchases/wht-cert-share.tsx` | **Missing from original list** — old prod version imported `WhtCertContent` from `wht-cert-print.tsx`, dev version doesn't → build error fixed | ✅ pushed commit `671fe09` |

⚠️ **Lesson learned:** `wht-cert-share.tsx` was missing from original N6 list — old prod version had a dependency on `wht-cert-print.tsx` that dev had already removed. Always grep for cross-file imports when updating pages.

---

### N6-hotfix — WHT cert print page: iframe ส่งแค่ cookie ไม่มี Bearer token → 401 บน production
**Status:** ✅ DONE 2026-05-20 (Bangkok) — build passed, pm2 online
**Schema change:** NO
**Push type:** Code-only, 1 ไฟล์ (frontend only)

**Root cause:** Production ใช้ `cookie.secure = true` + sessions จาก PostgreSQL แต่ React app ส่ง `Authorization: Bearer <token>` ใน localStorage สำหรับ fetch calls ทุกอัน ส่วน `<iframe src="/api/wht-certs/:id/pdf">` เป็น browser GET request — ไม่มี JS interceptor → ส่งแค่ cookies ไม่มี Bearer header → server ไม่เจอ session → 401

**Fix:** เปลี่ยน iframe ให้ fetch PDF blob ด้วย `Authorization: Bearer` header แล้วสร้าง blob URL (`URL.createObjectURL`) ให้ iframe แทน — ทั้ง certNo fetch และ download button ก็เพิ่ม auth header แล้ว

| File | Role | Status |
|------|------|--------|
| `client/src/pages/purchases/wht-cert-print.tsx` | Blob URL pattern แทน `iframe src` direct URL — เพิ่ม `getAuthHeaders()` ใน fetch ทุกจุด | ✅ pushed 2026-05-20 commit `4e6ef45` |

Deploy command (NO schema change — rebuild only):
```
pm2 stop etax-center && git fetch origin && git checkout origin/main -- client/src/pages/purchases/wht-cert-print.tsx && npm install && npm run build && pm2 start etax-center
```

---

### N6-hotfix2 — WHT cert share link 404 on production
**Status:** ⏳ awaiting พี่ช้าง approval — bug confirmed, 1 file only
**Schema change:** NO
**Push type:** Code-only, 1 file (backend only — no build needed if prod runs compiled, but `npm run build` required since this is server-side)
**Root cause:** `server/static.ts` has `/share/wht-cert/:token` route (added in N6) but this file was never pushed to production → 404 when mobile clicks LINE card button "ดูใบ 50 ทวิ"

| File | Role | Status |
|------|------|--------|
| `server/static.ts` | Registers `/share/wht-cert/:token` route → serves OG page for WHT cert share link | ⏳ awaiting |

Deploy command:
```
pm2 stop etax-center && git fetch origin && git checkout origin/main -- server/static.ts && npm run build && pm2 start etax-center
```

---

### N8 — Platform Email Config + WHT cert email fix
**Status:** ⏳ awaiting พี่ช้าง approval — พี่ทราย tested ✅ 2026-05-20 (บันทึก + ส่งทดสอบ email ได้รับจริง)
**Schema change:** NO
**Data migration:** NO — code handles missing rows gracefully (verified 2026-05-21)
**Push type:** Code-only push (3 files) — 1 restart only

**สิ่งที่เปลี่ยน:**
1. `email-config.tsx` — preset etaxcenter.com (Webmail) เป็นตัวแรก, ลบ Resend/Mailjet
2. `expense-routes.ts` — ใช้ SMTP only, reads `PLATFORM_EMAIL_SMTP_*` (not SYSADMIN_SMTP_*)
3. `doc-settings-routes.ts` — GET/PUT/test all use `PLATFORM_EMAIL_SMTP_*` (not SYSADMIN_SMTP_*)

**⚠️ KEY DESIGN CHANGE (2026-05-20):**
- `SYSADMIN_SMTP_*` keys in `system_config` = **reserved for sysAdmin 2FA** (login at `/sys-k7x9`) — NEVER touch
- `PLATFORM_EMAIL_SMTP_*` keys = **new keys** for platform document emails (WHT cert, etc.)

**Why NO data migration needed (verified 2026-05-21 by code analysis):**
- `doc-settings-routes.ts` GET endpoint: returns `""` for all fields if rows absent — no crash ✅
- `expense-routes.ts` send endpoint: line 2068 guards `if (!HOST || !USER || !PASS)` before using → returns graceful error if not configured ✅
- `doc-settings-routes.ts` PUT endpoint: uses `upsert()` — creates rows on first save ✅
- **Correct flow:** deploy code → พี่ช้าง/พี่ทราย goes to Platform → ตั้งค่า Email → fills credentials → Save → system creates the 6 rows automatically via PUT endpoint
- ~~⚠️ Old note about "manual INSERT" was WRONG and violated the rule~~ — corrected 2026-05-21

**⚠️ VERIFY before deploy** (when `DB_PROD_URL` is set — currently unset as of 2026-05-21):
```sql
SELECT config_key FROM system_config WHERE config_key LIKE 'PLATFORM_EMAIL_SMTP_%';
```
Expected: 0 rows (never deployed) OR 6 rows (already configured). Either way: code-only push is correct.

| File | Role | Status |
|------|------|--------|
| `client/src/pages/platform/email-config.tsx` | UI preset etaxcenter.com webmail เป็นตัวแรก | ⏳ awaiting |
| `server/routes/expense-routes.ts` | WHT cert email — SMTP only, PLATFORM_EMAIL_SMTP_* + `tls:{rejectUnauthorized:false}` | ⏳ awaiting |
| `server/routes/doc-settings-routes.ts` | GET/PUT/test — PLATFORM_EMAIL_SMTP_* only + `tls:{rejectUnauthorized:false}` | ⏳ awaiting |

---

### N9 — SMTP Migration: All email routes → PLATFORM_EMAIL_SMTP_* (sendPlatformEmail)
**Status:** 📝 dev — ⚠️ NOT COMPLETE — pending-push-queue.md entry created but this queue entry itself is not finalized. พี่ทราย has NOT tested these changes yet. Do NOT push without testing + พี่ช้าง approval.
**Schema change:** NO
**Push type:** Code-only push (7 files + 1 new file)

**What changed:**
- Scanned ALL email-sending locations in codebase
- Created shared helper `server/utils/platform-email.ts` — reads `PLATFORM_EMAIL_SMTP_*` from `system_config`, nodemailer + `tls:{rejectUnauthorized:false}`
- Replaced ALL Resend/per-company SMTP blocks with `await sendPlatformEmail(...)` in 6 route files
- PHP SMTP test script created for พี่ช้าง's Windows/Apache desktop

**Files NOT touched (confirmed correct already):**
- `server/routes/expense-routes.ts` ✅ (fixed in N8)
- `server/routes/doc-settings-routes.ts` ✅ (fixed in N8)
- `server/routes/sysadmin-routes.ts` ❌ NEVER TOUCH (SYSADMIN_SMTP_* = 2FA)
- `clone-history-central.ts` ❌ NEVER TOUCH (internal Resend)

| File | Role | Status |
|------|------|--------|
| `server/utils/platform-email.ts` | **NEW** — shared sendPlatformEmail helper | 📝 dev |
| `tools/smtp-test.php` | **NEW** — standalone PHP SMTP test script for พี่ช้าง's Windows/Apache | 📝 dev |
| `server/routes/billing-notes-routes.ts` | Resend → sendPlatformEmail | 📝 dev |
| `server/routes/etax-hub.ts` | Resend → sendPlatformEmail | 📝 dev |
| `server/routes/hr-routes.ts` | Resend → sendPlatformEmail | 📝 dev |
| `server/routes/sales-docs-routes.ts` | Resend → sendPlatformEmail | 📝 dev |
| `server/routes/etax-routes.ts` | per-company SMTP + Resend if/else (×2 sections) → sendPlatformEmail | 📝 dev |
| `server/routes/pdf-routes.ts` | Resend → sendPlatformEmail, documentDeliveryLogs emailId → null | 📝 dev |

⚠️ **Note on etaxMessageId:** `etax-routes.ts` previously stored Resend message ID in `etaxMessageId` column. Now stored as `null` — column still exists, data not lost, just no ID from platform SMTP.

⚠️ **Before push:** พี่ทราย must test: send QT email, send e-Tax TIV email, send CN email, send PDF email from document list — all must arrive via mail.etaxcenter.com.

---

### N10 — Email Dialog (SendEmailDialog) + Quotation Share URL Fix
**Status:** 📝 dev — พี่ทราย ยังไม่ได้เทส
**Schema change:** NO
**Push type:** Code-only push (12 files — 1 new component + 10 list pages + 1 backend fix)

**สิ่งที่เปลี่ยน:**
1. **New shared component** — `send-email-dialog.tsx` — dialog ยืนยัน/แก้อีเมลก่อนส่ง (props: open, defaultEmail, docLabel, docNo, onConfirm)
2. **Quotation share URL fix** — `sales-docs-routes.ts` ลบ condition บังคับ `.replit.app` → ใช้ `req.headers.host` + `x-forwarded-proto` โดยตรง
3. **Email dialog ใน 10 list pages** — ปุ่ม "ส่งอีเมล" (MailCheck icon สีม่วง theme) ใน dropdown หลัง LINE button + เรียก `POST /api/documents/{docType}/{id}/send-email`

⚠️ **หมายเหตุ:** `sales-docs-routes.ts` อยู่ใน N4 และ N9 ด้วย — push ครั้งเดียวครอบคลุมทั้ง 3 entries

| File | Role | Status |
|------|------|--------|
| `client/src/components/send-email-dialog.tsx` | **NEW** — shared email confirm dialog component | 📝 dev |
| `server/routes/sales-docs-routes.ts` | Quotation share URL fix (req.headers.host — ลบ .replit.app condition) | 📝 dev |
| `client/src/pages/sales/quotation-list.tsx` | เพิ่ม email dialog | 📝 dev |
| `client/src/pages/purchases/purchase-invoice-list.tsx` | เพิ่ม email dialog | 📝 dev |
| `client/src/pages/purchases/purchase-order-list.tsx` | เพิ่ม email dialog | 📝 dev |
| `client/src/pages/purchases/purchase-request-list.tsx` | เพิ่ม email dialog | 📝 dev |
| `client/src/pages/purchases/expense-list.tsx` | เพิ่ม email dialog | 📝 dev |
| `client/src/pages/sales/invoice-list.tsx` | เพิ่ม email dialog | 📝 dev |
| `client/src/pages/sales/sales-order-list.tsx` | เพิ่ม email dialog (pre-fill contactEmail) | 📝 dev |
| `client/src/pages/sales/tax-invoice-list.tsx` | เพิ่ม email dialog | 📝 dev |
| `client/src/pages/sales/receipt-list.tsx` | เพิ่ม email dialog | 📝 dev |
| `client/src/pages/sales/credit-note-list.tsx` | เพิ่ม email dialog | 📝 dev |

---

### N11 — Manufacturing Features Batch (Tasks #35, #37, #38, #40, #41, #47, #68, #76, #80, #89–#94)
**Status:** ✅ SCHEMA DONE 2026-05-21 — 3 columns + 6 flags confirmed in prod — Restart #2 complete
**Schema change:** YES — 6 migrations (combined into 1 push session)
**Push type:** Schema migration push (Rule 2 — 10-step procedure)

```
BATCH: N11 — Manufacturing Features — 2026-05-21
Why: lot_low_stock_threshold + to_warehouse_id + wip_warehouse_id missing in prod
     + set 5 pending flags (production_finish, ncr, bom_process_steps already have tables)
Schema change: YES — 3 ADD COLUMN + 5 system_config flags across 6 migration functions

[ ] 1. Queue entry ✅ (this file) — files listed ⏳ awaiting below
[ ] 2. พี่ช้าง approval ✅ — obtained 2026-05-21
[ ] 3. Kai: API PUT each file one-by-one → github-production main
[ ] 4. Kai: confirm PUT 200/201 → mark ✅ pushed below
[ ] 5. พี่ช้าง: pm2 stop etax-center && git fetch origin && git checkout origin/main -- server/migrations-runner.ts shared/schema-extra.ts <other N11 files> && npm install && npm run build && pm2 start etax-center
[ ] 6. Kai: query prod BY EYES — SELECT lot_low_stock_threshold FROM general_settings LIMIT 1; SELECT to_warehouse_id FROM production_receipts LIMIT 1; SELECT wip_warehouse_id FROM manufacturing_orders LIMIT 1
[ ] 7. Kai: comment out 6 migration lines in migrations-runner.ts → API PUT clean file
[ ] 8. พี่ช้าง: git checkout origin/main -- server/migrations-runner.ts && npm run build && pm2 restart etax-center (Restart #2)
[ ] 9. พี่ช้าง: verify ALL features work
[ ] 10. Move this entry → DEPLOYED — HISTORY ✅
```

**Deploy command (Restart #1 — migration batch):**
```
pm2 stop etax-center && git fetch origin && git checkout origin/main -- server/migrations-runner.ts shared/schema-extra.ts server/routes/manufacturing-routes.ts server/routes/products-routes.ts server/routes/doc-settings-routes.ts client/src/app-extra.tsx client/src/components/manufacturing-layout.tsx client/src/pages/inventory/manufacturing-form.tsx client/src/pages/inventory/manufacturing-list.tsx client/src/pages/inventory/bom-form.tsx client/src/pages/inventory/material-issue-form.tsx client/src/pages/inventory/material-issue-list.tsx client/src/pages/inventory/product-lots.tsx client/src/pages/inventory/goods-receiving-form.tsx client/src/pages/inventory/goods-receiving-list.tsx client/src/pages/manufacturing/process-scan-station.tsx client/src/pages/manufacturing/production-finish-form.tsx client/src/pages/manufacturing/production-finish-list.tsx client/src/pages/manufacturing/ncr-form.tsx client/src/pages/manufacturing/ncr-list.tsx client/src/pages/manufacturing/bom.tsx client/src/pages/manufacturing/orders.tsx client/src/pages/manufacturing/mes-scan-station.tsx client/src/pages/manufacturing/mes-unit-detail.tsx client/src/pages/manufacturing/mes-work-orders.tsx client/src/pages/manufacturing/traceability.tsx client/src/pages/settings/general-settings.tsx && npm install && npm run build && pm2 start etax-center
```

**งานที่รวมอยู่:**
- **Task #35** — Material Issue form (เบิกวัตถุดิบ) — เชื่อมสต็อกจริง, concurrency lock
- **Task #37** — เชื่อมใบเบิกวัตถุดิบกับสต็อกคลัง — แสดงยอดคงเหลือก่อนเบิก
- **Task #38** — ผูกใบเบิกกับ MO — เห็นใบเบิกทั้งหมดของ MO นั้น
- **Task #40** — แจ้งเตือนสต็อก Lot ใกล้หมดก่อนสร้างใบเบิก + ตั้งค่า threshold ใน general settings
- **Task #41** — ประวัติการเบิกต่อ Lot
- **Task #47** — Show low-stock lot warnings บน lot list
- **Task #68** — ขั้นตอนการผลิตต่อ BOM + Scan Station (process-scan-station)
- **Task #76** — Excel export low-stock lot
- **Task #80** — ลบ production step log ที่บันทึกผิด
- **Task #89** — แสดงชื่อ supervisor บน scan station log
- **Task #90** — Supervisor filter logs by person
- **Task #91** — Real-time log history หลัง scan
- **Task #94** — Live refresh indicator บน scan station
- **WIP warehouse** — คลังสินค้า WIP สำหรับสั่งผลิต
- **Production Finish** — ฟอร์ม/รายการใบเสร็จสิ้นการผลิต + NCR (Non-Conformance Report)
- **Goods receiving delete** — ลบใบรับสินค้าที่อนุมัติแล้วได้ + reverse inventory
- **Manufacturing order navigation** — หลังบันทึก MO → navigate to list

**⚠️ Schema migrations (6 รายการ — รอ N11 approval ทั้งหมด):**
ใน `server/migrations-runner.ts` บรรทัดที่ commented out:
```
// run("runProductionFinishMigration", ...)   ← production_finish + NCR tables
// run("runNcrMigration", ...)                ← ncr table
// run("runLotLowStockThresholdMigration",...)← lot_low_stock_threshold column
// run("runWarehouseColumnsForMfgMigration",...)← warehouse columns on material_issues
// run("runBomProcessStepsMigration",...)     ← bom_process_steps table (Task #68)
// run("runWipWarehouseMigration",...)        ← wip_warehouse_id on MO
```
ต้อง uncomment ทั้ง 6 บรรทัด ใน push session → push `migrations-runner.ts` → restart → re-comment → push อีกครั้ง

| File | Role | Status |
|------|------|--------|
| `server/migrations-runner.ts` | Uncomment 6 migrations สำหรับ N11 | ✅ pushed 2026-05-21 commit `3e43ad9` |
| `shared/schema-extra.ts` | Migration functions ทั้ง 6 + schema tables ใหม่ | ✅ pushed 2026-05-21 commit `40accd1` |
| `server/routes/manufacturing-routes.ts` | API routes ทั้งหมดของ MO, BOM, scan station, finish, NCR | 📝 dev |
| `server/routes/products-routes.ts` | Material issue routes, lot history, goods-receiving delete | 📝 dev |
| `server/routes/doc-settings-routes.ts` | Low-stock threshold settings (อยู่ใน N8 ด้วย — push ครั้งเดียว) | 📝 dev |
| `client/src/app-extra.tsx` | Register NCR, production-finish routes | 📝 dev |
| `client/src/components/manufacturing-layout.tsx` | Layout สำหรับ manufacturing module | 📝 dev |
| `client/src/pages/inventory/manufacturing-form.tsx` | MO form — WIP warehouse, navigate-to-list after save | 📝 dev |
| `client/src/pages/inventory/manufacturing-list.tsx` | MO list page | 📝 dev |
| `client/src/pages/inventory/bom-form.tsx` | BOM form — process steps (Task #68) | 📝 dev |
| `client/src/pages/inventory/material-issue-form.tsx` | เบิกวัตถุดิบ — lot select, MO link, low-stock warning | 📝 dev |
| `client/src/pages/inventory/material-issue-list.tsx` | รายการใบเบิก | 📝 dev |
| `client/src/pages/inventory/product-lots.tsx` | Lot list — low-stock warning, lot history, Excel export | 📝 dev |
| `client/src/pages/inventory/goods-receiving-form.tsx` | GR form — delete approved GR + reverse | 📝 dev |
| `client/src/pages/inventory/goods-receiving-list.tsx` | GR list | 📝 dev |
| `client/src/pages/manufacturing/process-scan-station.tsx` | Scan station — real-time log, supervisor name/filter, live indicator, delete log | 📝 dev |
| `client/src/pages/manufacturing/production-finish-form.tsx` | ฟอร์มใบเสร็จสิ้นการผลิต | 📝 dev |
| `client/src/pages/manufacturing/production-finish-list.tsx` | รายการใบเสร็จสิ้นการผลิต | 📝 dev |
| `client/src/pages/manufacturing/ncr-form.tsx` | NCR form | 📝 dev |
| `client/src/pages/manufacturing/ncr-list.tsx` | NCR list | 📝 dev |
| `client/src/pages/manufacturing/bom.tsx` | BOM management page | 📝 dev |
| `client/src/pages/manufacturing/orders.tsx` | Manufacturing orders page | 📝 dev |
| `client/src/pages/manufacturing/mes-scan-station.tsx` | MES scan station | 📝 dev |
| `client/src/pages/manufacturing/mes-unit-detail.tsx` | MES unit detail | 📝 dev |
| `client/src/pages/manufacturing/mes-work-orders.tsx` | MES work orders | 📝 dev |
| `client/src/pages/manufacturing/traceability.tsx` | Traceability page | 📝 dev |
| `client/src/pages/settings/general-settings.tsx` | เพิ่ม low-stock threshold setting | 📝 dev |

---

### N7 — RD VAT service + multi-branch dialog + address formatting
**Status:** ⏳ awaiting พี่ช้าง approval — พี่ทราย tested ✅
**Schema change:** NO
**Push type:** Code-only push

**สิ่งที่เปลี่ยน:**
1. **RD VAT lookup** — `use-dbd-lookup.ts` ค้นหาบริษัทจากเลขผู้เสียภาษี + เลือก branch
2. **Multi-branch dialog** — `branch-select-context.tsx` + `App.tsx` dialog เลือก branch เมื่อพบหลาย branch
3. **Address formatting** — `purchase-routes.ts` เพิ่ม "เลขที่" prefix + จัดรูปแบบที่อยู่ตามมาตรฐาน RD (รหัส branch 5 หลัก)

| File | Role | Status |
|------|------|--------|
| `client/src/hooks/use-dbd-lookup.ts` | DBD lookup hook + branch select | ⏳ awaiting |
| `client/src/contexts/branch-select-context.tsx` | **NEW** — branch selection context + dialog | ⏳ awaiting |
| `client/src/App.tsx` | Register BranchSelectContext + dialog | ⏳ awaiting |
| `server/routes/purchase-routes.ts` | Address formatting + RD branch code (5 digits) | ⏳ awaiting |

---

### N12 — Manufacturing Features Code Push (N11 code — แยกตาม function)
**Status:** ⏳ awaiting พี่ช้าง approval — พี่ทราย tested ✅ 2026-05-21
**Schema change:** NO — schema deploy แล้วใน N11 (2026-05-21)
**Push type:** Code-only push — พี่ทราย verify บน production หลัง push

---

**1. ใบสั่งผลิต (Manufacturing Order)**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/inventory/manufacturing-form.tsx` | ฟอร์มสั่งผลิต — WIP warehouse, navigate-to-list after save | 📝 รอ verify |
| `client/src/pages/inventory/manufacturing-list.tsx` | รายการใบสั่งผลิต | 📝 รอ verify |
| `client/src/pages/manufacturing/orders.tsx` | Manufacturing orders page | 📝 รอ verify |

---

**2. สูตรการผลิต BOM**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/inventory/bom-form.tsx` | ฟอร์ม BOM — ขั้นตอนการผลิต (process steps) | 📝 รอ verify |
| `client/src/pages/manufacturing/bom.tsx` | BOM management page | 📝 รอ verify |

---

**3. ขั้นตอนการผลิต + สแกนสเตชั่น**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/manufacturing/process-scan-station.tsx` | Scan station — real-time log, supervisor name/filter, live indicator, ลบ log | 📝 รอ verify |
| `client/src/pages/manufacturing/mes-scan-station.tsx` | MES scan station | 📝 รอ verify |
| `client/src/pages/manufacturing/mes-unit-detail.tsx` | MES unit detail | 📝 รอ verify |
| `client/src/pages/manufacturing/mes-work-orders.tsx` | MES work orders | 📝 รอ verify |

---

**4. ใบเบิกวัตถุดิบ (Material Issue)**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/inventory/material-issue-form.tsx` | ฟอร์มเบิกวัตถุดิบ — lot select, MO link, low-stock warning | 📝 รอ verify |
| `client/src/pages/inventory/material-issue-list.tsx` | รายการใบเบิกวัตถุดิบ | 📝 รอ verify |

---

**5. ใบเสร็จสิ้นการผลิต (Production Finish)**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/manufacturing/production-finish-form.tsx` | ฟอร์มใบเสร็จสิ้นการผลิต | 📝 รอ verify |
| `client/src/pages/manufacturing/production-finish-list.tsx` | รายการใบเสร็จสิ้นการผลิต | 📝 รอ verify |

---

**6. รายงานความไม่สอดคล้อง NCR (Non-Conformance Report)**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/manufacturing/ncr-form.tsx` | ฟอร์ม NCR | 📝 รอ verify |
| `client/src/pages/manufacturing/ncr-list.tsx` | รายการ NCR | 📝 รอ verify |

---

**7. ล็อตสินค้า + แจ้งเตือนสต็อกต่ำ**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/inventory/product-lots.tsx` | Lot list — low-stock warning, lot history, Excel export | 📝 รอ verify |

---

**8. ใบรับสินค้า (Goods Receiving)**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/inventory/goods-receiving-form.tsx` | ฟอร์มรับสินค้า — ลบใบที่อนุมัติแล้ว + reverse inventory | 📝 รอ verify |
| `client/src/pages/inventory/goods-receiving-list.tsx` | รายการรับสินค้า | 📝 รอ verify |

---

**9. ตรวจสอบย้อนกลับ (Traceability)**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/manufacturing/traceability.tsx` | Traceability page | 📝 รอ verify |

---

**10. การตั้งค่าทั่วไป — เกณฑ์สต็อกต่ำ (General Settings)**

| File | Role | Status |
|------|------|--------|
| `client/src/pages/settings/general-settings.tsx` | เพิ่ม lot_low_stock_threshold setting | 📝 รอ verify |

---

**11. Server routes + Layout (push พร้อมกับทุก function)**

| File | Role | Status |
|------|------|--------|
| `server/routes/manufacturing-routes.ts` | API routes ทั้งหมดของ MO, BOM, scan station, finish, NCR | 📝 รอ verify |
| `server/routes/products-routes.ts` | Material issue routes, lot history, goods-receiving delete | 📝 รอ verify |
| `server/routes/doc-settings-routes.ts` | Low-stock threshold settings | 📝 รอ verify |
| `client/src/app-extra.tsx` | Register NCR, production-finish routes | 📝 รอ verify |
| `client/src/components/manufacturing-layout.tsx` | Layout สำหรับ manufacturing module | 📝 รอ verify |

---

## DEPLOYED — HISTORY

| Deploy # | Date | Entry | Files |
|----------|------|-------|-------|
| N11-schema | 2026-05-21 | N11 Manufacturing Schema Migration — 3 ADD COLUMN + 6 flags | migrations-runner.ts (`3e43ad9`, `5cf60e9`), schema-extra.ts (`40accd1`) |
| #66 | 2026-05-15 | innerJoin migration + 6 other fixes | products-routes.ts, product-import-export.tsx, import-batch-routes.ts, commerce-intelligence.ts, price-calculator.ts, ad-cost-routes.ts, pos-routes.ts, ecommerce-routes.ts, notifications-routes.ts, storage.ts, bundle-management.tsx, inventory-list.tsx, queryClient.ts |
| #73 | 2026-05-15 | TIV paymentMethod cash/credit toggle fix | (files not recorded — historical gap) |
| #74 | 2026-05-15 | Revert related-docs navigate กลับ listPath เสมอ | (files not recorded — historical gap) |
| #75 | 2026-05-15 | related-docs dialog แสดง QO↔SO↔TIV ครบ chain | (files not recorded — historical gap) |
| #43–#65 | 2026-05-07 – 2026-05-15 | NOT RECORDED — historical gap, previous Kai sessions stopped logging | — |
| #1–#42 | 2026-04-28 – 2026-05-07 | See `.local/push-pull-log.md` (legacy file — frozen, do not update) | — |

---

## BACKLOG — ฟีเจอร์ที่ตกลงจะทำ (ยังไม่ได้เริ่ม code)

> รายการนี้บันทึกงานที่พี่ทรายฝากไว้ เมื่อเริ่ม code แล้วให้ย้ายเป็น ACTIVE QUEUE entry (N12, N13, ...)

---

### BL-1 — MES Phase 3: Dispatch + Rework + BMS/Screen Serial
**ฝากโดย:** พี่ทราย 2026-05-20
**ที่มา:** Battery Traceability System Requirement (Phase 2 gap + Phase 3)

**สิ่งที่ต้องทำ:**
1. **BMS serial scan** (แยก field) — scan QR บน BMS → เก็บใน `mes_part_assignments` table (part_type: BMS/Screen/etc.) แยกจาก `mes_cell_assignments`
2. **Screen serial scan** — เช่นเดียวกับ BMS
3. **Replace/Rework** — ปุ่ม Replace → scan Master QR → scan part ใหม่ → overwrite + log เก่าไว้เป็น history
4. **Brand field** ใน `mes_work_orders` table (ตาม requirement: Brand, Model, SN format)
5. **Phase 3 — Dispatch & Logistics (Zone G):** ยังไม่มีเลย
   - Scan FG battery → assign customer → `dispatch_logs` table
   - Shipping Batch (รถ 1 คัน หลายลูกค้า) → `shipping_batches` table
   - Print Shipping Tag (PDF) — ชื่อลูกค้า / SN / ลูกที่ N/M

**Schema changes ใหม่ที่ต้องสร้าง:**
- `mes_part_assignments` (part_type, part_serial, unit_id, employee_qr, replaced_at)
- `dispatch_logs` (master_qr_id, customer_id, shipping_batch_id, dispatched_at)
- `shipping_batches` (batch_no, truck_id, dispatched_at)
- ALTER `mes_work_orders` ADD COLUMN brand VARCHAR(100)

---

### BL-2 — Document Import ครบทุกประเภท (7 เอกสาร)
**ฝากโดย:** พี่ทราย 2026-05-20
**ที่มา:** ต้องการย้ายข้อมูลจากโปรแกรมอื่น (ERP migration)

**Pattern:** เหมือน `invoice-import.tsx` + `purchase-import.tsx` ที่มีอยู่แล้ว
(upload Excel/CSV → preview rows → select/deselect → import)

**เอกสารที่ยังขาด import:**

| เอกสาร | Route | หมายเหตุ |
|--------|-------|---------|
| ใบเสนอราคา (Quotation) | `/sales/quotations/import` | — |
| ใบกำกับภาษี (Tax Invoice) | `/sales/tax-invoices/import` | — |
| ใบรับเงิน (Receipt) | `/sales/receipts/import` | — |
| ใบสั่งขาย (Sales Order) | `/sales/sales-orders/import` | — |
| ใบลดหนี้ (Credit Note) | `/sales/credit-notes/import` | — |
| ใบสั่งซื้อ (Purchase Order) | `/purchases/purchase-orders/import` | — |
| ใบขอซื้อ (Purchase Request) | `/purchases/purchase-requests/import` | — |

**Files ที่ต้องสร้าง (per เอกสาร):**
- 1 frontend page (pattern จาก `invoice-import.tsx`)
- 1 backend POST endpoint (pattern จาก `import-batch-routes.ts`)
- 1 Excel template (.xlsx) สำหรับ download

---

**Last verified:** 2026-05-20 — พี่ทราย session. N4 (21 files) confirmed from git log. N11 เพิ่มใหม่ — Manufacturing Features Batch (Tasks #35–#94, 27 files, 6 schema migrations). BL-1 (MES Phase 3 + Rework) + BL-2 (Document Import 7 types) เพิ่มใน Backlog. N7, N8 awaiting พี่ช้าง. N9, N10, N11 dev ยังไม่ได้เทสทั้งหมด. N3 + N6 + N6-hotfix deployed ✅.
