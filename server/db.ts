import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import { getConfig, isBootstrapped } from "./config-bootstrap";

let _downSince: number | null = null;
let _healthLogAvailable: boolean | null = null;

async function appendDbHealthLog(
  eventType: string,
  details: {
    consecutiveFailures?: number;
    cumulativeFailures?: number;
    downSeconds?: number;
    recoveryMethod?: string;
    errorMessage?: string;
    databaseLabel?: string;
    notes?: string;
  } = {}
): Promise<void> {
  try {
    const configUrl = getConfigDbUrl();
    if (!configUrl) return;

    if (_healthLogAvailable === null) {
      const checkPool = new pg.Pool({ connectionString: configUrl, max: 1, connectionTimeoutMillis: 3000 });
      try {
        const check = await checkPool.query("SELECT to_regclass('public.db_health_events') AS tbl");
        _healthLogAvailable = !!check.rows[0]?.tbl;
        if (!_healthLogAvailable) {
          console.log("[DB Health] db_health_events table not found in config DB — logging to file only");
        }
      } catch { _healthLogAvailable = false; }
      finally { await checkPool.end().catch(() => {}); }
    }

    if (_healthLogAvailable) {
      const logPool = new pg.Pool({ connectionString: configUrl, max: 1, connectionTimeoutMillis: 3000 });
      try {
        await logPool.query(
          `INSERT INTO db_health_events (event_type, consecutive_failures, cumulative_failures, down_seconds, recovery_method, error_message, database_label, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            eventType,
            details.consecutiveFailures || 0,
            details.cumulativeFailures || 0,
            details.downSeconds || 0,
            details.recoveryMethod || null,
            details.errorMessage ? details.errorMessage.slice(0, 500) : null,
            details.databaseLabel || null,
            details.notes || null,
          ]
        );
      } catch (dbErr: any) {
        console.warn(`[DB Health] Failed to write to config DB: ${dbErr.message}`);
      } finally { await logPool.end().catch(() => {}); }
    }

    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, "db-health.log");
    const timestamp = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const parts = [`[${timestamp}] ${eventType}`];
    for (const [k, v] of Object.entries(details)) {
      if (v !== undefined && v !== null) parts.push(`${k}=${v}`);
    }
    fs.appendFileSync(logFile, parts.join(" | ") + "\n");
  } catch {}
}

function appendLanLog(message: string) {
  try {
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, "lan-probe.log");
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  } catch {}
}

let _lastAlertSent = 0;
async function sendSysadminAlert(eventType: string, errorMessage: string, databaseLabel: string): Promise<void> {
  try {
    const now = Date.now();
    if (now - _lastAlertSent < 300_000) return;
    _lastAlertSent = now;

    const configUrl = getConfigDbUrl();
    if (!configUrl) return;

    const alertPool = new pg.Pool({ connectionString: configUrl, max: 1, connectionTimeoutMillis: 3000 });
    try {
      const machineName = process.env.MACHINE_NAME || "";
      let sysadminEmail: string | null = null;
      let sysadminLineId: string | null = null;
      if (machineName) {
        const machineRes = await alertPool.query(
          `SELECT sysadmin_email, sysadmin_line_id FROM machines WHERE fqdn = $1 OR domain_name = $1 OR local_name = $1 LIMIT 1`,
          [machineName]
        );
        if (machineRes.rows[0]) {
          sysadminEmail = machineRes.rows[0].sysadmin_email;
          sysadminLineId = machineRes.rows[0].sysadmin_line_id;
        }
      }
      if (!sysadminEmail && !sysadminLineId) return;

      const timestamp = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
      const subject = `⚠ DB Alert: ${eventType} — ${machineName || "unknown"}`;
      const body = `เวลา: ${timestamp}\nเครื่อง: ${machineName || "unknown"}\nDB: ${databaseLabel}\nเหตุการณ์: ${eventType}\nError: ${errorMessage}`;

      if (sysadminEmail) {
        const resendKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@etax.app";
        if (resendKey) {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: fromEmail, to: [sysadminEmail], subject, text: body }),
          });
          if (emailRes.ok) console.log(`[DB Health] Alert email sent to ${sysadminEmail}`);
          else console.warn(`[DB Health] Email failed: ${emailRes.status}`);
        }
      }

      if (sysadminLineId) {
        const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (lineToken) {
          const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: { "Authorization": `Bearer ${lineToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ to: sysadminLineId, messages: [{ type: "text", text: `${subject}\n\n${body}` }] }),
          });
          if (lineRes.ok) console.log(`[DB Health] LINE alert sent to ${sysadminLineId}`);
          else console.warn(`[DB Health] LINE failed: ${lineRes.status}`);
        }
      }
    } finally { await alertPool.end().catch(() => {}); }
  } catch (alertErr: any) {
    console.warn(`[DB Health] Alert send failed: ${alertErr.message}`);
  }
}

