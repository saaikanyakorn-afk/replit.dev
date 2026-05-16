import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { eq, and, asc, desc, sql, inArray } from "drizzle-orm";
import { manufacturingOrders, manufacturingOrderLines, bomHeaders, bomLines, products, productLots, stockMovements, productStock, journalEntries, journalLines, accounts, warehouseStockLevels, goodsReceivings } from "@shared/schema";
import { requireAuth, requireModule , checkDocOwnership} from "../route-middleware";
import { getNextJournalEntryNo, upsertWarehouseStockLevel, getInventoryTriggers } from "../route-helpers";

export function registerManufacturingRoutes(app: Express) {

  app.get("/api/manufacturing-orders", requireAuth, requireModule("inventory"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const conditions: any[] = [eq(manufacturingOrders.companyId, companyId)];
      const status = req.query.status as string;
      if (status && status !== "all") {
        conditions.push(eq(manufacturingOrders.status, status));
      }
      const rows = await db.select().from(manufacturingOrders)
        .where(and(...conditions))
        .orderBy(desc(manufacturingOrders.createdAt));

      const productIds = [...new Set(rows.map(r => r.productId))];
      const prods = productIds.length > 0
        ? await db.select().from(products).where(sql`${products.id} IN (${sql.raw(productIds.join(",") || "0")})`)
        : [];
      const prodMap = new Map(prods.map(p => [p.id, p]));

      const completedIds = rows.filter(r => r.status === "completed").map(r => r.id);
      let costMap = new Map<number, { unitCost: number; totalCost: number }>();
      if (completedIds.length > 0) {
        const costRows = await db.select().from(stockMovements)
          .where(and(
            eq(stockMovements.referenceType, "manufacturing_order"),
            eq(stockMovements.movementType, "production"),
            sql`${stockMovements.referenceId} IN (${sql.raw(completedIds.join(","))})`
          ));
        for (const cm of costRows) {
          costMap.set(cm.referenceId!, { unitCost: Number(cm.unitCost || 0), totalCost: Number(cm.totalCost || 0) });
        }
      }

      const result = rows.map(r => ({
        ...r,
        productName: prodMap.get(r.productId)?.name || "",
        productCode: prodMap.get(r.productId)?.code || "",
        unitCost: costMap.get(r.id)?.unitCost || 0,
        totalCost: costMap.get(r.id)?.totalCost || 0,
      }));
      res.json(result);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/manufacturing-orders/:id", requireAuth, requireModule("inventory"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const [mo] = await db.select().from(manufacturingOrders)
        .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.companyId, companyId)));
      if (!mo) return res.status(404).json({ message: "ไม่พบใบสั่งผลิต" });

      const lines = await db.select().from(manufacturingOrderLines)
        .where(eq(manufacturingOrderLines.moId, id));

      const allProdIds = [mo.productId, ...lines.map(l => l.componentProductId)];
      const prods = await db.select().from(products)
        .where(sql`${products.id} IN (${sql.raw([...new Set(allProdIds)].join(",") || "0")})`);
      const prodMap = new Map(prods.map(p => [p.id, p]));

      const linesWithNames = lines.map(l => ({
        ...l,
        componentName: prodMap.get(l.componentProductId)?.name || "",
        componentCode: prodMap.get(l.componentProductId)?.code || "",
      }));

      let totalCost = 0;
      let unitCost = 0;
      if (mo.status === "completed") {
        const costMovements = await db.select().from(stockMovements)
          .where(and(
            eq(stockMovements.referenceType, "manufacturing_order"),
            eq(stockMovements.referenceId, id),
            eq(stockMovements.movementType, "production")
          ));
        if (costMovements.length > 0) {
          totalCost = Number(costMovements[0].totalCost || 0);
          unitCost = Number(costMovements[0].unitCost || 0);
        }
      }

      const rawWh = await db.execute(sql.raw(`SELECT source_warehouse_id, target_warehouse_id FROM manufacturing_orders WHERE id = ${id}`));
      const rawWhRow = (rawWh as any).rows?.[0] || {};
      res.json({
        ...mo,
        productName: prodMap.get(mo.productId)?.name || "",
        productCode: prodMap.get(mo.productId)?.code || "",
        totalCost,
        unitCost,
        lines: linesWithNames,
        sourceWarehouseId: rawWhRow.source_warehouse_id || null,
        targetWarehouseId: rawWhRow.target_warehouse_id || null,
      });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/manufacturing-orders", requireAuth, requireModule("inventory"), async (req, res) => {
    try {
      const { companyId, bomId, productId, plannedQty, unit, lotNumber, manufacturingDate, expiryDate, notes, lines } = req.body;
      if (!companyId || !productId || !plannedQty) {
        return res.status(400).json({ message: "companyId, productId, plannedQty required" });
      }
      const user = req.user as any;

      const count = await db.select({ cnt: sql<number>`count(*)` }).from(manufacturingOrders)
        .where(eq(manufacturingOrders.companyId, companyId));
      const seq = Number(count[0]?.cnt || 0) + 1;
      const orderNo = `MO-${new Date().getFullYear()}-${String(seq).padStart(4, "0")}`;

      const [mo] = await db.insert(manufacturingOrders).values({
        companyId,
        orderNo,
        bomId: bomId || null,
        productId,
        plannedQty: String(plannedQty),
        unit: unit || "ชิ้น",
        status: "draft",
        lotNumber: lotNumber || null,
        manufacturingDate: manufacturingDate || null,
        expiryDate: expiryDate || null,
        notes: notes || null,
        createdBy: user?.id || null,
      }).returning();

      if (lines && Array.isArray(lines) && lines.length > 0) {
        await db.insert(manufacturingOrderLines).values(
          lines.map((l: any) => ({
            moId: mo.id,
            componentProductId: l.componentProductId,
            requiredQty: String(l.requiredQty || 0),
            unit: l.unit || "ชิ้น",
            notes: l.notes || null,
          }))
        );
      }

      const srcWid = req.body.sourceWarehouseId ? Number(req.body.sourceWarehouseId) : null;
      const tgtWid = req.body.targetWarehouseId ? Number(req.body.targetWarehouseId) : null;
      if (srcWid || tgtWid) {
        const parts: string[] = [];
        if (srcWid) parts.push(`source_warehouse_id = ${srcWid}`);
        if (tgtWid) parts.push(`target_warehouse_id = ${tgtWid}`);
        await db.execute(sql.raw(`UPDATE manufacturing_orders SET ${parts.join(", ")} WHERE id = ${mo.id}`));
      }

      res.status(201).json({ ...mo, sourceWarehouseId: srcWid, targetWarehouseId: tgtWid });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/manufacturing-orders/:id", requireAuth, requireModule("inventory"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const companyId = Number(req.query.companyId || req.body.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const [existing] = await db.select().from(manufacturingOrders)
        .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.companyId, companyId)));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบสั่งผลิต" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      if (existing.status === "completed") return res.status(400).json({ message: "ใบสั่งผลิตเสร็จแล้ว ไม่สามารถแก้ไขได้" });

      const updates: any = {};
      if (req.body.plannedQty !== undefined) updates.plannedQty = String(req.body.plannedQty);
      if (req.body.lotNumber !== undefined) updates.lotNumber = req.body.lotNumber || null;
      if (req.body.manufacturingDate !== undefined) updates.manufacturingDate = req.body.manufacturingDate || null;
      if (req.body.expiryDate !== undefined) updates.expiryDate = req.body.expiryDate || null;
      if (req.body.notes !== undefined) updates.notes = req.body.notes;

      if (req.body.lines && Array.isArray(req.body.lines)) {
        await db.delete(manufacturingOrderLines).where(eq(manufacturingOrderLines.moId, id));
        if (req.body.lines.length > 0) {
          await db.insert(manufacturingOrderLines).values(
            req.body.lines.map((l: any) => ({
              moId: id,
              componentProductId: l.componentProductId,
              requiredQty: String(l.requiredQty || 0),
              unit: l.unit || "ชิ้น",
              notes: l.notes || null,
            }))
          );
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.update(manufacturingOrders).set(updates).where(eq(manufacturingOrders.id, id));
      }
      const srcWid = req.body.sourceWarehouseId != null ? Number(req.body.sourceWarehouseId) || null : undefined;
      const tgtWid = req.body.targetWarehouseId != null ? Number(req.body.targetWarehouseId) || null : undefined;
      if (srcWid !== undefined || tgtWid !== undefined) {
        const parts: string[] = [];
        if (srcWid !== undefined) parts.push(`source_warehouse_id = ${srcWid === null ? "NULL" : srcWid}`);
        if (tgtWid !== undefined) parts.push(`target_warehouse_id = ${tgtWid === null ? "NULL" : tgtWid}`);
        await db.execute(sql.raw(`UPDATE manufacturing_orders SET ${parts.join(", ")} WHERE id = ${id}`));
      }
      const [updated] = await db.select().from(manufacturingOrders).where(eq(manufacturingOrders.id, id));
      const rawRow = await db.execute(sql.raw(`SELECT source_warehouse_id, target_warehouse_id FROM manufacturing_orders WHERE id = ${id}`));
      const rawExtra = (rawRow as any).rows?.[0] || {};
      res.json({ ...updated, sourceWarehouseId: rawExtra.source_warehouse_id, targetWarehouseId: rawExtra.target_warehouse_id });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/manufacturing-orders/:id/start", requireAuth, requireModule("inventory"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const companyId = Number(req.query.companyId || req.body.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const [mo] = await db.select().from(manufacturingOrders)
        .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.companyId, companyId)));
      if (!mo) return res.status(404).json({ message: "ไม่พบใบสั่งผลิต" });
      if (mo.status !== "draft") return res.status(400).json({ message: "สถานะต้องเป็น 'ร่าง' เท่านั้น" });

      const [updated] = await db.update(manufacturingOrders).set({
        status: "in_progress",
        startedAt: new Date(),
      }).where(eq(manufacturingOrders.id, id)).returning();

      res.json(updated);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/manufacturing-orders/:id/complete", requireAuth, requireModule("inventory"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const companyId = Number(req.query.companyId || req.body.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const user = req.user as any;

      const [mo] = await db.select().from(manufacturingOrders)
        .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.companyId, companyId)));
      if (!mo) return res.status(404).json({ message: "ไม่พบใบสั่งผลิต" });
      if (mo.status === "completed") return res.status(400).json({ message: "ใบสั่งผลิตเสร็จสิ้นแล้ว" });
      if (mo.status === "cancelled") return res.status(400).json({ message: "ใบสั่งผลิตถูกยกเลิก" });

      const moSourceWarehouseId = (mo as any).sourceWarehouseId ? Number((mo as any).sourceWarehouseId) : null;
      const moTargetWarehouseId = (mo as any).targetWarehouseId ? Number((mo as any).targetWarehouseId) : null;

      const completedQty = Number(req.body.completedQty || mo.plannedQty);
      if (!isFinite(completedQty) || completedQty <= 0) {
        return res.status(400).json({ message: "จำนวนที่ผลิตต้องมากกว่า 0" });
      }
      const lotNumber = req.body.lotNumber || mo.lotNumber || mo.orderNo;
      const mfgDate = req.body.manufacturingDate || mo.manufacturingDate || new Date().toISOString().slice(0, 10);
      const expDate = req.body.expiryDate || mo.expiryDate || null;

      const [dupLot] = await db.select().from(productLots)
        .where(and(
          eq(productLots.companyId, companyId),
          eq(productLots.productId, mo.productId),
          eq(productLots.lotNumber, lotNumber)
        ));
      if (dupLot) {
        return res.status(400).json({ message: `ล็อต "${lotNumber}" ของสินค้านี้มีอยู่แล้ว กรุณาใช้เลขล็อตอื่น` });
      }

      const lines = await db.select().from(manufacturingOrderLines)
        .where(eq(manufacturingOrderLines.moId, id));

      const mfgTriggers = await getInventoryTriggers(companyId);

      await db.transaction(async (tx) => {
        let bomYieldQty = 1;
        if (mo.bomId) {
          const [bom] = await tx.select().from(bomHeaders).where(eq(bomHeaders.id, mo.bomId));
          if (bom) bomYieldQty = Number(bom.yieldQty) || 1;
        }

        const multiplier = completedQty / bomYieldQty;

        for (const line of lines) {
          const deductQty = Number(line.requiredQty) * multiplier;
          if (deductQty <= 0) continue;

          const lots = await tx.select().from(productLots)
            .where(and(
              eq(productLots.companyId, companyId),
              eq(productLots.productId, line.componentProductId),
              eq(productLots.status, "active"),
              sql`CAST(${productLots.quantity} AS DECIMAL) > 0`
            ))
            .orderBy(sql`${productLots.expiryDate} IS NULL`, asc(productLots.expiryDate), asc(productLots.createdAt));

          const [compProduct] = await tx.select().from(products).where(eq(products.id, line.componentProductId));
          const compUnitCost = Number(compProduct?.cost || "0");

          let remaining = deductQty;
          for (const lot of lots) {
            if (remaining <= 0) break;
            const available = Number(lot.quantity);
            const take = Math.min(remaining, available);
            const lotUnitCost = Number(lot.unitCost || compUnitCost);

            await tx.update(productLots).set({
              quantity: String(available - take),
            }).where(eq(productLots.id, lot.id));

            await tx.insert(stockMovements).values({
              companyId,
              productId: line.componentProductId,
              lotId: lot.id,
              movementType: "mo_consume",
              quantity: String(-take),
              unitCost: String(lotUnitCost.toFixed(4)),
              totalCost: String((lotUnitCost * take).toFixed(4)),
              referenceType: "manufacturing_order",
              referenceId: id,
              referenceNo: mo.orderNo,
              notes: `ตัดวัตถุดิบจากล็อต ${lot.lotNumber} สำหรับ ${mo.orderNo}`,
              createdBy: user?.id || null,
            });

            remaining -= take;
          }

          if (remaining > 0) {
            await tx.insert(stockMovements).values({
              companyId,
              productId: line.componentProductId,
              movementType: "mo_consume",
              quantity: String(-remaining),
              unitCost: String(compUnitCost.toFixed(4)),
              totalCost: String((compUnitCost * remaining).toFixed(4)),
              referenceType: "manufacturing_order",
              referenceId: id,
              referenceNo: mo.orderNo,
              notes: `ตัดวัตถุดิบ (ไม่มีล็อต) สำหรับ ${mo.orderNo}`,
              createdBy: user?.id || null,
            });
          }

          await tx.update(manufacturingOrderLines).set({
            consumedQty: String(deductQty),
          }).where(eq(manufacturingOrderLines.id, line.id));

          const [existingStock] = await tx.select().from(productStock)
            .where(and(eq(productStock.companyId, companyId), eq(productStock.productId, line.componentProductId)));
          const currentQty = Number(existingStock?.quantity || "0");
          const newQty = String(currentQty - deductQty);
          if (existingStock) {
            await tx.update(productStock).set({ quantity: newQty }).where(eq(productStock.id, existingStock.id));
          } else {
            await tx.insert(productStock).values({ companyId, productId: line.componentProductId, quantity: newQty });
          }
          if (moSourceWarehouseId && mfgTriggers.manufacturing_complete) {
            await upsertWarehouseStockLevel(companyId, line.componentProductId, moSourceWarehouseId, -deductQty, tx);
          }
        }

        const consumeMovements = await tx.select().from(stockMovements)
          .where(and(
            eq(stockMovements.referenceType, "manufacturing_order"),
            eq(stockMovements.referenceId, id),
            eq(stockMovements.movementType, "mo_consume")
          ));
        const totalMaterialCost = consumeMovements.reduce((sum, m) => sum + Math.abs(Number(m.totalCost || 0)), 0);
        const unitCost = completedQty > 0 ? (totalMaterialCost / completedQty) : 0;

        const [newLot] = await tx.insert(productLots).values({
          companyId,
          productId: mo.productId,
          lotNumber,
          manufacturingDate: mfgDate,
          expiryDate: expDate,
          quantity: String(completedQty),
          unitCost: String(unitCost.toFixed(4)),
          status: "active",
          notes: `ผลิตจากใบสั่งผลิต ${mo.orderNo}`,
        }).returning();

        await tx.insert(stockMovements).values({
          companyId,
          productId: mo.productId,
          lotId: newLot.id,
          movementType: "production",
          quantity: String(completedQty),
          unitCost: String(unitCost.toFixed(4)),
          totalCost: String(totalMaterialCost.toFixed(4)),
          referenceType: "manufacturing_order",
          referenceId: id,
          referenceNo: mo.orderNo,
          notes: `ผลิตสำเร็จ ล็อต ${lotNumber} จำนวน ${completedQty} ${mo.unit} ต้นทุน ${totalMaterialCost.toFixed(2)} บาท`,
          createdBy: user?.id || null,
        });

        const [existingFgStock] = await tx.select().from(productStock)
          .where(and(eq(productStock.companyId, companyId), eq(productStock.productId, mo.productId)));
        const fgCurrentQty = Number(existingFgStock?.quantity || "0");
        const fgNewQty = String(fgCurrentQty + completedQty);
        if (existingFgStock) {
          await tx.update(productStock).set({ quantity: fgNewQty }).where(eq(productStock.id, existingFgStock.id));
        } else {
          await tx.insert(productStock).values({ companyId, productId: mo.productId, quantity: fgNewQty });
        }
        if (moTargetWarehouseId && mfgTriggers.manufacturing_complete) {
          await upsertWarehouseStockLevel(companyId, mo.productId, moTargetWarehouseId, completedQty, tx);
        }

        await tx.update(manufacturingOrders).set({
          status: "completed",
          completedQty: String(completedQty),
          lotNumber,
          manufacturingDate: mfgDate,
          expiryDate: expDate,
          completedAt: new Date(),
        }).where(eq(manufacturingOrders.id, id));
      });

      const [result] = await db.select().from(manufacturingOrders).where(eq(manufacturingOrders.id, id));
      res.json(result);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/manufacturing-orders/:id", requireAuth, requireModule("inventory"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });

      const [mo] = await db.select().from(manufacturingOrders)
        .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.companyId, companyId)));
      if (!mo) return res.status(404).json({ message: "ไม่พบใบสั่งผลิต" });
      if (mo.status === "completed") return res.status(400).json({ message: "ไม่สามารถลบใบสั่งผลิตที่เสร็จแล้ว" });

      await db.delete(manufacturingOrders).where(eq(manufacturingOrders.id, id));
      res.json({ success: true });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/manufacturing-orders/:id/create-journal", requireAuth, requireModule("inventory"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const companyId = Number(req.body.companyId || req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const user = req.user as any;

      const [mo] = await db.select().from(manufacturingOrders)
        .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.companyId, companyId)));
      if (!mo) return res.status(404).json({ message: "ไม่พบใบสั่งผลิต" });
      if (mo.status !== "completed") return res.status(400).json({ message: "ต้องผลิตเสร็จก่อนจึงจะบันทึกบัญชีได้" });
      if (mo.journalEntryId) return res.status(400).json({ message: "บันทึกบัญชีแล้ว" });

      const costMovements = await db.select().from(stockMovements)
        .where(and(
          eq(stockMovements.referenceType, "manufacturing_order"),
          eq(stockMovements.referenceId, id),
          eq(stockMovements.movementType, "production")
        ));

      const totalCost = costMovements.length > 0 ? Number(costMovements[0].totalCost || 0) : 0;
      if (totalCost <= 0) return res.status(400).json({ message: "ไม่มีต้นทุนการผลิต กรุณาตรวจสอบราคาต้นทุนวัตถุดิบ" });

      const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
      const accountMap = new Map(allAccounts.map(a => [a.code, a]));

      const fgCode = ["1301000", "1301"].find(c => accountMap.has(c));
      const rmCode = ["1302000", "1302"].find(c => accountMap.has(c));
      if (!fgCode || !rmCode) {
        return res.status(400).json({ message: "ไม่พบรหัสบัญชี สินค้าสำเร็จรูป (1301000) หรือ วัตถุดิบ (1302000) กรุณาตรวจสอบผังบัญชี" });
      }

      const fgAccount = accountMap.get(fgCode)!;
      const rmAccount = accountMap.get(rmCode)!;

      const [product] = await db.select().from(products).where(eq(products.id, mo.productId));
      const productName = product?.name || "";
      const entryDate = mo.manufacturingDate || mo.completedAt?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10);
      const costStr = totalCost.toFixed(2);

      const result = await db.transaction(async (tx) => {
        const [moCheck] = await tx.select().from(manufacturingOrders)
          .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.companyId, companyId)));
        if (moCheck.journalEntryId) throw new Error("บันทึกบัญชีแล้ว");

        const entryNo = await getNextJournalEntryNo(companyId, "general", entryDate);

        const [entry] = await tx.insert(journalEntries).values({
          companyId,
          entryNo,
          entryDate,
          reference: mo.orderNo,
          description: `บันทึกต้นทุนการผลิต ${mo.orderNo} - ${productName} จำนวน ${mo.completedQty} ${mo.unit}`,
          journalBook: "general",
          createdBy: user?.id || null,
          status: "posted",
          sourceDocType: "manufacturing_order",
          sourceDocId: id,
        }).returning();

        await tx.insert(journalLines).values([
          {
            journalEntryId: entry.id,
            accountId: fgAccount.id,
            description: `สินค้าสำเร็จรูป - ${productName}`,
            debit: costStr,
            credit: "0",
          },
          {
            journalEntryId: entry.id,
            accountId: rmAccount.id,
            description: `วัตถุดิบที่ใช้ - ${mo.orderNo}`,
            debit: "0",
            credit: costStr,
          },
        ]);

        await tx.update(manufacturingOrders).set({
          journalEntryId: entry.id,
        }).where(eq(manufacturingOrders.id, id));

        return { journalEntryId: entry.id, entryNo };
      });

      res.json({ success: true, ...result });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  // [lot-trace] GET /api/manufacturing-orders/lot-trace — ตรวจสอบย้อนกลับจาก Lot สินค้าสำเร็จรูป
  app.get("/api/manufacturing-orders/lot-trace", requireAuth, requireModule("inventory"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const lotNumber = req.query.lot as string;
      if (!companyId || !lotNumber) return res.status(400).json({ message: "companyId and lot required" });

      const [outputLot] = await db.select().from(productLots)
        .where(and(eq(productLots.companyId, companyId), eq(productLots.lotNumber, lotNumber)));
      if (!outputLot) return res.status(404).json({ message: "ไม่พบล็อตนี้ในระบบ" });

      const [outputProduct] = await db.select().from(products).where(eq(products.id, outputLot.productId));

      const [productionMove] = await db.select().from(stockMovements)
        .where(and(
          eq(stockMovements.companyId, companyId),
          eq(stockMovements.lotId, outputLot.id),
          eq(stockMovements.movementType, "production")
        ));

      if (!productionMove?.referenceId) {
        return res.json({
          outputLot: { id: outputLot.id, lotNumber: outputLot.lotNumber, product: outputProduct ? { name: outputProduct.name, code: outputProduct.code } : null, quantity: outputLot.quantity, manufacturingDate: outputLot.manufacturingDate, expiryDate: outputLot.expiryDate, unitCost: outputLot.unitCost },
          mo: null,
          consumedLots: [],
        });
      }

      const moId = productionMove.referenceId;
      const [mo] = await db.select().from(manufacturingOrders).where(eq(manufacturingOrders.id, moId));

      const consumeMoves = await db.select().from(stockMovements)
        .where(and(
          eq(stockMovements.companyId, companyId),
          eq(stockMovements.referenceType, "manufacturing_order"),
          eq(stockMovements.referenceId, moId),
          eq(stockMovements.movementType, "mo_consume")
        ));

      const lotIds = consumeMoves.filter(m => m.lotId).map(m => m.lotId!);
      const inputLots = lotIds.length > 0
        ? await db.select().from(productLots).where(inArray(productLots.id, lotIds))
        : [];

      const grIds = [...new Set(inputLots.filter(l => l.grId).map(l => l.grId!))];
      const grRows = grIds.length > 0
        ? await db.select({ id: goodsReceivings.id, grNo: goodsReceivings.grNo, vendorName: goodsReceivings.vendorName })
            .from(goodsReceivings).where(inArray(goodsReceivings.id, grIds))
        : [];
      const grMap = new Map(grRows.map(g => [g.id, g]));

      const inputProductIds = [...new Set(consumeMoves.map(m => m.productId))];
      const inputProducts = inputProductIds.length > 0
        ? await db.select().from(products).where(inArray(products.id, inputProductIds))
        : [];
      const inputProductMap = new Map(inputProducts.map(p => [p.id, p]));
      const inputLotMap = new Map(inputLots.map(l => [l.id, l]));

      const consumedLots = consumeMoves.map(move => {
        const lot = move.lotId ? inputLotMap.get(move.lotId) : null;
        const prod = inputProductMap.get(move.productId);
        const gr = lot?.grId ? grMap.get(lot.grId) : null;
        return {
          productId: move.productId,
          product: prod ? { name: prod.name, code: prod.code } : null,
          lotNumber: lot?.lotNumber || "(ไม่ระบุล็อต)",
          lotId: move.lotId,
          qtyConsumed: Math.abs(Number(move.quantity)),
          supplier: gr?.vendorName || null,
          grNo: gr?.grNo || null,
          expiryDate: lot?.expiryDate || null,
          manufacturingDate: lot?.manufacturingDate || null,
        };
      });

      res.json({
        outputLot: { id: outputLot.id, lotNumber: outputLot.lotNumber, product: outputProduct ? { name: outputProduct.name, code: outputProduct.code } : null, quantity: outputLot.quantity, manufacturingDate: outputLot.manufacturingDate, expiryDate: outputLot.expiryDate, unitCost: outputLot.unitCost },
        mo: mo ? { id: mo.id, orderNo: mo.orderNo, completedAt: (mo as any).completedAt, plannedQty: mo.plannedQty, unit: mo.unit } : null,
        consumedLots,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
