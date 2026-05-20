import { Client } from 'pg';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DEV_URL = process.env.DATABASE_URL;
const PROD_URL = process.env.DB_PROD_URL;

if (!DEV_URL) { console.error('❌ DATABASE_URL not set (dev DB)'); process.exit(1); }
if (!PROD_URL) { console.error('❌ DB_PROD_URL not set (prod DB) — ask พี่ช้าง to set Replit Secret'); process.exit(1); }

type ColInfo = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };
type TableMap = Map<string, ColInfo[]>;

async function fetchSchema(url: string, label: string): Promise<{ tables: TableMap; flags: Set<string>; indexes: Map<string, string[]> }> {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const cols = await c.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    const tables: TableMap = new Map();
    for (const r of cols.rows) {
      if (!tables.has(r.table_name)) tables.set(r.table_name, []);
      tables.get(r.table_name)!.push(r);
    }

    const idx = await c.query(`SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`);
    const indexes = new Map<string, string[]>();
    for (const r of idx.rows) {
      if (!indexes.has(r.tablename)) indexes.set(r.tablename, []);
      indexes.get(r.tablename)!.push(r.indexname);
    }

    const flags = new Set<string>();
    try {
      const f = await c.query(`SELECT config_key FROM system_config WHERE config_key LIKE '%\\_20%' ESCAPE '\\' ORDER BY config_key`);
      for (const r of f.rows) flags.add(r.config_key);
    } catch (e: any) {
      console.warn(`⚠️ ${label}: cannot read system_config — ${e.message}`);
    }
    return { tables, flags, indexes };
  } finally {
    await c.end();
  }
}

function colKey(c: ColInfo): string {
  return `${c.column_name}:${c.data_type}:${c.is_nullable}`;
}

function diffTable(devCols: ColInfo[], prodCols: ColInfo[]): string[] {
  const devMap = new Map(devCols.map(c => [c.column_name, c]));
  const prodMap = new Map(prodCols.map(c => [c.column_name, c]));
  const diffs: string[] = [];
  for (const [name, dc] of devMap) {
    const pc = prodMap.get(name);
    if (!pc) { diffs.push(`  - DEV has column \`${name}\` (${dc.data_type}, nullable=${dc.is_nullable}) — PROD missing`); continue; }
    if (colKey(dc) !== colKey(pc)) {
      diffs.push(`  - Column \`${name}\` differs: DEV=${dc.data_type}/null=${dc.is_nullable} vs PROD=${pc.data_type}/null=${pc.is_nullable}`);
    }
  }
  for (const [name, pc] of prodMap) {
    if (!devMap.has(name)) diffs.push(`  - PROD has column \`${name}\` (${pc.data_type}) — DEV missing`);
  }
  return diffs;
}

(async () => {
  console.log('🔍 Connecting to dev and prod DBs...');
  const [dev, prod] = await Promise.all([
    fetchSchema(DEV_URL, 'DEV'),
    fetchSchema(PROD_URL, 'PROD'),
  ]);

  const allTables = new Set([...dev.tables.keys(), ...prod.tables.keys()]);
  const onlyDev: string[] = [];
  const onlyProd: string[] = [];
  const colDiffs: { table: string; diffs: string[] }[] = [];

  for (const t of [...allTables].sort()) {
    const d = dev.tables.get(t);
    const p = prod.tables.get(t);
    if (d && !p) onlyDev.push(t);
    else if (!d && p) onlyProd.push(t);
    else if (d && p) {
      const diffs = diffTable(d, p);
      if (diffs.length > 0) colDiffs.push({ table: t, diffs });
    }
  }

  const allFlags = new Set([...dev.flags, ...prod.flags]);
  const flagRows: string[] = [];
  for (const f of [...allFlags].sort()) {
    const dF = dev.flags.has(f) ? '✅' : '❌';
    const pF = prod.flags.has(f) ? '✅' : '❌';
    const mismatch = (dev.flags.has(f) !== prod.flags.has(f)) ? ' ← **mismatch**' : '';
    flagRows.push(`| \`${f}\` | ${dF} | ${pF} |${mismatch}`);
  }

  const now = new Date().toLocaleString('sv', { timeZone: 'Asia/Bangkok' });
  const out = `# Dev vs Prod Schema Diff

**⚠️ AUTO-GENERATED — DO NOT EDIT BY HAND. Regenerate with \`npm run schema:diff\`.**
**⚠️ THIS FILE IS GITIGNORED — never commit. Always treat as ephemeral.**
**⚠️ TREAT AS STALE if older than this session.**

**Generated:** ${now} (Bangkok)
**Dev:** ${DEV_URL!.replace(/:[^:@]+@/, ':****@')}
**Prod:** ${PROD_URL!.replace(/:[^:@]+@/, ':****@')}

---

## 1. Tables ONLY on DEV (${onlyDev.length}) — need to push schema to prod
${onlyDev.length === 0 ? '✅ none' : onlyDev.map(t => `- \`${t}\` (${dev.tables.get(t)!.length} cols)`).join('\n')}

## 2. Tables ONLY on PROD (${onlyProd.length}) — orphan / investigate
${onlyProd.length === 0 ? '✅ none' : onlyProd.map(t => `- \`${t}\` (${prod.tables.get(t)!.length} cols)`).join('\n')}

## 3. Tables on BOTH but columns differ (${colDiffs.length})
${colDiffs.length === 0 ? '✅ none' : colDiffs.map(c => `### \`${c.table}\`\n${c.diffs.join('\n')}`).join('\n\n')}

## 4. Migration flags in \`system_config\` (filter: \`%_20%\`)
| Flag | Dev | Prod |
|---|---|---|
${flagRows.length === 0 ? '| (none) | — | — |' : flagRows.join('\n')}

---

## How to read this
- **Section 1 not empty** → there are pending schema pushes. Cross-check with \`db/pending-push-queue.md\`.
- **Section 2 not empty** → prod has tables dev doesn't. Either (a) dev was wiped/reset and lost them, or (b) someone added them on prod outside the migration system. Investigate before any push.
- **Section 3 not empty** → column-level drift. Fix the side that's wrong via migration (never direct ALTER on prod).
- **Section 4 mismatch** → migration flag asymmetry. If dev=✅ prod=❌, the migration ran on dev but not prod (pending). If dev=❌ prod=✅, ENTRY in \`schema-history.md\` may be outdated.
`;

  const outPath = 'db/dev-vs-prod-diff.md';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, out);
  console.log(`✅ Diff written to ${outPath}`);
  console.log(`   - ${onlyDev.length} tables only on dev`);
  console.log(`   - ${onlyProd.length} tables only on prod`);
  console.log(`   - ${colDiffs.length} tables with column diffs`);
  console.log(`   - ${[...allFlags].filter(f => dev.flags.has(f) !== prod.flags.has(f)).length} flag mismatches`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
