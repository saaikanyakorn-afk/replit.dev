import type { Express, Request, Response } from "express";
import { db } from "../db";
import { ecomDb } from "../ecom-db";
import { storage } from "../storage";
import { eq, desc, and, or, isNull, asc, ilike, inArray, notInArray, gte, lte, count, sum , sql } from "drizzle-orm";
import { companies, ecommerceOrders, productStock, products, ecommerceReturns, taxInvoices, taxInvoiceItems, accounts, journalEntries, journalLines, ecommerceOrderItems, workBoards, workBoardColumns, workBoardItems, firmFolders, receipts, oauthStates, syncLogs, facebookChatOrders, chatOrderKeywords, chatOrders, productBundles, ecommerceReturnItems, salesCreditNotes, salesCreditNoteItems, paymentMethods, facebookPages, platformChatThreads, ecommerceConnections, ecommerceProductMappings, deliveryNotes, stockTransfers, warehouses, warehouseStockLevels, fulfillmentBatches, fulfillmentItems, ecommerceTeamMembers, users } from "@shared/schema";
import { requireAuth, requireModule, requireAnyModule, checkDocOwnership } from "../route-middleware";
import { getNextDocNo, getNextJournalEntryNo, createAutoJournalEntry, generateTivFromEcommerceOrder, PLATFORM_DOC_PREFIX, PLATFORM_DISPLAY_NAME, logActivity, checkClosedPeriod, upsertWarehouseStockLevel, deductStockBundleAware, getInventoryTriggers } from "../route-helpers";
import { parsePagination, paginatedResponse } from "./pagination";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import os from "os";
import { z } from "zod";
import OpenAI from "openai";
import { getAdapter, getAllAdapters, PLATFORM_INFO } from "../platforms";
import type { PlatformCredentials } from "../platforms";
import { scrapeRdReceipts, scrapeSsoReceipts } from "../gov-receipt-scraper";

export function registerEcommerceRoutes(app: Express) {
// ============ eCommerce Hub ============

app.get("/api/ecommerce/connections", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [comp] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (comp && user.role !== "super_admin" && comp.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงกิจการนี้" });
    let connections = await storage.getEcommerceConnections(companyId);
    const FOOD_PLATFORMS = ['grab_food', 'line_man', 'robinhood'];
    connections = connections.filter(c => !FOOD_PLATFORMS.includes(c.platform));
    const platformFilter = req.query.platform ? String(req.query.platform) : null;
    if (platformFilter) {
      connections = connections.filter(c => c.platform === platformFilter);
    }
    const safeConnections = connections.map(c => {
      if (c.platform === "grab_food" && c.settings) {
        try {
          const parsed = JSON.parse(c.settings);
          const safeSettings = JSON.stringify({ merchantId: parsed.merchantId, useStaging: parsed.useStaging });
          return { ...c, accessToken: null, settings: safeSettings };
        } catch { return { ...c, accessToken: null, settings: null }; }
      }
      return c;
    });
    res.json(safeConnections);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/connections", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const data = { ...req.body };
    if (!data.companyId) return res.status(400).json({ message: "companyId required" });
    const [comp] = await db.select().from(companies).where(eq(companies.id, Number(data.companyId)));
    if (!comp) return res.status(404).json({ message: "ไม่พบกิจการ" });
    if (user.role !== "super_admin" && comp.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงกิจการนี้" });
    if (!data.status) data.status = "pending";
    if (!data.accessToken && data.status === "connected") data.status = "pending";
    const connection = await storage.createEcommerceConnection(data);
    res.status(201).json(connection);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/ecommerce/connections/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const [existing] = await ecomDb.select().from(ecommerceConnections).where(eq(ecommerceConnections.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ message: "ไม่พบการเชื่อมต่อ" });
    const [comp] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
    if (comp && user.role !== "super_admin" && comp.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงกิจการนี้" });
    const connection = await storage.updateEcommerceConnection(Number(req.params.id), req.body);
    if (!connection) return res.status(404).json({ message: "ไม่พบการเชื่อมต่อ" });
    res.json(connection);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/ecommerce/connections/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const [existing] = await ecomDb.select().from(ecommerceConnections).where(eq(ecommerceConnections.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ message: "ไม่พบการเชื่อมต่อ" });
    const [comp] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
    if (comp && user.role !== "super_admin" && comp.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงกิจการนี้" });
    const deleted = await storage.deleteEcommerceConnection(Number(req.params.id));
    if (!deleted) return res.status(404).json({ message: "ไม่พบการเชื่อมต่อ" });
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/dashboard", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "ไม่พบบริษัท" });
    if (company.tenantId && user.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todayStats] = await ecomDb.select({
      count: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${ecommerceOrders.totalAmount}), 0)`,
    }).from(ecommerceOrders).where(and(
      eq(ecommerceOrders.companyId, companyId),
      gte(ecommerceOrders.createdAt, todayStart),
      sql`${ecommerceOrders.platform} NOT IN ('grab_food', 'line_man', 'robinhood')`,
    ));

    const [pendingStats] = await ecomDb.select({
      count: sql<number>`count(*)::int`,
    }).from(ecommerceOrders).where(and(
      eq(ecommerceOrders.companyId, companyId),
      eq(ecommerceOrders.status, "confirmed"),
      sql`${ecommerceOrders.platform} NOT IN ('grab_food', 'line_man', 'robinhood')`,
    ));

    const [shippedStats] = await ecomDb.select({
      count: sql<number>`count(*)::int`,
    }).from(ecommerceOrders).where(and(
      eq(ecommerceOrders.companyId, companyId),
      eq(ecommerceOrders.status, "shipping"),
      sql`${ecommerceOrders.platform} NOT IN ('grab_food', 'line_man', 'robinhood')`,
    ));

    const platformBreakdown = await ecomDb.select({
      platform: ecommerceOrders.platform,
      orderCount: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${ecommerceOrders.totalAmount}), 0)`,
    }).from(ecommerceOrders).where(and(
      eq(ecommerceOrders.companyId, companyId),
      sql`${ecommerceOrders.platform} NOT IN ('grab_food', 'line_man', 'robinhood')`,
    )).groupBy(ecommerceOrders.platform);

    const recentOrders = await db.select({
      id: ecommerceOrders.id,
      orderNo: ecommerceOrders.orderNo,
      platform: ecommerceOrders.platform,
      customerName: ecommerceOrders.buyerName,
      totalAmount: ecommerceOrders.totalAmount,
      status: ecommerceOrders.status,
      createdAt: ecommerceOrders.createdAt,
    }).from(ecommerceOrders).where(and(
      eq(ecommerceOrders.companyId, companyId),
      sql`${ecommerceOrders.platform} NOT IN ('grab_food', 'line_man', 'robinhood')`,
    )).orderBy(desc(ecommerceOrders.createdAt)).limit(10);

    const [lowStockResult] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(productStock)
      .innerJoin(products, eq(products.id, productStock.productId))
      .where(and(
        eq(productStock.companyId, companyId),
        sql`${products.lowStockThreshold} > 0`,
        sql`${productStock.quantity}::numeric < ${products.lowStockThreshold}::numeric`,
      ));

    const [pendingReturnsResult] = await ecomDb.select({
      count: sql<number>`count(*)::int`,
    }).from(ecommerceReturns).where(and(
      eq(ecommerceReturns.companyId, companyId),
      eq(ecommerceReturns.status, "requested"),
    ));

    res.json({
      todayOrders: todayStats?.count || 0,
      todayRevenue: todayStats?.revenue || "0",
      pendingOrders: pendingStats?.count || 0,
      shippedOrders: shippedStats?.count || 0,
      platformBreakdown,
      recentOrders,
      lowStockCount: lowStockResult?.count || 0,
      pendingReturns: pendingReturnsResult?.count || 0,
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/ecommerce/orders", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
    const connectionId = req.query.connectionId ? Number(req.query.connectionId) : undefined;
    const statusFilter = req.query.status ? String(req.query.status) : undefined;
    const conditions: any[] = [eq(ecommerceOrders.companyId, companyId)];
    if (connectionId) conditions.push(eq(ecommerceOrders.connectionId, connectionId));
    if (statusFilter) conditions.push(eq(ecommerceOrders.status, statusFilter));
    if (req.query.platform) conditions.push(eq(ecommerceOrders.platform, String(req.query.platform)));
    if (req.query.startDate) conditions.push(gte(ecommerceOrders.placedAt, new Date(String(req.query.startDate))));
    if (req.query.endDate) {
      const end = new Date(String(req.query.endDate));
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(ecommerceOrders.placedAt, end));
    }
    if (req.query.hasDocument === "true") conditions.push(sql`${ecommerceOrders.taxInvoiceId} IS NOT NULL`);
    if (req.query.hasDocument === "false") conditions.push(sql`${ecommerceOrders.taxInvoiceId} IS NULL`);
    if (req.query.settlementStatus) conditions.push(eq(ecommerceOrders.settlementStatus, String(req.query.settlementStatus)));
    const whereClause = and(...conditions);

    const summaryConditions: any[] = [eq(ecommerceOrders.companyId, companyId)];
    if (connectionId) summaryConditions.push(eq(ecommerceOrders.connectionId, connectionId));
    if (req.query.platform) summaryConditions.push(eq(ecommerceOrders.platform, String(req.query.platform)));
    if (req.query.startDate) summaryConditions.push(gte(ecommerceOrders.placedAt, new Date(String(req.query.startDate))));
    if (req.query.endDate) {
      const endS = new Date(String(req.query.endDate));
      endS.setHours(23, 59, 59, 999);
      summaryConditions.push(lte(ecommerceOrders.placedAt, endS));
    }
    if (statusFilter) summaryConditions.push(eq(ecommerceOrders.status, statusFilter));
    const summaryWhere = and(...summaryConditions);
    const settlementSummary = await ecomDb.select({
      status: ecommerceOrders.settlementStatus,
      count: count(),
      totalAmount: sql<string>`COALESCE(SUM(${ecommerceOrders.totalAmount}::numeric), 0)`,
    }).from(ecommerceOrders).where(summaryWhere).groupBy(ecommerceOrders.settlementStatus);

    if (req.query.page) {
      const [{ total }] = await ecomDb.select({ total: count() }).from(ecommerceOrders).where(whereClause);
      const orders = await ecomDb.select().from(ecommerceOrders).where(whereClause).orderBy(desc(ecommerceOrders.placedAt)).limit(pageSize).offset(offset);
      const paginated = paginatedResponse(orders, Number(total), { page, pageSize, offset });
      (paginated as any).settlementSummary = settlementSummary;
      res.json(paginated);
    } else {
      const orders = await ecomDb.select().from(ecommerceOrders).where(whereClause).orderBy(desc(ecommerceOrders.placedAt));
      res.json({ data: orders, settlementSummary });
    }
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/orders/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const order = await storage.getEcommerceOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "ไม่พบออเดอร์" });
    const ac = await checkDocOwnership(order.companyId, req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });
    res.json(order);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/orders", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    if (!req.body.companyId) return res.status(400).json({ message: "companyId required" });
    const ac = await checkDocOwnership(Number(req.body.companyId), req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });
    const order = await storage.createEcommerceOrder(req.body);
    res.status(201).json(order);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/ecommerce/orders/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const orderId = Number(req.params.id);

    const [existingOrder] = await ecomDb.select().from(ecommerceOrders).where(eq(ecommerceOrders.id, orderId));
    if (!existingOrder) return res.status(404).json({ message: "ไม่พบออเดอร์" });
    const ac = await checkDocOwnership(existingOrder.companyId, req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });

    const order = await storage.updateEcommerceOrder(orderId, req.body);
    if (!order) return res.status(404).json({ message: "ไม่พบออเดอร์" });

    if (req.body.warehouseId !== undefined) {
      const wid = req.body.warehouseId ? Number(req.body.warehouseId) : null;
      await db.execute(sql.raw(`UPDATE ecommerce_orders SET warehouse_id = ${wid === null ? "NULL" : wid} WHERE id = ${orderId}`));
      (order as any).warehouseId = wid;
    }

    const isStatusChangedToShipped = req.body.status === "shipping" && existingOrder.status !== "shipping";

    if (isStatusChangedToShipped && !order.taxInvoiceId) {
      const [company] = await db.select().from(companies).where(eq(companies.id, order.companyId));
      if (company?.autoTivOnShipped) {
        try {
          const tivResult = await generateTivFromEcommerceOrder({
            orderId,
            companyId: order.companyId,
            platform: order.platform,
            orderNo: order.orderNo || "",
            platformOrderId: order.platformOrderId,
            buyerName: order.buyerName,
            buyerAddress: order.buyerAddress,
            totalAmount: order.totalAmount,
            trackingNo: order.trackingNo,
            shippedAt: order.shippedAt,
            placedAt: order.placedAt,
            accountingMode: company.accountingMode,
            userId: user.id,
            vatRegistered: company.vatRegistered,
            skipJournal: !!company.ecDailySummaryMode,
          });
          if (tivResult) {
            (order as any).taxInvoiceId = tivResult.taxInvoiceId;
          }
        } catch (autoTivErr) {
          console.error("Auto-TIV error:", autoTivErr);
        }
      }
    }

    if (isStatusChangedToShipped) {
      const ecomWarehouseId = (order as any).warehouseId ? Number((order as any).warehouseId) : null;
      if (ecomWarehouseId) {
        try {
          const orderItems = await ecomDb.select().from(ecommerceOrderItems).where(eq(ecommerceOrderItems.orderId, orderId));
          const deductItems = orderItems
            .filter(i => i.productId && Number(i.qty) > 0)
            .map(i => ({ productId: i.productId!, qty: Number(i.qty), warehouseId: ecomWarehouseId, productName: i.name }));
          if (deductItems.length > 0) {
            const ecTriggers = await getInventoryTriggers(order.companyId);
            if (ecTriggers.ecommerce_shipping_out) {
              await deductStockBundleAware(deductItems, order.companyId, order.orderNo || `EC-${orderId}`, "ecommerce_order", orderId, user.id);
            }
          }
        } catch (ecomDeductErr) {
          console.error("[ecommerce] warehouse stock deduction error:", ecomDeductErr);
        }
      }
    }

    res.json(order);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/orders/:id/items", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const [order] = await ecomDb.select({ companyId: ecommerceOrders.companyId }).from(ecommerceOrders).where(eq(ecommerceOrders.id, orderId));
    if (!order) return res.status(404).json({ message: "ไม่พบออเดอร์" });
    const ac = await checkDocOwnership(order.companyId, req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });
    const items = await storage.getEcommerceOrderItems(orderId);
    res.json(items);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/orders/:id/generate-document", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const orderId = Number(req.params.id);

    const [order] = await ecomDb.select().from(ecommerceOrders).where(eq(ecommerceOrders.id, orderId));
    if (!order) return res.status(404).json({ message: "ไม่พบคำสั่งซื้อ" });

    const [company] = await db.select().from(companies).where(eq(companies.id, order.companyId));
    if (!company) return res.status(404).json({ message: "ไม่พบกิจการ" });
    if (user.role !== "super_admin" && company.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงกิจการนี้" });
    }

    if (order.taxInvoiceId) {
      return res.status(400).json({ message: "ออกเอกสารแล้ว", taxInvoiceId: order.taxInvoiceId });
    }

    const tivResult = await generateTivFromEcommerceOrder({
      orderId,
      companyId: order.companyId,
      platform: order.platform,
      orderNo: order.orderNo || "",
      platformOrderId: order.platformOrderId,
      buyerName: order.buyerName,
      buyerAddress: order.buyerAddress,
      totalAmount: order.totalAmount,
      trackingNo: order.trackingNo,
      shippedAt: order.shippedAt,
      placedAt: order.placedAt,
      accountingMode: company.accountingMode,
      userId: user.id,
      vatRegistered: company.vatRegistered,
      skipJournal: !!company.ecDailySummaryMode,
    });

    if (!tivResult) {
      return res.status(400).json({ message: "ไม่สามารถสร้างเอกสารได้" });
    }

    if (tivResult.isExisting) {
      return res.json({ success: true, taxInvoiceId: tivResult.taxInvoiceId, taxInvoiceNo: tivResult.taxInvoiceNo, message: "เชื่อมโยงกับเอกสารที่มีอยู่แล้ว" });
    }

    res.json({ success: true, taxInvoiceId: tivResult.taxInvoiceId, taxInvoiceNo: tivResult.taxInvoiceNo, accountingMode: company.accountingMode });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/orders/batch-generate-documents", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const { orderIds, companyId } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0 || !companyId) {
      return res.status(400).json({ message: "กรุณาเลือกคำสั่งซื้อ" });
    }
    if (orderIds.length > 200) {
      return res.status(400).json({ message: "สร้างได้สูงสุด 200 เอกสารต่อครั้ง" });
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, Number(companyId)));
    if (!company) return res.status(404).json({ message: "ไม่พบกิจการ" });
    if (user.role !== "super_admin" && company.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงกิจการนี้" });
    }

    const isFullAccounting = company.accountingMode === "full_accounting";
    const PLATFORM_DOC_PREFIX: Record<string, string> = {
      shopee: "SH", lazada: "LZ", tiktok: "TT",
      grab_food: "GR", grab: "GR", "grab food": "GR",
      line_man: "LM", lineman: "LM", "line man": "LM",
      robinhood: "RH", amazon: "AZ",
    };
    const PLATFORM_DISPLAY_NAME: Record<string, string> = {
      shopee: "SHOPEE", lazada: "LAZADA", tiktok: "TIKTOK",
      grab_food: "GRAB", grab: "GRAB", "grab food": "GRAB",
      line_man: "LINEMAN", lineman: "LINEMAN", "line man": "LINEMAN",
      robinhood: "ROBINHOOD", amazon: "AMAZON",
    };

    const results: { orderId: number; success: boolean; taxInvoiceId?: number; taxInvoiceNo?: string; error?: string }[] = [];

    for (const orderId of orderIds) {
      try {
        const [order] = await ecomDb.select().from(ecommerceOrders).where(eq(ecommerceOrders.id, Number(orderId)));
        if (!order) { results.push({ orderId, success: false, error: "ไม่พบคำสั่งซื้อ" }); continue; }
        if (order.companyId !== Number(companyId)) { results.push({ orderId, success: false, error: "คำสั่งซื้อไม่ตรงกับกิจการ" }); continue; }
        if (order.taxInvoiceId) { results.push({ orderId, success: false, error: "ออกเอกสารแล้ว" }); continue; }

        const items = await storage.getEcommerceOrderItems(Number(orderId));
        const platformLower = String(order.platform || "").toLowerCase();
        const platformDisplay = PLATFORM_DISPLAY_NAME[platformLower] || String(order.platform || "").toUpperCase();
        const orderNo = order.orderNo || order.platformOrderId;
        const refDoc = `${platformDisplay} #${orderNo}`;

        const existingTiv = await ecomDb.select({ id: taxInvoices.id }).from(taxInvoices)
          .where(and(eq(taxInvoices.companyId, order.companyId), eq(taxInvoices.refDoc, refDoc)));
        if (existingTiv.length > 0) {
          await ecomDb.update(ecommerceOrders).set({ taxInvoiceId: existingTiv[0].id }).where(eq(ecommerceOrders.id, Number(orderId)));
          results.push({ orderId, success: true, taxInvoiceId: existingTiv[0].id, taxInvoiceNo: "" });
          continue;
        }

        let connPrefix = PLATFORM_DOC_PREFIX[platformLower] || "TIV";
        if (order.connectionId) {
          const [conn] = await ecomDb.select().from(ecommerceConnections).where(eq(ecommerceConnections.id, order.connectionId));
          if (conn?.docPrefix) connPrefix = conn.docPrefix;
        }
        const prefix = connPrefix;
        const batchDocDate = order.placedAt ? new Date(order.placedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        const taxInvoiceNo = await getNextDocNo(order.companyId, prefix, taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId, batchDocDate, undefined, ecomDb);

        const subtotal = items.length > 0
          ? items.reduce((sum: number, i: any) => sum + (parseFloat(i.total) || 0), 0)
          : parseFloat(String(order.totalAmount || "0"));
        const isVatRegistered = company.vatRegistered === true;

        let vatAmount = 0;
        if (isVatRegistered) {
          const vat7Total = items.length > 0
            ? items.filter((i: any) => (i.vatType || "vat7") === "vat7").reduce((sum: number, i: any) => sum + (parseFloat(i.total) || 0), 0)
            : subtotal;
          vatAmount = Math.round(vat7Total * 7 / 107 * 100) / 100;
        }
        const apiDocLabel = isVatRegistered ? "ใบกำกับภาษี" : "ใบเสร็จรับเงิน";

        const doc = await ecomDb.transaction(async (tx) => {
          const [doc] = await tx.insert(taxInvoices).values({
            companyId: order.companyId,
            taxInvoiceNo,
            taxInvoiceDate: order.placedAt ? new Date(order.placedAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
            customerName: order.buyerName || "ลูกค้า",
            customerAddress: order.buyerAddress || null,
            subtotal: String(subtotal.toFixed(2)),
            discountAmount: "0",
            vatAmount: String(vatAmount.toFixed(2)),
            totalAmount: String(subtotal.toFixed(2)),
            status: "approved",
            priceMode: isVatRegistered ? "included" : "excluded",
            docPrefix: prefix,
            refDoc,
            notes: `${apiDocLabel} - นำเข้าจาก ${order.platform} - ${orderNo}${order.trackingNo ? ` | เลขพัสดุ: ${order.trackingNo}` : ""}`,
            createdBy: user.id,
          }).returning();

          if (items.length > 0) {
            for (const item of items) {
              await tx.insert(taxInvoiceItems).values({
                taxInvoiceId: doc.id,
                productCode: item.platformSku || null,
                productName: item.name || "สินค้า",
                qty: String(item.qty || "1"),
                unit: "ชิ้น",
                unitPrice: String(parseFloat(String(item.price || "0")).toFixed(2)),
                discount: String(parseFloat(String(item.discount || "0")).toFixed(2)),
                total: String(parseFloat(String(item.total || "0")).toFixed(2)),
                vatType: isVatRegistered ? (item.vatType || "vat7") : "vat0",
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
              vatType: isVatRegistered ? "vat7" : "vat0",
            });
          }

          await tx.update(ecommerceOrders).set({ taxInvoiceId: doc.id }).where(eq(ecommerceOrders.id, Number(orderId)));
          return doc;
        });

        if (isFullAccounting) {
          try {
            await createAutoJournalEntry({
              companyId: doc.companyId,
              documentType: "tax_invoice",
              sourceDocType: "tax_invoice",
              sourceDocId: doc.id,
              docDate: doc.taxInvoiceDate,
              docNo: doc.taxInvoiceNo,
              subtotal: String(doc.subtotal),
              vatAmount: String(doc.vatAmount),
              totalAmount: String(doc.totalAmount),
              withholdingTax: "0",
              currencyCode: "THB",
              exchangeRate: "1",
              userId: user.id,
              customerName: doc.customerName,
              overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
            });
          } catch (e) {}
        }

        results.push({ orderId, success: true, taxInvoiceId: doc.id, taxInvoiceNo: doc.taxInvoiceNo });
      } catch (err: any) {
        results.push({ orderId, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    res.json({
      success: true,
      accountingMode: company.accountingMode,
      summary: { total: orderIds.length, success: successCount, failed: failCount },
      results,
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/orders/bulk-status", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const { orderIds, status, companyId } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0 || !companyId || !status) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลให้ครบถ้วน" });
    }
    const validStatuses = ["confirmed", "processing", "shipping", "shipped", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "สถานะไม่ถูกต้อง" });
    }
    const [company] = await db.select().from(companies).where(eq(companies.id, Number(companyId)));
    if (!company) return res.status(404).json({ message: "ไม่พบกิจการ" });
    if (user.role !== "super_admin" && company.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงกิจการนี้" });
    }
    const result = await ecomDb.update(ecommerceOrders)
      .set({ status })
      .where(and(
        inArray(ecommerceOrders.id, orderIds.map(Number)),
        eq(ecommerceOrders.companyId, Number(companyId))
      ));
    res.json({ updated: result.rowCount || 0 });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/orders/bulk-print-tiv", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const { orderIds, companyId } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0 || !companyId) {
      return res.status(400).json({ message: "กรุณาระบุข้อมูลให้ครบถ้วน" });
    }
    const [company] = await db.select().from(companies).where(eq(companies.id, Number(companyId)));
    if (!company) return res.status(404).json({ message: "ไม่พบกิจการ" });
    if (user.role !== "super_admin" && company.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงกิจการนี้" });
    }
    const matchedOrders = await ecomDb.select({ id: ecommerceOrders.id, taxInvoiceId: ecommerceOrders.taxInvoiceId })
      .from(ecommerceOrders)
      .where(and(
        inArray(ecommerceOrders.id, orderIds.map(Number)),
        eq(ecommerceOrders.companyId, Number(companyId))
      ));
    const taxInvoiceIds = matchedOrders
      .filter(o => o.taxInvoiceId !== null)
      .map(o => o.taxInvoiceId as number);
    res.json({ taxInvoiceIds });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ========== Settlement Reconciliation ==========
app.get("/api/ecommerce/settlements", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "ไม่พบกิจการ" });
    if (user.role !== "super_admin" && company.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    const conditions: any[] = [eq(ecommerceOrders.companyId, companyId)];

    const platform = req.query.platform as string;
    if (platform && platform !== "all") conditions.push(eq(ecommerceOrders.platform, platform));

    const settlementStatus = req.query.settlementStatus as string;
    if (settlementStatus && settlementStatus !== "all") conditions.push(eq(ecommerceOrders.settlementStatus, settlementStatus));

    const startDate = req.query.startDate as string;
    if (startDate) conditions.push(gte(ecommerceOrders.placedAt, new Date(startDate)));

    const endDate = req.query.endDate as string;
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(ecommerceOrders.placedAt, end));
    }

    const statusFilter = req.query.orderStatus as string;
    if (statusFilter && statusFilter !== "all") conditions.push(eq(ecommerceOrders.status, statusFilter));

    const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
    const whereClause = and(...conditions);
    const [{ total }] = await ecomDb.select({ total: count() }).from(ecommerceOrders).where(whereClause);
    const orders = await ecomDb.select().from(ecommerceOrders)
      .where(whereClause)
      .orderBy(desc(ecommerceOrders.placedAt))
      .limit(pageSize).offset(offset);

    const summaryRows = await db.select({
      totalOrders: count(),
      totalNetIncome: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.netIncome} AS numeric)), 0)`,
      settledCount: sql<string>`SUM(CASE WHEN ${ecommerceOrders.settlementStatus} = 'settled' THEN 1 ELSE 0 END)`,
      settledAmount: sql<string>`COALESCE(SUM(CASE WHEN ${ecommerceOrders.settlementStatus} = 'settled' THEN COALESCE(CAST(${ecommerceOrders.settlementAmount} AS numeric), CAST(${ecommerceOrders.netIncome} AS numeric)) ELSE 0 END), 0)`,
      discrepancyCount: sql<string>`SUM(CASE WHEN ${ecommerceOrders.settlementStatus} = 'discrepancy' THEN 1 ELSE 0 END)`,
      pendingCount: sql<string>`SUM(CASE WHEN ${ecommerceOrders.settlementStatus} IS NULL OR ${ecommerceOrders.settlementStatus} = 'pending' THEN 1 ELSE 0 END)`,
      pendingAmount: sql<string>`COALESCE(SUM(CASE WHEN ${ecommerceOrders.settlementStatus} IS NULL OR ${ecommerceOrders.settlementStatus} IN ('pending','discrepancy') THEN CAST(${ecommerceOrders.netIncome} AS numeric) ELSE 0 END), 0)`,
    }).from(ecommerceOrders).where(whereClause);

    const sr = summaryRows[0];
    const summary = {
      totalOrders: Number(sr.totalOrders),
      pendingCount: Number(sr.pendingCount),
      settledCount: Number(sr.settledCount),
      discrepancyCount: Number(sr.discrepancyCount),
      pendingAmount: Number(sr.pendingAmount),
      settledAmount: Number(sr.settledAmount),
      totalNetIncome: Number(sr.totalNetIncome),
      shippingDiscrepancyCount: 0,
      shippingDiscrepancyAmount: 0,
    };

    if (req.query.page) {
      res.json({ ...paginatedResponse(orders, Number(total), { page, pageSize, offset }), summary });
    } else {
      res.json({ orders, summary });
    }
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/settlements/mark", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const markSchema = z.object({
      orderIds: z.array(z.number().int().positive()).min(1, "กรุณาเลือกออเดอร์"),
      status: z.enum(["settled", "pending", "discrepancy"]),
      settlementDate: z.string().optional(),
      settlementAmount: z.number().optional(),
      notes: z.string().optional(),
    });
    const parsed = markSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });
    const { orderIds, status, settlementDate, settlementAmount, notes } = parsed.data;

    const updateData: any = { settlementStatus: status };
    if (status === "settled") {
      updateData.settlementDate = settlementDate ? new Date(settlementDate) : new Date();
    }
    if (settlementAmount !== undefined) updateData.settlementAmount = String(settlementAmount);
    if (notes !== undefined) updateData.settlementNotes = notes;

    const results = [];
    for (const id of orderIds) {
      const [order] = await ecomDb.select().from(ecommerceOrders).where(eq(ecommerceOrders.id, Number(id)));
      if (!order) continue;

      const [comp] = await db.select().from(companies).where(eq(companies.id, order.companyId));
      if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId) continue;

      const [updated] = await ecomDb.update(ecommerceOrders)
        .set(updateData)
        .where(eq(ecommerceOrders.id, Number(id)))
        .returning();
      if (updated) results.push(updated);
    }

    res.json({ updated: results.length, orders: results });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/ecommerce/orders/:id/shipping-cost", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const orderId = Number(req.params.id);
    const schema = z.object({ actualShippingCost: z.number().min(0) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "ค่าส่งต้องเป็นตัวเลข" });
    const { actualShippingCost } = parsed.data;

    const [order] = await ecomDb.select().from(ecommerceOrders).where(eq(ecommerceOrders.id, orderId));
    if (!order) return res.status(404).json({ message: "ไม่พบออเดอร์" });

    const [comp] = await db.select().from(companies).where(eq(companies.id, order.companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }

    const [updated] = await ecomDb.update(ecommerceOrders)
      .set({ actualShippingCost: String(actualShippingCost) })
      .where(eq(ecommerceOrders.id, orderId))
      .returning();

    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ E-Commerce Settlement Batches ============

// Get all settlement batches
app.get("/api/ecommerce/settlement-batches", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [comp] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const platform = req.query.platform as string;
    const walletStatus = req.query.walletStatus as string;

    const conditions: any[] = [eq(ecommerceSettlements.companyId, companyId)];
    if (platform && platform !== "all") conditions.push(eq(ecommerceSettlements.platform, platform));
    if (walletStatus && walletStatus !== "all") conditions.push(eq(ecommerceSettlements.walletStatus, walletStatus));

    const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
    const whereClause = and(...conditions);
    const [{ total }] = await ecomDb.select({ total: count() }).from(ecommerceSettlements).where(whereClause);
    const settlements = await ecomDb.select().from(ecommerceSettlements)
      .where(whereClause)
      .orderBy(desc(ecommerceSettlements.settlementDate))
      .limit(pageSize).offset(offset);

    const walletBalances = await db.select({
      platform: ecommerceSettlements.platform,
      balance: sql<string>`coalesce(sum(case when ${ecommerceSettlements.walletStatus} = 'in_wallet' then ${ecommerceSettlements.netAmount} else 0 end), 0)`,
      totalSettled: sql<string>`coalesce(sum(${ecommerceSettlements.netAmount}), 0)`,
      totalWithdrawn: sql<string>`coalesce(sum(case when ${ecommerceSettlements.walletStatus} = 'withdrawn' then ${ecommerceSettlements.netAmount} else 0 end), 0)`,
      count: sql<string>`count(*)`,
    }).from(ecommerceSettlements)
      .where(eq(ecommerceSettlements.companyId, companyId))
      .groupBy(ecommerceSettlements.platform);

    if (req.query.page) {
      res.json({ ...paginatedResponse(settlements, Number(total), { page, pageSize, offset }), walletBalances });
    } else {
      res.json({ settlements, walletBalances });
    }
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Get settlement batch details with items
app.get("/api/ecommerce/settlement-batches/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [settlement] = await ecomDb.select().from(ecommerceSettlements).where(eq(ecommerceSettlements.id, id));
    if (!settlement) return res.status(404).json({ message: "ไม่พบรายการ Settlement" });
    const [comp] = await db.select().from(companies).where(eq(companies.id, settlement.companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const items = await ecomDb.select().from(ecommerceSettlementItems)
      .where(eq(ecommerceSettlementItems.settlementId, id));
    res.json({ ...settlement, items });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/settlement-batches/validate", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const schema = z.object({
      companyId: z.number().int().positive(),
      platform: z.string().min(1),
      settlementDate: z.string(),
      orderIds: z.array(z.string()),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });

    const { companyId, platform, settlementDate, orderIds } = parsed.data;
    const user = req.user as any;
    const [comp] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }

    const settleMonth = new Date(settlementDate);
    const settleYM = `${settleMonth.getFullYear()}-${String(settleMonth.getMonth() + 1).padStart(2, "0")}`;

    const filteredIds = orderIds.filter((id: string) => id && id.trim());
    const seenIds = new Set<string>();
    const duplicateIds: string[] = [];
    for (const id of filteredIds) {
      if (seenIds.has(id)) {
        if (!duplicateIds.includes(id)) duplicateIds.push(id);
      }
      seenIds.add(id);
    }
    const uniqueIds = [...seenIds];
    if (uniqueIds.length === 0) return res.json({ matched: 0, notFound: 0, crossPeriod: [], alreadySettled: [], duplicateInFile: duplicateIds.length, duplicateIds });

    const conditions = [
      eq(ecommerceOrders.companyId, companyId),
      eq(ecommerceOrders.platform, platform),
    ];

    const matchedOrders = await db.select({
      id: ecommerceOrders.id,
      orderNo: ecommerceOrders.orderNo,
      platformOrderId: ecommerceOrders.platformOrderId,
      placedAt: ecommerceOrders.placedAt,
      settlementStatus: ecommerceOrders.settlementStatus,
      totalAmount: ecommerceOrders.totalAmount,
    }).from(ecommerceOrders).where(and(...conditions));

    const orderMap = new Map<string, typeof matchedOrders[0]>();
    for (const o of matchedOrders) {
      if (o.orderNo) orderMap.set(o.orderNo, o);
      if (o.platformOrderId) orderMap.set(o.platformOrderId, o);
    }

    const crossPeriod: { orderId: string; orderMonth: string; totalAmount: string }[] = [];
    const alreadySettled: { orderId: string; totalAmount: string }[] = [];
    let matched = 0;
    let notFound = 0;
    const notFoundIds: string[] = [];

    for (const oid of uniqueIds) {
      const order = orderMap.get(oid);
      if (!order) {
        notFound++;
        if (notFoundIds.length < 20) notFoundIds.push(oid);
        continue;
      }
      matched++;

      if (order.settlementStatus === "settled") {
        alreadySettled.push({ orderId: oid, totalAmount: String(order.totalAmount || "0") });
      }

      if (order.placedAt) {
        const orderDate = new Date(order.placedAt);
        const orderYM = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, "0")}`;
        if (orderYM !== settleYM) {
          crossPeriod.push({
            orderId: oid,
            orderMonth: orderYM,
            totalAmount: String(order.totalAmount || "0"),
          });
        }
      }
    }

    const periodSummary: Record<string, { count: number; totalAmount: number }> = {};
    for (const cp of crossPeriod) {
      if (!periodSummary[cp.orderMonth]) periodSummary[cp.orderMonth] = { count: 0, totalAmount: 0 };
      periodSummary[cp.orderMonth].count++;
      periodSummary[cp.orderMonth].totalAmount += Number(cp.totalAmount);
    }

    res.json({
      total: uniqueIds.length,
      matched,
      notFound,
      notFoundIds,
      crossPeriod: Object.entries(periodSummary).map(([month, data]) => ({
        month,
        count: data.count,
        totalAmount: data.totalAmount,
      })),
      alreadySettled: alreadySettled.length,
      alreadySettledIds: alreadySettled.slice(0, 10).map(s => s.orderId),
      duplicateInFile: duplicateIds.length,
      duplicateIds: duplicateIds.slice(0, 10),
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Create settlement batch (from Excel import or manual)
app.post("/api/ecommerce/settlement-batches", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const schema = z.object({
      companyId: z.number().int().positive(),
      platform: z.string().min(1),
      settlementNo: z.string().optional(),
      periodFrom: z.string().optional(),
      periodTo: z.string().optional(),
      settlementDate: z.string().default(""),
      items: z.array(z.object({
        platformOrderId: z.string().optional(),
        orderNo: z.string().optional(),
        productAmount: z.number().default(0),
        shippingFee: z.number().default(0),
        sellerDiscount: z.number().default(0),
        platformDiscount: z.number().default(0),
        commissionFee: z.number().default(0),
        serviceFee: z.number().default(0),
        paymentFee: z.number().default(0),
        shippingCost: z.number().default(0),
        platformShippingSubsidy: z.number().default(0),
        otherFees: z.number().default(0),
        adjustments: z.number().default(0),
        buyerRefund: z.number().default(0),
        sellerShippingPromo: z.number().default(0),
        returnShipping: z.number().default(0),
        withholdingTax: z.number().default(0),
        adsDeduction: z.number().default(0),
        netAmount: z.number().default(0),
        itemType: z.string().default("order"),
        settleDate: z.string().default(""),
      })),
      notes: z.string().optional(),
      importSource: z.string().default("manual"),
      autoCreateJournal: z.boolean().default(false),
      dailyGrouping: z.boolean().default(false),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });

    const user = req.user as any;
    const [comp] = await db.select().from(companies).where(eq(companies.id, parsed.data.companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }

    const { items, autoCreateJournal, dailyGrouping, ...settlementData } = parsed.data;

    // Calculate totals from items
    let totalSales = 0, totalShippingFee = 0, totalSellerDiscount = 0;
    let totalCommission = 0, totalServiceFee = 0, totalPaymentFee = 0;
    let totalShippingCost = 0, totalOtherFees = 0, totalAdjustments = 0;
    let totalPlatformShippingSubsidy = 0, netAmount = 0;
    let totalBuyerRefund = 0, totalSellerShippingPromo = 0, totalReturnShipping = 0;
    let totalWithholdingTax = 0, totalAdsDeduction = 0;

    for (const item of items) {
      totalSales += item.productAmount;
      totalShippingFee += item.shippingFee;
      totalSellerDiscount += item.sellerDiscount;
      totalCommission += item.commissionFee;
      totalServiceFee += item.serviceFee;
      totalPaymentFee += item.paymentFee;
      totalShippingCost += item.shippingCost;
      totalPlatformShippingSubsidy += (item.platformShippingSubsidy || 0);
      totalOtherFees += item.otherFees;
      totalAdjustments += item.adjustments;
      totalBuyerRefund += (item.buyerRefund || 0);
      totalSellerShippingPromo += (item.sellerShippingPromo || 0);
      totalReturnShipping += (item.returnShipping || 0);
      totalWithholdingTax += (item.withholdingTax || 0);
      totalAdsDeduction += (item.adsDeduction || 0);
      netAmount += item.netAmount;
    }

    const result = await db.transaction(async (tx) => {
      const [settlement] = await tx.insert(ecommerceSettlements).values({
        companyId: settlementData.companyId,
        platform: settlementData.platform,
        settlementNo: settlementData.settlementNo || null,
        periodFrom: settlementData.periodFrom || null,
        periodTo: settlementData.periodTo || null,
        settlementDate: dailyGrouping
          ? (items.find(i => i.settleDate)?.settleDate || settlementData.settlementDate || new Date().toISOString().slice(0, 10))
          : (settlementData.settlementDate || new Date().toISOString().slice(0, 10)),
        totalSales: String(totalSales),
        totalShippingFee: String(totalShippingFee),
        totalSellerDiscount: String(totalSellerDiscount),
        totalCommission: String(totalCommission),
        totalServiceFee: String(totalServiceFee),
        totalPaymentFee: String(totalPaymentFee),
        totalShippingCost: String(totalShippingCost),
        totalOtherFees: String(totalOtherFees),
        totalAdjustments: String(totalAdjustments),
        totalPlatformShippingSubsidy: String(totalPlatformShippingSubsidy),
        netAmount: String(netAmount),
        orderCount: items.filter(i => i.itemType === "order").length,
        notes: settlementData.notes || null,
        importSource: settlementData.importSource,
        walletStatus: "in_wallet",
      }).returning();

      // Insert items
      let matchedOrderCount = 0;
      let unmatchedOrderCount = 0;
      let matchedNetTotal = 0;
      let unmatchedNetTotal = 0;
      const matchedItems: typeof items = [];
      for (const item of items) {
        // Try to match with existing order (by platformOrderId or orderNo)
        let orderId = null;
        const searchId = item.platformOrderId || item.orderNo;
        if (searchId) {
          const [byPlatformId] = await tx.select({ id: ecommerceOrders.id })
            .from(ecommerceOrders)
            .where(and(
              eq(ecommerceOrders.companyId, settlementData.companyId),
              eq(ecommerceOrders.platformOrderId, searchId)
            ));
          if (byPlatformId) {
            orderId = byPlatformId.id;
          } else {
            const [byOrderNo] = await tx.select({ id: ecommerceOrders.id })
              .from(ecommerceOrders)
              .where(and(
                eq(ecommerceOrders.companyId, settlementData.companyId),
                eq(ecommerceOrders.orderNo, searchId)
              ));
            if (byOrderNo) orderId = byOrderNo.id;
          }
        }

        if (orderId) { matchedNetTotal += item.netAmount; } else { unmatchedNetTotal += item.netAmount; }

        await tx.insert(ecommerceSettlementItems).values({
          settlementId: settlement.id,
          orderId,
          platformOrderId: item.platformOrderId || null,
          orderNo: item.orderNo || null,
          productAmount: String(item.productAmount),
          shippingFee: String(item.shippingFee),
          sellerDiscount: String(item.sellerDiscount),
          platformDiscount: String(item.platformDiscount),
          commissionFee: String(item.commissionFee),
          serviceFee: String(item.serviceFee),
          paymentFee: String(item.paymentFee),
          shippingCost: String(item.shippingCost),
          platformShippingSubsidy: String(item.platformShippingSubsidy || 0),
          otherFees: String(item.otherFees),
          adjustments: String(item.adjustments),
          buyerRefund: String(item.buyerRefund || 0),
          sellerShippingPromo: String(item.sellerShippingPromo || 0),
          returnShipping: String(item.returnShipping || 0),
          withholdingTax: String(item.withholdingTax || 0),
          adsDeduction: String(item.adsDeduction || 0),
          netAmount: String(item.netAmount),
          itemType: item.itemType,
        });

        if (orderId) { matchedOrderCount++; matchedItems.push(item); } else { unmatchedOrderCount++; }
        // Update order settlement status if matched
        if (orderId) {
          const [updatedOrder] = await tx.update(ecommerceOrders).set({
            settlementStatus: "settled",
            settlementDate: new Date(settlementData.settlementDate),
            settlementAmount: String(item.netAmount),
          }).where(eq(ecommerceOrders.id, orderId)).returning();

          if (updatedOrder?.taxInvoiceId) {
            await tx.update(taxInvoices)
              .set({ paymentStatus: "wallet" })
              .where(eq(taxInvoices.id, updatedOrder.taxInvoiceId));
          }
        }
      }

      // Auto-create journal entry for settlement (Settle → Wallet)
      let settleJournalId = null;
      if (autoCreateJournal && matchedItems.length > 0) {
        const PLATFORM_CODES: Record<string, { wallet: string; receivable: string; commission: string; serviceFee: string; transactionFee: string; infraFee: string; shipping: string; subsidyRevenue: string; buyerRefund: string; sellerShippingPromo: string; returnShipping: string; withholdingTax: string; adsDeduction: string }> = {
          shopee: { wallet: "1041000", receivable: "1231000", commission: "1441100", serviceFee: "1442100", transactionFee: "1444100", infraFee: "1443100", shipping: "1445100", subsidyRevenue: "4210000", buyerRefund: "1446100", sellerShippingPromo: "1447100", returnShipping: "1448100", withholdingTax: "1143000", adsDeduction: "5271000" },
          lazada: { wallet: "1042000", receivable: "1232000", commission: "1441200", serviceFee: "1442200", transactionFee: "1444200", infraFee: "1443200", shipping: "1445200", subsidyRevenue: "4210000", buyerRefund: "1446200", sellerShippingPromo: "1447200", returnShipping: "1448200", withholdingTax: "1143000", adsDeduction: "5271000" },
          tiktok: { wallet: "1043000", receivable: "1233000", commission: "1441300", serviceFee: "1442300", transactionFee: "1444300", infraFee: "1443300", shipping: "1445300", subsidyRevenue: "4210000", buyerRefund: "1446300", sellerShippingPromo: "1447300", returnShipping: "1448300", withholdingTax: "1143000", adsDeduction: "5271000" },
        };
        const codes = PLATFORM_CODES[settlementData.platform] || { wallet: "1044000", receivable: "1234000", commission: "1441900", serviceFee: "1442900", transactionFee: "1444900", infraFee: "1443900", shipping: "1445900", subsidyRevenue: "4210000", buyerRefund: "1446900", sellerShippingPromo: "1447900", returnShipping: "1448900", withholdingTax: "1143000", adsDeduction: "5271000" };

        const { ECOMMERCE_EXTRA_ACCOUNTS, STANDARD_CHART_OF_ACCOUNTS } = await import("../../shared/chart-of-accounts");
        const ALL_TEMPLATES = [...STANDARD_CHART_OF_ACCOUNTS, ...ECOMMERCE_EXTRA_ACCOUNTS];

        const ensureAccount = async (code: string): Promise<number> => {
          const [existing] = await tx.select({ id: accounts.id }).from(accounts)
            .where(and(eq(accounts.companyId, settlementData.companyId), eq(accounts.code, code)));
          if (existing) return existing.id;

          const template = ALL_TEMPLATES.find((a: any) => a.code === code);
          if (!template) throw new Error(`ไม่พบผังบัญชี ${code}`);

          if (template.parentCode) {
            const [parentExists] = await tx.select({ id: accounts.id }).from(accounts)
              .where(and(eq(accounts.companyId, settlementData.companyId), eq(accounts.code, template.parentCode)));
            if (!parentExists) {
              const parentTpl = ALL_TEMPLATES.find((a: any) => a.code === template.parentCode);
              if (parentTpl) {
                if (parentTpl.parentCode) {
                  const [gpExists] = await tx.select({ id: accounts.id }).from(accounts)
                    .where(and(eq(accounts.companyId, settlementData.companyId), eq(accounts.code, parentTpl.parentCode)));
                  if (!gpExists) {
                    const gpTpl = ALL_TEMPLATES.find((a: any) => a.code === parentTpl.parentCode);
                    if (gpTpl) {
                      await tx.insert(accounts).values({
                        companyId: settlementData.companyId, code: gpTpl.code, name: gpTpl.name,
                        nameTh: gpTpl.nameTh || gpTpl.name, nameZh: gpTpl.nameZh || "", type: gpTpl.type,
                        parentCode: gpTpl.parentCode || null, isHeader: true,
                      });
                    }
                  }
                }
                await tx.insert(accounts).values({
                  companyId: settlementData.companyId, code: parentTpl.code, name: parentTpl.name,
                  nameTh: parentTpl.nameTh || parentTpl.name, nameZh: parentTpl.nameZh || "", type: parentTpl.type,
                  parentCode: parentTpl.parentCode || null, isHeader: true,
                });
              }
            }
          }

          const isHeader = code.length <= 4;
          const [created] = await tx.insert(accounts).values({
            companyId: settlementData.companyId, code: template.code, name: template.name,
            nameTh: template.nameTh || template.name, nameZh: template.nameZh || "", type: template.type,
            parentCode: template.parentCode || null, isHeader,
          }).returning();
          return created.id;
        };

        const walletAcctId = await ensureAccount(codes.wallet);
        const receivableAcctId = await ensureAccount(codes.receivable);
        const commissionAcctId = await ensureAccount(codes.commission);
        const serviceFeeAcctId = await ensureAccount(codes.serviceFee);
        const transactionFeeAcctId = await ensureAccount(codes.transactionFee);
        const infraFeeAcctId = await ensureAccount(codes.infraFee);
        const shippingAcctId = await ensureAccount(codes.shipping);
        const subsidyRevenueAcctId = await ensureAccount(codes.subsidyRevenue);
        const buyerRefundAcctId = totalBuyerRefund !== 0 ? await ensureAccount(codes.buyerRefund) : 0;
        const sellerShippingPromoAcctId = totalSellerShippingPromo !== 0 ? await ensureAccount(codes.sellerShippingPromo) : 0;
        const returnShippingAcctId = totalReturnShipping !== 0 ? await ensureAccount(codes.returnShipping) : 0;
        const withholdingTaxAcctId = totalWithholdingTax !== 0 ? await ensureAccount(codes.withholdingTax) : 0;
        const adsDeductionAcctId = totalAdsDeduction !== 0 ? await ensureAccount(codes.adsDeduction) : 0;

        const platformLabel = settlementData.platform.charAt(0).toUpperCase() + settlementData.platform.slice(1);

        const createJournalForGroup = async (
          groupItems: typeof items,
          groupDate: string,
          entryNo: number,
          groupMatchedCount: number,
          groupUnmatchedCount: number,
          groupMatchedNetTotal: number,
          groupUnmatchedNetTotal: number,
        ) => {
          let gNet = 0, gCommission = 0, gServiceFee = 0, gPaymentFee = 0;
          let gShippingCost = 0, gOtherFees = 0, gSubsidy = 0;
          let gBuyerRefund = 0, gSellerShippingPromo = 0, gReturnShipping = 0;
          let gWithholdingTax = 0, gAdsDeduction = 0;
          for (const gi of groupItems) {
            gNet += gi.netAmount;
            gCommission += gi.commissionFee;
            gServiceFee += gi.serviceFee;
            gPaymentFee += gi.paymentFee;
            gShippingCost += gi.shippingCost;
            gOtherFees += gi.otherFees;
            gSubsidy += (gi.platformShippingSubsidy || 0);
            gBuyerRefund += (gi.buyerRefund || 0);
            gSellerShippingPromo += (gi.sellerShippingPromo || 0);
            gReturnShipping += (gi.returnShipping || 0);
            gWithholdingTax += (gi.withholdingTax || 0);
            gAdsDeduction += (gi.adsDeduction || 0);
          }
          const absNet = Math.abs(gNet);
          const absComm = Math.abs(gCommission);
          const absSvc = Math.abs(gServiceFee);
          const absPay = Math.abs(gPaymentFee);
          const absShip = Math.abs(gShippingCost);
          const absOther = Math.abs(gOtherFees);
          const absSub = Math.abs(gSubsidy);
          const absBuyerRefund = Math.abs(gBuyerRefund);
          const absSellerShipPromo = Math.abs(gSellerShippingPromo);
          const absReturnShip = Math.abs(gReturnShipping);
          const absWht = Math.abs(gWithholdingTax);
          const absAds = Math.abs(gAdsDeduction);
          const absFees = absComm + absSvc + absPay + absShip + absOther + absBuyerRefund + absSellerShipPromo + absReturnShip + absWht + absAds;
          const grossAmt = absNet + absFees - absSub;

          if (absNet === 0) return null;

          const unmatchedNote = groupUnmatchedCount > 0
            ? ` [!${groupUnmatchedCount} ออเดอร์ไม่พบในระบบ ฿${Math.abs(groupUnmatchedNetTotal).toLocaleString()}]`
            : "";
          const orderIds = groupItems.map(gi => gi.platformOrderId || gi.orderNo).filter(Boolean);
          const orderListNote = orderIds.length <= 10
            ? ` orders: ${orderIds.join(", ")}`
            : ` orders: ${orderIds.slice(0, 10).join(", ")} +${orderIds.length - 10}`;
          const [journal] = await tx.insert(journalEntries).values({
            companyId: settlementData.companyId,
            entryNo,
            entryDate: groupDate,
            reference: `SETTLE-${settlementData.platform.toUpperCase()}-${settlementData.settlementNo || settlement.id}${dailyGrouping ? `-${groupDate}` : ''}`,
            description: `[ประมาณการ] Settlement ${platformLabel} ${groupDate} (${groupMatchedCount}/${groupItems.length} matched) ฿${absNet.toLocaleString()}${unmatchedNote}${orderListNote}`,
            journalBook: "general",
            status: "approved",
            sourceDocType: "settlement",
            sourceDocId: settlement.id,
          }).returning();

          let lineNo = 1;
          await tx.insert(journalLines).values({
            journalEntryId: journal.id, lineNo: lineNo++,
            accountId: walletAcctId,
            description: `เงินเข้า Wallet ${platformLabel}`,
            debit: String(Math.round(absNet * 100) / 100), credit: "0",
          });
          if (absComm > 0) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: commissionAcctId,
              description: `ค่าคอมมิชชั่น ${platformLabel}`,
              debit: String(Math.round(absComm * 100) / 100), credit: "0",
            });
          }
          if (absSvc > 0) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: serviceFeeAcctId,
              description: `ค่าบริการแพลตฟอร์ม ${platformLabel}`,
              debit: String(Math.round(absSvc * 100) / 100), credit: "0",
            });
          }
          if (absPay > 0) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: transactionFeeAcctId,
              description: `ค่าธรรมเนียมธุรกรรม ${platformLabel}`,
              debit: String(Math.round(absPay * 100) / 100), credit: "0",
            });
          }
          if (absShip > 0) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: shippingAcctId,
              description: `ค่าขนส่ง ${platformLabel}`,
              debit: String(Math.round(absShip * 100) / 100), credit: "0",
            });
          }
          if (absOther > 0) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: infraFeeAcctId,
              description: `ค่าโครงสร้างพื้นฐาน ${platformLabel}`,
              debit: String(Math.round(absOther * 100) / 100), credit: "0",
            });
          }
          if (absBuyerRefund > 0 && buyerRefundAcctId) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: buyerRefundAcctId,
              description: `เงินคืนผู้ซื้อ ${platformLabel}`,
              debit: String(Math.round(absBuyerRefund * 100) / 100), credit: "0",
            });
          }
          if (absSellerShipPromo > 0 && sellerShippingPromoAcctId) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: sellerShippingPromoAcctId,
              description: `โปรโมชั่นค่าส่งผู้ขาย ${platformLabel}`,
              debit: String(Math.round(absSellerShipPromo * 100) / 100), credit: "0",
            });
          }
          if (absReturnShip > 0 && returnShippingAcctId) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: returnShippingAcctId,
              description: `ค่าจัดส่งสินค้าคืน ${platformLabel}`,
              debit: String(Math.round(absReturnShip * 100) / 100), credit: "0",
            });
          }
          if (absWht > 0 && withholdingTaxAcctId) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: withholdingTaxAcctId,
              description: `ภาษีหัก ณ ที่จ่าย ${platformLabel}`,
              debit: String(Math.round(absWht * 100) / 100), credit: "0",
            });
          }
          if (absAds > 0 && adsDeductionAcctId) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: adsDeductionAcctId,
              description: `ค่าโฆษณา ${platformLabel}`,
              debit: String(Math.round(absAds * 100) / 100), credit: "0",
            });
          }
          if (absSub > 0) {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: subsidyRevenueAcctId,
              description: `รายได้เงินอุดหนุนค่าส่ง ${platformLabel}`,
              debit: "0", credit: String(Math.round(absSub * 100) / 100),
            });
          }

          if (groupUnmatchedCount > 0 && groupMatchedCount > 0) {
            const matchedRatio = groupMatchedNetTotal / gNet;
            const matchedGross = Math.round(grossAmt * matchedRatio * 100) / 100;
            const unmatchedGross = Math.round((grossAmt - matchedGross) * 100) / 100;
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: receivableAcctId,
              description: `ล้างลูกหนี้ ${platformLabel} (${groupMatchedCount} ออเดอร์จับคู่ได้)`,
              debit: "0", credit: String(matchedGross),
            });
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: receivableAcctId,
              description: `ล้างลูกหนี้ ${platformLabel} (${groupUnmatchedCount} ออเดอร์ไม่มีในระบบ)`,
              debit: "0", credit: String(unmatchedGross),
            });
          } else {
            await tx.insert(journalLines).values({
              journalEntryId: journal.id, lineNo: lineNo++,
              accountId: receivableAcctId,
              description: `ล้างลูกหนี้ ${platformLabel} Settlement${groupUnmatchedCount > 0 ? ` (${groupUnmatchedCount} ออเดอร์ไม่มีในระบบ)` : ""}`,
              debit: "0", credit: String(Math.round(grossAmt * 100) / 100),
            });
          }

          return journal.id;
        };

        const [lastEntry] = await tx.select({ entryNo: journalEntries.entryNo })
          .from(journalEntries)
          .where(eq(journalEntries.companyId, settlementData.companyId))
          .orderBy(desc(journalEntries.id))
          .limit(1);
        let nextNo = (lastEntry?.entryNo || 0) + 1;

        const journalIds: number[] = [];

        if (dailyGrouping) {
          const dateGroups: Record<string, { items: typeof items; matchedCount: number; unmatchedCount: number; matchedNet: number; unmatchedNet: number }> = {};
          for (const item of matchedItems) {
            const dateKey = item.settleDate || settlementData.settlementDate || "unknown";
            if (!dateGroups[dateKey]) dateGroups[dateKey] = { items: [], matchedCount: 0, unmatchedCount: 0, matchedNet: 0, unmatchedNet: 0 };
            dateGroups[dateKey].items.push(item);
            dateGroups[dateKey].matchedCount++;
            dateGroups[dateKey].matchedNet += item.netAmount;
          }

          const sortedDates = Object.keys(dateGroups).sort();
          for (const dateKey of sortedDates) {
            const g = dateGroups[dateKey];
            const jId = await createJournalForGroup(g.items, dateKey, nextNo++, g.matchedCount, g.unmatchedCount, g.matchedNet, g.unmatchedNet);
            if (jId) journalIds.push(jId);
          }
        } else {
          const jId = await createJournalForGroup(matchedItems, settlementData.settlementDate, nextNo, matchedOrderCount, 0, matchedNetTotal, 0);
          if (jId) journalIds.push(jId);
        }

        settleJournalId = journalIds[0] || null;

        await tx.update(ecommerceSettlements)
          .set({ settleJournalId: settleJournalId, invoiceStatus: "pending" })
          .where(eq(ecommerceSettlements.id, settlement.id));
      }

      const [finalSettlement] = await tx.select().from(ecommerceSettlements)
        .where(eq(ecommerceSettlements.id, settlement.id));
      return { ...finalSettlement, settleJournalId, matchedOrderCount, unmatchedOrderCount, journalCount: dailyGrouping ? Object.keys(items.reduce((g: Record<string, boolean>, i) => { g[i.settleDate || ""] = true; return g; }, {})).length : 1 };
    });

    res.status(201).json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Withdraw from wallet → bank
