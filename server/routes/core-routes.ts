import type { Express } from "express";
import { registerIndexExtraRoutes } from "../index-extra";
import { db } from "../db";
import { storage } from "../storage";
import { eq, desc, and, or, isNull, inArray , sql } from "drizzle-orm";
import { users, companies, employees, firmClients, permissions, tenants, accounts, tenantSubscriptions, subscriptionPlans, insertUserSchema, journalLines } from "@shared/schema";
import { requireAuth, requireAdmin, requireRole } from "../route-middleware";
import { hashPassword } from "../auth";
import { z } from "zod";

async function getTenantOwnerAdminId(tenantId: number | null): Promise<number | null> {
  if (!tenantId) return null;
  const [firstAdmin] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, "admin"), eq(users.active, true)))
    .orderBy(users.id).limit(1);
  return firstAdmin?.id || null;
}

export function registerCoreRoutes(app: Express) {
registerIndexExtraRoutes(app);
app.get("/api/users", requireAuth, async (req, res) => {
  const cu = req.user as any;
  if (!cu || !["admin", "super_admin", "manager"].includes(cu.role)) {
    return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
  }
  const currentUser = req.user as any;
  const tenantId = currentUser.tenantId;
  let filterCompanyId = req.query.companyId ? Number(req.query.companyId) : null;

  const { getUserAllowedCompanyIds } = await import("../route-middleware");
  const userAllowedIds = await getUserAllowedCompanyIds(currentUser.id);
  const hasAllowedRestriction = userAllowedIds && userAllowedIds.length > 0;

  if (!filterCompanyId && hasAllowedRestriction && currentUser.role !== "admin" && currentUser.role !== "super_admin") {
    filterCompanyId = userAllowedIds![0];
  }

  let scopedCompanyIds: number[] = [];
  if (filterCompanyId) {
    if (hasAllowedRestriction && !userAllowedIds!.includes(filterCompanyId) && currentUser.role !== "admin" && currentUser.role !== "super_admin") {
      return res.json([]);
    }
    scopedCompanyIds = [filterCompanyId];
  } else if (hasAllowedRestriction) {
    scopedCompanyIds = userAllowedIds!;
  } else if (tenantId) {
    scopedCompanyIds = (await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, tenantId))).map(c => c.id);
  }

  let allUsers: any[];
  if (tenantId) {
    allUsers = await db.select().from(users).where(eq(users.tenantId, tenantId)).orderBy(users.id);
  } else {
    allUsers = await db.select().from(users).orderBy(users.id);
  }
  const safeUsers = allUsers.map(({ password, ...u }: any) => u);

  const empConditions = scopedCompanyIds.length > 0
    ? and(sql`${employees.userId} IS NOT NULL`, inArray(employees.companyId, scopedCompanyIds))
    : sql`${employees.userId} IS NOT NULL`;
  const empLinks = await db.select({ userId: employees.userId, empId: employees.id, empName: employees.fullName }).from(employees).where(empConditions!);
  const empMap = new Map(empLinks.map(e => [e.userId, { employeeId: e.empId, employeeName: e.empName }]));
  const usersWithEmp = safeUsers.map((u: any) => ({ ...u, linkedEmployee: empMap.get(u.id) || null }));

  const ownerId = await getTenantOwnerAdminId(tenantId);
  const usersWithOwner = usersWithEmp.map((u: any) => ({ ...u, isOwner: u.id === ownerId }));

  if (filterCompanyId || (hasAllowedRestriction && currentUser.role !== "admin" && currentUser.role !== "super_admin")) {
    const linkedUserIds = new Set(empLinks.map(e => e.userId));
    const allEmpLinkConditions = [sql`${employees.userId} IS NOT NULL`];
    if (tenantId) allEmpLinkConditions.push(eq(employees.tenantId, tenantId));
    const allEmpLinks = await db.select({ userId: employees.userId }).from(employees).where(and(...allEmpLinkConditions));
    const allLinkedUserIds = new Set(allEmpLinks.map(e => e.userId));

    const targetCompanyId = filterCompanyId || (scopedCompanyIds.length > 0 ? scopedCompanyIds[0] : null);
    let assignedUserIds = new Set<number>();
    if (targetCompanyId) {
      const assignedEmpIds = await db.select({ assignedTo: firmClients.assignedTo })
        .from(firmClients)
        .where(and(eq(firmClients.companyId, targetCompanyId), sql`${firmClients.assignedTo} IS NOT NULL`));
      const assignedEmpIdSet = new Set(assignedEmpIds.map(a => a.assignedTo));
      if (assignedEmpIdSet.size > 0) {
        const assignedEmps = await db.select({ userId: employees.userId })
          .from(employees)
          .where(and(sql`${employees.userId} IS NOT NULL`, inArray(employees.id, [...assignedEmpIdSet])));
        assignedUserIds = new Set(assignedEmps.map(e => e.userId!));
      }
    }

    const scopedSet = new Set(scopedCompanyIds);
    const filtered = usersWithOwner.filter((u: any) =>
      (currentUser.role === "admin" && u.role === "admin") ||
      linkedUserIds.has(u.id) || assignedUserIds.has(u.id) ||
      (Array.isArray(u.allowedCompanyIds) && u.allowedCompanyIds.some((id: number) => scopedSet.has(id)))
    );
    return res.json(filtered);
  }

  res.json(usersWithOwner);
});

