import { db } from "./db";
import { stockMovements, products, productStock, taxInvoiceItems, taxInvoices, invoiceItems, invoices, goodsReceivings, goodsRequisitions } from "@shared/schema";
import { eq, and, asc, lte, gte, desc, sql, inArray } from "drizzle-orm";

export type CostingMethod = "moving_average" | "fifo" | "specific";

export interface CostLayer {
  qty: number;
  unitCost: number;
}

export interface MovementWithCost {
  id: number;
  productId: number;
  movementType: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  referenceType: string | null;
  referenceId: number | null;
  referenceNo: string | null;
  notes: string | null;
  createdAt: Date | null;
  documentDate?: string | null;
  runningQty: number;
  runningValue: number;
  runningUnitCost: number;
  sellPrice?: number;
  totalSell?: number;
  grossProfit?: number;
}

export interface ProductValuation {
  productId: number;
  productCode: string | null;
  productName: string;
  category: string | null;
  unit: string | null;
  currentQty: number;
  unitCost: number;
  totalValue: number;
  lastMovementDate: Date | null;
}

export interface MovementSummary {
  productId: number;
  productCode: string | null;
  productName: string;
  unit: string | null;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  netQty: number;
}

const ZERO_COST_TYPES = new Set(["bundle_offset"]);

function calculateMovingAverage(movements: any[]): MovementWithCost[] {
  let runningQty = 0;
  let runningValue = 0;
  const result: MovementWithCost[] = [];

  for (const m of movements) {
    const qty = parseFloat(m.quantity);
    const recordedUnitCost = parseFloat(m.unitCost || "0");
    const isZeroCost = ZERO_COST_TYPES.has(m.movementType);

    if (qty > 0) {
      const effectiveCost = isZeroCost ? 0 : recordedUnitCost;
      const incomingValue = qty * effectiveCost;
      runningQty += qty;
      runningValue += incomingValue;
      const avgCost = runningQty > 0 ? runningValue / runningQty : 0;

      result.push({
        id: m.id,
        productId: m.productId,
        movementType: m.movementType,
        quantity: qty,
        unitCost: effectiveCost,
        totalCost: incomingValue,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        referenceNo: m.referenceNo,
        notes: m.notes,
        createdAt: m.createdAt,
        runningQty,
        runningValue,
        runningUnitCost: isZeroCost ? (runningQty > 0 ? runningValue / runningQty : 0) : avgCost,
      });
    } else {
      const absQty = Math.abs(qty);
      const avgCost = runningQty > 0 ? runningValue / runningQty : recordedUnitCost;
      const deductValue = absQty * avgCost;
      runningQty -= absQty;
      runningValue -= deductValue;
      const lastAvgCost = avgCost;
      if (runningQty === 0) runningValue = 0;

      result.push({
        id: m.id,
        productId: m.productId,
        movementType: m.movementType,
        quantity: qty,
        unitCost: avgCost,
        totalCost: deductValue,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        referenceNo: m.referenceNo,
        notes: m.notes,
        createdAt: m.createdAt,
        runningQty,
        runningValue,
        runningUnitCost: runningQty > 0 ? runningValue / runningQty : (runningQty < 0 ? lastAvgCost : 0),
      });
    }
  }

  return result;
}

