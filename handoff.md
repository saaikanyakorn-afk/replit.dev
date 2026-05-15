# HANDOFF — E-Tax Center (Kai)
(dynamic file — update whenever work status changes, agent switches, or task progresses)
Last updated: 2026-05-15

---

## CURRENT TASK

**Task:** รอ พี่ช้าง authorize push to GitHub
**Status:** หลาย bug fixes สะสมบน dev — ยังไม่ได้ push GitHub เลย

---

## PENDING GITHUB PUSH (dev only — not yet on GitHub)

### ชุด A: innerJoin migration (authorized by พี่ช้าง 2026-05-13)
Pattern: `eq(products.active, true/false)` → `innerJoin(activeProducts, ...)` across 8 files:

| File | Sites |
|------|-------|
| server/routes/commerce-intelligence.ts | 2 |
| server/routes/price-calculator.ts | 1 |
| server/routes/ad-cost-routes.ts | 1 |
| server/routes/pos-routes.ts | 2 |
| server/routes/ecommerce-routes.ts | 2 |
| server/routes/notifications-routes.ts | 1 |
| server/routes/products-routes.ts | 3 |
| server/storage.ts | 1 |

### ชุด B: Bug fixes (2026-05-14 to 2026-05-15) — พี่ทราย verified PASS ✅

| Fix | File | Status |
|-----|------|--------|
| stockOpenDate ไม่ถูก destructure → stock movement ใช้วันผิด | server/routes/products-routes.ts | ✅ dev verified |
| Delete button (Trash2) + deleteMutation ใน bundle management | client/src/pages/inventory/bundle-management.tsx | ✅ |
| Bulk permanent delete limit 500→1000 | server/routes/products-routes.ts | ✅ |
| Pagination option 1000 ใน inventory list | client/src/pages/inventory/inventory-list.tsx | ✅ |
| Import preview split duplicateInFile vs duplicateInSystem | server/routes/products-routes.ts + client/src/pages/inventory/product-import-export.tsx | ✅ |
| DatePicker (DD/MM/YYYY BE) แทน native input[date] สำหรับ stock open date | client/src/pages/inventory/product-import-export.tsx | ✅ |
| Fallback badge "รายการซ้ำ" สำหรับ response เก่า | client/src/pages/inventory/product-import-export.tsx | ✅ |
| unitCost hardcode "0" → ใช้ entry.cost จาก Excel จริง | server/routes/products-routes.ts + client/src/pages/inventory/product-import-export.tsx | ✅ |
| Delete import batch → deactivate แทนลบจริง เพราะ initial stock_movements นับเป็น FK | server/routes/import-batch-routes.ts | ✅ dev verified |

---

## WHAT NEXT AGENT MUST DO

**STEP 1** — ขอ พี่ช้าง authorize push ชุด A + ชุด B ไป GitHub พร้อมกัน
  - Do NOT push without explicit authorization from พี่ช้าง.

**STEP 2** — Push method: GitHub API PUT per file via code_execution only.
  - Token: retrieve from `git remote get-url github-production` — verify suffix ends with `UnnR7`
  - Protected files (ใช้ -extra bypass): App.tsx, server/index.ts, shared/schema.ts

**STEP 3** — After GitHub push confirmed → ask พี่ช้าง for authorization for production server command.
  - DO NOT issue server command without พี่ช้าง's explicit instruction.

---

## FILES TO PUSH (all files touched since last GitHub push)

- server/routes/products-routes.ts
- server/routes/import-batch-routes.ts
- server/routes/commerce-intelligence.ts
- server/routes/price-calculator.ts
- server/routes/ad-cost-routes.ts
- server/routes/pos-routes.ts
- server/routes/ecommerce-routes.ts
- server/routes/notifications-routes.ts
- server/storage.ts
- client/src/pages/inventory/product-import-export.tsx
- client/src/pages/inventory/inventory-list.tsx
- client/src/pages/inventory/bundle-management.tsx
