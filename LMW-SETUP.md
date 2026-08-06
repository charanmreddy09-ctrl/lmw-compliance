# LMW Compliance Platform — what's been customised, and what's still open

This copy of the GCMP blank template has been adapted for **LMW Limited**
(Lakshmi Machine Works). Read this before going live.

## Done

- **Entities** (`db/org.ts`): LMW Limited (India, listed, Coimbatore) and LMW
  Global FZE (UAE subsidiary, Dubai), with divisions Textile Machinery /
  Machine Tool / Foundry / Advanced Technology Centre / Corporate.
- **Users** (`db/org.ts`): four placeholder accounts — `admin@lmw.example`,
  `preparer@lmw.example`, `reviewer@lmw.example`, `cfo@lmw.example` — all on
  password `LMW@2026`.
- **Compliance library** (`db/library.ts`, `db/jurisdictions.ts`): ~40 starting
  obligations across India (federal + Tamil Nadu) and UAE (federal + Dubai
  free zone) — corporate law, direct tax, GST/VAT, payroll, SEBI/LODR (LMW is
  listed), FEMA (for the overseas subsidiary), customs, environment. Every
  row is unverified by design (`verified = false` in the database) — a local
  adviser must confirm each one before it's relied on. This is a structural
  starting point, **not filed legal advice**, and it does not cover every
  compliance LMW may be subject to.
- **Branding**: logo hotlinked from `lmwglobal.com`, colour palette
  approximated as graphite + deep red (LMW's wordmark reads red-on-white),
  copy updated throughout (landing page, sign-in, app shell).
- **Date display**: all on-screen dates now render as `DD-MMM-YYYY`
  (e.g. `04-Aug-2026`).

## Still open — decide or confirm before real filings depend on this

1. **This Excel is not LMW's data.** The file you originally supplied
   (`Suprajit_Location_wise_stat_compliances_Report`) is a different company's
   register. It was used only as a *structural reference* for how to organise
   a location-wise compliance list — none of its rows were copied in. If you
   have LMW's actual location-wise due dates, import them from
   **Compliance Library -> Import** once the app is running.
2. **Brand colours/logo are an approximation**, not extracted from LMW's
   actual CSS (this environment couldn't reach the site's stylesheet).
   Replace `--navy-*` / `--red-*` in `src/app/globals.css` with the exact
   hex values once you have them, and swap the hotlinked logo URL for an
   uploaded asset in `public/` if you'd rather not depend on lmwglobal.com's
   uptime.
3. **Placeholder emails.** Rename `preparer@lmw.example`,
   `reviewer@lmw.example`, `cfo@lmw.example` and `admin@lmw.example` to the
   real people's addresses — either in `db/org.ts` before `db:setup`, or in
   **Administration -> Users** after go-live.
4. **Entity detail gaps**: employee counts, statutory auditor names, local
   adviser names, and the exact UAE free zone authority (JAFZA / DAFZA /
   RAKEZ / other) for LMW Global FZE are all marked "to be confirmed" —
   fill these in `db/org.ts` / `db/jurisdictions.ts`.
5. **Deployment**: this repo is ready to seed and deploy per `DEPLOY.md`
   (Supabase + Vercel). `AUTH_SECRET` has already been generated into
   `.env.local`; you still need to paste in a `DATABASE_URL` from your own
   Supabase (or other Postgres) project.
6. **Excel export styling**: the platform's own Excel exports/imports (built
   on the community `xlsx` library) don't currently carry custom fonts or
   fill colours — that library doesn't reliably write cell styling. If you
   want the app's generated workbooks in teal-green/Calibri, that needs a
   library swap (e.g. `exceljs`) — flagging it rather than silently skipping it.