app.get("/api/users/unlinked-employees", requireAuth, async (req, res) => {
  const cu2 = req.user as any;
  if (!cu2 || !["admin", "super_admin", "manager"].includes(cu2.role)) {
    return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
  }
  const currentUser = req.user as any;
  const tenantId = currentUser.tenantId;

  const { getUserAllowedCompanyIds } = await import("../route-middleware");
  const userAllowedIds = await getUserAllowedCompanyIds(currentUser.id);
  const hasAllowedRestriction = userAllowedIds && userAllowedIds.length > 0;

  if (tenantId) {
    let scopedCompanyIds: number[];
    if (hasAllowedRestriction) {
      scopedCompanyIds = userAllowedIds!;
    } else if (currentUser.role === "admin" || currentUser.role === "super_admin") {
      scopedCompanyIds = (await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, tenantId))).map(c => c.id);
    } else {
      const emp = await storage.getEmployeeByUserId(currentUser.id);
      scopedCompanyIds = emp?.companyId ? [emp.companyId] : [];
    }
    if (scopedCompanyIds.length === 0) return res.json([]);
    const unlinked = await db.select({ id: employees.id, fullName: employees.fullName })
      .from(employees)
      .where(and(isNull(employees.userId), inArray(employees.companyId, scopedCompanyIds)))
      .orderBy(employees.fullName);
    return res.json(unlinked);
  }
  const unlinked = await db.select({ id: employees.id, fullName: employees.fullName })
    .from(employees)
    .where(isNull(employees.userId))
    .orderBy(employees.fullName);
  res.json(unlinked);
});