async function probeLanConnection(lanUrl: string, timeoutMs: number = 5000): Promise<boolean> {
  const client = new pg.Client({
    connectionString: lanUrl,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs,
  });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 AS ok");
    await client.end();
    return res.rows[0]?.ok === 1;
  } catch (err: any) {
    try { await client.end(); } catch {}
    return false;
  }
}

const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (val: string) => val);

const DEV_DB_CHOICE_FILE = path.join(process.cwd(), ".dev-db-choice");

function isReplit(): boolean {
  return !!(process.env.REPL_ID || process.env.REPL_SLUG || process.env.REPLIT_DOMAINS);
}

function getActiveDbUrl(): { url: string; label: string; target: "usa" | "thailand" } | null {
  if (process.env.NODE_ENV === "production") {
    if (!isReplit() && process.env.DATABASE_URL) {
      const dbMainHost = process.env.DB_MAIN_HOST || "";
      const label = dbMainHost
        ? `Production → ${dbMainHost}`
        : (getConfig("DB_PROD_LABEL") || process.env.DB_PROD_LABEL || "Production");
      return { url: process.env.DATABASE_URL, label, target: "thailand" };
    }
    const prodUrl = getConfig("DB_PROD_URL") || process.env.DB_PROD_URL || getConfig("DB_MAIN_URL");
    const dbMainHost = process.env.DB_MAIN_HOST || "";
    const prodLabel = dbMainHost
      ? `Production → ${dbMainHost}`
      : (getConfig("DB_PROD_LABEL") || process.env.DB_PROD_LABEL || "Production (Thailand)");
    if (prodUrl) {
      return { url: prodUrl, label: prodLabel, target: "thailand" };
    }
    if (process.env.DATABASE_URL) {
      return { url: process.env.DATABASE_URL, label: "Replit (Production)", target: "usa" };
    }
    return null;
  }

  try {
    if (fs.existsSync(DEV_DB_CHOICE_FILE)) {
      const choice = fs.readFileSync(DEV_DB_CHOICE_FILE, "utf-8").trim();
      if (choice === "thailand") {
        const mainUrl = getConfig("DB_MAIN_URL");
        const mainLabel = getConfig("DB_MAIN_LABEL") || "Thailand (Dev)";
        if (mainUrl) {
          return { url: mainUrl, label: mainLabel, target: "thailand" };
        }
      }
    }
  } catch {}

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set for development mode");
  }
  return { url: process.env.DATABASE_URL, label: "Replit (Dev/US)", target: "usa" };
}

let activeDb = getActiveDbUrl() || { url: "", label: "Pending config bootstrap", target: "thailand" as const };
const isProduction = process.env.NODE_ENV === "production";
console.log(`[DB] Active database: ${activeDb.label} (target: ${activeDb.target}), production: ${isProduction}`);
let _pool = new pg.Pool({
  connectionString: activeDb.url,
  max: isProduction ? 25 : 20,
  min: isProduction ? 3 : 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: isProduction ? 20000 : 10000,
  statement_timeout: 30000,
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

_pool.on("error", (err) => {
  console.error("[DB Pool] Unexpected error on idle client:", err.message);
});

async function warmupPool(pool: pg.Pool, label: string): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log(`[DB Pool] ✓ Warmup OK — ${label}`);
  } catch (err: any) {
    console.warn(`[DB Pool] Warmup failed (will retry via heartbeat) — ${label}: ${err.message}`);
  }
}

