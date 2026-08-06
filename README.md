# Global Compliance Management Platform (GCMP) — blank template

A live, evidence-based compliance monitoring platform for a group and its
subsidiaries. This copy ships as a **blank template**: the schema, roles,
workflow, reports and Excel import/export are all in place, but the compliance
library, jurisdictions, countries, divisions, entities and user roster are
empty (only a single Administrator account is seeded) — ready for a new
company's own data.

Every statutory obligation in every country carries the document that proves it
was filed. Every document is reviewed before it counts. The result is a **live
compliance score per entity**, per country and for the group — backed by
documentary evidence and a complete audit trail, replacing the practice of
relying on written representations from overseas entities.

## Filling in this template

1. Deploy and run `npm run db:setup -- --empty` to create the schema and log
   in as `admin@yourcompany.example` (change this email in `db/org.ts` first,
   or rename the user after your first login).
2. Add countries and jurisdictions this company actually operates in —
   either directly in `db/library.ts` / `db/jurisdictions.ts` and re-run
   `db:setup`, or from **Administration -> Jurisdictions** in the running app.
3. Add divisions, entities and users the same way (`db/org.ts`, or
   **Administration -> Entities / Users**).
4. Build the compliance library for those countries — research each country's
   applicable statutes, forms, authorities, frequencies, due rules and
   penalties, then either edit `db/library.ts` / `db/jurisdictions.ts`
   directly, or download the Excel template from **Compliance Library ->
   Import** and upload validated rows once your local advisers have signed
   off. Cite a source for every row; treat any AI- or template-drafted row as
   a starting position to confirm, never as filed legal advice.

---

## Getting it running

Three steps. You need Node 18.17+ and any PostgreSQL 14+ database.

```bash
npm install
```

Create `.env.local` in the project root:

```
DATABASE_URL=postgresql://user:password@host:5432/dbname
AUTH_SECRET=any-long-random-string-at-least-32-characters
SEED_PASSWORD=ChangeMe@2026
ORG_NAME=Your Company Name
```

Then:

```bash
npm run db:setup     # creates every table and loads the master data
npm run dev          # http://localhost:3000
```

`npm run db:setup` is safe to re-run; it will not duplicate anything.

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:setup` | Create schema, load master data and the demonstration register |
| `npm run db:setup -- --empty` | Schema and master data only — **use this for real go-live** |
| `npm run db:reset` | Drop everything and rebuild from scratch |
| `npm run db:purge-library` | Preview what a full compliance-library wipe would delete from the connected database (add `-- --yes` to actually delete). Removes every row in `compliances` and, by cascade, every obligation, evidence file, due-date change and review action tied to them. Entities, users, jurisdictions and countries are untouched |
| `npm run smoke` | End-to-end test of every route, role and workflow (server must be running) |

### Sign-in

Login is deliberately **not** on the landing page. It sits on its own route at
`/signin`, reachable from the "Sign in" link in the header.

This blank template seeds exactly one account, using the password from
`SEED_PASSWORD` (`ChangeMe@2026` by default — change it before go-live):

| Email | Role | Sees |
|---|---|---|
| `admin@yourcompany.example` | Administrator | Users, compliance library, jurisdictions |

Add the rest of the roster once entities exist — either in `db/org.ts`
(`USERS`, following the `UserSeed` shape) or from **Administration -> Users**
in the running app. The available roles are: Group CFO (score, delegation,
reports; cannot review individual items), CFO Office, Country Head (a
country's entities only), Reviewer (approve / reject / query), Preparer
(uploads compliance + evidence for its own entity), Administrator, and
Auditor (read-only, including the audit trail). The full list of whatever
you've seeded is printed at the end of `npm run db:setup`.

---

## The compliance score

The score is the single number the CFO relies on, and it is always explainable —
the API returns the full breakdown, never just the figure.

```
score = 100 × (approved ÷ applicable)  −  overdue penalty (max 15)  −  delay penalty (max 5)
```

Only obligations with **approved** evidence count towards the numerator. An item
that has been filed but not yet reviewed does not lift the score, and an item
that is merely awaiting review is *pending*, not *overdue*. Every score comes
with its base figure, both penalties, evidence coverage, on-time filing rate and
average delay, so any number on screen can be traced to the obligations behind
it.

---

## Modules

| Route | Purpose |
|---|---|
| `/dashboard` | Score, country Overall tab, heat map, pending reviews, delayed filings, recent due-date changes, reviewer performance |
| `/entities`, `/entities/[id]` | Entity scorecards; per-entity obligations, states, categories and history |
| `/compliance` | Compliance library — create, edit, archive, restore, delete, import, export |
| `/register` | The obligation register: upload compliance and evidence, respond to queries, resubmit |
| `/calendar` | Compliance calendar per month, filterable by entity and country |
| `/reviews` | Reviewer portal — approve, reject, raise query, comment, escalate, reassign |
| `/reports` | Ten reports, each as Excel or print-to-PDF |
| `/admin` | Users, roles, entity assignment, delegation, jurisdictions, audit trail |

The CFO's dashboard is deliberately limited to delegation, reports and the score,
including an **Overall** tab showing, for each country, how many compliances are
applicable and how many are actually being followed.

---

## Workflow

```
Preparer uploads compliance + evidence
        │  automatic validation runs on upload
        ▼
