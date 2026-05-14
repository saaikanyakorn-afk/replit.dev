# HANDOFF — E-Tax Center (Kai)
(dynamic file — update whenever work status changes, agent switches, or task progresses)
Last updated: 2026-05-13

---

## CURRENT TASK

**Task:** Migrate 14 `eq(products.active, true/false)` WHERE-clause sites → `innerJoin` pattern
**Authorized by:** พี่ช้าง
**Status:** DEV COMPLETE — waiting for พี่ทราย to verify dev before GitHub push

---

## WHAT WAS DONE (dev only — not yet on GitHub)

Pattern applied across 8 files:
```
BEFORE: .where(and(..., eq(products.active, true), ...))
AFTER:  .innerJoin(activeProducts, eq(activeProducts.id, products.id))
        .where(and(...))
```

| File | Sites |
|------|-------|
| server/routes/commerce-intelligence.ts | 2 |
| server/routes/price-calculator.ts | 1 |
| server/routes/ad-cost-routes.ts | 1 |
| server/routes/pos-routes.ts | 2 |
| server/routes/ecommerce-routes.ts | 2 |
| server/routes/notifications-routes.ts | 1 |
| server/routes/products-routes.ts | 3 |
| server/storage.ts | 1 (findDuplicateProducts) |

Verification: `grep -rn "eq(products.active" server/` → **0 results** ✅

---

## ADDITIONAL BUG FIXED (2026-05-14 — found during พี่ทราย dev test)

**Bug:** สต๊อกการ์ดแสดงวันที่ผิด — นำเข้า Excel เลือกวันที่ 1 เมษา แต่บันทึกเป็นวันนี้แทน
**Root cause:** `server/routes/products-routes.ts` — POST `/api/products/import/execute`
  - Frontend ส่ง `stockOpenDate` ใน request body ✅
  - Backend ไม่ได้ destructure `stockOpenDate` ออกมา ❌ → stock_movement insert ใช้ `defaultNow()` แทน
**Fix:** เพิ่ม `stockOpenDate` ใน destructuring (line 409) + ส่ง `createdAt: new Date(stockOpenDate)` ใน stock_movement insert (line 559)
**File:** `server/routes/products-routes.ts` — เพิ่มเข้า list ที่ต้อง push GitHub (ไฟล์นี้อยู่ใน list เดิมอยู่แล้ว)
**Status:** แก้บน dev แล้ว — รอพี่ทรายยืนยันว่าถูกต้อง

---

## WHAT NEXT AGENT MUST DO

**STEP 1** — Check if พี่ทราย has replied with dev test results (look in chat history).
  - If not yet → show her the screen list below and wait for her response.
  - If she already replied → record results in this file, then proceed to STEP 2.

**STEP 2** — After พี่ทราย confirms dev PASS → ask พี่ช้าง for authorization to push to GitHub.
  - Do NOT push without explicit authorization from พี่ช้าง.

**STEP 3** — After พี่ช้าง authorizes → push the 8 files above to GitHub.
  - Push method: GitHub API PUT per file via code_execution only.
  - Token: retrieve from git remote config (see reference file known to returning agents).

**STEP 4** — After GitHub push confirmed → ask พี่ช้าง for authorization for production server command.
  - DO NOT issue server command without พี่ช้าง's explicit instruction.

**NOTE:** พี่ช้าง said: no server command tonight (2026-05-13). GitHub push only at most.

---

## SCREENS พี่ทราย MUST VERIFY ON DEV

Open each screen, check that data displays normally and no errors appear.

| Code | Screen | What to check |
|------|--------|---------------|
| A1 | Products list | สินค้า active ยังขึ้นรายการครบ |
| A2 | Create/Edit product | กรอกรหัส/ชื่อที่มีอยู่แล้ว → duplicate check ยังแจ้งเตือน |
| B1 | Notifications | list โหลดขึ้น ไม่ error |
| C1 | Commerce Intelligence dashboard | กราฟและตัวเลขสินค้ายังแสดง |
| C2 | Commerce Intelligence → Stock Risk / Low Stock | รายการสินค้า low stock ยังขึ้น |
| D1 | Price Calculator | dropdown สินค้าโหลดได้ |
| E1 | Ad Cost | dropdown หรือรายการสินค้ายังแสดง |
| F1 | POS → ค้นหาสินค้า | พิมพ์ชื่อสินค้า → ผลลัพธ์ยังออก |
| F2 | POS → Bundle products | list ยังแสดง |
| G1 | E-commerce → รายการสินค้า | ยังขึ้นปกติ |
| G2 | E-commerce → Low stock report | ยังโหลดได้ |

---

## พี่ทราย RESPONSE
(fill in after she replies — include enough detail for any agent to understand what passed/failed)

Date/time:
Results:
  [A1]:
  [A2]:
  [B1]:
  [C1]:
  [C2]:
  [D1]:
  [E1]:
  [F1]:
  [F2]:
  [G1]:
  [G2]:
Overall: PASS / FAIL / PARTIAL
Notes:
