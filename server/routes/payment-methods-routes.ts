import type { Express, Request, Response } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { paymentMethods, accounts, companies } from "@shared/schema";
import { requireAuth, checkDocOwnership } from "../route-middleware";
import { runBankInfoToPaymentMethodsMigration } from "@shared/schema-extra";

export function registerPaymentMethodsRoutes(app: Express) {

runBankInfoToPaymentMethodsMigration(db);

// ─────────────────────────────────────────────────────────────────────
// Default payment method seed data (ข้อมูลตัวอย่าง — ใช้งานได้จริง แก้ไขได้เอง)
// เรียงลำดับ: Cash, Bank Transfer, Cheque, Credit Card, PromptPay, E-Wallet
// ─────────────────────────────────────────────────────────────────────
const DEFAULT_PM_TEMPLATES = [
  { name: "Cash",        nameTh: "เงินสด",                     codePrefixes: ["1001","1100","1101","1010","110"], sortOrder: 10, isDefault: true  },
  { name: "Bank Transfer", nameTh: "โอนเงิน/เงินฝากธนาคาร",   codePrefixes: ["1011","1102","1110","1020","112"], sortOrder: 20, isDefault: false },
  { name: "Cheque",      nameTh: "เช็ครับ",                    codePrefixes: ["1021","1103","1030","1120","113"], sortOrder: 30, isDefault: false },
  { name: "Credit Card", nameTh: "บัตรเครดิต",                 codePrefixes: ["1041","1040","2100","2010","104"], sortOrder: 40, isDefault: false },
  { name: "PromptPay",   nameTh: "พร้อมเพย์",                  codePrefixes: ["1011","1102","1110","1020","112"], sortOrder: 50, isDefault: false },
  { name: "E-Wallet",    nameTh: "กระเป๋าเงินอิเล็กทรอนิกส์", codePrefixes: ["1041","1040","2100","2010","104"], sortOrder: 60, isDefault: false },
];

async function seedDefaultPaymentMethods(companyId: number) {
  try {
    // ดึง accounts ของบริษัท (เฉพาะที่ไม่ใช่ header) เพื่อหา account code จริง
    const acctResult = await db.execute(
      sql`SELECT id, code FROM accounts WHERE company_id = ${companyId} AND NOT COALESCE(is_header, false) ORDER BY code`
    );
    const companyAccounts: { id: number; code: string }[] = acctResult.rows as any[];

    function findBestAccount(prefixes: string[]) {
      for (const prefix of prefixes) {
        const found = companyAccounts.find((a) => a.code.startsWith(prefix));
        if (found) return { code: found.code, id: found.id };
      }
      return { code: prefixes[0], id: null as number | null };
    }

    const rows: Array<{
      name: string; nameTh: string; code: string; id: number | null;
      sortOrder: number; isDefault: boolean; paymentType: string;
    }> = [];

    for (const tpl of DEFAULT_PM_TEMPLATES) {
      const { code, id } = findBestAccount(tpl.codePrefixes);
      for (const paymentType of ["receive", "pay"]) {
        const sortForType = paymentType === "pay" ? tpl.sortOrder + 100 : tpl.sortOrder;
        rows.push({
          name: tpl.name,
          nameTh: tpl.nameTh,
          code,
          id,
          sortOrder: sortForType,
          isDefault: tpl.isDefault && paymentType === "receive",
          paymentType,
        });
      }
    }

    for (const r of rows) {
      await db.execute(sql`
        INSERT INTO payment_methods
          (company_id, name, name_th, account_code, account_id, active, is_default, sort_order, payment_type)
        VALUES
          (${companyId}, ${r.name}, ${r.nameTh}, ${r.code}, ${r.id}, true, ${r.isDefault}, ${r.sortOrder}, ${r.paymentType})
      `);
    }
  } catch (err: any) {
    console.error("[seedDefaultPaymentMethods] error:", err.message);
  }
}

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

app.post("/api/payment-methods/seed-defaults", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.body.companyId) || Number(req.query.companyId) || user.companyId;
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
    const ac = await checkDocOwnership(companyId, req.user);
    if (!ac.allowed) return res.status(403).json({ message: ac.message });
    const countResult = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM payment_methods WHERE company_id = ${companyId}`
    );
    const cnt = Number((countResult.rows[0] as any)?.cnt ?? 0);
    if (cnt > 0) return res.json({ seeded: false, message: "มีข้อมูลอยู่แล้ว" });
    await seedDefaultPaymentMethods(companyId);
    res.json({ seeded: true });
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
