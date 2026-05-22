/**
 * index-extra.ts
 * Called AFTER index.ts starts — same pattern as schema-extra.ts extends schema.ts.
 * Registers override routes before the protected core-routes handlers.
 * Express first-match-wins: register here BEFORE registerCoreRoutes in routes.ts.
 */

import type { Express } from "express";
import { requireAuth, getEnabledModulesForTenant } from "./route-middleware";
import { db } from "./db";
import { userSubPermissions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { SUB_MODULES } from "@shared/permissions";
import { runPendingMigrations } from "./migrations-runner";
import { isBootstrapped } from "./config-bootstrap";

// Wait for config bootstrap (DB URL from config DB) before running migrations.
// Root cause documented 2026-05-22: production does not have DATABASE_URL env var —
// DB URL comes from config bootstrap (reinitializeFromConfig in index.ts line 1191).
// routes register → runPendingMigrations() → db.execute() fail (empty pool) → silent try/catch → flag never set.
// All previous migrations appeared to work only because their flags were already set before
// migrations-runner.ts existed — SELECT fail → catch → return (flag already set → no one noticed).
// N4b was the first truly new migration → failure became visible.
// Fix: poll isBootstrapped() before running — explicit, logged, 30s timeout.
function runMigrationsAfterBootstrap(attempt = 1): void {
  if (isBootstrapped()) {
    console.log(`[migration] DB ready (attempt ${attempt}) — running pending migrations`);
    runPendingMigrations();
    return;
  }
  if (attempt >= 60) {
    console.error("[migration] ❌ DB bootstrap timed out after 30s — migrations NOT run this startup");
    return;
  }
  setTimeout(() => runMigrationsAfterBootstrap(attempt + 1), 500);
}

export function registerIndexExtraRoutes(app: Express) {
  // Run all approved pending migrations AFTER config bootstrap completes (db ready)
  // To enable/disable individual migrations: edit server/migrations-runner.ts
  setTimeout(() => runMigrationsAfterBootstrap(1), 500);
  /**
   * Override /api/permissions/me — runs BEFORE the protected version in core-routes.ts.
   * Returns modules that include any module the user has explicit sub-permissions for,
   * regardless of what the tenant subscription plan enables.
   * This is the bypass for employees (e.g. นุช) who have inventory sub-perms
   * but whose tenant plan does not list inventory in enabledModules.
   */
  app.get("/api/permissions/me-extra", requireAuth, async (req: any, res) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    try {
      // 1. Get all modules user has explicit sub-permissions for
      const userPerms = await db
        .select({ subModuleKey: userSubPermissions.subModuleKey, allowed: userSubPermissions.allowed })
        .from(userSubPermissions)
        .where(eq(userSubPermissions.userId, user.id));

      const subPermModules = new Set<string>();
      userPerms
        .filter((p) => p.allowed)
        .forEach((p) => {
          const subMod = SUB_MODULES.find((s) => s.key === p.subModuleKey);
          if (subMod) subPermModules.add(subMod.parentModule);
        });

      // 2. Get tenant plan modules
      let planModules: string[] | null = null;
      if (user.tenantId) {
        planModules = await getEnabledModulesForTenant(user.tenantId);
      }

      // 3. Merge: plan modules + sub-perm unlocked modules
      let mergedModules: string[];
      if (planModules && planModules.length > 0) {
        const mergedSet = new Set([...planModules, ...subPermModules]);
        mergedSet.add("settings");
        mergedModules = Array.from(mergedSet);
      } else {
        mergedModules = subPermModules.size > 0 ? Array.from(subPermModules) : [];
      }

      // 4. Get sub-modules allowed for user
      const subModules = userPerms
        .filter((p) => p.allowed)
        .map((p) => p.subModuleKey);

      res.json({ modules: mergedModules, subModules });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
