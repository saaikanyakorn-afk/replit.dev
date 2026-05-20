import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { sysAdmins, sysAdminPasswordHistory, sysAdminPasswordPolicy, sysAdminAuditLog, customers, employees, lineRecipients } from "@shared/schema";
import { eq, desc, sql, isNotNull, or, ilike, and, inArray, gte, lte } from "drizzle-orm";
import { hashPassword, comparePasswords } from "../auth";
import * as OTPAuth from "otpauth";
import { sendSysAdminEmail, buildOtpEmail, getSmtpConfigForDisplay, saveSmtpConfig } from "../utils/sysadmin-email";

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
}

async function requireSysAdminAuth(req: Request, res: Response, next: NextFunction) {
  const session = req.session as any;
  if (!session.sysAdminId) {
    return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ SysAdmin" });
  }
  const policy = await getPasswordPolicy();
  if (session.sysAdminLastActivity) {
    const elapsed = Date.now() - session.sysAdminLastActivity;
    if (elapsed > policy.sessionTimeoutMinutes * 60000) {
      await logAudit(req, "session_timeout", "sysadmin", session.sysAdminId, undefined,
        `Session หมดอายุหลังไม่มีการใช้งาน ${policy.sessionTimeoutMinutes} นาที`);
      delete session.sysAdminId;
      delete session.sysAdminLastActivity;
      return res.status(440).json({ message: `Session หมดอายุ (ไม่มีการใช้งาน ${policy.sessionTimeoutMinutes} นาที)`, sessionExpired: true });
    }
  }
  session.sysAdminLastActivity = Date.now();

  if (policy.ipWhitelistEnabled && policy.ipWhitelist && policy.ipWhitelist.length > 0) {
    const clientIp = getClientIp(req);
    if (!policy.ipWhitelist.includes(clientIp)) {
      return res.status(403).json({ message: `IP ${clientIp} ไม่ได้อยู่ใน Whitelist` });
    }
  }

  next();
}

async function getPasswordPolicy() {
  const rows = await db.select().from(sysAdminPasswordPolicy).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(sysAdminPasswordPolicy).values({}).returning();
  return created;
}

const BANNED_PASSWORDS = new Set([
  "password", "p@ssw0rd", "p@ssword", "passw0rd", "p@ss1234",
  "qwerty123", "qwerty1!", "qwerty12", "qwert123",
  "admin123", "admin@123", "admin1234", "adm1n@123",
  "letmein1", "letme1n!", "l3tme1n!",
  "welcome1", "welc0me1", "w3lcome!",
  "changeme", "ch@ngeme", "ch@nge1t",
  "12345678", "123456789", "1234567890",
  "abcd1234", "abc12345", "abcdef1!",
  "iloveyou", "1l0vey0u",
  "trustno1", "trust@1",
  "sunshine", "sun$h1ne",
  "master12", "master1!", "m@ster12",
  "monkey12", "m0nkey1!",
  "dragon12", "dr@gon1!",
  "baseball", "b@seball", "footb@ll",
  "shadow12", "sh@dow1!",
  "michael1", "m1chael!",
  "superman", "sup3rman", "sup3rm@n",
  "test1234", "test@123", "t3st1234",
  "root1234", "r00t@123",
  "server12", "s3rver1!",
  "sysadmin", "sys@dm1n", "sysadm1n",
  "system12", "syst3m1!", "s1st3m@1",
  "etaxcenter", "et@xcenter", "3t@x1234",
]);

function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase();
  if (BANNED_PASSWORDS.has(lower)) return true;
  const normalized = lower
    .replace(/@/g, "a").replace(/0/g, "o").replace(/1/g, "i")
    .replace(/3/g, "e").replace(/\$/g, "s").replace(/5/g, "s")
    .replace(/!/g, "i").replace(/\+/g, "t");
  if (BANNED_PASSWORDS.has(normalized)) return true;
  if (/^(.)\1{5,}$/.test(lower)) return true;
  if (/^(012|123|234|345|456|567|678|789|abc|bcd|cde|def)/.test(lower) && lower.length <= 10) return true;
  return false;
}

function validatePasswordStrength(password: string, policy: {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecial: boolean;
}): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength) {
    errors.push(`รหัสผ่านต้องมีอย่างน้อย ${policy.minLength} ตัวอักษร`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว (A-Z)");
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("ต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว (a-z)");
  }
  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push("ต้องมีตัวเลขอย่างน้อย 1 ตัว (0-9)");
  }
  if (policy.requireSpecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    errors.push("ต้องมีอักขระพิเศษอย่างน้อย 1 ตัว (!@#$%^&*...)");
  }
  if (isCommonPassword(password)) {
    errors.push("รหัสผ่านนี้เป็นรหัสที่คาดเดาได้ง่าย กรุณาเลือกรหัสที่ไม่ซ้ำกับรหัสที่ใช้กันทั่วไป");
  }
  return errors;
}

async function logAudit(req: Request, action: string, targetType?: string, targetId?: number, targetName?: string, details?: string) {
  try {
    const session = req.session as any;
    let username = "system";
    if (session.sysAdminId) {
      const [admin] = await db.select({ username: sysAdmins.username }).from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (admin) username = admin.username;
    }
    await db.insert(sysAdminAuditLog).values({
      sysAdminId: session.sysAdminId || 0,
      sysAdminUsername: username,
      action,
      targetType: targetType || null,
      targetId: targetId || null,
      targetName: targetName || null,
      details: details || null,
      ipAddress: getClientIp(req),
    });
  } catch (err) {
    console.error("[SysAdmin Audit] Failed to log:", err);
  }
}

