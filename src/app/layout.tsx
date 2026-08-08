import type { Metadata, Viewport } from 'next';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/* Loaded through next/font rather than a <link> to Google Fonts.

   The previous setup pulled in Inter Tight and IBM Plex Mono over two
   preconnects and a render-blocking stylesheet, then never used either:
   globals.css asked for "Inter", which is a different family from "Inter
   Tight" and was not among the loaded fonts, so every screen fell through to
   the next name in the stack. On Windows that is Segoe UI - which is why the
   interface read as dated while the font it was downloading sat unused.

   next/font self-hosts the files at build time, so there is no third-party
   round trip before first paint and no flash of fallback text. */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  /* Inter's tabular figures are what keep the register's columns aligned;
     globals.css already asks for them via font-feature-settings: "tnum". */
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title: 'LMW Compliance Management Platform',
  description:
    'LMW Limited group-wide statutory compliance control tower: evidence-backed compliance scores for every entity, in every country.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
