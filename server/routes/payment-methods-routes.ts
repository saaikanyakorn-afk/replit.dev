import type { Express, Request, Response } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { paymentMethods, accounts, companies } from "@shared/schema";
import { requireAuth, checkDocOwnership } from "../route-middleware";
import { runBankInfoToPaymentMethodsMigration } from "@shared/schema-extra";

export function registerPaymentMethodsRoutes(app: Express) {

runBankInfoToPaymentMethodsMigration(db);

// ========== Payment Methods ==========

app.get("/api/payment-methods", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId) || user.companyId;
    const typeFilter = req.query.type ? sql` AND payment_type = ${req.query.type}` : sql``;
    const result = await db.execute(sql`SELECT *, name_th AS "nameTh", account_code AS "accountCode", account_id AS "accountId", is_default AS "isDefault", sort_order AS "sortOrder", company_id AS "companyId", bank_name AS "bankName", bank_account_no AS "bankAccountNo", payment_type AS "paymentType" FROM payment_methods WHERE company_id = ${companyId}${typeFilter} ORDER BY sort_order`);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/payment-methods", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { name, nameTh, accountCode, accountId, active, isDefault, sortOrder, companyId: bodyCompanyId, bankName, bankAccountNo, paymentType } = req.body;
    const companyId = Number(bodyCompanyId) || Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
    if (!name || !accountCode) return res.status(400).json({ message: "กรุณาระบุชื่อและรหัสบัญชี" });
    if (isDefault) {
      await db.execute(sql`UPDATE payment_methods SET is_default = false WHERE company_id = ${companyId}`);
    }
    const pmType = (paymentType === "pay" ? "pay" : "receive");
    const inserted = await db.execute(sql`
      INSERT INTO payment_methods (company_id, name, name_th, account_code, account_id, active, is_default, sort_order, bank_name, bank_account_no, payment_type)
      VALUES (${companyId}, ${name}, ${nameTh || null}, ${accountCode}, ${accountId ? Number(accountId) : null}, ${active !== false}, ${isDefault || false}, ${sortOrder || 0}, ${bankName || null}, ${bankAccountNo || null}, ${pmType})
      RETURNING id
    `);
    const newId = (inserted.rows[0] as any)?.id;
    if (!newId) return res.status(500).json({ message: "บันทึกไม่สำเร็จ กรุณาลองใหม่" });
    const finalRow = await db.execute(sql`SELECT *, name_th AS "nameTh", account_code AS "accountCode", account_id AS "accountId", is_default AS "isDefault", sort_order AS "sortOrder", company_id AS "companyId", bank_name AS "bankName", bank_account_no AS "bankAccountNo", payment_type AS "paymentType" FROM payment_methods WHERE id = ${newId} LIMIT 1`);
    res.status(201).json(finalRow.rows[0]);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/payment-methods/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบวิธีการรับเงิน" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    if (user.role !== "super_admin" && existing.companyId) {
      const [co] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
      if (co && co.tenantId && co.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    const { name, nameTh, accountCode, accountId, active, isDefault, sortOrder, bankName, bankAccountNo, paymentType } = req.body;
    if (isDefault) {
      await db.update(paymentMethods).set({ isDefault: false }).where(eq(paymentMethods.companyId, existing.companyId!));
    }
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (nameTh !== undefined) updateData.nameTh = nameTh;
    if (accountCode !== undefined) updateData.accountCode = accountCode;
    if (accountId !== undefined) updateData.accountId = accountId ? Number(accountId) : null;
    if (active !== undefined) updateData.active = active;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (Object.keys(updateData).length > 0) {
      await db.update(paymentMethods).set(updateData).where(eq(paymentMethods.id, id));
    }
    if (bankName !== undefined || bankAccountNo !== undefined || paymentType !== undefined) {
      await db.execute(sql`UPDATE payment_methods SET bank_name = COALESCE(${bankName ?? null}, bank_name), bank_account_no = COALESCE(${bankAccountNo ?? null}, bank_account_no), payment_type = COALESCE(${paymentType ?? null}, payment_type) WHERE id = ${id}`);
    }
    const finalRow = await db.execute(sql`SELECT *, name_th AS "nameTh", account_code AS "accountCode", account_id AS "accountId", is_default AS "isDefault", sort_order AS "sortOrder", company_id AS "companyId", bank_name AS "bankName", bank_account_no AS "bankAccountNo", payment_type AS "paymentType" FROM payment_methods WHERE id = ${id} LIMIT 1`);
    res.json(finalRow.rows[0]);
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/payment-methods/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
    if (!existing) return res.status(404).json({ message: "ไม่พบวิธีการรับเงิน" });
    { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    if (user.role !== "super_admin" && existing.companyId) {
      const [co] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
      if (co && co.tenantId && co.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(400).json({ message: err.message }); }
});

}
