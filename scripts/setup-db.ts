/* ===========================================================================
   SGCMP DATABASE SETUP
   ---------------------------------------------------------------------------
   Usage:
     npm run db:setup            apply schema, seed master data and register
     npm run db:setup -- --empty seed master data only (no operating activity)
     npm run db:reset            drop everything and rebuild from scratch

   Safe to run more than once: all inserts are idempotent upserts.
   =========================================================================== */
import { config as loadEnv } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

import { CATEGORIES, COUNTRIES, FEDERAL_LIBRARY } from '../db/library';
import { JURISDICTIONS, SUBNATIONAL_LIBRARY, type LibraryItem } from '../db/jurisdictions';
import { DIVISIONS, ENTITIES, ROLES, USERS } from '../db/org';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* Load environment: .env.local wins over .env, matching Next.js behaviour. */
for (const f of ['.env.local', '.env']) {
  const p = join(__dirname, '..', f);
  if (existsSync(p)) loadEnv({ path: p });
}

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const EMPTY = args.includes('--empty');

/* Default "where to check for a due-date change" per country + category,
   used only when a library item doesn't set its own `site`. These are the
   department/portal home pages (India has no single "all due dates" page
   per authority), which is what the due-date sync check (see
   src/lib/duedate-sync.ts) fetches and scans for a differing date. */
const DEFAULT_SOURCE_SITE: Record<string, string> = {
  'IN:direct_tax': 'https://www.incometax.gov.in/iec/foportal/',
  'IN:transfer_pricing': 'https://www.incometax.gov.in/iec/foportal/',
  'IN:vat_gst': 'https://www.gst.gov.in/',
  'IN:corporate_law': 'https://www.mca.gov.in/',
  'IN:securities_sebi': 'https://www.sebi.gov.in/',
  'IN:foreign_exchange': 'https://www.rbi.org.in/',
  'IN:customs_trade': 'https://www.dgft.gov.in/',
  'IN:labour_law': 'https://labour.gov.in/',
  'IN:environmental_ehs': 'https://tnpcb.gov.in/',
  'IN:industry_regulation': 'https://labour.gov.in/',
  'IN:data_privacy': 'https://www.meity.gov.in/',
  'IN:competition_law': 'https://www.cci.gov.in/',
  'AE:direct_tax': 'https://tax.gov.ae/',
  'AE:vat_gst': 'https://tax.gov.ae/',
  'AE:corporate_law': 'https://www.moec.gov.ae/',
  'AE:labour_law': 'https://www.mohre.gov.ae/',
};
function defaultSite(item: LibraryItem): string | null {
  return item.site ?? DEFAULT_SOURCE_SITE[`${item.country}:${item.category}`] ?? null;
}

const CONN = process.env.DATABASE_URL;
if (!CONN) {
  console.error('\n  DATABASE_URL is not set.\n');
  console.error('  1. Copy .env.example to .env.local');
  console.error('  2. Paste your Postgres connection string into DATABASE_URL');
  console.error('  3. Run this command again\n');
  process.exit(1);
}

const pool = new Pool({
  connectionString: CONN,
  ssl: /localhost|127\.0\.0\.1/.test(CONN) ? undefined : { rejectUnauthorized: false },
  max: 4,
  connectionTimeoutMillis: 20_000,
});

const SEED_PASSWORD = process.env.SEED_PASSWORD || 'ChangeMe@2026';

function log(msg: string) { console.log('  ' + msg); }

/* ------------------------------------------------------------------ dates
   India's financial year runs 1 April - 31 March. Every period below is
   anchored to that FY, not to a rolling window around "today" — so the
   register always shows a full FY's worth of instalments (e.g. Advance Tax
   as 4 rows, TDS as 4 rows, GST as 12 rows) rather than however many
   happened to fall in the last few months. */
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** The FY's starting calendar year for any date (15 Aug 2026 -> 2026; 15 Feb 2027 -> 2026). */
function fyStartYear(d: Date): number {
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}
function fyLabel(startYear: number): string {
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}
/** The 12 {year,month} pairs making up FY `startYear`, April through March. */
function fyMonths(startYear: number): { y: number; m: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = (3 + i) % 12;
    return { y: m >= 3 ? startYear : startYear + 1, m };
  });
}
/** A calendar month's correct year within FY `fyStart` (Apr-Dec -> fyStart, Jan-Mar -> fyStart+1). */
function yearForMonthInFy(fyStart: number, month0: number): number {
  return month0 >= 3 ? fyStart : fyStart + 1;
}

