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
const DEFAULT_PAYMENT_METHODS = [
  { name: "Cash", nameTh: "เงินสด", accountCode: "1001000", sortOrder: 1, isDefault: true },
  { name: "Bank Transfer", nameTh: "โอนเงิน/เงินฝากธนาคาร", accountCode: "1011000", sortOrder: 2 },
  { name: "Cheque", nameTh: "เช็ครับ", accountCode: "1021000", sortOrder: 3 },
  { name: "Credit Card", nameTh: "บัตรเครดิต", accountCode: "1041000", sortOrder: 4 },
  { name: "PromptPay", nameTh: "พร้อมเพย์", accountCode: "1011000", sortOrder: 5 },
  { name: "E-Wallet", nameTh: "กระเป๋าเงินอิเล็กทรอนิกส์", accountCode: "1041000", sortOrder: 6 },
];

app.get("/api/payment-methods", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId) || user.companyId;
    const countRows = await db.execute(sql`SELECT count(*) AS cnt FROM payment_methods WHERE company_id = ${companyId}`);
    const cnt = Number((countRows.rows[0] as any)?.cnt || 0);
    if (cnt === 0) {
      const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
      const accountMap = new Map(allAccounts.map(a => [a.code, a]));
      for (const pm of DEFAULT_PAYMENT_METHODS) {
        const acc = accountMap.get(pm.accountCode);
        await db.insert(paymentMethods).values({
          companyId,
          name: pm.name,
          nameTh: pm.nameTh,
          accountCode: pm.accountCode,
          accountId: acc?.id || null,
          active: true,
          isDefault: pm.isDefault || false,
          sortOrder: pm.sortOrder,
        });
      }
    }
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
      await db.update(paymentMethods).set({ isDefault: false }).where(eq(paymentMethods.companyId, companyId));
    }
    const [method] = await db.insert(paymentMethods).values({
      companyId,
      name,
      nameTh: nameTh || null,
      accountCode,
      accountId: accountId ? Number(accountId) : null,
      active: active !== false,
      isDefault: isDefault || false,
      sortOrder: sortOrder || 0,
    }).returning();
    if (!method?.id) return res.status(500).json({ message: "บันทึกไม่สำเร็จ กรุณาลองใหม่" });
    const pmType = paymentType || "receive";
    await db.execute(sql`UPDATE payment_methods SET bank_name = ${bankName || null}, bank_account_no = ${bankAccountNo || null}, payment_type = ${pmType} WHERE id = ${method.id}`);
    const finalRow = await db.execute(sql`SELECT *, name_th AS "nameTh", account_code AS "accountCode", account_id AS "accountId", is_default AS "isDefault", sort_order AS "sortOrder", company_id AS "companyId", bank_name AS "bankName", bank_account_no AS "bankAccountNo", payment_type AS "paymentType" FROM payment_methods WHERE id = ${method.id} LIMIT 1`);
    res.status(201).json(finalRow.rows[0] ?? method);
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
