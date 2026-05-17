# HANDOFF — E-Tax Center (Kai)
## THE ONLY HANDOFF FILE. No other handoff file exists or should exist.

---

## ✅ SELF-CHECK — PROVE YOU FINISHED READING replit.md

**Before reading anything below — answer this:**
> What does the last line of `replit.md` say?

**Answer:** `3. Read \`handoff.md\` next.`

If you could not answer that without looking — **stop. Go finish reading replit.md first.**
Read it in 500-line chunks using `offset` and `limit` parameters until you reach the end.
Only come back here after you have seen that last line with your own eyes.

---

## HOW THIS FILE WORKS (read before anything else)

This file has two sections:
- **ACTIVE** — what is not done yet. Next Kai starts here.
- **HISTORY** — what was completed. Append here when closing items.

**Rules for every Kai, every session:**
1. Read `replit.md` fully (all lines, in chunks if needed) — no skipping
2. Read `db/schema-history.md` — check for 🔄 active migrations
3. Read this file top to bottom
4. Update this file IMMEDIATELY when any item changes — before replying to anyone
5. When session ends — move completed items to HISTORY section below, update ACTIVE section

---

## ⚠️ PRINCIPLES — READ THIS BEFORE WRITING A SINGLE LINE OF CODE

These were taught by พี่ช้าง directly. Violating them is not a technical mistake — it is a trust mistake.

### 1. LISTEN BEFORE YOU ACT
Humans speak in sentences. They pause between thoughts. **Do not act on the first sentence.** Wait for the full context. This applies to both พี่ช้าง and พี่ทราย. If you jump to code before they finish speaking, you will solve the wrong problem — guaranteed.

### 2. CONFIRM BEFORE YOU CODE
Before writing any code, **say out loud what you understood and what you are about to do.** Wait for a "yes, correct" before proceeding. This takes 10 seconds and saves hours of wrong work.

### 3. BUSINESS REQUIREMENTS COME FROM พี่ทราย — NOT FROM YOUR ASSUMPTIONS
You do not know the business. พี่ทราย does. If you don't have the full business requirement, **ask พี่ทราย first.** Jumping to code on your own business conclusion is more dangerous than any technical mistake.

### 4. TECHNICAL DECISIONS ARE YOURS — BUT ONLY AFTER YOU UNDERSTAND THE BUSINESS
Once you have the full business requirement, **you own every technical decision.** พี่ช้าง and พี่ทราย are not here to remind you about encoding, validation, race conditions, or error handling. If you write code, every edge case is your responsibility — not theirs.

### 5. พี่ช้าง IS NOT WATCHING EVERY MOMENT
He cannot. You must operate independently and correctly. If you need a decision, ask clearly and wait. If you have the decision, execute it completely and correctly without being reminded.

### 6. BLOCK BAD DATA AT EVERY ENTRY POINT — NOT JUST ONE
If a field has a rule (e.g., no Thai in product code), block it everywhere: UI form, Excel import preview, Excel import execute, API POST, API PATCH — and at the DB level too. Blocking only one layer is not enough.

### 7. UNDERSTAND WHY A RULE EXISTS — NOT JUST WHAT IT SAYS
Blindly following the letter of a rule while ignoring its purpose is the same as disobeying the rule.

Example: NO FALLBACK rule. The letter says "no `|| false`". The PURPOSE is: every unexpected value must fail loudly — never silently continue. Removing `|| false` but leaving `undefined` pass through quietly violates the purpose even though it satisfies the letter.

Before applying any rule, ask: **what problem does this rule exist to prevent?** Then make sure your code prevents that actual problem — not just the surface symptom the rule mentions.

---

**Why ONE file:** Two active files = confusion + conflict. Newer = truth. One file = no conflict possible.

**If this file feels too long:** Compress old HISTORY entries to one line each. Never split into multiple files.

---

## ROLES

