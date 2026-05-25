import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { bootstrapConfig, isUnauthorizedMachine, getUnauthorizedReason } from "./config-bootstrap";
import { db, reinitializeFromConfig } from "./db";
import { companies, accounts, journalLines, journalEntries, accountingFormulaLines, firmClients, contacts } from "@shared/schema";
import { eq, and, sql, inArray, ilike } from "drizzle-orm";
import { STANDARD_CHART_OF_ACCOUNTS, ECOMMERCE_EXTRA_ACCOUNTS, ACCOUNTING_FIRM_EXTRA_ACCOUNTS } from "@shared/chart-of-accounts";

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

const originalExit = process.exit;
process.exit = function(code?: number) {
  if (code === 1) {
    console.error("process.exit(1) intercepted - keeping server alive");
    return undefined as never;
  }
  return originalExit.call(process, code);
} as typeof process.exit;

const app = express();
const httpServer = createServer(app);

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

function buildTemplateMap(businessType?: string) {
  const extras = (businessType === "service" || businessType === "accounting" || businessType === "accounting_firm") ? ACCOUNTING_FIRM_EXTRA_ACCOUNTS : ECOMMERCE_EXTRA_ACCOUNTS;
  const all = [...STANDARD_CHART_OF_ACCOUNTS, ...extras];
  const map = new Map<string, { name: string; nameTh: string; nameZh: string; type: string; parentCode: string | null }>();
  for (const a of all) {
    map.set(a.code, { name: a.name, nameTh: a.nameTh, nameZh: a.nameZh, type: a.type, parentCode: a.parentCode });
  }
  return map;
}

export async function migrateChartOfAccountCodes() {
  try {
    const allCompanies = await db.select({ id: companies.id, businessType: companies.businessType }).from(companies);
    if (allCompanies.length === 0) return;

    let totalChanges = 0;

    for (const company of allCompanies) {
      const templateMap = buildTemplateMap(company.businessType || undefined);
      await db.transaction(async (tx) => {
        const existing = await tx.select({ id: accounts.id, code: accounts.code, parentCode: accounts.parentCode, name: accounts.name, nameTh: accounts.nameTh, nameZh: accounts.nameZh })
          .from(accounts)
          .where(eq(accounts.companyId, company.id));

        const existingCodes = new Set(existing.map(a => a.code));
        let changes = 0;


        const updatedAccounts = await tx.select({ code: accounts.code }).from(accounts)
          .where(eq(accounts.companyId, company.id));
        const updatedCodes = new Set(updatedAccounts.map(a => a.code));

        const neededParents = new Set<string>();
        for (const acc of updatedAccounts) {
          const tmpl = templateMap.get(acc.code);
          if (tmpl?.parentCode && !updatedCodes.has(tmpl.parentCode)) {
            neededParents.add(tmpl.parentCode);
          }
        }

        let addedNewHeaders = true;
        while (addedNewHeaders) {
          addedNewHeaders = false;
          const newParentsNeeded = new Set<string>();
          for (const parentCode of neededParents) {
            if (!updatedCodes.has(parentCode)) {
              const tmpl = templateMap.get(parentCode);
              if (tmpl) {
                try {
                  await tx.insert(accounts).values({
                    companyId: company.id,
                    code: parentCode,
                    name: tmpl.name,
                    nameTh: tmpl.nameTh,
                    nameZh: tmpl.nameZh || "",
                    type: tmpl.type,
                    parentCode: tmpl.parentCode,
                    isHeader: true,
                  }).onConflictDoNothing();
                } catch (e: any) { /* skip duplicate */ }
                updatedCodes.add(parentCode);
                changes++;
                if (tmpl.parentCode && !updatedCodes.has(tmpl.parentCode)) {
                  newParentsNeeded.add(tmpl.parentCode);
                  addedNewHeaders = true;
                }
              }
            }
          }
          neededParents.clear();
          for (const p of newParentsNeeded) neededParents.add(p);
        }


        for (const [code, tmpl] of templateMap) {
          if (updatedCodes.has(code)) continue;
          const isHeader = code.length <= 3;
          try {
            await tx.insert(accounts).values({
              companyId: company.id,
              code,
              name: tmpl.name,
              nameTh: tmpl.nameTh,
              nameZh: tmpl.nameZh || "",
              type: tmpl.type,
              parentCode: tmpl.parentCode,
              isHeader,
            }).onConflictDoNothing();
            updatedCodes.add(code);
            changes++;
          } catch (e: any) { /* skip duplicate */ }
        }

        for (const acc of updatedAccounts) {
          const tmpl = templateMap.get(acc.code);
          if (tmpl) {
            const updateData: any = {};
            let needsUpdate = false;
            const ex = existing.find(e => e.code === acc.code) as any;
            if (ex && tmpl.nameTh && ex.nameTh !== tmpl.nameTh) {
              updateData.nameTh = tmpl.nameTh;
              needsUpdate = true;
            }
            if (ex && tmpl.nameZh && ex.nameZh !== tmpl.nameZh) {
              updateData.nameZh = tmpl.nameZh;
              needsUpdate = true;
            }
            if (ex && tmpl.name && ex.name !== tmpl.name) {
              updateData.name = tmpl.name;
              needsUpdate = true;
            }
            if (needsUpdate) {
              try {
                await tx.update(accounts).set(updateData)
                  .where(and(eq(accounts.companyId, company.id), eq(accounts.code, acc.code)));
                changes++;
              } catch (e: any) { /* skip */ }
            }
          }
        }

        totalChanges += changes;
      });
    }

    log(`COA migration: ${totalChanges} changes across ${allCompanies.length} companies`);
  } catch (err) {
    console.error("Error in COA code migration:", err);
  }

  try {
    const backfilled = await db.execute(sql.raw(`
      UPDATE employees e SET tenant_id = u.tenant_id
      FROM users u WHERE e.user_id = u.id AND u.tenant_id IS NOT NULL AND e.tenant_id IS NULL
    `));
    if (backfilled.rowCount && backfilled.rowCount > 0) {
      log(`Employee tenant backfill: ${backfilled.rowCount} employees updated`);
    }
    const companyBackfill = await db.execute(sql.raw(`
      UPDATE employees e SET company_id = c.id
      FROM companies c WHERE c.tenant_id = e.tenant_id AND c.is_primary = true AND e.company_id IS NULL AND e.tenant_id IS NOT NULL
    `));
    if (companyBackfill.rowCount && companyBackfill.rowCount > 0) {
      log(`Employee company backfill: ${companyBackfill.rowCount} employees updated`);
    }
  } catch (err) {
    console.error("Error in employee tenant backfill:", err);
  }
}

const SCHEMA_VERSION = "100";

