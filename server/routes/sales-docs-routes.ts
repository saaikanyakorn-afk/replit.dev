import type { Express, Request, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { eq, desc, and, inArray, count, sql, isNull } from "drizzle-orm";
import { salesOrders, invoices, salesOrderItems, quotations, companies, documentSettings, quotationItems, users, invoiceItems, journalEntries, journalLines, accounts, products, contacts, documentImportBatches, taxInvoices, taxInvoiceItems, receipts, receiptItems, receiptLinkedDocs, purchaseInvoices, expenses, commissionRules, commissionRecords, employees, liveCfOrders, salesCreditNotes, billingNotes, billingNoteLinkedDocs, purchaseRequests, bidComparisons, purchaseOrders, productBundles, purchaseDebitNotes, approvalRequests, stockMovements, warehouses, warehouseStockLevels, paymentVouchers, paymentVoucherLinkedDocs } from "@shared/schema";
import { gte, lte, or } from "drizzle-orm";
import { requireAuth, requireRole, requireAnyModule, getCompanyTenantId, checkDocOwnership } from "../route-middleware";
import { getNextDocNo, validateDocNo, getNextJournalEntryNo, createAutoJournalEntry, resolvePaymentMethodAccountCode, logActivity, checkDocumentLimit, deleteStockMovementsForDoc, deleteJournalEntriesForDoc, recomputePaymentStatus, deductStockBundleAware, upsertWarehouseStockLevel, upsertWarehouseReservedQty, reverseWarehouseStockBundleAware, getInventoryTriggers } from "../route-helpers";
import { parsePagination, paginatedResponse } from "./pagination";
import multer from "multer";
import * as XLSX from "xlsx";
import path from "path";
import { parse as csvParse } from "csv-parse/sync";

async function fetchInvoiceItems(invoiceId: number): Promise<any[]> {
  const rows = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId)).orderBy(invoiceItems.id);
  const extras = await db.execute(sql`SELECT id, warehouse_id AS "warehouseId" FROM invoice_items WHERE invoice_id = ${invoiceId} ORDER BY id`);
  const warehouseMap: Record<number, number | null> = {};
  for (const r of extras.rows as any[]) warehouseMap[r.id] = r.warehouseId ?? null;
  return rows.map(r => ({ ...r, warehouseId: warehouseMap[r.id] ?? null }));
}
async function fetchTaxInvoiceItems(taxInvoiceId: number): Promise<any[]> {
  const rows = await db.select().from(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, taxInvoiceId)).orderBy(taxInvoiceItems.id);
  const extras = await db.execute(sql`SELECT id, warehouse_id AS "warehouseId" FROM tax_invoice_items WHERE tax_invoice_id = ${taxInvoiceId} ORDER BY id`);
  const warehouseMap: Record<number, number | null> = {};
  for (const r of extras.rows as any[]) warehouseMap[r.id] = r.warehouseId ?? null;
  return rows.map(r => ({ ...r, warehouseId: warehouseMap[r.id] ?? null }));
}
async function fetchSalesOrderItems(salesOrderId: number): Promise<any[]> {
  const rows = await db.select().from(salesOrderItems).where(eq(salesOrderItems.salesOrderId, salesOrderId)).orderBy(salesOrderItems.id);
  const extras = await db.execute(sql`SELECT id, warehouse_id AS "warehouseId" FROM sales_order_items WHERE sales_order_id = ${salesOrderId} ORDER BY id`);
  const warehouseMap: Record<number, number | null> = {};
  for (const r of extras.rows as any[]) warehouseMap[r.id] = r.warehouseId ?? null;
  return rows.map(r => ({ ...r, warehouseId: warehouseMap[r.id] ?? null }));
}

async function getCompanySingleWarehouseId(companyId: number): Promise<number | null> {
  const whs = await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.companyId, companyId));
  return whs.length === 1 ? whs[0].id : null;
}
async function reserveSOStock(items: any[], companyId: number) {
  const singleWid = await getCompanySingleWarehouseId(companyId);
  for (const item of items) {
    if (!item.productId) continue;
    const qty = parseFloat(String(item.qty || "0"));
    if (qty <= 0) continue;
    const wid = item.warehouseId || singleWid;
    if (!wid) continue;
    await upsertWarehouseReservedQty(companyId, Number(item.productId), wid, qty);
  }
}
async function releaseSOStock(items: any[], companyId: number) {
  const singleWid = await getCompanySingleWarehouseId(companyId);
  for (const item of items) {
    if (!item.productId) continue;
    const qty = parseFloat(String(item.qty || "0"));
    if (qty <= 0) continue;
    const wid = item.warehouseId || singleWid;
    if (!wid) continue;
    await upsertWarehouseReservedQty(companyId, Number(item.productId), wid, -qty);
  }
}

async function fetchReceiptItems(receiptId: number): Promise<any[]> {
  const rows = await db.select().from(receiptItems).where(eq(receiptItems.receiptId, receiptId)).orderBy(receiptItems.id);
  const extras = await db.execute(sql`SELECT id, warehouse_id AS "warehouseId" FROM receipt_items WHERE receipt_id = ${receiptId} ORDER BY id`);
  const warehouseMap: Record<number, number | null> = {};
  for (const r of extras.rows as any[]) warehouseMap[r.id] = r.warehouseId ?? null;
  return rows.map(r => ({ ...r, warehouseId: warehouseMap[r.id] ?? null }));
}