export function registerSysAdminRoutes(app: Express) {

  app.get("/api/sysadmin/users-count", async (_req, res) => {
    try {
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(sysAdmins);
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/bootstrap", async (req, res) => {
    try {
      const existing = await db.select({ id: sysAdmins.id }).from(sysAdmins).limit(1);
      if (existing.length > 0) {
        return res.status(403).json({ message: "Master SysAdmin มีอยู่แล้ว ไม่สามารถ bootstrap ซ้ำได้" });
      }

      const { username, password, fullName, email, lineUserId, twoFactorMethod } = req.body;
      if (!username || !password || !fullName) {
        return res.status(400).json({ message: "กรุณากรอก username, password, fullName" });
      }

      if (!twoFactorMethod || !["totp", "line", "email"].includes(twoFactorMethod)) {
        return res.status(400).json({ message: "กรุณาเลือกวิธี 2FA (totp, line, email)" });
      }

      if (twoFactorMethod === "line" && !lineUserId?.trim()) {
        return res.status(400).json({ message: "กรุณากรอก LINE User ID สำหรับ 2FA ผ่าน LINE" });
      }

      if (twoFactorMethod === "email" && !email?.trim()) {
        return res.status(400).json({ message: "กรุณากรอก Email สำหรับ 2FA ผ่าน Email" });
      }

      const policy = await getPasswordPolicy();
      const strengthErrors = validatePasswordStrength(password, policy);
      if (strengthErrors.length > 0) {
        return res.status(400).json({ message: "รหัสผ่านไม่ผ่านเงื่อนไข", errors: strengthErrors });
      }

      let totpSecret: string | null = null;
      let totpUri: string | null = null;
      if (twoFactorMethod === "totp") {
        const secret = new OTPAuth.Secret({ size: 20 });
        totpSecret = secret.base32;
        const totp = new OTPAuth.TOTP({
          issuer: "E-Tax Center",
          label: username,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret,
        });
        totpUri = totp.toString();
      }

      const hashed = await hashPassword(password);
      const [master] = await db.insert(sysAdmins).values({
        username,
        password: hashed,
        fullName,
        email: email?.trim() || null,
        lineUserId: lineUserId?.trim() || null,
        isMaster: true,
        mustChangePassword: false,
        passwordExpiryDays: policy.expiryDays,
        twoFactorMethod,
        twoFactorSecret: totpSecret,
        twoFactorVerified: false,
      }).returning();

      await db.insert(sysAdminPasswordHistory).values({
        sysAdminId: master.id,
        passwordHash: hashed,
      });

      await logAudit(req, "bootstrap_master", "sysadmin", master.id, master.username, `2FA method: ${twoFactorMethod}`);

      const session = req.session as any;
      session.bootstrapSysAdminId = master.id;

      const { password: _, twoFactorSecret: _s, ...safe } = master;
      res.status(201).json({ ...safe, totpUri });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/bootstrap/send-otp", async (req, res) => {
    try {
      const session = req.session as any;
      const adminId = session.bootstrapSysAdminId;
      if (!adminId) return res.status(400).json({ message: "ไม่มี session bootstrap" });

      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, adminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (admin.twoFactorVerified) return res.json({ message: "2FA ยืนยันแล้ว" });

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      session.bootstrap2faOtp = otp;
      session.bootstrap2faExpiry = Date.now() + 5 * 60 * 1000;

      if (admin.twoFactorMethod === "line") {
        if (!admin.lineUserId) return res.status(400).json({ message: "ไม่มี LINE User ID" });
        const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (!token) return res.status(500).json({ message: "LINE Channel Access Token ไม่ได้ตั้งค่า" });
        const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            to: admin.lineUserId,
            messages: [{ type: "text", text: `[E-Tax Center SysAdmin]\nรหัส OTP: ${otp}\nหมดอายุใน 5 นาที` }],
          }),
        });
        if (!lineRes.ok) {
          const errBody = await lineRes.text();
          console.error("[LINE OTP Error]", errBody);
          return res.status(500).json({ message: "ส่ง OTP ผ่าน LINE ไม่สำเร็จ กรุณาตรวจสอบ LINE User ID" });
        }
        await logAudit(req, "bootstrap_2fa_sent", "sysadmin", admin.id, admin.username, "LINE OTP sent");
        return res.json({ message: "ส่ง OTP ไปที่ LINE แล้ว", method: "line" });
      }

      if (admin.twoFactorMethod === "email") {
        session.bootstrap2faOtp = otp;
        await logAudit(req, "bootstrap_2fa_email_pending", "sysadmin", admin.id, admin.username, "Email 2FA - not verified (no email service)");
        return res.json({ message: "Email 2FA ยังไม่สามารถส่งได้ในขณะนี้", method: "email", notVerified: true });
      }

      return res.status(400).json({ message: "Method ไม่ต้องส่ง OTP (ใช้ TOTP app)" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/bootstrap/verify-2fa", async (req, res) => {
    try {
      const session = req.session as any;
      const adminId = session.bootstrapSysAdminId;
      if (!adminId) return res.status(400).json({ message: "ไม่มี session bootstrap" });

      const attempts = session.bootstrap2faAttempts || 0;
      if (attempts >= 5) {
        return res.status(429).json({ message: "ลองมากเกินไป กรุณาเริ่ม bootstrap ใหม่" });
      }

      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, adminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (admin.twoFactorVerified) return res.json({ verified: true, message: "2FA ยืนยันแล้ว" });

      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "กรุณากรอกรหัส OTP" });

      session.bootstrap2faAttempts = attempts + 1;

      if (admin.twoFactorMethod === "totp") {
        if (!admin.twoFactorSecret) return res.status(500).json({ message: "TOTP secret ไม่มี" });
        const secret = OTPAuth.Secret.fromBase32(admin.twoFactorSecret);
        const totp = new OTPAuth.TOTP({
          issuer: "E-Tax Center",
          label: admin.username,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret,
        });
        const delta = totp.validate({ token: code, window: 1 });
        if (delta === null) {
          return res.status(400).json({ message: `รหัส OTP ไม่ถูกต้อง (${attempts + 1}/5)` });
        }
      } else if (admin.twoFactorMethod === "line") {
        if (!session.bootstrap2faOtp || !session.bootstrap2faExpiry) {
          return res.status(400).json({ message: "กรุณาส่ง OTP ก่อน" });
        }
        if (Date.now() > session.bootstrap2faExpiry) {
          return res.status(400).json({ message: "OTP หมดอายุแล้ว กรุณาส่งใหม่" });
        }
        if (code !== session.bootstrap2faOtp) {
          return res.status(400).json({ message: `รหัส OTP ไม่ถูกต้อง (${attempts + 1}/5)` });
        }
      } else {
        return res.status(400).json({ message: "Email 2FA ยังไม่สามารถยืนยันได้ในขณะนี้" });
      }

      await db.update(sysAdmins).set({ twoFactorVerified: true }).where(eq(sysAdmins.id, adminId));
      await logAudit(req, "bootstrap_2fa_verified", "sysadmin", admin.id, admin.username, `${admin.twoFactorMethod} verified`);

      delete session.bootstrap2faOtp;
      delete session.bootstrap2faExpiry;

      res.json({ verified: true, message: "ยืนยัน 2FA สำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/bootstrap/skip-email-2fa", async (req, res) => {
    try {
      const session = req.session as any;
      const adminId = session.bootstrapSysAdminId;
      if (!adminId) return res.status(400).json({ message: "ไม่มี session bootstrap" });

      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, adminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (admin.twoFactorMethod !== "email") return res.status(400).json({ message: "ใช้ได้เฉพาะ Email 2FA" });

      await logAudit(req, "bootstrap_2fa_email_skipped", "sysadmin", admin.id, admin.username, "Email verification skipped - will verify later");
      res.json({ message: "บันทึก Email 2FA ไว้ ยังไม่ได้ยืนยัน (จะยืนยันภายหลัง)" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" });
      }

      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.username, username)).limit(1);
      if (!admin) {
        await logAudit(req, "login_failed", "sysadmin", undefined, username, "User not found");
        return res.status(401).json({ message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
      }

      if (!admin.active) {
        await logAudit(req, "login_blocked", "sysadmin", admin.id, admin.username, "Account suspended");
        return res.status(403).json({ message: "บัญชีนี้ถูกระงับ" });
      }

      const policy = await getPasswordPolicy();

      if (policy.ipWhitelistEnabled && policy.ipWhitelist && policy.ipWhitelist.length > 0) {
        const clientIp = getClientIp(req);
        if (!policy.ipWhitelist.includes(clientIp)) {
          await logAudit(req, "login_blocked_ip", "sysadmin", admin.id, admin.username, `IP ${clientIp} not whitelisted`);
          return res.status(403).json({ message: `IP ${clientIp} ไม่ได้อยู่ใน Whitelist` });
        }
      }

      if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
        const remainMin = Math.ceil((new Date(admin.lockedUntil).getTime() - Date.now()) / 60000);
        await logAudit(req, "login_locked", "sysadmin", admin.id, admin.username, `Locked for ${remainMin} more minutes`);
        return res.status(423).json({ message: `บัญชีถูกล็อค กรุณารออีก ${remainMin} นาที`, locked: true });
      }

      const isMatch = await comparePasswords(password, admin.password);
      if (!isMatch) {
        const newAttempts = admin.failedLoginAttempts + 1;
        const updates: any = { failedLoginAttempts: newAttempts };
        if (newAttempts >= policy.maxFailedAttempts) {
          updates.lockedUntil = new Date(Date.now() + policy.lockoutMinutes * 60000);
          await db.update(sysAdmins).set(updates).where(eq(sysAdmins.id, admin.id));
          await logAudit(req, "account_locked", "sysadmin", admin.id, admin.username, `Locked after ${newAttempts} failed attempts`);
          return res.status(423).json({
            message: `ใส่รหัสผ่านผิด ${newAttempts} ครั้ง บัญชีถูกล็อค ${policy.lockoutMinutes} นาที`,
            locked: true,
          });
        }
        await db.update(sysAdmins).set(updates).where(eq(sysAdmins.id, admin.id));
        await logAudit(req, "login_failed", "sysadmin", admin.id, admin.username, `Wrong password (${newAttempts}/${policy.maxFailedAttempts})`);
        return res.status(401).json({
          message: `รหัสผ่านไม่ถูกต้อง (ผิด ${newAttempts}/${policy.maxFailedAttempts} ครั้ง)`,
        });
      }

      const clientIp = getClientIp(req);
      await db.update(sysAdmins).set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: clientIp,
      }).where(eq(sysAdmins.id, admin.id));

      if (admin.twoFactorMethod) {
        const session = req.session as any;
        session.sysAdmin2faPendingId = admin.id;
        session.sysAdmin2faAttempts = 0;
        await logAudit(req, "login_2fa_pending", "sysadmin", admin.id, admin.username, `password OK · awaiting ${admin.twoFactorMethod} 2FA`);
        const passwordExpired = admin.passwordChangedAt
          ? (Date.now() - new Date(admin.passwordChangedAt).getTime()) > (admin.passwordExpiryDays * 86400000)
          : true;
        return res.json({
          requires2FA: true,
          twoFactorMethod: admin.twoFactorMethod,
          mustChangePassword: admin.mustChangePassword || passwordExpired,
        });
      }

      const session = req.session as any;
      session.sysAdminId = admin.id;
      session.sysAdminLastActivity = Date.now();

      const passwordExpired = admin.passwordChangedAt
        ? (Date.now() - new Date(admin.passwordChangedAt).getTime()) > (admin.passwordExpiryDays * 86400000)
        : true;

      await logAudit(req, "login_success", "sysadmin", admin.id, admin.username, "no 2FA (direct login)");

      const { password: _, twoFactorSecret: _s, ...safeAdmin } = admin;
      res.json({
        ...safeAdmin,
        mustChangePassword: admin.mustChangePassword || passwordExpired,
        sessionTimeoutMinutes: policy.sessionTimeoutMinutes,
      });
    } catch (err: any) {
      console.error("[SysAdmin Login Error]", err);
      res.status(500).json({ message: "เกิดข้อผิดพลาด" });
    }
  });

  app.post("/api/sysadmin/login/send-otp", async (req, res) => {
    try {
      const session = req.session as any;
      const adminId = session.sysAdmin2faPendingId;
      if (!adminId) return res.status(400).json({ message: "กรุณาเข้าสู่ระบบก่อน" });

      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, adminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });

      if (admin.twoFactorMethod === "totp") {
        return res.status(400).json({ message: "TOTP ไม่ต้องส่ง OTP ใช้ Authenticator App โดยตรง" });
      }

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      session.login2faOtp = otp;
      session.login2faExpiry = Date.now() + 10 * 60 * 1000;

      if (admin.twoFactorMethod === "line") {
        const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (!token) return res.status(500).json({ message: "LINE Channel Access Token ไม่ได้ตั้งค่า" });
        const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            to: admin.lineUserId,
            messages: [{ type: "text", text: `[E-Tax Center SysAdmin]\nรหัส OTP เข้าสู่ระบบ: ${otp}\nหมดอายุใน 10 นาที` }],
          }),
        });
        if (!lineRes.ok) return res.status(500).json({ message: "ส่ง OTP ไม่สำเร็จ" });
        await logAudit(req, "login_2fa_otp_sent", "sysadmin", admin.id, admin.username, "LINE OTP sent");
        return res.json({ message: "ส่ง OTP ไป LINE แล้ว", method: "line" });
      }

      if (admin.twoFactorMethod === "email") {
        if (!admin.email) return res.status(400).json({ message: "ไม่มี email สำหรับส่ง OTP" });
        await sendSysAdminEmail(admin.email, "รหัส OTP เข้าสู่ระบบ E-Tax Center SysAdmin", buildOtpEmail(otp, "เข้าสู่ระบบ"));
        await logAudit(req, "login_2fa_otp_sent", "sysadmin", admin.id, admin.username, "Email OTP sent");
        const masked = admin.email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + "*".repeat(Math.max(1, b.length)) + c);
        return res.json({ message: `ส่ง OTP ไปที่ ${masked} แล้ว`, method: "email" });
      }

      return res.status(400).json({ message: "2FA method ไม่รองรับ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/login/verify-2fa", async (req, res) => {
    try {
      const session = req.session as any;
      const adminId = session.sysAdmin2faPendingId;
      if (!adminId) return res.status(400).json({ message: "กรุณาเข้าสู่ระบบก่อน" });

      const attempts = session.sysAdmin2faAttempts || 0;
      if (attempts >= 5) {
        delete session.sysAdmin2faPendingId;
        return res.status(429).json({ message: "ลองมากเกินไป กรุณาเข้าสู่ระบบใหม่" });
      }
      session.sysAdmin2faAttempts = attempts + 1;

      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, adminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });

      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "กรุณากรอกรหัส OTP" });

      if (admin.twoFactorMethod === "totp") {
        if (!admin.twoFactorSecret) return res.status(500).json({ message: "TOTP secret ไม่มี" });
        const secret = OTPAuth.Secret.fromBase32(admin.twoFactorSecret);
        const totp = new OTPAuth.TOTP({
          issuer: "E-Tax Center",
          label: admin.username,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret,
        });
        const delta = totp.validate({ token: code, window: 1 });
        if (delta === null) {
          return res.status(400).json({ message: `รหัส OTP ไม่ถูกต้อง (${attempts + 1}/5)` });
        }
      } else if (admin.twoFactorMethod === "line" || admin.twoFactorMethod === "email") {
        if (!session.login2faOtp || !session.login2faExpiry) {
          return res.status(400).json({ message: "กรุณาส่ง OTP ก่อน" });
        }
        if (Date.now() > session.login2faExpiry) {
          return res.status(400).json({ message: "OTP หมดอายุ กรุณาส่งใหม่" });
        }
        if (code !== session.login2faOtp) {
          return res.status(400).json({ message: `รหัส OTP ไม่ถูกต้อง (${attempts + 1}/5)` });
        }
      } else {
        return res.status(400).json({ message: "2FA method ไม่รองรับ" });
      }

      session.sysAdminId = admin.id;
      session.sysAdminLastActivity = Date.now();
      delete session.sysAdmin2faPendingId;
      delete session.sysAdmin2faAttempts;
      delete session.login2faOtp;
      delete session.login2faExpiry;

      if (!admin.twoFactorVerified) {
        await db.update(sysAdmins).set({ twoFactorVerified: true }).where(eq(sysAdmins.id, admin.id));
      }

      const policy = await getPasswordPolicy();
      await logAudit(req, "login_2fa_verified", "sysadmin", admin.id, admin.username, `${admin.twoFactorMethod} 2FA passed · login complete`);

      const { password: _, twoFactorSecret: _s, ...safeAdmin } = admin;
      const passwordExpired = admin.passwordChangedAt
        ? (Date.now() - new Date(admin.passwordChangedAt).getTime()) > (admin.passwordExpiryDays * 86400000)
        : true;
      res.json({
        ...safeAdmin,
        mustChangePassword: admin.mustChangePassword || passwordExpired,
        sessionTimeoutMinutes: policy.sessionTimeoutMinutes,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/logout", async (req, res) => {
    const session = req.session as any;
    if (session.sysAdminId) {
      const [loggingOut] = await db.select({ id: sysAdmins.id, username: sysAdmins.username }).from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      await logAudit(req, "logout", "sysadmin", loggingOut?.id, loggingOut?.username, "session ended");
    }
    delete session.sysAdminId;
    delete session.sysAdminLastActivity;
    res.json({ message: "ออกจากระบบ SysAdmin สำเร็จ" });
  });

  app.get("/api/sysadmin/forest-line-directory", async (req, res) => {
    try {
      const session = req.session as any;
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(sysAdmins);
      const isBootstrap = count === 0;
      if (!isBootstrap && !session.sysAdminId) {
        return res.status(401).json({ message: "กรุณาเข้าสู่ระบบ SysAdmin" });
      }

      const idLookup = String(req.query.id || "").trim();
      if (idLookup) {
        const matches: Array<{ lineUserId: string; displayName: string; source: string }> = [];
        const recRows = await db.select({ lineUserId: lineRecipients.lineId, displayName: lineRecipients.displayName, source: sql<string>`'LINE Recipient'` })
          .from(lineRecipients).where(eq(lineRecipients.lineId, idLookup));
        const empRows = await db.select({ lineUserId: employees.lineUserId, displayName: employees.fullName, source: sql<string>`'พนักงาน'` })
          .from(employees).where(eq(employees.lineUserId, idLookup));
        const custRows = await db.select({ lineUserId: customers.lineUserId, displayName: customers.name, source: sql<string>`'ลูกค้า'` })
          .from(customers).where(eq(customers.lineUserId, idLookup));
        for (const r of [...recRows, ...empRows, ...custRows]) {
          if (r.lineUserId && r.displayName) matches.push({ lineUserId: r.lineUserId, displayName: r.displayName, source: r.source });
        }
        return res.json(matches);
      }

      const q = String(req.query.q || "").trim();
      if (q.length < 1) return res.json([]);
      const needle = `%${q}%`;
      const limit = Math.min(parseInt(String(req.query.limit || "30"), 10) || 30, 100);

      const customerRows = await db
        .select({
          lineUserId: customers.lineUserId,
          displayName: customers.name,
          source: sql<string>`'ลูกค้า'`,
          lastSeenAt: customers.createdAt,
        })
        .from(customers)
        .where(and(isNotNull(customers.lineUserId), ilike(customers.name, needle)))
        .limit(limit);

      const employeeRows = await db
        .select({
          lineUserId: employees.lineUserId,
          displayName: employees.fullName,
          source: sql<string>`'พนักงาน'`,
          lastSeenAt: sql<string | null>`null`,
        })
        .from(employees)
        .where(and(isNotNull(employees.lineUserId), ilike(employees.fullName, needle)))
        .limit(limit);

      const recipientRows = await db
        .select({
          lineUserId: lineRecipients.lineId,
          displayName: lineRecipients.displayName,
          source: sql<string>`'LINE Recipient'`,
          lastSeenAt: lineRecipients.createdAt,
        })
        .from(lineRecipients)
        .where(or(ilike(lineRecipients.displayName, needle), ilike(lineRecipients.lineId, needle)))
        .limit(limit);

      const seen = new Set<string>();
      const merged: Array<{ lineUserId: string; displayName: string; source: string; lastSeenAt: any }> = [];
      for (const row of [...customerRows, ...employeeRows, ...recipientRows]) {
        if (!row.lineUserId || !row.displayName) continue;
        if (seen.has(row.lineUserId)) continue;
        seen.add(row.lineUserId);
        merged.push({
          lineUserId: row.lineUserId,
          displayName: row.displayName,
          source: row.source,
          lastSeenAt: row.lastSeenAt,
        });
        if (merged.length >= limit) break;
      }

      res.json(merged);
    } catch (err: any) {
      console.error("forest-line-directory error:", err);
      res.status(500).json({ message: "ค้นหา LINE ไม่สำเร็จ", error: err.message });
    }
  });

  app.get("/api/sysadmin/me", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin) {
        delete session.sysAdminId;
        return res.status(401).json({ message: "SysAdmin ไม่พบในระบบ" });
      }
      const policy = await getPasswordPolicy();
      const passwordExpired = admin.passwordChangedAt
        ? (Date.now() - new Date(admin.passwordChangedAt).getTime()) > (admin.passwordExpiryDays * 86400000)
        : true;
      const { password: _, ...safeAdmin } = admin;
      res.json({
        ...safeAdmin,
        mustChangePassword: admin.mustChangePassword || passwordExpired,
        sessionTimeoutMinutes: policy.sessionTimeoutMinutes,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/change-password", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่" });
      }

      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });

      const isMatch = await comparePasswords(currentPassword, admin.password);
      if (!isMatch) return res.status(401).json({ message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });

      const policy = await getPasswordPolicy();
      const strengthErrors = validatePasswordStrength(newPassword, policy);
      if (strengthErrors.length > 0) {
        return res.status(400).json({ message: "รหัสผ่านไม่ผ่านเงื่อนไข", errors: strengthErrors });
      }

      const history = await db.select().from(sysAdminPasswordHistory)
        .where(eq(sysAdminPasswordHistory.sysAdminId, admin.id))
        .orderBy(desc(sysAdminPasswordHistory.createdAt))
        .limit(policy.historyCount);

      for (const h of history) {
        const reused = await comparePasswords(newPassword, h.passwordHash);
        if (reused) {
          return res.status(400).json({ message: `ห้ามใช้รหัสผ่านเดิม ${policy.historyCount} ครั้งล่าสุด` });
        }
      }

      const hashed = await hashPassword(newPassword);
      await db.update(sysAdmins).set({
        password: hashed,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      }).where(eq(sysAdmins.id, admin.id));

      await db.insert(sysAdminPasswordHistory).values({
        sysAdminId: admin.id,
        passwordHash: hashed,
      });

      await logAudit(req, "change_password", "sysadmin", admin.id, admin.username, `new password: ${newPassword.length} chars`);
      res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sysadmin/password-policy", requireSysAdminAuth, async (_req, res) => {
    try {
      const policy = await getPasswordPolicy();
      res.json(policy);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/sysadmin/password-policy", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!caller?.isMaster) {
        return res.status(403).json({ message: "เฉพาะ Master SysAdmin เท่านั้นที่แก้ Password Policy ได้" });
      }

      const { minLength, requireUppercase, requireLowercase, requireNumbers, requireSpecial, expiryDays, historyCount, maxFailedAttempts, lockoutMinutes, sessionTimeoutMinutes, require2fa, ipWhitelistEnabled, ipWhitelist } = req.body;
      const policy = await getPasswordPolicy();

      const [updated] = await db.update(sysAdminPasswordPolicy).set({
        minLength: minLength ?? policy.minLength,
        requireUppercase: requireUppercase ?? policy.requireUppercase,
        requireLowercase: requireLowercase ?? policy.requireLowercase,
        requireNumbers: requireNumbers ?? policy.requireNumbers,
        requireSpecial: requireSpecial ?? policy.requireSpecial,
        expiryDays: expiryDays ?? policy.expiryDays,
        historyCount: historyCount ?? policy.historyCount,
        maxFailedAttempts: maxFailedAttempts ?? policy.maxFailedAttempts,
        lockoutMinutes: lockoutMinutes ?? policy.lockoutMinutes,
        sessionTimeoutMinutes: sessionTimeoutMinutes ?? policy.sessionTimeoutMinutes,
        require2fa: require2fa ?? policy.require2fa,
        ipWhitelistEnabled: ipWhitelistEnabled ?? policy.ipWhitelistEnabled,
        ipWhitelist: ipWhitelist !== undefined ? ipWhitelist : policy.ipWhitelist,
        updatedAt: new Date(),
      }).where(eq(sysAdminPasswordPolicy.id, policy.id)).returning();

      await logAudit(req, "update_password_policy", "policy", policy.id, "password_policy", JSON.stringify({ sessionTimeoutMinutes: updated.sessionTimeoutMinutes, minLength: updated.minLength }));
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sysadmin/users", requireSysAdminAuth, async (_req, res) => {
    try {
      const admins = await db.select({
        id: sysAdmins.id,
        username: sysAdmins.username,
        fullName: sysAdmins.fullName,
        email: sysAdmins.email,
        isMaster: sysAdmins.isMaster,
        active: sysAdmins.active,
        mustChangePassword: sysAdmins.mustChangePassword,
        passwordChangedAt: sysAdmins.passwordChangedAt,
        passwordExpiryDays: sysAdmins.passwordExpiryDays,
        failedLoginAttempts: sysAdmins.failedLoginAttempts,
        lockedUntil: sysAdmins.lockedUntil,
        lastLoginAt: sysAdmins.lastLoginAt,
        lastLoginIp: sysAdmins.lastLoginIp,
        createdAt: sysAdmins.createdAt,
        createdBy: sysAdmins.createdBy,
        lineUserId: sysAdmins.lineUserId,
        twoFactorMethod: sysAdmins.twoFactorMethod,
        twoFactorVerified: sysAdmins.twoFactorVerified,
      }).from(sysAdmins).orderBy(desc(sysAdmins.isMaster), sysAdmins.createdAt);
      res.json(admins);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/users", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [callerAdmin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      const { username, password, fullName, email, lineUserId, twoFactorMethod } = req.body;
      if (!username || !password || !fullName) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
      }
      if (!lineUserId || !String(lineUserId).trim()) {
        return res.status(400).json({ message: "กรุณากรอก LINE User ID (ใช้สำหรับ 2FA)" });
      }
      const method = twoFactorMethod || "line";
      if (!["totp", "line", "email"].includes(method)) {
        return res.status(400).json({ message: "วิธี 2FA ไม่ถูกต้อง" });
      }

      const policy = await getPasswordPolicy();
      const strengthErrors = validatePasswordStrength(password, policy);
      if (strengthErrors.length > 0) {
        return res.status(400).json({ message: "รหัสผ่านไม่ผ่านเงื่อนไข", errors: strengthErrors });
      }

      const existing = await db.select({ id: sysAdmins.id }).from(sysAdmins).where(eq(sysAdmins.username, username)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ message: "Username นี้ถูกใช้แล้ว" });
      }

      const hashed = await hashPassword(password);
      const [created] = await db.insert(sysAdmins).values({
        username,
        password: hashed,
        fullName,
        email: email || null,
        lineUserId: String(lineUserId).trim(),
        twoFactorMethod: method,
        twoFactorVerified: false,
        isMaster: false,
        mustChangePassword: true,
        passwordExpiryDays: policy.expiryDays,
        createdBy: session.sysAdminId,
      }).returning();

      await db.insert(sysAdminPasswordHistory).values({
        sysAdminId: created.id,
        passwordHash: hashed,
      });

      await logAudit(req, "create_sysadmin", "sysadmin", created.id, created.username, `created by ${callerAdmin?.username} · 2FA: ${created.twoFactorMethod}`);
      const { password: _, ...safe } = created;
      res.status(201).json(safe);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/sysadmin/users/:id", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const targetId = Number(req.params.id);
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      const [target] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, targetId)).limit(1);

      if (!target) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (target.isMaster && caller?.id !== target.id) {
        return res.status(403).json({ message: "ไม่สามารถจัดการ Master SysAdmin ได้" });
      }

      const updates: any = {};
      if (req.body.fullName !== undefined) updates.fullName = req.body.fullName;
      if (req.body.email !== undefined) updates.email = req.body.email;
      if (req.body.active !== undefined && !target.isMaster && caller?.id !== targetId) updates.active = req.body.active;
      if (req.body.lineUserId !== undefined) {
        const newLineId = String(req.body.lineUserId || "").trim();
        if (!newLineId) {
          return res.status(400).json({ message: "LINE User ID ห้ามเป็นค่าว่าง" });
        }
        if (newLineId !== target.lineUserId) {
          updates.lineUserId = newLineId;
          updates.twoFactorVerified = false;
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "ไม่มีข้อมูลให้อัพเดท" });
      }

      const [updated] = await db.update(sysAdmins).set(updates).where(eq(sysAdmins.id, targetId)).returning();
      const fieldLabels: Record<string, string> = { fullName: "ชื่อ", email: "email", active: "สถานะ", lineUserId: "LINE ID", twoFactorVerified: "2FA verified" };
      const humanUpdates = Object.entries(updates).filter(([k]) => k !== "twoFactorVerified").map(([k, v]) => `${fieldLabels[k] ?? k}: ${v}`).join(" · ");
      await logAudit(req, "update_sysadmin", "sysadmin", targetId, target.username, `by ${caller?.username} · ${humanUpdates}`);
      const { password: _, ...safe } = updated;
      res.json(safe);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/users/:id/force-change-password", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const targetId = Number(req.params.id);
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      const [target] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, targetId)).limit(1);

      if (!target) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (target.isMaster && caller?.id !== target.id) {
        return res.status(403).json({ message: "ไม่สามารถจัดการ Master SysAdmin ได้" });
      }

      await db.update(sysAdmins).set({ mustChangePassword: true }).where(eq(sysAdmins.id, targetId));
      await logAudit(req, "force_change_password", "sysadmin", targetId, target.username, `forced by ${caller?.username}`);
      res.json({ message: "ตั้งค่าให้ต้องเปลี่ยนรหัสผ่านครั้งถัดไปแล้ว" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/users/:id/reset-password", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const targetId = Number(req.params.id);
      const { newPassword } = req.body;

      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      const [target] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, targetId)).limit(1);

      if (!target) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (target.isMaster && caller?.id !== target.id) {
        return res.status(403).json({ message: "ไม่สามารถจัดการ Master SysAdmin ได้" });
      }

      if (!newPassword) return res.status(400).json({ message: "กรุณากรอกรหัสผ่านใหม่" });

      const policy = await getPasswordPolicy();
      const strengthErrors = validatePasswordStrength(newPassword, policy);
      if (strengthErrors.length > 0) {
        return res.status(400).json({ message: "รหัสผ่านไม่ผ่านเงื่อนไข", errors: strengthErrors });
      }

      const hashed = await hashPassword(newPassword);
      await db.update(sysAdmins).set({
        password: hashed,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      }).where(eq(sysAdmins.id, targetId));

      await db.insert(sysAdminPasswordHistory).values({
        sysAdminId: targetId,
        passwordHash: hashed,
      });

      await logAudit(req, "reset_password", "sysadmin", targetId, target.username, `reset by ${caller?.username} · new password: ${newPassword.length} chars`);
      res.json({ message: "รีเซ็ตรหัสผ่านสำเร็จ ผู้ใช้จะต้องเปลี่ยนรหัสผ่านในครั้งถัดไป" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/users/:id/unlock", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const targetId = Number(req.params.id);
      const [[target], [caller]] = await Promise.all([
        db.select().from(sysAdmins).where(eq(sysAdmins.id, targetId)).limit(1),
        db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1),
      ]);
      if (!target) return res.status(404).json({ message: "ไม่พบ SysAdmin" });

      await db.update(sysAdmins).set({
        failedLoginAttempts: 0,
        lockedUntil: null,
      }).where(eq(sysAdmins.id, targetId));

      await logAudit(req, "unlock_account", "sysadmin", targetId, target.username, `unlocked by ${caller?.username}`);
      res.json({ message: "ปลดล็อคบัญชีสำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/sysadmin/users/:id", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const targetId = Number(req.params.id);
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      const [target] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, targetId)).limit(1);

      if (!target) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (target.isMaster) return res.status(403).json({ message: "ไม่สามารถลบ Master SysAdmin ได้" });
      if (target.id === caller?.id) return res.status(400).json({ message: "ไม่สามารถลบตัวเองได้" });

      await logAudit(req, "delete_sysadmin", "sysadmin", targetId, target.username);
      await db.delete(sysAdminPasswordHistory).where(eq(sysAdminPasswordHistory.sysAdminId, targetId));
      await db.delete(sysAdmins).where(eq(sysAdmins.id, targetId));
      res.json({ message: "ลบ SysAdmin สำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const AUDIT_CATEGORY_ACTIONS: Record<string, string[]> = {
    auth: ["login_success", "login_failed", "login_blocked", "login_blocked_ip", "login_locked", "login_2fa_pending", "login_2fa_otp_sent", "login_2fa_verified", "logout", "session_timeout", "account_locked"],
    setup: ["bootstrap_master", "bootstrap_2fa_sent", "bootstrap_2fa_email_pending", "bootstrap_2fa_verified", "bootstrap_2fa_email_skipped"],
    user_mgmt: ["create_sysadmin", "update_sysadmin", "delete_sysadmin"],
    security: ["change_password", "reset_password", "force_change_password", "unlock_account", "update_password_policy", "reset_2fa", "delete_audit_logs"],
  };

  app.get("/api/sysadmin/audit-log", requireSysAdminAuth, async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 500);
      const offset = Number(req.query.offset) || 0;
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const conditions: any[] = [];
      if (category && AUDIT_CATEGORY_ACTIONS[category]) {
        conditions.push(inArray(sysAdminAuditLog.action, AUDIT_CATEGORY_ACTIONS[category]));
      }
      if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        conditions.push(or(
          ilike(sysAdminAuditLog.sysAdminUsername, s),
          ilike(sysAdminAuditLog.action, s),
          ilike(sysAdminAuditLog.targetName, s),
          ilike(sysAdminAuditLog.details, s),
        ));
      }
      if (dateFrom) {
        conditions.push(gte(sysAdminAuditLog.createdAt, new Date(dateFrom)));
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        conditions.push(lte(sysAdminAuditLog.createdAt, to));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const logs = await db.select().from(sysAdminAuditLog)
        .where(whereClause)
        .orderBy(desc(sysAdminAuditLog.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ count: total }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sysAdminAuditLog)
        .where(whereClause);

      res.json({ logs, total, limit, offset });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/sysadmin/audit-log/bulk", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin?.isMaster) return res.status(403).json({ message: "เฉพาะ Master SysAdmin เท่านั้นที่ลบ Audit Log ได้" });
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ไม่มีรายการที่เลือก" });
      const validIds = ids.map(Number).filter(n => !isNaN(n) && n > 0);
      if (validIds.length === 0) return res.status(400).json({ message: "ID ไม่ถูกต้อง" });
      await db.delete(sysAdminAuditLog).where(inArray(sysAdminAuditLog.id, validIds));
      await logAudit(req, "delete_audit_logs", "audit", undefined, undefined, `Deleted ${validIds.length} log(s): ids=[${validIds.join(",")}]`);
      res.json({ message: `ลบ ${validIds.length} รายการสำเร็จ` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/setup-master", async (_req, res) => {
    return res.status(410).json({ message: "Route นี้ถูกปิดใช้งานแล้ว กรุณาใช้ /api/sysadmin/bootstrap" });
  });

  app.get("/api/sysadmin/has-master", async (_req, res) => {
    try {
      const existing = await db.select({ id: sysAdmins.id }).from(sysAdmins).where(eq(sysAdmins.isMaster, true)).limit(1);
      res.json({ hasMaster: existing.length > 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Reset 2FA (Master can reset anyone, others can reset themselves) ───────
  app.post("/api/sysadmin/users/:id/reset-2fa", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const targetId = Number(req.params.id);
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      const [target] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, targetId)).limit(1);
      if (!target) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (target.isMaster && caller?.id !== target.id) return res.status(403).json({ message: "ไม่สามารถ reset Master SysAdmin ได้" });
      if (!caller?.isMaster && caller?.id !== targetId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      await db.update(sysAdmins).set({ twoFactorVerified: false }).where(eq(sysAdmins.id, targetId));
      await logAudit(req, "reset_2fa", "sysadmin", targetId, target.username, `Reset by ${caller?.username}`);
      res.json({ message: "รีเซ็ต 2FA สำเร็จ ผู้ใช้ต้องยืนยัน 2FA ใหม่ในครั้งถัดไป" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── TOTP Setup: generate QR ─────────────────────────────────────────────
  app.post("/api/sysadmin/me/setup-totp", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });

      const secret = new OTPAuth.Secret({ size: 20 });
      const base32 = secret.base32;
      const totp = new OTPAuth.TOTP({
        issuer: "E-Tax Center",
        label: admin.username,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret,
      });
      const uri = totp.toString();
      await db.update(sysAdmins).set({ totpSetupSecret: base32 }).where(eq(sysAdmins.id, admin.id));
      res.json({ uri, secret: base32 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── TOTP Setup: verify & activate ─────────────────────────────────────────
  app.post("/api/sysadmin/me/verify-totp-setup", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (!admin.totpSetupSecret) return res.status(400).json({ message: "กรุณาสร้าง QR code ก่อน" });

      const { code } = req.body;
      const secret = OTPAuth.Secret.fromBase32(admin.totpSetupSecret);
      const totp = new OTPAuth.TOTP({ issuer: "E-Tax Center", label: admin.username, algorithm: "SHA1", digits: 6, period: 30, secret });
      const delta = totp.validate({ token: String(code || "").trim(), window: 1 });
      if (delta === null) return res.status(400).json({ message: "รหัสไม่ถูกต้อง กรุณาลองใหม่" });

      await db.update(sysAdmins).set({
        twoFactorMethod: "totp",
        twoFactorSecret: admin.totpSetupSecret,
        totpSetupSecret: null,
        twoFactorVerified: true,
      }).where(eq(sysAdmins.id, admin.id));
      await logAudit(req, "switch_2fa_totp", "sysadmin", admin.id, admin.username, `${admin.twoFactorMethod || "none"} → totp`);
      res.json({ message: "เปิดใช้ TOTP/QR Code 2FA สำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Switch 2FA to LINE ─────────────────────────────────────────────────────
  app.post("/api/sysadmin/me/switch-to-line", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (!admin.lineUserId) return res.status(400).json({ message: "ยังไม่มี LINE User ID กรุณาตั้งค่าใน Edit ก่อน" });
      await db.update(sysAdmins).set({ twoFactorMethod: "line", twoFactorVerified: false }).where(eq(sysAdmins.id, admin.id));
      await logAudit(req, "switch_2fa_line", "sysadmin", admin.id, admin.username, `${admin.twoFactorMethod || "none"} → line`);
      res.json({ message: "เปลี่ยนไปใช้ LINE OTP แล้ว ต้อง verify ใหม่ครั้งถัดไป login" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Email: send verification code ─────────────────────────────────────────
  app.post("/api/sysadmin/me/send-email-verification", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (!admin.email) return res.status(400).json({ message: "ยังไม่มี email กรุณาเพิ่ม email ใน Edit ก่อน" });

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      session.emailVerifOtp = otp;
      session.emailVerifExpiry = Date.now() + 10 * 60 * 1000;

      await sendSysAdminEmail(admin.email, "ยืนยัน Email — E-Tax Center SysAdmin", buildOtpEmail(otp, "ยืนยัน Email"));
      const masked = admin.email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + "*".repeat(Math.max(1, b.length)) + c);
      res.json({ message: `ส่งรหัสยืนยันไปที่ ${masked} แล้ว` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Email: verify code and activate email 2FA ──────────────────────────────
  app.post("/api/sysadmin/me/verify-email", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const { code } = req.body;
      if (!session.emailVerifOtp || !session.emailVerifExpiry) return res.status(400).json({ message: "กรุณาขอรหัสยืนยันก่อน" });
      if (Date.now() > session.emailVerifExpiry) return res.status(400).json({ message: "รหัสหมดอายุ กรุณาขอใหม่" });
      if (String(code || "").trim() !== session.emailVerifOtp) return res.status(400).json({ message: "รหัสไม่ถูกต้อง" });

      delete session.emailVerifOtp;
      delete session.emailVerifExpiry;

      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });

      await db.update(sysAdmins).set({
        emailVerified: true,
        twoFactorMethod: "email",
        twoFactorVerified: true,
      }).where(eq(sysAdmins.id, admin.id));
      await logAudit(req, "switch_2fa_email", "sysadmin", admin.id, admin.username, `${admin.twoFactorMethod || "none"} → email`);
      res.json({ message: "ยืนยัน Email สำเร็จ เปิดใช้ Email 2FA แล้ว" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Email change: request (send code to OLD email) ────────────────────────
  app.post("/api/sysadmin/me/request-email-change", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const { newEmail } = req.body;
      if (!newEmail || !/\S+@\S+\.\S+/.test(newEmail)) return res.status(400).json({ message: "Email ใหม่ไม่ถูกต้อง" });

      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });

      const otp = String(Math.floor(100000 + Math.random() * 900000));
      await db.update(sysAdmins).set({ emailChangeCode: otp, emailChangePending: newEmail, emailChangeCodeExpiry: new Date(Date.now() + 10 * 60 * 1000) })
        .where(eq(sysAdmins.id, admin.id));

      if (admin.email) {
        await sendSysAdminEmail(admin.email, "ยืนยันการเปลี่ยน Email — E-Tax Center SysAdmin", buildOtpEmail(otp, "เปลี่ยน Email"));
        const masked = admin.email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + "*".repeat(Math.max(1, b.length)) + c);
        res.json({ message: `ส่งรหัสยืนยันไปที่ email เก่า (${masked}) แล้ว กรุณาตรวจสอบ` });
      } else {
        res.json({ message: "ยังไม่มี email เก่า บันทึก email ใหม่ได้ทันที", skipVerify: true });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Email change: confirm with code ───────────────────────────────────────
  app.post("/api/sysadmin/me/confirm-email-change", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const { code } = req.body;
      const [admin] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!admin) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      if (!admin.emailChangeCode || !admin.emailChangePending) return res.status(400).json({ message: "ไม่มีคำขอเปลี่ยน email" });
      if (admin.emailChangeCodeExpiry && new Date(admin.emailChangeCodeExpiry) < new Date()) return res.status(400).json({ message: "รหัสหมดอายุ กรุณาขอใหม่" });
      if (String(code || "").trim() !== admin.emailChangeCode) return res.status(400).json({ message: "รหัสไม่ถูกต้อง" });

      const newEmail = admin.emailChangePending;
      await db.update(sysAdmins).set({
        email: newEmail,
        emailVerified: false,
        emailChangeCode: null,
        emailChangePending: null,
        emailChangeCodeExpiry: null,
        twoFactorVerified: admin.twoFactorMethod === "email" ? false : admin.twoFactorVerified,
      }).where(eq(sysAdmins.id, admin.id));
      await logAudit(req, "change_email", "sysadmin", admin.id, admin.username, `New email set`);
      res.json({ message: "เปลี่ยน email สำเร็จ", newEmail });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Master changes other admin's email directly (no old-email verify) ──────
  app.post("/api/sysadmin/users/:id/set-email", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const targetId = Number(req.params.id);
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!caller?.isMaster) return res.status(403).json({ message: "เฉพาะ Master SysAdmin เท่านั้น" });
      const [target] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, targetId)).limit(1);
      if (!target) return res.status(404).json({ message: "ไม่พบ SysAdmin" });
      const { email } = req.body;
      if (email && !/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ message: "Email ไม่ถูกต้อง" });
      await db.update(sysAdmins).set({
        email: email || null,
        emailVerified: false,
        twoFactorVerified: target.twoFactorMethod === "email" ? false : target.twoFactorVerified,
      }).where(eq(sysAdmins.id, targetId));
      await logAudit(req, "set_email_by_master", "sysadmin", targetId, target.username, `set by ${caller?.username} · email: ${email || "(ลบออก)"}`);
      res.json({ message: "บันทึก email สำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── SMTP Config (Master only) ──────────────────────────────────────────────
  app.get("/api/sysadmin/smtp-config", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!caller?.isMaster) return res.status(403).json({ message: "เฉพาะ Master SysAdmin เท่านั้น" });
      res.json(await getSmtpConfigForDisplay());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/sysadmin/smtp-config", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!caller?.isMaster) return res.status(403).json({ message: "เฉพาะ Master SysAdmin เท่านั้น" });
      const { host, port, user, pass, from, secure } = req.body;
      if (!host || !user) return res.status(400).json({ message: "กรุณากรอก SMTP Host และ Username" });
      await saveSmtpConfig({ host, port: Number(port) || 587, user, pass, from: from || user, secure: !!secure });
      await logAudit(req, "update_smtp_config", "sysadmin", caller.id, caller.username, `host: ${host} · user: ${user}`);
      res.json({ message: "บันทึก SMTP config สำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/smtp-config/test", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!caller?.isMaster) return res.status(403).json({ message: "เฉพาะ Master SysAdmin เท่านั้น" });
      const toEmail = req.body.testEmail || caller.email;
      if (!toEmail) return res.status(400).json({ message: "กรุณากรอก email ทดสอบ" });

      const { host, port, user, pass, from, secure } = req.body;
      const testOtp = String(Math.floor(100000 + Math.random() * 900000));

      if (host && user && pass) {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host,
          port: Number(port || 587),
          secure: secure === true || secure === "true",
          auth: { user, pass },
        });
        await transporter.sendMail({
          from: from || user,
          to: toEmail,
          subject: "ทดสอบ SMTP — E-Tax Center SysAdmin",
          html: buildOtpEmail(testOtp, "ทดสอบระบบ Email"),
        });
      } else {
        await sendSysAdminEmail(toEmail, "ทดสอบ SMTP — E-Tax Center SysAdmin", buildOtpEmail(testOtp, "ทดสอบระบบ Email"));
      }

      res.json({ message: `ส่ง email ทดสอบไปที่ ${toEmail} สำเร็จ` });
    } catch (err: any) {
      res.status(500).json({ message: `ส่ง email ล้มเหลว: ${err.message}` });
    }
  });

  // ─── Resend Config (Master only) ────────────────────────────────────────────
  app.get("/api/sysadmin/resend-config", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!caller?.isMaster) return res.status(403).json({ message: "เฉพาะ Master SysAdmin เท่านั้น" });
      const rows = await db.execute(sql.raw(`SELECT config_key, config_value FROM system_config WHERE config_key IN ('SYSADMIN_RESEND_API_KEY','SYSADMIN_RESEND_FROM')`));
      const cfg: Record<string, string> = {};
      for (const r of (rows.rows || []) as any[]) cfg[r.config_key] = r.config_value;
      res.json({ apiKey: cfg.SYSADMIN_RESEND_API_KEY ? "***" : "", from: cfg.SYSADMIN_RESEND_FROM || "", hasKey: !!cfg.SYSADMIN_RESEND_API_KEY });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/sysadmin/resend-config", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!caller?.isMaster) return res.status(403).json({ message: "เฉพาะ Master SysAdmin เท่านั้น" });
      const { apiKey, from } = req.body;
      const keepKey = !apiKey || apiKey === "__keep__";
      if (!keepKey && !String(apiKey).startsWith("re_")) return res.status(400).json({ message: "Resend API Key ไม่ถูกต้อง — ต้องขึ้นต้นด้วย re_" });
      if (!keepKey) {
        await db.execute(sql.raw(`INSERT INTO system_config(config_key,config_value) VALUES('SYSADMIN_RESEND_API_KEY',${JSON.stringify(String(apiKey))}) ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value`));
      }
      const fromVal = from ? String(from) : "noreply@etaxerp.com";
      await db.execute(sql.raw(`INSERT INTO system_config(config_key,config_value) VALUES('SYSADMIN_RESEND_FROM',${JSON.stringify(fromVal)}) ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value`));
      await logAudit(req, "update_resend_config", "sysadmin", caller.id, caller.username, `from: ${fromVal}`);
      res.json({ message: "บันทึก Resend config สำเร็จ" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/sysadmin/resend-config/test", requireSysAdminAuth, async (req, res) => {
    try {
      const session = req.session as any;
      const [caller] = await db.select().from(sysAdmins).where(eq(sysAdmins.id, session.sysAdminId)).limit(1);
      if (!caller?.isMaster) return res.status(403).json({ message: "เฉพาะ Master SysAdmin เท่านั้น" });
      const { apiKey, from, testEmail } = req.body;
      const toEmail = testEmail || caller.email;
      if (!toEmail) return res.status(400).json({ message: "กรุณากรอก email ทดสอบ" });
      if (!apiKey || !String(apiKey).startsWith("re_")) return res.status(400).json({ message: "Resend API Key ไม่ถูกต้อง" });
      const fromAddr = `E-Tax Center <${from || "noreply@etaxerp.com"}>`;
      const testRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromAddr, to: [toEmail], subject: "ทดสอบ Resend — E-Tax Center SysAdmin", html: `<div style="font-family:sans-serif;padding:20px"><p>ทดสอบระบบส่งอีเมลผ่าน Resend สำเร็จ ✅</p><p>จาก E-Tax Center SysAdmin</p></div>` }),
      });
      if (!testRes.ok) { const e = await testRes.json().catch(() => ({})) as any; throw new Error(e?.message || `Resend error ${testRes.status}`); }
      res.json({ message: `ส่ง email ทดสอบไปที่ ${toEmail} สำเร็จ` });
    } catch (err: any) { res.status(500).json({ message: `ส่ง email ล้มเหลว: ${err.message}` }); }
  });

  // ─────────────────────────────────────────────────────────────
  // INFRASTRUCTURE — Locations  (/api/sysadmin/infra/locations)
  // Independent from platform routes — sysadmin domain only
  // ─────────────────────────────────────────────────────────────
  app.get("/api/sysadmin/infra/locations", requireSysAdminAuth, async (_req, res) => {
    try {
      const { platformLocations } = await import("@shared/schema");
      const rows = await db.select().from(platformLocations).orderBy(platformLocations.id);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/infra/locations", requireSysAdminAuth, async (req, res) => {
    try {
      const { platformLocations, insertPlatformLocationSchema } = await import("@shared/schema");
      const parsed = insertPlatformLocationSchema.parse(req.body);
      const [row] = await db.insert(platformLocations).values(parsed).returning();
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/sysadmin/infra/locations/:id", requireSysAdminAuth, async (req, res) => {
    try {
      const { platformLocations } = await import("@shared/schema");
      const id = Number(req.params.id);
      const { createdAt, updatedAt, id: _id, ...updates } = req.body;
      const [row] = await db.update(platformLocations)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(platformLocations.id, id))
        .returning();
      if (!row) return res.status(404).json({ message: "ไม่พบ Location" });
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/sysadmin/infra/locations/:id", requireSysAdminAuth, async (req, res) => {
    try {
      const { platformLocations } = await import("@shared/schema");
      const id = Number(req.params.id);
      const [row] = await db.delete(platformLocations).where(eq(platformLocations.id, id)).returning();
      if (!row) return res.status(404).json({ message: "ไม่พบ Location" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // INFRASTRUCTURE — Routers  (/api/sysadmin/infra/routers)
  // ─────────────────────────────────────────────────────────────
  app.get("/api/sysadmin/infra/routers", requireSysAdminAuth, async (_req, res) => {
    try {
      const { routers } = await import("@shared/schema");
      const rows = await db.select().from(routers).orderBy(routers.name);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/infra/routers", requireSysAdminAuth, async (req, res) => {
    try {
      const { routers, insertRouterSchema } = await import("@shared/schema");
      const parsed = insertRouterSchema.parse(req.body);
      const [row] = await db.insert(routers).values(parsed).returning();
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/sysadmin/infra/routers/:id", requireSysAdminAuth, async (req, res) => {
    try {
      const { routers } = await import("@shared/schema");
      const id = Number(req.params.id);
      const { createdAt, updatedAt, id: _id, ...updates } = req.body;
      const [row] = await db.update(routers)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(routers.id, id))
        .returning();
      if (!row) return res.status(404).json({ message: "ไม่พบ Router" });
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/sysadmin/infra/routers/:id", requireSysAdminAuth, async (req, res) => {
    try {
      const { routers } = await import("@shared/schema");
      const id = Number(req.params.id);
      const [row] = await db.delete(routers).where(eq(routers.id, id)).returning();
      if (!row) return res.status(404).json({ message: "ไม่พบ Router" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // INFRASTRUCTURE — Domains  (/api/sysadmin/infra/domains)
  // ─────────────────────────────────────────────────────────────
  app.get("/api/sysadmin/infra/domains", requireSysAdminAuth, async (_req, res) => {
    try {
      const { platformDomains, routers, machines } = await import("@shared/schema");
      const rows = await db.select({
        domain: platformDomains,
        routerName: routers.name,
        machineName: machines.localName,
      })
        .from(platformDomains)
        .leftJoin(routers, eq(platformDomains.routerId, routers.id))
        .leftJoin(machines, eq(platformDomains.machineId, machines.id))
        .orderBy(platformDomains.domainName);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sysadmin/infra/domains", requireSysAdminAuth, async (req, res) => {
    try {
      const { platformDomains, insertPlatformDomainSchema } = await import("@shared/schema");
      const parsed = insertPlatformDomainSchema.parse(req.body);
      const [row] = await db.insert(platformDomains).values(parsed).returning();
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/sysadmin/infra/domains/:id", requireSysAdminAuth, async (req, res) => {
    try {
      const { platformDomains } = await import("@shared/schema");
      const id = Number(req.params.id);
      const { createdAt, updatedAt, id: _id, ...updates } = req.body;
      const [row] = await db.update(platformDomains)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(platformDomains.id, id))
        .returning();
      if (!row) return res.status(404).json({ message: "ไม่พบ Domain" });
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/sysadmin/infra/domains/:id", requireSysAdminAuth, async (req, res) => {
    try {
      const { platformDomains } = await import("@shared/schema");
      const id = Number(req.params.id);
      const [row] = await db.delete(platformDomains).where(eq(platformDomains.id, id)).returning();
      if (!row) return res.status(404).json({ message: "ไม่พบ Domain" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // INFRASTRUCTURE — Machines  (/api/sysadmin/infra/machines)
  // Read-only list for sysadmin view — edit via dedicated screen
  // ─────────────────────────────────────────────────────────────
  app.get("/api/sysadmin/infra/machines", requireSysAdminAuth, async (_req, res) => {
    try {
      const { machines } = await import("@shared/schema");
      const rows = await db.select().from(machines).orderBy(machines.id);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

}