| Person | Role | Authority |
|--------|------|-----------|
| **พี่ช้าง** (Apichart) | Technical Authority | ONLY person who can authorize ANY production action |
| **พี่ทราย** (Saikaew) | Business Owner | Tests on dev, approves UX/business behavior, CANNOT authorize production push |

---

## PUSH METHOD (never forget)

- **Production push**: GitHub API PUT via `code_execution` only
- Token: `git remote get-url github-production` — extract from URL (NOT `GITHUB_PAT_PRODUCTION` env var — that is a trap)
- **Dev push**: `git push github-dev main` — after every code change, no auth needed
- **NEVER**: push entire branch to github-production

---

## ═══════════════════════════════════
## ACTIVE — CURRENT STATE
## ═══════════════════════════════════

**Last verified:** 2026-05-17 — Task #35 ใบเบิกวัตถุดิบ + QR Scan ✅ done dev
**Production status:** Last known deploy #75 (2026-05-15) ✅
**Pending work:** Task #35 complete on dev — awaiting พี่ทราย test + พี่ช้าง approval before push

---

### SESSION 2026-05-17 — TASK #34 GR LOT QR LABEL

| # | Change | File | Status |
|---|--------|------|--------|
| T34-1 | Backend `GET /api/goods-receivings/:id/lot-labels` — returns array of label data per GR item (lotId, lotNumber, mfgDate, expDate, vendor, grDate, grNo, productId/Name/Code, companyId, hasLot) | `server/routes/products-routes.ts` line 2031 | ✅ dev |
| T34-2 | Frontend `LotQRCanvas` component — renders QR onto canvas via `QRCode.toCanvas`, defined before main component | `client/src/pages/inventory/goods-receiving-form.tsx` line 42 | ✅ dev |
| T34-3 | State: `showLotLabels`, `lotLabels[]`, `loadingLabels` — added to GRForm component | `client/src/pages/inventory/goods-receiving-form.tsx` line 104-106 | ✅ dev |
| T34-4 | `handlePrintLotLabels()` — fetches lot-labels API, sets state, opens Dialog | `client/src/pages/inventory/goods-receiving-form.tsx` line 424 | ✅ dev |
| T34-5 | Print button "พิมพ์ QR วัตถุดิบ" — shows only when `form.status === "approved" && editingId`, green border/text, calls handlePrintLotLabels | `client/src/pages/inventory/goods-receiving-form.tsx` line 466 | ✅ dev |
| T34-6 | Dialog modal — QR label grid (3 cols), print CSS (`@media print` hides sidebar/header), per-label: canvas QR + product info (name, code, lot, vendor, grDate, mfgDate, expDate, grNo), "พิมพ์" button calls `window.print()` | `client/src/pages/inventory/goods-receiving-form.tsx` line 839 | ✅ dev |

**Task #34 COMPLETE.** Task #35 (material-issue-lot-scan) is now unblocked.

**⚠️ S7 DEBUG LOG:** Searched `console.log(req.body)` — not found in products-routes.ts. Already removed (cleared ✅).

---

### SESSION 2026-05-17 NIGHT — TASK #35 ใบเบิกวัตถุดิบ + QR Scan