type Period = { anchorY: number; anchorM: number; label: string };

/** Every period of `freq` within FY `fyStart`, anchored on the period's own
    last month — so "N months after period end" (dueOffsetMonths) means the
    same thing whether the period is a month, a quarter or a half-year. */
function periodsInFy(freq: string, fyStart: number): Period[] {
  const months = fyMonths(fyStart);
  const fyTag = fyLabel(fyStart);
  switch (freq) {
    case 'Monthly':
    case 'Continuous':
      return months.map(({ y, m }) => ({ anchorY: y, anchorM: m, label: `${MON[m]} ${y}` }));
    case 'Quarterly': {
      const out: Period[] = [];
      for (let q = 0; q < 4; q++) {
        const { y, m } = months[q * 3 + 2]; // last month of the quarter
        out.push({ anchorY: y, anchorM: m, label: `Q${q + 1} ${fyTag}` });
      }
      return out;
    }
    case 'Half-yearly': {
      const h1 = months[5], h2 = months[11]; // Sep, Mar
      return [
        { anchorY: h1.y, anchorM: h1.m, label: `H1 ${fyTag}` },
        { anchorY: h2.y, anchorM: h2.m, label: `H2 ${fyTag}` },
      ];
    }
    default: // Annual, Periodic, Event Based
      return [{ anchorY: months[11].y, anchorM: months[11].m, label: fyTag }];
  }
}

/* stable pseudo random — used only to pick a realistic filing status/delay
   for the demo register, never for the due date itself (see computeDueDate). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/* The real due date, from the library's structured rule rather than a random
   placeholder. Monthly/Quarterly/Half-yearly items fall dueOffsetMonths
   (default 1) after the period's own end month, on dueDay. Annual/Periodic/
   Event Based items fall on a fixed month/day within the FY (the year is
   derived per-month, since Jan-Mar dues fall in the FY's second calendar
   year). Falls back to a mid-FY date when an item has no fixed calendar
   trigger (e.g. licence renewals on expiry). Deliberately NOT auto-shifted
   off weekends — that pushed confirmed statutory dates (e.g. ITR-6, 30 Oct)
   onto a different day than what's actually notified. If a specific rule
   really does roll over to the next working day, encode that in its
   dueDay/dueRule directly. */
function computeDueDate(item: LibraryItem, period: Period, fyStart: number): Date {
  const day = item.dueDay ?? 15;
  if (item.frequency === 'Monthly' || item.frequency === 'Quarterly' || item.frequency === 'Half-yearly') {
    const offset = item.dueOffsetMonths ?? 1;
    let m = period.anchorM + offset, y = period.anchorY;
    if (m > 11) { m -= 12; y += 1; }
    return new Date(Date.UTC(y, m, day));
  }
  const month0 = (item.dueMonth ?? period.anchorM + 1) - 1;
  const y = yearForMonthInFy(fyStart, month0);
  return new Date(Date.UTC(y, month0, day));
}

/* --------------------------------------------------------- applicability */
type EntityRow = (typeof ENTITIES)[number];

function jurisdictionsOf(e: EntityRow): Set<string> {
  const set = new Set<string>([`${e.country}-FED`, e.jurisdiction]);
  (e.alsoIn ?? []).forEach(j => set.add(j));
  return set;
}

function applies(item: LibraryItem, e: EntityRow): boolean {
  if (item.country !== e.country) return false;
  if (!jurisdictionsOf(e).has(item.jurisdiction)) return false;
  if (item.listed && !e.listed) return false;
  if (item.factory && !e.factory) return false;
  if (item.importer && !e.importer) return false;
  // a pure holding company and an R&D centre do not carry customs obligations
  if (item.category === 'customs_trade' && !e.importer) return false;
  return true;
}

