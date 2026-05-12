import { db } from "./db";
import { ecomDb } from "./ecom-db";
import { storage } from "./storage";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { documentSettings, companies, accounts, accountingFormulas, accountingFormulaLines, journalEntries, journalLines, taxInvoices, taxInvoiceItems, ecommerceOrders, paymentMethods, activityLogs, vatProductDictionary, stockMovements, productStock, closedPeriods, employees, invoices, receipts, receiptLinkedDocs, purchaseInvoices, expenses, paymentVoucherLinkedDocs, products, productBundles, warehouseStockLevels } from "@shared/schema";
import { formatDocNumber, validateDocNumberFormat, type DocNumberFormat, type DateEra } from "@shared/document-types";

export async function checkClosedPeriod(companyId: number, entryDate: string): Promise<{ blocked: boolean; message: string }> {
  const d = new Date(entryDate);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  const yearlyClose = await db.select().from(closedPeriods)
    .where(and(
      eq(closedPeriods.companyId, companyId),
      eq(closedPeriods.periodType, "yearly"),
      eq(closedPeriods.year, year),
    )).limit(1);
  if (yearlyClose.length > 0) {
    return { blocked: true, message: `ไม่สามารถบันทึกบัญชีได้ — งวดปี ${year + 543} ถูกปิดแล้ว กรุณาเปิดงวดก่อนแก้ไข` };
  }

  const monthlyClose = await db.select().from(closedPeriods)
    .where(and(
      eq(closedPeriods.companyId, companyId),
      eq(closedPeriods.periodType, "monthly"),
      eq(closedPeriods.year, year),
      eq(closedPeriods.month, month),
    )).limit(1);
  if (monthlyClose.length > 0) {
    const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    return { blocked: true, message: `ไม่สามารถบันทึกบัญชีได้ — งวดเดือน${THAI_MONTHS[month - 1]} ${year + 543} ถูกปิดแล้ว กรุณาเปิดงวดก่อนแก้ไข` };
  }

  return { blocked: false, message: "" };
}

export async function verifyCompanyAccess(companyId: number, tenantId: number | null | undefined): Promise<boolean> {
  if (!tenantId) return true;
  const [company] = await db.select({ tenantId: companies.tenantId }).from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) return false;
  return company.tenantId === tenantId;
}

export function isDbConnectionError(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  const code = (err?.code || "").toString();
  const dbConnectionCodes = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EAI_AGAIN",
    "57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006"];
  if (dbConnectionCodes.includes(code)) return true;
  return msg.includes("timeout exceeded") || msg.includes("connection refused") ||
    msg.includes("connection terminated") || msg.includes("too many clients") ||
    msg.includes("econnreset") || msg.includes("econnrefused") ||
    msg.includes("terminating connection") || msg.includes("server closed the connection unexpectedly");
}

