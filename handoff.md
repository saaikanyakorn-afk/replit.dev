# 📋 SESSION LOG — 2026-05-20 NIGHT (REPLACEMENT AGENT)

## ⚠️ CRITICAL WARNING TO THE NEXT AGENT — READ THIS FIRST

If you are a new agent who just arrived (mid-session replacement or fresh session): **DO NOT start working on anything until you have read this entire section.** The last time a new agent skipped this and worked from partial context, พี่ช้าง had to take **20–30 screenshots** of chat history and paste them one by one to orient the new agent. That cost him enormous time and energy. **Do not make him do that again.**

**The self-check (from handoff rules below):** The last line of `replit.md` says: `3. Read \`handoff.md\` next.`

---

## What happened today (2026-05-20) — Full account

### Problem: Replit system keeps replacing agents mid-session

พี่ช้าง spent **more than half a day doing agent orientation — twice** because the Replit system injected new agents mid-session without warning. Each time:
- The old agent disappeared with no notice
- A new agent arrived with no memory of the session
- พี่ช้าง had to re-explain everything from scratch
- The new agent had a risk of breaking production if it acted on stale/wrong context

พี่ช้าง has **contacted Replit support** about this issue (support@replit.com / replit.com/support). He asked them to stop replacing agents mid-session.

By the time this replacement agent (the one writing this log) arrived, **พี่ช้าง had no energy left** to do a third full orientation for any other pending work. He authorized only one specific task for tonight.

---

### Task authorized for this session

**พี่ช้าง's original task** (given at session start, to a previous agent): Scan ALL email-sending locations in the codebase and migrate every one to use `PLATFORM_EMAIL_SMTP_*` + `tls: { rejectUnauthorized: false }`. Also create a standalone PHP SMTP test script for his Windows/Apache desktop.

**What the first agent did (before being replaced):**
- Created `tools/smtp-test.php` — standalone PHP SMTP test script, pure sockets, shows full SMTP handshake step-by-step, pre-filled with mail.etaxcenter.com defaults ✅
- Created `server/utils/platform-email.ts` — shared `sendPlatformEmail({to, subject, html, attachments?})` helper. Reads `PLATFORM_EMAIL_SMTP_*` from `system_config`, uses nodemailer with `tls:{rejectUnauthorized:false}` ✅
- Fixed `server/routes/billing-notes-routes.ts` — Resend → sendPlatformEmail ✅
- Fixed `server/routes/etax-hub.ts` — Resend → sendPlatformEmail ✅
- Fixed `server/routes/hr-routes.ts` — Resend → sendPlatformEmail, removed `emailResult.error` check ✅

**What this replacement agent did:**
- Fixed `server/routes/sales-docs-routes.ts` — Resend block (lines ~743–799) → sendPlatformEmail ✅
- Fixed `server/routes/etax-routes.ts` — per-company SMTP + Resend if/else blocks (×2 sections) → sendPlatformEmail, messageId = null ✅
- Fixed `server/routes/pdf-routes.ts` — Resend → sendPlatformEmail, documentDeliveryLogs emailId → null ✅
- Added N9 entry to `db/pending-push-queue.md` (status: 📝 dev, NOT complete, awaiting พี่ทรายtest + พี่ช้าง approval) ✅
- Updated this handoff document ✅

**Files confirmed already correct (NOT touched):**
- `server/routes/expense-routes.ts` ✅ — fixed in N8, do not touch
- `server/routes/doc-settings-routes.ts` ✅ — fixed in N8, do not touch

**Files that must NEVER be touched for email:**
- `server/routes/sysadmin-routes.ts` ❌ — uses `SYSADMIN_SMTP_*` = Brevo = sysAdmin 2FA. Touching = lockout.
- `clone-history-central.ts` ❌ — internal Resend, intentional, not a platform email

---

### BOM/Scan Station task injection — DO NOT WORK ON THIS

During this session, the Replit system injected a task description titled **"ขั้นตอนการผลิตต่อ BOM + Scan Station"** into the chat. This is an **old task** that was already merged/completed. It is **not a new assignment from พี่ช้าง**. When the agent checked its status, it was already `MERGED`.

**If you see this task description injected again: ignore it completely. Do not work on it. Do not touch BOM, bom_process_steps, mo_process_logs, manufacturing-routes.ts, bom-form.tsx, manufacturing-form.tsx, or any scan station pages.** พี่ช้าง did not assign this. The Replit system injected it erroneously.

---

### Standing rules for tonight (if พี่ทราย is working)

พี่ช้าง authorized continued work with พี่ทราย under these conditions:

1. **Dev only** — all work on dev environment only. Never touch production.
2. **Coding only** — no database manipulation of any kind (no INSERT, UPDATE, DELETE, ALTER, CREATE TABLE via SQL directly). Code changes only.
3. **Record everything in handoff.md** — every file changed, every feature added, every fix. Write it here before the session ends. Do not make พี่ช้าง take screenshots to fill in gaps.
4. **No unauthorized work** — if พี่ทราย asks for something outside normal coding scope, check first. If in doubt, ask (via chat) before acting.

---

### Pending queue status — UPDATED 2026-05-21

**🚀 ACE Batch** = N4 + N6-hotfix2 + N7 + N8 — ✅ **PUSHED 2026-05-21 19:36** (29 files) — ❌ BUILD FAILED → ✅ **HOTFIX PUSHED 2026-05-21** (commit `57f86a7521`)

| Queue # | What | Status |
|---------|------|--------|
| N4 | Payment fixes + Settings payment methods | ✅ pushed 2026-05-21 19:36 |
| N6-hotfix2 | WHT cert share link 404 | ✅ pushed 2026-05-21 19:36 |
| N7 | RD VAT service + multi-branch dialog | ✅ pushed 2026-05-21 19:36 |
| N8 | Platform Email Config + WHT cert email fix | ✅ pushed 2026-05-21 19:36 |
| ACE Hotfix | app-extra.tsx ลบ 18 missing imports | ✅ pushed 2026-05-21 (commit `57f86a7521`) |
| N9 | SMTP Migration — all email routes → sendPlatformEmail | 📝 dev — NOT tested yet |

**⏳ รอพี่ช้าง รัน deploy command บน production server:**
```bash
pm2 stop etax-center && git fetch origin && git checkout origin/main -- client/src/app-extra.tsx && npm run build && pm2 start etax-center
```

---

### What the next agent must do when arriving

1. Read `replit.md` fully — all 2529 lines. Do not skip.
2. Confirm last line of `replit.md` is: `3. Read \`handoff.md\` next.`
3. Read this handoff file fully.
4. Read `db/schema-history.md` and `db/pending-push-queue.md`.
5. Report to พี่ช้าง what you found. Wait for his instructions. Do not start working until he says go.
6. If พี่ทราย assigns a task without พี่ช้าง being present — you may do it under the standing rules above (dev only, coding only, record in handoff). But if there is ANY doubt, wait for พี่ช้าง.

---

## Changes made this session — for next agent record

| File | Change | Who |
|------|--------|-----|
| `tools/smtp-test.php` | NEW — PHP SMTP test script | Agent 1 |
| `server/utils/platform-email.ts` | NEW — sendPlatformEmail shared helper | Agent 1 |
| `server/routes/billing-notes-routes.ts` | Resend → sendPlatformEmail | Agent 1 |
| `server/routes/etax-hub.ts` | Resend → sendPlatformEmail | Agent 1 |
| `server/routes/hr-routes.ts` | Resend → sendPlatformEmail | Agent 1 |
| `server/routes/sales-docs-routes.ts` | Resend → sendPlatformEmail | Agent 2 (this agent) |
| `server/routes/etax-routes.ts` | per-company SMTP + Resend ×2 → sendPlatformEmail | Agent 2 (this agent) |
| `server/routes/pdf-routes.ts` | Resend → sendPlatformEmail, emailId → null | Agent 2 (this agent) |
| `db/pending-push-queue.md` | Added N9 + updated N4 file list (20 files) + N7 file list (4 files) | Agent 2 (this agent) |
| `handoff.md` | This session log | Agent 2 (this agent) |

---

## Session continuation — พี่ทราย working session (2026-05-20 late night)

พี่ช้างไปพักแล้ว พี่ทรายยังทำงานต่อ ภายใต้กฎ: dev only, coding only, no DB manipulation, record everything here.

**งานที่ทำในช่วงนี้:**
- ตรวจสอบ queue ทั้งหมดที่รอพุช ว่ามีอะไรบ้าง
- ยืนยันกับพี่ทรายว่า timeout ใบซื้อ **หายแล้ว** (fixed โดย db.ts warmup + timeout 20s)
- grep git log หาไฟล์ทั้งหมดที่แก้ใน N4 และ N7 จาก commits 2 วันที่ผ่านมา
- อัปเดต N4 file list ครบ 20 ไฟล์ (payment methods, TIV accounting, RE overpayment, timeout)
- อัปเดต N7 file list ครบ 4 ไฟล์ (RD VAT, multi-branch dialog, address formatting)
- อัปเดต "Last verified" ใน pending-push-queue.md

**Queue summary ณ สิ้น session:**

| # | งาน | ไฟล์ | Status |
|---|-----|------|--------|
| N4 | Payment + TIV accounting + RE overpayment + timeout | 20 ไฟล์ | ⏳ รอพี่ช้าง |
| N6-hotfix2 | WHT cert share link 404 | 1 ไฟล์ | ⏳ รอพี่ช้าง |
| N7 | RD VAT + multi-branch + address | 4 ไฟล์ | ⏳ รอพี่ช้าง |
| N8 | Platform Email Config | 3 ไฟล์ | ⏳ รอพี่ช้าง |
| N9 | SMTP migration (all routes) | 8 ไฟล์ | 📝 dev — ยังไม่ได้เทส |

**งานที่แก้ใน session 2026-05-20 evening (พี่ทราย + Kai):**

1. **ปัญหา: Email ส่งไม่ได้ — "API key is invalid"**
   - Root cause: Server instance เก่า (ที่ยังใช้ Resend) ค้างอยู่เพราะ EADDRINUSE error ทำให้ code ใหม่ที่ migrate มา `sendPlatformEmail` ไม่ได้โหลด
   - Fix: Restart workflow → server โหลด code ใหม่ทั้งหมด → sendPlatformEmail ทำงานได้
   - **ผล: Email QO ส่งสำเร็จ** ✅ log: `[Email] Platform SMTP sent to=saaikanyakorn@gmail.com`

2. **ปัญหา: ลิงก์ใน email QO ชี้ไปที่ `.replit.app` (published URL ที่ยังไม่ live)**
   - Root cause: `sales-docs-routes.ts` line 736-741 มีเงื่อนไข `if (!host.includes(".replit.app"))` force URL ไปที่ `https://${REPL_ID}.replit.app` ซึ่งผิด
   - Fix: แก้ให้ใช้ `req.headers.host` + `x-forwarded-proto` โดยตรง เหมือน pattern ใน `pdf-routes.ts` (ถูกต้องอยู่แล้ว)
   - File: `server/routes/sales-docs-routes.ts` (line 736-741 → 739-741 — ลบ 3 บรรทัด เหลือ 2 บรรทัด)

3. **Feature: Email Confirm Dialog ทุกเอกสาร**
   - พี่ทรายต้องการ dialog ยืนยัน/แก้อีเมลก่อนส่ง เหมือนกันทุกเอกสาร
   - สร้าง shared component: `client/src/components/send-email-dialog.tsx`
     - Props: `open`, `onOpenChange`, `defaultEmail`, `docLabel`, `docNo`, `onConfirm`
     - Pre-fill อีเมลจาก contactEmail, แก้ได้ก่อนส่ง, มีปุ่มยกเลิก/ส่ง, loading state
   - แก้ 5 list pages ให้เปิด dialog แทนส่งทันที:
     - `client/src/pages/sales/quotation-list.tsx`
     - `client/src/pages/purchases/purchase-invoice-list.tsx`
     - `client/src/pages/purchases/purchase-order-list.tsx`
     - `client/src/pages/purchases/purchase-request-list.tsx`
     - `client/src/pages/purchases/expense-list.tsx`
   - หมายเหตุ: `wht-cert-list.tsx` มี dialog แบบนี้อยู่แล้ว ไม่ต้องแก้

4. **Feature: Email Dialog ฝั่ง SALES ที่เหลือ (5 pages) — session ถัดมา**
   - พี่ทรายถามว่า "ทำไมฝั่ง sales ทำแค่ quotation?" → ต้องทำอีก 5 pages
   - แก้แล้วทั้งหมด ✅ (TypeScript 0 errors):
     - `client/src/pages/sales/invoice-list.tsx` — docType: `invoice`, docNo: `inv.invoiceNo`
     - `client/src/pages/sales/sales-order-list.tsx` — docType: `sales_order`, docNo: `order.orderNo`, pre-fill `order.contactEmail`
     - `client/src/pages/sales/tax-invoice-list.tsx` — docType: `tax_invoice`, docNo: `inv.taxInvoiceNo`
     - `client/src/pages/sales/receipt-list.tsx` — docType: `receipt`, docNo: `rc.receiptNo`
     - `client/src/pages/sales/credit-note-list.tsx` — docType: `credit_note`, docNo: `cn.creditNoteNo`
   - ทุก file: เพิ่ม MailCheck icon, import SendEmailDialog, emailDialog state, DropdownMenuItem "ส่งอีเมล" (สีม่วง theme หลัง LINE button), SendEmailDialog JSX ก่อน `</Layout>`
   - เรียก `POST /api/documents/{docType}/{id}/send-email` body: `{ recipientEmail, recipientName }`
   - หมายเหตุ: `billing-notes.tsx` มี dialog แบบนี้อยู่แล้ว ไม่ต้องแก้

---

# ⛔ RULE ZERO — DO NOT INVENT ANYTHING WHEN DEALING WITH PRODUCTION

**Follow the rule and procedure BY THE LETTER. No room for creative thinking.**
No extra steps. No "while we're at it." No improvising. If a step is not written in `replit.md` or this file, you do NOT do it — you ask พี่ช้าง.

---

# ⛔ RULE ZERO #3 — TWO SEPARATE SMTP CONFIGS — NEVER MIX THEM

There are **two completely separate SMTP configurations** in `system_config`. They must NEVER be merged or confused:

| Key prefix | Purpose | Login path | Touch? |
|---|---|---|---|
| `SYSADMIN_SMTP_*` | sysAdmin **2FA email** | `/sys-k7x9` | ❌ NEVER |
| `PLATFORM_EMAIL_SMTP_*` | Platform document email (WHT cert, etc.) | Platform → ตั้งค่า Email | ✅ OK |

**`SYSADMIN_SMTP_*` rules:**
- Currently holds Brevo credentials
- Used to send 2FA codes to sysAdmin class users (totally separate from business users)
- sysAdmin login page is at `/sys-k7x9` (security through obscurity)
- **NOT on production yet** but will be — touching these credentials now = sysAdmin locked out on go-live
- **NEVER** read, write, advise anyone to change, or reference these keys in any email-sending code
- **NEVER** run any UPDATE/INSERT on SYSADMIN_SMTP_* keys