export function registerSalesDocsRoutes(app: Express) {
// ========== Sales Orders ==========
app.get("/api/sales-orders", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const conditions: any[] = [eq(salesOrders.companyId, companyId)];
    if (req.query.status) conditions.push(eq(salesOrders.status, String(req.query.status)));
    if (req.query.paymentStatus) conditions.push(eq(salesOrders.paymentStatus, String(req.query.paymentStatus)));
    if (req.query.channel) conditions.push(eq(salesOrders.channel, String(req.query.channel)));
    if (req.query.search) {
      const s = '%' + String(req.query.search) + '%';
      conditions.push(sql`(${salesOrders.orderNo} ILIKE ${s} OR ${salesOrders.customerName} ILIKE ${s} OR ${salesOrders.channelOrderNo} ILIKE ${s})`);
    }
    const whereClause = and(...conditions);
    let orders: any[];
    if (req.query.page) {
      const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
      const [{ total }] = await db.select({ total: count() }).from(salesOrders).where(whereClause);
      orders = await db.select().from(salesOrders).where(whereClause).orderBy(desc(salesOrders.orderDate), desc(salesOrders.id)).limit(pageSize).offset(offset);
      const soIds = orders.map((o: any) => o.id);
      let convertedMap: Record<number, number> = {};
      try {
        if (soIds.length > 0) {
          const invoiceRows = await db.select({ soid: invoices.salesOrderId, total: sql<string>`COALESCE(SUM(${invoices.totalAmount}::numeric), 0)` }).from(invoices).where(and(inArray(invoices.salesOrderId, soIds as number[]), eq(invoices.companyId, companyId))).groupBy(invoices.salesOrderId);
          for (const r of invoiceRows) { if (r.soid) convertedMap[r.soid] = parseFloat(r.total || "0"); }
        }
      } catch (e) { console.error("[sales-orders] convertedAmount calc error:", e); }
      const enriched = orders.map((o: any) => ({ ...o, convertedAmount: convertedMap[o.id] || 0 }));
      return res.json(paginatedResponse(enriched, Number(total), { page, pageSize, offset }));
    }
    orders = await db.select().from(salesOrders).where(whereClause).orderBy(desc(salesOrders.orderDate), desc(salesOrders.id));
    const soIds = orders.map((o: any) => o.id);
    let convertedMap: Record<number, number> = {};
    try {
      if (soIds.length > 0) {
        const invoiceRows = await db.select({ soid: invoices.salesOrderId, total: sql<string>`COALESCE(SUM(${invoices.totalAmount}::numeric), 0)` }).from(invoices).where(and(inArray(invoices.salesOrderId, soIds as number[]), eq(invoices.companyId, companyId))).groupBy(invoices.salesOrderId);
        for (const r of invoiceRows) { if (r.soid) convertedMap[r.soid] = parseFloat(r.total || "0"); }
      }
    } catch (e) { console.error("[sales-orders] convertedAmount calc error:", e); }
    res.json(orders.map((o: any) => ({ ...o, convertedAmount: convertedMap[o.id] || 0 })));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/sales-orders/stats", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const stats = await storage.getSalesOrderStats(companyId);
    res.json(stats);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/sales-orders/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const order = await storage.getSalesOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "ไม่พบรายการขาย" });
    const items = await fetchSalesOrderItems(order.id);
    let createdByName = "-";
    let updatedByName = "-";
    if (order.createdBy) { const u = await storage.getUser(order.createdBy); if (u) createdByName = u.fullName; }
    if ((order as any).updatedBy) { const u = await storage.getUser((order as any).updatedBy); if (u) updatedByName = u.fullName; }
    res.json({ ...order, items, createdByName, updatedByName });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/sales-orders", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const { items, ...body } = req.body;
    if (!body.shippingDate) body.shippingDate = null;
    if (!body.orderDate) body.orderDate = new Date().toISOString().split("T")[0];
    if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
    else body.creditDays = Number(body.creditDays) || null;
    if (body.customerId === "" || body.customerId === undefined) body.customerId = null;
    else body.customerId = Number(body.customerId) || null;
    if (body.ecommerceOrderId === "" || body.ecommerceOrderId === undefined) body.ecommerceOrderId = null;
    const user = req.user as any;
    body.createdBy = user.id;
    if (!body.orderNo) {
      const prefix = body.docPrefix || "SO";
      body.orderNo = await getNextDocNo(Number(body.companyId), prefix, salesOrders, salesOrders.orderNo, salesOrders.companyId, body.orderDate);
    } else {
      const prefix = body.docPrefix || "SO";
      const fmtCheck = await validateDocNo(Number(body.companyId), body.orderNo, prefix, body.orderDate);
      if (!fmtCheck.valid) {
        body.orderNo = await getNextDocNo(Number(body.companyId), prefix, salesOrders, salesOrders.orderNo, salesOrders.companyId, body.orderDate);
      }
    }
    const order = await storage.createSalesOrder(body);
    if (items && Array.isArray(items) && items.length > 0) {
      const itemValues = items.map((item: any) => {
        const rawDiscount = String(item.discount || "0");
        const isPercent = rawDiscount.includes("%");
        const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
        return {
          salesOrderId: order.id,
          productId: item.productId ? Number(item.productId) : null,
          productCode: item.productCode || null,
          sku: item.productCode || null,
          productName: item.productName || "",
          description: item.description || null,
          qty: String(item.qty || "1"),
          unit: item.unit || "ชิ้น",
          unitPrice: String(item.unitPrice || "0"),
          discount: String(discountNum),
          discountType: isPercent ? "percent" : "amount",
          total: String(item.total || "0"),
          vatType: item.vatType || "vat7",
        };
      });
      const insertedItems = await db.insert(salesOrderItems).values(itemValues).returning({ id: salesOrderItems.id });
      for (let i = 0; i < insertedItems.length; i++) {
        if (items[i]?.warehouseId) {
          await db.execute(sql`UPDATE sales_order_items SET warehouse_id = ${Number(items[i].warehouseId)} WHERE id = ${insertedItems[i].id}`);
        }
      }
    }
    const savedItems = await fetchSalesOrderItems(order.id);
    try { await reserveSOStock(savedItems, Number(body.companyId)); } catch (e: any) { console.error("[SO-CREATE] reserve failed:", e.message); }
    logActivity({ companyId: Number(body.companyId), userId: user.id, userName: user.username, action: "create", entityType: "sales_order", entityId: String(order.id), entityName: body.orderNo || "" }).catch(() => {});
    res.status(201).json({ ...order, items: savedItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/sales-orders/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const { items, ...body } = req.body;
    if (body.shippingDate === "") body.shippingDate = null;
    if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
    else body.creditDays = Number(body.creditDays) || null;
    if (body.customerId === "" || body.customerId === undefined) body.customerId = null;
    else body.customerId = Number(body.customerId) || null;
    if (body.ecommerceOrderId === "" || body.ecommerceOrderId === undefined) body.ecommerceOrderId = null;
    const user = req.user as any;
    body.updatedBy = user.id;
    const order = await storage.updateSalesOrder(Number(req.params.id), body);
    if (!order) return res.status(404).json({ message: "ไม่พบรายการขาย" });
    let oldItems: any[] = [];
    if (items && Array.isArray(items)) {
      oldItems = await fetchSalesOrderItems(order.id);
      await storage.deleteSalesOrderItems(order.id);
      if (items.length > 0) {
        const itemValues = items.map((item: any) => {
          const rawDiscount = String(item.discount || "0");
          const isPercent = rawDiscount.includes("%");
          const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
          return {
            salesOrderId: order.id,
            productId: item.productId ? Number(item.productId) : null,
            productCode: item.productCode || null,
            sku: item.productCode || null,
            productName: item.productName || "",
            description: item.description || null,
            qty: String(item.qty || "1"),
            unit: item.unit || "ชิ้น",
            unitPrice: String(item.unitPrice || "0"),
            discount: String(discountNum),
            discountType: isPercent ? "percent" : "amount",
            total: String(item.total || "0"),
            vatType: item.vatType || "vat7",
          };
        });
        const insertedItems = await db.insert(salesOrderItems).values(itemValues).returning({ id: salesOrderItems.id });
        for (let i = 0; i < insertedItems.length; i++) {
          if (items[i]?.warehouseId) {
            await db.execute(sql`UPDATE sales_order_items SET warehouse_id = ${Number(items[i].warehouseId)} WHERE id = ${insertedItems[i].id}`);
          }
        }
      }
    }
    const savedItems = await fetchSalesOrderItems(order.id);
    try {
      await releaseSOStock(oldItems, order.companyId);
      await reserveSOStock(savedItems, order.companyId);
    } catch (e: any) { console.error("[SO-UPDATE] reserve failed:", e.message); }
    res.json({ ...order, items: savedItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/sales-orders/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const existing = await storage.getSalesOrder(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "ไม่พบรายการขาย" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    // cascade protection: ต้องลบเอกสารปลายทางก่อน
    const linkedIV = await db.select({ id: invoices.id, no: invoices.invoiceNo }).from(invoices).where(eq(invoices.salesOrderId, existing.id));
    if (linkedIV.length > 0) return res.status(400).json({ message: `ไม่สามารถลบได้ เนื่องจากมีใบแจ้งหนี้เชื่อมอยู่:\n${linkedIV.map(r => r.no).join(", ")}\nกรุณาลบเอกสารที่เชื่อมก่อน` });
    const soItemsForRelease = await fetchSalesOrderItems(existing.id);
    await db.transaction(async (tx) => {
      await tx.delete(salesOrderItems).where(eq(salesOrderItems.salesOrderId, existing.id));
      await tx.delete(salesOrders).where(eq(salesOrders.id, existing.id));
    });
    try { await releaseSOStock(soItemsForRelease, existing.companyId); } catch (e: any) { console.error("[SO-DELETE] release failed:", e.message); }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/sales-orders/bulk-delete", requireAuth, requireAnyModule("sales", "ecommerce"), requireRole("admin", "owner", "super_admin"), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "กรุณาระบุรายการที่ต้องการลบ" });
    const user = req.user as any;
    let deleted = 0; const errors: string[] = [];
    for (const id of ids) {
      try {
        const existing = await storage.getSalesOrder(Number(id));
        if (!existing) { errors.push(`#${id}: ไม่พบ`); continue; }
        await db.transaction(async (tx) => {
          await tx.delete(salesOrderItems).where(eq(salesOrderItems.salesOrderId, existing.id));
          await tx.delete(salesOrders).where(eq(salesOrders.id, existing.id));
        });
        logActivity({ companyId: existing.companyId, userId: user.id, userName: user.username, action: "delete", entityType: "sales_order", entityId: String(existing.id), entityName: existing.orderNo }).catch(() => {});
        deleted++;
      } catch (e: any) { errors.push(`#${id}: ${e.message}`); }
    }
    res.json({ deleted, errors, total: ids.length });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/sales-orders/:id/share", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const order = await storage.getSalesOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "ไม่พบรายการขาย" });
    let token = (order as any).shareToken;
    if (!token) {
      const { randomBytes } = await import("crypto");
      token = randomBytes(24).toString("hex");
      await db.update(salesOrders).set({ shareToken: token }).where(eq(salesOrders.id, order.id));
    }
    res.json({ shareToken: token });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/sales-orders/:id/clone", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const order = await storage.getSalesOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "ไม่พบรายการขาย" });
    const items = await storage.getSalesOrderItems(order.id);
    const prefix = order.docPrefix || "SO";
    const orderNo = await getNextDocNo(order.companyId, prefix, salesOrders, salesOrders.orderNo, salesOrders.companyId, order.orderDate);
    const user = req.user as any;
    const cloned = await storage.createSalesOrder({
      companyId: order.companyId,
      orderNo,
      orderDate: new Date().toISOString().split("T")[0],
      customerId: order.customerId,
      customerCode: order.customerCode,
      customerName: order.customerName,
      customerAddress: order.customerAddress,
      customerTaxId: order.customerTaxId,
      branch: order.branch,
      contactPerson: order.contactPerson,
      contactPhone: order.contactPhone,
      contactEmail: order.contactEmail,
      creditDays: order.creditDays,
      channel: order.channel,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      vatAmount: order.vatAmount,
      shippingFee: order.shippingFee,
      totalAmount: order.totalAmount,
      withholdingTax: order.withholdingTax,
      status: "pending",
      paymentStatus: "unpaid",
      paymentTerms: order.paymentTerms,
      notes: order.notes,
      internalNotes: order.internalNotes,
      salesperson: order.salesperson,
      department: order.department,
      project: order.project,
      refDoc: order.refDoc,
      docPrefix: order.docPrefix,
      priceMode: order.priceMode,
      linkJournal: order.linkJournal,
      createdBy: user.id,
    } as any);
    if (items.length > 0) {
      await db.insert(salesOrderItems).values(items.map((item: any) => ({
        salesOrderId: cloned.id,
        productId: item.productId,
        productCode: item.productCode,
        sku: item.sku,
        productName: item.productName,
        description: item.description,
        qty: item.qty,
        unit: item.unit,
        unitPrice: item.unitPrice,
        discount: item.discount,
        discountType: item.discountType,
        total: item.total,
        vatType: item.vatType,
      })));
    }
    res.status(201).json(cloned);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/sales-orders/:id/items", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const items = await storage.getSalesOrderItems(Number(req.params.id));
    res.json(items);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/sales-orders/:id/items", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const item = await storage.createSalesOrderItem({ ...req.body, salesOrderId: Number(req.params.id) });
    res.status(201).json(item);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Quotation routes
app.get("/api/quotations", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const filters: any = {};
    if (req.query.status) filters.status = req.query.status;
    if (req.query.search) filters.search = req.query.search;
    const list = await storage.getQuotations(companyId, filters);
    const userIds = Array.from(new Set(list.map(q => q.createdBy).concat(list.map(q => q.updatedBy)).filter(Boolean))) as number[];
    const userMap: Record<number, string> = {};
    for (const uid of userIds) {
      try { const u = await storage.getUser(uid); if (u) userMap[uid] = u.username; } catch {}
    }
    let convertedMap: Record<number, number> = {};
    try {
      const qIds = list.map(q => q.id);
      if (qIds.length > 0) {
        const invoiceRows = await db.select({ qid: invoices.quotationId, total: sql<string>`COALESCE(SUM(${invoices.totalAmount}::numeric), 0)` }).from(invoices).where(and(inArray(invoices.quotationId, qIds as number[]), eq(invoices.companyId, companyId))).groupBy(invoices.quotationId);
        const soRowsRaw = await db.execute(sql`SELECT quotation_id AS qid, COALESCE(SUM(total_amount::numeric), 0)::text AS total FROM sales_orders WHERE quotation_id = ANY(${qIds}) AND company_id = ${companyId} GROUP BY quotation_id`);
        const soRows = (soRowsRaw.rows as any[]).map(r => ({ qid: r.qid, total: r.total }));
        for (const r of invoiceRows) { if (r.qid) convertedMap[r.qid] = (convertedMap[r.qid] || 0) + parseFloat(r.total || "0"); }
        for (const r of soRows) { if (r.qid) convertedMap[r.qid] = (convertedMap[r.qid] || 0) + parseFloat(r.total || "0"); }
      }
    } catch (e) { console.error("[quotations] convertedAmount calc error:", e); }
    const result = list.map(q => ({
      ...q,
      convertedAmount: convertedMap[q.id] || 0,
      createdByName: q.createdBy ? userMap[q.createdBy] || "-" : "-",
      updatedByName: q.updatedBy ? userMap[q.updatedBy] || "-" : "-",
    }));
    res.json(result);
  } catch (err: any) { console.error("[quotations] list error:", err); res.status(500).json({ message: err.message }); }
});

app.get("/api/quotations/next-no", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const no = await storage.getNextQuotationNo(companyId, req.query.docDate as string);
    res.json({ quotationNo: no });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/quotations/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const q = await storage.getQuotation(Number(req.params.id));
    if (!q) return res.status(404).json({ message: "ไม่พบใบเสนอราคา" });
    const user = req.user as any;
    if (q.companyId !== user.companyId && user.role !== "admin" && user.role !== "super_admin") {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    const items = await storage.getQuotationItems(q.id);
    let createdByName = "-";
    let updatedByName = "-";
    if (q.createdBy) { const u = await storage.getUser(q.createdBy); if (u) createdByName = u.fullName; }
    if (q.updatedBy) { const u = await storage.getUser(q.updatedBy); if (u) updatedByName = u.fullName; }
    res.json({ ...q, items, createdByName, updatedByName });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/quotations", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    if (!(await checkDocumentLimit(req, res))) return;
    const { items, ...body } = req.body;
    if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
    else body.creditDays = Number(body.creditDays) || null;
    if (body.customerId === "" || body.customerId === undefined) body.customerId = null;
    else body.customerId = Number(body.customerId) || null;
    const user = req.user as any;
    const companyId = Number(body.companyId);
    if (!companyId || !body.customerName || !body.quotationDate) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน (companyId, customerName, quotationDate)" });
    }
    let quotationNo = body.quotationNo || await storage.getNextQuotationNo(companyId, body.quotationDate);
    if (body.quotationNo) {
      const prefix = body.docPrefix || "QO";
      const fmtCheck = await validateDocNo(companyId, body.quotationNo, prefix, body.quotationDate);
      if (!fmtCheck.valid) {
        quotationNo = await getNextDocNo(companyId, prefix, quotations, quotations.quotationNo, quotations.companyId, body.quotationDate);
      }
    }
    const quotationData = {
      companyId,
      quotationNo,
      quotationDate: body.quotationDate,
      validUntil: body.validUntil || null,
      customerId: body.customerId ? Number(body.customerId) : null,
      customerCode: body.customerCode || null,
      customerName: body.customerName,
      customerAddress: body.customerAddress || null,
      customerTaxId: body.customerTaxId || null,
      branch: body.branch || null,
      sellerBranchId: body.sellerBranchId || null,
      contactPerson: body.contactPerson || null,
      contactPhone: body.contactPhone || null,
      contactEmail: body.contactEmail || null,
      creditDays: body.creditDays ? Number(body.creditDays) : null,
      subtotal: body.subtotal || "0",
      discountAmount: body.discountAmount || "0",
      vatAmount: body.vatAmount || "0",
      totalAmount: body.totalAmount || "0",
      status: body.status || "approved",
      priceMode: body.priceMode || "excluded",
      withholdingTax: body.withholdingTax || "0",
      paymentTerms: body.paymentTerms || null,
      attachedUrl: body.attachedUrl || null,
      salesperson: body.salesperson || null,
      department: body.department || null,
      project: body.project || null,
      refDoc: body.refDoc || null,
      docPrefix: body.docPrefix || "QO",
      docNumberMode: body.docNumberMode || "AUTO",
      linkJournal: body.linkJournal || false,
      notes: body.notes || null,
      internalNotes: body.internalNotes || null,
      currencyCode: body.currencyCode || "THB",
      exchangeRate: body.exchangeRate || "1",
      createdBy: user.id,
    };
    const q = await storage.createQuotation(quotationData);
    if (items && Array.isArray(items) && items.length > 0) {
      const itemValues = items.map((item: any) => {
        const rawDiscount = String(item.discount || "0");
        const isPercent = rawDiscount.includes("%");
        const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
        return {
          quotationId: q.id,
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
        };
      });
      await db.insert(quotationItems).values(itemValues);
    }
    const savedItems = await storage.getQuotationItems(q.id);
    logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "quotation", entityId: String(q.id), entityName: quotationNo }).catch(() => {});
    res.status(201).json({ ...q, items: savedItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/quotations/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const existing = await storage.getQuotation(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบเสนอราคา" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    if (["pending_approval", "rejected", "converted"].includes(existing.status) && !req.body.status) {
      return res.status(403).json({ message: "ไม่สามารถแก้ไขเอกสารที่รออนุมัติ/ปฏิเสธ/แปลงแล้วได้" });
    }
    const { items, ...body } = req.body;
    const updateData: any = {};
    const allowedFields = [
      "quotationNo", "quotationDate", "validUntil", "customerId", "customerName",
      "customerAddress", "customerTaxId", "contactPerson", "contactPhone", "contactEmail",
      "subtotal", "discountAmount", "vatAmount", "totalAmount", "status",
      "priceMode", "withholdingTax", "paymentTerms", "attachedUrl",
      "salesperson", "department", "project", "docPrefix", "docNumberMode", "linkJournal",
      "notes", "internalNotes", "salesOrderId", "branch", "creditDays", "refDoc", "customerCode",
      "currencyCode", "exchangeRate"
    ];
    const integerFields = ["customerId", "salesOrderId", "creditDays", "createdBy", "updatedBy"];
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
    if (updateData.status === "approved" && existing.status !== "approved") {
      updateData.customerResponse = "confirmed";
      updateData.customerRespondedAt = new Date();
    }
    const q = await storage.updateQuotation(existing.id, updateData);
    if (!q) return res.status(404).json({ message: "ไม่พบใบเสนอราคา" });
    if (items && Array.isArray(items)) {
      await storage.deleteQuotationItems(q.id);
      if (items.length > 0) {
        const itemValues = items.map((item: any) => {
          const rawDiscount = String(item.discount || "0");
          const isPercent = rawDiscount.includes("%");
          const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
          return {
            quotationId: q.id,
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
          };
        });
        await db.insert(quotationItems).values(itemValues);
      }
    }
    const savedItems = await storage.getQuotationItems(q.id);
    res.json({ ...q, items: savedItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/quotations/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const existing = await storage.getQuotation(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบเสนอราคา" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    // cascade protection: ต้องลบเอกสารปลายทางก่อน
    const blockers: string[] = [];
    const linkedIV = await db.select({ id: invoices.id, no: invoices.invoiceNo }).from(invoices).where(eq(invoices.quotationId, existing.id));
    if (linkedIV.length > 0) blockers.push(`ใบแจ้งหนี้: ${linkedIV.map(r => r.no).join(", ")}`);
    if (blockers.length > 0) return res.status(400).json({ message: `ไม่สามารถลบได้ เนื่องจากมีเอกสารเชื่อมอยู่:\n${blockers.join("\n")}\nกรุณาลบเอกสารที่เชื่อมก่อน` });
    await storage.deleteQuotationItems(existing.id);
    await storage.deleteQuotation(existing.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/quotations/bulk-delete", requireAuth, requireAnyModule("sales", "ecommerce"), requireRole("admin", "owner", "super_admin"), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "กรุณาระบุรายการที่ต้องการลบ" });
    const user = req.user as any;
    let deleted = 0; const errors: string[] = [];
    for (const id of ids) {
      try {
        const existing = await storage.getQuotation(Number(id));
        if (!existing) { errors.push(`#${id}: ไม่พบ`); continue; }
        await storage.deleteQuotationItems(existing.id);
        await storage.deleteQuotation(existing.id);
        logActivity({ companyId: existing.companyId, userId: user.id, userName: user.username, action: "delete", entityType: "quotation", entityId: String(existing.id), entityName: existing.quotationNo }).catch(() => {});
        deleted++;
      } catch (e: any) { errors.push(`#${id}: ${e.message}`); }
    }
    res.json({ deleted, errors, total: ids.length });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/quotations/:id/share", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const qo = await storage.getQuotation(Number(req.params.id));
    if (!qo) return res.status(404).json({ message: "ไม่พบใบเสนอราคา" });
    let token = (qo as any).shareToken;
    if (!token) {
      const { randomBytes } = await import("crypto");
      token = randomBytes(24).toString("hex");
      await db.update(quotations).set({ shareToken: token }).where(eq(quotations.id, qo.id));
    }
    res.json({ shareToken: token });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/share/order/:token", async (req, res) => {
  try {
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.shareToken, req.params.token));
    if (!order) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    const items = await db.select().from(salesOrderItems).where(eq(salesOrderItems.salesOrderId, order.id));
    const [company] = await db.select().from(companies).where(eq(companies.id, order.companyId));
    let docSetting = null;
    let userSignature = null;
    try {
      const [ds] = await db.select().from(documentSettings).where(eq(documentSettings.companyId, order.companyId));
      docSetting = ds || null;
    } catch {}
    if (order.createdBy) {
      try {
        const u = await storage.getUser(order.createdBy);
        if (u) userSignature = { signatureUrl: u.signatureUrl || null, signatureName: u.signatureName || u.fullName, signatureTitle: u.signatureTitle || null };
      } catch {}
    }
    res.json({ ...order, items, company: company || null, documentSettings: docSetting, userSignature });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/share/quote/:token", async (req, res) => {
  try {
    const [qo] = await db.select().from(quotations).where(eq(quotations.shareToken, req.params.token));
    if (!qo) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    const qoItems = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, qo.id));
    const [company] = await db.select().from(companies).where(eq(companies.id, qo.companyId));
    let docSetting = null;
    let userSignature = null;
    try {
      const [ds] = await db.select().from(documentSettings).where(eq(documentSettings.companyId, qo.companyId));
      docSetting = ds || null;
    } catch {}
    if (qo.createdBy) {
      try {
        const u = await storage.getUser(qo.createdBy);
        if (u) userSignature = { signatureUrl: u.signatureUrl || null, signatureName: u.signatureName || u.fullName, signatureTitle: u.signatureTitle || null };
      } catch {}
    }
    res.json({ ...qo, items: qoItems, company: company || null, documentSettings: docSetting, userSignature });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/share/quote/:token/respond", async (req, res) => {
  try {
    const { response, note } = req.body;
    if (!["confirmed", "cancelled", "request_edit"].includes(response)) {
      return res.status(400).json({ message: "Invalid response" });
    }
    const [qo] = await db.select().from(quotations).where(eq(quotations.shareToken, req.params.token));
    if (!qo) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    const statusMap: Record<string, string> = { confirmed: "approved", cancelled: "rejected", request_edit: "sent" };
    await db.update(quotations).set({
      customerResponse: response,
      customerResponseNote: note || null,
      customerRespondedAt: new Date(),
      status: statusMap[response] || qo.status,
      updatedAt: new Date(),
    }).where(eq(quotations.id, qo.id));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Quotation Email Sending ==========
app.post("/api/quotations/:id/send-email", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const qo = await storage.getQuotation(Number(req.params.id));
    if (!qo) return res.status(404).json({ message: "ไม่พบใบเสนอราคา" });

    const recipientEmail = req.body?.email || (qo as any).contactEmail;
    if (!recipientEmail) {
      return res.json({ success: false, message: "ไม่พบอีเมลลูกค้า กรุณาระบุอีเมลในข้อมูลลูกค้า" });
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, qo.companyId));
    const companyName = company?.name || "บริษัท";
    const companyFromEmail = company?.email || "";

    let shareToken = (qo as any).shareToken;
    if (!shareToken) {
      const { randomBytes } = await import("crypto");
      shareToken = randomBytes(24).toString("hex");
      await db.update(quotations).set({ shareToken }).where(eq(quotations.id, qo.id));
    }

    const host = req.get("x-forwarded-host") || req.get("host") || "";
    const proto = process.env.NODE_ENV === "production" ? "https" : (req.get("x-forwarded-proto") || req.protocol);
    let shareBaseUrl = `${proto}://${host}`;
    if (!host.includes(".replit.app") && process.env.REPL_ID && process.env.NODE_ENV !== "production") {
      shareBaseUrl = `https://${process.env.REPL_ID}.replit.app`;
    }
    const shareUrl = `${shareBaseUrl}/share/quote/${shareToken}`;

    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      const configuredFrom = companyFromEmail || process.env.RESEND_FROM_EMAIL || "";
      const fromAddr = configuredFrom || "onboarding@resend.dev";
      console.log(`[Email] Sending quotation email from=${fromAddr} to=${recipientEmail}`);
      const emailResult = await resend.emails.send({
        from: fromAddr,
        to: recipientEmail,
        subject: `ใบเสนอราคา ${(qo as any).quotationNo} จาก ${companyName}`,
        html: `
          <div style="font-family: 'Sarabun', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #2563eb; padding: 24px; border-radius: 12px 12px 0 0; color: white;">
              <h1 style="margin: 0; font-size: 22px;">ใบเสนอราคา</h1>
              <p style="margin: 8px 0 0; opacity: 0.9;">เลขที่: ${(qo as any).quotationNo}</p>
            </div>
            <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #fff;">
              <p style="color: #334155; font-size: 15px;">เรียน คุณ${(qo as any).customerName},</p>
              <p style="color: #475569; font-size: 14px; line-height: 1.6;">
                ${companyName} ได้จัดส่งใบเสนอราคาให้ท่านเรียบร้อยแล้ว
                กรุณาตรวจสอบรายละเอียดและยืนยันผ่านลิงก์ด้านล่าง
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <p style="font-size: 24px; font-weight: bold; color: #1e40af; margin: 0;">
                  ยอดรวม ${parseFloat(String((qo as any).totalAmount || "0")).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                </p>
              </div>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${shareUrl}" style="background: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
                  ดูใบเสนอราคา & ยืนยัน
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="color: #94a3b8; font-size: 12px; text-align: center;">
                อีเมลนี้ส่งจากระบบ E-Tax Center โดยอัตโนมัติ
              </p>
            </div>
          </div>
        `,
      });

      console.log(`[Email] Resend result:`, JSON.stringify(emailResult));
      if (emailResult.error) {
        console.error(`[Email] Resend error:`, emailResult.error);
        return res.json({ success: false, message: `ส่งอีเมลไม่สำเร็จ: ${emailResult.error.message}` });
      }
      await db.update(quotations).set({ status: "sent", updatedAt: new Date() }).where(eq(quotations.id, qo.id));
      res.json({ success: true, message: `ส่งอีเมลไปยัง ${recipientEmail} สำเร็จ` });
    } catch (emailErr: any) {
      console.error(`[Email] Exception:`, emailErr);
      if (!process.env.RESEND_API_KEY) {
        return res.json({ success: false, message: "ยังไม่ได้ตั้งค่าระบบส่งอีเมล (Resend API Key)" });
      }
      res.json({ success: false, message: `ส่งอีเมลไม่สำเร็จ: ${emailErr.message}` });
    }
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Invoice Routes ==========

async function computeInvoicePaidAmounts(invoiceIds: number[]): Promise<Record<number, number>> {
  const paidMap: Record<number, number> = {};
  if (invoiceIds.length === 0) return paidMap;
  const idArr = `'{${invoiceIds.join(",")}}'::int[]`;
  const directPaid = await db.execute(sql.raw(`SELECT invoice_id, SUM(total_amount) AS paid FROM receipts WHERE invoice_id = ANY(${idArr}) GROUP BY invoice_id`));
  const batchPaid = await db.execute(sql.raw(`SELECT doc_id, SUM(amount) AS paid FROM receipt_linked_docs WHERE doc_type = 'IV' AND doc_id = ANY(${idArr}) GROUP BY doc_id`));
  const tivPaid = await db.execute(sql.raw(`SELECT invoice_id, SUM(COALESCE(subtotal,0) + COALESCE(vat_amount,0)) AS paid FROM tax_invoices WHERE invoice_id = ANY(${idArr}) AND (payment_method IS NULL OR payment_method != 'เครดิต') AND status NOT IN ('cancelled','voided','cancel') GROUP BY invoice_id`));
  // track receipt-only paid separately (WHT applies only to receipt payments, not TIV)
  const receiptOnlyMap: Record<number, number> = {};
  for (const r of (directPaid as any).rows || []) {
    paidMap[r.invoice_id] = (paidMap[r.invoice_id] || 0) + parseFloat(r.paid || 0);
    receiptOnlyMap[r.invoice_id] = (receiptOnlyMap[r.invoice_id] || 0) + parseFloat(r.paid || 0);
  }
  for (const r of (batchPaid as any).rows || []) {
    paidMap[r.doc_id] = (paidMap[r.doc_id] || 0) + parseFloat(r.paid || 0);
    receiptOnlyMap[r.doc_id] = (receiptOnlyMap[r.doc_id] || 0) + parseFloat(r.paid || 0);
  }
  for (const r of (tivPaid as any).rows || []) paidMap[r.invoice_id] = (paidMap[r.invoice_id] || 0) + parseFloat(r.paid || 0);
  // WHT ถือว่าชำระแล้ว เฉพาะ invoice ที่ชำระผ่าน receipt (ไม่ใช่ TIV) เพราะ TIV.totalAmount รวม VAT อยู่แล้ว
  const whtRows = await db.execute(sql.raw(`SELECT id, CAST(withholding_tax AS NUMERIC) AS wht FROM invoices WHERE id = ANY(${idArr}) AND withholding_tax IS NOT NULL AND CAST(withholding_tax AS NUMERIC) > 0`));
  for (const r of (whtRows as any).rows || []) {
    if ((receiptOnlyMap[r.id] || 0) > 0) paidMap[r.id] = (paidMap[r.id] || 0) + parseFloat(r.wht || 0);
  }
  return paidMap;
}

app.get("/api/invoices", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const whereClause = eq(invoices.companyId, companyId);
    let rows: any[];
    if (req.query.page) {
      const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
      const [{ total }] = await db.select({ total: count() }).from(invoices).where(whereClause);
      rows = await db.select().from(invoices).where(whereClause).orderBy(desc(invoices.invoiceDate), desc(invoices.id)).limit(pageSize).offset(offset);
      const userIds = Array.from(new Set(rows.map((r: any) => r.createdBy).concat(rows.map((r: any) => r.updatedBy)).filter(Boolean))) as number[];
      const userMap: Record<number, string> = {};
      if (userIds.length > 0) {
        const userRows = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds));
        for (const u of userRows) userMap[u.id] = u.fullName;
      }
      const paidMap = await computeInvoicePaidAmounts(rows.map((r: any) => r.id));
      const result = rows.map((r: any) => ({ ...r, createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-", updatedByName: r.updatedBy ? userMap[r.updatedBy] || "-" : "-", paidAmount: paidMap[r.id] || 0 }));
      return res.json(paginatedResponse(result, Number(total), { page, pageSize, offset }));
    }
    const _diag: string[] = [`A:cid=${companyId}`];
    rows = await db.select().from(invoices).where(whereClause).orderBy(desc(invoices.invoiceDate), desc(invoices.id));
    _diag.push(`B:rows=${rows.length}`);
    const userIds = Array.from(new Set(rows.map((r: any) => r.createdBy).concat(rows.map((r: any) => r.updatedBy)).filter(Boolean))) as number[];
    const userMap: Record<number, string> = {};
    if (userIds.length > 0) {
      const userRows = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds));
      for (const u of userRows) userMap[u.id] = u.fullName;
    }
    _diag.push(`C:umap=${Object.keys(userMap).length}`);
    const paidMap = await computeInvoicePaidAmounts(rows.map((r: any) => r.id));
    _diag.push(`D:paid=${Object.keys(paidMap).length}`);
    const bnLinkedInvIds = new Set<number>();
    const invApprovalMap: Record<number, string> = {};
    if (rows.length > 0) {
      const idArr = `'{${rows.map((r: any) => r.id).join(",")}}'::int[]`;
      const bnLinks = await db.execute(sql.raw(`SELECT doc_id FROM billing_note_linked_docs WHERE doc_type = 'IV' AND doc_id = ANY(${idArr})`));
      for (const l of (bnLinks as any).rows || []) bnLinkedInvIds.add(l.doc_id);
      _diag.push(`E:bn=${bnLinkedInvIds.size}`);
      const arRows = await db.execute(sql.raw(`SELECT document_id, status FROM approval_requests WHERE document_type = 'invoice' AND document_id = ANY(${idArr})`));
      for (const ar of (arRows as any).rows || []) invApprovalMap[ar.document_id] = ar.status;
      _diag.push(`F:ar=${Object.keys(invApprovalMap).length}`);
    }
    const result = rows.map((r: any) => ({ ...r, createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-", updatedByName: r.updatedBy ? userMap[r.updatedBy] || "-" : "-", paidAmount: paidMap[r.id] || 0, hasBillingNote: bnLinkedInvIds.has(r.id), approvalStatus: invApprovalMap[r.id] || null }));
    _diag.push(`G:res=${result.length}`);
    res.json({ _diagInfo: _diag.join(" "), items: result });
  } catch (err: any) { res.status(500).json({ _diagInfo: "ERROR", message: err.message, detail: err.stack?.split('\n').slice(0,4).join(' → ') }); }
});

app.get("/api/invoices/next-no", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const prefix = String(req.query.prefix || "IV");
    const invoiceNo = await getNextDocNo(companyId, prefix, invoices, invoices.invoiceNo, invoices.companyId, req.query.docDate as string);
    res.json({ invoiceNo });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/invoices/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [doc] = await db.select().from(invoices).where(eq(invoices.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const items = await fetchInvoiceItems(doc.id);
    let createdByName = "-";
    let updatedByName = "-";
    if (doc.createdBy) { const u = await storage.getUser(doc.createdBy); if (u) createdByName = u.fullName; }
    if (doc.updatedBy) { const u = await storage.getUser(doc.updatedBy); if (u) updatedByName = u.fullName; }
    res.json({ ...doc, items, createdByName, updatedByName });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/invoices", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const t0 = Date.now();
    if (!(await checkDocumentLimit(req, res))) return;
    const { items, ...body } = req.body;
    if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
    else body.creditDays = Number(body.creditDays) || null;
    if (body.customerId === "" || body.customerId === undefined) body.customerId = null;
    else body.customerId = Number(body.customerId) || null;
    const user = req.user as any;
    const companyId = Number(body.companyId);
    if (!companyId || !body.customerName || !body.invoiceDate) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน (companyId, customerName, invoiceDate)" });
    }
    const prefix = body.docPrefix || "IV";
    let invoiceNo = body.invoiceNo;
    if (!invoiceNo) {
      invoiceNo = await getNextDocNo(companyId, prefix, invoices, invoices.invoiceNo, invoices.companyId, body.invoiceDate);
    } else {
      const fmtCheck = await validateDocNo(companyId, invoiceNo, prefix, body.invoiceDate);
      if (!fmtCheck.valid) {
        invoiceNo = await getNextDocNo(companyId, prefix, invoices, invoices.invoiceNo, invoices.companyId, body.invoiceDate);
      }
    }
    console.log(`[Invoice] t1 docNo=${Date.now()-t0}ms`);
    const result = await db.transaction(async (tx) => {
      const [doc] = await tx.insert(invoices).values({
        companyId,
        invoiceNo,
        invoiceDate: body.invoiceDate,
        dueDate: body.dueDate || null,
        customerId: body.customerId ? Number(body.customerId) : null,
        customerCode: body.customerCode || null,
        customerName: body.customerName,
        customerAddress: body.customerAddress || null,
        customerTaxId: body.customerTaxId || null,
        branch: body.branch || null,
      sellerBranchId: body.sellerBranchId || null,
        contactPerson: body.contactPerson || null,
        contactPhone: body.contactPhone || null,
        contactEmail: body.contactEmail || null,
        creditDays: body.creditDays ? Number(body.creditDays) : null,
        subtotal: body.subtotal || "0",
        discountAmount: body.discountAmount || "0",
        vatAmount: body.vatAmount || "0",
        totalAmount: body.totalAmount || "0",
        withholdingTax: body.withholdingTax || "0",
        status: body.status || "approved",
        paymentStatus: body.paymentStatus || "unpaid",
        priceMode: body.priceMode || "excluded",
        paymentTerms: body.paymentTerms || null,
        attachedUrl: body.attachedUrl || null,
        salesperson: body.salesperson || null,
        department: body.department || null,
        project: body.project || null,
        docPrefix: body.docPrefix || "IV",
        refDoc: body.refDoc || null,
        quotationId: body.quotationId ? Number(body.quotationId) : null,
        salesOrderId: body.salesOrderId ? Number(body.salesOrderId) : null,
        notes: body.notes || null,
        internalNotes: body.internalNotes || null,
        currencyCode: body.currencyCode || "THB",
        exchangeRate: body.exchangeRate || "1",
        createdBy: user.id,
      }).returning();
      if (items && Array.isArray(items) && items.length > 0) {
        const itemValues = items.map((item: any) => {
          const rawDiscount = String(item.discount || "0");
          const isPercent = rawDiscount.includes("%");
          const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
          return {
            invoiceId: doc.id,
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
          };
        });
        const insertedItems = await tx.insert(invoiceItems).values(itemValues).returning({ id: invoiceItems.id });
        // warehouse_id: column not in schema.ts, patch via raw SQL
        for (let i = 0; i < items.length; i++) {
          if (items[i].warehouseId) {
            await tx.execute(sql`UPDATE invoice_items SET warehouse_id = ${Number(items[i].warehouseId)} WHERE id = ${insertedItems[i].id}`);
          }
        }
      }
      return doc;
    });
    console.log(`[Invoice] t2 insert=${Date.now()-t0}ms`);
    const savedItems = await fetchInvoiceItems(result.id);
    console.log(`[Invoice] t3 items=${Date.now()-t0}ms`);

    let journalResult = null;
    try {
      console.log(`[Invoice] Auto journal for IV#${result.id} status=${result.status}`);
      // Build lineItemAccounts จาก accountCode ที่กำหนดไว้ในสินค้า
      let invoiceLineItemAccounts: { accountCode: string; accountName: string; amount: number }[] | undefined;
      const itemsWithProduct = savedItems.filter((i: any) => i.productId);
      if (itemsWithProduct.length > 0) {
        const productIds = [...new Set(itemsWithProduct.map((i: any) => i.productId))] as number[];
        const productRows = await db.select({ id: products.id, accountCode: products.accountCode, name: products.name })
          .from(products).where(inArray(products.id, productIds));
        const productMap = new Map(productRows.map(p => [p.id, p]));
        const mapped: { accountCode: string; accountName: string; amount: number }[] = [];
        for (const item of savedItems) {
          if (!item.productId) continue;
          const prod = productMap.get(item.productId);
          if (!prod?.accountCode) continue; // ไม่มี accountCode → formula จัดการทั้งจำนวน
          const amount = Math.round(parseFloat(String(item.total || "0")) * 100) / 100;
          if (amount <= 0) continue;
          mapped.push({ accountCode: prod.accountCode, accountName: prod.name || "", amount });
        }
        if (mapped.length > 0) invoiceLineItemAccounts = mapped;
      }
      journalResult = await createAutoJournalEntry({
        companyId: result.companyId,
        documentType: "invoice",
        sourceDocType: "invoice",
        sourceDocId: result.id,
        docDate: result.invoiceDate,
        docNo: result.invoiceNo,
        subtotal: String(result.subtotal),
        vatAmount: String(result.vatAmount),
        totalAmount: String(result.totalAmount),
        withholdingTax: String(result.withholdingTax || "0"),
        currencyCode: result.currencyCode || "THB",
        exchangeRate: String(result.exchangeRate || "1"),
        userId: user.id,
        customerName: result.customerName,
        lineItemAccounts: invoiceLineItemAccounts,
        overrideLines: body?.journalOverrideLines || undefined,
      });
      console.log(`[Invoice] Journal result:`, JSON.stringify(journalResult));
    } catch (e: any) { console.error(`[Invoice] Auto journal error:`, e.message); }
    console.log(`[Invoice] t4 journal=${Date.now()-t0}ms`);

    if (!["draft", "pending", "cancelled", "voided", "rejected"].includes(result.status)) {
      const deductItems = savedItems
        .filter((i: any) => i.productId && parseFloat(String(i.qty || "0")) > 0)
        .map((i: any) => ({ productId: i.productId, qty: parseFloat(String(i.qty)), warehouseId: i.warehouseId || null, unitPrice: String(i.unitPrice || "0"), productName: i.productName || i.description }));
      if (deductItems.length > 0) {
        const invCreateTriggers = await getInventoryTriggers(result.companyId);
        if (invCreateTriggers.invoice_deduct) {
          const docLabel = `ขายสินค้า ${result.invoiceNo}${result.customerName ? ` (${result.customerName})` : ""}`;
          await deductStockBundleAware(deductItems, result.companyId, docLabel, "invoice", result.id, user.id).catch((err: any) => { console.error(`[Invoice-CREATE] deductStock failed for invoice#${result.id}:`, err.message); });
        }
      }
    }
    // ถ้า IV สร้างจาก SO → release การจองของ SO
    if (result.salesOrderId) {
      try {
        const soItems = await fetchSalesOrderItems(result.salesOrderId);
        await releaseSOStock(soItems, companyId);
      } catch (e: any) { console.error("[IV-CREATE] release SO reservation failed:", e.message); }
    }
    logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "invoice", entityId: String(result.id), entityName: invoiceNo }).catch(() => {});
    console.log(`[Invoice] TOTAL=${Date.now()-t0}ms`);
    res.status(201).json({ ...result, items: savedItems, journalResult });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/invoices/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const { items, ...body } = req.body;
    const updateData: any = {};
    const allowedFields = [
      "invoiceNo", "invoiceDate", "dueDate", "customerId", "customerCode", "customerName",
      "customerAddress", "customerTaxId", "branch", "contactPerson", "contactPhone", "contactEmail",
      "creditDays", "subtotal", "discountAmount", "vatAmount", "totalAmount", "withholdingTax",
      "status", "paymentStatus", "priceMode", "paymentTerms", "attachedUrl",
      "salesperson", "department", "project", "docPrefix", "refDoc",
      "quotationId", "salesOrderId", "notes", "internalNotes",
      "currencyCode", "exchangeRate"
    ];
    const integerFields = ["customerId", "creditDays", "quotationId", "salesOrderId"];
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
      await tx.update(invoices).set(updateData).where(eq(invoices.id, existing.id));
      if (items && Array.isArray(items)) {
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, existing.id));
        if (items.length > 0) {
          const itemValues = items.map((item: any) => {
            const rawDiscount = String(item.discount || "0");
            const isPercent = rawDiscount.includes("%");
            const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
            return {
              invoiceId: existing.id,
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
            };
          });
          await tx.insert(invoiceItems).values(itemValues);
        }
      }
    });
    const [[updated], savedItems] = await Promise.all([
      db.select().from(invoices).where(eq(invoices.id, existing.id)),
      fetchInvoiceItems(existing.id),
    ]);

    let journalResult = null;
    let stockDeductions: any[] = [];
    const statusChanged = body.status && body.status !== existing.status;
    const invoiceJournalStatuses = ["approved", "debtor"];
    const shouldCreateInvJournal = (statusChanged && invoiceJournalStatuses.includes(body.status)) || invoiceJournalStatuses.includes(updated.status);
    if (shouldCreateInvJournal) {
      try {
        let updatedLineItemAccounts: { accountCode: string; accountName: string; amount: number }[] | undefined;
        const updItemsWithProduct = savedItems.filter((i: any) => i.productId);
        if (updItemsWithProduct.length > 0) {
          const updProductIds = [...new Set(updItemsWithProduct.map((i: any) => i.productId))] as number[];
          const updProductRows = await db.select({ id: products.id, accountCode: products.accountCode, name: products.name })
            .from(products).where(inArray(products.id, updProductIds));
          const updProductMap = new Map(updProductRows.map(p => [p.id, p]));
          const updMapped: { accountCode: string; accountName: string; amount: number }[] = [];
          for (const item of savedItems) {
            if (!item.productId) continue;
            const prod = updProductMap.get(item.productId);
            if (!prod?.accountCode) continue;
            const amount = Math.round(parseFloat(String(item.total || "0")) * 100) / 100;
            if (amount <= 0) continue;
            updMapped.push({ accountCode: prod.accountCode, accountName: prod.name || "", amount });
          }
          if (updMapped.length > 0) updatedLineItemAccounts = updMapped;
        }
        journalResult = await createAutoJournalEntry({
          companyId: updated.companyId,
          documentType: "invoice",
          sourceDocType: "invoice",
          sourceDocId: updated.id,
          docDate: updated.invoiceDate,
          docNo: updated.invoiceNo,
          subtotal: String(updated.subtotal),
          vatAmount: String(updated.vatAmount),
          totalAmount: String(updated.totalAmount),
          withholdingTax: String(updated.withholdingTax || "0"),
          currencyCode: updated.currencyCode || "THB",
          exchangeRate: String(updated.exchangeRate || "1"),
          userId: user.id,
          customerName: updated.customerName,
          lineItemAccounts: updatedLineItemAccounts,
          overrideLines: body?.journalOverrideLines || undefined,
        });
      } catch (e: any) {
        console.error(`[AutoJournal] Invoice ${updated.invoiceNo} failed:`, e.message);
      }

      const deductItems = savedItems
        .filter((i: any) => i.productId && parseFloat(String(i.qty || "0")) > 0)
        .map((i: any) => ({ productId: i.productId, qty: parseFloat(String(i.qty)), warehouseId: i.warehouseId || null, unitPrice: String(i.unitPrice || "0"), productName: i.productName || i.description }));
      const invPatchTriggers = await getInventoryTriggers(updated.companyId);
      if (invPatchTriggers.invoice_deduct) {
        const docLabel = `ขายสินค้า ${updated.invoiceNo}${updated.customerName ? ` (${updated.customerName})` : ""}`;
        const deductions = await deductStockBundleAware(deductItems, updated.companyId, docLabel, "invoice", updated.id, user.id);
        stockDeductions.push(...deductions);
      }
    }

    res.json({ ...updated, items: savedItems, journalResult, stockDeductions });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/invoices/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    // cascade protection: ต้องลบเอกสารปลายทางก่อน
    const blockers: string[] = [];
    const linkedTIV = await db.select({ id: taxInvoices.id, no: taxInvoices.taxInvoiceNo }).from(taxInvoices).where(eq(taxInvoices.invoiceId, existing.id));
    if (linkedTIV.length > 0) blockers.push(`ใบกำกับภาษี: ${linkedTIV.map(r => r.no).join(", ")}`);
    const linkedRC = await db.select({ id: receipts.id, no: receipts.receiptNo }).from(receipts).where(eq(receipts.invoiceId, existing.id));
    if (linkedRC.length > 0) blockers.push(`ใบเสร็จรับเงิน: ${linkedRC.map(r => r.no).join(", ")}`);
    if (blockers.length > 0) return res.status(400).json({ message: `ไม่สามารถลบได้ เนื่องจากมีเอกสารเชื่อมอยู่:\n${blockers.join("\n")}\nกรุณาลบเอกสารที่เชื่อมก่อน` });
    const invItems = await fetchInvoiceItems(existing.id);
    const invHadMovements = (await db.select({ id: stockMovements.id }).from(stockMovements).where(
      and(eq(stockMovements.referenceType, "invoice"), eq(stockMovements.referenceId, existing.id))
    )).length > 0;
    await db.transaction(async (tx) => {
      await deleteJournalEntriesForDoc(tx, "invoice", existing.id);
      await deleteStockMovementsForDoc(tx, "invoice", existing.id);
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, existing.id));
      await tx.delete(invoices).where(eq(invoices.id, existing.id));
    });
    const invDelTriggers = await getInventoryTriggers(existing.companyId);
    if (invDelTriggers.invoice_deduct && invHadMovements) await reverseWarehouseStockBundleAware(invItems, existing.companyId);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/invoices/recompute-payment-statuses", requireAuth, requireRole("admin", "owner", "super_admin"), async (req, res) => {
  try {
    const companyId = req.body.companyId ? Number(req.body.companyId) : null;
    const tivRows = await db.execute(sql`
      SELECT DISTINCT invoice_id AS id FROM tax_invoices
      WHERE invoice_id IS NOT NULL
        AND status IN ('cash', 'approved')
        ${companyId ? sql`AND company_id = ${companyId}` : sql``}
    `);
    const invoiceIds = ((tivRows as any).rows || []).map((r: any) => Number(r.id)).filter(Boolean);
    let updated = 0;
    const errors: string[] = [];
    for (const id of invoiceIds) {
      try {
        await recomputePaymentStatus("invoice", id);
        updated++;
      } catch (e: any) {
        console.error(`[recompute-payment-statuses] invoice#${id} failed:`, e.message);
        errors.push(`invoice#${id}: ${e.message}`);
      }
    }
    res.json({ message: `อัพเดทสถานะ ${updated} ใบแจ้งหนี้เรียบร้อย`, updated, errors });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/invoices/bulk-delete", requireAuth, requireAnyModule("sales", "ecommerce"), requireRole("admin", "owner", "super_admin"), async (req, res) => {
  try {
    const { ids, companyId: reqCompanyId } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "กรุณาระบุรายการที่ต้องการลบ" });
    const user = req.user as any;
    if (user?.role !== "super_admin" && user?.tenantId && reqCompanyId) {
      const compTenantId = await getCompanyTenantId(reqCompanyId);
      if (compTenantId !== null && compTenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }

    let deleted = 0;
    const errors: string[] = [];
    for (const id of ids) {
      try {
        const [existing] = await db.select().from(invoices).where(eq(invoices.id, Number(id)));
        if (!existing) { errors.push(`#${id}: ไม่พบ`); continue; }
        const bulkInvItems = await fetchInvoiceItems(existing.id);
        const bulkInvHadMovements = (await db.select({ id: stockMovements.id }).from(stockMovements).where(
          and(eq(stockMovements.referenceType, "invoice"), eq(stockMovements.referenceId, existing.id))
        )).length > 0;
        await db.transaction(async (tx) => {
          await deleteJournalEntriesForDoc(tx, "invoice", existing.id);
          await deleteStockMovementsForDoc(tx, "invoice", existing.id);
          await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, existing.id));
          await tx.delete(invoices).where(eq(invoices.id, existing.id));
        });
        const bulkInvDelTriggers = await getInventoryTriggers(existing.companyId);
        if (bulkInvDelTriggers.invoice_deduct && bulkInvHadMovements) await reverseWarehouseStockBundleAware(bulkInvItems, existing.companyId);
        logActivity({ companyId: existing.companyId, userId: user.id, userName: user.username, action: "delete", entityType: "invoice", entityId: String(existing.id), entityName: existing.invoiceNo }).catch(() => {});
        deleted++;
      } catch (e: any) {
        console.error(`[bulk-delete invoice] Error deleting invoice #${id}:`, e.message);
        errors.push(`#${id}: ${e.message}`);
      }
    }
    if (deleted === 0 && errors.length > 0) {
      return res.status(500).json({ message: errors.join(", "), deleted: 0, errors, total: ids.length });
    }
    res.json({ deleted, errors, total: ids.length });
  } catch (err: any) {
    console.error("[bulk-delete invoice] Outer error:", err.message);
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/journal-entries/by-source/:docType/:docId", requireAuth, async (req, res) => {
  try {
    const { docType: rawDocType, docId } = req.params;
    const docType = rawDocType.replace(/-/g, "_");
    let entries = await db.select().from(journalEntries)
      .where(and(
        eq(journalEntries.sourceDocType, docType as any),
        eq(journalEntries.sourceDocId, Number(docId)),
      ));
    if (entries.length === 0 && docType === "purchase_debit_note") {
      const [dn] = await db.select({ linkJournal: purchaseDebitNotes.linkJournal, debitNoteDate: purchaseDebitNotes.debitNoteDate, companyId: purchaseDebitNotes.companyId })
        .from(purchaseDebitNotes).where(eq(purchaseDebitNotes.id, Number(docId)));
      if (dn && dn.linkJournal) {
        entries = await db.select().from(journalEntries)
          .where(and(
            eq(journalEntries.companyId, dn.companyId),
            eq(journalEntries.sourceDocType, "purchase_debit_note"),
            eq(journalEntries.entryDate, dn.debitNoteDate),
          ));
      }
    }
    if (entries.length === 0) return res.json(null);
    const entry = entries[0];
    const lines = await db.select().from(journalLines)
      .where(eq(journalLines.journalEntryId, entry.id))
      .orderBy(journalLines.id);
    const linesWithAccounts = await Promise.all(lines.map(async (line) => {
      const [acc] = await db.select().from(accounts).where(eq(accounts.id, line.accountId));
      return { ...line, accountCode: acc?.code, accountName: acc?.name, accountNameTh: acc?.nameTh };
    }));
    res.json({ ...entry, lines: linesWithAccounts });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/invoices/:id/clone", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [doc] = await db.select().from(invoices).where(eq(invoices.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const items = await fetchInvoiceItems(doc.id);
    const prefix = (doc as any).docPrefix || "IV";
    const invoiceNo = await getNextDocNo(doc.companyId, prefix, invoices, invoices.invoiceNo, invoices.companyId, doc.invoiceDate);
    const user = req.user as any;
    const result = await db.transaction(async (tx) => {
      const [cloned] = await tx.insert(invoices).values({
        companyId: doc.companyId, invoiceNo,
        invoiceDate: new Date().toISOString().split("T")[0],
        dueDate: doc.dueDate, customerId: doc.customerId,
        customerCode: doc.customerCode, customerName: doc.customerName,
        customerAddress: doc.customerAddress, customerTaxId: doc.customerTaxId,
        branch: doc.branch, contactPerson: doc.contactPerson,
        contactPhone: doc.contactPhone, contactEmail: doc.contactEmail,
        creditDays: doc.creditDays, subtotal: doc.subtotal,
        discountAmount: doc.discountAmount, vatAmount: doc.vatAmount,
        totalAmount: doc.totalAmount, status: "approved", paymentStatus: "unpaid",
        paymentTerms: doc.paymentTerms, notes: doc.notes,
        internalNotes: doc.internalNotes, priceMode: doc.priceMode,
        withholdingTax: doc.withholdingTax, docPrefix: (doc as any).docPrefix,
        currencyCode: doc.currencyCode, exchangeRate: doc.exchangeRate,
        createdBy: user.id,
      }).returning();
      if (items.length > 0) {
        await tx.insert(invoiceItems).values(items.map((it: any) => ({
          invoiceId: cloned.id, productId: it.productId,
          productCode: it.productCode, productName: it.productName,
          description: it.description, qty: it.qty,
          unit: it.unit, unitPrice: it.unitPrice,
          discount: it.discount, discountType: it.discountType,
          total: it.total, vatType: it.vatType,
        })));
      }
      return cloned;
    });
    res.status(201).json(result);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Invoice Share ==========
app.post("/api/invoices/:id/share", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [doc] = await db.select().from(invoices).where(eq(invoices.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    let token = doc.shareToken;
    if (!token) {
      const { randomBytes } = await import("crypto");
      token = randomBytes(24).toString("hex");
      await db.update(invoices).set({ shareToken: token }).where(eq(invoices.id, doc.id));
    }
    res.json({ shareToken: token });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/share/invoice/:token", async (req, res) => {
  try {
    const [doc] = await db.select().from(invoices).where(eq(invoices.shareToken, req.params.token));
    if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    const items = await fetchInvoiceItems(doc.id);
    const [company] = await db.select().from(companies).where(eq(companies.id, doc.companyId));
    let docSetting = null;
    let userSignature = null;
    try { const [ds] = await db.select().from(documentSettings).where(eq(documentSettings.companyId, doc.companyId)); docSetting = ds || null; } catch {}
    if (doc.createdBy) {
      try { const u = await storage.getUser(doc.createdBy); if (u) userSignature = { signatureUrl: u.signatureUrl || null, signatureName: u.signatureName || u.fullName, signatureTitle: u.signatureTitle || null }; } catch {}
    }
    const { internalNotes, shareToken, createdBy, updatedBy, ...publicDoc } = doc;
    res.json({ ...publicDoc, items, company: company || null, documentSettings: docSetting, userSignature });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Invoice Import Routes ==========

app.get("/api/invoices/import/template", (_req, res) => {
  const headers = [
    "เลขที่เอกสาร", "วันที่เอกสาร", "วันครบกำหนด", "รหัสลูกค้า", "ชื่อลูกค้า",
    "เลขประจำตัวผู้เสียภาษี", "ที่อยู่ลูกค้า", "สาขา", "ผู้ติดต่อ", "โทรศัพท์",
    "อีเมล", "เครดิต(วัน)", "รหัสสินค้า", "ชื่อสินค้า/บริการ",
    "รายละเอียด", "จำนวน", "หน่วย", "ราคาต่อหน่วย", "ส่วนลด",
    "ประเภท VAT", "ภาษีหัก ณ ที่จ่าย", "โหมดราคา", "หมายเหตุ", "อ้างอิง"
  ];
  const sample1 = [
    "IV6801001", "01/01/2568", "31/01/2568", "C0001", "บจ. ตัวอย่าง จำกัด",
    "0105500000001", "123 ถ.สุขุมวิท กรุงเทพฯ", "สำนักงานใหญ่", "คุณสมชาย", "02-123-4567",
    "info@example.com", "30", "P001", "บริการทำบัญชี",
    "ค่าบริการทำบัญชีรายเดือน", "1", "เดือน", "5000", "0",
    "vat7", "0", "excluded", "", ""
  ];
  const sample2 = [
    "IV6801001", "", "", "", "",
    "", "", "", "", "",
    "", "", "P002", "ค่าจัดทำงบ",
    "จัดทำงบการเงินประจำปี", "1", "ชุด", "15000", "500",
    "vat7", "", "", "", ""
  ];
  const sample3 = [
    "IV6801002", "05/01/2568", "04/02/2568", "", "ร้าน ABC",
    "", "", "", "", "",
    "", "30", "P003", "ค่าที่ปรึกษา",
    "ค่าที่ปรึกษาภาษี", "2", "ชั่วโมง", "3000", "0",
    "vat7", "180", "excluded", "ชำระ 30 วัน", ""
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2, sample3]);
  ws["!cols"] = [14, 14, 14, 12, 25, 18, 30, 16, 14, 14, 20, 10, 12, 20, 25, 10, 10, 14, 10, 12, 14, 12, 20, 16].map(w => ({ wch: w }));
  const helpHeaders = ["คอลัมน์", "คำอธิบาย", "จำเป็น", "ค่าที่รับ"];
  const helpRows = [
    ["เลขที่เอกสาร", "เลขที่เอกสาร (เว้นว่าง = สร้างอัตโนมัติ) แถวที่มีเลขเดียวกันจะรวมเป็นเอกสารเดียว", "ไม่", "เช่น IV6801001"],
    ["วันที่เอกสาร", "วันที่ (DD/MM/YYYY พ.ศ.) กรอกแค่แถวแรกของเอกสาร", "ใช่", "01/01/2568"],
    ["วันครบกำหนด", "วันครบกำหนดชำระ", "ไม่", "31/01/2568"],
    ["รหัสลูกค้า", "รหัสลูกค้า (ถ้าตรงกับในระบบจะจับคู่อัตโนมัติ)", "ไม่", "C0001"],
    ["ชื่อลูกค้า", "ชื่อลูกค้า กรอกแค่แถวแรกของเอกสาร", "ใช่", ""],
    ["เลขประจำตัวผู้เสียภาษี", "เลขประจำตัวผู้เสียภาษี 13 หลัก", "ไม่", "0105500000001"],
    ["ที่อยู่ลูกค้า", "ที่อยู่สำหรับออกใบแจ้งหนี้", "ไม่", ""],
    ["สาขา", "สาขาลูกค้า", "ไม่", "สำนักงานใหญ่"],
    ["ผู้ติดต่อ", "ชื่อผู้ติดต่อ", "ไม่", ""],
    ["โทรศัพท์", "เบอร์โทรศัพท์ผู้ติดต่อ", "ไม่", ""],
    ["อีเมล", "อีเมลผู้ติดต่อ", "ไม่", ""],
    ["เครดิต(วัน)", "จำนวนวันเครดิต", "ไม่", "30"],
    ["รหัสสินค้า", "รหัสสินค้า (ถ้าตรงกับในระบบจะจับคู่อัตโนมัติ)", "ไม่", "P001"],
    ["ชื่อสินค้า/บริการ", "ชื่อสินค้าหรือบริการ", "ใช่", ""],
    ["รายละเอียด", "รายละเอียดเพิ่มเติม", "ไม่", ""],
    ["จำนวน", "จำนวน", "ใช่", "1"],
    ["หน่วย", "หน่วยนับ", "ไม่", "ชิ้น (ค่าเริ่มต้น)"],
    ["ราคาต่อหน่วย", "ราคาต่อหน่วย", "ใช่", "5000"],
    ["ส่วนลด", "ส่วนลดต่อรายการ (จำนวนเงิน)", "ไม่", "500"],
    ["ประเภท VAT", "vat7 / non_vat / zero_rated", "ไม่", "vat7 (ค่าเริ่มต้น)"],
    ["ภาษีหัก ณ ที่จ่าย", "ยอดภาษีหัก ณ ที่จ่ายทั้งเอกสาร (กรอกแค่แถวแรก)", "ไม่", "180"],
    ["โหมดราคา", "excluded / included (ราคาก่อน/รวม VAT)", "ไม่", "excluded (ค่าเริ่มต้น)"],
    ["หมายเหตุ", "หมายเหตุเอกสาร", "ไม่", ""],
    ["อ้างอิง", "เอกสารอ้างอิง", "ไม่", ""],
  ];
  const helpWs = XLSX.utils.aoa_to_sheet([helpHeaders, ...helpRows]);
  helpWs["!cols"] = [20, 50, 8, 20].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "ใบแจ้งหนี้");
  XLSX.utils.book_append_sheet(wb, helpWs, "คำอธิบาย");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", 'attachment; filename="invoice_import_template.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

const uploadInvoice = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.post("/api/invoices/import/preview", requireAuth, requireAnyModule("sales", "ecommerce"), uploadInvoice.single("file"), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์" });
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });
    const user = req.user as any;
    if (user?.role !== "super_admin" && user?.tenantId) {
      const compTenantId = await getCompanyTenantId(companyId);
      if (compTenantId !== null && compTenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
      }
    }

    let rawRows: any[] = [];
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === ".csv") {
      let content = req.file.buffer.toString("utf-8");
      const hasThai = /[\u0E00-\u0E7F]/.test(content);
      const hasHighBytes = req.file.buffer.some((b: number) => b >= 0xA1 && b <= 0xFB);
      if (!hasThai && hasHighBytes) {
        try {
          const decoder = new TextDecoder("tis-620");
          content = decoder.decode(req.file.buffer);
        } catch {
          content = req.file.buffer.toString("latin1");
        }
      }
      const firstLine = content.split(/\r?\n/)[0];
      const delimiter = firstLine.includes("\t") ? "\t" : ",";
      rawRows = csvParse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true, delimiter, relax_quotes: true, relax_column_count: true });
    } else if (ext === ".xlsx" || ext === ".xls") {
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    } else {
      return res.status(400).json({ message: "รองรับเฉพาะไฟล์ .csv, .xlsx, .xls" });
    }

    if (rawRows.length === 0) return res.status(400).json({ message: "ไม่พบข้อมูลในไฟล์" });
    if (rawRows.length > 10000) return res.status(400).json({ message: "รองรับสูงสุด 10,000 แถวต่อครั้ง" });

    const companyProducts = await db.select().from(products).where(eq(products.companyId, companyId));
    const productCodeMap = new Map(companyProducts.filter(p => p.code).map(p => [p.code!, p]));

    const companyContacts = await db.select().from(contacts).where(eq(contacts.companyId, companyId));

    const existingIVs = await db.select({ invoiceNo: invoices.invoiceNo })
      .from(invoices).where(eq(invoices.companyId, companyId));
    const existingInvNos = new Set(existingIVs.map(e => e.invoiceNo));

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
      if (/^\d{5}$/.test(str)) {
        const excelDate = new Date((Number(str) - 25569) * 86400000);
        if (!isNaN(excelDate.getTime())) return excelDate.toISOString().split("T")[0];
      }
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
      return null;
    };

    const COL_MAP: Record<string, string> = {
      "เลขที่เอกสาร": "invoiceNo", "วันที่เอกสาร": "invoiceDate", "วันครบกำหนด": "dueDate",
      "รหัสลูกค้า": "customerCode", "ชื่อลูกค้า": "customerName",
      "เลขประจำตัวผู้เสียภาษี": "customerTaxId", "ที่อยู่ลูกค้า": "customerAddress",
      "สาขา": "branch", "ผู้ติดต่อ": "contactPerson", "โทรศัพท์": "contactPhone",
      "อีเมล": "contactEmail", "เครดิต(วัน)": "creditDays",
      "รหัสสินค้า": "productCode", "ชื่อสินค้า/บริการ": "productName",
      "รายละเอียด": "description", "จำนวน": "qty", "หน่วย": "unit",
      "ราคาต่อหน่วย": "unitPrice", "ส่วนลด": "discount",
      "ประเภท VAT": "vatType", "ภาษีหัก ณ ที่จ่าย": "withholdingTax",
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
      let key = row.invoiceNo || "";
      if (!key) {
        key = `__auto_${++autoIdx}`;
        row.invoiceNo = "";
      }
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }

    const documents: any[] = [];
    for (const [key, rows] of Array.from(grouped.entries())) {
      const first = rows[0];
      const invoiceDate = parseDateBE(first.invoiceDate);
      const dueDate = parseDateBE(first.dueDate);
      const errors: string[] = [];

      if (!invoiceDate) errors.push("วันที่เอกสารไม่ถูกต้อง");
      if (!first.customerName) errors.push("ไม่มีชื่อลูกค้า");

      const isDuplicate = first.invoiceNo && existingInvNos.has(first.invoiceNo);
      if (isDuplicate) errors.push("เลขที่เอกสารซ้ำในระบบ");

      let customerMatch: any = null;
      if (first.customerCode) {
        customerMatch = companyContacts.find((c: any) => c.code === first.customerCode);
      }
      if (!customerMatch && first.customerTaxId) {
        customerMatch = companyContacts.find((c: any) => c.taxId === first.customerTaxId);
      }
      if (!customerMatch && first.customerName) {
        customerMatch = companyContacts.find((c: any) =>
          (c.name || "").toLowerCase() === first.customerName.toLowerCase()
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

        if (!row.productName) itemErrors.push("ไม่มีชื่อสินค้า/บริการ");
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
      const creditDays = parseInt(first.creditDays) || null;

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
        invoiceNo: first.invoiceNo || "(สร้างอัตโนมัติ)",
        invoiceDate: invoiceDate || "",
        dueDate: dueDate || "",
        customerCode: first.customerCode,
        customerName: first.customerName,
        customerTaxId: first.customerTaxId,
        customerAddress: first.customerAddress,
        branch: first.branch,
        contactPerson: first.contactPerson,
        contactPhone: first.contactPhone,
        contactEmail: first.contactEmail,
        creditDays,
        notes: first.notes,
        refDoc: first.refDoc,
        priceMode,
        withholdingTax: wht,
        subtotal: Math.round(subtotal * 100) / 100,
        vatAmount,
        totalAmount: Math.round(totalAmount * 100) / 100,
        customerId: customerMatch?.id || null,
        customerMatchName: customerMatch ? (customerMatch.name) : null,
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

app.post("/api/invoices/import/create", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    if (!(await checkDocumentLimit(req, res))) return;
    const user = req.user as any;
    const { companyId, documents, autoJournal } = req.body;
    if (!companyId || !documents || !Array.isArray(documents)) {
      return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
    }
    if (user?.role !== "super_admin" && user?.tenantId) {
      const compTenantId = await getCompanyTenantId(companyId);
      if (compTenantId !== null && compTenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
      }
    }

    const created: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const doc of documents) {
      try {
        const existingIVs = await db.select({ invoiceNo: invoices.invoiceNo })
          .from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.invoiceNo, doc.invoiceNo || "")));
        if (doc.invoiceNo && doc.invoiceNo !== "(สร้างอัตโนมัติ)" && existingIVs.length > 0) {
          skipped.push({ invoiceNo: doc.invoiceNo, reason: "เลขที่เอกสารซ้ำ" });
          continue;
        }

        let invoiceNo = doc.invoiceNo;
        if (!invoiceNo || invoiceNo === "(สร้างอัตโนมัติ)") {
          invoiceNo = await getNextDocNo(companyId, "IV", invoices, invoices.invoiceNo, invoices.companyId, doc.invoiceDate);
        }

        const validItems = (doc.items || []).filter((i: any) =>
          i.productName && (parseFloat(i.qty) || 0) > 0 && (parseFloat(i.unitPrice) || 0) > 0
        );
        if (validItems.length === 0) {
          errors.push({ invoiceNo: doc.invoiceNo || "(auto)", error: "ไม่มีรายการที่ถูกต้อง" });
          continue;
        }

        const priceMode = (doc.priceMode === "included") ? "included" : "excluded";
        const wht = Math.max(0, parseFloat(doc.withholdingTax) || 0);
        let recomputedSubtotal = 0;
        for (const item of validItems) {
          const qty = parseFloat(item.qty) || 0;
          const unitPrice = parseFloat(item.unitPrice) || 0;
          const discount = Math.max(0, parseFloat(item.discount) || 0);
          item._total = Math.round((qty * unitPrice - discount) * 100) / 100;
          recomputedSubtotal += item._total;
        }
        let recomputedVat = 0;
        for (const item of validItems) {
          const vt = ["vat7", "non_vat", "zero_rated"].includes(item.vatType) ? item.vatType : "vat7";
          item.vatType = vt;
          if (priceMode === "excluded") {
            recomputedVat += vt === "vat7" ? item._total * 0.07 : 0;
          } else {
            recomputedVat += vt === "vat7" ? (item._total * 7 / 107) : 0;
          }
        }
        recomputedVat = Math.round(recomputedVat * 100) / 100;
        if (priceMode === "included") {
          recomputedSubtotal = Math.round((recomputedSubtotal - recomputedVat) * 100) / 100;
        }
        const recomputedTotal = Math.round((recomputedSubtotal + recomputedVat - wht) * 100) / 100;

        const result = await db.transaction(async (tx) => {
          const [newDoc] = await tx.insert(invoices).values({
            companyId,
            invoiceNo,
            invoiceDate: doc.invoiceDate,
            dueDate: doc.dueDate || null,
            customerId: doc.customerId ? Number(doc.customerId) : null,
            customerCode: doc.customerCode || null,
            customerName: doc.customerName,
            customerAddress: doc.customerAddress || null,
            customerTaxId: doc.customerTaxId || null,
            branch: doc.branch || null,
            contactPerson: doc.contactPerson || null,
            contactPhone: doc.contactPhone || null,
            contactEmail: doc.contactEmail || null,
            creditDays: doc.creditDays ? Number(doc.creditDays) : null,
            subtotal: String(recomputedSubtotal),
            discountAmount: "0",
            vatAmount: String(recomputedVat),
            totalAmount: String(recomputedTotal),
            withholdingTax: String(wht),
            status: "approved",
            paymentStatus: "unpaid",
            priceMode,
            docPrefix: "IV",
            notes: doc.notes || null,
            refDoc: doc.refDoc || null,
            createdBy: user.id,
          }).returning();

          for (const item of validItems) {
            await tx.insert(invoiceItems).values({
              invoiceId: newDoc.id,
              productId: item.productId ? Number(item.productId) : null,
              productCode: item.productCode || null,
              productName: item.productName,
              description: item.description || null,
              qty: String(item.qty || "1"),
              unit: item.unit || "ชิ้น",
              unitPrice: String(item.unitPrice || "0"),
              discount: String(item.discount || "0"),
              discountType: "amount",
              total: String(item._total || item.total || "0"),
              vatType: item.vatType || "vat7",
            });
          }
          return newDoc;
        });

        if (autoJournal) {
          try {
            await createAutoJournalEntry({
              companyId: result.companyId,
              documentType: "invoice",
              sourceDocType: "invoice",
              sourceDocId: result.id,
              docDate: result.invoiceDate,
              docNo: result.invoiceNo,
              subtotal: String(result.subtotal),
              vatAmount: String(result.vatAmount),
              totalAmount: String(result.totalAmount),
              withholdingTax: String(result.withholdingTax || "0"),
              currencyCode: result.currencyCode || "THB",
              exchangeRate: String(result.exchangeRate || "1"),
              userId: user.id,
              customerName: result.customerName,
              overrideLines: body?.journalOverrideLines || undefined,
            });
          } catch (e: any) { console.error(`[Invoice Import] Auto journal error:`, e.message); }
        }

        logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "invoice", entityId: String(result.id), entityName: invoiceNo }).catch(() => {});
        created.push({ invoiceNo, id: result.id });
      } catch (e: any) {
        errors.push({ invoiceNo: doc.invoiceNo || "(auto)", error: e.message });
      }
    }

    const createdIds = created.map((c: any) => c.id).filter(Boolean);
    if (createdIds.length > 0) {
      const [batch] = await db.insert(documentImportBatches).values({
        companyId,
        docType: "invoice",
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

// ========== Tax Invoice Routes ==========

async function computeTaxInvoicePaidAmounts(taxInvoiceIds: number[]): Promise<Record<number, number>> {
  const paidMap: Record<number, number> = {};
  if (taxInvoiceIds.length === 0) return paidMap;
  const idArr = `'{${taxInvoiceIds.join(",")}}'::int[]`;
  const batchPaid = await db.execute(sql.raw(`SELECT doc_id, SUM(amount) AS paid FROM receipt_linked_docs WHERE doc_type = 'TIV' AND doc_id = ANY(${idArr}) GROUP BY doc_id`));
  for (const r of (batchPaid as any).rows || []) paidMap[r.doc_id] = (paidMap[r.doc_id] || 0) + parseFloat(r.paid || 0);
  return paidMap;
}

async function computeTaxInvoiceCNAmounts(taxInvoiceIds: number[]): Promise<Record<number, number>> {
  const cnMap: Record<number, number> = {};
  if (taxInvoiceIds.length === 0) return cnMap;
  const rows = await db.select({ refId: salesCreditNotes.refTaxInvoiceId, total: salesCreditNotes.totalAmount })
    .from(salesCreditNotes)
    .where(and(inArray(salesCreditNotes.refTaxInvoiceId as any, taxInvoiceIds), sql`${salesCreditNotes.status} != 'cancelled'`));
  for (const r of rows) {
    if (r.refId) cnMap[r.refId] = (cnMap[r.refId] || 0) + parseFloat(String(r.total || 0));
  }
  return cnMap;
}

app.get("/api/tax-invoices", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const whereClause = and(eq(taxInvoices.companyId, companyId), isNull(taxInvoices.summaryTaxInvoiceId));
    const buildResult = async (rows: any[]) => {
      const userIds = Array.from(new Set(rows.map((r: any) => r.createdBy).concat(rows.map((r: any) => r.updatedBy)).filter(Boolean))) as number[];
      const userMap: Record<number, string> = {};
      if (userIds.length > 0) { const uu = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, userIds)); for (const u of uu) userMap[u.id] = u.fullName; }
      const paidMap = await computeTaxInvoicePaidAmounts(rows.map((r: any) => r.id));
      const cnMap = await computeTaxInvoiceCNAmounts(rows.map((r: any) => r.id));
      const bnLinkedTivIds = new Set<number>();
      const approvalMap: Record<number, string> = {};
      const journalEntryIds = new Set<number>();
      if (rows.length > 0) {
        const ids = rows.map((r: any) => r.id);
        const bnLinks = await db.select({ docId: billingNoteLinkedDocs.docId })
          .from(billingNoteLinkedDocs)
          .where(and(eq(billingNoteLinkedDocs.docType, "TIV"), inArray(billingNoteLinkedDocs.docId, ids)));
        for (const l of bnLinks) bnLinkedTivIds.add(l.docId);
        const arRows = await db.select({ documentId: approvalRequests.documentId, status: approvalRequests.status })
          .from(approvalRequests)
          .where(and(eq(approvalRequests.documentType, "tax_invoice"), inArray(approvalRequests.documentId, ids)));
        for (const ar of arRows) approvalMap[ar.documentId] = ar.status;
        const jeRows = await db.execute(sql.raw(`SELECT DISTINCT source_doc_id FROM journal_entries WHERE source_doc_type = 'tax_invoice' AND source_doc_id = ANY(ARRAY[${ids.join(",")}]::int[])`));
        for (const je of (jeRows as any).rows || []) journalEntryIds.add(Number(je.source_doc_id));
      }
      return rows.map((r: any) => ({ ...r, createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-", updatedByName: r.updatedBy ? userMap[r.updatedBy] || "-" : "-", paidAmount: paidMap[r.id] || 0, cnAmount: cnMap[r.id] || 0, hasBillingNote: bnLinkedTivIds.has(r.id), approvalStatus: approvalMap[r.id] || null, hasJournalEntry: journalEntryIds.has(r.id) }));
    };
    if (req.query.page) {
      const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
      const [{ total }] = await db.select({ total: count() }).from(taxInvoices).where(whereClause);
      const rows = await db.select().from(taxInvoices).where(whereClause).orderBy(desc(taxInvoices.taxInvoiceDate), desc(taxInvoices.id)).limit(pageSize).offset(offset);
      return res.json(paginatedResponse(await buildResult(rows), Number(total), { page, pageSize, offset }));
    }
    const rows = await db.select().from(taxInvoices).where(whereClause).orderBy(desc(taxInvoices.taxInvoiceDate), desc(taxInvoices.id));
    res.json(await buildResult(rows));
  } catch (err: any) { console.error("[tax-invoices] list error:", err); res.status(500).json({ message: err.message }); }
});

app.get("/api/tax-invoices/next-no", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const prefix = String(req.query.prefix || "TIV");
    const taxInvoiceNo = await getNextDocNo(companyId, prefix, taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId, req.query.docDate as string);
    res.json({ taxInvoiceNo });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/tax-invoices/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [doc] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ message: "ไม่พบใบกำกับภาษี" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const items = await db.select().from(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, doc.id));
    let createdByName = "-";
    let updatedByName = "-";
    if (doc.createdBy) { const u = await storage.getUser(doc.createdBy); if (u) createdByName = u.fullName; }
    if (doc.updatedBy) { const u = await storage.getUser(doc.updatedBy); if (u) updatedByName = u.fullName; }
    res.json({ ...doc, items, createdByName, updatedByName });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/tax-invoices", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    if (!(await checkDocumentLimit(req, res))) return;
    const { items, ...body } = req.body;
    if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
    else body.creditDays = Number(body.creditDays) || null;
    if (body.customerId === "" || body.customerId === undefined) body.customerId = null;
    else body.customerId = Number(body.customerId) || null;
    const user = req.user as any;
    const companyId = Number(body.companyId);
    if (!companyId || !body.customerName || !body.taxInvoiceDate) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน (companyId, customerName, taxInvoiceDate)" });
    }
    const prefix = body.docPrefix || "TIV";
    let taxInvoiceNo = body.taxInvoiceNo;
    if (!taxInvoiceNo) {
      taxInvoiceNo = await getNextDocNo(companyId, prefix, taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId, body.taxInvoiceDate);
    } else {
      const fmtCheck = await validateDocNo(companyId, taxInvoiceNo, prefix, body.taxInvoiceDate);
      if (!fmtCheck.valid) {
        taxInvoiceNo = await getNextDocNo(companyId, prefix, taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId, body.taxInvoiceDate);
      }
    }
    const result = await db.transaction(async (tx) => {
      const [doc] = await tx.insert(taxInvoices).values({
        companyId,
        taxInvoiceNo,
        taxInvoiceDate: body.taxInvoiceDate,
        dueDate: body.dueDate || null,
        customerId: body.customerId ? Number(body.customerId) : null,
        customerCode: body.customerCode || null,
        customerName: body.customerName,
        customerAddress: body.customerAddress || null,
        customerTaxId: body.customerTaxId || null,
        branch: body.branch || null,
      sellerBranchId: body.sellerBranchId || null,
        contactPerson: body.contactPerson || null,
        contactPhone: body.contactPhone || null,
        contactEmail: body.contactEmail || null,
        creditDays: body.creditDays ? Number(body.creditDays) : null,
        subtotal: body.subtotal || "0",
        discountAmount: body.discountAmount || "0",
        vatAmount: body.vatAmount || "0",
        totalAmount: body.totalAmount || "0",
        withholdingTax: body.withholdingTax || "0",
        status: body.status || "approved",
        priceMode: body.priceMode || "excluded",
        paymentTerms: body.paymentTerms || null,
        attachedUrl: body.attachedUrl || null,
        salesperson: body.salesperson || null,
        department: body.department || null,
        project: body.project || null,
        docPrefix: body.docPrefix || "TIV",
        refDoc: body.refDoc || null,
        quotationId: body.quotationId ? Number(body.quotationId) : null,
        invoiceId: body.invoiceId ? Number(body.invoiceId) : null,
        notes: body.notes || null,
        internalNotes: body.internalNotes || null,
        paymentMethod: body.paymentMethod || "เครดิต",
        originalTaxInvoiceNo: body.originalTaxInvoiceNo || null,
        isDebitNote: body.isDebitNote || false,
        isCreditNote: body.isCreditNote || false,
        currencyCode: body.currencyCode || "THB",
        exchangeRate: body.exchangeRate || "1",
        createdBy: user.id,
      }).returning();
      if (items && Array.isArray(items) && items.length > 0) {
        const itemValues = items.map((item: any) => {
          const rawDiscount = String(item.discount || "0");
          const isPercent = rawDiscount.includes("%");
          const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
          return {
            taxInvoiceId: doc.id,
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
          };
        });
        const insertedItems = await tx.insert(taxInvoiceItems).values(itemValues).returning({ id: taxInvoiceItems.id });
        for (let i = 0; i < insertedItems.length; i++) {
          if (items[i]?.warehouseId) {
            await tx.execute(sql`UPDATE tax_invoice_items SET warehouse_id = ${Number(items[i].warehouseId)} WHERE id = ${insertedItems[i].id}`);
          }
        }
      }
      return doc;
    });
    const savedItems = await fetchTaxInvoiceItems(result.id);

    let journalResult = null;
    try {
      const pmAccCode = await resolvePaymentMethodAccountCode(result.companyId, result.paymentMethod);
      journalResult = await createAutoJournalEntry({
        companyId: result.companyId,
        documentType: "tax_invoice",
        sourceDocType: "tax_invoice",
        sourceDocId: result.id,
        docDate: result.taxInvoiceDate,
        docNo: result.taxInvoiceNo,
        subtotal: String(result.subtotal),
        vatAmount: String(result.vatAmount),
        totalAmount: String(result.totalAmount),
        withholdingTax: String(result.withholdingTax || "0"),
        currencyCode: result.currencyCode || "THB",
        exchangeRate: String(result.exchangeRate || "1"),
        userId: user.id,
        customerName: result.customerName,
        paymentMethod: result.paymentMethod || "เครดิต",
        paymentMethodAccountCode: pmAccCode,
        linkedInvoiceId: result.invoiceId,
        isCreditPayment: result.status !== "cash",
        overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
      });
    } catch (e) {}

    if (!["draft", "pending", "cancelled", "voided", "rejected"].includes(result.status)) {
      const deductTiItems = savedItems
        .filter((i: any) => i.productId && parseFloat(String(i.qty || "0")) > 0)
        .map((i: any) => ({ productId: i.productId, qty: parseFloat(String(i.qty)), warehouseId: i.warehouseId || null, unitPrice: String(i.unitPrice || "0"), productName: i.productName || i.description }));
      if (deductTiItems.length > 0) {
        const tiCreateTriggers = await getInventoryTriggers(result.companyId);
        if (tiCreateTriggers.invoice_deduct) {
          const docLabelTi = `ขายสินค้า ${result.taxInvoiceNo}${result.customerName ? ` (${result.customerName})` : ""}`;
          await deductStockBundleAware(deductTiItems, result.companyId, docLabelTi, "tax_invoice", result.id, user.id).catch((err: any) => { console.error(`[TIV-CREATE] deductStock failed for tiv#${result.id}:`, err.message); });
        }
      }
    }
    // ถ้า TIV สร้างจาก SO โดยตรง (refDoc ขึ้นต้นด้วย SO) → release การจองสต๊อกของ SO นั้น
    if (body.refDoc && String(body.refDoc).startsWith("SO")) {
      try {
        const soRows = await db.execute(sql`SELECT id FROM sales_orders WHERE company_id = ${companyId} AND order_no = ${String(body.refDoc)} LIMIT 1`);
        const soId = (soRows.rows as any[])[0]?.id;
        if (soId) {
          const soItems = await fetchSalesOrderItems(soId);
          await releaseSOStock(soItems, companyId);
          console.log(`[TIV-CREATE] Released SO#${body.refDoc} reservation (${soItems.length} items)`);
        }
      } catch (e: any) { console.error("[TIV-CREATE] release SO reservation failed:", e.message); }
    }
    logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "tax_invoice", entityId: String(result.id), entityName: taxInvoiceNo }).catch(() => {});
    // ถ้า status = "cash" (frontend คำนวณ isCashMethod แล้ว) → ถือว่าชำระแล้วทันที
    if (result.status === "cash") {
      try {
        await db.update(taxInvoices).set({ paymentStatus: "paid", status: "paid" }).where(eq(taxInvoices.id, result.id));
        result.paymentStatus = "paid";
        result.status = "paid";
      } catch (e: any) { console.error(`[TIV-CREATE] mark paid failed:`, e.message); }
    }
    if (result.invoiceId) {
      try { await recomputePaymentStatus("invoice", result.invoiceId); } catch (e: any) { console.error(`[TIV-CREATE] recomputePaymentStatus invoice#${result.invoiceId} failed:`, e.message); }
    }
    res.status(201).json({ ...result, items: savedItems, journalResult });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/tax-invoices/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [existing] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบกำกับภาษี" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const { items, ...body } = req.body;
    const updateData: any = {};
    const allowedFields = [
      "taxInvoiceNo", "taxInvoiceDate", "dueDate", "customerId", "customerCode", "customerName",
      "customerAddress", "customerTaxId", "branch", "contactPerson", "contactPhone", "contactEmail",
      "creditDays", "subtotal", "discountAmount", "vatAmount", "totalAmount", "withholdingTax",
      "status", "priceMode", "paymentTerms", "attachedUrl",
      "salesperson", "department", "project", "docPrefix", "refDoc",
      "quotationId", "invoiceId", "notes", "internalNotes", "originalTaxInvoiceNo", "isDebitNote", "isCreditNote",
      "currencyCode", "exchangeRate", "paymentMethod"
    ];
    const integerFields = ["customerId", "creditDays", "quotationId", "invoiceId"];
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
      await tx.update(taxInvoices).set(updateData).where(eq(taxInvoices.id, existing.id));
      if (items && Array.isArray(items)) {
        await tx.delete(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, existing.id));
        if (items.length > 0) {
          const itemValues = items.map((item: any) => {
            const rawDiscount = String(item.discount || "0");
            const isPercent = rawDiscount.includes("%");
            const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
            return {
              taxInvoiceId: existing.id,
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
            };
          });
          const insertedItems = await tx.insert(taxInvoiceItems).values(itemValues).returning({ id: taxInvoiceItems.id });
          for (let i = 0; i < insertedItems.length; i++) {
            if (items[i]?.warehouseId) {
              await tx.execute(sql`UPDATE tax_invoice_items SET warehouse_id = ${Number(items[i].warehouseId)} WHERE id = ${insertedItems[i].id}`);
            }
          }
        }
      }
    });
    const [[updated], savedItems] = await Promise.all([
      db.select().from(taxInvoices).where(eq(taxInvoices.id, existing.id)),
      fetchTaxInvoiceItems(existing.id),
    ]);

    let journalResult = null;
    const statusChanged = body.status && body.status !== existing.status;
    const journalStatuses = ["approved", "issued", "debtor"];
    const shouldCreateTxJournal = (statusChanged && journalStatuses.includes(body.status)) || journalStatuses.includes(updated.status || "");
    if (shouldCreateTxJournal) {
      try {
        if (updated.invoiceId) {
          const [linkedInvoiceJE] = await db.select().from(journalEntries)
            .where(and(
              eq(journalEntries.companyId, updated.companyId),
              eq(journalEntries.sourceDocType, "invoice"),
              eq(journalEntries.sourceDocId, updated.invoiceId),
            ));
          if (linkedInvoiceJE) {
            const vat = parseFloat(String(updated.vatAmount)) || 0;
            if (vat > 0) {
              const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, updated.companyId));
              const accountMap = new Map(allAccounts.map(a => [a.code, a]));
              const deferredVatAcc = accountMap.get("2342000");
              const outputVatAcc = accountMap.get("2341000");
              if (deferredVatAcc && outputVatAcc) {
                const [existingTxJE] = await db.select().from(journalEntries)
                  .where(and(
                    eq(journalEntries.companyId, updated.companyId),
                    eq(journalEntries.sourceDocType, "tax_invoice"),
                    eq(journalEntries.sourceDocId, updated.id),
                  ));
                if (!existingTxJE) {
                  const desc = `ใบกำกับภาษี ${updated.taxInvoiceNo} - กลับรายการภาษีขายยังไม่ถึงกำหนด${updated.customerName ? ` - ${updated.customerName}` : ""}`;
                  const entryNo = await getNextJournalEntryNo(updated.companyId, "sales", updated.taxInvoiceDate);
                  const [entry] = await db.insert(journalEntries).values({
                    companyId: updated.companyId,
                    entryNo,
                    entryDate: updated.taxInvoiceDate,
                    reference: updated.taxInvoiceNo,
                    description: desc,
                    journalBook: "sales",
                    contactName: updated.customerName || null,
                    createdBy: user.id,
                    status: "posted",
                    sourceDocType: "tax_invoice",
                    sourceDocId: updated.id,
                    currencyCode: updated.currencyCode || "THB",
                    exchangeRate: String(updated.exchangeRate || "1"),
                  }).returning();
                  await db.insert(journalLines).values({
                    journalEntryId: entry.id,
                    accountId: deferredVatAcc.id,
                    description: deferredVatAcc.nameTh ? `${deferredVatAcc.nameTh}(${deferredVatAcc.name})` : deferredVatAcc.name || "ภาษีขายยังไม่ถึงกำหนด",
                    debit: String(vat.toFixed(2)),
                    credit: "0",
                  });
                  await db.insert(journalLines).values({
                    journalEntryId: entry.id,
                    accountId: outputVatAcc.id,
                    description: outputVatAcc.nameTh ? `${outputVatAcc.nameTh}(${outputVatAcc.name})` : outputVatAcc.name || "ภาษีขาย",
                    debit: "0",
                    credit: String(vat.toFixed(2)),
                  });
                  journalResult = { journalEntryId: entry.id, skipped: false };
                }
              } else {
                journalResult = { journalEntryId: null, skipped: true, reason: "ไม่พบบัญชี 2132 (ภาษีขายยังไม่ถึงกำหนด) หรือ 2130 (ภาษีขาย) ในผังบัญชี" };
              }
            } else {
              journalResult = { journalEntryId: null, skipped: true, reason: "ไม่มี VAT — ไม่ต้องกลับรายการภาษี" };
            }
          } else {
            const pmAccCode2 = await resolvePaymentMethodAccountCode(updated.companyId, updated.paymentMethod);
            journalResult = await createAutoJournalEntry({
              companyId: updated.companyId,
              documentType: "tax_invoice",
              sourceDocType: "tax_invoice",
              sourceDocId: updated.id,
              docDate: updated.taxInvoiceDate,
              docNo: updated.taxInvoiceNo,
              subtotal: String(updated.subtotal),
              vatAmount: String(updated.vatAmount),
              totalAmount: String(updated.totalAmount),
              withholdingTax: String(updated.withholdingTax || "0"),
              currencyCode: updated.currencyCode || "THB",
              exchangeRate: String(updated.exchangeRate || "1"),
              userId: user.id,
              customerName: updated.customerName,
              paymentMethod: updated.paymentMethod || undefined,
              paymentMethodAccountCode: pmAccCode2,
              linkedInvoiceId: updated.invoiceId,
              overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
            });
          }
        } else {
          const pmAccCode3 = await resolvePaymentMethodAccountCode(updated.companyId, updated.paymentMethod);
          journalResult = await createAutoJournalEntry({
            companyId: updated.companyId,
            documentType: "tax_invoice",
            sourceDocType: "tax_invoice",
            sourceDocId: updated.id,
            docDate: updated.taxInvoiceDate,
            docNo: updated.taxInvoiceNo,
            subtotal: String(updated.subtotal),
            vatAmount: String(updated.vatAmount),
            totalAmount: String(updated.totalAmount),
            withholdingTax: String(updated.withholdingTax || "0"),
            currencyCode: updated.currencyCode || "THB",
            exchangeRate: String(updated.exchangeRate || "1"),
            userId: user.id,
            customerName: updated.customerName,
            paymentMethod: updated.paymentMethod || undefined,
            paymentMethodAccountCode: pmAccCode3,
            linkedInvoiceId: updated.invoiceId,
            overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
          });
        }
      } catch (e) {}

      const deductItems2 = savedItems
        .filter((i: any) => i.productId && parseFloat(String(i.qty || "0")) > 0)
        .map((i: any) => ({ productId: i.productId, qty: parseFloat(String(i.qty)), warehouseId: i.warehouseId || null, unitPrice: String(i.unitPrice || "0"), productName: i.productName || i.description }));
      const tiPatchTriggers = await getInventoryTriggers(updated.companyId);
      if (tiPatchTriggers.invoice_deduct) {
        const docLabel2 = `ขายสินค้า ${updated.taxInvoiceNo}${updated.customerName ? ` (${updated.customerName})` : ""}`;
        await deductStockBundleAware(deductItems2, updated.companyId, docLabel2, "tax_invoice", updated.id, user.id);
      }
    }

    const tivPatchInvoiceId = updated.invoiceId || existing.invoiceId;
    if (tivPatchInvoiceId) {
      try { await recomputePaymentStatus("invoice", tivPatchInvoiceId); } catch (e: any) { console.error(`[TIV-PATCH] recomputePaymentStatus invoice#${tivPatchInvoiceId} failed:`, e.message); }
    }
    res.json({ ...updated, items: savedItems, journalResult });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/tax-invoices/bulk-journal", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const { ids, companyId } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "กรุณาเลือกเอกสาร" });
    if (ids.length > 200) return res.status(400).json({ message: "เลือกได้สูงสุด 200 รายการ" });
    if (!companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });
    const user = req.user as any;
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const numId = Number(id);
        if (!Number.isFinite(numId) || numId <= 0) { skipped++; continue; }

        const [inv] = await db.select().from(taxInvoices).where(
          and(eq(taxInvoices.id, numId), eq(taxInvoices.companyId, Number(companyId)))
        );
        if (!inv) { skipped++; continue; }
        if (!["approved", "issued", "debtor"].includes(inv.status || "")) { skipped++; continue; }

        const [existingJE] = await db.select().from(journalEntries).where(
          and(
            eq(journalEntries.companyId, inv.companyId),
            eq(journalEntries.sourceDocType, "tax_invoice"),
            eq(journalEntries.sourceDocId, inv.id),
          )
        );
        if (existingJE) { skipped++; continue; }

        if (inv.invoiceId) {
          const [linkedInvoiceJE] = await db.select().from(journalEntries).where(
            and(
              eq(journalEntries.companyId, inv.companyId),
              eq(journalEntries.sourceDocType, "invoice"),
              eq(journalEntries.sourceDocId, inv.invoiceId),
            )
          );
          if (linkedInvoiceJE) {
            const vat = parseFloat(String(inv.vatAmount)) || 0;
            if (vat > 0) {
              const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, inv.companyId));
              const accountMap = new Map(allAccounts.map(a => [a.code, a]));
              const deferredVatAcc = accountMap.get("2342000");
              const outputVatAcc = accountMap.get("2341000");
              if (deferredVatAcc && outputVatAcc) {
                await db.transaction(async (tx) => {
                  const desc = `ใบกำกับภาษี ${inv.taxInvoiceNo} - กลับรายการภาษีขายยังไม่ถึงกำหนด${inv.customerName ? ` - ${inv.customerName}` : ""}`;
                  const entryNo = await getNextJournalEntryNo(inv.companyId, "sales", inv.taxInvoiceDate);
                  const [entry] = await tx.insert(journalEntries).values({
                    companyId: inv.companyId, entryNo, entryDate: inv.taxInvoiceDate,
                    reference: inv.taxInvoiceNo, description: desc, journalBook: "sales",
                    contactName: inv.customerName || null, createdBy: user.id, status: "posted",
                    sourceDocType: "tax_invoice", sourceDocId: inv.id,
                    currencyCode: inv.currencyCode || "THB", exchangeRate: String(inv.exchangeRate || "1"),
                  }).returning();
                  await tx.insert(journalLines).values({
                    journalEntryId: entry.id, accountId: deferredVatAcc.id,
                    description: deferredVatAcc.nameTh || deferredVatAcc.name || "ภาษีขายยังไม่ถึงกำหนด",
                    debit: String(vat.toFixed(2)), credit: "0",
                  });
                  await tx.insert(journalLines).values({
                    journalEntryId: entry.id, accountId: outputVatAcc.id,
                    description: outputVatAcc.nameTh || outputVatAcc.name || "ภาษีขาย",
                    debit: "0", credit: String(vat.toFixed(2)),
                  });
                });
                created++;
              } else { skipped++; }
            } else { skipped++; }
            continue;
          }
        }

        const pmAccCode = await resolvePaymentMethodAccountCode(inv.companyId, inv.paymentMethod);
        const result = await createAutoJournalEntry({
          companyId: inv.companyId, documentType: "tax_invoice",
          sourceDocType: "tax_invoice", sourceDocId: inv.id,
          docDate: inv.taxInvoiceDate, docNo: inv.taxInvoiceNo,
          subtotal: String(inv.subtotal), vatAmount: String(inv.vatAmount),
          totalAmount: String(inv.totalAmount), withholdingTax: String(inv.withholdingTax || "0"),
          currencyCode: inv.currencyCode || "THB", exchangeRate: String(inv.exchangeRate || "1"),
          userId: user.id, customerName: inv.customerName,
          paymentMethod: inv.paymentMethod || undefined,
          paymentMethodAccountCode: pmAccCode, linkedInvoiceId: inv.invoiceId,
          overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
        });
        if (result?.journalEntryId) created++;
        else skipped++;
      } catch (e: any) {
        errors.push(`${id}: ${e.message}`);
      }
    }

    res.json({ created, skipped, total: ids.length, errors });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/tax-invoices/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [existing] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบกำกับภาษี" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const blockers: string[] = [];
    const linkedReceipts = await db.select({ id: receipts.id, receiptNo: receipts.receiptNo }).from(receipts).where(eq(receipts.taxInvoiceId, existing.id));
    if (linkedReceipts.length > 0) blockers.push(`ใบเสร็จรับเงิน: ${linkedReceipts.map(r => r.receiptNo).join(", ")}`);
    const linkedCN = await db.select({ id: salesCreditNotes.id, creditNoteNo: salesCreditNotes.creditNoteNo }).from(salesCreditNotes).where(eq(salesCreditNotes.refTaxInvoiceId, existing.id));
    if (linkedCN.length > 0) blockers.push(`ใบลดหนี้: ${linkedCN.map(r => r.creditNoteNo).join(", ")}`);
    if (blockers.length > 0) {
      return res.status(400).json({ message: `ไม่สามารถลบได้ เนื่องจากมีเอกสารเชื่อมอยู่:\n${blockers.join("\n")}\nกรุณาลบเอกสารที่เชื่อมก่อน` });
    }
    const tiItems = await fetchTaxInvoiceItems(existing.id);
    const hadStockMovements = (await db.select({ id: stockMovements.id }).from(stockMovements).where(
      and(eq(stockMovements.referenceType, "tax_invoice"), eq(stockMovements.referenceId, existing.id))
    )).length > 0;
    await db.transaction(async (tx) => {
      await tx.update(liveCfOrders).set({ taxInvoiceId: null }).where(eq(liveCfOrders.taxInvoiceId, existing.id));
      await deleteJournalEntriesForDoc(tx, "tax_invoice", existing.id);
      await deleteStockMovementsForDoc(tx, "tax_invoice", existing.id);
      await tx.delete(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, existing.id));
      await tx.delete(taxInvoices).where(eq(taxInvoices.id, existing.id));
    });
    const tiDelTriggers = await getInventoryTriggers(existing.companyId);
    if (tiDelTriggers.invoice_deduct && hadStockMovements) await reverseWarehouseStockBundleAware(tiItems, existing.companyId);
    if (existing.invoiceId) {
      try { await recomputePaymentStatus("invoice", existing.invoiceId); } catch (e: any) { console.error(`[TIV-DELETE] recomputePaymentStatus invoice#${existing.invoiceId} failed:`, e.message); }
    }
    // ถ้า TIV สร้างจาก BN → reset BN.status + BN.paymentStatus + IV statuses ทั้งหมดกลับด้วย
    if (existing.refDoc) {
      try {
        const [bnRow] = await db.select({ id: billingNotes.id })
          .from(billingNotes)
          .where(and(eq(billingNotes.billingNo, existing.refDoc), eq(billingNotes.companyId, existing.companyId)));
        if (bnRow) {
          await db.update(billingNotes)
            .set({ status: "approved", paymentStatus: "unpaid", updatedAt: new Date() })
            .where(eq(billingNotes.id, bnRow.id));
          // คืนสถานะ IV ทั้งหมดที่ผูกกับ BN นี้กลับเป็น approved
          const bnIVLinks = await db.select({ docId: billingNoteLinkedDocs.docId })
            .from(billingNoteLinkedDocs)
            .where(and(eq(billingNoteLinkedDocs.billingNoteId, bnRow.id), eq(billingNoteLinkedDocs.docType, "IV")));
          for (const link of bnIVLinks) {
            try { await recomputePaymentStatus("invoice", link.docId); } catch {}
          }
        }
      } catch (e: any) { console.error(`[TIV-DELETE] reset BN/IV status failed:`, e.message); }
    }
    const user = req.user as any;
    logActivity({ companyId: existing.companyId, userId: user.id, userName: user.username, action: "delete", entityType: "tax_invoice", entityId: String(existing.id), entityName: existing.taxInvoiceNo }).catch(() => {});
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/tax-invoices/bulk-delete", requireAuth, requireAnyModule("sales", "ecommerce"), requireRole("admin", "owner", "super_admin"), async (req, res) => {
  try {
    const { ids, companyId: reqCompanyId } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "กรุณาระบุรายการที่ต้องการลบ" });
    const user = req.user as any;
    if (user?.role !== "super_admin" && user?.tenantId && reqCompanyId) {
      const compTenantId = await getCompanyTenantId(reqCompanyId);
      if (compTenantId !== null && compTenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    let deleted = 0; const errors: string[] = [];
    for (const id of ids) {
      try {
        const [existing] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, Number(id)));
        if (!existing) { errors.push(`#${id}: ไม่พบ`); continue; }
        const bulkTiItems = await fetchTaxInvoiceItems(existing.id);
        const bulkHadMovements = (await db.select({ id: stockMovements.id }).from(stockMovements).where(
          and(eq(stockMovements.referenceType, "tax_invoice"), eq(stockMovements.referenceId, existing.id))
        )).length > 0;
        await db.transaction(async (tx) => {
          await deleteJournalEntriesForDoc(tx, "tax_invoice", existing.id);
          await deleteStockMovementsForDoc(tx, "tax_invoice", existing.id);
          await tx.delete(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, existing.id));
          await tx.delete(taxInvoices).where(eq(taxInvoices.id, existing.id));
        });
        const bulkTiDelTriggers = await getInventoryTriggers(existing.companyId);
        if (bulkTiDelTriggers.invoice_deduct && bulkHadMovements) await reverseWarehouseStockBundleAware(bulkTiItems, existing.companyId);
        if (existing.invoiceId) {
          try { await recomputePaymentStatus("invoice", existing.invoiceId); } catch (e: any) { console.error(`[TIV-BULK-DELETE] recomputePaymentStatus invoice#${existing.invoiceId} failed:`, e.message); }
        }
        if (existing.refDoc) {
          try {
            const [bnRowB] = await db.select({ id: billingNotes.id })
              .from(billingNotes)
              .where(and(eq(billingNotes.billingNo, existing.refDoc), eq(billingNotes.companyId, existing.companyId)));
            if (bnRowB) {
              await db.update(billingNotes)
                .set({ status: "approved", paymentStatus: "unpaid", updatedAt: new Date() })
                .where(eq(billingNotes.id, bnRowB.id));
              const bnIVLinksB = await db.select({ docId: billingNoteLinkedDocs.docId })
                .from(billingNoteLinkedDocs)
                .where(and(eq(billingNoteLinkedDocs.billingNoteId, bnRowB.id), eq(billingNoteLinkedDocs.docType, "IV")));
              for (const link of bnIVLinksB) {
                try { await recomputePaymentStatus("invoice", link.docId); } catch {}
              }
            }
          } catch (e: any) { console.error(`[TIV-BULK-DELETE] reset BN/IV status failed:`, e.message); }
        }
        logActivity({ companyId: existing.companyId, userId: user.id, userName: user.username, action: "delete", entityType: "tax_invoice", entityId: String(existing.id), entityName: existing.taxInvoiceNo }).catch(() => {});
        deleted++;
      } catch (e: any) { errors.push(`#${id}: ${e.message}`); }
    }
    res.json({ deleted, errors, total: ids.length });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/tax-invoices/:id/clone", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [doc] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ message: "ไม่พบใบกำกับภาษี" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const items = await db.select().from(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, doc.id));
    const prefix = (doc as any).docPrefix || "TIV";
    const taxInvoiceNo = await getNextDocNo(doc.companyId, prefix, taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId, doc.taxInvoiceDate);
    const user = req.user as any;
    const result = await db.transaction(async (tx) => {
      const [cloned] = await tx.insert(taxInvoices).values({
        companyId: doc.companyId, taxInvoiceNo,
        taxInvoiceDate: new Date().toISOString().split("T")[0],
        dueDate: doc.dueDate, customerId: doc.customerId,
        customerCode: doc.customerCode, customerName: doc.customerName,
        customerAddress: doc.customerAddress, customerTaxId: doc.customerTaxId,
        branch: doc.branch, contactPerson: doc.contactPerson,
        contactPhone: doc.contactPhone, contactEmail: doc.contactEmail,
        subtotal: doc.subtotal, discountAmount: doc.discountAmount,
        vatAmount: doc.vatAmount, totalAmount: doc.totalAmount,
        status: "approved", notes: doc.notes, internalNotes: doc.internalNotes,
        priceMode: doc.priceMode, withholdingTax: doc.withholdingTax,
        docPrefix: (doc as any).docPrefix,
        currencyCode: doc.currencyCode, exchangeRate: doc.exchangeRate,
        createdBy: user.id,
      }).returning();
      if (items.length > 0) {
        await tx.insert(taxInvoiceItems).values(items.map((it: any) => ({
          taxInvoiceId: cloned.id, productId: it.productId,
          productCode: it.productCode, productName: it.productName,
          description: it.description, qty: it.qty,
          unit: it.unit, unitPrice: it.unitPrice,
          discount: it.discount, discountType: it.discountType,
          total: it.total, vatType: it.vatType,
        })));
      }
      return cloned;
    });
    res.status(201).json(result);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Tax Invoice Share ==========