app.post("/api/users", requireAuth, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const isAdmin = currentUser.role === "admin" || currentUser.role === "super_admin";
    const isManager = currentUser.role === "manager";
    if (!isAdmin && !isManager) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    if (isManager) {
      const newRole = req.body.role;
      const managerAllowedRoles = ["employee", "cashier"];
      if (!managerAllowedRoles.includes(newRole)) {
        return res.status(403).json({ message: "ผู้จัดการสร้างได้เฉพาะบัญชี 'พนักงาน' หรือ 'แคชเชียร์' เท่านั้น" });
      }
    }
    if (currentUser.tenantId) {
      const limitCheck = await storage.checkTenantLimit(currentUser.tenantId, "users");
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: `แพ็คเกจ ${limitCheck.planName} รองรับผู้ใช้สูงสุด ${limitCheck.limit} คน (ใช้แล้ว ${limitCheck.current} คน) กรุณาอัพเกรดแพ็คเกจ` });
      }
    }
    const { hashPassword } = await import("../auth");
    const parsed = insertUserSchema.parse(req.body);
    const existing = await storage.getUserByUsername(parsed.username);
    if (existing) {
      return res.status(400).json({ message: "ชื่อผู้ใช้นี้มีอยู่แล้ว" });
    }
    parsed.password = await hashPassword(parsed.password);
    const tenantId = currentUser.tenantId;
    if (tenantId) {
      parsed.tenantId = tenantId;
    }
    const user = await storage.createUser(parsed);
    const employeeId = req.body.employeeId;
    if (tenantId) {
      const tenantCompanyIds = (await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, tenantId))).map(c => c.id);
      if (tenantCompanyIds.length > 0) {
        if (employeeId) {
          await db.update(employees).set({ userId: user.id }).where(and(eq(employees.id, Number(employeeId)), isNull(employees.userId), inArray(employees.companyId, tenantCompanyIds)));
        } else {
          const fullName = (parsed.fullName || "").replace(/\s+/g, "");
          if (fullName) {
            const scopedEmployees = await db.select().from(employees).where(and(isNull(employees.userId), inArray(employees.companyId, tenantCompanyIds)));
            const match = scopedEmployees.find(e => (e.fullName || "").replace(/\s+/g, "") === fullName);
            if (match) {
              await db.update(employees).set({ userId: user.id }).where(eq(employees.id, match.id));
            }
          }
        }
      }
    } else {
      if (employeeId) {
        await db.update(employees).set({ userId: user.id }).where(and(eq(employees.id, Number(employeeId)), isNull(employees.userId)));
      }
    }
    const { password, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/users/:id", requireAuth, async (req, res) => {
  try {
    const currentUser = req.user as any;
    const isAdmin = currentUser.role === "admin" || currentUser.role === "super_admin";
    const isManager = currentUser.role === "manager";
    if (!isAdmin && !isManager) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    if (isManager && req.body.role) {
      const managerAllowedRoles = ["employee", "cashier"];
      if (!managerAllowedRoles.includes(req.body.role)) {
        return res.status(403).json({ message: "ผู้จัดการแก้ไขได้เฉพาะบัญชี 'พนักงาน' หรือ 'แคชเชียร์' เท่านั้น" });
      }
    }
    const tenantId = currentUser.tenantId;
    const userId = Number(req.params.id);
    if (tenantId) {
      const [targetUser] = await db.select({ id: users.id, tenantId: users.tenantId }).from(users).where(eq(users.id, userId)).limit(1);
      if (!targetUser || targetUser.tenantId !== tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขผู้ใช้นี้" });
      }
    }
    const ownerId = await getTenantOwnerAdminId(tenantId);
    if (ownerId === userId && currentUser.id !== userId) {
      if (req.body.role || req.body.active === false) {
        return res.status(403).json({ message: "ไม่สามารถเปลี่ยนสิทธิ์หรือระงับเจ้าของระบบ (Owner Admin) ได้" });
      }
    }
    const updateData: any = {};
    if (req.body.username) {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: "ชื่อผู้ใช้นี้มีอยู่แล้ว" });
      }
      updateData.username = req.body.username;
    }
    if (req.body.role) updateData.role = req.body.role;
    if (req.body.active !== undefined) updateData.active = req.body.active;
    if (req.body.fullName) updateData.fullName = req.body.fullName;
    if (req.body.email !== undefined) updateData.email = req.body.email;
    if (req.body.password) {
      const { hashPassword } = await import("../auth");
      updateData.password = await hashPassword(req.body.password);
    }
    if (req.body.lineId !== undefined) updateData.lineId = req.body.lineId;
    if (req.body.allowedCompanyIds !== undefined) updateData.allowedCompanyIds = req.body.allowedCompanyIds;
    const user = await storage.updateUser(userId, updateData);
    if (req.body.allowedCompanyIds !== undefined) {
      const { invalidateUserAllowedCache } = await import("../route-middleware");
      invalidateUserAllowedCache(userId);
    }
    if (!user) return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    if (req.body.employeeId !== undefined) {
      if (tenantId) {
        const tenantCompanyIds = (await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, tenantId))).map(c => c.id);
        if (tenantCompanyIds.length > 0) {
          await db.update(employees).set({ userId: null }).where(and(eq(employees.userId, userId), inArray(employees.companyId, tenantCompanyIds)));
          if (req.body.employeeId) {
            await db.update(employees).set({ userId: userId }).where(and(eq(employees.id, Number(req.body.employeeId)), isNull(employees.userId), inArray(employees.companyId, tenantCompanyIds)));
          }
        }
      } else {
        await db.update(employees).set({ userId: null }).where(eq(employees.userId, userId));
        if (req.body.employeeId) {
          await db.update(employees).set({ userId: userId }).where(and(eq(employees.id, Number(req.body.employeeId)), isNull(employees.userId)));
        }
      }
    }
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/users/:id/session-status", requireAuth, async (req, res) => {
  try {
    const currentUser = req.user as any;
    if (!["admin", "super_admin"].includes(currentUser.role)) {
      return res.status(403).json({ message: "เฉพาะผู้ดูแลระบบเท่านั้น" });
    }
    const targetUserId = Number(req.params.id);
    const result = await db.execute(sql`SELECT COUNT(*) as cnt FROM "session" WHERE (sess::jsonb->'passport'->>'user')::int = ${targetUserId}`);
    const count = Number((result as any).rows?.[0]?.cnt || 0);
    res.json({ online: count > 0, sessionCount: count });
  } catch (err: any) {
    console.error("[core-routes.ts GET /api/users/:id/session-status]", err);
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/users/:id/lock", requireAuth, async (req, res) => {
  try {
    const currentUser = req.user as any;
    if (!["admin", "super_admin"].includes(currentUser.role)) {
      return res.status(403).json({ message: "เฉพาะผู้ดูแลระบบเท่านั้น" });
    }
    const targetUserId = Number(req.params.id);
    if (targetUserId === currentUser.id) {
      return res.status(400).json({ message: "ไม่สามารถ lock ตัวเองได้" });
    }
    const tenantId = currentUser.tenantId;
    if (tenantId) {
      const [targetUser] = await db.select({ id: users.id, tenantId: users.tenantId }).from(users).where(eq(users.id, targetUserId)).limit(1);
      if (!targetUser || targetUser.tenantId !== tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์ lock ผู้ใช้นี้" });
      }
    }
    const ownerId = await getTenantOwnerAdminId(tenantId);
    if (ownerId === targetUserId) {
      return res.status(403).json({ message: "ไม่สามารถ lock เจ้าของระบบ (Owner Admin) ได้" });
    }
    const { lockUser } = await import("../utils/user-lock");
    const durationMs = req.body.durationMs || 5 * 60 * 1000;
    const sessionResult = await db.execute(sql`DELETE FROM "session" WHERE (sess::jsonb->'passport'->>'user')::int = ${targetUserId}`);
    const sessionsDestroyed = (sessionResult as any).rowCount || 0;
    const lock = lockUser(targetUserId, currentUser.id, currentUser.fullName || currentUser.username, durationMs);
    const [targetUser] = await db.select({ username: users.username, fullName: users.fullName }).from(users).where(eq(users.id, targetUserId)).limit(1);
    await logActivity(db, currentUser.id, currentUser.tenantId, null, "lock_user", `Lock user: ${targetUser?.fullName || targetUserId} for permission change (${sessionsDestroyed} sessions destroyed)`);
    res.json({ locked: true, expiresAt: lock.expiresAt, sessionsDestroyed });
  } catch (err: any) {
    console.error("[core-routes.ts POST /api/users/:id/lock]", err);
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/users/:id/unlock", requireAuth, async (req, res) => {
  try {
    const currentUser = req.user as any;
    if (!["admin", "super_admin"].includes(currentUser.role)) {
      return res.status(403).json({ message: "เฉพาะผู้ดูแลระบบเท่านั้น" });
    }
    const targetUserId = Number(req.params.id);
    const { unlockUser } = await import("../utils/user-lock");
    const wasLocked = unlockUser(targetUserId);
    if (wasLocked) {
      await logActivity(db, currentUser.id, currentUser.tenantId, null, "unlock_user", `Unlock user: userId=${targetUserId}`);
    }
    res.json({ unlocked: true, wasLocked });
  } catch (err: any) {
    console.error("[core-routes.ts POST /api/users/:id/unlock]", err);
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/my-role-modules", requireAuth, async (req, res) => {
  const user = req.user as any;
  try {
    const userSubPerms = await storage.getUserSubPermissions(user.id);
    const { SUB_MODULES } = await import("@shared/permissions");

    if (userSubPerms.length > 0) {
      const allowedSubKeys = new Set(userSubPerms.filter((p: any) => p.allowed).map((p: any) => p.subModuleKey));
      const modules = [...new Set(
        SUB_MODULES.filter(s => allowedSubKeys.has(s.key)).map(s => s.parentModule)
      )];
      // Only use personal sub-perms if they grant at least 1 module
      // Otherwise fall through to role-based (prevents managers with stale/empty sub-perms getting 0 modules)
      if (modules.length > 0) {
        const subModules = [...allowedSubKeys];
        return res.json({ modules, subModules });
      }
    }

    let perms = await storage.getRolePermissionsByRole(user.role);
    if (perms.length === 0) {
      await storage.initDefaultPermissions();
      perms = await storage.getRolePermissionsByRole(user.role);
    }
    const allowedModules = perms.filter((p: any) => p.allowed).map((p: any) => p.moduleKey);
    const subModules = SUB_MODULES.filter(s => allowedModules.includes(s.parentModule)).map(s => s.key);
    return res.json({ modules: allowedModules, subModules });
  } catch (e: any) {
    res.json({ modules: [], subModules: [] });
  }
});

app.get("/api/permissions", requireAuth, async (_req, res) => {
  const perms = await storage.getRolePermissions();
  if (perms.length === 0) {
    await storage.initDefaultPermissions();
    const initialized = await storage.getRolePermissions();
    return res.json(initialized);
  }
  res.json(perms);
});

app.get("/api/permissions/me", requireAuth, async (req, res) => {
  const user = req.user as any;
  const { PERMISSION_MODULES, PRIMARY_ONLY_MODULES, FIRM_ONLY_MODULES, SUB_MODULES, CONFIDENTIAL_SUB_MODULES, HR_PERSONAL_SUB_MODULES, HR_ADMIN_SUB_MODULES } = await import("@shared/permissions");
  const companyId = req.query.companyId ? Number(req.query.companyId) : null;

  let isPrimary = true;
  if (companyId) {
    const company = await storage.getCompany(companyId);
    if (company && company.tenantId === user.tenantId) {
      isPrimary = company.isPrimary === true;
    }
    // company null / wrong tenant → stays true (safe default: primary restrictions apply)
  }

  let tenantType = "general_business";
  if (user.tenantId) {
    const tenant = await storage.getTenant(user.tenantId);
    if (tenant) tenantType = tenant.tenantType;
  } else {
    const primaryCompany = await storage.getPrimaryCompany();
    tenantType = primaryCompany?.tenantType || "accounting_firm";
  }

  let allowedModules: string[];
  switch (user.role) {
    case "admin":
    case "super_admin":
      allowedModules = PERMISSION_MODULES.map(m => m.key);
      break;
    case "manager":
    case "accountant":
    case "employee":
    case "cashier":
    case "client":
    case "client_external": {
      let perms = await storage.getRolePermissionsByRole(user.role);
      if (perms.length === 0) {
        await storage.initDefaultPermissions();
        perms = await storage.getRolePermissionsByRole(user.role);
      }
      const { PERMISSION_MODULES } = await import("@shared/permissions");
      const expectedModuleKeys = PERMISSION_MODULES.filter(m => m.allowedRoles.includes(user.role as any)).map(m => m.key);
      const existingKeys = new Set(perms.map(p => p.moduleKey));
      const missingKeys = expectedModuleKeys.filter(k => !existingKeys.has(k));
      if (missingKeys.length > 0) {
        await storage.initDefaultPermissions();
        perms = await storage.getRolePermissionsByRole(user.role);
      }
      allowedModules = perms.filter(p => p.allowed).map(p => p.moduleKey);
      break;
    }
    default: {
      const errMsg = `[permissions/me] Unhandled role "${user.role}" for userId=${user.id}, tenantId=${user.tenantId} at module resolution`;
      console.error(errMsg);
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง — role ไม่รู้จัก", debug: errMsg });
    }
  }

  if (tenantType === "general_business") {
    allowedModules = allowedModules.filter(m => !FIRM_ONLY_MODULES.includes(m));
  }

  switch (user.role) {
    case "super_admin":
    case "admin":
      break;
    case "manager":
      allowedModules = allowedModules.filter(m => !["firm-mgmt", "etax-hub"].includes(m));
      break;
    case "accountant":
    case "employee":
    case "cashier":
      break;
    case "client":
    case "client_external":
      allowedModules = allowedModules.filter(m => ["etax-hub", "settings"].includes(m));
      break;
    default: {
      const errMsg = `[permissions/me] Unhandled role "${user.role}" for userId=${user.id}, tenantId=${user.tenantId} at role-specific module filter`;
      console.error(errMsg);
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง — role ไม่รู้จัก", debug: errMsg });
    }
  }

  if (!isPrimary) {
    const isAccountingFirm = tenantType === "accounting_firm";
    switch (user.role) {
      case "admin":
      case "super_admin":
        break;
      case "accountant": {
        const accountantExceptions = isAccountingFirm ? ["hr", "firm-mgmt", "settings"] : ["settings"];
        allowedModules = allowedModules.filter(m =>
          !PRIMARY_ONLY_MODULES.includes(m) || accountantExceptions.includes(m)
        );
        break;
      }
      case "manager": {
        const managerExceptions = isAccountingFirm ? ["hr", "settings"] : ["settings"];
        allowedModules = allowedModules.filter(m =>
          !PRIMARY_ONLY_MODULES.includes(m) || managerExceptions.includes(m)
        );
        break;
      }
      case "employee":
      case "cashier": {
        const empCashierExceptions = isAccountingFirm ? ["hr"] : [];
        allowedModules = allowedModules.filter(m =>
          !PRIMARY_ONLY_MODULES.includes(m) || empCashierExceptions.includes(m)
        );
        break;
      }
      case "client":
      case "client_external":
        allowedModules = allowedModules.filter(m => !PRIMARY_ONLY_MODULES.includes(m));
        break;
      default: {
        const errMsg = `[permissions/me] Unhandled role "${user.role}" for userId=${user.id}, tenantId=${user.tenantId} at primary-company filter`;
        console.error(errMsg);
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง — role ไม่รู้จัก", debug: errMsg });
      }
    }
  }

  const allRolePerms = (user.role === "admin" || user.role === "super_admin") ? [] : await storage.getRolePermissionsByRole(user.role);
  const roleDeniedSubKeys = new Set(
    allRolePerms.filter(p => !p.allowed && SUB_MODULES.some(s => s.key === p.moduleKey)).map(p => p.moduleKey)
  );

  let allowedSubModules: string[] = [];
  let userSubPerms: any[] = [];
  try {
    userSubPerms = await storage.getUserSubPermissions(user.id);
  } catch (e: any) {
    const errMsg = `[core-routes.ts GET /api/permissions/me] getUserSubPermissions failed for userId=${user.id}, role=${user.role}. Error: ${e?.message || e}`;
    console.error(errMsg);
    return res.status(500).json({ error: errMsg });
  }

  const isOwnerAdmin = user.role === "admin" && user.tenantId
    ? await (async () => {
        const [firstAdmin] = await db.select({ id: users.id }).from(users)
          .where(and(eq(users.tenantId, user.tenantId), eq(users.role, "admin"), eq(users.active, true)))
          .orderBy(users.id).limit(1);
        return firstAdmin?.id === user.id;
      })()
    : user.role === "admin" && !user.tenantId;

  switch (user.role) {
    case "admin":
    case "super_admin": {
      if (isOwnerAdmin || user.role === "super_admin") {
        allowedSubModules = SUB_MODULES.filter(s => allowedModules.includes(s.parentModule)).map(s => s.key);
      } else if (userSubPerms.length === 0) {
        allowedSubModules = [];
      } else {
        const allowedKeys = new Set(userSubPerms.filter(p => p.allowed).map(p => p.subModuleKey));
        allowedSubModules = SUB_MODULES
          .filter(s => allowedModules.includes(s.parentModule) && allowedKeys.has(s.key))
          .map(s => s.key);
      }
      break;
    }
    case "manager": {
      if (userSubPerms.length === 0) {
        allowedSubModules = SUB_MODULES
          .filter(s => allowedModules.includes(s.parentModule) && !roleDeniedSubKeys.has(s.key))
          .map(s => s.key);
      } else {
        const deniedKeys = new Set(userSubPerms.filter(p => !p.allowed).map(p => p.subModuleKey));
        allowedSubModules = SUB_MODULES
          .filter(s => allowedModules.includes(s.parentModule) && !roleDeniedSubKeys.has(s.key) && !deniedKeys.has(s.key))
          .map(s => s.key);
      }
      break;
    }
    case "accountant": {
      const isAccountantAtFirm = tenantType === "accounting_firm";
      const skipConfidentialForClientHr = isAccountantAtFirm && !isPrimary;
      if (userSubPerms.length === 0) {
        allowedSubModules = SUB_MODULES
          .filter(s => {
            if (!allowedModules.includes(s.parentModule)) return false;
            if (roleDeniedSubKeys.has(s.key)) return false;
            if (CONFIDENTIAL_SUB_MODULES.includes(s.key)) {
              if (skipConfidentialForClientHr && s.parentModule === "hr") return true;
              return false;
            }
            return true;
          })
          .map(s => s.key);
      } else {
        const deniedKeys = new Set(userSubPerms.filter(p => !p.allowed).map(p => p.subModuleKey));
        const grantedKeys = new Set(userSubPerms.filter(p => p.allowed).map(p => p.subModuleKey));
        allowedSubModules = SUB_MODULES
          .filter(s => {
            if (!allowedModules.includes(s.parentModule)) return false;
            if (roleDeniedSubKeys.has(s.key)) return false;
            if (deniedKeys.has(s.key)) return false;
            if (CONFIDENTIAL_SUB_MODULES.includes(s.key)) {
              if (skipConfidentialForClientHr && s.parentModule === "hr") return true;
              return grantedKeys.has(s.key);
            }
            return true;
          })
          .map(s => s.key);
      }
      break;
    }
    case "employee":
    case "cashier": {
      if (userSubPerms.length === 0) {
        allowedSubModules = [];
      } else {
        const allowedKeys = new Set(userSubPerms.filter(p => p.allowed).map(p => p.subModuleKey));
        allowedSubModules = SUB_MODULES
          .filter(s => allowedModules.includes(s.parentModule) && !roleDeniedSubKeys.has(s.key) && allowedKeys.has(s.key))
          .map(s => s.key);
      }
      break;
    }
    case "client":
    case "client_external": {
      if (userSubPerms.length === 0) {
        allowedSubModules = [];
      } else {
        const allowedKeys = new Set(userSubPerms.filter(p => p.allowed).map(p => p.subModuleKey));
        allowedSubModules = SUB_MODULES
          .filter(s => allowedModules.includes(s.parentModule) && allowedKeys.has(s.key))
          .map(s => s.key);
      }
      break;
    }
    default: {
      const errMsg = `[permissions/me] Unhandled role "${user.role}" for userId=${user.id}, tenantId=${user.tenantId} at sub-module resolution`;
      console.error(errMsg);
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง — role ไม่รู้จัก", debug: errMsg });
    }
  }

  switch (user.role) {
    case "admin":
    case "super_admin":
    case "manager":
      break;
    case "accountant":
    case "employee":
    case "cashier":
    case "client":
    case "client_external":
      if (tenantType === "accounting_firm") {
        if (isPrimary) {
          allowedSubModules = allowedSubModules.filter(k => !HR_ADMIN_SUB_MODULES.includes(k));
          if (user.role === "accountant") {
            allowedSubModules = allowedSubModules.filter(k =>
              !k.startsWith("settings/") || k === "settings/profile"
            );
          }
        } else if (user.role !== "cashier" && user.role !== "employee") {
          allowedSubModules = allowedSubModules.filter(k => !HR_PERSONAL_SUB_MODULES.includes(k));
        }
      }
      break;
    default: {
      const errMsg = `[permissions/me] Unhandled role "${user.role}" for userId=${user.id}, tenantId=${user.tenantId} at HR sub-module filter`;
      console.error(errMsg);
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง — role ไม่รู้จัก", debug: errMsg });
    }
  }

  if (user.role === "employee" && companyId) {
    try {
      const [gs] = await db.select().from(generalSettings).where(eq(generalSettings.companyId, companyId)).limit(1);
      if (gs?.hiddenEmployeeModules) {
        const hidden: string[] = JSON.parse(gs.hiddenEmployeeModules);
        if (Array.isArray(hidden) && hidden.length > 0) {
          allowedSubModules = allowedSubModules.filter(k => !hidden.includes(k));
        }
      }
    } catch {}
  }

  if (user.tenantId) {
    try {
      const { getEnabledModulesWithUserOverride } = await import("./route-middleware-extra");
      const enabledModules = await getEnabledModulesWithUserOverride(user.tenantId, user.id);
      if (enabledModules && enabledModules.length > 0) {
        const enabledSet = new Set(enabledModules);
        enabledSet.add("settings");
        allowedModules = allowedModules.filter(m => enabledSet.has(m));
      }
    } catch {}
  }

  res.json({ modules: allowedModules, subModules: allowedSubModules });
});

app.put("/api/permissions", requireAuth, requireRole("admin", "super_admin", "manager"), async (req, res) => {
  try {
    const { role, moduleKey, allowed } = req.body;
    if (!role || !moduleKey || typeof allowed !== "boolean") {
      return res.status(400).json({ message: "กรุณาระบุ role, moduleKey, allowed" });
    }
    if (role === "admin") {
      return res.status(400).json({ message: "ไม่สามารถแก้ไขสิทธิ์ของผู้ดูแลระบบได้" });
    }
    const result = await storage.setRolePermission(role, moduleKey, allowed);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/permissions/users/:id/submodules", requireAuth, requireRole("admin", "super_admin", "manager"), async (req, res) => {
  const userId = Number(req.params.id);
  const perms = await storage.getUserSubPermissions(userId);
  res.json(perms);
});

app.put("/api/permissions/users/:id/submodules", requireAuth, requireRole("admin", "super_admin", "manager"), async (req, res) => {
  try {
    const currentUser = req.user as any;
    const userId = Number(req.params.id);
    const ownerId = await getTenantOwnerAdminId(currentUser.tenantId);
    if (ownerId === userId && currentUser.id !== userId) {
      return res.status(403).json({ message: "ไม่สามารถเปลี่ยนสิทธิ์เมนูย่อยของเจ้าของระบบ (Owner Admin) ได้" });
    }
    const { permissions } = req.body;
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ message: "กรุณาระบุ permissions เป็น array" });
    }
    await storage.bulkSetUserSubPermissions(userId, permissions);
    res.json({ message: "บันทึกสิทธิ์เมนูย่อยสำเร็จ" });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/companies", requireAuth, async (req, res) => {
  const user = req.user as any;

  let isAccountingFirm = false;
  if (user.tenantId) {
    const [tenant] = await db.select({ tenantType: tenants.tenantType }).from(tenants).where(eq(tenants.id, user.tenantId));
    isAccountingFirm = tenant?.tenantType === "accounting_firm";
  }

  const conditions: any[] = [eq(companies.active, true)];
  if (user.tenantId) {
    conditions.push(eq(companies.tenantId, user.tenantId));
  }

  const { getUserAllowedCompanyIds } = await import("../route-middleware");
  const userAllowedIds = await getUserAllowedCompanyIds(user.id);
  const hasAllowedRestriction = userAllowedIds && userAllowedIds.length > 0;

  if ((user.role === "superadmin" || user.role === "admin") && !hasAllowedRestriction) {
    if (isAccountingFirm) {
      const activeFcCompanyIds = await db.select({ companyId: firmClients.companyId })
        .from(firmClients)
        .innerJoin(companies, eq(firmClients.companyId, companies.id))
        .where(and(eq(companies.tenantId, user.tenantId), eq(firmClients.status, "active")));
      const fcIds = activeFcCompanyIds.map(r => r.companyId).filter(Boolean) as number[];
      const result = await db.select().from(companies)
        .where(and(...conditions, or(eq(companies.isPrimary, true), fcIds.length > 0 ? inArray(companies.id, fcIds) : sql`false`)))
        .orderBy(desc(companies.isPrimary), companies.name);
      res.json(result);
    } else {
      const result = await db.select().from(companies)
        .where(and(...conditions))
        .orderBy(desc(companies.isPrimary), companies.name);
      res.json(result);
    }
  } else {
    const companiesList = await storage.getCompaniesForUser(user.id, user.tenantId, user.role);
    res.json(companiesList);
  }
});

