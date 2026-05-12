import type { Express, Request, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { eq, desc, asc, and, or, gte, lte, count , sql } from "drizzle-orm";
import { accounts, companies, accountingFormulas, accountingFormulaLines, journalEntries, users, journalLines, pettyCashFunds, pettyCashTransactions, invoices, taxInvoices, receipts, expenses, expenseItems, withholdingTaxCerts, paymentMethods, assetDepreciations, payrollRecords } from "@shared/schema";
import { requireAuth, requireAdmin, requireRole, requireModule, requireAnyModule, checkDocOwnership } from "../route-middleware";
import { getNextJournalEntryNo, resolvePaymentMethodAccountCode, logActivity, checkClosedPeriod } from "../route-helpers";
import { parsePagination, paginatedResponse } from "./pagination";
import multer from "multer";
import * as XLSX from "xlsx";
import path from "path";
import { DEFAULT_FORMULAS } from "@shared/accounting-formulas";
import { parse as csvParse } from "csv-parse/sync";
import { invalidateCompanyReports } from "./report-cache";
import { updatePeriodBalanceForEntry } from "./period-balances";

export function registerAccountingRoutes(app: Express) {
// ==================== Chart of Accounts Import/Export ====================
app.get("/api/accounts/import/template", (_req, res) => {
  const headers = ["รหัสบัญชี", "ชื่อบัญชี (English)", "ชื่อบัญชี (ไทย)", "ประเภท", "Parent Code"];
  const typeInfo = "asset=สินทรัพย์, liability=หนี้สิน, equity=ส่วนของเจ้าของ, revenue=รายได้, expense=ค่าใช้จ่าย";
  const samples = [
    ["1001000", "Cash", "เงินสด", "asset", "100"],
    ["1011000", "Savings - BBL", "เงินฝากออมทรัพย์ - ธ.กรุงเทพ", "asset", "101"],
    ["2101000", "Trade Payable", "เจ้าหนี้การค้า", "liability", "210"],
    ["4001000", "Sales Revenue", "รายได้จากการขาย", "revenue", "400"],
    ["5101000", "Cost of Goods Sold", "ต้นทุนสินค้าขาย", "expense", "510"],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...samples]);
  ws["!cols"] = [14, 30, 30, 20, 14].map(w => ({ wch: w }));
  const infoWs = XLSX.utils.aoa_to_sheet([
    ["ประเภทบัญชี (Type)", "ค่าที่รองรับ"],
    ["asset", "สินทรัพย์"],
    ["liability", "หนี้สิน"],
    ["equity", "ส่วนของเจ้าของ"],
    ["revenue", "รายได้"],
    ["expense", "ค่าใช้จ่าย"],
    [],
    ["หมายเหตุ"],
    ["- รหัสบัญชี และ ชื่อบัญชี (English) จำเป็นต้องกรอก"],
    ["- ประเภท: ใส่เป็นภาษาอังกฤษ (asset, liability, equity, revenue, expense) หรือภาษาไทย"],
    ["- Parent Code: รหัสบัญชีหลัก (ถ้ามี)"],
  ]);
  infoWs["!cols"] = [20, 30].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "ผังบัญชี");
  XLSX.utils.book_append_sheet(wb, infoWs, "คำอธิบาย");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=template_chart_of_accounts.xlsx");
  res.send(Buffer.from(buf));
});

app.get("/api/accounts/export", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const accts = await storage.getAccounts(companyId);
    const typeLabel: Record<string, string> = { asset: "สินทรัพย์", liability: "หนี้สิน", equity: "ส่วนของเจ้าของ", revenue: "รายได้", expense: "ค่าใช้จ่าย" };
    const headers = ["รหัสบัญชี", "ชื่อบัญชี (English)", "ชื่อบัญชี (ไทย)", "ชื่อบัญชี (จีน)", "ประเภท", "ประเภท (English)", "Parent Code", "สถานะ"];
    const rows = accts.sort((a, b) => a.code.localeCompare(b.code)).map(a => [
      a.code, a.name, a.nameTh || "", a.nameZh || "",
      typeLabel[a.type] || a.type, a.type,
      a.parentCode || "", a.active ? "ใช้งาน" : "ปิดใช้งาน"
    ]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [14, 30, 30, 20, 18, 12, 14, 10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "ผังบัญชี");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const outBuf = Buffer.from(buf);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=chart_of_accounts_export.xlsx");
    res.setHeader("Content-Encoding", "identity");
    res.setHeader("Content-Length", outBuf.length);
    res.setHeader("Cache-Control", "no-cache");
    res.end(outBuf);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

const uploadAccounts = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.post("/api/accounts/import/preview", requireAuth, uploadAccounts.single("file"), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "กรุณาอัปโหลดไฟล์" });
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });

    let rows: any[] = [];
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } else if (ext === ".csv") {
      let content = req.file.buffer.toString("utf-8");
      const hasThai = /[\u0E00-\u0E7F]/.test(content);
      const hasHighBytes = req.file.buffer.some((b: number) => b >= 0xA1 && b <= 0xFB);
      if (!hasThai && hasHighBytes) {
        try { content = new TextDecoder("tis-620").decode(req.file.buffer); } catch { content = req.file.buffer.toString("latin1"); }
      }
      const delimiter = content.split(/\r?\n/)[0].includes("\t") ? "\t" : ",";
      const { parse: csvParseFn } = await import("csv-parse/sync");
      rows = csvParseFn(content, { columns: true, skip_empty_lines: true, trim: true, bom: true, delimiter, relax_quotes: true, relax_column_count: true });
    } else {
      return res.status(400).json({ message: "รองรับเฉพาะไฟล์ .csv, .xlsx, .xls" });
    }
    if (rows.length === 0) return res.status(400).json({ message: "ไม่พบข้อมูลในไฟล์" });
    if (rows.length > 500) return res.status(400).json({ message: "รองรับสูงสุด 500 รายการต่อครั้ง" });

    const FIELD_MAP: Record<string, string[]> = {
      code: ["รหัสบัญชี", "code", "account_code", "รหัส"],
      name: ["ชื่อบัญชี (english)", "ชื่อบัญชี (eng)", "name", "account_name", "ชื่ออังกฤษ", "english_name", "ชื่อบัญชี"],
      nameTh: ["ชื่อบัญชี (ไทย)", "name_th", "nameth", "ชื่อไทย", "thai_name"],
      nameZh: ["ชื่อบัญชี (จีน)", "name_zh", "namezh", "ชื่อจีน", "chinese_name"],
      type: ["ประเภท", "type", "account_type", "ประเภทบัญชี"],
      parentCode: ["parent code", "parent_code", "parentcode", "รหัสบัญชีหลัก"],
    };

    const headers = Object.keys(rows[0]);
    const columnMapping: Record<string, string | null> = {};
    headers.forEach(h => {
      const hl = h.trim().toLowerCase();
      for (const [field, aliases] of Object.entries(FIELD_MAP)) {
        if (aliases.some(a => a.toLowerCase() === hl)) { columnMapping[h] = field; return; }
      }
      columnMapping[h] = null;
    });

    const existingAccounts = await storage.getAccounts(companyId);
    const existingCodes = new Set(existingAccounts.map(a => a.code));

    const typeMap: Record<string, string> = {
      "สินทรัพย์": "asset", "asset": "asset",
      "หนี้สิน": "liability", "liability": "liability",
      "ส่วนของเจ้าของ": "equity", "equity": "equity", "ทุน": "equity",
      "รายได้": "revenue", "revenue": "revenue",
      "ค่าใช้จ่าย": "expense", "expense": "expense",
    };

    const preview = rows.map((row: any, idx: number) => {
      const mapped: any = {};
      for (const [header, value] of Object.entries(row)) {
        const field = columnMapping[header];
        if (field) mapped[field] = String(value).trim();
      }

      const issues: string[] = [];
      if (!mapped.code) issues.push("ไม่มีรหัสบัญชี");
      if (!mapped.name && !mapped.nameTh) issues.push("ไม่มีชื่อบัญชี");
      if (mapped.code && existingCodes.has(mapped.code)) issues.push(`รหัส "${mapped.code}" มีในระบบแล้ว`);

      let resolvedType = "";
      if (mapped.type) {
        resolvedType = typeMap[mapped.type.toLowerCase()] || "";
        if (!resolvedType) issues.push(`ประเภท "${mapped.type}" ไม่ถูกต้อง`);
      } else {
        const c = mapped.code || "";
        if (c.startsWith("1")) resolvedType = "asset";
        else if (c.startsWith("2")) resolvedType = "liability";
        else if (c.startsWith("3")) resolvedType = "equity";
        else if (c.startsWith("4")) resolvedType = "revenue";
        else if (c.startsWith("5")) resolvedType = "expense";
        else issues.push("ไม่สามารถระบุประเภทบัญชีได้");
      }

      return {
        row: idx + 1,
        data: {
          code: mapped.code || "",
          name: mapped.name || mapped.nameTh || "",
          nameTh: mapped.nameTh || "",
          nameZh: mapped.nameZh || "",
          type: resolvedType,
          parentCode: mapped.parentCode || "",
        },
        issues,
        valid: issues.length === 0 && !!mapped.code && (!!mapped.name || !!mapped.nameTh) && !!resolvedType,
      };
    });

    res.json({ total: preview.length, valid: preview.filter(p => p.valid).length, invalid: preview.filter(p => !p.valid).length, preview, columnMapping });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/accounts/import/confirm", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const { companyId, items } = req.body;
    if (!companyId || !items?.length) return res.status(400).json({ message: "ไม่มีข้อมูลนำเข้า" });
    const validTypes = ["asset", "liability", "equity", "revenue", "expense"];

    const created: any[] = [];
    for (const item of items) {
      if (!item.code || !item.name || !validTypes.includes(item.type)) continue;
      const parsed = insertAccountSchema.parse({
        companyId,
        code: item.code,
        name: item.name,
        nameTh: item.nameTh || null,
        nameZh: item.nameZh || null,
        type: item.type,
        parentCode: item.parentCode || null,
        active: true,
      });
      const account = await storage.createAccount(parsed);
      created.push(account);
    }

    res.json({ created: created.length, accounts: created });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/accounts/check-formula-codes", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "ไม่พบบริษัท" });
    const businessType = company.businessType || "mixed";

    const dbFormulasList = await db.select().from(accountingFormulas)
      .where(and(eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.active, true)));

    let allUsedCodes: { accountCode: string; accountName: string; formulaName: string; formulaId: number | null; lineId: number | null }[] = [];

    if (dbFormulasList.length > 0) {
      for (const formula of dbFormulasList) {
        const lines = await db.select().from(accountingFormulaLines)
          .where(eq(accountingFormulaLines.formulaId, formula.id));
        for (const line of lines) {
          allUsedCodes.push({
            accountCode: line.accountCode,
            accountName: line.accountName,
            formulaName: formula.nameTh || formula.name,
            formulaId: formula.id,
            lineId: line.id,
          });
        }
      }
    } else {
      const fbType = (businessType === "accounting" || businessType === "accounting_firm") ? "service" : businessType;
      const relevantDefaults = DEFAULT_FORMULAS.filter(f => f.businessType === fbType);
      for (const formula of relevantDefaults) {
        for (const line of formula.lines) {
          allUsedCodes.push({
            accountCode: line.accountCode,
            accountName: line.accountName,
            formulaName: formula.nameTh || formula.name,
            formulaId: null,
            lineId: null,
          });
        }
      }
    }

    const existingAccounts = await storage.getAccounts(companyId);
    const existingCodes = new Set(existingAccounts.map(a => a.code));

    const uniqueMissing = new Map<string, typeof allUsedCodes[0]>();
    for (const item of allUsedCodes) {
      if (!existingCodes.has(item.accountCode) && !uniqueMissing.has(item.accountCode)) {
        uniqueMissing.set(item.accountCode, item);
      }
    }

    const missing = Array.from(uniqueMissing.values());
    const hasCustomFormulas = dbFormulasList.length > 0;

    res.json({
      hasMissingCodes: missing.length > 0,
      missingCodes: missing,
      hasCustomFormulas,
      businessType,
      availableAccounts: existingAccounts.filter(a => a.active).map(a => ({
        id: a.id, code: a.code, name: a.name, nameTh: a.nameTh, type: a.type,
      })),
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/accounts/apply-formula-mappings", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const { companyId, mappings } = req.body;
    if (!companyId || !mappings?.length) return res.status(400).json({ message: "ไม่มีข้อมูล mapping" });

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "ไม่พบบริษัท" });
    const businessType = company.businessType || "mixed";

    const existingAccounts = await storage.getAccounts(companyId);
    const accountByCode = new Map(existingAccounts.map(a => [a.code, a]));

    const codeMap = new Map<string, string>();
    for (const m of mappings) {
      if (m.oldCode && m.newCode && m.oldCode !== m.newCode) {
        codeMap.set(m.oldCode, m.newCode);
      }
    }

    await db.transaction(async (tx) => {
      const dbFormulasList = await tx.select().from(accountingFormulas)
        .where(and(eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.active, true)));

      if (dbFormulasList.length > 0) {
        for (const formula of dbFormulasList) {
          const lines = await tx.select().from(accountingFormulaLines)
            .where(eq(accountingFormulaLines.formulaId, formula.id));
          for (const line of lines) {
            const newCode = codeMap.get(line.accountCode);
            if (newCode) {
              const newAcc = accountByCode.get(newCode);
              await tx.update(accountingFormulaLines).set({
                accountCode: newCode,
                accountName: newAcc ? (newAcc.nameTh || newAcc.name) : line.accountName,
              }).where(eq(accountingFormulaLines.id, line.id));
            }
          }
        }
      } else {
        const fbType2 = (businessType === "accounting" || businessType === "accounting_firm") ? "service" : businessType;
        const relevantDefaults = DEFAULT_FORMULAS.filter(f => f.businessType === fbType2);
        for (const defaultFormula of relevantDefaults) {
          const [newFormula] = await tx.insert(accountingFormulas).values({
            companyId,
            documentType: defaultFormula.documentType,
            businessType: defaultFormula.businessType,
            name: defaultFormula.name,
            nameTh: defaultFormula.nameTh,
            description: defaultFormula.description || "",
            noJournalEntry: defaultFormula.noJournalEntry || false,
            active: true,
          }).returning();

          for (const line of defaultFormula.lines) {
            const newCode = codeMap.get(line.accountCode) || line.accountCode;
            const newAcc = accountByCode.get(newCode);
            await tx.insert(accountingFormulaLines).values({
              formulaId: newFormula.id,
              accountCode: newCode,
              accountName: newAcc ? (newAcc.nameTh || newAcc.name) : line.accountName,
              direction: line.direction,
              sortOrder: line.sortOrder,
            });
          }
        }
      }
    });

    res.json({ success: true, updated: codeMap.size });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/journal-entries", requireAuth, requireAnyModule("accounting", "inventory"), async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
  if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const journalBook = req.query.journalBook as string | undefined;
  const { page, pageSize, offset } = parsePagination(req, { pageSize: 100 });
  const conditions: any[] = [eq(journalEntries.companyId, companyId)];
  if (startDate) conditions.push(gte(journalEntries.entryDate, startDate));
  if (endDate) conditions.push(lte(journalEntries.entryDate, endDate));
  if (journalBook) conditions.push(eq(journalEntries.journalBook, journalBook));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  if (req.query.page) {
    const [{ total }] = await db.select({ total: count() }).from(journalEntries).where(whereClause);
    const entries = await db.select().from(journalEntries).where(whereClause).orderBy(desc(journalEntries.entryDate), asc(journalEntries.id)).limit(pageSize).offset(offset);
    const allUsers = await db.select({ id: users.id, fullName: users.fullName }).from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u.fullName]));
    const enriched = entries.map(e => ({ ...e, createdByName: e.createdBy ? userMap.get(e.createdBy) || "ระบบ" : "ระบบ" }));
    res.json(paginatedResponse(enriched, Number(total), { page, pageSize, offset }));
  } else {
    const entries = await db.select().from(journalEntries).where(whereClause).orderBy(desc(journalEntries.entryDate), asc(journalEntries.id));
    const allUsers = await db.select({ id: users.id, fullName: users.fullName }).from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u.fullName]));
    const enriched = entries.map(e => ({ ...e, createdByName: e.createdBy ? userMap.get(e.createdBy) || "ระบบ" : "ระบบ" }));
    res.json(enriched);
  }
});

