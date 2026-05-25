/**
 * migrations-runner.ts
 *
 * SINGLE PLACE for all schema migration calls.
 * Replaces the migration calls that were previously scattered in products-routes.ts.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  HOW TO DEPLOY A MIGRATION TO PRODUCTION                     ║
 * ║  (follows Rule 2 / 10-step procedure in replit.md)          ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  1. Ensure migration function exists in schema-extra.ts      ║
 * ║  2. Add a commented-out line below with the function + tag   ║
 * ║  3. Get พี่ช้าง approval (pending-push-queue.md entry)       ║
 * ║  4. Uncomment ONLY the approved migration line               ║
 * ║  5. Push this file + schema-extra.ts to prod together        ║
 * ║  6. พี่ช้าง: pm2 stop → pull → npm install → pm2 start      ║
 * ║  7. Verify flag set in system_config + table structure ok    ║
 * ║  8. Re-comment the line (or leave — flag prevents re-run)    ║
 * ║  9. Update pending-push-queue.md + schema-history.md         ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * RULES:
 * - NEVER push this file with a migration uncommented unless
 *   it has an entry in db/pending-push-queue.md AND พี่ช้าง approved.
 * - ALL migrations use system_config flags — they are idempotent (safe to run again).
 * - Migrations run fire-and-forget at server startup. Server never crashes if one fails.
 * - ⛔ NO "IF NOT EXISTS" fallback in ALTER TABLE — ever.
 *   Rule 0a (replit.md): migration code must reflect confirmed fact from Step 1 VERIFY FIRST.
 *   You verified the column does NOT exist → write plain ALTER TABLE without IF NOT EXISTS.
 *   IF NOT EXISTS = silent fallback = hiding mistakes = forbidden.
 *   Seen violated: ENTRY #015 (payment_type), ENTRY #017 (warehouse_id) — พี่ช้าง 2026-05-25.
 */

import { db } from "./db";
import {
  runMaterialIssueMigration,
  runProductionFinishMigration,
  runNcrMigration,
  runLotLowStockThresholdMigration,
  runWarehouseColumnsForMfgMigration,
  runBomProcessStepsMigration,
  runWipWarehouseMigration,
  runPaymentTypeColumnMigration,
  runRdVatCacheMigration,
  runStockMovementWarehouseMigration,
} from "@shared/schema-extra";

function run(name: string, fn: (db: any) => Promise<void>) {
  fn(db).catch((err: any) => {
    console.error(`[migration] ❌ ${name} failed:`, err.message);
  });
}

export function runPendingMigrations() {
  // ── APPROVED & ACTIVE ──────────────────────────────────────────────────────
  // Uncomment a line only after พี่ช้าง approves the push session.
  // Each function checks its own system_config flag — re-running is safe.
  // ──────────────────────────────────────────────────────────────────────────

  run("runMaterialIssueMigration",            runMaterialIssueMigration);           // N3  ✅ done 2026-05-20
  // run("runPaymentTypeColumnMigration",     runPaymentTypeColumnMigration);       // N4b ✅ done 2026-05-22 09:11 BKK — flag set (column already existed, migration set flag only)
  // run("runStockMovementWarehouseMigration",runStockMovementWarehouseMigration);  // N16 ✅ done 2026-05-25 20:41 BKK — warehouse_id added to stock_movements, flag set
  // run("runRdVatCacheMigration",            runRdVatCacheMigration);              // N15 ✅ done 2026-05-22 — tables+flag already existed before this session

  // ── N11 — DEPLOYED 2026-05-21 — all 6 flags SET, 3 columns confirmed in prod ─
  // run("runProductionFinishMigration",      runProductionFinishMigration);        // N11 ✅ done 2026-05-21
  // run("runNcrMigration",                   runNcrMigration);                     // N11 ✅ done 2026-05-21
  // run("runLotLowStockThresholdMigration",  runLotLowStockThresholdMigration);    // N11 ✅ done 2026-05-21
  // run("runWarehouseColumnsForMfgMigration",runWarehouseColumnsForMfgMigration);  // N11 ✅ done 2026-05-21
  // run("runBomProcessStepsMigration",       runBomProcessStepsMigration);         // N11 ✅ done 2026-05-21
  // run("runWipWarehouseMigration",          runWipWarehouseMigration);            // N11 ✅ done 2026-05-21
}