app.get("/api/companies/primary", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;
    if (!tenantId) {
      const comp = await db.select().from(companies).where(eq(companies.isPrimary, true)).limit(1);
      return res.json(comp[0] || null);
    }
    const comp = await db.select().from(companies)
      .where(and(eq(companies.tenantId, tenantId), eq(companies.isPrimary, true)))
      .limit(1);
    if (comp[0]) return res.json(comp[0]);
    const fallback = await db.select().from(companies)
      .where(and(eq(companies.tenantId, tenantId), eq(companies.active, true)))
      .orderBy(companies.id)
      .limit(1);
    return res.json(fallback[0] || null);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/companies", requireAuth, async (req, res) => {
  try {
    const currentUser = req.user as any;
    if (currentUser.tenantId) {
      const limitCheck = await storage.checkTenantLimit(currentUser.tenantId, "companies");
      if (!limitCheck.allowed) {
        return res.status(403).json({ message: `แพ็คเกจ ${limitCheck.planName} รองรับบริษัทสูงสุด ${limitCheck.limit} บริษัท (มีแล้ว ${limitCheck.current}) กรุณาอัพเกรดแพ็คเกจ` });
      }
    }
    const parsed = insertCompanySchema.parse(req.body);
    if (currentUser.tenantId && !parsed.tenantId) {
      parsed.tenantId = currentUser.tenantId;
    }
    const company = await storage.createCompany(parsed);

    // Auto-seed extra accounts based on businessType
    if (parsed.businessType) {
      try {
        const { ECOMMERCE_EXTRA_ACCOUNTS, ACCOUNTING_FIRM_EXTRA_ACCOUNTS } = await import("@shared/chart-of-accounts");
        const bt = parsed.businessType;
        let extraAccounts: typeof ECOMMERCE_EXTRA_ACCOUNTS = [];
        if (bt === "online_shop" || bt === "ecommerce") {
          extraAccounts = ECOMMERCE_EXTRA_ACCOUNTS;
        } else if (bt === "accounting" || bt === "accounting_firm" || bt === "service") {
          extraAccounts = ACCOUNTING_FIRM_EXTRA_ACCOUNTS;
        }
        if (extraAccounts.length > 0) {
          const existingAccounts = await db.select().from(accounts).where(eq(accounts.companyId, company.id));
          const existingByCode = new Map(existingAccounts.map(a => [a.code, a]));
          const parentCodes = new Set(extraAccounts.map(a => a.parentCode).filter(Boolean));
          for (const tmpl of extraAccounts) {
            if (!existingByCode.has(tmpl.code)) {
              const hasChildren = parentCodes.has(tmpl.code);
              try {
                await db.insert(accounts).values({
                  companyId: company.id, code: tmpl.code, name: tmpl.name,
                  nameTh: tmpl.nameTh, nameZh: tmpl.nameZh, type: tmpl.type,
                  parentCode: tmpl.parentCode, isHeader: hasChildren,
                });
              } catch (e: any) { /* skip if duplicate */ }
            }
          }
          // Fix isHeader flags
          const refreshed = await db.select().from(accounts).where(eq(accounts.companyId, company.id));
          const usedParents = new Set(refreshed.map(a => a.parentCode).filter(Boolean));
          for (const acc of refreshed) {
            const shouldBeHeader = usedParents.has(acc.code);
            if (acc.isHeader !== shouldBeHeader) {
              await db.update(accounts).set({ isHeader: shouldBeHeader }).where(eq(accounts.id, acc.id));
            }
          }
        }
      } catch (e: any) { console.log("Auto-seed accounts:", e.message); }
    }

    try {
      await db.insert(branches).values({ companyId: company.id, code: "00000", name: "สำนักงานใหญ่", active: true });
    } catch (e: any) { /* skip if already exists */ }

    res.status(201).json(company);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ message: err.errors[0].message });
    }
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/companies/:id", requireAuth, async (req, res) => {
  const user = req.user as any;
  const id = Number(req.params.id);
  if (user.role === "client") {
    const { getUserAllowedCompanyIds } = await import("../route-middleware");
    const allowed = await getUserAllowedCompanyIds(user.id);
    if (!allowed || !allowed.includes(id)) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
  }
  const company = await storage.getCompany(id);
  if (!company) return res.status(404).json({ message: "ไม่พบบริษัท" });
  if (user.tenantId && company.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
  res.json(company);
});