function calculateFIFO(movements: any[]): MovementWithCost[] {
  const layers: CostLayer[] = [];
  let runningQty = 0;
  let runningValue = 0;
  const result: MovementWithCost[] = [];

  for (const m of movements) {
    const qty = parseFloat(m.quantity);
    const recordedUnitCost = parseFloat(m.unitCost || "0");
    const isZeroCost = ZERO_COST_TYPES.has(m.movementType);

    if (qty > 0) {
      const effectiveCost = isZeroCost ? 0 : recordedUnitCost;
      layers.push({ qty, unitCost: effectiveCost });
      runningQty += qty;
      runningValue += qty * effectiveCost;

      result.push({
        id: m.id,
        productId: m.productId,
        movementType: m.movementType,
        quantity: qty,
        unitCost: effectiveCost,
        totalCost: qty * effectiveCost,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        referenceNo: m.referenceNo,
        notes: m.notes,
        createdAt: m.createdAt,
        runningQty,
        runningValue,
        runningUnitCost: runningQty > 0 ? runningValue / runningQty : 0,
      });
    } else {
      let remaining = Math.abs(qty);
      let deductValue = 0;

      while (remaining > 0 && layers.length > 0) {
        const oldest = layers[0];
        if (oldest.qty <= remaining) {
          deductValue += oldest.qty * oldest.unitCost;
          remaining -= oldest.qty;
          layers.shift();
        } else {
          deductValue += remaining * oldest.unitCost;
          oldest.qty -= remaining;
          remaining = 0;
        }
      }

      const absQty = Math.abs(qty);
      const effectiveUnitCost = absQty > 0 ? deductValue / absQty : recordedUnitCost;
      runningQty -= absQty;
      runningValue -= deductValue;
      if (remaining > 0) {
        runningValue -= remaining * effectiveUnitCost;
      }
      if (runningQty === 0) runningValue = 0;

      result.push({
        id: m.id,
        productId: m.productId,
        movementType: m.movementType,
        quantity: qty,
        unitCost: effectiveUnitCost,
        totalCost: deductValue + (remaining > 0 ? remaining * effectiveUnitCost : 0),
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        referenceNo: m.referenceNo,
        notes: m.notes,
        createdAt: m.createdAt,
        runningQty,
        runningValue,
        runningUnitCost: runningQty > 0 ? runningValue / runningQty : (runningQty < 0 ? effectiveUnitCost : 0),
      });
    }
  }

  return result;
}

function calculateSpecific(movements: any[]): MovementWithCost[] {
  let runningQty = 0;
  let runningValue = 0;
  const result: MovementWithCost[] = [];

  for (const m of movements) {
    const qty = parseFloat(m.quantity);
    const recordedUnitCost = parseFloat(m.unitCost || "0");
    const recordedTotalCost = parseFloat(m.totalCost || "0");
    const isZeroCost = ZERO_COST_TYPES.has(m.movementType);
    const cost = isZeroCost ? 0 : (recordedTotalCost > 0 ? recordedTotalCost : Math.abs(qty) * recordedUnitCost);

    if (qty > 0) {
      runningQty += qty;
      runningValue += cost;
    } else {
      runningQty += qty;
      runningValue -= cost;
    }
    if (runningQty === 0) runningValue = 0;

    result.push({
      id: m.id,
      productId: m.productId,
      movementType: m.movementType,
      quantity: qty,
      unitCost: recordedUnitCost,
      totalCost: cost,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      referenceNo: m.referenceNo,
      notes: m.notes,
      createdAt: m.createdAt,
      runningQty,
      runningValue,
      runningUnitCost: runningQty > 0 ? runningValue / runningQty : (runningQty < 0 ? recordedUnitCost : 0),
    });
  }

  return result;
}

export function calculateCost(movements: any[], method: CostingMethod): MovementWithCost[] {
  const sorted = [...movements].sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  switch (method) {
    case "fifo":
      return calculateFIFO(sorted);
    case "specific":
      return calculateSpecific(sorted);
    case "moving_average":
    default:
      return calculateMovingAverage(sorted);
  }
}