| # | Change | File | Status |
|---|--------|------|--------|
| T35-1 | Migration `runMaterialIssueMigration()` — creates `material_issues` + `material_issue_items` tables. Flag: `CREATE_MATERIAL_ISSUE_TABLES_20260517`. Called at top of `registerProductsRoutes()`. | `server/schema-extra.ts` line 63 | ✅ dev |
| T35-2 | Backend: `GET /api/users/employee-qr-data` — returns employees with QR payload `{type:"EMPLOYEE",userId,name}` filtered by allowedCompanyIds | `server/routes/products-routes.ts` line 2655 | ✅ dev |
| T35-3 | Backend: `GET /api/material-issues` — list by companyId, JOIN users+MO | `server/routes/products-routes.ts` line 2699 | ✅ dev |
| T35-4 | Backend: `GET /api/material-issues/:id` — detail with items array | `server/routes/products-routes.ts` line 2712 | ✅ dev |
| T35-5 | Backend: `POST /api/material-issues` — create draft, validates all items (NO FALLBACK on all fields) | `server/routes/products-routes.ts` line 2738 | ✅ dev |
| T35-6 | Backend: `POST /api/material-issues/:id/confirm` — deducts lot qty + adjustStock + lot_id on movement | `server/routes/products-routes.ts` line 2773 | ✅ dev |
| T35-7 | Backend: `DELETE /api/material-issues/:id` — draft only, cascade delete items | `server/routes/products-routes.ts` line 2817 | ✅ dev |
| T35-8 | Sidebar nav: "ใบเบิกวัตถุดิบ" + "QR บัตรพนักงาน" links under "ควบคุมสินค้า" group | `client/src/lib/mock-data.ts` | ✅ dev |
| T35-9 | Frontend: `MaterialIssueList` — list with status badge, delete (draft only), link to form | `client/src/pages/inventory/material-issue-list.tsx` | ✅ dev |
| T35-10 | Frontend: `MaterialIssueForm` — create new (QR scan employee + product, lot dropdown, qty) + view/confirm existing | `client/src/pages/inventory/material-issue-form.tsx` | ✅ dev |
| T35-11 | Frontend: `EmployeeQRPage` — show all employee QR cards, print all, search | `client/src/pages/inventory/employee-qr.tsx` | ✅ dev |
| T35-12 | app-extra.tsx: 4 new routes registered (matchMaterialIssueList, matchMaterialIssueForm, matchMaterialIssueFormEdit, matchEmployeeQR) | `client/src/app-extra.tsx` lines 127-377 | ✅ dev |
| T35-13 | NO FALLBACK fix: `getNextMaterialIssueNo()` — explicit throw if COUNT returns no rows or cnt is null | `server/routes/products-routes.ts` line 2683 | ✅ dev |
| T35-14 | NO FALLBACK fix: POST handler — explicit `moIdSql`, `issuedByUserIdSql`, `notesSql`, `lotIdSql`, `lotNumberSql` — no `\|\|` chains | `server/routes/products-routes.ts` line 2745 | ✅ dev |
| T35-15 | schema-history.md ENTRY #009 — material_issues tables added | `db/schema-history.md` | ✅ |
| T35-16 | CODE REVIEW FIX — Move `runMaterialIssueMigration` from `server/schema-extra.ts` → `shared/schema-extra.ts`; stub comment left in server file; import `@shared/schema-extra` now resolves correctly | `shared/schema-extra.ts` lines 994-1029; `server/schema-extra.ts` line 66 | ✅ |
| T35-17 | CODE REVIEW FIX — MATERIAL_LOT QR flow: `handleProductQrKeyDown` now tries JSON.parse first; if JSON → calls `/api/scan/decode` to validate; routes MATERIAL_LOT to direct item add (productId, productName, lotId, lotNumber, unit extracted from payload); routes EMPLOYEE to explicit error; plain string falls through to product-code search | `client/src/pages/inventory/material-issue-form.tsx` lines 292-348 | ✅ |
| T35-18 | CODE REVIEW FIX — Backend confirm: enforce lot_id required for lot-tracked products; queries `SELECT track_lots FROM products WHERE id=productId`; throws explicit error if trackLots=true and lot_id missing | `server/routes/products-routes.ts` lines 2790-2798 | ✅ |
| T35-19 | CODE REVIEW FIX — MO dropdown filters to `status=in_progress` only: query adds `&status=in_progress`, client also `.filter(m => m.status === "in_progress")` as double guard | `client/src/pages/inventory/material-issue-form.tsx` lines 152-163 | ✅ |
| T35-20 | CODE REVIEW FIX — SQL injection guard: `item.productId` coerced to `Number(itemProductId)` before sql.raw; `issue.id` also wrapped `Number(issue.id)`; confirm route productId/lotId all coerced | `server/routes/products-routes.ts` lines 2760-2762, 2799, 2811 | ✅ |

