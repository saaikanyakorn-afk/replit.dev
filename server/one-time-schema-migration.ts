import { db } from "./db";
import { sql } from "drizzle-orm";

const MIGRATION_KEY = "SCHEMA_MIGRATION_V85_TABLES_COLUMNS_DONE";

export async function runOneTimeSchemaV85Migration() {
  try {
    const flagRows = await db.execute(sql`SELECT config_value FROM system_config WHERE config_key = ${MIGRATION_KEY} LIMIT 1`);
    if ((flagRows.rows || []).length > 0) {
      return;
    }

    console.log("[OneTimeMigration] Starting schema v85 migration...");

    // === NEW TABLES ===

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contacts_archive (
        id INTEGER PRIMARY KEY,
        company_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        name_en TEXT,
        name_zh TEXT,
        type TEXT NOT NULL DEFAULT 'customer',
        tax_id TEXT,
        branch TEXT DEFAULT 'สำนักงานใหญ่',
        address TEXT,
        address_en TEXT,
        address_zh TEXT,
        phone TEXT,
        email TEXT,
        contact_person TEXT,
        credit_days INTEGER DEFAULT 30,
        notes TEXT,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        postcode TEXT,
        building_number TEXT,
        district_code TEXT,
        subdistrict_code TEXT,
        province_code TEXT,
        rd_code TEXT,
        dbd_code TEXT,
        sso_code TEXT,
        portal_password TEXT,
        service_fee DECIMAL(12, 2),
        archived_at TIMESTAMP DEFAULT NOW(),
        archive_reason TEXT,
        origin_company_name TEXT,
        origin_import_batch_id INTEGER,
        reference_snapshot JSONB DEFAULT '{}'
      )
    `);
    console.log("[OneTimeMigration] ✓ contacts_archive");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS expense_daily_batches (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        batch_no TEXT NOT NULL,
        batch_date DATE NOT NULL,
        total_expenses INTEGER NOT NULL DEFAULT 0,
        total_subtotal DECIMAL(15, 2) DEFAULT '0',
        total_vat DECIMAL(15, 2) DEFAULT '0',
        total_amount DECIMAL(15, 2) DEFAULT '0',
        total_wht DECIMAL(15, 2) DEFAULT '0',
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("[OneTimeMigration] ✓ expense_daily_batches");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pdf_import_templates (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        name TEXT NOT NULL,
        description TEXT,
        detect_keywords TEXT[] NOT NULL,
        field_rules JSONB NOT NULL,
        date_format TEXT DEFAULT 'DD/MM/YYYY',
        default_vat_type TEXT DEFAULT 'vat7',
        active BOOLEAN DEFAULT true,
        priority INTEGER DEFAULT 0,
        is_built_in BOOLEAN DEFAULT false,
        created_by INTEGER,
        updated_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("[OneTimeMigration] ✓ pdf_import_templates");

    // === NEW COLUMNS on existing tables ===

    const addCol = async (table: string, column: string, colDef: string) => {
      try {
        await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${colDef}`));
      } catch (e: any) {
        if (!e.message?.includes("already exists")) console.log(`[OneTimeMigration] WARN: ${table}.${column}: ${e.message}`);
      }
    };

    await addCol("machines", "display_name", "TEXT");
    await addCol("machines", "repo_name", "TEXT");
    await addCol("machines", "repo_url", "TEXT");
    await addCol("machines", "repo_branch", "TEXT DEFAULT 'main'");
    console.log("[OneTimeMigration] ✓ machines columns");

    await addCol("firm_clients", "target_db_machine_id", "INTEGER");
    console.log("[OneTimeMigration] ✓ firm_clients columns");

    await addCol("purchase_invoices", "attached_folder", "TEXT");
    console.log("[OneTimeMigration] ✓ purchase_invoices columns");

    await addCol("expenses", "ref_debit_note_id", "INTEGER");
    await addCol("expenses", "ref_debit_note_no", "TEXT");
    await addCol("expenses", "attached_folder", "TEXT");
    await addCol("expenses", "tax_invoice_ref", "TEXT");
    await addCol("expenses", "batch_id", "INTEGER REFERENCES expense_daily_batches(id)");
    console.log("[OneTimeMigration] ✓ expenses columns");

    await addCol("purchase_debit_notes", "ref_expense_id", "INTEGER");
    await addCol("purchase_debit_notes", "ref_expense_no", "TEXT");
    await addCol("purchase_debit_notes", "show_in_tax_report", "BOOLEAN DEFAULT true");
    await addCol("purchase_debit_notes", "tax_invoice_ref", "TEXT");
    await addCol("purchase_debit_notes", "batch_id", "INTEGER REFERENCES expense_daily_batches(id)");
    console.log("[OneTimeMigration] ✓ purchase_debit_notes columns");

    await addCol("sys_admins", "two_factor_method", "TEXT");
    await addCol("sys_admins", "two_factor_secret", "TEXT");
    await addCol("sys_admins", "two_factor_verified", "BOOLEAN NOT NULL DEFAULT false");
    console.log("[OneTimeMigration] ✓ sys_admins columns");

    await db.execute(sql`
      INSERT INTO system_config (config_key, config_value, description)
      VALUES (${MIGRATION_KEY}, ${"done_" + new Date().toISOString()}, 'One-time schema v85 migration — tables + columns')
      ON CONFLICT (config_key) DO NOTHING
    `);

    console.log("[OneTimeMigration] ✅ Schema v85 migration complete");
  } catch (err: any) {
    console.error("[OneTimeMigration] ❌ Error:", err.message);
  }
  // chain → next migration
  await runOneTimeSchemaV87Migration();
}