function parseDateFromRefNo(refNo: string): string | null {
  const cleaned = refNo.replace(/^(BUNDLE-OFFSET#|BUNDLE#)/, "");
  const match = cleaned.match(/[A-Z]*(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, yy, mm, dd] = match;
  const year = 2000 + parseInt(yy);
  const month = parseInt(mm);
  const day = parseInt(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function enrichMovements(
  movements: MovementWithCost[],
  productId: number
): Promise<MovementWithCost[]> {
  const [product] = await db.select({
    code: products.code,
    price: products.price,
    cost: products.cost,
    vatType: products.vatType,
    vatIncluded: products.vatIncluded,
  }).from(products).where(eq(products.id, productId));
  const productCode = product?.code;
  const isVat7 = product?.vatType === "vat7";
  const isVatIncluded = product?.vatIncluded === true;
  const vatDivisor = (isVat7 && isVatIncluded) ? 1.07 : 1;
  const productSellPrice = parseFloat(product?.price || "0") / vatDivisor;
  const productCost = parseFloat(product?.cost || "0") / vatDivisor;

  const refsWithId = movements.filter(m => m.referenceType && m.referenceId);
  const tivRefIds = Array.from(new Set(refsWithId.filter(m => m.referenceType === "tax_invoice").map(m => m.referenceId!)));
  const invRefIds = Array.from(new Set(refsWithId.filter(m => m.referenceType === "invoice").map(m => m.referenceId!)));
  const grRefIds = Array.from(new Set(refsWithId.filter(m => m.referenceType === "goods_receiving").map(m => m.referenceId!)));
  const giqRefIds = Array.from(new Set(refsWithId.filter(m => m.referenceType === "goods_requisition").map(m => m.referenceId!)));

  const sellPriceMap = new Map<string, number>();
  const docDateMap = new Map<string, string>();

  if (tivRefIds.length > 0) {
    const [tivDocs, tivItems] = await Promise.all([
      db.select({ id: taxInvoices.id, date: taxInvoices.taxInvoiceDate }).from(taxInvoices).where(inArray(taxInvoices.id, tivRefIds)),
      db.select({
        taxInvoiceId: taxInvoiceItems.taxInvoiceId,
        unitPrice: taxInvoiceItems.unitPrice,
        total: taxInvoiceItems.total,
        qty: taxInvoiceItems.qty,
        productCode: taxInvoiceItems.productCode,
      }).from(taxInvoiceItems).where(inArray(taxInvoiceItems.taxInvoiceId, tivRefIds)),
    ]);

    for (const doc of tivDocs) {
      if (doc.date) docDateMap.set(`tax_invoice_${doc.id}`, String(doc.date).slice(0, 10));
    }

    for (const docId of tivRefIds) {
      const docItems = tivItems.filter(it => it.taxInvoiceId === docId);
      const matched = productCode ? docItems.filter(it => it.productCode === productCode) : [];
      if (matched.length > 0) {
        const totalSell = matched.reduce((sum, it) => {
          const total = parseFloat(it.total || "0");
          return sum + (total > 0 ? total : parseFloat(it.unitPrice || "0") * parseFloat(it.qty || "1"));
        }, 0);
        sellPriceMap.set(`tax_invoice_${docId}`, totalSell);
      }
    }
  }

  if (invRefIds.length > 0) {
    const [invDocs, invItems] = await Promise.all([
      db.select({ id: invoices.id, date: invoices.invoiceDate }).from(invoices).where(inArray(invoices.id, invRefIds)),
      db.select({
        invoiceId: invoiceItems.invoiceId,
        unitPrice: invoiceItems.unitPrice,
        total: invoiceItems.total,
        qty: invoiceItems.qty,
        productCode: invoiceItems.productCode,
      }).from(invoiceItems).where(inArray(invoiceItems.invoiceId, invRefIds)),
    ]);

    for (const doc of invDocs) {
      if (doc.date) docDateMap.set(`invoice_${doc.id}`, String(doc.date).slice(0, 10));
    }

    for (const docId of invRefIds) {
      const docItems = invItems.filter(it => it.invoiceId === docId);
      const matched = productCode ? docItems.filter(it => it.productCode === productCode) : [];
      if (matched.length > 0) {
        const totalSell = matched.reduce((sum, it) => {
          const total = parseFloat(it.total || "0");
          return sum + (total > 0 ? total : parseFloat(it.unitPrice || "0") * parseFloat(it.qty || "1"));
        }, 0);
        sellPriceMap.set(`invoice_${docId}`, totalSell);
      }
    }
  }

  if (grRefIds.length > 0) {
    const grDocs = await db.select({ id: goodsReceivings.id, date: goodsReceivings.grDate }).from(goodsReceivings).where(inArray(goodsReceivings.id, grRefIds));
    for (const doc of grDocs) {
      if (doc.date) docDateMap.set(`goods_receiving_${doc.id}`, String(doc.date).slice(0, 10));
    }
  }

  if (giqRefIds.length > 0) {
    const giqDocs = await db.select({ id: goodsRequisitions.id, date: goodsRequisitions.giqDate }).from(goodsRequisitions).where(inArray(goodsRequisitions.id, giqRefIds));
    for (const doc of giqDocs) {
      if (doc.date) docDateMap.set(`goods_requisition_${doc.id}`, String(doc.date).slice(0, 10));
    }
  }

  return movements.map(m => {
    const key = m.referenceType && m.referenceId ? `${m.referenceType}_${m.referenceId}` : null;
    let documentDate: string | null = key ? (docDateMap.get(key) || null) : null;

    if (!documentDate && m.referenceNo) {
      const parsed = parseDateFromRefNo(m.referenceNo);
      if (parsed) documentDate = parsed;
    }

    if (m.quantity >= 0 || !key) {
      return { ...m, documentDate };
    }

    const absQty = Math.abs(m.quantity);
    let unitCost = m.unitCost;
    let totalCost = m.totalCost;
    if (unitCost === 0 && productCost > 0) {
      unitCost = productCost;
      totalCost = absQty * productCost;
    }

    let totalSell = sellPriceMap.get(key) || 0;
    if (totalSell === 0 && productSellPrice > 0) {
      totalSell = absQty * productSellPrice;
    }
    const sellPrice = absQty > 0 && totalSell > 0 ? totalSell / absQty : 0;
    const grossProfit = totalSell > 0 ? totalSell - totalCost : 0;
    return { ...m, unitCost, totalCost, sellPrice, totalSell, grossProfit, documentDate };
  });
}

export async function getStockCardWithCost(
  companyId: number,
  productId: number,
  method: CostingMethod,
  startDate?: string,
  endDate?: string
): Promise<{ movements: MovementWithCost[]; balanceBF?: { qty: number; value: number; unitCost: number } }> {
  const conditions: any[] = [
    eq(stockMovements.companyId, companyId),
    eq(stockMovements.productId, productId),
  ];

  const allMovements = await db.select().from(stockMovements)
    .where(and(...conditions))
    .orderBy(asc(stockMovements.createdAt));

  const calculated = calculateCost(allMovements, method);
  const enriched = await enrichMovements(calculated, productId);

  let filtered = enriched;
  let balanceBF: { qty: number; value: number; unitCost: number } | undefined;

  if (startDate || endDate) {
    const getEffectiveDate = (m: MovementWithCost) => new Date(m.documentDate || m.createdAt as any);

    if (startDate) {
      const startD = new Date(startDate);
      const beforeStart = enriched.filter(m => getEffectiveDate(m) < startD);
      if (beforeStart.length > 0) {
        const last = beforeStart[beforeStart.length - 1];
        balanceBF = {
          qty: last.runningQty,
          value: last.runningValue,
          unitCost: last.runningUnitCost,
        };
      } else {
        balanceBF = { qty: 0, value: 0, unitCost: 0 };
      }
    }

    filtered = enriched.filter(m => {
      const d = getEffectiveDate(m);
      if (startDate && d < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    });
  }

  return { movements: filtered, balanceBF };
}

export async function getInventoryValuation(
  companyId: number,
  method: CostingMethod,
  asOfDate?: string
): Promise<ProductValuation[]> {
  const allProducts = await db.select().from(products)
    .where(eq(products.companyId, companyId))
    .orderBy(asc(products.code));

  const result: ProductValuation[] = [];

  for (const product of allProducts) {
    const conditions: any[] = [
      eq(stockMovements.companyId, companyId),
      eq(stockMovements.productId, product.id),
    ];
    if (asOfDate) {
      const endOfDay = new Date(asOfDate);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(lte(stockMovements.createdAt, endOfDay));
    }

    const movements = await db.select().from(stockMovements)
      .where(and(...conditions))
      .orderBy(asc(stockMovements.createdAt));

    if (movements.length === 0) {
      const [stock] = await db.select().from(productStock)
        .where(and(eq(productStock.companyId, companyId), eq(productStock.productId, product.id)));
      const qty = parseFloat(stock?.quantity || "0");
      if (qty !== 0) {
        const baseCost = parseFloat(product.cost || "0");
        result.push({
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          category: product.category,
          unit: product.unit,
          currentQty: qty,
          unitCost: baseCost,
          totalValue: qty * baseCost,
          lastMovementDate: null,
        });
      }
      continue;
    }

    const calculated = calculateCost(movements, method);
    const last = calculated[calculated.length - 1];

    if (last.runningQty !== 0 || !asOfDate) {
      result.push({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        category: product.category,
        unit: product.unit,
        currentQty: last.runningQty,
        unitCost: last.runningUnitCost,
        totalValue: last.runningValue,
        lastMovementDate: last.createdAt,
      });
    }
  }

  return result;
}

export async function getMovementSummary(
  companyId: number,
  method: CostingMethod,
  startDate?: string,
  endDate?: string
): Promise<MovementSummary[]> {
  const allProducts = await db.select().from(products)
    .where(eq(products.companyId, companyId))
    .orderBy(asc(products.code));

  const result: MovementSummary[] = [];

  for (const product of allProducts) {
    const movements = await db.select().from(stockMovements)
      .where(and(
        eq(stockMovements.companyId, companyId),
        eq(stockMovements.productId, product.id),
      ))
      .orderBy(asc(stockMovements.createdAt));

    if (movements.length === 0) continue;

    const calculated = calculateCost(movements, method);

    const filtered = calculated.filter(m => {
      const d = new Date(m.createdAt as any);
      if (startDate && d < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    });

    if (filtered.length === 0) continue;

    let inQty = 0, inValue = 0, outQty = 0, outValue = 0;
    for (const m of filtered) {
      if (m.quantity > 0) {
        inQty += m.quantity;
        inValue += m.totalCost;
      } else {
        outQty += Math.abs(m.quantity);
        outValue += m.totalCost;
      }
    }

    result.push({
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      unit: product.unit,
      inQty,
      inValue,
      outQty,
      outValue,
      netQty: inQty - outQty,
    });
  }

  return result;
}

export async function getSlowMovingProducts(
  companyId: number,
  daysThreshold: number = 30
): Promise<(ProductValuation & { daysSinceLastMovement: number })[]> {
  const allProducts = await db.select().from(products)
    .where(eq(products.companyId, companyId))
    .orderBy(asc(products.code));

  const now = new Date();
  const result: (ProductValuation & { daysSinceLastMovement: number })[] = [];

  for (const product of allProducts) {
    const [stock] = await db.select().from(productStock)
      .where(and(eq(productStock.companyId, companyId), eq(productStock.productId, product.id)));
    const qty = parseFloat(stock?.quantity || "0");
    if (qty <= 0) continue;

    const [lastMovement] = await db.select().from(stockMovements)
      .where(and(
        eq(stockMovements.companyId, companyId),
        eq(stockMovements.productId, product.id),
      ))
      .orderBy(desc(stockMovements.createdAt))
      .limit(1);

    const lastDate = lastMovement?.createdAt ? new Date(lastMovement.createdAt) : null;
    const daysSince = lastDate ? Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : 9999;

    if (daysSince >= daysThreshold) {
      const baseCost = parseFloat(product.cost || "0");
      result.push({
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        category: product.category,
        unit: product.unit,
        currentQty: qty,
        unitCost: baseCost,
        totalValue: qty * baseCost,
        lastMovementDate: lastDate,
        daysSinceLastMovement: daysSince,
      });
    }
  }

  return result.sort((a, b) => b.daysSinceLastMovement - a.daysSinceLastMovement);
}
