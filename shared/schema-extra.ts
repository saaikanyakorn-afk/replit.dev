// =============================================================================
// schema-extra.ts — PURPOSE & USAGE GUIDE
// =============================================================================
// PRIMARY USE: Table definitions that cannot go in schema.ts (cherry-pick safe).
//
// SECONDARY USE: Batch operations that TOUCH existing data content.
//   When a task requires modifying existing rows (UPDATE, recalculate, re-generate)
//   and it is too much for พี่ทราย to click manually — Kai can write a one-time
//   block here. Because this CHANGES existing data, the procedure is stricter:
//
//   Procedure (must follow in order — no shortcuts):
//     1. BACKUP first — dump the target table(s) to a .sql file BEFORE any change.
//        File naming: db/backups/YYYY-MM-DD_<table>_before_<reason>.sql
//     2. UPDATE HISTORY — before the manipulation closes (before flagging done),
//        write an entry to db/schema-history.md recording:
//          - What changed (which table, which columns, what transformation)
//          - Where the backup file is (path)
//          - When it ran (datetime)
//          - Why it was needed (reason/ticket)
//     3. FLAG COMPLETED — insert the system_config flag. This is a secondary safety
//        net only — it guards the window before the clean push lands on the server.
//     4. COMMENT OUT THE BLOCK immediately with date/time/reason in the comment.
//        This is the PRIMARY prevention — once the code is gone, re-run is impossible.
//     5. PUSH CLEAN immediately — before any other step continues.
//        Do NOT move to the next task until clean code is live on the server.
//
//   Example skeleton:
//     const FLAG = "BATCH_REGENERATE_PDF_2026_XX_XX";
//     const done = await db.query.systemConfig.findFirst({ where: eq(..., FLAG) });
//     if (!done) {
//       // Step 1: backup is done MANUALLY before deploying this block
//       const invoices = await db.select().from(invoices).where(...);
//       for (const inv of invoices) { await generatePdf(inv.id); }
//       // Step 2: history entry written to db/schema-history.md before this line
//       await db.insert(systemConfig).values({ configKey: FLAG, configValue: "done" });
//     }
//
//   Rule: NEVER flag completed before backup .sql exists and history is updated.
//   Rule: NEVER leave an active batch block in production after it has run.
//   Rule: Always guard with system_config flag — idempotent, runs exactly once.
//
// TERTIARY USE: ADD COLUMN migrations for feature-specific tables.
//   When a feature needs new columns on existing tables and MUST NOT touch
//   index.ts, use this pattern (no index.ts change needed):
//
//   Pattern:
//     1. Export a migration function from this file.
//     2. Call it top-level from the most relevant route file (fires on first load).
//     3. Pure DDL (ADD COLUMN IF NOT EXISTS) needs no flag — already idempotent.
//        Pure DDL also does NOT need a backup — it only adds structure, no data loss.
//     4. If the function also does a data backfill (UPDATE existing rows), that part
//        MUST follow the full SECONDARY USE procedure:
//          a. Backup target table to db/backups/YYYY-MM-DD_<table>_before_<reason>.sql
//          b. Update db/schema-history.md (what/where/when/why)
//          c. THEN insert the system_config flag to close the backfill.
//     5. After production verified: comment out the block with date/time/reason.
//
//   Example skeleton:
//     export async function runXxxColumnsMigration(db: any) {
//       // Pure DDL — no flag, no backup needed
//       await db.execute(sql.raw(`ALTER TABLE xxx ADD COLUMN IF NOT EXISTS col TEXT`));
//       // Data backfill — backup + history MUST exist before this block runs
//       const FLAG = "BACKFILL_XXX_YYYY-MM-DD";
//       const done = await db.execute(sql`SELECT 1 FROM system_config WHERE config_key = ${FLAG}`);
//       if (!(done.rows || []).length) {
//         // backup: db/backups/YYYY-MM-DD_xxx_before_backfill_col.sql ✓
//         // history: db/schema-history.md updated ✓
//         await db.execute(sql.raw(`UPDATE xxx SET col = ... WHERE col IS NULL`));
//         await db.execute(sql.raw(`INSERT INTO system_config(config_key,config_value) VALUES('${FLAG}','done')`));
//       }
//     }
//
//   Caller side (in the relevant route file, NOT index.ts):
//     import { runXxxColumnsMigration } from "@shared/schema-extra";
//     export function registerXxxRoutes(app: Express) {
//       runXxxColumnsMigration(db);  // INSIDE the register function, NOT top-level
//       ...
//     }
//
//   CRITICAL TIMING RULE: Call MUST be inside the register function body, never
//   at module top-level. Top-level runs at import time (before DB config bootstrap
//   completes on production). Inside the function runs at route registration time
//   (after migrationReady = true, DB is fully connected).
//
//   Rule: NEVER use DROP COLUMN, ALTER TYPE, or RENAME — additive only.
//   Rule: NEVER touch index.ts for feature column additions.
//   Rule: Backfill = data change = same backup+history rules as SECONDARY USE.
//
// =============================================================================
// MASTER RULE: Production Database Manipulation Checklist
// =============================================================================
//   SERVER COMMAND RULE (absolute):
//     Commands issued to production servers = git pull + build + run ONLY.
//     NO manual commands on the application server console.
//     NO manual commands on the database server console.
//     The DB server console is NEVER opened during the checklist.
//     All verify / inspect / backup actions must be done through CODE deployed
//     to the server, not through direct console interaction.
//
//   ANY change to production DB — no matter how small — must follow this order:
//
//   1. VERIFY FIRST (via code) — write a temporary block or API endpoint that
//      queries production DB and displays the result on screen (e.g., logs column
//      list or row counts). Deploy it. Read the output. Remove it.
//      Never assume — another agent may have already made the change.
//
//   ── If the change will TOUCH existing data content (UPDATE/backfill) ──────────
//   1b. BACKUP TARGET TABLE (via code) — write a temporary function that SELECTs
//       the full table and writes it as INSERT statements to
//       db/backups/YYYY-MM-DD_<table>_before_<reason>.sql on the server filesystem.
//       Deploy it. Confirm the file was written. Remove the backup code.
//       No backup = no proceed.
//   ────────────────────────────────────────────────────────────────────────────
//
//   2. DEPLOY DB-ONLY FIRST — push ONLY the schema-extra migration function and
//      its route-file caller. No other changes in the same deploy.
//
//   3. CONFIRM IT RAN ONCE (via code) — write a temporary API endpoint or startup
//      log that reads system_config for the flag key and displays it on screen.
//      If the flag row exists, the migration ran. Remove the temporary code.
//      If Node.js logging is needed: add a temporary console.log block,
//      deploy, read the screen output, then remove the block.
//      Ask พี่ช้าง to STOP the production server after confirming.
//
//   4. VERIFY PRODUCTION DB (via code) — write a temporary block that queries
//      column existence / row counts and displays results. Deploy. Read. Remove.
//
//   ── If the change touched existing data content ───────────────────────────────
//   4b. UPDATE HISTORY — write entry to db/schema-history.md:
//         - What changed (table, columns, transformation)
//         - Backup file path
//         - Datetime it ran
//         - Reason / ticket
//       This MUST happen before flagging complete.
//   ────────────────────────────────────────────────────────────────────────────
//
//   5. COMMENT OUT THE BLOCK IMMEDIATELY — this is the PRIMARY prevention against
//      re-run, not the flag. Comment out the entire migration block in schema-extra.ts
//      with: date/time it finished, what it did, why it ran that time.
//      Example:
//        /* DONE 2026-05-01 14:30 UTC — added warehouse_id to goods_receivings.
//           Ran once to migrate warehouse columns from index.ts. Never run again. */
//   6. PUSH CLEAN BEFORE ANYTHING ELSE — push the commented-out schema-extra.ts
//      to production and rebuild immediately. Do NOT proceed to any other checklist
//      step until the clean code is live on the server.
//      Once the block is gone from the server, re-run is physically impossible.
//      The system_config flag is only a secondary safety net for the window between
//      the migration running and the clean push landing.
//   7. CONTINUE CHECKLIST — proceed with the remaining steps of the full fix batch.
// =============================================================================

