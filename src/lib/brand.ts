/** The platform is shared across companies - what appears in the chrome
    after sign-in (logo, name) belongs to whichever company the signed-in
    user's email domain identifies, not to any one customer baked into the
    build. The landing page, by contrast, is pre-login and always shows the
    platform's own name (see src/app/page.tsx) - never a tenant's.

    dbEnvVar names which Postgres database holds that company's data (see
    lib/db.ts's runWithDbEnvVar) - each known tenant gets its own database,
    so one company's filings are never reachable from another's session even
    for a role with unrestricted entity scope ('*'). */
export type Brand = { name: string; logo: string | null; dbEnvVar: string };

/** Companies with a real logo on file and their own database. Anything not
    listed here still gets a sensible name derived from its domain (see
    brandFromEmail) - just without a logo image, and it falls back to the
    default database, so a new tenant's chrome is never blank while waiting
    on branding assets or a dedicated database. */
const KNOWN_BRANDS: Record<string, Brand> = {
  'lmw.example': { name: 'LMW', logo: 'https://www.lmwglobal.com/images/lmw-logo.png', dbEnvVar: 'DATABASE_URL' },
  'suprajit.example': { name: 'Suprajit', logo: '/suprajit-logo.png', dbEnvVar: 'DATABASE_URL_SUPRAJIT' },
};

const DEFAULT_DB_ENV_VAR = 'DATABASE_URL';

/** Derives the signed-in company's display name (and logo, where on file)
    from the domain of their email address - e.g. someone@lmw.example ->
    "LMW". A short domain label (acme, tcs, lmw) reads as an initialism and
    is upper-cased; a longer one is title-cased as an ordinary word. */
export function brandFromEmail(email: string | null | undefined): Brand {
  const domain = email?.split('@')[1]?.toLowerCase().trim();
  if (domain && KNOWN_BRANDS[domain]) return KNOWN_BRANDS[domain];

  const label = domain?.split('.')[0] ?? '';
  if (!label) return { name: 'Compliance 360', logo: null, dbEnvVar: DEFAULT_DB_ENV_VAR };
  const name = label.length <= 5 ? label.toUpperCase() : label[0].toUpperCase() + label.slice(1);
  return { name, logo: null, dbEnvVar: DEFAULT_DB_ENV_VAR };
}