export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 1000): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries && isDbConnectionError(err)) {
        console.warn(`[DB Retry] Attempt ${attempt + 1} failed: ${err.message}, retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export async function isViewingOwnCompany(userId: number, viewingCompanyId: number | undefined): Promise<boolean> {
  if (!viewingCompanyId) return true;
  const emp = await storage.getEmployeeByUserId(userId);
  if (!emp) return true;
  return emp.companyId === viewingCompanyId;
}

export function isPrivilegedRole(role: string): boolean {
  return ["admin", "manager", "super_admin"].includes(role);
}

export function isFullAccessRole(role: string): boolean {
  return ["admin", "super_admin"].includes(role);
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getNextDocNo(
  companyId: number,
  prefix: string,
  table: any,
  noColumn: any,
  companyIdColumn: any,
  docDate?: string,
  docTypeKey?: string,
  dbConn?: any,
  skipPrefixOverride?: boolean,
): Promise<string> {
  const conn = dbConn || db;
  const [settings] = await conn.select().from(documentSettings).where(eq(documentSettings.companyId, companyId));
  const format = (settings?.docNumberFormat || "YMD_SEQ") as DocNumberFormat;
  const digits = settings?.docNumberDigits || 4;
  const era = (settings?.dateEra || "CE") as DateEra;

  if (settings?.docPrefixes && !skipPrefixOverride) {
    try {
      const { resolvePrefix, getPrefixOptions, DOCUMENT_TYPES_FULL } = await import("@shared/document-types");
      let key = docTypeKey;
      if (!key) {
        const match = DOCUMENT_TYPES_FULL.find(d => d.prefix === prefix);
        if (match) key = match.key;
      }
      if (key) {
        const validOptions = getPrefixOptions(key, settings.docPrefixes);
        if (!validOptions.includes(prefix)) {
          prefix = resolvePrefix(key, settings.docPrefixes);
        }
      }
    } catch {}
  }

  let now = docDate ? new Date(docDate + "T00:00:00") : new Date();
  if (isNaN(now.getTime())) {
    now = new Date();
  }
  const ceYear = now.getFullYear();
  const year = era === "BE" ? ceYear + 543 : ceYear;
  const yy = String(year).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  let likePattern: string;
  switch (format) {
    case "YMD_SEQ":
      likePattern = `${prefix}${yy}${mm}${dd}%`;
      break;
    case "YM_SEQ":
      likePattern = `${prefix}${yy}${mm}%`;
      break;
    case "Y_SEQ":
    default:
      likePattern = `${prefix}${yy}%`;
      break;
  }

  const existing = await conn.select({ docNo: noColumn })
    .from(table)
    .where(and(
      eq(companyIdColumn, companyId),
      sql`${noColumn} LIKE ${likePattern}`
    ))
    .orderBy(desc(noColumn))
    .limit(1);

  let nextSeq = 1;
  if (existing.length > 0) {
    const lastNo = existing[0].docNo;
    const seqPart = lastNo.slice(-digits);
    const parsed = parseInt(seqPart, 10);
    if (!isNaN(parsed)) nextSeq = parsed + 1;
  }

  return formatDocNumber(prefix, nextSeq, format, digits, era, now);
}

export async function validateDocNo(companyId: number, docNo: string, prefix: string, docDate?: string): Promise<{ valid: boolean; message?: string }> {
  if (!docNo || !prefix) return { valid: true };
  const [settings] = await db.select().from(documentSettings).where(eq(documentSettings.companyId, companyId));
  const format = (settings?.docNumberFormat || "YMD_SEQ") as DocNumberFormat;
  const digits = settings?.docNumberDigits || 4;
  const era = (settings?.dateEra || "CE") as DateEra;
  return validateDocNumberFormat(docNo, prefix, format, digits, docDate, era);
}

export const JOURNAL_BOOK_PREFIX: Record<string, string> = {
  general: "JV",
  receive: "RV",
  payment: "PV",
  sales: "SV",
  purchase: "BV",
};

export async function getNextJournalEntryNo(companyId: number, journalBook: string, entryDate?: string, dbConn?: any): Promise<string> {
  const conn = dbConn || db;
  const prefix = JOURNAL_BOOK_PREFIX[journalBook] || "JV";
  const [settings] = await conn.select().from(documentSettings).where(eq(documentSettings.companyId, companyId));
  const format = (settings?.docNumberFormat || "YMD_SEQ") as DocNumberFormat;
  const digits = settings?.docNumberDigits || 4;
  const era = (settings?.dateEra || "CE") as DateEra;

  let now = entryDate ? new Date(entryDate + "T00:00:00") : new Date();
  if (isNaN(now.getTime())) now = new Date();
  const ceYear = now.getFullYear();
  const year = era === "BE" ? ceYear + 543 : ceYear;
  const yy = String(year).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  let likePattern: string;
  switch (format) {
    case "YMD_SEQ": likePattern = `${prefix}${yy}${mm}${dd}%`; break;
    case "YM_SEQ": likePattern = `${prefix}${yy}${mm}%`; break;
    case "Y_SEQ": default: likePattern = `${prefix}${yy}%`; break;
  }

  const existing = await conn.select({ docNo: journalEntries.entryNo })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.companyId, companyId),
      sql`${journalEntries.entryNo} LIKE ${likePattern}`
    ))
    .orderBy(desc(journalEntries.entryNo))
    .limit(1);

  let nextSeq = 1;
  if (existing.length > 0 && existing[0].docNo) {
    const seqPart = existing[0].docNo.slice(-digits);
    const parsed = parseInt(seqPart, 10);
    if (!isNaN(parsed)) nextSeq = parsed + 1;
  }

  return formatDocNumber(prefix, nextSeq, format, digits, era, now);
}

export interface AutoJournalParams {
  companyId: number;
  documentType: string;
  sourceDocType: string;
  sourceDocId: number;
  docDate: string;
  docNo: string;
  subtotal: string;
  vatAmount: string;
  totalAmount: string;
  withholdingTax?: string;
  currencyCode?: string;
  exchangeRate?: string;
  userId: number;
  customerName?: string;
  paymentMethodAccountCode?: string;
  paymentMethod?: string;
  linkedInvoiceId?: number | null;
  lineItemDescriptions?: string[];
  formulaId?: number | null;
  formulaBusinessType?: string | null;
  lineItemAccounts?: { accountCode: string; accountName: string; amount: number; description?: string }[];
  overrideLines?: { accountCode: string; accountName: string; debit: string; credit: string }[];
}

export async function createAutoJournalEntry(params: AutoJournalParams): Promise<{ journalEntryId: number | null; skipped: boolean; reason?: string }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await _createAutoJournalEntryInner(params);
    } catch (err: any) {
      const isConnTimeout = err.message?.includes("timeout") && err.message?.includes("connect");
      if (isConnTimeout && attempt < 3) {
        console.warn(`[AutoJournal] Connection timeout, retry ${attempt}/3...`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
        continue;
      }
      throw err;
    }
  }
  return { journalEntryId: null, skipped: true, reason: "retry exhausted" };
}

async function _createAutoJournalEntryInner(params: AutoJournalParams): Promise<{ journalEntryId: number | null; skipped: boolean; reason?: string }> {
  const _t0 = performance.now();
  const {
    companyId, documentType, sourceDocType, sourceDocId,
    docDate, docNo, subtotal, vatAmount, totalAmount, withholdingTax,
    currencyCode, exchangeRate, userId, customerName, paymentMethodAccountCode,
    paymentMethod, linkedInvoiceId, formulaId,
    formulaBusinessType: overrideBusinessType,
  } = params;
  const isCreditPayment = paymentMethod === "เครดิต" || !paymentMethod;

  const existingJEPromise = db.select().from(journalEntries)
    .where(and(
      eq(journalEntries.companyId, companyId),
      eq(journalEntries.sourceDocType, sourceDocType),
      eq(journalEntries.sourceDocId, sourceDocId),
    ));
  const periodCheckPromise = sourceDocType !== "period_closing" ? checkClosedPeriod(companyId, docDate) : Promise.resolve(null);

  const [[company], allAccounts, existingJEArr, periodCheck] = await Promise.all([
    db.select().from(companies).where(eq(companies.id, companyId)),
    db.select().from(accounts).where(eq(accounts.companyId, companyId)),
    existingJEPromise,
    periodCheckPromise,
  ]);
  const _t1 = performance.now();
  console.log(`[AutoJournal] ${docNo} parallel-queries ${Math.round(_t1 - _t0)}ms, accounts=${allAccounts.length}`);
  if (!company) return { journalEntryId: null, skipped: true, reason: "ไม่พบบริษัท" };
  if (existingJEArr.length > 0) {
    return { journalEntryId: existingJEArr[0].id, skipped: true, reason: "มีรายการบัญชีสำหรับเอกสารนี้แล้ว" };
  }
  if (periodCheck && periodCheck.blocked) {
    return { journalEntryId: null, skipped: true, reason: periodCheck.message };
  }

  const businessType = company.businessType || "mixed";
  const accountMap = new Map(allAccounts.map(a => [a.code, a]));

  const isStandaloneTaxInvoice = documentType === "tax_invoice" && !linkedInvoiceId;
  const isStandaloneReceipt = documentType === "receipt" && !linkedInvoiceId;
  const isLinkedReceipt = documentType === "receipt" && !!linkedInvoiceId;
  const isServiceType = businessType === "service" || businessType === "accounting" || businessType === "accounting_firm" || businessType === "mixed";
  const formulaBusinessType = overrideBusinessType || ((businessType === "accounting" || businessType === "accounting_firm") ? "service" : businessType);

  let dbFormulas: typeof accountingFormulas.$inferSelect[] = [];
  if (formulaId) {
    dbFormulas = await db.select().from(accountingFormulas)
      .where(and(eq(accountingFormulas.id, formulaId), eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.active, true)));
    if (dbFormulas.length > 0) dbFormulas = [dbFormulas[0]];
  } else {
    dbFormulas = await db.select().from(accountingFormulas)
      .where(and(eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.documentType, documentType), eq(accountingFormulas.businessType, formulaBusinessType), eq(accountingFormulas.active, true)));
    if (dbFormulas.length === 0 && (documentType === "expense" || documentType === "purchase")) {
      const altType = documentType === "expense" ? "purchase" : "expense";
      dbFormulas = await db.select().from(accountingFormulas)
        .where(and(eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.documentType, altType), eq(accountingFormulas.businessType, formulaBusinessType), eq(accountingFormulas.active, true)));
      if (dbFormulas.length > 0) {
        console.log(`[AutoJournal] Formula found with altType=${altType} for bizType=${formulaBusinessType} (original docType=${documentType})`);
      }
    }
  }

  let formulaLines: { accountCode: string; accountName: string; direction: string; sortOrder: number }[] = [];
  let noJournalEntry = false;

  if (isStandaloneTaxInvoice || isStandaloneReceipt) {
    const resolveFirst = (...codes: string[]) => codes.find(c => accountMap.has(c)) || codes[0];
    const revenueMap: Record<string, { code: string; name: string }> = {
      service: { code: "4100100", name: "รายได้จากการให้บริการ" },
      accounting: { code: "4100100", name: "รายได้จากการให้บริการ" },
      accounting_firm: { code: "4100100", name: "รายได้จากการให้บริการ" },
      trading: { code: "4001000", name: "รายได้จากการขายสินค้า" },
      ecommerce: { code: "4011000", name: "รายได้จากการขายออนไลน์" },
      online_shop: { code: "4011000", name: "รายได้จากการขายออนไลน์" },
      mixed: { code: "4100100", name: "รายได้" },
    };
    const revInfo = revenueMap[businessType] || revenueMap.mixed;
    const revenueCode = resolveFirst(revInfo.code, "4100100");
    const revenueName = revInfo.name;
    const vatCode = resolveFirst("2341000");
    const cashCode = resolveFirst("1001000");
    if (isStandaloneTaxInvoice && isCreditPayment) {
      const arCode = resolveFirst("1201000");
      formulaLines = [
        { accountCode: arCode, accountName: "ลูกหนี้การค้า", direction: "debit", sortOrder: 1 },
        { accountCode: revenueCode, accountName: revenueName, direction: "credit", sortOrder: 2 },
        { accountCode: vatCode, accountName: "ภาษีขาย", direction: "credit", sortOrder: 3 },
      ];
    } else {
      formulaLines = [
        { accountCode: cashCode, accountName: "เงินสด/เงินฝากธนาคาร", direction: "debit", sortOrder: 1 },
        { accountCode: revenueCode, accountName: revenueName, direction: "credit", sortOrder: 2 },
        { accountCode: vatCode, accountName: "ภาษีขาย", direction: "credit", sortOrder: 3 },
      ];
    }
  } else if (dbFormulas.length > 0) {
    const formula = dbFormulas[0];
    noJournalEntry = formula.noJournalEntry === true;
    if (!noJournalEntry) {
      const lines = await db.select().from(accountingFormulaLines)
        .where(eq(accountingFormulaLines.formulaId, formula.id))
        .orderBy(accountingFormulaLines.sortOrder);
      formulaLines = lines;
    }
  } else if (isLinkedReceipt) {
    const resolveFirstLR = (...codes: string[]) => codes.find(c => accountMap.has(c)) || codes[0];
    const arCode = resolveFirstLR("1201000");
    const cashCode = resolveFirstLR("1001000");
    formulaLines = [
      { accountCode: cashCode, accountName: "เงินสด/เงินฝากธนาคาร", direction: "debit", sortOrder: 1 },
      { accountCode: arCode, accountName: "ลูกหนี้การค้า", direction: "credit", sortOrder: 2 },
    ];
    console.log(`[AutoJournal] isLinkedReceipt fallback: DR ${cashCode} CR ${arCode}`);
  } else {
    console.log(`[AutoJournal] No formula in DB for docType=${documentType}, bizType=${formulaBusinessType} — skipping (no hardcode fallback)`);
    return { journalEntryId: null, skipped: true, reason: `ไม่พบสูตรบัญชีใน DB สำหรับ ${documentType} (${formulaBusinessType}) — กรุณาไปที่หน้าสูตรบัญชีแล้วกดตรวจสอบสูตร` };
  }

  if (noJournalEntry) {
    return { journalEntryId: null, skipped: true, reason: "เอกสารนี้ไม่ลงบัญชี (noJournalEntry)" };
  }

  if (formulaLines.length === 0) {
    return { journalEntryId: null, skipped: true, reason: "สูตรบัญชีไม่มีรายการ" };
  }

  if ((documentType === "purchase" || documentType === "expense") && company.inventoryAccountingMethod === "periodic") {
    formulaLines = formulaLines.map(line => {
      if (line.accountCode === "1301000") {
        return { ...line, accountCode: "5102000", accountName: "ซื้อสินค้า" };
      }
      return line;
    });
  }

  const sub = parseFloat(subtotal) || 0;
  const vat = parseFloat(vatAmount) || 0;
  const wht = parseFloat(withholdingTax || "0") || 0;
  const grossTotal = sub + vat;

  const isReceipt = documentType === "receipt";
  const isTaxInvoice = documentType === "tax_invoice";
  const isPaymentVoucher = documentType === "payment";
  const isCreditNote = documentType === "credit_note";
  const isPurchaseOrExpense = documentType === "purchase" || documentType === "expense";
  const netCash = (isReceipt || (isTaxInvoice && !isCreditPayment) || isPaymentVoucher || isPurchaseOrExpense) ? grossTotal - wht : grossTotal;

  const result = await db.transaction(async (tx) => {
    const docTypeLabel: Record<string, string> = {
      invoice: "ใบแจ้งหนี้",
      tax_invoice: "ใบกำกับภาษี",
      receipt: "ใบเสร็จรับเงิน",
      purchase: "เอกสารซื้อ",
      deposit: "รับเงินมัดจำ",
      payment: "ใบสำคัญจ่าย",
    };
    const descText = `${docTypeLabel[documentType] || documentType} ${docNo}${customerName ? ` - ${customerName}` : ""}`;

    const bookMap: Record<string, string> = {
      invoice: "sales", tax_invoice: "sales", receipt: "receive",
      purchase: "purchase", expense: "payment", deposit: "receive",
      payment: "payment",
    };
    const journalBook = bookMap[documentType] || "general";

    const entryNo = await getNextJournalEntryNo(companyId, journalBook, docDate, tx);

    const [entry] = await tx.insert(journalEntries).values({
      companyId,
      entryNo,
      entryDate: docDate,
      reference: docNo,
      description: descText,
      journalBook,
      contactName: customerName || null,
      createdBy: userId,
      status: "posted",
      sourceDocType,
      sourceDocId,
      currencyCode: currencyCode || "THB",
      exchangeRate: exchangeRate || "1",
    }).returning();

    const isSalesDoc = documentType === "tax_invoice" || documentType === "invoice";
    const isPurchaseDoc = documentType === "purchase" || documentType === "expense";

    const pendingLines: { accountId: number; description: string; debit: string; credit: string; accountCode: string }[] = [];

    if (params.overrideLines && params.overrideLines.length > 0) {
      for (const ol of params.overrideLines) {
        const acc = accountMap.get(ol.accountCode);
        if (!acc) continue;
        const d = parseFloat(ol.debit) || 0;
        const c = parseFloat(ol.credit) || 0;
        if (d === 0 && c === 0) continue;
        pendingLines.push({
          accountId: acc.id,
          description: acc.nameTh || acc.name || ol.accountName,
          debit: d.toFixed(2),
          credit: c.toFixed(2),
          accountCode: ol.accountCode,
        });
      }
    } else {

    const isExpenseDebit = (c: string) => c.startsWith("5") || (c.startsWith("130") && !c.startsWith("1301")) || c.startsWith("140");
    const isVatDebit = (c: string) => c.startsWith("234") || c.startsWith("143");
    const expenseDebitCount = formulaLines.filter(l => l.direction === "debit" && isExpenseDebit(l.accountCode) && !isVatDebit(l.accountCode)).length;
    const creditNonWhtCount = formulaLines.filter(l => l.direction === "credit").length;

    for (const line of formulaLines) {
      const c = line.accountCode;
      const isCashBankLine = c.startsWith("1001") || c.startsWith("1011") || c.startsWith("1021") || c.startsWith("1041") || c.startsWith("1042");
      const isARLine = c.startsWith("120") || c.startsWith("112") || c.startsWith("123");
      const isAPLine = c.startsWith("210");
      let effectiveCode = line.accountCode;

      if (isReceipt && paymentMethodAccountCode && isCashBankLine) {
        effectiveCode = paymentMethodAccountCode;
      }

      if (isPaymentVoucher && paymentMethodAccountCode && isCashBankLine) {
        effectiveCode = paymentMethodAccountCode;
      }

      if (isSalesDoc && !isCreditPayment && isCashBankLine && paymentMethodAccountCode) {
        effectiveCode = paymentMethodAccountCode;
      }

      if (isCreditNote && !isCreditPayment && paymentMethodAccountCode && isARLine) {
        effectiveCode = paymentMethodAccountCode;
      }

      if (isPurchaseDoc && isCreditPayment && isCashBankLine) {
        effectiveCode = "2101000";
      } else if (isPurchaseDoc && !isCreditPayment && paymentMethodAccountCode && isCashBankLine) {
        effectiveCode = paymentMethodAccountCode;
      }

      if (isPurchaseDoc && !isCreditPayment && paymentMethodAccountCode && isAPLine) {
        effectiveCode = paymentMethodAccountCode;
      }

      let acc = accountMap.get(effectiveCode);
      if (!acc) {
        const { STANDARD_CHART_OF_ACCOUNTS, ECOMMERCE_EXTRA_ACCOUNTS, RESTAURANT_EXTRA_ACCOUNTS } = await import("@shared/chart-of-accounts");
        const allTemplates = [...STANDARD_CHART_OF_ACCOUNTS, ...ECOMMERCE_EXTRA_ACCOUNTS, ...RESTAURANT_EXTRA_ACCOUNTS];
        const tpl = allTemplates.find(t => t.code === effectiveCode);
        if (tpl) {
          try {
            const parentTpl = tpl.parentCode ? allTemplates.find(p => p.code === tpl.parentCode) : null;
            if (parentTpl && !accountMap.has(parentTpl.code)) {
              const [hdr] = await db.insert(accounts).values({
                companyId, code: parentTpl.code, name: parentTpl.name, nameTh: parentTpl.nameTh || parentTpl.name,
                type: parentTpl.type || "asset", parentCode: parentTpl.parentCode || null, isHeader: true, active: true, level: 1,
              }).onConflictDoNothing().returning();
              if (hdr) accountMap.set(hdr.code, hdr);
            }
            const [newAcc] = await db.insert(accounts).values({
              companyId, code: tpl.code, name: tpl.name, nameTh: tpl.nameTh || tpl.name,
              type: tpl.type || "asset", parentCode: tpl.parentCode || null, isHeader: tpl.code.length <= 3, active: true, level: tpl.code.length <= 3 ? 1 : 2,
            }).onConflictDoNothing().returning();
            if (newAcc) {
              accountMap.set(newAcc.code, newAcc);
              acc = newAcc;
              console.log(`[AutoJournal] Auto-provisioned account ${effectiveCode} (${tpl.nameTh}) for company ${companyId}`);
            }
          } catch (provErr: any) {
            console.log(`[AutoJournal] Failed to provision ${effectiveCode}:`, provErr.message);
          }
        }
        if (!acc) {
          console.log(`[AutoJournal] Account ${effectiveCode} not found in company ${companyId} chart of accounts — skipping line`);
          continue;
        }
      }

      let amount = 0;
      const code = effectiveCode;

      if (isCashBankLine || code === paymentMethodAccountCode) {
        amount = (isReceipt || (isTaxInvoice && !isCreditPayment) || isPaymentVoucher || isPurchaseOrExpense) ? netCash : grossTotal;
      } else if (code.startsWith("120") || code.startsWith("112")) {
        amount = grossTotal;
      } else if (code.startsWith("123")) {
        amount = grossTotal;
      } else if (code.startsWith("210")) {
        amount = grossTotal;
      } else if (code.startsWith("234") || code.startsWith("143")) {
        amount = vat;
      } else if (code.startsWith("233") || code.startsWith("238")) {
        amount = sub;
      } else if (code.startsWith("4")) {
        const revenueLineCount = formulaLines.filter(l => l.direction === "credit" && l.accountCode.startsWith("4")).length;
        amount = revenueLineCount > 1 ? sub / revenueLineCount : sub;
      } else if (code.startsWith("5") || (code.startsWith("130") && !code.startsWith("1301")) || code.startsWith("140")) {
        if (params.lineItemAccounts && params.lineItemAccounts.length > 0 && expenseDebitCount > 1) {
          continue;
        }
        amount = expenseDebitCount > 1 ? sub / expenseDebitCount : sub;
      } else if ((code.startsWith("144") || code.startsWith("145")) && line.direction === "credit") {
        amount = grossTotal;
      } else {
        amount = sub;
      }

      if (amount === 0) continue;

      const debitAmt = line.direction === "debit" ? String(Math.abs(amount).toFixed(2)) : "0";
      const creditAmt = line.direction === "credit" ? String(Math.abs(amount).toFixed(2)) : "0";

      const accountDesc = acc.nameTh && acc.name
        ? `${acc.nameTh} (${acc.name})`
        : acc.nameTh || acc.name || line.accountName;

      let lineDesc = accountDesc;
      if (line.direction === "debit" && params.lineItemDescriptions && params.lineItemDescriptions.length > 0 && !params.lineItemAccounts?.length) {
        lineDesc = params.lineItemDescriptions.join(", ");
      }

      pendingLines.push({
        accountId: acc.id,
        description: lineDesc,
        debit: debitAmt,
        credit: creditAmt,
        accountCode: effectiveCode,
      });
    }

    if (isPurchaseDoc && params.lineItemAccounts && params.lineItemAccounts.length > 0) {
      const grouped = new Map<string, { accountCode: string; accountName: string; total: number; descriptions: string[] }>();
      for (const la of params.lineItemAccounts) {
        const existing = grouped.get(la.accountCode);
        if (existing) {
          existing.total += la.amount;
          if (la.description) existing.descriptions.push(la.description);
        } else {
          grouped.set(la.accountCode, { accountCode: la.accountCode, accountName: la.accountName, total: la.amount, descriptions: la.description ? [la.description] : [] });
        }
      }

      const isExpLine = (l: typeof pendingLines[0]) => l.debit !== "0" && (l.accountCode.startsWith("5") || (l.accountCode.startsWith("130") && !l.accountCode.startsWith("1301")) || l.accountCode.startsWith("140"));
      const expenseIdxes = pendingLines.map((l, i) => isExpLine(l) ? i : -1).filter(i => i >= 0);

      for (let r = expenseIdxes.length - 1; r >= 0; r--) {
        pendingLines.splice(expenseIdxes[r], 1);
      }

      const insertAt = expenseIdxes.length > 0 ? expenseIdxes[0] : 0;
      const newLines: typeof pendingLines = [];
      for (const [, g] of grouped) {
        const gAcc = accountMap.get(g.accountCode);
        if (gAcc && Math.abs(g.total) > 0.004) {
          const amt = Math.round(Math.abs(g.total) * 100) / 100;
          const gDesc = g.descriptions.length > 0 ? g.descriptions.join(", ") : (gAcc.nameTh && gAcc.name ? `${gAcc.nameTh} (${gAcc.name})` : gAcc.nameTh || gAcc.name || g.accountName);
          newLines.push({
            accountId: gAcc.id,
            description: gDesc,
            debit: amt.toFixed(2),
            credit: "0",
            accountCode: g.accountCode,
          });
        }
      }
      if (newLines.length > 0) {
        pendingLines.splice(insertAt, 0, ...newLines);
      }
    }
    }

    if (isSalesDoc && params.lineItemAccounts && params.lineItemAccounts.length > 0) {
      const grouped = new Map<string, { accountCode: string; accountName: string; total: number }>();
      for (const la of params.lineItemAccounts) {
        const existing = grouped.get(la.accountCode);
        if (existing) existing.total += la.amount;
        else grouped.set(la.accountCode, { accountCode: la.accountCode, accountName: la.accountName, total: la.amount });
      }

      const customTotal = Math.round(Array.from(grouped.values()).reduce((s, g) => s + g.total, 0) * 100) / 100;

      const isRevCreditLine = (l: typeof pendingLines[0]) => parseFloat(l.credit) > 0 && l.accountCode.startsWith("4");
      const firstRevIdx = pendingLines.findIndex(isRevCreditLine);
      // บันทึก formula revenue line แรกก่อน delete — ใช้สำหรับ items ที่ไม่มี accountCode
      const formulaRevLine = firstRevIdx >= 0 ? { ...pendingLines[firstRevIdx] } : null;

      for (let i = pendingLines.length - 1; i >= 0; i--) {
        if (isRevCreditLine(pendingLines[i])) pendingLines.splice(i, 1);
      }

      const remainingForFormula = Math.round((sub - customTotal) * 100) / 100;
      const newRevLines: typeof pendingLines = [];

      for (const [, g] of grouped) {
        const gAcc = accountMap.get(g.accountCode);
        if (!gAcc) {
          throw new Error(`[AutoJournal] product accountCode "${g.accountCode}" ไม่พบใน chart of accounts — กรุณาตรวจสอบรหัสบัญชีในสินค้า`);
        }
        const amt = Math.round(g.total * 100) / 100;
        if (amt <= 0) continue; // zero-amount line — ข้ามโดยตั้งใจ ไม่ใช่ error
        newRevLines.push({
          accountId: gAcc.id,
          description: gAcc.nameTh && gAcc.name ? `${gAcc.nameTh} (${gAcc.name})` : gAcc.nameTh || gAcc.name || g.accountName,
          debit: "0",
          credit: amt.toFixed(2),
          accountCode: g.accountCode,
        });
      }

      // items ที่ไม่ได้ตั้ง accountCode → ใช้ formula revenue account (explicit, ไม่ใช่ fallback)
      if (remainingForFormula > 0.004) {
        if (!formulaRevLine) {
          throw new Error(
            `[AutoJournal] lineItemAccounts: เหลือ ${remainingForFormula} ที่ยังไม่มี revenue account — formula ไม่มี credit line บัญชี "4xxx" กรุณาตรวจสอบ chart of accounts หรือ formula config`
          );
        }
        newRevLines.push({ ...formulaRevLine, credit: remainingForFormula.toFixed(2) });
      }

      const insertPos = firstRevIdx >= 0 ? firstRevIdx : pendingLines.length;
      pendingLines.splice(insertPos, 0, ...newRevLines);
    }

    if ((isReceipt || (isTaxInvoice && !isCreditPayment)) && wht > 0) {
      const whtAcc = accountMap.get("1307") || accountMap.get("1434000") || accountMap.get("1301000");
      if (whtAcc) {
        const whtDesc = whtAcc.nameTh
          ? `${whtAcc.nameTh}(${whtAcc.name})`
          : whtAcc.name || "ภาษีถูกหัก ณ ที่จ่าย";
        pendingLines.push({
          accountId: whtAcc.id,
          description: whtDesc,
          debit: String(wht.toFixed(2)),
          credit: "0",
          accountCode: whtAcc.code,
        });
      }
    }

    if ((isPaymentVoucher || isPurchaseDoc) && wht > 0) {
      const whtAcc = accountMap.get("2303") || accountMap.get("2381000") || accountMap.get("2331000");
      if (whtAcc) {
        const whtDesc = whtAcc.nameTh
          ? `${whtAcc.nameTh}(${whtAcc.name})`
          : whtAcc.name || "ภาษีหัก ณ ที่จ่ายค้างจ่าย";
        pendingLines.push({
          accountId: whtAcc.id,
          description: whtDesc,
          debit: "0",
          credit: String(wht.toFixed(2)),
          accountCode: whtAcc.code,
        });
      }
    }

    if (pendingLines.length === 0) {
      await tx.delete(journalEntries).where(eq(journalEntries.id, entry.id));
      return { journalEntryId: null, skipped: true, reason: "ไม่มีรายการบัญชีที่คำนวณได้ (ผังบัญชีของบริษัทอาจไม่มีรหัสบัญชีที่สูตรต้องการ)" };
    }

    const totalDebit = pendingLines.reduce((s, l) => s + parseFloat(l.debit), 0);
    const totalCredit = pendingLines.reduce((s, l) => s + parseFloat(l.credit), 0);
    const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
    if (Math.abs(diff) > 0.01) {
      if (isPurchaseDoc && diff > 0) {
        const apAcc = accountMap.get("2101000") || accountMap.get("2001");
        if (apAcc) {
          pendingLines.push({
            accountId: apAcc.id,
            description: apAcc.nameTh || apAcc.name || "เจ้าหนี้การค้า",
            debit: "0",
            credit: String(diff.toFixed(2)),
            accountCode: apAcc.code,
          });
        }
      } else if (isSalesDoc && diff < 0) {
        const arAcc = accountMap.get("1201000");
        if (arAcc) {
          pendingLines.push({
            accountId: arAcc.id,
            description: arAcc.nameTh || arAcc.name || "ลูกหนี้การค้า",
            debit: String(Math.abs(diff).toFixed(2)),
            credit: "0",
            accountCode: arAcc.code,
          });
        }
      }
      console.log(`[AutoJournal] Auto-balanced: diff=${diff}, added ${isPurchaseDoc ? 'AP' : 'AR'} line`);
    }

    const finalDebit = pendingLines.reduce((s, l) => s + parseFloat(l.debit), 0);
    const finalCredit = pendingLines.reduce((s, l) => s + parseFloat(l.credit), 0);
    const finalDiff = Math.abs(Math.round((finalDebit - finalCredit) * 100) / 100);
    if (finalDiff > 0.01) {
      console.log(`[AutoJournal] SKIP: still unbalanced after auto-balance (Dr=${finalDebit}, Cr=${finalCredit})`);
      await tx.delete(journalEntries).where(eq(journalEntries.id, entry.id));
      return null;
    }

    pendingLines.sort((a, b) => {
      const aIsDebit = parseFloat(a.debit) > 0;
      const bIsDebit = parseFloat(b.debit) > 0;
      if (aIsDebit && !bIsDebit) return -1;
      if (!aIsDebit && bIsDebit) return 1;
      return a.accountCode.localeCompare(b.accountCode);
    });

    if (pendingLines.length > 0) {
      await tx.insert(journalLines).values(
        pendingLines.map(pl => ({
          journalEntryId: entry.id,
          accountId: pl.accountId,
          description: pl.description,
          debit: pl.debit,
          credit: pl.credit,
        }))
      );
    }

    return entry;
  });
  console.log(`[AutoJournal] ${docNo} total ${Math.round(performance.now() - _t0)}ms`);

  if (!result) {
    return { journalEntryId: null, skipped: true, reason: "ไม่พบบัญชีที่ตรงกับสูตร — ตรวจสอบผังบัญชีของบริษัท" };
  }

  if ('skipped' in result && (result as any).skipped) {
    return result as { journalEntryId: number | null; skipped: boolean; reason?: string };
  }

  return { journalEntryId: result.id, skipped: false };
}

const PAYMENT_METHOD_ALIASES: Record<string, string[]> = {
  cash: ["cash", "เงินสด"],
  transfer: ["transfer", "โอนเงิน", "เงินโอน", "bank transfer"],
  cheque: ["cheque", "check", "เช็ค"],
  credit_card: ["credit card", "credit_card", "บัตรเครดิต"],
  promptpay: ["promptpay", "พร้อมเพย์"],
  ewallet: ["ewallet", "e-wallet", "อีวอลเล็ท"],
};

async function resolveAccountCodeFromPaymentMethodRecord(pm: { accountCode: string; accountId: number | null; name: string; nameTh: string | null }): Promise<string | undefined> {
  if (pm.accountCode) return migrateAccountCode(pm.accountCode) || undefined;
  if (pm.accountId) {
    const rows = await db.select({ code: accounts.accountCode }).from(accounts).where(eq(accounts.id, pm.accountId)).limit(1);
    if (rows[0]?.code) return migrateAccountCode(rows[0].code) || undefined;
  }
  const nm = (pm.name || pm.nameTh || "").toLowerCase();
  if (nm.includes("cash") || nm.includes("เงินสด")) return "1001000";
  if (nm.includes("transfer") || nm.includes("โอน") || nm.includes("bank")) return "1002000";
  return undefined;
}

export async function resolvePaymentMethodAccountCode(companyId: number, paymentMethodName: string | null | undefined): Promise<string | undefined> {
  if (!paymentMethodName || paymentMethodName === "เครดิต") return undefined;
  const allPm = await db.select().from(paymentMethods)
    .where(eq(paymentMethods.companyId, companyId));
  const byCode = allPm.find(p => p.accountCode === paymentMethodName);
  if (byCode) {
    const resolved = await resolveAccountCodeFromPaymentMethodRecord(byCode);
    if (resolved) return resolved;
  }
  const exact = allPm.find(p => p.name === paymentMethodName || p.nameTh === paymentMethodName);
  if (exact) {
    const resolved = await resolveAccountCodeFromPaymentMethodRecord(exact);
    if (resolved) return resolved;
  }

  const aliases = PAYMENT_METHOD_ALIASES[paymentMethodName.toLowerCase()] || [paymentMethodName];
  for (const alias of aliases) {
    const matched = allPm.find(p =>
      (p.name && p.name.toLowerCase() === alias.toLowerCase()) ||
      (p.nameTh && p.nameTh === alias) ||
      (p.name && p.name.toLowerCase().includes(alias.toLowerCase())) ||
      (p.nameTh && p.nameTh.includes(alias))
    );
    if (matched) {
      const resolved = await resolveAccountCodeFromPaymentMethodRecord(matched);
      if (resolved) return resolved;
    }
  }

  const partial = allPm.find(p =>
    (p.name && p.name.toLowerCase().includes(paymentMethodName.toLowerCase())) ||
    (p.nameTh && p.nameTh.includes(paymentMethodName)) ||
    (p.name && paymentMethodName.toLowerCase().includes(p.name.toLowerCase())) ||
    (p.nameTh && paymentMethodName.includes(p.nameTh))
  );
  if (partial) return await resolveAccountCodeFromPaymentMethodRecord(partial);
  return undefined;
}

function migrateAccountCode(code: string | null | undefined): string | undefined {
  if (!code) return undefined;
  if (code.length >= 7) return code;
  return code.length <= 4 ? code + "0".repeat(7 - code.length) : code;
}

export const PLATFORM_DOC_PREFIX: Record<string, string> = {
  shopee: "SH", lazada: "LZ", tiktok: "TT",
  grab_food: "GR", grab: "GR", "grab food": "GR",
  line_man: "LM", lineman: "LM", "line man": "LM",
  robinhood: "RH", amazon: "AZ",
};
export const PLATFORM_DISPLAY_NAME: Record<string, string> = {
  shopee: "SHOPEE", lazada: "LAZADA", tiktok: "TIKTOK",
  grab_food: "GRAB", grab: "GRAB", "grab food": "GRAB",
  line_man: "LINEMAN", lineman: "LINEMAN", "line man": "LINEMAN",
  robinhood: "ROBINHOOD", amazon: "AMAZON",
};

interface GenerateTivFromOrderParams {
  orderId: number;
  companyId: number;
  platform: string;
  orderNo: string;
  platformOrderId: string;
  buyerName: string | null;
  buyerAddress: string | null;
  totalAmount: string | null;
  trackingNo: string | null;
  shippedAt: Date | null;
  placedAt: Date | null;
  accountingMode: string;
  userId: number;
  paymentMethod?: string | null;
  vatRegistered?: boolean;
  skipJournal?: boolean;
}

export async function generateTivFromEcommerceOrder(params: GenerateTivFromOrderParams): Promise<{ taxInvoiceId: number; taxInvoiceNo: string; isExisting: boolean } | null> {
  const platformLower = String(params.platform || "").toLowerCase();
  const platformDisplay = PLATFORM_DISPLAY_NAME[platformLower] || String(params.platform || "").toUpperCase();
  const orderNo = params.orderNo || params.platformOrderId;
  const refDoc = `${platformDisplay} #${orderNo}`;

  const existingTiv = await ecomDb.select({ id: taxInvoices.id, taxInvoiceNo: taxInvoices.taxInvoiceNo }).from(taxInvoices)
    .where(and(eq(taxInvoices.companyId, params.companyId), eq(taxInvoices.refDoc, refDoc)));

  if (existingTiv.length > 0) {
    await ecomDb.update(ecommerceOrders).set({ taxInvoiceId: existingTiv[0].id }).where(eq(ecommerceOrders.id, params.orderId));
    return { taxInvoiceId: existingTiv[0].id, taxInvoiceNo: existingTiv[0].taxInvoiceNo, isExisting: true };
  }

  const items = await storage.getEcommerceOrderItems(params.orderId);
  const prefix = PLATFORM_DOC_PREFIX[platformLower] || "TIV";
  const docDate = params.placedAt
    ? new Date(params.placedAt).toISOString().split("T")[0]
    : (params.shippedAt ? new Date(params.shippedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);

  const dict = await ecomDb.select().from(vatProductDictionary)
    .where(eq(vatProductDictionary.companyId, params.companyId));
  const dictMap = new Map(dict.map(d => [d.normalizedName, d.vatType]));
  for (const item of items) {
    const normalized = String((item as any).name || "").trim().toLowerCase().replace(/\s+/g, " ");
    const dictVat = dictMap.get(normalized);
    if (dictVat) {
      (item as any).vatType = dictVat;
    }
  }

  const subtotalGross = items.length > 0
    ? items.reduce((sum: number, i: any) => sum + (parseFloat(i.total) || 0), 0)
    : parseFloat(String(params.totalAmount || "0"));
  const totalItemDiscount = items.length > 0
    ? items.reduce((sum: number, i: any) => sum + (parseFloat(i.discount) || 0), 0)
    : 0;
  const subtotal = subtotalGross - totalItemDiscount;
  const isVatReg = params.vatRegistered === true;

  let vatAmount = 0;
  if (isVatReg) {
    const vat7Total = items.length > 0
      ? items.filter((i: any) => ((i as any).vatType || "vat7") === "vat7")
          .reduce((sum: number, i: any) => sum + ((parseFloat(i.total) || 0) - (parseFloat(i.discount) || 0)), 0)
      : subtotal;
    vatAmount = Math.round(vat7Total * 7 / 107 * 100) / 100;
  }
  const fnDocLabel = isVatReg ? "ใบกำกับภาษี" : "ใบเสร็จรับเงิน";

  const [alreadyLinked] = await ecomDb.select({ taxInvoiceId: ecommerceOrders.taxInvoiceId })
    .from(ecommerceOrders).where(eq(ecommerceOrders.id, params.orderId));
  if (alreadyLinked?.taxInvoiceId) return null;

  const dupeCheck = await ecomDb.select({ id: taxInvoices.id, taxInvoiceNo: taxInvoices.taxInvoiceNo }).from(taxInvoices)
    .where(and(eq(taxInvoices.companyId, params.companyId), eq(taxInvoices.refDoc, refDoc)));
  if (dupeCheck.length > 0) {
    await ecomDb.update(ecommerceOrders).set({ taxInvoiceId: dupeCheck[0].id }).where(eq(ecommerceOrders.id, params.orderId));
    return { taxInvoiceId: dupeCheck[0].id, taxInvoiceNo: dupeCheck[0].taxInvoiceNo, isExisting: true };
  }

  const taxInvoiceNo = await getNextDocNo(params.companyId, prefix, taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId, docDate, undefined, ecomDb);

  const result = await ecomDb.transaction(async (tx) => {
    const [doc] = await tx.insert(taxInvoices).values({
      companyId: params.companyId,
      taxInvoiceNo,
      taxInvoiceDate: docDate,
      customerName: params.buyerName || "ลูกค้า",
      customerAddress: params.buyerAddress || null,
      subtotal: String(subtotal.toFixed(2)),
      discountAmount: "0",
      vatAmount: String(vatAmount.toFixed(2)),
      totalAmount: String(subtotal.toFixed(2)),
      status: "approved",
      priceMode: isVatReg ? "included" : "excluded",
      docPrefix: prefix,
      refDoc,
      paymentMethod: params.paymentMethod || "เครดิต",
      notes: `${fnDocLabel} - สร้างจาก ${params.platform} - ${orderNo}${params.trackingNo ? ` | เลขพัสดุ: ${params.trackingNo}` : ""}`,
      createdBy: params.userId,
    }).returning();

    if (items.length > 0) {
      for (const item of items) {
        const itemTotal = parseFloat(String((item as any).total || "0"));
        const itemDisc = parseFloat(String((item as any).discount || "0"));
        await tx.insert(taxInvoiceItems).values({
          taxInvoiceId: doc.id,
          productCode: (item as any).platformSku || null,
          productName: (item as any).name || "สินค้า",
          qty: String((item as any).qty || "1"),
          unit: "ชิ้น",
          unitPrice: String(parseFloat(String((item as any).price || "0")).toFixed(2)),
          discount: String(itemDisc.toFixed(2)),
          total: String((itemTotal - itemDisc).toFixed(2)),
          vatType: isVatReg ? ((item as any).vatType || "vat7") : "vat0",
        });
      }
    } else {
      await tx.insert(taxInvoiceItems).values({
        taxInvoiceId: doc.id,
        productName: `ออเดอร์ ${orderNo}`,
        qty: "1",
        unit: "ชิ้น",
        unitPrice: String(subtotal.toFixed(2)),
        discount: "0",
        total: String(subtotal.toFixed(2)),
        vatType: isVatReg ? "vat7" : "vat0",
      });
    }

    return doc;
  });

  await ecomDb.update(ecommerceOrders).set({ taxInvoiceId: result.id }).where(eq(ecommerceOrders.id, params.orderId));

  if (!result) return null;

  if ((result as any).isExisting) {
    return { taxInvoiceId: result.id, taxInvoiceNo: result.taxInvoiceNo, isExisting: true };
  }

  if (params.accountingMode === "full_accounting" && !params.skipJournal) {
    try {
      const pmAccCode = await resolvePaymentMethodAccountCode(result.companyId, result.paymentMethod);
      await createAutoJournalEntry({
        companyId: result.companyId,
        documentType: "tax_invoice",
        sourceDocType: "tax_invoice",
        sourceDocId: result.id,
        docDate: result.taxInvoiceDate,
        docNo: result.taxInvoiceNo,
        subtotal: (parseFloat(result.totalAmount) - parseFloat(result.vatAmount)).toFixed(2),
        vatAmount: String(result.vatAmount),
        totalAmount: String(result.totalAmount),
        withholdingTax: "0",
        currencyCode: "THB",
        exchangeRate: "1",
        userId: params.userId,
        customerName: result.customerName,
        paymentMethod: result.paymentMethod || undefined,
        paymentMethodAccountCode: pmAccCode,
      });
    } catch (e) {}
  }

  return { taxInvoiceId: result.id, taxInvoiceNo: result.taxInvoiceNo, isExisting: false };
}

export async function logActivity(params: {
  companyId: number;
  tenantId?: number;
  userId?: number;
  userName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  details?: string;
  ipAddress?: string;
}) {
  await db.insert(activityLogs).values(params);
}

export async function checkDocumentLimit(req: any, res: any): Promise<boolean> {
  const currentUser = req.user as any;
  if (currentUser?.tenantId) {
    try {
      const limitCheck = await storage.checkTenantLimit(currentUser.tenantId, "documents");
      if (!limitCheck.allowed) {
        res.status(403).json({ message: `แพ็คเกจ ${limitCheck.planName} รองรับเอกสารสูงสุด ${limitCheck.limit} รายการ/เดือน (ใช้แล้ว ${limitCheck.current}) กรุณาอัพเกรดแพ็คเกจ` });
        return false;
      }
    } catch (err: any) {
      console.error("[checkDocumentLimit] Subscription check failed, allowing operation:", err?.message || err);
    }
  }
  return true;
}

export async function deleteJournalEntriesForDoc(tx: any, sourceDocType: string, sourceDocId: number) {
  const entries = await tx.select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.sourceDocType, sourceDocType),
      eq(journalEntries.sourceDocId, sourceDocId),
    ));
  if (entries.length === 0) return;
  const entryIds = entries.map((e: any) => e.id);
  const idsList = entryIds.join(",");
  let spCounter = 0;
  const safeUpdate = async (statement: string) => {
    const spName = `_su${++spCounter}`;
    try {
      await tx.execute(sql.raw(`SAVEPOINT ${spName}`));
      await tx.execute(sql.raw(statement));
      await tx.execute(sql.raw(`RELEASE SAVEPOINT ${spName}`));
    } catch {
      try { await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${spName}`)); } catch {}
    }
  };
  await safeUpdate(`UPDATE bank_statements SET matched_journal_id = NULL WHERE matched_journal_id IN (${idsList})`);
  await safeUpdate(`UPDATE manufacturing_orders SET journal_entry_id = NULL WHERE journal_entry_id IN (${idsList})`);
  await safeUpdate(`UPDATE payroll_records SET journal_entry_id = NULL WHERE journal_entry_id IN (${idsList})`);
  await safeUpdate(`UPDATE petty_cash_transactions SET journal_entry_id = NULL WHERE journal_entry_id IN (${idsList})`);
  await safeUpdate(`UPDATE petty_cash_funds SET journal_entry_id = NULL WHERE journal_entry_id IN (${idsList})`);
  await safeUpdate(`UPDATE live_cf_orders SET journal_entry_id = NULL WHERE journal_entry_id IN (${idsList})`);
  await safeUpdate(`UPDATE closed_periods SET journal_entry_id = NULL WHERE journal_entry_id IN (${idsList})`);
  await safeUpdate(`UPDATE fixed_assets SET journal_entry_id = NULL WHERE journal_entry_id IN (${idsList})`);
  await safeUpdate(`UPDATE pos_sessions SET close_journal_id = NULL WHERE close_journal_id IN (${idsList})`);
  await safeUpdate(`UPDATE restaurant_pos_sessions SET close_journal_id = NULL WHERE close_journal_id IN (${idsList})`);
  try { await ecomDb.execute(sql.raw(`UPDATE ecommerce_orders SET journal_entry_id = NULL WHERE journal_entry_id IN (${idsList})`)); } catch {}
  try { await ecomDb.execute(sql.raw(`UPDATE ecommerce_settlements SET settle_journal_id = NULL WHERE settle_journal_id IN (${idsList})`)); } catch {}
  try { await ecomDb.execute(sql.raw(`UPDATE ecommerce_settlements SET withdraw_journal_id = NULL WHERE withdraw_journal_id IN (${idsList})`)); } catch {}
  try { await ecomDb.execute(sql.raw(`UPDATE ecommerce_settlements SET reversal_journal_id = NULL WHERE reversal_journal_id IN (${idsList})`)); } catch {}
  await tx.delete(journalLines).where(inArray(journalLines.journalEntryId, entryIds));
  await tx.delete(journalEntries).where(inArray(journalEntries.id, entryIds));
}

export async function deleteStockMovementsForDoc(tx: any, referenceType: string, referenceId: number) {
  const movements = await tx.select({
    id: stockMovements.id,
    productId: stockMovements.productId,
    companyId: stockMovements.companyId,
  }).from(stockMovements).where(
    and(
      eq(stockMovements.referenceType, referenceType),
      eq(stockMovements.referenceId, referenceId)
    )
  );

  if (movements.length === 0) return;

  const movementIds = movements.map((m: any) => m.id);

  const bundleDerived = await tx.select({
    id: stockMovements.id,
    productId: stockMovements.productId,
    companyId: stockMovements.companyId,
  }).from(stockMovements)
    .where(and(
      inArray(stockMovements.referenceId, movementIds),
      sql`${stockMovements.movementType} IN ('bundle_deduct', 'bundle_offset', 'bom_consume', 'mapping_convert')`
    ));
  if (bundleDerived.length > 0) {
    const derivedIds = bundleDerived.map((d: any) => d.id);
    for (let i = 0; i < derivedIds.length; i += 500) {
      const batch = derivedIds.slice(i, i + 500);
      await tx.delete(stockMovements).where(inArray(stockMovements.id, batch));
    }
    const derivedProducts = [...new Map(bundleDerived.map((d: any) => [d.productId + '_' + d.companyId, d])).values()] as any[];
    for (const { productId: dpid, companyId: dcid } of derivedProducts) {
      const [{ totalQty: dTotalQty }] = await tx.select({
        totalQty: sql<string>`COALESCE(SUM(CAST(${stockMovements.quantity} AS numeric)), 0)`,
      }).from(stockMovements).where(
        and(eq(stockMovements.productId, dpid), eq(stockMovements.companyId, dcid))
      );
      const [dExisting] = await tx.select().from(productStock).where(
        and(eq(productStock.productId, dpid), eq(productStock.companyId, dcid))
      );
      if (dExisting) {
        await tx.update(productStock).set({ quantity: dTotalQty }).where(
          and(eq(productStock.productId, dpid), eq(productStock.companyId, dcid))
        );
      }
    }
  }

  await tx.delete(stockMovements).where(
    and(
      eq(stockMovements.referenceType, referenceType),
      eq(stockMovements.referenceId, referenceId)
    )
  );

  const affectedProducts = [...new Map(movements.map((m: any) => [m.productId + '_' + m.companyId, m])).values()] as any[];

  for (const { productId: pid, companyId: cid } of affectedProducts) {
    const [{ totalQty }] = await tx.select({
      totalQty: sql<string>`COALESCE(SUM(CAST(${stockMovements.quantity} AS numeric)), 0)`,
    }).from(stockMovements).where(
      and(
        eq(stockMovements.productId, pid),
        eq(stockMovements.companyId, cid)
      )
    );

    const [existingStock] = await tx.select().from(productStock).where(
      and(eq(productStock.productId, pid), eq(productStock.companyId, cid))
    );

    if (existingStock) {
      await tx.update(productStock).set({ quantity: totalQty }).where(
        and(eq(productStock.productId, pid), eq(productStock.companyId, cid))
      );
    }
  }
}

export async function recomputePaymentStatus(docType: "taxInvoice" | "invoice", docId: number) {
  const table = docType === "taxInvoice" ? taxInvoices : invoices;
  const linkCol = docType === "taxInvoice" ? receipts.taxInvoiceId : receipts.invoiceId;
  const rldDocType = docType === "taxInvoice" ? "TIV" : "IV";
  const [doc] = await db.select().from(table).where(eq(table.id, docId));
  if (!doc) return;
  const docTotal = parseFloat((doc as any).totalAmount || "0");
  const linkedReceipts = await db.select().from(receipts).where(eq(linkCol, docId));
  const directSum = linkedReceipts.reduce((sum: number, r: any) => sum + parseFloat(r.totalAmount || "0"), 0);
  const linkedDocs = await db.select().from(receiptLinkedDocs).where(and(eq(receiptLinkedDocs.docType, rldDocType), eq(receiptLinkedDocs.docId, docId)));
  const batchSum = linkedDocs.reduce((sum: number, ld: any) => sum + parseFloat(ld.amount || "0"), 0);
  let tivSum = 0;
  if (docType === "invoice") {
    const nonCreditTIVs = await db.select({ subtotal: taxInvoices.subtotal, vatAmount: taxInvoices.vatAmount })
      .from(taxInvoices)
      .where(sql`invoice_id = ${docId} AND (payment_method IS NULL OR payment_method != 'เครดิต') AND status NOT IN ('cancelled','voided','cancel')`);
    tivSum = nonCreditTIVs.reduce((sum: number, tiv: any) => sum + parseFloat(String(tiv.subtotal || "0")) + parseFloat(String(tiv.vatAmount || "0")), 0);
  }
  const rawPaid = directSum + batchSum + tivSum;
  // WHT ถือว่าชำระแล้ว (ลูกค้าหักแล้วโอนส่วนที่เหลือ) เฉพาะเมื่อมีการชำระจริงเกิดขึ้น
  const whtAmount = rawPaid > 0
    ? parseFloat((doc as any).withholdingTax || "0")
    : 0;
  const totalPaid = rawPaid + whtAmount;
  let newPaymentStatus: "unpaid" | "partial" | "paid" = "unpaid";
  if (totalPaid > 0 && totalPaid < docTotal - 0.01) newPaymentStatus = "partial";
  else if (totalPaid >= docTotal - 0.01 && totalPaid > 0) newPaymentStatus = "paid";
  const updateFields: any = { paymentStatus: newPaymentStatus };
  const docStatus = (doc as any).status || "";
  if (newPaymentStatus === "paid" && !["cancelled", "voided", "cancel"].includes(docStatus)) {
    updateFields.status = "paid";
  } else if (newPaymentStatus !== "paid" && docStatus === "paid") {
    updateFields.status = "debtor";
  }
  await db.update(table).set(updateFields).where(eq(table.id, docId));
}

export async function recomputeAPPaymentStatus(docType: "purchaseInvoice" | "expense", docId: number) {
  const table = docType === "purchaseInvoice" ? purchaseInvoices : expenses;
  const pvDocType = docType === "purchaseInvoice" ? "AP" : "EXP";
  const [doc] = await db.select().from(table).where(eq(table.id, docId));
  if (!doc) return;
  const docTotal = parseFloat((doc as any).totalAmount || "0");
  const linkedDocs = await db.select().from(paymentVoucherLinkedDocs).where(and(eq(paymentVoucherLinkedDocs.docType, pvDocType), eq(paymentVoucherLinkedDocs.docId, docId)));
  const totalPaid = linkedDocs.reduce((sum: number, ld: any) => sum + parseFloat(ld.amount || "0"), 0);
  let status: "unpaid" | "partial" | "paid" = "unpaid";
  if (totalPaid > 0 && totalPaid < docTotal - 0.01) status = "partial";
  else if (totalPaid >= docTotal - 0.01 && totalPaid > 0) status = "paid";
  await db.update(table).set({ paymentStatus: status }).where(eq(table.id, docId));
}

export async function deleteCompaniesCascade(companyIds: number[]): Promise<{ deleted: number; errors: string[] }> {
  if (companyIds.length === 0) return { deleted: 0, errors: [] };
  const errors: string[] = [];
  const idList = companyIds.join(",");

  const fkResult = await db.execute(sql`
    SELECT tc.constraint_name, tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE ccu.table_name = 'companies' AND ccu.column_name = 'id' AND tc.constraint_type = 'FOREIGN KEY'
    ORDER BY tc.table_name
  `);
  const fkRows = (fkResult as any).rows || fkResult || [];

  console.log(`[deleteCompaniesCascade] Temporarily setting ${fkRows.length} FK constraints to CASCADE for ${companyIds.length} companies`);

  const alteredConstraints: { constraintName: string; tableName: string }[] = [];
  for (const fk of fkRows) {
    try {
      await db.execute(sql.raw(`ALTER TABLE "${fk.table_name}" DROP CONSTRAINT "${fk.constraint_name}"`));
      await db.execute(sql.raw(`ALTER TABLE "${fk.table_name}" ADD CONSTRAINT "${fk.constraint_name}" FOREIGN KEY ("${fk.column_name}") REFERENCES companies(id) ON DELETE CASCADE`));
      alteredConstraints.push({ constraintName: fk.constraint_name, tableName: fk.table_name });
    } catch (err: any) {
      errors.push(`ALTER FK ${fk.constraint_name}: ${err.message}`);
    }
  }

  let deleted = 0;
  try {
    const result = await db.execute(sql.raw(`DELETE FROM companies WHERE id IN (${idList})`));
    deleted = (result as any).rowCount || companyIds.length;
    console.log(`[deleteCompaniesCascade] Deleted ${deleted} companies with CASCADE`);
  } catch (err: any) {
    errors.push(`DELETE companies: ${err.message}`);
    console.error(`[deleteCompaniesCascade] DELETE failed:`, err.message);
  }

  for (const ac of alteredConstraints) {
    try {
      await db.execute(sql.raw(`ALTER TABLE "${ac.tableName}" DROP CONSTRAINT "${ac.constraintName}"`));
      await db.execute(sql.raw(`ALTER TABLE "${ac.tableName}" ADD CONSTRAINT "${ac.constraintName}" FOREIGN KEY ("company_id") REFERENCES companies(id) ON DELETE NO ACTION`));
    } catch (err: any) {
      errors.push(`RESTORE FK ${ac.constraintName}: ${err.message}`);
    }
  }

  console.log(`[deleteCompaniesCascade] Restored ${alteredConstraints.length} FK constraints to NO ACTION`);
  return { deleted, errors };
}

// ============ Inventory Trigger Settings ============

export interface InventoryTriggers {
  gr_approve: boolean;
  purchase_invoice_stock: boolean;
  invoice_deduct: boolean;
  credit_note_return: boolean;
  pos_sale_deduct: boolean;
  pos_void_restore: boolean;
  ecommerce_shipping_out: boolean;
  manufacturing_complete: boolean;
  goods_requisition_deduct: boolean;
}

const DEFAULT_TRIGGERS: InventoryTriggers = {
  gr_approve: true,
  purchase_invoice_stock: true,
  invoice_deduct: true,
  credit_note_return: true,
  pos_sale_deduct: true,
  pos_void_restore: true,
  ecommerce_shipping_out: true,
  manufacturing_complete: true,
  goods_requisition_deduct: true,
};

export async function getInventoryTriggers(companyId: number): Promise<InventoryTriggers> {
  try {
    const result = await db.execute(sql.raw(`SELECT inventory_triggers FROM general_settings WHERE company_id = ${companyId} LIMIT 1`));
    const row = (result as any).rows?.[0];
    if (row?.inventory_triggers && typeof row.inventory_triggers === "object") {
      return { ...DEFAULT_TRIGGERS, ...row.inventory_triggers };
    }
  } catch {}
  return { ...DEFAULT_TRIGGERS };
}

// Reverse warehouse stock for bundle-aware items (used in DELETE routes to undo deductStockBundleAware)
export async function reverseWarehouseStockBundleAware(
  items: { productId: number | null; qty: number | string; warehouseId?: number | null }[],
  companyId: number,
): Promise<void> {
  const validItems = items.filter(i => i.productId && Number(i.qty) > 0 && i.warehouseId);
  if (validItems.length === 0) return;
  const productIds = [...new Set(validItems.map(i => Number(i.productId)))];
  const prods = await db.select({ id: products.id, productType: products.productType })
    .from(products).where(inArray(products.id, productIds));
  const typeMap: Record<number, string> = {};
  for (const p of prods) typeMap[p.id] = p.productType || "simple";
  const bundleIds = prods.filter(p => p.productType === "bundle").map(p => p.id);
  const compMap: Record<number, { componentProductId: number; qty: string }[]> = {};
  if (bundleIds.length > 0) {
    const comps = await db.select().from(productBundles).where(inArray(productBundles.bundleProductId, bundleIds));
    for (const c of comps) {
      if (!compMap[c.bundleProductId]) compMap[c.bundleProductId] = [];
      compMap[c.bundleProductId].push({ componentProductId: c.componentProductId, qty: c.qty });
    }
  }
  for (const item of validItems) {
    const pid = Number(item.productId);
    const pType = typeMap[pid] || "simple";
    const wid = Number(item.warehouseId);
    const qty = Number(item.qty);
    if (pType === "bundle" && compMap[pid]?.length > 0) {
      for (const comp of compMap[pid]) {
        const compQty = qty * parseFloat(comp.qty || "1");
        await upsertWarehouseStockLevel(companyId, comp.componentProductId, wid, compQty);
      }
    } else {
      await upsertWarehouseStockLevel(companyId, pid, wid, qty);
    }
  }
}

// Upsert reserved_qty ใน warehouseStockLevels สำหรับระบบจอง SO
export async function upsertWarehouseReservedQty(
  companyId: number, productId: number, warehouseId: number, delta: number
): Promise<void> {
  try {
    const [existing] = await db.select().from(warehouseStockLevels).where(
      and(
        eq(warehouseStockLevels.companyId, companyId),
        eq(warehouseStockLevels.productId, productId),
        eq(warehouseStockLevels.warehouseId, warehouseId),
      )
    );
    if (existing) {
      const newReserved = Math.max(0, Number(existing.reservedQty || "0") + delta);
      await db.update(warehouseStockLevels)
        .set({ reservedQty: String(newReserved), updatedAt: new Date() })
        .where(eq(warehouseStockLevels.id, existing.id));
    } else if (delta > 0) {
      await db.insert(warehouseStockLevels).values({
        companyId, productId, warehouseId, quantity: "0", reservedQty: String(delta),
      });
    }
  } catch (e: any) {
    console.error(`[warehouseReserved] upsert failed cid=${companyId} pid=${productId} wid=${warehouseId} delta=${delta}:`, e.message);
  }
}

// Upsert warehouseStockLevels: เพิ่ม/ลด stock ใน warehouse cลัง cถ้า warehouseId มีค่า
export async function upsertWarehouseStockLevel(
  companyId: number, productId: number, warehouseId: number, delta: number, dbInst?: any
): Promise<void> {
  const useDb = dbInst || db;
  try {
    const [existing] = await useDb.select().from(warehouseStockLevels).where(
      and(
        eq(warehouseStockLevels.companyId, companyId),
        eq(warehouseStockLevels.productId, productId),
        eq(warehouseStockLevels.warehouseId, warehouseId),
      )
    );
    if (existing) {
      const newQty = String(Number(existing.quantity) + delta);
      await useDb.update(warehouseStockLevels)
        .set({ quantity: newQty, updatedAt: new Date() })
        .where(eq(warehouseStockLevels.id, existing.id));
    } else {
      await useDb.insert(warehouseStockLevels).values({
        companyId, productId, warehouseId, quantity: String(delta), reservedQty: "0",
      });
    }
  } catch (e: any) {
    console.error(`[warehouseStock] upsert failed cid=${companyId} pid=${productId} wid=${warehouseId} delta=${delta}:`, e.message);
  }
}

export async function deductStockBundleAware(
  items: { productId: number | null; qty: number; warehouseId?: number | null; unitPrice?: string; productName?: string }[],
  companyId: number,
  docNo: string,
  referenceType: string,
  referenceId: number,
  createdBy?: number,
  dbInstance?: any,
): Promise<{ productId: number; deducted: string; stock: any }[]> {
  const useDb = dbInstance || db;
  const validItems = items.filter(i => i.productId && i.qty > 0);
  if (validItems.length === 0) return [];

  const productIds = [...new Set(validItems.map(i => Number(i.productId)))];
  const prods = await useDb.select({ id: products.id, productType: products.productType })
    .from(products).where(inArray(products.id, productIds));
  const typeMap: Record<number, string> = {};
  for (const p of prods) typeMap[p.id] = p.productType || "simple";

  const bundleIds = prods.filter(p => p.productType === "bundle").map(p => p.id);
  const compMap: Record<number, { componentProductId: number; qty: string }[]> = {};
  if (bundleIds.length > 0) {
    const comps = await useDb.select().from(productBundles)
      .where(inArray(productBundles.bundleProductId, bundleIds));
    for (const c of comps) {
      if (!compMap[c.bundleProductId]) compMap[c.bundleProductId] = [];
      compMap[c.bundleProductId].push({ componentProductId: c.componentProductId, qty: c.qty });
    }
  }

  const results: { productId: number; deducted: string; stock: any }[] = [];
  for (const item of validItems) {
    const pid = Number(item.productId);
    const pType = typeMap[pid] || "simple";
    const wid = item.warehouseId ? Number(item.warehouseId) : null;

    if (pType === "bundle" && compMap[pid]?.length > 0) {
      for (const comp of compMap[pid]) {
        const compQty = item.qty * parseFloat(comp.qty || "1");
        try {
          const stock = await storage.adjustStock(
            companyId, comp.componentProductId, String(-compQty), "sale_deduct",
            `${docNo} (ชุด ${item.productName || pid})`,
            referenceType, referenceId,
            { referenceNo: docNo, createdBy }
          );
          if (wid) await upsertWarehouseStockLevel(companyId, comp.componentProductId, wid, -compQty);
          results.push({ productId: comp.componentProductId, deducted: String(-compQty), stock });
        } catch (e: any) {
          console.error(`Bundle stock deduction failed for component ${comp.componentProductId}:`, e.message);
        }
      }
    } else {
      try {
        const unitPrice = item.unitPrice || "0";
        const totalCost = String(item.qty * parseFloat(unitPrice));
        const stock = await storage.adjustStock(
          companyId, pid, String(-item.qty), "sale_deduct",
          docNo, referenceType, referenceId,
          { unitCost: unitPrice, totalCost, referenceNo: docNo, createdBy }
        );
        if (wid) await upsertWarehouseStockLevel(companyId, pid, wid, -item.qty);
        results.push({ productId: pid, deducted: String(-item.qty), stock });
      } catch (e: any) {
        console.error(`Stock deduction failed for product ${pid}:`, e.message);
      }
    }
  }
  return results;
}
