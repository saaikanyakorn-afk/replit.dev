import type { Express } from "express";
import { db } from "../db";
import { eq, and, desc, ilike, or, count, sql } from "drizzle-orm";
import { deliveryNotes, deliveryNoteItems, contacts, quotations, quotationItems, invoices, invoiceItems, companies } from "@shared/schema";
import { requireAuth, checkDocOwnership } from "../route-middleware";
import { getNextDocNo } from "../route-helpers";
import { parsePagination } from "./pagination";
import crypto from "crypto";

const ALLOWED_HEADER_FIELDS = [
  "companyId", "deliveryDate", "sourceType", "sourceId",
  "customerId", "customerName", "customerPhone", "customerEmail",
  "deliveryAddress", "latitude", "longitude",
  "driverName", "driverPhone", "notes", "internalNotes",
] as const;

const ALLOWED_ITEM_FIELDS = [
  "productId", "productCode", "productName", "description", "qty", "unit", "notes", "warehouseId",
] as const;

const VALID_STATUSES = ["draft", "dispatched", "delivered", "cancelled"] as const;
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["dispatched", "cancelled"],
  dispatched: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

function pickFields<T extends Record<string, any>>(obj: T, fields: readonly string[]): Partial<T> {
  const result: any = {};
  for (const key of fields) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

export function registerDeliveryNoteRoutes(app: Express) {

  app.get("/api/delivery-notes", requireAuth, async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      { const ac = await checkDocOwnership(companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

      const { pageSize: limit, offset, page } = parsePagination(req, { pageSize: 50 });
      const search = (req.query.search as string) || "";
      const statusFilter = (req.query.status as string) || "";

      const conditions = [eq(deliveryNotes.companyId, companyId)];
      if (statusFilter && VALID_STATUSES.includes(statusFilter as any)) {
        conditions.push(eq(deliveryNotes.status, statusFilter));
      }
      if (search) {
        conditions.push(or(
          ilike(deliveryNotes.deliveryNo, `%${search}%`),
          ilike(deliveryNotes.customerName, `%${search}%`),
          ilike(deliveryNotes.driverName, `%${search}%`),
        )!);
      }

      const where = and(...conditions);
      const [{ total }] = await db.select({ total: count() }).from(deliveryNotes).where(where);
      const rows = await db.select().from(deliveryNotes).where(where)
        .orderBy(desc(deliveryNotes.id)).limit(limit).offset(offset);

      res.json({ data: rows, total, page, limit });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/delivery-notes/:id", requireAuth, async (req, res) => {
    try {
      const [doc] = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, Number(req.params.id)));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบส่งของ" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const itemsResult = await db.execute(sql`SELECT *, warehouse_id AS "warehouseId" FROM delivery_note_items WHERE delivery_note_id = ${doc.id} ORDER BY id`);
      res.json({ ...doc, items: itemsResult.rows });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/delivery-notes", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      const companyId = Number(body.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      if (!body.customerName?.trim()) return res.status(400).json({ message: "กรุณาระบุชื่อลูกค้า" });
      if (!body.deliveryAddress?.trim()) return res.status(400).json({ message: "กรุณาระบุที่อยู่จัดส่ง" });
      { const ac = await checkDocOwnership(companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

      const header = pickFields(body, ALLOWED_HEADER_FIELDS);
      const itemsRaw = Array.isArray(body.items) ? body.items : [];
      const safeItems = itemsRaw.map((i: any) => pickFields(i, ALLOWED_ITEM_FIELDS)).filter((i: any) => i.productName?.trim());

      if (!safeItems.length) return res.status(400).json({ message: "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ" });

      const deliveryNo = await getNextDocNo(companyId, "DN", deliveryNotes, deliveryNotes.deliveryNo, deliveryNotes.companyId, body.deliveryDate);
      const publicToken = crypto.randomBytes(32).toString("hex");
      const user = req.user as any;

      const result = await db.transaction(async (tx) => {
        const [doc] = await tx.insert(deliveryNotes).values({
          ...header,
          companyId,
          deliveryNo,
          publicToken,
          status: "draft",
          createdBy: user.id,
          updatedBy: user.id,
        }).returning();

        if (safeItems.length) {
          const insertedItems = await tx.insert(deliveryNoteItems).values(
            safeItems.map((item: any) => {
              const { warehouseId, ...rest } = item as any;
              return { ...rest, deliveryNoteId: doc.id };
            })
          ).returning({ id: deliveryNoteItems.id });
          for (let i = 0; i < insertedItems.length; i++) {
            if ((safeItems[i] as any)?.warehouseId) {
              await tx.execute(sql`UPDATE delivery_note_items SET warehouse_id = ${Number((safeItems[i] as any).warehouseId)} WHERE id = ${insertedItems[i].id}`);
            }
          }
        }

        const savedItems = await tx.execute(sql`SELECT *, warehouse_id AS "warehouseId" FROM delivery_note_items WHERE delivery_note_id = ${doc.id} ORDER BY id`);
        return { ...doc, items: savedItems.rows };
      });

      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/delivery-notes/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบส่งของ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      if (existing.status === "delivered") return res.status(400).json({ message: "ไม่สามารถแก้ไขใบส่งของที่ส่งสำเร็จแล้ว" });

      const body = req.body;
      const header = pickFields(body, ALLOWED_HEADER_FIELDS);
      const itemsRaw = Array.isArray(body.items) ? body.items : [];
      const safeItems = itemsRaw.map((i: any) => pickFields(i, ALLOWED_ITEM_FIELDS)).filter((i: any) => i.productName?.trim());
      const user = req.user as any;

      const result = await db.transaction(async (tx) => {
        const [doc] = await tx.update(deliveryNotes).set({
          ...header,
          companyId: existing.companyId,
          updatedBy: user.id,
          updatedAt: new Date(),
        }).where(eq(deliveryNotes.id, id)).returning();

        await tx.delete(deliveryNoteItems).where(eq(deliveryNoteItems.deliveryNoteId, id));
        if (safeItems.length) {
          const insertedItems = await tx.insert(deliveryNoteItems).values(
            safeItems.map((item: any) => {
              const { warehouseId, ...rest } = item as any;
              return { ...rest, deliveryNoteId: id };
            })
          ).returning({ id: deliveryNoteItems.id });
          for (let i = 0; i < insertedItems.length; i++) {
            if ((safeItems[i] as any)?.warehouseId) {
              await tx.execute(sql`UPDATE delivery_note_items SET warehouse_id = ${Number((safeItems[i] as any).warehouseId)} WHERE id = ${insertedItems[i].id}`);
            }
          }
        }

        const savedItems = await tx.execute(sql`SELECT *, warehouse_id AS "warehouseId" FROM delivery_note_items WHERE delivery_note_id = ${id} ORDER BY id`);
        return { ...doc, items: savedItems.rows };
      });

      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/delivery-notes/:id/status", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      if (!status || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ message: "สถานะไม่ถูกต้อง" });
      }

      const [existing] = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบส่งของ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

      const allowed = VALID_TRANSITIONS[existing.status];
      if (!allowed?.includes(status)) {
        return res.status(400).json({ message: `ไม่สามารถเปลี่ยนสถานะจาก "${existing.status}" เป็น "${status}" ได้` });
      }

      const [doc] = await db.update(deliveryNotes).set({
        status,
        updatedBy: (req.user as any).id,
        updatedAt: new Date(),
      }).where(eq(deliveryNotes.id, id)).returning();

      res.json(doc);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/delivery-notes/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบใบส่งของ" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      if (existing.status === "delivered") return res.status(400).json({ message: "ไม่สามารถลบใบส่งของที่ส่งสำเร็จแล้ว" });

      await db.transaction(async (tx) => {
        await tx.delete(deliveryNoteItems).where(eq(deliveryNoteItems.deliveryNoteId, id));
        await tx.delete(deliveryNotes).where(eq(deliveryNotes.id, id));
      });
      res.json({ message: "ลบสำเร็จ" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/delivery-notes/source/:type/:sourceId", requireAuth, async (req, res) => {
    try {
      const { type, sourceId } = req.params;
      const sid = Number(sourceId);
      if (!sid) return res.status(400).json({ message: "กรุณาระบุเอกสารต้นทาง" });

      if (type === "quotation") {
        const [doc] = await db.select().from(quotations).where(eq(quotations.id, sid));
        if (!doc) return res.status(404).json({ message: "ไม่พบใบเสนอราคา" });
        { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
        const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, sid));
        let contact = null;
        if (doc.customerId) {
          const [c] = await db.select().from(contacts).where(eq(contacts.id, doc.customerId));
          contact = c;
        }
        res.json({
          customerId: doc.customerId,
          customerName: doc.customerName,
          customerPhone: contact?.phone || "",
          customerEmail: contact?.email || "",
          deliveryAddress: doc.customerAddress || "",
          items: items.map(i => ({
            productId: i.productId,
            productCode: i.productCode,
            productName: i.productName,
            description: i.description,
            qty: i.qty,
            unit: i.unit,
          })),
        });
      } else if (type === "invoice") {
        const [doc] = await db.select().from(invoices).where(eq(invoices.id, sid));
        if (!doc) return res.status(404).json({ message: "ไม่พบใบแจ้งหนี้" });
        { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
        const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, sid));
        let contact = null;
        if (doc.customerId) {
          const [c] = await db.select().from(contacts).where(eq(contacts.id, doc.customerId));
          contact = c;
        }
        res.json({
          customerId: doc.customerId,
          customerName: doc.customerName,
          customerPhone: contact?.phone || "",
          customerEmail: contact?.email || "",
          deliveryAddress: doc.customerAddress || "",
          items: items.map(i => ({
            productId: i.productId,
            productCode: i.productCode,
            productName: i.productName,
            description: i.description,
            qty: i.qty,
            unit: i.unit,
          })),
        });
      } else {
        return res.status(400).json({ message: "ประเภทเอกสารไม่ถูกต้อง" });
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/public/delivery/:token", async (req, res) => {
    try {
      const token = req.params.token;
      if (!token || token.length < 32) return res.status(400).json({ message: "ลิงก์ไม่ถูกต้อง" });

      const [doc] = await db.select().from(deliveryNotes)
        .where(eq(deliveryNotes.publicToken, token));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบส่งของ" });

      const items = await db.select().from(deliveryNoteItems)
        .where(eq(deliveryNoteItems.deliveryNoteId, doc.id));

      const [company] = await db.select({
        name: companies.name,
        phone: companies.phone,
      }).from(companies).where(eq(companies.id, doc.companyId));

      res.json({
        id: doc.id,
        deliveryNo: doc.deliveryNo,
        deliveryDate: doc.deliveryDate,
        customerName: doc.customerName,
        deliveryAddress: doc.deliveryAddress,
        latitude: doc.latitude,
        longitude: doc.longitude,
        driverName: doc.driverName,
        status: doc.status,
        notes: doc.notes,
        items,
        companyName: company?.name || "",
        companyPhone: company?.phone || "",
        signatureDataUrl: doc.signatureDataUrl,
        signedByName: doc.signedByName,
        signedAt: doc.signedAt,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/public/delivery/:token/sign", async (req, res) => {
    try {
      const token = req.params.token;
      if (!token || token.length < 32) return res.status(400).json({ message: "ลิงก์ไม่ถูกต้อง" });

      const [doc] = await db.select().from(deliveryNotes)
        .where(eq(deliveryNotes.publicToken, token));
      if (!doc) return res.status(404).json({ message: "ไม่พบใบส่งของ" });
      if (doc.status === "delivered") return res.status(400).json({ message: "ใบส่งของนี้ถูกเซ็นรับแล้ว" });

      const { signatureDataUrl, signedByName, deliveryRemarks, deliveryGpsLat, deliveryGpsLng } = req.body;
      if (!signatureDataUrl || typeof signatureDataUrl !== "string") {
        return res.status(400).json({ message: "กรุณาเซ็นชื่อรับของ" });
      }
      if (!signatureDataUrl.startsWith("data:image/")) {
        return res.status(400).json({ message: "รูปแบบลายเซ็นไม่ถูกต้อง" });
      }

      const [updated] = await db.update(deliveryNotes).set({
        signatureDataUrl,
        signedByName: typeof signedByName === "string" ? signedByName.slice(0, 200) : "",
        signedAt: new Date(),
        deliveryRemarks: typeof deliveryRemarks === "string" ? deliveryRemarks.slice(0, 500) : null,
        deliveryGpsLat: deliveryGpsLat != null ? String(deliveryGpsLat).slice(0, 15) : null,
        deliveryGpsLng: deliveryGpsLng != null ? String(deliveryGpsLng).slice(0, 15) : null,
        status: "delivered",
        updatedAt: new Date(),
      }).where(eq(deliveryNotes.id, doc.id)).returning();

      res.json({ message: "เซ็นรับของสำเร็จ", status: updated.status });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

}