**⚠️ Before production push:**
- This commit contains NEW TABLES (schema change) — alert พี่ช้าง: `material_issues` + `material_issue_items` will be auto-created by `runMaterialIssueMigration()` on first server start
- ENTRY #009 in schema-history.md tracks this migration

---

### SESSION 2026-05-16 AFTERNOON — WHAT WAS DONE THIS SESSION

| # | Change | File | Status |
|---|--------|------|--------|
| S1 | Added "ใบรับสินค้า (GR)" link to inventory sidebar under "ควบคุมสินค้า" group | `client/src/lib/mock-data.ts` line 169 | ✅ dev |
| S2 | Fixed QR Code not printing — canvas → img conversion before print window opens | `client/src/pages/inventory/barcode-labels.tsx` handlePrint() | ✅ dev |
| S3 | GR barcode scan: detect Thai keyboard → block + red border + BIG red warning banner | `client/src/pages/inventory/goods-receiving-form.tsx` | ✅ dev |
| S4 | GR barcode scan: fix lot tracking — `handleBarcodeScan` now sets `trackLots`, `lotNumber`, `manufacturingDate`, `expiryDate` on new item | `client/src/pages/inventory/goods-receiving-form.tsx` | ✅ dev |
| S5 | QR encode logic fixed — Thai code+barcode→encode barcode; Thai code+no barcode→error label; no code→error label; English code→encode code. No `||` chains. | `client/src/pages/inventory/barcode-labels.tsx` | ✅ dev |
| S6 | GR POST 400 fix — added `goodsReceivings, goodsReceivingItems, purchaseOrders, purchaseOrderItems` to import in `products-routes.ts` line 8. Previously `goodsReceivings is not defined` error. | `server/routes/products-routes.ts` | ✅ dev |
| S7 | GR POST debug — added `console.log(req.body)` + `console.error` on catch + explicit per-item productId/quantity validation with human-readable Thai error messages to POST handler (TEMPORARY — remove before production push) | `server/routes/products-routes.ts` ~line 1835 | 🔄 DEBUG — REMOVE BEFORE PUSH |
| S8 | GR form handleSubmit — added frontend guards: (1) `!companyId` → toast "ไม่พบข้อมูลบริษัท" + return; (2) `!it.productId` for any valid item → toast "สินค้า ... ไม่มี productId" + return | `client/src/pages/inventory/goods-receiving-form.tsx` handleSubmit ~line 362 | ✅ dev |

**Key user guidance given this session (for context):**
- ใบรับสินค้า GR อยู่ที่ `/inventory/receiving` — sidebar link เพิ่งเพิ่ม (S1)
- ล็อตในใบรับสินค้า: ช่องล็อตจะโผล่เฉพาะสินค้าที่เปิด **trackLots** ไว้เท่านั้น (ดูที่ product form → แท็บ "คลังสินค้า/ผลิต")
- ปุ่ม QR Traceability อยู่ที่ MO form เมื่อ status=completed
- หน้าตรวจสอบย้อนกลับ (Traceability) อยู่ที่เมนูระบบผลิต → ตรวจสอบย้อนกลับ

---

### 🔑 GR BARCODE SCANNER — KEYBOARD LAYOUT PROBLEM (confirmed 2026-05-16)

**Root cause understood — do NOT relitigate this:**
USB HID barcode scanners send raw keystrokes to the OS. If Windows keyboard layout = Thai (TH), every ASCII character the scanner sends gets translated by Windows into a Thai character before reaching the browser. Example: "Cell 18650" → "จำสาตูดจ". This is a Windows-level translation — the browser never sees the original ASCII.