warmupPool(_pool, activeDb.label);

if (isProduction) {
  let consecutiveFailures = 0;
  let cumulativeFailures = 0;
  setInterval(async () => {
    try {
      const client = await _pool.connect();
      await client.query("SELECT 1");
      client.release();
      if (consecutiveFailures > 0) {
        const downSec = _downSince ? Math.round((Date.now() - _downSince) / 1000) : 0;
        console.log(`[DB Pool] Connection recovered after ${consecutiveFailures} failures`);
        appendDbHealthLog("RECOVERED", {
          consecutiveFailures,
          cumulativeFailures,
          downSeconds: downSec,
          databaseLabel: activeDb.label,
        }).catch(() => {});
      }
      if (_recoveryMode) {
        const downSec = _downSince ? Math.round((Date.now() - _downSince) / 1000) : 0;
        _recoveryMode = false;
        _downSince = null;
        console.log("[DB Pool] ✓ Auto-recovered from Recovery Mode — database is reachable again");
        appendDbHealthLog("RECOVERY_MODE_EXIT", { downSeconds: downSec, recoveryMethod: "auto" }).catch(() => {});
      }
      consecutiveFailures = 0;
      cumulativeFailures = 0;
    } catch (err: any) {
      consecutiveFailures++;
      cumulativeFailures++;
      if (consecutiveFailures === 1) {
        _downSince = Date.now();
        appendDbHealthLog("FIRST_FAILURE", { errorMessage: err.message, databaseLabel: activeDb.label }).catch(() => {});
      }
      console.error(`[DB Pool] Keepalive failed (${consecutiveFailures}x, ${cumulativeFailures} cumulative): ${err.message}`);
      if (!_recoveryMode && consecutiveFailures >= 2) {
        _recoveryMode = true;
        console.warn("[DB Pool] ⚠ Entering Recovery Mode — database unreachable");
        appendDbHealthLog("RECOVERY_MODE_ENTER", {
          consecutiveFailures,
          errorMessage: err.message,
          databaseLabel: activeDb.label,
        }).catch(() => {});
        sendSysadminAlert("RECOVERY_MODE_ENTER", err.message, activeDb.label).catch(() => {});
      }
      if (cumulativeFailures >= 60) {
        const downSec = _downSince ? Math.round((Date.now() - _downSince) / 1000) : 0;
        await appendDbHealthLog("FORCE_RESTART", {
          cumulativeFailures,
          downSeconds: downSec,
          databaseLabel: activeDb.label,
        });
        console.error("[DB Pool] 60 cumulative failures — forcing server restart");
        await sendSysadminAlert("FORCE_RESTART", `${cumulativeFailures} cumulative failures — server restarting`, activeDb.label).catch(() => {});
        process.exit(1);
      }
      if (consecutiveFailures >= 2) {
        console.warn(`[DB Pool] ${consecutiveFailures} consecutive failures — recycling pool...`);
        try {
          const oldPool = _pool;
          _pool = new pg.Pool({
            connectionString: activeDb.url,
            max: 25,
            min: 3,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            statement_timeout: 30000,
            allowExitOnIdle: false,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
          });
          _pool.on("error", (e) => console.error("[DB Pool] Error on idle client:", e.message));
          _db = drizzle(_pool, { schema });
          appendDbHealthLog("POOL_RECYCLED", { consecutiveFailures }).catch(() => {});
          try {
            const verifyClient = await _pool.connect();
            await verifyClient.query("SELECT 1");
            verifyClient.release();
            const downSec = _downSince ? Math.round((Date.now() - _downSince) / 1000) : 0;
            appendDbHealthLog("POOL_VERIFY_OK", {
              consecutiveFailures,
              downSeconds: downSec,
            }).catch(() => {});
            consecutiveFailures = 0;
            cumulativeFailures = 0;
            if (_recoveryMode) {
              _recoveryMode = false;
              _downSince = null;
              console.log("[DB Pool] ✓ New pool verified — auto-recovered from Recovery Mode");
              appendDbHealthLog("RECOVERY_MODE_EXIT", { downSeconds: downSec, recoveryMethod: "recycle" }).catch(() => {});
            } else {
              console.log("[DB Pool] ✓ New pool verified — connection restored");
            }
          } catch (verifyErr: any) {
            appendDbHealthLog("POOL_VERIFY_FAIL", { errorMessage: verifyErr.message }).catch(() => {});
            console.warn(`[DB Pool] New pool verify failed: ${verifyErr.message} — will retry next cycle`);
          }
          setTimeout(async () => { try { await oldPool.end(); } catch {} }, 5000);
        } catch (recycleErr: any) {
          appendDbHealthLog("POOL_RECYCLE_FAIL", { errorMessage: recycleErr.message }).catch(() => {});
          console.error("[DB Pool] Recycle failed:", recycleErr.message);
        }
      }
    }
  }, 10000);
}
let _db: NodePgDatabase<typeof schema> = drizzle(_pool, { schema });