async function autoSyncSchema() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS schema_version (
        id SERIAL PRIMARY KEY,
        version TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        up_sql TEXT NOT NULL DEFAULT '',
        down_sql TEXT NOT NULL DEFAULT '',
        applied_at TIMESTAMP DEFAULT NOW(),
        change_type TEXT DEFAULT 'schema',
        files_changed TEXT,
        reverted_at TIMESTAMP,
        push_ref TEXT,
        reason TEXT,
        db_targets TEXT[] DEFAULT '{}',
        applied_targets TEXT[] DEFAULT '{}',
        repo_targets TEXT[] DEFAULT '{}',
        pushed_repos TEXT[] DEFAULT '{}'
      )
    `));

    const result = await db.execute(sql.raw(`SELECT version FROM schema_version ORDER BY id DESC LIMIT 1`));
    const currentVersion = (result.rows as any[])[0]?.version || null;

    const { fullSchemaSync } = await import("./db-schema-sync");
    if (currentVersion === SCHEMA_VERSION) {
      log(`Schema version ${SCHEMA_VERSION} - up to date, running safety check...`);
      await fullSchemaSync();
      return;
    }

    log(`Schema version mismatch: DB=${currentVersion || "none"} → Code=${SCHEMA_VERSION}, syncing...`);

    await fullSchemaSync();
    log("Schema sync via db-schema-sync only (drizzle-kit push disabled to prevent data loss)");

    log(`Database schema sync complete — version ${SCHEMA_VERSION}`);
  } catch (err: any) {
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
    console.error("Schema sync error:", typeof output === "string" ? output.slice(0, 500) : err.message);
  }
}

async function repairPettyCashData() {
  const fundCount = await db.execute(sql.raw("SELECT COUNT(*)::int AS cnt FROM petty_cash_funds"));
  if ((fundCount.rows as any[])[0]?.cnt > 0) return;

  const jeRows = await db.execute(sql.raw(`
    SELECT je.id, je.description, je.source_doc_type, je.source_doc_id, je.company_id, je.created_by, je.created_at
    FROM journal_entries je
    WHERE je.description ILIKE '%เงินสดย่อย%'
    ORDER BY je.id
  `));
  const allJEs = jeRows.rows as any[];
  if (allJEs.length === 0) return;

  const fundJE = allJEs.find(r => r.description.includes("ตั้งวงเงินสดย่อย"));
  if (!fundJE) { console.log("[petty-cash-repair] No fund setup JE found, skipping"); return; }

  const lines = await db.execute(sql.raw(`
    SELECT jl.account_id, jl.debit, jl.credit, a.code
    FROM journal_lines jl
    JOIN accounts a ON a.id = jl.account_id
    WHERE jl.journal_entry_id = ${fundJE.id}
  `));
  const lineRows = lines.rows as any[];
  const debitLine = lineRows.find((l: any) => Number(l.debit) > 0);
  const creditLine = lineRows.find((l: any) => Number(l.credit) > 0);
  if (!debitLine || !creditLine) { console.log("[petty-cash-repair] Cannot determine accounts from JE, skipping"); return; }

  const pettyCashCode = debitLine.code;
  const cashCode = creditLine.code;
  const fundLimit = Number(debitLine.debit);
  const fundName = fundJE.description.replace("ตั้งวงเงินสดย่อย - ", "");

  const txnJEs = allJEs.filter(r => r.source_doc_type === "petty_cash_txn");
  let balance = fundLimit;
  const txnData: any[] = [];
  for (const tje of txnJEs) {
    const tLines = await db.execute(sql.raw(`
      SELECT jl.account_id, jl.debit, jl.credit, a.code, a.name_th
      FROM journal_lines jl
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.journal_entry_id = ${tje.id}
    `));
    const tRows = tLines.rows as any[];
    const expLine = tRows.find((l: any) => Number(l.debit) > 0);
    const isReplenish = tje.description.includes("เติมเงิน") || tje.description.includes("เบิกชดเชย");
    const amount = isReplenish ? Number(expLine?.debit || 0) : Number(expLine?.debit || 0);
    balance += isReplenish ? amount : -amount;
    const desc = tje.description.replace(/^เบิกเงินสดย่อย - |^เติมเงินสดย่อย - /, "");
    txnData.push({
      txnType: isReplenish ? "replenish" : "expense",
      description: desc,
      amount,
      expenseCode: isReplenish ? null : expLine?.code,
      expenseName: isReplenish ? null : expLine?.name_th,
      createdBy: tje.created_by,
      createdAt: tje.created_at,
      jeId: tje.id,
      txnDate: new Date(tje.created_at).toISOString().slice(0, 10),
    });
  }

  const fundRes = await db.execute(sql.raw(`
    INSERT INTO petty_cash_funds (company_id, name, fund_limit, current_balance, cash_account_code, petty_cash_account_code, status, created_by, created_at, journal_entry_id)
    VALUES (${fundJE.company_id}, '${fundName.replace(/'/g, "''")}', ${fundLimit}, ${balance}, '${cashCode}', '${pettyCashCode}', 'active', ${fundJE.created_by || "NULL"}, '${fundJE.created_at}', ${fundJE.id})
    RETURNING id
  `));
  const newFundId = (fundRes.rows as any[])[0]?.id;
  console.log(`[petty-cash-repair] Restored fund: "${fundName}" limit=${fundLimit} balance=${balance} (id=${newFundId})`);

  await db.execute(sql.raw(`UPDATE journal_entries SET source_doc_id = ${newFundId} WHERE id = ${fundJE.id}`));

  for (const t of txnData) {
    const expCodeSql = t.expenseCode ? `'${t.expenseCode}'` : "NULL";
    const expNameSql = t.expenseName ? `'${t.expenseName.replace(/'/g, "''")}'` : "NULL";
    const txnRes = await db.execute(sql.raw(`
      INSERT INTO petty_cash_transactions (fund_id, company_id, txn_date, txn_type, description, amount, expense_account_code, expense_account_name, status, created_by, created_at, journal_entry_id)
      VALUES (${newFundId}, ${fundJE.company_id}, '${t.txnDate}', '${t.txnType}', '${t.description.replace(/'/g, "''")}', ${t.amount}, ${expCodeSql}, ${expNameSql}, 'approved', ${t.createdBy || "NULL"}, '${t.createdAt}', ${t.jeId})
      RETURNING id
    `));
    const newTxnId = (txnRes.rows as any[])[0]?.id;
    await db.execute(sql.raw(`UPDATE journal_entries SET source_doc_id = ${newTxnId} WHERE id = ${t.jeId}`));
    console.log(`[petty-cash-repair]   Restored txn: "${t.description}" ${t.txnType} ${t.amount} (id=${newTxnId})`);
  }
  console.log(`[petty-cash-repair] Complete — restored 1 fund + ${txnData.length} transactions`);
}

async function ensureCriticalTables() {
  const tables = [
    {
      name: "work_locations",
      ddl: `CREATE TABLE IF NOT EXISTS work_locations (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        name TEXT NOT NULL,
        address TEXT,
        lat DECIMAL(10,7) NOT NULL DEFAULT 0,
        lng DECIMAL(10,7) NOT NULL DEFAULT 0,
        radius_meters INTEGER NOT NULL DEFAULT 200,
        active BOOLEAN NOT NULL DEFAULT true
      )`
    },
  ];
  for (const t of tables) {
    try {
      const res = await db.execute(sql.raw(
        `SELECT 1 FROM information_schema.tables WHERE table_name='${t.name}'`
      ));
      if ((res.rows as any[]).length === 0) {
        await db.execute(sql.raw(t.ddl));
        log(`Created missing table: ${t.name}`);
      }
    } catch (e: any) {
      console.warn(`Table check warning (${t.name}):`, e.message?.slice(0, 100));
    }
  }
}

