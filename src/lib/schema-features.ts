/* ===========================================================================
   OPTIONAL SCHEMA FEATURES
   ---------------------------------------------------------------------------
   Columns are added to db/schema.sql with ALTER TABLE ... ADD COLUMN IF NOT
   EXISTS, which only takes effect when somebody runs `npm run db:setup`. A
   deployment therefore reaches production before the database has the columns
   it introduced, and a query naming a column that does not exist does not
   degrade - it throws, and takes the whole screen with it.

   So anything depending on a new column asks first. The answer is cached for
   the life of the process: it can only change when a migration runs, and that
   restarts nothing, so the worst case is one stale `false` until the next cold
   start - which reads as "the feature is not switched on yet" rather than as a
   broken page.
   =========================================================================== */
import { one } from './db';

const cache = new Map<string, boolean>();

async function columnExists(table: string, column: string): Promise<boolean> {
  const key = `${table}.${column}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  try {
    const row = await one<{ n: string }>(
      `SELECT count(*) AS n FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1 AND column_name = $2`,
      [table, column]);
    const present = Number(row?.n ?? 0) > 0;
    cache.set(key, present);
    return present;
  } catch {
    /* If even this fails the database is in no state to be probed further.
       Report the feature as absent rather than letting the caller build a
       query it cannot run. */
    return false;
  }
}

/** Are the computed-penalty columns present on compliances and obligations? */
export async function hasPenaltyEngine(): Promise<boolean> {
  const [rule, base] = await Promise.all([
    columnExists('compliances', 'penalty_per_day'),
    columnExists('obligations', 'penalty_base_amount'),
  ]);
  return rule && base;
}
