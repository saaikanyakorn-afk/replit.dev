import type { Express } from "express";
import * as XLSX from "xlsx";
import path from "path";
import { parse as csvParse } from "csv-parse/sync";
import { db } from "../db";
import { storage } from "../storage";
import { eq, and, desc, or, sql, count, not, ilike, inArray } from "drizzle-orm";
import { purchaseRequests, purchaseRequestItems, bidComparisons, bidComparisonItems, bidVendors, purchaseOrders, purchaseOrderItems, purchaseInvoices, purchaseInvoiceItems, companies, accounts, contacts, products, journalEntries, journalLines, productStock, stockMovements, expenses, expenseItems, withholdingTaxCerts, whtCertItems, documentImportBatches, firmClients, clientUploadLinks, clientUploadFiles, purchaseDebitNotes, purchaseDebitNoteItems, accountingFormulas, accountingFormulaLines } from "@shared/schema";
import { expenseDailyBatches, pdfImportTemplates } from "@shared/schema-extra";
import { requireAuth, requireModule, requireRole, checkDocOwnership } from "../route-middleware";
import { getNextDocNo, validateDocNo, createAutoJournalEntry, resolvePaymentMethodAccountCode, getNextJournalEntryNo, checkDocumentLimit, deleteStockMovementsForDoc, deleteJournalEntriesForDoc, logActivity, upsertWarehouseStockLevel, getInventoryTriggers } from "../route-helpers";
import { parsePagination, paginatedResponse } from "./pagination";
import { invalidateCompanyReports } from "./report-cache";
import { recalcBundleStock, recalcBomStock } from "../inventory-recalc";
import { decodeMulterFilename } from "../utils/safe-filename";
import { INVOICE_PREFIX_MAP } from "../utils/pdf-invoice-parser";
import { DEFAULT_FORMULAS } from "@shared/accounting-formulas";
import multer from "multer";
import crypto from "crypto";
// ═══════════════════════════════════════════════════════════════════════
// ⚠️ AI DEPENDENCY — OpenAI SDK (used by /api/pdf-import/extract)
// This client is used for PDF/image reading via GPT-4o Vision.
// To disable ALL AI calls in purchase routes: set openai = null below.
// The frontend "กรอกเอง (ฟรี)" manual entry path still works without AI.
// ═══════════════════════════════════════════════════════════════════════
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

const openai = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL } : {}),
    })
  : null;

const geminiAi = process.env.AI_INTEGRATIONS_GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    })
  : null;

const isCreditPm = (name?: string | null) =>
  !!name && (name.toLowerCase() === "credit" || name === "เครดิต" || name.startsWith("เครดิต("));

async function fetchPurchaseInvoiceItems(purchaseInvoiceId: number): Promise<any[]> {
  const r = await db.execute(sql`
    SELECT *,
      product_id       AS "productId",
      product_code     AS "productCode",
      product_name     AS "productName",
      unit_price       AS "unitPrice",
      discount_type    AS "discountType",
      vat_type         AS "vatType",
      account_code     AS "accountCode",
      account_name     AS "accountName",
      warehouse_id     AS "warehouseId",
      purchase_invoice_id AS "purchaseInvoiceId"
    FROM purchase_invoice_items
    WHERE purchase_invoice_id = ${purchaseInvoiceId}
    ORDER BY id
  `);
  return r.rows as any[];
}

