/* ===========================================================================
   PURGE COMPLIANCE LIBRARY
   ---------------------------------------------------------------------------
   Deletes every row from `compliances` in the LIVE database this script is
   pointed at. Postgres foreign keys cascade this into every obligation,
   evidence file, due-date change and review action tied to those library
   rows (see db/schema.sql). Entities, users, jurisdictions and countries are
   left untouched — only the compliance library and everything filed against
   it is removed.

   This does NOT read or write db/library.ts or db/jurisdictions.ts. Those
   files control what gets seeded back in on the next `npm run db:setup`;
   this script only clears what is currently sitting in the database.

   Usage:
     1. Make sure .env.local points DATABASE_URL at the database you actually
        want to clear (take a snapshot/backup first if this is production).
     2. npm run db:purge-library
     3. Review the before/after counts this script prints.
     4. When you're ready to re-seed, edit db/library.ts / db/jurisdictions.ts
        (or use Compliance Library -> Import in the running app) and run
        npm run db:setup -- --empty.
   =========================================================================== */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const f of ['.env.local', '.env']) {
  const p = join(__dirname, '..', f);
  if (existsSync(p)) loadEnv({ path: p });
}

const CONN = process.env.DATABASE_URL;
if (!CONN) {
  console.error('\n  DATABASE_URL is not set. Point .env.local at the database you want to clear.\n');
  process.exit(1);
}

const CONFIRM = process.argv.includes('--yes');

const pool = new Pool({
  connectionString: CONN,
  ssl: /localhost|127\.0\.0\.1/.test(CONN) ? undefined : { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 20_000,
});

function log(msg: string) { console.log('  ' + msg); }

async function counts(client: import('pg').PoolClient) {
  const r = await client.query<{ label: string; n: string }>(`
    SELECT 'compliances' AS label, count(*)::text AS n FROM compliances
    UNION ALL SELECT 'obligations', count(*)::text FROM obligations
    UNION ALL SELECT 'evidence', count(*)::text FROM evidence
    UNION ALL SELECT 'review_actions', count(*)::text FROM review_actions
    UNION ALL SELECT 'due_date_changes', count(*)::text FROM due_date_changes
    UNION ALL SELECT 'compliance_history', count(*)::text FROM compliance_history
    UNION ALL SELECT 'notifications', count(*)::text FROM notifications
    UNION ALL SELECT 'score_snapshots', count(*)::text FROM score_snapshots`);
  return r.rows;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('\nSGCMP — purge compliance library');
    console.log('=================================\n');
    log('Connected. Counts before:');
    (await counts(client)).forEach(c => log(`  ${c.label.padEnd(20)} ${c.n}`));

    if (!CONFIRM) {
      console.log('\n  This will permanently delete every compliance library record — and, by');
      console.log('  cascade, every obligation, evidence file and review action tied to them —');
      console.log('  from the database above.\n');
      console.log('  Re-run as:  npm run db:purge-library -- --yes\n');
      return;
    }

    await client.query('BEGIN');
    const del = await client.query('DELETE FROM compliances');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM score_snapshots');
    await client.query(
      `INSERT INTO audit_log (actor_email, action, object_type, detail)
       VALUES ('system', 'purge_library', 'compliances', $1)`,
      [`Purged ${del.rowCount ?? 0} compliance library records and all dependent obligations/evidence/notifications/score snapshots.`]);
    await client.query('COMMIT');

    log(`\nDeleted ${del.rowCount ?? 0} compliance records (cascaded to obligations, evidence, review actions, due-date changes, compliance history).`);
    log('Counts after:');
    (await counts(client)).forEach(c => log(`  ${c.label.padEnd(20)} ${c.n}`));
    console.log('\n  Done. Entities, users, jurisdictions and countries were left untouched.');
    console.log('  Next: validate your researched compliance workbook, then import it at');
    console.log('  Compliance Library -> Import in the app (or paste it into');
    console.log('  db/library.ts / db/jurisdictions.ts and run npm run db:setup -- --empty).\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n  Purge failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