export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(_pool, prop, _pool);
  },
});

export const db: NodePgDatabase<typeof schema> = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(_db, prop, _db);
  },
});

export function getActiveDbInfo() {
  return { ...activeDb };
}

export const activeDbInfo = new Proxy({} as { url: string; label: string; target: "usa" | "thailand" }, {
  get(_target, prop) {
    return (activeDb as any)[prop];
  },
});

export function setDevDbChoice(target: "usa" | "thailand") {
  fs.writeFileSync(DEV_DB_CHOICE_FILE, target, "utf-8");
}

let _switchVersion = 0;
let _recoveryMode = false;

export function isRecoveryMode(): boolean {
  return _recoveryMode;
}

export function setRecoveryMode(val: boolean): void {
  _recoveryMode = val;
}

export async function testMainDbConnection(): Promise<{ ok: boolean; error?: string; db?: string; port?: string }> {
  try {
    const client = await _pool.connect();
    const res = await client.query("SELECT current_database() as db, inet_server_port() as port");
    client.release();
    return { ok: true, db: res.rows[0].db, port: res.rows[0].port };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export function getDbSwitchVersion(): number {
  return _switchVersion;
}

export async function reinitializeFromConfig(): Promise<void> {
  let newActiveDb = getActiveDbUrl();
  console.log(`[DB] reinitializeFromConfig: current="${activeDb.label}" (url=${activeDb.url ? "set" : "empty"}), new=${newActiveDb ? `"${newActiveDb.label}" (url=${newActiveDb.url ? "set" : "empty"})` : "null"}`);
  if (!newActiveDb) {
    console.error("[DB] reinitializeFromConfig: still no database URL available after config bootstrap");
    return;
  }
  if (!newActiveDb.url) {
    console.error("[DB] reinitializeFromConfig: new URL is empty");
    return;
  }

  console.log(`[DB] LAN check: NODE_ENV=${JSON.stringify(process.env.NODE_ENV)} DB_MAIN_LAN=${JSON.stringify(process.env.DB_MAIN_LAN)}`);
  if (process.env.NODE_ENV === "production" && process.env.DB_MAIN_LAN?.trim() === "true") {
    const lanUrl = getConfig("DB_MAIN_LAN_URL");
    if (lanUrl) {
      console.log("[DB] DB_MAIN_LAN=true — probing LAN connection (5s timeout)...");
      appendLanLog("--- LAN Probe Start ---");
      appendLanLog(`FQDN URL: ${newActiveDb.url.replace(/\/\/[^@]+@/, "//***@")}`);
      appendLanLog(`LAN  URL: ${lanUrl.replace(/\/\/[^@]+@/, "//***@")}`);

      const lanOk = await probeLanConnection(lanUrl, 5000);

      if (lanOk) {
        console.log("[DB] ✓ LAN connection OK — using LAN URL (faster)");
        appendLanLog("Result: LAN connected ✓ — using LAN URL");
        newActiveDb = { url: lanUrl, label: "Production (LAN)", target: "thailand" };
      } else {
        console.log("[DB] ✗ LAN connection failed — fallback to FQDN URL");
        appendLanLog("Result: LAN connection FAILED ✗ — fallback to FQDN URL");
      }
      appendLanLog("--- LAN Probe End ---\n");
    } else {
      console.log("[DB] DB_MAIN_LAN=true but DB_MAIN_LAN_URL not set in config DB — using FQDN");
      appendLanLog("WARN: DB_MAIN_LAN=true but DB_MAIN_LAN_URL not configured in config DB");
    }
  }

  if (newActiveDb.url === activeDb.url) {
    console.log("[DB] reinitializeFromConfig: URL unchanged, skipping");
    return;
  }

  console.log(`[DB] Reinitializing connection: ${activeDb.label} → ${newActiveDb.label}`);
  const oldPool = _pool;
  activeDb = newActiveDb;

  _pool = new pg.Pool({
    connectionString: activeDb.url,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: isProduction ? 20000 : 10000,
    statement_timeout: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  _pool.on("error", (err) => {
    console.error("[DB Pool] Unexpected error on idle client:", err.message);
  });
  _db = drizzle(_pool, { schema });
  _switchVersion++;

  warmupPool(_pool, activeDb.label);

  setTimeout(async () => {
    try { await oldPool.end(); } catch {}
  }, 3000);
}

export async function emergencySwitchToSource(): Promise<{ success: boolean; error?: string }> {
  const sourceUrl = process.env.DATABASE_URL;
  if (!sourceUrl) return { success: false, error: "DATABASE_URL not set" };
  if (activeDb.url === sourceUrl) return { success: true };

  const testPool = new pg.Pool({ connectionString: sourceUrl, connectionTimeoutMillis: 5000 });
  try { await testPool.query("SELECT 1"); } catch (err: any) {
    await testPool.end();
    return { success: false, error: "Source database is not reachable" };
  }
  await testPool.end();

  const oldPool = _pool;
  setDevDbChoice("usa");
  activeDb = { url: sourceUrl, label: "Replit (Emergency Switch)", target: "usa" };
  _pool = new pg.Pool({
    connectionString: sourceUrl, max: 20,
    idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
    statement_timeout: 30000, keepAlive: true, keepAliveInitialDelayMillis: 10000,
  });
  _pool.on("error", (err) => {
    console.error("[DB Pool] Unexpected error on idle client:", err.message);
  });
  _db = drizzle(_pool, { schema });
  _switchVersion++;
  setTimeout(async () => { try { await oldPool.end(); } catch {} }, 3000);

  if (activeDb.url !== sourceUrl) {
    console.error("[DB] Emergency switch FAILED — activeDb.url mismatch after switch!");
    return { success: false, error: "Switch verification failed" };
  }
  console.log("[DB] Emergency switch to source (USA) complete — verified");
  return { success: true };
}

export async function hotSwapDatabase(target: "usa" | "thailand"): Promise<{ success: boolean; error?: string }> {
  if (process.env.NODE_ENV === "production") {
    return { success: false, error: "Cannot switch database in production" };
  }

  let newUrl: string | undefined;
  if (target === "thailand") {
    newUrl = getConfig("DB_MAIN_URL");
  } else {
    newUrl = process.env.DATABASE_URL;
  }

  if (!newUrl) {
    return { success: false, error: "Target database URL not configured" };
  }

  const testPool = new pg.Pool({ connectionString: newUrl, connectionTimeoutMillis: 5000 });
  try {
    await testPool.query("SELECT 1");
  } catch (err: any) {
    await testPool.end();
    return { success: false, error: "Target database is not reachable" };
  }
  await testPool.end();

  const oldPool = _pool;

  setDevDbChoice(target);

  activeDb = getActiveDbUrl();
  _pool = new pg.Pool({
    connectionString: activeDb.url,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  _db = drizzle(_pool, { schema });

  _switchVersion++;

  setTimeout(async () => {
    try {
      await oldPool.end();
    } catch {}
  }, 3000);

  return { success: true };
}
