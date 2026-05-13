import type { Express } from "express";
import { db } from "../db";
import { ecomDb } from "../ecom-db";
import { eq, and, sql, gte, lte, desc, asc, inArray } from "drizzle-orm";
import {
  ecommerceOrders,
  ecommerceOrderItems,
  ecommerceConnections,
  ecommerceSettlements,
  products,
  productStock,
  liveSessions,
  liveSessionProducts,
  adCampaigns,
  adSpendEntries,
  companies,
} from "@shared/schema";
import { requireAuth, requireModule } from "../route-middleware";

function resolveCompanyId(query: any, user: any): number | null {
  if (query.companyId) return Number(query.companyId);
  if (user.companyId) return Number(user.companyId);
  return null;
}

function parseFilters(query: any, user: any) {
  const companyId = resolveCompanyId(query, user);
  const dateFrom = query.dateFrom as string | undefined;
  const dateTo = query.dateTo as string | undefined;
  const channelId = query.channelId ? Number(query.channelId) : null;
  const storeId = query.storeId ? Number(query.storeId) : null;
  const platform = query.platform as string | undefined;
  const sku = query.sku as string | undefined;
  const category = query.category as string | undefined;
  return { companyId, dateFrom, dateTo, channelId, storeId, platform, sku, category };
}

