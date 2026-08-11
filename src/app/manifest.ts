import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LMW Compliance Management Platform',
    short_name: 'LMW Compliance',
    description:
      'LMW Limited group-wide statutory compliance control tower: evidence-backed compliance scores for every entity, in every country.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#26317a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
