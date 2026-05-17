// stamp_url migration — executed 2026-05-06 ~10:30
// Reason: add stamp_url column to document_settings for company stamp image (ตรายาง) on WHT cert (ใบ 50 ทวิ) print page
// Verified: Phase 1c confirmed column exists on production DB
export async function runStampUrlMigration(_db: any) {}

/* ── CANCELLED 2026-05-07: general_settings.bot_api_key ADD COLUMN ──
 * Design changed: BOT API key moved to system_config (platform-level), not per-company.
 * Column was never pushed to production (ENTRY #002 CANCELLED).
 * DROP COLUMN handled by runDropBotApiKeyMigration below.
 *
 * export async function runBotApiKeyMigration(db: any) {
 *   try {
 *     const { sql } = await import("drizzle-orm");
 *     await db.execute(sql.raw(`ALTER TABLE general_settings ADD COLUMN IF NOT EXISTS bot_api_key TEXT`));
 *     console.log("[migration] ✅ general_settings.bot_api_key ready");
 *   } catch (e: any) {
 *     console.error("[migration] ❌ runBotApiKeyMigration FAILED:", e.message);
 *   }
 * }
 */
export async function runBotApiKeyMigration(_db: any) {}

/* ── DONE 2026-05-07: DROP general_settings.bot_api_key (ENTRY #002 reversal / ENTRY #005) ──
 * Verified on production DB: column absent, FLAG=done_2026-05-07T14:45:27.390Z ✅
 * Backup: not required (column was empty, dev-only, never reached production)
 *
 * export async function runDropBotApiKeyMigration(db: any) {
 *   const FLAG = "DROP_BOT_API_KEY_FROM_GENERAL_SETTINGS_20260507";
 *   const { sql } = await import("drizzle-orm");
 *   const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
 *   if ((flag.rows || []).length > 0) return;
 *   await db.execute(sql.raw(`ALTER TABLE general_settings DROP COLUMN IF EXISTS bot_api_key`));
 *   await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_${new Date().toISOString()}') ON CONFLICT (config_key) DO NOTHING`));
 *   console.log("[migration] ✅ general_settings.bot_api_key dropped");
 * }
 */
export async function runDropBotApiKeyMigration(_db: any) {}

/* ── DONE 2026-05-07: sales_credit_notes etax columns (ENTRY #004) ──
 * Verified: etax_sent_at, etax_sent_to, etax_sent_cc, etax_message_id — all TEXT/TIMESTAMP, nullable ✅
 * FLAG: ADD_ETAX_COLUMNS_TO_SALES_CREDIT_NOTES_20260507 = done_2026-05-07T07:09:58.365Z ✅
 * Columns confirmed on production DB (deep-main) via direct query 2026-05-07
 *
 * export async function runSalesCreditNoteEtaxMigration(db: any) {
 *   const FLAG = "ADD_ETAX_COLUMNS_TO_SALES_CREDIT_NOTES_20260507";
 *   try {
 *     const { sql } = await import("drizzle-orm");
 *     const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
 *     if ((flag.rows || []).length > 0) return;
 *     await db.execute(sql.raw(`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS etax_sent_at TIMESTAMP`));
 *     await db.execute(sql.raw(`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS etax_sent_to TEXT`));
 *     await db.execute(sql.raw(`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS etax_sent_cc TEXT`));
 *     await db.execute(sql.raw(`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS etax_message_id TEXT`));
 *     await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_${new Date().toISOString()}') ON CONFLICT (config_key) DO NOTHING`));
 *     console.log("[migration] ✅ sales_credit_notes etax columns ready");
 *   } catch (e: any) {
 *     console.error("[migration] ❌ runSalesCreditNoteEtaxMigration FAILED:", e.message);
 *   }
 * }
 */
export async function runSalesCreditNoteEtaxMigration(_db: any) {}

// runMaterialIssueMigration moved to shared/schema-extra.ts (ENTRY #009)
// Import via @shared/schema-extra in products-routes.ts