Sits in the reviewer's portal
        │
        ├── Approve  ──────────────► counts towards the score
        ├── Raise query ───────────► returns to the preparer, who corrects and resubmits
        ├── Reject ────────────────► returns to the preparer
        ├── Comment                 (no status change)
        ├── Escalate ──────────────► country head
        └── Reassign / delegate
```

Nothing is treated as complete until it has been approved. Every action records
who did it, when, the status before and after, and any comment — permanently.

### Automatic validation on upload

Eight checks run the moment a document is uploaded, before it reaches a reviewer:

accepted file type · size within limit · not a duplicate (SHA-256 checksum) ·
correct reporting period · filing date captured and not in the future ·
delay and penalty exposure calculated against the due date ·
required-documents checklist · reviewer assigned

Executables are refused outright. Duplicates are rejected with a clear message
rather than silently stored.

---

## Everything is dynamic

Nothing about the compliance universe is hard-coded. Countries, jurisdictions,
states, categories, compliances, due dates, frequencies and evidence
requirements all live in the database and are editable in the application.

**Adding a new state or country requires no code change.** Download the Excel
template for a country, add rows, upload it. The new obligations are live
immediately.

**This template ships completely empty** — `COUNTRIES`/`FEDERAL_LIBRARY` in
`db/library.ts` and `JURISDICTIONS`/`SUBNATIONAL_LIBRARY` in
`db/jurisdictions.ts` are all blank arrays, alongside empty `DIVISIONS` and
`ENTITIES` in `db/org.ts`. Populate them for the country/entity/compliance mix
this specific company actually needs, either by editing those files directly
and re-running `npm run db:setup`, or by adding countries/entities first (code
or Administration screens) and then using **Compliance Library -> Import**
once at least one country and jurisdiction exist — the Excel template
downloadable from that screen already has the right columns and valid-value
reference sheet built in. `npm run db:purge-library -- --yes` is there for
whenever you need to clear a previously-seeded library and start over (it only
touches `compliances` and what cascades from it — entities, users,
jurisdictions and countries are untouched).

State-level compliances become applicable **only** to entities that actually
operate in that state, driven by the `entity_jurisdictions` table — so a US
entity registered in Delaware and Texas as well as its home state would carry
federal obligations plus both states' items, for example.

> The library is a working baseline assembled from public regulatory frameworks.
> Each record carries a `verified` flag so your local advisers can sign off
> country by country inside the application. Treat it as a starting position to
> confirm, not as filed advice.

### Due-date engine

Download a country's due-date template — it arrives pre-filled with the dates
currently on record. Change what you need and upload it. The platform then, in a
single transaction:

detects which dates actually changed · updates the register · recalculates delay
and penalty exposure · moves items between Overdue and Evidence Pending ·
records the change with the previous date, reason and who made it ·
raises a **country-specific popup** for every affected user · refreshes
dashboards, tasks and reports

Unchanged rows are skipped, so nobody is notified twice for the same thing. Both
import routes support a dry run that previews exactly what would change before
anything is written.

---

## Architecture

Next.js 14 (App Router) · TypeScript in strict mode · PostgreSQL via `pg` ·
JWT sessions in an HttpOnly cookie · role-based access control

```
src/app/          pages and API routes
src/components/   AppShell, shared UI primitives
src/lib/          db, auth, rbac, score, validate, excel, dates, api
db/               schema.sql and the seed master data
scripts/          setup-db.ts, smoke.mjs
```

Evidence files are stored as `BYTEA` in Postgres rather than in object storage.
That is a deliberate choice: the platform needs exactly **one** credential to
run, and uploads cannot fail because a storage bucket was misconfigured. The
trade-off is a 4 MB limit per document, which suits filed returns and
acknowledgements. Larger bundles should be uploaded as a ZIP.

The database is normalised with foreign keys throughout, indexed on every
filter path, and uses soft deletes so nothing is ever truly lost. History is
kept in `compliance_history`, `due_date_changes`, `review_actions` and
`audit_log`.

---

## Verification

`npm run smoke` boots the application and exercises it over real HTTP —
real logins, real file uploads, real Excel imports, real role boundaries.

**It was validated at 188 checks passing** against the original demonstration
dataset (a specific company's full entity/user/library roster) with no
server-side errors. That roster has since been stripped out for this blank
template — `scripts/smoke.mjs` still references the original demo email
addresses and entity IDs in its role-boundary checks, so most of those checks
will 401/404 until you update the email/entity constants near the top of that
file to match whatever users and entities you actually seed (see the note in
the file itself). The structural checks that don't depend on seeded data —
landing page has no login form, protected routes redirect to `/signin`, forged
session cookies are rejected, duplicate/oversized/executable uploads are
refused — will still pass unmodified.

Once you've updated it, `npm run smoke` covers, among other things: role
boundaries (a CFO blocked from reviewing individual compliances, a preparer
seeing only their own entity); state-level library resolution for whichever
states/provinces you've registered entities in; creating, editing, archiving,
restoring and deleting a compliance; Excel import previews that commit
correctly and re-import as updates rather than duplicates; a due-date change
notifying the right country and retaining the original date; the full upload →
validate → query → resubmit → approve loop with an intact audit trail; and all
ten reports generating valid Excel workbooks.

`npx tsc --noEmit` and `npm run build` both complete with zero errors.
