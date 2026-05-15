import type { Express, Request, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { eq, desc, asc, and, or, ilike, inArray, count, sum , sql } from "drizzle-orm";
import { products, productBundles, documentImportBatches, stockMovements, promotions, companies, productLots, goodsRequisitions, goodsRequisitionItems, journalEntries, journalLines, stockTransfers, stockTransferItems, warehouses, warehouseStockLevels, branches, insertProductSchema } from "@shared/schema";
import { requireAuth, requireModule, requireAnyModule, checkDocOwnership } from "../route-middleware";
// import { runProductSplitMigration } from "@shared/schema-extra"; // ✅ DONE 2026-05-11T13:35:09Z — FLAG PRODUCT_SPLIT_MIGRATION_20260510 set, 2603+778=3381 rows verified
import { getNextJournalEntryNo, logActivity, deleteStockMovementsForDoc, deductStockBundleAware, upsertWarehouseStockLevel, getInventoryTriggers } from "../route-helpers";
import { activeProducts, inactiveProducts as inactiveProductsTable } from "@shared/schema-extra";
import { parsePagination, paginatedResponse } from "./pagination";
import * as XLSX from "xlsx";
import path from "path";
import { z } from "zod";
import { recalcBundleStock, recalcBomStock, recalcMappingStock, recalcAllStock } from "../inventory-recalc";
import { createCOGSJournalEntry, updateCostJournalEntries } from "../inventory-journal";
import { parse as csvParse } from "csv-parse/sync";
import multer from "multer";
const upload = multer({ storage: multer.memoryStorage() });

const DEFAULT_CATEGORIES = [
  { code: "product", name: "สินค้า" },
  { code: "service", name: "บริการ" },
  { code: "raw_material", name: "วัตถุดิบ" },
  { code: "consumable", name: "วัสดุสิ้นเปลือง" },
];

export function registerProductsRoutes(app: Express) {
  // runProductSplitMigration(db).catch((err: any) => { // ✅ DONE 2026-05-11T13:35:09Z — commented out after verify
  //   console.error("[migration] ❌ runProductSplitMigration failed — server continues but product split tables may be incomplete:", err.message);
  // });

// ==================== Product Categories ====================
app.get("/api/product-categories", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    let result = await db.execute(sql`SELECT * FROM product_categories WHERE company_id = ${companyId} ORDER BY id`);
    let cats = result.rows as any[];
    if (cats.length === 0) {
      for (const c of DEFAULT_CATEGORIES) {
        await db.execute(sql`INSERT INTO product_categories (company_id, code, name, active) VALUES (${companyId}, ${c.code}, ${c.name}, true)`);
      }
      const seeded = await db.execute(sql`SELECT * FROM product_categories WHERE company_id = ${companyId} ORDER BY id`);
      cats = seeded.rows as any[];
    }
    res.json(cats);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/product-categories", requireAuth, async (req, res) => {
  try {
    const { companyId, code, name } = req.body;
    if (!companyId || !code || !name) return res.status(400).json({ message: "กรุณาระบุ code และ name" });
    const existing = await db.execute(sql`SELECT id FROM product_categories WHERE company_id = ${companyId} AND code = ${code.trim()}`);
    if (existing.rows.length > 0) return res.status(409).json({ message: `รหัสหมวดหมู่ "${code}" ซ้ำ` });
    const created = await db.execute(sql`INSERT INTO product_categories (company_id, code, name, active) VALUES (${companyId}, ${code.trim()}, ${name.trim()}, true) RETURNING *`);
    res.status(201).json(created.rows[0]);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/product-categories/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, active } = req.body;
    if (name !== undefined && active !== undefined) {
      const result = await db.execute(sql`UPDATE product_categories SET name = ${name.trim()}, active = ${active} WHERE id = ${id} RETURNING *`);
      if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบหมวดหมู่" });
      return res.json(result.rows[0]);
    } else if (name !== undefined) {
      const result = await db.execute(sql`UPDATE product_categories SET name = ${name.trim()} WHERE id = ${id} RETURNING *`);
      if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบหมวดหมู่" });
      return res.json(result.rows[0]);
    } else if (active !== undefined) {
      const result = await db.execute(sql`UPDATE product_categories SET active = ${active} WHERE id = ${id} RETURNING *`);
      if (result.rows.length === 0) return res.status(404).json({ message: "ไม่พบหมวดหมู่" });
      return res.json(result.rows[0]);
    }
    return res.status(400).json({ message: "ไม่มีข้อมูลที่ต้องอัพเดท" });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/product-categories/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const catResult = await db.execute(sql`SELECT * FROM product_categories WHERE id = ${id}`);
    if (catResult.rows.length === 0) return res.status(404).json({ message: "ไม่พบหมวดหมู่" });
    const cat = catResult.rows[0] as any;
    const usedCount = await db.select({ c: count() }).from(products).innerJoin(activeProducts, eq(activeProducts.id, products.id)).where(and(eq(products.companyId, cat.company_id), eq(products.category, cat.code)));
    if (Number(usedCount[0]?.c) > 0) {
      return res.status(400).json({ message: `หมวดหมู่นี้มีสินค้าใช้อยู่ ${usedCount[0].c} รายการ ไม่สามารถลบได้` });
    }
    await db.execute(sql`DELETE FROM product_categories WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/product-categories/import/template", requireAuth, (_req, res) => {
  const wb = XLSX.utils.book_new();
  const data = [
    ["รหัส", "ชื่อหมวดหมู่"],
    ["bedding", "เครื่องนอน"],
    ["pillow", "หมอน"],
    ["blanket", "ผ้าห่ม"],
    ["mattress", "ที่นอน"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, "หมวดหมู่สินค้า");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=category_template.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

app.post("/api/product-categories/import", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    if (!req.file) return res.status(400).json({ message: "ไม่พบไฟล์" });
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (rows.length === 0) return res.status(400).json({ message: "ไฟล์ว่าง" });

    const existingResult = await db.execute(sql`SELECT * FROM product_categories WHERE company_id = ${companyId}`);
    const existingCodes = new Set((existingResult.rows as any[]).map(c => c.code));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const code = String(row["รหัส"] || "").trim();
      const name = String(row["ชื่อหมวดหมู่"] || "").trim();
      if (!code || !name) { errors.push(`แถว ${i + 2}: รหัสหรือชื่อว่าง`); continue; }
      if (existingCodes.has(code)) { skipped++; continue; }
      await db.execute(sql`INSERT INTO product_categories (company_id, code, name, active) VALUES (${companyId}, ${code}, ${name}, true)`);
      existingCodes.add(code);
      created++;
    }

    res.json({ created, skipped, errors, total: rows.length });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ==================== Product Import/Export ====================
app.get("/api/products/import/template", (_req, res) => {
  const headers = ["รหัสสินค้า", "ชื่อสินค้า", "ชื่ออังกฤษ", "ชื่อจีน", "หมวดหมู่", "รายละเอียด", "หน่วย", "ราคาขาย", "ต้นทุน", "รวมVAT", "บาร์โค้ด", "รหัสบัญชี", "ชื่อคลัง", "จำนวนคงเหลือ"];
  const sample = ["P001", "สินค้าตัวอย่าง", "Sample Product", "", "สินค้า", "รายละเอียดสินค้า", "ชิ้น", 100, 70, "ไม่รวม", "8851234567890", "4001000", "คลังหลัก", 50];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  const colWidths = [12, 30, 25, 20, 12, 30, 8, 12, 12, 10, 16, 12, 18, 14];
  ws["!cols"] = colWidths.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=template_products.xlsx");
  res.send(Buffer.from(buf));
});

app.get("/api/products/export", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const allProducts = await storage.getProducts(companyId);
    const active = allProducts.filter(p => p.active);
    const headers = ["รหัสสินค้า", "ชื่อสินค้า", "ชื่ออังกฤษ", "ชื่อจีน", "หมวดหมู่", "รายละเอียด", "หน่วย", "ราคาขาย", "ต้นทุน", "รวมVAT", "บาร์โค้ด", "รหัสบัญชี"];
    const catLabel: Record<string, string> = { product: "สินค้า", service: "บริการ", raw_material: "วัตถุดิบ", consumable: "วัสดุสิ้นเปลือง" };
    const rows = active.map(p => [
      p.code, p.name, p.nameEn || "", p.nameZh || "",
      catLabel[p.category] || p.category,
      p.description || "", p.unit, Number(p.price) || 0, Number(p.cost) || 0,
      p.vatIncluded ? "รวม" : "ไม่รวม", p.barcode || "", p.accountCode || ""
    ]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const colWidths = [12, 30, 25, 20, 12, 30, 8, 12, 12, 10, 16, 12];
    ws["!cols"] = colWidths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=products_export.xlsx");
    res.send(Buffer.from(buf));
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/products/import/preview", requireAuth, requireModule("inventory"), upload.single("file"), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "กรุณาอัปโหลดไฟล์" });
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });

    let rows: any[] = [];
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
      rows = csvParse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true, delimiter, relax_quotes: true, relax_column_count: true });
    } else if (ext === ".xlsx" || ext === ".xls") {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const warehouseSheetNames = ["แยกตามคลัง", "by_warehouse", "warehouse"];
      let chosenSheet = workbook.Sheets[workbook.SheetNames[0]];
      for (const wsName of warehouseSheetNames) {
        if (workbook.SheetNames.includes(wsName)) {
          chosenSheet = workbook.Sheets[wsName];
          break;
        }
      }
      rows = XLSX.utils.sheet_to_json(chosenSheet, { defval: "" });
    } else {
      return res.status(400).json({ message: "รองรับเฉพาะไฟล์ .csv, .xlsx, .xls" });
    }

    if (rows.length === 0) return res.status(400).json({ message: "ไม่พบข้อมูลในไฟล์" });
    if (rows.length > 5000) return res.status(400).json({ message: "รองรับสูงสุด 5,000 รายการต่อครั้ง" });

    const headers = Object.keys(rows[0]);

    const FIELD_MAP: Record<string, string[]> = {
      code: ["code", "รหัส", "รหัสสินค้า", "product_code", "item_code", "sku", "handle"],
      name: ["name", "ชื่อ", "ชื่อสินค้า", "product_name", "item_name", "item name"],
      nameEn: ["name_en", "nameEn", "ชื่ออังกฤษ", "english_name"],
      nameZh: ["name_zh", "nameZh", "ชื่อจีน", "chinese_name"],
      category: ["category", "หมวดหมู่", "ประเภท", "type", "หมวดสินค้า"],
      description: ["description", "รายละเอียด", "desc"],
      unit: ["unit", "หน่วย", "หน่วยนับ", "sold by weight"],
      price: ["price", "ราคา", "ราคาขาย", "selling_price", "unit_price", "default price"],
      cost: ["cost", "ต้นทุน", "unit_cost", "ราคาต้นทุนเฉลี่ย", "ต้นทุนเฉลี่ย", "avg_cost", "cost per item"],
      vatIncluded: ["vat", "vatIncluded", "รวมvat", "vat_included", "include_vat"],
      accountCode: ["account_code", "accountCode", "รหัสบัญชี", "gl_code"],
      barcode: ["barcode", "บาร์โค้ด", "bar_code", "ean", "ean13", "upc"],
      warehouseName: ["warehouse", "warehouseName", "ชื่อคลัง", "คลัง", "warehouse_name"],
      stockQty: ["stock", "stockQty", "จำนวนคงเหลือ", "จำนวนในคลัง", "qty", "quantity", "จำนวน", "stock_qty", "on_hand", "in stock"],
    };

    const mapField = (header: string): string | null => {
      const h = header.trim().toLowerCase();
      for (const [field, aliases] of Object.entries(FIELD_MAP)) {
        if (aliases.some(a => a.toLowerCase() === h)) return field;
      }
      return null;
    };

    const columnMapping: Record<string, string | null> = {};
    headers.forEach(h => { columnMapping[h] = mapField(h); });

    const bundleHeaders = ["รหัสชุด", "bundle_code", "set_code"];
    const isBundleFile = headers.some(h => bundleHeaders.some(bh => h.trim().toLowerCase() === bh.toLowerCase()));
    if (isBundleFile) {
      return res.status(400).json({
        message: "ไฟล์นี้เป็นรูปแบบสินค้าจัดชุด (Bundle) กรุณาใช้ช่อง \"นำเข้าสินค้าจัดชุด\" ด้านล่างแทน",
        isBundleFile: true
      });
    }

    const mappedFields = Object.values(columnMapping).filter(Boolean);
    const hasCode = mappedFields.includes("code");
    const hasName = mappedFields.includes("name");
    if (!hasCode && !hasName) {
      return res.status(400).json({
        message: `ไม่พบคอลัมน์ที่ตรงกับระบบ\nคอลัมน์ในไฟล์: ${headers.join(", ")}\nคอลัมน์ที่รองรับ: รหัสสินค้า, ชื่อสินค้า, หมวดหมู่, หน่วย, ราคาขาย, ต้นทุน, บาร์โค้ด, SKU, Handle ฯลฯ\nกรุณาใช้ Template จากปุ่ม "ดาวน์โหลด Template" หรือใช้ไฟล์ที่ระบบสร้างให้`
      });
    }

    const existingProducts = await storage.getProducts(companyId);
    const existingCodes = new Set(existingProducts.filter(p => p.active).map(p => p.code));
    const inactiveCodes = new Set(existingProducts.filter(p => !p.active).map(p => p.code));

    const catMap: Record<string, string> = {
      "สินค้า": "product", "product": "product",
      "บริการ": "service", "service": "service",
      "วัตถุดิบ": "raw_material", "raw_material": "raw_material",
      "วัสดุสิ้นเปลือง": "consumable", "consumable": "consumable",
    };

    const preview = rows.map((row: any, idx: number) => {
      const mapped: any = {};
      for (const [header, value] of Object.entries(row)) {
        const field = columnMapping[header];
        if (field) mapped[field] = String(value).trim();
      }

      const issues: string[] = [];
      if (!mapped.code) issues.push("ไม่มีรหัสสินค้า");
      if (!mapped.name) issues.push("ไม่มีชื่อสินค้า");
      const isExistingProduct = mapped.code && existingCodes.has(mapped.code);
      const isInactiveProduct = mapped.code && !isExistingProduct && inactiveCodes.has(mapped.code);
      if (isExistingProduct) issues.push(`รหัส "${mapped.code}" มีในระบบแล้ว`);
      if (isInactiveProduct) issues.push(`รหัส "${mapped.code}" มีในระบบแล้ว (เลิกใช้งาน) — จะถูกข้ามโดยอัตโนมัติ ตรวจสอบว่าไม่ได้นำเข้าไฟล์ซ้ำ`);

      if (mapped.category) {
        const c = mapped.category.toLowerCase();
        mapped.category = catMap[c] || "product";
      } else {
        mapped.category = "product";
      }

      if (mapped.price) mapped.price = String(Number(mapped.price) || 0);
      else mapped.price = "0";
      if (mapped.cost) mapped.cost = String(Number(mapped.cost) || 0);
      else mapped.cost = "0";

      if (mapped.vatIncluded) {
        const v = mapped.vatIncluded.toLowerCase();
        mapped.vatIncluded = ["รวม", "yes", "true", "1", "y", "included"].includes(v);
      } else {
        mapped.vatIncluded = false;
      }

      if (!mapped.unit) mapped.unit = "ชิ้น";

      const hasWh = Object.values(columnMapping).includes("warehouseName");
      let status: string;
      if (issues.length === 0) {
        status = "ok";
      } else if (hasWh && isExistingProduct && issues.length === 1) {
        status = "ok";
      } else if (issues.some(i => i.includes("มีในระบบแล้ว"))) {
        status = "duplicate";
      } else {
        status = "error";
      }

      return {
        row: idx + 1,
        data: mapped,
        issues,
        status,
      };
    });

    const hasWarehouseCol = Object.values(columnMapping).includes("warehouseName");

    if (hasWarehouseCol) {
      const seenCodeWarehouse = new Set<string>();
      preview.forEach(p => {
        const wh = p.data.warehouseName || "";
        const key = `${p.data.code}::${wh}`;
        if (p.data.code && seenCodeWarehouse.has(key)) {
          p.issues.push(`รหัส "${p.data.code}" + คลัง "${wh}" ซ้ำในไฟล์`);
          p.status = "duplicate";
        }
        if (p.data.code) seenCodeWarehouse.add(key);
      });
    } else {
      const seenCodes = new Set<string>();
      preview.forEach(p => {
        if (p.data.code && seenCodes.has(p.data.code)) {
          p.issues.push(`รหัส "${p.data.code}" ซ้ำในไฟล์`);
          p.status = "duplicate";
        }
        if (p.data.code) seenCodes.add(p.data.code);
      });
    }

    const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));
    const warehouseNamesLower = new Set(companyWarehouses.map(w => w.name.trim().toLowerCase()));
    const newWarehouseNames: string[] = [];
    if (hasWarehouseCol) {
      const seenNewWh = new Set<string>();
      for (const p of preview) {
        const wh = (p.data.warehouseName || "").trim();
        if (wh && !warehouseNamesLower.has(wh.toLowerCase()) && !seenNewWh.has(wh.toLowerCase())) {
          newWarehouseNames.push(wh);
          seenNewWh.add(wh.toLowerCase());
        }
      }
    }

    const stockOkCount = hasWarehouseCol ? preview.filter(p => p.status !== "error" && p.data.warehouseName && Number(p.data.stockQty) > 0).length : 0;

    res.json({
      headers,
      columnMapping,
      totalRows: rows.length,
      preview,
      hasWarehouseCol,
      companyWarehouses: companyWarehouses.map(w => ({ id: w.id, name: w.name })),
      newWarehouseNames,
      stats: {
        ok: preview.filter(p => p.status === "ok").length,
        duplicate: preview.filter(p => p.status === "duplicate").length,
        duplicateInFile: preview.filter(p => p.status === "duplicate" && p.issues.some((i: string) => i.includes("ซ้ำในไฟล์"))).length,
        duplicateInSystem: preview.filter(p => p.status === "duplicate" && p.issues.some((i: string) => i.includes("มีในระบบแล้ว"))).length,
        error: preview.filter(p => p.status === "error").length,
        stockEntries: stockOkCount,
      },
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/products/import/execute", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, products: productList, updateProducts, stockEntries, stockOpenDate } = req.body;
    if (!companyId || !productList || !Array.isArray(productList)) {
      return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
    }

    // ── ONE-TIME CLEANUP: ENTRY #006 (2026-05-09) ──
    // Removes orphan stock_movements (movement_type='initial', no reference doc) that silently
    // block deletion of inactive duplicate products. Triggered on first use of this endpoint.
    // Root cause: warehouse CSV import wrote stock_movements without reference anchor, and product
    // import allowed duplicate codes to create new rows silently. See db/schema-history.md ENTRY #006.
    const CLEANUP_FLAG_006 = "ORPHAN_STOCK_MOVEMENT_CLEANUP_20260509";
    try {
      const flagRows = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = '${CLEANUP_FLAG_006}' LIMIT 1`));
      if ((flagRows.rows || []).length === 0) {
        await db.execute(sql.raw(`DELETE FROM stock_movements WHERE movement_type = 'initial' AND reference_type IS NULL AND reference_id IS NULL AND product_id IN (SELECT p1.id FROM products p1 WHERE p1.active = false AND EXISTS (SELECT 1 FROM products p2 WHERE p2.code = p1.code AND p2.company_id = p1.company_id AND p2.id != p1.id))`));
        await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('${CLEANUP_FLAG_006}', 'done_${new Date().toISOString()}') ON CONFLICT (config_key) DO NOTHING`));
        console.log("[cleanup] \u2705 ENTRY #006: orphan initial stock_movements for inactive duplicate products removed");
      }
    } catch (cleanupErr: any) {
      console.error("[cleanup] \u274C ENTRY #006 failed:", cleanupErr.message);
    }
    // ── END ONE-TIME CLEANUP ──

    const existingProducts = await storage.getProducts(companyId);
    const existingCodes = new Set(existingProducts.filter(p => p.active).map(p => p.code));
    const inactiveCodes = new Set(existingProducts.filter(p => !p.active).map(p => p.code));
    const allBlockedCodes = new Set([...existingCodes, ...inactiveCodes]);
    const existingCodeMap = new Map(existingProducts.filter(p => p.active).map(p => [p.code, p.id]));

    const uniqueProducts = new Map<string, any>();
    for (const p of productList) {
      if (!p.code || !p.name || allBlockedCodes.has(p.code)) continue;
      if (!uniqueProducts.has(p.code)) {
        uniqueProducts.set(p.code, {
          companyId,
          code: p.code,
          name: p.name,
          nameEn: p.nameEn || null,
          nameZh: p.nameZh || null,
          category: p.category || "product",
          description: p.description || null,
          unit: p.unit || "ชิ้น",
          price: String(Number(p.price) || 0),
          cost: String(Number(p.cost) || 0),
          vatIncluded: !!p.vatIncluded,
          accountCode: p.accountCode || null,
          barcode: p.barcode || null,
        });
      }
    }
    const validProducts = Array.from(uniqueProducts.values());

    let updatedCount = 0;
    if (Array.isArray(updateProducts) && updateProducts.length > 0) {
      for (const p of updateProducts) {
        const existingId = existingCodeMap.get(p.code);
        if (existingId) {
          await storage.updateProduct(existingId, {
            name: p.name,
            nameEn: p.nameEn || undefined,
            nameZh: p.nameZh || undefined,
            category: p.category || "product",
            description: p.description || undefined,
            unit: p.unit || "ชิ้น",
            price: String(Number(p.price) || 0),
            cost: String(Number(p.cost) || 0),
            vatIncluded: !!p.vatIncluded,
            accountCode: p.accountCode || undefined,
            barcode: p.barcode || undefined,
          });
          updatedCount++;
        }
      }
    }

    const hasStockEntries = Array.isArray(stockEntries) && stockEntries.length > 0;
    if (validProducts.length === 0 && updatedCount === 0 && !hasStockEntries) {
      return res.status(400).json({ message: "ไม่มีรายการที่สามารถนำเข้าได้" });
    }

    let created: any[] = [];
    if (validProducts.length > 0) {
      created = await storage.bulkCreateProducts(validProducts);
    }

    const createdCodeMap = new Map(created.map((p: any) => [p.code, p.id]));
    const allCodeMap = new Map([...existingCodeMap, ...createdCodeMap]);

    let stockSetCount = 0;
    if (Array.isArray(stockEntries) && stockEntries.length > 0) {
      const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));
      const whNameMap = new Map(companyWarehouses.map(w => [w.name.trim().toLowerCase(), w.id]));

      for (const entry of stockEntries) {
        const productId = allCodeMap.get(entry.code);
        const whKey = (entry.warehouseName || "").trim().toLowerCase();
        let warehouseId = whNameMap.get(whKey);
        if (!warehouseId && whKey) {
          const whCode = String(companyWarehouses.length + 1);
          const [newWh] = await db.insert(warehouses).values({
            companyId,
            code: whCode,
            name: entry.warehouseName.trim(),
            warehouseType: "normal",
            isDefault: false,
          }).returning();
          warehouseId = newWh.id;
          whNameMap.set(whKey, newWh.id);
          companyWarehouses.push(newWh as any);
        }
        const qty = Number(entry.stockQty) || 0;
        if (!productId || !warehouseId || qty <= 0) continue;

        const existing = await db.select().from(warehouseStockLevels)
          .where(and(
            eq(warehouseStockLevels.companyId, companyId),
            eq(warehouseStockLevels.productId, productId),
            eq(warehouseStockLevels.warehouseId, warehouseId),
          ));

        const prevQty = existing.length > 0 ? Number(existing[0].quantity) : 0;
        if (existing.length > 0) {
          await db.update(warehouseStockLevels)
            .set({ quantity: String(qty) })
            .where(eq(warehouseStockLevels.id, existing[0].id));
        } else {
          await db.insert(warehouseStockLevels).values({
            companyId,
            productId,
            warehouseId,
            quantity: String(qty),
          });
        }
        // บันทึก stock_movement สำหรับ initial stock ที่ตั้งจาก Excel import
        const delta = qty - prevQty;
        if (delta !== 0) {
          try {
            await db.insert(stockMovements).values({
              companyId,
              productId,
              movementType: "initial",
              quantity: String(delta),
              notes: `ตั้งต้นสต๊อก (นำเข้า Excel) คลัง ${entry.warehouseName || warehouseId}`,
              referenceType: null,
              referenceId: null,
              unitCost: String(Number(entry.cost) || 0),
              totalCost: String((Number(entry.cost) || 0) * Math.abs(delta)),
              ...(stockOpenDate ? { createdAt: new Date(stockOpenDate) } : {}),
            });
          } catch (mvErr: any) {
            console.error(`[ProductImport] stock_movement insert failed pid=${productId}:`, mvErr.message);
          }
        }
        stockSetCount++;
      }

      // Sync product_stock (warehouse page) with sum from warehouse_stock_levels
      const syncProductIds = new Set<number>();
      for (const entry of stockEntries) {
        const pid = allCodeMap.get(entry.code);
        if (pid) syncProductIds.add(pid);
      }
      for (const pid of syncProductIds) {
        const levels = await db.select().from(warehouseStockLevels)
          .where(and(
            eq(warehouseStockLevels.companyId, companyId),
            eq(warehouseStockLevels.productId, pid),
          ));
        const totalQty = levels.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
        await storage.upsertProductStock(companyId, pid, String(totalQty));
      }
    }

    const existingBarcodes = new Set(existingProducts.filter(p => p.barcode).map(p => p.barcode));
    for (const p of created) {
      if (!p.barcode) {
        let barcode: string;
        do {
          const num = Math.floor(Math.random() * 999999999999).toString().padStart(12, '0');
          let sum = 0;
          for (let i = 0; i < 12; i++) { sum += parseInt(num[i]) * (i % 2 === 0 ? 1 : 3); }
          const checkDigit = (10 - (sum % 10)) % 10;
          barcode = num + checkDigit;
        } while (existingBarcodes.has(barcode));
        existingBarcodes.add(barcode);
        await storage.updateProduct(p.id, { barcode });
        (p as any).barcode = barcode;
      }
    }

    const createdIds = created.map((p: any) => p.id).filter(Boolean);
    let batchId: number | undefined;
    if (createdIds.length > 0) {
      const [batch] = await db.insert(documentImportBatches).values({
        companyId,
        docType: "product",
        fileName: req.body.fileName || null,
        totalCreated: createdIds.length,
        totalSkipped: productList.length - created.length,
        totalErrors: 0,
        createdDocIds: JSON.stringify(createdIds),
        createdBy: (req.user as any).id,
      }).returning();
      batchId = batch.id;
    }
    res.json({ imported: created.length, updated: updatedCount, stockSet: stockSetCount, total: productList.length + (updateProducts?.length || 0), skipped: productList.length - created.length, batchId });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// ==================== Products ====================
app.get("/api/products", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const category = req.query.category as string | undefined;
    const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
    const usePagination = !!req.query.page;
    const conditions: any[] = [eq(products.companyId, companyId)];
    if (category) conditions.push(eq(products.category, category));
    const whereClause = and(...conditions);
    const [{ total }] = await db.select({ total: count() }).from(products).where(whereClause);
    let query = db.select().from(products).where(whereClause).orderBy(asc(products.code), asc(products.name));
    const list = usePagination
      ? await query.limit(pageSize).offset(offset)
      : await query;
    const stockSums = await db.select({
      productId: stockMovements.productId,
      totalQty: sql<string>`COALESCE(SUM(CAST(${stockMovements.quantity} AS numeric)), 0)`,
    }).from(stockMovements).where(eq(stockMovements.companyId, companyId)).groupBy(stockMovements.productId);
    const stockMap = new Map(stockSums.map(s => [s.productId, parseFloat(s.totalQty)]));
    const enriched = list.map(p => ({
      ...p,
      quantity: String(stockMap.get(p.id) ?? 0),
    }));
    if (req.query.page) {
      res.json(paginatedResponse(enriched, Number(total), { page, pageSize, offset }));
    } else {
      res.json(enriched);
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/products/generate-barcode", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const allProducts = await storage.getProducts(companyId);
    const existingBarcodes = new Set(allProducts.filter(p => p.barcode).map(p => p.barcode));
    let barcode: string;
    do {
      const num = Math.floor(Math.random() * 999999999999).toString().padStart(12, '0');
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += parseInt(num[i]) * (i % 2 === 0 ? 1 : 3);
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      barcode = num + checkDigit;
    } while (existingBarcodes.has(barcode));
    res.json({ barcode });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/products/bulk-generate-barcodes", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const allProducts = await storage.getProducts(companyId);
    const withoutBarcode = allProducts.filter(p => !p.barcode);
    const existingBarcodes = new Set(allProducts.filter(p => p.barcode).map(p => p.barcode));
    let updated = 0;
    for (const product of withoutBarcode) {
      let barcode: string;
      do {
        const num = Math.floor(Math.random() * 999999999999).toString().padStart(12, '0');
        let sum = 0;
        for (let i = 0; i < 12; i++) {
          sum += parseInt(num[i]) * (i % 2 === 0 ? 1 : 3);
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        barcode = num + checkDigit;
      } while (existingBarcodes.has(barcode));
      existingBarcodes.add(barcode);
      await storage.updateProduct(product.id, { barcode });
      updated++;
    }
    res.json({ updated, total: allProducts.length });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/products/check-duplicates", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const code = req.query.code as string | undefined;
    const name = req.query.name as string | undefined;
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : undefined;
    const duplicates = await storage.findDuplicateProducts(companyId, { code, name, excludeId });
    res.json(duplicates);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/products", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const currentUser = req.user as any;
    if (currentUser.tenantId) {
      const limitCheck = await storage.checkTenantLimit(currentUser.tenantId, "products");
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: `แพ็คเกจ ${limitCheck.planName} รองรับสินค้าสูงสุด ${limitCheck.limit} รายการ (มีแล้ว ${limitCheck.current}) กรุณาอัพเกรดแพ็คเกจ` });
      }
    }
    const parsed = insertProductSchema.parse(req.body);
    const codeExists = await storage.findDuplicateProducts(parsed.companyId, { code: parsed.code });
    if (codeExists.length > 0) {
      return res.status(409).json({ message: `รหัสสินค้า "${parsed.code}" ถูกใช้แล้ว`, field: "code", duplicates: codeExists });
    }
    const created = await storage.createProduct(parsed);
    logActivity({ companyId: created.companyId || 0, userId: (req.user as any)?.id, userName: (req.user as any)?.username, action: "create", entityType: "product", entityId: String(created.id), entityName: created.name || "" }).catch(() => {});
    res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/products/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getProduct(id);
    if (!existing) return res.status(404).json({ message: "ไม่พบสินค้า" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    const newProductCode = req.body.code?.trim();
    if (newProductCode && newProductCode !== existing.code) {
      const [dup] = await db.select({ id: products.id }).from(products)
        .where(and(eq(products.companyId, existing.companyId!), eq(products.code, newProductCode), sql`${products.id} != ${id}`)).limit(1);
      if (dup) return res.status(409).json({ message: `รหัสสินค้า "${newProductCode}" ถูกใช้แล้ว`, field: "code" });
    }
    const updated = await storage.updateProduct(id, req.body);
    if (!updated) return res.status(404).json({ message: "ไม่พบสินค้า" });
    logActivity({ companyId: updated.companyId || 0, userId: (req.user as any)?.id, userName: (req.user as any)?.username, action: "update", entityType: "product", entityId: String(id), entityName: updated.name || "" }).catch(() => {});
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/products/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await storage.getProduct(id);
    if (!existing) return res.status(404).json({ message: "ไม่พบสินค้า" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    await storage.deleteProduct(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// ==================== Bulk Deactivate (active → inactive) ====================
app.post("/api/products/bulk-deactivate", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, productIds } = req.body as { companyId: number; productIds: number[] };
    if (!companyId || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุ companyId และ productIds" });
    }
    if (productIds.length > 1000) {
      return res.status(400).json({ message: "เลิกใช้งานได้ครั้งละไม่เกิน 1000 รายการ" });
    }
    { const ac = await checkDocOwnership(companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

    const result = await db
      .update(products)
      .set({ active: false })
      .where(and(inArray(products.id, productIds), eq(products.companyId, companyId), eq(products.active, true)))
      .returning({ id: products.id });

    return res.json({ deactivated: result.length });
  } catch (err) {
    console.error("[bulk-deactivate-products] error:", err);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดในการเลิกใช้งานสินค้า" });
  }
});

// ==================== Bulk Permanent Delete (inactive products only) ====================
// Reuses FK ref check from import-batch-routes deactivate logic
app.post("/api/products/bulk-permanent-delete", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, productIds } = req.body as { companyId: number; productIds: number[] };
    if (!companyId || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุ companyId และ productIds" });
    }
    if (productIds.length > 1000) {
      return res.status(400).json({ message: "ลบได้ครั้งละไม่เกิน 1000 รายการ" });
    }
    { const ac = await checkDocOwnership(companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

    // Verify ทั้งหมดเป็นของ company นี้ + active=false (กันลบสินค้า active โดยอุบัติเหตุ)
    const targets = await db.select({ id: products.id, name: products.name, code: products.code, active: products.active })
      .from(products)
      .where(and(eq(products.companyId, companyId), inArray(products.id, productIds)));

    const ownedIds = new Set(targets.map(t => t.id));
    const notOwned = productIds.filter(id => !ownedIds.has(id));
    const activeProducts = targets.filter(t => t.active);
    if (notOwned.length > 0) {
      return res.status(400).json({ message: `ไม่พบสินค้า ${notOwned.length} รายการในบริษัทนี้` });
    }
    if (activeProducts.length > 0) {
      return res.status(400).json({
        message: `ไม่สามารถลบสินค้าที่ยังใช้งานอยู่ (${activeProducts.length} รายการ) — กรุณาเลือกเฉพาะสินค้าที่ "เลิกใช้งาน"`,
      });
    }

    // FK ref check
    const pgIds = sql.raw(`ARRAY[${productIds.join(',')}]::int[]`);
    const usedRows = await db.execute(sql`
      SELECT DISTINCT product_id FROM (
        SELECT product_id FROM pos_transaction_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM invoice_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM quotation_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM sales_order_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM tax_invoice_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM receipt_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM purchase_order_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM purchase_invoice_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM ecommerce_order_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM goods_receiving_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM stock_transfer_items WHERE product_id = ANY(${pgIds})
      ) t
    `);
    const usedIds = new Set((usedRows.rows as any[]).map(r => r.product_id));
    const canDeleteIds = productIds.filter(id => !usedIds.has(id));
    const skippedTargets = targets.filter(t => usedIds.has(t.id));

    // Query เลขเอกสารที่อ้างอิงสินค้าที่ถูกข้าม
    const skippedDocMap: Record<number, string[]> = {};
    if (skippedTargets.length > 0) {
      const skippedPgIds = sql.raw(`ARRAY[${skippedTargets.map(s => s.id).join(',')}]::int[]`);
      const docRows = await db.execute(sql`
        SELECT product_id, 'ใบเสนอราคา ' || q.quotation_no as doc FROM quotation_items qi JOIN quotations q ON q.id=qi.quotation_id WHERE qi.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบสั่งขาย ' || so.order_no as doc FROM sales_order_items soi JOIN sales_orders so ON so.id=soi.sales_order_id WHERE soi.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบแจ้งหนี้ ' || i.invoice_no as doc FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE ii.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบกำกับภาษี ' || ti.tax_invoice_no as doc FROM tax_invoice_items tii JOIN tax_invoices ti ON ti.id=tii.tax_invoice_id WHERE tii.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบเสร็จรับเงิน ' || r.receipt_no as doc FROM receipt_items ri JOIN receipts r ON r.id=ri.receipt_id WHERE ri.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบสั่งซื้อ ' || po.po_no as doc FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE poi.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบแจ้งหนี้ซื้อ ' || pi2.ap_no as doc FROM purchase_invoice_items pii JOIN purchase_invoices pi2 ON pi2.id=pii.purchase_invoice_id WHERE pii.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'รายการ POS ' || pt.transaction_no as doc FROM pos_transaction_items pti JOIN pos_transactions pt ON pt.id=pti.transaction_id WHERE pti.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'รับสินค้า ' || gr.gr_no as doc FROM goods_receiving_items gri JOIN goods_receivings gr ON gr.id=gri.goods_receiving_id WHERE gri.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'เบิกสินค้า ' || giq.giq_no as doc FROM goods_requisition_items giqi JOIN goods_requisitions giq ON giq.id=giqi.goods_requisition_id WHERE giqi.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'โอนสินค้า ' || st.transfer_no as doc FROM stock_transfer_items sti JOIN stock_transfers st ON st.id=sti.transfer_id WHERE sti.product_id = ANY(${skippedPgIds})
      `);
      for (const row of docRows.rows as any[]) {
        if (!skippedDocMap[row.product_id]) skippedDocMap[row.product_id] = [];
        if (!skippedDocMap[row.product_id].includes(row.doc)) skippedDocMap[row.product_id].push(row.doc);
      }
    }

    let deleted = 0;
    if (canDeleteIds.length > 0) {
      await db.transaction(async (tx) => {
        const pgDelIds = sql.raw(`ARRAY[${canDeleteIds.join(',')}]::int[]`);
        // Mirror cleanup pattern from import-batch-routes.ts product case
        await tx.execute(sql`DELETE FROM stock_movements WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM product_stock WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM product_bundles WHERE bundle_product_id = ANY(${pgDelIds}) OR component_product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM ecommerce_product_mappings WHERE product_id = ANY(${pgDelIds})`);
        await tx.delete(warehouseStockLevels).where(inArray(warehouseStockLevels.productId, canDeleteIds));
        await tx.delete(productLots).where(inArray(productLots.productId, canDeleteIds));
        await tx.execute(sql`DELETE FROM demand_forecasts WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM product_bin_assignments WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM menu_items WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM promotion_rules WHERE buy_product_id = ANY(${pgDelIds}) OR get_product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM product_mappings WHERE buy_product_id = ANY(${pgDelIds}) OR sell_product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM supplier_quote_items WHERE product_id = ANY(${pgDelIds})`);
        const result = await tx.delete(products).where(and(eq(products.companyId, companyId), inArray(products.id, canDeleteIds)));
        deleted = result.rowCount || canDeleteIds.length;
      });
    }

    await logActivity({
      userId: (req.user as any).id,
      companyId,
      action: "bulk_permanent_delete_products",
      entityType: "product",
      entityId: canDeleteIds.join(","),
      entityName: `ลบสินค้าถาวร ${deleted} รายการ (ข้าม ${skippedTargets.length})`,
    });

    res.json({
      deleted,
      skipped: skippedTargets.map(t => ({
        id: t.id,
        code: t.code,
        name: t.name,
        reason: "ยังถูกอ้างอิงในเอกสาร",
        docs: skippedDocMap[t.id] || [],
      })),
    });
  } catch (err: any) {
    console.error("[bulk-permanent-delete-products] error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ==================== Delete Inactive Duplicates ====================
app.post("/api/products/delete-inactive-duplicates", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId } = req.body as { companyId: number };
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    { const ac = await checkDocOwnership(companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

    // Find inactive products whose code exists in an active product of the same company
    const duplicateRows = await db.execute(sql`
      SELECT p.id, p.code, p.name
      FROM products p
      WHERE p.company_id = ${companyId}
        AND p.active = false
        AND EXISTS (
          SELECT 1 FROM products a
          WHERE a.company_id = ${companyId}
            AND a.active = true
            AND a.code = p.code
        )
    `);
    const duplicates = duplicateRows.rows as { id: number; code: string; name: string }[];
    if (duplicates.length === 0) {
      return res.json({ found: 0, deleted: 0, skipped: [] });
    }

    const dupIds = duplicates.map(d => d.id);
    const pgIds = sql.raw(`ARRAY[${dupIds.join(',')}]::int[]`);

    // FK ref check — ไม่นับ stock_movements เพราะ initial entries ไม่ใช่เอกสาร (จะถูกลบใน cleanup)
    const usedRows = await db.execute(sql`
      SELECT DISTINCT product_id FROM (
        SELECT product_id FROM pos_transaction_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM invoice_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM quotation_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM sales_order_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM tax_invoice_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM receipt_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM purchase_order_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM purchase_invoice_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM ecommerce_order_items WHERE product_id = ANY(${pgIds})
        UNION ALL SELECT product_id FROM goods_receiving_items WHERE product_id = ANY(${pgIds})
      ) t
    `);
    const usedIds = new Set((usedRows.rows as any[]).map(r => r.product_id));
    const canDeleteIds = dupIds.filter(id => !usedIds.has(id));
    const skipped = duplicates.filter(d => usedIds.has(d.id));

    // Fetch actual document details for skipped products
    const skippedDocMap: Record<number, string[]> = {};
    if (skipped.length > 0) {
      const skippedPgIds = sql.raw(`ARRAY[${skipped.map(s => s.id).join(',')}]::int[]`);
      const docRows = await db.execute(sql`
        SELECT product_id, 'ใบเสนอราคา ' || q.quotation_no as doc FROM quotation_items qi JOIN quotations q ON q.id=qi.quotation_id WHERE qi.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบสั่งขาย ' || so.order_no as doc FROM sales_order_items soi JOIN sales_orders so ON so.id=soi.sales_order_id WHERE soi.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบแจ้งหนี้ ' || i.invoice_no as doc FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id WHERE ii.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบกำกับภาษี ' || ti.tax_invoice_no as doc FROM tax_invoice_items tii JOIN tax_invoices ti ON ti.id=tii.tax_invoice_id WHERE tii.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบเสร็จรับเงิน ' || r.receipt_no as doc FROM receipt_items ri JOIN receipts r ON r.id=ri.receipt_id WHERE ri.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบสั่งซื้อ ' || po.po_no as doc FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE poi.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'ใบแจ้งหนี้ซื้อ ' || pi2.ap_no as doc FROM purchase_invoice_items pii JOIN purchase_invoices pi2 ON pi2.id=pii.purchase_invoice_id WHERE pii.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'รายการ POS ' || pt.transaction_no as doc FROM pos_transaction_items pti JOIN pos_transactions pt ON pt.id=pti.transaction_id WHERE pti.product_id = ANY(${skippedPgIds})
        UNION ALL SELECT product_id, 'รับสินค้า ' || gr.gr_no as doc FROM goods_receiving_items gri JOIN goods_receivings gr ON gr.id=gri.goods_receiving_id WHERE gri.product_id = ANY(${skippedPgIds})
      `);
      for (const row of docRows.rows as any[]) {
        if (!skippedDocMap[row.product_id]) skippedDocMap[row.product_id] = [];
        if (!skippedDocMap[row.product_id].includes(row.doc)) skippedDocMap[row.product_id].push(row.doc);
      }
    }

    let deleted = 0;
    if (canDeleteIds.length > 0) {
      const pgDelIds = sql.raw(`ARRAY[${canDeleteIds.join(',')}]::int[]`);
      await db.transaction(async (tx) => {
        await tx.execute(sql`DELETE FROM stock_movements WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM product_stock WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM product_bundles WHERE bundle_product_id = ANY(${pgDelIds}) OR component_product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM ecommerce_product_mappings WHERE product_id = ANY(${pgDelIds})`);
        await tx.delete(warehouseStockLevels).where(inArray(warehouseStockLevels.productId, canDeleteIds));
        await tx.delete(productLots).where(inArray(productLots.productId, canDeleteIds));
        await tx.execute(sql`DELETE FROM demand_forecasts WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM product_bin_assignments WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM menu_items WHERE product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM promotion_rules WHERE buy_product_id = ANY(${pgDelIds}) OR get_product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM product_mappings WHERE buy_product_id = ANY(${pgDelIds}) OR sell_product_id = ANY(${pgDelIds})`);
        await tx.execute(sql`DELETE FROM supplier_quote_items WHERE product_id = ANY(${pgDelIds})`);
        const result = await tx.delete(products).where(and(eq(products.companyId, companyId), inArray(products.id, canDeleteIds)));
        deleted = result.rowCount || canDeleteIds.length;
      });
    }

    await logActivity({
      userId: (req.user as any).id,
      companyId,
      action: "delete_inactive_duplicates",
      entityType: "product",
      entityId: canDeleteIds.join(","),
      entityName: `ลบสินค้าซ้ำ inactive ${deleted} รายการ (ข้าม ${skipped.length})`,
    });

    // Products with FK refs: keep as inactive (already inactive), just report them back
    res.json({
      found: duplicates.length,
      deleted,
      keptInactive: skipped.map(s => ({ id: s.id, code: s.code, name: s.name, reason: "ยังถูกอ้างอิงในเอกสาร — คงไว้เป็นเลิกใช้งาน", docs: skippedDocMap[s.id] || [] })),
    });
  } catch (err: any) {
    console.error("[delete-inactive-duplicates] error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ===== Bundle Components =====
app.get("/api/products/:id/bundle-components", requireAuth, async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const components = await db.select({
      id: productBundles.id,
      bundleProductId: productBundles.bundleProductId,
      componentProductId: productBundles.componentProductId,
      qty: productBundles.qty,
      slotGroup: productBundles.slotGroup,
      isDefault: productBundles.isDefault,
      componentCode: products.code,
      componentName: products.name,
    }).from(productBundles)
      .leftJoin(products, eq(productBundles.componentProductId, products.id))
      .where(eq(productBundles.bundleProductId, productId))
      .orderBy(productBundles.id);
    res.json(components);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.put("/api/products/:id/bundle-components", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { components } = req.body;
    if (!Array.isArray(components)) return res.status(400).json({ message: "components required" });
    await db.delete(productBundles).where(eq(productBundles.bundleProductId, productId));
    for (const c of components) {
      if (!c.componentProductId) continue;
      await db.insert(productBundles).values({
        bundleProductId: productId,
        componentProductId: c.componentProductId,
        qty: String(c.qty || 1),
        slotGroup: c.slotGroup || null,
        isDefault: c.isDefault !== false,
      });
    }
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ===== BOM (Bill of Materials) =====
app.get("/api/bom", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const productId = req.query.productId ? Number(req.query.productId) : undefined;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const headers = await storage.getBomHeaders(companyId, productId);
    res.json(headers);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/bom/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const header = await storage.getBomHeader(Number(req.params.id));
    if (!header) return res.status(404).json({ message: "ไม่พบสูตรผลิต" });
    const lines = await storage.getBomLines(header.id);
    res.json({ ...header, lines });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/bom", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { lines, ...headerData } = req.body;
    if (!headerData.companyId || !headerData.productId || !headerData.name) {
      return res.status(400).json({ message: "companyId, productId, name required" });
    }
    const header = await storage.createBomHeader(headerData);
    const savedLines = lines?.length ? await storage.setBomLines(header.id, lines) : [];
    // Auto-recalculate BOM component stock
    try { await recalcBomStock(headerData.companyId || header.companyId, header.productId); } catch(e) { console.error("BOM recalc error:", e); }
    res.json({ ...header, lines: savedLines });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/bom/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { lines, ...headerData } = req.body;
    const header = await storage.updateBomHeader(Number(req.params.id), headerData);
    if (!header) return res.status(404).json({ message: "ไม่พบสูตรผลิต" });
    if (lines) await storage.setBomLines(header.id, lines);
    const savedLines = await storage.getBomLines(header.id);
    // Auto-recalculate BOM component stock
    try { await recalcBomStock(headerData.companyId || header.companyId, header.productId); } catch(e) { console.error("BOM recalc error:", e); }
    res.json({ ...header, lines: savedLines });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/bom/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    await storage.deleteBomHeader(Number(req.params.id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ===== Bundle Import =====
app.get("/api/bundles/import/template", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = ["รหัสชุด", "ชื่อชุด", "ราคาชุด", "หน่วย", "บาร์โค้ด", "รหัสสินค้าในชุด", "กลุ่มตัวเลือก", "จำนวน", "ค่าเริ่มต้น"];
  const example = [
    ["SET-BED5", "ชุดผ้าปูที่นอน 5 ฟุต", 1990, "ชุด", "", "BED-PINK", "ผ้าปู", 1, "Y"],
    ["SET-BED5", "", "", "", "", "BED-BLUE", "ผ้าปู", 1, ""],
    ["SET-BED5", "", "", "", "", "BED-FLOWER", "ผ้าปู", 1, ""],
    ["SET-BED5", "", "", "", "", "PIL-PINK", "หมอนหนุน", 2, "Y"],
    ["SET-BED5", "", "", "", "", "PIL-BLUE", "หมอนหนุน", 2, ""],
    ["SET-BED5", "", "", "", "", "BOL-PINK", "หมอนข้าง", 2, "Y"],
    ["SET-BED5", "", "", "", "", "BOL-BLUE", "หมอนข้าง", 2, ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
  ws["!cols"] = [{ wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, "Bundles");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=template_bundles.xlsx");
  res.send(buf);
});

app.post("/api/bundles/import/preview", requireAuth, requireModule("inventory"), upload.single("file"), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "กรุณาอัปโหลดไฟล์" });
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });

    const ext = path.extname(req.file.originalname).toLowerCase();
    let rows: any[] = [];
    if (ext === ".xlsx" || ext === ".xls") {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
    } else if (ext === ".csv") {
      let content = req.file.buffer.toString("utf-8");
      rows = csvParse(content, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_quotes: true, relax_column_count: true });
    } else {
      return res.status(400).json({ message: "รองรับเฉพาะ .xlsx, .xls, .csv" });
    }
    if (rows.length === 0) return res.status(400).json({ message: "ไม่พบข้อมูล" });

    const FIELD_MAP: Record<string, string[]> = {
      bundleCode: ["รหัสชุด", "bundle_code", "set_code"],
      bundleName: ["ชื่อชุด", "bundle_name", "set_name"],
      bundlePrice: ["ราคาชุด", "bundle_price", "set_price", "price"],
      unit: ["หน่วย", "unit"],
      barcode: ["บาร์โค้ด", "barcode", "bar_code", "ean", "ean13"],
      componentCode: ["รหัสสินค้าในชุด", "component_code", "item_code"],
      slotGroup: ["กลุ่มตัวเลือก", "slot_group", "group"],
      qty: ["จำนวน", "qty", "quantity"],
      isDefault: ["ค่าเริ่มต้น", "is_default", "default"],
    };

    const headers = Object.keys(rows[0]);
    const columnMapping: Record<string, string | null> = {};
    headers.forEach(h => {
      const hl = h.trim().toLowerCase();
      for (const [field, aliases] of Object.entries(FIELD_MAP)) {
        if (aliases.some(a => a.toLowerCase() === hl)) { columnMapping[h] = field; return; }
      }
      columnMapping[h] = null;
    });

    const existingProducts = await storage.getProducts(companyId);
    const productCodeMap = new Map(existingProducts.filter(p => p.active).map(p => [p.code, p]));
    const existingBundles = existingProducts.filter(p => p.active && p.productType === "bundle");
    const existingBundleCodes = new Set(existingBundles.map(p => p.code));

    interface BundleParsed {
      bundleCode: string;
      bundleName: string;
      bundlePrice: string;
      unit: string;
      barcode: string;
      components: { componentCode: string; slotGroup: string; qty: string; isDefault: boolean; productName: string; found: boolean; row: number }[];
      isExisting: boolean;
      issues: string[];
    }

    const bundleMap = new Map<string, BundleParsed>();
    let lastBundleCode = "";

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: any = {};
      for (const [header, value] of Object.entries(row)) {
        const field = columnMapping[header];
        if (field) mapped[field] = String(value).trim();
      }

      const bundleCode = mapped.bundleCode || lastBundleCode;
      if (!bundleCode) continue;
      lastBundleCode = bundleCode;

      if (!bundleMap.has(bundleCode)) {
        bundleMap.set(bundleCode, {
          bundleCode,
          bundleName: mapped.bundleName || "",
          bundlePrice: String(Number(mapped.bundlePrice) || 0),
          unit: mapped.unit || "ชุด",
          barcode: mapped.barcode || "",
          components: [],
          isExisting: existingBundleCodes.has(bundleCode),
          issues: [],
        });
      }

      const bundle = bundleMap.get(bundleCode)!;
      if (mapped.bundleName && !bundle.bundleName) bundle.bundleName = mapped.bundleName;
      if (mapped.bundlePrice && bundle.bundlePrice === "0") bundle.bundlePrice = String(Number(mapped.bundlePrice) || 0);
      if (mapped.barcode && !bundle.barcode) bundle.barcode = mapped.barcode;

      const componentCode = mapped.componentCode;
      if (!componentCode) continue;

      const componentProduct = productCodeMap.get(componentCode);
      const isDefStr = (mapped.isDefault || "").toLowerCase();
      const isDefault = ["y", "yes", "true", "1", "ใช่"].includes(isDefStr);

      bundle.components.push({
        componentCode,
        slotGroup: mapped.slotGroup || "",
        qty: String(Number(mapped.qty) || 1),
        isDefault,
        productName: componentProduct?.name || "",
        found: !!componentProduct,
        row: i + 2,
      });
    }

    const preview: any[] = [];
    for (const [, bundle] of bundleMap) {
      const issues: string[] = [];
      if (!bundle.bundleName) issues.push("ไม่มีชื่อชุด");
      if (bundle.components.length === 0) issues.push("ไม่มีสินค้าในชุด");
      const missingComponents = bundle.components.filter(c => !c.found);
      if (missingComponents.length > 0) {
        issues.push(`ไม่พบสินค้า: ${missingComponents.map(c => c.componentCode).join(", ")}`);
      }
      bundle.issues = issues;

      let status: string;
      if (issues.some(i => i.includes("ไม่พบสินค้า") || i === "ไม่มีชื่อชุด" || i === "ไม่มีสินค้าในชุด")) {
        status = "error";
      } else if (bundle.isExisting) {
        status = "update";
      } else {
        status = "ok";
      }

      preview.push({ ...bundle, status });
    }

    res.json({
      totalRows: rows.length,
      bundles: preview,
      stats: {
        ok: preview.filter(b => b.status === "ok").length,
        update: preview.filter(b => b.status === "update").length,
        error: preview.filter(b => b.status === "error").length,
        totalComponents: preview.reduce((sum, b) => sum + b.components.length, 0),
      },
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/bundles/import/execute", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, bundles } = req.body;
    if (!companyId || !Array.isArray(bundles) || bundles.length === 0) {
      return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
    }

    const existingProducts = await storage.getProducts(companyId);
    const productCodeMap = new Map(existingProducts.filter(p => p.active).map(p => [p.code, p]));

    let createdCount = 0;
    let updatedCount = 0;
    let componentCount = 0;
    const existingBarcodes = new Set(existingProducts.filter(p => p.barcode).map(p => p.barcode));

    for (const bundle of bundles) {
      const { bundleCode, bundleName, bundlePrice, unit, components, barcode: userBarcode } = bundle;
      if (!bundleCode || !bundleName || !components || components.length === 0) continue;

      const validComponents = components.filter((c: any) => {
        const prod = productCodeMap.get(c.componentCode);
        return !!prod;
      });
      if (validComponents.length === 0) continue;

      let existingProduct = productCodeMap.get(bundleCode);

      if (existingProduct) {
        await storage.updateProduct(existingProduct.id, {
          name: bundleName,
          price: String(Number(bundlePrice) || 0),
          unit: unit || "ชุด",
          productType: "bundle",
        });

        await db.delete(productBundles).where(eq(productBundles.bundleProductId, existingProduct.id));

        for (const comp of validComponents) {
          const compProd = productCodeMap.get(comp.componentCode)!;
          await db.insert(productBundles).values({
            bundleProductId: existingProduct.id,
            componentProductId: compProd.id,
            qty: String(Number(comp.qty) || 1),
            slotGroup: comp.slotGroup || null,
            isDefault: !!comp.isDefault,
          });
          componentCount++;
        }
        updatedCount++;
      } else {
        const created = await storage.createProduct({
          companyId,
          code: bundleCode,
          name: bundleName,
          price: String(Number(bundlePrice) || 0),
          unit: unit || "ชุด",
          category: "product",
          productType: "bundle",
        } as any);

        let barcode: string;
        if (userBarcode && !existingBarcodes.has(userBarcode)) {
          barcode = userBarcode;
        } else {
          do {
            const num = Math.floor(Math.random() * 999999999999).toString().padStart(12, '0');
            let sum = 0;
            for (let i = 0; i < 12; i++) { sum += parseInt(num[i]) * (i % 2 === 0 ? 1 : 3); }
            const checkDigit = (10 - (sum % 10)) % 10;
            barcode = num + checkDigit;
          } while (existingBarcodes.has(barcode));
        }
        existingBarcodes.add(barcode);
        await storage.updateProduct(created.id, { barcode });

        productCodeMap.set(bundleCode, created);

        for (const comp of validComponents) {
          const compProd = productCodeMap.get(comp.componentCode)!;
          await db.insert(productBundles).values({
            bundleProductId: created.id,
            componentProductId: compProd.id,
            qty: String(Number(comp.qty) || 1),
            slotGroup: comp.slotGroup || null,
            isDefault: !!comp.isDefault,
          });
          componentCount++;
        }
        createdCount++;
      }
    }

    res.json({ created: createdCount, updated: updatedCount, components: componentCount });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ===== Product Bundles =====
app.get("/api/product-bundles/:productId", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const bundles = await storage.getProductBundles(Number(req.params.productId));
    if (req.query.enriched === "1") {
      const productIds = [...new Set(bundles.map(b => b.componentProductId))];
      const prods = productIds.length > 0
        ? await db.select().from(products).where(sql`${products.id} IN (${sql.join(productIds.map(id => sql`${id}`), sql`,`)})`)
        : [];
      const prodMap = new Map(prods.map(p => [p.id, p]));
      const enriched = bundles.map(b => {
        const p = prodMap.get(b.componentProductId);
        return { ...b, productName: p?.name || "", productCode: p?.code || "", productPrice: p?.price || "0", productImage: p?.image || null };
      });
      return res.json(enriched);
    }
    res.json(bundles);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.put("/api/product-bundles/:productId", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const items = req.body.items || [];
    const saved = await storage.setProductBundles(productId, items);
    if (items.length > 0) {
      await storage.updateProduct(productId, { productType: "bundle" });
    }
    const prod = await storage.getProduct(productId);
    if (prod) {
      try { await recalcBundleStock(prod.companyId, prod.id); } catch(e) { console.error("Bundle recalc error:", e); }
    }
    res.json(saved);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ===== Promotions =====
app.get("/api/promotions", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const promos = await storage.getPromotions(companyId);
    res.json(promos);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/promotions/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const promo = await storage.getPromotion(Number(req.params.id));
    if (!promo) return res.status(404).json({ message: "ไม่พบโปรโมชั่น" });
    const rules = await storage.getPromotionRules(promo.id);
    res.json({ ...promo, rules });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/promotions", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { rules, ...promoData } = req.body;
    if (!promoData.companyId || !promoData.name || !promoData.type) {
      return res.status(400).json({ message: "companyId, name, type required" });
    }
    const promo = await storage.createPromotion(promoData);
    const savedRules = rules?.length ? await storage.setPromotionRules(promo.id, rules) : [];
    res.json({ ...promo, rules: savedRules });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/promotions/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { rules, ...promoData } = req.body;
    const promo = await storage.updatePromotion(Number(req.params.id), promoData);
    if (!promo) return res.status(404).json({ message: "ไม่พบโปรโมชั่น" });
    if (rules) await storage.setPromotionRules(promo.id, rules);
    const savedRules = await storage.getPromotionRules(promo.id);
    res.json({ ...promo, rules: savedRules });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/promotions/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    await storage.deletePromotion(Number(req.params.id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ===== Product Mappings (ซื้อชื่อหนึ่ง ขายอีกชื่อ) =====
app.get("/api/product-mappings", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const sellProductId = req.query.sellProductId ? Number(req.query.sellProductId) : undefined;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const mappings = await storage.getProductMappings(companyId, sellProductId);
    res.json(mappings);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/product-mappings", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const data = req.body;
    if (!data.companyId || !data.sellProductId || !data.buyProductId) {
      return res.status(400).json({ message: "companyId, sellProductId, buyProductId required" });
    }
    const mapping = await storage.createProductMapping(data);
    // Auto-recalculate mapping stock
    try { await recalcMappingStock(data.companyId || mapping.companyId); } catch(e) { console.error("Mapping recalc error:", e); }
    res.json(mapping);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/product-mappings/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const mapping = await storage.updateProductMapping(Number(req.params.id), req.body);
    if (!mapping) return res.status(404).json({ message: "ไม่พบ mapping" });
    // Auto-recalculate mapping stock
    try { await recalcMappingStock(req.body.companyId || mapping.companyId); } catch(e) { console.error("Mapping recalc error:", e); }
    res.json(mapping);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/product-mappings/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    await storage.deleteProductMapping(Number(req.params.id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});


app.post("/api/inventory/recalculate", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.body.companyId);
    const type = req.body.type as string; // "bundle" | "bom" | "mapping" | "all"
    const productId = req.body.productId ? Number(req.body.productId) : undefined;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    
    let result;
    if (type === "bundle") {
      result = await recalcBundleStock(companyId, productId);
    } else if (type === "bom") {
      result = await recalcBomStock(companyId, productId);
    } else if (type === "mapping") {
      result = await recalcMappingStock(companyId);
    } else {
      result = await recalcAllStock(companyId);
    }
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/inventory/update-cost-journals", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const logs = await updateCostJournalEntries(companyId);
    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});
// ===== Product Stock & Movements =====
app.get("/api/product-stock", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const productId = req.query.productId ? Number(req.query.productId) : undefined;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const stock = await storage.getProductStock(companyId, productId);
    res.json(stock);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/product-stock/adjust", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, productId, quantity, movementType, notes, referenceType, referenceId, warehouseId } = req.body;
    if (!companyId || !productId || !quantity || !movementType) {
      return res.status(400).json({ message: "companyId, productId, quantity, movementType required" });
    }
    const result = await storage.adjustStock(companyId, productId, quantity, movementType, notes, referenceType, referenceId);
    if (warehouseId) {
      await upsertWarehouseStockLevel(companyId, productId, Number(warehouseId), Number(quantity));
    }
    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/product-stock/sell", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, sellProductId, sellQty, notes } = req.body;
    if (!companyId || !sellProductId || !sellQty) {
      return res.status(400).json({ message: "companyId, sellProductId, sellQty required" });
    }
    const mappings = await storage.getMappingsForSellProduct(sellProductId);
    const results: any[] = [];
    await db.transaction(async (tx) => {
      if (mappings.length > 0) {
        for (const mapping of mappings) {
          const deductQty = String(-(Number(sellQty) * Number(mapping.conversionRate)));
          const stock = await storage.adjustStock(
            companyId, mapping.buyProductId, deductQty, "sale_deduct",
            `ขาย ${sellQty} ${mapping.sellUnit} → ตัดสต๊อก ${Math.abs(Number(deductQty))} ${mapping.buyUnit}`,
          );
          results.push({ buyProductId: mapping.buyProductId, deducted: deductQty, stock });
        }
      } else {
        const deductQty = String(-Number(sellQty));
        const stock = await storage.adjustStock(companyId, sellProductId, deductQty, "sale_deduct", notes || "ขายสินค้า (ตัดสต๊อกตรง)");
        results.push({ buyProductId: sellProductId, deducted: deductQty, stock });
      }
    });
    res.json({ success: true, deductions: results });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/stock-movements", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const productId = req.query.productId ? Number(req.query.productId) : undefined;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const { page, pageSize, offset } = parsePagination(req, { pageSize: 50 });
    const conditions: any[] = [eq(stockMovements.companyId, companyId)];
    if (productId) conditions.push(eq(stockMovements.productId, productId));
    const whereClause = and(...conditions);
    const [{ total }] = await db.select({ total: count() }).from(stockMovements).where(whereClause);
    const movements = await db.select().from(stockMovements).where(whereClause).orderBy(desc(stockMovements.createdAt)).limit(pageSize).offset(offset);
    if (req.query.page) {
      res.json(paginatedResponse(movements, Number(total), { page, pageSize, offset }));
    } else {
      res.json(movements);
    }
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/inventory-reports/stock-card", requireAuth, requireAnyModule("inventory", "accounting"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const productId = Number(req.query.productId);
    if (!companyId || !productId) return res.status(400).json({ message: "companyId and productId required" });
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    const method = (req.query.method as string) || company?.inventoryCostingMethod || "moving_average";
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const { getStockCardWithCost } = await import("../inventory-costing");
    const result = await getStockCardWithCost(companyId, productId, method as any, startDate, endDate);
    res.json({ method, movements: result.movements, balanceBF: result.balanceBF });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/inventory-reports/valuation", requireAuth, requireAnyModule("inventory", "accounting"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    const method = (req.query.method as string) || company?.inventoryCostingMethod || "moving_average";
    const asOfDate = req.query.asOfDate as string | undefined;
    const { getInventoryValuation } = await import("../inventory-costing");
    const result = await getInventoryValuation(companyId, method as any, asOfDate);
    const totalValue = result.reduce((sum, r) => sum + r.totalValue, 0);
    res.json({ method, asOfDate: asOfDate || new Date().toISOString().split("T")[0], items: result, totalValue });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/inventory-reports/movement-summary", requireAuth, requireAnyModule("inventory", "accounting"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    const method = (req.query.method as string) || company?.inventoryCostingMethod || "moving_average";
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const { getMovementSummary } = await import("../inventory-costing");
    const result = await getMovementSummary(companyId, method as any, startDate, endDate);
    res.json({ method, startDate, endDate, items: result });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/inventory-reports/slow-moving", requireAuth, requireAnyModule("inventory", "accounting"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const days = Number(req.query.days) || 30;
    const { getSlowMovingProducts } = await import("../inventory-costing");
    const result = await getSlowMovingProducts(companyId, days);
    res.json({ daysThreshold: days, items: result });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/product-stock/sync-from-warehouse", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const levels = await db.select({
      productId: warehouseStockLevels.productId,
      quantity: warehouseStockLevels.quantity,
    }).from(warehouseStockLevels)
      .where(eq(warehouseStockLevels.companyId, companyId));
    const totals = new Map<number, number>();
    for (const l of levels) {
      const pid = l.productId;
      totals.set(pid, (totals.get(pid) || 0) + Number(l.quantity || 0));
    }
    let synced = 0;
    for (const [pid, total] of totals) {
      await storage.upsertProductStock(companyId, pid, String(total));
      synced++;
    }
    res.json({ message: `sync สำเร็จ ${synced} รายการ`, synced });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/product-stock/bulk-adjust", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, items } = req.body;
    if (!companyId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "companyId and items[] required" });
    }
    const results: any[] = [];
    let successCount = 0;
    let errorCount = 0;
    for (const item of items) {
      try {
        const { productId, quantity, movementType, notes } = item;
        if (!productId || !quantity || !movementType) {
          errorCount++;
          results.push({ productId, error: "missing fields" });
          continue;
        }
        const result = await storage.adjustStock(companyId, productId, quantity, movementType, notes || "นำเข้าจากไฟล์");
        results.push({ productId, success: true, stock: result });
        successCount++;
      } catch (err: any) {
        errorCount++;
        results.push({ productId: item.productId, error: err.message });
      }
    }
    res.json({ successCount, errorCount, total: items.length, results });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Goods Receiving (ใบรับสินค้า) ============

app.get("/api/purchase-orders-for-gr", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const rows = await db.select().from(purchaseOrders).where(and(
      eq(purchaseOrders.companyId, companyId),
      eq(purchaseOrders.status, "approved"),
    )).orderBy(desc(purchaseOrders.createdAt));
    const result = await Promise.all(rows.map(async (po) => {
      const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
      return { ...po, items };
    }));
    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/goods-receivings", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const conditions: any[] = [eq(goodsReceivings.companyId, companyId)];
    const status = req.query.status as string;
    if (status && status !== "all") {
      conditions.push(eq(goodsReceivings.status, status));
    }
    const search = req.query.search as string;
    if (search) {
      conditions.push(
        or(
          ilike(goodsReceivings.grNo, `%${search}%`),
          ilike(goodsReceivings.vendorName, `%${search}%`)
        )
      );
    }
    const rows = await db.select().from(goodsReceivings).where(and(...conditions)).orderBy(desc(goodsReceivings.createdAt));
    const allItems = rows.length > 0
      ? await db.select({
          goodsReceivingId: goodsReceivingItems.goodsReceivingId,
          cnt: sql<number>`count(*)::int`,
          totalQty: sql<string>`COALESCE(sum(${goodsReceivingItems.quantity}), 0)`
        })
          .from(goodsReceivingItems)
          .where(inArray(goodsReceivingItems.goodsReceivingId, rows.map(r => r.id)))
          .groupBy(goodsReceivingItems.goodsReceivingId)
      : [];
    const countMap = new Map(allItems.map(i => [i.goodsReceivingId, { cnt: i.cnt, totalQty: i.totalQty }]));
    res.json(rows.map(r => {
      const info = countMap.get(r.id);
      return { ...r, itemCount: info?.cnt || 0, totalQty: info?.totalQty || "0" };
    }));
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/goods-receivings/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [gr] = await db.select().from(goodsReceivings).where(eq(goodsReceivings.id, id));
    if (!gr) return res.status(404).json({ message: "ไม่พบใบรับสินค้า" });
    const items = await db.select().from(goodsReceivingItems).where(eq(goodsReceivingItems.goodsReceivingId, id));
    res.json({ ...gr, items });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/goods-receivings", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, grDate, vendorId, vendorName, poReference, poId, notes, items } = req.body;
    if (!companyId || !grDate || !items || items.length === 0) {
      return res.status(400).json({ message: "companyId, grDate, items required" });
    }
    let validatedPoId: number | null = null;
    if (poId) {
      const [po] = await db.select().from(purchaseOrders).where(and(
        eq(purchaseOrders.id, Number(poId)),
        eq(purchaseOrders.companyId, companyId),
        eq(purchaseOrders.status, "approved"),
      ));
      if (!po) return res.status(400).json({ message: "ไม่พบ PO ที่อ้างอิง หรือ PO ยังไม่ได้อนุมัติ" });
      validatedPoId = po.id;
    }
    const totalAmount = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) * Number(it.unitCost || 0)), 0);
    const existing = await db.select({ id: goodsReceivings.id }).from(goodsReceivings).where(eq(goodsReceivings.companyId, companyId));
    const nextNum = existing.length + 1;
    const grNo = `GR-${String(nextNum).padStart(4, "0")}`;

    const [gr] = await db.insert(goodsReceivings).values({
      companyId, grNo, grDate, vendorId, vendorName, poReference, poId: validatedPoId, notes,
      totalAmount: String(totalAmount),
      status: "draft",
      createdBy: (req.user as any)?.id,
    }).returning();

    if (req.body.warehouseId) {
      await db.execute(sql`UPDATE goods_receivings SET warehouse_id = ${Number(req.body.warehouseId)} WHERE id = ${gr.id}`);
    }

    for (const item of items) {
      const [insertedItem] = await db.insert(goodsReceivingItems).values({
        goodsReceivingId: gr.id,
        productId: item.productId,
        productName: item.productName,
        productCode: item.productCode || null,
        unit: item.unit || "ชิ้น",
        quantity: String(item.quantity),
        unitCost: String(item.unitCost || 0),
        totalCost: String(Number(item.quantity) * Number(item.unitCost || 0)),
        lotNumber: item.lotNumber || null,
        manufacturingDate: item.manufacturingDate || null,
        expiryDate: item.expiryDate || null,
      }).returning();
      if (req.body.warehouseId) {
        await db.execute(sql`UPDATE goods_receiving_items SET warehouse_id = ${Number(req.body.warehouseId)} WHERE id = ${insertedItem.id}`);
      }
    }

    const savedItems = await db.select().from(goodsReceivingItems).where(eq(goodsReceivingItems.goodsReceivingId, gr.id));
    res.status(201).json({ ...gr, items: savedItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/goods-receivings/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { grDate, vendorId, vendorName, poReference, poId, notes, items } = req.body;

    const [existing] = await db.select().from(goodsReceivings).where(eq(goodsReceivings.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบรับสินค้า" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    if (existing.status === "approved") return res.status(400).json({ message: "ไม่สามารถแก้ไขใบรับที่อนุมัติแล้ว" });

    let validatedPoId = existing.poId;
    if (poId !== undefined) {
      if (poId) {
        const [po] = await db.select().from(purchaseOrders).where(and(
          eq(purchaseOrders.id, Number(poId)),
          eq(purchaseOrders.companyId, existing.companyId),
          eq(purchaseOrders.status, "approved"),
        ));
        if (!po) return res.status(400).json({ message: "ไม่พบ PO ที่อ้างอิง หรือ PO ยังไม่ได้อนุมัติ" });
        validatedPoId = po.id;
      } else {
        validatedPoId = null;
      }
    }

    const totalAmount = items ? items.reduce((sum: number, it: any) => sum + (Number(it.quantity) * Number(it.unitCost || 0)), 0) : existing.totalAmount;
    const warehouseId = req.body.warehouseId ? Number(req.body.warehouseId) : null;

    const [gr] = await db.update(goodsReceivings).set({
      grDate: grDate || existing.grDate, vendorId, vendorName, poReference, poId: validatedPoId, notes,
      totalAmount: String(totalAmount),
    }).where(eq(goodsReceivings.id, id)).returning();

    if (warehouseId) {
      await db.execute(sql`UPDATE goods_receivings SET warehouse_id = ${warehouseId} WHERE id = ${id}`);
    }

    if (items && items.length > 0) {
      await db.delete(goodsReceivingItems).where(eq(goodsReceivingItems.goodsReceivingId, id));
      for (const item of items) {
        const [insertedItem] = await db.insert(goodsReceivingItems).values({
          goodsReceivingId: id,
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode || null,
          unit: item.unit || "ชิ้น",
          quantity: String(item.quantity),
          unitCost: String(item.unitCost || 0),
          totalCost: String(Number(item.quantity) * Number(item.unitCost || 0)),
          lotNumber: item.lotNumber || null,
          manufacturingDate: item.manufacturingDate || null,
          expiryDate: item.expiryDate || null,
        }).returning();
        if (warehouseId) {
          await db.execute(sql`UPDATE goods_receiving_items SET warehouse_id = ${warehouseId} WHERE id = ${insertedItem.id}`);
        }
      }
    }

    const savedItems = await db.select().from(goodsReceivingItems).where(eq(goodsReceivingItems.goodsReceivingId, id));
    res.json({ ...gr, items: savedItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/goods-receivings/:id/approve", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [gr] = await db.select().from(goodsReceivings).where(eq(goodsReceivings.id, id));
    if (!gr) return res.status(404).json({ message: "ไม่พบใบรับสินค้า" });
    if (gr.status === "approved") return res.status(400).json({ message: "อนุมัติแล้ว" });

    const items = await db.select().from(goodsReceivingItems).where(eq(goodsReceivingItems.goodsReceivingId, id));
    if (items.length === 0) return res.status(400).json({ message: "ไม่มีรายการสินค้า" });

    const [grCompany] = await db.select({ stockEntrySource: companies.stockEntrySource }).from(companies).where(eq(companies.id, gr.companyId));
    const grWarehouseRaw = await db.execute(sql`SELECT warehouse_id FROM goods_receivings WHERE id = ${id}`);
    const grWarehouseId: number | null = (grWarehouseRaw as any).rows?.[0]?.warehouse_id ?? null;

    if (grCompany?.stockEntrySource !== "purchase_invoice") {
      const grTriggers = await getInventoryTriggers(gr.companyId);
      for (const item of items) {
        const uc = String(item.unitCost || "0");
        const tc = String(Number(item.quantity) * Number(item.unitCost || 0));
        let lotId: number | null = null;

        if (item.lotNumber) {
          const [existingLot] = await db.select().from(productLots).where(and(
            eq(productLots.companyId, gr.companyId),
            eq(productLots.productId, item.productId),
            eq(productLots.lotNumber, item.lotNumber)
          ));
          if (existingLot) {
            await db.update(productLots).set({
              quantity: String(Number(existingLot.quantity) + Number(item.quantity)),
              unitCost: uc,
            }).where(eq(productLots.id, existingLot.id));
            lotId = existingLot.id;
          } else {
            const [newLot] = await db.insert(productLots).values({
              companyId: gr.companyId,
              productId: item.productId,
              lotNumber: item.lotNumber,
              manufacturingDate: item.manufacturingDate || null,
              expiryDate: item.expiryDate || null,
              quantity: String(item.quantity),
              unitCost: uc,
              grId: gr.id,
            }).returning();
            lotId = newLot.id;
          }
          await db.update(goodsReceivingItems).set({ lotId }).where(eq(goodsReceivingItems.id, item.id));
        }

        await storage.adjustStock(
          gr.companyId, item.productId, String(item.quantity), "receive",
          `รับสินค้าจาก ${gr.grNo}${gr.vendorName ? ` (${gr.vendorName})` : ""}`,
          "goods_receiving", gr.id,
          { unitCost: uc, totalCost: tc, referenceNo: gr.grNo, createdBy: (req.user as any)?.id }
        );

        if (lotId) {
          await db.update(stockMovements).set({ lotId }).where(and(
            eq(stockMovements.referenceType, "goods_receiving"),
            eq(stockMovements.referenceId, gr.id),
            eq(stockMovements.productId, item.productId),
          ));
        }

        if (grWarehouseId && item.productId && grTriggers.gr_approve) {
          await upsertWarehouseStockLevel(gr.companyId, item.productId, grWarehouseId, Number(item.quantity));
        }
      }
    }

    const [updated] = await db.update(goodsReceivings).set({ status: "approved" }).where(eq(goodsReceivings.id, id)).returning();
    const finalItems = await db.select().from(goodsReceivingItems).where(eq(goodsReceivingItems.goodsReceivingId, id));
    res.json({ ...updated, items: finalItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/goods-receivings/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [gr] = await db.select().from(goodsReceivings).where(eq(goodsReceivings.id, id));
    if (!gr) return res.status(404).json({ message: "ไม่พบใบรับสินค้า" });
    if (gr.status === "approved") return res.status(400).json({ message: "ไม่สามารถลบใบรับที่อนุมัติแล้ว" });
    await db.transaction(async (tx) => {
      await deleteStockMovementsForDoc(tx, "goods_receiving", id);
      await tx.delete(goodsReceivingItems).where(eq(goodsReceivingItems.goodsReceivingId, id));
      await tx.delete(goodsReceivings).where(eq(goodsReceivings.id, id));
    });
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Product Lots (ล็อตการผลิต) ============

app.get("/api/product-lots", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const conditions: any[] = [eq(productLots.companyId, companyId)];
    const productId = req.query.productId ? Number(req.query.productId) : null;
    if (productId) conditions.push(eq(productLots.productId, productId));
    const status = req.query.status as string;
    if (status && status !== "all") conditions.push(eq(productLots.status, status));
    const rows = await db.select().from(productLots).where(and(...conditions)).orderBy(desc(productLots.createdAt));
    const productIds = [...new Set(rows.map(r => r.productId))];
    const prods = productIds.length > 0
      ? await db.select({ id: products.id, name: products.name, code: products.code, unit: products.unit }).from(products).where(inArray(products.id, productIds))
      : [];
    const prodMap = new Map(prods.map(p => [p.id, p]));
    res.json(rows.map(r => ({ ...r, productName: prodMap.get(r.productId)?.name || "", productCode: prodMap.get(r.productId)?.code || "", productUnit: prodMap.get(r.productId)?.unit || "ชิ้น" })));
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/product-lots/expiring", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const daysAhead = Number(req.query.days || 30);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    const rows = await db.select().from(productLots).where(and(
      eq(productLots.companyId, companyId),
      eq(productLots.status, "active"),
      sql`${productLots.expiryDate} IS NOT NULL`,
      sql`${productLots.expiryDate} <= ${cutoffStr}`,
      sql`CAST(${productLots.quantity} AS numeric) > 0`
    )).orderBy(productLots.expiryDate);

    const productIds = [...new Set(rows.map(r => r.productId))];
    const prods = productIds.length > 0
      ? await db.select({ id: products.id, name: products.name, code: products.code, unit: products.unit }).from(products).where(inArray(products.id, productIds))
      : [];
    const prodMap = new Map(prods.map(p => [p.id, p]));

    res.json(rows.map(r => {
      const today = new Date();
      const exp = new Date(r.expiryDate!);
      const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        ...r,
        productName: prodMap.get(r.productId)?.name || "",
        productCode: prodMap.get(r.productId)?.code || "",
        productUnit: prodMap.get(r.productId)?.unit || "ชิ้น",
        daysUntilExpiry: daysLeft,
        expiryLevel: daysLeft <= 0 ? "expired" : daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "ok",
      };
    }));
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/product-lots", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, productId, lotNumber, manufacturingDate, expiryDate, quantity, unitCost, notes } = req.body;
    if (!companyId || !productId || !lotNumber) return res.status(400).json({ message: "companyId, productId, lotNumber required" });
    const existing = await db.select().from(productLots).where(and(
      eq(productLots.companyId, companyId),
      eq(productLots.productId, productId),
      eq(productLots.lotNumber, lotNumber)
    ));
    if (existing.length > 0) return res.status(400).json({ message: `ล็อต ${lotNumber} ซ้ำสำหรับสินค้านี้` });
    const [lot] = await db.insert(productLots).values({
      companyId, productId, lotNumber,
      manufacturingDate: manufacturingDate || null,
      expiryDate: expiryDate || null,
      quantity: String(quantity || 0),
      unitCost: String(unitCost || 0),
      notes,
    }).returning();
    res.status(201).json(lot);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/product-lots/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = Number(req.query.companyId || req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [lot] = await db.select().from(productLots).where(and(eq(productLots.id, id), eq(productLots.companyId, companyId)));
    if (!lot) return res.status(404).json({ message: "ไม่พบล็อต" });
    const updates: any = {};
    if (req.body.lotNumber !== undefined) updates.lotNumber = req.body.lotNumber;
    if (req.body.manufacturingDate !== undefined) updates.manufacturingDate = req.body.manufacturingDate || null;
    if (req.body.expiryDate !== undefined) updates.expiryDate = req.body.expiryDate || null;
    if (req.body.unitCost !== undefined) updates.unitCost = String(req.body.unitCost);
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.status !== undefined) updates.status = req.body.status;
    const [updated] = await db.update(productLots).set(updates).where(eq(productLots.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/product-lots/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [lot] = await db.select().from(productLots).where(and(eq(productLots.id, id), eq(productLots.companyId, companyId)));
    if (!lot) return res.status(404).json({ message: "ไม่พบล็อต" });
    if (Number(lot.quantity) > 0) return res.status(400).json({ message: "ไม่สามารถลบล็อตที่ยังมีสต็อกอยู่" });
    await db.delete(productLots).where(eq(productLots.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

// ============ Goods Requisition (ใบเบิกสินค้า) ============

app.get("/api/goods-requisitions", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const conditions: any[] = [eq(goodsRequisitions.companyId, companyId)];
    const status = req.query.status as string;
    if (status && status !== "all") {
      conditions.push(eq(goodsRequisitions.status, status));
    }
    const search = req.query.search as string;
    if (search) {
      conditions.push(
        or(
          ilike(goodsRequisitions.giqNo, `%${search}%`),
          ilike(goodsRequisitions.departmentName, `%${search}%`),
          ilike(goodsRequisitions.requestedBy, `%${search}%`)
        )
      );
    }
    const rows = await db.select().from(goodsRequisitions).where(and(...conditions)).orderBy(desc(goodsRequisitions.createdAt));
    res.json(rows);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/goods-requisitions/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [giq] = await db.select().from(goodsRequisitions).where(eq(goodsRequisitions.id, id));
    if (!giq) return res.status(404).json({ message: "ไม่พบใบเบิกสินค้า" });
    const items = await db.select().from(goodsRequisitionItems).where(eq(goodsRequisitionItems.goodsRequisitionId, id));
    res.json({ ...giq, items });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/goods-requisitions", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const { companyId, giqDate, departmentName, requestedBy, purpose, notes, items } = req.body;
    if (!companyId || !giqDate || !items || items.length === 0) {
      return res.status(400).json({ message: "companyId, giqDate, items required" });
    }
    const totalAmount = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) * Number(it.unitCost || 0)), 0);
    const existing = await db.select({ id: goodsRequisitions.id }).from(goodsRequisitions).where(eq(goodsRequisitions.companyId, companyId));
    const nextNum = existing.length + 1;
    const giqNo = `GIQ-${String(nextNum).padStart(4, "0")}`;

    const [giq] = await db.insert(goodsRequisitions).values({
      companyId, giqNo, giqDate, departmentName, requestedBy, purpose, notes,
      totalAmount: String(totalAmount),
      status: "draft",
      createdBy: (req.user as any)?.id,
    }).returning();

    for (const item of items) {
      await db.insert(goodsRequisitionItems).values({
        goodsRequisitionId: giq.id,
        productId: item.productId,
        productName: item.productName,
        productCode: item.productCode || null,
        unit: item.unit || "ชิ้น",
        quantity: String(item.quantity),
        unitCost: String(item.unitCost || 0),
        totalCost: String(Number(item.quantity) * Number(item.unitCost || 0)),
      });
    }

    const savedItems = await db.select().from(goodsRequisitionItems).where(eq(goodsRequisitionItems.goodsRequisitionId, giq.id));
    res.status(201).json({ ...giq, items: savedItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/goods-requisitions/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { giqDate, departmentName, requestedBy, purpose, notes, items } = req.body;

    const [existing] = await db.select().from(goodsRequisitions).where(eq(goodsRequisitions.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบใบเบิกสินค้า" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    if (existing.status === "approved") return res.status(400).json({ message: "ไม่สามารถแก้ไขใบเบิกที่อนุมัติแล้ว" });

    const totalAmount = items ? items.reduce((sum: number, it: any) => sum + (Number(it.quantity) * Number(it.unitCost || 0)), 0) : existing.totalAmount;

    const [giq] = await db.update(goodsRequisitions).set({
      giqDate: giqDate || existing.giqDate, departmentName, requestedBy, purpose, notes,
      totalAmount: String(totalAmount),
    }).where(eq(goodsRequisitions.id, id)).returning();

    if (items && items.length > 0) {
      await db.delete(goodsRequisitionItems).where(eq(goodsRequisitionItems.goodsRequisitionId, id));
      for (const item of items) {
        await db.insert(goodsRequisitionItems).values({
          goodsRequisitionId: id,
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode || null,
          unit: item.unit || "ชิ้น",
          quantity: String(item.quantity),
          unitCost: String(item.unitCost || 0),
          totalCost: String(Number(item.quantity) * Number(item.unitCost || 0)),
        });
      }
    }

    const savedItems = await db.select().from(goodsRequisitionItems).where(eq(goodsRequisitionItems.goodsRequisitionId, id));
    res.json({ ...giq, items: savedItems });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/goods-requisitions/:id/approve", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [giq] = await db.select().from(goodsRequisitions).where(eq(goodsRequisitions.id, id));
    if (!giq) return res.status(404).json({ message: "ไม่พบใบเบิกสินค้า" });
    if (giq.status === "approved") return res.status(400).json({ message: "อนุมัติแล้ว" });

    const items = await db.select().from(goodsRequisitionItems).where(eq(goodsRequisitionItems.goodsRequisitionId, id));
    if (items.length === 0) return res.status(400).json({ message: "ไม่มีรายการสินค้า" });

    const giqDeductItems = items.map(item => ({
      productId: item.productId,
      qty: Math.abs(Number(item.quantity)),
      unitPrice: String(item.unitCost || "0"),
      productName: item.productName || undefined,
    }));
    const giqDocLabel = `เบิกสินค้า ${giq.giqNo}${giq.departmentName ? ` (${giq.departmentName})` : ""}${giq.requestedBy ? ` - ${giq.requestedBy}` : ""}`;
    const giqTriggers = await getInventoryTriggers(giq.companyId);
    if (giqTriggers.goods_requisition_deduct) {
      await deductStockBundleAware(giqDeductItems, giq.companyId, giqDocLabel, "goods_requisition", giq.id, user?.id);
    }

    let journalEntryId: number | null = null;
    try {
      const totalAmt = parseFloat(String(giq.totalAmount)) || 0;
      journalEntryId = await createCOGSJournalEntry(
        giq.companyId, "goods_requisition", giq.id, giq.giqDate,
        `เบิกสินค้า ${giq.giqNo}${giq.departmentName ? ` - ${giq.departmentName}` : ""}`,
        totalAmt, user?.id
      );
    } catch (jeErr: any) { console.error("GIQ journal entry error:", jeErr.message); }

    const [updated] = await db.update(goodsRequisitions).set({
      status: "approved",
      ...(journalEntryId ? { journalEntryId } : {}),
    }).where(eq(goodsRequisitions.id, id)).returning();
    res.json({ ...updated, items, journalEntryId });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/goods-requisitions/:id/journal", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [giq] = await db.select().from(goodsRequisitions).where(eq(goodsRequisitions.id, id));
    if (!giq) return res.status(404).json({ message: "ไม่พบใบเบิกสินค้า" });
    if (giq.status !== "approved") return res.status(400).json({ message: "ต้องอนุมัติใบเบิกก่อนลงบัญชี" });
    if (giq.journalEntryId) return res.status(400).json({ message: "ลงบัญชีแล้ว" });

    const [existingJE] = await db.select().from(journalEntries).where(and(
      eq(journalEntries.companyId, giq.companyId),
      eq(journalEntries.sourceDocType, "goods_requisition"),
      eq(journalEntries.sourceDocId, giq.id),
    ));
    if (existingJE) {
      await db.update(goodsRequisitions).set({ journalEntryId: existingJE.id }).where(eq(goodsRequisitions.id, id));
      return res.json({ ...giq, journalEntryId: existingJE.id, message: "มีรายการบัญชีอยู่แล้ว" });
    }

    const totalAmt = parseFloat(String(giq.totalAmount)) || 0;
    if (totalAmt <= 0) return res.status(400).json({ message: "มูลค่ารวมต้องมากกว่า 0" });

    const companyAccounts = await storage.getAccounts(giq.companyId);
    const inventoryAcc = companyAccounts.find((a: any) => a.code === "1301000");
    const cogsAcc = companyAccounts.find((a: any) => a.code === "5101100" || a.code === "5101000");

    if (!inventoryAcc || !cogsAcc) {
      return res.status(400).json({ message: "ไม่พบบัญชี สินค้าคงเหลือ (1140) หรือ ต้นทุนขาย (5100) ในผังบัญชี กรุณาตั้งค่าผังบัญชีก่อน" });
    }

    const desc = `เบิกสินค้า ${giq.giqNo}${giq.departmentName ? ` - ${giq.departmentName}` : ""}${giq.requestedBy ? ` (${giq.requestedBy})` : ""}`;

    const result = await db.transaction(async (tx) => {
      const entryNo = await getNextJournalEntryNo(giq.companyId, "general", giq.giqDate);
      const [entry] = await tx.insert(journalEntries).values({
        companyId: giq.companyId,
        entryNo,
        entryDate: giq.giqDate,
        description: desc,
        journalBook: "general",
        sourceDocType: "goods_requisition",
        sourceDocId: giq.id,
        status: "posted",
        createdBy: user?.id,
      }).returning();

      await tx.insert(journalLines).values({
        journalEntryId: entry.id,
        accountId: cogsAcc.id,
        description: cogsAcc.nameTh || cogsAcc.name || "ต้นทุนขาย",
        debit: String(totalAmt.toFixed(2)),
        credit: "0",
      });

      await tx.insert(journalLines).values({
        journalEntryId: entry.id,
        accountId: inventoryAcc.id,
        description: inventoryAcc.nameTh || inventoryAcc.name || "สินค้าคงเหลือ",
        debit: "0",
        credit: String(totalAmt.toFixed(2)),
      });

      await tx.update(goodsRequisitions).set({ journalEntryId: entry.id }).where(eq(goodsRequisitions.id, id));
      return entry;
    });

    const items = await db.select().from(goodsRequisitionItems).where(eq(goodsRequisitionItems.goodsRequisitionId, id));
    const [updated] = await db.select().from(goodsRequisitions).where(eq(goodsRequisitions.id, id));
    res.json({ ...updated, items, journalEntryId: result.id });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/goods-requisitions/:id/cancel-journal", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [giq] = await db.select().from(goodsRequisitions).where(eq(goodsRequisitions.id, id));
    if (!giq) return res.status(404).json({ message: "ไม่พบใบเบิกสินค้า" });
    if (!giq.journalEntryId) return res.status(400).json({ message: "ยังไม่ได้ลงบัญชี" });

    await db.delete(journalLines).where(eq(journalLines.journalEntryId, giq.journalEntryId));
    await db.delete(journalEntries).where(eq(journalEntries.id, giq.journalEntryId));
    const [updated] = await db.update(goodsRequisitions).set({ journalEntryId: null }).where(eq(goodsRequisitions.id, id)).returning();
    const items = await db.select().from(goodsRequisitionItems).where(eq(goodsRequisitionItems.goodsRequisitionId, id));
    res.json({ ...updated, items });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/goods-requisitions/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [giq] = await db.select().from(goodsRequisitions).where(eq(goodsRequisitions.id, id));
    if (!giq) return res.status(404).json({ message: "ไม่พบใบเบิกสินค้า" });
    if (giq.status === "approved") return res.status(400).json({ message: "ไม่สามารถลบใบเบิกที่อนุมัติแล้ว" });
    await db.transaction(async (tx) => {
      await deleteStockMovementsForDoc(tx, "goods_requisition", id);
      await tx.delete(goodsRequisitionItems).where(eq(goodsRequisitionItems.goodsRequisitionId, id));
      await tx.delete(goodsRequisitions).where(eq(goodsRequisitions.id, id));
    });
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/inventory/warehouses", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const whList = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));
    const branchList = await db.select().from(branches).where(eq(branches.companyId, companyId));
    const branchMap: Record<number, string> = {};
    branchList.forEach(b => { if (b.warehouseId) branchMap[b.warehouseId] = b.name; });
    res.json(whList.map(w => ({ ...w, branchName: branchMap[w.id] || null })));
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/inventory/stock-transfers", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const transfers = await db.select().from(stockTransfers).where(eq(stockTransfers.companyId, companyId)).orderBy(desc(stockTransfers.createdAt));
    const whList = await db.select().from(warehouses).where(eq(warehouses.companyId, companyId));
    const whMap: Record<number, string> = {};
    whList.forEach(w => { whMap[w.id] = w.name; });
    res.json(transfers.map(t => ({ ...t, fromWarehouseName: whMap[t.fromWarehouseId] || "", toWarehouseName: whMap[t.toWarehouseId] || "" })));
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.post("/api/inventory/stock-transfers", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const schema = z.object({
      companyId: z.number().int().positive(),
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
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "ข้อมูลไม่ถูกต้อง" });
    const { items, ...transferData } = parsed.data as any;
    if (transferData.fromWarehouseId === transferData.toWarehouseId) return res.status(400).json({ message: "คลังต้นทางและปลายทางต้องไม่เหมือนกัน" });
    const user = req.user as any;
    const cnt = await db.select({ cnt: count() }).from(stockTransfers).where(eq(stockTransfers.companyId, transferData.companyId));
    const no = `TF-${String((cnt[0]?.cnt || 0) + 1).padStart(5, "0")}`;
    transferData.transferNo = no;
    transferData.createdBy = user.id;
    const [transfer] = await db.insert(stockTransfers).values(transferData).returning();
    const itemsWithId = items.map((item: any) => ({ ...item, transferId: transfer.id, quantity: String(item.quantity) }));
    await db.insert(stockTransferItems).values(itemsWithId);
    res.json({ ...transfer, items: itemsWithId });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/inventory/stock-transfers/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
    if (!transfer) return res.status(404).json({ message: "ไม่พบรายการโอนสินค้า" });
    const items = await db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));
    const whList = await db.select().from(warehouses).where(eq(warehouses.companyId, transfer.companyId));
    const whMap: Record<number, string> = {};
    whList.forEach(w => { whMap[w.id] = w.name; });
    res.json({ ...transfer, items, fromWarehouseName: whMap[transfer.fromWarehouseId] || "", toWarehouseName: whMap[transfer.toWarehouseId] || "" });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/inventory/stock-transfers/:id/approve", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
    if (!transfer) return res.status(404).json({ message: "ไม่พบรายการ" });
    if (transfer.status !== "draft") return res.status(400).json({ message: "สถานะไม่ถูกต้อง ต้องเป็น draft เท่านั้น" });
    const items = await db.select().from(stockTransferItems).where(eq(stockTransferItems.transferId, id));

    const updated = await db.transaction(async (tx) => {
      for (const item of items) {
        const [fromLevel] = await tx.select().from(warehouseStockLevels)
          .where(and(eq(warehouseStockLevels.warehouseId, transfer.fromWarehouseId), eq(warehouseStockLevels.productId, item.productId)));
        if (!fromLevel) throw new Error(`ไม่พบสต๊อกสินค้า ${item.productName} ในคลังต้นทาง`);
        const newQty = Number(fromLevel.quantity) - Number(item.quantity);
        if (newQty < 0) throw new Error(`สต๊อกไม่เพียงพอสำหรับสินค้า ${item.productName} (มี ${fromLevel.quantity} ต้องการ ${item.quantity})`);
        await tx.update(warehouseStockLevels).set({ quantity: String(newQty) }).where(eq(warehouseStockLevels.id, fromLevel.id));

        const [toLevel] = await tx.select().from(warehouseStockLevels)
          .where(and(eq(warehouseStockLevels.warehouseId, transfer.toWarehouseId), eq(warehouseStockLevels.productId, item.productId)));
        if (toLevel) {
          await tx.update(warehouseStockLevels).set({ quantity: String(Number(toLevel.quantity) + Number(item.quantity)) }).where(eq(warehouseStockLevels.id, toLevel.id));
        } else {
          await tx.insert(warehouseStockLevels).values({ warehouseId: transfer.toWarehouseId, productId: item.productId, companyId: transfer.companyId, quantity: String(item.quantity) });
        }
      }
      const [result] = await tx.update(stockTransfers).set({ status: "approved", approvedBy: user.id }).where(eq(stockTransfers.id, id)).returning();
      return result;
    });
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/inventory/stock-transfers/:id/ship", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const { lat, lng } = req.body || {};
    const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
    if (!transfer) return res.status(404).json({ message: "ไม่พบรายการ" });
    const allowedIds = user.allowedCompanyIds || [];
    if (user.role !== "superadmin" && !allowedIds.includes(transfer.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    if (transfer.status !== "approved") return res.status(400).json({ message: "ต้องอนุมัติก่อนจึงจะจัดส่งได้" });
    const updateData: any = { status: "shipped", shippedBy: user.id, shippedAt: new Date() };
    if (lat && lng) { updateData.shipGpsLat = String(lat); updateData.shipGpsLng = String(lng); }
    const [updated] = await db.update(stockTransfers).set(updateData).where(eq(stockTransfers.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/inventory/stock-transfers/:id/receive", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = req.user as any;
    const { lat, lng, signature, receiverName } = req.body || {};
    const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
    if (!transfer) return res.status(404).json({ message: "ไม่พบรายการ" });
    const allowedIds = user.allowedCompanyIds || [];
    if (user.role !== "superadmin" && !allowedIds.includes(transfer.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    if (transfer.status !== "shipped") return res.status(400).json({ message: "ต้องจัดส่งก่อนจึงจะรับของได้" });
    if (!signature) return res.status(400).json({ message: "กรุณาลงลายเซ็นรับสินค้า" });
    const updateData: any = {
      status: "delivered", receivedBy: user.id, receivedAt: new Date(),
      receiverSignature: signature, receiverName: receiverName || null,
      completedAt: new Date(),
    };
    if (lat && lng) { updateData.receiveGpsLat = String(lat); updateData.receiveGpsLng = String(lng); }
    const [updated] = await db.update(stockTransfers).set(updateData).where(eq(stockTransfers.id, id)).returning();
    res.json(updated);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/inventory/stock-transfers/:id", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [transfer] = await db.select().from(stockTransfers).where(eq(stockTransfers.id, id));
    if (!transfer) return res.status(404).json({ message: "ไม่พบรายการ" });
    if (transfer.status !== "draft") return res.status(400).json({ message: "ไม่สามารถลบรายการที่ดำเนินการแล้ว" });
    await db.delete(stockTransferItems).where(eq(stockTransferItems.transferId, id));
    await db.delete(stockTransfers).where(eq(stockTransfers.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/inventory/stock-by-warehouse", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const levels = await db.select({
      productId: warehouseStockLevels.productId,
      warehouseId: warehouseStockLevels.warehouseId,
      warehouseName: warehouses.name,
      quantity: warehouseStockLevels.quantity,
    }).from(warehouseStockLevels)
      .innerJoin(warehouses, eq(warehouses.id, warehouseStockLevels.warehouseId))
      .where(eq(warehouseStockLevels.companyId, companyId));

    const result: Record<number, { warehouseName: string; qty: number }[]> = {};
    for (const l of levels) {
      const qty = Number(l.quantity || 0);
      if (qty === 0) continue;
      if (!result[l.productId]) result[l.productId] = [];
      result[l.productId].push({ warehouseName: l.warehouseName, qty });
    }
    res.json(result);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.get("/api/inventory/warehouse-stock/:warehouseId", requireAuth, requireModule("inventory"), async (req, res) => {
  try {
    const warehouseId = Number(req.params.warehouseId);
    const levels = await db.select({
      productId: warehouseStockLevels.productId,
      quantity: warehouseStockLevels.quantity,
    }).from(warehouseStockLevels).where(eq(warehouseStockLevels.warehouseId, warehouseId));
    const stockMap: Record<number, number> = {};
    levels.forEach(l => { stockMap[l.productId] = Number(l.quantity || 0); });
    res.json(stockMap);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

}