import { pgTable, serial, integer, text, varchar, decimal, date, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { companies, users, tenants, subscriptionPlans, employees, products } from "./schema";

export const employeeHourSettings = pgTable("employee_hour_settings", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id, { onDelete: "cascade" }).notNull().unique(),
  attendanceType: text("attendance_type").notNull().default("time_based"),
  defaultHoursPerDay: decimal("default_hours_per_day", { precision: 4, scale: 1 }).default("8.0"),
});

export const insertEmployeeHourSettingsSchema = createInsertSchema(employeeHourSettings).omit({ id: true });
export type InsertEmployeeHourSettings = z.infer<typeof insertEmployeeHourSettingsSchema>;
export type EmployeeHourSettings = typeof employeeHourSettings.$inferSelect;

export const employeeCounters = pgTable("employee_counters", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull().unique(),
  prefix: varchar("prefix", { length: 2 }).notNull(),
  lastNumber: integer("last_number").notNull().default(0),
});

export const insertEmployeeCounterSchema = createInsertSchema(employeeCounters).omit({ id: true });
export type InsertEmployeeCounter = z.infer<typeof insertEmployeeCounterSchema>;
export type EmployeeCounter = typeof employeeCounters.$inferSelect;

export const expenseDailyBatches = pgTable("expense_daily_batches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  batchNo: text("batch_no").notNull(),
  batchDate: date("batch_date").notNull(),
  totalExpenses: integer("total_expenses").notNull().default(0),
  totalSubtotal: decimal("total_subtotal", { precision: 15, scale: 2 }).default("0"),
  totalVat: decimal("total_vat", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  totalWht: decimal("total_wht", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertExpenseDailyBatchSchema = createInsertSchema(expenseDailyBatches).omit({ id: true, createdAt: true });
export type InsertExpenseDailyBatch = z.infer<typeof insertExpenseDailyBatchSchema>;
export type ExpenseDailyBatch = typeof expenseDailyBatches.$inferSelect;

export const pdfImportTemplates = pgTable("pdf_import_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  name: text("name").notNull(),
  description: text("description"),
  detectKeywords: text("detect_keywords").array().notNull(),
  fieldRules: jsonb("field_rules").notNull(),
  dateFormat: text("date_format").default("DD/MM/YYYY"),
  defaultVatType: text("default_vat_type").default("vat7"),
  active: boolean("active").default(true),
  priority: integer("priority").default(0),
  isBuiltIn: boolean("is_built_in").default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPdfImportTemplateSchema = createInsertSchema(pdfImportTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPdfImportTemplate = z.infer<typeof insertPdfImportTemplateSchema>;
export type PdfImportTemplate = typeof pdfImportTemplates.$inferSelect;

export const subscriptionPaymentOrders = pgTable("subscription_payment_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  planId: integer("plan_id").references(() => subscriptionPlans.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  setupFeeAmount: decimal("setup_fee_amount", { precision: 10, scale: 2 }).default("0"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  status: text("status").notNull().default("pending"),
  orderType: text("order_type").notNull().default("renewal"),
  promptpayRef: text("promptpay_ref"),
  slipImageUrl: text("slip_image_url"),
  confirmedByUserId: integer("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at"),
  invoiceNumber: text("invoice_number"),
  taxInvoiceId: integer("tax_invoice_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubscriptionPaymentOrderSchema = createInsertSchema(subscriptionPaymentOrders).omit({ id: true, createdAt: true });
export type InsertSubscriptionPaymentOrder = z.infer<typeof insertSubscriptionPaymentOrderSchema>;
export type SubscriptionPaymentOrder = typeof subscriptionPaymentOrders.$inferSelect;

export const subscriptionAddons = pgTable("subscription_addons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull().default("0"),
  yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }),
  featureFlag: text("feature_flag").notNull(),
  icon: text("icon"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubscriptionAddonSchema = createInsertSchema(subscriptionAddons).omit({ id: true, createdAt: true });
export type InsertSubscriptionAddon = z.infer<typeof insertSubscriptionAddonSchema>;
export type SubscriptionAddon = typeof subscriptionAddons.$inferSelect;

export const tenantAddonSubscriptions = pgTable("tenant_addon_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  addonId: integer("addon_id").references(() => subscriptionAddons.id).notNull(),
  status: text("status").notNull().default("active"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantAddonSubscriptionSchema = createInsertSchema(tenantAddonSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantAddonSubscription = z.infer<typeof insertTenantAddonSubscriptionSchema>;
export type TenantAddonSubscription = typeof tenantAddonSubscriptions.$inferSelect;

export const modulePlans = pgTable("module_plans", {
  id: serial("id").primaryKey(),
  moduleKey: text("module_key").notNull(),
  tier: text("tier").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull().default("0"),
  yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }),
  maxUsers: integer("max_users").notNull().default(1),
  maxDocuments: integer("max_documents").notNull().default(100),
  maxCompanies: integer("max_companies").notNull().default(1),
  limits: text("limits"),
  features: text("features").array(),
  popular: boolean("popular").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertModulePlanSchema = createInsertSchema(modulePlans).omit({ id: true, createdAt: true });
export type InsertModulePlan = z.infer<typeof insertModulePlanSchema>;
export type ModulePlan = typeof modulePlans.$inferSelect;

export const tenantModuleSubscriptions = pgTable("tenant_module_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  moduleKey: text("module_key").notNull(),
  modulePlanId: integer("module_plan_id").references(() => modulePlans.id).notNull(),
  tier: text("tier").notNull(),
  status: text("status").notNull().default("trial"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  trialEndsAt: timestamp("trial_ends_at"),
  autoRenew: boolean("auto_renew").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertTenantModuleSubscriptionSchema = createInsertSchema(tenantModuleSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantModuleSubscription = z.infer<typeof insertTenantModuleSubscriptionSchema>;
export type TenantModuleSubscription = typeof tenantModuleSubscriptions.$inferSelect;

// ─── One-time Data Migrations ────────────────────────────────────────────────
// NOTE: Completed migrations are kept here as commented-out history for audit.
// Workflow: write migration → hook → verify in DB → comment out → push.

/* ── DONE 2026-04-27T00:28:27Z: Clear wrong etax_sent_to=csemail on invoice 459 ──
 * Verified: FLAG = done_2026-04-27T00:28:27.087Z in system_config
 *           tax_invoices id=459 RE2604250044: etax_sent_to=null, etax_sent_cc=null ✅
 * Backup: backup_tax_invoices_20260426 on deep-main (1 row)
 *
 * const FIX_ETAX_SENT_TO_KEY = "FIX_ETAX_SENT_TO_INVOICE_459_20260426";
 *
 * export async function fixEtaxSentToInvoice459(db: any) {
 *   try {
 *     const flagRows = await db.execute(sql`
 *       SELECT config_value FROM system_config
 *       WHERE config_key = ${FIX_ETAX_SENT_TO_KEY} LIMIT 1
 *     `);
 *     if ((flagRows.rows || []).length > 0) {
 *       console.log("[DataFix] Invoice-459 fix already applied — skipping.");
 *       return;
 *     }
 *   } catch (err: any) {
 *     console.error("[DataFix] ❌ flag-check error:", err.message);
 *     return;
 *   }
 *   try {
 *     await db.transaction(async (tx: any) => {
 *       const result = await tx.execute(sql`
 *         UPDATE tax_invoices
 *         SET etax_sent_to = NULL, etax_sent_cc = NULL
 *         WHERE id = 459 AND etax_sent_to = 'csemail@etax.teda.th'
 *       `);
 *       const affected = result.rowCount ?? result.count ?? 0;
 *       console.log(`[DataFix] UPDATE affected ${affected} row(s) on invoice id=459`);
 *       await tx.execute(sql`
 *         INSERT INTO system_config (config_key, config_value, description)
 *         VALUES (${FIX_ETAX_SENT_TO_KEY}, ${"done_" + new Date().toISOString()},
 *           'Clear wrong etax_sent_to=csemail on invoice 459 RE2604250044. Backup: backup_tax_invoices_20260426')
 *         ON CONFLICT (config_key) DO NOTHING
 *       `);
 *     });
 *     console.log("[DataFix] ✅ Invoice 459 etax_sent_to/cc cleared to NULL — flag set.");
 *   } catch (err: any) {
 *     console.error("[DataFix] ❌ transaction failed — no changes committed:", err.message);
 *   }
 * }
 */

/* ── DONE 2026-04-21: Seed account 5210470 (Company Registration Fee) ──
 * Verified: 453 / 453 prod companies on deep-main have code 5210470.
 * Flag: SEED_ACCOUNT_5210470_ALL_COMPANIES = done_2026-04-21T06:11:34.193Z
 *
 * const MIGRATION_KEY_5210470 = "SEED_ACCOUNT_5210470_ALL_COMPANIES";
 *
 * export async function seedAccount5210470(db: any) {
 *   try {
 *     const flagRows = await db.execute(sql`
 *       SELECT config_value FROM system_config
 *       WHERE config_key = ${MIGRATION_KEY_5210470} LIMIT 1
 *     `);
 *     if ((flagRows.rows || []).length > 0) return;
 *
 *     await db.execute(sql`
 *       INSERT INTO accounts (
 *         company_id, code, name, name_th, name_zh,
 *         type, parent_code, active, is_header
 *       )
 *       SELECT DISTINCT
 *         a.company_id,
 *         '5210470',
 *         'Company Registration Fee',
 *         'ค่าธรรมเนียมจัดตั้งบริษัท',
 *         '公司注册费',
 *         'expense', '521', true, false
 *       FROM accounts a
 *       WHERE a.company_id IS NOT NULL
 *         AND NOT EXISTS (
 *           SELECT 1 FROM accounts b
 *           WHERE b.company_id = a.company_id AND b.code = '5210470'
 *         )
 *     `);
 *
 *     await db.execute(sql`
 *       INSERT INTO system_config (config_key, config_value, description)
 *       VALUES (
 *         ${MIGRATION_KEY_5210470},
 *         ${"done_" + new Date().toISOString()},
 *         'Seed account 5210470 (Company Registration Fee) to all existing companies'
 *       )
 *       ON CONFLICT (config_key) DO NOTHING
 *     `);
 *
 *     console.log("[Migration] ✅ Account 5210470 seeded to all companies");
 *   } catch (err: any) {
 *     console.error("[Migration] ❌ seedAccount5210470:", err.message);
 *   }
 * }
 */

// ── ADD original_invoice_amount to sales_credit_notes (2026-04-30) ────────
export async function runCreditNoteOriginalAmountMigration(db: any) {
  try {
    await db.execute(sql`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS original_invoice_amount DECIMAL(15,2)`);
    await db.execute(sql`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS correct_invoice_amount DECIMAL(15,2)`);
    console.log("[migration] ✅ original_invoice_amount + correct_invoice_amount added to sales_credit_notes");
  } catch (e: any) {
    console.warn("[migration] cn_original_amount:", e.message);
  }
}

// ── ADD share_token to sales_credit_notes (2026-04-30) ────────────────────
const CN_SHARE_TOKEN_KEY = "ADD_SHARE_TOKEN_TO_SALES_CREDIT_NOTES_2026-04-30";

export async function runCreditNoteShareTokenMigration(db: any) {
  try {
    const flagRows = await db.execute(sql`
      SELECT 1 FROM system_config WHERE config_key = ${CN_SHARE_TOKEN_KEY} LIMIT 1
    `);
    if ((flagRows.rows || []).length > 0) return;
    await db.execute(sql`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS share_token TEXT`);
    await db.execute(sql`
      INSERT INTO system_config (config_key, config_value)
      VALUES (${CN_SHARE_TOKEN_KEY}, 'done')
      ON CONFLICT (config_key) DO NOTHING
    `);
    console.log("[migration] ✅ share_token added to sales_credit_notes");
  } catch (e: any) {
    console.warn("[migration] cn_share_token:", e.message);
  }
}

// ── ADD bank_name + bank_account_no to payment_methods (2026-04-29) ────────
const BANK_INFO_MIGRATION_KEY = "ADD_BANK_INFO_TO_PAYMENT_METHODS_2026-04-29";

export async function runBankInfoToPaymentMethodsMigration(db: any) {
  try {
    const flagRows = await db.execute(sql`
      SELECT 1 FROM system_config WHERE config_key = ${BANK_INFO_MIGRATION_KEY} LIMIT 1
    `);
    if ((flagRows.rows || []).length > 0) return;
    await db.execute(sql`ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS bank_name text`);
    await db.execute(sql`ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS bank_account_no text`);
    await db.execute(sql`
      INSERT INTO system_config (config_key, config_value)
      VALUES (${BANK_INFO_MIGRATION_KEY}, 'done')
      ON CONFLICT (config_key) DO NOTHING
    `);
    console.log("[migration] ✅ bank_name + bank_account_no added to payment_methods");
  } catch (e: any) {
    console.warn("[migration] bank_info:", e.message);
  }
}

// =============================================================================
// WAREHOUSE COLUMNS MIGRATION — DONE 2026-04-30, comment out per TERTIARY USE rule
// 8 columns verified in DB, backfill done (flag WAREHOUSE_STOCK_BACKFILL_DONE = done)
// Backup: db/backups/2026-04-30_warehouse_stock_levels_before_backfill_v85.sql
// History: db/schema-history.md
// =============================================================================
/*
export async function runWarehouseColumnsMigration(db: any) {
  try {
    // --- Pure DDL — IF NOT EXISTS is idempotent, no flag needed ---
    await db.execute(sql.raw(`ALTER TABLE goods_receivings ADD COLUMN IF NOT EXISTS warehouse_id INTEGER`));
    await db.execute(sql.raw(`ALTER TABLE goods_receiving_items ADD COLUMN IF NOT EXISTS warehouse_id INTEGER`));
    await db.execute(sql.raw(`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS return_to_stock BOOLEAN DEFAULT FALSE`));
    await db.execute(sql.raw(`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS return_warehouse_id INTEGER`));
    await db.execute(sql.raw(`ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS warehouse_id INTEGER`));
    await db.execute(sql.raw(`ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS source_warehouse_id INTEGER`));
    await db.execute(sql.raw(`ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS target_warehouse_id INTEGER`));
    await db.execute(sql.raw(`ALTER TABLE general_settings ADD COLUMN IF NOT EXISTS inventory_triggers JSONB DEFAULT '{}'`));
    await db.execute(sql.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS wsl_unique_warehouse_product_company
      ON warehouse_stock_levels (warehouse_id, product_id, company_id)
    `));
    console.log("[migration] ✅ warehouse columns ensured (8 columns)");
  } catch (e: any) {
    console.error(`[migration] ❌ warehouse columns DDL FAILED — server continues but schema may be incomplete`);
    console.error(`[migration] DDL error: ${e.message}`);
    console.error(`[migration] Action required: check warehouse_stock_levels, goods_receivings, sales_credit_notes, ecommerce_orders, manufacturing_orders, general_settings columns manually`);
  }

  // --- Data backfill — touches existing data, backup done 2026-04-30 ---
  // Backup: db/backups/2026-04-30_warehouse_stock_levels_before_backfill_v85.sql
  // History: db/schema-history.md entry added 2026-04-30
  const BACKFILL_FLAG = "WAREHOUSE_STOCK_BACKFILL_DONE";
  try {
    const flagRows = await db.execute(sql.raw(
      `SELECT config_value FROM system_config WHERE config_key = '${BACKFILL_FLAG}' LIMIT 1`
    ));
    if ((flagRows.rows || []).length > 0) return;

    await db.execute(sql.raw(`
      INSERT INTO warehouse_stock_levels (warehouse_id, product_id, company_id, quantity, reserved_qty, updated_at)
      SELECT ii.warehouse_id, ii.product_id, pi.company_id,
        SUM(ii.qty)::numeric, 0, NOW()
      FROM purchase_invoice_items ii
      JOIN purchase_invoices pi ON pi.id = ii.purchase_invoice_id
      WHERE ii.warehouse_id IS NOT NULL AND ii.product_id IS NOT NULL
      GROUP BY ii.warehouse_id, ii.product_id, pi.company_id
      ON CONFLICT (warehouse_id, product_id, company_id) DO UPDATE
        SET quantity = warehouse_stock_levels.quantity + EXCLUDED.quantity, updated_at = NOW()
    `));
    await db.execute(sql.raw(`
      INSERT INTO warehouse_stock_levels (warehouse_id, product_id, company_id, quantity, reserved_qty, updated_at)
      SELECT ii.warehouse_id, ii.product_id, inv.company_id,
        -SUM(ii.qty)::numeric, 0, NOW()
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      WHERE ii.warehouse_id IS NOT NULL AND ii.product_id IS NOT NULL
      GROUP BY ii.warehouse_id, ii.product_id, inv.company_id
      ON CONFLICT (warehouse_id, product_id, company_id) DO UPDATE
        SET quantity = warehouse_stock_levels.quantity + EXCLUDED.quantity, updated_at = NOW()
    `));
    await db.execute(sql.raw(`
      INSERT INTO warehouse_stock_levels (warehouse_id, product_id, company_id, quantity, reserved_qty, updated_at)
      SELECT ii.warehouse_id, ii.product_id, ti.company_id,
        -SUM(ii.qty)::numeric, 0, NOW()
      FROM tax_invoice_items ii
      JOIN tax_invoices ti ON ti.id = ii.tax_invoice_id
      WHERE ii.warehouse_id IS NOT NULL AND ii.product_id IS NOT NULL
      GROUP BY ii.warehouse_id, ii.product_id, ti.company_id
      ON CONFLICT (warehouse_id, product_id, company_id) DO UPDATE
        SET quantity = warehouse_stock_levels.quantity + EXCLUDED.quantity, updated_at = NOW()
    `));
    await db.execute(sql.raw(
      `INSERT INTO system_config (config_key, config_value) VALUES ('${BACKFILL_FLAG}', 'done') ON CONFLICT DO NOTHING`
    ));
    console.log("[migration] ✅ warehouse_stock_levels historical backfill done");
  } catch (e: any) {
    console.error(`[migration] ❌ warehouse backfill FAILED — flag '${BACKFILL_FLAG}' NOT set, will retry on next restart`);
    console.error(`[migration] Backfill error: ${e.message}`);
    console.error(`[migration] Hint: check unique index wsl_unique_warehouse_product_company on warehouse_stock_levels, and check for duplicate (warehouse_id, product_id, company_id) rows`);
  }
}
*/

/* DONE 2026-05-03 — billing_notes WHT columns migration
   Added: withholding_tax DECIMAL(15,2), wht_rate DECIMAL(5,2), wht_base DECIMAL(15,2)
   Verified BY EYES on deep-main: all 3 columns present, DEFAULT 0 ✅
   Never run again.
export async function runBillingNotesWhtMigration(db: any) {
  try {
    await db.execute(sql.raw(`ALTER TABLE billing_notes ADD COLUMN IF NOT EXISTS withholding_tax DECIMAL(15,2) DEFAULT 0`));
    await db.execute(sql.raw(`ALTER TABLE billing_notes ADD COLUMN IF NOT EXISTS wht_rate DECIMAL(5,2) DEFAULT 0`));
    await db.execute(sql.raw(`ALTER TABLE billing_notes ADD COLUMN IF NOT EXISTS wht_base DECIMAL(15,2) DEFAULT 0`));
    console.log("[migration] ✅ billing_notes — withholding_tax, wht_rate, wht_base columns ready");
  } catch (e: any) {
    console.error("[migration] ❌ runBillingNotesWhtMigration FAILED:", e.message);
  }
}
*/

export async function runBillingNotesWhtMigration(_db: any) {
  // migration done 2026-05-03 — no-op
}

/* DONE 2026-05-05 — billing_notes.share_token column
   Added: share_token TEXT to billing_notes
   Verified on deep-main production DB: column exists ✅
   Pure DDL only — no data backfill, no backup needed.
   Never run again.
export async function runBillingNoteShareTokenMigration(db: any) {
  try {
    await db.execute(sql`ALTER TABLE billing_notes ADD COLUMN IF NOT EXISTS share_token TEXT`);
    console.log("[migration] ✅ billing_notes.share_token column ready");
  } catch (e: any) {
    console.error("[migration] ❌ runBillingNoteShareTokenMigration FAILED:", e.message);
  }
}
*/

export async function runBillingNoteShareTokenMigration(_db: any) {
  // migration done 2026-05-05 — no-op
}

/* DONE 2026-05-04 — firm_clients.target_db_machine_id
   Verified column already exists on production DB. Migration not needed.
export async function runFirmClientMigration(db: any) {
  try {
    await db.execute(sql.raw(`ALTER TABLE firm_clients ADD COLUMN IF NOT EXISTS target_db_machine_id INTEGER`));
    console.log("[migration] ✅ firm_clients.target_db_machine_id ready");
  } catch (e: any) {
    console.error("[migration] ❌ runFirmClientMigration FAILED:", e.message);
  }
}
*/

/* ── CANCELLED 2026-05-07: general_settings.bot_api_key ADD COLUMN ──
 * Design changed: BOT API key moved to system_config (platform-level), not per-company.
 * Column was never pushed to production (ENTRY #002 CANCELLED).
 *
 * export async function runBotApiKeyMigration(db: any) {
 *   await db.execute(sql.raw(`ALTER TABLE general_settings ADD COLUMN IF NOT EXISTS bot_api_key TEXT`));
 *   console.log("[migration] ✅ general_settings.bot_api_key ready");
 * }
 */
export async function runBotApiKeyMigration(_db: any) {}

/* ── DONE 2026-05-07: expenses currency_code + exchange_rate + paid_amount (ENTRY #001) ──
 * Verified on production DB: 3 columns present, FLAG=done_2026-05-07T14:33:31.731Z ✅
 * Backup: not required (additive only, no existing data touched)
 *
 * export async function runExpenseCurrencyMigration(db: any) {
 *   const FLAG = "ADD_CURRENCY_COLUMNS_TO_EXPENSES_20260505";
 *   const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
 *   if ((flag.rows || []).length > 0) return;
 *   await db.execute(sql.raw(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'THB'`));
 *   await db.execute(sql.raw(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(15,6) NOT NULL DEFAULT 1`));
 *   await db.execute(sql.raw(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0`));
 *   await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_${new Date().toISOString()}') ON CONFLICT (config_key) DO NOTHING`));
 *   console.log("[migration] ✅ expenses currency_code + exchange_rate + paid_amount added");
 * }
 */
export async function runExpenseCurrencyMigration(_db: any) {}

/* ── ENTRY #005: general_settings.default_vat_rate ADD COLUMN ──
 * Table: general_settings (4 rows on production — company IDs: 4, 3822, 3951, 3953)
 * VERIFY FIRST result (2026-05-08): column does NOT exist on production ✅
 * Backup: not required — ADD COLUMN nullable, no existing data touched, revert = DROP COLUMN
 * Caller: server/routes/doc-settings-routes.ts
 * Executed: 2026-05-08 — verified on production DB via Phase 1c ✅
 * default_vat_rate TEXT DEFAULT '7' confirmed in general_settings
 */
export async function runDefaultVatRateMigration(_db: any) {}

// =============================================================================
// PRODUCT SPLIT — active_products + inactive_products (ENTRY #007, 2026-05-10)
// Middle-man pattern: products (schema.ts) stays as registry, all 34 FK tables
// still point to products.id — integrity maintained at DB level.
// active_products + inactive_products each hold a 1:1 row keyed to products.id.
// Moving a product between active/inactive = move row between these 2 tables only.
// =============================================================================

export const activeProducts = pgTable("active_products", {
  id: integer("id").primaryKey().references(() => products.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  nameZh: text("name_zh"),
  description: text("description"),
  category: text("category").notNull().default("product"),
  productType: text("product_type").notNull().default("simple"),
  unit: text("unit").notNull().default("ชิ้น"),
  price: decimal("price", { precision: 15, scale: 2 }).notNull().default("0"),
  cost: decimal("cost", { precision: 15, scale: 2 }).default("0"),
  priceRetail: decimal("price_retail", { precision: 15, scale: 2 }).default("0"),
  priceWholesale: decimal("price_wholesale", { precision: 15, scale: 2 }).default("0"),
  priceAgent: decimal("price_agent", { precision: 15, scale: 2 }).default("0"),
  priceSpecial: decimal("price_special", { precision: 15, scale: 2 }).default("0"),
  priceVip: decimal("price_vip", { precision: 15, scale: 2 }).default("0"),
  vatType: text("vat_type").notNull().default("vat7"),
  vatIncluded: boolean("vat_included").notNull().default(false),
  accountCode: text("account_code"),
  barcode: text("barcode"),
  imageUrl: text("image_url"),
  lowStockThreshold: integer("low_stock_threshold").default(0),
  trackLots: boolean("track_lots").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertActiveProductSchema = createInsertSchema(activeProducts).omit({ createdAt: true });
export type InsertActiveProduct = z.infer<typeof insertActiveProductSchema>;
export type ActiveProduct = typeof activeProducts.$inferSelect;

export const inactiveProducts = pgTable("inactive_products", {
  id: integer("id").primaryKey().references(() => products.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  nameZh: text("name_zh"),
  description: text("description"),
  category: text("category").notNull().default("product"),
  productType: text("product_type").notNull().default("simple"),
  unit: text("unit").notNull().default("ชิ้น"),
  price: decimal("price", { precision: 15, scale: 2 }).notNull().default("0"),
  cost: decimal("cost", { precision: 15, scale: 2 }).default("0"),
  priceRetail: decimal("price_retail", { precision: 15, scale: 2 }).default("0"),
  priceWholesale: decimal("price_wholesale", { precision: 15, scale: 2 }).default("0"),
  priceAgent: decimal("price_agent", { precision: 15, scale: 2 }).default("0"),
  priceSpecial: decimal("price_special", { precision: 15, scale: 2 }).default("0"),
  priceVip: decimal("price_vip", { precision: 15, scale: 2 }).default("0"),
  vatType: text("vat_type").notNull().default("vat7"),
  vatIncluded: boolean("vat_included").notNull().default(false),
  accountCode: text("account_code"),
  barcode: text("barcode"),
  imageUrl: text("image_url"),
  lowStockThreshold: integer("low_stock_threshold").default(0),
  trackLots: boolean("track_lots").notNull().default(false),
  deactivatedAt: timestamp("deactivated_at").defaultNow(),
  createdAt: timestamp("created_at"),
});
export const insertInactiveProductSchema = createInsertSchema(inactiveProducts).omit({ deactivatedAt: true });
export type InsertInactiveProduct = z.infer<typeof insertInactiveProductSchema>;
export type InactiveProduct = typeof inactiveProducts.$inferSelect;

// Migration: create tables + backfill from products (runs once via FLAG)
export async function runProductSplitMigration(db: any) {
  const FLAG = "PRODUCT_SPLIT_MIGRATION_20260510";

  // ── Phase 0: FLAG check — if already done, skip everything (protects DROP from re-running) ──
  let flagRows: any;
  try {
    flagRows = await db.execute(sql.raw(
      `SELECT 1 FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`
    ));
  } catch (err: any) {
    console.error("[migration] ❌ Phase 0 flag check failed — could not read system_config:", err.message);
    throw new Error(`[runProductSplitMigration] Phase 0 flag check failed: ${err.message}`);
  }

  if ((flagRows.rows || []).length > 0) {
    console.log("[migration] product split already done — skipping");
    return;
  }

  // ── Phase 0b: BACKUP existing tables before any DROP (Rule 4 — destructive SQL safety) ──
  // CREATE TABLE ... AS SELECT * preserves all current rows in case rollback is needed.
  // Backup tables are NOT dropped after migration — they remain until พี่ช้าง manually reviews and clears.
  try {
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS backup_active_products_20260510 AS SELECT * FROM active_products`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS backup_inactive_products_20260510 AS SELECT * FROM inactive_products`));
    console.log("[migration] ✅ Phase 0b — backup_active_products_20260510 + backup_inactive_products_20260510 created");
  } catch (err: any) {
    console.error("[migration] ❌ Phase 0b BACKUP failed — aborting before DROP:", err.message);
    throw new Error(`[runProductSplitMigration] Phase 0b backup failed: ${err.message}`);
  }

  // ── Phase 1: DROP existing tables (hard delete — no soft delete, no hiding) ──
  // Production had tables created without FK constraints and with stale/orphan data.
  // พี่ทราย confirmed 2026-05-11: delete for real, not hide. Drop and recreate clean.
  try {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS active_products`));
    await db.execute(sql.raw(`DROP TABLE IF EXISTS inactive_products`));
    console.log("[migration] ✅ Phase 1 — old active_products + inactive_products dropped");
  } catch (err: any) {
    console.error("[migration] ❌ Phase 1 DROP failed — could not drop active_products / inactive_products:", err.message);
    throw new Error(`[runProductSplitMigration] Phase 1 DROP failed: ${err.message}`);
  }

  // ── Phase 2: CREATE tables fresh with correct FK CASCADE constraints ──
  try {
    await db.execute(sql.raw(`
      CREATE TABLE active_products (
        id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        name_en TEXT,
        name_zh TEXT,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'product',
        product_type TEXT NOT NULL DEFAULT 'simple',
        unit TEXT NOT NULL DEFAULT 'ชิ้น',
        price DECIMAL(15,2) NOT NULL DEFAULT 0,
        cost DECIMAL(15,2) DEFAULT 0,
        price_retail DECIMAL(15,2) DEFAULT 0,
        price_wholesale DECIMAL(15,2) DEFAULT 0,
        price_agent DECIMAL(15,2) DEFAULT 0,
        price_special DECIMAL(15,2) DEFAULT 0,
        price_vip DECIMAL(15,2) DEFAULT 0,
        vat_type TEXT NOT NULL DEFAULT 'vat7',
        vat_included BOOLEAN NOT NULL DEFAULT false,
        account_code TEXT,
        barcode TEXT,
        image_url TEXT,
        low_stock_threshold INTEGER DEFAULT 0,
        track_lots BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `));
    await db.execute(sql.raw(`
      CREATE TABLE inactive_products (
        id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        name_en TEXT,
        name_zh TEXT,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'product',
        product_type TEXT NOT NULL DEFAULT 'simple',
        unit TEXT NOT NULL DEFAULT 'ชิ้น',
        price DECIMAL(15,2) NOT NULL DEFAULT 0,
        cost DECIMAL(15,2) DEFAULT 0,
        price_retail DECIMAL(15,2) DEFAULT 0,
        price_wholesale DECIMAL(15,2) DEFAULT 0,
        price_agent DECIMAL(15,2) DEFAULT 0,
        price_special DECIMAL(15,2) DEFAULT 0,
        price_vip DECIMAL(15,2) DEFAULT 0,
        vat_type TEXT NOT NULL DEFAULT 'vat7',
        vat_included BOOLEAN NOT NULL DEFAULT false,
        account_code TEXT,
        barcode TEXT,
        image_url TEXT,
        low_stock_threshold INTEGER DEFAULT 0,
        track_lots BOOLEAN NOT NULL DEFAULT false,
        deactivated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP
      )
    `));
    console.log("[migration] ✅ Phase 2 — active_products + inactive_products created with FK CASCADE");
  } catch (err: any) {
    console.error("[migration] ❌ Phase 2 CREATE failed — active_products / inactive_products could not be created:", err.message);
    throw new Error(`[runProductSplitMigration] Phase 2 CREATE failed: ${err.message}`);
  }

  // ── Phase 3: Backfill from current products table ──
  try {
    await db.execute(sql.raw(`
      INSERT INTO active_products (
        id, company_id, code, name, name_en, name_zh, description,
        category, product_type, unit, price, cost,
        price_retail, price_wholesale, price_agent, price_special, price_vip,
        vat_type, vat_included, account_code, barcode, image_url,
        low_stock_threshold, track_lots, created_at
      )
      SELECT
        id, company_id, code, name, name_en, name_zh, description,
        category, product_type, unit, price, cost,
        price_retail, price_wholesale, price_agent, price_special, price_vip,
        vat_type, vat_included, account_code, barcode, image_url,
        low_stock_threshold, track_lots, created_at
      FROM products
      WHERE active = true
    `));

    await db.execute(sql.raw(`
      INSERT INTO inactive_products (
        id, company_id, code, name, name_en, name_zh, description,
        category, product_type, unit, price, cost,
        price_retail, price_wholesale, price_agent, price_special, price_vip,
        vat_type, vat_included, account_code, barcode, image_url,
        low_stock_threshold, track_lots, created_at, deactivated_at
      )
      SELECT
        id, company_id, code, name, name_en, name_zh, description,
        category, product_type, unit, price, cost,
        price_retail, price_wholesale, price_agent, price_special, price_vip,
        vat_type, vat_included, account_code, barcode, image_url,
        low_stock_threshold, track_lots, created_at, NOW()
      FROM products
      WHERE active = false
    `));

    await db.execute(sql.raw(
      `INSERT INTO system_config (config_key, config_value)
       VALUES ('${FLAG}', 'done_${new Date().toISOString()}')
       ON CONFLICT (config_key) DO NOTHING`
    ));
    console.log("[migration] ✅ Phase 3 — backfill done: active_products + inactive_products populated from products");
  } catch (err: any) {
    console.error("[migration] ❌ Phase 3 backfill failed — tables were created but INSERT failed. Tables are empty. Safe to retry on next restart (Phase 0 flag not set yet):", err.message);
    throw new Error(`[runProductSplitMigration] Phase 3 backfill failed: ${err.message}`);
  }
}

// =============================================================================
// MES (Manufacturing Execution System) TABLES — added 2026-05-16
// =============================================================================
export const mesWorkOrders = pgTable("mes_work_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  woNo: varchar("wo_no", { length: 50 }).notNull(),
  productName: varchar("product_name", { length: 200 }).notNull(),
  model: varchar("model", { length: 100 }),
  bomId: integer("bom_id"),
  quantity: integer("quantity").notNull().default(1),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by"),
  createdByName: varchar("created_by_name", { length: 100 }),
});

export const mesUnits = pgTable("mes_units", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  workOrderId: integer("work_order_id").notNull(),
  unitNo: integer("unit_no").notNull(),
  masterQr: varchar("master_qr", { length: 100 }).notNull().unique(),
  currentProcess: integer("current_process").notNull().default(0),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mesProcessLogs = pgTable("mes_process_logs", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull(),
  processNo: integer("process_no").notNull(),
  employeeQr: varchar("employee_qr", { length: 100 }),
  employeeName: varchar("employee_name", { length: 100 }),
  action: varchar("action", { length: 30 }).notNull().default("complete"),
  notes: text("notes"),
  loggedAt: timestamp("logged_at").defaultNow(),
});

export const mesCellAssignments = pgTable("mes_cell_assignments", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull(),
  cellSerial: varchar("cell_serial", { length: 100 }).notNull(),
  slotNo: integer("slot_no"),
  assignedAt: timestamp("assigned_at").defaultNow(),
  assignedByQr: varchar("assigned_by_qr", { length: 100 }),
  assignedByName: varchar("assigned_by_name", { length: 100 }),
});

export const mesBalanceRecords = pgTable("mes_balance_records", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull(),
  employeeQr: varchar("employee_qr", { length: 100 }),
  employeeName: varchar("employee_name", { length: 100 }),
  beforeValues: jsonb("before_values"),
  afterValues: jsonb("after_values"),
  imageUrl: varchar("image_url", { length: 500 }),
  notes: text("notes"),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

export async function runMesTablesMigration(db: any) {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS mes_work_orders (
      id SERIAL PRIMARY KEY, company_id INT NOT NULL,
      wo_no VARCHAR(50) NOT NULL, product_name VARCHAR(200) NOT NULL,
      model VARCHAR(100), bom_id INT, quantity INT NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'draft', notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(), created_by INT, created_by_name VARCHAR(100)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS mes_units (
      id SERIAL PRIMARY KEY, company_id INT NOT NULL,
      work_order_id INT NOT NULL, unit_no INT NOT NULL,
      master_qr VARCHAR(100) NOT NULL UNIQUE,
      current_process INT NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS mes_process_logs (
      id SERIAL PRIMARY KEY, unit_id INT NOT NULL, process_no INT NOT NULL,
      employee_qr VARCHAR(100), employee_name VARCHAR(100),
      action VARCHAR(30) NOT NULL DEFAULT 'complete', notes TEXT,
      logged_at TIMESTAMP DEFAULT NOW()
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS mes_cell_assignments (
      id SERIAL PRIMARY KEY, unit_id INT NOT NULL,
      cell_serial VARCHAR(100) NOT NULL, slot_no INT,
      assigned_at TIMESTAMP DEFAULT NOW(),
      assigned_by_qr VARCHAR(100), assigned_by_name VARCHAR(100)
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS mes_balance_records (
      id SERIAL PRIMARY KEY, unit_id INT NOT NULL,
      employee_qr VARCHAR(100), employee_name VARCHAR(100),
      before_values JSONB, after_values JSONB,
      image_url VARCHAR(500), notes TEXT,
      recorded_at TIMESTAMP DEFAULT NOW()
    )
  `));
  console.log("[MES] ✅ MES tables created/verified");
}

// =============================================================================
// MATERIAL ISSUES TABLES (ENTRY #009, 2026-05-17)
// Creates material_issues + material_issue_items for เบิกวัตถุดิบ module.
// History: db/schema-history.md ENTRY #009
// =============================================================================
/* ── ENTRY #012: general_settings.lot_low_stock_threshold ADD COLUMN ──
 * Adds a company-level default threshold for lot low-stock warnings in the
 * material-issue form. Product-level lowStockThreshold takes priority; this
 * serves as the company-wide fallback when product threshold is 0/unset.
 * Pure DDL — no data backfill needed. Default 10 applied to all rows.
 */
export async function runLotLowStockThresholdMigration(db: any) {
  const FLAG = "ADD_LOT_LOW_STOCK_THRESHOLD_TO_GENERAL_SETTINGS_20260517";
  try {
    const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
    if ((flag.rows || []).length > 0) return;
    await db.execute(sql.raw(`ALTER TABLE general_settings ADD COLUMN IF NOT EXISTS lot_low_stock_threshold INTEGER DEFAULT 10`));
    await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_' || NOW()::TEXT) ON CONFLICT (config_key) DO NOTHING`));
    console.log("[migration] ✅ general_settings.lot_low_stock_threshold ready");
  } catch (e: any) {
    console.error("[migration] ❌ runLotLowStockThresholdMigration FAILED:", e.message);
  }
}

export async function runMaterialIssueMigration(db: any) {
  const FLAG = "CREATE_MATERIAL_ISSUE_TABLES_20260517";
  try {
    const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
    if ((flag.rows || []).length > 0) return;
    // CREATE TABLE IF NOT EXISTS — safe even if tables already exist on prod
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS material_issues (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      issue_no TEXT NOT NULL,
      mo_id INTEGER REFERENCES manufacturing_orders(id),
      issued_by_user_id INTEGER REFERENCES users(id),
      from_warehouse_id INTEGER,
      issued_at TIMESTAMP DEFAULT NOW(),
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
    )`));
    // ADD COLUMN IF NOT EXISTS — handles prod where table existed before from_warehouse_id was added
    await db.execute(sql.raw(`ALTER TABLE material_issues ADD COLUMN IF NOT EXISTS from_warehouse_id INTEGER`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS material_issue_items (
      id SERIAL PRIMARY KEY,
      material_issue_id INTEGER NOT NULL REFERENCES material_issues(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      lot_id INTEGER REFERENCES product_lots(id),
      lot_number TEXT,
      quantity NUMERIC NOT NULL,
      unit TEXT NOT NULL DEFAULT 'ชิ้น'
    )`));
    await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_' || NOW()::TEXT) ON CONFLICT (config_key) DO NOTHING`));
    console.log("[migration] ✅ material_issues + material_issue_items ready (created or patched)");
  } catch (e: any) {
    console.error("[migration] ❌ runMaterialIssueMigration FAILED:", e.message);
  }
}

// =============================================================================
// PRODUCTION FINISH TABLES (ENTRY #011, 2026-05-17)
// production_receipts + production_receipt_items — ใบรับสินค้าสำเร็จรูป WIP→FG
// History: db/schema-history.md ENTRY #011
// =============================================================================
export async function runProductionFinishMigration(db: any) {
  const FLAG = "CREATE_PRODUCTION_FINISH_TABLES_20260517";
  try {
    const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
    if ((flag.rows || []).length > 0) return;
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS production_receipts (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      receipt_no TEXT NOT NULL,
      mo_id INTEGER REFERENCES manufacturing_orders(id),
      received_by_user_id INTEGER REFERENCES users(id),
      to_warehouse_id INTEGER,
      received_at TIMESTAMP DEFAULT NOW(),
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
    )`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS production_receipt_items (
      id SERIAL PRIMARY KEY,
      production_receipt_id INTEGER NOT NULL REFERENCES production_receipts(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      lot_number TEXT,
      mfg_date DATE,
      exp_date DATE,
      quantity NUMERIC NOT NULL,
      unit TEXT NOT NULL DEFAULT 'ชิ้น',
      unit_cost NUMERIC NOT NULL DEFAULT 0
    )`));
    await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_' || NOW()::TEXT) ON CONFLICT (config_key) DO NOTHING`));
    console.log("[migration] ✅ production_receipts + production_receipt_items created");
  } catch (e: any) {
    console.error("[migration] ❌ runProductionFinishMigration FAILED:", e.message);
  }
}

// =============================================================================
// NCR REPORTS TABLE (ENTRY #012, 2026-05-17)
// ncr_reports — Non-Conformance Report บันทึกของเสีย/Reject ในกระบวนการผลิต
// History: db/schema-history.md ENTRY #012
// =============================================================================
export async function runWarehouseColumnsForMfgMigration(db: any) {
  const FLAG = "ADD_WAREHOUSE_COLS_TO_MFG_TABLES_20260517";
  try {
    const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
    if ((flag.rows || []).length > 0) return;
    await db.execute(sql.raw(`ALTER TABLE material_issues ADD COLUMN IF NOT EXISTS from_warehouse_id INTEGER`));
    await db.execute(sql.raw(`ALTER TABLE production_receipts ADD COLUMN IF NOT EXISTS to_warehouse_id INTEGER`));
    await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_' || NOW()::TEXT) ON CONFLICT (config_key) DO NOTHING`));
    console.log("[migration] ✅ from_warehouse_id + to_warehouse_id added to mfg tables");
  } catch (e: any) {
    console.error("[migration] ❌ runWarehouseColumnsForMfgMigration FAILED:", e.message);
  }
}

export async function runNcrMigration(db: any) {
  const FLAG = "CREATE_NCR_REPORTS_TABLE_20260517";
  try {
    const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
    if ((flag.rows || []).length > 0) return;
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS ncr_reports (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      ncr_no TEXT NOT NULL,
      mo_id INTEGER REFERENCES manufacturing_orders(id),
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL,
      defect_qty NUMERIC NOT NULL DEFAULT 0,
      defect_type TEXT NOT NULL DEFAULT 'other',
      description TEXT,
      corrective_action TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      closed_at TIMESTAMP
    )`));
    await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_' || NOW()::TEXT) ON CONFLICT (config_key) DO NOTHING`));
    console.log("[migration] ✅ ncr_reports created");
  } catch (e: any) {
    console.error("[migration] ❌ runNcrMigration FAILED:", e.message);
  }
}

// =============================================================================
// BOM PROCESS STEPS + MO PROCESS LOGS (ENTRY #013, 2026-05-17)
// bom_process_steps — ขั้นตอนการผลิตต่อ BOM
// mo_process_logs   — บันทึกความคืบหน้าต่อใบสั่งผลิต
// History: db/schema-history.md ENTRY #013
// =============================================================================
export async function runBomProcessStepsMigration(db: any) {
  const FLAG = "CREATE_BOM_PROCESS_STEPS_AND_MO_PROCESS_LOGS_20260517";
  try {
    const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
    if ((flag.rows || []).length > 0) return;
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS bom_process_steps (
      id SERIAL PRIMARY KEY,
      bom_id INTEGER NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
      step_no INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_bom_process_steps_bom_id ON bom_process_steps(bom_id)`));
    await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS mo_process_logs (
      id SERIAL PRIMARY KEY,
      mo_id INTEGER NOT NULL REFERENCES manufacturing_orders(id) ON DELETE CASCADE,
      step_no INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      qty_passed NUMERIC DEFAULT 0,
      notes TEXT,
      logged_by_employee_id INTEGER,
      logged_by_name TEXT,
      logged_at TIMESTAMP DEFAULT NOW()
    )`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_mo_process_logs_mo_id ON mo_process_logs(mo_id)`));
    await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_' || NOW()::TEXT) ON CONFLICT (config_key) DO NOTHING`));
    console.log("[migration] ✅ bom_process_steps + mo_process_logs created");
  } catch (e: any) {
    console.error("[migration] ❌ runBomProcessStepsMigration FAILED:", e.message);
  }
}

// =============================================================================
// WIP WAREHOUSE COLUMN ON MANUFACTURING ORDERS (ENTRY #014, 2026-05-17)
// Adds wip_warehouse_id column to manufacturing_orders for Raw→WIP→FG flow
// History: db/schema-history.md ENTRY #014
// =============================================================================
export async function runWipWarehouseMigration(db: any) {
  const FLAG = "ADD_WIP_WAREHOUSE_TO_MFG_ORDERS_20260517";
  try {
    const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
    if ((flag.rows || []).length > 0) return;
    await db.execute(sql.raw(`ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS wip_warehouse_id INTEGER`));
    await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_' || NOW()::TEXT) ON CONFLICT (config_key) DO NOTHING`));
    console.log("[migration] ✅ wip_warehouse_id added to manufacturing_orders");
  } catch (e: any) {
    console.error("[migration] ❌ runWipWarehouseMigration FAILED:", e.message);
  }
}

// =============================================================================
// PAYMENT_TYPE COLUMN ON PAYMENT_METHODS (ENTRY #015, 2026-05-22)
// Adds payment_type column to payment_methods for receive/pay tab filtering (N4)
// History: db/schema-history.md ENTRY #015
// =============================================================================
export async function runPaymentTypeColumnMigration(db: any) {
  const FLAG = "ADD_PAYMENT_TYPE_TO_PAYMENT_METHODS_20260522";
  try {
    const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
    if ((flag.rows || []).length > 0) return;
    await db.execute(sql.raw(`ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS payment_type text`));
    await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_' || NOW()::TEXT) ON CONFLICT (config_key) DO NOTHING`));
    console.log("[migration] ✅ payment_type added to payment_methods");
  } catch (e: any) {
    console.error("[migration] ❌ runPaymentTypeColumnMigration FAILED:", e.message);
  }
}

// =============================================================================
// RD VAT CACHE TABLES (ENTRY #016, 2026-05-22)
// rd_vat_cache: individual branch data from กรมสรรพากร SOAP lookups
// rd_crawl_status: tracks background sequential crawl progress per tax_id
// No backup needed — new tables, no existing data affected
// History: db/schema-history.md ENTRY #016
// =============================================================================
export async function runRdVatCacheMigration(db: any) {
  const FLAG = "CREATE_RD_VAT_CACHE_TABLES_20260522";
  try {
    const flag = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${FLAG}' LIMIT 1`));
    if ((flag.rows || []).length > 0) return;
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS rd_vat_cache (
        id SERIAL PRIMARY KEY,
        tax_id TEXT NOT NULL,
        branch_number INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        branch_label TEXT NOT NULL DEFAULT '',
        fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(tax_id, branch_number)
      )
    `));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_rd_vat_cache_tax_id ON rd_vat_cache(tax_id)`));
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS rd_crawl_status (
        tax_id TEXT PRIMARY KEY,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        total_found INTEGER DEFAULT 0
      )
    `));
    await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${FLAG}', 'done_' || NOW()::TEXT) ON CONFLICT (config_key) DO NOTHING`));
    console.log("[migration] ✅ rd_vat_cache + rd_crawl_status tables created");
  } catch (e: any) {
    console.error("[migration] ❌ runRdVatCacheMigration FAILED:", e.message);
  }
}

// =============================================================================
// INITIAL STOCK MOVEMENT BACKFILL (ENTRY #010, 2026-05-12) — ❌ CANCELLED
// Approach changed 2026-05-12: user inputs วันที่เริ่มต้นสต๊อก at Excel import
// time via product-import-export.tsx date picker. Backfill not needed.
// Dev data (1,091 rows + flag) were cleaned up before cancellation.
// History: db/schema-history.md ENTRY #010 (cancelled)
// =============================================================================
/*
export async function runInitialStockMovementBackfill(db: any) { ... }
*/
