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

  run("runMaterialIssueMigration",            runMaterialIssueMigration);           // N3  ✅ approved 2026-05-20

  // ── PENDING — awaiting push session approval ───────────────────────────────
  // run("runProductionFinishMigration",      runProductionFinishMigration);        // N11 ⏳ awaiting push approval
  // run("runNcrMigration",                   runNcrMigration);                     // N11 ⏳ awaiting push approval
  // run("runLotLowStockThresholdMigration",  runLotLowStockThresholdMigration);    // N11 ⏳ awaiting push approval
  // run("runWarehouseColumnsForMfgMigration",runWarehouseColumnsForMfgMigration);  // N11 ⏳ awaiting push approval
  // run("runBomProcessStepsMigration",       runBomProcessStepsMigration);         // N11 ⏳ awaiting push approval
  // run("runWipWarehouseMigration",          runWipWarehouseMigration);            // N11 ⏳ awaiting push approval
}
