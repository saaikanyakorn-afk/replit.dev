import type { Express } from "express";
import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import { mesWorkOrders, mesUnits, mesProcessLogs, mesCellAssignments, mesBalanceRecords, runMesTablesMigration } from "@shared/schema-extra";
import { employees } from "@shared/schema";
import { requireAuth, requireModule } from "../route-middleware";
import multer from "multer";
import path from "path";
import fs from "fs";

const PROCESS_LABELS: Record<number, string> = {
  1: "เริ่มงาน / วางเคส",
  2: "ใส่เซลล์แบต",
  3: "ต่อบัสบา + สายไฟ + หน้าจอ",
  4: "ต่อ BMS",
  5: "Balance Cell",
  6: "ปิดฝา + ติดสติ๊กเกอร์",
  7: "QC ด้านนอก",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), "uploads", "mes");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function registerMesRoutes(app: Express) {
  runMesTablesMigration(db);

  // ── Work Orders ──────────────────────────────────────────────────────────────

  app.get("/api/mes/work-orders", requireAuth, requireModule("manufacturing"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const rows = await db.select().from(mesWorkOrders)
        .where(eq(mesWorkOrders.companyId, companyId))
        .orderBy(desc(mesWorkOrders.createdAt));
      const woIds = rows.map(r => r.id);
      let unitCounts: Record<number, { total: number; completed: number }> = {};
      if (woIds.length > 0) {
        const units = await db.select().from(mesUnits)
          .where(sql`work_order_id = ANY(ARRAY[${sql.raw(woIds.join(","))}]::int[])`);
        for (const u of units) {
          if (!unitCounts[u.workOrderId]) unitCounts[u.workOrderId] = { total: 0, completed: 0 };
          unitCounts[u.workOrderId].total++;
          if (u.status === "completed") unitCounts[u.workOrderId].completed++;
        }
      }
      res.json(rows.map(r => ({ ...r, unitCount: unitCounts[r.id]?.total || 0, completedCount: unitCounts[r.id]?.completed || 0 })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mes/work-orders", requireAuth, requireModule("manufacturing"), async (req, res) => {
    try {
      const companyId = Number(req.body.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const user = (req as any).user;
      const today = new Date();
      const yy = String(today.getFullYear()).slice(2);
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const [last] = await db.select({ woNo: mesWorkOrders.woNo }).from(mesWorkOrders)
        .where(and(eq(mesWorkOrders.companyId, companyId), sql`wo_no LIKE ${"WO" + yy + mm + dd + "%"}`))
        .orderBy(desc(mesWorkOrders.id)).limit(1);
      let seq = 1;
      if (last?.woNo) { const n = parseInt(last.woNo.slice(8)); if (!isNaN(n)) seq = n + 1; }
      const woNo = `WO${yy}${mm}${dd}${String(seq).padStart(4, "0")}`;
      const [wo] = await db.insert(mesWorkOrders).values({
        companyId, woNo,
        productName: req.body.productName || "",
        model: req.body.model || null,
        bomId: req.body.bomId ? Number(req.body.bomId) : null,
        quantity: Number(req.body.quantity) || 1,
        status: "draft",
        notes: req.body.notes || null,
        createdBy: user?.id || null,
        createdByName: user?.fullName || user?.username || null,
      }).returning();
      res.status(201).json(wo);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/mes/work-orders/:id", requireAuth, requireModule("manufacturing"), async (req, res) => {
    try {
      const [wo] = await db.select().from(mesWorkOrders).where(eq(mesWorkOrders.id, Number(req.params.id)));
      if (!wo) return res.status(404).json({ message: "ไม่พบใบสั่งผลิต" });
      const units = await db.select().from(mesUnits).where(eq(mesUnits.workOrderId, wo.id)).orderBy(mesUnits.unitNo);
      const unitIds = units.map(u => u.id);
      let logsMap: Record<number, any[]> = {};
      let cellsMap: Record<number, any[]> = {};
      let balanceMap: Record<number, any> = {};
      if (unitIds.length > 0) {
        const logs = await db.select().from(mesProcessLogs)
          .where(sql`unit_id = ANY(ARRAY[${sql.raw(unitIds.join(","))}]::int[])`)
          .orderBy(mesProcessLogs.loggedAt);
        for (const l of logs) { if (!logsMap[l.unitId]) logsMap[l.unitId] = []; logsMap[l.unitId].push(l); }
        const cells = await db.select().from(mesCellAssignments)
          .where(sql`unit_id = ANY(ARRAY[${sql.raw(unitIds.join(","))}]::int[])`);
        for (const c of cells) { if (!cellsMap[c.unitId]) cellsMap[c.unitId] = []; cellsMap[c.unitId].push(c); }
        const balances = await db.select().from(mesBalanceRecords)
          .where(sql`unit_id = ANY(ARRAY[${sql.raw(unitIds.join(","))}]::int[])`)
          .orderBy(desc(mesBalanceRecords.recordedAt));
        for (const b of balances) { if (!balanceMap[b.unitId]) balanceMap[b.unitId] = b; }
      }
      res.json({ ...wo, units: units.map(u => ({ ...u, logs: logsMap[u.id] || [], cells: cellsMap[u.id] || [], balance: balanceMap[u.id] || null })) });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/mes/work-orders/:id/start", requireAuth, requireModule("manufacturing"), async (req, res) => {
    try {
      const woId = Number(req.params.id);
      const [wo] = await db.select().from(mesWorkOrders).where(eq(mesWorkOrders.id, woId));
      if (!wo) return res.status(404).json({ message: "ไม่พบใบสั่งผลิต" });
      const qty = wo.quantity;
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const yy = String(today.getFullYear()).slice(2);
      const unitValues = Array.from({ length: qty }, (_, i) => ({
        companyId: wo.companyId,
        workOrderId: woId,
        unitNo: i + 1,
        masterQr: `MES-${wo.woNo}-U${String(i + 1).padStart(3, "0")}`,
        currentProcess: 0,
        status: "pending",
      }));
      await db.insert(mesUnits).values(unitValues).onConflictDoNothing();
      await db.update(mesWorkOrders).set({ status: "in_progress" }).where(eq(mesWorkOrders.id, woId));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Units ────────────────────────────────────────────────────────────────────

  app.get("/api/mes/units/by-qr/:qr", requireAuth, async (req, res) => {
    try {
      const qr = decodeURIComponent(req.params.qr);
      const [unit] = await db.select().from(mesUnits).where(eq(mesUnits.masterQr, qr));
      if (!unit) return res.status(404).json({ message: "ไม่พบ QR Code นี้ในระบบ" });
      const [wo] = await db.select().from(mesWorkOrders).where(eq(mesWorkOrders.id, unit.workOrderId));
      const logs = await db.select().from(mesProcessLogs).where(eq(mesProcessLogs.unitId, unit.id)).orderBy(mesProcessLogs.loggedAt);
      const cells = await db.select().from(mesCellAssignments).where(eq(mesCellAssignments.unitId, unit.id)).orderBy(mesCellAssignments.slotNo);
      const [balance] = await db.select().from(mesBalanceRecords).where(eq(mesBalanceRecords.unitId, unit.id)).orderBy(desc(mesBalanceRecords.recordedAt)).limit(1);
      res.json({ ...unit, workOrder: wo, logs, cells, balance: balance || null, processLabels: PROCESS_LABELS });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mes/units/:id/log-process", requireAuth, async (req, res) => {
    try {
      const unitId = Number(req.params.id);
      const { processNo, employeeQr, employeeName, notes } = req.body;
      if (!processNo) return res.status(400).json({ message: "processNo required" });
      const [unit] = await db.select().from(mesUnits).where(eq(mesUnits.id, unitId));
      if (!unit) return res.status(404).json({ message: "ไม่พบ unit" });
      await db.insert(mesProcessLogs).values({ unitId, processNo: Number(processNo), employeeQr: employeeQr || null, employeeName: employeeName || null, notes: notes || null, action: "complete" });
      const newProcess = Math.max(unit.currentProcess, Number(processNo));
      const newStatus = newProcess >= 7 ? "completed" : `p${newProcess}_done`;
      await db.update(mesUnits).set({ currentProcess: newProcess, status: newStatus }).where(eq(mesUnits.id, unitId));
      const [updated] = await db.select().from(mesUnits).where(eq(mesUnits.id, unitId));
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mes/units/:id/assign-cell", requireAuth, async (req, res) => {
    try {
      const unitId = Number(req.params.id);
      const { cellSerial, slotNo, employeeQr, employeeName } = req.body;
      if (!cellSerial) return res.status(400).json({ message: "cellSerial required" });
      const existing = await db.select().from(mesCellAssignments).where(and(eq(mesCellAssignments.unitId, unitId), eq(mesCellAssignments.cellSerial, cellSerial)));
      if (existing.length > 0) return res.status(400).json({ message: "เซลล์นี้ถูกเพิ่มไปแล้ว" });
      const [row] = await db.insert(mesCellAssignments).values({ unitId, cellSerial, slotNo: slotNo ? Number(slotNo) : null, assignedByQr: employeeQr || null, assignedByName: employeeName || null }).returning();
      res.json(row);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/mes/units/:id/cells/:cellSerial", requireAuth, async (req, res) => {
    try {
      const unitId = Number(req.params.id);
      const cellSerial = decodeURIComponent(req.params.cellSerial);
      await db.delete(mesCellAssignments).where(and(eq(mesCellAssignments.unitId, unitId), eq(mesCellAssignments.cellSerial, cellSerial)));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/mes/units/:id/balance", requireAuth, upload.single("image"), async (req, res) => {
    try {
      const unitId = Number(req.params.id);
      const { employeeQr, employeeName, beforeValues, afterValues, notes } = req.body;
      let imageUrl: string | null = null;
      if ((req as any).file) {
        imageUrl = `/api/local-file/mes/${(req as any).file.filename}`;
      }
      const [row] = await db.insert(mesBalanceRecords).values({
        unitId,
        employeeQr: employeeQr || null,
        employeeName: employeeName || null,
        beforeValues: beforeValues ? JSON.parse(beforeValues) : null,
        afterValues: afterValues ? JSON.parse(afterValues) : null,
        imageUrl,
        notes: notes || null,
      }).returning();
      res.json(row);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Employee QR Lookup ───────────────────────────────────────────────────────

  app.get("/api/mes/employee-by-qr/:qr", requireAuth, async (req, res) => {
    try {
      const qr = decodeURIComponent(req.params.qr);
      const companyId = Number(req.query.companyId);
      const conditions: any[] = [];
      if (companyId) conditions.push(eq(employees.companyId, companyId));
      conditions.push(sql`(${employees.employeeCode} = ${qr} OR ${employees.qrCode} = ${qr} OR ${employees.id}::text = ${qr})`);
      const [emp] = await db.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, employeeCode: employees.employeeCode, qrCode: (employees as any).qrCode }).from(employees).where(and(...conditions)).limit(1);
      if (!emp) return res.status(404).json({ message: "ไม่พบพนักงานจาก QR นี้" });
      res.json({ ...emp, fullName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim() });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ── Stats for MFG Dashboard ──────────────────────────────────────────────────

  app.get("/api/mes/stats", requireAuth, requireModule("manufacturing"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const [woCount] = await db.execute(sql`SELECT COUNT(*) as cnt FROM mes_work_orders WHERE company_id = ${companyId}`);
      const [inProg] = await db.execute(sql`SELECT COUNT(*) as cnt FROM mes_work_orders WHERE company_id = ${companyId} AND status = 'in_progress'`);
      const [unitTotal] = await db.execute(sql`SELECT COUNT(*) as cnt FROM mes_units u JOIN mes_work_orders w ON w.id = u.work_order_id WHERE w.company_id = ${companyId}`);
      const [unitDone] = await db.execute(sql`SELECT COUNT(*) as cnt FROM mes_units u JOIN mes_work_orders w ON w.id = u.work_order_id WHERE w.company_id = ${companyId} AND u.status = 'completed'`);
      res.json({
        workOrders: Number((woCount as any).rows?.[0]?.cnt || 0),
        inProgress: Number((inProg as any).rows?.[0]?.cnt || 0),
        totalUnits: Number((unitTotal as any).rows?.[0]?.cnt || 0),
        completedUnits: Number((unitDone as any).rows?.[0]?.cnt || 0),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });
}
