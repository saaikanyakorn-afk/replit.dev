import type { Express } from "express";
import { db } from "../db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { activeProducts } from "@shared/schema-extra";
import {
  platformFeeConfigs,
  products,
} from "@shared/schema";
import { requireAuth, requireModule } from "../route-middleware";
import { z } from "zod";

function resolveCompanyId(query: any, user: any): number | null {
  if (query.companyId) return Number(query.companyId);
  if (user.companyId) return Number(user.companyId);
  return null;
}

const feeConfigBodySchema = z.object({
  platform: z.string().min(1),
  profileName: z.string().min(1),
  commissionRate: z.coerce.number().min(0).max(99),
  serviceFeeRate: z.coerce.number().min(0).max(99),
  paymentFeeRate: z.coerce.number().min(0).max(99),
  otherFeeRate: z.coerce.number().min(0).max(99),
  shippingFeePerOrder: z.coerce.number().min(0).default(0),
  vatOnFees: z.boolean().default(true),
  notes: z.string().nullable().optional(),
  connectionId: z.number().nullable().optional(),
  active: z.boolean().optional(),
});

export function registerPriceCalculatorRoutes(app: Express) {

  app.get("/api/ecommerce/fee-configs", requireAuth, requireModule("ecommerce"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req.query, req.user);
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const configs = await db
        .select()
        .from(platformFeeConfigs)
        .where(eq(platformFeeConfigs.companyId, companyId))
        .orderBy(desc(platformFeeConfigs.createdAt));

      res.json(configs);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/ecommerce/fee-configs", requireAuth, requireModule("ecommerce"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req.body, req.user);
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const parsed = feeConfigBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });

      const totalFee = parsed.data.commissionRate + parsed.data.serviceFeeRate + parsed.data.paymentFeeRate + parsed.data.otherFeeRate;
      if (totalFee >= 100) return res.status(400).json({ message: "ค่าธรรมเนียมรวมต้องน้อยกว่า 100%" });

      const [config] = await db.insert(platformFeeConfigs).values({
        ...parsed.data,
        companyId,
        commissionRate: String(parsed.data.commissionRate),
        serviceFeeRate: String(parsed.data.serviceFeeRate),
        paymentFeeRate: String(parsed.data.paymentFeeRate),
        otherFeeRate: String(parsed.data.otherFeeRate),
        shippingFeePerOrder: String(parsed.data.shippingFeePerOrder),
      }).returning();
      res.json(config);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/ecommerce/fee-configs/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const companyId = resolveCompanyId(req.body, req.user);
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const parsed = feeConfigBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });

      const totalFee = parsed.data.commissionRate + parsed.data.serviceFeeRate + parsed.data.paymentFeeRate + parsed.data.otherFeeRate;
      if (totalFee >= 100) return res.status(400).json({ message: "ค่าธรรมเนียมรวมต้องน้อยกว่า 100%" });

      const [config] = await db
        .update(platformFeeConfigs)
        .set({
          ...parsed.data,
          commissionRate: String(parsed.data.commissionRate),
          serviceFeeRate: String(parsed.data.serviceFeeRate),
          paymentFeeRate: String(parsed.data.paymentFeeRate),
          otherFeeRate: String(parsed.data.otherFeeRate),
          shippingFeePerOrder: String(parsed.data.shippingFeePerOrder),
          updatedAt: new Date(),
        })
        .where(and(
          eq(platformFeeConfigs.id, id),
          eq(platformFeeConfigs.companyId, companyId),
        ))
        .returning();

      if (!config) return res.status(404).json({ message: "Not found or unauthorized" });
      res.json(config);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/ecommerce/fee-configs/:id", requireAuth, requireModule("ecommerce"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const companyId = resolveCompanyId(req.query, req.user);
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const result = await db
        .delete(platformFeeConfigs)
        .where(and(
          eq(platformFeeConfigs.id, id),
          eq(platformFeeConfigs.companyId, companyId),
        ))
        .returning();

      if (!result.length) return res.status(404).json({ message: "Not found or unauthorized" });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/ecommerce/calculate-price", requireAuth, requireModule("ecommerce"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req.body, req.user);
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const { cost, desiredProfit, profitType, feeConfigId, customFeeRate } = req.body;

      if (cost == null || desiredProfit == null) {
        return res.status(400).json({ message: "cost and desiredProfit required" });
      }

      const costNum = Number(cost);
      const profitNum = Number(desiredProfit);
      if (isNaN(costNum) || isNaN(profitNum) || costNum < 0 || profitNum < 0) {
        return res.status(400).json({ message: "Invalid numeric values" });
      }

      let totalFeeRate = 0;
      let feeBreakdown: any = {};

      if (feeConfigId) {
        const [config] = await db
          .select()
          .from(platformFeeConfigs)
          .where(and(
            eq(platformFeeConfigs.id, Number(feeConfigId)),
            eq(platformFeeConfigs.companyId, companyId),
          ));

        if (!config) return res.status(404).json({ message: "Fee config not found or unauthorized" });

        const commission = Number(config.commissionRate) || 0;
        const service = Number(config.serviceFeeRate) || 0;
        const payment = Number(config.paymentFeeRate) || 0;
        const other = Number(config.otherFeeRate) || 0;
        totalFeeRate = commission + service + payment + other;

        feeBreakdown = {
          commissionRate: commission,
          serviceFeeRate: service,
          paymentFeeRate: payment,
          otherFeeRate: other,
          totalFeeRate,
          shippingFeePerOrder: Number(config.shippingFeePerOrder) || 0,
          vatOnFees: config.vatOnFees,
        };
      } else if (customFeeRate != null) {
        totalFeeRate = Number(customFeeRate);
        if (isNaN(totalFeeRate) || totalFeeRate < 0 || totalFeeRate >= 100) {
          return res.status(400).json({ message: "Invalid fee rate" });
        }
        feeBreakdown = { totalFeeRate, customRate: true };
      }

      let profitAmount: number;
      if (profitType === "percentage") {
        profitAmount = costNum * (profitNum / 100);
      } else {
        profitAmount = profitNum;
      }

      const feeDecimal = totalFeeRate / 100;
      const shippingFee = feeBreakdown.shippingFeePerOrder || 0;

      if (feeDecimal >= 1) {
        return res.status(400).json({ message: "ค่าธรรมเนียมรวมต้องน้อยกว่า 100%" });
      }

      const sellingPrice = (costNum + profitAmount + shippingFee) / (1 - feeDecimal);
      const actualFees = sellingPrice * feeDecimal;
      const actualProfit = sellingPrice - costNum - actualFees - shippingFee;

      let vatOnFees = 0;
      if (feeBreakdown.vatOnFees) {
        vatOnFees = actualFees * 0.07;
      }

      res.json({
        sellingPrice: Math.ceil(sellingPrice),
        sellingPriceExact: Number(sellingPrice.toFixed(2)),
        cost: costNum,
        profitAmount: Number(actualProfit.toFixed(2)),
        profitPercent: costNum > 0 ? Number(((actualProfit / costNum) * 100).toFixed(2)) : 0,
        totalFees: Number(actualFees.toFixed(2)),
        vatOnFees: Number(vatOnFees.toFixed(2)),
        shippingFee,
        feeBreakdown,
        netProfit: Number((actualProfit - vatOnFees).toFixed(2)),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/ecommerce/calculate-price-bulk", requireAuth, requireModule("ecommerce"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req.body, req.user);
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const { feeConfigIds, profitType, desiredProfit } = req.body;

      if (!Array.isArray(feeConfigIds) || !feeConfigIds.length || desiredProfit == null) {
        return res.status(400).json({ message: "feeConfigIds and desiredProfit required" });
      }

      const profitNum = Number(desiredProfit);
      if (isNaN(profitNum) || profitNum < 0) {
        return res.status(400).json({ message: "Invalid desiredProfit" });
      }

      const allProducts = await db
        .select({
          id: products.id,
          code: products.code,
          name: products.name,
          cost: products.cost,
          price: products.price,
          unit: products.unit,
          vatType: products.vatType,
          active: products.active,
        })
        .from(products)
        .innerJoin(activeProducts, eq(activeProducts.id, products.id))
        .where(eq(products.companyId, companyId));

      const configs = await db
        .select()
        .from(platformFeeConfigs)
        .where(and(
          inArray(platformFeeConfigs.id, feeConfigIds.map(Number)),
          eq(platformFeeConfigs.companyId, companyId),
        ));

      if (!configs.length) {
        return res.status(404).json({ message: "No valid fee configs found for this company" });
      }

      const results = allProducts.map((product) => {
        const costNum = Number(product.cost) || 0;
        const currentPrice = Number(product.price) || 0;

        let profitAmount: number;
        if (profitType === "percentage") {
          profitAmount = costNum * (profitNum / 100);
        } else {
          profitAmount = profitNum;
        }

        const platformPrices = configs.map((config) => {
          const totalFeeRate =
            (Number(config.commissionRate) || 0) +
            (Number(config.serviceFeeRate) || 0) +
            (Number(config.paymentFeeRate) || 0) +
            (Number(config.otherFeeRate) || 0);

          const feeDecimal = totalFeeRate / 100;
          const shippingFee = Number(config.shippingFeePerOrder) || 0;

          if (feeDecimal >= 1) return null;

          const sellingPrice = (costNum + profitAmount + shippingFee) / (1 - feeDecimal);
          const actualFees = sellingPrice * feeDecimal;
          const actualProfit = sellingPrice - costNum - actualFees - shippingFee;

          return {
            configId: config.id,
            platform: config.platform,
            profileName: config.profileName,
            recommendedPrice: Math.ceil(sellingPrice),
            totalFeeRate,
            actualFees: Number(actualFees.toFixed(2)),
            actualProfit: Number(actualProfit.toFixed(2)),
            priceDiff: Math.ceil(sellingPrice) - currentPrice,
          };
        }).filter(Boolean);

        return {
          productId: product.id,
          code: product.code,
          name: product.name,
          cost: costNum,
          currentPrice,
          unit: product.unit,
          platformPrices,
        };
      });

      res.json({ products: results, configs });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