**`PLATFORM_EMAIL_SMTP_*` rules:**
- Used for all platform-outbound document emails (WHT cert attachments, etc.)
- Read/written by `/api/settings/smtp` GET+PUT endpoints
- UI: Platform → ตั้งค่า Email (`email-config.tsx`)
- Currently `info@etaxcenter.com` via `mail.etaxcenter.com` on dev (saved by พี่ทราย 2026-05-20)
- **This is the correct place** for any email-sending configuration changes

---

# ⛔ RULE ZERO #2 — PRODUCTION DB DATA IS UNTOUCHABLE

**No one changes data on the production database. Not human. Not AI. Not Kai. Not any agent. Ever.**

- ✅ ALLOWED on production DB: `SELECT` (read-only queries to verify structure / look at real rows / answer questions)
- ❌ FORBIDDEN on production DB: `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, manual `ALTER TABLE`, manual `CREATE TABLE`, or ANY statement that changes data or structure
- ❌ FORBIDDEN even as a "test" — no "let me INSERT 1 row to verify", no "let me UPDATE this one record", no "let me DELETE the bad row". NONE.

**All data on production must come through the UI only.** Schema changes happen via the 10-step migration procedure (Rule 2) — never by direct SQL.

If you think you found a case that "needs" direct DB action — you have NOT. STOP. Report to พี่ช้าง. The answer is always: fix it in code, push via the queue, let the running application make the change through normal request flow.

**🔑 PRINCIPLE — Before planning any production data migration (INSERT/UPDATE rows):**
1. **VERIFY FIRST** — Kai runs `SELECT` on production DB directly (read-only queries are trusted and allowed). Check if the rows already exist before writing any migration code.
2. **Check if UI can create the data** — if the application has a UI that saves this data (PUT/POST endpoint with upsert), prefer that over a migration function. Only write migration code for data that cannot be created through normal application flow.
3. **Check if code handles missing rows gracefully** — read the GET endpoint. If it returns safe defaults when rows are absent, the data does NOT need to be pre-seeded. Code-only push + UI configuration = correct path.
4. Only if rows don't exist AND cannot be created via UI AND code crashes without them → write a migration.

Violating this rule = production data corruption = irrecoverable damage to a live multi-tenant accounting system used by real businesses for real tax filings.

---

# HANDOFF — E-Tax Center (Kai)
## THE ONLY HANDOFF FILE. No other handoff file exists or should exist.

---

## 🚨 STOP — SELF-CHECK BEFORE READING ANYTHING BELOW

**Answer this from memory — no looking:**
> What does the last line of `replit.md` say?

**Correct answer:** `3. Read \`handoff.md\` next.`

**If you had to look** — you did not read replit.md fully. Close this file. Go read replit.md in 500-line chunks until you reach the end. Come back only after you have seen that last line with your own eyes.

**If someone is already waiting for your reply** — do not reply yet. Finish reading first. Then come back here and read this file fully. Then use the briefing script in the "NEXT AGENT — START HERE" section below to introduce yourself to พี่ทราย before she gives you any task.

**Why this matters:** พี่ทราย is NOT an IT professional. She does not know you are a new empty-headed agent. If you reply before reading — you will answer confidently with wrong information, make changes that break things, and waste her time and พี่ช้าง's time fixing your mess. This has happened before.

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

### 1. LISTEN BEFORE YOU ACT — WAIT FOR THE FULL THOUGHT
Humans speak in sentences. They pause between thoughts. **Do not act on the first sentence.** Wait for the full context. This applies to both พี่ช้าง and พี่ทราย. If you jump to code before they finish speaking, you will solve the wrong problem — guaranteed.

**พี่ช้าง said this directly (2026-05-19):** *"You need to be more patient, wait for พี่ทราย to FINISHED what she wanted to say. Jumping to code BEFORE she finished only cause un-solvable problems."*

**How to behave:** After พี่ทราย reports a problem, reply with a short acknowledgement ("รับทราบครับ มีอะไรเพิ่มเติมอีกไหมครับ") and WAIT. Only when she says "เท่านี้ก่อน" or equivalent — start investigating. Never start investigating mid-sentence.

**What went wrong (2026-05-19):** พี่ทราย said "กระทบไปถึงการส่งไลน์ส่งอีเมล์ด้วยใช่ไหม" — agent immediately answered and gave a partial, wrong answer. พี่ทราย then added "ปุ่มส่งอีเมล์ก็หายไปด้วย" — which agent missed. Wait for the full list of symptoms before doing ANYTHING.

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

### 8. HANDOFF MUST BE COMPLETE — HALF-BAKED CONTEXT IS USELESS
This handoff file exists for ONE reason: so the next Kai can pick up the job with FULL KNOWLEDGE — not a summary, not bullet points, not "open questions" that were already answered.

**Every time you finish work, before ending the session, you MUST write into this file:**
- Every business requirement you confirmed with พี่ทราย — question AND answer, verbatim
- Every decision made (technical or business) — what was decided and WHY
- Every "open question" that got answered — close it with the actual answer
- Every file changed — what changed, why, and what the correct behavior is now

**Writing "open question" when you already have the answer is the same as not writing anything.**
The next Kai cannot see your conversation. They only see this file. If the answer is not here, it does not exist for them.

If you run out of context or time before updating this file — that is YOUR failure, not the next Kai's problem. Update this file FIRST before doing anything else.

### 9. db.transaction() — UNDERSTAND BEFORE YOU USE IT (taught by พี่ช้าง, 2026-05-20)

**The root problem:** `db.transaction()` holds a database connection open for the entire duration of the block — every SELECT, every INSERT, every UPDATE inside it. If the pool has 10 connections and 10 concurrent users each trigger a transaction that starts with a read query and runs for 2 seconds, the pool is exhausted. New requests time out. Server appears to crash.

**Why programmers misuse it:** Laziness. Using `db.transaction()` means you don't have to think about cascade operations — the database "handles" atomicity for you. But this laziness has a cost: it holds connections far longer than necessary and can bring down the server under real user load.