app.patch("/api/companies/:id", requireAuth, async (req, res) => {
  try {
  const companyId = Number(req.params.id);
  const user = req.user as any;
  const existing = await storage.getCompany(companyId);
  if (!existing) return res.status(404).json({ message: "ไม่พบบริษัท" });
  if (user.role !== "super_admin" && user.tenantId && existing.tenantId !== user.tenantId) {
    return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบริษัทนี้" });
  }
  const company = await storage.updateCompany(companyId, req.body);
  if (!company) return res.status(404).json({ message: "ไม่พบบริษัท" });

  // Auto-merge + cleanup accounts when businessType changes
  if (req.body.businessType) {
    try {
      const {
        ECOMMERCE_EXTRA_ACCOUNTS,
        ACCOUNTING_FIRM_EXTRA_ACCOUNTS,
        GAS_STATION_EXTRA_ACCOUNTS,
        RESTAURANT_EXTRA_ACCOUNTS,
      } = await import("@shared/chart-of-accounts");

      const bt = req.body.businessType;

      // Map each template key → its extra account codes
      const templateExtraMap: Record<string, Set<string>> = {
        ecommerce:        new Set(ECOMMERCE_EXTRA_ACCOUNTS.map(a => a.code)),
        online_shop:      new Set(ECOMMERCE_EXTRA_ACCOUNTS.map(a => a.code)),
        accounting_firm:  new Set(ACCOUNTING_FIRM_EXTRA_ACCOUNTS.map(a => a.code)),
        accounting:       new Set(ACCOUNTING_FIRM_EXTRA_ACCOUNTS.map(a => a.code)),
        service:          new Set(ACCOUNTING_FIRM_EXTRA_ACCOUNTS.map(a => a.code)),
        gas_station:      new Set(GAS_STATION_EXTRA_ACCOUNTS.map(a => a.code)),
        restaurant:       new Set(RESTAURANT_EXTRA_ACCOUNTS.map(a => a.code)),
      };

      // Codes that belong to the NEW template (keep these)
      const keepCodes = templateExtraMap[bt] ?? new Set<string>();

      // Codes that belong to OTHER templates (candidates for cleanup)
      const otherTemplateCodes = new Set<string>();
      for (const [key, codeSet] of Object.entries(templateExtraMap)) {
        if (key !== bt) {
          for (const code of codeSet) {
            if (!keepCodes.has(code)) otherTemplateCodes.add(code);
          }
        }
      }

      // --- STEP 1: Merge new template accounts ---
      const newExtraList = bt === "online_shop" || bt === "ecommerce"   ? ECOMMERCE_EXTRA_ACCOUNTS
                         : bt === "accounting_firm" || bt === "accounting" || bt === "service" ? ACCOUNTING_FIRM_EXTRA_ACCOUNTS
                         : bt === "gas_station"    ? GAS_STATION_EXTRA_ACCOUNTS
                         : bt === "restaurant"     ? RESTAURANT_EXTRA_ACCOUNTS
                         : [];

      const existingAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
      const existingByCode = new Map(existingAccounts.map(a => [a.code, a]));
      const newParentCodes = new Set(newExtraList.map(a => a.parentCode).filter(Boolean));

      for (const tmpl of newExtraList) {
        const existing = existingByCode.get(tmpl.code);
        if (!existing) {
          try {
            await db.insert(accounts).values({
              companyId, code: tmpl.code, name: tmpl.name,
              nameTh: tmpl.nameTh, nameZh: tmpl.nameZh,
              type: tmpl.type, parentCode: tmpl.parentCode,
              isHeader: newParentCodes.has(tmpl.code),
            });
          } catch { /* skip duplicate */ }
        }
      }

      // --- STEP 2: Cleanup accounts from other templates (only if unused) ---
      if (otherTemplateCodes.size > 0) {
        const staleAccounts = existingAccounts.filter(a => otherTemplateCodes.has(a.code));
        if (staleAccounts.length > 0) {
          const staleIds = staleAccounts.map(a => a.id);
          // Check which stale accounts have been used in journal lines
          const usedRows = await db.select({ accountId: journalLines.accountId })
            .from(journalLines)
            .where(inArray(journalLines.accountId, staleIds));
          const usedAccountIds = new Set(usedRows.map(r => r.accountId));
          const toDelete = staleAccounts.filter(a => !usedAccountIds.has(a.id));
          if (toDelete.length > 0) {
            await db.delete(accounts).where(inArray(accounts.id, toDelete.map(a => a.id)));
            console.log(`[businessType cleanup] deleted ${toDelete.length} stale accounts for company ${companyId}`);
          }
        }
      }

      // --- STEP 3: Fix isHeader flags ---
      const refreshed = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
      const usedParents = new Set(refreshed.map(a => a.parentCode).filter(Boolean));
      for (const acc of refreshed) {
        const shouldBeHeader = usedParents.has(acc.code);
        if (acc.isHeader !== shouldBeHeader) {
          await db.update(accounts).set({ isHeader: shouldBeHeader }).where(eq(accounts.id, acc.id));
        }
      }
    } catch (e: any) {
      console.log("Auto-merge/cleanup accounts for businessType change:", e.message);
    }
  }

  res.json(company);
  } catch (e: any) {
    console.error("PATCH /api/companies/:id error:", e.message);
    res.status(500).json({ message: "บันทึกไม่สำเร็จ: " + e.message });
  }
});

