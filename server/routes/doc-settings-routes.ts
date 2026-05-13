import type { Express, Request, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { eq } from "drizzle-orm";
import { generalSettings, documentSettings, invoices, taxInvoices, purchaseInvoices, expenses } from "@shared/schema";
import { requireAuth, requireAdmin, requireRole } from "../route-middleware";
import { getInventoryTriggers, recomputePaymentStatus, recomputeAPPaymentStatus } from "../route-helpers";
import { z } from "zod";
import { runStampUrlMigration } from "../schema-extra";
// DATA FIX DONE 2026-05-07 — runDropBotApiKeyMigration hook removed after verified. See server/schema-extra.ts history.
// DATA FIX DONE 2026-05-08 — runDefaultVatRateMigration removed after verified (default_vat_rate TEXT DEFAULT '7' on production). See shared/schema-extra.ts.

export function registerDocSettingsRoutes(app: Express) {
  runStampUrlMigration(db);
// ========== Document Settings Routes ==========

app.get("/api/settings/general", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const [row] = await db.select().from(generalSettings).where(eq(generalSettings.companyId, companyId)).limit(1);
    if (!row) {
      return res.json({
        dateFormat: "DD/MM/YYYY", calendarType: "buddhist", language: "th",
        timezone: "Asia/Bangkok", notifyOnDocApproval: true, notifyOnOverdue: true,
        autoLogoutMinutes: "60", defaultPageSize: "50", showDecimalPlaces: "2",
      });
    }
    const { id, companyId: _cid, ...settings } = row;
    return res.json(settings);
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.put("/api/settings/general", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const { dateFormat, calendarType, language, timezone, notifyOnDocApproval, notifyOnOverdue, autoLogoutMinutes, defaultPageSize, showDecimalPlaces, hiddenEmployeeModules, authorizedSignerName, authorizedSignerTitle, authorizedSignerSignatureUrl } = req.body;
    const data: any = { companyId, dateFormat, calendarType, language, timezone, notifyOnDocApproval, notifyOnOverdue, autoLogoutMinutes, defaultPageSize, showDecimalPlaces };
    if (hiddenEmployeeModules !== undefined) data.hiddenEmployeeModules = hiddenEmployeeModules;
    if (authorizedSignerName !== undefined) data.authorizedSignerName = authorizedSignerName;
    if (authorizedSignerTitle !== undefined) data.authorizedSignerTitle = authorizedSignerTitle;
    if (authorizedSignerSignatureUrl !== undefined) data.authorizedSignerSignatureUrl = authorizedSignerSignatureUrl;
    const [existing] = await db.select().from(generalSettings).where(eq(generalSettings.companyId, companyId)).limit(1);
    if (existing) {
      const { companyId: _cid, ...updateData } = data;
      await db.update(generalSettings).set(updateData).where(eq(generalSettings.companyId, companyId));
    } else {
      await db.insert(generalSettings).values(data);
    }

    return res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/settings/inventory-triggers", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const triggers = await getInventoryTriggers(companyId);
    res.json(triggers);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.put("/api/settings/inventory-triggers", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const triggers = req.body;
    const [existing] = await db.select({ id: generalSettings.id }).from(generalSettings).where(eq(generalSettings.companyId, companyId)).limit(1);
    if (existing) {
      await db.execute(
        (await import("drizzle-orm")).sql.raw(`UPDATE general_settings SET inventory_triggers = '${JSON.stringify(triggers)}'::jsonb WHERE company_id = ${companyId}`)
      );
    } else {
      await db.execute(
        (await import("drizzle-orm")).sql.raw(`INSERT INTO general_settings (company_id, inventory_triggers) VALUES (${companyId}, '${JSON.stringify(triggers)}'::jsonb)`)
      );
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.get("/api/document-settings", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const user = req.user as any;
    const company = await storage.getCompany(companyId);
    const canAccess = company && (user.role === "super_admin" || company.tenantId === user.tenantId || company.isPrimary);
    if (!canAccess) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
    }
    const settings = await storage.getDocumentSettings(companyId);
    const result = settings || {
      companyId,
      showLogo: true,
      showSignature: true,
      showTaxId: true,
      showBranch: true,
      dateFormat: "DD/MM/YYYY",
      dateEra: "CE",
    };
    if (!result.logoUrl && company?.tenantId) {
      try {
        const [wl] = await db.select({ logoUrl: whiteLabelSettings.logoUrl }).from(whiteLabelSettings).where(eq(whiteLabelSettings.tenantId, company.tenantId));
        if (wl?.logoUrl) {
          (result as any).logoUrl = wl.logoUrl;
          (result as any).logoSource = "whitelabel";
        }
      } catch {}
    }
    try {
      const sr = await db.execute((await import("drizzle-orm")).sql.raw(`SELECT stamp_url FROM document_settings WHERE company_id = ${companyId} LIMIT 1`));
      (result as any).stampUrl = (sr as any).rows?.[0]?.stamp_url || null;
    } catch {}
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/document-settings/:companyId", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const user = req.user as any;
    const company = await storage.getCompany(companyId);
    const canAccess = company && (user.role === "super_admin" || company.tenantId === user.tenantId || company.isPrimary);
    if (!canAccess) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
    }
    const settings = await storage.getDocumentSettings(companyId);
    const result = settings || {
      companyId,
      showLogo: true,
      showSignature: true,
      showTaxId: true,
      showBranch: true,
      paperSize: "A4",
      docTypeColors: null,
      colorMode: "color",
      docNumberFormat: "YMD_SEQ",
      docNumberDigits: 4,
      dateEra: "CE",
      dateFormat: "DD/MM/YYYY",
    };
    if (!result.logoUrl && company?.tenantId) {
      try {
        const [wl] = await db.select({ logoUrl: whiteLabelSettings.logoUrl }).from(whiteLabelSettings).where(eq(whiteLabelSettings.tenantId, company.tenantId));
        if (wl?.logoUrl) {
          (result as any).logoUrl = wl.logoUrl;
          (result as any).logoSource = "whitelabel";
        }
      } catch {}
    }
    try {
      const sr = await db.execute((await import("drizzle-orm")).sql.raw(`SELECT stamp_url FROM document_settings WHERE company_id = ${companyId} LIMIT 1`));
      (result as any).stampUrl = (sr as any).rows?.[0]?.stamp_url || null;
    } catch {}
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.put("/api/document-settings/:companyId", requireAuth, requireRole("admin", "super_admin", "manager"), async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const user = req.user as any;
    const company = await storage.getCompany(companyId);
    const canAccess = company && (user.role === "super_admin" || company.tenantId === user.tenantId || company.isPrimary);
    if (!canAccess) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
    }
    const docSettingsSchema = z.object({
      logoUrl: z.string().nullable().optional(),
      showLogo: z.boolean().optional(),
      showSignature: z.boolean().optional(),
      showTaxId: z.boolean().optional(),
      showBranch: z.boolean().optional(),
      showProductCode: z.boolean().optional(),
      headerNote: z.string().nullable().optional(),
      headerNoteEn: z.string().nullable().optional(),
      headerNoteZh: z.string().nullable().optional(),
      footerNote: z.string().nullable().optional(),
      footerNoteEn: z.string().nullable().optional(),
      footerNoteZh: z.string().nullable().optional(),
      paperSize: z.string().optional(),
      bankAccountName: z.string().nullable().optional(),
      bankAccountNameEn: z.string().nullable().optional(),
      bankAccountNameZh: z.string().nullable().optional(),
      bankAccountNumber: z.string().nullable().optional(),
      bankName: z.string().nullable().optional(),
      bankNameEn: z.string().nullable().optional(),
      bankNameZh: z.string().nullable().optional(),
      qrCodeUrl: z.string().nullable().optional(),
      promptpayId: z.string().nullable().optional(),
      promptpayType: z.string().nullable().optional(),
      promptpayEnabled: z.boolean().optional(),
      docTypeColors: z.string().nullable().optional(),
      colorMode: z.string().optional(),
      docNumberFormat: z.string().optional(),
      docNumberDigits: z.number().int().min(3).max(7).optional(),
      dateEra: z.string().optional(),
      dateFormat: z.string().optional(),
      documentLanguage: z.string().optional(),
      docPrefixes: z.string().nullable().optional(),
      stampUrl: z.string().nullable().optional(),
      certSignerName: z.string().nullable().optional(),
      certSignerPosition: z.string().nullable().optional(),
      docFontSize: z.string().optional(),
      showQrOnDoc: z.boolean().optional(),
      posReceiptWidth: z.string().optional(),
      posReceiptShowLogo: z.boolean().optional(),
      posReceiptShowCompanyInfo: z.boolean().optional(),
      posReceiptShowQr: z.boolean().optional(),
      posReceiptHeaderText: z.string().nullable().optional(),
      posReceiptFooterText: z.string().nullable().optional(),
      posReceiptAutoPrint: z.boolean().optional(),
      posReceiptFontSize: z.string().optional(),
      posReceiptPrefix: z.string().optional(),
      ecReceiptFontSize: z.string().optional(),
      ecReceiptShowCompanyInfo: z.boolean().optional(),
      ecReceiptShowQr: z.boolean().optional(),
      ecReceiptShowLogo: z.boolean().optional(),
      ecReceiptHeaderText: z.string().nullable().optional(),
      ecReceiptFooterText: z.string().nullable().optional(),
    });
    const validated = docSettingsSchema.parse(req.body);
    const { stampUrl, ...rest } = validated as any;
    const settings = await storage.upsertDocumentSettings(companyId, rest);
    if (stampUrl !== undefined) {
      const val = stampUrl === null ? "NULL" : `'${String(stampUrl).replace(/'/g, "''")}'`;
      await db.execute((await import("drizzle-orm")).sql.raw(`UPDATE document_settings SET stamp_url = ${val} WHERE company_id = ${companyId}`));
    }
    const stampRow = await db.execute((await import("drizzle-orm")).sql.raw(`SELECT stamp_url FROM document_settings WHERE company_id = ${companyId} LIMIT 1`));
    const stampUrlResult = (stampRow as any).rows?.[0]?.stamp_url || null;
    res.json({ ...settings, stampUrl: stampUrlResult });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง", errors: err.errors });
    }
    res.status(400).json({ message: err.message });
  }
});

// ========== Exchange Rate Settings (Platform-level BOT API Key — super_admin only) ==========

app.get("/api/settings/exchange-rate", requireAuth, requireRole("super_admin"), async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(sql.raw(`SELECT config_value FROM system_config WHERE config_key = 'BOT_API_KEY' LIMIT 1`));
    const row = (result.rows || [])[0] as any;
    const key: string | null = row?.config_value || null;
    return res.json({
      isConfigured: !!key,
      botApiKey: key || null,
    });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/settings/recompute-payment-status", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const [ivRows, tivRows, apRows, expRows] = await Promise.all([
      db.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId)),
      db.select({ id: taxInvoices.id }).from(taxInvoices).where(eq(taxInvoices.companyId, companyId)),
      db.select({ id: purchaseInvoices.id }).from(purchaseInvoices).where(eq(purchaseInvoices.companyId, companyId)),
      db.select({ id: expenses.id }).from(expenses).where(eq(expenses.companyId, companyId)),
    ]);
    let updated = 0;
    const errors: string[] = [];
    for (const r of ivRows) { try { await recomputePaymentStatus("invoice", r.id); updated++; } catch (e: any) { errors.push(`IV#${r.id}: ${e.message}`); } }
    for (const r of tivRows) { try { await recomputePaymentStatus("taxInvoice", r.id); updated++; } catch (e: any) { errors.push(`TIV#${r.id}: ${e.message}`); } }
    for (const r of apRows) { try { await recomputeAPPaymentStatus("purchaseInvoice", r.id); updated++; } catch (e: any) { errors.push(`AP#${r.id}: ${e.message}`); } }
    for (const r of expRows) { try { await recomputeAPPaymentStatus("expense", r.id); updated++; } catch (e: any) { errors.push(`EXP#${r.id}: ${e.message}`); } }
    res.json({ updated, errors });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/settings/exchange-rate", requireAuth, requireRole("super_admin"), async (req, res) => {
  try {
    const { botApiKey } = req.body;
    const keyValue = typeof botApiKey === "string" ? botApiKey.trim() : null;
    const { sql } = await import("drizzle-orm");
    if (keyValue) {
      await db.execute(sql.raw(`INSERT INTO system_config (config_key, config_value) VALUES ('BOT_API_KEY', '${keyValue.replace(/'/g, "''")}') ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`));
    } else {
      await db.execute(sql.raw(`DELETE FROM system_config WHERE config_key = 'BOT_API_KEY'`));
    }
    return res.json({ success: true, cleared: !keyValue });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

}