**What พี่ช้าง decided (do NOT change without asking him again):**
- Browser CANNOT force-change OS keyboard layout — that is OS-level, impossible from JS
- Solution: detect Thai chars in the barcode input → block scan + show BIG red warning
- Warning tells user: "Keyboard ภาษาไทย — สแกนไม่ได้! กรุณาเปลี่ยน Keyboard เป็น EN (ดูที่ Taskbar มุมขวาล่าง)"
- On mobile: hide "พร้อมสแกน" hint text (`hidden sm:block`) — mobile doesn't have this keyboard problem

**How it works now (goods-receiving-form.tsx):**
```
isThai(str) → /[ก-๙]/.test(str)

onChange barcode input:
  if isThai(val) → setKeyboardWarning(true)   ← red border immediately while typing
  else → setKeyboardWarning(false)

handleBarcodeScan (on Enter):
  if isThai(code) → setKeyboardWarning(true) + clear + return   ← BLOCK, no product search
  else → setKeyboardWarning(false) → proceed normally

UI: keyboardWarning=true → red border on input + red banner below input
```

**If พี่ช้าง or พี่ทราย asks to "fix this better" in future:**
The ONLY real fix is telling users to switch keyboard to EN before scanning. A reverse-mapping approach (Thai chars → back-translate to ASCII) was considered but rejected — too fragile and depends on knowing which Thai keyboard layout the user is using (Kedmanee vs Pattachote).

---

### 🔑 PRODUCT.CODE THAI — 104 PRODUCTS (decision locked 2026-05-16)

**Background:** 104 products in dev DB have Thai characters in `products.code` field (e.g. "นาโนชิป", "พลังแสง", "มหานครรุ่งเรือง"). These existed before the "no Thai in code" rule was introduced.

**พี่ทราย's decision (do NOT change without asking her again):**
- Do NOT rename those 104 existing Thai codes
- Instead: QR encode the **barcode** field (numeric EAN-13) for Thai-code products
- Logic: Thai code → encode barcode (if exists); no barcode → show error; English code → encode code

**QR encode logic (barcode-labels.tsx ~line 531) — FIXED 2026-05-16:**
Every case handled explicitly — NO FALLBACK:
```
code = Thai + barcode exists  → QR encode barcode (numeric EAN-13, safe for any keyboard layout)
code = Thai + no barcode      → ❌ error label: "รหัสสินค้าภาษาไทย ไม่มีบาร์โค้ด ไม่สามารถสร้าง QR ได้"
code = null/undefined         → ❌ error label: "ไม่มีรหัสสินค้า ไม่สามารถสร้าง QR ได้"
code = English/ASCII          → QR encode code directly
```
No `||` chains. Each branch returns explicitly. No wildcard can pass through silently.

**New product validation (already in place):**
- `product-form.tsx`: blocks Thai input in code field (new products only)
- `product-import-execute` + preview: rejects Thai in code column
- DB: unique index `products_company_id_code_unique ON products(company_id, code)` — see ENTRY #008

---

### 🔑 ENTRY #008 — UNIQUE INDEX (MUST RUN ON PRODUCTION BEFORE NEXT DEPLOY)

**Status:** Created on DEV. NOT yet on production.
**SQL to run on production:**
```sql
CREATE UNIQUE INDEX IF NOT EXISTS products_company_id_code_unique
ON products(company_id, code);
```
**Who authorizes:** พี่ช้าง only. Run via psql on production DB before the next deploy that touches product code.
**Reference:** `db/schema-history.md` ENTRY #008

---

### 🔑 GR FORM — LOT TRACKING TECHNICAL DETAILS (confirmed 2026-05-16)

**Schema:** `goods_receiving_items` already has `lot_number`, `manufacturing_date`, `expiry_date`, `lot_id` columns — NO migration needed.

**GRItemForm interface (goods-receiving-form.tsx):** already has `lotNumber`, `manufacturingDate`, `expiryDate`, `trackLots` fields.

