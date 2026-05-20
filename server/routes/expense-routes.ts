import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { eq, and, desc, or, sql, count, not } from "drizzle-orm";
import { expenses, expenseItems, withholdingTaxCerts, whtCertItems, companies, accounts, contacts, journalEntries, journalLines, purchaseInvoices, ftpArchiveItems, documentImportBatches, purchaseDebitNotes, purchaseDebitNoteItems, paymentMethods } from "@shared/schema";
import { expenseDailyBatches } from "@shared/schema-extra";
import { requireAuth, requireModule, checkDocOwnership } from "../route-middleware";
import { getNextDocNo, validateDocNo, getNextJournalEntryNo, resolvePaymentMethodAccountCode, checkDocumentLimit, deleteJournalEntriesForDoc, logActivity } from "../route-helpers";
import { parsePagination, paginatedResponse } from "./pagination";
import multer from "multer";
import crypto from "crypto";
import * as XLSX from "xlsx";
import * as path from "path";
const isCreditPm = (name?: string | null) =>
  !!name && (name.toLowerCase() === "credit" || name === "เครดิต" || name.startsWith("เครดิต("));

import { generateWhtCertPdf } from "../pdf-wht-cert";

function isAllowedRedirectUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const { getConfig } = require("../config-bootstrap");
    const ftpBaseUrl = getConfig("FTP_BASE_URL") || "";
    const ftpLanUrl = getConfig("FTP_LAN_BASE_URL") || "";
    const allowedOrigins: string[] = [];
    if (ftpBaseUrl) {
      try { allowedOrigins.push(new URL(ftpBaseUrl).origin); } catch {}
    }
    if (ftpLanUrl) {
      try { allowedOrigins.push(new URL(ftpLanUrl).origin); } catch {}
    }
    return allowedOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
}

async function cleanupDxpBatchAfterExpenseDelete(tx: any, expenseId: number, batchId: number | null, companyId: number) {
  if (!batchId) return;
  const linkedDns = await tx.execute(sql`SELECT id FROM purchase_debit_notes WHERE ref_expense_id = ${expenseId}`);
  const dnIds = (linkedDns.rows as any[]).map((d: any) => d.id);
  if (dnIds.length > 0) {
    const pgDnIds = sql.raw(`ARRAY[${dnIds.join(',')}]::int[]`);
    await tx.execute(sql`DELETE FROM purchase_debit_note_items WHERE debit_note_id = ANY(${pgDnIds})`);
    await deleteJournalEntriesForDoc(tx, "purchase_debit_note", dnIds[0]);
    for (const dnId of dnIds.slice(1)) { await deleteJournalEntriesForDoc(tx, "purchase_debit_note", dnId); }
    await tx.execute(sql`DELETE FROM purchase_debit_notes WHERE id = ANY(${pgDnIds})`);
  }
  const remaining = await tx.execute(sql`SELECT id FROM expenses WHERE batch_id = ${batchId} LIMIT 1`);
  const remainingDns = await tx.execute(sql`SELECT id FROM purchase_debit_notes WHERE batch_id = ${batchId} LIMIT 1`);
  if ((remaining.rows as any[]).length === 0 && (remainingDns.rows as any[]).length === 0) {
    await deleteJournalEntriesForDoc(tx, "expense_daily_batch", batchId);
    const dxpBatchResult = await tx.execute(sql`SELECT batch_no FROM expense_daily_batches WHERE id = ${batchId}`);
    const dxpBatch = (dxpBatchResult.rows as any[])[0];
    if (dxpBatch) {
      const dxpNo = dxpBatch.batch_no;
      const dnJournals = await tx.execute(sql`SELECT id FROM journal_entries WHERE company_id = ${companyId} AND source_doc_type = 'purchase_debit_note' AND reference = ${dxpNo}`);
      const dnJIds = (dnJournals.rows as any[]).map((j: any) => j.id);
      if (dnJIds.length > 0) {
        const pgDnJIds = sql.raw(`ARRAY[${dnJIds.join(',')}]::int[]`);
        try { await tx.execute(sql.raw(`UPDATE bank_statements SET matched_journal_id = NULL WHERE matched_journal_id IN (${dnJIds.join(',')})`)); } catch {}
        await tx.execute(sql`DELETE FROM journal_lines WHERE journal_entry_id = ANY(${pgDnJIds})`);
        await tx.execute(sql`DELETE FROM journal_entries WHERE id = ANY(${pgDnJIds})`);
      }
    }
    await tx.execute(sql`DELETE FROM expense_daily_batches WHERE id = ${batchId}`);
  } else if ((remaining.rows as any[]).length > 0) {
    const sums = await tx.execute(sql`
      SELECT COALESCE(SUM(total_amount::numeric),0) as total, COALESCE(SUM(vat_amount::numeric),0) as vat,
             COALESCE(SUM(withholding_tax::numeric),0) as wht, COUNT(*) as cnt
      FROM expenses WHERE batch_id = ${batchId}
    `);
    const row = (sums.rows as any[])[0];
    await tx.execute(sql`UPDATE expense_daily_batches SET total_amount = ${String(row.total)}, total_vat = ${String(row.vat)}, total_wht = ${String(row.wht)}, total_expenses = ${Number(row.cnt)} WHERE id = ${batchId}`);
  }
}

function normalizeObjectPath(url: string): string {
  if (url.startsWith("/objects/")) return url.replace("/objects/", "");
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      const pathPart = parsed.pathname;
      if (pathPart.startsWith("/objects/")) return pathPart.replace("/objects/", "");
      return pathPart.startsWith("/") ? pathPart.slice(1) : pathPart;
    } catch {}
  }
  return url;
}

interface ArchiveResolution {
  status: string;
  archivedUrl: string | null;
  fileSize: string | null;
  transferredSize: string | null;
  attempts: number;
}

async function resolveArchivedUrl(originalUrl: string): Promise<ArchiveResolution | null> {
  try {
    const normalizedUrl = normalizeObjectPath(originalUrl);

    const [item] = await db.select({
      status: ftpArchiveItems.status,
      archivedUrl: ftpArchiveItems.archivedUrl,
      fileSize: ftpArchiveItems.fileSize,
      transferredSize: ftpArchiveItems.transferredSize,
      attempts: ftpArchiveItems.attempts,
    })
      .from(ftpArchiveItems)
      .where(
        or(
          eq(ftpArchiveItems.localPath, normalizedUrl),
          eq(ftpArchiveItems.localPath, originalUrl),
          eq(ftpArchiveItems.originalUrl, originalUrl),
          eq(ftpArchiveItems.originalUrl, `/objects/${normalizedUrl}`),
        )
      )
      .orderBy(desc(ftpArchiveItems.createdAt))
      .limit(1);

    if (!item) return null;
    return {
      status: item.status || "unknown",
      archivedUrl: item.archivedUrl,
      fileSize: item.fileSize,
      transferredSize: item.transferredSize,
      attempts: item.attempts || 0,
    };
  } catch {
    return null;
  }
}