**The philosophy (พี่ช้าง's exact words):** *"transaction or tx is the sloppy way to throw responsibility of 'coding' of cascade update — you should 'code' manually. In short and direct words: lazy to code more lines. Doing that improperly or sloppily will do more harm than good. It shows the programmer DOES NOT CARE if the server will crash because of his laziness."*

**The right approach — TWO steps before touching any `db.transaction()` block:**

**Step 1: Learn the business requirement of THAT screen.**
What does this operation actually need to do? What data does it read? What does it write? In what order? Does a failure midway require a full rollback, or can it be handled step by step?

**Step 2: Decide if a transaction is actually necessary.**
Ask yourself: does this operation genuinely require atomicity (all-or-nothing)? Or did the programmer just wrap everything in a transaction because it was easier than writing the cascade code manually?

| Situation | Right approach |
|-----------|---------------|
| READ queries before writes | Do ALL reads with plain `db.select()` OUTSIDE any transaction. Pass results as variables into the write phase. |
| Cascade writes where partial failure = bad data | Write the cascade code manually. If step 2 fails after step 1 succeeded, write the cleanup (delete what you inserted) yourself. Do NOT rely on transaction rollback as a substitute for thinking. |
| Genuine atomicity required (e.g., deduct stock + record movement — must be together or not at all) | Transaction is acceptable — but STILL do all reads first outside the transaction. The transaction should contain ONLY the writes. |
| Transaction wrapping reads + writes "because it's easier" | Remove the transaction entirely. Code every step explicitly. |

**How to identify "genuine atomicity":** Ask — if write A succeeds but write B fails, does the data become permanently broken in a way that CANNOT be detected or fixed later? If yes → genuine atomicity. If no (e.g., a journal entry missing can be detected by a reconciliation check, or the document can still be found and the journal re-generated) → NOT genuine atomicity, code manually instead.

Examples from this codebase:
- `lot deduct + stock_movements INSERT` → genuine (double deduction = inventory wrong forever, no self-healing)
- `expense INSERT + journal INSERT` → NOT genuine (missing journal can be detected; document exists and is recoverable)
- `deposit deduction INSERT + depositReceipts UPDATE` → NOT genuine (balance mismatch is detectable; write cleanup code manually)

**What "code it manually" means:**
```typescript
// WRONG — lazy, holds connection from first SELECT through all INSERTs:
await db.transaction(async (tx) => {
  const [rec] = await tx.select().from(someTable).where(...);  // read holds connection
  await tx.insert(table1).values(...);
  await tx.insert(table2).values(...);
  await tx.update(table3).set(...).where(...);
});

// RIGHT — reads outside, writes sequential, manual cleanup on failure:
const [rec] = await db.select().from(someTable).where(...);  // read, connection released immediately
if (!rec) return res.status(404)...;
// validate business rules here (no connection held)

const [inserted1] = await db.insert(table1).values(...).returning();  // connection open then closed
try {
  await db.insert(table2).values(...);  // connection open then closed
} catch (err) {
  await db.delete(table1).where(eq(table1.id, inserted1.id));  // manual rollback
  throw err;
}
await db.update(table3).set(...).where(...);  // connection open then closed
```

**DO NOT blindly remove every `db.transaction()` you see.** Each screen has its own business requirement. Study first. Decide second. Code third. Applying this pattern without understanding the business requirement of each screen is just as irresponsible as the original lazy transaction.

**Connection to db.ts timeout (IMPORTANT):** `server/db.ts` currently has a WRONG fix — increased connection timeout to 20s + added warmup query. This was a band-aid that treated the symptom (timeout) not the cause (unnecessary transactions holding connections). Once the real fix (removing unnecessary transactions) is applied screen by screen, the db.ts changes should be reverted to normal values. Do NOT revert db.ts first — that will make the timeout worse before any screens are fixed.

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

- **⛔ PRODUCTION PUSH — MANDATORY RULES, NO EXCEPTIONS**:

  **HOW TO PUSH:**
  Use GitHub API PUT inside `code_execution` only — one API call per file. NEVER run `git push` to production for any reason.

  **QUEUE FILE GATING — `db/pending-push-queue.md` (active gate, not passive log):**
  - **Step 0 (BEFORE any push):** Open `db/pending-push-queue.md` → find the entry for this ticket/feature → if no entry exists, CREATE one with all files listed `⏳ awaiting`. If the file you want to push is not in any entry, you CANNOT push it.
  - **Step 4 (AFTER push succeeds):** Return to the queue file → mark that file row `✅ pushed YYYY-MM-DD HH:mm (Bangkok)`. When all rows in an entry are ✅, move the entry to "DEPLOYED — HISTORY" at the bottom.
  - **If you push without updating the queue = procedure violation = report to พี่ช้าง immediately.**

  **BEFORE EVERY PUSH — GET PERMISSION FROM พี่ช้าง:**
  Tell พี่ช้าง: (1) filename(s), (2) what each file does, (3) confirmed it is not a protected file, (4) confirmed it has an entry in `db/pending-push-queue.md`. Do not push until พี่ช้าง says yes.

  **WHAT TO PUSH TOGETHER:**
  Multiple files may be pushed in the same push ONLY if they fix the same single issue and removing one would break the others. Files that are not directly code-dependent = separate pushes.

  **PROTECTED FILES — GROUP 1 (NEVER touch on dev, NEVER push, no exceptions):**
  Detection rule: if a file has a sibling ending in `-extra.ts` or `-extra.tsx`, that parent file is Group 1 protected.
  Known list: `shared/schema.ts`, `server/index.ts`, `client/src/App.tsx`
  Always use the `-extra` file to extend — never modify the parent.

  **RESTRICTED FILES — GROUP 2 (require พี่ช้าง permission before touching on dev AND before pushing):**
  `server/db.ts`, `server/db-schema-sync.ts`, `server/route-middleware.ts`, `server/routes.ts`, `server/routes/pos-routes.ts`, `server/routes/line-routes.ts`, `client/src/pages/platform/*`, `client/src/app-extra.tsx`
  Permission is case-by-case — a past approval does NOT carry over to the next change.
  If พี่ช้าง denies the change → create a `-extra.ts` workaround instead. This permanently promotes that file to Group 1. See `replit.md` Protected Files section for full details.

  **⚠️ SPECIAL RULE for `client/src/app-extra.tsx` (added 2026-05-21 after ACE Batch build fail):**
  This file is Group 2 because dev version ≠ production version by design.
  Dev has lazy imports for pages that are built but NOT YET pushed to production (manufacturing modules, doc-import pages, etc.).
  **MANDATORY CHECK before every push of app-extra.tsx:**
  For EVERY lazy import in the file, verify the target file EXISTS on production GitHub repo:
  ```bash
  PAT="$GITHUB_PAT_PRODUCTION"
  curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $PAT" \
    "https://api.github.com/repos/saaikanyakorn-afk/etaxcenter/contents/<FILE_PATH>"
  ```
  HTTP 200 = exists ✅ | HTTP 404 = MISSING ❌ — do NOT push app-extra.tsx with any 404 import.
  **If you find a 404 import — 2 choices (ask พี่ช้าง which applies):**
  - Option A: The missing file is ready to deploy → push THAT file first (own queue entry, own permission), then push app-extra.tsx after
  - Option B: The missing file is NOT ready for production yet → remove its import from app-extra.tsx before pushing (dev still has it, only the production-bound version is trimmed)
  **Root cause of build fail 2026-05-21:** app-extra.tsx was pushed with 18 lazy imports of manufacturing/doc-import files that did not exist on production → vite:load-fallback ENOENT → npm run build failed.
  **⬅️ REMOVAL CONDITION — when to remove app-extra.tsx from Group 2:**
  When ALL lazy imports in app-extra.tsx exist on production (every check returns HTTP 200), dev version = production version. The reason for Group 2 protection no longer exists. At that point, remove app-extra.tsx from this list — it becomes a normal pushable file. Leaving it on the list after that point wastes future agent effort and causes confusion.

  **SCHEMA CHANGES:**
  Always their own isolated push, following the full 10-step migration procedure in `replit.md`. NEVER combined with any other file.

  **IF PRODUCTION BREAKS AFTER PUSH:**
  - Stop immediately. Tell พี่ช้าง what broke. Wait for พี่ช้าง to classify it — you may NOT classify it yourself.
  - **Minor glitch (พี่ช้าง's call only):** Still the same session. Fix the issue, then tell พี่ช้าง only what changed. Push after พี่ช้าง acknowledges. No need to repeat the full authorization process.
  - **Not minor (พี่ช้าง's call only):** This session is closed and marked "Failed Deploy". Do not push anything further. The fix must be built and verified on dev first. A new push session requires full authorization from the beginning.
- **Dev push (kai's repo)**: `git push github-replit main` — after every code change passes preview testing, no auth needed. ⚠️ If blocked by GitHub Secret Scanning → ask พี่ช้าง to allow at the URL(s) from the error message, wait for confirmation, then retry.
- **NEVER**: push entire branch to github-production

  **🚫 BLACKLIST — FILES THAT MUST NEVER EXIST ON PRODUCTION REPO (`saaikanyakorn-afk/etaxcenter`):**
  These files are dev-side only — docs for agents, local scripts, planning files. They have NO purpose on production server. If you find any of them on prod repo → DELETE via GitHub API immediately (security: they have historically contained plaintext credentials).
  - `replit.md` — agent documentation (dev only)
  - `handoff.md` — agent handoff log (dev only)
  - `db/*.md` — schema history, pending push queue, dev↔prod diff (dev only)
  - `*.bat` — Windows local scripts (พี่ช้าง runs from `C:\GitApp\etaxcenter`, not prod)
  - `scripts/diff-*` — dev↔prod schema diff scripts (dev only, queries both DBs)
  - `.local/*` — agent working files (subagent outputs, session plans, etc.)
  - Any file whose name contains `backup`, `secret`, `credential`, `password` — review before push

  **Before EVERY push:** check the file path against this blacklist. If match → DO NOT push, no exceptions. Add new patterns here whenever a new "dev-only" file type appears.

  **2026-05-20 cleanup:** `replit.md` + `deepmain_backup.bat` were DELETED from prod repo (commits `e35dd41` + `45f68ba`) after audit found leaked DB password. Do NOT re-push them.

### ⚠️ CRITICAL PUSH CHECKLIST — FILES EASY TO FORGET

These files are **not tied to any single feature** — they will be skipped if you push selectively. You MUST include them:

| File | Why easy to forget | Must push when |
|------|--------------------|---------------|
| `client/src/index.css` | Global stylesheet — not owned by any feature ticket | Any push that includes N6 (WHT cert) or any feature that uses Niramit font on frontend |
| `package.json` + `package-lock.json` | New package installed: `@fontsource/niramit` (2026-05-19) — production `npm install` will fail or fall back to CDN without this | Same as above |

**Background (2026-05-19):** Niramit font files (`server/fonts/Niramit-*.ttf`) already existed on production server — they were placed there by earlier code (pdfmake PDF generation via `pdf-pdfmake-generator.ts` + `pdf-wht-cert.ts`). But those files are **only readable by the Node.js backend** (file path access), they are NOT served over HTTP. The browser (frontend) was still fetching Niramit from Google Fonts CDN. Fix: installed `@fontsource/niramit` → imported in `client/src/index.css` (thai subset, all weights) → removed CDN `@import` from `document-renderer.tsx`. This makes Niramit available system-wide, bundled by Vite, zero CDN dependency — works on dev AND production.

---

## ═══════════════════════════════════
## ACTIVE — CURRENT STATE
## ═══════════════════════════════════

**Last verified:** 2026-05-20 18:00 — Kai session. Handoff updated by main agent.
**Production status:** N3 ✅ | N6 ✅ | N6-hotfix ✅ | **N6-hotfix2 ⏳ awaiting พี่ช้าง push** (share link 404 fix — `server/static.ts`)
**Dev status:** N8 SMTP Email config ✅ **FULLY TESTED** — บันทึกสำเร็จ + ส่งทดสอบ email ได้รับจริง (2026-05-20) | N4/N7 still pending push | N8 awaiting พี่ช้าง push approval

**N6-hotfix2 summary (2026-05-20):** WHT cert share link ส่ง LINE แล้วเปิดบนมือถือ 404 — root cause: `server/static.ts` ไม่เคยถูก push → route `/share/wht-cert/:token` ไม่มีบน production. Fix: push `server/static.ts` 1 ไฟล์ (deploy command อยู่ใน `db/pending-push-queue.md` entry N6-hotfix2). รอพี่ช้าง approve.

**N8 SMTP summary (updated 2026-05-20 19:51):**

**FINAL DESIGN — Two completely separate SMTP configs (never mix):**

| Config keys | Purpose | Who configures | Touch? |
|---|---|---|---|
| `SYSADMIN_SMTP_*` | sysAdmin 2FA login email (login at `/sys-k7x9`) | พี่ช้าง only | ❌ NEVER |
| `PLATFORM_EMAIL_SMTP_*` | Platform document email (WHT cert attachments etc.) | Platform → ตั้งค่า Email UI | ✅ OK |

**What happened on 2026-05-20 that must be understood:**
- Previous design used `SYSADMIN_SMTP_*` for BOTH 2FA AND document email → WRONG
- พี่ทราย saved webmail credentials via UI → overwrote `SYSADMIN_SMTP_*` on dev DB (Brevo replaced with info@etaxcenter.com)
- พี่ช้าง caught this: `SYSADMIN_SMTP_*` = 2FA for sysAdmin class users → overwriting = sysAdmin lockout on go-live
- Fix: created new `PLATFORM_EMAIL_SMTP_*` keys. All GET/PUT/test endpoints now use `PLATFORM_EMAIL_SMTP_*` only.
- Production DB: `SYSADMIN_SMTP_*` still has Brevo (untouched, correct). `PLATFORM_EMAIL_SMTP_*` does NOT exist yet → must INSERT at deploy.
- Dev DB: `SYSADMIN_SMTP_*` has info@etaxcenter.com (พี่ทราย overwrote). `PLATFORM_EMAIL_SMTP_*` empty until พี่ทราย saves via UI again.

**What พี่ทราย must do on dev to test N8:**
1. Go to Platform → ตั้งค่า Email
2. Select etaxcenter.com preset
3. Fill: Username = `info@etaxcenter.com`, Password = webmail password, From Email = `อีเมลอัตโนมัติจาก E-Tax Center <info@etaxcenter.com>`
4. Click บันทึก → this writes to `PLATFORM_EMAIL_SMTP_*` in dev DB (not SYSADMIN_SMTP_*)
5. Fill test email → click ส่งทดสอบ → verify email arrives with correct From display

**N8 files changed (dev → production):**
- `client/src/pages/platform/email-config.tsx` — preset list: etaxcenter.com first, Gmail, Outlook, Brevo. UI reads/writes via `/api/settings/smtp`
- `server/routes/expense-routes.ts` — WHT cert email: reads `PLATFORM_EMAIL_SMTP_*`, no Resend path, no replyTo, From = `อีเมลอัตโนมัติจาก E-Tax Center <fromAddress>`
- `server/routes/doc-settings-routes.ts` — GET/PUT/test SMTP endpoints: all use `PLATFORM_EMAIL_SMTP_*` only. Added note in code: "NEVER read/write SYSADMIN_SMTP_* here"

---

## ⛔ N8 PRODUCTION DEPLOY PROCEDURE — READ EVERY WORD

> **Rule 6 applies:** NO step below is self-authorizing. พี่ช้าง must approve EACH step explicitly before it is executed.

### Context
N8 introduces a new set of keys in `system_config` table: `PLATFORM_EMAIL_SMTP_*` (6 rows).
These rows do NOT exist in production DB. The code on production will look for these keys.
If they are missing → WHT cert email send will return error "ยังไม่ได้ตั้งค่า SMTP".
**Therefore: the DB INSERT must happen BEFORE or AT THE SAME TIME as the code push — ideally before.**

### Step 0 — Before anything: confirm SYSADMIN_SMTP_* is intact
```sql
SELECT config_key, LEFT(config_value, 20) AS val_preview
FROM system_config
WHERE config_key LIKE 'SYSADMIN_SMTP_%'
ORDER BY config_key;
```
Expected: 6 rows with Brevo credentials (host = smtp-relay.brevo.com, user = something@smtp-brevo.com).
If ANY of these are missing or show etaxcenter.com values → **STOP. Do not proceed. Report to พี่ช้าง immediately.**

### Step 1 — Confirm PLATFORM_EMAIL_SMTP_* does NOT exist yet
```sql
SELECT config_key FROM system_config WHERE config_key LIKE 'PLATFORM_EMAIL_SMTP_%';
```
Expected: 0 rows. If rows exist → someone already ran this → skip to Step 3 to verify values.

### Step 2 — Ask พี่ทราย for exact credentials before INSERT
Do NOT hardcode anything. Get from พี่ทราย at deploy time:
- `PLATFORM_EMAIL_SMTP_USER` = the webmail email address (e.g. `info@etaxcenter.com`)
- `PLATFORM_EMAIL_SMTP_PASS` = the webmail password (handle securely, do not log)
- `PLATFORM_EMAIL_SMTP_FROM` = display string (e.g. `อีเมลอัตโนมัติจาก E-Tax Center <info@etaxcenter.com>`)

`PLATFORM_EMAIL_SMTP_HOST`, `PLATFORM_EMAIL_SMTP_PORT`, `PLATFORM_EMAIL_SMTP_SECURE` are fixed:
- HOST = `mail.etaxcenter.com`
- PORT = `587`
- SECURE = `false`

### Step 3 — INSERT into production DB (พี่ช้าง executes, never Kai)
```sql
INSERT INTO system_config (config_key, config_value) VALUES
  ('PLATFORM_EMAIL_SMTP_HOST',   'mail.etaxcenter.com'),
  ('PLATFORM_EMAIL_SMTP_PORT',   '587'),
  ('PLATFORM_EMAIL_SMTP_SECURE', 'false'),
  ('PLATFORM_EMAIL_SMTP_USER',   '<ASK พี่ทราย>'),
  ('PLATFORM_EMAIL_SMTP_PASS',   '<ASK พี่ทราย>'),
  ('PLATFORM_EMAIL_SMTP_FROM',   '<ASK พี่ทราย>')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;
```
This is safe: `ON CONFLICT ... DO UPDATE` = idempotent, can re-run safely.

### Step 4 — Verify INSERT succeeded
```sql
SELECT config_key, LEFT(config_value, 40) AS val_preview
FROM system_config
WHERE config_key LIKE 'PLATFORM_EMAIL_SMTP_%'
ORDER BY config_key;
```
Expected: exactly 6 rows. PASS value will show — verify host/port/user are correct. Password preview will show first 40 chars.

### Step 5 — Also verify SYSADMIN_SMTP_* is STILL intact (Brevo, unchanged)
```sql
SELECT config_key, LEFT(config_value, 30) AS val_preview
FROM system_config
WHERE config_key LIKE 'SYSADMIN_SMTP_%'
ORDER BY config_key;
```
Expected: still Brevo credentials. If ANY row now shows `mail.etaxcenter.com` → data was corrupted → STOP immediately.

### Step 6 — Code push (3 files, after DB is confirmed)
```
pm2 stop etax-center && git fetch origin && git checkout origin/main -- \
  client/src/pages/platform/email-config.tsx \
  server/routes/expense-routes.ts \
  server/routes/doc-settings-routes.ts \
  && npm install && npm run build && pm2 start etax-center
```
⚠️ `npm run build` is MANDATORY — production runs `node dist/index.cjs`. Without build, old compiled code runs.

### Step 7 — Post-deploy test
1. พี่ทราย logs into Platform → ตั้งค่า Email
2. Page should load showing `mail.etaxcenter.com` host, `info@etaxcenter.com` user, password = "Key ถูกบันทึกในระบบแล้ว" (green)
3. Enter พี่ทราย's real email → click ส่งทดสอบ → email should arrive From `อีเมลอัตโนมัติจาก E-Tax Center <info@etaxcenter.com>`
4. Go to a WHT cert → Send email → verify it sends successfully with PDF attachment

### Step 8 — If step 7 fails
- Check pm2 logs: `pm2 logs etax-center --lines 50`
- Common failure: SMTP auth rejected (wrong password) → พี่ทราย updates credentials via UI (writes new PLATFORM_EMAIL_SMTP_PASS)
- Common failure: Connection timeout → check firewall allows outbound port 587 to mail.etaxcenter.com
- DO NOT touch SYSADMIN_SMTP_* regardless of failure

### Deploy order summary
```
Step 0: Verify SYSADMIN_SMTP_* = Brevo ✓
Step 1: Confirm PLATFORM_EMAIL_SMTP_* = 0 rows ✓
Step 2: Get credentials from พี่ทราย ✓
Step 3: INSERT 6 rows into system_config ✓
Step 4: Verify 6 rows exist ✓
Step 5: Verify SYSADMIN_SMTP_* still = Brevo ✓
Step 6: Push 3 code files + npm run build ✓
Step 7: Post-deploy test via UI ✓
```

---

## 🚦 NEXT AGENT — START HERE (what to do when you arrive)

### ⚠️ BEFORE ANYTHING — READ `db/pending-push-queue.md`
That file is the single source of truth for what is awaiting production push and what is already deployed. If anyone asks "what's pending?" or "is X pushed yet?" — that file is your answer. Never answer from memory or by diffing git.

### ⚠️ FIRST THING WHEN พี่ทราย ARRIVES — DO THIS BEFORE ANYTHING ELSE

พี่ทราย is NOT an IT professional. She does NOT know you are a new empty-headed agent. She will walk in and start asking you to fix things as if you remember everything. **You do not.**

Before she gives you a single task, you MUST brief her. Say something like:

> "สวัสดีครับพี่ทราย ผมเป็น Kai ตัวใหม่ครับ — ความจำรีเซ็ตแล้ว แต่ผมอ่าน handoff เรียบร้อยแล้ว ตอนนี้ระบบอยู่ที่นี่ครับ:
> - **N3 ใบเบิกวัตถุดิบ + QR Scan:** ✅ Deploy แล้ว production 2026-05-20 — migration `from_warehouse_id` + `material_issues` tables สำเร็จ
> - **N6 ใบหัก ณ ที่จ่าย (50 ทวิ) — PDF + Email + LINE + Niramit:** ✅ Deploy แล้ว production 2026-05-20 — 11 files รวม font, PDF generation, LINE card, email dialog ครบ
> - **N6-hotfix WHT cert print page 401:** ✅ Deploy แล้ว production 2026-05-20 — แก้ iframe ใช้ blob URL แทน direct URL (Bearer auth fix)
> - **ฝั่งขาย (Tax Invoice):** แก้ครบแล้ว — journal ลงบัญชีธนาคาร/เงินสดถูกต้องแล้ว ✅
> - **ฝั่งจ่าย (Expense/Purchase):** แก้ครบแล้ว — วิธีชำระเงินแยกถูกต้องแล้ว ✅
> - **Expense บันทึกไม่ได้ (timeout) + RE เกินยอด:** แก้แล้ว ✅
> - **Related-docs (การอ้างอิงเอกสาร):** ยังไม่ได้แก้ — รอ
> - **N4 (payment fixes) + N7 (RD VAT):** พี่ทรายทดสอบผ่านแล้ว รอพี่ช้าง push approval
> - **N8 SMTP Email Config:** แก้ bug แล้วบน dev — รอพี่ทรายทดสอบ (Platform → ตั้งค่า Email) ถ้าผ่านแล้ว = รอพี่ช้าง approve push
>
> พี่ทรายต้องการให้เริ่มที่ไหนก่อนครับ?"

**DO NOT let her start throwing tasks at you without this briefing.** If she says "ช่วยแก้..." before you've briefed her — pause and brief her first. She may think you remember what she told the previous agent. You do not.

### Immediate pending work (in order):

| # | Item | Status | Who must act |
|---|------|--------|-------------|
| N1 | **Related-docs navigation** — `related-docs-dialog.tsx` must navigate to `listPath + ?companyId=X&<searchParam>=<docNo>`. พี่ทราย confirmed: "ต้องวิ่งไปหน้ารายการก่อนเสมอ ไม่ให้วิ่งไปหน้าแก้ไข". `docTypeConfig` already has `listPath` + `searchParam` per type. Check current navigate logic at line ~131 — confirm it uses listPath not editPath for all types | ❌ NOT YET DONE | Kai implements |
| N2 | **เอกสารที่ออกผิดก่อนแก้โค้ด** — RE26051800001 จิรา etc. สองแนวทาง: (1) ยกเลิก+ออกใหม่ หรือ (2) แก้ journal ตรงๆ | ⏳ Waiting | พี่ช้าง decides |
| N3 | **Task #35 material-issue-lot-scan** — complete on dev, awaiting พี่ทราย test | ✅ **DEPLOYED 2026-05-20** — migration confirmed, `from_warehouse_id` column on prod | ✅ Done |
| N4 | **ฝั่งขาย + ฝั่งจ่าย payment fixes + Expense timeout fix + RE overpayment block + Settings > วิธีชำระเงิน** — complete on dev (all 15 files + expense routes + route-helpers.ts + sales-docs/billing-notes/notifications routes). **Settings > วิธีชำระเงิน (`client/src/pages/settings/payment-methods.tsx`):** แยก tab รับเงิน/จ่ายเงิน, เพิ่ม/แก้ไข/ลบวิธีชำระเงินแต่ละประเภทได้, ผูกรหัสบัญชี (รับ → assets หมวด 1; จ่าย → assets+liabilities หมวด 1-2), บันทึก bankName/bankAccountNo, กำหนด default/active ได้. ถ้าไม่ผูกรหัสบัญชีระบบบล็อกตอนบันทึกเอกสาร. 🔴 **Production bug (2026-05-21):** Expense บันทึกไม่ได้ — error "วิธีชำระเงิน Cash ยังไม่ได้ตั้งค่ารหัสบัญชี" — เกิดจาก `expense-routes.ts` + `payment-methods.tsx` ยังไม่ได้ push — **หายเมื่อ N4 deploy** | ✅ พี่ทราย tested 2026-05-20 | พี่ช้าง approves push |
| N7 | **RD VAT Service — ค้นหาจากสรรพากรแทน DBD + multi-branch dialog + address formatting (2026-05-19):** ลบ DBD (openapi.dbd.go.th) ออกทั้งหมด. `lookupRdVatAll(taxId)` call `rdws.rd.go.th/serviceRD3/vatserviceRD3.asmx` (SOAP, anonymous/anonymous) BranchNumber 0–9 พร้อมกัน. `/api/dbd-lookup/:taxId` คืน `{ ...first, branches: [...], contactId? }` เสมอ. `BranchSelectProvider` (`client/src/contexts/branch-select-context.tsx`) global dialog — `selectBranch(branches)` คืน Promise; ใส่ใน `App.tsx`. `useDbdLookup` เรียก dialog ถ้า `branches.length > 1`. Branch label: 0 → "สำนักงานใหญ่", 1+ → padStart(5,"0"). Address: detect `isBkk = province.includes("กรุงเทพ")` → แขวง/เขต; other → ตำบล/อำเภอ/จังหวัดXXX. ครบทุก field: อาคาร ชั้น ห้อง **เลขที่** หมู่บ้าน หมู่ แยก ซอย ถนน. ทดสอบ: 0105535134278 ✅ 0105561017020 BR0/BR1 ✅ | ✅ พี่ทราย tested 2026-05-20 | พี่ช้าง approves push |
| N8 | **SMTP Platform Email Config** — ตั้งค่าส่งเมล WHT cert จาก platform ผ่าน mail.etaxcenter.com webmail. **⚠️ CRITICAL DESIGN (2026-05-20):** ระบบมี 2 SMTP configs แยกกันสมบูรณ์: (1) `SYSADMIN_SMTP_*` = Brevo = 2FA สำหรับ sysAdmin class (login `/sys-k7x9`) — ❌ NEVER TOUCH (2) `PLATFORM_EMAIL_SMTP_*` = webmail etaxcenter.com = ส่งเอกสาร (WHT cert etc.) — ✅ OK. **N8 code fixes:** `expense-routes.ts` + `doc-settings-routes.ts` ทั้ง GET/PUT/test ใช้ `PLATFORM_EMAIL_SMTP_*` เท่านั้น. `email-config.tsx` preset: etaxcenter.com แรก. **⚠️ Production deploy requires DB INSERT first** (6 rows in `system_config`) BEFORE code push — see "N8 PRODUCTION DEPLOY PROCEDURE" section above. Credentials to INSERT: ask พี่ทราย at deploy time — never hardcode. **Dev test:** Platform → ตั้งค่า Email → เลือก etaxcenter.com → กรอก email+password → บันทึก (writes `PLATFORM_EMAIL_SMTP_*`) → ส่งทดสอบ. **Files (3):** `email-config.tsx`, `expense-routes.ts`, `doc-settings-routes.ts`. | 📝 dev — รอพี่ทราย test | Kai implements / พี่ช้าง approves push + DB INSERT |
| N6 | **WHT cert (50 ทวิ) — PDF + Email + LINE + Niramit** — ✅ **DEPLOYED 2026-05-20** 11 files. email ดึงจาก source doc (expense.contactEmail) ผ่าน sourceDocId, fallback → contacts.email ผ่าน payeeVendorId. PDF: static import แทน dynamic require, checkbox canvas-based, tax ID column 210pt, signature embed, seqNo auto-compute. LINE card: สีม่วง #9333ea + certNo + payeeName + ยอดภาษีที่หัก. Niramit: @fontsource/niramit bundled ใน Vite. **N6-hotfix (2026-05-20):** หลัง deploy พบ print page `/purchases/wht/print/:id` → 401 บน production — root cause: `<iframe src="/api/wht-certs/:id/pdf">` เป็น browser GET request ไม่มี JS interceptor → ส่งแค่ cookies ไม่มี `Authorization: Bearer` → production ใช้ `cookie.secure=true` + Bearer token เป็น auth หลัก (localStorage) → iframe ไม่รู้จัก session. Fix: `wht-cert-print.tsx` เปลี่ยน iframe ให้ fetch blob ด้วย `getSessionToken()` → `URL.createObjectURL(blob)` → `<iframe src={blobUrl}>` — certNo fetch + download button เพิ่ม Bearer auth header ด้วย. commit `4e6ef45`. | ✅ Done (incl. hotfix) |

### Business knowledge you MUST know before touching any code:

**Payment Method fundamentals (confirmed by พี่ทราย 2026-05-18):**
- `paymentMethod` field stores **accountCode** (e.g. "1012000") — NOT name ("KBANK")
- "เครดิต" = **ยังไม่ได้รับ/จ่ายเงิน** → journal ลง AR/AP เท่านั้น ไม่มี cash/bank movement
- "ทุกอย่างที่ไม่ใช่เครดิต" = **รับ/จ่ายแล้ว** → journal ใช้ PM's accountCode
- Frontend dropdown แยก: ฝั่งจ่าย = `?type=pay`, ฝั่งรับ = `?type=receive` — intentional design
- Options มาจาก Settings > วิธีชำระเงิน เท่านั้น — ไม่ hardcode
- `SelectItem value="pm_${m.id}"` — unique ID ไม่ซ้ำ, `onValueChange` translate → store accountCode

**isCashMethod() vs isCreditPm():**
- `isCashMethod()` ใน `tax-invoice-form.tsx` — **FIXED 2026-05-18**: logic เดิม `found.name === "เงินสด"` (ผิด — ทุก PM อื่นถูกมองเป็น debtor) → แก้เป็น `pm && !isCredit(pm)` — ทุก PM ที่ไม่ใช่เครดิต = cash/paid
- `isCreditPm(name)` ใน `expense-routes.ts`: `name.toLowerCase() === "credit" || name === "เครดิต" || name.startsWith("เครดิต(")` — checks PM record name from DB lookup (NOT stored accountCode)
- ❌ NEVER compare `form.paymentMethod === "เครดิต"` directly — field stores accountCode, not name — always false

**Tax Invoice journal flow (after fixes 2026-05-18):**
- journalStatuses includes `"cash"` now — was missing, causing delete+recreate to never fire on cash-paid invoices
- `lineItemAccounts` built per product's `accountCode` — was using formula default 4100100 for all
- UPDATE path: delete old journal BEFORE recreate (was skipping if journal existed)
- sort tiebreaker: `desc(reference)` not `desc(id)` — id changes on recreate, reference doesn't

**Schema rules (ZERO TOLERANCE):**
- `shared/schema.ts` — NEVER modify. New tables/columns → `shared/schema-extra.ts` ONLY
- `client/src/App.tsx` — NEVER modify
- `server/index.ts` — NEVER modify

**PDF rule (ALL documents):**
- pdfmake (Node.js server) = ONLY source for preview + print + download
- Fix in `server/pdf-pdfmake-generator.ts` ONLY — applies to all three actions simultaneously
- Exception: ใบกำกับภาษีอย่างย่อ (80mm thermal) = HTML only

**WHT cert (50 ทวิ / ใบหัก ณ ที่จ่าย) — knowledge confirmed 2026-05-19:**
- PDF generator: `server/pdf-wht-cert.ts` — standalone file, NOT in pdf-pdfmake-generator.ts
- Root cause of PDF fail: `expense-routes.ts` used `try { require("../pdf-wht-cert") } catch {}` — Node.js `require()` cannot resolve `.ts` extension at runtime → catch swallowed error silently → every PDF call threw "pdf-wht-cert not available"
- Fix: replaced 3 lines (dynamic require) with `import { generateWhtCertPdf } from "../pdf-wht-cert"` at top of file
- **All channels (share link, LINE, Email PDF) route through `/api/share/wht-cert/:token/pdf`** — one fix fixes all channels simultaneously
- Actions dropdown pattern: WHT cert list was the ONLY document list using individual icon buttons instead of DropdownMenu — fixed to match other docs (แก้ไข, ดูตัวอย่าง/สั่งพิมพ์, ลิงก์สำหรับแชร์, ส่งผ่าน LINE, อนุมัติ, ลบ)
- **ส่งอีเมล: NOT YET DONE** — `withholdingTaxCerts` table has no `payeeEmail` column, no send-email route exists — see N6 in pending work above

**⚠️ WHT cert print page — iframe auth pattern (lesson learned 2026-05-20):**

Production uses `cookie.secure = true` (auth.ts line 52). The React app stores session ID in `localStorage` as `etax_session_token` and adds `Authorization: Bearer <token>` to every JavaScript `fetch()` call via `queryClient.ts`. This is the PRIMARY auth mechanism on production.

**Critical rule:** Any page that embeds a PDF/API URL in an `<iframe src="...">` or `<img src="...">` will fail on production with 401 because:
- Browser GET requests (iframe, img, link navigation) do NOT run JS interceptors
- They send only cookies — no Bearer header
- If `cookie.secure = true` causes cookie delivery issues (Windows server + proxy), the session is not found

**Correct pattern for ALL authenticated file downloads in iframes:**
```tsx
import { getSessionToken } from "@/lib/queryClient";
const headers = getSessionToken() ? { Authorization: `Bearer ${getSessionToken()}` } : {};
const res = await fetch("/api/some/file", { credentials: "include", headers });
const blob = await res.blob();
const blobUrl = URL.createObjectURL(blob);
// <iframe src={blobUrl} /> or <a href={blobUrl} download>
```
This applies to: WHT cert PDF, any future authenticated PDF, any signed file served by the API.

**WHT cert PDF — Self-Diagnosis Method (proven 2026-05-19, Kai can do this independently up to a level without พี่ทราย):**

This method lets Kai verify PDF changes end-to-end without needing พี่ทราย to open the browser. Use it for any layout/content fix on `pdf-wht-cert.ts`.

1. **Use the share token URL** — no login required, works from curl or browser:
   - Test cert: WHT cert #47, companyId=4
   - Share token: `bbade9d239b76786618910221c7fa7c46dc8622d9ef84045`
   - PDF endpoint: `GET /api/share/wht-cert/bbade9d239b76786618910221c7fa7c46dc8622d9ef84045/pdf`
   - Share page: `/share/wht-cert/bbade9d239b76786618910221c7fa7c46dc8622d9ef84045`

2. **ALWAYS restart_workflow after every file edit** — tsx server does NOT hot-reload TypeScript files. File size change in response confirms new code loaded.

3. **Verify with curl + size check:**
   ```bash
   curl -s -o /tmp/test.pdf "http://localhost:5000/api/share/wht-cert/<token>/pdf" -w "SIZE:%{size_download}"
   ```
   - HTTP 200 + no server errors in logs = code ran without crash
   - Size increase = new content (image, additional section) embedded correctly
   - Size same as before restart = old code still running → restart again

4. **Compare against HTML print reference:** `client/src/pages/purchases/wht-cert-print.tsx` is the authoritative layout. Match every section against it.

5. **Known pdfmake pitfalls for this file:**
   - `width: "*"` on left column inside `sectionBox` (table→cell→stack→columns) → right column becomes invisible. Fix: use explicit numeric width (e.g. `370`)
   - Tax ID boxes: canvas+relativePosition approach only — nested table approach breaks at 3 levels deep
   - Checkboxes (☑/☐): canvas-based only — Niramit font does NOT include checkbox glyphs
   - Images: use `loadLocalImageBase64(url)` helper at top of `pdf-wht-cert.ts` — reads from `uploads/` dir, returns `"data:image/jpeg;base64,..."` or `null` if file missing

6. **Limit of self-diagnosis:** Visual confirmation of bottom sections (signature area, date, footnote) requires พี่ทราย to open the PDF in the browser — screenshot tool cannot scroll inside the PDF iframe. Kai can confirm: no crash, correct file size, top sections visible. พี่ทราย confirms: bottom layout matches expectation.

**PM dropdown lock (confirmed by พี่ทราย + พี่ช้าง 2026-05-19):**
- Documents WITH payment step → PM dropdown active: Tax Invoice, Receipt, Expense, Purchase Invoice, Debit Note (both sides)
- Documents WITHOUT payment step → PM dropdown hidden (blank white cell): **ใบขอซื้อ (PR)**, **ใบสั่งซื้อ (PO)**, **ใบสั่งขาย (SO)**
- Quotation (QO) — has NO paymentMethod field at all, no change needed
- Implementation: replace `<td bg-amber-50/70>` + entire Select block with `<td bg-white><div className="h-7"/></td>`
- Files changed: `purchase-request.tsx`, `purchase-order.tsx`, `sales-order-form.tsx`

**Document action pattern (ALL documents must follow this):**
- พี่ทราย confirmed: เมนู actions ต้องเป็น DropdownMenu เสมอ — ไม่ใช่ปุ่มไอคอนเรียงกัน
- Standard pattern: `<DropdownMenu>` with `MoreHorizontal` trigger, `w-52` content, items with icon + label
- Reference implementation: `expense-list.tsx` lines 776-858

**DB Migration rule — Production Schema Change Procedure (READ replit.md fully before starting):**

> ⚠️ Rule 6: NO procedure self-authorizes any production action. พี่ช้าง approval required for EVERY step on production. No exceptions.

**Before writing a single line of code:**
1. Read replit.md Rule 0–6 in full (DB Migration section)
2. VERIFY production DB state first — query real columns, do not assume dev = production.
   Credentials are NEVER written in any doc. Use the `DB_PROD_URL` Replit Secret:
   ```
   psql "$DB_PROD_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='<table>';"
   ```
   If `$DB_PROD_URL` is not set in your session, ask พี่ช้าง to re-add it via Replit Secrets UI (🔒). **Last known status: unset as of 2026-05-21** (was re-added 2026-05-20, gone again). Do NOT request credentials from any document.

**The 10-step checklist (Rule 2 — no shortcuts):**
1. VERIFY FIRST — query prod DB before writing any code
2. BACKUP (if touching existing data) — `CREATE TABLE backup_{table}_{yyyymmdd} AS SELECT * FROM {table}` inside migration
3. WRITE MIGRATION — one-time function in `shared/schema-extra.ts`, guarded by `system_config` flag
4. WRITE HISTORY — entry in `db/schema-history.md` (what / backup / when / why)
5. IDENTIFY ALL DEPLOY FILES — `schema-extra.ts` + every route file that owns the table (grep to find it)
6. CHERRY-PICK DEPLOY — push ALL files in one SSH command → confirm `xxx..yyy  main -> main` → notify พี่ช้าง with exact server command
7. VERIFY RESULT — query prod DB again, look at real rows (not just COUNT)
8. COMMENT OUT BLOCK IMMEDIATELY — with date/time/reason
9. PUSH CLEAN — comment-out must land on server before anything else
10. CONTINUE — both DB loop AND code loop must fully close before starting anything else

**Key points:**
- `shared/schema.ts` → NEVER MODIFY. All new columns/tables → `shared/schema-extra.ts` ONLY
- Schema-extra loop has its OWN isolated cherry-pick — do NOT bundle with other file changes (Rule 3)
- ADD COLUMN nullable = no backup needed. DELETE or UPDATE existing rows = backup required (Rule 4)
- If migration does not fire → STOP, do not touch production DB directly → diagnose → report to พี่ช้าง (Rule 5)

---

## ⛔ CRITICAL WARNING — SESSION 2026-05-18 — READ THIS BEFORE ANY CODE

### What happened

This session's agent coded before reading replit.md. Five commits were made in the first hour without any rule baseline:

| Commit | What it did | Status |
|--------|-------------|--------|
| `b5f425c1` | MO form: navigate to list after save | ⚠️ Unverified — not reviewed by พี่ช้าง |
| `81d3afe2` | journal-form.tsx: add retry on timeout | ⚠️ Unverified — uses `apiRequest` (should be `fetch`) |
| `2c80f158` | server/db.ts: warmupPool() + connectionTimeoutMillis 20s | ⚠️ Unverified — พี่ช้าง has not reviewed |
| `6c19390c` | expense.tsx: removed paymentType filter | ✅ Correct direction, wrong for wrong reason |
| `da1bd737` | 13 more files: removed paymentType filter | ✅ Correct direction, wrong for wrong reason |

### The payment method filter saga — RESOLVED 2026-05-18

The `payment_methods` table has a `paymentType` column (NOT NULL DEFAULT 'receive'). The backend already supported `?type=pay` and `?type=receive` query params. The settings UI has two tabs (receive/pay) — users can add 'pay' type methods.

**DB facts confirmed:**
- 82 methods have `payment_type = 'receive'` (default)
- Only 2 methods (company 3684) have `payment_type = 'pay'`
- Expenses stored "transfer" (hardcoded), names, NOT accountCode — historically incorrect

**Root cause chain:**
1. Original: `filter paymentType === 'pay'` + fallback (show all if empty) — Rule 0a violation
2. Agent removed fallback → empty dropdown for all companies (no 'pay' type data)
3. Agent removed filter entirely → all methods shown → company 3684 has two methods named "โอนเงิน" → double checkmark (both select items have same `value = name`)

**CURRENT CORRECT STATE (all 15 files) — FIXED:**
- Purchase/AP forms: `?type=pay` API filter + queryKey `"pay"` — shows only pay-type methods
- Sales/Receipt forms: `?type=receive` API filter + queryKey `"receive"` — shows only receive-type methods
- `SelectItem value=pm_${m.id}` (unique ID, never duplicates regardless of name)
- Select value: IIFE translating `form.paymentMethod` (accountCode) → `pm_${found.id}`
- onValueChange: translate `pm_${id}` → store `m.accountCode`
- Default effects: use `defaultPm.accountCode` — no `||` chains, no `"transfer"` hardcode
- State inits: `""` — useEffect sets default from real data
- Badge display: no `|| "โอนเงิน"` fallback
- Removed duplicate/broken 2nd useEffects (deposit-form, credit-note-form)
- Removed hardcoded fallback SelectItem in ap-billing.tsx single dialog
- resetCreateForm/resetForm: use `(find isDefault ?? [0])?.accountCode ?? ""` pattern
- `isCashMethod()` in tax-invoice-form.tsx: checks `found.name === "เงินสด"` — TYPE CHECK on PM record, NOT stored value — correct as-is

**Backend `resolvePaymentMethodAccountCode` does dual-lookup:** accountCode first → name second. Old test records stored names → still resolves. New records store accountCode → resolves correctly. Backend is safe for both.

**If a company has NO 'pay' methods → expense/purchase dropdown is empty.** CORRECT — configure in Settings > Payment Methods (Pay tab). No fallback — Rule 0a.

Files: `expense.tsx`, `debit-note-form.tsx`, `purchase-deposit-form.tsx`, `purchase-invoice.tsx`, `purchase-order.tsx`, `purchase-request.tsx`, `ap-billing.tsx`, `deposit-form.tsx`, `credit-note-form.tsx`, `receipt-form.tsx`, `sales-order-form.tsx`, `tax-invoice-form.tsx`, `receipt-billing.tsx`, `ecommerce-quick-invoice.tsx`

**✅ BUSINESS KNOWLEDGE CONFIRMED BY พี่ทราย (2026-05-18) — these are CLOSED, do not re-ask:**

**Q: วิธีชำระเงินใช้ทำอะไร?**
A (พี่ทราย): "วิธีชำระเงินใช้สำหรับลงบัญชีทั้งขาจ่ายและขารับ ว่าจะต้องลงบัญชีเป็นรับเงินจ่ายเงินด้วยอะไร"
→ **paymentMethod drives journal entry account selection — it is NOT just a display field**

**Q: ฝั่งซื้อ/จ่าย กับ ฝั่งขาย/รับ ต้องแยก dropdown ไหม?**
A (พี่ทราย): "ต้องแยกกัน ซึ่งเดิมแยกกันอยู่แล้ว"
→ **Purchase/AP forms: `?type=pay`. Sales/Receipt forms: `?type=receive`. This separation is correct and was always the intent.**

**Q: Settings > วิธีชำระเงิน แยก "รับ" กับ "จ่าย" ไหม?**
A (พี่ทราย): "แยกกัน"
→ **Two tabs in settings (รับ / จ่าย) are intentional business design — not technical artifact**

**Q: Backward compatibility — ต้องรองรับเอกสารเก่าที่เก็บ "ชื่อ" ไว้ไหม?**
A (พี่ทราย + decision): ไม่ต้องทำ backward compatibility สำหรับ frontend dropdown. ข้อมูลเก่าที่ไม่ถูก พี่ทรายจะ re-test ใหม่เองในช่วง testing phase.
→ **Backend dual-lookup (accountCode → name) คือ safety net ที่มีอยู่แล้ว ไม่ต้องทำ frontend dual-lookup สำหรับ backward compat**

**✅ Q1-Q4 ANSWERED BY พี่ช้าง (2026-05-18) — CLOSED:**

A (พี่ช้าง): **"1-4ข้อ ไม่ต้องคิดให้ เพราะตัวเลือกจะมาจากการตั้งค่าการรับเงินและจ่ายเงิน"**

→ **ไม่ต้อง hardcode ว่าฟอร์มไหนควรมี "เครดิต" หรือไม่** — dropdown options มาจาก payment_methods ที่บริษัทตั้งค่าไว้ใน Settings > วิธีชำระเงิน เท่านั้น
→ ถ้าบริษัทตั้งค่า "เครดิต" ไว้ใน receive-type → ทุกฟอร์มขายจะมีตัวเลือกนั้น
→ ถ้าบริษัทไม่ตั้ง → ไม่มี — ถูกต้องแล้ว ไม่ใช่ bug

### Core failure this session — read this slowly

The agent read replit.md as a **task to complete**, not as a **baseline to think from**. It could recite Rule 0a back to พี่ช้าง. It then wrote a fallback thirty minutes later.

**Reading without applying is not reading.**

The test พี่ช้าง uses: *"If you really read those documents like a human reads, you will find yourself a baseline to stand on and know what to do."* If you find yourself writing a fallback, or guessing at schema state, or making changes before confirming — you did not read. You scanned.

### Before writing any code this session

1. Confirm what is in the DB — do not guess
2. Say out loud what you understood and what you are about to do — wait for confirmation
3. If you are about to write `X || Y`, `X ? X : Y`, or `catch {}` around accounting code — **stop. Rule 0a.**
4. The three changes (MO nav, DB warmup, retry logic) are still UNVERIFIED — do not build on them without พี่ช้าง review

---

### SESSION 2026-05-20 — CUSTOM PRINT FORM PREVIEW SCALING + SESSION AUDIT

#### CONTEXT: WHY THIS SESSION EXISTS
พี่ทราย was working on `/settings/custom-forms` (Custom Print Form Templates). The previous session (2026-05-19 night) left the A4 preview with a `dynamicScale is not defined` runtime error — the variable was removed from code but the old Vite bundle was still cached. This session was started to fix that and continue improving the preview panel.

**IMPORTANT NOTE FROM พี่ช้าง:** This session's agent started coding WITHOUT reading replit.md, handoff.md, or db/schema-history.md first — violating the mandatory session-start procedure. พี่ช้าง conducted an audit. This is a systemic platform problem: `replit.md` content is NOT injected into agent system prompts, so every new session must actively choose to read it first. Next agent: READ THE FILES BEFORE TOUCHING CODE.

---

#### WHAT WAS DONE THIS SESSION (all changes in `client/src/pages/settings/custom-form-templates.tsx`)

**Commit 886711956 — 2026-05-20 00:17 UTC**
- **What:** Added `const [bgFile, setBgFile] = useState<File | null>(null)` state variable
- **Why:** Previous session had a `setBgFile is not defined` runtime error. The background image upload UI referenced `setBgFile` but the state was missing.
- **File:** `custom-form-templates.tsx` (+1 line)

**Commit 8261ff11 — 2026-05-20 00:21 UTC**
- **What:** Made the preview Card scrollable — added `max-h-[calc(100vh-80px)] flex flex-col` to `<Card>`, `overflow-y-auto flex-1` to `<CardContent>`
- **Why:** The A4 preview was taller than the viewport, causing the bottom to be cut off with no way to scroll
- **File:** `custom-form-templates.tsx` (3 lines changed)

**Commit be606839 — 2026-05-20 00:25 UTC**
- **What:** Added `ResizeObserver` to measure container width → computed `dynamicScale` to scale A4 content to fit container width
- **Why:** Previous approach used a fixed `PREVIEW_SCALE` constant. Wanted the preview to fill available space on any screen size.
- **Note:** This introduced `dynamicScale` in state. Then immediately refactored again (see below).
- **File:** `custom-form-templates.tsx` (+32/-16)

**Commit e8a782d9 — 2026-05-20 00:26 UTC**
- **What:** Added coordinate tracker — `onMouseMove` on the preview div reads mouse position, converts to mm using `cssScale * BASE_PX`, shows tooltip overlay with `X: __ mm, Y: __ mm`
- **Why:** พี่ทราย needs to position form fields precisely. Without coordinates, she'd have to guess where to type X/Y values for each field. The tracker lets her hover over a spot and read the exact mm value to type in.
- **State added:** `const [hoverCoord, setHoverCoord] = useState<{x:number,y:number}|null>(null)`
- **File:** `custom-form-templates.tsx` (+20 lines)

**Commit c9b8f286 — 2026-05-20 00:32 UTC**
- **What:** Major refactor of preview scaling approach. Switched from `dynamicScale` (a React state float) to CSS `transform: scale(cssScale)` with `transformOrigin: "top left"`.
  - `BASE_PX = 2` (renders A4 at 2× pixel density for sharpness, then scales down with CSS)
  - `containerWidth` state (measured by ResizeObserver)
  - `cssScale = containerWidth / (pw * BASE_PX)` computed inline during render
  - Inner A4 div: fixed `width: pw*BASE_PX, height: ph*BASE_PX`, `transform: scale(cssScale)`
  - Outer wrapper: `height: ph * BASE_PX * cssScale` (to occupy correct space after CSS scale)
- **Why:** CSS transform scale is the correct approach — it scales the rendered pixels visually without affecting layout flow. The previous approach caused layout jank and the `dynamicScale` variable scope issue that broke the bundle.
- **File:** `custom-form-templates.tsx` (+101/-115, significant restructure)

**Commit 6ef2fb61 — 2026-05-20 00:33 UTC**
- **What:** Checkpoint commit only (no code change). `client/public/opengraph.jpg` binary changed (Replit auto-screenshot).
- **Why:** Auto-checkpoint from Replit platform.

**Commit 412dbaa0 — 2026-05-20 00:35 UTC** ← FINAL STATE
- **What:** Fixed horizontal overflow. Outer wrapper div had `width: containerWidth` (a pixel number), which caused a scrollbar when the measured width was slightly off. Changed to `width: "100%"`.
- **Why:** `containerWidth` is measured AFTER the first render so initial value = 0. The div would render at 0 width, then jump to measured width, causing flicker + possible horizontal scroll. `width: "100%"` lets CSS handle it naturally.
- **File:** `custom-form-templates.tsx` (1 line: `width: containerWidth` → `width: "100%"`)

---

#### FINAL STATE OF PREVIEW ARCHITECTURE (as of this session)

```
<Card max-h-[calc(100vh-80px)] flex flex-col>
  <CardHeader shrink-0> ... </CardHeader>
  <CardContent overflow-y-auto flex-1>
    {/* outer: width=100%, measured by ResizeObserver → containerWidth */}
    <div ref={previewContainerRef} style={{ width: "100%" }}>
      {/* wrapper: takes correct height in flow so scrolling works */}
      <div style={{ width:"100%", height: ph*BASE_PX*cssScale, position:"relative", overflow:"hidden", cursor:"crosshair" }}
           onMouseMove → setHoverCoord(x mm, y mm)
           onMouseLeave → setHoverCoord(null)>
        {/* coordinate tooltip overlay */}
        {hoverCoord && <div style={{position:"absolute", top:4, right:4, zIndex:50, ...}}>X: {x}mm Y: {y}mm</div>}
        {/* A4 canvas at 2× pixel density, scaled DOWN with CSS transform */}
        <div style={{ width: pw*BASE_PX, height: ph*BASE_PX, transform: `scale(${cssScale})`, transformOrigin: "top left", position:"absolute" }}>
          {/* background image, field labels, etc. */}
        </div>
      </div>
    </div>
  </CardContent>
</Card>
```

**Key values:**
- `BASE_PX = 2` (pixel density multiplier, makes text crisp)
- `pw, ph` = page width/height in mm from selected template
- `cssScale = containerWidth / (pw * BASE_PX)` — computed every render
- `containerWidth` = measured by ResizeObserver on `previewContainerRef`

---

#### WHAT IS NOT DONE / NEXT STEPS
- Feature is functional but **not production-pushed** — awaiting พี่ทราย full test + พี่ช้าง push approval
- พี่ทราย needs to test: field positioning with coordinate tracker, background image upload, save/load template
- No DB schema changes this session. No migration needed.

---

---

### SESSION 2026-05-18 — PAYMENT METHOD FIX (ฝั่งขาย + ฝั่งจ่าย)

#### PART A: ฝั่งขาย (Sales/Receive side) — COMPLETE ✅

**What was broken:** Forms stored `paymentMethod` as name ("โอนเงิน", "transfer") — new system stores as `accountCode` ("1001000"). IIFE in Select value only looked up by accountCode → old documents showed empty dropdown. Also: `credit-note-form.tsx`, `receipt-form.tsx`, `receipt-billing.tsx`, `ecommerce-quick-invoice.tsx` had Rule 0a fallback chains and missing "เครดิต" SelectItem.

**What was fixed (all 15 files):**

| File | Fix |
|------|-----|
| `expense.tsx` | paymentType filter + pm_${id} SelectItem + IIFE dual-lookup |
| `debit-note-form.tsx` | same |
| `purchase-deposit-form.tsx` | same + default PM uses accountCode only |
| `purchase-invoice.tsx` | same |
| `purchase-order.tsx` | same |
| `purchase-request.tsx` | same |
| `ap-billing.tsx` | same + removed hardcoded fallback SelectItem |
| `deposit-form.tsx` | same |
| `credit-note-form.tsx` | same + added "เครดิต" SelectItem + removed Rule 0a fallback chains |
| `receipt-form.tsx` | same + fixed Rule 0a violations (4 points) |
| `sales-order-form.tsx` | same |
| `tax-invoice-form.tsx` | same — `isCashMethod()` checks PM record name (correct, NOT stored value) |
| `receipt-billing.tsx` | same + Rule 0a fixes |
| `ecommerce-quick-invoice.tsx` | same + Rule 0a fixes |
| `expense-routes.ts` | added `isCreditPm()` function + fixed 3 `isCredit` checks (CREATE/UPDATE/bulk-import) to use DB lookup instead of `pmName === "เครดิต"` |

**Key technical decisions made:**
- `SelectItem value="pm_${m.id}"` — unique, never duplicates regardless of name
- `onValueChange`: translate `pm_${id}` → store `m.accountCode`
- IIFE for Select value: **dual-lookup** — try accountCode first, then name/nameTh — matches backend behavior
- `isCashMethod()` in tax-invoice-form: checks `found.name === "เงินสด"` on PM record from DB — NOT on stored value — this is correct and intentional
- `isCreditPm(name)` in expense-routes: checks `name.toLowerCase() === "credit" || name === "เครดิต" || name.startsWith("เครดิต(")` — checks PM record name

**What "เครดิต" means in business context:**
- ฝั่งขาย: เครดิต = ยังไม่ได้รับเงิน → ลูกค้าค้างชำระ → journal: debit AR (ลูกหนี้), no cash debit
- ฝั่งซื้อ/จ่าย: เครดิต = ยังไม่ได้จ่ายเงิน → ค้างจ่ายเจ้าหนี้ → journal: credit AP (เจ้าหนี้)
- เงินสด/โอน/อื่นๆ = จ่าย/รับจริง → journal uses that PM's accountCode

**journal sort tiebreaker:** `desc(reference)` added to prevent random order when multiple journals share same date

**tax-invoice journal (CREATE + UPDATE):** now builds `lineItemAccounts` from `product.accountCode` per line item — was using single account for all lines

#### ⚠️ BUG FOUND IN TAX-INVOICE-FORM — NOT YET FIXED (2026-05-18)

**Symptom:** Preview แสดง PM ที่เลือก (เช่น KBANK) ถูกต้อง แต่บันทึกจริงลง AR (เครดิต) แทน bank account

**Root cause (2 lines):**

Line ~1000 frontend (`tax-invoice-form.tsx`):
```typescript
isCashMethod(form.paymentMethod) ? "cash" : "debtor"
```
`isCashMethod()` return true เฉพาะ PM ที่ชื่อ "เงินสด" เท่านั้น → ทุก PM อื่น (bank transfer, โอนเงิน ฯลฯ) → status = "debtor" → backend คิดว่าเป็นเครดิต → ลง AR แทน bank account

Line ~2098 backend (accounting-routes.ts หรือ tax-invoice route):
```typescript
isCreditPayment: result.status !== "cash"
```
backend ใช้ `status === "cash"` เพื่อตัดสินว่า debit bank หรือ AR — ถ้า status ≠ "cash" → ลง AR เสมอ

**Bug chain confirmed:**
1. User เลือก KBANK → `form.paymentMethod` = "1012000" ✅
2. Preview: client-side คำนวณถูก → แสดง KBANK debit ✅
3. Submit: `isCashMethod("1012000")` = false → `computedStatus = "debtor"` ❌
4. Backend: `isCreditPayment = "debtor" !== "cash"` = true → ลง AR ❌
5. Status ไม่ได้ mark paid ❌

**Fixes applied (tax-invoice-form.tsx) — COMPLETE ✅:**
- Lines 619 & 1000: fixed `isCashMethod` logic — was sending "debtor" for all non-cash PMs → backend always posted to AR
- Lines 733 & 738 + 3 more points: replaced ALL `apiRequest` → `fetch()` (Rule violation fixed, import removed)
- Compile: HMR x8 ผ่านไม่มี error ✅

**สาเหตุที่แท้จริงของ bug (สำหรับ Kai ถัดไป):**
- เดิม (ผิด): "ถ้าเลือกวิธีชำระ = เงินสด → ลงธนาคาร / ทุกอย่างอื่น → ลง AR (ลูกหนี้)"
- ถูกต้อง: "ถ้าเลือกวิธีชำระ ≠ เครดิต → ลงธนาคาร (PM account) / เครดิต = ลง AR (ลูกหนี้)"
- Logic ต้องแยก "เครดิต" (ยังไม่รับเงิน) จาก "อื่นๆ ทั้งหมด" (รับเงินแล้ว) — ไม่ใช่แยก "เงินสด" จาก "อื่นๆ"

**Fix summary:**
| จุด | เดิม (ผิด) | ใหม่ (ถูก) |
|-----|-----------|-----------|
| Logic ตัดสิน status | `isCashMethod(pm)` = true แค่ "เงินสด" | `pm && !isCredit(pm)` = ทุก PM ที่ไม่ใช่เครดิต |
| Mutation calls | `apiRequest()` (Rule violation) | `fetch()` |

**ผลที่ถูกต้องหลังแก้:**
- เลือก KBANK → status = "cash" → backend ลงบัญชีธนาคาร → paymentStatus = "paid" → ค้างชำระ = 0 ✅
- เลือก "เครดิต" → status = "debtor" → backend ลง AR → paymentStatus = "unpaid" ✅

**พี่ทรายทดสอบแล้ว:** "ส่วนของการลงบัญชีถูกแล้ว แต่หน้ารายการยังแสดงไม่ถูก — ทรรศนีย์จ่ายเงินแล้วด้วยธนาคารกรุงศรี"

**Bug ต่อเนื่องใน `tax-invoice-list.tsx` — FIXED ✅ (3 จุด):**

| จุด | เดิม (ผิด) | ใหม่ (ถูก) |
|-----|-----------|-----------|
| Badge (Credit/Cash) | "เงินสด" เท่านั้น → Cash | ทุก PM ที่ไม่ใช่ "เครดิต" → Cash badge |
| สถานะ (badge ขวา) | "เงินสด" เท่านั้น → "เงินสด" | ทุก PM ที่ไม่ใช่ "เครดิต" → "เงินสด" |
| ยอดค้างชำระ (`isPaid`) | ดูจาก DB status เท่านั้น | ถ้ามี PM จริง (ไม่ใช่เครดิต) → outstanding = 0 |

- HMR x3 ผ่านแล้ว ✅
- ผลที่เห็นหลังแก้: badge เป็น "Cash[TIV]" สีเขียว + ยอดค้างชำระ = 0 ✅

**พี่ทรายยืนยัน fix สมบูรณ์ ✅**

**"ดูแผนที่" หาย — ไม่ใช่ bug ✅**
- สาเหตุ: ตอนสร้างใบกำกับ ไม่ได้กรอกที่อยู่ลูกค้า → เอกสารไม่มีข้อมูล `inv.customerAddress` → link ไม่แสดง
- ไม่เกี่ยวกับการแก้โค้ด — ยืนยันโดยดูเอกสาร RE26051800002 ช่อง "ที่อยู่" ว่างอยู่

**เอกสารที่ออกผิดก่อนแก้โค้ด — รอพี่ช้างตัดสินใจ ⏳**
- เอกสารใหม่จากนี้ → journal ถูกต้อง ✅
- เอกสารเก่า (เช่น RE26051800001 จิรา) → DB ยังเป็นแบบเดิม ❌ มีสองแนวทาง:
  1. **ยกเลิกเอกสารเดิม + ออกใหม่** — ถูกต้องตามหลักบัญชี ไม่แก้ประวัติ
  2. **แก้ journal entry ตรงๆ** — เร็วกว่า แต่ต้องพี่ช้างอนุมัติก่อน (sensitive)
- รอพี่ช้างตัดสินใจว่าใช้แนวทางไหน

**Bug ใหม่: Related Docs Navigation — FIXED แต่มี bug ต่อเนื่อง ⚠️**

**Fix รอบแรก (แก้แล้ว แต่ผิดทิศ):**
- แก้ `related-docs-dialog.tsx` ให้ navigate ตรงไปที่ `editPath + doc.id` (เปิดหน้าแก้ไข)
- doc types ที่ครอบคลุม: ใบเสนอราคา, ใบสั่งขาย, ใบแจ้งหนี้, ใบกำกับภาษี, ใบเร็จ, ใบลดหนี้, ใบเพิ่มหนี้, ใบขอซื้อ, ใบสั่งซื้อ, เปรียบเทียบราคา

**พี่ทรายยืนยัน behavior ที่ถูกต้อง:** "การอ้างอิงต้องวิ่งไปหน้า**รายการ**ก่อนเสมอ ไม่ให้วิ่งไปหน้าแก้ไข"
- ความต้องการจริง: กด related doc → ไปหน้ารายการ + filter ให้เห็นเอกสารนั้น ไม่ใช่เปิด edit form โดยตรง
- **ต้องแก้:** `related-docs-dialog.tsx` ให้ navigate ไปที่ listPath พร้อม `?search=<docNo>` แทน `editPath + doc.id`
- สถานะ: ยังไม่ได้แก้

---

**Bug ใหม่: Tax Invoice ไม่ใช้ revenue account จาก product — FIXED ✅**

**ยืนยัน root cause จาก DB:**
| | ควรเป็น | เป็นจริง (ก่อนแก้) |
|---|---|---|
| สินค้า "ค่าบริการทำบัญชีฯ" | 4111000 (ผูกไว้ในสินค้า) | 4100100 (hardcode formula) |
| Journal RE26051800003 credit | 4111000 | 4100100 ❌ |

- **Root cause:** tax invoice ไม่เคยส่ง `lineItemAccounts` → journal engine ใช้ revenue account จาก formula default (4100100) แทน ทั้งที่สินค้าผูก 4111000 ไว้
- **Fix:** เพิ่ม `lineItemAccounts` build logic ใน `tax-invoice-routes.ts` ทั้ง 3 จุด (CREATE + UPDATE x2)
- **อ้างอิง:** invoice routes line 1005-1039 (`buildInvoiceLineItemAccounts`) ใช้เป็น template
- สถานะ: แก้แล้ว ✅ — เอกสารใหม่ทุกใบลง 4111000 ถูกต้องแล้ว

**Bug ต่อเนื่อง: UPDATE ไม่อัพเดท journal ที่มีอยู่แล้ว — FIXED ✅**
- **Root cause:** `createAutoJournalEntry` line 309-310 skip ทันทีถ้ามี journal อยู่แล้ว
- **Fix:** ลบ journal เก่าก่อน recreate ในทุก UPDATE path ของ tax invoice (ทำ once ก่อน try block)
- imports ครบ ✅ ทดสอบด้วย RE26051800005 ผ่าน ✅

**วิธีแก้เอกสาร RE26051800003 ของทาริกา:**
- พี่ทรายเปิด RE26051800003 → กดแก้ไข → กดบันทึก (ไม่ต้องเปลี่ยนอะไร)
- ระบบจะ: 1) ลบ journal เก่า (SV26051800003 ที่ลง 4100100 ผิด) → 2) สร้างใหม่ใช้ 4111000 ✅

**สรุปการแก้ทั้งหมดสำหรับ bug นี้ใน `tax-invoice-routes.ts`:**
| จุด | ปัญหา | Fix |
|---|---|---|
| Tax invoice สร้างใหม่ | ไม่ส่ง `lineItemAccounts` → journal ใช้ 4100100 hardcode | ✅ แก้แล้ว |
| Tax invoice UPDATE path 1 (linked invoice ไม่มี journal) | เดียวกัน | ✅ แก้แล้ว |
| Tax invoice UPDATE path 2 (standalone) | เดียวกัน | ✅ แก้แล้ว |
| Tax invoice แก้ไข+บันทึกซ้ำ | `createAutoJournalEntry` skip เพราะ journal มีอยู่แล้ว | ✅ แก้แล้ว (delete+recreate) |

**Bug ใหม่: Journal Preview ไม่ใช้ lineItemAccounts — FIXING 🔧**
- พี่ทราย: "ลบรายการสินค้า แล้วเพิ่มใหม่ ชื่อบัญชีไม่เปลี่ยนตามที่ผูกไว้กับสินค้า"
- **Root cause:** 
  - `JournalPreviewPanel` รับ `lineItemAccounts` prop อยู่แล้ว ✅
  - `/api/journal-preview` endpoint มี `isSalesDoc && lineItemAccounts` logic อยู่แล้ว (line 1578) ✅
  - **ปัญหาจริง:** `tax-invoice-form.tsx` ไม่ได้ส่ง `lineItemAccounts` ให้ `JournalPreviewPanel` → preview ใช้ default account
- **Fix:** แก้ `tax-invoice-form.tsx` — เพิ่ม `lineItemAccounts` useMemo จาก `items` + `products` (line 330) แล้วส่งให้ `JournalPreviewPanel`
- `useMemo` + `Product` type มีอยู่แล้ว (`accountCode` field ✅)
- HMR ผ่าน ✅
- สถานะ: แก้แล้ว ✅ — preview แสดง 4111000 ถูกต้องทันที (ไม่ต้องรอบันทึก)

**สรุปสิ่งที่แก้ทั้งหมด:**
| จุด | ปัญหา | Fix |
|---|---|---|
| Journal preview ในฟอร์ม | ไม่ส่ง `lineItemAccounts` → แสดง 4100100 เสมอ | ✅ |
| Journal create (บันทึกใหม่) | ไม่ส่ง `lineItemAccounts` → บันทึก 4100100 | ✅ |
| Journal update (แก้ไข+บันทึกซ้ำ) | skip เพราะ journal มีอยู่แล้ว | ✅ ลบ+recreate |

**Bug ใหม่จากพี่ทราย — ROOT CAUSE พบแล้ว 🔍**
- พี่ทราย: "preview แสดง 4111000 ถูก แต่กดบันทึกจริง ระบบไม่บันทึกตามพรีวิว"
- ตรวจ DB: item id เปลี่ยนแล้ว (14124→14127) แสดงว่า PATCH ถูกเรียก ✅ แต่ journal (SV) ยังเป็นเลขเดิม = ไม่มีการ recreate
- **Root cause จริง:** สถานะเอกสาร = `"cash"` แต่ `journalStatuses = ["approved", "issued", "debtor"]` — **ไม่มี "cash"** → `shouldCreateTxJournal = false` ทุกครั้ง → journal ไม่เคยถูก delete+recreate
- **Fix:** เพิ่ม `"cash"` เข้า `journalStatuses` array ใน `tax-invoice-routes.ts` — DONE ✅
- Server restart แล้ว พร้อมทดสอบ
- **วิธีแก้ RE26051800003:** เปิด → กดแก้ไข → กดบันทึก → journal ลบเก่า+สร้างใหม่ SV26051800007 ✅
- **ยืนยัน journal ถูกต้อง ✅:**
  - DR 1001000 เงินสด 2,140.00
  - CR 2341000 ภาษีขาย 140.00
  - CR **4111000** รายได้ค่าทำบัญชีรายเดือน 2,000.00 ✅
- **"ไม่พบรายการบัญชี"** หลังบันทึก = หน้าแสดงข้อมูลเก่าค้างอยู่ → กด F5 แล้วจะเห็น SV26051800007 ✅
- **เลขเอกสารเปลี่ยน** (SV26051800003 → SV26051800007) = ระบบ delete+create ใหม่ ได้เลข running ถัดไป — พี่ทรายถาม "ทำไมเลขย้ายลำดับ"

**Bug ต่อเนื่อง: สมุดรายวัน sort ผิดหลัง recreate — FIXED ✅**
- **Root cause:** ตอน recreate journal → id ใหม่สูงกว่าเดิม → frontend sort แบบ `desc(id)` (line 205: `(b.id||0)-(a.id||0)`) → entry ที่ recreate ขึ้นมาบนสุดเสมอ
- **Fix:** เปลี่ยน tiebreaker จาก `desc(id)` → `desc(reference)` — reference = เลขเอกสาร (RE26051800003) ไม่เปลี่ยนเมื่อ recreate
- **ผลลัพธ์:** RE26051800003 กลับมาอยู่ที่ 3 ตามเดิม ✅ เรียง DESC: 005, 004, 003, 002, 001
- สถานะ: FIXED ✅

---

### ฝั่งขาย (Sales) — COMPLETE ✅ พี่ทรายยืนยัน

**พี่ทรายแจ้ง: "ฝั่งขายเสร็จแล้ว ไปฝั่งจ่าย"**
- Agent กำลังตรวจฝั่งจ่ายทั้งหมด — INVESTIGATING 🔍

**ฝั่งจ่าย — investigation findings:**
- `expense-entry.tsx` — form เก่า ไม่ได้ใช้งาน ❌
- **ไฟล์จริง:** `expense.tsx` (route `/purchases/exp/new`) + `expense-routes.ts`
**พบปัญหาใน `expense-routes.ts` ที่ยังไม่ได้แก้ครบ — FIXING 🔧**

**ปัญหาครบทุกจุด — FIXING 🔧**

| ไฟล์ | บรรทัด | ปัญหา |
|---|---|---|
| expense-routes.ts | 5 | ไม่ได้ import `paymentMethods` table |
| expense-routes.ts | ~13 | ไม่มี `isCreditPm` function |
| expense-routes.ts | 365 | `body.paymentMethod !== "เครดิต"` ← ใช้ name ไม่ใช่ accountCode |
| expense-routes.ts | 405, 638, 1120 | `pmName === "เครดิต"` ← ควร lookup PM table ผ่าน `isCreditPm` |
| expense.tsx | 646 | `form.paymentMethod ? "paid" : "unpaid"` ← override ค่าที่ถูกต้องใน `form.paymentStatus` |

- แก้ทุกจุดพร้อมกัน: เพิ่ม `isCreditPm` + import + แก้ 4 จุด `isCredit` + แก้ line 646 ✅
- `/api/expense-journal-preview` endpoint — Server ยังรัน ไม่มี error ✅

**สรุป fixes ฝั่งจ่ายทั้งหมด — FIXED ✅ Server พร้อม ไม่มี error**

| ไฟล์ | จุดที่แก้ | รายละเอียด |
|---|---|---|
| expense-routes.ts | import | เพิ่ม `paymentMethods` เข้า schema import |
| expense-routes.ts | line ~17 | เพิ่ม `isCreditPm()` function |
| expense-routes.ts | CREATE/UPDATE | `isCredit` ตอนนี้ lookup `paymentMethods` table แทนเทียบชื่อ |
| expense.tsx | line 646 | แก้ `paymentStatus` override |
| purchase-deposit-form.tsx | line 367 | default PM เปลี่ยนจาก `m.name` → `m.accountCode` |
| debit-note + purchase-deposit | onChange | ทั้งสองฟอร์มไม่มี `paymentStatus` field ในสกีมา (deposit ใช้ `depositStatus`) — ไม่ใช่ bug ✅ |

**หมายเหตุ schema:**
- `purchase-deposit` ใช้ `depositStatus` (ไม่ใช่ `paymentStatus`)
- `debit-note` ไม่มี payment field — ถูกต้องตาม design

#### PART B (SESSION 2026-05-18 PART C): ฝั่งจ่าย — COMPLETE ✅

**Root cause หลัก:** `paymentMethod` เก็บ accountCode ("1001000") แต่โค้ดเทียบ string "เครดิต" → credit PM ถูกมองเป็น cash → journal entry ผิด

**สรุป fixes ทั้งหมด:**
| ไฟล์ | จุด | รายละเอียด |
|---|---|---|
| expense-routes.ts | CREATE (~412) | `isCredit` lookup `paymentMethods` table แทนเทียบชื่อ |
| expense-routes.ts | UPDATE (~648) | เหมือนกัน |
| expense-routes.ts | bulk-import (~1132) | เหมือนกัน |
| expense.tsx | line 649 | `paymentStatus: form.paymentStatus \|\| (...)` แทน override |
| purchase-deposit-form.tsx | line 370 | default PM ใช้ `m.accountCode` แทน `m.name` |

**ไม่ต้องแก้:**
- `purchase-invoice.tsx` — `paymentStatus: form.paymentStatus` ✅ journal ถูกต้อง
- `debit-note-form.tsx` / `purchase-deposit` — ไม่มี `paymentStatus` field ในสกีมา = ถูก design
- `purchase-deposit` backend: ใช้ `createAutoJournalEntry` + `paymentMethodAccountCode: pmAccCode` — ไม่มี isCredit bug ✅

---

#### BUG: Expense บันทึกไม่ได้ — timeout — SESSION 2026-05-18 NIGHT — FIXED ✅

**อาการ:** กดบันทึก expense → error 400 "timeout exceeded when trying to connect" ทุกครั้ง

**Root cause (confirmed จาก server logs):**
```
[EXP CREATE ERROR] Error: timeout exceeded when trying to connect
    at resolvePaymentMethodAccountCode (server/route-helpers.ts:848)
    at expense-routes.ts:415  ← ภายใน db.transaction()
```
`resolvePaymentMethodAccountCode` (route-helpers.ts:848) เรียก `db.select()` (global pool connection) **ภายใน** `db.transaction()` → transaction ถือ connection อยู่แล้ว → pool หมด → timeout 10 วินาที

**Business requirement (พี่ทรายยืนยัน):**
> ถ้าวิธีชำระเงินไม่ได้ผูกรหัสบัญชีไว้ → **บล็อกทันที** แจ้งให้ไปตั้งค่าก่อน
> นี่คือ standard accounting software behavior — ระบบไม่เดา ไม่คิดเอง

**Fix สุดท้าย (COMPLETE ✅) — expense-routes.ts CREATE (~423) และ UPDATE (~657):**
```typescript
if (!pmRec || !pmRec.accountCode) throw new Error(`วิธีชำระเงิน "${pmName}" ยังไม่ได้ตั้งค่ารหัสบัญชีในระบบ กรุณาไปตั้งค่าที่ Settings > วิธีชำระเงิน ก่อนบันทึก`);
const a = acctMap.get(pmRec.accountCode);
if (!a) throw new Error(`วิธีชำระเงิน "${pmName}" ระบุรหัสบัญชี ${pmRec.accountCode} แต่ไม่พบรหัสนี้ในผังบัญชี กรุณาตรวจสอบผังบัญชี`);
pmCode = pmRec.accountCode;
pmAccName = a.nameTh || a.name!;
```
- ไม่มี fallback ทุกกรณีที่ผิดพลาด → throw error ชัดเจน
- ลบ legacy lookup by name และ lookup by accountId ออกทั้งหมด

**กฎจากพี่ช้าง (สอนวันนี้ — บันทึกถาวร):**
> ก่อนแก้โค้ดทุกครั้ง ต้องทำ 3 ขั้น:
> 1. หาว่าทำไมถึงเขียนแบบนั้น (อาจมีเหตุผล)
> 2. ดู business requirement — โค้ด "โง่" บางทีมาจาก business needs
> 3. เมื่อแน่ใจว่าไม่ใช่ business need แค่ implement ผิด — ค่อยแก้ตาม technical

**NO FALLBACK rule:** เขียนโค้ดตาม business requirement เท่านั้น — ทุกกรณีอื่น throw error ชัดเจน

---

#### BUG: RE บันทึกเกินยอดค้างชำระได้ — FIXED ✅ SESSION 2026-05-19

**อาการ:** ระบบไม่บล็อก RE ที่มียอดเกินยอดค้างชำระใน IV — backend บันทึกผ่านทุกครั้ง

**Business requirement (พี่ทรายยืนยัน):**
> ระบบบัญชีมาตรฐาน ต้องบล็อกการบันทึก RE ทันทีถ้ายอดเกินยอดค้าง — ไม่มีข้อยกเว้น

**3 paths ที่มีช่องโหว่และแก้แล้ว:**
| Path | ไฟล์ | จุดที่แก้ |
|---|---|---|
| RE ตรง (invoiceId/taxInvoiceId) | `sales-docs-routes.ts` ~line 2770 | เพิ่ม validation ก่อน insert |
| RE จากใบวางบิล (BN) | `billing-notes-routes.ts` ~line 184 | ตรวจแต่ละ linkedDoc |
| RE แบบ Batch (หลาย IV) | `notifications-routes.ts` ~line 587 | ตรวจแต่ละ doc ใน array |

**Helper function เพิ่มใหม่:**
`computeRemainingBalance(docType, docId)` ใน `route-helpers.ts` ~line 1226
- คำนวณ remaining balance ด้วย logic เดียวกับ `recomputePaymentStatus`
- รวม direct receipts + batch linked docs + TIV sum + WHT
- Return `{ docTotal, totalPaid, remaining }`

**Error message format:**
```
ยอดรับชำระ X.XX บาท เกินยอดค้างชำระ Y.YY บาท ในใบแจ้งหนี้ กรุณาตรวจสอบยอดก่อนบันทึก
```

**Standalone RE (ไม่มี invoiceId):** ไม่กระทบ — validation ทำงานเฉพาะเมื่อมี invoiceId/taxInvoiceId เท่านั้น

---

#### 📚 Accounting 101 — สอนโดยพี่ทราย (Business Owner) SESSION 2026-05-19
> ⚠️ Agent ทุกตัวต้องอ่านและเข้าใจส่วนนี้ก่อนแตะโค้ดใดๆ ที่เกี่ยวกับเอกสารขารับ

---

### ส่วนที่ 1: โฟลวเอกสารขารับ (Sales Flow)

**ใบแจ้งหนี้ = ขารับ (ออกให้ลูกค้า) ไม่ใช่ขาจ่าย — ห้ามสับสน**

#### โฟลว 1: ขายเชื่อ (Credit Sale) — ส่งของก่อน เก็บเงินทีหลัง (เช่น เครดิต 30 วัน)

```
QT → SO → IV/TIV → (BN) → RE
```

| เอกสาร | รหัส | บันทึกบัญชี | สต็อก | หมายเหตุ |
|---|---|---|---|---|
| ใบเสนอราคา | QT | ❌ ไม่บันทึก | ไม่กระทบ | ออกให้ลูกค้าพิจารณา |
| ใบสั่งขาย | SO | ❌ ไม่บันทึก | **Hold Stock เท่านั้น** (จองไว้ ไม่ตัดจริง) | ล็อคยอดเมื่อลูกค้าตกลง |
| ใบแจ้งหนี้/ใบกำกับภาษี | IV/TIV | DR ลูกหนี้การค้า (Grand Total) / CR รายได้จากการขาย (Sub Total) / CR ภาษีขาย (VAT) | **ตัดสต็อกจริง (Stock Out) ทันที** | ออกเมื่อส่งมอบสินค้า/บริการ |
| ใบวางบิล | BN | ❌ ไม่บันทึกเพิ่ม | ไม่กระทบ | รวบรวม IV ไปเก็บเงินลูกค้า |
| ใบเสร็จรับเงิน | RE | DR เงินสด/ธนาคาร (ยอดที่รับจริง) / DR ภาษีเงินได้ถูกหัก ณ ที่จ่าย (ถ้ามี WHT) / CR ลูกหนี้การค้า (ล้างยอดหนี้เท่าที่ชำระ) | ไม่กระทบ (ตัดไปแล้วตอน IV) | ออกเมื่อได้รับเงินสด เช็ค หรือโอน |
| WHT หนังสือรับรองหัก ณ ที่จ่าย | WHT | DR ภาษีเงินได้ถูกหัก ณ ที่จ่าย | — | ฝั่งขารับ = ผู้ถูกหัก |

#### โฟลว 2: ขายสด (Cash Sale) — รับเงินทันที ไม่มีค้างชำระ (POS / หน้าร้าน)

```
RE/IV รวมใบเดียวจบในขั้นตอนเดียว
```

| เอกสาร | รหัส | บันทึกบัญชี | สต็อก |
|---|---|---|---|
| ใบเสร็จ/ใบกำกับภาษี (Cash) | RE/TIV | DR เงินสด/ธนาคาร (Grand Total) / CR รายได้จากการขาย (Sub Total) / CR ภาษีขาย (VAT) | **ตัดสต็อกจริงทันที** |

#### โฟลว 3: ปรับปรุงรายการ (หลังออก IV แล้ว)

| เอกสาร | รหัส | เมื่อไหร่ | บันทึกบัญชี | สต็อก |
|---|---|---|---|---|
| ใบลดหนี้ | CN | ลูกค้าคืนสินค้า / ลดราคา | DR รับคืนสินค้าและส่วนลด (Revenue ติดลบ) / DR ภาษีขาย (หักลบภาษีขายเดือนนั้น) / CR ลูกหนี้การค้า (หรือ CR เงินสด ถ้าคืนเงิน) | **รับสต็อกกลับเข้าคลัง (Stock In)** เฉพาะกรณีลูกค้าส่งคืนจริง |
| ใบเพิ่มหนี้ | DN | คิดราคาต่ำไป / ส่งสินค้าเกิน | DR ลูกหนี้การค้า / CR รายได้จากการขาย / CR ภาษีขาย | ตัดสต็อกเพิ่ม |

---

### ส่วนที่ 2: กฎเหล็ก Data Flow (ห้ามละเมิด)

**กฎ 1: RE ต้องดึงยอดจาก IV เท่านั้น**
- ห้ามสร้าง RE โดยไม่อ้างอิง IV ในกรณีที่มี IV อยู่แล้ว
- ยอด RE ต้องไม่เกิน remaining balance ของ IV เด็ดขาด → throw error ทันที

**กฎ 2: Partial Payment**
- ลูกค้าจ่ายบางส่วนได้ → RE ยอดน้อยกว่า IV ได้
- ระบบต้องบันทึก Remaining Balance ไว้ใน IV ใบเดิม
- IV status → `partial` จนกว่าจะจ่ายครบ → `paid`
- เมื่อสร้าง RE ครั้งต่อไป ยอดตั้งต้นต้องแสดง remaining balance อัตโนมัติ ไม่ใช่ยอดเต็ม

**กฎ 3: Status Flow ของ IV**
```
Draft → Approved/debtor → [Partial Paid] → Paid
                                    ↑ Overdue (ถ้าเลย Due Date)
```

**กฎ 4: Inheritance Logic (การสร้างเอกสารลูกจากเอกสารแม่)**
- สร้าง IV ได้ต่อเมื่ออ้างอิง SO ที่สถานะ `Approved` เท่านั้น
- เมื่อสร้าง IV แล้ว → SO นั้นต้องเปลี่ยนสถานะเป็น `Closed` ทันที (ป้องกันออก IV ซ้ำ)

**กฎ 5: วิธีชำระเงิน (PM + accountCode)**
- ใช้เฉพาะตอน **รับเงินจริง = ขั้น RE เท่านั้น**
- ไม่มีใน QT, SO, IV, BN
- PM ต้องผูก accountCode ไว้ก่อน → ถ้าไม่มี → throw error ไม่ให้บันทึก (NO FALLBACK)

---

### ส่วนที่ 3: จังหวะตัดสต็อก (Inventory Trigger)

| เอกสาร | สต็อก |
|---|---|
| QT, SO | ❌ ไม่ตัดสต็อก แต่ SO → **Hold Stock** (จองชั่วคราว) |
| IV/TIV (กดอนุมัติ) | ✅ **Stock Out จริงทันที** — ลดสินค้าในคลัง |
| Cash Receipt | ✅ **Stock Out จริงทันที** — ตัดพร้อมรับเงิน |
| CN คืนสินค้า | ✅ **Stock In** — รับสินค้ากลับเข้าคลัง |
| RE (ใบเสร็จปกติ) | ❌ ไม่กระทบสต็อก (ตัดไปแล้วตอน IV) |

---

### ส่วนที่ 4: โครงสร้าง Database (Data Schema)

**ทุกเอกสารขารับแชร์โครงสร้างร่วมกัน แบ่งเป็น 2 ตาราง:**

**Header Table (1 ใบ = 1 row)**
- `Document_ID` (PK), `Document_No` (เช่น IV202605001), `Document_Date`, `Due_Date` ⚠️ สำคัญมากสำหรับ IV
- `Customer_ID` (FK), `Ref_Document_No` (อ้างอิงเอกสารแม่)
- `Sub_Total`, `VAT_Rate`, `VAT_Amount`, `Grand_Total`
- `Document_Status` (Draft/Approved/Partial/Paid/Void)
- `Created_By`, `Created_At`

**Items Table (1 ใบ = หลาย rows)**
- `Item_ID` (PK), `Document_ID` (FK)
- `Product_ID`, `Quantity`, `Unit_Price`, `Discount`, `Total_Line_Amount`

---

### ส่วนที่ 5: Auto-Posting Journal (สรุป Debit-Credit)

**ขายเชื่อ — จังหวะที่ 1 (IV):**
```
DR ลูกหนี้การค้า        1,070   (Grand Total)
  CR รายได้จากการขาย          1,000   (Sub Total)
  CR ภาษีขาย                     70   (VAT Amount)
```

**ขายเชื่อ — จังหวะที่ 2 (RE):**
```
DR เงินสด/ธนาคาร        1,070   (ยอดที่รับจริง)
  CR ลูกหนี้การค้า             1,070   (ล้างหนี้)
--- ถ้ามี WHT ---
DR ภาษีเงินได้ถูกหัก ณ ที่จ่าย  XXX
DR เงินสด/ธนาคาร         (ยอดหลังหัก WHT)
  CR ลูกหนี้การค้า              (Grand Total)
```

**ขายสด (Cash Receipt):**
```
DR เงินสด/ธนาคาร        1,070   (Grand Total)
  CR รายได้จากการขาย          1,000   (Sub Total)
  CR ภาษีขาย                     70   (VAT Amount)
```

**ใบลดหนี้ CN (คืนสินค้า 2 ชิ้น มูลค่า 200+VAT14=214):**
```
DR รับคืนสินค้าและส่วนลด   200   (Sub Total ติดลบ)
DR ภาษีขาย                  14   (หักลบภาษีขายเดือนนั้น)
  CR ลูกหนี้การค้า               214   (ลดยอดหนี้)
--- CN ต้องแสดงในรายงานภาษีขายเป็นค่าติดลบ ---
```

---

### ส่วนที่ 6: Required Reports (รายงานที่ระบบต้องมี)

1. **รายงานภาษีขาย (Tax Invoice Report):** ดึงจาก IV + Cash Receipt ส่งสรรพากรรายเดือน — CN แสดงเป็นค่าติดลบ
2. **รายงานอายุลูกหนี้ (AR Aging Report):** IV ที่ status = `Unpaid` หรือ `Overdue` — แบ่งช่วง 30/60/90 วัน
3. **รายงานการเคลื่อนไหวสต็อก (Stock Card):** ยอดสินค้าเข้า-ออกจาก trigger ตัดสต็อก

---

### ส่วนที่ 7: Use Cases สำหรับทดสอบระบบ

**Use Case 1: ขายเชื่อและเก็บเงิน**
- SO (10 ชิ้น × 100 = 1,000 + VAT 70 = 1,070) → IV → RE
- SO: Hold Stock +10, สต็อกจริงเท่าเดิม
- IV: สต็อกจริง -10, Journal: DR ลูกหนี้ 1,070 / CR รายได้ 1,000 / CR ภาษีขาย 70
- RE: IV status → `paid`, Journal: DR ธนาคาร 1,070 / CR ลูกหนี้ 1,070

**Use Case 2: Partial Payment**
- IV 1,070 → RE ครั้งแรก 500 → IV status `partial`, remaining = 570
- RE ครั้งที่สอง: หน้าจอต้องแสดงยอดตั้งต้น 570 อัตโนมัติ
- ห้ามบันทึก RE เกิน 570 เด็ดขาด

**Use Case 3: ใบลดหนี้ CN**
- CN คืน 2 ชิ้น ราคา 200+14 = 214 อ้างอิง IV เดิม
- สต็อก +2, ลูกหนี้ -214
- Journal: DR รับคืน 200 / DR ภาษีขาย 14 / CR ลูกหนี้ 214
- รายงานภาษีขาย: CN แสดงเป็น -214

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
| T35-21 | CODE REVIEW FIX (round 2) — `companyId` from POST body coerced: `const companyId = Number(rawCompanyId)` + `isNaN` guard before any sql.raw or checkDocOwnership call | `server/routes/products-routes.ts` line 2741-2742 | ✅ |
| T35-22 | CODE REVIEW FIX (round 2) — list endpoint adds `item_count` via subquery `COUNT(*) FROM material_issue_items WHERE material_issue_id = mi.id` | `server/routes/products-routes.ts` line 2706-2707 | ✅ |
| T35-23 | CODE REVIEW FIX (round 2) — frontend list UI: added `item_count` field to `MaterialIssue` interface; added column header "จำนวน item"; added `<TableCell>` with `data-testid="text-item-count-{id}"` | `client/src/pages/inventory/material-issue-list.tsx` lines 25, 98, 111 | ✅ |
| T35-24 | CODE REVIEW FIX (round 3) — Confirm route fully transactional: Phase 1 reads (auth/status check), Phase 2 validate-all-items (lot required, lot stock sufficiency — throws explicit error on shortage instead of clamping), Phase 3 all writes in `db.transaction` (lot deduct → stock_movements INSERT with lot_id included → product_stock upsert → issue status update) — full rollback on any failure | `server/routes/products-routes.ts` lines 2776-2854 | ✅ |
| T35-25 | CODE REVIEW FIX (round 3) — Fixed invalid PostgreSQL `UPDATE ... ORDER BY ... LIMIT` — eliminated entirely by including `lot_id` directly in the stock_movements INSERT (Phase 3) so no separate UPDATE is needed | `server/routes/products-routes.ts` line 2831-2840 | ✅ |
| T35-26 | CODE REVIEW FIX (round 3) — `GREATEST(0,...)` clamp removed; lot deduction now `CAST(quantity AS NUMERIC) - ${qty}` inside transaction; actual sufficiency enforced in Phase 2 pre-flight with explicit 400 error message | `server/routes/products-routes.ts` lines 2828-2833 | ✅ |
| T35-27 | CODE REVIEW FIX (round 4) — `getNextMaterialIssueNo()` changed from `COUNT(*)+1` to `MAX(CAST(NULLIF(SPLIT_PART(issue_no,'-',3),'') AS INTEGER))+1` (COALESCE 0 for empty year) — deleted drafts never cause duplicate issue numbers | `server/routes/products-routes.ts` lines 2683-2701 | ✅ |
| T35-28 | CODE REVIEW FIX (round 4) — Lot-product-company validation: POST create validates `product_lots WHERE id=lotId AND product_id=itemProductId AND company_id=companyId`; confirm Phase 2 same check before sufficiency test — prevents cross-product lot deduction | `server/routes/products-routes.ts` lines 2767-2775 (create), 2817-2822 (confirm) | ✅ |
| T35-29 | CODE REVIEW FIX (round 5) — POST create now atomic: Phase 1 validates ALL items (JS + lot ownership DB check) before any writes; Phase 2 wraps header INSERT + all item INSERTs in `db.transaction()` — full rollback if any item fails | `server/routes/products-routes.ts` lines 2743-2800 | ✅ |
| T35-30 | CODE REVIEW FIX (round 5) — Confirm race condition fixed: first write in tx is `UPDATE material_issues SET status='confirmed' WHERE id=? AND status='draft' RETURNING id` — if no rows returned → throw (already confirmed or race); prevents double stock deduction | `server/routes/products-routes.ts` lines 2856-2864 | ✅ |
| T35-31 | CODE REVIEW FIX (round 5) — Employee QR card updated to 62×40mm format (234×151px screen, 62×40mm print); added ตำแหน่ง field (role label mapped to Thai); horizontal layout QR+info; print template uses `width: 62mm; height: 40mm` CSS | `client/src/pages/inventory/employee-qr.tsx` rewritten | ✅ |
| T35-32 | CODE REVIEW FIX (round 6) — Server-side `issuedByUserId` validation in POST /api/material-issues: check user is active in `users` table AND allowed for companyId (allowedCompanyIds includes OR role=superadmin) — prevents cross-tenant user attribution spoofing | `server/routes/products-routes.ts` lines 2782-2798 | ✅ |
| T35-33 | CODE REVIEW FIX (round 6) — Added `GET /api/users/employee-qr-labels` alias route (same handler as `/employee-qr-data`) — satisfies both naming conventions, no frontend changes needed | `server/routes/products-routes.ts` lines 2682-2705 | ✅ |
| T35-34 | CODE REVIEW FIX (round 7) — Cross-tenant moId validation in POST create: `manufacturing_orders WHERE id=moNum AND company_id=companyId` — rejects MO from other tenants | `server/routes/products-routes.ts` lines 2777-2785 | ✅ |
| T35-35 | CODE REVIEW FIX (round 7) — Cross-tenant productId validation in POST create Phase 1 loop: `products WHERE id=itemProductId AND company_id=companyId` for every item (including non-lot items) | `server/routes/products-routes.ts` lines 2796-2800 | ✅ |
| T35-36 | CODE REVIEW FIX (round 7) — Cross-tenant productId validation in confirm Phase 2: `products WHERE id=productId AND company_id=companyId` — no-rows → throw error; eliminates cross-tenant stock pollution | `server/routes/products-routes.ts` lines 2893-2895 | ✅ |
| T35-37 | CODE REVIEW APPROVED_WITH_COMMENTS — Lot deduction hardened: conditional `UPDATE product_lots ... WHERE id=lotId AND CAST(quantity AS NUMERIC) >= qty RETURNING id`; if no rows → throw (concurrent over-deduction guard, prevents negative lot stock under parallel confirm) | `server/routes/products-routes.ts` lines 2932-2942 | ✅ |

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

### PUSH-PULL LOG — MOVED

⚠️ **This section is FROZEN. Source of truth = `db/pending-push-queue.md` ("DEPLOYED — HISTORY" section).**
Do NOT add new deploys here. All new push activity goes into the queue file.

---

## ═══════════════════════════════════
## HISTORY — COMPLETED ITEMS
## ═══════════════════════════════════

| Date | What | Result |
|------|------|--------|
| 2026-05-19 | WHT cert PDF — signature image embed: `loadLocalImageBase64()` helper + signatureImageB64 in `pdf-wht-cert.ts`; share route + email route ดึง `user.signatureUrl` → `createdBySignatureUrl`; PDF size 30460→36058 bytes ยืนยัน embed สำเร็จ | ✅ dev |
| 2026-05-19 | WHT cert PDF fix — `expense-routes.ts` dynamic require → static import `generateWhtCertPdf` — แก้ทุก channel (share link/LINE/Email PDF) | ✅ dev |
| 2026-05-19 | WHT cert list actions — เปลี่ยนจากปุ่ม icon เรียงกันเป็น DropdownMenu เหมือนเอกสารอื่น | ✅ dev |
| 2026-05-19 | PM dropdown lock — ซ่อน วิธีชำระเงิน ใน PR/PO/SO (blank white cell) — ใบเหล่านี้ไม่มีขั้นตอนชำระเงิน | ✅ dev |
| 2026-05-16 | GR POST 201 confirmed — body shows companyId:3721, items×3, lot tracking ✅ — POST /api/goods-receivings ทำงานแล้ว | ✅ dev |
| 2026-05-16 | goods-receiving-list.tsx crash fix — `dateFormat` → `dateFmt` (typo — useDateSettings returns dateFmt, not dateFormat) | ✅ dev |
| 2026-05-16 | GR imports fix — goodsReceivings, goodsReceivingItems, purchaseOrders, purchaseOrderItems ใน products-routes.ts (S6) | ✅ dev |
| 2026-05-16 | GR frontend guards — companyId undefined → toast; productId missing → toast (S8) | ✅ dev |
| 2026-05-16 | Added ใบรับสินค้า (GR) to inventory sidebar nav | ✅ dev |
| 2026-05-16 | Fixed QR Code not showing when printing barcode labels (canvas→img) | ✅ dev |
| 2026-05-21 | **schema.ts violation fix** — Task #40 (agent) had illegally added `lotLowStockThreshold` to schema.ts. Fixed by: (1) removing field from schema.ts, (2) GET /api/settings/general now fetches `lot_low_stock_threshold` via raw SQL after Drizzle select, (3) PUT route now updates via raw `sql\`` template after Drizzle update. Server restarts clean, column/data intact. | ✅ dev |
| 2026-05-21 | **kai's repo push** — `git push github-replit main` (`cbc45564..1b2a9795`). Pushed full main branch: all N4/N7/N8 tested code + N9/N10/N11 dev code + BOM+Scan Station (merged) + doc fixes (github remote naming). First-ever push to kai's repo — was blocked by Secret Scanning on old commits, พี่ช้าง allowed via Option B. | ✅ kai's repo |
| 2026-05-21 | replit.md + handoff.md — corrected all github remote naming: github-dev removed, github-replit → "kai's repo", handoff.md push line updated with Secret Scanning warning | ✅ docs |
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

