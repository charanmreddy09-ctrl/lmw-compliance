import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MCA Compliance 360',
    short_name: 'Compliance 360',
    description:
      'Statutory compliance control tower: evidence-backed compliance scores for every entity, in every country.',
    start_url: '/',
    display: 'standalone',
    background_color: '#E3DED8',
    theme_color: '#025B6A',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
