import type { Metadata, Viewport } from 'next';
import { Work_Sans, EB_Garamond, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/* Loaded through next/font rather than a <link> to Google Fonts, so there is
   no third-party round trip before first paint and no flash of fallback
   text. Work Sans (body/headings) and EB Garamond (italic accents and
   sub-headings) are the brand's own mandated typefaces - see
   MCA_Brand_Guidelines.pdf, "Typography" - replacing the generic Inter this
   app started with. */
const workSans = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-worksans',
  /* Tabular figures keep the register's columns aligned; globals.css asks
     for them via font-feature-settings: "tnum". */
});

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-garamond',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'MCA Compliance 360',
  description:
    'Statutory compliance control tower: evidence-backed compliance scores for every entity, in every country.',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: {
    /* The browser tab icon is the platform's own MCA mark, not any one
       tenant's logo - it never changes based on who's signed in, same as
       the landing page (see lib/brand.ts for the post-login, per-tenant
       chrome that does change). */
    icon: [{ url: '/mca-logo.png', type: 'image/png' }],
    apple: [{ url: '/mca-logo.png', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#025B6A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${workSans.variable} ${ebGaramond.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
