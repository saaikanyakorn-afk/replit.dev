import type { Express, Request, Response } from "express";
import { db } from "../db";
import { ecomDb } from "../ecom-db";
import { eq, desc, and, gte, lte, count, sum , sql } from "drizzle-orm";
import { activeProducts } from "@shared/schema-extra";
import { companies, ecommerceOrders, activityLogs, products, adCampaigns, adSpendEntries, ecommerceConnections, ecommerceProductMappings } from "@shared/schema";
import { requireAuth, requireModule, checkDocOwnership } from "../route-middleware";
import { logActivity } from "../route-helpers";

export function registerAdCostRoutes(app: Express) {
// ==================== AD COST TRACKING ====================
app.get("/api/ads/campaigns", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const list = await ecomDb.select().from(adCampaigns).where(eq(adCampaigns.companyId, companyId)).orderBy(desc(adCampaigns.createdAt));
    res.json(list);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/ads/campaigns", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const data = insertAdCampaignSchema.parse({ ...req.body, tenantId: user.tenantId });
    const [company] = await db.select().from(companies).where(eq(companies.id, data.companyId));
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const [created] = await ecomDb.insert(adCampaigns).values(data).returning();
    res.json(created);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.put("/api/ads/campaigns/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [existing] = await ecomDb.select().from(adCampaigns).where(eq(adCampaigns.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบแคมเปญ" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const [company] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const { companyId, tenantId, ...updateData } = req.body;
    const [updated] = await ecomDb.update(adCampaigns).set(updateData).where(eq(adCampaigns.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/ads/campaigns/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [existing] = await ecomDb.select().from(adCampaigns).where(eq(adCampaigns.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบแคมเปญ" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const [company] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    await db.delete(adSpendEntries).where(eq(adSpendEntries.campaignId, id));
    await ecomDb.delete(adCampaigns).where(eq(adCampaigns.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/ads/spend", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const platform = req.query.platform as string;
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : undefined;

    const conditions: any[] = [eq(adSpendEntries.companyId, companyId)];
    if (startDate) conditions.push(gte(adSpendEntries.spendDate, startDate));
    if (endDate) conditions.push(lte(adSpendEntries.spendDate, endDate));
    if (platform) conditions.push(eq(adSpendEntries.platform, platform));
    if (campaignId) conditions.push(eq(adSpendEntries.campaignId, campaignId));

    const list = await db.select().from(adSpendEntries).where(and(...conditions)).orderBy(desc(adSpendEntries.spendDate));
    res.json(list);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/ads/spend", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const data = insertAdSpendSchema.parse({ ...req.body, tenantId: user.tenantId });
    const [company] = await db.select().from(companies).where(eq(companies.id, data.companyId));
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const [created] = await db.insert(adSpendEntries).values(data).returning();
    res.json(created);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.put("/api/ads/spend/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(adSpendEntries).where(eq(adSpendEntries.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบรายการ" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const [company] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const { companyId, tenantId, ...updateData } = req.body;
    const [updated] = await db.update(adSpendEntries).set(updateData).where(eq(adSpendEntries.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/ads/spend/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(adSpendEntries).where(eq(adSpendEntries.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบรายการ" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const [company] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    await db.delete(adSpendEntries).where(eq(adSpendEntries.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/ads/summary", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const spendConditions: any[] = [eq(adSpendEntries.companyId, companyId)];
    if (startDate) spendConditions.push(gte(adSpendEntries.spendDate, startDate));
    if (endDate) spendConditions.push(lte(adSpendEntries.spendDate, endDate));

    const [totals] = await db.select({
      totalSpend: sql<string>`COALESCE(sum(${adSpendEntries.amount}::numeric), 0)`,
      totalImpressions: sql<number>`COALESCE(sum(${adSpendEntries.impressions}), 0)::int`,
      totalClicks: sql<number>`COALESCE(sum(${adSpendEntries.clicks}), 0)::int`,
      totalConversions: sql<number>`COALESCE(sum(${adSpendEntries.conversions}), 0)::int`,
      totalAdRevenue: sql<string>`COALESCE(sum(${adSpendEntries.revenue}::numeric), 0)`,
    }).from(adSpendEntries).where(and(...spendConditions));

    const orderConditions: any[] = [eq(ecommerceOrders.companyId, companyId)];
    if (startDate) orderConditions.push(gte(ecommerceOrders.orderDate, startDate));
    if (endDate) orderConditions.push(lte(ecommerceOrders.orderDate, endDate));

    const [orderTotals] = await ecomDb.select({
      totalOrderRevenue: sql<string>`COALESCE(sum(${ecommerceOrders.totalAmount}::numeric), 0)`,
      totalOrderCount: sql<number>`count(*)::int`,
    }).from(ecommerceOrders).where(and(...orderConditions));

    const totalSpend = parseFloat(totals?.totalSpend || "0");
    const totalRevenue = parseFloat(orderTotals?.totalOrderRevenue || "0");
    const roas = totalSpend > 0 ? (totalRevenue / totalSpend) : 0;
    const cpa = (totals?.totalConversions || 0) > 0 ? totalSpend / (totals?.totalConversions || 1) : 0;
    const cpc = (totals?.totalClicks || 0) > 0 ? totalSpend / (totals?.totalClicks || 1) : 0;
    const ctr = (totals?.totalImpressions || 0) > 0 ? ((totals?.totalClicks || 0) / (totals?.totalImpressions || 1)) * 100 : 0;

    const byPlatform = await db.select({
      platform: adSpendEntries.platform,
      totalSpend: sql<string>`COALESCE(sum(${adSpendEntries.amount}::numeric), 0)`,
      totalClicks: sql<number>`COALESCE(sum(${adSpendEntries.clicks}), 0)::int`,
      totalConversions: sql<number>`COALESCE(sum(${adSpendEntries.conversions}), 0)::int`,
      totalRevenue: sql<string>`COALESCE(sum(${adSpendEntries.revenue}::numeric), 0)`,
    }).from(adSpendEntries).where(and(...spendConditions)).groupBy(adSpendEntries.platform);

    const byMonth = await db.select({
      month: sql<string>`to_char(${adSpendEntries.spendDate}, 'YYYY-MM')`,
      totalSpend: sql<string>`COALESCE(sum(${adSpendEntries.amount}::numeric), 0)`,
      totalClicks: sql<number>`COALESCE(sum(${adSpendEntries.clicks}), 0)::int`,
      totalConversions: sql<number>`COALESCE(sum(${adSpendEntries.conversions}), 0)::int`,
    }).from(adSpendEntries).where(and(...spendConditions)).groupBy(sql`to_char(${adSpendEntries.spendDate}, 'YYYY-MM')`).orderBy(sql`to_char(${adSpendEntries.spendDate}, 'YYYY-MM')`);

    res.json({
      totalSpend, totalRevenue, roas: roas.toFixed(2), cpa: cpa.toFixed(2), cpc: cpc.toFixed(2), ctr: ctr.toFixed(2),
      totalImpressions: totals?.totalImpressions || 0,
      totalClicks: totals?.totalClicks || 0,
      totalConversions: totals?.totalConversions || 0,
      totalOrders: orderTotals?.totalOrderCount || 0,
      byPlatform, byMonth,
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/activity-logs", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (company.tenantId && user.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const entityType = req.query.entityType as string | undefined;
    const action = req.query.action as string | undefined;

    const conditions = [eq(activityLogs.companyId, companyId)];
    if (entityType) conditions.push(eq(activityLogs.entityType, entityType));
    if (action) conditions.push(eq(activityLogs.action, action));

    const whereClause = and(...conditions);

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(activityLogs)
      .where(whereClause);

    const logs = await db.select().from(activityLogs)
      .where(whereClause)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ logs, total: countResult?.count || 0 });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/ecommerce/clone/connections", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = parseInt(req.query.companyId as string);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const company = await db.select().from(companies).where(eq(companies.id, companyId)).then(r => r[0]);
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    const connections = await ecomDb.select().from(ecommerceConnections)
      .where(eq(ecommerceConnections.companyId, companyId))
      .orderBy(ecommerceConnections.platform, ecommerceConnections.shopName);
    res.json(connections);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/ecommerce/clone/products", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = parseInt(req.query.companyId as string);
    const connectionId = parseInt(req.query.connectionId as string);
    if (!companyId || !connectionId) return res.status(400).json({ message: "companyId and connectionId required" });
    const company = await db.select().from(companies).where(eq(companies.id, companyId)).then(r => r[0]);
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    const conn = await ecomDb.select().from(ecommerceConnections)
      .where(and(eq(ecommerceConnections.id, connectionId), eq(ecommerceConnections.companyId, companyId)))
      .then(r => r[0]);
    if (!conn) return res.status(404).json({ message: "ไม่พบร้านค้า" });

    const mappedProducts = await db.select({
      mappingId: ecommerceProductMappings.id,
      platformSku: ecommerceProductMappings.platformSku,
      platformProductId: ecommerceProductMappings.platformProductId,
      platformProductName: ecommerceProductMappings.platformProductName,
      productId: products.id,
      productCode: products.code,
      productName: products.name,
      productPrice: products.price,
      productCost: products.cost,
      productDescription: products.description,
      productCategory: products.category,
      productUnit: products.unit,
      productVatType: products.vatType,
    }).from(ecommerceProductMappings)
      .innerJoin(products, eq(ecommerceProductMappings.productId, products.id))
      .where(and(
        eq(ecommerceProductMappings.companyId, companyId),
        eq(ecommerceProductMappings.connectionId, connectionId),
      ))
      .orderBy(products.name);

    const unmappedProducts = await db.select({
      productId: products.id,
      productCode: products.code,
      productName: products.name,
      productPrice: products.price,
      productCost: products.cost,
      productDescription: products.description,
      productCategory: products.category,
      productUnit: products.unit,
      productVatType: products.vatType,
    }).from(products)
      .innerJoin(activeProducts, eq(activeProducts.id, products.id))
      .where(eq(products.companyId, companyId))
      .orderBy(products.name);

    res.json({ mappedProducts, allProducts: unmappedProducts });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/ecommerce/clone", requireAuth, requireModule("ecommerce"), async (req, res) => {
  try {
    const user = req.user as any;
    const { companyId, sourceConnectionId, targetConnectionId, selectedProducts } = req.body;
    if (!companyId || !targetConnectionId || !selectedProducts?.length) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
    }
    const company = await db.select().from(companies).where(eq(companies.id, companyId)).then(r => r[0]);
    if (!company || (company.tenantId && user.tenantId && company.tenantId !== user.tenantId)) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    const targetConn = await ecomDb.select().from(ecommerceConnections)
      .where(and(eq(ecommerceConnections.id, targetConnectionId), eq(ecommerceConnections.companyId, companyId)))
      .then(r => r[0]);
    if (!targetConn) return res.status(404).json({ message: "ไม่พบร้านค้าปลายทาง" });

    let cloned = 0;
    let skipped = 0;

    for (const item of selectedProducts) {
      const productId = item.productId;
      if (!productId) { skipped++; continue; }

      const prod = await db.select().from(products)
        .where(and(eq(products.id, productId), eq(products.companyId, companyId)))
        .then(r => r[0]);
      if (!prod) { skipped++; continue; }

      const sku = item.platformSku || prod.code || `SKU-${productId}-${targetConn.platform}`;

      const existingByProduct = await ecomDb.select().from(ecommerceProductMappings)
        .where(and(
          eq(ecommerceProductMappings.companyId, companyId),
          eq(ecommerceProductMappings.connectionId, targetConnectionId),
          eq(ecommerceProductMappings.productId, productId),
        )).then(r => r[0]);
      if (existingByProduct) { skipped++; continue; }

      const existingBySku = await ecomDb.select().from(ecommerceProductMappings)
        .where(and(
          eq(ecommerceProductMappings.companyId, companyId),
          eq(ecommerceProductMappings.connectionId, targetConnectionId),
          eq(ecommerceProductMappings.platformSku, sku),
        )).then(r => r[0]);
      if (existingBySku) { skipped++; continue; }

      await ecomDb.insert(ecommerceProductMappings).values({
        companyId,
        productId,
        connectionId: targetConnectionId,
        platformSku: sku,
        platformProductId: item.platformProductId || null,
        platformProductName: item.name || prod.name,
        syncStock: true,
        syncStatus: "pending",
      });
      cloned++;
    }

    await logActivity({
      companyId,
      tenantId: company.tenantId || undefined,
      userId: user.id,
      userName: user.username || user.username,
      action: "clone_products",
      entityType: "ecommerce",
      entityName: `โคลนสินค้า ${cloned} รายการไปยัง ${targetConn.shopName}`,
      details: `โคลน ${cloned}, ข้าม ${skipped}`,
    });

    res.json({ cloned, skipped, total: selectedProducts.length });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

}
