/** The platform is shared across companies - what appears in the chrome
    after sign-in (logo, name) belongs to whichever company the signed-in
    user's email domain identifies, not to any one customer baked into the
    build. The landing page, by contrast, is pre-login and always shows the
    platform's own name (see src/app/page.tsx) - never a tenant's. */
export type Brand = { name: string; logo: string | null };

/** Companies with a real logo on file. Anything not listed here still gets
    a sensible name derived from its domain (see brandFromEmail) - just
    without a logo image, so a new tenant's chrome is never blank while
    waiting on branding assets. */
const KNOWN_BRANDS: Record<string, Brand> = {
  'lmw.example': { name: 'LMW', logo: 'https://www.lmwglobal.com/images/lmw-logo.png' },
};

/** Derives the signed-in company's display name (and logo, where on file)
    from the domain of their email address - e.g. someone@lmw.example ->
    "LMW". A short domain label (acme, tcs, lmw) reads as an initialism and
    is upper-cased; a longer one is title-cased as an ordinary word. */
export function brandFromEmail(email: string | null | undefined): Brand {
  const domain = email?.split('@')[1]?.toLowerCase().trim();
  if (domain && KNOWN_BRANDS[domain]) return KNOWN_BRANDS[domain];

  const label = domain?.split('.')[0] ?? '';
  if (!label) return { name: 'Compliance 360', logo: null };
  const name = label.length <= 5 ? label.toUpperCase() : label[0].toUpperCase() + label.slice(1);
  return { name, logo: null };
}
