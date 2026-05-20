import type { Express, Request, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { eq } from "drizzle-orm";
import { generalSettings, documentSettings, invoices, taxInvoices, purchaseInvoices, expenses } from "@shared/schema";
import { requireAuth, requireAdmin, requireRole, requireModule } from "../route-middleware";
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
    const { dateFormat, calendarType, language, timezone, notifyOnDocApproval, notifyOnOverdue, autoLogoutMinutes, defaultPageSize, showDecimalPlaces, hiddenEmployeeModules, authorizedSignerName, authorizedSignerTitle, authorizedSignerSignatureUrl, lotLowStockThreshold } = req.body;
    const data: any = { companyId, dateFormat, calendarType, language, timezone, notifyOnDocApproval, notifyOnOverdue, autoLogoutMinutes, defaultPageSize, showDecimalPlaces };
    if (hiddenEmployeeModules !== undefined) data.hiddenEmployeeModules = hiddenEmployeeModules;
    if (authorizedSignerName !== undefined) data.authorizedSignerName = authorizedSignerName;
    if (authorizedSignerTitle !== undefined) data.authorizedSignerTitle = authorizedSignerTitle;
    if (authorizedSignerSignatureUrl !== undefined) data.authorizedSignerSignatureUrl = authorizedSignerSignatureUrl;
    if (lotLowStockThreshold !== undefined) data.lotLowStockThreshold = Number(lotLowStockThreshold);
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

app.get("/api/settings/inventory-triggers", requireAuth, requireModule("app-extra"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    const triggers = await getInventoryTriggers(companyId);
    res.json(triggers);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.put("/api/settings/inventory-triggers", requireAuth, requireModule("app-extra"), requireRole("admin", "super_admin"), async (req, res) => {
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

// ─── SMTP Config for platform document emails (admin/super_admin) ────────────
// NOTE: Uses PLATFORM_EMAIL_SMTP_* keys — NOT SYSADMIN_SMTP_* which is reserved
// for sysAdmin 2FA login (login page at /sys-k7x9). NEVER read/write SYSADMIN_SMTP_*
// here. These are two completely separate SMTP configs.
app.get("/api/settings/smtp", requireAuth, requireRole("admin", "super_admin"), async (_req, res) => {
  try {
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute(sql.raw(`SELECT config_key, config_value FROM system_config WHERE config_key IN ('PLATFORM_EMAIL_SMTP_HOST','PLATFORM_EMAIL_SMTP_PORT','PLATFORM_EMAIL_SMTP_USER','PLATFORM_EMAIL_SMTP_PASS','PLATFORM_EMAIL_SMTP_FROM','PLATFORM_EMAIL_SMTP_SECURE')`));
    const cfg: Record<string, string> = {};
    for (const r of (rows.rows || []) as any[]) cfg[r.config_key] = r.config_value;
    res.json({
      host: cfg.PLATFORM_EMAIL_SMTP_HOST || "",
      port: cfg.PLATFORM_EMAIL_SMTP_PORT || "587",
      user: cfg.PLATFORM_EMAIL_SMTP_USER || "",
      pass: cfg.PLATFORM_EMAIL_SMTP_PASS ? "***" : "",
      from: cfg.PLATFORM_EMAIL_SMTP_FROM || "",
      secure: cfg.PLATFORM_EMAIL_SMTP_SECURE === "true",
      hasPass: !!cfg.PLATFORM_EMAIL_SMTP_PASS,
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.put("/api/settings/smtp", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const { sql } = await import("drizzle-orm");
    const { host, port, user, pass, from, secure } = req.body;
    if (!host || !user) return res.status(400).json({ message: "กรุณากรอก SMTP Host และ Username" });
    const upsert = async (key: string, val: string) => {
      const k = key.replace(/'/g, "''");
      const v = String(val).replace(/'/g, "''");
      await db.execute(sql.raw(`INSERT INTO system_config(config_key,config_value) VALUES('${k}','${v}') ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value`));
    };
    await upsert("PLATFORM_EMAIL_SMTP_HOST", String(host));
    await upsert("PLATFORM_EMAIL_SMTP_PORT", String(port || 587));
    await upsert("PLATFORM_EMAIL_SMTP_USER", String(user));
    if (pass && pass !== "***") await upsert("PLATFORM_EMAIL_SMTP_PASS", String(pass));
    await upsert("PLATFORM_EMAIL_SMTP_FROM", String(from || user));
    await upsert("PLATFORM_EMAIL_SMTP_SECURE", secure ? "true" : "false");
    res.json({ message: "บันทึก SMTP config สำเร็จ" });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/settings/smtp/test-ethereal", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const nodemailer = await import("nodemailer");
    const account = await nodemailer.default.createTestAccount();
    const transporter = nodemailer.default.createTransport({
      host: "smtp.ethereal.email", port: 587, secure: false,
      auth: { user: account.user, pass: account.pass },
    });
    const info = await transporter.sendMail({
      from: `"E-Tax Center [Dev Test]" <${account.user}>`,
      to: account.user,
      subject: "ทดสอบ Email Dev — E-Tax Center",
      html: `<div style="font-family:sans-serif;padding:20px"><h2>✅ Email ทดงานปกติ</h2><p>นี่คือการทดสอบระบบ Email ของ E-Tax Center</p><p><small>สร้างด้วย Ethereal (dev only)</small></p></div>`,
    });
    const previewUrl = nodemailer.default.getTestMessageUrl(info);
    res.json({ previewUrl, message: "สร้าง dev test email สำเร็จ — คลิก URL เพื่อดูผล" });
  } catch (err: any) {
    res.status(500).json({ message: `Ethereal test ล้มเหลว: ${err.message}` });
  }
});

app.post("/api/settings/smtp/test", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
  try {
    const { sql } = await import("drizzle-orm");
    const { testEmail } = req.body;
    const user = req.user as any;
    const toEmail = testEmail || user.email;
    if (!toEmail) return res.status(400).json({ message: "กรุณากรอก email ทดสอบ" });
    const rows = await db.execute(sql.raw(`SELECT config_key, config_value FROM system_config WHERE config_key IN ('PLATFORM_EMAIL_SMTP_HOST','PLATFORM_EMAIL_SMTP_PORT','PLATFORM_EMAIL_SMTP_USER','PLATFORM_EMAIL_SMTP_PASS','PLATFORM_EMAIL_SMTP_FROM','PLATFORM_EMAIL_SMTP_SECURE')`));
    const cfg: Record<string, string> = {};
    for (const r of (rows.rows || []) as any[]) cfg[r.config_key] = r.config_value;
    if (!cfg.PLATFORM_EMAIL_SMTP_HOST || !cfg.PLATFORM_EMAIL_SMTP_USER || !cfg.PLATFORM_EMAIL_SMTP_PASS) return res.status(400).json({ message: "ยังไม่ได้ตั้งค่า SMTP" });
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      host: cfg.PLATFORM_EMAIL_SMTP_HOST, port: Number(cfg.PLATFORM_EMAIL_SMTP_PORT || 587),
      secure: cfg.PLATFORM_EMAIL_SMTP_SECURE === "true",
      auth: { user: cfg.PLATFORM_EMAIL_SMTP_USER, pass: cfg.PLATFORM_EMAIL_SMTP_PASS.trim() },
    });
    const fromAddress = cfg.PLATFORM_EMAIL_SMTP_FROM || "noreply@etaxcenter.com";
    const fromDisplay = `อีเมลอัตโนมัติจาก E-Tax Center <${fromAddress}>`;
    await transporter.sendMail({
      from: fromDisplay,
      to: toEmail,
      subject: "ทดสอบ SMTP — E-Tax Center",
      html: `<div style="font-family:sans-serif;padding:20px"><p>ทดสอบระบบส่งอีเมลผ่าน SMTP สำเร็จ ✅</p></div>`,
    });
    res.json({ message: `ส่ง email ทดสอบไปที่ ${toEmail} สำเร็จ` });
  } catch (err: any) {
    console.error("[SMTP test] error:", err.message, err.code, err.responseCode);
    res.status(500).json({ message: `ส่ง email ล้มเหลว: ${err.message}` });
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