if (process.argv[1]?.includes("one-time-schema-migration")) {
  runOneTimeSchemaV85Migration().then(() => process.exit(0)).catch(() => process.exit(1));
}

// ── v87: Add warehouse_id to all sales + delivery items tables ──
const MIGRATION_KEY_V87 = "ADD_WAREHOUSE_ID_TO_SALES_ITEMS_2026-04-23";

export async function runOneTimeSchemaV87Migration() {
  try {
    const flagRows = await db.execute(sql`SELECT config_value FROM system_config WHERE config_key = ${MIGRATION_KEY_V87} LIMIT 1`);
    if ((flagRows.rows || []).length > 0) { return; }
    console.log("[OneTimeMigration] Starting schema v87 — warehouse_id to sales/delivery items...");
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    // Backup tables first — before any ALTER
    for (const tbl of ["tax_invoice_items", "sales_order_items", "receipt_items", "delivery_note_items"]) {
      const bak = `backup_${tbl}_${today}`;
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS ${bak} AS SELECT * FROM ${tbl}`));
      console.log(`[OneTimeMigration] ✓ backup ${bak}`);
    }
    const addCol = async (table: string, column: string, colDef: string) => {
      try { await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${colDef}`)); }
      catch (e: any) { if (!e.message?.includes("already exists")) console.log(`[OneTimeMigration] WARN: ${table}.${column}: ${e.message}`); }
    };
    await addCol("tax_invoice_items", "warehouse_id", "INTEGER REFERENCES warehouses(id)");
    console.log("[OneTimeMigration] ✓ tax_invoice_items.warehouse_id");
    await addCol("sales_order_items", "warehouse_id", "INTEGER REFERENCES warehouses(id)");
    console.log("[OneTimeMigration] ✓ sales_order_items.warehouse_id");
    await addCol("receipt_items", "warehouse_id", "INTEGER REFERENCES warehouses(id)");
    console.log("[OneTimeMigration] ✓ receipt_items.warehouse_id");
    await addCol("delivery_note_items", "warehouse_id", "INTEGER REFERENCES warehouses(id)");
    console.log("[OneTimeMigration] ✓ delivery_note_items.warehouse_id");
    await db.execute(sql`INSERT INTO system_config (config_key, config_value, description) VALUES (${MIGRATION_KEY_V87}, ${"done_" + new Date().toISOString()}, 'Add warehouse_id to tax_invoice_items, sales_order_items, receipt_items, delivery_note_items') ON CONFLICT (config_key) DO NOTHING`);
    console.log("[OneTimeMigration] ✅ Schema v87 complete");
  } catch (err: any) { console.error("[OneTimeMigration] ❌ Error v87:", err.message); }
}

/* ── DONE 2026-04-23: Add warehouse_id to invoice_items + purchase_invoice_items ──
 * Verified on deep-main: invoice_items.warehouse_id (integer, nullable) ✓
 *                        purchase_invoice_items.warehouse_id (integer, nullable) ✓
 * Flag: ADD_WAREHOUSE_ID_TO_INVOICE_ITEMS_2026-04-23 = done_2026-04-23T07:39:07.175Z
 *
 * const MIGRATION_KEY_V86 = "ADD_WAREHOUSE_ID_TO_INVOICE_ITEMS_2026-04-23";
 *
 * export async function runOneTimeSchemaV86Migration() {
 *   try {
 *     const flagRows = await db.execute(sql`SELECT config_value FROM system_config WHERE config_key = ${MIGRATION_KEY_V86} LIMIT 1`);
 *     if ((flagRows.rows || []).length > 0) { return; }
 *     console.log("[OneTimeMigration] Starting schema v86 migration — warehouse_id columns...");
 *     const addCol = async (table: string, column: string, colDef: string) => {
 *       try { await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${colDef}`)); }
 *       catch (e: any) { if (!e.message?.includes("already exists")) console.log(`[OneTimeMigration] WARN: ${table}.${column}: ${e.message}`); }
 *     };
 *     await addCol("invoice_items", "warehouse_id", "INTEGER REFERENCES warehouses(id)");
 *     console.log("[OneTimeMigration] ✓ invoice_items.warehouse_id");
 *     await addCol("purchase_invoice_items", "warehouse_id", "INTEGER REFERENCES warehouses(id)");
 *     console.log("[OneTimeMigration] ✓ purchase_invoice_items.warehouse_id");
 *     await db.execute(sql`INSERT INTO system_config (config_key, config_value, description) VALUES (${MIGRATION_KEY_V86}, ${"done_" + new Date().toISOString()}, 'Add warehouse_id to invoice_items and purchase_invoice_items') ON CONFLICT (config_key) DO NOTHING`);
 *     console.log("[OneTimeMigration] ✅ Schema v86 migration complete");
 *   } catch (err: any) { console.error("[OneTimeMigration] ❌ Error v86:", err.message); }
 * }
 */