app.post("/api/tax-invoices/:id/share", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [doc] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ message: "ไม่พบใบกำกับภาษี" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    let token = doc.shareToken;
    if (!token) {
      const { randomBytes } = await import("crypto");
      token = randomBytes(24).toString("hex");
      await db.update(taxInvoices).set({ shareToken: token }).where(eq(taxInvoices.id, doc.id));
    }
    res.json({ shareToken: token });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/share/tax-invoice/:token", async (req, res) => {
  try {
    const [doc] = await db.select().from(taxInvoices).where(eq(taxInvoices.shareToken, req.params.token));
    if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    const items = await db.select().from(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, doc.id));
    const [company] = await db.select().from(companies).where(eq(companies.id, doc.companyId));
    let docSetting = null;
    let userSignature = null;
    try { const [ds] = await db.select().from(documentSettings).where(eq(documentSettings.companyId, doc.companyId)); docSetting = ds || null; } catch {}
    if (doc.createdBy) {
      try { const u = await storage.getUser(doc.createdBy); if (u) userSignature = { signatureUrl: u.signatureUrl || null, signatureName: u.signatureName || u.fullName, signatureTitle: u.signatureTitle || null }; } catch {}
    }
    const { internalNotes, shareToken, createdBy, updatedBy, ...publicDoc } = doc;
    res.json({ ...publicDoc, items, company: company || null, documentSettings: docSetting, userSignature });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Receipt Routes ==========

app.get("/api/receipts", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const whereClause = eq(receipts.companyId, companyId);
    const buildResult = async (rows: any[]) => {
      const userIds = Array.from(new Set(rows.map((r: any) => r.createdBy).concat(rows.map((r: any) => r.updatedBy)).filter(Boolean))) as number[];
      const userMap: Record<number, string> = {};
      for (const uid of userIds) { try { const u = await storage.getUser(uid); if (u) userMap[uid] = u.username; } catch {} }
      const ids = rows.map((r: any) => r.id).filter(Boolean);
      let linkedDocsMap: Record<number, { docType: string; docNo: string; docId: number }[]> = {};
      if (ids.length > 0) {
        const ldRows = await db.select().from(receiptLinkedDocs).where(sql`receipt_id = ANY(ARRAY[${sql.raw(ids.join(","))}]::int[])`);
        for (const ld of ldRows) {
          if (!linkedDocsMap[ld.receiptId]) linkedDocsMap[ld.receiptId] = [];
          linkedDocsMap[ld.receiptId].push({ docType: ld.docType, docNo: ld.docNo || "", docId: ld.docId });
        }
      }
      return rows.map((r: any) => ({ ...r, createdByName: r.createdBy ? userMap[r.createdBy] || "-" : "-", updatedByName: r.updatedBy ? userMap[r.updatedBy] || "-" : "-", linkedDocs: linkedDocsMap[r.id] || [] }));
    };
    if (req.query.page) {
      const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
      const [{ total }] = await db.select({ total: count() }).from(receipts).where(whereClause);
      const rows = await db.select().from(receipts).where(whereClause).orderBy(desc(receipts.receiptDate), desc(receipts.id)).limit(pageSize).offset(offset);
      return res.json(paginatedResponse(await buildResult(rows), Number(total), { page, pageSize, offset }));
    }
    const rows = await db.select().from(receipts).where(whereClause).orderBy(desc(receipts.receiptDate), desc(receipts.id));
    res.json(await buildResult(rows));
  } catch (err: any) { console.error("[receipts] list error:", err); res.status(500).json({ message: err.message }); }
});

