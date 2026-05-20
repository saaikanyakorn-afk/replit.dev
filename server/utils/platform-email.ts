/**
 * Platform Email — shared SMTP helper
 * ✅ Uses PLATFORM_EMAIL_SMTP_* keys — for ALL platform document emails
 * ❌ NEVER use SYSADMIN_SMTP_* here — those are reserved for sysAdmin 2FA at /sys-k7x9
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export async function sendPlatformEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}): Promise<void> {
  const rows = await db.execute(sql.raw(
    `SELECT config_key, config_value FROM system_config WHERE config_key IN ('PLATFORM_EMAIL_SMTP_HOST','PLATFORM_EMAIL_SMTP_PORT','PLATFORM_EMAIL_SMTP_USER','PLATFORM_EMAIL_SMTP_PASS','PLATFORM_EMAIL_SMTP_FROM','PLATFORM_EMAIL_SMTP_SECURE')`
  ));
  const cfg: Record<string, string> = {};
  for (const r of (rows.rows || []) as any[]) cfg[r.config_key] = r.config_value;

  if (!cfg.PLATFORM_EMAIL_SMTP_HOST || !cfg.PLATFORM_EMAIL_SMTP_USER || !cfg.PLATFORM_EMAIL_SMTP_PASS) {
    throw new Error("ยังไม่ได้ตั้งค่า SMTP — กรุณาตั้งค่าที่ Platform → ตั้งค่า Email ก่อน");
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    host: cfg.PLATFORM_EMAIL_SMTP_HOST,
    port: Number(cfg.PLATFORM_EMAIL_SMTP_PORT || "587"),
    secure: cfg.PLATFORM_EMAIL_SMTP_SECURE === "true",
    auth: { user: cfg.PLATFORM_EMAIL_SMTP_USER, pass: cfg.PLATFORM_EMAIL_SMTP_PASS.trim() },
    tls: { rejectUnauthorized: false },
  });

  const fromAddress = cfg.PLATFORM_EMAIL_SMTP_FROM || cfg.PLATFORM_EMAIL_SMTP_USER;
  await transporter.sendMail({
    from: fromAddress,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    ...(opts.attachments ? { attachments: opts.attachments } : {}),
  });
}