app.get("/api/journal-entries/:id/lines", requireAuth, async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    const lines = await db.select({
      id: journalLines.id,
      journalEntryId: journalLines.journalEntryId,
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      description: journalLines.description,
      debit: journalLines.debit,
      credit: journalLines.credit,
      costCenter: journalLines.costCenter,
      anchor: journalLines.anchor,
    })
    .from(journalLines)
    .leftJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(eq(journalLines.journalEntryId, entryId))
    .orderBy(journalLines.id);
    res.json(lines);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/journal-entries", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const { lines, ...entryData } = req.body;
    if (entryData.companyId && entryData.entryDate && entryData.sourceDocType !== "period_closing") {
      const periodCheck = await checkClosedPeriod(entryData.companyId, entryData.entryDate);
      if (periodCheck.blocked) {
        return res.status(403).json({ message: periodCheck.message });
      }
    }
    if (entryData.reference && /^DEP-/i.test(String(entryData.reference).trim()) && entryData.sourceDocType !== "depreciation") {
      return res.status(400).json({ message: "เลขที่อ้างอิงห้ามขึ้นต้นด้วย 'DEP-' เพราะสงวนไว้สำหรับรายการค่าเสื่อมราคาอัตโนมัติเท่านั้น" });
    }
    if (lines && Array.isArray(lines)) {
      const totalDebit = lines.reduce((s: number, l: any) => s + (parseFloat(l.debit) || 0), 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + (parseFloat(l.credit) || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.005) {
        return res.status(400).json({ message: "ยอดเดบิตและเครดิตไม่สมดุล ไม่สามารถบันทึกได้" });
      }
    }
    if (!entryData.entryNo && entryData.companyId) {
      entryData.entryNo = await getNextJournalEntryNo(entryData.companyId, entryData.journalBook || "general", entryData.entryDate);
    }
    if (!entryData.reference && entryData.entryNo) {
      entryData.reference = entryData.entryNo;
    }
    const entry = await storage.createJournalEntry(entryData);
    if (lines && Array.isArray(lines)) {
      for (const line of lines) {
        await storage.createJournalLine({ ...line, journalEntryId: entry.id });
      }
    }
    invalidateCompanyReports(entryData.companyId);
    if (entryData.companyId && entryData.entryDate) {
      updatePeriodBalanceForEntry(entryData.companyId, entryData.entryDate).catch(e => console.error("[PeriodBalance] update failed:", e.message));
    }
    const entryLines = await storage.getJournalLines(entry.id);
    logActivity({ companyId: entryData.companyId, userId: (req.user as any)?.id, userName: (req.user as any)?.username, action: "create", entityType: "journal_entry", entityId: String(entry.id), entityName: entry.entryNo || "" }).catch(() => {});
    res.status(201).json({ ...entry, lines: entryLines });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/journal-entries/:id", requireAuth, async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, entryId));
    if (!entry) return res.status(404).json({ message: "ไม่พบรายการบัญชี" });
    const entryLines = await db.select({
      id: journalLines.id,
      journalEntryId: journalLines.journalEntryId,
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      description: journalLines.description,
      debit: journalLines.debit,
      credit: journalLines.credit,
      costCenter: journalLines.costCenter,
      anchor: journalLines.anchor,
    })
    .from(journalLines)
    .leftJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(eq(journalLines.journalEntryId, entryId))
    .orderBy(journalLines.id);
    res.json({ ...entry, lines: entryLines });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/journal-entries/:id", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    const { lines: lineData, ...entryData } = req.body;
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, entryId));
    if (!existing) return res.status(404).json({ message: "ไม่พบรายการบัญชี" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    if (entryData.reference && /^DEP-/i.test(String(entryData.reference).trim()) && existing.sourceDocType !== "depreciation") {
      return res.status(400).json({ message: "เลขที่อ้างอิงห้ามขึ้นต้นด้วย 'DEP-' เพราะสงวนไว้สำหรับรายการค่าเสื่อมราคาอัตโนมัติเท่านั้น" });
    }
    if (lineData && Array.isArray(lineData)) {
      const totalDebit = lineData.reduce((s: number, l: any) => s + (parseFloat(l.debit) || 0), 0);
      const totalCredit = lineData.reduce((s: number, l: any) => s + (parseFloat(l.credit) || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.005) {
        return res.status(400).json({ message: "ยอดเดบิตและเครดิตไม่สมดุล ไม่สามารถบันทึกได้" });
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(journalEntries).set({
        entryDate: entryData.entryDate,
        reference: entryData.reference,
        description: entryData.description,
        journalBook: entryData.journalBook,
        contactId: entryData.contactId,
        contactName: entryData.contactName,
        costCenter: entryData.costCenter,
        status: entryData.status || "posted",
      }).where(eq(journalEntries.id, entryId));
      if (lineData && Array.isArray(lineData)) {
        await tx.delete(journalLines).where(eq(journalLines.journalEntryId, entryId));
        for (const line of lineData) {
          await tx.insert(journalLines).values({
            journalEntryId: entryId,
            accountId: line.accountId,
            description: line.description || "",
            debit: String(parseFloat(line.debit) || 0),
            credit: String(parseFloat(line.credit) || 0),
            costCenter: line.costCenter || "",
            anchor: line.anchor || "",
          });
        }
      }
    });
    const [updatedEntry] = await db.select().from(journalEntries).where(eq(journalEntries.id, entryId));
    invalidateCompanyReports(existing.companyId);
    const datesToUpdate = new Set<string>();
    if (existing.entryDate) datesToUpdate.add(String(existing.entryDate));
    if (entryData.entryDate) datesToUpdate.add(entryData.entryDate);
    for (const d of datesToUpdate) {
      updatePeriodBalanceForEntry(existing.companyId!, d).catch(e => console.error("[PeriodBalance] update failed:", e.message));
    }
    const entryLines = await storage.getJournalLines(entryId);
    res.json({ ...updatedEntry, lines: entryLines });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/journal-entries/:id", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    const user = req.user as any;
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, entryId));
    if (!existing) return res.status(404).json({ message: "ไม่พบรายการบัญชี" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

    if (existing.companyId) {
      const [company] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
      if (company && company.tenantId && company.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
      }
    }

    await db.transaction(async (tx) => {
      if (existing.sourceDocType === "depreciation") {
        await tx.update(assetDepreciations)
          .set({ posted: false, journalEntryId: null })
          .where(eq(assetDepreciations.journalEntryId, entryId));
      }
      if (existing.sourceDocType === "payroll") {
        await tx.update(payrollRecords)
          .set({ status: "approved", journalEntryId: null })
          .where(eq(payrollRecords.journalEntryId, entryId));
      }
      await tx.update(pettyCashFunds)
        .set({ journalEntryId: null })
        .where(eq(pettyCashFunds.journalEntryId, entryId));
      await tx.update(pettyCashTransactions)
        .set({ journalEntryId: null })
        .where(eq(pettyCashTransactions.journalEntryId, entryId));
      await tx.delete(journalLines).where(eq(journalLines.journalEntryId, entryId));
      await tx.delete(journalEntries).where(eq(journalEntries.id, entryId));
    });
    invalidateCompanyReports(existing.companyId);
    if (existing.companyId && existing.entryDate) {
      updatePeriodBalanceForEntry(existing.companyId, String(existing.entryDate)).catch(e => console.error("[PeriodBalance] update failed:", e.message));
    }
    res.json({ success: true, message: "ลบรายการบัญชีสำเร็จ" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/dashboard/stats", requireAuth, requireModule("dashboard"), async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
  const rangeFrom = req.query.rangeFrom as string | undefined;
  const rangeTo = req.query.rangeTo as string | undefined;
  const stats = await storage.getDashboardStats(companyId, rangeFrom, rangeTo);
  res.json(stats);
});

app.get("/api/dashboard/ecommerce-stats", requireAuth, async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
  if (!companyId) return res.json({});
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : undefined;
  const dateTo = req.query.dateTo ? String(req.query.dateTo) : undefined;
  const stats = await storage.getEcommerceStats(companyId, dateFrom, dateTo);
  res.json(stats);
});

app.get("/api/firm/stats", requireAuth, requireModule("firm-mgmt"), async (req, res) => {
  const user = req.user as any;
  const stats = await storage.getFirmStats(user.tenantId);
  res.json(stats);
});

// ========== Accounting Formulas Routes ==========

app.get("/api/accounting-formulas", requireAuth, requireModule("accounting"), async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
  const businessType = req.query.businessType as string | undefined;
  const documentType = req.query.documentType as string | undefined;
  const formulas = await storage.getAccountingFormulas(companyId, businessType, documentType);
  const formulasWithLines = await Promise.all(
    formulas.map(async (f) => {
      const lines = await storage.getFormulaLines(f.id);
      return { ...f, lines };
    })
  );
  res.json(formulasWithLines);
});

app.get("/api/accounting-formulas/available", requireAuth, async (req, res) => {
  try {
    const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    const documentType = req.query.documentType as string | undefined;
    if (!companyId) return res.status(400).json({ message: "companyId required" });

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    const rawBizType = company?.businessType || "mixed";
    const businessType = ["trading", "service", "ecommerce", "restaurant", "mixed", "accounting", "accounting_firm"].includes(rawBizType) ? rawBizType : "mixed";
    const formulaBusinessType = (businessType === "accounting" || businessType === "accounting_firm") ? "service" : businessType;

    let companyFormulas = await storage.getAccountingFormulas(companyId, undefined, documentType);
    const result: any[] = [];

    for (const f of companyFormulas) {
      const lines = await storage.getFormulaLines(f.id);
      result.push({ ...f, lines, source: "company" });
    }

    if (documentType) {
      const existingBizTypes = new Set(companyFormulas.map((f: any) => f.businessType));
      const RESTAURANT_BIZ_TYPES = new Set(["restaurant", "grab", "grab_service_fee", "lineman", "foodpanda", "line_shopping", "shopeefood_fee", "grab_platform_fee", "lineman_platform_fee", "foodpanda_platform_fee", "line_shopping_platform_fee", "grab_commission", "lineman_commission", "foodpanda_commission", "line_shopping_commission", "restaurant_grab", "restaurant_grab_gp", "restaurant_lineman", "restaurant_lineman_gp", "restaurant_foodpanda", "restaurant_foodpanda_gp", "restaurant_robinhood", "restaurant_robinhood_gp", "restaurant_shopeefood", "restaurant_shopeefood_gp", "restaurant_dinein", "restaurant_takeaway"]);
      const ECOMMERCE_BIZ_TYPES = new Set(["ecommerce", "shopee_platform_fee", "shopee_shipping", "shopee_commission", "lazada_platform_fee", "lazada_shipping", "lazada_commission", "lazada", "tiktok_platform_fee", "tiktok_shipping", "tiktok_commission", "tiktok", "spx_admin_fee", "platform_fee", "ecommerce_commission"]);
      const allPossibleBizTypes = ["trading", "service", "ecommerce", "restaurant", "lazada", "tiktok", "grab", "grab_service_fee", "lineman", "foodpanda", "line_shopping", "shopeefood_fee", "spx_admin_fee", "ecommerce_commission", "shopee_commission", "lazada_commission", "grab_commission", "lineman_commission", "foodpanda_commission", "line_shopping_commission", "platform_fee", "shopee_platform_fee", "shopee_shipping", "lazada_platform_fee", "lazada_shipping", "tiktok_platform_fee", "tiktok_shipping", "grab_platform_fee", "lineman_platform_fee", "foodpanda_platform_fee", "line_shopping_platform_fee", "restaurant_grab", "restaurant_grab_gp", "restaurant_lineman", "restaurant_lineman_gp", "restaurant_foodpanda", "restaurant_foodpanda_gp", "restaurant_robinhood", "restaurant_robinhood_gp", "restaurant_shopeefood", "restaurant_shopeefood_gp", "restaurant_dinein", "restaurant_takeaway", "mixed"];
      const filteredBizTypes = allPossibleBizTypes.filter(bt => {
        if (formulaBusinessType === "ecommerce" && RESTAURANT_BIZ_TYPES.has(bt)) return false;
        if (formulaBusinessType === "restaurant" && ECOMMERCE_BIZ_TYPES.has(bt)) return false;
        return true;
      });
      const allBizTypes = [formulaBusinessType, ...filteredBizTypes.filter(bt => bt !== formulaBusinessType)];
      for (const bt of allBizTypes) {
        if (existingBizTypes.has(bt)) continue;
        const defaults = DEFAULT_FORMULAS.filter(f => f.documentType === documentType && f.businessType === bt);
        for (const d of defaults) {
          result.push({
            id: null, companyId,
            documentType: d.documentType, businessType: d.businessType,
            name: d.name, nameTh: d.nameTh,
            description: d.description || "",
            noJournalEntry: d.noJournalEntry || false,
            active: true, lines: d.lines, source: "default",
          });
        }
      }
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/accounting-formulas/validate", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    { const ac = await checkDocOwnership(companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

    const companyAccounts = await db.select({ code: accounts.code, nameTh: accounts.nameTh, name: accounts.name })
      .from(accounts).where(eq(accounts.companyId, companyId));
    const accountSet = new Map(companyAccounts.map(a => [a.code, a.nameTh || a.name || ""]));

    const savedFormulas = await db.select().from(accountingFormulas).where(eq(accountingFormulas.companyId, companyId));
    const linesByFormula = new Map<number, any[]>();
    if (savedFormulas.length > 0) {
      const formulaIds = savedFormulas.map(f => f.id);
      const allFormulaLines = await db.select().from(accountingFormulaLines)
        .where(sql`${accountingFormulaLines.formulaId} IN (${sql.join(formulaIds.map(id => sql`${id}`), sql`, `)})`);
      for (const line of allFormulaLines) {
        const arr = linesByFormula.get(line.formulaId) || [];
        arr.push(line);
        linesByFormula.set(line.formulaId, arr);
      }
    }

    const results: any[] = [];
    for (const formula of savedFormulas) {
      const lines = linesByFormula.get(formula.id) || [];
      const issues: any[] = [];
      for (const line of lines) {
        const code = line.accountCode;
        if (!code) continue;
        const realName = accountSet.get(code);
        if (realName === undefined) {
          issues.push({ accountCode: code, formulaName: line.accountName || "", issue: "missing", realName: null });
        } else if (line.accountName && realName && !realName.includes(line.accountName) && !line.accountName.includes(realName)) {
          issues.push({ accountCode: code, formulaName: line.accountName, issue: "name_mismatch", realName });
        }
      }
      if (issues.length > 0) {
        results.push({ id: formula.id, name: formula.nameTh || formula.name, documentType: formula.documentType, businessType: formula.businessType, issues });
      }
    }

    const defaultResults: any[] = [];
    for (const def of DEFAULT_FORMULAS) {
      const lines = def.lines || [];
      if (def.noJournalEntry) continue;
      const issues: any[] = [];
      for (const line of lines) {
        const code = line.accountCode;
        if (!code) continue;
        const realName = accountSet.get(code);
        if (realName === undefined) {
          issues.push({ accountCode: code, formulaName: line.accountName || "", issue: "missing", realName: null });
        } else if (line.accountName && realName && !realName.includes(line.accountName) && !line.accountName.includes(realName)) {
          issues.push({ accountCode: code, formulaName: line.accountName, issue: "name_mismatch", realName });
        }
      }
      if (issues.length > 0) {
        defaultResults.push({ name: def.nameTh || def.name, documentType: def.documentType, businessType: def.businessType, issues });
      }
    }

    const totalSaved = savedFormulas.length;
    const totalDefault = (DEFAULT_FORMULAS as any[]).filter((f: any) => !f.noJournalEntry).length;
    res.json({
      savedFormulas: { total: totalSaved, withIssues: results.length, details: results },
      defaultFormulas: { total: totalDefault, withIssues: defaultResults.length, details: defaultResults },
      totalAccounts: companyAccounts.length,
    });
  } catch (err: any) {
    console.error("[formula-validate]", err);
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/accounting-formulas/fix-names", requireAuth, requireRole("admin", "super_admin", "manager"), async (req, res) => {
  try {
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    { const ac = await checkDocOwnership(companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

    const companyAccounts = await db.select({ code: accounts.code, nameTh: accounts.nameTh, name: accounts.name })
      .from(accounts).where(eq(accounts.companyId, companyId));
    const accountMap = new Map(companyAccounts.map(a => [a.code, a.nameTh || a.name || ""]));

    let fixedSavedLines = 0;
    let fixedDefaultFormulas = 0;

    const savedFormulas = await db.select().from(accountingFormulas).where(eq(accountingFormulas.companyId, companyId));
    if (savedFormulas.length > 0) {
      const formulaIds = savedFormulas.map(f => f.id);
      const allLines = await db.select().from(accountingFormulaLines)
        .where(sql`${accountingFormulaLines.formulaId} IN (${sql.join(formulaIds.map(id => sql`${id}`), sql`, `)})`);
      for (const line of allLines) {
        const realName = accountMap.get(line.accountCode);
        if (realName && line.accountName && realName !== line.accountName &&
            !realName.includes(line.accountName) && !line.accountName.includes(realName)) {
          await db.update(accountingFormulaLines)
            .set({ accountName: realName })
            .where(eq(accountingFormulaLines.id, line.id));
          fixedSavedLines++;
        }
      }
    }

    const existingKeys = new Set(savedFormulas.map(f => `${f.documentType}|${f.businessType}`));
    for (const def of DEFAULT_FORMULAS) {
      if (def.noJournalEntry) continue;
      const key = `${def.documentType}|${def.businessType}`;
      if (existingKeys.has(key)) continue;

      const lines = def.lines || [];
      const hasMismatch = lines.some((line: any) => {
        const realName = accountMap.get(line.accountCode);
        return realName && line.accountName && realName !== line.accountName &&
               !realName.includes(line.accountName) && !line.accountName.includes(realName);
      });
      if (!hasMismatch) continue;

      const [newFormula] = await db.insert(accountingFormulas).values({
        companyId,
        documentType: def.documentType,
        businessType: def.businessType,
        name: def.name,
        nameTh: def.nameTh,
        nameZh: (def as any).nameZh || null,
        description: (def as any).description || null,
        noJournalEntry: def.noJournalEntry || false,
        active: true,
      }).returning();

      for (const line of lines) {
        const realName = accountMap.get(line.accountCode);
        const correctedName = (realName && line.accountName &&
          !realName.includes(line.accountName) && !line.accountName.includes(realName))
          ? realName : line.accountName;
        await db.insert(accountingFormulaLines).values({
          formulaId: newFormula.id,
          accountCode: line.accountCode,
          accountName: correctedName,
          direction: line.direction,
          sortOrder: line.sortOrder,
        });
      }
      fixedDefaultFormulas++;
    }

    res.json({
      message: "แก้ไขชื่อบัญชีสำเร็จ",
      fixedSavedLines,
      fixedDefaultFormulas,
    });
  } catch (err: any) {
    console.error("[formula-fix-names]", err);
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/accounting-formulas/:id", requireAuth, requireModule("accounting"), async (req, res) => {
  const formula = await storage.getAccountingFormula(Number(req.params.id));
  if (!formula) return res.status(404).json({ message: "ไม่พบสูตรบัญชี" });
  const lines = await storage.getFormulaLines(formula.id);
  res.json({ ...formula, lines });
});

app.post("/api/accounting-formulas", requireAuth, requireRole("admin", "super_admin", "manager"), async (req, res) => {
  try {
    const { lines, ...formulaData } = req.body;
    const formula = await storage.createAccountingFormula(formulaData);
    if (lines && Array.isArray(lines)) {
      await storage.setFormulaLines(formula.id, lines);
    }
    const savedLines = await storage.getFormulaLines(formula.id);
    res.status(201).json({ ...formula, lines: savedLines });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.put("/api/accounting-formulas/:id", requireAuth, requireRole("admin", "super_admin", "manager"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { lines, ...formulaData } = req.body;
    const formula = await storage.updateAccountingFormula(id, formulaData);
    if (!formula) return res.status(404).json({ message: "ไม่พบสูตรบัญชี" });
    if (lines && Array.isArray(lines)) {
      await storage.setFormulaLines(id, lines);
    }
    const savedLines = await storage.getFormulaLines(id);
    res.json({ ...formula, lines: savedLines });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/accounting-formulas/:id", requireAuth, requireRole("admin", "super_admin", "manager"), async (req, res) => {
  await storage.deleteAccountingFormula(Number(req.params.id));
  res.json({ message: "ลบสูตรบัญชีสำเร็จ" });
});

app.post("/api/accounting-formulas/seed", requireAuth, requireRole("admin", "super_admin", "manager"), async (req, res) => {
  try {
    const { companyId, businessType } = req.body;
    if (!companyId || !businessType) {
      return res.status(400).json({ message: "กรุณาระบุ companyId และ businessType" });
    }
    await storage.seedDefaultFormulas(companyId, businessType);
    res.json({ message: "สร้างสูตรบัญชีเริ่มต้นสำเร็จ" });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ========== Auto Journal from Sales Document ==========

app.post("/api/journal-entries/from-document", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const user = req.user as any;
    const { documentType, documentId, companyId } = req.body;
    if (!documentType || !documentId || !companyId) {
      return res.status(400).json({ message: "กรุณาระบุ documentType, documentId, companyId" });
    }

    let doc: any = null;
    let docNo = "";
    let docDate = "";
    const docTypeMap: Record<string, string> = {
      invoice: "invoice", tax_invoice: "tax_invoice", receipt: "receipt",
      quotation: "quotation", sales_order: "sales_order", expense: "expense",
    };
    if (!docTypeMap[documentType]) {
      return res.status(400).json({ message: "ประเภทเอกสารไม่ถูกต้อง" });
    }

    if (documentType === "invoice") {
      const [r] = await db.select().from(invoices).where(and(eq(invoices.id, Number(documentId)), eq(invoices.companyId, Number(companyId))));
      if (!r) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้" });
      doc = r; docNo = r.invoiceNo; docDate = r.invoiceDate;
    } else if (documentType === "tax_invoice") {
      const [r] = await db.select().from(taxInvoices).where(and(eq(taxInvoices.id, Number(documentId)), eq(taxInvoices.companyId, Number(companyId))));
      if (!r) return res.status(404).json({ message: "ไม่พบใบกำกับภาษี" });
      doc = r; docNo = r.taxInvoiceNo; docDate = r.taxInvoiceDate;
    } else if (documentType === "receipt") {
      const [r] = await db.select().from(receipts).where(and(eq(receipts.id, Number(documentId)), eq(receipts.companyId, Number(companyId))));
      if (!r) return res.status(404).json({ message: "ไม่พบใบเสร็จรับเงิน" });
      doc = r; docNo = r.receiptNo; docDate = r.receiptDate;
    } else if (documentType === "expense") {
      const [r] = await db.select().from(expenses).where(and(eq(expenses.id, Number(documentId)), eq(expenses.companyId, Number(companyId))));
      if (!r) return res.status(404).json({ message: "ไม่พบใบค่าใช้จ่าย" });
      doc = r; docNo = r.expNo; docDate = r.expDate;
    } else {
      return res.status(400).json({ message: "ประเภทเอกสารนี้ยังไม่รองรับการบันทึกบัญชีอัตโนมัติ" });
    }

    if (documentType !== "expense") {
      const exchangeRateVal = parseFloat(doc.exchangeRate);
      if (isNaN(exchangeRateVal) || exchangeRateVal <= 0) {
        return res.status(400).json({ message: "อัตราแลกเปลี่ยนไม่ถูกต้อง" });
      }
    }

    const company = await storage.getCompany(Number(companyId));
    if (!company) return res.status(404).json({ message: "ไม่พบข้อมูลบริษัท" });

    const businessType = company.businessType || "mixed";
    const formulaBusinessType = (businessType === "accounting" || businessType === "accounting_firm") ? "service" : businessType;
    let formulaLines: any[] = [];
    if (documentType !== "expense") {
      const formulas = await storage.getAccountingFormulas(companyId, formulaBusinessType, documentType);
      let formula = formulas.find(f => f.active && !f.noJournalEntry);
      if (!formula) {
        const globalFormulas = await storage.getAccountingFormulas(undefined, formulaBusinessType, documentType);
        formula = globalFormulas.find(f => f.active && !f.noJournalEntry);
      }
      if (!formula) {
        return res.status(400).json({ message: "ไม่พบสูตรบัญชีสำหรับเอกสารนี้ กรุณาตั้งค่าสูตรบัญชีก่อน" });
      }
      if (formula.noJournalEntry) {
        return res.status(400).json({ message: "สูตรบัญชีนี้ตั้งค่าให้ไม่บันทึกรายการบัญชี" });
      }
      formulaLines = await storage.getFormulaLines(formula.id);
      if (!formulaLines.length) {
        return res.status(400).json({ message: "สูตรบัญชีไม่มีรายการ กรุณาตั้งค่ารายการบัญชีก่อน" });
      }
    }

    const currencyCode = doc.currencyCode || "THB";
    const exchangeRate = parseFloat(doc.exchangeRate) || 1;
    const isForeignCurrency = currencyCode !== "THB";

    const subtotal = parseFloat(doc.subtotal) || 0;
    const vatAmount = parseFloat(doc.vatAmount) || 0;
    const totalAmount = parseFloat(doc.totalAmount) || 0;
    const withholdingTax = parseFloat(doc.withholdingTax) || 0;

    const subtotalTHB = isForeignCurrency ? subtotal * exchangeRate : subtotal;
    const vatAmountTHB = isForeignCurrency ? vatAmount * exchangeRate : vatAmount;
    const totalAmountTHB = isForeignCurrency ? totalAmount * exchangeRate : totalAmount;
    const withholdingTaxTHB = isForeignCurrency ? withholdingTax * exchangeRate : withholdingTax;

    const companyAccounts = await storage.getAccounts(Number(companyId));

    const docTypeLabels: Record<string, string> = {
      invoice: "ใบแจ้งหนี้", tax_invoice: "ใบกำกับภาษี", receipt: "ใบเสร็จรับเงิน", expense: "ค่าใช้จ่าย",
    };
    const currencyNote = isForeignCurrency ? ` (${currencyCode} → THB @${exchangeRate})` : "";
    let description = `บันทึกบัญชีจาก${docTypeLabels[documentType] || documentType} ${docNo}${currencyNote}`;
    if (documentType === "expense" && doc.vendorName) {
      const expItemsForDesc = await db.select().from(expenseItems).where(eq(expenseItems.expenseId, Number(documentId)));
      const itemDesc = expItemsForDesc[0]?.description || doc.notes || "";
      description = `${doc.vendorName}${itemDesc ? " - " + itemDesc : ""}`;
    } else if (documentType !== "expense" && doc.customerName) {
      description = `${doc.customerName} - ${docTypeLabels[documentType] || documentType} ${docNo}${currencyNote}`;
    }

    const isExpenseDoc = documentType === "expense";

    let expenseJournalLines: { accountCode: string; accountName: string; direction: string; amount: number }[] = [];
    if (isExpenseDoc) {
      const expItems = await db.select().from(expenseItems).where(eq(expenseItems.expenseId, Number(documentId)));
      const paymentMethodName = doc.paymentMethod || null;
      let paymentAccountCode = "1001000";
      let paymentAccountName = "เงินสด";
      if (paymentMethodName) {
        const resolvedCode = await resolvePaymentMethodAccountCode(Number(companyId), paymentMethodName);
        if (resolvedCode) {
          paymentAccountCode = resolvedCode;
          const [payAcct] = await db.select().from(accounts).where(and(
            eq(accounts.companyId, Number(companyId)),
            eq(accounts.code, resolvedCode)
          )).limit(1);
          if (payAcct) paymentAccountName = payAcct.nameTh || payAcct.name || "เงินสด/ธนาคาร";
        }
      }

      const groupedExpenses: Record<string, { code: string; name: string; amount: number }> = {};
      let rawItemTotal = 0;
      for (const item of expItems) {
        const code = item.accountCode || "5210450";
        const name = item.accountName || "ค่าใช้จ่ายอื่น";
        const amt = parseFloat(item.amount || "0");
        if (!groupedExpenses[code]) groupedExpenses[code] = { code, name, amount: 0 };
        groupedExpenses[code].amount += amt;
        rawItemTotal += amt;
      }

      const discountedSubtotal = subtotalTHB;
      const discountRatio = rawItemTotal > 0 ? discountedSubtotal / rawItemTotal : 1;

      for (const g of Object.values(groupedExpenses)) {
        const adjustedAmount = parseFloat((g.amount * discountRatio).toFixed(2));
        expenseJournalLines.push({ accountCode: g.code, accountName: g.name, direction: "debit", amount: adjustedAmount });
      }
      if (vatAmountTHB > 0) {
        const [inputVatAcct] = await db.select().from(accounts).where(and(
          eq(accounts.companyId, Number(companyId)),
          sql`LENGTH(${accounts.code}) >= 7`,
          or(eq(accounts.name, "Input VAT"), eq(accounts.nameTh, "ภาษีซื้อ"))
        )).limit(1);
        const inputVatCode = inputVatAcct?.code || "1432000";
        const inputVatName = inputVatAcct?.nameTh || inputVatAcct?.name || "ภาษีซื้อ";
        expenseJournalLines.push({ accountCode: inputVatCode, accountName: inputVatName, direction: "debit", amount: vatAmountTHB });
      }
      if (withholdingTaxTHB > 0) {
        const pndCodeMap: Record<string, string> = {
          pnd1: "2344000", pnd1a: "2344000", pnd1a_special: "2344000",
          pnd2: "2345000", pnd2a: "2345000",
          pnd3: "2345000", pnd3a: "2345000",
          pnd53: "2346000",
        };
        let whtCode = "2344000";
        const [linkedWht] = await db.select().from(withholdingTaxCerts).where(and(
          eq(withholdingTaxCerts.sourceDocType, "expense"),
          eq(withholdingTaxCerts.sourceDocId, Number(documentId)),
        )).limit(1);
        if (linkedWht?.formType && pndCodeMap[linkedWht.formType]) {
          whtCode = pndCodeMap[linkedWht.formType];
        }
        const [whtAcct] = await db.select().from(accounts).where(and(
          eq(accounts.companyId, Number(companyId)),
          eq(accounts.code, whtCode)
        )).limit(1);
        const whtName = whtAcct?.nameTh || whtAcct?.name || "ภาษีหัก ณ ที่จ่าย";
        expenseJournalLines.push({ accountCode: whtAcct?.code || whtCode, accountName: whtName, direction: "credit", amount: withholdingTaxTHB });
      }
      const totalDebit = expenseJournalLines.filter(l => l.direction === "debit").reduce((s, l) => s + l.amount, 0);
      const totalCredit = withholdingTaxTHB;
      const cashCredit = parseFloat((totalDebit - totalCredit).toFixed(2));
      expenseJournalLines.push({ accountCode: paymentAccountCode, accountName: paymentAccountName, direction: "credit", amount: cashCredit });
    }

    const existingJournal = await db.select().from(journalEntries).where(and(
      eq(journalEntries.sourceDocType, documentType as any),
      eq(journalEntries.sourceDocId, Number(documentId)),
    ));
    if (existingJournal.length > 0) {
      const savedLines = await storage.getJournalLines(existingJournal[0].id);
      return res.status(200).json({ ...existingJournal[0], lines: savedLines, alreadyExists: true });
    }

    const result = await db.transaction(async (tx) => {
      const journalBook = isExpenseDoc ? "payment" : undefined;
      const entryNo = await getNextJournalEntryNo(Number(companyId), journalBook || "general", docDate);
      const [entry] = await tx.insert(journalEntries).values({
        companyId: Number(companyId),
        entryNo,
        entryDate: docDate,
        reference: docNo,
        description,
        createdBy: user.id,
        status: "posted",
        sourceDocType: documentType,
        sourceDocId: Number(documentId),
        currencyCode,
        exchangeRate: String(exchangeRate),
        ...(journalBook ? { journalBook } : {}),
      }).returning();

      if (isExpenseDoc) {
        for (const line of expenseJournalLines) {
          const account = companyAccounts.find(a => a.code === line.accountCode);
          if (!account) continue;
          await tx.insert(journalLines).values({
            journalEntryId: entry.id,
            accountId: account.id,
            description: `${line.accountName} - ${docNo}`,
            debit: line.direction === "debit" ? line.amount.toFixed(2) : "0",
            credit: line.direction === "credit" ? line.amount.toFixed(2) : "0",
          });
        }
        return entry;
      }

      for (const fl of formulaLines) {
        const account = companyAccounts.find(a => a.code === fl.accountCode);
        if (!account) continue;

        let amount = 0;
        const code = fl.accountCode;
        if (code.startsWith("120") || code.startsWith("123") || code.startsWith("124")) {
          amount = totalAmountTHB;
        } else if (code.startsWith("210") || code.startsWith("234")) {
          amount = vatAmountTHB;
        } else if (code.startsWith("4") || code.startsWith("5")) {
          amount = subtotalTHB;
        } else if (code.startsWith("100") || code.startsWith("101") || code.startsWith("102") || code.startsWith("103") || code.startsWith("104")) {
          amount = totalAmountTHB;
        } else {
          amount = subtotalTHB;
        }

        const originalAmount = isForeignCurrency ? amount / exchangeRate : undefined;

        await tx.insert(journalLines).values({
          journalEntryId: entry.id,
          accountId: account.id,
          description: `${fl.accountName} - ${docNo}`,
          debit: fl.direction === "debit" ? amount.toFixed(2) : "0",
          credit: fl.direction === "credit" ? amount.toFixed(2) : "0",
          originalDebit: isForeignCurrency && fl.direction === "debit" ? originalAmount?.toFixed(2) : undefined,
          originalCredit: isForeignCurrency && fl.direction === "credit" ? originalAmount?.toFixed(2) : undefined,
          originalCurrency: isForeignCurrency ? currencyCode : undefined,
        });
      }

      return entry;
    });

    const savedLines = await storage.getJournalLines(result.id);
    res.status(201).json({ ...result, lines: savedLines });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/journal-entries/preview-from-document", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const { documentType, documentId, companyId } = req.query;
    if (!documentType || !documentId || !companyId) {
      return res.status(400).json({ message: "กรุณาระบุ documentType, documentId, companyId" });
    }

    let doc: any = null;
    let docNo = "";

    if (documentType === "invoice") {
      const [r] = await db.select().from(invoices).where(and(eq(invoices.id, Number(documentId)), eq(invoices.companyId, Number(companyId))));
      if (!r) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้" });
      doc = r; docNo = r.invoiceNo;
    } else if (documentType === "tax_invoice") {
      const [r] = await db.select().from(taxInvoices).where(and(eq(taxInvoices.id, Number(documentId)), eq(taxInvoices.companyId, Number(companyId))));
      if (!r) return res.status(404).json({ message: "ไม่พบใบกำกับภาษี" });
      doc = r; docNo = r.taxInvoiceNo;
    } else if (documentType === "receipt") {
      const [r] = await db.select().from(receipts).where(and(eq(receipts.id, Number(documentId)), eq(receipts.companyId, Number(companyId))));
      if (!r) return res.status(404).json({ message: "ไม่พบใบเสร็จรับเงิน" });
      doc = r; docNo = r.receiptNo;
    } else {
      return res.status(400).json({ message: "ประเภทเอกสารนี้ยังไม่รองรับ" });
    }

    const company = await storage.getCompany(Number(companyId));
    if (!company) return res.status(404).json({ message: "ไม่พบข้อมูลบริษัท" });

    const businessType = company.businessType || "mixed";
    const formulaBusinessType = (businessType === "accounting" || businessType === "accounting_firm") ? "service" : businessType;
    const formulas = await storage.getAccountingFormulas(Number(companyId), formulaBusinessType, String(documentType));
    let formula = formulas.find(f => f.active && !f.noJournalEntry);
    if (!formula) {
      const globalFormulas = await storage.getAccountingFormulas(undefined, formulaBusinessType, String(documentType));
      formula = globalFormulas.find(f => f.active && !f.noJournalEntry);
    }
    if (!formula) {
      return res.json({ available: false, message: "ไม่พบสูตรบัญชีสำหรับเอกสารนี้" });
    }

    const formulaLines = await storage.getFormulaLines(formula.id);
    if (!formulaLines.length) {
      return res.json({ available: false, message: "สูตรบัญชีไม่มีรายการ" });
    }

    const currencyCode = doc.currencyCode || "THB";
    const exchangeRate = parseFloat(doc.exchangeRate) || 1;
    const isForeignCurrency = currencyCode !== "THB";

    const subtotal = parseFloat(doc.subtotal) || 0;
    const vatAmount = parseFloat(doc.vatAmount) || 0;
    const totalAmount = parseFloat(doc.totalAmount) || 0;
    const withholdingTax = parseFloat(doc.withholdingTax) || 0;

    const subtotalTHB = isForeignCurrency ? subtotal * exchangeRate : subtotal;
    const vatAmountTHB = isForeignCurrency ? vatAmount * exchangeRate : vatAmount;
    const totalAmountTHB = isForeignCurrency ? totalAmount * exchangeRate : totalAmount;
    const withholdingTaxTHB = isForeignCurrency ? withholdingTax * exchangeRate : withholdingTax;

    const companyAccounts = await storage.getAccounts(Number(companyId));

    const previewLines = formulaLines.map(fl => {
      const account = companyAccounts.find(a => a.code === fl.accountCode);
      const code = fl.accountCode;
      let amount = 0;
      if (code.startsWith("120") || code.startsWith("112") || code.startsWith("123")) {
        amount = totalAmountTHB;
      } else if (code.startsWith("234") || code.startsWith("143")) {
        amount = vatAmountTHB;
      } else if (code.startsWith("4") || code.startsWith("5")) {
        amount = subtotalTHB;
      } else if (code.startsWith("100")) {
        amount = totalAmountTHB - withholdingTaxTHB;
      } else if (code.startsWith("130")) {
        amount = withholdingTaxTHB;
      } else {
        amount = subtotalTHB;
      }
      const originalAmount = isForeignCurrency ? amount / exchangeRate : null;

      return {
        accountCode: fl.accountCode,
        accountName: fl.accountName,
        accountId: account?.id || null,
        direction: fl.direction,
        debit: fl.direction === "debit" ? amount.toFixed(2) : "0.00",
        credit: fl.direction === "credit" ? amount.toFixed(2) : "0.00",
        originalDebit: isForeignCurrency && fl.direction === "debit" ? originalAmount?.toFixed(2) : null,
        originalCredit: isForeignCurrency && fl.direction === "credit" ? originalAmount?.toFixed(2) : null,
        originalCurrency: isForeignCurrency ? currencyCode : null,
      };
    });

    res.json({
      available: true,
      formulaName: formula.nameTh || formula.name,
      documentNo: docNo,
      currencyCode,
      exchangeRate,
      isForeignCurrency,
      lines: previewLines,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/journal-preview", requireAuth, async (req, res) => {
  try {
    const { companyId, documentType, subtotal, vatAmount, withholdingTax, paymentMethod, currencyCode: inputCurrency, exchangeRate: inputRate, linkedInvoiceId } = req.body;
    if (!companyId || !documentType) {
      return res.status(400).json({ available: false, message: "กรุณาระบุ companyId และ documentType" });
    }

    const user = req.user as any;
    if (user.role !== "admin" && user.role !== "super_admin") {
      const { getUserAllowedCompanyIds } = await import("../route-middleware");
      const allowedIds = await getUserAllowedCompanyIds(user.id);
      if (allowedIds && !allowedIds.includes(Number(companyId))) {
        return res.status(403).json({ available: false, message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
      }
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, Number(companyId)));
    if (!company) return res.json({ available: false, message: "ไม่พบบริษัท" });

    const businessType = company.businessType || "mixed";
    const isCreditPayment = paymentMethod === "เครดิต" || !paymentMethod;
    const isStandaloneTaxInvoice = documentType === "tax_invoice" && !linkedInvoiceId;
    const isStandaloneReceipt = documentType === "receipt" && !linkedInvoiceId;
    const isStandalonePayment = documentType === "payment" && !linkedInvoiceId;
    const isServiceType = businessType === "service" || businessType === "accounting" || businessType === "accounting_firm" || businessType === "mixed";
    const formulaBusinessType = (businessType === "accounting" || businessType === "accounting_firm") ? "service" : businessType;

    let dbFormulas = await db.select().from(accountingFormulas)
      .where(and(
        eq(accountingFormulas.companyId, Number(companyId)),
        eq(accountingFormulas.documentType, documentType),
        eq(accountingFormulas.businessType, formulaBusinessType),
        eq(accountingFormulas.active, true),
      ));

    const companyAccounts = await db.select().from(accounts).where(eq(accounts.companyId, Number(companyId)));
    const accountMap = new Map(companyAccounts.map(a => [a.code, a]));

    let formulaLines: { accountCode: string; accountName: string; direction: string; sortOrder: number }[] = [];
    let formulaName = "";
    let noJournalEntry = false;

    const rf = (...codes: string[]) => codes.find(c => accountMap.has(c)) || codes[codes.length - 1];

    if (isStandaloneReceipt) {
      formulaName = "ใบเสร็จรับเงิน (รับรู้รายได้ทันที)";
      const revenueCode = isServiceType ? rf("4100100") : rf("4001000");
      const revenueName = isServiceType ? "รายได้จากการให้บริการ" : "รายได้";
      formulaLines = [
        { accountCode: rf("1001000"), accountName: "เงินสด/เงินฝากธนาคาร", direction: "debit", sortOrder: 1 },
        { accountCode: revenueCode, accountName: revenueName, direction: "credit", sortOrder: 2 },
        { accountCode: rf("2341000"), accountName: "ภาษีขาย", direction: "credit", sortOrder: 3 },
      ];
    } else if (isStandalonePayment) {
      formulaName = "ใบสำคัญจ่าย (จ่ายค่าใช้จ่ายตรง)";
      formulaLines = [
        { accountCode: rf("5241000"), accountName: "ค่าใช้จ่าย", direction: "debit", sortOrder: 1 },
        { accountCode: rf("1431000"), accountName: "ภาษีซื้อ", direction: "debit", sortOrder: 2 },
        { accountCode: rf("1001000"), accountName: "เงินสด/เงินฝากธนาคาร", direction: "credit", sortOrder: 3 },
      ];
    } else if (isStandaloneTaxInvoice) {
      const revCode = isServiceType ? rf("4100100") : (businessType === "ecommerce") ? rf("4011000") : rf("4001000");
      const revName = isServiceType ? "รายได้จากการให้บริการ" : "รายได้จากการขายสินค้า";
      formulaName = isCreditPayment ? "ใบกำกับภาษี (ขายเชื่อ)" : "ใบกำกับภาษี (รับชำระทันที)";
      if (isCreditPayment) {
        formulaLines = [
          { accountCode: rf("1201000"), accountName: "ลูกหนี้การค้า", direction: "debit", sortOrder: 1 },
          { accountCode: revCode, accountName: revName, direction: "credit", sortOrder: 2 },
          { accountCode: rf("2341000"), accountName: "ภาษีขาย", direction: "credit", sortOrder: 3 },
        ];
      } else {
        formulaLines = [
          { accountCode: rf("1001000"), accountName: "เงินสด/เงินฝากธนาคาร", direction: "debit", sortOrder: 1 },
          { accountCode: revCode, accountName: revName, direction: "credit", sortOrder: 2 },
          { accountCode: rf("2341000"), accountName: "ภาษีขาย", direction: "credit", sortOrder: 3 },
        ];
      }
    } else if (dbFormulas.length > 0) {
      const formula = dbFormulas[0];
      formulaName = formula.nameTh || formula.name;
      noJournalEntry = formula.noJournalEntry === true;
      if (!noJournalEntry) {
        const lines = await db.select().from(accountingFormulaLines)
          .where(eq(accountingFormulaLines.formulaId, formula.id))
          .orderBy(accountingFormulaLines.sortOrder);
        formulaLines = lines;
      }
    } else {
      const defaultFormula = DEFAULT_FORMULAS.find(
        f => f.documentType === documentType && f.businessType === formulaBusinessType
      );
      if (defaultFormula) {
        formulaName = defaultFormula.nameTh || defaultFormula.name;
        noJournalEntry = defaultFormula.noJournalEntry === true;
        formulaLines = defaultFormula.lines;
      } else {
        return res.json({ available: false, message: `ไม่พบสูตรบัญชีสำหรับ ${documentType} (${formulaBusinessType})` });
      }
    }

    if (noJournalEntry) {
      return res.json({ available: false, message: "เอกสารประเภทนี้ไม่ลงบัญชีอัตโนมัติ", noJournalEntry: true });
    }

    if (formulaLines.length === 0) {
      return res.json({ available: false, message: "สูตรบัญชีไม่มีรายการ" });
    }

    const sub = parseFloat(subtotal) || 0;
    const vat = parseFloat(vatAmount) || 0;
    const wht = parseFloat(withholdingTax || "0") || 0;
    const grossTotal = sub + vat;

    const currencyCode = inputCurrency || "THB";
    const exchangeRate = parseFloat(inputRate) || 1;
    const isForeignCurrency = currencyCode !== "THB";

    const subTHB = isForeignCurrency ? sub * exchangeRate : sub;
    const vatTHB = isForeignCurrency ? vat * exchangeRate : vat;
    const grossTotalTHB = isForeignCurrency ? grossTotal * exchangeRate : grossTotal;
    const whtTHB = isForeignCurrency ? wht * exchangeRate : wht;

    const isReceipt = documentType === "receipt";
    const isTaxInvoice = documentType === "tax_invoice";
    const isPaymentVoucher = documentType === "payment";
    const isSalesDoc = documentType === "tax_invoice" || documentType === "invoice";
    const isPurchaseDoc = documentType === "purchase" || documentType === "expense";
    const isDepositDoc = documentType === "deposit_receipt" || documentType === "deposit" || documentType === "purchase_deposit";
    const isCreditNote = documentType === "credit_note";

    let pmAccCode: string | undefined;
    let pmDisplayName: string | undefined;
    if (paymentMethod && paymentMethod !== "เครดิต") {
      const allPm = await db.select().from(paymentMethods)
        .where(eq(paymentMethods.companyId, Number(companyId)));
      const matched = allPm.find(p => p.accountCode === paymentMethod) ||
        allPm.find(p => p.name === paymentMethod || p.nameTh === paymentMethod) ||
        allPm.find(p =>
          (p.nameTh && p.nameTh.includes(paymentMethod)) ||
          (p.nameTh && paymentMethod.includes(p.nameTh)) ||
          (p.name && p.name.toLowerCase().includes(paymentMethod.toLowerCase())) ||
          (p.name && paymentMethod.toLowerCase().includes(p.name.toLowerCase()))
        );
      if (matched) {
        pmDisplayName = matched.nameTh || matched.name || undefined;
        if (matched.accountCode) {
          pmAccCode = matched.accountCode;
        } else if (matched.accountId) {
          const accRow = await db.select({ code: accounts.accountCode })
            .from(accounts).where(eq(accounts.id, matched.accountId)).limit(1);
          pmAccCode = accRow[0]?.code || undefined;
        }
        if (!pmAccCode) {
          const nm = (matched.name || matched.nameTh || "").toLowerCase();
          if (nm.includes("cash") || nm.includes("เงินสด")) pmAccCode = "1001000";
          else if (nm.includes("transfer") || nm.includes("โอน") || nm.includes("bank")) pmAccCode = "1002000";
        }
      }
    }

    const netCashTHB = (isReceipt || (isTaxInvoice && !isCreditPayment) || isPaymentVoucher || isPurchaseDoc) ? grossTotalTHB - whtTHB : grossTotalTHB;

    const previewLines: any[] = [];

    for (const line of formulaLines) {
      const lc = line.accountCode;
      const isCashBankLine = lc.startsWith("1001") || lc.startsWith("1011") || lc.startsWith("1021") || lc.startsWith("1041") || lc.startsWith("1042");
      const isARLine = lc.startsWith("120") || lc.startsWith("112") || lc.startsWith("123");
      const isAPLine = lc.startsWith("210");
      let effectiveCode = line.accountCode;

      if (isReceipt && pmAccCode && isCashBankLine) {
        effectiveCode = pmAccCode;
      }
      if (isPaymentVoucher && pmAccCode && isCashBankLine) {
        effectiveCode = pmAccCode;
      }
      if (isSalesDoc && !isCreditPayment && pmAccCode && isCashBankLine) {
        effectiveCode = pmAccCode;
      }
      if (isSalesDoc && !isCreditPayment && pmAccCode && isARLine && !linkedInvoiceId) {
        effectiveCode = pmAccCode;
      }
      if (isPurchaseDoc && isCreditPayment && isCashBankLine) {
        effectiveCode = isAPLine ? line.accountCode : "2101000";
      } else if (isPurchaseDoc && !isCreditPayment && pmAccCode && isCashBankLine) {
        effectiveCode = pmAccCode;
      }
      if (isPurchaseDoc && !isCreditPayment && pmAccCode && isAPLine) {
        effectiveCode = pmAccCode;
      }
      if (isCreditNote && !isCreditPayment && pmAccCode && isARLine) {
        effectiveCode = pmAccCode;
      }
      if (isDepositDoc && pmAccCode && isCashBankLine) {
        effectiveCode = pmAccCode;
      }

      const acc = accountMap.get(effectiveCode);
      let amount = 0;
      const code = effectiveCode;

      const wasARSubstituted = isARLine && effectiveCode !== line.accountCode;
      const wasAPSubstituted = isAPLine && effectiveCode !== line.accountCode;

      if (isDepositDoc && (isCashBankLine || wasARSubstituted || wasAPSubstituted)) {
        amount = grossTotalTHB;
      } else if (isDepositDoc && line.accountCode === "1434000") {
        amount = subTHB;
      } else if (wasARSubstituted || wasAPSubstituted) {
        amount = (isReceipt || (isTaxInvoice && !isCreditPayment) || isPaymentVoucher || isPurchaseDoc) ? netCashTHB : grossTotalTHB;
      } else if (isCashBankLine || code === pmAccCode) {
        amount = (isReceipt || (isTaxInvoice && !isCreditPayment) || isPaymentVoucher || isPurchaseDoc) ? netCashTHB : grossTotalTHB;
      } else if (code.startsWith("120") || code.startsWith("112")) {
        amount = grossTotalTHB;
      } else if (code.startsWith("123")) {
        amount = grossTotalTHB;
      } else if (code.startsWith("210")) {
        amount = grossTotalTHB;
      } else if (code.startsWith("234") || code.startsWith("143")) {
        amount = vatTHB;
      } else if (code.startsWith("233") || code.startsWith("238")) {
        amount = subTHB;
      } else if (code.startsWith("4")) {
        amount = subTHB;
      } else if (code.startsWith("5")) {
        amount = subTHB;
      } else if (code.startsWith("130") || code.startsWith("140")) {
        amount = subTHB;
      } else {
        amount = subTHB;
      }

      if (amount === 0) continue;

      const isDepositAdvanceLine = isDepositDoc && (
        (documentType === "purchase_deposit" && line.accountCode === "1434000") ||
        ((documentType === "deposit" || documentType === "deposit_receipt") && line.accountCode === "2331000")
      );
      const wasSubstituted = (isCashBankLine || isARLine || isAPLine) && effectiveCode !== line.accountCode;
      const accountName = isDepositAdvanceLine
        ? line.accountName
        : acc
          ? (acc.nameTh && acc.name ? `${acc.nameTh} (${acc.name})` : acc.nameTh || acc.name)
          : (wasSubstituted && pmDisplayName)
            ? pmDisplayName
            : line.accountName;

      previewLines.push({
        accountCode: effectiveCode,
        accountName,
        debit: line.direction === "debit" ? Math.abs(amount).toFixed(2) : "0.00",
        credit: line.direction === "credit" ? Math.abs(amount).toFixed(2) : "0.00",
      });
    }

    if ((isReceipt || (isTaxInvoice && !isCreditPayment)) && whtTHB > 0) {
      const whtAcc = accountMap.get("1434000") || accountMap.get("1307000");
      if (whtAcc) {
        previewLines.push({
          accountCode: whtAcc.code,
          accountName: whtAcc.nameTh && whtAcc.name ? `${whtAcc.nameTh} (${whtAcc.name})` : whtAcc.nameTh || whtAcc.name || "ภาษีถูกหัก ณ ที่จ่าย",
          debit: whtTHB.toFixed(2),
          credit: "0.00",
        });
      }
    }

    if ((isPaymentVoucher || isPurchaseDoc) && whtTHB > 0) {
      const whtPayableAcc = accountMap.get("2381000") || accountMap.get("2303000") || accountMap.get("2303") || accountMap.get("2331000");
      previewLines.push({
        accountCode: whtPayableAcc?.code || "2381000",
        accountName: whtPayableAcc
          ? (whtPayableAcc.nameTh && whtPayableAcc.name ? `${whtPayableAcc.nameTh} (${whtPayableAcc.name})` : whtPayableAcc.nameTh || whtPayableAcc.name || "ภาษีหัก ณ ที่จ่ายค้างจ่าย")
          : "ภาษีหัก ณ ที่จ่ายค้างจ่าย",
        debit: "0.00",
        credit: whtTHB.toFixed(2),
      });
    }

    const { lineItemAccounts } = req.body;
    if (isPurchaseDoc && lineItemAccounts && lineItemAccounts.length > 0) {
      const grouped = new Map<string, { accountCode: string; accountName: string; total: number }>();
      for (const la of lineItemAccounts) {
        const existing = grouped.get(la.accountCode);
        if (existing) {
          existing.total += la.amount;
        } else {
          grouped.set(la.accountCode, { accountCode: la.accountCode, accountName: la.accountName, total: la.amount });
        }
      }
      const expenseLineIdx = previewLines.findIndex((l: any) => parseFloat(l.debit) > 0 && (l.accountCode.startsWith("5") || l.accountCode.startsWith("130")));
      if (expenseLineIdx >= 0) {
        const origAmount = parseFloat(previewLines[expenseLineIdx].debit);
        const rawItemTotal = Array.from(grouped.values()).reduce((s, g) => s + Math.abs(g.total), 0);
        const scale = rawItemTotal > 0 ? origAmount / rawItemTotal : 1;
        const replacementLines: any[] = [];
        let scaledTotal = 0;
        const groupedArr = Array.from(grouped.values());
        for (let gi = 0; gi < groupedArr.length; gi++) {
          const g = groupedArr[gi];
          const gAcc = accountMap.get(g.accountCode);
          if (gAcc) {
            let amt: number;
            if (gi === groupedArr.length - 1 && Math.abs(scale - 1) > 0.0001) {
              amt = Math.abs(origAmount - scaledTotal);
            } else {
              amt = Math.round(Math.abs(g.total) * scale * 100) / 100;
            }
            scaledTotal += amt;
            const gName = gAcc.nameTh && gAcc.name ? `${gAcc.nameTh} (${gAcc.name})` : gAcc.nameTh || gAcc.name || g.accountName;
            replacementLines.push({ accountCode: g.accountCode, accountName: gName, debit: amt.toFixed(2), credit: "0.00" });
          }
        }
        if (replacementLines.length > 0) {
          const codedItemsRawTotal = rawItemTotal;
          const uncodedRaw = subTHB - codedItemsRawTotal;
          if (uncodedRaw > 0.005) {
            const uncodedScaled = Math.round(uncodedRaw * scale * 100) / 100;
            previewLines[expenseLineIdx].debit = uncodedScaled.toFixed(2);
            previewLines.splice(expenseLineIdx + 1, 0, ...replacementLines);
          } else {
            previewLines.splice(expenseLineIdx, 1, ...replacementLines);
          }
        }
      }
    }

    if (isSalesDoc && lineItemAccounts && (lineItemAccounts as any[]).length > 0) {
      const grouped = new Map<string, { accountCode: string; accountName: string; total: number }>();
      for (const la of lineItemAccounts as any[]) {
        const existing = grouped.get(la.accountCode);
        if (existing) existing.total += la.amount;
        else grouped.set(la.accountCode, { accountCode: la.accountCode, accountName: la.accountName, total: la.amount });
      }
      const revLineIdx = previewLines.findIndex((l: any) => parseFloat(l.credit) > 0 && l.accountCode.startsWith("4"));
      if (revLineIdx >= 0) {
        const origAmount = parseFloat(previewLines[revLineIdx].credit);
        const rawTotal = Array.from(grouped.values()).reduce((s, g) => s + Math.abs(g.total), 0);
        const scale = rawTotal > 0 ? origAmount / rawTotal : 1;
        const replacementLines: any[] = [];
        let placed = 0;
        const groupedArr = Array.from(grouped.values());
        for (let gi = 0; gi < groupedArr.length; gi++) {
          const g = groupedArr[gi];
          const gAcc = accountMap.get(g.accountCode);
          const isLast = gi === groupedArr.length - 1;
          const amt = isLast ? Math.round((origAmount - placed) * 100) / 100 : Math.round(Math.abs(g.total) * scale * 100) / 100;
          if (!isLast) placed += amt;
          if (amt <= 0) continue;
          const gName = gAcc ? (gAcc.nameTh && gAcc.name ? `${gAcc.nameTh} (${gAcc.name})` : gAcc.nameTh || gAcc.name) : g.accountName;
          replacementLines.push({ accountCode: g.accountCode, accountName: gName, debit: "0.00", credit: amt.toFixed(2) });
        }
        if (replacementLines.length > 0) previewLines.splice(revLineIdx, 1, ...replacementLines);
      }
    }

    const sortedLines = previewLines.sort((a: any, b: any) => {
      const aIsDebit = parseFloat(a.debit) > 0;
      const bIsDebit = parseFloat(b.debit) > 0;
      if (aIsDebit && !bIsDebit) return -1;
      if (!aIsDebit && bIsDebit) return 1;
      return a.accountCode.localeCompare(b.accountCode);
    });

    res.json({
      available: true,
      formulaName,
      businessType,
      currencyCode,
      exchangeRate,
      isForeignCurrency,
      lines: sortedLines,
    });
  } catch (err: any) {
    res.status(400).json({ available: false, message: err.message });
  }
});

app.post("/api/expense-journal-preview", requireAuth, async (req, res) => {
  try {
    const { companyId, items, subtotal, vatAmount, nonDeductibleVat: ndVatStr, withholdingTax, paymentMethod: pm } = req.body;
    if (!companyId) return res.status(400).json({ available: false });

    const companyAccounts = await db.select().from(accounts).where(eq(accounts.companyId, Number(companyId)));
    const accountMap = new Map(companyAccounts.map(a => [a.code, a]));

    let payAccCode = "1001000";
    let payAccName = "เงินสด";
    if (pm) {
      const rc = await resolvePaymentMethodAccountCode(Number(companyId), pm);
      if (rc) {
        payAccCode = rc;
        const acc = accountMap.get(rc);
        if (acc) payAccName = acc.nameTh ? `${acc.nameTh} (${acc.name})` : acc.name || "เงินสด/ธนาคาร";
      }
    }

    const sub = parseFloat(subtotal) || 0;
    const deductibleVat = parseFloat(vatAmount) || 0;
    const nonDeductibleVat = parseFloat(ndVatStr || "0") || 0;
    const wht = parseFloat(withholdingTax || "0") || 0;

    const lines: any[] = [];
    const grouped: Record<string, { code: string; name: string; amount: number }> = {};
    let rawTotal = 0;
    for (const item of (items || [])) {
      const code = item.accountCode || "5265000";
      const name = item.accountName || "ค่าใช้จ่ายอื่น";
      let amt = parseFloat(item.amount || "0");
      if (amt <= 0) continue;
      if (item.vatType === "vat_non_deductible") {
        amt = amt + (amt * 0.07);
      }
      if (!grouped[code]) grouped[code] = { code, name, amount: 0 };
      grouped[code].amount += amt;
      rawTotal += amt;
    }
    const targetExpense = sub + nonDeductibleVat;
    const expScale = rawTotal > 0 ? targetExpense / rawTotal : 1;
    for (const g of Object.values(grouped)) {
      const adjAmt = parseFloat((g.amount * expScale).toFixed(2));
      const acc = accountMap.get(g.code);
      lines.push({
        accountCode: g.code,
        accountName: acc ? (acc.nameTh ? `${acc.nameTh} (${acc.name})` : acc.name) : g.name,
        debit: adjAmt.toFixed(2),
        credit: "0.00",
      });
    }
    if (deductibleVat > 0) {
      const ivAcc = companyAccounts.find(a => a.code.length >= 7 && (a.name === "Input VAT" || a.nameTh === "ภาษีซื้อ"));
      lines.push({
        accountCode: ivAcc?.code || "1432000",
        accountName: ivAcc ? (ivAcc.nameTh ? `${ivAcc.nameTh} (${ivAcc.name})` : ivAcc.name) : "ภาษีซื้อ (Input VAT)",
        debit: deductibleVat.toFixed(2),
        credit: "0.00",
      });
    }
    if (wht > 0) {
      const whtAcc = accountMap.get("2346000") || accountMap.get("2344000") || accountMap.get("2224") || accountMap.get("2221");
      lines.push({
        accountCode: whtAcc?.code || "2344000",
        accountName: whtAcc ? (whtAcc.nameTh ? `${whtAcc.nameTh} (${whtAcc.name})` : whtAcc.name) : "ภาษีหัก ณ ที่จ่าย",
        debit: "0.00",
        credit: wht.toFixed(2),
      });
    }
    const totalDebit = lines.reduce((s, l) => s + parseFloat(l.debit), 0);
    const cashCredit = parseFloat((totalDebit - wht).toFixed(2));
    lines.push({
      accountCode: payAccCode,
      accountName: payAccName,
      debit: "0.00",
      credit: cashCredit.toFixed(2),
    });

    res.json({ available: true, formulaName: "ค่าใช้จ่าย (ตามรายการ)", lines });
  } catch (err: any) {
    res.status(400).json({ available: false, message: err.message });
  }
});

app.post("/api/accounts/merge-template", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const user = req.user as any;
    const { companyId, template } = req.body;
    if (!companyId || !template) return res.status(400).json({ message: "กรุณาระบุ companyId และ template" });

    const company = await storage.getCompany(companyId);
    if (!company) return res.status(404).json({ message: "ไม่พบบริษัท" });
    if (user.tenantId && company.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const { getChartOfAccounts } = await import("@shared/chart-of-accounts");
    const templateAccounts = getChartOfAccounts(template);
    if (templateAccounts.length === 0) return res.status(400).json({ message: "ไม่พบ template นี้" });

    const existingAccounts = await db.select({ code: accounts.code }).from(accounts).where(eq(accounts.companyId, companyId));
    const existingCodes = new Set(existingAccounts.map(a => a.code));

    const toInsert = templateAccounts.filter(a => !existingCodes.has(a.code));
    let added = 0;
    for (const acc of toInsert) {
      try {
        await db.insert(accounts).values({
          companyId, code: acc.code, name: acc.name,
          nameTh: acc.nameTh, nameZh: acc.nameZh,
          type: acc.type, parentCode: acc.parentCode, isHeader: acc.isHeader,
        });
        added++;
      } catch { /* skip duplicate */ }
    }

    if (added > 0) {
      const refreshed = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
      const usedParents = new Set(refreshed.map(a => a.parentCode).filter(Boolean));
      for (const acc of refreshed) {
        const shouldBeHeader = usedParents.has(acc.code);
        if (acc.isHeader !== shouldBeHeader) {
          await db.update(accounts).set({ isHeader: shouldBeHeader }).where(eq(accounts.id, acc.id));
        }
      }
    }

    res.json({ success: true, added, skipped: toInsert.length - added, total: templateAccounts.length, existing: existingCodes.size });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

}