app.get("/api/receipts/next-no", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const prefix = String(req.query.prefix || "RE");
    const receiptNo = await getNextDocNo(companyId, prefix, receipts, receipts.receiptNo, receipts.companyId, req.query.docDate as string);
    res.json({ receiptNo });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/receipts/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [doc] = await db.select().from(receipts).where(eq(receipts.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ message: "ไม่พบใบเสร็จรับเงิน" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    let items: any[] = await db.select().from(receiptItems).where(eq(receiptItems.receiptId, doc.id));
    const linkedDocs = await db.select().from(receiptLinkedDocs).where(eq(receiptLinkedDocs.receiptId, doc.id));
    // If no items saved (e.g. receipt created from billing note), fall back to items from linked TIV/IV
    if (items.length === 0 && linkedDocs.length > 0) {
      for (const ld of linkedDocs) {
        if (ld.docType === "TIV" && ld.docId) {
          const txItems = await db.select().from(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, ld.docId));
          items = [...items, ...txItems];
        } else if (ld.docType === "IV" && ld.docId) {
          const ivItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, ld.docId));
          items = [...items, ...ivItems];
        }
      }
    }
    let createdByName = "-";
    let updatedByName = "-";
    if (doc.createdBy) { const u = await storage.getUser(doc.createdBy); if (u) createdByName = u.fullName; }
    if (doc.updatedBy) { const u = await storage.getUser(doc.updatedBy); if (u) updatedByName = u.fullName; }
    res.json({ ...doc, items, linkedDocs, createdByName, updatedByName });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/receipts", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    if (!(await checkDocumentLimit(req, res))) return;
    const { items, ...body } = req.body;
    if (body.creditDays === "" || body.creditDays === undefined || body.creditDays === null) body.creditDays = null;
    else body.creditDays = Number(body.creditDays) || null;
    if (body.customerId === "" || body.customerId === undefined) body.customerId = null;
    else body.customerId = Number(body.customerId) || null;
    const user = req.user as any;
    const companyId = Number(body.companyId);
    if (!companyId || !body.customerName || !body.receiptDate) {
      return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน (companyId, customerName, receiptDate)" });
    }
    const prefix = body.docPrefix || "RE";
    let receiptNo = body.receiptNo;
    if (!receiptNo) {
      receiptNo = await getNextDocNo(companyId, prefix, receipts, receipts.receiptNo, receipts.companyId, body.receiptDate);
    } else {
      const fmtCheck = await validateDocNo(companyId, receiptNo, prefix, body.receiptDate);
      if (!fmtCheck.valid) {
        receiptNo = await getNextDocNo(companyId, prefix, receipts, receipts.receiptNo, receipts.companyId, body.receiptDate);
      }
    }
    const result = await db.transaction(async (tx) => {
      const [doc] = await tx.insert(receipts).values({
        companyId,
        receiptNo,
        receiptDate: body.receiptDate,
        customerId: body.customerId ? Number(body.customerId) : null,
        customerCode: body.customerCode || null,
        customerName: body.customerName,
        customerAddress: body.customerAddress || null,
        customerTaxId: body.customerTaxId || null,
        branch: body.branch || null,
      sellerBranchId: body.sellerBranchId || null,
        contactPerson: body.contactPerson || null,
        contactPhone: body.contactPhone || null,
        contactEmail: body.contactEmail || null,
        creditDays: body.creditDays ? Number(body.creditDays) : null,
        subtotal: body.subtotal || "0",
        discountAmount: body.discountAmount || "0",
        vatAmount: body.vatAmount || "0",
        totalAmount: body.totalAmount || "0",
        withholdingTax: body.withholdingTax || "0",
        status: body.status || "approved",
        priceMode: body.priceMode || "excluded",
        paymentMethod: body.paymentMethod || null,
        paymentDate: body.paymentDate || null,
        paymentTerms: body.paymentTerms || null,
        attachedUrl: body.attachedUrl || null,
        salesperson: body.salesperson || null,
        department: body.department || null,
        project: body.project || null,
        docPrefix: body.docPrefix || "RE",
        refDoc: body.refDoc || null,
        invoiceId: body.invoiceId ? Number(body.invoiceId) : null,
        taxInvoiceId: body.taxInvoiceId ? Number(body.taxInvoiceId) : null,
        notes: body.notes || null,
        internalNotes: body.internalNotes || null,
        currencyCode: body.currencyCode || "THB",
        exchangeRate: body.exchangeRate || "1",
        createdBy: user.id,
      }).returning();
      if (items && Array.isArray(items) && items.length > 0) {
        const itemValues = items.map((item: any) => {
          const rawDiscount = String(item.discount || "0");
          const isPercent = rawDiscount.includes("%");
          const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
          return {
            receiptId: doc.id,
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
          };
        });
        const insertedItems = await tx.insert(receiptItems).values(itemValues).returning({ id: receiptItems.id });
        for (let i = 0; i < insertedItems.length; i++) {
          if (items[i]?.warehouseId) {
            await tx.execute(sql`UPDATE receipt_items SET warehouse_id = ${Number(items[i].warehouseId)} WHERE id = ${insertedItems[i].id}`);
          }
        }
      }
      return doc;
    });
    const savedItems = await fetchReceiptItems(result.id);

    if (result.taxInvoiceId) await recomputePaymentStatus("taxInvoice", result.taxInvoiceId);
    if (result.invoiceId) await recomputePaymentStatus("invoice", result.invoiceId);

    let journalResult = null;
    try {
      const pmAccCode = await resolvePaymentMethodAccountCode(result.companyId, result.paymentMethod);
      journalResult = await createAutoJournalEntry({
        companyId: result.companyId,
        documentType: "receipt",
        sourceDocType: "receipt",
        sourceDocId: result.id,
        docDate: result.receiptDate,
        docNo: result.receiptNo,
        subtotal: String(result.subtotal),
        vatAmount: String(result.vatAmount),
        totalAmount: String(result.totalAmount),
        withholdingTax: String(result.withholdingTax || "0"),
        currencyCode: result.currencyCode || "THB",
        exchangeRate: String(result.exchangeRate || "1"),
        userId: user.id,
        customerName: result.customerName,
        paymentMethod: result.paymentMethod || undefined,
        paymentMethodAccountCode: pmAccCode,
        linkedInvoiceId: result.invoiceId || result.taxInvoiceId || undefined,
        overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
      });
    } catch (e) {}

    logActivity({ companyId, userId: user.id, userName: user.username, action: "create", entityType: "receipt", entityId: String(result.id), entityName: receiptNo }).catch(() => {});
    res.status(201).json({ ...result, items: savedItems, journalResult });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/receipts/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [existing] = await db.select().from(receipts).where(eq(receipts.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบเสร็จรับเงิน" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const { items, ...body } = req.body;
    const updateData: any = {};
    const allowedFields = [
      "receiptNo", "receiptDate", "customerId", "customerCode", "customerName",
      "customerAddress", "customerTaxId", "branch", "contactPerson", "contactPhone", "contactEmail",
      "creditDays", "subtotal", "discountAmount", "vatAmount", "totalAmount", "withholdingTax",
      "status", "priceMode", "paymentMethod", "paymentDate", "paymentTerms", "attachedUrl",
      "salesperson", "department", "project", "docPrefix", "refDoc",
      "invoiceId", "taxInvoiceId", "notes", "internalNotes",
      "currencyCode", "exchangeRate"
    ];
    const integerFields = ["customerId", "creditDays", "invoiceId", "taxInvoiceId"];
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
      await tx.update(receipts).set(updateData).where(eq(receipts.id, existing.id));
      if (items && Array.isArray(items)) {
        await tx.delete(receiptItems).where(eq(receiptItems.receiptId, existing.id));
        if (items.length > 0) {
          const itemValues = items.map((item: any) => {
            const rawDiscount = String(item.discount || "0");
            const isPercent = rawDiscount.includes("%");
            const discountNum = parseFloat(rawDiscount.replace("%", "")) || 0;
            return {
              receiptId: existing.id,
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
            };
          });
          const insertedItems = await tx.insert(receiptItems).values(itemValues).returning({ id: receiptItems.id });
          for (let i = 0; i < insertedItems.length; i++) {
            if (items[i]?.warehouseId) {
              await tx.execute(sql`UPDATE receipt_items SET warehouse_id = ${Number(items[i].warehouseId)} WHERE id = ${insertedItems[i].id}`);
            }
          }
        }
      }
    });
    const [[updated], savedItems] = await Promise.all([
      db.select().from(receipts).where(eq(receipts.id, existing.id)),
      fetchReceiptItems(existing.id),
    ]);

    if (existing.taxInvoiceId && existing.taxInvoiceId !== updated.taxInvoiceId) {
      await recomputePaymentStatus("taxInvoice", existing.taxInvoiceId);
    }
    if (existing.invoiceId && existing.invoiceId !== updated.invoiceId) {
      await recomputePaymentStatus("invoice", existing.invoiceId);
    }
    if (updated.taxInvoiceId) await recomputePaymentStatus("taxInvoice", updated.taxInvoiceId);
    if (updated.invoiceId) await recomputePaymentStatus("invoice", updated.invoiceId);

    let journalResult = null;
    const statusChanged = body.status && body.status !== existing.status;
    const shouldCreateJournal = (statusChanged && body.status === "approved") || updated.status === "approved";
    if (shouldCreateJournal) {
      try {
        const pmAccCode2 = await resolvePaymentMethodAccountCode(updated.companyId, updated.paymentMethod);
        // resolve linkedInvoiceId from receipt_linked_docs if not directly linked
        let linkedInvId: number | undefined = updated.invoiceId || updated.taxInvoiceId || undefined;
        if (!linkedInvId) {
          const rldForJournal = await db.select().from(receiptLinkedDocs).where(eq(receiptLinkedDocs.receiptId, updated.id));
          if (rldForJournal.length > 0) linkedInvId = rldForJournal[0].docId || undefined;
        }
        journalResult = await createAutoJournalEntry({
          companyId: updated.companyId,
          documentType: "receipt",
          sourceDocType: "receipt",
          sourceDocId: updated.id,
          docDate: updated.receiptDate,
          docNo: updated.receiptNo,
          subtotal: String(updated.subtotal),
          vatAmount: String(updated.vatAmount),
          totalAmount: String(updated.totalAmount),
          withholdingTax: String(updated.withholdingTax || "0"),
          currencyCode: updated.currencyCode || "THB",
          exchangeRate: String(updated.exchangeRate || "1"),
          userId: user.id,
          customerName: updated.customerName,
          paymentMethodAccountCode: pmAccCode2,
          linkedInvoiceId: linkedInvId,
          overrideLines: req.body?.journalOverrideLines || undefined,
        });
      } catch (e: any) { console.error("[receipt-patch] journal creation failed:", e.message); }
    }

    res.json({ ...updated, items: savedItems, journalResult });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/receipts/:id", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [existing] = await db.select().from(receipts).where(eq(receipts.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบเสร็จรับเงิน" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    // เก็บ linked docs ก่อนลบ เพื่อ recompute payment status ภายหลัง
    const linkedDocs = await db.select().from(receiptLinkedDocs).where(eq(receiptLinkedDocs.receiptId, existing.id));
    await db.transaction(async (tx) => {
      await deleteJournalEntriesForDoc(tx, "receipt", existing.id);
      await tx.delete(receiptLinkedDocs).where(eq(receiptLinkedDocs.receiptId, existing.id));
      await tx.delete(receiptItems).where(eq(receiptItems.receiptId, existing.id));
      // reset billing note ที่ผูกกับ receipt นี้
      await tx.execute(sql.raw(`UPDATE billing_notes SET payment_status = 'unpaid', receipt_id = NULL WHERE receipt_id = ${existing.id}`));
      await tx.delete(receipts).where(eq(receipts.id, existing.id));
    });
    // recompute จาก taxInvoiceId/invoiceId field ตรง
    if (existing.taxInvoiceId) await recomputePaymentStatus("taxInvoice", existing.taxInvoiceId);
    if (existing.invoiceId) await recomputePaymentStatus("invoice", existing.invoiceId);
    // recompute จาก receipt_linked_docs (billing note receipts)
    for (const ld of linkedDocs) {
      try {
        if (ld.docType === "TIV" && ld.docId) await recomputePaymentStatus("taxInvoice", ld.docId);
        else if (ld.docType === "IV" && ld.docId) await recomputePaymentStatus("invoice", ld.docId);
      } catch (e: any) { console.error(`[RC-DELETE] recomputePaymentStatus ${ld.docType}#${ld.docId} failed:`, e.message); }
    }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/receipts/bulk-delete", requireAuth, requireAnyModule("sales", "ecommerce"), requireRole("admin", "owner", "super_admin"), async (req, res) => {
  try {
    const { ids, companyId: reqCompanyId } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "กรุณาระบุรายการที่ต้องการลบ" });
    const user = req.user as any;
    if (user?.role !== "super_admin" && user?.tenantId && reqCompanyId) {
      const compTenantId = await getCompanyTenantId(reqCompanyId);
      if (compTenantId !== null && compTenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    let deleted = 0; const errors: string[] = [];
    for (const id of ids) {
      try {
        const [existing] = await db.select().from(receipts).where(eq(receipts.id, Number(id)));
        if (!existing) { errors.push(`#${id}: ไม่พบ`); continue; }
        const linkedDocs = await db.select().from(receiptLinkedDocs).where(eq(receiptLinkedDocs.receiptId, existing.id));
        await db.transaction(async (tx) => {
          await deleteJournalEntriesForDoc(tx, "receipt", existing.id);
          await tx.delete(receiptLinkedDocs).where(eq(receiptLinkedDocs.receiptId, existing.id));
          await tx.delete(receiptItems).where(eq(receiptItems.receiptId, existing.id));
          await tx.execute(sql.raw(`UPDATE billing_notes SET payment_status = 'unpaid', receipt_id = NULL WHERE receipt_id = ${existing.id}`));
          await tx.delete(receipts).where(eq(receipts.id, existing.id));
        });
        if (existing.taxInvoiceId) {
          try { await recomputePaymentStatus("taxInvoice", existing.taxInvoiceId); } catch (e: any) { console.error(`[RC-DELETE] recomputePaymentStatus taxInvoice#${existing.taxInvoiceId} failed:`, e.message); }
        }
        if (existing.invoiceId) {
          try { await recomputePaymentStatus("invoice", existing.invoiceId); } catch (e: any) { console.error(`[RC-DELETE] recomputePaymentStatus invoice#${existing.invoiceId} failed:`, e.message); }
        }
        for (const ld of linkedDocs) {
          try {
            if (ld.docType === "TIV" && ld.docId) await recomputePaymentStatus("taxInvoice", ld.docId);
            else if (ld.docType === "IV" && ld.docId) await recomputePaymentStatus("invoice", ld.docId);
          } catch (e: any) { console.error(`[RC-BULK-DELETE] recomputePaymentStatus ${ld.docType}#${ld.docId} failed:`, e.message); }
        }
        logActivity({ companyId: existing.companyId, userId: user.id, userName: user.username, action: "delete", entityType: "receipt", entityId: String(existing.id), entityName: existing.receiptNo }).catch(() => {});
        deleted++;
      } catch (e: any) { errors.push(`#${id}: ${e.message}`); }
    }
    res.json({ deleted, errors, total: ids.length });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/receipts/:id/clone", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [doc] = await db.select().from(receipts).where(eq(receipts.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ message: "ไม่พบใบเสร็จรับเงิน" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const items = await db.select().from(receiptItems).where(eq(receiptItems.receiptId, doc.id));
    const prefix = (doc as any).docPrefix || "RE";
    const receiptNo = await getNextDocNo(doc.companyId, prefix, receipts, receipts.receiptNo, receipts.companyId, doc.receiptDate);
    const user = req.user as any;
    const result = await db.transaction(async (tx) => {
      const [cloned] = await tx.insert(receipts).values({
        companyId: doc.companyId, receiptNo,
        receiptDate: new Date().toISOString().split("T")[0],
        customerId: doc.customerId,
        customerCode: doc.customerCode, customerName: doc.customerName,
        customerAddress: doc.customerAddress, customerTaxId: doc.customerTaxId,
        branch: doc.branch, contactPerson: doc.contactPerson,
        contactPhone: doc.contactPhone, contactEmail: doc.contactEmail,
        subtotal: doc.subtotal, discountAmount: doc.discountAmount,
        vatAmount: doc.vatAmount, totalAmount: doc.totalAmount,
        status: "approved", paymentMethod: doc.paymentMethod,
        notes: doc.notes, internalNotes: doc.internalNotes,
        priceMode: doc.priceMode, withholdingTax: doc.withholdingTax,
        docPrefix: (doc as any).docPrefix,
        currencyCode: doc.currencyCode, exchangeRate: doc.exchangeRate,
        createdBy: user.id,
      }).returning();
      if (items.length > 0) {
        await tx.insert(receiptItems).values(items.map((it: any) => ({
          receiptId: cloned.id, productId: it.productId,
          productCode: it.productCode, productName: it.productName,
          description: it.description, qty: it.qty,
          unit: it.unit, unitPrice: it.unitPrice,
          discount: it.discount, discountType: it.discountType,
          total: it.total, vatType: it.vatType,
        })));
      }
      return cloned;
    });
    res.status(201).json(result);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Receipt Share ==========
app.post("/api/receipts/:id/share", requireAuth, requireAnyModule("sales", "ecommerce"), async (req, res) => {
  try {
    const [doc] = await db.select().from(receipts).where(eq(receipts.id, Number(req.params.id)));
    if (!doc) return res.status(404).json({ message: "ไม่พบใบเสร็จรับเงิน" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    let token = doc.shareToken;
    if (!token) {
      const { randomBytes } = await import("crypto");
      token = randomBytes(24).toString("hex");
      await db.update(receipts).set({ shareToken: token }).where(eq(receipts.id, doc.id));
    }
    res.json({ shareToken: token });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/share/receipt/:token", async (req, res) => {
  try {
    const [doc] = await db.select().from(receipts).where(eq(receipts.shareToken, req.params.token));
    if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    const items = await db.select().from(receiptItems).where(eq(receiptItems.receiptId, doc.id));
    const [company] = await db.select().from(companies).where(eq(companies.id, doc.companyId));
    let docSetting = null;
    let userSignature = null;
    try { const [ds] = await db.select().from(documentSettings).where(eq(documentSettings.companyId, doc.companyId)); docSetting = ds || null; } catch {}
    if (doc.createdBy) {
      try { const u = await storage.getUser(doc.createdBy); if (u) userSignature = { signatureUrl: u.signatureUrl || null, signatureName: u.signatureName || u.fullName, signatureTitle: u.signatureTitle || null }; } catch {}
    }
    const { internalNotes, shareToken, createdBy, updatedBy, ...publicDoc } = doc;
    res.json({ ...publicDoc, items, company: company || null, documentSettings: docSetting, userSignature });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Related Documents ==========
app.get("/api/related-documents/:docType/:docId", requireAuth, async (req, res) => {
  try {
    const { docType, docId } = req.params;
    const id = Number(docId);
    const companyId = Number(req.query.companyId);
    if (!id || !companyId) return res.status(400).json({ message: "Invalid parameters" });

    const related: Array<{ type: string; id: number; docNo: string; date: string; status: string; totalAmount: string; attachedUrl?: string }> = [];

    if (docType === "quotation") {
      const [qo] = await db.select().from(quotations).where(and(eq(quotations.id, id), eq(quotations.companyId, companyId)));
      if (!qo) return res.status(404).json({ message: "Document not found" });
      const seenIds = new Set<string>();
      const addUnique = (doc: any) => {
        const key = `${doc.type}-${doc.id}`;
        if (!seenIds.has(key)) { seenIds.add(key); related.push(doc); }
      };
      if (qo.salesOrderId) {
        const [so] = await db.select().from(salesOrders).where(and(eq(salesOrders.id, qo.salesOrderId), eq(salesOrders.companyId, companyId)));
        if (so) addUnique({ type: "sales_order", id: so.id, docNo: so.orderNo, date: so.orderDate, status: so.status, totalAmount: so.totalAmount });
      }
      const sosByQuotationIdRaw = await db.execute(sql`SELECT id, order_no, order_date, status, total_amount FROM sales_orders WHERE quotation_id = ${id} AND company_id = ${companyId}`);
      for (const so of sosByQuotationIdRaw.rows as any[]) addUnique({ type: "sales_order", id: so.id, docNo: so.order_no, date: so.order_date, status: so.status, totalAmount: so.total_amount });
      if (qo.quotationNo) {
        const sosByRef = await db.select().from(salesOrders).where(and(eq(salesOrders.refDoc, qo.quotationNo), eq(salesOrders.companyId, companyId)));
        for (const so of sosByRef) addUnique({ type: "sales_order", id: so.id, docNo: so.orderNo, date: so.orderDate, status: so.status, totalAmount: so.totalAmount });
      }
      const invs = await db.select().from(invoices).where(and(eq(invoices.quotationId, id), eq(invoices.companyId, companyId)));
      for (const iv of invs) {
        addUnique({ type: "invoice", id: iv.id, docNo: iv.invoiceNo, date: iv.invoiceDate, status: iv.status, totalAmount: iv.totalAmount });
        const txs = await db.select().from(taxInvoices).where(and(eq(taxInvoices.invoiceId, iv.id), eq(taxInvoices.companyId, companyId)));
        for (const tx of txs) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: tx.totalAmount });
        const rcs = await db.select().from(receipts).where(and(eq(receipts.invoiceId, iv.id), eq(receipts.companyId, companyId)));
        for (const rc of rcs) addUnique({ type: "receipt", id: rc.id, docNo: rc.receiptNo, date: rc.receiptDate, status: rc.status, totalAmount: rc.totalAmount });
      }
      if (qo.quotationNo) {
        const invsByRef = await db.select().from(invoices).where(and(eq(invoices.refDoc, qo.quotationNo), eq(invoices.companyId, companyId)));
        for (const iv of invsByRef) {
          addUnique({ type: "invoice", id: iv.id, docNo: iv.invoiceNo, date: iv.invoiceDate, status: iv.status, totalAmount: iv.totalAmount });
        }
        const txsByRef = await db.select().from(taxInvoices).where(and(eq(taxInvoices.refDoc, qo.quotationNo), eq(taxInvoices.companyId, companyId)));
        for (const tx of txsByRef) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: tx.totalAmount });
        const rcsByRef = await db.select().from(receipts).where(and(eq(receipts.refDoc, qo.quotationNo), eq(receipts.companyId, companyId)));
        for (const rc of rcsByRef) addUnique({ type: "receipt", id: rc.id, docNo: rc.receiptNo, date: rc.receiptDate, status: rc.status, totalAmount: rc.totalAmount });
      }
      const txsByQo = await db.select().from(taxInvoices).where(and(eq(taxInvoices.quotationId, id), eq(taxInvoices.companyId, companyId)));
      for (const tx of txsByQo) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: tx.totalAmount });

    } else if (docType === "sales_order") {
      const [so] = await db.select().from(salesOrders).where(and(eq(salesOrders.id, id), eq(salesOrders.companyId, companyId)));
      if (!so) return res.status(404).json({ message: "Document not found" });
      const seenIds = new Set<string>();
      const addUnique = (doc: any) => {
        const key = `${doc.type}-${doc.id}`;
        if (!seenIds.has(key)) { seenIds.add(key); related.push(doc); }
      };
      const qos = await db.select().from(quotations).where(and(eq(quotations.salesOrderId, id), eq(quotations.companyId, companyId)));
      for (const qo of qos) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
      if ((so as any).quotationId) {
        const [qo] = await db.select().from(quotations).where(and(eq(quotations.id, (so as any).quotationId), eq(quotations.companyId, companyId)));
        if (qo) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
      }
      if ((so as any).refDoc) {
        const refDocNo = (so as any).refDoc.trim();
        const qoByRef = await db.select().from(quotations).where(and(eq(quotations.quotationNo, refDocNo), eq(quotations.companyId, companyId)));
        for (const qo of qoByRef) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
      }
      const invs = await db.select().from(invoices).where(and(eq(invoices.salesOrderId, id), eq(invoices.companyId, companyId)));
      for (const iv of invs) {
        addUnique({ type: "invoice", id: iv.id, docNo: iv.invoiceNo, date: iv.invoiceDate, status: iv.status, totalAmount: iv.totalAmount });
        const txs = await db.select().from(taxInvoices).where(and(eq(taxInvoices.invoiceId, iv.id), eq(taxInvoices.companyId, companyId)));
        for (const tx of txs) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: tx.totalAmount });
        const rcs = await db.select().from(receipts).where(and(eq(receipts.invoiceId, iv.id), eq(receipts.companyId, companyId)));
        for (const rc of rcs) addUnique({ type: "receipt", id: rc.id, docNo: rc.receiptNo, date: rc.receiptDate, status: rc.status, totalAmount: rc.totalAmount });
      }

    } else if (docType === "invoice") {
      const [iv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)));
      if (!iv) return res.status(404).json({ message: "Document not found" });
      const seenIds = new Set<string>();
      const addUnique = (doc: any) => {
        const key = `${doc.type}-${doc.id}`;
        if (!seenIds.has(key)) { seenIds.add(key); related.push(doc); }
      };
      if (iv.quotationId) {
        const [qo] = await db.select().from(quotations).where(and(eq(quotations.id, iv.quotationId), eq(quotations.companyId, companyId)));
        if (qo) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
      }
      if (iv.salesOrderId) {
        const [so] = await db.select().from(salesOrders).where(and(eq(salesOrders.id, iv.salesOrderId), eq(salesOrders.companyId, companyId)));
        if (so) addUnique({ type: "sales_order", id: so.id, docNo: so.orderNo, date: so.orderDate, status: so.status, totalAmount: so.totalAmount });
      }
      if ((iv as any).refDoc && !iv.quotationId && !iv.salesOrderId) {
        const refDocNo = (iv as any).refDoc.trim();
        const qoByRef = await db.select().from(quotations).where(and(eq(quotations.quotationNo, refDocNo), eq(quotations.companyId, companyId)));
        for (const qo of qoByRef) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
        const soByRef = await db.select().from(salesOrders).where(and(eq(salesOrders.orderNo, refDocNo), eq(salesOrders.companyId, companyId)));
        for (const so of soByRef) addUnique({ type: "sales_order", id: so.id, docNo: so.orderNo, date: so.orderDate, status: so.status, totalAmount: so.totalAmount });
      }
      const txs = await db.select().from(taxInvoices).where(and(eq(taxInvoices.invoiceId, id), eq(taxInvoices.companyId, companyId)));
      for (const tx of txs) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: tx.totalAmount });
      const txsByRef = await db.select().from(taxInvoices).where(and(eq(taxInvoices.refDoc, iv.invoiceNo), eq(taxInvoices.companyId, companyId)));
      for (const tx of txsByRef) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: tx.totalAmount });
      const rcs = await db.select().from(receipts).where(and(eq(receipts.invoiceId, id), eq(receipts.companyId, companyId)));
      for (const rc of rcs) addUnique({ type: "receipt", id: rc.id, docNo: rc.receiptNo, date: rc.receiptDate, status: rc.status, totalAmount: rc.totalAmount });
      const rcsByRef = await db.select().from(receipts).where(and(eq(receipts.refDoc, iv.invoiceNo), eq(receipts.companyId, companyId)));
      for (const rc of rcsByRef) addUnique({ type: "receipt", id: rc.id, docNo: rc.receiptNo, date: rc.receiptDate, status: rc.status, totalAmount: rc.totalAmount });
      const allTxIds = [...txs.map(t => t.id), ...txsByRef.map(t => t.id)];
      for (const txId of [...new Set(allTxIds)]) {
        const cnsByTx = await db.select().from(salesCreditNotes).where(and(eq(salesCreditNotes.refTaxInvoiceId, txId), eq(salesCreditNotes.companyId, companyId)));
        for (const cn of cnsByTx) addUnique({ type: "credit_note", id: cn.id, docNo: cn.creditNoteNo, date: cn.creditNoteDate, status: cn.status, totalAmount: cn.totalAmount });
      }
      const bnLinks = await db.select({ billingNoteId: billingNoteLinkedDocs.billingNoteId })
        .from(billingNoteLinkedDocs)
        .where(and(eq(billingNoteLinkedDocs.docType, "IV"), eq(billingNoteLinkedDocs.docId, id)));
      if (bnLinks.length > 0) {
        const bnIds = bnLinks.map((l: any) => l.billingNoteId);
        const bns = await db.select().from(billingNotes).where(and(inArray(billingNotes.id, bnIds), eq(billingNotes.companyId, companyId)));
        for (const bn of bns) {
          addUnique({ type: "billing_note", id: bn.id, docNo: bn.billingNo, date: bn.billingDate, status: bn.status, totalAmount: String(bn.totalAmount) });
          // find TIVs created from this BN (stored via refDoc = bn.billingNo)
          const tivsFromBn = await db.select().from(taxInvoices).where(and(eq(taxInvoices.refDoc, bn.billingNo), eq(taxInvoices.companyId, companyId)));
          for (const tx of tivsFromBn) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: tx.totalAmount });
          // find Receipts created from this BN (stored via receiptLinkedDocs)
          if (bn.receiptId) {
            const [rc] = await db.select().from(receipts).where(and(eq(receipts.id, bn.receiptId), eq(receipts.companyId, companyId)));
            if (rc) addUnique({ type: "receipt", id: rc.id, docNo: rc.receiptNo, date: rc.receiptDate, status: rc.status, totalAmount: rc.totalAmount });
          }
        }
      }

    } else if (docType === "tax_invoice") {
      const [tx] = await db.select().from(taxInvoices).where(and(eq(taxInvoices.id, id), eq(taxInvoices.companyId, companyId)));
      if (!tx) return res.status(404).json({ message: "Document not found" });
      const seenIds = new Set<string>();
      const addUnique = (doc: any) => {
        const key = `${doc.type}-${doc.id}`;
        if (!seenIds.has(key)) { seenIds.add(key); related.push(doc); }
      };
      if (tx.quotationId) {
        const [qo] = await db.select().from(quotations).where(and(eq(quotations.id, tx.quotationId), eq(quotations.companyId, companyId)));
        if (qo) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
      }
      if (tx.invoiceId) {
        const [iv] = await db.select().from(invoices).where(and(eq(invoices.id, tx.invoiceId), eq(invoices.companyId, companyId)));
        if (iv) {
          addUnique({ type: "invoice", id: iv.id, docNo: iv.invoiceNo, date: iv.invoiceDate, status: iv.status, totalAmount: iv.totalAmount });
          if (iv.quotationId) {
            const [qo] = await db.select().from(quotations).where(and(eq(quotations.id, iv.quotationId), eq(quotations.companyId, companyId)));
            if (qo) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
          }
          if (iv.salesOrderId) {
            const [so] = await db.select().from(salesOrders).where(and(eq(salesOrders.id, iv.salesOrderId), eq(salesOrders.companyId, companyId)));
            if (so) addUnique({ type: "sales_order", id: so.id, docNo: so.orderNo, date: so.orderDate, status: so.status, totalAmount: so.totalAmount });
          }
          // sibling TIVs — all other TIVs from the same invoice
          const siblingTxs = await db.select().from(taxInvoices).where(and(eq(taxInvoices.invoiceId, tx.invoiceId), eq(taxInvoices.companyId, companyId)));
          for (const sib of siblingTxs) {
            if (sib.id !== id) addUnique({ type: "tax_invoice", id: sib.id, docNo: sib.taxInvoiceNo, date: sib.taxInvoiceDate, status: sib.status, totalAmount: sib.totalAmount });
          }
        }
      }
      if (tx.refDoc && !tx.invoiceId) {
        const refDocNo = tx.refDoc.trim();
        const ivByRef = await db.select().from(invoices).where(and(eq(invoices.invoiceNo, refDocNo), eq(invoices.companyId, companyId)));
        for (const iv of ivByRef) {
          addUnique({ type: "invoice", id: iv.id, docNo: iv.invoiceNo, date: iv.invoiceDate, status: iv.status, totalAmount: iv.totalAmount });
          if (iv.quotationId) {
            const [qo] = await db.select().from(quotations).where(and(eq(quotations.id, iv.quotationId), eq(quotations.companyId, companyId)));
            if (qo) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
          }
          if (iv.salesOrderId) {
            const [so] = await db.select().from(salesOrders).where(and(eq(salesOrders.id, iv.salesOrderId), eq(salesOrders.companyId, companyId)));
            if (so) addUnique({ type: "sales_order", id: so.id, docNo: so.orderNo, date: so.orderDate, status: so.status, totalAmount: so.totalAmount });
          }
          // sibling TIVs from same invoice (via invoiceId link)
          const siblingTxs2 = await db.select().from(taxInvoices).where(and(eq(taxInvoices.invoiceId, iv.id), eq(taxInvoices.companyId, companyId)));
          for (const sib of siblingTxs2) {
            if (sib.id !== id) addUnique({ type: "tax_invoice", id: sib.id, docNo: sib.taxInvoiceNo, date: sib.taxInvoiceDate, status: sib.status, totalAmount: sib.totalAmount });
          }
        }
        const qoByRef = await db.select().from(quotations).where(and(eq(quotations.quotationNo, refDocNo), eq(quotations.companyId, companyId)));
        for (const qo of qoByRef) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
        const soByRef = await db.select().from(salesOrders).where(and(eq(salesOrders.orderNo, refDocNo), eq(salesOrders.companyId, companyId)));
        for (const so of soByRef) addUnique({ type: "sales_order", id: so.id, docNo: so.orderNo, date: so.orderDate, status: so.status, totalAmount: so.totalAmount });
      }
      const rcs = await db.select().from(receipts).where(and(eq(receipts.taxInvoiceId, id), eq(receipts.companyId, companyId)));
      for (const rc of rcs) addUnique({ type: "receipt", id: rc.id, docNo: rc.receiptNo, date: rc.receiptDate, status: rc.status, totalAmount: rc.totalAmount });
      const rcsByRef = await db.select().from(receipts).where(and(eq(receipts.refDoc, tx.taxInvoiceNo), eq(receipts.companyId, companyId)));
      for (const rc of rcsByRef) addUnique({ type: "receipt", id: rc.id, docNo: rc.receiptNo, date: rc.receiptDate, status: rc.status, totalAmount: rc.totalAmount });
      // receipts created via BN→Receipt that cover this TIV (stored in receipt_linked_docs)
      const rldForTiv = await db.select().from(receiptLinkedDocs).where(and(eq(receiptLinkedDocs.docType, "TIV"), eq(receiptLinkedDocs.docId, id)));
      for (const rld of rldForTiv) {
        const [rcFromBn] = await db.select().from(receipts).where(and(eq(receipts.id, rld.receiptId), eq(receipts.companyId, companyId)));
        if (rcFromBn) addUnique({ type: "receipt", id: rcFromBn.id, docNo: rcFromBn.receiptNo, date: rcFromBn.receiptDate, status: rcFromBn.status, totalAmount: rcFromBn.totalAmount });
      }
      const blLinks = await db.select({ billingNoteId: billingNoteLinkedDocs.billingNoteId }).from(billingNoteLinkedDocs).where(and(eq(billingNoteLinkedDocs.docType, "TIV"), eq(billingNoteLinkedDocs.docId, id)));
      if (blLinks.length > 0) {
        const blIds = blLinks.map(l => l.billingNoteId);
        const bls = await db.select().from(billingNotes).where(and(inArray(billingNotes.id, blIds), eq(billingNotes.companyId, companyId)));
        for (const bl of bls) {
          addUnique({ type: "billing_note", id: bl.id, docNo: bl.billingNo, date: bl.billingDate, status: bl.status, totalAmount: String(bl.totalAmount) });
          if (bl.receiptId) {
            const [rcFromBl] = await db.select().from(receipts).where(and(eq(receipts.id, bl.receiptId), eq(receipts.companyId, companyId)));
            if (rcFromBl) addUnique({ type: "receipt", id: rcFromBl.id, docNo: rcFromBl.receiptNo, date: rcFromBl.receiptDate, status: rcFromBl.status, totalAmount: rcFromBl.totalAmount });
          }
        }
      }
      if (tx.refDoc) {
        const refNo = tx.refDoc.trim();
        const blsByRef = await db.select().from(billingNotes).where(and(eq(billingNotes.billingNo, refNo), eq(billingNotes.companyId, companyId)));
        for (const bl of blsByRef) {
          addUnique({ type: "billing_note", id: bl.id, docNo: bl.billingNo, date: bl.billingDate, status: bl.status, totalAmount: String(bl.totalAmount) });
          if (bl.receiptId) {
            const [rcFromBl] = await db.select().from(receipts).where(and(eq(receipts.id, bl.receiptId), eq(receipts.companyId, companyId)));
            if (rcFromBl) addUnique({ type: "receipt", id: rcFromBl.id, docNo: rcFromBl.receiptNo, date: rcFromBl.receiptDate, status: rcFromBl.status, totalAmount: rcFromBl.totalAmount });
          }
          // follow BN → linked docs (IV, TIV) chain
          const blnLinked = await db.select().from(billingNoteLinkedDocs).where(eq(billingNoteLinkedDocs.billingNoteId, bl.id));
          for (const bld of blnLinked) {
            if (bld.docType === "IV") {
              const [iv] = await db.select().from(invoices).where(and(eq(invoices.id, bld.docId), eq(invoices.companyId, companyId)));
              if (iv) {
                addUnique({ type: "invoice", id: iv.id, docNo: iv.invoiceNo, date: iv.invoiceDate, status: iv.status, totalAmount: iv.totalAmount });
                if (iv.quotationId) {
                  const [qo] = await db.select().from(quotations).where(and(eq(quotations.id, iv.quotationId), eq(quotations.companyId, companyId)));
                  if (qo) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
                }
              }
            }
          }
        }
      }
      const cnsByTaxInv = await db.select().from(salesCreditNotes).where(and(eq(salesCreditNotes.refTaxInvoiceId, id), eq(salesCreditNotes.companyId, companyId)));
      for (const cn of cnsByTaxInv) addUnique({ type: "credit_note", id: cn.id, docNo: cn.creditNoteNo, date: cn.creditNoteDate, status: cn.status, totalAmount: cn.totalAmount });

    } else if (docType === "receipt") {
      const [rc] = await db.select().from(receipts).where(and(eq(receipts.id, id), eq(receipts.companyId, companyId)));
      if (!rc) return res.status(404).json({ message: "Document not found" });
      const seenIds = new Set<string>();
      const addUnique = (doc: any) => {
        const key = `${doc.type}-${doc.id}`;
        if (!seenIds.has(key)) { seenIds.add(key); related.push(doc); }
      };
      if (rc.invoiceId) {
        const [iv] = await db.select().from(invoices).where(and(eq(invoices.id, rc.invoiceId), eq(invoices.companyId, companyId)));
        if (iv) {
          addUnique({ type: "invoice", id: iv.id, docNo: iv.invoiceNo, date: iv.invoiceDate, status: iv.status, totalAmount: iv.totalAmount });
          if (iv.quotationId) {
            const [qo] = await db.select().from(quotations).where(and(eq(quotations.id, iv.quotationId), eq(quotations.companyId, companyId)));
            if (qo) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
          }
          if (iv.salesOrderId) {
            const [so] = await db.select().from(salesOrders).where(and(eq(salesOrders.id, iv.salesOrderId), eq(salesOrders.companyId, companyId)));
            if (so) addUnique({ type: "sales_order", id: so.id, docNo: so.orderNo, date: so.orderDate, status: so.status, totalAmount: so.totalAmount });
          }
        }
      }
      if (rc.taxInvoiceId) {
        const [tx] = await db.select().from(taxInvoices).where(and(eq(taxInvoices.id, rc.taxInvoiceId), eq(taxInvoices.companyId, companyId)));
        if (tx) {
          addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: tx.totalAmount });
          if (tx.invoiceId && tx.invoiceId !== rc.invoiceId) {
            const [iv2] = await db.select().from(invoices).where(and(eq(invoices.id, tx.invoiceId), eq(invoices.companyId, companyId)));
            if (iv2) addUnique({ type: "invoice", id: iv2.id, docNo: iv2.invoiceNo, date: iv2.invoiceDate, status: iv2.status, totalAmount: iv2.totalAmount });
          }
        }
      }
      if ((rc as any).refDoc && !rc.invoiceId && !rc.taxInvoiceId) {
        const refDocNo = (rc as any).refDoc.trim();
        const ivByRef = await db.select().from(invoices).where(and(eq(invoices.invoiceNo, refDocNo), eq(invoices.companyId, companyId)));
        for (const iv of ivByRef) addUnique({ type: "invoice", id: iv.id, docNo: iv.invoiceNo, date: iv.invoiceDate, status: iv.status, totalAmount: iv.totalAmount });
        const txByRef = await db.select().from(taxInvoices).where(and(eq(taxInvoices.taxInvoiceNo, refDocNo), eq(taxInvoices.companyId, companyId)));
        for (const tx of txByRef) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: tx.totalAmount });
        const qoByRef = await db.select().from(quotations).where(and(eq(quotations.quotationNo, refDocNo), eq(quotations.companyId, companyId)));
        for (const qo of qoByRef) addUnique({ type: "quotation", id: qo.id, docNo: qo.quotationNo, date: qo.quotationDate, status: qo.status, totalAmount: qo.totalAmount });
      }
      if (rc.taxInvoiceId) {
        const cnsByRcTx = await db.select().from(salesCreditNotes).where(and(eq(salesCreditNotes.refTaxInvoiceId, rc.taxInvoiceId), eq(salesCreditNotes.companyId, companyId)));
        for (const cn of cnsByRcTx) addUnique({ type: "credit_note", id: cn.id, docNo: cn.creditNoteNo, date: cn.creditNoteDate, status: cn.status, totalAmount: cn.totalAmount });
      }
      // lookup via receipt_linked_docs (for receipts created from billing notes)
      const rldRows = await db.select().from(receiptLinkedDocs).where(eq(receiptLinkedDocs.receiptId, id));
      for (const rld of rldRows) {
        if (rld.docType === "TIV" && rld.docId) {
          const [tx] = await db.select().from(taxInvoices).where(and(eq(taxInvoices.id, rld.docId), eq(taxInvoices.companyId, companyId)));
          if (tx) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.taxInvoiceNo, date: tx.taxInvoiceDate, status: tx.status, totalAmount: String(parseFloat(tx.totalAmount || "0") + parseFloat(tx.withholdingTax || "0")) });
        } else if (rld.docType === "IV" && rld.docId) {
          const [iv] = await db.select().from(invoices).where(and(eq(invoices.id, rld.docId), eq(invoices.companyId, companyId)));
          if (iv) addUnique({ type: "invoice", id: iv.id, docNo: iv.invoiceNo, date: iv.invoiceDate, status: iv.status, totalAmount: iv.totalAmount });
        }
      }
      // lookup billing note linked to this receipt (receipt_id added via migration, not in schema)
      const bnByReceiptRaw = await db.execute(sql.raw(`SELECT id, billing_no, billing_date, payment_status, status, total_amount FROM billing_notes WHERE receipt_id = ${id} AND company_id = ${companyId}`));
      for (const bn of (bnByReceiptRaw.rows || []) as any[]) addUnique({ type: "billing_note", id: bn.id, docNo: bn.billing_no, date: bn.billing_date, status: bn.payment_status || bn.status, totalAmount: String(bn.total_amount) });
    } else if (docType === "billing_note") {
      const bnRaw = await db.execute(sql.raw(`SELECT * FROM billing_notes WHERE id = ${id} AND company_id = ${companyId} LIMIT 1`));
      const bn = (bnRaw.rows || [])[0] as any;
      if (!bn) return res.status(404).json({ message: "Document not found" });
      const seenIds = new Set<string>();
      const addUnique = (doc: any) => {
        const key = `${doc.type}-${doc.id}`;
        if (!seenIds.has(key)) { seenIds.add(key); related.push(doc); }
      };
      // source docs linked to this BN (IV or TIV) — pure raw SQL
      const ldRaw = await db.execute(sql.raw(`SELECT * FROM billing_note_linked_docs WHERE billing_note_id = ${id}`));
      const bnLinked = (ldRaw.rows || []) as any[];
      for (const ld of bnLinked) {
        if (ld.doc_type === "IV" && ld.doc_id) {
          const ivRaw = await db.execute(sql.raw(`SELECT id, invoice_no, invoice_date, status, total_amount FROM invoices WHERE id = ${ld.doc_id} AND company_id = ${companyId} LIMIT 1`));
          const iv = (ivRaw.rows || [])[0] as any;
          if (iv) addUnique({ type: "invoice", id: iv.id, docNo: iv.invoice_no, date: iv.invoice_date, status: iv.status, totalAmount: String(iv.total_amount) });
        } else if (ld.doc_type === "TIV" && ld.doc_id) {
          const txRaw = await db.execute(sql.raw(`SELECT id, tax_invoice_no, tax_invoice_date, status, total_amount FROM tax_invoices WHERE id = ${ld.doc_id} AND company_id = ${companyId} LIMIT 1`));
          const tx = (txRaw.rows || [])[0] as any;
          if (tx) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.tax_invoice_no, date: tx.tax_invoice_date, status: tx.status, totalAmount: String(tx.total_amount) });
        }
      }
      // TIV created from this BN (refDoc = bn.billing_no)
      const tivsFromBnRaw = await db.execute(sql.raw(`SELECT id, tax_invoice_no, tax_invoice_date, status, total_amount FROM tax_invoices WHERE ref_doc = '${bn.billing_no}' AND company_id = ${companyId}`));
      for (const tx of (tivsFromBnRaw.rows || []) as any[]) addUnique({ type: "tax_invoice", id: tx.id, docNo: tx.tax_invoice_no, date: tx.tax_invoice_date, status: tx.status, totalAmount: String(tx.total_amount) });
      // Receipt created from this BN
      if (bn.receipt_id) {
        const rcRaw = await db.execute(sql.raw(`SELECT id, receipt_no, receipt_date, status, total_amount FROM receipts WHERE id = ${bn.receipt_id} AND company_id = ${companyId} LIMIT 1`));
        const rc = (rcRaw.rows || [])[0] as any;
        if (rc) addUnique({ type: "receipt", id: rc.id, docNo: rc.receipt_no, date: rc.receipt_date, status: rc.status, totalAmount: String(rc.total_amount) });
      }

    } else if (docType === "purchase-request") {
      const [pr] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, id), eq(purchaseRequests.companyId, companyId)));
      if (!pr) return res.status(404).json({ message: "Document not found" });
      const bids = await db.select().from(bidComparisons).where(and(eq(bidComparisons.prId, id), eq(bidComparisons.companyId, companyId)));
      for (const bid of bids) {
        related.push({ type: "bid_comparison", id: bid.id, docNo: bid.bidNo, date: bid.bidDate, status: bid.status, totalAmount: bid.totalAmount || "0" });
      }
      const pos = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.companyId, companyId)));
      for (const po of pos) {
        if (po.bidId) {
          const matchBid = bids.find(b => b.id === po.bidId);
          if (matchBid) {
            related.push({ type: "purchase_order", id: po.id, docNo: po.poNo, date: po.poDate, status: po.status, totalAmount: po.totalAmount || "0" });
            const aps = await db.select().from(purchaseInvoices).where(and(eq(purchaseInvoices.poId, po.id), eq(purchaseInvoices.companyId, companyId)));
            for (const ap of aps) {
              related.push({ type: "purchase_invoice", id: ap.id, docNo: ap.apNo, date: ap.apDate, status: ap.status, totalAmount: ap.totalAmount || "0" });
            }
          }
        }
      }

    } else if (docType === "bid-comparison") {
      const [bid] = await db.select().from(bidComparisons).where(and(eq(bidComparisons.id, id), eq(bidComparisons.companyId, companyId)));
      if (!bid) return res.status(404).json({ message: "Document not found" });
      if (bid.prId) {
        const [pr] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, bid.prId), eq(purchaseRequests.companyId, companyId)));
        if (pr) related.push({ type: "purchase_request", id: pr.id, docNo: pr.prNo, date: pr.prDate, status: pr.status, totalAmount: pr.totalAmount || "0" });
      }
      const pos = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.bidId, id), eq(purchaseOrders.companyId, companyId)));
      for (const po of pos) {
        related.push({ type: "purchase_order", id: po.id, docNo: po.poNo, date: po.poDate, status: po.status, totalAmount: po.totalAmount || "0" });
        const aps = await db.select().from(purchaseInvoices).where(and(eq(purchaseInvoices.poId, po.id), eq(purchaseInvoices.companyId, companyId)));
        for (const ap of aps) {
          related.push({ type: "purchase_invoice", id: ap.id, docNo: ap.apNo, date: ap.apDate, status: ap.status, totalAmount: ap.totalAmount || "0" });
        }
      }

    } else if (docType === "purchase-order") {
      const [po] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, companyId)));
      if (!po) return res.status(404).json({ message: "Document not found" });
      if (po.bidId) {
        const [bid] = await db.select().from(bidComparisons).where(and(eq(bidComparisons.id, po.bidId), eq(bidComparisons.companyId, companyId)));
        if (bid) {
          related.push({ type: "bid_comparison", id: bid.id, docNo: bid.bidNo, date: bid.bidDate, status: bid.status, totalAmount: bid.totalAmount || "0" });
          if (bid.prId) {
            const [pr] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, bid.prId), eq(purchaseRequests.companyId, companyId)));
            if (pr) related.push({ type: "purchase_request", id: pr.id, docNo: pr.prNo, date: pr.prDate, status: pr.status, totalAmount: pr.totalAmount || "0" });
          }
        }
      }
      const aps = await db.select().from(purchaseInvoices).where(and(eq(purchaseInvoices.poId, id), eq(purchaseInvoices.companyId, companyId)));
      for (const ap of aps) {
        related.push({ type: "purchase_invoice", id: ap.id, docNo: ap.apNo, date: ap.apDate, status: ap.status, totalAmount: ap.totalAmount || "0" });
      }

    } else if (docType === "purchase-invoice") {
      const [ap] = await db.select().from(purchaseInvoices).where(and(eq(purchaseInvoices.id, id), eq(purchaseInvoices.companyId, companyId)));
      if (!ap) return res.status(404).json({ message: "Document not found" });
      if (ap.poId) {
        const [po] = await db.select().from(purchaseOrders).where(and(eq(purchaseOrders.id, ap.poId), eq(purchaseOrders.companyId, companyId)));
        if (po) {
          related.push({ type: "purchase_order", id: po.id, docNo: po.poNo, date: po.poDate, status: po.status, totalAmount: po.totalAmount || "0" });
          if (po.bidId) {
            const [bid] = await db.select().from(bidComparisons).where(and(eq(bidComparisons.id, po.bidId), eq(bidComparisons.companyId, companyId)));
            if (bid) {
              related.push({ type: "bid_comparison", id: bid.id, docNo: bid.bidNo, date: bid.bidDate, status: bid.status, totalAmount: bid.totalAmount || "0" });
              if (bid.prId) {
                const [pr] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.id, bid.prId), eq(purchaseRequests.companyId, companyId)));
                if (pr) related.push({ type: "purchase_request", id: pr.id, docNo: pr.prNo, date: pr.prDate, status: pr.status, totalAmount: pr.totalAmount || "0" });
              }
            }
          }
        }
      }
      const pvLinks = await db.select({ paymentVoucherId: paymentVoucherLinkedDocs.paymentVoucherId }).from(paymentVoucherLinkedDocs).where(and(eq(paymentVoucherLinkedDocs.docType, "AP"), eq(paymentVoucherLinkedDocs.docId, id)));
      for (const link of pvLinks) {
        const [pv] = await db.select().from(paymentVouchers).where(eq(paymentVouchers.id, link.paymentVoucherId));
        if (pv) related.push({ type: "payment_voucher", id: pv.id, docNo: pv.pvNo, date: pv.pvDate, status: pv.status || "approved", totalAmount: pv.totalAmount || "0" });
      }

    } else if (docType === "expense") {
      const [exp] = await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.companyId, companyId)));
      if (!exp) return res.status(404).json({ message: "Document not found" });
      if (exp.refDebitNoteId) {
        const [dn] = await db.select().from(purchaseDebitNotes).where(eq(purchaseDebitNotes.id, exp.refDebitNoteId));
        if (dn) related.push({ type: "purchase_debit_note", id: dn.id, docNo: dn.debitNoteNo, date: dn.debitNoteDate, status: dn.status, totalAmount: dn.totalAmount });
      }
      const linkedDns = await db.select().from(purchaseDebitNotes).where(and(eq(purchaseDebitNotes.refExpenseId, id), eq(purchaseDebitNotes.companyId, companyId)));
      for (const dn of linkedDns) {
        if (!related.find(r => r.type === "purchase_debit_note" && r.id === dn.id)) {
          related.push({ type: "purchase_debit_note", id: dn.id, docNo: dn.debitNoteNo, date: dn.debitNoteDate, status: dn.status, totalAmount: dn.totalAmount });
        }
      }
      const jes = await db.select().from(journalEntries).where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.sourceDocType, "expense"), eq(journalEntries.sourceDocId, id)));
      for (const je of jes) related.push({ type: "journal", id: je.id, docNo: je.entryNo, date: je.entryDate, status: je.status || "approved", totalAmount: je.totalDebit || "0" });
    } else if (docType === "purchase_debit_note") {
      const [dn] = await db.select().from(purchaseDebitNotes).where(and(eq(purchaseDebitNotes.id, id), eq(purchaseDebitNotes.companyId, companyId)));
      if (!dn) return res.status(404).json({ message: "Document not found" });
      if (dn.refExpenseId) {
        const [exp] = await db.select().from(expenses).where(eq(expenses.id, dn.refExpenseId));
        if (exp) related.push({ type: "expense", id: exp.id, docNo: exp.expNo, date: exp.expDate, status: exp.status, totalAmount: exp.totalAmount });
      }
      if (dn.refPurchaseInvoiceId) {
        const [pi] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, dn.refPurchaseInvoiceId));
        if (pi) related.push({ type: "purchase_invoice", id: pi.id, docNo: pi.apNo, date: pi.apDate, status: pi.status, totalAmount: pi.totalAmount });
      }
      const jes = await db.select().from(journalEntries).where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.sourceDocType, "purchase_debit_note"), eq(journalEntries.sourceDocId, id)));
      for (const je of jes) related.push({ type: "journal", id: je.id, docNo: je.entryNo, date: je.entryDate, status: je.status || "approved", totalAmount: je.totalDebit || "0" });
    }

    const tableMap: Record<string, any> = {
      quotation: quotations,
      sales_order: salesOrders,
      invoice: invoices,
      tax_invoice: taxInvoices,
      receipt: receipts,
      purchase_request: purchaseRequests,
      bid_comparison: bidComparisons,
      purchase_order: purchaseOrders,
      purchase_invoice: purchaseInvoices,
      expense: expenses,
      purchase_debit_note: purchaseDebitNotes,
    };
    for (const doc of related) {
      const tbl = tableMap[doc.type];
      if (tbl && tbl.attachedUrl) {
        try {
          const [row] = await db.select({ attachedUrl: tbl.attachedUrl }).from(tbl).where(eq(tbl.id, doc.id)).limit(1);
          if (row?.attachedUrl) doc.attachedUrl = row.attachedUrl;
        } catch {}
      }
    }

    res.json(related);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Accounting Commission ==========

