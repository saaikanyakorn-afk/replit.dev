import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import type { Express } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool, db } from "./db";
import { tenants, companies, users, subscriptionPlans, tenantSubscriptions, workBoards } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { isMaintenanceMode, getMaintenanceState } from "./maintenance";
import { logActivity } from "./route-helpers";
import { getConfig } from "./config-bootstrap";
import cookieSignature from "cookie-signature";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashedPassword, salt] = stored.split(".");
  const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
  const suppliedPasswordBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const PgStore = connectPgSimple(session);

  const isProd = process.env.NODE_ENV === "production";

  const pgStore = new PgStore({
    pool: pool,
    createTableIfMissing: true,
  });

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "etax-center-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
    },
    store: pgStore,
  };

  const sessionSecret = sessionSettings.secret as string;
  app.use((req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!req.headers.cookie && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token) {
        const unsigned = cookieSignature.unsign(token, sessionSecret);
        if (unsigned !== false) {
          req.headers.cookie = `connect.sid=s%3A${encodeURIComponent(token)}`;
        }
      }
    }
    next();
  });

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "ชื่อผู้ใช้ไม่ถูกต้อง" });
        }
        const isMatch = await comparePasswords(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "รหัสผ่านไม่ถูกต้อง" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (user) {
        const emp = await storage.getEmployeeByUserId(user.id);
        (user as any).employeeId = emp?.id || null;
        (user as any).empCompanyId = emp?.companyId || null;
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { companyName, tenantType, businessType, contactName, contactEmail, contactPhone, adminUsername, adminPassword, recaptchaToken } = req.body;

      if (!recaptchaToken) {
        return res.status(400).json({ message: "กรุณายืนยันตัวตนก่อนสมัคร" });
      }

      const recaptchaSecret = getConfig("RECAPTCHA_SECRET_KEY", "RECAPTCHA_SECRET_KEY");
      const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(recaptchaToken)}`,
      });
      const verifyData = await verifyRes.json() as { success: boolean };
      if (!verifyData.success) {
        return res.status(403).json({ message: "การยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่" });
      }

      if (!companyName || !tenantType || !contactName || !adminUsername || !adminPassword) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
      }
      if (adminPassword.length < 6) {
        return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
      }
      if (adminUsername.length < 3) {
        return res.status(400).json({ message: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" });
      }
      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        return res.status(400).json({ message: "รูปแบบอีเมลไม่ถูกต้อง" });
      }

      const existingUser = await storage.getUserByUsername(adminUsername);
      if (existingUser) {
        return res.status(400).json({ message: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น" });
      }

      const hashedPw = await hashPassword(adminPassword);

      await db.transaction(async (tx) => {
        const [tenant] = await tx.insert(tenants).values({
          name: companyName,
          tenantType,
          status: "active",
          contactName: contactName || null,
          contactEmail: contactEmail || null,
          contactPhone: contactPhone || null,
        }).returning();

        await tx.insert(companies).values({
          name: companyName,
          active: true,
          isPrimary: true,
          tenantType,
          businessType: businessType || "mixed",
          tenantId: tenant.id,
          email: contactEmail || null,
          phone: contactPhone || null,
        });

        await tx.insert(users).values({
          username: adminUsername,
          password: hashedPw,
          fullName: contactName,
          role: "admin",
          email: contactEmail || null,
          active: true,
          tenantId: tenant.id,
        });

        const [freePlan] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, "free")).limit(1);
        if (freePlan) {
          const trialEnd = new Date();
          trialEnd.setDate(trialEnd.getDate() + 15);
          await tx.insert(tenantSubscriptions).values({
            tenantId: tenant.id,
            planId: freePlan.id,
            status: "trial",
            billingCycle: "monthly",
            startDate: new Date(),
            endDate: trialEnd,
            trialEndsAt: trialEnd,
            notes: "ทดลองใช้ฟรี 15 วัน",
          });
        }
      });

      res.status(201).json({ message: "สมัครใช้งานสำเร็จ" });
    } catch (err: any) {
      console.error("Registration error:", err);
      res.status(500).json({ message: err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่" });
    }
  });

  app.post("/api/auth/register-external", async (req, res) => {
    try {
      const { fullName, username, password, boardToken } = req.body;
      if (!fullName || !username || !password || !boardToken) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
      }
      if (username.length < 3) {
        return res.status(400).json({ message: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" });
      }

      const [board] = await db.select().from(workBoards)
        .where(and(eq(workBoards.shareToken, boardToken), eq(workBoards.visibility, "shareable")))
        .limit(1);
      if (!board) {
        return res.status(404).json({ message: "ไม่พบบอร์ดที่แชร์หรือยกเลิกการแชร์แล้ว" });
      }

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น" });
      }

      const hashedPw = await hashPassword(password);

      const [company] = await db.select({ tenantId: companies.tenantId }).from(companies)
        .where(eq(companies.id, board.companyId)).limit(1);

      const [newUser] = await db.insert(users).values({
        username,
        password: hashedPw,
        fullName,
        role: "client_external",
        active: true,
        tenantId: company?.tenantId || null,
        externalBoardToken: boardToken,
      }).returning();

      req.login(newUser, (loginErr) => {
        if (loginErr) {
          return res.status(201).json({ message: "สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ", autoLogin: false });
        }
        const { password: _, ...safeUser } = newUser;
        res.status(201).json({ ...safeUser, autoLogin: true });
      });
    } catch (err: any) {
      console.error("External registration error:", err);
      res.status(500).json({ message: err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่" });
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    const { recaptchaToken } = req.body;
    const isDev = process.env.NODE_ENV !== "production";
    if (!isDev) {
      if (!recaptchaToken) {
        return res.status(400).json({ message: "กรุณายืนยันตัวตนก่อนเข้าสู่ระบบ" });
      }
      try {
        const recaptchaSecret = getConfig("RECAPTCHA_SECRET_KEY", "RECAPTCHA_SECRET_KEY");
        const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(recaptchaToken)}`,
        });
        const verifyData = await verifyRes.json() as { success: boolean };
        if (!verifyData.success) {
          return res.status(403).json({ message: "การยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่" });
        }
      } catch {
        return res.status(500).json({ message: "ไม่สามารถตรวจสอบ reCAPTCHA ได้" });
      }
    }

    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "เข้าสู่ระบบไม่สำเร็จ" });

      const { isUserLocked } = await import("./utils/user-lock");
      const lock = isUserLocked(user.id);
      if (lock) {
        const remainSec = Math.ceil((lock.expiresAt - Date.now()) / 1000);
        return res.status(423).json({ message: `ผู้ดูแลระบบกำลังปรับสิทธิ์ของคุณ กรุณารอสักครู่ (อีกประมาณ ${remainSec} วินาที)`, locked: true, remainingSeconds: remainSec });
      }

      if (isMaintenanceMode() && user.role !== "super_admin") {
        const mState = getMaintenanceState();
        return res.status(503).json({ message: mState.message, maintenance: true, scheduledEnd: mState.scheduledEnd });
      }
      req.login(user, async (err) => {
        if (err) return next(err);
        if (req.body.rememberMe && req.session?.cookie) {
          req.session.cookie.maxAge = 10 * 365 * 24 * 60 * 60 * 1000;
        }

        if (user.role === "client_external" && req.body.boardToken) {
          try {
            const [newBoard] = await db.select({ id: workBoards.id }).from(workBoards)
              .where(and(eq(workBoards.shareToken, req.body.boardToken), eq(workBoards.visibility, "shareable")))
              .limit(1);
            if (newBoard && user.externalBoardToken !== req.body.boardToken) {
              await db.update(users).set({ externalBoardToken: req.body.boardToken }).where(eq(users.id, user.id));
              user.externalBoardToken = req.body.boardToken;
            }
          } catch (e: any) {
            console.error("[Auth] Failed to update externalBoardToken:", e.message);
          }
        }

        const { password, ...safeUser } = user;
        let tenantType = "general_business";
        if (user.tenantId) {
          try {
            const tenant = await storage.getTenant(user.tenantId);
            if (tenant) tenantType = tenant.tenantType;
          } catch {}
        }
        let empId: number | null = null;
        let empCompanyId: number | null = null;
        try {
          const emp = await storage.getEmployeeByUserId(user.id);
          empId = emp?.id || null;
          empCompanyId = emp?.companyId || null;
        } catch {}
        logActivity({ companyId: empCompanyId || user.primaryCompanyId || 0, userId: user.id, userName: user.username, action: "login", entityType: "user", entityId: String(user.id), entityName: user.fullName || user.username }).catch(() => {});
        const signedSid = cookieSignature.sign(req.sessionID, sessionSecret);
        return res.json({ ...safeUser, tenantType, employeeId: empId, empCompanyId, sessionToken: signedSid });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "ออกจากระบบไม่สำเร็จ" });
      res.json({ message: "ออกจากระบบสำเร็จ" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "ยังไม่ได้เข้าสู่ระบบ" });
    }
    const { password, ...safeUser } = req.user as any;
    if (isMaintenanceMode() && safeUser.role !== "super_admin") {
      req.logout(() => {});
      const mState = getMaintenanceState();
      return res.status(503).json({ message: mState.message, maintenance: true, scheduledEnd: mState.scheduledEnd });
    }
    const session = req.session as any;
    if (session.originalUserId) {
      safeUser.impersonating = true;
      const origUser = await storage.getUser(session.originalUserId);
      safeUser.originalUser = origUser ? { id: origUser.id, fullName: origUser.fullName, username: origUser.username } : null;
    }
    let tenantType = "general_business";
    if (safeUser.tenantId) {
      try {
        const tenant = await storage.getTenant(safeUser.tenantId);
        if (tenant) tenantType = tenant.tenantType;
      } catch {}
    }
    safeUser.tenantType = tenantType;

    if (safeUser.role === "client_external" && safeUser.externalBoardToken) {
      safeUser.isExternal = true;
    }

    if (safeUser.tenantId) {
      try {
        const sub = await storage.getTenantSubscription(safeUser.tenantId);
        if (sub) {
          const now = new Date();
          const trialExpired = sub.status === "trial" && sub.trialEndsAt && new Date(sub.trialEndsAt) < now;
          const subscriptionExpired = sub.status === "active" && sub.endDate && new Date(sub.endDate) < now;
          const effectiveEndDate = sub.status === "trial" ? sub.trialEndsAt : sub.endDate;
          const daysRemaining = effectiveEndDate ? Math.max(0, Math.ceil((new Date(effectiveEndDate).getTime() - now.getTime()) / 86400000)) : null;
          const isExpired = !!trialExpired || !!subscriptionExpired;
          safeUser.subscription = {
            status: isExpired ? "expired" : sub.status,
            trialEndsAt: sub.trialEndsAt,
            endDate: sub.endDate,
            trialExpired: isExpired,
            daysRemaining,
            planCode: (sub as any).plan?.code || null,
            planName: (sub as any).plan?.name || null,
          };
        } else {
          safeUser.subscription = { status: "none", trialExpired: true, daysRemaining: 0 };
        }
      } catch {}
    }

    res.json(safeUser);
  });

  app.post("/api/platform/impersonate/exit", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "ยังไม่ได้เข้าสู่ระบบ" });
    const session = req.session as any;
    if (!session.originalUserId) return res.status(400).json({ message: "ไม่ได้อยู่ในโหมดสวมสิทธิ์" });

    const origId = session.originalUserId;
    const originalUser = await storage.getUser(origId);
    if (!originalUser) return res.status(404).json({ message: "ไม่พบผู้ใช้ต้นทาง" });

    await new Promise<void>((resolve, reject) => {
      req.login(originalUser, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    delete (req.session as any).originalUserId;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });

    const { password: _pw, ...safeUser } = originalUser as any;
    res.json(safeUser);
  });

  app.post("/api/platform/impersonate/:userId", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "ยังไม่ได้เข้าสู่ระบบ" });
    const currentUser = req.user as any;
    if (currentUser.role !== "super_admin") return res.status(403).json({ message: "เฉพาะ Super Admin เท่านั้น" });

    const targetUserId = Number(req.params.userId);
    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) return res.status(404).json({ message: "ไม่พบผู้ใช้" });

    await new Promise<void>((resolve, reject) => {
      req.login(targetUser, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    (req.session as any).originalUserId = currentUser.id;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => { if (err) reject(err); else resolve(); });
    });

    const { password: _pw, ...safeTarget } = targetUser as any;
    safeTarget.impersonating = true;
    safeTarget.originalUser = { id: currentUser.id, fullName: currentUser.fullName, username: currentUser.username };
    res.json(safeTarget);
  });
}