app.patch("/api/companies/:id/gps-settings", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    if (user.role !== "admin" && user.role !== "owner" && user.role !== "super_admin") {
      return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขตั้งค่า GPS" });
    }
    const companyId = Number(req.params.id);
    const { gpsRequired, officeLat, officeLng, gpsRadiusMeters } = req.body;
    if (gpsRequired && (!officeLat || !officeLng)) {
      const locations = await db.select().from(workLocations).where(and(eq(workLocations.companyId, companyId), eq(workLocations.active, true)));
      if (locations.length === 0) {
        return res.status(400).json({ message: "กรุณาระบุพิกัดสำนักงาน (ละติจูด/ลองจิจูด) หรือเพิ่มสาขาที่มีพิกัดก่อนเปิดใช้งาน GPS" });
      }
    }
    const updateData: any = {};
    if (gpsRequired !== undefined) updateData.gpsRequired = gpsRequired;
    if (officeLat !== undefined) updateData.officeLat = officeLat != null ? String(officeLat) : null;
    if (officeLng !== undefined) updateData.officeLng = officeLng != null ? String(officeLng) : null;
    if (gpsRadiusMeters !== undefined) updateData.gpsRadiusMeters = gpsRadiusMeters;
    const [updated] = await db.update(companies).set(updateData).where(eq(companies.id, companyId)).returning();
    if (!updated) return res.status(404).json({ message: "ไม่พบบริษัท" });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/companies/:id/set-primary", requireAuth, async (req, res) => {
  const user = req.user as any;
  if (user.role !== "admin" && user.role !== "manager") {
    return res.status(403).json({ message: "ไม่มีสิทธิ์ตั้งบริษัทหลัก" });
  }
  const id = Number(req.params.id);
  try {
    await storage.setCompanyPrimary(id);
    const company = await storage.getCompany(id);
    res.json(company);
  } catch (err: any) {
    res.status(404).json({ message: err.message });
  }
});

// HR routes registered via registerHrRoutes(app)
// ==================== Task Management Routes ====================

}