function verifyCommissionCompanyAccess(req: any, companyId: number): boolean {
  const user = req.user as any;
  if (user.role === "superadmin") return true;
  const allowedIds = user.allowedCompanyIds || [];
  return allowedIds.includes(companyId);
}

app.get("/api/accounting/commission-rules", requireAuth, requireAnyModule("sales", "accounting"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    if (!verifyCommissionCompanyAccess(req, companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    const rules = await db.select().from(commissionRules)
      .where(and(eq(commissionRules.companyId, companyId), eq(commissionRules.module, "accounting")))
      .orderBy(desc(commissionRules.createdAt));
    res.json(rules);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/accounting/commission-rules", requireAuth, requireAnyModule("sales", "accounting"), async (req, res) => {
  try {
    const { companyId, name, type, rate, perPieceRate, tiers, basedOn, appliesTo, assignScope, minTarget, docTypes } = req.body;
    if (!companyId || !name) return res.status(400).json({ message: "companyId and name required" });
    if (!verifyCommissionCompanyAccess(req, companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    const [rule] = await db.insert(commissionRules).values({
      companyId, module: "accounting", name, type: type || "percentage",
      rate: rate || "0", perPieceRate: perPieceRate || "0",
      tiers: tiers ? (typeof tiers === "string" ? tiers : JSON.stringify(tiers)) : null,
      basedOn: basedOn || "revenue", appliesTo: appliesTo || "salesperson",
      assignScope: assignScope || "all", minTarget: minTarget || "0",
      docTypes: docTypes || null,
    }).returning();
    res.json(rule);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.put("/api/accounting/commission-rules/:id", requireAuth, requireAnyModule("sales", "accounting"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(commissionRules).where(eq(commissionRules.id, id));
    if (!existing || existing.module !== "accounting") return res.status(404).json({ message: "Rule not found" });
    if (!verifyCommissionCompanyAccess(req, existing.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    const { name, type, rate, perPieceRate, tiers, basedOn, appliesTo, assignScope, minTarget, active, docTypes } = req.body;
    const [updated] = await db.update(commissionRules).set({
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(rate !== undefined && { rate }),
      ...(perPieceRate !== undefined && { perPieceRate }),
      ...(tiers !== undefined && { tiers: tiers ? (typeof tiers === "string" ? tiers : JSON.stringify(tiers)) : null }),
      ...(basedOn !== undefined && { basedOn }),
      ...(appliesTo !== undefined && { appliesTo }),
      ...(assignScope !== undefined && { assignScope }),
      ...(minTarget !== undefined && { minTarget }),
      ...(active !== undefined && { active }),
      ...(docTypes !== undefined && { docTypes }),
    }).where(eq(commissionRules.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/accounting/commission-rules/:id", requireAuth, requireAnyModule("sales", "accounting"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(commissionRules).where(eq(commissionRules.id, id));
    if (!existing || existing.module !== "accounting") return res.status(404).json({ message: "Rule not found" });
    if (!verifyCommissionCompanyAccess(req, existing.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    await db.delete(commissionRules).where(eq(commissionRules.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/accounting/commission/calculate", requireAuth, requireAnyModule("sales", "accounting"), async (req, res) => {
  try {
    const { companyId, month, year } = req.body;
    if (!companyId || !month || !year) return res.status(400).json({ message: "companyId, month, year required" });
    if (!verifyCommissionCompanyAccess(req, companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });

    const rules = await db.select().from(commissionRules)
      .where(and(eq(commissionRules.companyId, companyId), eq(commissionRules.module, "accounting"), eq(commissionRules.active, true)));
    if (rules.length === 0) return res.json({ results: [], message: "ไม่มีกฎคอมมิชชั่นฝั่งบัญชี" });

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    const docSources = [
      { key: "tax_invoice", dateCol: taxInvoices.taxInvoiceDate, table: taxInvoices },
      { key: "invoice", dateCol: invoices.invoiceDate, table: invoices },
      { key: "receipt", dateCol: receipts.receiptDate, table: receipts },
    ];

    const results: any[] = [];

    for (const rule of rules) {
      const ruleDocTypes = (rule.docTypes && rule.docTypes.length > 0) ? rule.docTypes : null;

      const salesBySp: Record<string, { totalSales: number; docs: number }> = {};

      for (const src of docSources) {
        if (ruleDocTypes && !ruleDocTypes.includes(src.key)) continue;

        const rows = await db.select({
          salesperson: src.table.salesperson,
          totalAmount: src.table.totalAmount,
        }).from(src.table).where(
          and(
            eq(src.table.companyId, companyId),
            eq(src.table.status, "approved"),
            gte(src.dateCol, startDate),
            lte(src.dateCol, endDate),
            sql`${src.table.salesperson} IS NOT NULL AND ${src.table.salesperson} <> ''`
          )
        );

        for (const row of rows) {
          const sp = (row.salesperson || "").trim();
          if (!sp) continue;
          if (!salesBySp[sp]) salesBySp[sp] = { totalSales: 0, docs: 0 };
          salesBySp[sp].totalSales += Number(row.totalAmount) || 0;
          salesBySp[sp].docs += 1;
        }
      }

      for (const [salesperson, data] of Object.entries(salesBySp)) {
        if (Number(rule.minTarget) > 0 && data.totalSales < Number(rule.minTarget)) continue;

        let amount = 0;
        if (rule.type === "percentage") {
          amount = data.totalSales * (Number(rule.rate) / 100);
        } else if (rule.type === "per_piece") {
          amount = data.docs * Number(rule.perPieceRate);
        } else if (rule.type === "tiered") {
          const tierData: { min: number; rate: number }[] = rule.tiers ? JSON.parse(rule.tiers) : [];
          const sorted = tierData.sort((a, b) => b.min - a.min);
          const applicable = sorted.find(t => data.totalSales >= t.min);
          if (applicable) amount = data.totalSales * (applicable.rate / 100);
        }

        if (amount > 0) {
          results.push({
            salesperson,
            ruleName: rule.name,
            ruleType: rule.type,
            totalSales: Math.round(data.totalSales * 100) / 100,
            totalDocs: data.docs,
            commissionRate: rule.type === "percentage" ? Number(rule.rate) : rule.type === "per_piece" ? Number(rule.perPieceRate) : 0,
            commissionAmount: Math.round(amount * 100) / 100,
          });
        }
      }
    }

    results.sort((a, b) => b.commissionAmount - a.commissionAmount);
    res.json({ results, month, year });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ---- Issued TIV amount for invoice (for TIV form remaining-amount calculation) ----
app.get("/api/invoices/:id/issued-tiv-amount", requireAuth, async (req, res) => {
  try {
    const invoiceId = Number(req.params.id);
    const companyId = Number(req.query.companyId);
    if (!invoiceId || !companyId) return res.status(400).json({ message: "Invalid params" });
    const [inv] = await db.select({ subtotal: invoices.subtotal, totalAmount: invoices.totalAmount, withholdingTax: invoices.withholdingTax })
      .from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    const tivRows = await db.select({ subtotal: taxInvoices.subtotal })
      .from(taxInvoices)
      .where(and(
        eq(taxInvoices.invoiceId, invoiceId),
        eq(taxInvoices.companyId, companyId),
        sql`(payment_method IS NULL OR payment_method != 'เครดิต') AND status NOT IN ('cancelled','voided','cancel')`
      ));
    // Use subtotal (before VAT) for both sides so ratio is consistent regardless of WHT
    const issuedAmount = tivRows.reduce((s, r) => s + parseFloat(String(r.subtotal || "0")), 0);
    const invoiceTotal = parseFloat(String(inv.subtotal || "0"));
    const remaining = Math.max(0, invoiceTotal - issuedAmount);
    res.json({ issuedAmount, invoiceTotal, remaining, withholdingTax: parseFloat(String(inv.withholdingTax || "0")) });
  } catch (err: any) {
    console.error("[issued-tiv-amount]", err);
    res.status(500).json({ message: err.message });
  }
});

}