export function registerPurchaseRoutes(app: Express) {
  // ============ Purchase Requests ============

  app.get("/api/purchase-requests", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
      const whereClause = eq(purchaseRequests.companyId, companyId);
      const [{ total }] = await db.select({ total: count() }).from(purchaseRequests).where(whereClause);
      const rows = await db.select().from(purchaseRequests).where(whereClause).orderBy(desc(purchaseRequests.prDate), desc(purchaseRequests.id)).limit(pageSize).offset(offset);
      const userIds = Array.from(new Set(rows.map(r => r.createdBy).concat(rows.map(r => r.updatedBy)).filter(Boolean))) as number[];
      const userMap: Record<number, string> = {};
      for (const uid of userIds) {
        try { const u = await storage.getUser(uid); if (u) userMap[uid] = u.fullName; } catch {}
      }
      const result = rows.map(r => ({
        ...r,
        createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-",
        updatedByName: r.updatedBy ? userMap[r.updatedBy] || "-" : "-",
      }));
      if (req.query.page) {
        res.json(paginatedResponse(result, Number(total), { page, pageSize, offset }));
      } else {
        res.json(result);
      }
    } catch (err: any) { console.error("[purchase-requests] list error:", err); res.status(500).json({ message: err.message }); }
  });

  app.get("/api/purchase-requests/next-no", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const prefix = String(req.query.prefix || "PR");
      const prNo = await getNextDocNo(companyId, prefix, purchaseRequests, purchaseRequests.prNo, purchaseRequests.companyId, req.query.docDate as string);
      res.json({ prNo });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/purchase-requests/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบขอซื้อ" });
      const access = await checkDocOwnership(doc.companyId, req.user);
      if (!access.allowed) return res.status(403).json({ message: access.message });
      const items = await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.purchaseRequestId, doc.id));
      let createdByName = "-";
      let updatedByName = "-";
      if (doc.createdBy) { const u = await storage.getUser(doc.createdBy); if (u) createdByName = u.fullName; }
      if (doc.updatedBy) { const u = await storage.getUser(doc.updatedBy); if (u) updatedByName = u.fullName; }
      res.json({ ...doc, items, createdByName, updatedByName });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-requests", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const { items, ...body } = req.body;
      if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
      else body.creditDays = Number(body.creditDays) || null;
      if (body.vendorId === "" || body.vendorId === undefined) body.vendorId = null;
      else body.vendorId = Number(body.vendorId) || null;
      const user = req.user as any;
      const companyId = Number(body.companyId);
      if (!companyId || !body.vendorName || !body.prDate) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน (companyId, vendorName, prDate)" });
      }
      const prefix = body.docPrefix || "PR";
      let prNo = body.prNo;
      if (!prNo) {
        prNo = await getNextDocNo(companyId, prefix, purchaseRequests, purchaseRequests.prNo, purchaseRequests.companyId, body.prDate);
      }
      const result = await db.transaction(async (tx) => {
        const [doc] = await tx.insert(purchaseRequests).values({
          companyId,
          prNo,
          prDate: body.prDate,
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
          deliveryDate: body.deliveryDate || null,
          refDoc: body.refDoc || null,
          subtotal: body.subtotal || "0",
          discountAmount: body.discountAmount || "0",
          vatAmount: body.vatAmount || "0",
          totalAmount: body.totalAmount || "0",
          status: body.status || "approved",
          priceMode: body.priceMode || "excluded",
          docPrefix: prefix,
          notes: body.notes || null,
          salesperson: body.salesperson || null,
          department: body.department || null,
          project: body.project || null,
          linkJournal: body.linkJournal ?? true,
          createdBy: user.id,
        }).returning();
        if (items && Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            const rawDiscount = String(item.discount || "0");
            const isPercent = rawDiscount.includes("%");
            const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
            await tx.insert(purchaseRequestItems).values({
              purchaseRequestId: doc.id,
              productId: item.productId ? Number(item.productId) : null,
              productCode: item.productCode || null,
              productName: item.productName || "",
              description: item.description || null,
              qty: String(item.qty || "1"),
              unit: item.unit || "ชิ้น",
              unitPrice: String(item.unitPrice || "0"),
              discount: String(discountNum),
              discountType: isPercent ? "percent" : "amount",
              total: String(item.total || "0"),
              vatType: item.vatType || "vat7",
            });
          }
        }
        return doc;
      });
      const savedItems = await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.purchaseRequestId, result.id));
      res.status(201).json({ ...result, items: savedItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/purchase-requests/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบขอซื้อ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      if (["pending_approval", "cancelled"].includes(existing.status) && !req.body.status) {
        return res.status(403).json({ message: "ไม่สามารถแก้ไขเอกสารที่รออนุมัติ/ยกเลิกแล้วได้" });
      }
      const { items, ...body } = req.body;
      const updateData: any = {};
      const allowedFields = [
        "prNo", "prDate", "vendorId", "vendorCode", "vendorName", "vendorOrg",
        "vendorAddress", "vendorTaxId", "branch", "contactEmail", "contactPhone",
        "creditDays", "deliveryDate", "refDoc", "subtotal", "discountAmount",
        "vatAmount", "totalAmount", "status", "priceMode", "docPrefix", "notes",
        "salesperson", "department", "project", "linkJournal"
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
      const user = req.user as any;
      updateData.updatedBy = user.id;
      updateData.updatedAt = new Date();
      await db.transaction(async (tx) => {
        await tx.update(purchaseRequests).set(updateData).where(eq(purchaseRequests.id, existing.id));
        if (items && Array.isArray(items)) {
          await tx.delete(purchaseRequestItems).where(eq(purchaseRequestItems.purchaseRequestId, existing.id));
          for (const item of items) {
            const rawDiscount = String(item.discount || "0");
            const isPercent = rawDiscount.includes("%");
            const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
            await tx.insert(purchaseRequestItems).values({
              purchaseRequestId: existing.id,
              productId: item.productId ? Number(item.productId) : null,
              productCode: item.productCode || null,
              productName: item.productName || "",
              description: item.description || null,
              qty: String(item.qty || "1"),
              unit: item.unit || "ชิ้น",
              unitPrice: String(item.unitPrice || "0"),
              discount: String(discountNum),
              discountType: isPercent ? "percent" : "amount",
              total: String(item.total || "0"),
              vatType: item.vatType || "vat7",
            });
          }
        }
      });
      const [updated] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, existing.id));
      const savedItems = await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.purchaseRequestId, existing.id));
      res.json({ ...updated, items: savedItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/purchase-requests/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบขอซื้อ" });
      const _ac2 = await checkDocOwnership(existing.companyId, req.user); if (!_ac2.allowed) return res.status(403).json({ message: _ac2.message });
      await db.transaction(async (tx) => {
        await tx.delete(purchaseRequestItems).where(eq(purchaseRequestItems.purchaseRequestId, existing.id));
        await tx.delete(purchaseRequests).where(eq(purchaseRequests.id, existing.id));
      });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-requests/:id/clone", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบขอซื้อ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const items = await db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.purchaseRequestId, doc.id));
      const prefix = doc.docPrefix || "PR";
      const prNo = await getNextDocNo(doc.companyId, prefix, purchaseRequests, purchaseRequests.prNo, purchaseRequests.companyId, doc.prDate);
      const user = req.user as any;
      const result = await db.transaction(async (tx) => {
        const [cloned] = await tx.insert(purchaseRequests).values({
          companyId: doc.companyId, prNo, prDate: new Date().toISOString().split("T")[0],
          vendorId: doc.vendorId, vendorCode: doc.vendorCode, vendorName: doc.vendorName,
          vendorOrg: doc.vendorOrg, vendorAddress: doc.vendorAddress, vendorTaxId: doc.vendorTaxId,
          branch: doc.branch, contactEmail: doc.contactEmail, contactPhone: doc.contactPhone,
          creditDays: doc.creditDays, deliveryDate: doc.deliveryDate, refDoc: doc.refDoc,
          subtotal: doc.subtotal, discountAmount: doc.discountAmount, vatAmount: doc.vatAmount,
          totalAmount: doc.totalAmount, status: "approved", priceMode: doc.priceMode,
          docPrefix: doc.docPrefix, notes: doc.notes, linkJournal: doc.linkJournal,
          salesperson: doc.salesperson, department: doc.department, project: doc.project,
          createdBy: user.id,
        }).returning();
        for (const it of items) {
          await tx.insert(purchaseRequestItems).values({
            purchaseRequestId: cloned.id, productId: it.productId,
            productCode: it.productCode, productName: it.productName,
            description: it.description, qty: it.qty, unit: it.unit,
            unitPrice: it.unitPrice, discount: it.discount, discountType: it.discountType,
            total: it.total, vatType: it.vatType,
          });
        }
        return cloned;
      });
      res.status(200).json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-requests/:id/share", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบขอซื้อ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      let token = doc.shareToken;
      if (!token) {
        const { randomBytes } = await import("crypto");
        token = randomBytes(24).toString("hex");
        await db.update(purchaseRequests).set({ shareToken: token }).where(eq(purchaseRequests.id, doc.id));
      }
      res.json({ shareToken: token });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ============ Bid Comparisons ============

  app.get("/api/bid-comparisons", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const rows = await db.select().from(bidComparisons).where(eq(bidComparisons.companyId, companyId)).orderBy(desc(bidComparisons.createdAt));
      const userIds = Array.from(new Set(rows.map(r => r.createdBy).concat(rows.map(r => r.updatedBy)).filter(Boolean))) as number[];
      const userMap: Record<number, string> = {};
      for (const uid of userIds) {
        try { const u = await storage.getUser(uid); if (u) userMap[uid] = u.fullName; } catch {}
      }
      const result = rows.map(r => ({
        ...r,
        createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-",
        updatedByName: r.updatedBy ? userMap[r.updatedBy] || "-" : "-",
      }));
      res.json(result);
    } catch (err: any) { console.error("[bid-comparisons] list error:", err); res.status(500).json({ message: err.message }); }
  });

  app.get("/api/bid-comparisons/next-no", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const prefix = String(req.query.prefix || "BID");
      const bidNo = await getNextDocNo(companyId, prefix, bidComparisons, bidComparisons.bidNo, bidComparisons.companyId, req.query.docDate as string);
      res.json({ bidNo });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/bid-comparisons/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(bidComparisons).where(eq(bidComparisons.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบเปรียบเทียบราคา" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const items = await db.select().from(bidComparisonItems).where(eq(bidComparisonItems.bidId, doc.id));
      const vendors = await db.select().from(bidVendors).where(eq(bidVendors.bidId, doc.id));
      let createdByName = "-";
      let updatedByName = "-";
      if (doc.createdBy) { const u = await storage.getUser(doc.createdBy); if (u) createdByName = u.fullName; }
      if (doc.updatedBy) { const u = await storage.getUser(doc.updatedBy); if (u) updatedByName = u.fullName; }
      res.json({ ...doc, items, vendors, createdByName, updatedByName });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/bid-comparisons", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const { items, vendors, ...body } = req.body;
      const user = req.user as any;
      const companyId = Number(body.companyId);
      if (!companyId || !body.bidDate) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน (companyId, bidDate)" });
      }
      const prefix = body.docPrefix || "BID";
      let bidNo = body.bidNo;
      if (!bidNo) {
        bidNo = await getNextDocNo(companyId, prefix, bidComparisons, bidComparisons.bidNo, bidComparisons.companyId, body.bidDate);
      }
      const result = await db.transaction(async (tx) => {
        const [doc] = await tx.insert(bidComparisons).values({
          companyId,
          bidNo,
          bidDate: body.bidDate,
          prId: body.prId ? Number(body.prId) : null,
          prRef: body.prRef || null,
          description: body.description || null,
          notes: body.notes || null,
          selectedVendorId: body.selectedVendorId ? Number(body.selectedVendorId) : null,
          selectedVendorName: body.selectedVendorName || null,
          totalAmount: body.totalAmount || "0",
          status: body.status || "pending",
          docPrefix: prefix,
          creator: body.creator || null,
          createdBy: user.id,
        }).returning();
        if (items && Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            await tx.insert(bidComparisonItems).values({
              bidId: doc.id,
              productId: item.productId ? Number(item.productId) : null,
              productCode: item.productCode || null,
              productName: item.productName || "",
              description: item.description || null,
              qty: String(item.qty || "1"),
              unit: item.unit || "ชิ้น",
            });
          }
        }
        if (vendors && Array.isArray(vendors) && vendors.length > 0) {
          for (const v of vendors) {
            await tx.insert(bidVendors).values({
              bidId: doc.id,
              vendorName: v.vendorName || "",
              price: String(v.price || "0"),
              remark: v.remark || null,
              selected: v.selected || false,
            });
          }
        }
        return doc;
      });
      const savedItems = await db.select().from(bidComparisonItems).where(eq(bidComparisonItems.bidId, result.id));
      const savedVendors = await db.select().from(bidVendors).where(eq(bidVendors.bidId, result.id));
      res.status(201).json({ ...result, items: savedItems, vendors: savedVendors });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/bid-comparisons/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(bidComparisons).where(eq(bidComparisons.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบเปรียบเทียบราคา" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const { items, vendors, ...body } = req.body;
      const updateData: any = {};
      const allowedFields = [
        "bidNo", "bidDate", "prId", "prRef", "description", "notes",
        "selectedVendorId", "selectedVendorName", "totalAmount", "status",
        "docPrefix", "creator"
      ];
      const integerFields = ["prId", "selectedVendorId"];
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          if (integerFields.includes(field)) {
            updateData[field] = body[field] !== "" && body[field] !== null && body[field] !== undefined ? Number(body[field]) || null : null;
          } else {
            updateData[field] = body[field];
          }
        }
      }
      const user = req.user as any;
      updateData.updatedBy = user.id;
      updateData.updatedAt = new Date();
      await db.transaction(async (tx) => {
        await tx.update(bidComparisons).set(updateData).where(eq(bidComparisons.id, existing.id));
        if (items && Array.isArray(items)) {
          await tx.delete(bidComparisonItems).where(eq(bidComparisonItems.bidId, existing.id));
          for (const item of items) {
            await tx.insert(bidComparisonItems).values({
              bidId: existing.id,
              productId: item.productId ? Number(item.productId) : null,
              productCode: item.productCode || null,
              productName: item.productName || "",
              description: item.description || null,
              qty: String(item.qty || "1"),
              unit: item.unit || "ชิ้น",
            });
          }
        }
        if (vendors && Array.isArray(vendors)) {
          await tx.delete(bidVendors).where(eq(bidVendors.bidId, existing.id));
          for (const v of vendors) {
            await tx.insert(bidVendors).values({
              bidId: existing.id,
              vendorName: v.vendorName || "",
              price: String(v.price || "0"),
              remark: v.remark || null,
              selected: v.selected || false,
            });
          }
        }
      });
      const [updated] = await db.select().from(bidComparisons).where(eq(bidComparisons.id, existing.id));
      const savedItems = await db.select().from(bidComparisonItems).where(eq(bidComparisonItems.bidId, existing.id));
      const savedVendors = await db.select().from(bidVendors).where(eq(bidVendors.bidId, existing.id));
      res.json({ ...updated, items: savedItems, vendors: savedVendors });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/bid-comparisons/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(bidComparisons).where(eq(bidComparisons.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบเปรียบเทียบราคา" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      await db.transaction(async (tx) => {
        await tx.delete(bidComparisonItems).where(eq(bidComparisonItems.bidId, existing.id));
        await tx.delete(bidVendors).where(eq(bidVendors.bidId, existing.id));
        await tx.delete(bidComparisons).where(eq(bidComparisons.id, existing.id));
      });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ============ Purchase Orders ============

  app.get("/api/purchase-orders", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const whereClause = eq(purchaseOrders.companyId, companyId);
      const buildResult = async (rows: any[]) => {
        const userIds = Array.from(new Set(rows.map((r: any) => r.createdBy).concat(rows.map((r: any) => r.updatedBy)).filter(Boolean))) as number[];
        const userMap: Record<number, string> = {};
        for (const uid of userIds) { const u = await storage.getUser(uid); if (u) userMap[uid] = u.username; }
        return rows.map((r: any) => ({ ...r, createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-", updatedByName: r.updatedBy ? userMap[r.updatedBy] || "-" : "-" }));
      };
      if (req.query.page) {
        const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
        const [{ total }] = await db.select({ total: count() }).from(purchaseOrders).where(whereClause);
        const rows = await db.select().from(purchaseOrders).where(whereClause).orderBy(desc(purchaseOrders.poDate), desc(purchaseOrders.id)).limit(pageSize).offset(offset);
        return res.json(paginatedResponse(await buildResult(rows), Number(total), { page, pageSize, offset }));
      }
      const rows = await db.select().from(purchaseOrders).where(whereClause).orderBy(desc(purchaseOrders.poDate), desc(purchaseOrders.id));
      res.json(await buildResult(rows));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/purchase-orders/next-no", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const prefix = String(req.query.prefix || "PO");
      const poNo = await getNextDocNo(companyId, prefix, purchaseOrders, purchaseOrders.poNo, purchaseOrders.companyId, req.query.docDate as string);
      res.json({ poNo });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/purchase-orders/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบสั่งซื้อ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, doc.id));
      let createdByName = "-";
      let updatedByName = "-";
      if (doc.createdBy) { const u = await storage.getUser(doc.createdBy); if (u) createdByName = u.fullName; }
      if (doc.updatedBy) { const u = await storage.getUser(doc.updatedBy); if (u) updatedByName = u.fullName; }
      res.json({ ...doc, items, createdByName, updatedByName });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-orders", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      if (!(await checkDocumentLimit(req, res))) return;
      const { items, ...body } = req.body;
      if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
      else body.creditDays = Number(body.creditDays) || null;
      if (body.vendorId === "" || body.vendorId === undefined) body.vendorId = null;
      else body.vendorId = Number(body.vendorId) || null;
      if (body.bidId === "" || body.bidId === undefined) body.bidId = null;
      else body.bidId = Number(body.bidId) || null;
      const user = req.user as any;
      const companyId = Number(body.companyId);
      if (!companyId || !body.vendorName || !body.poDate) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน (companyId, vendorName, poDate)" });
      }
      const prefix = body.docPrefix || "PO";
      let poNo = body.poNo;
      if (!poNo) {
        poNo = await getNextDocNo(companyId, prefix, purchaseOrders, purchaseOrders.poNo, purchaseOrders.companyId, body.poDate);
      } else {
        const fmtCheck = await validateDocNo(companyId, poNo, prefix, body.poDate);
        if (!fmtCheck.valid) {
          poNo = await getNextDocNo(companyId, prefix, purchaseOrders, purchaseOrders.poNo, purchaseOrders.companyId, body.poDate);
        }
      }
      const result = await db.transaction(async (tx) => {
        const [doc] = await tx.insert(purchaseOrders).values({
          companyId,
          poNo,
          poDate: body.poDate,
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
          deliveryDate: body.deliveryDate || null,
          refDoc: body.refDoc || null,
          bidId: body.bidId,
          subtotal: body.subtotal || "0",
          discountAmount: body.discountAmount || "0",
          vatAmount: body.vatAmount || "0",
          totalAmount: body.totalAmount || "0",
          withholdingTax: body.withholdingTax || "0",
          status: body.status || "approved",
          priceMode: body.priceMode || "excluded",
          docPrefix: prefix,
          notes: body.notes || null,
          salesperson: body.salesperson || null,
          department: body.department || null,
          project: body.project || null,
          warehouse: body.warehouse || null,
          linkJournal: body.linkJournal ?? true,
          createdBy: user.id,
        }).returning();
        if (items && Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            const rawDiscount = String(item.discount || "0");
            const isPercent = rawDiscount.includes("%");
            const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
            await tx.insert(purchaseOrderItems).values({
              purchaseOrderId: doc.id,
              productId: item.productId ? Number(item.productId) : null,
              productCode: item.productCode || null,
              productName: item.productName || "",
              description: item.description || null,
              qty: String(item.qty || "1"),
              unit: item.unit || "ชิ้น",
              unitPrice: String(item.unitPrice || "0"),
              discount: String(discountNum),
              discountType: isPercent ? "percent" : "amount",
              total: String(item.total || "0"),
              vatType: item.vatType || "vat7",
            });
          }
        }
        return doc;
      });
      const savedItems = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, result.id));

      if (body.saveToContacts && !result.vendorId && result.vendorName) {
        try {
          const [existingContact] = await db.select().from(contacts)
            .where(and(
              eq(contacts.companyId, companyId),
              result.vendorTaxId ? eq(contacts.taxId, result.vendorTaxId) : eq(contacts.name, result.vendorName),
              or(eq(contacts.type, "vendor"), eq(contacts.type, "both"))
            )).limit(1);
          if (!existingContact) {
            const nextCode = await storage.getNextContactCode(companyId);
            const [newContact] = await db.insert(contacts).values({
              companyId, code: nextCode, name: result.vendorName, type: "vendor",
              taxId: result.vendorTaxId || null, address: result.vendorAddress || null, branch: result.branch || null,
              phone: body.contactPhone || null, email: body.contactEmail || null, creditDays: result.creditDays || null, active: true,
            }).returning();
            await db.update(purchaseOrders).set({ vendorId: newContact.id }).where(eq(purchaseOrders.id, result.id));
          } else {
            await db.update(purchaseOrders).set({ vendorId: existingContact.id }).where(eq(purchaseOrders.id, result.id));
          }
        } catch (contactErr: any) { console.log("[PO] Auto-save contact failed:", contactErr.message); }
      }

      logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "purchase_order", entityId: String(result.id), entityName: poNo }).catch(() => {});
      res.status(201).json({ ...result, items: savedItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/purchase-orders/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบสั่งซื้อ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const { items, ...body } = req.body;
      const updateData: any = {};
      const allowedFields = [
        "poNo", "poDate", "vendorId", "vendorCode", "vendorName", "vendorOrg",
        "vendorAddress", "vendorTaxId", "branch", "contactEmail", "contactPhone",
        "creditDays", "deliveryDate", "refDoc", "bidId", "subtotal", "discountAmount",
        "vatAmount", "totalAmount", "withholdingTax", "status", "priceMode", "docPrefix",
        "notes", "salesperson", "department", "project", "warehouse", "linkJournal"
      ];
      const integerFields = ["vendorId", "creditDays", "bidId"];
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          if (integerFields.includes(field)) {
            updateData[field] = body[field] !== "" && body[field] !== null && body[field] !== undefined ? Number(body[field]) || null : null;
          } else {
            updateData[field] = body[field];
          }
        }
      }
      const user = req.user as any;
      updateData.updatedBy = user.id;
      updateData.updatedAt = new Date();
      await db.transaction(async (tx) => {
        await tx.update(purchaseOrders).set(updateData).where(eq(purchaseOrders.id, existing.id));
        if (items && Array.isArray(items)) {
          await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, existing.id));
          for (const item of items) {
            const rawDiscount = String(item.discount || "0");
            const isPercent = rawDiscount.includes("%");
            const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
            await tx.insert(purchaseOrderItems).values({
              purchaseOrderId: existing.id,
              productId: item.productId ? Number(item.productId) : null,
              productCode: item.productCode || null,
              productName: item.productName || "",
              description: item.description || null,
              qty: String(item.qty || "1"),
              unit: item.unit || "ชิ้น",
              unitPrice: String(item.unitPrice || "0"),
              discount: String(discountNum),
              discountType: isPercent ? "percent" : "amount",
              total: String(item.total || "0"),
              vatType: item.vatType || "vat7",
            });
          }
        }
      });
      const [updated] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, existing.id));
      const savedItems = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, existing.id));
      res.json({ ...updated, items: savedItems });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/purchase-orders/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบสั่งซื้อ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      await db.transaction(async (tx) => {
        await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, existing.id));
        await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, existing.id));
      });
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-orders/bulk-delete", requireAuth, requireModule("purchases"), requireRole("admin", "owner", "super_admin"), async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "กรุณาระบุรายการที่ต้องการลบ" });
      const user = req.user as any;
      let deleted = 0; const errors: string[] = [];
      for (const id of ids) {
        try {
          const [existing] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, Number(id)));
          if (!existing) { errors.push(`#${id}: ไม่พบ`); continue; }
          await db.transaction(async (tx) => {
            await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, existing.id));
            await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, existing.id));
          });
          logActivity({ companyId: existing.companyId, userId: user.id, userName: user.username, action: "delete", entityType: "purchase_order", entityId: String(existing.id), entityName: existing.poNo }).catch(() => {});
          deleted++;
        } catch (e: any) { errors.push(`#${id}: ${e.message}`); }
      }
      res.json({ deleted, errors, total: ids.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-orders/:id/clone", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบสั่งซื้อ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, doc.id));
      const prefix = doc.docPrefix || "PO";
      const poNo = await getNextDocNo(doc.companyId, prefix, purchaseOrders, purchaseOrders.poNo, purchaseOrders.companyId, doc.poDate);
      const user = req.user as any;
      const result = await db.transaction(async (tx) => {
        const [cloned] = await tx.insert(purchaseOrders).values({
          companyId: doc.companyId, poNo, poDate: new Date().toISOString().split("T")[0],
          vendorId: doc.vendorId, vendorCode: doc.vendorCode, vendorName: doc.vendorName,
          vendorOrg: doc.vendorOrg, vendorAddress: doc.vendorAddress, vendorTaxId: doc.vendorTaxId,
          branch: doc.branch, contactEmail: doc.contactEmail, contactPhone: doc.contactPhone,
          creditDays: doc.creditDays, deliveryDate: doc.deliveryDate, refDoc: doc.refDoc,
          subtotal: doc.subtotal, discountAmount: doc.discountAmount, vatAmount: doc.vatAmount,
          totalAmount: doc.totalAmount, withholdingTax: doc.withholdingTax,
          status: "approved", priceMode: doc.priceMode, docPrefix: doc.docPrefix,
          notes: doc.notes, linkJournal: doc.linkJournal, warehouse: doc.warehouse,
          salesperson: doc.salesperson, department: doc.department, project: doc.project,
          createdBy: user.id,
        }).returning();
        for (const it of items) {
          await tx.insert(purchaseOrderItems).values({
            purchaseOrderId: cloned.id, productId: it.productId,
            productCode: it.productCode, productName: it.productName,
            description: it.description, qty: it.qty, unit: it.unit,
            unitPrice: it.unitPrice, discount: it.discount, discountType: it.discountType,
            total: it.total, vatType: it.vatType,
          });
        }
        return cloned;
      });
      res.status(200).json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-orders/:id/share", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบสั่งซื้อ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      let token = doc.shareToken;
      if (!token) {
        const { randomBytes } = await import("crypto");
        token = randomBytes(24).toString("hex");
        await db.update(purchaseOrders).set({ shareToken: token }).where(eq(purchaseOrders.id, doc.id));
      }
      res.json({ shareToken: token });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ============ Purchase Invoices ============

  app.get("/api/purchase-invoices", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const whereClause = eq(purchaseInvoices.companyId, companyId);
      const buildResult = async (rows: any[]) => {
        const userIds = Array.from(new Set(rows.map((r: any) => r.createdBy).concat(rows.map((r: any) => r.updatedBy)).filter(Boolean))) as number[];
        const userMap: Record<number, string> = {};
        for (const uid of userIds) { const u = await storage.getUser(uid); if (u) userMap[uid] = u.username; }
        return rows.map((r: any) => ({ ...r, createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-", updatedByName: r.updatedBy ? userMap[r.updatedBy] || "-" : "-" }));
      };
      if (req.query.page) {
        const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
        const [{ total }] = await db.select({ total: count() }).from(purchaseInvoices).where(whereClause);
        const rows = await db.select().from(purchaseInvoices).where(whereClause).orderBy(desc(purchaseInvoices.apDate), desc(purchaseInvoices.id)).limit(pageSize).offset(offset);
        return res.json(paginatedResponse(await buildResult(rows), Number(total), { page, pageSize, offset }));
      }
      const rows = await db.select().from(purchaseInvoices).where(whereClause).orderBy(desc(purchaseInvoices.apDate), desc(purchaseInvoices.id));
      res.json(await buildResult(rows));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/purchase-invoices/next-no", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const prefix = String(req.query.prefix || "AP");
      const apNo = await getNextDocNo(companyId, prefix, purchaseInvoices, purchaseInvoices.apNo, purchaseInvoices.companyId, req.query.docDate as string);
      res.json({ apNo });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/purchase-invoices/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้ซื้อ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const items = await fetchPurchaseInvoiceItems(doc.id);
      let createdByName = "-";
      let updatedByName = "-";
      if (doc.createdBy) { const u = await storage.getUser(doc.createdBy); if (u) createdByName = u.fullName; }
      if (doc.updatedBy) { const u = await storage.getUser(doc.updatedBy); if (u) updatedByName = u.fullName; }
      res.json({ ...doc, items, createdByName, updatedByName });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-invoices", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const { items, ...body } = req.body;
      if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
      else body.creditDays = Number(body.creditDays) || null;
      if (body.vendorId === "" || body.vendorId === undefined) body.vendorId = null;
      else body.vendorId = Number(body.vendorId) || null;
      if (body.poId === "" || body.poId === undefined) body.poId = null;
      else body.poId = Number(body.poId) || null;
      const user = req.user as any;
      const companyId = Number(body.companyId);
      if (!companyId || !body.vendorName || !body.apDate) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน (companyId, vendorName, apDate)" });
      }
      const prefix = body.docPrefix || "AP";
      let apNo = body.apNo;
      if (!apNo) {
        apNo = await getNextDocNo(companyId, prefix, purchaseInvoices, purchaseInvoices.apNo, purchaseInvoices.companyId, body.apDate);
      } else {
        const fmtCheck = await validateDocNo(companyId, apNo, prefix, body.apDate);
        if (!fmtCheck.valid) {
          apNo = await getNextDocNo(companyId, prefix, purchaseInvoices, purchaseInvoices.apNo, purchaseInvoices.companyId, body.apDate);
        }
      }
      if (body.taxInvoiceRef && body.taxInvoiceRef.trim()) {
        const [dupTaxRef] = await db.select({ id: purchaseInvoices.id, apNo: purchaseInvoices.apNo }).from(purchaseInvoices)
          .where(and(eq(purchaseInvoices.companyId, companyId), eq(purchaseInvoices.taxInvoiceRef, body.taxInvoiceRef.trim())))
          .limit(1);
        if (dupTaxRef) {
          return res.status(409).json({ message: `เลขที่ใบกำกับภาษีซื้อ "${body.taxInvoiceRef}" ซ้ำกับเอกสาร ${dupTaxRef.apNo}`, field: "taxInvoiceRef" });
        }
        const [dupExpTaxRef] = await db.select({ id: expenses.id, expNo: expenses.expNo }).from(expenses)
          .where(and(eq(expenses.companyId, companyId), eq(expenses.taxInvoiceRef, body.taxInvoiceRef.trim())))
          .limit(1);
        if (dupExpTaxRef) {
          return res.status(409).json({ message: `เลขที่ใบกำกับภาษีซื้อ "${body.taxInvoiceRef}" ซ้ำกับค่าใช้จ่าย ${dupExpTaxRef.expNo}`, field: "taxInvoiceRef" });
        }
      }
      const result = await db.transaction(async (tx) => {
        const [doc] = await tx.insert(purchaseInvoices).values({
          companyId,
          apNo,
          apDate: body.apDate,
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
          paymentStatus: body.paymentStatus || (body.paymentMethod && !isCreditPm(body.paymentMethod) ? "paid" : "unpaid"),
          priceMode: body.priceMode || "excluded",
          showInTaxReport: body.showInTaxReport !== undefined ? body.showInTaxReport : (items?.length > 0 && items.every((i: any) => i.vatType === "vat_non_deductible" || i.vatType === "exempt" || i.vatType === "vat0") && items.some((i: any) => i.vatType === "vat_non_deductible") ? false : true),
          docPrefix: prefix,
          refDoc: body.refDoc || null,
          poId: body.poId,
          notes: body.notes || null,
          salesperson: body.salesperson || null,
          department: body.department || null,
          project: body.project || null,
          warehouse: body.warehouse || null,
          paymentMethod: body.paymentMethod || null,
          attachedUrl: body.attachedUrl || null,
          linkJournal: body.linkJournal ?? true,
          createdBy: user.id,
        }).returning();
        if (items && Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            const rawDiscount = String(item.discount || "0");
            const isPercent = rawDiscount.includes("%");
            const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
            const insertedPI = await tx.insert(purchaseInvoiceItems).values({
              purchaseInvoiceId: doc.id,
              productId: item.productId ? Number(item.productId) : null,
              productCode: item.productCode || null,
              productName: item.productName || "",
              description: item.description || null,
              qty: String(item.qty || "1"),
              unit: item.unit || "ชิ้น",
              unitPrice: String(item.unitPrice || "0"),
              discount: String(discountNum),
              discountType: isPercent ? "percent" : "amount",
              total: String(item.total || "0"),
              vatType: item.vatType || "vat7",
              accountCode: item.accountCode || null,
              accountName: item.accountName || null,
            }).returning({ id: purchaseInvoiceItems.id });
            // warehouse_id: column not in schema.ts, patch via raw SQL
            if (item.warehouseId) {
              await tx.execute(sql`UPDATE purchase_invoice_items SET warehouse_id = ${Number(item.warehouseId)} WHERE id = ${insertedPI[0].id}`);
            }
          }
        }
        for (const item of (items || [])) {
          if (item.productId && Number(item.unitPrice) > 0) {
            await tx.update(products).set({ cost: String(item.unitPrice) }).where(and(eq(products.id, Number(item.productId)), eq(products.companyId, companyId)));
          }
        }
        return doc;
      });
      const savedItems = await fetchPurchaseInvoiceItems(result.id);

      console.log("[PI] saveToContacts check:", { saveToContacts: body.saveToContacts, vendorId: result.vendorId, vendorName: result.vendorName, vendorTaxId: result.vendorTaxId });
      if (body.saveToContacts && !result.vendorId && result.vendorName) {
        try {
          const [existing] = await db.select().from(contacts)
            .where(and(
              eq(contacts.companyId, companyId),
              result.vendorTaxId
                ? eq(contacts.taxId, result.vendorTaxId)
                : eq(contacts.name, result.vendorName),
              or(eq(contacts.type, "vendor"), eq(contacts.type, "both"))
            )).limit(1);
          if (!existing) {
            const nextCode = await storage.getNextContactCode(companyId);
            console.log("[PI] Creating new contact:", { code: nextCode, name: result.vendorName, type: "vendor" });
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
            await db.update(purchaseInvoices).set({ vendorId: newContact.id }).where(eq(purchaseInvoices.id, result.id));
            (result as any).vendorId = newContact.id;
            (result as any).savedContactId = newContact.id;
            console.log("[PI] Contact created:", newContact.id, newContact.code);
          } else {
            await db.update(purchaseInvoices).set({ vendorId: existing.id }).where(eq(purchaseInvoices.id, result.id));
            (result as any).vendorId = existing.id;
            (result as any).savedContactId = existing.id;
            console.log("[PI] Contact already exists:", existing.id, existing.code);
          }
        } catch (contactErr: any) {
          console.log("[PI] Auto-save contact FAILED:", contactErr.message, contactErr.stack);
        }
      } else {
        console.log("[PI] saveToContacts skipped:", { saveToContacts: body.saveToContacts, hasVendorId: !!result.vendorId, hasVendorName: !!result.vendorName });
      }

      let journalResult = null;
      if (result.linkJournal) {
        try {
          const pmAccCode = await resolvePaymentMethodAccountCode(result.companyId, result.paymentMethod);
          const itemDescs = savedItems.map((i: any) => i.description).filter(Boolean);
          const itemAccounts = savedItems
            .filter((i: any) => i.accountCode)
            .map((i: any) => ({ accountCode: i.accountCode, accountName: i.accountName || "", amount: parseFloat(i.total || "0"), description: i.description || "" }));

          const hasNonDeductible = savedItems.some((i: any) => i.vatType === "vat_non_deductible");
          let overrideLines = body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined;

          if (hasNonDeductible && !overrideLines) {
            const compAccts = await db.select().from(accounts).where(eq(accounts.companyId, result.companyId));
            const acctMap = new Map(compAccts.map(a => [a.code, a]));
            const sub = parseFloat(result.subtotal || "0");
            const wht = parseFloat(result.withholdingTax || "0");
            const isCreditPayment = isCreditPm(result.paymentMethod);

            const deductibleItems = savedItems.filter((i: any) => i.vatType === "vat7");
            const nonDeductibleItems = savedItems.filter((i: any) => i.vatType === "vat_non_deductible");
            const deductibleVat = deductibleItems.reduce((s: number, i: any) => s + parseFloat(i.total || "0"), 0) * 0.07;
            const nonDeductibleVat = nonDeductibleItems.reduce((s: number, i: any) => s + parseFloat(i.total || "0"), 0) * 0.07;

            const jL: Array<{ accountCode: string; accountName: string; debit: string; credit: string }> = [];

            const grouped: Record<string, { code: string; name: string; amount: number }> = {};
            let rawT = 0;
            for (const it of savedItems) {
              const c = (it as any).accountCode || "5101000"; const n = (it as any).accountName || "สินค้า/วัตถุดิบ";
              let a = parseFloat(it.total || "0");
              if ((it as any).vatType === "vat_non_deductible") {
                a = a + (a * 0.07);
              }
              if (!grouped[c]) grouped[c] = { code: c, name: n, amount: 0 };
              grouped[c].amount += a; rawT += a;
            }
            const totalExpenseAmount = rawT > 0 ? Object.values(grouped).reduce((s, g) => s + g.amount, 0) : 0;
            const expScale = totalExpenseAmount > 0 ? (sub + nonDeductibleVat) / totalExpenseAmount : 1;
            for (const g of Object.values(grouped)) {
              const adj = parseFloat((g.amount * expScale).toFixed(2));
              jL.push({ accountCode: g.code, accountName: g.name, debit: adj.toFixed(2), credit: "0.00" });
            }
            if (deductibleVat > 0) {
              const ivA = compAccts.find(a => a.code.length >= 7 && (a.name === "Input VAT" || a.nameTh === "ภาษีซื้อ"));
              jL.push({ accountCode: ivA?.code || "1432000", accountName: ivA?.nameTh || "ภาษีซื้อ", debit: deductibleVat.toFixed(2), credit: "0.00" });
            }
            if (wht > 0) {
              const wA = acctMap.get("2346000") || acctMap.get("2344000");
              jL.push({ accountCode: wA?.code || "2344000", accountName: wA?.nameTh || "ภาษีหัก ณ ที่จ่าย", debit: "0.00", credit: wht.toFixed(2) });
            }
            const cashTotal = sub + deductibleVat + nonDeductibleVat - wht;
            if (isCreditPayment) {
              const apA = acctMap.get("2101000");
              jL.push({ accountCode: apA?.code || "2101000", accountName: apA?.nameTh || "เจ้าหนี้การค้า", debit: "0.00", credit: cashTotal.toFixed(2) });
            } else {
              const cashCode = pmAccCode || "1001000";
              const cashA = acctMap.get(cashCode);
              jL.push({ accountCode: cashA?.code || cashCode, accountName: cashA?.nameTh || "เงินสด", debit: "0.00", credit: cashTotal.toFixed(2) });
            }
            overrideLines = jL;
          }

          journalResult = await createAutoJournalEntry({
            companyId: result.companyId,
            documentType: "purchase",
            sourceDocType: "purchase_invoice",
            sourceDocId: result.id,
            docDate: result.apDate,
            docNo: result.apNo,
            subtotal: String(result.subtotal),
            vatAmount: String(result.vatAmount),
            totalAmount: String(result.totalAmount),
            withholdingTax: String(result.withholdingTax || "0"),
            userId: user.id,
            customerName: result.vendorName,
            paymentMethod: result.paymentMethod || undefined,
            paymentMethodAccountCode: pmAccCode,
            lineItemDescriptions: itemDescs.length > 0 ? itemDescs : undefined,
            lineItemAccounts: itemAccounts.length > 0 ? itemAccounts : undefined,
            overrideLines,
          });
        } catch (e: any) {
          console.error("[PI] Auto journal entry failed:", e?.message || e);
        }
      }

      try {
        const [piCompany] = await db.select({ stockEntrySource: companies.stockEntrySource }).from(companies).where(eq(companies.id, companyId));

        if (piCompany?.stockEntrySource === "purchase_invoice") {
          for (const item of savedItems) {
            if (!item.productId) continue;
            const qty = parseFloat(item.qty || "1") || 0;
            if (qty <= 0) continue;
            const uc = parseFloat(item.unitPrice || "0") || 0;
            const tc = qty * uc;
            await db.insert(stockMovements).values({
              companyId,
              productId: item.productId,
              movementType: "goods_in",
              quantity: String(qty),
              unitCost: String(uc),
              totalCost: String(tc),
              referenceType: "purchase_invoice",
              referenceId: result.id,
              referenceNo: result.apNo,
              createdBy: (req.user as any)?.id,
            });
            const [existingStock] = await db.select().from(productStock).where(and(eq(productStock.companyId, companyId), eq(productStock.productId, item.productId)));
            if (existingStock) {
              await db.update(productStock).set({ quantity: sql`CAST(${productStock.quantity} AS numeric) + ${qty}` }).where(eq(productStock.id, existingStock.id));
            } else {
              await db.insert(productStock).values({ companyId, productId: item.productId, quantity: String(qty) });
            }
            const piCreateTriggers = await getInventoryTriggers(companyId);
            if ((item as any).warehouseId && piCreateTriggers.purchase_invoice_stock) {
              await upsertWarehouseStockLevel(companyId, item.productId, Number((item as any).warehouseId), qty);
            }
          }
          await recalcBundleStock(companyId);
          await recalcBomStock(companyId);
        }
      } catch (stockErr: any) { console.error("PI stock entry error:", stockErr.message); }

      logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "purchase_invoice", entityId: String(result.id), entityName: result.invoiceNo || "" }).catch(() => {});
      res.status(201).json({ ...result, items: savedItems, journalResult });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/purchase-invoices/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้ซื้อ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const { items, ...body } = req.body;
      const updateData: any = {};
      const allowedFields = [
        "apNo", "apDate", "dueDate", "vendorId", "vendorCode", "vendorName", "vendorOrg",
        "vendorAddress", "vendorTaxId", "branch", "contactEmail", "contactPhone",
        "creditDays", "taxInvoiceRef", "formulaCode", "subtotal", "discountAmount",
        "vatAmount", "totalAmount", "withholdingTax", "status", "paymentStatus",
        "priceMode", "showInTaxReport", "docPrefix", "refDoc", "poId", "notes",
        "salesperson", "department", "project", "warehouse", "paymentMethod", "attachedUrl", "linkJournal"
      ];
      const integerFields = ["vendorId", "creditDays", "poId"];
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          if (integerFields.includes(field)) {
            updateData[field] = body[field] !== "" && body[field] !== null && body[field] !== undefined ? Number(body[field]) || null : null;
          } else {
            updateData[field] = body[field];
          }
        }
      }
      if (updateData.apNo && updateData.apNo !== existing.apNo) {
        const prefix = updateData.docPrefix || existing.docPrefix || "AP";
        const fmtCheck = await validateDocNo(existing.companyId, updateData.apNo, prefix, updateData.apDate || existing.apDate);
        if (!fmtCheck.valid) return res.status(400).json({ message: fmtCheck.message, field: "apNo" });
      }
      if (updateData.taxInvoiceRef && updateData.taxInvoiceRef.trim() && updateData.taxInvoiceRef !== existing.taxInvoiceRef) {
        const [dupTaxRef] = await db.select({ id: purchaseInvoices.id, apNo: purchaseInvoices.apNo }).from(purchaseInvoices)
          .where(and(eq(purchaseInvoices.companyId, existing.companyId), eq(purchaseInvoices.taxInvoiceRef, updateData.taxInvoiceRef.trim()), not(eq(purchaseInvoices.id, existing.id))))
          .limit(1);
        if (dupTaxRef) {
          return res.status(409).json({ message: `เลขที่ใบกำกับภาษีซื้อ "${updateData.taxInvoiceRef}" ซ้ำกับเอกสาร ${dupTaxRef.apNo}`, field: "taxInvoiceRef" });
        }
        const [dupExpTaxRef] = await db.select({ id: expenses.id, expNo: expenses.expNo }).from(expenses)
          .where(and(eq(expenses.companyId, existing.companyId), eq(expenses.taxInvoiceRef, updateData.taxInvoiceRef.trim())))
          .limit(1);
        if (dupExpTaxRef) {
          return res.status(409).json({ message: `เลขที่ใบกำกับภาษีซื้อ "${updateData.taxInvoiceRef}" ซ้ำกับค่าใช้จ่าย ${dupExpTaxRef.expNo}`, field: "taxInvoiceRef" });
        }
      }
      const user = req.user as any;
      updateData.updatedBy = user.id;
      updateData.updatedAt = new Date();
      await db.transaction(async (tx) => {
        await tx.update(purchaseInvoices).set(updateData).where(eq(purchaseInvoices.id, existing.id));
        if (items && Array.isArray(items)) {
          await tx.delete(purchaseInvoiceItems).where(eq(purchaseInvoiceItems.purchaseInvoiceId, existing.id));
          for (const item of items) {
            const rawDiscount = String(item.discount || "0");
            const isPercent = rawDiscount.includes("%");
            const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
            await tx.insert(purchaseInvoiceItems).values({
              purchaseInvoiceId: existing.id,
              productId: item.productId ? Number(item.productId) : null,
              productCode: item.productCode || null,
              productName: item.productName || "",
              description: item.description || null,
              qty: String(item.qty || "1"),
              unit: item.unit || "ชิ้น",
              unitPrice: String(item.unitPrice || "0"),
              discount: String(discountNum),
              discountType: isPercent ? "percent" : "amount",
              total: String(item.total || "0"),
              vatType: item.vatType || "vat7",
              accountCode: item.accountCode || null,
              accountName: item.accountName || null,
            });
          }
          for (const item of items) {
            if (item.productId && Number(item.unitPrice) > 0) {
              await tx.update(products).set({ cost: String(item.unitPrice) }).where(and(eq(products.id, Number(item.productId)), eq(products.companyId, existing.companyId)));
            }
          }
        }
      });
      const [updated] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, existing.id));
      const savedItems = await fetchPurchaseInvoiceItems(existing.id);

      if (body.saveToContacts && !updated.vendorId && updated.vendorName) {
        try {
          const [existingContact] = await db.select().from(contacts)
            .where(and(
              eq(contacts.companyId, updated.companyId),
              updated.vendorTaxId
                ? eq(contacts.taxId, updated.vendorTaxId)
                : eq(contacts.name, updated.vendorName),
              or(eq(contacts.type, "vendor"), eq(contacts.type, "both"))
            )).limit(1);
          if (!existingContact) {
            const nextCode = await storage.getNextContactCode(updated.companyId);
            const [newContact] = await db.insert(contacts).values({
              companyId: updated.companyId,
              code: nextCode,
              name: updated.vendorName,
              type: "vendor",
              taxId: updated.vendorTaxId || null,
              address: updated.vendorAddress || null,
              branch: updated.branch || null,
              phone: body.contactPhone || null,
              email: body.contactEmail || null,
              creditDays: updated.creditDays || null,
              active: true,
            }).returning();
            await db.update(purchaseInvoices).set({ vendorId: newContact.id }).where(eq(purchaseInvoices.id, updated.id));
          } else {
            await db.update(purchaseInvoices).set({ vendorId: existingContact.id }).where(eq(purchaseInvoices.id, updated.id));
          }
        } catch (contactErr: any) {
          console.log("[PI-PATCH] Auto-save contact failed:", contactErr.message);
        }
      }

      let journalResult = null;
      const statusChanged = body.status && body.status !== existing.status;
      const effectiveLinkJournal = updated.linkJournal !== false;
      const shouldCreatePurchaseJournal = ((statusChanged && body.status === "approved") || updated.status === "approved") && effectiveLinkJournal;
      if (shouldCreatePurchaseJournal) {
        try {
          await deleteJournalEntriesForDoc(db, "purchase_invoice", updated.id);
          const pmAccCode = await resolvePaymentMethodAccountCode(updated.companyId, updated.paymentMethod);
          const itemDescs = savedItems.map((i: any) => i.description).filter(Boolean);
          const itemAccounts = savedItems
            .filter((i: any) => i.accountCode)
            .map((i: any) => ({ accountCode: i.accountCode, accountName: i.accountName || "", amount: parseFloat(i.total || "0"), description: i.description || "" }));

          const hasNonDeductible = savedItems.some((i: any) => i.vatType === "vat_non_deductible");
          let overrideLines = body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined;

          if (hasNonDeductible && !overrideLines) {
            const compAccts = await db.select().from(accounts).where(eq(accounts.companyId, updated.companyId));
            const acctMap = new Map(compAccts.map(a => [a.code, a]));
            const sub = parseFloat(updated.subtotal || "0");
            const wht = parseFloat(updated.withholdingTax || "0");
            const isCreditPayment = isCreditPm(updated.paymentMethod);

            const deductibleItems = savedItems.filter((i: any) => i.vatType === "vat7");
            const nonDeductibleItems = savedItems.filter((i: any) => i.vatType === "vat_non_deductible");
            const deductibleVat = deductibleItems.reduce((s: number, i: any) => s + parseFloat(i.total || "0"), 0) * 0.07;
            const nonDeductibleVat = nonDeductibleItems.reduce((s: number, i: any) => s + parseFloat(i.total || "0"), 0) * 0.07;

            const jL: Array<{ accountCode: string; accountName: string; debit: string; credit: string }> = [];

            const grouped: Record<string, { code: string; name: string; amount: number }> = {};
            let rawT = 0;
            for (const it of savedItems) {
              const c = (it as any).accountCode || "5101000"; const n = (it as any).accountName || "สินค้า/วัตถุดิบ";
              let a = parseFloat(it.total || "0");
              if ((it as any).vatType === "vat_non_deductible") {
                a = a + (a * 0.07);
              }
              if (!grouped[c]) grouped[c] = { code: c, name: n, amount: 0 };
              grouped[c].amount += a; rawT += a;
            }
            const totalExpenseAmount = rawT > 0 ? Object.values(grouped).reduce((s, g) => s + g.amount, 0) : 0;
            const expScale = totalExpenseAmount > 0 ? (sub + nonDeductibleVat) / totalExpenseAmount : 1;
            for (const g of Object.values(grouped)) {
              const adj = parseFloat((g.amount * expScale).toFixed(2));
              jL.push({ accountCode: g.code, accountName: g.name, debit: adj.toFixed(2), credit: "0.00" });
            }
            if (deductibleVat > 0) {
              const ivA = compAccts.find(a => a.code.length >= 7 && (a.name === "Input VAT" || a.nameTh === "ภาษีซื้อ"));
              jL.push({ accountCode: ivA?.code || "1432000", accountName: ivA?.nameTh || "ภาษีซื้อ", debit: deductibleVat.toFixed(2), credit: "0.00" });
            }
            if (wht > 0) {
              const wA = acctMap.get("2346000") || acctMap.get("2344000");
              jL.push({ accountCode: wA?.code || "2344000", accountName: wA?.nameTh || "ภาษีหัก ณ ที่จ่าย", debit: "0.00", credit: wht.toFixed(2) });
            }
            const cashTotal = sub + deductibleVat + nonDeductibleVat - wht;
            if (isCreditPayment) {
              const apA = acctMap.get("2101000");
              jL.push({ accountCode: apA?.code || "2101000", accountName: apA?.nameTh || "เจ้าหนี้การค้า", debit: "0.00", credit: cashTotal.toFixed(2) });
            } else {
              const cashCode = pmAccCode || "1001000";
              const cashA = acctMap.get(cashCode);
              jL.push({ accountCode: cashA?.code || cashCode, accountName: cashA?.nameTh || "เงินสด", debit: "0.00", credit: cashTotal.toFixed(2) });
            }
            overrideLines = jL;
          }

          journalResult = await createAutoJournalEntry({
            companyId: updated.companyId,
            documentType: "purchase",
            sourceDocType: "purchase_invoice",
            sourceDocId: updated.id,
            docDate: updated.apDate,
            docNo: updated.apNo,
            subtotal: String(updated.subtotal),
            vatAmount: String(updated.vatAmount),
            totalAmount: String(updated.totalAmount),
            withholdingTax: String(updated.withholdingTax || "0"),
            userId: user.id,
            customerName: updated.vendorName,
            paymentMethod: updated.paymentMethod || undefined,
            paymentMethodAccountCode: pmAccCode,
            lineItemDescriptions: itemDescs.length > 0 ? itemDescs : undefined,
            lineItemAccounts: itemAccounts.length > 0 ? itemAccounts : undefined,
            overrideLines,
          });
        } catch (e: any) {
          console.error("[PI-update] Auto journal entry failed:", e?.message || e);
        }
      }

      if (items && Array.isArray(items)) {
        try {
          const [piCompany] = await db.select({ stockEntrySource: companies.stockEntrySource }).from(companies).where(eq(companies.id, existing.companyId));
          if (piCompany?.stockEntrySource === "purchase_invoice") {
            const piUpdateTriggers = await getInventoryTriggers(existing.companyId);
            // Reverse old warehouseStockLevels contributions before deleting movements
            const oldItems = await db.execute(sql`SELECT product_id, qty, warehouse_id FROM purchase_invoice_items WHERE purchase_invoice_id = ${existing.id}`);
            for (const oi of oldItems.rows as any[]) {
              if (oi.warehouse_id && oi.product_id && piUpdateTriggers.purchase_invoice_stock) {
                const oldQty = parseFloat(oi.qty || "0") || 0;
                if (oldQty > 0) await upsertWarehouseStockLevel(existing.companyId, oi.product_id, oi.warehouse_id, -oldQty);
              }
            }
            await deleteStockMovementsForDoc(db, "purchase_invoice", existing.id);
            for (const item of savedItems) {
              if (!item.productId) continue;
              const qty = parseFloat(item.qty || "1") || 0;
              if (qty <= 0) continue;
              const uc = parseFloat(item.unitPrice || "0") || 0;
              const tc = qty * uc;
              await db.insert(stockMovements).values({
                companyId: existing.companyId,
                productId: item.productId,
                movementType: "goods_in",
                quantity: String(qty),
                unitCost: String(uc),
                totalCost: String(tc),
                referenceType: "purchase_invoice",
                referenceId: existing.id,
                referenceNo: updated.apNo,
                createdBy: user.id,
              });
              const [existingStock] = await db.select().from(productStock).where(and(eq(productStock.companyId, existing.companyId), eq(productStock.productId, item.productId)));
              if (existingStock) {
                await db.update(productStock).set({ quantity: sql`CAST(${productStock.quantity} AS numeric) + ${qty}` }).where(eq(productStock.id, existingStock.id));
              } else {
                await db.insert(productStock).values({ companyId: existing.companyId, productId: item.productId, quantity: String(qty) });
              }
              if ((item as any).warehouseId && piUpdateTriggers.purchase_invoice_stock) {
                await upsertWarehouseStockLevel(existing.companyId, item.productId, Number((item as any).warehouseId), qty);
              }
            }
            await recalcBundleStock(existing.companyId);
            await recalcBomStock(existing.companyId);
          }
        } catch (stockErr: any) { console.error("PI update stock entry error:", stockErr.message); }
      }

      const [finalDoc] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, existing.id));
      res.json({ ...finalDoc, items: savedItems, journalResult });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/purchase-invoices/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [existing] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, Number(req.params.id)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้ซื้อ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const piItems = await fetchPurchaseInvoiceItems(existing.id);
      await db.transaction(async (tx) => {
        await deleteJournalEntriesForDoc(tx, "purchase_invoice", existing.id);
        await deleteStockMovementsForDoc(tx, "purchase_invoice", existing.id);
        await tx.delete(purchaseInvoiceItems).where(eq(purchaseInvoiceItems.purchaseInvoiceId, existing.id));
        await tx.delete(purchaseInvoices).where(eq(purchaseInvoices.id, existing.id));
      });
      const piDelTriggers = await getInventoryTriggers(existing.companyId);
      for (const item of piItems) {
        if (item.warehouseId && item.productId && item.qty && piDelTriggers.purchase_invoice_stock) {
          await upsertWarehouseStockLevel(existing.companyId, item.productId, item.warehouseId, -Number(item.qty));
        }
      }
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-invoices/bulk-delete", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "กรุณาเลือกรายการที่ต้องการลบ" });
      }
      let deleted = 0;
      let errors: { id: number; error: string }[] = [];
      for (const id of ids) {
        try {
          const [existing] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, Number(id)));
          if (!existing) { errors.push({ id, error: "ไม่พบเอกสาร" }); continue; }
          const bulkPiItems = await fetchPurchaseInvoiceItems(existing.id);
          await db.transaction(async (tx) => {
            await deleteJournalEntriesForDoc(tx, "purchase_invoice", existing.id);
            await deleteStockMovementsForDoc(tx, "purchase_invoice", existing.id);
            await tx.delete(purchaseInvoiceItems).where(eq(purchaseInvoiceItems.purchaseInvoiceId, existing.id));
            await tx.delete(purchaseInvoices).where(eq(purchaseInvoices.id, existing.id));
          });
          const bulkPiDelTriggers = await getInventoryTriggers(existing.companyId);
          for (const item of bulkPiItems) {
            if (item.warehouseId && item.productId && item.qty && bulkPiDelTriggers.purchase_invoice_stock) {
              await upsertWarehouseStockLevel(existing.companyId, item.productId, item.warehouseId, -Number(item.qty));
            }
          }
          deleted++;
        } catch (err: any) {
          errors.push({ id, error: err.message });
        }
      }
      res.json({ deleted, errors, total: ids.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-invoices/:id/clone", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบเอกสารซื้อ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const items = await fetchPurchaseInvoiceItems(doc.id);
      const prefix = doc.docPrefix || "AP";
      const apNo = await getNextDocNo(doc.companyId, prefix, purchaseInvoices, purchaseInvoices.apNo, purchaseInvoices.companyId, doc.apDate);
      const user = req.user as any;
      const result = await db.transaction(async (tx) => {
        const [cloned] = await tx.insert(purchaseInvoices).values({
          companyId: doc.companyId, apNo, apDate: new Date().toISOString().split("T")[0],
          dueDate: doc.dueDate, vendorId: doc.vendorId, vendorCode: doc.vendorCode,
          vendorName: doc.vendorName, vendorOrg: doc.vendorOrg, vendorAddress: doc.vendorAddress,
          vendorTaxId: doc.vendorTaxId, branch: doc.branch, contactEmail: doc.contactEmail,
          contactPhone: doc.contactPhone, creditDays: doc.creditDays, taxInvoiceRef: doc.taxInvoiceRef,
          formulaCode: doc.formulaCode, subtotal: doc.subtotal, discountAmount: doc.discountAmount,
          vatAmount: doc.vatAmount, totalAmount: doc.totalAmount, withholdingTax: doc.withholdingTax,
          status: "approved", paymentStatus: "unpaid", priceMode: doc.priceMode,
          showInTaxReport: doc.showInTaxReport, docPrefix: doc.docPrefix,
          refDoc: doc.refDoc, notes: doc.notes, linkJournal: doc.linkJournal,
          warehouse: doc.warehouse, salesperson: doc.salesperson,
          department: doc.department, project: doc.project,
          createdBy: user.id,
        }).returning();
        for (const it of items) {
          await tx.insert(purchaseInvoiceItems).values({
            purchaseInvoiceId: cloned.id, productId: it.productId,
            productCode: it.productCode, productName: it.productName,
            description: it.description, qty: it.qty, unit: it.unit,
            unitPrice: it.unitPrice, discount: it.discount, discountType: it.discountType,
            total: it.total, vatType: it.vatType,
          });
        }
        return cloned;
      });
      res.status(200).json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-invoices/:id/share", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const [doc] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบเอกสารซื้อ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      let token = doc.shareToken;
      if (!token) {
        const { randomBytes } = await import("crypto");
        token = randomBytes(24).toString("hex");
        await db.update(purchaseInvoices).set({ shareToken: token }).where(eq(purchaseInvoices.id, doc.id));
      }
      res.json({ shareToken: token });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ============ PDF/Image AI Import ============

  const uploadPdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  const handleMulterUpload = (req: any, res: any, next: any) => {
    const upload = uploadPdf.array("files", 31);
    upload(req, res, (err: any) => {
      if (err) {
        console.error("[pdf-import] Multer error:", err.message, err.code);
        return res.status(400).json({ message: `อัพโหลดไฟล์ไม่สำเร็จ: ${err.message}` });
      }
      console.log("[pdf-import] Files received:", req.files?.length || 0, "files, body keys:", Object.keys(req.body || {}));
      next();
    });
  };

  const PDF_EXTRACT_PROMPT_BASE = `คุณคือระบบ OCR อัจฉริยะสำหรับอ่านใบกำกับภาษี/ใบแจ้งหนี้/ใบเสร็จรับเงินภาษาไทย
ให้อ่านข้อมูลจากภาพและส่งกลับเป็น JSON เท่านั้น ห้ามมี text อื่น

ส่งกลับ JSON ตามรูปแบบนี้:
{
  "vendorName": "ชื่อบริษัท/ร้านค้า/ผู้ออกเอกสาร (ชื่อเต็มตามที่ปรากฏ รวม บริษัท/ห้างหุ้นส่วน/จำกัด)",
  "vendorTaxId": "เลขประจำตัวผู้เสียภาษี 13 หลัก",
  "vendorAddress": "ที่อยู่ผู้จำหน่าย",
  "branch": "สาขา (เช่น สำนักงานใหญ่ หรือ สาขาที่ xxx)",
  "docNo": "เลขที่เอกสาร/ใบกำกับภาษี",
  "docDate": "วันที่เอกสาร รูปแบบ DD/MM/YYYY (พ.ศ.)",
  "dueDate": "วันครบกำหนด (ถ้ามี) DD/MM/YYYY (พ.ศ.)",
  "items": [
    {
      "description": "รายละเอียดสินค้า/บริการ",
      "qty": 1,
      "unit": "หน่วย",
      "unitPrice": 0.00,
      "discount": 0.00,
      "total": 0.00,
      "vatType": "vat7 หรือ non_vat หรือ zero_rated",
      "suggestedAccountCode": "รหัสบัญชี (เลือกจากผังบัญชีที่ให้)",
      "accountConfidence": "high หรือ medium หรือ low"
    }
  ],
  "subtotal": 0.00,
  "vatAmount": 0.00,
  "totalAmount": 0.00,
  "withholdingTax": 0.00,
  "notes": "หมายเหตุ (ถ้ามี)",
  "confidence": "high หรือ medium หรือ low"
}

กฎ:
- vendorName: ต้องเป็นชื่อบริษัท/ร้านค้าที่ออกเอกสาร (ผู้ขาย/ผู้ให้บริการ) ไม่ใช่ชื่อผู้ซื้อ
  - ดูจากส่วนหัวเอกสาร โลโก้ หรือข้อความ "ผู้ขาย" / "ออกโดย" / ส่วนบนสุดของเอกสาร
  - ถ้าเอกสารมีทั้ง "ผู้ขาย" และ "ผู้ซื้อ" ให้ใช้ชื่อ "ผู้ขาย" เท่านั้น
  - ใส่ชื่อเต็มรวมคำนำหน้า เช่น "บริษัท เอบีซี จำกัด" หรือ "ห้างหุ้นส่วนจำกัด ..."
- suggestedAccountCode: เลือกรหัสบัญชีที่เหมาะสมที่สุดจากผังบัญชีที่ให้มา โดยดูจากรายละเอียดสินค้า/บริการ
  - accountConfidence: "high" ถ้ามั่นใจมากว่าตรงกับรายการ, "medium" ถ้าพอเดาได้, "low" ถ้าไม่แน่ใจ
  - ถ้าไม่มีบัญชีที่เหมาะสมเลย ให้ใส่ค่าว่างและ confidence = "low"
- ถ้าอ่านข้อมูลไม่ได้ให้ใส่ค่าว่าง/0
- vatType: ถ้ามี VAT 7% ใส่ "vat7", ถ้าไม่มี VAT ใส่ "non_vat", ถ้า VAT 0% ใส่ "zero_rated"
- จำนวนเงินเป็นตัวเลข ไม่มีเครื่องหมายจุลภาค
- วันที่ต้องเป็น DD/MM/YYYY ปี พ.ศ.
- ส่งกลับ JSON เท่านั้น ห้ามมี markdown code block`;

  function extractXmlVal(xml: string, tag: string): string {
    const m = xml.match(new RegExp(`<${tag}><anyType[^>]*>([^<]+)<\\/anyType><\\/${tag}>`));
    return m ? m[1].trim() : "";
  }

  interface RdBranch { name: string; address: string; branch: string; branchNumber: number; source: string; }

  async function lookupRdVatBranch(taxId: string, branchNumber: number): Promise<RdBranch | null> {
    try {
      const soapBody = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:vat="https://rdws.rd.go.th/serviceRD3/vatserviceRD3"><soap:Header/><soap:Body><vat:Service><vat:username>anonymous</vat:username><vat:password>anonymous</vat:password><vat:TIN>${taxId}</vat:TIN><vat:Name></vat:Name><vat:ProvinceCode>0</vat:ProvinceCode><vat:BranchNumber>${branchNumber}</vat:BranchNumber><vat:AmphurCode>0</vat:AmphurCode></vat:Service></soap:Body></soap:Envelope>`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const resp = await fetch("https://rdws.rd.go.th/serviceRD3/vatserviceRD3.asmx", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
        body: soapBody,
      });
      clearTimeout(timeout);
      if (!resp.ok) return null;
      const xml = await resp.text();
      if (extractXmlVal(xml, "vmsgerr").toLowerCase().includes("not found")) return null;
      const titleName = extractXmlVal(xml, "vtitleName");
      const vName = extractXmlVal(xml, "vName");
      if (!vName || vName === "-") return null;
      const fullName = (titleName && titleName !== "-" ? titleName + " " : "") + vName;
      const v = (f: string) => { const s = extractXmlVal(xml, f); return s && s !== "-" ? s : ""; };
      const province = v("vProvince");
      const isBkk = province.includes("กรุงเทพ");
      const addrParts = [
        v("vBuildingName") ? `อาคาร${v("vBuildingName")}` : "",
        v("vFloorNumber") ? `ชั้น${v("vFloorNumber")}` : "",
        v("vRoomNumber") ? `ห้อง${v("vRoomNumber")}` : "",
        v("vHouseNumber") ? `เลขที่ ${v("vHouseNumber")}` : "",
        v("vVillageName") ? `หมู่บ้าน${v("vVillageName")}` : "",
        v("vMooNumber") ? `หมู่ ${v("vMooNumber")}` : "",
        v("vYaek") ? `แยก${v("vYaek")}` : "",
        v("vSoiName") ? `ซอย${v("vSoiName")}` : "",
        v("vStreetName") ? `ถนน${v("vStreetName")}` : "",
        v("vThambol") ? `${isBkk ? "แขวง" : "ตำบล"}${v("vThambol")}` : "",
        v("vAmphur") ? `${isBkk ? "เขต" : "อำเภอ"}${v("vAmphur")}` : "",
        province ? (isBkk ? province : `จังหวัด${province}`) : "",
        v("vPostCode"),
      ].filter(Boolean);
      const branchNo = extractXmlVal(xml, "vBranchNumber");
      const branchNum = Number(branchNo) || branchNumber;
      const branchLabel = branchNum === 0 ? "สำนักงานใหญ่" : String(branchNum).padStart(5, "0");
      return { name: fullName, address: addrParts.join(" "), branch: branchLabel, branchNumber: branchNum, source: "rd" };
    } catch { return null; }
  }

  async function lookupRdVatAll(taxId: string): Promise<RdBranch[]> {
    if (!taxId || taxId.length !== 13) return [];
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => lookupRdVatBranch(taxId, i)));
    return results.filter((r): r is RdBranch => r !== null);
  }

  app.get("/api/dbd-lookup/:taxId", requireAuth, async (req, res) => {
    try {
      const taxId = String(req.params.taxId || "");
      if (!taxId || taxId.length !== 13) {
        return res.status(400).json({ message: "เลขนิติบุคคลต้องมี 13 หลัก" });
      }

      const user = req.user as any;
      const userCompanies = await db.select().from(companies).where(eq(companies.tenantId, user.tenantId));
      const companyIds = userCompanies.map(c => c.id);

      const [localContacts, branches] = await Promise.all([
        companyIds.length > 0
          ? db.select().from(contacts).where(and(
              sql`${contacts.companyId} IN (${sql.join(companyIds.map(id => sql`${id}`), sql`, `)})`,
              eq(contacts.taxId, taxId)
            )).limit(1)
          : Promise.resolve([]),
        lookupRdVatAll(taxId),
      ]);

      const contactId = localContacts.length > 0 ? localContacts[0].id : undefined;

      if (branches.length > 0) {
        const first = branches[0];
        return res.json({ ...first, branches, ...(contactId ? { contactId } : {}) });
      }

      if (localContacts.length > 0) {
        const c = localContacts[0];
        return res.json({ name: c.name, address: c.address || "", branch: c.branch || "สำนักงานใหญ่", source: "local", contactId: c.id });
      }

      return res.status(404).json({ message: "ไม่พบข้อมูลในระบบกรมสรรพากร" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "เกิดข้อผิดพลาด" });
    }
  });

  app.get("/api/dbd-search", requireAuth, async (req, res) => {
    try {
      const query = String(req.query.q || "").trim();
      if (!query || query.length < 2) return res.json({ results: [] });

      const user = req.user as any;
      const userCompanies = await db.select().from(companies).where(eq(companies.tenantId, user.tenantId));
      const companyIds = userCompanies.map(c => c.id);
      let results: any[] = [];

      if (companyIds.length > 0) {
        const localContacts = await db.select().from(contacts)
          .where(and(
            sql`${contacts.companyId} IN (${sql.join(companyIds.map(id => sql`${id}`), sql`, `)})`,
            sql`(${contacts.name} ILIKE ${'%' + query + '%'} OR ${contacts.taxId} LIKE ${'%' + query + '%'})`
          ))
          .limit(20);
        results = localContacts.map(c => ({
          name: c.name,
          taxId: c.taxId || "",
          address: c.address || "",
          branch: c.branch || "สำนักงานใหญ่",
          phone: c.phone || "",
          email: c.email || "",
          source: "local",
          contactId: c.id,
        }));
      }

      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "เกิดข้อผิดพลาด" });
    }
  });

  function buildSmartPrompt(expenseAccounts: { code: string; name: string }[], contactNames: string[]): string {
    let prompt = PDF_EXTRACT_PROMPT_BASE;
    if (expenseAccounts.length > 0) {
      prompt += `\n\nผังบัญชีค่าใช้จ่ายของบริษัท (ให้เลือก suggestedAccountCode จากรายการนี้เท่านั้น):\n`;
      prompt += expenseAccounts.map(a => `${a.code} = ${a.name}`).join("\n");
    }
    if (contactNames.length > 0) {
      prompt += `\n\nรายชื่อคู่ค้าที่มีในระบบ (ถ้าชื่อผู้ขายตรงหรือคล้ายกับรายชื่อเหล่านี้ ให้ใช้ชื่อจากรายการนี้):\n`;
      prompt += contactNames.slice(0, 50).join(", ");
    }
    return prompt;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⚠️ AI API ENDPOINT — PDF/Image Extract via Dual AI (OpenAI + Gemini)
  // Sends document to BOTH OpenAI GPT-4o and Gemini in parallel,
  // then picks the result with higher confidence/completeness automatically.
  // Falls back to whichever AI is available if only one is configured.
  // ═══════════════════════════════════════════════════════════════════════

  function scoreAiResult(parsed: any): number {
    let score = 0;
    if (parsed.vendorName && parsed.vendorName.length > 2) score += 20;
    if (parsed.vendorTaxId && parsed.vendorTaxId.length === 13) score += 20;
    if (parsed.docDate) score += 15;
    if (parsed.docNo) score += 10;
    if (parsed.totalAmount && Number(parsed.totalAmount) > 0) score += 15;
    if (parsed.subtotal && Number(parsed.subtotal) > 0) score += 5;
    if (parsed.vatAmount !== undefined) score += 5;
    const items = parsed.items || [];
    if (items.length > 0) score += 10;
    const validItems = items.filter((i: any) => i.description && (Number(i.total) > 0 || Number(i.unitPrice) > 0));
    score += Math.min(validItems.length * 3, 15);
    if (parsed.confidence === "high") score += 10;
    else if (parsed.confidence === "medium") score += 5;
    return score;
  }

  async function extractWithOpenAI(smartPrompt: string, fileContents: any[]): Promise<{ parsed: any; rawText: string; ms: number }> {
    if (!openai) throw new Error("OpenAI not configured");
    const t = performance.now();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: smartPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "อ่านข้อมูลจากเอกสารนี้และส่งกลับเป็น JSON" },
            ...fileContents,
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0,
    });
    const rawText = completion.choices[0]?.message?.content || "";
    const ms = Math.round(performance.now() - t);
    const jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return { parsed: JSON.parse(jsonStr), rawText, ms };
  }

  async function extractWithGemini(smartPrompt: string, fileContents: any[]): Promise<{ parsed: any; rawText: string; ms: number }> {
    if (!geminiAi) throw new Error("Gemini not configured");
    const t = performance.now();
    const parts: any[] = [{ text: smartPrompt + "\n\nอ่านข้อมูลจากเอกสารนี้และส่งกลับเป็น JSON" }];
    for (const fc of fileContents) {
      if (fc.type === "text") {
        parts.push({ text: fc.text });
      } else if (fc.type === "image_url" && fc.image_url?.url) {
        const url = fc.image_url.url as string;
        if (url.startsWith("data:")) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        }
      }
    }
    const response = await geminiAi.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: { maxOutputTokens: 2000, temperature: 0 },
    });
    const rawText = response.text || "";
    const ms = Math.round(performance.now() - t);
    const jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return { parsed: JSON.parse(jsonStr), rawText, ms };
  }
  app.post("/api/pdf-import/extract", requireAuth, requireModule("purchases"), handleMulterUpload, async (req: any, res) => {
    try {
      if (!req.files || req.files.length === 0) return res.status(400).json({ message: "ไม่พบไฟล์" });
      const companyId = Number(req.body.companyId);
      const docType = req.body.docType || "purchase";
      if (!companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });

      const companyContacts = await db.select().from(contacts).where(eq(contacts.companyId, companyId));
      let companyProducts: any[] = [];
      const companyAccounts_ = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
      if (docType === "purchase") {
        companyProducts = await db.select().from(products).where(eq(products.companyId, companyId));
      }

      const expenseAccounts = companyAccounts_
        .filter((a: any) => a.code >= "500" && a.code < "600")
        .map((a: any) => ({ code: a.code, name: a.nameTh || a.name || "" }));
      const accountMap = new Map(companyAccounts_.map((a: any) => [a.code, a]));

      let historicalAccountMap = new Map<string, string>();
      if (docType === "expense") {
        try {
          const recentItems = await db.select({
            desc: expenseItems.description,
            acct: expenseItems.accountCode,
          }).from(expenseItems)
            .innerJoin(expenses, eq(expenseItems.expenseId, expenses.id))
            .where(eq(expenses.companyId, companyId))
            .limit(500);
          for (const item of recentItems) {
            if (item.desc && item.acct) {
              const key = (item.desc as string).toLowerCase().trim();
              if (!historicalAccountMap.has(key)) {
                historicalAccountMap.set(key, item.acct as string);
              }
            }
          }
        } catch (_) {}
      }

      const contactNames = companyContacts
        .map((c: any) => c.orgName || c.name || "")
        .filter(Boolean);

      const smartPrompt = docType === "expense"
        ? buildSmartPrompt(expenseAccounts, contactNames)
        : buildSmartPrompt([], contactNames);

      const existingDocs = docType === "purchase"
        ? await db.select({ no: purchaseInvoices.apNo, taxRef: purchaseInvoices.taxInvoiceRef }).from(purchaseInvoices).where(eq(purchaseInvoices.companyId, companyId))
        : await db.select({ no: expenses.expNo, taxRef: expenses.taxInvoiceRef }).from(expenses).where(eq(expenses.companyId, companyId));
      const existingNos = new Set(existingDocs.map(d => d.no));
      const existingTaxRefs = new Set(existingDocs.filter(d => d.taxRef).map(d => d.taxRef));

      const results: any[] = [];

      for (const file of req.files) {
        const fileResult: any = {
          fileName: decodeMulterFilename(file.originalname),
          fileSize: file.size,
          mimeType: file.mimetype,
          status: "processing",
          data: null,
          error: null,
          timing: {} as Record<string, number>,
        };
        const t0 = performance.now();

        try {
          let fileContents: any[] = [];
          let pdfText = "";
          const fileExt = (file.originalname || "").toLowerCase().match(/\.[^.]+$/)?.[0] || "";
          const isPdf = file.mimetype === "application/pdf" || fileExt === ".pdf";
          const base64 = file.buffer.toString("base64");
          if (isPdf) {
            try {
              const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
              const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.buffer) });
              const pdfDoc = await loadingTask.promise;
              const textParts: string[] = [];
              for (let i = 1; i <= pdfDoc.numPages; i++) {
                const page = await pdfDoc.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(" ");
                textParts.push(pageText);
              }
              pdfText = textParts.join("\n\n");
            } catch (pdfErr: any) {
              console.log("PDF text extraction failed:", pdfErr.message);
              pdfText = "";
            }
            if (pdfText.trim().length > 20) {
              fileContents.push({
                type: "text" as const,
                text: `[เนื้อหาจากไฟล์ PDF: ${file.originalname}]\n${pdfText}`,
              });
            } else {
              try {
                const { createCanvas } = await import("canvas");
                const pdfjsLib2 = await import("pdfjs-dist/legacy/build/pdf.mjs");
                const loadTask2 = pdfjsLib2.getDocument({ data: new Uint8Array(file.buffer) });
                const pdfDoc2 = await loadTask2.promise;
                const numPages = Math.min(pdfDoc2.numPages, 3);
                for (let pi = 1; pi <= numPages; pi++) {
                  const page = await pdfDoc2.getPage(pi);
                  const viewport = page.getViewport({ scale: 2.0 });
                  const canvas = createCanvas(viewport.width, viewport.height);
                  const ctx = canvas.getContext("2d");
                  await page.render({ canvasContext: ctx as any, viewport }).promise;
                  const pngBase64 = canvas.toBuffer("image/png").toString("base64");
                  fileContents.push({
                    type: "image_url" as const,
                    image_url: {
                      url: `data:image/png;base64,${pngBase64}`,
                      detail: "high" as const,
                    },
                  });
                }
              } catch (renderErr: any) {
                console.log("PDF render to image failed:", renderErr.message);
                throw new Error("ไม่สามารถอ่าน PDF นี้ได้ กรุณาแปลงเป็นรูปภาพก่อนอัพโหลด");
              }
            }
          } else {
            const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
            const actualMime = file.mimetype === "application/octet-stream" ? (mimeMap[fileExt] || "image/jpeg") : file.mimetype;
            fileContents.push({
              type: "image_url" as const,
              image_url: {
                url: `data:${actualMime};base64,${base64}`,
                detail: "high" as const,
              },
            });
          }
          fileResult.timing.prepareMs = Math.round(performance.now() - t0);

          let attachedUrl = "";
          const tUpload = performance.now();
          try {
            const { saveBufferToPath } = await import("../replit_integrations/object_storage/routes");
            const { randomUUID } = await import("crypto");
            const uuid = randomUUID();
            const safeExt = fileExt || ".bin";
            const objectKey = `pdf-imports/${uuid}${safeExt}`;
            saveBufferToPath(file.buffer, objectKey);
            attachedUrl = objectKey;
          } catch (uploadErr: any) {
            console.log("File upload to storage skipped:", uploadErr.message);
          }
          fileResult.timing.uploadMs = Math.round(performance.now() - tUpload);

          if (!openai && !geminiAi) throw new Error("ไม่มี AI ที่พร้อมใช้งาน (ต้องมี OpenAI หรือ Gemini อย่างน้อย 1 ตัว)");
          const tAi = performance.now();

          const aiTasks: { name: string; promise: Promise<{ parsed: any; rawText: string; ms: number }> }[] = [];
          if (openai) aiTasks.push({ name: "OpenAI", promise: extractWithOpenAI(smartPrompt, fileContents) });
          if (geminiAi) aiTasks.push({ name: "Gemini", promise: extractWithGemini(smartPrompt, fileContents) });

          const aiResults = await Promise.allSettled(aiTasks.map(t => t.promise));

          let parsed: any = null;
          let bestScore = -1;
          let chosenAi = "none";
          const aiTimings: Record<string, any> = {};

          for (let i = 0; i < aiResults.length; i++) {
            const result = aiResults[i];
            const aiName = aiTasks[i].name;
            if (result.status === "fulfilled") {
              const score = scoreAiResult(result.value.parsed);
              aiTimings[aiName] = { ms: result.value.ms, score, status: "ok" };
              console.log(`[pdf-import] ${aiName}: score=${score}, ms=${result.value.ms}`);
              if (score > bestScore) {
                bestScore = score;
                parsed = result.value.parsed;
                chosenAi = aiName;
              }
            } else {
              aiTimings[aiName] = { status: "error", error: (result.reason as Error)?.message || "unknown" };
              console.log(`[pdf-import] ${aiName} failed:`, (result.reason as Error)?.message);
            }
          }

          if (!parsed) throw new Error("ทั้ง OpenAI และ Gemini ไม่สามารถอ่านเอกสารได้");

          fileResult.timing.aiMs = Math.round(performance.now() - tAi);
          fileResult.timing.aiDetails = aiTimings;
          fileResult.timing.chosenAi = chosenAi;

          let vendorName = parsed.vendorName || "";
          let vendorAddress = parsed.vendorAddress || "";
          let vendorBranch = parsed.branch || "";
          let dbdLookup = false;

          const tDbd = performance.now();
          if (parsed.vendorTaxId && parsed.vendorTaxId.length === 13) {
            const dbdInfo = await lookupDBD(parsed.vendorTaxId);
            if (dbdInfo && dbdInfo.name) {
              vendorName = dbdInfo.name;
              if (dbdInfo.address) vendorAddress = dbdInfo.address;
              if (dbdInfo.branch) vendorBranch = dbdInfo.branch;
              dbdLookup = true;
            }
          }
          fileResult.timing.dbdMs = Math.round(performance.now() - tDbd);

          let vendorMatch: any = null;
          if (parsed.vendorTaxId && parsed.vendorTaxId.length === 13) {
            vendorMatch = companyContacts.find((c: any) => c.taxId === parsed.vendorTaxId);
          }
          if (!vendorMatch && vendorName && vendorName.length > 3) {
            const vLower = vendorName.toLowerCase().replace(/\s+/g, "");
            vendorMatch = companyContacts.find((c: any) => {
              const cName = (c.name || "").toLowerCase().replace(/\s+/g, "");
              if (!cName || cName.length < 4) return false;
              return cName === vLower;
            });
          }
          if (vendorMatch) {
            vendorName = vendorMatch.name || vendorName;
          }

          const isDuplicate = (parsed.docNo && existingTaxRefs.has(parsed.docNo)) || false;

          const parseDateBE = (val: string): string => {
            if (!val) return "";
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
            return "";
          };

          const docDate = parseDateBE(parsed.docDate);
          const dueDate = parseDateBE(parsed.dueDate);

          const items = (parsed.items || []).map((item: any, idx: number) => {
            let acctCode = item.suggestedAccountCode || "";
            let acctConfidence = item.accountConfidence || "low";
            let acctName = item.description || "";
            let acctMatched = false;

            if (docType === "expense" && acctCode) {
              const acct = accountMap.get(acctCode);
              if (acct) {
                acctName = (acct as any).nameTh || (acct as any).name || acctName;
                acctMatched = true;
              } else {
                acctCode = "";
                acctConfidence = "low";
              }
            }

            if (docType === "expense" && !acctMatched && item.description) {
              const descKey = (item.description as string).toLowerCase().trim();
              const histCode = historicalAccountMap.get(descKey);
              if (histCode) {
                const histAcct = accountMap.get(histCode);
                if (histAcct) {
                  acctCode = histCode;
                  acctName = (histAcct as any).nameTh || (histAcct as any).name || acctName;
                  acctConfidence = "high";
                  acctMatched = true;
                }
              }
            }

            if (docType === "expense" && !acctCode) {
              const defaultAcct = accountMap.get("5210450") || accountMap.get("5266");
              if (defaultAcct) {
                acctCode = defaultAcct ? (defaultAcct as any).code : "5210450";
                acctName = (defaultAcct as any).nameTh || (defaultAcct as any).name || "ค่าบริหารอื่น";
                acctConfidence = "low";
              } else {
                const fallback = companyAccounts_.find((a: any) => a.code >= "520" && a.code < "530");
                if (fallback) {
                  acctCode = fallback.code;
                  acctName = (fallback as any).nameTh || (fallback as any).name || "";
                  acctConfidence = "low";
                }
              }
            }

            return {
              rowNum: idx + 1,
              productCode: "",
              productName: item.description || "",
              description: item.description || "",
              qty: Number(item.qty) || 1,
              unit: item.unit || "ชิ้น",
              unitPrice: Number(item.unitPrice) || 0,
              discount: Number(item.discount) || 0,
              total: Number(item.total) || 0,
              vatType: item.vatType || "vat7",
              productId: null,
              productMatched: false,
              accountCode: acctCode,
              accountName: acctName,
              accountConfidence: acctConfidence,
              accountMatched: acctMatched,
              amount: Number(item.total) || 0,
              errors: [],
            };
          });

          if (docType === "purchase") {
            for (const item of items) {
              const matchedProd = companyProducts.find((p: any) =>
                (p.name || "").toLowerCase() === (item.productName || "").toLowerCase()
              );
              if (matchedProd) {
                item.productId = matchedProd.id;
                item.productCode = matchedProd.code || "";
                item.productMatched = true;
              }
            }
          }

          const errors: string[] = [];
          if (!docDate) errors.push("ไม่พบวันที่เอกสาร");
          if (!vendorName) errors.push("ไม่พบชื่อผู้จำหน่าย");
          if (isDuplicate) errors.push("เลขที่ใบกำกับภาษีซ้ำในระบบ");
          if (items.length === 0) errors.push("ไม่พบรายการสินค้า/บริการ");

          const warnings: string[] = [];
          const lowConfItems = items.filter((i: any) => i.accountConfidence === "low" && docType === "expense");
          if (lowConfItems.length > 0) {
            warnings.push(`AI ไม่มั่นใจบัญชี ${lowConfItems.length} รายการ - กรุณาตรวจสอบ`);
          }
          if (!vendorMatch && !dbdLookup && vendorName) {
            warnings.push("ไม่พบคู่ค้าในระบบ - จะสร้างจากข้อมูลที่ AI อ่านได้");
          }

          const itemErrors = items.flatMap((i: any) => i.errors);
          const hasErrors = errors.length > 0 || itemErrors.length > 0;
          if (hasErrors) {
            console.log(`[pdf-import] ${file.originalname} ERRORS: doc=[${errors.join("; ")}] items=[${itemErrors.join("; ")}]`);
          }

          fileResult.timing.totalMs = Math.round(performance.now() - t0);
          console.log(`[pdf-import] ${file.originalname} (${(file.size/1024).toFixed(0)}KB) — prep ${fileResult.timing.prepareMs}ms, upload ${fileResult.timing.uploadMs}ms, AI ${fileResult.timing.aiMs}ms (chosen: ${fileResult.timing.chosenAi}), DBD ${fileResult.timing.dbdMs}ms, total ${fileResult.timing.totalMs}ms`);

          fileResult.status = "success";
          fileResult.data = {
            key: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            apNo: "(สร้างอัตโนมัติ)",
            expNo: "(สร้างอัตโนมัติ)",
            apDate: docDate,
            expDate: docDate,
            dueDate: dueDate,
            vendorName,
            vendorTaxId: parsed.vendorTaxId || "",
            vendorAddress,
            branch: vendorBranch,
            taxInvoiceRef: parsed.docNo || "",
            notes: parsed.notes || "",
            refDoc: "",
            priceMode: "excluded",
            withholdingTax: Number(parsed.withholdingTax) || 0,
            subtotal: Number(parsed.subtotal) || 0,
            vatAmount: Number(parsed.vatAmount) || 0,
            totalAmount: Number(parsed.totalAmount) || 0,
            vendorId: vendorMatch?.id || null,
            vendorMatchName: vendorMatch ? (vendorMatch.orgName || vendorMatch.name) : null,
            dbdLookup,
            items,
            errors,
            warnings,
            hasErrors,
            isDuplicate,
            confidence: parsed.confidence || "medium",
            fileName: decodeMulterFilename(file.originalname),
            archivedFileUrl: attachedUrl,
            aiProvider: chosenAi,
            aiScores: aiTimings,
            invoicePrefix: (() => {
              const docNoVal = parsed.docNo || "";
              if (!docNoVal) return "";
              const upper = docNoVal.toUpperCase();
              const sorted = Object.keys(INVOICE_PREFIX_MAP).sort((a: string, b: string) => b.length - a.length);
              for (const p of sorted) { if (upper.startsWith(p)) return p; }
              return "";
            })(),
          };
        } catch (err: any) {
          fileResult.status = "error";
          fileResult.error = err.message || "ไม่สามารถอ่านไฟล์ได้";
        }

        results.push(fileResult);
      }

      const successDocs = results.filter(r => r.status === "success" && r.data);
      const failedDocs = results.filter(r => r.status === "error");

      res.json({
        totalFiles: req.files.length,
        successFiles: successDocs.length,
        failedFiles: failedDocs.length,
        documents: successDocs.map(r => ({ ...r.data, timing: r.timing })),
        errors: failedDocs.map(r => ({ fileName: r.fileName, error: r.error })),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pdf-import/create-purchase", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, documents, autoJournal, paymentMethod, formulaId, formulaBusinessType } = req.body;
      if (!companyId || !documents || !Array.isArray(documents)) {
        return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
      }

      const pmStatus = paymentMethod === "cash" ? "paid" : "unpaid";
      const pmAccCode = autoJournal
        ? await resolvePaymentMethodAccountCode(companyId, paymentMethod)
        : null;

      const created: any[] = [];
      const skipped: any[] = [];
      const errors: any[] = [];

      for (const doc of documents) {
        try {
          let apNo = doc.apNo;
          const docDateStr = doc.apDate || new Date().toISOString().split("T")[0];
          if (!apNo || apNo === "(สร้างอัตโนมัติ)") {
            const docPrefix = doc.invoicePrefix || "AP";
            const useInvoicePrefix = !!doc.invoicePrefix;
            apNo = await getNextDocNo(companyId, docPrefix, purchaseInvoices, purchaseInvoices.apNo, purchaseInvoices.companyId, docDateStr, "purchase_invoice", undefined, useInvoicePrefix);
          } else {
            const existing = await db.select({ apNo: purchaseInvoices.apNo })
              .from(purchaseInvoices).where(and(eq(purchaseInvoices.companyId, companyId), eq(purchaseInvoices.apNo, apNo)));
            if (existing.length > 0) {
              skipped.push({ apNo, reason: "เลขที่เอกสารซ้ำ" });
              continue;
            }
          }

          const validItems = (doc.items || []).filter((i: any) =>
            i.productName && (parseFloat(i.qty) || 0) > 0 && (parseFloat(i.unitPrice) || 0) > 0
          );
          if (validItems.length === 0) {
            errors.push({ apNo: apNo || "(auto)", error: "ไม่มีรายการที่ถูกต้อง" });
            continue;
          }

          const result = await db.transaction(async (tx) => {
            const [newDoc] = await tx.insert(purchaseInvoices).values({
              companyId,
              apNo,
              apDate: doc.apDate || new Date().toISOString().split("T")[0],
              dueDate: doc.dueDate || null,
              vendorId: doc.vendorId || null,
              vendorName: doc.vendorName || "ไม่ระบุ",
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
              paymentStatus: pmStatus,
              paymentMethod: paymentMethod || null,
              priceMode: doc.priceMode || "excluded",
              showInTaxReport: parseFloat(String(doc.vatAmount || "0")) > 0.005,
              docPrefix: "AP",
              notes: doc.notes || null,
              refDoc: doc.refDoc || null,
              attachedUrl: doc.attachedUrl || null,
              attachedFolder: doc.folderPath || null,
              linkJournal: autoJournal ? true : false,
              createdBy: user.id,
            }).returning();

            for (const item of validItems) {
              await tx.insert(purchaseInvoiceItems).values({
                purchaseInvoiceId: newDoc.id,
                productId: item.productId ? Number(item.productId) : null,
                productCode: item.productCode || null,
                productName: item.productName || item.description || "",
                description: item.description || null,
                qty: String(item.qty || "1"),
                unit: item.unit || "ชิ้น",
                unitPrice: String(item.unitPrice || "0"),
                discount: String(item.discount || "0"),
                discountType: "amount",
                total: String(item.total || "0"),
                vatType: item.vatType || "vat7",
              });
            }
            return newDoc;
          });

          if (autoJournal) {
            try {
              const _jiDescs = validItems.map((i: any) => i.description).filter(Boolean);
              const _jiAccounts = validItems
                .filter((i: any) => i.accountCode)
                .map((i: any) => ({ accountCode: i.accountCode, accountName: i.accountName || "", amount: parseFloat(i.total || "0"), description: i.description || "" }));
              await createAutoJournalEntry({
                companyId: result.companyId,
                documentType: "purchase",
                sourceDocType: "purchase_invoice",
                sourceDocId: result.id,
                docDate: result.apDate,
                docNo: result.apNo,
                subtotal: String(result.subtotal),
                vatAmount: String(result.vatAmount),
                totalAmount: String(result.totalAmount),
                withholdingTax: String(result.withholdingTax || "0"),
                userId: user.id,
                customerName: result.vendorName,
                paymentMethod: result.paymentMethod || undefined,
                paymentMethodAccountCode: pmAccCode,
                lineItemDescriptions: _jiDescs.length > 0 ? _jiDescs : undefined,
                lineItemAccounts: _jiAccounts.length > 0 ? _jiAccounts : undefined,
                formulaId: formulaId || undefined,
                formulaBusinessType: formulaBusinessType && formulaBusinessType !== "auto-detect"
                  ? formulaBusinessType
                  : (doc.platform && doc.platform !== "other"
                    ? (() => {
                        const invNo = doc.taxInvoiceRef || "";
                        const upper = invNo.toUpperCase();
                        const PREFIX_MAP: Record<string, string> = {
                          "TRSPEMKP": "shopee_platform_fee", "TRSPESPF": "shopeefood_fee",
                          "TRSPXADB": "spx_admin_fee", "RCSPXSPR": "shopee_shipping", "RCSPXSPB": "shopee_shipping", "RCSPXSPW": "shopee_shipping",
                          "TTSTH": "tiktok_platform_fee", "TTSTHCN": "tiktok_platform_fee",
                          "TTSTHAC": "tiktok_affiliate_commission", "THJV": "tiktok_shipping",
                          "THMPTI": "lazada_platform_fee", "THLPTI": "lazada_shipping",
                          "IM": "grab_service_fee",
                        };
                        const sorted = Object.keys(PREFIX_MAP).sort((a, b) => b.length - a.length);
                        for (const p of sorted) { if (upper.startsWith(p)) return PREFIX_MAP[p]; }
                        const key = `${doc.platform || "other"}:${doc.docSubType || "mixed"}`;
                        const PLAT_MAP: Record<string, string> = {
                          "shopee:platform_fee": "shopee_platform_fee", "shopee:shipping": "shopee_shipping",
                          "tiktok:platform_fee": "tiktok_platform_fee", "tiktok:shipping": "tiktok_shipping",
                          "lazada:platform_fee": "lazada_platform_fee", "lazada:shipping": "lazada_shipping",
                          "grab:service_fee": "grab_service_fee",
                          "myorder:shipping": "ecommerce_shipping", "myorder:service_fee": "ecommerce_commission",
                          "myorder:mixed": "ecommerce_shipping",
                        };
                        return PLAT_MAP[key] || undefined;
                      })()
                    : undefined),
                overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
              });
            } catch (e: any) {
              console.error("[PI-pdf-import] Auto journal entry failed:", e?.message || e);
            }
          }

          created.push({
            apNo: result.apNo, id: result.id,
            vendorName: result.vendorName,
            subtotal: result.subtotal,
            vatAmount: result.vatAmount,
            totalAmount: result.totalAmount,
            taxInvoiceRef: result.taxInvoiceRef,
          });
        } catch (err: any) {
          errors.push({ apNo: doc.apNo || "(auto)", error: err.message });
        }
      }

      const createdIds = created.map((c: any) => c.id).filter(Boolean);
      if (createdIds.length > 0) {
        const [batch] = await db.insert(documentImportBatches).values({
          companyId, docType: "purchase_invoice", fileName: req.body.fileName || "PDF Import",
          totalCreated: createdIds.length, totalSkipped: skipped.length, totalErrors: errors.length,
          createdDocIds: JSON.stringify(createdIds), createdBy: user.id,
        }).returning();
        res.json({ created, skipped, errors, total: documents.length, batchId: batch.id });
      } else {
        res.json({ created, skipped, errors, total: documents.length });
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pdf-import/preview-formulas", requireAuth, async (req, res) => {
    try {
      const { companyId, documents } = req.body;
      if (!companyId || !documents || !Array.isArray(documents)) {
        return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
      }

      const company = await db.select({ businessType: companies.businessType }).from(companies).where(eq(companies.id, companyId)).limit(1);
      const isRestaurant = company[0]?.businessType === "restaurant";

      const RESTAURANT_PREFIX_MAP: Record<string, string> = { "IM": "restaurant_grab_gp", "TRSPESPF": "restaurant_shopeefood_gp" };
      const RESTAURANT_PLAT_MAP: Record<string, string> = {
        "grab:service_fee": "restaurant_grab_gp", "grab:platform_fee": "restaurant_grab_gp", "grab:commission": "restaurant_grab_gp", "grab:mixed": "restaurant_grab_gp",
        "lineman:service_fee": "restaurant_lineman_gp", "lineman:platform_fee": "restaurant_lineman_gp", "lineman:commission": "restaurant_lineman_gp", "lineman:mixed": "restaurant_lineman_gp",
        "foodpanda:service_fee": "restaurant_foodpanda_gp", "foodpanda:platform_fee": "restaurant_foodpanda_gp", "foodpanda:commission": "restaurant_foodpanda_gp", "foodpanda:mixed": "restaurant_foodpanda_gp",
        "robinhood:service_fee": "restaurant_robinhood_gp", "robinhood:platform_fee": "restaurant_robinhood_gp", "robinhood:commission": "restaurant_robinhood_gp", "robinhood:mixed": "restaurant_robinhood_gp",
        "shopee:service_fee": "restaurant_shopeefood_gp", "other:mixed": "platform_fee",
      };

      const PREFIX_MAP: Record<string, string> = {
        "TRSPEMKP": "shopee_platform_fee", "TRSPESPF": "shopeefood_fee",
        "TRSPXADB": "spx_admin_fee", "RCSPXSPR": "shopee_shipping", "RCSPXSPB": "shopee_shipping", "RCSPXSPW": "shopee_shipping",
        "TRSLZD": "lazada_platform_fee", "TTSTH": "tiktok_platform_fee", "TTSTHCN": "tiktok_platform_fee",
        "TTSTHAC": "tiktok_affiliate_commission", "THJV": "tiktok_shipping",
        "THMPTI": "lazada_platform_fee", "THLPTI": "lazada_shipping", "IM": "grab_service_fee",
      };
      const PLAT_MAP: Record<string, string> = {
        "shopee:platform_fee": "shopee_platform_fee", "shopee:shipping": "shopee_shipping",
        "shopee:commission": "shopee_platform_fee", "shopee:service_fee": "shopeefood_fee",
        "shopee:mixed": "shopee_platform_fee",
        "tiktok:platform_fee": "tiktok_platform_fee", "tiktok:shipping": "tiktok_shipping",
        "tiktok:commission": "ecommerce_commission", "tiktok:mixed": "tiktok_platform_fee",
        "lazada:platform_fee": "lazada_platform_fee", "lazada:shipping": "lazada_shipping",
        "lazada:commission": "lazada_platform_fee", "lazada:mixed": "lazada_platform_fee",
        "grab:service_fee": "grab_service_fee", "grab:mixed": "grab_service_fee",
        "myorder:shipping": "ecommerce_shipping", "myorder:service_fee": "ecommerce_commission",
        "myorder:mixed": "ecommerce_shipping",
        "other:mixed": "platform_fee",
      };

      function resolveFormula(doc: any): string {
        if (isRestaurant) {
          if (doc.invoicePrefix && RESTAURANT_PREFIX_MAP[doc.invoicePrefix]) return RESTAURANT_PREFIX_MAP[doc.invoicePrefix];
          const rKey = `${doc.platform || "other"}:${doc.docSubType || "mixed"}`;
          if (RESTAURANT_PLAT_MAP[rKey]) return RESTAURANT_PLAT_MAP[rKey];
        }
        if (doc.invoicePrefix) {
          const sorted = Object.keys(PREFIX_MAP).sort((a, b) => b.length - a.length);
          for (const k of sorted) {
            if (doc.invoicePrefix.startsWith(k)) return PREFIX_MAP[k];
          }
        }
        if (doc.invoiceNo) {
          const upper = doc.invoiceNo.toUpperCase();
          const sorted = Object.keys(PREFIX_MAP).sort((a, b) => b.length - a.length);
          for (const k of sorted) {
            if (upper.startsWith(k)) return PREFIX_MAP[k];
          }
        }
        const key = `${doc.platform || "other"}:${doc.docSubType || "mixed"}`;
        return PLAT_MAP[key] || "platform_fee";
      }

      const formulaCounts = new Map<string, number>();
      for (const doc of documents) {
        const bt = resolveFormula(doc);
        formulaCounts.set(bt, (formulaCounts.get(bt) || 0) + 1);
      }

      const user = req.user as any;
      const userCompanyIds: number[] = (user.companies || []).map((c: any) => c.id || c.companyId);
      if (user.role !== "superadmin" && !userCompanyIds.includes(companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
      }

      const uniqueBts = Array.from(formulaCounts.keys());
      const dbFormulas = uniqueBts.length > 0
        ? await db.select({ businessType: accountingFormulas.businessType, name: accountingFormulas.name, nameTh: accountingFormulas.nameTh, documentType: accountingFormulas.documentType, id: accountingFormulas.id })
            .from(accountingFormulas)
            .where(and(
              eq(accountingFormulas.companyId, companyId),
              eq(accountingFormulas.active, true),
              inArray(accountingFormulas.businessType, uniqueBts),
              or(eq(accountingFormulas.documentType, "expense"), eq(accountingFormulas.documentType, "purchase"))
            ))
        : [];

      const dbFormulaMap = new Map<string, { id: number; name: string; nameTh: string | null; documentType: string }>();
      for (const f of dbFormulas) {
        if (!dbFormulaMap.has(f.businessType)) {
          dbFormulaMap.set(f.businessType, { id: f.id, name: f.name, nameTh: f.nameTh, documentType: f.documentType });
        }
      }

      const results = uniqueBts.map(bt => ({
        businessType: bt,
        count: formulaCounts.get(bt) || 0,
        exists: dbFormulaMap.has(bt),
        formulaName: dbFormulaMap.get(bt)?.nameTh || dbFormulaMap.get(bt)?.name || null,
        formulaId: dbFormulaMap.get(bt)?.id || null,
      }));

      res.json({ formulas: results, total: documents.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pdf-import/create-expense", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, documents, autoJournal, journalMode, autoWht, autoCreateContact, paymentMethod: reqPaymentMethod, formulaId, formulaBusinessType, archiveToDocs, existingBatchId } = req.body;
      const shouldCreateContact = autoCreateContact !== false;
      const usePerDoc = journalMode === "per_doc";
      console.log(`[PDF-Import] create-expense: companyId=${companyId}, autoJournal=${autoJournal}, journalMode=${journalMode || "daily"}, autoCreateContact=${shouldCreateContact}, formulaId=${formulaId}, formulaBusinessType=${formulaBusinessType}, docs=${documents?.length}`);
      if (!companyId || !documents || !Array.isArray(documents)) {
        return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
      }

      const [companyAccounts, existingContacts, companyInfo] = await Promise.all([
        db.select().from(accounts).where(eq(accounts.companyId, companyId)),
        db.select().from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.active, true), or(eq(contacts.type, "vendor"), eq(contacts.type, "both")))),
        db.select({ businessType: companies.businessType }).from(companies).where(eq(companies.id, companyId)).limit(1),
      ]);
      const accountMap = new Map(companyAccounts.map(a => [a.code, a]));
      const isRestaurant = companyInfo[0]?.businessType === "restaurant";

      const contactByTaxId = new Map<string, any>();
      const contactByName = new Map<string, any>();
      for (const c of existingContacts) {
        if (c.taxId) contactByTaxId.set(c.taxId, c);
        contactByName.set((c.name || "").toLowerCase(), c);
      }

      const globalPayMethod = reqPaymentMethod || "cash";
      const pmAccCode = autoJournal && (formulaId || formulaBusinessType)
        ? await resolvePaymentMethodAccountCode(companyId, globalPayMethod)
        : null;

      const vendorCache = new Map<string, number>();

      let firmClientId: number | null = null;
      if (user.tenantId) {
        const [fc] = await db.select({ id: firmClients.id }).from(firmClients)
          .where(eq(firmClients.companyId, companyId)).limit(1);
        firmClientId = fc?.id || null;
      }
      const archiveLinkCache = new Map<string, any>();

      const BATCH_SUFFIX_MAP: Record<string, string> = {
        "TRSPEMKP": "SH", "TRSPESPF": "SHF", "TRSPXADB": "SPXA",
        "RCSPXSPR": "SPX", "RCSPXSPB": "SPX",
        "TRSLZD": "LZ", "THMPTI": "LZ", "THLPTI": "LZX",
        "TTSTH": "TK", "TTSTHCN": "TKCN", "TTSTHAC": "EC",
        "THJV": "TKX", "IM": "GR",
      };
      function getBatchSuffix(doc: any): string {
        if (doc.platform === "myorder") {
          if (doc.docSubType === "shipping") return "MOS";
          if (doc.docSubType === "service_fee") return "MOC";
          return "MO";
        }
        const prefix = doc.invoicePrefix || "";
        if (BATCH_SUFFIX_MAP[prefix]) return BATCH_SUFFIX_MAP[prefix];
        const sortedKeys = Object.keys(BATCH_SUFFIX_MAP).sort((a, b) => b.length - a.length);
        for (const k of sortedKeys) {
          if (prefix.startsWith(k)) return BATCH_SUFFIX_MAP[k];
        }
        return "OT";
      }

      const datePrefixGroups = new Map<string, typeof documents>();
      for (const doc of documents) {
        const d = doc.expDate || doc.date || new Date().toISOString().split("T")[0];
        const suffix = getBatchSuffix(doc);
        const groupKey = `${d}|${suffix}`;
        const existing = datePrefixGroups.get(groupKey) || [];
        existing.push(doc);
        datePrefixGroups.set(groupKey, existing);
      }

      const batchMap = new Map<string, number>();
      if (!usePerDoc) {
        for (const [groupKey, dateDocs] of datePrefixGroups) {
          const [dateStr, suffix] = groupKey.split("|");
          const dateObj = new Date(dateStr + "T00:00:00");
          const dd = String(dateObj.getDate()).padStart(2, "0");
          const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
          const yyyy = String(dateObj.getFullYear());
          const batchNo = `DXP-${yyyy}${mm}${dd}-${suffix}`;

          const existingBatches = await db.select({ id: expenseDailyBatches.id, batchNo: expenseDailyBatches.batchNo })
            .from(expenseDailyBatches)
            .where(and(eq(expenseDailyBatches.companyId, companyId), eq(expenseDailyBatches.batchNo, batchNo)));

          if (existingBatches.length > 0) {
            batchMap.set(groupKey, existingBatches[0].id);
          } else {
            const totalSub = dateDocs.reduce((s: number, d: any) => s + (Number(d.subtotal) || 0), 0);
            const totalV = dateDocs.reduce((s: number, d: any) => s + (Number(d.vatAmount) || 0), 0);
            const totalW = dateDocs.reduce((s: number, d: any) => s + (Number(d.withholdingTax) || 0), 0);
            const totalA = dateDocs.reduce((s: number, d: any) => s + (Number(d.totalAmount) || 0), 0);

            const [batch] = await db.insert(expenseDailyBatches).values({
              companyId,
              batchNo,
              batchDate: dateStr,
              totalExpenses: dateDocs.length,
              totalSubtotal: String(totalSub),
              totalVat: String(totalV),
              totalAmount: String(totalA),
              totalWht: String(totalW),
              status: "active",
              createdBy: user.id,
            }).returning();
            batchMap.set(groupKey, batch.id);
          }
        }
      }

      const RESTAURANT_PLATFORM_FORMULA_MAP: Record<string, string> = {
        "grab:service_fee": "restaurant_grab_gp",
        "grab:platform_fee": "restaurant_grab_gp",
        "grab:commission": "restaurant_grab_gp",
        "grab:mixed": "restaurant_grab_gp",
        "lineman:service_fee": "restaurant_lineman_gp",
        "lineman:platform_fee": "restaurant_lineman_gp",
        "lineman:commission": "restaurant_lineman_gp",
        "lineman:mixed": "restaurant_lineman_gp",
        "foodpanda:service_fee": "restaurant_foodpanda_gp",
        "foodpanda:platform_fee": "restaurant_foodpanda_gp",
        "foodpanda:commission": "restaurant_foodpanda_gp",
        "foodpanda:mixed": "restaurant_foodpanda_gp",
        "robinhood:service_fee": "restaurant_robinhood_gp",
        "robinhood:platform_fee": "restaurant_robinhood_gp",
        "robinhood:commission": "restaurant_robinhood_gp",
        "robinhood:mixed": "restaurant_robinhood_gp",
        "shopee:service_fee": "restaurant_shopeefood_gp",
        "other:mixed": "platform_fee",
      };

      const RESTAURANT_PREFIX_FORMULA_MAP: Record<string, string> = {
        "IM": "restaurant_grab_gp",
        "TRSPESPF": "restaurant_shopeefood_gp",
      };

      const PLATFORM_FORMULA_MAP: Record<string, string> = {
        "shopee:platform_fee": "shopee_platform_fee",
        "shopee:shipping": "shopee_shipping",
        "shopee:commission": "shopee_platform_fee",
        "shopee:service_fee": "shopeefood_fee",
        "shopee:ads": "shopee_platform_fee",
        "shopee:mixed": "shopee_platform_fee",
        "tiktok:platform_fee": "tiktok_platform_fee",
        "tiktok:shipping": "tiktok_shipping",
        "tiktok:commission": "ecommerce_commission",
        "tiktok:ads": "tiktok_platform_fee",
        "tiktok:mixed": "tiktok_platform_fee",
        "lazada:platform_fee": "lazada_platform_fee",
        "lazada:shipping": "lazada_shipping",
        "lazada:commission": "lazada_platform_fee",
        "lazada:ads": "lazada_platform_fee",
        "lazada:mixed": "lazada_platform_fee",
        "grab:service_fee": "grab_service_fee",
        "grab:platform_fee": "grab_service_fee",
        "grab:commission": "grab_service_fee",
        "grab:mixed": "grab_service_fee",
        "myorder:shipping": "ecommerce_shipping",
        "myorder:service_fee": "ecommerce_commission",
        "myorder:mixed": "ecommerce_shipping",
        "other:mixed": "platform_fee",
      };

      const PREFIX_FORMULA_MAP: Record<string, string> = {
        "TRSPEMKP": "shopee_platform_fee",
        "TRSPESPF": "shopeefood_fee",
        "TRSPXADB": "spx_admin_fee",
        "RCSPXSPR": "shopee_shipping",
        "RCSPXSPB": "shopee_shipping",
        "RCSPXSPW": "shopee_shipping",
        "TRSLZD":   "lazada_platform_fee",
        "TTSTH":    "tiktok_platform_fee",
        "TTSTHCN":  "tiktok_platform_fee",
        "TTSTHAC":  "tiktok_affiliate_commission",
        "THJV":     "tiktok_shipping",
        "THMPTI":   "lazada_platform_fee",
        "THLPTI":   "lazada_shipping",
        "IM":       "grab_service_fee",
      };

      function resolveFormulaForDoc(doc: any): string | null {
        if (isRestaurant) {
          if (doc.invoicePrefix && RESTAURANT_PREFIX_FORMULA_MAP[doc.invoicePrefix]) {
            return RESTAURANT_PREFIX_FORMULA_MAP[doc.invoicePrefix];
          }
          const rKey = `${doc.platform || "other"}:${doc.docSubType || "mixed"}`;
          if (RESTAURANT_PLATFORM_FORMULA_MAP[rKey]) {
            return RESTAURANT_PLATFORM_FORMULA_MAP[rKey];
          }
        }
        if (doc.invoicePrefix && PREFIX_FORMULA_MAP[doc.invoicePrefix]) {
          return PREFIX_FORMULA_MAP[doc.invoicePrefix];
        }
        if (doc.invoiceNo) {
          const upper = doc.invoiceNo.toUpperCase();
          const sortedPrefixes = Object.keys(PREFIX_FORMULA_MAP).sort((a, b) => b.length - a.length);
          for (const prefix of sortedPrefixes) {
            if (upper.startsWith(prefix)) {
              return PREFIX_FORMULA_MAP[prefix];
            }
          }
        }
        if (doc.formulaBusinessType) return doc.formulaBusinessType;
        const key = `${doc.platform || "other"}:${doc.docSubType || "mixed"}`;
        const fallbackBt = formulaBusinessType && formulaBusinessType !== "auto-detect" ? formulaBusinessType : null;
        return PLATFORM_FORMULA_MAP[key] || fallbackBt || null;
      }

      async function getDebitCodeForFormula(bt: string): Promise<string | null> {
        const dbFormula = await db.select().from(accountingFormulas)
          .where(and(eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.businessType, bt), eq(accountingFormulas.active, true)))
          .limit(1);
        if (dbFormula.length === 0) return null;
        const lines = await db.select().from(accountingFormulaLines)
          .where(eq(accountingFormulaLines.formulaId, dbFormula[0].id))
          .orderBy(accountingFormulaLines.sortOrder);
        const debitLine = lines.find((l: any) => l.direction === "debit" && !l.accountCode.startsWith("143"));
        return debitLine ? debitLine.accountCode : null;
      }

      const AD_CREDIT_ACCOUNT_MAP: Record<string, string> = {
        "shopee": "5271000",
        "lazada": "5272000",
        "tiktok": "5273000",
        "facebook": "5274000",
        "google": "5275000",
      };

      function getAdCreditAccountCode(doc: any): string {
        const platform = (doc.platform || "").toLowerCase();
        return AD_CREDIT_ACCOUNT_MAP[platform] || "5200500";
      }

      function isPaidAdsItem(desc: string): boolean {
        return /^paid\s*ads$/i.test((desc || "").trim());
      }

      let formulaDebitCode: string | null = null;
      if (formulaBusinessType && formulaBusinessType !== "auto-detect") {
        formulaDebitCode = await getDebitCodeForFormula(formulaBusinessType);
      }

      const CREDIT_NOTE_PREFIXES = new Set(["TTSTHCN"]);

      const created: any[] = [];
      const skipped: any[] = [];
      const errors: any[] = [];
      const pendingJournals: { result: any; doc: any; validItems: any[] }[] = [];
      const pendingDnJournals: { dnId: number; dnNo: string; date: string; subtotal: string; vatAmount: string; totalAmount: string; vendorName: string; batchSuffix: string; batchId: number | null }[] = [];

      for (const doc of documents) {
        try {
          const docPrefix = doc.invoicePrefix || "EXP";
          const docDateStr = doc.expDate || doc.apDate || new Date().toISOString().split("T")[0];

          if (CREDIT_NOTE_PREFIXES.has(docPrefix)) {
            let dnNo = doc.expNo;
            if (!dnNo || dnNo === "(สร้างอัตโนมัติ)") {
              dnNo = await getNextDocNo(companyId, docPrefix, purchaseDebitNotes, purchaseDebitNotes.debitNoteNo, purchaseDebitNotes.companyId, docDateStr, "purchase_debit_note", undefined, true);
            } else {
              const existing = await db.select({ id: purchaseDebitNotes.id })
                .from(purchaseDebitNotes).where(and(eq(purchaseDebitNotes.companyId, companyId), eq(purchaseDebitNotes.debitNoteNo, dnNo)));
              if (existing.length > 0) {
                skipped.push({ expNo: dnNo, reason: "เลขที่ใบลดหนี้ซ้ำ" });
                continue;
              }
            }

            const validItems = (doc.items || []).filter((i: any) => {
              const amt = parseFloat(i.amount) || parseFloat(i.total) || 0;
              return amt > 0;
            });

            let resolvedVendorId = doc.vendorId || null;
            if (!resolvedVendorId && doc.vendorName && doc.vendorName !== "ไม่ระบุ") {
              const cacheKey = `${doc.vendorTaxId || ""}|${doc.vendorName}`;
              if (vendorCache.has(cacheKey)) {
                resolvedVendorId = vendorCache.get(cacheKey)!;
              } else {
                const contact = doc.vendorTaxId
                  ? contactByTaxId.get(doc.vendorTaxId)
                  : contactByName.get((doc.vendorName || "").toLowerCase());
                if (contact) {
                  resolvedVendorId = contact.id;
                  vendorCache.set(cacheKey, resolvedVendorId!);
                }
              }
            }

            const sanitize = (s: string | null | undefined) => s ? s.replace(/\x00/g, "") : null;
            const batchKey = `${docDateStr}|${getBatchSuffix(doc)}`;

            const refInvoiceNo = doc.refInvoiceNo || null;

            const [newDn] = await db.insert(purchaseDebitNotes).values({
              companyId,
              debitNoteNo: dnNo,
              debitNoteDate: docDateStr,
              vendorId: resolvedVendorId,
              vendorName: sanitize(doc.vendorName) || "ไม่ระบุ",
              vendorAddress: sanitize(doc.vendorAddress),
              vendorTaxId: sanitize(doc.vendorTaxId),
              branch: sanitize(doc.branch),
              sellerBranchId: doc.sellerBranchId || null,
              refPurchaseInvoiceNo: refInvoiceNo,
              reason: "Miscalculated service fee",
              reasonDetail: doc.notes || "CREDIT NOTE",
              subtotal: String(doc.subtotal || "0"),
              discountAmount: "0",
              vatAmount: String(doc.vatAmount || "0"),
              totalAmount: String(doc.totalAmount || "0"),
              status: "approved",
              priceMode: doc.priceMode || "excluded",
              docPrefix: docPrefix,
              notes: doc.notes || "CREDIT NOTE",
              linkJournal: false,
              showInTaxReport: parseFloat(String(doc.vatAmount || "0")) > 0.005,
              taxInvoiceRef: sanitize(doc.taxInvoiceRef) || dnNo,
              batchId: batchMap.get(batchKey) || null,
              createdBy: user.id,
            }).returning();

            if (validItems.length > 0) {
              const itemValues = validItems.map((item: any) => ({
                debitNoteId: newDn.id,
                productName: item.description || "ค่าบริการ",
                description: item.description || "",
                qty: "1",
                unit: "ครั้ง",
                unitPrice: String(parseFloat(item.amount || item.total || "0")),
                total: String(parseFloat(item.amount || item.total || "0")),
                vatType: item.vatType || "vat7",
              }));
              await db.insert(purchaseDebitNoteItems).values(itemValues);
            }

            if (refInvoiceNo) {
              const [matchedExp] = await db.select({ id: expenses.id, expNo: expenses.expNo })
                .from(expenses)
                .where(and(
                  eq(expenses.companyId, companyId),
                  eq(expenses.taxInvoiceRef, refInvoiceNo),
                ))
                .limit(1);
              if (matchedExp) {
                await db.update(purchaseDebitNotes)
                  .set({ refExpenseId: matchedExp.id, refExpenseNo: matchedExp.expNo })
                  .where(eq(purchaseDebitNotes.id, newDn.id));
                await db.update(expenses)
                  .set({ refDebitNoteId: newDn.id, refDebitNoteNo: newDn.debitNoteNo })
                  .where(eq(expenses.id, matchedExp.id));
                console.log(`[PDF-Import] Linked DN ${dnNo} ↔ EXP ${matchedExp.expNo} (ref: ${refInvoiceNo})`);
              }
            }

            pendingDnJournals.push({
              dnId: newDn.id,
              dnNo: newDn.debitNoteNo,
              date: docDateStr,
              subtotal: newDn.subtotal,
              vatAmount: newDn.vatAmount,
              totalAmount: newDn.totalAmount,
              vendorName: newDn.vendorName,
              batchSuffix: getBatchSuffix(doc),
              batchId: batchMap.get(batchKey) || null,
            });

            created.push({
              expNo: newDn.debitNoteNo, id: newDn.id,
              vendorName: newDn.vendorName,
              subtotal: newDn.subtotal,
              vatAmount: newDn.vatAmount,
              totalAmount: newDn.totalAmount,
              docType: "purchase_debit_note",
            });
            console.log(`[PDF-Import] Created purchase debit note ${dnNo} (credit note) total=${doc.totalAmount}`);
            continue;
          }

          let expNo = doc.expNo;

          if (doc.taxInvoiceRef && doc.taxInvoiceRef.trim()) {
            const dupByRef = await db.select({ id: expenses.id, expNo: expenses.expNo })
              .from(expenses)
              .where(and(
                eq(expenses.companyId, companyId),
                eq(expenses.taxInvoiceRef, doc.taxInvoiceRef.trim()),
              ))
              .limit(1);
            if (dupByRef.length > 0) {
              console.log(`[PDF-Import] SKIP dup taxRef: ${doc.taxInvoiceRef} → existing ${dupByRef[0].expNo}`);
              skipped.push({ expNo: expNo || doc.taxInvoiceRef, reason: `ใบกำกับภาษีซ้ำ (${dupByRef[0].expNo})` });
              continue;
            }
          }

          if (!expNo || expNo === "(สร้างอัตโนมัติ)") {
            const useInvoicePrefix = !!doc.invoicePrefix;
            expNo = await getNextDocNo(companyId, docPrefix, expenses, expenses.expNo, expenses.companyId, docDateStr, "expense", undefined, useInvoicePrefix);
          } else {
            const existing = await db.select({ expNo: expenses.expNo })
              .from(expenses).where(and(eq(expenses.companyId, companyId), eq(expenses.expNo, expNo)));
            if (existing.length > 0) {
              console.log(`[PDF-Import] SKIP dup expNo: ${expNo}`);
              skipped.push({ expNo, reason: "เลขที่เอกสารซ้ำ" });
              continue;
            }
          }

          const validItems = (doc.items || []).filter((i: any) => {
            const amt = parseFloat(i.amount) || parseFloat(i.total) || 0;
            return amt > 0;
          });
          if (validItems.length === 0) {
            errors.push({ expNo: expNo || "(auto)", error: "ไม่มีรายการที่ถูกต้อง" });
            continue;
          }

          const payMethod = doc.paymentMethod || globalPayMethod;
          const immediatePayMethods = ["cash", "transfer", "promptpay", "ewallet", "credit_card"];
          const payStatus = immediatePayMethods.includes(payMethod) ? "paid" : "unpaid";

          let resolvedVendorId = doc.vendorId || null;
          if (!resolvedVendorId && doc.vendorName && doc.vendorName !== "ไม่ระบุ") {
            const cacheKey = `${doc.vendorTaxId || ""}|${doc.vendorName}`;
            if (vendorCache.has(cacheKey)) {
              resolvedVendorId = vendorCache.get(cacheKey)!;
            } else {
              try {
                let existingContact: any = null;
                if (doc.vendorTaxId && doc.vendorTaxId.trim()) {
                  existingContact = contactByTaxId.get(doc.vendorTaxId.trim()) || null;
                }
                if (!existingContact && doc.vendorName) {
                  existingContact = contactByName.get(doc.vendorName.toLowerCase()) || null;
                }
                if (!existingContact && shouldCreateContact) {
                  try {
                    const nextCode = await storage.getNextContactCode(companyId);
                    const [newContact] = await db.insert(contacts).values({
                      companyId,
                      code: nextCode,
                      name: (doc.vendorName || "").replace(/\x00/g, ""),
                      type: "vendor",
                      taxId: (doc.vendorTaxId || "").replace(/\x00/g, "") || null,
                      address: (doc.vendorAddress || "").replace(/\x00/g, "") || null,
                      branch: (doc.branch || "").replace(/\x00/g, "") || null,
                      active: true,
                    }).returning();
                    resolvedVendorId = newContact.id;
                    if (newContact.taxId) contactByTaxId.set(newContact.taxId, newContact);
                    contactByName.set((newContact.name || "").toLowerCase(), newContact);
                  } catch (insertErr: any) {
                    const fallback = await db.select().from(contacts).where(
                      and(eq(contacts.companyId, companyId), eq(contacts.name, (doc.vendorName || "").replace(/\x00/g, "")))
                    ).limit(1);
                    if (fallback.length > 0) {
                      resolvedVendorId = fallback[0].id;
                      contactByName.set((fallback[0].name || "").toLowerCase(), fallback[0]);
                    }
                  }
                } else if (existingContact) {
                  resolvedVendorId = existingContact.id;
                }
                if (resolvedVendorId) vendorCache.set(cacheKey, resolvedVendorId);
              } catch (contactErr: any) {
                console.log("Auto-create contact failed:", contactErr.message);
              }
            }
          }

          const sanitize = (s: string | null | undefined) => s ? s.replace(/\x00/g, "") : null;
          const result = await db.transaction(async (tx) => {
            const [newDoc] = await tx.insert(expenses).values({
              companyId,
              expNo,
              expDate: doc.expDate || doc.apDate || new Date().toISOString().split("T")[0],
              dueDate: doc.dueDate || null,
              vendorId: resolvedVendorId,
              vendorName: sanitize(doc.vendorName) || "ไม่ระบุ",
              vendorAddress: sanitize(doc.vendorAddress),
              vendorTaxId: sanitize(doc.vendorTaxId),
              branch: sanitize(doc.branch),
              taxInvoiceRef: sanitize(doc.taxInvoiceRef),
              subtotal: String(doc.subtotal || "0"),
              discountAmount: "0",
              vatAmount: String(doc.vatAmount || "0"),
              totalAmount: String(doc.totalAmount || "0"),
              withholdingTax: String(doc.withholdingTax || "0"),
              status: "approved",
              paymentStatus: payStatus,
              paymentMethod: payMethod,
              priceMode: doc.priceMode || "excluded",
              showInTaxReport: parseFloat(String(doc.vatAmount || "0")) > 0.005,
              docPrefix: docPrefix,
              notes: doc.notes || null,
              refDoc: doc.refDoc || null,
              attachedUrl: doc.attachedUrl || doc.archivedFileUrl || null,
              attachedFolder: doc.folderPath || null,
              linkJournal: false,
              batchId: batchMap.get(`${doc.expDate || doc.date || new Date().toISOString().split("T")[0]}|${getBatchSuffix(doc)}`) || null,
              createdBy: user.id,
            }).returning();

            const docFormulaBt = resolveFormulaForDoc(doc);
            const docDebitCode = docFormulaBt ? await getDebitCodeForFormula(docFormulaBt) : formulaDebitCode;

            const itemValues = validItems.map((item: any) => {
              let acctCode = item.accountCode || "";
              let acct = accountMap.get(acctCode);

              if (isPaidAdsItem(item.description)) {
                acctCode = getAdCreditAccountCode(doc);
                acct = accountMap.get(acctCode) || null;
              }

              if (!acct && docDebitCode) {
                acctCode = docDebitCode;
                acct = accountMap.get(acctCode) || null;
              }
              if (!acct) {
                const defaultAcct = accountMap.get("5210450") || accountMap.get("5266");
                if (defaultAcct) { acctCode = defaultAcct ? (defaultAcct as any).code : "5210450"; acct = defaultAcct; }
                else {
                  const fallbackAcct = companyAccounts.find((a: any) => a.code >= "520" && a.code < "530");
                  if (fallbackAcct) { acctCode = fallbackAcct.code; acct = fallbackAcct; }
                }
              }
              return {
                expenseId: newDoc.id,
                accountCode: acctCode,
                accountName: acct ? (acct.nameTh || acct.name || item.accountName || item.description) : (item.accountName || item.description || ""),
                description: item.description || null,
                expenseType: "expense" as const,
                amount: String(item.amount || item.total || "0"),
                vatType: item.vatType || "vat7",
              };
            });
            if (itemValues.length > 0) {
              await tx.insert(expenseItems).values(itemValues);
            }
            return newDoc;
          });

          if (autoJournal || autoWht) {
            const resolvedBt = resolveFormulaForDoc(doc);
            pendingJournals.push({ result, doc: { ...doc, resolvedFormulaBt: resolvedBt }, validItems });
          }

          

          created.push({
            expNo: result.expNo, id: result.id,
            vendorName: result.vendorName,
            subtotal: result.subtotal,
            vatAmount: result.vatAmount,
            totalAmount: result.totalAmount,
            taxInvoiceRef: result.taxInvoiceRef,
          });
        } catch (err: any) {
          errors.push({ expNo: doc.expNo || "(auto)", error: err.message });
        }
      }

      const hasAutoJournal = autoJournal && pendingJournals.length > 0;
      if (hasAutoJournal && usePerDoc) {
        const classifyFeeItemPD = (desc: string): string => {
          const d = (desc || "").toLowerCase().trim();
          if (/^paid\s*ads$/i.test(d)) return "ads";
          if (/affiliate\s*ads/i.test(d)) return "ads";
          if (/ads|โฆษณา|ams.*fee|sponsored|top\s*picks|search\s*ads/i.test(d)) return "ads";
          if (/commission|คอมมิชชั่น|commerce\s*growth|affiliate/i.test(d)) return "commission";
          return "service";
        };
        const buildFormulaAcctMapPD = async (bt: string): Promise<Record<string, { code: string; name: string }> | null> => {
          let expLines: Array<{ accountCode: string; accountName: string }> = [];
          const dbFormula = await db.select().from(accountingFormulas)
            .where(and(eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.businessType, bt), eq(accountingFormulas.active, true)))
            .limit(1);
          if (dbFormula.length > 0) {
            const lines = await db.select().from(accountingFormulaLines)
              .where(eq(accountingFormulaLines.formulaId, dbFormula[0].id))
              .orderBy(accountingFormulaLines.sortOrder);
            expLines = lines
              .filter((l: any) => l.direction === "debit" && l.accountCode?.startsWith("5"))
              .map((l: any) => ({ accountCode: l.accountCode, accountName: l.accountName || "" }));
          } else {
            const defFormula = DEFAULT_FORMULAS.find((f: any) => f.businessType === bt && f.documentType === "purchase");
            if (defFormula) {
              expLines = (defFormula.lines || [])
                .filter((l: any) => l.direction === "debit" && l.accountCode?.startsWith("5"))
                .map((l: any) => ({ accountCode: l.accountCode, accountName: l.accountName || "" }));
            }
          }
          if (expLines.length < 2) return null;
          const map: Record<string, { code: string; name: string }> = {};
          for (const el of expLines) {
            const n = (el.accountName || "").toLowerCase();
            if (/commission|คอมมิชชั่น/.test(n)) map["commission"] = { code: el.accountCode, name: el.accountName };
            else if (/โฆษณา|ads/.test(n)) map["ads"] = { code: el.accountCode, name: el.accountName };
            else map["service"] = { code: el.accountCode, name: el.accountName };
          }
          return Object.keys(map).length >= 2 ? map : null;
        };

        for (let pji = 0; pji < pendingJournals.length; pji++) {
          const { result, doc, validItems } = pendingJournals[pji];
          if (pji > 0) await new Promise(r => setTimeout(r, 100));
          try {
            const resolvedBt = doc.resolvedFormulaBt || resolveFormulaForDoc(doc) || (formulaBusinessType && formulaBusinessType !== "auto-detect" ? formulaBusinessType : null) || "platform_fee";

            const sub = Math.round(parseFloat(String(result.subtotal || "0")) * 100) / 100;
            const vat = Math.round(parseFloat(String(result.vatAmount || "0")) * 100) / 100;
            const total = Math.round(parseFloat(String(result.totalAmount || "0")) * 100) / 100;
            const wht = Math.round(parseFloat(String(result.withholdingTax || "0")) * 100) / 100;

            let perDocLineItems: { accountCode: string; accountName: string; amount: number; description?: string }[] | undefined;
            const formulaItemMapPD = await buildFormulaAcctMapPD(resolvedBt);
            if (formulaItemMapPD && validItems) {
              perDocLineItems = [];
              const feeMap = new Map<string, number>();
              for (const item of validItems) {
                const amt = parseFloat(String(item.amount || item.total || "0"));
                if (amt <= 0) continue;
                if (isPaidAdsItem(item.description)) {
                  const adCode = getAdCreditAccountCode(doc);
                  const adAcc = accountMap.get(adCode);
                  perDocLineItems.push({
                    accountCode: adCode,
                    accountName: adAcc ? (adAcc.nameTh || adAcc.name || "ค่าโฆษณา") : "ค่าโฆษณา",
                    amount: amt,
                    description: `Paid ads (${result.expNo})`,
                  });
                  continue;
                }
                const feeType = classifyFeeItemPD(item.description);
                feeMap.set(feeType, (feeMap.get(feeType) || 0) + amt);
              }
              for (const [feeType, feeAmt] of feeMap) {
                const mapping = formulaItemMapPD[feeType];
                if (mapping && feeAmt > 0) {
                  const acc = accountMap.get(mapping.code);
                  perDocLineItems.push({
                    accountCode: mapping.code,
                    accountName: acc ? (acc.nameTh || acc.name || mapping.name) : mapping.name,
                    amount: Math.round(feeAmt * 100) / 100,
                  });
                }
              }
            }

            const journalResult = await createAutoJournalEntry({
              companyId,
              documentType: "expense",
              sourceDocType: "expense",
              sourceDocId: result.id,
              docDate: result.expDate,
              docNo: result.expNo,
              subtotal: sub.toFixed(2),
              vatAmount: vat.toFixed(2),
              totalAmount: total.toFixed(2),
              withholdingTax: wht.toFixed(2),
              userId: user.id,
              customerName: result.vendorName || "ค่าบริการ",
              formulaBusinessType: resolvedBt,
              paymentMethodAccountCode: pmAccCode || undefined,
              paymentMethod: globalPayMethod,
              overrideLines: req?.body?.journalOverrideLines || undefined,
              lineItemAccounts: perDocLineItems,
            });
            console.log(`[PDF-Import] per_doc journal for ${result.expNo}:`, JSON.stringify(journalResult));
            if (journalResult && !journalResult.skipped) {
              await db.update(expenses)
                .set({ linkJournal: true })
                .where(eq(expenses.id, result.id));
            }
          } catch (e) {
            console.log(`[PDF-Import] per_doc journal for ${result.expNo} skipped:`, (e as any).message);
          }
        }
      }
      if (hasAutoJournal && !usePerDoc) {
        const classifyFeeItem = (desc: string): string => {
          const d = (desc || "").toLowerCase().trim();
          if (/^paid\s*ads$/i.test(d)) return "ads";
          if (/affiliate\s*ads/i.test(d)) return "ads";
          if (/ads|โฆษณา|ams.*fee|sponsored|top\s*picks|search\s*ads/i.test(d)) return "ads";
          if (/commission|คอมมิชชั่น|commerce\s*growth|affiliate/i.test(d)) return "commission";
          return "service";
        };
        const buildFormulaAcctMap = async (bt: string): Promise<Record<string, { code: string; name: string }> | null> => {
          let expLines: Array<{ accountCode: string; accountName: string }> = [];
          const dbFormula = await db.select().from(accountingFormulas)
            .where(and(eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.businessType, bt), eq(accountingFormulas.active, true)))
            .limit(1);
          if (dbFormula.length > 0) {
            const lines = await db.select().from(accountingFormulaLines)
              .where(eq(accountingFormulaLines.formulaId, dbFormula[0].id))
              .orderBy(accountingFormulaLines.sortOrder);
            expLines = lines
              .filter((l: any) => l.direction === "debit" && l.accountCode?.startsWith("5"))
              .map((l: any) => ({ accountCode: l.accountCode, accountName: l.accountName || "" }));
          } else {
            const defFormula = DEFAULT_FORMULAS.find((f: any) => f.businessType === bt && f.documentType === "purchase");
            if (defFormula) {
              expLines = (defFormula.lines || [])
                .filter((l: any) => l.direction === "debit" && l.accountCode?.startsWith("5"))
                .map((l: any) => ({ accountCode: l.accountCode, accountName: l.accountName || "" }));
            }
          }
          if (expLines.length < 2) return null;
          const map: Record<string, { code: string; name: string }> = {};
          for (const el of expLines) {
            const n = (el.accountName || "").toLowerCase();
            if (/commission|คอมมิชชั่น/.test(n)) map["commission"] = { code: el.accountCode, name: el.accountName };
            else if (/โฆษณา|ads/.test(n)) map["ads"] = { code: el.accountCode, name: el.accountName };
            else map["service"] = { code: el.accountCode, name: el.accountName };
          }
          return Object.keys(map).length >= 2 ? map : null;
        };

        const formulaGroups = new Map<string, { date: string; formulaBt: string; subtotal: number; vat: number; total: number; wht: number; expIds: number[]; expNos: string[]; batchId: number | null; adCreditItems: { accountCode: string; accountName: string; amount: number; description: string }[]; feeBreakdown: Map<string, number>; batchSuffix: string }>();
        for (const { result, doc, validItems } of pendingJournals) {
          const resolvedBt = doc.resolvedFormulaBt || resolveFormulaForDoc(doc) || (formulaBusinessType && formulaBusinessType !== "auto-detect" ? formulaBusinessType : null) || "platform_fee";
          const docBatchSuffix = getBatchSuffix(doc);
          const groupKey = `${result.expDate}||${resolvedBt}||${docBatchSuffix}`;
          const group = formulaGroups.get(groupKey) || { date: result.expDate, formulaBt: resolvedBt, subtotal: 0, vat: 0, total: 0, wht: 0, expIds: [], expNos: [], batchId: result.batchId || null, adCreditItems: [], feeBreakdown: new Map<string, number>(), batchSuffix: docBatchSuffix };
          group.subtotal += parseFloat(String(result.subtotal || "0"));
          group.vat += parseFloat(String(result.vatAmount || "0"));
          group.total += parseFloat(String(result.totalAmount || "0"));
          group.wht += parseFloat(String(result.withholdingTax || "0"));
          group.expIds.push(result.id);
          group.expNos.push(result.expNo);

          if (validItems) {
            for (const item of validItems) {
              const amt = parseFloat(String(item.amount || item.total || "0"));
              if (isPaidAdsItem(item.description)) {
                const adCode = getAdCreditAccountCode(doc);
                const adAcc = accountMap.get(adCode);
                group.adCreditItems.push({
                  accountCode: adCode,
                  accountName: adAcc ? (adAcc.nameTh || adAcc.name || "ค่าโฆษณา") : "ค่าโฆษณา",
                  amount: amt,
                  description: `Paid ads (${result.expNo})`,
                });
              }
              if (!isPaidAdsItem(item.description)) {
                const feeType = classifyFeeItem(item.description);
                group.feeBreakdown.set(feeType, (group.feeBreakdown.get(feeType) || 0) + amt);
              }
            }
          }

          formulaGroups.set(groupKey, group);
        }

        const FORMULA_SUFFIX_MAP: Record<string, string> = {
          "shopee_platform_fee": "SH",
          "shopee_shipping": "SPX",
          "shopee_commission": "SHC",
          "shopeefood_fee": "SHF",
          "spx_admin_fee": "SPXA",
          "lazada_platform_fee": "LZ",
          "lazada_shipping": "LZX",
          "lazada_commission": "LZC",
          "tiktok_platform_fee": "TK",
          "tiktok_shipping": "TKX",
          "ecommerce_commission": "EC",
          "ecommerce_shipping": "ECS",
          "grab_service_fee": "GR",
          "platform_fee": "PF",
        };

        const SKIP_AUTO_JOURNAL_SUFFIXES = new Set<string>();

        for (const [groupKey, group] of formulaGroups) {
          try {
            const suffix = group.batchSuffix || FORMULA_SUFFIX_MAP[group.formulaBt] || "PF";
            const dxpNo = `DXP-${group.date.replace(/-/g, "")}-${suffix}`;
            const dxpBatchId = group.batchId;

            if (SKIP_AUTO_JOURNAL_SUFFIXES.has(suffix)) {
              console.log(`[PDF-Import] Skipping auto-journal for ${dxpNo} (credit note — manual journal required)`);
              continue;
            }

            const existingDxpJournals = await db.select({ id: journalEntries.id })
              .from(journalEntries)
              .where(and(
                eq(journalEntries.companyId, companyId),
                eq(journalEntries.reference, dxpNo),
                eq(journalEntries.sourceDocType, "expense_daily_batch"),
              ));

            if (existingDxpJournals.length > 0) {
              console.log(`[PDF-Import] DXP journal ${dxpNo} already exists (${existingDxpJournals.length} entries), deleting to recreate...`);
              for (const ej of existingDxpJournals) {
                const ejId = ej.id;
                const clearRef = async (stmt: string) => { try { await db.execute(sql.raw(stmt)); } catch {} };
                await clearRef(`UPDATE bank_statements SET matched_journal_id = NULL WHERE matched_journal_id = ${ejId}`);
                await db.delete(journalLines).where(eq(journalLines.journalEntryId, ejId));
                await db.delete(journalEntries).where(eq(journalEntries.id, ejId));
              }
            }

            const adCreditTotal = group.adCreditItems.reduce((s, i) => s + i.amount, 0);
            const expenseSubtotal = group.subtotal - adCreditTotal;

            let dxpLineItemAccounts: { accountCode: string; accountName: string; amount: number; description?: string }[] | undefined;

            const formulaItemMap = await buildFormulaAcctMap(group.formulaBt);
            if (formulaItemMap && group.feeBreakdown.size > 0) {
              dxpLineItemAccounts = [];
              for (const [feeType, feeAmt] of group.feeBreakdown) {
                const mapping = formulaItemMap[feeType];
                if (mapping && feeAmt > 0) {
                  const acc = accountMap.get(mapping.code);
                  dxpLineItemAccounts.push({
                    accountCode: mapping.code,
                    accountName: acc ? (acc.nameTh || acc.name || mapping.name) : mapping.name,
                    amount: Math.round(feeAmt * 100) / 100,
                    description: `${mapping.name} (${group.expNos.length} ใบ)`,
                  });
                }
              }
              console.log(`[PDF-Import] DXP ${dxpNo}: feeBreakdown=${JSON.stringify(Object.fromEntries(group.feeBreakdown))}, formulaMap=${JSON.stringify(formulaItemMap)}`);
            }

            if (adCreditTotal > 0) {
              if (!dxpLineItemAccounts) dxpLineItemAccounts = [];
              const adGrouped = new Map<string, { accountCode: string; accountName: string; amount: number }>();
              for (const adItem of group.adCreditItems) {
                const existing = adGrouped.get(adItem.accountCode);
                if (existing) {
                  existing.amount += adItem.amount;
                } else {
                  adGrouped.set(adItem.accountCode, { accountCode: adItem.accountCode, accountName: adItem.accountName, amount: adItem.amount });
                }
              }
              for (const [, adg] of adGrouped) {
                dxpLineItemAccounts.push({ accountCode: adg.accountCode, accountName: adg.accountName, amount: adg.amount, description: `ค่าโฆษณา (${group.expNos.length} ใบ)` });
              }
              console.log(`[PDF-Import] DXP ${dxpNo}: Paid ads separated: adCredit=${adCreditTotal.toFixed(2)}, expenseSub=${expenseSubtotal.toFixed(2)}`);
            }

            console.log(`[PDF-Import] Auto journal ${dxpNo}: ${group.expNos.length} expenses, formula=${group.formulaBt}, total=${group.total.toFixed(2)}`);
            const journalResult = await createAutoJournalEntry({
              companyId,
              documentType: "expense",
              sourceDocType: "expense_daily_batch",
              sourceDocId: dxpBatchId || 0,
              docDate: group.date,
              docNo: dxpNo,
              subtotal: group.subtotal.toFixed(2),
              vatAmount: group.vat.toFixed(2),
              totalAmount: group.total.toFixed(2),
              withholdingTax: group.wht.toFixed(2),
              userId: user.id,
              customerName: `สรุปค่าใช้จ่าย ${suffix} (${group.expNos.length} ใบ)`,
              paymentMethod: globalPayMethod || undefined,
              paymentMethodAccountCode: pmAccCode,
              formulaId: undefined,
              formulaBusinessType: group.formulaBt,
              overrideLines: req?.body?.journalOverrideLines || undefined,
              lineItemAccounts: dxpLineItemAccounts,
            });
            console.log(`[PDF-Import] DXP Journal result for ${dxpNo}:`, JSON.stringify(journalResult));
            if (journalResult && group.expIds.length > 0) {
              await db.update(expenses)
                .set({ linkJournal: true })
                .where(inArray(expenses.id, group.expIds));
              console.log(`[PDF-Import] Updated linkJournal=true for ${group.expIds.length} expenses`);
            }
          } catch (e) {
            console.log(`Auto journal for group ${groupKey} skipped:`, (e as any).message);
          }
        }
      }

      if (pendingDnJournals.length > 0 && autoJournal) {
        const dnFormulaLines = req?.body?.dnFormulaLines || undefined;
        const dnFormulaBusinessType = req?.body?.dnFormulaBusinessType || undefined;

        const dnGroups = new Map<string, { date: string; subtotal: number; vat: number; total: number; dnIds: number[]; dnNos: string[]; batchId: number | null; batchSuffix: string }>();
        for (const dn of pendingDnJournals) {
          const gk = `${dn.date}||${dn.batchSuffix}`;
          const g = dnGroups.get(gk) || { date: dn.date, subtotal: 0, vat: 0, total: 0, dnIds: [], dnNos: [], batchId: dn.batchId, batchSuffix: dn.batchSuffix };
          g.subtotal += parseFloat(dn.subtotal || "0");
          g.vat += parseFloat(dn.vatAmount || "0");
          g.total += parseFloat(dn.totalAmount || "0");
          g.dnIds.push(dn.dnId);
          g.dnNos.push(dn.dnNo);
          dnGroups.set(gk, g);
        }

        let formulaLines: { accountCode: string; accountName: string; direction: string; sortOrder: number }[] | null = null;
        if (dnFormulaLines && Array.isArray(dnFormulaLines) && dnFormulaLines.length > 0) {
          formulaLines = dnFormulaLines;
        } else if (dnFormulaBusinessType) {
          const dnDbFormula = await db.select().from(accountingFormulas)
            .where(and(eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.documentType, "debit_note"), eq(accountingFormulas.businessType, dnFormulaBusinessType), eq(accountingFormulas.active, true)))
            .limit(1);
          if (dnDbFormula.length > 0) {
            const dnDbLines = await db.select().from(accountingFormulaLines)
              .where(eq(accountingFormulaLines.formulaId, dnDbFormula[0].id))
              .orderBy(accountingFormulaLines.sortOrder);
            formulaLines = dnDbLines;
          }
        }
        if (!formulaLines) {
          const dnFallback = await db.select().from(accountingFormulas)
            .where(and(eq(accountingFormulas.companyId, companyId), eq(accountingFormulas.documentType, "debit_note"), eq(accountingFormulas.active, true)))
            .limit(1);
          if (dnFallback.length > 0) {
            const dnFbLines = await db.select().from(accountingFormulaLines)
              .where(eq(accountingFormulaLines.formulaId, dnFallback[0].id))
              .orderBy(accountingFormulaLines.sortOrder);
            formulaLines = dnFbLines;
          }
        }

        for (const [gk, g] of dnGroups) {
          try {
            const suffix = g.batchSuffix || "TKCN";
            const dxpNo = `DXP-${g.date.replace(/-/g, "")}-${suffix}`;

            const existingDnJournals = await db.select({ id: journalEntries.id })
              .from(journalEntries)
              .where(and(
                eq(journalEntries.companyId, companyId),
                eq(journalEntries.reference, dxpNo),
                eq(journalEntries.sourceDocType, "purchase_debit_note"),
              ));

            if (existingDnJournals.length > 0) {
              for (const ej of existingDnJournals) {
                await db.delete(journalLines).where(eq(journalLines.journalEntryId, ej.id));
                await db.delete(journalEntries).where(eq(journalEntries.id, ej.id));
              }
            }

            if (!formulaLines || formulaLines.length === 0) {
              console.log(`[PDF-Import] DN journal ${dxpNo}: No formula found, skipping`);
              continue;
            }

            const sub = Math.round(g.subtotal * 100) / 100;
            const vat = Math.round(g.vat * 100) / 100;
            const total = Math.round(g.total * 100) / 100;

            const entryNo = await getNextJournalEntryNo(companyId, g.date);
            const [je] = await db.insert(journalEntries).values({
              companyId,
              entryNo,
              entryDate: g.date,
              reference: dxpNo,
              description: `ใบลดหนี้ซื้อ ${suffix} (${g.dnNos.length} ใบ) — กลับรายการ`,
              journalBook: "general",
              contactName: `ใบลดหนี้ซื้อ ${suffix} (${g.dnNos.length} ใบ)`,
              createdBy: user.id,
              status: "posted",
              sourceDocType: "purchase_debit_note",
              sourceDocId: g.dnIds[0] || 0,
              totalDebit: total.toFixed(2),
              totalCredit: total.toFixed(2),
            }).returning();

            const sortedFL = [...formulaLines].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            const jLines = sortedFL.map(fl => {
              const acc = accountMap.get(fl.accountCode);
              if (!acc) return null;
              const isVat = fl.accountCode.startsWith("143");
              let amount: number;
              if (fl.direction === "debit") {
                amount = total;
              } else {
                amount = isVat ? vat : sub;
              }
              return {
                journalEntryId: je.id,
                accountId: acc.id,
                description: acc.nameTh || acc.name || fl.accountName,
                debit: fl.direction === "debit" ? amount.toFixed(2) : "0",
                credit: fl.direction === "credit" ? amount.toFixed(2) : "0",
              };
            }).filter(Boolean);

            if (jLines.length > 0) {
              await db.insert(journalLines).values(jLines as any);
            }

            await db.update(purchaseDebitNotes)
              .set({ linkJournal: true })
              .where(inArray(purchaseDebitNotes.id, g.dnIds));

            console.log(`[PDF-Import] DN journal ${dxpNo}: formula-based (${sortedFL.length} lines, ${g.dnNos.length} DN)`);
          } catch (e) {
            console.log(`[PDF-Import] DN journal for group ${gk} failed:`, (e as any).message);
          }
        }
      }

      for (const { result, doc, validItems } of pendingJournals) {
        const whtAmount = parseFloat(String(result.withholdingTax || "0"));
        if (autoWht && whtAmount > 0) {
          try {
            const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
            const certNo = await getNextDocNo(companyId, "WHT", withholdingTaxCerts, withholdingTaxCerts.certNo, withholdingTaxCerts.companyId, result.expDate);
            const whtType = doc.whtType || "pnd53";
            const whtRate = doc.whtRate || 3;
            const incomeTypeMap: Record<number, string> = { 1: "4", 2: "5", 3: "6", 5: "3" };
            const resolvedIncomeType = incomeTypeMap[whtRate] || "6";

            const [certDoc] = await db.insert(withholdingTaxCerts).values({
              companyId,
              certNo,
              certDate: result.expDate,
              paidDate: result.expDate,
              payerName: company?.name || "",
              payerAddress: company?.address || null,
              payerTaxId: company?.taxId || null,
              payerBranch: company?.branch || "สำนักงานใหญ่",
              payeeVendorId: result.vendorId || null,
              payeeName: result.vendorName || "",
              payeeAddress: result.vendorAddress || null,
              payeeTaxId: result.vendorTaxId || null,
              payeeBranch: result.branch || null,
              formType: whtType,
              incomeType: resolvedIncomeType,
              incomeDescription: [...new Set(validItems.map((i: any) => i.accountName || i.description).filter(Boolean))].join(", ") || "ค่าใช้จ่าย",
              taxRate: String(whtRate),
              amountPaid: String(result.subtotal || "0"),
              taxWithheld: String(whtAmount.toFixed(2)),
              whtCondition: "1",
              sourceDocType: "expense",
              sourceDocId: result.id,
              sourceDocNo: result.expNo,
              status: "approved",
              docPrefix: "WHT",
              attachedUrl: result.attachedUrl || null,
              createdBy: user.id,
            }).returning();

            const savedExpItems = await db.select().from(expenseItems).where(eq(expenseItems.expenseId, result.id));
            const subtotalNum = parseFloat(String(result.subtotal || "0"));
            const rawItemTotal = savedExpItems.reduce((s, i) => s + parseFloat(i.amount || "0"), 0);
            const ratio = rawItemTotal > 0 ? subtotalNum / rawItemTotal : 1;

            for (const ei of savedExpItems) {
              const itemAmt = parseFloat(ei.amount || "0") * ratio;
              const itemWht = parseFloat((itemAmt * (whtRate / 100)).toFixed(2));
              if (itemAmt <= 0) continue;
              await db.insert(whtCertItems).values({
                whtCertId: certDoc.id,
                incomeType: resolvedIncomeType,
                incomeDescription: ei.accountName || ei.description || "ค่าใช้จ่าย",
                paidDate: result.expDate,
                amountPaid: itemAmt.toFixed(2),
                taxWithheld: itemWht.toFixed(2),
                taxRate: String(whtRate),
              });
            }
          } catch (e) {
            console.log("Auto WHT cert creation skipped:", (e as any).message);
          }
        }
      }

      const createdExpIds = created.map((c: any) => c.id).filter(Boolean);
      if (createdExpIds.length > 0) {
        let batchId: number;
        if (existingBatchId) {
          const [existing] = await db.select().from(documentImportBatches).where(eq(documentImportBatches.id, existingBatchId));
          if (existing) {
            const oldIds: number[] = JSON.parse(existing.createdDocIds as string || "[]");
            const mergedIds = [...oldIds, ...createdExpIds];
            await db.update(documentImportBatches).set({
              totalCreated: mergedIds.length,
              totalSkipped: (existing.totalSkipped || 0) + skipped.length,
              totalErrors: (existing.totalErrors || 0) + errors.length,
              createdDocIds: JSON.stringify(mergedIds),
            }).where(eq(documentImportBatches.id, existingBatchId));
            batchId = existingBatchId;
          } else {
            const [batch] = await db.insert(documentImportBatches).values({
              companyId, docType: "expense", fileName: req.body.fileName || "PDF Import",
              totalCreated: createdExpIds.length, totalSkipped: skipped.length, totalErrors: errors.length,
              createdDocIds: JSON.stringify(createdExpIds), createdBy: user.id,
            }).returning();
            batchId = batch.id;
          }
        } else {
          const [batch] = await db.insert(documentImportBatches).values({
            companyId, docType: "expense", fileName: req.body.fileName || "PDF Import",
            totalCreated: createdExpIds.length, totalSkipped: skipped.length, totalErrors: errors.length,
            createdDocIds: JSON.stringify(createdExpIds), createdBy: user.id,
          }).returning();
          batchId = batch.id;
        }
        res.json({ created, skipped, errors, total: documents.length, batchId });
      } else {
        res.json({ created, skipped, errors, total: documents.length, batchId: existingBatchId || undefined });
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ============ Purchase Invoice Import ============

  app.get("/api/purchase-invoices/import/template", (_req, res) => {
    const headers = [
      "เลขที่เอกสาร", "วันที่เอกสาร", "วันครบกำหนด", "ชื่อผู้จำหน่าย", "เลขประจำตัวผู้เสียภาษี",
      "ที่อยู่ผู้จำหน่าย", "สาขา", "เลขที่ใบกำกับภาษี", "รหัสสินค้า", "ชื่อสินค้า",
      "รายละเอียด", "จำนวน", "หน่วย", "ราคาต่อหน่วย", "ส่วนลด",
      "ประเภท VAT", "ภาษีหัก ณ ที่จ่าย", "โหมดราคา", "หมายเหตุ", "อ้างอิง"
    ];
    const sample1 = [
      "AP6801001", "01/01/2568", "31/01/2568", "บจ. ทดสอบ จำกัด", "0105500000001",
      "123 ถ.สุขุมวิท กรุงเทพฯ", "สำนักงานใหญ่", "IV-001", "P001", "กระดาษ A4",
      "กระดาษ A4 80 แกรม", "10", "รีม", "150", "0",
      "vat7", "300", "excluded", "", ""
    ];
    const sample2 = [
      "AP6801001", "", "", "", "",
      "", "", "", "P002", "หมึกพิมพ์",
      "หมึกพิมพ์ HP", "2", "ตลับ", "890", "50",
      "vat7", "", "", "", ""
    ];
    const sample3 = [
      "AP6801002", "05/01/2568", "", "ร้านอุปกรณ์", "",
      "", "", "", "P003", "ปากกา",
      "ปากกาลูกลื่น", "100", "ด้าม", "5", "0",
      "non_vat", "", "excluded", "ซื้อเงินสด", ""
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2, sample3]);
    ws["!cols"] = [14, 14, 14, 25, 18, 30, 14, 16, 12, 20, 25, 10, 10, 14, 10, 12, 14, 12, 20, 16].map(w => ({ wch: w }));
    const helpHeaders = ["คอลัมน์", "คำอธิบาย", "จำเป็น", "ค่าที่รับ"];
    const helpRows = [
      ["เลขที่เอกสาร", "เลขที่เอกสาร (เว้นว่าง = สร้างอัตโนมัติ) แถวที่มีเลขเดียวกันจะรวมเป็นเอกสารเดียว", "ไม่", "เช่น AP6801001"],
      ["วันที่เอกสาร", "วันที่ (DD/MM/YYYY พ.ศ.) กรอกแค่แถวแรกของเอกสาร", "ใช่", "01/01/2568"],
      ["วันครบกำหนด", "วันครบกำหนดชำระ", "ไม่", "31/01/2568"],
      ["ชื่อผู้จำหน่าย", "ชื่อผู้จำหน่าย กรอกแค่แถวแรกของเอกสาร", "ใช่", ""],
      ["เลขประจำตัวผู้เสียภาษี", "เลขประจำตัวผู้เสียภาษี 13 หลัก", "ไม่", "0105500000001"],
      ["ที่อยู่ผู้จำหน่าย", "ที่อยู่ผู้จำหน่าย", "ไม่", ""],
      ["สาขา", "สาขาผู้จำหน่าย", "ไม่", "สำนักงานใหญ่"],
      ["เลขที่ใบกำกับภาษี", "เลขอ้างอิงใบกำกับภาษี", "ไม่", ""],
      ["รหัสสินค้า", "รหัสสินค้า (ถ้าตรงกับในระบบจะจับคู่อัตโนมัติ)", "ไม่", "P001"],
      ["ชื่อสินค้า", "ชื่อสินค้า/รายการ", "ใช่", "กระดาษ A4"],
      ["รายละเอียด", "รายละเอียดเพิ่มเติม", "ไม่", ""],
      ["จำนวน", "จำนวน", "ใช่", "10"],
      ["หน่วย", "หน่วยนับ", "ไม่", "ชิ้น (ค่าเริ่มต้น)"],
      ["ราคาต่อหน่วย", "ราคาต่อหน่วย", "ใช่", "150"],
      ["ส่วนลด", "ส่วนลดต่อรายการ (จำนวนเงิน)", "ไม่", "50"],
      ["ประเภท VAT", "vat7 / non_vat / zero_rated", "ไม่", "vat7 (ค่าเริ่มต้น)"],
      ["ภาษีหัก ณ ที่จ่าย", "ยอดภาษีหัก ณ ที่จ่ายทั้งเอกสาร (กรอกแค่แถวแรก)", "ไม่", "300"],
      ["โหมดราคา", "excluded / included (ราคาก่อน/รวม VAT)", "ไม่", "excluded (ค่าเริ่มต้น)"],
      ["หมายเหตุ", "หมายเหตุเอกสาร", "ไม่", ""],
      ["อ้างอิง", "เอกสารอ้างอิง", "ไม่", ""],
    ];
    const helpWs = XLSX.utils.aoa_to_sheet([helpHeaders, ...helpRows]);
    helpWs["!cols"] = [20, 45, 8, 20].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "เอกสารซื้อ");
    XLSX.utils.book_append_sheet(wb, helpWs, "คำอธิบาย");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="purchase_invoice_import_template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  const uploadPurchaseInvoice = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  app.post("/api/purchase-invoices/import/preview", requireAuth, requireModule("purchases"), uploadPurchaseInvoice.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์" });
      const companyId = Number(req.body.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });

      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (rawRows.length === 0) return res.status(400).json({ message: "ไม่พบข้อมูลในไฟล์" });

      const companyProducts = await db.select().from(products).where(eq(products.companyId, companyId));
      const productCodeMap = new Map(companyProducts.filter(p => p.code).map(p => [p.code!, p]));

      const companyContacts = await db.select().from(contacts).where(eq(contacts.companyId, companyId));

      const existingAPs = await db.select({ apNo: purchaseInvoices.apNo })
        .from(purchaseInvoices).where(eq(purchaseInvoices.companyId, companyId));
      const existingApNos = new Set(existingAPs.map(e => e.apNo));

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
        "เลขที่เอกสาร": "apNo", "วันที่เอกสาร": "apDate", "วันครบกำหนด": "dueDate",
        "ชื่อผู้จำหน่าย": "vendorName", "เลขประจำตัวผู้เสียภาษี": "vendorTaxId",
        "ที่อยู่ผู้จำหน่าย": "vendorAddress", "สาขา": "branch",
        "เลขที่ใบกำกับภาษี": "taxInvoiceRef", "รหัสสินค้า": "productCode",
        "ชื่อสินค้า": "productName", "รายละเอียด": "description",
        "จำนวน": "qty", "หน่วย": "unit", "ราคาต่อหน่วย": "unitPrice",
        "ส่วนลด": "discount", "ประเภท VAT": "vatType",
        "ภาษีหัก ณ ที่จ่าย": "withholdingTax", "โหมดราคา": "priceMode",
        "หมายเหตุ": "notes", "อ้างอิง": "refDoc",
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
        let key = row.apNo || "";
        if (!key) {
          key = `__auto_${++autoIdx}`;
          row.apNo = "";
        }
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(row);
      }

      const documents: any[] = [];
      for (const [key, rows] of Array.from(grouped.entries())) {
        const first = rows[0];
        const apDate = parseDateBE(first.apDate);
        const dueDate = parseDateBE(first.dueDate);
        const errors: string[] = [];

        if (!apDate) errors.push("วันที่เอกสารไม่ถูกต้อง");
        if (!first.vendorName) errors.push("ไม่มีชื่อผู้จำหน่าย");

        const isDuplicate = first.apNo && existingApNos.has(first.apNo);
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
          const qty = parseFloat(row.qty) || 0;
          const unitPrice = parseFloat(row.unitPrice) || 0;
          const discount = parseFloat(row.discount) || 0;
          const total = (qty * unitPrice) - discount;
          const itemErrors: string[] = [];

          if (!row.productName) itemErrors.push("ไม่มีชื่อสินค้า");
          if (qty <= 0) itemErrors.push("จำนวนต้องมากกว่า 0");
          if (unitPrice <= 0) itemErrors.push("ราคาต่อหน่วยต้องมากกว่า 0");

          const matchedProduct = row.productCode ? productCodeMap.get(row.productCode) : null;

          subtotal += total;
          itemsList.push({
            rowNum: row._rowNum,
            productCode: row.productCode,
            productName: matchedProduct ? (matchedProduct.name || row.productName) : row.productName,
            description: row.description,
            qty,
            unit: row.unit || "ชิ้น",
            unitPrice,
            discount,
            total: Math.round(total * 100) / 100,
            vatType: row.vatType || "vat7",
            productId: matchedProduct?.id || null,
            productMatched: !!matchedProduct,
            errors: itemErrors,
          });
        }

        const priceMode = first.priceMode || "excluded";
        const wht = parseFloat(first.withholdingTax) || 0;

        let vatAmount = 0;
        for (const item of itemsList) {
          const amt = item.total;
          const vt = item.vatType;
          if (priceMode === "excluded") {
            vatAmount += vt === "vat7" ? amt * 0.07 : 0;
          } else {
            vatAmount += vt === "vat7" ? (amt * 7 / 107) : 0;
          }
        }
        vatAmount = Math.round(vatAmount * 100) / 100;

        let totalAmount: number;
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
          apNo: first.apNo || "(สร้างอัตโนมัติ)",
          apDate: apDate || "",
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

  app.post("/api/purchase-invoices/import/create", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, documents, autoJournal } = req.body;
      if (!companyId || !documents || !Array.isArray(documents)) {
        return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
      }

      const created: any[] = [];
      const skipped: any[] = [];
      const errors: any[] = [];

      for (const doc of documents) {
        try {
          const existingAPs = await db.select({ apNo: purchaseInvoices.apNo })
            .from(purchaseInvoices).where(and(eq(purchaseInvoices.companyId, companyId), eq(purchaseInvoices.apNo, doc.apNo || "")));
          if (doc.apNo && doc.apNo !== "(สร้างอัตโนมัติ)" && existingAPs.length > 0) {
            skipped.push({ apNo: doc.apNo, reason: "เลขที่เอกสารซ้ำ" });
            continue;
          }

          let apNo = doc.apNo;
          if (!apNo || apNo === "(สร้างอัตโนมัติ)") {
            const docPrefix = doc.invoicePrefix || "AP";
            const useInvoicePrefix = !!doc.invoicePrefix;
            apNo = await getNextDocNo(companyId, docPrefix, purchaseInvoices, purchaseInvoices.apNo, purchaseInvoices.companyId, doc.apDate, "purchase_invoice", undefined, useInvoicePrefix);
          }

          const validItems = (doc.items || []).filter((i: any) =>
            i.productName && (parseFloat(i.qty) || 0) > 0 && (parseFloat(i.unitPrice) || 0) > 0
          );
          if (validItems.length === 0) {
            errors.push({ apNo: doc.apNo || "(auto)", error: "ไม่มีรายการที่ถูกต้อง" });
            continue;
          }

          const result = await db.transaction(async (tx) => {
            const [newDoc] = await tx.insert(purchaseInvoices).values({
              companyId,
              apNo,
              apDate: doc.apDate,
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
              paymentMethod: doc.paymentMethod || null,
              priceMode: doc.priceMode || "excluded",
              showInTaxReport: parseFloat(String(doc.vatAmount || "0")) > 0.005,
              docPrefix: "AP",
              notes: doc.notes || null,
              refDoc: doc.refDoc || null,
              linkJournal: autoJournal ? true : false,
              createdBy: user.id,
            }).returning();

            for (const item of validItems) {
              await tx.insert(purchaseInvoiceItems).values({
                purchaseInvoiceId: newDoc.id,
                productId: item.productId ? Number(item.productId) : null,
                productCode: item.productCode || null,
                productName: item.productName,
                description: item.description || null,
                qty: String(item.qty || "1"),
                unit: item.unit || "ชิ้น",
                unitPrice: String(item.unitPrice || "0"),
                discount: String(item.discount || "0"),
                discountType: "amount",
                total: String(item.total || "0"),
                vatType: item.vatType || "vat7",
              });
            }
            return newDoc;
          });

          if (autoJournal) {
            try {
              const pmAccCode = await resolvePaymentMethodAccountCode(result.companyId, result.paymentMethod);
              const _jiItems = await fetchPurchaseInvoiceItems(result.id);
              const _jiDescs = _jiItems.map((i: any) => i.description).filter(Boolean);
              const _jiAccounts = _jiItems
                .filter((i: any) => i.accountCode)
                .map((i: any) => ({ accountCode: i.accountCode, accountName: i.accountName || "", amount: parseFloat(i.total || "0"), description: i.description || "" }));
              await createAutoJournalEntry({
                companyId: result.companyId,
                documentType: "purchase",
                sourceDocType: "purchase_invoice",
                sourceDocId: result.id,
                docDate: result.apDate,
                docNo: result.apNo,
                subtotal: String(result.subtotal),
                vatAmount: String(result.vatAmount),
                totalAmount: String(result.totalAmount),
                withholdingTax: String(result.withholdingTax || "0"),
                userId: user.id,
                customerName: result.vendorName,
                paymentMethod: result.paymentMethod || undefined,
                paymentMethodAccountCode: pmAccCode,
                lineItemDescriptions: _jiDescs.length > 0 ? _jiDescs : undefined,
                lineItemAccounts: _jiAccounts.length > 0 ? _jiAccounts : undefined,
                overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
              });
            } catch (e: any) {
              console.error("[PI-import] Auto journal entry failed:", e?.message || e);
            }
          }

          created.push({ apNo: result.apNo, id: result.id });
        } catch (err: any) {
          errors.push({ apNo: doc.apNo || "(auto)", error: err.message });
        }
      }

      const createdApIds = created.map((c: any) => c.id).filter(Boolean);
      if (createdApIds.length > 0) {
        const [batch] = await db.insert(documentImportBatches).values({
          companyId, docType: "purchase_invoice", fileName: req.body.fileName || null,
          totalCreated: createdApIds.length, totalSkipped: skipped.length, totalErrors: errors.length,
          createdDocIds: JSON.stringify(createdApIds), createdBy: user.id,
        }).returning();
        res.json({ created, skipped, errors, total: documents.length, batchId: batch.id });
      } else {
        res.json({ created, skipped, errors, total: documents.length });
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  const pdfParseUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
        cb(null, true);
      } else {
        cb(new Error("อนุญาตเฉพาะไฟล์ PDF เท่านั้น"));
      }
    },
  });
  app.post("/api/pdf-invoice-parse", requireAuth, requireModule("purchases"), pdfParseUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "กรุณาอัปโหลดไฟล์ PDF" });
      const { parsePdfInvoice } = await import("../utils/pdf-invoice-parser");
      const result = await parsePdfInvoice(file.buffer);
      res.json(result);
    } catch (err: any) {
      console.error("PDF parse error:", err);
      res.status(500).json({ message: "ไม่สามารถอ่าน PDF ได้: " + err.message });
    }
  });

  const pdfBulkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  app.post("/api/pdf-bulk-parse", requireAuth, requireModule("purchases"), pdfBulkUpload.array("files", 5000), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ message: "กรุณาอัปโหลดไฟล์ PDF" });
      const companyId = Number(req.body.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const { parsePdfInvoice } = await import("../utils/pdf-invoice-parser");
      let saveLocalFn: ((buffer: Buffer, contentType: string, originalName?: string) => { objectPath: string }) | null = null;
      try {
        const { saveBufferLocally } = await import("../replit_integrations/object_storage/routes");
        saveLocalFn = saveBufferLocally;
      } catch {}

      let activeTemplates: any[] = [];
      try {
        const tplRows = await db.select().from(pdfImportTemplates).where(eq(pdfImportTemplates.active, true));
        activeTemplates = tplRows
          .filter(t => !t.companyId || t.companyId === companyId)
          .map(t => ({
            id: t.id,
            name: t.name,
            detectKeywords: t.detectKeywords,
            fieldRules: t.fieldRules as any,
            dateFormat: t.dateFormat || "DD/MM/YYYY",
            defaultVatType: t.defaultVatType || "vat7",
            priority: t.priority || 0,
          }));
      } catch (e: any) {
        console.log("[PDF-Import] Template load skipped:", e.message);
      }

      const companyContacts = await db.select({
        id: contacts.id,
        name: contacts.name,
        taxId: contacts.taxId,
      }).from(contacts).where(and(eq(contacts.companyId, companyId), eq(contacts.active, true)));

      const taxIdMap = new Map<string, { id: number; name: string }>();
      for (const c of companyContacts) {
        if (c.taxId) taxIdMap.set(c.taxId, { id: c.id, name: c.name });
      }

      const existingApNos = await db.select({ apNo: purchaseInvoices.apNo })
        .from(purchaseInvoices).where(eq(purchaseInvoices.companyId, companyId));
      const existingExpNos = await db.select({ expNo: expenses.expNo })
        .from(expenses).where(eq(expenses.companyId, companyId));
      const usedNos = new Set([
        ...existingApNos.map(r => r.apNo),
        ...existingExpNos.map(r => r.expNo),
      ]);

      let folderPaths: string[] = [];
      try { if (req.body.folderPaths) folderPaths = JSON.parse(req.body.folderPaths); } catch {}

      const documents: any[] = [];
      const errors: { fileName: string; error: string }[] = [];

      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        try {
          const parsed = await parsePdfInvoice(file.buffer, activeTemplates);

          let vendorId: number | null = null;
          let vendorMatchName: string | null = null;
          if (parsed.vendorTaxId && taxIdMap.has(parsed.vendorTaxId)) {
            const match = taxIdMap.get(parsed.vendorTaxId)!;
            vendorId = match.id;
            vendorMatchName = match.name;
          }

          const isDuplicate = parsed.invoiceNo ? usedNos.has(parsed.invoiceNo) : false;

          const itemsTotal = parsed.items.reduce((s, it) => s + (it.amount || 0), 0);
          const vatAmount = parsed.vatAmount || 0;
          const subtotal = parsed.subtotal || (parsed.totalAmount ? parsed.totalAmount - vatAmount : itemsTotal);
          const wht = parsed.withholdingTax || 0;

          let docDate = parsed.date || "";
          if (docDate) {
            const parts = docDate.split("/");
            if (parts.length === 3) {
              const dd = parts[0].padStart(2, "0");
              const mm = parts[1].padStart(2, "0");
              let yyyy = Number(parts[2]);
              if (yyyy > 2400) yyyy -= 543;
              docDate = `${yyyy}-${mm}-${dd}`;
            }
          }
          const docErrors: string[] = [];
          if (!docDate) docErrors.push("ไม่พบวันที่เอกสาร");
          else {
            const testDate = new Date(docDate + "T00:00:00");
            if (isNaN(testDate.getTime())) docErrors.push("รูปแบบวันที่ไม่ถูกต้อง: " + docDate);
          }

          let archivedFileUrl: string | null = null;
          if (saveLocalFn) {
            try {
              const decodedName = decodeMulterFilename(file.originalname);
              const { objectPath } = saveLocalFn(file.buffer, "application/pdf", decodedName);
              archivedFileUrl = objectPath;
            } catch (saveErr: any) {
              console.log(`[PDF-Import] Failed to archive ${file.originalname}:`, saveErr.message);
            }
          }

          const baseKey = `${file.originalname}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const decodedFileName = decodeMulterFilename(file.originalname);
          const baseDoc = {
            fileName: decodedFileName,
            date: docDate || new Date().toISOString().split("T")[0],
            vendorName: parsed.vendorName || "",
            vendorTaxId: parsed.vendorTaxId || "",
            vendorAddress: parsed.vendorAddress || "",
            vendorBranch: parsed.vendorBranch || "",
            vendorId,
            vendorMatchName,
            isTikTok: parsed.invoiceNo?.startsWith("TTSTHAC") || false,
            isPlatformFee: /Shopee|SPX\s*Express/i.test(parsed.vendorName || "") || parsed.invoiceNo?.startsWith("TRSPEMKP") || parsed.invoiceNo?.startsWith("RCSPXSP") || false,
            platform: parsed.platform || "other",
            docSubType: parsed.docSubType || "mixed",
            invoicePrefix: parsed.invoicePrefix || "",
            archivedFileUrl,
            folderPath: folderPaths[fi] || "",
            hasErrors: docErrors.length > 0,
            errors: docErrors,
          };

          const mapItem = (it: any, idx: number) => ({
            rowNum: idx + 1,
            description: it.description || "",
            productName: it.description || "",
            qty: it.qty || 1,
            unit: it.unit || "ครั้ง",
            unitPrice: it.unitPrice || it.amount || 0,
            discount: 0,
            total: it.amount || 0,
            amount: it.amount || 0,
            vatType: it.vatType || "non_vat",
            accountCode: "",
            accountName: "",
          });

          const round2 = (n: number) => Math.round(n * 100) / 100;

          if (parsed.platform === "myorder") {
            const shipItems = parsed.items.filter((it: any) => /ขนส่ง/.test(it.description || ""));
            const codItems = parsed.items.filter((it: any) => /COD|ปลายทาง|เรียกเก็บเงิน/.test(it.description || ""));

            const groups: Array<{ suffix: string; subType: string; items: any[]; whtRate: number }> = [];
            if (shipItems.length > 0) groups.push({ suffix: "-S", subType: "shipping", items: shipItems, whtRate: 0.01 });
            if (codItems.length > 0) groups.push({ suffix: "-C", subType: "service_fee", items: codItems, whtRate: 0.03 });

            for (const g of groups) {
              const gSubtotal = round2(g.items.reduce((s, it) => s + (it.amount || 0), 0));
              const gVat = round2(g.items.reduce((s, it) => s + (it.vatType === "vat7" ? (it.amount || 0) * 0.07 : 0), 0));
              const gWht = round2(gSubtotal * g.whtRate);
              const gInvoiceNo = (parsed.invoiceNo || "") + g.suffix;
              const gIsDup = parsed.invoiceNo ? usedNos.has(gInvoiceNo) : false;
              documents.push({
                ...baseDoc,
                key: baseKey + g.suffix,
                invoiceNo: gInvoiceNo,
                isDuplicate: gIsDup,
                subtotal: gSubtotal,
                vatAmount: gVat,
                totalAmount: round2(gSubtotal + gVat - gWht),
                withholdingTax: gWht,
                items: g.items.map(mapItem),
                docSubType: g.subType,
              });
            }

            if (groups.length === 0) {
              documents.push({
                ...baseDoc,
                key: baseKey,
                invoiceNo: parsed.invoiceNo || "",
                isDuplicate,
                subtotal,
                vatAmount,
                totalAmount: subtotal + vatAmount - wht,
                withholdingTax: wht,
                items: parsed.items.map(mapItem),
              });
            }
          } else {
            documents.push({
              ...baseDoc,
              key: baseKey,
              invoiceNo: parsed.invoiceNo || "",
              isDuplicate,
              subtotal,
              vatAmount,
              totalAmount: subtotal + vatAmount - wht,
              withholdingTax: wht,
              items: parsed.items.map(mapItem),
            });
          }
        } catch (err: any) {
          errors.push({ fileName: decodeMulterFilename(file.originalname), error: err.message });
        }
      }

      res.json({
        totalFiles: files.length,
        successFiles: documents.length,
        failedFiles: errors.length,
        documents,
        errors,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/expense-daily-batches", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const batches = await db.select().from(expenseDailyBatches)
        .where(and(eq(expenseDailyBatches.companyId, companyId), eq(expenseDailyBatches.status, "active")))
        .orderBy(desc(expenseDailyBatches.batchDate));

      const batchIds = batches.map(b => b.id);
      let expCounts = new Map<number, number>();
      let batchVendors = new Map<number, string[]>();
      if (batchIds.length > 0) {
        const counts = await db.select({
          batchId: expenses.batchId,
          count: count(),
        }).from(expenses)
          .where(and(
            eq(expenses.companyId, companyId),
            inArray(expenses.batchId, batchIds)
          ))
          .groupBy(expenses.batchId);
        for (const c of counts) {
          if (c.batchId) expCounts.set(c.batchId, Number(c.count));
        }

        const vendorRows = await db.select({
          batchId: expenses.batchId,
          vendorName: expenses.vendorName,
        }).from(expenses)
          .where(and(
            eq(expenses.companyId, companyId),
            inArray(expenses.batchId, batchIds)
          ));
        for (const v of vendorRows) {
          if (v.batchId && v.vendorName) {
            const existing = batchVendors.get(v.batchId) || [];
            if (!existing.includes(v.vendorName)) existing.push(v.vendorName);
            batchVendors.set(v.batchId, existing);
          }
        }
      }

      const result = batches.map(b => ({
        ...b,
        actualExpenseCount: expCounts.get(b.id) || 0,
        vendorSummary: (batchVendors.get(b.id) || []).join(", "),
      }));

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/expense-daily-batches/:id/expenses", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const batchId = Number(req.params.id);
      const batchExpenses = await db.select().from(expenses)
        .where(eq(expenses.batchId, batchId))
        .orderBy(expenses.expNo);

      const expIds = batchExpenses.map(e => e.id);
      let itemsByExpense: Record<number, string> = {};
      if (expIds.length > 0) {
        const allItems = await db.select({
          expenseId: expenseItems.expenseId,
          description: expenseItems.description,
          accountName: expenseItems.accountName,
        }).from(expenseItems).where(inArray(expenseItems.expenseId, expIds));
        for (const item of allItems) {
          if (!itemsByExpense[item.expenseId] && (item.description || item.accountName)) {
            itemsByExpense[item.expenseId] = item.description || item.accountName || "";
          }
        }
      }

      const result = batchExpenses.map(e => ({
        ...e,
        firstItemDescription: itemsByExpense[e.id] || null,
      }));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/expense-daily-batches/:id", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      const user = req.user as any;
      const batchId = Number(req.params.id);

      const [batch] = await db.select().from(expenseDailyBatches).where(eq(expenseDailyBatches.id, batchId));
      if (!batch) return res.status(404).json({ message: "ไม่พบ batch" });

      const batchExpenses = await db.select({ id: expenses.id, expNo: expenses.expNo })
        .from(expenses).where(eq(expenses.batchId, batchId));

      let deletedJournals = 0;
      let deletedClientFiles = 0;

      for (const exp of batchExpenses) {
        const expJournals = await db.select({ id: journalEntries.id })
          .from(journalEntries)
          .where(and(eq(journalEntries.sourceDocType, "expense"), eq(journalEntries.sourceDocId, exp.id)));
        for (const ej of expJournals) {
          await db.execute(sql`UPDATE bank_statements SET matched_journal_id = NULL WHERE matched_journal_id = ${ej.id}`);
          await db.delete(journalLines).where(eq(journalLines.journalEntryId, ej.id));
          await db.delete(journalEntries).where(eq(journalEntries.id, ej.id));
          deletedJournals++;
        }

        if (user.tenantId) {
          const files = await db.delete(clientUploadFiles)
            .where(and(
              eq(clientUploadFiles.tenantId, user.tenantId),
              sql`${clientUploadFiles.fileName} LIKE ${exp.expNo + ' -%'}`,
            ))
            .returning({ id: clientUploadFiles.id });
          deletedClientFiles += files.length;
        }

        await db.delete(expenseItems).where(eq(expenseItems.expenseId, exp.id));

        await db.delete(withholdingTaxCerts)
          .where(and(eq(withholdingTaxCerts.sourceDocType, "expense"), eq(withholdingTaxCerts.sourceDocId, exp.id)));
      }

      const batchJournals = await db.select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(eq(journalEntries.sourceDocType, "expense_daily_batch"), eq(journalEntries.sourceDocId, batchId)));
      for (const bj of batchJournals) {
        await db.execute(sql`UPDATE bank_statements SET matched_journal_id = NULL WHERE matched_journal_id = ${bj.id}`);
        await db.delete(journalLines).where(eq(journalLines.journalEntryId, bj.id));
        await db.delete(journalEntries).where(eq(journalEntries.id, bj.id));
        deletedJournals++;
      }

      await db.delete(expenses).where(eq(expenses.batchId, batchId));

      await db.delete(expenseDailyBatches).where(eq(expenseDailyBatches.id, batchId));

      invalidateCompanyReports(batch.companyId);

      console.log(`[DXP] Deleted batch ${batch.batchNo}: ${batchExpenses.length} expenses, ${deletedJournals} journals, ${deletedClientFiles} client files`);

      res.json({
        success: true,
        deleted: {
          batch: batch.batchNo,
          expenses: batchExpenses.length,
          journals: deletedJournals,
          clientFiles: deletedClientFiles,
        },
      });
    } catch (err: any) {
      console.error("[DXP] Delete error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ===================== SHARED PURCHASE IMPORT HELPERS =====================
  function _pimpParseDateBE(val: string): string | null {
    if (!val) return null;
    const str = String(val).trim();
    const parts = str.split("/");
    if (parts.length === 3) {
      const dd = parts[0].padStart(2, "0"), mm = parts[1].padStart(2, "0");
      let yyyy = Number(parts[2]);
      if (yyyy > 2400) yyyy -= 543;
      return `${yyyy}-${mm}-${dd}`;
    }
    if (/^\d{5}$/.test(str)) {
      const d = new Date((Number(str) - 25569) * 86400000);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
    const d = new Date(str);
    return !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : null;
  }

  function _pimpParseFile(buf: Buffer, name: string): any[] {
    const ext = path.extname(name).toLowerCase();
    if (ext === ".csv") {
      let content = buf.toString("utf-8");
      if (!/[\u0E00-\u0E7F]/.test(content) && buf.some((b: number) => b >= 0xA1 && b <= 0xFB)) {
        try { content = new TextDecoder("tis-620").decode(buf); } catch { content = buf.toString("latin1"); }
      }
      const delim = content.split(/\r?\n/)[0].includes("\t") ? "\t" : ",";
      return csvParse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true, delimiter: delim, relax_quotes: true, relax_column_count: true });
    }
    if (ext === ".xlsx" || ext === ".xls") {
      const wb = XLSX.read(buf, { type: "buffer" });
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    }
    throw new Error("รองรับเฉพาะไฟล์ .csv, .xlsx, .xls");
  }

  function _pimpBuildItems(rows: any[], productCodeMap: Map<string, any>): { items: any[]; subtotal: number } {
    const items: any[] = [];
    let subtotal = 0;
    for (const row of rows) {
      const qty = parseFloat(row.qty) || 0, unitPrice = parseFloat(row.unitPrice) || 0, discount = parseFloat(row.discount) || 0;
      const total = Math.round((qty * unitPrice - discount) * 100) / 100;
      const errs: string[] = [];
      if (!row.productName) errs.push("ไม่มีชื่อสินค้า/บริการ");
      if (qty <= 0) errs.push("จำนวนต้องมากกว่า 0");
      if (unitPrice <= 0) errs.push("ราคาต่อหน่วยต้องมากกว่า 0");
      const mp = row.productCode ? productCodeMap.get(row.productCode) : null;
      subtotal += total;
      items.push({ rowNum: row._rowNum, productCode: row.productCode, productName: mp ? (mp.name || row.productName) : row.productName, description: row.description, qty, unit: row.unit || "ชิ้น", unitPrice, discount, total, vatType: row.vatType || "vat7", productId: mp?.id || null, productMatched: !!mp, errors: errs });
    }
    return { items, subtotal };
  }

  function _pimpComputeVat(items: any[], rawSubtotal: number, priceMode: string, wht: number): { vatAmount: number; subtotal: number; totalAmount: number } {
    let vatAmount = 0;
    for (const item of items) {
      if (priceMode === "excluded") vatAmount += item.vatType === "vat7" ? item.total * 0.07 : 0;
      else vatAmount += item.vatType === "vat7" ? (item.total * 7 / 107) : 0;
    }
    vatAmount = Math.round(vatAmount * 100) / 100;
    const subtotal = priceMode === "included" ? Math.round((rawSubtotal - vatAmount) * 100) / 100 : Math.round(rawSubtotal * 100) / 100;
    return { vatAmount, subtotal, totalAmount: Math.round((subtotal + vatAmount - wht) * 100) / 100 };
  }

  function _pimpMatchVendor(first: any, contactList: any[]) {
    if (first.vendorCode) { const m = contactList.find((c: any) => c.code === first.vendorCode); if (m) return m; }
    if (first.vendorTaxId) { const m = contactList.find((c: any) => c.taxId === first.vendorTaxId); if (m) return m; }
    if (first.vendorName) { const m = contactList.find((c: any) => (c.name || "").toLowerCase() === first.vendorName.toLowerCase() || (c.orgName || "").toLowerCase() === first.vendorName.toLowerCase()); if (m) return m; }
    return null;
  }

  const _pimpUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  // ===================== PURCHASE ORDER IMPORT =====================
  app.get("/api/purchase-orders/import/template", (_req, res) => {
    const headers = ["เลขที่เอกสาร","วันที่เอกสาร","วันส่งของ","รหัสผู้ขาย","ชื่อผู้ขาย","เลขประจำตัวผู้เสียภาษี","ที่อยู่ผู้ขาย","สาขา","ผู้ติดต่อ","โทรศัพท์","อีเมล","เครดิต(วัน)","รหัสสินค้า","ชื่อสินค้า/บริการ","รายละเอียด","จำนวน","หน่วย","ราคาต่อหน่วย","ส่วนลด","ประเภท VAT","ภาษีหัก ณ ที่จ่าย","โหมดราคา","หมายเหตุ","อ้างอิง"];
    const sample1 = ["PO6801001","01/01/2568","15/01/2568","V0001","บจ. ซัพพลายเออร์ จำกัด","0105600000001","456 ถ.พระราม 4 กรุงเทพฯ","สำนักงานใหญ่","คุณสมหมาย","02-987-6543","vendor@example.com","30","P001","วัตถุดิบ A","","100","กิโลกรัม","500","0","vat7","0","excluded","",""];
    const sample2 = ["PO6801001","","","","","","","","","","","","P002","วัตถุดิบ B","","50","กิโลกรัม","300","0","vat7","","","",""];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws, "ใบสั่งซื้อ");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="template_purchase_orders.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  app.post("/api/purchase-orders/import/preview", requireAuth, requireModule("purchases"), _pimpUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์" });
      const companyId = Number(req.body.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });
      const rawRows = _pimpParseFile(req.file.buffer, req.file.originalname);
      if (!rawRows.length) return res.status(400).json({ message: "ไม่พบข้อมูลในไฟล์" });
      if (rawRows.length > 10000) return res.status(400).json({ message: "รองรับสูงสุด 10,000 แถวต่อครั้ง" });
      const [companyProducts, companyContacts, existingRows] = await Promise.all([
        db.select().from(products).where(eq(products.companyId, companyId)),
        db.select().from(contacts).where(eq(contacts.companyId, companyId)),
        db.select({ n: purchaseOrders.poNo }).from(purchaseOrders).where(eq(purchaseOrders.companyId, companyId)),
      ]);
      const productCodeMap = new Map(companyProducts.filter(p => p.code).map(p => [p.code!, p]));
      const existingNos = new Set(existingRows.map(e => e.n));
      const COL_MAP: Record<string,string> = { "เลขที่เอกสาร":"poNo","วันที่เอกสาร":"poDate","วันส่งของ":"deliveryDate","รหัสผู้ขาย":"vendorCode","ชื่อผู้ขาย":"vendorName","เลขประจำตัวผู้เสียภาษี":"vendorTaxId","ที่อยู่ผู้ขาย":"vendorAddress","สาขา":"branch","ผู้ติดต่อ":"contactPerson","โทรศัพท์":"contactPhone","อีเมล":"contactEmail","เครดิต(วัน)":"creditDays","รหัสสินค้า":"productCode","ชื่อสินค้า/บริการ":"productName","รายละเอียด":"description","จำนวน":"qty","หน่วย":"unit","ราคาต่อหน่วย":"unitPrice","ส่วนลด":"discount","ประเภท VAT":"vatType","ภาษีหัก ณ ที่จ่าย":"withholdingTax","โหมดราคา":"priceMode","หมายเหตุ":"notes","อ้างอิง":"refDoc" };
      const mapped = rawRows.map((row, idx) => { const r: any = { _rowNum: idx + 2 }; for (const [k, v] of Object.entries(COL_MAP)) r[v] = row[k] !== undefined ? String(row[k]).trim() : ""; return r; });
      const grouped = new Map<string, any[]>(); let ai = 0;
      for (const row of mapped) { const k = row.poNo || `__auto_${++ai}`; if (!row.poNo) row.poNo = ""; if (!grouped.has(k)) grouped.set(k, []); grouped.get(k)!.push(row); }
      const documents: any[] = [];
      for (const [key, rows] of Array.from(grouped.entries())) {
        const first = rows[0];
        const poDate = _pimpParseDateBE(first.poDate), deliveryDate = _pimpParseDateBE(first.deliveryDate);
        const errors: string[] = [];
        if (!poDate) errors.push("วันที่เอกสารไม่ถูกต้อง");
        if (!first.vendorName) errors.push("ไม่มีชื่อผู้ขาย");
        const isDuplicate = !!(first.poNo && existingNos.has(first.poNo));
        if (isDuplicate) errors.push("เลขที่เอกสารซ้ำในระบบ");
        const vm = _pimpMatchVendor(first, companyContacts);
        const { items, subtotal: rawSub } = _pimpBuildItems(rows, productCodeMap);
        const priceMode = first.priceMode || "excluded", wht = parseFloat(first.withholdingTax) || 0;
        const { vatAmount, subtotal, totalAmount } = _pimpComputeVat(items, rawSub, priceMode, wht);
        documents.push({ key, poNo: first.poNo || "(สร้างอัตโนมัติ)", poDate: poDate || "", deliveryDate: deliveryDate || "", vendorCode: first.vendorCode, vendorName: first.vendorName, vendorTaxId: first.vendorTaxId, vendorAddress: first.vendorAddress, branch: first.branch, contactPerson: first.contactPerson, contactPhone: first.contactPhone, contactEmail: first.contactEmail, creditDays: parseInt(first.creditDays) || null, notes: first.notes, refDoc: first.refDoc, priceMode, withholdingTax: wht, subtotal, vatAmount, totalAmount, vendorId: vm?.id || null, vendorMatchName: vm ? (vm.name || vm.orgName) : null, items, errors, hasErrors: errors.length > 0 || items.some((i: any) => i.errors.length > 0), isDuplicate });
      }
      res.json({ totalRows: rawRows.length, totalDocuments: documents.length, validDocuments: documents.filter(d => !d.hasErrors).length, invalidDocuments: documents.filter(d => d.hasErrors).length, documents });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-orders/import/create", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      if (!(await checkDocumentLimit(req, res))) return;
      const user = req.user as any;
      const { companyId, documents } = req.body;
      if (!companyId || !Array.isArray(documents)) return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
      const created: any[] = [], skipped: any[] = [], errors: any[] = [];
      for (const doc of documents) {
        try {
          if (doc.poNo && doc.poNo !== "(สร้างอัตโนมัติ)") {
            const dup = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.poNo, doc.poNo)));
            if (dup.length > 0) { skipped.push({ poNo: doc.poNo, reason: "เลขที่เอกสารซ้ำ" }); continue; }
          }
          let poNo = doc.poNo;
          if (!poNo || poNo === "(สร้างอัตโนมัติ)") poNo = await getNextDocNo(companyId, "PO", purchaseOrders, purchaseOrders.poNo, purchaseOrders.companyId, doc.poDate);
          const validItems = (doc.items || []).filter((i: any) => i.productName && (parseFloat(i.qty) || 0) > 0 && (parseFloat(i.unitPrice) || 0) > 0);
          if (!validItems.length) { errors.push({ poNo, error: "ไม่มีรายการที่ถูกต้อง" }); continue; }
          const result = await db.transaction(async (tx) => {
            const [nd] = await tx.insert(purchaseOrders).values({ companyId, poNo, poDate: doc.poDate, deliveryDate: doc.deliveryDate || null, vendorId: doc.vendorId ? Number(doc.vendorId) : null, vendorCode: doc.vendorCode || null, vendorName: doc.vendorName, vendorAddress: doc.vendorAddress || null, vendorTaxId: doc.vendorTaxId || null, branch: doc.branch || null, contactPerson: doc.contactPerson || null, contactPhone: doc.contactPhone || null, contactEmail: doc.contactEmail || null, creditDays: doc.creditDays ? Number(doc.creditDays) : null, subtotal: String(doc.subtotal || "0"), discountAmount: "0", vatAmount: String(doc.vatAmount || "0"), totalAmount: String(doc.totalAmount || "0"), withholdingTax: String(doc.withholdingTax || "0"), status: "draft", priceMode: doc.priceMode || "excluded", docPrefix: "PO", notes: doc.notes || null, refDoc: doc.refDoc || null, createdBy: user.id }).returning();
            for (const item of validItems) await tx.insert(purchaseOrderItems).values({ purchaseOrderId: nd.id, productId: item.productId ? Number(item.productId) : null, productCode: item.productCode || null, productName: item.productName, description: item.description || null, qty: String(item.qty || "1"), unit: item.unit || "ชิ้น", unitPrice: String(item.unitPrice || "0"), discount: String(item.discount || "0"), discountType: "amount", total: String(item.total || "0"), vatType: item.vatType || "vat7" });
            return nd;
          });
          logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "purchase_order", entityId: String(result.id), entityName: poNo }).catch(() => {});
          created.push({ poNo, id: result.id });
        } catch (e: any) { errors.push({ poNo: doc.poNo || "(auto)", error: e.message }); }
      }
      const createdIds = created.map((c: any) => c.id);
      if (createdIds.length > 0) { const [b] = await db.insert(documentImportBatches).values({ companyId, docType: "purchase_order", totalCreated: createdIds.length, totalSkipped: skipped.length, totalErrors: errors.length, createdDocIds: JSON.stringify(createdIds), createdBy: user.id }).returning(); return res.json({ created, skipped, errors, total: documents.length, batchId: b.id }); }
      res.json({ created, skipped, errors, total: documents.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ===================== PURCHASE REQUEST IMPORT =====================
  app.get("/api/purchase-requests/import/template", (_req, res) => {
    const headers = ["เลขที่เอกสาร","วันที่เอกสาร","วันส่งของ","รหัสผู้ขาย","ชื่อผู้ขาย","เลขประจำตัวผู้เสียภาษี","ที่อยู่ผู้ขาย","สาขา","ผู้ติดต่อ","โทรศัพท์","อีเมล","เครดิต(วัน)","รหัสสินค้า","ชื่อสินค้า/บริการ","รายละเอียด","จำนวน","หน่วย","ราคาต่อหน่วย","ส่วนลด","ประเภท VAT","ภาษีหัก ณ ที่จ่าย","โหมดราคา","หมายเหตุ","อ้างอิง"];
    const sample1 = ["PR6801001","01/01/2568","15/01/2568","V0001","บจ. ซัพพลายเออร์ จำกัด","0105600000001","456 ถ.พระราม 4 กรุงเทพฯ","สำนักงานใหญ่","คุณสมหมาย","02-987-6543","vendor@example.com","30","P001","วัตถุดิบ A","","100","กิโลกรัม","500","0","vat7","0","excluded","",""];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, sample1]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, ws, "ใบขอซื้อ");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="template_purchase_requests.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  app.post("/api/purchase-requests/import/preview", requireAuth, requireModule("purchases"), _pimpUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์" });
      const companyId = Number(req.body.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });
      const rawRows = _pimpParseFile(req.file.buffer, req.file.originalname);
      if (!rawRows.length) return res.status(400).json({ message: "ไม่พบข้อมูลในไฟล์" });
      if (rawRows.length > 10000) return res.status(400).json({ message: "รองรับสูงสุด 10,000 แถวต่อครั้ง" });
      const [companyProducts, companyContacts, existingRows] = await Promise.all([
        db.select().from(products).where(eq(products.companyId, companyId)),
        db.select().from(contacts).where(eq(contacts.companyId, companyId)),
        db.select({ n: purchaseRequests.prNo }).from(purchaseRequests).where(eq(purchaseRequests.companyId, companyId)),
      ]);
      const productCodeMap = new Map(companyProducts.filter(p => p.code).map(p => [p.code!, p]));
      const existingNos = new Set(existingRows.map(e => e.n));
      const COL_MAP: Record<string,string> = { "เลขที่เอกสาร":"prNo","วันที่เอกสาร":"prDate","วันส่งของ":"deliveryDate","รหัสผู้ขาย":"vendorCode","ชื่อผู้ขาย":"vendorName","เลขประจำตัวผู้เสียภาษี":"vendorTaxId","ที่อยู่ผู้ขาย":"vendorAddress","สาขา":"branch","ผู้ติดต่อ":"contactPerson","โทรศัพท์":"contactPhone","อีเมล":"contactEmail","เครดิต(วัน)":"creditDays","รหัสสินค้า":"productCode","ชื่อสินค้า/บริการ":"productName","รายละเอียด":"description","จำนวน":"qty","หน่วย":"unit","ราคาต่อหน่วย":"unitPrice","ส่วนลด":"discount","ประเภท VAT":"vatType","ภาษีหัก ณ ที่จ่าย":"withholdingTax","โหมดราคา":"priceMode","หมายเหตุ":"notes","อ้างอิง":"refDoc" };
      const mapped = rawRows.map((row, idx) => { const r: any = { _rowNum: idx + 2 }; for (const [k, v] of Object.entries(COL_MAP)) r[v] = row[k] !== undefined ? String(row[k]).trim() : ""; return r; });
      const grouped = new Map<string, any[]>(); let ai = 0;
      for (const row of mapped) { const k = row.prNo || `__auto_${++ai}`; if (!row.prNo) row.prNo = ""; if (!grouped.has(k)) grouped.set(k, []); grouped.get(k)!.push(row); }
      const documents: any[] = [];
      for (const [key, rows] of Array.from(grouped.entries())) {
        const first = rows[0];
        const prDate = _pimpParseDateBE(first.prDate), deliveryDate = _pimpParseDateBE(first.deliveryDate);
        const errors: string[] = [];
        if (!prDate) errors.push("วันที่เอกสารไม่ถูกต้อง");
        if (!first.vendorName) errors.push("ไม่มีชื่อผู้ขาย");
        const isDuplicate = !!(first.prNo && existingNos.has(first.prNo));
        if (isDuplicate) errors.push("เลขที่เอกสารซ้ำในระบบ");
        const vm = _pimpMatchVendor(first, companyContacts);
        const { items, subtotal: rawSub } = _pimpBuildItems(rows, productCodeMap);
        const priceMode = first.priceMode || "excluded", wht = parseFloat(first.withholdingTax) || 0;
        const { vatAmount, subtotal, totalAmount } = _pimpComputeVat(items, rawSub, priceMode, wht);
        documents.push({ key, prNo: first.prNo || "(สร้างอัตโนมัติ)", prDate: prDate || "", deliveryDate: deliveryDate || "", vendorCode: first.vendorCode, vendorName: first.vendorName, vendorTaxId: first.vendorTaxId, vendorAddress: first.vendorAddress, branch: first.branch, contactPerson: first.contactPerson, contactPhone: first.contactPhone, contactEmail: first.contactEmail, creditDays: parseInt(first.creditDays) || null, notes: first.notes, refDoc: first.refDoc, priceMode, withholdingTax: wht, subtotal, vatAmount, totalAmount, vendorId: vm?.id || null, vendorMatchName: vm ? (vm.name || vm.orgName) : null, items, errors, hasErrors: errors.length > 0 || items.some((i: any) => i.errors.length > 0), isDuplicate });
      }
      res.json({ totalRows: rawRows.length, totalDocuments: documents.length, validDocuments: documents.filter(d => !d.hasErrors).length, invalidDocuments: documents.filter(d => d.hasErrors).length, documents });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/purchase-requests/import/create", requireAuth, requireModule("purchases"), async (req, res) => {
    try {
      if (!(await checkDocumentLimit(req, res))) return;
      const user = req.user as any;
      const { companyId, documents } = req.body;
      if (!companyId || !Array.isArray(documents)) return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
      const created: any[] = [], skipped: any[] = [], errors: any[] = [];
      for (const doc of documents) {
        try {
          if (doc.prNo && doc.prNo !== "(สร้างอัตโนมัติ)") {
            const dup = await db.select({ id: purchaseRequests.id }).from(purchaseRequests).where(and(eq(purchaseRequests.companyId, companyId), eq(purchaseRequests.prNo, doc.prNo)));
            if (dup.length > 0) { skipped.push({ prNo: doc.prNo, reason: "เลขที่เอกสารซ้ำ" }); continue; }
          }
          let prNo = doc.prNo;
          if (!prNo || prNo === "(สร้างอัตโนมัติ)") prNo = await getNextDocNo(companyId, "PR", purchaseRequests, purchaseRequests.prNo, purchaseRequests.companyId, doc.prDate);
          const validItems = (doc.items || []).filter((i: any) => i.productName && (parseFloat(i.qty) || 0) > 0 && (parseFloat(i.unitPrice) || 0) > 0);
          if (!validItems.length) { errors.push({ prNo, error: "ไม่มีรายการที่ถูกต้อง" }); continue; }
          const result = await db.transaction(async (tx) => {
            const [nd] = await tx.insert(purchaseRequests).values({ companyId, prNo, prDate: doc.prDate, deliveryDate: doc.deliveryDate || null, vendorId: doc.vendorId ? Number(doc.vendorId) : null, vendorCode: doc.vendorCode || null, vendorName: doc.vendorName, vendorAddress: doc.vendorAddress || null, vendorTaxId: doc.vendorTaxId || null, branch: doc.branch || null, contactPerson: doc.contactPerson || null, contactPhone: doc.contactPhone || null, contactEmail: doc.contactEmail || null, creditDays: doc.creditDays ? Number(doc.creditDays) : null, subtotal: String(doc.subtotal || "0"), discountAmount: "0", vatAmount: String(doc.vatAmount || "0"), totalAmount: String(doc.totalAmount || "0"), withholdingTax: String(doc.withholdingTax || "0"), status: "draft", priceMode: doc.priceMode || "excluded", docPrefix: "PR", notes: doc.notes || null, refDoc: doc.refDoc || null, createdBy: user.id }).returning();
            for (const item of validItems) await tx.insert(purchaseRequestItems).values({ purchaseRequestId: nd.id, productId: item.productId ? Number(item.productId) : null, productCode: item.productCode || null, productName: item.productName, description: item.description || null, qty: String(item.qty || "1"), unit: item.unit || "ชิ้น", unitPrice: String(item.unitPrice || "0"), discount: String(item.discount || "0"), discountType: "amount", total: String(item.total || "0"), vatType: item.vatType || "vat7" });
            return nd;
          });
          logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "purchase_request", entityId: String(result.id), entityName: prNo }).catch(() => {});
          created.push({ prNo, id: result.id });
        } catch (e: any) { errors.push({ prNo: doc.prNo || "(auto)", error: e.message }); }
      }
      const createdIds = created.map((c: any) => c.id);
      if (createdIds.length > 0) { const [b] = await db.insert(documentImportBatches).values({ companyId, docType: "purchase_request", totalCreated: createdIds.length, totalSkipped: skipped.length, totalErrors: errors.length, createdDocIds: JSON.stringify(createdIds), createdBy: user.id }).returning(); return res.json({ created, skipped, errors, total: documents.length, batchId: b.id }); }
      res.json({ created, skipped, errors, total: documents.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

}
