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

### N4 — Payment fixes + Settings payment methods
**Status:** ⏳ awaiting พี่ช้าง approval — พี่ทรายtested ✅
**Schema change:** NO
**Push type:** Code-only push

| File | Role | Status |
|------|------|--------|
| (file list to be finalized before push — must re-grep to confirm exact set per Rule 2 Step 5) | | ⏳ awaiting |

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
**Status:** 📝 dev — รอพี่ทราย test บน dev ก่อน แล้วรอพี่ช้าง approve push
**Schema change:** NO (no new columns) — but requires **production DB data migration** (INSERT rows)
**Push type:** Code push (3 files) + **production DB INSERT — must be first step at deploy time**

**สิ่งที่เปลี่ยน:**
1. `email-config.tsx` — preset etaxcenter.com (Webmail) เป็นตัวแรก, ลบ Resend/Mailjet
2. `expense-routes.ts` — ใช้ SMTP only, reads `PLATFORM_EMAIL_SMTP_*` (not SYSADMIN_SMTP_*)
3. `doc-settings-routes.ts` — GET/PUT/test all use `PLATFORM_EMAIL_SMTP_*` (not SYSADMIN_SMTP_*)

**⚠️ KEY DESIGN CHANGE (2026-05-20):**
- `SYSADMIN_SMTP_*` keys in `system_config` = **reserved for sysAdmin 2FA** (login at `/sys-k7x9`) — NEVER touch
- `PLATFORM_EMAIL_SMTP_*` keys = **new keys** for platform document emails (WHT cert, etc.)
- These keys do NOT exist in production DB yet → must INSERT at deploy time (step below)

**⚠️ PRODUCTION DB DATA MIGRATION — DO THIS FIRST AT DEPLOY:**
Before starting the code push, INSERT these rows into production `system_config`:
```sql
INSERT INTO system_config (config_key, config_value) VALUES
  ('PLATFORM_EMAIL_SMTP_HOST', 'mail.etaxcenter.com'),
  ('PLATFORM_EMAIL_SMTP_PORT', '587'),
  ('PLATFORM_EMAIL_SMTP_USER', '<email ที่พี่ทรายใช้ — ถามก่อน INSERT>'),
  ('PLATFORM_EMAIL_SMTP_PASS', '<password webmail — ถามพี่ทรายก่อน INSERT>'),
  ('PLATFORM_EMAIL_SMTP_FROM', '<from display — ถามพี่ทราย>'),
  ('PLATFORM_EMAIL_SMTP_SECURE', 'false')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;
```
⚠️ **Do NOT hardcode credentials here** — ask พี่ทราย for actual email + password at deploy time.
⚠️ **Do NOT touch SYSADMIN_SMTP_*** — those are Brevo 2FA credentials. Changing = sysAdmin lockout.
⚠️ **Verify on production after INSERT:** `SELECT config_key FROM system_config WHERE config_key LIKE 'PLATFORM_EMAIL_SMTP_%';` — should return 6 rows.

**วิธีทดสอบบน dev ก่อน push:** พี่ทรายไปที่ Platform → ตั้งค่า Email → เลือก etaxcenter.com → กรอก email + password webmail → บันทึก → ส่งทดสอบ (การ Save จะ INSERT PLATFORM_EMAIL_SMTP_* ลง dev DB อัตโนมัติ)

| File | Role | Status |
|------|------|--------|
| `client/src/pages/platform/email-config.tsx` | UI preset etaxcenter.com webmail เป็นตัวแรก | 📝 dev |
| `server/routes/expense-routes.ts` | WHT cert email — SMTP only, PLATFORM_EMAIL_SMTP_* | 📝 dev |
| `server/routes/doc-settings-routes.ts` | GET/PUT/test — PLATFORM_EMAIL_SMTP_* only | 📝 dev |

---

### N7 — RD VAT service + multi-branch dialog
**Status:** ⏳ awaiting พี่ช้าง approval — พี่ทรายtested ✅
**Schema change:** NO
**Push type:** Code-only push

| File | Role | Status |
|------|------|--------|
| `client/src/hooks/use-dbd-lookup.ts` | DBD lookup hook | ⏳ awaiting |
| (other files — to be finalized via grep before push per Rule 2 Step 5) | | ⏳ awaiting |

---

## DEPLOYED — HISTORY

| Deploy # | Date | Entry | Files |
|----------|------|-------|-------|
| #66 | 2026-05-15 | innerJoin migration + 6 other fixes | products-routes.ts, product-import-export.tsx, import-batch-routes.ts, commerce-intelligence.ts, price-calculator.ts, ad-cost-routes.ts, pos-routes.ts, ecommerce-routes.ts, notifications-routes.ts, storage.ts, bundle-management.tsx, inventory-list.tsx, queryClient.ts |
| #73 | 2026-05-15 | TIV paymentMethod cash/credit toggle fix | (files not recorded — historical gap) |
| #74 | 2026-05-15 | Revert related-docs navigate กลับ listPath เสมอ | (files not recorded — historical gap) |
| #75 | 2026-05-15 | related-docs dialog แสดง QO↔SO↔TIV ครบ chain | (files not recorded — historical gap) |
| #43–#65 | 2026-05-07 – 2026-05-15 | NOT RECORDED — historical gap, previous Kai sessions stopped logging | — |
| #1–#42 | 2026-04-28 – 2026-05-07 | See `.local/push-pull-log.md` (legacy file — frozen, do not update) | — |

---

**Last verified:** 2026-05-20 — Kai session (queue file created, seeded with N3/N4/N6/N7). All entries awaiting พี่ช้าง push approval.
