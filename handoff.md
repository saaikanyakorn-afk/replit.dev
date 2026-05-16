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

**Last verified:** 2026-05-16 (this session — Kai)
**Production status:** Deploy #66 ✅ complete — online 84.4mb
**Pending work:** None confirmed — see NEEDS VERIFICATION below

---

### BLOCKED

| # | Blocker | Who must act |
|---|---------|-------------|
| B1 | github-dev push blocked — Secret Scanning found leaked PAT in a committed file | พี่ช้าง allow at: https://github.com/saaikanyakorn-afk/dev.etaxerp/security/secret-scanning/unblock-secret/3DcYyNVdNrlS0UaUfER3yJCRuAZ |
| B2 | VAT rate feature requires `schema.ts` change | พี่ช้าง must modify first |

---

### NEEDS VERIFICATION (handoff-active.md 2026-05-13 vs handoff.md 2026-05-15 conflict)

handoff-active.md listed these as pending push — but Deploy #66 (2026-05-15) may have included some of them.
**Kai must verify actual production state before treating any of these as pending.**

| ID | Item | Files | Claimed status in old handoff |
|----|------|-------|-------------------------------|
| V1 | ค่าใช้จ่าย/เงินสดย่อย 400 error | expense-routes.ts | Pushed to github-production, waiting server |
| V2 | ปุ่มเลิกใช้งาน/เปิดใช้งานสินค้า | inventory-list.tsx | Pushed — BUT also in Deploy #66 ✅ → likely done |
| V3 | ปุ่มดึงอัตราแลกเปลี่ยน | expense.tsx | Pushed to github-production, waiting server |
| V4 | AP billing fixes (C1-C5) | ap-billing.tsx, related-docs-dialog.tsx, sales-docs-routes.ts, payments.tsx, billing-notes-routes.ts | Dev only, not pushed |
| V5 | D1-D7 items (2026-05-12) | various | Push status unknown |

---

### PARKED — waiting for decision

| ID | Item | Waiting for |
|----|------|-------------|
| P1 | Business type → journal account mismatch | พี่ช้าง decision on approach |
| P2 | SysAdmin console isolation | พี่ช้าง authorize — estimate 3-4h |
| P3 | app-extra.tsx + not-found.tsx + infra-machines.tsx | พี่ช้าง authorize |
| P4 | ENTRY #006: orphan stock_movements cleanup | พี่ช้าง authorize |
| P5 | Migrate 92 `products.active` query sites to split tables | พี่ช้าง authorize — future sprint |
| P6 | E1: พี่ทราย verify active/inactive product split on production | พี่ทราย verify |

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
| 2026-05-15 | Deploy #66 — innerJoin migration (92→0 products.active queries in 8 files) + 6 other fixes | ✅ production online 84.4mb |
| 2026-05-13 | ENTRY #005 loop closed — ADD_DEFAULT_VAT_RATE flag confirmed on production | ✅ |
| 2026-05-13 | AP billing bugs fixed (dev only) — related-docs, ดูบัญชี, delete RC/PV | dev ✅ not pushed |
| 2026-05-11 | Product split migration (ENTRY #007) — DROP+RECREATE+BACKFILL active/inactive_products | ✅ both restarts done |
| 2026-05-07 | ENTRY #004 — etax credit note columns deployed | ✅ |
| 2026-05-07 | ENTRY #002 — DROP bot_api_key from general_settings | ✅ |
| 2026-05-07 | ENTRY #001 — expense currency columns deployed | ✅ |
| 2026-04-30 | Warehouse column migration (ENTRY v85) | ✅ |