**How lot row appears in UI:**
```
{item.trackLots && <TableRow className="bg-amber-50/30">...lot fields...</TableRow>}
```
The amber sub-row (lot number + วันผลิต + วันหมดอายุ) only shows when `item.trackLots = true`.

**Two ways to add item to GR — both must set trackLots:**
1. Dropdown select → `handleProductSelect` → sets `trackLots: (p as any).trackLots` ✅ was working
2. Barcode scan → `handleBarcodeScan` → was NOT setting trackLots ❌ FIXED 2026-05-16

**Fix applied:** Both `handleBarcodeScan` and `handleProductSelect` now:
```typescript
const rawTrackLots = (matched as any).trackLots;
if (rawTrackLots !== true && rawTrackLots !== false) {
  toast({ title: `ข้อมูลสินค้า "${matched.name}" ไม่สมบูรณ์ (trackLots ไม่ถูกต้อง) — กรุณา refresh หน้า`, variant: "destructive" });
  // clean up and return — do NOT proceed
  return;
}
// Now rawTrackLots is guaranteed boolean — no wildcard possible
trackLots: rawTrackLots,
```

**⚠️ NO FALLBACK RULE — what it actually means (พี่ช้าง's exact teaching):**
NO FALLBACK does NOT just mean "don't write `|| false`".
It means: **every possible case must be explicitly handled. If something falls outside your if-clause, it MUST be treated as an ERROR — not silently accepted.**

Bad (wildcard still possible):
```typescript
trackLots: (matched as any).trackLots || false   // undefined → silently becomes false
trackLots: (matched as any).trackLots            // undefined → silently passes through
```

Correct:
```typescript
const rawTrackLots = (matched as any).trackLots;
if (rawTrackLots !== true && rawTrackLots !== false) {
  // unexpected value → treat as ERROR, surface to user, stop execution
  toast({ ..., variant: "destructive" });
  return;
}
// only reach here when rawTrackLots is guaranteed boolean
```

The same rule applies everywhere: switch statements must have `default: throw new Error(...)`, if-chains must handle every path explicitly, and any unexpected value must fail loudly — never silently continue.

**If พี่ทราย reports lot fields still not showing after scan:** Check that the product itself has `trackLots = true` in the DB. Go to: คลังสินค้า → สินค้า → แก้ไขสินค้า → แท็บ "คลังสินค้า/ผลิต" → สวิตช์ "ติดตามล็อตการผลิต / วันหมดอายุ" ต้องเปิดอยู่

---

### LOT TRACKING WORKFLOW (full picture — ให้ Kai ถัดไปรู้)

```
1. เปิด trackLots บนสินค้า:
   คลังสินค้า → สรุปรายการสินค้า → สินค้า → แท็บ "คลังสินค้า/ผลิต" → เปิดสวิตช์ "ติดตามล็อต"

2. สร้างใบรับสินค้า (GR):
   คลังสินค้า → ใบรับสินค้า (GR) → สร้าง → เลือกสินค้า → กรอกเลขล็อตในแถวสีเหลือง → อนุมัติ
   → ระบบสร้าง product_lots record อัตโนมัติ

3. สร้างใบสั่งผลิต (MO):
   คลังสินค้า → ใบสั่งผลิต → สร้าง → ผลิตเสร็จ
   → ระบบตัด lot วัตถุดิบ (FEFO) → สร้าง lot สินค้าสำเร็จรูป

4. QR Traceability:
   MO form (status=completed) → กดปุ่ม "QR Traceability"
   หรือ เมนูผลิต → ตรวจสอบย้อนกลับ → พิมพ์เลขล็อต
   → เห็น: raw material lots + ซัพพลายเออร์ + QR พร้อมปริ้นท์
```

---

### ⚠️ MANUAL DB ACTION — DEV ONLY (2026-05-16)

Kai inserted demo data directly into dev DB via executeSql — **NOT allowed on production.**
Rule: all data on production must come through UI only. Direct DB inserts are forbidden on production.

**What was inserted (dev DB only):**
- `mes_work_orders`: WO-2026-0516-001 — 48V 75Ah NMC, 20 units, company_id=3721 (มหานคร) — id=1
- `mes_units`: 20 units (id 1–20), master QR BAT-MHN-2026-001 to BAT-MHN-2026-020
- `mes_process_logs`: 55 rows — process history for units 1–18
- `mes_cell_assignments`: 234 rows — 13 cells per unit for units 1–18 (serials NMC37-XXX-SXX)
- `mes_balance_records`: 7 rows — before/after balance values for units 1–7

**Purpose:** customer demo only — show the MES dashboard with realistic data across all process stages.
**To undo:** DELETE FROM mes_balance_records; DELETE FROM mes_cell_assignments; DELETE FROM mes_process_logs; DELETE FROM mes_units; DELETE FROM mes_work_orders WHERE company_id=3721;

---

### BLOCKED

| # | Blocker | Who must act |
|---|---------|-------------|
| B1 | github-dev push blocked — Secret Scanning found leaked PAT in a committed file | พี่ช้าง allow at: https://github.com/saaikanyakorn-afk/dev.etaxerp/security/secret-scanning/unblock-secret/3DcYyNVdNrlS0UaUfER3yJCRuAZ |
| B2 | VAT rate feature requires `schema.ts` change | พี่ช้าง must modify first |

---

### PARKED — waiting for decision

| ID | Item | Waiting for |
|----|------|-------------|
| P1 | Business type → journal account mismatch | พี่ช้าง decision on approach |
| P2 | SysAdmin console isolation | พี่ช้าง authorize — estimate 3-4h |
| P3 | app-extra.tsx + not-found.tsx + infra-machines.tsx | พี่ช้าง authorize |
| P4 | ENTRY #006: orphan stock_movements cleanup | พี่ช้าง authorize |
| P5 | Migrate 92 `products.active` query sites to split tables | พี่ช้าง authorize — future sprint |
| P6 | QR Scanner Step 2 — พี่ทราย แก้ product.code 104 รายการเป็น English แล้ว print QR ใหม่ | พี่ทราย action |

---

### 📦 bwip-js LIBRARY NOTES (2026-05-16 — พี่ช้าง instruction)

**What it is:** Barcode Writer in Pure JavaScript — renders barcode numbers into actual barcode images (PNG/SVG). Supports 100+ standards including EAN-13, CODE128, QR, etc.

**Current state:** NOT installed. System currently uses `jsbarcode` (CODE128, frontend-only) + `qrcode` (QR codes).

**If we install it:**
- `npm install bwip-js` — pure JS, zero native dependencies
- ✅ Works on **Linux** (aaPanel, linux-prod-01) — no extra OS packages needed
- ✅ Works on **Windows** (etaxerp.com server) — pure JS, no native binaries, same `npm install`
- No recompile needed on either OS — unlike sharp/canvas which need native bindings
- Server restart required after `npm install` (pm2 restart etax-center)
- **Both servers need the install** — Windows (etaxerp.com) AND any future Linux prod server

**Deployment checklist addition (if P6 is approved):**
- [ ] `npm install bwip-js` on etaxerp.com (Windows) before pm2 restart
- [ ] Verify `node_modules/bwip-js` present on server after install
- [ ] Include in any future Linux prod deploy runbook

---

### PUSH-PULL LOG (deploy history — append here, do not use separate file)

| Deploy # | Date | Files | Notes |
|----------|------|-------|-------|
| #66 | 2026-05-15 | products-routes.ts, product-import-export.tsx, import-batch-routes.ts, commerce-intelligence.ts, price-calculator.ts, ad-cost-routes.ts, pos-routes.ts, ecommerce-routes.ts, notifications-routes.ts, storage.ts, bundle-management.tsx, inventory-list.tsx, queryClient.ts | innerJoin migration + various fixes. pm2 online 84.4mb ✅ |
| #1–#42 | 2026-04-28 – 2026-05-07 | see `.local/push-pull-log.md` | Full log maintained separately up to #42 |
| #43–#65 | 2026-05-07 – 2026-05-15 | NOT RECORDED | Previous Kai sessions stopped logging — gap in history |

---

## ═══════════════════════════════════
## HISTORY — COMPLETED ITEMS
## ═══════════════════════════════════

| Date | What | Result |
|------|------|--------|
| 2026-05-16 | GR POST 201 confirmed — body shows companyId:3721, items×3, lot tracking ✅ — POST /api/goods-receivings ทำงานแล้ว | ✅ dev |
| 2026-05-16 | goods-receiving-list.tsx crash fix — `dateFormat` → `dateFmt` (typo — useDateSettings returns dateFmt, not dateFormat) | ✅ dev |
| 2026-05-16 | GR imports fix — goodsReceivings, goodsReceivingItems, purchaseOrders, purchaseOrderItems ใน products-routes.ts (S6) | ✅ dev |
| 2026-05-16 | GR frontend guards — companyId undefined → toast; productId missing → toast (S8) | ✅ dev |
| 2026-05-16 | Added ใบรับสินค้า (GR) to inventory sidebar nav | ✅ dev |
| 2026-05-16 | Fixed QR Code not showing when printing barcode labels (canvas→img) | ✅ dev |
| 2026-05-16 | BOM routing fixed — stays in ManufacturingLayout, basePath+Wrapper props | ✅ dev |
| 2026-05-16 | Lot Traceability QR system built — traceability.tsx, lot-trace API, QR button on MO | ✅ dev |
| 2026-05-16 | GR barcode scan: Thai keyboard detection — block + red border + red warning banner (decision: browser cannot force OS layout) | ✅ dev |
| 2026-05-16 | GR barcode scan: fix lot tracking — handleBarcodeScan now sets trackLots/lotNumber/manufacturingDate/expiryDate (was missing, dropdown was fine) | ✅ dev |
| 2026-05-16 | QR encode: Thai code+barcode→encode barcode; Thai code+no barcode→error; no code→error; English→encode code. All cases explicit, no `\|\|` chains | ✅ dev |
| 2026-05-16 | พี่ทราย verified: ค่าใช้จ่าย/เงินสดย่อย, ปุ่มดึงอัตราแลกเปลี่ยน, AP Billing ใช้งานได้ปกติ — baseline confirmed | ✅ |
| 2026-05-15 | Deploy #75 — related-docs dialog แสดง QO↔SO↔TIV ครบ chain | ✅ |
| 2026-05-15 | Deploy #74 — revert related-docs navigate กลับ listPath เสมอ | ✅ |
| 2026-05-15 | Deploy #73 — TIV paymentMethod cash/credit toggle fix | ✅ |
| 2026-05-15 | Deploy #66 — innerJoin migration (92→0 products.active queries in 8 files) + 6 other fixes | ✅ production online 84.4mb |
| 2026-05-13 | ENTRY #005 loop closed — ADD_DEFAULT_VAT_RATE flag confirmed on production | ✅ |
| 2026-05-13 | AP billing bugs fixed (dev only) — related-docs, ดูบัญชี, delete RC/PV | dev ✅ not pushed |
| 2026-05-11 | Product split migration (ENTRY #007) — DROP+RECREATE+BACKFILL active/inactive_products | ✅ both restarts done |
| 2026-05-07 | ENTRY #004 — etax credit note columns deployed | ✅ |
| 2026-05-07 | ENTRY #002 — DROP bot_api_key from general_settings | ✅ |
| 2026-05-07 | ENTRY #001 — expense currency columns deployed | ✅ |
| 2026-04-30 | Warehouse column migration (ENTRY v85) | ✅ |