/* ------------------------------------------------------------------- main */
async function main() {
  const client = await pool.connect();
  try {
    console.log('\nSGCMP database setup');
    console.log('====================\n');

    if (RESET) {
      log('Dropping existing objects…');
      await client.query(`
        DROP TABLE IF EXISTS score_snapshots, audit_log, notifications, review_actions,
          evidence, due_date_changes, obligations, compliance_history, compliances,
          delegations, user_entities, users, roles, entity_jurisdictions, entities,
          categories, divisions, jurisdictions, countries, app_settings CASCADE;
        DROP FUNCTION IF EXISTS touch_updated_at() CASCADE;`);
    }

    log('Applying schema…');
    await client.query(readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

    /* ---------------------------------------------------- reference data */
    log('Seeding countries, jurisdictions, divisions, categories…');
    for (const c of COUNTRIES) {
      await client.query(
        `INSERT INTO countries (code, name, currency, fy_end, timezone, portal)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, currency=EXCLUDED.currency,
           fy_end=EXCLUDED.fy_end, timezone=EXCLUDED.timezone, portal=EXCLUDED.portal`,
        [c.code, c.name, c.currency, c.fyEnd, c.tz, c.portal]
      );
    }
    // parents before children
    for (const j of [...JURISDICTIONS].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0))) {
      await client.query(
        `INSERT INTO jurisdictions (id, country_code, parent_id, level, code, name)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, level=EXCLUDED.level,
           parent_id=EXCLUDED.parent_id`,
        [j.id, j.country, j.parent ?? null, j.level, j.code, j.name]
      );
    }
    for (const d of DIVISIONS) {
      await client.query(
        `INSERT INTO divisions (id, name) VALUES ($1,$2)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name`, [d.id, d.name]);
    }
    for (const c of CATEGORIES) {
      await client.query(
        `INSERT INTO categories (id, name, sort_order) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order`,
        [c.id, c.name, c.sort]);
    }

    /* ---------------------------------------------------------- entities */
    log(`Seeding ${ENTITIES.length} entities…`);
    for (const e of [...ENTITIES].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0))) {
      await client.query(
        `INSERT INTO entities (id, name, short_name, country_code, jurisdiction_id, division_id,
            parent_id, entity_type, city, currency, fy_end, employees,
            is_listed, has_factory, is_importer, statutory_auditor, local_advisor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, short_name=EXCLUDED.short_name,
           jurisdiction_id=EXCLUDED.jurisdiction_id, division_id=EXCLUDED.division_id,
           entity_type=EXCLUDED.entity_type, city=EXCLUDED.city, employees=EXCLUDED.employees,
           is_listed=EXCLUDED.is_listed, has_factory=EXCLUDED.has_factory,
           is_importer=EXCLUDED.is_importer`,
        [e.id, e.name, e.short, e.country, e.jurisdiction, e.division, e.parent ?? null,
         e.type, e.city, e.currency, e.fyEnd, e.employees,
         !!e.listed, !!e.factory, !!e.importer, e.auditor, e.advisor]
      );
      for (const j of jurisdictionsOf(e)) {
        await client.query(
          `INSERT INTO entity_jurisdictions (entity_id, jurisdiction_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`, [e.id, j]);
      }
    }

    /* ------------------------------------------------------ roles & users */
    log('Seeding roles…');
    for (const r of ROLES) {
      await client.query(
        `INSERT INTO roles (id, name, description, permissions, is_system)
         VALUES ($1,$2,$3,$4::jsonb,$5)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
           permissions=EXCLUDED.permissions`,
        [r.id, r.name, r.description, JSON.stringify(r.permissions), r.system]);
    }

    log(`Seeding ${USERS.length} users (password: ${SEED_PASSWORD})…`);
    const hashPw = await bcrypt.hash(SEED_PASSWORD, 10);
    const userIds = new Map<string, string>();
    for (const u of USERS) {
      const res = await client.query<{ id: string }>(
        `INSERT INTO users (email, full_name, role_id, password_hash, status)
         VALUES ($1,$2,$3,$4,'active')
         ON CONFLICT (email) DO UPDATE SET full_name=EXCLUDED.full_name,
           role_id=EXCLUDED.role_id, status='active'
         RETURNING id`,
        [u.email, u.name, u.role, hashPw]);
      const id = res.rows[0].id;
      userIds.set(u.email, id);
      await client.query(`DELETE FROM user_entities WHERE user_id = $1`, [id]);
      for (const ent of u.entities) {
        await client.query(
          `INSERT INTO user_entities (user_id, entity_id, can_file, can_review)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [id, ent, !!u.file, !!u.review]);
      }
    }
    /* Generic role-based lookups (not hardcoded emails) so this works for any
       USERS list, including the single-admin blank template. */
    const firstUserIdByRole = (role: string): string | undefined => {
      const u = USERS.find(x => x.role === role);
      return u ? userIds.get(u.email) : undefined;
    };
    const anyUserId = (): string | undefined => {
      const first = USERS[0];
      return first ? userIds.get(first.email) : undefined;
    };
    const cfoId = firstUserIdByRole('CFO') ?? firstUserIdByRole('CFO_OFFICE')
      ?? firstUserIdByRole('ADMIN') ?? anyUserId();
    if (!cfoId) throw new Error('No users seeded — add at least one user to db/org.ts USERS.');

    /* ------------------------------------------------- compliance library */
    const library: LibraryItem[] = [...FEDERAL_LIBRARY, ...SUBNATIONAL_LIBRARY];
    log(`Seeding compliance library — ${library.length} records ` +
        `(${FEDERAL_LIBRARY.length} national + ${SUBNATIONAL_LIBRARY.length} state/province)…`);

    const validCats = new Set(CATEGORIES.map(c => c.id));
    const compIds = new Map<string, string>();
    for (const item of library) {
      if (!validCats.has(item.category)) {
        throw new Error(`Compliance ${item.code} references unknown category "${item.category}"`);
      }
      const res = await client.query<{ id: string }>(
        `INSERT INTO compliances (code, country_code, jurisdiction_id, category_id, title,
            applicable_law, form_reference, authority, government_site, frequency, due_rule,
            due_day, due_month, evidence_required, penalty, risk_level,
            applies_if_listed, applies_if_factory, applies_if_importer, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (code) DO UPDATE SET
           title=EXCLUDED.title, applicable_law=EXCLUDED.applicable_law,
           form_reference=EXCLUDED.form_reference, authority=EXCLUDED.authority,
           frequency=EXCLUDED.frequency, due_rule=EXCLUDED.due_rule,
           due_day=EXCLUDED.due_day, due_month=EXCLUDED.due_month,
           evidence_required=EXCLUDED.evidence_required, penalty=EXCLUDED.penalty,
           risk_level=EXCLUDED.risk_level, jurisdiction_id=EXCLUDED.jurisdiction_id,
           category_id=EXCLUDED.category_id
         RETURNING id`,
        [item.code, item.country, item.jurisdiction, item.category, item.title,
         item.law, item.form, item.authority, defaultSite(item), item.frequency, item.dueRule,
         item.dueDay ?? null, item.dueMonth ?? null,
         JSON.stringify(item.evidence), item.penalty, item.risk,
         !!item.listed, !!item.factory, !!item.importer, cfoId]);
      compIds.set(item.code, res.rows[0].id);
    }

    /* ----------------------------------------------- obligation register */
    log('Generating the live obligation register…');
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const preparerFor = (entityId: string): string | null => {
      const u = USERS.find(x => x.file && x.entities.includes(entityId));
      return u ? userIds.get(u.email)! : null;
    };
    /* Picks a reviewer by specialism if the seeded emails hint at one
       (e.g. reviewer.tax@..., reviewer.hr@...), otherwise falls back to any
       REVIEWER, then to the CFO/admin fallback above — works whether USERS
       has a full reviewer roster or (as in the blank template) just one admin. */
    const reviewerUsers = USERS.filter(x => x.role === 'REVIEWER');
    const reviewerByHint = (hint: string) =>
      reviewerUsers.find(x => x.email.toLowerCase().includes(hint));
    const reviewerFor = (category: string): string => {
      const wantsTax = ['direct_tax', 'vat_gst', 'transfer_pricing', 'foreign_exchange'].includes(category);
      const wantsHr = category === 'labour_law';
      const hinted = wantsTax ? reviewerByHint('tax') : wantsHr ? reviewerByHint('hr') : reviewerByHint('legal');
      const chosen = hinted ?? reviewerUsers[0];
      return (chosen ? userIds.get(chosen.email) : undefined) ?? cfoId;
    };

    let created = 0;
    let seq = 0;
    const obligationRows: {
      id: string; entityId: string; code: string; due: Date; status: string;
      category: string; filed: Date | null;
    }[] = [];

    /* The current FY plus the one before it — "not restricted to the current
       FY", per the compliance calendar review. Future FYs aren't generated:
       most portals don't publish next year's exact dates yet, and an
       obligation with no real due date isn't useful to show. */
    const currentFyStart = fyStartYear(todayUtc);
    const FY_STARTS = [currentFyStart - 1, currentFyStart];

    for (const e of ENTITIES) {
      const applicable = library.filter(i => applies(i, e));
      for (const item of applicable) {
        for (const fyStart of FY_STARTS) {
          for (const period of periodsInFy(item.frequency, fyStart)) {
          const due = computeDueDate(item, period, fyStart);
          const label = period.label;
          const reference = `OB-${String(++seq).padStart(6, '0')}`;

          /* status: realistic operating mix, weighted by how far past the due date
             we are. With --empty everything starts as Not Started. A real
             company files almost everything that falls due, even if some of
             it runs late or is still sitting with a reviewer — a persistent
             stack of unfiled overdue items is not what a live register
             actually looks like, so that tail is kept deliberately small
             (~1% of past-due items) rather than the dominant picture. */
          let status = 'Not Started';
          let filed: Date | null = null;
          let stage = 'preparer';

          if (!EMPTY) {
            const h = hash(item.code + e.id + label) % 100;
            const past = due.getTime() < todayUtc.getTime();
            if (past) {
              if (h < 90) {
                status = 'Approved'; stage = 'closed';
                const lateness = (hash(label + item.code) % 9) - 4;
                filed = new Date(due); filed.setUTCDate(filed.getUTCDate() + lateness);
              } else if (h < 95) { status = 'Under Review'; stage = 'reviewer';
                filed = new Date(due); filed.setUTCDate(filed.getUTCDate() - 1);
              } else if (h < 98) { status = 'Submitted'; stage = 'reviewer';
                filed = new Date(due);
              } else if (h < 99) { status = 'Query Raised'; stage = 'preparer';
                filed = new Date(due); filed.setUTCDate(filed.getUTCDate() + 2);
              } else { status = 'Rejected'; stage = 'preparer'; }
            }
            /* A period not yet due cannot already be filed — leave it
               'Not Started' with no filed date, exactly as --empty does. */
          }

          const delay = filed ? Math.max(0, Math.round((filed.getTime() - due.getTime()) / 86400000)) : 0;
          const res = await client.query<{ id: string }>(
            `INSERT INTO obligations (reference, compliance_id, entity_id, period_label,
                due_date, original_due_date, filed_date, status, workflow_stage,
                assigned_to, reviewer_id, delay_days, penalty_exposure)
             VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (compliance_id, entity_id, period_label) DO UPDATE
               SET due_date = EXCLUDED.due_date
             RETURNING id`,
            [reference, compIds.get(item.code), e.id, label,
             due.toISOString().slice(0, 10),
             filed ? filed.toISOString().slice(0, 10) : null,
             status, stage, preparerFor(e.id), reviewerFor(item.category), delay,
             delay > 0 ? item.penalty : null]);
          obligationRows.push({
            id: res.rows[0].id, entityId: e.id, code: item.code, due,
            status, category: item.category, filed,
          });
          created++;
          }
        }
      }
    }
    log(`Register created: ${created} obligations across ${ENTITIES.length} entities, spanning FY${FY_STARTS[0]}-${String(FY_STARTS[0]+1).slice(-2)} to FY${FY_STARTS[1]}-${String(FY_STARTS[1]+1).slice(-2)}.`);

    /* mark genuinely overdue rows */
    const od = await client.query(
      `UPDATE obligations SET status = 'Overdue'
        WHERE deleted_at IS NULL AND due_date < CURRENT_DATE
          AND status IN ('Not Started','Evidence Pending')`);
    log(`Flagged ${od.rowCount ?? 0} obligations as overdue.`);

    /* ------------------------------------------- evidence + review trail */
    if (!EMPTY) {
      log('Attaching evidence records and the review trail…');
      const needEvidence = obligationRows.filter(o =>
        ['Approved', 'Under Review', 'Submitted', 'Query Raised'].includes(o.status));

      let evCount = 0;
      for (const o of needEvidence) {
        const item = library.find(i => i.code === o.code)!;
        const docName = (item.evidence[0] ?? 'Filed return')
          .replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 48);
        const fileName = `${item.code}_${docName.replace(/\s+/g, '_')}.pdf`;
        // A small, valid PDF so preview and download work out of the box.
        const body = Buffer.from(
          `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
          `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
          `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R` +
          `/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
          `4 0 obj<</Length 200>>stream\nBT /F1 13 Tf 60 780 Td (SGCMP evidence placeholder) Tj ` +
          `0 -22 Td (${item.code} ${item.title.slice(0, 46)}) Tj 0 -22 Td (Entity ${o.entityId}) Tj ` +
          `0 -22 Td (Replace with the actual filed document) Tj ET\nendstream endobj\n` +
          `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n` +
          `trailer<</Root 1 0 R>>\n%%EOF`, 'latin1');

        const evStatus = o.status === 'Approved' ? 'Approved'
          : o.status === 'Query Raised' ? 'Submitted' : 'Submitted';
        const delay = o.filed ? Math.max(0, Math.round((o.filed.getTime() - o.due.getTime()) / 86400000)) : 0;
        const validation = {
          ranAt: new Date().toISOString(),
          outcome: delay > 0 ? 'warnings' : 'clean',
          delayDays: delay,
          penaltyExposure: delay > 0 ? item.penalty : null,
          checks: [
            { key: 'filetype', label: 'Accepted file type', result: 'pass', detail: 'application/pdf is an accepted evidence format.' },
            { key: 'duplicate', label: 'Not a duplicate upload', result: 'pass', detail: 'No identical file found on this obligation.' },
            { key: 'period', label: 'Correct reporting period', result: 'pass', detail: 'Declared period matches the obligation.' },
            delay > 0
              ? { key: 'timeliness', label: 'Filed on or before the due date', result: 'fail',
                  detail: `Filed ${delay} day${delay === 1 ? '' : 's'} late. Penalty exposure: ${item.penalty}` }
              : { key: 'timeliness', label: 'Filed on or before the due date', result: 'pass', detail: 'Filed within the statutory timeline.' },
            { key: 'reviewer', label: 'Reviewer assigned', result: 'pass', detail: 'A reviewer is assigned and has been notified.' },
          ],
        };

        const ev = await client.query<{ id: string }>(
          `INSERT INTO evidence (obligation_id, file_name, mime_type, size_bytes, checksum,
              version, doc_type, period_label, filed_date, content, status, validation,
              uploaded_by, reviewed_by, reviewed_at)
           VALUES ($1,$2,'application/pdf',$3,$4,1,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
           RETURNING id`,
          [o.id, fileName, body.length, `sha-${hash(fileName + o.id).toString(16)}`,
           item.evidence[0] ?? 'Filed return', null,
           o.filed ? o.filed.toISOString().slice(0, 10) : null,
           body, evStatus, JSON.stringify(validation),
           preparerFor(o.entityId), evStatus === 'Approved' ? reviewerFor(o.category) : null,
           evStatus === 'Approved' ? new Date().toISOString() : null]);
        evCount++;

        await client.query(
          `INSERT INTO review_actions (obligation_id, evidence_id, action, actor_id, actor_role,
              from_status, to_status, comment)
           VALUES ($1,$2,'submit',$3,'PREPARER','Not Started','Submitted',$4)`,
          [o.id, ev.rows[0].id, preparerFor(o.entityId),
           'Compliance filed and supporting evidence uploaded.']);

        if (o.status === 'Approved') {
          await client.query(
            `INSERT INTO review_actions (obligation_id, evidence_id, action, actor_id, actor_role,
                from_status, to_status, comment)
             VALUES ($1,$2,'approve',$3,'REVIEWER','Under Review','Approved',$4)`,
            [o.id, ev.rows[0].id, reviewerFor(o.category),
             'Evidence agreed to the statutory filing. Approved.']);
        }
        if (o.status === 'Query Raised') {
          await client.query(
            `INSERT INTO review_actions (obligation_id, evidence_id, action, actor_id, actor_role,
                from_status, to_status, comment)
             VALUES ($1,$2,'query',$3,'REVIEWER','Under Review','Query Raised',$4)`,
            [o.id, ev.rows[0].id, reviewerFor(o.category),
             'The acknowledgement number on the document does not match the period. Please confirm and re-upload.']);
        }
        if (o.status === 'Rejected') {
          await client.query(
            `INSERT INTO review_actions (obligation_id, action, actor_id, actor_role,
                from_status, to_status, comment)
             VALUES ($1,'reject',$2,'REVIEWER','Under Review','Rejected',$3)`,
            [o.id, reviewerFor(o.category),
             'Document uploaded relates to a different period. Rejected and returned for correction.']);
        }
      }
      log(`Attached ${evCount} evidence documents with a full review trail.`);

      /* a couple of real due-date changes so the notification popup has content */
      log('Recording sample due-date changes and notifications…');
      const sample = await client.query<{ id: string; entity_id: string; country_code: string;
        due_date: string; title: string }>(
        `SELECT o.id, o.entity_id, e.country_code, o.due_date, c.title
           FROM obligations o
           JOIN entities e ON e.id = o.entity_id
           JOIN compliances c ON c.id = o.compliance_id
          WHERE o.status IN ('Not Started','Evidence Pending') AND o.due_date >= CURRENT_DATE
          ORDER BY o.due_date LIMIT 3`);
      for (const s of sample.rows) {
        const newDue = new Date(s.due_date);
        newDue.setUTCDate(newDue.getUTCDate() + 15);
        const nd = newDue.toISOString().slice(0, 10);
        await client.query(`UPDATE obligations SET due_date = $1 WHERE id = $2`, [nd, s.id]);
        await client.query(
          `INSERT INTO due_date_changes (obligation_id, country_code, entity_id,
              old_due_date, new_due_date, reason, source, changed_by)
           VALUES ($1,$2,$3,$4,$5,$6,'seed',$7)`,
          [s.id, s.country_code, s.entity_id, s.due_date, nd,
           'Filing deadline extended by the authority.', cfoId]);

        const affected = await client.query<{ user_id: string }>(
          `SELECT DISTINCT user_id FROM user_entities
            WHERE entity_id = $1 OR entity_id = '*'`, [s.entity_id]);
        for (const a of affected.rows) {
          await client.query(
            `INSERT INTO notifications (user_id, country_code, entity_id, kind, title, body, link, severity, is_popup)
             VALUES ($1,$2,$3,'due_date_change',$4,$5,$6,'warning',TRUE)`,
            [a.user_id, s.country_code, s.entity_id,
             `Due date changed — ${s.country_code}`,
             `${s.title}: due date moved from ${s.due_date} to ${nd}. Reason: filing deadline extended by the authority.`,
             `/register?obligation=${s.id}`]);
        }
      }
    }

    /* ------------------------------------------------------------ settings */
    const orgName = process.env.ORG_NAME || 'Your Company Name';
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES
        ('score_target', '85'::jsonb),
        ('escalation_days', '7'::jsonb),
        ('org_name', $1::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(orgName)]);

    await client.query(
      `INSERT INTO audit_log (actor_email, action, object_type, detail)
       VALUES ('system','setup','database',$1)`,
      [`Schema applied and seeded: ${library.length} compliances, ${ENTITIES.length} entities, ${USERS.length} users, ${created} obligations.`]);

    /* ------------------------------------------------------------ summary */
    const counts = await client.query<{ label: string; n: string }>(`
      SELECT 'countries' AS label, count(*)::text AS n FROM countries
      UNION ALL SELECT 'jurisdictions', count(*)::text FROM jurisdictions
      UNION ALL SELECT 'entities', count(*)::text FROM entities
      UNION ALL SELECT 'users', count(*)::text FROM users
      UNION ALL SELECT 'compliances', count(*)::text FROM compliances
      UNION ALL SELECT 'obligations', count(*)::text FROM obligations
      UNION ALL SELECT 'evidence files', count(*)::text FROM evidence
      UNION ALL SELECT 'review actions', count(*)::text FROM review_actions`);

    console.log('\n  Setup complete');
    console.log('  --------------');
    counts.rows.forEach((c) => console.log(`  ${c.label.padEnd(16)} ${c.n}`));
    console.log('\n  Sign in with (password: ' + SEED_PASSWORD + '):');
    USERS.forEach(u => console.log(`  ${u.email.padEnd(32)} ${u.role}`));
    console.log('\n  This is a blank template: no divisions, entities or compliance library yet.');
    console.log('  Add your company\'s entities and users in Administration, or edit db/org.ts');
    console.log('  directly and re-run this script. Then build/import a compliance library via');
    console.log('  Compliance Library -> Import (see README.md).');
    console.log('\n  Next:  npm run dev   then open http://localhost:3000\n');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n  Setup failed:', err instanceof Error ? err.message : err);
  if (err instanceof Error && /self.signed|certificate/i.test(err.message)) {
    console.error('  Hint: SSL issue. Confirm you copied the full Supabase connection string.');
  }
  if (err instanceof Error && /ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(err.message)) {
    console.error('  Hint: the database host is unreachable. Check DATABASE_URL and your network.');
  }
  process.exit(1);
});