app.post("/api/ecommerce/settlement-batches/:id/withdraw", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const schema = z.object({
      withdrawnDate: z.string(),
      bankAccountCode: z.string().default("1011000"),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });

    const [settlement] = await ecomDb.select().from(ecommerceSettlements).where(eq(ecommerceSettlements.id, id));
    if (!settlement) return res.status(404).json({ message: "ไม่พบรายการ Settlement" });
    const user = req.user as any;
    const [comp] = await db.select().from(companies).where(eq(companies.id, settlement.companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    if (settlement.walletStatus === "withdrawn") return res.status(400).json({ message: "ถอนเงินแล้ว" });

    const { withdrawnDate, bankAccountCode, notes } = parsed.data;

    const result = await db.transaction(async (tx) => {
      const PLATFORM_WALLET_CODES: Record<string, string> = {
        shopee: "1041000", lazada: "1042000", tiktok: "1043000",
      };
      const walletCode = PLATFORM_WALLET_CODES[settlement.platform] || "1044000";

      const walletAcct = await tx.select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.companyId, settlement.companyId), eq(accounts.code, walletCode)));
      const bankAcct = await tx.select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.companyId, settlement.companyId), eq(accounts.code, bankAccountCode)));

      let withdrawJournalId = null;
      if (walletAcct.length > 0 && bankAcct.length > 0) {
        const [lastEntry] = await tx.select({ entryNo: journalEntries.entryNo })
          .from(journalEntries)
          .where(eq(journalEntries.companyId, settlement.companyId))
          .orderBy(desc(journalEntries.id))
          .limit(1);
        const nextNo = (lastEntry?.entryNo || 0) + 1;

        const netAmt = Math.abs(Number(settlement.netAmount));

        const [journal] = await tx.insert(journalEntries).values({
          companyId: settlement.companyId,
          entryNo: nextNo,
          date: withdrawnDate,
          reference: `WITHDRAW-${settlement.platform.toUpperCase()}-${settlement.id}`,
          description: `ถอนเงิน ${settlement.platform} Wallet → ธนาคาร`,
          journalBook: "receive",
          status: "approved",
          sourceDocType: "settlement_withdraw",
          sourceDocId: settlement.id,
        }).returning();

        withdrawJournalId = journal.id;

        await tx.insert(journalLines).values({
          journalEntryId: journal.id, lineNo: 1,
          accountId: bankAcct[0].id,
          description: `รับเงินจาก ${settlement.platform} Wallet`,
          debit: String(netAmt), credit: "0",
        });

        await tx.insert(journalLines).values({
          journalEntryId: journal.id, lineNo: 2,
          accountId: walletAcct[0].id,
          description: `ถอนเงินจาก ${settlement.platform} Wallet`,
          debit: "0", credit: String(netAmt),
        });
      }

      const [updated] = await tx.update(ecommerceSettlements).set({
        walletStatus: "withdrawn",
        withdrawnDate,
        withdrawJournalId,
        notes: notes ? (settlement.notes ? settlement.notes + "\n" + notes : notes) : settlement.notes,
      }).where(eq(ecommerceSettlements.id, id)).returning();

      return updated;
    });

    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Bulk import withdrawal records from TikTok income Excel