async function ensureCriticalColumns() {
  const checks: { table: string; column: string; ddl: string }[] = [
    { table: "employees", column: "exempt_from_checkin", ddl: "ALTER TABLE employees ADD COLUMN IF NOT EXISTS exempt_from_checkin BOOLEAN NOT NULL DEFAULT false" },
    { table: "employees", column: "employment_status", ddl: "ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active'" },
    { table: "employees", column: "work_location_id", ddl: "ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_location_id INTEGER" },
    { table: "accounts", column: "is_header", ddl: "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_header BOOLEAN NOT NULL DEFAULT false" },
    { table: "attendance_records", column: "work_location_id", ddl: "ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS work_location_id INTEGER" },
    { table: "work_schedules", column: "ot_cutoff_day", ddl: "ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS ot_cutoff_day INTEGER DEFAULT 25" },
    { table: "employees", column: "income_type", ddl: "ALTER TABLE employees ADD COLUMN IF NOT EXISTS income_type TEXT NOT NULL DEFAULT '1'" },
    { table: "employees", column: "resign_date", ddl: "ALTER TABLE employees ADD COLUMN IF NOT EXISTS resign_date DATE" },
    { table: "companies", column: "etax_enabled", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS etax_enabled BOOLEAN NOT NULL DEFAULT false" },
    { table: "payroll_records", column: "sso_exempt", ddl: "ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS sso_exempt BOOLEAN DEFAULT false" },
    { table: "payroll_records", column: "tax_deductions", ddl: "ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS tax_deductions JSONB DEFAULT '[]'" },
    { table: "payroll_records", column: "paid_date", ddl: "ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS paid_date DATE" },
    { table: "payroll_records", column: "journal_entry_id", ddl: "ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER" },
    { table: "withholding_tax_certs", column: "income_type", ddl: "ALTER TABLE withholding_tax_certs ADD COLUMN IF NOT EXISTS income_type TEXT" },
    { table: "withholding_tax_certs", column: "paid_date", ddl: "ALTER TABLE withholding_tax_certs ADD COLUMN IF NOT EXISTS paid_date DATE" },
    { table: "wht_cert_items", column: "income_type", ddl: "ALTER TABLE wht_cert_items ADD COLUMN IF NOT EXISTS income_type TEXT NOT NULL DEFAULT '5'" },
    { table: "wht_cert_items", column: "paid_date", ddl: "ALTER TABLE wht_cert_items ADD COLUMN IF NOT EXISTS paid_date DATE" },
    { table: "companies", column: "etax_email", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS etax_email TEXT" },
    { table: "companies", column: "etax_timestamp_email", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS etax_timestamp_email TEXT DEFAULT 'csemail@etax.teda.th'" },
    { table: "companies", column: "etax_buyer_test_email", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS etax_buyer_test_email TEXT" },
    { table: "companies", column: "seller_branch_id", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS seller_branch_id TEXT DEFAULT '00000'" },
    { table: "companies", column: "seller_building_name", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS seller_building_name TEXT" },
    { table: "companies", column: "seller_postcode", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS seller_postcode TEXT" },
    { table: "companies", column: "name_en", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS name_en TEXT" },
    { table: "companies", column: "name_zh", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS name_zh TEXT" },
    { table: "companies", column: "address_en", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS address_en TEXT" },
    { table: "companies", column: "address_zh", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS address_zh TEXT" },
    { table: "companies", column: "fax", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS fax TEXT" },
    { table: "companies", column: "website", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT" },
    { table: "companies", column: "line_id", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS line_id TEXT" },
    { table: "companies", column: "facebook", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS facebook TEXT" },
    { table: "companies", column: "instagram", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS instagram TEXT" },
    { table: "companies", column: "tiktok", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS tiktok TEXT" },
    { table: "companies", column: "base_currency", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'THB'" },
    { table: "companies", column: "vat_registered", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN NOT NULL DEFAULT false" },
    { table: "companies", column: "vat_registered_date", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_registered_date DATE" },
    { table: "companies", column: "asset_min_threshold", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS asset_min_threshold DECIMAL(15,2) DEFAULT 0" },
    { table: "companies", column: "inventory_costing_method", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS inventory_costing_method TEXT NOT NULL DEFAULT 'moving_average'" },
    { table: "companies", column: "inventory_accounting_method", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS inventory_accounting_method TEXT NOT NULL DEFAULT 'none'" },
    { table: "companies", column: "stock_entry_source", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS stock_entry_source TEXT NOT NULL DEFAULT 'gr'" },
    { table: "companies", column: "ecom_auto_receive_stock", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS ecom_auto_receive_stock BOOLEAN NOT NULL DEFAULT false" },
    { table: "companies", column: "accounting_mode", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS accounting_mode TEXT NOT NULL DEFAULT 'full_accounting'" },
    { table: "companies", column: "auto_tiv_on_shipped", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_tiv_on_shipped BOOLEAN NOT NULL DEFAULT false" },
    { table: "companies", column: "gps_required", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS gps_required BOOLEAN NOT NULL DEFAULT false" },
    { table: "companies", column: "office_lat", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS office_lat DECIMAL(10,7)" },
    { table: "companies", column: "office_lng", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS office_lng DECIMAL(10,7)" },
    { table: "companies", column: "gps_radius_meters", ddl: "ALTER TABLE companies ADD COLUMN IF NOT EXISTS gps_radius_meters INTEGER DEFAULT 200" },
    { table: "sales_orders", column: "seller_branch_id", ddl: "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "quotations", column: "seller_branch_id", ddl: "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "invoices", column: "seller_branch_id", ddl: "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "tax_invoices", column: "seller_branch_id", ddl: "ALTER TABLE tax_invoices ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "receipts", column: "seller_branch_id", ddl: "ALTER TABLE receipts ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "billing_notes", column: "seller_branch_id", ddl: "ALTER TABLE billing_notes ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "payment_vouchers", column: "seller_branch_id", ddl: "ALTER TABLE payment_vouchers ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "purchase_requests", column: "seller_branch_id", ddl: "ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "purchase_orders", column: "seller_branch_id", ddl: "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "purchase_invoices", column: "seller_branch_id", ddl: "ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "expenses", column: "seller_branch_id", ddl: "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "deposit_receipts", column: "seller_branch_id", ddl: "ALTER TABLE deposit_receipts ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "sales_credit_notes", column: "seller_branch_id", ddl: "ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "purchase_debit_notes", column: "seller_branch_id", ddl: "ALTER TABLE purchase_debit_notes ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "purchase_deposits", column: "seller_branch_id", ddl: "ALTER TABLE purchase_deposits ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "bid_comparisons", column: "seller_branch_id", ddl: "ALTER TABLE bid_comparisons ADD COLUMN IF NOT EXISTS seller_branch_id TEXT" },
    { table: "payroll_records", column: "commission_amount", ddl: "ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(12,2) DEFAULT '0'" },
    { table: "users", column: "allowed_company_ids", ddl: "ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_company_ids INTEGER[]" },
  ];
  let fixed = 0;
  for (const c of checks) {
    try {
      const res = await db.execute(sql.raw(
        `SELECT 1 FROM information_schema.columns WHERE table_name='${c.table}' AND column_name='${c.column}'`
      ));
      if ((res.rows as any[]).length === 0) {
        await db.execute(sql.raw(c.ddl));
        fixed++;
        log(`Added missing column: ${c.table}.${c.column}`);
      }
    } catch (e: any) {
      console.warn(`Column check warning (${c.table}.${c.column}):`, e.message?.slice(0, 100));
    }
  }
  if (fixed > 0) log(`Fixed ${fixed} missing column(s) after schema sync`);
}

async function seedHeaderFlags() {
  try {
    const allCompanies = await db.select({ id: companies.id, businessType: companies.businessType }).from(companies);
    let updatedCount = 0;
    let insertedCount = 0;

    for (const company of allCompanies) {
      const companyAccounts = await db.select({ id: accounts.id, code: accounts.code, parentCode: accounts.parentCode, isHeader: accounts.isHeader })
        .from(accounts)
        .where(eq(accounts.companyId, company.id));

      const existingCodes = new Set(companyAccounts.map(a => a.code));

      const bt = company.businessType;
      if ((bt === "online_shop" || bt === "ecommerce") && existingCodes.has("123") && !existingCodes.has("1231000")) {
        const ecomSubAccounts = ECOMMERCE_EXTRA_ACCOUNTS.filter(a => a.parentCode === "123");
        for (const tmpl of ecomSubAccounts) {
          if (!existingCodes.has(tmpl.code)) {
            try {
              const result = await db.execute(sql.raw(
                `INSERT INTO accounts (company_id, code, name, name_th, name_zh, type, parent_code, is_header)
                 VALUES (${company.id}, '${tmpl.code}', '${tmpl.name.replace(/'/g, "''")}', '${tmpl.nameTh.replace(/'/g, "''")}', '${(tmpl.nameZh || "").replace(/'/g, "''")}', '${tmpl.type}', '${tmpl.parentCode}', false)
                 ON CONFLICT (company_id, code) DO NOTHING`
              ));
              existingCodes.add(tmpl.code);
              insertedCount++;
            } catch (e: any) { /* skip if error */ }
          }
        }
        // Re-fetch after inserts
        const refreshed = await db.select({ id: accounts.id, code: accounts.code, parentCode: accounts.parentCode, isHeader: accounts.isHeader })
          .from(accounts).where(eq(accounts.companyId, company.id));
        companyAccounts.length = 0;
        companyAccounts.push(...refreshed);
      }

      const parentCodes = new Set(companyAccounts.map(a => a.parentCode).filter(Boolean));

      for (const acc of companyAccounts) {
        const shouldBeHeader = parentCodes.has(acc.code);
        if (acc.isHeader !== shouldBeHeader) {
          await db.update(accounts).set({ isHeader: shouldBeHeader }).where(eq(accounts.id, acc.id));
          updatedCount++;
        }
      }
    }

    if (insertedCount > 0) {
      log(`Seeded ${insertedCount} missing ecommerce sub-accounts`);
    }
    if (updatedCount > 0) {
      log(`Updated isHeader flag for ${updatedCount} accounts across ${allCompanies.length} companies`);
    }

    let backfilledCount = 0;
    for (const company of allCompanies) {
      const templateMap = buildTemplateMap(company.businessType || undefined);
      const accs = await db.select({ id: accounts.id, code: accounts.code, nameTh: accounts.nameTh, nameZh: accounts.nameZh })
        .from(accounts).where(eq(accounts.companyId, company.id));
      for (const acc of accs) {
        const tmpl = templateMap.get(acc.code);
        if (!tmpl) continue;
        const updates: any = {};
        if ((!acc.nameTh || acc.nameTh === "-") && tmpl.nameTh) updates.nameTh = tmpl.nameTh;
        if ((!acc.nameZh || acc.nameZh === "-") && tmpl.nameZh) updates.nameZh = tmpl.nameZh;
        if (Object.keys(updates).length > 0) {
          await db.update(accounts).set(updates).where(eq(accounts.id, acc.id));
          backfilledCount++;
        }
      }
    }
    if (backfilledCount > 0) {
      log(`Backfilled nameTh/nameZh for ${backfilledCount} accounts`);
    }
  } catch (err) {
    console.error("Error seeding header flags:", err);
  }
}

async function createPerformanceIndexes() {
  try {
    const indexes = [
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ecommerce_orders_company_id ON ecommerce_orders (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ecommerce_orders_company_status ON ecommerce_orders (company_id, status)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ecommerce_orders_company_created ON ecommerce_orders (company_id, created_at DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ecommerce_orders_platform_order ON ecommerce_orders (company_id, platform, platform_order_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ecommerce_orders_placed_at ON ecommerce_orders (placed_at DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ecommerce_orders_settlement ON ecommerce_orders (company_id, settlement_status)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ecommerce_order_items_order ON ecommerce_order_items (order_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_company ON journal_entries (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_company_date ON journal_entries (company_id, entry_date DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_company_book ON journal_entries (company_id, journal_book)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_source ON journal_entries (source_doc_type, source_doc_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_lines_entry ON journal_lines (journal_entry_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_lines_account ON journal_lines (account_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_orders_company ON sales_orders (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_orders_company_status ON sales_orders (company_id, status)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_orders_company_date ON sales_orders (company_id, order_date DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company ON invoices (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_status ON invoices (company_id, status)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_date ON invoices (company_id, invoice_date DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_invoices_company ON tax_invoices (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tax_invoices_company_date ON tax_invoices (company_id, tax_invoice_date DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receipts_company ON receipts (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_receipts_company_date ON receipts (company_id, receipt_date DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_company ON contacts (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_company ON products (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_stock_company ON product_stock (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_stock_product ON product_stock (product_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_movements_company ON stock_movements (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stock_movements_date ON stock_movements (company_id, created_at DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_company ON accounts (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_company_code ON accounts (company_id, code)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_cf_orders_company ON live_cf_orders (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_live_cf_orders_session ON live_cf_orders (session_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_logs_company ON sync_logs (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_logs_connection ON sync_logs (connection_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_job_queue_status ON sync_job_queue (status, scheduled_at)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sync_job_queue_company ON sync_job_queue (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_archive_ecom_company ON archive_ecommerce_orders (company_id, archived_at DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_archive_journal_company ON archive_journal_entries (company_id, archived_at DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_employee_date ON attendance_records (employee_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_employee ON attendance_records (employee_id, date DESC)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ecommerce_connections_company ON ecommerce_connections (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_restaurant_orders_company ON restaurant_orders (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_picking_waves_company ON picking_waves (company_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wbi_board ON work_board_items (board_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wbg_board ON work_board_groups (board_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wbc_board ON work_board_columns (board_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wbsi_item ON work_board_subitems (item_id)`,
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wbiu_item_type ON work_board_item_updates (item_id, update_type)`,
    ];

    let created = 0;
    for (const idx of indexes) {
      try {
        await db.execute(sql.raw(idx));
        created++;
      } catch (e: any) {
        if (!e.message?.includes("already exists")) {
          console.warn(`Index warning: ${e.message?.slice(0, 100)}`);
        }
      }
    }
    if (created > 0) {
      log(`Performance indexes verified/created: ${created}/${indexes.length}`);
    }
  } catch (err) {
    console.error("Error creating performance indexes:", err);
  }
}

function checkEnvVars() {
  const required: { key: string; description: string; critical: boolean }[] = [
    { key: "DATABASE_URL", description: "PostgreSQL connection string", critical: true },
  ];

  const recommended: { key: string; description: string }[] = [
    { key: "LINE_CHANNEL_ACCESS_TOKEN", description: "LINE Messaging API token (for LINE notifications)" },
    { key: "RESEND_API_KEY", description: "Resend email service API key" },
    { key: "RESEND_FROM_EMAIL", description: "Sender email address for Resend" },
  ];

  let hasCriticalMissing = false;

  for (const env of required) {
    if (!process.env[env.key]) {
      console.error(`\x1b[31m✗ MISSING REQUIRED: ${env.key} — ${env.description}\x1b[0m`);
      if (env.critical) hasCriticalMissing = true;
    }
  }

  const missing = recommended.filter(e => !process.env[e.key]);
  if (missing.length > 0) {
    log(`Optional .env vars not set (features may be limited):`);
    for (const env of missing) {
      console.warn(`\x1b[33m⚠ ${env.key} — ${env.description}\x1b[0m`);
    }
  }

  if (hasCriticalMissing) {
    console.error("\x1b[31m\nPlease add the missing required variables to your .env file and restart.\x1b[0m");
    process.exit(1);
  }
}

async function seedDefaultAdmin() {
  try {
    const existing = await db.execute(sql.raw("SELECT id FROM users WHERE username = 'admin' LIMIT 1"));
    if ((existing.rows as any[]).length === 0) {
      const { hashPassword } = await import("./auth");
      const hashed = await hashPassword("admin123");
      await db.execute(sql.raw(
        `INSERT INTO users (username, password, full_name, role, email, active)
         VALUES ('admin', '${hashed}', 'ผู้ดูแลระบบ', 'admin', 'admin@etax.co.th', true)
         ON CONFLICT (username) DO NOTHING`
      ));
      log("Seeded default admin user");
    }

    const platformCheck = await db.execute(sql.raw("SELECT id FROM users WHERE username = 'platform' LIMIT 1"));
    if ((platformCheck.rows as any[]).length === 0) {
      const { hashPassword } = await import("./auth");
      const hashed = await hashPassword("platform123");
      await db.execute(sql.raw(
        `INSERT INTO users (username, password, full_name, role, email, active)
         VALUES ('platform', '${hashed}', 'เจ้าของแพลตฟอร์ม', 'super_admin', 'platform@etax.co.th', true)
         ON CONFLICT (username) DO NOTHING`
      ));
      log("Seeded platform super admin user");
    }

    const testCheck = await db.execute(sql.raw("SELECT id FROM users WHERE username = 'test' LIMIT 1"));
    if ((testCheck.rows as any[]).length === 0) {
      const { hashPassword } = await import("./auth");
      const hashed = await hashPassword("test123");
      let demoTenantId: number;
      const dtCheck = await db.execute(sql.raw("SELECT id FROM tenants WHERE name = 'Demo Tenant' LIMIT 1"));
      if ((dtCheck.rows as any[]).length > 0) {
        demoTenantId = (dtCheck.rows as any[])[0].id;
      } else {
        const dtInsert = await db.execute(sql.raw(
          `INSERT INTO tenants (name, tenant_type, status, contact_name, contact_email)
           VALUES ('Demo Tenant', 'general_business', 'active', 'ผู้ใช้ทดสอบ', 'test@demo.co.th')
           RETURNING id`
        ));
        demoTenantId = (dtInsert.rows as any[])[0].id;
        await db.execute(sql.raw(
          `INSERT INTO companies (name, industry, tax_id, address, phone, active, is_primary, tenant_type, tenant_id, business_type, vat_registered, base_currency, branch)
           VALUES ('บริษัท เดโม่ ทดสอบ จำกัด', 'เทคโนโลยี', '0000000000000', '123/45 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110', '02-000-0000', true, true, 'general_business', ${demoTenantId}, 'company', true, 'THB', 'สำนักงานใหญ่')`
        ));
        log("Seeded Demo Tenant + Company");
      }
      await db.execute(sql.raw(
        `INSERT INTO users (username, password, full_name, role, email, active, tenant_id)
         VALUES ('test', '${hashed}', 'ผู้ใช้ทดสอบ', 'admin', 'test@demo.co.th', true, ${demoTenantId})
         ON CONFLICT (username) DO NOTHING`
      ));
      log("Seeded test user (test/test123) on Demo Tenant");
    }

    const companyCheck = await db.execute(sql.raw("SELECT id FROM companies LIMIT 1"));
    if ((companyCheck.rows as any[]).length === 0) {
      const seedCompanies = [
        { name: "TechStart Innovations", industry: "Technology", taxId: "1234567890123" },
        { name: "GreenEarth Logistics", industry: "Logistics", taxId: "9876543210123" },
        { name: "Urban Retail Group", industry: "Retail", taxId: "5555666677778" },
      ];
      for (const c of seedCompanies) {
        await db.execute(sql.raw(
          `INSERT INTO companies (name, industry, tax_id, active)
           VALUES ('${c.name}', '${c.industry}', '${c.taxId}', true)
           ON CONFLICT DO NOTHING`
        ));
      }
      log("Seeded default companies");
    }

    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS landing_content (
        id SERIAL PRIMARY KEY,
        section_type TEXT NOT NULL,
        title TEXT,
        subtitle TEXT,
        items JSONB DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        updated_at TIMESTAMP DEFAULT NOW(),
        updated_by INTEGER REFERENCES users(id)
      )
    `));
    const landingCheck = await db.execute(sql.raw("SELECT id FROM landing_content LIMIT 1"));
    if ((landingCheck.rows as any[]).length === 0) {
      const defaultSections = [
        { section_type: "featured_clients", title: "ลูกค้าที่ไว้วางใจ", subtitle: "บริษัทชั้นนำที่เลือกใช้บริการของเรา", items: "[]", sort_order: 1 },
        { section_type: "testimonials", title: "รีวิวจากลูกค้า", subtitle: "ความคิดเห็นจากผู้ใช้งานจริง", items: "[]", sort_order: 2 },
        { section_type: "video_demos", title: "วิดีโอสาธิต", subtitle: "ดูการทำงานจริงของระบบ", items: "[]", sort_order: 3 },
        { section_type: "platforms", title: "แพลตฟอร์มที่เชื่อมต่อ", subtitle: "เชื่อมต่อกับแพลตฟอร์มชั้นนำ", items: "[]", sort_order: 4 },
        { section_type: "faq", title: "คำถามที่พบบ่อย", subtitle: "คำตอบสำหรับคำถามยอดนิยม", items: "[]", sort_order: 5 },
      ];
      for (const s of defaultSections) {
        await db.execute(sql.raw(
          `INSERT INTO landing_content (section_type, title, subtitle, items, sort_order, active)
           VALUES ('${s.section_type}', '${s.title}', '${s.subtitle}', '${s.items}', ${s.sort_order}, true)
           ON CONFLICT DO NOTHING`
        ));
      }
      log("Seeded landing content sections");
    }

    const planCheck = await db.execute(sql.raw("SELECT id FROM subscription_plans LIMIT 1"));
    if ((planCheck.rows as any[]).length === 0) {
      const seedPlans = [
        { code: "free", name: "ฟรี", name_en: "Free", description: "เริ่มต้นใช้งานฟรี เหมาะสำหรับธุรกิจขนาดเล็ก", monthly_price: "0", yearly_price: "0", max_users: 2, max_documents_per_month: 50, max_companies: 1, max_ecommerce_connections: 0, max_products: 100, sort_order: 1 },
        { code: "starter", name: "Starter", name_en: "Starter", description: "สำหรับธุรกิจที่เริ่มเติบโต", monthly_price: "590", yearly_price: "5900", max_users: 5, max_documents_per_month: 500, max_companies: 3, max_ecommerce_connections: 2, max_products: 1000, sort_order: 2 },
        { code: "pro", name: "Professional", name_en: "Professional", description: "สำหรับธุรกิจขนาดกลาง ฟีเจอร์ครบ", monthly_price: "1490", yearly_price: "14900", max_users: 20, max_documents_per_month: 5000, max_companies: 10, max_ecommerce_connections: 5, max_products: 10000, sort_order: 3 },
        { code: "enterprise", name: "Enterprise", name_en: "Enterprise", description: "สำหรับองค์กรขนาดใหญ่ ไม่จำกัดการใช้งาน", monthly_price: "4990", yearly_price: "49900", max_users: 999, max_documents_per_month: 999999, max_companies: 999, max_ecommerce_connections: 999, max_products: 999999, sort_order: 4 },
      ];
      for (const p of seedPlans) {
        await db.execute(sql.raw(
          `INSERT INTO subscription_plans (code, name, name_en, description, monthly_price, yearly_price, max_users, max_documents_per_month, max_companies, max_ecommerce_connections, max_products, sort_order, active)
           VALUES ('${p.code}', '${p.name}', '${p.name_en}', '${p.description}', '${p.monthly_price}', '${p.yearly_price}', ${p.max_users}, ${p.max_documents_per_month}, ${p.max_companies}, ${p.max_ecommerce_connections}, ${p.max_products}, ${p.sort_order}, true)
           ON CONFLICT (code) DO NOTHING`
        ));
      }
      log("Seeded subscription plans");
    }
  } catch (err: any) {
    console.warn("Admin seed warning:", err.message?.slice(0, 100));
  }
}

let migrationReady = false;

async function runMigrationsInBackground() {
  try {
    await autoSyncSchema();
    await ensureCriticalTables();
    await ensureCriticalColumns();
    // ONE-TIME MIGRATION: schema v85 — new tables + columns for push without schema.ts
    // After production verified, remark this block out and push clean in next cycle
    try {
      const { runOneTimeSchemaV85Migration } = await import("./one-time-schema-migration");
      await runOneTimeSchemaV85Migration();
    } catch (e: any) {
      console.error("[OneTimeMigration] import/run error:", e.message);
    }
    // DATA FIX DONE 2026-04-27 — hook removed after verified. See schema-extra.ts history.
    // try { const { fixEtaxSentToInvoice459 } = await import("@shared/schema-extra"); await fixEtaxSentToInvoice459(db); } catch (e: any) { console.error("[DataFix] fixEtaxSentToInvoice459 error:", e.message); }
    migrationReady = true;
    log("Core schema ready - API enabled");
    try {
      const ruleRows = await db.execute(sql`SELECT config_key, config_value FROM system_config WHERE config_key LIKE 'RULE_%' ORDER BY config_key`);
      if ((ruleRows.rows || []).length > 0) {
        console.log("\n╔══════════════════════════════════════════════════════════════╗");
        console.log("║  ⚠️  CRITICAL RULES — Kai must follow these at all times    ║");
        console.log("╠══════════════════════════════════════════════════════════════╣");
        for (const r of ruleRows.rows as any[]) {
          const key = r.config_key.replace("RULE_", "").replace(/_/g, " ");
          console.log(`║ ${key}: ${r.config_value}`);
        }
        console.log("╚══════════════════════════════════════════════════════════════╝\n");
      }
    } catch (_) {}
    const { initMaintenanceOnStartup } = await import("./maintenance");
    initMaintenanceOnStartup().catch(e => console.error("[MAINTENANCE] Post-schema init error:", e));
    await migrateChartOfAccountCodes();
    await seedHeaderFlags();
    await createPerformanceIndexes();
    await seedDefaultAdmin();
    try {
      await db.execute(sql.raw(`
        UPDATE companies SET tenant_id = fc_data.tid
        FROM (
          SELECT c.id AS cid, t.id AS tid
          FROM companies c
          JOIN firm_clients fc ON fc.company_id = c.id
          JOIN companies pc ON pc.tenant_id IS NOT NULL AND pc.is_primary = true
          JOIN tenants t ON t.id = pc.tenant_id
          WHERE c.tenant_id IS NULL
          AND EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id)
        ) fc_data
        WHERE companies.id = fc_data.cid
      `));
    } catch (e: any) {
      console.warn("Tenant backfill skip:", e.message?.slice(0, 80));
    }
    try {
      const { sql: rawSql } = await import("drizzle-orm");
      await db.execute(rawSql`
        UPDATE role_permissions SET allowed = true 
        WHERE role = 'accountant' AND module_key = 'firm-mgmt' AND allowed = false
      `);
      await db.execute(rawSql`
        UPDATE role_permissions SET allowed = true 
        WHERE role = 'manager' AND module_key = 'settings' AND allowed = false
      `);
    } catch (e: any) {
      console.warn("Permission sync skip:", e.message?.slice(0, 80));
    }
    try {
      const { sql: rawSql2 } = await import("drizzle-orm");
      await db.execute(rawSql2`
        ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employee_code_unique
      `);
      await db.execute(rawSql2`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE indexname = 'employees_company_code_unique'
          ) THEN
            CREATE UNIQUE INDEX employees_company_code_unique ON employees (company_id, employee_code);
          END IF;
        END $$
      `);
      console.log("[startup] employee_code unique constraint changed to per-company");
    } catch (e: any) {
      console.warn("Employee constraint migration skip:", e.message?.slice(0, 80));
    }
    try {
      const missingResult = await db.execute(sql.raw(`
        SELECT t.id FROM tenants t 
        LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id 
        WHERE ts.id IS NULL
      `));
      const missingTenants = (missingResult as any).rows || [];
      if (missingTenants.length > 0) {
        const freePlanResult = await db.execute(sql.raw(`SELECT id FROM subscription_plans WHERE code = 'free' LIMIT 1`));
        const freePlanRows = (freePlanResult as any).rows || [];
        const freePlanId = freePlanRows[0]?.id || 1;
        for (const t of missingTenants) {
          await db.execute(sql.raw(`INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, start_date) VALUES (${t.id}, ${freePlanId}, 'active', 'monthly', NOW())`));
        }
        log(`Auto-created subscriptions for ${missingTenants.length} tenants`);
      }
    } catch (e: any) {
      console.warn("Subscription seed skip:", e.message?.slice(0, 80));
    }
    try {
      const branchResult = await db.execute(sql.raw(`
        INSERT INTO branches (company_id, code, name, active)
        SELECT c.id, '00000', 'สำนักงานใหญ่', true
        FROM companies c
        WHERE NOT EXISTS (
          SELECT 1 FROM branches b WHERE b.company_id = c.id
        )
        RETURNING id
      `));
      const seeded = ((branchResult as any).rows || []).length;
      if (seeded > 0) log(`Auto-seeded default branch for ${seeded} companies`);
    } catch (e: any) {
      console.warn("Branch seed skip:", e.message?.slice(0, 80));
    }
    // Backfill: seed accounting firm extra accounts for companies that have accounting-related businessType
    try {
      const acctFirmCompanies = await db.select({ id: companies.id, businessType: companies.businessType })
        .from(companies)
        .where(sql`${companies.businessType} IN ('accounting', 'accounting_firm', 'service')`);
      
      if (acctFirmCompanies.length > 0) {
        let totalSeeded = 0;
        const parentCodes = new Set(ACCOUNTING_FIRM_EXTRA_ACCOUNTS.map(a => a.parentCode).filter(Boolean));
        for (const co of acctFirmCompanies) {
          const existing = await db.select({ code: accounts.code }).from(accounts).where(eq(accounts.companyId, co.id));
          const existingCodes = new Set(existing.map(a => a.code));
          let seededForCo = 0;
          for (const tmpl of ACCOUNTING_FIRM_EXTRA_ACCOUNTS) {
            if (!existingCodes.has(tmpl.code)) {
              const hasChildren = parentCodes.has(tmpl.code);
              try {
                await db.insert(accounts).values({
                  companyId: co.id, code: tmpl.code, name: tmpl.name,
                  nameTh: tmpl.nameTh, nameZh: tmpl.nameZh, type: tmpl.type,
                  parentCode: tmpl.parentCode, isHeader: hasChildren,
                });
                seededForCo++;
              } catch (_e) { /* skip duplicate */ }
            }
          }
          if (seededForCo > 0) {
            // Fix isHeader flags
            const refreshed = await db.select().from(accounts).where(eq(accounts.companyId, co.id));
            const usedParents = new Set(refreshed.map(a => a.parentCode).filter(Boolean));
            for (const acc of refreshed) {
              const shouldBeHeader = usedParents.has(acc.code);
              if (acc.isHeader !== shouldBeHeader) {
                await db.update(accounts).set({ isHeader: shouldBeHeader }).where(eq(accounts.id, acc.id));
              }
            }
            totalSeeded += seededForCo;
          }
        }
        if (totalSeeded > 0) log(`Backfilled ${totalSeeded} accounting firm accounts for ${acctFirmCompanies.length} companies`);
      }
    } catch (e: any) {
      console.warn("Accounting firm accounts backfill skip:", e.message?.slice(0, 100));
    }

    try {
      const unlinkedClients = await db.select({ id: firmClients.id, name: firmClients.name, nameEn: firmClients.nameEn, nameZh: firmClients.nameZh, taxId: firmClients.taxId, branch: firmClients.branch, address: firmClients.address, addressEn: firmClients.addressEn, addressZh: firmClients.addressZh, phone: firmClients.phone, email: firmClients.email, contactPerson: firmClients.contactPerson, companyId: firmClients.companyId })
        .from(firmClients)
        .where(sql`${firmClients.contactId} IS NULL`);
      if (unlinkedClients.length > 0) {
        const allTenantIds = new Set<number>();
        for (const fc of unlinkedClients) {
          if (fc.companyId) {
            const [co] = await db.select({ tenantId: companies.tenantId }).from(companies).where(eq(companies.id, fc.companyId)).limit(1);
            if (co?.tenantId) allTenantIds.add(co.tenantId);
          }
        }
        for (const tenantId of allTenantIds) {
          const [firmCo] = await db.select({ id: companies.id }).from(companies)
            .where(and(eq(companies.tenantId, tenantId), eq(companies.isPrimary, true))).limit(1);
          if (!firmCo) continue;

          const tenantClients = [];
          for (const fc of unlinkedClients) {
            if (fc.companyId) {
              const [co] = await db.select({ tenantId: companies.tenantId }).from(companies).where(eq(companies.id, fc.companyId)).limit(1);
              if (co?.tenantId === tenantId) tenantClients.push(fc);
            }
          }

          let linked = 0;
          for (const fc of tenantClients) {
            let existing = null;
            if (fc.taxId && fc.taxId.trim()) {
              const [byTax] = await db.select({ id: contacts.id }).from(contacts)
                .where(and(eq(contacts.companyId, firmCo.id), eq(contacts.taxId, fc.taxId.trim()), eq(contacts.active, true))).limit(1);
              existing = byTax || null;
            }
            if (!existing) {
              const [byName] = await db.select({ id: contacts.id }).from(contacts)
                .where(and(eq(contacts.companyId, firmCo.id), ilike(contacts.name, fc.name), eq(contacts.active, true))).limit(1);
              existing = byName || null;
            }
            if (existing) {
              await db.update(firmClients).set({ contactId: existing.id }).where(eq(firmClients.id, fc.id));
              linked++;
            } else {
              const allCodes = await db.select({ code: contacts.code }).from(contacts)
                .where(and(eq(contacts.companyId, firmCo.id), sql`code LIKE 'C%'`));
              let maxNum = 0;
              for (const r of allCodes) { const n = parseInt(r.code.slice(1), 10); if (!isNaN(n) && n > maxNum) maxNum = n; }
              const code = "C" + String(maxNum + 1).padStart(4, "0");
              const [newContact] = await db.insert(contacts).values({
                companyId: firmCo.id, code, name: fc.name, nameEn: fc.nameEn || null, nameZh: fc.nameZh || null,
                type: "customer", taxId: fc.taxId || null, branch: fc.branch || "สำนักงานใหญ่",
                address: fc.address || null, addressEn: fc.addressEn || null, addressZh: fc.addressZh || null,
                phone: fc.phone || null, email: fc.email || null, contactPerson: fc.contactPerson || null, active: true,
              }).returning();
              await db.update(firmClients).set({ contactId: newContact.id }).where(eq(firmClients.id, fc.id));
              linked++;
            }
          }
          if (linked > 0) log(`Firm client → contact backfill: linked ${linked} clients for tenant ${tenantId}`);
        }
      }
    } catch (e: any) {
      console.warn("Firm client contact backfill skip:", e.message?.slice(0, 200));
    }

    try {
      const legacyStatusMap: Record<string, string> = { new: "unpaid", success: "paid" };
      const statusTables = [
        { table: "invoices", col: "payment_status" },
        { table: "tax_invoices", col: "payment_status" },
        { table: "sales_orders", col: "payment_status" },
        { table: "purchase_invoices", col: "payment_status" },
        { table: "expenses", col: "payment_status" },
        { table: "billing_notes", col: "payment_status" },
      ];
      for (const { table, col } of statusTables) {
        for (const [oldVal, newVal] of Object.entries(legacyStatusMap)) {
          const result = await db.execute(sql.raw(
            `UPDATE ${table} SET ${col} = '${newVal}' WHERE ${col} = '${oldVal}'`
          ));
          const count = (result as any).rowCount || 0;
          if (count > 0) log(`Normalized ${table}.${col}: ${oldVal} → ${newVal} (${count} rows)`);
        }
      }
    } catch (e: any) {
      console.warn("Payment status normalization skip:", e.message?.slice(0, 200));
    }

    try {
      const fixedPI = await db.execute(sql`UPDATE purchase_invoices SET link_journal = true WHERE link_journal = false`);
      const fixedEXP = await db.execute(sql`UPDATE expenses SET link_journal = true WHERE link_journal = false`);
      const piCount = (fixedPI as any).rowCount || 0;
      const expCount = (fixedEXP as any).rowCount || 0;
      if (piCount > 0 || expCount > 0) log(`Fixed linkJournal defaults: PI=${piCount}, EXP=${expCount}`);
    } catch (e: any) { console.warn("linkJournal fix skip:", e.message?.slice(0, 100)); }

    try {
      await repairPettyCashData();
    } catch (e: any) { console.warn("[petty-cash-repair] skip:", e.message?.slice(0, 200)); }

    try {
      const { SUB_MODULES } = await import("../shared/permissions");
      const validKeys = SUB_MODULES.map(s => s.key);
      const delOrphan = await db.execute(sql.raw(`
        DELETE FROM user_sub_permissions 
        WHERE sub_module_key NOT IN (${validKeys.map(k => `'${k}'`).join(",")})
      `));
      const orphanCount = (delOrphan as any).rowCount || 0;
      await db.execute(sql.raw(`
        SELECT setval(
          pg_get_serial_sequence('user_sub_permissions', 'id'),
          GREATEST(COALESCE((SELECT MAX(id) FROM user_sub_permissions), 0) + 1, 1),
          false
        )
      `));
      if (orphanCount > 0) log(`[sub-perms] Cleaned ${orphanCount} orphan keys, sequence reset`);
      else log(`[sub-perms] Sequence synced OK`);
    } catch (e: any) { console.warn("[sub-perms-fix] skip:", e.message?.slice(0, 200)); }

    try {
      await db.execute(sql.raw(`ALTER TABLE goods_receivings ADD COLUMN IF NOT EXISTS warehouse_id INTEGER`));
      await db.execute(sql.raw(`ALTER TABLE goods_receiving_items ADD COLUMN IF NOT EXISTS warehouse_id INTEGER`));
      await db.execute(sql.raw(`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS return_to_stock BOOLEAN DEFAULT FALSE`));
      await db.execute(sql.raw(`ALTER TABLE sales_credit_notes ADD COLUMN IF NOT EXISTS return_warehouse_id INTEGER`));
      await db.execute(sql.raw(`ALTER TABLE ecommerce_orders ADD COLUMN IF NOT EXISTS warehouse_id INTEGER`));
      await db.execute(sql.raw(`ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS source_warehouse_id INTEGER`));
      await db.execute(sql.raw(`ALTER TABLE manufacturing_orders ADD COLUMN IF NOT EXISTS target_warehouse_id INTEGER`));
      await db.execute(sql.raw(`ALTER TABLE general_settings ADD COLUMN IF NOT EXISTS inventory_triggers JSONB DEFAULT '{}'`));
      log("[migration] warehouse inventory columns ensured");
    } catch (e: any) { console.warn("[migration] warehouse columns skip:", e.message?.slice(0, 100)); }

    try {
      const backfillCheck = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = 'WAREHOUSE_STOCK_BACKFILL_DONE' LIMIT 1`));
      if (!((backfillCheck as any).rows || []).length) {
        await db.execute(sql.raw(`
          INSERT INTO warehouse_stock_levels (warehouse_id, product_id, company_id, quantity, reserved_qty, updated_at)
          SELECT
            ii.warehouse_id,
            ii.product_id,
            pi.company_id,
            SUM(ii.qty)::numeric AS quantity,
            0 AS reserved_qty,
            NOW()
          FROM purchase_invoice_items ii
          JOIN purchase_invoices pi ON pi.id = ii.purchase_invoice_id
          WHERE ii.warehouse_id IS NOT NULL AND ii.product_id IS NOT NULL
          GROUP BY ii.warehouse_id, ii.product_id, pi.company_id
          ON CONFLICT (warehouse_id, product_id, company_id) DO UPDATE
            SET quantity = warehouse_stock_levels.quantity + EXCLUDED.quantity,
                updated_at = NOW()
        `));
        await db.execute(sql.raw(`
          INSERT INTO warehouse_stock_levels (warehouse_id, product_id, company_id, quantity, reserved_qty, updated_at)
          SELECT
            ii.warehouse_id,
            ii.product_id,
            inv.company_id,
            -SUM(ii.qty)::numeric AS quantity,
            0 AS reserved_qty,
            NOW()
          FROM invoice_items ii
          JOIN invoices inv ON inv.id = ii.invoice_id
          WHERE ii.warehouse_id IS NOT NULL AND ii.product_id IS NOT NULL
          GROUP BY ii.warehouse_id, ii.product_id, inv.company_id
          ON CONFLICT (warehouse_id, product_id, company_id) DO UPDATE
            SET quantity = warehouse_stock_levels.quantity + EXCLUDED.quantity,
                updated_at = NOW()
        `));
        await db.execute(sql.raw(`
          INSERT INTO warehouse_stock_levels (warehouse_id, product_id, company_id, quantity, reserved_qty, updated_at)
          SELECT
            ii.warehouse_id,
            ii.product_id,
            ti.company_id,
            -SUM(ii.qty)::numeric AS quantity,
            0 AS reserved_qty,
            NOW()
          FROM tax_invoice_items ii
          JOIN tax_invoices ti ON ti.id = ii.tax_invoice_id
          WHERE ii.warehouse_id IS NOT NULL AND ii.product_id IS NOT NULL
          GROUP BY ii.warehouse_id, ii.product_id, ti.company_id
          ON CONFLICT (warehouse_id, product_id, company_id) DO UPDATE
            SET quantity = warehouse_stock_levels.quantity + EXCLUDED.quantity,
                updated_at = NOW()
        `));
        await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('WAREHOUSE_STOCK_BACKFILL_DONE', 'true') ON CONFLICT DO NOTHING`));
        log("[migration] warehouseStockLevels historical backfill done");
      }
    } catch (e: any) { console.warn("[migration] backfill skip:", e.message?.slice(0, 200)); }

    migrationReady = true;
    log("Background migrations complete - API ready");

    try {
      const { autoResumeClone } = await import("./clone-auto-resume");
      setTimeout(() => {
        autoResumeClone().catch(err => {
          console.log("[Clone Auto-Resume] Startup check error:", err.message?.slice(0, 200));
        });
      }, 5000);
    } catch {}
  } catch (err: any) {
    migrationReady = true;
    console.error("Background migration error (API enabled anyway):", err.message?.slice(0, 200));
  }
}

(async () => {
  checkEnvVars();

  log("Bootstrapping config from config DB...");
  await bootstrapConfig();

  if (isUnauthorizedMachine()) {
    log("UNAUTHORIZED MACHINE — serving dead page only");
    app.use((_req: Request, res: Response) => {
      if (_req.path.startsWith("/api/")) {
        return res.status(403).json({ unauthorized: true, message: "This is not an Authorized machine to run this Application" });
      }
      res.status(403).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Unauthorized</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#111;font-family:system-ui,sans-serif;">
<div style="text-align:center;color:#fff;max-width:500px;padding:40px;">
<div style="font-size:64px;margin-bottom:24px;">&#128274;</div>
<h1 style="font-size:24px;margin:0 0 16px;color:#f94d4d;">Unauthorized Machine</h1>
<p style="font-size:16px;color:#999;line-height:1.6;">This is not an Authorized machine to run this Application.</p>
<p style="font-size:12px;color:#555;margin-top:24px;">Contact your system administrator to generate an encryption key for this machine.</p>
</div>
</body>
</html>`);
    });
    const deadPort = parseInt(process.env.PORT || "5000", 10);
    const deadHost = process.env.REPL_ID ? "0.0.0.0" : "localhost";
    httpServer.listen({ port: deadPort, host: deadHost }, () => {
      log(`Dead server on port ${deadPort} — unauthorized machine, no DB access`);
    });
    return;
  }

  await reinitializeFromConfig();

  const { resolveDbFromMachineRegistry } = await import("./machine-db-resolver");
  const { getActiveDbInfo } = await import("./db");
  const mainDbUrl = getActiveDbInfo().url;
  let machineResolvedUrl: string | null = null;

  if (mainDbUrl) {
    log("Resolving DB from machine registry...");
    const resolved = await resolveDbFromMachineRegistry(mainDbUrl);
    if (resolved) {
      machineResolvedUrl = resolved.url;
      log(`Machine registry resolved: ${resolved.label} (${resolved.path}, ${resolved.latencyMs}ms)`);
    } else {
      log("Machine registry: identified self, no DB redirection needed");
    }
  }

  const { reinitializeEcomDb } = await import("./ecom-db");
  const { reinitializePosDb } = await import("./pos-db");
  const sharedDbUrl = machineResolvedUrl || mainDbUrl;
  await reinitializeEcomDb(sharedDbUrl);
  await reinitializePosDb(sharedDbUrl);
  log("Config bootstrap complete");

  const { testMainDbConnection, isRecoveryMode, setRecoveryMode } = await import("./db");
  const mainDbTest = await testMainDbConnection();
  if (!mainDbTest.ok) {
    log(`Main database unreachable: ${mainDbTest.error}`);
    setRecoveryMode(true);
    log("RECOVERY MODE ENABLED — waiting for new database connection");
  } else {
    log(`Main database connected: ${mainDbTest.db} (port ${mainDbTest.port})`);
  }

  const PRE_READY_PATHS = ["/api/public-config", "/api/maintenance/status", "/api/recovery/status", "/api/recovery/update-connection", "/api/recovery/test-connection"];
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/recovery/")) return next();
    if (isRecoveryMode()) {
      if (req.path.startsWith("/api/")) {
        return res.status(503).json({ message: "ระบบอยู่ใน Recovery Mode — ฐานข้อมูลหลักเข้าไม่ได้", recoveryMode: true });
      }
      return next();
    }
    if (migrationReady) return next();
    if (req.path.startsWith("/api/") && !PRE_READY_PATHS.includes(req.path)) {
      return res.status(503).json({ message: "ระบบกำลังเตรียมพร้อม กรุณารอสักครู่..." });
    }
    next();
  });

  await registerRoutes(httpServer, app);

  app.get("/api/recovery/status", async (_req, res) => {
    const { isRecoveryMode, testMainDbConnection } = await import("./db");
    const { isBootstrapped, getConfigDbUrl } = await import("./config-bootstrap");
    const dbTest = await testMainDbConnection();
    res.json({
      recoveryMode: isRecoveryMode(),
      configBootstrapped: isBootstrapped(),
      hasConfigDb: !!getConfigDbUrl(),
      mainDbReachable: dbTest.ok,
      mainDbError: dbTest.error || null,
      mainDbName: dbTest.db || null,
    });
  });

  app.post("/api/recovery/test-connection", async (req, res) => {
    const { isRecoveryMode } = await import("./db");
    if (!isRecoveryMode()) {
      return res.status(403).json({ message: "ระบบไม่ได้อยู่ใน Recovery Mode" });
    }
    const { connectionString } = req.body;
    if (!connectionString) {
      return res.status(400).json({ message: "กรุณาระบุ connection string" });
    }
    const pg = await import("pg");
    const client = new pg.default.Client({ connectionString, connectionTimeoutMillis: 8000 });
    try {
      await client.connect();
      const r = await client.query("SELECT current_database() as db, inet_server_port() as port, version()");
      await client.end();
      res.json({ ok: true, db: r.rows[0].db, port: r.rows[0].port, version: r.rows[0].version.split(",")[0] });
    } catch (err: any) {
      try { await client.end(); } catch {}
      res.json({ ok: false, error: err.message });
    }
  });

  app.post("/api/recovery/update-connection", async (req, res) => {
    const { isRecoveryMode, setRecoveryMode } = await import("./db");
    const { reinitializeFromConfig } = await import("./db");
    const { updateConfig } = await import("./config-bootstrap");
    if (!isRecoveryMode()) {
      return res.status(403).json({ message: "ระบบไม่ได้อยู่ใน Recovery Mode" });
    }
    const { connectionString } = req.body;
    if (!connectionString) {
      return res.status(400).json({ message: "กรุณาระบุ connection string" });
    }

    const pg = await import("pg");
    const testClient = new pg.default.Client({ connectionString, connectionTimeoutMillis: 8000 });
    try {
      await testClient.connect();
      await testClient.query("SELECT 1");
      await testClient.end();
    } catch (err: any) {
      try { await testClient.end(); } catch {}
      return res.status(400).json({ message: `ต่อ DB ไม่ได้: ${err.message}` });
    }

    const keys = ["DB_MAIN_URL", "DB_PROD_URL"];
    for (const key of keys) {
      const ok = await updateConfig(key, connectionString);
      if (ok) console.log(`[Recovery] Updated ${key} in config DB`);
    }

    await reinitializeFromConfig();
    const { testMainDbConnection } = await import("./db");
    const verify = await testMainDbConnection();
    if (verify.ok) {
      setRecoveryMode(false);
      console.log(`[Recovery] Database reconnected: ${verify.db} (port ${verify.port})`);
      res.json({ ok: true, message: "เชื่อมต่อสำเร็จ — ระบบกลับมาปกติ", db: verify.db, port: verify.port });
    } else {
      res.status(500).json({ ok: false, message: `บันทึกแล้วแต่ยังต่อไม่ได้: ${verify.error}` });
    }
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  const { shareOgHandler, contractOgHandler, registerOgImageRoute } = await import("./share-og");
  registerOgImageRoute(app);
  app.get("/share/quote/:token", (req, res, next) => { req.params.docType = "quote"; shareOgHandler(req, res, next); });
  app.get("/share/invoice/:token", (req, res, next) => { req.params.docType = "invoice"; shareOgHandler(req, res, next); });
  app.get("/share/tax-invoice/:token", (req, res, next) => { req.params.docType = "tax-invoice"; shareOgHandler(req, res, next); });
  app.get("/share/receipt/:token", (req, res, next) => { req.params.docType = "receipt"; shareOgHandler(req, res, next); });
  app.get("/share/order/:token", (req, res, next) => { req.params.docType = "order"; shareOgHandler(req, res, next); });
  app.get("/share/wht-cert/:token", (req, res, next) => { req.params.docType = "wht-cert"; shareOgHandler(req, res, next); });
  app.get("/sign/:token", contractOgHandler);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const isReplit = !!process.env.REPL_ID;
  const { startPlatformScheduler } = await import("./platform-scheduler");

  httpServer.listen(
    {
      port,
      host: isReplit ? "0.0.0.0" : "localhost",
      ...(isReplit ? { reusePort: true } : {}),
    },
    () => {
      log(`serving on port ${port}`);
      runMigrationsInBackground();
      const isReplitProduction = isReplit && process.env.NODE_ENV === "production";
      if (isReplitProduction) {
        log("Background schedulers DISABLED (Replit production → TH database over ocean). Re-enable when server moves to Thailand.");
      } else {
        startPlatformScheduler();
        import("./sync-queue").then(m => m.startSyncQueueWorker());
        import("./services/tax-reminder").then(m => m.startTaxReminderScheduler());
        import("./services/github-push").then(m => m.startGitHubPushScheduler());
        import("./services/clone-history-central").then(m => m.startCentralHistorySync());
      }
    },
  );
})();