export function registerExpenseRoutes(app: Express) {
  // DATA FIX DONE 2026-05-07 — hook removed after verified. See shared/schema-extra.ts history.
  // runExpenseCurrencyMigration(db);

  // ============ Expenses ============

  app.get("/api/expenses", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const whereClause = eq(expenses.companyId, companyId);
      const buildResult = async (rows: any[]) => {
        const userIds = Array.from(new Set(rows.map((r: any) => r.createdBy).concat(rows.map((r: any) => r.updatedBy)).filter(Boolean))) as number[];
        const userMap: Record<number, string> = {};
        for (const uid of userIds) { const u = await storage.getUser(uid); if (u) userMap[uid] = u.username; }
        const allItems = rows.length > 0 ? await db.select().from(expenseItems).where(sql`${expenseItems.expenseId} IN (${sql.join(rows.map((r: any) => sql`${r.id}`), sql`, `)})`) : [];
        const itemsByExpense: Record<number, any[]> = {};
        for (const item of allItems) { if (!itemsByExpense[item.expenseId]) itemsByExpense[item.expenseId] = []; itemsByExpense[item.expenseId].push(item); }
        // Fetch currency fields not in drizzle schema
        const currencyMap: Record<number, { currencyCode: string; exchangeRate: string; paidAmount: string }> = {};
        if (rows.length > 0) {
          const ids = rows.map((r: any) => r.id);
          const cr = await db.execute(sql`SELECT id, currency_code, exchange_rate, paid_amount FROM expenses WHERE id IN (${sql.join(ids.map((id: number) => sql`${id}`), sql`, `)})`);
          for (const row of cr.rows as any[]) { currencyMap[row.id] = { currencyCode: row.currency_code || "THB", exchangeRate: String(row.exchange_rate || "1"), paidAmount: String(row.paid_amount || "0") }; }
        }
        return rows.map((r: any) => {
          const expItems = itemsByExpense[r.id] || [];
          return { ...r, ...currencyMap[r.id], firstItemDescription: expItems.find((it: any) => it.description)?.description || expItems.find((it: any) => it.accountName)?.accountName || null, createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-", updatedByName: r.updatedBy ? userMap[r.updatedBy] || "-" : "-" };
        });
      };
      if (req.query.page) {
        const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
        const [{ total }] = await db.select({ total: count() }).from(expenses).where(whereClause);
        const rows = await db.select().from(expenses).where(whereClause).orderBy(desc(expenses.expDate), desc(expenses.id)).limit(pageSize).offset(offset);
        return res.json(paginatedResponse(await buildResult(rows), Number(total), { page, pageSize, offset }));
      }
      const rows = await db.select().from(expenses).where(whereClause).orderBy(desc(expenses.expDate), desc(expenses.id));
      res.json(await buildResult(rows));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/expenses/next-no", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const prefix = String(req.query.prefix || "EXP");
      const expNo = await getNextDocNo(companyId, prefix, expenses, expenses.expNo, expenses.companyId, req.query.docDate as string);
      res.json({ expNo });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/attachments/download", requireAuth, async (req, res) => {
    try {
      const fileUrl = req.query.url as string;
      if (!fileUrl) return res.status(400).json({ message: "ไม่ระบุ URL ไฟล์" });

      if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
        if (isAllowedRedirectUrl(fileUrl)) {
          return res.redirect(fileUrl);
        }
        return res.status(400).json({ message: "URL ไม่อยู่ในโดเมนที่อนุญาต" });
      }

      const { readFromPath } = await import("../replit_integrations/object_storage/routes");

      const objectPath = normalizeObjectPath(fileUrl);
      const fileName = path.basename(objectPath);

      const tryPaths = [objectPath];
      if (!objectPath.startsWith("pdf-imports/")) {
        tryPaths.push(`pdf-imports/${fileName}`);
      }

      let downloaded = false;
      for (const tryPath of tryPaths) {
        try {
          const fileData = readFromPath(tryPath);
          if (fileData) {
            const ext = path.extname(tryPath).toLowerCase();
            const mimeMap: Record<string, string> = {
              ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
              ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
            };
            const contentType = mimeMap[ext] || "application/octet-stream";
            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(path.basename(tryPath))}"`);
            res.send(fileData);
            downloaded = true;
            break;
          }
        } catch {}
      }

      if (!downloaded) {
        const archivedPath = objectPath + ".archived";
        try {
          const archivedData = readFromPath(archivedPath);
          if (archivedData) {
            const ext = path.extname(objectPath).toLowerCase();
            const mimeMap: Record<string, string> = {
              ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
              ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
            };
            const contentType = mimeMap[ext] || "application/octet-stream";
            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
            res.send(archivedData);
            downloaded = true;
          }
        } catch {}
      }

      if (!downloaded) {
        const archiveInfo = await resolveArchivedUrl(fileUrl);
        if (archiveInfo) {
          if (archiveInfo.status === "completed" && archiveInfo.archivedUrl) {
            if (isAllowedRedirectUrl(archiveInfo.archivedUrl)) {
              return res.redirect(archiveInfo.archivedUrl);
            }
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ไฟล์ถูกเก็บถาวร</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef9f6"><div style="text-align:center;padding:2rem"><p style="font-size:1.5rem;color:#05b187">✅</p><p style="font-size:1rem;color:#333">ไฟล์ถูกย้ายไปเก็บถาวรแล้ว</p><p style="color:#666;font-size:0.875rem">แต่ URL ปลายทางยังเข้าถึงไม่ได้<br/>ติดต่อ HO เพื่อขอเรียกคืนไฟล์</p></div></body></html>`;
            return res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
          }
          if (archiveInfo.status === "transferring") {
            const totalBytes = Number(archiveInfo.fileSize) || 0;
            const sentBytes = Number(archiveInfo.transferredSize) || 0;
            const pct = totalBytes > 0 ? Math.round((sentBytes / totalBytes) * 100) : 0;
            const sizeMB = totalBytes > 0 ? (totalBytes / 1024 / 1024).toFixed(1) : "?";
            const progressText = totalBytes > 0 ? `${pct}% ของ ${sizeMB} MB` : "กำลังดำเนินการ...";
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="10"><title>กำลังย้ายไฟล์</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef9f6"><div style="text-align:center;padding:2rem;max-width:400px"><p style="font-size:1.5rem;color:#fb9678">⏳</p><p style="font-size:1rem;color:#333">ไฟล์กำลังถูกย้ายไปเก็บถาวร</p><div style="margin:1rem 0;background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden"><div style="background:#fb9678;height:100%;width:${pct}%;transition:width 0.3s"></div></div><p style="color:#666;font-size:0.875rem">${progressText}<br/>ความพยายามครั้งที่ ${archiveInfo.attempts}</p><p style="color:#999;font-size:0.75rem;margin-top:0.5rem">หน้านี้จะรีเฟรชอัตโนมัติทุก 10 วินาที</p><button onclick="location.reload()" style="margin-top:0.5rem;padding:0.5rem 1.5rem;background:#fb9678;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem">รีเฟรชเลย</button></div></body></html>`;
            return res.status(202).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
          }
          if (archiveInfo.status === "pending") {
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="15"><title>รอย้ายไฟล์</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef9f6"><div style="text-align:center;padding:2rem"><p style="font-size:1.5rem;color:#fec90f">📋</p><p style="font-size:1rem;color:#333">ไฟล์อยู่ในคิวรอย้าย</p><p style="color:#666;font-size:0.875rem">ระบบจะเริ่มย้ายเร็วๆ นี้<br/>ความพยายามครั้งที่ ${archiveInfo.attempts || 0}</p><p style="color:#999;font-size:0.75rem;margin-top:0.5rem">หน้านี้จะรีเฟรชอัตโนมัติทุก 15 วินาที</p><button onclick="location.reload()" style="margin-top:0.5rem;padding:0.5rem 1.5rem;background:#fb9678;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem">รีเฟรชเลย</button></div></body></html>`;
            return res.status(202).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
          }
          if (archiveInfo.status === "failed") {
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ย้ายไฟล์ไม่สำเร็จ</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef9f6"><div style="text-align:center;padding:2rem"><p style="font-size:1.5rem;color:#f94d4d">⚠️</p><p style="font-size:1rem;color:#333">การย้ายไฟล์ล้มเหลว</p><p style="color:#666;font-size:0.875rem">ไฟล์ไม่สามารถย้ายไปเก็บถาวรได้ (พยายามแล้ว ${archiveInfo.attempts} ครั้ง)<br/>ติดต่อ HO เพื่อตรวจสอบ</p></div></body></html>`;
            return res.status(500).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
          }
        }

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ไม่พบไฟล์</title></head><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef9f6"><div style="text-align:center;padding:2rem"><p style="font-size:1.5rem;color:#f94d4d">📁</p><p style="font-size:1rem;color:#333">ไม่พบไฟล์ในที่เก็บ</p><p style="color:#666;font-size:0.875rem">ไฟล์อาจถูกย้ายไปเก็บถาวรแล้ว<br/>ติดต่อ HO เพื่อขอเรียกคืนไฟล์</p></div></body></html>`;
        res.status(404).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/expenses/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(expenses).where(eq(expenses.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบค่าใช้จ่าย" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const items = await db.select().from(expenseItems).where(eq(expenseItems.expenseId, doc.id));
      let createdByName = "-";
      let updatedByName = "-";
      if (doc.createdBy) { const u = await storage.getUser(doc.createdBy); if (u) createdByName = u.fullName; }
      if (doc.updatedBy) { const u = await storage.getUser(doc.updatedBy); if (u) updatedByName = u.fullName; }
      const [cRow] = (await db.execute(sql`SELECT currency_code, exchange_rate, paid_amount FROM expenses WHERE id = ${doc.id}`)).rows as any[];
      const currencyCode = cRow?.currency_code || "THB";
      const exchangeRate = String(cRow?.exchange_rate || "1");
      const paidAmount = String(cRow?.paid_amount || "0");
      res.json({ ...doc, currencyCode, exchangeRate, paidAmount, items, createdByName, updatedByName });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/expenses", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      if (!(await checkDocumentLimit(req, res))) return;
      const { items, ...body } = req.body;
      if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
      else body.creditDays = Number(body.creditDays) || null;
      if (body.vendorId === "" || body.vendorId === undefined) body.vendorId = null;
      else body.vendorId = Number(body.vendorId) || null;
      const user = req.user as any;
      const companyId = Number(body.companyId);
      if (!companyId || !body.vendorName || !body.expDate) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน (companyId, vendorName, expDate)" });
      }
      const prefix = body.docPrefix || "EXP";
      let expNo = body.expNo;
      if (!expNo) {
        expNo = await getNextDocNo(companyId, prefix, expenses, expenses.expNo, expenses.companyId, body.expDate);
      } else {
        const fmtCheck = await validateDocNo(companyId, expNo, prefix, body.expDate);
        if (!fmtCheck.valid) {
          expNo = await getNextDocNo(companyId, prefix, expenses, expenses.expNo, expenses.companyId, body.expDate);
        }
      }
      if (body.taxInvoiceRef && body.taxInvoiceRef.trim()) {
        const [dupTaxRef] = await db.select({ id: expenses.id, expNo: expenses.expNo }).from(expenses)
          .where(and(eq(expenses.companyId, companyId), eq(expenses.taxInvoiceRef, body.taxInvoiceRef.trim())))
          .limit(1);
        if (dupTaxRef) {
          return res.status(409).json({ message: `เลขที่ใบกำกับภาษีซื้อ "${body.taxInvoiceRef}" ซ้ำกับค่าใช้จ่าย ${dupTaxRef.expNo}`, field: "taxInvoiceRef" });
        }
        const [dupPiTaxRef] = await db.select({ id: purchaseInvoices.id, apNo: purchaseInvoices.apNo }).from(purchaseInvoices)
          .where(and(eq(purchaseInvoices.companyId, companyId), eq(purchaseInvoices.taxInvoiceRef, body.taxInvoiceRef.trim())))
          .limit(1);
        if (dupPiTaxRef) {
          return res.status(409).json({ message: `เลขที่ใบกำกับภาษีซื้อ "${body.taxInvoiceRef}" ซ้ำกับเอกสาร ${dupPiTaxRef.apNo}`, field: "taxInvoiceRef" });
        }
      }
      const entryNo = await getNextJournalEntryNo(companyId, "payment", body.expDate);
      const { result, savedItems, journalResult } = await db.transaction(async (tx) => {
        const [doc] = await tx.insert(expenses).values({
          companyId,
          expNo,
          expDate: body.expDate,
          dueDate: body.dueDate || null,
          vendorId: body.vendorId,
          vendorCode: body.vendorCode || null,
          vendorName: body.vendorName,
          vendorOrg: body.vendorOrg || null,
          vendorAddress: body.vendorAddress || null,
          vendorTaxId: body.vendorTaxId || null,
          branch: body.branch || null,
          sellerBranchId: body.sellerBranchId || null,
          contactEmail: body.contactEmail || null,
          contactPhone: body.contactPhone || null,
          creditDays: body.creditDays,
          taxInvoiceRef: body.taxInvoiceRef || null,
          formulaCode: body.formulaCode || null,
          subtotal: body.subtotal || "0",
          discountAmount: body.discountAmount || "0",
          vatAmount: body.vatAmount || "0",
          totalAmount: body.totalAmount || "0",
          withholdingTax: body.withholdingTax || "0",
          status: body.status || "approved",
          paymentStatus: body.paymentStatus || (body.paymentMethod && body.paymentMethod !== "เครดิต" ? "paid" : "unpaid"),
          priceMode: body.priceMode || "excluded",
          showInTaxReport: body.showInTaxReport !== undefined ? body.showInTaxReport : true,
          docPrefix: prefix,
          refDoc: body.refDoc || null,
          notes: body.notes || null,
          salesperson: body.salesperson || null,
          department: body.department || null,
          project: body.project || null,
          paymentMethod: body.paymentMethod || null,
          attachedUrl: body.attachedUrl || null,
          linkJournal: body.linkJournal ?? true,
          createdBy: user.id,
        }).returning();
        // currency_code/exchange_rate not in Drizzle schema — must use raw SQL
        await tx.execute(sql`UPDATE expenses SET currency_code = ${body.currencyCode || "THB"}, exchange_rate = ${body.exchangeRate || "1"} WHERE id = ${doc.id}`);
        let txItems: any[] = [];
        if (items && Array.isArray(items) && items.length > 0) {
          await tx.insert(expenseItems).values(items.map((item: any) => ({
            expenseId: doc.id,
            accountCode: item.accountCode || null,
            accountName: item.accountName || null,
            description: item.description || null,
            expenseType: item.expenseType || null,
            amount: String(item.amount || "0"),
            vatType: item.vatType || "vat7",
          })));
          txItems = await tx.select().from(expenseItems).where(eq(expenseItems.expenseId, doc.id));
        }

        let journalEntry: any = null;
        if (doc.linkJournal || body.customJournalLines) {
          const compAccts = await tx.select().from(accounts).where(eq(accounts.companyId, doc.companyId));
          const acctMap = new Map(compAccts.map(a => [a.code, a]));
          let jL: { accountCode: string; accountName: string; debit: string; credit: string }[] = [];

          if (body.customJournalLines && Array.isArray(body.customJournalLines) && body.customJournalLines.length > 0) {
            jL = body.customJournalLines;
          } else {
            const pmName = doc.paymentMethod || null;
            const pmRecs = pmName ? await tx.select().from(paymentMethods).where(eq(paymentMethods.companyId, doc.companyId)) : [];
            const pmRec = pmRecs.find((p: any) => p.accountCode === pmName);
            const isCredit = !pmName || pmName === "เครดิต" || (pmRec ? isCreditPm(pmRec.name || pmRec.nameTh) : false);
            let pmCode: string;
            let pmAccName: string;

            if (isCredit) {
              const apAcc = compAccts.find(a => a.nameTh?.includes("เจ้าหนี้การค้า") || a.name?.toLowerCase().includes("accounts payable"));
              if (!apAcc) throw new Error("ไม่พบบัญชีเจ้าหนี้การค้า (Accounts Payable) ในผังบัญชี กรุณาตั้งค่าผังบัญชีให้ครบก่อนบันทึก");
              pmCode = apAcc.code;
              pmAccName = apAcc.nameTh || apAcc.name!;
            } else {
              if (!pmRec || !pmRec.accountCode) throw new Error(`วิธีชำระเงิน "${pmName}" ยังไม่ได้ตั้งค่ารหัสบัญชีในระบบ กรุณาไปตั้งค่าที่ Settings > วิธีชำระเงิน ก่อนบันทึก`);
              const a = acctMap.get(pmRec.accountCode);
              if (!a) throw new Error(`วิธีชำระเงิน "${pmName}" ระบุรหัสบัญชี ${pmRec.accountCode} แต่ไม่พบรหัสนี้ในผังบัญชี กรุณาตรวจสอบผังบัญชี`);
              pmCode = pmRec.accountCode;
              pmAccName = a.nameTh || a.name!;
            }

            const sub = parseFloat(String(doc.subtotal || "0"));
            const nonDeductibleVat = parseFloat(String(body.nonDeductibleVat || "0"));
            const deductibleVat = parseFloat(String(body.deductibleVat || String(parseFloat(String(doc.vatAmount || "0")) - nonDeductibleVat)));
            const wht = parseFloat(String(doc.withholdingTax || "0"));
            const grouped: Record<string, { code: string; name: string; amount: number }> = {};
            let rawT = 0;
            for (const it of txItems) {
              if (!it.accountCode) throw new Error(`รายการ "${it.description || it.expenseType || "(ไม่ระบุ)"}" ไม่มีรหัสบัญชี กรุณาระบุบัญชีค่าใช้จ่ายทุกรายการ`);
              if (!acctMap.has(it.accountCode)) throw new Error(`ไม่พบบัญชีรหัส ${it.accountCode} (${it.accountName || it.description || ""}) ในผังบัญชี`);
              let a = parseFloat(it.amount || "0");
              if (it.vatType === "vat_non_deductible") a = a + (a * 0.07);
              if (!grouped[it.accountCode]) grouped[it.accountCode] = { code: it.accountCode, name: it.accountName || it.accountCode, amount: 0 };
              grouped[it.accountCode].amount += a;
              rawT += a;
            }
            const totalExpenseAmount = rawT > 0 ? Object.values(grouped).reduce((s, g) => s + g.amount, 0) : 0;
            const expScale = totalExpenseAmount > 0 ? (sub + nonDeductibleVat) / totalExpenseAmount : 1;
            for (const g of Object.values(grouped)) {
              const adj = parseFloat((g.amount * expScale).toFixed(2));
              jL.push({ accountCode: g.code, accountName: g.name, debit: adj.toFixed(2), credit: "0.00" });
            }
            if (deductibleVat > 0) {
              const ivA = compAccts.find(a => a.code.length >= 7 && (a.name === "Input VAT" || a.nameTh === "ภาษีซื้อ"));
              if (!ivA) throw new Error("ไม่พบบัญชีภาษีซื้อ (Input VAT) ในผังบัญชี กรุณาตั้งค่าผังบัญชีให้ครบก่อนบันทึก");
              jL.push({ accountCode: ivA.code, accountName: ivA.nameTh || ivA.name!, debit: deductibleVat.toFixed(2), credit: "0.00" });
            }
            if (wht > 0) {
              const wA = acctMap.get("2346000") || acctMap.get("2344000") || acctMap.get("2224") || acctMap.get("2221");
              if (!wA) throw new Error("ไม่พบบัญชีภาษีหัก ณ ที่จ่าย ในผังบัญชี กรุณาตั้งค่าผังบัญชีให้ครบก่อนบันทึก");
              jL.push({ accountCode: wA.code, accountName: wA.nameTh || wA.name!, debit: "0.00", credit: wht.toFixed(2) });
            }
            const tD = jL.reduce((s, l) => s + parseFloat(l.debit), 0);
            const tC = jL.reduce((s, l) => s + parseFloat(l.credit), 0);
            jL.push({ accountCode: pmCode, accountName: pmAccName, debit: "0.00", credit: parseFloat((tD - tC).toFixed(2)).toFixed(2) });
          }

          // Final guard: every line account code must exist in chart of accounts
          for (const ln of jL) {
            if (!acctMap.has(ln.accountCode)) throw new Error(`ไม่พบบัญชีรหัส ${ln.accountCode} ในผังบัญชี`);
          }

          const [entry] = await tx.insert(journalEntries).values({
            companyId: doc.companyId, entryDate: doc.expDate, reference: doc.expNo,
            description: `${doc.vendorName || ""}${txItems[0]?.description ? " - " + txItems[0].description : (doc.notes ? " - " + doc.notes : "")}`.trim() || `บันทึกบัญชีจากค่าใช้จ่าย ${doc.expNo}`,
            journalBook: "payment", entryNo, createdBy: user.id, status: "posted", sourceDocType: "expense", sourceDocId: doc.id,
          }).returning();
          const linesToInsert = jL.map(ln => {
            const acc = acctMap.get(ln.accountCode)!;
            const dr = parseFloat(ln.debit || "0"); const cr = parseFloat(ln.credit || "0");
            if (dr === 0 && cr === 0) return null;
            return {
              journalEntryId: entry.id, accountId: acc.id,
              description: acc.nameTh ? `${acc.nameTh} (${acc.name})` : acc.name || ln.accountName,
              debit: dr.toFixed(2), credit: cr.toFixed(2),
            };
          }).filter(Boolean) as any[];
          if (linesToInsert.length > 0) {
            await tx.insert(journalLines).values(linesToInsert);
          }
          journalEntry = entry;
        }

        return { result: doc, savedItems: txItems, journalResult: journalEntry };
      });

      if (body.saveToContacts && !result.vendorId && result.vendorName) {
        try {
          const [existingContact] = await db.select().from(contacts)
            .where(and(
              eq(contacts.companyId, companyId),
              result.vendorTaxId
                ? eq(contacts.taxId, result.vendorTaxId)
                : eq(contacts.name, result.vendorName),
              or(eq(contacts.type, "vendor"), eq(contacts.type, "both"))
            )).limit(1);
          if (!existingContact) {
            const nextCode = await storage.getNextContactCode(companyId);
            const [newContact] = await db.insert(contacts).values({
              companyId,
              code: nextCode,
              name: result.vendorName,
              type: "vendor",
              taxId: result.vendorTaxId || null,
              address: result.vendorAddress || null,
              branch: result.branch || null,
              phone: body.contactPhone || null,
              email: body.contactEmail || null,
              creditDays: result.creditDays || null,
              active: true,
            }).returning();
            await db.update(expenses).set({ vendorId: newContact.id }).where(eq(expenses.id, result.id));
          } else {
            await db.update(expenses).set({ vendorId: existingContact.id }).where(eq(expenses.id, result.id));
          }
        } catch (contactErr: any) {
          console.log("[EXP] Auto-save contact failed:", contactErr.message);
        }
      }

      logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "expense", entityId: String(result.id), entityName: result.expenseNo || "" }).catch(() => {});
      res.status(201).json({ ...result, items: savedItems, journalResult });
    } catch (err: any) {
      console.error("[EXP CREATE ERROR]", err);
      res.status(400).json({ message: err.message || err.detail || "เกิดข้อผิดพลาดในการบันทึกค่าใช้จ่าย" });
    }
  });

  app.patch("/api/expenses/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(expenses).where(eq(expenses.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบค่าใช้จ่าย" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const { items, ...body } = req.body;
      const updateData: any = {};
      const allowedFields = [
        "expNo", "expDate", "dueDate", "vendorId", "vendorCode", "vendorName", "vendorOrg",
        "vendorAddress", "vendorTaxId", "branch", "contactEmail", "contactPhone",
        "creditDays", "taxInvoiceRef", "formulaCode", "subtotal", "discountAmount",
        "vatAmount", "totalAmount", "withholdingTax", "status", "paymentStatus",
        "priceMode", "showInTaxReport", "docPrefix", "refDoc", "notes",
        "salesperson", "department", "project", "paymentMethod", "attachedUrl", "linkJournal",
        "currencyCode", "exchangeRate"
      ];
      const integerFields = ["vendorId", "creditDays"];
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          if (integerFields.includes(field)) {
            updateData[field] = body[field] !== "" && body[field] !== null && body[field] !== undefined ? Number(body[field]) || null : null;
          } else {
            updateData[field] = body[field];
          }
        }
      }
      if (updateData.expNo && updateData.expNo !== existing.expNo) {
        const prefix = updateData.docPrefix || existing.docPrefix || "EXP";
        const fmtCheck = await validateDocNo(existing.companyId, updateData.expNo, prefix, updateData.expDate || existing.expDate);
        if (!fmtCheck.valid) return res.status(400).json({ message: fmtCheck.message, field: "expNo" });
      }
      if (updateData.taxInvoiceRef && updateData.taxInvoiceRef.trim() && updateData.taxInvoiceRef !== existing.taxInvoiceRef) {
        const [dupTaxRef] = await db.select({ id: expenses.id, expNo: expenses.expNo }).from(expenses)
          .where(and(eq(expenses.companyId, existing.companyId), eq(expenses.taxInvoiceRef, updateData.taxInvoiceRef.trim()), not(eq(expenses.id, existing.id))))
          .limit(1);
        if (dupTaxRef) {
          return res.status(409).json({ message: `เลขที่ใบกำกับภาษีซื้อ "${updateData.taxInvoiceRef}" ซ้ำกับค่าใช้จ่าย ${dupTaxRef.expNo}`, field: "taxInvoiceRef" });
        }
        const [dupPiTaxRef] = await db.select({ id: purchaseInvoices.id, apNo: purchaseInvoices.apNo }).from(purchaseInvoices)
          .where(and(eq(purchaseInvoices.companyId, existing.companyId), eq(purchaseInvoices.taxInvoiceRef, updateData.taxInvoiceRef.trim())))
          .limit(1);
        if (dupPiTaxRef) {
          return res.status(409).json({ message: `เลขที่ใบกำกับภาษีซื้อ "${updateData.taxInvoiceRef}" ซ้ำกับเอกสาร ${dupPiTaxRef.apNo}`, field: "taxInvoiceRef" });
        }
      }
      const user = req.user as any;
      updateData.updatedBy = user.id;
      updateData.updatedAt = new Date();
      const existingJE = await db.select().from(journalEntries).where(and(
        eq(journalEntries.sourceDocType, "expense"), eq(journalEntries.sourceDocId, existing.id)
      ));
      const statusChanged = body.status && body.status !== existing.status;
      const itemsChanged = items && Array.isArray(items);

      const entryNoUp = await getNextJournalEntryNo(existing.companyId, "payment", updateData.expDate || existing.expDate);
      const { updated, savedItems, journalResult } = await db.transaction(async (tx) => {
        // Remove currency fields from Drizzle update (not in schema) then do raw SQL
        const { currencyCode: _cc, exchangeRate: _er, ...drizzleUpdateData } = updateData;
        await tx.update(expenses).set(drizzleUpdateData).where(eq(expenses.id, existing.id));
        // currency_code/exchange_rate not in Drizzle schema — must use raw SQL
        await tx.execute(sql`UPDATE expenses SET currency_code = ${body.currencyCode || "THB"}, exchange_rate = ${body.exchangeRate || "1"} WHERE id = ${existing.id}`);
        if (items && Array.isArray(items)) {
          await tx.delete(expenseItems).where(eq(expenseItems.expenseId, existing.id));
          if (items.length > 0) {
            await tx.insert(expenseItems).values(items.map((item: any) => ({
              expenseId: existing.id,
              accountCode: item.accountCode || null,
              accountName: item.accountName || null,
              description: item.description || null,
              expenseType: item.expenseType || null,
              amount: String(item.amount || "0"),
              vatType: item.vatType || "vat7",
            })));
          }
        }

        const [[txUpdated], txItems] = await Promise.all([
          tx.select().from(expenses).where(eq(expenses.id, existing.id)),
          tx.select().from(expenseItems).where(eq(expenseItems.expenseId, existing.id)),
        ]);

        const effectiveLinkJournal = txUpdated.linkJournal !== false;
        const alreadyApproved = existing.status === "approved" && txUpdated.status === "approved";
        const hasExistingJournal = existingJE.length > 0;
        const isCurrentlyApproved = txUpdated.status === "approved";
        const shouldJournal = (statusChanged && body.status === "approved" && effectiveLinkJournal)
          || body.customJournalLines
          || (itemsChanged && effectiveLinkJournal && isCurrentlyApproved && (alreadyApproved || hasExistingJournal));

        let journalEntry: any = null;
        if (shouldJournal) {
          if (existingJE.length > 0) {
            for (const je of existingJE) {
              await tx.delete(journalLines).where(eq(journalLines.journalEntryId, je.id));
            }
            await tx.delete(journalEntries).where(and(
              eq(journalEntries.sourceDocType, "expense"), eq(journalEntries.sourceDocId, txUpdated.id)
            ));
          }

          const compAccts = await tx.select().from(accounts).where(eq(accounts.companyId, txUpdated.companyId));
          const acctMap = new Map(compAccts.map(a => [a.code, a]));
          let jL: { accountCode: string; accountName: string; debit: string; credit: string }[] = [];

          if (body.customJournalLines && Array.isArray(body.customJournalLines) && body.customJournalLines.length > 0) {
            jL = body.customJournalLines;
          } else {
            const pmName = txUpdated.paymentMethod || null;
            const pmRecs = pmName ? await tx.select().from(paymentMethods).where(eq(paymentMethods.companyId, txUpdated.companyId)) : [];
            const pmRec = pmRecs.find((p: any) => p.accountCode === pmName);
            const isCredit = !pmName || pmName === "เครดิต" || (pmRec ? isCreditPm(pmRec.name || pmRec.nameTh) : false);
            let pmCode: string;
            let pmAccName: string;

            if (isCredit) {
              const apAcc = compAccts.find(a => a.nameTh?.includes("เจ้าหนี้การค้า") || a.name?.toLowerCase().includes("accounts payable"));
              if (!apAcc) throw new Error("ไม่พบบัญชีเจ้าหนี้การค้า (Accounts Payable) ในผังบัญชี กรุณาตั้งค่าผังบัญชีให้ครบก่อนบันทึก");
              pmCode = apAcc.code;
              pmAccName = apAcc.nameTh || apAcc.name!;
            } else {
              if (!pmRec || !pmRec.accountCode) throw new Error(`วิธีชำระเงิน "${pmName}" ยังไม่ได้ตั้งค่ารหัสบัญชีในระบบ กรุณาไปตั้งค่าที่ Settings > วิธีชำระเงิน ก่อนบันทึก`);
              const a = acctMap.get(pmRec.accountCode);
              if (!a) throw new Error(`วิธีชำระเงิน "${pmName}" ระบุรหัสบัญชี ${pmRec.accountCode} แต่ไม่พบรหัสนี้ในผังบัญชี กรุณาตรวจสอบผังบัญชี`);
              pmCode = pmRec.accountCode;
              pmAccName = a.nameTh || a.name!;
            }

            const sub = parseFloat(String(txUpdated.subtotal || "0"));
            const nonDeductibleVat = parseFloat(String(body.nonDeductibleVat || "0"));
            const deductibleVat = parseFloat(String(body.deductibleVat || String(parseFloat(String(txUpdated.vatAmount || "0")) - nonDeductibleVat)));
            const wht = parseFloat(String(txUpdated.withholdingTax || "0"));
            const grouped: Record<string, { code: string; name: string; amount: number }> = {};
            let rawT = 0;
            for (const it of txItems) {
              if (!it.accountCode) throw new Error(`รายการ "${it.description || it.expenseType || "(ไม่ระบุ)"}" ไม่มีรหัสบัญชี กรุณาระบุบัญชีค่าใช้จ่ายทุกรายการ`);
              if (!acctMap.has(it.accountCode)) throw new Error(`ไม่พบบัญชีรหัส ${it.accountCode} (${it.accountName || it.description || ""}) ในผังบัญชี`);
              let a = parseFloat(it.amount || "0");
              if (it.vatType === "vat_non_deductible") a = a + (a * 0.07);
              if (!grouped[it.accountCode]) grouped[it.accountCode] = { code: it.accountCode, name: it.accountName || it.accountCode, amount: 0 };
              grouped[it.accountCode].amount += a;
              rawT += a;
            }
            const totalExpenseAmount = rawT > 0 ? Object.values(grouped).reduce((s, g) => s + g.amount, 0) : 0;
            const expScale = totalExpenseAmount > 0 ? (sub + nonDeductibleVat) / totalExpenseAmount : 1;
            for (const g of Object.values(grouped)) {
              const adj = parseFloat((g.amount * expScale).toFixed(2));
              jL.push({ accountCode: g.code, accountName: g.name, debit: adj.toFixed(2), credit: "0.00" });
            }
            if (deductibleVat > 0) {
              const ivA = compAccts.find(a => a.code.length >= 7 && (a.name === "Input VAT" || a.nameTh === "ภาษีซื้อ"));
              if (!ivA) throw new Error("ไม่พบบัญชีภาษีซื้อ (Input VAT) ในผังบัญชี กรุณาตั้งค่าผังบัญชีให้ครบก่อนบันทึก");
              jL.push({ accountCode: ivA.code, accountName: ivA.nameTh || ivA.name!, debit: deductibleVat.toFixed(2), credit: "0.00" });
            }
            if (wht > 0) {
              const wA = acctMap.get("2346000") || acctMap.get("2344000") || acctMap.get("2224") || acctMap.get("2221");
              if (!wA) throw new Error("ไม่พบบัญชีภาษีหัก ณ ที่จ่าย ในผังบัญชี กรุณาตั้งค่าผังบัญชีให้ครบก่อนบันทึก");
              jL.push({ accountCode: wA.code, accountName: wA.nameTh || wA.name!, debit: "0.00", credit: wht.toFixed(2) });
            }
            const tD = jL.reduce((s, l) => s + parseFloat(l.debit), 0);
            const tC = jL.reduce((s, l) => s + parseFloat(l.credit), 0);
            jL.push({ accountCode: pmCode, accountName: pmAccName, debit: "0.00", credit: parseFloat((tD - tC).toFixed(2)).toFixed(2) });
          }

          // Final guard: every line account code must exist in chart of accounts
          for (const ln of jL) {
            if (!acctMap.has(ln.accountCode)) throw new Error(`ไม่พบบัญชีรหัส ${ln.accountCode} ในผังบัญชี`);
          }

          const [entry] = await tx.insert(journalEntries).values({
            companyId: txUpdated.companyId, entryDate: txUpdated.expDate, reference: txUpdated.expNo,
            description: `${txUpdated.vendorName || ""}${txItems[0]?.description ? " - " + txItems[0].description : (txUpdated.notes ? " - " + txUpdated.notes : "")}`.trim() || `บันทึกบัญชีจากค่าใช้จ่าย ${txUpdated.expNo}`,
            journalBook: "payment", entryNo: entryNoUp, createdBy: user.id, status: "posted", sourceDocType: "expense", sourceDocId: txUpdated.id,
          }).returning();
          const linesToInsert = jL.map(ln => {
            const acc = acctMap.get(ln.accountCode)!;
            const drV = parseFloat(ln.debit || "0"); const crV = parseFloat(ln.credit || "0");
            if (drV === 0 && crV === 0) return null;
            return {
              journalEntryId: entry.id, accountId: acc.id,
              description: acc.nameTh ? `${acc.nameTh} (${acc.name})` : acc.name || ln.accountName,
              debit: drV.toFixed(2), credit: crV.toFixed(2),
            };
          }).filter(Boolean) as any[];
          if (linesToInsert.length > 0) {
            await tx.insert(journalLines).values(linesToInsert);
          }
          journalEntry = entry;
        }

        return { updated: txUpdated, savedItems: txItems, journalResult: journalEntry };
      });

      res.json({ ...updated, items: savedItems, journalResult });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/expenses/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(expenses).where(eq(expenses.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบค่าใช้จ่าย" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const savedBatchId = existing.batchId;
      await db.transaction(async (tx) => {
        await deleteJournalEntriesForDoc(tx, "expense", existing.id);
        const linkedWhts = await tx.select({ id: withholdingTaxCerts.id }).from(withholdingTaxCerts).where(and(eq(withholdingTaxCerts.sourceDocType, "expense"), eq(withholdingTaxCerts.sourceDocId, existing.id)));
        for (const w of linkedWhts) {
          await deleteJournalEntriesForDoc(tx, "wht_cert", w.id);
          await tx.delete(whtCertItems).where(eq(whtCertItems.whtCertId, w.id));
        }
        if (linkedWhts.length > 0) {
          await tx.delete(withholdingTaxCerts).where(and(eq(withholdingTaxCerts.sourceDocType, "expense"), eq(withholdingTaxCerts.sourceDocId, existing.id)));
        }
        await tx.delete(expenseItems).where(eq(expenseItems.expenseId, existing.id));
        await tx.delete(expenses).where(eq(expenses.id, existing.id));
        await cleanupDxpBatchAfterExpenseDelete(tx, existing.id, savedBatchId, existing.companyId);
      });
      const user = req.user as any;
      logActivity({ companyId: existing.companyId, userId: user.id, userName: user.username, action: "delete", entityType: "expense", entityId: String(existing.id), entityName: existing.expNo }).catch(() => {});
      res.json({ success: true });
    } catch (err: any) {
      console.error("[EXP DELETE ERROR]", err);
      res.status(500).json({ message: err.message || "ไม่สามารถลบค่าใช้จ่ายได้" });
    }
  });

  app.post("/api/expenses/bulk-delete", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "กรุณาเลือกรายการที่ต้องการลบ" });
      }
      let deleted = 0;
      let errors: { id: number; error: string }[] = [];
      for (const id of ids) {
        try {
          const [existing] = await db.select().from(expenses).where(eq(expenses.id, Number(id)));
          if (!existing) { errors.push({ id, error: "ไม่พบเอกสาร" }); continue; }
          const savedBatchId = existing.batchId;
          await db.transaction(async (tx) => {
            await deleteJournalEntriesForDoc(tx, "expense", existing.id);
            const linkedWhts = await tx.select({ id: withholdingTaxCerts.id }).from(withholdingTaxCerts).where(and(eq(withholdingTaxCerts.sourceDocType, "expense"), eq(withholdingTaxCerts.sourceDocId, existing.id)));
            for (const w of linkedWhts) {
              await deleteJournalEntriesForDoc(tx, "wht_cert", w.id);
              await tx.delete(whtCertItems).where(eq(whtCertItems.whtCertId, w.id));
            }
            if (linkedWhts.length > 0) {
              await tx.delete(withholdingTaxCerts).where(and(eq(withholdingTaxCerts.sourceDocType, "expense"), eq(withholdingTaxCerts.sourceDocId, existing.id)));
            }
            await tx.delete(expenseItems).where(eq(expenseItems.expenseId, existing.id));
            await tx.delete(expenses).where(eq(expenses.id, existing.id));
            await cleanupDxpBatchAfterExpenseDelete(tx, existing.id, savedBatchId, existing.companyId);
          });
          deleted++;
        } catch (err: any) {
          errors.push({ id, error: err.message });
        }
      }
      res.json({ deleted, errors, total: ids.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ============= EXPENSE IMPORT =============
  app.get("/api/expenses/import/template", (_req, res) => {
    const headers = [
      "เลขที่เอกสาร", "วันที่เอกสาร", "วันครบกำหนด", "ชื่อผู้จำหน่าย", "เลขประจำตัวผู้เสียภาษี",
      "ที่อยู่ผู้จำหน่าย", "สาขา", "เลขที่ใบกำกับภาษี", "รหัสบัญชี", "ชื่อบัญชี",
      "รายละเอียด", "จำนวนเงิน", "ประเภท VAT", "ภาษีหัก ณ ที่จ่าย", "โหมดราคา",
      "หมายเหตุ", "อ้างอิง"
    ];
    const sample1 = [
      "EXP6801001", "01/01/2568", "31/01/2568", "บจ. ทดสอบ จำกัด", "0105500000001",
      "123 ถ.สุขุมวิท กรุงเทพฯ", "สำนักงานใหญ่", "IV-001", "5210360", "ค่าเช่าสำนักงาน",
      "ค่าเช่าเดือน ม.ค.", "10000", "vat7", "300", "excluded",
      "", ""
    ];
    const sample2 = [
      "EXP6801001", "", "", "", "",
      "", "", "", "5220020", "ค่าน้ำค่าไฟ",
      "ค่าไฟเดือน ม.ค.", "3500", "vat7", "", "",
      "", ""
    ];
    const sample3 = [
      "EXP6801002", "05/01/2568", "", "ร้านเครื่องเขียน", "",
      "", "", "", "5210310", "วัสดุสำนักงาน",
      "กระดาษ A4", "500", "non_vat", "", "excluded",
      "ซื้อเงินสด", ""
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2, sample3]);
    ws["!cols"] = [14, 14, 14, 25, 18, 30, 14, 16, 10, 20, 25, 14, 12, 14, 12, 20, 16].map(w => ({ wch: w }));
    const helpHeaders = ["คอลัมน์", "คำอธิบาย", "จำเป็น", "ค่าที่รับ"];
    const helpRows = [
      ["เลขที่เอกสาร", "เลขที่เอกสาร (เว้นว่าง = สร้างอัตโนมัติ) แถวที่มีเลขเดียวกันจะรวมเป็นเอกสารเดียว", "ไม่", "เช่น EXP6801001"],
      ["วันที่เอกสาร", "วันที่ (DD/MM/YYYY พ.ศ.) กรอกแค่แถวแรกของเอกสาร", "ใช่", "01/01/2568"],
      ["วันครบกำหนด", "วันครบกำหนดชำระ", "ไม่", "31/01/2568"],
      ["ชื่อผู้จำหน่าย", "ชื่อผู้จำหน่าย กรอกแค่แถวแรกของเอกสาร", "ใช่", ""],
      ["เลขประจำตัวผู้เสียภาษี", "เลขประจำตัวผู้เสียภาษี 13 หลัก", "ไม่", "0105500000001"],
      ["ที่อยู่ผู้จำหน่าย", "ที่อยู่ผู้จำหน่าย", "ไม่", ""],
      ["สาขา", "สาขาผู้จำหน่าย", "ไม่", "สำนักงานใหญ่"],
      ["เลขที่ใบกำกับภาษี", "เลขอ้างอิงใบกำกับภาษี", "ไม่", ""],
      ["รหัสบัญชี", "รหัสบัญชีค่าใช้จ่าย จากผังบัญชี", "ใช่", "5100, 5200, ..."],
      ["ชื่อบัญชี", "ชื่อบัญชี (จะดึงจากระบบถ้าตรงรหัส)", "ไม่", ""],
      ["รายละเอียด", "รายละเอียดรายการ", "ไม่", ""],
      ["จำนวนเงิน", "จำนวนเงินรายการ", "ใช่", "10000"],
      ["ประเภท VAT", "vat7 / non_vat / zero_rated", "ไม่", "vat7 (ค่าเริ่มต้น)"],
      ["ภาษีหัก ณ ที่จ่าย", "ยอดภาษีหัก ณ ที่จ่ายทั้งเอกสาร (กรอกแค่แถวแรก)", "ไม่", "300"],
      ["โหมดราคา", "excluded / included (ราคาก่อน/รวม VAT)", "ไม่", "excluded (ค่าเริ่มต้น)"],
      ["หมายเหตุ", "หมายเหตุเอกสาร", "ไม่", ""],
      ["อ้างอิง", "เอกสารอ้างอิง", "ไม่", ""],
    ];
    const helpWs = XLSX.utils.aoa_to_sheet([helpHeaders, ...helpRows]);
    helpWs["!cols"] = [20, 45, 8, 20].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "รายจ่ายอื่น");
    XLSX.utils.book_append_sheet(wb, helpWs, "คำอธิบาย");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="expense_import_template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  const uploadExpense = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  app.post("/api/expenses/import/preview", requireAuth, requireModule("purchases"), uploadExpense.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์" });
      const companyId = Number(req.body.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });

      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (rawRows.length === 0) return res.status(400).json({ message: "ไม่พบข้อมูลในไฟล์" });

      const companyAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
      const accountMap = new Map(companyAccounts.map(a => [a.code, a]));

      const companyContacts = await db.select().from(contacts)
        .where(eq(contacts.companyId, companyId));

      const existingExpenses = await db.select({ expNo: expenses.expNo })
        .from(expenses).where(eq(expenses.companyId, companyId));
      const existingExpNos = new Set(existingExpenses.map(e => e.expNo));

      const parseDateBE = (val: string): string | null => {
        if (!val) return null;
        const str = String(val).trim();
        const parts = str.split("/");
        if (parts.length === 3) {
          const dd = parts[0].padStart(2, "0");
          const mm = parts[1].padStart(2, "0");
          let yyyy = Number(parts[2]);
          if (yyyy > 2400) yyyy -= 543;
          return `${yyyy}-${mm}-${dd}`;
        }
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
        return null;
      };

      const COL_MAP: Record<string, string> = {
        "เลขที่เอกสาร": "expNo", "วันที่เอกสาร": "expDate", "วันครบกำหนด": "dueDate",
        "ชื่อผู้จำหน่าย": "vendorName", "เลขประจำตัวผู้เสียภาษี": "vendorTaxId",
        "ที่อยู่ผู้จำหน่าย": "vendorAddress", "สาขา": "branch",
        "เลขที่ใบกำกับภาษี": "taxInvoiceRef", "รหัสบัญชี": "accountCode",
        "ชื่อบัญชี": "accountName", "รายละเอียด": "description",
        "จำนวนเงิน": "amount", "ประเภท VAT": "vatType", "ภาษีหัก ณ ที่จ่าย": "withholdingTax",
        "โหมดราคา": "priceMode", "หมายเหตุ": "notes", "อ้างอิง": "refDoc",
      };

      const mapped = rawRows.map((row, idx) => {
        const r: any = { _rowNum: idx + 2 };
        for (const [thKey, enKey] of Object.entries(COL_MAP)) {
          r[enKey] = row[thKey] !== undefined ? String(row[thKey]).trim() : "";
        }
        return r;
      });

      const grouped: Map<string, any[]> = new Map();
      let autoIdx = 0;
      for (const row of mapped) {
        let key = row.expNo || "";
        if (!key) {
          key = `__auto_${++autoIdx}`;
          row.expNo = "";
        }
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(row);
      }

      const documents: any[] = [];
      for (const [key, rows] of Array.from(grouped.entries())) {
        const first = rows[0];
        const expDate = parseDateBE(first.expDate);
        const dueDate = parseDateBE(first.dueDate);
        const errors: string[] = [];

        if (!expDate) errors.push("วันที่เอกสารไม่ถูกต้อง");
        if (!first.vendorName) errors.push("ไม่มีชื่อผู้จำหน่าย");

        const isDuplicate = first.expNo && existingExpNos.has(first.expNo);
        if (isDuplicate) errors.push("เลขที่เอกสารซ้ำในระบบ");

        let vendorMatch: any = null;
        if (first.vendorTaxId) {
          vendorMatch = companyContacts.find((c: any) => c.taxId === first.vendorTaxId);
        }
        if (!vendorMatch && first.vendorName) {
          vendorMatch = companyContacts.find((c: any) =>
            (c.name || "").toLowerCase() === first.vendorName.toLowerCase() ||
            (c.orgName || "").toLowerCase() === first.vendorName.toLowerCase()
          );
        }

        const itemsList: any[] = [];
        let subtotal = 0;
        for (const row of rows) {
          const acctCode = String(row.accountCode).trim();
          const acct = accountMap.get(acctCode);
          const amount = parseFloat(row.amount) || 0;
          const itemErrors: string[] = [];

          if (!acctCode) itemErrors.push("ไม่มีรหัสบัญชี");
          else if (!acct) itemErrors.push(`ไม่พบรหัสบัญชี ${acctCode} ในผังบัญชี`);
          if (amount <= 0) itemErrors.push("จำนวนเงินต้องมากกว่า 0");

          subtotal += amount;
          itemsList.push({
            rowNum: row._rowNum,
            accountCode: acctCode,
            accountName: acct ? (acct.nameTh || acct.name || "") : row.accountName,
            description: row.description,
            amount,
            vatType: row.vatType || "vat7",
            errors: itemErrors,
          });
        }

        const priceMode = first.priceMode || "excluded";
        const wht = parseFloat(first.withholdingTax) || 0;

        let vatAmount = 0;
        let totalAmount = 0;
        for (const item of itemsList) {
          const amt = item.amount;
          const vt = item.vatType;
          if (priceMode === "excluded") {
            vatAmount += vt === "vat7" ? amt * 0.07 : 0;
          } else {
            vatAmount += vt === "vat7" ? (amt * 7 / 107) : 0;
          }
        }
        vatAmount = Math.round(vatAmount * 100) / 100;

        if (priceMode === "excluded") {
          totalAmount = subtotal + vatAmount - wht;
        } else {
          totalAmount = subtotal - wht;
          subtotal = subtotal - vatAmount;
        }

        const allItemErrors = itemsList.flatMap(i => i.errors);
        const hasErrors = errors.length > 0 || allItemErrors.length > 0;

        documents.push({
          key,
          expNo: first.expNo || "(สร้างอัตโนมัติ)",
          expDate: expDate || "",
          dueDate: dueDate || "",
          vendorName: first.vendorName,
          vendorTaxId: first.vendorTaxId,
          vendorAddress: first.vendorAddress,
          branch: first.branch,
          taxInvoiceRef: first.taxInvoiceRef,
          notes: first.notes,
          refDoc: first.refDoc,
          priceMode,
          withholdingTax: wht,
          subtotal: Math.round(subtotal * 100) / 100,
          vatAmount,
          totalAmount: Math.round(totalAmount * 100) / 100,
          vendorId: vendorMatch?.id || null,
          vendorMatchName: vendorMatch ? (vendorMatch.name || vendorMatch.orgName) : null,
          items: itemsList,
          errors,
          hasErrors,
          isDuplicate,
        });
      }

      const valid = documents.filter(d => !d.hasErrors).length;
      const invalid = documents.filter(d => d.hasErrors).length;

      res.json({
        totalRows: rawRows.length,
        totalDocuments: documents.length,
        validDocuments: valid,
        invalidDocuments: invalid,
        documents,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/expenses/import/create", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, documents, autoJournal } = req.body;
      if (!companyId || !documents || !Array.isArray(documents)) {
        return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
      }

      const companyAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
      const accountMap = new Map(companyAccounts.map(a => [a.code, a]));

      const created: any[] = [];
      const skipped: any[] = [];
      const errors: any[] = [];

      for (const doc of documents) {
        try {
          const existingExpNos = await db.select({ expNo: expenses.expNo })
            .from(expenses).where(and(eq(expenses.companyId, companyId), eq(expenses.expNo, doc.expNo || "")));
          if (doc.expNo && existingExpNos.length > 0) {
            skipped.push({ expNo: doc.expNo, reason: "เลขที่เอกสารซ้ำ" });
            continue;
          }

          let expNo = doc.expNo;
          if (!expNo || expNo === "(สร้างอัตโนมัติ)") {
            const docPrefix = doc.invoicePrefix || "EXP";
            const useInvoicePrefix = !!doc.invoicePrefix;
            expNo = await getNextDocNo(companyId, docPrefix, expenses, expenses.expNo, expenses.companyId, doc.expDate, "expense", undefined, useInvoicePrefix);
          }

          const validItems = (doc.items || []).filter((i: any) => {
            const acct = accountMap.get(String(i.accountCode));
            return acct && (parseFloat(i.amount) || 0) > 0;
          });
          if (validItems.length === 0) {
            errors.push({ expNo: doc.expNo || "(auto)", error: "ไม่มีรายการที่ถูกต้อง" });
            continue;
          }

          const entryNoJ = autoJournal ? await getNextJournalEntryNo(companyId, "payment", doc.expDate) : "";
          const result = await db.transaction(async (tx) => {
            const [newDoc] = await tx.insert(expenses).values({
              companyId,
              expNo,
              expDate: doc.expDate,
              dueDate: doc.dueDate || null,
              vendorId: doc.vendorId || null,
              vendorName: doc.vendorName,
              vendorAddress: doc.vendorAddress || null,
              vendorTaxId: doc.vendorTaxId || null,
              branch: doc.branch || null,
              taxInvoiceRef: doc.taxInvoiceRef || null,
              subtotal: String(doc.subtotal || "0"),
              discountAmount: "0",
              vatAmount: String(doc.vatAmount || "0"),
              totalAmount: String(doc.totalAmount || "0"),
              withholdingTax: String(doc.withholdingTax || "0"),
              status: "approved",
              paymentStatus: "unpaid",
              priceMode: doc.priceMode || "excluded",
              showInTaxReport: true,
              docPrefix: "EXP",
              notes: doc.notes || null,
              refDoc: doc.refDoc || null,
              attachedUrl: doc.attachedUrl || null,
              linkJournal: autoJournal ? true : false,
              createdBy: user.id,
            }).returning();

            for (const item of validItems) {
              const acct = accountMap.get(String(item.accountCode));
              await tx.insert(expenseItems).values({
                expenseId: newDoc.id,
                accountCode: item.accountCode,
                accountName: acct ? (acct.nameTh || acct.name || item.accountName) : item.accountName,
                description: item.description || null,
                expenseType: "expense",
                amount: String(item.amount),
                vatType: item.vatType || "vat7",
              });
            }

            if (autoJournal) {
              const expItemsJ = await tx.select().from(expenseItems).where(eq(expenseItems.expenseId, newDoc.id));
              const compAcctsJ = await tx.select().from(accounts).where(eq(accounts.companyId, newDoc.companyId));
              const amJ = new Map(compAcctsJ.map(a => [a.code, a]));

              const pmName = newDoc.paymentMethod || null;
              const pmRecsJ = pmName ? await tx.select().from(paymentMethods).where(eq(paymentMethods.companyId, newDoc.companyId)) : [];
              const pmRecJ = pmRecsJ.find((p: any) => p.accountCode === pmName);
              const isCredit = !pmName || pmName === "เครดิต" || (pmRecJ ? isCreditPm(pmRecJ.name || pmRecJ.nameTh) : false);
              let pmCode: string;
              let pmAccName: string;

              if (isCredit) {
                const apAcc = compAcctsJ.find(a => a.nameTh?.includes("เจ้าหนี้การค้า") || a.name?.toLowerCase().includes("accounts payable"));
                if (!apAcc) throw new Error("ไม่พบบัญชีเจ้าหนี้การค้า (Accounts Payable) ในผังบัญชี กรุณาตั้งค่าผังบัญชีให้ครบก่อนบันทึก");
                pmCode = apAcc.code;
                pmAccName = apAcc.nameTh || apAcc.name!;
              } else {
                const rc = await resolvePaymentMethodAccountCode(newDoc.companyId, pmName!);
                if (!rc) throw new Error(`ไม่พบรหัสบัญชีสำหรับวิธีชำระ "${pmName}" กรุณาตั้งค่าวิธีชำระเงินในระบบก่อนบันทึก`);
                const pa = amJ.get(rc);
                if (!pa) throw new Error(`วิธีชำระ "${pmName}" ระบุรหัสบัญชี ${rc} แต่ไม่พบรหัสนี้ในผังบัญชี`);
                pmCode = rc;
                pmAccName = pa.nameTh || pa.name!;
              }

              const subJ = parseFloat(String(newDoc.subtotal || "0"));
              const vatJ = parseFloat(String(newDoc.vatAmount || "0"));
              const whtJ = parseFloat(String(newDoc.withholdingTax || "0"));
              const jL: { accountCode: string; accountName: string; direction: string; amount: number }[] = [];
              const grp: Record<string, { code: string; name: string; amount: number }> = {};
              let rawT = 0;
              let nonDeductVat = 0;
              for (const item of expItemsJ) {
                if (!item.accountCode) throw new Error(`รายการ "${item.description || item.expenseType || "(ไม่ระบุ)"}" ไม่มีรหัสบัญชี`);
                if (!amJ.has(item.accountCode)) throw new Error(`ไม่พบบัญชีรหัส ${item.accountCode} (${item.accountName || ""}) ในผังบัญชี`);
                let a = parseFloat(item.amount || "0");
                if (item.vatType === "vat_non_deductible") {
                  const itemVat = a * 0.07;
                  nonDeductVat += itemVat;
                  a = a + itemVat;
                }
                if (!grp[item.accountCode]) grp[item.accountCode] = { code: item.accountCode, name: item.accountName || item.accountCode, amount: 0 };
                grp[item.accountCode].amount += a;
                rawT += a;
              }
              const deductVatJ = Math.max(0, vatJ - nonDeductVat);
              const totalExpAmt = rawT > 0 ? Object.values(grp).reduce((s, g) => s + g.amount, 0) : 0;
              const expScaleJ = totalExpAmt > 0 ? (subJ + nonDeductVat) / totalExpAmt : 1;
              for (const g of Object.values(grp)) {
                jL.push({ accountCode: g.code, accountName: g.name, direction: "debit", amount: parseFloat((g.amount * expScaleJ).toFixed(2)) });
              }
              if (deductVatJ > 0) {
                const ivA = compAcctsJ.find(a => a.code.length >= 7 && (a.name === "Input VAT" || a.nameTh === "ภาษีซื้อ"));
                if (!ivA) throw new Error("ไม่พบบัญชีภาษีซื้อ (Input VAT) ในผังบัญชี กรุณาตั้งค่าผังบัญชีให้ครบก่อนบันทึก");
                jL.push({ accountCode: ivA.code, accountName: ivA.nameTh || ivA.name!, direction: "debit", amount: deductVatJ });
              }
              if (whtJ > 0) {
                const wA = amJ.get("2346000") || amJ.get("2344000") || amJ.get("2224") || amJ.get("2221");
                if (!wA) throw new Error("ไม่พบบัญชีภาษีหัก ณ ที่จ่าย ในผังบัญชี กรุณาตั้งค่าผังบัญชีให้ครบก่อนบันทึก");
                jL.push({ accountCode: wA.code, accountName: wA.nameTh || wA.name!, direction: "credit", amount: whtJ });
              }
              const tD = jL.filter(l => l.direction === "debit").reduce((s, l) => s + l.amount, 0);
              jL.push({ accountCode: pmCode, accountName: pmAccName, direction: "credit", amount: parseFloat((tD - whtJ).toFixed(2)) });

              // Final guard: every line account code must exist in chart of accounts
              for (const ln of jL) {
                if (!amJ.has(ln.accountCode)) throw new Error(`ไม่พบบัญชีรหัส ${ln.accountCode} ในผังบัญชี`);
              }

              const [entJ] = await tx.insert(journalEntries).values({
                companyId: newDoc.companyId, entryDate: newDoc.expDate, reference: newDoc.expNo,
                description: `${newDoc.vendorName || ""}${expItemsJ[0]?.description ? " - " + expItemsJ[0].description : (newDoc.notes ? " - " + newDoc.notes : "")}`.trim() || `บันทึกบัญชีจากค่าใช้จ่าย ${newDoc.expNo}`,
                journalBook: "payment", entryNo: entryNoJ, createdBy: user.id, status: "posted", sourceDocType: "expense", sourceDocId: newDoc.id,
              }).returning();
              for (const ln of jL) {
                const ac = amJ.get(ln.accountCode)!;
                await tx.insert(journalLines).values({
                  journalEntryId: entJ.id, accountId: ac.id,
                  description: ac.nameTh ? `${ac.nameTh} (${ac.name})` : ac.name || ln.accountName,
                  debit: ln.direction === "debit" ? String(ln.amount.toFixed(2)) : "0",
                  credit: ln.direction === "credit" ? String(ln.amount.toFixed(2)) : "0",
                });
              }
            }

            return newDoc;
          });

          created.push({ expNo: result.expNo, id: result.id });
        } catch (err: any) {
          errors.push({ expNo: doc.expNo || "(auto)", error: err.message });
        }
      }

      const createdIds = created.map((c: any) => c.id).filter(Boolean);
      if (createdIds.length > 0) {
        const [batch] = await db.insert(documentImportBatches).values({
          companyId,
          docType: "expense",
          fileName: req.body.fileName || null,
          totalCreated: createdIds.length,
          totalSkipped: skipped.length,
          totalErrors: errors.length,
          createdDocIds: JSON.stringify(createdIds),
          createdBy: user.id,
        }).returning();
        res.json({ created, skipped, errors, total: documents.length, batchId: batch.id });
      } else {
        res.json({ created, skipped, errors, total: documents.length });
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/expenses/:id/clone", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(expenses).where(eq(expenses.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบรายจ่าย" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const items = await db.select().from(expenseItems).where(eq(expenseItems.expenseId, doc.id));
      const prefix = doc.docPrefix || "EXP";
      const expNo = await getNextDocNo(doc.companyId, prefix, expenses, expenses.expNo, expenses.companyId, doc.expDate);
      const user = req.user as any;
      const result = await db.transaction(async (tx) => {
        const [cloned] = await tx.insert(expenses).values({
          companyId: doc.companyId, expNo, expDate: new Date().toISOString().split("T")[0],
          dueDate: doc.dueDate, vendorId: doc.vendorId, vendorCode: doc.vendorCode,
          vendorName: doc.vendorName, vendorOrg: doc.vendorOrg, vendorAddress: doc.vendorAddress,
          vendorTaxId: doc.vendorTaxId, branch: doc.branch, contactEmail: doc.contactEmail,
          contactPhone: doc.contactPhone, creditDays: doc.creditDays, taxInvoiceRef: doc.taxInvoiceRef,
          formulaCode: doc.formulaCode, subtotal: doc.subtotal, discountAmount: doc.discountAmount,
          vatAmount: doc.vatAmount, totalAmount: doc.totalAmount, withholdingTax: doc.withholdingTax,
          status: "approved", paymentStatus: "unpaid", priceMode: doc.priceMode,
          showInTaxReport: doc.showInTaxReport, docPrefix: doc.docPrefix,
          refDoc: doc.refDoc, notes: doc.notes, linkJournal: doc.linkJournal,
          paymentMethod: doc.paymentMethod,
          salesperson: doc.salesperson, department: doc.department, project: doc.project,
          createdBy: user.id,
        }).returning();
        for (const it of items) {
          await tx.insert(expenseItems).values({
            expenseId: cloned.id, accountCode: it.accountCode,
            accountName: it.accountName, description: it.description,
            expenseType: it.expenseType, amount: it.amount, vatType: it.vatType,
          });
        }
        return cloned;
      });
      res.status(200).json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/expenses/:id/share", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(expenses).where(eq(expenses.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบรายจ่าย" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      let token = doc.shareToken;
      if (!token) {
        const { randomBytes } = await import("crypto");
        token = randomBytes(24).toString("hex");
        await db.update(expenses).set({ shareToken: token }).where(eq(expenses.id, doc.id));
      }
      res.json({ shareToken: token });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ====== Withholding Tax Certificates (50 ทวิ) ======
  app.get("/api/wht-certs", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const rows = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.companyId, companyId)).orderBy(desc(withholdingTaxCerts.certDate), desc(withholdingTaxCerts.createdAt));
      const userIds = Array.from(new Set(rows.map(r => r.createdBy).filter(Boolean))) as number[];
      const userMap: Record<number, string> = {};
      for (const uid of userIds) {
        const u = await storage.getUser(uid);
        if (u) userMap[uid] = u.username;
      }
      const result = rows.map(r => ({
        ...r,
        createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-",
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wht-certs/next-no", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const prefix = String(req.query.prefix || "WHT");
      const certNo = await getNextDocNo(companyId, prefix, withholdingTaxCerts, withholdingTaxCerts.certNo, withholdingTaxCerts.companyId, req.query.docDate as string);
      res.json({ certNo });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wht-certs/consolidate", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const month = String(req.query.month || "").padStart(2, "0");
      const year = Number(req.query.year || 0);
      if (!companyId || !month || !year) return res.status(400).json({ message: "กรุณาระบุ companyId, month, year" });
      const ceYear = year > 2500 ? year - 543 : year;
      const startDate = `${ceYear}-${month}-01`;
      const lastDay = new Date(ceYear, parseInt(month), 0).getDate();
      const endDate = `${ceYear}-${month}-${String(lastDay).padStart(2, "0")}`;

      const certs = await db.select().from(withholdingTaxCerts).where(and(
        eq(withholdingTaxCerts.companyId, companyId),
        sql`${withholdingTaxCerts.certDate} >= ${startDate}`,
        sql`${withholdingTaxCerts.certDate} <= ${endDate}`,
        sql`${withholdingTaxCerts.status} != 'cancelled'`,
        sql`COALESCE(${withholdingTaxCerts.sourceDocType}, '') != 'consolidated'`,
      )).orderBy(withholdingTaxCerts.certDate);

      const certIds = certs.map(c => c.id);
      let allItems: any[] = [];
      if (certIds.length > 0) {
        allItems = await db.select().from(whtCertItems).where(sql`${whtCertItems.whtCertId} IN (${sql.join(certIds.map(id => sql`${id}`), sql`, `)})`);
      }

      const vendorMap: Record<string, {
        payeeName: string; payeeTaxId: string; payeeAddress: string; payeeBranch: string;
        payeeVendorId: number | null; formType: string;
        totalAmountPaid: number; totalTaxWithheld: number;
        certCount: number; certIds: number[];
        items: Array<{ incomeType: string; incomeDescription: string; paidDate: string; amountPaid: number; taxWithheld: number; taxRate: string }>;
      }> = {};

      for (const cert of certs) {
        const key = `${cert.payeeTaxId || ""}__${cert.payeeName}`;
        if (!vendorMap[key]) {
          vendorMap[key] = {
            payeeName: cert.payeeName, payeeTaxId: cert.payeeTaxId || "",
            payeeAddress: cert.payeeAddress || "", payeeBranch: cert.payeeBranch || "",
            payeeVendorId: cert.payeeVendorId, formType: cert.formType || "pnd3",
            totalAmountPaid: 0, totalTaxWithheld: 0, certCount: 0, certIds: [], items: [],
          };
        }
        const v = vendorMap[key];
        v.certCount++;
        v.certIds.push(cert.id);
        v.totalAmountPaid += parseFloat(cert.amountPaid || "0");
        v.totalTaxWithheld += parseFloat(cert.taxWithheld || "0");

        const certItems = allItems.filter(it => it.whtCertId === cert.id);
        if (certItems.length > 0) {
          for (const it of certItems) {
            v.items.push({
              incomeType: it.incomeType || "5",
              incomeDescription: it.incomeDescription || "",
              paidDate: it.paidDate || cert.certDate,
              amountPaid: parseFloat(it.amountPaid || "0"),
              taxWithheld: parseFloat(it.taxWithheld || "0"),
              taxRate: it.taxRate || "3",
            });
          }
        } else {
          v.items.push({
            incomeType: cert.incomeType || "5",
            incomeDescription: cert.incomeDescription || "",
            paidDate: cert.paidDate || cert.certDate,
            amountPaid: parseFloat(cert.amountPaid || "0"),
            taxWithheld: parseFloat(cert.taxWithheld || "0"),
            taxRate: cert.taxRate || "3",
          });
        }
      }

      const result = Object.values(vendorMap).map(v => {
        const incomeMap: Record<string, { incomeType: string; incomeDescription: string; paidDate: string; amountPaid: number; taxWithheld: number; taxRate: string }> = {};
        for (const it of v.items) {
          const k = it.incomeType;
          if (!incomeMap[k]) {
            incomeMap[k] = { ...it };
          } else {
            incomeMap[k].amountPaid += it.amountPaid;
            incomeMap[k].taxWithheld += it.taxWithheld;
            if (it.incomeDescription && !incomeMap[k].incomeDescription.includes(it.incomeDescription)) {
              incomeMap[k].incomeDescription = [incomeMap[k].incomeDescription, it.incomeDescription].filter(Boolean).join(", ");
            }
          }
        }
        return {
          ...v,
          consolidatedItems: Object.values(incomeMap).map(im => ({
            ...im,
            amountPaid: im.amountPaid.toFixed(2),
            taxWithheld: im.taxWithheld.toFixed(2),
          })),
          totalAmountPaid: v.totalAmountPaid.toFixed(2),
          totalTaxWithheld: v.totalTaxWithheld.toFixed(2),
        };
      });

      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/wht-certs/consolidate", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, vendors } = req.body;
      if (!companyId || !vendors || !Array.isArray(vendors) || vendors.length === 0) {
        return res.status(400).json({ message: "กรุณาเลือก vendor ที่ต้องการรวม" });
      }

      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (!company) return res.status(404).json({ message: "ไม่พบบริษัท" });

      const createdCerts: any[] = [];
      for (const vendor of vendors) {
        const prefix = "WHT";
        const certDate = vendor.certDate || new Date().toISOString().split("T")[0];
        const certNo = await getNextDocNo(companyId, prefix, withholdingTaxCerts, withholdingTaxCerts.certNo, withholdingTaxCerts.companyId, certDate);

        const [cert] = await db.insert(withholdingTaxCerts).values({
          companyId,
          certNo,
          certDate,
          paidDate: certDate,
          payerName: (company as any).nameTh || company.name || "",
          payerAddress: (company as any).addressTh || (company as any).address || "",
          payerTaxId: company.taxId || "",
          payerBranch: (company as any).branch || "สำนักงานใหญ่",
          payeeVendorId: vendor.payeeVendorId || null,
          payeeName: vendor.payeeName,
          payeeAddress: vendor.payeeAddress || "",
          payeeTaxId: vendor.payeeTaxId || "",
          payeeBranch: vendor.payeeBranch || "",
          formType: vendor.formType || "pnd3",
          incomeType: null,
          incomeDescription: null,
          taxRate: "3",
          amountPaid: vendor.totalAmountPaid || "0",
          taxWithheld: vendor.totalTaxWithheld || "0",
          whtCondition: "1",
          sourceDocType: "consolidated",
          sourceDocId: null,
          sourceDocNo: (vendor.certIds || []).map((id: number) => `#${id}`).join(","),
          notes: `รวมจาก ${vendor.certCount || 0} ใบ`,
          status: "approved",
          docPrefix: prefix,
          createdBy: user.id,
        }).returning();

        if (vendor.consolidatedItems && Array.isArray(vendor.consolidatedItems)) {
          for (const item of vendor.consolidatedItems) {
            await db.insert(whtCertItems).values({
              whtCertId: cert.id,
              incomeType: item.incomeType || "5",
              incomeDescription: item.incomeDescription || null,
              paidDate: item.paidDate || certDate,
              amountPaid: String(item.amountPaid || "0"),
              taxWithheld: String(item.taxWithheld || "0"),
              taxRate: String(item.taxRate || "3"),
            });
          }
        }

        const savedItems = await db.select().from(whtCertItems).where(eq(whtCertItems.whtCertId, cert.id));
        createdCerts.push({ ...cert, items: savedItems });
      }

      res.json({ created: createdCerts.length, certs: createdCerts });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wht-certs/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบหนังสือรับรอง 50 ทวิ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      let createdByName = "-";
      let createdBySignatureName = "";
      let createdBySignatureTitle = "";
      let createdBySignatureUrl = "";
      if (doc.createdBy) {
        const u = await storage.getUser(doc.createdBy);
        if (u) {
          createdByName = u.fullName;
          createdBySignatureName = u.signatureName || u.fullName;
          createdBySignatureTitle = u.signatureTitle || "";
          createdBySignatureUrl = u.signatureUrl || "";
        }
      }
      const items = await db.select().from(whtCertItems).where(eq(whtCertItems.whtCertId, doc.id));
      let stampUrl: string | null = null;
      try {
        const dsRows = await db.execute(sql.raw(`SELECT stamp_url FROM document_settings WHERE company_id = ${doc.companyId} LIMIT 1`));
        stampUrl = ((dsRows as any).rows?.[0]?.stamp_url) || null;
      } catch {}
      res.json({ ...doc, items, createdByName, createdBySignatureName, createdBySignatureTitle, createdBySignatureUrl, stampUrl });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // Auto-compute seq_no from position in attachment list (same company+formType+month+year, sorted by paidDate ASC, id ASC)
  async function computeWhtSeqNo(certId: number, companyId: number, formType: string | null, paidDate: string | null): Promise<string> {
    if (!paidDate) return "";
    try {
      const d = new Date(paidDate);
      const ceYear = d.getFullYear();
      const monthNum = d.getMonth() + 1;
      const startDate = `${ceYear}-${String(monthNum).padStart(2, "0")}-01`;
      const lastDay = new Date(ceYear, monthNum, 0).getDate();
      const endDate = `${ceYear}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const conditions: any[] = [
        eq(withholdingTaxCerts.companyId, companyId),
        sql`${withholdingTaxCerts.paidDate} >= ${startDate}`,
        sql`${withholdingTaxCerts.paidDate} <= ${endDate}`,
        sql`${withholdingTaxCerts.status} != 'cancelled'`,
      ];
      if (formType) conditions.push(eq(withholdingTaxCerts.formType, formType));
      const peers = await db.select({ id: withholdingTaxCerts.id })
        .from(withholdingTaxCerts)
        .where(and(...conditions))
        .orderBy(withholdingTaxCerts.paidDate, withholdingTaxCerts.id);
      const pos = peers.findIndex((r) => r.id === certId);
      return pos >= 0 ? String(pos + 1) : "";
    } catch { return ""; }
  }

  app.get("/api/wht-certs/:id/pdf", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const [company] = await db.select().from(companies).where(eq(companies.id, doc.companyId));
      let createdByName = "", createdBySignatureName = "", createdBySignatureUrl = "";
      if (doc.createdBy) {
        const u = await storage.getUser(doc.createdBy);
        if (u) {
          createdByName = u.fullName;
          createdBySignatureName = (u as any).signatureName || u.fullName;
          createdBySignatureUrl = (u as any).signatureUrl || "";
        }
      }
      const items = await db.select().from(whtCertItems).where(eq(whtCertItems.whtCertId, doc.id));
      let stampUrl: string | null = null;
      try {
        const dsRows = await db.execute(sql.raw(`SELECT stamp_url FROM document_settings WHERE company_id = ${doc.companyId} LIMIT 1`));
        stampUrl = ((dsRows as any).rows?.[0]?.stamp_url) || null;
      } catch {}
      // Auto-fill seqNo from attachment position if not manually set
      const resolvedSeqNo = doc.seqNo || await computeWhtSeqNo(doc.id, doc.companyId, doc.formType || null, doc.paidDate ? String(doc.paidDate) : null);
      const pdfBuffer = await generateWhtCertPdf({ ...doc, seqNo: resolvedSeqNo, items, company, createdByName, createdBySignatureName, createdBySignatureUrl, stampUrl });
      const filename = `wht-cert-${doc.certNo || doc.id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("WHT cert PDF auth error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/wht-certs", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const body = req.body;
      const user = req.user as any;
      const companyId = Number(body.companyId);
      if (!companyId || !body.payerName || !body.payeeName || !body.certDate) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      }
      if (body.payeeVendorId === "" || body.payeeVendorId === undefined) body.payeeVendorId = null;
      else body.payeeVendorId = Number(body.payeeVendorId) || null;
      if (body.sourceDocId === "" || body.sourceDocId === undefined) body.sourceDocId = null;
      else body.sourceDocId = Number(body.sourceDocId) || null;
      const prefix = body.docPrefix || "WHT";
      let certNo = body.certNo;
      if (!certNo) {
        certNo = await getNextDocNo(companyId, prefix, withholdingTaxCerts, withholdingTaxCerts.certNo, withholdingTaxCerts.companyId, body.certDate);
      }
      const [result] = await db.insert(withholdingTaxCerts).values({
        companyId,
        certNo,
        certDate: body.certDate,
        paidDate: body.paidDate || null,
        payerName: body.payerName,
        payerAddress: body.payerAddress || null,
        payerTaxId: body.payerTaxId || null,
        payerBranch: body.payerBranch || null,
        payeeVendorId: body.payeeVendorId,
        payeeName: body.payeeName,
        payeeAddress: body.payeeAddress || null,
        payeeTaxId: body.payeeTaxId || null,
        payeeBranch: body.payeeBranch || null,
        formType: body.formType || "pnd3",
        incomeType: body.incomeType || null,
        incomeDescription: body.incomeDescription || null,
        taxRate: body.taxRate || "3",
        amountPaid: body.amountPaid || "0",
        taxWithheld: body.taxWithheld || "0",
        whtCondition: body.whtCondition || "1",
        sourceDocType: body.sourceDocType || null,
        sourceDocId: body.sourceDocId,
        sourceDocNo: body.sourceDocNo || null,
        notes: body.notes || null,
        status: body.status || "approved",
        docPrefix: prefix,
        attachedUrl: body.attachedUrl || null,
        createdBy: user.id,
      }).returning();

      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        for (const item of body.items) {
          await db.insert(whtCertItems).values({
            whtCertId: result.id,
            incomeType: item.incomeType || "5",
            incomeDescription: item.incomeDescription || null,
            paidDate: item.paidDate || body.paidDate || null,
            amountPaid: String(item.amountPaid || "0"),
            taxWithheld: String(item.taxWithheld || "0"),
            taxRate: String(item.taxRate || "3"),
          });
        }
      } else if (parseFloat(body.amountPaid || "0") > 0) {
        await db.insert(whtCertItems).values({
          whtCertId: result.id,
          incomeType: body.incomeType || "5",
          incomeDescription: body.incomeDescription || null,
          paidDate: body.paidDate || null,
          amountPaid: body.amountPaid || "0",
          taxWithheld: body.taxWithheld || "0",
          taxRate: body.taxRate || "3",
        });
      }

      const savedItems = await db.select().from(whtCertItems).where(eq(whtCertItems.whtCertId, result.id));
      res.status(201).json({ ...result, items: savedItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/wht-certs/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบหนังสือรับรอง 50 ทวิ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const body = req.body;
      const updateData: any = {};
      const allowedFields = [
        "certNo", "certDate", "paidDate", "payerName", "payerAddress", "payerTaxId", "payerBranch",
        "payeeVendorId", "payeeName", "payeeAddress", "payeeTaxId", "payeeBranch",
        "formType", "incomeType", "incomeDescription", "taxRate", "amountPaid", "taxWithheld",
        "whtCondition", "sourceDocType", "sourceDocId", "sourceDocNo", "notes", "status", "docPrefix", "attachedUrl"
      ];
      const integerFields = ["payeeVendorId", "sourceDocId"];
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          if (integerFields.includes(field)) {
            updateData[field] = body[field] !== "" && body[field] !== null ? Number(body[field]) || null : null;
          } else {
            updateData[field] = body[field];
          }
        }
      }
      updateData.updatedAt = new Date();
      await db.update(withholdingTaxCerts).set(updateData).where(eq(withholdingTaxCerts.id, existing.id));

      if (body.items && Array.isArray(body.items)) {
        await db.delete(whtCertItems).where(eq(whtCertItems.whtCertId, existing.id));
        for (const item of body.items) {
          await db.insert(whtCertItems).values({
            whtCertId: existing.id,
            incomeType: item.incomeType || "5",
            incomeDescription: item.incomeDescription || null,
            paidDate: item.paidDate || body.paidDate || existing.paidDate || null,
            amountPaid: String(item.amountPaid || "0"),
            taxWithheld: String(item.taxWithheld || "0"),
            taxRate: String(item.taxRate || "3"),
          });
        }
      }

      const [updated] = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.id, existing.id));

      const savedItems = await db.select().from(whtCertItems).where(eq(whtCertItems.whtCertId, existing.id));
      res.json({ ...updated, items: savedItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/wht-certs/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบหนังสือรับรอง 50 ทวิ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      await db.delete(whtCertItems).where(eq(whtCertItems.whtCertId, existing.id));
      await db.delete(withholdingTaxCerts).where(eq(withholdingTaxCerts.id, existing.id));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/wht-certs/:id/share", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบหนังสือรับรอง 50 ทวิ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      // Use raw SQL for share_token to avoid production schema.ts version mismatch
      const tokenRows = await db.execute(sql.raw(`SELECT share_token FROM withholding_tax_certs WHERE id = ${doc.id} LIMIT 1`));
      let token = ((tokenRows as any).rows?.[0])?.share_token as string | null;
      if (!token) {
        const { randomBytes } = await import("crypto");
        token = randomBytes(24).toString("hex");
        await db.execute(sql.raw(`UPDATE withholding_tax_certs SET share_token = '${token}' WHERE id = ${doc.id}`));
      }
      res.json({ shareToken: token });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/share/wht-cert/:token", async (req, res) => {
    try {
      const safeToken = req.params.token.replace(/'/g, "''");
      const rows = await db.execute(sql.raw(`SELECT * FROM withholding_tax_certs WHERE share_token = '${safeToken}' LIMIT 1`));
      const doc = (rows as any).rows?.[0];
      if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
      const [company] = await db.select().from(companies).where(eq(companies.id, Number(doc.company_id)));
      const itemRows = await db.execute(sql.raw(`SELECT * FROM wht_cert_items WHERE wht_cert_id = ${Number(doc.id)} ORDER BY id ASC`));
      const rawItems = (itemRows as any).rows || [];
      const items = rawItems.map((it: any) => ({
        id: it.id,
        incomeType: it.income_type,
        incomeDescription: it.income_description,
        paidDate: it.paid_date,
        amountPaid: it.amount_paid,
        taxWithheld: it.tax_withheld,
        whtRate: it.wht_rate,
      }));
      let createdByName = "";
      let createdBySignatureName = "";
      let createdBySignatureTitle = "";
      let createdBySignatureUrl = "";
      if (doc.created_by) {
        const u = await storage.getUser(Number(doc.created_by));
        if (u) {
          createdByName = u.fullName;
          createdBySignatureName = (u as any).signatureName || u.fullName;
          createdBySignatureTitle = (u as any).signatureTitle || "";
          createdBySignatureUrl = (u as any).signatureUrl || "";
        }
      }
      res.json({
        id: doc.id,
        companyId: doc.company_id,
        certNo: doc.cert_no,
        certDate: doc.cert_date,
        bookNo: doc.book_no,
        seqNo: doc.seq_no,
        formType: doc.form_type,
        payerTaxId: doc.payer_tax_id,
        payerName: doc.payer_name,
        payerBranch: doc.payer_branch,
        payerAddress: doc.payer_address,
        payeeTaxId: doc.payee_tax_id,
        payeeName: doc.payee_name,
        payeeBranch: doc.payee_branch,
        payeeAddress: doc.payee_address,
        incomeType: doc.income_type,
        incomeDescription: doc.income_description,
        paidDate: doc.paid_date,
        amountPaid: doc.amount_paid,
        taxWithheld: doc.tax_withheld,
        whtRate: doc.wht_rate,
        whtCondition: doc.wht_condition,
        whtConditionOther: doc.wht_condition_other,
        gpfAmount: doc.gpf_amount,
        ssoAmount: doc.sso_amount,
        pvdAmount: doc.pvd_amount,
        shareToken: doc.share_token,
        items,
        company,
        createdByName,
        createdBySignatureName,
        createdBySignatureTitle,
        createdBySignatureUrl,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/share/wht-cert/:token/pdf", async (req, res) => {
    try {
      const safeToken = req.params.token.replace(/'/g, "''");
      const rows = await db.execute(sql.raw(`SELECT * FROM withholding_tax_certs WHERE share_token = '${safeToken}' LIMIT 1`));
      const doc = (rows as any).rows?.[0];
      if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
      const [company] = await db.select().from(companies).where(eq(companies.id, Number(doc.company_id)));
      let createdBySignatureName = "";
      let createdByName = "";
      let createdBySignatureUrl = "";
      if (doc.created_by) {
        const u = await storage.getUser(Number(doc.created_by));
        if (u) {
          createdByName = u.fullName;
          createdBySignatureName = (u as any).signatureName || u.fullName;
          createdBySignatureUrl = (u as any).signatureUrl || "";
        }
      }
      const itemRows = await db.execute(sql.raw(`SELECT * FROM wht_cert_items WHERE wht_cert_id = ${Number(doc.id)}`));
      const items = (itemRows as any).rows || [];
      // generateWhtCertPdf expects camelCase fields — map snake_case raw result
      const docCamel = {
        ...doc,
        certNo: doc.cert_no, bookNo: doc.book_no, companyId: doc.company_id,
        certDate: doc.cert_date, seqNo: doc.seq_no,
        payerName: doc.payer_name, payerTaxId: doc.payer_tax_id, payerAddress: doc.payer_address, payerBranch: doc.payer_branch,
        payeeName: doc.payee_name, payeeTaxId: doc.payee_tax_id, payeeAddress: doc.payee_address, payeeBranch: doc.payee_branch,
        formType: doc.form_type, whtCondition: doc.wht_condition, whtConditionOther: doc.wht_condition_other,
        paidDate: doc.paid_date, totalIncome: doc.total_income, taxWithheld: doc.tax_withheld,
        whtRate: doc.wht_rate, incomeType: doc.income_type, incomeTypeOther: doc.income_type_other,
        amountPaid: doc.amount_paid, gpfAmount: doc.gpf_amount, ssoAmount: doc.sso_amount, pvdAmount: doc.pvd_amount,
        createdBy: doc.created_by,
      };
      const camelItems = ((itemRows as any).rows || []).map((it: any) => ({
        ...it,
        whtCertId: it.wht_cert_id, incomeType: it.income_type, incomeDescription: it.income_description,
        paidDate: it.paid_date, amountPaid: it.amount_paid, taxWithheld: it.tax_withheld, taxRate: it.tax_rate,
      }));
      let stampUrl: string | null = null;
      try {
        const dsRows = await db.execute(sql.raw(`SELECT stamp_url FROM document_settings WHERE company_id = ${Number(doc.company_id)} LIMIT 1`));
        stampUrl = ((dsRows as any).rows?.[0]?.stamp_url) || null;
      } catch (_) {}
      // Auto-fill seqNo from attachment position if not manually set
      const resolvedSeqNo = doc.seq_no || await computeWhtSeqNo(Number(doc.id), Number(doc.company_id), doc.form_type || null, doc.paid_date ? String(doc.paid_date) : null);
      const pdfData = { ...docCamel, seqNo: resolvedSeqNo, company, items: camelItems, createdByName, createdBySignatureName, createdBySignatureUrl, stampUrl };
      const pdfBuffer = await generateWhtCertPdf(pdfData);
      const filename = `wht-cert-${doc.cert_no || doc.id}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error("WHT cert PDF generation error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/reports/wht/export", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const month = String(req.query.month || "");
      const year = String(req.query.year || "");
      const formType = String(req.query.formType || "all");
      if (!companyId || !month || !year) return res.status(400).json({ message: "companyId, month, year required" });

      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (!company) return res.status(404).json({ message: "Company not found" });

      const beYear = Number(year);
      const ceYear = beYear - 543;
      const monthNum = Number(month);
      const startDate = `${ceYear}-${String(monthNum).padStart(2, "0")}-01`;
      const lastDay = new Date(ceYear, monthNum, 0).getDate();
      const endDate = `${ceYear}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      let conditions = [
        eq(withholdingTaxCerts.companyId, companyId),
        sql`${withholdingTaxCerts.paidDate} >= ${startDate}`,
        sql`${withholdingTaxCerts.paidDate} <= ${endDate}`,
        sql`${withholdingTaxCerts.status} != 'cancelled'`,
      ];
      if (formType !== "all") {
        conditions.push(eq(withholdingTaxCerts.formType, formType));
      }

      const rows = await db.select().from(withholdingTaxCerts).where(and(...conditions)).orderBy(withholdingTaxCerts.paidDate);

      if (rows.length === 0) return res.status(400).json({ message: "ไม่พบข้อมูลในช่วงเดือนที่เลือก" });

      const companyTaxId = (company.taxId || "").replace(/-/g, "");
      const companyTin = companyTaxId.length >= 10 ? companyTaxId.substring(0, 10) : companyTaxId;
      const companyBranch = (company.branch || "00000").replace(/[^0-9]/g, "").padEnd(5, "0").substring(0, 5);

      const lines: string[] = [];

      for (const cert of rows) {
        const isPnd53 = cert.formType === "pnd53";
        const payeeTaxId = (cert.payeeTaxId || "").replace(/-/g, "");
        const payeeTin = payeeTaxId.length >= 10 ? payeeTaxId.substring(0, 10) : payeeTaxId;
        const payeeBranch = (cert.payeeBranch || "00000").replace(/[^0-9]/g, "").padEnd(5, "0").substring(0, 5);

        let payDateStr = "";
        if (cert.paidDate) {
          const pd = new Date(cert.paidDate);
          const dd = String(pd.getDate()).padStart(2, "0");
          const mm = String(pd.getMonth() + 1).padStart(2, "0");
          const yyyy = String(pd.getFullYear() + 543);
          payDateStr = `${dd}/${mm}/${yyyy}`;
        }

        const taxRate = Number(cert.taxRate || 0).toFixed(2);
        const payAmt = Number(cert.amountPaid || 0).toFixed(2);
        const taxAmt = Number(cert.taxWithheld || 0).toFixed(2);
        const proviso = cert.whtCondition || "1";
        const incType = cert.incomeDescription || cert.incomeType || "";
        const notes = cert.notes || "";

        const header = [
          companyTaxId,       // 1: pin (เลขประจำตัวผู้เสียภาษี)
          companyTaxId,       // 2: nid (บัตรประชาชน 13 หลัก)
          companyTin,         // 3: tin (เลขทะเบียนการค้า 10 หลัก)
          companyBranch,      // 4: branchid (สาขา)
          "1",                // 5: indcsubmit (1=ปกติ, 2=เพิ่มเติม)
          "1",                // 6: submitno (ลำดับการยื่น)
          "1",                // 7: sendtype1 (มาตรา 3 เตรส)
          "0",                // 8: sendtype2 (มาตรา 69 ทวิ)
          "0",                // 9: sendtype3 (มาตรา 50)
          String(beYear),     // 10: totincyear (ปีภาษี พ.ศ.)
        ];

        if (isPnd53) {
          // ภ.ง.ด.53: 36 fields total (10 header + 26 detail)
          const detail = [
            String(monthNum).padStart(2, "0"),  // 11: totincmonth
            payeeTaxId,                          // 12: Rcv_nid (เลขผู้ถูกหัก 13 หลัก)
            payeeTin,                            // 13: rcv_tin (ทะเบียนการค้า 10 หลัก)
            payeeBranch,                         // 14: branchid (สาขาผู้ถูกหัก 5 หลัก)
            "",                                  // 15: v_description
            cert.payeeName || "",                // 16: cName (ชื่อนิติบุคคล)
            "",                                  // 17: buildname (อาคาร)
            "",                                  // 18: mooName (หมู่บ้าน)
            "",                                  // 19: roomNo (ห้องเลขที่)
            "",                                  // 20: floorNo (ชั้นที่)
            "",                                  // 21: addNum (เลขที่)
            "",                                  // 22: mooNo (หมู่ที่)
            "",                                  // 23: trokSoi (ตรอก/ซอย)
            "",                                  // 24: street (ถนน)
            "",                                  // 25: tumbolName (ตำบล/แขวง)
            "",                                  // 26: amphurName (อำเภอ/เขต)
            "",                                  // 27: provinceName (จังหวัด)
            "",                                  // 28: postcode (รหัสไปรษณีย์)
            "",                                  // 29: telnum (โทรศัพท์)
            payDateStr,                          // 30: paydate (วันที่จ่าย DD/MM/YYYY พ.ศ.)
            incType,                             // 31: inctype (ประเภทเงินได้)
            taxRate,                             // 32: taxrate (อัตราภาษี)
            payAmt,                              // 33: payamt (จำนวนเงินที่จ่าย)
            taxAmt,                              // 34: taxamt (ภาษีที่หัก)
            proviso,                             // 35: proviso (1=หัก ณ ที่จ่าย, 2=ออกให้ตลอดไป, 3=ออกให้ครั้งเดียว)
            notes,                               // 36: notes (หมายเหตุ)
          ];
          lines.push([...header, ...detail].join("|"));
        } else {
          // ภ.ง.ด.3: 37 fields total (10 header + 27 detail)
          const nameParts = (cert.payeeName || "").split(" ");
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";
          const detail = [
            String(monthNum).padStart(2, "0"),  // 11: totincmonth
            payeeTaxId,                          // 12: Rev_pin (เลขผู้ถูกหัก 13 หลัก)
            payeeTin,                            // 13: rcv_tin (เลขทะเบียนการค้า 10 หลัก)
            payeeBranch.substring(0, 4),         // 14: branchid (สาขาผู้ถูกหัก 4 หลัก)
            "",                                  // 15: v_description (คำนำหน้า)
            firstName,                           // 16: fName (ชื่อ)
            lastName,                            // 17: lName (นามสกุล)
            "",                                  // 18: buildname (อาคาร)
            "",                                  // 19: mooName (หมู่บ้าน)
            "",                                  // 20: roomNo (ห้องเลขที่)
            "",                                  // 21: floorNo (ชั้นที่)
            "",                                  // 22: addNum (เลขที่)
            "",                                  // 23: mooNo (หมู่ที่)
            "",                                  // 24: trokSoi (ตรอก/ซอย)
            "",                                  // 25: street (ถนน)
            "",                                  // 26: tumbolName (ตำบล/แขวง)
            "",                                  // 27: amphurName (อำเภอ/เขต)
            "",                                  // 28: provinceName (จังหวัด)
            "",                                  // 29: postcode (รหัสไปรษณีย์)
            "",                                  // 30: telnum (โทรศัพท์)
            payDateStr,                          // 31: paydate (วันที่จ่าย DD/MM/YYYY พ.ศ.)
            incType,                             // 32: inctype (ประเภทเงินได้)
            taxRate,                             // 33: taxrate (อัตราภาษี)
            payAmt,                              // 34: payamt (จำนวนเงินที่จ่าย)
            taxAmt,                              // 35: taxamt (ภาษีที่หัก)
            proviso,                             // 36: proviso (1=หัก ณ ที่จ่าย, 2=ออกให้ตลอดไป, 3=ออกให้ครั้งเดียว)
            notes,                               // 37: notes (หมายเหตุ)
          ];
          lines.push([...header, ...detail].join("|"));
        }
      }

      const content = lines.join("\n");
      const fileName = `WHT_${formType === "all" ? "ALL" : formType.toUpperCase()}_${year}_${String(monthNum).padStart(2, "0")}.txt`;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(content);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/reports/wht/summary", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const month = String(req.query.month || "");
      const year = String(req.query.year || "");
      const formType = String(req.query.formType || "all");
      if (!companyId || !month || !year) return res.status(400).json({ message: "companyId, month, year required" });

      const beYear = Number(year);
      const ceYear = beYear - 543;
      const monthNum = Number(month);
      const startDate = `${ceYear}-${String(monthNum).padStart(2, "0")}-01`;
      const lastDay = new Date(ceYear, monthNum, 0).getDate();
      const endDate = `${ceYear}-${String(monthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      let conditions = [
        eq(withholdingTaxCerts.companyId, companyId),
        sql`${withholdingTaxCerts.paidDate} >= ${startDate}`,
        sql`${withholdingTaxCerts.paidDate} <= ${endDate}`,
        sql`${withholdingTaxCerts.status} != 'cancelled'`,
      ];
      if (formType !== "all") {
        conditions.push(eq(withholdingTaxCerts.formType, formType));
      }

      const rows = await db.select().from(withholdingTaxCerts).where(and(...conditions)).orderBy(withholdingTaxCerts.paidDate);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/wht-certs/:id/send-email-info", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบหนังสือรับรอง 50 ทวิ" });
      const ac = await checkDocOwnership(doc.companyId, req.user);
      if (!ac.allowed) return res.status(403).json({ message: ac.message });

      let suggestedEmail = "";
      if (doc.sourceDocType === "expense" && doc.sourceDocId) {
        const [srcDoc] = await db.select({ contactEmail: expenses.contactEmail }).from(expenses).where(eq(expenses.id, doc.sourceDocId));
        suggestedEmail = srcDoc?.contactEmail || "";
      }
      if (!suggestedEmail && doc.payeeVendorId) {
        const [contact] = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.id, doc.payeeVendorId));
        suggestedEmail = contact?.email || "";
      }
      res.json({ suggestedEmail, payeeName: doc.payeeName || "", certNo: doc.certNo || "" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/wht-certs/:id/send-email", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบหนังสือรับรอง 50 ทวิ" });
      const ac = await checkDocOwnership(doc.companyId, req.user);
      if (!ac.allowed) return res.status(403).json({ message: ac.message });

      const { toEmail } = req.body;
      if (!toEmail) return res.status(400).json({ message: "กรุณาระบุอีเมลผู้รับ" });

      const cfgRows = await db.execute(sql.raw(`SELECT config_key, config_value FROM system_config WHERE config_key IN ('SYSADMIN_RESEND_API_KEY','SYSADMIN_RESEND_FROM','SYSADMIN_SMTP_HOST','SYSADMIN_SMTP_PORT','SYSADMIN_SMTP_USER','SYSADMIN_SMTP_PASS','SYSADMIN_SMTP_FROM','SYSADMIN_SMTP_SECURE')`));
      const cfg: Record<string, string> = {};
      for (const r of (cfgRows.rows || []) as any[]) cfg[r.config_key] = r.config_value;

      const hasResend = !!cfg.SYSADMIN_RESEND_API_KEY;
      const hasSmtp = !!(cfg.SYSADMIN_SMTP_HOST && cfg.SYSADMIN_SMTP_USER && cfg.SYSADMIN_SMTP_PASS);
      if (!hasResend && !hasSmtp) {
        return res.status(400).json({ message: "ยังไม่ได้ตั้งค่าระบบส่งอีเมล — กรุณาตั้งค่า Resend API Key ใน System Config ก่อน" });
      }

      const items = await db.select().from(whtCertItems).where(eq(whtCertItems.whtCertId, doc.id));
      const [company] = await db.select().from(companies).where(eq(companies.id, doc.companyId));
      let createdByName = "";
      let createdBySignatureName = "";
      let createdBySignatureUrlEmail = "";
      if (doc.createdBy) {
        const u = await storage.getUser(Number(doc.createdBy));
        if (u) { createdByName = u.fullName; createdBySignatureName = (u as any).signatureName || u.fullName; createdBySignatureUrlEmail = (u as any).signatureUrl || ""; }
      }
      let stampUrlEmail: string | null = null;
      try {
        const dsRows = await db.execute(sql.raw(`SELECT stamp_url FROM document_settings WHERE company_id = ${doc.companyId} LIMIT 1`));
        stampUrlEmail = ((dsRows as any).rows?.[0]?.stamp_url) || null;
      } catch {}
      const resolvedSeqNoEmail = doc.seqNo || await computeWhtSeqNo(doc.id, doc.companyId, doc.formType, doc.paidDate);
      const pdfBuffer = await generateWhtCertPdf({ ...doc, seqNo: resolvedSeqNoEmail, items, company, createdByName, createdBySignatureName, createdBySignatureUrl: createdBySignatureUrlEmail, stampUrl: stampUrlEmail });

      const companyName = company?.name || "บริษัท";
      const subject = `หนังสือรับรองการหักภาษี ณ ที่จ่าย ${doc.certNo || ""} จาก ${companyName}`;
      const htmlBody = `<div style="font-family:sans-serif;padding:20px"><p>เรียน ${doc.payeeName || "ท่าน"},</p><p>กรุณาตรวจสอบหนังสือรับรองการหักภาษี ณ ที่จ่าย เลขที่ <strong>${doc.certNo || ""}</strong> ที่แนบมาพร้อมอีเมลนี้</p><p>ขอบคุณ,<br/>${companyName}</p></div>`;
      const pdfBase64 = pdfBuffer.toString("base64");
      const attachmentName = `wht-cert-${doc.certNo || doc.id}.pdf`;

      const senderDomain = cfg.SYSADMIN_RESEND_FROM || "noreply@etaxerp.com";
      const fromDisplay = `${companyName} <${senderDomain}>`;
      const replyTo = company?.email || undefined;

      if (hasResend) {
        const resendBody: Record<string, any> = {
          from: fromDisplay,
          to: [toEmail],
          subject,
          html: htmlBody,
          attachments: [{ filename: attachmentName, content: pdfBase64 }],
        };
        if (replyTo) resendBody.reply_to = replyTo;
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${cfg.SYSADMIN_RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(resendBody),
        });
        if (!resendRes.ok) {
          const errBody = await resendRes.json().catch(() => ({})) as any;
          throw new Error(errBody?.message || `Resend API error ${resendRes.status}`);
        }
      } else {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host: cfg.SYSADMIN_SMTP_HOST,
          port: Number(cfg.SYSADMIN_SMTP_PORT || "587"),
          secure: cfg.SYSADMIN_SMTP_SECURE === "true",
          auth: { user: cfg.SYSADMIN_SMTP_USER, pass: cfg.SYSADMIN_SMTP_PASS.trim() },
        });
        await transporter.sendMail({
          from: fromDisplay,
          to: toEmail,
          replyTo: replyTo,
          subject,
          html: htmlBody,
          attachments: [{ filename: attachmentName, content: pdfBuffer, contentType: "application/pdf" }],
        });
      }
      res.json({ success: true, message: `ส่งอีเมลไปยัง ${toEmail} สำเร็จ` });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

}