app.post("/api/ecommerce/withdrawal-import", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const schema = z.object({
      companyId: z.number(),
      bankAccountCode: z.string(),
      platform: z.string().default("tiktok"),
      withdrawals: z.array(z.object({
        type: z.string(),
        referenceId: z.string().min(1, "Reference ID ต้องไม่ว่าง"),
        requestTime: z.string(),
        amount: z.number().positive("จำนวนเงินต้องมากกว่า 0"),
        status: z.string(),
        successTime: z.string().min(1, "วันที่สำเร็จต้องไม่ว่าง"),
      })),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง", errors: parsed.error.errors });

    const { companyId, bankAccountCode, platform, withdrawals } = parsed.data;

    const [comp] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!comp) return res.status(404).json({ message: "ไม่พบบริษัท" });
    if (user.role !== "super_admin") {
      if (!user.tenantId || comp.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
      }
    }

    const PLATFORM_WALLET_CODES: Record<string, string> = {
      shopee: "1041000", lazada: "1042000", tiktok: "1043000",
    };
    const walletCode = PLATFORM_WALLET_CODES[platform] || "1044000";

    const results = await db.transaction(async (tx) => {
      const walletAcct = await tx.select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.companyId, companyId), eq(accounts.code, walletCode)));
      const bankAcct = await tx.select({ id: accounts.id }).from(accounts)
        .where(and(eq(accounts.companyId, companyId), eq(accounts.code, bankAccountCode)));

      if (walletAcct.length === 0) throw new Error(`ไม่พบบัญชี Wallet ${walletCode} ในผังบัญชี กรุณาสร้างก่อน`);
      if (bankAcct.length === 0) throw new Error(`ไม่พบบัญชี ${bankAccountCode} ในผังบัญชี กรุณาสร้างก่อน`);

      const created: any[] = [];

      for (const w of withdrawals) {
        if (w.status !== "Transferred") continue;

        const existingRef = `WITHDRAW-${platform.toUpperCase()}-REF-${w.referenceId}`;
        const [existing] = await tx.select({ id: journalEntries.id }).from(journalEntries)
          .where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.reference, existingRef)));
        if (existing) {
          created.push({ referenceId: w.referenceId, skipped: true, reason: "บันทึกแล้ว" });
          continue;
        }

        const [lastEntry] = await tx.select({ entryNo: journalEntries.entryNo })
          .from(journalEntries)
          .where(eq(journalEntries.companyId, companyId))
          .orderBy(desc(journalEntries.id))
          .limit(1);
        const nextNo = (lastEntry?.entryNo || 0) + 1;

        const withdrawDate = w.successTime.replace(/\//g, "-");

        const [journal] = await tx.insert(journalEntries).values({
          companyId,
          entryNo: nextNo,
          date: withdrawDate,
          reference: existingRef,
          description: `ถอนเงิน ${platform} → ธนาคาร (Ref: ${w.referenceId})`,
          journalBook: "receive",
          status: "approved",
          sourceDocType: "withdrawal_import",
        }).returning();

        await tx.insert(journalLines).values({
          journalEntryId: journal.id, lineNo: 1,
          accountId: bankAcct[0].id,
          description: `รับเงินจาก ${platform} Wallet`,
          debit: String(w.amount), credit: "0",
        });

        await tx.insert(journalLines).values({
          journalEntryId: journal.id, lineNo: 2,
          accountId: walletAcct[0].id,
          description: `ถอนเงินจาก ${platform} Wallet`,
          debit: "0", credit: String(w.amount),
        });

        created.push({ referenceId: w.referenceId, journalId: journal.id, amount: w.amount, date: withdrawDate });
      }

      return created;
    });

    const imported = results.filter((r: any) => !r.skipped);
    const skipped = results.filter((r: any) => r.skipped);

    res.json({
      message: `บันทึกสำเร็จ ${imported.length} รายการ${skipped.length > 0 ? ` (ข้าม ${skipped.length} รายการที่บันทึกแล้ว)` : ""}`,
      imported,
      skipped,
      totalAmount: imported.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0),
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Delete settlement batch
app.post("/api/ecommerce/settlement-batches/:id/record-invoice", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const schema = z.object({
      taxInvoiceNo: z.string().min(1),
      taxInvoiceDate: z.string().min(1),
      taxInvoiceAmount: z.string().or(z.number()).transform(v => Number(v)),
      taxInvoiceVat: z.string().or(z.number()).transform(v => Number(v)).default(0),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "ข้อมูลไม่ครบ", errors: parsed.error.errors });

    const { taxInvoiceNo, taxInvoiceDate, taxInvoiceAmount, taxInvoiceVat } = parsed.data;

    const [settlement] = await ecomDb.select().from(ecommerceSettlements).where(eq(ecommerceSettlements.id, id));
    if (!settlement) return res.status(404).json({ message: "ไม่พบรายการ Settlement" });

    const [comp] = await db.select().from(companies).where(eq(companies.id, settlement.companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }

    if (settlement.invoiceStatus === "received") {
      return res.status(400).json({ message: "ได้บันทึกใบกำกับภาษีแล้ว" });
    }

    const totalFees = Number(settlement.totalCommission || 0) + Number(settlement.totalServiceFee || 0) +
      Number(settlement.totalPaymentFee || 0) + Number(settlement.totalShippingCost || 0) + Number(settlement.totalOtherFees || 0);

    const variance = Math.round((taxInvoiceAmount - totalFees) * 100) / 100;
    const invoiceStatus = Math.abs(variance) < 0.01 ? "received" : "mismatch";
    const vatRatio = totalFees > 0 ? (1 - taxInvoiceVat / totalFees) : 1;

    const PLATFORM_ESTIMATED_CODES: Record<string, string> = {
      shopee: "1441100", lazada: "1441200", tiktok: "1441300",
    };
    const estimatedExpCode = PLATFORM_ESTIMATED_CODES[settlement.platform] || "1441900";
    const PLATFORM_ACTUAL_EXPENSE_CODES: Record<string, string> = {
      shopee: "5281000", lazada: "5282000", tiktok: "5283000",
    };
    const actualExpCode = PLATFORM_ACTUAL_EXPENSE_CODES[settlement.platform] || "5284000";

    const estimatedAcct = await db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.companyId, settlement.companyId), eq(accounts.code, estimatedExpCode)));
    const actualExpAcct = await db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.companyId, settlement.companyId), eq(accounts.code, actualExpCode)));
    const vatAcct = await db.select({ id: accounts.id }).from(accounts)
      .where(and(eq(accounts.companyId, settlement.companyId), sql`LENGTH(${accounts.code}) >= 7`, eq(accounts.code, "1432000")));

    if (estimatedAcct.length === 0) {
      return res.status(400).json({ message: `ไม่พบบัญชีประมาณการค่าใช้จ่าย ${settlement.platform} (${estimatedExpCode})` });
    }
    if (actualExpAcct.length === 0) {
      return res.status(400).json({ message: `ไม่พบบัญชีค่าใช้จ่ายจริง ${settlement.platform} (${actualExpCode})` });
    }

    const [lastEntry] = await db.select({ entryNo: journalEntries.entryNo })
      .from(journalEntries)
      .where(eq(journalEntries.companyId, settlement.companyId))
      .orderBy(desc(journalEntries.id))
      .limit(1);
    const nextNo = (lastEntry?.entryNo || 0) + 1;

    const [journal] = await db.insert(journalEntries).values({
      companyId: settlement.companyId,
      entryNo: nextNo,
      date: taxInvoiceDate,
      reference: `INV-${settlement.platform.toUpperCase()}-${taxInvoiceNo}`,
      description: `บันทึกใบกำกับภาษี ${settlement.platform} เลขที่ ${taxInvoiceNo} (กลับรายการค้างจ่าย)`,
      journalBook: "purchase",
      status: "approved",
      sourceDocType: "settlement_invoice",
      sourceDocId: settlement.id,
    }).returning();

    let lineNo = 1;

    const actualExpenseExVat = Math.round((taxInvoiceAmount - taxInvoiceVat) * 100) / 100;
    const tCommission = Number(settlement.totalCommission || 0);
    const tService = Number(settlement.totalServiceFee || 0);
    const tPayment = Number(settlement.totalPaymentFee || 0);
    const tShipping = Number(settlement.totalShippingCost || 0);
    const tOther = Number(settlement.totalOtherFees || 0);

    const feeBreakdown: { description: string; amount: number }[] = [];
    if (tCommission > 0) feeBreakdown.push({ description: `ค่าคอมมิชชั่น ${settlement.platform}`, amount: tCommission });
    if (tService > 0) feeBreakdown.push({ description: `ค่าบริการแพลตฟอร์ม ${settlement.platform}`, amount: tService });
    if (tPayment > 0) feeBreakdown.push({ description: `ค่าธรรมเนียมธุรกรรม ${settlement.platform}`, amount: tPayment });
    if (tShipping > 0) feeBreakdown.push({ description: `ค่าขนส่ง ${settlement.platform}`, amount: tShipping });
    if (tOther > 0) feeBreakdown.push({ description: `ค่าธรรมเนียมอื่น ${settlement.platform}`, amount: tOther });

    if (feeBreakdown.length > 0) {
      const vatRatio = totalFees > 0 ? taxInvoiceVat / totalFees : 0;
      let allocatedTotal = 0;
      for (let i = 0; i < feeBreakdown.length; i++) {
        const isLast = i === feeBreakdown.length - 1;
        const rawExVat = Math.round(feeBreakdown[i].amount * (1 - vatRatio) * 100) / 100;
        const amt = isLast ? Math.round((actualExpenseExVat - allocatedTotal) * 100) / 100 : rawExVat;
        allocatedTotal += amt;
        await db.insert(journalLines).values({
          journalEntryId: journal.id, lineNo: lineNo++,
          accountId: actualExpAcct[0].id,
          description: `${feeBreakdown[i].description} (ใบกำกับ ${taxInvoiceNo})`,
          debit: String(amt), credit: "0",
        });
      }
    } else {
      await db.insert(journalLines).values({
        journalEntryId: journal.id, lineNo: lineNo++,
        accountId: actualExpAcct[0].id,
        description: `ค่าใช้จ่าย ${settlement.platform} จริง (ใบกำกับ ${taxInvoiceNo})`,
        debit: String(actualExpenseExVat), credit: "0",
      });
    }

    if (taxInvoiceVat > 0 && vatAcct.length > 0) {
      await db.insert(journalLines).values({
        journalEntryId: journal.id, lineNo: lineNo++,
        accountId: vatAcct[0].id,
        description: `ภาษีซื้อ ใบกำกับ ${taxInvoiceNo} ${settlement.platform}`,
        debit: String(taxInvoiceVat), credit: "0",
      });
    }

    const estimatedReversal = Math.round(taxInvoiceAmount * 100) / 100;
    if (feeBreakdown.length > 0) {
      const reversalRatio = totalFees > 0 ? estimatedReversal / totalFees : 1;
      let reversalAllocated = 0;
      for (let i = 0; i < feeBreakdown.length; i++) {
        const isLast = i === feeBreakdown.length - 1;
        const rawAmt = Math.round(feeBreakdown[i].amount * reversalRatio * 100) / 100;
        const amt = isLast ? Math.round((estimatedReversal - reversalAllocated) * 100) / 100 : rawAmt;
        reversalAllocated += amt;
        await db.insert(journalLines).values({
          journalEntryId: journal.id, lineNo: lineNo++,
          accountId: estimatedAcct[0].id,
          description: `กลับรายการ${feeBreakdown[i].description} (ใบกำกับ ${taxInvoiceNo})`,
          debit: "0", credit: String(amt),
        });
      }
    } else {
      await db.insert(journalLines).values({
        journalEntryId: journal.id, lineNo: lineNo++,
        accountId: estimatedAcct[0].id,
        description: `กลับรายการประมาณการค่าใช้จ่าย ${settlement.platform} (ใบกำกับ ${taxInvoiceNo})`,
        debit: "0", credit: String(estimatedReversal),
      });
    }

    await ecomDb.update(ecommerceSettlements)
      .set({
        invoiceStatus,
        taxInvoiceNo,
        taxInvoiceDate,
        taxInvoiceAmount: String(taxInvoiceAmount),
        taxInvoiceVat: String(taxInvoiceVat),
        varianceAmount: String(variance),
        reversalJournalId: journal.id,
      })
      .where(eq(ecommerceSettlements.id, id));

    res.json({
      success: true,
      invoiceStatus,
      variance,
      reversalJournalId: journal.id,
      message: invoiceStatus === "received"
        ? "บันทึกใบกำกับภาษีเรียบร้อย"
        : `บันทึกใบกำกับภาษีเรียบร้อย (ผลต่าง ${variance.toFixed(2)} บาท)`,
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/ecommerce/settlement-batches/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [settlement] = await ecomDb.select().from(ecommerceSettlements).where(eq(ecommerceSettlements.id, id));
    if (!settlement) return res.status(404).json({ message: "ไม่พบรายการ" });
    const [comp] = await db.select().from(companies).where(eq(companies.id, settlement.companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }

    // Clear FK references first, then delete journal entries
    await ecomDb.update(ecommerceSettlements).set({
      settleJournalId: null,
      withdrawJournalId: null,
      reversalJournalId: null,
    }).where(eq(ecommerceSettlements.id, id));

    if (settlement.settleJournalId) {
      await db.delete(journalLines).where(eq(journalLines.journalEntryId, settlement.settleJournalId));
      await db.delete(journalEntries).where(eq(journalEntries.id, settlement.settleJournalId));
    }
    if (settlement.withdrawJournalId) {
      await db.delete(journalLines).where(eq(journalLines.journalEntryId, settlement.withdrawJournalId));
      await db.delete(journalEntries).where(eq(journalEntries.id, settlement.withdrawJournalId));
    }
    if (settlement.reversalJournalId) {
      await db.delete(journalLines).where(eq(journalLines.journalEntryId, settlement.reversalJournalId));
      await db.delete(journalEntries).where(eq(journalEntries.id, settlement.reversalJournalId));
    }

    // Reset matched orders
    const items = await ecomDb.select().from(ecommerceSettlementItems)
      .where(eq(ecommerceSettlementItems.settlementId, id));
    for (const item of items) {
      if (item.orderId) {
        const [resetOrder] = await ecomDb.update(ecommerceOrders).set({
          settlementStatus: "pending",
          settlementDate: null,
          settlementAmount: null,
        }).where(eq(ecommerceOrders.id, item.orderId)).returning();

        if (resetOrder?.taxInvoiceId) {
          await ecomDb.update(taxInvoices)
            .set({ paymentStatus: "unpaid" })
            .where(eq(taxInvoices.id, resetOrder.taxInvoiceId));
        }
      }
    }

    await ecomDb.delete(ecommerceSettlementItems).where(eq(ecommerceSettlementItems.settlementId, id));
    await ecomDb.delete(ecommerceSettlements).where(eq(ecommerceSettlements.id, id));

    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ SKU Smart Mapping ============

app.get("/api/ecommerce/sku-mapping/unmapped", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const platformFilter = req.query.platform as string | undefined;
    const user = req.user as any;

    const [comp] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!comp) return res.status(404).json({ message: "company not found" });
    if (user.role !== "super_admin" && comp.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const existingMappings = await ecomDb.select({
      platformSku: ecommerceProductMappings.platformSku,
    }).from(ecommerceProductMappings).where(eq(ecommerceProductMappings.companyId, companyId));
    const mappedSkus = new Set(existingMappings.map(m => m.platformSku));

    let ordersQuery = ecomDb.select({
      orderId: ecommerceOrderItems.orderId,
      platformSku: ecommerceOrderItems.platformSku,
      name: ecommerceOrderItems.name,
      qty: ecommerceOrderItems.qty,
      total: ecommerceOrderItems.total,
      productId: ecommerceOrderItems.productId,
      platform: ecommerceOrders.platform,
      placedAt: ecommerceOrders.placedAt,
    }).from(ecommerceOrderItems)
      .innerJoin(ecommerceOrders, eq(ecommerceOrderItems.orderId, ecommerceOrders.id))
      .where(eq(ecommerceOrders.companyId, companyId));

    const allItems = await ordersQuery;

    const unmappedMap = new Map<string, {
      platformSku: string; platformName: string; platform: string;
      orderIds: Set<number>; totalQty: number; totalRevenue: number;
      firstSeen: string; lastSeen: string;
    }>();

    let totalMappedItems = 0;

    for (const item of allItems) {
      if (!item.platformSku) continue;
      const sku = item.platformSku;

      if (mappedSkus.has(sku) || item.productId) {
        totalMappedItems++;
        continue;
      }

      if (platformFilter && platformFilter !== "all" && item.platform?.toLowerCase() !== platformFilter.toLowerCase()) continue;

      const key = `${sku}::${item.platform}`;
      let entry = unmappedMap.get(key);
      if (!entry) {
        entry = {
          platformSku: sku,
          platformName: item.name || sku,
          platform: item.platform || "unknown",
          orderIds: new Set(),
          totalQty: 0,
          totalRevenue: 0,
          firstSeen: item.placedAt ? new Date(item.placedAt).toISOString() : "",
          lastSeen: item.placedAt ? new Date(item.placedAt).toISOString() : "",
        };
        unmappedMap.set(key, entry);
      }
      entry.orderIds.add(item.orderId);
      entry.totalQty += parseFloat(String(item.qty)) || 0;
      entry.totalRevenue += parseFloat(String(item.total)) || 0;
      if (item.placedAt) {
        const d = new Date(item.placedAt).toISOString();
        if (d < entry.firstSeen || !entry.firstSeen) entry.firstSeen = d;
        if (d > entry.lastSeen) entry.lastSeen = d;
      }
    }

    const companyProducts = await db.select({
      id: products.id,
      code: products.code,
      name: products.name,
      barcode: products.barcode,
    }).from(products).where(eq(products.companyId, companyId));

    const unmapped = Array.from(unmappedMap.values()).map(u => {
      const suggestedProducts: { id: number; code: string; name: string; score: number }[] = [];
      for (const p of companyProducts) {
        let score = 0;
        const skuLower = u.platformSku.toLowerCase();
        const codeLower = (p.code || "").toLowerCase();
        const nameLower = (p.name || "").toLowerCase();
        const barcodeLower = (p.barcode || "").toLowerCase();
        if (codeLower === skuLower || barcodeLower === skuLower) { score = 100; }
        else if (codeLower.includes(skuLower) || skuLower.includes(codeLower)) { score = 80; }
        else if (barcodeLower && barcodeLower.includes(skuLower)) { score = 75; }
        else {
          const platWords = u.platformName.toLowerCase().split(/[\s\-\/\(\)]+/).filter(w => w.length > 2);
          const prodWords = nameLower.split(/[\s\-\/\(\)]+/).filter(w => w.length > 2);
          const matched = platWords.filter(w => prodWords.some(pw => pw.includes(w) || w.includes(pw)));
          if (matched.length > 0) score = Math.min(60, matched.length * 20);
        }
        if (score >= 40) suggestedProducts.push({ id: p.id, code: p.code || "", name: p.name, score });
      }
      suggestedProducts.sort((a, b) => b.score - a.score);
      return {
        ...u,
        orderCount: u.orderIds.size,
        totalQty: u.totalQty,
        totalRevenue: u.totalRevenue,
        suggestedProducts: suggestedProducts.slice(0, 3),
      };
    });

    unmapped.sort((a, b) => b.totalRevenue - a.totalRevenue);

    const totalUnmappedOrders = new Set(unmapped.flatMap(u => Array.from(u.orderIds || []))).size;
    res.json({
      unmapped: unmapped.map(({ orderIds, ...rest }) => rest),
      stats: {
        totalUnmapped: unmapped.length,
        totalMapped: mappedSkus.size,
        totalOrders: totalUnmappedOrders,
        totalRevenue: unmapped.reduce((s, u) => s + u.totalRevenue, 0),
      },
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/ecommerce/sku-mapping/save", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { companyId, platformSku, productId, conversionRate, platform } = req.body;
    if (!companyId || !platformSku || !productId) return res.status(400).json({ message: "Missing fields" });
    const user = req.user as any;
    const [comp] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!comp) return res.status(404).json({ message: "company not found" });
    if (user.role !== "super_admin" && comp.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const connections = await ecomDb.select().from(ecommerceConnections)
      .where(and(
        eq(ecommerceConnections.companyId, companyId),
        platform ? eq(ecommerceConnections.platform, platform) : undefined
      ));
    const connectionId = connections[0]?.id || 0;

    const existing = await ecomDb.select().from(ecommerceProductMappings).where(and(
      eq(ecommerceProductMappings.companyId, companyId),
      eq(ecommerceProductMappings.platformSku, platformSku),
    ));
    if (existing.length > 0) {
      await ecomDb.update(ecommerceProductMappings).set({
        productId,
        conversionRate: String(conversionRate || 1),
      }).where(eq(ecommerceProductMappings.id, existing[0].id));
    } else {
      await ecomDb.insert(ecommerceProductMappings).values({
        companyId,
        productId,
        connectionId: connectionId || 1,
        platformSku,
        platformProductName: platformSku,
        conversionRate: String(conversionRate || 1),
        syncStock: true,
        syncStatus: "synced",
      });
    }

    const updatedItems = await ecomDb.update(ecommerceOrderItems).set({ productId })
      .where(and(
        eq(ecommerceOrderItems.platformSku, platformSku),
        sql`${ecommerceOrderItems.orderId} IN (SELECT id FROM ecommerce_orders WHERE company_id = ${companyId})`
      )).returning();

    res.json({ success: true, updatedOrderItems: updatedItems.length });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/ecommerce/sku-mapping/create-and-map", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { companyId, platformSku, platform, product } = req.body;
    if (!companyId || !platformSku || !product?.code || !product?.name) return res.status(400).json({ message: "Missing fields" });
    const user = req.user as any;
    const [comp] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!comp) return res.status(404).json({ message: "company not found" });
    if (user.role !== "super_admin" && comp.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const existingProd = await db.select().from(products).where(and(
      eq(products.companyId, companyId),
      eq(products.code, product.code),
    ));
    if (existingProd.length > 0) return res.status(400).json({ message: `รหัสสินค้า "${product.code}" มีอยู่แล้ว` });

    const [newProd] = await db.insert(products).values({
      companyId,
      code: product.code,
      name: product.name,
      unit: product.unit || "ชิ้น",
      category: product.category || "product",
      cost: String(product.cost || 0),
      vatType: "vat7",
      productType: "simple",
      isActive: true,
    }).returning();

    const connections = await ecomDb.select().from(ecommerceConnections)
      .where(and(
        eq(ecommerceConnections.companyId, companyId),
        platform ? eq(ecommerceConnections.platform, platform) : undefined
      ));
    const connectionId = connections[0]?.id || 1;

    await ecomDb.insert(ecommerceProductMappings).values({
      companyId,
      productId: newProd.id,
      connectionId,
      platformSku,
      platformProductName: product.name,
      conversionRate: "1",
      syncStock: true,
      syncStatus: "synced",
    });

    await ecomDb.update(ecommerceOrderItems).set({ productId: newProd.id })
      .where(and(
        eq(ecommerceOrderItems.platformSku, platformSku),
        sql`${ecommerceOrderItems.orderId} IN (SELECT id FROM ecommerce_orders WHERE company_id = ${companyId})`
      ));

    res.json({ success: true, productId: newProd.id });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/ecommerce/sku-mapping/auto-match", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    const [comp] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!comp) return res.status(404).json({ message: "company not found" });
    if (user.role !== "super_admin" && comp.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const companyProds = await db.select().from(products).where(eq(products.companyId, companyId));
    const existingMappings = await ecomDb.select().from(ecommerceProductMappings).where(eq(ecommerceProductMappings.companyId, companyId));
    const mappedSkus = new Set(existingMappings.map(m => m.platformSku));

    const orderItems = await ecomDb.select({
      platformSku: ecommerceOrderItems.platformSku,
      name: ecommerceOrderItems.name,
      productId: ecommerceOrderItems.productId,
      platform: ecommerceOrders.platform,
      orderId: ecommerceOrderItems.orderId,
    }).from(ecommerceOrderItems)
      .innerJoin(ecommerceOrders, eq(ecommerceOrderItems.orderId, ecommerceOrders.id))
      .where(eq(ecommerceOrders.companyId, companyId));

    const unmappedSkuMap = new Map<string, { sku: string; platform: string }>();
    for (const item of orderItems) {
      if (!item.platformSku || mappedSkus.has(item.platformSku) || item.productId) continue;
      unmappedSkuMap.set(item.platformSku, { sku: item.platformSku, platform: item.platform || "unknown" });
    }

    let matched = 0;
    const connections = await ecomDb.select().from(ecommerceConnections).where(eq(ecommerceConnections.companyId, companyId));
    const defaultConnectionId = connections[0]?.id || 1;

    for (const [sku, info] of unmappedSkuMap) {
      const skuLower = sku.toLowerCase();
      const match = companyProds.find(p =>
        (p.code || "").toLowerCase() === skuLower ||
        (p.barcode || "").toLowerCase() === skuLower
      );
      if (!match) continue;

      const connForPlatform = connections.find(c => c.platform === info.platform);
      await ecomDb.insert(ecommerceProductMappings).values({
        companyId,
        productId: match.id,
        connectionId: connForPlatform?.id || defaultConnectionId,
        platformSku: sku,
        platformProductName: match.name,
        conversionRate: "1",
        syncStock: true,
        syncStatus: "synced",
      });

      await ecomDb.update(ecommerceOrderItems).set({ productId: match.id })
        .where(and(
          eq(ecommerceOrderItems.platformSku, sku),
          sql`${ecommerceOrderItems.orderId} IN (SELECT id FROM ecommerce_orders WHERE company_id = ${companyId})`
        ));
      matched++;
    }

    res.json({ success: true, matched });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ============ Gov Receipt Downloader ============

app.get("/api/tools/gov-receipt/clients", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;

    const boards = await db.select().from(workBoards).where(eq(workBoards.companyId, companyId));
    const clientBoard = boards.find(b => b.name === "ลูกค้าของฉัน");
    if (!clientBoard) return res.json({ clients: [] });

    const cols = await db.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, clientBoard.id));
    const colMap: Record<string, number> = {};
    for (const c of cols) {
      if (c.name === "เลขผู้เสียภาษี") colMap.taxId = c.id;
      if (c.name === "รหัสสรรพากร") colMap.rdPassword = c.id;
      if (c.name === "รหัสประกันสังคม") colMap.ssoUsername = c.id;
      if (c.name === "พาสเวิร์ดประกันสังคม") colMap.ssoPassword = c.id;
    }

    const items = await db.select().from(workBoardItems).where(eq(workBoardItems.boardId, clientBoard.id)).orderBy(workBoardItems.position);

    const clients = items.map(item => {
      let cv: Record<string, string> = {};
      try { cv = JSON.parse(item.cellValues || "{}"); } catch {}
      return {
        itemId: item.id,
        name: item.name,
        taxId: cv[String(colMap.taxId)] || "",
        rdPassword: cv[String(colMap.rdPassword)] ? "••••••" : "",
        ssoUsername: cv[String(colMap.ssoUsername)] || "",
        ssoPassword: cv[String(colMap.ssoPassword)] ? "••••••" : "",
        hasRd: !!(cv[String(colMap.taxId)] && cv[String(colMap.rdPassword)]),
        hasSso: !!(cv[String(colMap.ssoUsername)] && cv[String(colMap.ssoPassword)]),
      };
    }).filter(c => c.taxId || c.ssoUsername);

    res.json({ clients, boardId: clientBoard.id, colMap });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/tools/gov-receipt/download", requireAuth, async (req, res) => {
  try {
    const { companyId, itemId, agency, monthFrom, monthTo, year } = req.body;
    if (!companyId || !itemId || !agency) return res.status(400).json({ message: "Missing fields" });

    const boards = await db.select().from(workBoards).where(eq(workBoards.companyId, companyId));
    const clientBoard = boards.find(b => b.name === "ลูกค้าของฉัน");
    if (!clientBoard) return res.status(404).json({ message: "ไม่พบบอร์ดลูกค้า" });

    const cols = await db.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, clientBoard.id));
    const colMap: Record<string, number> = {};
    for (const c of cols) {
      if (c.name === "เลขผู้เสียภาษี") colMap.taxId = c.id;
      if (c.name === "รหัสสรรพากร") colMap.rdPassword = c.id;
      if (c.name === "รหัสประกันสังคม") colMap.ssoUsername = c.id;
      if (c.name === "พาสเวิร์ดประกันสังคม") colMap.ssoPassword = c.id;
    }

    const [item] = await db.select().from(workBoardItems).where(eq(workBoardItems.id, itemId));
    if (!item) return res.status(404).json({ message: "ไม่พบข้อมูลลูกค้า" });

    let cv: Record<string, string> = {};
    try { cv = JSON.parse(item.cellValues || "{}"); } catch {}

    const user = req.user as any;

    let result: any;
    let clientTaxId = "";

    if (agency === "rd") {
      const taxId = cv[String(colMap.taxId)];
      const password = cv[String(colMap.rdPassword)];
      if (!taxId || !password) return res.status(400).json({ message: "ไม่มีเลขผู้เสียภาษีหรือรหัสสรรพากร", success: false });
      clientTaxId = taxId;
      try {
        result = await scrapeRdReceipts(taxId, password, monthFrom, monthTo, year);
      } catch (err: any) {
        return res.json({ success: false, message: `เข้าระบบสรรพากรไม่สำเร็จ: ${err.message}` });
      }
    } else if (agency === "sso") {
      const ssoUsername = cv[String(colMap.ssoUsername)];
      const ssoPassword = cv[String(colMap.ssoPassword)];
      if (!ssoUsername || !ssoPassword) return res.status(400).json({ message: "ไม่มีรหัสประกันสังคม", success: false });
      clientTaxId = ssoUsername;
      try {
        result = await scrapeSsoReceipts(ssoUsername, ssoPassword, monthFrom, monthTo, year);
      } catch (err: any) {
        return res.json({ success: false, message: `เข้าระบบประกันสังคมไม่สำเร็จ: ${err.message}` });
      }
    } else {
      return res.status(400).json({ message: "agency ไม่ถูกต้อง" });
    }

    if (result.success && result.files && result.files.length > 0 && user.tenantId) {
      try {
        const yearBE = year + 543;
        const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
        const agencyName = agency === "rd" ? "สรรพากร" : "ประกันสังคม";

        let rootFolder = (await db.select().from(firmFolders).where(
          and(eq(firmFolders.tenantId, user.tenantId), eq(firmFolders.name, "ใบเสร็จราชการ"), isNull(firmFolders.parentId))
        ))[0];
        if (!rootFolder) {
          rootFolder = await storage.createFirmFolder({ tenantId: user.tenantId, companyId, name: "ใบเสร็จราชการ", icon: "FileText", color: "#539BFF" });
        }

        let yearFolder = (await db.select().from(firmFolders).where(
          and(eq(firmFolders.tenantId, user.tenantId), eq(firmFolders.parentId, rootFolder.id), eq(firmFolders.name, String(yearBE)))
        ))[0];
        if (!yearFolder) {
          yearFolder = await storage.createFirmFolder({ tenantId: user.tenantId, companyId, name: String(yearBE), parentId: rootFolder.id });
        }

        for (const file of result.files) {
          if (!file.data) continue;
          const filePath = file.data;
          if (!fs.existsSync(filePath)) continue;
          const fileBuffer = fs.readFileSync(filePath);
          const monthLabel = file.taxMonthYear || `${thaiMonths[monthFrom]}-${thaiMonths[monthTo]}`;

          await storage.createFirmDocument({
            tenantId: user.tenantId,
            companyId,
            folderId: yearFolder.id,
            category: agencyName,
            name: `${item.name} - ${file.formCode} ${monthLabel} (${file.docType === "TAX_FORM" ? "แบบ" : "ใบเสร็จ"})`,
            fileName: file.name,
            fileSize: fileBuffer.length,
            mimeType: "application/pdf",
            fileUrl: `/api/tools/gov-receipt/file/${clientTaxId}/${encodeURIComponent(file.name)}`,
            uploadedBy: user.id,
          });
        }
        console.log(`[Gov Receipt] Saved ${result.files.length} files to คลังเอกสาร for ${item.name}`);
      } catch (storageErr: any) {
        console.log(`[Gov Receipt] Failed to save to คลังเอกสาร: ${storageErr.message}`);
      }
    }

    return res.json(result);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/tools/gov-receipt/file/:taxId/:filename", requireAuth, (req, res) => {
  const { taxId, filename } = req.params;
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const safeTaxId = taxId.replace(/[^a-zA-Z0-9]/g, "");
  const filePath = path.join(os.tmpdir(), "gov-receipts", safeTaxId, safeFilename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "ไม่พบไฟล์" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

const GOV_RECEIPT_ACCOUNT_MAP: Record<string, { debit: string; debitName: string; credit: string; creditName: string; book: string }> = {
  "ภ.พ.30": { debit: "2310100", debitName: "ภาษีมูลค่าเพิ่ม - ภาษีขาย", credit: "1120100", creditName: "เงินฝากธนาคาร", book: "payment" },
  "ภ.ง.ด.53": { debit: "2340100", debitName: "ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย", credit: "1120100", creditName: "เงินฝากธนาคาร", book: "payment" },
  "ภ.ง.ด.3": { debit: "2340100", debitName: "ภาษีเงินได้หัก ณ ที่จ่ายค้างจ่าย", credit: "1120100", creditName: "เงินฝากธนาคาร", book: "payment" },
  "ภ.ง.ด.1": { debit: "2340200", debitName: "ภาษีเงินได้บุคคลธรรมดาค้างจ่าย", credit: "1120100", creditName: "เงินฝากธนาคาร", book: "payment" },
  "ภ.พ.36": { debit: "2310200", debitName: "ภาษีมูลค่าเพิ่มค้างจ่าย", credit: "1120100", creditName: "เงินฝากธนาคาร", book: "payment" },
  "SSO": { debit: "2350100", debitName: "เงินสมทบประกันสังคมค้างจ่าย", credit: "1120100", creditName: "เงินฝากธนาคาร", book: "payment" },
};

app.post("/api/tools/gov-receipt/journal-preview", requireAuth, async (req, res) => {
  try {
    const { companyId, formCode, taxMonthYear, refNo, amount } = req.body;
    if (!companyId || !formCode) return res.status(400).json({ message: "Missing fields" });

    const mapping = GOV_RECEIPT_ACCOUNT_MAP[formCode] || GOV_RECEIPT_ACCOUNT_MAP["ภ.พ.30"];

    const companyAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
    const debitAcc = companyAccounts.find(a => a.code === mapping.debit);
    const creditAcc = companyAccounts.find(a => a.code === mapping.credit);

    res.json({
      formCode,
      taxMonthYear,
      refNo,
      book: mapping.book,
      lines: [
        {
          accountCode: mapping.debit,
          accountName: debitAcc?.nameTh || mapping.debitName,
          debit: amount || "0.00",
          credit: "0.00",
          exists: !!debitAcc,
        },
        {
          accountCode: mapping.credit,
          accountName: creditAcc?.nameTh || mapping.creditName,
          debit: "0.00",
          credit: amount || "0.00",
          exists: !!creditAcc,
        },
      ],
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/tools/gov-receipt/journal-create", requireAuth, async (req, res) => {
  try {
    const { companyId, formCode, taxMonthYear, refNo, amount, docDate, lines, description } = req.body;
    if (!companyId || !formCode || !amount || !docDate) return res.status(400).json({ message: "กรุณาระบุข้อมูลให้ครบ" });
    const user = req.user as any;

    const mapping = GOV_RECEIPT_ACCOUNT_MAP[formCode] || GOV_RECEIPT_ACCOUNT_MAP["ภ.พ.30"];
    const bookPrefix = mapping.book === "payment" ? "JV" : "JV";
    const journalBook = mapping.book || "payment";

    const entryNo = await getNextJournalEntryNo(companyId, journalBook);

    const closedCheck = await checkClosedPeriod(companyId, docDate);
    if (closedCheck) return res.status(400).json({ message: closedCheck });

    const finalLines = lines || [
      { accountCode: mapping.debit, accountName: mapping.debitName, debit: String(amount), credit: "0" },
      { accountCode: mapping.credit, accountName: mapping.creditName, debit: "0", credit: String(amount) },
    ];

    const [entry] = await db.insert(journalEntries).values({
      companyId,
      entryNo,
      entryDate: docDate,
      journalBook,
      description: description || `ชำระภาษี ${formCode} ${taxMonthYear || ""} ref: ${refNo || ""}`.trim(),
      sourceDocType: "gov_receipt",
      sourceDocNo: refNo || formCode,
      totalDebit: String(amount),
      totalCredit: String(amount),
      status: "draft",
      createdBy: user.id,
    }).returning();

    for (let i = 0; i < finalLines.length; i++) {
      const line = finalLines[i];
      await db.insert(journalLines).values({
        journalEntryId: entry.id,
        lineNo: i + 1,
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: String(line.debit || "0"),
        credit: String(line.credit || "0"),
        description: line.description || "",
      });
    }

    await logActivity({
      companyId, userId: user.id, action: "create",
      entityType: "journal_entry", entityId: entry.id,
      description: `สร้างรายการบัญชีจากใบเสร็จราชการ ${formCode} ${taxMonthYear || ""}`,
    });

    res.json({ success: true, journalEntryId: entry.id, entryNo });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ============ Platform Credentials Management ============

app.get("/api/platform-credentials", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    if (user.role !== "super_admin" && user.role !== "admin") return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    let tenantId = user.tenantId;
    if (!tenantId && req.query.companyId) {
      const [comp] = await db.select({ tenantId: companies.tenantId }).from(companies).where(eq(companies.id, Number(req.query.companyId)));
      tenantId = comp?.tenantId;
    }
    if (!tenantId) {
      const [firstComp] = await db.select({ tenantId: companies.tenantId }).from(companies).limit(1);
      tenantId = firstComp?.tenantId;
    }
    if (!tenantId) return res.status(400).json({ message: "ไม่พบ Tenant" });

    const creds = await db.select({
      id: tenantPlatformCredentials.id,
      tenantId: tenantPlatformCredentials.tenantId,
      platform: tenantPlatformCredentials.platform,
      appId: tenantPlatformCredentials.appId,
      redirectUrl: tenantPlatformCredentials.redirectUrl,
      region: tenantPlatformCredentials.region,
      sandbox: tenantPlatformCredentials.sandbox,
      active: tenantPlatformCredentials.active,
      createdAt: tenantPlatformCredentials.createdAt,
      updatedAt: tenantPlatformCredentials.updatedAt,
    }).from(tenantPlatformCredentials)
      .where(eq(tenantPlatformCredentials.tenantId, tenantId))
      .orderBy(tenantPlatformCredentials.platform);

    const platformInfo = PLATFORM_INFO;
    res.json({ credentials: creds, platformInfo });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/platform-credentials", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    if (user.role !== "super_admin" && user.role !== "admin") return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    let tenantId = user.tenantId;
    if (!tenantId && req.body.companyId) {
      const [comp] = await db.select({ tenantId: companies.tenantId }).from(companies).where(eq(companies.id, Number(req.body.companyId)));
      tenantId = comp?.tenantId;
    }
    if (!tenantId) {
      const [firstComp] = await db.select({ tenantId: companies.tenantId }).from(companies).limit(1);
      tenantId = firstComp?.tenantId;
    }
    if (!tenantId) return res.status(400).json({ message: "ไม่พบ Tenant" });

    const schema = z.object({
      platform: z.string().min(1),
      appId: z.string().min(1, "กรุณากรอก App ID / Partner ID"),
      appSecret: z.string().min(1, "กรุณากรอก App Secret / Partner Key"),
      redirectUrl: z.string().optional(),
      region: z.string().default("TH"),
      sandbox: z.boolean().default(false),
      extra: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });

    const existing = await db.select().from(tenantPlatformCredentials)
      .where(and(eq(tenantPlatformCredentials.tenantId, tenantId), eq(tenantPlatformCredentials.platform, parsed.data.platform)));
    if (existing.length > 0) return res.status(400).json({ message: `มี credentials ของ ${parsed.data.platform} อยู่แล้ว กรุณาแก้ไขแทน` });

    const [cred] = await db.insert(tenantPlatformCredentials).values({
      tenantId,
      ...parsed.data,
    }).returning();

    res.status(201).json(cred);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/platform-credentials/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    if (user.role !== "super_admin" && user.role !== "admin") return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    const id = Number(req.params.id);

    const [existing] = await db.select().from(tenantPlatformCredentials).where(eq(tenantPlatformCredentials.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบ credentials" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    if (user.role !== "super_admin" && existing.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const updateData: any = { updatedAt: new Date() };
    if (req.body.appId) updateData.appId = req.body.appId;
    if (req.body.appSecret) updateData.appSecret = req.body.appSecret;
    if (req.body.redirectUrl !== undefined) updateData.redirectUrl = req.body.redirectUrl;
    if (req.body.region) updateData.region = req.body.region;
    if (req.body.sandbox !== undefined) updateData.sandbox = req.body.sandbox;
    if (req.body.active !== undefined) updateData.active = req.body.active;
    if (req.body.extra !== undefined) updateData.extra = req.body.extra;

    const [updated] = await db.update(tenantPlatformCredentials).set(updateData).where(eq(tenantPlatformCredentials.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/platform-credentials/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    if (user.role !== "super_admin" && user.role !== "admin") return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    const id = Number(req.params.id);

    const [existing] = await db.select().from(tenantPlatformCredentials).where(eq(tenantPlatformCredentials.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบ credentials" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    if (user.role !== "super_admin" && existing.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    await db.delete(tenantPlatformCredentials).where(eq(tenantPlatformCredentials.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ OAuth Flow ============

app.get("/api/ecommerce/oauth/:platform/start", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const platform = req.params.platform;
    const companyId = Number(req.query.companyId);
    const connectionId = req.query.connectionId ? Number(req.query.connectionId) : undefined;
    const shopId = req.query.shopId as string | undefined;

    if (!companyId) return res.status(400).json({ message: "companyId required" });

    const adapter = getAdapter(platform);
    if (!adapter) return res.status(400).json({ message: `ไม่รองรับแพลตฟอร์ม: ${platform}` });
    if (!adapter.supportsOAuth) return res.status(400).json({ message: `${platform} ไม่รองรับ OAuth` });

    let tenantId = user.tenantId;
    if (!tenantId) {
      const [comp] = await db.select({ tenantId: companies.tenantId }).from(companies).where(eq(companies.id, companyId));
      tenantId = comp?.tenantId;
    }
    if (!tenantId) return res.status(400).json({ message: "ไม่พบ Tenant" });

    const [cred] = await db.select().from(tenantPlatformCredentials)
      .where(and(
        eq(tenantPlatformCredentials.tenantId, tenantId),
        eq(tenantPlatformCredentials.platform, platform),
        eq(tenantPlatformCredentials.active, true),
      ));

    if (!cred) return res.status(400).json({ message: `ยังไม่ได้ตั้งค่า credentials ของ ${PLATFORM_INFO[platform]?.name || platform} กรุณาตั้งค่าก่อน` });

    const state = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await ecomDb.insert(oauthStates).values({
      state,
      tenantId,
      companyId,
      platform,
      userId: user.id,
      connectionId: connectionId || null,
      expiresAt,
    });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const credentials: PlatformCredentials = {
      appId: cred.appId,
      appSecret: cred.appSecret,
      redirectUrl: cred.redirectUrl || `${baseUrl}/api/ecommerce/oauth/${platform}/callback`,
      region: cred.region || "TH",
      sandbox: cred.sandbox || false,
      extra: cred.extra ? JSON.parse(cred.extra) : { baseUrl },
    };

    const authUrl = adapter.getAuthUrl(credentials, state, shopId);
    res.json({ authUrl, state });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/oauth/:platform/callback", async (req, res) => {
  try {
    const platform = req.params.platform;
    const code = req.query.code as string;
    const state = req.query.state as string;
    const shopId = req.query.shop_id as string || req.query.shopId as string;

    if (!code || !state) return res.status(400).send("Missing code or state");

    const [oauthState] = await ecomDb.select().from(oauthStates).where(eq(oauthStates.state, state));
    if (!oauthState) return res.status(400).send("Invalid state - expired or already used");
    if (new Date() > oauthState.expiresAt) {
      await ecomDb.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));
      return res.status(400).send("OAuth state expired");
    }
    if (oauthState.platform !== platform) return res.status(400).send("Platform mismatch");

    const adapter = getAdapter(platform);
    if (!adapter) return res.status(400).send(`Unsupported platform: ${platform}`);

    const [cred] = await db.select().from(tenantPlatformCredentials)
      .where(and(
        eq(tenantPlatformCredentials.tenantId, oauthState.tenantId),
        eq(tenantPlatformCredentials.platform, platform),
        eq(tenantPlatformCredentials.active, true),
      ));

    if (!cred) return res.status(400).send("Platform credentials not found");

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const credentials: PlatformCredentials = {
      appId: cred.appId,
      appSecret: cred.appSecret,
      redirectUrl: cred.redirectUrl || `${baseUrl}/api/ecommerce/oauth/${platform}/callback`,
      region: cred.region || "TH",
      sandbox: cred.sandbox || false,
      extra: cred.extra ? JSON.parse(cred.extra) : { baseUrl },
    };

    const tokenResult = await adapter.exchangeToken(credentials, code, shopId);

    const tokenExpiresAt = new Date(Date.now() + (tokenResult.expiresIn || 3600) * 1000);

    if (oauthState.connectionId) {
      await ecomDb.update(ecommerceConnections).set({
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        tokenExpiresAt,
        status: "connected",
        shopId: tokenResult.shopId || shopId || undefined,
        shopName: tokenResult.shopName || undefined,
        settings: tokenResult.extra ? JSON.stringify(tokenResult.extra) : undefined,
        lastSyncAt: new Date(),
      }).where(eq(ecommerceConnections.id, oauthState.connectionId));
    } else {
      await ecomDb.insert(ecommerceConnections).values({
        companyId: oauthState.companyId,
        platform,
        shopName: tokenResult.shopName || `${PLATFORM_INFO[platform]?.name || platform} Shop`,
        shopId: tokenResult.shopId || shopId || "",
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        tokenExpiresAt,
        status: "connected",
        settings: tokenResult.extra ? JSON.stringify(tokenResult.extra) : null,
      });
    }

    await ecomDb.delete(oauthStates).where(eq(oauthStates.id, oauthState.id));

    res.redirect(`/ecommerce/connections?oauth=success&platform=${platform}`);
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    res.redirect(`/ecommerce/connections?oauth=error&message=${encodeURIComponent(err.message)}`);
  }
});

app.post("/api/ecommerce/connections/:id/refresh-token", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [conn] = await ecomDb.select().from(ecommerceConnections).where(eq(ecommerceConnections.id, id));
    if (!conn) return res.status(404).json({ message: "ไม่พบการเชื่อมต่อ" });

    const [comp] = await db.select().from(companies).where(eq(companies.id, conn.companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    if (!conn.refreshToken) return res.status(400).json({ message: "ไม่มี refresh token" });

    const adapter = getAdapter(conn.platform);
    if (!adapter) return res.status(400).json({ message: `ไม่รองรับแพลตฟอร์ม: ${conn.platform}` });

    const tenantId = comp?.tenantId;
    if (!tenantId) return res.status(400).json({ message: "ไม่พบ Tenant" });

    const [cred] = await db.select().from(tenantPlatformCredentials)
      .where(and(
        eq(tenantPlatformCredentials.tenantId, tenantId),
        eq(tenantPlatformCredentials.platform, conn.platform),
        eq(tenantPlatformCredentials.active, true),
      ));

    if (!cred) return res.status(400).json({ message: "ไม่พบ credentials" });

    const credentials: PlatformCredentials = {
      appId: cred.appId,
      appSecret: cred.appSecret,
      region: cred.region || "TH",
      sandbox: cred.sandbox || false,
      extra: cred.extra ? JSON.parse(cred.extra) : {},
    };

    const tokenResult = await adapter.refreshToken(credentials, conn.refreshToken, conn.shopId || undefined);
    const tokenExpiresAt = new Date(Date.now() + (tokenResult.expiresIn || 3600) * 1000);

    const [updated] = await ecomDb.update(ecommerceConnections).set({
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken || conn.refreshToken,
      tokenExpiresAt,
      status: "connected",
    }).where(eq(ecommerceConnections.id, id)).returning();

    res.json({ success: true, expiresAt: tokenExpiresAt });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Platform Sync API ============

app.post("/api/ecommerce/connections/:id/sync", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const syncType = req.body.type || "orders";
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;
    const page = req.body.page || 1;
    const pageSize = req.body.pageSize || 50;

    const [conn] = await ecomDb.select().from(ecommerceConnections).where(eq(ecommerceConnections.id, id));
    if (!conn) return res.status(404).json({ message: "ไม่พบการเชื่อมต่อ" });
    if (conn.status !== "connected") return res.status(400).json({ message: "การเชื่อมต่อยังไม่พร้อม กรุณาเชื่อมต่อใหม่" });
    if (!conn.accessToken) return res.status(400).json({ message: "ไม่มี access token" });

    const [comp] = await db.select().from(companies).where(eq(companies.id, conn.companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const adapter = getAdapter(conn.platform);
    if (!adapter) return res.status(400).json({ message: `ไม่รองรับแพลตฟอร์ม: ${conn.platform}` });

    const tenantId = comp?.tenantId;
    if (!tenantId) return res.status(400).json({ message: "ไม่พบ Tenant" });

    const [cred] = await db.select().from(tenantPlatformCredentials)
      .where(and(
        eq(tenantPlatformCredentials.tenantId, tenantId),
        eq(tenantPlatformCredentials.platform, conn.platform),
        eq(tenantPlatformCredentials.active, true),
      ));

    if (!cred) return res.status(400).json({ message: "ไม่พบ credentials" });

    const credentials: PlatformCredentials = {
      appId: cred.appId,
      appSecret: cred.appSecret,
      region: cred.region || "TH",
      sandbox: cred.sandbox || false,
      extra: cred.extra ? JSON.parse(cred.extra) : {},
    };

    const options = { startDate, endDate, page, pageSize };
    let result: any;

    switch (syncType) {
      case "orders":
        result = await adapter.getOrders(credentials, conn.accessToken, conn.shopId || "", options);
        break;
      case "returns":
        result = await adapter.getReturns(credentials, conn.accessToken, conn.shopId || "", options);
        break;
      case "cancellations":
        result = await adapter.getCancellations(credentials, conn.accessToken, conn.shopId || "", options);
        break;
      case "settlements":
        result = await adapter.getSettlements(credentials, conn.accessToken, conn.shopId || "", options);
        break;
      case "finance":
        result = await adapter.getFinanceReport(credentials, conn.accessToken, conn.shopId || "", options);
        break;
      default:
        return res.status(400).json({ message: `ไม่รองรับประเภท sync: ${syncType}` });
    }

    await ecomDb.update(ecommerceConnections).set({ lastSyncAt: new Date() }).where(eq(ecommerceConnections.id, id));

    await ecomDb.insert(syncLogs).values({
      connectionId: id,
      companyId: conn.companyId,
      platform: conn.platform,
      syncType,
      status: "completed",
      recordsProcessed: Array.isArray(result?.data) ? result.data.length : (result ? 1 : 0),
      startedAt: new Date(),
      completedAt: new Date(),
    });

    res.json({
      success: true,
      syncType,
      platform: conn.platform,
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/ecommerce/connections/:id/logistics/:orderId", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const orderId = req.params.orderId;

    const [conn] = await ecomDb.select().from(ecommerceConnections).where(eq(ecommerceConnections.id, id));
    if (!conn) return res.status(404).json({ message: "ไม่พบการเชื่อมต่อ" });
    if (!conn.accessToken) return res.status(400).json({ message: "ไม่มี access token" });

    const [comp] = await db.select().from(companies).where(eq(companies.id, conn.companyId));
    if (user.role !== "super_admin" && comp?.tenantId && comp.tenantId !== user.tenantId)
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const adapter = getAdapter(conn.platform);
    if (!adapter) return res.status(400).json({ message: `ไม่รองรับ: ${conn.platform}` });

    const tenantId = comp?.tenantId;
    if (!tenantId) return res.status(400).json({ message: "ไม่พบ Tenant" });

    const [cred] = await db.select().from(tenantPlatformCredentials)
      .where(and(
        eq(tenantPlatformCredentials.tenantId, tenantId),
        eq(tenantPlatformCredentials.platform, conn.platform),
        eq(tenantPlatformCredentials.active, true),
      ));

    if (!cred) return res.status(400).json({ message: "ไม่พบ credentials" });

    const credentials: PlatformCredentials = {
      appId: cred.appId,
      appSecret: cred.appSecret,
      region: cred.region || "TH",
      sandbox: cred.sandbox || false,
      extra: cred.extra ? JSON.parse(cred.extra) : {},
    };

    const logistics = await adapter.getLogistics(credentials, conn.accessToken, conn.shopId || "", orderId);
    if (!logistics) return res.status(404).json({ message: "ไม่พบข้อมูลขนส่ง" });
    res.json(logistics);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/platform-info", requireAuth, async (_req, res) => {
  const platforms = getAllAdapters().map(a => ({
    platform: a.platform,
    displayName: a.displayName,
    supportsOAuth: a.supportsOAuth,
    supportsManualConnect: a.supportsManualConnect,
    info: PLATFORM_INFO[a.platform] || {},
  }));
  res.json(platforms);
});

app.get("/api/ecommerce/product-mappings", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const connectionId = req.query.connectionId ? Number(req.query.connectionId) : undefined;
    const mappings = await storage.getEcommerceProductMappings(companyId, connectionId);
    res.json(mappings);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/product-mappings", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const mapping = await storage.createEcommerceProductMapping(req.body);
    res.status(201).json(mapping);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/ecommerce/product-mappings/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const deleted = await storage.deleteEcommerceProductMapping(Number(req.params.id));
    if (!deleted) return res.status(404).json({ message: "ไม่พบ mapping" });
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/mapping-stats", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const allProducts = await storage.getProducts(companyId);
    const activeProducts = allProducts.filter((p: any) => p.active);
    const mappings = await storage.getEcommerceProductMappings(companyId);
    const mappedProductIds = new Set(mappings.map((m: any) => m.productId));
    const unmappedProducts = activeProducts.filter((p: any) => !mappedProductIds.has(p.id));

    const connections = await storage.getEcommerceConnections(companyId);
    const mappingsByConnection: Record<number, number> = {};
    mappings.forEach((m: any) => { mappingsByConnection[m.connectionId] = (mappingsByConnection[m.connectionId] || 0) + 1; });

    const platformStats = connections.map((conn: any) => ({
      connectionId: conn.id,
      platform: conn.platform,
      shopName: conn.shopName,
      status: conn.status,
      totalMappings: mappingsByConnection[conn.id] || 0,
      lastSyncAt: conn.lastSyncAt,
    }));

    let stockData: any[] = [];
    try {
      stockData = await storage.getProductStock(companyId);
    } catch (e) { /* inventory module may not be available */ }

    const stockByProductId: Record<number, number> = {};
    stockData.forEach((s: any) => { stockByProductId[s.productId] = Number(s.quantity || 0); });

    const mappedWithStock = mappings.map((m: any) => {
      const product = activeProducts.find((p: any) => p.id === m.productId);
      return {
        ...m,
        productCode: product?.code || "",
        productName: product?.name || "",
        stockOnHand: stockByProductId[m.productId] ?? null,
      };
    });

    res.json({
      totalProducts: activeProducts.length,
      totalMappings: mappings.length,
      mappedProducts: mappedProductIds.size,
      unmappedCount: unmappedProducts.length,
      unmappedProducts: unmappedProducts.slice(0, 20).map((p: any) => ({
        id: p.id, code: p.code, name: p.name, unit: p.unit, price: p.price,
      })),
      platformStats,
      mappedWithStock,
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Analytics ============

app.get("/api/ecommerce/analytics", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const period = (req.query.period as string) || "30d";
    const now = new Date();
    let startDate = new Date();
    if (period === "7d") startDate.setDate(now.getDate() - 7);
    else if (period === "30d") startDate.setDate(now.getDate() - 30);
    else if (period === "90d") startDate.setDate(now.getDate() - 90);
    else if (period === "365d") startDate.setDate(now.getDate() - 365);
    else startDate.setDate(now.getDate() - 30);

    const allOrders = await ecomDb.select().from(ecommerceOrders)
      .where(and(
        eq(ecommerceOrders.companyId, companyId),
        gte(ecommerceOrders.placedAt, startDate),
        sql`${ecommerceOrders.platform} NOT IN ('grab_food', 'line_man', 'robinhood')`,
      ));

    const totalRevenue = allOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const totalFees = allOrders.reduce((s, o) => s + Number(o.commissionFee || 0) + Number(o.serviceFee || 0) + Number(o.paymentFee || 0), 0);
    const totalNetIncome = allOrders.reduce((s, o) => s + Number(o.netIncome || 0), 0);
    const totalOrders = allOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const platformStats: Record<string, { orders: number; revenue: number; fees: number; netIncome: number }> = {};
    allOrders.forEach(o => {
      if (!platformStats[o.platform]) platformStats[o.platform] = { orders: 0, revenue: 0, fees: 0, netIncome: 0 };
      platformStats[o.platform].orders++;
      platformStats[o.platform].revenue += Number(o.totalAmount || 0);
      platformStats[o.platform].fees += Number(o.commissionFee || 0) + Number(o.serviceFee || 0) + Number(o.paymentFee || 0);
      platformStats[o.platform].netIncome += Number(o.netIncome || 0);
    });

    const dailySales: Record<string, { date: string; revenue: number; orders: number; netIncome: number }> = {};
    allOrders.forEach(o => {
      const d = o.placedAt ? new Date(o.placedAt).toISOString().slice(0, 10) : "unknown";
      if (!dailySales[d]) dailySales[d] = { date: d, revenue: 0, orders: 0, netIncome: 0 };
      dailySales[d].revenue += Number(o.totalAmount || 0);
      dailySales[d].orders++;
      dailySales[d].netIncome += Number(o.netIncome || 0);
    });

    const orderItems = await ecomDb.select().from(ecommerceOrderItems)
      .where(inArray(ecommerceOrderItems.orderId, allOrders.map(o => o.id).length > 0 ? allOrders.map(o => o.id) : [0]));

    const productSales: Record<string, { name: string; qty: number; revenue: number; count: number }> = {};
    orderItems.forEach(item => {
      const key = item.name || "unknown";
      if (!productSales[key]) productSales[key] = { name: key, qty: 0, revenue: 0, count: 0 };
      productSales[key].qty += Number(item.qty || 0);
      productSales[key].revenue += Number(item.total || 0);
      productSales[key].count++;
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    const statusCounts: Record<string, number> = {};
    allOrders.forEach(o => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });

    res.json({
      summary: { totalOrders, totalRevenue, totalFees, totalNetIncome, avgOrderValue },
      platformStats,
      dailySales: Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date)),
      topProducts,
      statusCounts,
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Multi-Warehouse ============

app.get("/api/warehouses", requireAuth, requireAnyModule("ecommerce", "inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const result = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId)).orderBy(desc(warehouses.isDefault), asc(warehouses.code));
    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/warehouses", requireAuth, requireAnyModule("ecommerce", "inventory"), async (req, res) => {
  try {
    const warehouseSchema = z.object({
      companyId: z.number().int().positive(),
      code: z.string().min(1),
      name: z.string().min(1),
      address: z.string().optional(),
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
      isDefault: z.boolean().optional(),
    });
    const parsed = warehouseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });
    const data = parsed.data;
    if (data.isDefault) {
      await db.update(warehouses).set({ isDefault: false }).where(eq(warehouses.companyId, data.companyId));
    }
    const [created] = await db.insert(warehouses).values(data).returning();
    res.json(created);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/warehouses/:id", requireAuth, requireAnyModule("ecommerce", "inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = req.body;
    if (data.isDefault) {
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, id));
      if (wh) await db.update(warehouses).set({ isDefault: false }).where(eq(warehouses.companyId, wh.companyId));
    }
    const [updated] = await db.update(warehouses).set(data).where(eq(warehouses.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/warehouses/:id", requireAuth, requireAnyModule("ecommerce", "inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(warehouses).where(eq(warehouses.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/warehouses/:id/stock", requireAuth, requireAnyModule("ecommerce", "inventory"), async (req, res) => {
  try {
    const warehouseId = Number(req.params.id);
    const levels = await db.select().from(warehouseStockLevels).where(eq(warehouseStockLevels.warehouseId, warehouseId));
    const productIds = levels.map(l => l.productId);
    let prods: any[] = [];
    if (productIds.length > 0) {
      prods = await db.select().from(products).where(inArray(products.id, productIds));
    }
    const prodMap: Record<number, any> = {};
    prods.forEach(p => { prodMap[p.id] = p; });
    const result = levels.map(l => ({
      ...l,
      productCode: prodMap[l.productId]?.code || "",
      productName: prodMap[l.productId]?.name || "",
      unit: prodMap[l.productId]?.unit || "ชิ้น",
    }));
    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/stock-transfers", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const transfers = await db.select().from(stockTransfers).where(eq(stockTransfers.companyId, companyId)).orderBy(desc(stockTransfers.createdAt));
    const whList = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));
    const whMap: Record<number, string> = {};
    whList.forEach(w => { whMap[w.id] = w.name; });
    const result = transfers.map(t => ({
      ...t,
      fromWarehouseName: whMap[t.fromWarehouseId] || "",
      toWarehouseName: whMap[t.toWarehouseId] || "",
    }));
    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/stock-transfers", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const transferSchema = z.object({
      companyId: z.number().int().positive(),
      transferNo: z.string().min(1),
      fromWarehouseId: z.number().int().positive(),
      toWarehouseId: z.number().int().positive(),
      notes: z.string().optional(),
      items: z.array(z.object({
        productId: z.number().int().positive(),
        productCode: z.string().optional(),
        productName: z.string().min(1),
        quantity: z.string().or(z.number()),
        unit: z.string().optional(),
      })).min(1, "กรุณาเพิ่มรายการสินค้า"),
    });
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });
    const { items, ...transferData } = parsed.data as any;
    const user = req.user as any;
    transferData.createdBy = user.id;
    const [transfer] = await db.insert(stockTransfers).values(transferData).returning();
    if (items && items.length > 0) {
      const itemsWithTransferId = items.map((item: any) => ({ ...item, transferId: transfer.id }));
      await db.insert(stockTransferItems).values(itemsWithTransferId);
    }
    res.json(transfer);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/stock-transfers/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
    if (!transfer) return res.status(404).json({ message: "ไม่พบรายการโอนสต๊อก" });
    const items = await db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));
    res.json({ ...transfer, items });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/stock-transfers/:id/approve", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
    if (!transfer) return res.status(404).json({ message: "ไม่พบรายการ" });
    if (transfer.status === "completed") return res.status(400).json({ message: "รายการนี้อนุมัติแล้ว" });
    const items = await db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));

    const updated = await db.transaction(async (tx) => {
      for (const item of items) {
        const [fromLevel] = await tx.select().from(warehouseStockLevels)
          .where(and(eq(warehouseStockLevels.warehouseId, transfer.fromWarehouseId), eq(warehouseStockLevels.productId, item.productId)));
        if (fromLevel) {
          const newQty = Number(fromLevel.quantity) - Number(item.quantity);
          if (newQty < 0) throw new Error(`สต๊อกไม่เพียงพอสำหรับสินค้า ${item.productName}`);
          await tx.update(warehouseStockLevels)
            .set({ quantity: String(newQty) })
            .where(eq(warehouseStockLevels.id, fromLevel.id));
        } else {
          throw new Error(`ไม่พบสต๊อกสินค้า ${item.productName} ในคลังต้นทาง`);
        }

        const [toLevel] = await tx.select().from(warehouseStockLevels)
          .where(and(eq(warehouseStockLevels.warehouseId, transfer.toWarehouseId), eq(warehouseStockLevels.productId, item.productId)));
        if (toLevel) {
          await tx.update(warehouseStockLevels)
            .set({ quantity: String(Number(toLevel.quantity) + Number(item.quantity)) })
            .where(eq(warehouseStockLevels.id, toLevel.id));
        } else {
          await tx.insert(warehouseStockLevels).values({
            warehouseId: transfer.toWarehouseId,
            productId: item.productId,
            companyId: transfer.companyId,
            quantity: String(item.quantity),
          });
        }
      }

      const [result] = await tx.update(stockTransfers)
        .set({ status: "completed", approvedBy: user.id, completedAt: new Date() })
        .where(eq(stockTransfers.id, id))
        .returning();
      return result;
    });

    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Fulfillment ============

app.get("/api/fulfillment/batches", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const batches = await db.select().from(fulfillmentBatches).where(eq(fulfillmentBatches.companyId, companyId)).orderBy(desc(fulfillmentBatches.createdAt));
    res.json(batches);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/fulfillment/batches", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const batchSchema = z.object({
      companyId: z.number().int().positive(),
      orderIds: z.array(z.number().int().positive()).min(1, "กรุณาเลือกออเดอร์"),
      warehouseId: z.number().int().positive().optional(),
    });
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });
    const user = req.user as any;
    const { orderIds, warehouseId, companyId } = parsed.data;
    const batchNo = `FL-${Date.now().toString(36).toUpperCase()}`;
    const [batch] = await db.insert(fulfillmentBatches).values({
      companyId, batchNo, warehouseId, totalOrders: orderIds.length, createdBy: user.id,
    }).returning();

    const itemsToInsert = orderIds.map((orderId: number) => ({
      batchId: batch.id, orderId, status: "pending",
    }));
    await db.insert(fulfillmentItems).values(itemsToInsert);
    res.json(batch);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/fulfillment/batches/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [batch] = await db.select().from(fulfillmentBatches).where(eq(fulfillmentBatches.id, id));
    if (!batch) return res.status(404).json({ message: "ไม่พบแบทช์" });
    const items = await db.select().from(fulfillmentItems).where(eq(fulfillmentItems.batchId, id));
    const orderIds = items.map(i => i.orderId);
    let orders: any[] = [];
    if (orderIds.length > 0) {
      orders = await ecomDb.select().from(ecommerceOrders).where(inArray(ecommerceOrders.id, orderIds));
    }
    const orderMap: Record<number, any> = {};
    orders.forEach(o => { orderMap[o.id] = o; });
    const enrichedItems = items.map(i => ({
      ...i,
      order: orderMap[i.orderId] || null,
    }));
    res.json({ ...batch, items: enrichedItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/fulfillment/items/:id/pick", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [updated] = await db.update(fulfillmentItems)
      .set({ status: "picked", pickedAt: new Date(), pickedBy: user.id })
      .where(eq(fulfillmentItems.id, id))
      .returning();
    if (updated) {
      const pickedCount = await db.select({ count: sql<number>`count(*)` }).from(fulfillmentItems)
        .where(and(eq(fulfillmentItems.batchId, updated.batchId), inArray(fulfillmentItems.status, ["picked", "packed", "shipped"])));
      await db.update(fulfillmentBatches).set({ pickedCount: Number(pickedCount[0]?.count || 0), status: "picking" }).where(eq(fulfillmentBatches.id, updated.batchId));
    }
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/fulfillment/items/:id/pack", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [updated] = await db.update(fulfillmentItems)
      .set({ status: "packed", packedAt: new Date(), packedBy: user.id })
      .where(eq(fulfillmentItems.id, id))
      .returning();
    if (updated) {
      const packedCount = await db.select({ count: sql<number>`count(*)` }).from(fulfillmentItems)
        .where(and(eq(fulfillmentItems.batchId, updated.batchId), inArray(fulfillmentItems.status, ["packed", "shipped"])));
      await db.update(fulfillmentBatches).set({ packedCount: Number(packedCount[0]?.count || 0), status: "packing" }).where(eq(fulfillmentBatches.id, updated.batchId));
    }
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/fulfillment/items/:id/ship", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { trackingNo, shippingProvider } = req.body;
    const [updated] = await db.update(fulfillmentItems)
      .set({ status: "shipped", shippedAt: new Date(), trackingNo, shippingProvider })
      .where(eq(fulfillmentItems.id, id))
      .returning();
    if (updated) {
      const shippedCount = await db.select({ count: sql<number>`count(*)` }).from(fulfillmentItems)
        .where(and(eq(fulfillmentItems.batchId, updated.batchId), eq(fulfillmentItems.status, "shipped")));
      const totalCount = await db.select({ count: sql<number>`count(*)` }).from(fulfillmentItems)
        .where(eq(fulfillmentItems.batchId, updated.batchId));
      const shipped = Number(shippedCount[0]?.count || 0);
      const total = Number(totalCount[0]?.count || 0);
      await db.update(fulfillmentBatches)
        .set({ shippedCount: shipped, status: shipped >= total ? "completed" : "shipping", ...(shipped >= total ? { completedAt: new Date() } : {}) })
        .where(eq(fulfillmentBatches.id, updated.batchId));

      if (updated.orderId) {
        await ecomDb.update(ecommerceOrders)
          .set({ trackingNo, shippingProvider, status: "shipping", shippedAt: new Date() })
          .where(eq(ecommerceOrders.id, updated.orderId));
      }
    }
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/fulfillment/items/:id/deliver", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const { lat, lng, signature, receiverName } = req.body || {};
    if (!signature) return res.status(400).json({ message: "กรุณาลงลายเซ็นรับสินค้า" });
    const [updated] = await db.update(fulfillmentItems)
      .set({
        status: "delivered", deliveredAt: new Date(), deliveredBy: user.id,
        deliveryGpsLat: lat ? String(lat) : null, deliveryGpsLng: lng ? String(lng) : null,
        receiverSignature: signature, receiverName: receiverName || null,
      })
      .where(eq(fulfillmentItems.id, id))
      .returning();
    if (updated && updated.orderId) {
      await ecomDb.update(ecommerceOrders)
        .set({ status: "delivered" })
        .where(eq(ecommerceOrders.id, updated.orderId));
    }
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Delivery Hub - Unified View ============

app.get("/api/delivery-hub", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const statusFilter = req.query.status as string || "all";

    const pendingDeliveries: any[] = [];

    const dnConditions: any[] = [eq(deliveryNotes.companyId, companyId)];
    if (statusFilter === "pending") dnConditions.push(inArray(deliveryNotes.status, ["confirmed", "delivering"]));
    else if (statusFilter === "delivered") dnConditions.push(eq(deliveryNotes.status, "delivered"));
    const dns = await db.select().from(deliveryNotes).where(and(...dnConditions)).orderBy(desc(deliveryNotes.createdAt)).limit(100);
    for (const dn of dns) {
      pendingDeliveries.push({
        id: dn.id, module: "accounting", type: "delivery_note",
        docNo: dn.deliveryNo, date: dn.deliveryDate,
        from: "สำนักงาน", to: dn.customerName || "ลูกค้า",
        address: dn.deliveryAddress, status: dn.status,
        driverName: dn.driverName,
        hasGps: !!(dn.deliveryGpsLat), hasSignature: !!(dn.signatureDataUrl),
        gpsLat: dn.deliveryGpsLat, gpsLng: dn.deliveryGpsLng,
        signature: dn.signatureDataUrl, receiverName: dn.signedByName,
        createdAt: dn.createdAt,
      });
    }

    const stConditions: any[] = [eq(stockTransfers.companyId, companyId)];
    if (statusFilter === "pending") stConditions.push(inArray(stockTransfers.status, ["approved", "shipped"]));
    else if (statusFilter === "delivered") stConditions.push(eq(stockTransfers.status, "delivered"));
    const sts = await db.select().from(stockTransfers).where(and(...stConditions)).orderBy(desc(stockTransfers.createdAt)).limit(100);
    const whIds = [...new Set(sts.flatMap(s => [s.fromWarehouseId, s.toWarehouseId]))];
    const whs = whIds.length > 0 ? await db.select().from(warehouses).where(inArray(warehouses.id, whIds)) : [];
    const whMap: Record<number, string> = {};
    for (const w of whs) whMap[w.id] = w.name;
    for (const st of sts) {
      pendingDeliveries.push({
        id: st.id, module: "pos", type: "stock_transfer",
        docNo: st.transferNo, date: st.createdAt,
        from: whMap[st.fromWarehouseId] || "คลัง", to: whMap[st.toWarehouseId] || "สาขา",
        status: st.status,
        hasGps: !!(st.shipGpsLat || st.receiveGpsLat), hasSignature: !!(st.receiverSignature),
        gpsLat: st.receiveGpsLat || st.shipGpsLat, gpsLng: st.receiveGpsLng || st.shipGpsLng,
        signature: st.receiverSignature, receiverName: st.receiverName,
        createdAt: st.createdAt,
      });
    }

    const fbConditions: any[] = [];
    const companyBatches = await db.select().from(fulfillmentBatches).where(eq(fulfillmentBatches.companyId, companyId));
    if (companyBatches.length > 0) {
      const batchIds = companyBatches.map(b => b.id);
      const fiConditions: any[] = [inArray(fulfillmentItems.batchId, batchIds)];
      if (statusFilter === "pending") fiConditions.push(eq(fulfillmentItems.status, "shipped"));
      else if (statusFilter === "delivered") fiConditions.push(eq(fulfillmentItems.status, "delivered"));
      const fis = await db.select().from(fulfillmentItems).where(and(...fiConditions)).limit(100);
      const orderIds = fis.map(f => f.orderId).filter(Boolean);
      const orders = orderIds.length > 0 ? await ecomDb.select().from(ecommerceOrders).where(inArray(ecommerceOrders.id, orderIds)) : [];
      const orderMap: Record<number, any> = {};
      for (const o of orders) orderMap[o.id] = o;
      for (const fi of fis) {
        const order = fi.orderId ? orderMap[fi.orderId] : null;
        pendingDeliveries.push({
          id: fi.id, module: "ecommerce", type: "fulfillment",
          docNo: order?.orderNo || fi.trackingNo || `#${fi.id}`, date: fi.shippedAt,
          from: "คลังสินค้า", to: order?.customerName || "ลูกค้า",
          address: order?.shippingAddress,
          trackingNo: fi.trackingNo, shippingProvider: fi.shippingProvider,
          status: fi.status,
          hasGps: !!(fi.deliveryGpsLat), hasSignature: !!(fi.receiverSignature),
          gpsLat: fi.deliveryGpsLat, gpsLng: fi.deliveryGpsLng,
          signature: fi.receiverSignature, receiverName: fi.receiverName,
          createdAt: fi.shippedAt,
        });
      }
    }

    pendingDeliveries.sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    });

    res.json(pendingDeliveries);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ============ Sync Logs ============

app.get("/api/ecommerce/sync-logs", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const logs = await ecomDb.select().from(syncLogs).where(eq(syncLogs.companyId, companyId)).orderBy(desc(syncLogs.startedAt)).limit(100);
    res.json(logs);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/sync/trigger", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { companyId, connectionId, platform } = req.body;
    const [log] = await ecomDb.insert(syncLogs).values({
      companyId, connectionId, platform, syncType: "orders", status: "running",
    }).returning();

    setTimeout(async () => {
      await ecomDb.update(syncLogs)
        .set({ status: "completed", completedAt: new Date(), totalRecords: 0, newRecords: 0, updatedRecords: 0 })
        .where(eq(syncLogs.id, log.id));
    }, 2000);

    res.json({ message: "เริ่มซิงค์ข้อมูลแล้ว", log });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/ecommerce/connections/:id/sync-settings", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { settings } = req.body;
    const [updated] = await ecomDb.update(ecommerceConnections)
      .set({ settings: JSON.stringify(settings) })
      .where(eq(ecommerceConnections.id, id))
      .returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Platform Chat (Unified Inbox) ============

app.get("/api/ecommerce/chat/unread-total", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.json({ count: 0 });
    const result = await ecomDb.select({ total: sql<number>`COALESCE(SUM(${platformChatThreads.unreadCount}), 0)` })
      .from(platformChatThreads)
      .where(eq(platformChatThreads.companyId, companyId));
    res.json({ count: Number(result[0]?.total || 0) });
  } catch (err: any) { res.json({ count: 0 }); }
});

app.get("/api/ecommerce/chat/threads", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const platform = req.query.platform as string;
    let query = ecomDb.select().from(platformChatThreads).where(eq(platformChatThreads.companyId, companyId));
    const threads = platform
      ? await ecomDb.select().from(platformChatThreads).where(and(eq(platformChatThreads.companyId, companyId), eq(platformChatThreads.platform, platform))).orderBy(desc(platformChatThreads.lastMessageAt))
      : await ecomDb.select().from(platformChatThreads).where(eq(platformChatThreads.companyId, companyId)).orderBy(desc(platformChatThreads.lastMessageAt));
    res.json(threads);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/chat/threads/:id/messages", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const threadId = Number(req.params.id);
    const messages = await db.select().from(platformChatMessages).where(eq(platformChatMessages.threadId, threadId)).orderBy(asc(platformChatMessages.createdAt));
    await ecomDb.update(platformChatThreads).set({ unreadCount: 0 }).where(eq(platformChatThreads.id, threadId));
    res.json(messages);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/chat/threads/:id/messages", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const threadId = Number(req.params.id);
    const user = req.user as any;
    const { content } = req.body;
    const [msg] = await db.insert(platformChatMessages).values({
      threadId, senderType: "seller", senderName: user.fullName, content, messageType: "text",
    }).returning();
    await ecomDb.update(platformChatThreads).set({ lastMessage: content, lastMessageAt: new Date() }).where(eq(platformChatThreads.id, threadId));
    res.json(msg);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ API Keys & Public Order API ============

app.get("/api/api-keys", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    const keys = await db.select({
      id: apiKeys.id,
      companyId: apiKeys.companyId,
      keyName: apiKeys.keyName,
      keyPrefix: apiKeys.keyPrefix,
      permissions: apiKeys.permissions,
      status: apiKeys.status,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    }).from(apiKeys).where(eq(apiKeys.companyId, companyId)).orderBy(desc(apiKeys.createdAt));
    res.json(keys);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/api-keys", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const schema = z.object({
      companyId: z.number().int().positive(),
      keyName: z.string().min(1, "กรุณาระบุชื่อ API Key"),
      permissions: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });
    const user = req.user as any;
    const [company] = await db.select().from(companies).where(eq(companies.id, parsed.data.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์สร้าง API Key สำหรับบริษัทนี้" });
    }
    const { randomBytes } = await import("crypto");
    const rawKey = `etx_${randomBytes(32).toString("hex")}`;
    const keyPrefix = rawKey.substring(0, 12) + "...";
    const [key] = await db.insert(apiKeys).values({
      companyId: parsed.data.companyId,
      keyName: parsed.data.keyName,
      apiKey: rawKey,
      keyPrefix,
      permissions: parsed.data.permissions || "orders:write",
      createdBy: user.id,
    }).returning();
    res.json({ ...key, fullKey: rawKey });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/api-keys/:id/revoke", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    if (!key) return res.status(404).json({ message: "ไม่พบ API Key" });
    const [company] = await db.select().from(companies).where(eq(companies.id, key.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์ยกเลิก API Key นี้" });
    }
    const [updated] = await db.update(apiKeys).set({ status: "revoked" }).where(eq(apiKeys.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/api-keys/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    if (!key) return res.status(404).json({ message: "ไม่พบ API Key" });
    const [company] = await db.select().from(companies).where(eq(companies.id, key.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์ลบ API Key นี้" });
    }
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Public API - receives orders from external websites (authenticated via API key header)
app.post("/api/public/v1/orders", async (req, res) => {
  try {
    const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
    if (!authHeader) return res.status(401).json({ error: "API key required", message: "กรุณาระบุ API Key ใน header X-API-Key" });

    const [key] = await db.select().from(apiKeys).where(and(eq(apiKeys.apiKey, String(authHeader)), eq(apiKeys.status, "active")));
    if (!key) return res.status(401).json({ error: "Invalid API key", message: "API Key ไม่ถูกต้องหรือถูกยกเลิกแล้ว" });
    if (key.expiresAt && key.expiresAt < new Date()) return res.status(401).json({ error: "API key expired", message: "API Key หมดอายุแล้ว" });

    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));

    const orderSchema = z.object({
      orderNo: z.string().min(1, "กรุณาระบุเลขที่ออเดอร์"),
      buyerName: z.string().optional(),
      buyerPhone: z.string().optional(),
      buyerAddress: z.string().optional(),
      subtotal: z.union([z.string(), z.number()]).transform(String).optional(),
      shippingFee: z.union([z.string(), z.number()]).transform(String).optional(),
      discount: z.union([z.string(), z.number()]).transform(String).optional(),
      totalAmount: z.union([z.string(), z.number()]).transform(String).optional(),
      paymentMethod: z.string().optional(),
      trackingNo: z.string().optional(),
      shippingProvider: z.string().optional(),
      currency: z.string().default("THB"),
      status: z.enum(["pending", "confirmed", "shipping", "delivered", "cancelled"]).default("pending"),
      notes: z.string().optional(),
      placedAt: z.string().optional(),
      items: z.array(z.object({
        name: z.string().min(1),
        sku: z.string().optional(),
        qty: z.union([z.string(), z.number()]).transform(String).default("1"),
        price: z.union([z.string(), z.number()]).transform(String).default("0"),
        discount: z.union([z.string(), z.number()]).transform(String).optional(),
        total: z.union([z.string(), z.number()]).transform(String).optional(),
      })).optional(),
    });

    const parsed = orderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    const data = parsed.data;

    // Find or create a "website" connection for this company
    let [conn] = await ecomDb.select().from(ecommerceConnections)
      .where(and(eq(ecommerceConnections.companyId, key.companyId), eq(ecommerceConnections.platform, "website")));
    if (!conn) {
      [conn] = await ecomDb.insert(ecommerceConnections).values({
        companyId: key.companyId,
        platform: "website",
        shopName: "เว็บไซต์ของฉัน",
        status: "connected",
      }).returning();
    }

    // Check for duplicate order
    const [existing] = await ecomDb.select().from(ecommerceOrders)
      .where(and(
        eq(ecommerceOrders.companyId, key.companyId),
        eq(ecommerceOrders.platformOrderId, data.orderNo),
        eq(ecommerceOrders.platform, "website"),
      ));
    if (existing) return res.status(409).json({ error: "Duplicate order", message: `ออเดอร์ ${data.orderNo} มีในระบบแล้ว`, orderId: existing.id });

    const result = await db.transaction(async (tx) => {
      const [order] = await tx.insert(ecommerceOrders).values({
        companyId: key.companyId,
        connectionId: conn.id,
        platform: "website",
        platformOrderId: data.orderNo,
        orderNo: data.orderNo,
        status: data.status,
        buyerName: data.buyerName,
        buyerPhone: data.buyerPhone,
        buyerAddress: data.buyerAddress,
        subtotal: data.subtotal || "0",
        shippingFee: data.shippingFee || "0",
        sellerDiscount: data.discount || "0",
        totalAmount: data.totalAmount || "0",
        paymentMethod: data.paymentMethod,
        trackingNo: data.trackingNo,
        shippingProvider: data.shippingProvider,
        currency: data.currency,
        notes: data.notes,
        placedAt: data.placedAt ? new Date(data.placedAt) : new Date(),
        rawData: JSON.stringify(req.body),
      }).returning();

      if (data.items && data.items.length > 0) {
        const orderItems = data.items.map(item => ({
          orderId: order.id,
          name: item.name,
          platformSku: item.sku || "",
          qty: item.qty,
          price: item.price,
          discount: item.discount || "0",
          total: item.total || String(Number(item.qty) * Number(item.price)),
        }));
        await tx.insert(ecommerceOrderItems).values(orderItems);
      }
      return order;
    });

    res.status(201).json({
      success: true,
      orderId: result.id,
      orderNo: result.orderNo,
      message: `สร้างออเดอร์ ${result.orderNo} สำเร็จ`,
    });
  } catch (err: any) { res.status(500).json({ error: "Server error", message: err.message }); }
});

// Public API - bulk order import
app.post("/api/public/v1/orders/bulk", async (req, res) => {
  try {
    const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
    if (!authHeader) return res.status(401).json({ error: "API key required" });

    const [key] = await db.select().from(apiKeys).where(and(eq(apiKeys.apiKey, String(authHeader)), eq(apiKeys.status, "active")));
    if (!key) return res.status(401).json({ error: "Invalid API key" });
    if (key.expiresAt && key.expiresAt < new Date()) return res.status(401).json({ error: "API key expired" });

    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));

    const bulkSchema = z.object({
      orders: z.array(z.object({
        orderNo: z.string().min(1),
        buyerName: z.string().optional(),
        buyerPhone: z.string().optional(),
        buyerAddress: z.string().optional(),
        subtotal: z.union([z.string(), z.number()]).transform(String).optional(),
        shippingFee: z.union([z.string(), z.number()]).transform(String).optional(),
        discount: z.union([z.string(), z.number()]).transform(String).optional(),
        totalAmount: z.union([z.string(), z.number()]).transform(String).optional(),
        paymentMethod: z.string().optional(),
        currency: z.string().default("THB"),
        status: z.enum(["pending", "confirmed", "shipping", "delivered", "cancelled"]).default("pending"),
        notes: z.string().optional(),
        placedAt: z.string().optional(),
        items: z.array(z.object({
          name: z.string().min(1),
          sku: z.string().optional(),
          qty: z.union([z.string(), z.number()]).transform(String).default("1"),
          price: z.union([z.string(), z.number()]).transform(String).default("0"),
        })).optional(),
      })).min(1).max(100),
    });

    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Validation failed", details: parsed.error.issues });

    let [conn] = await ecomDb.select().from(ecommerceConnections)
      .where(and(eq(ecommerceConnections.companyId, key.companyId), eq(ecommerceConnections.platform, "website")));
    if (!conn) {
      [conn] = await ecomDb.insert(ecommerceConnections).values({
        companyId: key.companyId, platform: "website", shopName: "เว็บไซต์ของฉัน", status: "connected",
      }).returning();
    }

    const results: Array<{ orderNo: string; success: boolean; orderId?: number; error?: string }> = [];

    for (const orderData of parsed.data.orders) {
      try {
        const [existing] = await ecomDb.select().from(ecommerceOrders)
          .where(and(eq(ecommerceOrders.companyId, key.companyId), eq(ecommerceOrders.platformOrderId, orderData.orderNo), eq(ecommerceOrders.platform, "website")));
        if (existing) {
          results.push({ orderNo: orderData.orderNo, success: false, error: "duplicate" });
          continue;
        }

        const [order] = await ecomDb.insert(ecommerceOrders).values({
          companyId: key.companyId, connectionId: conn.id, platform: "website",
          platformOrderId: orderData.orderNo, orderNo: orderData.orderNo,
          status: orderData.status, buyerName: orderData.buyerName, buyerPhone: orderData.buyerPhone,
          buyerAddress: orderData.buyerAddress, subtotal: orderData.subtotal || "0",
          shippingFee: orderData.shippingFee || "0", sellerDiscount: orderData.discount || "0",
          totalAmount: orderData.totalAmount || "0", paymentMethod: orderData.paymentMethod,
          currency: orderData.currency, notes: orderData.notes,
          placedAt: orderData.placedAt ? new Date(orderData.placedAt) : new Date(),
          rawData: JSON.stringify(orderData),
        }).returning();

        if (orderData.items && orderData.items.length > 0) {
          await ecomDb.insert(ecommerceOrderItems).values(orderData.items.map(item => ({
            orderId: order.id, name: item.name, platformSku: item.sku || "",
            qty: item.qty, price: item.price, total: String(Number(item.qty) * Number(item.price)),
          })));
        }

        results.push({ orderNo: orderData.orderNo, success: true, orderId: order.id });
      } catch (e: any) {
        results.push({ orderNo: orderData.orderNo, success: false, error: e.message });
      }
    }

    res.status(201).json({
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (err: any) { res.status(500).json({ error: "Server error", message: err.message }); }
});

// ============ Facebook Chat Orders ============

app.get("/api/facebook/pages", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    const pages = await db.select({
      id: facebookPages.id,
      companyId: facebookPages.companyId,
      pageId: facebookPages.pageId,
      pageName: facebookPages.pageName,
      profilePicUrl: facebookPages.profilePicUrl,
      status: facebookPages.status,
      lastSyncAt: facebookPages.lastSyncAt,
      autoCreateOrders: facebookPages.autoCreateOrders,
      cfKeywords: facebookPages.cfKeywords,
      createdAt: facebookPages.createdAt,
    }).from(facebookPages).where(eq(facebookPages.companyId, companyId)).orderBy(desc(facebookPages.createdAt));
    res.json(pages);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/facebook/pages", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const schema = z.object({
      companyId: z.number().int().positive(),
      pageId: z.string().min(1, "กรุณาระบุ Page ID"),
      pageName: z.string().min(1, "กรุณาระบุชื่อเพจ"),
      pageAccessToken: z.string().optional(),
      cfKeywords: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });
    const user = req.user as any;
    const [company] = await db.select().from(companies).where(eq(companies.id, parsed.data.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const [page] = await ecomDb.insert(facebookPages).values({
      ...parsed.data,
      status: parsed.data.pageAccessToken ? "connected" : "pending",
      createdBy: user.id,
    }).returning();
    res.json(page);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/facebook/pages/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [page] = await ecomDb.select().from(facebookPages).where(eq(facebookPages.id, id));
    if (!page) return res.status(404).json({ message: "ไม่พบเพจ" });
    const [company] = await db.select().from(companies).where(eq(companies.id, page.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const updateData: any = {};
    if (req.body.pageName) updateData.pageName = req.body.pageName;
    if (req.body.pageAccessToken !== undefined) {
      updateData.pageAccessToken = req.body.pageAccessToken;
      updateData.status = req.body.pageAccessToken ? "connected" : "pending";
    }
    if (req.body.cfKeywords) updateData.cfKeywords = req.body.cfKeywords;
    if (req.body.autoCreateOrders !== undefined) updateData.autoCreateOrders = req.body.autoCreateOrders;
    const [updated] = await ecomDb.update(facebookPages).set(updateData).where(eq(facebookPages.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/facebook/pages/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [page] = await ecomDb.select().from(facebookPages).where(eq(facebookPages.id, id));
    if (!page) return res.status(404).json({ message: "ไม่พบเพจ" });
    const [company] = await db.select().from(companies).where(eq(companies.id, page.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    await ecomDb.delete(facebookChatOrders).where(eq(facebookChatOrders.pageId, id));
    await ecomDb.delete(facebookPages).where(eq(facebookPages.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Fetch conversations from Facebook Graph API
app.post("/api/facebook/pages/:id/sync", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [page] = await ecomDb.select().from(facebookPages).where(eq(facebookPages.id, id));
    if (!page) return res.status(404).json({ message: "ไม่พบเพจ" });
    const [company] = await db.select().from(companies).where(eq(companies.id, page.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    if (!page.pageAccessToken) return res.status(400).json({ message: "กรุณาเชื่อมต่อ Facebook ก่อน (ต้องมี Page Access Token)" });

    const cfKeywordsList = (page.cfKeywords || "CF,cf").split(",").map(k => k.trim());
    const graphUrl = `https://graph.facebook.com/v19.0/${page.pageId}/conversations?fields=participants,messages.limit(20){message,from,created_time}&access_token=${page.pageAccessToken}`;
    
    const fbRes = await fetch(graphUrl);
    if (!fbRes.ok) {
      const errData = await fbRes.json().catch(() => ({}));
      return res.status(400).json({ message: `Facebook API error: ${(errData as any)?.error?.message || fbRes.statusText}` });
    }
    const fbData = await fbRes.json() as any;
    const conversations = fbData.data || [];
    
    let newOrders = 0;
    for (const conv of conversations) {
      const messages = conv.messages?.data || [];
      const cfMessages = messages.filter((m: any) => {
        const text = (m.message || "").toLowerCase();
        return cfKeywordsList.some(kw => text.includes(kw.toLowerCase()));
      });
      
      if (cfMessages.length === 0) continue;
      
      const sender = cfMessages[0]?.from;
      if (!sender) continue;
      
      const [existing] = await ecomDb.select().from(facebookChatOrders)
        .where(and(eq(facebookChatOrders.companyId, page.companyId), eq(facebookChatOrders.conversationId, conv.id)));
      if (existing) continue;
      
      const rawMsgText = cfMessages.map((m: any) => `[${m.from?.name || ""}] ${m.message}`).join("\n");
      const parsed = parseCfMessages(cfMessages.map((m: any) => m.message || ""), cfKeywordsList);
      
      await ecomDb.insert(facebookChatOrders).values({
        companyId: page.companyId,
        pageId: page.id,
        conversationId: conv.id,
        senderName: sender.name || "ลูกค้า",
        senderId: sender.id,
        rawMessages: rawMsgText,
        parsedProducts: JSON.stringify(parsed.products),
        totalAmount: String(parsed.totalAmount),
        status: "pending",
        messageDate: cfMessages[0]?.created_time ? new Date(cfMessages[0].created_time) : new Date(),
      });
      newOrders++;
    }
    
    await ecomDb.update(facebookPages).set({ lastSyncAt: new Date() }).where(eq(facebookPages.id, id));
    res.json({ success: true, newOrders, totalConversations: conversations.length });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Manual paste chat messages for CF parsing
app.post("/api/facebook/parse-messages", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const schema = z.object({
      companyId: z.number().int().positive(),
      pageId: z.number().int().positive(),
      senderName: z.string().min(1, "กรุณาระบุชื่อลูกค้า"),
      messages: z.string().min(1, "กรุณาวางข้อความ"),
      senderPhone: z.string().optional(),
      senderAddress: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });
    
    const user = req.user as any;
    const [company] = await db.select().from(companies).where(eq(companies.id, parsed.data.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const [page] = await ecomDb.select().from(facebookPages).where(eq(facebookPages.id, parsed.data.pageId));
    if (!page) return res.status(404).json({ message: "ไม่พบเพจ" });
    if (page.companyId !== parsed.data.companyId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    
    const cfKeywordsList = (page.cfKeywords || "CF,cf").split(",").map(k => k.trim());
    const lines = parsed.data.messages.split("\n").filter(l => l.trim());
    const result = parseCfMessages(lines, cfKeywordsList);
    
    const [chatOrder] = await ecomDb.insert(facebookChatOrders).values({
      companyId: parsed.data.companyId,
      pageId: parsed.data.pageId,
      senderName: parsed.data.senderName,
      rawMessages: parsed.data.messages,
      parsedProducts: JSON.stringify(result.products),
      totalAmount: String(result.totalAmount),
      status: "pending",
      notes: parsed.data.senderPhone ? `โทร: ${parsed.data.senderPhone}` : undefined,
      messageDate: new Date(),
    }).returning();
    
    res.json({ ...chatOrder, products: result.products });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Get facebook chat orders list
app.get("/api/facebook/chat-orders", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    const pageIdFilter = req.query.pageId ? Number(req.query.pageId) : undefined;
    const statusFilter = req.query.status as string | undefined;
    
    let conditions = [eq(facebookChatOrders.companyId, companyId)];
    if (pageIdFilter) conditions.push(eq(facebookChatOrders.pageId, pageIdFilter));
    if (statusFilter) conditions.push(eq(facebookChatOrders.status, statusFilter));
    
    const orders = await ecomDb.select().from(facebookChatOrders)
      .where(and(...conditions))
      .orderBy(desc(facebookChatOrders.createdAt));
    
    // Join page names for display
    const allPages = await ecomDb.select({ id: facebookPages.id, pageName: facebookPages.pageName }).from(facebookPages).where(eq(facebookPages.companyId, companyId));
    const pageMap: Record<number, string> = {};
    allPages.forEach(p => { pageMap[p.id] = p.pageName; });
    
    const enriched = orders.map(o => ({ ...o, pageName: pageMap[o.pageId] || "" }));
    res.json(enriched);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Confirm chat order -> change to pending_payment (waiting for slip)
app.post("/api/facebook/chat-orders/:id/confirm", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [chatOrder] = await ecomDb.select().from(facebookChatOrders).where(eq(facebookChatOrders.id, id));
    if (!chatOrder) return res.status(404).json({ message: "ไม่พบรายการ" });
    const [company] = await db.select().from(companies).where(eq(companies.id, chatOrder.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    if (chatOrder.status === "confirmed") return res.status(400).json({ message: "ออเดอร์นี้ยืนยันแล้ว" });

    const [updated] = await ecomDb.update(facebookChatOrders).set({
      status: "pending_payment",
      paymentStatus: "pending",
    }).where(eq(facebookChatOrders.id, id)).returning();

    res.json({ success: true, status: "pending_payment", order: updated });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Reject/skip a chat order
app.patch("/api/facebook/chat-orders/:id/reject", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [chatOrder] = await ecomDb.select().from(facebookChatOrders).where(eq(facebookChatOrders.id, id));
    if (!chatOrder) return res.status(404).json({ message: "ไม่พบรายการ" });
    const [company] = await db.select().from(companies).where(eq(companies.id, chatOrder.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const [updated] = await ecomDb.update(facebookChatOrders)
      .set({ status: "rejected", notes: req.body.reason || "ปฏิเสธ" })
      .where(eq(facebookChatOrders.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "ไม่พบรายการ" });
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Upload payment slip + AI auto-verify for Facebook chat orders
const slipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.post("/api/facebook/chat-orders/:id/upload-slip", requireAuth, requireModule("ecommerce"), slipUpload.single("slip"), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [chatOrder] = await ecomDb.select().from(facebookChatOrders).where(eq(facebookChatOrders.id, id));
    if (!chatOrder) return res.status(404).json({ message: "ไม่พบรายการ" });
    const [company] = await db.select().from(companies).where(eq(companies.id, chatOrder.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }

    if (!req.file) return res.status(400).json({ message: "กรุณาอัพโหลดรูปสลิป" });

    const fileBuffer = req.file.buffer as Buffer;
    const base64Image = fileBuffer.toString("base64");
    const mimeType = req.file.mimetype || "image/jpeg";

    const { saveBufferLocally } = await import("../replit_integrations/object_storage/routes");
    const { objectPath } = saveBufferLocally(fileBuffer, mimeType, req.file.originalname);

    const orderAmount = Number(chatOrder.totalAmount) || 0;

    let aiResult: { amount: number; bank: string; ref: string; date: string; match: boolean; note: string } = {
      amount: 0, bank: "", ref: "", date: "", match: false, note: "ไม่สามารถอ่านสลิปได้"
    };

    try {
      if (!openai) throw new Error("OpenAI API key not configured");
      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        max_completion_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `คุณเป็น AI ตรวจสอบสลิปโอนเงินธนาคารไทย อ่านข้อมูลจากรูปสลิปแล้วตอบกลับเป็น JSON เท่านั้น
ห้ามอธิบาย ตอบ JSON เพียงอย่างเดียว:
{"amount": ยอดเงินที่โอน(ตัวเลข), "bank": "ชื่อธนาคารผู้โอน", "ref": "เลขอ้างอิง/transaction ID", "date": "วันที่โอน dd/mm/yyyy", "confidence": "high/medium/low"}
ถ้าอ่านไม่ได้ ให้ตอบ {"amount": 0, "bank": "", "ref": "", "date": "", "confidence": "low"}`
          },
          {
            role: "user",
            content: [
              { type: "text", text: `กรุณาอ่านสลิปโอนเงินนี้ ยอดออเดอร์คือ ${orderAmount.toLocaleString()} บาท` },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
            ]
          }
        ],
      });

      const aiText = response.choices[0]?.message?.content || "";
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const slipAmount = Number(parsed.amount) || 0;
        const tolerance = orderAmount * 0.02;
        const amountMatch = Math.abs(slipAmount - orderAmount) <= tolerance;

        aiResult = {
          amount: slipAmount,
          bank: parsed.bank || "",
          ref: parsed.ref || "",
          date: parsed.date || "",
          match: amountMatch,
          note: amountMatch
            ? `ยอดตรงกัน (สลิป: ฿${slipAmount.toLocaleString()} / ออเดอร์: ฿${orderAmount.toLocaleString()})`
            : `ยอดไม่ตรง (สลิป: ฿${slipAmount.toLocaleString()} / ออเดอร์: ฿${orderAmount.toLocaleString()}) ความเชื่อมั่น: ${parsed.confidence || "unknown"}`,
        };
      }
    } catch (aiErr: any) {
      console.error("AI slip verification error:", aiErr.message);
      aiResult.note = `AI อ่านสลิปไม่สำเร็จ: ${aiErr.message}`;
    }

    const newPaymentStatus = aiResult.match ? "verified" : "needs_review";
    const newStatus = aiResult.match ? "confirmed" : chatOrder.status;

    const updateData: any = {
      paymentSlipUrl: objectPath,
      paymentAmount: String(aiResult.amount),
      paymentBank: aiResult.bank,
      paymentRef: aiResult.ref,
      paymentDate: aiResult.date,
      paymentStatus: newPaymentStatus,
      paymentVerifyNote: aiResult.note,
      paymentVerifiedAt: aiResult.match ? new Date() : null,
    };
    if (aiResult.match) {
      updateData.status = "confirmed";
    }

    const [updated] = await ecomDb.update(facebookChatOrders)
      .set(updateData)
      .where(eq(facebookChatOrders.id, id)).returning();

    if (aiResult.match && chatOrder.status === "pending") {
      try {
        const products: Array<{ name: string; qty: number; price: number }> = JSON.parse(chatOrder.parsedProducts || "[]");
        let [conn] = await ecomDb.select().from(ecommerceConnections)
          .where(and(eq(ecommerceConnections.companyId, chatOrder.companyId), eq(ecommerceConnections.platform, "facebook")));
        if (!conn) {
          [conn] = await ecomDb.insert(ecommerceConnections).values({
            companyId: chatOrder.companyId, platform: "facebook", shopName: "Facebook Page", status: "connected",
          }).returning();
        }
        const orderNo = `FB-${Date.now().toString(36).toUpperCase()}`;
        const totalAmount = products.reduce((sum, p) => sum + (p.qty * p.price), 0);

        await db.transaction(async (tx) => {
          const [order] = await tx.insert(ecommerceOrders).values({
            companyId: chatOrder.companyId,
            connectionId: conn.id,
            platform: "facebook",
            platformOrderId: chatOrder.conversationId || orderNo,
            orderNo,
            status: "confirmed",
            buyerName: chatOrder.senderName,
            totalAmount: String(totalAmount),
            subtotal: String(totalAmount),
            placedAt: chatOrder.messageDate || new Date(),
            rawData: chatOrder.rawMessages,
          }).returning();

          if (products.length > 0) {
            await tx.insert(ecommerceOrderItems).values(products.map(p => ({
              orderId: order.id,
              name: p.name,
              qty: String(p.qty),
              price: String(p.price),
              total: String(p.qty * p.price),
            })));
          }

          await tx.update(facebookChatOrders).set({
            ecommerceOrderId: order.id,
          }).where(eq(facebookChatOrders.id, id));
        });
      } catch (orderErr: any) {
        console.error("Auto-create order after slip verify error:", orderErr.message);
      }
    }

    res.json({
      ...updated,
      verification: aiResult,
    });
  } catch (err: any) {
    console.error("Slip upload error:", err.message);
    res.status(400).json({ message: err.message });
  }
});

// Manual payment verification (for admin override)
app.patch("/api/facebook/chat-orders/:id/verify-payment", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [chatOrder] = await ecomDb.select().from(facebookChatOrders).where(eq(facebookChatOrders.id, id));
    if (!chatOrder) return res.status(404).json({ message: "ไม่พบรายการ" });
    const [company] = await db.select().from(companies).where(eq(companies.id, chatOrder.companyId));
    if (!company || (user.role !== "super_admin" && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }

    const { action } = req.body;
    if (action === "approve") {
      const [updated] = await ecomDb.update(facebookChatOrders)
        .set({ paymentStatus: "verified", paymentVerifiedAt: new Date(), paymentVerifyNote: "ยืนยันโดยผู้ดูแล", status: "confirmed" })
        .where(eq(facebookChatOrders.id, id)).returning();

      if (chatOrder.status === "pending" && !chatOrder.ecommerceOrderId) {
        try {
          const products: Array<{ name: string; qty: number; price: number }> = JSON.parse(chatOrder.parsedProducts || "[]");
          let [conn] = await ecomDb.select().from(ecommerceConnections)
            .where(and(eq(ecommerceConnections.companyId, chatOrder.companyId), eq(ecommerceConnections.platform, "facebook")));
          if (!conn) {
            [conn] = await ecomDb.insert(ecommerceConnections).values({
              companyId: chatOrder.companyId, platform: "facebook", shopName: "Facebook Page", status: "connected",
            }).returning();
          }
          const orderNo = `FB-${Date.now().toString(36).toUpperCase()}`;
          const totalAmount = products.reduce((sum, p) => sum + (p.qty * p.price), 0);

          await db.transaction(async (tx) => {
            const [order] = await tx.insert(ecommerceOrders).values({
              companyId: chatOrder.companyId,
              connectionId: conn.id,
              platform: "facebook",
              platformOrderId: chatOrder.conversationId || orderNo,
              orderNo,
              status: "confirmed",
              buyerName: chatOrder.senderName,
              totalAmount: String(totalAmount),
              subtotal: String(totalAmount),
              placedAt: chatOrder.messageDate || new Date(),
              rawData: chatOrder.rawMessages,
            }).returning();

            if (products.length > 0) {
              await tx.insert(ecommerceOrderItems).values(products.map(p => ({
                orderId: order.id,
                name: p.name,
                qty: String(p.qty),
                price: String(p.price),
                total: String(p.qty * p.price),
              })));
            }

            await tx.update(facebookChatOrders).set({
              ecommerceOrderId: order.id,
            }).where(eq(facebookChatOrders.id, id));
          });
        } catch (orderErr: any) {
          console.error("Auto-create order after manual verify error:", orderErr.message);
        }
      }

      res.json(updated);
    } else if (action === "reject") {
      const [updated] = await ecomDb.update(facebookChatOrders)
        .set({ paymentStatus: "rejected", paymentVerifyNote: req.body.reason || "สลิปไม่ถูกต้อง" })
        .where(eq(facebookChatOrders.id, id)).returning();
      res.json(updated);
    } else {
      return res.status(400).json({ message: "กรุณาระบุ action: approve หรือ reject" });
    }
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// CF message parsing helper function
function parseCfMessages(messages: string[], cfKeywords: string[]): { products: Array<{ name: string; qty: number; price: number }>; totalAmount: number } {
  const products: Array<{ name: string; qty: number; price: number }> = [];
  
  for (const msg of messages) {
    const lines = msg.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Pattern: CF สินค้า จำนวน ราคา (various formats)
      // "CF เสื้อยืด 2 ตัว 250"
      // "cf1 สินค้าA x3"
      // "สั่ง เสื้อขาว 2 ตัว"
      // "CF เสื้อยืดสีขาว 250 บาท 2 ตัว"
      
      const isCf = cfKeywords.some(kw => trimmed.toLowerCase().includes(kw.toLowerCase()));
      if (!isCf) continue;
      
      // Remove CF keyword prefix
      let cleaned = trimmed;
      for (const kw of cfKeywords) {
        const regex = new RegExp(`${kw}\\d*\\s*`, "gi");
        cleaned = cleaned.replace(regex, "").trim();
      }
      
      if (!cleaned) continue;
      
      // Try to extract qty and price
      let qty = 1;
      let price = 0;
      let name = cleaned;
      
      // Extract quantity patterns: x3, 3ตัว, 3 ชิ้น, จำนวน 3
      const qtyPatterns = [
        /[xX×](\d+)/,
        /(\d+)\s*(?:ตัว|ชิ้น|อัน|ชุด|กล่อง|แพ็ค|คู่|ถุง|ขวด|เซ็ต|รายการ|จำนวน)/,
        /จำนวน\s*(\d+)/,
      ];
      for (const pat of qtyPatterns) {
        const m = cleaned.match(pat);
        if (m) {
          qty = parseInt(m[1]) || 1;
          name = cleaned.replace(m[0], "").trim();
          break;
        }
      }
      
      // Extract price patterns: 250บาท, ราคา250, @250, 250.-
      const pricePatterns = [
        /(\d+(?:\.\d{1,2})?)\s*(?:บาท|฿|baht)/i,
        /ราคา\s*(\d+(?:\.\d{1,2})?)/,
        /@\s*(\d+(?:\.\d{1,2})?)/,
        /(\d+(?:\.\d{1,2})?)\s*\.-/,
      ];
      for (const pat of pricePatterns) {
        const m = name.match(pat);
        if (m) {
          price = parseFloat(m[1]) || 0;
          name = name.replace(m[0], "").trim();
          break;
        }
      }
      
      // If no explicit price found, try trailing number as price
      if (price === 0) {
        const trailingNum = name.match(/\s+(\d+(?:\.\d{1,2})?)$/);
        if (trailingNum) {
          price = parseFloat(trailingNum[1]) || 0;
          name = name.replace(trailingNum[0], "").trim();
        }
      }
      
      // Clean up name
      name = name.replace(/\s+/g, " ").replace(/^[-,.\s]+|[-,.\s]+$/g, "").trim();
      if (!name) name = "สินค้าจาก CF";
      
      products.push({ name, qty, price });
    }
  }
  
  const totalAmount = products.reduce((sum, p) => sum + (p.qty * p.price), 0);
  return { products, totalAmount };
}

// ============ Chat Orders (LINE + Facebook Messenger) ============

async function getCompanyCfKeywords(companyId: number): Promise<string[]> {
  const rows = await ecomDb.select().from(chatOrderKeywords)
    .where(and(eq(chatOrderKeywords.companyId, companyId), eq(chatOrderKeywords.active, true)));
  if (rows.length === 0) return ["CF", "cf", "สั่ง", "order"];
  return rows.map(r => r.keyword);
}

async function detectAndCreateChatOrder(
  companyId: number,
  platform: "line" | "facebook" | "instagram",
  threadId: number | null,
  messageId: number | null,
  buyerName: string | null,
  buyerExternalId: string | null,
  messageText: string,
) {
  const keywords = await getCompanyCfKeywords(companyId);
  const result = parseCfMessages([messageText], keywords);
  if (result.products.length === 0) return null;

  const [order] = await ecomDb.insert(chatOrders).values({
    companyId,
    platform,
    threadId,
    messageId,
    buyerName,
    buyerExternalId,
    rawMessage: messageText,
    parsedProducts: JSON.stringify(result.products),
    totalAmount: String(result.totalAmount),
    status: "detected",
    paymentStatus: "pending",
  }).returning();
  console.log(`[ChatOrder] Detected ${platform} order from ${buyerName}: ${result.products.length} items, ฿${result.totalAmount}`);
  return order;
}

app.get("/api/chat-orders", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const platform = req.query.platform as string;
    const status = req.query.status as string;
    let conditions = [eq(chatOrders.companyId, companyId)];
    if (platform && platform !== "all") conditions.push(eq(chatOrders.platform, platform));
    if (status && status !== "all") conditions.push(eq(chatOrders.status, status));
    const orders = await ecomDb.select().from(chatOrders).where(and(...conditions)).orderBy(desc(chatOrders.createdAt));
    res.json(orders);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/chat-orders/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [order] = await ecomDb.select().from(chatOrders).where(eq(chatOrders.id, id));
    if (!order) return res.status(404).json({ message: "ไม่พบคำสั่งซื้อ" });
    if (!(await verifyCompanyAccess(user, order.companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    res.json(order);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/chat-orders/:id/confirm", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [order] = await ecomDb.select().from(chatOrders).where(eq(chatOrders.id, id));
    if (!order) return res.status(404).json({ message: "ไม่พบคำสั่งซื้อ" });
    if (!(await verifyCompanyAccess(user, order.companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    if (order.status === "confirmed") return res.status(400).json({ message: "คำสั่งซื้อนี้ยืนยันแล้ว" });
    if (order.ecommerceOrderId) return res.status(400).json({ message: "คำสั่งซื้อนี้สร้างออเดอร์แล้ว" });

    const products = JSON.parse(order.parsedProducts || "[]");

    const result = await db.transaction(async (tx) => {
      const conn = await tx.select().from(ecommerceConnections)
        .where(and(eq(ecommerceConnections.companyId, order.companyId), eq(ecommerceConnections.platform, order.platform)))
        .limit(1);
      let connectionId = conn[0]?.id;
      if (!connectionId) {
        const [newConn] = await tx.insert(ecommerceConnections).values({
          companyId: order.companyId,
          platform: order.platform,
          shopName: order.platform === "line" ? "LINE OA" : "Facebook Messenger",
          status: "connected",
        }).returning();
        connectionId = newConn.id;
      }

      const orderNo = `CH${Date.now().toString(36).toUpperCase()}`;
      const [ecommOrder] = await tx.insert(ecommerceOrders).values({
        companyId: order.companyId,
        connectionId,
        platform: order.platform,
        platformOrderId: `chat-${order.id}`,
        orderNo,
        status: "pending",
        buyerName: order.buyerName,
        subtotal: order.totalAmount,
        totalAmount: order.totalAmount,
        placedAt: order.createdAt,
        orderSource: "chat",
        notes: `จากแชท ${order.platform === "line" ? "LINE" : "Facebook"}: ${products.map((p: any) => `${p.name} x${p.qty}`).join(", ")}`,
      }).returning();

      for (const p of products) {
        await tx.insert(ecommerceOrderItems).values({
          orderId: ecommOrder.id,
          platformItemId: `chat-item-${order.id}-${p.name}`,
          productName: p.name,
          sku: "",
          quantity: p.qty,
          unitPrice: String(p.price),
          totalPrice: String(p.qty * p.price),
        });
      }

      const [updated] = await tx.update(chatOrders)
        .set({ status: "confirmed", confirmedBy: user.id, confirmedAt: new Date(), ecommerceOrderId: ecommOrder.id })
        .where(eq(chatOrders.id, id)).returning();
      return updated;
    });

    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/chat-orders/:id/cancel", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [order] = await ecomDb.select().from(chatOrders).where(eq(chatOrders.id, id));
    if (!order) return res.status(404).json({ message: "ไม่พบคำสั่งซื้อ" });
    if (!(await verifyCompanyAccess(user, order.companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    const [updated] = await ecomDb.update(chatOrders)
      .set({ status: "cancelled" })
      .where(eq(chatOrders.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/chat-orders/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [order] = await ecomDb.select().from(chatOrders).where(eq(chatOrders.id, id));
    if (!order) return res.status(404).json({ message: "ไม่พบคำสั่งซื้อ" });
    if (!(await verifyCompanyAccess(user, order.companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    const { parsedProducts, totalAmount, notes } = req.body;
    const updates: any = {};
    if (parsedProducts !== undefined) updates.parsedProducts = typeof parsedProducts === "string" ? parsedProducts : JSON.stringify(parsedProducts);
    if (totalAmount !== undefined) updates.totalAmount = String(totalAmount);
    if (notes !== undefined) updates.notes = notes;
    const [updated] = await ecomDb.update(chatOrders).set(updates).where(eq(chatOrders.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/chat-order-keywords", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const keywords = await ecomDb.select().from(chatOrderKeywords).where(eq(chatOrderKeywords.companyId, companyId)).orderBy(asc(chatOrderKeywords.createdAt));
    res.json(keywords);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/chat-order-keywords", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { companyId, keyword, platform } = req.body;
    if (!companyId || !keyword) return res.status(400).json({ message: "companyId and keyword required" });
    const [kw] = await ecomDb.insert(chatOrderKeywords).values({
      companyId, keyword: keyword.trim(), platform: platform || "all",
    }).returning();
    res.json(kw);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/chat-order-keywords/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    await ecomDb.delete(chatOrderKeywords).where(eq(chatOrderKeywords.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/chat-orders/test-parse", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { companyId, message } = req.body;
    if (!message) return res.status(400).json({ message: "message required" });
    const keywords = companyId ? await getCompanyCfKeywords(Number(companyId)) : ["CF", "cf", "สั่ง", "order"];
    const result = parseCfMessages([message], keywords);
    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Shipping Labels ============

app.get("/api/ecommerce/shipping-labels/orders", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const status = (req.query.status as string) || "all";
    const platform = (req.query.platform as string) || "all";
    const carrier = (req.query.carrier as string) || "";
    const search = (req.query.search as string) || "";
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const labelStatus = (req.query.labelStatus as string) || "all";
    const itemCountFilter = req.query.itemCount ? Number(req.query.itemCount) : null;
    const productFilter = (req.query.product as string) || "";

    const tabCountsResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('confirmed','shipping','shipped')) AS "all",
        COUNT(*) FILTER (WHERE status = 'confirmed') AS "confirmed",
        COUNT(*) FILTER (WHERE status = 'shipping') AS "shipping",
        COUNT(*) FILTER (WHERE status = 'shipped') AS "shipped",
        COUNT(*) FILTER (WHERE status IN ('confirmed','shipping') AND shipping_provider IS NULL AND platform_shipping_provider IS NULL) AS "noCarrier",
        COUNT(*) FILTER (WHERE status = 'confirmed' AND ship_by_date IS NOT NULL AND ship_by_date <= NOW() + interval '24 hours') AS "nearDeadline"
      FROM ecommerce_orders
      WHERE company_id = ${companyId}
    `);
    const tabCounts = {
      all: Number(tabCountsResult.rows[0]?.all ?? 0),
      confirmed: Number(tabCountsResult.rows[0]?.confirmed ?? 0),
      shipping: Number(tabCountsResult.rows[0]?.shipping ?? 0),
      shipped: Number(tabCountsResult.rows[0]?.shipped ?? 0),
      noCarrier: Number(tabCountsResult.rows[0]?.noCarrier ?? 0),
      nearDeadline: Number(tabCountsResult.rows[0]?.nearDeadline ?? 0),
    };

    const conditions: any[] = [eq(ecommerceOrders.companyId, companyId)];

    if (status === "confirmed") {
      conditions.push(eq(ecommerceOrders.status, "confirmed"));
    } else if (status === "shipping") {
      conditions.push(eq(ecommerceOrders.status, "shipping"));
    } else if (status === "shipped") {
      conditions.push(eq(ecommerceOrders.status, "shipped"));
    } else if (status === "no_carrier") {
      conditions.push(inArray(ecommerceOrders.status, ["confirmed", "shipping"]));
      conditions.push(isNull(ecommerceOrders.shippingProvider));
      conditions.push(isNull(ecommerceOrders.platformShippingProvider));
    } else if (status === "near_deadline") {
      conditions.push(eq(ecommerceOrders.status, "confirmed"));
      conditions.push(sql`${ecommerceOrders.shipByDate} IS NOT NULL`);
      conditions.push(sql`${ecommerceOrders.shipByDate} <= NOW() + interval '24 hours'`);
    } else {
      conditions.push(inArray(ecommerceOrders.status, ["confirmed", "shipping", "shipped"]));
    }

    if (platform && platform !== "all") {
      conditions.push(eq(ecommerceOrders.platform, platform));
    }
    if (carrier) {
      conditions.push(or(
        ilike(ecommerceOrders.shippingProvider, `%${carrier}%`),
        ilike(ecommerceOrders.platformShippingProvider, `%${carrier}%`)
      ));
    }
    if (startDate) {
      conditions.push(gte(ecommerceOrders.placedAt, new Date(startDate)));
    }
    if (endDate) {
      const ed = new Date(endDate);
      ed.setHours(23, 59, 59, 999);
      conditions.push(lte(ecommerceOrders.placedAt, ed));
    }
    if (labelStatus === "printed") {
      conditions.push(eq(ecommerceOrders.labelStatus, "printed"));
    } else if (labelStatus === "not_printed") {
      conditions.push(eq(ecommerceOrders.labelStatus, "not_printed"));
    }

    let searchOrderIds: number[] | null = null;
    if (search) {
      const searchPattern = `%${search}%`;
      const directMatches = await ecomDb.select({ id: ecommerceOrders.id })
        .from(ecommerceOrders)
        .where(and(
          eq(ecommerceOrders.companyId, companyId),
          or(
            ilike(ecommerceOrders.orderNo, searchPattern),
            ilike(ecommerceOrders.platformOrderId, searchPattern),
            ilike(ecommerceOrders.trackingNo, searchPattern),
            ilike(ecommerceOrders.buyerName, searchPattern)
          )
        ));
      const itemMatches = await db.selectDistinct({ orderId: ecommerceOrderItems.orderId })
        .from(ecommerceOrderItems)
        .innerJoin(ecommerceOrders, eq(ecommerceOrderItems.orderId, ecommerceOrders.id))
        .where(and(
          eq(ecommerceOrders.companyId, companyId),
          or(
            ilike(ecommerceOrderItems.platformSku, searchPattern),
            ilike(ecommerceOrderItems.name, searchPattern)
          )
        ));
      const allIds = new Set([
        ...directMatches.map(r => r.id),
        ...itemMatches.map(r => r.orderId),
      ]);
      searchOrderIds = Array.from(allIds);
      if (searchOrderIds.length === 0) {
        return res.json({ orders: [], total: 0, tabCounts });
      }
      conditions.push(inArray(ecommerceOrders.id, searchOrderIds));
    }

    if (productFilter) {
      const productPattern = `%${productFilter}%`;
      const matchedOrderIds = await db.selectDistinct({ orderId: ecommerceOrderItems.orderId })
        .from(ecommerceOrderItems)
        .innerJoin(ecommerceOrders, eq(ecommerceOrderItems.orderId, ecommerceOrders.id))
        .where(and(
          eq(ecommerceOrders.companyId, companyId),
          or(
            ilike(ecommerceOrderItems.name, productPattern),
            ilike(ecommerceOrderItems.platformSku, productPattern),
            ilike(ecommerceOrderItems.sku, productPattern)
          )
        ));
      const pIds = matchedOrderIds.map(r => r.orderId);
      if (pIds.length === 0) {
        return res.json({ orders: [], total: 0, tabCounts });
      }
      conditions.push(inArray(ecommerceOrders.id, pIds));
    }

    const itemCountSub = ecomDb.select({
      orderId: ecommerceOrderItems.orderId,
      cnt: count().as("cnt"),
      itemNames: sql<string>`string_agg(${ecommerceOrderItems.name}, '||')`.as("item_names"),
    }).from(ecommerceOrderItems).groupBy(ecommerceOrderItems.orderId).as("item_counts");

    if (itemCountFilter !== null && itemCountFilter > 0) {
      const matchedIds = await db.select({ orderId: itemCountSub.orderId })
        .from(itemCountSub)
        .where(itemCountFilter >= 6 ? gte(itemCountSub.cnt, 6) : eq(itemCountSub.cnt, itemCountFilter));
      const icIds = matchedIds.map(r => r.orderId);
      if (icIds.length === 0) {
        return res.json({ orders: [], total: 0, tabCounts });
      }
      conditions.push(inArray(ecommerceOrders.id, icIds));
    }

    const offset = (page - 1) * pageSize;

    const rows = await db.select({
      order: ecommerceOrders,
      itemCount: sql<number>`coalesce(${itemCountSub.cnt}, 0)`,
      itemNames: itemCountSub.itemNames,
      totalCount: sql<number>`count(*) OVER()`,
    })
      .from(ecommerceOrders)
      .leftJoin(itemCountSub, eq(ecommerceOrders.id, itemCountSub.orderId))
      .where(and(...conditions))
      .orderBy(desc(ecommerceOrders.placedAt))
      .limit(pageSize)
      .offset(offset);

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;
    const orders = rows.map(r => ({
      ...r.order,
      itemCount: Number(r.itemCount) || 0,
      itemNames: r.itemNames ? String(r.itemNames).split("||") : [],
    }));

    res.json({ orders, total, tabCounts });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/shipping-labels/popular-skus", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const minQty = Number(req.query.minQty) || 0;
    const skuSearch = (req.query.sku as string) || "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));

    const conditions: any[] = [
      eq(ecommerceOrders.companyId, companyId),
      inArray(ecommerceOrders.status, ["confirmed", "shipping", "shipped"]),
    ];

    const baseQuery = db
      .select({
        sku: sql<string>`COALESCE(${ecommerceOrderItems.platformSku}, ${ecommerceOrderItems.name})`.as("sku"),
        orderCount: sql<number>`COUNT(DISTINCT ${ecommerceOrderItems.orderId})`.as("order_count"),
      })
      .from(ecommerceOrderItems)
      .innerJoin(ecommerceOrders, eq(ecommerceOrderItems.orderId, ecommerceOrders.id))
      .where(and(...conditions))
      .groupBy(sql`COALESCE(${ecommerceOrderItems.platformSku}, ${ecommerceOrderItems.name})`);

    const havingConditions: any[] = [];
    if (minQty > 0) {
      havingConditions.push(sql`COUNT(DISTINCT ${ecommerceOrderItems.orderId}) >= ${minQty}`);
    }
    if (skuSearch) {
      havingConditions.push(sql`COALESCE(${ecommerceOrderItems.platformSku}, ${ecommerceOrderItems.name}) ILIKE ${'%' + skuSearch + '%'}`);
    }

    let finalQuery: any = baseQuery;
    if (havingConditions.length > 0) {
      finalQuery = baseQuery.having(and(...havingConditions));
    }

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total FROM (
        SELECT COALESCE(${ecommerceOrderItems.platformSku}, ${ecommerceOrderItems.name}) as sku
        FROM ecommerce_order_items
        INNER JOIN ecommerce_orders ON ecommerce_order_items.order_id = ecommerce_orders.id
        WHERE ecommerce_orders.company_id = ${companyId}
          AND ecommerce_orders.status IN ('confirmed','shipping','shipped')
        GROUP BY COALESCE(${ecommerceOrderItems.platformSku}, ${ecommerceOrderItems.name})
        ${minQty > 0 ? sql`HAVING COUNT(DISTINCT ecommerce_order_items.order_id) >= ${minQty}` : sql``}
        ${skuSearch ? sql`${minQty > 0 ? sql`AND` : sql`HAVING`} COALESCE(ecommerce_order_items.platform_sku, ecommerce_order_items.name) ILIKE ${'%' + skuSearch + '%'}` : sql``}
      ) sub
    `);
    const total = Number(countResult.rows[0]?.total ?? 0);

    const rows = await db.execute(sql`
      SELECT COALESCE(ecommerce_order_items.platform_sku, ecommerce_order_items.name) as sku,
             COUNT(DISTINCT ecommerce_order_items.order_id) as order_count
      FROM ecommerce_order_items
      INNER JOIN ecommerce_orders ON ecommerce_order_items.order_id = ecommerce_orders.id
      WHERE ecommerce_orders.company_id = ${companyId}
        AND ecommerce_orders.status IN ('confirmed','shipping','shipped')
      GROUP BY COALESCE(ecommerce_order_items.platform_sku, ecommerce_order_items.name)
      ${minQty > 0 ? sql`HAVING COUNT(DISTINCT ecommerce_order_items.order_id) >= ${minQty}` : sql``}
      ${skuSearch ? sql`${minQty > 0 ? sql`AND` : sql`HAVING`} COALESCE(ecommerce_order_items.platform_sku, ecommerce_order_items.name) ILIKE ${'%' + skuSearch + '%'}` : sql``}
      ORDER BY order_count DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `);

    res.json({
      skus: rows.rows.map((r: any) => ({ sku: r.sku, orderCount: Number(r.order_count) })),
      total,
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/shipping-labels/generate", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { orderIds, carrier } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0 || !carrier) {
      return res.status(400).json({ message: "orderIds (array) and carrier are required" });
    }
    await ecomDb.update(ecommerceOrders).set({
      labelStatus: "printed",
      labelPrintCount: sql`${ecommerceOrders.labelPrintCount} + 1`,
      labelPrintedAt: new Date(),
    }).where(inArray(ecommerceOrders.id, orderIds));
    res.json({
      message: `สร้างใบปะหน้าพัสดุ ${orderIds.length} ใบ สำเร็จ`,
      labels: orderIds.map((id: number) => ({
        orderId: id,
        labelUrl: null,
        status: "generated",
        carrier,
      })),
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// Bundle/BOM expansion for shipping labels & pick lists
app.post("/api/ecommerce/shipping-labels/expand-bundles", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { orderIds, companyId } = req.body;
    if (!companyId || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: "companyId and orderIds required" });
    }

    const validOrders = await ecomDb.select({ id: ecommerceOrders.id })
      .from(ecommerceOrders)
      .where(and(inArray(ecommerceOrders.id, orderIds), eq(ecommerceOrders.companyId, companyId)));
    const validOrderIds = validOrders.map(o => o.id);
    if (validOrderIds.length === 0) {
      return res.json({});
    }

    const items = await db.select({
      id: ecommerceOrderItems.id,
      orderId: ecommerceOrderItems.orderId,
      productId: ecommerceOrderItems.productId,
      name: ecommerceOrderItems.name,
      platformSku: ecommerceOrderItems.platformSku,
      qty: ecommerceOrderItems.qty,
    }).from(ecommerceOrderItems)
      .where(inArray(ecommerceOrderItems.orderId, validOrderIds));

    const productIds = items.filter(i => i.productId).map(i => i.productId!);
    let bundleProducts = new Map<number, { name: string; code: string; productType: string }>();
    let bundleComponents = new Map<number, { componentName: string; componentCode: string; qty: number }[]>();

    if (productIds.length > 0) {
      const prods = await db.select({
        id: products.id,
        name: products.name,
        code: products.code,
        productType: products.productType,
      }).from(products).where(and(
        inArray(products.id, productIds),
        eq(products.companyId, companyId)
      ));
      prods.forEach(p => bundleProducts.set(p.id, { name: p.name, code: p.code, productType: p.productType }));

      const bundleIds = prods.filter(p => p.productType === "bundle").map(p => p.id);
      if (bundleIds.length > 0) {
        const bundles = await db.select({
          bundleProductId: productBundles.bundleProductId,
          componentProductId: productBundles.componentProductId,
          qty: productBundles.qty,
        }).from(productBundles).where(inArray(productBundles.bundleProductId, bundleIds));

        const compIds = bundles.map(b => b.componentProductId);
        let compMap = new Map<number, { name: string; code: string }>();
        if (compIds.length > 0) {
          const comps = await db.select({ id: products.id, name: products.name, code: products.code })
            .from(products).where(inArray(products.id, compIds));
          comps.forEach(c => compMap.set(c.id, { name: c.name, code: c.code }));
        }

        bundles.forEach(b => {
          const comp = compMap.get(b.componentProductId);
          if (!comp) return;
          const existing = bundleComponents.get(b.bundleProductId) || [];
          existing.push({ componentName: comp.name, componentCode: comp.code, qty: Number(b.qty) });
          bundleComponents.set(b.bundleProductId, existing);
        });
      }

      const manufacturedIds = prods.filter(p => p.productType === "manufactured").map(p => p.id);
      if (manufacturedIds.length > 0) {
        const boms = await db.select({
          productId: bomHeaders.productId,
          bomId: bomHeaders.id,
        }).from(bomHeaders).where(and(
          inArray(bomHeaders.productId, manufacturedIds),
          eq(bomHeaders.companyId, companyId),
          eq(bomHeaders.active, true)
        ));

        const bomIds = boms.map(b => b.bomId);
        if (bomIds.length > 0) {
          const bomLineRows = await db.select({
            bomId: bomLines.bomId,
            componentProductId: bomLines.componentProductId,
            qty: bomLines.qty,
          }).from(bomLines).where(inArray(bomLines.bomId, bomIds));

          const bomCompIds = bomLineRows.map(b => b.componentProductId);
          let bomCompMap = new Map<number, { name: string; code: string }>();
          if (bomCompIds.length > 0) {
            const comps = await db.select({ id: products.id, name: products.name, code: products.code })
              .from(products).where(inArray(products.id, bomCompIds));
            comps.forEach(c => bomCompMap.set(c.id, { name: c.name, code: c.code }));
          }

          const bomByProduct = new Map<number, number>();
          boms.forEach(b => bomByProduct.set(b.bomId, b.productId));

          bomLineRows.forEach(bl => {
            const productId = bomByProduct.get(bl.bomId);
            if (!productId) return;
            const comp = bomCompMap.get(bl.componentProductId);
            if (!comp) return;
            const existing = bundleComponents.get(productId) || [];
            existing.push({ componentName: comp.name, componentCode: comp.code, qty: Number(bl.qty) });
            bundleComponents.set(productId, existing);
          });
        }
      }
    }

    const result: Record<number, {
      orderId: number;
      items: {
        name: string;
        sku: string;
        qty: number;
        isBundle: boolean;
        components: { name: string; code: string; qty: number }[];
      }[];
    }> = {};

    for (const item of items) {
      if (!result[item.orderId]) {
        result[item.orderId] = { orderId: item.orderId, items: [] };
      }
      const prod = item.productId ? bundleProducts.get(item.productId) : null;
      const isBundle = prod ? (prod.productType === "bundle" || prod.productType === "manufactured") : false;
      const components = (item.productId && isBundle) ? (bundleComponents.get(item.productId) || []) : [];
      const itemQty = Number(item.qty) || 1;

      result[item.orderId].items.push({
        name: item.name,
        sku: item.platformSku || prod?.code || "",
        qty: itemQty,
        isBundle,
        components: components.map(c => ({
          name: c.componentName,
          code: c.componentCode,
          qty: c.qty * itemQty,
        })),
      });
    }

    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Packing CCTV Camera Integration ============

app.get("/api/ecommerce/packing/cameras", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const rows = await db.select().from(packingCameras)
      .where(eq(packingCameras.companyId, companyId))
      .orderBy(desc(packingCameras.createdAt));
    res.json(rows);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/packing/cameras", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const parsed = insertPackingCameraSchema.parse(req.body);
    const [cam] = await db.insert(packingCameras).values(parsed).returning();
    res.json(cam);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.put("/api/ecommerce/packing/cameras/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [existing] = await db.select().from(packingCameras).where(and(eq(packingCameras.id, id), eq(packingCameras.companyId, companyId)));
    if (!existing) return res.status(404).json({ message: "ไม่พบกล้อง" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const updateData: any = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.rtspUrl !== undefined) updateData.rtspUrl = req.body.rtspUrl;
    if (req.body.snapshotUrl !== undefined) updateData.snapshotUrl = req.body.snapshotUrl;
    if (req.body.stationName !== undefined) updateData.stationName = req.body.stationName;
    if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;
    const [cam] = await db.update(packingCameras)
      .set(updateData)
      .where(and(eq(packingCameras.id, id), eq(packingCameras.companyId, companyId)))
      .returning();
    res.json(cam);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/ecommerce/packing/cameras/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [existing] = await db.select().from(packingCameras).where(and(eq(packingCameras.id, id), eq(packingCameras.companyId, companyId)));
    if (!existing) return res.status(404).json({ message: "ไม่พบกล้อง" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    await db.delete(packingCameras).where(and(eq(packingCameras.id, id), eq(packingCameras.companyId, companyId)));
    res.json({ message: "ลบกล้องสำเร็จ" });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/packing/cameras/:id/test", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = Number(req.body.companyId || req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [cam] = await db.select().from(packingCameras).where(and(eq(packingCameras.id, id), eq(packingCameras.companyId, companyId)));
    if (!cam) return res.status(404).json({ message: "ไม่พบกล้อง" });

    if (cam.snapshotUrl) {
      try {
        const snapRes = await fetch(cam.snapshotUrl, { signal: AbortSignal.timeout(5000) });
        if (snapRes.ok) {
          return res.json({ status: "ok", message: "เชื่อมต่อกล้องสำเร็จ (snapshot)", hasSnapshot: true });
        }
      } catch (e) {}
    }

    try {
      const url = new URL(cam.rtspUrl);
      if (url.protocol === "rtsp:") {
        return res.json({ status: "ok", message: "RTSP URL ถูกต้อง กรุณาตรวจสอบการเชื่อมต่อเครือข่ายที่เซิร์ฟเวอร์", hasSnapshot: false });
      }
      const testRes = await fetch(cam.rtspUrl, { signal: AbortSignal.timeout(5000) });
      return res.json({ status: testRes.ok ? "ok" : "error", message: testRes.ok ? "เชื่อมต่อสำเร็จ" : "ไม่สามารถเชื่อมต่อได้", hasSnapshot: false });
    } catch (e) {
      return res.json({ status: "ok", message: "RTSP URL ถูกต้อง กรุณาตรวจสอบเครือข่ายที่เซิร์ฟเวอร์", hasSnapshot: false });
    }
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/packing/recordings", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const search = (req.query.search as string) || "";
    const cameraId = req.query.cameraId ? Number(req.query.cameraId) : null;

    const conditions: any[] = [eq(packingRecordings.companyId, companyId)];
    if (search) {
      conditions.push(ilike(packingRecordings.orderNo, `%${search}%`));
    }
    if (cameraId) {
      conditions.push(eq(packingRecordings.cameraId, cameraId));
    }

    const rows = await db.select({
      recording: packingRecordings,
      cameraName: packingCameras.name,
      totalCount: sql<number>`count(*) OVER()`,
    })
      .from(packingRecordings)
      .leftJoin(packingCameras, eq(packingRecordings.cameraId, packingCameras.id))
      .where(and(...conditions))
      .orderBy(desc(packingRecordings.startedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0;
    res.json({
      recordings: rows.map(r => ({ ...r.recording, cameraName: r.cameraName })),
      total,
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/packing/recordings/start", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { companyId, cameraId, orderNo, operatorName } = req.body;
    if (!companyId || !cameraId) return res.status(400).json({ message: "companyId and cameraId required" });

    const order = orderNo ? await ecomDb.select().from(ecommerceOrders)
      .where(and(
        eq(ecommerceOrders.companyId, companyId),
        or(
          eq(ecommerceOrders.orderNo, orderNo),
          eq(ecommerceOrders.platformOrderId, orderNo)
        )
      )).then(r => r[0]) : null;

    let snapshotPath: string | null = null;
    const [cam] = await db.select().from(packingCameras).where(and(eq(packingCameras.id, cameraId), eq(packingCameras.companyId, companyId)));
    if (!cam) return res.status(404).json({ message: "ไม่พบกล้องในบริษัทนี้" });
    if (cam?.snapshotUrl) {
      try {
        const snapRes = await fetch(cam.snapshotUrl, { signal: AbortSignal.timeout(5000) });
        if (snapRes.ok) {
          snapshotPath = `packing-snapshots/${companyId}/${orderNo || 'unknown'}_${Date.now()}.jpg`;
        }
      } catch (e) {}
    }

    const [rec] = await db.insert(packingRecordings).values({
      companyId,
      cameraId,
      orderId: order?.id || null,
      orderNo: orderNo || null,
      operatorId: (req.user as any)?.id || null,
      operatorName: operatorName || (req.user as any)?.fullName || null,
      startedAt: new Date(),
      status: "recording",
      snapshotPath,
    }).returning();

    res.json({ recording: rec, order: order || null });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/packing/recordings/:id/stop", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = Number(req.body.companyId || req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [rec] = await db.select().from(packingRecordings).where(and(eq(packingRecordings.id, id), eq(packingRecordings.companyId, companyId)));
    if (!rec) return res.status(404).json({ message: "ไม่พบรายการบันทึก" });

    const endedAt = new Date();
    const duration = Math.round((endedAt.getTime() - new Date(rec.startedAt).getTime()) / 1000);

    const [updated] = await db.update(packingRecordings)
      .set({ endedAt, duration, status: "completed", notes: req.body.notes || null })
      .where(eq(packingRecordings.id, id))
      .returning();

    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/packing/recordings/by-order/:orderNo", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const orderNo = req.params.orderNo;

    const rows = await db.select({
      recording: packingRecordings,
      cameraName: packingCameras.name,
    })
      .from(packingRecordings)
      .leftJoin(packingCameras, eq(packingRecordings.cameraId, packingCameras.id))
      .where(and(
        eq(packingRecordings.companyId, companyId),
        eq(packingRecordings.orderNo, orderNo)
      ))
      .orderBy(desc(packingRecordings.startedAt));

    res.json(rows.map(r => ({ ...r.recording, cameraName: r.cameraName })));
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Tax Invoice Reconciliation (Recheck) ============

app.get("/api/ecommerce/reconciliation", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const month = req.query.month as string;
    const year = req.query.year as string;
    const platform = req.query.platform as string;

    const conditions: any[] = [eq(ecommerceOrders.companyId, companyId)];
    if (platform && platform !== "all") conditions.push(eq(ecommerceOrders.platform, platform));

    if (month && year) {
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);
      conditions.push(gte(ecommerceOrders.placedAt, startDate));
      conditions.push(lte(ecommerceOrders.placedAt, endDate));
    } else if (year) {
      const startDate = new Date(Number(year), 0, 1);
      const endDate = new Date(Number(year), 11, 31, 23, 59, 59);
      conditions.push(gte(ecommerceOrders.placedAt, startDate));
      conditions.push(lte(ecommerceOrders.placedAt, endDate));
    }

    const allOrders = await ecomDb.select().from(ecommerceOrders)
      .where(and(...conditions))
      .orderBy(desc(ecommerceOrders.placedAt));

    const totalOrders = allOrders.length;
    const withTiv = allOrders.filter(o => o.taxInvoiceId !== null);
    const withoutTiv = allOrders.filter(o => o.taxInvoiceId === null);
    const cancelled = allOrders.filter(o => o.status === "cancelled");
    const cancelledNoTiv = withoutTiv.filter(o => o.status === "cancelled");
    const missingTiv = withoutTiv.filter(o => o.status !== "cancelled");

    const byPlatform: Record<string, { total: number; issued: number; missing: number; cancelled: number; totalAmount: number; issuedAmount: number; missingAmount: number }> = {};
    for (const o of allOrders) {
      if (!byPlatform[o.platform]) {
        byPlatform[o.platform] = { total: 0, issued: 0, missing: 0, cancelled: 0, totalAmount: 0, issuedAmount: 0, missingAmount: 0 };
      }
      const p = byPlatform[o.platform];
      p.total++;
      p.totalAmount += Number(o.totalAmount || 0);
      if (o.taxInvoiceId) {
        p.issued++;
        p.issuedAmount += Number(o.totalAmount || 0);
      } else if (o.status === "cancelled") {
        p.cancelled++;
      } else {
        p.missing++;
        p.missingAmount += Number(o.totalAmount || 0);
      }
    }

    const nonCancelledCount = totalOrders - cancelled.length;
    const completionRate = nonCancelledCount > 0 ? ((withTiv.length / nonCancelledCount) * 100) : (totalOrders > 0 ? 100 : 0);

    res.json({
      summary: {
        totalOrders,
        issuedCount: withTiv.length,
        missingCount: missingTiv.length,
        cancelledCount: cancelled.length,
        completionRate: Math.min(completionRate, 100),
        totalAmount: allOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
        issuedAmount: withTiv.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
        missingAmount: missingTiv.reduce((s, o) => s + Number(o.totalAmount || 0), 0),
      },
      byPlatform,
      missingOrders: missingTiv.map(o => ({
        id: o.id,
        orderNo: o.orderNo || o.platformOrderId,
        platform: o.platform,
        buyerName: o.buyerName,
        totalAmount: o.totalAmount,
        status: o.status,
        placedAt: o.placedAt,
        trackingNo: o.trackingNo,
      })),
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Returns/Refunds ============

app.get("/api/ecommerce/returns", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const conditions: any[] = [eq(ecommerceReturns.companyId, companyId)];
    const status = req.query.status as string;
    if (status && status !== "all") conditions.push(eq(ecommerceReturns.status, status));
    const platform = req.query.platform as string;
    if (platform && platform !== "all") conditions.push(eq(ecommerceReturns.platform, platform));
    const returns = await ecomDb.select().from(ecommerceReturns)
      .where(and(...conditions))
      .orderBy(desc(ecommerceReturns.createdAt));
    res.json(returns);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/returns/report", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const FOOD_PLATFORMS = ['grab_food', 'line_man', 'robinhood'];

    const allReturns = await ecomDb.select().from(ecommerceReturns)
      .where(and(eq(ecommerceReturns.companyId, companyId), notInArray(ecommerceReturns.platform, FOOD_PLATFORMS)));
    const allItems = allReturns.length > 0
      ? await ecomDb.select().from(ecommerceReturnItems).where(inArray(ecommerceReturnItems.returnId, allReturns.map(r => r.id)))
      : [];

    const totalReturns = allReturns.length;
    const totalRefund = allReturns.reduce((s, r) => s + Number(r.refundAmount || 0), 0);
    const completedRefunds = allReturns.filter(r => r.status === "completed").length;
    const totalItems = allItems.reduce((s, i) => s + Number(i.qty || 0), 0);

    const dispositionSummary = { restock: 0, repair: 0, writeoff: 0, pending: 0 };
    for (const item of allItems) {
      if (item.disposition === "restock") dispositionSummary.restock += Number(item.receivedQty || 0);
      else if (item.disposition === "repair") dispositionSummary.repair += Number(item.receivedQty || 0);
      else if (item.disposition === "writeoff") dispositionSummary.writeoff += Number(item.receivedQty || 0);
      else dispositionSummary.pending += Number(item.qty || 0);
    }

    const byPlatform: Record<string, { count: number; refund: number; items: number }> = {};
    for (const ret of allReturns) {
      if (!byPlatform[ret.platform]) byPlatform[ret.platform] = { count: 0, refund: 0, items: 0 };
      byPlatform[ret.platform].count++;
      byPlatform[ret.platform].refund += Number(ret.refundAmount || 0);
    }
    for (const item of allItems) {
      const ret = allReturns.find(r => r.id === item.returnId);
      if (ret && byPlatform[ret.platform]) byPlatform[ret.platform].items += Number(item.qty || 0);
    }

    const byReason: Record<string, { count: number; refund: number }> = {};
    for (const ret of allReturns) {
      const reason = ret.reason || "ไม่ระบุ";
      if (!byReason[reason]) byReason[reason] = { count: 0, refund: 0 };
      byReason[reason].count++;
      byReason[reason].refund += Number(ret.refundAmount || 0);
    }

    const productMap: Record<string, { productName: string; sku: string | null; count: number; qty: number; refund: number; restock: number; writeoff: number }> = {};
    for (const item of allItems) {
      const key = item.productName || "ไม่ระบุ";
      if (!productMap[key]) productMap[key] = { productName: key, sku: item.sku, count: 0, qty: 0, refund: 0, restock: 0, writeoff: 0 };
      productMap[key].count++;
      productMap[key].qty += Number(item.qty || 0);
      productMap[key].refund += Number(item.refundAmount || 0);
      if (item.disposition === "restock") productMap[key].restock += Number(item.receivedQty || 0);
      if (item.disposition === "writeoff") productMap[key].writeoff += Number(item.receivedQty || 0);
    }
    const topProducts = Object.values(productMap).sort((a, b) => b.count - a.count);

    const totalLoss = allItems.reduce((s, i) => s + Number(i.lossAmount || 0), 0);
    const qcSummary = { pending: 0, completed: 0, normal: 0, minor_damage: 0, major_damage: 0, unsellable: 0 };
    for (const item of allItems) {
      if (item.qcStatus === "completed") {
        qcSummary.completed++;
        const cond = item.qcCondition as keyof typeof qcSummary;
        if (cond && cond in qcSummary) (qcSummary as any)[cond]++;
      } else {
        qcSummary.pending++;
      }
    }
    const zoneSummary: Record<string, number> = {};
    for (const item of allItems) {
      const z = item.zone || "receiving";
      zoneSummary[z] = (zoneSummary[z] || 0) + 1;
    }

    res.json({
      totalReturns, totalRefund, completedRefunds, totalItems, totalLoss,
      dispositionSummary, byPlatform, byReason, topProducts,
      qcSummary, zoneSummary,
    });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/returns/summary", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const FOOD_PLATFORMS = ['grab_food', 'line_man', 'robinhood'];
    const results = await ecomDb.select({
      returnStatus: ecommerceReturns.returnStatus,
      count: sql<number>`count(*)`,
      totalRefund: sql<string>`coalesce(sum(${ecommerceReturns.refundAmount}), 0)`,
    }).from(ecommerceReturns)
      .where(and(
        eq(ecommerceReturns.companyId, companyId),
        notInArray(ecommerceReturns.platform, FOOD_PLATFORMS),
      ))
      .groupBy(ecommerceReturns.returnStatus);

    const summary = {
      pending: 0, in_transit: 0, received: 0, total: 0, totalRefund: "0",
    };
    for (const r of results) {
      const key = r.returnStatus as keyof typeof summary;
      if (key in summary) (summary as any)[key] = Number(r.count);
      summary.total += Number(r.count);
      summary.totalRefund = String(Number(summary.totalRefund) + Number(r.totalRefund));
    }
    res.json(summary);
  } catch (err: any) { console.error("Returns summary error:", err); res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/returns/scan-lookup", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const code = req.query.code as string;
    if (!companyId || !code) return res.status(400).json({ message: "companyId and code required" });
    const trimmed = code.trim();
    const matchedItems = await ecomDb.select({ item: ecommerceReturnItems, ret: ecommerceReturns })
      .from(ecommerceReturnItems)
      .innerJoin(ecommerceReturns, eq(ecommerceReturnItems.returnId, ecommerceReturns.id))
      .where(and(eq(ecommerceReturns.companyId, companyId), sql`(${ecommerceReturnItems.barcode} = ${trimmed} OR ${ecommerceReturnItems.sku} = ${trimmed} OR ${ecommerceReturns.returnNo} = ${trimmed})`))
      .orderBy(desc(ecommerceReturns.createdAt));
    if (matchedItems.length === 0) {
      const productMatch = await ecomDb.select().from(products).where(and(eq(products.companyId, companyId), sql`(${products.barcode} = ${trimmed} OR ${products.code} = ${trimmed})`)).limit(1);
      if (productMatch.length > 0) {
        const p = productMatch[0];
        const returnItemsByProduct = await ecomDb.select({ item: ecommerceReturnItems, ret: ecommerceReturns })
          .from(ecommerceReturnItems).innerJoin(ecommerceReturns, eq(ecommerceReturnItems.returnId, ecommerceReturns.id))
          .where(and(eq(ecommerceReturns.companyId, companyId), eq(ecommerceReturnItems.productId, p.id), eq(ecommerceReturns.returnStatus, "in_transit")))
          .orderBy(desc(ecommerceReturns.createdAt));
        return res.json({ items: returnItemsByProduct, product: p });
      }
      return res.json({ items: [], product: null });
    }
    res.json({ items: matchedItems, product: null });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/returns/zone-summary", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const FOOD_PLATFORMS = ['grab_food', 'line_man', 'robinhood'];
    const results = await ecomDb.select({
      zone: ecommerceReturnItems.zone, qcStatus: ecommerceReturnItems.qcStatus,
      count: sql<number>`count(*)`,
      totalQty: sql<string>`coalesce(sum(CAST(${ecommerceReturnItems.receivedQty} AS numeric)), 0)`,
      totalLoss: sql<string>`coalesce(sum(CAST(${ecommerceReturnItems.lossAmount} AS numeric)), 0)`,
    }).from(ecommerceReturnItems)
      .innerJoin(ecommerceReturns, eq(ecommerceReturnItems.returnId, ecommerceReturns.id))
      .where(and(eq(ecommerceReturns.companyId, companyId), notInArray(ecommerceReturns.platform, FOOD_PLATFORMS)))
      .groupBy(ecommerceReturnItems.zone, ecommerceReturnItems.qcStatus);
    const zones: Record<string, { items: number; qty: number; loss: number; pendingQc: number; completedQc: number }> = {};
    for (const r of results) {
      const z = r.zone || "receiving";
      if (!zones[z]) zones[z] = { items: 0, qty: 0, loss: 0, pendingQc: 0, completedQc: 0 };
      zones[z].items += Number(r.count); zones[z].qty += Number(r.totalQty); zones[z].loss += Number(r.totalLoss);
      if (r.qcStatus === "completed") zones[z].completedQc += Number(r.count); else zones[z].pendingQc += Number(r.count);
    }
    res.json(zones);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/returns/qc-pending", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const FOOD_PLATFORMS = ['grab_food', 'line_man', 'robinhood'];
    const items = await ecomDb.select({
      item: ecommerceReturnItems, returnNo: ecommerceReturns.returnNo,
      platform: ecommerceReturns.platform, buyerName: ecommerceReturns.buyerName, returnId: ecommerceReturns.id,
    }).from(ecommerceReturnItems)
      .innerJoin(ecommerceReturns, eq(ecommerceReturnItems.returnId, ecommerceReturns.id))
      .where(and(
        eq(ecommerceReturns.companyId, companyId), notInArray(ecommerceReturns.platform, FOOD_PLATFORMS),
        eq(ecommerceReturns.returnStatus, "received"),
        sql`(${ecommerceReturnItems.qcStatus} IS NULL OR ${ecommerceReturnItems.qcStatus} = 'pending')`,
      ))
      .orderBy(desc(ecommerceReturns.receivedAt));
    res.json(items);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/returns/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const [ret] = await ecomDb.select().from(ecommerceReturns).where(eq(ecommerceReturns.id, Number(req.params.id)));
    if (!ret) return res.status(404).json({ message: "ไม่พบรายการคืนสินค้า" });
    const items = await ecomDb.select().from(ecommerceReturnItems).where(eq(ecommerceReturnItems.returnId, ret.id));
    res.json({ ...ret, items });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/ecommerce/returns", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { items, ...returnData } = req.body;
    const companyId = Number(returnData.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const count = await ecomDb.select({ count: sql<number>`count(*)` }).from(ecommerceReturns).where(eq(ecommerceReturns.companyId, companyId));
    const nextNum = Number(count[0]?.count || 0) + 1;
    const returnNo = `RT-${String(nextNum).padStart(5, "0")}`;
    const [newReturn] = await ecomDb.insert(ecommerceReturns).values({ ...returnData, companyId, returnNo, status: "requested" }).returning();
    if (items && Array.isArray(items) && items.length > 0) {
      await ecomDb.insert(ecommerceReturnItems).values(items.map((item: any) => ({ ...item, returnId: newReturn.id })));
    }
    res.json(newReturn);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/ecommerce/returns/:id/status", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const updateData: any = { status };
    if (status === "approved") {
      updateData.approvedAt = new Date();
      updateData.approvedBy = (req.user as any)?.id;
    } else if (status === "completed") {
      updateData.completedAt = new Date();
    }
    if (notes) updateData.notes = notes;
    const [updated] = await ecomDb.update(ecommerceReturns).set(updateData).where(eq(ecommerceReturns.id, Number(req.params.id))).returning();
    if (status === "completed" && updated) {
      await ecomDb.update(ecommerceOrders).set({ status: "returned" }).where(eq(ecommerceOrders.id, updated.orderId));

      const [order] = await ecomDb.select().from(ecommerceOrders).where(eq(ecommerceOrders.id, updated.orderId));
      if (order && order.taxInvoiceId && !order.creditNoteId) {
        try {
          const [originalTiv] = await ecomDb.select().from(taxInvoices).where(eq(taxInvoices.id, order.taxInvoiceId));
          if (originalTiv) {
            const originalItems = await ecomDb.select().from(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, originalTiv.id));
            const returnDate = new Date().toISOString().split("T")[0];
            const subtotal = parseFloat(originalTiv.subtotal || "0");
            const totalAmount = parseFloat(originalTiv.totalAmount || "0");
            const vatAmount = parseFloat(originalTiv.vatAmount || "0");
            const userId = (req.user as any)?.id;

            const cnResult = await ecomDb.transaction(async (tx) => {
              const creditNoteNo = await getNextDocNo(order.companyId, "CN", salesCreditNotes, salesCreditNotes.creditNoteNo, salesCreditNotes.companyId, returnDate, undefined, ecomDb);

              const [cn] = await tx.insert(salesCreditNotes).values({
                companyId: order.companyId,
                creditNoteNo,
                creditNoteDate: returnDate,
                customerName: originalTiv.customerName || "ลูกค้า",
                customerAddress: originalTiv.customerAddress || null,
                customerTaxId: originalTiv.customerTaxId || null,
                branch: originalTiv.branch || null,
                refTaxInvoiceId: originalTiv.id,
                refTaxInvoiceNo: originalTiv.taxInvoiceNo,
                refTaxInvoiceDate: originalTiv.taxInvoiceDate,
                reason: updated.reason || "ลูกค้าขอคืนสินค้า",
                reasonDetail: `คืนสินค้าอัตโนมัติ - ${order.platform} #${order.platformOrderId}`,
                subtotal: String(subtotal.toFixed(2)),
                vatAmount: String(vatAmount.toFixed(2)),
                totalAmount: String(totalAmount.toFixed(2)),
                status: "approved",
                priceMode: "included",
                docPrefix: "CN",
                notes: `ใบลดหนี้อัตโนมัติจากการคืนสินค้า - ${order.platformOrderId}`,
                createdBy: userId,
              }).returning();

              for (const item of originalItems) {
                await tx.insert(salesCreditNoteItems).values({
                  creditNoteId: cn.id,
                  productCode: item.productCode || null,
                  productName: item.productName || "สินค้า",
                  qty: item.qty || "1",
                  unit: item.unit || "ชิ้น",
                  unitPrice: item.unitPrice || "0",
                  discount: item.discount || "0",
                  total: item.total || "0",
                  vatType: item.vatType || "vat7",
                });
              }

              await tx.update(ecommerceOrders).set({
                creditNoteId: cn.id,
                returnReason: updated.reason || "คืนสินค้า",
              }).where(eq(ecommerceOrders.id, order.id));

              return cn;
            });

            if (cnResult) {
              try {
                const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, order.companyId));
                const accountMap = new Map(allAccounts.map(a => [a.code, a]));
                const salesAccount = accountMap.get("4001000");
                const vatAccount = accountMap.get("2341000");
                const arAccount = accountMap.get("1201000");

                if (salesAccount && vatAccount && arAccount) {
                  const salesBeforeVat = subtotal - vatAmount;
                  const totalVat = vatAmount;
                  const entryNo = await getNextJournalEntryNo(order.companyId, "sales", returnDate);
                  const userId = (req.user as any)?.id;

                  await db.transaction(async (atx) => {
                    const [je] = await atx.insert(journalEntries).values({
                      companyId: order.companyId,
                      entryNo,
                      entryDate: returnDate,
                      reference: creditNoteNo,
                      description: `ใบลดหนี้ ${creditNoteNo} - คืนสินค้า ${order.platformOrderId}`,
                      journalBook: "sales",
                      contactName: originalTiv.customerName || null,
                      createdBy: userId,
                      status: "posted",
                      sourceDocType: "sales_credit_note",
                      sourceDocId: cnResult.id,
                      currencyCode: "THB",
                      exchangeRate: "1",
                    }).returning();

                    await atx.insert(journalLines).values([
                      { journalEntryId: je.id, accountId: salesAccount.id, description: "กลับรายการรายได้จากการขาย", debit: String(salesBeforeVat.toFixed(2)), credit: "0" },
                      { journalEntryId: je.id, accountId: vatAccount.id, description: "กลับรายการภาษีขาย", debit: String(totalVat.toFixed(2)), credit: "0" },
                      { journalEntryId: je.id, accountId: arAccount.id, description: "ลดยอดลูกหนี้การค้า", debit: "0", credit: String(subtotal.toFixed(2)) },
                    ]);
                  });
                }
              } catch (jeErr: any) {
                console.error("Credit note journal entry error (non-fatal):", jeErr.message);
              }
            }
          }
        } catch (cnErr: any) {
          console.error("Auto credit note error:", cnErr.message);
        }
      }
    }
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/ecommerce/returns/:id/ship", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { trackingNo, shipper } = req.body;
    if (!trackingNo) return res.status(400).json({ message: "กรุณาระบุหมายเลขพัสดุ" });
    const [updated] = await ecomDb.update(ecommerceReturns).set({
      returnStatus: "in_transit",
      returnTrackingNo: trackingNo,
      returnShipper: shipper || null,
      shippedAt: new Date(),
    }).where(eq(ecommerceReturns.id, Number(req.params.id))).returning();
    if (!updated) return res.status(404).json({ message: "ไม่พบรายการคืนสินค้า" });
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/ecommerce/returns/:id/receive", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const returnId = Number(req.params.id);
    const userId = (req.user as any)?.id;
    const { warehouseId, items, notesInternal } = req.body;
    if (!warehouseId) return res.status(400).json({ message: "กรุณาเลือกคลังสินค้าปลายทาง" });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "กรุณาระบุรายการสินค้าที่รับ" });

    const result = await db.transaction(async (tx) => {
      const [ret] = await tx.select().from(ecommerceReturns).where(eq(ecommerceReturns.id, returnId));
      if (!ret) throw new Error("ไม่พบรายการคืนสินค้า");

      for (const item of items) {
        const { itemId, receivedQty, receivedCondition, disposition, itemWarehouseId } = item;
        const targetWarehouse = itemWarehouseId || warehouseId;

        await tx.update(ecommerceReturnItems).set({
          receivedQty: String(receivedQty),
          receivedCondition,
          disposition: disposition || null,
          zone: disposition ? (disposition === "restock" ? "ready_for_sale" : "damaged") : "qc",
          qcStatus: disposition ? "completed" : "pending",
          warehouseId: targetWarehouse,
          receivedAt: new Date(),
          receivedBy: userId,
          stockUpdated: disposition === "restock",
        }).where(eq(ecommerceReturnItems.id, itemId));

        if (disposition === "restock" && receivedQty > 0) {
          const returnItem = await tx.select().from(ecommerceReturnItems).where(eq(ecommerceReturnItems.id, itemId));
          const productId = returnItem[0]?.productId;
          if (productId) {
            const [existingStock] = await tx.select().from(productStock)
              .where(and(eq(productStock.companyId, ret.companyId), eq(productStock.productId, productId)));
            if (existingStock) {
              await tx.update(productStock).set({
                quantity: sql`${productStock.quantity} + ${receivedQty}`,
              }).where(eq(productStock.id, existingStock.id));
            }

            const [existingWh] = await tx.select().from(warehouseStockLevels)
              .where(and(
                eq(warehouseStockLevels.companyId, ret.companyId),
                eq(warehouseStockLevels.productId, productId),
                eq(warehouseStockLevels.warehouseId, targetWarehouse),
              ));
            if (existingWh) {
              await tx.update(warehouseStockLevels).set({
                quantity: sql`${warehouseStockLevels.quantity} + ${receivedQty}`,
              }).where(eq(warehouseStockLevels.id, existingWh.id));
            } else {
              await tx.insert(warehouseStockLevels).values({
                companyId: ret.companyId,
                productId,
                warehouseId: targetWarehouse,
                quantity: String(receivedQty),
              });
            }
          }
        }
      }

      const [updated] = await tx.update(ecommerceReturns).set({
        returnStatus: "received",
        receivingWarehouseId: warehouseId,
        receivedAt: new Date(),
        receivedBy: userId,
        notesInternal: notesInternal || null,
      }).where(eq(ecommerceReturns.id, returnId)).returning();

      return updated;
    });

    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/ecommerce/returns/items/:itemId/qc", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const userId = (req.user as any)?.id;
    const { qcCondition, qcNotes, disposition, zone } = req.body;
    if (!qcCondition) return res.status(400).json({ message: "กรุณาระบุสภาพสินค้า" });
    const [item] = await ecomDb.select().from(ecommerceReturnItems).where(eq(ecommerceReturnItems.id, itemId));
    if (!item) return res.status(404).json({ message: "ไม่พบรายการสินค้า" });
    let autoDisposition = disposition;
    let autoZone = zone;
    if (!autoDisposition) {
      if (qcCondition === "normal") { autoDisposition = "restock"; autoZone = "ready_for_sale"; }
      else if (qcCondition === "minor_damage") { autoDisposition = "repair"; autoZone = "damaged"; }
      else if (qcCondition === "major_damage") { autoDisposition = "repair"; autoZone = "damaged"; }
      else if (qcCondition === "unsellable") { autoDisposition = "writeoff"; autoZone = "damaged"; }
    }
    let lossAmount = "0";
    if (autoDisposition === "writeoff" || autoDisposition === "repair") {
      const unitCost = Number(item.unitCost || item.refundAmount || 0);
      lossAmount = String(unitCost * Number(item.receivedQty || item.qty || 0));
    }
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(ecommerceReturnItems).set({
        qcStatus: "completed", qcCondition, qcNotes: qcNotes || null,
        qcBy: userId, qcAt: new Date(), disposition: autoDisposition,
        zone: autoZone || item.zone, lossAmount,
      }).where(eq(ecommerceReturnItems.id, itemId)).returning();
      if (autoDisposition === "restock" && Number(item.receivedQty || 0) > 0 && !item.stockUpdated) {
        const [ret] = await tx.select().from(ecommerceReturns).where(eq(ecommerceReturns.id, item.returnId));
        if (ret && item.productId) {
          const receivedQty = Number(item.receivedQty || 0);
          const [existingStock] = await tx.select().from(productStock)
            .where(and(eq(productStock.companyId, ret.companyId), eq(productStock.productId, item.productId)));
          if (existingStock) {
            await tx.update(productStock).set({ quantity: sql`${productStock.quantity} + ${receivedQty}` }).where(eq(productStock.id, existingStock.id));
          }
          const targetWarehouse = item.warehouseId || ret.receivingWarehouseId;
          if (targetWarehouse) {
            const [existingWh] = await tx.select().from(warehouseStockLevels)
              .where(and(eq(warehouseStockLevels.companyId, ret.companyId), eq(warehouseStockLevels.productId, item.productId), eq(warehouseStockLevels.warehouseId, targetWarehouse)));
            if (existingWh) {
              await tx.update(warehouseStockLevels).set({ quantity: sql`${warehouseStockLevels.quantity} + ${receivedQty}` }).where(eq(warehouseStockLevels.id, existingWh.id));
            } else {
              await tx.insert(warehouseStockLevels).values({ companyId: ret.companyId, productId: item.productId, warehouseId: targetWarehouse, quantity: String(receivedQty) });
            }
          }
          await tx.update(ecommerceReturnItems).set({ stockUpdated: true }).where(eq(ecommerceReturnItems.id, itemId));
        }
      }
      return updated;
    });
    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/ecommerce/returns/items/:itemId/zone", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const itemId = Number(req.params.itemId);
    const { zone } = req.body;
    if (!zone) return res.status(400).json({ message: "กรุณาระบุโซน" });
    const [updated] = await ecomDb.update(ecommerceReturnItems).set({ zone }).where(eq(ecommerceReturnItems.id, itemId)).returning();
    if (!updated) return res.status(404).json({ message: "ไม่พบรายการ" });
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Low Stock Alert ============

app.get("/api/ecommerce/low-stock", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const lowStockProducts = await db.select({
      id: products.id,
      code: products.code,
      name: products.name,
      unit: products.unit,
      lowStockThreshold: products.lowStockThreshold,
      currentStock: sql<number>`COALESCE((SELECT SUM(CAST(${warehouseStockLevels.quantity} AS numeric)) FROM ${warehouseStockLevels} WHERE ${warehouseStockLevels.productId} = ${products.id}), 0)`,
    })
      .from(products)
      .where(and(
        eq(products.companyId, companyId),
        eq(products.active, true),
        sql`${products.lowStockThreshold} > 0`,
        sql`COALESCE((SELECT SUM(CAST(${warehouseStockLevels.quantity} AS numeric)) FROM ${warehouseStockLevels} WHERE ${warehouseStockLevels.productId} = ${products.id}), 0) < ${products.lowStockThreshold}`
      ))
      .orderBy(sql`COALESCE((SELECT SUM(CAST(${warehouseStockLevels.quantity} AS numeric)) FROM ${warehouseStockLevels} WHERE ${warehouseStockLevels.productId} = ${products.id}), 0) ASC`);
    res.json(lowStockProducts);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/ecommerce/stock-summary", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const allProducts = await db.select({
      id: products.id,
      code: products.code,
      name: products.name,
      unit: products.unit,
      lowStockThreshold: products.lowStockThreshold,
      currentStock: sql<number>`COALESCE((SELECT SUM(CAST(${warehouseStockLevels.quantity} AS numeric)) FROM ${warehouseStockLevels} WHERE ${warehouseStockLevels.productId} = ${products.id}), 0)`,
    })
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.active, true)))
      .orderBy(products.name);
    const lowStockCount = allProducts.filter(p => (p.lowStockThreshold || 0) > 0 && Number(p.currentStock) < (p.lowStockThreshold || 0)).length;
    const outOfStockCount = allProducts.filter(p => Number(p.currentStock) <= 0).length;
    res.json({ products: allProducts, lowStockCount, outOfStockCount, totalProducts: allProducts.length });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ LINE Tracking Notification ============

app.post("/api/ecommerce/orders/:id/send-tracking", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const [order] = await ecomDb.select().from(ecommerceOrders).where(eq(ecommerceOrders.id, orderId));
    if (!order) return res.status(404).json({ message: "ไม่พบคำสั่งซื้อ" });
    if (!order.trackingNo) return res.status(400).json({ message: "ยังไม่มีเลขพัสดุ" });

    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!lineToken) return res.status(400).json({ message: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" });

    const buyerLineId = req.body.lineUserId;
    if (!buyerLineId) return res.status(400).json({ message: "ไม่มี LINE User ID ของผู้ซื้อ" });

    const trackingUrl = order.shippingProvider ?
      getTrackingUrl(order.shippingProvider, order.trackingNo) : null;

    const [company] = order.companyId ? await db.select({ name: companies.name, logoUrl: companies.logoUrl }).from(companies).where(eq(companies.id, order.companyId)) : [null];
    const companyName = company?.name || "E-Tax Center";

    const flexBubble: any = {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box", layout: "horizontal", paddingAll: "15px",
        backgroundColor: "#fb9678",
        contents: [
          { type: "text", text: "📦 แจ้งจัดส่งสินค้า", color: "#ffffff", size: "md", weight: "bold", flex: 1 },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "15px",
        contents: [
          { type: "text", text: companyName, size: "xs", color: "#999999" },
          { type: "separator", margin: "md" },
          { type: "box", layout: "horizontal", margin: "md", contents: [
            { type: "text", text: "คำสั่งซื้อ", size: "sm", color: "#555555", flex: 3 },
            { type: "text", text: order.orderNo || order.platformOrderId || "-", size: "sm", color: "#111111", flex: 5, align: "end" },
          ]},
          { type: "box", layout: "horizontal", margin: "sm", contents: [
            { type: "text", text: "เลขพัสดุ", size: "sm", color: "#555555", flex: 3 },
            { type: "text", text: order.trackingNo, size: "sm", color: "#111111", weight: "bold", flex: 5, align: "end" },
          ]},
          ...(order.shippingProvider ? [{ type: "box", layout: "horizontal", margin: "sm", contents: [
            { type: "text", text: "ขนส่ง", size: "sm", color: "#555555", flex: 3 },
            { type: "text", text: order.shippingProvider, size: "sm", color: "#111111", flex: 5, align: "end" },
          ]}] : []),
        ],
      },
    };

    if (trackingUrl) {
      flexBubble.footer = {
        type: "box", layout: "vertical", spacing: "sm", paddingAll: "15px",
        contents: [
          { type: "button", action: { type: "uri", label: "ติดตามพัสดุ", uri: trackingUrl }, style: "primary", color: "#03c9d7", height: "sm" },
        ],
      };
    }

    const flexMessage = {
      type: "flex",
      altText: `📦 แจ้งจัดส่งสินค้า เลขพัสดุ: ${order.trackingNo}`,
      contents: flexBubble,
    };

    const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lineToken}`,
      },
      body: JSON.stringify({
        to: buyerLineId,
        messages: [flexMessage],
      }),
    });

    if (!lineResponse.ok) {
      const error = await lineResponse.text();
      return res.status(400).json({ message: `LINE API error: ${error}` });
    }

    res.json({ message: "ส่งแจ้งเตือนเลขพัสดุผ่าน LINE สำเร็จ" });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

const getTrackingUrl = (provider: string, trackingNo: string): string | null => {
  const urls: Record<string, string> = {
    "Kerry": `https://th.kerryexpress.com/th/track/?track=${trackingNo}`,
    "Flash": `https://www.flashexpress.co.th/fle/tracking?se=${trackingNo}`,
    "J&T": `https://www.jtexpress.co.th/index/query/gzquery.html?billcode=${trackingNo}`,
    "Thailand Post": `https://track.thailandpost.co.th/?trackNumber=${trackingNo}`,
    "Ninja Van": `https://www.ninjavan.co/th-th/tracking?id=${trackingNo}`,
    "DHL": `https://www.dhl.com/th-th/home/tracking.html?tracking-id=${trackingNo}`,
    "Best Express": `https://www.best-inc.co.th/track?bills=${trackingNo}`,
    "SCG Express": `https://www.scgexpress.co.th/tracking/detail/${trackingNo}`,
  };
  return urls[provider] || null;
};

app.post("/api/ecommerce/daily-summary", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const { companyId, date } = req.body;
    if (!companyId || !date) return res.status(400).json({ message: "กรุณาระบุ companyId และ date" });

    const [comp] = await db.select().from(companies).where(eq(companies.id, Number(companyId)));
    if (!comp || (user.role !== "super_admin" && comp.tenantId !== user.tenantId))
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const ecPrefixes = Object.values(PLATFORM_DOC_PREFIX);

    const dayInvoices = await ecomDb.select().from(taxInvoices)
      .where(and(
        eq(taxInvoices.companyId, Number(companyId)),
        eq(taxInvoices.taxInvoiceDate, date),
        sql`${taxInvoices.status} != 'cancelled'`,
        sql`${taxInvoices.summaryTaxInvoiceId} IS NULL`,
        sql`${taxInvoices.isSummaryInvoice} = false`,
        inArray(taxInvoices.docPrefix, ecPrefixes),
      ));

    if (dayInvoices.length === 0) return res.json({ message: "ไม่มีใบกำกับภาษีในวันที่เลือก", summaries: [] });

    const abbreviated = dayInvoices.filter(inv => !inv.customerTaxId || inv.customerTaxId.trim() === "" || inv.customerTaxId === "-");
    const fullTiv = dayInvoices.filter(inv => inv.customerTaxId && inv.customerTaxId.trim() !== "" && inv.customerTaxId !== "-");

    if (abbreviated.length === 0) return res.json({ message: `ทุกใบ (${dayInvoices.length}) เป็นใบเต็มรูป ไม่ต้องสรุป`, summaries: [] });

    const byPrefix: Record<string, typeof abbreviated> = {};
    for (const inv of abbreviated) {
      const pfx = inv.docPrefix || "TIV";
      if (!byPrefix[pfx]) byPrefix[pfx] = [];
      byPrefix[pfx].push(inv);
    }

    const platformNames: Record<string, string> = {};
    for (const [key, prefix] of Object.entries(PLATFORM_DOC_PREFIX)) {
      platformNames[prefix] = (PLATFORM_DISPLAY_NAME[key] || key).toUpperCase();
    }

    const summaries: any[] = [];

    for (const [prefix, invoices] of Object.entries(byPrefix)) {
      const platform = platformNames[prefix] || prefix;
      let totalSubtotal = 0, totalVat = 0, totalAmount = 0, totalDiscount = 0;
      for (const inv of invoices) {
        totalSubtotal += parseFloat(inv.subtotal || "0");
        totalVat += parseFloat(inv.vatAmount || "0");
        totalAmount += parseFloat(inv.totalAmount || "0");
        totalDiscount += parseFloat(inv.discountAmount || "0");
      }

      const summaryPrefix = prefix + "S";
      const summaryNo = await getNextDocNo(Number(companyId), summaryPrefix, taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId, date, undefined, ecomDb);
      const summaryDesc = `สรุปยอดขาย ${platform} วันที่ ${date} (${invoices.length} บิล)`;

      const [summaryTiv] = await ecomDb.insert(taxInvoices).values({
        companyId: Number(companyId),
        taxInvoiceNo: summaryNo,
        taxInvoiceDate: date,
        customerName: summaryDesc,
        subtotal: String(totalSubtotal.toFixed(2)),
        discountAmount: String(totalDiscount.toFixed(2)),
        vatAmount: String(totalVat.toFixed(2)),
        totalAmount: String(totalAmount.toFixed(2)),
        status: "approved",
        priceMode: "included",
        docPrefix: summaryPrefix,
        isSummaryInvoice: true,
        notes: `รวมใบกำกับอย่างย่อ ${platform} จำนวน ${invoices.length} ใบ วันที่ ${date}`,
        createdBy: user.id,
      }).returning();

      const abbrevIds = invoices.map(inv => inv.id);
      await ecomDb.update(taxInvoices)
        .set({ summaryTaxInvoiceId: summaryTiv.id })
        .where(inArray(taxInvoices.id, abbrevIds));

      try {
        const [pmRow] = await db.select().from(paymentMethods)
          .where(and(
            eq(paymentMethods.companyId, Number(companyId)),
            or(eq(paymentMethods.name, "เครดิต"), eq(paymentMethods.nameTh, "เครดิต"))
          ));
        const pmAccCode = pmRow?.accountCode || undefined;

        await createAutoJournalEntry({
          companyId: Number(companyId),
          documentType: "tax_invoice",
          sourceDocType: "tax_invoice",
          sourceDocId: summaryTiv.id,
          docNo: summaryNo,
          docDate: date,
          customerName: summaryDesc,
          subtotal: String((totalAmount - totalVat).toFixed(2)),
          vatAmount: String(totalVat.toFixed(2)),
          totalAmount: String(totalAmount.toFixed(2)),
          withholdingTax: "0",
          userId: user.id,
          paymentMethod: "เครดิต",
          paymentMethodAccountCode: pmAccCode,
        });
      } catch (e: any) {
        console.error(`[EC Summary] Journal error for ${summaryNo}:`, e.message);
      }

      summaries.push({
        id: summaryTiv.id,
        taxInvoiceNo: summaryNo,
        platform,
        abbreviatedCount: invoices.length,
        fullTivCount: fullTiv.filter(f => f.docPrefix === prefix).length,
        totalAmount: totalAmount.toFixed(2),
        vatAmount: totalVat.toFixed(2),
      });

      console.log(`[EC Summary] ${summaryNo} created: ${platform} ${invoices.length} abbreviated invoices → 1 summary ฿${totalAmount.toFixed(2)}`);
    }

    res.json({ message: `สร้างใบสรุปสำเร็จ ${summaries.length} ใบ`, summaries });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/ecommerce/daily-summary/status", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const date = String(req.query.date || "");
    if (!companyId || !date) return res.status(400).json({ message: "companyId and date required" });

    const ecPrefixes = Object.values(PLATFORM_DOC_PREFIX);
    const summaryPrefixes = ecPrefixes.map(p => p + "S");

    const existingSummaries = await ecomDb.select().from(taxInvoices)
      .where(and(
        eq(taxInvoices.companyId, companyId),
        eq(taxInvoices.taxInvoiceDate, date),
        eq(taxInvoices.isSummaryInvoice, true),
        inArray(taxInvoices.docPrefix, summaryPrefixes),
      ));

    const unsummarized = await ecomDb.select({ cnt: count() }).from(taxInvoices)
      .where(and(
        eq(taxInvoices.companyId, companyId),
        eq(taxInvoices.taxInvoiceDate, date),
        sql`${taxInvoices.status} != 'cancelled'`,
        sql`${taxInvoices.summaryTaxInvoiceId} IS NULL`,
        sql`${taxInvoices.isSummaryInvoice} = false`,
        inArray(taxInvoices.docPrefix, ecPrefixes),
        sql`(${taxInvoices.customerTaxId} IS NULL OR ${taxInvoices.customerTaxId} = '' OR ${taxInvoices.customerTaxId} = '-')`,
      ));

    res.json({
      date,
      summaries: existingSummaries.map(s => ({
        id: s.id,
        taxInvoiceNo: s.taxInvoiceNo,
        docPrefix: s.docPrefix,
        totalAmount: s.totalAmount,
        vatAmount: s.vatAmount,
        notes: s.notes,
      })),
      unsummarizedCount: Number(unsummarized[0]?.cnt || 0),
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/ecommerce/summary-invoice/:id/details", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const summaryId = Number(req.params.id);
    const [summary] = await ecomDb.select().from(taxInvoices).where(eq(taxInvoices.id, summaryId));
    if (!summary || !summary.isSummaryInvoice) return res.status(404).json({ message: "ไม่พบใบสรุป" });

    const details = await db.select({
      id: taxInvoices.id,
      taxInvoiceNo: taxInvoices.taxInvoiceNo,
      taxInvoiceDate: taxInvoices.taxInvoiceDate,
      customerName: taxInvoices.customerName,
      refDoc: taxInvoices.refDoc,
      subtotal: taxInvoices.subtotal,
      vatAmount: taxInvoices.vatAmount,
      totalAmount: taxInvoices.totalAmount,
      docPrefix: taxInvoices.docPrefix,
    }).from(taxInvoices)
      .where(eq(taxInvoices.summaryTaxInvoiceId, summaryId))
      .orderBy(taxInvoices.taxInvoiceNo);

    res.json({ summary, details, count: details.length });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/ecommerce/quick-invoice", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId || (req.user as any)?.primaryCompanyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });

    const {
      customerName, customerTaxId, customerAddress, customerPhone,
      items, paymentMethod, notes, docDate,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ" });
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "ไม่พบบริษัท" });

    const isVat = company.vatRegistered !== false;
    const invoiceDate = docDate || new Date().toISOString().split("T")[0];

    let subtotal = 0;
    let totalVat = 0;
    const processedItems = items.map((item: any, idx: number) => {
      const qty = parseFloat(item.qty || "1");
      const unitPrice = parseFloat(item.unitPrice || "0");
      const discount = parseFloat(item.discount || "0");
      const lineTotal = qty * unitPrice - discount;
      const vatType = item.vatType || (isVat ? "vat7" : "vat0");

      let itemVat = 0;
      let itemBeforeVat = lineTotal;
      if (vatType === "vat7" && isVat) {
        itemBeforeVat = lineTotal / 1.07;
        itemVat = lineTotal - itemBeforeVat;
      }

      subtotal += lineTotal;
      totalVat += itemVat;

      return {
        productCode: item.productCode || null,
        productName: item.productName || `สินค้า #${idx + 1}`,
        qty: String(qty),
        unit: item.unit || "ชิ้น",
        unitPrice: unitPrice.toFixed(2),
        discount: discount.toFixed(2),
        total: lineTotal.toFixed(2),
        vatType,
      };
    });

    const totalAmount = subtotal;
    const subtotalBeforeVat = subtotal - totalVat;

    const taxInvoiceNo = await getNextDocNo(
      companyId, "WK", taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId,
      invoiceDate, "tax_invoice", ecomDb
    );

    const result = await ecomDb.transaction(async (tx: any) => {
      const [doc] = await tx.insert(taxInvoices).values({
        companyId,
        taxInvoiceNo,
        taxInvoiceDate: invoiceDate,
        customerName: customerName || "ลูกค้าทั่วไป",
        customerTaxId: customerTaxId || null,
        customerAddress: customerAddress || null,
        customerPhone: customerPhone || null,
        subtotal: subtotalBeforeVat.toFixed(2),
        vatAmount: totalVat.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        paymentMethod: paymentMethod || "เงินสด",
        notes: notes || "ขายหน้าร้าน (Quick Invoice)",
        status: "approved",
        docPrefix: "WK",
        refDoc: "Walk-in",
        createdBy: (req.user as any)?.id,
      }).returning();

      for (const item of processedItems) {
        await tx.insert(taxInvoiceItems).values({
          taxInvoiceId: doc.id,
          ...item,
        });
      }

      return doc;
    });

    res.json({
      success: true,
      taxInvoice: result,
      message: `ออกใบกำกับภาษี ${taxInvoiceNo} สำเร็จ`,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/ecommerce/quick-invoice/recent", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId || (req.user as any)?.primaryCompanyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const docs = await ecomDb.select().from(taxInvoices)
      .where(and(
        eq(taxInvoices.companyId, companyId),
        eq(taxInvoices.docPrefix, "WK"),
      ))
      .orderBy(desc(taxInvoices.id))
      .limit(limit);

    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/ecommerce/team", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const ac = await checkDocOwnership(companyId, req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });

    const members = await db.select({
      id: ecommerceTeamMembers.id,
      companyId: ecommerceTeamMembers.companyId,
      userId: ecommerceTeamMembers.userId,
      role: ecommerceTeamMembers.role,
      permissions: ecommerceTeamMembers.permissions,
      assignedStoreIds: ecommerceTeamMembers.assignedStoreIds,
      nickname: ecommerceTeamMembers.nickname,
      active: ecommerceTeamMembers.active,
      createdAt: ecommerceTeamMembers.createdAt,
      userFullName: users.fullName,
      username: users.username,
      userRole: users.role,
    }).from(ecommerceTeamMembers)
      .leftJoin(users, eq(ecommerceTeamMembers.userId, users.id))
      .where(eq(ecommerceTeamMembers.companyId, companyId))
      .orderBy(ecommerceTeamMembers.role, ecommerceTeamMembers.id);

    const connections = await ecomDb.select({
      id: ecommerceConnections.id,
      storeName: ecommerceConnections.storeName,
      platform: ecommerceConnections.platform,
    }).from(ecommerceConnections).where(eq(ecommerceConnections.companyId, companyId));

    res.json({ members, stores: connections });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/ecommerce/team/available-users", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const ac = await checkDocOwnership(companyId, req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });

    const user = req.user as any;
    const tenantId = user.tenantId;
    if (!tenantId) return res.json([]);

    const tenantUsers = await db.select({
      id: users.id,
      fullName: users.fullName,
      username: users.username,
      role: users.role,
    }).from(users).where(eq(users.tenantId, tenantId)).orderBy(users.fullName);

    const existing = await db.select({ userId: ecommerceTeamMembers.userId })
      .from(ecommerceTeamMembers)
      .where(eq(ecommerceTeamMembers.companyId, companyId));
    const existingIds = new Set(existing.map(e => e.userId));

    const available = tenantUsers.filter(u => !existingIds.has(u.id));
    res.json(available);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

const VALID_ECOM_ROLES = ["manager", "operator", "viewer"] as const;
const VALID_ECOM_PERMISSIONS = ["orders", "fulfillment", "inventory", "returns", "analytics", "settlements", "settings"] as const;

app.post("/api/ecommerce/team", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const { companyId, userId, role, permissions, assignedStoreIds, nickname } = req.body;
    if (!companyId || !userId) return res.status(400).json({ message: "กรุณาระบุบริษัทและผู้ใช้งาน" });
    const cid = Number(companyId);
    const uid = Number(userId);
    const ac = await checkDocOwnership(cid, req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });

    const caller = req.user as any;
    const [targetUser] = await db.select({ id: users.id, tenantId: users.tenantId }).from(users).where(eq(users.id, uid));
    if (!targetUser || targetUser.tenantId !== caller.tenantId) return res.status(403).json({ message: "ไม่สามารถเพิ่มผู้ใช้จาก tenant อื่น" });

    const safeRole = VALID_ECOM_ROLES.includes(role) ? role : "operator";
    const safePerms = Array.isArray(permissions)
      ? permissions.filter((p: string) => (VALID_ECOM_PERMISSIONS as readonly string[]).includes(p))
      : ["orders", "fulfillment"];

    let safeStoreIds: number[] | null = null;
    if (Array.isArray(assignedStoreIds) && assignedStoreIds.length > 0) {
      const numIds = assignedStoreIds.map(Number).filter(n => !isNaN(n));
      const validStores = await ecomDb.select({ id: ecommerceConnections.id })
        .from(ecommerceConnections)
        .where(and(eq(ecommerceConnections.companyId, cid), inArray(ecommerceConnections.id, numIds)));
      safeStoreIds = validStores.map(s => s.id);
    }

    const [existing] = await db.select().from(ecommerceTeamMembers)
      .where(and(eq(ecommerceTeamMembers.companyId, cid), eq(ecommerceTeamMembers.userId, uid)));
    if (existing) return res.status(400).json({ message: "ผู้ใช้งานนี้อยู่ในทีมแล้ว" });

    const safeNickname = typeof nickname === "string" && nickname.trim() ? nickname.trim().slice(0, 100) : null;

    const [member] = await db.insert(ecommerceTeamMembers).values({
      companyId: cid,
      userId: uid,
      role: safeRole,
      permissions: safePerms,
      assignedStoreIds: safeStoreIds,
      nickname: safeNickname,
      active: true,
    }).returning();

    const [userInfo] = await db.select({ fullName: users.fullName, username: users.username, role: users.role })
      .from(users).where(eq(users.id, member.userId));

    res.status(201).json({ ...member, userFullName: userInfo?.fullName, username: userInfo?.username, userRole: userInfo?.role });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.patch("/api/ecommerce/team/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(ecommerceTeamMembers).where(eq(ecommerceTeamMembers.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบสมาชิก" });
    const ac = await checkDocOwnership(existing.companyId, req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });

    const { role, permissions, assignedStoreIds, nickname, active } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (role !== undefined && VALID_ECOM_ROLES.includes(role)) updates.role = role;
    if (permissions !== undefined) {
      updates.permissions = Array.isArray(permissions)
        ? permissions.filter((p: string) => (VALID_ECOM_PERMISSIONS as readonly string[]).includes(p))
        : [];
    }
    if (assignedStoreIds !== undefined) {
      if (Array.isArray(assignedStoreIds) && assignedStoreIds.length > 0) {
        const numIds = assignedStoreIds.map(Number).filter(n => !isNaN(n));
        const validStores = await ecomDb.select({ id: ecommerceConnections.id })
          .from(ecommerceConnections)
          .where(and(eq(ecommerceConnections.companyId, existing.companyId), inArray(ecommerceConnections.id, numIds)));
        updates.assignedStoreIds = validStores.map(s => s.id);
      } else {
        updates.assignedStoreIds = null;
      }
    }
    if (nickname !== undefined) updates.nickname = typeof nickname === "string" && nickname.trim() ? nickname.trim().slice(0, 100) : null;
    if (active !== undefined && typeof active === "boolean") updates.active = active;

    const [updated] = await db.update(ecommerceTeamMembers).set(updates)
      .where(eq(ecommerceTeamMembers.id, id)).returning();

    const [userInfo] = await db.select({ fullName: users.fullName, username: users.username, role: users.role })
      .from(users).where(eq(users.id, updated.userId));

    res.json({ ...updated, userFullName: userInfo?.fullName, username: userInfo?.username, userRole: userInfo?.role });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/ecommerce/team/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(ecommerceTeamMembers).where(eq(ecommerceTeamMembers.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบสมาชิก" });
    const ac = await checkDocOwnership(existing.companyId, req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });

    await db.delete(ecommerceTeamMembers).where(eq(ecommerceTeamMembers.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

}