function buildOrderConditions(filters: ReturnType<typeof parseFilters>) {
  const conditions: any[] = [];
  if (filters.companyId) conditions.push(eq(ecommerceOrders.companyId, filters.companyId));
  if (filters.dateFrom) conditions.push(gte(ecommerceOrders.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) {
    const endDate = new Date(filters.dateTo);
    endDate.setHours(23, 59, 59, 999);
    conditions.push(lte(ecommerceOrders.createdAt, endDate));
  }
  if (filters.channelId) conditions.push(eq(ecommerceOrders.connectionId, filters.channelId));
  if (filters.platform) conditions.push(eq(ecommerceOrders.platform, filters.platform));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function registerCommerceIntelligenceRoutes(app: Express) {

  const ciAuth = [requireAuth, requireModule("commerce-intelligence")];

  app.get("/api/ci/executive-stats", ...ciAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const filters = parseFilters(req.query, user);
      if (!filters.companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });

      const orderWhere = buildOrderConditions(filters);

      const revenueResult = await db.select({
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.totalAmount} AS numeric)), 0)`,
        totalOrders: sql<number>`COUNT(*)`,
        totalShipping: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.shippingCost} AS numeric)), 0)`,
        totalCommission: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.commissionFee} AS numeric)), 0)`,
        totalServiceFee: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.serviceFee} AS numeric)), 0)`,
        totalPaymentFee: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.paymentFee} AS numeric)), 0)`,
        totalNetIncome: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.netIncome} AS numeric)), 0)`,
      }).from(ecommerceOrders).where(orderWhere);

      const revenue = parseFloat(revenueResult[0]?.totalRevenue || "0");
      const orderCount = Number(revenueResult[0]?.totalOrders || 0);
      const netIncome = parseFloat(revenueResult[0]?.totalNetIncome || "0");
      const totalFees = parseFloat(revenueResult[0]?.totalCommission || "0") +
        parseFloat(revenueResult[0]?.totalServiceFee || "0") +
        parseFloat(revenueResult[0]?.totalPaymentFee || "0");
      const totalShipping = parseFloat(revenueResult[0]?.totalShipping || "0");

      const adConditions: any[] = [];
      if (filters.companyId) adConditions.push(eq(adSpendEntries.companyId, filters.companyId));
      if (filters.dateFrom) adConditions.push(gte(adSpendEntries.spendDate, filters.dateFrom));
      if (filters.dateTo) adConditions.push(lte(adSpendEntries.spendDate, filters.dateTo));
      const adWhere = adConditions.length > 0 ? and(...adConditions) : undefined;

      const adResult = await db.select({
        totalAdSpend: sql<string>`COALESCE(SUM(CAST(${adSpendEntries.amount} AS numeric)), 0)`,
      }).from(adSpendEntries).where(adWhere);

      const adSpend = parseFloat(adResult[0]?.totalAdSpend || "0");
      const profit = netIncome - adSpend;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const aov = orderCount > 0 ? revenue / orderCount : 0;

      const channelStats = await ecomDb.select({
        platform: ecommerceOrders.platform,
        revenue: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.totalAmount} AS numeric)), 0)`,
        orders: sql<number>`COUNT(*)`,
      }).from(ecommerceOrders).where(orderWhere).groupBy(ecommerceOrders.platform).orderBy(desc(sql`SUM(CAST(${ecommerceOrders.totalAmount} AS numeric))`));

      const topSkuConditions: any[] = [];
      if (filters.companyId) topSkuConditions.push(eq(ecommerceOrders.companyId, filters.companyId));
      if (filters.dateFrom) topSkuConditions.push(gte(ecommerceOrders.createdAt, new Date(filters.dateFrom)));
      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        topSkuConditions.push(lte(ecommerceOrders.createdAt, endDate));
      }
      const topSkuWhere = topSkuConditions.length > 0 ? and(...topSkuConditions) : undefined;

      const topSkus = await ecomDb.select({
        sku: ecommerceOrderItems.platformSku,
        name: ecommerceOrderItems.name,
        totalQty: sql<string>`COALESCE(SUM(CAST(${ecommerceOrderItems.qty} AS numeric)), 0)`,
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${ecommerceOrderItems.total} AS numeric)), 0)`,
      }).from(ecommerceOrderItems)
        .innerJoin(ecommerceOrders, eq(ecommerceOrderItems.orderId, ecommerceOrders.id))
        .where(topSkuWhere)
        .groupBy(ecommerceOrderItems.platformSku, ecommerceOrderItems.name)
        .orderBy(desc(sql`SUM(CAST(${ecommerceOrderItems.total} AS numeric))`))
        .limit(10);

      let stockRisks: any[] = [];
      if (filters.companyId) {
        stockRisks = await db.select({
          productId: products.id,
          name: products.name,
          code: products.code,
          lowStockThreshold: products.lowStockThreshold,
          currentStock: sql<string>`COALESCE(CAST(${productStock.quantity} AS numeric), 0)`,
        }).from(products)
          .leftJoin(productStock, and(
            eq(productStock.productId, products.id),
            eq(productStock.companyId, products.companyId)
          ))
          .where(and(
            eq(products.companyId, filters.companyId),
            eq(products.active, true),
            sql`COALESCE(CAST(${productStock.quantity} AS numeric), 0) <= COALESCE(${products.lowStockThreshold}, 0)`,
            sql`COALESCE(${products.lowStockThreshold}, 0) > 0`
          ))
          .limit(20);
      }

      res.json({
        kpi: {
          revenue,
          profit,
          adSpend,
          margin: Math.round(margin * 100) / 100,
          orderCount,
          aov: Math.round(aov * 100) / 100,
          totalFees,
          totalShipping,
          netIncome,
        },
        topChannels: channelStats.map(c => ({
          platform: c.platform,
          revenue: parseFloat(c.revenue),
          orders: Number(c.orders),
        })),
        topSkus: topSkus.map(s => ({
          sku: s.sku,
          name: s.name,
          qty: parseFloat(s.totalQty),
          revenue: parseFloat(s.totalRevenue),
        })),
        stockRisks: stockRisks.map(s => ({
          productId: s.productId,
          name: s.name,
          code: s.code,
          currentStock: parseFloat(s.currentStock),
          threshold: s.lowStockThreshold,
        })),
      });
    } catch (e: any) {
      console.error("[CI] executive-stats error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ci/channel-stats", ...ciAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const filters = parseFilters(req.query, user);
      if (!filters.companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });
      const orderWhere = buildOrderConditions(filters);

      const channelData = await db.select({
        platform: ecommerceOrders.platform,
        connectionId: ecommerceOrders.connectionId,
        revenue: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.totalAmount} AS numeric)), 0)`,
        orders: sql<number>`COUNT(*)`,
        avgOrderValue: sql<string>`COALESCE(AVG(CAST(${ecommerceOrders.totalAmount} AS numeric)), 0)`,
        totalCommission: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.commissionFee} AS numeric)), 0)`,
        totalServiceFee: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.serviceFee} AS numeric)), 0)`,
        totalShipping: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.shippingCost} AS numeric)), 0)`,
        netIncome: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.netIncome} AS numeric)), 0)`,
      }).from(ecommerceOrders)
        .where(orderWhere)
        .groupBy(ecommerceOrders.platform, ecommerceOrders.connectionId)
        .orderBy(desc(sql`SUM(CAST(${ecommerceOrders.totalAmount} AS numeric))`));

      const connectionIds = Array.from(new Set(channelData.map(c => c.connectionId)));
      let connectionNames: Record<number, string> = {};
      if (connectionIds.length > 0) {
        const conns = await ecomDb.select({ id: ecommerceConnections.id, shopName: ecommerceConnections.shopName })
          .from(ecommerceConnections)
          .where(inArray(ecommerceConnections.id, connectionIds));
        connectionNames = Object.fromEntries(conns.map(c => [c.id, c.shopName]));
      }

      const refundConditions: any[] = [];
      if (filters.companyId) refundConditions.push(eq(ecommerceOrders.companyId, filters.companyId));
      if (filters.dateFrom) refundConditions.push(gte(ecommerceOrders.createdAt, new Date(filters.dateFrom)));
      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        refundConditions.push(lte(ecommerceOrders.createdAt, endDate));
      }
      refundConditions.push(eq(ecommerceOrders.status, "returned"));
      const refundWhere = and(...refundConditions);

      const refundData = await ecomDb.select({
        platform: ecommerceOrders.platform,
        refundCount: sql<number>`COUNT(*)`,
      }).from(ecommerceOrders)
        .where(refundWhere)
        .groupBy(ecommerceOrders.platform);

      const refundMap = Object.fromEntries(refundData.map(r => [r.platform, Number(r.refundCount)]));

      const trendConditions: any[] = [];
      if (filters.companyId) trendConditions.push(eq(ecommerceOrders.companyId, filters.companyId));
      if (filters.dateFrom) trendConditions.push(gte(ecommerceOrders.createdAt, new Date(filters.dateFrom)));
      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        trendConditions.push(lte(ecommerceOrders.createdAt, endDate));
      }
      const trendWhere = trendConditions.length > 0 ? and(...trendConditions) : undefined;

      const dailyTrend = await ecomDb.select({
        date: sql<string>`TO_CHAR(${ecommerceOrders.createdAt}, 'YYYY-MM-DD')`,
        platform: ecommerceOrders.platform,
        revenue: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.totalAmount} AS numeric)), 0)`,
        orders: sql<number>`COUNT(*)`,
      }).from(ecommerceOrders)
        .where(trendWhere)
        .groupBy(sql`TO_CHAR(${ecommerceOrders.createdAt}, 'YYYY-MM-DD')`, ecommerceOrders.platform)
        .orderBy(asc(sql`TO_CHAR(${ecommerceOrders.createdAt}, 'YYYY-MM-DD')`));

      res.json({
        channels: channelData.map(c => {
          const totalOrders = Number(c.orders);
          const refunds = refundMap[c.platform] || 0;
          return {
            platform: c.platform,
            connectionId: c.connectionId,
            storeName: connectionNames[c.connectionId] || c.platform,
            revenue: parseFloat(c.revenue),
            orders: totalOrders,
            aov: parseFloat(c.avgOrderValue),
            fees: parseFloat(c.totalCommission) + parseFloat(c.totalServiceFee),
            shipping: parseFloat(c.totalShipping),
            netIncome: parseFloat(c.netIncome),
            margin: parseFloat(c.revenue) > 0 ? Math.round((parseFloat(c.netIncome) / parseFloat(c.revenue)) * 10000) / 100 : 0,
            refundRate: totalOrders > 0 ? Math.round((refunds / totalOrders) * 10000) / 100 : 0,
          };
        }),
        dailyTrend: dailyTrend.map(d => ({
          date: d.date,
          platform: d.platform,
          revenue: parseFloat(d.revenue),
          orders: Number(d.orders),
        })),
      });
    } catch (e: any) {
      console.error("[CI] channel-stats error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ci/product-stats", ...ciAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const filters = parseFilters(req.query, user);
      if (!filters.companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });
      const itemConditions: any[] = [];
      if (filters.companyId) itemConditions.push(eq(ecommerceOrders.companyId, filters.companyId));
      if (filters.dateFrom) itemConditions.push(gte(ecommerceOrders.createdAt, new Date(filters.dateFrom)));
      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        itemConditions.push(lte(ecommerceOrders.createdAt, endDate));
      }
      if (filters.platform) itemConditions.push(eq(ecommerceOrders.platform, filters.platform));
      const itemWhere = itemConditions.length > 0 ? and(...itemConditions) : undefined;

      const skuStats = await ecomDb.select({
        productId: ecommerceOrderItems.productId,
        sku: ecommerceOrderItems.platformSku,
        name: ecommerceOrderItems.name,
        totalQty: sql<string>`COALESCE(SUM(CAST(${ecommerceOrderItems.qty} AS numeric)), 0)`,
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${ecommerceOrderItems.total} AS numeric)), 0)`,
        orderCount: sql<number>`COUNT(DISTINCT ${ecommerceOrders.id})`,
      }).from(ecommerceOrderItems)
        .innerJoin(ecommerceOrders, eq(ecommerceOrderItems.orderId, ecommerceOrders.id))
        .where(itemWhere)
        .groupBy(ecommerceOrderItems.productId, ecommerceOrderItems.platformSku, ecommerceOrderItems.name)
        .orderBy(desc(sql`SUM(CAST(${ecommerceOrderItems.total} AS numeric))`))
        .limit(100);

      const productIds = skuStats.map(s => s.productId).filter(Boolean) as number[];
      let productCosts: Record<number, { cost: number; category: string }> = {};
      if (productIds.length > 0) {
        const prods = await db.select({
          id: products.id,
          cost: products.cost,
          category: products.category,
        }).from(products).where(inArray(products.id, productIds));
        productCosts = Object.fromEntries(prods.map(p => [p.id, {
          cost: parseFloat(p.cost || "0"),
          category: p.category,
        }]));
      }

      const orderFeeStats = await db.select({
        totalOrders: sql<number>`COUNT(*)`,
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.totalAmount} AS numeric)), 0)`,
        totalCommission: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.commissionFee} AS numeric)), 0)`,
        totalServiceFee: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.serviceFee} AS numeric)), 0)`,
        totalPaymentFee: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.paymentFee} AS numeric)), 0)`,
        totalShipping: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.shippingCost} AS numeric)), 0)`,
      }).from(ecommerceOrders).where(itemWhere);

      const totalRev = parseFloat(orderFeeStats[0]?.totalRevenue || "0");
      const feeRatio = totalRev > 0 ? (
        parseFloat(orderFeeStats[0]?.totalCommission || "0") +
        parseFloat(orderFeeStats[0]?.totalServiceFee || "0") +
        parseFloat(orderFeeStats[0]?.totalPaymentFee || "0")
      ) / totalRev : 0;
      const shippingRatio = totalRev > 0 ? parseFloat(orderFeeStats[0]?.totalShipping || "0") / totalRev : 0;

      const adConditions: any[] = [];
      if (filters.companyId) adConditions.push(eq(adSpendEntries.companyId, filters.companyId));
      if (filters.dateFrom) adConditions.push(gte(adSpendEntries.spendDate, filters.dateFrom));
      if (filters.dateTo) adConditions.push(lte(adSpendEntries.spendDate, filters.dateTo));
      const adWhere = adConditions.length > 0 ? and(...adConditions) : undefined;
      const adResult = await db.select({
        totalAdSpend: sql<string>`COALESCE(SUM(CAST(${adSpendEntries.amount} AS numeric)), 0)`,
      }).from(adSpendEntries).where(adWhere);
      const totalAdSpend = parseFloat(adResult[0]?.totalAdSpend || "0");
      const adRatio = totalRev > 0 ? totalAdSpend / totalRev : 0;

      const productList = skuStats.map(s => {
        const rev = parseFloat(s.totalRevenue);
        const qty = parseFloat(s.totalQty);
        const costInfo = s.productId ? productCosts[s.productId] : null;
        const cogs = costInfo ? costInfo.cost * qty : 0;
        const fees = rev * feeRatio;
        const shipping = rev * shippingRatio;
        const adCost = rev * adRatio;
        const netProfit = rev - cogs - fees - shipping - adCost;
        const marginPct = rev > 0 ? (netProfit / rev) * 100 : 0;

        return {
          productId: s.productId,
          sku: s.sku,
          name: s.name,
          category: costInfo?.category || "unknown",
          qty,
          revenue: Math.round(rev * 100) / 100,
          cogs: Math.round(cogs * 100) / 100,
          fees: Math.round(fees * 100) / 100,
          adCost: Math.round(adCost * 100) / 100,
          shipping: Math.round(shipping * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          margin: Math.round(marginPct * 100) / 100,
          orderCount: Number(s.orderCount),
        };
      });

      const highRevenueItems = productList.filter(p => p.revenue > 0).sort((a, b) => b.revenue - a.revenue);
      const recommendations = {
        heroCandidates: highRevenueItems.filter(p => p.margin > 20 && p.revenue > 0).slice(0, 5),
        stopAds: highRevenueItems.filter(p => p.margin < 5 && p.adCost > 0).slice(0, 5),
        pushMore: highRevenueItems.filter(p => p.margin > 30).slice(0, 5),
      };

      res.json({
        products: productList,
        recommendations,
      });
    } catch (e: any) {
      console.error("[CI] product-stats error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ci/campaign-stats", ...ciAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const filters = parseFilters(req.query, user);
      if (!filters.companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });
      const campaignConditions: any[] = [];
      if (filters.companyId) campaignConditions.push(eq(adCampaigns.companyId, filters.companyId));
      const campaignWhere = campaignConditions.length > 0 ? and(...campaignConditions) : undefined;

      const campaigns = await ecomDb.select().from(adCampaigns).where(campaignWhere);

      const spendConditions: any[] = [];
      if (filters.companyId) spendConditions.push(eq(adSpendEntries.companyId, filters.companyId));
      if (filters.dateFrom) spendConditions.push(gte(adSpendEntries.spendDate, filters.dateFrom));
      if (filters.dateTo) spendConditions.push(lte(adSpendEntries.spendDate, filters.dateTo));
      const spendWhere = spendConditions.length > 0 ? and(...spendConditions) : undefined;

      const spendStats = await db.select({
        campaignId: adSpendEntries.campaignId,
        totalSpend: sql<string>`COALESCE(SUM(CAST(${adSpendEntries.amount} AS numeric)), 0)`,
        totalImpressions: sql<number>`COALESCE(SUM(${adSpendEntries.impressions}), 0)`,
        totalClicks: sql<number>`COALESCE(SUM(${adSpendEntries.clicks}), 0)`,
        totalConversions: sql<number>`COALESCE(SUM(${adSpendEntries.conversions}), 0)`,
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${adSpendEntries.revenue} AS numeric)), 0)`,
      }).from(adSpendEntries)
        .where(spendWhere)
        .groupBy(adSpendEntries.campaignId);

      const spendMap = Object.fromEntries(spendStats.map(s => [s.campaignId || 0, s]));

      let totalSpendAll = 0;
      let totalRevenueAll = 0;

      const campaignList = campaigns.map(c => {
        const stats = spendMap[c.id];
        const spend = parseFloat(stats?.totalSpend || "0");
        const rev = parseFloat(stats?.totalRevenue || "0");
        const impressions = Number(stats?.totalImpressions || 0);
        const clicks = Number(stats?.totalClicks || 0);
        const conversions = Number(stats?.totalConversions || 0);
        const roas = spend > 0 ? rev / spend : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const profitAfterAds = rev - spend;

        totalSpendAll += spend;
        totalRevenueAll += rev;

        return {
          id: c.id,
          name: c.name,
          platform: c.platform,
          status: c.status,
          spend: Math.round(spend * 100) / 100,
          revenue: Math.round(rev * 100) / 100,
          impressions,
          clicks,
          conversions,
          roas: Math.round(roas * 100) / 100,
          ctr: Math.round(ctr * 100) / 100,
          cpc: Math.round(cpc * 100) / 100,
          profitAfterAds: Math.round(profitAfterAds * 100) / 100,
        };
      });

      const overallRoas = totalSpendAll > 0 ? totalRevenueAll / totalSpendAll : 0;

      const highRoasLowProfit = campaignList.filter(c => c.roas > 3 && c.profitAfterAds < 100);
      const goodProfitLowRoas = campaignList.filter(c => c.profitAfterAds > 500 && c.roas < 2);

      res.json({
        summary: {
          totalSpend: Math.round(totalSpendAll * 100) / 100,
          totalRevenue: Math.round(totalRevenueAll * 100) / 100,
          overallRoas: Math.round(overallRoas * 100) / 100,
          profitAfterAds: Math.round((totalRevenueAll - totalSpendAll) * 100) / 100,
        },
        campaigns: campaignList,
        highlights: {
          highRoasLowProfit,
          goodProfitLowRoas,
        },
      });
    } catch (e: any) {
      console.error("[CI] campaign-stats error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ci/live-stats", ...ciAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const filters = parseFilters(req.query, user);
      if (!filters.companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });
      const sessionConditions: any[] = [];
      if (filters.companyId) sessionConditions.push(eq(liveSessions.companyId, filters.companyId));
      if (filters.dateFrom) sessionConditions.push(gte(liveSessions.startedAt, new Date(filters.dateFrom)));
      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        sessionConditions.push(lte(liveSessions.startedAt, endDate));
      }
      const sessionWhere = sessionConditions.length > 0 ? and(...sessionConditions) : undefined;

      const sessions = await ecomDb.select().from(liveSessions)
        .where(sessionWhere)
        .orderBy(desc(liveSessions.startedAt))
        .limit(50);

      const sessionList = sessions.map(s => {
        const startedAt = s.startedAt ? new Date(s.startedAt).getTime() : 0;
        const endedAt = s.endedAt ? new Date(s.endedAt).getTime() : 0;
        const durationMinutes = startedAt && endedAt ? (endedAt - startedAt) / 60000 : 0;
        const gmv = parseFloat(s.totalRevenue || "0");
        const revenuePerMin = durationMinutes > 0 ? gmv / durationMinutes : 0;
        const conversionRate = (s.totalComments || 0) > 0 ? ((s.paidOrders || 0) / (s.totalComments || 1)) * 100 : 0;

        return {
          id: s.id,
          title: s.title,
          platform: s.platform,
          hostName: s.hostName,
          status: s.status,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          durationMinutes: Math.round(durationMinutes),
          gmv: Math.round(gmv * 100) / 100,
          totalOrders: s.totalOrders || 0,
          paidOrders: s.paidOrders || 0,
          totalItemsSold: s.totalItemsSold || 0,
          revenuePerMin: Math.round(revenuePerMin * 100) / 100,
          conversionRate: Math.round(conversionRate * 100) / 100,
          peakViewers: s.peakViewers || 0,
          avgViewers: s.avgViewers || 0,
          totalComments: s.totalComments || 0,
          adSpend: parseFloat(s.totalAdSpend || "0"),
        };
      });

      const hostMap: Record<string, { sessions: number; totalGmv: number; totalOrders: number; totalMinutes: number }> = {};
      sessionList.forEach(s => {
        const host = s.hostName || "Unknown";
        if (!hostMap[host]) hostMap[host] = { sessions: 0, totalGmv: 0, totalOrders: 0, totalMinutes: 0 };
        hostMap[host].sessions++;
        hostMap[host].totalGmv += s.gmv;
        hostMap[host].totalOrders += s.totalOrders;
        hostMap[host].totalMinutes += s.durationMinutes;
      });

      const hostComparison = Object.entries(hostMap).map(([name, data]) => ({
        hostName: name,
        sessions: data.sessions,
        totalGmv: Math.round(data.totalGmv * 100) / 100,
        totalOrders: data.totalOrders,
        avgGmvPerSession: data.sessions > 0 ? Math.round((data.totalGmv / data.sessions) * 100) / 100 : 0,
        avgRevenuePerMin: data.totalMinutes > 0 ? Math.round((data.totalGmv / data.totalMinutes) * 100) / 100 : 0,
      }));

      const hourSlots: Record<number, { count: number; totalGmv: number }> = {};
      sessionList.forEach(s => {
        if (s.startedAt) {
          const hour = new Date(s.startedAt).getHours();
          if (!hourSlots[hour]) hourSlots[hour] = { count: 0, totalGmv: 0 };
          hourSlots[hour].count++;
          hourSlots[hour].totalGmv += s.gmv;
        }
      });

      const timeSlotAnalysis = Object.entries(hourSlots)
        .map(([hour, data]) => ({
          hour: Number(hour),
          sessions: data.count,
          avgGmv: data.count > 0 ? Math.round((data.totalGmv / data.count) * 100) / 100 : 0,
        }))
        .sort((a, b) => a.hour - b.hour);

      res.json({
        sessions: sessionList,
        hostComparison,
        timeSlotAnalysis,
      });
    } catch (e: any) {
      console.error("[CI] live-stats error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ci/alerts", ...ciAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const filters = parseFilters(req.query, user);
      if (!filters.companyId) return res.status(400).json({ message: "กรุณาเลือกบริษัท" });
      const alerts: Array<{
        type: string;
        severity: "red" | "yellow" | "blue";
        title: string;
        message: string;
        data?: any;
      }> = [];

      if (filters.companyId) {
        const stockRisks = await db.select({
          productId: products.id,
          name: products.name,
          code: products.code,
          lowStockThreshold: products.lowStockThreshold,
          currentStock: sql<string>`COALESCE(CAST(${productStock.quantity} AS numeric), 0)`,
        }).from(products)
          .leftJoin(productStock, and(
            eq(productStock.productId, products.id),
            eq(productStock.companyId, products.companyId)
          ))
          .where(and(
            eq(products.companyId, filters.companyId),
            eq(products.active, true),
            sql`COALESCE(CAST(${productStock.quantity} AS numeric), 0) <= COALESCE(${products.lowStockThreshold}, 0)`,
            sql`COALESCE(${products.lowStockThreshold}, 0) > 0`
          ))
          .limit(10);

        stockRisks.forEach(s => {
          const stock = parseFloat(s.currentStock);
          alerts.push({
            type: "stock_risk",
            severity: stock <= 0 ? "red" : "yellow",
            title: "สต็อกใกล้หมด",
            message: `${s.name} (${s.code}) เหลือ ${stock} ชิ้น (ขั้นต่ำ ${s.lowStockThreshold})`,
            data: { productId: s.productId, currentStock: stock, threshold: s.lowStockThreshold },
          });
        });
      }

      const orderWhere = buildOrderConditions(filters);
      if (orderWhere) {
        const revenueResult = await ecomDb.select({
          totalRevenue: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.totalAmount} AS numeric)), 0)`,
          totalNetIncome: sql<string>`COALESCE(SUM(CAST(${ecommerceOrders.netIncome} AS numeric)), 0)`,
          totalOrders: sql<number>`COUNT(*)`,
        }).from(ecommerceOrders).where(orderWhere);

        const rev = parseFloat(revenueResult[0]?.totalRevenue || "0");
        const net = parseFloat(revenueResult[0]?.totalNetIncome || "0");
        const margin = rev > 0 ? (net / rev) * 100 : 0;

        if (margin < 10 && rev > 0) {
          alerts.push({
            type: "margin_drop",
            severity: margin < 5 ? "red" : "yellow",
            title: "Margin ต่ำ",
            message: `อัตรากำไรขั้นต้นอยู่ที่ ${Math.round(margin * 100) / 100}% ซึ่งต่ำกว่าเป้าหมาย`,
            data: { margin: Math.round(margin * 100) / 100, revenue: rev, netIncome: net },
          });
        }

        const refundResult = await ecomDb.select({
          refundCount: sql<number>`COUNT(*)`,
        }).from(ecommerceOrders).where(and(orderWhere, eq(ecommerceOrders.status, "returned")));

        const totalOrders = Number(revenueResult[0]?.totalOrders || 0);
        const refundCount = Number(refundResult[0]?.refundCount || 0);
        const refundRate = totalOrders > 0 ? (refundCount / totalOrders) * 100 : 0;

        if (refundRate > 5 && totalOrders > 10) {
          alerts.push({
            type: "high_refund",
            severity: refundRate > 10 ? "red" : "yellow",
            title: "อัตราคืนสินค้าสูง",
            message: `อัตราคืนสินค้า ${Math.round(refundRate * 100) / 100}% (${refundCount}/${totalOrders} ออเดอร์)`,
            data: { refundRate: Math.round(refundRate * 100) / 100, refundCount, totalOrders },
          });
        }
      }

      const adConditions: any[] = [];
      if (filters.companyId) adConditions.push(eq(adSpendEntries.companyId, filters.companyId));
      if (filters.dateFrom) adConditions.push(gte(adSpendEntries.spendDate, filters.dateFrom));
      if (filters.dateTo) adConditions.push(lte(adSpendEntries.spendDate, filters.dateTo));
      const adWhere = adConditions.length > 0 ? and(...adConditions) : undefined;

      const adResult = await db.select({
        totalSpend: sql<string>`COALESCE(SUM(CAST(${adSpendEntries.amount} AS numeric)), 0)`,
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${adSpendEntries.revenue} AS numeric)), 0)`,
      }).from(adSpendEntries).where(adWhere);

      const totalAdSpend = parseFloat(adResult[0]?.totalSpend || "0");
      const totalAdRevenue = parseFloat(adResult[0]?.totalRevenue || "0");
      const overallRoas = totalAdSpend > 0 ? totalAdRevenue / totalAdSpend : 0;

      if (totalAdSpend > 0 && overallRoas > 3 && (totalAdRevenue - totalAdSpend) < 500) {
        alerts.push({
          type: "high_roas_low_profit",
          severity: "blue",
          title: "ROAS สูงแต่กำไรต่ำ",
          message: `ROAS ${Math.round(overallRoas * 100) / 100}x แต่กำไรหลังหักค่าโฆษณาเพียง ฿${Math.round(totalAdRevenue - totalAdSpend)}`,
          data: { roas: overallRoas, adSpend: totalAdSpend, adRevenue: totalAdRevenue },
        });
      }

      if (totalAdSpend > 0 && overallRoas < 1) {
        alerts.push({
          type: "budget_overspend",
          severity: "red",
          title: "ค่าโฆษณาเกินรายได้",
          message: `ใช้ค่าโฆษณา ฿${Math.round(totalAdSpend)} แต่สร้างรายได้เพียง ฿${Math.round(totalAdRevenue)} (ROAS ${Math.round(overallRoas * 100) / 100}x)`,
          data: { roas: overallRoas, adSpend: totalAdSpend, adRevenue: totalAdRevenue },
        });
      }

      res.json({ alerts });
    } catch (e: any) {
      console.error("[CI] alerts error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });
}
